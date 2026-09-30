// Trigger hand-over without copying (change 77-trigger-backlog-no-copy, task 4.2):
// node scripts/ui.mjs scripts/checks/trigger-backlog.mjs
//
// With the demo device at 100 MHz, runs an "Until stopped" capture with a 10 ms
// pre-trigger (1,000,000 samples, about one chunk) triggered on D5 high and D6
// rising, and stops it after half a second. D6 first rises 16 ms in, so the
// pre-trigger buffer has filled and dropped its oldest chunk by then, and the
// capture starts part-way into its first chunk. Checks the trigger position is
// the full pre-trigger, the trigger condition holds at the trigger sample, and
// the first kept samples are demo data. Ends with defaults saved.
const expect = (ok, what) => {
  if (!ok) throw new Error(what)
  console.log(`ok ${what}`)
}

const clickMenu = (app, label) =>
  app.evaluate(({ Menu }, label) => {
    const capture = Menu.getApplicationMenu().items.find((i) => i.label === 'Capture')
    capture.submenu.items.find((i) => i.label === label).click()
  }, label)

export default async ({ page, app, shot, rec }) => {
  const device = page.locator('.field', { hasText: 'Device' }).locator('select')
  const rate = page.locator('.field', { hasText: 'Sample rate' }).locator('select')
  const duration = page.locator('.field', { hasText: 'Duration' }).locator('select')
  const chip = page.locator('.field.trigger .chip')
  const slider = page.locator('.popover .slider input[type=range]')
  const close = () => page.mouse.click(800, 500)

  await clickMenu(app, 'Reset Capture Settings')
  const demo = await device.locator('option', { hasText: 'Demo' }).first().getAttribute('value')
  if ((await device.inputValue()) !== demo) await device.selectOption(demo)
  await rate.selectOption('100000000')
  await duration.selectOption('0')
  await chip.click()
  await slider.fill('0.01')
  await page.locator('.popover .trig-row').nth(5).locator('select').selectOption('high')
  await page.locator('.popover .trig-row').nth(6).locator('select').selectOption('rising')
  await close()

  const button = page.locator('.capture-btn')
  await rec('trigger-backlog', async () => {
    await button.click()
    await page.waitForFunction(async () => (await window.edgewise.call('status')).trigger !== null, null, { timeout: 20_000 })
    await page.waitForTimeout(500)
    await button.click()
    await page.waitForFunction(() => !document.querySelector('.capture-btn')?.classList.contains('busy'), null, { timeout: 10_000 })
    await page.waitForTimeout(800)
  })

  const st = await page.evaluate(() => window.edgewise.call('status'))
  console.log('status', JSON.stringify({ state: st.state, trigger: st.trigger, samplerate: st.samplerate, samples: st.samples, kept: st.pretriggerKept }))
  expect(st.samplerate === 100_000_000, `100 MHz (${st.samplerate})`)
  expect(st.trigger === 1_000_000, `trigger position is the full 10 ms pre-trigger (${st.trigger})`)
  expect(st.samples > 2_000_000, `samples after the trigger were kept too (${st.samples})`)

  // D5 high and D6 rising exactly at the trigger sample: the kept samples are not shifted.
  const around = await page.evaluate((t) => window.edgewise.call('samples', t - 2, 4).then((a) => Array.from(Object.values(a))), st.trigger)
  console.log('samples around trigger', JSON.stringify(around))
  const bit = (v, b) => (v >> b) & 1
  expect(bit(around[1], 6) === 0 && bit(around[2], 6) === 1 && bit(around[2], 5) === 1, 'D6 rises with D5 high at the trigger sample')

  // The first kept samples are demo data too: the demo repeats every 20 ms (2,000,000 samples).
  const read = (start) => page.evaluate((s) => window.edgewise.call('samples', s, 5000).then((a) => Array.from(Object.values(a))), start)
  const [first, later] = [await read(0), await read(2_000_000)]
  expect(first.length === 5000 && first.every((v, i) => v === later[i]), 'first kept samples match the demo loop 20 ms later')

  expect((await page.locator('.toast').count()) === 0, 'no error or memory-limit message')
  await shot('trigger-backlog')
  // Zoom in on the trigger marker so the kept pre-trigger samples fill the view.
  const flag = await page.getByText('T', { exact: true }).first().boundingBox().catch(() => null)
  await page.mouse.move(flag ? flag.x + flag.width / 2 : 218, 400)
  // Step in until the scale is a few ms per division, read from the status bar.
  const perDiv = async () => {
    const m = (await page.locator('body').innerText()).match(/([\d.]+) (ms|µs|us|ns) \/ div/)
    return m ? Number(m[1]) * { ms: 1, µs: 1e-3, us: 1e-3, ns: 1e-6 }[m[2]] : 0
  }
  for (let i = 0; i < 60 && (await perDiv()) > 3; i++) {
    await page.mouse.wheel(0, -50)
    await page.waitForTimeout(40)
  }
  console.log('zoomed to', await perDiv(), 'ms / div')
  // Pan right so the 10 ms kept before the trigger is in view.
  await page.mouse.move(500, 600)
  await page.mouse.down()
  await page.mouse.move(850, 600, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  await shot('trigger-backlog-zoom')
  await clickMenu(app, 'Reset Capture Settings')
}
