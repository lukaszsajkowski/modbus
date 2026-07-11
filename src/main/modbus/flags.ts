import type { FlagBitDef } from '../profiles/schema'

export interface DecodedBit {
  key: string
  label: string
  kind: 'bool'
  value: boolean
}

export interface DecodedEnum {
  key: string
  label: string
  kind: 'enum'
  value: string
  raw: number
}

export type DecodedFlag = DecodedBit | DecodedEnum

function parseRange(key: string): [number, number] {
  const [lo, hi] = key.split('-').map(Number)
  return [lo, hi]
}

function extractRange(raw: number, lo: number, hi: number): number {
  const width = hi - lo + 1
  const mask = (1 << width) - 1
  return (raw >>> lo) & mask
}

export function decodeFlags(raw: number, bits: Record<string, FlagBitDef>): DecodedFlag[] {
  const out: DecodedFlag[] = []
  for (const [key, def] of Object.entries(bits)) {
    if (key.includes('-')) {
      const [lo, hi] = parseRange(key)
      const value = extractRange(raw, lo, hi)
      const enumMap = (def as { enum: Record<string, string> }).enum
      out.push({
        key,
        label: enumMap[String(value)] ?? `#${value}`,
        kind: 'enum',
        value: enumMap[String(value)] ?? `#${value}`,
        raw: value
      })
    } else {
      const bit = Number(key)
      out.push({ key, label: def as string, kind: 'bool', value: ((raw >>> bit) & 1) === 1 })
    }
  }
  return out
}

export function setBit(current: number, key: string, on: boolean): number {
  const bit = Number(key)
  return on ? (current | (1 << bit)) & 0xffff : current & ~(1 << bit) & 0xffff
}

export function setBitRange(current: number, key: string, value: number): number {
  const [lo, hi] = parseRange(key)
  const width = hi - lo + 1
  const mask = ((1 << width) - 1) << lo
  return ((current & ~mask) | ((value << lo) & mask)) & 0xffff
}
