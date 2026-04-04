import { loadCredentials, loadConfig } from './credentials.js'

export function getBaseUrl(urlOverride?: string): string {
  if (urlOverride) return urlOverride.replace(/\/$/, '')
  const config = loadConfig()
  if (config?.url) return config.url.replace(/\/$/, '')
  return 'https://agentops.bonnard.ai'
}

export async function get(path: string, baseUrl: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: getHeaders(),
  })
}

export async function post(path: string, body: unknown, baseUrl: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function put(path: string, body: unknown, baseUrl: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function del(path: string, baseUrl: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'DELETE',
    headers: getHeaders(),
  })
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const creds = loadCredentials()
  if (creds) {
    headers['Authorization'] = `Bearer ${creds.accessToken}`
  }
  return headers
}
