import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '../main/ipc/channels'

const api = {
  listPorts: () => ipcRenderer.invoke(CH.listPorts),
  connect: (params: unknown) => ipcRenderer.invoke(CH.connect, params),
  disconnect: (path: string) => ipcRenderer.invoke(CH.disconnect, path),
  scanQuick: (opts: unknown) => ipcRenderer.invoke(CH.scanQuick, opts),
  scanDeep: (opts: unknown) => ipcRenderer.invoke(CH.scanDeep, opts),
  lastScan: () => ipcRenderer.invoke(CH.lastScan)
}

contextBridge.exposeInMainWorld('api', api)
