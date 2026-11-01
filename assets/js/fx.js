/**
 * fx.js — the motion layer.
 *
 * Everything animated on this site that isn't a CSS transition lives here.
 * It is a standalone ES module loaded AFTER app.js, and it talks to the page
 * only through the DOM: no page controller imports it, no page controller
 * needs to know it exists. If this file throws, the site keeps working — the
 * markup is already on screen and style.css alone is a complete design.
 *
 * The effects are vanilla ports of React Bits components (Aurora, Particles,
 * ClickSpark, SpotlightCard, Magnet, CountUp, Marquee, TiltedCard,
 * DecryptedText). react-bits itself is a React library and this is a
 * no-build, no-framework static site, so the *ideas* are re-implemented here
 * against plain DOM + canvas rather than shipping React for six effects.
 *
 * Libraries:
 *   - Lenis  (assets/vendor/lenis) — smooth scroll
 *   - GSAP   (assets/vendor/gsap)  — tweens, ScrollTrigger, SplitText, Scramble
 *
 * Ground rules, all of them learned the hard way elsewhere in this repo:
 *   1. Never leave a transform on a `.view`. It becomes a containing block
 *      and every position:fixed child inside starts scrolling with the page.
 *      Every view tween clears its props on complete.
 *   2. Never hide content in JS. Anything that starts invisible is either
 *      already invisible in CSS (with a no-JS fallback) or is animated *from*
 *      a value with `gsap.from`, which leaves the real state visible.
 *   3. Respect motion settings. `html.no-motion` (Settings → This device) and
 *      prefers-reduced-motion both shut this whole file down to "static page,
 *      no canvases, no loops".
 *   4. rAF loops are interruptible: every one of them stops when its element
 *      is off-screen, when the tab is hidden, and when motion is off.
 */

const doc = document.documentElement

/* Lite mode is decided in the <head> (index.html) before the first paint, so
 * it is already on the element by the time this module runs. It is the same
 * rule the stylesheet reads: phones, small machines, save-data and slow
 * connections get the design without the motion bill.
 *
 * Lenis is a dynamic import below rather than a top-level one for exactly
 * this reason: a static `import` would download all 33KB of it for a device
 * that will never construct it. */
const lite = doc.classList.contains('perf-lite')

/* GSAP 3.15 exposes a plain object (`typeof gsap === 'object'`), not the
 * callable it used to be. Testing `typeof === 'function'` silently disabled
 * every animation here while the page still rendered — so the check is on the
 * API surface we actually use, not on the type of the namespace. */
const hasGsap = !!window.gsap && typeof window.gsap.to === 'function'
const gsap = hasGsap ? window.gsap : null
const ScrollTrigger = hasGsap ? window.ScrollTrigger ?? null : null
const SplitText = hasGsap ? window.SplitText ?? null : null

const SELECT = {
  navBar: '.nav-bar',
  indicator: '.nav-indicator',
  thumb: '.platform-thumb',
  progress: '.scroll-progress i',
  hero: '.hero-fx',
  heroCanvas: '#heroCanvas',
  heroArt: '.hero-fx .hero-art',
}

/* Hosts that get the pointer spotlight. Every one of these is either a static
 * card in index.html or produced by a template in app.js/mobile-pages.js —
 * the list is by class, so both are covered. */
const SPOT_HOSTS = [
  '.card',
  '.perk-card',
  '.stat-pill',
  '.feature-card',
  '.plan-card',
  '.home-group-card',
  '.item-card',
  '.char-card',
  '.tier-node',
  '.auth-card',
  '.quest-row',
  '.ach-card',
  '.lb-list',
].join(',')

/* Things worth a magnetic pull and a bigger cursor ring. */
const MAGNETS = '.nav-slot, .mbar-slot, .icon-btn, .avatar-btn, .platform-tab, .hero-scroll, .brand'
const INTERACTIVE = 'a, button, [role="button"], input, select, textarea, label, summary, [data-route]'

/* ─────────────────────────────── state ───────────────────────────────── */

let lenis = null
let reduced = false
let booted = false
let lastScrollY = 0

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const lerp = (a, b, t) => a + (b - a) * t

/* ──────────────────── pointer, once per frame ────────────────────────── */

/* Five effects care where the pointer is (hero parallax, card spotlight,
 * tilt, magnet, cursor ring). Each one used to own a `pointermove` listener
 * that called closest() and getBoundingClientRect() the moment the event
 * arrived — so a single mouse move over a card did five layout reads, five
 * times, before the browser could paint.
 *
 * Now there is one listener and one rAF: the event is stored, and when the
 * frame comes every effect reads the same event once. Same effects, one
 * measurement each per frame instead of five per event.
 */
const pointerFns = []
let pointerEvt = null
let pointerQueued = 0

/** Registers `fn(event)` to run at most once per animation frame. */
function onPointerFrame(fn) {
  pointerFns.push(fn)
}

function bootPointerBus() {
  if (!pointerFns.length) return
  window.addEventListener('pointermove', (e) => {
    pointerEvt = e
    if (pointerQueued) return
    pointerQueued = requestAnimationFrame(() => {
      pointerQueued = 0
      const ev = pointerEvt
      for (const fn of pointerFns) {
        try { fn(ev) } catch (err) { console.warn('[fx] pointer', err) }
      }
    })
  }, { passive: true })
}

/** Same rule the reveal observer in ui.js uses: OS setting or the site toggle. */
function motionOff() {
  return (
    doc.classList.contains('no-motion') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   1. SMOOTH SCROLL (Lenis)
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

async function initLenis() {
  // Reduced motion means native scrolling, full stop. Lenis' whole job is to
  // interpolate the scroll position, which is exactly the thing being asked
  // not to happen - and in lite mode the smooth scroll itself is the thing
  // being dropped: it re-writes the scroll position on every frame, on the
  // main thread, on the devices with the least to spare.
  if (reduced || lite) return

  let Lenis = null
  try {
    Lenis = (await import('../vendor/lenis/lenis.mjs')).default
  } catch (err) {
    console.warn('[fx] lenis import', err)
    return
  }
  if (!Lenis) return

  lenis = new Lenis({
    lerp: 0.09,
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
    smoothWheel: true,
    syncTouch: false,     // phones keep their own momentum; this fights it
    autoRaf: false,       // driven by GSAP's ticker, which is already running
  })

  function raf(time) {
    lenis?.raf(time * 1000)
  }

  if (gsap) {
    // One clock for everything: Lenis steps inside GSAP's ticker, and
    // ScrollTrigger reads the position Lenis just wrote.
    if (ScrollTrigger) lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
  } else {
    let prev = performance.now()
    const loop = (now) => {
      raf((now - prev) / 1000)
      prev = now
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  // Nothing else to do about native scrolls: Lenis listens for them itself
  // (onNativeScroll resyncs animatedScroll when it isn't the one scrolling),
  // which is what makes app.js's window.scrollTo on route change safe.
}

/** Stops page scrolling while an overlay is open.
 *
 * Lenis when it exists, and a plain CSS `overflow:hidden` when it doesn't -
 * lite mode has no Lenis at all, and without the fallback a drawer or modal
 * would sit over a page that still scrolled underneath it. */
function lockScroll(locked) {
  if (lenis) {
    locked ? lenis.stop() : lenis.start()
    return
  }
  doc.classList.toggle('scroll-locked', locked)
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   2. HERO CANVAS — Aurora + Particles
   One canvas, two effects, one rAF loop.

   Aurora: five soft radial blobs on an additive blend, each drifting on its
   own sine so the light never repeats. Particles: gold dust rising slowly
   through it. The backing store runs at 55% of the CSS size (see SCALE
   below) — soft light survives the upscale, and the fill rate drops to a
   third of what a full-DPR canvas would cost.

   The loop is tied to IntersectionObserver + visibilitychange: on a long
   page it costs nothing while you're reading the shop.
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initHeroCanvas() {
  const canvas = document.querySelector(SELECT.heroCanvas)
  if (!canvas || !canvas.getContext) return

  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) return

  const DUST = window.innerWidth < 700 ? 22 : 48
  const BLOBS = [
    { x: 0.28, y: 0.34, r: 0.46, a: 0.30, sp: 0.00022, ph: 0.0, rgb: '212,175,55' },
    { x: 0.68, y: 0.28, r: 0.38, a: 0.26, sp: 0.00031, ph: 1.7, rgb: '255,226,150' },
    { x: 0.5, y: 0.62, r: 0.52, a: 0.18, sp: 0.00017, ph: 3.1, rgb: '212,175,55' },
    { x: 0.16, y: 0.7, r: 0.30, a: 0.20, sp: 0.00027, ph: 4.4, rgb: '255,200,96' },
    { x: 0.84, y: 0.66, r: 0.34, a: 0.16, sp: 0.00021, ph: 5.6, rgb: '255,236,180' },
  ]

  /* The canvas is deliberately under-sampled: drawn at 55% of its CSS size
   and stretched by the browser. Aurora light is gradient mush, so nothing is
   lost, and fill cost drops by ~3.3x — this is the single most expensive
   thing on the page and it sits behind every other layer. */
  const SCALE = 0.5
  const FPS_CAP = 34          // ms between paints; ~30fps, plenty for drift

  /* Both effects are baked into tiny offscreen sprites once, at load, and
     drawn with drawImage from then on.

     The old path called createRadialGradient() five times per frame for the
     blobs and built an arc+fill for every dust particle — 150+ new gradient
     objects a second, each rasterised from scratch, for five gradients that
     never changed. This is the difference between a canvas that costs a few
     percent of a core and one that shows up in a battery report. */
  const SPRITE = 256

  function bakeBlob(b) {
    const c = document.createElement('canvas')
    c.width = c.height = SPRITE
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2)
    grad.addColorStop(0, `rgba(${b.rgb},${b.a})`)
    grad.addColorStop(0.45, `rgba(${b.rgb},${b.a * 0.34})`)
    grad.addColorStop(1, `rgba(${b.rgb},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, SPRITE, SPRITE)
    return c
  }

  const BLOB_SPRITES = BLOBS.map(bakeBlob)

  const DUST_SPRITE = (() => {
    const size = 24
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, 'rgba(246,227,166,1)')
    grad.addColorStop(0.5, 'rgba(246,227,166,.55)')
    grad.addColorStop(1, 'rgba(246,227,166,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    return c
  })()

  let w = 0
  let h = 0
  let dust = []
  let lastPaint = 0
  let rafId = 0
  let running = false
  let visible = true
  let t0 = performance.now()
  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    w = rect.width
    h = rect.height
    canvas.width = Math.max(1, Math.round(w * SCALE))
    canvas.height = Math.max(1, Math.round(h * SCALE))
    // Draw in CSS pixels; the transform handles the down-sample.
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)

    dust = Array.from({ length: DUST }, (_, i) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.6 + Math.random() * 1.5,
      vy: -(0.08 + Math.random() * 0.28),
      vx: (Math.random() - 0.5) * 0.12,
      a: 0.10 + Math.random() * 0.45,
      ph: Math.random() * Math.PI * 2,
      sp: 0.0008 + Math.random() * 0.0016,
      seed: i,
    }))
  }

  function drawStatic() {
    // One frame, fully drawn, for reduced-motion users: the hero still gets
    // its light, it just doesn't move.
    ctx.clearRect(0, 0, w, h)
    paintBlobs(0, true)
    paintDust(0, true)
  }

  function paintBlobs(time, still) {
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < BLOBS.length; i++) {
      const b = BLOBS[i]
      const drift = still ? 0 : time
      const cx = (b.x + Math.sin(drift * b.sp + b.ph) * 0.045 + (pointer.x - 0.5) * 0.03) * w
      const cy = (b.y + Math.cos(drift * b.sp * 1.3 + b.ph) * 0.05 + (pointer.y - 0.5) * 0.02) * h
      const rad = b.r * Math.max(w, h) * (0.92 + Math.sin(drift * b.sp * 0.8 + b.ph) * 0.08)
      ctx.drawImage(BLOB_SPRITES[i], cx - rad, cy - rad, rad * 2, rad * 2)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  function paintDust(time, still) {
    for (const p of dust) {
      if (!still) {
        p.y += p.vy
        p.x += p.vx
        if (p.y < -6) {
          p.y = h + 6
          p.x = Math.random() * w
        }
        if (p.x < -6) p.x = w + 6
        if (p.x > w + 6) p.x = -6
      }
      const twinkle = still ? 0.7 : 0.55 + Math.sin(time * p.sp + p.ph) * 0.45
      const size = p.r * 4
      ctx.globalAlpha = Math.min(1, p.a * twinkle * 2)
      ctx.drawImage(DUST_SPRITE, p.x - size / 2, p.y - size / 2, size, size)
    }
    ctx.globalAlpha = 1
  }

  function frame(now) {
    rafId = 0
    if (!running) return
    if (visible && now - lastPaint >= FPS_CAP) {
      lastPaint = now
      const time = now - t0
      pointer.x = lerp(pointer.x, pointer.tx, 0.05)
      pointer.y = lerp(pointer.y, pointer.ty, 0.05)
      ctx.clearRect(0, 0, w, h)
      paintBlobs(time, false)
      paintDust(time, false)
    }
    rafId = requestAnimationFrame(frame)
  }

  function start() {
    if (running) return
    running = true
    if (!rafId) rafId = requestAnimationFrame(frame)
  }

  function stop() {
    running = false
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
  }

  resize()

  /* Lite mode keeps the light but stops the clock: one frame, drawn once and
     redrawn only when the box actually changes size. The aurora is soft light
     drifting a few pixels - at rest nobody can tell it from the animation, and
     it no longer costs a rAF callback for the length of the visit. */
  if (reduced || lite) {
    drawStatic()
    // Still redraw on resize so the still frame never stretches.
    let rt = 0
    window.addEventListener('resize', () => {
      clearTimeout(rt)
      rt = setTimeout(() => { resize(); drawStatic() }, 180)
    }, { passive: true })
    // A hero that booted inside a hidden view (a deep link to another route)
    // has nothing to measure, so the frame above drew into a 0x0 box. Draw it
    // for real the first time it is actually on screen.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting || w) return
        resize()
        drawStatic()
      }, { threshold: 0 }).observe(canvas)
    }
    return
  }

  start()

  // Pause when the hero is off screen (scrolled past) or the tab is hidden.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      // A view that booted hidden has no measurable size; measure it the
      // first time it's actually on screen.
      if (visible && !w) { resize(); if (reduced) drawStatic() }
    }, { threshold: 0 }).observe(canvas)
  }
  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : start()
  })

  window.addEventListener('resize', () => {
    clearTimeout(resize._t)
    resize._t = setTimeout(resize, 180)
  }, { passive: true })

  // One pointer subscriber drives both the blob parallax and the CSS
  // spotlight, on the shared frame bus (see onPointerFrame).
  const hero = canvas.closest('.hero-fx')
  onPointerFrame((e) => {
    pointer.tx = e.clientX / window.innerWidth
    pointer.ty = e.clientY / window.innerHeight
    if (!hero) return
    const r = hero.getBoundingClientRect()
    if (!r.height) return
    hero.classList.add('is-pointer')
    hero.style.setProperty('--hx', `${e.clientX - r.left}px`)
    hero.style.setProperty('--hy', `${e.clientY - r.top}px`)
  })
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   3. HERO INTRO
   The one place the site allows itself a choreographed entrance: the photo
   resolves, the aurora fades up, then the headline lifts out line by line,
   then the controls follow.
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initHeroIntro() {
  if (!gsap || !document.querySelector(SELECT.hero)) return

  const words = document.querySelectorAll('.hero-title .ht-word')
  const others = document.querySelectorAll(
    '.hero-fx .hero-kicker, .hero-fx .platform-switch, #heroSub, .hero-actions, .hero-trust, #heroChips, .hero-scroll'
  )

  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })

  tl.from('.hero-fx .hero-art', { scale: 1.22, opacity: 0, duration: 1.7, ease: 'power2.out' }, 0)
    .from('.hero-fx .hero-canvas', { opacity: 0, duration: 1.4 }, 0.15)
    .from('.hero-fx .hero-veil', { opacity: 0, duration: 1.1 }, 0.1)

  if (words.length) {
    tl.from(words, {
      yPercent: 118,
      rotate: 2.5,
      duration: 1.15,
      stagger: 0.075,
    }, 0.35)
  }

  if (others.length) {
    // `from` and not `fromTo`: if the tween is interrupted the elements are
    // left at their natural, visible styles.
    tl.from(others, { y: 22, opacity: 0, duration: 0.9, stagger: 0.07 }, 0.72)
  }

  // The marquee starts as the hero finishes settling, not with the page.
  tl.from('.hero-marquee', { opacity: 0, duration: 0.8 }, 1.1)

  // The per-line masks are only needed while the words are travelling. Left
  // on, `overflow:hidden` on a line box shorter than its glyphs would clip
  // descenders in "your"/"legend" at rest.
  tl.eventCallback('onComplete', () => {
    for (const line of document.querySelectorAll('.hero-title .ht-line')) {
      line.style.overflow = 'visible'
      line.style.paddingBottom = '0'
      line.style.marginBottom = '0'
    }
  })
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   4. NAV — sliding indicator, hide-on-scroll-down
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initNav() {
  const bar = document.querySelector(SELECT.navBar)
  const indicator = document.querySelector(SELECT.indicator)
  if (!bar || !indicator) return

  // `last` memoises the geometry. This function is called from a
  // MutationObserver that watches this very subtree, and `classList.add()`
  // rewrites the class *attribute* even when the class is already present —
  // so an unguarded write re-fires the observer, which calls place(), which
  // writes again. That is an infinite microtask loop that hard-freezes the
  // tab. Never write unless something actually changed.
  let last = ''
  let visible = null

  function place(instant = false) {
    const active = bar.querySelector('.nav-slot.is-active')
    if (!active || !active.offsetWidth) {
      if (visible !== false) {
        visible = false
        indicator.classList.remove('is-on')
      }
      return
    }
    const barRect = bar.getBoundingClientRect()
    const r = active.getBoundingClientRect()
    const x = Math.round(r.left - barRect.left)
    const w = Math.round(r.width)
    const key = `${x}:${w}`
    if (key === last && visible === true) return
    last = key
    if (visible !== true) {
      visible = true
      indicator.classList.add('is-on')
    }
    if (gsap && !instant) {
      gsap.to(indicator, { x, width: w, duration: 0.55, ease: 'power3.out', overwrite: 'auto' })
    } else {
      indicator.style.transform = `translateX(${x}px)`
      indicator.style.width = `${w}px`
    }
  }

  place(true)

  // app.js swaps `.is-active` between slots; that class flip is the only
  // notification we get, so watch the attribute rather than re-implementing
  // routing here.
  if ('MutationObserver' in window) {
    let queued = false
    new MutationObserver(() => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => { queued = false; place() })
    }).observe(bar, { subtree: true, attributes: true, attributeFilter: ['class'] })
  }

  window.addEventListener('resize', () => place(true), { passive: true })

  // Hide the floating nav while scrolling down, bring it back the moment the
  // pointer moves up. Thresholds stop a trackpad's jitter from flickering it.
  const shell = document.querySelector('.nav-shell')
  if (shell) {
    let acc = 0
    const update = (y) => {
      const dy = y - lastScrollY
      lastScrollY = y
      if (y < 140) {              // near the top: always visible
        shell.classList.remove('is-hidden')
        acc = 0
        return
      }
      // Accumulate in the direction of travel; one flick down shouldn't hide
      // the nav, a deliberate scroll should.
      acc = dy > 0 ? Math.max(0, acc + dy) : Math.min(0, acc + dy)
      if (acc > 70) shell.classList.add('is-hidden')
      else if (acc < -12) shell.classList.remove('is-hidden')
    }
    if (lenis) lenis.on('scroll', ({ scroll }) => update(scroll))
    else window.addEventListener('scroll', () => update(window.scrollY), { passive: true })
  }
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   5. PLATFORM SWITCH — sliding thumb
   app.js owns the copy swap and the `.is-active` class; this only moves the
   gold thumb underneath it.
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initPlatformThumb() {
  const wrap = document.querySelector('#platformSwitch')
  const thumb = document.querySelector(SELECT.thumb)
  if (!wrap || !thumb) return

  // Same memoisation as the nav indicator, for the same reason: this observes
  // the subtree it writes to, and `classList.add()` rewrites the attribute
  // even when the class is already there. Unguarded, that is an infinite
  // MutationObserver loop (and a frozen tab).
  let last = ''
  let visible = null

  function place() {
    const active = wrap.querySelector('.platform-tab.is-active')
    if (!active || !active.offsetWidth) {
      if (visible !== false) {
        visible = false
        thumb.classList.remove('is-on')
      }
      return
    }
    const wrapRect = wrap.getBoundingClientRect()
    const r = active.getBoundingClientRect()
    const x = Math.round(r.left - wrapRect.left)
    const w = Math.round(r.width)
    const key = `${x}:${w}`
    if (key === last && visible === true) return
    last = key
    if (visible !== true) {
      visible = true
      thumb.classList.add('is-on')
    }
    thumb.style.width = `${w}px`
    thumb.style.transform = `translateX(${x}px)`
  }

  // One frame after paint: the tabs must have been laid out before measuring.
  requestAnimationFrame(place)
  window.addEventListener('resize', place, { passive: true })
  if ('MutationObserver' in window) {
    new MutationObserver(place).observe(wrap, { subtree: true, attributes: true, attributeFilter: ['class'] })
  }
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   6. SPOTLIGHT CARDS
   A radial highlight that follows the pointer inside a card. One delegated
   listener for the whole document; the span is created lazily on first
   hover, so an 80-card shop page costs one element per card *seen*.
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initSpotlight() {
  if (reduced || lite || window.matchMedia('(hover: none)').matches) return

  let host = null
  let px = 0
  let py = 0

  function arm(el) {
    if (el.dataset.fxSpot === '1') return
    el.dataset.fxSpot = '1'
    el.classList.add('fx-spot-host')
    const spot = document.createElement('span')
    spot.className = 'fx-spot'
    spot.setAttribute('aria-hidden', 'true')
    el.appendChild(spot)
  }

  onPointerFrame((e) => {
    const el = e.target?.closest?.(SPOT_HOSTS)
    if (el !== host) host = el
    if (!host) return
    arm(host)
    const r = host.getBoundingClientRect()
    px = e.clientX - r.left
    py = e.clientY - r.top
    host.style.setProperty('--mx', `${px}px`)
    host.style.setProperty('--my', `${py}px`)
  })

  document.addEventListener('pointerleave', () => { host = null }, { passive: true })
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   7. TILTED CARDS
   Three degrees of rotation on the four mode tiles. Deliberately small: past
   about 8° the artwork looks like it's falling off the page.
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initTilt() {
  if (!gsap || reduced || lite || window.matchMedia('(hover: none)').matches) return
  // Touch screens and reduced-motion users get no tilt at all, which also
  // means no inline transform is ever left behind for CSS to fight.
  const MAX = 5.5

  /* quickTo reuses one tween per card instead of allocating a new one for
   * every pointer event — with `overwrite: 'auto'` the old version was
   * building and killing a tween per mouse move, which is garbage for the
   * GC on exactly the long pages that have four of these cards. */
  const setters = new WeakMap()

  function tiltFor(card) {
    let s = setters.get(card)
    if (!s) {
      s = {
        rx: gsap.quickTo(card, 'rotateX', { duration: 0.5, ease: 'power3.out' }),
        ry: gsap.quickTo(card, 'rotateY', { duration: 0.5, ease: 'power3.out' }),
        y: gsap.quickTo(card, 'y', { duration: 0.5, ease: 'power3.out' }),
      }
      /* `transformPerspective`, not the CSS `perspective` property: GSAP
       * injects this one into the element's own transform, which is what an
       * element rotating in place needs. The CSS property applies to the
       * element's *children* and would have done nothing here. */
      gsap.set(card, { transformPerspective: 1100, transformOrigin: 'center' })
      setters.set(card, s)
    }
    return s
  }

  onPointerFrame((e) => {
    const card = e.target?.closest?.('.feature-card')
    if (!card) return
    const r = card.getBoundingClientRect()
    if (!r.width || !r.height) return
    const dx = (e.clientX - r.left) / r.width - 0.5
    const dy = (e.clientY - r.top) / r.height - 0.5
    const s = tiltFor(card)
    s.ry(dx * MAX * 2)
    s.rx(-dy * MAX * 2)
    s.y(-6)                 // the card lifts towards the pointer
  })

  document.addEventListener('pointerout', (e) => {
    const card = e.target?.closest?.('.feature-card')
    if (!card) return
    if (card.contains(e.relatedTarget)) return
    gsap.to(card, { rotateX: 0, rotateY: 0, y: 0, duration: 0.8, ease: 'elastic.out(1,0.55)', overwrite: 'auto' })
  }, { passive: true })
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   8. MAGNET
   Interactive chrome leans towards the pointer, then springs home. Only the
   nav + dock + brand — buttons keep their own press animation instead.
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initMagnet() {
  if (!gsap || reduced || lite || window.matchMedia('(hover: none)').matches) return
  const PULL = 0.28
  const RADIUS = 26

  const setters = new WeakMap()
  function magnetFor(el) {
    let s = setters.get(el)
    if (!s) {
      s = {
        x: gsap.quickTo(el, 'x', { duration: 0.55, ease: 'power3.out' }),
        y: gsap.quickTo(el, 'y', { duration: 0.55, ease: 'power3.out' }),
      }
      setters.set(el, s)
    }
    return s
  }

  onPointerFrame((e) => {
    const el = e.target?.closest?.(MAGNETS)
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const s = magnetFor(el)
    s.x(clamp(dx * PULL, -RADIUS, RADIUS))
    s.y(clamp(dy * PULL, -RADIUS / 2, RADIUS / 2))
  })

  document.addEventListener('pointerout', (e) => {
    const el = e.target?.closest?.(MAGNETS)
    if (!el) return
    if (el.contains(e.relatedTarget)) return
    gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1,0.4)', overwrite: 'auto' })
  }, { passive: true })
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   9. COUNT UP
   Numbers that arrive by counting. Only ever animates *up from zero*, and
   always ends on the exact string the page rendered — if anything about the
   parse is off, the original text stays.
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function countUp(el) {
  if (!gsap || el.dataset.counted === '1') return
  // Only leaf elements. `.plan-price` for instance is "₦2,000<span>/ 30d</span>",
  // and writing textContent there would delete the span.
  if (el.children.length) return
  const raw = (el.textContent || '').trim()
  const match = raw.match(/-?\d[\d,]*(\.\d+)?/)
  if (!match) return

  const numeric = Number(match[0].replace(/,/g, ''))
  if (!Number.isFinite(numeric) || numeric < 10) return

  const prefix = raw.slice(0, match.index)
  const suffix = raw.slice(match.index + match[0].length)
  const decimals = match[1] ? match[1].length - 1 : 0
  const sep = match[0].includes(',')

  el.dataset.counted = '1'
  const box = { v: 0 }
  gsap.to(box, {
    v: numeric,
    duration: 1.5,
    ease: 'power2.out',
    onStart() {
      el.textContent = prefix + (0).toFixed(decimals) + suffix
    },
    onUpdate() {
      let n = decimals ? box.v.toFixed(decimals) : String(Math.round(box.v))
      if (sep) {
        const [int, frac] = n.split('.')
        n = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '')
      }
      el.textContent = prefix + n + suffix
    },
  })
}

function initCounters() {
  if (!gsap || lite || !('IntersectionObserver' in window)) return

  const found = new WeakSet()
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      io.unobserve(entry.target)
      countUp(entry.target)
    }
  }, { threshold: 0.4 })

  function scan(root = document) {
    const nodes = root.querySelectorAll?.('.stat-pill .value, .plan-price, .pd-stat-v') ?? []
    for (const el of nodes) {
      if (found.has(el)) continue
      found.add(el)
      io.observe(el)
    }
  }

  scan()

  // The stat pills are rendered by app.js after /api/stats resolves.
  if ('MutationObserver' in window) {
    new MutationObserver((records) => {
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (node.nodeType === 1) scan(node)
        }
      }
    }).observe(document.body, { childList: true, subtree: true })
  }
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   10. MARQUEE
   Endless band under the hero, sped up by how fast the page is scrolling.
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

/* The marquee is a CSS animation now — `.mq-track` in redesign.css §7. It
 * used to be a GSAP tween with `repeat: -1`, which meant GSAP's ticker held a
 * rAF callback open for as long as the tab was on screen, writing a new
 * transform 60 times a second on the main thread, forever. The compositor
 * does the same job off the main thread and for free. The scroll-velocity
 * flourish that went with it needed a per-scroll callback to do it; the band
 * is decorative, so it now just runs. */

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   11. SCROLL PROGRESS
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initProgress() {
  const bar = document.querySelector(SELECT.progress)
  if (!bar) return

  const paint = (y) => {
    const max = doc.scrollHeight - window.innerHeight
    const p = max > 0 ? clamp(y / max, 0, 1) : 0
    bar.style.transform = `scaleX(${p})`
  }

  if (lenis) lenis.on('scroll', ({ scroll }) => paint(scroll))
  else window.addEventListener('scroll', () => paint(window.scrollY), { passive: true })

  paint(window.scrollY)
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   12. SCROLL EFFECTS — parallax, heading rises, page reveal
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initScrollEffects() {
  if (!gsap || !ScrollTrigger || lite) return

  gsap.registerPlugin(ScrollTrigger)

  // Hero parallax. The art is oversized 12% in CSS so drifting it by 16%
  // never exposes an edge.
  if (document.querySelector(SELECT.heroArt)) {
    gsap.to(SELECT.heroArt, {
      yPercent: 16,
      ease: 'none',
      scrollTrigger: {
        trigger: SELECT.hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    })

    // The copy lifts and fades a little faster than the photo: the classic
    // two-plane parallax that makes a hero feel like it has depth.
    gsap.to('#view-home .hero .hero-inner', {
      yPercent: -14,
      opacity: 0.15,
      ease: 'none',
      scrollTrigger: {
        trigger: SELECT.hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    })
  }

  // Section headings rise once. Only headings that are static in the markup —
  // anything app.js re-renders gets the plain .reveal treatment instead, so
  // this can never leave a heading stuck mid-animation.
  const headings = document.querySelectorAll('#view-home .section-head h2')
  for (const h of headings) {
    let lines = [h]
    if (SplitText) {
      try {
        lines = new SplitText(h, { type: 'lines', linesClass: 'fx-line' }).lines
      } catch {
        lines = [h]
      }
    }
    gsap.from(lines, {
      y: 30,
      opacity: 0,
      duration: 0.9,
      stagger: 0.08,
      ease: 'power3.out',
      scrollTrigger: { trigger: h, start: 'top 88%', once: true },
    })
  }

  // Gold rules draw themselves in above each section heading group.
  gsap.utils.toArray('#view-home .section-kicker').forEach((k) => {
    gsap.from(k, {
      opacity: 0,
      x: -14,
      duration: 0.7,
      ease: 'power3.out',
      scrollTrigger: { trigger: k, start: 'top 92%', once: true },
    })
  })

  ScrollTrigger.refresh()
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   13. PAGE TRANSITIONS
   app.js swaps `.view.active`; this fades the incoming view in. Everything
   it sets is cleared on complete (see ground rule #1).
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initPageTransitions() {
  // No GSAP in lite mode: `html.perf-lite .view.active` in redesign.css §15
  // supplies a short CSS fade instead, which is all a view swap needs.
  if (!gsap || lite) return
  const views = [...document.querySelectorAll('.view')]
  if (!views.length) return

  let currentView = document.querySelector('.view.active')
  let first = true

  const show = (view) => {
    if (!view) return
    if (reduced) {
      gsap.set(view, { clearProps: 'all' })
      return
    }
    gsap.fromTo(
      view,
      { opacity: 0, y: 18 },
      {
        opacity: 1,
        y: 0,
        duration: first ? 0.75 : 0.5,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
        onComplete() {
          // Ground rule #1 again: a leftover transform turns this element
          // into a containing block and un-fixes its fixed children.
          view.style.transform = ''
        },
      }
    )
    first = false
  }

  show(currentView)

  if ('MutationObserver' in window) {
    const obs = new MutationObserver(() => {
      const active = document.querySelector('.view.active')
      if (!active || active === currentView) return
      currentView = active
      show(active)
      // Triggers were measured against a hidden view; re-measure.
      requestAnimationFrame(() => ScrollTrigger?.refresh())
    })
    for (const v of views) obs.observe(v, { attributes: true, attributeFilter: ['class'] })
  }
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   14. CURSOR — a gold dot with a lagging ring
   Decoration only: the real cursor is never hidden, so this can't strand
   anyone without a pointer.
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initCursor() {
  if (reduced || lite || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

  const root = document.querySelector('.fx-cursor')
  const dot = root?.querySelector('.fx-cursor-dot')
  const ring = root?.querySelector('.fx-cursor-ring')
  if (!root || !dot || !ring) return

  let mx = window.innerWidth / 2
  let my = window.innerHeight / 2
  let rx = mx
  let ry = my
  let seen = false
  let raf = 0

  const tick = () => {
    raf = 0
    rx = lerp(rx, mx, 0.16)
    ry = lerp(ry, my, 0.16)
    dot.style.transform = `translate3d(${mx}px,${my}px,0)`
    ring.style.transform = `translate3d(${rx}px,${ry}px,0)`
    // Keep easing while the ring is still catching up, then stop the loop —
    // an idle page should not be burning a frame callback for a cursor.
    if (Math.abs(rx - mx) > 0.2 || Math.abs(ry - my) > 0.2) raf = requestAnimationFrame(tick)
  }

  const kick = () => { if (!raf) raf = requestAnimationFrame(tick) }

  window.addEventListener('pointermove', (e) => {
    mx = e.clientX
    my = e.clientY
    if (!seen) {
      seen = true
      rx = mx
      ry = my
      root.style.opacity = '1'
    }
    root.classList.toggle('is-over', !!e.target?.closest?.(INTERACTIVE))
    kick()
  }, { passive: true })

  window.addEventListener('pointerdown', () => root.classList.add('is-down'), { passive: true })
  window.addEventListener('pointerup', () => root.classList.remove('is-down'), { passive: true })
  document.addEventListener('pointerleave', () => root.classList.remove('is-over'), { passive: true })
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   15. CLICK SPARK
   A short burst of gold at the point of contact. The rAF loop only exists
   while there are sparks in flight.
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

function initClickSpark() {
  const canvas = document.querySelector('.fx-spark')
  if (!canvas || reduced || lite || !canvas.getContext) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  let sparks = []
  let raf = 0
  let sized = false

  /* Backing store allocated on the first click, not at boot.
   *
   * A full-viewport canvas at a 2x device pixel ratio is ~20MB of pixels on a
   * 1440x900 screen, and it sat there empty for the whole visit in case
   * someone clicked once. Nothing is drawn before that first click, so
   * nothing needs the pixels until then. 1.5x rather than 2x for the same
   * reason: these are 1px motion-blur streaks, and the difference is not
   * visible on a line that is 0.9px wide.
   */
  const size = () => {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 1.5)
    canvas.width = Math.round(window.innerWidth * dpr)
    canvas.height = Math.round(window.innerHeight * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    sized = true
  }
  window.addEventListener('resize', () => { if (sized) size() }, { passive: true })

  function frame() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    sparks = sparks.filter((s) => s.life > 0)
    for (const s of sparks) {
      s.life -= 1
      s.x += s.vx
      s.y += s.vy
      s.vx *= 0.96
      s.vy = s.vy * 0.96 + 0.05   // a touch of gravity
      const a = Math.max(0, s.life / s.max) ** 1.6
      ctx.strokeStyle = `rgba(246,227,166,${a * 0.9})`
      ctx.lineWidth = s.w
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(s.x - s.vx * 2.6, s.y - s.vy * 2.6)
      ctx.stroke()
    }
    raf = sparks.length ? requestAnimationFrame(frame) : 0
  }

  window.addEventListener('pointerdown', (e) => {
    if (!sized) size()
    const n = 9
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.5
      const speed = 1.6 + Math.random() * 2.6
      const max = 18 + Math.random() * 12
      sparks.push({
        x: e.clientX,
        y: e.clientY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: max,
        max,
        w: 0.7 + Math.random() * 1.1,
      })
    }
    if (!raf) raf = requestAnimationFrame(frame)
  }, { passive: true })
}

/* ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙
   16. SMALL THINGS
   ⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙⊙ */

/** Keeps Lenis out of the way while a dialog owns the screen. */
function initOverlayLock() {
  const targets = ['#modal', '.drawer', '.panel']
  if ('MutationObserver' in window) {
    const obs = new MutationObserver(() => {
      const open = targets.some((sel) => document.querySelector(`${sel}.open`))
      lockScroll(open)
    })
    for (const sel of targets) {
      const el = document.querySelector(sel)
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    }
  }

  // Escape / backdrop clicks are app.js's business; we only need to know when
  // the very last overlay closes, hence observing rather than listening.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setTimeout(() => {
      const open = targets.some((sel) => document.querySelector(`${sel}.open`))
      if (!open) lockScroll(false)
    }, 0)
  })
}

/** SplitText line wrappers and every ScrollTrigger start/end are measured in
 * pixels, so a resize (or a phone rotating) makes them all stale. */
function initResizeGuard() {
  let timer = 0
  window.addEventListener('resize', () => {
    clearTimeout(timer)
    timer = setTimeout(() => ScrollTrigger?.refresh(), 220)
  }, { passive: true })
  window.addEventListener('load', () => ScrollTrigger?.refresh())
}

/** Re-evaluates the motion preference when Settings flips it.
 *
 * Turning motion OFF is the direction that has to be safe: Lenis is
 * destroyed (native scrolling from that moment on) and `html.fx-paused`
 * hides the canvases and the cursor. Turning it back on reloads — that is
 * the only honest way to rebuild every timeline and canvas that was torn
 * down, and it is a deliberate, rare action.
 */
function initMotionWatch() {
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  let sawChange = false

  const apply = () => {
    const off = motionOff()
    if (off === reduced) return
    if (off) {
      reduced = true
      lockScroll(false)
      if (lenis) { lenis.destroy(); lenis = null }
      doc.classList.add('fx-paused')
    } else if (sawChange) {
      location.reload()
    }
    sawChange = true
  }

  mq?.addEventListener?.('change', apply)
  if ('MutationObserver' in window) {
    new MutationObserver(apply).observe(doc, { attributes: true, attributeFilter: ['class'] })
  }
}

/* ──────────────────────────────── boot ───────────────────────────────── */

async function boot() {
  if (booted) return
  booted = true
  reduced = motionOff()

  /* Awaited, because everything below asks `if (lenis)` to decide whether it
   * hooks the smoothed scroll or the native one — and Lenis is a dynamic
   * import now, so it is a promise rather than something that is already
   * there. In lite mode it resolves to null immediately without a request. */
  try { await initLenis() } catch (err) { console.warn('[fx] lenis', err) }

  try { initProgress() } catch (err) { console.warn('[fx] progress', err) }
  try { initNav() } catch (err) { console.warn('[fx] nav', err) }
  try { initPlatformThumb() } catch (err) { console.warn('[fx] platform', err) }
  try { initHeroCanvas() } catch (err) { console.warn('[fx] hero', err) }
  try { initHeroIntro() } catch (err) { console.warn('[fx] intro', err) }
  try { initSpotlight() } catch (err) { console.warn('[fx] spotlight', err) }
  try { initTilt() } catch (err) { console.warn('[fx] tilt', err) }
  try { initMagnet() } catch (err) { console.warn('[fx] magnet', err) }
  try { initCounters() } catch (err) { console.warn('[fx] counters', err) }
  // The marquee is CSS — see the comment where initMarquee used to be.
  try { initScrollEffects() } catch (err) { console.warn('[fx] scroll', err) }
  try { initPageTransitions() } catch (err) { console.warn('[fx] views', err) }
  try { initCursor() } catch (err) { console.warn('[fx] cursor', err) }
  try { initClickSpark() } catch (err) { console.warn('[fx] spark', err) }
  try { initOverlayLock() } catch (err) { console.warn('[fx] overlay', err) }
  try { initResizeGuard() } catch (err) { console.warn('[fx] resize', err) }
  try { initMotionWatch() } catch (err) { console.warn('[fx] motion', err) }

  // One pointermove listener for every effect that was just wired.
  bootPointerBus()

  doc.classList.add('fx-ready')
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
