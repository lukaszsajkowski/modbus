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

describe('DataCodec 32-bit', () => {
  it('decodes uint32 AB (0x0001, 0x0000 -> 65536)', () => {
    expect(decode([0x0001, 0x0000], { type: 'uint32' })).toBe(65536)
  })

  it('decodes uint32 BA word-swapped (0x0000, 0x0001 -> 65536)', () => {
    expect(decode([0x0000, 0x0001], { type: 'uint32', wordOrder: 'BA' })).toBe(65536)
  })

  it('decodes int32 negative (-2)', () => {
    expect(decode([0xffff, 0xfffe], { type: 'int32' })).toBe(-2)
  })

  it('decodes float32 AB (1.0 = 0x3F80 0x0000)', () => {
    expect(decode([0x3f80, 0x0000], { type: 'float32' })).toBeCloseTo(1.0, 5)
  })

  it('encodes float32 AB (1.0 -> [0x3F80, 0x0000])', () => {
    expect(encode(1.0, { type: 'float32' })).toEqual([0x3f80, 0x0000])
  })

  it('round-trips int32 with word swap', () => {
    const spec = { type: 'int32' as const, wordOrder: 'BA' as const }
    expect(decode(encode(-123456, spec), spec)).toBe(-123456)
  })
})
