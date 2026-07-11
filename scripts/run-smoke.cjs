// Launch the built Electron app and drive it: verify window.api is exposed,
// the UI renders, and tab navigation works. Screenshots to /tmp.
const { _electron: electron } = require('playwright')

;(async () => {
  const errors = []
  const app = await electron.launch({ args: ['.'], cwd: process.cwd() })
  const win = await app.firstWindow()
  win.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  win.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })

  await win.waitForLoadState('domcontentloaded')
  await win.waitForSelector('h1', { timeout: 10000 })

  const h1 = (await win.textContent('h1'))?.trim()
  const hasApi = await win.evaluate(
    () => typeof window.api === 'object' && typeof window.api.listPorts === 'function'
  )
  const apiMethods = await win.evaluate(() =>
    window.api ? Object.keys(window.api).sort() : []
  )
  // Give the mount-time api.listPorts() call a moment to resolve.
  await win.waitForTimeout(800)
  const tabs = await win.$$eval('nav button', (bs) => bs.map((b) => b.textContent))
  await win.screenshot({ path: '/tmp/modbus-01-connection.png' })

  // Drive: click the Skaner tab (should show the "connect first" guard since not connected).
  const scannerBtn = await win.$('nav button:has-text("Skaner")')
  if (scannerBtn) { await scannerBtn.click(); await win.waitForTimeout(300) }
  const scannerText = (await win.textContent('body'))?.includes('Najpierw połącz')
  await win.screenshot({ path: '/tmp/modbus-02-scanner-guard.png' })

  // Drive: click Ustawienia (renders without a connection).
  const settingsBtn = await win.$('nav button:has-text("Ustawienia")')
  if (settingsBtn) { await settingsBtn.click(); await win.waitForTimeout(300) }
  await win.screenshot({ path: '/tmp/modbus-03-settings.png' })
  const settingsText = (await win.textContent('body'))?.includes('reconnect')

  console.log(JSON.stringify({
    h1, hasApi, apiMethods, tabs,
    connectGuardShown: scannerText,
    settingsRendered: settingsText,
    errors
  }, null, 2))

  await app.close()
})().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1) })
