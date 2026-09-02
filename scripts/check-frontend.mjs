/**
 * check-frontend.mjs — static wiring check for the Vercel bundle.
 *
 * node_modules isn't installed and there's no browser here, so this stands in
 * for "open it and click everything": it confirms the three files actually
 * agree with each other. The bugs it catches are the ones that produce a
 * silently dead button rather than an error — a $('#typo') that returns null,
 * a class the stylesheet never defines, an import of a name that isn't
 * exported.
 *
 * Run: node scripts/check-frontend.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// fileURLToPath, not url.pathname — the folder name contains a space, which
// pathname leaves percent-encoded and fs then can't open.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const html = read('index.html')
const css = read('assets/css/style.css')
const js = {
  'assets/js/api.js': read('assets/js/api.js'),
  'assets/js/ui.js': read('assets/js/ui.js'),
  'assets/js/app.js': read('assets/js/app.js'),
}
const allJs = Object.values(js).join('\n')

let problems = 0
const fail = (msg) => { console.log(`  FAIL ${msg}`); problems++ }
const ok = (msg) => console.log(`  ok   ${msg}`)

/* ── 1. every #id the JS looks up exists in the markup ─────────────────── */

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]))

// Pages render their own markup, so an id can legitimately live in a JS
// template instead of index.html. Collect those too — only ids that exist in
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

const missingIds = [...jsIds].filter(id => !knownIds.has(id)).sort()
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
if (missingMethods.length) fail(`app.js calls api.${missingMethods.join(', api.')} — not defined in api.js`)
else ok(`all ${called.size} api.* methods called by app.js exist`)

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

/* ── 6. every asset the markup references is on disk ───────────────────── */

const assets = new Set([
  // data: URIs are inlined content, not files — the SVG favicon is one.
  ...[...html.matchAll(/(?:src|href)="((?!https?:|data:|#|mailto:)[^"]+)"/g)].map(m => m[1]),
  ...[...css.matchAll(/url\(['"]?((?!data:|https?:)[^'")]+)['"]?\)/g)].map(m => m[1]),
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
   unknown key — including a `comment` key, since JSON has no comment syntax.
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

console.log(problems ? `\n${problems} problem(s)` : '\nFrontend wiring is consistent.')
process.exit(problems ? 1 : 0)
