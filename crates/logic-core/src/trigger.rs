//! Software trigger: holds a pre-trigger ring until the condition matches,
//! then forwards everything into the capture up to the sample limit.
//!
//! The ring is kept as capture chunks, summaries and all, so when the trigger
//! fires they are handed to the capture as they are, without copying.

use crate::capture::{append_chunks, Capture, Chunk};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Condition {
    Rising,
    Falling,
    Edge,
    High,
    Low,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TriggerTerm {
    pub channel: u8,
    pub condition: Condition,
}

#[derive(Default, Clone, Copy)]
struct Masks {
    high: u16,
    low: u16,
    rising: u16,
    falling: u16,
    edge: u16,
}

impl Masks {
    fn from(terms: &[TriggerTerm]) -> Masks {
        let mut m = Masks::default();
        for t in terms {
            let b = 1u16 << t.channel;
            match t.condition {
                Condition::High => m.high |= b,
                Condition::Low => m.low |= b,
                Condition::Rising => m.rising |= b,
                Condition::Falling => m.falling |= b,
                Condition::Edge => m.edge |= b,
            }
        }
        m
    }

    #[inline]
    fn matches(&self, prev: u16, v: u16) -> bool {
        v & self.high == self.high
            && !v & self.low == self.low
            && !prev & v & self.rising == self.rising
            && prev & !v & self.falling == self.falling
            && (prev ^ v) & self.edge == self.edge
    }
}

/// Most memory the pre-trigger ring may use when there is no sample limit.
pub const PRETRIGGER_CAP_BYTES: u64 = 64 * 1024 * 1024;

/// Samples to keep before the trigger for `time` seconds (clamped to 0–1 s)
/// at `samplerate` with `unit` bytes per sample, and whether the memory cap cut it.
pub fn pretrigger_samples(time: f64, samplerate: u64, unit: usize) -> (u64, bool) {
    let want = (time.clamp(0.0, 1.0) * samplerate as f64).round() as u64;
    let cap = PRETRIGGER_CAP_BYTES / unit as u64;
    (want.min(cap), want > cap)
}

pub struct Feeder {
    capture: Arc<Capture>,
    unit: usize,
    limit: u64,
    written: u64,
    masks: Option<Masks>,
    pre_samples: usize,
    /// Latest samples while waiting; all chunks but the last are full. Holds
    /// fewer than `pre_samples` plus one chunk.
    ring: Vec<Arc<Chunk>>,
    ring_len: usize,
    prev: Option<u16>,
    trigger_at: Option<u64>,
}

impl Feeder {
    /// `pre` is the fraction of `limit` kept before the trigger point;
    /// with no limit, `pre_unlimited` samples are kept instead.
    pub fn new(capture: Arc<Capture>, unit: usize, limit: u64, terms: &[TriggerTerm], pre: f64, pre_unlimited: u64) -> Feeder {
        let masks = (!terms.is_empty()).then(|| Masks::from(terms));
        let pre_samples = if limit == 0 { pre_unlimited } else { (limit as f64 * pre.clamp(0.0, 0.99)) as u64 };
        Feeder {
            capture,
            unit,
            limit,
            written: 0,
            masks,
            pre_samples: pre_samples as usize,
            ring: Vec::new(),
            ring_len: 0,
            prev: None,
            trigger_at: None,
        }
    }

    /// Samples kept before the trigger, once it has fired.
    pub fn trigger_at(&self) -> Option<u64> {
        self.trigger_at
    }

    pub fn armed(&self) -> bool {
        self.masks.is_some()
    }

    fn sample(&self, data: &[u8], i: usize) -> u16 {
        if self.unit == 1 {
            data[i] as u16
        } else {
            u16::from_le_bytes([data[2 * i], data[2 * i + 1]])
        }
    }

    fn write(&mut self, data: &[u8]) -> bool {
        let room = if self.limit == 0 { u64::MAX } else { self.limit - self.written };
        let n = ((data.len() / self.unit) as u64).min(room) as usize;
        self.capture.append(&data[..n * self.unit]);
        self.written += n as u64;
        self.limit == 0 || self.written < self.limit
    }

    /// Add samples to the ring, then drop the oldest chunks the pre-trigger
    /// window no longer reaches.
    fn buffer(&mut self, data: &[u8]) {
        self.ring_len += append_chunks(&mut self.ring, self.unit, data) as usize;
        let mut stale = 0;
        while stale < self.ring.len() && self.ring_len - self.ring[stale].len() >= self.pre_samples {
            self.ring_len -= self.ring[stale].len();
            stale += 1;
        }
        self.ring.drain(..stale);
    }

    /// Returns false once the capture is complete.
    pub fn push(&mut self, data: &[u8]) -> bool {
        let Some(m) = self.masks else { return self.write(data) };
        let n = data.len() / self.unit;
        for i in 0..n {
            let v = self.sample(data, i);
            let hit = match self.prev {
                Some(p) => m.matches(p, v),
                None => (m.rising | m.falling | m.edge) == 0 && m.matches(v, v),
            };
            self.prev = Some(v);
            if hit {
                self.masks = None;
                let cut = i * self.unit;
                self.buffer(&data[..cut]);
                // Keep the last `pre_samples` of the ring; the capture starts that far from its end.
                let at = self.ring_len.min(self.pre_samples);
                let origin = self.ring_len - at;
                self.ring_len = 0;
                self.trigger_at = Some(at as u64);
                self.capture.set_trigger(Some(at as u64));
                self.capture.adopt(std::mem::take(&mut self.ring), origin);
                // pre_samples is below the limit, so there is room for the rest.
                self.written = at as u64;
                return self.write(&data[cut..]);
            }
        }
        self.buffer(&data[..n * self.unit]);
        true
    }

    #[cfg(test)]
    fn ring_samples(&self) -> usize {
        self.ring.iter().map(|c| c.len()).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rising_trigger_keeps_pretrigger() {
        let cap = Arc::new(Capture::new(1000, 8));
        let terms = [TriggerTerm { channel: 2, condition: Condition::Rising }];
        let mut f = Feeder::new(cap.clone(), 1, 100, &terms, 0.1, 0);
        let mut data = vec![0u8; 500];
        for (i, x) in data.iter_mut().enumerate().skip(300) {
            *x = 4 | (i as u8 & 1);
        }
        assert!(f.push(&data[..250]));
        assert!(!f.push(&data[250..]));
        let s = cap.snapshot();
        assert_eq!(s.len, 100);
        assert_eq!(s.meta.trigger, Some(10));
        assert_eq!(s.get(9), 0);
        assert_eq!(s.get(10) & 4, 4);
    }

    #[test]
    fn pretrigger_time_to_samples() {
        assert_eq!(pretrigger_samples(0.1, 1_000_000, 1), (100_000, false));
        assert_eq!(pretrigger_samples(0.1, 24_000_000, 1), (2_400_000, false));
        assert_eq!(pretrigger_samples(1.0, 24_000_000, 2), (24_000_000, false));
        assert_eq!(pretrigger_samples(0.0, 24_000_000, 1), (0, false));
        assert_eq!(pretrigger_samples(5.0, 1_000_000, 1), (1_000_000, false));
        // 1 s at 100 MHz with 16 channels wants 200 MB.
        assert_eq!(pretrigger_samples(1.0, 100_000_000, 2), (PRETRIGGER_CAP_BYTES / 2, true));
        assert_eq!(pretrigger_samples(0.5, 200_000_000, 1), (PRETRIGGER_CAP_BYTES, true));
    }

    #[test]
    fn until_stopped_keeps_pretrigger_time() {
        let cap = Arc::new(Capture::new(10_000, 8));
        let terms = [TriggerTerm { channel: 0, condition: Condition::Rising }];
        let (pre, _) = pretrigger_samples(0.1, 10_000, 1);
        let mut f = Feeder::new(cap.clone(), 1, 0, &terms, 0.1, pre);
        // 500 ms low, then high.
        let mut data = vec![0u8; 6000];
        data[5000..].fill(1);
        for chunk in data.chunks(700) {
            assert!(f.push(chunk));
        }
        let s = cap.snapshot();
        assert_eq!(f.trigger_at(), Some(1000));
        assert_eq!(s.meta.trigger, Some(1000));
        assert_eq!(s.len, 2000);
        assert_eq!(s.get(999), 0);
        assert_eq!(s.get(1000), 1);
    }

    use crate::capture::CHUNK;

    /// Samples with noise on the low bits and `bit` rising at `hit`.
    fn stream(len: usize, hit: usize, bit: u8) -> Vec<u16> {
        let mut seed = 11u64;
        (0..len)
            .map(|i| {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                (seed >> 60) as u16 | if i >= hit { 1 << bit } else { 0 }
            })
            .collect()
    }

    fn bytes(samples: &[u16], unit: usize) -> Vec<u8> {
        samples.iter().flat_map(|v| v.to_le_bytes()[..unit].to_vec()).collect()
    }

    /// Feed `samples` in `block`-sample pushes through a rising trigger on `bit`
    /// and check the capture against the plain definition: the `pre` samples
    /// before the hit (or all of them, if fewer), then everything after, up to
    /// the limit. Also checks the ring stays under `pre` plus one chunk.
    fn check(samples: &[u16], hit: usize, bit: u8, channels: usize, block: usize, limit: u64, pre: f64, pre_unlimited: u64) {
        let unit = if channels > 8 { 2 } else { 1 };
        let cap = Arc::new(Capture::new(1_000_000, channels));
        let terms = [TriggerTerm { channel: bit, condition: Condition::Rising }];
        let mut f = Feeder::new(cap.clone(), unit, limit, &terms, pre, pre_unlimited);
        let pre_samples = f.pre_samples;
        let data = bytes(samples, unit);
        let mut fed = 0;
        let mut more = true;
        for part in data.chunks(block * unit) {
            if !more {
                break;
            }
            more = f.push(part);
            fed += part.len() / unit;
            if f.armed() {
                assert!(f.ring_samples() < pre_samples + CHUNK, "ring holds {} after {fed}", f.ring_samples());
                assert!(f.ring_samples() >= pre_samples.min(fed));
            }
        }
        let start = hit.saturating_sub(pre_samples);
        let end = if limit == 0 { samples.len() } else { (start + limit as usize).min(samples.len()) };
        let s = cap.snapshot();
        assert_eq!(f.trigger_at(), Some((hit - start) as u64));
        assert_eq!(s.meta.trigger, Some((hit - start) as u64));
        assert_eq!(s.len as usize, end - start);
        assert!(s.samples(0, s.len) == samples[start..end], "samples differ");
        if limit > 0 && end - start == limit as usize {
            assert!(!more, "capture should be complete");
        }
    }

    #[test]
    fn pretrigger_over_a_chunk_mid_chunk_hit() {
        let hit = 3 * CHUNK + 12_345;
        check(&stream(hit + 500_000, hit, 5), hit, 5, 8, 480_000, 0, 0.0, 2 * CHUNK as u64 + 1000);
    }

    #[test]
    fn hit_before_ring_fills() {
        let hit = 3000;
        check(&stream(10_000, hit, 5), hit, 5, 8, 700, 0, 0.0, 5000);
        check(&stream(2 * CHUNK, CHUNK + 5, 5), CHUNK + 5, 5, 8, 100_000, 0, 0.0, 3 * CHUNK as u64);
    }

    #[test]
    fn hit_in_first_block() {
        check(&stream(10_000, 3000, 5), 3000, 5, 8, 4096, 0, 0.0, 5000);
        check(&stream(10_000, 3000, 5), 3000, 5, 8, 4096, 0, 0.0, 1000);
        check(&stream(10_000, 3000, 5), 3000, 5, 8, 4096, 0, 0.0, 0);
    }

    #[test]
    fn sixteen_channels() {
        let hit = CHUNK + CHUNK / 2 + 77;
        check(&stream(hit + 200_000, hit, 12), hit, 12, 16, 240_000, 0, 0.0, CHUNK as u64 + 999);
    }

    #[test]
    fn sample_limit_exactly_filled() {
        // Kept pre-trigger samples plus the rest end exactly at the last sample fed.
        let (limit, hit) = (10_000usize, 6000);
        check(&stream(hit - 3000 + limit, hit, 5), hit, 5, 8, 1000, limit as u64, 0.3, 0);
        let (limit, hit) = (3 * CHUNK, 4 * CHUNK + 100);
        check(&stream(hit - (limit as f64 * 0.5) as usize + limit, hit, 5), hit, 5, 8, 480_000, limit as u64, 0.5, 0);
        // More data than the limit: the rest is cut off.
        check(&stream(hit + 2 * CHUNK, hit, 5), hit, 5, 8, 480_000, limit as u64, 0.5, 0);
    }
}
