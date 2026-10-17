/**
 * shell.js - the chrome every screen sits inside: nav avatar, drawer,
 * notification panel/bell, modal close, and the global Escape/click-away
 * behaviour. Screen-specific wiring lives in ../wiring.js or the screen itself.
 */
import { api, hasSession } from '../api.js'
import { $, esc, attr, iconSvg, initials, toast, busy, skeletonRows, emptyState, relTime, closeModal } from '../ui.js'
import { state, isSignedIn } from './state.js'
import { reportError } from './shared.js'
import { goTo } from './router.js'

export function closePanel() {
  $('#panel')?.classList.remove('open')
  $('#panelBackdrop')?.classList.remove('open')
  $('#bellBtn')?.setAttribute('aria-expanded', 'false')
}

export function togglePanel() {
  const panel = $('#panel')
  if (!panel) return
  const open = panel.classList.toggle('open')
  $('#panelBackdrop')?.classList.toggle('open', open)
  $('#bellBtn')?.setAttribute('aria-expanded', String(open))
  if (open) loadNotifications()
}

export function closeDrawer() {
  $('#drawer')?.classList.remove('open')
  $('#scrim')?.classList.remove('open')
  $('#menuToggle')?.setAttribute('aria-expanded', 'false')
}

export function toggleDrawer() {
  const open = $('#drawer')?.classList.toggle('open')
  $('#scrim')?.classList.toggle('open', open)
  $('#menuToggle')?.setAttribute('aria-expanded', String(!!open))
}

/** Nav avatar doubles as the sign-in affordance when signed out. */
export function paintAvatar() {
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
    btn.setAttribute('aria-label', `${p.name} - your profile`)
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
  // in. Same treatment as the drawer link - one auth affordance, one state.
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

export function paintBell() {
  const dot = $('#bellDot')
  if (dot) dot.classList.toggle('is-on', (state.notes.unread ?? 0) > 0)
}

/* ───────────────────────────── notifications ──────────────────────────── */

const NOTE_ICONS = {
  battle: 'battle', reward: 'reward', season: 'season', premium: 'premium', payment: 'payment',
  security: 'security', system: 'info', daily: 'calendar', stamina: 'stamina', dungeon: 'dungeon',
}

export function noteIcon(kind) { return iconSvg(NOTE_ICONS[kind] ?? 'info', 'note-icon') }

export async function loadNotifications() {
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

export function paintNotifications() {
  const body = $('#panelBody')
  if (!body) return
  const items = state.notes.items ?? []
  body.dataset.filled = '1'

  if (!items.length) {
    body.innerHTML = emptyState('moon', 'Nothing waiting', 'You are all caught up.')
    return
  }

  body.innerHTML = items.map(n => {
    // Derived alerts are dismissible too. They used to have no X, on the theory
    // that they clear themselves once the underlying thing is dealt with - but
    // a bell holding only derived alerts then had no way to be emptied, which
    // read as if the entries were hardcoded. The server now hides a dismissed
    // alert by signature until its text changes, so the X is honest.
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
        <button class="note-x" data-del="${attr(n.id)}" aria-label="Dismiss">×</button>
      </div>`
  }).join('')
}

export async function markAllRead() {
  const stop = busy($('#readAllBtn'))
  try {
    await api.markAllNotificationsRead()
    // Everything the user can see gets marked read - including derived alerts,
    // which the server now acknowledges by signature so they don't come back
    // unread on the next poll. The alert itself stays in the list (the work is
    // still outstanding), it just stops lighting the bell.
    for (const n of state.notes.items) n.read = true
    state.notes.unread = 0
    paintBell()
    paintNotifications()
  } catch (err) { reportError(err) } finally { stop() }
}

export async function clearNotes() {
  const stop = busy($('#clearNotesBtn'))
  try {
    await api.clearNotifications()
    // Clear empties the whole panel now, derived alerts included - the server
    // dismisses those by signature in the same request, so they don't reappear
    // on the next poll.
    state.notes.items = []
    state.notes.unread = 0
    paintBell()
    paintNotifications()
    toast('History cleared', 'ok')
  } catch (err) { reportError(err) } finally { stop() }
}

export async function deleteNote(id) {
  try {
    await api.deleteNotification(id)
    state.notes.items = state.notes.items.filter(n => n.id !== id)
    paintNotifications()
  } catch (err) { reportError(err) }
}

/* ────────────────────────────── chrome wiring ─────────────────────────── */

export function wireShell() {
  $('#bellBtn')?.addEventListener('click', (e) => { e.stopPropagation(); togglePanel() })
  $('#panelBackdrop')?.addEventListener('click', closePanel)
  $('#menuToggle')?.addEventListener('click', toggleDrawer)
  $('#scrim')?.addEventListener('click', closeDrawer)
  $('#readAllBtn')?.addEventListener('click', markAllRead)
  $('#clearNotesBtn')?.addEventListener('click', clearNotes)
  $('#modalX')?.addEventListener('click', closeModal)
  $('#modalScrim')?.addEventListener('click', closeModal)

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
}
