const { _electron: electron } = require('playwright')
const BIN = process.argv[2]
;(async () => {
  const errors = []
  const app = await electron.launch({ executablePath: BIN })
  const win = await app.firstWindow()
  win.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  win.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await win.waitForSelector('nav', { timeout: 15000 })
  const h1 = (await win.textContent('.brand'))?.trim()
  const hasApi = await win.evaluate(() => typeof window.api?.listPorts === 'function')
  const ports = await win.evaluate(() => window.api.listPorts())
  await win.screenshot({ path: '/tmp/packaged-01.png' })
  console.log(JSON.stringify({ h1, hasApi, portCount: ports.length, firstPort: ports[0]?.manufacturer, errors }, null, 2))
  await app.close()
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
