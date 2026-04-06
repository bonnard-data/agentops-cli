import pc from 'picocolors'
import { getEditorType, getSkillFilePath, writeSkillFile } from '../lib/skills.js'

export async function createCommand(name: string | undefined, opts: { tags?: string }) {
  const skillName = name ?? 'my-skill'

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName) || skillName.length > 64) {
    console.error(pc.red('Skill name must be 1-64 lowercase alphanumeric chars with hyphens (e.g. "my-skill")'))
    process.exit(1)
  }

  const editor = getEditorType()
  const filePath = getSkillFilePath(skillName, editor)

  // Check if already exists
  const fs = await import('node:fs')
  if (fs.existsSync(filePath)) {
    console.error(pc.red(`Skill already exists: ${filePath}`))
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

  writeSkillFile({
    name: skillName,
    description: 'A brief description of what this skill does and when to use it',
    content,
  }, editor)

  const tagsHint = opts.tags ? '' : ' --tags engineering,testing'
  console.log(pc.green(`✓ Created ${filePath}`))
  console.log(pc.dim(`  Ready to use now. Edit it, then share with: agentops skills submit ${skillName}${tagsHint}`))
}
