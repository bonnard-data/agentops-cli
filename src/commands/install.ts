import fs from 'node:fs'
import path from 'node:path'
import pc from 'picocolors'
import { post, downloadBundle, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { getInstallDir } from '../lib/skills.js'
import { unpackSkill } from '../lib/pack.js'

export async function installCommand(name: string, opts: { url?: string; user?: boolean; project?: boolean; force?: boolean }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl(opts.url)
  const scope = { user: opts.user ?? false }
  let dir: string
  try {
    dir = getInstallDir(name, scope)
  } catch (err) {
    console.error(pc.red((err as Error).message))
    process.exit(1)
  }

  // Check if skill already exists locally
  if (fs.existsSync(path.join(dir, 'SKILL.md')) && !opts.force) {
    console.log(pc.yellow(`Skill "${name}" already exists at ${dir}`))
    console.log(pc.dim('  Use --force to overwrite.'))
    process.exit(1)
  }

  // Register install on server
  const installRes = await post('/api/user/skills/install', { name }, baseUrl)
  if (!installRes.ok) {
    const err = await installRes.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${installRes.status}`))
    if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Search the library: agentops skills search ${name}`))
    } else if (err.error?.code === 'invalid_state') {
      console.log(pc.dim('  Only published skills can be installed.'))
    }
    process.exit(1)
  }

  // Download the bundle
  console.log(pc.dim('Downloading...'))
  let tgz: Buffer
  try {
    tgz = await downloadBundle(`/api/skills/${encodeURIComponent(name)}/bundle`, baseUrl)
  } catch {
    console.log(pc.green(`✓ Registered "${name}" for sync.`))
    console.log(pc.yellow('  Bundle download failed — skill will be available on next sync.'))
    return
  }
  console.log(pc.dim(`Bundle: ${(tgz.length / 1024).toFixed(1)} KB`))

  // Clean existing and unpack
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  await unpackSkill(tgz, dir)

  const scopeLabel = scope.user ? 'user' : 'project'
  console.log(pc.green(`✓ Installed "${name}" (${scopeLabel})`))
  console.log(pc.dim(`  ${dir}`))
}
