/**
 * api.js — the only place in the frontend that talks to the bot's API.
 *
 * Deployment shape: this bundle is static and lives on Vercel, while the API
 * runs inside the bot process on the VPS behind Cloudflare, so every call is
 * cross-origin.
 *
 * Auth is bearer-token-first by design: the API sets a session cookie too, but
 * it's SameSite=None on a third-party origin, which browsers increasingly drop
 * (see the note at lib/api-server.js issueSession). So we keep the token from
 * verify-otp in localStorage and send it as `Authorization: Bearer` — the
 * cookie is the fallback, not the other way round.
 *
 * Override the target without editing this file by setting
 * `window.ASTRAL_API_BASE` before this script loads, or by adding
 * `?api=https://host` to the URL once (it's remembered) — handy for pointing a
 * preview deploy at a local bot.
 */

const DEFAULT_BASE = 'https://animeastral.qzz.io'
const TOKEN_KEY = 'astral:token'

function resolveBase() {
  const fromQuery = new URLSearchParams(location.search).get('api')
  if (fromQuery) {
    try { localStorage.setItem('astral:api', fromQuery) } catch {}
    return fromQuery.replace(/\/+$/, '')
  }
  if (window.ASTRAL_API_BASE) return String(window.ASTRAL_API_BASE).replace(/\/+$/, '')
  try {
    const saved = localStorage.getItem('astral:api')
    if (saved) return saved.replace(/\/+$/, '')
  } catch {}
  // Bot and site on the same host (local dev) — same-origin, no base needed.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return ''
  return DEFAULT_BASE
}

export const API_BASE = resolveBase()

/* ───────────────────────────── session token ───────────────────────────── */

let token = null
try { token = localStorage.getItem(TOKEN_KEY) } catch {}

export function getToken() { return token }

export function setToken(next) {
  token = next || null
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

/** True when we hold a token. Says nothing about whether it's still valid. */
export function hasSession() { return !!token }

/* ────────────────────────────── error type ─────────────────────────────── */

/** Thrown for any non-2xx response, carrying the server's own message. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = null, retryAfterMs = null, body = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAfterMs = retryAfterMs
    this.body = body
  }
  /** The network/CORS layer failed, not the API itself. */
  get isOffline() { return this.status === 0 }
  /** Signed out, or the token expired. */
  get isAuth() { return this.status === 401 }
}

/* ──────────────────────── reachability broadcast ───────────────────────── */

const connectionListeners = new Set()
const authListeners = new Set()

/** Subscribe to reachability changes so the UI can show the offline banner. */
export function onConnectionChange(fn) {
  connectionListeners.add(fn)
  return () => connectionListeners.delete(fn)
}

/** Fires when a request 401s — the app uses this to drop back to signed-out. */
export function onAuthLost(fn) {
  authListeners.add(fn)
  return () => authListeners.delete(fn)
}

let online = true
function setOnline(next) {
  if (online === next) return
  online = next
  for (const fn of connectionListeners) { try { fn(next) } catch {} }
}

export function isOnline() { return online }

/* ───────────────────────────── core request ────────────────────────────── */

/**
 * `timeoutMs` guards against a hung VPS: without it a dead API leaves spinners
 * running forever, which reads as a broken site rather than a brief outage.
 */
async function request(path, { method = 'GET', body = null, timeoutMs = 12_000, auth = true } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    clearTimeout(timer)
    setOnline(false)
    const aborted = err?.name === 'AbortError'
    throw new ApiError(
      aborted ? 'The server took too long to respond.' : 'Cannot reach the server.',
      { status: 0, code: aborted ? 'timeout' : 'network' },
    )
  }
  clearTimeout(timer)
  setOnline(true)

  // 204 and other empty bodies are legitimate — don't try to parse them.
  const text = await res.text()
  let payload = null
  if (text) {
    try { payload = JSON.parse(text) } catch { payload = { error: text } }
  }

  if (!res.ok) {
    // The API reports failures as { ok:false, error }. Older/proxy errors may
    // use `message`, and Cloudflare can return HTML — hence the fallbacks.
    const message = payload?.error ?? payload?.message ?? `Request failed (${res.status})`
    if (res.status === 401) {
      setToken(null)
      for (const fn of authListeners) { try { fn() } catch {} }
    }
    throw new ApiError(message, {
      status: res.status,
      code: payload?.code ?? null,
      retryAfterMs: payload?.retryAfterMs ?? null,
      body: payload,
    })
  }

  return payload
}

const get = (p) => request(p)
const post = (p, body) => request(p, { method: 'POST', body })
const patch = (p, body) => request(p, { method: 'PATCH', body })
const del = (p) => request(p, { method: 'DELETE' })

/* ───────────────────────────── public data ─────────────────────────────── */

export const api = {
  health: () => get('/health'),

  /** Server name, prefix, support link, bot number, class + race lists. */
  meta: () => get('/meta'),

  /** Aggregate counts for the home page. */
  stats: () => get('/stats'),

  /**
   * @param {'level'|'floor'|'season'|'fame'|'wealth'|'wins'} board
   * Includes `you` (your own standing) when a session is attached.
   */
  leaderboard: (board = 'level', limit = 50) =>
    get(`/leaderboard?board=${encodeURIComponent(board)}&limit=${limit}`),

  /** Tapping a leaderboard row: public stats + public alerts, by opaque uid. */
  player: (uid) => get(`/players/${encodeURIComponent(uid)}`),

  characters: () => get('/characters'),
  character: (id) => get(`/characters/${encodeURIComponent(id)}`),

  season: () => get('/season'),
  seasonTier: (tier) => get(`/season/tier/${encodeURIComponent(tier)}`),

  /** Plans + payment details. Served at runtime so prices are never stale. */
  premium: () => get('/premium'),

  /* ──────────────────────────────── auth ───────────────────────────────── */

  /** Sends the 6-digit code to the player's WhatsApp DM. */
  requestOtp: (phone) => post('/auth/request-otp', { phone }),

  /**
   * Exchanges a code for a session. Stores the bearer token on success.
   * `needsRegistration` means the number is verified but has no character yet.
   */
  verifyOtp: async (phone, code) => {
    const out = await post('/auth/verify-otp', { phone, code })
    if (out?.token) setToken(out.token)
    return out
  },

  /** Completes a character for an OTP-verified number. Needs the session. */
  register: (payload) => post('/auth/register', payload),

  /**
   * Boot call. Never 401s — returns { signedIn, needsRegistration, player }.
   * A token the server no longer accepts comes back as signedIn:false, so we
   * drop it here rather than retrying with it on every later request.
   */
  session: async () => {
    const out = await get('/auth/session')
    if (out && !out.signedIn && token) setToken(null)
    return out
  },

  logout: async () => {
    try { return await post('/auth/logout') }
    finally { setToken(null) }
  },

  /* ───────────────────────────── signed-in ─────────────────────────────── */

  me: () => get('/me'),

  /** Standings across all six boards, for the profile page. */
  myRankings: () => get('/me/rankings'),

  /** The only mutation the site can make to a player. Max 9 words. */
  updateBio: (bio) => patch('/me', { bio }),

  /**
   * Derived alerts first (things that still need doing, not dismissable),
   * then stored history. See lib/api-server.js for why they're merged.
   */
  notifications: () => get('/notifications'),
  markNotificationRead: (id) => post(`/notifications/${encodeURIComponent(id)}/read`),
  markAllNotificationsRead: () => post('/notifications/read-all'),
  deleteNotification: (id) => del(`/notifications/${encodeURIComponent(id)}`),
  clearNotifications: () => del('/notifications'),
}

