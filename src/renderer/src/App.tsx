import { useEffect } from 'react'
import { bridge, engine } from './api'
import { centerOn, fit, isBusy, openFile, panBy, pollStatus, refreshDevices, saveFile, toggleCapture, zoomAt } from './actions'
import { Overview } from './components/Overview'
import { RightPanel } from './components/RightPanel'
import { StatusBar } from './components/StatusBar'
import { TopBar } from './components/TopBar'
import { Waveform } from './components/Waveform'
import { get, set } from './store'

async function jumpEdge(forward: boolean) {
  const { hover, channels, view, plotWidth } = get()
  const ch = hover?.channel ?? channels.find((c) => c.visible)?.index
  if (ch === undefined) return
  const from = hover?.sample ?? view.start + (view.spp * plotWidth) / 2
  const edge = await engine.findEdge(ch, Math.round(from), forward)
  if (edge === null) return
  centerOn(edge)
  const v = get().view
  set({ hover: { sample: edge, channel: ch, x: (edge - v.start) / v.spp, y: hover?.y ?? 0 } })
}

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (t.closest('input, select, textarea') || e.metaKey || e.ctrlKey) return
  const { plotWidth, hover, markers } = get()
  const mid = hover?.x ?? plotWidth / 2
  switch (e.key) {
    case ' ':
      e.preventDefault()
      toggleCapture()
      break
    case 'f':
      set({ follow: false })
      fit()
      break
    case '=':
    case '+':
      zoomAt(0.5, mid)
      break
    case '-':
      zoomAt(2, mid)
      break
    case 'ArrowLeft':
      panBy(-plotWidth * 0.2)
      break
    case 'ArrowRight':
      panBy(plotWidth * 0.2)
      break
    case 'a':
    case 'b':
      if (hover) set({ markers: { ...markers, [e.key]: hover.sample } })
      break
    case 'Escape':
      set({ markers: { a: null, b: null } })
      break
    case '[':
      jumpEdge(false)
      break
    case ']':
      jumpEdge(true)
      break
  }
}

export function App() {
  useEffect(() => {
    refreshDevices()
    let timer: ReturnType<typeof setTimeout>
    let lastScan = performance.now()
    const tick = async () => {
      try {
        await pollStatus()
        const s = get().status
        if (!isBusy(s) && performance.now() - lastScan > 3000) {
          lastScan = performance.now()
          refreshDevices()
        }
      } finally {
        const s = get().status
        timer = setTimeout(tick, isBusy(s) || s.decoding ? 50 : 400)
      }
    }
    tick()
    window.addEventListener('keydown', onKey)
    const offMenu = bridge.onMenu((cmd) => {
      if (cmd === 'open') openFile()
      else if (cmd === 'save') saveFile('sr')
      else if (cmd === 'export') saveFile('vcd')
      else if (cmd === 'toggle') toggleCapture()
      else if (cmd === 'fit') fit()
    })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      offMenu()
    }
  }, [])

  return (
    <div className="app">
      <TopBar />
      <Overview />
      <main className="main">
        <Waveform />
        <RightPanel />
      </main>
      <StatusBar />
    </div>
  )
}
