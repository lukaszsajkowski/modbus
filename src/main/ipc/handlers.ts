import { ipcMain } from 'electron'
import { CH } from './channels'
import { listSerialPorts } from '../modbus/SerialPortService'
import { BusRegistry } from '../modbus/BusRegistry'
import { ModbusSerialTransport } from '../modbus/ModbusSerialTransport'
import { makeScanTarget } from '../modbus/TransportScanTarget'
import { quickScan, deepScan } from '../modbus/Scanner'
import type { QuickScanOptions, DeepScanOptions } from '../modbus/Scanner'
import { createAppStore } from '../store/Store'
import type { SerialParams } from '../modbus/types'

export function registerIpcHandlers(): void {
  const registry = new BusRegistry()
  const store = createAppStore()

  ipcMain.handle(CH.listPorts, async () => listSerialPorts())

  ipcMain.handle(CH.connect, async (_e, params: SerialParams) => {
    await registry.open(params)
    return { ok: true }
  })

  ipcMain.handle(CH.disconnect, async (_e, path: string) => {
    await registry.close(path)
    return { ok: true }
  })

  ipcMain.handle(CH.scanQuick, async (_e, opts: QuickScanOptions) => {
    const target = makeScanTarget(() => new ModbusSerialTransport())
    const result = await quickScan(target, opts)
    store.setLastScan({ params: result.params, slaves: result.found, ts: Date.now() })
    return result
  })

  ipcMain.handle(CH.scanDeep, async (_e, opts: DeepScanOptions) => {
    const target = makeScanTarget(() => new ModbusSerialTransport())
    const result = await deepScan(target, opts)
    if (result.params) {
      store.setLastScan({ params: result.params, slaves: result.found, ts: Date.now() })
    }
    return result
  })

  ipcMain.handle(CH.lastScan, async () => store.getLastScan())
}
