// sigrok-cli fallback (change 55-sigrok-cli-fallback, task 4.4). Needs sigrok-cli installed:
// EDGEWISE_SIGROK_DRIVERS=demo node scripts/ui.mjs scripts/checks/sigrok-demo.mjs
//
// Waits for sigrok's demo device in the picker (listed by the launch scan through the
// fallback), checks its "via sigrok-cli" note, runs a 100 ms capture at 1 MHz and checks
// the status bar shows 100k samples.

const expect = (ok, what) => {
  if (!ok) throw new Error(what)
  console.log(`ok ${what}`)
}

export default async ({ page, shot }) => {
  const device = page.locator('.field', { hasText: 'Device' }).locator('select')
  const rate = page.locator('.field', { hasText: 'Sample rate' }).locator('select')
  const duration = page.locator('.field', { hasText: 'Duration' }).locator('select')
  const option = device.locator('option[value="sigrok:demo"]')

  await option.waitFor({ state: 'attached', timeout: 20_000 })
  const ids = await device.locator('option').evaluateAll((os) => os.map((o) => o.value))
  console.log('devices', JSON.stringify(ids))
  expect(ids.at(-1) === 'demo' && ids.indexOf('sigrok:demo') < ids.indexOf('demo'), 'sigrok demo listed before the built-in demo')

  await device.selectOption('sigrok:demo')
  const note = await page.locator('.device-note').innerText()
  expect(/^via sigrok-cli \d/.test(note), `note "${note}"`)
  await shot('sigrok-1-picker')

  await rate.selectOption(String(1_000_000))
  await duration.selectOption('0.1')
  await page.locator('.capture-btn').click()
  await page.locator('.capture-btn.done').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(300)
  await shot('sigrok-2-waveform')
  const bar = await page.locator('.statusbar').innerText()
  console.log('status bar', JSON.stringify(bar))
  expect(bar.includes('100k samples'), 'status bar shows 100k samples')
}
