import pc from 'picocolors'
import { getSkillDir, scaffoldSkill } from '../lib/skills.js'

export async function createCommand(name: string | undefined, opts: { tags?: string; user?: boolean; project?: boolean }) {
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
    console.error(pc.red(`Skill already exists: ${targetDir}`))
    process.exit(1)
  }

  const title = skillName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  const tags = opts.tags
    ? opts.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : undefined

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
    tags,
    content,
  }, scope)

  const scopeLabel = scope.user ? 'user' : 'project'
  const tagsHint = opts.tags ? '' : ' --tags engineering,testing'
  console.log(pc.green(`✓ Created ${dir}/SKILL.md (${scopeLabel})`))
  console.log(pc.dim(`  Edit it, add scripts/ or references/ as needed.`))
  console.log(pc.dim(`  Then share with: agentops skills submit ${skillName}${tagsHint}`))
}
