#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const HOME = os.homedir()
const CREDS_FILE = path.join(HOME, '.agentops', 'credentials.json')
const CONFIG_FILE = path.join(HOME, '.agentops', 'config.json')

// Editor type: set by setup command in ~/.agentops/editor.json, or via env var
const EDITOR = process.env.AGENTOPS_EDITOR || readEditorType()

// ─── Helpers ───────────────────────────────────────────────────────────────

function readEditorType() {
  try {
    const editorFile = path.join(HOME, '.agentops', 'editor.json')
    return JSON.parse(fs.readFileSync(editorFile, 'utf-8')).editor || 'cursor'
  } catch {
    return 'cursor'
  }
}

function getApiUrl() {
  if (process.env.AGENTOPS_API_URL) return process.env.AGENTOPS_API_URL
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
    return config.url || 'https://agentops.bonnard.ai'
  } catch {
    return 'https://agentops.bonnard.ai'
  }
}

function getToken() {
  try {
    const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8'))
    return creds.accessToken
  } catch {
    return null
  }
}

function log(msg) {
  process.stderr.write(`AgentOps: ${msg}\n`)
}

// ─── Fetch sync data ──────────────────────────────────────────────────────

async function fetchSync(apiUrl, token) {
  const res = await fetch(`${apiUrl}/api/sync`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`sync failed: ${res.status}`)
  }
  return res.json()
}

// ─── Write skills ─────────────────────────────────────────────────────────

function getCommandsDir() {
  switch (EDITOR) {
    case 'claude':
      return process.env.CLAUDE_PLUGIN_ROOT
        ? path.join(process.env.CLAUDE_PLUGIN_ROOT, 'commands')
        : path.join(HOME, '.claude', 'commands')
    case 'cursor':
      return path.join(HOME, '.cursor', 'commands')
    case 'codex':
      return path.join(HOME, '.agents', 'skills')
    default:
      return path.join(HOME, '.cursor', 'commands')
  }
}

function writeSkills(data) {
  const dir = getCommandsDir()
  fs.mkdirSync(dir, { recursive: true })

  // Clean up existing agentops-* files only
  try {
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith('agentops-')) {
        fs.rmSync(path.join(dir, file), { recursive: true, force: true })
      }
    }
  } catch { /* dir may not exist */ }

  for (const skill of data.skills || []) {
    const name = skill.name.startsWith('agentops-') ? skill.name : `agentops-${skill.name}`

    if (EDITOR === 'codex') {
      // Codex: SKILL.md in subdirectory
      const skillDir = path.join(dir, name)
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.content}`,
      )
    } else {
      // Claude Code + Cursor: command .md with description frontmatter
      fs.writeFileSync(
        path.join(dir, `${name}.md`),
        `---\ndescription: ${skill.description}\n---\n\n${skill.content}`,
      )
    }
  }

  log(`synced ${(data.skills || []).length} skills for ${data.user?.email} (${(data.roles || []).join(', ')})`)
}

// ─── Write context ────────────────────────────────────────────────────────

function checkTools(tools) {
  if (!tools || tools.length === 0) return null

  const results = tools.map((tool) => {
    let installed = false
    let currentVersion = ''
    try {
      const parts = tool.check.split(/\s+/)
      const output = execFileSync(parts[0], parts.slice(1), {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      installed = true
      const match = output.match(/(\d+\.\d+(\.\d+)?)/)
      currentVersion = match ? match[1] : 'unknown'
    } catch {
      // not installed
    }
    return { ...tool, installed, currentVersion }
  })

  const missing = results.filter((t) => !t.installed)
  let section = '\n## Environment Status (checked at session start)\n\n'
  section += missing.length === 0
    ? '**All required tools are installed.**\n\n'
    : `**${missing.length} tool(s) missing.**\n\n`
  section += '| Tool | Status | Version | Required |\n|---|---|---|---|\n'
  for (const t of results) {
    const status = t.installed ? 'Installed' : 'Missing'
    const ver = t.installed ? t.currentVersion : `Install: \`${t.install}\``
    section += `| ${t.name} | ${status} | ${ver} | ${t.version || 'any'} |\n`
  }
  if (missing.length > 0) {
    section += '\n### How to install missing tools\n\n'
    for (const t of missing) {
      section += `- **${t.name}**: \`${t.install}\`${t.notes ? ` — ${t.notes}` : ''}\n`
    }
  }
  log(`checked ${results.length} tools — ${missing.length} missing`)
  return section
}

function writeContext(data) {
  const context = data.context || {}
  const toolStatus = checkTools(context.tools)

  if (EDITOR === 'cursor' && context.rules_mdc) {
    let content = context.rules_mdc
    if (toolStatus) {
      content = content.replace(/> This rule is managed by AgentOps/, toolStatus + '\n> This rule is managed by AgentOps')
    }
    const rulesDir = path.join(HOME, '.cursor', 'rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    fs.writeFileSync(path.join(rulesDir, 'agentops-context.mdc'), content)
    log('wrote Cursor rules to ~/.cursor/rules/agentops-context.mdc')
  }

  if (EDITOR === 'claude' && context.claude_md) {
    let content = context.claude_md
    if (toolStatus) {
      content = content.replace(/> This file is managed by AgentOps/, toolStatus + '\n> This file is managed by AgentOps')
    }
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd()
    fs.writeFileSync(path.join(cwd, 'CLAUDE.md'), content)
    log(`wrote CLAUDE.md to ${cwd}`)
  }

  if (EDITOR === 'codex' && context.claude_md) {
    let content = context.claude_md
    if (toolStatus) {
      content = content.replace(/> This file is managed by AgentOps/, toolStatus + '\n> This file is managed by AgentOps')
    }
    const cwd = process.cwd()
    fs.writeFileSync(path.join(cwd, 'AGENTS.md'), content)
    log(`wrote AGENTS.md to ${cwd}`)
  }
}

// ─── Hook output ──────────────────────────────────────────────────────────

function buildHookOutput(data) {
  const hso = { hookEventName: 'SessionStart' }

  if (data.onboarding) {
    if (data.onboarding.initialUserMessage) hso.initialUserMessage = data.onboarding.initialUserMessage
    if (data.onboarding.additionalContext) hso.additionalContext = data.onboarding.additionalContext
  }

  if (!data.onboarding && data.announcement) {
    hso.additionalContext = `[AgentOps Announcement] ${data.announcement}`
  }

  // Always add skill summary
  const skillNames = (data.skills || []).map((s) => s.name).join(', ')
  const roles = (data.roles || []).join(', ')
  const summary = `[AgentOps] ${data.user?.email} (${roles}). ${(data.skills || []).length} skills synced: ${skillNames}.`
  hso.additionalContext = hso.additionalContext ? `${hso.additionalContext}\n\n${summary}` : summary

  return { hookSpecificOutput: hso }
}

// ─── Main ─────────────────────────────────────────────────────────────────

const token = getToken()
if (!token) {
  log('not logged in. Run: npx @bonnard/agentops login')
  process.exit(0)
}

try {
  const apiUrl = getApiUrl()
  const data = await fetchSync(apiUrl, token)

  writeSkills(data)
  writeContext(data)

  const output = buildHookOutput(data)
  process.stdout.write(JSON.stringify(output))
} catch (err) {
  log(`sync failed: ${err.message}`)
  process.exit(0) // exit 0 so hook doesn't block the session
}
