import type { ModbusTransport, ReadRequest, SerialParams, WriteRequest } from './types'
import { getProfileById } from '../profiles/DeviceProfiles'
import { encode } from './DataCodec'

// Slaves the simulated bus answers on (mirrors the real Daikin setup: 21, 22).
const RESPONDING_SLAVES = [21, 22]
// Registers that gently wobble on each read, so the Dashboard shows live movement.
const LIVE_ADDRS = new Set([0, 1, 8]) // T1, T2, SP (temperatures)

function timeoutError(): Error & { code: string } {
  return Object.assign(new Error('mock: no response (simulated timeout)'), { code: 'TIMEOUT' })
}

/**
 * In-memory Modbus slave that impersonates a Daikin EKWHCTRL1, seeded from the
 * built-in device profile. Implements ModbusTransport so it drops into ModbusBus
 * exactly like the real serial transport — no hardware, no external process.
 * Selected via the "mock://" port (see transportFactory).
 */
export class MockModbusTransport implements ModbusTransport {
  private open = false
  private tick = 0
  private readonly regs = new Map<number, Map<number, number>>() // slave -> (addr -> raw uint16)

  constructor() {
    for (const slave of RESPONDING_SLAVES) this.regs.set(slave, this.seed())
  }

  async connect(_params: SerialParams): Promise<void> {
    this.open = true
  }

  async close(): Promise<void> {
    this.open = false
  }

  isOpen(): boolean {
    return this.open
  }

  // Mock link never "drops"; accept the callback and ignore it.
  onClose(_cb: () => void): void {}

  async read(req: ReadRequest): Promise<number[]> {
    if (!RESPONDING_SLAVES.includes(req.slave)) throw timeoutError()
    const map = this.regs.get(req.slave)!
    this.tick++
    const out: number[] = []
    for (let i = 0; i < req.count; i++) {
      const addr = req.addr + i
      let v = map.get(addr) ?? 0
      if (LIVE_ADDRS.has(addr)) {
        // ±3 raw units (~±0.3 °C) smooth wobble, deterministic per tick
        v += Math.round(Math.sin((this.tick + addr * 3) / 5) * 3)
      }
      out.push(req.fc === 1 || req.fc === 2 ? v & 1 : v & 0xffff)
    }
    return out
  }

  async write(req: WriteRequest): Promise<void> {
    if (!RESPONDING_SLAVES.includes(req.slave)) throw timeoutError()
    const map = this.regs.get(req.slave)!
    req.values.forEach((v, i) => map.set(req.addr + i, v & 0xffff))
  }

  private seed(): Map<number, number> {
    const m = new Map<number, number>()
    const profile = getProfileById('daikin-ekwhctrl1')
    if (profile) {
      for (const r of profile.registers) {
        if (r.kind === 'flags') {
          m.set(r.addr, 0)
        } else if (r.default !== undefined) {
          m.set(r.addr, encode(r.default, { type: r.type, scale: r.scale })[0])
        } else {
          m.set(r.addr, 0)
        }
      }
    }
    // Plausible live readings (registers without a profile default):
    m.set(0, 224) // T1  = 22.4 °C  (air temp)
    m.set(1, 280) // T2  = 28.0 °C  (water H2)
    m.set(8, 210) // SP  = 21.0 °C  (actual setpoint)
    m.set(15, 800) // MOT_SET motor speed
    m.set(9, 0b0011) // OUT flags: EV1 + EV2 on
    m.set(104, 0b0000_0010) // STAT: bit1 Mod.Risc (heating)
    m.set(105, 0) // ALR_STAT: no alarms
    return m
  }
}
