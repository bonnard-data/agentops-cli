import pc from 'picocolors'
import { put, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

export async function rejectCommand(name: string, opts: { url?: string; comment?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  if (creds.user.role !== 'admin') {
    console.error(pc.red('Only admins can reject skills.'))
    console.log(pc.dim(`  Ask an admin to run: agentops skills reject ${name} --comment "..."`))
    process.exit(1)
  }

  if (!opts.comment) {
    console.error(pc.red('A comment is required: --comment "reason for rejection"'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl(opts.url)
  const res = await put(`/api/skills/${encodeURIComponent(name)}/reject`, { comment: opts.comment }, baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    if (err.error?.code === 'invalid_state') {
      console.log(pc.dim('  Only "submitted" skills can be rejected. Check status: agentops skills search --status submitted'))
    } else if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Skill not found. Search: agentops skills search ${name}`))
    }
    process.exit(1)
  }

  console.log(pc.green(`✓ "${name}" rejected. Author will see your feedback.`))
}
