/* Battle scene: Showdown backdrops + animated sprites, event-driven animation, command menus. */
import { $, $$, pk, esc, num, typeChip, TYPE_COLOR, hpClass, pctOf, sleep } from './core.js'
import { toast } from '../js/ui.js'
import { P, speedMul } from './prefs.js'
import * as FB from './feedback.js'
import { spriteImg, loadBg, REGION_BG, TYPE_BG, itemIcon } from './showdown.js'

const S = { b: null, bag: [], panel: 'main', mega: false, locked: false, busy: false, summary: null, skip: false, token: 0,
  ctx: { kind: 'wild', region: null, master: null }, shown: { me: '', foe: '' } }
let host = null, onExit = () => {}

export function mountBattle(h, exit) { host = h; onExit = exit }
export const inBattle = () => !!S.b && !S.summary
const wait = (ms) => (S.skip || P.speed === 'instant' ? Promise.resolve() : sleep(ms * speedMul()))
const SIDE = (s) => (s === 'p1' || s === 'you' ? 'me' : 'foe')
const slotEl = (side) => $(side === 'me' ? '#slotMe' : '#slotFoe')
const spOf = (side) => $('.pk-sp', slotEl(side))

/* ───────────── scene ───────────── */

const hash = (str) => [...String(str)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
/** Candidate backdrops, best first: region biome for wild hunts, the leader's type for tower fights. */
function bgNames(b) {
  const foe = b.foe?.active
  const seed = hash(foe?.species ?? foe?.name ?? '')
  const type = String((S.ctx.master?.type ?? S.ctx.master?.types?.[0] ?? foe?.types?.[0] ?? '')).toLowerCase()
  const pool = S.ctx.kind === 'wild' && REGION_BG[S.ctx.region] ? REGION_BG[S.ctx.region] : (TYPE_BG[type] ?? TYPE_BG.normal)
  const first = pool[seed % pool.length]
  return [first, ...pool.filter(n => n !== first), 'route', 'city']
}
/** Shown instantly (and kept if no image loads): a sky-to-ground gradient tinted by the foe's type. */
function bgGradient(b) {
  const t = String(S.ctx.master?.type ?? b.foe?.active?.types?.[0] ?? 'normal').toLowerCase()
  const c = TYPE_COLOR[t] ?? '#6b7a99'
  return `linear-gradient(180deg,#0b1020 0%,${c}55 55%,${c}aa 100%)`
}

function buildScene(b) {
  S.shown = { me: '', foe: '' }
  host.innerHTML = `
    <div class="pk-scene" id="pkScene" style="--bgf:${bgGradient(b)}">
      <div class="pk-bg"></div><div class="pk-wx" id="pkWx"></div>
      <div class="pk-slot foe" id="slotFoe"></div>
      <div class="pk-slot me" id="slotMe"></div>
      <div class="pk-plate foe" id="plateFoe"></div>
      <div class="pk-plate you" id="plateMe"></div>
      <div class="pk-fx" id="pkFx"></div>
      <div class="pk-banner" id="pkBanner"></div>
    </div>
    <div class="pk-meta" id="pkMeta"></div>
    <div class="pk-log" id="pkLog"></div>
    <div class="pk-cmd locked" id="pkCmd"></div>`
  fit()
  const scene = $('#pkScene')
  if (P.backgrounds) loadBg(bgNames(b)).then(url => { if (url && scene.isConnected) { scene.style.setProperty('--bg', `url('${url}')`); scene.classList.add('bg-on') } })
  scene.addEventListener('click', () => { S.skip = true })
}
function fit() {
  const s = $('#pkScene'); if (!s) return
  s.style.setProperty('--k', ((s.clientWidth || 360) / 640).toFixed(3))
}
window.addEventListener('resize', fit)

function setSprite(side, mon, anim = 'sendout') {
  const slot = slotEl(side); if (!slot) return
  const key = mon ? `${mon.species ?? mon.name}|${mon.shiny ? 1 : 0}` : ''
  if (S.shown[side] === key) return
  S.shown[side] = key
  if (!mon) { slot.innerHTML = ''; return }
  slot.innerHTML = `<div class="pk-shadow"></div><div class="pk-sp ${anim}">${spriteImg(mon.species ?? mon.name,
    { back: side === 'me', shiny: !!mon.shiny, dex: mon.spriteDex ?? mon.dexId }, 'pk-img')}</div>`
}

function setPlate(side, mon) {
  const el = $(side === 'me' ? '#plateMe' : '#plateFoe'); if (!el) return
  if (!mon) { el.innerHTML = ''; el.dataset.key = ''; return }
  const pct = mon.hpPct ?? pctOf(mon.hp, mon.maxHp)
  const key = `${mon.name}|${mon.level}`
  if (el.dataset.key !== key) {
    el.dataset.key = key
    el.innerHTML = `<div class="pk-plate-top"><b>${esc(mon.name)}</b><span class="pk-status"></span><small>Lv ${num(mon.level)}</small></div>
      <div class="pk-hp"><i class="${hpClass(pct)}" style="width:${pct}%"></i></div>${side === 'me' ? '<div class="pk-hpnum"></div>' : ''}`
  }
  setHp(side, pct, mon.hp, mon.maxHp)
  const st = $('.pk-status', el); if (st) { st.textContent = mon.status ?? ''; st.style.display = mon.status ? '' : 'none' }
}
function setHp(side, pct, cur, max) {
  const el = $(side === 'me' ? '#plateMe' : '#plateFoe'); if (!el) return
  const bar = $('.pk-hp i', el); if (bar) { bar.style.width = pct + '%'; bar.className = hpClass(pct) }
  const n = $('.pk-hpnum', el); if (n && cur != null && max != null) n.textContent = `${num(cur)} / ${num(max)}`
}

function setWeather(w) {
  const el = $('#pkWx'); if (!el) return
  const s = P.weather ? String(w ?? '').toLowerCase() : ''
  el.className = 'pk-wx ' + (/rain|drizzle/.test(s) ? 'rain' : /sun|desolate/.test(s) ? 'sun' : /sand/.test(s) ? 'sand' : /snow|hail/.test(s) ? 'snow' : '')
}

function logLine(text) {
  if (!text) return
  const e = $('#pkLog'); if (!e) return
  e.insertAdjacentHTML('beforeend', `<div class="in">${esc(text)}</div>`)
  while (e.children.length > 4) e.firstChild.remove()
}

/* ───────────── effects ───────────── */

function restart(el, cls, ms) {
  if (!el) return
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls)
  if (ms) setTimeout(() => el.classList.remove(cls), ms)
}
function fx(html, ms = 900) {
  if (!P.effects) return null
  const layer = $('#pkFx'); if (!layer) return null
  layer.insertAdjacentHTML('beforeend', html)
  const el = layer.lastElementChild
  setTimeout(() => el?.remove(), ms)
  return el
}
const burst = (side, color) => fx(`<div class="pk-burst ${side}" style="--c:${color}"></div>`, 700)
const floatText = (side, text, color = '#fff') => fx(`<div class="pk-float ${side}" style="color:${color}">${esc(text)}</div>`, 1100)
const flash = (cls = 'flash') => P.effects && restart($('#pkScene'), cls, 450)

async function throwBall(ev) {
  const layer = $('#pkFx'), foe = spOf('foe'); if (!layer) return
  const ball = document.createElement('div')
  ball.className = 'pk-ball'
  ball.innerHTML = itemIcon(ev.ball ?? 'pokeball', null, 2.2)
  layer.appendChild(ball)
  await ball.animate?.([
    { left: '24%', top: '70%', transform: 'translate(-50%,-50%) rotate(0)' },
    { left: '50%', top: '18%', transform: 'translate(-50%,-50%) rotate(360deg)', offset: .5 },
    { left: '70%', top: '40%', transform: 'translate(-50%,-50%) rotate(720deg)' }], { duration: 650, fill: 'forwards' })?.finished
  restart(foe, 'absorb'); await wait(420)
  await ball.animate?.([{ top: '40%' }, { top: '58%' }], { duration: 300, fill: 'forwards', easing: 'ease-in' })?.finished
  const n = Math.max(0, Math.min(3, ev.shakes ?? 0))
  for (let i = 0; i < n; i++) {
    await wait(350)
    await ball.animate?.([{ transform: 'translate(-50%,-50%) rotate(0)' }, { transform: 'translate(-50%,-50%) rotate(-24deg)' },
      { transform: 'translate(-50%,-50%) rotate(20deg)' }, { transform: 'translate(-50%,-50%) rotate(0)' }], { duration: 520 })?.finished
  }
  await wait(300)
  if (ev.caught) {
    ball.classList.add('caught'); fx('<div class="pk-stars"></div>', 1400)
    logLine(`Gotcha! ${ev.name ?? 'The Pokémon'} was caught!`)
    await wait(900)
  } else {
    ball.remove(); foe?.classList.remove('absorb'); restart(foe, 'release', 500); flash('flash'); await wait(500)
  }
}

/* ───────────── timeline ───────────── */

async function play(events, tok) {
  S.skip = false
  const cmd = $('#pkCmd'); cmd?.classList.add('locked')
  for (const ev of events) {
    if (tok !== S.token) return
    if (ev.t !== 'ball' || !ev.caught) logLine(ev.text)
    const side = SIDE(ev.side)
    switch (ev.t) {
      case 'switch':
        setSprite(side, { species: ev.species, spriteDex: ev.spriteDex, dexId: ev.dexId, shiny: ev.shiny }, side === 'me' ? 'sendout' : 'enter')
        if (S.b) { const m = side === 'me' ? S.b.you.active : S.b.foe.active; if (m && (m.species ?? m.name) === ev.species) setPlate(side, m) }
        await wait(650); break
      case 'move': {
        const sp = spOf(side); restart(sp, 'lunge', 420)
        await wait(260)
        if (!ev.miss) {
          if (ev.category && ev.category !== 'Status') burst(SIDE(ev.targetSide ?? (ev.side === 'p1' ? 'p2' : 'p1')), TYPE_COLOR[String(ev.type).toLowerCase()] ?? '#fff')
          else fx(`<div class="pk-aura ${side}"></div>`, 800)
        }
        await wait(420); break
      }
      case 'damage':
        if (ev.hpPct != null) {
          const before = Number($(`#plate${side === 'me' ? 'Me' : 'Foe'} .pk-hp i`)?.style.width.replace('%', '')) || 100
          setHp(side, ev.hpPct, ev.hp?.cur, ev.hp?.max)
          if (ev.hpPct < before) { restart(spOf(side), 'hit', 520); FB.hit(false) }
        }
        await wait(520); break
      case 'heal':
        if (ev.hpPct != null) { setHp(side, ev.hpPct, ev.hp?.cur, ev.hp?.max); fx(`<div class="pk-heal ${side}"></div>`, 900) }
        await wait(450); break
      case 'faint':
        restart(spOf(side), 'faint'); await wait(750); setSprite(side, null); setPlate(side, null); break
      case 'effect':
        if (ev.kind === 'super' || ev.kind === 'crit') { flash(ev.kind === 'crit' ? 'flash' : 'shake'); FB.hit(true) }
        await wait(380); break
      case 'status':
        floatText(side, String(ev.status ?? '').toUpperCase(), '#f0d585')
        { const st = $(`#plate${side === 'me' ? 'Me' : 'Foe'} .pk-status`); if (st) { st.textContent = ev.status; st.style.display = '' } }
        await wait(500); break
      case 'boost':
        floatText(side, `${ev.amount > 0 ? '▲' : '▼'} ${ev.stat?.toUpperCase?.() ?? ''}`, ev.amount > 0 ? '#7bdc7c' : '#e8605a')
        await wait(480); break
      case 'weather': setWeather(ev.weather); await wait(400); break
      case 'mega': flash('flash'); await wait(600); break
      case 'ball': await throwBall(ev); break
      default: if (ev.text) await wait(420)
    }
  }
}

function syncAll() {
  const b = S.b; if (!b) return
  const me = b.you.active, foe = b.foe.active
  const alive = (m) => m && !m.fainted && (m.hp == null || m.hp > 0) && m.hpPct !== 0
  setSprite('me', alive(me) ? me : null, 'in'); setSprite('foe', alive(foe) ? foe : null, 'in')
  setPlate('me', alive(me) ? me : null); setPlate('foe', alive(foe) ? foe : null)
  setWeather(b.weather)
  const meta = $('#pkMeta')
  if (meta) meta.innerHTML = `<span>${b.kind === 'wild' ? 'Wild battle' : esc(S.ctx.master?.name ?? b.foeName ?? 'Trainer battle')}</span><span>Foes left ${num(b.foe.remaining)}/${num(b.foe.total)} · Turn ${num(b.turn)}</span>`
}

/* ───────────── entry points ───────────── */

export async function showBattle(payload, ctx = null) {
  S.b = payload.battle; S.bag = payload.bag ?? S.bag; S.panel = 'main'; S.summary = null; S.mega = false
  S.ctx = ctx ?? { kind: S.b.kind === 'wild' ? 'wild' : 'tower', region: null, master: null }
  buildScene(S.b)
  const tok = ++S.token
  const events = payload.events ?? []
  const foeName = S.b.foe.active?.name ?? 'Pokémon'
  if (events.length) {
    const ban = $('#pkBanner')
    ban.innerHTML = S.ctx.kind === 'wild'
      ? `<small>Wild encounter</small><b>A wild ${esc(foeName)} appeared!</b>`
      : `<small>${esc(S.ctx.master?.title ?? 'Challenger')}</small><b>${esc(S.ctx.master?.emoji ?? '⚔')} ${esc(S.ctx.master?.name ?? S.b.foeName ?? 'Trainer')} wants to battle!</b>`
    ban.classList.add('show'); await wait(1300); ban.classList.remove('show')
    await play(events, tok)
  }
  if (tok !== S.token) return
  syncAll(); drawCommands()
}

async function act(action) {
  if (S.busy || S.locked) return
  S.busy = true; $('#pkCmd')?.classList.add('locked')
  try {
    const r = await pk.act(action)
    S.b = r.battle; S.bag = r.bag ?? S.bag; S.panel = 'main'; S.mega = false
    if (r.summary) S.summary = r.summary
    const tok = ++S.token
    await play(r.events ?? [], tok)
    if (tok !== S.token) return
    syncAll(); drawCommands()
  } catch (e) {
    toast(e.message)
    if (e.code === 'NO_BATTLE') { S.b = null; return onExit() }
    $('#pkCmd')?.classList.remove('locked')
  } finally { S.busy = false }
}

/* ───────────── commands ───────────── */

function drawCommands() {
  const b = S.b, cmd = $('#pkCmd'); if (!cmd) return
  cmd.classList.remove('locked')
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
    cmd.innerHTML = `
      ${me?.canMega ? `<label class="pk-mega"><input type="checkbox" id="pkMega" ${S.mega ? 'checked' : ''}> Mega Evolve</label>` : ''}
      <div class="pk-moves">${(me?.moves ?? []).map(m => {
        const eff = m.effectiveness
        const tag = eff == null ? '' : eff === 0 ? '<em class="no">No effect</em>' : eff > 1 ? '<em class="up">Super effective</em>' : eff < 1 ? '<em class="down">Not very effective</em>' : ''
        return `<button class="pk-move" data-move="${m.index}" ${m.disabled || m.pp === 0 ? 'disabled' : ''} style="--tc:${TYPE_COLOR[String(m.type).toLowerCase()] ?? '#888'}">
          <b>${esc(m.name)}</b><span>${esc(m.type)} · ${m.power ? 'Pwr ' + num(m.power) : esc(m.category ?? 'Status')}</span>
          <span>PP ${num(m.pp)}/${num(m.maxPp)} ${tag}</span></button>`
      }).join('')}</div>
      <button class="pk-back" data-go="main">‹ Back</button>`
    $('#pkMega')?.addEventListener('change', e => { S.mega = e.target.checked })
  } else if (panel === 'bag') {
    const items = (S.bag ?? []).filter(i => i.qty > 0 && (i.ball ? b.canCatch : i.usableInBattle))
    cmd.innerHTML = `
      <div class="pk-items">${items.map(i => `
        <button class="pk-item" data-item="${esc(i.id)}" data-ball="${i.ball ? 1 : 0}">
          ${itemIcon(i.id, i.iconUrl)}<b>${esc(i.name)}</b><small>×${num(i.qty)}</small></button>`).join('') || '<p class="subtext" style="padding:12px">Nothing usable right now.</p>'}</div>
      ${b.catchOdds != null ? `<div class="subtext" style="text-align:center">Catch chance with a Poké Ball: ~${num(b.catchOdds)}%</div>` : ''}
      <button class="pk-back" data-go="main">‹ Back</button>`
  } else if (panel === 'team') {
    const forced = b.awaiting === 'switch'
    cmd.innerHTML = `
      ${forced ? '<div class="pk-wait">Choose your next Pokémon</div>' : ''}
      <div class="pk-team">${b.you.team.map(t => `
        <button class="pk-tm" data-slot="${t.slot}" ${t.active || t.fainted ? 'disabled' : ''}>
          ${spriteImg(t.species ?? t.name, { dex: t.spriteDex ?? t.dexId, shiny: t.shiny, still: true })}
          <div><b>${esc(t.name)}</b> <small>Lv ${num(t.level)}</small>
          <div class="pk-hp"><i class="${hpClass(pctOf(t.hp, t.maxHp))}" style="width:${pctOf(t.hp, t.maxHp)}%"></i></div></div>
          <span class="pk-tag">${t.fainted ? 'Fainted' : t.active ? 'Active' : num(t.hp) + '/' + num(t.maxHp)}</span></button>`).join('')}</div>
      ${forced ? '' : '<button class="pk-back" data-go="main">‹ Back</button>'}`
  }

  $$('[data-go]', cmd).forEach(x => x.addEventListener('click', () => { S.panel = x.dataset.go; drawCommands() }))
  $$('[data-move]', cmd).forEach(x => x.addEventListener('click', () => act({ action: 'move', index: Number(x.dataset.move), mega: S.mega })))
  $$('[data-item]', cmd).forEach(x => x.addEventListener('click', () =>
    act(x.dataset.ball === '1' ? { action: 'catch', itemId: x.dataset.item } : { action: 'item', itemId: x.dataset.item })))
  $$('[data-slot]', cmd).forEach(x => x.addEventListener('click', () => act({ action: 'switch', slot: Number(x.dataset.slot) })))
  $('[data-run]', cmd)?.addEventListener('click', async () => {
    if (b.canRun) return act({ action: 'run' })
    if (!confirm('Forfeit this battle?')) return
    try { const r = await pk.forfeit(); S.b = { ...b, ...r.battle, ended: true }; S.summary = r.summary ?? {}; drawCommands() } catch (e) { toast(e.message) }
  })
}

async function refresh() {
  try { const r = await pk.battle(); if (r.battle) { S.b = r.battle; S.bag = r.bag ?? S.bag; syncAll(); drawCommands() } else onExit() } catch {}
}

/* ───────────── result: exp, level-ups, evolutions, catches ───────────── */

function speciesOf(name) {
  const t = S.b?.you?.team?.find(x => x.name === name || x.species === name)
  return t ? { species: t.species ?? t.name, dex: t.spriteDex ?? t.dexId, shiny: t.shiny } : { species: name, dex: null, shiny: false }
}

function drawResult() {
  const b = S.b, sm = S.summary ?? {}, cmd = $('#pkCmd')
  const res = sm.result ?? b.result ?? 'over'
  FB.result(res, (sm.levelUps ?? []).length)
  const title = { won: 'Victory!', lost: 'Defeated…', fled: 'Got away safely', caught: 'Gotcha!' }[res] ?? 'Battle over'
  const ups = new Map((sm.levelUps ?? []).map(x => [x.name, x.to]))
  const rows = (sm.exp ?? []).map(x => {
    const sp = speciesOf(x.name), up = ups.get(x.name)
    return `<div class="pk-xp ${up ? 'lvl' : ''}">
      <div class="pk-xp-spr">${spriteImg(sp.species, { dex: sp.dex, shiny: sp.shiny })}${up ? '<i class="pk-rays"></i>' : ''}</div>
      <div><b>${esc(x.name)}</b><div class="pk-xp-gain">+${num(x.gain)} EXP</div>${up ? `<div class="pk-up">⬆ Level ${num(up)}!</div>` : ''}</div></div>`
  }).join('')
  const evos = (sm.evolutions ?? []).filter(e => e && (e.from || e.name) && e.to).map(e => `
    <div class="pk-evo">
      <div class="pk-evo-spr">${spriteImg(e.from ?? e.name, {})}${spriteImg(e.to, {}, 'pk-spr new')}</div>
      <div><b>${esc(e.from ?? e.name)} is evolving…</b><div class="pk-up">✨ Evolved into ${esc(e.to)}!</div></div></div>`).join('')
  const extra = []
  if (sm.payout) extra.push(`+${num(sm.payout)} Solars`)
  for (const r of sm.rewards ?? []) extra.push(typeof r === 'string' ? r : `+ ${r.name ?? r.label ?? 'reward'}${r.qty ? ' ×' + num(r.qty) : ''}`)
  const caught = sm.caught ? (typeof sm.caught === 'string' ? sm.caught : sm.caught.name ?? 'a new Pokémon') : null
  cmd.innerHTML = `
    <div class="pk-result ${esc(res)}"><h3>${esc(title)}</h3>
      ${caught ? `<div class="pk-caught">${spriteImg(caught, {})}<span>Caught ${esc(caught)}!</span></div>` : ''}
      ${rows}${evos}${extra.map(l => `<div class="pk-xtra">${esc(l)}</div>`).join('')}</div>
    <button class="pk-big gold pk-wide" id="pkDone">Continue</button>`
  const done = $('#pkDone')
  done?.addEventListener('click', () => {
    S.b = null; S.summary = null; ++S.token
    // renderPokemon intentionally keeps a visible result screen in place while #pkDone exists.
    // Remove it before asking the Pokémon page to render again, or Continue becomes a no-op.
    cmd.replaceChildren()
    onExit()
  })
}
