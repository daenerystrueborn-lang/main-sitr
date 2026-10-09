/* Game settings for this phone (not the website's account settings). Saved in localStorage. */
const KEY = 'astral:prefs'
export const DEF = { lite: true, sprites: 'battle', speed: 'normal', effects: true, weather: true, backgrounds: true,
  haptics: true, sounds: true, volume: 'mid',
  notifDaily: false, notifHour: '19', notifSeason: false, notifHurt: false,
  lock: false, lockAfter: '1m' }
export const P = { ...DEF }
try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || '{}')) } catch {}

export const speedMul = () => ({ normal: 1, fast: 0.5, instant: 0 })[P.speed] ?? 1
export function applyPrefs() { document.body?.classList.toggle('lite', !!P.lite) }
export function setPref(k, v) {
  P[k] = v
  try { localStorage.setItem(KEY, JSON.stringify(P)) } catch {}
  applyPrefs()
}
export function resetPrefs() { Object.assign(P, DEF); try { localStorage.removeItem(KEY) } catch {}; applyPrefs() }
applyPrefs()
