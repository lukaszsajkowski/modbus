import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { decode, encode } from '../../main/modbus/DataCodec'
import { decodeFlags, setBit } from '../../main/modbus/flags'
import type { DeviceProfile, NumericRegister, FlagsRegister, RegisterDef } from '../../main/profiles/schema'
import type { SerialParams } from '../../main/modbus/types'

const parityMap = { none: 'none', even: 'even', odd: 'odd' } as const

export function DeviceTestView({ params }: { params: SerialParams }): React.JSX.Element {
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string }>>([])
  const [profile, setProfile] = useState<DeviceProfile | null>(null)
  const [slave, setSlave] = useState(21)
  const [values, setValues] = useState<Record<number, number>>({}) // addr -> raw
  const [msg, setMsg] = useState('')

  useEffect(() => { api.profilesList().then(setProfiles) }, [])

  async function selectProfile(id: string): Promise<void> {
    setProfile(await api.profileGet(id))
  }

  async function applySerial(): Promise<void> {
    if (!profile) return
    const p: SerialParams = {
      path: params.path,
      baudRate: profile.serial.baud,
      dataBits: profile.serial.dataBits as 7 | 8,
      parity: parityMap[profile.serial.parity],
      stopBits: profile.serial.stopBits as 1 | 2,
      timeoutMs: params.timeoutMs
    }
    await api.connect(p)
    setMsg(`Zastosowano ${profile.serial.baud} ${profile.serial.parity} ${profile.serial.stopBits}`)
  }

  async function readAll(): Promise<void> {
    if (!profile) return
    const next: Record<number, number> = {}
    for (const r of profile.registers) {
      const res = await api.read(params.path, { slave, fc: 3, addr: r.addr, count: 1 })
      if (res.ok) next[r.addr] = res.value[0]
    }
    setValues(next)
    setMsg('Odczytano rejestry.')
  }

  async function writeNumeric(reg: NumericRegister, engValue: number): Promise<void> {
    if (reg.min !== undefined && engValue < reg.min) { setMsg(`Wartość < ${reg.min}`); return }
    if (reg.max !== undefined && engValue > reg.max) { setMsg(`Wartość > ${reg.max}`); return }
    const raw = encode(engValue, { type: reg.type, scale: reg.scale })
    const res = await api.write(params.path, { slave, fc: 6, addr: reg.addr, values: raw })
    setMsg(res.ok ? `Zapisano ${reg.mnem}` : `${res.code}: ${res.message}`)
    if (res.ok) setValues((v) => ({ ...v, [reg.addr]: raw[0] }))
  }

  async function toggleBit(reg: FlagsRegister, bitKey: string, on: boolean): Promise<void> {
    const current = values[reg.addr] ?? 0
    const nextRaw = setBit(current, bitKey, on)
    const res = await api.write(params.path, { slave, fc: 6, addr: reg.addr, values: [nextRaw] })
    setMsg(res.ok ? `Zapisano ${reg.mnem}` : `${res.code}: ${res.message}`)
    if (res.ok) setValues((v) => ({ ...v, [reg.addr]: nextRaw }))
  }

  return (
    <div>
      <h2>Test urządzenia</h2>
      <label>Profil:{' '}
        <select value={profile?.id ?? ''} onChange={(e) => selectProfile(e.target.value)}>
          <option value="">— wybierz —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label>{' '}Slave:{' '}<input type="number" value={slave} onChange={(e) => setSlave(Number(e.target.value))} /></label>
      {profile && (
        <>
          <button onClick={applySerial} style={{ marginLeft: 8 }}>Zastosuj parametry łącza</button>
          <button onClick={readAll} style={{ marginLeft: 8 }}>Odczytaj wszystko</button>
          <p>{msg}</p>
          <table border={1} cellPadding={4}>
            <thead><tr><th>Mnem</th><th>Nazwa</th><th>Wartość</th><th>Akcja</th></tr></thead>
            <tbody>
              {profile.registers.map((r) => (
                <RegisterRow
                  key={r.addr}
                  reg={r}
                  raw={values[r.addr]}
                  onWriteNumeric={writeNumeric}
                  onToggleBit={toggleBit}
                />
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function RegisterRow({
  reg, raw, onWriteNumeric, onToggleBit
}: {
  reg: RegisterDef
  raw: number | undefined
  onWriteNumeric: (r: NumericRegister, v: number) => void
  onToggleBit: (r: FlagsRegister, bitKey: string, on: boolean) => void
}): React.JSX.Element {
  const [edit, setEdit] = useState('')
  if (reg.kind === 'flags') {
    const decoded = raw === undefined ? [] : decodeFlags(raw, reg.bits)
    return (
      <tr>
        <td>{reg.mnem}</td><td>{reg.name}</td>
        <td>
          {decoded.map((f) => (
            <span key={f.key} style={{ marginRight: 8 }}>
              {f.kind === 'bool'
                ? <label><input type="checkbox" checked={f.value} disabled={reg.access === 'R'}
                    onChange={(e) => onToggleBit(reg, f.key, e.target.checked)} /> {f.label}</label>
                : <>{f.label}</>}
            </span>
          ))}
        </td>
        <td>{reg.access}</td>
      </tr>
    )
  }
  const eng = raw === undefined ? undefined : decode([raw], { type: reg.type, scale: reg.scale })
  return (
    <tr>
      <td>{reg.mnem}</td><td>{reg.name}</td>
      <td>{eng === undefined ? '—' : `${eng} ${reg.unit ?? ''}`}</td>
      <td>
        {reg.access === 'RW' && (
          <>
            <input type="number" step="0.1" value={edit} placeholder={String(reg.default ?? '')}
              onChange={(e) => setEdit(e.target.value)} style={{ width: 70 }} />
            <button onClick={() => onWriteNumeric(reg, Number(edit))} disabled={edit === ''}>Zapisz</button>
            {(reg.min !== undefined || reg.max !== undefined) && <small> [{reg.min}…{reg.max}]</small>}
          </>
        )}
      </td>
    </tr>
  )
}
