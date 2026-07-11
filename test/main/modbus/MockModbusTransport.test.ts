import { describe, it, expect } from 'vitest'
import { MockModbusTransport } from '../../../src/main/modbus/MockModbusTransport'

const params = {
  path: 'mock://daikin-ekwhctrl1',
  baudRate: 9600,
  dataBits: 8 as const,
  parity: 'none' as const,
  stopBits: 1 as const,
  timeoutMs: 1000
}

describe('MockModbusTransport', () => {
  it('connects and reports open state', async () => {
    const t = new MockModbusTransport()
    expect(t.isOpen()).toBe(false)
    await t.connect(params)
    expect(t.isOpen()).toBe(true)
    await t.close()
    expect(t.isOpen()).toBe(false)
  })

  it('reads seeded profile defaults for a responding slave (SPL 202 = raw 160)', async () => {
    const t = new MockModbusTransport()
    await t.connect(params)
    const regs = await t.read({ slave: 21, fc: 3, addr: 202, count: 1 })
    expect(regs).toEqual([160]) // SPL default 16.0 °C, scale 0.1
  })

  it('throws a TIMEOUT-coded error for a non-responding slave', async () => {
    const t = new MockModbusTransport()
    await t.connect(params)
    await expect(t.read({ slave: 99, fc: 3, addr: 0, count: 1 })).rejects.toMatchObject({
      code: 'TIMEOUT'
    })
  })

  it('round-trips a written register (FC06 then FC03)', async () => {
    const t = new MockModbusTransport()
    await t.connect(params)
    await t.write({ slave: 21, fc: 6, addr: 231, values: [205] }) // setpoint 20.5 °C raw
    const regs = await t.read({ slave: 21, fc: 3, addr: 231, count: 1 })
    expect(regs).toEqual([205])
  })

  it('rejects writes to a non-responding slave', async () => {
    const t = new MockModbusTransport()
    await t.connect(params)
    await expect(t.write({ slave: 99, fc: 6, addr: 231, values: [1] })).rejects.toMatchObject({
      code: 'TIMEOUT'
    })
  })
})
