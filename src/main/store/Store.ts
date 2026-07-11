import type { SerialParams } from '../modbus/types'

export interface ConnectionProfile {
  name: string
  params: SerialParams
}

export interface ScanRecord {
  params: SerialParams
  slaves: number[]
  ts: number
}

export interface DashboardLayout {
  name: string
  points: unknown[]
}

export interface StoreShape {
  connectionProfiles: ConnectionProfile[]
  lastScan: ScanRecord | null
  dashboards: DashboardLayout[]
  registerMaps: Record<string, unknown>
}

export interface KeyValueBackend {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
}

export class AppStore {
  constructor(private readonly backend: KeyValueBackend) {}

  getConnectionProfiles(): ConnectionProfile[] {
    return this.backend.get<ConnectionProfile[]>('connectionProfiles') ?? []
  }

  saveConnectionProfile(profile: ConnectionProfile): void {
    const existing = this.getConnectionProfiles().filter((p) => p.name !== profile.name)
    this.backend.set('connectionProfiles', [...existing, profile])
  }

  getLastScan(): ScanRecord | null {
    return this.backend.get<ScanRecord>('lastScan') ?? null
  }

  setLastScan(record: ScanRecord): void {
    this.backend.set('lastScan', record)
  }

  getDashboards(): DashboardLayout[] {
    return this.backend.get<DashboardLayout[]>('dashboards') ?? []
  }

  saveDashboard(layout: DashboardLayout): void {
    const existing = this.getDashboards().filter((d) => d.name !== layout.name)
    this.backend.set('dashboards', [...existing, layout])
  }
}

import Store from 'electron-store'

export function createAppStore(): AppStore {
  const store = new Store<StoreShape>({
    defaults: {
      connectionProfiles: [],
      lastScan: null,
      dashboards: [],
      registerMaps: {}
    }
  })
  const backend: KeyValueBackend = {
    get: <T>(key: string) => store.get(key as keyof StoreShape) as T | undefined,
    set: <T>(key: string, value: T) => store.set(key, value as never)
  }
  return new AppStore(backend)
}
