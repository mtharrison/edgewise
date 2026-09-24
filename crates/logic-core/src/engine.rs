//! Top-level state shared with the UI: current capture, acquisition thread,
//! and decoder instances. All methods are cheap except where noted; heavy
//! work runs on background threads.

use crate::capture::{Capture, Snapshot};
use crate::decoders::{self, Annotation, DecoderConfig};
use crate::devices;
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

    pub fn list_devices(&self) -> Vec<devices::DeviceInfo> {
        devices::list(&self.fw_dirs.lock())
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
        let mut driver = devices::open(&opts.device_id, &fw)?;
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
