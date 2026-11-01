# Motion layer

Everything that moves on this site — beyond a CSS `transition` — lives in two
files that **did not exist before the redesign**:

| File | Lines | What it is |
| --- | --- | --- |
| `assets/js/fx.js` | ~1130 | the motion engine: smooth scroll, scroll triggers, canvases, pointer effects |
| `assets/css/redesign.css` | ~1290 | a second stylesheet loaded *after* `style.css`: tokens, layout, responsive rules |

`style.css` and `app.js` are untouched, with one 20-line exception in
`assets/js/ui.js` (a sanitizer for toast text). That is the whole point of the
split: the site was already a complete, working design, so the redesign refines
it from the outside instead of editing 2 100 lines of stylesheet and risking
every page at once. Delete both files and the site still works, just still.

`index.html` gains a handful of decorative fixed layers, the hero's layered
markup, and the inline `<head>` script that decides lite mode and injects the
vendor tags (see *Lite mode* below).

## Libraries

Nothing is loaded from a CDN — a blocked third-party request used to take the
whole animation layer down with it.

* **[GSAP](https://github.com/greensock/gsap) 3.15** — `assets/vendor/gsap/`
  (`gsap`, `ScrollTrigger`, `SplitText`), classic `defer` scripts registering
  on `window`. GSAP's dist build is UMD, so there is no ES export to import.
* **[Lenis](https://github.com/darkroomengineering/lenis) 1.3.27** —
  `assets/vendor/lenis/lenis.mjs`, a real ES module, driven by GSAP's ticker
  (`autoRaf: false`) so there is exactly one animation clock on the page. It
  is a **dynamic** import in `fx.js` (`await import(...)`) and modulepreloaded
  from the head, so lite mode never downloads it and full mode does not wait
  for it.
* **[react-bits](https://github.com/DavidHDev/react-bits)** — *ideas*, not the
  package. It is a React component library; this is a no-build static site with
  no framework and no bundler, so shipping React for six effects would cost
  more than the effects are worth. Aurora, Particles, ClickSpark,
  SpotlightCard, Magnet, CountUp, Marquee, TiltedCard and DecryptedText are
  re-implemented against plain DOM, canvas and CSS.

See `assets/vendor/NOTICE.md` for versions and licences.

## Hero paint order

All positive `z-index`, all inside `.hero` (an isolated stacking context):

```
0  .hero-grid      ruled grid, masked out before it reaches the fold
0  .hero-art       the photo, oversized ~12% so the 16% parallax never shows an edge
1  .hero-canvas    Aurora + gold dust (paused whenever it isn't on screen)
2  .hero-spot      warm light that follows the pointer
2  .hero-veil      the black ramp that makes the copy readable
2  ::after         vignette
3  .hero-inner     the copy
4  .hero-scroll    the scroll cue
```

Negative `z-index` is deliberately not used anywhere: inside a stacking context
it lays out as a sibling in flow, which once put the season artwork under a flex
row.

## Turning it off

Three independent switches, all landing on the same place — a static page:

1. **OS** — `prefers-reduced-motion: reduce`.
2. **Per device** — Settings → *This device* → motion off, which sets
   `html.no-motion` (persisted). Lenis, all canvases and every rAF loop stop;
   `fx.js` also stops re-arming.
3. **No JS / failed JS** — `.reveal` elements are only hidden once `html.js-motion`
   exists (set by `ui.js`), so a broken module leaves content visible rather
   than blank.

## Lite mode

A fourth, cheaper tier that sits between the full design and "no motion at
all". It is decided by the inline `<head>` script **before the first paint** —
phones, coarse pointers, `save-data`/2G–3G connections, ≤4GB of device memory
or ≤4 cores — and it is overridable both ways in Settings → *This device*
(`perfLite` in `astral:prefs`; a non-boolean value means "decide for me").

The three halves have to stay in step, which is why `check-frontend.mjs` §8
asserts they do:

| Where | What it does |
| --- | --- |
| `index.html` (head) | sets `html.perf-lite`, publishes `window.__astralPerf`, and **only then** injects the GSAP tags + the Lenis modulepreload |
| `assets/css/redesign.css` §15 | the whole `html.perf-lite` block: no glass, no blended full-screen layers, no permanent `will-change`, no looping decoration, quick CSS view fade |
| `assets/js/fx.js` | `const lite = ...` gates Lenis, the hero loop, spotlight, tilt, magnet, counters, ScrollTrigger, page transitions, cursor and spark |

What is **kept**: layout, colour, type, spacing, hover/focus states, the
entrance of content (`.reveal`), the static aurora frame, the marquee (one
compositor transform), and the busy spinner. Nothing in lite mode changes the
DOM, so every route and interaction is identical.

What is **dropped**: all 155KB of GSAP + Lenis, smooth-scroll interpolation,
the 30fps hero canvas loop, `backdrop-filter` anywhere, the blended grain
layer, the pointer cursor/spotlight/tilt/magnet, and the permanently-animated
photo.

## Performance budget

The page is animated hard but the cost is bounded. The rules, in the order they
matter:

* **No `backdrop-filter` in the stylesheets, at all.** It forces the browser to
  re-snapshot everything behind the element, and it was on the nav bar, the
  mobile dock, the drawer, the panel, the modal, every secondary button and
  every chip. The surfaces are opaque enough (92–99%) that dropping it is
  invisible. `check-frontend.mjs` fails the build if one comes back.
* **Nothing animates off-screen.** The hero canvas, the spark canvas and every
  rAF loop are gated on `IntersectionObserver` + `visibilitychange`.
* **Nothing is permanently promoted.** `will-change` is a loan against GPU
  memory and every one of them used to be permanent, on elements that are not
  animating most of the time.
* **Nothing loops on the main thread.** The marquee is a CSS transform, not a
  GSAP tween with `repeat: -1` (which held a rAF callback open for the whole
  visit). The decorative `background-position` loops sit behind `perf-lite`.
* **The hero canvas is under-sampled and sprite-baked.** Its backing store is
  50% of its CSS size and it repaints at most every 34 ms (~30 fps); the five
  gradients and the dust are baked into offscreen sprites once instead of
  `createRadialGradient()` 150 times a second.
* **One pointer listener.** Hero parallax, spotlight, tilt, magnet and the
  cursor share a single `pointermove` + rAF bus (`onPointerFrame`), so a mouse
  move costs one measurement per effect per frame instead of per event.
* **The expensive half is conditional.** GSAP, ScrollTrigger, SplitText and
  Lenis are not fetched at all on a device that will not animate (lite mode).

Measured on a software-rendered headless Chrome (worst case, no GPU):
~23 rAF/s on the home page at 1440×950 with every effect running. On real
hardware the 30 fps cap is the limit, not the frame budget.

## Gotchas (all of these were bugs first)

* **Never leave a transform on `.view`.** It becomes a containing block, and
  every `position: fixed` child inside starts scrolling with the page. Every
  view tween clears its props on complete.
* **`text-shadow` paints after an element's own background.** The headline's
  gold word *is* a background (`background-clip: text`), so a shadow on it lands
  on top of the gold and turns it muddy. Shade the plain words only.
* **Never write `classList` inside a MutationObserver that observes that node.**
  `classList.add` rewrites the attribute even when the class is already there,
  so the observer re-fires forever and the tab freezes. Both observers in
  `fx.js` memoise their last result.
* **GSAP 3.15's namespace is an object, not a function.** `typeof gsap === 'function'`
  silently disables every animation while the page still renders. Feature-test
  the API (`typeof gsap.to === 'function'`).
* **`background-image` needs `-webkit-background-clip: text`** *and* a
  `background-image` — a `background: linear-gradient(…)` shorthand on an
  element that already had `background-color` from elsewhere can win or lose in
  surprising order. `redesign.css` sets the image explicitly.
* **Column flex + inline pills**: `align-self: flex-start` on badges that should
  hug their text instead of stretching to the card width.
* **`.hero-scroll` is a `<div>` on purpose** — every hash on this site is a
  route, and an anchor would push a fragment `app.js` would 404 on.
* **`@media (hover: none)` nullifies** tilt, magnetism and the spotlight. That's
  intended (touch players get the CSS-only effects), but it also means a
  headless browser reports every hover effect as broken until pointer emulation
  is on.

## Previewing

The app talks to `/api/*`, so `python -m http.server` is not enough (every call
404s and the UI fills with error toasts). A mock server is checked in:

```sh
node scripts/preview-server.mjs 3000
# then open http://127.0.0.1:3000/
```

It serves the static files and answers the endpoints in `assets/js/api.js` with
plausible data — including `/api/characters/:id`, which the character sheet needs.

## Verification

Screenshots were taken at 1440×950 and 390×844 across every route: hero,
marquee, features, stats, boards, season, shop, cards, premium, auth, settings,
the mobile dock and the drawer. Checks that matter after any change here:

* `document.documentElement.scrollWidth - window.innerWidth === 0` at every
  route, both viewports (no horizontal overflow).
* no `pageerror` or console errors on any route.
* the active nav pill sits on the active link's real geometry.
* reduced-motion on → page is static and complete, not blank.
