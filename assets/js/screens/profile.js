/**
 * screens/profile.js - the signed-in player's own page: header, stats,
 * rankings, season, equipped character, inventory slots.
 *
 * NOTE: parts of loadProfile()'s template are patched by
 * mobile/scripts/prepare-www.mjs when the Android app is bundled (banner/pfp
 * edit buttons). Keep the profile-banner and stat-row anchor lines intact.
 */
import { $, esc, attr, num, compact, titleCase, initials, bar, iconSvg, skeletonCards, openModal } from '../ui.js'
import { api } from '../api.js'
import { state } from '../core/state.js'
import { perkIcon, abilityName, resolveArt } from '../core/shared.js'
import { paintAvatar } from '../core/shell.js'
import { BOARD_LABELS } from './leaderboard.js'

export const profileHtml = `
<main class="view" id="view-profile">
  <div class="page" style="padding-top:56px;" id="profileWrap"></div>
</main>`

export async function loadProfile() {
  const host = $('#profileWrap')
  if (!host) return
  host.innerHTML = skeletonCards(3)

  const [meRes, rankRes] = await Promise.all([
    api.me(),
    api.myRankings().catch(() => null),
  ])
  const p = meRes.player
  state.me = p
  paintAvatar()

  const rankings = rankRes?.rankings ?? {}
  const prefix = state.meta?.prefix ?? '.'

  const ranked = Object.entries(rankings).filter(([, v]) => v).map(([k, v]) => `
    <div class="pd-stat">
      <div class="pd-stat-k">${esc(BOARD_LABELS[k] ?? titleCase(k))}</div>
      <div class="pd-stat-v">#${num(v.position)}<span style="font-size:12px;color:var(--text-subtle)"> / ${num(v.of)}</span></div>
    </div>`).join('')

  // Slots show the item's real plate (the same /assets/items/<id>.png the bot
  // renders in chat) and fall back to the generic glyph only when there's no
  // artwork or it fails to load - matching the `onerror` pattern used for
  // season art. `.inv-slot` has always had `cursor:pointer`; `data-item` is
  // what finally makes that true, via the delegated handler.
  state.inv = (p.inventory ?? []).slice(0, 24)
  const inv = state.inv.map((i, idx) => `
    <button type="button"
         class="inv-slot${i.rarity === 'rare' ? ' rare' : i.rarity === 'epic' || i.rarity === 'legendary' ? ' epic' : ''}"
         data-item="${attr(String(idx))}"
         title="${attr(i.name)}" aria-label="${attr(i.name)}">
      ${i.image
        ? `<img src="${attr(resolveArt(i.image))}" alt="" loading="lazy" class="inv-img"
                onerror="this.insertAdjacentHTML('afterend', this.dataset.fb); this.remove()"
                data-fb="${attr(`<span>${iconSvg('inventory', 'inventory-icon')}</span>`)}">`
        : `<span>${iconSvg('inventory', 'inventory-icon')}</span>`}
      ${i.qty > 1 ? `<span class="qty">${num(i.qty)}</span>` : ''}
    </button>`).join('')

  host.innerHTML = `
    <div class="profile-banner"${p.bannerUrl ? ` style="background-image:url('${attr(p.bannerUrl)}');background-size:cover;background-position:center;"` : ''}></div>

    <div class="profile-head-row">
      <div class="profile-pfp-wrap">
        <div class="profile-pfp">${p.avatarUrl
          ? `<img src="${attr(p.avatarUrl)}" alt="">`
          : esc(initials(p.name))}</div>
        <span class="profile-status"></span>
      </div>
      <div class="profile-info-row">
        <div class="profile-info">
          <h2><span class="profile-name-text">${esc(p.name)}</span>
            <span class="badge badge-lvl">Lv ${num(p.level)}</span>
            ${p.premium?.active ? '<span class="badge badge-gold">Premium</span>' : ''}</h2>
          <p class="handle">${iconSvg('rank', 'inline-icon')} ${esc(p.rank.title)} · ${esc(p.rank.epithet ?? '')}</p>
        </div>
        <div class="profile-actions">
          <a class="btn btn-secondary btn-sm" href="#/settings" data-route="settings">Settings</a>
          <a class="btn btn-ghost btn-sm" href="#/leaderboard" data-route="leaderboard">Boards</a>
        </div>
      </div>
    </div>

    <section class="section">
      <div class="stat-row reveal">
        <div class="stat-pill"><div class="label">Level</div><div class="value gold">${num(p.level)}</div>
          <div class="subtext" style="margin-top:4px">${p.xpProgress.maxed ? 'Max level' : `${num(p.xpProgress.xpToNext)} XP to go`}</div></div>
        <div class="stat-pill"><div class="label">Solars</div><div class="value acc">${compact(p.wallet.solars)}</div>
          <div class="subtext" style="margin-top:4px">${num(p.wallet.gems)} gems · ${compact(p.wallet.vault)} vaulted</div></div>
        <div class="stat-pill"><div class="label">Fame</div><div class="value acc">${esc(p.fame.formatted ?? num(p.fame.value))}</div>
          <div class="subtext" style="margin-top:4px">${esc(p.fame.tier?.title ?? '')}</div></div>
        <div class="stat-pill"><div class="label">PvP record</div><div class="value acc">${num(p.record.wins)}W</div>
          <div class="subtext" style="margin-top:4px">${num(p.record.losses)} losses${
            p.record.rating ? ` · ${num(p.record.rating)} rating` : ''}</div></div>
      </div>

      <div class="card reveal" style="margin-top:16px">
        ${bar(p.xpProgress.maxed ? 'XP (maxed)' : `XP to Lv ${num(p.level + 1)}`, p.xpProgress.intoLevel, p.xpProgress.forLevel || 1)}
        ${bar('HP', p.hp, p.maxHp || 1)}
        ${p.maxMp ? bar('MP', p.mp, p.maxMp) : ''}
        ${p.stamina ? bar('Stamina', p.stamina.current ?? 0, p.stamina.max ?? 1) : ''}
      </div>

      ${p.statPoints?.unallocated
        ? `<div class="perk-card reveal" style="margin-top:16px;border-color:rgb(212 175 55 / 40%)">
            ${perkIcon('spark')}
            <h4>${num(p.statPoints.unallocated)} stat point${p.statPoints.unallocated === 1 ? '' : 's'} unspent</h4>
            <p style="margin-bottom:12px">Spend them in chat - they do nothing sitting there.</p>
            <button class="btn btn-primary btn-sm" data-copy="${attr(prefix + 'stats')}">${esc(prefix)}stats</button>
          </div>` : ''}
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Stats</h2><p>What the bot rolls against every fight</p></div></div>
      <div class="pd-stats reveal">
        ${[['STR', p.stats.str], ['AGI', p.stats.agi], ['INT', p.stats.int], ['DEF', p.stats.def], ['LCK', p.stats.lck]]
          .map(([k, v]) => `<div class="pd-stat"><div class="pd-stat-k">${k}</div><div class="pd-stat-v">${num(v)}</div></div>`).join('')}
      </div>
    </section>

    ${ranked ? `<section class="section">
      <div class="section-head"><div><h2>Your rankings</h2><p>Where you sit on every board</p></div></div>
      <div class="pd-stats reveal">${ranked}</div>
    </section>` : ''}

    ${p.season ? `
      <section class="section">
        <div class="section-head">
          <div><h2>${esc(p.season.name)}</h2><p>Battle pass progress this season</p></div>
          <a class="btn btn-ghost btn-sm" href="#/season" data-route="season">Battle pass →</a>
        </div>
        <div class="card reveal">
          ${bar(`Tier ${num(p.season.tier)} of ${num(p.season.tierCount)}`, p.season.tier, p.season.tierCount || 1)}
          <p class="subtext" style="margin-top:11px">${p.season.premiumPass ? 'Premium pass active' : 'Free pass'} ·
            ${num(p.seasonPoints)} season points · ${num((p.season.claimedTiers ?? []).length)} tiers claimed</p>
        </div>
      </section>` : ''}

    ${p.equippedCharacter ? `
      <section class="section">
        <div class="section-head">
          <div><h2>Equipped character</h2><p>Its bonuses ride along on every run</p></div>
        </div>
        <button class="card reveal" data-char="${attr(p.equippedCharacter.id)}" style="text-align:left;width:100%;display:flex;gap:14px;align-items:center;cursor:pointer">
          ${p.equippedCharacter.image
            ? `<img src="${attr(p.equippedCharacter.image)}" alt="" style="width:58px;height:58px;border-radius:var(--r);object-fit:cover">`
            : iconSvg('character', 'character-placeholder')}
          <span style="min-width:0">
            <strong>${esc(p.equippedCharacter.name)}</strong>
            <p class="subtext">${esc(abilityName(p.equippedCharacter.ability))}</p>
          </span>
        </button>
      </section>` : ''}

    ${inv ? `<section class="section">
      <div class="section-head">
        <div><h2>Inventory</h2><p>The first 24 items you're carrying</p></div>
        <span class="badge badge-lvl">${num(p.counts.inventory)} items</span>
      </div>
      <div class="inv-grid reveal">${inv}</div>
    </section>` : ''}`
}

/**
 * Item detail, opened from an inventory slot.
 *
 * Everything shown is already in the stacked row `/api/me` sent, so unlike
 * openCharacter() this needs no fetch and no skeleton - the modal is populated
 * in one call, which also sidesteps the double-openModal focus bug entirely.
 */
export function openItem(item) {
  if (!item) return
  const bonuses = Object.entries(item.statBonuses ?? {})
    .map(([k, v]) => `<div class="pd-stat"><div class="pd-stat-k">${esc(k.toUpperCase())}</div><div class="pd-stat-v">${v > 0 ? '+' : ''}${num(v)}</div></div>`)
    .join('')

  openModal(`
    <div class="pd-head">
      <div class="pd-avatar">${item.image
        ? `<img src="${attr(resolveArt(item.image))}" alt="" style="width:100%;height:100%;object-fit:contain">`
        : iconSvg('inventory', 'inventory-icon')}</div>
      <div class="pd-id">
        <h3>${esc(item.name)}${item.qty > 1 ? ` <span class="badge badge-lvl">×${num(item.qty)}</span>` : ''}</h3>
        <p class="pd-sub">${esc([item.rarity && titleCase(item.rarity), item.type && titleCase(item.type)].filter(Boolean).join(' · '))}</p>
      </div>
    </div>
    <div class="pd-body">
      ${item.description ? `<p class="subtext">${esc(item.description)}</p>` : ''}
      ${bonuses ? `<div class="pd-sec-title">Stat bonuses</div><div class="pd-stats">${bonuses}</div>` : ''}
      ${item.sellPrice ? `<div class="pd-sec-title">Value</div><p class="subtext">Sells for ${num(item.sellPrice)} solars each.</p>` : ''}
    </div>`)
}
