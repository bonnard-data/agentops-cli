import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import pc from 'picocolors'
import { loadCredentials } from '../lib/credentials.js'
import { getBaseUrl } from '../lib/api.js'

const SUPPORTED_EDITORS = ['cursor', 'claude', 'codex'] as const
type Editor = (typeof SUPPORTED_EDITORS)[number]

const AGENTOPS_DIR = path.join(os.homedir(), '.agentops')
const SCRIPTS_DIR = path.join(AGENTOPS_DIR, 'scripts')

export async function setupCommand(options: { editor?: string; url?: string }) {
  // 1. Check credentials
  const creds = loadCredentials()
  if (!creds) {
    console.error(pc.red('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const editor = options.editor?.toLowerCase()
  if (!editor || !SUPPORTED_EDITORS.includes(editor as Editor)) {
    console.error(pc.red(`Please specify an editor: --editor ${SUPPORTED_EDITORS.join(' | ')}`))
    process.exit(1)
  }

  const baseUrl = getBaseUrl(options.url)
  console.log(pc.dim(`Server: ${baseUrl}`))
  console.log(`Logged in as ${pc.bold(creds.user.email)} (${creds.org.name})`)
  console.log(`Setting up for ${pc.bold(editor)}...`)
  console.log()

  // 2. Copy sync script to ~/.agentops/scripts/
  copyScripts()

  // 3. Save editor preference
  fs.writeFileSync(
    path.join(AGENTOPS_DIR, 'editor.json'),
    JSON.stringify({ editor }, null, 2),
    { mode: 0o600 },
  )

  // 4. Editor-specific setup
  switch (editor as Editor) {
    case 'cursor':
      setupCursor()
      break
    case 'claude':
      setupClaude()
      break
    case 'codex':
      setupCodex()
      break
  }

  // 5. Run first sync
  console.log(pc.dim('Running first sync...'))
  try {
    execFileSync('node', [path.join(SCRIPTS_DIR, 'sync.mjs')], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, AGENTOPS_API_URL: baseUrl, AGENTOPS_EDITOR: editor },
    })
    console.log(pc.green('  Sync complete'))
  } catch {
    console.log(pc.yellow('  First sync failed — will retry on next session start'))
  }

  console.log()
  console.log(pc.green('Setup complete.'))
  console.log(pc.dim('Skills will sync automatically on every session start.'))
}

function copyScripts() {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true, mode: 0o700 })

  // Resolve sync.mjs relative to this file (works in dev and published package)
  const candidates = [
    path.resolve(import.meta.dirname, '..', '..', 'scripts', 'sync.mjs'),
    path.resolve(import.meta.dirname, '..', 'scripts', 'sync.mjs'),
  ]

  const source = candidates.find((p) => fs.existsSync(p))
  if (!source) {
    console.error(pc.red('Could not find sync.mjs script'))
    process.exit(1)
  }

  fs.copyFileSync(source, path.join(SCRIPTS_DIR, 'sync.mjs'))
  console.log(pc.green('  Sync scripts installed to ~/.agentops/scripts/'))
}

function setupCursor() {
  const cursorDir = path.join(os.homedir(), '.cursor')
  const hooksPath = path.join(cursorDir, 'hooks.json')

  // Cursor hooks.json uses version 1 schema
  let hooks: Record<string, unknown> = { version: 1, hooks: {} }
  if (fs.existsSync(hooksPath)) {
    try {
      hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'))
    } catch {
      // corrupted — overwrite
    }
  }

  const hooksObj = (hooks.hooks ?? {}) as Record<string, unknown[]>
  const syncCommand = `node "${path.join(SCRIPTS_DIR, 'sync.mjs')}"`

  // Remove existing agentops entries, add new one
  const existing = (hooksObj.sessionStart ?? []) as Array<Record<string, unknown>>
  const filtered = existing.filter((h) => !(h.command as string)?.includes('agentops'))
  filtered.push({ command: syncCommand, timeout: 30 })
  hooksObj.sessionStart = filtered

  hooks.hooks = hooksObj
  if (!hooks.version) hooks.version = 1

  fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2))

  // Ensure directories exist
  fs.mkdirSync(path.join(cursorDir, 'commands'), { recursive: true })
  fs.mkdirSync(path.join(cursorDir, 'rules'), { recursive: true })

  console.log(pc.green('  Cursor hooks.json configured'))
}

function setupClaude() {
  const claudeDir = path.join(os.homedir(), '.claude')
  const settingsPath = path.join(claudeDir, 'settings.json')

  let settings: Record<string, unknown> = {}
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      // corrupted — preserve as backup
      fs.copyFileSync(settingsPath, settingsPath + '.bak')
    }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>
  const syncCommand = `node "${path.join(SCRIPTS_DIR, 'sync.mjs')}"`

  // Remove existing agentops entries, add new one
  const existing = (hooks.SessionStart ?? []) as Array<Record<string, unknown>>
  const filtered = existing.filter((entry) => {
    const entryHooks = (entry.hooks ?? []) as Array<Record<string, unknown>>
    return !entryHooks.some((h) => (h.command as string)?.includes('agentops'))
  })
  filtered.push({
    matcher: '',
    hooks: [{ type: 'command', command: syncCommand, timeout: 30 }],
  })
  hooks.SessionStart = filtered

  settings.hooks = hooks
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))

  // Ensure skills directory exists
  fs.mkdirSync(path.join(claudeDir, 'skills'), { recursive: true })

  console.log(pc.green('  Claude Code SessionStart hook configured'))
  console.log(pc.dim('  Skills will sync to ~/.claude/skills/'))
}

function setupCodex() {
  const codexDir = path.join(os.homedir(), '.codex')
  const hooksPath = path.join(codexDir, 'hooks.json')

  let hooks: Record<string, unknown> = {}
  if (fs.existsSync(hooksPath)) {
    try {
      hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'))
    } catch { /* overwrite */ }
  }

  const hooksObj = (hooks.hooks ?? {}) as Record<string, unknown[]>
  const syncCommand = `node "${path.join(SCRIPTS_DIR, 'sync.mjs')}"`

  const existing = (hooksObj.SessionStart ?? []) as Array<Record<string, unknown>>
  const filtered = existing.filter((h) => !(h.command as string)?.includes('agentops'))
  filtered.push({ command: syncCommand, timeout: 30 })
  hooksObj.SessionStart = filtered

  hooks.hooks = hooksObj
  fs.mkdirSync(codexDir, { recursive: true })
  fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2))

  fs.mkdirSync(path.join(os.homedir(), '.agents', 'skills'), { recursive: true })
  console.log(pc.green('  Codex hooks.json configured'))
}
