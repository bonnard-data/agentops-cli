import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import YAML from 'yaml'
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
  return getSkillSearchPaths(name).find((p) => fs.existsSync(path.join(p, 'SKILL.md'))) ?? null
}

/**
 * Get the list of paths where findSkillDir would look for a skill.
 * Used for error messages so users see exactly where we searched.
 */
export function getSkillSearchPaths(name: string): string[] {
  const editor = getEditor()
  const { skills } = getEditorPaths(editor)
  const root = findProjectRoot(editor)
  return [
    path.join(root, skills, name),
    path.join(HOME, skills, name),
  ]
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

// ─── Spec parsing ────────────────────────────────────────────────────────

export interface SkillSpec {
  name: string
  version: number | 'latest' | undefined
}

/**
 * Parse a skill spec like "foo", "foo@v3", or "foo@latest".
 * Version is a positive integer, 'latest', or undefined (treated as latest).
 */
export function parseSkillSpec(spec: string): SkillSpec {
  const atIdx = spec.indexOf('@')
  if (atIdx === -1) {
    return { name: spec, version: undefined }
  }
  const name = spec.slice(0, atIdx)
  const versionStr = spec.slice(atIdx + 1)
  if (versionStr === 'latest') {
    return { name, version: 'latest' }
  }
  const num = Number(versionStr.replace(/^v/, ''))
  if (!Number.isInteger(num) || num < 1) {
    throw new Error(`Invalid version "${versionStr}". Use @latest, @v1, @v2, etc.`)
  }
  return { name, version: num }
}

// ─── Scan installed skills ───────────────────────────────────────────────

export interface InstalledSkill {
  name: string
  dir: string
  scope: 'project' | 'user'
  description: string
}

export interface ScanResult {
  skills: InstalledSkill[]
  errors: Array<{ dir: string; error: string }>
}

function scanDirForSkills(root: string, scope: 'project' | 'user'): ScanResult {
  const result: ScanResult = { skills: [], errors: [] }
  if (!fs.existsSync(root)) return result

  let entries: string[]
  try {
    entries = fs.readdirSync(root)
  } catch (err) {
    result.errors.push({ dir: root, error: (err as Error).message })
    return result
  }

  for (const entry of entries) {
    const dir = path.join(root, entry)
    try {
      if (!fs.statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue

    try {
      const { frontmatter } = readSkillMd(dir)
      result.skills.push({ name: frontmatter.name, dir, scope, description: frontmatter.description })
    } catch (err) {
      result.errors.push({ dir, error: (err as Error).message })
    }
  }

  return result
}

/**
 * Scan the configured editor's project- and user-level skill directories.
 * Returns every parseable SKILL.md found, alongside any parse errors.
 */
export function scanLocalSkills(): ScanResult {
  const editor = getEditor()
  const { skills: skillsSubdir } = getEditorPaths(editor)
  const projectRoot = findProjectRoot(editor)

  const project = scanDirForSkills(path.join(projectRoot, skillsSubdir), 'project')
  const user = scanDirForSkills(path.join(HOME, skillsSubdir), 'user')

  const combined: InstalledSkill[] = [...project.skills, ...user.skills].sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  return {
    skills: combined,
    errors: [...project.errors, ...user.errors],
  }
}

// ─── Frontmatter parsing ─────────────────────────────────────────────────

export interface SkillFrontmatter {
  name: string
  description: string
  /**
   * Tags are undefined when the YAML block has no `tags:` key. An empty
   * array means the user explicitly set `tags: []`. This distinction matters
   * on submit: absent → server preserves existing; explicit empty → clears.
   */
  tags?: string[]
}

/**
 * Parse a SKILL.md file into frontmatter and content.
 * Uses a real YAML parser — handles block scalars, quoted strings, nested values.
 */
export function parseSkillMd(raw: string, nameFromDir?: string): { frontmatter: SkillFrontmatter; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('SKILL.md must start with --- frontmatter ---')
  }

  const [, fmBlock, content] = match

  let fm: Record<string, unknown>
  try {
    fm = YAML.parse(fmBlock!) as Record<string, unknown>
  } catch (err) {
    throw new Error(`Invalid YAML frontmatter: ${(err as Error).message}`, { cause: err })
  }

  if (!fm || typeof fm !== 'object') {
    throw new Error('Frontmatter must be a YAML object')
  }

  const name = typeof fm.name === 'string' && fm.name.trim() ? fm.name.trim() : nameFromDir
  const description = typeof fm.description === 'string' ? fm.description.trim() : ''

  if (!name) {
    throw new Error('Frontmatter must include "name"')
  }
  if (!description) {
    throw new Error('Frontmatter must include "description"')
  }

  // Tags can be a YAML array or comma-separated string. Leave tags
  // `undefined` when the key is absent so submit can omit the field and let
  // the server preserve whatever's already stored.
  let tags: string[] | undefined
  if (Array.isArray(fm.tags)) {
    tags = fm.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
  } else if (typeof fm.tags === 'string') {
    tags = fm.tags.split(',').map((t) => t.trim()).filter(Boolean)
  }

  return {
    frontmatter: { name, description, tags },
    content: (content ?? '').trim(),
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
 * Rewrite the frontmatter of an already-extracted SKILL.md, merging the
 * provided updates into the existing YAML block. Used by `install` to sync
 * server-side metadata (e.g. tags edited via the web UI) back into the local
 * file after unpacking the bundle.
 *
 * Only touches the frontmatter — the markdown body is preserved byte-for-byte.
 */
export function updateSkillMdFrontmatter(
  skillDir: string,
  updates: Partial<Pick<SkillFrontmatter, 'description' | 'tags'>>,
): void {
  const filePath = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(filePath)) return

  const raw = fs.readFileSync(filePath, 'utf-8')
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return

  const [, fmBlock, body] = match
  let fm: Record<string, unknown>
  try {
    fm = (YAML.parse(fmBlock!) ?? {}) as Record<string, unknown>
  } catch {
    return
  }

  if (updates.description !== undefined) fm.description = updates.description
  if (updates.tags !== undefined) {
    if (updates.tags.length > 0) fm.tags = updates.tags
    else delete fm.tags
  }

  const newBlock = YAML.stringify(fm).trimEnd()
  const rebuilt = `---\n${newBlock}\n---\n\n${(body ?? '').replace(/^\n+/, '')}`
  fs.writeFileSync(filePath, rebuilt)
}

/**
 * Find a skill by name and read its SKILL.md.
 * Searches project-level first, then user-level.
 * Throws if not found.
 */
export function findAndReadSkill(name: string): { dir: string; frontmatter: SkillFrontmatter; content: string } {
  const dir = findSkillDir(name)
  if (!dir) {
    const searched = getSkillSearchPaths(name).map((p) => `  - ${p}/SKILL.md`).join('\n')
    throw new Error(
      `Skill "${name}" not found. Searched:\n${searched}\n\n` +
      `Skills must live in one of those paths so your editor can discover them.\n` +
      `Create a new skill with: agentops skills create ${name}`,
    )
  }
  const { frontmatter, content } = readSkillMd(dir)
  return { dir, frontmatter, content }
}
