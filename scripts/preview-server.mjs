#!/usr/bin/env node
/**
 * scripts/preview-server.mjs — local preview server for the static site.
 *
 * NOT part of the deployed bundle. Vercel serves the site and the bot serves
 * `/api`; locally there is no bot, and api.js deliberately points at
 * same-origin `/api` when the host is localhost (see resolveBase in
 * assets/js/api.js — "Bot and site on the same host (local dev)"). Without
 * something answering those routes every page boots into empty states and a
 * stack of error toasts, which makes it impossible to look at the design.
 *
 * So this serves the files AND answers the handful of read-only endpoints the
 * UI needs, with representative data. Nothing here is authoritative: prices
 * are invented, players are invented, and no write endpoint is implemented
 * (buying, spinning, auth all still fail, which is the point — this server
 * must never be mistaken for the bot).
 *
 *   node scripts/preview-server.mjs [port]
 *
 * Port defaults to 3000, bound to 0.0.0.0 so it can be previewed through a
 * sandbox proxy. Override the API target in the browser with ?api=<url> to
 * point the same build at a real bot.
 */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PORT = Number(process.argv[2] || process.env.PORT || 3000)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.map': 'application/json; charset=utf-8',
}

/* ───────────────────────────── mock data ─────────────────────────────── */

const SEASON = { number: 4, name: 'Emberfall', endsAt: Date.now() + 1000 * 60 * 60 * 24 * 12 }

const NAMES = [
  'Astral', 'Mei', 'Vesper', 'Kairo', 'Nyx', 'Sable', 'Orin', 'Juno',
]

const ROWS = NAMES.map((name, i) => ({
  position: i + 1,
  uid: `uid-${i + 1}`,
  name,
  level: 84 - i * 4,
  display: (84 - i * 4).toLocaleString(),
  rank: { title: ['Mythic', 'Legend', 'Hero', 'Champion', 'Knight', 'Squire', 'Squire', 'Novice'][i] },
  classId: ['warrior', 'mage', 'rogue', 'healer'][i % 4],
  premium: i < 2,
  avatarUrl: null,
}))

const CHARACTERS = [
  { id: 'mei', name: 'Mei', stars: 6, tag: 'mythic', description: 'The last ember of the old sun, still burning.', image: '/assets/sprites/pokemon/6.png' },
  { id: 'vesper', name: 'Vesper', stars: 5, tag: 'legendary', description: 'Shadow-dancer of the ninth floor.', image: '/assets/sprites/pokemon/94.png' },
  { id: 'kairo', name: 'Kairo', stars: 5, tag: 'legendary', description: 'Runs the deep runs nobody else survives.', image: '/assets/sprites/pokemon/448.png' },
  { id: 'nyx', name: 'Nyx', stars: 4, tag: 'epic', description: 'Reads the board before it is written.', image: '/assets/sprites/pokemon/249.png' },
  { id: 'sable', name: 'Sable', stars: 4, tag: 'epic', description: 'Carries the party through the ash.', image: '/assets/sprites/pokemon/133.png' },
  { id: 'orin', name: 'Orin', stars: 3, tag: 'rare', description: 'A steady hand and a heavy shield.', image: '/assets/sprites/pokemon/150.png' },
  { id: 'juno', name: 'Juno', stars: 3, tag: 'rare', description: 'Lightning in a very small frame.', image: '/assets/sprites/pokemon/25.png' },
  { id: 'rook', name: 'Rook', stars: 2, tag: 'uncommon', description: 'New to the dungeon, first to volunteer.', image: '/assets/sprites/pokemon/384.png' },
]

const CLASSES = [
  { id: 'warrior', name: 'Warrior', description: 'High HP, heavy hits. The party wall.' },
  { id: 'mage', name: 'Mage', description: 'Burst damage from the back line.' },
  { id: 'rogue', name: 'Rogue', description: 'Fast, slippery, lethal on the first turn.' },
  { id: 'healer', name: 'Healer', description: 'Keeps everyone else standing.' },
]

const RACES = [
  { id: 'human', name: 'Human', description: 'Balanced stats, no weaknesses.' },
  { id: 'celestial', name: 'Celestial', description: 'Bonus to light damage and recovery.' },
  { id: 'shade', name: 'Shade', description: 'Higher evasion, lower raw HP.' },
  { id: 'beastkin', name: 'Beastkin', description: 'Extra stamina and speed.' },
]

/* Character detail reads `character`; the roster rows above only need the
 * card fields. Built lazily so the extra fields live in one place. */
const DETAIL = {
  mei: { rarity: 'mythic', characterTier: 'S', ability: { name: 'Ember Crown', flavor: 'Burns the first attacker each floor.' }, statBonuses: { atk: 34, hp: 210, spd: 12, luck: 8 } },
  vesper: { rarity: 'legendary', characterTier: 'A', ability: { name: 'Nightstep', flavor: 'Ignores the first hit of a battle.' }, statBonuses: { atk: 26, hp: 160, spd: 24, luck: 6 } },
  kairo: { rarity: 'legendary', characterTier: 'A', ability: { name: 'Deep Delve', flavor: 'Extra loot on floors past 150.' }, statBonuses: { atk: 21, hp: 190, spd: 10, luck: 14 } },
}

const API = {
  '/meta': {
    ok: true,
    botName: 'Astral',
    prefix: '.',
    supportGroupLink: 'https://chat.whatsapp.com/JgNPcpdYy7gEx9HzJ6GOEW',
    season: SEASON,
    classes: CLASSES,
    races: RACES,
  },

  '/stats': {
    ok: true,
    players: 14238,
    newThisWeek: 386,
    commandsToday: 92174,
    botsOnline: 2,
    highestLevel: 84,
    deepestFloor: 212,
    dungeonsConquered: 41207,
    charactersAvailable: 128,
    season: SEASON,
  },

  '/leaderboard': { ok: true, rows: ROWS, total: 14238, label: 'level' },

  '/characters': {
    ok: true,
    characters: CHARACTERS,
  },

  '/spins': { ok: true, banners: [] },

  '/season': { ok: true, active: false },

  '/premium': {
    ok: true,
    nairaPerUsd: 1550,
    botNumber: '+234 800 000 0000',
    plans: [
      { id: 'monthly', label: 'Monthly', priceNaira: 3100, durationDays: 30, perDayNaira: 103, command: '.premium monthly' },
      { id: 'quarterly', label: 'Quarterly', priceNaira: 7750, durationDays: 90, perDayNaira: 86, command: '.premium quarterly' },
      { id: 'yearly', label: 'Yearly', priceNaira: 24800, durationDays: 365, perDayNaira: 68, command: '.premium yearly' },
    ],
    gemPackages: [
      { id: 'small', gems: 100, priceNaira: 1550, perGemNaira: 16, command: '.buygems 100' },
      { id: 'medium', gems: 500, priceNaira: 6200, perGemNaira: 12, command: '.buygems 500' },
      { id: 'large', gems: 1200, priceNaira: 12400, perGemNaira: 10, command: '.buygems 1200' },
    ],
    you: null,
  },

  '/shop': {
    ok: true,
    you: null,
    shelves: [
      {
        key: 'gear', label: 'Gear', emoji: '⚔',
        groups: [
          {
            label: 'Weapons',
            rows: [
              { id: 'choice-band', name: 'Choice Band', image: '/assets/sprites/items/choice-band.png', rarity: 'epic', type: 'held', description: 'Locks a move, then hits far harder with it.', buyPrice: 2400, levelReq: 1 },
              { id: 'life-orb', name: 'Life Orb', image: '/assets/sprites/items/life-orb.png', rarity: 'rare', type: 'held', description: 'Trades a little health for a lot of damage.', buyPrice: 1650, levelReq: 4 },
              { id: 'focus-sash', name: 'Focus Sash', image: '/assets/sprites/items/focus-sash.png', rarity: 'rare', type: 'held', description: 'Survives one otherwise-fatal hit on full health.', buyPrice: 1400, levelReq: 6 },
              { id: 'assault-vest', name: 'Assault Vest', image: '/assets/sprites/items/assault-vest.png', rarity: 'uncommon', type: 'armor', description: 'Bulky against casters, useless with status moves.', buyPrice: 980, levelReq: 8 },
            ],
          },
          {
            label: 'Trinkets',
            rows: [
              { id: 'lucky-egg', name: 'Lucky Egg', image: '/assets/sprites/items/lucky-egg.png', rarity: 'legendary', type: 'held', description: 'More experience from every floor cleared.', buyPrice: 6200, levelReq: 12 },
              { id: 'amulet-coin', name: 'Amulet Coin', image: '/assets/sprites/items/amulet-coin.png', rarity: 'epic', type: 'held', description: 'Doubles the solars a run pays out.', buyPrice: 3100, levelReq: 10 },
              { id: 'everstone', name: 'Everstone', image: '/assets/sprites/items/everstone.png', rarity: 'common', type: 'held', description: 'Stops evolution. Keeps the tier you built for.', buyPrice: 300, levelReq: 1 },
            ],
          },
        ],
      },
      {
        key: 'supplies', label: 'Supplies', emoji: '✚',
        groups: [
          {
            label: 'Potions',
            rows: [
              { id: 'hyper-potion', name: 'Hyper Potion', image: '/assets/sprites/items/hyper-potion.png', rarity: 'common', type: 'consumable', description: 'Restores 200 HP mid-run.', buyPrice: 420, levelReq: 1 },
              { id: 'max-potion', name: 'Max Potion', image: '/assets/sprites/items/max-potion.png', rarity: 'uncommon', type: 'consumable', description: 'Full restore, one use.', buyPrice: 900, levelReq: 3 },
              { id: 'max-revive', name: 'Max Revive', image: '/assets/sprites/items/max-revive.png', rarity: 'rare', type: 'consumable', description: 'Brings a downed character back at full HP.', buyPrice: 1500, levelReq: 5 },
              { id: 'full-heal', name: 'Full Heal', image: '/assets/sprites/items/full-heal.png', rarity: 'common', type: 'consumable', description: 'Clears every status effect.', buyPrice: 260, levelReq: 1 },
            ],
          },
          {
            label: 'Balls',
            rows: [
              { id: 'great-ball', name: 'Great Ball', image: '/assets/sprites/items/great-ball.png', rarity: 'uncommon', type: 'consumable', description: 'A better catch rate on dungeon spawns.', buyPrice: 600, levelReq: 2 },
              { id: 'master-ball', name: 'Master Ball', image: '/assets/sprites/items/master-ball.png', rarity: 'legendary', type: 'consumable', description: 'Never fails. One per season.', buyPrice: 24000, levelReq: 20 },
            ],
          },
        ],
      },
      {
        key: 'relics', label: 'Relics', emoji: '✦',
        groups: [
          {
            label: 'Season relics',
            rows: [
              { id: 'light-ball', name: 'Light Ball', image: '/assets/sprites/items/light-ball.png', rarity: 'mythic', type: 'relic', description: 'Season 4 only. Doubles the holder\'s special attack.', buyPrice: 41000, levelReq: 1 },
              { id: 'leftovers', name: 'Leftovers', image: '/assets/sprites/items/leftovers.png', rarity: 'epic', type: 'relic', description: 'Heals a little at the end of every floor.', buyPrice: 5200, levelReq: 15 },
            ],
          },
        ],
      },
    ],
  },

  '/cards/prices': { ok: true, tiers: [] },
  '/cards/catalog': {
    ok: true,
    hasMore: false,
    cards: [
      { tier: 1, title: 'Ember Cub', series: 'Emberfall', imageUrl: '/assets/sprites/pokemon/6.png' },
      { tier: 2, title: 'Night Wisp', series: 'Emberfall', imageUrl: '/assets/sprites/pokemon/94.png' },
      { tier: 2, title: 'Cinder Hound', series: 'Ash Road', imageUrl: '/assets/sprites/pokemon/133.png' },
      { tier: 3, title: 'Ash Blade', series: 'Ash Road', imageUrl: '/assets/sprites/pokemon/448.png' },
      { tier: 3, title: 'Tide Caller', series: 'Deep Water', imageUrl: '/assets/sprites/pokemon/249.png' },
      { tier: 4, title: 'Storm Runner', series: 'Deep Water', imageUrl: '/assets/sprites/pokemon/25.png' },
      { tier: 4, title: 'Bone Warden', series: 'The Ninth', imageUrl: '/assets/sprites/pokemon/150.png' },
      { tier: 5, title: 'Glass Serpent', series: 'The Ninth', imageUrl: '/assets/sprites/pokemon/384.png' },
      { tier: 6, title: 'Crown of Embers', series: 'Emberfall', imageUrl: '/assets/sprites/pokemon/6.png' },
      { tier: 'S', title: 'The Last Flame', series: 'Season 4', imageUrl: '/assets/sprites/pokemon/94.png' },
    ],
  },

  '/events': { ok: true, events: [] },
  '/notifications': { ok: true, notifications: [] },
  '/health': { ok: true, status: 'preview' },
}

/* ──────────────────────────────── server ─────────────────────────────── */

const json = (res, body, status = 200) => {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(payload)
}

async function serveFile(res, path) {
  const clean = normalize(decodeURIComponent(path.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  let target = join(ROOT, clean)

  try {
    const info = await stat(target)
    if (info.isDirectory()) target = join(target, 'index.html')
  } catch {
    // Same fallback as vercel.json: anything that isn't a file is the app.
    target = join(ROOT, 'index.html')
  }

  try {
    const body = await readFile(target)
    const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream'
    // Source files must never be cached while iterating on a design.
    const cache = /\.(png|jpg|jpeg|webp|gif|woff2|mp4|svg)$/i.test(target)
      ? 'public, max-age=3600'
      : 'no-store'
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname

  if (path.startsWith('/api/')) {
    const key = path.slice(4).replace(/\/+$/, '')

    // /api/characters/:id — the detail modal. One row of the roster plus the
    // extra fields the modal reads.
    const charPrefix = '/characters/'
    const charId = key.startsWith(charPrefix) ? key.slice(charPrefix.length) : ''
    if (charId && !charId.includes('/')) {
      const row = CHARACTERS.find((c) => c.id === charId)
      if (!row) return json(res, { ok: false, error: 'No such character.' }, 404)
      return json(res, {
        ok: true,
        character: { ...row, ...(DETAIL[row.id] ?? {}) },
        owned: false,
        equipped: false,
        wielders: ROWS.slice(0, 3),
        wielderCount: 3,
      })
    }

    const match = API[key]
    if (match) return json(res, match)
    // Anything not mocked: an empty success rather than a 404, so a page
    // renders its empty state instead of an error toast.
    return json(res, { ok: true, rows: [], items: [], total: 0 })
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, { ok: false, error: 'This preview server is read-only.' }, 405)
  }

  return serveFile(res, path === '/' ? '/index.html' : path)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Astral preview → http://localhost:${PORT}`)
  console.log('Read-only mock API under /api/* — no writes, no real player data.')
})
