// sigrok-cli fallback (change 55-sigrok-cli-fallback, task 4.5): without sigrok-cli,
// the device list is what it was before the fallback.
// EDGEWISE_SIGROK_CLI=/nonexistent node scripts/ui.mjs scripts/checks/no-sigrok.mjs

export default async ({ page, shot }) => {
  const device = page.locator('.field', { hasText: 'Device' }).locator('select')
  await device.locator('option[value="demo"]').waitFor({ state: 'attached' })
  await page.waitForTimeout(1000)
  const ids = await device.locator('option').evaluateAll((os) => os.map((o) => o.value))
  console.log('devices', JSON.stringify(ids))
  await shot('no-sigrok')
  if (ids.at(-1) !== 'demo' || ids.some((id) => id.startsWith('sigrok:'))) throw new Error(`unexpected devices ${ids}`)
  console.log('ok only FX2 boards and the demo device are listed')
}
