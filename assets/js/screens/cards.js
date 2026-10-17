/**
 * screens/cards.js - the browsable card collection. View-only by design:
 * tier filters and catalog paging are the only actions (no purchase controls).
 */
import { $, $$, esc, attr, skeletonCards, emptyState } from '../ui.js'
import { api } from '../api.js'
import { perkIcon, mediaFrame } from '../core/shared.js'

export const cardsHtml = `
<main class="view" id="view-cards">
  <div class="page" style="padding-top:56px;">
    <section class="section" style="padding-top:0;">
      <div class="section-head">
        <div>
          <h2>Browse the collection</h2>
          <p>Explore every card in the collection.</p>
        </div>
      </div>
      <div class="tab-row" id="cardFilters" role="tablist"></div>
      <div class="grid-4" id="cardCatalog"></div>
      <div style="display:flex;justify-content:center;margin-top:22px;">
        <button class="btn btn-secondary btn-sm" id="cardMore" style="display:none;">Load more</button>
      </div>
    </section>
  </div>
</main>`

let cardPage = 1
let cardTier = ''
const CARD_TIERS = ['1', '2', '3', '4', '5', '6', 'S']

/** Upstream card records without a series come through as the literal 'Unknown'. */
const hasSeries = (v) => { const t = String(v ?? '').trim(); return !!t && t.toLowerCase() !== 'unknown' }

export async function loadCards() {
  const filters = $('#cardFilters')
  if (filters) {
    const tiers = ['', ...CARD_TIERS]
    filters.innerHTML = tiers.map(t => `
      <button class="tab-btn${t === cardTier ? ' active' : ''}" data-cardtier="${attr(t)}" role="tab">
        ${t === '' ? 'All' : `Tier ${esc(t)}`}
      </button>`).join('')
  }

  cardPage = 1
  await paintCardCatalog({ reset: true })
}

/**
 * Fetch one catalog page.
 *
 * Goes through the bot rather than straight to cards-api-seven.vercel.app:
 * that host sends no Access-Control-Allow-Origin, so the browser discards the
 * response before JS can read it. The bot proxies it instead.
 */
async function paintCardCatalog({ reset = false } = {}) {
  const host = $('#cardCatalog')
  const more = $('#cardMore')
  if (!host) return
  if (reset) host.innerHTML = skeletonCards(8)
  if (more) more.disabled = true

  try {
    const out = await api.cardCatalog({ page: cardPage, limit: 24, tier: cardTier || undefined })
    const html = (out.cards ?? []).map(c => `
      <div class="perk-card card-tile reveal">
        ${mediaFrame(c.imageUrl, { ratio: '3/4', fallback: perkIcon('gem') })}
        <span class="rarity-pill r-t${attr(String(c.tier).toLowerCase())}">Tier ${esc(c.tier)}</span>
        <h4>${esc(c.title)}</h4>
        ${hasSeries(c.series) ? `<p>${esc(c.series)}</p>` : ''}
      </div>`).join('')

    if (reset) host.innerHTML = html || emptyState('gem', 'No cards', 'Nothing matched this filter.')
    else host.insertAdjacentHTML('beforeend', html)

    if (more) {
      more.style.display = out.hasMore ? '' : 'none'
      more.disabled = false
    }
  } catch (err) {
    if (reset) host.innerHTML = emptyState('warning', 'Card collection unavailable', err?.message ?? '')
    if (more) more.style.display = 'none'
  }
}

/** Tier filter tab clicked (delegated in wiring.js). */
export function applyCardTier(tier) {
  cardTier = tier
  for (const b of $$('#cardFilters .tab-btn')) b.classList.toggle('active', b.dataset.cardtier === cardTier)
  cardPage = 1
  paintCardCatalog({ reset: true })
}

/** "Load more" button clicked (delegated in wiring.js). */
export function loadMoreCards() {
  cardPage += 1
  paintCardCatalog()
}
