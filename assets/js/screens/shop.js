/**
 * screens/shop.js - the shop shelves (tab switch repaints from cache), the
 * wallet line, and the buy flow shared by every Buy button.
 */
import { $, $$, esc, attr, num, titleCase, skeletonCards, emptyState, toast } from '../ui.js'
import { api } from '../api.js'
import { state, isSignedIn, invalidate } from '../core/state.js'
import { perkIcon, confirmAction, reportError, resolveArt } from '../core/shared.js'
import { goTo } from '../core/router.js'

export const shopHtml = `
<main class="view" id="view-shop">
  <div class="page" style="padding-top:56px;">
    <section class="section" style="padding-top:0;">
      <div class="section-head">
        <div>
          <h2>Shop</h2>
          <p>The same stock the bot sells in chat - buy it here instead</p>
        </div>
        <div id="shopBalance"></div>
      </div>
      <div class="tab-row" id="shopTabs" role="tablist"></div>
      <div id="shopGrid"></div>
    </section>
  </div>
</main>`

/** Last /api/shop payload, so tab switches repaint without a refetch. */
let shopData = null
let shopShelf = null

export async function loadShop() {
  const grid = $('#shopGrid')
  if (grid) grid.innerHTML = skeletonCards(8)

  shopData = await api.shop()
  const shelves = (shopData.shelves ??= [])
  // The roster lives here now - there is no standalone Characters page, so the
  // shop carries a Heroes shelf alongside whatever shelves the API ships.
  if (!shelves.some(s => s.key === 'heroes')) shelves.push({ key: 'heroes', emoji: '🦸', label: 'Heroes' })
  if (!shelves.some(s => s.key === shopShelf)) shopShelf = shelves[0]?.key ?? null

  const tabs = $('#shopTabs')
  if (tabs) {
    tabs.innerHTML = shelves.map(s => `
      <button class="tab-btn${s.key === shopShelf ? ' active' : ''}" data-shelf="${attr(s.key)}" role="tab">
        ${esc(s.emoji ?? '')} ${esc(s.label)}
      </button>`).join('')
  }

  paintShopBalance()
  paintShopShelf()
}

function paintShopBalance() {
  const host = $('#shopBalance')
  if (!host) return
  const you = shopData?.you

  if (!you) {
    host.innerHTML = `<a class="btn btn-primary btn-sm" href="#/login" data-route="login">Sign in to buy</a>`
    return
  }
  host.innerHTML = `
    <div class="shop-wallet">
      <span><strong>${num(you.solars)}</strong> solars</span>
      <span class="subtext">${num(you.inventory)} / ${num(you.inventoryCap)} slots</span>
      ${you.discount ? `<span class="rarity-pill r-legendary">${num(you.discount)}% off</span>` : ''}
    </div>`
}

function shopArt(row) {
  const src = resolveArt(row?.image)
  const fallback = perkIcon('inventory')
  if (!src) return fallback
  return `<img src="${attr(src)}" alt="" loading="lazy" class="shop-img"
               data-fb="${attr(fallback)}"
               onerror="this.insertAdjacentHTML('afterend', this.dataset.fb); this.remove()">`
}

function paintShopShelf() {
  const grid = $('#shopGrid')
  if (!grid || !shopData) return

  const shelf = (shopData.shelves ?? []).find(s => s.key === shopShelf)
  if (!shelf) {
    grid.innerHTML = emptyState('inventory', 'Nothing in stock', 'The shop has no items in this category right now.')
    return
  }
  if (shelf.key === 'heroes') return paintHeroes(grid)

  const you = shopData.you
  const discount = you?.discount ?? 0
  // The API ships list price; the discount is a mod on the player, so the
  // price shown here has to match what /api/shop/buy will actually charge.
  const priceOf = (row) => Math.max(1, Math.round((row.buyPrice ?? 0) * (1 - discount / 100)))

  grid.innerHTML = shelf.groups.map(g => `
    <div class="shop-group">
      <div class="shop-group-head">${esc(g.label)}</div>
      <div class="grid-4">
        ${g.rows.map(row => {
          const price = priceOf(row)
          const locked = you && (you.level ?? 1) < (row.levelReq ?? 1)
          const bonuses = Object.entries(row.statBonuses ?? {})
            .map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}`).join(' · ')
          return `
          <div class="perk-card shop-card reveal">
            ${shopArt(row)}
            ${row.rarity ? `<span class="rarity-pill r-${attr(String(row.rarity).toLowerCase())}">${esc(titleCase(row.rarity))}</span>` : ''}
            <h4>${esc(row.name)}</h4>
            ${row.description ? `<p>${esc(row.description)}</p>` : ''}
            ${bonuses ? `<p class="subtext" style="margin-top:6px">${esc(bonuses)}</p>` : ''}
            <div class="shop-price">
              <span class="gold">${num(price)} solars${discount ? ` <s class="subtext">${num(row.buyPrice)}</s>` : ''}</span>
              ${row.levelReq > 1 ? `<span class="subtext">Lv ${num(row.levelReq)}</span>` : ''}
            </div>
            ${locked
              ? `<button class="btn btn-secondary btn-sm btn-block" disabled>Requires level ${num(row.levelReq)}</button>`
              : `<button class="btn btn-primary btn-sm btn-block" data-buy="${attr(row.id)}"
                         data-name="${attr(row.name)}" data-price="${attr(String(price))}">Buy</button>`}
          </div>`
        }).join('')}
      </div>
    </div>`).join('')
}

/** The Heroes shelf: the character roster painted as shop cards - tap one opens its kit. */
let heroList = null
async function paintHeroes(grid) {
  const want = shopShelf
  if (!heroList) {
    grid.innerHTML = skeletonCards(8)
    try {
      const chars = await api.characters()
      heroList = chars.characters ?? []
    } catch (err) {
      if (want === shopShelf) grid.innerHTML = emptyState('warning', 'Heroes unavailable', err?.message ?? '')
      return
    }
  }
  if (shopShelf !== want) return   // the player switched tabs while the roster loaded
  if (!heroList.length) {
    grid.innerHTML = emptyState('character', 'No heroes yet', 'The roster shows up here as characters unlock.')
    return
  }
  const stars = (n) => {
    const k = Math.max(1, Math.min(6, Number(n) || 1))
    return `<span class="gold-stars gs-${k}" role="img" aria-label="${k} star${k === 1 ? '' : 's'}">${'★'.repeat(k)}</span>`
  }
  grid.innerHTML = `<div class="shop-group">
      <div class="shop-group-head">Full roster · tap a hero for their kit</div>
      <div class="grid-4">${heroList.map(c => {
        const badge = c.tag ?? c.rarity
        return `
        <button type="button" class="perk-card char-card reveal" data-char="${attr(c.id)}"
                aria-label="${attr(`${c.name} details`)}">
          ${shopArt(c)}
          <div class="char-stars">${stars(c.stars)}</div>
          <h4>${esc(c.name)}</h4>
          ${badge ? `<span class="rarity-pill r-${attr(String(badge).toLowerCase())}">${esc(titleCase(badge))}</span>` : ''}
          <div class="char-status"><span class="badge ${c.owned ? 'badge-gold' : 'badge-lvl'}">${c.owned ? 'Yours' : 'View details'}</span></div>
        </button>`
      }).join('')}</div>
    </div>`
}

/** Shelf (category) tab clicked (delegated in wiring.js). */
export function selectShelf(key) {
  shopShelf = key
  for (const b of $$('#shopTabs .tab-btn')) b.classList.toggle('active', b.dataset.shelf === shopShelf)
  paintShopShelf()
}

/** Buy flow, shared by the Buy button on every shop card. */
export async function buyShopItem(id, name, price) {
  if (!isSignedIn()) return goTo('login')

  const ok = await confirmAction({
    title: `Buy ${name}?`,
    body: `This costs ${Number(price).toLocaleString()} solars and is taken from your balance immediately.`,
    confirmLabel: 'Buy it',
    danger: false,
  })
  if (!ok) return

  try {
    const out = await api.buyItem(id, 1)
    toast(`Bought ${out.bought?.name ?? name}`, 'ok')

    // Keep the page honest without a full reload: the response carries the
    // authoritative balance and slot count.
    if (shopData?.you) {
      shopData.you.solars = out.balance ?? shopData.you.solars
      shopData.you.inventory = out.inventory?.length ?? shopData.you.inventory
      paintShopBalance()
    }
    // The profile's inventory and wallet are now stale.
    invalidate('profile')
    if (out.player) state.me = out.player
  } catch (err) {
    reportError(err)
  }
}
