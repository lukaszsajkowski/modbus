import React, { useEffect, useState } from 'react'
import { api } from './lib/api'
import type { PortInfo } from '../main/modbus/SerialPortService'

export default function App(): React.JSX.Element {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listPorts().then(setPorts).catch((e) => setError(String(e)))
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16 }}>
      <h1>Modbus RTU Tester</h1>
      <h2>Porty szeregowe</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul>
        {ports.map((p) => (
          <li key={p.path}>
            {p.path} {p.manufacturer ? `(${p.manufacturer})` : ''}
          </li>
        ))}
      </ul>
      {ports.length === 0 && !error && <p>Brak wykrytych portów.</p>}
    </div>
  )
}
