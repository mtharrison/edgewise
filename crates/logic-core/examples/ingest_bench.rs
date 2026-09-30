//! Ingest benchmark: feeds 10 s of 24 MHz, 8-channel data through the real
//! `Feeder` and `Capture` in 480 KB blocks while another thread snapshots and
//! renders at 60 Hz, and reports throughput and the slowest single push.
//!
//! Run with `cargo run --release --example ingest_bench -p logic-core`.

use logic_core::capture::Capture;
use logic_core::trigger::{Condition, Feeder, TriggerTerm};
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering::Relaxed};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Counts live heap bytes so the peak around the trigger push can be read.
struct Counting;

static LIVE: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        let p = System.alloc(l);
        if !p.is_null() {
            let now = LIVE.fetch_add(l.size(), Relaxed) + l.size();
            PEAK.fetch_max(now, Relaxed);
        }
        p
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        LIVE.fetch_sub(l.size(), Relaxed);
        System.dealloc(p, l)
    }
    unsafe fn realloc(&self, p: *mut u8, l: Layout, size: usize) -> *mut u8 {
        let q = System.realloc(p, l, size);
        if !q.is_null() {
            if size > l.size() {
                let now = LIVE.fetch_add(size - l.size(), Relaxed) + size - l.size();
                PEAK.fetch_max(now, Relaxed);
            } else {
                LIVE.fetch_sub(l.size() - size, Relaxed);
            }
        }
        q
    }
}

#[global_allocator]
static ALLOC: Counting = Counting;

const RATE: u64 = 24_000_000;
const SECONDS: u64 = 10;
const BLOCK: usize = 480 * 1000;
struct Case {
    name: &'static str,
    /// Pre-trigger fraction of the sample limit; `None` for no trigger.
    pre: Option<f64>,
    /// Sample where D7 rises.
    trigger_at: u64,
}

fn run(case: &Case) {
    let limit = SECONDS * RATE;
    let cap = Arc::new(Capture::new(RATE, 8));
    let terms = match case.pre {
        Some(_) => vec![TriggerTerm { channel: 7, condition: Condition::Rising }],
        None => vec![],
    };
    let mut feeder = Feeder::new(cap.clone(), 1, limit, &terms, case.pre.unwrap_or(0.0), 0);

    // A 1 MHz clock on D0, a slower counter on D1-D3; D7 goes high at 5 s.
    let base: Vec<u8> = (0..BLOCK).map(|i| ((i / 12) & 1) as u8 | (((i / 1000) & 7) << 1) as u8).collect();

    let done = Arc::new(AtomicBool::new(false));
    let renders = {
        let (cap, done) = (cap.clone(), done.clone());
        std::thread::spawn(move || {
            let mut n = 0u32;
            while !done.load(Relaxed) {
                let s = cap.snapshot();
                std::hint::black_box(s.render(0.0, s.len as f64 / 1600.0, 1600));
                n += 1;
                std::thread::sleep(Duration::from_millis(16));
            }
            n
        })
    };

    let mut block = base.clone();
    let mut fed = 0u64;
    let mut busy = Duration::ZERO;
    let mut slowest = Duration::ZERO;
    let mut trigger_push = None;
    let mut trigger_peak = 0;
    loop {
        block.copy_from_slice(&base);
        if fed + BLOCK as u64 > case.trigger_at {
            let from = case.trigger_at.saturating_sub(fed) as usize;
            for x in &mut block[from..] {
                *x |= 0x80;
            }
        }
        let armed = feeder.armed();
        let before = LIVE.load(Relaxed);
        PEAK.store(before, Relaxed);
        let t = Instant::now();
        let more = feeder.push(&block);
        let dt = t.elapsed();
        if armed && !feeder.armed() {
            trigger_push = Some(dt);
            trigger_peak = PEAK.load(Relaxed);
        }
        busy += dt;
        slowest = slowest.max(dt);
        fed += BLOCK as u64;
        if !more {
            break;
        }
    }
    done.store(true, Relaxed);
    let renders = renders.join().unwrap();

    let mb = |b: usize| b as f64 / (1 << 20) as f64;
    let s = cap.snapshot();
    println!("{}:", case.name);
    println!("  fed {:.1} s of signal, captured {} samples, {} renders", fed as f64 / RATE as f64, s.len, renders);
    println!("  throughput   {:.0} MB/s ({:.1}x real time)", fed as f64 / busy.as_secs_f64() / 1e6, fed as f64 / RATE as f64 / busy.as_secs_f64());
    println!("  slowest push {:.2} ms", slowest.as_secs_f64() * 1e3);
    if let Some(dt) = trigger_push {
        let kept = s.meta.trigger.unwrap_or(0);
        println!("  trigger push {:.2} ms, kept {} pre-trigger samples ({:.0} MB)", dt.as_secs_f64() * 1e3, kept, mb(kept as usize));
        println!("  peak heap during the trigger push {:.0} MB", mb(trigger_peak));
    }
}

fn main() {
    for case in [
        Case { name: "no trigger", pre: None, trigger_at: u64::MAX },
        Case { name: "trigger at 5 s, 30% pre-trigger", pre: Some(0.3), trigger_at: 5 * RATE },
        Case { name: "trigger at 5 s, 90% pre-trigger", pre: Some(0.9), trigger_at: 5 * RATE },
        // The 9 s (216 MB) pre-trigger buffer has filled before the trigger.
        Case { name: "trigger at 9.5 s, 90% pre-trigger", pre: Some(0.9), trigger_at: 9 * RATE + RATE / 2 },
    ] {
        run(&case);
    }
}
