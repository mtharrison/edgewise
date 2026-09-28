// Downloads sigrok's fx2lafw firmware into firmware/ for `npm run package`,
// which ships that folder as process.resourcesPath/firmware. Both the binary
// and the source release are pinned by version and SHA-256; the source tarball
// ships unchanged beside the .fw files so the GPL source travels with them.
// To bump: change VERSION and both hashes (sha256 of the published files).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const VERSION = '0.1.7'
const BIN_SHA256 = 'c876fd075549e7783a6d5bfc8d99a695cfc583ddbcea0217d8e3f9351d1723af'
const SRC_SHA256 = 'a3f440d6a852a46e2c5d199fc1c8e4dacd006bc04e0d5576298ee55d056ace3b'

const BASE = 'https://sigrok.org/download'
const BIN = `sigrok-firmware-fx2lafw-bin-${VERSION}`
const SRC = `sigrok-firmware-fx2lafw-${VERSION}`
const SRC_URL = `${BASE}/source/sigrok-firmware-fx2lafw/${SRC}.tar.gz`
const OUT = 'firmware'
// Records what firmware/ holds, so a re-run with the same pin skips the downloads.
const STAMP = join(OUT, '.stamp')
const pin = `${VERSION} ${BIN_SHA256} ${SRC_SHA256}\n`

async function download(url, sha256) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const data = Buffer.from(await res.arrayBuffer())
  const actual = createHash('sha256').update(data).digest('hex')
  if (actual !== sha256) {
    throw new Error(`${url}: SHA-256 is ${actual}, expected ${sha256}. Not the pinned fx2lafw ${VERSION} release.`)
  }
  return data
}

const readme = `fx2lafw firmware ${VERSION}

The .fw files in this folder are sigrok's fx2lafw firmware, release ${VERSION},
unchanged from ${BIN}.tar.gz. Edgewise uploads them to FX2-based logic
analyzers that have no firmware yet. Files with the same name in Edgewise's
user firmware folder (File > Open Firmware Folder) are used instead.

fx2lafw is free software, licensed under the GNU General Public License,
version 2 or (at your option) any later version. See COPYING in this folder.
It runs on the logic analyzer, not as part of Edgewise, which is MIT-licensed.

Source: the complete source code of this release is in this folder, in
${SRC}.tar.gz. It is the release the .fw files were built from.

The same tarball is also published at
${SRC_URL}
and the project's home page is https://sigrok.org/wiki/Fx2lafw.
`

if (existsSync(STAMP) && readFileSync(STAMP, 'utf8') === pin) {
  console.log(`${OUT}/ already holds fx2lafw ${VERSION}`)
} else {
  try {
    const [bin, src] = await Promise.all([
      download(`${BASE}/binary/sigrok-firmware-fx2lafw/${BIN}.tar.gz`, BIN_SHA256),
      download(SRC_URL, SRC_SHA256),
    ])
    rmSync(OUT, { recursive: true, force: true })
    const unpack = join(OUT, '.unpack')
    mkdirSync(unpack, { recursive: true })
    writeFileSync(join(unpack, 'bin.tar.gz'), bin)
    // Relative paths: GNU tar would read a Windows drive letter as a remote host.
    execFileSync('tar', ['-xzf', 'bin.tar.gz'], { cwd: unpack, stdio: 'inherit' })
    const files = readdirSync(join(unpack, BIN)).filter((f) => f.endsWith('.fw') || f === 'COPYING')
    for (const f of files) copyFileSync(join(unpack, BIN, f), join(OUT, f))
    rmSync(unpack, { recursive: true })
    writeFileSync(join(OUT, `${SRC}.tar.gz`), src)
    writeFileSync(join(OUT, 'README.txt'), readme)
    writeFileSync(STAMP, pin)
    console.log(`${OUT}/ <- fx2lafw ${VERSION} (${files.length} files, README.txt, ${SRC}.tar.gz)`)
  } catch (e) {
    console.error(`fetch-firmware: ${e.message}`)
    process.exit(1)
  }
}
