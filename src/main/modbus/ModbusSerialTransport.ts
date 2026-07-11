import ModbusRTU from 'modbus-serial'
import type { ModbusTransport, ReadRequest, SerialParams, WriteRequest } from './types'

export class ModbusSerialTransport implements ModbusTransport {
  private client = new ModbusRTU()
  private open = false
  private timeoutMs = 1000

  async connect(params: SerialParams): Promise<void> {
    this.timeoutMs = params.timeoutMs
    await this.client.connectRTUBuffered(params.path, {
      baudRate: params.baudRate,
      dataBits: params.dataBits,
      parity: params.parity,
      stopBits: params.stopBits
    })
    this.client.setTimeout(params.timeoutMs)
    this.open = true
  }

  async close(): Promise<void> {
    if (!this.open) return
    await new Promise<void>((resolve) => this.client.close(() => resolve()))
    this.open = false
  }

  isOpen(): boolean {
    return this.open
  }

  async read(req: ReadRequest): Promise<number[]> {
    this.client.setID(req.slave)
    this.client.setTimeout(this.timeoutMs)
    switch (req.fc) {
      case 1:
        return (await this.client.readCoils(req.addr, req.count)).data.map((b) => (b ? 1 : 0))
      case 2:
        return (await this.client.readDiscreteInputs(req.addr, req.count)).data.map((b) =>
          b ? 1 : 0
        )
      case 3:
        return (await this.client.readHoldingRegisters(req.addr, req.count)).data
      case 4:
        return (await this.client.readInputRegisters(req.addr, req.count)).data
    }
  }

  async write(req: WriteRequest): Promise<void> {
    this.client.setID(req.slave)
    this.client.setTimeout(this.timeoutMs)
    switch (req.fc) {
      case 5:
        await this.client.writeCoil(req.addr, req.values[0] !== 0)
        return
      case 6:
        await this.client.writeRegister(req.addr, req.values[0])
        return
      case 15:
        await this.client.writeCoils(req.addr, req.values.map((v) => v !== 0))
        return
      case 16:
        await this.client.writeRegisters(req.addr, req.values)
        return
    }
  }
}
