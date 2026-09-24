//! Native protocol decoders. Each walks edges via the capture's summary tree
//! and emits annotations grouped into rows.

mod i2c;
mod spi;
mod uart;

use crate::capture::Snapshot;
use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;

pub use i2c::I2cConfig;
pub use spi::SpiConfig;
pub use uart::UartConfig;

/// Annotation classes; the UI maps these to colours.
pub mod class {
    pub const DATA: u8 = 0;
    pub const ADDRESS: u8 = 1;
    pub const CONTROL: u8 = 2;
    pub const ACK: u8 = 3;
    pub const WARN: u8 = 4;
    pub const ERROR: u8 = 5;
    /// Several annotations merged because they are too narrow to draw.
    pub const DENSE: u8 = 255;
}

#[derive(Clone, Debug, Serialize)]
pub struct Annotation {
    pub start: u64,
    pub end: u64,
    pub row: u8,
    pub class: u8,
    pub text: String,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    #[default]
    Hex,
    Dec,
    Bin,
    Ascii,
}

pub fn fmt_value(v: u32, bits: u8, f: Format) -> String {
    match f {
        Format::Hex => format!("0x{:0w$X}", v, w = (bits as usize).div_ceil(4)),
        Format::Dec => v.to_string(),
        Format::Bin => format!("{:0w$b}", v, w = bits as usize),
        Format::Ascii => match v {
            0x20..=0x7e => format!("'{}'", v as u8 as char),
            0x0a => "\\n".into(),
            0x0d => "\\r".into(),
            0x09 => "\\t".into(),
            _ => format!("0x{:02X}", v),
        },
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum DecoderConfig {
    Uart(UartConfig),
    I2c(I2cConfig),
    Spi(SpiConfig),
}

impl DecoderConfig {
    pub fn rows(&self) -> Vec<&'static str> {
        match self {
            DecoderConfig::Uart(_) => vec!["Data", "Errors"],
            DecoderConfig::I2c(_) => vec!["Data", "Events"],
            DecoderConfig::Spi(_) => vec!["MOSI", "MISO"],
        }
    }

    /// Decode the snapshot. Returns annotations per row, each sorted by start.
    pub fn decode(&self, snap: &Snapshot, cancel: &AtomicBool) -> Vec<Vec<Annotation>> {
        let mut rows = vec![Vec::new(); self.rows().len()];
        if snap.len < 2 {
            return rows;
        }
        let mut out = |a: Annotation| rows[a.row as usize].push(a);
        match self {
            DecoderConfig::Uart(c) => uart::decode(c, snap, cancel, &mut out),
            DecoderConfig::I2c(c) => i2c::decode(c, snap, cancel, &mut out),
            DecoderConfig::Spi(c) => spi::decode(c, snap, cancel, &mut out),
        }
        for r in &mut rows {
            r.sort_by_key(|a| a.start);
        }
        rows
    }
}

#[inline]
pub(crate) fn bit(snap: &Snapshot, ch: u8, i: u64) -> bool {
    snap.get(i) >> ch & 1 == 1
}

/// Annotations visible in [start, end), merging ones narrower than `min_w`
/// samples into DENSE blocks so the renderer never draws millions of boxes.
pub fn query(row: &[Annotation], start: u64, end: u64, min_w: f64, limit: usize) -> Vec<Annotation> {
    let first = row.partition_point(|a| a.end < start);
    let mut out: Vec<Annotation> = Vec::new();
    for a in &row[first..] {
        if a.start > end || out.len() >= limit {
            break;
        }
        let narrow = ((a.end - a.start) as f64) < min_w;
        if narrow {
            if let Some(last) = out.last_mut() {
                if last.class == class::DENSE && (a.start as f64 - last.end as f64) < min_w {
                    last.end = a.end;
                    continue;
                }
            }
            out.push(Annotation { start: a.start, end: a.end, row: a.row, class: class::DENSE, text: String::new() });
        } else {
            out.push(a.clone());
        }
    }
    out
}

#[cfg(test)]
pub(crate) mod testutil {
    use crate::capture::{Capture, Snapshot};

    /// Builds a capture from per-sample closures.
    pub struct Builder {
        pub samples: Vec<u8>,
    }

    impl Builder {
        pub fn new(idle: u8) -> Builder {
            Builder { samples: vec![idle; 100] }
        }
        pub fn cur(&self) -> u8 {
            *self.samples.last().unwrap()
        }
        pub fn hold(&mut self, n: usize) {
            let v = self.cur();
            self.samples.extend(std::iter::repeat(v).take(n));
        }
        pub fn set(&mut self, ch: u8, level: bool) {
            let mut v = self.cur();
            if level {
                v |= 1 << ch
            } else {
                v &= !(1 << ch)
            }
            self.samples.push(v);
        }
        pub fn snap(&self, rate: u64) -> Snapshot {
            let c = Capture::new(rate, 8);
            c.append(&self.samples);
            c.snapshot()
        }
    }
}
