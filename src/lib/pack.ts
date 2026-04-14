import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as tar from 'tar'

/**
 * Pack a skill directory into a .tgz Buffer.
 *
 * Bundle format (from CLI 0.7.10 onwards):
 *   - Files live under a top-level directory named after the skill
 *   - e.g. "my-skill/SKILL.md", "my-skill/scripts/run.sh"
 *
 * This way, when a user downloads the bundle from the web and extracts it
 * via macOS Archive Utility (or any double-click unpacker), they get a
 * "my-skill/" folder containing the files — not a pile of files in their
 * Downloads folder.
 *
 * The CLI install path strips this wrapper (see unpackSkill) so files end
 * up directly under `.claude/skills/<name>/` as before.
 *
 * Old bundles submitted before 0.7.10 still work — they use the flat
 * format (files at the root of the tarball) and unpackSkill handles both.
 *
 * Precondition: path.basename(skillDir) must equal the skill name. The
 * skill-scaffolding and find helpers always satisfy this.
 */
export async function packSkill(skillDir: string): Promise<Buffer> {
  const resolved = path.resolve(skillDir)

  if (!fs.existsSync(resolved)) {
    throw new Error(`Skill directory not found: ${resolved}`)
  }

  const stat = fs.statSync(resolved)
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`)
  }

  const skillMd = path.join(resolved, 'SKILL.md')
  if (!fs.existsSync(skillMd)) {
    throw new Error(`No SKILL.md found in ${resolved}`)
  }

  const parentDir = path.dirname(resolved)
  const dirName = path.basename(resolved)

  // tar.create with cwd=parentDir and include=[dirName] walks the skill
  // directory as a top-level entry, producing an archive with paths like
  // "<dirName>/SKILL.md", "<dirName>/scripts/run.sh", etc.
  const packStream = tar.create(
    {
      cwd: parentDir,
      gzip: true,
      portable: true,
    },
    [dirName],
  )

  const chunks: Buffer[] = []
  for await (const chunk of packStream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

/**
 * Unpack a .tgz Buffer into a target directory.
 * Creates the target directory if it doesn't exist.
 *
 * Always strips one leading path component — bundles from CLI 0.7.10+ are
 * wrapped in a top-level skill-name directory, and we drop it on install so
 * files land directly under `.claude/skills/<name>/`.
 */
export async function unpackSkill(tgz: Buffer, targetDir: string): Promise<void> {
  const resolved = path.resolve(targetDir)
  fs.mkdirSync(resolved, { recursive: true })

  await new Promise<void>((resolve, reject) => {
    const extract = new tar.Unpack({ cwd: resolved, strip: 1, strict: false })
    extract.on('end', () => resolve())
    extract.on('error', (err: Error) => reject(err))
    extract.end(tgz)
  })
}

/**
 * Unpack a .tgz Buffer into a temp directory, read SKILL.md, clean up.
 * Returns the raw SKILL.md contents. Used for reading an immutable version's
 * README without persisting it to the user's skills dir.
 */
export async function readSkillMdFromBundle(tgz: Buffer): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-info-'))
  try {
    await unpackSkill(tgz, tempDir)
    const mdPath = path.join(tempDir, 'SKILL.md')
    if (!fs.existsSync(mdPath)) {
      throw new Error('SKILL.md not found in bundle')
    }
    return fs.readFileSync(mdPath, 'utf-8')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
