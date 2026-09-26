export interface DeviceInfo {
  id: string
  name: string
  driver: string
  channels: number
  samplerates: number[]
  defaultSamplerate: number
  note: string | null
  /** Firmware file a bare FX2 board needs that no firmware folder has. */
  missingFirmware: string | null
}

export type AcqState = 'idle' | 'starting' | 'waiting' | 'running' | 'done' | 'error'

export interface Status {
  state: AcqState
  message: string
  samples: number
  samplerate: number
  channels: number
  trigger: number | null
  captureId: number
  decoding: boolean
  decodeGen: number
}

export interface Annotation {
  start: number
  end: number
  row: number
  class: number
  text: string
}

export interface Measurement {
  high: boolean
  start: number
  end: number
  period: number | null
  highTime: number | null
}

export type TriggerCondition = 'rising' | 'falling' | 'edge' | 'high' | 'low'

export interface Channel {
  index: number
  name: string
  color: string
  visible: boolean
  trigger: TriggerCondition | null
}

export type DecoderKind = 'uart' | 'i2c' | 'spi'

export type DecoderConfig = { kind: DecoderKind } & Record<string, string | number | boolean | null>

export interface DecoderInst {
  id: number
  name: string
  color: string
  config: DecoderConfig
  rows: string[]
  visible: boolean
}

export const ANN = { DATA: 0, ADDRESS: 1, CONTROL: 2, ACK: 3, WARN: 4, ERROR: 5, DENSE: 255 } as const
