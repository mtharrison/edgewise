import { DECODER_DEFAULTS, decoderChannels, sameFx2Model } from './actions'
import { DURATIONS, makeChannels, type State } from './store'
import type { Channel, DecoderConfig, DeviceInfo, TriggerCondition } from './types'

/** The capture settings kept across launches (spec: app-shell, Remembered capture settings). */
export interface SavedChannel {
  name: string
  color: string
  visible: boolean
  trigger: TriggerCondition | null
}

export interface SavedDecoder {
  config: DecoderConfig
  visible: boolean
}

export interface Saved {
  version: 1
  deviceId: string | null
  samplerate: number
  duration: number
  pretrigger: number
  channels: (SavedChannel | null)[]
  decoders: SavedDecoder[]
}

const KEY = 'edgewise.settings'
const DEFAULT_DURATION = 0.1
const DEFAULT_PRETRIGGER = 0.1
const TRIGGERS: (TriggerCondition | null)[] = [null, 'rising', 'falling', 'edge', 'high', 'low']

export function toSaved(s: Pick<State, 'deviceId' | 'samplerate' | 'duration' | 'pretrigger' | 'channels' | 'decoders'>): Saved {
  return {
    version: 1,
    deviceId: s.deviceId,
    samplerate: s.samplerate,
    duration: s.duration,
    pretrigger: s.pretrigger,
    channels: s.channels.map(({ name, color, visible, trigger }) => ({ name, color, visible, trigger })),
    decoders: s.decoders.map(({ config, visible }) => ({ config, visible }))
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function parseChannel(v: unknown): SavedChannel | null {
  if (!isObj(v)) return null
  const { name, color, visible, trigger } = v
  if (typeof name !== 'string' || typeof color !== 'string' || typeof visible !== 'boolean') return null
  if (!TRIGGERS.includes(trigger as TriggerCondition | null)) return null
  return { name, color, visible, trigger: trigger as TriggerCondition | null }
}

function parseDecoder(v: unknown): SavedDecoder | null {
  if (!isObj(v) || !isObj(v.config)) return null
  const defaults = DECODER_DEFAULTS[v.config.kind as string]
  if (!defaults) return null
  const config = { ...defaults }
  for (const [k, val] of Object.entries(v.config)) {
    // Numeric fields may be null (e.g. an unused SPI line).
    const ok = typeof val === typeof defaults[k] || (val === null && typeof defaults[k] === 'number')
    if (k in defaults && ok) config[k] = val as string | number | boolean | null
  }
  return { config, visible: typeof v.visible === 'boolean' ? v.visible : true }
}

/** Reads saved settings; `null` if missing, unreadable or from an unknown version. */
export function parseSaved(text: string | null): Saved | null {
  if (!text) return null
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObj(v) || v.version !== 1) return null
  const { deviceId, samplerate, duration, pretrigger, channels, decoders } = v
  return {
    version: 1,
    deviceId: typeof deviceId === 'string' ? deviceId : null,
    samplerate: typeof samplerate === 'number' ? samplerate : 0,
    duration: typeof duration === 'number' && DURATIONS.includes(duration) ? duration : DEFAULT_DURATION,
    pretrigger: typeof pretrigger === 'number' && pretrigger >= 0 && pretrigger <= 0.9 ? pretrigger : DEFAULT_PRETRIGGER,
    channels: Array.isArray(channels) ? channels.map(parseChannel) : [],
    decoders: Array.isArray(decoders) ? decoders.map(parseDecoder).filter((d): d is SavedDecoder => d !== null) : []
  }
}

export function load(): Saved | null {
  try {
    return parseSaved(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function save(saved: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {}
}

/** `n` default channels with the given per-index settings laid over them. */
export function overlayChannels(n: number, over: (SavedChannel | null)[]): Channel[] {
  return makeChannels(n).map((c, i) => (over[i] ? { ...c, ...over[i], index: i } : c))
}

export interface Fitted {
  deviceId: string
  samplerate: number
  channels: Channel[]
  decoders: SavedDecoder[]
}

/** Fits saved settings to the listed devices; `null` if no device is listed. */
export function fitToDevice(saved: Saved, devices: DeviceInfo[]): Fitted | null {
  const { deviceId } = saved
  const dev =
    (deviceId && (devices.find((d) => d.id === deviceId) ?? devices.find((d) => sameFx2Model(d.id, deviceId)))) || devices[0]
  if (!dev) return null
  return {
    deviceId: dev.id,
    samplerate: dev.samplerates.includes(saved.samplerate) ? saved.samplerate : dev.defaultSamplerate,
    channels: overlayChannels(dev.channels, saved.channels),
    decoders: saved.decoders.filter((d) => decoderChannels(d.config).every((ch) => ch < dev.channels))
  }
}
