import { bridge, engine } from './api'
import { DECODER_COLORS, get, makeChannels, set } from './store'
import type { DecoderConfig, DecoderInst, Status, TriggerCondition } from './types'
import { clampViewTo, frameRange } from './view'

const TRIGGER_CYCLE: (TriggerCondition | null)[] = [null, 'rising', 'falling', 'high', 'low']

export function toast(msg: string) {
  set({ toast: msg })
  setTimeout(() => get().toast === msg && set({ toast: null }), 4000)
}

export async function refreshDevices() {
  const devices = await engine.listDevices()
  const { deviceId } = get()
  const keep = devices.find((d) => d.id === deviceId)
  set({ devices })
  if (!keep && devices.length) selectDevice(devices[0].id)
}

export function selectDevice(id: string) {
  const dev = get().devices.find((d) => d.id === id)
  if (!dev) return
  const rate = dev.samplerates.includes(get().samplerate) ? get().samplerate : dev.defaultSamplerate
  set({ deviceId: id, samplerate: rate })
  if (get().channels.length !== dev.channels) set({ channels: makeChannels(dev.channels) })
}

export function isBusy(s: Status) {
  return s.state === 'starting' || s.state === 'waiting' || s.state === 'running'
}

export async function startCapture() {
  const { deviceId, samplerate, duration, channels, pretrigger } = get()
  if (!deviceId) return toast('No device selected')
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
  if (s.channels !== get().channels.length) set({ channels: makeChannels(s.channels) })

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
export function frameAnnotation(start: number, end: number) {
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
