import pc from 'picocolors'
import { del, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { deleteSkillFile } from '../lib/skills.js'

export async function uninstallCommand(name: string, opts: { url?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl(opts.url)
  const res = await del(`/api/user/skills/${encodeURIComponent(name)}`, baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Check your installed skills: agentops skills mine`))
    }
    process.exit(1)
  }

  // Remove file from disk immediately
  deleteSkillFile(name)

  console.log(pc.green(`✓ Uninstalled "${name}". It won't sync on future sessions.`))
}
