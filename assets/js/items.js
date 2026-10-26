/**
 * items.js - the one place an item is drawn.
 *
 * Inventory tiles, shop tiles, the item modal and the mobile inventory manager
 * all render the same shape: plate on top, name under it, a small meta line
 * last. Keeping that here means the profile grid and the manager's grid can
 * never drift apart, which is exactly what had happened before: the profile
 * showed bare squares while the shop built its own card from scratch.
 */
import { API_BASE } from './api.js'
import { esc, attr, num, titleCase, iconSvg } from './ui.js'

/**
 * Items are served by the bot itself at `<publicApiUrl>/assets/items/<id>.png`.
 *
 * If that config is ever blank the API emits a root-relative path instead, and
 * a root-relative src on this page resolves against the VERCEL SITE, which has
 * no /assets/items - so every plate 404s. Anything that isn't already absolute
 * is therefore re-based onto the API host. A dead plate is swapped for the
 * inventory glyph in place (see itemArt), never left as a hole in the card.
 */
export function resolveArt(url) {
  const s = String(url ?? '').trim()
  if (!s) return ''
  // Item plates are served by the bot itself at /assets/items/<id>.png, but the
  // catalog data still names dead hosts (play.astral.qzz.io, animeastral.qzz.io).
  // Keep the path, swap the host for the live API, or every plate 404s.
  const plate = /^(?:https?:)?\/\/[^/]+(\/assets\/items\/[^?#]+)/i.exec(s)
  if (plate) return `${API_BASE}${plate[1]}`
  if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:')) return s
  return `${API_BASE}${s.startsWith('/') ? '' : '/'}${s}`
}

/** Rarity → the accent class shared by `.item-card` / `.item-sheet`. */
export function itemAccent(rarity) {
  const key = String(rarity ?? '').trim().toLowerCase()
  if (key === 'legendary' || key === 'mythic' || key === 'exotic') return 'is-legendary'
  if (key === 'epic' || key === 'special') return 'is-epic'
  if (key === 'rare') return 'is-rare'
  return ''
}

/** Rarity/type/slot, as the one line printed under an item's name. */
export function itemMeta(item) {
  const parts = [
    item?.rarity && titleCase(item.rarity),
    item?.type && titleCase(item.type),
    item?.slot && `${titleCase(item.slot)} slot`,
  ].filter(Boolean)
  return [...new Set(parts)].join(' · ')
}

/** A stack's quantity, whichever way the API spelled it. */
export const itemQty = (item) => Number(item?.qty ?? item?.quantity ?? 0)

/**
 * The art block, shared by every tile and the modal. A missing or dead plate
 * falls back to the inventory glyph in place, so a broken image never leaves a
 * hole in the card.
 */
export function itemArt(image, cls = 'item-card-img') {
  const src = resolveArt(image)
  const fallback = `<span class="item-art-ph">${iconSvg('inventory', 'inventory-icon')}</span>`
  if (!src) return fallback
  return `<img class="${attr(cls)}" src="${attr(src)}" alt="" loading="lazy"
               data-fb="${attr(fallback)}"
               onerror="this.insertAdjacentHTML('afterend', this.dataset.fb); this.remove()">`
}

/** Plate + name header used by every item modal. */
export function itemSheetHtml(item, qty = 0) {
  const meta = itemMeta(item)
  return `
    <div class="item-sheet ${itemAccent(item?.rarity)}">
      <div class="item-sheet-art">
        ${itemArt(item?.image, 'item-sheet-img')}
        ${qty > 1 ? `<span class="item-card-qty">×${num(qty)}</span>` : ''}
      </div>
      <div class="item-sheet-head">
        ${item?.rarity ? `<span class="rarity-pill r-${attr(String(item.rarity).toLowerCase())}">${esc(titleCase(item.rarity))}</span>` : ''}
        <h3>${esc(item?.name ?? 'Item')}</h3>
        ${meta ? `<p class="item-sheet-sub">${esc(meta)}</p>` : ''}
      </div>
    </div>`
}

export function statBonusTiles(bonuses) {
  return Object.entries(bonuses ?? {})
    .map(([k, v]) => `<div class="pd-stat"><div class="pd-stat-k">${esc(String(k).toUpperCase())}</div>
      <div class="pd-stat-v">${v > 0 ? '+' : ''}${num(v)}</div></div>`)
    .join('')
}

/**
 * One item card. `attrs` is spliced onto the button, so the caller decides how
 * the tile is identified (`data-item`, `data-stack`, ...) and whether it opens
 * a detail sheet at all.
 */
export function itemCard(item, { attrs = '', qty = itemQty(item), meta = itemMeta(item) } = {}) {
  return `
    <button type="button" class="item-card ${itemAccent(item?.rarity)}"
            ${attrs} title="${attr(item?.name)}" aria-label="${attr(item?.name)}">
      <span class="item-card-art">
        ${itemArt(item?.image)}
        ${qty > 1 ? `<span class="item-card-qty">×${num(qty)}</span>` : ''}
      </span>
      <span class="item-card-name">${esc(item?.name)}</span>
      ${meta ? `<span class="item-card-sub">${esc(meta)}</span>` : ''}
    </button>`
}
