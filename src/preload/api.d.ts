import type { PortInfo } from '../main/modbus/SerialPortService'

export interface RendererApi {
  listPorts: () => Promise<PortInfo[]>
}

declare global {
  interface Window {
    api: RendererApi
  }
}
