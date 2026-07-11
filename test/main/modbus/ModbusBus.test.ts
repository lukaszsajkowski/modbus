import { describe, it, expect } from 'vitest'
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
