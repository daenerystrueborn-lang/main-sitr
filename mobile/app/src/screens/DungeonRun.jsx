/** Dungeon run walk-through: floors as rooms, cleared up to your record,
 *  next room up, deeper rooms locked. Data is real (deepest floor / stats);
 *  room names are flavor — the run itself plays out in the WhatsApp chat. */
import React, { useEffect, useState } from 'react'
import { api, signedIn } from '../lib/data.js'
import { num, OPEN } from '../lib/fmt.js'
import { Skel, Tiles } from '../ui.jsx'
import { Link, go } from '../router.jsx'

const ROOMS = [
  ['Moss-Lit Gate', 'Slimes and loose change'],
  ['Flooded Gallery', 'Water types, sunken chests'],
  ['Ember Stair', 'Burnt packs, ember shards'],
  ['Whisper Vaults', 'Ghost encounters, rare loot'],
  ['Rootcellar Deep', 'Grass ambushes, herbs'],
  ['Crystal Junction', 'Gem moles, crystal dust'],
  ['The Iron Choir', 'Steel songs, plated foes'],
  ['Ashen Landing', 'Final rest before the core'],
]
const roomOf = (n) => ROOMS[(n - 1) % ROOMS.length]

const readLoadout = () => {
  try { return JSON.parse(localStorage.getItem('astral:loadout') || '{}') } catch { return {} }
}

export default function DungeonRun() {
  const [d, setD] = useState({})
  useEffect(() => {
    let dead = false
    Promise.allSettled([
      api.stats().then(s => !dead && setD(x => ({ ...x, stats: s }))),
      signedIn() && api.me().then(r => r?.player?.uid && api.player(r.player.uid)).then(det => !dead && setD(x => ({ ...x, mine: det?.player ?? null }))).catch(() => {}),
    ].filter(Boolean))
    return () => { dead = true }
  }, [])

  const loadout = readLoadout()
  const partyCount = Array.isArray(loadout.party) ? loadout.party.length : 0
  const itemCount = Array.isArray(loadout.items) ? loadout.items.length : 0
  const deepest = d.mine?.dungeon?.deepestFloor ?? d.stats?.deepestFloor ?? null
  const nextFloor = deepest == null ? 1 : deepest + 1
  const show = d.stats === undefined ? [] : Array.from({ length: Math.max(8, nextFloor + 4) }, (_, i) => i + 1)

  if (d.stats === undefined && d.mine === undefined) {
    return <div className="page"><Skel h={120} /><Skel h={80} /><Skel h={80} /></div>
  }

  return (
    <div className="page">
      <div className="dgn-banner small" style={{ backgroundImage: `linear-gradient(180deg,rgb(0 0 0 / 4%),rgb(0 0 0 / 78%) 88%),url(assets/img/modes/dungeon.jpg)` }}>
        <span className="overline gold">Run in progress</span>
        <h2>Floor {nextFloor}</h2>
      </div>

      <div className="dgn-sheet">
        <Tiles items={[
          [deepest == null ? '—' : num(deepest), 'your record'],
          [num(partyCount), 'squad'],
          [num(itemCount), 'items'],
        ]} />
        <p className="muted small" style={{ margin: '12px 0 0' }}>
          Loadout staged on this device. <Link className="gold" to="dungeon">Edit loadout</Link>
        </p>
      </div>

      <div className="rooms">
        {show.map(n => {
          const cleared = deepest != null && n <= deepest
          const isNext = n === nextFloor
          const locked = deepest != null && n > deepest + 1
          const [name, hint] = roomOf(n)
          return (
            <div key={n} className={'room' + (cleared ? ' done' : isNext ? ' next' : locked ? ' locked' : '')}>
              <span className="room-no">{n}</span>
              <div className="room-body">
                <b>{name}</b>
                <small>{cleared ? 'Cleared' : locked ? 'Locked — clear the floor above' : hint}</small>
              </div>
              <span className="room-state">{cleared ? '✓' : isNext ? '●' : '🔒'}</span>
            </div>
          )
        })}
      </div>

      <div className="card center" style={{ marginTop: 14 }}>
        <p className="muted small">The fight plays out in WhatsApp — open the chat, send <b>/dungeon</b>, and this screen keeps score.</p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => go('dungeon')}>Back to loadout</button>
          <Link className="btn btn-ghost" to="ranks">Floor leaders</Link>
        </div>
      </div>
      <div className="build-space" />
    </div>
  )
}
