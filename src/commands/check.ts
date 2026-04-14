import pc from 'picocolors'
import { findSkillDir, getSkillSearchPaths } from '../lib/skills.js'
import { validateSkill, type Issue } from '../lib/validate.js'

export async function checkCommand(name: string) {
  let dir: string | null
  try {
    dir = findSkillDir(name)
  } catch (err) {
    console.error(pc.red((err as Error).message))
    process.exit(1)
  }

  if (!dir) {
    const searched = getSkillSearchPaths(name).map((p) => `  - ${p}/SKILL.md`).join('\n')
    console.error(pc.red(`Skill "${name}" not found. Searched:\n${searched}`))
    process.exit(1)
  }

  const result = validateSkill(dir)

  console.log(pc.dim(`Checking ${dir}\n`))

  printIssues(result.errors, pc.red, 'ERROR')
  printIssues(result.warnings, pc.yellow, 'WARNING')

  if (result.ok && result.warnings.length === 0) {
    console.log(pc.green('✓ No issues found'))
    console.log(pc.dim('  Submit: agentops skills submit ' + name))
    console.log(pc.dim('  Check bundle-size + skill-count limits: agentops whoami'))
    return
  }

  if (result.ok) {
    console.log(pc.yellow(`\n${result.warnings.length} warning(s) — skill is submittable`))
    console.log(pc.dim('  Submit: agentops skills submit ' + name))
    console.log(pc.dim('  Check bundle-size + skill-count limits: agentops whoami'))
    return
  }

  console.log(pc.red(`\n${result.errors.length} error(s) must be fixed before submitting`))
  process.exit(1)
}

export function printIssues(issues: Issue[], color: (s: string) => string, label: string) {
  for (const issue of issues) {
    console.log(color(`${label}: ${issue.message}`))
    if (issue.hint) {
      console.log(pc.dim(`  → ${issue.hint}`))
    }
  }
}
