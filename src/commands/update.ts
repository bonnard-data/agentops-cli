import pc from 'picocolors'
import { put, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { readSkillFromCommandsDir } from '../lib/skills.js'

export async function updateCommand(name: string, opts: { url?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  let parsed: ReturnType<typeof readSkillFromCommandsDir>
  try {
    parsed = readSkillFromCommandsDir(name)
  } catch (err) {
    console.error(pc.red((err as Error).message))
    process.exit(1)
  }

  const { frontmatter, content } = parsed
  const baseUrl = getBaseUrl(opts.url)

  const res = await put(`/api/skills/${encodeURIComponent(frontmatter.name)}`, {
    description: frontmatter.description,
    content,
    tags: frontmatter.tags,
  }, baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    if (err.error?.code === 'invalid_state') {
      console.log(pc.dim('  Only draft or rejected skills can be updated. Published skills are immutable.'))
    } else if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Skill doesn't exist on the server yet. Submit it first: agentops submit ${name}`))
    }
    process.exit(1)
  }

  console.log(pc.green(`✓ Updated "${frontmatter.name}" on the server.`))
  console.log(pc.dim(`  Resubmit for review: agentops submit ${frontmatter.name}`))
}
