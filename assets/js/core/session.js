/**
 * session.js - signing in, signing out, and where to land afterwards.
 *
 * The pendingRoute slot lives here (not in the router) so the post-sign-in
 * landing line stays in one file: the router SETS it via setPendingRoute()
 * when it bounces an auth-gated page to #/login, and afterSignIn() consumes it.
 */
import { api } from '../api.js'
import { $, toast } from '../ui.js'
import { state, loaded, invalidate } from './state.js'
import { confirmAction, reportError } from './shared.js'
import { paintAvatar, paintBell, loadNotifications } from './shell.js'
import { goTo } from './router.js'
import { localPrefs } from './prefs.js'
import { loadRegisterOptions, showStep } from '../screens/auth.js'

/** Where to land after a successful sign-in. */
let pendingRoute = null

/** The router records the auth-gated route here before bouncing to login. */
export function setPendingRoute(name) {
  pendingRoute = name
}

export async function refreshSession() {
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

export async function afterSignIn(player, { needsRegistration = false } = {}) {
  state.me = player ?? null
  state.needsRegistration = needsRegistration

  if (needsRegistration) {
    await loadRegisterOptions()
    showStep('signup', 3)
    goTo('signup')
    toast('Number verified, now build your character', 'ok')
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

export async function signOut() {
  // Opt-out guard from Settings → This device. Covers every entry point -
  // the drawer, the footer, and the settings page's own button - so the
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
