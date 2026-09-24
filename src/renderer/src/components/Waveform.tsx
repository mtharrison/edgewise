import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronsDown, ChevronsUp, EyeOff, Zap } from 'lucide-react'
import { bridge, engine } from '../api'
import { cycleTrigger, frameAnnotation, panBy, updateChannel, zoomAt } from '../actions'
import { annKey, drawFrame, type Frame, type Highlight } from '../draw'
import { fmtFreq, fmtTime } from '../format'
import { CH_H, layoutRows, RULER_H, type Row } from '../layout'
import { get, set, useStore } from '../store'
import type { Annotation, Channel, TriggerCondition } from '../types'
import { annotationAt } from '../view'

const TRIGGER_ICON: Record<TriggerCondition, ReactElement> = {
  rising: <ArrowUpRight size={13} />,
  falling: <ArrowDownRight size={13} />,
  edge: <Zap size={13} />,
  high: <ChevronsUp size={13} />,
  low: <ChevronsDown size={13} />
}

// Cmd on macOS; Ctrl elsewhere (on macOS, Ctrl+click is a right-click).
const MOD_KEY = bridge.platform === 'darwin' ? 'Meta' : 'Control'
const isMod = (e: { metaKey: boolean; ctrlKey: boolean }) => (MOD_KEY === 'Meta' ? e.metaKey : e.ctrlKey)

export function Waveform() {
  const channels = useStore((s) => s.channels)
  const decoders = useStore((s) => s.decoders)
  const rows = useMemo(() => layoutRows(channels, decoders), [channels, decoders])
  const totalH = (rows.at(-1)?.y ?? 0) + (rows.at(-1)?.h ?? 0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const size = useRef({ w: 0, h: 0, dpr: 1 })
  const rowsRef = useRef<Row[]>(rows)
  const scrollRef = useRef(0)
  rowsRef.current = rows

  // ---- zoom-to-annotation: modifier state and the annotation under the pointer ----
  const modRef = useRef(false)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const highlightRef = useRef<Highlight | null>(null)
  const [highlight, setHighlight] = useState<Highlight | null>(null)

  // ---- drawing: coalesced to one frame, one engine round-trip in flight ----
  const draw = useRef({ pending: false, busy: false, again: false })
  const cache = useRef<{ waveKey: string; wave: Frame['wave']; annKey: string; anns: Map<string, Annotation[]> }>({
    waveKey: '',
    wave: null,
    annKey: '',
    anns: new Map()
  })

  const render = useCallback(async () => {
    const d = draw.current
    d.pending = false
    if (d.busy) {
      d.again = true
      return
    }
    const canvas = canvasRef.current
    const { w, h, dpr } = size.current
    if (!canvas || w === 0) return
    d.busy = true
    try {
      const st = get()
      const { view, status } = st
      const vis = rowsRef.current
      const cols = Math.ceil(w * dpr)
      const c = cache.current

      const waveKey = `${status.captureId}:${status.samples}:${view.start}:${view.spp}:${cols}`
      if (waveKey !== c.waveKey) {
        if (status.samples === 0) c.wave = null
        else if (view.spp >= 1) {
          c.wave = { kind: 'lod', data: await engine.render(view.start, view.spp / dpr, cols), start: view.start, spp: view.spp }
        } else {
          const first = Math.max(0, Math.floor(view.start))
          c.wave = { kind: 'raw', data: await engine.samples(first, Math.ceil(w * view.spp) + 2), first }
        }
        c.waveKey = waveKey
      }

      const end = view.start + w * view.spp
      const decRows = vis.filter((r): r is Extract<Row, { kind: 'decoder' }> => r.kind === 'decoder')
      const annK = `${waveKey}:${status.decodeGen}:${decRows.map((r) => annKey(r.dec.id, r.row)).join(',')}`
      if (annK !== c.annKey) {
        const results = await Promise.all(
          decRows.map((r) => engine.annotations(r.dec.id, r.row, view.start, end, view.spp * 3, 4000))
        )
        c.anns = new Map(decRows.map((r, i) => [annKey(r.dec.id, r.row), results[i]]))
        c.annKey = annK
      }

      const hl = hitTest()
      const prev = highlightRef.current
      if (hl?.decoder !== prev?.decoder || hl?.row !== prev?.row || hl?.start !== prev?.start || hl?.end !== prev?.end) {
        highlightRef.current = hl
        setHighlight(hl)
      }

      const ctx = canvas.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawFrame(ctx, w, h, dpr, {
        view,
        samplerate: status.samplerate,
        samples: status.samples,
        trigger: status.trigger,
        rows: vis,
        scrollY: scrollRef.current,
        wave: c.wave,
        annotations: c.anns,
        markers: st.markers,
        hover: st.hover,
        measurement: st.measurement,
        hoverChannel: st.hover?.channel ?? null,
        highlight: hl
      })
    } finally {
      d.busy = false
      if (d.again) {
        d.again = false
        requestDraw()
      }
    }
  }, [])

  const requestDraw = useCallback(() => {
    if (draw.current.pending) return
    draw.current.pending = true
    requestAnimationFrame(render)
  }, [render])

  useEffect(() => useStore.subscribe(requestDraw), [requestDraw])
  useEffect(requestDraw, [rows, requestDraw])

  // ---- sizing ----
  useEffect(() => {
    const el = plotRef.current!
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      size.current = { w: r.width, h: r.height, dpr }
      const cv = canvasRef.current!
      cv.width = Math.round(r.width * dpr)
      cv.height = Math.round(r.height * dpr)
      set({ plotWidth: r.width })
      requestDraw()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [requestDraw])

  // ---- hover measurement (one request in flight, latest wins) ----
  const meas = useRef<{ busy: boolean; next: [number, number] | null }>({ busy: false, next: null })
  const measure = useCallback(async (ch: number, sample: number) => {
    const m = meas.current
    if (m.busy) {
      m.next = [ch, sample]
      return
    }
    m.busy = true
    try {
      set({ measurement: await engine.measure(ch, sample) })
    } finally {
      m.busy = false
      if (m.next) {
        const [c, s] = m.next
        m.next = null
        measure(c, s)
      }
    }
  }, [])

  const rowAt = (y: number): Row | undefined => {
    const yy = y - RULER_H + scrollRef.current
    return rowsRef.current.find((r) => yy >= r.y && yy < r.y + r.h)
  }

  /** Annotation under the pointer while the modifier is held, from the last drawn annotations. */
  const hitTest = (): Highlight | null => {
    const p = pointer.current
    if (!modRef.current || !p || p.y < RULER_H) return null
    const row = rowAt(p.y)
    if (row?.kind !== 'decoder') return null
    const { view } = get()
    const anns = cache.current.anns.get(annKey(row.dec.id, row.row)) ?? []
    const a = annotationAt(anns, view.start + p.x * view.spp, 2 * view.spp)
    return a && { decoder: row.dec.id, row: row.row, start: a.start, end: a.end }
  }

  // Pressing or releasing the modifier updates the highlight without moving the pointer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== MOD_KEY) return
      modRef.current = e.type === 'keydown'
      requestDraw()
    }
    const onBlur = () => {
      modRef.current = false
      requestDraw()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [requestDraw])

  // ---- pointer interaction ----
  const drag = useRef<{ kind: 'pan' | 'marker'; marker?: 'a' | 'b'; x0: number; last: number; moved: boolean } | null>(null)

  const local = (e: { clientX: number; clientY: number }) => {
    const r = plotRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const { x, y } = local(e)
    const { view, markers } = get()
    pointer.current = { x, y }
    modRef.current = isMod(e)
    if (modRef.current && y >= RULER_H && rowAt(y)?.kind === 'decoder') {
      // Modified click frames the annotation; it never pans or selects a table row.
      const hit = hitTest()
      if (hit) frameAnnotation(hit.start, hit.end)
      return
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (y < RULER_H) {
      const near = (s: number | null) => s !== null && Math.abs((s - view.start) / view.spp - x) < 8
      const marker: 'a' | 'b' = near(markers.b) ? 'b' : near(markers.a) ? 'a' : markers.a === null ? 'a' : 'b'
      set({ markers: { ...markers, [marker]: view.start + x * view.spp } })
      drag.current = { kind: 'marker', marker, x0: x, last: x, moved: false }
    } else {
      drag.current = { kind: 'pan', x0: x, last: x, moved: false }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = local(e)
    const { view } = get()
    const sample = view.start + x * view.spp
    pointer.current = { x, y }
    modRef.current = isMod(e)
    const dr = drag.current
    if (dr) {
      if (Math.abs(x - dr.x0) > 3) dr.moved = true
      if (dr.kind === 'pan') panBy(dr.last - x)
      else set({ markers: { ...get().markers, [dr.marker!]: sample } })
      dr.last = x
      return
    }
    const row = y >= RULER_H ? rowAt(y) : undefined
    const channel = row?.kind === 'channel' ? row.ch.index : null
    set({ hover: { sample, channel, x, y } })
    if (channel !== null) measure(channel, Math.floor(sample))
    else if (get().measurement) set({ measurement: null })
  }

  const onPointerUp = async (e: React.PointerEvent) => {
    const dr = drag.current
    drag.current = null
    if (!dr || dr.moved || dr.kind !== 'pan') return
    // Click on an annotation row focuses the data table.
    const { x, y } = local(e)
    const row = rowAt(y)
    if (row?.kind === 'decoder') {
      const sample = get().view.start + x * get().view.spp
      const index = await engine.annotationIndex(row.dec.id, row.row, sample)
      set({ table: { decoder: row.dec.id, row: row.row, focus: index } })
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    const { x } = local(e)
    if (get().measurement) set({ measurement: null })
    if (e.altKey && gutterRef.current) {
      gutterRef.current.scrollTop += e.deltaY
      return
    }
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
    if (horizontal || e.shiftKey) panBy(horizontal ? e.deltaX : e.deltaY)
    else {
      const k = e.ctrlKey ? 0.012 : 0.0025 // pinch deltas are small
      zoomAt(Math.exp(e.deltaY * k), x)
    }
  }

  // Wheel needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = plotRef.current!
    const stop = (e: WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', stop, { passive: false })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  const hidden = channels.filter((c) => !c.visible)

  return (
    <div className="wave">
      <div
        className="gutter"
        ref={gutterRef}
        onScroll={(e) => {
          scrollRef.current = e.currentTarget.scrollTop
          requestDraw()
        }}
      >
        <div className="gutter-head" style={{ height: RULER_H }}>
          <span>Channels</span>
          {hidden.length > 0 && (
            <button className="link" onClick={() => hidden.forEach((c) => updateChannel(c.index, { visible: true }))}>
              Show {hidden.length} hidden
            </button>
          )}
        </div>
        <div style={{ height: totalH + 40, position: 'relative' }}>
          {rows.map((r) =>
            r.kind === 'channel' ? (
              <ChannelLabel key={`c${r.ch.index}`} ch={r.ch} top={r.y} />
            ) : (
              <div key={`d${r.dec.id}:${r.row}`} className="dec-label" style={{ top: r.y, height: r.h }}>
                <span className="dot" style={{ background: r.dec.color }} />
                <span className="dec-name">{r.dec.name}</span>
                <span className="dec-row">{r.label}</span>
              </div>
            )
          )}
        </div>
      </div>
      <div
        className="plot"
        ref={plotRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          pointer.current = null
          if (!drag.current) set({ hover: null, measurement: null })
          requestDraw()
        }}
        onDoubleClick={(e) => local(e).y < RULER_H && set({ markers: { a: null, b: null } })}
        onWheel={onWheel}
        style={highlight ? { cursor: 'pointer' } : undefined}
      >
        <canvas ref={canvasRef} />
        <HoverTip />
        <EmptyState />
      </div>
    </div>
  )
}

function ChannelLabel({ ch, top }: { ch: Channel; top: number }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="ch-label" style={{ top, height: CH_H }}>
      <span className="ch-bar" style={{ background: ch.color }} />
      <span className="ch-index">D{ch.index}</span>
      {editing ? (
        <input
          autoFocus
          className="ch-input"
          defaultValue={ch.name}
          onBlur={(e) => {
            updateChannel(ch.index, { name: e.target.value.trim() || `D${ch.index}` })
            setEditing(false)
          }}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <span className="ch-name" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
          {ch.name}
        </span>
      )}
      <span className="ch-actions">
        <button
          className={`icon-btn trig ${ch.trigger ? 'on' : ''}`}
          title={ch.trigger ? `Trigger: ${ch.trigger} (click to change)` : 'Set trigger'}
          onClick={() => cycleTrigger(ch.index)}
        >
          {ch.trigger ? TRIGGER_ICON[ch.trigger] : <Zap size={13} />}
        </button>
        <button className="icon-btn" title="Hide channel" onClick={() => updateChannel(ch.index, { visible: false })}>
          <EyeOff size={13} />
        </button>
      </span>
    </div>
  )
}

function HoverTip() {
  const hover = useStore((s) => s.hover)
  const m = useStore((s) => s.measurement)
  const rate = useStore((s) => s.status.samplerate)
  if (!hover || !m || hover.channel === null) return null
  const width = (m.end - m.start) / rate
  const period = m.period ? m.period / rate : null
  return (
    <div className="hover-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
      <div>
        <b>{m.high ? 'High' : 'Low'}</b> {fmtTime(width)}
      </div>
      {period && (
        <>
          <div>
            <span className="muted">Period</span> {fmtTime(period)}
          </div>
          <div>
            <span className="muted">Freq</span> {fmtFreq(1 / period)}
          </div>
          <div>
            <span className="muted">Duty</span> {(((m.highTime ?? 0) / (m.period ?? 1)) * 100).toFixed(1)}%
          </div>
        </>
      )}
    </div>
  )
}

function EmptyState() {
  const samples = useStore((s) => s.status.samples)
  const state = useStore((s) => s.status.state)
  if (samples > 0 || state === 'running') return null
  return (
    <div className="empty">
      <div className="empty-title">{state === 'waiting' ? 'Waiting for trigger…' : 'No capture yet'}</div>
      <div className="empty-sub">
        Press <kbd>Space</kbd> to start, or <kbd>⌘O</kbd> to open a .sr file
      </div>
    </div>
  )
}
