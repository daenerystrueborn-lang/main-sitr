/* Pokémon page: Battle (hunt / tower), Party (care), Bag (items), Shop. */
import { $, $$, pk, route, esc, num, typeChip, TYPE_COLOR, hpBar, hpClass, pctOf, fail, openSheet, closeSheet, sleep } from './core.js'
import { toast } from '../js/ui.js'
import { spriteImg, itemIcon, REGION_BG, loadBg } from './showdown.js'
import { mountBattle, showBattle, inBattle } from './battle.js'
import { teamHurt } from './notify.js'

let META = null
const T = { tab: 'battle', gen: 0, region: '' }
const META_KEY = 'astral:pk-meta'
const loadMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || 'null') } catch { return null } }
const saveMeta = (m) => { try { localStorage.setItem(META_KEY, JSON.stringify(m)) } catch {} }
const cap = (s) => String(s ?? '').replace(/(^|[\s_-])\w/g, m => m.toUpperCase()).replace(/[_-]/g, ' ')
const img = (m, opts = {}) => spriteImg(m.name, { dex: m.dexId, shiny: m.shiny, ...opts })
const stage = () => $('#pkStage')
const locationArt = (key) => REGION_BG[String(key ?? '').toLowerCase()]?.[0] ?? 'route'
function paintLocationBackdrop(el, name) {
  if (!el || !name) return
  el.dataset.pkBg = name
  loadBg([name]).then(url => {
    if (url && el.isConnected && el.dataset.pkBg === name) el.style.setProperty('--pk-location-image', `url("${url}")`)
  })
}

export async function renderPokemon() {
  const host = $('#pokemonRoot'); if (!host) return
  if (!$('#pkTabs', host)) {
    host.innerHTML = `
      <div class="pk-seg" id="pkTabs">${[['battle', 'Battle'], ['party', 'Party'], ['bag', 'Bag'], ['shop', 'Shop']]
        .map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</div>
      <div id="pkStage"><div class="wl-skel tall"></div></div>`
    $$('#pkTabs [data-t]', host).forEach(b => b.addEventListener('click', () => { T.tab = b.dataset.t; draw() }))
    mountBattle(stage(), () => { stage().dataset.tab = ''; renderPokemon() })
  }
  if ((inBattle() && $('#pkScene', host)) || $('#pkDone', host)) return          // a battle is on screen: leave it alone
  try {
    if (!META) { META = loadMeta(); if (!META) { META = await pk.meta(); saveMeta(META) } }
    const live = pk.battle().catch(() => null)             // checked in parallel; tabs paint from cache meanwhile
    $('#pkTabs').style.display = ''
    draw()
    const b = await live
    if (route() !== 'pokemon' || !b) return
    if (b.battle && !b.battle.ended) { T.gen++; $('#pkTabs').style.display = 'none'; showBattle(b) }
  } catch (e) { fail(stage() ?? host, e, renderPokemon) }
}

async function draw() {
  const gen = ++T.gen, ok = () => gen === T.gen
  $$('#pkTabs [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === T.tab))
  const st = stage()
  if (st.dataset.tab !== T.tab) st.innerHTML = '<div class="wl-skel tall"></div>'   // skeleton only the first time; revisits redraw in place
  try {
    await ({ battle: drawBattleTab, party: drawParty, bag: drawBag, shop: (el, k) => drawShop(el, null, k) }[T.tab])(st, ok)
    if (ok()) st.dataset.tab = T.tab
  } catch (e) { if (ok()) fail(st, e, draw) }
}

/* ───────────── battle tab ───────────── */

async function drawBattleTab(st, ok = () => true) {
  const [o, t] = await Promise.all([pk.overview(), pk.tower().catch(() => null)])
  if (!ok()) return
  if (o.needsStarter) {
    st.innerHTML = `<div class="pk-card"><h2 class="pk-h">Choose your starter</h2>
      <p class="subtext">Every trainer begins with one partner. Pick wisely.</p>
      <div class="pk-starters">${(META.starters ?? []).map(s => `
        <button class="pk-starter" data-dex="${s.dexId}">${spriteImg(s.name, { dex: s.dexId })}<b>${esc(s.name)}</b>
        <div>${(s.types ?? []).map(typeChip).join('')}</div></button>`).join('')}</div></div>`
    $$('[data-dex]', st).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true
      try { await pk.starter(Number(b.dataset.dex)); toast('Your journey begins!', 'ok'); draw() } catch (e) { toast(e.message); b.disabled = false }
    }))
    return
  }
  const party = o.party ?? []
  const hurt = party.some(m => m.fainted || pctOf(m.hp, m.maxHp) < 50)
  teamHurt(hurt)
  const regions = (META.regions ?? []).filter(r => r?.key != null)
  if (!regions.some(r => String(r.key) === T.region)) T.region = ''
  const selectedRegion = regions.find(r => String(r.key) === T.region)
  const selectedName = selectedRegion ? cap(selectedRegion.key) : ''
  const next = t && !t.championed && t.nextStage ? t.masters?.find(m => m.stage === t.nextStage) : null
  st.innerHTML = `
    ${hurt ? `<div class="pk-warn"><span>Your team is hurt. Heal up before battling.</span><button class="btn btn-gold btn-sm" id="pkHealNow">Heal all</button></div>` : ''}
    <section class="pk-adventure-hero" id="pkAdventureHero" aria-label="Pokémon adventure">
      <div class="pk-adventure-copy">
        <div class="pk-adventure-kicker"><i></i> THE WILD IS CALLING</div>
        <h2>Your next<br>Pokémon awaits.</h2>
        <p>Choose a region—or let the wild surprise you.</p>
        <div class="pk-adventure-tags"><span>⚔ Wild encounters</span><span>✦ ${num(party.length)} partners</span></div>
      </div>
      <div class="pk-adventure-partner" aria-hidden="true">${party[0] ? img(party[0]) : '<span>⚔</span>'}</div>
    </section>
    <section class="pk-location-section" aria-labelledby="pkLocationTitle">
      <div class="pk-location-head">
        <div><span class="pk-location-kicker">SET YOUR DESTINATION</span><h3 class="pk-h3" id="pkLocationTitle">Where to, Trainer?</h3></div>
        <span class="pk-location-count"><b>${num(regions.length)}</b><small>regions</small></span>
      </div>
      <p class="pk-location-hint">Pick a place or tap Anywhere to let fate decide.</p>
      <div class="pk-location-track" role="group" aria-label="Choose a Pokémon hunt location">
        <button class="pk-location-card ${T.region ? '' : 'on'}" type="button" data-region="" data-loc-bg="route" aria-pressed="${!T.region}">
          <span class="pk-location-mark">✦</span><span class="pk-location-name"><b>Anywhere</b><small>Surprise encounter</small></span><span class="pk-location-check" aria-hidden="true">✓</span>
        </button>
        ${regions.map(r => {
          const key = String(r.key), chosen = key === T.region
          return `<button class="pk-location-card ${chosen ? 'on' : ''}" type="button" data-region="${esc(key)}" data-loc-bg="${locationArt(key)}" aria-pressed="${chosen}">
            <span class="pk-location-mark">⌖</span><span class="pk-location-name"><b>${esc(cap(key))}</b><small>Explore the wilds</small></span><span class="pk-location-check" aria-hidden="true">✓</span>
          </button>`
        }).join('')}
      </div>
      <p class="pk-art-credit">Location art from the <a href="https://github.com/smogon/pokemon-showdown-client/tree/master/play.pokemonshowdown.com/fx" target="_blank" rel="noopener noreferrer">Pokémon Showdown client</a>.</p>
    </section>
    <button class="pk-start-hunt" id="pkHunt" type="button">
      <span class="pk-start-hunt-icon" aria-hidden="true">⚔</span>
      <span class="pk-start-hunt-copy"><b id="pkHuntTitle">${selectedRegion ? `Explore ${esc(selectedName)}` : 'Battle anywhere'}</b>
        <small id="pkHuntHint">${selectedRegion ? `Look for wild Pokémon in ${esc(selectedName)}.` : 'Find a wild Pokémon in any region.'}</small></span>
      <span class="pk-start-hunt-arrow" aria-hidden="true">→</span>
    </button>
    ${next ? `<div class="pk-card pk-tower">
      <div class="pk-kicker">Sinnoh League · Stage ${num(next.stage)} / ${num(t.total)}</div>
      <h3 class="pk-h3">${esc(next.emoji ?? '')} ${esc(next.name)} <small>${esc(next.title ?? '')}</small></h3>
      <div class="subtext">Level ${num(next.level)} · ${num(next.team?.length ?? 0)} Pokémon</div>
      <button class="btn pk-wide" id="pkTower">Challenge</button></div>`
      : t?.championed ? '<div class="pk-card"><b>🏆 League Champion</b></div>' : ''}
    <section class="pk-squad">
      <div class="pk-squad-head"><div><span class="pk-location-kicker">YOUR TEAM</span><h3 class="pk-h3">Ready to go</h3></div><button class="pk-link" data-t="party">Manage ›</button></div>
      <div class="pk-strip">${party.map(m => `<div class="pk-chip ${m.fainted ? 'faint' : ''}">${img(m, { list: true })}<b>${esc(m.nickname ?? m.name)}</b><small>Lv ${num(m.level)}</small>${hpBar(m.hp, m.maxHp)}</div>`).join('')}</div>
    </section>`

  const hero = $('#pkAdventureHero', st)
  paintLocationBackdrop(hero, selectedRegion ? locationArt(selectedRegion.key) : 'route')
  $$('.pk-location-card', st).forEach(card => {
    paintLocationBackdrop(card, card.dataset.locBg)
    card.addEventListener('click', () => {
      T.region = card.dataset.region ?? ''
      const chosen = regions.find(r => String(r.key) === T.region)
      $$('.pk-location-card', st).forEach(option => {
        const active = option.dataset.region === T.region
        option.classList.toggle('on', active)
        option.setAttribute('aria-pressed', String(active))
      })
      $('#pkHuntTitle', st).textContent = chosen ? `Explore ${cap(chosen.key)}` : 'Battle anywhere'
      $('#pkHuntHint', st).textContent = chosen ? `Look for wild Pokémon in ${cap(chosen.key)}.` : 'Find a wild Pokémon in any region.'
      paintLocationBackdrop(hero, chosen ? locationArt(chosen.key) : 'route')
    })
  })
  $('[data-t=party]', st)?.addEventListener('click', () => { T.tab = 'party'; draw() })
  $('#pkHealNow')?.addEventListener('click', async () => { try { await pk.heal(); toast('Team healed', 'ok'); draw() } catch (e) { toast(e.message) } })
  $('#pkHunt').addEventListener('click', async (e) => {
    const b = e.currentTarget, region = T.region || null; b.disabled = true
    $('#pkTabs').style.display = 'none'
    try { await showBattle(await pk.hunt(region), { kind: 'wild', region }) }
    catch (err) {
      if (err.code === 'IN_BATTLE' && err.body?.battle) return showBattle(err.body)
      $('#pkTabs').style.display = ''; toast(err.message); b.disabled = false
    }
  })
  $('#pkTower')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; $('#pkTabs').style.display = 'none'
    try { await showBattle(await pk.challenge(next.stage), { kind: 'tower', master: next }) }
    catch (err) { $('#pkTabs').style.display = ''; toast(err.message); b.disabled = false }
  })
}

/* ───────────── party tab (care) ───────────── */

async function drawParty(st, ok = () => true) {
  const [pr, box] = await Promise.all([pk.party(), pk.mons('&sort=level')])
  if (!ok()) return
  const party = pr.party ?? [], ids = party.map(m => m.id)
  const bench = (box.mons ?? []).filter(m => !m.inParty)
  ;[...party, ...bench].forEach(m => MONS.set(m.id, m))
  st.innerHTML = `
    <div class="pk-row" style="margin-bottom:8px"><h3 class="pk-h3">Party <small>${party.length}/${pr.partyMax ?? 6}</small></h3><button class="btn btn-gold btn-sm" id="pkHealAll">Heal all</button></div>
    <div class="pk-party">${party.map((m, i) => `
      <div class="pk-mon ${m.fainted ? 'faint' : ''}" data-mon="${esc(m.id)}">
        ${img(m, { list: true })}
        <div class="pk-mon-body">
          <div class="pk-mon-name">${esc(m.nickname ?? m.name)} <small>Lv ${num(m.level)}</small>${m.main ? ' <span class="pk-star">★</span>' : ''}</div>
          ${hpBar(m.hp, m.maxHp)}
          <div class="pk-exp"><i style="width:${pctOf(m.exp, m.expNext)}%"></i></div>
          <div class="pk-mon-meta">${(m.types ?? []).map(typeChip).join('')}${m.held ? `<span class="pk-held">${itemIcon(m.held.id, m.held.iconUrl, 1)}${esc(m.held.name)}</span>` : '<span>No item</span>'}</div>
        </div>
        <div class="pk-ord"><button data-mv="-1" ${i === 0 ? 'disabled' : ''}>▲</button><button data-mv="1" ${i === party.length - 1 ? 'disabled' : ''}>▼</button></div>
      </div>`).join('') || '<p class="subtext">Your party is empty. Add a Pokémon from your box below.</p>'}</div>
    <div class="pk-row" style="margin:18px 2px 8px"><h3 class="pk-h3">Box <small>${bench.length}</small></h3></div>
    <div class="pk-box">${bench.map(m => `<button class="pk-tile" data-mon="${esc(m.id)}">${img(m, { still: true })}<b>${esc(m.nickname ?? m.name)}</b><small>Lv ${num(m.level)}</small></button>`).join('')
      || '<p class="subtext">Everything you own is in your party.</p>'}</div>`

  $('#pkHealAll').addEventListener('click', async () => { try { await pk.heal(); toast('Team healed', 'ok'); draw() } catch (e) { toast(e.message) } })
  $$('[data-mon]', st).forEach(el => {
    el.addEventListener('pointerdown', () => pk.mon(el.dataset.mon).catch(() => {}), { passive: true })
    el.addEventListener('click', (e) => { if (!e.target.closest('.pk-ord')) openMon(el.dataset.mon) })
  })
  prefetch(ids)
  $$('.pk-ord [data-mv]', st).forEach(b => b.addEventListener('click', async () => {
    const row = b.closest('[data-mon]'), i = ids.indexOf(row.dataset.mon), j = i + Number(b.dataset.mv)
    const next = [...ids]; [next[i], next[j]] = [next[j], next[i]]
    try { await pk.setParty(next); draw() } catch (e) { toast(e.message) }
  }))
}

const STATS = [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']]

const MONS = new Map()   // list rows from Party/Box: lets a sheet paint instantly before its details arrive
let dirty = false       // something changed inside a sheet, so redraw the Party tab once it closes
const afterClose = () => { if (dirty) { dirty = false; if (T.tab === 'party') draw() } }

/** Warm the cache for the party's detail sheets, one Pokémon at a time so it never competes with taps. */
async function prefetch(ids) {
  for (const id of ids) {
    if (route() !== 'pokemon' || T.tab !== 'party') return
    await Promise.all([pk.mon(id).catch(() => {}), pk.evolution(id).catch(() => {})])
    await sleep(60)
  }
}

const monHead = (m) => `
  <div class="pk-hero ${(m.types?.[0] ?? '').toLowerCase()}">${img(m)}</div>
  <h2 class="pk-h">${esc(m.nickname ?? m.name)} <small>Lv ${num(m.level)}</small>${m.shiny ? ' ✨' : ''}</h2>
  <div class="pk-mon-meta">${(m.types ?? []).map(typeChip).join('')}${m.ability || m.nature ? `<span>${esc(m.ability ?? '')} · ${esc(m.nature?.name ?? '')}</span>` : ''}</div>
  ${hpBar(m.hp, m.maxHp)}<div class="pk-hpnum" style="text-align:left">${num(m.hp)} / ${num(m.maxHp)} HP</div>
  <div class="pk-exp"><i style="width:${pctOf(m.exp, m.expNext)}%"></i></div><div class="pk-hpnum" style="text-align:left">${num(m.exp)} / ${num(m.expNext)} EXP</div>`

const monBody = (m) => `
  <div class="pk-stats">${STATS.map(([k, l]) => `<div><span>${l}</span><i style="--w:${Math.min(100, Math.round((m.stats?.[k] ?? 0) / 3))}%"></i><b>${num(m.stats?.[k] ?? 0)}</b></div>`).join('')}</div>
  <div class="pk-row" style="margin:16px 0 8px"><h4 class="pk-h4" style="margin:0">Moves</h4><button class="pk-link" id="mnMoves">Edit moves</button></div>
  <div class="pk-mvlist">${(m.moves ?? []).map(x => `<div style="--tc:${typeColor(x.type)}"><b>${esc(x.name)}</b><span>${esc(x.type)} · ${x.power ? 'Pwr ' + num(x.power) : esc(x.category ?? 'Status')}</span></div>`).join('')}</div>
  <h4 class="pk-h4">Held item</h4>
  <div class="pk-held-row">${m.held ? `${itemIcon(m.held.id, m.held.iconUrl)}<b>${esc(m.held.name)}</b><button class="pk-link" id="mnUnhold">Remove</button>` : '<span class="subtext">Nothing held</span>'}
    <button class="pk-link" id="mnHold">${m.held ? 'Change' : 'Give item'}</button></div>
  <h4 class="pk-h4">Care</h4>
  <div class="pk-actions">
    <button class="pk-act" id="mnFeed">🍖 Feed</button>
    <button class="pk-act" id="mnTrain">💪 Train</button>
    ${m.inParty ? '<button class="pk-act" id="mnParty" data-a="remove">Remove from party</button>' : '<button class="pk-act" id="mnParty" data-a="add">Add to party</button>'}
    ${m.main ? '' : '<button class="pk-act" id="mnMain">★ Make main</button>'}
  </div>
  <div class="pk-trainrow" id="trainRow" hidden>${STATS.map(([k, l]) => `<button data-stat="${k}">${l}</button>`).join('')}</div>`

function openMon(id) {
  const base = MONS.get(id)
  const sheet = openSheet(base ? `<div class="pk-detail">${monHead(base)}<div class="wl-skel" style="height:140px;margin-top:14px"></div></div>` : '<div class="wl-skel tall"></div>', null, afterClose)
  const box = () => (sheet.isConnected ? $('.pk-modal-box', sheet) : null)
  let cur = null

  const paint = (m) => {
    const b = box(); if (!b) return
    cur = m; b.innerHTML = `<div class="pk-detail">${monHead(m)}${monBody(m)}</div>`
    wire(m, b)
  }
  const load = async () => {
    try {
      const { mon } = await pk.mon(id)
      MONS.set(id, { ...(MONS.get(id) ?? {}), ...mon })
      paint(mon)
      pk.evolution(id).then(ev => { if (ev?.ready && box() && cur?.id === mon.id) addEvolve(mon, ev.ready) }).catch(() => {})
    } catch (e) { const b = box(); if (b) b.innerHTML = `<p style="padding:20px">${esc(e.message)}</p>` }
  }
  const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok(r), 'ok'); dirty = true; await load() } catch (e) { toast(e.message) } }

  function addEvolve(m, ready) {
    const a = $('.pk-actions', box()); if (!a || $('#mnEvolve', a)) return
    a.insertAdjacentHTML('afterbegin', `<button class="pk-act gold" id="mnEvolve">✨ Evolve → ${esc(ready.name)}</button>`)
    $('#mnEvolve', a).addEventListener('click', async () => {
      try {
        const r = await pk.evolve(id); toast(`${m.name} evolved!`, 'ok'); dirty = true
        const to = r.mon?.name ?? ready.name
        $('.pk-hero', box()).innerHTML = `<div class="pk-evo-spr big">${spriteImg(m.name, { dex: m.dexId })}${spriteImg(to, {}, 'pk-spr new')}</div>`
        setTimeout(load, 2800)
      } catch (e) { toast(e.message) }
    })
  }
  function wire(m, b) {
    $('#mnFeed', b).addEventListener('click', () => act(() => pk.feed(id), r => r.leveledUp ? `+${r.gain} EXP — level ${r.leveledUp.to}!` : `+${r.gain} EXP`))
    $('#mnTrain', b).addEventListener('click', () => { const r = $('#trainRow', b); r.hidden = !r.hidden })
    $$('[data-stat]', b).forEach(x => x.addEventListener('click', () => act(() => pk.train(id, x.dataset.stat), () => `Trained ${x.textContent}`)))
    $('#mnMain', b)?.addEventListener('click', () => act(() => pk.setMain(id), () => 'Main Pokémon set'))
    $('#mnParty', b).addEventListener('click', (e) => act(() => pk.partyAction(e.currentTarget.dataset.a, id), () => 'Party updated'))
    $('#mnUnhold', b)?.addEventListener('click', () => act(() => pk.unhold(id), () => 'Item removed'))
    $('#mnHold', b).addEventListener('click', () => pickHeld(id))
    $('#mnMoves', b).addEventListener('click', () => openMoves(id))
  }
  load()
}

/* ───────────── move editor ───────────── */

const normMove = (x) => (typeof x === 'string' ? { id: x, name: x } : x)
const mvKey = (x) => String(x.id ?? x.name)

async function openMoves(id) {
  const sheet = openSheet('<div class="wl-skel tall"></div>', null, afterClose)
  const box = $('.pk-modal-box', sheet)
  const back = () => openMon(id)
  let m, pool
  try {
    const [{ mon }, ls] = await Promise.all([pk.mon(id), pk.learnset(id)])
    m = mon
    pool = (Array.isArray(ls) ? ls : ls.learnset ?? ls.moves ?? ls.available ?? ls.learnable ?? []).map(normMove)
  } catch (e) {
    box.innerHTML = `<p style="padding:16px 4px">${esc(e.message)}</p><button class="pk-act" id="mvBack" style="width:100%">‹ Back</button>`
    $('#mvBack', box).addEventListener('click', back); return
  }
  const can = (x) => x.learnable ?? x.canLearn ?? (x.level == null || x.level <= (m.level ?? 0))
  const slots = (m.moves ?? []).slice(0, 4).map(normMove)
  const start = slots.map(mvKey).join('|')
  let sel = -1, q = ''

  box.innerHTML = `
    <div class="pk-row"><h3 class="pk-h3">${esc(m.nickname ?? m.name)}'s moves</h3><button class="pk-link" id="mvBack">‹ Back</button></div>
    <div class="pk-mvslots" id="mvSlots"></div><div id="mvBar"></div>
    <input class="pk-search" id="mvQ" type="search" placeholder="Search moves" autocomplete="off">
    <div class="pk-mvpool" id="mvPool"></div>
    <button class="btn btn-gold pk-wide" id="mvSave" style="margin-top:12px">Save moves</button>`

  const detail = (x) => `${esc(x.type ?? '')}${x.power ? ' · Pwr ' + num(x.power) : x.category ? ' · ' + esc(x.category) : ''}${x.accuracy ? ' · ' + num(x.accuracy) + '%' : ''}`
  const paintSlots = () => {
    $('#mvSlots', box).innerHTML = [0, 1, 2, 3].map(i => {
      const x = slots[i]
      return `<button class="pk-mvslot ${i === sel ? 'on' : ''} ${x ? '' : 'empty'}" data-s="${i}" style="--tc:${TYPE_COLOR[String(x?.type).toLowerCase()] ?? '#555'}">${x ? `<b>${esc(x.name)}</b><span>${detail(x)}</span>` : '<b>Empty</b><span>Pick a move below</span>'}</button>`
    }).join('')
    $('#mvBar', box).innerHTML = sel >= 0 && slots[sel]
      ? `<div class="pk-selbar"><span>Replacing <b>${esc(slots[sel].name)}</b>. Pick a move below.</span><button class="pk-link" id="mvRemove">Remove</button><button class="pk-link" id="mvCancel">Cancel</button></div>` : ''
    $$('[data-s]', box).forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.s); sel = sel === i ? -1 : i; paintSlots(); paintPool() }))
    $('#mvRemove', box)?.addEventListener('click', () => { slots.splice(sel, 1); sel = -1; paintSlots(); paintPool() })
    $('#mvCancel', box)?.addEventListener('click', () => { sel = -1; paintSlots() })
    const changed = slots.map(mvKey).join('|') !== start
    const save = $('#mvSave', box); save.disabled = !changed || !slots.length
  }
  const paintPool = () => {
    const known = new Set(slots.map(mvKey)), needle = q.trim().toLowerCase()
    const rows = pool.filter(x => !needle || String(x.name).toLowerCase().includes(needle))
      .sort((a, b) => (can(b) - can(a)) || ((a.level ?? 0) - (b.level ?? 0)) || String(a.name).localeCompare(String(b.name)))
    $('#mvPool', box).innerHTML = rows.map(x => {
      const k = mvKey(x), ok = can(x), has = known.has(k)
      return `<button class="pk-mvrow" data-k="${esc(k)}" ${ok && !has ? '' : 'disabled'} style="--tc:${TYPE_COLOR[String(x.type).toLowerCase()] ?? '#888'}">
        <div><b>${esc(x.name)}</b><span>${detail(x)}</span></div><em>${has ? 'Known' : ok ? (x.level ? 'Lv ' + num(x.level) : '') : 'Lv ' + num(x.level ?? '?')}</em></button>`
    }).join('') || '<p class="subtext" style="padding:10px 2px">No moves found.</p>'
    $$('[data-k]', box).forEach(b => b.addEventListener('click', () => {
      const mv = pool.find(x => mvKey(x) === b.dataset.k); if (!mv) return
      if (sel >= 0 && sel < slots.length) slots[sel] = mv
      else if (slots.length < 4) slots.push(mv)
      else return toast('Tap one of your four moves first to choose what it replaces.')
      sel = -1; paintSlots(); paintPool()
    }))
  }
  paintSlots(); paintPool()
  $('#mvQ', box).addEventListener('input', (e) => { q = e.target.value; paintPool() })
  $('#mvBack', box).addEventListener('click', back)
  $('#mvSave', box).addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true
    try { await pk.setMoves(id, slots.map(mvKey)); toast('Moves saved', 'ok'); dirty = true; back() }
    catch (err) { toast(err.message); b.disabled = false }
  })
}
const typeColor = (t) => ({ normal:'#a8a77a', fire:'#ee8130', water:'#6390f0', electric:'#f7d02c', grass:'#7ac74c', ice:'#96d9d6', fighting:'#c22e28', poison:'#a33ea1', ground:'#e2bf65', flying:'#a98ff3', psychic:'#f95587', bug:'#a6b91a', rock:'#b6a136', ghost:'#735797', dragon:'#6f35fc', dark:'#705746', steel:'#b7b7ce', fairy:'#d685ad' }[String(t).toLowerCase()] ?? '#888')

async function pickHeld(monId) {
  let items
  try { items = ((await pk.bag()).items ?? []).filter(i => i.qty > 0 && (i.category === 'held' || i.mega)) } catch (e) { return toast(e.message) }
  const s = openSheet(`<h3 class="pk-h3" style="margin-bottom:10px">Give which item?</h3>
    <div class="pk-items">${items.map(i => `<button class="pk-item" data-i="${esc(i.id)}">${itemIcon(i.id, i.iconUrl)}<b>${esc(i.name)}</b><small>×${num(i.qty)}</small></button>`).join('')
      || '<p class="subtext">You have no holdable items. Buy some in the Shop tab.</p>'}</div>`)
  $$('[data-i]', s).forEach(b => b.addEventListener('click', async () => {
    try { await pk.hold(monId, b.dataset.i); toast('Item given', 'ok'); dirty = true; openMon(monId) } catch (e) { toast(e.message) }
  }))
}

/* ───────────── bag tab ───────────── */

async function drawBag(st, ok = () => true) {
  const r = await pk.bag()
  if (!ok()) return
  const items = (r.items ?? []).filter(i => i.qty > 0)
  const groups = {}; items.forEach(i => (groups[i.category] ??= []).push(i))
  st.innerHTML = `
    ${r.importable ? `<div class="pk-warn"><span>${num(r.importable)} Pokémon items are in your bot inventory.</span><button class="btn btn-gold btn-sm" id="pkImport">Import</button></div>` : ''}
    ${Object.entries(groups).map(([cat, list]) => `
      <h4 class="pk-h4">${esc(cap(cat))}</h4>
      <div class="pk-itemlist">${list.map(i => `
        <div class="pk-it">${itemIcon(i.id, i.iconUrl, 1.6)}
          <div class="pk-it-body"><b>${esc(i.name)} <small>×${num(i.qty)}</small></b><p>${esc(i.description ?? '')}</p></div>
          ${i.usableOutside ? `<button class="btn btn-sm" data-use="${esc(i.id)}">Use</button>`
            : (i.category === 'held' || i.mega) ? `<button class="btn btn-sm" data-give="${esc(i.id)}">Give</button>`
            : i.category === 'evolution' ? `<button class="btn btn-sm" data-stone="${esc(i.id)}">Use</button>` : ''}
        </div>`).join('')}</div>`).join('') || '<div class="pk-card" style="text-align:center"><p class="subtext">Your bag is empty. Visit the Shop tab.</p></div>'}`
  $('#pkImport')?.addEventListener('click', async () => { try { await pk.importBag(); toast('Imported', 'ok'); draw() } catch (e) { toast(e.message) } })

  const pickMon = async (title, fn) => {
    const party = (await pk.party()).party ?? []
    const s = openSheet(`<h3 class="pk-h3" style="margin-bottom:10px">${esc(title)}</h3><div class="pk-party">${party.map(m => `
      <button class="pk-mon" data-p="${esc(m.id)}">${img(m, { still: true })}<div class="pk-mon-body"><div class="pk-mon-name">${esc(m.nickname ?? m.name)} <small>Lv ${num(m.level)}</small></div>${hpBar(m.hp, m.maxHp)}</div></button>`).join('')}</div>`)
    $$('[data-p]', s).forEach(b => b.addEventListener('click', async () => {
      try { await fn(b.dataset.p); closeSheet(); draw() } catch (e) { toast(e.message) }
    }))
  }
  $$('[data-use]', st).forEach(b => b.addEventListener('click', () => pickMon('Use on which Pokémon?', async (m) => { await pk.useItem(b.dataset.use, m); toast('Used', 'ok') })))
  $$('[data-give]', st).forEach(b => b.addEventListener('click', () => pickMon('Give to which Pokémon?', async (m) => { await pk.hold(m, b.dataset.give); toast('Item given', 'ok') })))
  $$('[data-stone]', st).forEach(b => b.addEventListener('click', () => pickMon('Use on which Pokémon?', async (m) => { await pk.evolve(m, b.dataset.stone); toast('It evolved!', 'ok') })))
}

/* ───────────── shop tab ───────────── */

async function drawShop(st, cat = null, ok = () => true) {
  const r = await pk.shop()
  if (!ok()) return
  const cats = (r.categories ?? []).filter(c => c.items?.length)
  const cur = cats.find(c => c.key === cat) ?? cats[0]
  st.innerHTML = `
    <div class="pk-row" style="margin-bottom:10px"><h3 class="pk-h3">Pokémon Shop</h3>
      <div class="pk-wallet">${num(r.wallet?.solars ?? 0)} <small>Solars</small></div></div>
    <div class="pk-pills">${cats.map(c => `<button data-c="${esc(c.key)}" class="${c.key === cur?.key ? 'on' : ''}">${esc(c.label)}</button>`).join('')}</div>
    <div class="pk-shopgrid">${(cur?.items ?? []).map(i => `
      <div class="pk-prod">
        <div class="pk-prod-ico">${itemIcon(i.id, i.iconUrl, 2)}</div>
        <b>${esc(i.name)}</b><p>${esc(i.description ?? '')}</p>
        <div class="pk-price">${num(i.buyPrice)} ${esc(i.currency ?? 'solars')}${i.owned ? `<small> · own ${num(i.owned)}</small>` : ''}</div>
        <div class="pk-buyrow"><button class="btn btn-gold btn-sm" data-buy="${esc(i.id)}" data-q="1">Buy</button><button class="btn btn-sm" data-buy="${esc(i.id)}" data-q="5">×5</button></div>
      </div>`).join('')}</div>`
  $$('[data-c]', st).forEach(b => b.addEventListener('click', () => drawShop(st, b.dataset.c).catch(e => fail(st, e, draw))))
  $$('[data-buy]', st).forEach(b => b.addEventListener('click', async () => {
    b.disabled = true
    try { await pk.buy(b.dataset.buy, Number(b.dataset.q)); toast('Purchased', 'ok'); await drawShop(st, cur?.key) } catch (e) { toast(e.message); b.disabled = false }
  }))
}
