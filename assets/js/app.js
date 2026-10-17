/**
 * app.js - the entry point.
 *
 * The rebuild split the old monolith into:
 *   core/     - state, prefs, shared helpers, shell chrome, session, router
 *   screens/  - one module per screen (markup + loader + screen-private wiring)
 *   wiring.js - delegated events that span screens
 * This file does exactly what's left: mount the screens, wire everything
 * once, and boot the router.
 */
import { onConnectionChange, onAuthLost, hasSession } from './api.js'
import { $, initMotion, toast } from './ui.js'
import { state, loaded, isSignedIn } from './core/state.js'
import { applyLocalPrefs } from './core/prefs.js'
import { paintAvatar, loadNotifications, wireShell } from './core/shell.js'
import { refreshSession } from './core/session.js'
import { render, goTo } from './core/router.js'
import { SCREENS } from './screens/registry.js'
import { wireDelegates } from './wiring.js'
import { wireAuthForms } from './screens/auth.js'
import { wirePlatformSwitch } from './screens/home.js'
import { wireLeaderboardSearch } from './screens/leaderboard.js'
import { stopSeasonTimer } from './screens/season.js'

/** Inject every screen's <main class="view"> into the page, once, at boot. */
function mountScreens() {
  const root = $('#screenRoot')
  if (!root) return
  root.innerHTML = SCREENS.join('\n')
}

function wireConnection() {
  const banner = $('#offline')
  onConnectionChange((up) => {
    banner?.classList.toggle('is-on', !up)
    if (up) {
      // Reachable again - drop the caches so the next navigation is fresh.
      loaded.delete(state.route)
      state.boardCache.clear()
    }
  })

  onAuthLost(() => {
    if (!state.me) return
    state.me = null
    state.needsRegistration = false
    loaded.clear()
    paintAvatar()
    toast('Your session expired - sign in again.', 'err')
    goTo('login')
  })

  // Coming back to a backgrounded tab is the natural moment to re-check for
  // new alerts without polling on a timer.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isSignedIn()) loadNotifications()
  })
}

async function boot() {
  // Screens first: every wire* below reaches into the mounted markup.
  mountScreens()

  // Before initMotion(): the reveal observer checks for `.no-motion` when it
  // decides whether to run at all.
  applyLocalPrefs()
  initMotion()
  wireShell()
  wireDelegates()
  wireAuthForms()
  wirePlatformSwitch()
  wireLeaderboardSearch()
  wireConnection()

  window.addEventListener('hashchange', () => {
    stopSeasonTimer()
    render()
  })

  paintAvatar()

  // Session first: routes are auth-gated and the nav avatar depends on it.
  if (hasSession()) await refreshSession()

  await render()

  if (isSignedIn()) loadNotifications()
}

boot()
