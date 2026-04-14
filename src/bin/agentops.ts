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
import { orgSettingsGetCommand, orgSettingsSetCommand } from '../commands/org.js'
import { pendingCommand } from '../commands/pending.js'
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
  .addHelpText('after', `
Typical authoring workflow:
  $ agentops skills create my-skill
  $ agentops skills check my-skill
  $ agentops skills submit my-skill

SKILL.md format reference:
  https://docs.claude.com/en/docs/claude-code/skills
`)

skills
  .command('search [query]')
  .description('Search the org skill library')
  .option('--tags [tags]', 'List all tags (no value) or filter by tags (comma-separated)')
  .option('--authors', 'List all skill authors')
  .option('--author <name>', 'Filter by author name')
  .option('--status <status>', 'Filter by status (admin only)')
  .action(searchCommand)
  .addHelpText('after', `
Examples:
  $ agentops skills search invoice                 # text search name + description
  $ agentops skills search --tags finance,pdf      # filter by one or more tags
  $ agentops skills search --tags                  # list all tags in the org
  $ agentops skills search --authors               # list all authors + skill counts
  $ agentops skills search --author alex           # filter by author name
`)

skills
  .command('info <spec>')
  .description('Show details for a skill — use <name> for latest or <name>@v1 for a specific version')
  .action(infoCommand)
  .addHelpText('after', `
Examples:
  $ agentops skills info invoice-maker             # latest published version
  $ agentops skills info invoice-maker@v1          # a specific historical version
`)

skills
  .command('install <spec>')
  .description('Install a skill — use <name> for latest or <name>@v2 to pin a version')
  .option('--user', 'Install to user-level (available in all projects)')
  .option('--project', 'Install to project-level (default)')
  .option('--force', 'Overwrite existing skill')
  .action(installCommand)
  .addHelpText('after', `
Examples:
  $ agentops skills install invoice-maker          # latest, project scope
  $ agentops skills install invoice-maker --user   # user scope (all projects)
  $ agentops skills install invoice-maker@v2       # pin to v2 (pro+)
  $ agentops skills install invoice-maker --force  # overwrite existing

After install, invoke the skill in Claude Code with /<skill-name>.
The local SKILL.md is rewritten with the latest server tags on every install.
`)

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
  .addHelpText('after', `
Examples:
  $ agentops skills create invoice-maker           # project scope (default)
  $ agentops skills create shared-utils --user     # user scope (all projects)

The scaffolded SKILL.md includes a commented reference block with the
full frontmatter vocabulary (when_to_use, allowed-tools, context: fork,
etc.) and supporting-file conventions (scripts/, references/, assets/).
Read it before submitting.
`)

skills
  .command('check <name>')
  .description('Check a local skill for issues before submitting')
  .action(checkCommand)
  .addHelpText('after', `
Examples:
  $ agentops skills check invoice-maker

Runs local validation only — frontmatter, file layout, size heuristics.
Nothing is uploaded. Use this before submit to catch issues early.
`)

skills
  .command('submit <name>')
  .description('Publish a skill — creates a new version each time')
  .action(submitCommand)
  .addHelpText('after', `
Examples:
  $ agentops skills submit invoice-maker

Tags are read from the \`tags:\` line in SKILL.md frontmatter.
  - Omit the line   → server preserves existing tags
  - tags: []        → clears tags on the server
  - tags: [a, b]    → replaces with [a, b]

On free plan, submissions auto-publish immediately. On pro+ plans they
enter a review queue unless your org has auto-publish enabled.
`)

skills
  .command('history <name>')
  .description('Show version history for a skill')
  .action(historyCommand)
  .addHelpText('after', `
Examples:
  $ agentops skills history invoice-maker

Shows every published version with date, author, and size.
Requires a Pro+ plan.
`)

skills
  .command('rollback <spec>')
  .description('Re-publish an older version as the new latest — use <name>@v<N> (pro+)')
  .action(rollbackCommand)
  .addHelpText('after', `
Examples:
  $ agentops skills rollback invoice-maker@v2      # re-publish v2 as a new version

Rollback doesn't delete anything — it snapshots an older version's bundle
as the new latest. Requires a Pro+ plan.
`)

skills
  .command('mine')
  .description('Show skills you\'ve authored (draft, submitted, published, rejected)')
  .action(mineCommand)

skills
  .command('pending')
  .description('Show skills awaiting admin review (admin only)')
  .action(pendingCommand)
  .addHelpText('after', `
Examples:
  $ agentops skills pending

Lists every skill in the org currently in \`submitted\` state, with the
author and a one-line description. Admins only.

Act on a specific submission:
  $ agentops skills approve <name>
  $ agentops skills reject <name> --comment "<reason>"
`)

skills
  .command('approve <name>')
  .description('Approve a submitted skill — makes it live for the org (admin only)')
  .action(approveCommand)

skills
  .command('reject <name>')
  .description('Reject a submitted skill (admin only)')
  .requiredOption('--comment <comment>', 'Reason for rejection')
  .action(rejectCommand)
  .addHelpText('after', `
Examples:
  $ agentops skills reject invoice-maker --comment "Missing error handling in scripts/"
`)

skills
  .command('delete <name>')
  .description('Permanently delete a skill and all its versions (admin only)')
  .option('--force', 'Confirm the deletion')
  .action(deleteCommand)

// ─── Org subcommand group ────────────────────────────────────────────────

const org = program
  .command('org')
  .description('Manage org settings (admin only for mutations)')

const orgSettings = org
  .command('settings')
  .description('View or update org settings')
  .addHelpText('after', `
Examples:
  $ agentops org settings get
  $ agentops org settings set auto-publish false     # require admin review
  $ agentops org settings set auto-publish true      # publish immediately

Settings:
  auto-publish          Whether skill submissions publish immediately.
                        When false, submissions enter the admin review queue.
  allow-public-domains  Whether members can sign up with gmail.com etc.
`)

orgSettings
  .command('get')
  .description('Show current org settings')
  .action(orgSettingsGetCommand)

orgSettings
  .command('set <key> <value>')
  .description('Update an org setting (admin only)')
  .action(orgSettingsSetCommand)

program.parse()
