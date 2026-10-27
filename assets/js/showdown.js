/**
 * showdown.js - the Pokémon data and artwork that ship with this site.
 *
 * The standard sprite files and dex/move tables ship locally, so the core
 * Pokémon experience works offline. A server record may optionally provide
 * form-specific artwork (including a PokeAPI sprite object); no alternate-form
 * image is guessed when the payload does not identify one.
 *
 * The two tables are fetched once and kept for the life of the tab:
 *
 *   assets/data/pokemon/pokedex.json    1025 species - types, stats, abilities
 *   assets/data/pokemon/moves.json      every move, with type/power/accuracy
 *   assets/data/pokemon/learnsets.json  which moves a species can learn
 *
 * `learnsets.json` is only fetched when a species' detail sheet asks for it,
 * because it is the big one.
 */

const BASE = 'assets/data/pokemon'

/** Showdown's own type colours, used for every type chip on the site. */
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

/** The types the filter row offers, in the game's own order. */
export const ALL_TYPES = Object.keys(TYPE_COLORS).filter(t => t !== 'stellar' && t !== 'unknown')

/** The nine regions, by generation. */
export const REGIONS = [
  { gen: 1, key: 'kanto', label: 'Kanto' },
  { gen: 2, key: 'johto', label: 'Johto' },
  { gen: 3, key: 'hoenn', label: 'Hoenn' },
  { gen: 4, key: 'sinnoh', label: 'Sinnoh' },
  { gen: 5, key: 'unova', label: 'Unova' },
  { gen: 6, key: 'kalos', label: 'Kalos' },
  { gen: 7, key: 'alola', label: 'Alola' },
  { gen: 8, key: 'galar', label: 'Galar' },
  { gen: 9, key: 'paldea', label: 'Paldea' },
]

/**
 * Showdown's id scheme: lowercase alphanumerics, with the gender symbols folded
 * first so "Nidoran♀" is nidoranf rather than nidoran.
 */
export function showdownId(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u2640/g, 'f')
    .replace(/\u2642/g, 'm')
    .replace(/[^a-z0-9]/g, '')
}

/** A gender symbol is the only punctuation that carries meaning in a name. */
export const slugOf = (name) => showdownId(name)

/* ── sprite paths (local files) ───────────────────────────────────────────── */

/** Front sprite for a dex number. Empty when there's no number to draw. */
export function spriteUrl(num, { back = false } = {}) {
  const n = Number(num)
  if (!Number.isInteger(n) || n < 1 || n > 1025) return ''
  return back ? `assets/sprites/pokemon/back/${n}.png` : `assets/sprites/pokemon/${n}.png`
}

/**
 * A battler sprite from a species name or number: the back view for your own
 * side, the front for everything else.
 */
export function monSprite(nameOrNum, { back = false } = {}) {
  const n = typeof nameOrNum === 'number' ? nameOrNum : numOfName(nameOrNum)
  return n ? spriteUrl(n, { back }) : ''
}

/** Item icon, from the copied Showdown item sprites. Empty when not vendored. */
export function itemIcon(name) {
  const id = showdownId(name)
  if (!id) return ''
  // "Poké Ball" is pokeball.png locally; the table below is the short list of
  // icons that ship with the site.
  return ITEM_ICONS.has(id) ? `assets/sprites/items/${ITEM_ICON_FILE[id] ?? id}.png` : ''
}

/** The item icons in assets/sprites/items (file name -> showdown id). */
const ITEM_ICON_FILE = {
  pokeball: 'poke-ball', greatball: 'great-ball', ultraball: 'ultra-ball', masterball: 'master-ball',
  potion: 'potion', superpotion: 'super-potion', hyperpotion: 'hyper-potion', maxpotion: 'max-potion',
  fullrestore: 'full-restore', revive: 'revive', maxrevive: 'max-revive',
  antidote: 'antidote', burnheal: 'burn-heal', iceheal: 'ice-heal', paralyzeheal: 'paralyze-heal',
  awakening: 'awakening', fullheal: 'full-heal',
  oranberry: 'oran-berry', sitrusberry: 'sitrus-berry', lumberry: 'lum-berry', cheriberry: 'cheri-berry',
  chestoberry: 'chesto-berry', pechaberry: 'pecha-berry', rawstberry: 'rawst-berry',
  aspearberry: 'aspear-berry', leppaberry: 'leppa-berry', razzberry: 'razz-berry',
  nanabberry: 'nanab-berry', pinapberry: 'pinap-berry',
  freshwater: 'fresh-water', sodapop: 'soda-pop', lemonade: 'lemonade', moomoomilk: 'moomoo-milk',
  rarecandy: 'rare-candy', expcandyxs: 'exp-candy-xs', expcandys: 'exp-candy-s',
  expcandym: 'exp-candy-m', expcandyl: 'exp-candy-l', expcandyxl: 'exp-candy-xl',
  toxicorb: 'toxic-orb', flameorb: 'flame-orb', lifeorb: 'life-orb', leftovers: 'leftovers',
  choiceband: 'choice-band', choicescarf: 'choice-scarf', choicespecs: 'choice-specs',
  focussash: 'focus-sash', assaultvest: 'assault-vest', rockyhelmet: 'rocky-helmet',
  eviolite: 'eviolite', lightball: 'light-ball', ovalstone: 'oval-stone', everstone: 'everstone',
  luckyegg: 'lucky-egg', amuletcoin: 'amulet-coin', soothebell: 'soothe-bell', expshare: 'exp-share',
  pokedoll: 'poke-doll', repel: 'repel', superrepel: 'super-repel', maxrepel: 'max-repel',
}
const ITEM_ICONS = new Set(Object.keys(ITEM_ICON_FILE))

/* ── the tables ───────────────────────────────────────────────────────────── */

let dexPromise = null
let movesPromise = null
let learnPromise = null

const cache = { dex: null, moves: null, learn: null }
const byNum = new Map()
const byName = new Map()

async function loadJson(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`)
  return res.json()
}

/** The 1025 species, sorted by dex number. */
export function loadDex() {
  if (cache.dex) return Promise.resolve(cache.dex)
  dexPromise ??= loadJson('pokedex.json').then(list => {
    cache.dex = list
    for (const s of list) {
      byNum.set(s.n, s)
      byName.set(showdownId(s.name), s)
      byName.set(showdownId(s.name.replace('-F', '♀').replace('-M', '♂')), s)
    }
    return list
  }).catch(err => { dexPromise = null; throw err })
  return dexPromise
}

/** Every move, keyed by showdown id. */
export function loadMoves() {
  if (cache.moves) return Promise.resolve(cache.moves)
  movesPromise ??= loadJson('moves.json').then(map => { cache.moves = map; return map })
    .catch(err => { movesPromise = null; throw err })
  return movesPromise
}

/** Which moves a species can learn (ids into the move table). */
export function loadLearnsets() {
  if (cache.learn) return Promise.resolve(cache.learn)
  learnPromise ??= loadJson('learnsets.json').then(map => { cache.learn = map; return map })
    .catch(err => { learnPromise = null; throw err })
  return learnPromise
}

/** The species record for a dex number, if the dex is loaded. */
export const speciesByNum = (num) => byNum.get(Number(num)) ?? null

/** The species record for a name ("Mr. Mime", "Nidoran♀", "pikachu"). */
export const speciesByName = (name) => byName.get(showdownId(name)) ?? null

/** A name's dex number, if the dex is loaded. */
export const numOfName = (name) => speciesByName(name)?.n ?? 0

/** A species' base-stat total. */
export const statTotal = (species) => species ? species.s.reduce((a, b) => a + b, 0) : 0

/** The region a species belongs to, from its generation. */
export const regionOf = (species) => REGIONS.find(r => r.gen === species?.g) ?? null

/**
 * Search the dex.
 *
 * `q` matches a name or a dex number, `type` a single type, `gen` a region.
 * Sorting is by number (the default), name, or base-stat total.
 */
export function searchDex(list, { q = '', type = '', gen = 0, sort = 'num' } = {}) {
  const text = String(q).trim().toLowerCase()
  const numMatch = /^#?\d+$/.test(text) ? Number(text.replace('#', '')) : null
  let out = list.filter(s => {
    if (type && !s.t.some(t => t.toLowerCase() === type)) return false
    if (gen && s.g !== gen) return false
    if (!text) return true
    if (numMatch != null) return s.n === numMatch
    return showdownId(s.name).includes(showdownId(text))
      || s.name.toLowerCase().includes(text)
      || s.t.some(t => t.toLowerCase().startsWith(text))
  })
  if (sort === 'name') out = [...out].sort((a, b) => a.name.localeCompare(b.name))
  else if (sort === 'bst') out = [...out].sort((a, b) => statTotal(b) - statTotal(a) || a.n - b.n)
  return out
}

/**
 * A species' evolution family, as chains: [[Pichu], [Pikachu], [Raichu, Raichu-Alola]].
 *
 * Built from `prevo`/`evos` in the table rather than hard-coded, so it follows
 * whatever the data says. Stages are ordered from the root down.
 */
export function evolutionChain(species, list) {
  if (!species || !list) return []
  const bySlug = new Map(list.map(s => [showdownId(s.name), s]))
  const chains = new Map()
  for (const s of list) {
    const key = showdownId(s.pre ?? s.name)
    if (!chains.has(key)) chains.set(key, [])
    chains.get(key).push(s)
  }
  // Walk up to the root, then down through every branch.
  let root = species
  const seen = new Set()
  while (root?.pre && bySlug.has(root.pre) && !seen.has(root.pre)) {
    seen.add(root.pre)
    root = bySlug.get(root.pre)
  }
  const stages = []
  const walk = (s, depth) => {
    if (!s || depth > 5) return
    stages[depth] ??= []
    if (!stages[depth].some(x => x.n === s.n)) stages[depth].push(s)
    for (const evo of s.evo ?? []) {
      const next = bySlug.get(evo)
      if (next) walk(next, depth + 1)
    }
  }
  walk(root, 0)
  return stages.filter(Boolean)
}
