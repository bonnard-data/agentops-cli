import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = os.homedir()

// All editor skill directories — write to all detected editors (Vercel skills approach)
// Use editor-specific marker files to avoid false positives (e.g. VS Code creating ~/.cursor/)
function getAllSkillsDirs(): string[] {
  const dirs: string[] = []
  if (fs.existsSync(path.join(HOME, '.claude'))) dirs.push(path.join(HOME, '.claude', 'skills'))
  if (fs.existsSync(path.join(HOME, '.cursor', 'plugins'))) dirs.push(path.join(HOME, '.cursor', 'skills'))
  if (fs.existsSync(path.join(HOME, '.codex'))) dirs.push(path.join(HOME, '.codex', 'skills'))
  if (fs.existsSync(path.join(HOME, '.agents'))) dirs.push(path.join(HOME, '.agents', 'skills'))
  return dirs.length > 0 ? dirs : [path.join(HOME, '.claude', 'skills')]
}

// Primary dir for reading (first available)
function getPrimarySkillsDir(): string {
  const dirs = getAllSkillsDirs()
  return dirs[0]!
}

export function getSkillFilePath(name: string): string {
  const dir = getPrimarySkillsDir()
  const fileName = name.startsWith('agentops-') ? name : `agentops-${name}`
  return path.join(dir, fileName, 'SKILL.md')
}

export function writeSkillFile(skill: { name: string; description: string; content: string }): string {
  const dirs = getAllSkillsDirs()
  const fileName = skill.name.startsWith('agentops-') ? skill.name : `agentops-${skill.name}`
  const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.content}`

  let primaryPath = ''
  for (const dir of dirs) {
    try {
      const skillDir = path.join(dir, fileName)
      fs.mkdirSync(skillDir, { recursive: true })
      const filePath = path.join(skillDir, 'SKILL.md')
      fs.writeFileSync(filePath, content)
      if (!primaryPath) primaryPath = filePath
    } catch { /* skip dirs with permission issues */ }
  }

  return primaryPath
}

export function deleteSkillFile(name: string): void {
  const dirs = getAllSkillsDirs()
  const fileName = name.startsWith('agentops-') ? name : `agentops-${name}`

  for (const dir of dirs) {
    try {
      const skillDir = path.join(dir, fileName)
      fs.rmSync(skillDir, { recursive: true, force: true })
    } catch { /* skip dirs with permission issues */ }
  }
}

export interface SkillFrontmatter {
  name: string
  description: string
  tags: string[]
}

export function parseSkillFile(raw: string, nameFromFilename?: string): { frontmatter: SkillFrontmatter; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('Skill file must start with --- frontmatter ---')
  }

  const [, fmBlock, content] = match
  const fm: Record<string, string> = {}

  for (const line of fmBlock!.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    fm[key] = value
  }

  const name = fm.name || nameFromFilename
  const description = fm.description
  if (!name || !description) {
    throw new Error('Frontmatter must include "description" (and optionally "name")')
  }

  let tags: string[] = []
  if (fm.tags) {
    const tagsStr = fm.tags.replace(/^\[/, '').replace(/\]$/, '').trim()
    if (tagsStr) {
      tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean)
    }
  }

  return {
    frontmatter: { name, description, tags },
    content: content!.trim(),
  }
}

export function readSkillFromCommandsDir(name: string): { frontmatter: SkillFrontmatter; content: string } {
  // Try all dirs to find the skill
  const dirs = getAllSkillsDirs()
  const fileName = name.startsWith('agentops-') ? name : `agentops-${name}`

  for (const dir of dirs) {
    const filePath = path.join(dir, fileName, 'SKILL.md')
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      return parseSkillFile(raw, name)
    }
  }

  const cleanName = name.startsWith('agentops-') ? name.slice(9) : name
  throw new Error(`Skill file not found in any editor skills dir\nDid you run: agentops skills create ${cleanName}`)
}
