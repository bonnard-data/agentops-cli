import pc from 'picocolors'
import { get, downloadBundleWithMeta, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { findSkillDir, parseSkillMd, parseSkillSpec } from '../lib/skills.js'
import { readSkillMdFromBundle } from '../lib/pack.js'

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
  fileCount: number | null
  author: string | null
  createdAt: string
  updatedAt: string
}

interface VersionRow {
  version: number
  description: string
  bundleSizeBytes: number
  authorName: string | null
  publishedAt: string
}

export async function infoCommand(spec: string) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  let parsed
  try {
    parsed = parseSkillSpec(spec)
  } catch (err) {
    console.error(pc.red((err as Error).message))
    process.exit(1)
  }

  const baseUrl = getBaseUrl()

  if (typeof parsed.version === 'number') {
    await renderPinnedVersion(parsed.name, parsed.version, baseUrl)
  } else {
    await renderLatest(parsed.name, baseUrl)
  }
}

async function renderLatest(name: string, baseUrl: string) {
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
  const isPublishedClean = skill.status === 'published'
  const hasPriorPublished = skill.latestVersion > 0

  // Header: only show version label when status and version are in sync
  if (isPublishedClean) {
    console.log(`${pc.bold(skill.name)} ${pc.dim(`v${skill.latestVersion}`)}  ${colorStatus(skill.status)}`)
  } else {
    console.log(`${pc.bold(skill.name)}  ${colorStatus(skill.status)}`)
    if (hasPriorPublished) {
      console.log(pc.dim(`Latest published: v${skill.latestVersion} (install with: agentops skills install ${skill.name}@v${skill.latestVersion})`))
    }
  }

  if (skill.author) {
    console.log(pc.dim(`by ${skill.author}`))
  }
  if (skill.tags.length > 0) {
    console.log(pc.dim(`[${skill.tags.join(', ')}]`))
  }
  if (typeof skill.fileCount === 'number') {
    console.log(pc.dim(`${skill.fileCount} ${skill.fileCount === 1 ? 'file' : 'files'}`))
  }
  console.log()

  // Label draft content explicitly so users don't assume it's the published v{N}
  const draftLabel = isPublishedClean ? '' : pc.yellow(' (draft — pending review)')

  if (skill.description) {
    if (draftLabel) console.log(pc.dim(`Description${draftLabel}:`))
    console.log(skill.description)
    console.log()
  }

  if (skill.status === 'rejected' && skill.rejectionComment) {
    console.log(`${pc.red('Rejection feedback:')} ${skill.rejectionComment}`)
    console.log()
  }

  if (skill.hasDraft && skill.status === 'published') {
    console.log(pc.dim('Has an unpublished draft'))
    console.log()
  }

  const localDir = findSkillDir(skill.name)
  if (localDir) {
    console.log(`${pc.green('Installed')} ${pc.dim(localDir)}`)
  } else if (skill.status === 'published') {
    console.log(pc.dim(`Not installed — run: agentops skills install ${skill.name}`))
  }
  console.log()

  if (skill.content) {
    console.log(pc.dim(`─── README${draftLabel} ───`))
    console.log()
    console.log(skill.content)
    console.log()
    console.log(pc.dim('──────────────'))
  }

  if (skill.latestVersion > 1) {
    console.log()
    console.log(pc.dim(`History: agentops skills history ${skill.name}`))
  }
}

async function renderPinnedVersion(name: string, version: number, baseUrl: string) {
  // 1. Fetch the versions list to verify the version exists and get metadata
  const versionsRes = await get(`/api/skills/${encodeURIComponent(name)}/versions`, baseUrl)

  if (!versionsRes.ok) {
    const err = await versionsRes.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${versionsRes.status}`))
    if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Search the library: agentops skills search ${name}`))
    } else if (err.error?.code === 'feature_gated') {
      console.log(pc.dim('  agentops whoami — check your current plan'))
    }
    process.exit(1)
  }

  const data = await versionsRes.json() as { name: string; latestVersion: number; versions: VersionRow[] }
  const versionRow = data.versions.find((v) => v.version === version)

  if (!versionRow) {
    console.error(pc.red(`Version v${version} of "${name}" not found.`))
    console.log(pc.dim(`  Available versions: ${data.versions.map((v) => `v${v.version}`).join(', ')}`))
    console.log(pc.dim(`  See all: agentops skills history ${name}`))
    process.exit(1)
  }

  // 2. Download the bundle for this version and read its SKILL.md
  let raw: string
  try {
    const { buffer } = await downloadBundleWithMeta(
      `/api/skills/${encodeURIComponent(name)}/versions/${version}/bundle`,
      baseUrl,
    )
    raw = await readSkillMdFromBundle(buffer)
  } catch (err) {
    console.error(pc.red(`Failed to read v${version} bundle: ${(err as Error).message}`))
    process.exit(1)
  }

  const { frontmatter, content } = parseSkillMd(raw, name)
  const isLatest = version === data.latestVersion
  const publishedDate = new Date(versionRow.publishedAt).toLocaleDateString()
  const sizeKb = (versionRow.bundleSizeBytes / 1024).toFixed(1)
  const latestTag = isLatest ? pc.dim(' (latest)') : ''

  console.log(`${pc.bold(name)} ${pc.dim(`v${version}`)}${latestTag}  ${pc.green('published')}`)
  if (versionRow.authorName) {
    console.log(pc.dim(`by ${versionRow.authorName} · ${publishedDate} · ${sizeKb} KB`))
  } else {
    console.log(pc.dim(`${publishedDate} · ${sizeKb} KB`))
  }
  if (frontmatter.tags && frontmatter.tags.length > 0) {
    console.log(pc.dim(`[${frontmatter.tags.join(', ')}]`))
  }
  console.log()

  if (frontmatter.description) {
    console.log(frontmatter.description)
    console.log()
  }

  console.log(pc.dim(`─── README (v${version}) ───`))
  console.log()
  console.log(content)
  console.log()
  console.log(pc.dim('──────────────'))

  if (data.versions.length > 1) {
    console.log()
    console.log(pc.dim(`All versions: agentops skills history ${name}`))
  }
}
