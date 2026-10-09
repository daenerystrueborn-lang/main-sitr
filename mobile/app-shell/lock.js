/* Optional app lock: fingerprint / face / screen lock. Off by default, switched on in Settings. */
import { P } from './prefs.js'
import { call, can } from './native.js'

const TOKEN = 'astral:token'
const AFTER = { now: 0, '1m': 60e3, '5m': 300e3 }
let locked = false, hiddenAt = 0, overlay = null, skipUntil = 0

/** System dialogs (share sheet, permission prompts) background the app briefly: don't lock because of those. */
export const skipNextLock = (ms = 30000) => { skipUntil = Date.now() + ms }

export async function available() {
  if (!can()) return { ok: false, why: 'App lock only works in the Android app.' }
  try {
    const r = await call('BiometricAuthNative', 'checkBiometry')
    const ok = !!(r?.isAvailable || r?.deviceIsSecure)
    return { ok, why: ok ? '' : 'Set up a fingerprint, face or screen lock in your phone settings first.' }
  } catch { return { ok: false, why: 'App lock is not available on this phone.' } }
}
export async function authenticate(reason = 'Unlock Astral') {
  skipNextLock(60000)
  try {
    await call('BiometricAuthNative', 'internalAuthenticate', { reason, cancelTitle: 'Cancel', allowDeviceCredential: true,
      androidTitle: 'Astral', androidSubtitle: reason, androidConfirmationRequired: false })
    return true
  } catch { return false }
}

function build() {
  overlay = document.createElement('div')
  overlay.id = 'appLock'
  overlay.innerHTML = '<div class="lk-box"><img class="lk-sun" src="assets/img/favicon.png" alt=""><h2>Astral is locked</h2><p>Unlock with your fingerprint, face or screen lock.</p><button type="button" class="btn btn-primary" id="lkGo">Unlock</button></div>'
  document.body.appendChild(overlay)
  overlay.querySelector('#lkGo').addEventListener('click', tryUnlock)
}
async function tryUnlock() {
  if (!locked) return
  if (await authenticate()) unlock()
}
function lock() {
  if (!P.lock || locked) return
  try { if (!localStorage.getItem(TOKEN)) return } catch {}
  locked = true
  if (!overlay) build()
  overlay.classList.add('on'); document.documentElement.classList.add('is-locked')
  setTimeout(tryUnlock, 250)
}
function unlock() { locked = false; overlay?.classList.remove('on'); document.documentElement.classList.remove('is-locked') }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return }
  if (!P.lock || locked || !hiddenAt || Date.now() < skipUntil) return
  if (Date.now() - hiddenAt >= (AFTER[P.lockAfter] ?? 60e3)) lock()
})
if (P.lock && can()) lock()
