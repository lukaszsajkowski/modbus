import { describe, it, expect, vi } from 'vitest'
import { ModbusBus } from '../../../src/main/modbus/ModbusBus'
import type { ModbusTransport } from '../../../src/main/modbus/types'

function fakeTransport(): ModbusTransport {
  return {
    connect: async () => {},
    close: async () => {},
    read: async () => [0],
    write: async () => {},
    isOpen: () => true
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('ModbusBus serialization', () => {
  it('runs only one operation at a time', async () => {
    const bus = new ModbusBus(fakeTransport(), { interFrameDelayMs: 0 })
    const d1 = deferred<string>()
    let secondStarted = false

    const p1 = bus.enqueue(() => d1.promise)
    const p2 = bus.enqueue(async () => {
      secondStarted = true
      return 'second'
    })

    // druga operacja nie może wystartować, dopóki pierwsza trwa
    await Promise.resolve()
    expect(secondStarted).toBe(false)

    d1.resolve('first')
    await expect(p1).resolves.toBe('first')
    await expect(p2).resolves.toBe('second')
    expect(secondStarted).toBe(true)
  })

  it('propagates rejection without blocking the queue', async () => {
    const bus = new ModbusBus(fakeTransport(), { interFrameDelayMs: 0 })
    const p1 = bus.enqueue(async () => {
      throw new Error('boom')
    })
    const p2 = bus.enqueue(async () => 'ok')

    await expect(p1).rejects.toThrow('boom')
    await expect(p2).resolves.toBe('ok')
  })
})

describe('ModbusBus priority', () => {
  it('runs user operations before poll when both are queued', async () => {
    const bus = new ModbusBus(fakeTransport(), { interFrameDelayMs: 0 })
    const gate = deferred<void>()
    const order: string[] = []

    // pierwsza operacja trzyma magistralę zajętą (blokuje pętlę)
    const busy = bus.enqueue(async () => {
      await gate.promise
      order.push('busy')
    })

    // w tej kolejności trafiają do kolejki: poll, potem user
    const pollP = bus.enqueue(async () => {
      order.push('poll')
    }, 'poll')
    const userP = bus.enqueue(async () => {
      order.push('user')
    }, 'user')

    gate.resolve()
    await Promise.all([busy, pollP, userP])

    expect(order).toEqual(['busy', 'user', 'poll'])
  })
})

describe('ModbusBus timing', () => {
  it('waits interFrameDelayMs between operations', async () => {
    vi.useFakeTimers()
    try {
      const bus = new ModbusBus(fakeTransport(), { interFrameDelayMs: 50 })
      const order: string[] = []
      const p1 = bus.enqueue(async () => order.push('a'))
      const p2 = bus.enqueue(async () => order.push('b'))

      await p1
      expect(order).toEqual(['a'])   // druga czeka na delay
      await vi.advanceTimersByTimeAsync(50)
      await p2
      expect(order).toEqual(['a', 'b'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects with code TIMEOUT and keeps the queue alive', async () => {
    vi.useFakeTimers()
    try {
      const bus = new ModbusBus(fakeTransport(), { interFrameDelayMs: 0, defaultTimeoutMs: 100 })
      const stuck = bus.enqueue(() => new Promise<void>(() => {})) // nigdy nie kończy
      const next = bus.enqueue(async () => 'ok')

      const assertion = expect(stuck).rejects.toMatchObject({ code: 'TIMEOUT' })
      await vi.advanceTimersByTimeAsync(100)
      await assertion
      await expect(next).resolves.toBe('ok')
    } finally {
      vi.useRealTimers()
    }
  })
})
