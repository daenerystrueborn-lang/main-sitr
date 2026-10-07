/**
 * Builds mobile/www from the website, so the APK is the same site, bundled.
 *   - copies index.html + assets (skips video; nothing references it)
 *   - bundles Inter + Space Grotesk locally (no Google Fonts call, works offline)
 *   - injects the app shell (bottom tabs, login-first flow) and the API base
 * The site files themselves are never modified.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const mobile = path.resolve(here, '..')
// Where is the website? Works whether mobile/ lives inside the site repo, or in its own
// repo where CI checks the site out next to it (see .github/workflows/build-apk.yml).
const siteCandidates = [process.env.SITE_DIR, path.resolve(mobile, '..'), path.resolve(mobile, '../site-src')]
  .filter(Boolean)
  .map((d) => path.resolve(d))
const site = siteCandidates.find((d) => fs.existsSync(path.join(d, 'index.html')) && fs.existsSync(path.join(d, 'assets')))
if (!site) {
  throw new Error('Cannot find the website source (index.html + assets/). Looked in:\n  ' + siteCandidates.join('\n  '))
}
console.log('site source:', site)
const www = path.join(mobile, 'www')

fs.rmSync(www, { recursive: true, force: true })
fs.mkdirSync(www, { recursive: true })

// 1) site assets (no video)
fs.cpSync(path.join(site, 'assets'), path.join(www, 'assets'), {
  recursive: true,
  filter: (src) => !src.includes(`${path.sep}assets${path.sep}video`),
})

// 2) API base: env wins, otherwise whatever the site itself defaults to.
const apiJs = fs.readFileSync(path.join(site, 'assets/js/api.js'), 'utf8')
const siteDefault = apiJs.match(/DEFAULT_BASE\s*=\s*'([^']+)'/)?.[1]
const apiBase = (process.env.ASTRAL_API_BASE || siteDefault || '').replace(/\/+$/, '')
if (!apiBase) throw new Error('No API base: set ASTRAL_API_BASE or keep DEFAULT_BASE in api.js')

// 3) fonts bundled locally
const fontDir = path.join(www, 'assets/fonts')
fs.mkdirSync(fontDir, { recursive: true })
const fonts = [
  ['inter', 'Inter', 'inter-latin-wght-normal.woff2', 'Inter'],
  ['space-grotesk', 'Space Grotesk', 'space-grotesk-latin-wght-normal.woff2', 'Space Grotesk'],
]
let fontCss = ''
for (const [pkg, family, file] of fonts) {
  const src = path.join(mobile, 'node_modules/@fontsource-variable', pkg, 'files', file)
  if (!fs.existsSync(src)) throw new Error(`Missing font ${src} - run npm install first`)
  fs.copyFileSync(src, path.join(fontDir, file))
  fontCss += `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:100 900;src:url(../fonts/${file}) format('woff2');}\n`
}
fs.writeFileSync(path.join(www, 'assets/css/fonts.css'), fontCss)

// 4) app shell
fs.mkdirSync(path.join(www, 'assets/app'), { recursive: true })
for (const f of fs.readdirSync(path.join(mobile, 'app-shell'))) {
  fs.copyFileSync(path.join(mobile, 'app-shell', f), path.join(www, 'assets/app', f))
}
// Armor slot icons (game-icons.net, CC BY 3.0; see armor/CREDITS.txt).
fs.mkdirSync(path.join(www, 'assets/armor'), { recursive: true })
for (const f of fs.readdirSync(path.join(mobile, 'armor'))) {
  if (f.endsWith('.png')) fs.copyFileSync(path.join(mobile, 'armor', f), path.join(www, 'assets/armor', f))
}
// Splash logo: the site's sun (favicon.png), spun by splash.css.
fs.copyFileSync(path.join(site, 'assets/img/favicon.png'), path.join(www, 'assets/img/app-logo.png'))

// 4b) router patches on the bundled copy of app.js (the site's own file is never touched).
//     Each anchor is asserted, so a site change that breaks one fails the build instead of shipping a broken app.
const appJsPath = path.join(www, 'assets/js/app.js')
let appJs = fs.readFileSync(appJsPath, 'utf8')
const patch = (from, to, label) => {
  if (!appJs.includes(from)) throw new Error(`app.js patch anchor not found: ${label}`)
  appJs = appJs.replace(from, to)
}
patch("  404: { view: 'view-404', title: 'Not found' },",
  "  welcome: { view: 'view-welcome', title: 'Welcome', auth: true },\n  pokemon: { view: 'view-pokemon', title: 'Pokemon', auth: true },\n  404: { view: 'view-404', title: 'Not found' },",
  'routes table')
patch("const next = pendingRoute ?? 'profile'", "const next = pendingRoute ?? 'welcome'", 'post-login landing')

// 4b-2) character modal becomes a 2:3 card + info (no banner, no round pfp); profile header gets edit buttons.
appJs = appJs.replace(/\r\n/g, '\n')
const between = (startMarker, endMarker, file, label) => {
  const a = appJs.indexOf(startMarker)
  if (a < 0) throw new Error(`app.js patch anchor not found: ${label} (start)`)
  const b = appJs.indexOf(endMarker, a + startMarker.length)
  if (b < 0) throw new Error(`app.js patch anchor not found: ${label} (end)`)
  appJs = appJs.slice(0, a) + fs.readFileSync(path.join(here, 'patches', file), 'utf8') + appJs.slice(b)
}
between("${c.image ? `<div class=\"pd-banner\" style=\"background-image:url('${attr(c.image)}')\"></div>` : ''}",
  '<div class="pd-body">', 'character-card.txt', 'character modal')
between('<div class="profile-banner"${p.bannerUrl',
  '<section class="section">\n      <div class="stat-row reveal">', 'profile-head.txt', 'profile header')
patch('state.inv = (p.inventory ?? []).slice(0, 24)', 'state.inv = (p.inventory ?? []).slice(0, 24)\n  window.__astralInv = state.inv\n  window.__astralMe = p', 'expose inventory for drag and drop')
patch("const box = inputEl?.closest('.img-upload')", "const box = inputEl?.closest('.img-upload') ?? $('#profileWrap')", 'upload busy box')
patch("toast(kind === 'banner' ? 'Banner updated.' : 'Profile picture updated.')\n    await loadSettings()",
  "toast(kind === 'banner' ? 'Banner updated.' : 'Profile picture updated.')\n    await (location.hash.startsWith('#/profile') ? loadProfile() : loadSettings())",
  'reload after upload')
fs.writeFileSync(appJsPath, appJs)

// 4c) api.js: stale-while-revalidate GET cache (persisted), so pages open instantly from saved data and refresh behind the scenes. Any write wipes it.
const apiPath = path.join(www, 'assets/js/api.js')
let apiSrc = fs.readFileSync(apiPath, 'utf8')
const apiAnchor = `const get = (p) => request(p)
const post = (p, body) => request(p, { method: 'POST', body })
const patch = (p, body) => request(p, { method: 'PATCH', body })
const del = (p) => request(p, { method: 'DELETE' })`
if (!apiSrc.includes(apiAnchor)) throw new Error('api.js patch anchor not found: get/post/patch/del')
apiSrc = apiSrc.replace(apiAnchor, `/* Astral app cache: stale-while-revalidate, persisted so a cold launch opens pages instantly. */
const __cache = new Map()
const __PK = 'astral:c:'
const __load = (p) => { try { const o = JSON.parse(localStorage.getItem(__PK + p) || 'null'); return o && Date.now() - o.t < 21600000 ? o : null } catch { return null } }
const __save = (p, t, d) => { try { const s = JSON.stringify({ t, d }); if (s.length < 300000) localStorage.setItem(__PK + p, s) } catch {} }
const __wipe = () => { __cache.clear(); try { Object.keys(localStorage).filter((k) => k.startsWith(__PK)).forEach((k) => localStorage.removeItem(k)) } catch {} }
const __same = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false } }
function __refresh(p, prev) {
  request(p).then((d) => {
    __cache.set(p, { t: Date.now(), v: Promise.resolve(d), d }); __save(p, Date.now(), d)
    if (!__same(prev, d)) window.dispatchEvent(new CustomEvent('astral:data', { detail: p }))
  }).catch(() => { const h = __cache.get(p); if (h) h.r = false })
}
const get = (p) => {
  let hit = __cache.get(p)
  if (!hit) { const o = __load(p); if (o) { hit = { t: 0, v: Promise.resolve(o.d), d: o.d }; __cache.set(p, hit) } }
  if (hit) {
    if (Date.now() - hit.t < 45000) return hit.v
    if (hit.d !== undefined) { if (!hit.r) { hit.r = true; __refresh(p, hit.d) } return hit.v }
    return hit.v
  }
  const v = request(p)
  const e = { t: Date.now(), v, d: undefined }
  __cache.set(p, e)
  v.then((d) => { e.d = d; __save(p, e.t, d) }).catch(() => __cache.delete(p))
  return v
}
const post = (p, body) => (__wipe(), request(p, { method: 'POST', body }).finally(__wipe))
const patch = (p, body) => (__wipe(), request(p, { method: 'PATCH', body }).finally(__wipe))
const del = (p) => (__wipe(), request(p, { method: 'DELETE' }).finally(__wipe))`)
// 4d) debug: show the real network error + URL so "Cannot reach the server" can be diagnosed on the phone.
const netFrom = "aborted ? 'The server took too long to respond.' : 'Cannot reach the server.',"
if (!apiSrc.includes(netFrom)) throw new Error('api.js patch anchor not found: network error message')
apiSrc = apiSrc.replace(netFrom, "aborted ? 'The server took too long to respond.' : `Cannot reach the server (${API_BASE} | ${err?.name}: ${err?.message}).`,")
fs.writeFileSync(apiPath, apiSrc)


// Splash markup (styles live in app-shell/splash.css). Gooey SVG filters make the drops melt together.
// Set to true to bring back the water-drop + spinning sun splash. false = plain black while the app boots.
const SPLASH_ANIM = false
const SPLASH_HTML_ANIM = `<div id="appSplash"><svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<filter id="spGoo" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"/></filter>
<filter id="spGoo2" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"/></filter>
</defs></svg><div class="sp-glow"></div><div class="sp-stage"><div class="sp-goo"><i class="sp-drop d1"></i><i class="sp-drop d2"></i><i class="sp-drop d3"></i><i class="sp-pool"></i><i class="sp-jet j1"></i><i class="sp-jet j2"></i><i class="sp-jet j3"></i><i class="sp-jet j4"></i><i class="sp-jet j5"></i><i class="sp-jet j6"></i></div><i class="sp-ring r1"></i><i class="sp-ring r2"></i><i class="sp-ring r3"></i><i class="sp-ring r4"></i><div class="sp-logo-wrap"><img class="sp-logo" src="assets/img/app-logo.png" alt=""></div></div></div>`

// 5) html
let html = fs.readFileSync(path.join(site, 'index.html'), 'utf8')
const before = html.length

html = html
  .replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*/g, '')
  .replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*>\s*/g, '')
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/g,
    '<link rel="stylesheet" href="assets/css/fonts.css">')
  .replace(/<meta name="viewport"[^>]*>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">')
  .replace('</head>',
    `<link rel="stylesheet" href="assets/app/shell.css">\n<script>window.ASTRAL_API_BASE=${JSON.stringify(apiBase)};window.ASTRAL_SPLASH_MS=${SPLASH_ANIM ? 1900 : 350}</script>\n</head>`)
  .replace('</head>', '<link rel="stylesheet" href="assets/app/splash.css">\n</head>')
  .replace('<body>', () => '<body class="is-app">\n' + (SPLASH_ANIM ? SPLASH_HTML_ANIM : '<div id="appSplash" class="blank"></div>'))
  .replace('</head>', '<link rel="stylesheet" href="assets/app/play.css">\n</head>')
  .replace('</body>', `<main class="view" id="view-welcome"><div class="page" id="welcomeRoot"></div></main>
<main class="view" id="view-pokemon"><div class="page" id="pokemonRoot"></div></main>
<script src="assets/app/shell.js"></script>
<script type="module" src="assets/app/play.js"></script>
</body>`)

for (const needle of ['assets/css/fonts.css', 'assets/app/shell.css', 'assets/app/play.css', 'assets/app/shell.js', 'assets/app/play.js', 'appSplash', 'view-welcome', 'view-pokemon', 'is-app']) {
  if (!html.includes(needle)) throw new Error(`index.html injection failed: ${needle}`)
}
if (html.includes('fonts.googleapis.com')) throw new Error('Google Fonts link still present')

fs.writeFileSync(path.join(www, 'index.html'), html)

const kb = (n) => (n / 1024).toFixed(0) + ' KB'
let total = 0
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name); e.isDirectory() ? walk(p) : (total += fs.statSync(p).size)
})
walk(www)
console.log(`www ready: ${kb(total)} (api: ${apiBase}) html ${kb(before)} -> ${kb(html.length)}`)
