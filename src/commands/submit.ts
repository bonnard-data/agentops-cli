import pc from 'picocolors'
import { uploadSkill, put, get, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { findAndReadSkill } from '../lib/skills.js'
import { packSkill } from '../lib/pack.js'
import { validateSkill } from '../lib/validate.js'
import { printIssues } from './check.js'

interface ServerSkill {
  name: string
  status: 'draft' | 'submitted' | 'published' | 'rejected' | 'archived'
  latestVersion: number
  hasDraft: boolean
}

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

  // Check if skill already exists on server (so we know whether to POST or PUT)
  const existingRes = await get(`/api/skills/${encodeURIComponent(frontmatter.name)}`, baseUrl)
  const existing: ServerSkill | null = existingRes.ok ? await existingRes.json() as ServerSkill : null

  // If submitted and awaiting review, block
  if (existing?.status === 'submitted') {
    console.error(pc.red(`"${frontmatter.name}" is already submitted for review.`))
    console.log(pc.dim('  Wait for an admin to approve or reject, then you can edit again.'))
    console.log(pc.dim('  Check status: agentops skills mine'))
    process.exit(1)
  }

  // Upload the bundle via POST (new) or PUT (update existing)
  const isNew = !existing
  const uploadPath = isNew
    ? '/api/skills'
    : `/api/skills/${encodeURIComponent(frontmatter.name)}`
  const uploadMethod: 'POST' | 'PUT' = isNew ? 'POST' : 'PUT'

  console.log(pc.dim(isNew ? 'Uploading...' : 'Updating draft...'))
  const uploadRes = await uploadSkill(
    uploadPath,
    uploadMethod,
    { name: frontmatter.name, description: frontmatter.description, content, tags },
    tgz,
    baseUrl,
  )

  if (!uploadRes.ok) {
    const err = await uploadRes.json() as { error?: { code?: string; message?: string } }
    if (err.error?.code === 'feature_gated') {
      console.error(pc.red(err.error?.message ?? 'Plan limit exceeded'))
      console.log(pc.dim(`  Reduce your bundle size, or upgrade your plan:`))
      console.log(pc.dim(`    agentops whoami              — check your current plan`))
      console.log(pc.dim(`    https://agentops.bonnard.ai  — manage your subscription`))
      process.exit(1)
    }
    console.error(pc.red(err.error?.message ?? `Error uploading: ${uploadRes.status}`))
    process.exit(1)
  }

  // Submit the draft for review (or auto-publish)
  const submitRes = await put(`/api/skills/${encodeURIComponent(frontmatter.name)}/submit`, {}, baseUrl)

  if (!submitRes.ok) {
    const err = await submitRes.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error submitting: ${submitRes.status}`))
    process.exit(1)
  }

  const result = await submitRes.json() as { status: string; autoPublished?: boolean; version?: number; latestVersion?: number }
  const tagList = tags.length > 0 ? ` [${tags.join(', ')}]` : ''

  // Resolve the new version number (v1 on first publish, v2/v3/... on updates)
  const newVersion = result.version ?? result.latestVersion

  if (result.autoPublished) {
    if (existing && existing.latestVersion > 0) {
      console.log(pc.green(`✓ "${frontmatter.name}" published v${newVersion} (previous: v${existing.latestVersion})${tagList}`))
    } else {
      console.log(pc.green(`✓ "${frontmatter.name}" published v${newVersion}${tagList}`))
    }
    console.log(pc.dim(`  Install: agentops skills install ${frontmatter.name}`))
  } else {
    if (existing && existing.latestVersion > 0) {
      console.log(pc.green(`✓ "${frontmatter.name}" submitted for review${tagList}`))
      console.log(pc.dim(`  Existing v${existing.latestVersion} stays live until the update is approved.`))
    } else {
      console.log(pc.green(`✓ "${frontmatter.name}" submitted for review${tagList}`))
    }
    console.log(pc.dim(`  Check status: agentops skills mine`))
  }
}
