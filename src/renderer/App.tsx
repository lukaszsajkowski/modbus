import React, { useState } from 'react'
import { ConnectionView } from './views/ConnectionView'
import { ScannerView } from './views/ScannerView'
import { ReadWriteView } from './views/ReadWriteView'
import { DeviceTestView } from './views/DeviceTestView'
import { DashboardView } from './views/DashboardView'
import type { SerialParams } from '../main/modbus/types'

type Tab = 'connection' | 'scanner' | 'readwrite' | 'devicetest' | 'dashboard' | 'settings'

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('connection')
  const [params, setParams] = useState<SerialParams | null>(null)

  const tabs: Array<[Tab, string]> = [
    ['connection', 'Połączenie'],
    ['scanner', 'Skaner'],
    ['readwrite', 'Read/Write'],
    ['devicetest', 'Test urządzenia'],
    ['dashboard', 'Dashboard'],
    ['settings', 'Ustawienia']
  ]

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16 }}>
      <h1>Modbus RTU Tester</h1>
      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} disabled={tab === id}>{label}</button>
        ))}
      </nav>
      {tab === 'connection' && <ConnectionView onConnected={setParams} />}
      {tab !== 'connection' && !params && <p>Najpierw połącz się w zakładce „Połączenie".</p>}
      {tab === 'scanner' && params && <ScannerView params={params} />}
      {tab === 'readwrite' && params && <ReadWriteView params={params} />}
      {tab === 'devicetest' && params && <DeviceTestView params={params} />}
      {tab === 'dashboard' && params && <DashboardView params={params} />}
      {/* kolejne widoki dopinane w następnych taskach */}
      <footer style={{ marginTop: 24, color: '#888' }}>
        {params ? `Aktywny port: ${params.path} @ ${params.baudRate} ${params.parity}` : 'Brak połączenia'}
      </footer>
    </div>
  )
}
