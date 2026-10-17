/**
 * screens/characters.js - the star-ranked roster grid, plus the collectible
 * art-card character modal ([data-char] anywhere opens it: main roster,
 * season roster, or a player's equipped character).
 */
import { $, $$, esc, attr, num, titleCase, initials, skeletonCards, skeletonRows, emptyState, openModal, iconSvg } from '../ui.js'
import { api } from '../api.js'
import { perkIcon, characterPrice, abilityText, mediaEl, mediaFrame } from '../core/shared.js'

export const charactersHtml = `
<main class="view" id="view-characters">
  <div class="page" style="padding-top:56px;">
    <section class="section" style="padding-top:0;">
      <div class="section-head">
        <div>
          <h2 class="gold-fx">Characters</h2>
          <p>Every hero in the roster, ranked by stars. Tap one for their full kit.</p>
        </div>
      </div>
      <div class="tab-row" id="charFilters" role="tablist"></div>
      <div class="grid-4" id="charGrid"></div>
    </section>
  </div>
</main>`

let charFilter = 0      // 0 = every star level
let charList = []

/** Gold star row. Each star level gets its own variant of the site's gold effect (see .gs-N in style.css). */
function starsMarkup(n) {
  const k = Math.max(1, Math.min(6, Number(n) || 1))
  return `<span class="gold-stars gs-${k}" role="img" aria-label="${k} star${k === 1 ? '' : 's'}">${'★'.repeat(k)}</span>`
}

function charClaim(c) {
  if (c.owned) return { label: 'Claimed · yours', cls: 'badge-gold' }
  if (c.claim?.claimed) {
    return { label: c.claim.claimedBy ? `Claimed by ${c.claim.claimedBy}` : 'Claimed', cls: 'badge-lvl' }
  }
  return { label: 'Unclaimed', cls: 'badge-lvl' }
}

function paintCharFilters() {
  const host = $('#charFilters')
  if (!host) return
  const levels = [...new Set(charList.map(c => Number(c.stars) || 1))].sort((a, b) => b - a)
  host.innerHTML = [0, ...levels].map(n => `
    <button class="tab-btn${n === charFilter ? ' active' : ''}" data-charstars="${n}" role="tab">
      ${n === 0 ? 'All' : `${n} ★`}
    </button>`).join('')
}

function paintCharacters() {
  const host = $('#charGrid')
  if (!host) return
  const rows = charList.filter(c => !charFilter || (Number(c.stars) || 1) === charFilter)
  if (!rows.length) {
    host.innerHTML = emptyState('character', 'No characters', 'Nothing matched this filter.')
    return
  }
  host.innerHTML = rows.map(c => {
    const k = Math.max(1, Math.min(6, Number(c.stars) || 1))
    const badge = c.tag ?? c.rarity
    const claim = charClaim(c)
    return `
    <button type="button" class="perk-card char-card reveal" data-char="${attr(c.id)}"
            aria-label="${attr(`${c.name} details`)}">
      ${mediaFrame(c.image, { ratio: '4/5', fallback: perkIcon('gift') })}
      <div class="char-stars">${starsMarkup(k)}</div>
      <h4>${esc(c.name)}</h4>
      ${badge ? `<span class="rarity-pill r-${attr(String(badge).toLowerCase())}">${esc(titleCase(badge))}</span>` : ''}
      ${c.description ? `<p class="char-lore">${esc(c.description)}</p>` : ''}
      <div class="char-status"><span class="badge ${claim.cls}">${esc(claim.label)}</span></div>
    </button>`
  }).join('')
}

/** Star-filter tab clicked (delegated in wiring.js). */
export function applyCharFilter(n) {
  charFilter = Number(n) || 0
  for (const b of $$('#charFilters .tab-btn')) b.classList.toggle('active', Number(b.dataset.charstars) === charFilter)
  paintCharacters()
}

export async function loadCharacters() {
  const host = $('#charGrid')
  if (host && !charList.length) host.innerHTML = skeletonCards(8)
  try {
    // The spins list is the only place the API says whether a one-of-one has been won.
    const [chars, spins] = await Promise.all([api.characters(), api.spins().catch(() => null)])
    const claims = new Map((spins?.banners ?? []).map(b => [b.character?.id, b]))
    charList = (chars.characters ?? [])
      .map(c => ({ ...c, claim: claims.get(c.id) ?? null }))
      .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || String(a.name).localeCompare(String(b.name)))
    paintCharFilters()
    paintCharacters()
  } catch (err) {
    if (host) host.innerHTML = emptyState('warning', 'Characters unavailable', err?.message ?? '')
  }
}

/**
 * Character details use the collectible art-card treatment, not the banner and
 * avatar layout used by player profiles. Any [data-char] card can open this:
 * the main roster, season roster, or a player's equipped character.
 */
export async function openCharacter(id) {
  openModal(`<div style="padding:6px">${skeletonRows(3)}</div>`)
  try {
    const { character: c, owned, equipped, wielders, wielderCount } = await api.character(id)
    const bonuses = Object.entries(c.statBonuses ?? {})
      .map(([k, v]) => `<div class="pd-stat"><div class="pd-stat-k">${esc(k.toUpperCase())}</div><div class="pd-stat-v">+${num(v)}</div></div>`)
      .join('')

    openModal(`
      <div class="cc-wrap">
        <div class="cc-card cc-r-${attr(String(c.rarity ?? '').toLowerCase())}">
          ${c.image
            ? mediaEl(c.image, 'cc-img', `<span class="cc-ph">${iconSvg('character', 'character-placeholder')}</span>`)
            : `<span class="cc-ph">${iconSvg('character', 'character-placeholder')}</span>`}
          <div class="cc-shade"></div>
          ${equipped || owned ? `<span class="cc-flag${equipped ? ' is-eq' : ''}">${equipped ? 'Equipped' : 'Owned'}</span>` : ''}
          <div class="cc-meta">
            <h3>${esc(c.name)}</h3>
            <p>${esc([c.rarity && titleCase(c.rarity), c.characterTier && `Tier ${c.characterTier}`].filter(Boolean).join(' · '))}</p>
          </div>
        </div>
        ${characterPrice(c) ? `<p class="cc-price">${esc(characterPrice(c))}</p>` : ''}
      </div>
      <div class="pd-body">
        ${c.description ? `<p class="subtext">${esc(c.description)}</p>` : ''}
        ${c.ability ? `<div class="pd-sec-title">Ability</div><p class="subtext">${esc(abilityText(c.ability))}</p>` : ''}
        ${bonuses ? `<div class="pd-sec-title">Stat bonuses</div><div class="pd-stats">${bonuses}</div>` : ''}
        <div class="pd-sec-title">Wielded by ${num(wielderCount ?? 0)} player${wielderCount === 1 ? '' : 's'}</div>
        ${wielders?.length ? `<div class="lb-list">${wielders.map((w, i) => `
          <button class="lb-row" data-uid="${attr(w.uid)}">
            <span class="lb-rank">${i + 1}</span>
            <span class="lb-avatar">${w.avatarUrl ? `<img src="${attr(w.avatarUrl)}" alt="" loading="lazy">` : esc(initials(w.name))}</span>
            <span class="lb-name">${esc(w.name)}<span class="sub">Lv ${num(w.level)}</span></span>
            <span class="lb-score">›</span>
          </button>`).join('')}</div>`
          : `<p class="subtext">Nobody has this equipped yet.</p>`}
      </div>`)
  } catch (err) {
    openModal(emptyState('warning', 'Character unavailable', err?.message ?? ''))
  }
}
