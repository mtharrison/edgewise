import { bridge, engine } from './api'
import { fitToDevice, overlayChannels, type Saved, type SavedDecoder } from './settings'
import { DECODER_COLORS, get, makeChannels, set, useStore } from './store'
import type { DecoderConfig, DecoderInst, Status, TriggerCondition } from './types'
import { clampViewTo, frameRange } from './view'

const TRIGGER_CYCLE: (TriggerCondition | null)[] = [null, 'rising', 'falling', 'edge', 'high', 'low']

export function toast(msg: string) {
  set({ toast: msg })
  setTimeout(() => get().toast === msg && set({ toast: null }), 4000)
}

/**
 * True if two device ids are the same FX2 board model (matched by USB vendor:product
 * id, ignoring the port). Ids are `fx2:{vid}:{pid}:{port}` (see
 * `crates/logic-core/src/devices/fx2lafw.rs`); non-fx2 ids (e.g. the demo device)
 * never match.
 */
export function sameFx2Model(idA: string, idB: string): boolean {
  const vidPid = (id: string) => {
    const [driver, vid, pid] = id.split(':')
    return driver === 'fx2' && vid && pid ? `${vid}:${pid}` : null
  }
  const a = vidPid(idA)
  return a !== null && a === vidPid(idB)
}

let pendingRestore: Saved | null = null

/**
 * Applies the device-independent saved settings now and keeps the rest for the next
 * `refreshDevices()`, which fits them to the listed devices.
 */
export function restoreSettings(saved: Saved | null) {
  pendingRestore = saved
  if (saved) set({ duration: saved.duration, pretrigger: saved.pretrigger })
}

export async function refreshDevices() {
  const list = await engine.listDevices()
  const fitted = pendingRestore && fitToDevice(pendingRestore, list)
  pendingRestore = null
  if (fitted) {
    const { deviceId, samplerate, channels } = fitted
    set({ devices: list, deviceConnected: true, deviceId, samplerate, channels })
    await restoreDecoders(fitted.decoders)
    return
  }
  const { deviceId, devices: prevDevices } = get()
  if (deviceId === null) {
    set({ devices: list, deviceConnected: true })
    if (list.length) selectDevice(list[0].id)
    return
  }
  if (list.find((d) => d.id === deviceId)) {
    set({ devices: list, deviceConnected: true })
    return
  }
  const reappeared = list.find((d) => sameFx2Model(d.id, deviceId))
  if (reappeared) {
    set({ devices: list })
    selectDevice(reappeared.id)
    return
  }
  const remembered = prevDevices.find((d) => d.id === deviceId)
  set({ devices: remembered ? [...list, remembered] : list, deviceConnected: false })
}

export function selectDevice(id: string) {
  const { devices, deviceId: prevId, deviceConnected } = get()
  const dev = devices.find((d) => d.id === id)
  if (!dev) return
  const rate = dev.samplerates.includes(get().samplerate) ? get().samplerate : dev.defaultSamplerate
  // A disconnected selection is only remembered so the picker can show it; once the
  // user picks something else it must not be reselected if it reappears.
  const nextDevices = !deviceConnected && prevId && prevId !== id ? devices.filter((d) => d.id !== prevId) : devices
  set({ deviceId: id, samplerate: rate, deviceConnected: true, devices: nextDevices })
  if (get().channels.length !== dev.channels) set({ channels: makeChannels(dev.channels) })
}

/** Puts every remembered capture setting back to its default; the capture is untouched. */
export function resetSettings() {
  const { status, decoders, devices } = get()
  if (isBusy(status)) return
  for (const d of decoders) engine.removeDecoder(d.id)
  const { duration, pretrigger, samplerate, table } = useStore.getInitialState()
  set({ decoders: [], table, duration, pretrigger, samplerate })
  if (devices.length) selectDevice(devices[0].id)
  set({ channels: makeChannels(get().channels.length) })
}

export function isBusy(s: Status) {
  return s.state === 'starting' || s.state === 'waiting' || s.state === 'running'
}

export async function startCapture() {
  const { deviceId, deviceConnected, samplerate, duration, channels, pretrigger } = get()
  if (!deviceId) return toast('No device selected')
  if (!deviceConnected) return toast("Device isn't connected")
  const trigger = channels
    .filter((c) => c.trigger)
    .map((c) => ({ channel: c.index, condition: c.trigger as string }))
  set({ follow: true, markers: { a: null, b: null }, measurement: null })
  try {
    await engine.start({
      deviceId,
      samplerate,
      sampleLimit: Math.round(duration * samplerate),
      trigger,
      pretrigger
    })
    await pollStatus()
  } catch (e) {
    toast(String((e as Error).message ?? e))
  }
}

export async function stopCapture() {
  await engine.stop()
  await pollStatus()
}

export function toggleCapture() {
  return isBusy(get().status) ? stopCapture() : startCapture()
}

let lastDecodeAt = 0
let lastCaptureId = -1
let lastState = ''

/** Poll engine status; re-run decoders when the capture changes. */
export async function pollStatus() {
  const s = await engine.status()
  const prev = get().status
  const changed = (Object.keys(s) as (keyof Status)[]).some((k) => s[k] !== prev[k])
  if (changed) set({ status: s })
  // Follow the channel count of an actual capture, keeping the current channel settings
  // by index. Before anything is captured the channel list belongs to the device.
  if (s.samples > 0 && s.channels !== get().channels.length) set({ channels: overlayChannels(s.channels, get().channels) })

  const newCapture = s.captureId !== lastCaptureId
  const finished = lastState !== s.state && (s.state === 'done' || s.state === 'error')
  const live = s.state === 'running' && performance.now() - lastDecodeAt > 1000
  if (newCapture || finished || live) {
    lastCaptureId = s.captureId
    lastDecodeAt = performance.now()
    for (const d of get().decoders) engine.decode(d.id)
  }
  if (finished && s.state === 'error' && s.message) toast(s.message)
  lastState = s.state
  if (get().follow && s.samples > 0) fit()
}

// ---- view ----

export function fit() {
  const { status, plotWidth } = get()
  const n = Math.max(status.samples, 1)
  set({ view: { start: 0, spp: n / Math.max(plotWidth, 1) } })
}

export function clampView(start: number, spp: number) {
  const { status, plotWidth } = get()
  return clampViewTo(start, spp, status.samples, plotWidth)
}

export function zoomAt(factor: number, x: number) {
  const { view } = get()
  const sample = view.start + x * view.spp
  const spp = view.spp * factor
  set({ view: clampView(sample - x * spp, spp), follow: false })
}

export function panBy(px: number) {
  const { view } = get()
  set({ view: clampView(view.start + px * view.spp, view.spp), follow: false })
}

export function centerOn(sample: number, width?: number) {
  const { view, plotWidth } = get()
  let spp = view.spp
  if (width && width / spp < 24) spp = Math.max(width / (plotWidth / 8), 1 / 64)
  set({ view: clampView(sample - (plotWidth / 2) * spp, spp), follow: false })
}

/** Zooms and pans so [start, end] fills the plot width with a small margin. */
export function frameSpan(start: number, end: number) {
  const v = frameRange(start, end, get().plotWidth)
  set({ view: clampView(v.start, v.spp), follow: false })
}

// ---- channels ----

export function cycleTrigger(index: number) {
  set({
    channels: get().channels.map((c) =>
      c.index === index ? { ...c, trigger: TRIGGER_CYCLE[(TRIGGER_CYCLE.indexOf(c.trigger) + 1) % TRIGGER_CYCLE.length] } : c
    )
  })
}

export function setTrigger(index: number, trigger: TriggerCondition | null) {
  set({ channels: get().channels.map((c) => (c.index === index ? { ...c, trigger } : c)) })
}

export function updateChannel(index: number, patch: Partial<{ name: string; visible: boolean; color: string }>) {
  set({ channels: get().channels.map((c) => (c.index === index ? { ...c, ...patch } : c)) })
}

// ---- decoders ----

export const DECODER_DEFAULTS: Record<string, DecoderConfig> = {
  uart: { kind: 'uart', channel: 0, baud: 115200, dataBits: 8, parity: 'none', stopBits: 1, invert: false, msbFirst: false, format: 'ascii' },
  i2c: { kind: 'i2c', scl: 1, sda: 2, format: 'hex' },
  spi: { kind: 'spi', clk: 3, mosi: 4, miso: 5, cs: 6, csActiveLow: true, cpol: 0, cpha: 0, wordBits: 8, msbFirst: true, format: 'hex' }
}

const NAMES: Record<string, string> = { uart: 'UART', i2c: 'I²C', spi: 'SPI' }

export async function addDecoder(kind: string) {
  const config = { ...DECODER_DEFAULTS[kind] }
  try {
    const id = await engine.addDecoder(config)
    const rows = await engine.decoderRows(config)
    const n = get().decoders.length
    const d: DecoderInst = { id, name: NAMES[kind], color: DECODER_COLORS[n % DECODER_COLORS.length], config, rows, visible: true }
    set({ decoders: [...get().decoders, d], table: { decoder: id, row: 0, focus: null } })
    engine.decode(id)
  } catch (e) {
    toast(String((e as Error).message ?? e))
  }
}

/** Re-creates saved decoders; any the engine rejects is dropped without a toast. */
async function restoreDecoders(saved: SavedDecoder[]) {
  const made = await Promise.all(
    saved.map(async ({ config, visible }) => {
      let id: number | undefined
      try {
        id = await engine.addDecoder(config)
        const rows = await engine.decoderRows(config)
        return { id, config, rows, visible }
      } catch {
        if (id !== undefined) engine.removeDecoder(id)
        return null
      }
    })
  )
  const decoders: DecoderInst[] = made
    .filter((d) => d !== null)
    .map((d, n) => ({ ...d, name: NAMES[d.config.kind], color: DECODER_COLORS[n % DECODER_COLORS.length] }))
  if (!decoders.length) return
  set({ decoders, table: { decoder: decoders[0].id, row: 0, focus: null } })
  for (const d of decoders) engine.decode(d.id)
}

export async function updateDecoder(id: number, patch: Partial<DecoderConfig>) {
  const d = get().decoders.find((x) => x.id === id)
  if (!d) return
  const config = { ...d.config, ...patch } as DecoderConfig
  set({ decoders: get().decoders.map((x) => (x.id === id ? { ...x, config } : x)) })
  try {
    await engine.updateDecoder(id, config)
    engine.decode(id)
  } catch (e) {
    toast(String((e as Error).message ?? e))
  }
}

export function removeDecoder(id: number) {
  engine.removeDecoder(id)
  const decoders = get().decoders.filter((d) => d.id !== id)
  const table = get().table.decoder === id ? { decoder: decoders[0]?.id ?? null, row: 0, focus: null } : get().table
  set({ decoders, table })
}

export function toggleDecoderVisible(id: number) {
  set({ decoders: get().decoders.map((d) => (d.id === id ? { ...d, visible: !d.visible } : d)) })
}

/** Channels a decoder reads, for placing its rows under the last one. */
export function decoderChannels(cfg: DecoderConfig): number[] {
  const keys = { uart: ['channel'], i2c: ['scl', 'sda'], spi: ['clk', 'mosi', 'miso', 'cs'] }[cfg.kind]
  return keys.map((k) => cfg[k]).filter((v): v is number => typeof v === 'number')
}

// ---- files ----

export async function openFile() {
  const path = await bridge.openDialog()
  if (!path) return
  try {
    const names = await engine.load(path)
    set({ channels: makeChannels(names.length, names), follow: true, markers: { a: null, b: null } })
    await pollStatus()
    fit()
  } catch (e) {
    toast(String((e as Error).message ?? e))
  }
}

export async function saveFile(kind: 'sr' | 'vcd') {
  if (get().status.samples === 0) return toast('Nothing captured yet')
  const path = await bridge.saveDialog(kind)
  if (!path) return
  const names = get().channels.map((c) => c.name)
  try {
    await (kind === 'sr' ? engine.save(path, names) : engine.exportVcd(path, names))
    toast(`Saved ${path.split('/').pop()}`)
  } catch (e) {
    toast(String((e as Error).message ?? e))
  }
}
