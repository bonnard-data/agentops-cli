import http from 'node:http'
import pc from 'picocolors'
import open from 'open'
import { getBaseUrl, post } from '../lib/api.js'
import { saveCredentials, saveConfig, type Credentials } from '../lib/credentials.js'

const CALLBACK_PORT = 9876

export async function loginCommand(options: { url?: string }) {
  const baseUrl = getBaseUrl(options.url)

  console.log(pc.dim(`Server: ${baseUrl}`))

  // 1. Get the WorkOS auth URL from the server
  let authRes: Response
  try {
    authRes = await fetch(
      `${baseUrl}/auth/url?redirect_uri=${encodeURIComponent(`http://localhost:${CALLBACK_PORT}/callback`)}`,
    )
  } catch {
    console.error(pc.red(`Cannot reach server at ${baseUrl}`))
    console.error(pc.dim('Check the URL and ensure the server is running.'))
    process.exit(1)
    return
  }
  if (!authRes.ok) {
    console.error(pc.red(`Failed to get auth URL: ${authRes.status} ${await authRes.text()}`))
    process.exit(1)
  }
  const { url: authUrl } = (await authRes.json()) as { url: string }

  // 2. Start local callback server
  const { code, state } = await captureCallback(authUrl)

  // 3. Exchange code for tokens via the server
  console.log(pc.dim('Exchanging code for tokens...'))
  const callbackRes = await post('/auth/callback', { code, state }, baseUrl)
  if (!callbackRes.ok) {
    const body = await callbackRes.text()
    console.error(pc.red(`Authentication failed: ${body}`))
    process.exit(1)
  }

  const data = (await callbackRes.json()) as Credentials

  // 4. Save credentials and config
  saveCredentials(data)
  saveConfig({ url: baseUrl })

  console.log()
  console.log(pc.green('✓ Logged in successfully'))
  console.log(`  ${pc.bold(data.user.email)} (${data.org.name})`)
  console.log(`  Role: ${data.user.role}`)
  console.log()
}

function captureCallback(authUrl: string): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${CALLBACK_PORT}`)

      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      if (!code) {
        const error = url.searchParams.get('error') ?? 'No code received'
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(errorPage(error))
        server.close()
        reject(new Error(error))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(successPage())
      server.close()
      resolve({ code, state: state ?? '' })
    })

    server.listen(CALLBACK_PORT, () => {
      console.log(pc.dim(`Listening on http://localhost:${CALLBACK_PORT}`))
      console.log('Opening browser for authentication...')
      console.log()
      open(authUrl)
    })

    server.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        reject(new Error(`Port ${CALLBACK_PORT} is in use. Close the process using it and try again.`))
      } else {
        reject(err)
      }
    })

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close()
      reject(new Error('Login timed out after 5 minutes'))
    }, 5 * 60 * 1000)
  })
}

function successPage(): string {
  return `<!DOCTYPE html>
<html><head><title>AgentOps</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa">
<div style="text-align:center">
<h1>Authenticated</h1>
<p>You can close this tab and return to the terminal.</p>
</div>
</body></html>`
}

function errorPage(error: string): string {
  return `<!DOCTYPE html>
<html><head><title>AgentOps</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa">
<div style="text-align:center">
<h1>Authentication Failed</h1>
<p>${error}</p>
</div>
</body></html>`
}
