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
    default:
      throw new Error(`encode: unsupported type ${spec.type}`)
  }
}
