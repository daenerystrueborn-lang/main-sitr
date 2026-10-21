import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { parseHTML } from 'linkedom'

const read = name => fs.readFileSync(new URL(`../app-shell/${name}`, import.meta.url), 'utf8')
const wait = () => new Promise(resolve => setImmediate(resolve))
async function setup(overrides = {}) {
  const { window, document } = parseHTML(read('index.html'))
  const calls = [], timers = new Map()
  let timerId = 0, lostAuth
  const player = { name: 'Ada', level: 12, wallet: { solars: 500, gems: 4 }, inventory: [], settings: {}, rank: { title: 'Knight' }, record: { wins: 2, losses: 1 } }
  const combat = { stateVersion: 3, floor: 1, room: 1, player: { hp: 80, maxHp: 100, mp: 20, maxMp: 30 }, enemy: { id: 'enemy-1', name: 'Slime', hp: 20, maxHp: 20 }, allowedActions: ['attack', 'defend'] }
  const defaults = {
    appConfig: () => ({ minimumSupportedVersion: '1.0.0', maintenance: { active: false }, features: { dungeonRuns: true, dungeonMovement: true, autoBattle: false, partyCombat: false, appPremiumBilling: false } }),
    meta: () => ({ classes: [{ id: 'warrior', name: 'Warrior' }], races: [{ id: 'human', name: 'Human' }], prefix: '.', botNumber: '2348000000000' }),
    session: () => ({ signedIn: true, player }), me: () => ({ player }),
    featured: () => ({ banners: [], shopItemIds: [], dungeonId: 'newbie_hollow' }),
    shopOffers: () => ({ offers: [] }), subscription: () => ({ active: false, status: 'none' }),
    appPlans: () => ({ plans: [{ id: 'app-premium-monthly', billingPeriod: 'month', available: false, verificationRequired: true, features: ['App perk'] }, { id: 'app-premium-yearly', billingPeriod: 'year', available: false, verificationRequired: true }] }),
    activeRun: () => ({ run: null }),
    dungeons: () => ({ dungeons: [{ id: 'newbie_hollow', name: 'Newbie Hollow', description: 'The original dungeon', floors: 5, entryLevel: 1 }], nextCursor: null }),
    dungeon: () => ({ dungeon: { id: 'newbie_hollow', name: 'Newbie Hollow', floors: 5, entryLevel: 1 } }),
    dungeonProgress: () => ({ dungeons: [{ dungeonId: 'newbie_hollow', unlocked: true, highestFloor: 2 }] }),
    preparation: () => ({ eligibility: { allowed: true, energyCost: 1, energy: { current: 5, max: 10 } }, party: { memberIds: ['character:saber'] }, loadoutVersion: 4 }),
    startRun: () => ({ run: { id: 'dr_1', status: 'active', floor: 1 } }),
    combat: () => ({ combat }), runEvents: () => ({ events: [], latestSequence: 0, stateVersion: 3 }),
    combatAction: () => ({ combat: { ...combat, stateVersion: 4, enemy: { ...combat.enemy, hp: 8 } } }),
    inventory: () => ({ items: [{ id: 'inventory:health_potion', name: 'Health potion', qty: 5, category: 'consumable', sellPrice: 10 }], categories: ['consumable'], storage: { used: 5, capacity: 80 }, total: 1 }),
    inventoryItem: () => ({ item: { id: 'inventory:health_potion', name: 'Health potion', qty: 5, sellPrice: 10 } }),
    equipment: () => ({ loadoutVersion: 4, slots: { weapon: null, chestplate: null }, derivedStats: { attack: 12 } }),
    ownedCharacters: () => ({ characters: [{ id: 'character:saber', name: 'Saber', owned: true }] }),
    party: () => ({ memberIds: ['character:saber'], maxMembers: 1, formationSlots: ['front'], combatSupported: false }),
    dungeonGoals: () => ({ resetAt: '2026-10-25T00:00:00Z', goals: [{ id: 'goal-1', title: 'Clear dungeons', progress: 1, target: 1, claimable: true, claimed: false, reward: { solars: 5 } }] }),
    runHistory: () => ({ runs: [] }),
    ...overrides,
  }
  const api = new Proxy(defaults, { get(target, key) { return async (...args) => { calls.push([key, ...JSON.parse(JSON.stringify(args))]); if (!target[key]) throw new Error(`Unexpected API call: ${String(key)}`); return target[key](...args) } } })
  const context = vm.createContext({
    window, document, URL, URLSearchParams, CustomEvent: window.CustomEvent,
    screen: {}, console, Date,
    FormData: class { constructor(form) { this.values = [...form.querySelectorAll('[name]')].map(el => [el.name, el.value]) } get(name) { return this.values.find(v => v[0] === name)?.[1] } [Symbol.iterator]() { return this.values[Symbol.iterator]() } },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id }, clearTimeout: id => timers.delete(id),
  })
  for (const file of ['design.js', 'dungeon-art.js', 'management.js', 'dungeons.js', 'features.js', 'integration.js']) {
    vm.runInContext(read(file).replace(/^import .*\n/gm, '').replace(/export /g, ''), context)
  }
  let features
  await context.initialize({ api, API_BASE: 'https://bot.example', onAuthLost: fn => { lostAuth = fn }, fileToDataUrl: async () => 'data:image/png;base64,AA==', mountFeatures: ui => { features = context.mountFeatures(ui); return features } })
  const action = async q => {
    const el = document.querySelector(q); assert.ok(el, `control exists: ${q}`)
    if (el._apiAction) await el._apiAction(el); else if (el.onclick) await el.onclick(); else el.click()
    await wait()
  }
  const show = async n => { window.astralNav.show(n); await wait(); await wait() }
  return { window, document, calls, action, show, features, lostAuth, timers }
}

function apiError(code, body = {}, retryAfterMs = null) { return Object.assign(new Error(code), { code, body, retryAfterMs, status: 409 }) }

test('startup maintenance/minimum-version gates cannot be dismissed and skip account/game calls', async () => {
  for (const config of [{ minimumSupportedVersion: '99.0.0' }, { maintenance: { active: true, message: 'Server maintenance' } }]) {
    const { document, calls } = await setup({ appConfig: () => config })
    assert.equal(document.querySelector('#api-panel').dataset.blocking, 'true')
    assert.equal(document.querySelector('.api-close').hidden, true)
    document.querySelector('.api-close').onclick()
    assert.equal(document.querySelector('#api-panel').hidden, false)
    assert.equal(calls.some(c => c[0] === 'session'), false)
  }
})

test('original layouts remain, and unsupported difficulty/party/auto/pause/quick-clear controls are hidden', async () => {
  const { document } = await setup()
  assert.ok(document.querySelector('#v-fight .fx-feat'))
  assert.ok(document.querySelector('#v-premium .pm-table'))
  assert.equal([...document.querySelectorAll('#v-dg-list .pill')].filter(el => !el.hidden).map(el => el.textContent).join(','), 'Normal')
  for (const q of ['#cb-auto', '#cb-resume', '#cb-pause', '#v-dg-prep > .fx-wide']) assert.equal(document.querySelector(q).hidden, true, q)
  assert.equal([...document.querySelectorAll('#v-dg-prep .fx-r4:last-of-type .sq')].filter(el => !el.hidden).length, 1)
})

test('premium loads app plans/subscription but never calls bot billing or verification', async () => {
  const { document, calls, show, action } = await setup({ subscription: () => ({ active: true, status: 'active', billingPeriod: 'year', expiresAt: '2027-10-20T12:00:00Z', autoRenew: false }) })
  await show('premium'); await action('#v-premium [data-u="year"]')
  assert.equal(document.querySelector('#pm-unit').textContent, '/ year')
  assert.equal(document.querySelector('#v-premium > .pm-cta').disabled, true)
  assert.match(document.querySelector('#v-premium .top .bdg').textContent, /active/)
  assert.ok(calls.some(c => c[0] === 'appPlans'))
  assert.equal(calls.some(c => ['premium', 'verifyPurchase', 'restorePurchase'].includes(c[0])), false)
})

test('dungeon start uses exact ID, latest loadout version, normal difficulty and one returned character ID', async () => {
  let active = null
  const { document, calls, show, action } = await setup({ startRun: () => { active = { id: 'dr_1', status: 'active' }; return { run: active } }, activeRun: () => ({ run: active }) })
  await show('fight')
  await action('#v-fight .deals button')
  assert.equal(document.querySelector('#v-dg-prep').hidden, false)
  await action('#v-dg-prep [data-go="dg-combat"]')
  await action('#confirm-run')
  const call = calls.find(c => c[0] === 'startRun')
  assert.deepEqual(call[1], { dungeonId: 'newbie_hollow', difficulty: 'normal', partyMemberIds: ['character:saber'], loadoutVersion: 4 })
  assert.equal(document.querySelector('#v-dg-combat').hidden, false)
  assert.match(document.querySelector('#v-dg-combat .cb-act').textContent, /attack/)
})

test('combat uses server actions/version; conflicts replace state without auto-resubmitting', async () => {
  const { document, calls, show, action } = await setup({ activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }), combatAction: () => { throw apiError('STATE_VERSION_CONFLICT', { combat: { stateVersion: 8, player: {}, enemy: {}, allowedActions: ['defend'] } }) } })
  await show('dg-combat')
  assert.equal(document.querySelector('.cb-dpad').hidden, true)
  await action('[data-combat-choice="0"]')
  assert.deepEqual(calls.find(c => c[0] === 'combatAction').slice(1), ['dr_1', { type: 'attack', expectedVersion: 3 }])
  assert.equal(calls.filter(c => c[0] === 'combatAction').length, 1)
  assert.equal(document.querySelector('.cb-act').textContent, 'defend')
  assert.match(document.querySelector('#combat-status').textContent, /Review/)
})

test('movement appears only when allowed and sends returned state version', async () => {
  const { document, calls, show, action } = await setup({ activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }), combat: () => ({ combat: { stateVersion: 7, player: {}, enemy: {}, allowedActions: ['attack', 'move', 'dodge'] } }) })
  await show('dg-combat')
  assert.equal(document.querySelector('.cb-dpad').hidden, false)
  assert.equal(document.querySelector('.cb-dpad .up').hidden, true)
  await action('.cb-dpad .right')
  assert.deepEqual(calls.find(c => c[0] === 'combatAction')[2], { type: 'move', direction: 'right', expectedVersion: 7 })
})

test('inventory is stacked, uses returned IDs and server categories, and discard requires confirmation', async () => {
  const { document, calls, show, action } = await setup({ discardItem: () => ({ ok: true }) })
  await show('profile')
  assert.match(document.querySelector('.pf-inv').textContent, /×5/)
  await action('[data-stack="0"]')
  document.querySelector('#item-qty').value = '2'
  await action('#discard-item')
  assert.equal(calls.some(c => c[0] === 'discardItem'), false)
  await action('#confirm-discard')
  assert.deepEqual(calls.find(c => c[0] === 'discardItem').slice(1), ['inventory:health_potion', 2])
  assert.equal(document.querySelectorAll('[data-upgrade]').length, 0)
})

test('equipment uses supported slots and party shows only one front member', async () => {
  const { document, calls, show, action } = await setup({ saveParty: () => ({ ok: true }) })
  await show('profile')
  assert.deepEqual([...document.querySelectorAll('[data-equipment-slot]')].map(el => el.dataset.equipmentSlot), ['weapon', 'offhand', 'helmet', 'chestplate', 'boots', 'tool'])
  await show('fight'); await action('#v-fight .deals button'); await action('#v-dg-prep .sec a')
  assert.match(document.querySelector('#api-panel').textContent, /One active member/)
  document.querySelector('#party-member option[value="character:saber"]').selected = true
  await action('#save-party')
  assert.deepEqual(calls.find(c => c[0] === 'saveParty').slice(1), [['character:saber']])
})

test('private public-player surfaces render privacy empty states rather than generic failures', async () => {
  const { document, features, action } = await setup({ player: () => ({ player: { name: 'Private player', level: 2 } }), playerBattles: () => { throw apiError('BATTLE_HISTORY_PRIVATE') } })
  await features.publicPlayer('public-uid')
  await action('#public-battles')
  assert.match(document.querySelector('#api-panel').textContent, /kept their battle history private/)
})

test('active recovery, event de-duplication, and navigation stop polling', async () => {
  const { document, calls, timers, show } = await setup({ activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }), runEvents: () => ({ events: [{ id: 'dre_1', sequence: 1, text: 'A hit' }, { id: 'dre_1', sequence: 1, text: 'A hit' }], latestSequence: 1, stateVersion: 3 }) })
  await show('dg-combat')
  const poll = [...timers.entries()].find(([, timer]) => timer.delay === 3000)
  assert.ok(poll); timers.delete(poll[0]); await poll[1].fn()
  assert.equal(document.querySelectorAll('#combat-feed p').length, 1)
  assert.ok(calls.some(c => c[0] === 'activeRun'))
  await show('home')
  assert.equal([...timers.values()].some(timer => timer.delay === 3000), false)
})

test('a changed loadout refreshes preparation and never repeats a start automatically', async () => {
  const { document, calls, show, action } = await setup({ startRun: () => { throw apiError('LOADOUT_VERSION_CONFLICT') } })
  await show('fight'); await action('#v-fight .deals button'); await action('#v-dg-prep [data-go="dg-combat"]'); await action('#confirm-run')
  assert.equal(calls.filter(c => c[0] === 'startRun').length, 1)
  assert.match(document.querySelector('#api-panel').textContent, /Review your refreshed equipment/)
})

test('boss lock preserves the active run and does not fake an abandon', async () => {
  const { document, calls, show, action } = await setup({ activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }), abandonRun: () => { throw apiError('BOSS_LOCK') } })
  await show('dg-combat'); await action('#combat-leave'); await action('#confirm-abandon')
  assert.equal(calls.filter(c => c[0] === 'abandonRun').length, 1)
  assert.equal(document.querySelector('#v-dg-combat').hidden, false)
  assert.match(document.querySelector('#api-error').textContent, /cannot abandon/)
})

test('result Continue only acknowledges automatically credited rewards', async () => {
  const { document, calls, show, action } = await setup({
    runHistory: () => ({ runs: [{ id: 'dr_finished', dungeonName: 'Hollow', status: 'completed' }] }),
    dungeonRun: () => ({ run: { id: 'dr_finished', status: 'completed' } }),
    runResult: () => ({ result: { outcome: 'victory', drops: [{ name: 'Potion', qty: 1 }] } }),
    acknowledgeResult: () => ({ ok: true, claimed: false, code: 'REWARDS_AUTO_CREDITED' }),
  })
  await show('profile'); await action('#v-profile .pf-h'); await action('[data-run-detail="0"]')
  assert.match(document.querySelector('#api-panel').textContent, /already been credited automatically/)
  assert.equal(calls.some(c => c[0] === 'acknowledgeResult'), false)
  await action('#acknowledge-result')
  assert.deepEqual(calls.find(c => c[0] === 'acknowledgeResult').slice(1), ['dr_finished'])
})

test('feature-disabled movement remains hidden even if an inconsistent combat response offers it', async () => {
  const { document, show } = await setup({
    appConfig: () => ({ features: { dungeonRuns: true, dungeonMovement: false } }),
    activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }),
    combat: () => ({ combat: { stateVersion: 1, player: {}, enemy: {}, allowedActions: ['attack', 'move', 'dodge'] } }),
  })
  await show('dg-combat')
  assert.equal(document.querySelector('.cb-dpad').hidden, true)
})

test('maintenance Check again performs a fresh startup instead of deadlocking the boot guard', async () => {
  let reads = 0
  const { document, calls, action } = await setup({ appConfig: () => ++reads === 1 ? { maintenance: { active: true, message: 'Restarting' } } : { features: { dungeonRuns: true } } })
  await action('#config-retry')
  assert.equal(calls.filter(c => c[0] === 'appConfig').length, 2)
  assert.equal(document.querySelector('#api-panel').hidden, true)
  assert.equal(document.querySelector('#v-home .name').textContent, 'Ada')
})

test('unavailable featured content does not block subscription status or active-run recovery', async () => {
  const { document, calls, features } = await setup({
    featured: () => { throw new Error('Featured feed offline') },
    subscription: () => ({ active: true, status: 'active', billingPeriod: 'year' }),
    activeRun: () => ({ run: { id: 'dr_existing', status: 'active' } }),
  })
  assert.match(document.querySelector('#v-home .season').textContent, /unavailable/)
  assert.match(document.querySelector('#v-premium .top .bdg').textContent, /Premium active/)
  assert.ok(calls.some(c => c[0] === 'subscription'))
  assert.equal(features.inDungeon(), true)
})

test('a subscription read failure is unknown status rather than a false free-plan claim', async () => {
  const { document, show } = await setup({ subscription: () => { throw new Error('Disconnected') } })
  await show('premium')
  assert.equal(document.querySelector('#v-premium .top .bdg').textContent, 'Status unavailable')
  assert.match(document.querySelector('#subscription-detail').textContent, /could not be loaded/)
})

test('an event response already in flight is discarded after an action starts', async () => {
  let resolveEvents
  const { document, timers, show, action } = await setup({
    activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }),
    runEvents: () => new Promise(resolve => { resolveEvents = resolve }),
  })
  await show('dg-combat')
  const poll = [...timers.entries()].find(([, timer]) => timer.delay === 3000)
  timers.delete(poll[0]); const pending = poll[1].fn()
  await wait()
  await action('[data-combat-choice="0"]')
  resolveEvents({ events: [{ id: 'late-event', text: 'Stale event' }], run: { id: 'dr_1', status: 'completed' }, stateVersion: 1 })
  await pending
  assert.doesNotMatch(document.querySelector('#combat-feed').textContent, /Stale event/)
  assert.match(document.querySelector('#combat-status').textContent, /State 4/)
  assert.equal([...timers.values()].filter(timer => timer.delay === 3000).length, 1)
})

test('a dropped combat response locks fresh attacks and retries the original operation only', async () => {
  let retries = 0
  const failure = Object.assign(new Error('Connection dropped'), { status: 0, retry: async () => { retries++; return { combat: { stateVersion: 4, player: {}, enemy: {}, allowedActions: ['defend'] } } } })
  const { document, calls, show, action } = await setup({ activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }), combatAction: () => { throw failure } })
  await show('dg-combat'); await action('[data-combat-choice="0"]')
  assert.equal(document.querySelector('[data-combat-choice="0"]').disabled, true)
  await action('[data-retry-mutation]')
  assert.equal(retries, 1)
  assert.equal(calls.filter(c => c[0] === 'combatAction').length, 1)
  assert.equal(document.querySelector('.cb-act').textContent, 'defend')
  assert.equal(document.querySelector('[data-combat-choice="0"]').disabled, false)
  assert.equal(document.querySelector('#api-panel').hidden, true)
})

test('the original sale confirmation is disabled while a dropped response awaits exact retry', async () => {
  let retries = 0
  const failure = Object.assign(new Error('Connection dropped'), { status: 0, retry: async () => { retries++; return { ok: true } } })
  const { document, calls, show, action } = await setup({ sellItem: () => { throw failure } })
  await show('profile'); await action('[data-stack="0"]'); await action('#sell-item'); await action('#confirm-sale')
  assert.equal(document.querySelector('#confirm-sale').disabled, true)
  await action('[data-retry-mutation]')
  assert.equal(retries, 1)
  assert.equal(calls.filter(c => c[0] === 'sellItem').length, 1)
})

test('historical results remain acknowledgeable when a profile refresh fails', async () => {
  let reads = 0
  const { document, calls, show, action } = await setup({
    me: () => { if (++reads > 1) throw new Error('Profile temporarily unavailable'); return { player: { name: 'Ada', level: 12, wallet: {}, inventory: [] } } },
    runHistory: () => ({ runs: [{ id: 'dr_old', status: 'completed' }] }),
    dungeonRun: () => ({ run: { id: 'dr_old', status: 'completed' } }),
    runResult: () => ({ result: { outcome: 'victory' } }),
    acknowledgeResult: () => ({ ok: true, code: 'REWARDS_AUTO_CREDITED' }),
  })
  await show('profile'); await action('#v-profile .pf-h'); await action('[data-run-detail="0"]')
  assert.equal(typeof document.querySelector('#acknowledge-result').onclick, 'function')
  await action('#acknowledge-result')
  assert.equal(calls.filter(c => c[0] === 'acknowledgeResult').length, 1)
})

test('acknowledging historical results does not clear a different active dungeon', async () => {
  let deferRecovery = false, resolveRecovery
  const recovering = new Promise(resolve => { resolveRecovery = resolve })
  const active = { id: 'dr_live', status: 'active' }
  const { features, action, show } = await setup({
    activeRun: () => deferRecovery ? recovering : { run: active },
    runHistory: () => ({ runs: [{ id: 'dr_old', status: 'completed' }] }),
    dungeonRun: () => ({ run: { id: 'dr_old', status: 'completed' } }),
    runResult: () => ({ result: { outcome: 'victory' } }),
    acknowledgeResult: () => ({ ok: true }),
  })
  await show('profile'); await action('#v-profile .pf-h'); await action('[data-run-detail="0"]')
  deferRecovery = true
  const pending = action('#acknowledge-result'); await wait()
  assert.equal(features.inDungeon(), true)
  resolveRecovery({ run: active }); await pending
})

test('inventory renders every server category and de-duplicates stacks/cyclic cursor pages', async () => {
  const { document, calls, show, action } = await setup({ inventory: params => ({
    items: [{ id: 'inventory:potion', name: 'Potion', qty: params.cursor ? 4 : 5 }],
    categories: ['weapon', 'armor', 'consumable', 'tool', 'quest'], nextCursor: 'same-cursor', storage: { used: 5, capacity: 80 },
  }) })
  await show('profile')
  assert.equal(document.querySelectorAll('.pf-pills .pill').length, 6)
  await action('#inventory-more')
  assert.equal(document.querySelectorAll('[data-stack]').length, 1)
  assert.match(document.querySelector('.pf-inv').textContent, /×4/)
  assert.equal(document.querySelector('#inventory-more').hidden, true)
  assert.equal(calls.filter(c => c[0] === 'inventory').length, 2)
})

test('server directional restrictions and missing targets cannot produce an invalid action', async () => {
  const { document, calls, show, action } = await setup({
    activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }),
    combat: () => ({ combat: { stateVersion: 3, player: {}, enemy: {}, allowedActions: [{ type: 'move', directions: ['right'] }, { type: 'skill', skillId: 's1', targetRequired: true }] } }),
  })
  await show('dg-combat')
  assert.equal(document.querySelector('.cb-dpad .left').hidden, true)
  assert.equal(document.querySelector('.cb-dpad .right').hidden, false)
  await action('[data-combat-choice="0"]')
  assert.equal(document.querySelector('#confirm-combat').disabled, true)
  assert.equal(calls.some(c => c[0] === 'combatAction'), false)
})

test('dungeon screens render bundled sprites, portraits and a local scene without remote character art', async () => {
  const { document, show } = await setup({
    activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }),
    combat: () => ({ combat: { stateVersion: 3, player: { spriteKey: 'Kunoichi', hp: 8, maxHp: 10, mp: 3, maxMp: 5 }, enemy: { id: 'e1', spriteKey: 'Samurai_Commander', name: 'Commander', hp: 5, maxHp: 5 }, allowedActions: ['attack'] } }),
  })
  await show('dg-list')
  assert.equal(document.querySelector('.fx-di img').getAttribute('src'), 'art/scenes/stone-vault.svg')
  await show('dg-combat')
  assert.equal(document.querySelector('.cb-p .fighter-sprite').dataset.skin, 'Kunoichi')
  assert.equal(document.querySelector('.cb-e1 .fighter-sprite').dataset.skin, 'Samurai_Commander')
  assert.ok(document.querySelector('.cb-av .fighter-sprite'))
  assert.match(document.querySelector('.cb-bg').style.backgroundImage, /stone-vault/)
  assert.match(document.querySelector('.cb-hl .hp span').textContent, /8 \/ 10/)
  assert.match(document.querySelector('.cb-hl .mp span').textContent, /3 \/ 5/)
  assert.equal(document.querySelector('.cb-atk img').getAttribute('src'), 'art/icons/sword_iron.png')
})

test('attack and hurt animations occur only after the authoritative response, alongside returned HP', async () => {
  let resolveAction
  const { document, action, show } = await setup({
    activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }),
    combatAction: () => new Promise(resolve => { resolveAction = resolve }),
  })
  await show('dg-combat')
  const pending = action('[data-combat-choice="0"]'); await wait()
  assert.equal(document.querySelector('.cb-p .fighter-sprite').dataset.motion, 'Idle')
  assert.match(document.querySelector('.cb-hr .hp span').textContent, /20 \/ 20/)
  resolveAction({ combat: { stateVersion: 4, player: { hp: 80, maxHp: 100, mp: 20, maxMp: 30 }, enemy: { id: 'enemy-1', name: 'Slime', hp: 8, maxHp: 20 }, allowedActions: ['attack'] } })
  await pending
  assert.equal(document.querySelector('.cb-p .fighter-sprite').dataset.motion, 'Attack_1')
  assert.equal(document.querySelector('.cb-e1 .fighter-sprite').dataset.motion, 'Hurt')
  assert.match(document.querySelector('.cb-hr .hp span').textContent, /8 \/ 20/)
})

test('individual skill buttons show cooldowns and submit exact skill/target IDs', async () => {
  const { document, calls, action, show } = await setup({
    activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }),
    combat: () => ({ combat: { stateVersion: 9, player: { hp: 20 }, enemies: [{ id: 'enemy:a', name: 'A', hp: 20 }, { id: 'enemy:b', name: 'B', hp: 20 }], skills: [{ id: 'skill:flame', name: 'Flame', targetRequired: true }, { id: 'skill:frost', name: 'Frost', cooldownRemaining: 2 }], allowedActions: ['attack', 'skill'] } }),
  })
  await show('dg-combat')
  assert.equal(document.querySelector('[data-combat-choice="1"] span').textContent, 'Flame')
  assert.equal(document.querySelector('[data-combat-choice="2"]').disabled, true)
  assert.equal(document.querySelector('[data-combat-choice="2"] b').textContent, '2')
  await action('[data-combat-choice="1"]')
  document.querySelectorAll('#combat-target option')[1].selected = true
  await action('#confirm-combat')
  const mutation = calls.find(c => c[0] === 'combatAction')
  assert.deepEqual(mutation, ['combatAction', 'dr_1', { type: 'skill', skillId: 'skill:flame', targetId: 'enemy:b', expectedVersion: 9 }])
})

test('movement updates the sprite from scaled server positions and keyboard uses the same guarded request', async () => {
  const base = { stateVersion: 3, player: { id: 'hero', hp: 20 }, enemy: { id: 'e1', hp: 20 }, positions: { hero: { xPercent: 20, yPercent: 50 } }, allowedActions: [{ type: 'move', directions: ['right'] }] }
  const { window, document, calls, timers, show } = await setup({
    activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }), combat: () => ({ combat: base }),
    combatAction: () => ({ combat: { ...base, stateVersion: 4, positions: { hero: { xPercent: 80, yPercent: 50 } } } }),
  })
  await show('dg-combat')
  assert.equal(document.querySelector('.cb-p').style.left, '30.8%')
  const key = new window.Event('keydown'); key.key = 'ArrowRight'
  window.dispatchEvent(key); await wait(); await wait()
  assert.deepEqual(calls.find(c => c[0] === 'combatAction'), ['combatAction', 'dr_1', { type: 'move', direction: 'right', expectedVersion: 3 }])
  for (const [id, timer] of timers) if (timer.delay === 0) { timers.delete(id); timer.fn() }
  assert.equal(document.querySelector('.cb-p').style.left, '69.2%')
  assert.equal(document.querySelector('.cb-p .fighter-sprite').dataset.motion, 'Run')
  assert.equal(document.querySelector('.cb-dpad .left').hidden, true)
})

test('combat information and log buttons open distinct working sheets, not prototype pause', async () => {
  const { document, action, show } = await setup({ activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }) })
  await show('dg-combat'); await action('#cb-gear')
  assert.match(document.querySelector('.api-sheet').textContent, /Combat information/)
  assert.equal(document.querySelector('#cb-pause').hidden, true)
  await action('.api-close'); await action('.cb-side button[aria-label="Combat log"]')
  assert.match(document.querySelector('.api-sheet').textContent, /Combat activity/)
})

test('consumables use the exact inventory ID and update HUD only from returned combat', async () => {
  const { document, calls, action, show } = await setup({
    activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }),
    combat: () => ({ combat: { stateVersion: 5, player: { hp: 30, maxHp: 100 }, enemy: { id: 'e1', hp: 20 }, consumables: [{ itemInstanceId: 'inventory:potion-stack', name: 'Health potion' }], allowedActions: ['consumable'] } }),
    combatAction: () => ({ combat: { stateVersion: 6, player: { hp: 47, maxHp: 100 }, enemy: { id: 'e1', hp: 20 }, allowedActions: ['defend'] } }),
  })
  await show('dg-combat'); await action('[data-combat-choice="0"]'); await action('#confirm-combat')
  assert.deepEqual(calls.find(c => c[0] === 'combatAction'), ['combatAction', 'dr_1', { type: 'consumable', itemInstanceId: 'inventory:potion-stack', expectedVersion: 5 }])
  assert.match(document.querySelector('.cb-hl .hp span').textContent, /47 \/ 100/)
  assert.equal(calls.some(c => c[0] === 'useItem'), false)
})

test('defend and escape buttons send real versioned actions; escape shows server results', async () => {
  for (const type of ['defend', 'escape']) {
    const { document, calls, action, show } = await setup({
      activeRun: () => ({ run: { id: 'dr_1', status: 'active' } }),
      combat: () => ({ combat: { stateVersion: 7, player: { hp: 40 }, enemy: { id: 'e1', hp: 20 }, allowedActions: [type] } }),
      combatAction: () => ({ run: { id: 'dr_1', status: type === 'escape' ? 'escaped' : 'active' }, combat: { stateVersion: 8, player: { hp: 35 }, enemy: { id: 'e1', hp: 20 }, allowedActions: [] } }),
      runResult: () => ({ result: { outcome: 'escaped', summary: 'Escape confirmed by server.' } }),
    })
    await show('dg-combat'); await action('[data-combat-choice="0"]')
    assert.deepEqual(calls.find(c => c[0] === 'combatAction'), ['combatAction', 'dr_1', { type, expectedVersion: 7 }])
    if (type === 'defend') assert.equal(document.querySelector('.cb-p .fighter-sprite').dataset.motion, 'Protection')
    else assert.ok(document.querySelector('#acknowledge-result'))
  }
})
