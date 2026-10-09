/* Hub: wallet, storage, quests, achievements, guilds, realms and the League.
   Everything here is a thin screen over the bot's /api routes: reads show the game's own state, and the only writes are the
   ones the server exposes (money moves, storage moves, quest + achievement claims). Rules live on the server, never here. */
import { API_BASE } from '../js/api.js'
import { toast } from '../js/ui.js'
import { $, $$, esc, num, call, signedIn, openSheet, closeSheet } from './core.js'
import * as FB from './feedback.js'

const get = (p) => call(p)
const post = (p, body) => call(p, { method: 'POST', body: body ?? {} })
const H = { run: 0, key: '', screen: '', tab: {}, wallet: null, storage: null, sort: 'fame', track: '', leagueTab: 'overview' }

/* ── small helpers ── */
const arr = (v) => (Array.isArray(v) ? v : [])
const n0 = (v) => num(Number(v) || 0)
const human = (s) => String(s ?? '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
const clean = (s) => String(s ?? '').replace(/[*_~`]/g, '').trim()
const when = (t) => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0)
const errMsg = (e) => (e?.status === 503 ? 'That area is unavailable right now. Try again soon.' : e?.message || 'Something went wrong.')
const say = (r, fallback = 'Done') => clean(r?.message ?? r?.text ?? r?.msg ?? fallback) || fallback
const media = (u) => { const s = String(u ?? '').trim(); return !s ? '' : /^(https?:|data:)/i.test(s) ? s : `${API_BASE}${s.startsWith('/') ? '' : '/'}${s}` }
const rawBox = (d) => `<details class="hb-raw"><summary>Raw data</summary><pre>${esc(JSON.stringify(d, null, 1).slice(0, 6000))}</pre></details>`

const card = (title, body, cls = '') => `<section class="hb-card ${cls}">${title ? `<h4>${title}</h4>` : ''}${body}</section>`
const stat = (label, value, sub = '') => `<div class="hb-stat"><span>${esc(label)}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`
const bar = (p) => `<div class="hb-bar"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`
const empty = (t) => `<div class="hb-empty">${esc(t)}</div>`
const seg = (items, active, attr) => `<div class="hb-seg">${items.map(([v, l]) => `<button type="button" data-${attr}="${esc(v)}" class="${String(v) === String(active) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`
const pill = (t, cls = '') => `<span class="hb-pill ${cls}">${esc(t)}</span>`
const skeleton = '<div class="hb-skel"></div><div class="hb-skel"></div><div class="hb-skel short"></div>'
const failBox = (e, again) => `<div class="hb-card hb-fail"><p>${esc(errMsg(e))}</p><button type="button" class="btn btn-primary btn-sm" data-retry="${esc(again)}">Try again</button></div>`
const chatNote = (t) => `<p class="hb-note">${esc(t)}</p>`

let root = null
const goto = (path) => { location.hash = `#/hub${path ? '/' + path : ''}` }

/* ── Hub home ── */
const ICON = {
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  storage: '<path d="M4 8h16v11H4z"/><path d="M4 8l2-4h12l2 4"/><path d="M10 12h4"/>',
  quests: '<path d="M6 3h12v18l-6-4-6 4z"/><path d="M9 8h6M9 11h4"/>',
  achievements: '<circle cx="12" cy="9" r="5"/><path d="M8.5 13.5L7 21l5-3 5 3-1.5-7.5"/>',
  guilds: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M12 8v6M9 11h6"/>',
  empires: '<path d="M3 20h18M5 20V9l4-3 3 2 3-2 4 3v11"/><path d="M9 20v-5h6v5"/>',
  league: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4"/>',
}
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`
const TITLES = { wallet: 'Wallet', storage: 'Storage', quests: 'Quests', achievements: 'Achievements', guilds: 'Guilds', empires: 'Realms', league: 'League' }

async function home() {
  const run = H.run
  root.innerHTML = skeleton
  const [w, q] = await Promise.allSettled([get('/wallet'), get('/quests')])
  if (run !== H.run) return
  const wb = w.value?.balances, ready = Number(q.value?.claimable) || 0
  const subs = {
    wallet: w.value?.netWorth != null ? `${n0(w.value.netWorth)} net worth` : 'Bank, vault and loans',
    storage: 'Bag, chest and Ender Chest',
    quests: ready ? `${ready} ready to claim` : 'Daily and milestone quests',
    achievements: 'Points, tiers and rewards',
    guilds: 'The five halls',
    empires: 'Realms and their maps',
    league: 'Table, fixtures and bouts',
  }
  root.innerHTML = `
    ${wb ? `<div class="hb-strip">${stat('Solars', n0(wb.solars))}${stat('Gems', n0(wb.gems))}${stat('Bank', n0(wb.bankGold))}</div>` : ''}
    <div class="hb-tiles">${Object.keys(TITLES).map(k => `<a class="hb-tile" href="#/hub/${k}">
      <i>${svg(k)}</i><b>${TITLES[k]}</b><span>${esc(subs[k])}</span>${k === 'quests' && ready ? `<em class="hb-dot">${ready}</em>` : ''}</a>`).join('')}</div>
    ${chatNote('Sending money, joining guilds, raids and starting League bouts stay in WhatsApp.')}`
}

/* ── Wallet ── */
async function wallet() {
  const run = H.run
  root.innerHTML = skeleton
  let d
  try { d = H.wallet = await get('/wallet') } catch (e) { if (run === H.run) root.innerHTML = failBox(e, 'wallet'); return }
  if (run !== H.run) return
  const b = d.balances ?? {}, bank = d.bank ?? {}, ld = d.loanDesk ?? {}, pend = d.pending ?? {}
  const money = (kind, title, hint, extra = '') => card(title, `${hint ? `<p class="hb-sub">${hint}</p>` : ''}
    <input class="hb-in" type="number" inputmode="numeric" min="1" placeholder="Amount" data-amt="${kind}">
    <div class="hb-btns">${extra}</div>`)
  root.innerHTML = `
    ${card('', `<div class="hb-grid3">${stat('Solars', n0(b.solars))}${stat('Vault', n0(b.vault))}${stat('Bank', n0(b.bankGold))}${stat('Gems', n0(b.gems))}${stat('Loan', n0(b.loan))}${stat('Net worth', n0(d.netWorth))}</div>
      ${(pend.bankInterest || pend.loanInterest) ? `<p class="hb-sub">Pending interest: ${pend.bankInterest ? `+${n0(pend.bankInterest)} bank` : ''}${pend.bankInterest && pend.loanInterest ? ' · ' : ''}${pend.loanInterest ? `${n0(pend.loanInterest)} owed` : ''}</p>` : ''}`, 'hb-hero')}
    ${money('bank', 'Bank', `Earns ${esc(String((Number(bank.dailyRate) || 0) * (Number(bank.dailyRate) < 1 ? 100 : 1)).slice(0, 5))}% a day, paid whenever you look.`,
      '<button type="button" class="btn btn-primary btn-sm" data-m="bank:deposit">Deposit</button><button type="button" class="btn btn-secondary btn-sm" data-m="bank:withdraw">Withdraw</button><button type="button" class="btn btn-ghost btn-sm" data-m="bank:deposit:all">Deposit all</button><button type="button" class="btn btn-ghost btn-sm" data-m="bank:withdraw:all">Withdraw all</button>')}
    ${money('vault', 'Vault', 'Safe storage for solars. A robbery can still reach it.',
      '<button type="button" class="btn btn-primary btn-sm" data-m="vault:deposit">Deposit</button><button type="button" class="btn btn-secondary btn-sm" data-m="vault:withdraw">Withdraw</button><button type="button" class="btn btn-ghost btn-sm" data-m="vault:deposit:all">Deposit all</button><button type="button" class="btn btn-ghost btn-sm" data-m="vault:withdraw:all">Withdraw all</button>')}
    ${money('loan', 'Loan desk', `You owe <b>${n0(ld.owed)}</b>. You can borrow up to <b>${n0(ld.available)}</b> more (limit ${n0(ld.limit)}${ld.perLevel ? `, ${n0(ld.perLevel)} per level` : ''}).`,
      '<button type="button" class="btn btn-primary btn-sm" data-m="loan:borrow">Borrow</button><button type="button" class="btn btn-secondary btn-sm" data-m="loan:repay">Repay</button><button type="button" class="btn btn-ghost btn-sm" data-m="loan:borrow:all">Borrow max</button><button type="button" class="btn btn-ghost btn-sm" data-m="loan:repay:all">Repay all</button>')}
    <h3 class="hb-h">History</h3><div id="hbLedger">${skeleton}</div>${rawBox(d)}`
  get('/wallet/ledger?limit=25').then(l => {
    const rows = arr(l?.entries)
    const box = $('#hbLedger', root); if (!box) return
    box.innerHTML = rows.length ? `<div class="hb-list">${rows.map(r => {
      const amt = Number(r.amount ?? r.delta ?? r.value)
      return `<div class="hb-li"><div><b>${esc(human(r.type ?? r.kind ?? 'entry'))}</b><small>${esc(clean(r.note ?? r.detail ?? r.memo ?? ''))}${r.at || r.ts || r.time ? ` ${esc(when(r.at ?? r.ts ?? r.time))}` : ''}</small></div>
        ${Number.isFinite(amt) ? `<span class="${amt < 0 ? 'neg' : 'pos'}">${amt > 0 ? '+' : ''}${n0(amt)}</span>` : ''}</div>`
    }).join('')}</div>` : empty('No transactions yet.')
  }).catch(() => { const box = $('#hbLedger', root); if (box) box.innerHTML = empty('History is unavailable right now.') })
}
async function moneyMove(spec) {
  const [kind, dir, all] = spec.split(':'), input = $(`[data-amt="${kind}"]`, root), raw = input?.value
  let amount = all ? 'all' : Math.floor(Number(raw))
  if (!all && !(amount > 0)) return toast('Enter an amount first.')
  const w = H.wallet ?? {}, bal = w.balances ?? {}
  if (kind === 'vault' && all) amount = dir === 'deposit' ? Number(bal.solars) || 0 : Number(bal.vault) || 0
  if (kind === 'loan' && dir === 'borrow') {
    if (all) amount = Number(w.loanDesk?.available) || 0
    if (!(amount > 0)) return toast('You cannot borrow any more right now.')
    if (!confirm(`Borrow ${num(amount)} solars? Interest is charged daily.`)) return
  }
  const [path, body] = kind === 'bank' ? ['/wallet/bank', { action: dir, amount }]
    : kind === 'vault' ? ['/wallet/vault', { action: dir, amount }]
    : dir === 'borrow' ? ['/wallet/loan', { amount }] : ['/wallet/repay', { amount }]
  try { const r = await post(path, body); FB.equip(); toast(say(r), 'ok'); if (input) input.value = ''; await wallet() }
  catch (e) { FB.error(); toast(errMsg(e)) }
}

/* ── Storage ── */
const BOXES = [['bag', 'Bag'], ['chest', 'Chest'], ['ender', 'Ender Chest']]
async function storage() {
  const run = H.run
  root.innerHTML = skeleton
  let d
  try { d = H.storage = await get('/storage') } catch (e) { if (run === H.run) root.innerHTML = failBox(e, 'storage'); return }
  if (run !== H.run) return
  paintStorage(d)
}
function paintStorage(d) {
  const tab = H.tab.storage ?? 'bag', box = d[tab] ?? {}, items = arr(box.items)
  const locked = (tab === 'chest' && box.unlocked === false) || (tab === 'ender' && box.unlocked === false && box.owned === false)
  const meta = tab === 'bag' ? `${n0(box.stored)} stored · ${n0(box.length)} / ${n0(box.cap)} slots · room for ${n0(box.room)}${box.holes ? ` · ${n0(box.holes)} empty` : ''}`
    : tab === 'chest' ? `${n0(box.stored)} stored · no size limit` : `${n0(box.stored)} / ${n0(box.cap)} stored · room for ${n0(box.room)}`
  const price = (c) => (c === 'gems' ? `${n0(10)} gems` : `${n0(50000)} solars`)
  root.innerHTML = `${seg(BOXES, tab, 'stab')}
    ${locked ? card('', `<div class="hb-lock"><b>${tab === 'chest' ? 'Chest' : 'Ender Chest'} is locked</b>
        <p>${tab === 'chest' ? `Unlock it for ${price('solars')} or ${price('gems')}.` : `One-time unlock for ${n0(box.price ?? 100000)} solars.`}</p>
        <div class="hb-btns">${tab === 'chest'
          ? '<button type="button" class="btn btn-primary btn-sm" data-unlock="chest:solars">Buy with solars</button><button type="button" class="btn btn-secondary btn-sm" data-unlock="chest:gems">Buy with gems</button>'
          : '<button type="button" class="btn btn-primary btn-sm" data-unlock="ender">Unlock</button>'}</div></div>`)
      : `<p class="hb-sub">${esc(meta)}</p>${items.length ? `<div class="hb-list">${items.map((it, i) => {
        const q = Number(it.qty ?? it.count ?? it.amount ?? 1) || 1, img = media(it.image ?? it.icon)
        return `<button type="button" class="hb-li hb-item" data-i="${i}">${img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.remove()">` : '<span class="hb-gem">✦</span>'}
          <div><b>${esc(it.name ?? it.id ?? 'Item')}</b>${it.rarity ? `<small>${esc(human(it.rarity))}</small>` : ''}</div><span class="qty">×${n0(q)}</span></button>`
      }).join('')}</div>` : empty('Nothing in here.')}`}
    ${rawBox(d)}`
}
function moveSheet(from, i) {
  const d = H.storage, it = arr(d?.[from]?.items)[i]; if (!it) return
  const max = Number(it.qty ?? it.count ?? it.amount ?? 1) || 1, targets = BOXES.filter(([k]) => k !== from)
  openSheet(`<h3 class="hb-sh">${esc(it.name ?? it.id)}</h3><p class="hb-sub">You have ${n0(max)}. Move how many, and where?</p>
    <div class="hb-qty"><button type="button" data-q="-1">−</button><input type="number" inputmode="numeric" id="hbQty" min="1" max="${max}" value="${max > 1 ? 1 : 1}"><button type="button" data-q="1">+</button><button type="button" data-q="max">All</button></div>
    <div class="hb-btns">${targets.map(([k, l]) => `<button type="button" class="btn btn-primary btn-sm" data-to="${k}">To ${l}</button>`).join('')}</div>`,
  (box) => {
    const inp = $('#hbQty', box), clamp = () => { inp.value = Math.max(1, Math.min(max, Math.floor(Number(inp.value)) || 1)) }
    box.addEventListener('click', async (e) => {
      const q = e.target.closest('[data-q]')
      if (q) { inp.value = q.dataset.q === 'max' ? max : (Number(inp.value) || 1) + Number(q.dataset.q); clamp(); return }
      const t = e.target.closest('[data-to]'); if (!t) return
      clamp(); t.disabled = true
      try {
        const r = await post('/storage/move', { from, to: t.dataset.to, item: it.id ?? it.name, qty: Number(inp.value) })
        const moved = r?.moved, asked = r?.requested ?? Number(inp.value)
        FB.drop(); closeSheet()
        toast(moved != null && moved < asked ? `Moved ${n0(moved)} of ${n0(asked)}${r?.reason ? `: ${clean(r.reason)}` : ''}` : say(r, `Moved ${n0(moved ?? asked)}`), 'ok')
        await storage()
      } catch (err) { t.disabled = false; FB.error(); toast(errMsg(err)) }
    })
  })
}
async function buyBox(spec) {
  const [which, cur] = spec.split(':')
  const label = which === 'chest' ? `Unlock the chest for ${cur === 'gems' ? '10 gems' : '50,000 solars'}?` : 'Unlock the Ender Chest for 100,000 solars? This is a one-time purchase.'
  if (!confirm(label)) return
  try { const r = await post(which === 'chest' ? '/storage/chest/buy' : '/storage/ender/buy', which === 'chest' ? { currency: cur } : {}); FB.equip(); toast(say(r, 'Unlocked'), 'ok'); await storage() }
  catch (e) { FB.error(); toast(errMsg(e)) }
}

/* ── generic bits for the vaguer payloads ── */
const label = (v) => (v && typeof v === 'object' ? (v.name ?? v.label ?? v.title ?? v.id ?? '') : (v ?? ''))
function kv(o, skip = []) {
  return Object.entries(o ?? {}).filter(([k, v]) => !skip.includes(k) && v != null && typeof v !== 'object' && v !== '' && v !== false)
    .map(([k, v]) => `<div class="hb-kv"><span>${esc(human(k))}</span><b>${typeof v === 'number' ? (/(at|until|ts|time)$/i.test(k) && v > 1e11 ? esc(when(v)) : n0(v)) : esc(clean(String(v)))}</b></div>`).join('')
}
const tierName = (t) => esc(String(label(t) || ''))

/* ── Quests + achievements (claims) ── */
function claimSheet(r) {
  const got = arr(r?.claimed), notes = arr(r?.notes)
  openSheet(`<h3 class="hb-sh">Claimed!</h3>
    ${got.length ? `<div class="hb-list">${got.map(c => `<div class="hb-li"><div><b>${esc(clean(c.name ?? 'Reward'))}</b>${c.rewardLabel ? `<small>${esc(clean(c.rewardLabel))}</small>` : ''}</div></div>`).join('')}</div>` : `<p class="hb-sub">${esc(say(r, 'Reward collected.'))}</p>`}
    ${notes.length ? `<div class="hb-notes">${notes.map(n => `<p>${esc(clean(n))}</p>`).join('')}</div>` : ''}
    ${r?.level != null ? `<p class="hb-sub">Level ${n0(r.level)}${r.xp != null ? ` · ${n0(r.xp)} xp` : ''}</p>` : ''}
    <button type="button" class="btn btn-primary btn-block" data-close>Nice</button>`, (box) => box.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet() }))
  if (notes.length) FB.levelUp(); else FB.equip()
}
async function claim(kind, id) {
  try {
    const r = await post(kind === 'quests' ? '/quests/claim' : '/achievements/claim', id ? { id } : {})
    claimSheet(r); await (kind === 'quests' ? quests() : achievements())
  } catch (e) { FB.error(); toast(errMsg(e)) }
}
const prog = (o) => {
  const a = Number(o.progress ?? o.current ?? o.value ?? o.have), b = Number(o.goal ?? o.target ?? o.need ?? o.required ?? o.max)
  return Number.isFinite(a) && b > 0 ? { a, b } : null
}
const ready = (o) => !(o.claimed || o.state === 'claimed') && (o.claimable === true || o.ready === true || o.state === 'claimable' || ((o.complete || o.completed || o.done || o.unlocked) && o.claimed === false))
function row(o, kind) {
  const p = prog(o), name = clean(o.name ?? o.title ?? o.def?.name ?? o.id ?? 'Quest'), claimed = !!(o.claimed || o.state === 'claimed')
  const desc = clean(o.desc ?? o.description ?? o.def?.desc ?? ''), reward = clean(o.rewardLabel ?? (typeof o.reward === 'string' ? o.reward : '') ?? '')
  return `<div class="hb-q${claimed ? ' done' : ''}"><div class="hb-qh"><b>${esc(name)}</b>${o.tier != null && label(o.tier) !== '' ? pill(String(label(o.tier))) : ''}</div>
    ${desc ? `<p>${esc(desc)}</p>` : ''}${p ? `${bar(pct(p.a, p.b))}<small>${n0(p.a)} / ${n0(p.b)}</small>` : ''}
    <div class="hb-qf"><small>${esc(reward)}</small>${ready(o) ? `<button type="button" class="btn btn-primary btn-sm" data-claim="${kind}:${esc(o.id ?? '')}">Claim</button>` : claimed ? pill('Claimed', 'ok') : ''}</div></div>`
}
async function quests() {
  const run = H.run; root.innerHTML = skeleton
  let d; try { d = await get('/quests') } catch (e) { if (run === H.run) root.innerHTML = failBox(e, 'quests'); return }
  if (run !== H.run) return
  const c = Number(d.claimable) || 0
  root.innerHTML = `${c ? card('', `<b>${n0(c)} reward${c > 1 ? 's' : ''} ready</b><button type="button" class="btn btn-primary btn-sm" data-claimall="quests">Claim all</button>`, 'hb-ready') : ''}
    <h3 class="hb-h">Today${d.dailyCount != null ? ` <small>${n0(d.dailyCount)} quests</small>` : ''}</h3>${arr(d.daily).length ? arr(d.daily).map(q => row(q, 'quests')).join('') : empty('No daily quests today.')}
    <h3 class="hb-h">Milestones</h3>${arr(d.milestone).length ? arr(d.milestone).map(q => row(q, 'quests')).join('') : empty('No milestones right now.')}${rawBox(d)}`
}
const trackList = (t) => (Array.isArray(t) ? t.map(x => [x.id ?? x.key ?? x.name, x.name ?? x.label ?? x.id]) : Object.entries(t ?? {}).map(([k, v]) => [k, v?.name ?? v?.label ?? human(k)]))
async function achievements() {
  const run = H.run; root.innerHTML = skeleton
  let d; try { d = await get(`/achievements${H.track ? `?track=${encodeURIComponent(H.track)}` : ''}`) } catch (e) { if (run === H.run) root.innerHTML = failBox(e, 'achievements'); return }
  if (run !== H.run) return
  const groups = arr(d.groups).length ? arr(d.groups) : arr(d.board).length ? arr(d.board) : arr(d.board?.groups)
  const open = groups.reduce((s, g) => s + (Number(g.claimable) || 0), 0), tracks = trackList(d.tracks)
  root.innerHTML = `${card('', `<div class="hb-grid3">${stat('Points', n0(d.points))}${stat('Ready', n0(open))}${stat('Tracks', n0(groups.length))}</div>`, 'hb-hero')}
    ${arr(d.justUnlocked).length ? card('Just unlocked', arr(d.justUnlocked).map(a => `<p class="hb-sub">★ ${esc(clean(a.name ?? a.def?.name ?? a.id ?? 'Achievement'))}</p>`).join('')) : ''}
    ${open ? card('', `<b>${n0(open)} reward${open > 1 ? 's' : ''} ready</b><button type="button" class="btn btn-primary btn-sm" data-claimall="ach">Claim all</button>`, 'hb-ready') : ''}
    ${tracks.length ? `<div class="hb-chips">${[['', 'All'], ...tracks].map(([v, l]) => `<button type="button" data-track="${esc(v)}" class="${H.track === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>` : ''}
    ${groups.length ? groups.map(g => { const items = arr(g.items ?? g.achievements ?? g.list ?? g.entries)
      return `<h3 class="hb-h">${esc(clean(label(g.label ?? g.name ?? g.track ?? g.title) || 'Achievements'))} <small>${g.total != null ? n0(g.total) : items.length}${g.claimable ? ` · ${n0(g.claimable)} ready` : ''}</small></h3>${items.map(a => row(a, 'ach')).join('') || empty('Nothing here yet.')}` }).join('') : empty('No achievements to show.')}${rawBox(d)}`
}

/* ── Guilds ── */
const guildImg = (id, type) => `${API_BASE}/api/guilds/${encodeURIComponent(id)}/image?type=${type}`
async function guilds(arg) {
  const run = H.run; root.innerHTML = skeleton
  if (arg) return guildDetail(arg, run)
  let d, me
  try { [d, me] = await Promise.all([get('/guilds'), get('/guilds/me').catch(() => null)]) } catch (e) { if (run === H.run) root.innerHTML = failBox(e, 'guilds'); return }
  if (run !== H.run) return
  const list = arr(d.guilds ?? d.list ?? d), mine = me?.guild, row0 = me?.memberRow
  root.innerHTML = `${mine ? card('Your guild', `<a class="hb-gl" href="#/hub/guilds/${encodeURIComponent(mine.id ?? mine.name)}"><img src="${esc(guildImg(mine.id ?? mine.name, 'pfp'))}" alt="" onerror="this.remove()"><div><b>${esc(clean(mine.name))}</b><small>${esc(human(row0?.role ?? ''))}${row0?.floors != null ? ` · ${n0(row0.floors)} floors` : ''}${row0?.donated != null ? ` · ${n0(row0.donated)} donated` : ''}</small></div><i>›</i></a>
        ${row0?.toNextRole ? `<p class="hb-sub">Next role: ${n0(row0.toNextRole.needed)} more${row0.toNextRole.floors ? ` (${n0(row0.toNextRole.floors)} floors)` : ''}</p>` : ''}${me?.slip?.summary ? `<p class="hb-sub">Slip: ${esc(clean(me.slip.summary))}</p>` : ''}`, 'hb-hero')
      : card('', `<b>You are not in a guild yet</b><p class="hb-sub">Pick a hall below, then join it in WhatsApp.</p>`)}
    <h3 class="hb-h">The five halls</h3>
    ${list.length ? list.map(g => `<a class="hb-card hb-gl" href="#/hub/guilds/${encodeURIComponent(g.id ?? g.name)}"><img src="${esc(guildImg(g.id ?? g.name, 'pfp'))}" alt="" onerror="this.remove()">
      <div><b>#${n0(g.rank)} ${esc(clean(g.name))}${g.tag ? ` <small>[${esc(g.tag)}]</small>` : ''}</b>
      <small>${n0(g.memberCount)} members · ${esc(clean(String(label(g.leader) || 'no leader')))} · tier ${tierName(g.tier)} · ${n0(g.treasury)} in treasury${g.nextTier?.toGo != null ? ` · ${n0(g.nextTier.toGo)} to next tier` : ''}</small></div><i>›</i></a>`).join('') : empty('No guilds found.')}
    ${chatNote('Joining, donating and guild boards happen in WhatsApp.')}${rawBox(d)}`
}
async function guildDetail(q, run) {
  let d, board
  try { [d, board] = await Promise.all([get(`/guilds/${encodeURIComponent(q)}`), get(`/guilds/${encodeURIComponent(q)}/board`).catch(() => null)]) } catch (e) { if (run === H.run) root.innerHTML = failBox(e, 'guilds'); return }
  if (run !== H.run) return
  const g = d.guild ?? d.def ?? d, members = arr(d.members ?? d.ranked ?? g.members), slips = arr(board?.slips ?? d.board?.slips ?? d.slips), id = g.id ?? q
  root.innerHTML = `<div class="hb-banner"><img src="${esc(guildImg(id, 'banner'))}" alt="" onerror="this.remove()"><div><b>${esc(clean(g.name ?? q))}</b>${g.tag ? `<small>[${esc(g.tag)}]</small>` : ''}</div></div>
    ${card('', `<div class="hb-grid3">${stat('Members', n0(g.memberCount ?? members.length))}${stat('Treasury', n0(g.treasury))}${stat('Tier', tierName(g.tier) || '–')}</div>${g.nextTier?.toGo != null ? `<p class="hb-sub">${n0(g.nextTier.toGo)} to the next tier</p>` : ''}${arr(g.perks).length ? `<p class="hb-sub">Perks: ${esc(arr(g.perks).map(p => clean(label(p))).join(', '))}</p>` : ''}`)}
    <h3 class="hb-h">Members</h3>${members.length ? `<div class="hb-list">${members.map((m, i) => `<div class="hb-li"><div><b>${i + 1}. ${esc(clean(m.name ?? m.playerName ?? m.id ?? 'Member'))}</b><small>${esc(human(m.role ?? ''))}${m.floors != null ? ` · ${n0(m.floors)} floors` : ''}${m.donated != null ? ` · ${n0(m.donated)} donated` : ''}</small></div>${m.score != null ? `<span>${n0(m.score)}</span>` : ''}</div>`).join('')}</div>` : empty('No members listed.')}
    <h3 class="hb-h">Today's board</h3>${slips.length ? slips.map(s => `<div class="hb-q"><div class="hb-qh"><b>${esc(clean(s.summary ?? 'Slip'))}</b>${s.rankLabel ? pill(clean(s.rankLabel)) : ''}</div>
      ${arr(s.steps).length ? `<ul class="hb-steps">${arr(s.steps).map(t => `<li>${esc(clean(typeof t === 'string' ? t : t.label ?? t.summary ?? t.text ?? ''))}</li>`).join('')}</ul>` : ''}<small>${esc(clean(s.rewardLabel ?? ''))}</small></div>`).join('') : empty('No slips posted today.')}
    ${chatNote('Take and turn in slips by walking the guild routes in WhatsApp.')}${rawBox(d)}`
}

/* ── Realms ── */
async function empires(arg) {
  const run = H.run; root.innerHTML = skeleton
  if (arg) return empireDetail(arg, run)
  let d, me
  try { [d, me] = await Promise.all([get(`/empires?sort=${encodeURIComponent(H.sort)}&n=25`), get('/empires/me').catch(() => null)]) } catch (e) { if (run === H.run) root.innerHTML = failBox(e, 'empires'); return }
  if (run !== H.run) return
  const list = arr(d.empires ?? d.list ?? d), mine = me?.empire
  const line = (e) => `${n0(e.population?.citizens ?? e.fame)} ${e.population ? 'citizens' : 'fame'} · ${n0(e.buildings)} buildings · ${n0(e.treasury)} treasury · army ${n0(e.army)} · defense ${n0(e.defense)}`
  root.innerHTML = `${mine ? card('Your realm', `<a class="hb-gl" href="#/hub/empires/${encodeURIComponent(mine.id ?? mine.name)}"><div><b>${esc(clean(mine.name))}</b><small>${esc(human(me.role ?? ''))}${mine.tier ? ` · tier ${tierName(mine.tier)}` : ''}</small></div><i>›</i></a>`, 'hb-hero') : ''}
    ${seg([['fame', 'Fame'], ['treasury', 'Treasury'], ['new', 'Newest'], ['active', 'Active']], H.sort, 'sort')}
    ${list.length ? list.map(e => `<a class="hb-card hb-gl" href="#/hub/empires/${encodeURIComponent(e.id ?? e.name)}"><div><b>${esc(clean(e.name))}${e.dormant ? ` ${pill('dormant')}` : ''}${e.war ? ` ${pill('at war', 'warn')}` : ''}</b>
      <small>${esc(`Tier ${label(e.tier) || '–'} · ${line(e)}${e.vassalOf ? ` · vassal of ${clean(label(e.vassalOf))}` : ''}`)}</small></div><i>›</i></a>`).join('') : empty('No realms yet.')}
    ${chatNote('Building, raids, wars and trade are done in WhatsApp.')}${rawBox(d)}`
}
async function empireDetail(q, run) {
  let d; try { d = await get(`/empires/${encodeURIComponent(q)}`) } catch (e) { if (run === H.run) root.innerHTML = failBox(e, 'empires'); return }
  if (run !== H.run) return
  const e = d.empire ?? d.record ?? d, regions = arr(d.regions ?? e.regions), blds = arr(d.buildings ?? e.buildings), wh = d.warehouse ?? e.warehouse ?? {}
  const mats = Array.isArray(wh.materials) ? wh.materials.map(m => [m.id ?? m.name, m.qty ?? m.amount ?? m.count]) : Object.entries(wh.materials ?? {})
  root.innerHTML = `<div class="hb-banner plain"><div><b>${esc(clean(e.name ?? q))}</b><small>Tier ${tierName(e.tier) || '–'}${e.vassalOf ? ` · vassal of ${esc(clean(label(e.vassalOf)))}` : ''}</small></div></div>
    ${card('', `<div class="hb-grid3">${stat('Fame', n0(e.fame))}${stat('Citizens', n0(e.population?.citizens ?? e.citizens))}${stat('Treasury', n0(e.treasury))}${stat('Army', n0(e.army))}${stat('Defense', n0(e.defense))}${stat('Slots left', n0(e.slotsLeft))}</div>`)}
    ${regions.length ? `<h3 class="hb-h">Regions</h3><div class="hb-regions">${regions.map(r => `<div class="hb-region"><b>${esc(clean(r.name ?? r.id ?? 'Region'))}</b>${arr(r.buildings).length ? arr(r.buildings).map(b => `<span>${esc(clean(b.name ?? b.type ?? b.id ?? 'Building'))}${b.level ? ` L${n0(b.level)}` : ''}${b.damaged ? ' ⚠' : ''}</span>`).join('') : '<small>Empty</small>'}</div>`).join('')}</div>` : ''}
    ${blds.length ? `<h3 class="hb-h">Buildings</h3><div class="hb-list">${blds.map(b => `<div class="hb-li"><div><b>${esc(clean(b.name ?? b.type ?? b.id ?? 'Building'))}${b.damaged ? ' ⚠' : ''}</b><small>${b.yieldPerHour != null ? `+${n0(b.yieldPerHour)}/h` : ''}${b.maintPerHour != null ? ` · −${n0(b.maintPerHour)}/h upkeep` : ''}${b.worker ? ` · ${esc(clean(label(b.worker)))}` : ''}</small></div>${b.level ? `<span>L${n0(b.level)}</span>` : ''}</div>`).join('')}</div>` : ''}
    ${(wh.cap || mats.length) ? `<h3 class="hb-h">Warehouse <small>${n0(wh.used)} / ${n0(wh.cap)}</small></h3>${wh.cap ? bar(pct(wh.used, wh.cap)) : ''}<div class="hb-mats">${mats.map(([k, v]) => `<span>${esc(human(k))} <b>${n0(v)}</b></span>`).join('')}</div>` : ''}
    ${d.economy ? card('Economy', kv(d.economy)) : ''}${(d.conflict && Object.keys(d.conflict).length) ? card('Conflict', kv(d.conflict)) : ''}${d.war ? card('War', kv(typeof d.war === 'object' ? d.war : { status: d.war })) : ''}
    ${chatNote('Realm actions are done in WhatsApp.')}${rawBox(d)}`
}

/* ── League ── */
const matchRow = (m) => `<button type="button" class="hb-li hb-match" ${m.id ? `data-match="${esc(m.id)}"` : ''}><div><b>${esc(clean(m.nameA ?? m.a ?? m.seatA ?? '?'))} vs ${esc(clean(m.nameB ?? m.b ?? m.seatB ?? '?'))}</b>
  <small>${m.day != null ? `Day ${n0(m.day)}` : ''}${m.dueDay != null ? ` · due day ${n0(m.dueDay)}` : ''}</small></div>${m.status ? pill(human(m.status), m.played ? 'ok' : '') : ''}</button>`
async function league() {
  const run = H.run; root.innerHTML = skeleton
  let d; try { d = H.league = await get('/league') } catch (e) { if (run === H.run) root.innerHTML = failBox(e, 'league'); return }
  if (run !== H.run) return
  const tab = H.leagueTab, head = `${seg([['overview', 'Overview'], ['table', 'Table'], ['fixtures', 'Fixtures'], ['mine', 'My bouts']], tab, 'ltab')}`
  if (d.open === false) { root.innerHTML = card('', `<b>The League is away</b><p class="hb-sub">${esc(clean(d.unavailableReason ?? 'Check back later.'))}</p>`) + rawBox(d); return }
  root.innerHTML = head + '<div id="hbLeague">' + skeleton + '</div>'
  const box = $('#hbLeague', root), fill = (h) => { if (run === H.run && box) box.innerHTML = h }
  try {
    if (tab === 'overview') {
      const s = d.season, clock = d.clock ?? {}, st = d.seating ?? {}
      fill(`${card('', `<div class="hb-grid3">${stat('Season', esc(String(label(s) || '–')))}${stat('Day', `${n0(clock.day)} / ${n0(clock.lastDay)}`)}${stat('Seats', `${n0(st.seats ?? arr(d.seats).length)}`)}</div>`, 'hb-hero')}
        ${arr(d.today).length ? `<h3 class="hb-h">Today</h3><div class="hb-list">${arr(d.today).map(matchRow).join('')}</div>` : ''}
        ${arr(d.results).length ? `<h3 class="hb-h">Recent results</h3><div class="hb-list">${arr(d.results).slice(0, 10).map(matchRow).join('')}</div>` : ''}
        ${arr(d.honors).length ? `<h3 class="hb-h">Honors</h3>${arr(d.honors).map(h => `<p class="hb-sub">★ ${esc(clean(typeof h === 'string' ? h : h.label ?? h.name ?? h.title ?? ''))}</p>`).join('')}` : ''}${rawBox(d)}`)
    } else if (tab === 'table') {
      const t = await get('/league/table'), rows = arr(t.table ?? t.rows ?? t.entries ?? t)
      fill(rows.length ? `<div class="hb-list">${rows.map((r, i) => `<div class="hb-li"><div><b>${n0(r.place ?? i + 1)}. ${esc(clean(r.name ?? r.playerName ?? r.seatName ?? 'Seat'))}</b><small>${esc(clean(r.streakLine ?? ''))}</small></div><span>${n0(r.points ?? r.pts)}</span></div>`).join('')}</div>${rawBox(t)}` : empty('The table is empty.'))
    } else if (tab === 'fixtures') {
      const f = await get('/league/fixtures'), days = arr(f.fixtures), cur = H.leagueDay ?? d.clock?.day ?? days[0]?.day, shown = days.find(x => Number(x.day) === Number(cur)) ?? days[0]
      fill(`<div class="hb-chips">${days.map(x => `<button type="button" data-lday="${esc(x.day)}" class="${Number(x.day) === Number(shown?.day) ? 'on' : ''}">Day ${n0(x.day)}</button>`).join('')}</div>
        ${shown ? `<div class="hb-list">${arr(shown.matches).map(m => matchRow({ ...m, day: shown.day })).join('')}</div>` : empty('No fixtures yet.')}`)
    } else {
      const m = await get('/league/me')
      if (m.seated === false) { fill(card('', `<b>You are not seated this season</b><p class="hb-sub">${esc(clean(m.reason ?? m.nextStep ?? ''))}</p>`) + rawBox(m)); return }
      fill(`${arr(m.awaiting).length ? card('Waiting on you', arr(m.awaiting).map(a => `<p class="hb-sub"><b>${esc(clean(label(a.opponent)))}</b> · ${esc(human(a.type ?? ''))} · ${esc(human(a.status ?? ''))}</p>`).join('') + chatNote('Answer bouts in WhatsApp.'), 'hb-ready') : ''}
        ${m.row ? card('Your row', `<div class="hb-kvs">${kv(m.row)}</div>`) : ''}
        ${m.nextStep ? card('', `<p class="hb-sub">${esc(clean(m.nextStep))}</p>`) : ''}
        ${arr(m.next).length ? `<h3 class="hb-h">Next</h3><div class="hb-list">${arr(m.next).map(matchRow).join('')}</div>` : ''}
        ${arr(m.recent).length ? `<h3 class="hb-h">Recent</h3><div class="hb-list">${arr(m.recent).map(matchRow).join('')}</div>` : ''}${rawBox(m)}`)
    }
  } catch (e) { fill(failBox(e, 'league')) }
}
async function matchSheet(id) {
  openSheet('<div class="hb-skel"></div>')
  try {
    const m = await get(`/league/matches/${encodeURIComponent(id)}`), a = m.seatAInfo ?? {}, b = m.seatBInfo ?? {}
    openSheet(`<h3 class="hb-sh">${esc(clean(m.label ?? `${a.name ?? m.nameA ?? '?'} vs ${b.name ?? m.nameB ?? '?'}`))}</h3>
      <div class="hb-grid3">${stat('Status', esc(human(m.status ?? '–')))}${stat('Day', n0(m.day))}${stat('Open', m.open ? 'Yes' : 'No')}</div>
      ${m.pendingSeat != null ? `<p class="hb-sub">Waiting on seat ${esc(String(m.pendingSeat))}.</p>` : ''}
      ${m.winner != null ? `<p class="hb-sub">Winner: ${esc(clean(String(label(m.winner))))}</p>` : ''}
      <button type="button" class="btn btn-primary btn-block" data-close>Close</button>`, (box) => box.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet() }))
  } catch (e) { closeSheet(); toast(errMsg(e)) }
}

/* ── router + events ── */
const SCREENS = { wallet, storage, quests, achievements, guilds, empires, league }
export function renderHub() {
  if (!signedIn()) return
  const host = $('#hubRoot'); if (!host) return
  root = host
  const [, screen = '', arg = ''] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').map(decodeURIComponent)
  const key = `${screen}/${arg}`
  if (key !== H.key) { window.scrollTo(0, 0); H.key = key }
  H.run++
  for (const ms of [0, 120]) setTimeout(() => { const t = $('#appTitle'); if (t && location.hash.startsWith('#/hub')) t.textContent = TITLES[screen] ?? 'Hub' }, ms)
  const fn = SCREENS[screen] ?? home
  fn(arg).catch(e => { root.innerHTML = failBox(e, 'retry') })
  if (!host._wired) {
    host._wired = true
    host.addEventListener('click', (ev) => {
      const t = ev.target
      let b
      if ((b = t.closest('[data-retry]'))) return renderHub()
      if ((b = t.closest('[data-m]'))) return moneyMove(b.dataset.m)
      if ((b = t.closest('[data-stab]'))) { H.tab.storage = b.dataset.stab; return paintStorage(H.storage) }
      if ((b = t.closest('.hb-item[data-i]'))) return moveSheet(H.tab.storage ?? 'bag', Number(b.dataset.i))
      if ((b = t.closest('[data-unlock]'))) return buyBox(b.dataset.unlock)
      if ((b = t.closest('[data-claim]'))) { const [k, id] = b.dataset.claim.split(':'); return claim(k, id) }
      if ((b = t.closest('[data-claimall]'))) return claim(b.dataset.claimall, '')
      if ((b = t.closest('[data-track]'))) { H.track = b.dataset.track; return achievements() }
      if ((b = t.closest('[data-sort]'))) { H.sort = b.dataset.sort; return renderHub() }
      if ((b = t.closest('[data-ltab]'))) { H.leagueTab = b.dataset.ltab; return league() }
      if ((b = t.closest('[data-lday]'))) { H.leagueDay = Number(b.dataset.lday); return league() }
      if ((b = t.closest('[data-match]'))) return matchSheet(b.dataset.match)
    })
  }
}
