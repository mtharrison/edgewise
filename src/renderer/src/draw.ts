import { fmtTick, niceStep } from './format'
import { RULER_H, type Row } from './layout'
import type { View } from './store'
import { ANN, type Annotation, type Measurement } from './types'

export const THEME = {
  bg: '#0a0b0f',
  rowAlt: 'rgba(255,255,255,0.018)',
  grid: 'rgba(255,255,255,0.045)',
  gridMajor: 'rgba(255,255,255,0.08)',
  ruler: '#0f1116',
  rulerText: '#7d8394',
  border: 'rgba(255,255,255,0.07)',
  cursor: 'rgba(255,255,255,0.35)',
  markerA: '#22d3ee',
  markerB: '#ff9f43',
  trigger: '#ff5577',
  font: '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif',
  mono: '11px "SF Mono", "JetBrains Mono", ui-monospace, monospace'
}

const CLASS_COLORS: Record<number, string> = {
  [ANN.ADDRESS]: '#ffb020',
  [ANN.CONTROL]: '#4dabf7',
  [ANN.ACK]: '#37b24d',
  [ANN.WARN]: '#fd7e14',
  [ANN.ERROR]: '#f03e3e'
}

export interface Frame {
  view: View
  samplerate: number
  samples: number
  trigger: number | null
  rows: Row[]
  scrollY: number
  /** Either per-pixel (first, mask) pairs, or raw samples when zoomed in. */
  wave: { kind: 'lod'; data: Uint16Array; start: number; spp: number } | { kind: 'raw'; data: Uint16Array; first: number } | null
  annotations: Map<string, Annotation[]>
  markers: { a: number | null; b: number | null }
  hover: { sample: number; channel: number | null } | null
  measurement: Measurement | null
  hoverChannel: number | null
}

export function annKey(id: number, row: number) {
  return `${id}:${row}`
}

/** Draws one frame. Coordinates are CSS pixels; ctx is pre-scaled by DPR. */
export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, f: Frame) {
  const { view } = f
  const x = (s: number) => (s - view.start) / view.spp
  ctx.fillStyle = THEME.bg
  ctx.fillRect(0, 0, w, h)

  // Time grid.
  const origin = f.trigger ?? 0
  const secPerPx = view.spp / f.samplerate
  const step = niceStep(secPerPx * 120)
  const t0 = (view.start - origin) / f.samplerate
  const t1 = t0 + w * secPerPx
  const ticks: number[] = []
  for (let t = Math.floor(t0 / step) * step; t <= t1 + step; t += step) ticks.push(t)
  const tx = (t: number) => x(t * f.samplerate + origin)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, RULER_H, w, h - RULER_H)
  ctx.clip()
  ctx.translate(0, RULER_H - f.scrollY)

  // Row backgrounds.
  f.rows.forEach((r, i) => {
    if (i % 2 === 1) {
      ctx.fillStyle = THEME.rowAlt
      ctx.fillRect(0, r.y, w, r.h)
    }
  })
  const contentH = Math.max(h, (f.rows.at(-1)?.y ?? 0) + (f.rows.at(-1)?.h ?? 0) + RULER_H)
  ctx.lineWidth = 1
  for (const t of ticks) {
    for (let m = 0; m < 5; m++) {
      const px = Math.round(tx(t + (m * step) / 5)) + 0.5
      ctx.strokeStyle = m === 0 ? THEME.gridMajor : THEME.grid
      ctx.beginPath()
      ctx.moveTo(px, f.scrollY)
      ctx.lineTo(px, contentH)
      ctx.stroke()
    }
  }

  // Samples outside the capture.
  const endX = x(f.samples)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  if (x(0) > 0) ctx.fillRect(0, f.scrollY, x(0), contentH)
  if (endX < w) ctx.fillRect(endX, f.scrollY, w - endX, contentH)

  // Hovered pulse highlight.
  if (f.measurement && f.hoverChannel !== null) {
    const r = f.rows.find((r) => r.kind === 'channel' && r.ch.index === f.hoverChannel)
    if (r) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      const a = x(f.measurement.start)
      ctx.fillRect(a, r.y + 2, x(f.measurement.end) - a, r.h - 4)
    }
  }

  for (const r of f.rows) {
    if (r.y + r.h < f.scrollY || r.y > f.scrollY + h) continue
    if (r.kind === 'channel') drawChannel(ctx, w, dpr, r.ch.index, r.ch.color, r.y, r.h, f)
    else drawAnnotations(ctx, w, r.y, r.h, f.annotations.get(annKey(r.dec.id, r.row)) ?? [], r.dec.color, x)
  }
  ctx.restore()

  // Trigger, markers, cursor span the plot.
  const vline = (s: number, color: string, dash: number[] = []) => {
    const px = Math.round(x(s)) + 0.5
    if (px < 0 || px > w) return
    ctx.strokeStyle = color
    ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.moveTo(px, RULER_H)
    ctx.lineTo(px, h)
    ctx.stroke()
    ctx.setLineDash([])
  }
  if (f.trigger !== null) vline(f.trigger, THEME.trigger, [4, 3])
  if (f.markers.a !== null && f.markers.b !== null) {
    const a = x(f.markers.a)
    ctx.fillStyle = 'rgba(124,108,255,0.08)'
    ctx.fillRect(a, RULER_H, x(f.markers.b) - a, h - RULER_H)
  }
  if (f.markers.a !== null) vline(f.markers.a, THEME.markerA)
  if (f.markers.b !== null) vline(f.markers.b, THEME.markerB)
  if (f.hover) vline(f.hover.sample, THEME.cursor, [2, 3])

  drawRuler(ctx, w, ticks, step, tx, f, x)
}

function drawRuler(
  ctx: CanvasRenderingContext2D,
  w: number,
  ticks: number[],
  step: number,
  tx: (t: number) => number,
  f: Frame,
  x: (s: number) => number
) {
  ctx.fillStyle = THEME.ruler
  ctx.fillRect(0, 0, w, RULER_H)
  ctx.fillStyle = THEME.border
  ctx.fillRect(0, RULER_H - 1, w, 1)
  ctx.font = THEME.font
  ctx.textBaseline = 'middle'
  for (const t of ticks) {
    const px = Math.round(tx(t)) + 0.5
    for (let m = 1; m < 5; m++) {
      const mx = Math.round(tx(t + (m * step) / 5)) + 0.5
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fillRect(mx - 0.5, RULER_H - 5, 1, 4)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(px - 0.5, RULER_H - 9, 1, 8)
    ctx.fillStyle = THEME.rulerText
    ctx.fillText(fmtTick(t, step), px + 5, 12)
  }
  const flag = (s: number | null, label: string, color: string) => {
    if (s === null) return
    const px = Math.round(x(s))
    if (px < -20 || px > w + 20) return
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(px - 9, RULER_H - 17, 18, 15, 4)
    ctx.fill()
    ctx.fillStyle = '#0a0b0f'
    ctx.font = 'bold 10px -apple-system, Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(label, px, RULER_H - 9)
    ctx.textAlign = 'left'
    ctx.font = THEME.font
  }
  flag(f.trigger, 'T', THEME.trigger)
  flag(f.markers.a, 'A', THEME.markerA)
  flag(f.markers.b, 'B', THEME.markerB)
}

function drawChannel(
  ctx: CanvasRenderingContext2D,
  w: number,
  dpr: number,
  ch: number,
  color: string,
  y: number,
  h: number,
  f: Frame
) {
  const wave = f.wave
  if (!wave) return
  const hi = y + 9
  const lo = y + h - 9
  const bit = 1 << ch
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color
  ctx.lineJoin = 'miter'

  if (wave.kind === 'raw') {
    // Exact steps: one segment per sample.
    const { data, first } = wave
    ctx.beginPath()
    let prevY = -1
    for (let i = 0; i < data.length; i++) {
      const x0 = (first + i - f.view.start) / f.view.spp
      const x1 = x0 + 1 / f.view.spp
      const yy = data[i] & bit ? hi : lo
      if (i === 0) ctx.moveTo(x0, yy)
      else if (yy !== prevY) ctx.lineTo(x0, yy)
      ctx.lineTo(x1, yy)
      prevY = yy
    }
    ctx.stroke()
    // Soft fill under high segments.
    ctx.fillStyle = hexA(color, 0.09)
    for (let i = 0; i < data.length; i++) {
      if (data[i] & bit) {
        const x0 = (first + i - f.view.start) / f.view.spp
        ctx.fillRect(x0, hi, 1 / f.view.spp, lo - hi)
      }
    }
    return
  }

  // Level-of-detail: one column per device pixel.
  const { data } = wave
  const cols = data.length / 2
  const colW = 1 / dpr
  const firstCol = Math.max(0, Math.floor((-f.view.start / f.view.spp) * dpr))
  const lastCol = Math.min(cols, Math.ceil(((f.samples - f.view.start) / f.view.spp) * dpr))
  if (lastCol <= firstCol) return

  ctx.fillStyle = hexA(color, 0.09)
  let runStart = -1
  for (let c = firstCol; c <= lastCol; c++) {
    const high = c < lastCol && data[2 * c] & bit
    if (high && runStart < 0) runStart = c
    if (!high && runStart >= 0) {
      ctx.fillRect(runStart * colW, hi, (c - runStart) * colW, lo - hi)
      runStart = -1
    }
  }

  ctx.beginPath()
  let prevY = data[2 * firstCol] & bit ? hi : lo
  ctx.moveTo(firstCol * colW, prevY)
  const busy: number[] = []
  for (let c = firstCol; c < lastCol; c++) {
    const yy = data[2 * c] & bit ? hi : lo
    if (yy !== prevY) {
      ctx.lineTo(c * colW, prevY)
      ctx.lineTo(c * colW, yy)
      prevY = yy
    }
    if (data[2 * c + 1] & bit) busy.push(c)
  }
  ctx.lineTo(lastCol * colW, prevY)
  ctx.stroke()

  // Columns with toggles inside: vertical bars (dense activity reads as a block).
  if (busy.length) {
    ctx.fillStyle = color
    for (const c of busy) ctx.fillRect(c * colW, hi, Math.max(colW, 1 / dpr), lo - hi)
  }
}

function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  h: number,
  anns: Annotation[],
  color: string,
  x: (s: number) => number
) {
  const top = y + 4
  const bh = h - 8
  ctx.font = THEME.mono
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const a of anns) {
    const x0 = Math.max(x(a.start), -10)
    const x1 = Math.min(x(a.end), w + 10)
    const bw = Math.max(x1 - x0, 1)
    if (a.class === ANN.DENSE) {
      ctx.fillStyle = hexA(color, 0.28)
      ctx.fillRect(x0, top + 3, bw, bh - 6)
      continue
    }
    const c = CLASS_COLORS[a.class] ?? color
    ctx.fillStyle = hexA(c, 0.22)
    ctx.strokeStyle = hexA(c, 0.85)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x0 + 0.5, top + 0.5, bw - 1, bh - 1, Math.min(5, bw / 2))
    ctx.fill()
    if (bw > 3) ctx.stroke()
    if (bw > 14) {
      ctx.fillStyle = '#eef0f6'
      ctx.fillText(fitText(ctx, a.text, bw - 8), x0 + bw / 2, top + bh / 2 + 0.5)
    }
  }
  ctx.textAlign = 'left'
}

const fitCache = new Map<string, number>()
function fitText(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  let wd = fitCache.get(s)
  if (wd === undefined) {
    wd = ctx.measureText(s).width
    if (fitCache.size > 5000) fitCache.clear()
    fitCache.set(s, wd)
  }
  if (wd <= max) return s
  const n = Math.floor((max / wd) * s.length) - 1
  return n > 0 ? s.slice(0, n) + '…' : ''
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
