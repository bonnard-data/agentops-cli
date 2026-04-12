import fs from 'node:fs'
import path from 'node:path'
import { parseSkillMd } from './skills.js'

export interface Issue {
  severity: 'error' | 'warning'
  message: string
  hint?: string
}

export interface ValidationResult {
  errors: Issue[]
  warnings: Issue[]
  ok: boolean
}

const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_NAME_LEN = 64
const MAX_DESC_LEN = 1024
const RECOMMENDED_MAX_DESC_LEN = 500
const MIN_DESC_LEN = 50
const MAX_SKILL_MD_LINES = 500
const MAX_FILE_SIZE = 1024 * 1024 // 1MB

/**
 * Validate a skill folder. Returns errors and warnings.
 * Errors block submission. Warnings are shown but don't block.
 */
export function validateSkill(skillDir: string): ValidationResult {
  const errors: Issue[] = []
  const warnings: Issue[] = []

  // Does the folder exist?
  if (!fs.existsSync(skillDir)) {
    errors.push({
      severity: 'error',
      message: `Skill folder not found: ${skillDir}`,
    })
    return { errors, warnings, ok: false }
  }

  // Does SKILL.md exist?
  const skillMdPath = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(skillMdPath)) {
    errors.push({
      severity: 'error',
      message: 'Missing SKILL.md',
      hint: `Create one at ${skillMdPath}`,
    })
    return { errors, warnings, ok: false }
  }

  // Parse frontmatter
  const raw = fs.readFileSync(skillMdPath, 'utf-8')
  const folderName = path.basename(skillDir)

  let parsed: ReturnType<typeof parseSkillMd>
  try {
    parsed = parseSkillMd(raw, folderName)
  } catch (err) {
    errors.push({
      severity: 'error',
      message: `Cannot parse SKILL.md: ${(err as Error).message}`,
      hint: 'Check the YAML frontmatter (--- delimiters, indentation, key: value pairs)',
    })
    return { errors, warnings, ok: false }
  }

  const { frontmatter, content } = parsed

  // ── name checks ──────────────────────────────────────────────

  if (!SKILL_NAME_RE.test(frontmatter.name)) {
    errors.push({
      severity: 'error',
      message: `Invalid name "${frontmatter.name}"`,
      hint: 'Must be lowercase letters, numbers, and single hyphens (e.g. "my-skill")',
    })
  }

  if (frontmatter.name.length > MAX_NAME_LEN) {
    errors.push({
      severity: 'error',
      message: `Name too long (${frontmatter.name.length} chars, max ${MAX_NAME_LEN})`,
    })
  }

  if (frontmatter.name !== folderName) {
    errors.push({
      severity: 'error',
      message: `Name in frontmatter ("${frontmatter.name}") does not match folder name ("${folderName}")`,
      hint: 'Either rename the folder or update the "name" field in SKILL.md',
    })
  }

  // ── description checks ──────────────────────────────────────

  if (frontmatter.description.length > MAX_DESC_LEN) {
    errors.push({
      severity: 'error',
      message: `Description exceeds ${MAX_DESC_LEN} char limit (${frontmatter.description.length})`,
      hint: 'Trim it, or move details into SKILL.md body',
    })
  }

  if (frontmatter.description.length < MIN_DESC_LEN) {
    warnings.push({
      severity: 'warning',
      message: `Description is very short (${frontmatter.description.length} chars)`,
      hint: 'Longer descriptions help the agent decide when to use this skill',
    })
  }

  if (frontmatter.description.length > RECOMMENDED_MAX_DESC_LEN) {
    warnings.push({
      severity: 'warning',
      message: `Description is ${frontmatter.description.length} chars (recommended < ${RECOMMENDED_MAX_DESC_LEN})`,
      hint: 'Claude Code truncates descriptions at 250 chars in its catalog — front-load the key information',
    })
  }

  // ── body checks ──────────────────────────────────────────────

  if (!content || content.length < 20) {
    errors.push({
      severity: 'error',
      message: 'SKILL.md body is empty or near-empty',
      hint: 'Add instructions explaining how to perform the skill',
    })
  }

  const lineCount = raw.split('\n').length
  if (lineCount > MAX_SKILL_MD_LINES) {
    warnings.push({
      severity: 'warning',
      message: `SKILL.md is ${lineCount} lines (recommended < ${MAX_SKILL_MD_LINES})`,
      hint: 'Move detailed reference material into references/ files and link to them',
    })
  }

  // ── folder structure checks ─────────────────────────────────

  const entries = fs.readdirSync(skillDir, { withFileTypes: true })

  // Cruft files
  for (const entry of entries) {
    if (entry.name === '.DS_Store' || entry.name.startsWith('._')) {
      warnings.push({
        severity: 'warning',
        message: `Cruft file in skill folder: ${entry.name}`,
        hint: 'Delete it — it will end up in the bundle',
      })
    }
  }

  // Scripts at root instead of scripts/
  for (const entry of entries) {
    if (entry.isFile() && /\.(sh|py|js|mjs|ts)$/.test(entry.name)) {
      warnings.push({
        severity: 'warning',
        message: `Script at skill root: ${entry.name}`,
        hint: 'Move executable code into scripts/ for convention',
      })
    }
  }

  // Large files anywhere in the folder
  const walkLarge = (dir: string, rel: string = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      const relPath = path.join(rel, entry.name)
      if (entry.isDirectory()) {
        walkLarge(full, relPath)
      } else if (entry.isFile()) {
        const size = fs.statSync(full).size
        if (size > MAX_FILE_SIZE) {
          warnings.push({
            severity: 'warning',
            message: `Large file: ${relPath} (${(size / 1024 / 1024).toFixed(1)}MB)`,
            hint: 'Skill bundles are limited to 10MB total. Consider assets/ for large resources.',
          })
        }
      }
    }
  }
  walkLarge(skillDir)

  return {
    errors,
    warnings,
    ok: errors.length === 0,
  }
}
