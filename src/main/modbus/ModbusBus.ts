import type { ModbusTransport } from './types'

export type Priority = 'user' | 'poll'

export interface BusOptions {
  interFrameDelayMs?: number
}

interface QueueItem {
  run: () => Promise<unknown>
  priority: Priority
  seq: number
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

  enqueue<T>(run: () => Promise<T>, priority: Priority = 'user'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: run as () => Promise<unknown>,
        priority,
        seq: this.seqCounter++,
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

  private async drain(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!
        try {
          const value = await item.run()
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
