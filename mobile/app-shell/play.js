/* Astral app pages: Welcome, Pokémon, Settings. Loaded as a module so it shares api.js (token, base, cache) with the site. */
import { api } from '../js/api.js'
import { esc, num, duration, initials } from '../js/ui.js'
import { $, $$, route, signedIn, pk, openSheet, closeSheet, hpBar, sleep } from './core.js'
import { spriteImg } from './showdown.js'
import { renderPokemon } from './pokemon.js'
import { renderSettings } from './settings.js'
import './prefs.js'
import './inventory.js'
import './feedback.js'
import './binder.js'
import './holo.js'
import './share.js'
import './lock.js'
import { renderHub } from './hub.js'
import * as notify from './notify.js'

/* ── Pokémon avatar (stored on this device) ── */
const AV_KEY = 'astral:pk-avatar'
const getAv = () => { try { return JSON.parse(localStorage.getItem(AV_KEY) || 'null') } catch { return null } }
const setAv = (v) => { try { v ? localStorage.setItem(AV_KEY, JSON.stringify(v)) : localStorage.removeItem(AV_KEY) } catch {} }
const avImg = (a, cls = 'pk-spr') => spriteImg(a.name, { dex: a.dex, shiny: a.shiny, list: true }, cls)

function avatarInner(p) {
  const a = getAv()
  if (a) return avImg(a, 'wl-pk')
  return p?.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : `<span>${esc(initials(p?.name))}</span>`
}
let navBusy = false
function applyNavAvatar() {
  const a = getAv(), el = $('#avatarInner'); if (!el || !a || navBusy) return
  if (el.querySelector('.nav-pk')) return
  navBusy = true; el.innerHTML = avImg(a, 'nav-pk'); navBusy = false
}
const navEl = $('#avatarInner')
if (navEl) new MutationObserver(applyNavAvatar).observe(navEl, { childList: true })

async function pickAvatar(onDone) {
  const sheet = openSheet('<div class="wl-skel tall"></div>')
  try {
    const r = await pk.mons('&sort=level')
    const mons = r.mons ?? []
    $('.pk-modal-box', sheet).innerHTML = `
      <h3 class="pk-h3" style="margin-bottom:4px">Choose your Pokémon avatar</h3>
      <p class="subtext" style="margin:0 0 12px">Shown on your Welcome page and top bar on this device.</p>
      <div class="pk-box">${mons.map(m => `<button class="pk-tile" data-m="${esc(m.id)}" data-n="${esc(m.name)}" data-d="${m.dexId}" data-s="${m.shiny ? 1 : 0}">
        ${spriteImg(m.name, { dex: m.dexId, shiny: m.shiny, list: true })}<b>${esc(m.nickname ?? m.name)}</b><small>Lv ${num(m.level)}</small></button>`).join('')
        || '<p class="subtext">Catch a Pokémon first, then pick it here.</p>'}</div>
      ${getAv() ? '<button class="pk-back pk-wide" id="avReset">Use my profile picture</button>' : ''}`
    $$('[data-m]', sheet).forEach(b => b.addEventListener('click', () => {
      setAv({ id: b.dataset.m, name: b.dataset.n, dex: Number(b.dataset.d), shiny: b.dataset.s === '1' }); closeSheet(); applyNavAvatar(); onDone()
    }))
    $('#avReset', sheet)?.addEventListener('click', () => { setAv(null); closeSheet(); const n = $('#avatarInner'); if (n) n.innerHTML = ''; api.me().then(r => { const p = r.player ?? {}; if (n) n.innerHTML = avatarInner(p) }).catch(() => {}); onDone() })
  } catch (e) { $('.pk-modal-box', sheet).innerHTML = `<p style="padding:20px">${esc(e.message)}</p>` }
}

/* ───────────── welcome ─────────────
   Painted from a saved snapshot the instant the page opens, then each section updates in place as fresh data
   arrives (only if it actually changed), so there is no skeleton flash and no full re-render. */
const SNAP = 'astral:welcome'
const tokNow = () => { try { return localStorage.getItem('astral:token') } catch { return null } }
// The snapshot belongs to the account that was signed in when it was saved; anyone else starts clean.
const loadSnap = () => { try { const d = JSON.parse(localStorage.getItem(SNAP) || 'null'); return d && d._t === tokNow() ? d : null } catch { return null } }
const saveSnap = (d) => { try { localStorage.setItem(SNAP, JSON.stringify({ ...d, _t: tokNow() })) } catch {} }
const W = { d: null, html: {}, fetching: false, again: false, raf: 0, err: null }

const slimPlayer = (p = {}) => ({ uid: p.uid, name: p.name, level: p.level, rank: p.rank ? { title: p.rank.title, emoji: p.rank.emoji } : null,
  solars: p.wallet?.solars ?? 0, gems: p.wallet?.gems ?? 0, heroes: p.ownedCharacters?.length ?? 0, avatarUrl: p.avatarUrl ?? null })
const slimSeason = (sv) => (!sv?.active ? { active: false } : { active: true, number: sv.season.number, name: sv.season.name, description: sv.season.description,
  tierCount: sv.season.tierCount, endsAt: sv.runtime?.endsAt ?? 0, pl: sv.player ? { tier: sv.player.tier, points: sv.player.points, premium: !!sv.player.premiumPass } : null })
const slimTeam = (o) => (o.needsStarter ? { starter: true } : { party: (o.party ?? []).map(m => ({ name: m.name, nickname: m.nickname, dexId: m.dexId, shiny: m.shiny, level: m.level, hp: m.hp, maxHp: m.maxHp, fainted: m.fainted })) })
const slimBoard = (b) => (b?.rows ?? []).map(r => ({ uid: r.uid, position: r.position, name: r.name, level: r.level, avatarUrl: r.avatarUrl ?? null }))
const listOf = (r) => (Array.isArray(r) ? r : r && typeof r === 'object' ? (Object.values(r).find(Array.isArray) ?? []) : [])
const CARD_MS = 5 * 60 * 1000
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
// Three random cards from the catalog. Page count comes from the tier pool sizes; falls back to the first few pages.
async function fetchRandomCards() {
  let pages = 0
  try {
    const total = listOf(await api.cardPrices()).reduce((n, t) => n + (Number(t?.poolSize) || 0), 0)
    if (total > 0) pages = Math.max(1, Math.ceil(total / 24))
  } catch {}
  const grab = async (pg) => { const out = await api.cardCatalog({ page: pg, limit: 24 }); return (out?.cards ?? []).filter(c => c && typeof c === 'object') }
  const pg = 1 + Math.floor(Math.random() * (pages || 5))
  let list = []
  try { list = await grab(pg) } catch {}
  if (list.length < 3 && pg !== 1) { try { list = await grab(1) } catch {} }
  return shuffle(list).slice(0, 3).map(c => ({ name: String(c.title ?? c.name ?? 'Card'), img: c.imageUrl ?? c.image ?? null, tier: c.tier ?? null }))
}
async function refreshCards(force = false) {
  if (!W.d) return
  if (!force && W.d.cards?.length >= 3 && Date.now() - (W.d.cardsAt ?? 0) < CARD_MS) return
  if (W.cardsBusy) return
  W.cardsBusy = true
  try {
    const c = await fetchRandomCards()
    if (c.length) { patchWelcome('cards', c); patchWelcome('cardsAt', Date.now()) }
  } catch {} finally {
    W.cardsBusy = false
    if (W.d.cards === undefined) patchWelcome('cards', null)
  }
}
setInterval(() => { if (route() === 'welcome' && signedIn()) refreshCards() }, 30000)

const HUB = [['wallet', 'Wallet', 'Bank, vault, loans'], ['storage', 'Storage', 'Bag and chests'], ['quests', 'Quests', 'Claim rewards'], ['league', 'League', 'Table and bouts']]
const QUICK = [['characters', 'Characters', 'Browse every hero'], ['shop', 'Shop', 'Gear and items']]
const skel = '<div class="wl-skel"></div>'
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0)

const SECTIONS = {
  wlHello(d) {
    const p = d.p
    if (!p) return W.err ? `<div class="wl-empty">${esc(W.err)}<br><button class="btn btn-gold btn-sm" data-retry style="margin-top:10px">Try again</button></div>` : skel
    const h = new Date().getHours()
    const hello = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
    return `<div class="wl-hello" data-go="profile" role="link" aria-label="Open your profile">
      <span class="wl-avatar">${avatarInner(p)}<i class="wl-edit" data-av aria-label="Change avatar">✎</i></span>
      <div class="wl-who"><div class="wl-sub">${hello},</div><h1 class="wl-name">${esc(p.name ?? 'Adventurer')}</h1>
        <div class="wl-chips"><span class="wl-chip">Lv ${num(p.level ?? 1)}</span>${p.rank?.title ? `<span class="wl-chip">${esc(p.rank.emoji ?? '')} ${esc(p.rank.title)}</span>` : ''}</div></div>
      <span class="wl-chev">›</span></div>`
  },
  wlSeason(d) {
    const s = d.sv
    if (s === undefined) return skel
    if (!s?.active) return '<div class="wl-season empty"><div class="wl-season-body"><div class="wl-kicker">Season</div><h2>Between seasons</h2><p>The next season hasn\'t started yet. Check back soon.</p></div></div>'
    const left = (s.endsAt ?? 0) - Date.now(), pl = s.pl
    return `<a class="wl-season" href="#/season">
      <div class="wl-season-art" style="background-image:linear-gradient(180deg,rgb(0 0 0 / 15%),#000 92%),url('assets/img/season/hero.jpg')"></div>
      <div class="wl-season-body"><div class="wl-kicker">Current season${left > 0 ? ` · ${esc(duration(left))} left` : ''}</div>
        <h2>Season ${esc(s.number)}: ${esc(s.name)}</h2>${s.description ? `<p>${esc(s.description)}</p>` : ''}
        ${pl ? `<div class="wl-tier"><span>Tier ${num(pl.tier)} / ${num(s.tierCount)}</span><span>${num(pl.points)} pts · ${pl.premium ? 'Premium' : 'Free'} pass</span></div>
          <div class="xp-track"><div class="xp-fill" style="width:${pct(pl.tier, s.tierCount)}%"></div></div>` : ''}
        <span class="wl-more">More on the season <b>→</b></span></div></a>`
  },
  wlStats(d) {
    const p = d.p; if (!p) return ''
    return `<div class="wl-stats"><div><b>${num(p.solars)}</b><span>Solars</span></div><div><b>${num(p.gems)}</b><span>Gems</span></div><div><b>${num(p.heroes)}</b><span>Heroes</span></div></div>`
  },
  wlTeam(d) {
    const t = d.team
    if (t === undefined) return skel
    if (!t) return '<div class="wl-empty">Couldn’t load your team.</div>'
    if (t.starter) return '<a class="wl-cta" href="#/pokemon"><b>Choose your starter Pokémon</b><span>Begin your journey ›</span></a>'
    return `<div class="pk-strip">${t.party.map(m => `<a class="pk-chip ${m.fainted ? 'faint' : ''}" href="#/pokemon">
      ${spriteImg(m.name, { dex: m.dexId, shiny: m.shiny, list: true })}<b>${esc(m.nickname ?? m.name)}</b><small>Lv ${num(m.level)}</small>${hpBar(m.hp, m.maxHp)}</a>`).join('')}</div>`
  },
  wlCards(d) {
    const c = d.cards
    if (c === undefined) return skel
    if (!c?.length) return '<a class="wl-cta wl-cta-soft" href="#/cards"><b>Cards</b><span>Collect card tiers ›</span></a>'
    return `<div class="wl-mini">${c.map(x => `<a class="wl-mc" href="#/cards">
      <span class="wl-mc-art">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" decoding="async">` : `<em>${esc(initials(x.name))}</em>`}${x.tier != null && x.tier !== '' ? `<i class="wl-mc-tier">${esc(x.tier)}</i>` : ''}</span><b>${esc(x.name)}</b></a>`).join('')}</div>`
  },
  wlTop(d) {
    const rows = d.board
    if (rows === undefined) return skel
    if (!rows?.length) return '<div class="wl-empty">No one on the board yet.</div>'
    return `<div class="wl-board">${rows.map(r => `<a class="${r.uid === d.p?.uid ? 'you' : ''}" href="#/leaderboard">
      <span class="r">${num(r.position)}</span><span class="av">${r.avatarUrl ? `<img src="${esc(r.avatarUrl)}" alt="" loading="lazy">` : esc(initials(r.name))}</span>
      <span class="n">${esc(r.name)}</span><span class="l">Lv ${num(r.level)}</span></a>`).join('')}</div>`
  },
  wlPremium(d) {
    const on = d.sv?.pl?.premium
    return `<a class="wl-premium" href="#/premium"><div><b>${on ? 'Premium pass active' : 'Go Premium'}</b><span>${on ? 'See your perks and rewards' : 'Perks, passes and exclusive rewards'}</span></div><i>›</i></a>`
  },
}

function buildWelcome(host) {
  W.html = {}
  host.innerHTML = `
    <div id="wlHello"></div><div id="wlSeason"></div><div id="wlStats"></div>
    <div class="wl-sec"><h3>Your Pokémon</h3><a href="#/pokemon">Battle ›</a></div><div id="wlTeam"></div>
    <div class="wl-sec"><h3>Quick access</h3></div>
    <div class="wl-quick">${QUICK.map(([r, t, x]) => `<a href="#/${r}"><b>${t}</b><span>${x}</span></a>`).join('')}</div>
    <div class="wl-sec"><h3>Hub</h3><a href="#/hub">Open hub ›</a></div>
    <div class="wl-quick">${HUB.map(([r, t, x]) => `<a href="#/hub/${r}"><b>${t}</b><span>${x}</span></a>`).join('')}</div>
    <div class="wl-sec"><h3>Cards</h3><a href="#/cards">View all ›</a></div><div id="wlCards"></div>
    <div class="wl-sec"><h3>Ranks</h3><a href="#/leaderboard">Full board ›</a></div><div id="wlTop"></div>
    <div id="wlPremium" class="wl-end"></div>`
  if (host._wired) return
  host._wired = true
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-av]')) { e.stopPropagation(); pickAvatar(paintWelcome); return }
    if (e.target.closest('[data-retry]')) { W.err = null; paintWelcome(); renderWelcome(); return }
    const g = e.target.closest('[data-go]'); if (g) location.hash = '#/' + g.dataset.go
  })
}

function paintWelcome() {
  const host = $('#welcomeRoot'); if (!host || !W.d) return
  for (const [id, fn] of Object.entries(SECTIONS)) {
    const el = host.querySelector('#' + id); if (!el) continue
    const html = fn(W.d)
    if (W.html[id] !== html) { W.html[id] = html; el.innerHTML = html }
  }
}
function patchWelcome(k, v) {
  W.d[k] = v
  if (W.raf) return
  W.raf = requestAnimationFrame(() => { W.raf = 0; if (W.d.p) saveSnap(W.d); if (route() === 'welcome') paintWelcome() })
}

async function renderWelcome() {
  const host = $('#welcomeRoot'); if (!host) return
  const t = tokNow()
  if (W.tok !== t) { W.tok = t; W.d = null; host.innerHTML = '' }   // signed in as someone else: forget the previous account
  if (!$('#wlHello', host)) buildWelcome(host)
  if (!W.d) W.d = loadSnap() ?? {}
  paintWelcome()
  if (W.d.p) host.dataset.ready = '1'                // snapshot is on screen: the splash can lift right away
  if (W.fetching) { W.again = true; return }
  W.fetching = true; W.again = false

  const jobs = [
    api.me().then(r => { W.err = null; patchWelcome('p', slimPlayer(r.player)) }).catch(e => { if (!W.d.p) { W.err = e?.message || 'Could not load your profile.'; paintWelcome() } }),
    api.season().then(sv => { const x = slimSeason(sv); patchWelcome('sv', x); notify.seasonEnds(x.endsAt) }).catch(() => patchWelcome('sv', W.d.sv ?? null)),
    pk.overview().then(o => patchWelcome('team', slimTeam(o))).catch(() => patchWelcome('team', W.d.team ?? null)),
    api.leaderboard('level', 5).then(b => patchWelcome('board', slimBoard(b))).catch(() => patchWelcome('board', W.d.board ?? null)),
    refreshCards(),
  ]
  await Promise.allSettled(jobs)
  host.dataset.ready = '1'                           // also lifts the splash if the very first load failed
  W.fetching = false
  if (W.again && route() === 'welcome') renderWelcome()
}
// A background refresh finished with different data: update Welcome in place.
window.addEventListener('astral:data', () => { if (route() === 'welcome') { W.again = true; if (!W.fetching) renderWelcome() } })

/* ── routing + warm-up ── */
function onRoute() {
  if (!signedIn()) return
  const r = route()
  if (r === 'welcome') renderWelcome()
  else if (r === 'pokemon') renderPokemon()
  else if (r === 'settings') renderSettings({ pickAvatar })
  else if (r === 'hub') renderHub()
}
window.addEventListener('hashchange', onRoute)
onRoute()

// Once Welcome is up, quietly pre-load the other tabs one request at a time so they open instantly.
let warmed = false
async function warm() {
  if (warmed || !signedIn()) return
  warmed = true
  await sleep(1200)
  const jobs = [() => api.characters(), () => api.shop(), () => api.season(), () => api.leaderboard(), () => api.premium?.(), () => api.cards?.(),
    () => pk.meta(), () => pk.party(), () => pk.tower(), () => pk.bag(), () => pk.shop()]
  for (const j of jobs) { try { await j() } catch {} await sleep(120) }
}
window.addEventListener('hashchange', () => { warmed = warmed && signedIn() })
setInterval(warm, 3000); warm()
applyNavAvatar()
