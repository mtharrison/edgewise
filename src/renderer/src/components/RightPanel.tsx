import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { engine } from '../api'
import { addDecoder, centerOn, removeDecoder, toggleDecoderVisible, updateDecoder } from '../actions'
import { fmtFreq, fmtTime } from '../format'
import { set, useStore } from '../store'
import type { Annotation, DecoderInst } from '../types'

export function RightPanel() {
  return (
    <aside className="right">
      <Analyzers />
      <Measurements />
      <DataTable />
    </aside>
  )
}

function Section({ title, extra, children, grow }: { title: string; extra?: React.ReactNode; children: React.ReactNode; grow?: boolean }) {
  return (
    <section className={`section ${grow ? 'grow' : ''}`}>
      <div className="section-head">
        <span>{title}</span>
        {extra}
      </div>
      {children}
    </section>
  )
}

function Analyzers() {
  const decoders = useStore((s) => s.decoders)
  return (
    <Section
      title="Analyzers"
      extra={
        <div className="add-row">
          {(['uart', 'i2c', 'spi'] as const).map((k) => (
            <button key={k} className="pill" onClick={() => addDecoder(k)}>
              <Plus size={11} />
              {{ uart: 'UART', i2c: 'I²C', spi: 'SPI' }[k]}
            </button>
          ))}
        </div>
      }
    >
      {decoders.length === 0 && <div className="hint">Add a protocol analyzer to decode UART, I²C or SPI traffic.</div>}
      <div className="cards">
        {decoders.map((d) => (
          <AnalyzerCard key={d.id} d={d} />
        ))}
      </div>
    </Section>
  )
}

type FieldDef = { key: string; label: string; type: 'channel' | 'channel?' | 'number' | 'select' | 'bool'; options?: [string | number, string][] }

const FORMAT: FieldDef = { key: 'format', label: 'Display', type: 'select', options: [['hex', 'Hex'], ['dec', 'Decimal'], ['bin', 'Binary'], ['ascii', 'ASCII']] }

const FIELDS: Record<string, FieldDef[]> = {
  uart: [
    { key: 'channel', label: 'Channel', type: 'channel' },
    { key: 'baud', label: 'Baud', type: 'number' },
    { key: 'dataBits', label: 'Data bits', type: 'select', options: [5, 6, 7, 8, 9].map((n) => [n, String(n)]) },
    { key: 'parity', label: 'Parity', type: 'select', options: [['none', 'None'], ['even', 'Even'], ['odd', 'Odd']] },
    { key: 'stopBits', label: 'Stop bits', type: 'select', options: [[1, '1'], [1.5, '1.5'], [2, '2']] },
    { key: 'msbFirst', label: 'MSB first', type: 'bool' },
    { key: 'invert', label: 'Inverted', type: 'bool' },
    FORMAT
  ],
  i2c: [
    { key: 'scl', label: 'SCL', type: 'channel' },
    { key: 'sda', label: 'SDA', type: 'channel' },
    FORMAT
  ],
  spi: [
    { key: 'clk', label: 'Clock', type: 'channel' },
    { key: 'mosi', label: 'MOSI', type: 'channel?' },
    { key: 'miso', label: 'MISO', type: 'channel?' },
    { key: 'cs', label: 'Enable', type: 'channel?' },
    { key: 'csActiveLow', label: 'Enable active low', type: 'bool' },
    { key: 'cpol', label: 'CPOL', type: 'select', options: [[0, '0 · idle low'], [1, '1 · idle high']] },
    { key: 'cpha', label: 'CPHA', type: 'select', options: [[0, '0 · leading edge'], [1, '1 · trailing edge']] },
    { key: 'wordBits', label: 'Bits/word', type: 'number' },
    { key: 'msbFirst', label: 'MSB first', type: 'bool' },
    FORMAT
  ]
}

function AnalyzerCard({ d }: { d: DecoderInst }) {
  const channels = useStore((s) => s.channels)
  const [open, setOpen] = useState(true)
  const summary = (() => {
    const c = d.config
    const name = (i: unknown) => (typeof i === 'number' ? channels[i]?.name ?? `D${i}` : '—')
    if (c.kind === 'uart') return `${name(c.channel)} · ${c.baud} baud`
    if (c.kind === 'i2c') return `${name(c.scl)} / ${name(c.sda)}`
    return `CLK ${name(c.clk)} · mode ${Number(c.cpol) * 2 + Number(c.cpha)}`
  })()

  return (
    <div className="card">
      <div className="card-head">
        <button className="icon-btn" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="dot" style={{ background: d.color }} />
        <span className="card-title">{d.name}</span>
        <span className="card-sub">{summary}</span>
        <button className="icon-btn" title={d.visible ? 'Hide rows' : 'Show rows'} onClick={() => toggleDecoderVisible(d.id)}>
          {d.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button className="icon-btn danger" title="Remove" onClick={() => removeDecoder(d.id)}>
          <Trash2 size={13} />
        </button>
      </div>
      {open && (
        <div className="card-body">
          {FIELDS[d.config.kind].map((f) => {
            const v = d.config[f.key]
            const update = (val: unknown) => updateDecoder(d.id, { [f.key]: val } as any)
            let input: React.ReactNode
            if (f.type === 'channel' || f.type === 'channel?') {
              input = (
                <select value={v === null ? '' : String(v)} onChange={(e) => update(e.target.value === '' ? null : Number(e.target.value))}>
                  {f.type === 'channel?' && <option value="">None</option>}
                  {channels.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )
            } else if (f.type === 'select') {
              input = (
                <select
                  value={String(v)}
                  onChange={(e) => {
                    const opt = f.options!.find(([k]) => String(k) === e.target.value)!
                    update(opt[0])
                  }}
                >
                  {f.options!.map(([k, label]) => (
                    <option key={String(k)} value={String(k)}>
                      {label}
                    </option>
                  ))}
                </select>
              )
            } else if (f.type === 'bool') {
              input = <input type="checkbox" checked={Boolean(v)} onChange={(e) => update(e.target.checked)} />
            } else {
              input = <NumberInput value={Number(v)} onCommit={update} />
            }
            return (
              <label key={f.key} className={`form-row ${f.type === 'bool' ? 'bool' : ''}`}>
                <span>{f.label}</span>
                {input}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NumberInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = Number(text)
    if (isFinite(n) && n > 0 && n !== value) onCommit(n)
    else setText(String(value))
  }
  return (
    <input
      className="mono"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}

function Measurements() {
  const markers = useStore((s) => s.markers)
  const rate = useStore((s) => s.status.samplerate)
  const trigger = useStore((s) => s.status.trigger)
  const hover = useStore((s) => s.hover)
  const origin = trigger ?? 0
  const t = (s: number) => fmtTime((s - origin) / rate, 6)
  const dt = markers.a !== null && markers.b !== null ? Math.abs(markers.b - markers.a) / rate : null

  return (
    <Section
      title="Timing"
      extra={
        (markers.a !== null || markers.b !== null) && (
          <button className="link" onClick={() => set({ markers: { a: null, b: null } })}>
            Clear
          </button>
        )
      }
    >
      <div className="metrics">
        <Metric label="Cursor" value={hover ? t(hover.sample) : '—'} />
        <Metric label="A" value={markers.a !== null ? t(markers.a) : '—'} color="var(--marker-a)" />
        <Metric label="B" value={markers.b !== null ? t(markers.b) : '—'} color="var(--marker-b)" />
        <Metric label="Δ A→B" value={dt !== null ? fmtTime(dt, 6) : '—'} strong />
        <Metric label="1 / Δ" value={dt ? fmtFreq(1 / dt) : '—'} />
      </div>
      {markers.a === null && <div className="hint">Click the time ruler to drop markers A and B. Drag to move, double-click to clear.</div>}
    </Section>
  )
}

function Metric({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div className={`metric ${strong ? 'strong' : ''}`}>
      <span className="metric-label" style={color ? { color } : undefined}>
        {label}
      </span>
      <span className="metric-value mono">{value}</span>
    </div>
  )
}

const ROW_H = 26

function DataTable() {
  const decoders = useStore((s) => s.decoders)
  const table = useStore((s) => s.table)
  const decodeGen = useStore((s) => s.status.decodeGen)
  const decoding = useStore((s) => s.status.decoding)
  const rate = useStore((s) => s.status.samplerate)
  const trigger = useStore((s) => s.status.trigger)
  const dec = decoders.find((d) => d.id === table.decoder) ?? decoders[0]
  const scroller = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ offset: 0, height: 300 })
  const [page, setPage] = useState<{ total: number; offset: number; items: Annotation[] }>({ total: 0, offset: 0, items: [] })

  const first = Math.max(0, Math.floor(range.offset / ROW_H) - 10)
  const count = Math.ceil(range.height / ROW_H) + 20

  useEffect(() => {
    if (!dec) return setPage({ total: 0, offset: 0, items: [] })
    let live = true
    engine.annotationPage(dec.id, table.row, first, count).then((p) => live && setPage({ ...p, offset: first }))
    return () => {
      live = false
    }
  }, [dec?.id, table.row, first, count, decodeGen])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setRange((r) => ({ ...r, height: el.clientHeight })))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Scroll to an annotation clicked in the waveform.
  useEffect(() => {
    if (table.focus === null || !scroller.current) return
    const el = scroller.current
    const y = table.focus * ROW_H
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - ROW_H) el.scrollTop = y - el.clientHeight / 2
  }, [table.focus])

  const origin = trigger ?? 0
  return (
    <Section
      title="Decoded data"
      grow
      extra={
        dec && (
          <div className="tabs">
            {decoders.length > 1 && (
              <select
                value={dec.id}
                onChange={(e) => set({ table: { decoder: Number(e.target.value), row: 0, focus: null } })}
              >
                {decoders.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            {dec.rows.map((r, i) => (
              <button key={r} className={`tab ${i === table.row ? 'on' : ''}`} onClick={() => set({ table: { decoder: dec.id, row: i, focus: null } })}>
                {r}
              </button>
            ))}
          </div>
        )
      }
    >
      {!dec ? (
        <div className="hint">Decoded frames appear here.</div>
      ) : (
        <>
          <div className="table-head">
            <span>#</span>
            <span>Time</span>
            <span>Value</span>
            <span className="muted">{decoding ? 'decoding…' : `${page.total.toLocaleString()} rows`}</span>
          </div>
          <div className="table" ref={scroller} onScroll={(e) => setRange({ offset: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}>
            <div style={{ height: page.total * ROW_H, position: 'relative' }}>
              {page.items.map((a, i) => {
                const idx = page.offset + i
                return (
                  <div
                    key={idx}
                    className={`table-row ${idx === table.focus ? 'focus' : ''} cls-${a.class}`}
                    style={{ top: idx * ROW_H, height: ROW_H }}
                    onClick={() => {
                      set({ table: { ...table, decoder: dec.id, focus: idx } })
                      centerOn((a.start + a.end) / 2, a.end - a.start)
                    }}
                  >
                    <span className="muted mono">{idx + 1}</span>
                    <span className="mono">{fmtTime((a.start - origin) / rate, 6)}</span>
                    <span className="mono value">{a.text}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </Section>
  )
}
