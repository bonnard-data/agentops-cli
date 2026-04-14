import pc from 'picocolors'
import { get, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

interface PendingItem {
  name: string
  description: string
  tags: string[]
  author: string | null
  latestVersion: number
  updatedAt: string
}

interface PendingResponse {
  items: PendingItem[]
  total: number
  page: number
  limit: number
}

/**
 * `agentops skills pending` — admin-only list of skills awaiting review.
 *
 * Backed by GET /api/review. Separate from the library browse at
 * /api/skills (which hides other people's non-published skills from
 * everyone) so the admin inbox doesn't pollute the library listing.
 */
export async function pendingCommand() {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl()
  const res = await get('/api/review', baseUrl)

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
    if (err.error?.code === 'forbidden') {
      console.error(pc.red('Only admins can view the review queue.'))
    } else {
      console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    }
    process.exit(1)
  }

  const data = await res.json() as PendingResponse

  if (data.items.length === 0) {
    console.log(pc.dim('No skills pending review. 🎉'))
    return
  }

  console.log(`${pc.bold(`${data.total} skill(s) awaiting review:`)}`)
  console.log()

  for (const s of data.items) {
    console.log(`  ${pc.bold(s.name)} ${pc.dim(`(by ${s.author ?? 'unknown'})`)}`)
    if (s.description) {
      console.log(`    ${pc.dim(s.description.length > 120 ? s.description.slice(0, 117) + '…' : s.description)}`)
    }
    if (s.tags.length > 0) {
      console.log(`    ${pc.dim(`[${s.tags.join(', ')}]`)}`)
    }
    console.log(`    ${pc.dim(`Approve: agentops skills approve ${s.name}`)}`)
    console.log(`    ${pc.dim(`Reject:  agentops skills reject ${s.name} --comment "<reason>"`)}`)
    console.log()
  }
}
