import fs from 'node:fs'
import path from 'node:path'
import pc from 'picocolors'
import { post, downloadBundleWithMeta, getBaseUrl, ApiError } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { getInstallDir, parseSkillSpec, type SkillSpec } from '../lib/skills.js'
import { unpackSkill } from '../lib/pack.js'

export async function installCommand(
  spec: string,
  opts: { url?: string; user?: boolean; project?: boolean; force?: boolean },
) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  let parsed: SkillSpec
  try {
    parsed = parseSkillSpec(spec)
  } catch (err) {
    console.error(pc.red((err as Error).message))
    process.exit(1)
  }

  const { name, version } = parsed
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

  // Register install on server (only when installing latest — version pins don't record)
  if (!version || version === 'latest') {
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
  }

  // Download the bundle (version-specific or latest)
  const downloadPath = (typeof version === 'number')
    ? `/api/skills/${encodeURIComponent(name)}/versions/${version}/bundle`
    : `/api/skills/${encodeURIComponent(name)}/bundle`

  console.log(pc.dim(typeof version === 'number' ? `Downloading v${version}...` : 'Downloading latest...'))
  let tgz: Buffer
  let downloadedVersion: number | null = null
  try {
    const { buffer, version: serverVersion } = await downloadBundleWithMeta(downloadPath, baseUrl)
    tgz = buffer
    downloadedVersion = serverVersion
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(pc.red(err.message))
      if (err.code === 'feature_gated') {
        console.log(pc.dim('  agentops whoami — check your current plan'))
      } else if (err.code === 'invalid_state') {
        console.log(pc.dim('  The skill exists but has no published bundle yet.'))
      }
    } else {
      console.error(pc.red(`Download failed: ${(err as Error).message}`))
    }
    process.exit(1)
  }
  console.log(pc.dim(`Bundle: ${(tgz.length / 1024).toFixed(1)} KB`))

  // Clean existing and unpack
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  await unpackSkill(tgz, dir)

  // Write .agentops-version sidecar so `list` can show "update available" later
  if (downloadedVersion != null) {
    try {
      fs.writeFileSync(path.join(dir, '.agentops-version'), `${downloadedVersion}\n`)
    } catch { /* best effort — don't fail install */ }
  }

  const scopeLabel = scope.user ? 'user' : 'project'
  const versionLabel = downloadedVersion != null ? ` v${downloadedVersion}` : ''
  console.log(pc.green(`✓ Installed "${name}"${versionLabel} (${scopeLabel})`))
  console.log(pc.dim(`  ${dir}`))
}

