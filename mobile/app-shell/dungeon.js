/* Dungeon: the crawler's home in the app - your deepest floor, runs cleared,
   and where the runs actually happen (the WhatsApp chat). Thin reads over /api. */
import { api } from '../js/api.js'
import { esc, num } from '../js/ui.js'
import { $, signedIn } from './core.js'

const n0 = (v) => num(Number(v) || 0)
const stat = (label, value, sub = '') => `<div class="hb-stat"><span>${esc(label)}</span><b>${value}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`

let seq = 0
let wired = false
let cache = { stats: null, mine: null, mineTried: false }

/** Own player detail (carries p.dungeon) - best effort; guests and signed-out players get the server view. */
async function ownDetail() {
  if (!signedIn()) return null
  if (cache.mineTried) return cache.mine
  cache.mineTried = true
  try {
    const me = await api.me()
    const uid = me?.player?.uid
    cache.mine = uid ? await api.player(uid) : null
  } catch { cache.mine = null }
  return cache.mine
}

export async function renderDungeon() {
  const host = $('#dungeonRoot'); if (!host) return
  const run = ++seq
  if (!wired) {
    wired = true
    host.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) renderDungeon() })
  }
  host.innerHTML = '<div class="hb-skel"></div><div class="hb-skel short"></div>'

  const [stR, detR] = await Promise.allSettled([api.stats(), ownDetail()])
  if (run !== seq) return                       // a newer render took over
  if (stR.status === 'fulfilled') cache.stats = stR.value
  const s = cache.stats
  if (!s) {
    host.innerHTML = `<section class="hb-card hb-fail"><p>${esc(stR.reason?.message || 'The dungeon is unreachable right now.')}</p>
      <button type="button" class="btn btn-primary btn-sm" data-retry>Try again</button></section>`
    return
  }

  const p = detR.status === 'fulfilled' ? (detR.value?.player ?? null) : null
  const dg = p?.dungeon ?? {}
  const own = dg.deepestFloor != null
  const floor = own ? dg.deepestFloor : s.deepestFloor

  host.innerHTML = `
    <div class="dg-banner" style="background-image:linear-gradient(180deg,rgb(0 0 0 / 4%),rgb(0 0 0 / 78%) 88%),url('assets/img/modes/dungeon.jpg')">
      <span class="dg-bn-kicker">The crawl</span>
      <h2>Dungeon runs</h2>
    </div>
    <div class="dg-sheet">
      <span class="dg-kicker">${own ? 'Your deepest floor' : 'Deepest floor on record'}</span>
      <b class="dg-num">${n0(floor)}</b>
      <p class="dg-sub">${own
        ? `You conquered ${n0(dg.conquered)} runs · record to beat: ${n0(s.deepestFloor)}`
        : 'Clear runs in the chat to put your name on it'}</p>
      <div class="dg-tiles">
        <div class="dg-tile"><b>${n0(dg.conquered)}</b><span>Yours</span></div>
        <div class="dg-tile"><b>${n0(s.deepestFloor)}</b><span>Record</span></div>
        <div class="dg-tile"><b>${n0(s.dungeonsConquered)}</b><span>All-time</span></div>
      </div>
    </div>
    <div class="hb-grid3">
      ${stat('Highest level', n0(s.highestLevel), 'Server-wide')}
      ${stat('Players', n0(s.players), 'In the game')}
      ${stat('Characters', n0(s.charactersAvailable), 'In the Shop')}
    </div>
    <section class="hb-card">
      <h4>How runs work</h4>
      <p class="hb-sub">Dungeon runs are played in the WhatsApp chat - this screen keeps score: floors cleared, rewards won and the records to beat.</p>
      <div class="dg-links">
        <a class="btn btn-primary" href="#/leaderboard">Floor leaders</a>
        <a class="btn btn-secondary" href="#/season">Season rewards</a>
      </div>
    </section>`
}
