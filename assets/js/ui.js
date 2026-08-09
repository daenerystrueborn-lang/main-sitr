/**
 * ui.js — DOM helpers shared by every page controller.
 *
 * Nothing here talks to the network; it's all formatting, escaping, and the
 * small animation/feedback primitives the stylesheet expects (.reveal,
 * .toast, .is-busy, .modal.open).
 */

export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

const ICON_PATHS = {
  alert: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  battle: '<path d="m4 4 16 16M20 4 4 20"/><circle cx="12" cy="12" r="9"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  character: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0M4 4l2 2M20 4l-2 2"/>',
  chat: '<path d="M20 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 20 11.5z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1z"/>',
  dungeon: '<path d="M5 21V7l7-4 7 4v14M9 21v-5h6v5M3 21h18"/>',
  gem: '<path d="m3 9 4-5h10l4 5-9 11L3 9z"/><path d="M3 9h18M8 4l4 16 4-16"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8H8.5a2.5 2.5 0 1 1 2.2-3.7L12 8zM12 8h3.5a2.5 2.5 0 1 0-2.2-3.7L12 8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/>',
  inventory: '<path d="M4 7h16v14H4zM4 7l2-4h12l2 4M9 11h6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z"/>',
  payment: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  premium: '<path d="m12 3 2.1 5.9L20 10l-4.5 4.2L16.8 20 12 16.7 7.2 20l1.3-5.8L4 10l5.9-1.1L12 3z"/>',
  rank: '<path d="M6 20V9M12 20V4M18 20v-7M3 20h18"/>',
  reward: '<path d="m12 3 2.1 5.9L20 10l-4.5 4.2L16.8 20 12 16.7 7.2 20l1.3-5.8L4 10l5.9-1.1L12 3z"/>',
  security: '<path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
  season: '<path d="m3 20 6-8 4 5 3-4 5 7M3 20h18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.11.35.32.66.6.9.28.24.5.46.6.7"/>',
  spark: '<path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16z"/>',
  stamina: '<path d="m13 2-9 12h7l-1 8 9-12h-7l1-8z"/>',
  warning: '<path d="m12 3 9 17H3L12 3z"/><path d="M12 9v5M12 17h.01"/>',
  whatsapp: '<path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 8.5c.4 2.4 2.1 4.6 4.7 5.5l1.5-1.1 1.8.8c-.2 1-1 1.6-2 1.5-3.7-.4-6.8-3.5-7.2-7.2-.1-1 .5-1.8 1.5-2l.8 1.8-1.1 1.5z"/>',
}

/** Returns a consistent line SVG for all UI iconography. */
export function iconSvg(name = 'spark', className = 'icon') {
  const paths = ICON_PATHS[name] ?? ICON_PATHS.spark
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`
}

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
 * `.reveal` elements start hidden and animate in when they scroll into view.
 *
 * This used to be a pure-CSS animation with no JS at all, which meant every
 * .reveal on the page played its entrance during the first 600ms after load —
 * including the ones eight screens down. By the time you scrolled to them
 * they had long since finished, so the effect only ever existed for whatever
 * happened to be above the fold. Hence the observer.
 *
 * Page controllers render their markup with innerHTML long after boot, so
 * rather than making all ~15 render sites remember to re-arm, a
 * MutationObserver picks up new .reveal nodes as they land in the DOM.
 */

/**
 * True when motion should be suppressed — either the OS asked (media query)
 * or the user asked in Settings → This device, which sets `.no-motion` on
 * <html> before initMotion() runs (see applyLocalPrefs in app.js).
 */
const REDUCED = () =>
  document.documentElement.classList.contains('no-motion')
  || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Marks an element revealed, and cleans up the compositor hint afterwards. */
function show(el) {
  el.classList.add('is-in')
  setTimeout(() => el.classList.add('is-done'), 900)
}

let revealObserver = null

/**
 * Stagger index: position among the .reveal elements sharing a parent. Set as
 * --rv, which the stylesheet turns into a transition-delay. Grouping by parent
 * (rather than a global counter) is what keeps a four-card grid staggering
 * 0/1/2/3 instead of continuing from whatever number the previous section
 * ended on.
 */
function stagger(el) {
  const siblings = el.parentElement
    ? [...el.parentElement.children].filter(n => n.classList?.contains('reveal'))
    : []
  const i = siblings.indexOf(el)
  el.style.setProperty('--rv', String(Math.max(0, Math.min(i, 8))))
}

/** Arms every .reveal inside `root` that isn't already being watched. */
export function observeReveals(root = document) {
  const nodes = root.querySelectorAll?.('.reveal:not(.is-in)') ?? []
  for (const el of nodes) {
    if (el.dataset.rvArmed) continue
    el.dataset.rvArmed = '1'
    stagger(el)
    // No observer (unsupported, or reduced motion) → show it immediately.
    // A missing entrance animation is fine; invisible content is not.
    if (!revealObserver) { show(el); continue }
    revealObserver.observe(el)
  }
}

/**
 * Boots the motion layer: reveal observer, nav scroll state, and the
 * MutationObserver that keeps both working for dynamically rendered markup.
 * Safe to call once, from boot().
 */
export function initMotion() {
  const root = document.documentElement

  // `.js-motion` is the signal the inline <head> watchdog waits for. Setting
  // it first means the watchdog stands down even if something below throws.
  root.classList.add('js-motion')

  // If the watchdog already gave up and stripped `.js`, every .reveal is on
  // screen and the user is reading it. Re-adding `.js` here would yank it all
  // back to opacity 0, so don't — run the observers anyway (harmless: `is-in`
  // just has nothing to undo) and leave the page as the user found it.
  if (root.dataset.motionFailed !== '1') root.classList.add('js')

  if ('IntersectionObserver' in window && !REDUCED()) {
    revealObserver = new IntersectionObserver((entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        show(entry.target)
        obs.unobserve(entry.target)   // one-shot: no re-hiding on scroll back up
      }
    }, {
      // Starts the entrance slightly before the element's top edge arrives, so
      // it's finishing as it settles into view rather than beginning there.
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.05,
    })
  }

  observeReveals(document)

  // Nav goes from transparent-over-hero to a solid blurred bar once you've
  // left the top. rAF-throttled: scroll fires far faster than paint.
  const nav = $('.nav-shell')
  if (nav) {
    let ticking = false
    const sync = () => {
      nav.classList.toggle('is-stuck', window.scrollY > 30)
      ticking = false
    }
    addEventListener('scroll', () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(sync)
    }, { passive: true })
    sync()
  }

  // Page controllers replace whole subtrees with innerHTML; catch the new
  // .reveal nodes without every call site having to opt in.
  if ('MutationObserver' in window) {
    new MutationObserver(records => {
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1) continue
          if (node.classList?.contains('reveal')) observeReveals(node.parentElement ?? document)
          else observeReveals(node)
        }
      }
    }).observe(document.body, { childList: true, subtree: true })
  }
}

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
  return `<div class="empty"><div class="empty-i">${iconSvg(icon, 'empty-icon')}</div>
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
