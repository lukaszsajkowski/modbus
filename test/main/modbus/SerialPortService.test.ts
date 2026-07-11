import { describe, it, expect } from 'vitest'
import { listSerialPorts } from '../../../src/main/modbus/SerialPortService'

describe('SerialPortService', () => {
  it('maps and filters port entries', async () => {
    const fakeLister = async () => [
      { path: '/dev/tty.usbserial-1', manufacturer: 'FTDI', serialNumber: 'A1' },
      { path: '', manufacturer: 'ghost' } // brak path -> odfiltrowany
    ]
    const ports = await listSerialPorts(fakeLister)
    expect(ports).toEqual([
      { path: '/dev/tty.usbserial-1', manufacturer: 'FTDI', serialNumber: 'A1' }
    ])
  })
})
