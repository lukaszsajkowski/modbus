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
