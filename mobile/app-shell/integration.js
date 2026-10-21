// All data and writes go through the shared bot API client. No guessed endpoints.
export function initialize({ api, API_BASE, onAuthLost, fileToDataUrl, mountFeatures = null }) {
  const $ = (q) => document.querySelector(q)
  const $$ = (q) => [...document.querySelectorAll(q)]
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const num = (v) => v == null ? '—' : Number(v).toLocaleString()
  const text = (q, v) => { if ($(q)) $(q).textContent = v ?? '—' }
  let player = null, meta = {}, shop = null, shelf = '', query = '', board = 'level', invFilter = 'All', target = null
  let authReady = false, epoch = 0
  const inflight = new Set()
  let features = null, otpResponse = null
  let authRevision = 0, authBusy = false, otpExpiresAt = 0, resendAt = 0
  const countdowns = new Map()
  const cooldowns = new Map()
  const nav = (n) => window.astralNav.show(n)
  function message(title, body) { panel(title, `<p>${esc(body)}</p>`) }
  let panelFocus = null
  function closePanel() {
    if (authBusy && $('#api-panel')?.classList.contains('auth-mode')) return
    if ($('#api-panel')?.classList.contains('auth-mode')) authRevision++
    if ($('#api-panel')?.dataset.blocking === 'true') return
    if ($('#api-panel')) { $('#api-panel').hidden = true; $('#api-panel').style.display = 'none' }
    $$('.phone > :not(#api-panel)').forEach(el => { el.inert = false })
    panelFocus?.focus?.()
  }
  function panel(title, body) {
    if (!$('#api-panel') || $('#api-panel').hidden) panelFocus = document.activeElement
    let host = $('#api-panel')
    if (!host) {
      host = document.createElement('div'); host.id = 'api-panel'; host.className = 'api-overlay'; host.hidden = true
      host.style.cssText = 'position:absolute;inset:0;z-index:1000;background:rgba(0,0,0,.8);align-items:flex-end;isolation:isolate';
      $('.phone').append(host)
    }
    host.classList.remove('auth-mode')
    host.innerHTML = `<section class="api-sheet" style="position:relative;width:100%;max-height:90%;overflow:auto;background:#141416;color:#fff;padding:28px 20px;border-radius:28px 28px 0 0" role="dialog" aria-modal="true" aria-label="${esc(title)}"><button class="rb api-close" aria-label="Close">×</button><h2>${esc(title)}</h2>${body}<p id="api-error" role="alert"></p></section>`
    host.hidden = false
    host.style.display = 'flex'
    $$('.phone > :not(#api-panel)').forEach(el => { el.inert = true })
    host.querySelector('.api-close').onclick = closePanel
    host.querySelector('button, input')?.focus()
  }
  function countdown(el, milliseconds, label, after) {
    if (!el) return
    const until = Date.now() + Math.max(0, milliseconds)
    const old = countdowns.get(el); if (old) clearTimeout(old)
    const tick = () => {
      if (!el.isConnected) { countdowns.delete(el); return }
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      el.textContent = left ? `${label} · ${left}s` : label
      if (left) countdowns.set(el, setTimeout(tick, 1000))
      else { countdowns.delete(el); after?.() }
    }
    tick()
  }
  async function commit(operation, success) {
    const operationEpoch = epoch
    let out
    try { out = await operation() }
    catch (e) {
      if (e.retry) e.retryAction = () => operationEpoch === epoch ? commit(e.retry, success) : undefined
      throw e
    }
    if (operationEpoch === epoch) return success(out)
  }
  async function run(key, fn) {
    if (inflight.has(key) || (cooldowns.get(key) || 0) > Date.now()) return
    inflight.add(key)
    try { return await fn() } catch (e) {
      if (e.code === 'handle_expired' || e.code === 'HANDLE_EXPIRED') { login(); text('#api-error', 'The account lookup expired. Find your account again.'); return }
      if (e.code === 'COMBAT_ACTION_REQUIRED') e.message = 'Use this consumable from the dungeon combat screen.'
      if (e.code === 'LOADOUT_LOCKED') e.message = 'Equipment cannot be changed during a dungeon run.'
      if (e.code === 'WORLD_UNSUPPORTED') e.message = 'This game screen supports Astra Kingdom only.'
      if (e.code === 'BOSS_LOCK') e.message = 'You cannot abandon a boss battle.'
      if ($('#api-panel') && !$('#api-panel').hidden) text('#api-error', e.message)
      else message('Unable to complete request', e.message)
      if (e.retryAfterMs) cooldowns.set(key, Date.now() + e.retryAfterMs)
      if (e.retryAfterMs && $('#api-error')) countdown($('#api-error'), e.retryAfterMs, e.message)
      if (e.retryAction && $('.api-sheet')) {
        // A dropped write response is ambiguous. The original confirm controls
        // must not create another write with a new idempotency key.
        $$('[data-retry-mutation]').forEach(el => el.remove())
        $$('.api-sheet button:not(.api-close), .api-sheet input, .api-sheet select').forEach(el => { el.disabled = true })
        const sheet = $('.api-sheet')
        const retry = document.createElement('button'); retry.className = 'gbtn'; retry.dataset.retryMutation = 'true'; retry.textContent = 'Retry the same request'
        retry.onclick = () => run('retry-mutation', async () => {
          retry.disabled = true
          try { await e.retryAction(); if ($('.api-sheet') === sheet) closePanel() }
          finally { if (retry.isConnected) retry.disabled = false }
        })
        sheet.append(retry)
      }
      if (key === 'boot') {
        const retry = document.createElement('button'); retry.className = 'pm-cta'; retry.textContent = 'Retry connection'; retry.onclick = boot; $('.api-sheet').append(retry)
      }
    } finally { inflight.delete(key) }
  }
  function bind(q, action) { $$(q).forEach(el => { el.dataset.apiAction = '1'; el._apiAction = action; if (!el.matches('button,a,input')) { el.setAttribute('role', 'button'); el.tabIndex = 0 } }) }
  function requireAccount(fn) { if (!authReady || !player) { login(); return } return fn() }
  function art(url) { try { const u = new URL(url, API_BASE); return /^https?:$/.test(u.protocol) ? u.href : '' } catch { return '' } }
  function image(url, cls = '') { const u = url && art(url); return u ? `<img class="${cls}" src="${esc(u)}" alt="" loading="lazy">` : '' }
  function bot(command) {
    const digits = String(meta.botNumber || '').replace(/\D/g, '')
    panel('Continue in the bot', `<p>This action is handled in WhatsApp, not by the web API.</p><code>${esc(command)}</code>${digits ? `<a class="gbtn solid api-link" href="https://wa.me/${digits}?text=${encodeURIComponent(command)}" target="_blank" rel="noopener noreferrer">Open WhatsApp</a>` : '<p>The bot number is not configured. Send the command to your existing bot chat.</p>'}`)
  }
  const command = (s) => bot(`${meta.prefix || '.'}${s}`)
  function authScreen(title, subtitle, step, body, back = null) {
    authRevision++
    panel(title, `<div class="auth-brand"><span class="auth-emblem" aria-hidden="true">✦</span><span>ASTRAL<span class="auth-brand-sub">YOUR NEXT CHAPTER</span></span></div><ol class="auth-progress" aria-label="Sign-in progress">${['Account', 'Send code', 'Verify'].map((name, i) => `<li class="${i + 1 <= step ? 'on' : ''}" ${i + 1 === Math.min(step, 3) ? 'aria-current="step"' : ''}><b>${String(i + 1).padStart(2, '0')}</b>${name}</li>`).join('')}</ol><p class="auth-subtitle">${esc(subtitle)}</p>${body}<p class="auth-security">Your code stays private. We never ask for your WhatsApp password.</p>`)
    const host = $('#api-panel'); host.classList.add('auth-mode')
    const heading = host.querySelector('h2'); heading.before(host.querySelector('.auth-brand'), host.querySelector('.auth-progress'))
    host.querySelector('.api-close').setAttribute('aria-label', 'Browse without signing in')
    if (back) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'auth-back'; button.id = 'auth-back'; button.textContent = '‹ Back'; button.onclick = () => { if (!authBusy) back() }
      $('.auth-brand').before(button)
    }
    host.querySelector('input,select')?.focus()
  }
  async function authTask(key, operation) {
    if (authBusy) return
    return run(key, async () => {
      const revision = authRevision, sheet = $('.api-sheet')
      authBusy = true; sheet?.setAttribute('aria-busy', 'true')
      const controls = [...(sheet?.querySelectorAll('button,input,select') || [])].map(el => [el, el.disabled])
      controls.forEach(([el]) => { el.disabled = true })
      text('#api-error', '')
      try { return await operation(revision) }
      finally {
        authBusy = false
        sheet?.removeAttribute('aria-busy')
        controls.forEach(([el, disabled]) => { if (el.isConnected) el.disabled = disabled })
        // A zero-delay/expired OTP timer may have completed during this request.
        if (revision === authRevision) {
          const send = $('#resend-code') || $('#send-code') || $('#phone-form button')
          if (send && Date.now() < resendAt) {
            send.disabled = true
            countdown(send, resendAt - Date.now(), send.id === 'resend-code' ? 'Resend code' : 'Send WhatsApp code', () => { send.disabled = authBusy })
          } else if (send) send.disabled = false
          if ($('#verify-code') && otpExpiresAt && Date.now() >= otpExpiresAt) $('#verify-code').disabled = true
        }
      }
    })
  }
  function login() {
    authBusy = false; target = null; otpResponse = null; otpExpiresAt = 0; resendAt = 0
    authScreen('Welcome back', 'Find your existing player account to sign in securely.', 1, `<form id="login-form"><label for="account-name">Player / character name</label><input id="account-name" name="username" autocomplete="username" placeholder="Your exact player name" maxlength="80" required><button class="pm-cta" type="submit">Find account <span aria-hidden="true">→</span></button></form><div class="auth-divider"><span>NEW TO ASTRAL?</span></div><button class="gbtn" id="signup" type="button">Create an account</button><p class="auth-help">Already play in the bot? Use the same character name.</p>`)
    $('#login-form').onsubmit = e => {
      e.preventDefault()
      const name = new FormData(e.target).get('username').trim()
      if (!name) { text('#api-error', 'Enter your player name first.'); return }
      return authTask('lookup', async revision => {
        const found = await api.lookupAccount(name)
        if (revision !== authRevision) return
        if (!found?.handle) throw new Error('No account could be confirmed. Check the player name and try again.')
        target = found; confirmAccount()
      })
    }
    $('#signup').onclick = phoneForm
  }
  function confirmAccount() {
    authScreen('Is this your account?', 'Check the player details before we send your sign-in code.', 2, `<div class="auth-account"><div class="auth-account-avatar" aria-hidden="true">${esc((target.name || '?').slice(0, 1))}</div><div><strong>${esc(target.name || 'Player account')}</strong><span>${esc(target.maskedPhone || 'WhatsApp number on your account')}</span></div><span class="auth-found">FOUND</span></div><p class="auth-help">A six-digit verification code will be sent privately to this account’s WhatsApp.</p><button class="pm-cta" id="send-code" type="button">Send WhatsApp code</button><button class="gbtn" id="different-account" type="button">Find a different account</button>`, login)
    $('#send-code').onclick = () => sendOtp()
    $('#different-account').onclick = login
  }
  function phoneForm() {
    authScreen('Create your account', 'Start with the WhatsApp number you want to use for Astral.', 2, '<form id="phone-form"><label for="account-phone">WhatsApp number</label><input id="account-phone" name="phone" type="tel" autocomplete="tel" placeholder="+234 800 000 0000" maxlength="24" required><p class="auth-help">Include your country code. We’ll verify the number before creating your character.</p><button class="pm-cta" type="submit">Send WhatsApp code</button></form>', login)
    $('#phone-form').onsubmit = e => {
      e.preventDefault()
      const phone = new FormData(e.target).get('phone').trim().replace(/[\s()-]/g, '')
      if (!/^\+?[1-9]\d{6,14}$/.test(phone)) { text('#api-error', 'Enter a valid WhatsApp number with its country code.'); return }
      target = phone; return sendOtp()
    }
  }
  function sendOtp() {
    if (Date.now() < resendAt) { text('#api-error', 'Please wait before requesting another code.'); return }
    const recipient = target
    return authTask('otp', async revision => {
      try { await commit(() => api.requestOtp(recipient), response => {
        if (revision !== authRevision) return
        otpResponse = response || {}
        const expiry = otpResponse.expiresAt ? new Date(otpResponse.expiresAt).getTime() : (otpResponse.ttlMs != null ? Date.now() + Number(otpResponse.ttlMs) : 0)
        otpExpiresAt = Number.isFinite(expiry) && expiry > 0 ? expiry : 0
        resendAt = Date.now() + Math.max(0, Number(otpResponse.resendAfterMs ?? otpResponse.retryAfterMs ?? otpResponse.ttlMs ?? (otpExpiresAt - Date.now())) || 0)
        codeForm()
      }) } catch (error) {
        if (error.retryAfterMs) resendAt = Date.now() + error.retryAfterMs
        throw error
      }
    })
  }
  async function finishSignIn() {
    await refreshPlayer()
    authBusy = false; closePanel(); target = null; otpResponse = null; otpExpiresAt = 0; resendAt = 0
    nav('profile'); await features?.afterAuth()
  }
  function codeForm() {
    const destination = otpResponse?.maskedPhone || (typeof target === 'string' ? `number ending in ${target.slice(-4)}` : target?.maskedPhone) || 'your WhatsApp DM'
    authScreen('Check your WhatsApp', `Enter the six-digit code sent to ${destination}.`, 3, `<form id="code-form"><label for="verification-code">Verification code</label><input class="auth-code" id="verification-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required><p id="otp-expiry" class="auth-help" aria-live="off"></p><button class="pm-cta" type="submit" id="verify-code">Verify & sign in</button></form><p class="auth-help">Can’t see the message? Check the WhatsApp number above and wait for delivery.</p><button class="gbtn" id="resend-code" type="button">Resend code</button>`, () => typeof target === 'string' ? phoneForm() : confirmAccount())
    const resend = $('#resend-code'); resend.disabled = Date.now() < resendAt
    if (resend.disabled) countdown(resend, resendAt - Date.now(), 'Resend code', () => { resend.disabled = authBusy })
    if (otpExpiresAt > Date.now()) countdown($('#otp-expiry'), otpExpiresAt - Date.now(), 'Code expires', () => { text('#otp-expiry', 'This code has expired. Request a new code.'); if ($('#verify-code')) $('#verify-code').disabled = true })
    $('#resend-code').onclick = () => Date.now() >= resendAt && sendOtp()
    $('#code-form').onsubmit = e => {
      e.preventDefault()
      const code = new FormData(e.target).get('code').trim()
      if (!/^[0-9]{6}$/.test(code)) { text('#api-error', 'Enter the complete six-digit code.'); return }
      if (otpExpiresAt && Date.now() >= otpExpiresAt) { text('#api-error', 'This code has expired. Request a new code.'); return }
      return authTask('verify', async revision => {
        await commit(() => api.verifyOtp(target, code), async out => {
          if (revision !== authRevision) return
          if ($('#verification-code')) $('#verification-code').value = ''
          if (out.needsRegistration) return registration()
          // Verification succeeded: retrying a failed profile read must not
          // consume the OTP a second time.
          try { await finishSignIn() }
          catch (error) {
            authScreen('You’re verified', 'Your sign-in succeeded, but your profile could not be loaded yet.', 3, '<button class="pm-cta" id="finish-signin">Load my account</button>')
            text('#api-error', error.message)
            $('#finish-signin').onclick = () => authTask('finish-signin', finishSignIn)
          }
        })
      })
    }
  }
  function registration() {
    authScreen('Create your character', 'Your WhatsApp is verified. Choose how your adventure begins.', 4, `<form id="register-form"><label for="new-character-name">Player name</label><input id="new-character-name" name="name" autocomplete="nickname" placeholder="Choose a player name" required maxlength="40">${['classes', 'races'].map((key, i) => `<label>${i ? 'Race' : 'Class'}<select name="${i ? 'raceId' : 'classId'}" required>${(meta[key] || []).map(x => `<option value="${esc(x.id)}">${esc(x.name || x.id)}</option>`).join('')}</select></label>`).join('')}<button class="pm-cta" type="submit">Create character</button></form>`)
    if (!(meta.classes?.length && meta.races?.length)) {
      $('#register-form button').disabled = true; text('#api-error', 'Character options are unavailable. Reconnect and try again.')
      const retry = document.createElement('button'); retry.className = 'gbtn'; retry.id = 'retry-character-options'; retry.textContent = 'Reload character options'
      retry.onclick = () => authTask('character-options', async revision => { const options = await api.meta(); if (revision === authRevision) { meta = options; registration() } })
      $('.api-sheet').append(retry); return
    }
    $('#register-form').onsubmit = e => {
      e.preventDefault()
      const body = Object.fromEntries(new FormData(e.target)); body.name = body.name.trim()
      if (!body.name || !meta.classes.some(c => c.id === body.classId) || !meta.races.some(r => r.id === body.raceId)) { text('#api-error', 'Choose a name, class and race from the available options.'); return }
      return authTask('register', () => commit(() => api.register(body), async () => {
        try { await finishSignIn() }
        catch (error) {
          authScreen('Character created', 'Your character is saved. Reconnect to load your profile.', 3, '<button class="pm-cta" id="finish-signin">Load my account</button>')
          text('#api-error', error.message); $('#finish-signin').onclick = () => authTask('finish-signin', finishSignIn)
        }
      }))
    }
  }
  async function refreshPlayer() {
    const version = epoch
    const out = await api.me()
    if (version !== epoch) return
    player = out.player; authReady = true; paintPlayer()
  }
  function paintPlayer() {
    const p = player
    text('#v-home .name', p?.name || 'Sign in'); text('.pf-name', p?.name || 'Sign in')
    text('#v-home .stat:nth-child(1) b', num(p?.wallet?.solars)); text('#v-home .stat:nth-child(2) b', num(p?.wallet?.gems))
    text('#v-home .stat:nth-child(3) b', num(p?.inventory?.length)); text('#v-home .stat:nth-child(3) span', 'Items')
    $$('#v-home .chips, .pf-chips').forEach(el => { el.innerHTML = `<span class="chip">Level ${num(p?.level)}</span><span class="chip">${esc(p?.rank?.title || 'Adventurer')}</span>` })
    if (p?.avatarUrl) $$('.pf-av .av, #v-home .big .av, #v-home .tools .av').forEach(el => { el.innerHTML = image(p.avatarUrl) })
    else $$('.pf-av .av, #v-home .big .av, #v-home .tools .av').forEach(el => { el.textContent = p?.name?.slice(0, 1) || '?' })
    const banner = $('#v-profile .pf-banner')
    if (banner) banner.style.backgroundImage = p?.bannerUrl ? `url("${art(p.bannerUrl).replace(/["\\]/g, '')}")` : ''
    text('.pf-xh span:first-child', `Level ${num(p?.level)}`); text('.pf-xh span:last-child', p?.xpProgress?.maxed ? 'Max level' : 'Next level')
    text('.pf-xn', `${num(p?.xpProgress?.xpToNext)} XP to next level`)
    const progress = p?.xpProgress
    const percent = progress?.maxed ? 100 : Math.max(0, Math.min(100, (progress?.intoLevel || 0) / (progress?.forLevel || 1) * 100))
    const bar = $('#v-profile .bar'); if (bar) { bar.innerHTML = `<i style="display:block;height:100%;border-radius:inherit;background:var(--gold);width:${percent}%"></i>`; bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuenow', String(Math.round(percent))); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-label', 'Level progress') }
    const wins = p?.record?.wins, losses = p?.record?.losses
    const stats = [wins == null ? null : wins + (losses || 0), wins, wins == null ? null : `${Math.round(wins / Math.max(1, wins + (losses || 0)) * 100)}%`, p?.rank?.title]
    $$('#v-profile .pf-stats .pf-st b').forEach((el, i) => { el.textContent = typeof stats[i] === 'number' ? num(stats[i]) : stats[i] ?? '—' })
    paintInventory()
    $$('#v-shop .wallet b').forEach((el, i) => { el.textContent = num(i ? p?.wallet?.gems : p?.wallet?.solars) })
    const toggle = $('#v-settings .tg'); if (toggle) { toggle.classList.toggle('on', !!p && p.settings?.dmNotifications !== false); toggle.setAttribute('aria-pressed', String(!!p && p.settings?.dmNotifications !== false)) }
  }
  function paintInventory() {
    const items = (player?.inventory || []).filter(i => invFilter === 'All' || String(i.type || i.category || '').toLowerCase().includes(invFilter.toLowerCase().replace(/s$/, '')))
    $('.pf-inv').innerHTML = items.length ? items.map((i, idx) => `<button class="sq sm" data-inventory="${idx}" title="${esc(i.name)}">${image(i.image)}<span>${esc(i.name)} ×${num(i.qty || 1)}</span></button>`).join('') : '<p>No items in this category.</p>'
    $$('.pf-inv [data-inventory]').forEach(el => { el.onclick = () => { const i = items[Number(el.dataset.inventory)]; message(i.name, i.description || `${i.rarity || 'Item'} · Quantity ${i.qty || 1}. Manage equipment in the bot.`) } })
  }
  function clearShopItems() {
    $$('#v-shop > .deals, #v-shop > .packs, #v-shop > .buns').forEach(el => { el.replaceChildren() })
  }
  async function loadShop() {
    clearShopItems()
    text('#shop-status', 'Loading items…')
    try { shop = await api.shop(); paintShop() }
    catch { shop = null; clearShopItems(); text('#shop-status', 'Items are unavailable. Retry when the connection is restored.') }
  }
  function paintShop() {
    clearShopItems()
    if (!shop) return
    const rows = (shop.shelves || []).flatMap(s => (s.groups || []).flatMap(g => (g.rows || []).map(i => ({ ...i, shelfKey: s.key, shelfLabel: s.label, groupKey: g.key, groupLabel: g.label }))))
      .filter(i => `${i.name} ${i.description || ''}`.toLowerCase().includes(query))
      .filter(i => !shelf || shelf === 'Featured' || `${i.shelfKey} ${i.shelfLabel} ${i.groupKey} ${i.groupLabel} ${i.type || ''} ${i.category || ''}`.toLowerCase().includes(shelf.toLowerCase().replace(/s$/, '')))
    const destinations = { deals: $('#v-shop > .deals'), packs: $('#v-shop > .packs'), buns: $('#v-shop > .buns') }
    rows.forEach((i, idx) => {
      const category = `${i.shelfKey} ${i.groupKey} ${i.category || ''}`.toLowerCase()
      const section = /bundle/.test(category) ? 'buns' : /currency|gem|solar/.test(category) ? 'packs' : 'deals'
      const price = Math.max(1, Math.round((i.buyPrice || 0) * (1 - (shop.you?.discount || 0) / 100)))
      const locked = (shop.you?.level || player?.level || 1) < (i.levelReq || 1) || player?.inBattle === true && !(i.consumable === true || i.type === 'consumable' || i.category === 'consumable')
      const tile = document.createElement('div')
      tile.dataset.catalogItem = i.id
      tile.className = section === 'buns' ? 'bun' : section === 'packs' ? 'pack' : 'deal'
      const buy = `<button class="pbtn" data-buy="${idx}" ${locked ? 'disabled' : ''}>${locked ? `Requires Lv ${num(i.levelReq)}` : `${num(price)} solars`}</button>`
      tile.innerHTML = section === 'buns'
        ? `<div class="bimg">${image(i.image)}</div><div class="btx"><b>${esc(i.name)}</b><p>${esc(i.description)}</p></div>${buy}`
        : `<div class="${section === 'packs' ? 'pic' : 'dimg'}">${image(i.image)}</div><b>${esc(i.name)}</b><p>${esc(i.description)}</p>${buy}`
      destinations[section].append(tile)
      tile.querySelector('[data-buy]').onclick = () => requireAccount(() => {
        panel('Confirm purchase', `<p>Buy ${esc(i.name)} for ${num(price)} solars? The bot validates the final price and your balance.</p><button class="pm-cta" id="confirm-buy">Buy one</button>`)
        $('#confirm-buy').onclick = () => run('buy', async () => { await commit(() => api.buyItem(i.id, 1), async () => { message('Purchased', `${i.name} was added to your inventory.`); await refreshPlayer(); await loadShop() }) })
      })
    })
    text('#shop-status', rows.length ? '' : 'No items to display.')
  }
  async function loadBoard() {
    const selectedBoard = board
    const out = await api.leaderboard(selectedBoard, 50)
    if (selectedBoard !== board) return
    const rows = out.rows || []
    const openPlayer = (r) => run('player', async () => {
      const result = await api.player(r.uid); const p = result.player
      if (features) return features.publicPlayer(r.uid)
      message(p.name, `Level ${p.level} · ${p.rank?.title || ''} · ${p.bio || ''}`)
    })
    const podium = $$('#v-leaderboard .lb-pod')
    ;[1, 0, 2].forEach((index, slot) => {
      const el = podium[slot], row = rows[index]
      if (!el) return
      const label = el.querySelector('.sk, .lb-player-name')
      if (label) { label.className = 'lb-player-name'; label.textContent = row?.name || 'No player yet' }
      el.querySelector('.lb-sc').textContent = row ? row.display ?? num(row.score) : '—'
      el.querySelector('.lb-av .av').innerHTML = row ? image(row.avatarUrl) || esc(row.name?.slice(0, 1)) : ''
      el.dataset.apiAction = '1'; el._apiAction = () => row ? openPlayer(row) : undefined
      el.setAttribute('aria-disabled', String(!row))
    })
    $('#v-leaderboard .lb-list').innerHTML = rows.slice(3).map((r, idx) => `<button class="lb-row" data-player="${esc(r.uid)}"><span class="lb-n">${num(r.position || idx + 4)}</span>${image(r.avatarUrl, 'lb-ra')}<span>${esc(r.name)}</span><span class="lb-s">${esc(r.display ?? num(r.score))}</span></button>`).join('') || '<p class="sub">No further ranked players.</p>'
    $$('#v-leaderboard [data-player]').forEach(el => { el.onclick = () => openPlayer(rows.find(r => r.uid === el.dataset.player)) })
    text('#v-leaderboard .lb-you', out.you ? `Your rank: #${out.you.position} / ${out.you.of} · ${num(out.you.score)}` : 'Sign in to see your rank.')
  }
  async function notes() {
    if (!player) return login()
    const out = await api.notifications()
    panel('Notifications', `<button class="gbtn" id="read-all">Mark all as read</button>${(out.items || []).map((n, idx) => `<div class="api-card"><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p><button class="gbtn" data-note="${idx}">Mark read</button></div>`).join('') || '<p>You are all caught up.</p>'}`)
    $('#read-all').onclick = () => run('read-all', async () => { await api.markAllNotificationsRead(); await notes() })
    $$('[data-note]').forEach(el => { el.onclick = () => run('read-note', async () => { await api.markNotificationRead(out.items[Number(el.dataset.note)].id); await notes() }) })
  }
  // Premium is an app-owned presentation, independent of the bot catalog/API.
  function premium() {
    text('#v-premium .pm-price b', 'Not set')
  }
  async function cards(page = 1) {
    const out = await api.cardCatalog({ page, limit: 24 })
    const items = out.items || out.cards || []
    panel('Card catalog', `<div class="api-grid">${items.map(c => `<div class="api-card">${image(c.image || c.imageUrl)}<h3>${esc(c.title || c.name)}</h3><p>Tier ${esc(c.tier)}</p></div>`).join('') || '<p>No cards available.</p>'}</div><button class="gbtn" id="card-bot">Manage cards in the bot</button>`)
    $('#card-bot').onclick = () => command('cards')
    const footer = document.createElement('div')
    footer.innerHTML = `<button class="gbtn" id="cards-prev" ${page <= 1 ? 'disabled' : ''}>Previous page</button><button class="gbtn" id="cards-next" ${!out.hasMore ? 'disabled' : ''}>Next page</button>`
    $('.api-sheet').append(footer)
    $('#cards-prev').onclick = () => run('cards', () => cards(page - 1))
    $('#cards-next').onclick = () => run('cards', () => cards(page + 1))
  }
  async function season() {
    const out = await api.season()
    panel('Season', out.active ? `<h3>${esc(out.season?.name)}</h3><p>${esc(out.season?.description)}</p><p>Your tier: ${num(out.player?.tier)} / ${num(out.season?.tierCount)}</p><button class="gbtn" id="season-bot">Open battle pass in bot</button>` : '<p>No active season.</p>')
    if ($('#season-bot')) $('#season-bot').onclick = () => command('season')
  }
  function edit(field) {
    requireAccount(() => {
      panel(`Edit ${field}`, `<form id="edit-profile"><label>${esc(field)}<input name="value" value="${esc(player[field])}" required maxlength="120"></label><button class="pm-cta">Save</button></form>`)
      $('#edit-profile').onsubmit = e => { e.preventDefault(); run('edit', async () => { const value = new FormData(e.target).get('value'); await commit(() => (field === 'name' ? api.updateName : api.updateBio)(value), async () => { await refreshPlayer(); closePanel() }) }) }
    })
  }
  function upload(kind) {
    requireAccount(() => {
      panel(`Change ${kind === 'pfp' ? 'profile picture' : 'banner'}`, '<label>Image (up to 5 MB)<input id="profile-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>')
      $('#profile-file').onchange = e => run('upload', async () => { const file = e.target.files[0]; if (!file) return; const dataUrl = await fileToDataUrl(file); await commit(() => api.uploadImage(kind, dataUrl), async () => { await refreshPlayer(); closePanel() }) })
    })
  }
  async function view(name) {
    if (name === 'shop') { await run('shop', loadShop); return features?.view(name) }
    if (name === 'premium') return features ? features.view(name) : premium()
    if (name === 'leaderboard') return run('board', loadBoard)
    if (['profile', 'settings'].includes(name) && authReady) { if (!player) return login(); await run('me', refreshPlayer) }
    return features?.view(name)
  }
  // Capture API-bound controls before the prototype's presentation-only handlers.
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-api-action]')
    if (el?.disabled || el?.hidden) { e.preventDefault(); e.stopImmediatePropagation(); return }
    if (!el) return
    e.preventDefault(); e.stopImmediatePropagation()
    run('control', () => el._apiAction(el))
  }, true)
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab' && $('#api-panel') && !$('#api-panel').hidden) {
      const controls = [...$('#api-panel').querySelectorAll('button, input, select, a[href]')].filter(el => !el.disabled && !el.hidden)
      const first = controls[0], last = controls[controls.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    if (e.key === 'Escape' && $('#api-panel') && !$('#api-panel').hidden) { e.stopImmediatePropagation(); closePanel() }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-api-action]:not(button):not(a):not(input)')) { e.preventDefault(); e.target.click() }
  }, true)
  window.addEventListener('astral:view', e => view(e.detail))
  window.addEventListener('astral:unavailable', () => command('menu'))
  onAuthLost(() => { epoch++; player = null; features?.reset(); paintPlayer(); login() })
  // Keep every original Shop and Premium section. Data populates existing
  // item containers; connection failures never replace the supplied UI.
  clearShopItems()
  const status = document.createElement('p'); status.id = 'shop-status'; status.className = 'sub'; status.setAttribute('role', 'status')
  $('#v-shop .search').after(status)
  const retry = document.createElement('button'); retry.className = 'gbtn'; retry.id = 'shop-retry'; retry.textContent = 'Refresh items'; retry.onclick = () => run('shop', loadShop)
  status.after(retry)
  const featureButton = $('#v-shop > .feat button')
  if (featureButton) { featureButton.disabled = true; featureButton.title = 'No featured item has been provided' }
  // The reference has placeholders, not purchasable products. Remove its
  // fabricated discount/timer values while leaving the original feature frame.
  $$('#v-shop > .feat .sk').forEach(el => { el.classList.remove('sk'); el.textContent = '' })
  bind('#v-shop .pill', el => { shelf = el.textContent.trim(); $$('#v-shop .pill').forEach(p => p.classList.toggle('on', p === el)); paintShop() })
  $('#v-shop input').addEventListener('input', e => { query = e.target.value.toLowerCase().trim(); paintShop() })
  // Static app-owned copy, not a bot subscription or a fabricated entitlement.
  text('#v-premium .pm-save', 'Yearly')
  const perkCopy = ['App premium features', 'App passes', 'App-exclusive rewards']
  $$('#v-premium .pm-perks .sk').forEach((el, i) => { el.className = 'pm-description'; el.textContent = perkCopy[i] })
  const planHint = $('#v-premium .pm-plan .sk')
  if (planHint) { planHint.className = 'pm-description'; planHint.textContent = 'App pricing will be announced here.' }
  $$('#v-premium .pm-faq details').forEach((el, i) => {
    el.querySelectorAll('.sk').forEach(x => x.remove())
    const answer = document.createElement('p')
    answer.textContent = i ? 'Viewing Premium does not change your game progress or account.' : 'Subscription and cancellation details will be shown when app purchases are configured.'
    el.append(answer)
  })
  bind('#v-premium > .pm-cta', () => message('App Premium', 'Premium is managed by this app, separately from the bot. Pricing and the app purchase flow are not configured yet. No subscription has been started.'))
  premium()
  // Preserve the supplied period pills and podium. Do not mislabel lifetime
  // API results as weekly/monthly results that the client cannot request.
  $$('#v-leaderboard .pills .pill').forEach((el, i) => {
    el.classList.toggle('on', i === 2)
    if (i < 2) { el.disabled = true; el.title = 'The bot API does not expose this period yet' }
    else { el.dataset.apiAction = '1'; el._apiAction = loadBoard }
  })
  const boardPicker = document.createElement('button'); boardPicker.className = 'gbtn'; boardPicker.textContent = 'Choose ranking'; boardPicker.id = 'board-picker'
  $('#v-leaderboard .pills').after(boardPicker)
  boardPicker.onclick = () => {
    panel('Choose ranking', ['level', 'floor', 'season', 'fame', 'wealth', 'wins'].map(b => `<button class="gbtn" data-board="${b}">${esc(b)}</button>`).join(''))
    $$('[data-board]').forEach(el => { el.onclick = () => run('board', async () => { board = el.dataset.board; await loadBoard(); closePanel() }) })
  }
  bind('#v-home .tools .rb:nth-child(1), #dd-read, .dd-act, .dd-item', notes)
  bind('#v-home .stat:nth-child(3), #v-home .cards, #v-home .tcard', () => cards())
  bind('#v-home .season, #v-home .box', season)
  bind('.pf-av .edit', () => upload('pfp')); bind('.pf-cam', () => upload('banner'))
  bind('.pf-name', () => edit('name'))
  bind('.pf-pills .pill', el => { invFilter = el.textContent; $$('.pf-pills .pill').forEach(p => p.classList.toggle('on', p === el)); paintInventory() })
  bind('#v-settings .pf-out', () => requireAccount(async () => { try { await api.logout() } finally { epoch++; player = null; features?.reset(); paintPlayer(); login() } }))
  bind('#v-settings .pf-row', el => requireAccount(async () => {
    const name = el.querySelector('.pf-rn').textContent
    if (name === 'Account') { panel('Account', '<button class="gbtn" id="rename">Edit name</button><button class="gbtn" id="bio">Edit bio</button><button class="pf-out" id="revoke">Sign out all devices</button>'); $('#rename').onclick = () => edit('name'); $('#bio').onclick = () => edit('bio'); $('#revoke').onclick = () => { panel('Sign out all devices?', '<button class="pf-out" id="confirm-revoke">Confirm sign out</button>'); $('#confirm-revoke').onclick = () => run('revoke', async () => { try { await api.revokeSessions() } finally { epoch++; player = null; features?.reset(); paintPlayer(); login() } }) }; return }
    if (name === 'Notifications') { await api.updateSettings({ dmNotifications: player.settings?.dmNotifications === false }); await refreshPlayer(); return }
    if (name === 'Privacy') { panel('Privacy', '<p>Control whether your character appears on public boards.</p><button class="gbtn" id="privacy-toggle">Toggle leaderboard visibility</button>'); $('#privacy-toggle').onclick = () => run('privacy', async () => { await api.updateSettings({ hiddenFromLeaderboard: !player.settings?.hiddenFromLeaderboard }); await refreshPlayer(); message('Privacy saved', player.settings?.hiddenFromLeaderboard ? 'Hidden from public boards.' : 'Visible on public boards.') }); return }
    if (name === 'Appearance') { message('Appearance', 'This app uses the supplied dark design.'); return }
    if (name === 'Help') command('help')
  }))
  // The shared API exposes no dungeon, equipment or combat mutation endpoints.
  // Route these to the real bot instead of running the sample combat simulation.
  bind('.pf-slot .sq, .pf-h, .cb-sk, .cb-atk, .cb-dp, #cb-auto', () => message('Gameplay API not connected', 'This action needs the bot equipment or combat API. Your account has not been changed.'))
  bind('.sec a', el => {
    const heading = el.parentElement.querySelector('h2')?.textContent || ''
    if (el.closest('#v-shop')) { shelf = /Currency/i.test(heading) ? 'Currency' : /Bundle/i.test(heading) ? 'Bundles' : 'Featured'; paintShop(); return }
    if (/Card/.test(heading)) return cards()
    if (/Rank/.test(heading)) return nav('leaderboard')
    if (/Dungeon/i.test(heading)) return nav('dg-list')
    if (/Battle/i.test(heading)) return nav('fight')
    if (/Armor|runs/i.test(heading)) return message('Gameplay API not connected', 'Live equipment and battle history need the bot API. The original layout is preserved.')
    return nav('shop')
  })
  bind('#v-home .me, #v-home .tools .rb:nth-child(2)', () => player ? nav('profile') : login())
  // Keep the supplied dungeon, combat and profile layouts intact. Only the
  // server-dependent action explains missing API support; navigation still works.
  bind('[data-go="dg-combat"]', () => message('Dungeon API not connected', 'This screen is ready, but starting a real run needs the bot dungeon API. No run has been started or charged.'))
  // Every remaining prototype action has an explicit, real bot handoff.
  bind('[data-soon="1"]:not([data-api-action])', () => command('menu'))
  if (mountFeatures) features = mountFeatures({ art, focusShopItem: id => { shelf = 'Featured'; query = ''; $('#v-shop input').value = ''; paintShop(); const tile = $$('#v-shop [data-catalog-item]').find(el => el.dataset.catalogItem === id); tile?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }) }, api, $, $$, text, esc, num, image, panel, closePanel, message, run, bind, nav, requireAccount, refreshPlayer, commit, countdown, getPlayer: () => player, restart: () => boot() })
  function boot() { return run('boot', async () => {
    if (features && !await features.startup()) return
    const [m, session] = await Promise.all([api.meta(), api.session()]); meta = m; authReady = true
    if (session.needsRegistration) return registration()
    player = session.signedIn ? session.player : null
    if (session.signedIn && !player) await refreshPlayer(); else paintPlayer()
    bind('#v-home .hello', () => player ? nav('profile') : login())
    if (!player) login()
    // Replace perpetual skeletons with honest loading/empty labels.
    $$('#v-home .cards .tcard').forEach(el => { el.textContent = 'Browse cards' })
    text('#v-home .season', 'View current season'); text('#v-home .box', 'Battle pass')
    // Keep the original five ranking tiles while live standings are unavailable.
    bind('#v-home .rank', () => nav('leaderboard'))
    await features?.afterAuth()
    await view($$('.view').find(v => !v.hidden)?.id.replace('v-', ''))
  }) }
  return boot()
}
