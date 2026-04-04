import pc from 'picocolors'
import { get, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

export async function listCommand(opts: { url?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl(opts.url)
  const res = await get('/api/sync', baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    process.exit(1)
  }

  const data = await res.json() as {
    roles: string[]
    skills: Array<{ name: string; description: string; source: string; version: number }>
  }

  if (data.skills.length === 0) {
    console.log(pc.dim('No skills synced yet.'))
    return
  }

  console.log(pc.bold(`Your synced skills (${data.skills.length}):\n`))

  const orgSkills = data.skills.filter((s) => s.source === 'org')
  const userSkills = data.skills.filter((s) => s.source === 'user')

  if (orgSkills.length > 0) {
    console.log(pc.dim(`  Role-assigned (${data.roles.join(', ')}):`))
    for (const s of orgSkills) {
      console.log(`    ${pc.bold(s.name)} ${pc.dim(`v${s.version}`)} — ${s.description}`)
    }
    console.log()
  }

  if (userSkills.length > 0) {
    console.log(pc.dim('  Personally installed:'))
    for (const s of userSkills) {
      console.log(`    ${pc.bold(s.name)} ${pc.dim(`v${s.version}`)} — ${s.description}`)
    }
    console.log()
  }
}
