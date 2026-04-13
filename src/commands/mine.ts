import pc from 'picocolors'
import { get, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

const STATUS_COLORS: Record<string, (s: string) => string> = {
  draft: pc.dim,
  submitted: pc.yellow,
  published: pc.green,
  rejected: pc.red,
  archived: pc.dim,
}

export async function mineCommand() {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl()
  const res = await get('/api/user/skills', baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    process.exit(1)
  }

  const data = await res.json() as {
    authored: Array<{ name: string; description: string; status: string; rejectionComment: string | null }>
  }

  if (data.authored.length === 0) {
    console.log(pc.dim('You haven\'t authored any skills yet.'))
    console.log(pc.dim('  Create one: agentops skills create <name>'))
    return
  }

  console.log(pc.bold(`Authored skills (${data.authored.length}):\n`))
  for (const s of data.authored) {
    const colorFn = STATUS_COLORS[s.status] ?? pc.dim
    console.log(`  ${pc.bold(s.name)} ${colorFn(s.status)}`)
    if (s.description) {
      console.log(`    ${pc.dim(s.description)}`)
    }
    if (s.status === 'rejected' && s.rejectionComment) {
      console.log(`    ${pc.red('Feedback:')} ${s.rejectionComment}`)
      console.log(`    ${pc.dim(`Edit and resubmit: agentops skills submit ${s.name}`)}`)
    }
    if (s.status === 'draft') {
      console.log(`    ${pc.dim(`Submit: agentops skills submit ${s.name} --tags <tags>`)}`)
    }
  }
}
