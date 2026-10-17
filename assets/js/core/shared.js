/**
 * shared.js - helpers used by more than one screen.
 *
 * Anything a single screen owns stays in that screen; this file only holds
 * what genuinely cuts across (error reporting, /api/meta, the confirm modal,
 * art/media helpers, and the small markup builders that several pages share).
 */
import { api, API_BASE, ApiError } from '../api.js'
import { $, esc, attr, num, iconSvg, toast, openModal, closeModal } from '../ui.js'
import { state } from './state.js'

/** astral's checkmark, used in every `.plan-features` list. */
export const CHECK = '<span class="check"><svg class="icon check-icon" viewBox="0 0 24 24"><path d="M4 12l6 6L20 6" /></svg></span>'

/**
 * astral's `.perk-icon` carries its tint inline rather than in the stylesheet,
 * so every card that wants one goes through here and they all match.
 */
export const perkIcon = (name = 'spark') =>
  `<div class="perk-icon" style="background:rgb(212 175 55 / 12%);color:var(--gold);">${iconSvg(name)}</div>`

const WHATSAPP_BOT = '923375465038'
export const whatsappCommandUrl = (command) =>
  `https://wa.me/${WHATSAPP_BOT}?text=${encodeURIComponent(String(command ?? ''))}`

export function reportError(err) {
  if (err instanceof ApiError) {
    if (err.isAuth) return // onAuthLost already handled it
    toast(err.message, 'err')
  } else {
    toast('Something went wrong. Try again.', 'err')
    console.error(err)
  }
}

let metaPromise = null

/** /api/meta drives labels, class/race lists and board tabs - fetched once. */
export function ensureMeta() {
  if (state.meta) return Promise.resolve(state.meta)
  metaPromise ??= api.meta()
    .then(out => { state.meta = out; return out })
    .catch(err => { metaPromise = null; reportError(err); return null })
  return metaPromise
}

/**
 * A yes/no modal built on the existing #modal shell. Resolves true only on
 * the confirm button - closing by scrim, X or Escape resolves false, which is
 * why this listens for the modal losing `.open` rather than trusting the
 * buttons to be the only exit.
 */
export function confirmAction({ title, body, confirmLabel = 'Confirm', danger = true }) {
  return new Promise((resolve) => {
    openModal(`
      <div class="pd-body" style="padding-top:22px">
        <h3 style="margin-bottom:8px">${esc(title)}</h3>
        <p class="subtext" style="margin-bottom:20px">${esc(body)}</p>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" id="confirmYes">
          ${esc(confirmLabel)}
        </button>
        <button class="btn btn-ghost btn-block" id="confirmNo" style="margin-top:8px">Cancel</button>
      </div>`)

    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      observer.disconnect()
      resolve(value)
    }

    // Catches every dismissal path at once - scrim click, X, and Escape all
    // funnel through closeModal() removing `.open`.
    const modal = $('#modal')
    const observer = new MutationObserver(() => {
      if (!modal?.classList.contains('open')) finish(false)
    })
    if (modal) observer.observe(modal, { attributes: true, attributeFilter: ['class'] })

    $('#confirmYes')?.addEventListener('click', () => { closeModal(); finish(true) })
    $('#confirmNo')?.addEventListener('click', () => { closeModal(); finish(false) })
  })
}

export function fieldError(fieldId, errId, message) {
  const field = document.getElementById(fieldId)
  const err = document.getElementById(errId)
  if (err) err.textContent = message ?? ''
  field?.classList.toggle('has-err', !!message)
}

/** Character `ability` is { name, flavor }, not a string; printing it raw gave "[object Object]". */
export function abilityName(a) {
  if (!a) return ''
  return typeof a === 'string' ? a : String(a.name ?? '')
}

export function abilityText(a) {
  if (!a) return ''
  if (typeof a === 'string') return a
  return [a.name, a.flavor].filter(Boolean).join(': ')
}

/**
 * What a character costs, as a line of text.
 *
 * Every tile and modal used to read `gemPrice`, and every character in
 * data/characters.json carries gemPrice 0 or null - gems stopped buying
 * characters when Monds took that over. So the price line was falsy everywhere
 * and the site quoted no price at all on things that cost 🪙5, or quoted
 * "0 gems" where a truthy zero slipped through. `mondPrice` is what the bot
 * actually charges (the API runs it through the same mondPriceFor() that
 * .character buy does), and it's null for the ones Monds genuinely can't buy:
 * season characters, which have their own three routes, and unfinished stubs.
 */
export function characterPrice(c) {
  const monds = Number(c?.mondPrice)
  if (Number.isFinite(monds) && monds > 0) return `🪙${num(monds)} monds`
  if (c?.exclusive) return 'One of a kind, win it from a spin'
  if (c?.spinOnly) return 'Spin only'
  return 'Earned in game'
}

/**
 * Item artwork for a shop/inventory tile.
 *
 * Two separate bugs used to make the shop grid look glyph-only:
 *
 * 1. The path. Every plate in the bot's data/ points at
 *    `<publicApiUrl>/assets/items/<id>.png`, which the bot serves itself. If
 *    that config is ever blank the API emits a root-relative path instead, and
 *    a root-relative src on this page resolves against the VERCEL SITE, which
 *    has no /assets/items - so every plate 404s. resolveArt() re-bases
 *    anything that isn't already absolute onto the API host.
 *
 * 2. The failure mode. The old markup was `onerror="this.remove()"`, which
 *    deleted the broken <img> and put nothing in its place, so a failed plate
 *    was indistinguishable from an item that simply has no art - and there was
 *    no visual cue at all that something had gone wrong. It now swaps in the
 *    same glyph the no-art branch uses, the way the profile inventory already
 *    did (data-fb + insertAdjacentHTML).
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

/**
 * Card art, as an <img> or a <video>.
 *
 * Roughly one card in six on shoob's CDN is an animated `.webm`, which an
 * <img> can never paint - it just fires onerror and the tile loses its art.
 * Those get a muted autoplaying loop instead, which is how the card is meant
 * to look. `playsinline` keeps iOS from taking it fullscreen, and the poster
 * stays empty so nothing flashes before the first frame.
 */
export function mediaKind(url) {
  const path = String(url ?? '').split(/[?#]/)[0].toLowerCase()
  if (/\.(webm|mp4|m4v|mov)$/.test(path)) return 'video'
  if (path.endsWith('.gif')) return 'gif'
  return 'image'
}

/**
 * One element for any art: <video> for webm/mp4, <img> for gif and stills.
 * GIFs are never lazy-swapped or restyled, so they keep animating; reduced
 * motion only affects video loops. no-referrer stops hotlink-protected CDNs
 * from refusing the request.
 */
export function mediaEl(url, className, fallback = '') {
  const kind = mediaKind(url)
  const fb = attr(fallback)
  if (kind === 'video') {
    const still = document.documentElement.classList.contains('no-motion')
      || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const motionAttrs = still ? 'preload="auto"' : 'autoplay loop preload="metadata"'
    return `<video class="${attr(className)}" src="${attr(url)}" muted playsinline
                    ${motionAttrs} onerror="this.remove()"></video>`
  }
  return `<img src="${attr(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
               class="${attr(className)}" data-fb="${fb}"
               onerror="if(this.dataset.fb){this.insertAdjacentHTML('afterend',this.dataset.fb)}this.remove()">`
}

/** Fixed-ratio frame that hosts mediaEl(); data-kind lets CSS treat gif vs image. */
export function mediaFrame(url, { ratio = '3/4', className = 'media-el', fallback = '' } = {}) {
  if (!url) return `<div class="media-frame" data-kind="none" style="aspect-ratio:${attr(ratio)}">${fallback}</div>`
  return `<div class="media-frame" data-kind="${mediaKind(url)}" style="aspect-ratio:${attr(ratio)}">${mediaEl(url, className, fallback)}</div>`
}
