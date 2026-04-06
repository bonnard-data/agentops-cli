import pc from 'picocolors'
import { post, put, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { readSkillFromCommandsDir } from '../lib/skills.js'

export async function submitCommand(name: string, opts: { url?: string; tags?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  // Read from commands dir (where create put it)
  let parsed: ReturnType<typeof readSkillFromCommandsDir>
  try {
    parsed = readSkillFromCommandsDir(name)
  } catch (err) {
    console.error(pc.red((err as Error).message))
    process.exit(1)
  }

  const { frontmatter, content } = parsed
  const baseUrl = getBaseUrl(opts.url)

  // Tags from CLI flag override any from frontmatter
  const tags = opts.tags
    ? opts.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : frontmatter.tags

  // Step 1: Create the skill as a draft
  console.log(pc.dim(`Creating skill "${frontmatter.name}"...`))
  const createRes = await post('/api/skills', {
    name: frontmatter.name,
    description: frontmatter.description,
    content,
    tags,
  }, baseUrl)

  if (!createRes.ok) {
    const err = await createRes.json() as { error?: { code?: string; message?: string } }
    if (err.error?.code !== 'conflict') {
      console.error(pc.red(err.error?.message ?? `Error creating skill: ${createRes.status}`))
      process.exit(1)
    }
    console.log(pc.dim('Skill already exists, submitting for review...'))
  } else {
    console.log(pc.dim('Draft created.'))
  }

  // Step 2: Submit for review (or auto-publish if org has autoPublish)
  const submitRes = await put(`/api/skills/${encodeURIComponent(frontmatter.name)}/submit`, {}, baseUrl)

  if (!submitRes.ok) {
    const err = await submitRes.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error submitting: ${submitRes.status}`))
    if (err.error?.code === 'invalid_state') {
      console.log(pc.dim('  Only draft or rejected skills can be submitted. Check status: agentops skills mine'))
    }
    process.exit(1)
  }

  const result = await submitRes.json() as { status: string; autoPublished?: boolean }
  const tagList = tags.length > 0 ? ` with tags [${tags.join(', ')}]` : ''

  if (result.autoPublished) {
    console.log(pc.green(`✓ "${frontmatter.name}" published${tagList} — available to your org now.`))
    console.log(pc.dim(`  Others can install with: agentops skills install ${frontmatter.name}`))
  } else {
    console.log(pc.green(`✓ "${frontmatter.name}" submitted for review${tagList}.`))
    console.log(pc.dim(`  Check status: agentops skills mine`))
  }
}
