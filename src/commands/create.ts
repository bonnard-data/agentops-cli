import pc from 'picocolors'
import { getSkillDir, scaffoldSkill } from '../lib/skills.js'

export async function createCommand(name: string | undefined, opts: { user?: boolean; project?: boolean }) {
  const skillName = name ?? 'my-skill'

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName) || skillName.length > 64) {
    console.error(pc.red(`Invalid skill name "${skillName}". Must be 1-64 lowercase alphanumeric chars with single hyphens (e.g. "my-skill").`))
    process.exit(1)
  }

  const scope = { user: opts.user ?? false }

  // Check if already exists
  const fs = await import('node:fs')
  let targetDir: string
  try {
    targetDir = getSkillDir(skillName, scope)
  } catch (err) {
    console.error(pc.red((err as Error).message))
    process.exit(1)
  }
  if (fs.existsSync(`${targetDir}/SKILL.md`)) {
    console.error(pc.red(`Skill "${skillName}" already exists at ${targetDir}`))
    console.log(pc.dim('  Edit the existing skill, or pick a different name.'))
    process.exit(1)
  }

  const title = skillName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  const content = `# ${title}

Describe the skill's purpose and workflow here.

## When to use

Concrete trigger conditions — when Claude should invoke this skill.

## Workflow

1. Step one
2. Step two
3. Step three

## Guidelines

- Guideline one
- Guideline two

<!--
─── AgentOps skill authoring quick reference ─────────────────────────

Optional frontmatter fields you can add above (uncomment + customise):

  when_to_use: >
    Extended trigger description. Takes precedence over \`description\`
    for auto-invocation.
  disable-model-invocation: true     # require explicit /skill-name
  user-invocable: false              # hide from the /skill picker
  allowed-tools: [Read, Edit, Bash]  # pre-approve a tool allowlist
  argument-hint: <filename>          # shown after /skill-name
  context: fork                      # run in an isolated subagent
  model: sonnet                      # pin to a specific model
  effort: low                        # low | medium | high

Full reference: https://docs.claude.com/en/docs/claude-code/skills

Tag semantics on \`agentops skills submit\`:
  - Omit \`tags:\` entirely   → server preserves existing tags
  - Set \`tags: []\`          → clears all tags on the server
  - Set \`tags: [a, b]\`      → replaces with [a, b]

Supporting files (add as subdirectories alongside SKILL.md):
  scripts/     helper scripts Claude can execute
  references/  long-form docs, API examples, templates too big for SKILL.md
  assets/      images, PDFs, binary resources

Use \`$ARGUMENTS\` inside SKILL.md to access args passed after /skill-name.
Use \`\${CLAUDE_SKILL_DIR}\` inside scripts to reference bundled files.

Delete this comment block before submitting if you want.
──────────────────────────────────────────────────────────────────────
-->`

  const dir = scaffoldSkill({
    name: skillName,
    description: 'A brief description of what this skill does and when to use it',
    tags: ['example'],
    content,
  }, scope)

  const scopeLabel = scope.user ? 'user' : 'project'
  console.log(pc.green(`✓ Created ${dir}/SKILL.md (${scopeLabel})`))
  console.log(pc.dim(`  Read the comment block at the bottom of SKILL.md for`))
  console.log(pc.dim(`  optional frontmatter fields and supporting-file conventions.`))
  console.log()
  console.log(pc.dim(`  Next:`))
  console.log(pc.dim(`    • Edit SKILL.md (update name, description, tags)`))
  console.log(pc.dim(`    • Add scripts/, references/, or assets/ if needed`))
  console.log(pc.dim(`    • Validate:  agentops skills check ${skillName}`))
  console.log(pc.dim(`    • Publish:   agentops skills submit ${skillName}`))
}
