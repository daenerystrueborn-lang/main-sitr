/**
 * check-frontend.mjs - static wiring check for the Vercel bundle.
 *
 * node_modules isn't installed and there's no browser here, so this stands in
 * for "open it and click everything": it confirms the three files actually
 * agree with each other. The bugs it catches are the ones that produce a
 * silently dead button rather than an error - a $('#typo') that returns null,
 * a class the stylesheet never defines, an import of a name that isn't
 * exported.
 *
 * Run: node scripts/check-frontend.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// fileURLToPath, not url.pathname - the folder name contains a space, which
// pathname leaves percent-encoded and fs then can't open.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const html = read('index.html')
/* Every stylesheet the page links, not just the original one. The redesign is
 * a second file on purpose (it refines style.css and deletes cleanly), so a
 * class defined only there is still a class the browser paints. */
const STYLESHEETS = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)]
  .map((m) => m[1])
  .filter((href) => !/^https?:/i.test(href))
const css = STYLESHEETS.map((href) => read(href.startsWith('/') ? href.slice(1) : href)).join('\n')
const js = {
  'assets/js/api.js': read('assets/js/api.js'),
  'assets/js/ui.js': read('assets/js/ui.js'),
  'assets/js/items.js': read('assets/js/items.js'),
  'assets/js/shape.js': read('assets/js/shape.js'),
  'assets/js/showdown.js': read('assets/js/showdown.js'),
  'assets/js/mobile-pages.js': read('assets/js/mobile-pages.js'),
  'assets/js/app.js': read('assets/js/app.js'),
  // The motion layer. It is DOM-only, but it still looks up ids and toggles
  // classes, so it belongs in this check like any other front-end file.
  'assets/js/fx.js': read('assets/js/fx.js'),
}
const allJs = Object.values(js).join('\n')

let problems = 0
const fail = (msg) => { console.log(`  FAIL ${msg}`); problems++ }
const ok = (msg) => console.log(`  ok   ${msg}`)

/* ── 1. every #id the JS looks up exists in the markup ─────────────────── */

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]))

// Pages render their own markup, so an id can legitimately live in a JS
// template instead of index.html. Collect those too - only ids that exist in
// neither place are real breakage.
const jsRenderedIds = new Set([...allJs.matchAll(/\bid="([^"$`]+)"/g)].map(m => m[1]))
const knownIds = new Set([...htmlIds, ...jsRenderedIds])

const jsIds = new Set()
for (const m of allJs.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)) jsIds.add(m[1])
for (const m of allJs.matchAll(/getElementById\('([A-Za-z0-9_-]+)'\)/g)) jsIds.add(m[1])

// Names built at runtime from template literals or passed in as variables,
// so no static lookup finds them. Listed explicitly because these are exactly
// the ids a rename would silently break.
const DYNAMIC_IDS = new Set([
  'loginStep1', 'loginStep2', 'loginStep3', 'signupStep1', 'signupStep2', 'signupStep3',
  'loginNameField', 'loginNameErr', 'loginConfirmCard', 'loginConfirmErr',
  'signupPhoneField', 'signupPhoneErr',
  'loginSentTo', 'signupSentTo', 'otpRow', 'signupOtpRow', 'otpErr', 'signupOtpErr',
  'regNameField', 'regNameErr', 'bioField', 'bioErr', 'regClassHint', 'regRaceHint',
])
for (const id of DYNAMIC_IDS) jsIds.add(id)

// These footer controls are deliberately optional: the site shell can ship
// without a footer, and each lookup is guarded before it is used.
const OPTIONAL_IDS = new Set(['footerAuth', 'footerCta', 'footerNote', 'footerSupport'])
const missingIds = [...jsIds].filter(id => !knownIds.has(id) && !OPTIONAL_IDS.has(id)).sort()
if (missingIds.length) fail(`JS reaches for #ids that don't exist: ${missingIds.join(', ')}`)
else ok(`all ${jsIds.size} #ids referenced by JS exist in the markup`)

/* ── 2. every class the JS/HTML uses is defined in the stylesheet ──────── */

const cssClasses = new Set([...css.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)].map(m => m[1]))

const usedClasses = new Set()
for (const m of html.matchAll(/\bclass="([^"]+)"/g)) {
  for (const c of m[1].split(/\s+/)) if (c) usedClasses.add(c)
}
// class="..." strings built inside JS template literals
for (const m of allJs.matchAll(/class="([^"$`]+)"/g)) {
  for (const c of m[1].split(/\s+/)) if (c) usedClasses.add(c)
}
for (const m of allJs.matchAll(/classList\.(?:add|toggle|remove)\('([A-Za-z0-9_-]+)'/g)) {
  usedClasses.add(m[1])
}

// Utility/file-extension noise the regex picks up out of url() and filenames.
const IGNORE = new Set(['jpg', 'png', 'svg', 'html', 'js', 'css', 'webp'])
const missingClasses = [...usedClasses]
  .filter(c => !cssClasses.has(c) && !IGNORE.has(c))
  .sort()
if (missingClasses.length) fail(`classes with no CSS rule: ${missingClasses.join(', ')}`)
else ok(`all ${usedClasses.size} classes used are defined in style.css`)

/* ── 3. imports between the JS modules resolve to real exports ─────────── */

function exportsOf(file) {
  const src = js[file]
  if (!src) return null
  const names = new Set()
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(m[1])
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim().split(/\s+as\s+/)
      const name = (seg[1] ?? seg[0] ?? '').trim()
      if (name) names.add(name)
    }
  }
  return names
}

let importProblems = 0
for (const [file, src] of Object.entries(js)) {
  for (const m of src.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[2]
    if (!spec.startsWith('.')) continue
    const target = 'assets/js/' + path.basename(spec)
    const names = exportsOf(target)
    if (!names) { fail(`${file} imports from missing ${spec}`); importProblems++; continue }
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim()
      if (name && !names.has(name)) {
        fail(`${file}: { ${name} } is not exported by ${spec}`)
        importProblems++
      }
    }
  }
}
if (!importProblems) ok('all cross-module imports resolve to real exports')

/* ── 4. every api.* call the app makes exists on the client ────────────── */

const apiMethods = new Set(
  [...js['assets/js/api.js'].matchAll(/^\s{2}([A-Za-z0-9_]+):\s*(?:async\s*)?\(/gm)].map(m => m[1]),
)
const called = new Set([...js['assets/js/app.js'].matchAll(/\bapi\.([A-Za-z0-9_]+)\(/g)].map(m => m[1]))
const missingMethods = [...called].filter(m => !apiMethods.has(m)).sort()
if (missingMethods.length) fail(`app.js calls api.${missingMethods.join(', api.')} - not defined in api.js`)
else ok(`all ${called.size} api.* methods called by app.js exist`)

/* ── 4b. mobile pages call only methods that exist on the API client ──── */

const mobileApiCalls = new Set([...js['assets/js/mobile-pages.js'].matchAll(/\bapi\.([A-Za-z0-9_]+)\(/g)].map(m => m[1]))
const missingMobileMethods = [...mobileApiCalls].filter(m => !apiMethods.has(m)).sort()
if (missingMobileMethods.length) fail(`mobile-pages.js calls missing API methods: ${missingMobileMethods.join(', ')}`)
else ok(`all ${mobileApiCalls.size} API methods used by the mobile pages exist`)

/* ── 5. routes, views and nav links line up ────────────────────────────── */

const routeNames = new Set(
  [...js['assets/js/app.js'].matchAll(/^\s{2}([A-Za-z0-9_]+):\s*\{\s*view:/gm)].map(m => m[1]),
)
const viewIds = new Set([...html.matchAll(/class="view[^"]*"\s+id="([^"]+)"/g)].map(m => m[1]))
const declaredViews = new Set(
  [...js['assets/js/app.js'].matchAll(/view:\s*'([^']+)'/g)].map(m => m[1]),
)

const orphanViews = [...declaredViews].filter(v => !viewIds.has(v)).sort()
if (orphanViews.length) fail(`routes point at views not in index.html: ${orphanViews.join(', ')}`)
else ok(`all ${declaredViews.size} route views exist as <section class="view">`)

const navTargets = new Set([...html.matchAll(/data-route="([^"]*)"/g)].map(m => m[1]).filter(Boolean))
const badNav = [...navTargets].filter(r => !routeNames.has(r)).sort()
if (badNav.length) fail(`data-route values with no route: ${badNav.join(', ')}`)
else ok(`all ${navTargets.size} data-route links resolve to a route`)

/* ── 5b. the cards page is a browsable collection, never a shop ────────── */

const cardsView = html.match(/<main class="view" id="view-cards">([\s\S]*?)<\/main>/)?.[1] ?? ''
const cardsSections = [...cardsView.matchAll(/<section\b/g)].length
if (!cardsView || !/<h2>Browse the collection<\/h2>/.test(cardsView) || cardsSections !== 1
  || /cardTierGrid|cardBalance|data-buytier/.test(cardsView)) {
  fail('cards view should contain only the browse section, without purchase controls')
} else {
  ok('cards view contains only the browse section')
}

if (/\b(?:buyCardPull|buyCardTier)\b|data-buytier/.test(allJs))
  fail('card purchase code is still reachable from the frontend')
else ok('frontend has no card purchase action')

/* ── 5c. Pokémon UI is removed; Halloween success states stay true ───── */

const mobilePages = js['assets/js/mobile-pages.js']
const appJs = js['assets/js/app.js']
const hasPokemonUi = /href="#\/pokemon"|data-route="pokemon"|id="view-pokemon"|id="pokemonRoot"|poke-view|home-pokemon-section|id="homePokemon"/.test(html)
  || /^\s*pokemon:\s*\{\s*view:\s*'view-pokemon'/m.test(appJs)
  || /\b(?:loadPokemon|renderHomePokemon|fetchSunMoonPokemon)\b/.test(`${appJs}\n${mobilePages}`)
if (hasPokemonUi)
  fail('Pokémon page, navigation, or homepage teaser is still present')
else ok('Pokémon page, route, navigation and homepage teaser are removed')

const eventClaim = mobilePages.match(/async function claimEvent\(ev\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
const progressClaim = mobilePages.match(/async function claimHalloween\(btn\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
if (!/HALLOWEEN_THANKS_IMAGE\s*=\s*'https:\/\/i\.ibb\.co\/kWHW2FX\/8f3ab6e286d4bde647441b59eaefc882\.jpg'/.test(mobilePages)
  || !/ev\.id === 'halloween'\) showHalloweenThanks\(\)/.test(eventClaim)
  || !/showHalloweenThanks\(\)/.test(progressClaim))
  fail('both Halloween claim flows should show the requested thank-you popup after success')
else ok('both Halloween claim flows show the thank-you popup')

/* ── 6. every asset the markup references is on disk ───────────────────── */

const assets = new Set([
  // data: URIs are inlined content, not files - the SVG favicon is one.
  ...[...html.matchAll(/(?:src|href)="((?!https?:|data:|#|mailto:)[^"]+)"/g)].map(m => m[1]),
  // Comments are stripped first: style.css documents the url() quote-escaping
  // bug in prose, and an example url('…') inside a comment is not an asset.
  // Left in, it reported the literal ellipsis as a file missing from disk.
  // `%23` is an encoded '#': the only thing that uses it is an SVG filter
  // referencing an id inside the data URI it is embedded in (url(%23noise)),
  // which is never a file. Without this every grain layer reports as missing.
  ...[...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/url\(['"]?((?!data:|https?:|%23)[^'")]+)['"]?\)/g)].map(m => m[1]),
])
const missingAssets = []
for (const a of assets) {
  const rel = a.startsWith('../') ? path.join('assets/css', a) : a
  if (!fs.existsSync(path.join(ROOT, rel))) missingAssets.push(a)
}
if (missingAssets.length) fail(`referenced files not on disk: ${missingAssets.join(', ')}`)
else ok(`all ${assets.size} local assets exist`)

/* ── 7. vercel.json uses only properties the deploy schema accepts ───────
   Vercel validates this file BEFORE building and hard-fails the deploy on an
   unknown key - including a `comment` key, since JSON has no comment syntax.
   Catching it here turns a failed production deploy into a local error. */

const VERCEL_TOP = new Set(['$schema', 'cleanUrls', 'trailingSlash', 'rewrites', 'headers',
  'redirects', 'routes', 'buildCommand', 'outputDirectory', 'framework', 'installCommand',
  'devCommand', 'regions', 'public', 'github', 'functions', 'crons', 'images', 'ignoreCommand'])
const VERCEL_HEADER = new Set(['source', 'headers', 'has', 'missing'])
const VERCEL_REWRITE = new Set(['source', 'destination', 'has', 'missing'])

const badKeys = []
try {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'))
  for (const k of Object.keys(vercel)) if (!VERCEL_TOP.has(k)) badKeys.push(`top-level "${k}"`)
  for (const [i, h] of (vercel.headers ?? []).entries())
    for (const k of Object.keys(h)) if (!VERCEL_HEADER.has(k)) badKeys.push(`headers[${i}] "${k}"`)
  for (const [i, r] of (vercel.rewrites ?? []).entries())
    for (const k of Object.keys(r)) if (!VERCEL_REWRITE.has(k)) badKeys.push(`rewrites[${i}] "${k}"`)

  if (badKeys.length) fail(`vercel.json has properties the schema rejects: ${badKeys.join(', ')}`)
  else ok('vercel.json uses only schema-valid properties')
} catch (err) {
  fail(`vercel.json could not be parsed: ${err.message}`)
}

/* ── 8. lite mode keeps its two ends connected ──────────────────────────
   The performance layer is split by necessity: the decision is made in the
   inline <head> script, the styling is in redesign.css §15, and the effects
   are gated in fx.js. Each half is useless on its own - a class nothing
   styles is a no-op, a stylesheet waiting on a class nothing sets is dead
   weight - so the three are checked together. */

const perfCss = /html\.perf-lite/.test(css)
const perfJs = /const lite = doc\.classList\.contains\('perf-lite'\)/.test(js['assets/js/fx.js'])
const perfHead = /classList\.add\('perf-lite'\)/.test(html)
if (!perfCss || !perfJs || !perfHead) {
  fail(`lite mode is not wired end to end (head:${perfHead} css:${perfCss} fx.js:${perfJs})`)
} else {
  ok('lite mode is wired: decided in the head, styled in CSS, gated in fx.js')
}

// The vendor bundles are injected by that script when it decides this device
// can afford them. A plain tag here would put 160KB of GSAP back in front of
// every phone, which is the one thing lite mode exists to prevent.
if (/<script[^>]+src="assets\/vendor\//.test(html)) {
  fail('assets/vendor scripts must be injected by the head script, not hardcoded')
} else {
  ok('vendored animation libraries are loaded conditionally')
}

/* backdrop-filter is the single most expensive property this design used:
   it forces the browser to re-snapshot the page behind the element, and it
   was on every fixed bar. Reintroducing one silently is exactly the kind of
   regression this file exists to catch. */
const blurValues = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/backdrop-filter\s*:\s*([^;}]+)/g)]
  .map((m) => m[1].trim())
  .filter((v) => !/^none\b/.test(v))
if (blurValues.length) {
  fail(`backdrop-filter is back in the stylesheets (${blurValues.join(', ')}) - see redesign.css §15`)
} else {
  ok('no backdrop-filter blur left in the stylesheets')
}

/* The UI is drawn, not typed. Every mark on this site is an inline SVG from
   ICON_PATHS in ui.js - which is what makes it look the same on an iPhone, a
   cheap Android and a desktop. A stray emoji or dingbat does not: U+2605 and
   friends get pulled out of the colour-emoji font on some devices, so the same
   page shows line art and picture-emoji side by side. That is exactly what the
   shop's shelf tabs did before they were given icons.
 *
 * Comments are exempt on purpose (app.js documents the 🪙 it replaced), and so
 * is showdown.js, where ♀/♂ are part of Pokémon names rather than decoration. */
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}]/u
const withoutComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '')
const pictoSources = {
  'index.html': html,
  ...Object.fromEntries(STYLESHEETS.map((href) => [href, css])),
  ...Object.fromEntries(Object.entries(js).filter(([name]) => !name.endsWith('showdown.js'))),
}
const pictoHits = []
for (const [name, src] of Object.entries(pictoSources)) {
  withoutComments(src).split('\n').forEach((line, i) => {
    if (PICTO.test(line)) pictoHits.push(`${name}:${i + 1} ${line.trim().slice(0, 60)}`)
  })
}
if (pictoHits.length) {
  fail(`emoji/dingbats in UI source - draw it with iconSvg() instead:\n       ${pictoHits.join('\n       ')}`)
} else {
  ok('no emoji or dingbats in the UI source; every mark is a drawn SVG')
}

console.log(problems ? `\n${problems} problem(s)` : '\nFrontend wiring is consistent.')
process.exit(problems ? 1 : 0)
