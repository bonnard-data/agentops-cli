import pc from 'picocolors'
import { get, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

interface VersionRow {
  version: number
  description: string
  bundleSizeBytes: number
  authorName: string | null
  publishedAt: string
}

interface HistoryResponse {
  name: string
  latestVersion: number
  versions: VersionRow[]
}

export async function historyCommand(name: string) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl()
  const res = await get(`/api/skills/${encodeURIComponent(name)}/versions`, baseUrl)

  if (!res.ok) {
    const err = await res.json() as { error?: { code?: string; message?: string } }
    if (err.error?.code === 'feature_gated') {
      console.error(pc.red(err.error?.message ?? 'Feature requires a paid plan'))
      console.log(pc.dim('  agentops whoami — check your current plan'))
      process.exit(1)
    }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    process.exit(1)
  }

  const data = await res.json() as HistoryResponse

  if (data.versions.length === 0) {
    console.log(pc.dim(`"${name}" has no published versions yet.`))
    return
  }

  console.log(pc.bold(`${data.name} — version history`))
  console.log()

  for (const v of data.versions) {
    const isLatest = v.version === data.latestVersion
    const marker = isLatest ? pc.green(' (latest)') : ''
    const date = new Date(v.publishedAt).toLocaleString()
    const author = v.authorName ?? 'unknown'
    const size = `${(v.bundleSizeBytes / 1024).toFixed(1)} KB`
    console.log(`  ${pc.bold(`v${v.version}`)}${marker} — ${author} — ${date} — ${pc.dim(size)}`)
  }
  console.log()
  console.log(pc.dim(`Install latest:  agentops skills install ${data.name}`))
  if (data.latestVersion > 1) {
    console.log(pc.dim(`Install specific: agentops skills install ${data.name}@v${data.latestVersion - 1}`))
  }
}
