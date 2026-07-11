import React, { useState } from 'react'

export function SettingsView(): React.JSX.Element {
  const [autoReconnect, setAutoReconnect] = useState(localStorage.getItem('autoReconnect') === 'true')

  function toggle(v: boolean): void {
    setAutoReconnect(v)
    localStorage.setItem('autoReconnect', String(v))
  }

  return (
    <div>
      <h2>Ustawienia</h2>
      <label>
        <input type="checkbox" checked={autoReconnect} onChange={(e) => toggle(e.target.checked)} />
        {' '}Automatyczny reconnect po odłączeniu portu
      </label>
    </div>
  )
}
