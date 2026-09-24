import { bridge } from '../api'
import { fmtCount, fmtRate, fmtTime } from '../format'
import { useStore } from '../store'

const MOD = bridge.platform === 'darwin' ? '⌘' : 'Ctrl'

const STATE_LABEL = { idle: 'Ready', starting: 'Starting', waiting: 'Waiting for trigger', running: 'Capturing', done: 'Done', error: 'Error' }

export function StatusBar() {
  const s = useStore((st) => st.status)
  const view = useStore((st) => st.view)
  const toast = useStore((st) => st.toast)
  const perDiv = (view.spp * 120) / s.samplerate
  return (
    <footer className="statusbar">
      <span className={`state-dot ${s.state}`} />
      <span>{STATE_LABEL[s.state]}</span>
      {s.samples > 0 && (
        <>
          <span className="sep" />
          <span className="mono">{fmtCount(s.samples)} samples</span>
          <span className="sep" />
          <span className="mono">{fmtTime(s.samples / s.samplerate)}</span>
          <span className="sep" />
          <span className="mono">@ {fmtRate(s.samplerate)}</span>
          <span className="sep" />
          <span className="mono">{fmtTime(perDiv)} / div</span>
        </>
      )}
      {s.decoding && (
        <>
          <span className="sep" />
          <span className="spinner" /> Decoding
        </>
      )}
      <span className="spacer" />
      {toast && <span className="toast">{toast}</span>}
      <span className="muted keys">
        <kbd>Space</kbd> capture · <kbd>scroll</kbd> zoom · <kbd>drag</kbd> pan · <kbd>F</kbd> fit · <kbd>{MOD}</kbd> click zoom to packet · <kbd>A</kbd>/<kbd>B</kbd> markers · <kbd>[</kbd>
        <kbd>]</kbd> edges
      </span>
    </footer>
  )
}
