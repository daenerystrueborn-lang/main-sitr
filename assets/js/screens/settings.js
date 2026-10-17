/**
 * screens/settings.js - account settings: profile images, name/bio, privacy,
 * notification mutes, device prefs, session controls.
 *
 * The prefs themselves live in core/prefs.js (sign-out and boot read them too).
 * NOTE: uploadProfileImage()'s anchor lines are patched by
 * mobile/scripts/prepare-www.mjs when the Android app is bundled - keep the
 * `closest('.img-upload')` and `await loadSettings()` lines intact.
 */
import { $, esc, attr, num, titleCase, toast, busy, iconSvg, initials } from '../ui.js'
import { api, fileToDataUrl, uploadToImgbb } from '../api.js'
import { state, invalidate, loaded } from '../core/state.js'
import { fieldError, reportError, confirmAction, ensureMeta } from '../core/shared.js'
import { paintAvatar, paintBell, loadNotifications } from '../core/shell.js'
import { goTo } from '../core/router.js'
import { localPrefs } from '../core/prefs.js'

export const settingsHtml = `
<main class="view" id="view-settings">
  <div class="auth-wrap">
    <div class="auth-card" id="settingsCard"></div>
  </div>
</main>`

/** One `.setting-row` with a switch. `id` is read back by the change handler. */
function switchRow(id, label, desc, checked) {
  return `
    <div class="setting-row">
      <div class="setting-label">
        <div class="label">${esc(label)}</div>
        <div class="desc">${esc(desc)}</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="${attr(id)}" ${checked ? 'checked' : ''}>
        <span class="switch-track"></span>
      </label>
    </div>`
}

/** Human-readable "1 day 4h" for the rename cooldown. */
function untilLabel(ts) {
  const ms = ts - Date.now()
  if (ms <= 0) return 'now'
  const totalHours = Math.ceil(ms / 3_600_000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}${hours > 0 ? ` ${hours}h` : ''}`
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

const NOTE_KIND_LABELS = {
  system: 'System', security: 'Security', season: 'Season', premium: 'Premium',
  reward: 'Rewards', battle: 'Battles', social: 'Social',
}

export async function loadSettings() {
  const card = $('#settingsCard')
  if (!card) return
  const p = state.me ?? (await api.me()).player
  state.me = p

  const prefix = state.meta?.prefix ?? (await ensureMeta())?.prefix ?? '.'
  const s = p.settings ?? {}
  const rename = s.rename ?? { canRename: true, minLength: 2, maxLength: 20, cooldownDays: 7 }
  const muted = new Set(s.mutedNotificationKinds ?? [])
  const kinds = s.notificationKinds ?? Object.keys(NOTE_KIND_LABELS)
  const prefs = localPrefs()

  card.innerHTML = `
    <p class="subtext">Settings</p>
    <h2>Your account</h2>
    <p class="subtext" style="margin-bottom:22px">
      Signed in as <strong>${esc(p.name)}</strong> · Lv ${num(p.level)}
    </p>

    <div class="settings-group">
      <h3>Profile</h3>
      <p class="group-hint">How you appear on the leaderboard and to other players.</p>

      <div class="img-upload" id="bannerUpload">
        <div class="img-upload-preview banner${p.bannerUrl ? '' : ' is-empty'}"
             id="bannerPreview"
             ${p.bannerUrl ? `style="background-image:url('${attr(p.bannerUrl)}')"` : ''}>
          ${p.bannerUrl ? '' : '<span>No banner yet</span>'}
        </div>
        <div class="img-upload-meta">
          <label for="bannerInput">Banner</label>
          <p class="field-hint">Wide image behind your profile header. PNG, JPEG, WebP or GIF, up to 5MB.</p>
          <div class="img-upload-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-pick="bannerInput">
              ${p.hasCustomBanner ? 'Change' : 'Upload'}
            </button>
            ${p.hasCustomBanner
              ? '<button class="btn btn-ghost btn-sm" type="button" data-remove-img="banner">Remove</button>'
              : ''}
          </div>
          <p class="field-err" id="bannerErr"></p>
        </div>
        <input id="bannerInput" class="visually-hidden" type="file"
               accept="image/png,image/jpeg,image/webp,image/gif" data-upload="banner">
      </div>

      <div class="img-upload" id="pfpUpload">
        <div class="img-upload-preview avatar${p.avatarUrl ? '' : ' is-empty'}"
             id="pfpPreview"
             ${p.avatarUrl ? `style="background-image:url('${attr(p.avatarUrl)}')"` : ''}>
          ${p.avatarUrl ? '' : `<span>${esc(initials(p.name))}</span>`}
        </div>
        <div class="img-upload-meta">
          <label for="pfpInput">Profile picture</label>
          <p class="field-hint">Square works best. PNG, JPEG, WebP or GIF, up to 5MB.</p>
          <div class="img-upload-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-pick="pfpInput">
              ${p.hasCustomPfp ? 'Change' : 'Upload'}
            </button>
            ${p.hasCustomPfp
              ? '<button class="btn btn-ghost btn-sm" type="button" data-remove-img="pfp">Remove</button>'
              : ''}
          </div>
          <p class="field-err" id="pfpErr"></p>
        </div>
        <input id="pfpInput" class="visually-hidden" type="file"
               accept="image/png,image/jpeg,image/webp,image/gif" data-upload="pfp">
      </div>

      <form id="nameForm" novalidate style="margin-top:20px">
        <div class="field" id="nameField">
          <label for="nameInput">Display name</label>
          <input id="nameInput" type="text"
                 minlength="${attr(rename.minLength ?? 2)}"
                 maxlength="${attr(rename.maxLength ?? 20)}"
                 placeholder="Your name in-game"
                 value="${attr(p.name ?? '')}"
                 ${rename.canRename ? '' : 'disabled'}>
          <p class="field-hint">
            ${rename.minLength ?? 2}–${rename.maxLength ?? 20} characters. Letters, numbers,
            spaces and <code>-_.'</code>. Changeable once every ${rename.cooldownDays ?? 7} days.
          </p>
          <p class="field-err" id="nameErr"></p>
        </div>
        ${rename.canRename ? `
          <button class="btn btn-primary btn-block" id="nameSaveBtn" type="submit">Save name</button>
        ` : `
          <div class="rename-locked">
            ${iconSvg('payment', 'inline-icon')}
            <span>Next rename unlocks in <strong>${esc(untilLabel(rename.nextRenameAt))}</strong>
            - that's the same 7-day cooldown <code>${esc(prefix)}rename</code> uses in chat.</span>
          </div>
        `}
      </form>

      <form id="bioForm" novalidate style="margin-top:18px">
        <div class="field" id="bioField">
          <label for="bioInput">Bio</label>
          <input id="bioInput" type="text" maxlength="120" placeholder="Nine words, no more."
                 value="${attr(p.bio ?? '')}">
          <p class="field-hint">Shown on your public profile. Up to 9 words.</p>
          <p class="field-err" id="bioErr"></p>
        </div>
        <button class="btn btn-primary btn-block" id="bioSaveBtn" type="submit">Save bio</button>
      </form>
    </div>

    <div class="settings-group">
      <h3>Privacy</h3>
      <p class="group-hint">Applies everywhere - the site and the bot's own leaderboards.</p>
      ${switchRow(
        'hideBoardToggle',
        'Hide me from leaderboards',
        'Removes you from every ranking and hides your public profile page.',
        !!s.hiddenFromLeaderboard,
      )}
    </div>

    <div class="settings-group">
      <h3>Notifications</h3>
      <p class="group-hint">Tap a category to mute it. Muted alerts stop counting toward the bell.</p>
      <div class="kind-chips" id="kindChips">
        ${kinds.map(k => `
          <button type="button" class="chip kind-chip ${muted.has(k) ? 'is-muted' : 'active'}"
                  data-kind="${attr(k)}"
                  aria-pressed="${muted.has(k) ? 'false' : 'true'}">
            ${esc(NOTE_KIND_LABELS[k] ?? titleCase(k))}
          </button>`).join('')}
      </div>
      ${switchRow(
        'dmNotesToggle',
        'Also message me on WhatsApp',
        'Lets the bot DM you about things that need attention, not just the bell.',
        s.dmNotifications !== false,
      )}
    </div>

    <div class="settings-group">
      <h3>This device</h3>
      <p class="group-hint">Stored in this browser only - your other devices keep their own.</p>
      ${switchRow(
        'reduceMotionToggle',
        'Reduce motion',
        'Turns off entrance animations, parallax and looping effects.',
        !!prefs.reduceMotion,
      )}
      ${switchRow(
        'confirmSignOutToggle',
        'Confirm before signing out',
        'Asks first, so a stray tap on the menu does not end your session.',
        prefs.confirmSignOut !== false,
      )}
    </div>

    <div class="settings-group">
      <h3>Your ID</h3>
      <p class="group-hint">Share this to let someone open your public profile.</p>
      <div class="copy-box">
        <span>${esc(p.uid ?? '')}</span>
        <button class="btn btn-ghost btn-sm" data-copy="${attr(p.uid ?? '')}"
                data-copy-msg="Player ID copied">Copy</button>
      </div>
    </div>

    <div class="settings-divider"></div>

    <div class="settings-group">
      <h3>Session</h3>
      <p class="group-hint">
        Everything else about your character - class, stats, gear - is changed in chat,
        where the bot can validate it properly.
      </p>
      <button class="btn btn-ghost btn-block" id="revokeBtn" style="margin-bottom:10px">
        Sign out of all devices
      </button>
      <button class="btn btn-danger btn-block" id="signOutBtn">Sign out</button>
    </div>`
}

/**
 * Reads the picked file, ships it as a data URL, and folds the returned player
 * back into `state.me`.
 *
 * UPLOAD PATH: straight to the bot. `POST /api/me/:kind` takes the raw base64
 * and does the ImgBB call itself, server-side, with the bot's own key - the
 * key never touches the browser, and there's one hop instead of two.
 *
 * The Vercel proxy is kept only as a fallback for when that call can't be
 * made at all (proxy still holds a working key if the bot's is unset or its
 * quota is spent). It uploads to ImgBB and hands back a finished URL, which
 * the bot accepts via `{ url }` - it validates the host before storing it.
 * A 4xx is NOT retried: that's the server rejecting the image on its merits
 * (too big, wrong type, rate-limited) and the proxy would reject it too.
 *
 * The file input is cleared unconditionally at the end: without it, picking the
 * same file twice in a row fires no `change` event the second time, so a failed
 * upload could never be retried with the identical image.
 */
export async function uploadProfileImage(kind, file, inputEl) {
  const errId = kind === 'banner' ? 'bannerErr' : 'pfpErr'
  fieldError(null, errId, null)
  if (!file) return

  const box = inputEl?.closest('.img-upload')
  box?.classList.add('busy')
  try {
    const dataUrl = await fileToDataUrl(file)

    let out
    try {
      out = await api.uploadImage(kind, dataUrl)
    } catch (err) {
      // Only fall back when the bot couldn't complete the upload itself -
      // offline (status 0) or a failure on its ImgBB call (502). Anything
      // else is a verdict on the image, so surface it.
      if (err?.status !== 0 && err?.status !== 502) throw err
      const hostedUrl = await uploadToImgbb(dataUrl, kind)
      out = await api.uploadImageUrl(kind, hostedUrl)
    }

    if (out?.player) state.me = out.player
    invalidate('profile', 'settings', 'leaderboard')
    paintAvatar()
    toast(kind === 'banner' ? 'Banner updated.' : 'Profile picture updated.')
    await loadSettings()
  } catch (err) {
    fieldError(null, errId, err?.message || 'Upload failed.')
  } finally {
    box?.classList.remove('busy')
    if (inputEl) inputEl.value = ''
  }
}

export async function removeProfileImage(kind, btn) {
  const errId = kind === 'banner' ? 'bannerErr' : 'pfpErr'
  fieldError(null, errId, null)
  const box = btn?.closest('.img-upload')
  box?.classList.add('busy')
  try {
    const out = await api.removeImage(kind)
    if (out?.player) state.me = out.player
    invalidate('profile', 'settings', 'leaderboard')
    paintAvatar()
    toast(kind === 'banner' ? 'Banner removed.' : 'Profile picture removed.')
    await loadSettings()
  } catch (err) {
    fieldError(null, errId, err?.message || 'Could not remove that image.')
  } finally {
    box?.classList.remove('busy')
  }
}

export async function saveName(btn) {
  const input = $('#nameInput')
  const value = (input?.value ?? '').trim()
  fieldError('nameField', 'nameErr', null)

  // Mirror the server's rules so the common mistakes are caught without a
  // round-trip. The server re-checks all of them regardless.
  if (value.length < 2 || value.length > 20) {
    fieldError('nameField', 'nameErr', 'Name must be 2–20 characters.')
    return
  }
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(value)) {
    fieldError('nameField', 'nameErr', "Only letters, numbers, spaces and -_.'")
    return
  }
  if (value === state.me?.name) {
    fieldError('nameField', 'nameErr', 'That is already your name.')
    return
  }

  const stop = busy(btn)
  try {
    const out = await api.updateName(value)
    state.me = out.player
    // The name shows up on the profile page and on every leaderboard row, and
    // renaming burns the cooldown - so this page has to re-render too.
    invalidate('profile', 'settings', 'leaderboard')
    state.boardCache.clear()
    paintAvatar()
    toast('Name changed', 'ok')
    loadSettings()
  } catch (err) {
    fieldError('nameField', 'nameErr', err?.message ?? 'Could not save.')
  } finally { stop() }
}

export async function saveBio(btn) {
  const value = $('#bioInput')?.value ?? ''
  fieldError('bioField', 'bioErr', null)

  // Mirror the API's 9-word rule locally so the user finds out before the
  // round-trip; the server still enforces it either way.
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length > 9) {
    fieldError('bioField', 'bioErr', 'Bio must be 9 words or fewer.')
    return
  }

  const stop = busy(btn)
  try {
    const out = await api.updateBio(value.trim())
    state.me = out.player
    invalidate('profile')
    toast('Bio saved', 'ok')
  } catch (err) {
    fieldError('bioField', 'bioErr', err?.message ?? 'Could not save.')
  } finally { stop() }
}

/**
 * Sends one server-side setting. Optimistic: the switch has already moved, so
 * on failure we put it back rather than leaving the UI claiming something the
 * server didn't do.
 */
export async function saveSetting(patch, { revert } = {}) {
  try {
    const out = await api.updateSettings(patch)
    state.me = out.player
    // Hiding from the leaderboard changes what those pages should show.
    if ('hiddenFromLeaderboard' in patch) {
      invalidate('leaderboard', 'profile')
      state.boardCache.clear()
    }
    if ('mutedNotificationKinds' in patch) loadNotifications()
    toast('Setting saved', 'ok')
  } catch (err) {
    revert?.()
    reportError(err)
  }
}

/** Toggles one notification kind's mute state and persists the whole list. */
export function toggleNoteKind(chip) {
  const kind = chip.dataset.kind
  const muted = new Set(state.me?.settings?.mutedNotificationKinds ?? [])
  const nowMuted = !muted.has(kind)

  if (nowMuted) muted.add(kind)
  else muted.delete(kind)

  chip.classList.toggle('is-muted', nowMuted)
  chip.classList.toggle('active', !nowMuted)
  chip.setAttribute('aria-pressed', nowMuted ? 'false' : 'true')

  saveSetting({ mutedNotificationKinds: [...muted] }, {
    revert: () => {
      chip.classList.toggle('is-muted', !nowMuted)
      chip.classList.toggle('active', nowMuted)
      chip.setAttribute('aria-pressed', nowMuted ? 'true' : 'false')
    },
  })
}

/** "Sign out of all devices" - invalidates every token, including this one. */
export async function revokeSessions(btn) {
  const ok = await confirmAction({
    title: 'Sign out everywhere?',
    body: 'Every device signed in to your account will be signed out, including this one. '
      + 'You can sign back in with a new code any time.',
    confirmLabel: 'Sign out everywhere',
  })
  if (!ok) return

  const stop = busy(btn)
  try {
    await api.revokeSessions()
    toast('Signed out on all devices', 'ok')
  } catch (err) {
    reportError(err)
  } finally {
    stop()
    // The token is dropped locally either way - a failed revoke that left the
    // session alive is still safer to treat as signed out on this device.
    state.me = null
    state.needsRegistration = false
    state.notes = { items: [], unread: 0 }
    loaded.clear()
    paintAvatar()
    paintBell()
    goTo('home')
  }
}
