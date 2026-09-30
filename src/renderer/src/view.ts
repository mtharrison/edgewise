// Pure view maths, kept free of store and bridge imports so it can be unit tested.

export interface ViewRange {
  start: number
  spp: number
}

/** Fraction of the plot width a framed range spans; the rest is split as margins. */
export const FRAME_SPAN = 0.9

/** Clamps zoom to 1/64..4× the capture and keeps at least half the view on the capture. */
export function clampViewTo(start: number, spp: number, samples: number, plotWidth: number): ViewRange {
  const n = Math.max(samples, 1)
  spp = Math.min(Math.max(spp, 1 / 64), (n / plotWidth) * 4)
  const visible = spp * plotWidth
  start = Math.min(Math.max(start, -visible * 0.5), n - visible * 0.5)
  return { start, spp }
}

/** View that centres [start, end] and spans FRAME_SPAN of the plot width (before clamping). */
export function frameRange(start: number, end: number, plotWidth: number): ViewRange {
  const spp = Math.max(end - start, 0) / (plotWidth * FRAME_SPAN)
  const clamped = Math.max(spp, 1 / 64)
  return { start: (start + end) / 2 - (plotWidth / 2) * clamped, spp: clamped }
}

/** The annotation (or merged block) covering `sample`, within `tolerance` samples; the nearest wins. */
export function annotationAt<T extends { start: number; end: number }>(anns: T[], sample: number, tolerance: number): T | null {
  let best: T | null = null
  let bestDist = Infinity
  for (const a of anns) {
    const dist = sample < a.start ? a.start - sample : sample > a.end ? sample - a.end : 0
    if (dist <= tolerance && dist < bestDist) {
      best = a
      bestDist = dist
      if (dist === 0) break
    }
  }
  return best
}

const RHO = Math.SQRT2

/**
 * Smooth zoom-and-pan path from `a` to `b` (van Wijk & Nuij, "Smooth and efficient zooming
 * and panning"). A long pan zooms out on the way so both ends stay in sight. `at(t)` gives the
 * view `t` (0..1) along the path; `length` is its perceived length, used to pick a duration.
 */
export function viewPath(a: ViewRange, b: ViewRange, plotWidth: number) {
  const w0 = a.spp * plotWidth
  const w1 = b.spp * plotWidth
  const c0 = a.start + w0 / 2
  const dx = b.start + w1 / 2 - c0
  const toView = (center: number, width: number): ViewRange => ({ start: center - width / 2, spp: width / plotWidth })

  if (Math.abs(dx) < 1e-9 * Math.max(w0, w1)) {
    const length = Math.log(w1 / w0) / RHO
    return { length: Math.abs(length), at: (t: number) => toView(c0 + t * dx, w0 * Math.exp(RHO * t * length)) }
  }
  const d = Math.abs(dx)
  const r = (w: number, sign: number) => {
    const bb = (w1 * w1 - w0 * w0 + sign * RHO ** 4 * d * d) / (2 * w * RHO ** 2 * d)
    return Math.log(Math.sqrt(bb * bb + 1) - bb)
  }
  const r0 = r(w0, 1)
  const length = (r(w1, -1) - r0) / RHO
  return {
    length,
    at: (t: number) => {
      const s = t * length
      const u = (w0 / (RHO ** 2 * d)) * (Math.cosh(r0) * Math.tanh(RHO * s + r0) - Math.sinh(r0))
      return toView(c0 + u * dx, (w0 * Math.cosh(r0)) / Math.cosh(RHO * s + r0))
    }
  }
}
