import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Pack } from 'tar'
import * as tar from 'tar'

/**
 * Pack a skill directory into a .tgz Buffer.
 * The tarball contains all files with paths relative to the skill directory root.
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

  // Collect all files in the directory (recursive)
  const files = walkDir(resolved, resolved)

  // Create tarball in memory
  const chunks: Buffer[] = []

  await new Promise<void>((resolve, reject) => {
    const pack = new Pack({ cwd: resolved, gzip: true, portable: true })

    pack.on('data', (chunk: Buffer) => chunks.push(chunk))
    pack.on('end', () => resolve())
    pack.on('error', (err: unknown) => reject(err))

    for (const file of files) {
      pack.write(file)
    }
    pack.end()
  })

  return Buffer.concat(chunks)
}

/**
 * Unpack a .tgz Buffer into a target directory.
 * Creates the target directory if it doesn't exist.
 */
export async function unpackSkill(tgz: Buffer, targetDir: string): Promise<void> {
  const resolved = path.resolve(targetDir)
  fs.mkdirSync(resolved, { recursive: true })

  await new Promise<void>((resolve, reject) => {
    const extract = new tar.Unpack({ cwd: resolved, strip: 0, strict: true })
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

/**
 * Walk a directory recursively and return relative file paths.
 */
function walkDir(dir: string, root: string): string[] {
  const results: string[] = []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, root))
    } else if (entry.isFile()) {
      results.push(path.relative(root, fullPath))
    }
    // Skip symlinks, sockets, etc.
  }

  return results.sort()
}
