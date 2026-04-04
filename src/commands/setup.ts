import { execFileSync } from 'node:child_process'
import pc from 'picocolors'
import { loadCredentials } from '../lib/credentials.js'

const SUPPORTED_EDITORS = ['cursor', 'claude', 'codex'] as const
type Editor = (typeof SUPPORTED_EDITORS)[number]

const PLUGIN_REPO = 'bonnard-data/agentops-cli'

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
      installPlugin('claude', ['claude', 'plugin', 'install', PLUGIN_REPO])
      break
    case 'cursor':
      installPlugin('cursor', ['cursor', 'plugin', 'install', PLUGIN_REPO])
      break
    case 'codex':
      installPlugin('codex', ['codex', 'plugin', 'install', PLUGIN_REPO])
      break
  }

  console.log()
  console.log(pc.green('Setup complete.'))
  console.log(pc.dim('Skills will sync automatically on every session start.'))
}

function installPlugin(editor: string, command: string[]) {
  try {
    execFileSync(command[0]!, command.slice(1), { stdio: 'inherit' })
    console.log(pc.green(`  ${editor} plugin installed`))
  } catch {
    console.log(pc.yellow(`  Plugin install failed.`))
    console.log(pc.dim(`  Try manually: ${command.join(' ')}`))
  }
}
