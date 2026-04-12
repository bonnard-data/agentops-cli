#!/usr/bin/env node
import { Command } from 'commander'
import pc from 'picocolors'
import { loginCommand } from '../commands/login.js'
import { setupCommand } from '../commands/setup.js'
import { searchCommand } from '../commands/search.js'
import { installCommand } from '../commands/install.js'
import { uninstallCommand } from '../commands/uninstall.js'
import { listCommand } from '../commands/list.js'
import { createCommand } from '../commands/create.js'
import { submitCommand } from '../commands/submit.js'
import { updateCommand } from '../commands/update.js'
import { mySkillsCommand } from '../commands/my-skills.js'
import { publishCommand } from '../commands/publish.js'
import { rejectCommand } from '../commands/reject.js'
import { checkCommand } from '../commands/check.js'
import { whoamiCommand } from '../commands/whoami.js'
import { clearCredentials } from '../lib/credentials.js'

const program = new Command()

program
  .name('agentops')
  .description('AgentOps CLI — setup and manage your AI agent skills')
  .version('0.1.0')

program
  .command('login')
  .description('Authenticate with AgentOps via your browser')
  .option('--url <url>', 'AgentOps server URL')
  .action(loginCommand)

program
  .command('setup')
  .description('Configure an editor for AgentOps skill sync')
  .requiredOption('--editor <editor>', 'Editor to configure (claude, cursor, codex, windsurf, copilot, gemini)')
  .option('--url <url>', 'AgentOps server URL')
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
  .option('--url <url>', 'AgentOps server URL')
  .action(whoamiCommand)

// ─── Skills subcommand group ─────────────────────────────────────────────

const skills = program
  .command('skills')
  .description('Manage org skills — search, install, create, publish')

skills
  .command('search [query]')
  .description('Search the org skill library')
  .option('--url <url>', 'AgentOps server URL')
  .option('--tags [tags]', 'List all tags (no value) or filter by tags (comma-separated)')
  .option('--authors', 'List all skill authors')
  .option('--author <name>', 'Filter by author name')
  .option('--status <status>', 'Filter by status (admin only)')
  .action(searchCommand)

skills
  .command('install <name>')
  .description('Install a skill from the org library')
  .option('--url <url>', 'AgentOps server URL')
  .option('--user', 'Install to user-level (available in all projects)')
  .option('--project', 'Install to project-level (default)')
  .option('--force', 'Overwrite existing skill')
  .action(installCommand)

skills
  .command('uninstall <name>')
  .description('Uninstall a personal skill')
  .option('--url <url>', 'AgentOps server URL')
  .action(uninstallCommand)

skills
  .command('list')
  .description('Show your synced skills (role + personal)')
  .option('--url <url>', 'AgentOps server URL')
  .action(listCommand)

skills
  .command('create [name]')
  .description('Scaffold a new skill locally')
  .option('--tags <tags>', 'Tags for discovery (comma-separated)')
  .option('--user', 'Create at user-level (available in all projects)')
  .option('--project', 'Create at project-level (default)')
  .action(createCommand)

skills
  .command('check <name>')
  .description('Check a local skill for issues before submitting')
  .action(checkCommand)

skills
  .command('submit <name>')
  .description('Submit a skill for review')
  .option('--url <url>', 'AgentOps server URL')
  .option('--tags <tags>', 'Tags for discovery (comma-separated)')
  .action(submitCommand)

skills
  .command('update <name>')
  .description('Push local skill edits to the server')
  .option('--url <url>', 'AgentOps server URL')
  .action(updateCommand)

skills
  .command('mine')
  .description('Show your authored and installed skills')
  .option('--url <url>', 'AgentOps server URL')
  .action(mySkillsCommand)

skills
  .command('publish <name>')
  .description('Publish a submitted skill (admin only)')
  .option('--url <url>', 'AgentOps server URL')
  .action(publishCommand)

skills
  .command('reject <name>')
  .description('Reject a submitted skill (admin only)')
  .requiredOption('--comment <comment>', 'Reason for rejection')
  .option('--url <url>', 'AgentOps server URL')
  .action(rejectCommand)

program.parse()
