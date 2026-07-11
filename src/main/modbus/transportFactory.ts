import type { ModbusTransport } from './types'
import { ModbusSerialTransport } from './ModbusSerialTransport'
import { MockModbusTransport } from './MockModbusTransport'

/** Sentinel port path that routes to the in-memory Daikin simulator. */
export const MOCK_PORT_PATH = 'mock://daikin-ekwhctrl1'

/** Pick the transport for a port path: the simulator for mock:// paths, real serial otherwise. */
export function makeTransportForPath(path: string): ModbusTransport {
  return path.startsWith('mock:') ? new MockModbusTransport() : new ModbusSerialTransport()
}
