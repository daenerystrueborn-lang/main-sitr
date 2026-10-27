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
import { api, hasSession, newIdempotencyKey, pokemonImageUrl } from './api.js'
import {
  $, $$, esc, attr, num, titleCase, iconSvg,
  toast, emptyState, openModal, closeModal, skeletonCards, bar,
} from './ui.js'
import { itemCard, itemArt, itemMeta, itemPopupHtml, itemQty, resolveArt } from './items.js'
import {
  pick, toNum, counted, listOf, imgOf, cleanText, isOwned, plural,
} from './shape.js'
import { monSprite, itemIcon, typeIcon, moveInfo, warmMoveData, typeColor } from './showdown.js'

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
    // No reward numbers here on purpose: the bot decides what the drop is, and
    // syncHalloweenSlide() replaces these chips with the ones it reports.
    desc: 'One claim per account, granted by the bot. Tap to collect the drop.',
    image: 'https://i.ibb.co/ymySXjzR/D4DJ.jpg',
    rewards: [
      { label: 'Server-granted reward', icon: 'gift' },
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
 * Brings the slider's Halloween slide in line with `/api/events`.
 *
 * The slide is a poster with a claim button on it, so its label has to be the
 * bot's state: live, already claimed, or not open yet. If the event feed isn't
 * deployed the slide is left exactly as written rather than being disabled by a
 * failed request.
 */
async function syncHalloweenSlide() {
  const btn = $('#evClaimBtn')
  if (!btn) return
  const out = await api.events().catch(() => null)
  const ev = eventById(out, 'halloween')
  if (!ev) return

  const active = isOwned(pick(ev, ['active', 'isActive', 'live', 'enabled']))
  const claimed = isOwned(pick(ev, ['claimed', 'isClaimed', 'hasClaimed']))
  paneLabel(btn, claimed, active)

  const slide = btn.closest('.ev-slide')
  const chips = rewardChips(ev)
  if (slide && chips) {
    const host = slide.querySelector('.ev-rewards')
    if (host) host.outerHTML = chips
    else slide.querySelector('.ev-body')?.insertAdjacentHTML('beforeend', chips)
  }
}

/** The three honest button states. */
function paneLabel(btn, claimed, active) {
  if (!btn) return
  btn.disabled = claimed || !active
  btn.textContent = claimed ? 'Claimed' : active ? 'Claim gift' : 'Not live yet'
}

/**
 * Claims the gift.
 *
 * The server is the only thing that can grant it, so this never fakes a
 * balance change: it posts, then reports the server's own numbers. One key per
 * attempt, reused on a retry, so a double tap can't be paid twice. A 503
 * (CLAIM_SAVE_PENDING / CLAIM_COMMIT_FAILED) means *unconfirmed*: the claim may
 * still land, so the event is re-read and the button stays available.
 */
async function claimEvent(ev) {
  const btn = $('#evClaimBtn')
  if (btn) { btn.disabled = true; btn.textContent = 'Claiming…' }

  const key = newIdempotencyKey()
  try {
    const out = await api.claimEvent(ev.id, key)
    const granted = pick(out, ['granted', 'rewards', 'reward']) ?? out
    const parts = []
    const solars = toNum(pick(granted, ['solars', 'coins']), null)
    const gems = toNum(pick(granted, ['gems', 'gem']), null)
    const monds = toNum(pick(granted, ['monds', 'mond']), null)
    if (solars) parts.push(`${num(solars)} solars`)
    if (gems) parts.push(`${num(gems)} gems`)
    if (monds) parts.push(`${num(monds)} ${plural(monds, 'mond')}`)
    const replay = isOwned(pick(out, ['alreadyClaimed', 'claimed']))
    toast(parts.length ? `Claimed ${parts.join(' + ')}` : replay ? 'Already claimed' : 'Gift claimed', 'ok')

    // Trust the server's wallet over anything calculated here.
    const wallet = pick(out, ['wallet'])
    if (!wallet) await api.wallet().catch(() => null)
    await syncHalloweenSlide()
  } catch (err) {
    const unconfirmed = err?.status === 503
      || ['CLAIM_SAVE_PENDING', 'CLAIM_COMMIT_FAILED'].includes(err?.code)
    const notLive = err?.status === 404 || err?.status === 405
    const already = err?.status === 409 && /claim/i.test(err?.message ?? '')

    toast(
      unconfirmed
        ? 'The claim couldn’t be confirmed yet - tap again, it’s safe.'
        : notLive
          ? 'This giveaway isn’t live yet - it lands with the next bot update.'
          : already
            ? 'You’ve already claimed this one.'
            : (err?.message ?? 'Could not claim right now.'),
      notLive || already ? '' : 'err',
    )
    if (unconfirmed || already) await syncHalloweenSlide()
    else if (btn) { btn.disabled = false; btn.textContent = ev.cta ?? 'Claim gift' }
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
  // State, not decoration: the claim button follows the bot.
  syncHalloweenSlide()
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
  qty: 1,                // amount for the sell/discard stepper
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
  const qty = itemQty(item) || 1
  const slot = item.slot || item.equipmentSlot
  const confirming = mgr.confirm?.id === String(id) ? mgr.confirm.action : null
  // The stepper is clamped to the stack, so "sell 9" on a stack of 3 can't be
  // sent to the bot at all.
  const amount = Math.min(Math.max(1, mgr.qty || 1), qty)
  const price = toNum(item.sellPrice ?? item.salePrice, null)
  const total = price != null ? price * amount : null

  const stepper = qty > 1 ? `
    <div class="item-pop-stepper">
      <span>Amount</span>
      <div class="stepper">
        <button type="button" class="stepper-btn" data-mgr-step="-1" aria-label="One fewer">−</button>
        <input id="mgrQty" type="number" inputmode="numeric" min="1" max="${qty}" value="${amount}" aria-label="Amount">
        <button type="button" class="stepper-btn" data-mgr-step="1" aria-label="One more">+</button>
      </div>
      <span class="subtext">of ${num(qty)}</span>
    </div>` : ''

  const actions = `
    ${slot ? `<button type="button" class="btn btn-primary btn-sm" data-mgr-action="equip" ${mgr.busy ? 'disabled' : ''}>Equip to ${esc(SLOT_LABEL[slot] ?? titleCase(slot))}</button>` : ''}
    <button type="button" class="btn btn-secondary btn-sm" data-mgr-action="use" ${mgr.busy ? 'disabled' : ''}>Use</button>
    <button type="button" class="btn btn-secondary btn-sm" data-mgr-action="store" ${mgr.busy ? 'disabled' : ''}>Store</button>
    ${price != null
      ? `<button type="button" class="btn btn-secondary btn-sm" data-mgr-action="sell" ${mgr.busy ? 'disabled' : ''}>${confirming === 'sell' ? `Confirm ${num(total ?? 0)}` : `Sell ${num(amount)}`}</button>`
      : ''}
    <button type="button" class="btn btn-ghost btn-sm" data-mgr-action="discard" ${mgr.busy ? 'disabled' : ''}>${confirming === 'discard' ? 'Tap again to discard' : 'Discard'}</button>`

  return `
    <button type="button" class="mgr-back" id="mgrBack">‹ Back to items</button>
    ${itemPopupHtml(item, { qty, actions, note: stepper })}`
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
    tile.onclick = () => {
      mgr.sheetId = tile.dataset.mgrItem
      mgr.view = 'sheet'
      mgr.confirm = null
      mgr.qty = 1
      renderMgr()
    }
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
    btn.onclick = () => {
      // Read the stepper on the way out so typing a number then tapping Sell
      // uses what is on screen.
      const field = $('#mgrQty', host)
      if (field) mgr.qty = Math.max(1, Number(field.value) || 1)
      mgrDo(btn.dataset.mgrAction, mgr.sheetId)
    }
  }

  for (const step of $$('[data-mgr-step]', host)) {
    step.onclick = () => {
      const field = $('#mgrQty', host)
      if (!field) return
      const max = toNum(field.getAttribute('max'), null) ?? itemQty(mgrItemById(mgr.sheetId)) ?? 1
      const next = Math.min(Math.max(1, max), Math.max(1, (toNum(field.value, 1) ?? 1) + (toNum(step.dataset.mgrStep, 0) ?? 0)))
      field.value = String(next)
      mgr.qty = next
      // Repaint just the sell label so the confirm text matches the amount.
      const sell = host.querySelector('[data-mgr-action="sell"]')
      if (sell && mgr.confirm?.action !== 'sell') {
        const price = toNum(mgrItemById(mgr.sheetId)?.sellPrice, null)
        sell.textContent = price != null ? `Sell ${num(next)}` : 'Sell'
      }
    }
  }
  const qtyField = $('#mgrQty', host)
  if (qtyField) qtyField.oninput = () => { mgr.qty = Math.max(1, Number(qtyField.value) || 1) }
}

/** The amount the sheet is asking for, clamped to the stack. */
function amountFor(id) {
  const qty = itemQty(mgrItemById(id)) || 1
  return Math.min(Math.max(1, mgr.qty || 1), qty)
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
    else if (action === 'sell') await api.sellItem(id, amountFor(id))
    else if (action === 'discard') await api.discardItem(id, amountFor(id))
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
    // `monds` is its own currency in the updated wallet, not a gem alias.
    monds: toNum(pick(w, ['monds', 'mond', 'mondBalance']), 0),
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
        ['Monds', w.monds, 'monds', 'reward'],
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
        <button type="button" class="btn btn-secondary btn-sm" id="walletRepay">Repay all</button>
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
          <button type="button" class="btn btn-secondary btn-sm" data-wallet="vault-out">Unvault</button>
          <button type="button" class="btn btn-ghost btn-sm" data-wallet="loan">Take loan</button>
          <button type="button" class="btn btn-ghost btn-sm" data-wallet="repay">Repay</button>
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
      // Direction is the sign: a negative amount moves money back out of the
      // bank/vault into the wallet. Loans and repayments are always positive.
      const out = kind === 'bank-in' ? await api.bankMove(amount)
        : kind === 'bank-out' ? await api.bankMove(-amount)
        : kind === 'vault-in' ? await api.vaultMove(amount)
        : kind === 'vault-out' ? await api.vaultMove(-amount)
        : kind === 'loan' ? await api.takeLoan(amount)
        : await api.repayLoan(amount)
      // The response carries the settled wallet, so the numbers on screen come
      // from the server rather than from arithmetic here.
      const fresh = walletView(out, null)
      toast(fresh.carried != null ? `Wallet updated · ${num(fresh.carried)} solars` : 'Wallet updated', 'ok')
      await loadWallet()
    } catch (e) {
      if (err) err.textContent = e?.message ?? 'That didn’t work.'
      else toast(e?.message ?? 'That didn’t work', 'err')
    }
  }

  for (const btn of $$('[data-wallet]')) btn.onclick = () => walletAction(btn.dataset.wallet)

  const repay = $('#walletRepay')
  if (repay) repay.onclick = async () => {
    try { await api.repayLoan('all'); toast('Loan repaid', 'ok'); await loadWallet() }
    catch (e) { toast(e?.message ?? 'Could not repay', 'err') }
  }
}

/* ──────────────────────────────── storage ─────────────────────────────── */

/**
 * Three containers, one route.
 *
 * `/storage` answers with the Ender Chest flattened at the top level and the
 * other two nested (`bag`, `chest`, `ender`), each with its own `items`, `used`
 * and `capacity`. Reading the top-level `items` as "everything" was what made
 * the page look like a single chest - so every container is read on its own
 * here, and a container the bot didn't describe simply doesn't appear.
 */
const CONTAINERS = [
  { id: 'bag', label: 'Bag', icon: 'inventory' },
  { id: 'chest', label: 'Chest', icon: 'lock' },
  { id: 'ender', label: 'Ender chest', icon: 'gift' },
]

/** The containers as they were last painted, for the transfer sheet. */
let storageBoxes = []
let storageEnder = false

/**
 * Where the transfer panel is pointing.
 *
 * The page used to make the reader guess: tapping a stack opened a card with
 * two buttons and no statement of where anything was going. Now the direction
 * is chosen first, in words, and every stack in the panel moves that way.
 */
let storageMove = { from: 'bag', to: 'ender' }

/** The container an item stack is addressed by, or null if the record has no id. */
const stackKey = (i) => {
  const raw = pick(i, ['id', 'itemId', 'item_id', 'itemInstanceId', 'instanceId', 'key', 'stackId'])
  return raw == null || raw === '' ? null : String(raw)
}

const boxLabel = (id) => CONTAINERS.find(c => c.id === id)?.label ?? id

/** Containers that currently exist and can be moved into or out of. */
function liveContainers() {
  return CONTAINERS.filter(c => c.id !== 'ender' || storageEnder)
}

function containerOf(out, id) {
  const s = pick(out, ['storage']) ?? out ?? {}
  const box = pick(s, [id]) ?? {}
  // The Ender Chest is also flattened at the top level; use that when the
  // nested object isn't there.
  const fallback = id === 'ender' && !box.items ? s : null
  const src = fallback ?? box
  const items = listOf(src, ['items', 'contents', 'stacks'])
  return {
    id,
    items,
    used: counted(pick(src, ['used', 'slotsUsed', 'count']), items.length),
    capacity: counted(pick(src, ['capacity', 'slots', 'maxSlots', 'size']), 0),
  }
}

/** "Do I own the ender chest?" - every spelling the bot has used. */
function enderOwned(s) {
  const direct = pick(s, ['enderChest', 'enderChestOwned', 'enderOwned', 'enderUnlocked'])
  if (direct !== undefined) return isOwned(direct)
  const chests = pick(s, ['chests'])
  if (chests && typeof chests === 'object') {
    const e = chests.ender ?? chests.enderChest
    if (e !== undefined) return isOwned(e)
  }
  return isOwned(pick(s, ['ender']))
}

const storageBox = (id) => storageBoxes.find(b => b.id === id) ?? { id, items: [], used: 0, capacity: 0 }

export async function loadStoragePage() {
  const root = $('#storageRoot')
  if (!root) return
  root.innerHTML = skeletonCards(2)

  const out = await api.storage().catch(err => ({ __error: err }))
  if (out?.__error) {
    root.innerHTML = emptyState('warning', 'Storage unavailable', out.__error.message ?? '')
    return
  }

  storageEnder = enderOwned(out)
  storageBoxes = CONTAINERS.map(c => containerOf(out, c.id))

  // Keep the remembered direction valid: no pointing at a locked ender chest,
  // and never from a container into itself.
  const usable = liveContainers().map(c => c.id)
  if (!usable.includes(storageMove.from)) storageMove.from = usable[0]
  if (!usable.includes(storageMove.to) || storageMove.to === storageMove.from) {
    storageMove.to = usable.find(id => id !== storageMove.from) ?? storageMove.from
  }

  renderStorage()
}

/** Paints the page from the last `/storage` answer and wires it. */
function renderStorage() {
  const root = $('#storageRoot')
  if (!root) return
  const usable = liveContainers()
  const from = storageBox(storageMove.from)
  const to = storageMove.to
  const canMove = to !== storageMove.from

  root.innerHTML = `
    <div class="storage-cards">
      ${storageBoxes.map(box => {
        const meta = CONTAINERS.find(c => c.id === box.id)
        const locked = box.id === 'ender' && !storageEnder
        const pct = box.capacity ? Math.min(100, Math.round((box.used / box.capacity) * 100)) : 0
        return `
        <div class="storage-card${locked ? ' is-locked' : ''}${box.id === 'ender' && storageEnder ? ' is-owned' : ''}">
          <span class="wallet-ico">${iconSvg(meta.icon, 'inline-icon')}</span>
          <div>
            <strong>${meta.label}${box.id === 'ender' && storageEnder ? ' <span class="chip-sm">Owned</span>' : ''}</strong>
            <p class="subtext">${locked
              ? 'Unlocks for 100,000 solars, once.'
              : `${num(box.used)}${box.capacity ? ` / ${num(box.capacity)}` : ''} slots${box.items.length ? ` · ${num(box.items.length)} stacks` : ' · empty'}`}</p>
            ${!locked && box.capacity ? `<div class="mgr-cap-track"><i style="width:${pct}%"></i></div>` : ''}
          </div>
          ${locked
            ? '<button type="button" class="btn btn-secondary btn-sm" id="buyEnder">Unlock</button>'
            : box.id === 'chest'
              ? '<button type="button" class="btn btn-ghost btn-sm" id="buyChest">Expand</button>'
              : ''}
        </div>`}).join('')}
    </div>

    <section class="mob-sec">
      <div class="sec-head"><h2>Transfer items</h2></div>
      <div class="card storage-move">
        <div class="mv-row">
          <span class="mv-label">From</span>
          <div class="filter-pills" role="tablist" aria-label="Move items from">
            ${usable.map(c => `<button type="button" class="filter-pill${storageMove.from === c.id ? ' is-on' : ''}"
              data-mv-from="${attr(c.id)}" role="tab" aria-selected="${storageMove.from === c.id}">${esc(c.label)}</button>`).join('')}
          </div>
        </div>
        <div class="mv-row">
          <span class="mv-label">To</span>
          <div class="filter-pills" role="tablist" aria-label="Move items to">
            ${usable.filter(c => c.id !== storageMove.from).map(c => `<button type="button"
              class="filter-pill${storageMove.to === c.id ? ' is-on' : ''}" data-mv-to="${attr(c.id)}"
              role="tab" aria-selected="${storageMove.to === c.id}">${esc(c.label)}</button>`).join('')}
          </div>
        </div>
        <p class="mv-sum">Moving items from <b>${esc(boxLabel(storageMove.from))}</b>
          to <b>${esc(boxLabel(to))}</b>. Tap a stack and choose how many.</p>
      </div>

      <div class="sec-head" style="margin-top:14px">
        <h2>In your ${esc(boxLabel(storageMove.from).toLowerCase())}</h2>
        <span class="subtext">${num(from.items.length)} stacks</span>
      </div>
      ${from.items.length
        ? `<div class="mgr-grid">${from.items.map(i => itemCard(i, {
            attrs: `data-mv-stack="${attr(stackKey(i) ?? '')}"`,
          })).join('')}</div>`
        : emptyState('inventory', `${boxLabel(storageMove.from)} is empty`,
            canMove ? `Nothing here to move to the ${esc(boxLabel(to).toLowerCase())} yet.` : 'Pick another container above.')}

      ${canMove ? `<p class="mgr-note">The bot moves up to 99 per request and can stop early if the
        ${esc(boxLabel(to).toLowerCase())} is full - the count it reports is the one shown.</p>` : ''}
    </section>`

  for (const btn of $$('[data-mv-from]', root)) {
    btn.onclick = () => {
      storageMove.from = btn.dataset.mvFrom
      if (storageMove.to === storageMove.from) {
        storageMove.to = liveContainers().map(c => c.id).find(id => id !== storageMove.from) ?? storageMove.from
      }
      renderStorage()
    }
  }
  for (const btn of $$('[data-mv-to]', root)) {
    btn.onclick = () => { storageMove.to = btn.dataset.mvTo; renderStorage() }
  }
  for (const tile of $$('[data-mv-stack]', root)) {
    tile.onclick = () => openTransferSheet(tile.dataset.mvStack)
  }

  const chest = $('#buyChest', root)
  if (chest) chest.onclick = () => openChestBuy()
  const enderBtn = $('#buyEnder', root)
  if (enderBtn) enderBtn.onclick = async () => {
    enderBtn.disabled = true
    try { await api.buyEnderChest(); toast('Ender chest unlocked', 'ok'); await loadStoragePage() }
    catch (e) { enderBtn.disabled = false; toast(e?.message ?? 'Could not buy that', 'err') }
  }
}

/**
 * One stack: how many, and where to.
 *
 * The destination comes from the panel but can be changed here too, and the
 * stepper is clamped to the stack (and to the bot's 99-per-request cap) so the
 * button can only ever ask for something that exists.
 */
function openTransferSheet(key) {
  const from = storageMove.from
  const item = storageBox(from).items.find(i => String(stackKey(i)) === String(key))
  if (!item) return

  const stackQty = Math.max(1, itemQty(item) || 1)
  const max = Math.min(stackQty, 99)
  let amount = Math.min(max, 1)
  let to = storageMove.to

  const paint = () => {
    const targets = liveContainers().filter(c => c.id !== from)
    openModal(itemPopupHtml(item, {
      qty: stackQty,
      note: `
        <div class="item-pop-stepper">
          <span>Amount</span>
          <div class="stepper">
            <button type="button" class="stepper-btn" data-mv-step="-1" aria-label="One fewer">−</button>
            <input id="mvQty" type="number" inputmode="numeric" min="1" max="${max}" value="${amount}" aria-label="Amount">
            <button type="button" class="stepper-btn" data-mv-step="1" aria-label="One more">+</button>
          </div>
          <span class="subtext">of ${num(stackQty)}</span>
        </div>
        <p class="item-pop-note">In your ${esc(boxLabel(from).toLowerCase())}. Pick where it goes:</p>
        <div class="filter-pills" role="tablist" aria-label="Move to">
          ${targets.map(c => `<button type="button" class="filter-pill${to === c.id ? ' is-on' : ''}"
            data-mv-target="${attr(c.id)}" role="tab" aria-selected="${to === c.id}">${esc(c.label)}</button>`).join('')}
        </div>`,
      actions: `<button type="button" class="btn btn-primary btn-sm" id="mvConfirm">
          Move ${num(amount)} to ${esc(boxLabel(to))}
        </button>`,
    }))
    wire()
  }

  const wire = () => {
    for (const step of $$('[data-mv-step]')) {
      step.onclick = () => {
        amount = Math.min(max, Math.max(1, amount + Number(step.dataset.mvStep)))
        const field = $('#mvQty')
        if (field) field.value = String(amount)
        paint()
      }
    }
    const field = $('#mvQty')
    if (field) field.oninput = () => {
      const n = Number(field.value)
      if (Number.isFinite(n)) amount = Math.min(max, Math.max(1, Math.round(n)))
    }
    for (const btn of $$('[data-mv-target]')) {
      btn.onclick = () => { to = btn.dataset.mvTarget; paint() }
    }
    const confirm = $('#mvConfirm')
    if (confirm) confirm.onclick = () => runTransfer({ key, from, to, amount, confirm })
  }

  paint()
}

/**
 * Sends one move and reports exactly what happened.
 *
 * A move can succeed only in part, so the toast is built from `moved` and
 * `reason`, and the page is re-read afterwards - never patched from the number
 * that was asked for.
 */
async function runTransfer({ key, from, to, amount, confirm }) {
  if (confirm) { confirm.disabled = true; confirm.textContent = 'Moving…' }
  try {
    const out = await api.storageMove({ from, to, item: key, qty: amount })
    const moved = toNum(pick(out, ['moved', 'qty', 'amount']), amount)
    const reason = cleanText(pick(out, ['reason', 'note']), '')
    const name = cleanText(pick(out, ['name', 'itemName']), '')
    toast(
      moved === 0
        ? `Nothing moved${reason ? ` · ${reason}` : ''}`
        : `Moved ${num(moved)}${name ? ` ${name}` : ''} to the ${boxLabel(to).toLowerCase()}${moved < amount && reason ? ` · ${reason}` : ''}`,
      moved === 0 ? 'err' : 'ok',
    )
    storageMove.to = to
    closeModal()
    await loadStoragePage()
  } catch (e) {
    if (confirm) { confirm.disabled = false; confirm.textContent = `Move ${num(amount)} to ${boxLabel(to)}` }
    toast(e?.message ?? 'That move failed', 'err')
  }
}

/**
 * The chest has two prices, so the player picks which pot pays.
 *
 * The bot decides both, and the response carries the new storage - so the page
 * re-reads it rather than assuming the capacity went up.
 */
function openChestBuy() {
  openModal(`
    <div class="item-pop">
      <div class="item-pop-head"><h3>Expand the chest</h3><p class="item-pop-sub">One more row of slots</p></div>
      <div class="item-pop-body">
        <p class="item-pop-desc">Pay with solars or with gems - the bot sets both prices and applies the new capacity.</p>
        <div class="item-pop-actions">
          <button type="button" class="btn btn-primary btn-sm" data-chest-buy="solars">${iconSvg('spark', 'inline-icon')} Pay solars</button>
          <button type="button" class="btn btn-secondary btn-sm" data-chest-buy="gems">${iconSvg('gem', 'inline-icon')} Pay gems</button>
        </div>
      </div>
    </div>`)

  for (const btn of $$('[data-chest-buy]')) {
    btn.onclick = async () => {
      btn.disabled = true
      try {
        await api.buyStorageChest(btn.dataset.chestBuy)
        toast('Chest expanded', 'ok')
        closeModal()
        await loadStoragePage()
      } catch (e) {
        btn.disabled = false
        toast(e?.message ?? 'Could not buy that', 'err')
      }
    }
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

/**
 * The art a record's card carries behind it.
 *
 * The six paintings are background, not a second set of cards: every quest row
 * and achievement card gets the picture of the track it belongs to, so the
 * lists below read as illustrated cards instead of lines on black.
 */
function trackArtFor(record) {
  const id = trackOf(record)
  return PROGRESS_TRACKS.find(t => t.id === id) ?? null
}

/** Inline style + class that put a track painting behind a card. */
function trackArtAttrs(record) {
  const track = trackArtFor(record)
  if (!track?.art) return { cls: '', style: '' }
  return { cls: ' has-art', style: ` style="--art:url('${attr(track.art)}')"` }
}

/** Small label naming the track, shown on the card. */
function trackChip(record) {
  const track = trackArtFor(record)
  return track ? `<span class="card-track">${esc(track.label)}</span>` : ''
}

/**
 * The Halloween event, exactly as the bot reports it.
 *
 * `active`, `claimed`, `reward` and `badge` are the server's, and the reward is
 * never spelled out on the client: the card prints what `reward` contains and
 * the claim prints what `granted` says came back. If `/events` isn't deployed,
 * the card says so calmly instead of pretending a giveaway exists.
 */
let halloween = null

/** The event record from either envelope shape the bot has used. */
function eventById(payload, id) {
  if (!payload || payload.__error) return null
  const rows = listOf(payload, ['events', 'items', 'active', 'season'])
  const found = rows.find(x => String(pick(x, ['id', 'eventId', 'slug', 'key']) ?? '') === id)
  if (found) return found
  const direct = pick(payload, [id])
  if (direct && typeof direct === 'object') return direct
  return String(pick(payload, ['id', 'eventId']) ?? '') === id ? payload : null
}

/** Reward chips from `reward`, `rewards`, or whatever else it was called. */
function rewardChips(ev) {
  if (!ev) return ''
  const rew = pick(ev, ['reward', 'rewards', 'prize', 'drop']) ?? {}
  const chips = []
  if (typeof rew === 'string') chips.push({ icon: 'gift', label: rew })
  else {
    const solars = toNum(pick(rew, ['solars', 'coins', 'money']), null)
    const gems = toNum(pick(rew, ['gems', 'gem']), null)
    const monds = toNum(pick(rew, ['monds', 'mond']), null)
    if (solars) chips.push({ icon: 'spark', label: `${num(solars)} solars` })
    if (gems) chips.push({ icon: 'gem', label: `${num(gems)} gems` })
    if (monds) chips.push({ icon: 'reward', label: `${num(monds)} ${plural(monds, 'mond')}` })
    for (const extra of listOf(rew, ['items', 'extra'])) {
      const label = cleanText(typeof extra === 'string' ? extra : pick(extra, ['name', 'label', 'title']), '')
      if (label) chips.push({ icon: 'inventory', label })
    }
  }
  const badge = ev.badge
  const badgeName = cleanText(typeof badge === 'string' ? badge : pick(badge, ['name', 'title', 'label']), '')
  if (badgeName) chips.push({ icon: 'premium', label: badgeName })
  return chips.length
    ? `<div class="ev-rewards">${chips.map(c => `<span class="ev-reward">${iconSvg(c.icon, 'inline-icon')} ${esc(c.label)}</span>`).join('')}</div>`
    : ''
}

function halloweenCard(ev, error) {
  if (!ev) {
    // Not deployed yet (or the route is closed): say so, offer nothing.
    if (!error) return ''
    const notFound = error.status === 404 || error.status === 405
    return `
      <section class="mob-sec">
        <div class="card ev-card is-quiet">
          <div class="ev-body">
            <span class="ev-badge">Event</span>
            <h2 class="ev-title">Halloween</h2>
            <p class="ev-desc">${notFound
              ? 'The event feed isn’t live yet. It appears here the moment the bot opens it.'
              : esc(error.message ?? 'The event feed couldn’t be read.')}</p>
          </div>
        </div>
      </section>`
  }

  const active = isOwned(pick(ev, ['active', 'isActive', 'live', 'enabled']))
  const claimed = isOwned(pick(ev, ['claimed', 'isClaimed', 'hasClaimed']))
  const title = cleanText(pick(ev, ['title', 'name']), 'Halloween')
  const desc = cleanText(pick(ev, ['description', 'desc', 'text']), '')
  const img = imgOf(ev) || 'https://i.ibb.co/ymySXjzR/D4DJ.jpg'
  const state = claimed ? 'Claimed' : active ? 'Live' : 'Not live yet'

  return `
    <section class="mob-sec">
      <div class="card ev-card">
        <div class="ev-media">
          <img src="${attr(img)}" alt="" referrerpolicy="no-referrer" loading="lazy"
               onerror="this.style.display='none'">
          <div class="ev-veil"></div>
          <span class="ev-badge">${active && !claimed ? 'Limited event' : state}</span>
        </div>
        <div class="ev-body">
          <h2 class="ev-title">${esc(title)}</h2>
          ${desc ? `<p class="ev-desc">${esc(desc)}</p>` : ''}
          ${rewardChips(ev)}
          ${claimed
            ? '<span class="chip-sm">Reward collected</span>'
            : active
              ? `<button type="button" class="btn btn-primary btn-sm ev-cta" id="halloweenClaim">Claim gift</button>`
              : `<button type="button" class="btn btn-secondary btn-sm ev-cta" id="halloweenClaim" disabled>Not live yet</button>`}
        </div>
      </div>
    </section>`
}

/**
 * Claiming, with the retry rules the bot documents.
 *
 * One key per attempt, reused if the same attempt has to be repeated - that is
 * what stops a double tap or a dropped connection paying out twice. A 503
 * (CLAIM_SAVE_PENDING / CLAIM_COMMIT_FAILED) is *unconfirmed*, not failed: the
 * button stays live so the player can safely try again, and the event is
 * re-read first so a claim that actually landed shows as claimed.
 */
let claimKey = null

async function claimHalloween(btn) {
  if (btn.disabled) return
  claimKey = claimKey || newIdempotencyKey()
  btn.disabled = true
  btn.textContent = 'Claiming…'
  try {
    await api.claimEvent('halloween', claimKey)
    claimKey = null
    // The server paid; ask it what the wallet and the event look like now.
    await api.wallet().catch(() => null)
    toast('Halloween gift claimed', 'ok')
    await loadProgress()
  } catch (err) {
    const unconfirmed = err?.status === 503
      || ['CLAIM_SAVE_PENDING', 'CLAIM_COMMIT_FAILED'].includes(err?.code)
    if (unconfirmed) {
      toast('The claim could not be confirmed yet. Try again - it is safe.', 'err')
      btn.disabled = false
      btn.textContent = 'Try again'
      await api.events().catch(() => null)
      return
    }
    claimKey = null
    btn.disabled = false
    btn.textContent = halloween?.claimed ? 'Claimed' : 'Claim gift'
    toast(err?.message ?? 'Could not claim right now', 'err')
    // 409 already-claimed is a normal outcome, not an error to shout about.
    if (err?.status === 409) await loadProgress()
  }
}

export async function loadProgress() {
  const root = $('#progressRoot')
  if (!root) return
  root.innerHTML = skeletonCards(2)

  const [quests, achievements, progress, me, events] = await Promise.all([
    api.quests().catch(err => ({ __error: err })),
    api.achievements().catch(() => null),
    api.progress().catch(() => null),
    api.me().catch(() => null),
    // Live event state, so the Halloween card shows what the bot says rather
    // than a countdown or a reward the site made up.
    api.events().catch(err => ({ __error: err })),
  ])

  if (quests?.__error && !me) {
    root.innerHTML = emptyState('warning', 'Progress unavailable', quests.__error.message ?? '')
    return
  }

  const q = listOf(quests, ['quests', 'items', 'rows'])
  const a = listOf(achievements, ['achievements', 'items', 'rows'])
  const p = pick(progress, ['progress']) ?? progress ?? {}
  const player = me?.player ?? null


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
    const art = trackArtAttrs(item)
    return `
      <div class="quest-row${art.cls}"${art.style}>
        <span class="quest-ico">${iconSvg('spark', 'inline-icon')}</span>
        <div class="quest-body">
          ${trackChip(item)}
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

  halloween = eventById(events, 'halloween')

  root.innerHTML = `
    ${halloweenCard(halloween, events?.__error)}

    ${statRows.length ? `
      <div class="pd-stats" style="margin-bottom:20px">
        ${statRows.map(([k, v]) => `
          <div class="pd-stat"><div class="pd-stat-k">${esc(k)}</div>
          <div class="pd-stat-v">${esc(typeof v === 'number' ? num(v) : String(v))}</div></div>`).join('')}
      </div>` : ''}

    <section class="mob-sec">
      <div class="sec-head">
        <h2>Quests</h2>
        <span class="subtext">${num(q.filter(x => isOwned(pick(x, ['claimable', 'canClaim']))).length)} ready</span>
      </div>
      ${q.length ? `<div class="quest-list">${q.map(questRow).join('')}</div>`
        : emptyState('season', 'No quests right now', 'New ones appear when the bot rotates them in.')}
    </section>

    <section class="mob-sec">
      <div class="sec-head"><h2>Achievements</h2></div>
      ${a.length ? `<div class="ach-grid">${a.map(x => {
        const id = pick(x, ['id', 'achievementId', 'key'])
        const claimable = isOwned(pick(x, ['claimable', 'canClaim']))
        const claimed = isOwned(pick(x, ['claimed', 'unlocked', 'isClaimed']))
        const art = trackArtAttrs(x)
        return `
        <div class="ach-card${claimed ? ' is-done' : ''}${art.cls}"${art.style}>
          <span class="ach-ico">${iconSvg('reward', 'inline-icon')}</span>
          <strong>${esc(cleanText(pick(x, ['name', 'title']), 'Achievement'))}</strong>
          <p class="subtext">${esc(cleanText(pick(x, ['description', 'text'])))}</p>
          ${trackChip(x)}
          ${claimable && id != null
            ? `<button type="button" class="btn btn-secondary btn-sm" data-claim-ach="${attr(id)}">Claim</button>`
            : `<span class="chip-sm">${claimed ? 'Unlocked' : 'Locked'}</span>`}
        </div>`}).join('')}</div>`
        : emptyState('reward', 'No achievements yet', 'They unlock as you play.')}
    </section>`

  const evBtn = $('#halloweenClaim', root)
  if (evBtn) evBtn.onclick = () => claimHalloween(evBtn)

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
let dexAvailable = false
let monData = { mons: [], party: [], dex: [], bag: [], shop: [], overview: null }

/**
 * A dex number, but only when the record really carries one.
 *
 * This is the bug behind "the picture doesn't match the name": `id` on a mon row
 * is the bot's own record id, and parsing the digits out of it ("mon_44")
 * fetched Vileplume's artwork for something else entirely. So only explicit dex
 * fields count, and a bare `id` is trusted only when it is a plain integer in
 * dex range.
 */
const dexRange = (n) => n != null && Number.isInteger(n) && n > 0 && n <= 1025

function dexOf(m) {
  const explicit = toNum(pick(m, ['dexId', 'dexNumber', 'pokedexNumber', 'speciesId', 'number', 'nationalId']), null)
  if (dexRange(explicit)) return explicit
  const rawId = m?.id
  if (typeof rawId === 'number' && dexRange(rawId)) return rawId
  if (typeof rawId === 'string' && /^\d+$/.test(rawId.trim())) {
    const n = Number(rawId.trim())
    if (dexRange(n)) return n
  }
  return null
}

/** The species name - never the nickname, which won't resolve to anything. */
const monSpecies = (m) => cleanText(pick(m, ['species', 'speciesName', 'name', 'pokemon']), '')
const monName = (m) => cleanText(pick(m, ['nickname', 'name', 'species', 'pokemon']), 'Pokémon')

/**
 * A mon's picture, in the order that will actually resolve:
 * whatever the bot sent -> confirmed dex artwork -> nothing (the caller then
 * asks PokeAPI by name, which is the only trustworthy key).
 */
function monArt(m) {
  const direct = imgOf(m)
  if (direct) return direct
  // Mon detail and battle state expose ordered fallbacks here.
  const front = pick(m, ['art'])?.front
  if (front) return resolveArt(String(front))
  // Showdown is the sprite source for everything on this site: it has an id for
  // every species, so a name is all that's needed.
  const sprite = monSprite(monSpecies(m))
  if (sprite) return sprite
  const dex = dexOf(m)
  if (dex) return pokemonImageUrl(dex)
  return ''
}

/**
 * A Pokémon-bag stack as a card.
 *
 * The bot's own `image` wins when it sends one. Otherwise the Showdown item
 * icon is used, which is the same sprite the games use for that item - so a
 * Poké Ball doesn't fall back to the generic inventory glyph.
 */
function monItemCard(i, opts = {}) {
  const name = cleanText(pick(i, ['name', 'itemName', 'title']), '')
  const icon = itemIcon(name)
  return itemCard(icon && !imgOf(i) ? { ...i, image: icon } : i, opts)
}

/**
 * Fills in art for cards that were rendered without a picture.
 *
 * Each one is looked up by species name and patched in place. When the lookup
 * returns a different Pokémon than the dex number we guessed from, the name
 * wins - that is exactly the mismatch being fixed - so the src is replaced
 * rather than left alone.
 */
async function hydrateMonArt(scope) {
  const targets = [...(scope?.querySelectorAll('[data-mon-art]') ?? [])]
  for (const img of targets) {
    const name = img.dataset.monArt
    if (!name) continue
    // Showdown has an id for every species, so the name resolves locally.
    const art = { url: monSprite(name) }
    if (!art.url) {
      // Nothing to show: swap the broken box for the spark glyph.
      const holder = img.parentElement
      if (holder && !holder.querySelector('.item-art-ph')) {
        img.remove()
        holder.insertAdjacentHTML('beforeend', `<span class="item-art-ph">${iconSvg('spark', 'inventory-icon')}</span>`)
      }
      continue
    }
    img.src = art.url
    img.hidden = false
  }
}

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
  // so each is caught on its own and simply renders empty. The battle route is
  // also how an interrupted fight is picked back up after a reload.
  const [meta, overview, mons, party, dexIn, bag, shop, battle] = await Promise.all([
    api.pokemonMeta().catch(() => null),
    api.pokemonOverview().catch(() => null),
    api.pokemonMons().catch(err => ({ __error: err })),
    api.pokemonParty().catch(() => null),
    api.pokemonDex().catch(err => ({ __error: err })),
    api.pokemonBag().catch(() => null),
    api.pokemonShop().catch(() => null),
    api.pokemonBattle().catch(() => null),
  ])

  if (mons?.__error) {
    root.innerHTML = emptyState('warning', 'Pokémon aren’t live yet', mons.__error.message ?? 'The bot hasn’t opened this route.')
    return
  }

  const dex = dexIn?.__error ? null : dexIn
  monMeta = pick(meta, ['meta']) ?? meta ?? null
  monData = {
    overview: pick(overview, ['overview']) ?? overview ?? null,
    mons: listOf(mons, ['mons', 'pokemon', 'items', 'caught']),
    party: listOf(party, ['party', 'members', 'mons']),
    dex: listOf(dex, ['dex', 'entries', 'species', 'pokemon']),
    bag: listOf(bag, ['bag', 'items']),
    shop: listOf(shop, ['items', 'shop', 'stock']),
  }
  monBattle = liveBattle(battle) ?? liveBattle(pick(monData.overview, ['battle']))
  // Showdown's move table adds a move's type badge and power when the bot only
  // names the move. It is loaded before the panel is drawn (once a week, then
  // from cache) so the first paint is the finished one; if it can't load, the
  // buttons simply show what the bot sent.
  if (monBattle) await warmMoveData().catch(() => false)

  const o = monData.overview ?? {}
  // A brand-new account picks a starter before anything else makes sense.
  if (isOwned(pick(o, ['needsStarter', 'needsStarterChoice'])) && !monData.mons.length) {
    root.innerHTML = starterPicker()
    wireStarter()
    return
  }
  const dexSeen = toNum(pick(o, ['dexSeen', 'seen', 'seenCount']), monData.dex.length)
  // `/pokemon/dex` is not part of the bot's published Pokémon routes. When it
  // isn't there the tab is left out instead of being a dead end.
  dexAvailable = !dex?.__error && monData.dex.length > 0
  if (!dexAvailable && monTab === 'dex') monTab = 'mons'
  const tabs = [
    ['mons', 'Mons'],
    ['party', 'Party'],
    ...(dexAvailable ? [['dex', 'Dex']] : []),
    ['bag', 'Bag'],
    ['shop', 'Shop'],
  ]

  root.innerHTML = `
    ${battlePanel()}
    <div class="mon-summary">
      <div><strong>${num(monData.mons.length)}</strong><span>caught</span></div>
      <div><strong>${num(monData.party.length)}</strong><span>in party</span></div>
      <div><strong>${num(dexSeen)}</strong><span>seen</span></div>
    </div>
    <div class="mon-actions">
      <button type="button" class="btn btn-primary btn-sm" id="monHunt" ${monBattle ? 'disabled' : ''}>
        ${iconSvg('spark', 'inline-icon')} ${monBattle ? 'Battle in progress' : 'Hunt'}
      </button>
      <button type="button" class="btn btn-secondary btn-sm" id="monHeal">${iconSvg('gift', 'inline-icon')} Heal party</button>
      ${monBattle ? `<button type="button" class="btn btn-ghost btn-sm" id="monForfeit">Forfeit</button>` : ''}
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
      const panel = $('#monPanel')
      panel.innerHTML = monPanel()
      wireMonPanel()
      hydrateMonArt(panel)
    }
  }
  $('#monHunt').onclick = async (e) => {
    e.currentTarget.disabled = true
    try {
      const out = await api.pokemonHunt()
      await applyBattle(out)
      // A hunt either starts a fight (the panel replaces the button state) or
      // ends in a catch, which is a collection change - both need a repaint.
      if (monBattle) await loadPokemon()
    } catch (err) { e.currentTarget.disabled = false; toast(err?.message ?? 'Hunt failed', 'err') }
  }
  const forfeit = $('#monForfeit')
  if (forfeit) forfeit.onclick = async () => {
    forfeit.disabled = true
    try { await api.pokemonForfeit(); toast('Battle forfeited', 'ok'); monBattle = null; await loadPokemon() }
    catch (err) { forfeit.disabled = false; toast(err?.message ?? 'Could not forfeit', 'err') }
  }
  $('#monHeal').onclick = async (e) => {
    e.currentTarget.disabled = true
    try { await api.pokemonHeal(); toast('Party healed', 'ok'); await loadPokemon() }
    catch (err) { e.currentTarget.disabled = false; toast(err?.message ?? 'Could not heal', 'err') }
  }
  wireMonPanel()
  wireBattle()
  // Cards rendered without art get it filled in by species name.
  hydrateMonArt($('#monPanel'))
}

/* ───────────────────────────── pokémon battle ─────────────────────────── */

/**
 * The bot owns the fight.
 *
 * Every rule - who moves first, how much lands, whether a ball catches, what a
 * berry does - lives in the bot, and an active battle lives in its memory. So
 * this page never rolls anything: it posts one action, then draws the battle,
 * events and bag the server sends back. A restart on the bot's side ends the
 * fight, which is why `battle` is re-read on every load instead of being kept.
 */
let monMeta = null
let monBattle = null
let battleLog = []
let battleBusy = false

/** A battle payload that is actually in progress, or null. */
function liveBattle(payload) {
  const b = pick(payload, ['battle']) ?? (pick(payload, ['you', 'foe']) ? payload : null)
  if (!b) return null
  const active = pick(b, ['active', 'isActive', 'ongoing'])
  if (active !== undefined) return isOwned(active) ? b : null
  // Older payloads have no flag: an unfinished fight is one with no result.
  return pick(b, ['finished', 'result', 'over', 'winner']) === undefined ? b : null
}

const sideOf = (b, which) => pick(b, [which]) ?? {}
const frontOf = (side) => pick(side, ['active', 'front', 'mon', 'pokemon']) ?? side

/** HP, when the record carries it. No invented bar. */
function hpOf(m) {
  const hp = toNum(pick(m, ['hp', 'currentHp', 'health']), null)
  const max = toNum(pick(m, ['maxHp', 'hpMax', 'maxHealth']), null)
  return hp != null && max ? { hp, max, pct: Math.max(0, Math.min(100, Math.round((hp / max) * 100))) } : null
}

/**
 * One side of the field, the way Showdown draws it: a small HUD plate and the
 * battler standing on the ground next to it.
 *
 * The HUD is deliberately tiny - name, level, a thin HP bar - because the
 * sprite is the thing being looked at. When the bot sends no HP the bar is
 * muted and says so rather than inventing a number.
 */
function battleHud(m, { foe = false, id }) {
  const hp = hpOf(m)
  const lvl = toNum(pick(m, ['level', 'lvl']), null)
  return `
    <div class="pb-hud${foe ? ' is-foe' : ' is-you'}" data-hud="${attr(id)}">
      <div class="pb-hud-top">
        <span class="pb-hud-name">${esc(monName(m))}</span>
        ${lvl != null ? `<span class="pb-hud-lv">Lv${num(lvl)}</span>` : ''}
      </div>
      <div class="pb-hp${hp ? (hp.pct <= 25 ? ' is-low' : hp.pct <= 50 ? ' is-mid' : '') : ' is-unknown'}"
           role="img" aria-label="${hp ? `${num(hp.hp)} of ${num(hp.max)} HP` : 'HP not available'}">
        <i style="width:${hp ? hp.pct : 0}%"></i>
      </div>
      <div class="pb-hud-sub">${hp ? `${num(hp.hp)} / ${num(hp.max)}` : 'HP —'}</div>
    </div>`
}

/**
 * A battler: the sprite, its ground shadow and the little platform it stands
 * on. `back` is used for your own side, exactly like the games.
 */
function battleMon(m, { foe = false } = {}) {
  const species = monSpecies(m)
  const sprite = imgOf(m) || monSprite(species, { back: !foe }) || ''
  return `
    <div class="pb-mon${foe ? ' is-foe' : ' is-you'}" data-mon-side="${foe ? 'foe' : 'you'}">
      ${sprite
        ? `<img class="pb-mon-img" src="${attr(sprite)}" alt="${attr(monName(m))}"
                loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
        : `<span class="pb-mon-img is-empty">${iconSvg('spark', 'inventory-icon')}</span>`}
      <span class="pb-mon-shadow" aria-hidden="true"></span>
      <span class="pb-mon-platform" aria-hidden="true"></span>
    </div>`
}

/** The moves the bot says this mon has, index included (it is the action key). */
function battleMoves() {
  if (!monBattle) return []
  const you = sideOf(monBattle, 'you')
  const active = frontOf(you)
  const fromActive = listOf(active, ['moves'])
  if (fromActive.length) return fromActive
  const fromSide = listOf(you, ['moves'])
  if (fromSide.length) return fromSide
  return listOf(monBattle, ['moves'])
}

function battlePanel() {
  const b = monBattle
  if (!b) return ''
  const you = sideOf(b, 'you')
  const foe = sideOf(b, 'foe')
  const myMon = frontOf(you)
  const theirMon = frontOf(foe)
  const bg = resolveArt(imgOf(pick(b, ['background', 'bg', 'arena'])) ?? '')
  const moves = battleMoves()
  const team = listOf(you, ['team'])
  const balls = monData.bag.filter(i => /ball/i.test(String(pick(i, ['id', 'name']) ?? '')))
  const items = monData.bag

  return `
    <div class="poke-battle" id="monBattle">
      <div class="pb-scene"${bg ? ` style="--bg:url('${attr(bg)}')"` : ''}>
        ${bg ? `<img class="pb-bg" src="${attr(bg)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        <span class="pb-flash" aria-hidden="true"></span>
        <span class="pb-badge">${esc(cleanText(pick(b, ['kind', 'type', 'mode']), 'Wild battle'))}</span>

        <div class="pb-row is-foe">
          ${battleHud(theirMon, { foe: true, id: 'foe' })}
          ${battleMon(theirMon, { foe: true })}
        </div>

        <div class="pb-row is-you">
          ${battleMon(myMon, { foe: false })}
          ${battleHud(myMon, { id: 'you' })}
        </div>
      </div>

      ${battleLog.length ? `<div class="pb-log" aria-live="polite">${battleLog.slice(0, 3).map((line, i) =>
        `<p${i === 0 ? ' class="is-now"' : ''}>${esc(line)}</p>`).join('')}</div>` : ''}

      ${moves.length ? `
        <div class="pb-moves">
          ${moves.map((mv, i) => {
            const name = cleanText(pick(mv, ['name', 'move', 'title']), `Move ${i + 1}`)
            const pp = toNum(pick(mv, ['pp', 'uses', 'remaining']), null)
            const maxPp = toNum(pick(mv, ['maxPp', 'ppMax']), null)
            // The bot's own type wins; Showdown's table fills the gap when the
            // payload only names the move.
            const info = moveInfo(name)
            const type = cleanText(pick(mv, ['type', 'element']), cleanText(info?.type, ''))
            const power = toNum(pick(mv, ['power', 'basePower']), toNum(info?.basePower, null))
            const badge = type ? typeIcon(type) : ''
            return `
            <button type="button" class="pb-move"
                    style="--tc:${attr(typeColor(type))}"
                    data-pb-move="${attr(String(toNum(pick(mv, ['index', 'slot']), i + 1)))}"
                    data-pb-type="${attr(type)}"
                    ${battleBusy ? 'disabled' : ''}>
              <span class="pb-move-name">${esc(name)}</span>
              <span class="pb-move-sub">
                ${badge ? `<img class="pb-type" src="${attr(badge)}" alt="${attr(type)}" loading="lazy"
                                referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
                ${esc([type, power != null ? `${num(power)} pow` : '',
                  pp != null && (maxPp ? `${num(pp)}/${num(maxPp)} PP` : `${num(pp)} PP`)]
                  .filter(Boolean).join(' · ') || '—')}
              </span>
            </button>`}).join('')}
        </div>` : `<p class="mob-note">The bot didn’t send any moves for this turn.</p>`}

      <div class="pb-acts">
        ${balls.length
          ? `<button type="button" class="btn btn-primary btn-sm" data-pb-catch="${attr(String(pick(balls[0], ['id', 'itemId', 'key'])))}" ${battleBusy ? 'disabled' : ''}>Throw ball</button>`
          : ''}
        ${items.length ? `<button type="button" class="btn btn-secondary btn-sm" id="pbItem" ${battleBusy ? 'disabled' : ''}>Use item</button>` : ''}
        ${team.length > 1 ? `<button type="button" class="btn btn-secondary btn-sm" id="pbSwitch" ${battleBusy ? 'disabled' : ''}>Switch</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-pb-run ${battleBusy ? 'disabled' : ''}>Run</button>
      </div>
    </div>`
}

/* ── battle motion ──────────────────────────────────────────────────────────
   Nothing here decides anything; it only shows what the last turn said. The
   attacker lunges, the target takes a type-coloured hit, and a mon that has
   fainted drops out of the frame. All of it is class toggling so a repaint
   can't leave a half-played animation behind. */

/** How long the longest battle animation runs (keep in step with the CSS). */
const FX_MS = 620

const fxReset = (el, ...classes) => { if (el) el.classList.remove(...classes) }

/** Your mon dashes at the foe. Called before the request, so it plays while we wait. */
function fxAttack(type) {
  const scene = $('#monBattle .pb-scene')
  const mine = $('#monBattle [data-mon-side="you"]')
  const theirs = $('#monBattle [data-mon-side="foe"]')
  if (scene && type) scene.style.setProperty('--hit', typeColor(type))
  if (mine) {
    fxReset(mine, 'is-hit', 'is-faint')
    mine.classList.add('is-attacking')
    setTimeout(() => fxReset(mine, 'is-attacking'), FX_MS)
  }
  if (theirs) {
    fxReset(theirs, 'is-hit')
    theirs.classList.add('is-bracing')
    setTimeout(() => fxReset(theirs, 'is-bracing'), FX_MS)
  }
}

/** The target reacts. Played after the response repaints the field. */
function fxHit({ faint = false } = {}) {
  const scene = $('#monBattle .pb-scene')
  const theirs = $('#monBattle [data-mon-side="foe"]')
  const mine = $('#monBattle [data-mon-side="you"]')
  if (scene) {
    scene.classList.add('is-flashing')
    setTimeout(() => scene.classList.remove('is-flashing'), FX_MS)
  }
  if (theirs) {
    fxReset(theirs, 'is-bracing')
    theirs.classList.add(faint ? 'is-faint' : 'is-hit')
    setTimeout(() => fxReset(theirs, 'is-hit'), FX_MS)
  }
  if (mine) {
    // The bot's events decide who got hit; if our own side is the one that
    // took the turn's damage, shake that instead of the foe.
    const hurt = battleLog.some(line => /(hit|hurt|damage|fainted)/i.test(line) && /^you/i.test(line))
    if (hurt) { mine.classList.add('is-hit'); setTimeout(() => fxReset(mine, 'is-hit'), FX_MS) }
  }
}

/** Draws whatever the last response left behind, or reloads when the fight ended. */
async function applyBattle(out) {
  const events = listOf(out, ['events', 'log', 'messages'])
  if (events.length) {
    battleLog = [
      ...events.map(e => cleanText(typeof e === 'string' ? e : pick(e, ['text', 'message', 'label']), '')).filter(Boolean),
      ...battleLog,
    ].slice(0, 8)
  }
  const bag = listOf(out, ['bag'])
  if (bag.length) monData.bag = bag

  const next = liveBattle(out)
  if (next) {
    monBattle = next
    paintBattle()
    // The field has just been repainted, so the reaction starts from a clean
    // frame rather than from whatever the previous turn left behind.
    const faint = hpOf(frontOf(sideOf(next, 'foe')))?.pct === 0
    fxHit({ faint: !!faint })
    return
  }

  monBattle = null
  const summary = pick(out, ['summary', 'result'])
  const won = summary && isOwned(pick(summary, ['won', 'victory', 'success']))
  if (summary) {
    const caught = pick(summary, ['caught', 'mon', 'pokemon'])
    toast(caught ? `Caught ${monName(caught)}` : won ? 'Battle won' : cleanText(pick(summary, ['text', 'message']), 'Battle over'), 'ok')
  }
  battleLog = []
  await loadPokemon()
}

function paintBattle() {
  const host = $('#monBattle')
  if (!monBattle) { if (host) host.remove(); return }
  if (!host) { loadPokemon(); return }
  host.outerHTML = battlePanel()
  wireBattle()
}

/** One turn, or one of the out-of-turn actions the bot accepts. */
async function battleAct(payload, label = '', type = '') {
  if (battleBusy) return
  battleBusy = true
  for (const btn of $$('[data-pb-move], [data-pb-catch], [data-pb-run], #pbItem, #pbSwitch')) btn.disabled = true
  // Attack, catch and item all lunge; running and switching do not.
  if (payload.action === 'move' || payload.action === 'catch' || payload.action === 'item') fxAttack(type)
  try {
    const out = await api.pokemonAct(payload)
    if (label) battleLog = [label, ...battleLog].slice(0, 8)
    await applyBattle(out)
  } catch (err) {
    toast(err?.message ?? 'That action failed', 'err')
    await loadPokemon()
  } finally {
    battleBusy = false
  }
}

function wireBattle() {
  const host = $('#monBattle')
  if (!host) return

  for (const btn of $$('[data-pb-move]', host)) {
    btn.onclick = () => battleAct(
      { action: 'move', index: Number(btn.dataset.pbMove) },
      '',
      btn.dataset.pbType || '',
    )
  }
  const catchBtn = host.querySelector('[data-pb-catch]')
  if (catchBtn) catchBtn.onclick = () => battleAct({ action: 'catch', itemId: catchBtn.dataset.pbCatch })
  const run = host.querySelector('[data-pb-run]')
  if (run) run.onclick = () => battleAct({ action: 'run' })

  const itemBtn = $('#pbItem', host)
  if (itemBtn) itemBtn.onclick = () => {
    const bag = monData.bag
    openModal(`
      <div class="item-pop">
        <div class="item-pop-head"><h3>Use an item</h3><p class="item-pop-sub">From your Pokémon bag</p></div>
        <div class="item-pop-body">
          <div class="mgr-grid">${bag.map((i, idx) => monItemCard(i, { attrs: `data-pb-use="${attr(String(idx))}"` })).join('')}</div>
        </div>
      </div>`)
    for (const card of $$('[data-pb-use]')) {
      card.onclick = () => {
        const item = bag[Number(card.dataset.pbUse)]
        const itemId = pick(item, ['id', 'itemId', 'key'])
        closeModal()
        battleAct({ action: 'item', itemId: String(itemId ?? '') })
      }
    }
  }

  const switchBtn = $('#pbSwitch', host)
  if (switchBtn) switchBtn.onclick = () => {
    const team = listOf(sideOf(monBattle, 'you'), ['team'])
    openModal(`
      <div class="item-pop">
        <div class="item-pop-head"><h3>Switch</h3><p class="item-pop-sub">Your team</p></div>
        <div class="item-pop-body">
          <div class="mon-grid">${team.map((m, i) => `
            <button type="button" class="mon-card" data-pb-slot="${attr(String(toNum(pick(m, ['slot', 'index']), i + 1)))}">
              <span class="mon-name">${esc(monName(m))}</span>
              <span class="mon-sub">${esc(hpOf(m) ? `${num(hpOf(m).hp)} / ${num(hpOf(m).max)} HP` : monTypes(m) || 'Team member')}</span>
            </button>`).join('')}</div>
        </div>
      </div>`)
    for (const card of $$('[data-pb-slot]')) {
      card.onclick = () => {
        const slot = Number(card.dataset.pbSlot)
        closeModal()
        battleAct({ action: 'switch', slot })
      }
    }
  }
}

/* ── starter ─────────────────────────────────────────────────────────────── */

const starterChoices = () => listOf(monMeta, ['starters', 'starterChoices', 'choices', 'options'])

function starterPicker() {
  const picks = starterChoices()
  return `
    <div class="card mon-starter">
      <div class="sec-head"><h2>Choose a starter</h2></div>
      <p class="subtext">Your first Pokémon comes from the bot's own list - no guessing.</p>
      ${picks.length
        ? `<div class="starter-grid">${picks.map(s => {
          const dex = dexOf({ dexId: pick(s, ['dexId', 'id', 'dexNumber']) })
          const name = cleanText(pick(s, ['name', 'species', 'title']), 'Starter')
          const art = imgOf(s) || monSprite(name) || (dex ? pokemonImageUrl(dex) : '')
          return `
            <button type="button" class="starter-card" data-starter="${attr(String(toNum(pick(s, ['dexId', 'id', 'dexNumber']), '') ?? ''))}">
              <span class="starter-art">${art
                ? `<img src="${attr(art)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
                : `<span class="item-art-ph">${iconSvg('spark', 'inventory-icon')}</span>`}</span>
              <span class="starter-name">${esc(name)}</span>
              <span class="starter-sub">${esc(monTypes(s) || 'Starter')}</span>
            </button>`}).join('')}</div>`
        : emptyState('spark', 'No starters listed', 'The bot hasn’t opened its starter list yet.')}
    </div>`
}

function wireStarter() {
  for (const card of $$('[data-starter]')) {
    card.onclick = async () => {
      const dexId = Number(card.dataset.starter)
      if (!Number.isInteger(dexId) || dexId <= 0) { toast('That starter has no dex id', 'err'); return }
      card.disabled = true
      try {
        await api.pokemonStarter(dexId)
        toast('Starter chosen', 'ok')
        await loadPokemon()
      } catch (err) { card.disabled = false; toast(err?.message ?? 'Could not choose that starter', 'err') }
    }
  }
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
        const species = monSpecies(d)
        const seen = isOwned(pick(d, ['caught', 'owned'])) || pick(d, ['seen']) !== undefined
        return `
          <div class="mon-card is-dex${seen ? '' : ' is-unseen'}">
            <span class="mon-art">${art
              ? `<img src="${attr(art)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
              : species
                ? `<img data-mon-art="${attr(species)}" alt="" loading="lazy" referrerpolicy="no-referrer" hidden>`
                : `<span class="item-art-ph">${iconSvg('spark', 'inventory-icon')}</span>`}</span>
            <span class="mon-name">${esc(monName(d))}</span>
            <span class="mon-sub">${isOwned(pick(d, ['caught', 'owned'])) ? 'Caught' : 'Seen'}</span>
          </div>`}).join('')}</div>`
      : emptyState('inventory', 'Dex is empty', 'Every mon you meet gets logged here.')
  }
  if (monTab === 'bag') {
    // The Pokémon bag is separate from the RPG inventory; this is the only way
    // items cross over, and the bot reports how many actually moved.
    const importBar = `
      <div class="mon-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="monBagImport">${iconSvg('inventory', 'inline-icon')} Import from inventory</button>
      </div>`
    return `${importBar}${monData.bag.length
      ? `<div class="mgr-grid">${monData.bag.map(i => monItemCard(i)).join('')}</div>`
      : emptyState('inventory', 'Bag is empty', 'Poké Balls and potions appear here once you import or buy them.')}`
  }
  if (monTab === 'shop') {
    return monData.shop.length
      ? `<div class="mon-grid">${monData.shop.map(i => `
          <div class="mon-card">
            <span class="mon-art">${itemArt(imgOf(i) || itemIcon(cleanText(pick(i, ['name', 'title']), '')))}</span>
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
  const species = monSpecies(m)
  const level = toNum(pick(m, ['level', 'lvl']), null)
  const held = pick(m, ['heldItem', 'item', 'holding'])
  const heldName = held ? cleanText(typeof held === 'string' ? held : pick(held, ['name', 'title']), '') : ''
  const id = pick(m, ['id', 'monId', 'pokemonId', 'uid', 'key'])

  return `
    <button type="button" class="mon-card" data-mon="${attr(String(id ?? ''))}">
      <span class="mon-art">
        ${art ? `<img src="${attr(art)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
          : species
            ? `<img data-mon-art="${attr(species)}" alt="" loading="lazy" referrerpolicy="no-referrer" hidden>`
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
  const bagImport = $('#monBagImport')
  if (bagImport) bagImport.onclick = async () => {
    bagImport.disabled = true
    try {
      const out = await api.pokemonBagImport()
      const moved = toNum(pick(out, ['moved', 'imported', 'count']), null)
      toast(moved == null ? 'Checked your inventory' : `Imported ${num(moved)} item${moved === 1 ? '' : 's'}`, 'ok')
      await loadPokemon()
    } catch (err) { bagImport.disabled = false; toast(err?.message ?? 'Import failed', 'err') }
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

/** The owned-instance id the party routes use. */
const monId = (m) => String(pick(m, ['id', 'monId', 'pokemonId', 'uid', 'key']) ?? '')

const inParty = (id) => monData.party.some(m => monId(m) === String(id))

/**
 * The party is replaced wholesale, exactly as the route expects: send the ids
 * that should be in it. Six is the bot's cap; if it refuses, the message from
 * the server is the one shown.
 */
async function toggleParty(id) {
  const ids = monData.party.map(monId).filter(Boolean)
  const next = ids.includes(String(id)) ? ids.filter(x => x !== String(id)) : [...ids, String(id)]
  await api.pokemonSetParty(next)
  toast(ids.includes(String(id)) ? 'Removed from party' : 'Added to party', 'ok')
}

async function openMon(id) {
  openModal(skeletonCards(1))
  const out = await api.pokemonMon(id).catch(err => ({ __error: err }))
  if (out?.__error) { openModal(emptyState('warning', 'Pokémon unavailable', out.__error.message ?? '')); return }
  const m = pick(out, ['mon', 'pokemon']) ?? out
  const art = monArt(m)
  const species = monSpecies(m)
  const stats = pick(m, ['stats', 'baseStats'])
  const level = toNum(pick(m, ['level', 'lvl']), null)
  const hp = toNum(pick(m, ['hp', 'currentHp']), null)
  const maxHp = toNum(pick(m, ['maxHp', 'hpMax']), null)

  openModal(`
    <div class="item-sheet">
      <div class="item-sheet-art">
        ${art ? `<img class="item-sheet-img" src="${attr(art)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`
          : species
            ? `<img class="item-sheet-img" data-mon-art="${attr(species)}" alt="" referrerpolicy="no-referrer" hidden>`
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
        <button type="button" class="btn btn-primary btn-sm" data-mon-act="party">${inParty(id) ? 'Remove from party' : 'Add to party'}</button>
      </div>
      <p class="mgr-note">Feeding, evolving, nicknames and held items are handled by the bot in chat.</p>
      ${cleanText(pick(m, ['notes', 'description', 'flavor', 'flavorText'])) ? `<p class="subtext" style="margin-top:12px">${esc(cleanText(pick(m, ['notes', 'description', 'flavor', 'flavorText'])))}</p>` : ''}
    </div>`)

  hydrateMonArt($('#modalBody'))

  for (const btn of $$('[data-mon-act]')) {
    btn.onclick = async () => {
      const act = btn.dataset.monAct
      btn.disabled = true
      try {
        if (act === 'party') await toggleParty(id)
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
