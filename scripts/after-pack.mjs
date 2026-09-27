// electron-builder afterPack hook. Without a Developer ID the packaged app
// still carries Electron's own linker signature, which the added resources
// invalidate; macOS then calls a downloaded copy "damaged". Re-sign it ad hoc
// so Gatekeeper offers "Open Anyway" instead. A real identity replaces this.
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

export default async function afterPack({ appOutDir, packager, electronPlatformName }) {
  if (electronPlatformName !== 'darwin' || process.env.CSC_IDENTITY_AUTO_DISCOVERY !== 'false') return
  const app = join(appOutDir, `${packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  console.log(`  • ad-hoc signed   ${app}`)
}
