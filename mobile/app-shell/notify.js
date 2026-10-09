/* Local notifications (scheduled on the phone, no server needed): daily reminder, season ending, hurt team. */
import { P } from './prefs.js'
import { call, can } from './native.js'
import { skipNextLock } from './lock.js'

const CH = 'astral', ID = { daily: 1001, season: 1002, hurt: 1003, test: 1999 }
let channelReady = false
const SEASON_KEY = 'astral:season-end'
const DAILY = [
  ['Your team is rested', 'A wild Pokémon is waiting. Ready for a hunt?'],
  ['New cards, new fights', 'Check the shop and pull a card today.'],
  ['The sun is up', 'Come back and keep climbing the ranks.'],
]

export const supported = () => can()
async function channel() {
  if (channelReady) return
  try { await call('LocalNotifications', 'createChannel', { id: CH, name: 'Astral reminders', description: 'Hunts, seasons and team care', importance: 3, visibility: 1 }) } catch {}
  channelReady = true
}
export async function permission() { try { return (await call('LocalNotifications', 'checkPermissions')).display } catch { return 'denied' } }
export async function ask() {
  if ((await permission()) === 'granted') return true
  skipNextLock(60000)
  try { return (await call('LocalNotifications', 'requestPermissions')).display === 'granted' } catch { return false }
}
const cancel = (...ids) => call('LocalNotifications', 'cancel', { notifications: ids.map(id => ({ id })) }).catch(() => {})
async function schedule(n) {
  if (!can() || (await permission()) !== 'granted') return false
  await channel()
  try { await call('LocalNotifications', 'schedule', { notifications: [{ channelId: CH, smallIcon: 'ic_stat_astral', iconColor: '#D4AF37', ...n }] }); return true } catch { return false }
}

export async function syncDaily() {
  if (!can()) return
  await cancel(ID.daily)
  if (!P.notifDaily) return
  const [title, body] = DAILY[new Date().getDate() % DAILY.length]
  await schedule({ id: ID.daily, title, body, schedule: { on: { hour: Number(P.notifHour) || 19, minute: 0 }, allowWhileIdle: true } })
}
export async function seasonEnds(endsAt) {
  if (!can()) return
  if (endsAt) { try { localStorage.setItem(SEASON_KEY, String(endsAt)) } catch {} }
  else { try { endsAt = Number(localStorage.getItem(SEASON_KEY)) || 0 } catch {} }
  const at = (endsAt || 0) - 24 * 3600e3
  if (!P.notifSeason || at < Date.now() + 60e3) { await cancel(ID.season); return }
  await schedule({ id: ID.season, title: 'Season ends tomorrow', body: 'Last chance to push your tier and claim rewards.', schedule: { at: new Date(at).toISOString(), allowWhileIdle: true } })
}
export async function teamHurt(hurt) {
  if (!can()) return
  if (!hurt || !P.notifHurt) { await cancel(ID.hurt); return }
  await schedule({ id: ID.hurt, title: 'Your team is hurt', body: 'Heal up before your next battle.', schedule: { at: new Date(Date.now() + 45 * 60e3).toISOString(), allowWhileIdle: true } })
}
export const test = () => schedule({ id: ID.test, title: 'Astral', body: 'Notifications are working.', schedule: { at: new Date(Date.now() + 3000).toISOString(), allowWhileIdle: true } })
export async function syncAll() { await syncDaily(); await seasonEnds(0) }

if (can()) syncAll()
