import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import pc from 'picocolors'
import { loadCredentials } from '../lib/credentials.js'

const SUPPORTED_EDITORS = ['cursor', 'claude', 'codex'] as const
type Editor = (typeof SUPPORTED_EDITORS)[number]

const MARKETPLACE_REPO = 'bonnard-data/agentops-cli'
const MARKETPLACE_NAME = 'bonnard-agentops'
const PLUGIN_NAME = 'agentops'

export async function setupCommand(options: { editor?: string; url?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.error(pc.red('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const editor = options.editor?.toLowerCase()
  if (!editor || !SUPPORTED_EDITORS.includes(editor as Editor)) {
    console.error(pc.red(`Please specify an editor: --editor ${SUPPORTED_EDITORS.join(' | ')}`))
    process.exit(1)
  }

  console.log(`Logged in as ${pc.bold(creds.user.email)} (${creds.org.name})`)
  console.log(`Setting up for ${pc.bold(editor)}...`)
  console.log()

  switch (editor as Editor) {
    case 'claude':
      setupClaude()
      break
    case 'cursor':
      setupCursor()
      break
    case 'codex':
      setupCodex()
      break
  }

  console.log()
  console.log(pc.green('Setup complete.'))
  console.log(pc.dim('Skills will sync automatically on every session start.'))
}

function setupClaude() {
  const pluginRef = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`

  try {
    execFileSync('claude', ['plugin', 'marketplace', 'add', MARKETPLACE_REPO], { stdio: 'inherit' })
    console.log(pc.green('  Marketplace added'))
  } catch {
    console.log(pc.dim('  Marketplace already configured'))
  }

  try {
    execFileSync('claude', ['plugin', 'install', pluginRef], { stdio: 'inherit' })
    console.log(pc.green('  Plugin installed'))
  } catch {
    console.log(pc.yellow('  Plugin install failed.'))
    console.log(pc.dim(`  Try manually:`))
    console.log(pc.dim(`    claude plugin marketplace add ${MARKETPLACE_REPO}`))
    console.log(pc.dim(`    claude plugin install ${pluginRef}`))
  }
}

function setupCursor() {
  const home = os.homedir()
  const pluginDir = path.join(home, '.cursor', 'plugins', 'agentops')

  // Copy plugin files from the npm package to ~/.cursor/plugins/agentops/
  const sourceDir = findPluginSource()
  if (!sourceDir) {
    console.error(pc.red('Could not find plugin files.'))
    console.log(pc.dim('  Try reinstalling: npm install -g @bonnard/agentops@latest'))
    return
  }

  // Clean and copy
  fs.rmSync(pluginDir, { recursive: true, force: true })
  copyDir(sourceDir, pluginDir)

  // Ensure skills and rules dirs exist
  fs.mkdirSync(path.join(pluginDir, 'skills'), { recursive: true })
  fs.mkdirSync(path.join(pluginDir, 'rules'), { recursive: true })
  fs.mkdirSync(path.join(home, '.cursor', 'skills'), { recursive: true })
  fs.mkdirSync(path.join(home, '.cursor', 'rules'), { recursive: true })

  // Write hooks.json with absolute path (Cursor doesn't set CURSOR_PLUGIN_ROOT)
  const hooksContent = {
    description: 'AgentOps sync hook — syncs skills and context on session start',
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command: `node ${path.join(pluginDir, 'scripts', 'sync.mjs')}`,
            },
          ],
        },
      ],
    },
  }
  fs.writeFileSync(path.join(pluginDir, 'hooks', 'hooks.json'), JSON.stringify(hooksContent, null, 2))

  console.log(pc.green('  Plugin installed to ~/.cursor/plugins/agentops/'))
  console.log(pc.dim('  Skills will sync to ~/.cursor/skills/'))
}

function setupCodex() {
  // Codex: same approach as Cursor — copy plugin to local dir
  console.log(pc.yellow('  Codex support coming soon.'))
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function findPluginSource(): string | null {
  // Look for plugin files relative to this script (works in dev and published package)
  const candidates = [
    path.resolve(import.meta.dirname, '..', '..'),  // dist/bin/../../ → package root
    path.resolve(import.meta.dirname, '..'),         // fallback
  ]

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, '.cursor-plugin', 'plugin.json')) &&
        fs.existsSync(path.join(dir, 'hooks', 'hooks.json')) &&
        fs.existsSync(path.join(dir, 'scripts', 'sync.mjs'))) {
      return dir
    }
  }
  return null
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    // Skip node_modules, dist, src, .git, .github, dev config
    if (['node_modules', 'dist', 'src', '.git', '.github', 'pnpm-lock.yaml', 'tsconfig.json', 'eslint.config.js'].includes(entry.name)) continue
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
