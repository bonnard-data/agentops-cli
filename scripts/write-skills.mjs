import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const targetDir = process.argv[2]
if (!targetDir) {
  console.error('Usage: write-skills.mjs <commands-dir>')
  process.exit(1)
}

const editorType = process.env.EDITOR_TYPE || 'claude'

// Read JSON from stdin
let input = ''
for await (const chunk of process.stdin) {
  input += chunk
}

const data = JSON.parse(input)
const skills = data.skills || []

mkdirSync(targetDir, { recursive: true })

// Remove existing agentops-* files only (don't touch user's local commands)
try {
  const existing = readdirSync(targetDir)
  for (const file of existing) {
    if (file.startsWith('agentops-')) {
      rmSync(join(targetDir, file), { recursive: true, force: true })
    }
  }
} catch {
  // dir may not exist yet
}

// Write each skill
for (const skill of skills) {
  const name = skill.name.startsWith('agentops-') ? skill.name : `agentops-${skill.name}`

  if (editorType === 'codex') {
    // Codex: write SKILL.md format in a subdirectory
    const skillDir = join(targetDir, name)
    mkdirSync(skillDir, { recursive: true })
    const skillMd = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.content}`
    writeFileSync(join(skillDir, 'SKILL.md'), skillMd, 'utf-8')
  } else {
    // Claude Code + Cursor: write command .md format (description-only frontmatter)
    const content = `---\ndescription: ${skill.description}\n---\n\n${skill.content}`
    writeFileSync(join(targetDir, `${name}.md`), content, 'utf-8')
  }
}

const roles = (data.roles || []).join(', ')
console.error(`AgentOps: synced ${skills.length} skills for ${data.user?.email || 'unknown'} (${roles})`)
