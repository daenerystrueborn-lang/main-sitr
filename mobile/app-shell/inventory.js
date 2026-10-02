/* Profile inventory: long-press drag and drop (reorder + equip) and an Armor panel.
   Works on touch and mouse. The site's own markup is never edited: this enhances it after the profile renders. */
import { API_BASE } from '../js/api.js'
import { esc, num, toast } from '../js/ui.js'

const SLOTS = [['helmet', 'Helmet'], ['shoulders', 'Shoulders'], ['chest', 'Chest'], ['gloves', 'Gloves'], ['belt', 'Belt'],
  ['legs', 'Legs'], ['boots', 'Boots'], ['shield', 'Shield'], ['cape', 'Cape']]
const LABEL = Object.fromEntries(SLOTS)
const RULES = [
  ['shield', /shield|buckler|aegis/i],
  ['helmet', /helm|hood|\bcap\b|crown|circlet|coif|mask|visor|barbute/i],
  ['boots', /boot|shoe|sabaton|sandal|tread/i],
  ['gloves', /glove|gauntlet|mitt|bracer|vambrace/i],
  ['legs', /\blegs?\b|greave|pants|trouser|cuisse|legging|tasset|skirt/i],
  ['shoulders', /shoulder|pauldron|spaulder/i],
  ['belt', /belt|girdle|sash/i],
  ['cape', /cape|cloak/i],
  ['chest', /chest|plate|cuirass|armou?r|robe|tunic|mail|vest|jacket|hauberk|breast|garb/i],
]
const NOT_ARMOR = /weapon|sword|axe|bow|staff|wand|consum|potion|food|material|ingredient|key|ticket|crate|box|currency|gem|scroll|tool|bait|egg|seed/i
const ARMOR_TYPE = /armou?r|equip|gear|wear|cloth|shield|helm|boot|glove|gauntlet|greave|cape|cloak|belt/i

const keyOf = (it) => String(it?.id ?? it?.itemId ?? it?.name ?? '')
function slotOf(it) {
  if (!it) return null
  const direct = String(it.slot ?? it.armorSlot ?? '').toLowerCase()
  if (LABEL[direct]) return direct
  const type = String(it.type ?? it.category ?? '')
  const hay = `${it.name ?? ''} ${it.id ?? ''} ${type}`
  if (NOT_ARMOR.test(type) && !ARMOR_TYPE.test(type)) return null
  const typed = ARMOR_TYPE.test(type)
  for (const [slot, re] of RULES) { if (slot === 'chest' && !typed) continue; if (re.test(hay)) return slot }
  return typed ? 'chest' : null
}
function art(url) {
  const s = String(url ?? '').trim(); if (!s) return ''
  const plate = /^(?:https?:)?\/\/[^/]+(\/assets\/items\/[^?#]+)/i.exec(s)
  if (plate) return `${API_BASE}${plate[1]}`
  if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:')) return s
  return `${API_BASE}${s.startsWith('/') ? '' : '/'}${s}`
}

const uid = () => { try { return window.__astralMe?.uid ?? localStorage.getItem('astral:token')?.slice(-12) ?? 'me' } catch { return 'me' } }
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(`astral:inv:${k}:${uid()}`) || 'null') ?? d } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(`astral:inv:${k}:${uid()}`, JSON.stringify(v)) } catch {} }

/* If the server ever sends the worn gear, show that (read-only). Otherwise the loadout is chosen here and kept on this device. */
function serverGear() {
  const me = window.__astralMe, raw = me?.equipment ?? me?.equipped ?? me?.armor ?? me?.armour ?? me?.gear ?? me?.loadout
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  const put = (slot, it) => { if (slot && LABEL[slot] && it && typeof it === 'object') out[slot] = it }
  if (Array.isArray(raw)) raw.forEach(it => put(slotOf(it), it))
  else for (const [k, v] of Object.entries(raw)) put(LABEL[k] ? k : slotOf(v), v)
  return Object.keys(out).length ? out : null
}

let drag = null, suppressUntil = 0
document.addEventListener('click', (e) => { if (Date.now() < suppressUntil) { e.stopPropagation(); e.preventDefault() } }, true)

function scroller(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return document.scrollingElement
}

function enhance() {
  const grid = document.querySelector('#profileWrap .inv-grid')
  const items = window.__astralInv
  if (!grid || !Array.isArray(items) || grid._dnd) return
  grid._dnd = true
  const section = grid.closest('section') ?? grid.parentElement
  const btn = (i) => grid.querySelector(`.inv-slot[data-item="${i}"]`)
  const server = serverGear()

  // saved order
  const order = read('order', [])
  if (order.length) {
    const rank = new Map(order.map((k, i) => [k, i]))
    const els = [...grid.querySelectorAll('.inv-slot')]
    els.map((el, i) => [el, rank.has(keyOf(items[el.dataset.item])) ? rank.get(keyOf(items[el.dataset.item])) : 1e6 + i])
      .sort((a, b) => a[1] - b[1]).forEach(([el]) => grid.appendChild(el))
  }
  const saveOrder = () => write('order', [...grid.querySelectorAll('.inv-slot')].map(el => keyOf(items[el.dataset.item])))

  let equip = read('equip', {})
  const invIdx = (key) => items.findIndex(it => keyOf(it) === key)
  const worn = () => {
    if (server) return Object.fromEntries(Object.entries(server).map(([s, it]) => [s, { it, idx: invIdx(keyOf(it)), img: art(it.image) }]))
    const out = {}
    for (const [s, key] of Object.entries(equip)) {
      const idx = invIdx(key); if (idx < 0 || slotOf(items[idx]) !== s) continue
      out[s] = { it: items[idx], idx, img: btn(idx)?.querySelector('img.inv-img')?.src ?? art(items[idx].image) }
    }
    return out
  }

  const panel = document.createElement('section')
  panel.className = 'section'; panel.id = 'armorPanel'
  section.parentElement.insertBefore(panel, section)

  function paint() {
    const w = worn(), n = Object.keys(w).length
    const haveArmor = items.some(it => slotOf(it))
    const bonus = {}
    for (const { it } of Object.values(w)) for (const [k, v] of Object.entries(it.statBonuses ?? {})) if (typeof v === 'number') bonus[k] = (bonus[k] ?? 0) + v
    panel.innerHTML = `
      <div class="section-head"><div><h2>Armor</h2><p>${server ? 'What you are wearing' : 'Hold an armor piece in your inventory, then drag it onto its slot'}</p></div>
        <span class="badge badge-lvl">${n} / ${SLOTS.length}</span></div>
      <div class="ar-grid">${SLOTS.map(([slot, label]) => {
        const e = w[slot], r = e?.it?.rarity
        return e ? `<div class="ar-slot has${r === 'rare' ? ' rare' : r === 'epic' || r === 'legendary' ? ' epic' : ''}" data-slot="${slot}" data-idx="${e.idx}">
            ${e.img ? `<img class="ar-img" src="${esc(e.img)}" alt="" draggable="false">` : `<img class="ar-ph on" src="assets/armor/${slot}.png" alt="" draggable="false">`}
            <span class="ar-name">${esc(e.it.name ?? label)}</span>
            ${server ? '' : `<button type="button" class="ar-x" data-un="${slot}" aria-label="Take off ${esc(label)}">×</button>`}</div>`
          : `<div class="ar-slot" data-slot="${slot}"><img class="ar-ph" src="assets/armor/${slot}.png" alt="" draggable="false"><span class="ar-label">${label}</span></div>`
      }).join('')}</div>
      ${Object.keys(bonus).length ? `<div class="ar-bonus">${Object.entries(bonus).map(([k, v]) => `<span><b>${esc(k.toUpperCase())}</b> ${v > 0 ? '+' : ''}${num(v)}</span>`).join('')}</div>` : ''}
      ${!haveArmor && !n ? '<p class="subtext ar-hint">No armor in your inventory yet. Find some or buy it in the Shop.</p>' : ''}
      <p class="ar-credit">Slot icons: game-icons.net (CC BY 3.0)</p>`
    // mark inventory tiles
    grid.querySelectorAll('.inv-slot').forEach(el => {
      const s = slotOf(items[el.dataset.item]), on = Object.values(w).some(e => e.idx === Number(el.dataset.item))
      el.classList.toggle('is-armor', !!s); el.classList.toggle('worn', on)
    })
  }
  paint()

  panel.addEventListener('click', (e) => {
    const un = e.target.closest('[data-un]')
    if (un) { e.stopPropagation(); delete equip[un.dataset.un]; write('equip', equip); paint(); return }
    const has = e.target.closest('.ar-slot.has')
    if (has && Number(has.dataset.idx) >= 0) btn(has.dataset.idx)?.click()
  })
  grid.addEventListener('contextmenu', (e) => e.preventDefault())
  panel.addEventListener('contextmenu', (e) => e.preventDefault())

  /* ── drag engine (long-press on touch, small move on mouse) ── */
  function begin(src, kind, e) {
    const idx = Number(src.dataset.item ?? src.dataset.idx)
    const item = items[idx]; if (!item) return
    const ghostImg = src.querySelector('img')?.src
    const ghost = document.createElement('div')
    ghost.className = 'dnd-ghost'; ghost.innerHTML = ghostImg ? `<img src="${esc(ghostImg)}" alt="">` : ''
    document.body.appendChild(ghost)
    src.classList.add('dragging')
    drag = { src, kind, idx, item, slot: slotOf(item), ghost, sc: scroller(grid), y: e.clientY, raf: 0 }
    try { navigator.vibrate?.(14) } catch {}
    panel.classList.toggle('dnd-armor', !!drag.slot && !server)
    move(e)
    const tick = () => {
      if (!drag) return
      const h = innerHeight, edge = 90
      if (drag.y < edge) drag.sc?.scrollBy(0, -12); else if (drag.y > h - edge) drag.sc?.scrollBy(0, 12)
      drag.raf = requestAnimationFrame(tick)
    }
    drag.raf = requestAnimationFrame(tick)
  }
  function move(e) {
    if (!drag) return
    drag.y = e.clientY
    drag.ghost.style.transform = `translate(${e.clientX - 34}px,${e.clientY - 34}px)`
    document.querySelectorAll('.drop-ok,.drop-bad').forEach(n => n.classList.remove('drop-ok', 'drop-bad'))
    const t = document.elementFromPoint(e.clientX, e.clientY)
    const inv = t?.closest('.inv-slot'), ar = t?.closest('.ar-slot')
    if (ar && drag.kind === 'inv' && !server) ar.classList.add(drag.slot === ar.dataset.slot ? 'drop-ok' : 'drop-bad')
    else if (inv && inv !== drag.src) inv.classList.add('drop-ok')
    else if (drag.kind === 'slot' && t?.closest('.inv-grid')) grid.classList.add('drop-ok')
  }
  function finish(e, cancel) {
    if (!drag) return
    const d = drag; drag = null
    cancelAnimationFrame(d.raf); d.ghost.remove(); d.src.classList.remove('dragging'); panel.classList.remove('dnd-armor')
    document.querySelectorAll('.drop-ok,.drop-bad').forEach(n => n.classList.remove('drop-ok', 'drop-bad'))
    suppressUntil = Date.now() + 350
    if (cancel) return
    const t = document.elementFromPoint(e.clientX, e.clientY)
    const inv = t?.closest('.inv-slot'), ar = t?.closest('.ar-slot')
    if (d.kind === 'inv' && ar && !server) {
      if (d.slot === ar.dataset.slot) { equip[ar.dataset.slot] = keyOf(d.item); write('equip', equip); paint(); toast(`${d.item.name} equipped.`) }
      else toast(d.slot ? `That goes in the ${LABEL[d.slot]} slot.` : 'That is not armor.')
    } else if (d.kind === 'inv' && inv && inv !== d.src) {
      const kids = [...grid.querySelectorAll('.inv-slot')]
      kids.indexOf(d.src) < kids.indexOf(inv) ? inv.after(d.src) : inv.before(d.src)
      saveOrder()
    } else if (d.kind === 'slot' && !server && (inv || t?.closest('.inv-grid'))) {
      const s = d.src.dataset.slot; delete equip[s]; write('equip', equip); paint()
    }
  }

  function arm(root, sel) {
    root.addEventListener('pointerdown', (e) => {
      const src = e.target.closest(sel); if (!src || e.target.closest('[data-un]') || drag) return
      if (sel === '.ar-slot.has' && server) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const x0 = e.clientX, y0 = e.clientY, touch = e.pointerType !== 'mouse'
      let started = false, timer = 0
      const kind = sel === '.inv-slot' ? 'inv' : 'slot'
      const stop = () => { clearTimeout(timer); removeEventListener('pointermove', onMove, true); removeEventListener('pointerup', onUp, true); removeEventListener('pointercancel', onCancel, true); document.removeEventListener('touchmove', block, true) }
      const block = (ev) => { if (started) ev.preventDefault() }
      const go = (ev) => { started = true; begin(src, kind, ev) }
      const onMove = (ev) => {
        if (started) { move(ev); return }
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > (touch ? 10 : 5)) { if (touch) stop(); else go(ev) }
      }
      const onUp = (ev) => { const was = started; stop(); if (was) finish(ev, false) }
      const onCancel = (ev) => { const was = started; stop(); if (was) finish(ev, true) }
      document.addEventListener('touchmove', block, { capture: true, passive: false })
      addEventListener('pointermove', onMove, true); addEventListener('pointerup', onUp, true); addEventListener('pointercancel', onCancel, true)
      if (touch) timer = setTimeout(() => go({ clientX: x0, clientY: y0 }), 260)
    })
  }
  arm(grid, '.inv-slot')
  arm(panel, '.ar-slot.has')
}

const host = document.querySelector('#profileWrap')
if (host) new MutationObserver(() => { if (location.hash.startsWith('#/profile')) enhance() }).observe(host, { childList: true, subtree: true })
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#/profile')) setTimeout(enhance, 60) })
