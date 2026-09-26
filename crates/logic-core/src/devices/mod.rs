//! Capture sources.

pub mod demo;
pub mod fx2lafw;

use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub channels: usize,
    pub samplerates: Vec<u64>,
    pub default_samplerate: u64,
    /// Human-readable note, e.g. "firmware will be uploaded".
    pub note: Option<String>,
    /// Firmware file the board needs but none of the firmware folders has.
    pub missing_firmware: Option<String>,
}

pub trait Driver: Send {
    fn channels(&self) -> usize;
    /// Stream samples into `sink` until it returns false or `stop` is set.
    fn acquire(
        &mut self,
        samplerate: u64,
        sink: &mut dyn FnMut(&[u8]) -> bool,
        stop: &AtomicBool,
        progress: &dyn Fn(&str),
    ) -> Result<(), String>;
}

pub fn list(fw_dirs: &[PathBuf]) -> Vec<DeviceInfo> {
    let mut v = fx2lafw::scan(fw_dirs);
    v.push(demo::info());
    v
}

pub fn open(id: &str, fw_dirs: &[PathBuf]) -> Result<Box<dyn Driver>, String> {
    if id == demo::ID {
        return Ok(Box::new(demo::Demo));
    }
    if id.starts_with("fx2:") {
        return Ok(Box::new(fx2lafw::Fx2::new(id, fw_dirs.to_vec())?));
    }
    Err(format!("Unknown device {id}"))
}
