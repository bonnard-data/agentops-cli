import pc from 'picocolors'
import { del, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

export async function deleteCommand(name: string, opts: { url?: string; force?: boolean }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  if (creds.user.role !== 'admin') {
    console.error(pc.red('Only admins can delete skills.'))
    console.log(pc.dim(`  Your role: ${creds.user.role}. Ask an admin to delete "${name}".`))
    process.exit(1)
  }

  if (!opts.force) {
    console.log(pc.yellow(`About to permanently delete "${name}" and all its versions.`))
    console.log(pc.yellow('This cannot be undone.'))
    console.log(pc.dim('  Re-run with --force to confirm.'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl(opts.url)
  const res = await del(`/api/skills/${encodeURIComponent(name)}`, baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Check spelling: agentops skills search ${name}`))
    } else if (err.error?.code === 'forbidden') {
      console.log(pc.dim('  Only admins can delete skills.'))
    }
    process.exit(1)
  }

  const result = await res.json() as { deleted: boolean; name: string; versionsRemoved: number }
  console.log(pc.green(`✓ Deleted "${result.name}" (${result.versionsRemoved} version(s) removed)`))
}
