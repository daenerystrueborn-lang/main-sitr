/* Astral app pages: Welcome + Pokémon battling.
   Loaded as a module so it shares api.js (token, base URL, ApiError) with the site code.
   All game logic stays on the server - this file only sends intents and draws results. */
import { api, API_BASE, getToken, setToken, ApiError } from '../js/api.js'
import { esc, toast, num, duration, initials } from '../js/ui.js'

const $ = (s, r = document) => r.querySelector(s)
const route = () => location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0] || 'home'
const signedIn = () => !!getToken()

/* ───────────────────────────── api ───────────────────────────── */

async function call(path, { method = 'GET', body = null } = {}) {
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
    if (res.status === 401) setToken(null)           // shell bounces to login
    throw new ApiError(data?.error || `Request failed (${res.status})`, { status: res.status, code: data?.code ?? null, body: data })
  }
  return data
}
const pk = {
  meta: () => call('/pokemon/meta'),
  overview: () => call('/pokemon/overview'),
  tower: () => call('/pokemon/tower'),
  starter: (dexId) => call('/pokemon/starter', { method: 'POST', body: { dexId } }),
  heal: () => call('/pokemon/heal', { method: 'POST' }),
  hunt: (region) => call('/pokemon/hunt', { method: 'POST', body: region ? { region } : {} }),
  battle: () => call('/pokemon/battle'),
  act: (a) => call('/pokemon/battle/act', { method: 'POST', body: a }),
  forfeit: () => call('/pokemon/battle/forfeit', { method: 'POST' }),
  challenge: (stage) => call('/pokemon/tower/challenge', { method: 'POST', body: { stage } }),
}

/* ───────────────────────────── welcome ───────────────────────────── */

async function renderWelcome() {
  const host = $('#welcomeRoot'); if (!host) return
  if (!host.dataset.ready) host.innerHTML = '<div class="wl-skel"></div><div class="wl-skel tall"></div>'
  const [meR, seasonR] = await Promise.allSettled([api.me(), api.season()])
  if (route() !== 'welcome') return
  if (meR.status !== 'fulfilled') { host.innerHTML = `<p class="subtext" style="padding:24px">${esc(meR.reason?.message || 'Could not load your profile.')}</p>`; return }
  const p = meR.value.player ?? {}
  const sv = seasonR.status === 'fulfilled' ? seasonR.value : null

  const hour = new Date().getHours()
  const hello = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const avatar = p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : `<span>${esc(initials(p.name))}</span>`

  let season = ''
  if (sv?.active) {
    const s = sv.season, pl = sv.player
    const left = (sv.runtime?.endsAt ?? 0) - Date.now()
    const pct = pl && s.tierCount ? Math.min(100, Math.round((pl.tier / s.tierCount) * 100)) : 0
    season = `
      <a class="wl-season" href="#/season">
        <div class="wl-season-art" style="background-image:linear-gradient(180deg,rgb(0 0 0 / 15%),#000 92%),url('assets/img/season/hero.jpg')"></div>
        <div class="wl-season-body">
          <div class="wl-kicker">Current season${left > 0 ? ` · ${esc(duration(left))} left` : ''}</div>
          <h2>Season ${esc(s.number)}: ${esc(s.name)}</h2>
          ${s.description ? `<p>${esc(s.description)}</p>` : ''}
          ${pl ? `
            <div class="wl-tier"><span>Tier ${num(pl.tier)} / ${num(s.tierCount)}</span><span>${num(pl.points)} pts · ${pl.premiumPass ? 'Premium' : 'Free'} pass</span></div>
            <div class="xp-track"><div class="xp-fill" style="width:${pct}%"></div></div>` : ''}
          <span class="wl-more">More on the season <b>→</b></span>
        </div>
      </a>`
  } else {
    season = `<div class="wl-season empty"><div class="wl-season-body"><div class="wl-kicker">Season</div><h2>Between seasons</h2><p>The next season hasn't started yet. Check back soon.</p></div></div>`
  }

  host.dataset.ready = '1'
  host.innerHTML = `
    <section class="wl-hello">
      <div class="wl-avatar">${avatar}</div>
      <div>
        <div class="wl-sub">${hello},</div>
        <h1 class="wl-name">${esc(p.name ?? 'Adventurer')}</h1>
        <div class="wl-chips">
          <span class="wl-chip">Lv ${num(p.level ?? 1)}</span>
          ${p.rank?.title ? `<span class="wl-chip">${esc(p.rank.emoji ?? '')} ${esc(p.rank.title)}</span>` : ''}
          ${p.wallet ? `<span class="wl-chip gold">${num(p.wallet.solars)} Solars</span>` : ''}
        </div>
      </div>
    </section>
    ${season}`
}

/* ───────────────────────────── pokémon ───────────────────────────── */

const TYPE_COLOR = { normal:'#a8a77a', fire:'#ee8130', water:'#6390f0', electric:'#f7d02c', grass:'#7ac74c', ice:'#96d9d6', fighting:'#c22e28', poison:'#a33ea1', ground:'#e2bf65', flying:'#a98ff3', psychic:'#f95587', bug:'#a6b91a', rock:'#b6a136', ghost:'#735797', dragon:'#6f35fc', dark:'#705746', steel:'#b7b7ce', fairy:'#d685ad' }
const typeChip = (t) => `<span class="pk-type" style="--tc:${TYPE_COLOR[String(t).toLowerCase()] ?? '#888'}">${esc(t)}</span>`
const hpClass = (pct) => (pct > 50 ? 'ok' : pct > 20 ? 'mid' : 'low')
const pctOf = (hp, max) => (max > 0 ? Math.max(0, Math.min(100, Math.round((hp / max) * 100))) : 0)

let SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites'
let META = null
const sprite = (dex, { back = false, shiny = false } = {}) =>
  `${SPRITE_BASE}/pokemon/${back ? 'back/' : ''}${shiny ? 'shiny/' : ''}${dex}.png`
const img = (dex, opts = {}) =>
  `<img class="pk-spr" src="${esc(sprite(dex, opts))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${esc(sprite(dex))}'">`

const S = { battle: null, bag: [], panel: 'main', mega: false, locked: false, log: [], prev: {}, summary: null, busy: false }
let logTimers = []

const root = () => $('#pokemonRoot')

async function renderPokemon() {
  const host = root(); if (!host) return
  if (!host.dataset.ready) host.innerHTML = '<div class="wl-skel tall"></div>'
  try {
    if (!META) { META = await pk.meta(); SPRITE_BASE = META.sprites?.base ?? SPRITE_BASE }
    const b = await pk.battle()
    if (route() !== 'pokemon') return
    if (b.battle && !b.battle.ended) { S.battle = b.battle; S.bag = b.bag ?? []; S.panel = 'main'; S.summary = null; drawBattle(); return }
    await drawOverview()
  } catch (e) { fail(host, e) }
}

function fail(host, e) {
  host.dataset.ready = '1'
  host.innerHTML = `<div class="pk-card" style="text-align:center"><p>${esc(e?.message || 'Something went wrong.')}</p><button class="btn btn-gold" id="pkRetry">Try again</button></div>`
  $('#pkRetry')?.addEventListener('click', renderPokemon)
}

async function drawOverview() {
  const host = root()
  const [o, t] = await Promise.all([pk.overview(), pk.tower().catch(() => null)])
  if (route() !== 'pokemon') return
  S.battle = null; S.summary = null
  host.dataset.ready = '1'

  if (o.needsStarter) {
    host.innerHTML = `
      <div class="pk-card">
        <h2 class="pk-h">Choose your starter</h2>
        <p class="subtext">Every trainer begins with one partner. Pick wisely.</p>
        <div class="pk-starters">${(META.starters ?? []).map(s => `
          <button class="pk-starter" data-dex="${s.dexId}">
            ${img(s.dexId)}<b>${esc(s.name)}</b><div>${(s.types ?? []).map(typeChip).join('')}</div>
          </button>`).join('')}</div>
      </div>`
    host.querySelectorAll('[data-dex]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true
      try { await pk.starter(Number(b.dataset.dex)); toast('Your journey begins!', 'ok'); drawOverview() }
      catch (e) { toast(e.message); b.disabled = false }
    }))
    return
  }

  const party = o.party ?? []
  const next = t && !t.championed && t.nextStage ? t.masters?.find(m => m.stage === t.nextStage) : null
  host.innerHTML = `
    <div class="pk-top">
      <div><h2 class="pk-h">Pokémon</h2><div class="subtext">${num(o.counts?.owned ?? 0)} caught · Dex ${num(o.dex?.caught ?? 0)}/${num(o.dex?.total ?? 0)}</div></div>
      <div class="pk-wallet">${num(o.wallet?.solars ?? 0)} <small>Solars</small></div>
    </div>

    <div class="pk-card">
      <div class="pk-row">
        <h3 class="pk-h3">Wild hunt</h3>
        <select id="pkRegion" class="pk-select"><option value="">Anywhere</option>${(META.regions ?? []).map(r => `<option value="${esc(r.key)}">${esc(r.key)}</option>`).join('')}</select>
      </div>
      <button class="btn btn-gold pk-wide" id="pkHunt">Go hunting</button>
    </div>

    ${next ? `
    <div class="pk-card">
      <div class="pk-kicker">Sinnoh League · Stage ${num(next.stage)} / ${num(t.total)}</div>
      <h3 class="pk-h3">${esc(next.emoji ?? '')} ${esc(next.name)} <small>${esc(next.title ?? '')}</small></h3>
      <div class="subtext">Level ${num(next.level)} · ${num(next.team?.length ?? 0)} Pokémon</div>
      <button class="btn pk-wide" id="pkTower" data-stage="${next.stage}">Challenge</button>
    </div>` : t?.championed ? '<div class="pk-card"><b>🏆 League Champion</b></div>' : ''}

    <div class="pk-row" style="margin:18px 2px 8px"><h3 class="pk-h3">Your party</h3><button class="pk-link" id="pkHeal">Heal all</button></div>
    <div class="pk-party">${party.map(m => `
      <div class="pk-mon ${m.fainted ? 'faint' : ''}">
        ${img(m.dexId, { shiny: m.shiny })}
        <div class="pk-mon-body">
          <div class="pk-mon-name">${esc(m.nickname ?? m.name)} <small>Lv ${num(m.level)}</small>${m.main ? ' <span class="pk-star">★</span>' : ''}</div>
          <div class="pk-hp"><i class="${hpClass(pctOf(m.hp, m.maxHp))}" style="width:${pctOf(m.hp, m.maxHp)}%"></i></div>
          <div class="pk-mon-meta">${(m.types ?? []).map(typeChip).join('')}<span>${num(m.hp)}/${num(m.maxHp)}</span></div>
        </div>
      </div>`).join('') || '<p class="subtext">Your party is empty.</p>'}</div>`

  $('#pkHunt').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true
    try { const r = await pk.hunt($('#pkRegion').value || null); startBattle(r) }
    catch (err) { if (err.code === 'IN_BATTLE' && err.body?.battle) startBattle(err.body); else toast(err.message); b.disabled = false }
  })
  $('#pkTower')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true
    try { startBattle(await pk.challenge(Number(b.dataset.stage))) }
    catch (err) { toast(err.message); b.disabled = false }
  })
  $('#pkHeal').addEventListener('click', async () => {
    try { const r = await pk.heal(); toast(r.healed ? `Healed ${r.healed} Pokémon` : 'Everyone is already healthy', 'ok'); drawOverview() }
    catch (err) { toast(err.message) }
  })
}

/* ── battle ── */

function startBattle(payload) {
  S.battle = payload.battle; S.bag = payload.bag ?? []; S.panel = 'main'; S.summary = null; S.log = []; S.prev = {}; S.mega = false
  drawBattle(payload.events ?? [])
}

function bars(side, mon) {
  if (!mon) return ''
  const pct = mon.hpPct ?? pctOf(mon.hp, mon.maxHp)
  const status = mon.status ? `<span class="pk-status">${esc(mon.status)}</span>` : ''
  return `
    <div class="pk-plate ${side}">
      <div class="pk-plate-top"><b>${esc(mon.name)}</b> ${status}<small>Lv ${num(mon.level)}</small></div>
      <div class="pk-hp"><i class="${hpClass(pct)}" style="width:${pct}%"></i></div>
      ${side === 'you' ? `<div class="pk-hpnum">${num(mon.hp)} / ${num(mon.maxHp)}</div>` : ''}
    </div>`
}

function drawBattle(events = []) {
  const host = root(); host.dataset.ready = '1'
  const b = S.battle
  const me = b.you.active, foe = b.foe.active
  const foePct = foe?.hpPct ?? 0, mePct = me ? pctOf(me.hp, me.maxHp) : 0
  const hitFoe = S.prev.foe != null && foePct < S.prev.foe
  const hitMe = S.prev.me != null && mePct < S.prev.me
  S.prev = { foe: foePct, me: mePct }
  const weather = b.weather ? `<span class="pk-weather">${esc(b.weather)}</span>` : ''

  host.innerHTML = `
    <div class="pk-scene">
      ${weather}
      <div class="pk-foe">${bars('foe', foe)}<div class="pk-pad foe"></div>${foe ? `<div class="pk-sprwrap foe ${hitFoe ? 'hit' : ''}">${img(foe.spriteDex ?? foe.dexId, { shiny: foe.shiny })}</div>` : ''}</div>
      <div class="pk-me"><div class="pk-pad me"></div>${me ? `<div class="pk-sprwrap me ${hitMe ? 'hit' : ''}">${img(me.spriteDex ?? me.dexId, { back: true, shiny: me.shiny })}</div>` : ''}${bars('you', me)}</div>
    </div>
    <div class="pk-meta"><span>${b.kind === 'wild' ? 'Wild battle' : esc(b.foeName ?? 'Trainer battle')}</span><span>Foes left ${num(b.foe.remaining)}/${num(b.foe.total)} · Turn ${num(b.turn)}</span></div>
    <div class="pk-log" id="pkLog"></div>
    <div class="pk-cmd" id="pkCmd"></div>`

  S.log = S.log.slice(-40)
  const logEl = $('#pkLog')
  logEl.innerHTML = S.log.slice(-4).map(l => `<div>${esc(l)}</div>`).join('')
  playLog(events.map(e => e.text).filter(Boolean))
  drawCommands()
}

function playLog(lines) {
  logTimers.forEach(clearTimeout); logTimers = []
  const el = $('#pkLog'); if (!el) return
  S.locked = lines.length > 0
  lines.forEach((text, i) => logTimers.push(setTimeout(() => {
    S.log.push(text)
    const e = $('#pkLog'); if (!e) return
    e.insertAdjacentHTML('beforeend', `<div class="in">${esc(text)}</div>`)
    while (e.children.length > 4) e.firstChild.remove()
    if (i === lines.length - 1) { S.locked = false; $('#pkCmd')?.classList.remove('locked') }
  }, i * 320)))
  $('#pkCmd')?.classList.toggle('locked', S.locked)
}

function drawCommands() {
  const b = S.battle, cmd = $('#pkCmd'); if (!cmd) return
  if (b.ended || S.summary) return drawResult()
  const me = b.you.active
  let panel = S.panel
  if (b.awaiting === 'switch') panel = 'team'
  if (b.awaiting === 'wait') { cmd.innerHTML = '<div class="pk-wait">Waiting…</div>'; setTimeout(refresh, 1200); return }

  if (panel === 'main') {
    cmd.innerHTML = `
      <button data-go="fight" class="pk-big gold">⚔ Fight</button>
      <button data-go="bag" class="pk-big">🎒 Bag</button>
      <button data-go="team" class="pk-big" ${b.you.canSwitch ? '' : 'disabled'}>🔄 Pokémon</button>
      <button data-run class="pk-big">${b.canRun ? '🏃 Run' : '🏳 Forfeit'}</button>`
  } else if (panel === 'fight') {
    const mv = me?.moves ?? []
    cmd.innerHTML = `
      ${me?.canMega ? `<label class="pk-mega"><input type="checkbox" id="pkMega" ${S.mega ? 'checked' : ''}> Mega Evolve</label>` : ''}
      <div class="pk-moves">${mv.map(m => {
        const eff = m.effectiveness
        const tag = eff == null ? '' : eff === 0 ? '<em class="no">No effect</em>' : eff > 1 ? '<em class="up">Super effective</em>' : eff < 1 ? '<em class="down">Not very effective</em>' : ''
        return `<button class="pk-move" data-move="${m.index}" ${m.disabled || m.pp === 0 ? 'disabled' : ''} style="--tc:${TYPE_COLOR[String(m.type).toLowerCase()] ?? '#888'}">
          <b>${esc(m.name)}</b>
          <span>${esc(m.type)} · ${m.power ? 'Pwr ' + num(m.power) : esc(m.category ?? 'Status')}</span>
          <span>PP ${num(m.pp)}/${num(m.maxPp)} ${tag}</span></button>`
      }).join('')}</div>
      <button class="pk-back" data-go="main">‹ Back</button>`
    $('#pkMega')?.addEventListener('change', e => { S.mega = e.target.checked })
  } else if (panel === 'bag') {
    const items = (S.bag ?? []).filter(i => i.qty > 0 && (i.ball ? b.canCatch : i.usableInBattle))
    cmd.innerHTML = `
      <div class="pk-items">${items.map(i => `
        <button class="pk-item" data-item="${esc(i.id)}" data-ball="${i.ball ? 1 : 0}" ${b.you.active?.bagLocked ? 'disabled' : ''}>
          ${i.iconUrl ? `<img src="${esc(i.iconUrl)}" alt="">` : '<span class="pk-dot"></span>'}
          <b>${esc(i.name)}</b><small>×${num(i.qty)}</small></button>`).join('') || '<p class="subtext" style="padding:12px">Nothing usable right now.</p>'}</div>
      ${b.catchOdds != null ? `<div class="subtext" style="text-align:center">Catch chance with a Poké Ball: ~${num(b.catchOdds)}%</div>` : ''}
      <button class="pk-back" data-go="main">‹ Back</button>`
  } else if (panel === 'team') {
    const forced = b.awaiting === 'switch'
    cmd.innerHTML = `
      ${forced ? '<div class="pk-wait">Choose your next Pokémon</div>' : ''}
      <div class="pk-team">${b.you.team.map(t => `
        <button class="pk-tm" data-slot="${t.slot}" ${t.active || t.fainted ? 'disabled' : ''}>
          ${img(t.spriteDex ?? t.dexId, { shiny: t.shiny })}
          <div><b>${esc(t.name)}</b> <small>Lv ${num(t.level)}</small>
          <div class="pk-hp"><i class="${hpClass(pctOf(t.hp, t.maxHp))}" style="width:${pctOf(t.hp, t.maxHp)}%"></i></div></div>
          <span class="pk-tag">${t.fainted ? 'Fainted' : t.active ? 'Active' : num(t.hp) + '/' + num(t.maxHp)}</span></button>`).join('')}</div>
      ${forced ? '' : '<button class="pk-back" data-go="main">‹ Back</button>'}`
  }

  cmd.querySelectorAll('[data-go]').forEach(x => x.addEventListener('click', () => { S.panel = x.dataset.go; drawCommands() }))
  cmd.querySelectorAll('[data-move]').forEach(x => x.addEventListener('click', () => act({ action: 'move', index: Number(x.dataset.move), mega: S.mega })))
  cmd.querySelectorAll('[data-item]').forEach(x => x.addEventListener('click', () =>
    act(x.dataset.ball === '1' ? { action: 'catch', itemId: x.dataset.item } : { action: 'item', itemId: x.dataset.item })))
  cmd.querySelectorAll('[data-slot]').forEach(x => x.addEventListener('click', () => act({ action: 'switch', slot: Number(x.dataset.slot) })))
  cmd.querySelector('[data-run]')?.addEventListener('click', async () => {
    if (b.canRun) return act({ action: 'run' })
    if (!confirm('Forfeit this battle?')) return
    try { const r = await pk.forfeit(); S.battle = { ...b, ...r.battle, ended: true }; S.summary = r.summary ?? {}; drawBattle() } catch (e) { toast(e.message) }
  })
}

async function act(action) {
  if (S.busy || S.locked) return
  S.busy = true
  $('#pkCmd')?.classList.add('locked')
  try {
    const r = await pk.act(action)
    S.battle = r.battle; S.bag = r.bag ?? S.bag; S.panel = 'main'; S.mega = false
    if (r.summary) S.summary = r.summary
    drawBattle(r.events ?? [])
  } catch (e) {
    toast(e.message)
    if (e.code === 'NO_BATTLE') return renderPokemon()
    $('#pkCmd')?.classList.remove('locked')
  } finally { S.busy = false }
}

async function refresh() {
  try { const r = await pk.battle(); if (r.battle) { S.battle = r.battle; S.bag = r.bag ?? S.bag; drawBattle() } else renderPokemon() } catch {}
}

function drawResult() {
  const b = S.battle, sm = S.summary ?? {}, cmd = $('#pkCmd')
  const res = sm.result ?? b.result ?? 'over'
  const title = { won: 'Victory!', lost: 'Defeated…', fled: 'Got away safely', caught: 'Gotcha!' }[res] ?? 'Battle over'
  const lines = []
  for (const x of sm.exp ?? []) lines.push(`${x.name} gained ${num(x.gain)} EXP`)
  for (const x of sm.levelUps ?? []) lines.push(`⬆ ${x.name} reached Lv ${num(x.to)}`)
  for (const x of sm.evolutions ?? []) lines.push(`✨ ${x.from ?? x.name ?? 'Your Pokémon'} evolved${x.to ? ' into ' + x.to : ''}!`)
  if (sm.payout) lines.push(`+${num(sm.payout)} Solars`)
  for (const r of sm.rewards ?? []) lines.push(typeof r === 'string' ? r : `+ ${r.name ?? r.label ?? 'reward'}${r.qty ? ' ×' + num(r.qty) : ''}`)
  if (sm.caught) lines.push(`Caught ${typeof sm.caught === 'string' ? sm.caught : sm.caught.name ?? 'a new Pokémon'}!`)
  cmd.classList.remove('locked')
  cmd.innerHTML = `
    <div class="pk-result ${esc(res)}"><h3>${esc(title)}</h3>${lines.map(l => `<div>${esc(l)}</div>`).join('')}</div>
    <button class="pk-big gold pk-wide" id="pkDone">Continue</button>`
  $('#pkDone').addEventListener('click', () => { S.battle = null; S.summary = null; drawOverview().catch(e => fail(root(), e)) })
}

/* ───────────────────────────── routing ───────────────────────────── */

function onRoute() {
  if (!signedIn()) return
  const r = route()
  if (r === 'welcome') renderWelcome()
  else if (r === 'pokemon') renderPokemon()
}
window.addEventListener('hashchange', onRoute)
onRoute()
