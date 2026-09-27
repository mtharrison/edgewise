// Needs an FX2 board plugged in and sigrok-cli installed:
// node scripts/ui.mjs scripts/checks/sigrok-fx2.mjs
//
// Checks the board is listed twice, natively and via sigrok-cli, then runs a
// 100 ms capture at 1 MHz through the sigrok-cli entry.

const expect = (ok, what) => {
  if (!ok) throw new Error(what)
  console.log(`ok ${what}`)
}

export default async ({ page, shot }) => {
  const device = page.locator('.field', { hasText: 'Device' }).locator('select')
  const rate = page.locator('.field', { hasText: 'Sample rate' }).locator('select')
  const duration = page.locator('.field', { hasText: 'Duration' }).locator('select')
  const viaSigrok = device.locator('option[value^="sigrok:fx2lafw"]')

  await viaSigrok.first().waitFor({ state: 'attached', timeout: 30_000 })
  const labels = await device.locator('option').evaluateAll((os) => os.map((o) => `${o.value} | ${o.textContent}`))
  console.log('devices', JSON.stringify(labels))
  expect(labels.some((l) => l.startsWith('fx2:')), 'board listed natively')
  expect(labels.some((l) => l.startsWith('sigrok:fx2lafw') && l.endsWith('via sigrok-cli')), 'board listed via sigrok-cli')

  await device.selectOption(await viaSigrok.first().getAttribute('value'))
  const note = await page.locator('.device-note').innerText()
  expect(/^via sigrok-cli \d/.test(note), `note "${note}"`)
  await shot('sigrok-fx2-1-picker')

  await rate.selectOption(String(1_000_000))
  await duration.selectOption('0.1')
  await page.locator('.capture-btn').click()
  await page.locator('.capture-btn.done').waitFor({ timeout: 40_000 })
  await page.waitForTimeout(300)
  await shot('sigrok-fx2-2-waveform')
  const bar = await page.locator('.statusbar').innerText()
  expect(bar.includes('100k samples'), 'status bar shows 100k samples')
}
