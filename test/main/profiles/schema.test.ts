import { describe, it, expect } from 'vitest'
import { validateProfile } from '../../../src/main/profiles/schema'

const valid = {
  id: 'x',
  name: 'X',
  serial: { baud: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
  functions: ['FC03', 'FC06'],
  registers: [
    { addr: 0, mnem: 'T1', name: 'Temp', access: 'R', type: 'uint16', scale: 0.1, unit: '°C' },
    { addr: 201, mnem: 'PRG', name: 'Tryb', access: 'RW', kind: 'flags',
      bits: { '0-2': { enum: { '0': 'Auto', '1': 'Silent' } }, '4': 'Lock' } }
  ]
}

describe('validateProfile', () => {
  it('accepts a valid profile', () => {
    const p = validateProfile(valid)
    expect(p.id).toBe('x')
    expect(p.registers).toHaveLength(2)
  })

  it('rejects missing id', () => {
    expect(() => validateProfile({ ...valid, id: undefined })).toThrow(/id/)
  })

  it('rejects duplicate register addresses', () => {
    const dup = { ...valid, registers: [valid.registers[0], { ...valid.registers[0] }] }
    expect(() => validateProfile(dup)).toThrow(/duplicate/i)
  })

  it('rejects invalid access value', () => {
    const bad = { ...valid, registers: [{ ...valid.registers[0], access: 'X' }] }
    expect(() => validateProfile(bad)).toThrow(/access/i)
  })

  it('rejects negative addr', () => {
    const bad = { ...valid, registers: [{ ...valid.registers[0], addr: -1 }] }
    expect(() => validateProfile(bad)).toThrow(/addr/i)
  })
})
