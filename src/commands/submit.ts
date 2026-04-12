import pc from 'picocolors'
import { uploadSkill, put, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { findAndReadSkill } from '../lib/skills.js'
import { packSkill } from '../lib/pack.js'
import { validateSkill } from '../lib/validate.js'
import { printIssues } from './check.js'

export async function submitCommand(name: string, opts: { url?: string; tags?: string }) {
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

  // Run validation
  const check = validateSkill(dir)
  if (check.errors.length > 0) {
    printIssues(check.errors, pc.red, 'ERROR')
    console.error(pc.red(`\n${check.errors.length} error(s) must be fixed before submitting`))
    console.log(pc.dim(`  Re-check: agentops skills check ${name}`))
    process.exit(1)
  }
  if (check.warnings.length > 0) {
    printIssues(check.warnings, pc.yellow, 'WARNING')
    console.log(pc.yellow(`${check.warnings.length} warning(s) — submitting anyway\n`))
  }

  const tags = opts.tags
    ? opts.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : frontmatter.tags

  // Pack the skill folder
  console.log(pc.dim(`Packing "${frontmatter.name}"...`))
  let tgz: Buffer
  try {
    tgz = await packSkill(dir)
  } catch (err) {
    console.error(pc.red(`Failed to pack skill: ${(err as Error).message}`))
    process.exit(1)
  }
  console.log(pc.dim(`Bundle: ${(tgz.length / 1024).toFixed(1)} KB`))

  // Create the skill as a draft with the bundle
  console.log(pc.dim(`Uploading...`))
  const createRes = await uploadSkill(
    '/api/skills',
    'POST',
    { name: frontmatter.name, description: frontmatter.description, content, tags },
    tgz,
    baseUrl,
  )

  if (!createRes.ok) {
    const err = await createRes.json() as { error?: { code?: string; message?: string } }
    if (err.error?.code === 'conflict') {
      console.error(pc.red(`Skill "${frontmatter.name}" already exists on the server.`))
      console.log(pc.dim(`  To update it: agentops skills update ${name}`))
      console.log(pc.dim(`  Then resubmit: agentops skills submit ${name}`))
      process.exit(1)
    }
    if (err.error?.code === 'feature_gated') {
      console.error(pc.red(err.error?.message ?? 'Plan limit exceeded'))
      console.log(pc.dim(`  Reduce your bundle size, or upgrade your plan:`))
      console.log(pc.dim(`    agentops whoami              — check your current plan`))
      console.log(pc.dim(`    https://agentops.bonnard.ai  — manage your subscription`))
      process.exit(1)
    }
    console.error(pc.red(err.error?.message ?? `Error creating skill: ${createRes.status}`))
    process.exit(1)
  }

  console.log(pc.dim('Draft created.'))

  // Submit for review (or auto-publish)
  const submitRes = await put(`/api/skills/${encodeURIComponent(frontmatter.name)}/submit`, {}, baseUrl)

  if (!submitRes.ok) {
    const err = await submitRes.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error submitting: ${submitRes.status}`))
    process.exit(1)
  }

  const result = await submitRes.json() as { status: string; autoPublished?: boolean }
  const tagList = tags.length > 0 ? ` [${tags.join(', ')}]` : ''

  if (result.autoPublished) {
    console.log(pc.green(`✓ "${frontmatter.name}" published${tagList}`))
    console.log(pc.dim(`  Install: agentops skills install ${frontmatter.name}`))
  } else {
    console.log(pc.green(`✓ "${frontmatter.name}" submitted for review${tagList}`))
    console.log(pc.dim(`  Check status: agentops skills mine`))
  }
}
