/**
 * shape.js - defends the UI against payloads it hasn't seen.
 *
 * Every phone page (wallet, storage, progress, Pokémon) talks
 * to routes that live in the bot, not in this repo. The bot's exact envelopes
 * aren't documented anywhere we can read, so the first live render produced the
 * predictable mess: `NaN` where a number was wrapped in an object, `0` where the
 * field had a different name, `null` printed as text, and every guild and empire
 * wearing the same fallback image.
 *
 * Rather than hard-code guesses, every page reads through these helpers:
 *
 *   pick()      - first matching key, also looking one level into common
 *                 wrappers (balances, wallet, stats, counts, data, ...)
 *   toNum()     - a number out of 12, "1,240", { amount: 900 }, null -> fallback
 *   listOf()    - an array out of { items }, or the array itself
 *   imgOf()     - an image URL out of the six spellings the bot might use
 *   cleanText() - strips template leftovers (`{{name}}` -> `name`)
 *   isOwned()   - a boolean out of true, 1, "yes", { owned: true }, [...]
 *
 * Nothing here invents data: a value that can't be read falls back, and the
 * caller decides whether to hide the row or say "not available".
 */

/** Keys the bot is likely to have wrapped a resource in. */
const WRAPPERS = ['balances', 'wallet', 'stats', 'counts', 'totals', 'summary',
  'data', 'result', 'storage', 'chests', 'profile', 'player']

const has = (o, k) => o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)

/**
 * First present, non-empty value for any of `keys` on `obj`, or one level
 * inside a known wrapper. Returns undefined when nothing matches - callers use
 * that to decide "hide this" rather than printing a guess.
 */
export function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) {
    if (has(obj, k) && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]
  }
  for (const w of WRAPPERS) {
    const child = obj[w]
    if (!child || typeof child !== 'object' || Array.isArray(child)) continue
    for (const k of keys) {
      if (has(child, k) && child[k] !== undefined && child[k] !== null && child[k] !== '') return child[k]
    }
  }
  return undefined
}

/**
 * A finite number out of whatever arrived.
 *
 * Handles numbers, numeric strings (including "1,240" and "12 000"), bigint,
 * `{ amount | value | balance | total | count | qty }`, and arrays of one. Returns
 * `fallback` for anything else - never NaN, which is what the wallet was
 * printing before this existed.
 */
export function toNum(value, fallback = null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'bigint') return Number(value)
  if (value == null) return fallback
  if (Array.isArray(value)) return value.length ? toNum(value[0], fallback) : fallback
  if (typeof value === 'object') {
    for (const k of ['amount', 'value', 'balance', 'total', 'count', 'qty', 'quantity', 'current', 'available']) {
      if (has(value, k)) {
        const n = toNum(value[k], null)
        if (n != null) return n
      }
    }
    return fallback
  }
  // Strip grouping separators (1,240 / 1 240 / 1_240) and currency noise.
  const cleaned = String(value).replace(/[\s,_]/g, '').replace(/[^\d.eE+-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : fallback
}

/** Same as toNum but always resolves to a number, for display. */
export const counted = (value, fallback = 0) => toNum(value, fallback) ?? fallback

/** An array out of `{ items: [...] }`, or the array itself. */
export function listOf(payload, keys = []) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  for (const k of keys) {
    if (Array.isArray(payload[k])) return payload[k]
  }
  for (const w of WRAPPERS) {
    const child = payload[w]
    if (!child || typeof child !== 'object') continue
    for (const k of keys) if (Array.isArray(child[k])) return child[k]
  }
  // Last resort: the first array of objects that isn't a wrapper of scalars.
  for (const v of Object.values(payload)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v
  }
  return []
}

const IMAGE_KEYS = ['image', 'imageUrl', 'imageURL', 'imagePath', 'image_path', 'img', 'icon',
  'iconUrl', 'iconPath', 'crest', 'emblem', 'banner', 'bannerUrl', 'art', 'artwork', 'artworkUrl',
  'artPath', 'sprite', 'spriteUrl', 'spritePath', 'thumbnail', 'thumb', 'photo', 'avatar',
  'avatarUrl', 'picture', 'url']

/** An image URL out of the spellings above, including PokeAPI sprite shapes. */
export function imgOf(obj) {
  if (!obj) return ''
  if (typeof obj === 'string') return /^(https?:)?\/\/|^data:|^\//.test(obj) ? obj : ''
  const direct = pick(obj, IMAGE_KEYS)
  if (typeof direct === 'string' && /^(https?:)?\/\/|^data:|^\//.test(direct)) return direct
  // PokeAPI: sprites.other['official-artwork'].front_default, or sprites.front_default
  const sprites = obj.sprites ?? obj.pokemon?.sprites
  if (sprites && typeof sprites === 'object') {
    const official = sprites.other?.['official-artwork']?.front_default
      ?? sprites.other?.home?.front_default
    if (typeof official === 'string' && official) return official
    if (typeof sprites.front_default === 'string' && sprites.front_default) return sprites.front_default
  }
  return ''
}

/**
 * Strips template leftovers and control characters from server strings.
 *
 * Live guild names came back with the bot's own interpolation braces in them
 * ("Ashen Court}}"), which then rendered literally on every card.
 */
export function cleanText(value, fallback = '') {
  if (value == null) return fallback
  let s = String(value)
  // {{something}} -> something (keep the inner word rather than deleting it)
  s = s.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, '$1')
  s = s.replace(/[{}]/g, '')
  s = s.replace(/[\u0000-\u001f\u007f]/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s || fallback
}

/** "member"/"members" for a count, without the 1 members bug. */
export const plural = (n, one, many = `${one}s`) => (counted(n) === 1 ? one : many)

/** A boolean out of the many ways a bot says "you own this". */
export function isOwned(value) {
  if (value == null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') return /^(true|yes|1|owned|unlocked|active)$/i.test(value.trim())
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    for (const k of ['owned', 'unlocked', 'active', 'purchased', 'has', 'enabled']) {
      if (has(value, k)) return isOwned(value[k])
    }
    const n = toNum(value, null)
    if (n != null) return n > 0
    return Object.keys(value).length > 0
  }
  return false
}

