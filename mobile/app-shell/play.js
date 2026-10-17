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
import { renderDungeon } from './dungeon.js'
import { resolveArt } from '../js/core/shared.js'
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


/* Home "game modes": where a player picks what to DO - the launcher pattern,
   not a portal link grid. */
const M = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`
const MODES = [
  ['dungeon', 'Dungeon', 'Floors and runs', M('<rect x="5" y="3" width="14" height="18" rx="7"/><path d="M12 8.5V12"/><circle cx="12" cy="15.2" r="1.4"/>')],
  ['hub/league', 'League', 'Table and bouts', M('<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4"/>')],
  ['hub/quests', 'Quests', 'Claim rewards', M('<path d="M6 3h12v18l-6-4-6 4z"/><path d="M9 8h6M9 11h4"/>')],
  ['cards', 'Cards', 'Collect them all', M('<rect x="4" y="3" width="13" height="18" rx="2"/><path d="M20 7v12a2 2 0 0 1-2 2"/>')],
]
const skel = '<div class="wl-skel"></div>'
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0)

/* Section helper: header + body, or nothing at all when there is no body -
   so a section that has no data (guest, API hiccup) leaves no orphan header. */
const sec = (title, body, link) => !body ? '' : `<div class="wl-sec"><h3>${title}</h3>${link ? `<a href="${link[0]}">${link[1]}</a>` : ''}</div>${body}`

const SECTIONS = {
  wlHello(d) {
    const p = d.p
    if (!p) {
      // Preview guest (no session): a calm branded header instead of a
      // profile error with a retry button - this is the app's home, not a form.
      if (!signedIn() && window.ASTRAL_PREVIEW_OPEN) {
        return `<div class="wl-hello">
          <span class="wl-avatar"><i style="font-style:normal">A</i></span>
          <div class="wl-who"><div class="wl-sub">Welcome to</div><h1 class="wl-name">Astral</h1>
            <div class="wl-chips"><span class="wl-chip">Preview</span></div></div></div>`
      }
      return W.err ? `<div class="wl-empty">${esc(W.err)}<br><button class="btn btn-gold btn-sm" data-retry style="margin-top:10px">Try again</button></div>` : skel
    }
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
        <span class="wl-play">PLAY NOW <b>→</b></span></div></a>`
  },
  wlStats(d) {
    const p = d.p; if (!p) return ''
    return `<div class="wl-stats"><div><b>${num(p.solars)}</b><span>Solars</span></div><div><b>${num(p.gems)}</b><span>Gems</span></div><div><b>${num(p.heroes)}</b><span>Heroes</span></div></div>`
  },
  wlSquad(d) {
    const t = d.team
    if (t === undefined) return sec('Your squad', skel, ['#/pokemon', 'Party ›'])
    if (!t) return (!signedIn() && window.ASTRAL_PREVIEW_OPEN) ? '' : sec('Your squad', '<div class="wl-empty">Couldn’t load your team.</div>', ['#/pokemon', 'Party ›'])
    if (t.starter) return sec('Your squad', '<a class="wl-cta" href="#/pokemon"><b>Choose your starter Pokémon</b><span>Begin your journey ›</span></a>')
    return sec('Your squad', `<div class="pk-strip">${t.party.map(m => `<a class="pk-chip ${m.fainted ? 'faint' : ''}" href="#/pokemon">
      ${spriteImg(m.name, { dex: m.dexId, shiny: m.shiny, list: true })}<b>${esc(m.nickname ?? m.name)}</b><small>Lv ${num(m.level)}</small>${hpBar(m.hp, m.maxHp)}</a>`).join('')}</div>`, ['#/pokemon', 'Party ›'])
  },
  wlHeroes(d) {
    const r = d.roster
    if (r === undefined) return sec('Top heroes', skel, ['#/shop', 'All heroes ›'])
    if (!r?.length) return ''
    return sec('Top heroes', `<div class="wl-cast">${r.map(c => {
      const k = Math.max(1, Math.min(6, Number(c.stars) || 1))
      const art = resolveArt(c.img)
      return `<a href="#/shop"><span class="art">${art ? `<img src="${esc(art)}" alt="" loading="lazy" decoding="async">` : '<em>✦</em>'}</span>
        <span class="stars">${'★'.repeat(k)}</span><b>${esc(c.name)}</b></a>`
    }).join('')}</div>`, ['#/shop', 'All heroes ›'])
  },
  wlPicks(d) {
    const p = d.picks
    if (p === undefined) return sec('Shop picks', skel, ['#/shop', 'Open shop ›'])
    if (!p?.length) return ''
    return sec('Shop picks', `<div class="wl-cast">${p.map(x => {
      const art = resolveArt(x.img)
      return `<a href="#/shop"><span class="art">${art ? `<img src="${esc(art)}" alt="" loading="lazy" decoding="async">` : '<em>✦</em>'}</span>
        <b>${esc(x.name)}</b><small>${num(x.price)} solars</small></a>`
    }).join('')}</div>`, ['#/shop', 'Open shop ›'])
  },
  wlPulls(d) {
    const c = d.pulls
    if (c === undefined) return sec('Fresh pulls', skel, ['#/cards', 'All cards ›'])
    if (!c?.length) return ''
    return sec('Fresh pulls', `<div class="wl-mini">${c.map(x => `<a class="wl-mc" href="#/cards">
      <span class="wl-mc-art">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" decoding="async">` : `<em>${esc(initials(x.name))}</em>`}${x.tier != null && x.tier !== '' ? `<i class="wl-mc-tier">${esc(x.tier)}</i>` : ''}</span><b>${esc(x.name)}</b></a>`).join('')}</div>`, ['#/cards', 'All cards ›'])
  },
  wlWorld(d) {
    const w = d.world
    if (w === undefined) return sec('The world right now', skel)
    if (!w) return ''
    return sec('The world right now', `<div class="wl-world">
      <div><b>${num(w.players)}</b><span>players in the game</span></div>
      <div><b>${num(w.dungeons)}</b><span>dungeons cleared</span></div>
      <div><b>${num(w.floor)}</b><span>deepest floor</span></div>
      <div><b>${num(w.cmd)}</b><span>commands today</span></div>
    </div>`, ['#/leaderboard', 'Ranks ›'])
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
    <div id="wlHello"></div>
    <div id="wlStats"></div>
    <div id="wlSeason"></div>
    <div class="wl-sec"><h3>Game modes</h3><a href="#/hub">Hub ›</a></div>
    <div class="gm-modes">${MODES.map(([r, t, x, ic]) => `<a class="gm-mode" href="#/${r}"><span class="gm-ico">${ic}</span><b>${t}</b><small>${x}</small></a>`).join('')}</div>
    <div id="wlSquad"></div>
    <div id="wlHeroes"></div>
    <div id="wlPicks"></div>
    <div id="wlPulls"></div>
    <div id="wlWorld"></div>
    <div class="wl-sec"><h3>Top ranked</h3><a href="#/leaderboard">Full board ›</a></div><div id="wlTop"></div>
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
    // Public, session-less feeds - these are what keep the home feed alive for
    // guests and cold starts (world numbers, hero strip, shop picks, pulls).
    api.stats().then(s => patchWelcome('world', s && {
      players: s.players, dungeons: s.dungeonsConquered, cmd: s.commandsToday,
      floor: s.deepestFloor, lvl: s.highestLevel, heroes: s.charactersAvailable,
    })).catch(() => patchWelcome('world', W.d.world ?? null)),
    api.characters().then(c => {
      const rows = [...(c.characters ?? [])]
        .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || String(a.name).localeCompare(String(b.name)))
        .slice(0, 8)
      patchWelcome('roster', rows.map(x => ({ id: x.id, name: x.name, stars: x.stars ?? 1, img: x.image ?? null })))
    }).catch(() => patchWelcome('roster', W.d.roster ?? null)),
    api.shop().then(sh => {
      const shelves = sh?.shelves ?? []
      const shelf = shelves.find(s => s.key !== 'heroes') ?? shelves[0]
      const rows = (shelf?.groups ?? []).flatMap(g => g.rows ?? []).slice(0, 6)
      patchWelcome('picks', rows.map(r => ({ id: r.id, name: r.name, img: r.image ?? null, price: r.buyPrice ?? 0 })))
    }).catch(() => patchWelcome('picks', W.d.picks ?? null)),
    api.cardCatalog({ page: 1, limit: 8 }).then(o => patchWelcome('pulls',
      (o?.cards ?? []).slice(0, 8).map(c => ({ name: String(c.title ?? c.name ?? 'Card'), img: c.imageUrl ?? c.image ?? null, tier: c.tier ?? null }))))
      .catch(() => patchWelcome('pulls', W.d.pulls ?? null)),
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
  // Preview builds (window.ASTRAL_PREVIEW_OPEN) render app pages without a session too.
  if (!signedIn() && !window.ASTRAL_PREVIEW_OPEN) return
  const r = route()
  if (r === 'welcome') renderWelcome()
  else if (r === 'pokemon') renderPokemon()
  else if (r === 'settings') renderSettings({ pickAvatar })
  else if (r === 'hub') renderHub()
  else if (r === 'dungeon') renderDungeon()
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
