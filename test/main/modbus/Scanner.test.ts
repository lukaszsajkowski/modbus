import { describe, it, expect } from 'vitest'
import { quickScan, deepScan } from '../../../src/main/modbus/Scanner'
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

describe('deepScan', () => {
  it('finds the working config and responding slaves', async () => {
    // odpowiada tylko przy 9600 / none / 1 na adresach 21,22
    const target: ScanTarget = {
      withParams: async (p) => ({
        probe: async (slave) =>
          p.baudRate === 9600 &&
          p.parity === 'none' &&
          p.stopBits === 1 &&
          (slave === 21 || slave === 22),
        close: async () => {}
      })
    }
    const result = await deepScan(target, {
      basePath: '/dev/x',
      timeoutMs: 300,
      bauds: [19200, 9600],
      parities: ['even', 'none'],
      stopBits: [1],
      slaveRange: [20, 23]
    })
    expect(result.params).toMatchObject({ baudRate: 9600, parity: 'none', stopBits: 1 })
    expect(result.found).toEqual([21, 22])
  })

  it('returns null params when nothing responds', async () => {
    const target: ScanTarget = {
      withParams: async () => ({ probe: async () => false, close: async () => {} })
    }
    const result = await deepScan(target, {
      basePath: '/dev/x',
      timeoutMs: 300,
      bauds: [9600],
      parities: ['none'],
      stopBits: [1],
      slaveRange: [1, 2]
    })
    expect(result.params).toBeNull()
    expect(result.found).toEqual([])
  })
})
