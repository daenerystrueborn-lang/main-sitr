/**
 * mobile-pages.js - everything that only exists on a phone.
 *
 * The site itself is one responsive document, so "mobile" here means the
 * narrow breakpoint (`--mob`, mirrored in CSS as max-width: 820px). Three
 * things live here:
 *
 *   1. the floating bottom bar that replaces the curved desktop pill nav;
 *   2. the season page's event slider, which stands in for the hero photo;
 *   3. the pages the desktop site deliberately doesn't show - Guilds, Empires,
 *      Wallet, Storage, Progress and Pokémon - plus the inventory manager that
 *      opens from the profile.
 *
 * Every loader is written to survive an endpoint that isn't live yet: the bot
 * ships these routes separately, so a 404 must read as "not available yet",
 * never as a blank screen or a dead button.
 */
import { api, hasSession } from './api.js'
import {
  $, $$, esc, attr, num, titleCase, iconSvg,
  toast, emptyState, openModal, closeModal, skeletonCards, bar,
} from './ui.js'
import { itemCard, itemArt, itemMeta, itemSheetHtml, statBonusTiles, itemQty } from './items.js'
import {
  pick, toNum, counted, listOf, imgOf, cleanText, isOwned, plural, hueOf, crestInitials,
} from './shape.js'

/* ───────────────────────────── breakpoint ─────────────────────────────── */

/** Keep this in step with `@media (max-width: 820px)` in style.css. */
export const MOBILE_MQ = window.matchMedia('(max-width: 820px)')
export const isMobileView = () => MOBILE_MQ.matches

/* ─────────────────────────── floating bottom bar ──────────────────────── */

/**
 * The four routes that get a bar slot. Everything else lives in the drawer,
 * which the bar's "More" button opens.
 *
 * Chosen because they are the four things a player opens the site to do: see
 * what's new, check the ladder, spend solars, and read what Premium adds.
 */
export const MOBILE_SLOTS = [
  { route: 'home', label: 'Home', icon: 'spark' },
  { route: 'leaderboard', label: 'Boards', icon: 'rank' },
  { route: 'shop', label: 'Shop', icon: 'inventory' },
  { route: 'premium', label: 'Premium', icon: 'gift' },
]

/**
 * Reflects the current route onto the bar. `[data-route]` links elsewhere are
 * handled by render(); the bar needs its own pass because "More" has no route
 * of its own but should light up whenever the current page lives in the drawer.
 */
export function paintMobileBar(name) {
  const barEl = $('#mobileBar')
  if (!barEl) return
  const onBar = MOBILE_SLOTS.some(s => s.route === name)
  for (const slot of $$('[data-mbar]', barEl)) {
    const active = slot.dataset.mbar === name
    slot.classList.toggle('is-active', active)
    slot.setAttribute('aria-current', active ? 'page' : 'false')
  }
  const more = $('#mbarMore', barEl)
  if (more) {
    more.classList.toggle('is-active', !onBar)
    more.setAttribute('aria-current', !onBar ? 'page' : 'false')
  }
}

/* ───────────────────────── season event slider ────────────────────────── */

/**
 * The season page used to open on a single hero photograph. On a phone that
 * photograph held a whole screen and said one thing; the slider says three and
 * each one is tappable.
 *
 * Slides are content, not data: the bot has no events endpoint for them, and
 * two of the three are announcements for characters whose kits aren't written
 * yet. When the bot grows /events this array is the only thing that changes.
 *
 * Only the Halloween card has a claim on it, and that claim is server-side -
 * `api.claimEvent()` posts and reports exactly what was granted. If the route
 * isn't live yet the card says so instead of pretending.
 */
const SEASON_EVENTS = [
  {
    id: 'lisa',
    kicker: 'New character',
    title: 'Lisa',
    desc: 'A new face arrives with the season. Her kit and stats drop with the roster update.',
    image: 'https://i.ibb.co/DfByGBvk/1861-Lisa.jpg',
    cta: 'Preview',
  },
  {
    id: 'rinko',
    kicker: 'Pre-announcement',
    title: 'Rinko',
    desc: 'Teased ahead of her release. Details are still under wraps - watch this space.',
    image: 'https://i.ibb.co/6qfHQRY/Rinko-5-Bandori.jpg',
    cta: 'Preview',
  },
  {
    id: 'halloween',
    kicker: 'Limited event',
    title: 'Halloween Giveaway',
    desc: 'One claim per account. Tap to collect the drop before the season turns.',
    image: 'https://i.ibb.co/ymySXjzR/D4DJ.jpg',
    rewards: [
      { label: '30 gems', icon: 'gift' },
      { label: '20,000 solars', icon: 'spark' },
    ],
    cta: 'Claim gift',
    claim: true,
  },
]

let evIndex = 0
let evTimer = null

/** Reveals one event's art on its own - no claim, nothing to spend. */
function openEventPreview(ev) {
  openModal(`
    <div class="ev-sheet">
      <div class="ev-sheet-art">
        <img src="${attr(ev.image)}" alt="${attr(ev.title)}" referrerpolicy="no-referrer" decoding="async">
        <div class="ev-veil"></div>
        <span class="ev-badge">${esc(ev.kicker)}</span>
      </div>
      <div class="pd-body">
        <h3 style="font-size:20px;margin-bottom:6px">${esc(ev.title)}</h3>
        <p class="subtext">${esc(ev.desc)}</p>
        <p class="subtext" style="margin-top:16px">${iconSvg('spark', 'inline-icon')} Arrives with the next roster update.</p>
      </div>
    </div>`)
}

/**
 * Claims the gift.
 *
 * The server is the only thing that can grant it, so this never fakes a
 * balance change: it posts, then reports the server's own numbers. A route
 * that isn't deployed yet gets a calm "not live" message rather than an error
 * dump - the card stays tappable so it works the day the bot ships it.
 */
async function claimEvent(ev) {
  const btn = $('#evClaimBtn')
  if (btn) { btn.disabled = true; btn.textContent = 'Claiming…' }

  try {
    const out = await api.claimEvent(ev.id)
    const granted = out?.granted ?? out?.rewards ?? out
    const parts = []
    if (granted?.gems) parts.push(`${num(granted.gems)} gems`)
    if (granted?.solars) parts.push(`${num(granted.solars)} solars`)
    toast(parts.length ? `Claimed ${parts.join(' + ')}` : 'Gift claimed', 'ok')
    if (btn) btn.textContent = 'Claimed'
  } catch (err) {
    const notLive = err?.status === 404 || err?.status === 405
    toast(
      notLive
        ? 'This giveaway isn’t live yet - it lands with the next bot update.'
        : (err?.message ?? 'Could not claim right now.'),
      notLive ? '' : 'err',
    )
    if (btn) { btn.disabled = false; btn.textContent = ev.cta ?? 'Claim gift' }
  }
}

function paintEventSlide(index) {
  const track = $('#evTrack')
  if (!track) return
  const slides = $$('.ev-slide', track)
  if (!slides.length) return
  evIndex = ((index % slides.length) + slides.length) % slides.length
  const slide = slides[evIndex]
  const left = Math.max(0, slide.offsetLeft - track.offsetLeft)
  // scrollTo on an element is missing in a few webviews; setting scrollLeft is
  // the same move without the smooth easing, which is fine as a fallback.
  if (typeof track.scrollTo === 'function') track.scrollTo({ left, behavior: 'smooth' })
  else track.scrollLeft = left
  for (const dot of $$('.ev-dot', $('#evDots'))) {
    const on = Number(dot.dataset.evDot) === evIndex
    dot.classList.toggle('is-on', on)
    dot.setAttribute('aria-selected', String(on))
  }
}

function startEventTimer() {
  clearInterval(evTimer)
  // Never autoplay for someone who asked for less motion; they can swipe.
  if (document.documentElement.classList.contains('no-motion')) return
  evTimer = setInterval(() => {
    if (document.hidden || !isMobileView()) return
    paintEventSlide(evIndex + 1)
  }, 5600)
}

/**
 * Builds the slider. Safe to call on every season load: it only fills an empty
 * host, so coming back to the page doesn't restart the carousel underneath the
 * reader.
 */
export function mountSeasonEvents() {
  const host = $('#seasonEvents')
  if (!host || host.dataset.mounted === '1') return
  host.dataset.mounted = '1'

  host.innerHTML = `
    <div class="ev-slider" aria-roledescription="carousel" aria-label="Season events">
      <div class="ev-track" id="evTrack" tabindex="0" aria-live="polite">
        ${SEASON_EVENTS.map((ev, i) => `
          <article class="ev-slide" role="group" aria-roledescription="slide"
                   aria-label="${i + 1} of ${SEASON_EVENTS.length}: ${attr(ev.title)}">
            <div class="ev-media">
              <img src="${attr(ev.image)}" alt="" referrerpolicy="no-referrer" decoding="async" loading="${i === 0 ? 'eager' : 'lazy'}">
              <div class="ev-veil"></div>
              <span class="ev-badge">${esc(ev.kicker)}</span>
            </div>
            <div class="ev-body">
              <h2 class="ev-title">${esc(ev.title)}</h2>
              <p class="ev-desc">${esc(ev.desc)}</p>
              ${ev.rewards ? `<div class="ev-rewards">${ev.rewards.map(r =>
                `<span class="ev-reward">${iconSvg(r.icon, 'inline-icon')} ${esc(r.label)}</span>`).join('')}</div>` : ''}
              <button type="button" class="btn btn-primary btn-sm ev-cta"
                      data-ev="${attr(ev.id)}" ${ev.claim ? 'id="evClaimBtn"' : ''}>${esc(ev.cta)}</button>
            </div>
          </article>`).join('')}
      </div>
      <div class="ev-dots" id="evDots" role="tablist" aria-label="Choose event">
        ${SEASON_EVENTS.map((ev, i) => `
          <button type="button" class="ev-dot${i === 0 ? ' is-on' : ''}" data-ev-dot="${i}"
                  role="tab" aria-label="${attr(ev.title)}" aria-selected="${i === 0}"></button>`).join('')}
      </div>
    </div>`

  const track = $('#evTrack')
  track.addEventListener('scroll', () => {
    // Derive the active dot from scroll position rather than tracking the drag,
    // so a flick with momentum ends on the right one.
    const width = track.clientWidth || 1
    const next = Math.round(track.scrollLeft / width)
    if (next !== evIndex && next >= 0 && next < SEASON_EVENTS.length) {
      evIndex = next
      for (const dot of $$('.ev-dot', $('#evDots'))) {
        const on = Number(dot.dataset.evDot) === evIndex
        dot.classList.toggle('is-on', on)
        dot.setAttribute('aria-selected', String(on))
      }
    }
  }, { passive: true })
  track.addEventListener('pointerdown', () => clearInterval(evTimer), { passive: true })
  track.addEventListener('pointerup', () => startEventTimer(), { passive: true })
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); paintEventSlide(evIndex + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); paintEventSlide(evIndex - 1) }
  })

  for (const dot of $$('.ev-dot', $('#evDots'))) {
    dot.onclick = () => { paintEventSlide(Number(dot.dataset.evDot)); startEventTimer() }
  }

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ev]')
    if (!btn) return
    const ev = SEASON_EVENTS.find(x => x.id === btn.dataset.ev)
    if (!ev) return
    if (!ev.claim) return openEventPreview(ev)
    if (!hasSession()) { location.hash = '#/login'; toast('Sign in to claim'); return }
    claimEvent(ev)
  })

  startEventTimer()
}

/* ─────────────────────────── inventory manager ────────────────────────── */

const LOADOUT_SLOTS = ['weapon', 'offhand', 'helmet', 'chestplate', 'boots', 'tool']
const SLOT_LABEL = {
  weapon: 'Weapon', offhand: 'Offhand', helmet: 'Helmet',
  chestplate: 'Chestplate', boots: 'Boots', tool: 'Tool',
}
const SLOT_ICON = {
  weapon: 'battle', offhand: 'lock', helmet: 'character',
  chestplate: 'security', boots: 'compass', tool: 'inventory',
}

/**
 * Manager state. Kept module-level so a re-render (after an equip, a sell, a
 * tab switch) doesn't have to re-fetch everything from scratch.
 */
const mgr = {
  tab: 'items',
  category: '',
  items: [],
  cursor: null,
  categories: [],
  used: 0,
  capacity: 30,
  premium: false,
  equipment: null,
  view: 'grid',          // 'grid' | 'sheet' | 'pick'
  sheetId: null,
  pickSlot: null,
  confirm: null,         // { action, id }
  busy: false,
}

const stackId = (i) => i?.instanceId ?? i?.id
const mgrItemById = (id) => mgr.items.find(i => String(stackId(i)) === String(id))

/** Free accounts carry 30 stacks; Premium lifts it to 50. The server is the
 *  source of truth when it says otherwise, this is only the fallback copy. */
const CAP_FREE = 30
const CAP_PREMIUM = 50

function capacityOf(out) {
  const used = out?.storage?.used ?? out?.used ?? out?.total ?? mgr.items.length
  const capacity = out?.storage?.capacity ?? out?.capacity ?? out?.cap
  return { used, capacity }
}

function equipmentMap(eq) {
  if (!eq) return {}
  if (Array.isArray(eq.slots)) {
    return Object.fromEntries(eq.slots.map(s => [s.slot || s.id, s.item || s.equipped || null]))
  }
  return eq.slots || eq.equipment || eq || {}
}

/**
 * Opens the manager. The shell is drawn once and `renderMgr()` repaints its
 * contents, so switching tabs and coming back from an item sheet never
 * re-opens the dialog (which would steal focus and scroll to the top).
 */
export async function openInventoryManager(tab = 'items') {
  mgr.tab = tab
  mgr.view = 'grid'
  mgr.sheetId = null
  mgr.pickSlot = null
  mgr.confirm = null

  openModal(`<div id="mgrRoot">${skeletonCards(2)}</div>`)
  await mgrLoad()
  renderMgr()
}

async function mgrLoad({ append = false } = {}) {
  const cursor = append ? mgr.cursor : undefined
  try {
    const [inv, eq] = await Promise.all([
      api.inventory({ category: mgr.category, cursor, limit: 24 }),
      api.equipment().catch(() => null),
    ])
    const rows = inv?.items ?? inv?.inventory ?? []
    mgr.items = append ? [...mgr.items, ...rows] : rows
    mgr.cursor = inv?.nextCursor ?? null
    mgr.categories = inv?.categories ?? mgr.categories
    const cap = capacityOf(inv)
    mgr.used = Number(cap.used ?? mgr.items.length)
    mgr.capacity = Number(cap.capacity ?? (mgr.premium ? CAP_PREMIUM : CAP_FREE)) || CAP_FREE
    mgr.premium = !!inv?.storage?.premium || mgr.capacity > CAP_FREE
    // The bot answers either { equipment: {...} } or the loadout itself.
    if (eq) mgr.equipment = equipmentMap(eq.equipment ?? eq.equipmentSlots ?? eq)
  } catch (err) {
    mgr.items = append ? mgr.items : []
    mgr.error = err?.message ?? 'Inventory is unavailable right now.'
  }
}

const mgrRoot = () => $('#mgrRoot')

function mgrTabs() {
  const equipped = Object.values(mgr.equipment ?? {}).filter(Boolean).length
  const tabs = [
    ['items', `Items${mgr.items.length ? ` (${mgr.items.length})` : ''}`],
    ['loadout', `Loadout${equipped ? ` (${equipped}/6)` : ''}`],
    ['pvp', 'PvP'],
  ]
  return `<div class="mgr-tabs" role="tablist" aria-label="Inventory sections">
    ${tabs.map(([id, label]) => `
      <button type="button" class="mgr-tab${mgr.tab === id ? ' is-on' : ''}" data-mgr-tab="${id}"
              role="tab" aria-selected="${mgr.tab === id}">${label}</button>`).join('')}
  </div>`
}

function mgrCapBar() {
  const pct = Math.min(100, Math.round((mgr.used / Math.max(1, mgr.capacity)) * 100))
  // Past 85% the meter turns warm: at that point the next pickup may bounce,
  // and a gold bar that has always looked decorative wouldn't say so.
  const tight = pct >= 85
  return `
    <div class="mgr-cap${tight ? ' is-tight' : ''}">
      <div class="mgr-cap-top">
        <strong class="mgr-cap-num">${num(mgr.used)} <span class="subtext">/ ${num(mgr.capacity)} slots</span></strong>
        <span class="mgr-cap-tag">${tight ? `${pct}% full` : (mgr.premium ? 'Premium' : 'Free')}</span>
      </div>
      <div class="mgr-cap-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${pct}" aria-label="Inventory space used"><i style="width:${pct}%"></i></div>
      ${mgr.premium
        ? `<p class="mgr-note">Premium space: ${num(CAP_PREMIUM)} stacks instead of ${num(CAP_FREE)}.</p>`
        : `<p class="mgr-note">Free accounts carry ${num(CAP_FREE)} stacks. Premium lifts it to ${num(CAP_PREMIUM)}.</p>`}
    </div>`
}

function mgrItemsPanel() {
  if (mgr.error && !mgr.items.length) {
    return emptyState('inventory', 'Inventory unavailable', mgr.error)
  }
  const pills = `<div class="filter-pills" role="tablist" aria-label="Item categories">
    ${[{ id: '', label: 'All' }, ...mgr.categories.map(c => (typeof c === 'string'
      ? { id: c, label: c }
      : { id: c.id || c.key, label: c.label || c.name || c.id || c.key }))]
      .filter(c => c.id !== undefined)
      .map(c => `<button type="button" class="filter-pill${mgr.category === c.id ? ' is-on' : ''}"
        data-mgr-cat="${attr(c.id)}" role="tab" aria-selected="${mgr.category === c.id}">${esc(c.label)}</button>`).join('')}
  </div>`

  if (!mgr.items.length) {
    return pills + emptyState('inventory', 'Nothing carried', 'Items you pick up in the bot show up here.')
  }

  return pills + `
    <div class="mgr-grid">
      ${mgr.items.map(i => itemCard(i, { attrs: `data-mgr-item="${attr(String(stackId(i)))}"` })).join('')}
    </div>
    ${mgr.cursor ? `<button type="button" class="btn btn-secondary btn-sm btn-block" id="mgrMore" style="margin-top:14px">Load more items</button>` : ''}`
}

function slotCard(slot, item, { interactive = true } = {}) {
  const inner = `
    <span class="loadout-art">
      ${item ? itemArt(item.image) : `<span class="loadout-empty">${iconSvg(SLOT_ICON[slot] ?? 'inventory', 'inventory-icon')}</span>`}
    </span>
    <span class="loadout-name">${esc(item?.name ?? 'Empty')}</span>
    <span class="loadout-kind">${esc(SLOT_LABEL[slot] ?? titleCase(slot))}</span>`
  return interactive
    ? `<button type="button" class="loadout-slot${item ? ' is-filled' : ''}" data-mgr-slot="${attr(slot)}"
               aria-label="${attr(`${SLOT_LABEL[slot] ?? slot}: ${item?.name ?? 'empty'}`)}">${inner}</button>`
    : `<div class="loadout-slot${item ? ' is-filled' : ''}">${inner}</div>`
}

function mgrLoadoutPanel() {
  const equipped = mgr.equipment ?? {}
  return `
    <p class="mgr-note" style="margin-top:0">Tap a slot to see what fits it. Two-handed weapons take the offhand with them.</p>
    <div class="loadout-grid">
      ${LOADOUT_SLOTS.map(s => slotCard(s, equipped[s])).join('')}
    </div>`
}

function mgrPvpPanel() {
  const equipped = mgr.equipment ?? {}
  return `
    <div class="mgr-pvp">
      <div class="mgr-pvp-head">
        ${iconSvg('battle', 'inline-icon')}
        <div>
          <strong>PvP uses your equipped set</strong>
          <p class="subtext">Arena battles read the same loadout as PvE - there is no second copy of your gear, so what you see here is exactly what you fight with.</p>
        </div>
      </div>
      <div class="loadout-grid is-static">
        ${LOADOUT_SLOTS.map(s => slotCard(s, equipped[s], { interactive: false })).join('')}
      </div>
      <button type="button" class="btn btn-secondary btn-sm btn-block" id="mgrToLoadout" style="margin-top:16px">Change loadout</button>
    </div>`
}

function mgrSheet(id) {
  const item = mgrItemById(id)
  if (!item) return emptyState('warning', 'Item not found', 'It may have moved or been used.')
  const qty = itemQty(item)
  const bonuses = statBonusTiles(item.statBonuses)
  const slot = item.slot || item.equipmentSlot
  const confirming = mgr.confirm?.id === String(id) ? mgr.confirm.action : null

  return `
    <button type="button" class="mgr-back" id="mgrBack">‹ Back to items</button>
    ${itemSheetHtml(item, qty)}
    <div class="pd-body">
      ${item.description ? `<p class="subtext">${esc(item.description)}</p>` : ''}
      ${bonuses ? `<div class="pd-sec-title">Stat bonuses</div><div class="pd-stats">${bonuses}</div>` : ''}
      <div class="mgr-actions">
        ${slot ? `<button type="button" class="btn btn-primary btn-sm" data-mgr-action="equip" ${mgr.busy ? 'disabled' : ''}>Equip to ${esc(SLOT_LABEL[slot] ?? titleCase(slot))}</button>` : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-mgr-action="use" ${mgr.busy ? 'disabled' : ''}>Use</button>
        <button type="button" class="btn btn-secondary btn-sm" data-mgr-action="store" ${mgr.busy ? 'disabled' : ''}>Move to storage</button>
        <button type="button" class="btn btn-secondary btn-sm" data-mgr-action="sell" ${mgr.busy ? 'disabled' : ''}>${confirming === 'sell' ? 'Confirm sell 1' : 'Sell 1'}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-mgr-action="discard" ${mgr.busy ? 'disabled' : ''}>${confirming === 'discard' ? 'Confirm discard' : 'Discard 1'}</button>
      </div>
      ${item.sellPrice ? `<p class="subtext" style="margin-top:12px">Sells for ${num(item.sellPrice)} solars each.</p>` : ''}
    </div>`
}

function mgrPicker(slot) {
  const compatible = mgr.items.filter(i => (i.slot || i.equipmentSlot) === slot)
  const equipped = mgr.equipment?.[slot]
  return `
    <button type="button" class="mgr-back" id="mgrBack">‹ Back to loadout</button>
    <h3 style="font-size:18px;margin:6px 0 4px">${esc(SLOT_LABEL[slot] ?? titleCase(slot))}</h3>
    <p class="mgr-note">${compatible.length
      ? `${compatible.length} item${compatible.length === 1 ? '' : 's'} in your bag fit this slot.`
      : 'Nothing in your bag fits this slot yet.'}</p>
    ${equipped ? `<button type="button" class="btn btn-ghost btn-sm btn-block" id="mgrUnequip" style="margin-bottom:12px">Unequip ${esc(equipped.name)}</button>` : ''}
    <div class="mgr-grid">
      ${compatible.map(i => itemCard(i, { attrs: `data-mgr-pick="${attr(String(stackId(i)))}"` })).join('')}
    </div>`
}

function renderMgr() {
  const host = mgrRoot()
  if (!host) return
  let body
  if (mgr.view === 'sheet') body = mgrSheet(mgr.sheetId)
  else if (mgr.view === 'pick') body = mgrPicker(mgr.pickSlot)
  else if (mgr.tab === 'loadout') body = mgrLoadoutPanel()
  else if (mgr.tab === 'pvp') body = mgrPvpPanel()
  else body = mgrItemsPanel()

  host.innerHTML = `
    <div class="mgr-head">
      <h3>Inventory</h3>
      ${mgrCapBar()}
    </div>
    ${mgr.view === 'grid' ? mgrTabs() : ''}
    <div class="mgr-body">${body}</div>`

  wireMgr()
}

function wireMgr() {
  const host = mgrRoot()
  if (!host) return

  for (const tab of $$('[data-mgr-tab]', host)) {
    tab.onclick = () => { mgr.tab = tab.dataset.mgrTab; mgr.view = 'grid'; renderMgr() }
  }
  for (const pill of $$('[data-mgr-cat]', host)) {
    pill.onclick = async () => {
      mgr.category = pill.dataset.mgrCat
      mgr.items = []; mgr.cursor = null; mgr.error = null
      host.querySelector('.mgr-body').innerHTML = skeletonCards(1)
      await mgrLoad()
      renderMgr()
    }
  }
  const more = $('#mgrMore', host)
  if (more) more.onclick = async () => { more.disabled = true; await mgrLoad({ append: true }); renderMgr() }

  for (const tile of $$('[data-mgr-item]', host)) {
    tile.onclick = () => { mgr.sheetId = tile.dataset.mgrItem; mgr.view = 'sheet'; mgr.confirm = null; renderMgr() }
  }
  for (const tile of $$('[data-mgr-pick]', host)) {
    tile.onclick = () => mgrDo('equip', tile.dataset.mgrPick)
  }
  for (const slot of $$('[data-mgr-slot]', host)) {
    slot.onclick = () => { mgr.pickSlot = slot.dataset.mgrSlot; mgr.view = 'pick'; renderMgr() }
  }
  const back = $('#mgrBack', host)
  if (back) back.onclick = () => { mgr.view = 'grid'; mgr.confirm = null; renderMgr() }
  const toLoadout = $('#mgrToLoadout', host)
  if (toLoadout) toLoadout.onclick = () => { mgr.tab = 'loadout'; mgr.view = 'grid'; renderMgr() }
  const unequip = $('#mgrUnequip', host)
  if (unequip) unequip.onclick = () => mgrDo('unequip', mgr.pickSlot)

  for (const btn of $$('[data-mgr-action]', host)) {
    btn.onclick = () => mgrDo(btn.dataset.mgrAction, mgr.sheetId)
  }
}

/**
 * Runs one manager action.
 *
 * Anything destructive is two-tap: the first tap turns the button into
 * "Confirm …" and the second runs it. That beats a browser confirm() on a
 * phone, and it can't be dismissed into the wrong branch by a stray tap.
 */
async function mgrDo(action, id) {
  if (mgr.busy) return
  const item = action === 'equip' || action === 'unequip' ? null : mgrItemById(id)

  if ((action === 'sell' || action === 'discard') && mgr.confirm?.action !== action) {
    mgr.confirm = { action, id: String(id) }
    renderMgr()
    return
  }

  mgr.busy = true
  mgr.confirm = null
  try {
    // From the loadout grid the slot is known; from an item sheet it comes off
    // the item itself, which is what the bot validates against anyway.
    if (action === 'equip') await api.equip(id, mgr.pickSlot || item?.slot || item?.equipmentSlot || null)
    else if (action === 'unequip') await api.unequip(id)
    else if (action === 'use') await api.useItem(id)
    else if (action === 'sell') await api.sellItem(id, 1)
    else if (action === 'discard') await api.discardItem(id, 1)
    else if (action === 'store') await api.storageMove({ itemInstanceId: id, qty: 1, to: 'storage' })

    const label = { equip: 'Equipped', unequip: 'Unequipped', use: 'Used', sell: 'Sold', discard: 'Discarded', store: 'Moved to storage' }[action]
    toast(`${label}${item ? ` ${item.name}` : ''}`.trim(), 'ok')

    mgr.view = 'grid'
    await mgrLoad()
  } catch (err) {
    toast(err?.message ?? 'That didn’t work', 'err')
  } finally {
    mgr.busy = false
    renderMgr()
  }
}

/* ─────────────────────────────── guilds ───────────────────────────────── */

/**
 * Guild and empire crests.
 *
 * The API turned out to have no per-record artwork in the payloads the pages
 * were reading: every guild fell back to the same `/image` endpoint and every
 * empire to the same capital painting, so a list of thirty guilds looked like
 * thirty copies of one guild.
 *
 * A crest is therefore generated from the record itself - initials plus a hue
 * derived from the name - and the API image is layered on top when there is
 * one. Same guild, same crest, on any device, with no request.
 */
function crestHtml(name, { img = '', size = 'md' } = {}) {
  const label = cleanText(name, '?')
  const hue = hueOf(label)
  return `
    <span class="crest crest-${attr(size)}" style="--h:${hue}">
      <span class="crest-glyph">${esc(crestInitials(label))}</span>
      ${img ? `<img src="${attr(img)}" alt="" loading="lazy" referrerpolicy="no-referrer"
                    onerror="this.remove()">` : ''}
    </span>`
}

/** The record's own image, if the API gave one. No shared fallback here. */
const recordArt = (rec) => imgOf(rec)

function guildQuery(g) {
  return g?.slug ?? g?.query ?? g?.guildId ?? g?.id ?? g?.tag ?? g?.name ?? ''
}

/**
 * Guild numbers, read defensively: `memberCount`, `members` (number or array),
 * `citizens`, `population`, `size` all reach the same slot.
 */
function guildFacts(g) {
  const members = counted(pick(g, ['memberCount', 'membersCount', 'members', 'citizenCount', 'population', 'size']), null)
  const level = toNum(pick(g, ['level', 'tier', 'guildLevel']), null)
  const power = toNum(pick(g, ['power', 'score', 'points', 'prestige', 'contribution']), null)
  return [
    members != null && `${num(members)} ${plural(members, 'member')}`,
    level != null && `Lv ${num(level)}`,
    power != null && `${num(power)} power`,
  ].filter(Boolean)
}

export async function loadGuilds() {
  const root = $('#guildRoot')
  if (!root) return
  root.innerHTML = skeletonCards(3)

  const [mine, list] = await Promise.all([
    api.myGuild().catch(() => null),
    api.guilds().catch(err => ({ __error: err })),
  ])

  if (list?.__error && !mine) {
    root.innerHTML = emptyState('warning', 'Guilds aren’t live yet', list.__error.message ?? 'The bot hasn’t opened this route.')
    return
  }

  const guilds = listOf(list, ['guilds', 'rows', 'results'])
  const myGuild = listOf(mine, ['guilds'])[0] ?? (pick(mine, ['guild']) ?? (pick(mine, ['name']) ? mine : null))
  const mineQuery = myGuild ? guildQuery(myGuild) : ''

  root.innerHTML = `
    ${myGuild ? `
      <section class="mob-sec">
        <div class="sec-head"><h2>Your guild</h2></div>
        ${guildCard(myGuild, { mine: true })}
      </section>` : ''}
    <section class="mob-sec">
      <div class="sec-head"><h2>All guilds</h2><span class="subtext">${num(guilds.length)} listed</span></div>
      ${guilds.length
        ? `<div class="guild-grid">${guilds
          .filter(g => guildQuery(g) !== mineQuery)
          .map(g => guildCard(g)).join('')}</div>`
        : emptyState('rank', 'No guilds listed', 'Guilds appear here as they’re founded in the bot.')}
    </section>`

  for (const card of $$('[data-guild]', root)) {
    card.onclick = () => openGuild(card.dataset.guild)
  }
}

function guildCard(g, { mine = false } = {}) {
  const query = guildQuery(g)
  const name = cleanText(pick(g, ['name', 'guildName', 'title']), 'Guild')
  const tag = cleanText(pick(g, ['tag', 'guildTag', 'shortName']))
  const facts = guildFacts(g)
  const desc = cleanText(pick(g, ['description', 'bio', 'motto', 'about']))
  const leader = cleanText(pick(g, ['leaderName', 'ownerName', 'leader', 'owner', 'master']))

  return `
    <button type="button" class="guild-card${mine ? ' is-mine' : ''}" data-guild="${attr(query)}">
      ${crestHtml(name, { img: recordArt(g), size: 'md' })}
      <span class="guild-body">
        <span class="guild-name">${esc(name)}${tag ? ` <span class="guild-tag">[${esc(tag)}]</span>` : ''}</span>
        <span class="guild-sub">${esc(facts.join(' · ') || (leader ? `Led by ${leader}` : 'Guild'))}</span>
        ${desc ? `<span class="guild-desc">${esc(desc)}</span>` : ''}
      </span>
      <span class="guild-go">${iconSvg('chevron', 'inline-icon')}</span>
    </button>`
}

async function openGuild(query) {
  if (!query) return
  openModal(skeletonCards(2))
  const [detail, board, shop] = await Promise.all([
    api.guild(query).catch(err => ({ __error: err })),
    api.guildBoard(query).catch(() => null),
    api.guildShop(query).catch(() => null),
  ])
  if (detail?.__error) {
    openModal(emptyState('warning', 'Guild unavailable', detail.__error.message ?? ''))
    return
  }

  const g = pick(detail, ['guild']) ?? detail
  const rows = listOf(board, ['rows', 'board', 'members', 'leaderboard'])
  const stock = listOf(shop, ['items', 'shop', 'stock', 'offers'])
  const name = cleanText(pick(g, ['name', 'guildName', 'title']), 'Guild')
  const facts = guildFacts(g)

  openModal(`
    <div class="guild-sheet">
      <div class="guild-sheet-head">
        ${crestHtml(name, { img: recordArt(g), size: 'lg' })}
        <div class="guild-sheet-id">
          <h3>${esc(name)}</h3>
          <p>${esc(facts.join(' · ') || 'Guild')}</p>
        </div>
      </div>
      <div class="pd-body">
        ${cleanText(pick(g, ['description', 'bio', 'motto', 'about'])) ? `<p class="subtext">${esc(cleanText(pick(g, ['description', 'bio', 'motto', 'about'])))}</p>` : ''}
        ${statChips(pick(g, ['stats', 'perks', 'bonuses']))}

        <div class="pd-sec-title">Leaderboard</div>
        ${rows.length ? `<div class="lb-list">${rows.slice(0, 12).map((r, i) => `
          <div class="lb-row is-static">
            <span class="lb-rank">${i + 1}</span>
            <span class="lb-name">${esc(cleanText(pick(r, ['name', 'player', 'playerName', 'username']), 'Member'))}
              <span class="sub">${esc(cleanText(pick(r, ['role', 'rank']), ''))}</span></span>
            <span class="lb-score">${num(counted(pick(r, ['score', 'points', 'contribution', 'power']), 0))}</span>
          </div>`).join('')}</div>`
          : `<p class="subtext">No contributions logged yet.</p>`}

        <div class="pd-sec-title">Guild shop</div>
        ${stock.length ? `<div class="mgr-grid">${stock.slice(0, 8).map(i => `
          <div class="item-card is-static">${itemArt(imgOf(i))}
            <span class="item-card-name">${esc(cleanText(pick(i, ['name', 'title']), 'Item'))}</span>
            <span class="item-card-sub">${toNum(pick(i, ['price', 'cost', 'buyPrice']), null) != null
              ? `${num(toNum(pick(i, ['price', 'cost', 'buyPrice']), 0))} solars`
              : esc(itemMeta(i))}</span>
          </div>`).join('')}</div>`
          : `<p class="subtext">This guild hasn’t stocked its shop yet.</p>`}
      </div>
    </div>`)
}

/* ─────────────────────────────── empires ──────────────────────────────── */

const EMPIRE_CAPITAL_ART = 'https://i.ibb.co/8L7S38gD/Empires-Capital.jpg'

function empireQuery(e) {
  return e?.slug ?? e?.query ?? e?.empireId ?? e?.id ?? e?.name ?? ''
}

function empireFacts(e) {
  const citizens = counted(pick(e, ['citizenCount', 'population', 'members', 'memberCount', 'citizens']), null)
  const land = counted(pick(e, ['territoryCount', 'territories', 'land', 'provinces', 'tiles']), null)
  const power = toNum(pick(e, ['power', 'militaryPower', 'army', 'strength', 'score']), null)
  return [
    citizens != null && `${num(citizens)} ${plural(citizens, 'citizen')}`,
    land != null && `${num(land)} ${plural(land, 'territory', 'territories')}`,
    power != null && `${num(power)} power`,
  ].filter(Boolean)
}

export async function loadEmpires() {
  const root = $('#empireRoot')
  if (!root) return
  root.innerHTML = skeletonCards(3)

  const [mine, list] = await Promise.all([
    api.myEmpire().catch(() => null),
    api.empires().catch(err => ({ __error: err })),
  ])

  if (list?.__error && !mine) {
    root.innerHTML = emptyState('warning', 'Empires aren’t live yet', list.__error.message ?? 'The bot hasn’t opened this route.')
    return
  }

  const empires = listOf(list, ['empires', 'rows', 'results'])
  const myEmpire = listOf(mine, ['empires'])[0] ?? (pick(mine, ['empire']) ?? (pick(mine, ['name']) ? mine : null))
  const myQuery = myEmpire ? empireQuery(myEmpire) : ''

  root.innerHTML = `
    <section class="mob-sec">
      <div class="empire-hero">
        <img src="${EMPIRE_CAPITAL_ART}" alt="" referrerpolicy="no-referrer" decoding="async">
        <div class="ev-veil"></div>
        <div class="empire-hero-body">
          <span class="ev-badge">Empires</span>
          <h2>${myEmpire ? esc(cleanText(pick(myEmpire, ['name', 'empireName']), 'Your empire')) : 'Claim your corner of the map'}</h2>
          <p>${myEmpire
            ? esc(empireFacts(myEmpire).join(' · ') || 'Your empire, its holdings and its garrison.')
            : 'Empires hold territory, raise armies and tax the roads between them.'}</p>
        </div>
      </div>
    </section>

    ${myEmpire ? `
      <section class="mob-sec">
        <div class="sec-head"><h2>Your empire</h2></div>
        ${empireCard(myEmpire, { mine: true })}
      </section>` : ''}

    <section class="mob-sec">
      <div class="sec-head"><h2>All empires</h2><span class="subtext">${num(empires.length)} standing</span></div>
      ${empires.length
        ? `<div class="guild-grid">${empires.filter(e => empireQuery(e) !== myQuery).map(e => empireCard(e)).join('')}</div>`
        : emptyState('rank', 'No empires yet', 'The first empire to rise will be listed here.')}
    </section>`

  for (const card of $$('[data-empire]', root)) {
    card.onclick = () => openEmpire(card.dataset.empire)
  }
}

function empireCard(e, { mine = false } = {}) {
  const query = empireQuery(e)
  const name = cleanText(pick(e, ['name', 'empireName', 'title']), 'Empire')
  const facts = empireFacts(e)
  const ruler = cleanText(pick(e, ['rulerName', 'leaderName', 'ruler', 'leader', 'emperor', 'owner']))
  const desc = cleanText(pick(e, ['description', 'bio', 'motto', 'about']))

  return `
    <button type="button" class="guild-card empire-card${mine ? ' is-mine' : ''}" data-empire="${attr(query)}">
      ${crestHtml(name, { img: recordArt(e), size: 'md' })}
      <span class="guild-body">
        <span class="guild-name">${esc(name)}</span>
        <span class="guild-sub">${esc([ruler && `Ruled by ${ruler}`, ...facts].filter(Boolean).join(' · ') || 'Empire')}</span>
        ${desc ? `<span class="guild-desc">${esc(desc)}</span>` : ''}
      </span>
      <span class="guild-go">${iconSvg('chevron', 'inline-icon')}</span>
    </button>`
}

async function openEmpire(query) {
  if (!query) return
  openModal(skeletonCards(2))
  try {
    const out = await api.empire(query)
    const e = pick(out, ['empire']) ?? out
    const name = cleanText(pick(e, ['name', 'empireName', 'title']), 'Empire')
    const territories = listOf(e, ['territories', 'provinces', 'land', 'tiles'])
    const citizens = listOf(e, ['citizens', 'members', 'population', 'people'])

    openModal(`
      <div class="guild-sheet">
        <div class="guild-sheet-head">
          ${crestHtml(name, { img: recordArt(e), size: 'lg' })}
          <div class="guild-sheet-id">
            <h3>${esc(name)}</h3>
            <p>${esc(empireFacts(e).join(' · ') || 'Empire')}</p>
          </div>
        </div>
        <div class="pd-body">
          ${cleanText(pick(e, ['description', 'bio', 'motto', 'about'])) ? `<p class="subtext">${esc(cleanText(pick(e, ['description', 'bio', 'motto', 'about'])))}</p>` : ''}
          ${statChips(pick(e, ['stats', 'perks', 'bonuses']))}
          ${territories.length ? `
            <div class="pd-sec-title">Territories</div>
            <div class="chips-wrap">${territories.slice(0, 24).map(t => `
              <span class="chip-sm">${esc(cleanText(typeof t === 'string' ? t : pick(t, ['name', 'title', 'region']), 'Territory'))}</span>`).join('')}</div>` : ''}
          ${citizens.length ? `
            <div class="pd-sec-title">Citizens</div>
            <div class="lb-list">${citizens.slice(0, 12).map((m, i) => `
              <div class="lb-row is-static">
                <span class="lb-rank">${i + 1}</span>
                <span class="lb-name">${esc(cleanText(typeof m === 'string' ? m : pick(m, ['name', 'player', 'playerName']), 'Citizen'))}
                  <span class="sub">${esc(cleanText(pick(m, ['role', 'rank', 'title']), ''))}</span></span>
                <span class="lb-score">${toNum(pick(m, ['power', 'score', 'level']), null) != null ? num(toNum(pick(m, ['power', 'score', 'level']), 0)) : ''}</span>
              </div>`).join('')}</div>` : ''}
        </div>
      </div>`)
  } catch (err) {
    openModal(emptyState('warning', 'Empire unavailable', err?.message ?? ''))
  }
}

/* ──────────────────────────────── wallet ──────────────────────────────── */

let walletRaw = null

/**
 * The four balances, read from whichever envelope the bot used.
 *
 * `/wallet` came back in a shape the first pass didn't understand, so the bank
 * printed `NaN` and carried printed `0` even with money in the account. Two
 * fixes: numbers go through toNum() (which understands objects and formatted
 * strings), and the wallet falls back to `/me`, whose shape is known-good
 * because the profile page already renders it correctly.
 */
function walletView(walletPayload, mePlayer) {
  const w = pick(walletPayload, ['wallet']) ?? walletPayload ?? {}
  const me = mePlayer?.wallet ?? {}

  const value = (keys, meValue) => {
    const direct = toNum(pick(w, keys), null)
    if (direct != null) return direct
    return toNum(meValue, 0)
  }

  return {
    carried: value(['solars', 'carried', 'balance', 'cash', 'available', 'coins', 'money'], me.solars),
    bank: toNum(pick(w, ['bank', 'banked', 'bankBalance', 'bank_balance', 'inBank']), 0),
    vault: value(['vault', 'vaulted', 'vaultBalance', 'inVault'], me.vault),
    gems: value(['gems', 'gem', 'gemBalance', 'crystals'], me.gems),
    loan: toNum(pick(w, ['loan', 'loanDue', 'debt', 'owed', 'outstanding']), 0),
    loanDueAt: pick(w, ['loanDueAt', 'dueAt', 'loanEndsAt']) ?? null,
  }
}

export async function loadWallet() {
  const root = $('#walletRoot')
  if (!root) return
  root.innerHTML = skeletonCards(2)

  const [wallet, ledger, me] = await Promise.all([
    api.wallet().catch(err => ({ __error: err })),
    api.walletLedger().catch(() => null),
    api.me().catch(() => null),
  ])

  if (wallet?.__error && !me) {
    root.innerHTML = emptyState('warning', 'Wallet unavailable', wallet.__error.message ?? '')
    return
  }

  const player = me?.player ?? null
  const w = walletView(wallet?.__error ? null : wallet, player)
  walletRaw = w
  const ledgerRows = listOf(ledger, ['rows', 'entries', 'transactions', 'ledger', 'activity'])

  root.innerHTML = `
    <div class="wallet-grid">
      ${[
        ['Carried', w.carried, 'solars', 'spark'],
        ['Bank', w.bank, 'solars', 'rank'],
        ['Vault', w.vault, 'solars', 'lock'],
        ['Gems', w.gems, 'gems', 'gift'],
      ].map(([label, value, unit, icon]) => `
        <div class="wallet-card">
          <span class="wallet-ico">${iconSvg(icon, 'inline-icon')}</span>
          <span class="wallet-k">${label}</span>
          <strong class="wallet-v">${num(value)}</strong>
          <span class="wallet-u">${unit}</span>
        </div>`).join('')}
    </div>

    ${w.loan > 0 ? `
      <div class="card wallet-loan">
        <div>
          <strong>Loan outstanding</strong>
          <p class="subtext">${num(w.loan)} solars${w.loanDueAt ? ` · due ${new Date(w.loanDueAt).toLocaleDateString()}` : ''}</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="walletRepay">Repay</button>
      </div>` : ''}

    <section class="mob-sec">
      <div class="sec-head"><h2>Move money</h2></div>
      <div class="card wallet-form">
        <label for="walletAmount">Amount</label>
        <input id="walletAmount" type="number" inputmode="numeric" min="1" step="1" placeholder="e.g. 500">
        <p class="field-err" id="walletErr"></p>
        <div class="wallet-btns">
          <button type="button" class="btn btn-primary btn-sm" data-wallet="bank-in">Bank</button>
          <button type="button" class="btn btn-secondary btn-sm" data-wallet="bank-out">Withdraw</button>
          <button type="button" class="btn btn-secondary btn-sm" data-wallet="vault-in">Vault</button>
          <button type="button" class="btn btn-ghost btn-sm" data-wallet="loan">Take loan</button>
        </div>
        <p class="mgr-note">The bank keeps solars safe from PvP; the vault hides them from everyone.</p>
      </div>
    </section>

    <section class="mob-sec">
      <div class="sec-head"><h2>Recent activity</h2></div>
      ${ledgerRows.length ? `<div class="ledger">${ledgerRows.slice(0, 20).map(r => {
        const amount = toNum(pick(r, ['amount', 'delta', 'change', 'value']), 0)
        const label = cleanText(pick(r, ['label', 'reason', 'type', 'description', 'note']), 'Transaction')
        const at = pick(r, ['at', 'date', 'createdAt', 'timestamp', 'time'])
        const when = at ? new Date(at) : null
        return `
        <div class="ledger-row">
          <span class="ledger-what">${esc(label)}
            <span class="subtext">${when && !isNaN(when) ? esc(when.toLocaleDateString()) : ''}</span></span>
          <span class="ledger-amt${amount < 0 ? ' is-out' : ''}">${amount > 0 ? '+' : ''}${num(amount)}</span>
        </div>`}).join('')}</div>`
        : emptyState('inventory', 'No activity yet', 'Deposits, rewards and purchases show up here.')}
    </section>`

  wireWallet()
}

function wireWallet() {
  const walletAction = async (kind) => {
    const input = $('#walletAmount')
    const err = $('#walletErr')
    const amount = Number(input?.value)
    if (!Number.isInteger(amount) || amount <= 0) {
      if (err) err.textContent = 'Enter a whole amount above zero.'
      return
    }
    if (err) err.textContent = ''
    try {
      // Direction is carried by the sign: a negative amount moves money back
      // out of the bank/vault into the wallet.
      if (kind === 'bank-in') await api.bankMove(amount)
      else if (kind === 'bank-out') await api.bankMove(-amount)
      else if (kind === 'vault-in') await api.vaultMove(amount)
      else if (kind === 'loan') await api.takeLoan(amount)
      toast('Wallet updated', 'ok')
      await loadWallet()
    } catch (e) {
      if (err) err.textContent = e?.message ?? 'That didn’t work.'
      else toast(e?.message ?? 'That didn’t work', 'err')
    }
  }

  for (const btn of $$('[data-wallet]')) btn.onclick = () => walletAction(btn.dataset.wallet)

  const repay = $('#walletRepay')
  if (repay) repay.onclick = async () => {
    try { await api.repayLoan(walletRaw?.loan ?? 0); toast('Loan repaid', 'ok'); await loadWallet() }
    catch (e) { toast(e?.message ?? 'Could not repay', 'err') }
  }
}

/* ──────────────────────────────── storage ─────────────────────────────── */

/** "Do I own the ender chest?" - the buy button used to ignore every spelling
 *  except one, so a purchased chest still read as locked. */
function enderOwned(s) {
  const direct = pick(s, ['enderChest', 'enderChestOwned', 'enderOwned', 'enderUnlocked',
    'ender', 'enderChests', 'enderChestSlots', 'enderSlots'])
  if (direct !== undefined) return isOwned(direct)
  const chests = pick(s, ['chests'])
  if (chests && typeof chests === 'object') {
    const e = chests.ender ?? chests.enderChest
    if (e !== undefined) return isOwned(e)
  }
  return false
}

export async function loadStoragePage() {
  const root = $('#storageRoot')
  if (!root) return
  root.innerHTML = skeletonCards(2)

  const out = await api.storage().catch(err => ({ __error: err }))
  if (out?.__error) {
    root.innerHTML = emptyState('warning', 'Storage unavailable', out.__error.message ?? '')
    return
  }

  const s = pick(out, ['storage']) ?? out
  const items = listOf(pick(s, ['items']) ?? s, ['items', 'chest', 'stacks'])
  const used = counted(pick(s, ['used', 'slotsUsed', 'count']), items.length)
  const capacity = counted(pick(s, ['capacity', 'slots', 'size', 'max', 'maxSlots']), 0)
  const ender = enderOwned(s)
  const pct = capacity ? Math.min(100, Math.round((used / capacity) * 100)) : 0

  root.innerHTML = `
    <div class="storage-cards">
      <div class="storage-card">
        <span class="wallet-ico">${iconSvg('inventory', 'inline-icon')}</span>
        <div>
          <strong>Chest</strong>
          <p class="subtext">${num(used)} / ${capacity ? num(capacity) : '—'} slots</p>
          ${capacity ? `<div class="mgr-cap-track"><i style="width:${pct}%"></i></div>` : ''}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="buyChest">Buy slot</button>
      </div>
      <div class="storage-card${ender ? ' is-owned' : ''}">
        <span class="wallet-ico">${iconSvg('gift', 'inline-icon')}</span>
        <div>
          <strong>Ender chest ${ender ? '<span class="chip-sm">Owned</span>' : ''}</strong>
          <p class="subtext">${ender ? 'Unlocked on this account.' : 'Extra storage that follows you between runs.'}</p>
        </div>
        <button type="button" class="btn ${ender ? 'btn-ghost' : 'btn-secondary'} btn-sm" id="buyEnder" ${ender ? 'disabled' : ''}>
          ${ender ? 'Unlocked' : 'Unlock'}
        </button>
      </div>
    </div>

    <section class="mob-sec">
      <div class="sec-head"><h2>Stored items</h2><span class="subtext">${num(items.length)} stacks</span></div>
      ${items.length
        ? `<div class="mgr-grid">${items.map(i => itemCard(i, { attrs: `data-store="${attr(String(stackId(i)))}"` })).join('')}</div>`
        : emptyState('inventory', 'Nothing in storage', 'Move stacks here from the inventory manager to free up space.')}
    </section>`

  for (const tile of $$('[data-store]', root)) {
    tile.onclick = async () => {
      try {
        await api.storageMove({ itemInstanceId: tile.dataset.store, qty: 1, to: 'inventory' })
        toast('Moved to your bag', 'ok')
        await loadStoragePage()
      } catch (e) { toast(e?.message ?? 'Could not move that item', 'err') }
    }
  }
  const chest = $('#buyChest')
  if (chest) chest.onclick = async () => {
    chest.disabled = true
    try { await api.buyStorageChest(); toast('Chest expanded', 'ok'); await loadStoragePage() }
    catch (e) { chest.disabled = false; toast(e?.message ?? 'Could not buy that', 'err') }
  }
  const enderBtn = $('#buyEnder')
  if (enderBtn && !ender) enderBtn.onclick = async () => {
    enderBtn.disabled = true
    try { await api.buyEnderChest(); toast('Ender chest unlocked', 'ok'); await loadStoragePage() }
    catch (e) { enderBtn.disabled = false; toast(e?.message ?? 'Could not buy that', 'err') }
  }
}

/* ──────────────────────────────── progress ────────────────────────────── */

/**
 * The six tracks everything in Progress belongs to.
 *
 * Each one carries its own painting, which is used as the card's background -
 * the Progress page was a pair of flat lists, and these are the "cards" that
 * give it a face. `words` is how a quest or achievement is recognised as
 * belonging to a track when the bot doesn't label it: the explicit field wins
 * (category / track / type / kind / branch), and the keywords are the fallback
 * for payloads that only carry a name and a description.
 */
const PROGRESS_TRACKS = [
  {
    id: 'mastery', label: 'Mastery', art: 'https://i.ibb.co/C5fHDBNK/mastery.jpg',
    blurb: 'Levels, skills and the long climb',
    words: ['master', 'level', 'skill', 'xp', 'train', 'practice', 'rank up'],
  },
  {
    id: 'social', label: 'Social', art: 'https://i.ibb.co/V02x1Tsp/social.jpg',
    blurb: 'Friends, guilds and parties',
    words: ['friend', 'guild', 'party', 'social', 'invite', 'gift a', 'trade with', 'chat', 'clan'],
  },
  {
    id: 'adventure', label: 'Adventure', art: 'https://i.ibb.co/Fq4vDVVx/advebture.jpg',
    blurb: 'Dungeons, floors and runs',
    words: ['adventure', 'dungeon', 'floor', 'explore', 'run', 'expedition', 'map', 'raid'],
  },
  {
    id: 'wealth', label: 'Wealth', art: 'https://i.ibb.co/dsSgXx7T/welath.jpg',
    blurb: 'Solars, trade and the vault',
    words: ['wealth', 'solar', 'gold', 'coin', 'bank', 'vault', 'trade', 'sell', 'buy', 'market', 'loan'],
  },
  {
    id: 'collection', label: 'Collection', art: 'https://i.ibb.co/8LmgPsFx/collection.jpg',
    blurb: 'Cards, characters and loot',
    words: ['collect', 'card', 'character', 'roster', 'loot', 'item', 'dex', 'pokemon', 'summon'],
  },
  {
    id: 'combat', label: 'Combat', art: 'https://i.ibb.co/7mqHrQW/combat.jpg',
    blurb: 'Duels, arenas and wins',
    words: ['combat', 'battle', 'duel', 'arena', 'pvp', 'fight', 'win', 'kill', 'boss', 'damage'],
  },
]

/** Which of the module's own words a record belongs to, or '' when unknown. */
function trackOf(record) {
  const explicit = cleanText(pick(record, ['track', 'category', 'type', 'kind', 'branch', 'group', 'section']), '').toLowerCase()
  if (explicit) {
    const hit = PROGRESS_TRACKS.find(t => explicit.includes(t.id) || t.label.toLowerCase() === explicit)
    if (hit) return hit.id
  }
  const haystack = [
    cleanText(pick(record, ['name', 'title', 'quest']), ''),
    cleanText(pick(record, ['description', 'objective', 'text']), ''),
  ].join(' ').toLowerCase()
  if (!haystack.trim()) return ''
  let best = ''
  let bestScore = 0
  for (const t of PROGRESS_TRACKS) {
    const score = t.words.reduce((n, w) => (haystack.includes(w) ? n + 1 : n), 0)
    if (score > bestScore) { bestScore = score; best = t.id }
  }
  return best
}

/** Selected track on the Progress page ('' = everything). */
let progressTrack = ''
let progressCache = { quests: [], achievements: [] }

/** One art card per track: the painting, a scrim, the name and what's inside. */
function trackCard(track) {
  const quests = progressCache.quests.filter(x => trackOf(x) === track.id)
  const achs = progressCache.achievements.filter(x => trackOf(x) === track.id)
  const ready = quests.filter(x => isOwned(pick(x, ['claimable', 'canClaim']))).length
    + achs.filter(x => isOwned(pick(x, ['claimable', 'canClaim']))).length
  const total = quests.length + achs.length
  const on = progressTrack === track.id
  const done = achs.filter(x => isOwned(pick(x, ['claimed', 'unlocked', 'isClaimed']))).length

  return `
    <button type="button" class="track-card${on ? ' is-on' : ''}${track.art ? '' : ' no-art'}"
            data-track="${attr(track.id)}" aria-pressed="${on}"
            ${track.art ? `style="--art:url('${attr(track.art)}')"` : ''}>
      <span class="track-art" aria-hidden="true"></span>
      <span class="track-scrim" aria-hidden="true"></span>
      <span class="track-body">
        <span class="track-kicker">${total ? `${num(total)} ${plural(total, 'goal')}` : 'No goals yet'}</span>
        <strong class="track-name">${esc(track.label)}</strong>
        <span class="track-blurb">${esc(track.blurb)}</span>
      </span>
      ${ready ? `<span class="track-badge">${num(ready)} ready</span>`
        : done ? `<span class="track-badge is-done">${num(done)} done</span>` : ''}
    </button>`
}

export async function loadProgress() {
  const root = $('#progressRoot')
  if (!root) return
  root.innerHTML = skeletonCards(2)

  const [quests, achievements, progress, me] = await Promise.all([
    api.quests().catch(err => ({ __error: err })),
    api.achievements().catch(() => null),
    api.progress().catch(() => null),
    api.me().catch(() => null),
  ])

  if (quests?.__error && !me) {
    root.innerHTML = emptyState('warning', 'Progress unavailable', quests.__error.message ?? '')
    return
  }

  const q = listOf(quests, ['quests', 'items', 'rows'])
  const a = listOf(achievements, ['achievements', 'items', 'rows'])
  const p = pick(progress, ['progress']) ?? progress ?? {}
  const player = me?.player ?? null

  progressCache = { quests: q, achievements: a }
  // A track that no longer exists (data changed under us) shouldn't leave the
  // page filtered to nothing.
  if (progressTrack && !PROGRESS_TRACKS.some(t => t.id === progressTrack)) progressTrack = ''

  const onTrack = (record) => !progressTrack || trackOf(record) === progressTrack
  const qShown = q.filter(onTrack)
  const aShown = a.filter(onTrack)
  const activeTrack = PROGRESS_TRACKS.find(t => t.id === progressTrack) ?? null

  // Only show what actually resolved. `rank` came back null and was printed as
  // the word "null"; now it falls back to the rank on /me, then disappears.
  const rankTitle = cleanText(pick(p, ['rankTitle', 'rank', 'title']) ?? player?.rank?.title, '')
  const statRows = [
    ['Level', toNum(pick(p, ['level']), player?.level)],
    ['Rank', rankTitle || null],
    ['Quests done', toNum(pick(p, ['questsDone', 'questsCompleted', 'completedQuests']), null)],
    ['Achievements', toNum(pick(p, ['achievementsUnlocked', 'achievements']), null)],
    ['Fame', toNum(pick(p, ['fame', 'reputation']), null)],
    ['Streak', toNum(pick(p, ['streak', 'winStreak']), null)],
  ].filter(([, v]) => v != null && v !== '')

  const questRow = (item) => {
    const name = cleanText(pick(item, ['name', 'title', 'quest']), 'Quest')
    const desc = cleanText(pick(item, ['description', 'objective', 'text']))
    const goal = toNum(pick(item, ['goal', 'target', 'required', 'amount']), null)
    const done = toNum(pick(item, ['progress', 'current', 'completed', 'count']), 0)
    const claimable = isOwned(pick(item, ['claimable', 'canClaim', 'claimReady'])) || pick(item, ['state']) === 'claimable'
    const claimed = isOwned(pick(item, ['claimed', 'isClaimed']))
    const id = pick(item, ['id', 'questId', 'key'])
    return `
      <div class="quest-row">
        <span class="quest-ico">${iconSvg('spark', 'inline-icon')}</span>
        <div class="quest-body">
          <strong>${esc(name)}</strong>
          ${desc ? `<span class="subtext">${esc(desc)}</span>` : ''}
          ${goal != null ? `<div class="quest-bar">${bar('', done, goal || 1)}</div>
            <span class="subtext">${num(done)} / ${num(goal)}</span>` : ''}
        </div>
        ${claimable && id != null
          ? `<button type="button" class="btn btn-primary btn-sm" data-claim-quest="${attr(id)}">Claim</button>`
          : claimed ? `<span class="chip-sm">Claimed</span>` : ''}
      </div>`
  }

  root.innerHTML = `
    ${statRows.length ? `
      <div class="pd-stats" style="margin-bottom:20px">
        ${statRows.map(([k, v]) => `
          <div class="pd-stat"><div class="pd-stat-k">${esc(k)}</div>
          <div class="pd-stat-v">${esc(typeof v === 'number' ? num(v) : String(v))}</div></div>`).join('')}
      </div>` : ''}

    <section class="mob-sec">
      <div class="sec-head">
        <h2>Tracks</h2>
        ${progressTrack
          ? `<button type="button" class="link-btn" id="trackClear">Show all</button>`
          : `<span class="subtext">${num(PROGRESS_TRACKS.length)} tracks</span>`}
      </div>
      <div class="track-grid">
        ${PROGRESS_TRACKS.map(trackCard).join('')}
      </div>
    </section>

    <section class="mob-sec">
      <div class="sec-head">
        <h2>Quests${activeTrack ? ` · ${esc(activeTrack.label)}` : ''}</h2>
        <span class="subtext">${num(qShown.filter(x => isOwned(pick(x, ['claimable', 'canClaim']))).length)} ready</span>
      </div>
      ${qShown.length ? `<div class="quest-list">${qShown.map(questRow).join('')}</div>`
        : emptyState('season', progressTrack ? `Nothing in ${esc(activeTrack?.label ?? 'this track')} yet` : 'No quests right now',
          progressTrack ? 'Other tracks may have goals waiting.' : 'New ones appear when the bot rotates them in.')}
    </section>

    <section class="mob-sec">
      <div class="sec-head"><h2>Achievements${activeTrack ? ` · ${esc(activeTrack.label)}` : ''}</h2></div>
      ${aShown.length ? `<div class="ach-grid">${aShown.map(x => {
        const id = pick(x, ['id', 'achievementId', 'key'])
        const claimable = isOwned(pick(x, ['claimable', 'canClaim']))
        const claimed = isOwned(pick(x, ['claimed', 'unlocked', 'isClaimed']))
        return `
        <div class="ach-card${claimed ? ' is-done' : ''}">
          <span class="ach-ico">${iconSvg('reward', 'inline-icon')}</span>
          <strong>${esc(cleanText(pick(x, ['name', 'title']), 'Achievement'))}</strong>
          <p class="subtext">${esc(cleanText(pick(x, ['description', 'text'])))}</p>
          ${claimable && id != null
            ? `<button type="button" class="btn btn-secondary btn-sm" data-claim-ach="${attr(id)}">Claim</button>`
            : `<span class="chip-sm">${claimed ? 'Unlocked' : 'Locked'}</span>`}
        </div>`}).join('')}</div>`
        : emptyState('reward', 'No achievements yet', 'They unlock as you play.')}
    </section>`

  for (const tile of $$('[data-track]', root)) {
    tile.onclick = () => {
      // Tapping the selected track again clears it - one control, no hunting
      // for a separate "all" button.
      progressTrack = progressTrack === tile.dataset.track ? '' : tile.dataset.track
      loadProgress()
    }
  }
  const clear = $('#trackClear', root)
  if (clear) clear.onclick = () => { progressTrack = ''; loadProgress() }

  for (const btn of $$('[data-claim-quest]', root)) {
    btn.onclick = async () => {
      btn.disabled = true
      try { await api.claimQuest(btn.dataset.claimQuest); toast('Quest reward claimed', 'ok'); await loadProgress() }
      catch (e) { btn.disabled = false; toast(e?.message ?? 'Could not claim', 'err') }
    }
  }
  for (const btn of $$('[data-claim-ach]', root)) {
    btn.onclick = async () => {
      btn.disabled = true
      try { await api.claimAchievement(btn.dataset.claimAch); toast('Achievement claimed', 'ok'); await loadProgress() }
      catch (e) { btn.disabled = false; toast(e?.message ?? 'Could not claim', 'err') }
    }
  }
}

/* ──────────────────────────────── pokémon ─────────────────────────────── */

let monTab = 'mons'
let monData = { mons: [], party: [], dex: [], bag: [], shop: [], overview: null }

/** PokeAPI's own artwork, used when the bot sends an id/name but no picture. */
const pokeApiArt = (id) => {
  const n = toNum(id, null)
  return n != null && n > 0
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`
    : ''
}

/**
 * A mon's picture, in the order that will actually resolve:
 * whatever the bot sent -> PokeAPI sprite block -> official artwork by id.
 * "Images not showing" was the bot sending a name and the page only ever
 * reading `image`.
 */
function monArt(m) {
  const direct = imgOf(m)
  return direct || pokeApiArt(pick(m, ['id', 'pokemonId', 'dexId', 'dexNumber']))
}

const monName = (m) => cleanText(pick(m, ['nickname', 'name', 'species', 'pokemon']), 'Pokémon')

function monTypes(m) {
  const t = pick(m, ['types', 'type', 'typeNames'])
  const arr = Array.isArray(t) ? t : (t ? [t] : [])
  return arr
    .map(x => cleanText(typeof x === 'string' ? x : pick(x, ['name', 'type', 'label']), ''))
    .filter(Boolean)
    .map(titleCase)
    .join(' · ')
}

export async function loadPokemon(tab = monTab) {
  const root = $('#pokemonRoot')
  if (!root) return
  monTab = tab
  root.innerHTML = skeletonCards(2)

  // One failing endpoint shouldn't blank the page: the tabs are independent,
  // so each is caught on its own and simply renders empty.
  const [overview, mons, party, dex, bag, shop] = await Promise.all([
    api.pokemonOverview().catch(() => null),
    api.pokemonMons().catch(err => ({ __error: err })),
    api.pokemonParty().catch(() => null),
    api.pokemonDex().catch(() => null),
    api.pokemonBag().catch(() => null),
    api.pokemonShop().catch(() => null),
  ])

  if (mons?.__error) {
    root.innerHTML = emptyState('warning', 'Pokémon aren’t live yet', mons.__error.message ?? 'The bot hasn’t opened this route.')
    return
  }

  monData = {
    overview: pick(overview, ['overview']) ?? overview ?? null,
    mons: listOf(mons, ['mons', 'pokemon', 'items', 'caught']),
    party: listOf(party, ['party', 'members', 'mons']),
    dex: listOf(dex, ['dex', 'entries', 'species', 'pokemon']),
    bag: listOf(bag, ['bag', 'items']),
    shop: listOf(shop, ['items', 'shop', 'stock']),
  }

  const o = monData.overview ?? {}
  const dexSeen = toNum(pick(o, ['dexSeen', 'seen', 'seenCount']), monData.dex.length)
  const tabs = [['mons', 'Mons'], ['party', 'Party'], ['dex', 'Dex'], ['bag', 'Bag'], ['shop', 'Shop']]

  root.innerHTML = `
    <div class="mon-summary">
      <div><strong>${num(monData.mons.length)}</strong><span>caught</span></div>
      <div><strong>${num(monData.party.length)}</strong><span>in party</span></div>
      <div><strong>${num(dexSeen)}</strong><span>seen</span></div>
    </div>
    <div class="mon-actions">
      <button type="button" class="btn btn-primary btn-sm" id="monHunt">${iconSvg('spark', 'inline-icon')} Hunt</button>
      <button type="button" class="btn btn-secondary btn-sm" id="monHeal">${iconSvg('gift', 'inline-icon')} Heal party</button>
    </div>

    <div class="filter-pills" role="tablist" aria-label="Pokémon sections">
      ${tabs.map(([id, label]) => `<button type="button" class="filter-pill${monTab === id ? ' is-on' : ''}"
        data-mon-tab="${id}" role="tab" aria-selected="${monTab === id}">${label}</button>`).join('')}
    </div>

    <div id="monPanel">${monPanel()}</div>`

  for (const pill of $$('[data-mon-tab]', root)) {
    pill.onclick = () => {
      monTab = pill.dataset.monTab
      for (const p of $$('[data-mon-tab]', root)) { const on = p === pill; p.classList.toggle('is-on', on); p.setAttribute('aria-selected', String(on)) }
      $('#monPanel').innerHTML = monPanel()
      wireMonPanel()
    }
  }
  $('#monHunt').onclick = async (e) => {
    e.currentTarget.disabled = true
    try {
      const out = await api.pokemonHunt()
      const caught = pick(out, ['caught', 'mon', 'pokemon'])
      toast(caught ? `Caught ${monName(caught)}` : 'Hunt complete', 'ok')
      await loadPokemon()
    } catch (err) { e.currentTarget.disabled = false; toast(err?.message ?? 'Hunt failed', 'err') }
  }
  $('#monHeal').onclick = async (e) => {
    e.currentTarget.disabled = true
    try { await api.pokemonHeal(); toast('Party healed', 'ok'); await loadPokemon() }
    catch (err) { e.currentTarget.disabled = false; toast(err?.message ?? 'Could not heal', 'err') }
  }
  wireMonPanel()
}

function monPanel() {
  if (monTab === 'party') {
    return monData.party.length
      ? `<div class="mon-grid">${monData.party.map(m => monCard(m, { party: true })).join('')}</div>`
      : emptyState('rank', 'Party is empty', 'Set a main mon from your collection to fill it.')
  }
  if (monTab === 'dex') {
    return monData.dex.length
      ? `<div class="mon-grid">${monData.dex.slice(0, 120).map(d => {
        const art = monArt(d)
        const seen = isOwned(pick(d, ['caught', 'owned'])) || pick(d, ['seen']) !== undefined
        return `
          <div class="mon-card is-dex${seen ? '' : ' is-unseen'}">
            <span class="mon-art">${art
              ? `<img src="${attr(art)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
              : `<span class="item-art-ph">${iconSvg('spark', 'inventory-icon')}</span>`}</span>
            <span class="mon-name">${esc(monName(d))}</span>
            <span class="mon-sub">${isOwned(pick(d, ['caught', 'owned'])) ? 'Caught' : 'Seen'}</span>
          </div>`}).join('')}</div>`
      : emptyState('inventory', 'Dex is empty', 'Every mon you meet gets logged here.')
  }
  if (monTab === 'bag') {
    return monData.bag.length
      ? `<div class="mgr-grid">${monData.bag.map(i => itemCard(i)).join('')}</div>`
      : emptyState('inventory', 'Bag is empty', 'Poké Balls and berries appear here once you own some.')
  }
  if (monTab === 'shop') {
    return monData.shop.length
      ? `<div class="mon-grid">${monData.shop.map(i => `
          <div class="mon-card">
            <span class="mon-art">${itemArt(imgOf(i))}</span>
            <span class="mon-name">${esc(cleanText(pick(i, ['name', 'title']), 'Item'))}</span>
            <span class="mon-sub">${toNum(pick(i, ['price', 'cost']), null) != null
              ? `${num(toNum(pick(i, ['price', 'cost']), 0))} solars` : esc(itemMeta(i))}</span>
            <button type="button" class="btn btn-secondary btn-sm btn-block" data-mon-buy="${attr(pick(i, ['id', 'itemId', 'key']))}">Buy</button>
          </div>`).join('')}</div>`
      : emptyState('inventory', 'Shop is empty', 'Stock rotates with the bot.')
  }
  return monData.mons.length
    ? `<div class="mon-grid">${monData.mons.map(m => monCard(m)).join('')}</div>`
    : emptyState('spark', 'No Pokémon yet', 'Use Hunt to find your first one.')
}

function monCard(m, { party = false } = {}) {
  const art = monArt(m)
  const level = toNum(pick(m, ['level', 'lvl']), null)
  const held = pick(m, ['heldItem', 'item', 'holding'])
  const heldName = held ? cleanText(typeof held === 'string' ? held : pick(held, ['name', 'title']), '') : ''
  const id = pick(m, ['id', 'monId', 'pokemonId', 'uid', 'key'])

  return `
    <button type="button" class="mon-card" data-mon="${attr(String(id ?? ''))}">
      <span class="mon-art">
        ${art ? `<img src="${attr(art)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
          : `<span class="item-art-ph">${iconSvg('spark', 'inventory-icon')}</span>`}
        ${level != null ? `<span class="mon-lv">Lv ${num(level)}</span>` : ''}
      </span>
      <span class="mon-name">${esc(monName(m))}</span>
      <span class="mon-sub">${esc(monTypes(m) || (party ? 'In party' : ''))}</span>
      ${heldName ? `<span class="mon-held">Holding ${esc(heldName)}</span>` : ''}
    </button>`
}

function wireMonPanel() {
  for (const card of $$('[data-mon]', $('#monPanel'))) {
    if (!card.dataset.mon) continue
    card.onclick = () => openMon(card.dataset.mon)
  }
  for (const btn of $$('[data-mon-buy]', $('#monPanel'))) {
    btn.onclick = async (e) => {
      e.stopPropagation()
      btn.disabled = true
      try { await api.pokemonBuy(btn.dataset.monBuy, 1); toast('Purchased', 'ok'); await loadPokemon() }
      catch (err) { btn.disabled = false; toast(err?.message ?? 'Could not buy', 'err') }
    }
  }
}

async function openMon(id) {
  openModal(skeletonCards(1))
  const out = await api.pokemonMon(id).catch(err => ({ __error: err }))
  if (out?.__error) { openModal(emptyState('warning', 'Pokémon unavailable', out.__error.message ?? '')); return }
  const m = pick(out, ['mon', 'pokemon']) ?? out
  const art = monArt(m)
  const stats = pick(m, ['stats', 'baseStats'])
  const level = toNum(pick(m, ['level', 'lvl']), null)
  const hp = toNum(pick(m, ['hp', 'currentHp']), null)
  const maxHp = toNum(pick(m, ['maxHp', 'hpMax']), null)

  openModal(`
    <div class="item-sheet">
      <div class="item-sheet-art">
        ${art ? `<img class="item-sheet-img" src="${attr(art)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`
          : `<span class="item-art-ph">${iconSvg('spark', 'inventory-icon')}</span>`}
      </div>
      <div class="item-sheet-head">
        <h3>${esc(monName(m))}</h3>
        <p class="item-sheet-sub">${esc([monTypes(m), level != null && `Lv ${num(level)}`].filter(Boolean).join(' · '))}</p>
      </div>
    </div>
    <div class="pd-body">
      ${hp != null && maxHp ? bar('HP', hp, maxHp || 1) : ''}
      ${stats && typeof stats === 'object' && Object.keys(stats).length ? `<div class="pd-sec-title">Stats</div><div class="pd-stats">${statBonusTiles(stats)}</div>` : ''}
      <div class="mgr-actions">
        <button type="button" class="btn btn-primary btn-sm" data-mon-act="main">Set as main</button>
        <button type="button" class="btn btn-secondary btn-sm" data-mon-act="${pick(m, ['heldItem', 'item', 'holding']) ? 'unhold' : 'hold'}">${pick(m, ['heldItem', 'item', 'holding']) ? 'Remove held item' : 'Hold item'}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-mon-act="feed">Feed</button>
        <button type="button" class="btn btn-secondary btn-sm" data-mon-act="evolve">Evolve</button>
        <button type="button" class="btn btn-ghost btn-sm" data-mon-act="protect">Protect</button>
        <button type="button" class="btn btn-ghost btn-sm" data-mon-act="rename">Rename</button>
      </div>
      ${cleanText(pick(m, ['notes', 'description', 'flavor', 'flavorText'])) ? `<p class="subtext" style="margin-top:12px">${esc(cleanText(pick(m, ['notes', 'description', 'flavor', 'flavorText'])))}</p>` : ''}
    </div>`)

  for (const btn of $$('[data-mon-act]')) {
    btn.onclick = async () => {
      const act = btn.dataset.monAct
      btn.disabled = true
      try {
        if (act === 'main') await api.pokemonMain(id)
        else if (act === 'hold') await api.pokemonHold(id, true)
        else if (act === 'unhold') await api.pokemonHold(id, false)
        else if (act === 'feed') await api.pokemonFeed(id)
        else if (act === 'evolve') await api.pokemonEvolve(id)
        else if (act === 'protect') await api.pokemonProtect(id)
        else if (act === 'rename') {
          const name = window.prompt('New nickname (2-12 characters)')
          if (!name) { btn.disabled = false; return }
          await api.pokemonRename(id, name.trim())
        }
        toast('Updated', 'ok')
        closeModal()
        await loadPokemon()
      } catch (err) {
        btn.disabled = false
        toast(err?.message ?? 'That didn’t work', 'err')
      }
    }
  }
}

/* Keep the carousel honest when the viewport flips between phone and desktop. */
MOBILE_MQ.addEventListener?.('change', () => {
  if (!isMobileView()) clearInterval(evTimer)
})
