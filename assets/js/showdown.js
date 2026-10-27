/**
 * showdown.js - Pokémon art and data from Pokémon Showdown.
 *
 * https://github.com/smogon/pokemon-showdown is the source of every sprite this
 * site draws: the front and back battlers, the item icons and the type badges
 * all follow the ids the Showdown client itself uses, so a species that exists
 * in Showdown always has art here without a lookup.
 *
 * Two rules keep this honest:
 *
 *   1. Nothing is guessed. A name that has no Showdown id gets no picture, and
 *      the caller shows a glyph instead of borrowing another Pokémon's art.
 *   2. Nothing is fetched until it's needed. Sprite URLs are built from strings;
 *      only the dex/move tables (for move types and stats) cost a request, and
 *      a failed one just means the page shows what the bot sent.
 */

/** The Showdown client's own asset host. */
export const SHOWDOWN_BASE = 'https://play.pokemonshowdown.com'
export const SHOWDOWN_SPRITES = `${SHOWDOWN_BASE}/sprites`
export const SHOWDOWN_DATA = `${SHOWDOWN_BASE}/data`

/**
 * Showdown's id scheme: lowercase letters and digits only.
 * "Mr. Mime" -> "mrmime", "Farfetch'd" -> "farfetchd", "Nidoran♀" -> "nidoranf".
 */
export function showdownId(name) {
  return String(name ?? '')
    .toLowerCase()
    // "Poké Ball" has to become "pokeball", not "pokball": fold the accent
    // before dropping punctuation.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u2640/g, 'f')
    .replace(/\u2642/g, 'm')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * A battler sprite.
 *
 * `animated` gives the gen-5 gifs the Showdown client animates; `back` is the
 * view from behind, which is what your own side of a battle shows. Static gen-5
 * PNGs are the fallback everywhere else because they are small and sharp.
 */
export function monSprite(name, { back = false, shiny = false, animated = false } = {}) {
  const id = showdownId(name)
  if (!id) return ''
  const dir = animated
    ? `ani${back ? '-back' : ''}${shiny ? '-shiny' : ''}`
    : `gen5${back ? '-back' : ''}${shiny ? '-shiny' : ''}`
  return `${SHOWDOWN_SPRITES}/${dir}/${id}.${animated ? 'gif' : 'png'}`
}

/** Item icon, used for the Pokémon bag and shop. */
export function itemIcon(name) {
  const id = showdownId(name)
  return id ? `${SHOWDOWN_SPRITES}/itemicons/${id}.png` : ''
}

/** Type badge ("Electric" -> sprites/types/Electric.png). */
export function typeIcon(type) {
  const label = String(type ?? '').trim()
  if (!label) return ''
  const pretty = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
  return `${SHOWDOWN_SPRITES}/types/${pretty}.png`
}

/**
 * Showdown's type colours, used for move buttons and the hit flash.
 * Same palette its own client paints the move list with.
 */
const TYPE_COLORS = {
  normal: '#A8A77A', fighting: '#C22E28', flying: '#A98FF3', poison: '#A33EA1',
  ground: '#E2BF65', rock: '#B6A136', bug: '#A6B91A', ghost: '#735797',
  steel: '#B7B7CE', fire: '#EE8130', water: '#6390F0', grass: '#7AC74C',
  electric: '#F7D02C', psychic: '#F95587', ice: '#96D9D6', dragon: '#6F35FC',
  dark: '#705746', fairy: '#D685AD', stellar: '#40B5A5', unknown: '#68A090',
}

/** A type's colour, or a neutral gold when the type isn't known. */
export function typeColor(type) {
  return TYPE_COLORS[String(type ?? '').trim().toLowerCase()] || '#c9a227'
}

/** Trainer sprite, for a character's portrait when one is wanted. */
export function trainerSprite(name) {
  const id = showdownId(name)
  return id ? `${SHOWDOWN_SPRITES}/trainers/${id}.png` : ''
}

/* ── dex + move tables ──────────────────────────────────────────────────────
   Showdown publishes these as JSON for its own client. They are loaded once,
   kept for a week, and treated as a bonus: the bot's battle payload is still
   the authority on what a mon knows and what a move does. */

const DEX_KEY = 'astral:showdown:dex:v1'
const MOVES_KEY = 'astral:showdown:moves:v1'
const WEEK = 604_800_000

const tables = { dex: null, moves: null }

function readCache(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null')
    if (raw?.savedAt && Date.now() - raw.savedAt < WEEK && raw.data) return raw.data
  } catch {}
  return null
}

function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })) } catch {}
}

async function loadTable(url, key, slot) {
  if (tables[slot]) return tables[slot]
  const cached = readCache(key)
  if (cached) { tables[slot] = cached; return cached }
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    tables[slot] = data
    writeCache(key, data)
    return data
  } catch {
    // No CORS, no network, or no route: the page carries on without it.
    return null
  }
}

/** The species table, keyed by Showdown id. */
export const showdownDex = () => loadTable(`${SHOWDOWN_DATA}/pokedex.json`, DEX_KEY, 'dex')

/** The move table, keyed by Showdown id. */
export const showdownMoves = () => loadTable(`${SHOWDOWN_DATA}/moves.json`, MOVES_KEY, 'moves')

/** A species entry if the table is already in hand (no request). */
export function speciesInfo(name) {
  const id = showdownId(name)
  return (id && tables.dex?.[id]) || null
}

/** A move's data if the table is already in hand (no request). */
export function moveInfo(name) {
  const id = showdownId(name)
  return (id && tables.moves?.[id]) || null
}

/**
 * Warms the move table so a battle can show a move's type and power.
 * Resolves to true only when the table is actually available.
 */
export async function warmMoveData() {
  return !!(await showdownMoves())
}
