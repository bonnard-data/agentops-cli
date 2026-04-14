import pc from 'picocolors'
import { get, put, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

interface OrgSettings {
  autoPublish?: boolean
  allowPublicDomains?: boolean
}

interface MeResponse {
  user: { id: number; email: string; role: string }
  org: { id: number; slug: string; name: string; plan: string; settings: OrgSettings }
}

function requireLogin() {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }
  return creds
}

// ─── agentops org settings get ─────────────────────────────────────────

export async function orgSettingsGetCommand() {
  requireLogin()
  const baseUrl = getBaseUrl()

  const res = await get('/api/me', baseUrl)
  if (!res.ok) {
    console.error(pc.red(`Error: ${res.status}`))
    process.exit(1)
  }

  const me = await res.json() as MeResponse
  const settings = me.org.settings ?? {}

  console.log(`${pc.bold(me.org.name)}`)
  console.log(pc.dim(`  slug: ${me.org.slug}  ·  plan: ${me.org.plan}`))
  console.log()
  console.log('Settings:')
  console.log(`  auto-publish:         ${formatBool(settings.autoPublish)}`)
  console.log(`  allow-public-domains: ${formatBool(settings.allowPublicDomains)}`)
  console.log()
  console.log(pc.dim(`  Change: agentops org settings set <key> <true|false>  (admin only)`))
}

// ─── agentops org settings set <key> <value> ───────────────────────────

const SETTING_KEYS = new Set(['auto-publish', 'allow-public-domains'])

export async function orgSettingsSetCommand(key: string, value: string) {
  requireLogin()

  if (!SETTING_KEYS.has(key)) {
    console.error(pc.red(`Unknown setting key "${key}"`))
    console.log(pc.dim(`  Valid keys: ${[...SETTING_KEYS].join(', ')}`))
    process.exit(1)
  }

  const parsedValue = parseBool(value)
  if (parsedValue === null) {
    console.error(pc.red(`Invalid value "${value}" — expected true or false`))
    process.exit(1)
  }

  const bodyKey = key === 'auto-publish' ? 'autoPublish' : 'allowPublicDomains'
  const body = { [bodyKey]: parsedValue }

  const baseUrl = getBaseUrl()
  const res = await put('/api/org/settings', body, baseUrl)

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
    if (err.error?.code === 'forbidden') {
      console.error(pc.red('Only admins can change org settings.'))
    } else {
      console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    }
    process.exit(1)
  }

  const result = await res.json() as { settings: OrgSettings }
  console.log(pc.green(`✓ ${key} = ${parsedValue}`))
  console.log()
  console.log('Current settings:')
  console.log(`  auto-publish:         ${formatBool(result.settings.autoPublish)}`)
  console.log(`  allow-public-domains: ${formatBool(result.settings.allowPublicDomains)}`)

  if (key === 'auto-publish') {
    console.log()
    console.log(pc.dim(parsedValue
      ? '  Submissions now publish immediately with no admin review.'
      : '  Submissions now enter the admin review queue — approve with `agentops skills approve`.'))
  }
}

// ─── helpers ──────────────────────────────────────────────────────────

function formatBool(v: boolean | undefined): string {
  if (v === undefined) return pc.dim('(unset)')
  return v ? pc.green('true') : pc.red('false')
}

function parseBool(v: string): boolean | null {
  const lower = v.toLowerCase()
  if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on') return true
  if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'off') return false
  return null
}
