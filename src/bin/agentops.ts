#!/usr/bin/env node
import { createRequire } from 'node:module'
import { Command } from 'commander'
import pc from 'picocolors'
import { loginCommand } from '../commands/login.js'
import { setupCommand } from '../commands/setup.js'
import { searchCommand } from '../commands/search.js'
import { installCommand } from '../commands/install.js'
import { infoCommand } from '../commands/info.js'
import { uninstallCommand } from '../commands/uninstall.js'
import { installedCommand } from '../commands/installed.js'
import { createCommand } from '../commands/create.js'
import { submitCommand } from '../commands/submit.js'
import { mineCommand } from '../commands/mine.js'
import { approveCommand } from '../commands/approve.js'
import { rejectCommand } from '../commands/reject.js'
import { checkCommand } from '../commands/check.js'
import { whoamiCommand } from '../commands/whoami.js'
import { historyCommand } from '../commands/history.js'
import { rollbackCommand } from '../commands/rollback.js'
import { deleteCommand } from '../commands/delete.js'
import { clearCredentials } from '../lib/credentials.js'

// Read version from package.json at runtime.
// The published layout is: package.json at the npm package root, dist/bin/agentops.mjs one level deep.
const require = createRequire(import.meta.url)
const pkg = require('../../package.json') as { version: string }

const program = new Command()

program
  .name('agentops')
  .description('AgentOps CLI — setup and manage your AI agent skills')
  .version(pkg.version)

program
  .command('login')
  .description('Authenticate with AgentOps via your browser')
  .action(loginCommand)

program
  .command('setup')
  .description('Configure your editor (claude, cursor, codex, windsurf, copilot, gemini)')
  .requiredOption('--editor <editor>', 'Editor to configure (claude, cursor, codex, windsurf, copilot, gemini)')
  .action(setupCommand)

program
  .command('logout')
  .description('Clear saved credentials')
  .action(() => {
    clearCredentials()
    console.log(pc.green('✓ Logged out'))
  })

program
  .command('whoami')
  .description('Show current user, plan, and usage')
  .action(whoamiCommand)

// ─── Skills subcommand group ─────────────────────────────────────────────

const skills = program
  .command('skills')
  .description('Manage org skills — search, install, create, submit, version')

skills
  .command('search [query]')
  .description('Search the org skill library')
  .option('--tags [tags]', 'List all tags (no value) or filter by tags (comma-separated)')
  .option('--authors', 'List all skill authors')
  .option('--author <name>', 'Filter by author name')
  .option('--status <status>', 'Filter by status (admin only)')
  .action(searchCommand)

skills
  .command('info <spec>')
  .description('Show details for a skill — use <name> for latest or <name>@v1 for a specific version')
  .action(infoCommand)

skills
  .command('install <spec>')
  .description('Install a skill — use <name> for latest or <name>@v2 to pin a version')
  .option('--user', 'Install to user-level (available in all projects)')
  .option('--project', 'Install to project-level (default)')
  .option('--force', 'Overwrite existing skill')
  .action(installCommand)

skills
  .command('uninstall <name>')
  .description('Uninstall a personal skill')
  .action(uninstallCommand)

skills
  .command('installed')
  .description('Show skills installed locally (project + user scopes)')
  .action(installedCommand)

skills
  .command('create [name]')
  .description('Scaffold a new skill locally')
  .option('--user', 'Create at user-level (available in all projects)')
  .option('--project', 'Create at project-level (default)')
  .action(createCommand)

skills
  .command('check <name>')
  .description('Check a local skill for issues before submitting')
  .action(checkCommand)

skills
  .command('submit <name>')
  .description('Publish a skill — creates a new version each time')
  .action(submitCommand)

skills
  .command('history <name>')
  .description('Show version history for a skill')
  .action(historyCommand)

skills
  .command('rollback <spec>')
  .description('Re-publish an older version as the new latest — use <name>@v<N> (pro+)')
  .action(rollbackCommand)

skills
  .command('mine')
  .description('Show skills you\'ve authored (draft, submitted, published, rejected)')
  .action(mineCommand)

skills
  .command('approve <name>')
  .description('Approve a submitted skill — makes it live for the org (admin only)')
  .action(approveCommand)

skills
  .command('reject <name>')
  .description('Reject a submitted skill (admin only)')
  .requiredOption('--comment <comment>', 'Reason for rejection')
  .action(rejectCommand)

skills
  .command('delete <name>')
  .description('Permanently delete a skill and all its versions (admin only)')
  .option('--force', 'Confirm the deletion')
  .action(deleteCommand)

program.parse()
