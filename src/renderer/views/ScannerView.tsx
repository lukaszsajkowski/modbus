import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { SerialParams } from '../../main/modbus/types'

export function ScannerView({ params }: { params: SerialParams }): React.JSX.Element {
  const [mode, setMode] = useState<'quick' | 'deep'>('quick')
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(32)
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<number[]>([])
  const [foundParams, setFoundParams] = useState<SerialParams | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.lastScan().then((rec) => {
      if (rec) {
        setFound(rec.slaves)
        setFoundParams(rec.params)
        setMsg(`Ostatni skan: ${new Date(rec.ts).toLocaleString()}`)
      }
    })
  }, [])

  async function run(): Promise<void> {
    setBusy(true)
    setMsg('Skanowanie…')
    try {
      if (mode === 'quick') {
        const r = await api.scanQuick({ params, slaveRange: [from, to] })
        setFound(r.found)
        setFoundParams(r.params)
      } else {
        const r = await api.scanDeep({
          basePath: params.path,
          timeoutMs: params.timeoutMs,
          bauds: [9600, 19200, 38400, 57600, 115200],
          parities: ['none', 'even', 'odd'],
          stopBits: [1, 2],
          slaveRange: [from, to]
        })
        setFound(r.found)
        setFoundParams(r.params)
        if (!r.params) setMsg('Nie znaleziono działającej konfiguracji.')
      }
      setMsg((m) => (m === 'Skanowanie…' ? 'Zakończono.' : m))
    } catch (e) {
      setMsg(`Błąd: ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2>Skaner</h2>
      <label>Tryb:{' '}
        <select value={mode} onChange={(e) => setMode(e.target.value as 'quick' | 'deep')}>
          <option value="quick">Szybki (adresy)</option>
          <option value="deep">Głęboki (parametry × adresy)</option>
        </select>
      </label>
      <label>{' '}Od:{' '}<input type="number" value={from} onChange={(e) => setFrom(Number(e.target.value))} /></label>
      <label>{' '}Do:{' '}<input type="number" value={to} onChange={(e) => setTo(Number(e.target.value))} /></label>
      <button className="primary" onClick={run} disabled={busy} style={{ marginLeft: 8 }}>Skanuj</button>
      <p>{msg}</p>
      {foundParams && (
        <p>Działająca konfiguracja: {foundParams.baudRate} {foundParams.parity} {foundParams.stopBits}</p>
      )}
      <table>
        <thead><tr><th>Adres slave</th><th>Status</th></tr></thead>
        <tbody>
          {found.map((s) => <tr key={s}><td>{s}</td><td>online</td></tr>)}
          {found.length === 0 && <tr><td colSpan={2}>Brak wykrytych urządzeń.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
