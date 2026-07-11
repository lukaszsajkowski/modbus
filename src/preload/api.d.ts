import type { PortInfo } from '../main/modbus/SerialPortService'
import type { SerialParams } from '../main/modbus/types'
import type { QuickScanOptions, DeepScanOptions, ScanResult, DeepScanResult } from '../main/modbus/Scanner'
import type { ScanRecord } from '../main/store/Store'

export interface RendererApi {
  listPorts: () => Promise<PortInfo[]>
  connect: (params: SerialParams) => Promise<{ ok: true }>
  disconnect: (path: string) => Promise<{ ok: true }>
  scanQuick: (opts: QuickScanOptions) => Promise<ScanResult>
  scanDeep: (opts: DeepScanOptions) => Promise<DeepScanResult>
  lastScan: () => Promise<ScanRecord | null>
}

declare global {
  interface Window {
    api: RendererApi
  }
}
