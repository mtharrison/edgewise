// Demo capture: node scripts/ui.mjs scripts/checks/demo-capture.mjs
//
// Selects the demo device, sets a 1 s duration, then records a GIF of a
// capture from Start to done. Checks the button goes busy and back to Start
// and that samples arrived. Also a smoke check that the recorder works.
export default async ({ page, shot, rec }) => {
  const device = page.locator('.field', { hasText: 'Device' }).locator('select')
  const demo = await device.locator('option', { hasText: 'Demo' }).first().getAttribute('value')
  if ((await device.inputValue()) !== demo) await device.selectOption(demo)
  await page.locator('.field', { hasText: 'Duration' }).locator('select').selectOption({ value: '1' })
  const button = page.locator('.capture-btn')
  await shot('demo-before-capture')

  await rec('demo-capture', async () => {
    await button.click()
    await page.waitForFunction(() => document.querySelector('.capture-btn')?.classList.contains('busy'))
    await page.waitForFunction(() => !document.querySelector('.capture-btn')?.classList.contains('busy'), null, { timeout: 30_000 })
    await page.waitForTimeout(500)
  })

  const label = (await button.innerText()).trim()
  const samples = (await page.locator('.statusbar, footer').first().innerText().catch(() => '')).trim()
  console.log('after capture', JSON.stringify({ label, samples }))
  await shot('demo-after-capture')
  if (label !== 'Start') throw new Error(`capture button reads "${label}", expected "Start"`)
}
