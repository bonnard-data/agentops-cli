import crypto from 'node:crypto'
import http from 'node:http'
import pc from 'picocolors'
import open from 'open'
import { getBaseUrl, post } from '../lib/api.js'
import { saveCredentials, saveConfig, loadConfig, validateCredentials } from '../lib/credentials.js'

const CALLBACK_HOST = '127.0.0.1'

export async function loginCommand(options: { url?: string }) {
  const baseUrl = getBaseUrl(options.url)

  console.log(pc.dim(`Server: ${baseUrl}`))

  // Generate CSRF state client-side (RFC 8252 / same pattern as gh CLI)
  const expectedState = crypto.randomBytes(20).toString('hex')

  // 1. Get the WorkOS auth URL from the server
  let authRes: Response
  let callbackPort: number
  try {
    // Start local server first to get the ephemeral port
    const { server, port } = await startCallbackServer()
    callbackPort = port

    const redirectUri = `http://${CALLBACK_HOST}:${callbackPort}/callback`
    authRes = await fetch(
      `${baseUrl}/auth/url?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(expectedState)}`,
    )

    if (!authRes.ok) {
      server.close()
      console.error(pc.red(`Failed to get auth URL: ${authRes.status} ${await authRes.text()}`))
      process.exit(1)
    }

    const { url: authUrl } = (await authRes.json()) as { url: string }

    // 2. Wait for callback
    console.log(pc.dim(`Listening on http://${CALLBACK_HOST}:${callbackPort}`))
    console.log('Opening browser for authentication...')
    console.log(pc.dim(`If the browser doesn't open, visit:\n${authUrl}`))
    console.log()

    open(authUrl).catch(() => {
      // Browser failed to open — URL is already printed above
    })

    const { code, state } = await waitForCallback(server, expectedState)

    // 3. Exchange code for tokens via the server
    console.log(pc.dim('Exchanging code for tokens...'))
    const callbackRes = await post('/auth/callback', { code, state }, baseUrl)
    if (!callbackRes.ok) {
      const body = await callbackRes.text()
      console.error(pc.red(`Authentication failed: ${body}`))
      process.exit(1)
    }

    const data: unknown = await callbackRes.json()
    const creds = validateCredentials(data)
    if (!creds) {
      console.error(pc.red('Server returned an unexpected response format.'))
      process.exit(1)
    }

    // 4. Save credentials and config
    saveCredentials(creds)
    saveConfig({ ...loadConfig(), url: baseUrl })

    console.log()
    console.log(pc.green('✓ Logged in successfully'))
    console.log(`  ${pc.bold(creds.user.email)} (${creds.org.name})`)
    console.log(`  Role: ${creds.user.role}`)
    console.log()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Cannot reach server') || message.includes('ECONNREFUSED')) {
      console.error(pc.red(`Cannot reach server at ${baseUrl}`))
      console.error(pc.dim('Check the URL and ensure the server is running.'))
    } else {
      console.error(pc.red(`Login failed: ${message}`))
    }
    process.exit(1)
  }
}

function startCallbackServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, CALLBACK_HOST, () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close()
        reject(new Error('Failed to get server address'))
        return
      }
      resolve({ server, port: addr.port })
    })
    server.on('error', reject)
  })
}

function waitForCallback(
  server: http.Server,
  expectedState: string,
): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Login timed out after 5 minutes'))
    }, 5 * 60 * 1000)

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://${CALLBACK_HOST}`)

      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      if (!code) {
        // Never reflect query params into HTML (XSS risk — CVE-2025-66040)
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(resultPage('Authentication Failed', 'Check the terminal for details.'))
        clearTimeout(timeout)
        server.close()
        const errorMsg = url.searchParams.get('error') ?? 'No authorization code received'
        reject(new Error(errorMsg))
        return
      }

      // Validate CSRF state (RFC 8252)
      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(resultPage('Authentication Failed', 'Check the terminal for details.'))
        clearTimeout(timeout)
        server.close()
        reject(new Error('State mismatch — possible CSRF attack. Try logging in again.'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(resultPage('Authenticated', 'You can close this tab and return to the terminal.'))
      clearTimeout(timeout)
      server.close()
      resolve({ code, state })
    })
  })
}

/** Static HTML page — never interpolate user/query data into this */
function resultPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html><head><title>AgentOps</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa">
<div style="text-align:center">
<h1>${title}</h1>
<p>${message}</p>
</div>
</body></html>`
}
