// Remembered capture settings (change 34-remember-capture-settings, tasks 2.4 and 3.3):
// node scripts/ui.mjs scripts/checks/remember-settings.mjs
//
// With the demo device, customises duration, pre-trigger, channel names, visibility,
// a trigger and a UART decoder, reloads the window and checks they came back. Then
// saves a capture, renames a channel and opens the file to check its names win.
// Finally chooses Capture → Reset Capture Settings, checks the defaults before and
// after another reload, and checks the Capture menu items. Ends with defaults saved.
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const expect = (ok, what) => {
  if (!ok) throw new Error(what)
  console.log(`ok ${what}`)
}

const captureMenu = (app) =>
  app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((i) => i.label === 'Capture').submenu.items.map((i) => i.label))

const clickMenu = (app, label) =>
  app.evaluate(({ Menu }, label) => {
    const capture = Menu.getApplicationMenu().items.find((i) => i.label === 'Capture')
    capture.submenu.items.find((i) => i.label === label).click()
  }, label)

export default async ({ page, app, shot }) => {
  const device = page.locator('.field', { hasText: 'Device' }).locator('select')
  const duration = page.locator('.field', { hasText: 'Duration' }).locator('select')
  const chip = page.locator('.field.trigger .chip')
  const label = (i) => page.locator('.ch-label', { has: page.locator('.ch-index', { hasText: new RegExp(`^D${i}$`) }) })
  const names = () => page.locator('.ch-label .ch-name').allInnerTexts()
  const cards = page.locator('.section', { hasText: 'Analyzers' }).locator('.card')
  const pretrigger = async () => {
    await chip.click()
    const v = await page.locator('.popover input[type=range]').inputValue()
    await page.mouse.click(800, 500)
    return v
  }
  const rename = async (i, name) => {
    await label(i).locator('.ch-name').dblclick()
    await label(i).locator('.ch-input').fill(name)
    await label(i).locator('.ch-input').press('Enter')
  }
  const reload = async () => {
    await page.reload()
    await page.waitForSelector('#root > *')
    await page.waitForTimeout(1000)
  }

  // Start from defaults so earlier runs don't leave decoders behind.
  await clickMenu(app, 'Reset Capture Settings')
  const demo = await device.locator('option', { hasText: 'Demo' }).first().getAttribute('value')
  if ((await device.inputValue()) !== demo) await device.selectOption(demo)

  // Customise.
  await duration.selectOption('1')
  await chip.click()
  await page.locator('.popover input[type=range]').fill('0.3')
  await page.mouse.click(800, 500)
  await rename(0, 'TX')
  await label(2).locator('.icon-btn.trig').click()
  await page.locator('.pill', { hasText: 'UART' }).click()
  const baud = cards.first().locator('.form-row', { hasText: 'Baud' }).locator('input')
  await baud.fill('9600')
  await baud.press('Enter')
  await label(7).hover()
  await label(7).locator('[title="Hide channel"]').click()
  await page.waitForTimeout(300)
  await shot('remember-1-customised')

  // Reload and check every value came back.
  await reload()
  await shot('remember-2-after-reload')
  expect((await device.inputValue()) === demo, 'demo device selected after reload')
  expect((await duration.inputValue()) === '1', 'duration 1 s after reload')
  expect((await pretrigger()) === '0.3', 'pre-trigger 30% after reload')
  expect((await label(0).locator('.ch-name').innerText()) === 'TX', 'D0 named TX after reload')
  expect((await label(7).count()) === 0 && (await page.getByText('Show 1 hidden').isVisible()), 'D7 hidden after reload')
  expect((await label(2).locator('.icon-btn.trig').innerText()).trim() === 'Rising', 'rising trigger on D2 after reload')
  expect((await cards.count()) === 1, 'one decoder after reload')
  expect((await cards.first().locator('.card-title').innerText()) === 'UART', 'decoder is UART')
  expect((await cards.first().locator('.card-sub').innerText()) === 'TX · 9600 baud', 'UART on TX at 9600 baud')

  // Save a capture with a distinctive name on D1, rename D1, open the file: the file's names win.
  await rename(1, 'FILE1')
  await duration.selectOption('0.01') // a short capture keeps the file small
  await page.locator('.capture-btn').click()
  await page.locator('.capture-btn.done').waitFor({ timeout: 20_000 })
  const file = join(tmpdir(), `edgewise-remember-${process.pid}.sr`)
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, file)
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((i) => i.label === 'File').submenu.items.find((i) => i.label === 'Save As…').click())
  await page.getByText(/^Saved /).waitFor()
  await rename(1, 'LIVE1')
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((i) => i.label === 'File').submenu.items.find((i) => i.label === 'Open…').click())
  await page.waitForTimeout(1000)
  await shot('remember-3-opened-file')
  const opened = await names()
  console.log('names after open', JSON.stringify(opened))
  expect(opened[0] === 'TX' && opened[1] === 'FILE1', "opened file's channel names shown")

  // Reset from the Capture menu, then reload: defaults both times.
  const checkDefaults = async (when) => {
    const n = await names()
    expect(n.length === 8 && n.every((x, i) => x === `D${i}`), `channels D0…D7 ${when}`)
    expect((await chip.innerText()).trim() === 'None', `no trigger ${when}`)
    expect((await cards.count()) === 0, `no decoders ${when}`)
    expect((await duration.inputValue()) === '0.1', `duration 100 ms ${when}`)
    expect((await pretrigger()) === '0.1', `pre-trigger 10% ${when}`)
  }
  await clickMenu(app, 'Reset Capture Settings')
  await page.waitForTimeout(300)
  await shot('remember-4-after-reset')
  await checkDefaults('after reset')
  await reload()
  await shot('remember-5-reset-after-reload')
  await checkDefaults('after reset and reload')

  const items = (await captureMenu(app)).filter(Boolean)
  console.log('Capture menu', JSON.stringify(items))
  expect(['Start / Stop', 'Zoom to Fit', 'Reset Capture Settings'].every((l) => items.includes(l)), 'Capture menu lists Start / Stop, Zoom to Fit, Reset Capture Settings')
}
