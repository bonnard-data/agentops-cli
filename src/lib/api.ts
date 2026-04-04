import { loadCredentials, saveCredentials, loadConfig } from './credentials.js'

export function getBaseUrl(urlOverride?: string): string {
  if (urlOverride) return urlOverride.replace(/\/$/, '')
  const config = loadConfig()
  if (config?.url) return config.url.replace(/\/$/, '')
  return 'https://agentops.bonnard.ai'
}

async function refreshToken(baseUrl: string): Promise<boolean> {
  const creds = loadCredentials()
  if (!creds?.refreshToken) return false

  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: creds.refreshToken }),
    })
    if (!res.ok) return false

    const data = await res.json() as { accessToken: string; refreshToken: string }
    saveCredentials({ ...creds, accessToken: data.accessToken, refreshToken: data.refreshToken })
    return true
  } catch {
    return false
  }
}

async function fetchWithRefresh(url: string, init: RequestInit, baseUrl: string): Promise<Response> {
  let res = await fetch(url, init)
  if (res.status === 401) {
    const refreshed = await refreshToken(baseUrl)
    if (refreshed) {
      const creds = loadCredentials()
      const headers = { ...init.headers as Record<string, string> }
      if (creds) headers['Authorization'] = `Bearer ${creds.accessToken}`
      res = await fetch(url, { ...init, headers })
    }
  }
  return res
}

export async function get(path: string, baseUrl: string): Promise<Response> {
  return fetchWithRefresh(`${baseUrl}${path}`, { headers: getHeaders() }, baseUrl)
}

export async function post(path: string, body: unknown, baseUrl: string): Promise<Response> {
  return fetchWithRefresh(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, baseUrl)
}

export async function put(path: string, body: unknown, baseUrl: string): Promise<Response> {
  return fetchWithRefresh(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, baseUrl)
}

export async function del(path: string, baseUrl: string): Promise<Response> {
  return fetchWithRefresh(`${baseUrl}${path}`, {
    method: 'DELETE',
    headers: getHeaders(),
  }, baseUrl)
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const creds = loadCredentials()
  if (creds) {
    headers['Authorization'] = `Bearer ${creds.accessToken}`
  }
  return headers
}
