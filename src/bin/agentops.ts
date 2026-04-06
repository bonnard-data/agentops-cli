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
import { loadCredentials, clearCredentials } from '../lib/credentials.js'

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
  .requiredOption('--editor <editor>', 'Editor to configure (cursor, claude, codex)')
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
  .description('Show current logged-in user')
  .action(() => {
    const creds = loadCredentials()
    if (!creds) {
      console.log(pc.yellow('Not logged in. Run: agentops login'))
      process.exit(1)
      return
    }
    console.log(`${pc.bold(creds.user.email)} (${creds.org.name})`)
    console.log(`Role: ${creds.user.role}`)
  })

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
  .action(createCommand)

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

program.parse()
