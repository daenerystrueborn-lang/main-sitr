/**
 * prefs.js - device-local preferences.
 *
 * These deliberately do NOT go to the API: they're about this browser
 * (motion, confirmations), not about the character, and syncing them would
 * mean a phone's choice silently changing a laptop's. Anything the bot also
 * needs to know lives on the player record instead.
 *
 * Split out of the settings screen because sign-out (session.js) and boot
 * both read them too.
 */

const LOCAL_PREFS_KEY = 'astral:prefs'
const LOCAL_PREF_DEFAULTS = { reduceMotion: false, confirmSignOut: true }

export function localPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_PREFS_KEY) ?? '{}')
    return { ...LOCAL_PREF_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) }
  } catch { return { ...LOCAL_PREF_DEFAULTS } }
}

export function setLocalPref(key, value) {
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
export function applyLocalPrefs() {
  const prefs = localPrefs()
  document.documentElement.classList.toggle('no-motion', !!prefs.reduceMotion)
}
