import { decode, type NumericType, type WordOrder } from './DataCodec'
import type { Result } from './types'

export interface DashboardPoint {
  id: string
  port: string
  slave: number
  fc: 1 | 2 | 3 | 4
  addr: number
  type: NumericType
  scale?: number
  wordOrder?: WordOrder
  intervalMs: number
}

export interface PollUpdate {
  pointId: string
  value: number | null
  ts: number
  quality: 'good' | 'bad'
}

export interface PollingDeps {
  readPoint: (p: DashboardPoint) => Promise<Result<number[]>>
  emit: (u: PollUpdate) => void
  now: () => number
}

export class PollingEngine {
  private timers: ReturnType<typeof setInterval>[] = []

  constructor(private readonly deps: PollingDeps) {}

  start(points: DashboardPoint[]): void {
    this.stop()
    for (const p of points) {
      const timer = setInterval(() => void this.pollOnce(p), p.intervalMs)
      this.timers.push(timer)
    }
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t)
    this.timers = []
  }

  private async pollOnce(p: DashboardPoint): Promise<void> {
    const res = await this.deps.readPoint(p)
    if (res.ok) {
      const value = decode(res.value, { type: p.type, scale: p.scale, wordOrder: p.wordOrder })
      this.deps.emit({ pointId: p.id, value, ts: this.deps.now(), quality: 'good' })
    } else {
      this.deps.emit({ pointId: p.id, value: null, ts: this.deps.now(), quality: 'bad' })
    }
  }
}
