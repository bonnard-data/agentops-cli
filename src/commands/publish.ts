import pc from 'picocolors'
import { put, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

export async function publishCommand(name: string, opts: { url?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  if (creds.user.role !== 'admin') {
    console.error(pc.red('Only admins can publish skills.'))
    console.log(pc.dim('  Ask an admin to run: agentops skills publish ' + name))
    process.exit(1)
  }

  const baseUrl = getBaseUrl(opts.url)
  const res = await put(`/api/skills/${encodeURIComponent(name)}/publish`, {}, baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    if (err.error?.code === 'invalid_state') {
      console.log(pc.dim('  Only "submitted" skills can be published. Check status: agentops skills mine'))
    } else if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Skill not found. Search: agentops skills search ${name}`))
    }
    process.exit(1)
  }

  console.log(pc.green(`✓ "${name}" published — available to the org now.`))
  console.log(pc.dim(`  Install: agentops skills install ${name}`))
}
