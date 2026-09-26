//! Top-level state shared with the UI: current capture, acquisition thread,
//! and decoder instances. All methods are cheap except where noted; heavy
//! work runs on background threads.

use crate::capture::{Capture, Snapshot};
use crate::decoders::{self, Annotation, DecoderConfig};
use crate::devices::{self, sigrok};
use crate::trigger::{Feeder, TriggerTerm};
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    pub device_id: String,
    pub samplerate: u64,
    /// 0 = run until stopped.
    #[serde(default)]
    pub sample_limit: u64,
    #[serde(default)]
    pub trigger: Vec<TriggerTerm>,
    #[serde(default = "default_pre")]
    pub pretrigger: f64,
}

fn default_pre() -> f64 {
    0.1
}

#[derive(Clone, Debug, Serialize, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AcqState {
    #[default]
    Idle,
    Starting,
    Waiting,
    Running,
    Done,
    Error,
}

#[derive(Clone, Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub state: AcqState,
    pub message: String,
    pub samples: u64,
    pub samplerate: u64,
    pub channels: usize,
    pub trigger: Option<u64>,
    pub capture_id: u64,
    pub decoding: bool,
    pub decode_gen: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Measurement {
    pub high: bool,
    pub start: u64,
    pub end: u64,
    pub period: Option<u64>,
    pub high_time: Option<u64>,
}

struct Acquisition {
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}

struct Decoder {
    config: DecoderConfig,
    rows: Arc<RwLock<Vec<Vec<Annotation>>>>,
    cancel: Arc<AtomicBool>,
    busy: Arc<AtomicBool>,
}

pub struct Engine {
    fw_dirs: Mutex<Vec<PathBuf>>,
    sigrok_path: Mutex<Option<PathBuf>>,
    sigrok_cli: Mutex<Option<sigrok::Cli>>,
    /// Result of the last rescan, reused by every listing.
    sigrok_devices: Mutex<Vec<sigrok::SigrokDevice>>,
    capture: Mutex<Arc<Capture>>,
    capture_id: AtomicU64,
    acq: Mutex<Option<Acquisition>>,
    status: Arc<Mutex<Status>>,
    decoders: Mutex<HashMap<u32, Decoder>>,
    next_decoder: AtomicU64,
    decode_gen: Arc<AtomicU64>,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

impl Engine {
    pub fn new() -> Engine {
        Engine {
            fw_dirs: Mutex::new(Vec::new()),
            sigrok_path: Mutex::new(None),
            sigrok_cli: Mutex::new(None),
            sigrok_devices: Mutex::new(Vec::new()),
            capture: Mutex::new(Arc::new(Capture::new(1_000_000, 8))),
            capture_id: AtomicU64::new(0),
            acq: Mutex::new(None),
            status: Arc::new(Mutex::new(Status::default())),
            decoders: Mutex::new(HashMap::new()),
            next_decoder: AtomicU64::new(1),
            decode_gen: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn set_firmware_dirs(&self, dirs: Vec<PathBuf>) {
        *self.fw_dirs.lock() = dirs;
    }

    /// Path to use for `sigrok-cli` instead of searching for it.
    pub fn set_sigrok_path(&self, path: Option<PathBuf>) {
        *self.sigrok_path.lock() = path;
    }

    /// Cheap: never runs `sigrok-cli`; sigrok devices come from the last rescan.
    pub fn list_devices(&self) -> Vec<devices::DeviceInfo> {
        devices::list(&self.fw_dirs.lock(), &self.sigrok_devices.lock())
    }

    /// Slow (up to ~10 s): locates `sigrok-cli`, scans for its devices, then lists.
    pub fn rescan_devices(&self) -> Vec<devices::DeviceInfo> {
        self.rescan_with(std::env::var("EDGEWISE_SIGROK_DRIVERS").ok().as_deref(), &sigrok::TIMEOUTS);
        self.list_devices()
    }

    fn rescan_with(&self, extra: Option<&str>, t: &sigrok::Timeouts) {
        let given = self.sigrok_path.lock().clone();
        let candidates = sigrok::candidates(std::env::var_os("PATH").as_deref());
        // No engine lock is held while sigrok-cli runs.
        let cli = sigrok::locate(given.as_deref(), &candidates, t);
        let found = match &cli {
            Some(c) => sigrok::scan(c, &sigrok::allowed_drivers(&c.drivers, extra), t),
            None => vec![],
        };
        *self.sigrok_cli.lock() = cli;
        *self.sigrok_devices.lock() = found;
    }

    /// The `sigrok-cli` found by the last rescan, or where to download it.
    pub fn sigrok_status(&self) -> sigrok::Status {
        sigrok::Status::of(self.sigrok_cli.lock().as_ref())
    }

    pub fn snapshot(&self) -> Snapshot {
        self.capture.lock().snapshot()
    }

    fn replace_capture(&self, cap: Arc<Capture>) {
        *self.capture.lock() = cap;
        self.capture_id.fetch_add(1, Ordering::Relaxed);
    }

    pub fn start(&self, opts: StartOptions) -> Result<(), String> {
        self.stop();
        let fw = self.fw_dirs.lock().clone();
        let mut driver = devices::open(&opts.device_id, &fw, &self.sigrok_devices.lock())?;
        let channels = driver.channels();
        let cap = Arc::new(Capture::new(opts.samplerate, channels));
        self.replace_capture(cap.clone());
        {
            let mut st = self.status.lock();
            st.state = AcqState::Starting;
            st.message.clear();
        }
        let stop = Arc::new(AtomicBool::new(false));
        let status = self.status.clone();
        let stop2 = stop.clone();
        let thread = std::thread::Builder::new()
            .name("acquisition".into())
            .spawn(move || {
                let unit = if channels > 8 { 2 } else { 1 };
                let mut feeder = Feeder::new(cap, unit, opts.sample_limit, &opts.trigger, opts.pretrigger);
                let mut announced = false;
                let mut sink = |d: &[u8]| {
                    if !announced {
                        status.lock().state = if feeder.armed() { AcqState::Waiting } else { AcqState::Running };
                        announced = true;
                    }
                    let was_armed = feeder.armed();
                    let more = feeder.push(d);
                    if was_armed && !feeder.armed() {
                        status.lock().state = AcqState::Running;
                    }
                    more
                };
                let progress = |m: &str| status.lock().message = m.to_string();
                let res = driver.acquire(opts.samplerate, &mut sink, &stop2, &progress);
                let mut st = status.lock();
                match res {
                    Ok(()) => {
                        st.state = AcqState::Done;
                        st.message.clear();
                    }
                    Err(e) => {
                        st.state = AcqState::Error;
                        st.message = e;
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        *self.acq.lock() = Some(Acquisition { stop, thread });
        Ok(())
    }

    pub fn stop(&self) {
        if let Some(a) = self.acq.lock().take() {
            a.stop.store(true, Ordering::Relaxed);
            let _ = a.thread.join();
        }
    }

    pub fn status(&self) -> Status {
        let snap_meta;
        let len;
        {
            let cap = self.capture.lock();
            len = cap.len();
            snap_meta = cap.snapshot().meta;
        }
        let mut st = self.status.lock().clone();
        st.samples = len;
        st.samplerate = snap_meta.samplerate;
        st.channels = snap_meta.channels;
        st.trigger = snap_meta.trigger;
        st.capture_id = self.capture_id.load(Ordering::Relaxed);
        st.decoding = self.decoders.lock().values().any(|d| d.busy.load(Ordering::Relaxed));
        st.decode_gen = self.decode_gen.load(Ordering::Relaxed);
        st
    }

    pub fn measure(&self, channel: u8, sample: u64) -> Option<Measurement> {
        let s = self.snapshot();
        if sample >= s.len {
            return None;
        }
        let m = 1u16 << channel;
        let high = s.get(sample) & m != 0;
        let start = s.prev_change(m, sample).unwrap_or(0);
        let next = s.next_change(m, sample);
        let end = next.unwrap_or(s.len);
        let next2 = next.and_then(|n| s.next_change(m, n));
        let (period, high_time) = match (s.prev_change(m, sample).is_some(), next, next2) {
            (true, Some(n), Some(n2)) => {
                let p = n2 - start;
                let first = n - start;
                Some((p, if high { first } else { p - first })).unzip()
            }
            _ => (None, None),
        };
        Some(Measurement { high, start, end, period, high_time })
    }

    pub fn load(&self, path: &std::path::Path) -> Result<Vec<String>, String> {
        self.stop();
        let (cap, names) = crate::formats::load_sr(path)?;
        self.replace_capture(Arc::new(cap));
        let mut st = self.status.lock();
        st.state = AcqState::Done;
        st.message.clear();
        Ok(names)
    }

    // ---- decoders ----

    pub fn add_decoder(&self, config: DecoderConfig) -> u32 {
        let id = self.next_decoder.fetch_add(1, Ordering::Relaxed) as u32;
        let rows = config.rows().len();
        self.decoders.lock().insert(
            id,
            Decoder {
                config,
                rows: Arc::new(RwLock::new(vec![Vec::new(); rows])),
                cancel: Arc::new(AtomicBool::new(false)),
                busy: Arc::new(AtomicBool::new(false)),
            },
        );
        id
    }

    pub fn update_decoder(&self, id: u32, config: DecoderConfig) {
        if let Some(d) = self.decoders.lock().get_mut(&id) {
            d.config = config;
        }
    }

    pub fn remove_decoder(&self, id: u32) {
        if let Some(d) = self.decoders.lock().remove(&id) {
            d.cancel.store(true, Ordering::Relaxed);
        }
    }

    /// Re-run a decoder on the current capture in the background.
    pub fn decode(&self, id: u32) {
        let snap = self.snapshot();
        let mut decs = self.decoders.lock();
        let Some(d) = decs.get_mut(&id) else { return };
        d.cancel.store(true, Ordering::Relaxed);
        let cancel = Arc::new(AtomicBool::new(false));
        d.cancel = cancel.clone();
        d.busy.store(true, Ordering::Relaxed);
        let (config, rows, busy, gen) = (d.config.clone(), d.rows.clone(), d.busy.clone(), self.decode_gen.clone());
        std::thread::spawn(move || {
            let result = config.decode(&snap, &cancel);
            if !cancel.load(Ordering::Relaxed) {
                *rows.write() = result;
                busy.store(false, Ordering::Relaxed);
                gen.fetch_add(1, Ordering::Relaxed);
            }
        });
    }

    pub fn annotations(&self, id: u32, row: usize, start: u64, end: u64, min_w: f64, limit: usize) -> Vec<Annotation> {
        let rows = match self.decoders.lock().get(&id) {
            Some(d) => d.rows.clone(),
            None => return vec![],
        };
        let rows = rows.read();
        rows.get(row).map_or(vec![], |r| decoders::query(r, start, end, min_w, limit))
    }

    /// Page through all annotations of a row, for the data table.
    pub fn annotation_page(&self, id: u32, row: usize, offset: usize, limit: usize) -> (usize, Vec<Annotation>) {
        let rows = match self.decoders.lock().get(&id) {
            Some(d) => d.rows.clone(),
            None => return (0, vec![]),
        };
        let rows = rows.read();
        let Some(r) = rows.get(row) else { return (0, vec![]) };
        let end = (offset + limit).min(r.len());
        (r.len(), r[offset.min(end)..end].to_vec())
    }

    /// Index of the first annotation in `row` ending at or after `sample`.
    pub fn annotation_index(&self, id: u32, row: usize, sample: u64) -> usize {
        let rows = match self.decoders.lock().get(&id) {
            Some(d) => d.rows.clone(),
            None => return 0,
        };
        let rows = rows.read();
        rows.get(row).map_or(0, |r| r.partition_point(|a| a.end < sample))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn wait_done(e: &Engine, timeout: Duration) -> Status {
        let t0 = Instant::now();
        loop {
            let st = e.status();
            if matches!(st.state, AcqState::Done | AcqState::Error) || t0.elapsed() > timeout {
                return st;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn missing_sigrok_cli_leaves_the_list_unchanged() {
        let e = Engine::new();
        e.set_sigrok_path(Some("/nonexistent/sigrok-cli".into()));
        let before: Vec<String> = e.list_devices().into_iter().map(|d| d.id).collect();
        let after: Vec<String> = e.rescan_devices().into_iter().map(|d| d.id).collect();
        assert_eq!(before, after);
        assert_eq!(after.last().map(String::as_str), Some(devices::demo::ID));
        let st = e.sigrok_status();
        assert!(!st.found);
        assert_eq!(st.download.as_deref(), Some(sigrok::DOWNLOAD_PAGE));
    }

    #[cfg(unix)]
    #[test]
    fn listing_reuses_the_scan_without_running_sigrok_cli() {
        let log = std::env::temp_dir().join(format!("edgewise-sigrok-calls-{}", std::process::id()));
        let _ = std::fs::remove_file(&log);
        let bin = sigrok::tests::stub::script(
            "engine",
            &format!(
                r#"echo "$*" >> '{}'
case "$*" in
  -V) echo 'sigrok-cli 0.7.2' ;;
  -L) echo 'Supported hardware drivers:'; echo '  ols  OLS'; echo '  fx2lafw  FX2' ;;
  "-d ols --scan") echo "ols:conn=/dev/ttyACM0 - Openbench Logic Sniffer v1.01 with 2 channels: 0 1" ;;
  *--show*) echo "    samplerate (10 Hz - 100 MHz in steps of 1 Hz)" ;;
  *) exit 1 ;;
esac"#,
                log.display()
            ),
        );
        let calls = || std::fs::read_to_string(&log).unwrap_or_default().lines().count();
        let e = Engine::new();
        e.set_sigrok_path(Some(bin.clone()));
        let list = e.rescan_devices();
        let ran = calls();
        assert!(ran >= 4, "sigrok-cli calls: {ran}");
        assert!(!std::fs::read_to_string(&log).unwrap().contains("fx2lafw"), "fx2lafw never scanned");
        let ids: Vec<String> = list.iter().map(|d| d.id.clone()).collect();
        let n = ids.len();
        assert_eq!(ids[n - 2..], ["sigrok:ols:/dev/ttyACM0", devices::demo::ID]);
        assert!(ids[..n - 2].iter().all(|i| i.starts_with("fx2:")));
        assert_eq!(list[n - 2].default_samplerate, 20_000_000);

        for _ in 0..3 {
            let again: Vec<String> = e.list_devices().into_iter().map(|d| d.id).collect();
            assert!(again.contains(&"sigrok:ols:/dev/ttyACM0".to_string()));
        }
        assert_eq!(calls(), ran, "list_devices ran sigrok-cli");
        let st = e.sigrok_status();
        assert_eq!((st.found, st.version.as_deref(), st.path), (true, Some("0.7.2"), Some(bin.display().to_string())));
        let _ = std::fs::remove_file(&log);
    }

    /// With a real `sigrok-cli` on PATH (CI installs one); skipped otherwise.
    fn real_demo() -> Option<Engine> {
        let cands = sigrok::candidates(std::env::var_os("PATH").as_deref());
        let Some(cli) = sigrok::locate(None, &cands, &sigrok::TIMEOUTS) else {
            eprintln!("sigrok-cli not installed; skipping");
            return None;
        };
        save_real_output(&cli.path);
        let e = Engine::new();
        e.rescan_with(Some("demo"), &sigrok::TIMEOUTS);
        Some(e)
    }

    /// Keeps the raw output next to the UI screenshots, so CI uploads it for fixtures.
    fn save_real_output(bin: &std::path::Path) {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ui-checks/sigrok-output");
        let _ = std::fs::create_dir_all(&dir);
        for (name, args) in [
            ("version", &["-V"][..]),
            ("drivers", &["-L"]),
            ("scan-demo", &["-d", "demo", "--scan"]),
            ("show-demo", &["-d", "demo", "--show"]),
        ] {
            let out = sigrok::run(bin, args, Duration::from_secs(10)).unwrap_or_default();
            let _ = std::fs::write(dir.join(format!("{name}.txt")), out);
        }
    }

    #[test]
    fn real_sigrok_demo_is_listed_with_8_channels() {
        let Some(e) = real_demo() else { return };
        let list = e.list_devices();
        let dev = list.iter().find(|d| d.id == "sigrok:demo").unwrap_or_else(|| panic!("{list:?}"));
        assert_eq!(dev.channels, 8);
        assert_eq!(dev.driver, "sigrok");
        assert!(dev.note.as_deref().unwrap_or("").starts_with("via sigrok-cli "), "{:?}", dev.note);
        assert!(dev.samplerates.contains(&1_000_000), "{:?}", dev.samplerates);
    }

    #[test]
    fn real_sigrok_demo_timed_capture() {
        let Some(e) = real_demo() else { return };
        let opts = StartOptions {
            device_id: "sigrok:demo".into(),
            samplerate: 1_000_000,
            sample_limit: 100_000,
            trigger: vec![],
            pretrigger: 0.1,
        };
        e.start(opts).unwrap();
        let st = wait_done(&e, Duration::from_secs(15));
        assert_eq!((st.state, st.message.as_str(), st.samples), (AcqState::Done, "", 100_000));
    }

    #[test]
    fn real_sigrok_demo_triggered_capture() {
        let Some(e) = real_demo() else { return };
        let trigger = serde_json::from_str(r#"[{"channel":0,"condition":"rising"}]"#).unwrap();
        let opts = StartOptions {
            device_id: "sigrok:demo".into(),
            samplerate: 1_000_000,
            sample_limit: 100_000,
            trigger,
            pretrigger: 0.1,
        };
        e.start(opts).unwrap();
        let st = wait_done(&e, Duration::from_secs(15));
        assert_eq!((st.state, st.samples, st.trigger), (AcqState::Done, 100_000, Some(10_000)), "{}", st.message);
    }

    #[test]
    fn real_sigrok_demo_stop() {
        let Some(e) = real_demo() else { return };
        let opts = StartOptions {
            device_id: "sigrok:demo".into(),
            samplerate: 1_000_000,
            sample_limit: 0,
            trigger: vec![],
            pretrigger: 0.1,
        };
        e.start(opts).unwrap();
        std::thread::sleep(Duration::from_millis(1500));
        let t0 = Instant::now();
        e.stop();
        assert!(t0.elapsed() < Duration::from_millis(1500), "{:?}", t0.elapsed());
        let st = e.status();
        assert_eq!(st.state, AcqState::Done, "{}", st.message);
        assert!(st.samples > 0);
    }
}
