//! Software trigger: holds a pre-trigger ring until the condition matches,
//! then forwards everything into the capture up to the sample limit.

use crate::capture::Capture;
use serde::Deserialize;
use std::collections::VecDeque;
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

pub struct Feeder {
    capture: Arc<Capture>,
    unit: usize,
    limit: u64,
    written: u64,
    masks: Option<Masks>,
    pre_bytes: usize,
    ring: VecDeque<u8>,
    prev: Option<u16>,
}

impl Feeder {
    /// `pre` is the fraction of `limit` kept before the trigger point.
    pub fn new(capture: Arc<Capture>, unit: usize, limit: u64, terms: &[TriggerTerm], pre: f64) -> Feeder {
        let masks = (!terms.is_empty()).then(|| Masks::from(terms));
        let pre_samples = if limit == 0 { 1_000_000 } else { (limit as f64 * pre.clamp(0.0, 0.99)) as u64 };
        Feeder {
            capture,
            unit,
            limit,
            written: 0,
            masks,
            pre_bytes: pre_samples as usize * unit,
            ring: VecDeque::new(),
            prev: None,
        }
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
                let pre: Vec<u8> = self.ring.drain(..).collect();
                let cut = i * self.unit;
                let mut head = pre;
                head.extend_from_slice(&data[..cut]);
                let skip = head.len().saturating_sub(self.pre_bytes);
                let head = &head[skip..];
                self.capture.set_trigger(Some((head.len() / self.unit) as u64));
                return self.write(head) && self.write(&data[cut..]);
            }
        }
        self.ring.extend(&data[..n * self.unit]);
        let excess = self.ring.len().saturating_sub(self.pre_bytes);
        self.ring.drain(..excess);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rising_trigger_keeps_pretrigger() {
        let cap = Arc::new(Capture::new(1000, 8));
        let terms = [TriggerTerm { channel: 2, condition: Condition::Rising }];
        let mut f = Feeder::new(cap.clone(), 1, 100, &terms, 0.1);
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
}
