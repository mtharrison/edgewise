// Builds the Rust addon and copies it to native/logic.node.
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const release = !process.argv.includes('--debug')
const target = process.env.CARGO_TARGET_DIR ?? 'target'
execSync(`cargo build -p logic-node ${release ? '--release' : ''}`, { stdio: 'inherit' })
const ext = { darwin: 'dylib', linux: 'so', win32: 'dll' }[process.platform]
const prefix = process.platform === 'win32' ? '' : 'lib'
const src = join(target, release ? 'release' : 'debug', `${prefix}logic_node.${ext}`)
mkdirSync('native', { recursive: true })
copyFileSync(src, join('native', 'logic.node'))
console.log(`native/logic.node <- ${src}`)
