const TIME_UNITS: [number, string][] = [
  [1, 's'],
  [1e-3, 'ms'],
  [1e-6, 'µs'],
  [1e-9, 'ns'],
  [1e-12, 'ps']
]

function trim(s: string) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

export function fmtTime(sec: number, sig = 4): string {
  if (!isFinite(sec)) return '—'
  const a = Math.abs(sec)
  if (a === 0) return '0 s'
  for (const [mult, unit] of TIME_UNITS) {
    if (a >= mult * 0.9999) {
      const v = sec / mult
      return `${trim(v.toPrecision(sig))} ${unit}`
    }
  }
  return `${trim((sec / 1e-12).toPrecision(sig))} ps`
}

/** Label for a ruler tick, with just enough decimals for the tick step. */
export function fmtTick(sec: number, step: number): string {
  const unit = TIME_UNITS.find(([m]) => step >= m * 0.9999) ?? TIME_UNITS[TIME_UNITS.length - 1]
  const v = sec / unit[0]
  const decimals = Math.max(0, Math.ceil(-Math.log10(step / unit[0]) - 1e-9))
  const s = v.toFixed(decimals)
  return `${s === '-0' ? '0' : s} ${unit[1]}`
}

export function fmtFreq(hz: number, sig = 4): string {
  if (!isFinite(hz) || hz <= 0) return '—'
  if (hz >= 1e9) return `${trim((hz / 1e9).toPrecision(sig))} GHz`
  if (hz >= 1e6) return `${trim((hz / 1e6).toPrecision(sig))} MHz`
  if (hz >= 1e3) return `${trim((hz / 1e3).toPrecision(sig))} kHz`
  return `${trim(hz.toPrecision(sig))} Hz`
}

export function fmtRate(hz: number): string {
  return fmtFreq(hz, 6).replace('Hz', 'S/s').replace(/^(\S+) S\/s$/, '$1 S/s')
}

export function fmtCount(n: number): string {
  if (n >= 1e9) return `${trim((n / 1e9).toFixed(2))}G`
  if (n >= 1e6) return `${trim((n / 1e6).toFixed(2))}M`
  if (n >= 1e3) return `${trim((n / 1e3).toFixed(1))}k`
  return String(n)
}

/** 1-2-5 sequence step at or above `x`. */
export function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)))
  const m = x / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}
