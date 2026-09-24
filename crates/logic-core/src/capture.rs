//! Append-only sample storage with per-chunk mipmaps.
//!
//! Samples are packed as 1 or 2 bytes (`unitsize`), one bit per channel.
//! Storage is split into fixed-size chunks. Full chunks are immutable and
//! shared via `Arc`, so readers take a cheap [`Snapshot`] and never block the
//! acquisition thread for longer than a chunk append.
//!
//! Each chunk carries a 4-level summary tree (fan-out 32). A node records the
//! first sample, last sample, and a mask of channels that toggled inside it.
//! That lets rendering and edge search skip millions of idle samples.

use parking_lot::Mutex;
use std::sync::Arc;

pub const CHUNK_BITS: u32 = 20;
pub const CHUNK: usize = 1 << CHUNK_BITS;
const FAN_BITS: u32 = 5;
const LEVELS: usize = 4; // 32^4 == 2^20 == CHUNK

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Node {
    pub first: u16,
    pub last: u16,
    /// Bits that toggled between consecutive samples inside the range.
    pub mask: u16,
}

impl Node {
    #[inline]
    fn leaf(v: u16) -> Node {
        Node { first: v, last: v, mask: 0 }
    }
    #[inline]
    pub fn join(self, b: Node) -> Node {
        Node { first: self.first, last: b.last, mask: self.mask | b.mask | (self.last ^ b.first) }
    }
}

#[inline]
fn join_opt(a: Option<Node>, b: Node) -> Option<Node> {
    Some(match a {
        Some(a) => a.join(b),
        None => b,
    })
}

#[derive(Clone)]
pub struct Chunk {
    unitsize: usize,
    len: usize,
    data: Vec<u8>,
    /// levels[l] summarises spans of 32^(l+1) samples.
    levels: [Vec<Node>; LEVELS],
}

impl Chunk {
    fn new(unitsize: usize) -> Chunk {
        Chunk {
            unitsize,
            len: 0,
            data: Vec::with_capacity(CHUNK * unitsize),
            levels: std::array::from_fn(|l| Vec::with_capacity(CHUNK >> (FAN_BITS as usize * (l + 1)))),
        }
    }

    #[inline]
    pub fn get(&self, i: usize) -> u16 {
        if self.unitsize == 1 {
            self.data[i] as u16
        } else {
            u16::from_le_bytes([self.data[2 * i], self.data[2 * i + 1]])
        }
    }

    pub fn len(&self) -> usize {
        self.len
    }

    /// Append raw bytes; returns how many samples were consumed.
    fn append(&mut self, bytes: &[u8]) -> usize {
        let room = CHUNK - self.len;
        let n = (bytes.len() / self.unitsize).min(room);
        if n == 0 {
            return 0;
        }
        let old = self.len;
        self.data.extend_from_slice(&bytes[..n * self.unitsize]);
        self.len += n;
        self.rebuild(old, self.len);
        n
    }

    fn raw_node(&self, a: usize, b: usize) -> Node {
        let mut prev = self.get(a);
        let first = prev;
        let mut mask = 0u16;
        if self.unitsize == 1 {
            for &v in &self.data[a + 1..b] {
                mask |= prev ^ v as u16;
                prev = v as u16;
            }
        } else {
            for i in a + 1..b {
                let v = self.get(i);
                mask |= prev ^ v;
                prev = v;
            }
        }
        Node { first, last: prev, mask }
    }

    /// Recompute summary nodes touched by samples [old, new).
    fn rebuild(&mut self, old: usize, new: usize) {
        let mut lo = old;
        let mut hi = new; // exclusive, in units of the level below
        for l in 0..LEVELS {
            let shift = FAN_BITS;
            let first_node = lo >> shift;
            let last_node = (hi - 1) >> shift;
            let lvl_len = last_node + 1;
            if self.levels[l].len() < lvl_len {
                self.levels[l].resize(lvl_len, Node::default());
            }
            for j in first_node..=last_node {
                let a = j << shift;
                let b = ((j + 1) << shift).min(hi);
                let node = if l == 0 {
                    self.raw_node(a, b)
                } else {
                    let below = &self.levels[l - 1];
                    let mut n = below[a];
                    for c in &below[a + 1..b] {
                        n = n.join(*c);
                    }
                    n
                };
                self.levels[l][j] = node;
            }
            lo = first_node;
            hi = lvl_len;
        }
    }

    #[inline]
    fn span(level: usize) -> usize {
        1 << (FAN_BITS as usize * level)
    }

    /// Largest level (<= maxl) whose node starts at `pos` and is fully inside [.., hi).
    #[inline]
    fn best_level_fwd(pos: usize, hi: usize, maxl: usize) -> usize {
        let mut l = 0;
        while l < maxl {
            let s = Self::span(l + 1);
            if pos & (s - 1) != 0 || pos + s > hi {
                break;
            }
            l += 1;
        }
        l
    }

    #[inline]
    fn node(&self, level: usize, pos: usize) -> Node {
        if level == 0 {
            Node::leaf(self.get(pos))
        } else {
            self.levels[level - 1][pos >> (FAN_BITS as usize * level)]
        }
    }

    /// Summary of samples [a, b), local indices, a < b <= len.
    pub fn summary(&self, a: usize, b: usize) -> Node {
        let mut acc: Option<Node> = None;
        let mut pos = a;
        while pos < b {
            let l = Self::best_level_fwd(pos, b, LEVELS);
            if l == 0 {
                // Run of raw samples until the next aligned boundary.
                let end = ((pos | 31) + 1).min(b);
                acc = join_opt(acc, self.raw_node(pos, end));
                pos = end;
            } else {
                acc = join_opt(acc, self.node(l, pos));
                pos += Self::span(l);
            }
        }
        acc.unwrap()
    }

    /// First local i in [lo, len) where (s[i] ^ s[i-1]) & mask != 0.
    /// `prev` is the value of the sample before `lo`.
    fn find_fwd(&self, mask: u16, lo: usize, mut prev: u16) -> Option<usize> {
        let mut pos = lo;
        let mut maxl = LEVELS;
        while pos < self.len {
            let l = Self::best_level_fwd(pos, self.len, maxl);
            let n = self.node(l, pos);
            if ((n.first ^ prev) | n.mask) & mask == 0 {
                prev = n.last;
                pos += Self::span(l);
            } else if l == 0 {
                return Some(pos);
            } else {
                maxl = l - 1;
            }
        }
        None
    }

    /// Largest local i in [1, cur] with an edge between i-1 and i, where the
    /// value at index `cur` is `carry` (it may live in the next chunk).
    fn find_back(&self, mask: u16, cur: usize, mut carry: u16) -> Option<usize> {
        let mut cur = cur;
        let mut maxl = LEVELS;
        while cur > 0 {
            let mut l = 0;
            while l < maxl {
                let s = Self::span(l + 1);
                if cur & (s - 1) != 0 || cur < s {
                    break;
                }
                l += 1;
            }
            let start = cur - Self::span(l);
            let n = self.node(l, start);
            if ((n.last ^ carry) | n.mask) & mask == 0 {
                carry = n.first;
                cur = start;
            } else if l == 0 {
                return Some(cur);
            } else {
                maxl = l - 1;
            }
        }
        None
    }
}

#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct CaptureMeta {
    pub samplerate: u64,
    pub channels: usize,
    pub unitsize: usize,
    pub trigger: Option<u64>,
}

struct State {
    meta: CaptureMeta,
    chunks: Vec<Arc<Chunk>>,
    len: u64,
}

/// Shared, growable capture. Cheap to snapshot from any thread.
pub struct Capture {
    state: Mutex<State>,
}

impl Capture {
    pub fn new(samplerate: u64, channels: usize) -> Capture {
        let unitsize = if channels > 8 { 2 } else { 1 };
        Capture {
            state: Mutex::new(State {
                meta: CaptureMeta { samplerate, channels, unitsize, trigger: None },
                chunks: Vec::new(),
                len: 0,
            }),
        }
    }

    pub fn append(&self, mut bytes: &[u8]) {
        let mut st = self.state.lock();
        let unitsize = st.meta.unitsize;
        while bytes.len() >= unitsize {
            if st.chunks.last().map_or(true, |c| c.len == CHUNK) {
                st.chunks.push(Arc::new(Chunk::new(unitsize)));
            }
            // Clones the tail chunk only if a reader currently holds it.
            let n = Arc::make_mut(st.chunks.last_mut().unwrap()).append(bytes);
            st.len += n as u64;
            bytes = &bytes[n * unitsize..];
        }
    }

    pub fn set_trigger(&self, at: Option<u64>) {
        self.state.lock().meta.trigger = at;
    }

    pub fn snapshot(&self) -> Snapshot {
        let st = self.state.lock();
        Snapshot { meta: st.meta.clone(), chunks: st.chunks.clone(), len: st.len }
    }

    pub fn len(&self) -> u64 {
        self.state.lock().len
    }
}

/// Immutable view of a capture at a point in time.
#[derive(Clone)]
pub struct Snapshot {
    pub meta: CaptureMeta,
    chunks: Vec<Arc<Chunk>>,
    pub len: u64,
}

impl Snapshot {
    pub fn empty() -> Snapshot {
        Snapshot { meta: CaptureMeta::default(), chunks: Vec::new(), len: 0 }
    }

    #[inline]
    pub fn get(&self, i: u64) -> u16 {
        self.chunks[(i >> CHUNK_BITS) as usize].get((i as usize) & (CHUNK - 1))
    }

    /// Summary of [a, b), clipped to the capture.
    pub fn summary(&self, a: u64, b: u64) -> Option<Node> {
        let b = b.min(self.len);
        if a >= b {
            return None;
        }
        let mut acc = None;
        let mut pos = a;
        while pos < b {
            let ci = (pos >> CHUNK_BITS) as usize;
            let base = (ci as u64) << CHUNK_BITS;
            let chunk = &self.chunks[ci];
            let la = (pos - base) as usize;
            let lb = ((b - base) as usize).min(chunk.len);
            acc = join_opt(acc, chunk.summary(la, lb));
            pos = base + lb as u64;
        }
        acc
    }

    /// Smallest i > from with (s[i] ^ s[i-1]) & mask != 0.
    pub fn next_change(&self, mask: u16, from: u64) -> Option<u64> {
        let start = from + 1;
        if start >= self.len {
            return None;
        }
        let mut prev = self.get(from);
        let mut ci = (start >> CHUNK_BITS) as usize;
        let mut lo = (start as usize) & (CHUNK - 1);
        while ci < self.chunks.len() {
            let c = &self.chunks[ci];
            if let Some(i) = c.find_fwd(mask, lo, prev) {
                return Some(((ci as u64) << CHUNK_BITS) + i as u64);
            }
            prev = c.get(c.len - 1);
            lo = 0;
            ci += 1;
        }
        None
    }

    /// Largest i <= from (i >= 1) with (s[i] ^ s[i-1]) & mask != 0.
    pub fn prev_change(&self, mask: u16, from: u64) -> Option<u64> {
        if self.len == 0 {
            return None;
        }
        let from = from.min(self.len - 1);
        let mut carry = self.get(from);
        let mut ci = (from >> CHUNK_BITS) as isize;
        let mut cur = (from as usize) & (CHUNK - 1);
        while ci >= 0 {
            let c = &self.chunks[ci as usize];
            if let Some(i) = c.find_back(mask, cur, carry) {
                return Some(((ci as u64) << CHUNK_BITS) + i as u64);
            }
            carry = c.get(0);
            ci -= 1;
            if ci >= 0 {
                cur = self.chunks[ci as usize].len; // checks the pair across the boundary too
            }
        }
        None
    }

    /// First and last transition of the burst at `sample`: a run of transitions
    /// whose consecutive gaps are all < `max_gap`. The pointer may be up to
    /// `tolerance` samples outside the burst (clamped below `max_gap`, so the
    /// nearest transition decides). A lone transition is not a burst.
    /// Each end stops extending after `budget` steps.
    pub fn burst_at(&self, mask: u16, sample: u64, max_gap: u64, tolerance: u64, budget: usize) -> Option<(u64, u64)> {
        if self.len == 0 || max_gap < 2 {
            return None;
        }
        let tolerance = tolerance.min(max_gap - 1);
        let near = |a: u64, b: u64| b - a < max_gap;
        let p = self.prev_change(mask, sample);
        let n = self.next_change(mask, sample);
        // A neighbouring pair of transitions to grow from.
        let (mut first, mut last) = match (p, n) {
            (Some(p), Some(n)) if near(p, n) => (p, n),
            _ => {
                let left = p
                    .filter(|&p| sample - p <= tolerance)
                    .and_then(|p| self.prev_change(mask, p - 1).filter(|&q| near(q, p)).map(|q| (sample - p, q, p)));
                let right = n
                    .filter(|&n| n - sample <= tolerance)
                    .and_then(|n| self.next_change(mask, n).filter(|&r| near(n, r)).map(|r| (n - sample, n, r)));
                match (left, right) {
                    (Some(l), Some(r)) => if l.0 <= r.0 { (l.1, l.2) } else { (r.1, r.2) },
                    (Some(l), None) => (l.1, l.2),
                    (None, Some(r)) => (r.1, r.2),
                    (None, None) => return None,
                }
            }
        };
        // Grow each end by jumping to the furthest transition within max_gap.
        for _ in 0..budget {
            match self.prev_change(mask, last + max_gap - 1) {
                Some(e) if e > last => last = e,
                _ => break,
            }
        }
        for _ in 0..budget {
            match self.next_change(mask, first.saturating_sub(max_gap)) {
                Some(e) if e < first => first = e,
                _ => break,
            }
        }
        Some((first, last))
    }

    /// Per-pixel (first, mask) pairs for `width` pixels starting at sample
    /// `start`, `spp` samples per pixel. Each pixel's range includes the first
    /// sample of the next pixel so boundary transitions are not lost.
    /// Pixels outside the capture get mask 0 and first 0.
    pub fn render(&self, start: f64, spp: f64, width: usize) -> Vec<u16> {
        let mut out = vec![0u16; width * 2];
        let len = self.len as f64;
        for px in 0..width {
            let a = (start + px as f64 * spp).floor();
            let b = (start + (px + 1) as f64 * spp).floor();
            if b < 0.0 || a >= len {
                continue;
            }
            let a = a.max(0.0) as u64;
            let b = (b.max(a as f64 + 1.0) as u64 + 1).min(self.len);
            if let Some(n) = self.summary(a, b) {
                out[px * 2] = n.first;
                out[px * 2 + 1] = n.mask;
            }
        }
        out
    }

    pub fn samples(&self, start: u64, count: u64) -> Vec<u16> {
        let end = (start + count).min(self.len);
        (start.min(end)..end).map(|i| self.get(i)).collect()
    }

    /// Iterate raw byte slices covering [0, len), chunk by chunk.
    pub fn raw_chunks(&self) -> impl Iterator<Item = &[u8]> {
        let unit = self.meta.unitsize;
        self.chunks.iter().map(move |c| &c.data[..c.len * unit])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cap_from(samples: &[u8]) -> Snapshot {
        let c = Capture::new(1_000_000, 8);
        for part in samples.chunks(77_777) {
            c.append(part);
        }
        c.snapshot()
    }

    fn lcg(seed: &mut u64) -> u64 {
        *seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        *seed >> 33
    }

    #[test]
    fn summary_matches_brute_force() {
        let mut seed = 7;
        // Sparse toggles so higher levels are exercised.
        let mut v = 0u8;
        let data: Vec<u8> = (0..(CHUNK * 2 + 12345))
            .map(|_| {
                if lcg(&mut seed) % 5000 == 0 {
                    v ^= 1 << (lcg(&mut seed) % 8);
                }
                v
            })
            .collect();
        let s = cap_from(&data);
        assert_eq!(s.len as usize, data.len());
        for _ in 0..300 {
            let a = lcg(&mut seed) as usize % data.len();
            let b = a + 1 + lcg(&mut seed) as usize % (data.len() - a);
            let mut mask = 0u8;
            for w in data[a..b].windows(2) {
                mask |= w[0] ^ w[1];
            }
            let n = s.summary(a as u64, b as u64).unwrap();
            assert_eq!(n.first, data[a] as u16);
            assert_eq!(n.last, data[b - 1] as u16);
            assert_eq!(n.mask, mask as u16, "range {a}..{b}");
        }
    }

    #[test]
    fn edge_search_matches_brute_force() {
        let mut seed = 99;
        let mut v = 0u8;
        let data: Vec<u8> = (0..(CHUNK + CHUNK / 2))
            .map(|_| {
                if lcg(&mut seed) % 20000 == 0 {
                    v ^= 1 << (lcg(&mut seed) % 3);
                }
                v
            })
            .collect();
        // Force an edge exactly at a chunk boundary.
        let mut data = data;
        let flip = data[CHUNK - 1] ^ 4;
        for x in &mut data[CHUNK..] {
            *x = (*x & !4) | (flip & 4);
        }
        let s = cap_from(&data);
        for mask in [1u16, 2, 4, 7] {
            for _ in 0..200 {
                let from = lcg(&mut seed) % data.len() as u64;
                let brute_next = (from as usize + 1..data.len())
                    .find(|&i| (data[i] ^ data[i - 1]) as u16 & mask != 0)
                    .map(|i| i as u64);
                assert_eq!(s.next_change(mask, from), brute_next, "next from {from} mask {mask}");
                let brute_prev = (1..=from as usize)
                    .rev()
                    .find(|&i| (data[i] ^ data[i - 1]) as u16 & mask != 0)
                    .map(|i| i as u64);
                assert_eq!(s.prev_change(mask, from), brute_prev, "prev from {from} mask {mask}");
            }
        }
        assert_eq!(s.next_change(4, CHUNK as u64 - 1), Some(CHUNK as u64));
        assert_eq!(s.prev_change(4, CHUNK as u64), Some(CHUNK as u64));
    }

    /// Reference burst search over a plain edge list.
    fn brute_burst(edges: &[u64], sample: u64, max_gap: u64, tol: u64) -> Option<(u64, u64)> {
        let mut runs = Vec::new();
        let mut i = 0;
        while i < edges.len() {
            let mut j = i;
            while j + 1 < edges.len() && edges[j + 1] - edges[j] < max_gap {
                j += 1;
            }
            if j > i {
                runs.push((edges[i], edges[j]));
            }
            i = j + 1;
        }
        let dist = |&(a, b): &(u64, u64)| if sample < a { a - sample } else { sample.saturating_sub(b) };
        let mut best: Option<(u64, u64)> = None;
        for r in runs {
            let d = dist(&r);
            if d <= tol && best.map_or(true, |b| d < dist(&b)) {
                best = Some(r);
            }
        }
        best
    }

    #[test]
    fn burst_matches_brute_force() {
        let mut seed = 5;
        let mut v = 0u8;
        // Bursts of fast toggles on bit 0 separated by long idle stretches; noise on bit 1.
        let mut in_burst = false;
        let data: Vec<u8> = (0..(CHUNK + CHUNK / 4))
            .map(|_| {
                if lcg(&mut seed) % if in_burst { 3000 } else { 20_000 } == 0 {
                    in_burst = !in_burst;
                }
                if lcg(&mut seed) % if in_burst { 40 } else { 200_000 } == 0 {
                    v ^= 1;
                }
                if lcg(&mut seed) % 50 == 0 {
                    v ^= 2;
                }
                v
            })
            .collect();
        let edges: Vec<u64> = (1..data.len()).filter(|&i| (data[i] ^ data[i - 1]) & 1 != 0).map(|i| i as u64).collect();
        let s = cap_from(&data);
        let mut hits = 0;
        for _ in 0..2000 {
            // Bias pointers towards edges so the tolerance and gap cases are exercised.
            let e = edges[lcg(&mut seed) as usize % edges.len()];
            let sample = (e + lcg(&mut seed) % 400).saturating_sub(200).min(data.len() as u64 - 1);
            let max_gap = 2 + lcg(&mut seed) % 300;
            let tol = lcg(&mut seed) % max_gap;
            let want = brute_burst(&edges, sample, max_gap, tol);
            hits += want.is_some() as usize;
            assert_eq!(s.burst_at(1, sample, max_gap, tol, usize::MAX), want, "sample {sample} gap {max_gap} tol {tol}");
        }
        assert!(hits > 500, "too few bursts exercised: {hits}");
    }

    /// Idle, burst of 4 edges at 1000..1030, idle, lone edge at 5000, idle.
    fn simple_burst() -> Snapshot {
        let mut data = vec![0u8; 10_000];
        for (i, x) in data.iter_mut().enumerate() {
            let toggles = [1000, 1010, 1020, 1030, 5000].iter().filter(|&&t| i >= t).count();
            *x = (toggles % 2) as u8 | 2 * ((i / 7) % 2) as u8; // bit 1 toggles every 7 samples
        }
        cap_from(&data)
    }

    #[test]
    fn burst_cases() {
        let s = simple_burst();
        let b = Some((1000, 1030));
        assert_eq!(s.burst_at(1, 1010, 50, 0, 100), b, "on a transition");
        assert_eq!(s.burst_at(1, 1015, 50, 0, 100), b, "in a short gap");
        assert_eq!(s.burst_at(1, 3000, 50, 0, 100), None, "idle stretch");
        assert_eq!(s.burst_at(1, 995, 50, 5, 100), b, "within tolerance before");
        assert_eq!(s.burst_at(1, 1035, 50, 5, 100), b, "within tolerance after");
        assert_eq!(s.burst_at(1, 994, 50, 5, 100), None, "just outside tolerance");
        assert_eq!(s.burst_at(1, 5000, 50, 5, 100), None, "lone transition");
        assert_eq!(s.burst_at(1, 1015, 10, 0, 100), None, "gaps not shorter than max_gap");
        assert_eq!(s.burst_at(1, 1015, 11, 0, 100), b);
        assert_eq!(s.burst_at(1, 1015, 50, 0, 1), Some((1000, 1030)), "one jump covers the burst");
        assert_eq!(s.burst_at(2, 3000, 8, 0, 10_000), Some((7, 9996)), "other channel");
    }

    #[test]
    fn burst_at_capture_edges() {
        let data: Vec<u8> = (0..1000).map(|i| ((i / 3) % 2) as u8).collect();
        let s = cap_from(&data);
        assert_eq!(s.burst_at(1, 3, 5, 0, 1000), Some((3, 999)));
        assert_eq!(s.burst_at(1, 0, 5, 0, 1000), None, "before the first transition");
        assert_eq!(s.burst_at(1, 999, 5, 0, 1000), Some((3, 999)));
        assert_eq!(s.burst_at(1, 5000, 5, 0, 1000), None, "past the end");
        assert_eq!(Snapshot::empty().burst_at(1, 0, 5, 0, 1000), None);
    }

    #[test]
    fn burst_stops_at_budget() {
        // A clock toggling every 4 samples for the whole capture.
        let data: Vec<u8> = (0..100_000).map(|i| ((i / 4) % 2) as u8).collect();
        let s = cap_from(&data);
        let (a, b) = s.burst_at(1, 50_000, 10, 0, 3).unwrap();
        assert!(a < 50_000 && a > 49_900 && b > 50_000 && b < 50_100, "{a}..{b}");
        assert_eq!(s.burst_at(1, 50_000, 10, 0, usize::MAX), Some((4, 99_996)));
    }
}
