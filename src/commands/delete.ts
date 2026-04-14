import pc from 'picocolors'
import { del, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

export async function deleteCommand(name: string, opts: { force?: boolean }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  // Delete eligibility is enforced server-side:
  //   - Admins can delete any skill
  //   - Authors can delete their own non-published skills
  // The server returns a clear 403 message on violation.

  if (!opts.force) {
    console.log(pc.yellow(`About to permanently delete "${name}" and all its versions.`))
    console.log(pc.yellow('This cannot be undone.'))
    console.log(pc.dim('  Re-run with --force to confirm.'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl()
  const res = await del(`/api/skills/${encodeURIComponent(name)}`, baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Check spelling: agentops skills search ${name}`))
    }
    process.exit(1)
  }

  const result = await res.json() as { deleted: boolean; name: string; versionsRemoved: number }
  console.log(pc.green(`✓ Deleted "${result.name}" (${result.versionsRemoved} version(s) removed)`))
}
