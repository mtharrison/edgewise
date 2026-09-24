use super::{class, fmt_value, Annotation, Format};
use crate::capture::Snapshot;
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct I2cConfig {
    pub scl: u8,
    pub sda: u8,
    pub format: Format,
}

impl Default for I2cConfig {
    fn default() -> Self {
        I2cConfig { scl: 0, sda: 1, format: Format::Hex }
    }
}

pub fn decode(c: &I2cConfig, s: &Snapshot, cancel: &AtomicBool, out: &mut dyn FnMut(Annotation)) {
    let scl_m = 1u16 << c.scl;
    let sda_m = 1u16 << c.sda;
    let mask = scl_m | sda_m;
    let next_edge = |e: u64| s.next_change(mask, e).unwrap_or(e + 1);

    let mut prev = s.get(0);
    let mut pos = 0u64;
    let mut in_frame = false;
    let mut first_byte = false;
    let mut bits = 0u32;
    let mut value = 0u32;
    let mut byte_start = 0u64;
    let mut n = 0u32;
    let mut last_edge = 0u64;

    while let Some(e) = s.next_change(mask, pos) {
        n += 1;
        if n % 4096 == 0 && cancel.load(Ordering::Relaxed) {
            return;
        }
        let v = s.get(e);
        let (scl0, scl1) = (prev & scl_m != 0, v & scl_m != 0);
        let (sda0, sda1) = (prev & sda_m != 0, v & sda_m != 0);
        prev = v;
        pos = e;
        let since = e - last_edge;
        last_edge = e;

        if scl0 && scl1 && sda0 != sda1 {
            let (text, start) = if !sda1 { (if in_frame { "Sr" } else { "S" }, true) } else { ("P", false) };
            // A stop is followed by idle bus, so mirror the setup time instead of spanning the gap.
            let end = if start { next_edge(e) } else { e + since.max(1) };
            out(Annotation { start: e, end, row: 1, class: class::CONTROL, text: text.into() });
            in_frame = start;
            first_byte = start;
            bits = 0;
            value = 0;
            continue;
        }
        if !in_frame || scl0 || !scl1 {
            continue;
        }
        // SCL rising edge: sample SDA.
        if bits == 0 {
            byte_start = e;
        }
        if bits < 8 {
            value = value << 1 | sda1 as u32;
            bits += 1;
            continue;
        }
        // Ninth bit: ACK/NACK.
        let (cls, text) = if first_byte {
            let rw = if value & 1 == 1 { "Read" } else { "Write" };
            (class::ADDRESS, format!("{} {}", rw, fmt_value(value >> 1, 7, c.format)))
        } else {
            (class::DATA, fmt_value(value, 8, c.format))
        };
        out(Annotation { start: byte_start, end: e, row: 0, class: cls, text });
        let ack = !sda1;
        out(Annotation {
            start: e,
            end: next_edge(e),
            row: 1,
            class: if ack { class::ACK } else { class::WARN },
            text: if ack { "ACK" } else { "NACK" }.into(),
        });
        first_byte = false;
        bits = 0;
        value = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::decoders::testutil::Builder;

    #[test]
    fn decodes_write() {
        // scl = ch0, sda = ch1, both idle high.
        let mut b = Builder::new(0b11);
        b.set(1, false); // start
        b.hold(5);
        for byte in [0xA0u8, 0x42] {
            for i in (0..9).rev() {
                b.set(0, false);
                let bitv = if i == 0 { false } else { byte >> (i - 1) & 1 == 1 };
                b.set(1, bitv);
                b.hold(4);
                b.set(0, true);
                b.hold(5);
            }
        }
        b.set(0, false);
        b.set(1, false);
        b.hold(3);
        b.set(0, true);
        b.hold(3);
        b.set(1, true); // stop
        b.hold(10);
        let s = b.snap(1_000_000);
        let mut got = vec![];
        decode(&I2cConfig::default(), &s, &AtomicBool::new(false), &mut |a| got.push(a));
        let texts: Vec<_> = got.iter().map(|a| a.text.as_str()).collect();
        assert_eq!(texts, ["S", "Write 0x50", "ACK", "0x42", "ACK", "P"]);
    }
}
