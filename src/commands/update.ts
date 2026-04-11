import pc from 'picocolors'
import { uploadSkill, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { findAndReadSkill } from '../lib/skills.js'
import { packSkill } from '../lib/pack.js'

export async function updateCommand(name: string, opts: { url?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  let skill: ReturnType<typeof findAndReadSkill>
  try {
    skill = findAndReadSkill(name)
  } catch (err) {
    console.error(pc.red((err as Error).message))
    process.exit(1)
  }

  const { dir, frontmatter, content } = skill
  const baseUrl = getBaseUrl(opts.url)

  // Pack the skill folder
  console.log(pc.dim(`Packing skill "${frontmatter.name}"...`))
  let tgz: Buffer
  try {
    tgz = await packSkill(dir)
  } catch (err) {
    console.error(pc.red(`Failed to pack skill: ${(err as Error).message}`))
    process.exit(1)
  }
  console.log(pc.dim(`Bundle: ${(tgz.length / 1024).toFixed(1)} KB`))

  // Upload updated bundle
  console.log(pc.dim(`Uploading...`))
  const res = await uploadSkill(
    `/api/skills/${encodeURIComponent(frontmatter.name)}`,
    'PUT',
    { description: frontmatter.description, content, tags: frontmatter.tags },
    tgz,
    baseUrl,
  )

  if (!res.ok) {
    const err = await res.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    if (err.error?.code === 'invalid_state') {
      console.log(pc.dim('  Only draft or rejected skills can be updated. Published skills are immutable.'))
    } else if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Skill doesn't exist on the server yet. Submit it first: agentops skills submit ${name}`))
    }
    process.exit(1)
  }

  console.log(pc.green(`✓ Updated "${frontmatter.name}" on the server.`))
  console.log(pc.dim(`  Resubmit for review: agentops skills submit ${frontmatter.name}`))
}
