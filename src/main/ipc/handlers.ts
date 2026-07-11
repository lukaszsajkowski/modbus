import { ipcMain } from 'electron'
import { CH } from './channels'
import { listSerialPorts } from '../modbus/SerialPortService'

export function registerIpcHandlers(): void {
  ipcMain.handle(CH.listPorts, async () => listSerialPorts())
}
