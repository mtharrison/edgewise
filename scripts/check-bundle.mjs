// Run after `npm run package`: fails unless every unpacked app under dist/
// ships the fx2lafw firmware for each supported FX2 board, plus its license,
// README and source tarball (see scripts/fetch-firmware.mjs).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The firmware files named in the FX2 profile table.
const table = readFileSync('crates/logic-core/src/devices/fx2lafw.rs', 'utf8')
const firmware = [...new Set([...table.matchAll(/firmware: "([^"]+\.fw)"/g)].map((m) => m[1]))]
if (firmware.length === 0) throw new Error('no firmware files found in the FX2 profile table')
const source = /^sigrok-firmware-fx2lafw-\d[^/]*\.tar\.gz$/

// electron-builder's unpacked output: mac*/Edgewise.app, linux*-unpacked, win*-unpacked.
const resources = readdirSync('dist', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap(({ name }) =>
    /^mac/.test(name) ? readdirSync(join('dist', name)).filter((a) => a.endsWith('.app')).map((a) => join('dist', name, a, 'Contents', 'Resources'))
    : /^(linux|win).*unpacked$/.test(name) ? [join('dist', name, 'resources')]
    : [],
  )
if (resources.length === 0) {
  console.error('check-bundle: no unpacked app under dist/')
  process.exit(1)
}

let failed = false
for (const dir of resources) {
  const fw = join(dir, 'firmware')
  const files = existsSync(fw) ? readdirSync(fw) : []
  const missing = [...firmware, 'COPYING', 'README.txt'].filter((f) => !files.includes(f))
  if (!files.some((f) => source.test(f))) missing.push('sigrok-firmware-fx2lafw-<version>.tar.gz')
  if (missing.length) {
    failed = true
    console.error(`check-bundle: ${fw} is missing ${missing.join(', ')}`)
  } else {
    console.log(`check-bundle: ${fw} ok (${firmware.length} firmware files, COPYING, README.txt, source tarball)`)
  }
}
if (failed) process.exit(1)
