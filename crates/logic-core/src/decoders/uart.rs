use super::{bit, class, fmt_value, Annotation, Format};
use crate::capture::Snapshot;
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Parity {
    #[default]
    None,
    Even,
    Odd,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UartConfig {
    pub channel: u8,
    pub baud: f64,
    pub data_bits: u8,
    pub parity: Parity,
    pub stop_bits: f64,
    pub invert: bool,
    pub msb_first: bool,
    pub format: Format,
}

impl Default for UartConfig {
    fn default() -> Self {
        UartConfig {
            channel: 0,
            baud: 115200.0,
            data_bits: 8,
            parity: Parity::None,
            stop_bits: 1.0,
            invert: false,
            msb_first: false,
            format: Format::Hex,
        }
    }
}

pub fn decode(c: &UartConfig, s: &Snapshot, cancel: &AtomicBool, out: &mut dyn FnMut(Annotation)) {
    let spb = s.meta.samplerate as f64 / c.baud;
    if spb < 2.0 || c.data_bits == 0 || c.data_bits > 9 {
        return;
    }
    let mask = 1u16 << c.channel;
    let active = |i: u64| bit(s, c.channel, i) == c.invert; // start bit level
    let par_bits = if c.parity == Parity::None { 0.0 } else { 1.0 };
    let at = |start: u64, bits: f64| start + (spb * bits) as u64;
    let mut pos = 0u64;
    let mut n = 0u32;
    while let Some(e) = s.next_change(mask, pos) {
        n += 1;
        if n % 4096 == 0 && cancel.load(Ordering::Relaxed) {
            return;
        }
        pos = e;
        if !active(e) {
            continue;
        }
        let mid = at(e, 0.5);
        let frame_end = at(e, 1.0 + c.data_bits as f64 + par_bits + c.stop_bits);
        if frame_end >= s.len {
            return;
        }
        if !active(mid) {
            continue; // glitch
        }
        let mut value = 0u32;
        let mut ones = 0;
        for i in 0..c.data_bits {
            let b = !active(at(e, 1.5 + i as f64));
            ones += b as u32;
            let idx = if c.msb_first { c.data_bits - 1 - i } else { i };
            value |= (b as u32) << idx;
        }
        let mut parity_ok = true;
        if c.parity != Parity::None {
            let p = !active(at(e, 1.5 + c.data_bits as f64)) as u32;
            let total = ones + p;
            parity_ok = if c.parity == Parity::Even { total % 2 == 0 } else { total % 2 == 1 };
        }
        let stop_at = at(e, 1.5 + c.data_bits as f64 + par_bits);
        let framing_ok = !active(stop_at);
        out(Annotation {
            start: e,
            end: frame_end,
            row: 0,
            class: if parity_ok && framing_ok { class::DATA } else { class::WARN },
            text: fmt_value(value, c.data_bits, c.format),
        });
        if !parity_ok || !framing_ok {
            out(Annotation {
                start: e,
                end: frame_end,
                row: 1,
                class: class::ERROR,
                text: if !framing_ok { "Framing error" } else { "Parity error" }.into(),
            });
        }
        pos = stop_at;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::decoders::testutil::Builder;

    #[test]
    fn decodes_bytes() {
        let spb = 10;
        let mut b = Builder::new(1);
        for &byte in b"Hi" {
            b.set(0, false);
            b.hold(spb - 1);
            for i in 0..8 {
                b.set(0, byte >> i & 1 == 1);
                b.hold(spb - 1);
            }
            b.set(0, true);
            b.hold(spb * 3);
        }
        let s = b.snap(1_000_000);
        let cfg = UartConfig { baud: 100_000.0, format: Format::Ascii, ..Default::default() };
        let mut got = vec![];
        decode(&cfg, &s, &AtomicBool::new(false), &mut |a| got.push(a));
        let texts: Vec<_> = got.iter().map(|a| a.text.as_str()).collect();
        assert_eq!(texts, ["'H'", "'i'"]);
    }
}
