/** The React app talks to the bot through the site's own api.js (token,
 * base resolution, error shapes all come with it), plus a raw call() for
 * endpoints the site api object doesn't wrap (quests, pokemon internals). */
export { api, API_BASE, hasSession, setToken, getToken, ApiError } from '@site/assets/js/api.js'
import { API_BASE, getToken } from '@site/assets/js/api.js'

export const signedIn = () => hasSessionSafe()

function hasSessionSafe() {
  try { return !!localStorage.getItem('astral:token') } catch { return false }
}

/** Raw fetch against the API with the stored bearer token. */
export async function call(path, opts = {}) {
  const token = getToken() || (() => { try { return localStorage.getItem('astral:token') } catch { return null } })()
  const res = await fetch(API_BASE + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

export const pk = {
  overview: () => call('/pokemon/overview'),
  party: () => call('/pokemon/party'),
  bag: () => call('/pokemon/bag'),
  mons: (limit = 100) => call(`/pokemon/mons?limit=${limit}`),
  tower: () => call('/pokemon/tower'),
}
