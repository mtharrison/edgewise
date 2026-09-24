//! Thin N-API wrapper over `logic_core::engine::Engine`.

use logic_core::decoders::DecoderConfig;
use logic_core::engine;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn err(e: impl std::fmt::Display) -> Error {
    Error::from_reason(e.to_string())
}

fn to_json<T: serde::Serialize>(v: T) -> Result<Value> {
    serde_json::to_value(v).map_err(err)
}

fn from_json<T: serde::de::DeserializeOwned>(v: Value) -> Result<T> {
    serde_json::from_value(v).map_err(err)
}

#[napi]
pub struct Engine {
    inner: engine::Engine,
}

#[napi]
impl Engine {
    #[napi(constructor)]
    pub fn new() -> Self {
        Engine { inner: engine::Engine::new() }
    }

    #[napi]
    pub fn set_firmware_dirs(&self, dirs: Vec<String>) {
        self.inner.set_firmware_dirs(dirs.into_iter().map(PathBuf::from).collect());
    }

    #[napi]
    pub fn list_devices(&self) -> Result<Value> {
        to_json(self.inner.list_devices())
    }

    #[napi]
    pub fn start(&self, opts: Value) -> Result<()> {
        self.inner.start(from_json(opts)?).map_err(err)
    }

    #[napi]
    pub fn stop(&self) {
        self.inner.stop();
    }

    #[napi]
    pub fn status(&self) -> Result<Value> {
        to_json(self.inner.status())
    }

    /// Interleaved (first, toggleMask) per pixel.
    #[napi]
    pub fn render(&self, start: f64, spp: f64, width: u32) -> Uint16Array {
        Uint16Array::new(self.inner.snapshot().render(start, spp, width as usize))
    }

    #[napi]
    pub fn samples(&self, start: f64, count: u32) -> Uint16Array {
        Uint16Array::new(self.inner.snapshot().samples(start.max(0.0) as u64, count as u64))
    }

    #[napi]
    pub fn measure(&self, channel: u32, sample: f64) -> Result<Value> {
        if sample < 0.0 {
            return Ok(Value::Null);
        }
        to_json(self.inner.measure(channel as u8, sample as u64))
    }

    /// Next (forward) or previous edge on a channel, as a sample index.
    #[napi]
    pub fn find_edge(&self, channel: u32, from: f64, forward: bool) -> Option<f64> {
        let s = self.inner.snapshot();
        let m = 1u16 << channel;
        let from = from.max(0.0) as u64;
        let r = if forward { s.next_change(m, from) } else { s.prev_change(m, from.saturating_sub(1)) };
        r.map(|v| v as f64)
    }

    #[napi]
    pub fn add_decoder(&self, config: Value) -> Result<u32> {
        let cfg: DecoderConfig = from_json(config)?;
        Ok(self.inner.add_decoder(cfg))
    }

    #[napi]
    pub fn update_decoder(&self, id: u32, config: Value) -> Result<()> {
        self.inner.update_decoder(id, from_json(config)?);
        Ok(())
    }

    #[napi]
    pub fn remove_decoder(&self, id: u32) {
        self.inner.remove_decoder(id);
    }

    #[napi]
    pub fn decode(&self, id: u32) {
        self.inner.decode(id);
    }

    #[napi]
    pub fn decoder_rows(&self, config: Value) -> Result<Vec<String>> {
        let cfg: DecoderConfig = from_json(config)?;
        Ok(cfg.rows().into_iter().map(String::from).collect())
    }

    #[napi]
    pub fn annotations(&self, id: u32, row: u32, start: f64, end: f64, min_width: f64, limit: u32) -> Result<Value> {
        let a = self.inner.annotations(
            id,
            row as usize,
            start.max(0.0) as u64,
            end.max(0.0) as u64,
            min_width,
            limit as usize,
        );
        to_json(a)
    }

    #[napi]
    pub fn annotation_page(&self, id: u32, row: u32, offset: u32, limit: u32) -> Result<Value> {
        let (total, items) = self.inner.annotation_page(id, row as usize, offset as usize, limit as usize);
        Ok(json!({ "total": total, "items": to_json(items)? }))
    }

    #[napi]
    pub fn annotation_index(&self, id: u32, row: u32, sample: f64) -> u32 {
        self.inner.annotation_index(id, row as usize, sample.max(0.0) as u64) as u32
    }

    #[napi]
    pub fn load(&self, path: String) -> Result<Vec<String>> {
        self.inner.load(Path::new(&path)).map_err(err)
    }

    #[napi]
    pub fn save(&self, path: String, names: Vec<String>) -> Result<()> {
        logic_core::formats::save_sr(&self.inner.snapshot(), &names, Path::new(&path)).map_err(err)
    }

    #[napi]
    pub fn export_vcd(&self, path: String, names: Vec<String>) -> Result<()> {
        logic_core::formats::export_vcd(&self.inner.snapshot(), &names, Path::new(&path)).map_err(err)
    }
}
