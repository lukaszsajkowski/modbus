import type { NumericType } from '../modbus/DataCodec'
import type { Parity } from '../modbus/types'

export type Access = 'R' | 'RW'

export interface FlagBitEnum {
  enum: Record<string, string>
}

export type FlagBitDef = string | FlagBitEnum

export interface NumericRegister {
  addr: number
  mnem: string
  name: string
  access: Access
  type: NumericType
  scale?: number
  unit?: string
  min?: number
  max?: number
  default?: number
  kind?: undefined
}

export interface FlagsRegister {
  addr: number
  mnem: string
  name: string
  access: Access
  kind: 'flags'
  bits: Record<string, FlagBitDef>
}

export type RegisterDef = NumericRegister | FlagsRegister

export interface DeviceProfile {
  id: string
  name: string
  serial: { baud: number; dataBits: number; parity: Parity; stopBits: number }
  functions: string[]
  registers: RegisterDef[]
}

function req(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Invalid profile: ${msg}`)
}

export function validateProfile(obj: unknown): DeviceProfile {
  const p = obj as Record<string, unknown>
  req(typeof p?.id === 'string' && p.id.length > 0, 'missing id')
  req(typeof p?.name === 'string' && p.name.length > 0, 'missing name')
  req(typeof p?.serial === 'object' && p.serial !== null, 'missing serial')
  req(Array.isArray(p?.functions), 'missing functions')
  req(Array.isArray(p?.registers), 'missing registers')

  const seen = new Set<number>()
  for (const r of p.registers as Array<Record<string, unknown>>) {
    const addr = r.addr as number
    req(typeof r.addr === 'number' && addr >= 0, `addr must be a non-negative number (mnem ${String(r.mnem)})`)
    req(!seen.has(addr), `duplicate register address ${addr}`)
    seen.add(addr)
    req(typeof r.mnem === 'string' && r.mnem.length > 0, `missing mnem at addr ${r.addr}`)
    req(typeof r.name === 'string' && r.name.length > 0, `missing name at addr ${r.addr}`)
    req(r.access === 'R' || r.access === 'RW', `invalid access at addr ${r.addr}`)
    if (r.kind === 'flags') {
      req(typeof r.bits === 'object' && r.bits !== null, `flags register ${r.addr} missing bits`)
    } else {
      req(typeof r.type === 'string', `numeric register ${r.addr} missing type`)
    }
  }
  return obj as DeviceProfile
}
