/**
 * app.js — router, shell chrome, and every page controller.
 *
 * Shape: one hash route per <section class="view">, each with a `load()` that
 * fetches and renders. Routes are lazy and cached per session (`loaded`), so
 * flicking between tabs doesn't re-hit the API, while `reload()` exists for
 * the places that must be fresh after a mutation.
 */
import { api, ApiError, onConnectionChange, onAuthLost, hasSession, fileToDataUrl, uploadToImgbb } from './api.js'
import {
  $, $$, esc, attr, num, compact, naira, relTime, duration, titleCase,
  toast, busy, skeletonRows, skeletonCards,
  emptyState, openModal, closeModal, initials, bar, copyText, initMotion, iconSvg,
} from './ui.js'

/** astral's checkmark, used in every `.plan-features` list. */
const CHECK = '<span class="check"><svg class="icon check-icon" viewBox="0 0 24 24"><path d="M4 12l6 6L20 6"/></svg></span>'

/**
 * astral's `.perk-icon` carries its tint inline rather than in the stylesheet,
 * so every card that wants one goes through here and they all match.
 */
const perkIcon = (name = 'spark') =>
  `<div class="perk-icon" style="background:rgb(212 175 55 / 12%);color:var(--gold);">${iconSvg(name)}</div>`

const WHATSAPP_BOT = '923375465038'
const whatsappCommandUrl = (command) =>
  `https://wa.me/${WHATSAPP_BOT}?text=${encodeURIComponent(String(command ?? ''))}`

/* ──────────────────────────────── state ───────────────────────────────── */

const state = {
  me: null,            // serializeSelf payload, or null when signed out
  needsRegistration: false,
  meta: null,
  notes: { items: [], unread: 0 },
  board: 'level',
  // The stacked rows currently drawn in the profile inventory grid, so a slot
  // click can resolve back to its item without a refetch.
  inv: [],
  boardCache: new Map(),
  lbRows: [],
  otp: { phone: null, masked: null, mode: 'login' },
}

const loaded = new Set()

const isSignedIn = () => !!state.me

/* ──────────────────────────────── router ──────────────────────────────── */

const routes = {
  home: { view: 'view-home', title: 'Home', load: loadHome },
  leaderboard: { view: 'view-leaderboard', title: 'Leaderboard', load: loadLeaderboard },
  season: { view: 'view-season', title: 'Season', load: loadSeason },
  // Neither gates on auth — both are browsable signed out, and only the buy
  // buttons route to login. A shop you can't look at without an account is a
  // worse pitch than one you can.
  shop: { view: 'view-shop', title: 'Shop', load: loadShop },
  cards: { view: 'view-cards', title: 'Cards', load: loadCards },
  premium: { view: 'view-premium', title: 'Premium', load: loadPremium },
  profile: { view: 'view-profile', title: 'Profile', load: loadProfile, auth: true },
  settings: { view: 'view-settings', title: 'Settings', load: loadSettings, auth: true },
  login: { view: 'view-login', title: 'Sign in', load: loadAuthMeta },
  signup: { view: 'view-signup', title: 'Join', load: loadAuthMeta },
  404: { view: 'view-404', title: 'Not found' },
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '').split('?')[0]
  const name = raw.split('/')[0] || 'home'
  return Object.prototype.hasOwnProperty.call(routes, name) ? name : '404'
}

let current = null

async function render() {
  let name = parseHash()

  // Guard the signed-in-only pages. Bounce to login rather than showing an
  // empty profile, and remember where they were headed.
  if (routes[name].auth && !isSignedIn()) {
    if (hasSession()) await refreshSession()
    if (!isSignedIn()) {
      pendingRoute = name
      name = 'login'
      toast('Sign in to see that page')
    }
  }

  const route = routes[name]
  current = name

  for (const v of $$('.view')) v.classList.toggle('active', v.id === route.view)
  document.title = route.title

  for (const link of $$('[data-route]')) {
    link.classList.toggle('is-active', link.dataset.route === name)
  }

  closePanel()
  closeDrawer()
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' })

  if (route.load && !loaded.has(name)) {
    loaded.add(name)
    try {
      await route.load()
    } catch (err) {
      loaded.delete(name)
      reportError(err)
    }
  }
}

/** Where to land after a successful sign-in. */
let pendingRoute = null

export function goTo(name) {
  if (location.hash.replace(/^#\/?/, '') === name) return render()
  location.hash = `#/${name === 'home' ? '' : name}`
}

/** Drops a route's cache so the next visit refetches. */
function invalidate(...names) {
  for (const n of names) loaded.delete(n)
}

function reportError(err) {
  if (err instanceof ApiError) {
    if (err.isAuth) return // onAuthLost already handled it
    toast(err.message, 'err')
  } else {
    toast('Something went wrong. Try again.', 'err')
    console.error(err)
  }
}

/* ──────────────────────────── shell chrome ────────────────────────────── */

function closePanel() {
  $('#panel')?.classList.remove('open')
  $('#panelBackdrop')?.classList.remove('open')
  $('#bellBtn')?.setAttribute('aria-expanded', 'false')
}

function togglePanel() {
  const panel = $('#panel')
  if (!panel) return
  const open = panel.classList.toggle('open')
  $('#panelBackdrop')?.classList.toggle('open', open)
  $('#bellBtn')?.setAttribute('aria-expanded', String(open))
  if (open) loadNotifications()
}

function closeDrawer() {
  $('#drawer')?.classList.remove('open')
  $('#scrim')?.classList.remove('open')
  $('#menuToggle')?.setAttribute('aria-expanded', 'false')
}

function toggleDrawer() {
  const open = $('#drawer')?.classList.toggle('open')
  $('#scrim')?.classList.toggle('open', open)
  $('#menuToggle')?.setAttribute('aria-expanded', String(!!open))
}

/** Nav avatar doubles as the sign-in affordance when signed out. */
function paintAvatar() {
  const btn = $('#avatarBtn')
  const inner = $('#avatarInner')
  if (!btn || !inner) return

  if (!isSignedIn()) {
    inner.innerHTML = iconSvg('chat')
    btn.classList.remove('is-premium')
    btn.setAttribute('aria-label', 'Sign in')
    btn.title = 'Sign in'
  } else {
    const p = state.me
    inner.innerHTML = p.avatarUrl
      ? `<img src="${attr(p.avatarUrl)}" alt="">`
      : esc(initials(p.name))
    btn.classList.toggle('is-premium', !!p.premium?.active)
    btn.setAttribute('aria-label', `${p.name} — your profile`)
    btn.title = `${p.name} · Lv ${p.level}`
  }

  const drawerAuth = $('#drawerAuth')
  if (drawerAuth) {
    drawerAuth.textContent = isSignedIn() ? 'Sign out' : 'Sign in'
    drawerAuth.dataset.route = isSignedIn() ? '' : 'login'
    drawerAuth.href = isSignedIn() ? '#' : '#/login'
  }

  // The footer's Account column had a hardcoded "Sign in" that nothing ever
  // touched, so it kept inviting you to sign in while you were already signed
  // in. Same treatment as the drawer link — one auth affordance, one state.
  // Setting dataset.route to '' leaves the attribute in place, so the
  // delegated a[data-route] handler still sees it and can route the click to
  // signOut() instead of navigating.
  const footerAuth = $('#footerAuth')
  if (footerAuth) {
    footerAuth.textContent = isSignedIn() ? 'Sign out' : 'Sign in'
    footerAuth.dataset.route = isSignedIn() ? '' : 'login'
    footerAuth.href = isSignedIn() ? '#' : '#/login'
  }

  // Footer CTA is a sign-up pitch to strangers and a shortcut for players.
  const footerCta = $('#footerCta')
  if (footerCta) {
    footerCta.textContent = isSignedIn() ? 'Open your profile' : 'Start playing'
    footerCta.dataset.route = isSignedIn() ? 'profile' : 'signup'
    footerCta.href = isSignedIn() ? '#/profile' : '#/signup'
  }

  const heroPlay = $('#heroPlay')
  if (heroPlay) {
    heroPlay.textContent = isSignedIn() ? 'Open your profile' : 'Start playing'
    heroPlay.href = isSignedIn() ? '#/profile' : '#/signup'
  }
}

function paintBell() {
  const dot = $('#bellDot')
  if (dot) dot.classList.toggle('is-on', (state.notes.unread ?? 0) > 0)
}

/* ───────────────────────────── notifications ──────────────────────────── */

const NOTE_ICONS = {
  battle: 'battle', reward: 'reward', season: 'season', premium: 'premium', payment: 'payment',
  security: 'security', system: 'info', daily: 'calendar', stamina: 'stamina', dungeon: 'dungeon',
}

function noteIcon(kind) { return iconSvg(NOTE_ICONS[kind] ?? 'info', 'note-icon') }

async function loadNotifications() {
  const body = $('#panelBody')
  if (!body) return

  if (!isSignedIn() && !hasSession()) {
    body.innerHTML = emptyState('alert', 'Sign in for alerts',
      'Your dungeon runs, rewards and payments all report here.') +
      `<div style="padding:0 6px 6px"><a class="btn btn-primary btn-block" href="#/login">Sign in</a></div>`
    return
  }

  if (!body.dataset.filled) body.innerHTML = skeletonRows(4)

  try {
    const out = await api.notifications()
    state.notes = { items: out.items ?? [], unread: out.unread ?? 0 }
    paintBell()
    paintNotifications()
  } catch (err) {
    body.innerHTML = emptyState('warning', "Couldn't load alerts", err?.message ?? '')
  }
}

function paintNotifications() {
  const body = $('#panelBody')
  if (!body) return
  const items = state.notes.items ?? []
  body.dataset.filled = '1'

  if (!items.length) {
    body.innerHTML = emptyState('moon', 'Nothing waiting', 'You are all caught up.')
    return
  }

  body.innerHTML = items.map(n => {
    // Derived alerts can't be dismissed — they clear themselves once the
    // underlying thing is dealt with, so offering an X would be a lie.
    const sev = n.severity && n.severity !== 'info' ? ` sev-${esc(n.severity)}` : ''
    const unread = !n.read ? ' is-unread' : ''
    return `
      <div class="note${sev}${unread}" data-note="${attr(n.id)}" data-derived="${n.derived ? '1' : ''}">
        <span class="note-i">${noteIcon(n.kind)}</span>
        <div class="note-main">
          <div class="note-t">${esc(n.title)}</div>
          <div class="note-b">${esc(n.body)}</div>
          <div class="note-time">${n.derived ? 'Needs attention' : esc(relTime(n.at))}</div>
        </div>
        ${n.derived ? '' : `<button class="note-x" data-del="${attr(n.id)}" aria-label="Dismiss">×</button>`}
      </div>`
  }).join('')
}

async function markAllRead() {
  const stop = busy($('#readAllBtn'))
  try {
    await api.markAllNotificationsRead()
    // Everything the user can see gets marked read — including derived alerts,
    // which the server now acknowledges by signature so they don't come back
    // unread on the next poll. The alert itself stays in the list (the work is
    // still outstanding), it just stops lighting the bell.
    for (const n of state.notes.items) n.read = true
    state.notes.unread = 0
    paintBell()
    paintNotifications()
  } catch (err) { reportError(err) } finally { stop() }
}

async function clearNotes() {
  const stop = busy($('#clearNotesBtn'))
  try {
    await api.clearNotifications()
    state.notes.items = state.notes.items.filter(n => n.derived)
    state.notes.unread = state.notes.items.filter(n => !n.read && n.severity !== 'info').length
    paintBell()
    paintNotifications()
    toast('History cleared', 'ok')
  } catch (err) { reportError(err) } finally { stop() }
}

async function deleteNote(id) {
  try {
    await api.deleteNotification(id)
    state.notes.items = state.notes.items.filter(n => n.id !== id)
    paintNotifications()
  } catch (err) { reportError(err) }
}

/* ──────────────────────────────── session ─────────────────────────────── */

async function refreshSession() {
  try {
    const out = await api.session()
    state.me = out?.player ?? null
    state.needsRegistration = !!out?.needsRegistration
  } catch {
    // A boot-time failure here shouldn't block the public pages.
    state.me = null
  }
  paintAvatar()
  return state.me
}

async function afterSignIn(player, { needsRegistration = false } = {}) {
  state.me = player ?? null
  state.needsRegistration = needsRegistration

  if (needsRegistration) {
    await loadRegisterOptions()
    showStep('signup', 3)
    goTo('signup')
    toast('Number verified — build your character', 'ok')
    return
  }

  paintAvatar()
  invalidate('profile', 'leaderboard', 'season', 'premium', 'settings')
  loadNotifications()

  const next = pendingRoute ?? 'profile'
  pendingRoute = null
  goTo(next)
  toast(`Welcome back, ${player?.name ?? 'traveller'}`, 'ok')
}

/**
 * A yes/no modal built on the existing #modal shell. Resolves true only on
 * the confirm button — closing by scrim, X or Escape resolves false, which is
 * why this listens for the modal losing `.open` rather than trusting the
 * buttons to be the only exit.
 */
function confirmAction({ title, body, confirmLabel = 'Confirm', danger = true }) {
  return new Promise((resolve) => {
    openModal(`
      <div class="pd-body" style="padding-top:22px">
        <h3 style="margin-bottom:8px">${esc(title)}</h3>
        <p class="subtext" style="margin-bottom:20px">${esc(body)}</p>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" id="confirmYes">
          ${esc(confirmLabel)}
        </button>
        <button class="btn btn-ghost btn-block" id="confirmNo" style="margin-top:8px">Cancel</button>
      </div>`)

    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      observer.disconnect()
      resolve(value)
    }

    // Catches every dismissal path at once — scrim click, X, and Escape all
    // funnel through closeModal() removing `.open`.
    const modal = $('#modal')
    const observer = new MutationObserver(() => {
      if (!modal?.classList.contains('open')) finish(false)
    })
    if (modal) observer.observe(modal, { attributes: true, attributeFilter: ['class'] })

    $('#confirmYes')?.addEventListener('click', () => { closeModal(); finish(true) })
    $('#confirmNo')?.addEventListener('click', () => { closeModal(); finish(false) })
  })
}

async function signOut() {
  // Opt-out guard from Settings → This device. Covers every entry point —
  // the drawer, the footer, and the settings page's own button — so the
  // preference means the same thing wherever you signed out from.
  if (localPrefs().confirmSignOut) {
    const ok = await confirmAction({
      title: 'Sign out?',
      body: 'You will need a fresh code from the bot to sign back in.',
      confirmLabel: 'Sign out',
    })
    if (!ok) return
  }

  try { await api.logout() } catch {}
  state.me = null
  state.needsRegistration = false
  state.notes = { items: [], unread: 0 }
  loaded.clear()
  paintAvatar()
  paintBell()
  const body = $('#panelBody')
  if (body) delete body.dataset.filled
  goTo('home')
  toast('Signed out', 'ok')
}

/* ────────────────────────────── auth: shared ──────────────────────────── */

/** Swaps which `.auth-step` is visible for login/signup. */
function showStep(mode, step) {
  const total = mode === 'signup' ? 3 : 2
  for (let i = 1; i <= total; i++) {
    const el = document.getElementById(`${mode}Step${i}`)
    el?.classList.toggle('active', i === step)
  }
}

function fieldError(fieldId, errId, message) {
  const field = document.getElementById(fieldId)
  const err = document.getElementById(errId)
  if (err) err.textContent = message ?? ''
  field?.classList.toggle('has-err', !!message)
}

/** Wires the 6 boxes: auto-advance, backspace, paste-a-whole-code, Enter. */
function wireOtpRow(rowId, onComplete) {
  const row = document.getElementById(rowId)
  if (!row) return
  const boxes = [...row.querySelectorAll('input')]

  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(0, 1)
      box.classList.toggle('is-filled', !!box.value)
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus()
      if (boxes.every(b => b.value)) onComplete?.()
    })

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        boxes[i - 1].focus()
        boxes[i - 1].value = ''
        boxes[i - 1].classList.remove('is-filled')
        e.preventDefault()
      }
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus()
      if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus()
      if (e.key === 'Enter') { e.preventDefault(); onComplete?.() }
    })

    // Pasting the code from the WhatsApp message is the common path — spread
    // it across the boxes instead of dropping 6 digits into the first one.
    box.addEventListener('paste', (e) => {
      const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 6)
      if (!digits) return
      e.preventDefault()
      boxes.forEach((b, j) => {
        b.value = digits[j] ?? ''
        b.classList.toggle('is-filled', !!b.value)
      })
      boxes[Math.min(digits.length, 5)].focus()
      if (digits.length === 6) onComplete?.()
    })
  })
}

function readOtp(rowId) {
  const row = document.getElementById(rowId)
  return [...(row?.querySelectorAll('input') ?? [])].map(b => b.value).join('')
}

function clearOtp(rowId) {
  const row = document.getElementById(rowId)
  for (const b of row?.querySelectorAll('input') ?? []) {
    b.value = ''
    b.classList.remove('is-filled')
  }
  row?.querySelector('input')?.focus()
}

/**
 * Requests a code. Shared by login and signup — the only difference is which
 * step markup gets shown afterwards.
 */
async function sendOtp(mode, phone, btn) {
  const fieldId = `${mode}PhoneField`
  const errId = `${mode}PhoneErr`
  fieldError(fieldId, errId, null)

  if (!phone || phone.replace(/\D/g, '').length < 8) {
    fieldError(fieldId, errId, 'Enter a valid WhatsApp number.')
    return
  }

  const stop = busy(btn)
  try {
    const out = await api.requestOtp(phone)
    state.otp = { phone, masked: out.maskedPhone ?? phone, mode, registered: !!out.registered }

    const sentTo = document.getElementById(`${mode}SentTo`)
    if (sentTo) {
      sentTo.innerHTML = `Code sent to <strong>${esc(out.maskedPhone ?? phone)}</strong> — it expires ${esc(relTime(out.expiresAt))}.`
    }

    // The API's own words, which the bot echoes in the DM.
    toast(out.message ?? 'OTP has been sent to your DM', 'ok')
    showStep(mode, 2)
    clearOtp(mode === 'signup' ? 'signupOtpRow' : 'otpRow')

    // Local testing convenience only; the API omits this unless DEV_MODE is on.
    if (out.devCode) toast(`Dev code: ${out.devCode}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 429 && err.retryAfterMs) {
      fieldError(fieldId, errId, `${err.message}`)
    } else {
      fieldError(fieldId, errId, err?.message ?? 'Could not send the code.')
    }
    reportError(err)
  } finally { stop() }
}

async function submitOtp(mode, btn) {
  const rowId = mode === 'signup' ? 'signupOtpRow' : 'otpRow'
  const errId = mode === 'signup' ? 'signupOtpErr' : 'otpErr'
  const errEl = document.getElementById(errId)
  const code = readOtp(rowId)

  if (errEl) errEl.textContent = ''
  if (code.length !== 6) {
    if (errEl) errEl.textContent = 'Enter all six digits.'
    return
  }
  if (!state.otp.phone) {
    if (errEl) errEl.textContent = 'Request a new code first.'
    return
  }

  const stop = busy(btn)
  try {
    const out = await api.verifyOtp(state.otp.phone, code)
    await afterSignIn(out.player, { needsRegistration: !!out.needsRegistration })
  } catch (err) {
    if (errEl) errEl.textContent = err?.message ?? 'Verification failed.'
    clearOtp(rowId)
  } finally { stop() }
}

/* ─────────────────────────── auth: page loaders ───────────────────────── */

/** Fills the bot-number card and the class/race selects from /api/meta. */
async function loadAuthMeta() {
  const meta = await ensureMeta()
  if (!meta) return

  const card = $('#signupBotCard')
  if (card && meta.botNumber) {
    const wa = `https://wa.me/${String(meta.botNumber).replace(/\D/g, '')}?text=${encodeURIComponent(meta.prefix + 'menu')}`
    card.innerHTML = `
      ${perkIcon('chat')}
      <h4>Step one: say hi to the bot</h4>
      <p style="margin-bottom:14px">WhatsApp only lets the bot DM you once you've messaged it, so the code can't arrive until you do.</p>
      <a class="btn btn-primary btn-sm" href="${attr(wa)}" target="_blank" rel="noopener">
        Message +${esc(String(meta.botNumber).replace(/\D/g, ''))}
      </a>`
  } else if (card) {
    card.innerHTML = `${perkIcon('chat')}<h4>Step one: message the bot</h4>
      <p>Send the bot any message on WhatsApp first — it can only DM you back after that.</p>`
  }

  const cmd = $('#regCmd')
  if (cmd) cmd.textContent = `${meta.prefix}register`

  await loadRegisterOptions()
}

let optionsFilled = false

async function loadRegisterOptions() {
  const meta = await ensureMeta()
  if (!meta || optionsFilled) return
  const classSel = $('#regClass')
  const raceSel = $('#regRace')
  if (!classSel || !raceSel) return

  classSel.innerHTML = (meta.classes ?? [])
    .map(c => `<option value="${attr(c.id)}">${esc(c.name ?? titleCase(c.id))}</option>`).join('')
  raceSel.innerHTML = (meta.races ?? [])
    .map(r => `<option value="${attr(r.id)}">${esc(r.name ?? titleCase(r.id))}</option>`).join('')

  const describe = (list, sel, hintId) => {
    const hint = document.getElementById(hintId)
    const paint = () => {
      const found = (list ?? []).find(x => x.id === sel.value)
      if (hint) hint.textContent = found?.description ?? found?.bonusText ?? ''
    }
    sel.addEventListener('change', paint)
    paint()
  }
  describe(meta.classes, classSel, 'regClassHint')
  describe(meta.races, raceSel, 'regRaceHint')
  optionsFilled = true
}

async function submitRegistration(btn) {
  const name = $('#regName')?.value?.trim()
  fieldError('regNameField', 'regNameErr', null)
  if (!name) {
    fieldError('regNameField', 'regNameErr', 'Pick a character name.')
    return
  }

  const stop = busy(btn)
  try {
    const out = await api.register({
      name,
      classId: $('#regClass')?.value,
      raceId: $('#regRace')?.value,
    })
    state.needsRegistration = false
    state.me = out.player ?? await api.me().then(r => r.player).catch(() => null)
    paintAvatar()
    invalidate('profile', 'leaderboard', 'season', 'premium', 'settings')
    loadNotifications()
    goTo('profile')
    toast(`Welcome to Astral, ${state.me?.name ?? name}`, 'ok')
  } catch (err) {
    fieldError('regNameField', 'regNameErr', err?.message ?? 'Could not create the character.')
    reportError(err)
  } finally { stop() }
}

/* ────────────────────────────────── meta ──────────────────────────────── */

let metaPromise = null

/** /api/meta drives labels, class/race lists and board tabs — fetched once. */
function ensureMeta() {
  if (state.meta) return Promise.resolve(state.meta)
  metaPromise ??= api.meta()
    .then(out => { state.meta = out; return out })
    .catch(err => { metaPromise = null; reportError(err); return null })
  return metaPromise
}

/* ─────────────────────────────── page: home ───────────────────────────── */

/**
 * Only WhatsApp is live. Discord and Telegram tabs exist so people know
 * they're coming, but selecting them swaps the hero into a "coming soon"
 * state instead of a play button — there's no bot to message yet.
 */
const PLATFORMS = {
  whatsapp: {
    label: 'WhatsApp',
    live: true,
    sub: 'Message the bot on WhatsApp, make a character, and start clearing floors.',
  },
  discord: {
    label: 'Discord',
    live: false,
    sub: 'Astral on Discord is on the way — the WhatsApp bot is live right now if you want to start today.',
  },
  telegram: {
    label: 'Telegram',
    live: false,
    sub: 'Astral on Telegram is on the way — the WhatsApp bot is live right now if you want to start today.',
  },
}

function setHeroPlatform(key) {
  const platform = PLATFORMS[key] ?? PLATFORMS.whatsapp
  $$('.platform-tab').forEach(tab => {
    const active = tab.dataset.platform === key
    tab.classList.toggle('is-active', active)
    tab.setAttribute('aria-selected', String(active))
  })

  const name = $('#heroPlatformName')
  if (name) name.textContent = platform.label

  const sub = $('#heroSub')
  if (sub) sub.textContent = platform.sub

  const actions = $('#heroActions')
  if (actions) {
    actions.innerHTML = platform.live
      ? `<a class="btn btn-primary" id="heroPlay" href="#/signup">
           <svg class="icon" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/></svg> Start playing
         </a>
         <a class="btn btn-secondary" href="#/leaderboard" data-route="leaderboard">
           <svg class="icon" viewBox="0 0 24 24"><path d="M4 20h16M7 20v-7M12 20V6M17 20v-11"/></svg> See the boards
         </a>`
      : `<span class="btn btn-secondary" style="pointer-events:none;opacity:.75;">Coming soon</span>
         <a class="btn btn-primary" href="#/signup">
           <svg class="icon" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/></svg> Play on WhatsApp instead
         </a>`
  }
}

function wirePlatformSwitch() {
  $('#platformSwitch')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.platform-tab')
    if (!tab) return
    setHeroPlatform(tab.dataset.platform)
  })
}

async function loadHome() {
  const statsHost = $('#homeStats')
  const boardHost = $('#homeBoard')
  if (statsHost) statsHost.innerHTML = skeletonCards(4)
  if (boardHost) boardHost.innerHTML = skeletonRows(5)

  paintHomeStatic()

  const [meta, stats, board] = await Promise.all([
    ensureMeta(),
    api.stats().catch(err => { reportError(err); return null }),
    api.leaderboard('level', 5).catch(() => null),
  ])

  if (meta) {
    const sub = $('#heroSub')
    const activePlatform = $('.platform-tab.is-active')?.dataset.platform ?? 'whatsapp'
    if (sub && meta.botName && activePlatform === 'whatsapp') {
      sub.innerHTML = `Message <strong>${esc(meta.botName)}</strong> on WhatsApp, make a character with <code>${esc(meta.prefix)}register</code>, and start clearing floors.`
    }
    const support = $('#footerSupport')
    if (support && meta.supportGroupLink) {
      support.href = meta.supportGroupLink
      support.hidden = false
      support.target = '_blank'
      support.rel = 'noopener'
    }
    const note = $('#footerNote')
    if (note) note.textContent = meta.season?.name ? `Season ${meta.season.number}: ${meta.season.name}` : 'Play it on WhatsApp.'
  }

  if (stats && statsHost) {
    const cards = [
      ['Players', num(stats.players), stats.newThisWeek ? `+${num(stats.newThisWeek)} this week` : 'Adventurers registered'],
      ['Commands today', num(stats.commandsToday), stats.botsOnline ? `${stats.botsOnline} bot${stats.botsOnline === 1 ? '' : 's'} online` : 'Across every chat'],
      ['Highest level', num(stats.highestLevel), `Deepest floor ${num(stats.deepestFloor)}`],
      ['Dungeons cleared', num(stats.dungeonsConquered), `${num(stats.charactersAvailable)} characters to collect`],
    ]
    statsHost.innerHTML = cards.map(([k, v, sub], i) => `
      <div class="stat-pill">
        <div class="label">${esc(k)}</div>
        <div class="value${i === 0 ? ' gold' : ' acc'}">${esc(v)}</div>
        <div class="subtext" style="margin-top:4px;">${esc(sub)}</div>
      </div>`).join('')
  }

  if (stats) {
    const chips = $('#heroChips')
    if (chips) {
      const bits = [`${num(stats.players)} players`, `${num(stats.charactersAvailable)} characters`]
      if (stats.season?.name) bits.push(`Season ${stats.season.number}`)
      if (stats.season?.endsAt) bits.push(`${duration(stats.season.endsAt - Date.now())} left`)
      chips.innerHTML = bits.map(b => `<span class="chip">${esc(b)}</span>`).join('')
    }
  }

  if (boardHost) {
    boardHost.innerHTML = board?.rows?.length
      ? board.rows.map(rowHtml).join('')
      : emptyState('rank', 'No one on the board yet', 'Be the first to register.')
  }
}

function paintHomeStatic() {
  const steps = $('#homeSteps')
  const prefix = state.meta?.prefix ?? '.'
  if (steps) {
    steps.innerHTML = [
      ['chat', 'Message the bot', `Open WhatsApp and send <code>${esc(prefix)}menu</code>. No download, no account.`],
      ['character', 'Make your hero', `Pick a class and race with <code>${esc(prefix)}register</code>, then spend your 15 stat points.`],
      ['battle', 'Climb and rank', `Fight through floors, take on other players, and push up the boards each season.`],
    ].map(([i, t, b]) => `
      <div class="perk-card reveal">
        ${perkIcon(i)}
        <h4>${esc(t)}</h4>
        <p>${b}</p>
      </div>`).join('')
  }

  const faq = $('#homeFaq')
  if (faq) {
    faq.innerHTML = [
      ['Do I need to install anything?', 'No. Astral runs entirely through WhatsApp messages — the website is just for browsing your profile and the boards.'],
      ['Is it free?', `Yes. Premium and gems are optional and only add cosmetics, boosts and battle-pass rewards.`],
      ['How do I sign in here?', "Enter your WhatsApp number and the bot DMs you a 6-digit code from its own number. You'll need to have messaged the bot at least once first."],
      ['Can I play in a group chat?', `Yes — most commands work in groups. Use <code>${esc(prefix)}menu</code> to see what's available.`],
    ].map(([q, a]) => `
      <div class="faq-item">
        <div class="faq-q"><span>${esc(q)}</span><span class="arrow">+</span></div>
        <div class="faq-a"><p>${a}</p></div>
      </div>`).join('')
  }
}

/* ───────────────────────────── page: leaderboard ──────────────────────── */

function rowHtml(r) {
  const rankClass = r.position <= 3 ? ` top${r.position}` : ''
  const you = state.me && r.uid === state.me.uid ? ' is-you' : ''
  const medal = r.position <= 3
    ? iconSvg('rank', 'lb-medal')
    : r.position
  return `
    <button class="lb-row${you}" data-uid="${attr(r.uid)}">
      <span class="lb-rank${rankClass}">${typeof medal === 'string' ? medal : esc(medal)}</span>
      <span class="lb-avatar">${r.avatarUrl
        ? `<img src="${attr(r.avatarUrl)}" alt="" loading="lazy">`
        : esc(initials(r.name))}</span>
      <span class="lb-name">${esc(r.name)}${r.premium ? ' <span class="badge badge-gold">Premium</span>' : ''}
      <span class="sub">${esc(r.rank?.title ?? '')} · Lv ${num(r.level)}${
          r.classId ? ' · ' + esc(titleCase(r.classId)) : ''}${
          r.character?.name ? ' · ' + esc(r.character.name) : ''}</span>
      </span>
      <span class="lb-score">${esc(r.display)}</span>
    </button>`
}

async function loadLeaderboard() {
  const meta = await ensureMeta()
  const tabs = $('#lbTabs')
  if (tabs && meta?.boards) {
    tabs.innerHTML = meta.boards.map(b => `
      <button class="tab-btn${b.id === state.board ? ' active' : ''}" data-board="${attr(b.id)}" role="tab">
        ${esc(b.label)}
      </button>`).join('')
  }
  await showBoard(state.board)
}

async function showBoard(key, { force = false } = {}) {
  state.board = key
  for (const t of $$('#lbTabs .tab-btn')) t.classList.toggle('active', t.dataset.board === key)

  const list = $('#lbList')
  const youCard = $('#lbYou')
  if (!list) return

  if (force) state.boardCache.delete(key)
  if (!state.boardCache.has(key)) list.innerHTML = skeletonRows(8)

  let data = state.boardCache.get(key)
  if (!data) {
    try {
      data = await api.leaderboard(key, 100)
      state.boardCache.set(key, data)
    } catch (err) {
      list.innerHTML = emptyState('warning', "Couldn't load the board", err?.message ?? '')
      return
    }
  }

  state.lbRows = data.rows ?? []
  const total = $('#lbTotal')
  if (total) {
    total.textContent = data.total
      ? `${num(data.total)} ranked on ${data.label}${data.rows.length < data.total ? ` — showing the top ${data.rows.length}` : ''}`
      : `Nobody has made the ${data.label} board yet.`
  }

  // Your own standing, even when you're outside the top 100.
  if (youCard) {
    if (data.you) {
      youCard.style.display = ''
      youCard.innerHTML = `
        <div class="stat-pill"><div class="label">Your position</div><div class="value gold">#${num(data.you.position)}</div></div>
        <div class="stat-pill"><div class="label">Out of</div><div class="value acc">${num(data.you.of)}</div></div>
        <div class="stat-pill"><div class="label">${esc(data.unit)}</div><div class="value acc">${num(data.you.score)}</div></div>`
    } else {
      youCard.style.display = 'none'
    }
  }

  paintBoardRows(state.lbRows)
  const search = $('#lbSearch')
  if (search?.value) filterBoard(search.value)
}

function paintBoardRows(rows) {
  const list = $('#lbList')
  if (!list) return
  list.innerHTML = rows.length
    ? rows.map(rowHtml).join('')
    : emptyState('rank', 'Nothing here yet', 'Play a few rounds and this board fills up.')
}

function filterBoard(query) {
  const q = query.trim().toLowerCase()
  if (!q) return paintBoardRows(state.lbRows)
  const hits = state.lbRows.filter(r => String(r.name).toLowerCase().includes(q))
  const list = $('#lbList')
  if (!list) return
  list.innerHTML = hits.length
    ? hits.map(rowHtml).join('')
    : emptyState('info', 'No match', `Nobody on this board is called "${query.trim()}".`)
}

/* ─────────────────────── player detail (modal) ────────────────────────── */

const BOARD_LABELS = {
  level: 'Level', floor: 'Deepest Floor', season: 'Battle Pass',
  fame: 'Fame', wealth: 'Wealth', wins: 'PvP Wins',
}

/** Tapping a leaderboard row: that player's stats + their public alerts. */
async function openPlayer(uid) {
  openModal(`<div style="padding:6px">${skeletonRows(4)}</div>`)
  try {
    const out = await api.player(uid)
    openModal(playerDetailHtml(out))
  } catch (err) {
    openModal(emptyState('warning', 'Player unavailable', err?.message ?? 'That profile could not be loaded.'))
  }
}

function playerDetailHtml({ player: p, rankings, isSelf }) {
  const alerts = p.alerts ?? []

  const statRows = [
    ['STR', p.stats.str], ['AGI', p.stats.agi], ['INT', p.stats.int],
    ['DEF', p.stats.def], ['LCK', p.stats.lck],
  ].map(([k, v]) => `
    <div class="pd-stat"><div class="pd-stat-k">${k}</div><div class="pd-stat-v">${num(v)}</div></div>`).join('')

  const ranked = Object.entries(rankings ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `
      <div class="pd-stat">
        <div class="pd-stat-k">${esc(BOARD_LABELS[k] ?? titleCase(k))}</div>
        <div class="pd-stat-v">#${num(v.position)}<span style="font-size:12px;color:var(--text-subtle)"> / ${num(v.of)}</span></div>
      </div>`).join('')

  return `
    <div class="pd-banner"${p.bannerUrl ? ` style="background-image:url('${attr(p.bannerUrl)}')"` : ''}></div>

    <div class="pd-head">
      <div class="pd-avatar">${p.avatarUrl
        ? `<img src="${attr(p.avatarUrl)}" alt="">`
        : esc(initials(p.name))}</div>
      <div class="pd-id">
        <div class="pd-name-row">
          <h3>${esc(p.name)}</h3>
          <div class="pd-badges">
            ${isSelf ? '<span class="badge badge-lvl">You</span>' : ''}
            ${p.premium?.active ? '<span class="badge badge-gold">Premium</span>' : ''}
          </div>
        </div>
        <p class="pd-sub">${iconSvg('rank', 'inline-icon')} ${esc(p.rank.title)} · ${esc(p.rank.epithet ?? '')}</p>
        <p class="subtext">Lv ${num(p.level)}${p.classId ? ' · ' + esc(titleCase(p.classId)) : ''}${
          p.raceId ? ' · ' + esc(titleCase(p.raceId)) : ''}</p>
        ${p.bio ? `<p class="pd-sub" style="margin-top:7px">"${esc(p.bio)}"</p>` : ''}
      </div>
    </div>

    <div class="pd-body">
      ${bar(p.xpProgress.maxed ? 'XP (maxed)' : `XP to Lv ${num(p.level + 1)}`,
            p.xpProgress.intoLevel, p.xpProgress.forLevel || 1)}
      ${bar('HP', p.hp, p.maxHp || 1)}
      ${p.maxMp ? bar('MP', p.mp, p.maxMp) : ''}

      <div class="pd-sec-title">Stats</div>
      <div class="pd-stats">${statRows}</div>

      <div class="pd-sec-title">Standing</div>
      <div class="pd-stats">
        <div class="pd-stat"><div class="pd-stat-k">Fame</div><div class="pd-stat-v">${esc(p.fame.formatted ?? num(p.fame.value))}</div></div>
        <div class="pd-stat"><div class="pd-stat-k">PvP</div><div class="pd-stat-v">${num(p.record.wins)}W ${num(p.record.losses)}L</div></div>
        <div class="pd-stat"><div class="pd-stat-k">Deepest floor</div><div class="pd-stat-v">${num(p.dungeon.deepestFloor)}</div></div>
        <div class="pd-stat"><div class="pd-stat-k">Conquered</div><div class="pd-stat-v">${num(p.dungeon.conquered)}</div></div>
      </div>

      ${ranked ? `<div class="pd-sec-title">Rankings</div><div class="pd-stats">${ranked}</div>` : ''}

      ${p.equippedCharacter ? `
        <div class="pd-sec-title">Equipped character</div>
        <div class="card" style="display:flex;gap:12px;align-items:center">
          ${p.equippedCharacter.image
            ? `<img src="${attr(p.equippedCharacter.image)}" alt="" style="width:52px;height:52px;border-radius:var(--r);object-fit:cover">`
            : iconSvg('character', 'character-placeholder')}
          <div style="min-width:0">
            <strong>${esc(p.equippedCharacter.name)}</strong>
            <p class="subtext">${esc(p.equippedCharacter.rarity ? titleCase(p.equippedCharacter.rarity) : '')}${
              p.equippedCharacter.ability ? ' · ' + esc(p.equippedCharacter.ability) : ''}</p>
          </div>
        </div>` : ''}

      <div class="pd-sec-title">Alerts</div>
      ${alerts.length ? alerts.map(a => `
        <div class="alert-item${a.severity && a.severity !== 'info' ? ' sev-' + esc(a.severity) : ''}">
          <span class="note-i">${noteIcon(a.kind)}</span>
          <div>
            <div class="alert-t">${esc(a.title)}</div>
            <div class="alert-b">${esc(a.body)}</div>
          </div>
        </div>`).join('')
        : `<p class="subtext">Nothing public to report right now.</p>`}

      <p class="subtext" style="margin-top:18px">Playing since ${esc(
        p.registeredAt ? new Date(p.registeredAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'a while back')}</p>
    </div>`
}

/* ───────────────────────── character detail modal ─────────────────────── */

/**
 * The Characters *page* is gone, but this modal isn't page-bound — it's opened
 * from any [data-char] element, which today means the equipped-character card
 * on the profile. /api/characters/:id still backs it.
 */
async function openCharacter(id) {
  openModal(`<div style="padding:6px">${skeletonRows(3)}</div>`)
  try {
    const { character: c, owned, equipped, wielders, wielderCount } = await api.character(id)
    const bonuses = Object.entries(c.statBonuses ?? {})
      .map(([k, v]) => `<div class="pd-stat"><div class="pd-stat-k">${esc(k.toUpperCase())}</div><div class="pd-stat-v">+${num(v)}</div></div>`)
      .join('')

    openModal(`
      ${c.image ? `<div class="pd-banner" style="background-image:url('${attr(c.image)}')"></div>` : ''}
      <div class="pd-head">
        <div class="pd-avatar">${iconSvg('character', 'character-placeholder')}</div>
        <div class="pd-id">
          <h3>${esc(c.name)}
            ${equipped ? '<span class="badge badge-gold">Equipped</span>' : owned ? '<span class="badge badge-lvl">Owned</span>' : ''}</h3>
          <p class="pd-sub">${esc(c.rarity ? titleCase(c.rarity) : '')}${c.characterTier ? ` · Tier ${esc(c.characterTier)}` : ''}</p>
          ${c.gemPrice ? `<p class="subtext">${num(c.gemPrice)} gems</p>` : ''}
        </div>
      </div>
      <div class="pd-body">
        ${c.description ? `<p class="subtext">${esc(c.description)}</p>` : ''}
        ${c.ability ? `<div class="pd-sec-title">Ability</div><p class="subtext">${esc(c.ability)}</p>` : ''}
        ${bonuses ? `<div class="pd-sec-title">Stat bonuses</div><div class="pd-stats">${bonuses}</div>` : ''}
        <div class="pd-sec-title">Wielded by ${num(wielderCount ?? 0)} player${wielderCount === 1 ? '' : 's'}</div>
        ${wielders?.length ? `<div class="lb-list">${wielders.map((w, i) => `
          <button class="lb-row" data-uid="${attr(w.uid)}">
            <span class="lb-rank">${i + 1}</span>
            <span class="lb-avatar">${w.avatarUrl ? `<img src="${attr(w.avatarUrl)}" alt="" loading="lazy">` : esc(initials(w.name))}</span>
            <span class="lb-name">${esc(w.name)}<span class="sub">Lv ${num(w.level)}</span></span>
            <span class="lb-score">›</span>
          </button>`).join('')}</div>`
          : `<p class="subtext">Nobody has this equipped yet.</p>`}
      </div>`)
  } catch (err) {
    openModal(emptyState('warning', 'Character unavailable', err?.message ?? ''))
  }
}

/**
 * Item detail, opened from an inventory slot.
 *
 * Everything shown is already in the stacked row `/api/me` sent, so unlike
 * openCharacter() this needs no fetch and no skeleton — the modal is populated
 * in one call, which also sidesteps the double-openModal focus bug entirely.
 */
function openItem(item) {
  if (!item) return
  const bonuses = Object.entries(item.statBonuses ?? {})
    .map(([k, v]) => `<div class="pd-stat"><div class="pd-stat-k">${esc(k.toUpperCase())}</div><div class="pd-stat-v">${v > 0 ? '+' : ''}${num(v)}</div></div>`)
    .join('')

  openModal(`
    <div class="pd-head">
      <div class="pd-avatar">${item.image
        ? `<img src="${attr(item.image)}" alt="" style="width:100%;height:100%;object-fit:contain">`
        : iconSvg('inventory', 'inventory-icon')}</div>
      <div class="pd-id">
        <h3>${esc(item.name)}${item.qty > 1 ? ` <span class="badge badge-lvl">×${num(item.qty)}</span>` : ''}</h3>
        <p class="pd-sub">${esc([item.rarity && titleCase(item.rarity), item.type && titleCase(item.type)].filter(Boolean).join(' · '))}</p>
      </div>
    </div>
    <div class="pd-body">
      ${item.description ? `<p class="subtext">${esc(item.description)}</p>` : ''}
      ${bonuses ? `<div class="pd-sec-title">Stat bonuses</div><div class="pd-stats">${bonuses}</div>` : ''}
      ${item.sellPrice ? `<div class="pd-sec-title">Value</div><p class="subtext">Sells for ${num(item.sellPrice)} solars each.</p>` : ''}
    </div>`)
}

/* ─────────────────────────────── page: season ─────────────────────────── */

let seasonTimer = null

async function loadSeason() {
  const tiersHost = $('#seasonTiers')
  if (tiersHost) tiersHost.innerHTML = skeletonRows(6)

  const out = await api.season()

  if (!out.active) {
    $('#seasonName').textContent = 'No active season'
    $('#seasonDesc').textContent = 'The next season has not started yet — check back soon.'
    $('#seasonClock').textContent = ''
    $('#seasonMine').innerHTML = ''
    if (tiersHost) tiersHost.innerHTML = `<div style="flex:1">${emptyState('season', 'Between seasons', 'Rewards and the battle pass return when the next season opens.')}</div>`
    return
  }

  const s = out.season
  $('#seasonName').textContent = `Season ${s.number}: ${s.name}`
  $('#seasonDesc').textContent = s.description ?? ''

  const clock = $('#seasonClock')
  if (clock) {
    const paint = () => {
      const left = (out.runtime.endsAt ?? 0) - Date.now()
      clock.textContent = left > 0 ? `${duration(left)} left` : 'Season ended'
    }
    paint()
    clearInterval(seasonTimer)
    // Live countdown. Cleared on route change so it isn't ticking forever.
    seasonTimer = setInterval(paint, 30_000)
  }

  const mine = $('#seasonMine')
  if (mine) {
    if (out.player) {
      mine.innerHTML = `
        <div class="pd-stats" style="margin:0 0 18px">
          <div class="pd-stat"><div class="pd-stat-k">Your tier</div><div class="pd-stat-v">${num(out.player.tier)} / ${num(s.tierCount)}</div></div>
          <div class="pd-stat"><div class="pd-stat-k">Season level</div><div class="pd-stat-v">${num(out.player.seasonLevel)}</div></div>
          <div class="pd-stat"><div class="pd-stat-k">Points</div><div class="pd-stat-v">${num(out.player.points)}</div></div>
          <div class="pd-stat"><div class="pd-stat-k">Pass</div><div class="pd-stat-v">${out.player.premiumPass ? 'Premium' : 'Free'}</div></div>
        </div>
        ${bar('Season progress', out.player.tier, s.tierCount)}
        ${!out.player.premiumPass && s.premiumCost
          ? `<p class="subtext" style="margin-top:13px">Upgrade in chat with <code>${esc(state.meta?.prefix ?? '.')}season buypass</code> — ${num(s.premiumCost)} ${esc(s.premiumCurrency ?? 'gems')}.</p>`
          : ''}`
    } else {
      mine.innerHTML = `${perkIcon('season')}<h4>Track your battle pass</h4>
        <p style="margin-bottom:14px">Sign in to see which tiers you've reached and what's still unclaimed.</p>
        <a class="btn btn-primary btn-sm" href="#/login" data-route="login">Sign in</a>`
    }
  }

  if (tiersHost) {
    // Claimed tiers read as "done", the first unclaimed-but-reached tier is the
    // one you should act on, so it gets astral's `.current` gold treatment.
    const nextUp = (out.tiers ?? []).find(t => t.reached && !t.claimed)
    tiersHost.innerHTML = (out.tiers ?? []).map(t => {
      const cls = t === nextUp ? ' current' : t.claimed || t.reached ? ' unlocked' : ''
      const glyph = t.claimed ? iconSvg('reward', 'tier-icon-svg') : t.reached ? iconSvg('gift', 'tier-icon-svg') : iconSvg('lock', 'tier-icon-svg')
      return `
        <div class="tier-node${cls}" title="${attr(t.claimed ? 'Claimed' : t.reached ? 'Ready to claim' : 'Locked')}">
          <div class="tier-num">TIER ${num(t.tier)}</div>
          <div class="tier-icon">${glyph}</div>
          <div class="tier-label">${esc(t.free?.label ?? '—')}</div>
          <div class="tier-label" style="color:var(--gold);margin-top:6px">${esc(t.premium?.label ?? '—')}</div>
        </div>`
    }).join('')
  }

  renderSeasonRoster(s, out)
  renderSeasonLore(s, out)
}

/**
 * The season's featured characters.
 *
 * Rendered from `season.roster`, which the API builds by merging the narrative
 * cast (`season.characters` — mei/urahara/willow) with the shop's own
 * `rewardType: 'character'` rows (urahara/wither). This used to filter the
 * `shop` payload against a hardcoded name list, which could only ever surface
 * the intersection of those two sets: one character, Wither. Names were also
 * matched bare ('mei') against the API's full names ('Kisuke Urahara'), and one
 * entry was misspelled. All of that is gone — the roster is season data, so the
 * API is what knows it.
 */
function renderSeasonRoster(s, out) {
  const host = $('#seasonRoster')
  const head = $('#seasonRosterHead')
  if (!host) return

  const roster = s.roster ?? []
  if (head) head.style.display = roster.length ? '' : 'none'

  const currency = (c) => (c === 'seasonPoints' ? 'pts' : c ?? 'pts')

  host.innerHTML = roster.map(c => {
    // `tag` is the display badge (legendary / special); `rarity` is the
    // mechanical grade that prices gems. Show the tag when there is one and
    // fall back to rarity, so every tile carries exactly one badge.
    const badge = c.tag ?? c.rarity
    return `
    <button type="button" class="perk-card reveal" data-char="${attr(c.id)}"
            aria-label="${attr(`${c.name} details`)}">
      ${c.image
        ? `<img src="${attr(c.image)}" alt="" loading="lazy"
                onerror="this.remove()"
                style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:var(--r);margin-bottom:11px">`
        : perkIcon('gift')}
      ${badge ? `<span class="rarity-pill r-${attr(String(badge).toLowerCase())}">${esc(titleCase(badge))}</span>` : ''}
      <h4>${esc(c.name)}</h4>
      ${c.seasonTier ? `<p class="subtext">${esc(titleCase(c.seasonTier))} character</p>` : ''}
      <p>${c.purchasable
        ? `${num(c.price)} ${esc(currency(c.currency))}`
        : c.gemPrice ? `${num(c.gemPrice)} gems` : 'Earned in game'}</p>
      ${c.ability ? `<p class="subtext" style="margin-top:6px">${esc(c.ability)}</p>` : ''}
    </button>`
  }).join('')
}

/**
 * Season story: the premise, each character's blurb, the live point bonuses,
 * and what happens to leftover points when the season closes. All four come
 * straight from data/seasons.json via /api/season — none of it was shipped to
 * the site before, so this section is new rather than moved.
 */
function renderSeasonLore(s, out) {
  const host = $('#seasonLore')
  if (!host) return

  const lore = s.lore ?? {}
  const roster = s.roster ?? []

  // Blurbs are keyed by character id, alongside non-character keys like
  // `guide` and `reservedNpcId` — so walk the roster, not the lore object.
  const blurbs = roster
    .map(c => ({ c, text: lore[c.id] }))
    .filter(e => e.text)

  const guide = roster.find(c => c.id === lore.guide)

  // Only the bonuses that are actually set, labelled the way the chat view
  // labels them, so the site can't drift from what the bot awards.
  const BONUS_LABELS = {
    killPoints: ['pts per kill', '+'],
    bossKillPoints: ['pts per boss', '+'],
    winPoints: ['pts per win', '+'],
    killXpPercent: ['XP on kills', '+', '%'],
    killSolarsPercent: ['solars on kills', '+', '%'],
    winXpPercent: ['XP on wins', '+', '%'],
    winSolarsPercent: ['solars on wins', '+', '%'],
  }
  const bonuses = Object.entries(s.bonuses ?? {})
    .filter(([k, v]) => BONUS_LABELS[k] && v)
    .map(([k, v]) => {
      const [label, pre, suf = ''] = BONUS_LABELS[k]
      return `<div class="pd-stat"><div class="pd-stat-k">${esc(label)}</div>
        <div class="pd-stat-v">${esc(pre)}${num(v)}${esc(suf)}</div></div>`
    }).join('')

  const conv = s.endOfSeason?.seasonPointsToSolars

  host.innerHTML = `
    <div class="card lore-card reveal">
      <p class="lore-lead">${esc(s.description ?? '')}</p>
      ${guide ? `<p class="subtext">Your guide this season is
        <button type="button" class="link-btn" data-char="${attr(guide.id)}">${esc(guide.name)}</button>.</p>` : ''}
    </div>

    ${blurbs.length ? `<div class="grid-2" style="margin-top:18px">
      ${blurbs.map(({ c, text }) => `
        <button type="button" class="perk-card reveal" data-char="${attr(c.id)}"
                aria-label="${attr(`${c.name} details`)}">
          <h4>${esc(c.name)}</h4>
          <p>${esc(text)}</p>
        </button>`).join('')}
    </div>` : ''}

    ${bonuses ? `<div class="card reveal" style="margin-top:18px">
      <h4 style="margin:0 0 13px">Season bonuses</h4>
      <div class="pd-stats" style="margin:0">${bonuses}</div>
    </div>` : ''}

    ${conv ? `<p class="subtext" style="margin-top:14px">
      When the season closes, every unspent season point converts to
      ${num(conv)} solars${s.endOfSeason?.keepUnlockedContent
        ? ', and everything you unlocked stays yours' : ''}.
    </p>` : ''}`
}

/* ──────────────────────────────── page: shop ──────────────────────────── */

/** Last /api/shop payload, so tab switches repaint without a refetch. */
let shopData = null
let shopShelf = null

async function loadShop() {
  const grid = $('#shopGrid')
  if (grid) grid.innerHTML = skeletonCards(8)

  shopData = await api.shop()
  const shelves = shopData.shelves ?? []
  if (!shelves.some(s => s.key === shopShelf)) shopShelf = shelves[0]?.key ?? null

  const tabs = $('#shopTabs')
  if (tabs) {
    tabs.innerHTML = shelves.map(s => `
      <button class="tab-btn${s.key === shopShelf ? ' active' : ''}" data-shelf="${attr(s.key)}" role="tab">
        ${esc(s.emoji ?? '')} ${esc(s.label)}
      </button>`).join('')
  }

  paintShopBalance()
  paintShopShelf()
}

function paintShopBalance() {
  const host = $('#shopBalance')
  if (!host) return
  const you = shopData?.you

  if (!you) {
    host.innerHTML = `<a class="btn btn-primary btn-sm" href="#/login" data-route="login">Sign in to buy</a>`
    return
  }
  host.innerHTML = `
    <div class="shop-wallet">
      <span><strong>${num(you.solars)}</strong> solars</span>
      <span class="subtext">${num(you.inventory)} / ${num(you.inventoryCap)} slots</span>
      ${you.discount ? `<span class="rarity-pill r-legendary">${num(you.discount)}% off</span>` : ''}
    </div>`
}

function paintShopShelf() {
  const grid = $('#shopGrid')
  if (!grid || !shopData) return

  const shelf = (shopData.shelves ?? []).find(s => s.key === shopShelf)
  if (!shelf) {
    grid.innerHTML = emptyState('inventory', 'Nothing in stock', 'The shop has no items in this category right now.')
    return
  }

  const you = shopData.you
  const discount = you?.discount ?? 0
  // The API ships list price; the discount is a mod on the player, so the
  // price shown here has to match what /api/shop/buy will actually charge.
  const priceOf = (row) => Math.max(1, Math.round((row.buyPrice ?? 0) * (1 - discount / 100)))

  grid.innerHTML = shelf.groups.map(g => `
    <div class="shop-group">
      <div class="shop-group-head">${esc(g.label)}</div>
      <div class="grid-4">
        ${g.rows.map(row => {
          const price = priceOf(row)
          const locked = you && (you.level ?? 1) < (row.levelReq ?? 1)
          const bonuses = Object.entries(row.statBonuses ?? {})
            .map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}`).join(' · ')
          return `
          <div class="perk-card shop-card reveal">
            ${row.image
              ? `<img src="${attr(row.image)}" alt="" loading="lazy" class="shop-img"
                      onerror="this.remove()">`
              : perkIcon('inventory')}
            ${row.rarity ? `<span class="rarity-pill r-${attr(String(row.rarity).toLowerCase())}">${esc(titleCase(row.rarity))}</span>` : ''}
            <h4>${esc(row.name)}</h4>
            ${row.description ? `<p>${esc(row.description)}</p>` : ''}
            ${bonuses ? `<p class="subtext" style="margin-top:6px">${esc(bonuses)}</p>` : ''}
            <div class="shop-price">
              <span class="gold">${num(price)} solars${discount ? ` <s class="subtext">${num(row.buyPrice)}</s>` : ''}</span>
              ${row.levelReq > 1 ? `<span class="subtext">Lv ${num(row.levelReq)}</span>` : ''}
            </div>
            ${locked
              ? `<button class="btn btn-secondary btn-sm btn-block" disabled>Requires level ${num(row.levelReq)}</button>`
              : `<button class="btn btn-primary btn-sm btn-block" data-buy="${attr(row.id)}"
                         data-name="${attr(row.name)}" data-price="${attr(String(price))}">Buy</button>`}
          </div>`
        }).join('')}
      </div>
    </div>`).join('')
}

/** Buy flow, shared by the Buy button on every shop card. */
async function buyShopItem(id, name, price) {
  if (!isSignedIn()) return goTo('login')

  const ok = await confirmAction({
    title: `Buy ${name}?`,
    body: `This costs ${Number(price).toLocaleString()} solars and is taken from your balance immediately.`,
    confirmLabel: 'Buy it',
    danger: false,
  })
  if (!ok) return

  try {
    const out = await api.buyItem(id, 1)
    toast(`Bought ${out.bought?.name ?? name}`, 'ok')

    // Keep the page honest without a full reload: the response carries the
    // authoritative balance and slot count.
    if (shopData?.you) {
      shopData.you.solars = out.balance ?? shopData.you.solars
      shopData.you.inventory = out.inventory?.length ?? shopData.you.inventory
      paintShopBalance()
    }
    // The profile's inventory and wallet are now stale.
    invalidate('profile')
    if (out.player) state.me = out.player
  } catch (err) {
    reportError(err)
  }
}

/* ─────────────────────────────── page: cards ──────────────────────────── */

let cardPage = 1
let cardTier = ''

async function loadCards() {
  const tierGrid = $('#cardTierGrid')
  if (tierGrid) tierGrid.innerHTML = skeletonCards(5)

  const prices = await api.cardPrices()

  const balance = $('#cardBalance')
  if (balance) {
    balance.innerHTML = prices.you
      ? `<div class="shop-wallet"><span><strong>${num(prices.you.solars)}</strong> solars</span></div>`
      : `<a class="btn btn-primary btn-sm" href="#/login" data-route="login">Sign in to buy</a>`
  }

  if (tierGrid) {
    tierGrid.innerHTML = (prices.tiers ?? []).map(t => `
      <div class="perk-card card-tier reveal">
        <div class="card-tier-stars">${esc(t.stars ?? '')}</div>
        <h4>Tier ${esc(t.tier)}</h4>
        <p>${t.poolSize ? `${num(t.poolSize)} cards in this tier` : 'A random card of this tier'}</p>
        <div class="shop-price"><span class="gold">${num(t.price)} solars</span></div>
        <button class="btn btn-primary btn-sm btn-block" data-buytier="${attr(t.tier)}"
                data-price="${attr(String(t.price))}">Buy a pull</button>
      </div>`).join('')
  }

  // Tier filters for the catalog below. '' is "all".
  const filters = $('#cardFilters')
  if (filters) {
    const tiers = ['', ...(prices.tiers ?? []).map(t => t.tier), '5', 'S']
    filters.innerHTML = tiers.map(t => `
      <button class="tab-btn${t === cardTier ? ' active' : ''}" data-cardtier="${attr(t)}" role="tab">
        ${t === '' ? 'All' : `Tier ${esc(t)}`}
      </button>`).join('')
  }

  cardPage = 1
  await paintCardCatalog({ reset: true })
}

/**
 * Card art, as an <img> or a <video>.
 *
 * Roughly one card in six on shoob's CDN is an animated `.webm`, which an
 * <img> can never paint — it just fires onerror and the tile loses its art.
 * Those get a muted autoplaying loop instead, which is how the card is meant
 * to look. `playsinline` keeps iOS from taking it fullscreen, and the poster
 * stays empty so nothing flashes before the first frame.
 */
function cardArt(url, className) {
  if (!url) return perkIcon('gem')
  if (/\.(webm|mp4)(\?|$)/i.test(url)) {
    // Under reduced motion the loop is dropped and the card sits on its first
    // frame, so the art is still visible without anything moving.
    const still = document.documentElement.classList.contains('no-motion')
      || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const motionAttrs = still ? 'preload="auto"' : 'autoplay loop preload="metadata"'
    return `<video class="${attr(className)}" src="${attr(url)}" muted playsinline
                    ${motionAttrs} onerror="this.remove()"></video>`
  }
  return `<img src="${attr(url)}" alt="" loading="lazy" class="${attr(className)}" onerror="this.remove()">`
}

/**
 * Fetch one catalog page.
 *
 * Goes through the bot rather than straight to cards-api-seven.vercel.app:
 * that host sends no Access-Control-Allow-Origin, so the browser discards the
 * response before JS can read it. The bot proxies it instead.
 */
async function paintCardCatalog({ reset = false } = {}) {
  const host = $('#cardCatalog')
  const more = $('#cardMore')
  if (!host) return
  if (reset) host.innerHTML = skeletonCards(8)
  if (more) more.disabled = true

  try {
    const out = await api.cardCatalog({ page: cardPage, limit: 24, tier: cardTier || undefined })
    const html = (out.cards ?? []).map(c => `
      <div class="perk-card card-tile reveal">
        ${cardArt(c.imageUrl, 'card-img')}
        <span class="rarity-pill r-t${attr(String(c.tier).toLowerCase())}">Tier ${esc(c.tier)}</span>
        <h4>${esc(c.title)}</h4>
        <p>${esc(c.series ?? '')}</p>
      </div>`).join('')

    if (reset) host.innerHTML = html || emptyState('gem', 'No cards', 'Nothing matched this filter.')
    else host.insertAdjacentHTML('beforeend', html)

    if (more) {
      more.style.display = out.hasMore ? '' : 'none'
      more.disabled = false
    }
  } catch (err) {
    if (reset) host.innerHTML = emptyState('warning', 'Card vault unavailable', err?.message ?? '')
    if (more) more.style.display = 'none'
  }
}

/** Buy one guaranteed-tier pull, then show what came out. */
async function buyCardPull(tier, price) {
  if (!isSignedIn()) return goTo('login')

  const ok = await confirmAction({
    title: `Buy a tier ${tier} pull?`,
    body: `This costs ${Number(price).toLocaleString()} solars. The tier is guaranteed; which card you get is random.`,
    confirmLabel: 'Pull a card',
    danger: false,
  })
  if (!ok) return

  try {
    const out = await api.buyCardTier(tier)
    const c = out.card ?? {}
    if (out.player) state.me = out.player
    invalidate('profile', 'cards')

    // An animated card can't be a CSS background-image, so the banner becomes
    // a <video> for those and a plain background for stills.
    const isMotion = /\.(webm|mp4)(\?|$)/i.test(c.imageUrl ?? '')
    const banner = !c.imageUrl
      ? ''
      : isMotion
        ? `<div class="pd-banner">${cardArt(c.imageUrl, 'pd-banner-media')}</div>`
        : `<div class="pd-banner" style="background-image:url('${attr(c.imageUrl)}')"></div>`

    openModal(`
      ${banner}
      <div class="pd-head">
        <div class="pd-id">
          <h3>${esc(c.title ?? 'New card')}</h3>
          <p class="pd-sub">Tier ${esc(c.tier ?? tier)} ${esc(c.stars ?? '')}${c.series ? ` · ${esc(c.series)}` : ''}</p>
        </div>
      </div>
      <div class="pd-body">
        <p class="subtext">Added to your collection. Balance is now
          ${num(out.balance ?? 0)} solars.</p>
      </div>`)

    const balance = $('#cardBalance')
    if (balance && out.balance != null) {
      balance.innerHTML = `<div class="shop-wallet"><span><strong>${num(out.balance)}</strong> solars</span></div>`
    }
  } catch (err) {
    reportError(err)
  }
}

/* ────────────────────────────── page: premium ─────────────────────────── */

async function loadPremium() {
  const planGrid = $('#planGrid')
  if (planGrid) planGrid.innerHTML = skeletonCards(3)

  const out = await api.premium()
  const prefix = state.meta?.prefix ?? (await ensureMeta())?.prefix ?? '.'

  // Best value = lowest cost per day. Computed from the API's own numbers so
  // it can never contradict what the bot actually charges.
  const cheapest = (out.plans ?? []).reduce(
    (best, p) => (best === null || p.perDayNaira < best.perDayNaira ? p : best), null)

  if (planGrid) {
    planGrid.innerHTML = (out.plans ?? []).map(p => {
      const best = cheapest && p.id === cheapest.id
      return `
      <div class="plan-card${best ? ' featured' : ''} reveal">
        ${best ? '<span class="plan-ribbon">Best value</span>' : ''}
        <div class="plan-name">${esc(p.label ?? titleCase(p.id))}</div>
        <div class="plan-price">${esc(naira(p.priceNaira))}<span> / ${num(p.durationDays)}d</span></div>
        <div class="plan-desc">${esc(naira(p.perDayNaira))} per day</div>
        <ul class="plan-features">
          <li>${CHECK} Premium badge on your profile and the boards</li>
          <li>${CHECK} Boosted rewards on dungeon runs</li>
          <li>${CHECK} Access to premium-only commands</li>
        </ul>
        <a class="btn ${best ? 'btn-gold' : 'btn-secondary'} btn-block" href="${attr(whatsappCommandUrl(p.command))}" target="_blank" rel="noopener" style="margin-top:auto">
          <svg class="icon" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 8.5c.4 2.4 2.1 4.6 4.7 5.5l1.5-1.1 1.8.8c-.2 1-1 1.6-2 1.5-3.7-.4-6.8-3.5-7.2-7.2-.1-1 .5-1.8 1.5-2l.8 1.8-1.1 1.5z"/></svg>
          Continue in WhatsApp
        </a>
      </div>`
    }).join('')
  }

  const mine = $('#premiumMine')
  if (mine && out.you) {
    mine.style.display = ''
    mine.innerHTML = out.you.active
      ? `${perkIcon('premium')}<h4>Premium is active</h4>
         <p>${esc(titleCase(out.you.plan ?? 'Premium'))} · renews or expires ${esc(relTime(out.you.expiresAt))}.</p>`
      : out.you.pending
        ? `${perkIcon('payment')}<h4>Payment under review</h4>
           <p>We've got your ${esc(titleCase(out.you.pending.plan ?? ''))} request. An admin will confirm it shortly.</p>`
        : `${perkIcon('spark')}<h4>You're on the free tier</h4>
           <p>Everything below is optional — the game is fully playable without it.</p>`
  } else if (mine) {
    mine.style.display = 'none'
  }

  const gems = $('#gemGrid')
  if (gems) {
    gems.innerHTML = (out.gemPackages ?? []).map(g => `
      <div class="perk-card reveal">
        ${perkIcon('gem')}
        <h4>${num(g.gems)} gems</h4>
        <p>${esc(naira(g.priceNaira))} · ${esc(naira(g.perGemNaira))} per gem</p>
        <a class="btn btn-ghost btn-sm btn-block" href="${attr(whatsappCommandUrl(g.command))}" target="_blank" rel="noopener" style="margin-top:11px">
          <svg class="icon" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 8.5c.4 2.4 2.1 4.6 4.7 5.5l1.5-1.1 1.8.8c-.2 1-1 1.6-2 1.5-3.7-.4-6.8-3.5-7.2-7.2-.1-1 .5-1.8 1.5-2l.8 1.8-1.1 1.5z"/></svg>
          Buy gems in WhatsApp
        </a>
      </div>`).join('')
  }

  // Bank details are deliberately NOT shown here. The account number only ever
  // goes out over the bot's DM reply, so a scraped copy of this static site is
  // never a payment instruction someone can act on.
  const pay = $('#payCard')
  if (pay) {
    pay.innerHTML = `
      <div class="section-head" style="margin-bottom:8px">
        <div>
          <h2>Paying for premium or gems</h2>
          <p>Run the command in WhatsApp — the bot replies with the payment details and confirms once an admin approves it.</p>
        </div>
      </div>
      ${out.botNumber ? `<p class="subtext" style="margin-top:14px">Send proof of payment to the bot on
        +${esc(String(out.botNumber).replace(/\D/g, ''))}.</p>` : ''}
      <p class="subtext">The bot is the only place the account details come from. Never send money to anyone else claiming to be staff.</p>`
  }
}

/* ────────────────────────────── page: profile ─────────────────────────── */

async function loadProfile() {
  const host = $('#profileWrap')
  if (!host) return
  host.innerHTML = skeletonCards(3)

  const [meRes, rankRes] = await Promise.all([
    api.me(),
    api.myRankings().catch(() => null),
  ])
  const p = meRes.player
  state.me = p
  paintAvatar()

  const rankings = rankRes?.rankings ?? {}
  const prefix = state.meta?.prefix ?? '.'

  const ranked = Object.entries(rankings).filter(([, v]) => v).map(([k, v]) => `
    <div class="pd-stat">
      <div class="pd-stat-k">${esc(BOARD_LABELS[k] ?? titleCase(k))}</div>
      <div class="pd-stat-v">#${num(v.position)}<span style="font-size:12px;color:var(--text-subtle)"> / ${num(v.of)}</span></div>
    </div>`).join('')

  // Slots show the item's real plate (the same /assets/items/<id>.png the bot
  // renders in chat) and fall back to the generic glyph only when there's no
  // artwork or it fails to load — matching the `onerror` pattern used for
  // season art. `.inv-slot` has always had `cursor:pointer`; `data-item` is
  // what finally makes that true, via the delegated handler.
  state.inv = (p.inventory ?? []).slice(0, 24)
  const inv = state.inv.map((i, idx) => `
    <button type="button"
         class="inv-slot${i.rarity === 'rare' ? ' rare' : i.rarity === 'epic' || i.rarity === 'legendary' ? ' epic' : ''}"
         data-item="${attr(String(idx))}"
         title="${attr(i.name)}" aria-label="${attr(i.name)}">
      ${i.image
        ? `<img src="${attr(i.image)}" alt="" loading="lazy" class="inv-img"
                onerror="this.insertAdjacentHTML('afterend', this.dataset.fb); this.remove()"
                data-fb="${attr(`<span>${iconSvg('inventory', 'inventory-icon')}</span>`)}">`
        : `<span>${iconSvg('inventory', 'inventory-icon')}</span>`}
      ${i.qty > 1 ? `<span class="qty">${num(i.qty)}</span>` : ''}
    </button>`).join('')

  host.innerHTML = `
    <div class="profile-banner"${p.bannerUrl ? ` style="background-image:url('${attr(p.bannerUrl)}');background-size:cover;background-position:center;"` : ''}></div>

    <div class="profile-head-row">
      <div class="profile-pfp-wrap">
        <div class="profile-pfp">${p.avatarUrl
          ? `<img src="${attr(p.avatarUrl)}" alt="">`
          : esc(initials(p.name))}</div>
        <span class="profile-status"></span>
      </div>
      <div class="profile-info-row">
        <div class="profile-info">
          <h2><span class="profile-name-text">${esc(p.name)}</span>
            <span class="badge badge-lvl">Lv ${num(p.level)}</span>
            ${p.premium?.active ? '<span class="badge badge-gold">Premium</span>' : ''}</h2>
          <p class="handle">${iconSvg('rank', 'inline-icon')} ${esc(p.rank.title)} · ${esc(p.rank.epithet ?? '')}</p>
        </div>
        <div class="profile-actions">
          <a class="btn btn-secondary btn-sm" href="#/settings" data-route="settings">Settings</a>
          <a class="btn btn-ghost btn-sm" href="#/leaderboard" data-route="leaderboard">Boards</a>
        </div>
      </div>
    </div>

    <section class="section">
      <div class="stat-row reveal">
        <div class="stat-pill"><div class="label">Level</div><div class="value gold">${num(p.level)}</div>
          <div class="subtext" style="margin-top:4px">${p.xpProgress.maxed ? 'Max level' : `${num(p.xpProgress.xpToNext)} XP to go`}</div></div>
        <div class="stat-pill"><div class="label">Solars</div><div class="value acc">${compact(p.wallet.solars)}</div>
          <div class="subtext" style="margin-top:4px">${num(p.wallet.gems)} gems · ${compact(p.wallet.vault)} vaulted</div></div>
        <div class="stat-pill"><div class="label">Fame</div><div class="value acc">${esc(p.fame.formatted ?? num(p.fame.value))}</div>
          <div class="subtext" style="margin-top:4px">${esc(p.fame.tier?.title ?? '')}</div></div>
        <div class="stat-pill"><div class="label">PvP record</div><div class="value acc">${num(p.record.wins)}W</div>
          <div class="subtext" style="margin-top:4px">${num(p.record.losses)} losses</div></div>
      </div>

      <div class="card reveal" style="margin-top:16px">
        ${bar(p.xpProgress.maxed ? 'XP (maxed)' : `XP to Lv ${num(p.level + 1)}`, p.xpProgress.intoLevel, p.xpProgress.forLevel || 1)}
        ${bar('HP', p.hp, p.maxHp || 1)}
        ${p.maxMp ? bar('MP', p.mp, p.maxMp) : ''}
        ${p.stamina ? bar('Stamina', p.stamina.current ?? 0, p.stamina.max ?? 1) : ''}
      </div>

      ${p.statPoints?.unallocated
        ? `<div class="perk-card reveal" style="margin-top:16px;border-color:rgb(212 175 55 / 40%)">
            ${perkIcon('spark')}
            <h4>${num(p.statPoints.unallocated)} stat point${p.statPoints.unallocated === 1 ? '' : 's'} unspent</h4>
            <p style="margin-bottom:12px">Spend them in chat — they do nothing sitting there.</p>
            <button class="btn btn-primary btn-sm" data-copy="${attr(prefix + 'stats')}">${esc(prefix)}stats</button>
          </div>` : ''}
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Stats</h2><p>What the bot rolls against every fight</p></div></div>
      <div class="pd-stats reveal">
        ${[['STR', p.stats.str], ['AGI', p.stats.agi], ['INT', p.stats.int], ['DEF', p.stats.def], ['LCK', p.stats.lck]]
          .map(([k, v]) => `<div class="pd-stat"><div class="pd-stat-k">${k}</div><div class="pd-stat-v">${num(v)}</div></div>`).join('')}
      </div>
    </section>

    ${ranked ? `<section class="section">
      <div class="section-head"><div><h2>Your rankings</h2><p>Where you sit on every board</p></div></div>
      <div class="pd-stats reveal">${ranked}</div>
    </section>` : ''}

    ${p.season ? `
      <section class="section">
        <div class="section-head">
          <div><h2>${esc(p.season.name)}</h2><p>Battle pass progress this season</p></div>
          <a class="btn btn-ghost btn-sm" href="#/season" data-route="season">Battle pass →</a>
        </div>
        <div class="card reveal">
          ${bar(`Tier ${num(p.season.tier)} of ${num(p.season.tierCount)}`, p.season.tier, p.season.tierCount || 1)}
          <p class="subtext" style="margin-top:11px">${p.season.premiumPass ? 'Premium pass active' : 'Free pass'} ·
            ${num(p.seasonPoints)} season points · ${num((p.season.claimedTiers ?? []).length)} tiers claimed</p>
        </div>
      </section>` : ''}

    ${p.equippedCharacter ? `
      <section class="section">
        <div class="section-head">
          <div><h2>Equipped character</h2><p>Its bonuses ride along on every run</p></div>
        </div>
        <button class="card reveal" data-char="${attr(p.equippedCharacter.id)}" style="text-align:left;width:100%;display:flex;gap:14px;align-items:center;cursor:pointer">
          ${p.equippedCharacter.image
            ? `<img src="${attr(p.equippedCharacter.image)}" alt="" style="width:58px;height:58px;border-radius:var(--r);object-fit:cover">`
            : iconSvg('character', 'character-placeholder')}
          <span style="min-width:0">
            <strong>${esc(p.equippedCharacter.name)}</strong>
            <p class="subtext">${esc(p.equippedCharacter.ability ?? '')}</p>
          </span>
        </button>
      </section>` : ''}

    ${inv ? `<section class="section">
      <div class="section-head">
        <div><h2>Inventory</h2><p>The first 24 items you're carrying</p></div>
        <span class="badge badge-lvl">${num(p.counts.inventory)} items</span>
      </div>
      <div class="inv-grid reveal">${inv}</div>
    </section>` : ''}`
}

/* ───────────────────────────── page: settings ─────────────────────────── */

/**
 * Device-local preferences. These deliberately do NOT go to the API: they're
 * about this browser (motion, confirmations), not about the character, and
 * syncing them would mean a phone's choice silently changing a laptop's.
 * Anything the bot also needs to know lives on the player record instead.
 */
const LOCAL_PREFS_KEY = 'astral:prefs'
const LOCAL_PREF_DEFAULTS = { reduceMotion: false, confirmSignOut: true }

function localPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_PREFS_KEY) ?? '{}')
    return { ...LOCAL_PREF_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) }
  } catch { return { ...LOCAL_PREF_DEFAULTS } }
}

function setLocalPref(key, value) {
  const next = { ...localPrefs(), [key]: value }
  try { localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(next)) } catch {}
  applyLocalPrefs()
  return next
}

/**
 * Reflects local prefs onto the document. Called from boot() BEFORE
 * initMotion(), because the reveal observer checks for `.no-motion` when it
 * decides whether to run at all.
 */
function applyLocalPrefs() {
  const prefs = localPrefs()
  document.documentElement.classList.toggle('no-motion', !!prefs.reduceMotion)
}

/** One `.setting-row` with a switch. `id` is read back by the change handler. */
function switchRow(id, label, desc, checked) {
  return `
    <div class="setting-row">
      <div class="setting-label">
        <div class="label">${esc(label)}</div>
        <div class="desc">${esc(desc)}</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="${attr(id)}" ${checked ? 'checked' : ''}>
        <span class="switch-track"></span>
      </label>
    </div>`
}

/** Human-readable "1 day 4h" for the rename cooldown. */
function untilLabel(ts) {
  const ms = ts - Date.now()
  if (ms <= 0) return 'now'
  const totalHours = Math.ceil(ms / 3_600_000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}${hours > 0 ? ` ${hours}h` : ''}`
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

const NOTE_KIND_LABELS = {
  system: 'System', security: 'Security', season: 'Season', premium: 'Premium',
  reward: 'Rewards', battle: 'Battles', social: 'Social',
}

async function loadSettings() {
  const card = $('#settingsCard')
  if (!card) return
  const p = state.me ?? (await api.me()).player
  state.me = p

  const prefix = state.meta?.prefix ?? (await ensureMeta())?.prefix ?? '.'
  const s = p.settings ?? {}
  const rename = s.rename ?? { canRename: true, minLength: 2, maxLength: 20, cooldownDays: 7 }
  const muted = new Set(s.mutedNotificationKinds ?? [])
  const kinds = s.notificationKinds ?? Object.keys(NOTE_KIND_LABELS)
  const prefs = localPrefs()

  card.innerHTML = `
    <p class="subtext">Settings</p>
    <h2>Your account</h2>
    <p class="subtext" style="margin-bottom:22px">
      Signed in as <strong>${esc(p.name)}</strong> · Lv ${num(p.level)}
    </p>

    <div class="settings-group">
      <h3>Profile</h3>
      <p class="group-hint">How you appear on the leaderboard and to other players.</p>

      <div class="img-upload" id="bannerUpload">
        <div class="img-upload-preview banner${p.bannerUrl ? '' : ' is-empty'}"
             id="bannerPreview"
             ${p.bannerUrl ? `style="background-image:url('${attr(p.bannerUrl)}')"` : ''}>
          ${p.bannerUrl ? '' : '<span>No banner yet</span>'}
        </div>
        <div class="img-upload-meta">
          <label for="bannerInput">Banner</label>
          <p class="field-hint">Wide image behind your profile header. PNG, JPEG, WebP or GIF, up to 5MB.</p>
          <div class="img-upload-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-pick="bannerInput">
              ${p.hasCustomBanner ? 'Change' : 'Upload'}
            </button>
            ${p.hasCustomBanner
              ? '<button class="btn btn-ghost btn-sm" type="button" data-remove-img="banner">Remove</button>'
              : ''}
          </div>
          <p class="field-err" id="bannerErr"></p>
        </div>
        <input id="bannerInput" class="visually-hidden" type="file"
               accept="image/png,image/jpeg,image/webp,image/gif" data-upload="banner">
      </div>

      <div class="img-upload" id="pfpUpload">
        <div class="img-upload-preview avatar${p.avatarUrl ? '' : ' is-empty'}"
             id="pfpPreview"
             ${p.avatarUrl ? `style="background-image:url('${attr(p.avatarUrl)}')"` : ''}>
          ${p.avatarUrl ? '' : `<span>${esc(initials(p.name))}</span>`}
        </div>
        <div class="img-upload-meta">
          <label for="pfpInput">Profile picture</label>
          <p class="field-hint">Square works best. PNG, JPEG, WebP or GIF, up to 5MB.</p>
          <div class="img-upload-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-pick="pfpInput">
              ${p.hasCustomPfp ? 'Change' : 'Upload'}
            </button>
            ${p.hasCustomPfp
              ? '<button class="btn btn-ghost btn-sm" type="button" data-remove-img="pfp">Remove</button>'
              : ''}
          </div>
          <p class="field-err" id="pfpErr"></p>
        </div>
        <input id="pfpInput" class="visually-hidden" type="file"
               accept="image/png,image/jpeg,image/webp,image/gif" data-upload="pfp">
      </div>

      <form id="nameForm" novalidate style="margin-top:20px">
        <div class="field" id="nameField">
          <label for="nameInput">Display name</label>
          <input id="nameInput" type="text"
                 minlength="${attr(rename.minLength ?? 2)}"
                 maxlength="${attr(rename.maxLength ?? 20)}"
                 placeholder="Your name in-game"
                 value="${attr(p.name ?? '')}"
                 ${rename.canRename ? '' : 'disabled'}>
          <p class="field-hint">
            ${rename.minLength ?? 2}–${rename.maxLength ?? 20} characters. Letters, numbers,
            spaces and <code>-_.'</code>. Changeable once every ${rename.cooldownDays ?? 7} days.
          </p>
          <p class="field-err" id="nameErr"></p>
        </div>
        ${rename.canRename ? `
          <button class="btn btn-primary btn-block" id="nameSaveBtn" type="submit">Save name</button>
        ` : `
          <div class="rename-locked">
            ${iconSvg('payment', 'inline-icon')}
            <span>Next rename unlocks in <strong>${esc(untilLabel(rename.nextRenameAt))}</strong>
            — that's the same 7-day cooldown <code>${esc(prefix)}rename</code> uses in chat.</span>
          </div>
        `}
      </form>

      <form id="bioForm" novalidate style="margin-top:18px">
        <div class="field" id="bioField">
          <label for="bioInput">Bio</label>
          <input id="bioInput" type="text" maxlength="120" placeholder="Nine words, no more."
                 value="${attr(p.bio ?? '')}">
          <p class="field-hint">Shown on your public profile. Up to 9 words.</p>
          <p class="field-err" id="bioErr"></p>
        </div>
        <button class="btn btn-primary btn-block" id="bioSaveBtn" type="submit">Save bio</button>
      </form>
    </div>

    <div class="settings-group">
      <h3>Privacy</h3>
      <p class="group-hint">Applies everywhere — the site and the bot's own leaderboards.</p>
      ${switchRow(
        'hideBoardToggle',
        'Hide me from leaderboards',
        'Removes you from every ranking and hides your public profile page.',
        !!s.hiddenFromLeaderboard,
      )}
    </div>

    <div class="settings-group">
      <h3>Notifications</h3>
      <p class="group-hint">Tap a category to mute it. Muted alerts stop counting toward the bell.</p>
      <div class="kind-chips" id="kindChips">
        ${kinds.map(k => `
          <button type="button" class="chip kind-chip ${muted.has(k) ? 'is-muted' : 'active'}"
                  data-kind="${attr(k)}"
                  aria-pressed="${muted.has(k) ? 'false' : 'true'}">
            ${esc(NOTE_KIND_LABELS[k] ?? titleCase(k))}
          </button>`).join('')}
      </div>
      ${switchRow(
        'dmNotesToggle',
        'Also message me on WhatsApp',
        'Lets the bot DM you about things that need attention, not just the bell.',
        s.dmNotifications !== false,
      )}
    </div>

    <div class="settings-group">
      <h3>This device</h3>
      <p class="group-hint">Stored in this browser only — your other devices keep their own.</p>
      ${switchRow(
        'reduceMotionToggle',
        'Reduce motion',
        'Turns off entrance animations, parallax and looping effects.',
        !!prefs.reduceMotion,
      )}
      ${switchRow(
        'confirmSignOutToggle',
        'Confirm before signing out',
        'Asks first, so a stray tap on the menu does not end your session.',
        prefs.confirmSignOut !== false,
      )}
    </div>

    <div class="settings-group">
      <h3>Your ID</h3>
      <p class="group-hint">Share this to let someone open your public profile.</p>
      <div class="copy-box">
        <span>${esc(p.uid ?? '—')}</span>
        <button class="btn btn-ghost btn-sm" data-copy="${attr(p.uid ?? '')}"
                data-copy-msg="Player ID copied">Copy</button>
      </div>
    </div>

    <div class="settings-divider"></div>

    <div class="settings-group">
      <h3>Session</h3>
      <p class="group-hint">
        Everything else about your character — class, stats, gear — is changed in chat,
        where the bot can validate it properly.
      </p>
      <button class="btn btn-ghost btn-block" id="revokeBtn" style="margin-bottom:10px">
        Sign out of all devices
      </button>
      <button class="btn btn-danger btn-block" id="signOutBtn">Sign out</button>
    </div>`
}

/**
 * Reads the picked file, ships it as a data URL, and folds the returned player
 * back into `state.me`.
 *
 * UPLOAD PATH: straight to the bot. `POST /api/me/:kind` takes the raw base64
 * and does the ImgBB call itself, server-side, with the bot's own key — the
 * key never touches the browser, and there's one hop instead of two.
 *
 * The Vercel proxy is kept only as a fallback for when that call can't be
 * made at all (proxy still holds a working key if the bot's is unset or its
 * quota is spent). It uploads to ImgBB and hands back a finished URL, which
 * the bot accepts via `{ url }` — it validates the host before storing it.
 * A 4xx is NOT retried: that's the server rejecting the image on its merits
 * (too big, wrong type, rate-limited) and the proxy would reject it too.
 *
 * The file input is cleared unconditionally at the end: without it, picking the
 * same file twice in a row fires no `change` event the second time, so a failed
 * upload could never be retried with the identical image.
 */
async function uploadProfileImage(kind, file, inputEl) {
  const errId = kind === 'banner' ? 'bannerErr' : 'pfpErr'
  fieldError(null, errId, null)
  if (!file) return

  const box = inputEl?.closest('.img-upload')
  box?.classList.add('busy')
  try {
    const dataUrl = await fileToDataUrl(file)

    let out
    try {
      out = await api.uploadImage(kind, dataUrl)
    } catch (err) {
      // Only fall back when the bot couldn't complete the upload itself —
      // offline (status 0) or a failure on its ImgBB call (502). Anything
      // else is a verdict on the image, so surface it.
      if (err?.status !== 0 && err?.status !== 502) throw err
      const hostedUrl = await uploadToImgbb(dataUrl, kind)
      out = await api.uploadImageUrl(kind, hostedUrl)
    }

    if (out?.player) state.me = out.player
    invalidate('profile', 'settings', 'leaderboard')
    paintAvatar()
    toast(kind === 'banner' ? 'Banner updated.' : 'Profile picture updated.')
    await loadSettings()
  } catch (err) {
    fieldError(null, errId, err?.message || 'Upload failed.')
  } finally {
    box?.classList.remove('busy')
    if (inputEl) inputEl.value = ''
  }
}

async function removeProfileImage(kind, btn) {
  const errId = kind === 'banner' ? 'bannerErr' : 'pfpErr'
  fieldError(null, errId, null)
  const box = btn?.closest('.img-upload')
  box?.classList.add('busy')
  try {
    const out = await api.removeImage(kind)
    if (out?.player) state.me = out.player
    invalidate('profile', 'settings', 'leaderboard')
    paintAvatar()
    toast(kind === 'banner' ? 'Banner removed.' : 'Profile picture removed.')
    await loadSettings()
  } catch (err) {
    fieldError(null, errId, err?.message || 'Could not remove that image.')
  } finally {
    box?.classList.remove('busy')
  }
}

async function saveName(btn) {
  const input = $('#nameInput')
  const value = (input?.value ?? '').trim()
  fieldError('nameField', 'nameErr', null)

  // Mirror the server's rules so the common mistakes are caught without a
  // round-trip. The server re-checks all of them regardless.
  if (value.length < 2 || value.length > 20) {
    fieldError('nameField', 'nameErr', 'Name must be 2–20 characters.')
    return
  }
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(value)) {
    fieldError('nameField', 'nameErr', "Only letters, numbers, spaces and -_.'")
    return
  }
  if (value === state.me?.name) {
    fieldError('nameField', 'nameErr', 'That is already your name.')
    return
  }

  const stop = busy(btn)
  try {
    const out = await api.updateName(value)
    state.me = out.player
    // The name shows up on the profile page and on every leaderboard row, and
    // renaming burns the cooldown — so this page has to re-render too.
    invalidate('profile', 'settings', 'leaderboard')
    state.boardCache.clear()
    paintAvatar()
    toast('Name changed', 'ok')
    loadSettings()
  } catch (err) {
    fieldError('nameField', 'nameErr', err?.message ?? 'Could not save.')
  } finally { stop() }
}

async function saveBio(btn) {
  const value = $('#bioInput')?.value ?? ''
  fieldError('bioField', 'bioErr', null)

  // Mirror the API's 9-word rule locally so the user finds out before the
  // round-trip; the server still enforces it either way.
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length > 9) {
    fieldError('bioField', 'bioErr', 'Bio must be 9 words or fewer.')
    return
  }

  const stop = busy(btn)
  try {
    const out = await api.updateBio(value.trim())
    state.me = out.player
    invalidate('profile')
    toast('Bio saved', 'ok')
  } catch (err) {
    fieldError('bioField', 'bioErr', err?.message ?? 'Could not save.')
  } finally { stop() }
}

/**
 * Sends one server-side setting. Optimistic: the switch has already moved, so
 * on failure we put it back rather than leaving the UI claiming something the
 * server didn't do.
 */
async function saveSetting(patch, { revert } = {}) {
  try {
    const out = await api.updateSettings(patch)
    state.me = out.player
    // Hiding from the leaderboard changes what those pages should show.
    if ('hiddenFromLeaderboard' in patch) {
      invalidate('leaderboard', 'profile')
      state.boardCache.clear()
    }
    if ('mutedNotificationKinds' in patch) loadNotifications()
    toast('Setting saved', 'ok')
  } catch (err) {
    revert?.()
    reportError(err)
  }
}

/** Toggles one notification kind's mute state and persists the whole list. */
function toggleNoteKind(chip) {
  const kind = chip.dataset.kind
  const muted = new Set(state.me?.settings?.mutedNotificationKinds ?? [])
  const nowMuted = !muted.has(kind)

  if (nowMuted) muted.add(kind)
  else muted.delete(kind)

  chip.classList.toggle('is-muted', nowMuted)
  chip.classList.toggle('active', !nowMuted)
  chip.setAttribute('aria-pressed', nowMuted ? 'false' : 'true')

  saveSetting({ mutedNotificationKinds: [...muted] }, {
    revert: () => {
      chip.classList.toggle('is-muted', !nowMuted)
      chip.classList.toggle('active', nowMuted)
      chip.setAttribute('aria-pressed', nowMuted ? 'true' : 'false')
    },
  })
}

/** "Sign out of all devices" — invalidates every token, including this one. */
async function revokeSessions(btn) {
  const ok = await confirmAction({
    title: 'Sign out everywhere?',
    body: 'Every device signed in to your account will be signed out, including this one. '
      + 'You can sign back in with a new code any time.',
    confirmLabel: 'Sign out everywhere',
  })
  if (!ok) return

  const stop = busy(btn)
  try {
    await api.revokeSessions()
    toast('Signed out on all devices', 'ok')
  } catch (err) {
    reportError(err)
  } finally {
    stop()
    // The token is dropped locally either way — a failed revoke that left the
    // session alive is still safer to treat as signed out on this device.
    state.me = null
    state.needsRegistration = false
    state.notes = { items: [], unread: 0 }
    loaded.clear()
    paintAvatar()
    paintBell()
    goTo('home')
  }
}

/* ─────────────────────────────── event wiring ─────────────────────────── */

/**
 * One delegated click handler for the whole document. Every page re-renders
 * its own innerHTML, so per-element listeners would have to be re-attached
 * on each render — delegation survives that for free.
 */
function wireGlobalClicks() {
  document.addEventListener('click', async (e) => {
    const t = e.target

    // Copy-a-command pills (also used for the premium buy buttons, and for
    // the player ID in settings — hence the overridable message).
    const copyBtn = t.closest('[data-copy]')
    if (copyBtn) {
      e.preventDefault()
      copyText(copyBtn.dataset.copy, copyBtn.dataset.copyMsg ?? 'Command copied')
      return
    }

    // Leaderboard row / wielder row → player detail with stats + alerts.
    // A card can contain its own links and buttons (a "Buy" action, a route
    // link); those must win, or clicking them would also open the card's modal
    // behind whatever they do. `closest` finds the innermost match, so if an
    // interactive descendant sits between the target and the card, this card
    // isn't the thing that was clicked.
    const innerCtl = t.closest('a[href],button:not([data-uid]):not([data-char]):not([data-item])')

    const row = t.closest('[data-uid]')
    if (row && !(innerCtl && row.contains(innerCtl) && innerCtl !== row)) {
      e.preventDefault()
      openPlayer(row.dataset.uid)
      return
    }

    const charCard = t.closest('[data-char]')
    if (charCard && !(innerCtl && charCard.contains(innerCtl) && innerCtl !== charCard)) {
      e.preventDefault()
      openCharacter(charCard.dataset.char)
      return
    }

    // Inventory slot → item detail. The index keys into the rows the profile
    // last rendered, so no refetch is needed.
    const itemSlot = t.closest('[data-item]')
    if (itemSlot && !(innerCtl && itemSlot.contains(innerCtl) && innerCtl !== itemSlot)) {
      e.preventDefault()
      openItem(state.inv[Number(itemSlot.dataset.item)])
      return
    }

    // Shop: category tab, then the Buy button on a card.
    const shelfTab = t.closest('[data-shelf]')
    if (shelfTab) {
      e.preventDefault()
      shopShelf = shelfTab.dataset.shelf
      for (const b of $$('#shopTabs .tab-btn')) b.classList.toggle('active', b.dataset.shelf === shopShelf)
      paintShopShelf()
      return
    }

    const buyBtn = t.closest('[data-buy]')
    if (buyBtn) {
      e.preventDefault()
      buyShopItem(buyBtn.dataset.buy, buyBtn.dataset.name, buyBtn.dataset.price)
      return
    }

    // Cards: tier purchase, catalog filter, and paging.
    const pullBtn = t.closest('[data-buytier]')
    if (pullBtn) {
      e.preventDefault()
      buyCardPull(pullBtn.dataset.buytier, pullBtn.dataset.price)
      return
    }

    const tierTab = t.closest('[data-cardtier]')
    if (tierTab) {
      e.preventDefault()
      cardTier = tierTab.dataset.cardtier
      for (const b of $$('#cardFilters .tab-btn')) b.classList.toggle('active', b.dataset.cardtier === cardTier)
      cardPage = 1
      paintCardCatalog({ reset: true })
      return
    }

    if (t.closest('#cardMore')) {
      e.preventDefault()
      cardPage += 1
      paintCardCatalog()
      return
    }

    // Board tabs.
    const tab = t.closest('[data-board]')
    if (tab) {
      e.preventDefault()
      const search = $('#lbSearch')
      if (search) search.value = ''
      showBoard(tab.dataset.board)
      return
    }

    // Dismiss one stored notification. Checked before the .note handler so
    // the X doesn't also count as "open this alert".
    const del = t.closest('[data-del]')
    if (del) {
      e.preventDefault()
      e.stopPropagation()
      deleteNote(del.dataset.del)
      return
    }

    // Reading a stored notification marks it read.
    const note = t.closest('.note')
    if (note && !note.dataset.derived && note.classList.contains('is-unread')) {
      note.classList.remove('is-unread')
      const item = state.notes.items.find(n => n.id === note.dataset.note)
      if (item) item.read = true
      state.notes.unread = Math.max(0, state.notes.unread - 1)
      paintBell()
      api.markNotificationRead(note.dataset.note).catch(() => {})
      return
    }

    // FAQ accordion — one open at a time.
    const faqQ = t.closest('.faq-q')
    if (faqQ) {
      e.preventDefault()
      const faq = faqQ.closest('.faq-item')
      const wasOpen = faq.classList.contains('open')
      for (const f of $$('.faq-item')) f.classList.remove('open')
      faq.classList.toggle('open', !wasOpen)
      return
    }

    // Any in-app link. Closing the drawer here (rather than only in render())
    // matters for links to the page you're already on, which don't re-render.
    const link = t.closest('a[data-route]')
    if (link) {
      if ((link.id === 'drawerAuth' || link.id === 'footerAuth') && isSignedIn()) {
        e.preventDefault()
        signOut()
        return
      }
      closeDrawer()
      closePanel()
      return
    }
  })
}

function wireShell() {
  $('#bellBtn')?.addEventListener('click', (e) => { e.stopPropagation(); togglePanel() })
  $('#panelBackdrop')?.addEventListener('click', closePanel)
  $('#menuToggle')?.addEventListener('click', toggleDrawer)
  $('#scrim')?.addEventListener('click', closeDrawer)
  $('#readAllBtn')?.addEventListener('click', markAllRead)
  $('#clearNotesBtn')?.addEventListener('click', clearNotes)
  $('#modalX')?.addEventListener('click', closeModal)
  $('#modalScrim')?.addEventListener('click', closeModal)
  wirePlatformSwitch()

  $('#avatarBtn')?.addEventListener('click', () => {
    goTo(isSignedIn() ? 'profile' : 'login')
  })

  // Click-away closes the notification panel, but a click inside it must not.
  document.addEventListener('click', (e) => {
    const panel = $('#panel')
    if (!panel?.classList.contains('open')) return
    if (panel.contains(e.target) || $('#bellBtn')?.contains(e.target)) return
    closePanel()
  })

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    closeModal()
    closePanel()
    closeDrawer()
  })

  // Settings lives inside re-rendered markup, so delegate all of it.
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'bioForm') {
      e.preventDefault()
      saveBio($('#bioSaveBtn'))
    }
    if (e.target.id === 'nameForm') {
      e.preventDefault()
      saveName($('#nameSaveBtn'))
    }
  })

  document.addEventListener('click', (e) => {
    if (e.target.closest('#signOutBtn')) signOut()

    const revoke = e.target.closest('#revokeBtn')
    if (revoke) revokeSessions(revoke)

    const kindChip = e.target.closest('.kind-chip')
    if (kindChip) toggleNoteKind(kindChip)

    // The real <input type="file"> is hidden — a styled button opens it, so the
    // control matches every other button on the page instead of rendering the
    // browser's default file widget.
    const pick = e.target.closest('[data-pick]')
    if (pick) $(`#${pick.dataset.pick}`)?.click()

    const removeImg = e.target.closest('[data-remove-img]')
    if (removeImg) removeProfileImage(removeImg.dataset.removeImg, removeImg)
  })

  // Switches report through `change`, not `click`, so a keyboard toggle counts.
  document.addEventListener('change', (e) => {
    const el = e.target

    // File pickers also report through `change`. Checked before the id gate
    // below because these are matched by data attribute, not by id.
    if (el?.dataset?.upload) {
      uploadProfileImage(el.dataset.upload, el.files?.[0], el)
      return
    }

    if (!el?.id) return

    if (el.id === 'hideBoardToggle') {
      saveSetting({ hiddenFromLeaderboard: el.checked }, { revert: () => { el.checked = !el.checked } })
    }
    if (el.id === 'dmNotesToggle') {
      saveSetting({ dmNotifications: el.checked }, { revert: () => { el.checked = !el.checked } })
    }
    if (el.id === 'reduceMotionToggle') {
      setLocalPref('reduceMotion', el.checked)
      toast(el.checked ? 'Motion reduced' : 'Animations on', 'ok')
    }
    if (el.id === 'confirmSignOutToggle') {
      setLocalPref('confirmSignOut', el.checked)
    }
  })
}

function wireAuthForms() {
  $('#loginPhoneForm')?.addEventListener('submit', (e) => {
    e.preventDefault()
    sendOtp('login', $('#loginPhone').value, $('#loginSendBtn'))
  })
  $('#signupPhoneForm')?.addEventListener('submit', (e) => {
    e.preventDefault()
    sendOtp('signup', $('#signupPhone').value, $('#signupSendBtn'))
  })
  $('#signupForm')?.addEventListener('submit', (e) => {
    e.preventDefault()
    submitRegistration($('#regSubmitBtn'))
  })

  $('#otpVerifyBtn')?.addEventListener('click', () => submitOtp('login', $('#otpVerifyBtn')))
  $('#signupVerifyBtn')?.addEventListener('click', () => submitOtp('signup', $('#signupVerifyBtn')))

  $('#otpBackBtn')?.addEventListener('click', () => showStep('login', 1))
  $('#signupBackBtn')?.addEventListener('click', () => showStep('signup', 1))

  $('#otpResendBtn')?.addEventListener('click', () =>
    sendOtp('login', state.otp.phone ?? $('#loginPhone').value, $('#otpResendBtn')))
  $('#signupResendBtn')?.addEventListener('click', () =>
    sendOtp('signup', state.otp.phone ?? $('#signupPhone').value, $('#signupResendBtn')))

  // Auto-submit once all six digits are in — one less tap on mobile.
  wireOtpRow('otpRow', () => submitOtp('login', $('#otpVerifyBtn')))
  wireOtpRow('signupOtpRow', () => submitOtp('signup', $('#signupVerifyBtn')))
}

function wireLeaderboardSearch() {
  const search = $('#lbSearch')
  if (!search) return
  let timer = null
  search.addEventListener('input', () => {
    clearTimeout(timer)
    // Filtering is local to the already-fetched rows, so this debounce is
    // purely to avoid re-rendering 100 nodes on every keystroke.
    timer = setTimeout(() => filterBoard(search.value), 120)
  })
}

/* ──────────────────────────────── boot ────────────────────────────────── */

function wireConnection() {
  const banner = $('#offline')
  onConnectionChange((up) => {
    banner?.classList.toggle('is-on', !up)
    if (up) {
      // Reachable again — drop the caches so the next navigation is fresh.
      loaded.delete(current)
      state.boardCache.clear()
    }
  })

  onAuthLost(() => {
    if (!state.me) return
    state.me = null
    state.needsRegistration = false
    loaded.clear()
    paintAvatar()
    toast('Your session expired — sign in again.', 'err')
    goTo('login')
  })

  // Coming back to a backgrounded tab is the natural moment to re-check for
  // new alerts without polling on a timer.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isSignedIn()) loadNotifications()
  })
}

async function boot() {
  // Before initMotion(): the reveal observer checks for `.no-motion` when it
  // decides whether to run at all.
  applyLocalPrefs()
  initMotion()
  wireShell()
  wireGlobalClicks()
  wireAuthForms()
  wireLeaderboardSearch()
  wireConnection()

  window.addEventListener('hashchange', () => {
    clearInterval(seasonTimer)
    render()
  })

  paintAvatar()

  // Session first: routes are auth-gated and the nav avatar depends on it.
  if (hasSession()) await refreshSession()

  await render()

  if (isSignedIn()) loadNotifications()
}

boot()

