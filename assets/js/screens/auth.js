/**
 * screens/auth.js - the sign-in and sign-up screens and their shared OTP flow.
 *
 * Both flows have three steps: signing in is name → confirm the number →
 * code, signing up is number → code → character.
 */
import { $, esc, attr, titleCase, busy, relTime, toast } from '../ui.js'
import { api, ApiError } from '../api.js'
import { state, invalidate } from '../core/state.js'
import { perkIcon, ensureMeta, reportError, fieldError } from '../core/shared.js'
import { paintAvatar, loadNotifications } from '../core/shell.js'
import { goTo } from '../core/router.js'
import { afterSignIn } from '../core/session.js'

export const loginHtml = `
<main class="view" id="view-login">
  <div class="auth-wrap">
    <div class="auth-card">

      <div class="auth-step active" id="loginStep1">
        <h2>Sign in</h2>
        <p class="subtext" style="margin-bottom:22px;">Type your username. We'll find your account and DM a 6-digit code to the WhatsApp number attached to it.</p>
        <form id="loginNameForm" novalidate>
          <div class="field" id="loginNameField">
            <label for="loginName">Username</label>
            <input id="loginName" type="text" inputmode="text" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="e.g. Astral">
            <p class="field-hint">Your username, or the name on your profile. Capitals don't matter.</p>
            <p class="field-err" id="loginNameErr"></p>
          </div>
          <button class="btn btn-primary btn-block" id="loginFindBtn" type="submit">Find my account</button>
        </form>
        <div class="auth-alt">
          <span>New here?</span><a href="#/signup" data-route="signup">Create a character</a>
        </div>
      </div>

      <div class="auth-step" id="loginStep2">
        <h2>Is this you?</h2>
        <p class="subtext" style="margin-bottom:18px;">Check the number before we send anything.</p>
        <div class="card" id="loginConfirmCard" style="margin-bottom:18px;">
          <div style="display:flex;align-items:center;gap:14px;">
            <img id="loginFoundArt" alt="" width="56" height="56"
                 style="width:56px;height:56px;border-radius:14px;object-fit:cover;flex:0 0 auto;background:rgba(255,255,255,.06);">
            <div style="min-width:0;">
              <strong id="loginFoundName" style="display:block;font-size:1.05rem;">&nbsp;</strong>
              <span class="subtext" id="loginFoundSub" style="display:block;"></span>
            </div>
          </div>
          <p class="field-hint" style="margin-top:14px;margin-bottom:0;">
            The code goes to <strong id="loginFoundPhone">the WhatsApp account linked to this character</strong>.
          </p>
        </div>
        <p class="field-err" id="loginConfirmErr"></p>
        <button class="btn btn-primary btn-block" id="loginSendBtn" type="button">Send the code</button>
        <div class="auth-alt">
          <a id="loginConfirmBackBtn">That's not me</a>
        </div>
      </div>

      <div class="auth-step" id="loginStep3">
        <h2>Enter the code</h2>
        <p class="subtext" id="loginSentTo" style="margin-bottom:22px;">Check your WhatsApp for the code.</p>
        <div class="otp-row" id="otpRow">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 1" autocomplete="one-time-code">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 2">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 3">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 4">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 5">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 6">
        </div>
        <p class="field-err" id="otpErr"></p>
        <button class="btn btn-primary btn-block" id="otpVerifyBtn" type="button" style="margin-top:18px;">Verify and sign in</button>
        <div class="auth-alt">
          <a id="otpResendBtn">Resend code</a>
          <span>·</span>
          <a id="otpBackBtn">Use a different username</a>
        </div>
      </div>

    </div>
  </div>
</main>`

export const signupHtml = `
<main class="view" id="view-signup">
  <div class="auth-wrap">
    <div class="auth-card">

      <div class="auth-step active" id="signupStep1">
        <h2>Join Astral</h2>
        <p class="subtext" style="margin-bottom:22px;">Two steps: verify your WhatsApp number, then build your character.</p>
        <div class="card" id="signupBotCard" style="margin-bottom:18px;"></div>
        <form id="signupPhoneForm" novalidate>
          <div class="field" id="signupPhoneField">
            <label for="signupPhone">WhatsApp number</label>
            <input id="signupPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="e.g. 2348012345678">
            <p class="field-hint">Include your country code.</p>
            <p class="field-err" id="signupPhoneErr"></p>
          </div>
          <button class="btn btn-primary btn-block" id="signupSendBtn" type="submit">Send me a code</button>
        </form>
        <div class="auth-alt">
          <span>Already playing?</span><a href="#/login" data-route="login">Sign in</a>
        </div>
      </div>

      <div class="auth-step" id="signupStep2">
        <h2>Enter the code</h2>
        <p class="subtext" id="signupSentTo" style="margin-bottom:22px;">Check your WhatsApp for the code.</p>
        <div class="otp-row" id="signupOtpRow">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 1" autocomplete="one-time-code">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 2">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 3">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 4">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 5">
          <input type="text" inputmode="numeric" maxlength="1" aria-label="Digit 6">
        </div>
        <p class="field-err" id="signupOtpErr"></p>
        <button class="btn btn-primary btn-block" id="signupVerifyBtn" type="button" style="margin-top:18px;">Verify number</button>
        <div class="auth-alt">
          <a id="signupResendBtn">Resend code</a>
          <span>·</span>
          <a id="signupBackBtn">Use another number</a>
        </div>
      </div>

      <div class="auth-step" id="signupStep3">
        <h2>Build your character</h2>
        <p class="subtext" style="margin-bottom:22px;">You can change everything else later in chat with <code id="regCmd">.register</code>.</p>
        <form id="signupForm" novalidate>
          <div class="field" id="regNameField">
            <label for="regName">Character name</label>
            <input id="regName" type="text" maxlength="20" placeholder="What should the board call you?">
            <p class="field-err" id="regNameErr"></p>
          </div>
          <div class="field">
            <label for="regClass">Class</label>
            <select id="regClass"></select>
            <p class="field-hint" id="regClassHint"></p>
          </div>
          <div class="field">
            <label for="regRace">Race</label>
            <select id="regRace"></select>
            <p class="field-hint" id="regRaceHint"></p>
          </div>
          <button class="btn btn-primary btn-block" id="regSubmitBtn" type="submit">Create my character</button>
        </form>
      </div>

    </div>
  </div>
</main>`

/* ────────────────────────────── auth: shared ──────────────────────────── */

/** Swaps which `.auth-step` is visible for login/signup. */
export function showStep(mode, step) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`${mode}Step${i}`)
    el?.classList.toggle('active', i === step)
  }
}

/** Wires the 6 boxes: auto-advance, backspace, paste-a-whole-code, Enter. */
function wireOtpRow(rowId, onComplete) {
  const row = document.getElementById(rowId)
  if (!row) return
  const boxes = [...row.querySelectorAll('input')]

  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(0, 1)
      box.classList.toggle('is-filled', !!box.value)
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus()
      if (boxes.every(b => b.value)) onComplete?.()
    })

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        boxes[i - 1].focus()
        boxes[i - 1].value = ''
        boxes[i - 1].classList.remove('is-filled')
        e.preventDefault()
      }
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus()
      if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus()
      if (e.key === 'Enter') { e.preventDefault(); onComplete?.() }
    })

    // Pasting the code from the WhatsApp message is the common path - spread
    // it across the boxes instead of dropping 6 digits into the first one.
    box.addEventListener('paste', (e) => {
      const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 6)
      if (!digits) return
      e.preventDefault()
      boxes.forEach((b, j) => {
        b.value = digits[j] ?? ''
        b.classList.toggle('is-filled', !!b.value)
      })
      boxes[Math.min(digits.length, 5)].focus()
      if (digits.length === 6) onComplete?.()
    })
  })
}

function readOtp(rowId) {
  const row = document.getElementById(rowId)
  return [...(row?.querySelectorAll('input') ?? [])].map(b => b.value).join('')
}

function clearOtp(rowId) {
  const row = document.getElementById(rowId)
  for (const b of row?.querySelectorAll('input') ?? []) {
    b.value = ''
    b.classList.remove('is-filled')
  }
  row?.querySelector('input')?.focus()
}

/** Wipes the in-flight attempt so a stale handle can't be reused. */
function resetOtpState(mode = 'login') {
  state.otp = { target: null, masked: null, name: null, mode, registered: false }
}

/**
 * True when the server says the sign-in attempt has gone stale. Handles are
 * good for ten minutes; past that the only cure is to look the name up again,
 * so every caller that sees this sends the player back to step 1 rather than
 * showing an error next to a button that can no longer work.
 */
function isHandleExpired(err) {
  return err instanceof ApiError && err.code === 'handle_expired'
}

/**
 * Step 1 of signing in: look up a username and show what came back.
 *
 * The API takes either the reserved @handle or the character name, so this
 * sends whatever was typed through untouched.
 *
 * Nothing is sent to WhatsApp here, which is the whole reason this step
 * exists. Someone who types a name that turns out to belong to a different
 * player should discover that from the card in front of them, not by making a
 * stranger's phone buzz with a code.
 */
async function findAccount(btn) {
  const typed = ($('#loginName')?.value ?? '').trim()
  fieldError('loginNameField', 'loginNameErr', null)

  if (typed.length < 2) {
    fieldError('loginNameField', 'loginNameErr', 'Enter your username or character name.')
    return
  }

  const stop = busy(btn)
  try {
    const found = await api.lookupAccount(typed)
    resetOtpState('login')
    state.otp.target = { handle: found.handle }
    state.otp.masked = found.maskedPhone ?? null
    state.otp.name = found.name ?? typed
    state.otp.registered = true

    paintFoundAccount(found)
    showStep('login', 2)
  } catch (err) {
    fieldError('loginNameField', 'loginNameErr', err?.message ?? 'Could not find that account.')
    reportError(err)
  } finally { stop() }
}

/** Fills the "is this you?" card from an /auth/lookup result. */
function paintFoundAccount(found) {
  const art = document.getElementById('loginFoundArt')
  if (art) {
    if (found.avatarUrl) {
      art.src = found.avatarUrl
      art.style.display = ''
    } else {
      art.removeAttribute('src')
      art.style.display = 'none'
    }
  }

  const name = document.getElementById('loginFoundName')
  if (name) name.textContent = found.name ?? ''

  const sub = document.getElementById('loginFoundSub')
  if (sub) {
    const bits = []
    // The @handle first when they have one: it's the thing they just typed, so
    // it's the fastest confirmation that the right account came back.
    if (found.username) bits.push(`@${found.username}`)
    if (found.level) bits.push(`Level ${found.level}`)
    if (found.rank?.title) bits.push([found.rank.emoji, found.rank.title].filter(Boolean).join(' '))
    sub.textContent = bits.join(' · ')
  }

  const phone = document.getElementById('loginFoundPhone')
  // No masked number means a LID-keyed WhatsApp account, whose id carries no
  // phone number at all. The DM still lands, there is just nothing to show.
  if (phone) phone.textContent = found.maskedPhone ?? 'the WhatsApp account linked to this character'

  const err = document.getElementById('loginConfirmErr')
  if (err) err.textContent = ''
}

/**
 * Requests a code. Shared by login and signup - the difference is only what
 * identifies the account and which step comes next.
 *
 * `target` is `{ handle }` on the login path (the account was already resolved
 * from a name by findAccount, and the browser never holds the real number) or
 * a typed phone string on the signup path.
 */
async function sendOtp(mode, target, btn) {
  const login = mode === 'login'
  const fieldId = login ? 'loginConfirmCard' : 'signupPhoneField'
  const errId = login ? 'loginConfirmErr' : 'signupPhoneErr'
  fieldError(fieldId, errId, null)

  if (login && !target?.handle) {
    resetOtpState('login')
    fieldError('loginNameField', 'loginNameErr', 'Search for your name again.')
    showStep('login', 1)
    return
  }
  if (!login && String(target ?? '').replace(/\D/g, '').length < 8) {
    fieldError(fieldId, errId, 'Enter a valid WhatsApp number.')
    return
  }

  const stop = busy(btn)
  try {
    const out = await api.requestOtp(target)
    state.otp = {
      target,
      // The login path already has a mask from the lookup; keep it if the
      // send didn't return one (a LID account has no number either way).
      masked: out.maskedPhone ?? (login ? state.otp.masked : String(target)),
      name: login ? state.otp.name : null,
      mode,
      registered: !!out.registered,
    }

    const sentTo = document.getElementById(`${mode}SentTo`)
    if (sentTo) {
      sentTo.innerHTML = state.otp.masked
        ? `Code sent to <strong>${esc(state.otp.masked)}</strong>. It expires ${esc(relTime(out.expiresAt))}.`
        : `Code sent to your WhatsApp. It expires ${esc(relTime(out.expiresAt))}.`
    }

    // The API's own words, which the bot echoes in the DM.
    toast(out.message ?? 'OTP has been sent to your DM', 'ok')
    showStep(mode, login ? 3 : 2)
    clearOtp(login ? 'otpRow' : 'signupOtpRow')

    // Local testing convenience only; the API omits this unless DEV_MODE is on.
    if (out.devCode) toast(`Dev code: ${out.devCode}`)
  } catch (err) {
    if (isHandleExpired(err)) {
      resetOtpState('login')
      fieldError('loginNameField', 'loginNameErr', err.message)
      showStep('login', 1)
    } else {
      fieldError(fieldId, errId, err?.message ?? 'Could not send the code.')
    }
    reportError(err)
  } finally { stop() }
}

async function submitOtp(mode, btn) {
  const login = mode === 'login'
  const rowId = login ? 'otpRow' : 'signupOtpRow'
  const errId = login ? 'otpErr' : 'signupOtpErr'
  const errEl = document.getElementById(errId)
  const code = readOtp(rowId)

  if (errEl) errEl.textContent = ''
  if (code.length !== 6) {
    if (errEl) errEl.textContent = 'Enter all six digits.'
    return
  }
  if (!state.otp.target) {
    if (errEl) errEl.textContent = 'Request a new code first.'
    return
  }

  const stop = busy(btn)
  try {
    const out = await api.verifyOtp(state.otp.target, code)
    await afterSignIn(out.player, { needsRegistration: !!out.needsRegistration })
  } catch (err) {
    if (isHandleExpired(err)) {
      resetOtpState('login')
      clearOtp(rowId)
      fieldError('loginNameField', 'loginNameErr', err.message)
      showStep('login', 1)
      return
    }
    if (errEl) errEl.textContent = err?.message ?? 'Verification failed.'
    clearOtp(rowId)
  } finally { stop() }
}

/* ─────────────────────────── auth: page loaders ───────────────────────── */

/** Fills the bot-number card and the class/race selects from /api/meta. */
export async function loadAuthMeta() {
  const meta = await ensureMeta()
  if (!meta) return

  const card = $('#signupBotCard')
  if (card && meta.botNumber) {
    const wa = `https://wa.me/${String(meta.botNumber).replace(/\D/g, '')}?text=${encodeURIComponent(meta.prefix + 'menu')}`
    card.innerHTML = `
      ${perkIcon('chat')}
      <h4>Step one: say hi to the bot</h4>
      <p style="margin-bottom:14px">WhatsApp only lets the bot DM you once you've messaged it, so the code can't arrive until you do.</p>
      <a class="btn btn-primary btn-sm" href="${attr(wa)}" target="_blank" rel="noopener">
        Message +${esc(String(meta.botNumber).replace(/\D/g, ''))}
      </a>`
  } else if (card) {
    card.innerHTML = `${perkIcon('chat')}<h4>Step one: message the bot</h4>
      <p>Send the bot any message on WhatsApp first - it can only DM you back after that.</p>`
  }

  const cmd = $('#regCmd')
  if (cmd) cmd.textContent = `${meta.prefix}register`

  await loadRegisterOptions()
}

let optionsFilled = false

export async function loadRegisterOptions() {
  const meta = await ensureMeta()
  if (!meta || optionsFilled) return
  const classSel = $('#regClass')
  const raceSel = $('#regRace')
  if (!classSel || !raceSel) return

  classSel.innerHTML = (meta.classes ?? [])
    .map(c => `<option value="${attr(c.id)}">${esc(c.name ?? titleCase(c.id))}</option>`).join('')
  raceSel.innerHTML = (meta.races ?? [])
    .map(r => `<option value="${attr(r.id)}">${esc(r.name ?? titleCase(r.id))}</option>`).join('')

  const describe = (list, sel, hintId) => {
    const hint = document.getElementById(hintId)
    const paint = () => {
      const found = (list ?? []).find(x => x.id === sel.value)
      if (hint) hint.textContent = found?.description ?? found?.bonusText ?? ''
    }
    sel.addEventListener('change', paint)
    paint()
  }
  describe(meta.classes, classSel, 'regClassHint')
  describe(meta.races, raceSel, 'regRaceHint')
  optionsFilled = true
}

async function submitRegistration(btn) {
  const name = $('#regName')?.value?.trim()
  fieldError('regNameField', 'regNameErr', null)
  if (!name) {
    fieldError('regNameField', 'regNameErr', 'Pick a character name.')
    return
  }

  const stop = busy(btn)
  try {
    const out = await api.register({
      name,
      classId: $('#regClass')?.value,
      raceId: $('#regRace')?.value,
    })
    state.needsRegistration = false
    state.me = out.player ?? await api.me().then(r => r.player).catch(() => null)
    paintAvatar()
    invalidate('profile', 'leaderboard', 'season', 'premium', 'settings')
    loadNotifications()
    goTo('profile')
    toast(`Welcome to Astral, ${state.me?.name ?? name}`, 'ok')
  } catch (err) {
    fieldError('regNameField', 'regNameErr', err?.message ?? 'Could not create the character.')
    reportError(err)
  } finally { stop() }
}

/* ─────────────────────────────── wire forms ───────────────────────────── */

export function wireAuthForms() {
  // Sign in: name → confirm → code. The name form only LOOKS the account up;
  // the send button lives on step 2, after the player has seen the number.
  $('#loginNameForm')?.addEventListener('submit', (e) => {
    e.preventDefault()
    findAccount($('#loginFindBtn'))
  })
  $('#loginSendBtn')?.addEventListener('click', () =>
    sendOtp('login', state.otp.target, $('#loginSendBtn')))
  $('#loginConfirmBackBtn')?.addEventListener('click', () => {
    resetOtpState('login')
    showStep('login', 1)
    $('#loginName')?.focus()
  })

  // Sign up still starts from a typed number: a brand-new player has no
  // username to look up yet.
  $('#signupPhoneForm')?.addEventListener('submit', (e) => {
    e.preventDefault()
    sendOtp('signup', $('#signupPhone').value, $('#signupSendBtn'))
  })
  $('#signupForm')?.addEventListener('submit', (e) => {
    e.preventDefault()
    submitRegistration($('#regSubmitBtn'))
  })

  $('#otpVerifyBtn')?.addEventListener('click', () => submitOtp('login', $('#otpVerifyBtn')))
  $('#signupVerifyBtn')?.addEventListener('click', () => submitOtp('signup', $('#signupVerifyBtn')))

  // Back from the code step returns to the USERNAME field, not to the confirm
  // card: "use a different username" has to actually let you type one.
  $('#otpBackBtn')?.addEventListener('click', () => {
    resetOtpState('login')
    showStep('login', 1)
    $('#loginName')?.focus()
  })
  $('#signupBackBtn')?.addEventListener('click', () => showStep('signup', 1))

  $('#otpResendBtn')?.addEventListener('click', () =>
    sendOtp('login', state.otp.target, $('#otpResendBtn')))
  $('#signupResendBtn')?.addEventListener('click', () =>
    sendOtp('signup', state.otp.target ?? $('#signupPhone').value, $('#signupResendBtn')))

  // Auto-submit once all six digits are in - one less tap on mobile.
  wireOtpRow('otpRow', () => submitOtp('login', $('#otpVerifyBtn')))
  wireOtpRow('signupOtpRow', () => submitOtp('signup', $('#signupVerifyBtn')))
}
