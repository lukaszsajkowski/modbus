import { describe, it, expect } from 'vitest'
import { AppStore } from '../../../src/main/store/Store'
import type { KeyValueBackend } from '../../../src/main/store/Store'
import type { SerialParams } from '../../../src/main/modbus/types'

function memoryBackend(): KeyValueBackend {
  const map = new Map<string, unknown>()
  return {
    get: <T>(k: string) => map.get(k) as T | undefined,
    set: <T>(k: string, v: T) => void map.set(k, v)
  }
}

const params: SerialParams = {
  path: '/dev/tty.usbserial-1',
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  timeoutMs: 1000
}

describe('AppStore', () => {
  it('starts with empty connection profiles', () => {
    const store = new AppStore(memoryBackend())
    expect(store.getConnectionProfiles()).toEqual([])
  })

  it('saves and overwrites a connection profile by name', () => {
    const store = new AppStore(memoryBackend())
    store.saveConnectionProfile({ name: 'Daikin', params })
    store.saveConnectionProfile({ name: 'Daikin', params: { ...params, baudRate: 19200 } })
    const profiles = store.getConnectionProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].params.baudRate).toBe(19200)
  })

  it('persists last scan result', () => {
    const store = new AppStore(memoryBackend())
    expect(store.getLastScan()).toBeNull()
    store.setLastScan({ params, slaves: [21, 22], ts: 1000 })
    expect(store.getLastScan()?.slaves).toEqual([21, 22])
  })
})
