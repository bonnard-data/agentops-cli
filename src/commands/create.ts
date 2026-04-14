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

## Workflow

1. Step one
2. Step two
3. Step three

## Guidelines

- Guideline one
- Guideline two`

  const dir = scaffoldSkill({
    name: skillName,
    description: 'A brief description of what this skill does and when to use it',
    tags: ['example'],
    content,
  }, scope)

  const scopeLabel = scope.user ? 'user' : 'project'
  console.log(pc.green(`✓ Created ${dir}/SKILL.md (${scopeLabel})`))
  console.log(pc.dim(`  Edit it, add scripts/ or references/ as needed.`))
  console.log(pc.dim(`  Update the tags in the frontmatter before submitting.`))
  console.log(pc.dim(`  Then share with: agentops skills submit ${skillName}`))
}
