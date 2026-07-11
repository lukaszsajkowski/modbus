// Verify the "Testuj połączenie" probe: slave 21 (mock responds) -> link OK,
// slave 99 (no response) -> timeout.
const { _electron: electron } = require('playwright')

;(async () => {
  const app = await electron.launch({ args: ['.'], cwd: process.cwd() })
  const win = await app.firstWindow()
  await win.waitForSelector('nav')

  await win.locator('select').first().selectOption('mock://daikin-ekwhctrl1')
  await win.getByRole('button', { name: 'Połącz', exact: true }).click()
  await win.waitForTimeout(300)
  const statusText = (await win.textContent('body'))?.match(/Status:[^A]*/)?.[0]?.trim()

  const numInputs = win.locator('input[type="number"]')
  // inputs: [0]=Timeout, [1]=Slave testowy, [2]=Rejestr
  const testBtn = win.getByRole('button', { name: 'Testuj połączenie', exact: true })
  const resultText = async () =>
    (await win.locator('p').last().textContent())?.trim()

  await numInputs.nth(1).fill('21')
  await testBtn.click()
  await win.waitForTimeout(400)
  const okResult = await resultText()
  await win.screenshot({ path: '/tmp/testconn-01-ok.png' })

  await numInputs.nth(1).fill('99')
  await testBtn.click()
  await win.waitForTimeout(400)
  const timeoutResult = await resultText()
  await win.screenshot({ path: '/tmp/testconn-02-timeout.png' })

  console.log(JSON.stringify({ statusText, okResult, timeoutResult }, null, 2))
  await app.close()
})().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1) })
