import pc from 'picocolors'
import { loadCredentials, loadConfig, saveConfig } from '../lib/credentials.js'

const SUPPORTED_EDITORS = ['claude', 'cursor', 'codex', 'windsurf', 'copilot', 'gemini'] as const

export async function setupCommand(options: { editor?: string }) {
  const creds = loadCredentials()
  if (!creds) {
    console.error(pc.red('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  const editor = options.editor?.toLowerCase()
  if (!editor || !SUPPORTED_EDITORS.includes(editor as (typeof SUPPORTED_EDITORS)[number])) {
    console.error(pc.red(`Supported editors: ${SUPPORTED_EDITORS.join(', ')}`))
    process.exit(1)
  }

  // Save editor choice to config
  const existingConfig = loadConfig()
  saveConfig({ ...existingConfig, editor })

  console.log(pc.green(`✓ Editor set to ${pc.bold(editor)}`))
  console.log(pc.dim(`  Skills will be managed in .${editor === 'codex' ? 'agents' : editor === 'copilot' ? 'github' : editor}/skills/`))
  console.log()
  console.log(pc.dim('Next steps:'))
  console.log(pc.dim('  Browse skills:  agentops skills search'))
  console.log(pc.dim('  Create a skill: agentops skills create <name>'))
  console.log(pc.dim('  Install a skill: agentops skills install <name>'))
}
