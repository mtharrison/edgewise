// Zoom and pan limits (change 87-zoom-limits, task 2.1):
// node scripts/ui.mjs scripts/checks/zoom-limits.mjs
//
// Runs a 1 s demo capture with no trigger, so time 0 is the capture start. Reads
// the view's edges by hovering the plot's left and right edges and dropping
// markers A and B there. Checks that zooming out stops at 10 ms before the start
// to 10 ms after the end, that panning stops 10 ms past either end, and that F
// fits the capture exactly. Records a GIF of zooming out and saves a screenshot
// of the fully zoomed-out view.
const expect = (ok, what) => {
  if (!ok) throw new Error(what)
  console.log(`ok ${what}`)
}

const UNITS = { s: 1, ms: 1e-3, µs: 1e-6, us: 1e-6, ns: 1e-9, ps: 1e-12 }
const parseTime = (text) => {
  const m = text.trim().match(/^(-?[\d.]+)\s*(\S+)$/)
  if (!m || !(m[2] in UNITS)) throw new Error(`cannot parse time "${text}"`)
  return Number(m[1]) * UNITS[m[2]]
}

export default async ({ page, shot, rec }) => {
  const device = page.locator('.field', { hasText: 'Device' }).locator('select')
  const demo = await device.locator('option', { hasText: 'Demo' }).first().getAttribute('value')
  if ((await device.inputValue()) !== demo) await device.selectOption(demo)
  await page.locator('.field', { hasText: 'Duration' }).locator('select').selectOption({ value: '1' })
  const chip = (await page.locator('.field.trigger .chip').innerText()).trim()
  expect(chip === 'None', `no trigger set, so time 0 is the capture start (chip "${chip}")`)

  const button = page.locator('.capture-btn')
  await button.click()
  await page.waitForFunction(() => document.querySelector('.capture-btn')?.classList.contains('busy'))
  await page.waitForFunction(() => !document.querySelector('.capture-btn')?.classList.contains('busy'), null, { timeout: 30_000 })
  await page.waitForTimeout(500)

  const plot = await page.locator('.plot').boundingBox()
  const y = plot.y + plot.height / 2
  const metric = (label) => page.locator('.metric', { has: page.locator('.metric-label', { hasText: new RegExp(`^${label}$`) }) }).locator('.metric-value')
  // One pixel of the view in seconds, for tolerances.
  let px = 0
  const edges = async () => {
    await page.mouse.move(plot.x, y)
    await page.keyboard.press('a')
    await page.mouse.move(plot.x + plot.width - 0.01, y)
    await page.keyboard.press('b')
    const e = { start: parseTime(await metric('A').innerText()), end: parseTime(await metric('B').innerText()) }
    px = (e.end - e.start) / plot.width
    console.log('view', JSON.stringify(e))
    return e
  }
  const near = (a, b) => Math.abs(a - b) <= 2 * px + 1e-9

  // Fully zoomed out: the capture plus 10 ms either side, and no further.
  await page.mouse.move(plot.x + plot.width / 2, y)
  await rec('zoom-limits-zoom-out', async () => {
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('-')
      await page.waitForTimeout(250)
    }
    await page.waitForTimeout(500)
  })
  const out = await edges()
  expect(near(out.start, -0.01) && near(out.end, 1.01), `zoomed out view spans -10 ms to 1.01 s (got ${out.start} to ${out.end})`)
  await shot('zoom-limits-zoomed-out')
  await page.mouse.move(plot.x + plot.width / 2, y)
  for (let i = 0; i < 4; i++) await page.keyboard.press('-')
  const again = await edges()
  expect(near(again.start, out.start) && near(again.end, out.end), 'zooming out further does not change the view')

  // Zoomed in, pan to each end.
  await page.keyboard.press('Escape')
  await page.mouse.move(plot.x + plot.width / 2, y)
  for (let i = 0; i < 4; i++) await page.keyboard.press('=')
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowLeft')
  const left = await edges()
  expect(near(left.start, -0.01), `panning left stops 10 ms before the capture start (got ${left.start})`)
  expect(left.end - left.start < 0.2, `view is zoomed in (${left.end - left.start} s wide)`)
  // 20% of a ~64 ms view per press: 100 presses cross the whole capture.
  for (let i = 0; i < 100; i++) await page.keyboard.press('ArrowRight')
  const right = await edges()
  expect(near(right.end, 1.01), `panning right stops 10 ms after the capture end (got ${right.end})`)

  // Fit shows exactly the capture.
  await page.keyboard.press('Escape')
  await page.keyboard.press('f')
  const fit = await edges()
  expect(near(fit.start, 0) && near(fit.end, 1), `F fits the capture from 0 to 1 s (got ${fit.start} to ${fit.end})`)
  await page.keyboard.press('Escape')
}
