import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {
  version: () => process.versions.electron
})
