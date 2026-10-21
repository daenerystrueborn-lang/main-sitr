/** Bundle the standalone mobile design. The desktop website is not modified or loaded. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mobile = fileURLToPath(new URL('../', import.meta.url))
const source = path.join(mobile, 'app-shell')
const www = path.join(mobile, 'www')
fs.rmSync(www, { recursive: true, force: true })
fs.cpSync(source, www, { recursive: true })
console.log('Bundled the Astral mobile design into', www)

// Reuse the site's shared API client, excluding its unrelated public showcase.
const apiSource = fs.readFileSync(path.join(mobile, '../assets/js/api.js'), 'utf8')
const start = apiSource.indexOf('/* ─────────────────────── Pokémon home-page showcase')
const end = apiSource.indexOf('/* ───────────────────────────── session token')
if (start < 0 || end < start) throw new Error('API extraction anchors changed')
fs.writeFileSync(path.join(www, 'api.js'), apiSource.slice(0, start) + apiSource.slice(end))
const base = process.env.ASTRAL_API_BASE || apiSource.match(/const DEFAULT_BASE = '([^']+)'/)?.[1]
if (!base || !/^https:\/\//.test(base)) throw new Error('ASTRAL_API_BASE must be an HTTPS URL')
fs.writeFileSync(path.join(www, 'config.js'), `window.ASTRAL_API_BASE=${JSON.stringify(base.replace(/\/+$/, ''))};window.ASTRAL_APP_VERSION=${JSON.stringify(process.env.ASTRAL_APP_VERSION || JSON.parse(fs.readFileSync(path.join(mobile, 'package.json'), 'utf8')).version)};\n`)

// Content-version assets so a browser cannot mix a new runtime with an old
// cached dialog stylesheet (the modal otherwise appears as unstyled page text).
const version = (file) => createHash('sha256').update(fs.readFileSync(path.join(www, file))).digest('hex').slice(0, 12)
const processed = new Set()
function versionImports(file) {
  if (processed.has(file)) return
  processed.add(file)
  const location = path.join(www, file)
  const code = fs.readFileSync(location, 'utf8').replace(/from '(\.\/[^']+\.js)'/g, (_, dependency) => {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), dependency))
    versionImports(resolved)
    return `from '${dependency}?v=${version(resolved)}'`
  })
  fs.writeFileSync(location, code)
}
versionImports('bootstrap.js')
const htmlPath = path.join(www, 'index.html')
fs.writeFileSync(htmlPath, fs.readFileSync(htmlPath, 'utf8').replace(/(href|src)="([^"?#]+\.(?:css|js))"/g, (_, attr, file) => `${attr}="${file}?v=${version(file)}"`))
