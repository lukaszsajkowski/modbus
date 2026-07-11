import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { PortInfo } from '../../main/modbus/SerialPortService'
import type { SerialParams, Parity } from '../../main/modbus/types'

const BAUDS = [9600, 19200, 38400, 57600, 115200]
const PARITIES: Parity[] = ['none', 'even', 'odd']

export function ConnectionView({
  onConnected
}: {
  onConnected: (params: SerialParams) => void
}): React.JSX.Element {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [path, setPath] = useState('')
  const [baudRate, setBaud] = useState(9600)
  const [parity, setParity] = useState<Parity>('none')
  const [stopBits, setStop] = useState<1 | 2>(1)
  const [timeoutMs, setTimeout] = useState(1000)
  const [status, setStatus] = useState('rozłączony')

  useEffect(() => {
    api.listPorts().then((p) => {
      setPorts(p)
      if (p[0]) setPath(p[0].path)
    })
  }, [])

  const params: SerialParams = { path, baudRate, dataBits: 8, parity, stopBits, timeoutMs }

  async function connect(): Promise<void> {
    try {
      await api.connect(params)
      setStatus(`połączony: ${path}`)
      onConnected(params)
    } catch (e) {
      setStatus(`błąd: ${String(e)}`)
    }
  }

  async function disconnect(): Promise<void> {
    await api.disconnect(path)
    setStatus('rozłączony')
  }

  return (
    <div>
      <h2>Połączenie</h2>
      <label>Port:{' '}
        <select value={path} onChange={(e) => setPath(e.target.value)}>
          {ports.map((p) => <option key={p.path} value={p.path}>{p.path}</option>)}
        </select>
      </label>
      <label>{' '}Baud:{' '}
        <select value={baudRate} onChange={(e) => setBaud(Number(e.target.value))}>
          {BAUDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <label>{' '}Parity:{' '}
        <select value={parity} onChange={(e) => setParity(e.target.value as Parity)}>
          {PARITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label>{' '}Stop bits:{' '}
        <select value={stopBits} onChange={(e) => setStop(Number(e.target.value) as 1 | 2)}>
          <option value={1}>1</option><option value={2}>2</option>
        </select>
      </label>
      <label>{' '}Timeout (ms):{' '}
        <input type="number" value={timeoutMs} onChange={(e) => setTimeout(Number(e.target.value))} />
      </label>
      <div style={{ marginTop: 8 }}>
        <button onClick={connect} disabled={!path}>Połącz</button>{' '}
        <button onClick={disconnect} disabled={!path}>Rozłącz</button>
        <span style={{ marginLeft: 12 }}>Status: {status}</span>
      </div>
    </div>
  )
}
