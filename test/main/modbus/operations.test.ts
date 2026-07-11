import { describe, it, expect } from 'vitest'
import { ModbusBus } from '../../../src/main/modbus/ModbusBus'
import { busRead, busWrite } from '../../../src/main/modbus/operations'
import type { ModbusTransport } from '../../../src/main/modbus/types'

function transport(overrides: Partial<ModbusTransport> = {}): ModbusTransport {
  return {
    connect: async () => {},
    close: async () => {},
    isOpen: () => true,
    read: async () => [42],
    write: async () => {},
    ...overrides
  }
}

describe('busRead / busWrite', () => {
  it('returns ok with raw registers on success', async () => {
    const bus = new ModbusBus(transport(), { interFrameDelayMs: 0 })
    const res = await busRead(bus, { slave: 21, fc: 3, addr: 0, count: 1 })
    expect(res).toEqual({ ok: true, value: [42] })
  })

  it('maps modbus exception to Err with MODBUS_EXCEPTION', async () => {
    const boom = Object.assign(new Error('Illegal address'), { modbusCode: 2 })
    const bus = new ModbusBus(transport({ read: async () => { throw boom } }), { interFrameDelayMs: 0 })
    const res = await busRead(bus, { slave: 21, fc: 3, addr: 999, count: 1 })
    expect(res).toEqual({ ok: false, code: 'MODBUS_EXCEPTION', message: 'Illegal address' })
  })

  it('returns ok on successful write', async () => {
    let written: unknown = null
    const bus = new ModbusBus(transport({ write: async (r) => { written = r } }), { interFrameDelayMs: 0 })
    const res = await busWrite(bus, { slave: 21, fc: 6, addr: 231, values: [200] })
    expect(res).toEqual({ ok: true, value: undefined })
    expect(written).toEqual({ slave: 21, fc: 6, addr: 231, values: [200] })
  })
})
