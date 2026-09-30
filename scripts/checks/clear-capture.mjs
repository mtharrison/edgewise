// Clear the capture (change 88-clear-trace, task 3.2):
// node scripts/ui.mjs scripts/checks/clear-capture.mjs
//
// With the demo device: checks Clear is disabled at launch, captures, adds a UART
// decoder and drops marker A. The confirmation box is stubbed with scripted answers.
// Cancel keeps samples and marker; Clear shows the empty state, the status bar reads
// Ready with no sample count, the decoder stays with no rows, and nothing starts.
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
  await app.evaluate(({ dialog, ipcMain }) => {
    const real = ipcMain._invokeHandlers.get('engine')
    const log = (globalThis.__clear = { answers: [], boxes: [], starts: 0, real, realBox: dialog.showMessageBox })
    ipcMain._invokeHandlers.set('engine', (e, method, args) => {
      if (method === 'start') log.starts++
      return real(e, method, args)
    })
    dialog.showMessageBox = async (_w, opts) => {
      log.boxes.push({ type: opts.type, message: opts.message, detail: opts.detail, buttons: opts.buttons, defaultId: opts.defaultId, cancelId: opts.cancelId })
      return { response: log.answers.shift() === 'clear' ? 0 : 1 }
    }
  })
  const state = () => app.evaluate(() => ({ boxes: globalThis.__clear.boxes, starts: globalThis.__clear.starts }))
  const answer = (a) => app.evaluate((_, a) => globalThis.__clear.answers.push(a), a)

  const device = page.locator('.field', { hasText: 'Device' }).locator('select')
  const clear = page.locator('.icon-btn[title="Clear capture"]')
  const start = page.locator('.capture-btn')
  const bar = page.locator('.statusbar')
  const cards = page.locator('.section', { hasText: 'Analyzers' }).locator('.card')
  const rows = page.locator('.table-head .muted')
  const markerA = page.locator('.metric', { has: page.locator('.metric-label', { hasText: /^A$/ }) }).locator('.metric-value')

  try {
    await clickMenu(app, 'Reset Capture Settings')
    const demo = await device.locator('option', { hasText: 'Demo' }).first().getAttribute('value')
    if ((await device.inputValue()) !== demo) await device.selectOption(demo)
    await page.locator('.field', { hasText: 'Duration' }).locator('select').selectOption({ value: '0.1' })

    expect(await clear.isDisabled(), 'Clear is disabled with nothing captured')

    await start.click()
    await page.waitForFunction(() => document.querySelector('.statusbar')?.innerText.includes('Done'), null, { timeout: 30_000 })
    expect(await clear.isEnabled(), 'Clear is enabled after a capture')
    await page.locator('.pill', { hasText: 'UART' }).click()
    await page.waitForFunction(() => /^[1-9][\d,]* rows$/.test(document.querySelector('.table-head .muted')?.textContent ?? ''), null, { timeout: 10_000 })
    const box = await page.locator('.plot').boundingBox()
    await page.mouse.click(box.x + box.width / 3, box.y + 10)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    expect((await markerA.innerText()) !== '—', 'marker A dropped')
    const before = { bar: await bar.innerText(), rows: await rows.innerText(), a: await markerA.innerText() }
    console.log('before', JSON.stringify(before))
    await shot('clear-button')

    // Cancel.
    await answer('cancel')
    await clear.click()
    await page.waitForTimeout(500)
    let s = await state()
    expect(s.boxes.length === 1, 'Clear opens the confirmation')
    const b = s.boxes[0]
    expect(b.message === 'Clear the capture?' && /discarded/.test(b.detail), 'dialog asks "Clear the capture?" and says samples are discarded')
    expect(b.buttons.join('|') === 'Clear|Cancel' && b.defaultId === 1 && b.cancelId === 1, 'dialog offers Clear and Cancel, Cancel is the default')
    expect((await bar.innerText()).includes('samples') && (await markerA.innerText()) === before.a, 'Cancel keeps the samples and the marker')
    expect((await rows.innerText()) === before.rows, 'Cancel keeps the decoded rows')

    // Clear.
    await answer('clear')
    await rec('clear-capture', async () => {
      await page.waitForTimeout(600)
      await clear.hover()
      await page.waitForTimeout(400)
      await clear.click()
      await page.waitForSelector('.empty-title')
      await page.waitForFunction(() => document.querySelector('.table-head .muted')?.textContent === '0 rows', null, { timeout: 10_000 })
      await page.waitForTimeout(800)
    })
    s = await state()
    const bar2 = await bar.innerText()
    console.log('after', JSON.stringify({ bar: bar2, rows: await rows.innerText() }))
    await shot('clear-after')
    expect((await page.locator('.empty-title').innerText()) === 'No capture yet', 'waveform shows "No capture yet"')
    expect(bar2.includes('Ready') && !bar2.includes('samples'), 'status bar reads Ready with no sample count')
    expect((await markerA.innerText()) === '—', 'markers are gone')
    expect((await cards.count()) === 1 && (await cards.first().innerText()).includes('UART'), 'UART decoder is still listed')
    expect((await rows.innerText()) === '0 rows', 'decoder shows no annotations')
    expect(s.starts === 1 && s.boxes.length === 2, 'clearing did not start a capture')
    expect(await clear.isDisabled(), 'Clear is disabled again')
    expect((await start.innerText()).trim() === 'Start', 'capture button reads Start')
  } finally {
    await app.evaluate(({ dialog, ipcMain }) => {
      ipcMain._invokeHandlers.set('engine', globalThis.__clear.real)
      dialog.showMessageBox = globalThis.__clear.realBox
    })
    await clickMenu(app, 'Reset Capture Settings')
  }
}
