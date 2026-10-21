// Astral Gaming App API contract. Private requests identify the player only
// through the shared bearer session; IDs below are resource IDs from responses.
export function createAppApi(base, request) {
  const id = value => encodeURIComponent(value)
  const query = params => new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()
  const get = path => request(path)
  const write = (method, path, body, idempotencyKey) => request(path, { method, body, idempotencyKey })
  return {
    ...base,
    appConfig: () => get('/app/config'),
    featured: () => get('/app/featured'),
    shopOffers: () => get('/shop/offers'),
    appPlans: () => get('/app/premium/plans'),
    subscription: () => get('/me/subscription'),
    // Billing verify/restore are deliberately not exposed as active UI actions
    // until a native billing adapter can supply genuine provider proof.
    inventory: (params = {}) => get(`/me/inventory?${query(params)}`),
    inventoryItem: instanceId => get(`/me/inventory/${id(instanceId)}`),
    useItem: (itemInstanceId, key) => write('POST', '/me/inventory/use', { itemInstanceId }, key),
    sellItem: (itemInstanceId, qty, key) => write('POST', '/me/inventory/sell', { itemInstanceId, qty }, key),
    discardItem: (itemInstanceId, qty, key) => write('POST', '/me/inventory/discard', { itemInstanceId, qty, confirm: true }, key),
    equipment: () => get('/me/equipment'),
    equip: (itemInstanceId, slot, key) => write('POST', '/me/equipment/equip', { itemInstanceId, slot }, key),
    unequip: (slot, key) => write('POST', '/me/equipment/unequip', { slot }, key),
    ownedCharacters: () => get('/me/characters'),
    party: () => get('/me/party'),
    saveParty: (memberIds, key) => write('PUT', '/me/party', { memberIds, formation: ['front'] }, key),
    playerBattles: uid => get(`/players/${id(uid)}/battles`),
    playerLoadout: uid => get(`/players/${id(uid)}/loadout`),
    dungeons: (params = {}) => get(`/dungeons?${query({ difficulty: 'normal', ...params })}`),
    dungeon: dungeonId => get(`/dungeons/${id(dungeonId)}`),
    preparation: dungeonId => get(`/dungeons/${id(dungeonId)}/preparation`),
    dungeonProgress: () => get('/me/dungeon-progress'),
    dungeonGoals: () => get('/me/dungeon-goals'),
    claimGoal: (goalId, key) => write('POST', `/me/dungeon-goals/${id(goalId)}/claim`, null, key),
    startRun: (body, key) => write('POST', '/dungeon-runs', body, key),
    activeRun: () => get('/me/dungeon-runs/active'),
    runHistory: (params = {}) => get(`/me/dungeon-runs?${query(params)}`),
    dungeonRun: runId => get(`/dungeon-runs/${id(runId)}`),
    combat: runId => get(`/dungeon-runs/${id(runId)}/combat`),
    combatAction: (runId, body, key) => write('POST', `/dungeon-runs/${id(runId)}/actions`, body, key),
    runEvents: (runId, after = 0) => get(`/dungeon-runs/${id(runId)}/events?${query({ after })}`),
    abandonRun: (runId, key) => write('POST', `/dungeon-runs/${id(runId)}/abandon`, null, key),
    runResult: runId => get(`/dungeon-runs/${id(runId)}/result`),
    acknowledgeResult: (runId, key) => write('POST', `/dungeon-runs/${id(runId)}/claim`, null, key),
  }
}
