import { describe, it, expect } from 'vitest'
import { makeScanTarget } from '../../../src/main/modbus/TransportScanTarget'
import type { ModbusTransport } from '../../../src/main/modbus/types'

const params = {
  path: '/dev/x', baudRate: 9600, dataBits: 8 as const, parity: 'none' as const,
  stopBits: 1 as const, timeoutMs: 200
}

function transportRespondingAt(slaves: number[]): ModbusTransport {
  let open = false
  return {
    connect: async () => { open = true },
    close: async () => { open = false },
    isOpen: () => open,
    read: async (req) => {
      if (!slaves.includes(req.slave)) throw new Error('timeout')
      return [0]
    },
    write: async () => {}
  }
}

describe('makeScanTarget', () => {
  it('probe resolves true when the light read succeeds', async () => {
    const target = makeScanTarget(() => transportRespondingAt([21]))
    const prober = await target.withParams(params)
    expect(await prober.probe(21)).toBe(true)
    expect(await prober.probe(22)).toBe(false)
    await prober.close()
  })
})
