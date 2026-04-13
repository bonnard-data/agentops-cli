import pc from 'picocolors'
import { get, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'

interface MeResponse {
  user: { id: number; email: string; role: string }
  org: { id: number; slug: string; name: string; plan: string }
  entitlements: {
    limits: {
      maxSeats: number | null
      maxSkills: number | null
      storageQuotaBytes: number | null
      maxBundleSizeBytes: number
    }
  }
  usage: { skills: number; storageBytes: number; seats: number }
  isPlatformAdmin: boolean
}

export async function whoamiCommand() {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const baseUrl = getBaseUrl()
  const res = await get('/api/me', baseUrl)

  // If server call fails, fall back to cached credentials
  if (!res.ok) {
    console.log(`${pc.bold(creds.user.email)} (${creds.org.name})`)
    console.log(`Role: ${creds.user.role}`)
    console.log(pc.dim('  (offline — run a command to refresh plan info)'))
    return
  }

  const me = await res.json() as MeResponse

  console.log(`${pc.bold(me.user.email)} (${me.org.name})`)
  console.log(`Role: ${me.user.role}`)
  console.log(`Plan: ${pc.bold(me.org.plan)}${me.isPlatformAdmin ? pc.dim(' (platform admin)') : ''}`)
  console.log()

  // Usage
  const { limits } = me.entitlements
  const skillsLimit = limits.maxSkills ?? '∞'
  const seatsLimit = limits.maxSeats ?? '∞'
  const storageLimit = limits.storageQuotaBytes ? formatBytes(limits.storageQuotaBytes) : '∞'
  const storageUsed = formatBytes(me.usage.storageBytes)
  const bundleLimit = `${limits.maxBundleSizeBytes / 1024 / 1024} MB`

  console.log(pc.dim('Usage:'))
  console.log(`  Skills:       ${me.usage.skills} / ${skillsLimit}`)
  console.log(`  Seats:        ${me.usage.seats} / ${seatsLimit}`)
  console.log(`  Storage:      ${storageUsed} / ${storageLimit}`)
  console.log(`  Max bundle:   ${bundleLimit}`)
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
