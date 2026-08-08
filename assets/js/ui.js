/**
 * ui.js — DOM helpers shared by every page controller.
 *
 * Nothing here talks to the network; it's all formatting, escaping, and the
 * small animation/feedback primitives the stylesheet expects (.reveal,
 * .toast, .is-busy, .modal.open).
 */

export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

/**
 * Escapes text before it goes anywhere near innerHTML.
 *
 * Player names, bios and titles are user-authored and arrive from the API, so
 * every interpolation of them below runs through this. Without it a player
 * called `<img onerror=…>` would run script in every visitor's browser.
 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escapes for use inside a double-quoted HTML attribute. */
export const attr = esc

export const num = (n) => Number(n ?? 0).toLocaleString()

/** 1240 → "1.2K". Mirrors how the bot abbreviates big numbers in chat. */
export function compact(n) {
  const v = Number(n ?? 0)
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + 'M'
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1) + 'K'
  return String(v)
}

export const naira = (n) => '₦' + Number(n ?? 0).toLocaleString()

/** "3h ago" / "in 2d". Past and future both read naturally. */
export function relTime(ts) {
  if (!ts) return ''
  const diff = Number(ts) - Date.now()
  const abs = Math.abs(diff)
  const units = [
    [60_000, 'min', 1_000 * 60],
    [3_600_000, 'h', 60_000 * 60],
    [86_400_000, 'd', 3_600_000 * 24],
  ]
  if (abs < 60_000) return diff < 0 ? 'just now' : 'in a moment'
  for (const [limit, label, div] of units) {
    if (abs < limit * 60 || label === 'd') {
      const v = Math.round(abs / div)
      if (label === 'd' && v > 30) break
      return diff < 0 ? `${v}${label} ago` : `in ${v}${label}`
    }
  }
  return new Date(Number(ts)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "6d 4h" — for the season countdown. */
export function duration(ms) {
  const total = Math.max(0, Math.floor(Number(ms ?? 0) / 1000))
  const d = Math.floor(total / 86_400)
  const h = Math.floor((total % 86_400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${s}s`
  return `${s}s`
}

export const titleCase = (s) =>
  String(s ?? '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

/* ───────────────────────────────── toast ───────────────────────────────── */

const toastHost = () => $('#toastWrap')

/**
 * @param {'ok'|'err'|''} kind
 */
export function toast(message, kind = '') {
  const host = toastHost()
  if (!host) return
  const el = document.createElement('div')
  el.className = `toast${kind ? ' ' + kind : ''}`
  el.innerHTML = `<span class="dot"></span><span>${esc(message)}</span>`
  host.appendChild(el)

  const remove = () => {
    el.classList.add('is-out')
    // Matches toastOut's .25s so the node leaves after the animation, not during.
    setTimeout(() => el.remove(), 260)
  }
  const timer = setTimeout(remove, kind === 'err' ? 5200 : 3600)
  el.addEventListener('click', () => { clearTimeout(timer); remove() })
}

/* ──────────────────────────── button busy state ────────────────────────── */

/**
 * Locks a button while an async action runs. Returns the unlock function.
 * Disabling matters as much as the spinner: a double-tapped "Send code"
 * burns the OTP resend cooldown and the user gets told to wait 45s.
 */
export function busy(btn) {
  if (!btn) return () => {}
  const wasDisabled = btn.disabled
  btn.classList.add('is-busy')
  btn.disabled = true
  return () => {
    btn.classList.remove('is-busy')
    btn.disabled = wasDisabled
  }
}

/* ───────────────────────────── reveal on scroll ────────────────────────── */

/*
 * There's deliberately no JS here. `.reveal` is a pure-CSS staggered fade-up
 * (see `@keyframes revealIn` and the `.reveal:nth-child(n)` delays), so
 * markup injected by a page controller animates the moment it lands in the
 * DOM. An IntersectionObserver would only duplicate that — and would leave
 * content invisible if it ever failed to fire.
 */

/* ──────────────────────────────── skeletons ────────────────────────────── */

export function skeletonRows(count = 5) {
  return Array.from({ length: count }, () => `
    <div class="skel-row">
      <div class="skel skel-line" style="width:42px"></div>
      <div class="skel skel-line" style="flex:1;max-width:190px"></div>
      <div class="skel skel-line" style="width:64px;margin-left:auto"></div>
    </div>`).join('')
}

export function skeletonCards(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="card"><div class="skel skel-line" style="width:60%"></div>
    <div class="skel skel-line" style="width:90%;margin-top:12px"></div>
    <div class="skel skel-line" style="width:40%;margin-top:8px"></div></div>`).join('')
}

export function emptyState(icon, title, body = '') {
  return `<div class="empty"><div class="empty-i">${esc(icon)}</div>
    <h3>${esc(title)}</h3>${body ? `<p>${esc(body)}</p>` : ''}</div>`
}

/* ───────────────────────────────── modal ───────────────────────────────── */

let lastFocused = null

export function openModal(html) {
  const modal = $('#modal')
  const body = $('#modalBody')
  if (!modal || !body) return
  lastFocused = document.activeElement
  body.innerHTML = html
  modal.classList.add('open')
  document.body.style.overflow = 'hidden'
  $('#modalX')?.focus()
}

export function closeModal() {
  const modal = $('#modal')
  if (!modal?.classList.contains('open')) return
  modal.classList.remove('open')
  document.body.style.overflow = ''
  lastFocused?.focus?.()
  lastFocused = null
}

/* ───────────────────────────── misc formatting ─────────────────────────── */

/** A 2-letter monogram for players with no avatar image. */
export function initials(name) {
  const parts = String(name ?? '?').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

/**
 * A labelled progress row built from astral's own `.xp-track` / `.xp-fill`.
 * The label line copies the mockup's season-challenge rows: name on the left,
 * `value / max` in `.subtext` on the right.
 */
export function bar(label, value, max) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return `
    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:6px;">
      <span>${esc(label)}</span>
      <span class="subtext">${num(value)} / ${num(max)}</span>
    </div>
    <div class="xp-track" style="margin-top:0;margin-bottom:14px;"><div class="xp-fill" style="width:${pct}%"></div></div>`
}

/** Copies text and reports it. Used by the `.cmd` pills. */
export async function copyText(text, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${label}: ${text}`, 'ok')
  } catch {
    // Clipboard API needs a secure context and can be denied outright —
    // fall back to selecting so the user can copy by hand.
    toast('Press Ctrl/Cmd+C to copy: ' + text)
  }
}
