//! sigrok session files (.sr) and VCD export.

use crate::capture::{Capture, Snapshot};
use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::path::Path;

fn rate_string(hz: u64) -> String {
    match hz {
        h if h >= 1_000_000_000 && h % 1_000_000_000 == 0 => format!("{} GHz", h / 1_000_000_000),
        h if h >= 1_000_000 && h % 1_000_000 == 0 => format!("{} MHz", h / 1_000_000),
        h if h >= 1_000 && h % 1_000 == 0 => format!("{} kHz", h / 1_000),
        h => format!("{h} Hz"),
    }
}

fn parse_rate(s: &str) -> Option<u64> {
    let s = s.trim().trim_end_matches("Hz").trim_end_matches("hz").trim();
    let (num, mult) = match s.chars().last()? {
        'k' | 'K' => (&s[..s.len() - 1], 1e3),
        'M' | 'm' => (&s[..s.len() - 1], 1e6),
        'G' | 'g' => (&s[..s.len() - 1], 1e9),
        _ => (s, 1.0),
    };
    Some((num.trim().parse::<f64>().ok()? * mult).round() as u64)
}

pub fn save_sr(snap: &Snapshot, names: &[String], path: &Path) -> Result<(), String> {
    let e = |err: &dyn std::fmt::Display| format!("Saving {}: {err}", path.display());
    let file = std::fs::File::create(path).map_err(|x| e(&x))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let ch = snap.meta.channels;
    let mut meta = format!(
        "[global]\nsigrok version=0.5.2\n\n[device 1]\ncapturefile=logic-1\ntotal probes={ch}\nsamplerate={}\ntotal analog=0\n",
        rate_string(snap.meta.samplerate)
    );
    for i in 0..ch {
        let name = names.get(i).cloned().unwrap_or_else(|| format!("D{i}"));
        meta += &format!("probe{}={}\n", i + 1, name);
    }
    meta += &format!("unitsize={}\n", snap.meta.unitsize);
    zip.start_file("version", opts).map_err(|x| e(&x))?;
    zip.write_all(b"2").map_err(|x| e(&x))?;
    zip.start_file("metadata", opts).map_err(|x| e(&x))?;
    zip.write_all(meta.as_bytes()).map_err(|x| e(&x))?;
    for (i, data) in snap.raw_chunks().enumerate() {
        zip.start_file(format!("logic-1-{}", i + 1), opts).map_err(|x| e(&x))?;
        zip.write_all(data).map_err(|x| e(&x))?;
    }
    zip.finish().map_err(|x| e(&x))?;
    Ok(())
}

pub fn load_sr(path: &Path) -> Result<(Capture, Vec<String>), String> {
    let e = |err: &dyn std::fmt::Display| format!("Opening {}: {err}", path.display());
    let file = std::fs::File::open(path).map_err(|x| e(&x))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|x| e(&x))?;
    let mut meta = String::new();
    zip.by_name("metadata").map_err(|x| e(&x))?.read_to_string(&mut meta).map_err(|x| e(&x))?;

    let mut kv = BTreeMap::new();
    let mut section = String::new();
    for line in meta.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            section = line.to_string();
        } else if let Some((k, v)) = line.split_once('=') {
            if section == "[device 1]" {
                kv.insert(k.trim().to_string(), v.trim().to_string());
            }
        }
    }
    let probes: usize = kv.get("total probes").and_then(|v| v.parse().ok()).unwrap_or(8);
    let unitsize: usize = kv.get("unitsize").and_then(|v| v.parse().ok()).unwrap_or(1);
    let rate = kv.get("samplerate").and_then(|v| parse_rate(v)).unwrap_or(1_000_000);
    let base = kv.get("capturefile").cloned().unwrap_or_else(|| "logic-1".into());
    let channels = probes.min(16);
    let names = (1..=channels).map(|i| kv.get(&format!("probe{i}")).cloned().unwrap_or_else(|| format!("D{}", i - 1))).collect();

    let mut parts: Vec<(u32, String)> = zip
        .file_names()
        .filter_map(|n| {
            if n == base {
                Some((0, n.to_string()))
            } else {
                n.strip_prefix(&format!("{base}-"))?.parse().ok().map(|i| (i, n.to_string()))
            }
        })
        .collect();
    parts.sort();

    let cap = Capture::new(rate, channels);
    let keep = if channels > 8 { 2 } else { 1 };
    let mut buf = Vec::new();
    for (_, name) in parts {
        buf.clear();
        zip.by_name(&name).map_err(|x| e(&x))?.read_to_end(&mut buf).map_err(|x| e(&x))?;
        if unitsize == keep {
            cap.append(&buf);
        } else {
            // Keep only the channels we store (first 8 or 16).
            let v: Vec<u8> = buf.chunks_exact(unitsize).flat_map(|s| s[..keep.min(unitsize)].to_vec()).collect();
            cap.append(&v);
        }
    }
    Ok((cap, names))
}

pub fn export_vcd(snap: &Snapshot, names: &[String], path: &Path) -> Result<(), String> {
    let e = |err: &dyn std::fmt::Display| format!("Exporting {}: {err}", path.display());
    let file = std::fs::File::create(path).map_err(|x| e(&x))?;
    let mut w = std::io::BufWriter::new(file);
    let ch = snap.meta.channels;
    let id = |i: usize| (b'!' + i as u8) as char;
    let mut hdr = String::from("$version Edgewise $end\n$timescale 1 ps $end\n$scope module logic $end\n");
    for i in 0..ch {
        let name = names.get(i).cloned().unwrap_or_else(|| format!("D{i}")).replace(' ', "_");
        hdr += &format!("$var wire 1 {} {} $end\n", id(i), name);
    }
    hdr += "$upscope $end\n$enddefinitions $end\n";
    w.write_all(hdr.as_bytes()).map_err(|x| e(&x))?;
    if snap.len == 0 {
        return Ok(());
    }
    let rate = snap.meta.samplerate.max(1) as u128;
    let all = if ch >= 16 { u16::MAX } else { (1u16 << ch) - 1 };
    let emit = |w: &mut std::io::BufWriter<std::fs::File>, i: u64, prev: Option<u16>, v: u16| {
        let t = i as u128 * 1_000_000_000_000 / rate;
        let mut s = format!("#{t}\n");
        for c in 0..ch {
            if prev.map_or(true, |p| (p ^ v) >> c & 1 == 1) {
                s += &format!("{}{}\n", v >> c & 1, id(c));
            }
        }
        w.write_all(s.as_bytes())
    };
    let mut prev = snap.get(0);
    emit(&mut w, 0, None, prev).map_err(|x| e(&x))?;
    let mut pos = 0;
    while let Some(i) = snap.next_change(all, pos) {
        let v = snap.get(i);
        emit(&mut w, i, Some(prev), v).map_err(|x| e(&x))?;
        prev = v;
        pos = i;
    }
    let t = snap.len as u128 * 1_000_000_000_000 / rate;
    writeln!(w, "#{t}").map_err(|x| e(&x))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sr_roundtrip() {
        let cap = Capture::new(24_000_000, 8);
        let data: Vec<u8> = (0..3_000_000u32).map(|i| (i / 7) as u8).collect();
        cap.append(&data);
        let dir = std::env::temp_dir().join("edgewise-test.sr");
        let names: Vec<String> = (0..8).map(|i| format!("ch{i}")).collect();
        save_sr(&cap.snapshot(), &names, &dir).unwrap();
        let (back, n2) = load_sr(&dir).unwrap();
        let s = back.snapshot();
        assert_eq!(n2, names);
        assert_eq!(s.meta.samplerate, 24_000_000);
        assert_eq!(s.len, data.len() as u64);
        assert_eq!(s.get(2_999_999), data[2_999_999] as u16);
        assert_eq!(parse_rate("500 kHz"), Some(500_000));
    }
}
