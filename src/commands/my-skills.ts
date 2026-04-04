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

export async function mySkillsCommand(opts: { url?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl(opts.url)
  const res = await get('/api/user/skills', baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    process.exit(1)
  }

  const data = await res.json() as {
    installed: Array<{ name: string; description: string; status: string }>
    authored: Array<{ name: string; description: string; status: string; rejectionComment: string | null }>
  }

  if (data.authored.length > 0) {
    console.log(pc.bold('Authored skills:\n'))
    for (const s of data.authored) {
      const colorFn = STATUS_COLORS[s.status] ?? pc.dim
      console.log(`  ${pc.bold(s.name)} ${colorFn(s.status)}`)
      if (s.status === 'rejected' && s.rejectionComment) {
        console.log(`    ${pc.red('Feedback:')} ${s.rejectionComment}`)
        console.log(`    ${pc.dim(`Edit and resubmit: agentops update ${s.name} && agentops submit ${s.name}`)}`)
      }
      if (s.status === 'draft') {
        console.log(`    ${pc.dim(`Submit: agentops submit ${s.name} --tags <tags>`)}`)
      }
    }
    console.log()
  }

  if (data.installed.length > 0) {
    console.log(pc.bold('Installed skills:\n'))
    for (const s of data.installed) {
      console.log(`  ${pc.bold(s.name)} — ${pc.dim(s.description)}`)
    }
    console.log()
  }

  if (data.authored.length === 0 && data.installed.length === 0) {
    console.log(pc.dim('No authored or installed skills.'))
    console.log(pc.dim('  Browse the library: agentops search'))
    console.log(pc.dim('  Create a skill: agentops create <name>'))
  }
}
