import { useEffect, useRef, useState } from 'react'
import { Circle, FolderOpen, Play, RefreshCw, Square, Zap } from 'lucide-react'
import { bridge } from '../api'
import { isBusy, openFile, refreshDevices, selectDevice, setTrigger, toggleCapture } from '../actions'
import { fmtCount, fmtRate, fmtTime } from '../format'
import { DURATIONS, set, useStore } from '../store'

const COND_LABEL = { rising: '↑ Rising', falling: '↓ Falling', edge: '↕ Any edge', high: '▔ High', low: '▁ Low' }

export function TopBar() {
  const devices = useStore((s) => s.devices)
  const deviceId = useStore((s) => s.deviceId)
  const deviceConnected = useStore((s) => s.deviceConnected)
  const scanning = useStore((s) => s.scanning)
  const samplerate = useStore((s) => s.samplerate)
  const duration = useStore((s) => s.duration)
  const status = useStore((s) => s.status)
  const dev = devices.find((d) => d.id === deviceId)
  const busy = isBusy(status)

  return (
    <header className={`topbar ${bridge.platform === 'darwin' ? 'mac' : ''}`}>
      <div className="brand">
        <Logo />
        <span>Edgewise</span>
      </div>

      <div className="controls">
        <label className="field">
          <span className="field-label">Device</span>
          <div className="field-row">
            <select value={deviceId ?? ''} onChange={(e) => selectDevice(e.target.value)} disabled={busy}>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.driver === 'sigrok' ? ' via sigrok-cli' : ''}
                  {d.id === deviceId && !deviceConnected ? ' (disconnected)' : ''}
                </option>
              ))}
            </select>
            <button
              className="icon-btn"
              title={scanning ? 'Scanning for devices…' : 'Rescan devices'}
              onClick={() => refreshDevices({ rescan: true })}
              disabled={busy || scanning}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </label>

        <label className="field">
          <span className="field-label">Sample rate</span>
          <select value={samplerate} onChange={(e) => set({ samplerate: Number(e.target.value) })} disabled={busy}>
            {(dev?.samplerates ?? [samplerate]).map((r) => (
              <option key={r} value={r}>
                {fmtRate(r)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Duration</span>
          <select value={duration} onChange={(e) => set({ duration: Number(e.target.value) })} disabled={busy}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? 'Until stopped' : `${fmtTime(d)} · ${fmtCount(d * samplerate)}`}
              </option>
            ))}
          </select>
        </label>

        <TriggerChip />
      </div>

      <div className="spacer" />
      {dev?.note && <div className="device-note" title={dev.note}>{dev.note}</div>}
      <button className="icon-btn ghost" title="Open capture (⌘O)" onClick={openFile}>
        <FolderOpen size={16} />
      </button>
      <CaptureButton busy={busy} deviceConnected={deviceConnected} />
    </header>
  )
}

function CaptureButton({ busy, deviceConnected }: { busy: boolean; deviceConnected: boolean }) {
  const status = useStore((s) => s.status)
  const duration = useStore((s) => s.duration)
  const rate = useStore((s) => s.samplerate)
  const limit = duration * rate
  const pct = busy && limit > 0 ? Math.min(100, (status.samples / limit) * 100) : 0
  const label =
    status.state === 'starting' ? (status.message || 'Starting…') : status.state === 'waiting' ? 'Armed' : busy ? 'Stop' : 'Start'
  const disabled = !busy && !deviceConnected
  return (
    <button
      className={`capture-btn ${busy ? 'busy' : ''} ${status.state}`}
      onClick={toggleCapture}
      disabled={disabled}
      title={disabled ? "Device isn't connected" : 'Start / stop (Space)'}
    >
      <span className="capture-fill" style={{ width: `${pct}%` }} />
      <span className="capture-content">
        {busy ? (status.state === 'waiting' ? <Circle size={12} className="pulse" /> : <Square size={12} fill="currentColor" />) : <Play size={13} fill="currentColor" />}
        {label}
      </span>
    </button>
  )
}

function TriggerChip() {
  const channels = useStore((s) => s.channels)
  const pretrigger = useStore((s) => s.pretrigger)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = channels.filter((c) => c.trigger)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="field trigger" ref={ref}>
      <span className="field-label">Trigger</span>
      <button className={`chip ${active.length ? 'on' : ''}`} onClick={() => setOpen(!open)}>
        <Zap size={12} />
        {active.length === 0 ? 'None' : active.map((c) => `${c.name} ${COND_LABEL[c.trigger!].split(' ')[0]}`).join(' & ')}
      </button>
      {open && (
        <div className="popover">
          <div className="popover-title">Trigger when all match</div>
          <div className="trig-grid">
            {channels.map((c) => (
              <div key={c.index} className="trig-row">
                <span className="ch-bar sm" style={{ background: c.color }} />
                <span className="trig-name">{c.name}</span>
                <select value={c.trigger ?? ''} onChange={(e) => setTrigger(c.index, (e.target.value || null) as any)}>
                  <option value="">—</option>
                  {Object.entries(COND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <label className="slider">
            <span>Pre-trigger</span>
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.05}
              value={pretrigger}
              onChange={(e) => set({ pretrigger: Number(e.target.value) })}
            />
            <span className="mono">{Math.round(pretrigger * 100)}%</span>
          </label>
          {active.length > 0 && (
            <button className="link" onClick={() => active.forEach((c) => setTrigger(c.index, null))}>
              Clear trigger
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#lg)" />
      <path d="M5 15h3V9h4v6h3V9h4" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="24" y2="24">
          <stop stopColor="#7c6cff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>
  )
}
