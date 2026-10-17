/**
 * screens/leaderboard.js - the boards, plus the player-detail modal that
 * opens from any leaderboard/wielder row (also used from the character modal).
 */
import { $, $$, esc, attr, num, titleCase, initials, iconSvg, skeletonRows, emptyState, openModal, bar } from '../ui.js'
import { api } from '../api.js'
import { state } from '../core/state.js'
import { ensureMeta, abilityName } from '../core/shared.js'
import { noteIcon } from '../core/shell.js'

export const leaderboardHtml = `
<main class="view" id="view-leaderboard">
  <div class="page" style="padding-top:56px;">
    <section class="section" style="padding-top:0;">
      <div class="section-head">
        <div>
          <h2>Leaderboard</h2>
          <p id="lbTotal">Loading the standings…</p>
        </div>
      </div>

      <div class="stat-row" id="lbYou" style="display:none;margin-bottom:16px;"></div>

      <div class="lb-toolbar">
        <div class="tab-row" id="lbTabs" role="tablist"></div>
        <input class="lb-search" id="lbSearch" type="search" placeholder="Search a player…" aria-label="Search the board">
      </div>

      <div class="lb-list" id="lbList"></div>
      <p class="subtext" style="margin-top:14px;">Tap any row to see that player's stats and public alerts.</p>
    </section>
  </div>
</main>`

export function rowHtml(r) {
  const rankClass = r.position <= 3 ? ` top${r.position}` : ''
  const you = state.me && r.uid === state.me.uid ? ' is-you' : ''
  const medal = r.position <= 3
    ? iconSvg('rank', 'lb-medal')
    : r.position
  return `
    <button class="lb-row${you}" data-uid="${attr(r.uid)}">
      <span class="lb-rank${rankClass}">${typeof medal === 'string' ? medal : esc(medal)}</span>
      <span class="lb-avatar">${r.avatarUrl
        ? `<img src="${attr(r.avatarUrl)}" alt="" loading="lazy">`
        : esc(initials(r.name))}</span>
      <span class="lb-name">${esc(r.name)}${r.premium ? ' <span class="badge badge-gold">Premium</span>' : ''}
      <span class="sub">${esc(r.rank?.title ?? '')} · Lv ${num(r.level)}${
          r.classId ? ' · ' + esc(titleCase(r.classId)) : ''}${
          r.character?.name ? ' · ' + esc(r.character.name) : ''}</span>
      </span>
      <span class="lb-score">${esc(r.display)}</span>
    </button>`
}

export async function loadLeaderboard() {
  const meta = await ensureMeta()
  const tabs = $('#lbTabs')
  if (tabs && meta?.boards) {
    tabs.innerHTML = meta.boards.map(b => `
      <button class="tab-btn${b.id === state.board ? ' active' : ''}" data-board="${attr(b.id)}" role="tab">
        ${esc(b.label)}
      </button>`).join('')
  }
  await showBoard(state.board)
}

export async function showBoard(key, { force = false } = {}) {
  state.board = key
  for (const t of $$('#lbTabs .tab-btn')) t.classList.toggle('active', t.dataset.board === key)

  const list = $('#lbList')
  const youCard = $('#lbYou')
  if (!list) return

  if (force) state.boardCache.delete(key)
  if (!state.boardCache.has(key)) list.innerHTML = skeletonRows(8)

  let data = state.boardCache.get(key)
  if (!data) {
    try {
      data = await api.leaderboard(key, 100)
      state.boardCache.set(key, data)
    } catch (err) {
      list.innerHTML = emptyState('warning', "Couldn't load the board", err?.message ?? '')
      return
    }
  }

  state.lbRows = data.rows ?? []
  const total = $('#lbTotal')
  if (total) {
    total.textContent = data.total
      ? `${num(data.total)} ranked on ${data.label}${data.rows.length < data.total ? ` - showing the top ${data.rows.length}` : ''}`
      : `Nobody has made the ${data.label} board yet.`
  }

  // Your own standing, even when you're outside the top 100.
  if (youCard) {
    if (data.you) {
      youCard.style.display = ''
      youCard.innerHTML = `
        <div class="stat-pill"><div class="label">Your position</div><div class="value gold">#${num(data.you.position)}</div></div>
        <div class="stat-pill"><div class="label">Out of</div><div class="value acc">${num(data.you.of)}</div></div>
        <div class="stat-pill"><div class="label">${esc(data.unit)}</div><div class="value acc">${num(data.you.score)}</div></div>`
    } else {
      youCard.style.display = 'none'
    }
  }

  paintBoardRows(state.lbRows)
  const search = $('#lbSearch')
  if (search?.value) filterBoard(search.value)
}

function paintBoardRows(rows) {
  const list = $('#lbList')
  if (!list) return
  list.innerHTML = rows.length
    ? rows.map(rowHtml).join('')
    : emptyState('rank', 'Nothing here yet', 'Play a few rounds and this board fills up.')
}

export function filterBoard(query) {
  const q = query.trim().toLowerCase()
  if (!q) return paintBoardRows(state.lbRows)
  const hits = state.lbRows.filter(r => String(r.name).toLowerCase().includes(q))
  const list = $('#lbList')
  if (!list) return
  list.innerHTML = hits.length
    ? hits.map(rowHtml).join('')
    : emptyState('info', 'No match', `Nobody on this board is called "${query.trim()}".`)
}

/* ─────────────────────── player detail (modal) ────────────────────────── */

export const BOARD_LABELS = {
  level: 'Level', floor: 'Deepest Floor', season: 'Battle Pass',
  fame: 'Fame', wealth: 'Wealth', wins: 'PvP Wins',
}

/** Tapping a leaderboard row: that player's stats + their public alerts. */
export async function openPlayer(uid) {
  openModal(`<div style="padding:6px">${skeletonRows(4)}</div>`)
  try {
    const out = await api.player(uid)
    openModal(playerDetailHtml(out))
  } catch (err) {
    openModal(emptyState('warning', 'Player unavailable', err?.message ?? 'That profile could not be loaded.'))
  }
}

function playerDetailHtml({ player: p, rankings, isSelf }) {
  const alerts = p.alerts ?? []

  const statRows = [
    ['STR', p.stats.str], ['AGI', p.stats.agi], ['INT', p.stats.int],
    ['DEF', p.stats.def], ['LCK', p.stats.lck],
  ].map(([k, v]) => `
    <div class="pd-stat"><div class="pd-stat-k">${k}</div><div class="pd-stat-v">${num(v)}</div></div>`).join('')

  const ranked = Object.entries(rankings ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `
      <div class="pd-stat">
        <div class="pd-stat-k">${esc(BOARD_LABELS[k] ?? titleCase(k))}</div>
        <div class="pd-stat-v">#${num(v.position)}<span style="font-size:12px;color:var(--text-subtle)"> / ${num(v.of)}</span></div>
      </div>`).join('')

  return `
    <div class="pd-banner"${p.bannerUrl ? ` style="background-image:url('${attr(p.bannerUrl)}')"` : ''}></div>

    <div class="pd-head">
      <div class="pd-avatar">${p.avatarUrl
        ? `<img src="${attr(p.avatarUrl)}" alt="">`
        : esc(initials(p.name))}</div>
      <div class="pd-id">
        <div class="pd-name-row">
          <h3>${esc(p.name)}</h3>
          <div class="pd-badges">
            ${isSelf ? '<span class="badge badge-lvl">You</span>' : ''}
            ${p.premium?.active ? '<span class="badge badge-gold">Premium</span>' : ''}
          </div>
        </div>
        <p class="pd-sub">${iconSvg('rank', 'inline-icon')} ${esc(p.rank.title)} · ${esc(p.rank.epithet ?? '')}</p>
        <p class="subtext">Lv ${num(p.level)}${p.classId ? ' · ' + esc(titleCase(p.classId)) : ''}${
          p.raceId ? ' · ' + esc(titleCase(p.raceId)) : ''}</p>
        ${p.bio ? `<p class="pd-sub" style="margin-top:7px">"${esc(p.bio)}"</p>` : ''}
      </div>
    </div>

    <div class="pd-body">
      ${bar(p.xpProgress.maxed ? 'XP (maxed)' : `XP to Lv ${num(p.level + 1)}`,
            p.xpProgress.intoLevel, p.xpProgress.forLevel || 1)}
      ${bar('HP', p.hp, p.maxHp || 1)}
      ${p.maxMp ? bar('MP', p.mp, p.maxMp) : ''}

      <div class="pd-sec-title">Stats</div>
      <div class="pd-stats">${statRows}</div>

      <div class="pd-sec-title">Standing</div>
      <div class="pd-stats">
        <div class="pd-stat"><div class="pd-stat-k">Fame</div><div class="pd-stat-v">${esc(p.fame.formatted ?? num(p.fame.value))}</div></div>
        <div class="pd-stat"><div class="pd-stat-k">PvP</div><div class="pd-stat-v">${num(p.record.wins)}W ${num(p.record.losses)}L</div></div>
        <div class="pd-stat"><div class="pd-stat-k">Deepest floor</div><div class="pd-stat-v">${num(p.dungeon.deepestFloor)}</div></div>
        <div class="pd-stat"><div class="pd-stat-k">Conquered</div><div class="pd-stat-v">${num(p.dungeon.conquered)}</div></div>
      </div>

      ${ranked ? `<div class="pd-sec-title">Rankings</div><div class="pd-stats">${ranked}</div>` : ''}

      ${p.equippedCharacter ? `
        <div class="pd-sec-title">Equipped character</div>
        <div class="card" style="display:flex;gap:12px;align-items:center">
          ${p.equippedCharacter.image
            ? `<img src="${attr(p.equippedCharacter.image)}" alt="" style="width:52px;height:52px;border-radius:var(--r);object-fit:cover">`
            : iconSvg('character', 'character-placeholder')}
          <div style="min-width:0">
            <strong>${esc(p.equippedCharacter.name)}</strong>
            <p class="subtext">${esc(p.equippedCharacter.rarity ? titleCase(p.equippedCharacter.rarity) : '')}${
              p.equippedCharacter.ability ? ' · ' + esc(abilityName(p.equippedCharacter.ability)) : ''}</p>
          </div>
        </div>` : ''}

      <div class="pd-sec-title">Alerts</div>
      ${alerts.length ? alerts.map(a => `
        <div class="alert-item${a.severity && a.severity !== 'info' ? ' sev-' + esc(a.severity) : ''}">
          <span class="note-i">${noteIcon(a.kind)}</span>
          <div>
            <div class="alert-t">${esc(a.title)}</div>
            <div class="alert-b">${esc(a.body)}</div>
          </div>
        </div>`).join('')
        : `<p class="subtext">Nothing public to report right now.</p>`}

      <p class="subtext" style="margin-top:18px">Playing since ${esc(
        p.registeredAt ? new Date(p.registeredAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'a while back')}</p>
    </div>`
}

export function wireLeaderboardSearch() {
  const search = $('#lbSearch')
  if (!search) return
  let timer = null
  search.addEventListener('input', () => {
    clearTimeout(timer)
    // Filtering is local to the already-fetched rows, so this debounce is
    // purely to avoid re-rendering 100 nodes on every keystroke.
    timer = setTimeout(() => filterBoard(search.value), 120)
  })
}
