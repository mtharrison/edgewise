// ⌘-click glide: node scripts/ui.mjs scripts/checks/cmd-click-glide.mjs
//
// Captures from the demo device with a UART decoder, zooms in, then checks that
// ⌘/Ctrl-click on a packet or a burst glides through intermediate zooms, that
// input during a glide takes over, that a second ⌘-click retargets it, that it
// jumps at once with reduced motion, and that F, table rows, the overview strip
// and +/- stay instant. Records the glide.

// The status bar's time/div readout.
const perDivText = () => [...document.querySelectorAll('.statusbar .mono')].find((e) => e.textContent.endsWith('/ div'))?.textContent ?? ''

// Samples the time/div readout each frame for `ms` after `act`; returns the distinct values in order.
const perDivDuring = async (page, act, ms = 700) => {
  const sampling = page.evaluate(
    (ms) =>
      new Promise((done) => {
        const seen = []
        const t0 = performance.now()
        const tick = () => {
          const t = [...document.querySelectorAll('.statusbar .mono')].find((e) => e.textContent.endsWith('/ div'))
          seen.push(t?.textContent ?? '')
          performance.now() - t0 < ms ? requestAnimationFrame(tick) : done(seen)
        }
        requestAnimationFrame(tick)
      }),
    ms
  )
  await act()
  const seen = await sampling
  return seen.filter((v, i) => v !== seen[i - 1])
}

export default async ({ app, page, shot, rec }) => {
  const mod = (await app.evaluate(() => process.platform)) === 'darwin' ? 'Meta' : 'Control'
  const device = page.locator('.field', { hasText: 'Device' }).locator('select')
  const demo = await device.locator('option', { hasText: 'Demo' }).first().getAttribute('value')
  if ((await device.inputValue()) !== demo) await device.selectOption(demo)
  // Settings persist between runs, so add the UART decoder only once.
  if (!(await page.locator('.dec-label', { hasText: 'UART' }).count())) await page.locator('.pill', { hasText: 'UART' }).click()
  await page.locator('.capture-btn').click()
  await page.waitForFunction(() => document.querySelector('.capture-btn')?.classList.contains('busy'))
  await page.waitForFunction(() => !document.querySelector('.capture-btn')?.classList.contains('busy'), null, { timeout: 30_000 })
  await page.waitForFunction(() => !document.querySelector('.statusbar .spinner'))
  await page.evaluate(() => document.activeElement?.blur())

  const plot = await page.locator('.plot').boundingBox()
  const row = await page.locator('.dec-label', { hasText: 'Data' }).first().boundingBox()
  const x = plot.x + plot.width / 2
  const y = row.y + row.height / 2
  const blur = () => page.evaluate(() => document.activeElement?.blur())
  const perDiv = () => page.evaluate(perDivText)
  // A decoded-table row centres its packet; zooming out from there leaves the packet under x.
  const zoomIn = async () => {
    await page.keyboard.press('f')
    await page.locator('.table-row').nth(2).click()
    await blur()
    await page.mouse.move(x, y)
    for (let i = 0; i < 3; i++) await page.keyboard.press('-')
    await page.waitForTimeout(300)
  }
  const cmdClickAt = async (cx, cy = y, settle = 100) => {
    await page.keyboard.down(mod)
    await page.mouse.move(cx, cy)
    if (settle) await page.waitForTimeout(settle)
    await page.mouse.click(cx, cy)
    await page.keyboard.up(mod)
  }
  const cmdClick = () => cmdClickAt(x + 1)
  // A plain click on the Data row focuses the table row of the packet under the pointer.
  const packetAtCentre = async () => {
    await page.mouse.click(x, y)
    await page.waitForTimeout(200)
    const focus = await page.locator('.table-row.focus').innerText()
    await blur()
    return focus
  }

  await zoomIn()
  let steps
  await rec(
    'cmd-click-glide',
    async () => {
      steps = await perDivDuring(page, cmdClick)
      await page.waitForTimeout(300)
    },
    { fps: 20 }
  )
  console.log('cmd-click', JSON.stringify(steps))
  if (steps.length < 4) throw new Error(`⌘-click jumped instead of gliding: ${steps}`)
  await shot('cmd-click-glide-after')
  const first = await packetAtCentre()
  console.log('framed', JSON.stringify(first))

  // Already framed: ⌘-click on the framed packet changes nothing.
  const again = await perDivDuring(page, cmdClick, 400)
  if (again.length !== 1) throw new Error(`⌘-click on the framed packet moved the view: ${again}`)

  const fitSteps = await perDivDuring(page, () => page.keyboard.press('f'))
  console.log('fit', JSON.stringify(fitSteps))
  if (fitSteps.length > 2) throw new Error(`F fit animated: ${fitSteps}`)

  // User input takes over: '-' mid-glide applies at once and no glide frames follow.
  await zoomIn()
  let atKey
  const takeover = await perDivDuring(
    page,
    async () => {
      await cmdClick()
      await page.waitForTimeout(60)
      await page.keyboard.press('-')
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
      atKey = await perDiv()
    },
    900
  )
  console.log('takeover', JSON.stringify(takeover), 'after key', atKey)
  if (takeover.at(-1) !== atKey) throw new Error(`glide kept moving after '-': ${takeover} (after key ${atKey})`)
  if (takeover.length < 3 || takeover.at(-1) === steps.at(-1)) throw new Error(`'-' did not interrupt the glide: ${takeover}`)

  // Second ⌘-click during a glide retargets it to the second packet.
  await zoomIn()
  const retarget = await perDivDuring(
    page,
    async () => {
      await cmdClick()
      await page.waitForTimeout(40)
      await cmdClickAt(x + plot.width * 0.15, y, 0)
    },
    1200
  )
  console.log('retarget', JSON.stringify(retarget))
  const second = await packetAtCentre()
  console.log('framed', JSON.stringify(second))
  if (second === first) throw new Error(`second ⌘-click did not retarget the glide: still framing ${first}`)
  const settled = await perDivDuring(page, cmdClick, 400)
  if (settled.length !== 1) throw new Error(`view did not end framing the second packet: ⌘-click on it moved ${settled}`)

  // Glide into a burst on D1 (I²C SCL, no decoder): find one by the pointer cursor, then ⌘-click it.
  await page.keyboard.press('f')
  const d1 = await page.locator('.ch-label').filter({ has: page.locator('.ch-index', { hasText: /^D1$/ }) }).boundingBox()
  const by = d1.y + d1.height / 2
  await page.keyboard.down(mod)
  let bx = null
  for (let px = plot.x + 2; px < plot.x + plot.width - 2 && bx === null; px += 2) {
    await page.mouse.move(px, by)
    await page.waitForTimeout(10)
    if ((await page.locator('.plot').evaluate((e) => e.style.cursor)) === 'pointer') bx = px
  }
  await page.keyboard.up(mod)
  if (bx === null) throw new Error('no burst found on D1')
  const burst = await perDivDuring(page, () => cmdClickAt(bx, by))
  console.log('burst', JSON.stringify(burst))
  if (burst.length < 4) throw new Error(`⌘-click on a burst jumped instead of gliding: ${burst}`)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.keyboard.press('f')
  const burstJump = await perDivDuring(page, () => cmdClickAt(bx, by))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  if (burstJump.at(-1) !== burst.at(-1)) throw new Error(`burst glide ended at ${burst.at(-1)}, instant jump at ${burstJump.at(-1)}`)

  // Other view changes stay instant.
  await zoomIn()
  const instant = {
    'table row': () => page.locator('.table-row').nth(8).click(),
    overview: async () => {
      const o = await page.locator('.overview canvas').boundingBox()
      await page.mouse.click(o.x + o.width * 0.6, o.y + o.height / 2)
    },
    '+': () => page.keyboard.press('+'),
    '-': () => page.keyboard.press('-')
  }
  for (const [name, act] of Object.entries(instant)) {
    const s = await perDivDuring(page, act, 500)
    console.log(name, JSON.stringify(s))
    if (s.length > 2) throw new Error(`${name} animated: ${s}`)
    await blur()
    await page.mouse.move(x, y)
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await zoomIn()
  const reduced = await perDivDuring(page, cmdClick)
  console.log('reduced motion', JSON.stringify(reduced))
  if (reduced.length !== 2) throw new Error(`⌘-click with reduced motion did not jump at once: ${reduced}`)
  if (reduced.at(-1) !== steps.at(-1)) throw new Error(`reduced-motion jump landed at ${reduced.at(-1)}, glide at ${steps.at(-1)}`)
}
