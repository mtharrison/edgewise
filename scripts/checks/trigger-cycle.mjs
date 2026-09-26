// Trigger button cycle (change 10-trigger-cycle-any-edge, tasks 1.3 and 2.4):
// node scripts/ui.mjs scripts/checks/trigger-cycle.mjs
//
// Clicks the first channel's trigger button six times. After each click it
// records the button text, the top-bar trigger chip and the tooltip, saves a
// screenshot, and checks them against the expected cycle.
const EXPECTED = [
  { button: 'Rising', chip: '↑', hint: 'Trigger: Rising' },
  { button: 'Falling', chip: '↓', hint: 'Trigger: Falling' },
  { button: 'Any edge', chip: '↕', hint: 'Trigger: Any edge' },
  { button: 'High', chip: '▔', hint: 'Trigger: High' },
  { button: 'Low', chip: '▁', hint: 'Trigger: Low' },
  { button: '', chip: 'None', hint: 'No trigger on this channel' }
]
const ICON = { Rising: 'arrow-up-right', Falling: 'arrow-down-right', 'Any edge': 'arrow-up-down', High: 'chevrons-up', Low: 'chevrons-down', '': 'zap' }

export default async ({ page, shot }) => {
  const device = page.locator('.field', { hasText: 'Device' }).locator('select')
  const demo = await device.locator('option', { hasText: 'Demo' }).first().getAttribute('value')
  if ((await device.inputValue()) !== demo) await device.selectOption(demo)

  const label = page.locator('.ch-label').first()
  const button = label.locator('.icon-btn.trig')
  const chip = page.locator('.field.trigger .chip')
  const tip = label.locator('.trig-tip')
  const name = (await label.locator('.ch-name, input').first().textContent())?.trim()

  const read = async () => ({
    button: (await button.innerText()).trim(),
    icon: (await button.locator('svg').getAttribute('class')) ?? '',
    chip: (await chip.innerText()).trim(),
    tip: (await tip.isVisible()) ? (await tip.innerText()).trim() : '(no tooltip)'
  })

  // Before clicking: the bare ⚡, shown on hover, with the full list in its tooltip.
  await button.hover()
  const start = await read()
  console.log('start', JSON.stringify(start))
  await shot('trigger-0-none')
  if (start.button !== '' || !start.icon.includes('zap') || start.chip !== 'None') throw new Error(`unexpected start state ${JSON.stringify(start)}`)
  if (!start.tip.includes('Click to cycle through') || !start.tip.includes('Any edge: fires when')) throw new Error(`no-trigger tooltip missing list: ${start.tip}`)

  for (const [i, want] of EXPECTED.entries()) {
    await button.click()
    const got = await read()
    console.log(`click ${i + 1}`, JSON.stringify(got))
    await shot(`trigger-${i + 1}-${want.button.replace(' ', '-').toLowerCase() || 'none'}`)
    const chipOk = want.chip === 'None' ? got.chip === 'None' : got.chip.includes(want.chip) && (!name || got.chip.includes(name))
    if (got.button !== want.button || !got.icon.includes(ICON[want.button]) || !chipOk || !got.tip.includes(want.hint))
      throw new Error(`click ${i + 1}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`)
  }

  // Away from the button, the bare ⚡ fades out and the tooltip goes.
  await page.mouse.move(800, 20)
  await page.waitForTimeout(300)
  const opacity = await label.locator('.ch-actions').evaluate((el) => getComputedStyle(el).opacity)
  console.log('unhovered opacity', opacity, 'tooltip', await tip.isVisible())
  await shot('trigger-7-unhovered')
  if (opacity !== '0' || (await tip.isVisible())) throw new Error(`bare ⚡ still shown after unhover (opacity ${opacity})`)

  // The last channel's tooltip fits in the window.
  const last = page.locator('.ch-label').last()
  await last.locator('.icon-btn.trig').hover()
  const box = await last.locator('.trig-tip').boundingBox()
  const { height } = page.viewportSize() ?? (await page.evaluate(() => ({ height: window.innerHeight })))
  console.log('last channel tooltip', JSON.stringify(box), 'window height', height)
  await shot('trigger-8-last-channel')
  if (!box || box.y < 0 || box.y + box.height > height) throw new Error('last channel tooltip is cut off')
}
