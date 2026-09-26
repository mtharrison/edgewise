//! Fallback for hardware without a native driver: an installed upstream
//! `sigrok-cli`, run as a separate process.
//!
//! Only an allow-list of logic-analyzer drivers is scanned, and it never
//! includes `fx2lafw`: libsigrok uploads firmware during a scan, which would
//! fight the native FX2 driver. Capture streams `-O binary` from stdout into
//! the sink; one byte on stdin stops `sigrok-cli` with its data flushed.

use super::{stall_message, DeviceInfo, Driver};
use serde::Serialize;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};

pub const DOWNLOAD_PAGE: &str = "https://sigrok.org/wiki/Downloads";
const MAX_CHANNELS: usize = 16;
const DEFAULT_RATE_CEILING: u64 = 24_000_000;

/// Logic-analyzer drivers scanned by default. No FX2 families, no `demo`.
const ALLOWED: &[&str] = &[
    "asix-sigma",
    "beaglelogic",
    "chronovu-la",
    "dreamsourcelab-dslogic",
    "hantek-4032l",
    "ikalogic-scanalogic2",
    "ikalogic-scanaplus",
    "kingst-la2016",
    "lecroy-logicstudio",
    "ols",
    "p-ols",
    "saleae-logic16",
    "saleae-logic-pro",
    "sysclk-lwla",
    "zeroplus-logic-cube",
];
/// Natively driven; never handed to `sigrok-cli`, even through the variable.
const NATIVE: &[&str] = &["fx2lafw"];

#[derive(Clone, Copy, Debug)]
pub struct Timeouts {
    /// `-V` and `-L` while locating.
    pub probe: Duration,
    /// Scan of one driver, including `--show` for what it found.
    pub scan: Duration,
    /// Capture start until the first data.
    pub no_data: Duration,
    /// Silence after data has started.
    pub stall: Duration,
    /// Wait for `sigrok-cli` to exit after asking it to stop.
    pub stop: Duration,
}

pub const TIMEOUTS: Timeouts = Timeouts {
    probe: Duration::from_secs(5),
    scan: Duration::from_secs(10),
    no_data: Duration::from_secs(10),
    stall: Duration::from_secs(1),
    stop: Duration::from_secs(1),
};

/// A working `sigrok-cli`.
#[derive(Clone, Debug)]
pub struct Cli {
    pub path: PathBuf,
    pub version: String,
    pub drivers: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    /// Where to get `sigrok-cli`, when none was found.
    pub download: Option<String>,
}

impl Status {
    pub fn of(cli: Option<&Cli>) -> Status {
        match cli {
            Some(c) => Status {
                found: true,
                path: Some(c.path.display().to_string()),
                version: Some(c.version.clone()),
                download: None,
            },
            None => Status { found: false, path: None, version: None, download: Some(DOWNLOAD_PAGE.into()) },
        }
    }
}

/// A device from the last scan, with what capture needs.
#[derive(Clone, Debug)]
pub struct SigrokDevice {
    pub info: DeviceInfo,
    pub cli: PathBuf,
    /// `-d` argument, e.g. `dreamsourcelab-dslogic:conn=1.7`.
    pub spec: String,
    /// Logic channels to capture (at most 16).
    pub channels: Vec<String>,
    /// Bytes per sample in `-O binary` output, from the device's logic channel count.
    pub unit: usize,
}

// ---- parsers ----

/// `sigrok-cli -V`: version from the first `sigrok-cli <v>` line.
pub fn parse_version(out: &str) -> Option<String> {
    out.lines()
        .find_map(|l| l.trim().strip_prefix("sigrok-cli "))
        .and_then(|v| v.split_whitespace().next())
        .map(String::from)
}

/// `sigrok-cli -L`: names in the "Supported hardware drivers" block.
pub fn parse_drivers(out: &str) -> Vec<String> {
    let mut lines = out.lines().skip_while(|l| !l.trim_start().starts_with("Supported hardware drivers"));
    lines.next();
    lines
        .take_while(|l| !l.trim().is_empty())
        .filter_map(|l| l.split_whitespace().next())
        .map(String::from)
        .collect()
}

#[derive(Clone, Debug, PartialEq)]
pub struct ScanLine {
    /// `-d` argument as printed, e.g. `ols:conn=/dev/ttyACM0`.
    pub spec: String,
    pub driver: String,
    pub conn: Option<String>,
    pub description: String,
    /// All channel names, logic and analog.
    pub channels: Vec<String>,
}

/// One device line: `<driver>[:conn=<c>] - <description> with <n> channels: D0 D1 …`.
pub fn parse_scan_line(line: &str) -> Option<ScanLine> {
    let line = line.trim();
    let (spec, rest) = line.split_once(" - ")?;
    if spec.contains(char::is_whitespace) {
        return None;
    }
    let (description, chans) = match rest.rfind(" with ") {
        Some(i) if rest[i..].contains("channel") => {
            let tail = &rest[i + 6..];
            let names = tail.split_once(':').map_or("", |(_, n)| n);
            (&rest[..i], names.split_whitespace().map(String::from).collect())
        }
        _ => (rest, Vec::new()),
    };
    let mut parts = spec.split(':');
    let driver = parts.next()?.to_string();
    let conn = parts.find_map(|p| p.strip_prefix("conn=")).map(String::from);
    Some(ScanLine { spec: spec.into(), driver, conn, description: description.trim().into(), channels: chans })
}

/// `sigrok-cli -d <driver> --scan`: every device line, ignoring headers.
pub fn parse_scan(out: &str) -> Vec<ScanLine> {
    out.lines().filter_map(parse_scan_line).collect()
}

#[derive(Clone, Debug, PartialEq)]
pub enum Rates {
    List(Vec<u64>),
    Range { min: u64, max: u64 },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Show {
    pub logic: Vec<String>,
    pub rates: Option<Rates>,
}

/// `20 kHz`, `1 GHz (current)`, `1.5 MHz` → Hz.
pub fn parse_rate(s: &str) -> Option<u64> {
    let s = s.replace("(current)", "");
    let s = s.trim().trim_end_matches([',', ')']).trim();
    let i = s.find(|c: char| !(c.is_ascii_digit() || c == '.'))?;
    let n: f64 = s[..i].parse().ok()?;
    let mult = match s[i..].trim() {
        "Hz" => 1.0,
        "kHz" => 1e3,
        "MHz" => 1e6,
        "GHz" => 1e9,
        _ => return None,
    };
    Some((n * mult).round() as u64)
}

fn indent(l: &str) -> usize {
    l.len() - l.trim_start().len()
}

/// `samplerate` in `--show`: `(min - max in steps of s)`, a comma-separated
/// list, or `- supported samplerates:` followed by one rate per line.
fn parse_samplerate(lines: &[&str], at: usize) -> Option<Rates> {
    let line = lines[at];
    let rest = line.trim_start().strip_prefix("samplerate")?;
    if let Some(inner) = rest.trim().strip_prefix('(') {
        let inner = inner.split(" in steps").next()?.trim_end_matches(')');
        let (a, b) = inner.split_once(" - ")?;
        return Some(Rates::Range { min: parse_rate(a)?, max: parse_rate(b)? });
    }
    let inline = rest.trim_start_matches([' ', ':', '-']).trim();
    let mut rates: Vec<u64> = if inline.contains("supported samplerates") || inline.is_empty() {
        lines[at + 1..]
            .iter()
            .take_while(|l| indent(l) > indent(line) && !l.trim().is_empty())
            .flat_map(|l| l.split(','))
            .filter_map(parse_rate)
            .collect()
    } else {
        inline.split(',').filter_map(parse_rate).collect()
    };
    rates.sort_unstable();
    rates.dedup();
    (!rates.is_empty()).then_some(Rates::List(rates))
}

/// Names in a `Channels:` block, skipping analog entries.
fn channels_block(lines: &[&str]) -> Option<Vec<String>> {
    let at = lines.iter().position(|l| l.trim() == "Channels:")?;
    let names = lines[at + 1..]
        .iter()
        .take_while(|l| indent(l) > indent(lines[at]) && !l.trim().is_empty())
        .filter(|l| !l.to_ascii_lowercase().contains("analog"))
        .filter_map(|l| l.trim().split([':', ' ']).next())
        .filter(|n| !n.is_empty())
        .map(String::from)
        .collect();
    Some(names)
}

/// Channel groups: `    Logic: channels D0 D1 …` and `    Analog: channels A0 …`.
fn channel_groups(lines: &[&str]) -> Vec<(String, Vec<String>)> {
    let Some(at) = lines.iter().position(|l| l.trim() == "Channel groups:") else { return vec![] };
    lines[at + 1..]
        .iter()
        .take_while(|l| indent(l) > indent(lines[at]) && !l.trim().is_empty())
        .filter_map(|l| {
            let (name, chans) = l.trim().split_once(':')?;
            let chans = chans.trim().strip_prefix("channels").or_else(|| chans.trim().strip_prefix("channel"))?;
            Some((name.to_string(), chans.split_whitespace().map(String::from).collect()))
        })
        .collect()
}

/// `sigrok-cli -d <spec> --show`: logic channel names and sample rates.
pub fn parse_show(out: &str) -> Show {
    let lines: Vec<&str> = out.lines().collect();
    let rates = lines.iter().position(|l| l.trim_start().starts_with("samplerate")).and_then(|i| parse_samplerate(&lines, i));
    let groups = channel_groups(&lines);
    let group = |word: &str| groups.iter().find(|(n, _)| n.to_ascii_lowercase().contains(word)).map(|(_, c)| c.clone());
    let logic = channels_block(&lines).or_else(|| group("logic")).unwrap_or_else(|| {
        // No block says which channels are logic: all but the analog group.
        let analog = group("analog").unwrap_or_default();
        let all = lines.iter().find_map(|l| parse_scan_line(l)).map(|s| s.channels).unwrap_or_default();
        all.into_iter().filter(|c| !analog.contains(c)).collect()
    });
    Show { logic, rates }
}

/// The 1-2-5 series within [min, max], plus max.
pub fn range_rates(min: u64, max: u64) -> Vec<u64> {
    let mut v = Vec::new();
    let mut decade = 1u64;
    while decade <= max {
        for m in [1, 2, 5] {
            let r = decade * m;
            if (min..=max).contains(&r) {
                v.push(r);
            }
        }
        decade = match decade.checked_mul(10) {
            Some(d) => d,
            None => break,
        };
    }
    if v.last() != Some(&max) {
        v.push(max);
    }
    v
}

/// Highest rate ≤ 24 MHz, else the lowest.
pub fn default_rate(rates: &[u64]) -> u64 {
    rates.iter().copied().filter(|&r| r <= DEFAULT_RATE_CEILING).max().or(rates.iter().copied().min()).unwrap_or(0)
}

/// Logic channels to capture, and whether any were left out.
pub fn capped(logic: &[String]) -> (Vec<String>, bool) {
    (logic.iter().take(MAX_CHANNELS).cloned().collect(), logic.len() > MAX_CHANNELS)
}

pub fn device_id(driver: &str, conn: Option<&str>) -> String {
    match conn {
        Some(c) => format!("sigrok:{driver}:{c}"),
        None => format!("sigrok:{driver}"),
    }
}

/// Builds the device entry from its scan line and `--show` output.
pub fn device(cli: &Cli, line: &ScanLine, show: &Show) -> Option<SigrokDevice> {
    let logic = if show.logic.is_empty() { &line.channels } else { &show.logic };
    if logic.is_empty() {
        return None;
    }
    let (channels, cut) = capped(logic);
    let samplerates = match &show.rates {
        Some(Rates::List(v)) => v.clone(),
        Some(Rates::Range { min, max }) => range_rates(*min, *max),
        None => vec![],
    };
    if samplerates.is_empty() {
        return None;
    }
    let mut note = format!("via sigrok-cli {}", cli.version);
    if cut {
        note.push_str(&format!(" · only the first {MAX_CHANNELS} channels are captured"));
    }
    Some(SigrokDevice {
        info: DeviceInfo {
            id: device_id(&line.driver, line.conn.as_deref()),
            name: line.description.clone(),
            driver: "sigrok".into(),
            channels: channels.len(),
            default_samplerate: default_rate(&samplerates),
            samplerates,
            note: Some(note),
            missing_firmware: None,
        },
        cli: cli.path.clone(),
        spec: line.spec.clone(),
        unit: logic.len().div_ceil(8).max(1),
        channels,
    })
}

// ---- running sigrok-cli ----

fn command(path: &Path) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c
}

/// Runs `path args`, returning stdout if it exits 0 within `timeout`.
/// Otherwise the process is killed and the result is None.
pub fn run(path: &Path, args: &[&str], timeout: Duration) -> Option<String> {
    let mut child =
        command(path).args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().ok()?;
    let mut out = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut s = String::new();
        let _ = out.read_to_string(&mut s);
        let _ = tx.send(s);
    });
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(st)) => {
                let left = deadline.saturating_duration_since(Instant::now());
                let out = rx.recv_timeout(left.max(Duration::from_millis(100))).ok()?;
                return st.success().then_some(out);
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(10)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

fn exe() -> &'static str {
    if cfg!(windows) {
        "sigrok-cli.exe"
    } else {
        "sigrok-cli"
    }
}

/// Where to look when no path was given: `PATH`, then the usual install folders.
pub fn candidates(path_env: Option<&std::ffi::OsStr>) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = path_env.map(|p| std::env::split_paths(p).map(|d| d.join(exe())).collect()).unwrap_or_default();
    v.push(PathBuf::from("/opt/homebrew/bin").join(exe()));
    v.push(PathBuf::from("/usr/local/bin").join(exe()));
    if cfg!(windows) {
        for var in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Some(pf) = std::env::var_os(var) {
                v.push(PathBuf::from(pf).join("sigrok").join("sigrok-cli").join(exe()));
            }
        }
    }
    v
}

/// Probes one candidate: `-V` must succeed within the timeout.
pub fn probe(path: &Path, t: &Timeouts) -> Option<Cli> {
    if !path.is_file() {
        return None;
    }
    let version = parse_version(&run(path, &["-V"], t.probe)?)?;
    let drivers = run(path, &["-L"], t.probe).map(|o| parse_drivers(&o)).unwrap_or_default();
    Some(Cli { path: path.to_path_buf(), version, drivers })
}

/// The given path only, if any; otherwise the first working candidate.
pub fn locate(given: Option<&Path>, candidates: &[PathBuf], t: &Timeouts) -> Option<Cli> {
    match given {
        Some(p) => probe(p, t),
        None => candidates.iter().find_map(|p| probe(p, t)),
    }
}

/// Default allow-list plus `extra` (comma-separated), limited to what `sigrok-cli` reports.
pub fn allowed_drivers(reported: &[String], extra: Option<&str>) -> Vec<String> {
    let extra = extra.unwrap_or("").split(',').map(str::trim).filter(|s| !s.is_empty());
    let mut v: Vec<String> = Vec::new();
    for d in ALLOWED.iter().copied().chain(extra) {
        if !NATIVE.contains(&d) && reported.iter().any(|r| r == d) && !v.iter().any(|x| x == d) {
            v.push(d.to_string());
        }
    }
    v
}

/// Scans every driver in parallel. A driver that takes longer than
/// `t.scan` (scan and `--show` together) contributes nothing.
pub fn scan(cli: &Cli, drivers: &[String], t: &Timeouts) -> Vec<SigrokDevice> {
    let threads: Vec<_> = drivers
        .iter()
        .map(|d| {
            let (cli, d, t) = (cli.clone(), d.clone(), *t);
            std::thread::spawn(move || scan_driver(&cli, &d, &t))
        })
        .collect();
    threads.into_iter().flat_map(|h| h.join().unwrap_or_default()).collect()
}

fn scan_driver(cli: &Cli, driver: &str, t: &Timeouts) -> Vec<SigrokDevice> {
    let deadline = Instant::now() + t.scan;
    let left = || deadline.saturating_duration_since(Instant::now());
    let Some(out) = run(&cli.path, &["-d", driver, "--scan"], t.scan) else { return vec![] };
    let mut found = Vec::new();
    for line in parse_scan(&out).into_iter().filter(|l| l.driver == driver) {
        if left().is_zero() {
            return vec![];
        }
        let Some(show) = run(&cli.path, &["-d", &line.spec, "--show"], left()) else { return vec![] };
        found.extend(device(cli, &line, &parse_show(&show)));
    }
    found
}

// ---- capture ----

pub struct Sigrok {
    dev: SigrokDevice,
    timeouts: Timeouts,
}

impl Sigrok {
    pub fn new(dev: SigrokDevice) -> Sigrok {
        Sigrok { dev, timeouts: TIMEOUTS }
    }
}

enum Msg {
    Data(Vec<u8>),
    Eof,
    Log(String),
    LogEof,
}

/// Whole-sample chunks for the sink: sigrok writes `unit` bytes per sample;
/// the engine takes the first `keep` of them.
struct Repack {
    unit: usize,
    keep: usize,
    carry: Vec<u8>,
}

impl Repack {
    fn push(&mut self, data: &[u8]) -> Vec<u8> {
        self.carry.extend_from_slice(data);
        let whole = self.carry.len() / self.unit * self.unit;
        let rest = self.carry.split_off(whole);
        let chunk = std::mem::replace(&mut self.carry, rest);
        if self.keep == self.unit {
            chunk
        } else {
            chunk.chunks_exact(self.unit).flat_map(|s| s[..self.keep].iter().copied()).collect()
        }
    }
}

fn disconnected(line: &str) -> bool {
    let l = line.to_ascii_lowercase();
    (l.contains("usb") || l.contains("device"))
        && ["error", "fail", "disconnect", "lost", "no such"].iter().any(|w| l.contains(w))
}

impl Driver for Sigrok {
    fn channels(&self) -> usize {
        self.dev.channels.len()
    }

    fn acquire(
        &mut self,
        samplerate: u64,
        sink: &mut dyn FnMut(&[u8]) -> bool,
        stop: &AtomicBool,
        progress: &dyn Fn(&str),
    ) -> Result<(), String> {
        let t = self.timeouts;
        let mut child = command(&self.dev.cli)
            .args(["-d", &self.dev.spec, "-C", &self.dev.channels.join(","), "-c"])
            .arg(format!("samplerate={samplerate}"))
            .args(["--continuous", "-O", "binary", "-l", "4"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Starting sigrok-cli: {e}"))?;
        let (tx, rx) = mpsc::channel();
        let mut out = child.stdout.take().ok_or("sigrok-cli has no stdout")?;
        let err = child.stderr.take().ok_or("sigrok-cli has no stderr")?;
        let tx2 = tx.clone();
        // Never waits on the consumer, so the 64 KB pipe cannot back up.
        std::thread::spawn(move || loop {
            let mut buf = vec![0u8; 65536];
            match out.read(&mut buf) {
                Ok(0) | Err(_) => break tx.send(Msg::Eof).unwrap_or(()),
                Ok(n) => {
                    buf.truncate(n);
                    if tx.send(Msg::Data(buf)).is_err() {
                        break;
                    }
                }
            }
        });
        std::thread::spawn(move || {
            use std::io::BufRead;
            for line in std::io::BufReader::new(err).lines().map_while(Result::ok) {
                let _ = tx2.send(Msg::Log(line));
            }
            let _ = tx2.send(Msg::LogEof);
        });

        let unit = self.dev.unit;
        let keep = if self.dev.channels.len() > 8 { 2 } else { 1 };
        let mut repack = Repack { unit, keep, carry: Vec::new() };
        let mut feed = |d: &[u8]| {
            let chunk = repack.push(d);
            chunk.is_empty() || sink(&chunk)
        };
        let started = Instant::now();
        let mut last_data: Option<Instant> = None;
        let mut received = 0u64;
        let mut last_log = String::new();
        let mut stdout_open = true;
        let mut stderr_open = true;
        let mut feeding = true;
        let result: Result<(), String> = loop {
            if stop.load(Ordering::Relaxed) {
                break Ok(());
            }
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(Msg::Data(d)) => {
                    if last_data.is_none() {
                        progress("");
                    }
                    last_data = Some(Instant::now());
                    received += d.len() as u64;
                    if !feed(&d) {
                        feeding = false;
                        break Ok(());
                    }
                }
                Ok(Msg::Log(l)) => {
                    if !l.trim().is_empty() {
                        if last_data.is_none() {
                            progress(l.trim());
                        }
                        last_log = l.trim().to_string();
                    }
                }
                Ok(Msg::LogEof) => stderr_open = false,
                Ok(Msg::Eof) => stdout_open = false,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    stdout_open = false;
                    stderr_open = false;
                }
            }
            if !stdout_open {
                // sigrok-cli is exiting: collect its last log lines first.
                let deadline = Instant::now() + t.stop;
                while stderr_open && Instant::now() < deadline {
                    match rx.recv_timeout(Duration::from_millis(50)) {
                        Ok(Msg::Log(l)) if !l.trim().is_empty() => last_log = l.trim().to_string(),
                        Ok(Msg::LogEof) | Err(mpsc::RecvTimeoutError::Disconnected) => stderr_open = false,
                        _ => {}
                    }
                }
                let why = if last_log.is_empty() { "sigrok-cli exited".to_string() } else { last_log.clone() };
                break Err(if received > 0 && disconnected(&why) { "Device disconnected".into() } else { why });
            }
            match last_data {
                Some(at) if at.elapsed() > t.stall => {
                    break Err(stall_message(received / unit as u64, ""));
                }
                None if started.elapsed() > t.no_data => {
                    // Exited without data: report its last log line, not a timeout.
                    if matches!(child.try_wait(), Ok(Some(_))) {
                        stdout_open = false;
                        continue;
                    }
                    break Err("sigrok-cli sent no data".into());
                }
                _ => {}
            }
        };
        finish(&mut child, &rx, t.stop, if feeding { Some(&mut feed) } else { None });
        result
    }
}

/// Asks `sigrok-cli` to stop, drains what it flushes into `feed`, and kills
/// it if it has not exited within `wait`.
fn finish(child: &mut Child, rx: &mpsc::Receiver<Msg>, wait: Duration, mut feed: Option<&mut dyn FnMut(&[u8]) -> bool>) {
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(b"\n");
    }
    let deadline = Instant::now() + wait;
    let mut stdout_open = true;
    while stdout_open && Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(20)) {
            Ok(Msg::Data(d)) => {
                if let Some(f) = feed.as_mut() {
                    if !f(&d) {
                        feed = None;
                    }
                }
            }
            Ok(Msg::Eof) | Err(mpsc::RecvTimeoutError::Disconnected) => stdout_open = false,
            _ => {}
        }
    }
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn fixture(name: &str) -> String {
        let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/sigrok").join(name);
        std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
    }

    fn cli() -> Cli {
        Cli { path: "sigrok-cli".into(), version: "0.7.2".into(), drivers: vec![] }
    }

    fn strings(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parses_version_and_drivers() {
        assert_eq!(parse_version(&fixture("0.7.2/version.txt")).as_deref(), Some("0.7.2"));
        let drivers = parse_drivers(&fixture("0.7.2/drivers.txt"));
        for d in ["demo", "fx2lafw", "dreamsourcelab-dslogic", "ols"] {
            assert!(drivers.iter().any(|x| x == d), "{d} in {drivers:?}");
        }
        assert!(!drivers.iter().any(|x| x == "kingst-la2016"), "0.5.2 has no kingst-la2016");
        assert!(!drivers.iter().any(|x| x == "Supported" || x.contains("input")));
    }

    #[test]
    fn parses_scan_lines() {
        let demo = parse_scan(&fixture("0.7.2/scan-demo.txt"));
        assert_eq!(demo.len(), 1);
        assert_eq!(demo[0].spec, "demo");
        assert_eq!(demo[0].conn, None);
        assert_eq!(demo[0].description, "Demo device");
        assert_eq!(demo[0].channels.len(), 13);

        let ds = parse_scan(&fixture("0.7.2/scan-dslogic.txt"));
        assert_eq!(ds.len(), 1);
        assert_eq!(ds[0].driver, "dreamsourcelab-dslogic");
        assert_eq!(ds[0].conn.as_deref(), Some("1.7"));
        assert_eq!(ds[0].spec, "dreamsourcelab-dslogic:conn=1.7");
        assert_eq!(ds[0].description, "DreamSourceLab DSLogic Plus");
        assert_eq!(ds[0].channels.len(), 16);
    }

    #[test]
    fn drops_analog_channels() {
        let show = parse_show(&fixture("0.7.2/show-demo.txt"));
        assert_eq!(show.logic, strings(&["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"]));
        assert_eq!(show.rates, Some(Rates::Range { min: 1, max: 1_000_000_000 }));
        let line = &parse_scan(&fixture("0.7.2/scan-demo.txt"))[0];
        let dev = device(&cli(), line, &show).unwrap();
        assert_eq!(dev.info.channels, 8);
        assert_eq!(dev.info.id, "sigrok:demo");
        assert_eq!(dev.unit, 1);
    }

    #[test]
    fn parses_rate_lists() {
        let show = parse_show(&fixture("0.7.2/show-dslogic.txt"));
        assert_eq!(show.logic.len(), 16);
        let Some(Rates::List(rates)) = &show.rates else { panic!("{:?}", show.rates) };
        assert_eq!(rates.first(), Some(&10_000));
        assert_eq!(rates.last(), Some(&400_000_000));
        let line = &parse_scan(&fixture("0.7.2/scan-dslogic.txt"))[0];
        let dev = device(&cli(), line, &show).unwrap();
        assert_eq!(dev.info.id, "sigrok:dreamsourcelab-dslogic:1.7");
        assert_eq!(dev.info.driver, "sigrok");
        assert_eq!(dev.info.channels, 16);
        assert_eq!(dev.info.note.as_deref(), Some("via sigrok-cli 0.7.2"));
        assert_eq!(dev.info.default_samplerate, 20_000_000);
        assert_eq!(dev.unit, 2);
        // The same output gives the same id on every scan.
        assert_eq!(device(&cli(), line, &show).unwrap().info.id, dev.info.id);
    }

    #[test]
    fn parses_inline_rate_list_and_channels_block() {
        let out = "Channels:\n    D0: logic\n    D1: logic\n    A0: ANALOG\n\
                   Supported configuration options:\n    samplerate: 20 kHz, 1 MHz, 24 MHz (current)\n";
        let show = parse_show(out);
        assert_eq!(show.logic, strings(&["D0", "D1"]));
        assert_eq!(show.rates, Some(Rates::List(vec![20_000, 1_000_000, 24_000_000])));
    }

    #[test]
    fn rate_range_offers_1_2_5_series() {
        let v = range_rates(1_000, 50_000_000);
        assert_eq!(v[..4], [1_000, 2_000, 5_000, 10_000]);
        assert_eq!(v[v.len() - 3..], [10_000_000, 20_000_000, 50_000_000]);
        assert_eq!(default_rate(&v), 20_000_000);
        assert_eq!(range_rates(1_000, 30_000).last(), Some(&30_000));
    }

    #[test]
    fn default_rate_falls_back_to_lowest() {
        assert_eq!(default_rate(&[50_000_000, 100_000_000, 200_000_000]), 50_000_000);
        assert_eq!(default_rate(&[1_000_000, 24_000_000, 48_000_000]), 24_000_000);
    }

    #[test]
    fn caps_at_16_channels_with_a_note() {
        let names: Vec<String> = (0..32).map(|i| i.to_string()).collect();
        let (kept, cut) = capped(&names);
        assert_eq!(kept.len(), 16);
        assert!(cut);
        let line = ScanLine {
            spec: "zeroplus-logic-cube".into(),
            driver: "zeroplus-logic-cube".into(),
            conn: None,
            description: "Zeroplus LAP-C(32128)".into(),
            channels: names.clone(),
        };
        let show = Show { logic: names, rates: Some(Rates::List(vec![100_000_000])) };
        let dev = device(&cli(), &line, &show).unwrap();
        assert_eq!(dev.info.channels, 16);
        assert_eq!(dev.channels, (0..16).map(|i| i.to_string()).collect::<Vec<_>>());
        assert_eq!(dev.unit, 4);
        assert_eq!(dev.info.note.as_deref(), Some("via sigrok-cli 0.7.2 · only the first 16 channels are captured"));
    }

    #[test]
    fn repack_keeps_whole_samples_and_low_bytes() {
        let mut r = Repack { unit: 4, keep: 2, carry: vec![] };
        assert_eq!(r.push(&[1, 2, 3]), Vec::<u8>::new());
        assert_eq!(r.push(&[4, 5, 6, 7, 8, 9]), vec![1, 2, 5, 6]);
        let mut r = Repack { unit: 2, keep: 2, carry: vec![] };
        assert_eq!(r.push(&[1, 2, 3]), vec![1, 2]);
        assert_eq!(r.push(&[4]), vec![3, 4]);
    }

    #[test]
    fn allow_list_never_includes_fx2lafw_or_demo_by_default() {
        let reported = strings(&["demo", "fx2lafw", "ols", "dreamsourcelab-dslogic", "agilent-dmm"]);
        assert_eq!(allowed_drivers(&reported, None), strings(&["dreamsourcelab-dslogic", "ols"]));
        assert_eq!(allowed_drivers(&reported, Some("demo, fx2lafw")), strings(&["dreamsourcelab-dslogic", "ols", "demo"]));
        assert_eq!(allowed_drivers(&reported, Some("fx2lafw")), strings(&["dreamsourcelab-dslogic", "ols"]));
        // Not reported by this sigrok-cli: skipped.
        assert_eq!(allowed_drivers(&strings(&["ols"]), Some("demo")), strings(&["ols"]));
    }

    #[test]
    fn status_reports_download_page_when_not_found() {
        let s = Status::of(None);
        assert!(!s.found);
        assert_eq!(s.download.as_deref(), Some(DOWNLOAD_PAGE));
        let s = Status::of(Some(&cli()));
        assert_eq!(s.version.as_deref(), Some("0.7.2"));
        assert_eq!(s.download, None);
    }

    #[test]
    fn candidates_follow_path_order() {
        let path = std::env::join_paths(["/a", "/b"]).unwrap();
        let c = candidates(Some(&path));
        assert_eq!(c[0], Path::new("/a").join(exe()));
        assert_eq!(c[1], Path::new("/b").join(exe()));
        assert_eq!(c[2], Path::new("/opt/homebrew/bin").join(exe()));
        assert_eq!(c[3], Path::new("/usr/local/bin").join(exe()));
    }

    #[cfg(unix)]
    pub(crate) mod stub {
        use std::os::unix::fs::PermissionsExt;
        use std::path::PathBuf;

        /// Writes an executable shell script into a fresh temp folder.
        pub fn script(name: &str, body: &str) -> PathBuf {
            let dir = std::env::temp_dir().join(format!(
                "edgewise-sigrok-{}-{name}-{:?}",
                std::process::id(),
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
            ));
            std::fs::create_dir_all(&dir).unwrap();
            let path = dir.join("sigrok-cli");
            std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
            path
        }
    }

    #[cfg(unix)]
    mod processes {
        use super::stub::script;
        use super::*;
        use std::sync::atomic::AtomicBool;

        const VERSION: &str = "echo 'sigrok-cli 0.7.2'";

        fn short() -> Timeouts {
            Timeouts {
                probe: Duration::from_secs(2),
                scan: Duration::from_millis(1500),
                no_data: Duration::from_millis(2000),
                stall: Duration::from_millis(300),
                stop: Duration::from_secs(1),
            }
        }

        #[test]
        fn locate_prefers_given_path_and_rejects_broken_ones() {
            let good = script("good", &format!("{VERSION}; echo; echo 'Supported hardware drivers:'; echo '  ols   OLS'"));
            let other = script("other", "echo 'sigrok-cli 9.9.9'");
            let broken = script("broken", "exit 1");
            let t = short();
            let found = locate(Some(&good), &[other.clone()], &t).unwrap();
            assert_eq!(found.path, good);
            assert_eq!(found.version, "0.7.2");
            assert_eq!(found.drivers, ["ols"]);
            assert!(locate(Some(&broken), &[other.clone()], &t).is_none());
            assert!(locate(Some(Path::new("/nonexistent/sigrok-cli")), &[other.clone()], &t).is_none());
            let plain = broken.with_file_name("plain");
            std::fs::write(&plain, "not a program").unwrap();
            assert!(locate(Some(&plain), &[], &t).is_none());
            // No given path: the first working candidate, in order.
            let found = locate(None, &[PathBuf::from("/nonexistent/sigrok-cli"), broken, other.clone(), good], &t).unwrap();
            assert_eq!(found.path, other);
        }

        #[test]
        fn slow_driver_contributes_nothing() {
            let bin = script(
                "scan",
                r#"case "$*" in
  "-d fast --scan") echo "fast:conn=1.2 - Fast Thing with 2 channels: D0 D1" ;;
  "-d slow --scan") exec sleep 30 ;;
  *--show*) echo "Channel groups:"; echo "    Logic: channels D0 D1"; echo "    samplerate - supported samplerates:"; echo "      1 MHz"; echo "      2 MHz" ;;
esac"#,
            );
            let cli = Cli { path: bin, version: "0.7.2".into(), drivers: vec![] };
            let t0 = Instant::now();
            let found = scan(&cli, &strings(&["slow", "fast"]), &short());
            assert!(t0.elapsed() < Duration::from_secs(3), "{:?}", t0.elapsed());
            assert_eq!(found.len(), 1);
            assert_eq!(found[0].info.id, "sigrok:fast:1.2");
            assert_eq!(found[0].info.samplerates, [1_000_000, 2_000_000]);
            assert_eq!(found[0].spec, "fast:conn=1.2");
        }

        fn dev(bin: PathBuf) -> Sigrok {
            let cli = Cli { path: bin, version: "0.7.2".into(), drivers: vec![] };
            let line = parse_scan_line("stub - Stub with 8 channels: D0 D1 D2 D3 D4 D5 D6 D7").unwrap();
            let show = Show { logic: line.channels.clone(), rates: Some(Rates::List(vec![1_000_000])) };
            Sigrok { dev: device(&cli, &line, &show).unwrap(), timeouts: short() }
        }

        fn run_capture(d: &mut Sigrok, stop_after: Option<Duration>) -> (Result<(), String>, u64, Duration) {
            let stop = AtomicBool::new(false);
            let mut got = 0u64;
            let t0 = Instant::now();
            let stop = &stop;
            let res = std::thread::scope(|s| {
                if let Some(after) = stop_after {
                    s.spawn(move || {
                        std::thread::sleep(after);
                        stop.store(true, Ordering::Relaxed);
                    });
                }
                d.acquire(1_000_000, &mut |b| {
                    got += b.len() as u64;
                    true
                }, &stop, &|_| {})
            });
            (res, got, t0.elapsed())
        }

        #[test]
        fn stop_is_quick_and_keeps_data() {
            let bin = script(
                "stream",
                "(while :; do echo UUUUUUUUUUUUUUU; sleep 0.01; done) & P=$!\nread x\nkill $P\necho FLUSHED\nexit 0",
            );
            let (res, got, took) = run_capture(&mut dev(bin), Some(Duration::from_millis(500)));
            assert_eq!(res, Ok(()));
            assert!(got > 0);
            assert!(took < Duration::from_millis(1500), "{took:?}");
        }

        #[test]
        fn exit_before_data_reports_last_log_line() {
            let bin = script("fail", "echo 'sr: starting' >&2\necho 'Failed to open device: LIBUSB_ERROR_ACCESS' >&2\nexit 1");
            let (res, got, _) = run_capture(&mut dev(bin), None);
            assert_eq!(res, Err("Failed to open device: LIBUSB_ERROR_ACCESS".into()));
            assert_eq!(got, 0);
        }

        #[test]
        fn silence_after_data_is_a_stall_and_keeps_samples() {
            let bin = script("stall", "printf 'abcd'\nexec sleep 30");
            let (res, got, took) = run_capture(&mut dev(bin), None);
            let msg = res.unwrap_err();
            assert!(msg.starts_with("Device stopped sending after 4 samples"), "{msg}");
            assert!(msg.contains("Captured data was kept"), "{msg}");
            assert_eq!(got, 4);
            assert!(took < Duration::from_secs(3), "{took:?}");
        }

        #[test]
        fn no_data_times_out() {
            let bin = script("silent", "exec sleep 30");
            let (res, _, took) = run_capture(&mut dev(bin), None);
            assert_eq!(res, Err("sigrok-cli sent no data".into()));
            assert!(took < Duration::from_secs(4), "{took:?}");
        }

        #[test]
        fn unplug_after_data_is_disconnected() {
            let bin = script("unplug", "printf 'abcd'\nsleep 0.1\necho 'LIBUSB_ERROR_NO_DEVICE: usb transfer failed' >&2\nexit 1");
            let (res, got, _) = run_capture(&mut dev(bin), None);
            assert_eq!(res, Err("Device disconnected".into()));
            assert_eq!(got, 4);
        }
    }
}
