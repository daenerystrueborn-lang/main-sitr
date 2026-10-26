/**
 * api.js - the only place in the frontend that talks to the bot's API.
 *
 * Deployment shape: this bundle is static and lives on Vercel, while the API
 * runs inside the bot process on the VPS behind Cloudflare, so every call is
 * cross-origin.
 *
 * Auth is bearer-token-first by design: the API sets a session cookie too, but
 * it's SameSite=None on a third-party origin, which browsers increasingly drop
 * (see the note at lib/api-server.js issueSession). So we keep the token from
 * verify-otp in localStorage and send it as `Authorization: Bearer` - the
 * cookie is the fallback, not the other way round.
 *
 * Override the target without editing this file by setting
 * `window.ASTRAL_API_BASE` before this script loads, or by adding
 * `?api=https://host` to the URL once (it's remembered) - handy for pointing a
 * preview deploy at a local bot.
 */

const DEFAULT_BASE = 'https://astral-bot-production-afb0.up.railway.app'
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
  // Bot and site on the same host (local dev) - same-origin, no base needed.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return ''
  return DEFAULT_BASE
}

export const API_BASE = resolveBase()

/**
 * Base URL for the ImgBB upload proxy (a small Vercel serverless function -
 * see the astral-imgbb-proxy project). The ImgBB key itself never lives in
 * this file or anywhere else in the frontend; it stays server-side in that
 * proxy's environment variables. Override with `window.ASTRAL_IMGBB_PROXY`
 * or `?imgbbProxy=https://host` (remembered the same way ?api= is).
 */
function resolveImgbbProxyBase() {
  const fromQuery = new URLSearchParams(location.search).get('imgbbProxy')
  if (fromQuery) {
    try { localStorage.setItem('astral:imgbbProxy', fromQuery) } catch {}
    return fromQuery.replace(/\/+$/, '')
  }
  if (window.ASTRAL_IMGBB_PROXY) return String(window.ASTRAL_IMGBB_PROXY).replace(/\/+$/, '')
  try {
    const saved = localStorage.getItem('astral:imgbbProxy')
    if (saved) return saved.replace(/\/+$/, '')
  } catch {}
  // Fill in your deployed proxy's URL here once it's live, e.g.
  // 'https://astral-imgbb-proxy.vercel.app'
  return 'https://proxy-astral-api-image.vercel.app'
}

export const IMGBB_PROXY_BASE = resolveImgbbProxyBase()

/**
 * Uploads an image to ImgBB via our own proxy (never talks to ImgBB
 * directly - no API key in the browser) and returns the hosted URL.
 */
export async function uploadToImgbb(dataUrl, name) {
  if (!IMGBB_PROXY_BASE) {
    throw new Error('Image host isn\u2019t configured yet - set ASTRAL_IMGBB_PROXY.')
  }
  const res = await fetch(`${IMGBB_PROXY_BASE}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl, name }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || 'Image upload failed.')
  }
  return data.url
}

/* ─────────────────────── Pokémon home-page showcase ────────────────────── */

const POKEMON_API_BASE = 'https://pokeapi.co/api/v2'
// Bumped from 'astral:sun-moon-pokemon' when Solgaleo was added. The entry
// below caches for a full day, so reusing the old key would have kept every
// returning visitor on the seven-strong roster until their cache aged out -
// which looks exactly like the new Pokemon never shipped. Bump this suffix
// again on any future change to the id list.
const POKEMON_CACHE_KEY = 'astral:sun-moon-pokemon:v2'
// Rowlet, Litten, Popplio (the Alola starters), Mimikyu, Tapu Koko, Cosmog,
// Solgaleo and Necrozma. Solgaleo is Cosmog's final form and the Sun mascot,
// so it belongs beside the Cosmog already here.
const SUN_MOON_POKEMON_IDS = [722, 725, 728, 778, 785, 789, 791, 800]

/**
 * Loads a small Alola roster for the home page. These are the Gen VII
 * Pokémon associated with the Sun and Moon era, so the showcase matches the
 * two bots instead of showing an unrelated random list.
 *
 * The public PokéAPI is read-only and needs no key. Cache the normalized
 * response for a day so the home page stays fast and respectful of the API.
 */
export async function fetchSunMoonPokemon() {
  try {
    const cached = JSON.parse(localStorage.getItem(POKEMON_CACHE_KEY) || 'null')
    if (cached?.savedAt && Date.now() - cached.savedAt < 86_400_000 && Array.isArray(cached.items)) {
      return cached.items
    }
  } catch {}

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const responses = await Promise.all(SUN_MOON_POKEMON_IDS.map(async id => {
      const res = await fetch(`${POKEMON_API_BASE}/pokemon/${id}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`Pokémon request failed (${res.status})`)
      return res.json()
    }))

    const items = responses.map(pokemon => ({
      id: pokemon.id,
      name: pokemon.name,
      types: pokemon.types.map(entry => entry.type.name),
      image: pokemon.sprites?.other?.['official-artwork']?.front_default
        || pokemon.sprites?.front_default
        || '',
    }))

    try {
      localStorage.setItem(POKEMON_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items }))
    } catch {}
    return items
  } finally {
    clearTimeout(timer)
  }
}

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

/** Fires when a request 401s - the app uses this to drop back to signed-out. */
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
export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random generation is unavailable.')
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export async function request(path, { method = 'GET', body = null, timeoutMs = 12_000, auth = true, idempotencyKey = null } = {}) {
  // A caller can retain this key for an exact retry. No automatic write retries.
  const mutating = !['GET', 'HEAD'].includes(method)
  const mutationKey = mutating ? idempotencyKey || newIdempotencyKey() : null
  const serializedBody = body ? JSON.stringify(body) : undefined
  const retryBody = serializedBody ? JSON.parse(serializedBody) : null
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
        ...(body || mutating ? { 'Content-Type': 'application/json' } : {}),
        ...(mutationKey ? { 'Idempotency-Key': mutationKey } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: serializedBody,
    })
  } catch (err) {
    clearTimeout(timer)
    setOnline(false)
    const aborted = err?.name === 'AbortError'
    const failure = new ApiError(
      aborted ? 'The server took too long to respond.' : 'Cannot reach the server.',
      { status: 0, code: aborted ? 'timeout' : 'network' },
    )
    // Exact network retries reuse the original body and mutation key. Never
    // automatically retry combat, purchases or reward claims.
    failure.retry = () => request(path, { method, body: retryBody, timeoutMs, auth, idempotencyKey: mutationKey })
    throw failure
  }
  clearTimeout(timer)
  setOnline(true)

  // 204 and other empty bodies are legitimate - don't try to parse them.
  const text = await res.text()
  let payload = null
  if (text) {
    try { payload = JSON.parse(text) } catch { payload = { error: text } }
  }

  if (!res.ok || payload?.ok === false) {
    // The API reports failures as { ok:false, error }. Older/proxy errors may
    // use `message`, and Cloudflare can return HTML - hence the fallbacks.
    const message = payload?.error ?? payload?.message ?? `Request failed (${res.status})`
    if (res.status === 401) {
      setToken(null)
      for (const fn of authListeners) { try { fn() } catch {} }
    }
    throw new ApiError(message, {
      status: res.ok ? 400 : res.status,
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

/**
 * How the caller identifies the account a code is for.
 *
 * A plain string is a typed phone number, which is the sign-UP path. An object
 * carrying `handle` is an account already resolved from a character name by
 * lookupAccount(), which is the sign-IN path - the browser never sees the real
 * number, only the handle that stands for it.
 */
function otpTarget(target) {
  if (typeof target === 'string') return { phone: target }
  if (target?.handle) return { handle: target.handle }
  if (target?.phone) return { phone: target.phone }
  return {}
}

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

  /* ────────────────────────── character spins ──────────────────────────── */

  /**
   * Every spin banner the bot has registered, with your standing on each.
   * Session-optional: signed out, the per-player fields (spinsUsed, gems,
   * owned) come back null/false but each banner still describes itself, so a
   * visitor sees what they'd be spinning for. An empty list is normal - it
   * means no character is currently spinnable from the web.
   *
   * The odds are never in this payload - only the cost, the lifetime cap and
   * how far through it you are. The bot treats its dead zone and plateau as
   * secret on every surface, and the site is no exception.
   */
  spins: () => get('/spins'),

  /**
   * Pull the banner `count` times. The server clamps to the banner's own
   * per-pull cap and stops early on a win, on an empty wallet, or the moment
   * a one-of-one is claimed - so `results.length` is what actually happened,
   * not what was asked for.
   *
   * Refusals that cost nothing come back as 4xx with the reason: 402 (gems),
   * 409 (already owned / claimed / no spins left), 423 (owner froze it).
   */
  spinCharacter: (id, count = 1) => post(`/characters/${encodeURIComponent(id)}/spin`, { count }),

  season: () => get('/season'),
  seasonTier: (tier) => get(`/season/tier/${encodeURIComponent(tier)}`),

  /** Plans + payment details. Served at runtime so prices are never stale. */
  premium: () => get('/premium'),

  /* ──────────────────────────────── shop ───────────────────────────────── */

  /** The buyable catalog, grouped the same way the chat `.shop` groups it. */
  shop: () => get('/shop'),

  /**
   * Buy `qty` of one item. The response carries the new balance and the
   * restacked inventory, so a successful buy repaints without a refetch.
   */
  buyItem: (id, qty = 1) => post('/shop/buy', { id, qty }),

  /* ──────────────────────────────── cards ──────────────────────────────── */

  /** Tier pool metadata used by the mobile card showcase. */
  cardPrices: () => get('/cards/prices'),

  /**
   * Browse the card catalog.
   *
   * Proxied through the bot rather than called from the browser: the upstream
   * Cards API sends no CORS headers, so a direct fetch is discarded before JS
   * can read it. See the endpoint comment in lib/api-server.js.
   */
  cardCatalog: ({ page = 1, limit = 24, tier } = {}) =>
    get(`/cards/catalog?page=${page}&limit=${limit}${tier ? `&tier=${encodeURIComponent(tier)}` : ''}`),

  /* ──────────────────────────────── auth ───────────────────────────────── */

  /**
   * Step 1 of signing in: find the account behind a character name.
   *
   * Resolves to { name, level, rank, avatarUrl, maskedPhone, handle }. The
   * masked number is there so the player can confirm the account is theirs
   * before a code is sent; `handle` is an opaque short-lived token that stands
   * in for the account (and its real number) in the next two calls. 404s with
   * `found: false` when no character goes by that name.
   */
  lookupAccount: (name) => post('/auth/lookup', { name }),

  /**
   * Sends the 6-digit code to the account's WhatsApp DM.
   *
   * Pass the object from lookupAccount() to sign IN, or a typed phone number
   * string to sign UP - a new player has no name to look up yet.
   */
  requestOtp: (target) => post('/auth/request-otp', otpTarget(target)),

  /**
   * Exchanges a code for a session. Stores the bearer token on success.
   * `needsRegistration` means the account is verified but has no character yet.
   * `target` is whatever was handed to requestOtp().
   */
  verifyOtp: async (target, code) => {
    const out = await post('/auth/verify-otp', { ...otpTarget(target), code })
    if (out?.token) setToken(out.token)
    return out
  },

  /** Completes a character for an OTP-verified number. Needs the session. */
  register: (payload) => post('/auth/register', payload),

  /**
   * Boot call. Never 401s - returns { signedIn, needsRegistration, player }.
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

  /** Bio: max 9 words / 120 chars, same rule the bot's .setbio enforces. */
  updateBio: (bio) => patch('/me', { bio }),

  /**
   * Display name. Server-gated to once every 7 days (player.lastRenameAt) -
   * identical rules to the bot's .rename, so chat and web can't disagree.
   * Rejects with a 400 carrying `onCooldown` when it's too soon.
   */
  updateName: (name) => patch('/me', { name }),

  /**
   * Preference toggles. Every field is optional - send only what changed.
   * { hiddenFromLeaderboard?, mutedNotificationKinds?, dmNotifications? }
   */
  updateSettings: (patchBody) => patch('/me/settings', patchBody),

  /**
   * Profile picture / banner - the normal path. `dataUrl` is a base64 data URL
   * (see fileToDataUrl() below, which enforces the 5MB cap client-side); the
   * bot uploads it to ImgBB itself using its own server-side key.
   *
   * `kind` is 'pfp' or 'banner'. The server re-validates the bytes (not the
   * declared mime type) and rate-limits to one upload every 30s, so a 429 or
   * 400 here is normal and should be shown to the user rather than retried.
   */
  uploadImage: (kind, dataUrl) => post(`/me/${kind}`, { image: dataUrl }),

  /**
   * Same endpoint, but hands the bot a URL that's already hosted, for when the
   * bot couldn't do the ImgBB call itself and app.js fell back to the proxy.
   * The bot accepts `{ url }` as an alternative to `{ image }` and checks the
   * host is ImgBB before storing it.
   */
  uploadImageUrl: (kind, url) => post(`/me/${kind}`, { url }),

  /** Clears pfp or banner back to the default. */
  removeImage: (kind) => del(`/me/${kind}`),

  /** Signs out every device by bumping the player's session epoch. */
  revokeSessions: async () => {
    try { return await post('/me/sessions/revoke') }
    finally { setToken(null) }
  },

  /**
   * Derived alerts first (things that still need doing, not dismissable),
   * then stored history. See lib/api-server.js for why they're merged.
   */
  notifications: () => get('/notifications'),
  markNotificationRead: (id) => post(`/notifications/${encodeURIComponent(id)}/read`),
  markAllNotificationsRead: () => post('/notifications/read-all'),
  deleteNotification: (id) => del(`/notifications/${encodeURIComponent(id)}`),
  clearNotifications: () => del('/notifications'),

  /* ── inventory / equipment ──────────────────────────────────────────────
     The profile page reads the first 24 stacks off /me. The inventory manager
     needs the real paged list plus the writes, so it talks to these instead.

     `limit` is clamped by the server; the manager asks for 24 at a time so a
     phone isn't asked to paint a 300-stack grid in one go. */
  inventory: ({ category = '', cursor, limit = 24 } = {}) => {
    const q = new URLSearchParams()
    if (category) q.set('category', category)
    if (cursor) q.set('cursor', cursor)
    if (limit) q.set('limit', String(limit))
    const qs = q.toString()
    return get(`/me/inventory${qs ? `?${qs}` : ''}`)
  },
  inventoryItem: (instanceId) => get(`/me/inventory/${encodeURIComponent(instanceId)}`),
  useItem: (instanceId) => post('/me/inventory/use', { itemInstanceId: instanceId }),
  sellItem: (instanceId, qty = 1) => post('/me/inventory/sell', { itemInstanceId: instanceId, qty }),
  discardItem: (instanceId, qty = 1) =>
    post('/me/inventory/discard', { itemInstanceId: instanceId, qty, confirm: true }),

  equipment: () => get('/me/equipment'),
  equip: (instanceId, slot) => post('/me/equipment/equip', { itemInstanceId: instanceId, slot }),
  unequip: (slot) => post('/me/equipment/unequip', { slot }),

  /* ── storage ───────────────────────────────────────────────────────────
     `move` covers chest ⇄ inventory in both directions. The server decides
     what fits, so a slot count shown here is a preview, not a guarantee. */
  storage: () => get('/storage'),
  storageMove: ({ itemInstanceId, qty = 1, to }) =>
    post('/storage/move', { itemInstanceId, qty, to }),
  buyStorageChest: () => post('/storage/chest/buy'),
  buyEnderChest: () => post('/storage/ender/buy'),

  /* ── wallet ────────────────────────────────────────────────────────────
     Solars live in three places: carried, banked and vaulted. Each write
     returns the fresh balances, so the page repaints without a refetch. */
  wallet: () => get('/wallet'),
  walletLedger: () => get('/wallet/ledger'),
  bankMove: (amount) => post('/wallet/bank', { amount }),
  vaultMove: (amount) => post('/wallet/vault', { amount }),
  takeLoan: (amount) => post('/wallet/loan', { amount }),
  repayLoan: (amount) => post('/wallet/repay', { amount }),

  /* ── guilds ────────────────────────────────────────────────────────────
     `/guilds/me` is the only player-scoped read; everything else is public
     and browsable signed out, same as the shop. */
  guilds: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    const qs = q.toString()
    return get(`/guilds${qs ? `?${qs}` : ''}`)
  },
  myGuild: () => get('/guilds/me'),
  guild: (query) => get(`/guilds/${encodeURIComponent(query)}`),
  guildBoard: (query) => get(`/guilds/${encodeURIComponent(query)}/board`),
  guildShop: (query) => get(`/guilds/${encodeURIComponent(query)}/shop`),
  guildImage: (query) => `${API_BASE}/api/guilds/${encodeURIComponent(query)}/image`,

  /* ── empires ───────────────────────────────────────────────────────────── */
  empires: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    const qs = q.toString()
    return get(`/empires${qs ? `?${qs}` : ''}`)
  },
  myEmpire: () => get('/empires/me'),
  empire: (query) => get(`/empires/${encodeURIComponent(query)}`),

  /* ── progress ──────────────────────────────────────────────────────────── */
  quests: () => get('/quests'),
  claimQuest: (id) => post('/quests/claim', { id }),
  achievements: () => get('/achievements'),
  claimAchievement: (id) => post('/achievements/claim', { id }),
  progress: () => get('/progress'),

  /* ── pokémon ───────────────────────────────────────────────────────────
     Only /meta is open upstream. The rest is player-scoped, so every call
     here is made with the session token. */
  pokemonMeta: () => get('/pokemon/meta'),
  pokemonOverview: () => get('/pokemon/overview'),
  pokemonMons: () => get('/pokemon/mons'),
  pokemonMon: (id) => get(`/pokemon/mons/${encodeURIComponent(id)}`),
  pokemonParty: () => get('/pokemon/party'),
  pokemonDex: () => get('/pokemon/dex'),
  pokemonBag: () => get('/pokemon/bag'),
  pokemonShop: () => get('/pokemon/shop'),
  pokemonBuy: (id, qty = 1) => post('/pokemon/shop/buy', { id, qty }),
  pokemonHunt: () => post('/pokemon/hunt'),
  pokemonHeal: () => post('/pokemon/heal'),
  pokemonHold: (id, held) => post(`/pokemon/mons/${encodeURIComponent(id)}/${held ? 'hold' : 'unhold'}`),
  pokemonMain: (id) => post(`/pokemon/mons/${encodeURIComponent(id)}/main`),
  pokemonRename: (id, name) => post(`/pokemon/mons/${encodeURIComponent(id)}/rename`, { name }),
  pokemonProtect: (id) => post(`/pokemon/mons/${encodeURIComponent(id)}/protect`),
  pokemonFeed: (id) => post(`/pokemon/mons/${encodeURIComponent(id)}/feed`),
  pokemonEvolve: (id) => post(`/pokemon/mons/${encodeURIComponent(id)}/evolve`),

  /* ── events ────────────────────────────────────────────────────────────
     The season page's event cards hand out fixed rewards (that is why they
     are worth including at all). The claim is server-side and idempotent so
     a card can't be tapped twice for two payouts - the UI only ever shows
     what the server says was granted. */
  claimEvent: (id) => post('/events/claim', { id }),
}

/* ──────────────────────────── image helpers ─────────────────────────────── */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/**
 * Reads a File into a base64 data URL, rejecting anything oversized or of the
 * wrong type first.
 *
 * The size check is on the raw File, not the encoded string: base64 inflates
 * by ~4/3, so a 5MB file becomes ~6.7MB on the wire. The server's own limit is
 * set against the decoded bytes, and its body parser has headroom for the
 * inflation - checking the File here means the two agree.
 *
 * This is a convenience, not a security boundary. The server re-validates
 * everything, including sniffing the actual magic numbers, because the mime
 * type a browser reports is just a string.
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected.'))
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return reject(new Error('Please pick a PNG, JPEG, WebP or GIF.'))
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      return reject(new Error(`That image is ${mb}MB - the limit is 5MB.`))
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

