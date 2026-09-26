import { create } from 'zustand'
import type { Channel, DecoderInst, DeviceInfo, Measurement, Status } from './types'

export const PALETTE = [
  '#ff6b9a', '#ff9f43', '#ffd43b', '#51cf66', '#22d3ee', '#4dabf7', '#9775fa', '#f783ac',
  '#ffa94d', '#a9e34b', '#3bc9db', '#748ffc', '#da77f2', '#ff8787', '#63e6be', '#e599f7'
]
export const DECODER_COLORS = ['#7c6cff', '#22d3ee', '#ff9f43', '#51cf66', '#ff6b9a', '#ffd43b']

export function makeChannels(n: number, names?: string[]): Channel[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    name: names?.[i] ?? `D${i}`,
    color: PALETTE[i % PALETTE.length],
    visible: true,
    trigger: null
  }))
}

export interface View {
  /** First visible sample (fractional). */
  start: number
  /** Samples per CSS pixel. */
  spp: number
}

export interface Hover {
  sample: number
  channel: number | null
  x: number
  y: number
}

export const DURATIONS = [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10, 30, 0]

export interface State {
  devices: DeviceInfo[]
  deviceId: string | null
  deviceConnected: boolean
  /** A full device scan (including sigrok-cli) is running. */
  scanning: boolean
  samplerate: number
  duration: number
  pretrigger: number
  status: Status
  channels: Channel[]
  decoders: DecoderInst[]
  view: View
  plotWidth: number
  follow: boolean
  markers: { a: number | null; b: number | null }
  hover: Hover | null
  measurement: Measurement | null
  table: { decoder: number | null; row: number; focus: number | null }
  toast: string | null
}

export const useStore = create<State>(() => ({
  devices: [],
  deviceId: null,
  deviceConnected: true,
  scanning: false,
  samplerate: 20_000_000,
  duration: 0.1,
  pretrigger: 0.1,
  status: {
    state: 'idle',
    message: '',
    samples: 0,
    samplerate: 20_000_000,
    channels: 8,
    trigger: null,
    captureId: 0,
    decoding: false,
    decodeGen: 0
  },
  channels: makeChannels(8),
  decoders: [],
  view: { start: 0, spp: 1000 },
  plotWidth: 1000,
  follow: true,
  markers: { a: null, b: null },
  hover: null,
  measurement: null,
  table: { decoder: null, row: 0, focus: null },
  toast: null
}))

export const set = useStore.setState
export const get = useStore.getState
