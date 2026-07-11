// Drive the app against the built-in mock: connect to the simulator port,
// quick-scan, and read the EKWHCTRL1 profile in the Test urządzenia panel.
const { _electron: electron } = require('playwright')

;(async () => {
  const errors = []
  const app = await electron.launch({ args: ['.'], cwd: process.cwd() })
  const win = await app.firstWindow()
  win.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  win.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
  await win.waitForSelector('nav')

  // --- Connection: pick the mock port and connect ---
  await win.locator('select').first().selectOption('mock://daikin-ekwhctrl1')
  await win.getByRole('button', { name: 'Połącz', exact: true }).click()
  await win.waitForTimeout(400)
  const connStatus = (await win.textContent('body'))?.match(/Status:[^\n]*/)?.[0]?.trim()
  await win.screenshot({ path: '/tmp/mock-01-connected.png' })

  // --- Test urządzenia FIRST (while still connected): load profile, read all ---
  await win.getByRole('button', { name: 'Test urządzenia', exact: true }).click()
  await win.waitForTimeout(200)
  await win.locator('select').first().selectOption('daikin-ekwhctrl1')
  await win.waitForTimeout(200)
  await win.getByRole('button', { name: 'Odczytaj wszystko', exact: true }).click()
  await win.waitForTimeout(1800) // ~31 registers through the 20ms inter-frame queue
  await win.screenshot({ path: '/tmp/mock-03-devicetest.png' })
  // Capture the values NOW, before navigating away from this table.
  const rowText = async (mnem) => {
    const rows = await win.$$eval('table tbody tr', (rs) => rs.map((r) => r.textContent?.trim()))
    return rows.find((t) => t && t.startsWith(mnem))
  }
  const t1 = await rowText('T1')
  const spl = await rowText('SPL')
  const prg = await rowText('PRG')

  // --- Scanner: quick scan finds the simulated slaves 21 & 22 (closes the port) ---
  await win.getByRole('button', { name: 'Skaner', exact: true }).click()
  await win.waitForTimeout(200)
  await win.getByRole('button', { name: 'Skanuj', exact: true }).click()
  await win.waitForTimeout(800)
  const scanRows = await win.$$eval('table tbody tr', (rows) =>
    rows.map((r) => r.textContent?.trim()).filter(Boolean)
  )
  await win.screenshot({ path: '/tmp/mock-02-scan.png' })

  console.log(JSON.stringify({
    connStatus,
    scanFound: scanRows,
    deviceTest: { t1, spl, prg },
    errors
  }, null, 2))

  await app.close()
})().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1) })
