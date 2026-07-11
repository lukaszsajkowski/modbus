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
  const [timeoutMs, setTimeoutMs] = useState(1000)
  const [status, setStatus] = useState('rozłączony')
  const [testSlave, setTestSlave] = useState(1)
  const [testAddr, setTestAddr] = useState(0)
  const [testResult, setTestResult] = useState('')

  useEffect(() => {
    api.listPorts().then((p) => {
      setPorts(p)
      if (p[0]) setPath(p[0].path)
    })
  }, [])

  const params: SerialParams = { path, baudRate, dataBits: 8, parity, stopBits, timeoutMs }

  async function connect(): Promise<void> {
    setTestResult('')
    const res = await api.connect(params)
    if (!res.ok) {
      setStatus(`błąd: ${res.code} ${res.message}`)
      return
    }
    // NOTE: connect only opens the serial port — it does not prove a device
    // answers. Use "Testuj połączenie" to verify with a real Modbus read.
    setStatus(`port otwarty: ${path} (użyj „Testuj połączenie", by sprawdzić urządzenie)`)
    onConnected(params)
  }

  async function disconnect(): Promise<void> {
    await api.disconnect(path)
    setStatus('rozłączony')
    setTestResult('')
  }

  async function testConnection(): Promise<void> {
    setTestResult('testuję…')
    const res = await api.read(path, { slave: testSlave, fc: 3, addr: testAddr, count: 1 })
    if (res.ok) {
      setTestResult(`✅ Łącze działa — slave ${testSlave} odpowiedział: rejestr ${testAddr} = ${res.value[0]}`)
      return
    }
    // A framed Modbus exception still proves the device is present and talking.
    if (res.code === 'MODBUS_EXCEPTION') {
      setTestResult(
        `✅ Łącze działa — slave ${testSlave} odpowiedział wyjątkiem Modbus (${res.message}). ` +
          `Urządzenie obecne; spróbuj innego rejestru.`
      )
      return
    }
    if (res.code === 'NOT_CONNECTED') {
      setTestResult('⚠️ Najpierw kliknij „Połącz" (otwórz port).')
      return
    }
    if (res.code === 'TIMEOUT') {
      setTestResult(
        `⛔ Brak odpowiedzi (timeout). Port jest otwarty, ale slave ${testSlave} milczy — ` +
          `sprawdź adres slave, parametry (baud/parity/stopbits) i okablowanie A/B.`
      )
      return
    }
    setTestResult(`⛔ Błąd łącza: ${res.code} ${res.message}`)
  }

  return (
    <div>
      <h2>Połączenie</h2>
      <label>Port:{' '}
        <select value={path} onChange={(e) => setPath(e.target.value)}>
          {ports.map((p) => (
            <option key={p.path} value={p.path}>
              {p.manufacturer ? `${p.path} — ${p.manufacturer}` : p.path}
            </option>
          ))}
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
        <input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} />
      </label>
      <div style={{ marginTop: 8 }}>
        <button className="primary" onClick={connect} disabled={!path}>Połącz</button>{' '}
        <button onClick={disconnect} disabled={!path}>Rozłącz</button>
        <span style={{ marginLeft: 12 }}>Status: {status}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Slave testowy:{' '}
          <input type="number" value={testSlave} onChange={(e) => setTestSlave(Number(e.target.value))} style={{ width: 60 }} />
        </label>
        <label>{' '}Rejestr (FC03):{' '}
          <input type="number" value={testAddr} onChange={(e) => setTestAddr(Number(e.target.value))} style={{ width: 70 }} />
        </label>
        <button onClick={testConnection} disabled={!path} style={{ marginLeft: 8 }}>Testuj połączenie</button>
      </div>
      {testResult && <p>{testResult}</p>}
    </div>
  )
}
