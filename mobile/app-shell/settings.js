/* Settings tab: game settings for the Android app (replaces the website's account settings page). */
import { setToken } from '../js/api.js'
import { api } from '../js/api.js'
import { toast } from '../js/ui.js'
import { $, $$, esc } from './core.js'
import { P, setPref, resetPrefs } from './prefs.js'

const seg = (k, title, desc, opts) => `
  <div class="st-row st-col"><div class="st-txt"><b>${title}</b><p>${desc}</p></div>
    <div class="st-seg" data-k="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${P[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`
const tog = (k, title, desc) => `
  <div class="st-row"><div class="st-txt"><b>${title}</b><p>${desc}</p></div>
    <button class="st-sw ${P[k] ? 'on' : ''}" data-t="${k}" role="switch" aria-checked="${!!P[k]}"><i></i></button></div>`

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
