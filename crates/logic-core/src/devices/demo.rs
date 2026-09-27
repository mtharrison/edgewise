//! Synthetic device streaming UART, I2C, SPI and PWM in real time.

use super::{DeviceInfo, Driver};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

pub const ID: &str = "demo";
const LOOP_SECS: f64 = 0.02;

pub fn info() -> DeviceInfo {
    DeviceInfo {
        id: ID.into(),
        name: "Demo device".into(),
        driver: "demo".into(),
        channels: 8,
        samplerates: vec![4_000_000, 8_000_000, 10_000_000, 20_000_000, 25_000_000, 50_000_000, 100_000_000],
        default_samplerate: 20_000_000,
        note: Some("UART D0 · I²C D1/D2 · SPI D3–D6 · PWM D7".into()),
        missing_firmware: None,
    }
}

pub struct Demo;

/// Level changes per channel: (time in seconds, new level).
struct Wave {
    edges: [Vec<(f64, bool)>; 8],
}

impl Wave {
    fn set(&mut self, ch: usize, t: f64, v: bool) {
        self.edges[ch].push((t, v));
    }

    fn uart(&mut self, ch: usize, mut t: f64, baud: f64, msg: &[u8]) {
        let bt = 1.0 / baud;
        for &b in msg {
            self.set(ch, t, false);
            for i in 0..8 {
                self.set(ch, t + bt * (1 + i) as f64, b >> i & 1 == 1);
            }
            self.set(ch, t + bt * 9.0, true);
            t += bt * 11.0;
        }
    }

    /// I2C transaction: list of (is_read_addr, bytes) segments joined with repeated starts.
    fn i2c(&mut self, scl: usize, sda: usize, mut t: f64, hz: f64, segments: &[&[u8]], nack_last: bool) {
        let q = 1.0 / hz / 4.0;
        let mut total = 0usize;
        let count: usize = segments.iter().map(|s| s.len()).sum();
        for seg in segments {
            // (Repeated) start: SDA high, SCL high, SDA low, SCL low.
            self.set(sda, t, true);
            self.set(scl, t + q, true);
            self.set(sda, t + 2.0 * q, false);
            self.set(scl, t + 3.0 * q, false);
            t += 4.0 * q;
            for &b in seg.iter() {
                for bit in (0..8).rev() {
                    self.set(sda, t + q, b >> bit & 1 == 1);
                    self.set(scl, t + 2.0 * q, true);
                    self.set(scl, t + 4.0 * q, false);
                    t += 4.0 * q;
                }
                total += 1;
                // ACK low, except the master NACKs the final read byte.
                let nack = nack_last && total == count;
                self.set(sda, t + q, nack);
                self.set(scl, t + 2.0 * q, true);
                self.set(scl, t + 4.0 * q, false);
                t += 4.0 * q;
            }
        }
        self.set(sda, t + q, false);
        self.set(scl, t + 2.0 * q, true);
        self.set(sda, t + 3.0 * q, true);
    }

    fn spi(&mut self, pins: [usize; 4], mut t: f64, hz: f64, tx: &[u8], rx: &[u8]) {
        let [clk, mosi, miso, cs] = pins;
        let h = 0.5 / hz;
        self.set(cs, t, false);
        t += h * 2.0;
        for (a, b) in tx.iter().zip(rx) {
            for bit in (0..8).rev() {
                self.set(mosi, t, a >> bit & 1 == 1);
                self.set(miso, t, b >> bit & 1 == 1);
                self.set(clk, t + h, true);
                self.set(clk, t + 2.0 * h, false);
                t += 2.0 * h;
            }
            t += h * 2.0;
        }
        self.set(cs, t + h, true);
    }

    fn render(mut self, rate: u64) -> Vec<u8> {
        let n = (LOOP_SECS * rate as f64) as usize;
        let mut out = vec![0u8; n];
        for (ch, edges) in self.edges.iter_mut().enumerate() {
            edges.sort_by(|a, b| a.0.total_cmp(&b.0));
            let mut level = matches!(ch, 0 | 1 | 2 | 6); // idle-high lines
            let mut k = 0;
            for (i, s) in out.iter_mut().enumerate() {
                let t = i as f64 / rate as f64;
                while k < edges.len() && edges[k].0 <= t {
                    level = edges[k].1;
                    k += 1;
                }
                *s |= (level as u8) << ch;
            }
        }
        out
    }
}

fn pattern(rate: u64) -> Vec<u8> {
    let mut w = Wave { edges: Default::default() };
    w.uart(0, 0.0010, 115_200.0, b"Hello from Edgewise!\r\n");
    w.uart(0, 0.0120, 115_200.0, b"temp=23.5C\r\n");
    w.i2c(1, 2, 0.0040, 400_000.0, &[&[0xA0, 0x10, 0xDE, 0xAD]], false);
    w.i2c(1, 2, 0.0065, 400_000.0, &[&[0xA0, 0x10], &[0xA1, 0xBE, 0xEF]], true);
    w.spi([3, 4, 5, 6], 0.0090, 2_000_000.0, &[0x9F, 0, 0, 0], &[0xFF, 0xEF, 0x40, 0x18]);
    w.spi([3, 4, 5, 6], 0.0160, 2_000_000.0, &[0x03, 0x00, 0x10, 0x00, 0, 0], &[0xFF; 6]);
    // PWM at 10 kHz with a duty sweep.
    let period = 1e-4;
    for i in 0..(LOOP_SECS / period) as usize {
        let t = i as f64 * period;
        let duty = 0.1 + 0.8 * (i as f64 / (LOOP_SECS / period));
        w.set(7, t, true);
        w.set(7, t + period * duty, false);
    }
    w.render(rate)
}

impl Driver for Demo {
    fn channels(&self) -> usize {
        8
    }

    fn acquire(
        &mut self,
        rate: u64,
        sink: &mut dyn FnMut(&[u8]) -> bool,
        stop: &AtomicBool,
        _progress: &dyn Fn(&str),
    ) -> Result<(), String> {
        let buf = pattern(rate);
        let chunk = ((rate / 100) as usize).max(1); // 10 ms
        let t0 = Instant::now();
        let mut sent = 0u64;
        let mut pos = 0usize;
        let mut tmp = Vec::with_capacity(chunk);
        while !stop.load(Ordering::Relaxed) {
            tmp.clear();
            while tmp.len() < chunk {
                let take = (chunk - tmp.len()).min(buf.len() - pos);
                tmp.extend_from_slice(&buf[pos..pos + take]);
                pos = (pos + take) % buf.len();
            }
            if !sink(&tmp) {
                break;
            }
            sent += chunk as u64;
            let due = Duration::from_secs_f64(sent as f64 / rate as f64);
            if let Some(wait) = due.checked_sub(t0.elapsed()) {
                std::thread::sleep(wait);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture::Capture;
    use crate::decoders::*;

    #[test]
    fn demo_pattern_decodes() {
        let rate = 20_000_000;
        let cap = Capture::new(rate, 8);
        cap.append(&pattern(rate));
        let s = cap.snapshot();
        let no = AtomicBool::new(false);
        let text = |cfg: DecoderConfig, row: usize| -> Vec<String> {
            cfg.decode(&s, &no)[row].iter().map(|a| a.text.clone()).collect()
        };
        let uart = text(DecoderConfig::Uart(UartConfig { format: Format::Ascii, ..Default::default() }), 0);
        assert_eq!(uart[..5].join(""), "'H''e''l''l''o'");
        let i2c = text(DecoderConfig::I2c(I2cConfig { scl: 1, sda: 2, format: Format::Hex }), 0);
        assert_eq!(i2c, ["Write 0x50", "0x10", "0xDE", "0xAD", "Write 0x50", "0x10", "Read 0x50", "0xBE", "0xEF"]);
        let spi = SpiConfig { clk: 3, mosi: Some(4), miso: Some(5), cs: Some(6), ..Default::default() };
        let miso = text(DecoderConfig::Spi(spi), 1);
        assert_eq!(miso[..4], ["0xFF", "0xEF", "0x40", "0x18"]);
    }
}
