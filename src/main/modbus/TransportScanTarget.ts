import type { ModbusTransport, SerialParams } from './types'
import type { Prober, ScanTarget } from './Scanner'

export function makeScanTarget(
  makeTransport: () => ModbusTransport,
  probeFc: 1 | 2 | 3 | 4 = 3
): ScanTarget {
  return {
    withParams: async (params: SerialParams): Promise<Prober> => {
      const transport = makeTransport()
      await transport.connect(params)
      return {
        probe: async (slave: number): Promise<boolean> => {
          try {
            await transport.read({ slave, fc: probeFc, addr: 0, count: 1 })
            return true
          } catch {
            return false
          }
        },
        close: async () => {
          await transport.close()
        }
      }
    }
  }
}
