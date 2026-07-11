import type { ModbusTransport } from './types'

export type Priority = 'user' | 'poll'

export interface BusOptions {
  interFrameDelayMs?: number
  defaultTimeoutMs?: number
}

export class TimeoutError extends Error {
  readonly code = 'TIMEOUT'
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

interface QueueItem {
  run: () => Promise<unknown>
  priority: Priority
  seq: number
  timeoutMs?: number
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

const delay = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve()

export class ModbusBus {
  private readonly queue: QueueItem[] = []
  private processing = false
  private seqCounter = 0

  constructor(
    readonly transport: ModbusTransport,
    private readonly opts: BusOptions = {}
  ) {}

  enqueue<T>(run: () => Promise<T>, priority: Priority = 'user', timeoutMs?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: run as () => Promise<unknown>,
        priority,
        seq: this.seqCounter++,
        timeoutMs,
        resolve: resolve as (v: unknown) => void,
        reject
      })
      this.sortQueue()
      void this.drain()
    })
  }

  private sortQueue(): void {
    const rank = (p: Priority): number => (p === 'user' ? 0 : 1)
    this.queue.sort((a, b) => rank(a.priority) - rank(b.priority) || a.seq - b.seq)
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    if (!ms || ms <= 0) return p
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new TimeoutError(ms)), ms)
      p.then(
        (v) => { clearTimeout(t); resolve(v) },
        (e) => { clearTimeout(t); reject(e) }
      )
    })
  }

  private async drain(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!
        try {
          const ms = item.timeoutMs ?? this.opts.defaultTimeoutMs ?? 0
          const value = await this.withTimeout(item.run(), ms)
          item.resolve(value)
        } catch (e) {
          item.reject(e)
        }
        await delay(this.opts.interFrameDelayMs ?? 0)
      }
    } finally {
      this.processing = false
    }
  }
}
