/**
 * dev-server.mjs - zero-dependency static server for local preview.
 *
 * `npx serve` can't be launched from a path containing a space on this box,
 * and there's no python on it either, so this stands in: plain node, no
 * install step. It mirrors the three vercel.json behaviours that
 * actually affect how the page renders locally - real files win, /api is
 * proxied to the bot, and anything else falls back to index.html so the hash
 * router still boots on a deep link.
 *
 * The /api proxy is the local stand-in for the Vercel rewrite. Point it at
 * whichever bot you want:
 *
 *   BOT_API=http://localhost:7002 node scripts/dev-server.mjs      # local bot
 *   BOT_API=https://your-bot.up.railway.app node scripts/dev-server.mjs
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

const BOT_API = (process.env.BOT_API || 'http://localhost:7002').replace(/\/+$/, '')

/**
 * Same contract as the Vercel rewrite: anything under /api goes to the bot
 * untouched, headers and all, so cookies and bearer tokens behave locally
 * exactly as they will in production.
 */
async function proxyToBot(req, res) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  try {
    const upstream = await fetch(`${BOT_API}${req.url}`, {
      method: req.method,
      headers: { ...req.headers, host: new URL(BOT_API).host },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      redirect: 'manual',
    })
    const body = Buffer.from(await upstream.arrayBuffer())
    const headers = Object.fromEntries(upstream.headers)
    delete headers['content-encoding']
    delete headers['content-length']
    res.writeHead(upstream.status, headers)
    res.end(body)
    console.log(`${upstream.status} ${req.method} ${req.url}  -> ${BOT_API}`)
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: `dev proxy could not reach ${BOT_API}: ${err.message}` }))
    console.log(`502 ${req.method} ${req.url}  -> ${BOT_API} (${err.message})`)
  }
}

http.createServer((req, res) => {
  if ((req.url || '').startsWith('/api/')) return void proxyToBot(req, res)

  const url = decodeURIComponent((req.url || '/').split('?')[0])
// Resolve inside ROOT only - a request for /../.env must not escape.
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
}).listen(PORT, () => {
  console.log(`serving ${ROOT} on http://localhost:${PORT}`)
  console.log(`proxying /api -> ${BOT_API}`)
})
