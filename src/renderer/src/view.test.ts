import { describe, expect, it } from 'vitest'
import { annotationAt, clampViewTo, frameRange, viewPath } from './view'

describe('clampViewTo', () => {
  it('leaves a view within limits unchanged', () => {
    expect(clampViewTo(100, 2, 10_000, 1000)).toEqual({ start: 100, spp: 2 })
  })

  it('limits zoom-in to 64 px per sample', () => {
    expect(clampViewTo(0, 1 / 1000, 10_000, 1000).spp).toBe(1 / 64)
  })

  it('limits zoom-out to 4x the capture', () => {
    expect(clampViewTo(0, 1000, 10_000, 1000).spp).toBe(40)
  })

  it('keeps at least half the view on the capture', () => {
    expect(clampViewTo(-5000, 2, 10_000, 1000).start).toBe(-1000)
    expect(clampViewTo(50_000, 2, 10_000, 1000).start).toBe(9000)
  })

  it('treats an empty capture as one sample', () => {
    expect(clampViewTo(0, 1, 0, 100).spp).toBe(0.04)
  })
})

describe('frameRange', () => {
  it('centres the range', () => {
    const v = frameRange(1000, 2000, 800)
    const mid = v.start + 400 * v.spp
    expect(mid).toBeCloseTo(1500)
  })

  it('spans 90% of the plot width', () => {
    const v = frameRange(1000, 2000, 800)
    expect((2000 - 1000) / v.spp).toBeCloseTo(720)
    expect((1000 - v.start) / v.spp).toBeCloseTo(40)
  })

  it('stops at 64 px per sample for a 1-sample range, still centred', () => {
    const v = frameRange(500, 501, 800)
    expect(v.spp).toBe(1 / 64)
    expect(v.start + 400 * v.spp).toBeCloseTo(500.5)
  })
})

describe('annotationAt', () => {
  const anns = [
    { start: 100, end: 200, text: 'a' },
    { start: 300, end: 400, text: 'b' }
  ]

  it('finds the annotation covering the sample', () => {
    expect(annotationAt(anns, 150, 0)?.text).toBe('a')
    expect(annotationAt(anns, 300, 0)?.text).toBe('b')
  })

  it('returns null between annotations', () => {
    expect(annotationAt(anns, 250, 10)).toBeNull()
  })

  it('accepts a hit exactly at the tolerance edge, not beyond', () => {
    expect(annotationAt(anns, 205, 5)?.text).toBe('a')
    expect(annotationAt(anns, 206, 5)).toBeNull()
  })

  it('prefers the nearer annotation when tolerances overlap', () => {
    expect(annotationAt(anns, 240, 60)?.text).toBe('a')
    expect(annotationAt(anns, 290, 100)?.text).toBe('b')
  })

  it('returns a merged dense block as a whole', () => {
    const block = { start: 1000, end: 9000, text: '' }
    expect(annotationAt([block], 5000, 0)).toBe(block)
  })
})

describe('viewPath', () => {
  const W = 1000
  const close = (a: { start: number; spp: number }, b: { start: number; spp: number }) => {
    expect(a.start).toBeCloseTo(b.start, 3)
    expect(a.spp).toBeCloseTo(b.spp, 6)
  }

  it('starts and ends at the given views', () => {
    const a = { start: 0, spp: 2000 }
    const b = { start: 1_500_000, spp: 0.5 }
    const p = viewPath(a, b, W)
    close(p.at(0), a)
    close(p.at(1), b)
  })

  it('zooms about the shared centre without panning', () => {
    const p = viewPath({ start: 0, spp: 10 }, { start: 4500, spp: 1 }, W)
    for (const t of [0.25, 0.5, 0.75]) {
      const v = p.at(t)
      expect(v.start + (v.spp * W) / 2).toBeCloseTo(5000, 6)
    }
  })

  it('zooms out on the way for a long pan', () => {
    const a = { start: 0, spp: 1 }
    const b = { start: 1_000_000, spp: 1 }
    const mid = viewPath(a, b, W).at(0.5)
    expect(mid.spp).toBeGreaterThan(10)
  })

  it('zooms out past both ends when panning far while zooming in', () => {
    const a = { start: 0, spp: 2000 }
    const b = { start: 500_000_000, spp: 0.5 }
    const mid = viewPath(a, b, W).at(0.5)
    expect(mid.spp).toBeGreaterThan(2000)
  })

  it('has zero length when the views match', () => {
    expect(viewPath({ start: 5, spp: 2 }, { start: 5, spp: 2 }, W).length).toBe(0)
  })
})
