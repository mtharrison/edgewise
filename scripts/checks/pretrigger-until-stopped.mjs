// "Until stopped" pre-trigger time (change 73-until-stopped-pretrigger-time, tasks 3.2–3.4):
// node scripts/ui.mjs scripts/checks/pretrigger-until-stopped.mjs
//
// With the demo device, checks the Pre-trigger slider is a percentage for a timed
// duration and a time (0–1 s) for "Until stopped", and that each mode keeps its own
// value. Runs a triggered "Until stopped" capture with a 10 ms pre-trigger and checks
// the trigger position is 10 ms of samples. Then checks a 250 ms time survives a
// reload and that Reset Capture Settings puts it back to 100 ms. Ends with defaults saved.
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
  const duration = page.locator('.field', { hasText: 'Duration' }).locator('select')
  const chip = page.locator('.field.trigger .chip')
  const slider = page.locator('.popover .slider input[type=range]')
  const value = page.locator('.popover .slider .mono')
  const open = async () => (await slider.count()) || (await chip.click())
  const close = () => page.mouse.click(800, 500)
  const read = async () => {
    await open()
    const r = { label: (await value.innerText()).trim(), value: await slider.inputValue(), max: await slider.getAttribute('max') }
    await close()
    return r
  }
  const setSlider = async (v) => {
    await open()
    await slider.fill(v)
    await close()
  }
  const reload = async () => {
    await page.reload()
    await page.waitForSelector('#root > *')
    await page.waitForTimeout(1000)
  }

  await clickMenu(app, 'Reset Capture Settings')
  const demo = await device.locator('option', { hasText: 'Demo' }).first().getAttribute('value')
  if ((await device.inputValue()) !== demo) await device.selectOption(demo)

  // Defaults: 10% for a timed capture, 100 ms until stopped.
  let r = await read()
  expect(r.label === '10%' && r.max === '0.9', `100 ms duration shows 10% up to 90% (${JSON.stringify(r)})`)
  await duration.selectOption('0')
  r = await read()
  expect(r.label === '100 ms' && r.max === '1', `"Until stopped" shows 100 ms up to 1 s (${JSON.stringify(r)})`)

  // Each mode keeps its own value.
  await duration.selectOption('1')
  await setSlider('0.3')
  await duration.selectOption('0')
  await rec('pretrigger-until-stopped', async () => {
    await open()
    await page.waitForTimeout(600)
    for (const v of ['0.2', '0.35', '0.5']) {
      await slider.fill(v)
      await page.waitForTimeout(400)
    }
    await page.waitForTimeout(600)
    await close()
    await duration.selectOption('1')
    await open()
    await page.waitForTimeout(1200)
    await close()
    await duration.selectOption('0')
    await open()
    await page.waitForTimeout(1200)
    await close()
  })
  await duration.selectOption('1')
  r = await read()
  expect(r.label === '30%', `back to 1 s shows 30% (${r.label})`)
  await duration.selectOption('0')
  r = await read()
  expect(r.label === '500 ms', `"Until stopped" again shows 500 ms (${r.label})`)
  await open()
  await shot('pretrigger-until-stopped')
  await close()

  // A triggered "Until stopped" capture keeps 10 ms before the trigger. D5 is high as D6
  // rises first 16 ms into the demo's 20 ms loop, so the 10 ms ring has filled by then.
  await setSlider('0.01')
  await open()
  await page.locator('.popover .trig-row').nth(5).locator('select').selectOption('high')
  await page.locator('.popover .trig-row').nth(6).locator('select').selectOption('rising')
  await close()
  const button = page.locator('.capture-btn')
  await button.click()
  await page.waitForFunction(async () => (await window.edgewise.call('status')).trigger !== null, null, { timeout: 20_000 })
  await page.waitForTimeout(500)
  await button.click()
  await page.waitForFunction(() => !document.querySelector('.capture-btn')?.classList.contains('busy'), null, { timeout: 10_000 })
  const st = await page.evaluate(() => window.edgewise.call('status'))
  const want = Math.round(0.01 * st.samplerate)
  console.log('status', JSON.stringify({ trigger: st.trigger, samplerate: st.samplerate, samples: st.samples, kept: st.pretriggerKept }))
  expect(st.trigger === want, `trigger position ${st.trigger} is 10 ms at ${st.samplerate / 1e6} MHz (${want})`)
  expect(st.pretriggerKept === null && (await page.locator('.toast').count()) === 0, 'no memory-limit message')
  await shot('pretrigger-until-stopped-capture')

  // Remembered across a reload, and reset to 100 ms.
  await setSlider('0.25')
  await reload()
  expect((await duration.inputValue()) === '0', '"Until stopped" after reload')
  r = await read()
  expect(r.label === '250 ms', `250 ms after reload (${r.label})`)
  await clickMenu(app, 'Reset Capture Settings')
  await page.waitForTimeout(300)
  await duration.selectOption('0')
  r = await read()
  expect(r.label === '100 ms', `100 ms after Reset Capture Settings (${r.label})`)
  await clickMenu(app, 'Reset Capture Settings')
}
