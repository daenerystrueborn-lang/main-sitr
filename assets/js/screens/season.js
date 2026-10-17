/**
 * screens/season.js - battle pass progress, tier track, season roster and lore.
 */
import { $, esc, attr, num, titleCase, duration, emptyState, bar, iconSvg, skeletonRows } from '../ui.js'
import { api } from '../api.js'
import { state } from '../core/state.js'
import { perkIcon, characterPrice, abilityName } from '../core/shared.js'

export const seasonHtml = `
<main class="view" id="view-season">
  <section class="hero season-hero">
    <!-- The art IS the background - no still frame in a box, nothing letterboxed,
         just the image bleeding edge to edge. aria-hidden because it carries no
         information; the heading does. Was a looping <video> pointing at
         assets/video/mei-finalform.mp4, which was never in the repo, so the
         section rendered as a flat black band. -->
    <img id="seasonHeroArt" class="season-hero-art" src="/assets/img/season/hero.jpg"
         alt="" aria-hidden="true" decoding="async" fetchpriority="high">
    <div class="season-hero-veil"></div>
    <div class="hero-inner">
      <div class="hero-badge">
        <svg class="icon" viewBox="0 0 24 24"><path d="M12 2l2.4 6.9L21 9l-5 4.6L17.4 21 12 17.3 6.6 21 8 13.6 3 9l6.6-.1L12 2z"/></svg>
        <span id="seasonClock">Live now</span>
      </div>
      <h1 id="seasonName" class="gold-fx">Season</h1>
      <p id="seasonDesc">A new battle pass, new rewards, and tiers of gear to climb through.</p>
    </div>
  </section>

  <div class="page">
    <section class="section">
      <div class="section-head">
        <div>
          <h2>Battle pass progress</h2>
          <p>Free and premium tracks, side by side</p>
        </div>
      </div>
      <div class="card" id="seasonMine"></div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>The story so far</h2>
          <p>Why this season is happening, and who is in it</p>
        </div>
      </div>
      <div id="seasonLore"></div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>Tier rewards</h2>
          <p>Everything the pass hands out this season</p>
        </div>
      </div>
      <div class="tier-track" id="seasonTiers"></div>
    </section>

    <section class="section">
      <div class="section-head" id="seasonRosterHead" style="display:none;">
        <div>
          <h2>Season roster</h2>
          <p>The characters this season revolves around - tap one for their kit</p>
        </div>
      </div>
      <div class="grid-4" id="seasonRoster"></div>
    </section>

  </div>
</main>`

let seasonTimer = null

/** The hashchange handler stops the live countdown when leaving the screen. */
export function stopSeasonTimer() {
  clearInterval(seasonTimer)
}

export async function loadSeason() {
  const tiersHost = $('#seasonTiers')
  if (tiersHost) tiersHost.innerHTML = skeletonRows(6)

  const out = await api.season()

  if (!out.active) {
    $('#seasonName').textContent = 'No active season'
    $('#seasonDesc').textContent = 'The next season has not started yet - check back soon.'
    $('#seasonClock').textContent = ''
    $('#seasonMine').innerHTML = ''
    if (tiersHost) tiersHost.innerHTML = `<div style="flex:1">${emptyState('season', 'Between seasons', 'Rewards and the battle pass return when the next season opens.')}</div>`
    return
  }

  const s = out.season
  $('#seasonName').textContent = `Season ${s.number}: ${s.name}`
  $('#seasonDesc').textContent = s.description ?? ''

  const clock = $('#seasonClock')
  if (clock) {
    const paint = () => {
      const left = (out.runtime.endsAt ?? 0) - Date.now()
      clock.textContent = left > 0 ? `${duration(left)} left` : 'Season ended'
    }
    paint()
    clearInterval(seasonTimer)
    // Live countdown. Cleared on route change so it isn't ticking forever.
    seasonTimer = setInterval(paint, 30_000)
  }

  const mine = $('#seasonMine')
  if (mine) {
    if (out.player) {
      mine.innerHTML = `
        <div class="pd-stats" style="margin:0 0 18px">
          <div class="pd-stat"><div class="pd-stat-k">Your tier</div><div class="pd-stat-v">${num(out.player.tier)} / ${num(s.tierCount)}</div></div>
          <div class="pd-stat"><div class="pd-stat-k">Season level</div><div class="pd-stat-v">${num(out.player.seasonLevel)}</div></div>
          <div class="pd-stat"><div class="pd-stat-k">Points</div><div class="pd-stat-v">${num(out.player.points)}</div></div>
          <div class="pd-stat"><div class="pd-stat-k">Pass</div><div class="pd-stat-v">${out.player.premiumPass ? 'Premium' : 'Free'}</div></div>
        </div>
        ${bar('Season progress', out.player.tier, s.tierCount)}
        ${!out.player.premiumPass && s.premiumCost
          ? `<p class="subtext" style="margin-top:13px">Upgrade in chat with <code>${esc(state.meta?.prefix ?? '.')}season buypass</code> - ${num(s.premiumCost)} ${esc(s.premiumCurrency ?? 'gems')}.</p>`
          : ''}`
    } else {
      mine.innerHTML = `${perkIcon('season')}<h4>Track your battle pass</h4>
        <p style="margin-bottom:14px">Sign in to see which tiers you've reached and what's still unclaimed.</p>
        <a class="btn btn-primary btn-sm" href="#/login" data-route="login">Sign in</a>`
    }
  }

  if (tiersHost) {
    // Claimed tiers read as "done", the first unclaimed-but-reached tier is the
    // one you should act on, so it gets astral's `.current` gold treatment.
    const nextUp = (out.tiers ?? []).find(t => t.reached && !t.claimed)
    tiersHost.innerHTML = (out.tiers ?? []).map(t => {
      const cls = t === nextUp ? ' current' : t.claimed || t.reached ? ' unlocked' : ''
      const glyph = t.claimed ? iconSvg('reward', 'tier-icon-svg') : t.reached ? iconSvg('gift', 'tier-icon-svg') : iconSvg('lock', 'tier-icon-svg')
      return `
        <div class="tier-node${cls}" title="${attr(t.claimed ? 'Claimed' : t.reached ? 'Ready to claim' : 'Locked')}">
          <div class="tier-num">TIER ${num(t.tier)}</div>
          <div class="tier-icon">${glyph}</div>
          <div class="tier-label">${esc(t.free?.label ?? '')}</div>
          <div class="tier-label" style="color:var(--gold);margin-top:6px">${esc(t.premium?.label ?? '')}</div>
        </div>`
    }).join('')
  }

  renderSeasonRoster(s, out)
  renderSeasonLore(s, out)
}

/**
 * The season's featured characters.
 *
 * Rendered from `season.roster`, which the API builds by merging the narrative
 * cast (`season.characters` - mei/urahara/willow) with the shop's own
 * `rewardType: 'character'` rows (urahara/wither). This used to filter the
 * `shop` payload against a hardcoded name list, which could only ever surface
 * the intersection of those two sets: one character, Wither. Names were also
 * matched bare ('mei') against the API's full names ('Kisuke Urahara'), and one
 * entry was misspelled. All of that is gone - the roster is season data, so the
 * API is what knows it.
 */
function renderSeasonRoster(s, out) {
  const host = $('#seasonRoster')
  const head = $('#seasonRosterHead')
  if (!host) return

  const roster = s.roster ?? []
  if (head) head.style.display = roster.length ? '' : 'none'

  const currency = (c) => (c === 'seasonPoints' ? 'pts' : c ?? 'pts')

  host.innerHTML = roster.map(c => {
    // `tag` is the display badge (legendary / special); `rarity` is the
    // mechanical grade that prices gems. Show the tag when there is one and
    // fall back to rarity, so every tile carries exactly one badge.
    const badge = c.tag ?? c.rarity
    return `
    <button type="button" class="perk-card reveal" data-char="${attr(c.id)}"
            aria-label="${attr(`${c.name} details`)}">
      ${c.image
        ? `<img src="${attr(c.image)}" alt="" loading="lazy"
                onerror="this.remove()"
                style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:var(--r);margin-bottom:11px">`
        : perkIcon('gift')}
      ${badge ? `<span class="rarity-pill r-${attr(String(badge).toLowerCase())}">${esc(titleCase(badge))}</span>` : ''}
      <h4>${esc(c.name)}</h4>
      ${c.seasonTier ? `<p class="subtext">${esc(titleCase(c.seasonTier))} character</p>` : ''}
      <p>${c.purchasable
        ? `${num(c.price)} ${esc(currency(c.currency))}`
        : esc(characterPrice(c))}</p>
      ${c.ability ? `<p class="subtext" style="margin-top:6px">${esc(abilityName(c.ability))}</p>` : ''}
    </button>`
  }).join('')
}

/**
 * Season story: the premise, each character's blurb, the live point bonuses,
 * and what happens to leftover points when the season closes. All four come
 * straight from data/seasons.json via /api/season - none of it was shipped to
 * the site before, so this section is new rather than moved.
 */
function renderSeasonLore(s, out) {
  const host = $('#seasonLore')
  if (!host) return

  const lore = s.lore ?? {}
  const roster = s.roster ?? []

  // Blurbs are keyed by character id, alongside non-character keys like
  // `guide` and `reservedNpcId` - so walk the roster, not the lore object.
  const blurbs = roster
    .map(c => ({ c, text: lore[c.id] }))
    .filter(e => e.text)

  const guide = roster.find(c => c.id === lore.guide)

  // Only the bonuses that are actually set, labelled the way the chat view
  // labels them, so the site can't drift from what the bot awards.
  const BONUS_LABELS = {
    killPoints: ['pts per kill', '+'],
    bossKillPoints: ['pts per boss', '+'],
    winPoints: ['pts per win', '+'],
    killXpPercent: ['XP on kills', '+', '%'],
    killSolarsPercent: ['solars on kills', '+', '%'],
    winXpPercent: ['XP on wins', '+', '%'],
    winSolarsPercent: ['solars on wins', '+', '%'],
  }
  const bonuses = Object.entries(s.bonuses ?? {})
    .filter(([k, v]) => BONUS_LABELS[k] && v)
    .map(([k, v]) => {
      const [label, pre, suf = ''] = BONUS_LABELS[k]
      return `<div class="pd-stat"><div class="pd-stat-k">${esc(label)}</div>
        <div class="pd-stat-v">${esc(pre)}${num(v)}${esc(suf)}</div></div>`
    }).join('')

  const conv = s.endOfSeason?.seasonPointsToSolars

  host.innerHTML = `
    <div class="card lore-card reveal">
      <p class="lore-lead">${esc(s.description ?? '')}</p>
      ${guide ? `<p class="subtext">Your guide this season is
        <button type="button" class="link-btn" data-char="${attr(guide.id)}">${esc(guide.name)}</button>.</p>` : ''}
    </div>

    ${blurbs.length ? `<div class="grid-2" style="margin-top:18px">
      ${blurbs.map(({ c, text }) => `
        <button type="button" class="perk-card reveal" data-char="${attr(c.id)}"
                aria-label="${attr(`${c.name} details`)}">
          <h4>${esc(c.name)}</h4>
          <p>${esc(text)}</p>
        </button>`).join('')}
    </div>` : ''}

    ${bonuses ? `<div class="card reveal" style="margin-top:18px">
      <h4 style="margin:0 0 13px">Season bonuses</h4>
      <div class="pd-stats" style="margin:0">${bonuses}</div>
    </div>` : ''}

    ${conv ? `<p class="subtext" style="margin-top:14px">
      When the season closes, every unspent season point converts to
      ${num(conv)} solars${s.endOfSeason?.keepUnlockedContent
        ? ', and everything you unlocked stays yours' : ''}.
    </p>` : ''}`
}
