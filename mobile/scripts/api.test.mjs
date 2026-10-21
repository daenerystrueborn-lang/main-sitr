import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import test from 'node:test'

// Exercise the exact shared client source that the mobile bundler consumes.
const original = fs.readFileSync(new URL('../../assets/js/api.js', import.meta.url), 'utf8')
function client(respond) {
  const calls = [], saved = new Map()
  const context = vm.createContext({
    window: { ASTRAL_API_BASE: 'https://configured-bot.example' },
    location: { search: '', hostname: 'preview.e2b.app' }, URLSearchParams,
    localStorage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v), removeItem: k => saved.delete(k) },
    crypto: webcrypto, Uint8Array, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options })
      const response = respond(url, options)
      return { ok: response.status < 400, status: response.status, text: async () => JSON.stringify(response.body) }
    },
  })
  vm.runInContext(original.replace(/export /g, '') + '\nthis.client = { api, getToken, onAuthLost };', context)
  return { ...context.client, calls, saved }
}

test('injected API origin, OTP token persistence and bearer-auth writes are shared across areas', async () => {
  const { api, calls, getToken } = client(url => ({ status: 200, body: url.endsWith('/verify-otp') ? { token: 'test-session' } : {} }))
  await api.verifyOtp({ handle: 'opaque-account' }, '123456')
  assert.equal(getToken(), 'test-session')
  await api.buyItem('helm', 1)
  await api.updateSettings({ dmNotifications: false })
  await api.markAllNotificationsRead()
  for (const { url, options } of calls.slice(1)) {
    assert.ok(url.startsWith('https://configured-bot.example/api/'))
    assert.equal(options.headers.Authorization, 'Bearer test-session')
  }
  assert.equal(calls[1].options.body, '{"id":"helm","qty":1}')
  assert.equal(calls[2].options.method, 'PATCH')
  await api.logout()
  assert.equal(getToken(), null)
})

test('401 invalidates the session and reports an auth error instead of stale success', async () => {
  const { api, onAuthLost, getToken } = client(url => url.endsWith('/verify-otp') ? { status: 200, body: { token: 'test-session' } } : { status: 401, body: { error: 'Session expired' } })
  await api.verifyOtp({ handle: 'opaque' }, '123456')
  let lost = false
  onAuthLost(() => { lost = true })
  await assert.rejects(api.me(), /Session expired/)
  assert.equal(lost, true)
  assert.equal(getToken(), null)
})

test('every mutation gets a unique idempotency key; explicit network retry retains key and exact body', async () => {
  let attempts = 0
  const { api, calls } = client(() => { if (++attempts === 1) throw new Error('connection dropped'); return { status: 200, body: { ok: true } } })
  let failure
  try { await api.buyItem('health_potion', 2) } catch (e) { failure = e }
  assert.ok(failure?.retry)
  await failure.retry()
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key'])
  assert.equal(calls[0].options.body, calls[1].options.body)
  await api.buyItem('health_potion', 2)
  assert.notEqual(calls[1].options.headers['Idempotency-Key'], calls[2].options.headers['Idempotency-Key'])
})

test('lookup uses contract name field and 2xx ok:false never becomes local success', async () => {
  const { api, calls } = client(() => ({ status: 200, body: { ok: false, code: 'INVENTORY_FULL', error: 'Inventory full' } }))
  await assert.rejects(api.lookupAccount('Ada'), /Inventory full/)
  assert.equal(calls[0].options.body, '{"name":"Ada"}')
})

test('app API uses exact encoded stable IDs, versioned action bodies, and no guessed unsupported routes', async () => {
  const requests = []
  const context = vm.createContext({ URLSearchParams })
  const appSource = fs.readFileSync(new URL('../app-shell/app-api.js', import.meta.url), 'utf8')
  vm.runInContext(appSource.replace(/export /g, ''), context)
  const api = context.createAppApi({}, (path, options) => { requests.push({ path, options }); return Promise.resolve({ ok: true }) })
  await api.inventoryItem('inventory:health_potion')
  await api.equip('inventory:iron_sword', 'weapon', 'equip-key')
  await api.saveParty(['character:saber'], 'party-key')
  await api.combatAction('dr_1', { type: 'move', direction: 'left', expectedVersion: 9 }, 'action-key')
  assert.equal(requests[0].path, '/me/inventory/inventory%3Ahealth_potion')
  assert.equal(requests[1].options.idempotencyKey, 'equip-key')
  assert.equal(JSON.stringify(requests[1].options.body), '{"itemInstanceId":"inventory:iron_sword","slot":"weapon"}')
  assert.equal(JSON.stringify(requests[2].options.body), '{"memberIds":["character:saber"],"formation":["front"]}')
  assert.equal(requests[3].path, '/dungeon-runs/dr_1/actions')
  assert.equal(requests[3].options.body.expectedVersion, 9)
  for (const name of ['upgrade', 'quickClear', 'autoBattle', 'pause', 'resume', 'webhook']) assert.equal(api[name], undefined)
})
