// Pure view maths, kept free of store and bridge imports so it can be unit tested.

export interface ViewRange {
  start: number
  spp: number
}

/** Fraction of the plot width a framed range spans; the rest is split as margins. */
export const FRAME_SPAN = 0.9

/** Empty time, in seconds, the view may show before the capture start and after its end. */
export const VIEW_MARGIN_S = 0.01

/**
 * Clamps zoom to 64 px per sample in and, out, to the capture plus VIEW_MARGIN_S either side, and
 * keeps the view within VIEW_MARGIN_S of the capture. A non-positive sample rate means no margin.
 */
export function clampViewTo(start: number, spp: number, samples: number, plotWidth: number, samplerate: number): ViewRange {
  const n = Math.max(samples, 1)
  const margin = samplerate > 0 ? VIEW_MARGIN_S * samplerate : 0
  spp = Math.min(Math.max(spp, 1 / 64), (n + 2 * margin) / plotWidth)
  const visible = spp * plotWidth
  start = Math.min(Math.max(start, -margin), n + margin - visible)
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
