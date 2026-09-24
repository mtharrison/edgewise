import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceInfo } from './types'

vi.mock('./api', () => ({
  bridge: {},
  engine: { listDevices: vi.fn() }
}))

import { engine } from './api'
import { refreshDevices, sameFx2Model, selectDevice } from './actions'
import { useStore } from './store'

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
