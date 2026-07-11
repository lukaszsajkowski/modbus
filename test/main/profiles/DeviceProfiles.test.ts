import { describe, it, expect } from 'vitest'
import { loadBuiltinProfiles, getProfileById } from '../../../src/main/profiles/DeviceProfiles'

describe('DeviceProfiles', () => {
  it('loads and validates the EKWHCTRL1 builtin profile', () => {
    const profiles = loadBuiltinProfiles()
    const daikin = profiles.find((p) => p.id === 'daikin-ekwhctrl1')
    expect(daikin).toBeDefined()
    expect(daikin!.serial).toEqual({ baud: 9600, dataBits: 8, parity: 'none', stopBits: 1 })
    expect(daikin!.functions).toEqual(['FC03', 'FC06'])
  })

  it('includes the PRG flags register with mode enum', () => {
    const p = getProfileById('daikin-ekwhctrl1')!
    const prg = p.registers.find((r) => r.addr === 201)!
    expect(prg.kind).toBe('flags')
  })

  it('returns undefined for unknown id', () => {
    expect(getProfileById('nope')).toBeUndefined()
  })
})
