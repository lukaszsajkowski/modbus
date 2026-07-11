import { ModbusBus } from './ModbusBus'
import { ModbusSerialTransport } from './ModbusSerialTransport'
import type { SerialParams } from './types'

export class BusRegistry {
  private readonly buses = new Map<string, ModbusBus>()

  get(path: string): ModbusBus | undefined {
    return this.buses.get(path)
  }

  async open(params: SerialParams, onClose?: () => void): Promise<ModbusBus> {
    await this.close(params.path)
    const transport = new ModbusSerialTransport()
    if (onClose) transport.onClose(onClose)
    await transport.connect(params)
    const bus = new ModbusBus(transport, {
      interFrameDelayMs: 20,
      defaultTimeoutMs: params.timeoutMs
    })
    this.buses.set(params.path, bus)
    return bus
  }

  async close(path: string): Promise<void> {
    const bus = this.buses.get(path)
    if (!bus) return
    try {
      await bus.transport.close()
    } finally {
      this.buses.delete(path)
    }
  }
}
