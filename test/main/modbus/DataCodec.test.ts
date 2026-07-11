import { describe, it, expect } from 'vitest'
import { decode, encode } from '../../../src/main/modbus/DataCodec'

describe('DataCodec 16-bit', () => {
  it('decodes uint16 with scale (manual case 224 -> 22.4)', () => {
    expect(decode([224], { type: 'uint16', scale: 0.1 })).toBeCloseTo(22.4, 5)
  })

  it('decodes plain uint16 (scale defaults to 1)', () => {
    expect(decode([1500], { type: 'uint16' })).toBe(1500)
  })

  it('decodes int16 negative (two-complement 0xFFF0 -> -16)', () => {
    expect(decode([0xfff0], { type: 'int16' })).toBe(-16)
  })

  it('decodes int16 with scale and offset', () => {
    // -120 raw, scale 0.1 -> -12.0
    expect(decode([0xff88], { type: 'int16', scale: 0.1 })).toBeCloseTo(-12.0, 5)
  })

  it('encodes uint16 with scale (22.4 -> 224)', () => {
    expect(encode(22.4, { type: 'uint16', scale: 0.1 })).toEqual([224])
  })

  it('encodes int16 negative (-12.0 scale 0.1 -> 0xFF88)', () => {
    expect(encode(-12.0, { type: 'int16', scale: 0.1 })).toEqual([0xff88])
  })

  it('round-trips uint16 through encode/decode', () => {
    const spec = { type: 'uint16' as const, scale: 0.1 }
    expect(decode(encode(16.0, spec), spec)).toBeCloseTo(16.0, 5)
  })
})
