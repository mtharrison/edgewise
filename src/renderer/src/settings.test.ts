import { describe, expect, it, vi } from 'vitest'
import type { DeviceInfo } from './types'

vi.mock('./api', () => ({ bridge: {}, engine: {} }))

import { DECODER_DEFAULTS } from './actions'
import { fitToDevice, parseSaved, toSaved, type Saved } from './settings'
import { makeChannels } from './store'

function device(id: string, overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    id,
    name: id,
    driver: 'fx2lafw',
    channels: 8,
    samplerates: [1_000_000, 20_000_000, 24_000_000],
    defaultSamplerate: 20_000_000,
    note: null,
    missingFirmware: null,
    ...overrides
  }
}

const demo = device('demo', { driver: 'demo', samplerates: [1_000_000, 20_000_000], defaultSamplerate: 1_000_000 })
const board = device('fx2:0925:3881:1', { channels: 16 })

function customised(): Saved {
  const channels = makeChannels(16)
  channels[0] = { ...channels[0], name: 'TX', color: '#123456' }
  channels[2] = { ...channels[2], trigger: 'rising' }
  channels[7] = { ...channels[7], visible: false }
  return toSaved({
    deviceId: board.id,
    samplerate: 24_000_000,
    duration: 1,
    pretrigger: 0.3,
    channels,
    decoders: [
      { id: 4, name: 'UART', color: '#fff', rows: ['RX'], visible: false, config: { ...DECODER_DEFAULTS.uart, baud: 9600 } },
      { id: 5, name: 'I²C', color: '#fff', rows: [], visible: true, config: { ...DECODER_DEFAULTS.i2c, scl: 11, sda: 12 } }
    ]
  })
}

describe('parseSaved', () => {
  it('round-trips every remembered field', () => {
    const saved = customised()
    const back = parseSaved(JSON.stringify(saved))
    expect(back).toEqual(saved)
    expect(back?.channels[0]).toEqual({ name: 'TX', color: '#123456', visible: true, trigger: null })
    expect(back?.channels[2]?.trigger).toBe('rising')
    expect(back?.channels[7]?.visible).toBe(false)
    expect(back?.decoders[0]).toEqual({ visible: false, config: { ...DECODER_DEFAULTS.uart, baud: 9600 } })
  })

  it('returns null for missing, unreadable or unknown-version data', () => {
    expect(parseSaved(null)).toBeNull()
    expect(parseSaved('')).toBeNull()
    expect(parseSaved('{not json')).toBeNull()
    expect(parseSaved('[]')).toBeNull()
    expect(parseSaved(JSON.stringify({ ...customised(), version: 2 }))).toBeNull()
  })

  it('replaces an invalid duration and pre-trigger with the defaults', () => {
    const back = parseSaved(JSON.stringify({ ...customised(), duration: 3, pretrigger: 0.95 }))
    expect(back?.duration).toBe(0.1)
    expect(back?.pretrigger).toBe(0.1)
  })

  it('drops decoders of unknown kind and fills missing fields from the defaults', () => {
    const text = JSON.stringify({ ...customised(), decoders: [{ config: { kind: 'can' }, visible: true }, { config: { kind: 'uart', baud: 9600 } }] })
    expect(parseSaved(text)?.decoders).toEqual([{ visible: true, config: { ...DECODER_DEFAULTS.uart, baud: 9600 } }])
  })
})

describe('fitToDevice', () => {
  it('selects the remembered device with its settings', () => {
    const fitted = fitToDevice(customised(), [demo, board])!
    expect(fitted.deviceId).toBe(board.id)
    expect(fitted.samplerate).toBe(24_000_000)
    expect(fitted.channels).toHaveLength(16)
    expect(fitted.channels[0]).toMatchObject({ index: 0, name: 'TX', color: '#123456' })
    expect(fitted.decoders).toHaveLength(2)
  })

  it('selects the same FX2 model on another port', () => {
    expect(fitToDevice(customised(), [demo, device('fx2:0925:3881:7', { channels: 16 })])?.deviceId).toBe('fx2:0925:3881:7')
  })

  it('falls back to the first device and its default rate when the remembered one is absent', () => {
    const fitted = fitToDevice(customised(), [demo])!
    expect(fitted.deviceId).toBe(demo.id)
    expect(fitted.samplerate).toBe(demo.defaultSamplerate)
  })

  it('keeps the remembered rate on a fallback device that supports it', () => {
    expect(fitToDevice({ ...customised(), samplerate: 20_000_000 }, [demo])?.samplerate).toBe(20_000_000)
  })

  it('keeps D0–D7 and drops a decoder on D12 when only 8 channels exist', () => {
    const fitted = fitToDevice(customised(), [demo])!
    expect(fitted.channels).toHaveLength(8)
    expect(fitted.channels.map((c) => c.name)).toEqual(['TX', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'])
    expect(fitted.channels[2].trigger).toBe('rising')
    expect(fitted.channels[7].visible).toBe(false)
    expect(fitted.decoders.map((d) => d.config.kind)).toEqual(['uart'])
  })

  it('returns null with no devices listed', () => {
    expect(fitToDevice(customised(), [])).toBeNull()
  })
})
