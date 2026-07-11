import React, { useState } from 'react'
import { api } from '../lib/api'
import { decode, encode, type NumericType, type WordOrder } from '../../main/modbus/DataCodec'
import type { SerialParams } from '../../main/modbus/types'

const READ_FCS = [1, 2, 3, 4] as const
const WRITE_FCS = [5, 6, 15, 16] as const
const TYPES: NumericType[] = ['uint16', 'int16', 'uint32', 'int32', 'float32']

export function ReadWriteView({ params }: { params: SerialParams }): React.JSX.Element {
  const [slave, setSlave] = useState(21)
  const [addr, setAddr] = useState(0)
  const [count, setCount] = useState(1)
  const [readFc, setReadFc] = useState<1 | 2 | 3 | 4>(3)
  const [writeFc, setWriteFc] = useState<5 | 6 | 15 | 16>(6)
  const [type, setType] = useState<NumericType>('uint16')
  const [wordOrder, setWordOrder] = useState<WordOrder>('AB')
  const [scale, setScale] = useState(1)
  const [writeValue, setWriteValue] = useState(0)
  const [raw, setRaw] = useState<number[] | null>(null)
  const [decoded, setDecoded] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function doRead(): Promise<void> {
    setError('')
    const res = await api.read(params.path, { slave, fc: readFc, addr, count })
    if (!res.ok) { setError(`${res.code}: ${res.message}`); return }
    setRaw(res.value)
    try {
      setDecoded(decode(res.value, { type, scale, wordOrder }))
    } catch {
      setDecoded(null)
    }
  }

  async function doWrite(): Promise<void> {
    setError('')
    const values = encode(writeValue, { type, scale, wordOrder })
    const res = await api.write(params.path, { slave, fc: writeFc, addr, values })
    if (!res.ok) { setError(`${res.code}: ${res.message}`); return }
    setError('Zapis OK')
  }

  return (
    <div>
      <h2>Read / Write</h2>
      <div>
        <label>Slave:{' '}<input type="number" value={slave} onChange={(e) => setSlave(Number(e.target.value))} /></label>
        <label>{' '}Addr:{' '}<input type="number" value={addr} onChange={(e) => setAddr(Number(e.target.value))} /></label>
        <label>{' '}Count:{' '}<input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
      </div>
      <div>
        <label>Typ:{' '}
          <select value={type} onChange={(e) => setType(e.target.value as NumericType)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>{' '}Word order:{' '}
          <select value={wordOrder} onChange={(e) => setWordOrder(e.target.value as WordOrder)}>
            <option value="AB">AB</option><option value="BA">BA</option>
          </select>
        </label>
        <label>{' '}Skala:{' '}<input type="number" step="0.1" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Read FC:{' '}
          <select value={readFc} onChange={(e) => setReadFc(Number(e.target.value) as 1 | 2 | 3 | 4)}>
            {READ_FCS.map((f) => <option key={f} value={f}>FC{String(f).padStart(2, '0')}</option>)}
          </select>
        </label>
        <button className="primary" onClick={doRead} style={{ marginLeft: 8 }}>Odczytaj</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Write FC:{' '}
          <select value={writeFc} onChange={(e) => setWriteFc(Number(e.target.value) as 5 | 6 | 15 | 16)}>
            {WRITE_FCS.map((f) => <option key={f} value={f}>FC{String(f).padStart(2, '0')}</option>)}
          </select>
        </label>
        <label>{' '}Wartość:{' '}<input type="number" step="0.1" value={writeValue} onChange={(e) => setWriteValue(Number(e.target.value))} /></label>
        <button onClick={doWrite} style={{ marginLeft: 8 }}>Zapisz</button>
      </div>
      {raw && <p>Surowe słowa: [{raw.join(', ')}] → zdekodowana wartość: {decoded ?? '—'}</p>}
      {error && <p style={{ color: error === 'Zapis OK' ? 'green' : 'red' }}>{error}</p>}
    </div>
  )
}
