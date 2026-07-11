import { describe, it, expect } from 'vitest'
import { quickScan } from '../../../src/main/modbus/Scanner'
import type { ScanTarget, Prober } from '../../../src/main/modbus/Scanner'
import type { SerialParams } from '../../../src/main/modbus/types'

const params: SerialParams = {
  path: '/dev/x', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, timeoutMs: 500
}

function targetRespondingAt(slaves: number[]): ScanTarget {
  return {
    withParams: async (): Promise<Prober> => ({
      probe: async (slave: number) => slaves.includes(slave),
      close: async () => {}
    })
  }
}

describe('quickScan', () => {
  it('returns slaves that respond within range', async () => {
    const result = await quickScan(targetRespondingAt([21, 22]), {
      params,
      slaveRange: [20, 23]
    })
    expect(result.found).toEqual([21, 22])
    expect(result.params).toEqual(params)
  })

  it('reports progress for each address', async () => {
    const seen: Array<[number, number]> = []
    await quickScan(targetRespondingAt([]), {
      params,
      slaveRange: [1, 3],
      onProgress: (done, total) => seen.push([done, total])
    })
    expect(seen).toEqual([[1, 3], [2, 3], [3, 3]])
  })

  it('stops early when aborted', async () => {
    const controller = new AbortController()
    let probed = 0
    const target: ScanTarget = {
      withParams: async () => ({
        probe: async () => {
          probed++
          if (probed === 2) controller.abort()
          return false
        },
        close: async () => {}
      })
    }
    const result = await quickScan(target, {
      params,
      slaveRange: [1, 10],
      signal: controller.signal
    })
    expect(probed).toBe(2)
    expect(result.found).toEqual([])
  })
})
