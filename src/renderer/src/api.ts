import type { Annotation, DecoderConfig, DeviceInfo, Measurement, Status } from './types'

interface Bridge {
  call: (method: string, ...args: unknown[]) => Promise<any>
  openDialog: () => Promise<string | null>
  saveDialog: (kind: 'sr' | 'vcd') => Promise<string | null>
  openFirmwareFolder: () => Promise<void>
  onMenu: (cb: (cmd: string) => void) => () => void
  platform: string
}

declare global {
  interface Window {
    edgewise: Bridge
  }
}

export const bridge = window.edgewise
const call = bridge.call

/** Typed wrapper over the Rust engine living in the main process. */
export const engine = {
  listDevices: (): Promise<DeviceInfo[]> => call('listDevices'),
  start: (opts: {
    deviceId: string
    samplerate: number
    sampleLimit: number
    trigger: { channel: number; condition: string }[]
    pretrigger: number
  }): Promise<void> => call('start', opts),
  stop: (): Promise<void> => call('stop'),
  status: (): Promise<Status> => call('status'),
  render: (start: number, spp: number, width: number): Promise<Uint16Array> => call('render', start, spp, width),
  samples: (start: number, count: number): Promise<Uint16Array> => call('samples', start, count),
  measure: (channel: number, sample: number): Promise<Measurement | null> => call('measure', channel, sample),
  findEdge: (channel: number, from: number, forward: boolean): Promise<number | null> =>
    call('findEdge', channel, from, forward),
  burstAt: (channel: number, sample: number, maxGap: number, tolerance: number): Promise<{ start: number; end: number } | null> =>
    call('burstAt', channel, sample, maxGap, tolerance),
  addDecoder: (cfg: DecoderConfig): Promise<number> => call('addDecoder', cfg),
  updateDecoder: (id: number, cfg: DecoderConfig): Promise<void> => call('updateDecoder', id, cfg),
  removeDecoder: (id: number): Promise<void> => call('removeDecoder', id),
  decode: (id: number): Promise<void> => call('decode', id),
  decoderRows: (cfg: DecoderConfig): Promise<string[]> => call('decoderRows', cfg),
  annotations: (id: number, row: number, start: number, end: number, minWidth: number, limit: number): Promise<Annotation[]> =>
    call('annotations', id, row, start, end, minWidth, limit),
  annotationPage: (id: number, row: number, offset: number, limit: number): Promise<{ total: number; items: Annotation[] }> =>
    call('annotationPage', id, row, offset, limit),
  annotationIndex: (id: number, row: number, sample: number): Promise<number> => call('annotationIndex', id, row, sample),
  load: (path: string): Promise<string[]> => call('load', path),
  save: (path: string, names: string[]): Promise<void> => call('save', path, names),
  exportVcd: (path: string, names: string[]): Promise<void> => call('exportVcd', path, names)
}
