/* Settings tab: game settings for the Android app (replaces the website's account settings page). */
import { setToken } from '../js/api.js'
import { api } from '../js/api.js'
import { toast } from '../js/ui.js'
import { $, $$, esc } from './core.js'
import { P, setPref, resetPrefs } from './prefs.js'
import * as N from './notify.js'
import * as L from './lock.js'
import * as FB from './feedback.js'

const seg = (k, title, desc, opts) => `
  <div class="st-row st-col"><div class="st-txt"><b>${title}</b><p>${desc}</p></div>
    <div class="st-seg" data-k="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${P[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`
const tog = (k, title, desc) => `
  <div class="st-row"><div class="st-txt"><b>${title}</b><p>${desc}</p></div>
    <button class="st-sw ${P[k] ? 'on' : ''}" data-t="${k}" role="switch" aria-checked="${!!P[k]}"><i></i></button></div>`

const swx = (id, title, desc, on) => `
  <div class="st-row"><div class="st-txt"><b>${title}</b><p>${desc}</p></div>
    <button class="st-sw ${on ? 'on' : ''}" data-x="${id}" role="switch" aria-checked="${!!on}"><i></i></button></div>`

const wipeCaches = () => {
  try { Object.keys(localStorage).filter(k => k.startsWith('astral:c:') || k === 'astral:welcome' || k === 'astral:pk-meta').forEach(k => localStorage.removeItem(k)) } catch {}
}

export function renderSettings({ pickAvatar } = {}) {
  const view = $('#view-settings'); if (!view) return
  let root = $('#appSettings', view)
  if (!root) { root = document.createElement('div'); root.id = 'appSettings'; root.className = 'page'; view.appendChild(root) }

  const draw = () => {
    root.innerHTML = `
      <div class="st-group"><h4>Performance</h4>
        ${tog('lite', 'Performance mode', 'Turns off shadows and fade effects so menus feel instant. Recommended.')}
        ${seg('sprites', 'Animated Pokémon', 'Moving sprites cost battery and can lag lists.', [['battle', 'Battle only'], ['all', 'Everywhere'], ['off', 'Off']])}
      </div>
      <div class="st-group"><h4>Battle</h4>
        ${seg('speed', 'Battle speed', 'How long each move and message waits. You can also tap the scene to skip.', [['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']])}
        ${tog('effects', 'Attack effects', 'Type bursts, flashes and floating stat changes.')}
        ${tog('weather', 'Weather overlay', 'Rain, sun, sand and snow tint on the battlefield.')}
        ${tog('backgrounds', 'Battle backgrounds', 'Load Showdown scenery. Off uses a plain gradient and saves data.')}
      </div>
      <div class="st-group"><h4>Sound &amp; touch</h4>
        ${tog('sounds', 'Sound effects', 'Taps, equips, catches, wins and card pulls.')}
        ${seg('volume', 'Volume', 'How loud the effects are. Your phone volume still applies.', [['low', 'Low'], ['mid', 'Medium'], ['high', 'High']])}
        ${tog('haptics', 'Vibration', 'Small buzzes on taps, hits and rewards.')}
      </div>
      <div class="st-group"><h4>Notifications</h4>
        ${swx('notifDaily', 'Daily reminder', 'A nudge to come back and hunt.', P.notifDaily)}
        ${seg('notifHour', 'Reminder time', 'When the daily reminder arrives.', [['9', '9 am'], ['13', '1 pm'], ['19', '7 pm'], ['21', '9 pm']])}
        ${swx('notifSeason', 'Season ending', 'A heads-up 24 hours before the season ends.', P.notifSeason)}
        ${swx('notifHurt', 'Team needs healing', 'Reminds you if you leave a battle with a hurt team.', P.notifHurt)}
        <div class="st-row"><div class="st-txt"><b>Send a test</b><p>Shows a notification in a few seconds.</p></div>
          <button class="btn btn-sm" id="stNotifTest">Test</button></div>
      </div>
      <div class="st-group"><h4>Security</h4>
        ${swx('lock', 'App lock', 'Ask for your fingerprint, face or screen lock to open Astral.', P.lock)}
        ${seg('lockAfter', 'Lock after', 'How long Astral can sit in the background before it locks.', [['now', 'Right away'], ['1m', '1 minute'], ['5m', '5 minutes']])}
      </div>
      <div class="st-group"><h4>Profile</h4>
        <div class="st-row"><div class="st-txt"><b>Pokémon avatar</b><p>Shown on Welcome and in the top bar on this phone.</p></div>
          <button class="btn btn-sm" id="stAvatar">Change</button></div>
      </div>
      <div class="st-group"><h4>Data</h4>
        <div class="st-row"><div class="st-txt"><b>Clear saved data</b><p>Removes the offline copy that makes pages open instantly. It rebuilds itself.</p></div>
          <button class="btn btn-sm" id="stClear">Clear</button></div>
        <div class="st-row"><div class="st-txt"><b>Reset game settings</b><p>Back to the recommended defaults.</p></div>
          <button class="btn btn-sm" id="stReset">Reset</button></div>
      </div>
      <div class="st-group"><h4>Account</h4>
        <div class="st-row"><div class="st-txt"><b id="stWho">Signed in</b><p>Astral for Android</p></div>
          <button class="btn btn-sm st-danger" id="stOut">Sign out</button></div>
      </div>`
    $$('.st-seg', root).forEach(g => g.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return
      setPref(g.dataset.k, b.dataset.v); $$('[data-v]', g).forEach(x => x.classList.toggle('on', x === b))
    }))
    $$('.st-sw', root).forEach(s => s.addEventListener('click', () => {
      const on = !P[s.dataset.t]; setPref(s.dataset.t, on); s.classList.toggle('on', on); s.setAttribute('aria-checked', on)
    }))
    $$('.st-seg', root).forEach(g => g.addEventListener('click', (e) => { if (g.dataset.k === 'notifHour') N.syncDaily() }))
    $$('.st-sw[data-t]', root).forEach(sw => sw.addEventListener('click', () => { if (sw.dataset.t === 'sounds' && P.sounds) FB.tap(); if (sw.dataset.t === 'haptics' && P.haptics) FB.pick() }))
    const flip = (sw, on) => { sw.classList.toggle('on', on); sw.setAttribute('aria-checked', on) }
    $$('.st-sw[data-x]', root).forEach(sw => sw.addEventListener('click', async () => {
      const id = sw.dataset.x, want = !P[id]
      if (id === 'lock') {
        if (want) {
          const a = await L.available(); if (!a.ok) return toast(a.why)
          if (!(await L.authenticate('Confirm to turn on app lock'))) return toast('App lock was not turned on.')
        } else if (!(await L.authenticate('Confirm to turn off app lock'))) return toast('App lock stays on.')
        setPref('lock', want); flip(sw, want); toast(want ? 'App lock is on.' : 'App lock is off.', 'ok'); return
      }
      if (want) {
        if (!N.supported()) return toast('Notifications only work in the Android app.')
        if (!(await N.ask())) return toast('Allow notifications for Astral in your phone settings.')
      }
      setPref(id, want); flip(sw, want)
      if (id === 'notifDaily') N.syncDaily(); else if (id === 'notifSeason') N.seasonEnds(0); else if (id === 'notifHurt' && !want) N.teamHurt(false)
    }))
    $('#stNotifTest', root).addEventListener('click', async () => {
      if (!N.supported()) return toast('Notifications only work in the Android app.')
      if (!(await N.ask())) return toast('Allow notifications for Astral in your phone settings.')
      toast((await N.test()) ? 'Sending in a few seconds…' : 'Could not schedule that.', 'ok')
    })
    $('#stAvatar', root).addEventListener('click', () => pickAvatar?.(() => {}))
    $('#stReset', root).addEventListener('click', () => { resetPrefs(); draw(); toast('Settings reset', 'ok') })
    $('#stClear', root).addEventListener('click', () => { wipeCaches(); toast('Saved data cleared', 'ok'); setTimeout(() => location.reload(), 350) })
    $('#stOut', root).addEventListener('click', () => {
      if (!confirm('Sign out of Astral?')) return
      wipeCaches(); setToken(null); location.hash = '#/login'
    })
    api.me().then(r => { const n = $('#stWho', root); if (n && r?.player?.name) n.textContent = `Signed in as ${r.player.name}` }).catch(() => {})
  }
  draw()
}
