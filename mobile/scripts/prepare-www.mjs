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
for (const f of ['shell.css', 'shell.js', 'play.css', 'play.js']) {
  fs.copyFileSync(path.join(mobile, 'app-shell', f), path.join(www, 'assets/app', f))
}

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
fs.writeFileSync(appJsPath, appJs)

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
    `<link rel="stylesheet" href="assets/app/shell.css">\n<script>window.ASTRAL_API_BASE=${JSON.stringify(apiBase)}</script>\n</head>`)
  .replace('<body>', '<body class="is-app">')
  .replace('</head>', '<link rel="stylesheet" href="assets/app/play.css">\n</head>')
  .replace('</body>', `<main class="view" id="view-welcome"><div class="page" id="welcomeRoot"></div></main>
<main class="view" id="view-pokemon"><div class="page" id="pokemonRoot"></div></main>
<script src="assets/app/shell.js"></script>
<script type="module" src="assets/app/play.js"></script>
</body>`)

for (const needle of ['assets/css/fonts.css', 'assets/app/shell.css', 'assets/app/play.css', 'assets/app/shell.js', 'assets/app/play.js', 'view-welcome', 'view-pokemon', 'is-app']) {
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
