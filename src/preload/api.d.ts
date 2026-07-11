import type { PortInfo } from '../main/modbus/SerialPortService'
import type { SerialParams } from '../main/modbus/types'
import type { QuickScanOptions, DeepScanOptions, ScanResult, DeepScanResult } from '../main/modbus/Scanner'
import type { ScanRecord, DashboardLayout } from '../main/store/Store'
import type { ReadRequest, WriteRequest, Result } from '../main/modbus/types'
import type { DeviceProfile } from '../main/profiles/schema'
import type { DashboardPoint, PollUpdate } from '../main/modbus/PollingEngine'

export interface RendererApi {
  listPorts: () => Promise<PortInfo[]>
  connect: (params: SerialParams) => Promise<{ ok: true }>
  disconnect: (path: string) => Promise<{ ok: true }>
  scanQuick: (opts: QuickScanOptions) => Promise<ScanResult>
  scanDeep: (opts: DeepScanOptions) => Promise<DeepScanResult>
  lastScan: () => Promise<ScanRecord | null>
  read: (port: string, req: ReadRequest) => Promise<Result<number[]>>
  write: (port: string, req: WriteRequest) => Promise<Result<void>>
  profilesList: () => Promise<Array<{ id: string; name: string }>>
  profileGet: (id: string) => Promise<DeviceProfile | null>
  registerMapGet: (id: string) => Promise<Record<string, string>>
  registerMapSet: (id: string, map: Record<string, string>) => Promise<{ ok: true }>
  pollStart: (points: DashboardPoint[]) => Promise<{ ok: true }>
  pollStop: () => Promise<{ ok: true }>
  onPollUpdate: (cb: (u: PollUpdate) => void) => () => void
  dashboardsGet: () => Promise<DashboardLayout[]>
  dashboardSave: (layout: DashboardLayout) => Promise<{ ok: true }>
  onBusStatus: (cb: (s: { port: string; state: 'connected' | 'disconnected'; message?: string }) => void) => () => void
}

declare global {
  interface Window {
    api: RendererApi
  }
}
