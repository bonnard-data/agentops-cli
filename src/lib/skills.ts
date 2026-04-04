import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = os.homedir()

export function getEditorType(): string {
  try {
    const editorFile = path.join(HOME, '.agentops', 'editor.json')
    return JSON.parse(fs.readFileSync(editorFile, 'utf-8')).editor || 'cursor'
  } catch {
    return 'cursor'
  }
}

export function getCommandsDir(editor?: string): string {
  const ed = editor ?? getEditorType()
  switch (ed) {
    case 'claude':
      return path.join(HOME, '.claude', 'skills')
    case 'codex':
      return path.join(HOME, '.agents', 'skills')
    default:
      return path.join(HOME, '.cursor', 'commands')
  }
}

export function getSkillFilePath(name: string, editor?: string): string {
  const ed = editor ?? getEditorType()
  const dir = getCommandsDir(ed)
  const fileName = name.startsWith('agentops-') ? name : `agentops-${name}`

  if (ed === 'claude' || ed === 'codex') {
    return path.join(dir, fileName, 'SKILL.md')
  }
  return path.join(dir, `${fileName}.md`)
}

export function writeSkillFile(skill: { name: string; description: string; content: string }, editor?: string): string {
  const ed = editor ?? getEditorType()
  const dir = getCommandsDir(ed)
  const fileName = skill.name.startsWith('agentops-') ? skill.name : `agentops-${skill.name}`

  fs.mkdirSync(dir, { recursive: true })

  let filePath: string
  if (ed === 'claude' || ed === 'codex') {
    const skillDir = path.join(dir, fileName)
    fs.mkdirSync(skillDir, { recursive: true })
    filePath = path.join(skillDir, 'SKILL.md')
    fs.writeFileSync(filePath, `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.content}`)
  } else {
    filePath = path.join(dir, `${fileName}.md`)
    fs.writeFileSync(filePath, `---\ndescription: ${skill.description}\n---\n\n${skill.content}`)
  }

  return filePath
}

export function deleteSkillFile(name: string, editor?: string): void {
  const ed = editor ?? getEditorType()
  const dir = getCommandsDir(ed)
  const fileName = name.startsWith('agentops-') ? name : `agentops-${name}`

  if (ed === 'claude' || ed === 'codex') {
    const skillDir = path.join(dir, fileName)
    fs.rmSync(skillDir, { recursive: true, force: true })
  } else {
    const filePath = path.join(dir, `${fileName}.md`)
    try { fs.unlinkSync(filePath) } catch { /* already gone */ }
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
  const filePath = getSkillFilePath(name)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Skill file not found: ${filePath}\nDid you run: agentops create ${name}`)
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  return parseSkillFile(raw, name)
}
