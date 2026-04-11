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
  const res = await get('/api/user/skills/list', baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    process.exit(1)
  }

  const data = await res.json() as {
    roles: string[]
    skills: Array<{ name: string; description: string; source: string }>
  }

  if (data.skills.length === 0) {
    console.log(pc.dim('No skills synced yet.'))
    console.log(pc.dim('  Browse: agentops skills search'))
    console.log(pc.dim('  Create: agentops skills create <name>'))
    return
  }

  console.log(pc.bold(`Your skills (${data.skills.length}):\n`))

  const roleSkills = data.skills.filter((s) => s.source === 'role')
  const personalSkills = data.skills.filter((s) => s.source === 'personal')

  if (roleSkills.length > 0) {
    console.log(pc.dim(`  Role-assigned (${data.roles.join(', ')}):`))
    for (const s of roleSkills) {
      console.log(`    ${pc.bold(s.name)} — ${s.description}`)
    }
    console.log()
  }

  if (personalSkills.length > 0) {
    console.log(pc.dim('  Personally installed:'))
    for (const s of personalSkills) {
      console.log(`    ${pc.bold(s.name)} — ${s.description}`)
    }
    console.log()
  }
}
