import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const AGENTOPS_DIR = path.join(os.homedir(), '.agentops')
const CREDENTIALS_PATH = path.join(AGENTOPS_DIR, 'credentials.json')
const CONFIG_PATH = path.join(AGENTOPS_DIR, 'config.json')

export interface Credentials {
  accessToken: string
  refreshToken: string | null
  user: {
    id: number
    email: string
    name: string
    role: string
  }
  org: {
    id: number
    slug: string
    name: string
  }
}

export interface Config {
  url: string
}

function ensureDir() {
  if (!fs.existsSync(AGENTOPS_DIR)) {
    fs.mkdirSync(AGENTOPS_DIR, { recursive: true, mode: 0o700 })
  }
}

export function saveCredentials(creds: Credentials): void {
  ensureDir()
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), { mode: 0o600 })
}

/** Validate that an unknown value has the shape of Credentials */
export function validateCredentials(data: unknown): Credentials | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.accessToken !== 'string' || !d.accessToken) return null

  const user = d.user as Record<string, unknown> | undefined
  if (!user || typeof user.email !== 'string' || typeof user.name !== 'string') return null

  const org = d.org as Record<string, unknown> | undefined
  if (!org || typeof org.name !== 'string' || typeof org.slug !== 'string') return null

  return data as Credentials
}

export function loadCredentials(): Credentials | null {
  try {
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8')
    return validateCredentials(JSON.parse(raw))
  } catch {
    return null
  }
}

export function clearCredentials(): void {
  try {
    fs.unlinkSync(CREDENTIALS_PATH)
  } catch {
    // Already gone
  }
}

export function saveConfig(config: Config): void {
  ensureDir()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function loadConfig(): Config | null {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    return JSON.parse(raw) as Config
  } catch {
    return null
  }
}
