/**
 * router.js - the hash router and the route table.
 *
 * Shape: one hash route per screen module (assets/js/screens/*), each with a
 * `load()` that fetches and renders. Routes are lazy and cached per session
 * (`loaded`), so flicking between tabs doesn't re-hit the API, while
 * `invalidate()` (core/state.js) exists for the places that must be fresh
 * after a mutation.
 *
 * NOTE: the routes table below is patched by mobile/scripts/prepare-www.mjs
 * when the Android app is bundled (it adds the app-only welcome/pokemon/hub
 * routes). Keep the literal `404:` line and its formatting in place.
 */
import { ApiError, hasSession } from '../api.js'
import { $, $$, toast } from '../ui.js'
import { state, loaded, isSignedIn } from './state.js'
import { reportError } from './shared.js'
import { closePanel, closeDrawer } from './shell.js'
import { refreshSession, setPendingRoute } from './session.js'
import { loadHome } from '../screens/home.js'
import { loadCharacters } from '../screens/characters.js'
import { loadLeaderboard } from '../screens/leaderboard.js'
import { loadSeason } from '../screens/season.js'
import { loadShop } from '../screens/shop.js'
import { loadCards } from '../screens/cards.js'
import { loadPremium } from '../screens/premium.js'
import { loadProfile } from '../screens/profile.js'
import { loadSettings } from '../screens/settings.js'
import { loadAuthMeta } from '../screens/auth.js'

const routes = {
  home: { view: 'view-home', title: 'Home', load: loadHome },
  // No standalone Characters page: the roster lives in the Shop (Heroes shelf),
  // so a stray #/characters link opens the Shop instead of a removed screen.
  characters: { view: 'view-shop', title: 'Shop', load: loadShop },
  leaderboard: { view: 'view-leaderboard', title: 'Leaderboard', load: loadLeaderboard },
  season: { view: 'view-season', title: 'Season', load: loadSeason },
  // Neither gates on auth - both are browsable signed out, and only the buy
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

export async function render() {
  let name = parseHash()

  // Guard the signed-in-only pages. Bounce to login rather than showing an
  // empty profile, and remember where they were headed.
  if (routes[name].auth && !isSignedIn()) {
    if (hasSession()) await refreshSession()
    if (!isSignedIn()) {
      setPendingRoute(name)
      name = 'login'
      toast('Sign in to see that page')
    }
  }

  const route = routes[name]
  state.route = name

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

export function goTo(name) {
  if (location.hash.replace(/^#\/?/, '') === name) return render()
  location.hash = `#/${name === 'home' ? '' : name}`
}
