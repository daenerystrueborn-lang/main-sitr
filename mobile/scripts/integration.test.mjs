import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { parseHTML } from 'linkedom'

const source = new URL('../app-shell/', import.meta.url)
const read = name => fs.readFileSync(new URL(name, source), 'utf8')
async function setup(overrides = {}) {
  const { window, document } = parseHTML(read('index.html'))
  const calls = []
  const player = { name: 'Ada', level: 12, rank: { title: 'Knight' }, wallet: { solars: 500, gems: 4 }, record: { wins: 3, losses: 1 }, inventory: [{ name: 'Sword', qty: 1, type: 'weapon' }], settings: { dmNotifications: true } }
  let lostAuth
  const api = new Proxy({
    meta: async () => ({ botNumber: '2348000000000', prefix: '.' }),
    session: async () => ({ signedIn: true, player }),
    me: async () => ({ player }),
    shop: async () => ({ you: { level: 12 }, shelves: [{ key: 'armor', label: 'Armor', groups: [{ rows: [{ id: 'helm', name: 'Helmet', buyPrice: 50, levelReq: 2 }] }] }] }),
    premium: async () => ({ nairaPerUsd: 1000, plans: [{ label: 'Monthly', priceNaira: 2000, durationDays: 30, command: '.premium buy monthly' }] }),
    leaderboard: async () => ({ rows: [{ uid: 'user-1', name: 'Ada', score: 12 }], you: { position: 1, of: 1, score: 12 } }),
    notifications: async () => ({ items: [{ id: 'note-1', title: 'Reward', body: 'Claim your reward' }] }),
    ...overrides,
  }, { get(target, key) { return async (...args) => { calls.push([key, ...args]); return target[key] ? target[key](...args) : {} } } })
  const context = vm.createContext({ window, document, CustomEvent: window.CustomEvent, screen: {}, URL, FormData: class { constructor(form) { this.values = [...form.querySelectorAll('[name]')].map(el => [el.name, el.value]) } get(name) { return this.values.find(row => row[0] === name)?.[1] } [Symbol.iterator]() { return this.values[Symbol.iterator]() } }, setTimeout: () => 0, clearTimeout: () => {} })
  vm.runInContext(read('design.js'), context)
  vm.runInContext(read('integration.js').replace('export function initialize', 'function initialize'), context)
  await context.initialize({ api, API_BASE: 'https://bot.example', onAuthLost: fn => { lostAuth = fn }, fileToDataUrl: async () => 'data:image/png;base64,AA==' })
  const action = async q => { const el = document.querySelector(q); assert.ok(el, q); await el._apiAction(el) }
  return { window, document, calls, action, api, lostAuth }
}

test('session populates account, balances and inventory without sample combat', async () => {
  const { document, calls } = await setup()
  assert.equal(document.querySelector('.pf-name').textContent, 'Ada')
  assert.equal(document.querySelector('#v-home .stat b').textContent, '500')
  assert.match(document.querySelector('.pf-inv').textContent, /Sword/)
  assert.ok(document.querySelector('#v-fight .fx-feat'))
  assert.ok(document.querySelector('#v-dg-prep [data-go="dg-combat"]'))
  assert.equal(document.querySelectorAll('#v-leaderboard .lb-pod').length, 3)
  assert.ok(calls.some(c => c[0] === 'session'))
  assert.equal(document.querySelectorAll('[data-soon]:not([data-api-action])').length, 0)
})

test('shop loads catalog and confirmed purchase uses the correct API payload', async () => {
  const { window, document, calls } = await setup()
  window.astralNav.show('shop')
  await new Promise(resolve => setImmediate(resolve))
  assert.match(document.querySelector('#v-shop > .deals').textContent, /Helmet/)
  document.querySelector('[data-buy]').onclick()
  await document.querySelector('#confirm-buy').onclick()
  assert.ok(calls.some(c => c[0] === 'buyItem' && c[1] === 'helm' && c[2] === 1))
  assert.match(document.querySelector('#api-panel').textContent, /Purchased/)
})

test('notification writes and board filter use real API contracts; premium stays app-local', async () => {
  const { window, document, calls, action } = await setup()
  await action('#v-home .tools .rb:nth-child(1)')
  await document.querySelector('#read-all').onclick()
  assert.ok(calls.some(c => c[0] === 'markAllNotificationsRead'))
  window.astralNav.show('premium')
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(document.querySelector('#v-premium .pm-hero'))
  assert.ok(document.querySelector('#v-premium .pm-table'))
  assert.equal(calls.some(c => c[0] === 'premium'), false)
  document.querySelector('#board-picker').onclick()
  await document.querySelector('[data-board="wins"]').onclick()
  assert.ok(calls.some(c => c[0] === 'leaderboard' && c[1] === 'wins'))
})

test('expired sessions clear player data and open sign-in', async () => {
  const { document, lostAuth } = await setup()
  lostAuth()
  assert.equal(document.querySelector('.pf-name').textContent, 'Sign in')
  assert.ok(document.querySelector('#login-form'))
  assert.doesNotMatch(document.querySelector('.pf-inv').textContent, /Sword/)
})

test('signed-out boot offers OTP login and failed boot has retry', async () => {
  const signedOut = await setup({ session: async () => ({ signedIn: false }) })
  assert.ok(signedOut.document.querySelector('#login-form'))
  const offline = await setup({ meta: async () => { throw new Error('Cannot reach the server.') } })
  assert.match(offline.document.querySelector('#api-panel').textContent, /Cannot reach the server/)
  assert.match(offline.document.querySelector('#api-panel').textContent, /Retry connection/)
})


test('character lookup, OTP request and verify lead to an authenticated profile', async () => {
  const { document, calls } = await setup({
    session: async () => ({ signedIn: false }),
    lookupAccount: async () => ({ name: 'Ada', handle: 'account-handle', maskedPhone: '***1234' }),
    verifyOtp: async () => ({ token: 'test-token' }),
  })
  const submit = async selector => {
    document.querySelector(selector).onsubmit({ preventDefault() {}, target: document.querySelector(selector) })
    await new Promise(resolve => setImmediate(resolve))
  }
  document.querySelector('[name="username"]').value = 'Ada'
  await submit('#login-form')
  await document.querySelector('#send-code').onclick()
  document.querySelector('[name="code"]').value = '123456'
  await submit('#code-form')
  assert.ok(calls.some(c => c[0] === 'lookupAccount' && c[1] === 'Ada'))
  assert.ok(calls.some(c => c[0] === 'requestOtp' && c[1].handle === 'account-handle'))
  assert.ok(calls.some(c => c[0] === 'verifyOtp' && c[1].handle === 'account-handle' && c[2] === '123456'))
  assert.equal(document.querySelector('.pf-name').textContent, 'Ada')
  assert.equal(document.querySelector('#v-profile').hidden, false)
})


test('offline dialog covers the UI, blocks background controls, and closes cleanly', async () => {
  const { document } = await setup({ meta: async () => { throw new Error('Cannot reach the server.') } })
  const host = document.querySelector('#api-panel')
  assert.equal(host.hidden, false)
  assert.equal(host.style.zIndex, '1000')
  assert.equal(host.style.display, 'flex')
  assert.equal(host.querySelector('.api-sheet').style.background, '#141416')
  assert.equal(document.querySelector('#v-home').inert, true)
  host.querySelector('.api-close').onclick()
  assert.equal(host.hidden, true)
  assert.equal(host.style.display, 'none')
  assert.equal(document.querySelector('#v-home').inert, false)
})

test('dungeon preparation keeps the supplied design and blocks only the unsupported start action', async () => {
  const { window, document, action } = await setup()
  window.astralNav.show('fight')
  document.querySelector('#v-fight [data-go="dg-prep"]').click()
  assert.equal(document.querySelector('#v-dg-prep').hidden, false)
  await action('#v-dg-prep [data-go="dg-combat"]')
  assert.match(document.querySelector('#api-panel').textContent, /Dungeon API not connected/)
  assert.equal(document.querySelector('#v-dg-combat').hidden, true)
  assert.ok(document.querySelector('#v-dg-combat .cb-stage'))
})


test('offline shop preserves original sections without dummy products or replacement cards', async () => {
  const { window, document } = await setup({ shop: async () => { throw new Error('Offline') } })
  window.astralNav.show('shop')
  await new Promise(resolve => setImmediate(resolve))
  for (const selector of ['.feat', '.deals', '.packs', '.buns', '.pills', '.search']) assert.ok(document.querySelector('#v-shop > ' + selector), selector)
  assert.equal(document.querySelectorAll('#v-shop .deal, #v-shop .pack, #v-shop .bun, #v-shop .api-card').length, 0)
  assert.match(document.querySelector('#shop-status').textContent, /unavailable/)
  assert.equal(document.querySelectorAll('#v-shop > .sec').length, 3)
})

test('premium remains complete and interactive when every backend request fails', async () => {
  const { window, document, calls, action } = await setup({ meta: async () => { throw new Error('Offline') } })
  document.querySelector('.api-close').onclick()
  window.astralNav.show('premium')
  await new Promise(resolve => setImmediate(resolve))
  for (const selector of ['.pm-hero', '.pm-seg', '.pm-plan', '.pm-perks', '.pm-table', '.pm-faq']) assert.ok(document.querySelector('#v-premium ' + selector), selector)
  document.querySelector('#v-premium [data-u="year"]').click()
  assert.equal(document.querySelector('#pm-unit').textContent, '/ year')
  await action('#v-premium > .pm-cta')
  assert.match(document.querySelector('#api-panel').textContent, /managed by this app/)
  assert.equal(calls.some(c => c[0] === 'premium'), false)
  assert.equal(document.querySelector('#api-panel a'), null)
})

const settleAuth = () => new Promise(resolve => setImmediate(resolve))
async function submitAuth(document, selector) {
  const form = document.querySelector(selector)
  await form.onsubmit({ preventDefault() {}, target: form }); await settleAuth()
}

test('dedicated sign-in screens find an account before code delivery and allow correcting the account', async () => {
  const { document, calls } = await setup({
    session: async () => ({ signedIn: false }),
    lookupAccount: async name => ({ handle: 'opaque:ada', name, maskedPhone: '***1234' }),
  })
  assert.equal(document.querySelector('#api-panel').classList.contains('auth-mode'), true)
  assert.equal(document.querySelector('.auth-progress [aria-current="step"]').textContent, '01Account')
  document.querySelector('[name="username"]').value = ' Ada '
  await submitAuth(document, '#login-form')
  assert.equal(calls.filter(c => c[0] === 'lookupAccount')[0][1], 'Ada')
  assert.equal(calls.some(c => c[0] === 'requestOtp'), false)
  assert.match(document.querySelector('.auth-account').textContent, /Ada.*1234/)
  await document.querySelector('#different-account').onclick()
  assert.ok(document.querySelector('#login-form'))
})

test('phone signup verifies first, then creates a character from real class/race choices', async () => {
  const { document, calls } = await setup({
    meta: async () => ({ classes: [{ id: 'warrior', name: 'Warrior' }], races: [{ id: 'human', name: 'Human' }] }),
    session: async () => ({ signedIn: false }), verifyOtp: async () => ({ needsRegistration: true }),
  })
  document.querySelector('#signup').onclick()
  document.querySelector('[name="phone"]').value = '+234 (800) 123-4567'
  await submitAuth(document, '#phone-form')
  assert.deepEqual(calls.find(c => c[0] === 'requestOtp'), ['requestOtp', '+2348001234567'])
  assert.doesNotMatch(document.querySelector('.auth-subtitle').textContent, /2348001234567/)
  document.querySelector('[name="code"]').value = '123456'; await submitAuth(document, '#code-form')
  assert.ok(document.querySelector('#register-form'))
  assert.equal(calls.some(c => c[0] === 'register'), false)
  document.querySelector('[name="name"]').value = 'Ada'
  document.querySelector('[name="classId"] option').selected = true
  document.querySelector('[name="raceId"] option').selected = true
  await submitAuth(document, '#register-form')
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find(c => c[0] === 'register'))), ['register', { name: 'Ada', classId: 'warrior', raceId: 'human' }])
  assert.equal(document.querySelector('#api-panel').hidden, true)
  assert.equal(document.querySelector('.pf-name').textContent, 'Ada')
})

test('invalid code stays on verification; invalid phone never sends an OTP', async () => {
  const { document, calls } = await setup({ session: async () => ({ signedIn: false }) })
  document.querySelector('#signup').onclick()
  document.querySelector('[name="phone"]').value = 'not a phone'
  await submitAuth(document, '#phone-form')
  assert.equal(calls.some(c => c[0] === 'requestOtp'), false)
  document.querySelector('[name="phone"]').value = '+2348001234567'; await submitAuth(document, '#phone-form')
  document.querySelector('[name="code"]').value = '12ab'; await submitAuth(document, '#code-form')
  assert.equal(calls.some(c => c[0] === 'verifyOtp'), false)
  assert.match(document.querySelector('#api-error').textContent, /six-digit/)
})

test('failed OTP verification preserves the code screen and re-enables verification', async () => {
  const { document } = await setup({
    session: async () => ({ signedIn: false }), verifyOtp: async () => { throw new Error('Incorrect verification code') },
  })
  document.querySelector('#signup').onclick(); document.querySelector('[name="phone"]').value = '+2348001234567'; await submitAuth(document, '#phone-form')
  document.querySelector('[name="code"]').value = '123456'; await submitAuth(document, '#code-form')
  assert.match(document.querySelector('#api-error').textContent, /Incorrect/)
  assert.equal(document.querySelector('#verify-code').disabled, false)
})

test('verified sign-in retries only the profile read when loading the account fails', async () => {
  let reads = 0
  const { document, calls } = await setup({
    session: async () => ({ signedIn: false }),
    me: async () => { if (++reads === 1) throw new Error('Offline profile'); return { player: { name: 'Ada', inventory: [], wallet: {} } } },
    verifyOtp: async () => ({ token: 'verified-session' }),
  })
  document.querySelector('#signup').onclick(); document.querySelector('[name="phone"]').value = '+2348001234567'; await submitAuth(document, '#phone-form')
  document.querySelector('[name="code"]').value = '123456'; await submitAuth(document, '#code-form')
  assert.ok(document.querySelector('#finish-signin'))
  await document.querySelector('#finish-signin').onclick()
  assert.equal(calls.filter(c => c[0] === 'verifyOtp').length, 1)
  assert.ok(calls.filter(c => c[0] === 'me').length >= 2)
  assert.equal(document.querySelector('#api-panel').hidden, true)
})

test('OTP delivery cooldown survives going back to the account confirmation', async () => {
  const { document, calls } = await setup({
    session: async () => ({ signedIn: false }), lookupAccount: async () => ({ name: 'Ada', handle: 'opaque:ada', maskedPhone: '***1234' }),
    requestOtp: async () => ({ ttlMs: 300000, resendAfterMs: 60000 }),
  })
  document.querySelector('[name="username"]').value = 'Ada'; await submitAuth(document, '#login-form')
  await document.querySelector('#send-code').onclick()
  assert.equal(document.querySelector('#resend-code').disabled, true)
  document.querySelector('#auth-back').onclick(); await document.querySelector('#send-code').onclick()
  assert.equal(calls.filter(c => c[0] === 'requestOtp').length, 1)
  assert.match(document.querySelector('#api-error').textContent, /wait/)
})
