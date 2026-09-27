// Choose firmware folder on Start (change 9-missing-firmware-error-message, task 2.4):
// node scripts/ui.mjs scripts/checks/firmware-folder.mjs
//
// No board needed: wraps the engine IPC handler in main so the device list gains a
// bare "Saleae Logic" whose firmware file is missing unless it is in the user
// firmware folder, and Start on it captures from the demo device instead. The
// message box and folder picker are stubbed with scripted answers. Checks Cancel,
// a folder without the file, then a folder with it (files copied, capture starts).
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FILE = 'fx2lafw-saleae-logic.fw'
const OTHER = 'fx2lafw-cypress-fx2.fw'

const expect = (ok, what) => {
  if (!ok) throw new Error(what)
  console.log(`ok ${what}`)
}

export default async ({ page, app, shot }) => {
  const good = mkdtempSync(join(tmpdir(), 'edgewise-fw-'))
  const empty = mkdtempSync(join(tmpdir(), 'edgewise-fw-'))
  writeFileSync(join(good, FILE), '')
  writeFileSync(join(good, OTHER), '')
  const userFw = await app.evaluate(({ app }) => process.getBuiltinModule('path').join(app.getPath('userData'), 'firmware'))
  for (const f of [FILE, OTHER]) rmSync(join(userFw, f), { force: true })

  await app.evaluate(({ dialog, ipcMain }, { FILE, userFw }) => {
    const fs = process.getBuiltinModule('fs')
    const path = process.getBuiltinModule('path')
    const real = ipcMain._invokeHandlers.get('engine')
    const id = 'fx2:0925:3881:99'
    const log = (globalThis.__fw = { answers: [], boxes: [], starts: [], real })
    ipcMain._invokeHandlers.set('engine', async (e, method, args) => {
      if (method === 'listDevices') {
        const list = await real(e, method, args)
        const missing = fs.existsSync(path.join(userFw, FILE)) ? null : FILE
        const note = missing ? `Needs ${FILE} in a firmware folder` : 'Firmware will be uploaded on first capture'
        return [{ ...list.find((d) => d.id === 'demo'), id, name: 'Saleae Logic', driver: 'fx2lafw', note, missingFirmware: missing }, ...list]
      }
      if (method === 'start' && args[0].deviceId === id) {
        log.starts.push(id)
        return real(e, method, [{ ...args[0], deviceId: 'demo' }])
      }
      return real(e, method, args)
    })
    dialog.showMessageBox = async (_w, opts) => {
      log.boxes.push({ message: opts.message, detail: opts.detail, buttons: opts.buttons })
      return { response: log.answers.shift() === 'choose' ? 0 : 1 }
    }
    dialog.showOpenDialog = async () => {
      const dir = log.answers.shift()
      return dir ? { canceled: false, filePaths: [dir] } : { canceled: true, filePaths: [] }
    }
  }, { FILE, userFw })

  const state = () => app.evaluate(() => ({ boxes: globalThis.__fw.boxes, starts: globalThis.__fw.starts, left: globalThis.__fw.answers.length }))
  const answer = (...a) => app.evaluate((_, a) => globalThis.__fw.answers.push(...a), a)
  const device = page.locator('.field', { hasText: 'Device' }).locator('select')
  const start = page.locator('.capture-btn')

  try {
    await page.locator('.icon-btn[title="Rescan devices"]').click()
    await device.selectOption({ label: 'Saleae Logic' })
    await page.waitForTimeout(300)
    await shot('firmware-bare-board')
    expect((await page.locator('.device-note').innerText()).includes(FILE), 'note names the missing file')

    // Cancel in the message box.
    await answer('cancel')
    await start.click()
    await page.waitForTimeout(500)
    let s = await state()
    expect(s.boxes.length === 1 && s.boxes[0].message === `Firmware ${FILE} not found`, 'Start opens the dialog naming the file')
    expect(s.boxes[0].buttons.join('|') === 'Choose Folder…|Cancel', 'dialog offers Choose Folder… and Cancel')
    expect(s.starts.length === 0, 'Cancel does not start a capture')
    expect((await page.locator('.toast').count()) === 0, 'Cancel shows no error')

    // Wrong folder, then cancel the folder picker on the second round.
    await answer('choose', empty, 'choose', undefined)
    await start.click()
    await page.waitForTimeout(500)
    s = await state()
    expect(s.boxes.length === 3 && s.boxes[2].detail.includes(empty) && s.boxes[2].detail.includes(FILE), 'wrong folder brings the dialog back naming folder and file')
    expect(s.starts.length === 0 && !existsSync(join(userFw, FILE)), 'wrong folder copies nothing and does not start')

    // Right folder.
    await answer('choose', good)
    await start.click()
    await page.waitForTimeout(1000)
    s = await state()
    await shot('firmware-capture-started')
    expect(existsSync(join(userFw, FILE)) && existsSync(join(userFw, OTHER)), 'every .fw file is copied into the user firmware folder')
    expect(s.starts.length === 1, 'capture starts after choosing the folder')
    expect((await page.locator('.device-note').innerText()).includes('uploaded on first capture'), 'device is re-listed without missing firmware')
    expect(s.left === 0, 'every scripted answer was used')
  } finally {
    await app.evaluate(({ ipcMain }) => ipcMain._invokeHandlers.set('engine', globalThis.__fw.real))
    for (const f of [FILE, OTHER]) rmSync(join(userFw, f), { force: true })
    rmSync(good, { recursive: true, force: true })
    rmSync(empty, { recursive: true, force: true })
  }
}
