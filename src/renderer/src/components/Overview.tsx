import { useEffect, useRef } from 'react'
import { engine } from '../api'
import { clampView } from '../actions'
import { get, set, useStore } from '../store'

/** Whole-capture activity strip with the visible window highlighted. */
export function Overview() {
  const ref = useRef<HTMLCanvasElement>(null)
  const data = useRef<{ key: string; cols: Uint16Array | null }>({ key: '', cols: null })
  const status = useStore((s) => s.status)
  const view = useStore((s) => s.view)
  const plotWidth = useStore((s) => s.plotWidth)
  const channels = useStore((s) => s.channels)

  useEffect(() => {
    const cv = ref.current!
    const dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth
    const h = cv.clientHeight
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
    }
    let cancelled = false
    const paint = () => {
      const ctx = cv.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const n = status.samples
      const cols = data.current.cols
      if (n > 0 && cols) {
        const mask = channels.filter((c) => c.visible).reduce((m, c) => m | (1 << c.index), 0)
        const count = cols.length / 2
        for (let i = 0; i < count; i++) {
          const toggles = cols[2 * i + 1] & mask
          let bits = 0
          for (let t = toggles; t; t &= t - 1) bits++
          if (!bits) continue
          const bh = 3 + (bits / 8) * (h - 8)
          ctx.fillStyle = `rgba(124,108,255,${0.35 + 0.08 * bits})`
          ctx.fillRect(i / dpr, (h - bh) / 2, 1 / dpr, bh)
        }
        const x0 = (view.start / n) * w
        const x1 = ((view.start + view.spp * plotWidth) / n) * w
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'
        ctx.beginPath()
        ctx.roundRect(Math.max(0, x0) + 0.5, 1.5, Math.max(3, Math.min(w, x1) - Math.max(0, x0)) - 1, h - 3, 4)
        ctx.fill()
        ctx.stroke()
      }
    }
    const key = `${status.captureId}:${status.samples}:${cv.width}`
    if (key !== data.current.key && status.samples > 0) {
      data.current.key = key
      engine.render(0, status.samples / cv.width, cv.width).then((d) => {
        data.current.cols = d
        if (!cancelled) paint()
      })
    }
    paint()
    return () => {
      cancelled = true
    }
  }, [status.captureId, status.samples, view, plotWidth, channels])

  const jump = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return
    const r = ref.current!.getBoundingClientRect()
    const { status, view, plotWidth } = get()
    const center = ((e.clientX - r.left) / r.width) * status.samples
    set({ view: clampView(center - (view.spp * plotWidth) / 2, view.spp), follow: false })
  }

  return (
    <div className="overview">
      <canvas ref={ref} onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); jump(e) }} onPointerMove={jump} />
    </div>
  )
}
