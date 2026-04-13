import pc from 'picocolors'
import { scanLocalSkills } from '../lib/skills.js'

export async function installedCommand() {
  let result
  try {
    result = scanLocalSkills()
  } catch (err) {
    console.error(pc.red((err as Error).message))
    process.exit(1)
  }

  if (result.skills.length === 0) {
    console.log(pc.dim('No skills installed.'))
    console.log(pc.dim('  Browse: agentops skills search'))
    console.log(pc.dim('  Create: agentops skills create <name>'))
    return
  }

  console.log(pc.bold(`Installed skills (${result.skills.length}):\n`))
  for (const s of result.skills) {
    console.log(`  ${pc.bold(s.name)} ${pc.dim(`[${s.scope}]`)}`)
    console.log(`    ${pc.dim(s.description)}`)
  }

  if (result.errors.length > 0) {
    console.log()
    console.log(pc.yellow(`Skipped ${result.errors.length} skill(s) with errors:`))
    for (const e of result.errors) {
      console.log(pc.dim(`  ${e.dir}: ${e.error}`))
    }
  }
}
