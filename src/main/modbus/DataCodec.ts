export type NumericType = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'
export type WordOrder = 'AB' | 'BA'

export interface CodecSpec {
  type: NumericType
  scale?: number
  offset?: number
  wordOrder?: WordOrder
}

function toSigned16(raw: number): number {
  return raw >= 0x8000 ? raw - 0x10000 : raw
}

function toUnsigned16(value: number): number {
  return value & 0xffff
}

function words32(registers: number[], wordOrder: WordOrder): [number, number] {
  const a = registers[0] & 0xffff
  const b = registers[1] & 0xffff
  return wordOrder === 'BA' ? [b, a] : [a, b]
}

function combine32(hi: number, lo: number): number {
  return ((hi << 16) >>> 0) | (lo & 0xffff)
}

function split32(u32: number, wordOrder: WordOrder): number[] {
  const hi = (u32 >>> 16) & 0xffff
  const lo = u32 & 0xffff
  return wordOrder === 'BA' ? [lo, hi] : [hi, lo]
}

export function decode(registers: number[], spec: CodecSpec): number {
  const scale = spec.scale ?? 1
  const offset = spec.offset ?? 0
  let raw: number

  switch (spec.type) {
    case 'uint16':
      raw = registers[0] & 0xffff
      break
    case 'int16':
      raw = toSigned16(registers[0] & 0xffff)
      break
    case 'uint32': {
      const [hi, lo] = words32(registers, spec.wordOrder ?? 'AB')
      raw = combine32(hi, lo)
      break
    }
    case 'int32': {
      const [hi, lo] = words32(registers, spec.wordOrder ?? 'AB')
      const u = combine32(hi, lo)
      raw = u >= 0x80000000 ? u - 0x100000000 : u
      break
    }
    case 'float32': {
      const [hi, lo] = words32(registers, spec.wordOrder ?? 'AB')
      const buf = Buffer.alloc(4)
      buf.writeUInt16BE(hi, 0)
      buf.writeUInt16BE(lo, 2)
      raw = buf.readFloatBE(0)
      break
    }
    default:
      throw new Error(`decode: unsupported type ${spec.type}`)
  }
  return raw * scale + offset
}

export function encode(value: number, spec: CodecSpec): number[] {
  const scale = spec.scale ?? 1
  const offset = spec.offset ?? 0
  const raw = Math.round((value - offset) / scale)

  switch (spec.type) {
    case 'uint16':
      return [toUnsigned16(raw)]
    case 'int16':
      return [toUnsigned16(raw)]
    case 'uint32':
    case 'int32': {
      const u = raw >>> 0
      return split32(u, spec.wordOrder ?? 'AB')
    }
    case 'float32': {
      const buf = Buffer.alloc(4)
      buf.writeFloatBE((value - offset) / scale, 0)
      const hi = buf.readUInt16BE(0)
      const lo = buf.readUInt16BE(2)
      return spec.wordOrder === 'BA' ? [lo, hi] : [hi, lo]
    }
    default:
      throw new Error(`encode: unsupported type ${spec.type}`)
  }
}
