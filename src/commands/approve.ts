import pc from 'picocolors'
import { put, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

export async function approveCommand(name: string) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  if (creds.user.role !== 'admin') {
    console.error(pc.red('Only admins can approve skills.'))
    console.log(pc.dim('  Ask an admin to run: agentops skills approve ' + name))
    process.exit(1)
  }

  const baseUrl = getBaseUrl()
  // Server endpoint is still /publish — it's an internal path, not user-facing.
  // Renaming server-side would break existing CLIs in the wild.
  const res = await put(`/api/skills/${encodeURIComponent(name)}/publish`, {}, baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    if (err.error?.code === 'invalid_state') {
      console.log(pc.dim('  Only "submitted" skills can be approved. Check status: agentops skills mine'))
    } else if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Skill not found. Search: agentops skills search ${name}`))
    }
    process.exit(1)
  }

  console.log(pc.green(`✓ "${name}" approved — now live for the org.`))
  console.log(pc.dim(`  Install: agentops skills install ${name}`))
}
