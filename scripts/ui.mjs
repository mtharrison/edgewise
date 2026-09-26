#!/usr/bin/env node
// Drive the built app for UI checks: node scripts/ui.mjs [check.mjs ...]
//
// Builds the app, launches Electron (under xvfb-run on Linux with no DISPLAY),
// waits for the UI, then runs each check module's default export. With no
// check it just screenshots the start-up screen. Screenshots and GIFs go to
// ui-checks/; scripts/pr-media.sh publishes them so a PR body can embed them.
//
// A check is an ES module exporting `async ({ page, app, shot, rec }) => {}`:
//   page  Playwright Page for the main window   https://playwright.dev/docs/api/class-page
//   app   Playwright ElectronApplication         https://playwright.dev/docs/api/class-electronapplication
//   shot  await shot('name') saves ui-checks/name.png
//   rec   await rec('name', async () => { ... }) saves ui-checks/name.gif, an
//         animated GIF of the window while the callback runs (needs ffmpeg;
//         without it the frames stay in a temp dir and a notice is printed)
// Throw to fail the run. The demo device works without hardware.
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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

// Screenshots the window at `fps` while `fn` runs, then encodes the frames as a
// GIF, holding the first and last frames so the start and end states can be read.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rec = async (name, fn, { fps = 6, width = 960 } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'edgewise-rec-'))
  const frame = (i) => join(dir, `${String(i).padStart(5, '0')}.png`)
  let n = 0
  let recording = true
  const loop = (async () => {
    while (recording) {
      const t = Date.now()
      await page.screenshot({ path: frame(n) }).then(() => n++).catch(() => {})
      await sleep(Math.max(0, 1000 / fps - (Date.now() - t)))
    }
  })()
  try {
    return await fn()
  } finally {
    recording = false
    await loop
    if (n === 0) await page.screenshot({ path: frame(n++) })
    for (let i = 0; i < fps; i++) copyFileSync(frame(n - 1), frame(n + i)) // hold the last frame ~1s
    const gif = resolve(outDir, `${name}.gif`)
    const filter = `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, '%05d.png'), '-vf', filter, '-loop', '0', gif], { stdio: 'inherit' })
    if (r.status === 0) {
      console.log(`gif ${outDir}/${name}.gif (${n} frames)`)
      rmSync(dir, { recursive: true, force: true })
    } else {
      console.log(`gif ${name}: ffmpeg ${r.error ? 'not found' : 'failed'}; ${n} frames left in ${dir}`)
    }
  }
}

let failed = false
try {
  await page.waitForSelector('#root > *')
  if (checks.filter((c) => !c.startsWith('--')).length === 0) await shot('startup')
  for (const file of checks) {
    if (file.startsWith('--')) continue
    console.log(`check ${file}`)
    const mod = await import(pathToFileURL(resolve(file)).href)
    await mod.default({ page, app, shot, rec })
  }
} catch (err) {
  failed = true
  console.error(err)
  await shot('failed').catch(() => {})
} finally {
  await app.close().catch(() => {})
}
process.exit(failed ? 1 : 0)
