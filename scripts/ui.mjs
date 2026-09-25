#!/usr/bin/env node
// Drive the built app for UI checks: node scripts/ui.mjs [check.mjs ...]
//
// Builds the app, launches Electron (under xvfb-run on Linux with no DISPLAY),
// waits for the UI, then runs each check module's default export. With no
// check it just screenshots the start-up screen. Screenshots go to ui-checks/.
//
// A check is an ES module exporting `async ({ page, app, shot }) => {}`:
//   page  Playwright Page for the main window   https://playwright.dev/docs/api/class-page
//   app   Playwright ElectronApplication         https://playwright.dev/docs/api/class-electronapplication
//   shot  await shot('name') saves ui-checks/name.png
// Throw to fail the run. The demo device works without hardware.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const checks = process.argv.slice(2)
const outDir = 'ui-checks'

if (process.platform === 'linux' && !process.env.DISPLAY) {
  const r = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', process.execPath, ...process.argv.slice(1)], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}

if (!existsSync('node_modules/electron/path.txt')) execFileSync(process.execPath, ['node_modules/electron/install.js'], { stdio: 'inherit' })
if (!process.argv.includes('--no-build')) execFileSync('npm', ['run', 'build'], { stdio: 'inherit' })

const { _electron: electron } = await import('playwright-core')
const app = await electron.launch({
  args: ['.', ...(process.env.CI ? ['--no-sandbox'] : [])],
  env: { ...process.env }
})
const page = await app.firstWindow()
page.setDefaultTimeout(10_000)
mkdirSync(outDir, { recursive: true })
const shot = async (name) => {
  const path = resolve(outDir, `${name}.png`)
  await page.screenshot({ path })
  console.log(`screenshot ${outDir}/${name}.png`)
}

let failed = false
try {
  await page.waitForSelector('#root > *')
  if (checks.filter((c) => !c.startsWith('--')).length === 0) await shot('startup')
  for (const file of checks) {
    if (file.startsWith('--')) continue
    console.log(`check ${file}`)
    const mod = await import(pathToFileURL(resolve(file)).href)
    await mod.default({ page, app, shot })
  }
} catch (err) {
  failed = true
  console.error(err)
  await shot('failed').catch(() => {})
} finally {
  await app.close().catch(() => {})
}
process.exit(failed ? 1 : 0)
