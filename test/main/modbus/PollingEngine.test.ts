import { describe, it, expect, vi } from 'vitest'
import { PollingEngine } from '../../../src/main/modbus/PollingEngine'
import type { DashboardPoint, PollUpdate } from '../../../src/main/modbus/PollingEngine'
import { ok, err } from '../../../src/main/modbus/types'

const point = (over: Partial<DashboardPoint> = {}): DashboardPoint => ({
  id: 'p1', port: '/dev/x', slave: 21, fc: 3, addr: 0, type: 'uint16', scale: 0.1, intervalMs: 100, ...over
})

describe('PollingEngine', () => {
  it('emits decoded good updates on interval', async () => {
    vi.useFakeTimers()
    try {
      const updates: PollUpdate[] = []
      const engine = new PollingEngine({
        readPoint: async () => ok([224]),
        emit: (u) => updates.push(u),
        now: () => 1000
      })
      engine.start([point()])
      await vi.advanceTimersByTimeAsync(100)
      engine.stop()
      expect(updates[0]?.pointId).toBe('p1')
      expect(updates[0]?.value).toBeCloseTo(22.4)
      expect(updates[0]?.ts).toBe(1000)
      expect(updates[0]?.quality).toBe('good')
    } finally {
      vi.useRealTimers()
    }
  })

  it('emits bad quality with null value on read error', async () => {
    vi.useFakeTimers()
    try {
      const updates: PollUpdate[] = []
      const engine = new PollingEngine({
        readPoint: async () => err('TIMEOUT', 'no response'),
        emit: (u) => updates.push(u),
        now: () => 2000
      })
      engine.start([point()])
      await vi.advanceTimersByTimeAsync(100)
      engine.stop()
      expect(updates[0]).toEqual({ pointId: 'p1', value: null, ts: 2000, quality: 'bad' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops emitting after stop()', async () => {
    vi.useFakeTimers()
    try {
      const updates: PollUpdate[] = []
      const engine = new PollingEngine({
        readPoint: async () => ok([10]),
        emit: (u) => updates.push(u),
        now: () => 0
      })
      engine.start([point({ scale: 1 })])
      await vi.advanceTimersByTimeAsync(100)
      const countAfterFirst = updates.length
      engine.stop()
      await vi.advanceTimersByTimeAsync(300)
      expect(updates.length).toBe(countAfterFirst)
    } finally {
      vi.useRealTimers()
    }
  })
})
