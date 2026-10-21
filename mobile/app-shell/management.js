import { dungeonSprite } from './dungeon-art.js'

export function createManagement(ui) {
  const { api, $, $$, text, esc, num, image, panel, closePanel, message, run, bind, requireAccount, refreshPlayer, getPlayer, commit } = ui
  let items = [], cursor = null, category = '', categories = [], gear = null, busy = false, generation = 0
  const seenCursors = new Set()
  const slots = ['weapon', 'offhand', 'helmet', 'chestplate', 'boots', 'tool']
  const stackId = i => i.instanceId || i.id // Never derive an inventory ID from an item type.
  const button = (label, id, cls = 'gbtn') => `<button class="${cls}" id="${id}">${esc(label)}</button>`
  function equipmentLocked() { return ui.activeRun?.() || getPlayer()?.inBattle === true || getPlayer()?.inDungeon === true }
  function renderInventory() {
    $('.pf-inv').innerHTML = items.map((i, idx) => `<button class="sq sm" data-stack="${idx}" title="${esc(i.name)}">${image(i.image || i.imageUrl)}<span>${esc(i.name)} ×${num(i.qty ?? i.quantity)}</span></button>`).join('') || '<p class="sub">No items in this category.</p>'
    $$('[data-stack]').forEach(el => { el.onclick = () => run('item', () => detail(stackId(items[Number(el.dataset.stack)]))) })
    let more = $('#inventory-more')
    if (!more) { more = document.createElement('button'); more.id = 'inventory-more'; more.className = 'gbtn'; $('.pf-inv').after(more) }
    more.hidden = !cursor; more.textContent = 'Load more items'; more.onclick = () => run('inventory', () => inventory(true))
    const available = [{ id: '', label: 'All' }, ...categories.map(c => typeof c === 'string' ? { id: c, label: c } : { id: c.id || c.key, label: c.label || c.name || c.id || c.key }).filter(c => c.id)]
    $('.pf-pills').innerHTML = available.map(c => `<button class="pill ${c.id === category ? 'on' : ''}" data-category="${esc(c.id)}" aria-pressed="${c.id === category}">${esc(c.label)}</button>`).join('')
    bind('.pf-pills .pill', el => requireAccount(() => { category = el.dataset.category; generation++; return inventory() }))
  }
  async function inventory(append = false) {
    if (!getPlayer()) return
    const revision = generation, requestedCursor = append ? cursor : undefined
    if (append && (!requestedCursor || seenCursors.has(requestedCursor))) return
    if (!append) { seenCursors.clear(); cursor = null; items = []; renderInventory() }
    const out = await api.inventory({ category, cursor: requestedCursor, limit: 24 })
    if (revision !== generation) return
    if (requestedCursor) seenCursors.add(requestedCursor)
    const incoming = out.items || []
    items = [...new Map((append ? [...items, ...incoming] : incoming).filter(i => stackId(i)).map(i => [stackId(i), i])).values()]
    cursor = out.nextCursor && !seenCursors.has(out.nextCursor) ? out.nextCursor : null
    categories = out.categories || categories
    renderInventory()
    const heading = $$('#v-profile .sec').find(el => el.querySelector('h2')?.textContent === 'Inventory')
    if (heading?.querySelector('.bdg')) heading.querySelector('.bdg').textContent = `${num(out.storage?.used ?? out.total)} / ${num(out.storage?.capacity)}`
  }
  async function refresh() { await refreshPlayer(); await inventory(); await equipment() }
  function guarded(key, fn) { return run(key, async () => { if (busy) return; busy = true; try { await fn() } finally { busy = false } }) }
  async function detail(id) {
    if (!id) return message('Item unavailable', 'The server did not return an inventory stack ID.')
    const revision = generation
    const out = await api.inventoryItem(id); if (revision !== generation) return
    const i = out.item || out
    const quantity = i.qty ?? i.quantity ?? 0
    const salePrice = i.sellPrice ?? i.salePrice
    panel(i.name || 'Item', `${image(i.image || i.imageUrl)}<p>${esc(i.description)}</p><p>Quantity: ${num(quantity)}</p><p>${esc(i.rarity || '')}</p><label>Quantity<input id="item-qty" type="number" value="1" min="1" max="${esc(quantity)}" step="1"></label><p id="sale-total"></p>${button('Use outside combat', 'use-item')}${button('Sell', 'sell-item')}${button('Discard', 'discard-item', 'pf-out')}${button('Equipment', 'item-equipment')}`)
    const qty = () => { const v = Number($('#item-qty')?.value); if (!Number.isInteger(v) || v < 1 || v > quantity) throw new Error('Choose a valid quantity from your stack.'); return v }
    const preview = () => { const v = Number($('#item-qty').value); text('#sale-total', Number.isFinite(salePrice) ? `Sale value: ${num(salePrice * v)} solars` : 'Sale value is not provided by the server.'); $('#sell-item').disabled = !Number.isFinite(salePrice) }
    $('#item-qty').oninput = preview; preview()
    $('#use-item').disabled = equipmentLocked()
    $('#use-item').onclick = () => guarded('use', () => commit(() => api.useItem(id), async () => { closePanel(); await refresh() }))
    $('#item-equipment').onclick = () => run('equipment', () => equipment(true))
    $('#sell-item').onclick = () => run('sell-review', () => {
      const n = qty()
      panel('Confirm sale', `<p>Sell ${n} × ${esc(i.name)} for ${num(salePrice * n)} solars?</p>${button('Confirm sale', 'confirm-sale', 'pm-cta')}`)
      $('#confirm-sale').onclick = () => guarded('sell', () => commit(() => api.sellItem(id, n), async () => { closePanel(); await refresh() }))
    })
    $('#discard-item').onclick = () => run('discard-review', () => {
      const n = qty()
      panel('Discard permanently?', `<p>Discard ${n} × ${esc(i.name)}? This cannot be undone.</p>${button('Discard permanently', 'confirm-discard', 'pf-out')}`)
      $('#confirm-discard').onclick = () => guarded('discard', () => commit(() => api.discardItem(id, n), async () => { closePanel(); await refresh() }))
    })
  }
  function slotItems() {
    if (Array.isArray(gear?.slots)) return Object.fromEntries(gear.slots.map(s => [s.slot || s.id, s.item || s.equipped || null]))
    return gear?.slots || {}
  }
  async function equipment(show = false) {
    if (!getPlayer()) return
    const revision = generation
    const out = await api.equipment(); if (revision !== generation) return; gear = out.equipment || out
    const equipped = slotItems()
    $('.pf-armor').innerHTML = slots.map(slot => `<div class="pf-slot"><button class="sq" data-equipment-slot="${slot}">${image(equipped[slot]?.image || equipped[slot]?.imageUrl)}<span>${esc(equipped[slot]?.name || 'Empty')}</span></button><span>${esc(slot)}</span></div>`).join('')
    $$('[data-equipment-slot]').forEach(el => { el.onclick = () => run('gear-slot', () => equipmentDetail(el.dataset.equipmentSlot)) })
    if (show) {
      panel('Equipment', `<p>Loadout version: ${esc(gear.loadoutVersion)}</p><div class="api-grid">${slots.map(slot => `<button class="gbtn" data-pick-slot="${slot}">${esc(slot)}: ${esc(equipped[slot]?.name || 'Empty')}</button>`).join('')}</div><p>${Object.entries(gear.derivedStats || {}).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ')}</p>`)
      $$('[data-pick-slot]').forEach(el => { el.onclick = () => run('gear-slot', () => equipmentDetail(el.dataset.pickSlot)) })
    }
  }
  async function equipmentDetail(slot) {
    const item = slotItems()[slot]
    panel(slot, `<p>${esc(item?.name || 'Empty slot')}</p>${item?.durability != null ? `<p>Durability: ${esc(typeof item.durability === 'object' ? `${item.durability.current} / ${item.durability.max}` : item.durability)}</p>` : ''}<p>${equipmentLocked() ? 'Equipment is locked during a dungeon or battle.' : 'Select an owned item for this slot.'}</p>${button('Choose item', 'choose-gear')}${button('Unequip', 'unequip-gear')}`)
    $('#choose-gear').disabled = equipmentLocked(); $('#unequip-gear').disabled = !item || equipmentLocked()
    $('#unequip-gear').onclick = () => guarded('unequip', () => commit(() => api.unequip(slot), async () => { closePanel(); await refresh() }))
    $('#choose-gear').onclick = () => run('choose-gear', async () => {
      const revision = generation, owned = new Map(), pages = new Set()
      let nextCursor = null
      async function loadPage(cursor) {
        if (cursor && pages.has(cursor)) return
        const out = await api.inventory({ cursor, limit: 100 })
        if (revision !== generation || !getPlayer()) return
        if (cursor) pages.add(cursor)
        for (const i of out.items || []) if (stackId(i) && (i.slot === slot || i.equipmentSlot === slot)) owned.set(stackId(i), i)
        nextCursor = out.nextCursor && !pages.has(out.nextCursor) ? out.nextCursor : null
        const candidates = [...owned.values()]
        panel(`Equip ${slot}`, `${candidates.map((i, idx) => `<button class="gbtn" data-equip-item="${idx}">${esc(i.name)} ×${num(i.qty ?? i.quantity)}</button>`).join('') || '<p>No compatible items on the loaded pages.</p>'}${nextCursor ? '<button class="gbtn" id="gear-next">Load more items</button>' : ''}`)
        $$('[data-equip-item]').forEach(el => {
          el.disabled = equipmentLocked()
          el.onclick = () => guarded('equip', () => {
            if (equipmentLocked()) throw new Error('Equipment is locked during a dungeon or battle.')
            return commit(() => api.equip(stackId(candidates[Number(el.dataset.equipItem)]), slot), async () => { closePanel(); await refresh() })
          })
        })
        if ($('#gear-next')) $('#gear-next').onclick = () => run('gear-more', () => loadPage(nextCursor))
      }
      await loadPage()
    })
  }

  async function party() {
    const revision = generation
    const [p, roster] = await Promise.all([api.party(), api.ownedCharacters()])
    if (revision !== generation) return
    const current = p.party || p, characters = roster.characters || roster.items || []
    const owned = characters.filter(c => c.owned !== false && !c.slain)
    const member = characters.find(c => (c.id || c.memberId) === current.memberIds?.[0])
    panel('Your party', `<p>One active member · Front formation. Multi-member combat is not supported.</p><div class="fx-r4"><div class="sq sm" title="${esc(member?.name || current.memberIds?.[0] || 'Empty')}">${member ? `<div class="fighter-portrait">${dungeonSprite(member)}</div>` : esc(current.memberIds?.[0] || 'Empty')}</div></div><label>Active character<select id="party-member"><option value="">Select a character</option>${owned.map(c => `<option value="${esc(c.id || c.memberId)}" ${(c.id || c.memberId) === current.memberIds?.[0] ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>${button('Save party', 'save-party', 'pm-cta')}<p>Dungeon combat uses your equipped character. If needed, equip it in the bot first.</p>`)
    $('#save-party').disabled = equipmentLocked()
    $('#save-party').onclick = () => guarded('party', () => {
      const id = $('#party-member').value
      if (!id) throw new Error('Select an owned character.')
      return commit(() => api.saveParty([id]), async () => { closePanel(); await refreshPlayer() })
    })
  }
  async function characterDetail(id) {
    const out = await api.character(id), c = out.character || out
    panel(c.name || 'Character', `<div class="character-art-preview">${dungeonSprite(c)}</div><p>${esc(c.description || '')}</p>${c.ability?.name ? `<h3>${esc(c.ability.name)}</h3><p>${esc(c.ability.description || '')}</p>` : ''}${Object.entries(c.stats || {}).filter(([, value]) => typeof value === 'number' || typeof value === 'string').map(([key, value]) => `<p>${esc(key)}: ${esc(value)}</p>`).join('')}`)
  }
  async function publicPlayer(uid) {
    const out = await api.player(uid), p = out.player
    panel(p.name, `${image(p.avatarUrl)}<p>Level ${num(p.level)} · ${esc(p.rank?.title)}</p><p>${esc(p.bio)}</p>${button('Battle history', 'public-battles')}${button('Loadout', 'public-loadout')}`)
    $('#public-battles').onclick = () => run('public-history', async () => {
      try { const data = await api.playerBattles(uid); panel('Battle history', (data.runs || data.battles || []).map(r => `<p>${esc(r.dungeonName || r.dungeonId)} · ${esc(r.status || r.outcome)}</p>`).join('') || '<p>No public battles.</p>') }
      catch (e) { if (e.code === 'BATTLE_HISTORY_PRIVATE') message('Private battle history', 'This player has kept their battle history private.'); else throw e }
    })
    $('#public-loadout').onclick = () => run('public-loadout', async () => {
      try { const data = await api.playerLoadout(uid); const loadout = data.loadout || data; panel('Public loadout', `<p>${Object.entries(loadout.equipment?.slots || loadout.slots || {}).map(([slot, item]) => `${esc(slot)}: ${esc(item?.name || 'Empty')}`).join('<br>')}</p><p>Party: ${esc(loadout.party?.memberIds?.join(', ') || 'Not set')}</p>`) }
      catch (e) { if (e.code === 'LOADOUT_PRIVATE') message('Private loadout', 'This player has kept their loadout private.'); else throw e }
    })
  }
  bind('.pf-pills .pill', el => requireAccount(() => { category = el.dataset.category || ''; generation++; return inventory() }))
  $$('#v-profile .sec a').forEach(el => {
    if (el.parentElement.querySelector('h2')?.textContent === 'Armor') { el.dataset.apiAction = '1'; el._apiAction = () => requireAccount(() => equipment(true)) }
  })
  const privacyRow = $$('#v-settings .pf-row').find(el => el.querySelector('.pf-rn')?.textContent === 'Privacy')
  if (privacyRow) privacyRow._apiAction = () => requireAccount(() => {
    const settings = getPlayer()?.settings || {}
    const keys = ['publicBattleHistory', 'publicLoadout', 'hiddenFromLeaderboard', 'dmNotifications']
    panel('Privacy & notifications', keys.map(key => `<label><input type="checkbox" data-preference="${key}" ${(key === 'dmNotifications' ? settings[key] !== false : settings[key]) ? 'checked' : ''}>${esc({ publicBattleHistory: 'Public battle history', publicLoadout: 'Public loadout', hiddenFromLeaderboard: 'Hide from leaderboards', dmNotifications: 'WhatsApp notifications' }[key])}</label>`).join('') + button('Save settings', 'save-privacy', 'pm-cta'))
    $('#save-privacy').onclick = () => guarded('privacy', () => commit(() => api.updateSettings(Object.fromEntries($$('[data-preference]').map(el => [el.dataset.preference, el.checked]))), async () => { closePanel(); await refreshPlayer() }))
  })
  return {
    inventory, equipment, party, characterDetail, publicPlayer,
    reset() { generation++; items = []; gear = null; cursor = null; seenCursors.clear(); category = ''; categories = []; renderInventory(); $('.pf-armor').replaceChildren() },
  }
}
