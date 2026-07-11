import type { Parity, SerialParams } from './types'

export interface Prober {
  probe(slave: number): Promise<boolean>
  close(): Promise<void>
}

export interface ScanTarget {
  withParams(params: SerialParams): Promise<Prober>
}

export interface QuickScanOptions {
  params: SerialParams
  slaveRange: [number, number]
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export interface ScanResult {
  params: SerialParams
  found: number[]
}

export async function quickScan(target: ScanTarget, opts: QuickScanOptions): Promise<ScanResult> {
  const [from, to] = opts.slaveRange
  const total = to - from + 1
  const found: number[] = []
  const prober = await target.withParams(opts.params)
  try {
    let done = 0
    for (let slave = from; slave <= to; slave++) {
      if (opts.signal?.aborted) break
      const responded = await prober.probe(slave)
      done++
      if (responded) found.push(slave)
      opts.onProgress?.(done, total)
    }
  } finally {
    await prober.close()
  }
  return { params: opts.params, found }
}

export interface DeepScanOptions {
  basePath: string
  timeoutMs: number
  bauds: number[]
  parities: Parity[]
  stopBits: Array<1 | 2>
  dataBits?: 7 | 8
  slaveRange: [number, number]
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export interface DeepScanResult {
  params: SerialParams | null
  found: number[]
}

export async function deepScan(target: ScanTarget, opts: DeepScanOptions): Promise<DeepScanResult> {
  const [from, to] = opts.slaveRange
  const addrCount = to - from + 1
  const total = opts.bauds.length * opts.parities.length * opts.stopBits.length * addrCount
  let done = 0

  for (const baudRate of opts.bauds) {
    for (const parity of opts.parities) {
      for (const stopBits of opts.stopBits) {
        if (opts.signal?.aborted) return { params: null, found: [] }
        const params: SerialParams = {
          path: opts.basePath,
          baudRate,
          dataBits: opts.dataBits ?? 8,
          parity,
          stopBits,
          timeoutMs: opts.timeoutMs
        }
        const prober = await target.withParams(params)
        const found: number[] = []
        try {
          for (let slave = from; slave <= to; slave++) {
            if (opts.signal?.aborted) break
            const responded = await prober.probe(slave)
            done++
            if (responded) found.push(slave)
            opts.onProgress?.(done, total)
          }
        } finally {
          await prober.close()
        }
        if (found.length > 0) return { params, found }
      }
    }
  }
  return { params: null, found: [] }
}
