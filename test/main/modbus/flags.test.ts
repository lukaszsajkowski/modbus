import { describe, it, expect } from 'vitest'
import { decodeFlags, setBit, setBitRange } from '../../../src/main/modbus/flags'

const prgBits = {
  '0-2': { enum: { '0': 'Auto', '1': 'Silent', '2': 'Night', '3': 'Max' } },
  '4': 'Lock',
  '7': 'Standby'
}

describe('decodeFlags', () => {
  it('decodes single bit as boolean', () => {
    // bit4 set, bit7 clear -> raw 0x10
    const flags = decodeFlags(0x10, prgBits)
    const lock = flags.find((f) => f.key === '4')!
    expect(lock).toMatchObject({ kind: 'bool', label: 'Lock', value: true })
    const stby = flags.find((f) => f.key === '7')!
    expect(stby).toMatchObject({ kind: 'bool', value: false })
  })

  it('decodes a bit range to an enum label', () => {
    // bits 0-2 = 3 -> "Max"
    const flags = decodeFlags(0x03, prgBits)
    const mode = flags.find((f) => f.key === '0-2')!
    expect(mode).toMatchObject({ kind: 'enum', value: 'Max', raw: 3 })
  })
})

describe('setBit / setBitRange', () => {
  it('sets and clears a single bit', () => {
    expect(setBit(0x00, '4', true)).toBe(0x10)
    expect(setBit(0x10, '4', false)).toBe(0x00)
  })

  it('writes a value into a bit range preserving other bits', () => {
    // start 0x90 (bit7+bit4), set range 0-2 to value 2 -> 0x92
    expect(setBitRange(0x90, '0-2', 2)).toBe(0x92)
  })
})
