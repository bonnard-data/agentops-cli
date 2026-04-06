import pc from 'picocolors'
import { post, get, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { writeSkillFile } from '../lib/skills.js'

export async function installCommand(name: string, opts: { url?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl(opts.url)

  // 1. Save to DB for future syncs
  const installRes = await post('/api/user/skills/install', { name }, baseUrl)
  if (!installRes.ok) {
    const err = await installRes.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${installRes.status}`))
    if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Search the library: agentops skills search ${name}`))
    } else if (err.error?.code === 'invalid_state') {
      console.log(pc.dim('  Only published skills can be installed. Check with the author or an admin.'))
    }
    process.exit(1)
  }

  // 2. Fetch full skill content
  const skillRes = await get(`/api/skills/${encodeURIComponent(name)}`, baseUrl)
  if (!skillRes.ok) {
    console.log(pc.green(`✓ Installed "${name}".`))
    console.log(pc.yellow('  Could not fetch content — will sync on next session start.'))
    return
  }

  const skill = await skillRes.json() as { name: string; description: string; content: string }

  // 3. Write to disk immediately
  const filePath = writeSkillFile(skill)

  console.log(pc.green(`✓ Installed "${name}" — ready to use now.`))
  console.log(pc.dim(`  File: ${filePath}`))
  console.log(pc.dim(`  Uninstall: agentops skills uninstall ${name}`))
}
