import pc from 'picocolors'
import { post, getBaseUrl } from '../lib/api.js'
import { loadCredentials } from '../lib/credentials.js'
import { parseSkillSpec } from '../lib/skills.js'

export async function rollbackCommand(spec: string) {
  const creds = loadCredentials()
  if (!creds) {
    console.log(pc.yellow('Not logged in. Run: agentops login'))
    process.exit(1)
  }

  let parsed
  try {
    parsed = parseSkillSpec(spec)
  } catch (err) {
    console.error(pc.red((err as Error).message))
    process.exit(1)
  }

  if (typeof parsed.version !== 'number') {
    console.error(pc.red('A specific version is required: agentops skills rollback <name>@v<N>'))
    console.log(pc.dim(`  e.g. agentops skills rollback ${parsed.name}@v1`))
    process.exit(1)
  }

  const baseUrl = getBaseUrl()
  console.log(pc.dim(`Rolling back "${parsed.name}" to v${parsed.version}...`))

  const res = await post(
    `/api/skills/${encodeURIComponent(parsed.name)}/rollback`,
    { version: parsed.version },
    baseUrl,
  )

  if (!res.ok) {
    const err = await res.json() as { error?: { code?: string; message?: string } }
    console.error(pc.red(err.error?.message ?? `Error: ${res.status}`))
    if (err.error?.code === 'feature_gated') {
      console.log(pc.dim(`  Version rollback requires the pro plan or higher.`))
      console.log(pc.dim(`  Manage your subscription at https://agentops.bonnard.ai`))
    } else if (err.error?.code === 'not_found') {
      console.log(pc.dim(`  Check available versions: agentops skills history ${parsed.name}`))
    } else if (err.error?.code === 'forbidden') {
      console.log(pc.dim(`  Only the skill author or an admin can roll back.`))
    }
    process.exit(1)
  }

  const result = await res.json() as { version: number; rolledBackFrom: number }
  console.log(pc.green(`✓ "${parsed.name}" rolled back to v${result.rolledBackFrom} — now published as v${result.version}`))
  console.log(pc.dim(`  Install: agentops skills install ${parsed.name}`))
}
