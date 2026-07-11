import React, { useState } from 'react'
import { ConnectionView } from './views/ConnectionView'
import { ScannerView } from './views/ScannerView'
import { ReadWriteView } from './views/ReadWriteView'
import { DeviceTestView } from './views/DeviceTestView'
import { DashboardView } from './views/DashboardView'
import { SettingsView } from './views/SettingsView'
import type { SerialParams } from '../main/modbus/types'

type Tab = 'connection' | 'scanner' | 'readwrite' | 'devicetest' | 'dashboard' | 'settings'

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('connection')
  const [params, setParams] = useState<SerialParams | null>(null)
  const [busBanner, setBusBanner] = React.useState<string | null>(null)
  React.useEffect(() => {
    const unsub = window.api.onBusStatus((s) => {
      setBusBanner(s.state === 'disconnected' ? `Rozłączono: ${s.port} ${s.message ?? ''}` : null)
    })
    return unsub
  }, [])

  const tabs: Array<[Tab, string]> = [
    ['connection', 'Połączenie'],
    ['scanner', 'Skaner'],
    ['readwrite', 'Read/Write'],
    ['devicetest', 'Test urządzenia'],
    ['dashboard', 'Dashboard'],
    ['settings', 'Ustawienia']
  ]

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">Modbus RTU Tester</h1>
        {busBanner && <div className="banner">{busBanner}</div>}
        <nav className="tabs">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? 'tab active' : 'tab'}
              onClick={() => setTab(id)}
              disabled={tab === id}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="content">
        {tab === 'connection' && <ConnectionView onConnected={setParams} />}
        {tab !== 'connection' && tab !== 'settings' && !params && (
          <p>Najpierw połącz się w zakładce „Połączenie".</p>
        )}
        {tab === 'scanner' && params && <ScannerView params={params} />}
        {tab === 'readwrite' && params && <ReadWriteView params={params} />}
        {tab === 'devicetest' && params && <DeviceTestView params={params} />}
        {tab === 'dashboard' && params && <DashboardView params={params} />}
        {tab === 'settings' && <SettingsView />}
      </main>
      <footer className="statusbar">
        <span className={params ? 'dot ok' : 'dot'} />
        {params
          ? `Połączony port: ${params.path} @ ${params.baudRate} ${params.parity}`
          : 'Brak połączenia'}
      </footer>
    </div>
  )
}
