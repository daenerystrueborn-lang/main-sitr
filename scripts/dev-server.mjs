/**
 * dev-server.mjs — zero-dependency static server for local preview.
 *
 * `npx serve` can't be launched from a path containing a space on this box,
 * and there's no python on it either, so this stands in: plain node, no
 * install step. It mirrors the two vercel.json behaviours that actually
 * affect how the page renders locally — real files win, and anything else
 * falls back to index.html so the hash router still boots on a deep link.
 */
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 4321

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
}

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  // Resolve inside ROOT only — a request for /../.env must not escape.
  const target = path.join(ROOT, path.normalize(url).replace(/^(\.\.[/\\])+/, ''))
  const file = target.startsWith(ROOT) && fs.existsSync(target) && fs.statSync(target).isFile()
    ? target
    : path.join(ROOT, 'index.html')

  const body = fs.readFileSync(file)
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  res.end(body)
  console.log(`${res.statusCode} ${url}${file.endsWith('index.html') && !url.endsWith('.html') && url !== '/' ? '  (fallback)' : ''}`)
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`))
