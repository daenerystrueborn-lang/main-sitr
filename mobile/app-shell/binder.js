/* Card binder: your pulls, favorites and the full catalog as binder pages. Lives inside the Cards page.
   The server has no "my cards" list for the app yet, so "owned" means cards pulled in this app on this phone. */
import { api } from '../js/api.js'
import { esc, num } from '../js/ui.js'
import * as FB from './feedback.js'

const KEY = 'astral:binder:v1'
const empty = () => ({ pulls: {}, favs: {} })
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') ?? empty() } catch { return empty() } }
let S = read()
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)) } catch {} }

export const keyOf = (c) => String(c?.imageUrl ?? c?.image ?? c?.id ?? c?.title ?? '')
const slim = (c) => ({ title: String(c?.title ?? c?.name ?? 'Card'), tier: String(c?.tier ?? '').replace(/tier/i, '').trim(),
  series: c?.series && !/^none$/i.test(c.series) ? String(c.series) : '', imageUrl: c?.imageUrl ?? c?.image ?? '', stars: c?.stars ?? '' })
export const isFav = (c) => !!S.favs[keyOf(c)]
export function toggleFav(c) {
  const k = keyOf(c); if (!k) return false
  if (S.favs[k]) delete S.favs[k]; else S.favs[k] = slim(c)
  save(); FB.heart(); window.dispatchEvent(new CustomEvent('astral:binder')); return !!S.favs[k]
}
function addPull(c) {
  const k = keyOf(c); if (!k) return
  const cur = S.pulls[k]
  S.pulls[k] = cur ? { ...cur, n: cur.n + 1, at: Date.now() } : { ...slim(c), n: 1, at: Date.now() }
  save(); if (ui.on) render()
}
window.addEventListener('astral:pull', (e) => addPull(e.detail ?? {}))

const DEFAULT_TIERS = ['1', '2', '3', '4', '5', '6', 'S']
const ui = { on: false, mode: Object.keys(read().pulls).length ? 'collection' : 'all', tier: '', pools: {}, tiers: DEFAULT_TIERS, poolsLoaded: false,
  all: { list: [], page: 0, more: true, loading: false, err: '' } }
const rank = (t) => (String(t).toUpperCase() === 'S' ? 9 : Number(t) || 0)
const isVid = (u) => /\.(webm|mp4|m4v|mov)(\?|#|$)/i.test(String(u ?? ''))
const cards = new Map()
const tracking = () => Object.keys(S.pulls).length > 0

const art = (c) => !c.imageUrl ? '<span class="bn-ph">✦</span>'
  : isVid(c.imageUrl) ? `<video src="${esc(c.imageUrl)}#t=0.1" muted playsinline preload="metadata" onerror="this.remove()"></video>`
  : `<img src="${esc(c.imageUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`
function tile(c, owned) {
  const k = keyOf(c); cards.set(k, c)
  const mine = S.pulls[k], fav = !!S.favs[k]
  return `<div class="bn-tile ${owned ? 'own' : 'miss'}" data-k="${esc(k)}">
    <div class="bn-art">${art(c)}</div>
    ${c.tier ? `<span class="bn-tier">T${esc(String(c.tier).toUpperCase())}</span>` : ''}
    ${mine?.n > 1 ? `<span class="bn-n">×${num(mine.n)}</span>` : ''}
    <button type="button" class="bn-heart${fav ? ' on' : ''}" aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}">${fav ? '♥' : '♡'}</button>
    <b class="bn-name">${esc(c.title)}</b></div>`
}

let root, grid, chips, tabs, stats, more, note, seg, page
function list() {
  const byTier = (c) => !ui.tier || String(c.tier).toUpperCase() === ui.tier.toUpperCase()
  if (ui.mode === 'favorites') return Object.values(S.favs).filter(byTier).sort((a, b) => rank(b.tier) - rank(a.tier))
  if (ui.mode === 'all') return ui.all.list
  return Object.values(S.pulls).filter(byTier).sort((a, b) => rank(b.tier) - rank(a.tier) || b.at - a.at)
}
function render() {
  if (!root) return
  cards.clear()
  const pulls = Object.values(S.pulls), total = pulls.reduce((n, c) => n + c.n, 0)
  stats.innerHTML = tracking()
    ? `<div><b>${num(total)}</b><span>pulled</span></div><div><b>${num(pulls.length)}</b><span>unique</span></div><div><b>${num(Object.keys(S.favs).length)}</b><span>favorites</span></div>`
    : `<div><b>${num(Object.keys(S.favs).length)}</b><span>favorites</span></div>`
  stats.style.gridTemplateColumns = tracking() ? '' : '1fr'
  chips.innerHTML = ['', ...ui.tiers].map(t => {
    const have = t ? pulls.filter(c => String(c.tier).toUpperCase() === t.toUpperCase()).length : pulls.length, pool = t ? ui.pools[t] : 0
    return `<button type="button" class="bn-chip${ui.tier === t ? ' on' : ''}" data-tier="${esc(t)}">${t ? `T${esc(t)}` : 'All'}${tracking() ? `<small>${num(have)}${pool ? `/${num(pool)}` : ''}</small>` : pool ? `<small>${num(pool)}</small>` : ''}</button>`
  }).join('')
  tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === ui.mode))
  const items = list(), A = ui.all
  if (ui.mode === 'all') {
    grid.innerHTML = items.map(c => tile(c, !tracking() || !!S.pulls[keyOf(c)])).join('') + (A.loading ? '<div class="bn-load">Loading cards…</div>' : '')
    if (A.err) grid.innerHTML += `<div class="bn-empty">${esc(A.err)}</div>`
    more.hidden = !(A.more && !A.loading && items.length)
    note.textContent = tracking() ? 'Faded cards are ones you have not pulled in this app yet.' : 'Tap a card to inspect it. Tap the heart to keep it in your favorites.'
  } else {
    grid.innerHTML = items.length ? items.map(c => tile(c, true)).join('')
      : `<div class="bn-empty">${ui.mode === 'favorites' ? 'Tap the heart on a card to add it here.' : 'No pulled cards on this phone yet. Open All cards to browse the collection.'}</div>`
    more.hidden = true
    note.textContent = 'Your binder tracks cards pulled in this app on this phone.'
  }
}
async function loadAll(reset = false) {
  const A = ui.all
  if (A.loading) return
  if (reset) Object.assign(A, { list: [], page: 0, more: true, err: '' })
  if (!A.more) return
  A.loading = true; render()
  try {
    const out = await api.cardCatalog({ page: A.page + 1, limit: 24, tier: ui.tier || undefined })
    A.page += 1; A.list.push(...(out?.cards ?? []).map(slim)); A.more = !!out?.hasMore
  } catch (e) { A.err = e?.message ?? 'Could not load cards.' }
  A.loading = false; render()
}
async function loadPools() {
  if (ui.poolsLoaded) return
  ui.poolsLoaded = true
  try {
    const p = await api.cardPrices(), tiers = (p?.tiers ?? []).map(t => String(t.tier))
    if (tiers.length) ui.tiers = tiers
    for (const t of p?.tiers ?? []) if (t.poolSize) ui.pools[String(t.tier)] = Number(t.poolSize)
    render()
  } catch { ui.poolsLoaded = false }
}
function view(v) {
  ui.on = v === 'binder'
  page.classList.toggle('bn-on', ui.on); root.hidden = !ui.on
  seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === v))
  if (ui.on) { if (ui.mode === 'all' && !ui.all.list.length) loadAll(true); else render(); loadPools(); window.scrollTo({ top: 0 }) }
}

function init() {
  page = document.querySelector('#view-cards .page'); if (!page) return
  seg = document.createElement('div'); seg.className = 'bn-seg'
  seg.innerHTML = '<button type="button" class="on" data-view="vault">Browse</button><button type="button" data-view="binder">Binder</button>'
  root = document.createElement('div'); root.id = 'binderRoot'; root.className = 'bn'; root.hidden = true
  root.innerHTML = '<div class="bn-stats" id="bnStats"></div><div class="bn-chips" id="bnChips"></div>' +
    '<div class="bn-tabs" id="bnTabs"><button type="button" data-mode="collection">Collection</button><button type="button" data-mode="favorites">Favorites</button><button type="button" data-mode="all">All cards</button></div>' +
    '<div class="bn-grid" id="bnGrid"></div><button type="button" class="btn btn-secondary bn-more" id="bnMore" hidden>Load more</button><p class="bn-note" id="bnNote"></p>'
  page.insertBefore(root, page.firstChild); page.insertBefore(seg, root)
  stats = root.querySelector('#bnStats'); chips = root.querySelector('#bnChips'); tabs = root.querySelector('#bnTabs')
  grid = root.querySelector('#bnGrid'); more = root.querySelector('#bnMore'); note = root.querySelector('#bnNote')

  seg.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) view(b.dataset.view) })
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]'); if (!b) return
    ui.mode = b.dataset.mode; if (ui.mode === 'all' && !ui.all.list.length) loadAll(true); else render()
  })
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tier]'); if (!b) return
    ui.tier = b.dataset.tier; if (ui.mode === 'all') loadAll(true); else render()
  })
  more.addEventListener('click', () => loadAll(false))
  grid.addEventListener('click', (e) => {
    const t = e.target.closest('.bn-tile'); if (!t) return
    const c = cards.get(t.dataset.k); if (!c) return
    if (e.target.closest('.bn-heart')) {
      const on = toggleFav(c), h = e.target.closest('.bn-heart')
      h.classList.toggle('on', on); h.textContent = on ? '♥' : '♡'
      if (ui.mode === 'favorites') render(); else stats.querySelector('div:last-child b').textContent = num(Object.keys(S.favs).length)
      return
    }
    window.dispatchEvent(new CustomEvent('astral:open-holo', { detail: c }))
  })
  window.addEventListener('astral:binder', () => { S = read(); if (ui.on) render() })
}
init()
