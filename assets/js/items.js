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
import { imgOf, cleanText, toNum } from './shape.js'

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
  // Site-owned art (the sprites that ship in this repo) must stay on this
  // origin - re-basing them onto the API host is what turned every local
  // sprite into a 404.
  if (/^\.?\/?assets\//.test(s)) return s.replace(/^\.\//, '')
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
export function itemDescription(item) {
  return cleanText(item?.description ?? item?.desc ?? item?.flavor ?? item?.flavorText, '')
}

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

/** The picture for an item record, whichever field the bot used. */
export function itemImage(item) {
  return resolveArt(imgOf(item))
}

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
        ${itemArt(itemImage(item), 'item-sheet-img')}
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
        ${itemArt(itemImage(item))}
        ${qty > 1 ? `<span class="item-card-qty">×${num(qty)}</span>` : ''}
      </span>
      <span class="item-card-name">${esc(item?.name)}</span>
      ${meta ? `<span class="item-card-sub">${esc(meta)}</span>` : ''}
    </button>`
}

/**
 * The item popup - one card, used by the profile inventory and by the mobile
 * manager.
 *
 * It used to be a naked sheet with a big plate and nothing else: no rarity, no
 * quantity, no value, and no way to act on the item. On the desktop it was
 * read-only, which is why it read as "not made".
 *
 * `actions` is the caller's markup for the buttons (the profile wires
 * use/sell/discard to the API; the manager wires equip/store/sell), so the
 * card stays one component and the behaviour stays with the page that owns it.
 */
export function itemPopupHtml(item, { qty = itemQty(item), actions = '', note = '' } = {}) {
  const bonuses = statBonusTiles(item?.statBonuses)
  const meta = itemMeta(item)
  const sellPrice = toNum(item?.sellPrice ?? item?.salePrice, null)
  const accent = itemAccent(item?.rarity)

  return `
    <div class="item-pop ${accent}">
      <div class="item-pop-hero">
        <div class="item-pop-art">
          ${itemArt(itemImage(item), 'item-pop-img')}
          ${item?.rarity ? `<span class="rarity-pill r-${attr(String(item.rarity).toLowerCase())}">${esc(titleCase(item.rarity))}</span>` : ''}
          ${qty > 1 ? `<span class="item-pop-qty">×${num(qty)}</span>` : ''}
        </div>
      </div>
      <div class="item-pop-head">
        <h3>${esc(cleanText(item?.name, 'Item'))}</h3>
        ${meta ? `<p class="item-pop-sub">${esc(meta)}</p>` : ''}
      </div>
      <div class="item-pop-body">
        ${itemDescription(item) ? `<p class="item-pop-desc">${esc(itemDescription(item))}</p>` : ''}
        ${bonuses ? `<div class="pd-sec-title">Stat bonuses</div><div class="pd-stats">${bonuses}</div>` : ''}
        ${sellPrice != null ? `<div class="item-pop-value">${iconSvg('gem', 'inline-icon')} Sells for <strong>${num(sellPrice)}</strong> solars each</div>` : ''}
        ${note}
        ${actions ? `<div class="item-pop-actions">${actions}</div>` : ''}
      </div>
    </div>`
}
