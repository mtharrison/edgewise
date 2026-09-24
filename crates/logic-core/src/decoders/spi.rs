use super::{class, fmt_value, Annotation, Format};
use crate::capture::Snapshot;
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SpiConfig {
    pub clk: u8,
    pub mosi: Option<u8>,
    pub miso: Option<u8>,
    pub cs: Option<u8>,
    pub cs_active_low: bool,
    pub cpol: u8,
    pub cpha: u8,
    pub word_bits: u8,
    pub msb_first: bool,
    pub format: Format,
}

impl Default for SpiConfig {
    fn default() -> Self {
        SpiConfig {
            clk: 0,
            mosi: Some(1),
            miso: Some(2),
            cs: Some(3),
            cs_active_low: true,
            cpol: 0,
            cpha: 0,
            word_bits: 8,
            msb_first: true,
            format: Format::Hex,
        }
    }
}

pub fn decode(c: &SpiConfig, s: &Snapshot, cancel: &AtomicBool, out: &mut dyn FnMut(Annotation)) {
    let bits_per_word = c.word_bits.clamp(1, 32) as u32;
    let clk_m = 1u16 << c.clk;
    let cs_m = c.cs.map_or(0, |ch| 1u16 << ch);
    let mask = clk_m | cs_m;
    let sample_on_rising = (c.cpol & 1) == (c.cpha & 1);
    let cs_active = |v: u16| cs_m == 0 || ((v & cs_m != 0) != c.cs_active_low);
    let get = |v: u16, ch: Option<u8>| ch.map(|ch| (v >> ch & 1) as u32);

    let mut prev = s.get(0);
    let mut pos = 0u64;
    let mut nbits = 0u32;
    let (mut mosi, mut miso) = (0u32, 0u32);
    let mut word_start = 0u64;
    let mut n = 0u32;

    while let Some(e) = s.next_change(mask, pos) {
        n += 1;
        if n % 4096 == 0 && cancel.load(Ordering::Relaxed) {
            return;
        }
        let v = s.get(e);
        let changed = prev ^ v;
        let was = prev;
        prev = v;
        pos = e;
        if changed & cs_m != 0 {
            nbits = 0; // word boundary on any CS transition
        }
        if changed & clk_m == 0 || !cs_active(v) || !cs_active(was) {
            continue;
        }
        let rising = v & clk_m != 0;
        if rising != sample_on_rising {
            continue;
        }
        if nbits == 0 {
            word_start = e;
            mosi = 0;
            miso = 0;
        }
        let shift = |acc: u32, b: u32| {
            if c.msb_first {
                acc << 1 | b
            } else {
                acc | b << nbits
            }
        };
        if let Some(b) = get(v, c.mosi) {
            mosi = shift(mosi, b);
        }
        if let Some(b) = get(v, c.miso) {
            miso = shift(miso, b);
        }
        nbits += 1;
        if nbits == bits_per_word {
            let end = s.next_change(clk_m, e).unwrap_or(e + 1);
            let w = bits_per_word as u8;
            if c.mosi.is_some() {
                out(Annotation { start: word_start, end, row: 0, class: class::DATA, text: fmt_value(mosi, w, c.format) });
            }
            if c.miso.is_some() {
                out(Annotation { start: word_start, end, row: 1, class: class::ADDRESS, text: fmt_value(miso, w, c.format) });
            }
            nbits = 0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::decoders::testutil::Builder;

    #[test]
    fn decodes_mode0() {
        // clk=0 mosi=1 miso=2 cs=3 (active low)
        let mut b = Builder::new(0b1000);
        b.set(3, false);
        b.hold(4);
        let (tx, rx) = (0xA5u8, 0x3Cu8);
        for i in (0..8).rev() {
            b.set(1, tx >> i & 1 == 1);
            b.set(2, rx >> i & 1 == 1);
            b.hold(3);
            b.set(0, true);
            b.hold(4);
            b.set(0, false);
            b.hold(3);
        }
        b.set(3, true);
        b.hold(10);
        let s = b.snap(1_000_000);
        let mut got = vec![];
        decode(&SpiConfig::default(), &s, &AtomicBool::new(false), &mut |a| got.push(a));
        let texts: Vec<_> = got.iter().map(|a| a.text.as_str()).collect();
        assert_eq!(texts, ["0xA5", "0x3C"]);
    }
}
