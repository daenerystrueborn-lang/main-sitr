/* Shared helpers for the app pages. */
import { getToken, setToken, API_BASE, ApiError } from '../js/api.js'
import { esc, num } from '../js/ui.js'

export const $ = (s, r = document) => r.querySelector(s)
export const $$ = (s, r = document) => [...r.querySelectorAll(s)]
export const route = () => location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0] || 'home'
export const signedIn = () => !!getToken()
export const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** Talks to the bot's API with the signed-in token (same server + auth as the site). */
async function send(path, { method = 'GET', body = null } = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 15000)
  let res
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method, signal: ctl.signal, credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    throw new ApiError(e?.name === 'AbortError' ? 'The server took too long.' : 'Cannot reach the server.', { status: 0, code: 'network' })
  } finally { clearTimeout(timer) }
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok || data?.ok === false) {
    if (res.status === 401) setToken(null)
    throw new ApiError(data?.error || `Request failed (${res.status})`, { status: res.status, code: data?.code ?? null, body: data })
  }
  return data
}
/* Short-lived cache for Pokémon reads so tabs and sheets reopen instantly.
   Any write clears it; live battle state is never cached. */
const CACHE = new Map(), TTL = 30000
const cacheable = (p) => p.startsWith('/pokemon') && !p.startsWith('/pokemon/battle')
export const invalidate = () => CACHE.clear()
export function call(path, opts = {}) {
  if ((opts.method ?? 'GET') !== 'GET') { CACHE.clear(); return send(path, opts).finally(() => CACHE.clear()) }
  if (!cacheable(path)) return send(path, opts)
  const hit = CACHE.get(path)
  if (hit && Date.now() - hit.t < TTL) return hit.v
  const v = send(path, opts)
  CACHE.set(path, { t: Date.now(), v })
  v.catch(() => CACHE.delete(path))
  return v
}
/** Tries each route until one exists (404/405 move on, anything else is a real error). */
async function firstRoute(routes) {
  let last
  for (const [path, opts] of routes) {
    try { return await call(path, opts) } catch (e) { last = e; if (e.status !== 404 && e.status !== 405) throw e }
  }
  if (last) last.message = 'Move editing is not available on the bot yet.'
  throw last
}
const mp = (id) => `/pokemon/mons/${encodeURIComponent(id)}`
const P = (m, b) => ({ method: m, body: b })
export const pk = {
  meta: () => call('/pokemon/meta'),
  overview: () => call('/pokemon/overview'),
  tower: () => call('/pokemon/tower'),
  starter: (dexId) => call('/pokemon/starter', P('POST', { dexId })),
  heal: () => call('/pokemon/heal', P('POST')),
  hunt: (region) => call('/pokemon/hunt', P('POST', region ? { region } : {})),
  battle: () => call('/pokemon/battle'),
  act: (a) => call('/pokemon/battle/act', P('POST', a)),
  forfeit: () => call('/pokemon/battle/forfeit', P('POST')),
  challenge: (stage) => call('/pokemon/tower/challenge', P('POST', { stage })),
  // setup + care
  party: () => call('/pokemon/party'),
  mons: (q = '') => call(`/pokemon/mons?limit=100${q}`),
  mon: (id) => call(`/pokemon/mons/${encodeURIComponent(id)}`),
  evolution: (id) => call(`/pokemon/mons/${encodeURIComponent(id)}/evolution`),
  feed: (id) => call(`/pokemon/mons/${encodeURIComponent(id)}/feed`, P('POST')),
  train: (id, stat) => call(`/pokemon/mons/${encodeURIComponent(id)}/train`, P('POST', { stat })),
  hold: (id, itemId) => call(`/pokemon/mons/${encodeURIComponent(id)}/hold`, P('POST', { itemId })),
  unhold: (id) => call(`/pokemon/mons/${encodeURIComponent(id)}/unhold`, P('POST')),
  evolve: (id, itemId) => call(`/pokemon/mons/${encodeURIComponent(id)}/evolve`, P('POST', itemId ? { itemId } : {})),
  setMain: (id) => call(`/pokemon/mons/${encodeURIComponent(id)}/main`, P('POST')),
  setParty: (ids) => call('/pokemon/party', P('PUT', { ids })),
  partyAction: (action, pokemonId) => call('/pokemon/party', P('POST', { action, pokemonId })),
  learnset: (id) => firstRoute([[`${mp(id)}/moves`], [`${mp(id)}/learnset`]]),
  setMoves: (id, moves) => firstRoute([[`${mp(id)}/moves`, P('PUT', { moves })], [`${mp(id)}/moves`, P('POST', { moves })], [`${mp(id)}/moves/set`, P('POST', { moves })]]),
  bag: () => call('/pokemon/bag'),
  useItem: (itemId, monId) => call('/pokemon/bag/use', P('POST', { itemId, monId })),
  shop: () => call('/pokemon/shop'),
  importBag: () => call('/pokemon/bag/import', P('POST')),
  buy: (id, qty = 1) => call('/pokemon/shop/buy', P('POST', { id, qty })),
}

export const TYPE_COLOR = { normal:'#a8a77a', fire:'#ee8130', water:'#6390f0', electric:'#f7d02c', grass:'#7ac74c', ice:'#96d9d6', fighting:'#c22e28', poison:'#a33ea1', ground:'#e2bf65', flying:'#a98ff3', psychic:'#f95587', bug:'#a6b91a', rock:'#b6a136', ghost:'#735797', dragon:'#6f35fc', dark:'#705746', steel:'#b7b7ce', fairy:'#d685ad' }
export const typeChip = (t) => `<span class="pk-type" style="--tc:${TYPE_COLOR[String(t).toLowerCase()] ?? '#888'}">${esc(t)}</span>`
export const pctOf = (hp, max) => (max > 0 ? Math.max(0, Math.min(100, Math.round((hp / max) * 100))) : 0)
export const hpClass = (pct) => (pct > 50 ? 'ok' : pct > 20 ? 'mid' : 'low')
export const hpBar = (hp, max) => { const p = pctOf(hp, max); return `<div class="pk-hp"><i class="${hpClass(p)}" style="width:${p}%"></i></div>` }

export function fail(host, e, retry) {
  host.innerHTML = `<div class="pk-card" style="text-align:center"><p>${esc(e?.message || 'Something went wrong.')}</p><button class="btn btn-gold" id="pkRetry">Try again</button></div>`
  $('#pkRetry', host)?.addEventListener('click', retry)
}

/** Bottom-sheet picker used for "use on which Pokémon?" and the avatar chooser. */
export function openSheet(html, onMount, onClose) {
  closeSheet(true)
  const wrap = document.createElement('div')
  wrap.className = 'pk-modal'
  wrap.innerHTML = `<div class="pk-modal-scrim"></div><div class="pk-modal-box">${html}</div>`
  wrap._onClose = onClose
  document.body.appendChild(wrap)
  requestAnimationFrame(() => wrap.classList.add('open'))
  $('.pk-modal-scrim', wrap).addEventListener('click', () => closeSheet())
  onMount?.($('.pk-modal-box', wrap), closeSheet)
  return wrap
}
/** silent = replacing one sheet with another, so skip the close callbacks. */
export function closeSheet(silent = false) {
  $$('.pk-modal').forEach(m => { m.remove(); if (!silent) m._onClose?.() })
}

export { esc, num }
