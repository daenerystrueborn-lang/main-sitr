/* Share as image: draws a poster on a canvas (card, character, pull or profile) and opens the Android share sheet. */
import { API_BASE } from '../js/api.js'
import { toast } from '../js/ui.js'
import { call, can } from './native.js'
import { skipNextLock } from './lock.js'

const W = 1080, H = 1350, GOLD = '#d4af37'
let busy = false

const abs = (u) => { const s = String(u ?? '').trim(); if (!s) return ''; if (s.startsWith('assets/')) return s; return /^(https?:|data:|blob:)/i.test(s) ? s : `${API_BASE}${s.startsWith('/') ? '' : '/'}${s}` }
const isVideo = (u, type = '') => /video\//.test(type) || /\.(webm|mp4|m4v|mov)(\?|#|$)/i.test(String(u))

async function drawable(url) {
  const u = abs(url); if (!u) return null
  try {   // native HTTP in the app, so no CORS taint on the canvas
    const r = await fetch(u, { referrerPolicy: 'no-referrer' }); if (!r.ok) throw new Error('bad status')
    const b = await r.blob()
    if (isVideo(u, b.type)) {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(b)
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = no; setTimeout(no, 6000) })
      try { v.currentTime = Math.min(0.3, (v.duration || 1) / 2); await new Promise(ok => { v.onseeked = ok; setTimeout(ok, 700) }) } catch {}
      return v
    }
    return await createImageBitmap(b)
  } catch {}
  return new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.referrerPolicy = 'no-referrer'; i.onload = () => res(i); i.onerror = () => res(null); i.src = u })
}

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }
function cover(c, src, x, y, w, h) {
  const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height
  if (!sw || !sh) return
  const k = Math.max(w / sw, h / sh), dw = sw * k, dh = sh * k
  c.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}
function fit(c, text, weight, size, maxW, family = "'Space Grotesk', Inter, system-ui, sans-serif") {
  let s = size; c.font = `${weight} ${s}px ${family}`
  while (c.measureText(text).width > maxW && s > 30) { s -= 2; c.font = `${weight} ${s}px ${family}` }
}
async function fonts() {
  try { await Promise.race([Promise.all([document.fonts.load("800 64px 'Space Grotesk'"), document.fonts.load('600 34px Inter')]), new Promise(r => setTimeout(r, 1200))]) } catch {}
}
function base() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const c = cv.getContext('2d')
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#18130a'); bg.addColorStop(1, '#040404')
  c.fillStyle = bg; c.fillRect(0, 0, W, H)
  const glow = c.createRadialGradient(W / 2, 560, 40, W / 2, 560, 760); glow.addColorStop(0, 'rgba(212,175,55,.26)'); glow.addColorStop(1, 'rgba(212,175,55,0)')
  c.fillStyle = glow; c.fillRect(0, 0, W, H)
  c.strokeStyle = 'rgba(212,175,55,.35)'; c.lineWidth = 3; rr(c, 24, 24, W - 48, H - 48, 40); c.stroke()
  return { cv, c }
}
async function footer(c) {
  const sun = await drawable('assets/img/favicon.png')
  const label = 'ASTRAL'; c.font = "800 34px 'Space Grotesk', Inter, sans-serif"
  try { c.letterSpacing = '10px' } catch {}
  const tw = c.measureText(label).width, total = tw + (sun ? 74 : 0), x0 = (W - total) / 2
  if (sun) c.drawImage(sun, x0, 1262, 56, 56)
  c.fillStyle = GOLD; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(label, x0 + (sun ? 74 : 0), 1291)
  try { c.letterSpacing = '0px' } catch {}
}
function centred(c, text, y, color, weight, size, maxW = 900) {
  fit(c, text, weight, size, maxW); c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(text, W / 2, y)
}

export async function cardPoster({ kicker, title, sub, imageUrl }) {
  await fonts()
  const { cv, c } = base(), art = await drawable(imageUrl)
  const w = 640, h = 960, x = (W - w) / 2, y = 84
  c.save(); c.shadowColor = 'rgba(212,175,55,.45)'; c.shadowBlur = 70; c.fillStyle = '#111'; rr(c, x, y, w, h, 34); c.fill(); c.restore()
  c.save(); rr(c, x, y, w, h, 34); c.clip()
  const ph = c.createLinearGradient(x, y, x + w, y + h); ph.addColorStop(0, '#2a2112'); ph.addColorStop(1, '#0b0905'); c.fillStyle = ph; c.fillRect(x, y, w, h)
  if (art) cover(c, art, x, y, w, h)
  const sheen = c.createLinearGradient(x, y, x + w, y + h); sheen.addColorStop(0.25, 'rgba(255,255,255,0)'); sheen.addColorStop(0.45, 'rgba(255,255,255,.16)'); sheen.addColorStop(0.62, 'rgba(255,255,255,0)')
  c.fillStyle = sheen; c.fillRect(x, y, w, h); c.restore()
  c.strokeStyle = GOLD; c.lineWidth = 5; rr(c, x, y, w, h, 34); c.stroke()
  c.font = "800 28px 'Space Grotesk', Inter, sans-serif"; try { c.letterSpacing = '8px' } catch {}
  c.fillStyle = GOLD; c.textAlign = 'center'; c.fillText(String(kicker ?? '').toUpperCase(), W / 2 + 4, 1100)
  try { c.letterSpacing = '0px' } catch {}
  centred(c, title || 'Card', 1170, '#fff', 800, 68)
  if (sub) centred(c, sub, 1222, 'rgba(245,243,238,.7)', 600, 34)
  await footer(c)
  return cv
}

export async function profilePoster({ name, level, rank, avatar, banner, premium }) {
  await fonts()
  const { cv, c } = base(), [ban, av] = await Promise.all([drawable(banner), drawable(avatar)])
  c.save(); rr(c, 24, 24, W - 48, 430, 40); c.clip()
  const bg = c.createLinearGradient(0, 0, W, 450); bg.addColorStop(0, '#3a2c0c'); bg.addColorStop(1, '#0b0905'); c.fillStyle = bg; c.fillRect(0, 0, W, 460)
  if (ban) cover(c, ban, 24, 24, W - 48, 430)
  const fade = c.createLinearGradient(0, 240, 0, 454); fade.addColorStop(0, 'rgba(4,4,4,0)'); fade.addColorStop(1, 'rgba(4,4,4,.95)'); c.fillStyle = fade; c.fillRect(0, 240, W, 214)
  c.restore()
  const cx = W / 2, cy = 470, r = 160
  c.save(); c.shadowColor = 'rgba(212,175,55,.5)'; c.shadowBlur = 50; c.fillStyle = '#0b0905'; c.beginPath(); c.arc(cx, cy, r + 12, 0, 7); c.fill(); c.restore()
  c.save(); c.beginPath(); c.arc(cx, cy, r, 0, 7); c.clip(); c.fillStyle = '#1b1508'; c.fillRect(cx - r, cy - r, r * 2, r * 2)
  if (av) cover(c, av, cx - r, cy - r, r * 2, r * 2)
  else { c.fillStyle = GOLD; c.font = "800 130px 'Space Grotesk', sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(name ?? '?').slice(0, 1).toUpperCase(), cx, cy + 6) }
  c.restore()
  c.strokeStyle = GOLD; c.lineWidth = 8; c.beginPath(); c.arc(cx, cy, r + 4, 0, 7); c.stroke()
  centred(c, String(name ?? 'Player'), 760, '#fff', 800, 92, 940)
  const chips = [`LV ${level ?? 1}`, rank, premium ? 'PREMIUM' : ''].filter(Boolean)
  c.font = "800 34px 'Space Grotesk', Inter, sans-serif"
  const pad = 30, ws = chips.map(t => c.measureText(t).width + pad * 2), gap = 18, total = ws.reduce((a, b) => a + b, 0) + gap * (chips.length - 1)
  let x = (W - total) / 2
  chips.forEach((t, i) => {
    const hot = i === 0 || t === 'PREMIUM'
    c.fillStyle = hot ? GOLD : 'rgba(255,255,255,.08)'; rr(c, x, 810, ws[i], 70, 35); c.fill()
    if (!hot) { c.strokeStyle = 'rgba(212,175,55,.4)'; c.lineWidth = 2; rr(c, x, 810, ws[i], 70, 35); c.stroke() }
    c.fillStyle = hot ? '#0a0805' : '#f5f3ee'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, x + ws[i] / 2, 846); x += ws[i] + gap
  })
  centred(c, 'Come hunt with me on Astral', 1010, 'rgba(245,243,238,.75)', 600, 44)
  await footer(c)
  return cv
}

async function sharePng(cv, { title, text, name }) {
  const b64 = cv.toDataURL('image/png').split(',')[1]
  skipNextLock(60000)
  if (can()) {
    try {
      const f = await call('Filesystem', 'writeFile', { path: `${name}-${Date.now()}.png`, data: b64, directory: 'CACHE' })
      await call('Share', 'share', { title, text, files: [f.uri], dialogTitle: 'Share' })
      return true
    } catch (e) { if (/cancel|dismiss/i.test(String(e?.message ?? e))) return true }
  }
  try {
    const blob = await new Promise(r => cv.toBlob(r, 'image/png')), file = new File([blob], `${name}.png`, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title, text }); return true }
  } catch (e) { if (e?.name === 'AbortError') return true }
  return false
}
async function run(build, meta) {
  if (busy) return; busy = true
  toast('Making your image…')
  try { if (!(await sharePng(await build(), meta))) toast("Couldn't open sharing on this device.") }
  catch { toast("Couldn't make that image.") }
  finally { busy = false }
}

export const shareCard = (c) => run(() => cardPoster({ kicker: c.kicker ?? 'Collector card', title: c.title, imageUrl: c.imageUrl,
  sub: [c.tier && `Tier ${c.tier}`, c.series].filter(Boolean).join(' · ') }), { title: c.title, text: `${c.title} on Astral`, name: 'astral-card' })
export const shareProfile = () => {
  const p = window.__astralMe
  if (!p) return toast('Open your profile first.')
  return run(() => profilePoster({ name: p.name, level: p.level, rank: p.rank?.title, avatar: p.avatarUrl, banner: p.bannerUrl, premium: !!p.premium?.active }),
    { title: p.name, text: `${p.name} on Astral`, name: 'astral-profile' })
}

const mediaSrc = (n) => { const m = n?.querySelector?.('img,video'); return m?.currentSrc || m?.src || m?.getAttribute?.('src') || '' }
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-share]'); if (!b) return
  e.preventDefault(); e.stopPropagation()
  const kind = b.dataset.share
  if (kind === 'profile') return shareProfile()
  if (kind === 'character') {
    const card = b.closest('.cc-wrap')?.querySelector('.cc-card'); if (!card) return
    return shareCard({ kicker: 'Character', title: card.querySelector('h3')?.textContent?.trim(), imageUrl: mediaSrc(card), sub: card.querySelector('.cc-meta p')?.textContent?.trim(), tier: '' })
  }
  if (kind === 'pull') {
    const box = b.closest('.pull-reveal'); if (!box) return
    return shareCard({ kicker: 'New pull', title: box.querySelector('h3')?.textContent?.trim(), imageUrl: mediaSrc(box.querySelector('.pull-art')),
      tier: (box.querySelector('.rarity-pill')?.textContent ?? '').replace(/tier/i, '').trim(), series: box.querySelector('.pd-sub')?.textContent?.trim() })
  }
}, true)
