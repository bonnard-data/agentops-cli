#!/usr/bin/env node
import { Command } from 'commander'
import pc from 'picocolors'
import { loginCommand } from '../commands/login.js'
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

program.parse()
