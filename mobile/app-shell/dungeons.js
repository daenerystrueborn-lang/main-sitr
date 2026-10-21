import { dungeonSprite, animateDungeonSprite, dungeonActionIcon, dungeonPosition } from './dungeon-art.js'

export function createDungeons(ui) {
  const { api, $, $$, text, esc, num, image, panel, closePanel, message, run, bind, nav, getPlayer, requireAccount, refreshPlayer, commit, flags, management } = ui
  let catalog = [], nextCursor = null, selectedId = null, prep = null, active = null, combat = null
  let currentView = 'home', timer = null, generation = 0, busy = false, lockedUntil = 0, sequence = 0
  let pollEpoch = 0, recoveryVersion = 0, uncertainVersion = null
  const events = new Map()
  const catalogCursors = new Set()
  const templates = { dungeon: $('#v-dg-list .fx-dg').cloneNode(true), tile: $('#v-fight .deal').cloneNode(true) }
  const runId = () => active?.id || active?.runId
  const sameRun = id => id && runId() === id
  const safeText = (root, q, value) => { const el = root.querySelector(q); if (el) { el.classList.remove('sk'); el.textContent = value ?? '—' } }
  const currentCombat = out => out?.combat || (out?.allowedActions ? out : null)
  function installCombat(out) {
    const c = currentCombat(out)
    if (!c) return
    // Ignore an old poll arriving after a newer action response.
    if (combat && Number.isFinite(Number(c.stateVersion)) && Number(c.stateVersion) < Number(combat.stateVersion)) return
    const previous = combat
    combat = c
    if (uncertainVersion != null && Number(c.stateVersion) > Number(uncertainVersion)) uncertainVersion = null
    drawCombat()
    const hp = actor => actor?.hp?.current ?? actor?.hp
    const actors = [{ now: c.player, before: previous?.player, selector: '.cb-p' }, ...(c.enemies || (c.enemy ? [c.enemy] : [])).map((enemy, i) => ({ now: enemy, before: previous?.enemies?.find(e => e.id === enemy.id) || (i === 0 ? previous?.enemy : null), selector: `[data-enemy-index="${i}"]` }))]
    for (const actor of actors) {
      if (hp(actor.now) != null && Number(hp(actor.now)) <= 0) animateDungeonSprite($('#v-dg-combat ' + actor.selector), 'Dead')
      else if (hp(actor.now) != null && hp(actor.before) != null && Number(hp(actor.now)) < Number(hp(actor.before))) animateDungeonSprite($('#v-dg-combat ' + actor.selector), 'Hurt')
    }
  }
  function status(message) { text('#combat-status', message) }
  function addEvents(list = []) {
    for (const event of list) {
      const key = event.id ?? event.sequence
      if (event.sequence != null && Number.isFinite(Number(event.sequence))) sequence = Math.max(sequence, Number(event.sequence))
      if (key == null || events.has(key)) continue
      events.set(key, event)
    }
    const host = $('#combat-feed')
    host.innerHTML = [...events.values()].slice(-100).map(e => `<p>${esc(e.text || e.message || e.log || '')}</p>`).join('')
  }
  function configure() {
    // Preserve the original sections, removing only controls the engine forbids.
    $$('#v-dg-list .fx-pills .pill').forEach(el => { el.hidden = el.textContent.trim() !== 'Normal'; el.classList.toggle('on', !el.hidden) })
    $$('#v-dg-prep .fx-r4:last-of-type .sq').slice(1).forEach(el => { el.hidden = true })
    $$('#v-fight .fx-pty > div').slice(1).forEach(el => { el.hidden = true })
    $$('#v-dg-prep > .fx-wide, #cb-auto, #cb-resume, #cb-pause').forEach(el => { el.hidden = true })
    $('#cb-gear').setAttribute('aria-label', 'Combat information')
    // The supplied settings gear opens combat information, never a local pause.
    bind('#cb-gear', showCombatInfo)
    bind('.cb-side button[aria-label="Combat log"]', showLog)
    $$('#v-fight [data-go="dg-prep"], #v-dg-list [data-go="dg-prep"]').forEach(el => { el.disabled = true })
  }
  function stopPolling() { pollEpoch++; if (timer != null) clearTimeout(timer); timer = null }
  function startPolling() {
    stopPolling()
    if (currentView !== 'dg-combat' || !isActive(active) || document.hidden || !getPlayer()) return
    const ticket = pollEpoch
    timer = setTimeout(async () => {
      if (ticket !== pollEpoch) return
      timer = null
      if (busy) return startPolling()
      const id = runId(), revision = generation
      try {
        const out = await api.runEvents(id, sequence)
        if (ticket !== pollEpoch || revision !== generation || !sameRun(id) || currentView !== 'dg-combat' || document.hidden) return
        addEvents(out.events); sequence = Math.max(sequence, Number(out.latestSequence) || 0)
        const stale = Number(out.stateVersion ?? out.combat?.stateVersion) < Number(combat?.stateVersion)
        if (!stale) {
          if (out.run) active = out.run
          if (out.combat) installCombat(out)
          else if (out.state?.allowedActions) installCombat(out.state)
        }
        if (active && !isActive(active)) { await results(id); return }
        if (!out.combat && Number(out.stateVersion) > Number(combat?.stateVersion ?? -1)) await loadCombat(id)
      } catch (e) { if (ticket === pollEpoch && revision === generation) status(e.message) }
      if (ticket === pollEpoch) startPolling()
    }, 3000)
  }
  const isActive = r => r && !['completed', 'victory', 'defeat', 'abandoned', 'escaped', 'failed', 'finished'].includes(r.status)
  async function loadCombat(id) {
    const revision = generation
    try { const out = await api.combat(id); if (revision === generation && sameRun(id) && currentView === 'dg-combat' && !document.hidden) installCombat(out) }
    catch (e) {
      if (e.code !== 'NOT_IN_BATTLE') throw e
      const out = await api.dungeonRun(id)
      if (revision !== generation || !sameRun(id)) return
      if (out.run) active = out.run
      combat = null; $('#v-dg-combat .cb-act').replaceChildren(); $('#v-dg-combat .cb-dpad').hidden = true
      status(out.run?.message || 'No active battle. The run state has been refreshed.')
      if (active && !isActive(active)) await results(id)
    }
  }
  async function recover() {
    if (!getPlayer() || flags().dungeonRuns !== true) return
    const revision = generation, requestVersion = ++recoveryVersion
    const out = await api.activeRun()
    if (revision !== generation || requestVersion !== recoveryVersion) return
    const previousId = runId(); active = out.run || null
    if (previousId !== runId()) { combat = null; uncertainVersion = null; sequence = 0; events.clear(); clearBattleView(); $('#v-dg-combat .cb-act').replaceChildren(); $('#v-dg-combat .cb-dpad').hidden = true }
    drawRun()
    if (currentView === 'dg-combat' && active) { await loadCombat(runId()); startPolling() }
    if (currentView === 'dg-combat' && !active && previousId) { stopPolling(); await results(previousId) }
  }
  function drawRun() {
    const box = $('#v-fight .fx-run')
    const hasRun = isActive(active)
    safeText(box, '.fx-two button:first-child', hasRun ? 'Continue' : 'No active run')
    const buttons = box.querySelectorAll('button'); buttons.forEach(b => { b.disabled = !hasRun })
    const heading = box.previousElementSibling?.querySelector('.bdg')
    if (heading) heading.textContent = hasRun ? `Floor ${num(active.floor ?? active.currentFloor)}` : 'No active run'
    if (hasRun) {
      bind('#v-fight .fx-run [data-go="dg-combat"]', () => enterCombat())
      const abandon = buttons[1]; if (abandon) { abandon.dataset.apiAction = '1'; abandon._apiAction = confirmAbandon }
    }
  }
  async function loadCatalog(append = false) {
    if (flags().dungeonRuns !== true) return
    const revision = generation, cursor = append ? nextCursor : undefined
    if (append && (!cursor || catalogCursors.has(cursor))) return
    if (!append) catalogCursors.clear()
    const out = await api.dungeons({ difficulty: 'normal', cursor, limit: 24 })
    if (revision !== generation) return
    if (cursor) catalogCursors.add(cursor)
    const incoming = out.dungeons || out.items || []
    catalog = [...new Map((append ? [...catalog, ...incoming] : incoming).filter(d => d.id).map(d => [d.id, d])).values()]
    nextCursor = out.nextCursor && !catalogCursors.has(out.nextCursor) ? out.nextCursor : null
    let progress = []
    if (getPlayer()) { const p = await api.dungeonProgress(); progress = p.dungeons || p.progress || [] }
    if (revision !== generation) return
    const progressFor = id => Array.isArray(progress) ? progress.find(p => (p.dungeonId || p.id) === id) : progress[id]
    $('#v-dg-list .fx-dgs').replaceChildren(); $('#v-fight .deals').replaceChildren()
    for (const [index, d] of catalog.entries()) {
      if (!d.id) continue
      const p = progressFor(d.id)
      const card = templates.dungeon.cloneNode(true)
      safeText(card, '.fx-dt .sk:first-child', d.name)
      safeText(card, '.fx-dt .sk', d.description || d.region)
      const badges = card.querySelectorAll('.fx-bd .bdg')
      if (badges[0]) badges[0].textContent = `Floors ${num(d.floors?.length ?? d.floors)}`
      if (badges[1]) badges[1].textContent = `Level ${num(d.entryLevel ?? d.levelRequirement)}`
      card.querySelector('.fx-di').innerHTML = dungeonScene(d.imageUrl || d.image)
      rewardPreview(card.querySelector('.fx-rw'), d.rewards || d.rewardPreview)
      const b = card.querySelector('[data-go="dg-prep"]')
      b.removeAttribute('data-go'); b.dataset.apiAction = '1'; b._apiAction = () => select(d.id)
      b.textContent = p?.unlocked === false ? 'Locked · Details' : p?.conquered ? 'Conquered · View' : p?.highestFloor ? `Floor ${p.highestFloor} · View` : 'View'
      $('#v-dg-list .fx-dgs').append(card)
      if (index < 3) {
        const tile = templates.tile.cloneNode(true)
        safeText(tile, '.sk:first-of-type', d.name); safeText(tile, '.sk', d.description || d.region)
        safeText(tile, '.off', `Lv ${num(d.entryLevel ?? d.levelRequirement)}`)
        const button = tile.querySelector('button'); button.disabled = false; button.removeAttribute('data-go'); button.dataset.apiAction = '1'; button._apiAction = () => select(d.id)
        tile.querySelector('.dimg').insertAdjacentHTML('afterbegin', dungeonScene(d.imageUrl || d.image))
        $('#v-fight .deals').append(tile)
      }
    }
    if (!catalog.length) $('#v-dg-list .fx-dgs').innerHTML = '<p class="sub">No dungeons are available.</p>'
    $('#dungeon-more').hidden = !nextCursor
    if (!selectedId && catalog[0]?.id) selectedId = catalog[0].id
    const featured = catalog.find(d => d.id === selectedId) || catalog[0]
    if (featured) {
      text('#v-fight .fx-feat .dungeon-title', featured.name)
      setScene($('#v-fight .fx-feat'), featured.backgroundUrl || featured.imageUrl || featured.image)
      const button = $('#v-fight .fx-feat [data-go="dg-prep"]'); button.disabled = false
      bind('#v-fight .fx-feat [data-go="dg-prep"]', () => select(featured.id))
    }
  }
  async function select(id) {
    if (flags().dungeonRuns !== true || !id) return
    selectedId = id; prep = null
    nav('dg-prep') // view() fetches fresh server eligibility before enabling Start.
  }
  async function prepare() {
    prep = null; const start = $('#v-dg-prep [data-go="dg-combat"]'); start.disabled = true
    text('#dungeon-eligibility', 'Checking dungeon eligibility…')
    if (!selectedId) { text('#dungeon-eligibility', 'Choose a dungeon first.'); return }
    const revision = generation, id = selectedId
    const detail = await api.dungeon(id)
    const d = detail.dungeon || detail
    if (revision !== generation || id !== selectedId) return
    text('#v-dg-prep .brand', d.name || 'Dungeon')
    const hero = $('#v-dg-prep > .feat'); setScene(hero, d.backgroundUrl || d.imageUrl || d.image); safeText(hero, '.sk:first-child, .dungeon-name', d.name)
    safeText(hero, '.sk, .dungeon-description', d.description)
    safeText(hero, '.bdg', 'Normal')
    rewardPreview($('#v-dg-prep .fx-r4'), d.rewards || d.rewardPreview)
    $$('#v-dg-prep .fx-st3 b').forEach((el, index) => { el.textContent = num([d.floors?.length ?? d.floors, d.entryLevel, null][index]) })
    text('#reward-note', 'Dungeon rewards are credited automatically by the combat engine.')
    const out = await api.preparation(id)
    if (revision !== generation || id !== selectedId) return
    prep = out.preparation || out
    const eligible = prep.eligibility || {}
    start.disabled = eligible.allowed !== true || prep.loadoutVersion == null
    text('#dungeon-eligibility', eligible.allowed ? `Ready · Energy cost ${num(eligible.energyCost ?? prep.energyCost)} · Energy ${num(eligible.energy?.current ?? prep.energy?.current)}` : eligible.reason || 'You cannot enter this dungeon yet.')
    if (eligible.retryAfterMs) ui.countdown($('#dungeon-eligibility'), eligible.retryAfterMs, eligible.reason || 'Entry is unavailable', () => run('prepare', prepare))
    $$('#v-dg-prep .fx-st3 .pf-st span')[1].textContent = 'Entry level'
    $$('#v-dg-prep .fx-st3 b')[2].textContent = num(eligible.energyCost ?? prep.energyCost)
    const partySlot = $('#v-dg-prep .fx-r4:last-of-type .sq')
    if (partySlot) {
      const member = prep.party?.members?.[0] || { id: prep.party?.memberIds?.[0] }
      partySlot.innerHTML = (member.id || prep.party?.memberIds?.[0]) ? `<div class="fighter-portrait">${dungeonSprite(member)}</div>` : 'No active character'
      partySlot.title = member.name || member.id || prep.party?.memberIds?.[0] || 'No active character'
    }
  }
  async function start() {
    if (busy || !prep?.eligibility?.allowed || prep.loadoutVersion == null || !selectedId) return
    // Fetch immediately before the final confirmation. Never reuse a stale loadout.
    await prepare()
    if (!prep?.eligibility?.allowed) return
    const snapshot = prep, id = selectedId
    panel('Enter dungeon?', `<p>Entry costs and equipment are validated by the server. Rewards are automatic.</p><p>Loadout version ${esc(snapshot.loadoutVersion)}</p><button class="pm-cta" id="confirm-run">Enter dungeon</button>`)
    $('#confirm-run').onclick = () => run('start-run', async () => {
      if (busy) return
      busy = true; $('#confirm-run').disabled = true
      try {
        const body = { dungeonId: id, difficulty: 'normal', partyMemberIds: snapshot.party?.memberIds || [], loadoutVersion: snapshot.loadoutVersion }
        if (body.partyMemberIds.length > 1) throw new Error('Only one active party member is supported.')
        await commit(() => api.startRun(body), async out => {
          if (!out.run || !(out.run.id || out.run.runId)) throw new Error('The server did not return a dungeon run ID. Refresh active runs before trying again.')
          recoveryVersion++; active = out.run; combat = null; uncertainVersion = null; sequence = 0; events.clear(); addEvents(out.events || [])
          closePanel(); drawRun(); nav('dg-combat'); await refreshPlayer()
        })
      } catch (e) {
        if (e.code === 'LOADOUT_VERSION_CONFLICT') { closePanel(); await prepare(); message('Loadout changed', 'Review your refreshed equipment and entry requirements before starting again.'); return }
        if (e.code === 'PARTY_LOADOUT_MISMATCH') { message('Equip your selected character', 'Use .character equip <characterId> in the bot with your character ID, then refresh preparation.'); return }
        if (e.code === 'ACTIVE_RUN_EXISTS') { closePanel(); await recover(); return }
        throw e
      } finally { busy = false; const b = $('#confirm-run'); if (b) b.disabled = false }
    })
  }
  async function enterCombat() {
    await recover()
    if (!active) return message('No active run', 'Start a dungeon first.')
    nav('dg-combat')
  }
  function allowed() {
    return (combat?.allowedActions || []).map(a => typeof a === 'string' ? { type: a } : a)
      .filter(a => a.available !== false && a.allowed !== false)
      .filter(a => ['attack', 'skill', 'consumable', 'defend', 'escape', 'move', 'dodge'].includes(a.type))
  }
  function drawCombat() {
    const c = combat
    if (!c) return
    const p = c.player || {}, enemy = c.enemy || c.enemies?.[0] || {}
    text('#v-dg-combat .cb-hl .bdg', `Lv ${num(p.level)}`)
    text('#v-dg-combat .cb-top .bdg:first-child', `Floor ${num(c.floor ?? c.currentFloor)}`)
    text('#v-dg-combat .cb-top .bdg:last-child', `Room ${num(c.room ?? c.currentRoom)}`)
    const enemyTitle = $('#v-dg-combat .cb-en > :first-child')
    enemyTitle.classList.remove('sk', 'w50'); enemyTitle.classList.add('combat-enemy-name')
    enemyTitle.textContent = enemy.name || 'No enemy'
    text('#v-dg-combat .cb-en .bdg', `Lv ${num(enemy.level)}`)
    const meter = (root, name, current, max) => {
      const el = $(root); if (!el) return
      el.querySelector('span').textContent = `${name}: ${num(current)} / ${num(max)}`
      const value = Math.max(0, Math.min(100, Number(current) / Math.max(1, Number(max)) * 100))
      el.querySelector('i').style.width = `${Number.isFinite(value) ? value : 0}%`
    }
    meter('.cb-hl .hp', 'HP', p.hp?.current ?? p.hp, p.hp?.max ?? p.maxHp)
    meter('.cb-hl .mp', 'MP', p.mp?.current ?? p.mp, p.mp?.max ?? p.maxMp)
    meter('.cb-hr .hp', 'HP', enemy.hp?.current ?? enemy.hp, enemy.hp?.max ?? enemy.maxHp)
    drawPortrait($('#v-dg-combat .cb-av'), p)
    drawPortrait($('#v-dg-combat .cb-ea'), enemy, true)
    setScene($('#v-dg-combat .cb-bg'), c.backgroundUrl || active?.backgroundUrl)
    drawStage(c)
    const actions = allowed(), act = $('#v-dg-combat .cb-act')
    const choices = actionChoices(actions)
    act.innerHTML = choices.map((a, i) => `<button class="${a.type === 'attack' ? 'cb-atk' : 'cb-sk'}" data-combat-choice="${i}" data-server-disabled="${!!a.unavailable}" aria-label="${esc(a.label || a.name || a.type)}" title="${esc(a.label || a.name || a.type)}${a.unavailable ? ' · Unavailable this turn' : ''}">${dungeonActionIcon(a.type)}<span>${esc(a.label || a.name || a.type)}</span>${a.cooldownRemaining != null && Number(a.cooldownRemaining) > 0 ? `<b>${esc(a.cooldownRemaining)}</b>` : ''}</button>`).join('')
    $$('[data-combat-choice]').forEach(el => { el.onclick = () => run('combat-choice', () => choose(choices[Number(el.dataset.combatChoice)])) })
    const movement = flags().dungeonMovement === true && actions.some(a => a.type === 'move')
    const moves = actions.filter(a => a.type === 'move')
    const dodge = flags().dungeonMovement === true && actions.find(a => a.type === 'dodge')
    $('#v-dg-combat .cb-dpad').hidden = !movement && !dodge
    $$('.cb-dpad .cb-dp').forEach(el => {
      const direction = ['left', 'right', 'up', 'down'].find(d => el.classList.contains(d))
      const supported = moves.some(a => a.direction ? a.direction === direction : a.directions?.length ? a.directions.includes(direction) : ['left', 'right'].includes(direction))
      el.hidden = !movement || !supported; el.dataset.apiAction = '1'
      el._apiAction = () => supported && run('combat-action', () => send({ type: 'move', direction }))
    })
    let dodgeButton = $('#combat-dodge')
    if (!dodgeButton) { dodgeButton = document.createElement('button'); dodgeButton.id = 'combat-dodge'; dodgeButton.className = 'cb-sk'; $('#v-dg-combat .cb-dpad').append(dodgeButton) }
    dodgeButton.innerHTML = dungeonActionIcon('dodge') + '<span>Dodge</span>'; dodgeButton.hidden = !dodge; dodgeButton.onclick = () => run('combat-action', () => send({ type: 'dodge' }))
    controlsDisabled(busy || uncertainVersion != null || Date.now() < lockedUntil)
    status(`State ${c.stateVersion} · ${(p.statusEffects || []).map(s => typeof s === 'string' ? s : s.name).join(', ')}${c.cooldowns ? ' · Cooldowns: ' + Object.entries(c.cooldowns).map(([k, v]) => `${k}: ${typeof v === 'object' ? v.remaining ?? v.turns ?? '—' : v}`).join(', ') : ''}`)
  }
  function controlsDisabled(value) { $$('#v-dg-combat .cb-act button, #v-dg-combat .cb-dpad button, #combat-leave').forEach(el => { el.disabled = value || el.dataset.serverDisabled === 'true' }) }
  async function choose(action) {
    if (!action || action.unavailable || busy || uncertainVersion != null || Date.now() < lockedUntil) return
    let payload = { type: action.type }
    const skills = action.skillId ? [action] : combat?.skills || []
    const items = action.itemInstanceId ? [action] : combat?.consumables || []
    if (action.type === 'skill' || action.type === 'consumable' || action.directions?.length || action.directionRequired) {
      const choices = action.type === 'skill' ? skills : action.type === 'consumable' ? items : []
      const directions = action.directions || (action.directionRequired ? ['left', 'right'] : [])
      const targets = action.targetRequired ? (combat?.enemies || (combat?.enemy ? [combat.enemy] : [])).filter(e => e.id && Number(e.hp?.current ?? e.hp ?? 1) > 0) : []
      panel('Choose action', `${choices.length ? `<label>${esc(action.type)}<select id="combat-resource">${choices.map((v, i) => `<option value="${i}">${esc(v.name || v.label || v.skillId || v.itemInstanceId || v.id)}</option>`).join('')}</select></label>` : ''}${directions.length ? `<label>Direction<select id="combat-direction">${directions.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>` : ''}${targets.length ? `<label>Target<select id="combat-target">${targets.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>` : ''}<button class="pm-cta" id="confirm-combat">Use action</button>`)
      if (action.targetRequired && !targets.length) { $('#confirm-combat').disabled = true; text('#api-error', 'No valid targets were provided for this action.'); return }
      if (['skill', 'consumable'].includes(action.type) && !choices.length) { $('#confirm-combat').disabled = true; text('#api-error', 'No valid resource IDs were provided for this action.'); return }
      $('#confirm-combat').onclick = () => run('combat-action', async () => {
        const resource = choices[Number($('#combat-resource')?.value || 0)]
        if (action.type === 'skill') payload.skillId = resource.skillId || resource.id
        if (action.type === 'consumable') payload.itemInstanceId = resource.itemInstanceId || resource.instanceId || resource.id
        if ($('#combat-direction')) payload.direction = $('#combat-direction').value
        if ($('#combat-target')) payload.targetId = $('#combat-target').value
        closePanel(); await send(payload)
      })
      return
    }
    await send(payload)
  }
  async function send(payload) {
    if (busy || uncertainVersion != null || Date.now() < lockedUntil || !runId() || combat?.stateVersion == null) return
    const permitted = allowed().filter(a => a.type === payload.type)
    if (!permitted.some(a => (!a.skillId || a.skillId === payload.skillId) && (!a.itemInstanceId || a.itemInstanceId === payload.itemInstanceId) && (!a.direction || a.direction === payload.direction) && (!a.directions?.length || a.directions.includes(payload.direction)) && (!a.targetRequired || !!payload.targetId))) {
      status('Available actions changed. Review your next action.'); return
    }
    if (payload.type === 'skill' && !actionChoices(allowed()).some(a => a.type === 'skill' && a.skillId === payload.skillId && !a.unavailable)) return
    if (payload.targetId && !(combat.enemies || (combat.enemy ? [combat.enemy] : [])).some(e => e.id === payload.targetId && Number(e.hp?.current ?? e.hp ?? 1) > 0)) return
    if (['move', 'dodge'].includes(payload.type) && flags().dungeonMovement !== true) return
    if (payload.type === 'skill' && !payload.skillId || payload.type === 'consumable' && !payload.itemInstanceId) throw new Error('The server did not provide an action resource ID.')
    busy = true; controlsDisabled(true); stopPolling()
    const id = runId(), revision = generation
    try {
      await commit(() => api.combatAction(id, { ...payload, expectedVersion: combat.stateVersion }), async out => {
        if (revision !== generation || !sameRun(id)) return
        uncertainVersion = null
        if (out.run) active = out.run
        installCombat(out); addEvents(out.events || [])
        if (currentView === 'dg-combat' && Number(combat?.player?.hp?.current ?? combat?.player?.hp ?? 1) > 0) animateDungeonSprite($('#v-dg-combat .cb-p'), { attack: 'Attack_1', skill: 'Cast', consumable: 'Cast', defend: 'Protection', move: 'Run', dodge: 'Run', escape: 'Run' }[payload.type])
        if (out.log) addEvents(out.log.map((line, i) => typeof line === 'object' ? line : { id: `${combat?.stateVersion}:action:${i}`, text: line }))
        if (out.result || combat?.victory || combat?.defeat || active && !isActive(active)) await results(id)
      })
    } catch (e) {
      if (e.retryAction) protectUncertainRetry(e)
      if (e.code === 'STATE_VERSION_CONFLICT') { installCombat(e.body); status('State updated. Review your next action.'); return }
      if (e.code === 'ACTION_IN_PROGRESS') {
        lockedUntil = Date.now() + Math.max(1000, e.retryAfterMs || 1000)
        ui.countdown($('#combat-status'), e.retryAfterMs || 1000, e.message, () => { lockedUntil = 0; drawCombat(); startPolling() }); return
      }
      if (e.code === 'MOVEMENT_UNSUPPORTED') { combat.allowedActions = (combat.allowedActions || []).filter(a => !['move', 'dodge'].includes(typeof a === 'string' ? a : a.type)); drawCombat(); return }
      if (e.code === 'DIRECTION_REQUIRED') { busy = false; await choose({ type: payload.type, directions: ['left', 'right'], ...payload }); return }
      if (e.code === 'NOT_IN_BATTLE') { await recover(); return }
      throw e
    } finally { busy = false; controlsDisabled(uncertainVersion != null || Date.now() < lockedUntil); startPolling() }
  }
  function protectUncertainRetry(error) {
    uncertainVersion ??= combat?.stateVersion
    const retry = error.retryAction
    error.retryAction = async () => {
      if (busy) return
      busy = true; controlsDisabled(true); stopPolling()
      try { await retry(); uncertainVersion = null }
      catch (e) {
        if (e.retryAction) protectUncertainRetry(e)
        else { uncertainVersion = null; if (e.code === 'STATE_VERSION_CONFLICT') installCombat(e.body) }
        throw e
      }
      finally { busy = false; controlsDisabled(uncertainVersion != null || Date.now() < lockedUntil); startPolling() }
    }
  }
  function rewardPreview(host, data) {
    const rewards = Array.isArray(data) ? data : data?.items || []
    host?.querySelectorAll('.sq').forEach((slot, i) => {
      const reward = rewards[i]
      slot.classList.add('dungeon-reward')
      slot.title = reward ? `${reward.name || reward.type || 'Reward'}${reward.qty != null || reward.quantity != null ? ' ×' + (reward.qty ?? reward.quantity) : ''} · Server preview` : 'Reward preview unavailable; actual drops are determined by the server.'
      slot.innerHTML = reward ? `${image(reward.imageUrl || reward.image)}<span>${esc(reward.name || reward.type || 'Reward')}${reward.qty != null || reward.quantity != null ? ' ×' + esc(reward.qty ?? reward.quantity) : ''}</span>` : '<span>—</span>'
    })
  }
  function drawPortrait(host, entity, enemy = false) {
    host.innerHTML = `<div class="fighter-portrait">${dungeonSprite(entity, enemy)}</div>` + image(entity.imageUrl || entity.avatarUrl || entity.image)
    const portrait = host.querySelector('img')
    if (portrait) portrait.addEventListener('error', () => portrait.remove(), { once: true })
  }
  function clearBattleView() {
    $('#v-dg-combat .cb-stage').replaceChildren()
    $('#v-dg-combat .cb-av').replaceChildren(); $('#v-dg-combat .cb-ea').replaceChildren()
    $$('#v-dg-combat .cb-bar span').forEach(el => { el.textContent = '— / —' })
    $$('#v-dg-combat .cb-bar i').forEach(el => { el.style.width = '0%' })
    $('#combat-feed').replaceChildren()
  }
  function dungeonScene(url) { return image(url) || '<img src="art/scenes/stone-vault.svg" alt="Stone dungeon" loading="lazy">' }
  function setScene(host, url) {
    if (!host) return
    const safe = url && ui.art(url)
    host.classList.add('dungeon-scene')
    host.style.backgroundImage = `linear-gradient(180deg,rgba(4,8,17,.12),rgba(4,8,17,.5)),url(${JSON.stringify(safe || 'art/scenes/stone-vault.svg')})`
  }
  function actionChoices(actions) {
    const result = []
    for (const action of actions.filter(a => !['move', 'dodge'].includes(a.type))) {
      if (action.type === 'skill' && !action.skillId && combat?.skills?.some(s => s.skillId || s.id)) {
        for (const skill of combat.skills.filter(s => s.skillId || s.id)) result.push({ ...skill, ...action, skillId: skill.skillId || skill.id, label: skill.name || skill.label || action.label, targetRequired: action.targetRequired ?? skill.targetRequired, unavailable: skill.available === false || skill.allowed === false || Number(skill.cooldownRemaining) > 0 })
      } else {
        const skill = action.type === 'skill' ? combat?.skills?.find(s => (s.skillId || s.id) === action.skillId) : null
        result.push({ ...skill, ...action, label: action.label || skill?.name, unavailable: Number(action.cooldownRemaining ?? skill?.cooldownRemaining) > 0 })
      }
    }
    for (const skill of combat?.skills || []) {
      const id = skill.skillId || skill.id
      if (id && !result.some(a => a.type === 'skill' && a.skillId === id)) result.push({ ...skill, type: 'skill', skillId: id, label: skill.name || skill.label || 'Skill', unavailable: true })
    }
    return result
  }
  function drawStage(c) {
    const stage = $('#v-dg-combat .cb-stage'), positions = c.positions || c.swarm?.positions || {}
    const prior = new Map([...stage.querySelectorAll('[data-fighter-id]')].map(el => [el.dataset.fighterId, { left: el.style.left, top: el.style.top }]))
    const actors = [{ entity: c.player || {}, role: 'player', className: 'cb-p' }, ...(c.enemies || (c.enemy ? [c.enemy] : [])).map((entity, i) => ({ entity, role: i === 0 ? 'enemy' : `enemy:${i}`, className: i === 0 ? 'cb-e1' : 'cb-e2', index: i }))]
    stage.innerHTML = actors.map(({ entity, role, className, index }) => `<div class="sq fighter ${className}" data-fighter-id="${esc(entity.id || role)}" ${index != null ? `data-enemy-index="${index}"` : ''} title="${esc(entity.name || (role === 'player' ? getPlayer()?.name || 'You' : 'Enemy'))} · Cosmetic sprite skin">${dungeonSprite(entity, role !== 'player')}<span class="fighter-name">${esc(entity.name || (role === 'player' ? getPlayer()?.name || 'You' : 'Enemy'))}</span></div>`).join('')
    const elements = stage.querySelectorAll('[data-fighter-id]')
    actors.forEach(({ entity, role, index }, i) => {
      const el = elements[i], pos = dungeonPosition(entity, positions, c.arena?.bounds || c.swarm?.bounds, role)
      if (!pos) { if (index > 1) el.style.left = `${Math.min(84, 58 + index * 9)}%`; return }
      const old = prior.get(el.dataset.fighterId)
      el.style.transform = 'translate(-50%, -100%)'; el.style.bottom = 'auto'; el.style.left = old?.left || pos.left; el.style.top = old?.top || pos.top
      if (old && (old.left !== pos.left || old.top !== pos.top)) {
        setTimeout(() => { if (el.isConnected) { el.style.left = pos.left; el.style.top = pos.top } }, 0)
      }
    })
    const entries = Array.isArray(positions) ? positions : Object.entries(positions).map(([id, p]) => ({ id, ...(p && typeof p === 'object' ? p : { position: p }) }))
    const label = document.createElement('p'); label.className = 'combat-positions'
    label.textContent = entries.map(pos => `${pos.name || pos.id}: ${pos.position ?? [pos.x ?? pos.xPercent, pos.y ?? pos.yPercent].filter(v => v != null).join(', ')}`).join(' · ')
    stage.append(label)
  }
  function showCombatInfo() {
    panel('Combat information', `<p>Use the controls offered for the current server turn. Tap a skill or potion to choose its resource and target.</p><p>Movement and dodge are available only on supported floors. Arrow keys / WASD use the same allowed movement controls. Space attacks. No auto-battle or local pause.</p><p>Character sprites are visual skins; names, HP, MP, damage, cooldowns and rewards come from the server.</p><p>${esc($('#combat-status').textContent)}</p>`)
  }
  function showLog() { panel('Combat activity', $('#combat-feed').innerHTML || '<p>No events yet.</p>') }
  function confirmAbandon() {
    if (busy || uncertainVersion != null || !runId()) return
    const id = runId()
    panel('Leave dungeon?', '<p>The server determines the consequences. Boss battles may prevent leaving.</p><button class="pf-out" id="confirm-abandon">Leave dungeon</button>')
    $('#confirm-abandon').onclick = () => run('abandon', () => commit(() => api.abandonRun(id), async () => { closePanel(); stopPolling(); recoveryVersion++; active = null; combat = null; uncertainVersion = null; generation++; nav('fight'); await refreshPlayer(); await recover() }))
  }
  async function results(id) {
    const revision = generation, sourceView = currentView
    const isLiveRun = sameRun(id)
    if (isLiveRun) stopPolling()
    let out
    try { out = await api.runResult(id) }
    catch (e) {
      if (revision !== generation || sourceView !== currentView) return
      if (e.code !== 'RESULT_NOT_READY') throw e
      status('The run is still active. Results are not ready.')
      const state = await api.dungeonRun(id)
      if (revision !== generation || sourceView !== currentView) return
      if (sameRun(id) && state.run) active = state.run
      if (isLiveRun && currentView === 'dg-combat') startPolling()
      return
    }
    if (revision !== generation || sourceView !== currentView) return
    const result = out.result || out
    if (sameRun(id)) {
      active = { ...active, status: 'completed' }; combat = null; uncertainVersion = null
      $('#v-dg-combat .cb-act').replaceChildren(); $('#v-dg-combat .cb-dpad').hidden = true
      controlsDisabled(true); drawRun()
    }
    panel('Dungeon result', `<p>${esc(result.outcome || result.status || 'Completed')}</p><p>${esc(result.summary || '')}</p><p>Rewards have already been credited automatically.</p><div>${(result.drops || []).map(i => `<p>${esc(i.name)} ×${num(i.qty ?? i.quantity)}</p>`).join('')}</div><button class="pm-cta" id="acknowledge-result">Continue</button>`)
    $('#acknowledge-result').onclick = () => run('acknowledge', () => commit(() => api.acknowledgeResult(id), async () => {
      closePanel()
      if (sameRun(id)) { recoveryVersion++; active = null; combat = null; uncertainVersion = null; generation++; events.clear() }
      nav('fight'); await run('result-refresh', refreshPlayer); await recover()
    }))
    // The acknowledgement remains usable even if this independent read fails.
    await run('result-refresh', refreshPlayer)
  }
  async function goals() {
    const out = await api.dungeonGoals()
    panel('Weekly dungeon goals', `<p>Resets: ${out.resetAt ? esc(new Date(out.resetAt).toLocaleString()) : 'Server reset time unavailable'}</p>${(out.goals || []).map((g, idx) => `<div class="api-card"><h3>${esc(g.title)}</h3><p>${num(g.progress)} / ${num(g.target)}</p><p>${esc(typeof g.reward === 'object' ? Object.entries(g.reward).map(([k, v]) => `${k}: ${v}`).join(' · ') : g.reward)}</p><button class="gbtn" data-goal="${idx}" ${!g.id || !g.claimable || g.claimed ? 'disabled' : ''}>${g.claimed ? 'Claimed' : 'Claim reward'}</button></div>`).join('') || '<p>No goals available.</p>'}`)
    $$('[data-goal]').forEach(el => { el.onclick = () => run('claim-goal', async () => {
      const g = out.goals[Number(el.dataset.goal)]; if (!g.id) return
      el.disabled = true
      try { await commit(() => api.claimGoal(g.id), async () => { await refreshPlayer(); await goals() }) } finally { if (el.isConnected) el.disabled = false }
    }) })
  }
  async function history(cursor) {
    const out = await api.runHistory({ cursor, limit: 20 })
    panel('Dungeon history', `${(out.runs || []).map((r, i) => `<button class="gbtn" data-run-detail="${i}">${esc(r.dungeonName || r.dungeonId)} · ${esc(r.status)}</button>`).join('') || '<p>No runs yet.</p>'}${out.nextCursor ? '<button class="gbtn" id="runs-next">Next page</button>' : ''}`)
    $$('[data-run-detail]').forEach(el => { el.onclick = () => run('run-detail', async () => {
      const r = out.runs[Number(el.dataset.runDetail)], detail = await api.dungeonRun(r.id || r.runId)
      if (isActive(detail.run)) { active = detail.run; closePanel(); nav('dg-combat') } else await results(r.id || r.runId)
    }) })
    if ($('#runs-next')) $('#runs-next').onclick = () => run('history', () => history(out.nextCursor))
  }
  // Add data/status mounts inside, rather than replacing, the reference layout.
  const append = (parent, tag, id, cls = 'sub') => { const el = document.createElement(tag); el.id = id; el.className = cls; $(parent).append(el); return el }
  append('#v-dg-list', 'button', 'dungeon-more', 'gbtn').textContent = 'Load more dungeons'
  $('#dungeon-more').hidden = true; $('#dungeon-more').onclick = () => run('dungeons', () => loadCatalog(true))
  append('#v-fight .fx-feat .fbot', 'h3', 'featured-dungeon-title', 'dungeon-title')
  append('#v-dg-prep', 'p', 'dungeon-eligibility'); append('#v-dg-prep', 'p', 'reward-note')
  append('#v-dg-combat', 'p', 'combat-status'); append('#v-dg-combat', 'div', 'combat-feed')
  append('#v-dg-combat .cb-side', 'button', 'combat-leave', 'cb-b').textContent = 'Leave'
  bind('#combat-leave, #cb-leave', confirmAbandon)
  bind('#v-fight .fx-run [data-go="dg-combat"]', () => requireAccount(enterCombat))
  bind('#v-dg-prep [data-go="dg-combat"]', () => requireAccount(start))
  bind('#v-dg-prep .sec a', () => requireAccount(() => management.party()))
  bind('#v-dg-prep .fx-r4:last-of-type .sq', () => requireAccount(() => management.party()))
  const goalHeading = $$('#v-fight .sec').find(el => el.querySelector('h2')?.textContent === 'Weekly goal')
  if (goalHeading) { goalHeading.dataset.apiAction = '1'; goalHeading._apiAction = () => requireAccount(goals); goalHeading.tabIndex = 0; goalHeading.setAttribute('role', 'button') }
  $$('#v-fight .sec a, #v-profile .sec a').filter(el => /History/.test(el.textContent)).forEach(el => { el.dataset.apiAction = '1'; el._apiAction = () => requireAccount(() => history()) })
  bind('.pf-h', () => requireAccount(() => history()))
  window.addEventListener('keydown', event => {
    if (currentView !== 'dg-combat' || document.hidden || !getPlayer() || ($('#api-panel') && !$('#api-panel').hidden) || event.repeat || event.ctrlKey || event.altKey || event.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return
    const direction = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down' }[event.key]
    if (direction) {
      const el = $('#v-dg-combat .cb-dpad .' + direction)
      if (el && !el.hidden && !el.disabled && !el.parentElement.hidden) { event.preventDefault(); el._apiAction() }
    } else if (event.key === ' ' && !busy && uncertainVersion == null && allowed().some(a => a.type === 'attack')) {
      event.preventDefault(); run('combat-action', () => send({ type: 'attack' }))
    }
  })
  const controller = {
    configure, recover, stopPolling, select, isActive: () => !!isActive(active),
    setFeatured(id) { selectedId ||= id },
    leaveView(name) { currentView = name; if (name !== 'dg-combat') stopPolling() },
    async view(name) {
      currentView = name
      if (flags().dungeonRuns !== true) return
      if (name === 'dg-list') return loadCatalog()
      if (name === 'fight') { await loadCatalog(); if (getPlayer()) await recover(); return }
      if (!getPlayer()) return requireAccount(() => {})
      if (name === 'dg-prep') return prepare()
      if (name === 'dg-combat') {
        await recover()
        if (!active) { status('No active dungeon run.'); return }
        // recover() already fetched authoritative combat and started polling.
      }
    },
    reset() { generation++; recoveryVersion++; stopPolling(); active = null; combat = null; uncertainVersion = null; lockedUntil = 0; prep = null; catalog = []; catalogCursors.clear(); nextCursor = null; selectedId = null; sequence = 0; events.clear(); $('#combat-feed').replaceChildren(); $('#v-dg-combat .cb-act').replaceChildren(); clearBattleView(); $('#v-dg-combat .cb-dpad').hidden = true; drawRun(); configure() },
  }
  configure()
  return controller
}
