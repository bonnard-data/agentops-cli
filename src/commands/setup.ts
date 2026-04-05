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

  const cli = editor === 'claude' ? 'claude' : editor
  const pluginRef = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`

  // 1. Add marketplace
  try {
    execFileSync(cli, ['plugin', 'marketplace', 'add', MARKETPLACE_REPO], { stdio: 'inherit' })
    console.log(pc.green('  Marketplace added'))
  } catch {
    console.log(pc.dim('  Marketplace already configured'))
  }

  // 2. Install plugin
  try {
    execFileSync(cli, ['plugin', 'install', pluginRef], { stdio: 'inherit' })
    console.log(pc.green(`  Plugin installed`))
  } catch {
    console.log(pc.yellow('  Plugin install failed.'))
    console.log(pc.dim(`  Try manually:`))
    console.log(pc.dim(`    ${cli} plugin marketplace add ${MARKETPLACE_REPO}`))
    console.log(pc.dim(`    ${cli} plugin install ${pluginRef}`))
  }

  console.log()
  console.log(pc.green('Setup complete.'))
  console.log(pc.dim('Skills will sync automatically on every session start.'))
}
