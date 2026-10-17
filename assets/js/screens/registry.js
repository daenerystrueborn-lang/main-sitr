/**
 * screens/registry.js - every screen's view markup, in DOM order.
 *
 * The entry (app.js) mounts all of these into #screenRoot at boot so that
 * `$$('.view')`, delegated handlers, and the mobile app shell enhancements
 * keep working exactly as they did when the markup lived in index.html.
 * Data loading stays lazy per route - that's the router's job.
 */
import { homeHtml } from './home.js'
import { charactersHtml } from './characters.js'
import { leaderboardHtml } from './leaderboard.js'
import { seasonHtml } from './season.js'
import { premiumHtml } from './premium.js'
import { shopHtml } from './shop.js'
import { cardsHtml } from './cards.js'
import { profileHtml } from './profile.js'
import { settingsHtml } from './settings.js'
import { loginHtml, signupHtml } from './auth.js'
import { notfoundHtml } from './notfound.js'

export const SCREENS = [
  homeHtml,
  charactersHtml,
  leaderboardHtml,
  seasonHtml,
  premiumHtml,
  shopHtml,
  cardsHtml,
  profileHtml,
  settingsHtml,
  loginHtml,
  signupHtml,
  notfoundHtml,
]
