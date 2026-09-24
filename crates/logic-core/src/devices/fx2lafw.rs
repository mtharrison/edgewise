//! Native driver for Cypress FX2 logic analysers running sigrok's open
//! `fx2lafw` firmware (most cheap "24MHz 8CH" Saleae clones).
//!
//! Protocol, per libsigrok's fx2lafw driver:
//! 1. If the device has no firmware, load it into RAM through the FX2 boot
//!    ROM (vendor request 0xA0), then wait for it to re-enumerate.
//! 2. Claim interface 0, send CMD_START with clock source and divider.
//! 3. Read samples from bulk endpoint 0x82 until stopped.

use super::{DeviceInfo, Driver};
use nusb::transfer::{Control, ControlType, Queue, Recipient, RequestBuffer};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};
use std::time::{Duration, Instant};

struct Profile {
    vid: u16,
    pid: u16,
    name: &'static str,
    firmware: &'static str,
    channels: usize,
}

const PROFILES: &[Profile] = &[
    Profile { vid: 0x0925, pid: 0x3881, name: "Saleae Logic (FX2 clone)", firmware: "fx2lafw-saleae-logic.fw", channels: 8 },
    Profile { vid: 0x04b4, pid: 0x8613, name: "Cypress FX2", firmware: "fx2lafw-cypress-fx2.fw", channels: 8 },
    Profile { vid: 0x1d50, pid: 0x608c, name: "sigrok FX2 LA (8ch)", firmware: "fx2lafw-sigrok-fx2-8ch.fw", channels: 8 },
    Profile { vid: 0x1d50, pid: 0x608d, name: "sigrok FX2 LA (16ch)", firmware: "fx2lafw-sigrok-fx2-16ch.fw", channels: 16 },
    Profile { vid: 0x08a9, pid: 0x0014, name: "CWAV USBee AX", firmware: "fx2lafw-cwav-usbeeax.fw", channels: 8 },
    Profile { vid: 0x08a9, pid: 0x0015, name: "CWAV USBee DX", firmware: "fx2lafw-cwav-usbeedx.fw", channels: 16 },
    Profile { vid: 0x08a9, pid: 0x0009, name: "CWAV USBee SX", firmware: "fx2lafw-cwav-usbeesx.fw", channels: 8 },
    Profile { vid: 0x08a9, pid: 0x0005, name: "CWAV USBee ZX", firmware: "fx2lafw-cwav-usbeezx.fw", channels: 8 },
];

const SAMPLERATES: &[u64] = &[
    20_000, 25_000, 50_000, 100_000, 200_000, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000, 4_000_000,
    6_000_000, 8_000_000, 12_000_000, 16_000_000, 24_000_000,
];

const CMD_GET_FW_VERSION: u8 = 0xb0;
const CMD_START: u8 = 0xb1;
const FLAG_16BIT: u8 = 1 << 5;
const FLAG_CLK_48MHZ: u8 = 1 << 6;
const MAX_SAMPLE_DELAY: u32 = 6 * 256;
const EP_IN: u8 = 0x82;
const CPUCS: u16 = 0xe600;

fn vendor() -> Control {
    Control { control_type: ControlType::Vendor, recipient: Recipient::Device, request: 0, value: 0, index: 0 }
}

/// Stable-ish physical port identity, unchanged across re-enumeration.
fn port_key(d: &nusb::DeviceInfo) -> u64 {
    #[cfg(target_os = "macos")]
    {
        d.location_id() as u64
    }
    #[cfg(not(target_os = "macos"))]
    {
        d.bus_number() as u64
    }
}

fn profile_of(d: &nusb::DeviceInfo) -> Option<&'static Profile> {
    PROFILES.iter().find(|p| p.vid == d.vendor_id() && p.pid == d.product_id())
}

fn has_fx2lafw_strings(d: &nusb::DeviceInfo) -> bool {
    d.manufacturer_string() == Some("sigrok") && d.product_string() == Some("fx2lafw")
}

fn find_firmware(dirs: &[PathBuf], name: &str) -> Option<PathBuf> {
    dirs.iter().map(|d| d.join(name)).find(|p| p.is_file())
}

pub fn scan(fw_dirs: &[PathBuf]) -> Vec<DeviceInfo> {
    let Ok(list) = nusb::list_devices() else { return vec![] };
    list.filter_map(|d| {
        let p = profile_of(&d)?;
        let loaded = has_fx2lafw_strings(&d);
        let note = if loaded {
            None
        } else if find_firmware(fw_dirs, p.firmware).is_some() {
            Some("Firmware will be uploaded on first capture".into())
        } else {
            Some(format!("Needs {} in a firmware folder", p.firmware))
        };
        Some(DeviceInfo {
            id: format!("fx2:{:04x}:{:04x}:{:x}", p.vid, p.pid, port_key(&d)),
            name: p.name.into(),
            driver: "fx2lafw".into(),
            channels: p.channels,
            samplerates: SAMPLERATES.to_vec(),
            default_samplerate: 24_000_000,
            note,
        })
    })
    .collect()
}

pub struct Fx2 {
    vid: u16,
    pid: u16,
    port: u64,
    profile: &'static Profile,
    fw_dirs: Vec<PathBuf>,
}

impl Fx2 {
    pub fn new(id: &str, fw_dirs: Vec<PathBuf>) -> Result<Fx2, String> {
        let parts: Vec<&str> = id.split(':').collect();
        let bad = || format!("Bad device id {id}");
        if parts.len() != 4 {
            return Err(bad());
        }
        let vid = u16::from_str_radix(parts[1], 16).map_err(|_| bad())?;
        let pid = u16::from_str_radix(parts[2], 16).map_err(|_| bad())?;
        let port = u64::from_str_radix(parts[3], 16).map_err(|_| bad())?;
        let profile = PROFILES.iter().find(|p| p.vid == vid && p.pid == pid).ok_or_else(bad)?;
        Ok(Fx2 { vid, pid, port, profile, fw_dirs })
    }

    fn find(&self) -> Option<nusb::DeviceInfo> {
        nusb::list_devices()
            .ok()?
            .find(|d| d.vendor_id() == self.vid && d.product_id() == self.pid && port_key(d) == self.port)
    }

    fn fw_version(dev: &nusb::Device) -> Option<(u8, u8)> {
        let mut buf = [0u8; 2];
        let ctl = Control { request: CMD_GET_FW_VERSION, ..vendor() };
        match dev.control_in_blocking(ctl, &mut buf, Duration::from_millis(300)) {
            Ok(2) => Some((buf[0], buf[1])),
            _ => None,
        }
    }

    fn upload_firmware(&self, dev: &nusb::Device) -> Result<(), String> {
        let path = find_firmware(&self.fw_dirs, self.profile.firmware).ok_or_else(|| {
            format!(
                "Firmware {} not found. Download sigrok-firmware-fx2lafw and copy the .fw files into a firmware folder (see Settings).",
                self.profile.firmware
            )
        })?;
        let image = std::fs::read(&path).map_err(|e| format!("Reading {}: {e}", path.display()))?;
        let t = Duration::from_millis(1000);
        let write = |addr: u16, data: &[u8]| {
            dev.control_out_blocking(Control { request: 0xa0, value: addr, ..vendor() }, data, t)
                .map_err(|e| format!("Firmware upload failed at 0x{addr:04x}: {e}"))
        };
        write(CPUCS, &[1])?; // hold 8051 in reset
        for (i, chunk) in image.chunks(4096).enumerate() {
            write((i * 4096) as u16, chunk)?;
        }
        write(CPUCS, &[0])?; // release: device re-enumerates
        Ok(())
    }

    fn open_with_firmware(&self, progress: &dyn Fn(&str)) -> Result<nusb::Device, String> {
        let info = self.find().ok_or("Device not connected")?;
        let dev = info.open().map_err(|e| format!("Opening device: {e}"))?;
        if has_fx2lafw_strings(&info) || Self::fw_version(&dev).is_some() {
            return Ok(dev);
        }
        progress("Uploading firmware…");
        self.upload_firmware(&dev)?;
        drop(dev);
        std::thread::sleep(Duration::from_millis(300));
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if let Some(info) = self.find().filter(has_fx2lafw_strings) {
                std::thread::sleep(Duration::from_millis(100));
                return info.open().map_err(|e| format!("Opening device after firmware upload: {e}"));
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        Err("Device did not re-enumerate after firmware upload".into())
    }
}

/// Clock source and divider for a sample rate, matching libsigrok.
fn start_command(samplerate: u64, wide: bool) -> Result<[u8; 3], String> {
    let rate = samplerate as u32;
    let (mut flags, mut delay) = (0u8, 0u32);
    if 48_000_000 % rate == 0 {
        flags = FLAG_CLK_48MHZ;
        delay = 48_000_000 / rate - 1;
        if delay > MAX_SAMPLE_DELAY {
            delay = 0;
        }
    }
    if delay == 0 && 30_000_000 % rate == 0 {
        flags = 0;
        delay = 30_000_000 / rate - 1;
    }
    if delay == 0 && rate != 48_000_000 && rate != 30_000_000 {
        return Err(format!("Unsupported sample rate {samplerate}"));
    }
    if wide {
        flags |= FLAG_16BIT;
    }
    Ok([flags, (delay >> 8) as u8, delay as u8])
}

struct ThreadWaker(std::thread::Thread);
impl Wake for ThreadWaker {
    fn wake(self: Arc<Self>) {
        self.0.unpark();
    }
}

enum Next {
    Done(nusb::transfer::Completion<Vec<u8>>),
    Stopped,
    TimedOut,
}

/// Wait for the next completed transfer, bailing out if `stop` is set or
/// nothing arrives within `timeout`.
fn next_or_stop(q: &mut Queue<RequestBuffer>, stop: &AtomicBool, timeout: Duration) -> Next {
    let waker = Waker::from(Arc::new(ThreadWaker(std::thread::current())));
    let mut cx = Context::from_waker(&waker);
    let deadline = Instant::now() + timeout;
    loop {
        if let Poll::Ready(c) = q.poll_next(&mut cx) {
            return Next::Done(c);
        }
        if stop.load(Ordering::Relaxed) {
            return Next::Stopped;
        }
        if Instant::now() > deadline {
            return Next::TimedOut;
        }
        std::thread::park_timeout(Duration::from_millis(50));
    }
}

impl Driver for Fx2 {
    fn channels(&self) -> usize {
        self.profile.channels
    }

    fn acquire(
        &mut self,
        samplerate: u64,
        sink: &mut dyn FnMut(&[u8]) -> bool,
        stop: &AtomicBool,
        progress: &dyn Fn(&str),
    ) -> Result<(), String> {
        let wide = self.profile.channels > 8;
        let cmd = start_command(samplerate, wide)?;
        let dev = self.open_with_firmware(progress)?;
        if let Some((major, _)) = Self::fw_version(&dev) {
            if major != 1 {
                return Err(format!("Unsupported fx2lafw firmware version {major}.x"));
            }
        }
        // Right after firmware upload or a replug the OS may not have finished
        // settling the device's configuration yet, so claiming interface 0
        // immediately can fail with "not found" even though the device is
        // present. Nudge it into configuration 1 at most once: some cheap
        // fx2lafw clones perform their own soft disconnect/reconnect when they
        // receive SET_CONFIGURATION, so re-issuing it on every retry can keep
        // knocking the interface back offline instead of letting it settle.
        // After that, just retry the claim itself for a couple of seconds.
        if dev.active_configuration().map(|c| c.configuration_value()).ok() != Some(1) {
            let _ = dev.set_configuration(1);
            std::thread::sleep(Duration::from_millis(200));
        }
        let claim_deadline = Instant::now() + Duration::from_secs(2);
        let mut attempts = 0u32;
        let iface = loop {
            attempts += 1;
            match dev.claim_interface(0) {
                Ok(iface) => break iface,
                Err(_) if Instant::now() < claim_deadline => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(e) => {
                    let cfg = dev.active_configuration().map(|c| c.configuration_value()).ok();
                    return Err(format!(
                        "Claiming interface: {e} (after {attempts} attempts, active configuration: {cfg:?})"
                    ));
                }
            }
        };

        // ~20 ms per transfer keeps stop latency low; 32 in flight rides out host hiccups.
        const INFLIGHT: usize = 32;
        let unit = if wide { 2 } else { 1 };
        let size = ((samplerate * unit / 50) as usize).div_ceil(512).clamp(1, 2048) * 512;
        let mut q = iface.bulk_in_queue(EP_IN);
        for _ in 0..INFLIGHT {
            q.submit(RequestBuffer::new(size));
        }
        iface
            .control_out_blocking(Control { request: CMD_START, ..vendor() }, &cmd, Duration::from_millis(500))
            .map_err(|e| format!("Start command failed: {e}"))?;
        progress("");

        // The FX2 buffers only ~85 us at 24 MHz. If the host misses a beat the
        // device overruns and stops streaming (libsigrok hangs here). Keep what
        // was captured and report it instead.
        let stall = Duration::from_millis(1000);
        let mut received = 0u64;
        let mut error: Option<String> = None;
        let mut result = Ok(());
        loop {
            match next_or_stop(&mut q, stop, stall) {
                Next::Stopped => break,
                Next::TimedOut => {
                    let why = error.take().map(|e| format!(" ({e})")).unwrap_or_default();
                    result = Err(format!(
                        "Device stopped sending after {} samples{why}. Captured data was kept. \
                         Try another cable or USB port, or a lower sample rate.",
                        received / unit
                    ));
                    break;
                }
                Next::Done(c) => {
                    match c.status {
                        Err(nusb::transfer::TransferError::Disconnected) => {
                            result = Err("Device disconnected".into());
                            break;
                        }
                        Err(e) => error = Some(format!("USB {e}")),
                        Ok(()) => {
                            received += c.data.len() as u64;
                            if !sink(&c.data) {
                                break;
                            }
                        }
                    }
                    q.submit(RequestBuffer::reuse(c.data, size));
                }
            }
        }
        q.cancel_all();
        while q.pending() > 0 {
            if !matches!(next_or_stop(&mut q, &AtomicBool::new(false), stall), Next::Done(_)) {
                break;
            }
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_commands_match_libsigrok() {
        assert_eq!(start_command(24_000_000, false).unwrap(), [FLAG_CLK_48MHZ, 0, 1]);
        assert_eq!(start_command(1_000_000, false).unwrap(), [FLAG_CLK_48MHZ, 0, 47]);
        // 48 MHz / 20 kHz - 1 = 2399 > MAX, so the 30 MHz clock is used.
        assert_eq!(start_command(20_000, false).unwrap(), [0, (1499u32 >> 8) as u8, 1499u32 as u8]);
        assert!(start_command(7_000_000, false).is_err());
    }
}
