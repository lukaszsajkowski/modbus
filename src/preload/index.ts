import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '../main/ipc/channels'

const api = {
  listPorts: () => ipcRenderer.invoke(CH.listPorts),
  connect: (params: unknown) => ipcRenderer.invoke(CH.connect, params),
  disconnect: (path: string) => ipcRenderer.invoke(CH.disconnect, path),
  scanQuick: (opts: unknown) => ipcRenderer.invoke(CH.scanQuick, opts),
  scanDeep: (opts: unknown) => ipcRenderer.invoke(CH.scanDeep, opts),
  lastScan: () => ipcRenderer.invoke(CH.lastScan),
  read: (port: string, req: unknown) => ipcRenderer.invoke(CH.read, port, req),
  write: (port: string, req: unknown) => ipcRenderer.invoke(CH.write, port, req),
  profilesList: () => ipcRenderer.invoke(CH.profilesList),
  profileGet: (id: string) => ipcRenderer.invoke(CH.profileGet, id),
  registerMapGet: (id: string) => ipcRenderer.invoke(CH.registerMapGet, id),
  registerMapSet: (id: string, map: unknown) => ipcRenderer.invoke(CH.registerMapSet, id, map)
}

contextBridge.exposeInMainWorld('api', api)
