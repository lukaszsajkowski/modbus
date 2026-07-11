import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { DashboardPoint, PollUpdate } from '../../main/modbus/PollingEngine'
import type { NumericType } from '../../main/modbus/DataCodec'
import type { SerialParams } from '../../main/modbus/types'

const TYPES: NumericType[] = ['uint16', 'int16', 'uint32', 'int32', 'float32']

export function DashboardView({ params }: { params: SerialParams }): React.JSX.Element {
  const [points, setPoints] = useState<DashboardPoint[]>([])
  const [live, setLive] = useState<Record<string, PollUpdate>>({})
  const [running, setRunning] = useState(false)
  const [slave, setSlave] = useState(21)
  const [addr, setAddr] = useState(0)
  const [type, setType] = useState<NumericType>('uint16')
  const [scale, setScale] = useState(0.1)
  const [intervalMs, setIntervalMs] = useState(1000)
  const [layoutName, setLayoutName] = useState('domyślny')

  useEffect(() => {
    const unsub = api.onPollUpdate((u) => setLive((m) => ({ ...m, [u.pointId]: u })))
    return unsub
  }, [])

  function addPoint(): void {
    const id = `${slave}:${addr}:${Date.now()}`
    setPoints((ps) => [...ps, { id, port: params.path, slave, fc: 3, addr, type, scale, intervalMs }])
  }

  async function start(): Promise<void> {
    await api.pollStart(points)
    setRunning(true)
  }

  async function stop(): Promise<void> {
    await api.pollStop()
    setRunning(false)
  }

  async function saveLayout(): Promise<void> {
    await api.dashboardSave({ name: layoutName, points })
  }

  async function loadLayout(): Promise<void> {
    const layouts = await api.dashboardsGet()
    const found = layouts.find((l) => l.name === layoutName)
    if (found) setPoints(found.points)
  }

  return (
    <div>
      <h2>Dashboard</h2>
      <div>
        <label>Slave:{' '}<input type="number" value={slave} onChange={(e) => setSlave(Number(e.target.value))} /></label>
        <label>{' '}Addr:{' '}<input type="number" value={addr} onChange={(e) => setAddr(Number(e.target.value))} /></label>
        <label>{' '}Typ:{' '}
          <select value={type} onChange={(e) => setType(e.target.value as NumericType)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>{' '}Skala:{' '}<input type="number" step="0.1" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
        <label>{' '}Interwał (ms):{' '}<input type="number" value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))} /></label>
        <button onClick={addPoint} style={{ marginLeft: 8 }}>Dodaj punkt</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <button className="primary" onClick={start} disabled={running || points.length === 0}>Start</button>{' '}
        <button onClick={stop} disabled={!running}>Stop</button>{' '}
        <input value={layoutName} onChange={(e) => setLayoutName(e.target.value)} />
        <button onClick={saveLayout}>Zapisz układ</button>{' '}
        <button onClick={loadLayout}>Wczytaj układ</button>
      </div>
      <table>
        <thead><tr><th>Slave</th><th>Addr</th><th>Typ</th><th>Wartość</th><th>Quality</th><th>Czas</th></tr></thead>
        <tbody>
          {points.map((p) => {
            const u = live[p.id]
            return (
              <tr key={p.id} className={u?.quality === 'bad' ? 'bad-row' : undefined}>
                <td>{p.slave}</td><td>{p.addr}</td><td>{p.type}</td>
                <td>{u ? (u.value ?? '—') : '…'}</td>
                <td>{u?.quality ?? '—'}</td>
                <td>{u ? new Date(u.ts).toLocaleTimeString() : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
