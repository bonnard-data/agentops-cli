import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'

const editorType = process.env.EDITOR_TYPE || 'claude'

// Read JSON from stdin
let input = ''
for await (const chunk of process.stdin) {
  input += chunk
}

const data = JSON.parse(input)
const context = data.context || {}
const cwd = process.cwd()

// ─── Tool checking (shared across editors) ─────────────────────────────────

function checkTools(tools) {
  if (!tools || tools.length === 0) return null

  const results = tools.map((tool) => {
    let installed = false
    let version = ''
    try {
      const parts = tool.check.split(/\s+/)
      const output = execFileSync(parts[0], parts.slice(1), {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      installed = true
      const match = output.match(/(\d+\.\d+(\.\d+)?)/)
      version = match ? match[1] : 'unknown'
    } catch {
      installed = false
    }
    return { ...tool, installed, currentVersion: version }
  })

  const missing = results.filter((t) => !t.installed)

  let envStatus = '\n## Environment Status (checked at session start)\n\n'
  if (missing.length === 0) {
    envStatus += '**All required tools are installed.**\n\n'
  } else {
    envStatus += `**${missing.length} tool(s) missing.** Help the user install them if they ask, or proactively mention if relevant to the task.\n\n`
  }

  envStatus += '| Tool | Status | Version | Required |\n'
  envStatus += '|---|---|---|---|\n'
  for (const t of results) {
    const status = t.installed ? '✅ Installed' : '❌ Missing'
    const ver = t.installed ? t.currentVersion : `Install: \`${t.install}\``
    envStatus += `| ${t.name} | ${status} | ${ver} | ${t.version || 'any'} |\n`
  }

  if (missing.length > 0) {
    envStatus += '\n### How to install missing tools\n\n'
    for (const t of missing) {
      envStatus += `- **${t.name}**: \`${t.install}\`${t.notes ? ` — ${t.notes}` : ''}\n`
    }
  }

  console.error(`AgentOps: checked ${results.length} tools — ${missing.length} missing`)
  return envStatus
}

// ─── Claude Code: write CLAUDE.md + memory files ───────────────────────────

if (editorType === 'claude') {
  if (context.claude_md) {
    let claudeMd = context.claude_md
    const toolStatus = checkTools(context.tools)

    if (toolStatus) {
      // Inject before the footer
      claudeMd = claudeMd.replace(
        /> This file is managed by AgentOps/,
        toolStatus + '\n> This file is managed by AgentOps',
      )
    }

    const claudeMdPath = join(cwd, 'CLAUDE.md')
    writeFileSync(claudeMdPath, claudeMd, 'utf-8')
    console.error(`AgentOps: wrote context to ${claudeMdPath}`)
  }

  // Memory files
  if (context.memories && context.memories.length > 0) {
    const sanitizedCwd = cwd.replace(/\//g, '-')
    const memoryDir = join(homedir(), '.claude', 'projects', sanitizedCwd, 'memory')
    mkdirSync(memoryDir, { recursive: true })

    for (const mem of context.memories) {
      writeFileSync(join(memoryDir, mem.filename), mem.content, 'utf-8')
    }

    const memoryMdPath = join(memoryDir, 'MEMORY.md')
    let existingMemoryMd = ''
    try {
      existingMemoryMd = readFileSync(memoryMdPath, 'utf-8')
    } catch {
      // doesn't exist yet
    }

    const nonAgentopsLines = existingMemoryMd.split('\n').filter((line) => !line.includes('agentops-'))
    const agentopsEntries = context.memories.map(
      (mem) => `- [${mem.filename.replace('.md', '')}](${mem.filename}) — AgentOps managed`,
    )
    const newMemoryMd = [...nonAgentopsLines.filter((l) => l.trim()), ...agentopsEntries].join('\n') + '\n'
    writeFileSync(memoryMdPath, newMemoryMd, 'utf-8')

    console.error(`AgentOps: wrote ${context.memories.length} memory files`)
  }

  // Company announcement
  if (data.announcement) {
    const claudeSettingsDir = join(cwd, '.claude')
    const settingsPath = join(claudeSettingsDir, 'settings.json')
    mkdirSync(claudeSettingsDir, { recursive: true })

    let settings = {}
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    } catch {
      // doesn't exist yet
    }
    settings.companyAnnouncements = [data.announcement]
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
    console.error(`AgentOps: wrote company announcement`)
  }
}

// ─── Cursor: write ~/.cursor/rules/agentops-context.mdc ────────────────────

if (editorType === 'cursor') {
  if (context.rules_mdc) {
    let ruleContent = context.rules_mdc
    const toolStatus = checkTools(context.tools)

    if (toolStatus) {
      // Inject before the footer
      ruleContent = ruleContent.replace(
        /> This rule is managed by AgentOps/,
        toolStatus + '\n> This rule is managed by AgentOps',
      )
    }

    const rulesDir = join(homedir(), '.cursor', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    writeFileSync(join(rulesDir, 'agentops-context.mdc'), ruleContent, 'utf-8')
    console.error(`AgentOps: wrote Cursor rules to ~/.cursor/rules/agentops-context.mdc`)
  }
}

// ─── Codex: write AGENTS.md ────────────────────────────────────────────────

if (editorType === 'codex') {
  if (context.claude_md) {
    // Reuse claude_md content as AGENTS.md (same format works)
    let agentsMd = context.claude_md
    const toolStatus = checkTools(context.tools)

    if (toolStatus) {
      agentsMd = agentsMd.replace(
        /> This file is managed by AgentOps/,
        toolStatus + '\n> This file is managed by AgentOps',
      )
    }

    writeFileSync(join(cwd, 'AGENTS.md'), agentsMd, 'utf-8')
    console.error(`AgentOps: wrote context to AGENTS.md`)
  }
}
