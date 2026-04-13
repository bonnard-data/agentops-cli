import pc from 'picocolors'
import { get, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

export async function searchCommand(query: string | undefined, opts: {
  tags?: string | true
  authors?: true
  author?: string
  status?: string
}) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl()

  // ── List tags mode ─────────────────────────────────────────────────────

  if (opts.tags === true) {
    const res = await get('/api/skills?list=tags', baseUrl)
    if (!res.ok) {
      console.error(pc.red(`Error: ${res.status}`))
      process.exit(1)
    }
    const data = await res.json() as { tags: string[] }
    if (data.tags.length === 0) {
      console.log(pc.dim('No tags found.'))
      return
    }
    console.log(pc.bold('Available tags:\n'))
    for (const tag of data.tags) {
      console.log(`  ${tag}`)
    }
    return
  }

  // ── List authors mode ──────────────────────────────────────────────────

  if (opts.authors) {
    const res = await get('/api/skills?list=authors', baseUrl)
    if (!res.ok) {
      console.error(pc.red(`Error: ${res.status}`))
      process.exit(1)
    }
    const data = await res.json() as { authors: Array<{ name: string; email: string; count: number }> }
    if (data.authors.length === 0) {
      console.log(pc.dim('No authors found.'))
      return
    }
    console.log(pc.bold('Skill authors:\n'))
    for (const a of data.authors) {
      console.log(`  ${pc.bold(a.name)} ${pc.dim(`(${a.email})`)} — ${a.count} skill(s)`)
    }
    return
  }

  // ── Search/filter mode ─────────────────────────────────────────────────

  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (typeof opts.tags === 'string') params.set('tags', opts.tags)
  if (opts.author) params.set('author', opts.author)
  if (opts.status) params.set('status', opts.status)

  const res = await get(`/api/skills?${params}`, baseUrl)
  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    process.exit(1)
  }

  const data = await res.json() as {
    items: Array<{ name: string; description: string; tags: string[]; author: string | null; status: string }>
    total: number
  }

  if (data.items.length === 0) {
    console.log(pc.dim('No skills found.'))
    if (query) {
      console.log(pc.dim(`  Try: agentops skills search (browse all) or agentops skills search --tags (see categories)`))
    }
    return
  }

  console.log(pc.bold(`${data.total} skill(s) found:\n`))

  for (const skill of data.items) {
    const tags = skill.tags.length > 0 ? pc.dim(` [${skill.tags.join(', ')}]`) : ''
    const author = skill.author ? pc.dim(` by ${skill.author}`) : ''
    console.log(`  ${pc.bold(skill.name)}${tags}${author}`)
    console.log(`  ${pc.dim(skill.description)}`)
    console.log(`  ${pc.dim(`Install: agentops skills install ${skill.name}`)}\n`)
  }
}
