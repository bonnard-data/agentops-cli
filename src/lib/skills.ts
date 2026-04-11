import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from './credentials.js'

const HOME = os.homedir()

// Editor config directory markers and their skills subdirectory
const EDITOR_PATHS: Record<string, { marker: string; skills: string }> = {
  claude:   { marker: '.claude',   skills: '.claude/skills' },
  cursor:   { marker: '.cursor',   skills: '.cursor/skills' },
  codex:    { marker: '.agents',   skills: '.agents/skills' },
  windsurf: { marker: '.windsurf', skills: '.windsurf/skills' },
  copilot:  { marker: '.github',   skills: '.github/skills' },
  gemini:   { marker: '.gemini',   skills: '.gemini/skills' },
}

/**
 * Get the configured editor, or throw if not set up.
 */
function getEditor(): string {
  const editor = loadConfig()?.editor
  if (!editor) {
    throw new Error('No editor configured. Run: agentops setup --editor <editor>')
  }
  if (!EDITOR_PATHS[editor]) {
    throw new Error(`Unknown editor "${editor}". Supported: ${Object.keys(EDITOR_PATHS).join(', ')}`)
  }
  return editor
}

/**
 * Get the editor's marker directory name and skills path.
 */
function getEditorPaths(editor: string): { marker: string; skills: string } {
  return EDITOR_PATHS[editor] ?? EDITOR_PATHS.claude!
}

// ─── Project root detection ──────────────────────────────────────────────

/**
 * Walk up from CWD looking for the editor's config directory.
 * Stops at $HOME (never treat ~/.claude/ as a project root).
 * If not found, returns CWD (Option B: create here).
 */
function findProjectRoot(editor: string): string {
  const { marker } = getEditorPaths(editor)
  let dir = process.cwd()

  while (dir !== HOME && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, marker))) {
      return dir
    }
    dir = path.dirname(dir)
  }

  // Not found — use CWD as project root (will create editor dir on first write)
  return process.cwd()
}

// ─── Path resolution ─────────────────────────────────────────────────────

/**
 * Get the project-level skill directory for a skill name.
 * Walks up to find project root, returns path at <root>/<editor-skills>/<name>.
 */
export function getProjectSkillDir(name: string): string {
  const editor = getEditor()
  const { skills } = getEditorPaths(editor)
  const root = findProjectRoot(editor)
  return path.join(root, skills, name)
}

/**
 * Get the user-level skill directory for a skill name.
 */
export function getUserSkillDir(name: string): string {
  const editor = getEditor()
  const { skills } = getEditorPaths(editor)
  return path.join(HOME, skills, name)
}

/**
 * Get the skill directory based on scope flag.
 */
export function getSkillDir(name: string, opts: { user?: boolean }): string {
  return opts.user ? getUserSkillDir(name) : getProjectSkillDir(name)
}

// ─── Find existing skills ────────────────────────────────────────────────

/**
 * Find an existing skill folder. Searches:
 * 1. Project-level (walk up from CWD)
 * 2. User-level (~/<editor>/skills/)
 * Returns the first found path, or null.
 */
export function findSkillDir(name: string): string | null {
  const editor = getEditor()
  const { skills } = getEditorPaths(editor)

  // Check project level
  const root = findProjectRoot(editor)
  const projectDir = path.join(root, skills, name)
  if (fs.existsSync(path.join(projectDir, 'SKILL.md'))) {
    return projectDir
  }

  // Check user level
  const userDir = path.join(HOME, skills, name)
  if (fs.existsSync(path.join(userDir, 'SKILL.md'))) {
    return userDir
  }

  return null
}

// ─── Write / delete skills ───────────────────────────────────────────────

/**
 * Scaffold a new skill (SKILL.md with frontmatter + content).
 * Returns the directory written to.
 */
export function scaffoldSkill(
  skill: { name: string; description: string; tags?: string[]; content: string },
  opts: { user?: boolean },
): string {
  const skillDir = getSkillDir(skill.name, opts)

  const tagsLine = skill.tags && skill.tags.length > 0
    ? `\ntags: [${skill.tags.join(', ')}]`
    : ''
  const fileContent = `---\nname: ${skill.name}\ndescription: ${skill.description}${tagsLine}\n---\n\n${skill.content}`

  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), fileContent)

  return skillDir
}

/**
 * Delete a skill folder. Checks both project and user level.
 */
export function deleteSkill(name: string): void {
  const editor = getEditor()
  const { skills } = getEditorPaths(editor)

  // Delete from project level
  const root = findProjectRoot(editor)
  const projectDir = path.join(root, skills, name)
  fs.rmSync(projectDir, { recursive: true, force: true })

  // Delete from user level
  const userDir = path.join(HOME, skills, name)
  fs.rmSync(userDir, { recursive: true, force: true })
}

/**
 * Get the install target directory for a skill based on scope.
 */
export function getInstallDir(name: string, opts: { user?: boolean }): string {
  const dir = getSkillDir(name, opts)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ─── Frontmatter parsing ─────────────────────────────────────────────────

export interface SkillFrontmatter {
  name: string
  description: string
  tags: string[]
}

/**
 * Parse a SKILL.md file into frontmatter and content.
 */
export function parseSkillMd(raw: string, nameFromDir?: string): { frontmatter: SkillFrontmatter; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('SKILL.md must start with --- frontmatter ---')
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

  const name = fm.name || nameFromDir
  const description = fm.description
  if (!name || !description) {
    throw new Error('Frontmatter must include "name" and "description"')
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

/**
 * Read and parse the SKILL.md from a skill directory.
 */
export function readSkillMd(skillDir: string): { frontmatter: SkillFrontmatter; content: string } {
  const filePath = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(filePath)) {
    throw new Error(`No SKILL.md found in ${skillDir}`)
  }
  const raw = fs.readFileSync(filePath, 'utf-8')
  const dirName = path.basename(skillDir)
  return parseSkillMd(raw, dirName)
}

/**
 * Find a skill by name and read its SKILL.md.
 * Searches project-level first, then user-level.
 * Throws if not found.
 */
export function findAndReadSkill(name: string): { dir: string; frontmatter: SkillFrontmatter; content: string } {
  const dir = findSkillDir(name)
  if (!dir) {
    throw new Error(`Skill "${name}" not found.\nSearched project and user skill directories.\nDid you run: agentops skills create ${name}`)
  }
  const { frontmatter, content } = readSkillMd(dir)
  return { dir, frontmatter, content }
}
