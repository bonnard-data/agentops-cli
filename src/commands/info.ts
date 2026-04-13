import pc from 'picocolors'
import { get, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { findSkillDir } from '../lib/skills.js'

const STATUS_COLORS: Record<string, (s: string) => string> = {
  draft: pc.dim,
  submitted: pc.yellow,
  published: pc.green,
  rejected: pc.red,
  archived: pc.dim,
}

interface SkillInfo {
  name: string
  description: string
  content: string
  tags: string[]
  status: string
  latestVersion: number
  hasDraft: boolean
  rejectionComment: string | null
  author: string | null
  createdAt: string
  updatedAt: string
}

export async function infoCommand(name: string, opts: { url?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl(opts.url)
  const res = await get(`/api/skills/${encodeURIComponent(name)}`, baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Search the library: agentops skills search ${name}`))
    }
    process.exit(1)
  }

  const skill = await res.json() as SkillInfo
  const colorStatus = STATUS_COLORS[skill.status] ?? pc.dim

  // Header: name + version + status
  const versionLabel = skill.latestVersion > 0 ? pc.dim(` v${skill.latestVersion}`) : ''
  console.log(`${pc.bold(skill.name)}${versionLabel}  ${colorStatus(skill.status)}`)

  // Author + tags
  if (skill.author) {
    console.log(pc.dim(`by ${skill.author}`))
  }
  if (skill.tags.length > 0) {
    console.log(pc.dim(`[${skill.tags.join(', ')}]`))
  }
  console.log()

  // Description
  if (skill.description) {
    console.log(skill.description)
    console.log()
  }

  // Rejection feedback (only shown to the author)
  if (skill.status === 'rejected' && skill.rejectionComment) {
    console.log(`${pc.red('Rejection feedback:')} ${skill.rejectionComment}`)
    console.log()
  }

  // Draft state hint
  if (skill.hasDraft) {
    console.log(pc.dim('Has an unpublished draft'))
    console.log()
  }

  // Local install state
  const localDir = findSkillDir(skill.name)
  if (localDir) {
    console.log(`${pc.green('Installed')} ${pc.dim(localDir)}`)
  } else if (skill.status === 'published') {
    console.log(pc.dim(`Not installed — run: agentops skills install ${skill.name}`))
  }
  console.log()

  // README (content of current version)
  if (skill.content) {
    console.log(pc.dim('─── README ───'))
    console.log()
    console.log(skill.content)
    console.log()
    console.log(pc.dim('──────────────'))
  }

  // Version history hint (only if there's more than one version)
  if (skill.latestVersion > 1) {
    console.log()
    console.log(pc.dim(`History: agentops skills history ${skill.name}`))
  }
}
