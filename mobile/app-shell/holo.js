/* Holo card viewer: full-screen 2:3 card with a foil shine that follows your phone's tilt (or your finger). */
import { esc } from '../js/ui.js'
import { isFav, toggleFav, keyOf } from './binder.js'
import { shareCard } from './share.js'
import * as FB from './feedback.js'

const isVid = (u) => /\.(webm|mp4|m4v|mov)(\?|#|$)/i.test(String(u ?? '').split('#')[0])
const norm = (c) => ({ title: String(c?.title ?? c?.name ?? 'Card'), tier: String(c?.tier ?? '').replace(/tier/i, '').trim(), series: c?.series && !/^none$/i.test(c.series) ? String(c.series) : '',
  imageUrl: c?.imageUrl ?? c?.image ?? '', stars: c?.stars ?? '' })

let el = null, raf = 0, off = []

export function openHolo(raw) {
  if (el) closeHolo(true)
  const c = norm(raw), tier = c.tier.toLowerCase() || '1'
  el = document.createElement('div')
  el.id = 'holo'; el.className = 'holo'; el.dataset.tier = tier
  const art = !c.imageUrl ? '<div class="holo-ph">✦</div>'
    : isVid(c.imageUrl) ? `<video class="holo-art" src="${esc(c.imageUrl)}" muted loop autoplay playsinline></video>`
    : `<img class="holo-art" src="${esc(c.imageUrl)}" alt="" referrerpolicy="no-referrer" draggable="false">`
  el.innerHTML = `
    <div class="holo-bg"></div>
    <button type="button" class="holo-x" aria-label="Close">×</button>
    <div class="holo-stage"><div class="holo-card"><div class="holo-face">${art}<i class="holo-foil"></i><i class="holo-glare"></i><i class="holo-edge"></i></div></div></div>
    <div class="holo-info">
      <span class="rarity-pill r-t${esc(tier)}">${c.tier ? `Tier ${esc(c.tier.toUpperCase())}` : 'Card'}</span>
      <h3>${esc(c.title)}</h3>${c.series ? `<p>${esc(c.series)}</p>` : ''}${c.stars ? `<div class="holo-stars">${esc(c.stars)}</div>` : ''}
    </div>
    <div class="holo-actions">
      <button type="button" class="btn btn-secondary" data-h="fav">${isFav(c) ? '♥ Favorited' : '♡ Favorite'}</button>
      <button type="button" class="btn btn-primary" data-h="share">Share image</button>
    </div>
    <p class="holo-hint">Tilt your phone or drag the card</p>`
  document.body.appendChild(el); document.body.classList.add('holo-open')
  history.pushState({ holo: 1 }, '')

  const card = el.querySelector('.holo-card'), stage = el.querySelector('.holo-stage')
  let tx = 0, ty = 0, cx = 0, cy = 0, touched = 0, tilted = 0, base = null
  const set = () => {
    card.style.setProperty('--ry', `${(cx * 17).toFixed(2)}deg`); card.style.setProperty('--rx', `${(-cy * 17).toFixed(2)}deg`)
    card.style.setProperty('--mx', `${(50 + cx * 42).toFixed(1)}%`); card.style.setProperty('--my', `${(50 + cy * 42).toFixed(1)}%`)
    card.style.setProperty('--bx', `${(50 + cx * 55).toFixed(1)}%`); card.style.setProperty('--by', `${(50 + cy * 55).toFixed(1)}%`)
  }
  const tick = (t) => {
    const now = performance.now()
    if (now - touched > 1400 && now - tilted > 400) { tx = Math.sin(t / 1900) * 0.38; ty = Math.cos(t / 2400) * 0.3 }   // idle sway
    cx += (tx - cx) * 0.14; cy += (ty - cy) * 0.14; set(); raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  const clamp = (v) => Math.max(-1, Math.min(1, v))
  const point = (e) => { const r = card.getBoundingClientRect(); tx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 1.6)); ty = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 1.6)); touched = performance.now() }
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)) }
  on(stage, 'pointerdown', (e) => { stage.setPointerCapture?.(e.pointerId); point(e) })
  on(stage, 'pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') point(e) })
  on(window, 'deviceorientation', (e) => {
    if (e.gamma == null || e.beta == null) return
    if (!base) base = { g: e.gamma, b: e.beta }
    tx = clamp((e.gamma - base.g) / 24); ty = clamp((e.beta - base.b) / 24); tilted = performance.now()
  })
  on(window, 'popstate', () => closeHolo(true))
  on(document, 'keydown', (e) => { if (e.key === 'Escape') closeHolo() })
  on(el, 'click', (e) => {
    if (e.target.closest('.holo-x') || e.target === el || e.target.classList.contains('holo-bg') || e.target === stage) return closeHolo()
    const b = e.target.closest('[data-h]'); if (!b) return
    if (b.dataset.h === 'share') shareCard({ ...c, kicker: 'Collector card' })
    if (b.dataset.h === 'fav') { const now = toggleFav(c); b.textContent = now ? '♥ Favorited' : '♡ Favorite' }
  })
  FB.pick()
  requestAnimationFrame(() => el?.classList.add('on'))
}

export function closeHolo(fromPop = false) {
  if (!el) return
  cancelAnimationFrame(raf); off.forEach(f => f()); off = []
  const node = el; el = null
  node.classList.remove('on'); document.body.classList.remove('holo-open')
  setTimeout(() => node.remove(), 200)
  if (!fromPop && history.state?.holo) history.back()
}

const cardFromTile = (t) => {
  const m = t.querySelector('img,video')
  return { imageUrl: m?.currentSrc || m?.getAttribute('src') || '', title: t.querySelector('h4')?.textContent?.trim(),
    tier: (t.querySelector('.rarity-pill')?.textContent ?? '').replace(/tier/i, '').trim(), series: t.querySelector('p')?.textContent?.trim() }
}
document.addEventListener('click', (e) => {
  const tile = e.target.closest('#cardCatalog .card-tile')
  if (tile) return openHolo(cardFromTile(tile))
  const pa = e.target.closest('.pull-art')
  if (pa) {
    const box = pa.closest('.pull-reveal'), m = pa.querySelector('img,video')
    openHolo({ imageUrl: m?.currentSrc || m?.getAttribute('src') || '', title: box?.querySelector('h3')?.textContent?.trim(),
      tier: (box?.querySelector('.rarity-pill')?.textContent ?? '').replace(/tier/i, '').trim(), series: box?.querySelector('.pd-sub')?.textContent?.trim(),
      stars: box?.querySelector('.pull-stars')?.textContent?.trim() })
  }
})
window.addEventListener('astral:open-holo', (e) => openHolo(e.detail))
export { keyOf }
