import { ipcMain } from 'electron'
import { CH } from './channels'
import { listSerialPorts } from '../modbus/SerialPortService'
import { BusRegistry } from '../modbus/BusRegistry'
import { ModbusSerialTransport } from '../modbus/ModbusSerialTransport'
import { makeScanTarget } from '../modbus/TransportScanTarget'
import { quickScan, deepScan } from '../modbus/Scanner'
import type { QuickScanOptions, DeepScanOptions } from '../modbus/Scanner'
import { createAppStore } from '../store/Store'
import { busRead, busWrite } from '../modbus/operations'
import type { SerialParams, ReadRequest, WriteRequest } from '../modbus/types'
import { loadBuiltinProfiles, getProfileById } from '../profiles/DeviceProfiles'

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

  ipcMain.handle(CH.read, async (_e, port: string, req: ReadRequest) => {
    const bus = registry.get(port)
    if (!bus) return { ok: false, code: 'NOT_CONNECTED', message: `Port ${port} not connected` }
    return busRead(bus, req)
  })

  ipcMain.handle(CH.write, async (_e, port: string, req: WriteRequest) => {
    const bus = registry.get(port)
    if (!bus) return { ok: false, code: 'NOT_CONNECTED', message: `Port ${port} not connected` }
    return busWrite(bus, req)
  })

  ipcMain.handle(CH.profilesList, async () => loadBuiltinProfiles().map((p) => ({ id: p.id, name: p.name })))
  ipcMain.handle(CH.profileGet, async (_e, id: string) => getProfileById(id) ?? null)
  ipcMain.handle(CH.registerMapGet, async (_e, id: string) => store.getRegisterMap(id))
  ipcMain.handle(CH.registerMapSet, async (_e, id: string, map: Record<string, string>) => {
    store.setRegisterMap(id, map)
    return { ok: true }
  })
}
