import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceInfo, Status } from './types'

vi.mock('./api', () => ({
  bridge: {},
  engine: {
    listDevices: vi.fn(),
    addDecoder: vi.fn(),
    decoderRows: vi.fn(),
    decode: vi.fn(),
    removeDecoder: vi.fn(),
    status: vi.fn()
  }
}))

import { engine } from './api'
import {
  addDecoder,
  cycleTrigger,
  DECODER_DEFAULTS,
  pollStatus,
  refreshDevices,
  resetSettings,
  restoreSettings,
  sameFx2Model,
  selectDevice,
  setTrigger,
  updateChannel
} from './actions'
import { toSaved } from './settings'
import { makeChannels, useStore } from './store'

function device(id: string, overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    id,
    name: id,
    driver: 'fx2lafw',
    channels: 8,
    samplerates: [20_000_000],
    defaultSamplerate: 20_000_000,
    note: null,
    ...overrides
  }
}

const demo = device('demo', { driver: 'demo' })
const boardOnPortA = device('fx2:0925:3881:1')
const boardOnPortB = device('fx2:0925:3881:2')
const otherModel = device('fx2:1234:5678:1')

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  vi.mocked(engine.listDevices).mockReset()
  vi.mocked(engine.removeDecoder).mockReset()
  let nextId = 1
  vi.mocked(engine.addDecoder).mockImplementation(async () => nextId++)
  vi.mocked(engine.decoderRows).mockResolvedValue(['Data'])
})

describe('sameFx2Model', () => {
  it('matches the same vendor:product id on a different port', () => {
    expect(sameFx2Model(boardOnPortA.id, boardOnPortB.id)).toBe(true)
  })

  it('does not match a different vendor:product id', () => {
    expect(sameFx2Model(boardOnPortA.id, otherModel.id)).toBe(false)
  })

  it('never matches a non-fx2 id such as the demo device', () => {
    expect(sameFx2Model(demo.id, demo.id)).toBe(false)
    expect(sameFx2Model(boardOnPortA.id, demo.id)).toBe(false)
  })
})

describe('refreshDevices', () => {
  it('keeps a vanished selection selected and marks it disconnected', async () => {
    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo, boardOnPortA])
    await refreshDevices()
    selectDevice(boardOnPortA.id)

    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo])
    await refreshDevices()

    const state = useStore.getState()
    expect(state.deviceId).toBe(boardOnPortA.id)
    expect(state.deviceConnected).toBe(false)
    expect(state.devices.map((d) => d.id)).toContain(boardOnPortA.id)
  })

  it('reselects the same model when it reappears on a different port', async () => {
    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo, boardOnPortA])
    await refreshDevices()
    selectDevice(boardOnPortA.id)

    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo])
    await refreshDevices()
    expect(useStore.getState().deviceConnected).toBe(false)

    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo, boardOnPortB])
    await refreshDevices()

    const state = useStore.getState()
    expect(state.deviceId).toBe(boardOnPortB.id)
    expect(state.deviceConnected).toBe(true)
  })

  it('does not reselect a device with a different vendor:product id', async () => {
    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo, boardOnPortA])
    await refreshDevices()
    selectDevice(boardOnPortA.id)

    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo])
    await refreshDevices()

    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo, otherModel])
    await refreshDevices()

    const state = useStore.getState()
    expect(state.deviceId).toBe(boardOnPortA.id)
    expect(state.deviceConnected).toBe(false)
  })

  it('does not reselect a manually deselected device once it reappears', async () => {
    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo, boardOnPortA])
    await refreshDevices()
    selectDevice(boardOnPortA.id)

    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo])
    await refreshDevices()
    expect(useStore.getState().deviceConnected).toBe(false)

    selectDevice(demo.id)
    expect(useStore.getState().devices.map((d) => d.id)).not.toContain(boardOnPortA.id)

    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo, boardOnPortB])
    await refreshDevices()

    expect(useStore.getState().deviceId).toBe(demo.id)
  })
})

describe('cycleTrigger', () => {
  const triggerOf = (index: number) => useStore.getState().channels.find((c) => c.index === index)?.trigger

  it('steps from none through rising, falling, any edge, high, low and back to none', () => {
    const seen = []
    for (let i = 0; i < 6; i++) {
      cycleTrigger(3)
      seen.push(triggerOf(3))
    }
    expect(seen).toEqual(['rising', 'falling', 'edge', 'high', 'low', null])
  })

  it('goes from falling to any edge without touching other channels', () => {
    setTrigger(0, 'high')
    setTrigger(3, 'falling')

    cycleTrigger(3)

    expect(triggerOf(3)).toBe('edge')
    expect(triggerOf(0)).toBe('high')
    expect(useStore.getState().channels.filter((c) => c.trigger !== null)).toHaveLength(2)
  })
})

function status(overrides: Partial<Status> = {}): Status {
  return { ...useStore.getInitialState().status, ...overrides }
}

/** Saved with the 16-channel board: TX on D0, D7 hidden, rising on D2, UART at 9600, I²C on D11/D12. */
function savedWithBoard() {
  const channels = makeChannels(16)
  channels[0] = { ...channels[0], name: 'TX' }
  channels[2] = { ...channels[2], trigger: 'rising' }
  channels[7] = { ...channels[7], visible: false }
  return toSaved({
    deviceId: boardOnPortA.id,
    samplerate: 24_000_000,
    duration: 1,
    pretrigger: 0.3,
    channels,
    decoders: [
      { id: 0, name: '', color: '', rows: [], visible: true, config: { ...DECODER_DEFAULTS.uart, baud: 9600 } },
      { id: 0, name: '', color: '', rows: [], visible: false, config: { ...DECODER_DEFAULTS.i2c, scl: 11, sda: 12 } }
    ]
  })
}

const board16 = device(boardOnPortA.id, { channels: 16, samplerates: [20_000_000, 24_000_000] })

describe('restoreSettings', () => {
  it('restores device, rate, channels and decoders on the next refresh', async () => {
    restoreSettings(savedWithBoard())
    expect(useStore.getState()).toMatchObject({ duration: 1, pretrigger: 0.3 })

    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo, board16])
    await refreshDevices()

    const s = useStore.getState()
    expect(s).toMatchObject({ deviceId: board16.id, samplerate: 24_000_000, deviceConnected: true })
    expect(s.channels).toHaveLength(16)
    expect(s.channels[0].name).toBe('TX')
    expect(s.channels[2].trigger).toBe('rising')
    expect(s.channels[7].visible).toBe(false)
    expect(s.decoders.map((d) => [d.name, d.config.baud ?? null, d.visible, d.rows])).toEqual([
      ['UART', 9600, true, ['Data']],
      ['I²C', null, false, ['Data']]
    ])
  })

  it('drops decoders that do not fit the device or that the engine rejects', async () => {
    vi.mocked(engine.decoderRows).mockRejectedValueOnce(new Error('bad config'))
    restoreSettings(savedWithBoard())
    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo])
    await refreshDevices()

    const s = useStore.getState()
    expect(s.deviceId).toBe(demo.id)
    expect(s.samplerate).toBe(demo.defaultSamplerate)
    expect(s.channels.map((c) => c.name)).toEqual(['TX', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'])
    expect(s.decoders).toEqual([])
    expect(engine.removeDecoder).toHaveBeenCalledOnce()
    expect(s.toast).toBeNull()
  })

  it('leaves later refreshes to the in-session rules', async () => {
    restoreSettings(savedWithBoard())
    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo, board16])
    await refreshDevices()
    selectDevice(demo.id)

    vi.mocked(engine.listDevices).mockResolvedValueOnce([demo, board16])
    await refreshDevices()

    expect(useStore.getState().deviceId).toBe(demo.id)
    expect(engine.addDecoder).toHaveBeenCalledTimes(2)
  })
})

describe('pollStatus channel list', () => {
  beforeEach(() => {
    useStore.setState({ channels: makeChannels(8, ['TX', 'RX', 'SCL', 'SDA', 'CLK', 'MOSI', 'MISO', 'CS']) })
  })

  it('keeps restored names when the status reports the same count', async () => {
    vi.mocked(engine.status).mockResolvedValueOnce(status({ channels: 8, samples: 100 }))
    await pollStatus()
    expect(useStore.getState().channels[0].name).toBe('TX')
  })

  it('keeps D0–D7 names when a capture has 16 channels', async () => {
    vi.mocked(engine.status).mockResolvedValueOnce(status({ channels: 16, samples: 100 }))
    await pollStatus()
    const names = useStore.getState().channels.map((c) => c.name)
    expect(names).toHaveLength(16)
    expect(names.slice(0, 3)).toEqual(['TX', 'RX', 'SCL'])
    expect(names[8]).toBe('D8')
  })

  it('does not follow the count before anything is captured', async () => {
    vi.mocked(engine.status).mockResolvedValueOnce(status({ channels: 16, samples: 0 }))
    await pollStatus()
    expect(useStore.getState().channels).toHaveLength(8)
  })
})

describe('resetSettings', () => {
  async function customise() {
    vi.mocked(engine.listDevices).mockResolvedValueOnce([board16, demo])
    await refreshDevices()
    selectDevice(demo.id)
    useStore.setState({ samplerate: 1_000_000, duration: 1, pretrigger: 0.3 })
    updateChannel(0, { name: 'TX', visible: false })
    setTrigger(2, 'rising')
    await addDecoder('uart')
  }

  it('puts every setting back to its default without touching the capture', async () => {
    await customise()
    const capture = status({ state: 'done', samples: 1234, captureId: 3 })
    useStore.setState({ status: capture })

    resetSettings()

    const s = useStore.getState()
    expect(s).toMatchObject({ deviceId: board16.id, samplerate: 20_000_000, duration: 0.1, pretrigger: 0.1, decoders: [] })
    expect(s.channels).toEqual(makeChannels(16))
    expect(s.table.decoder).toBeNull()
    expect(engine.removeDecoder).toHaveBeenCalledOnce()
    expect(s.status).toBe(capture)
  })

  it('does nothing while a capture is running', async () => {
    await customise()
    useStore.setState({ status: status({ state: 'running' }) })
    const before = useStore.getState()

    resetSettings()

    expect(useStore.getState()).toBe(before)
    expect(engine.removeDecoder).not.toHaveBeenCalled()
  })
})
