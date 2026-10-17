/** Pokémon: squad, bag, collection — read-only in this wave (battle next). */
import React, { useEffect, useState } from 'react'
import { pk, signedIn } from '../lib/data.js'
import { num } from '../lib/fmt.js'
import { Sec, Skel, Tiles } from '../ui.jsx'
import { go } from '../router.jsx'

export default function Pokemon() {
  const [d, setD] = useState({})
  const patch = (k, v) => setD(prev => ({ ...prev, [k]: v }))

  useEffect(() => {
    if (!signedIn()) return
    let dead = false
    Promise.allSettled([
      pk.overview().then(o => !dead && patch('ov', o)).catch(() => {}),
      pk.bag().then(b => !dead && patch('bag', b?.items ?? b?.bag ?? [])).catch(() => !dead && patch('bag', null)),
      pk.mons().then(m => !dead && patch('mons', m?.mons ?? m?.items ?? [])).catch(() => !dead && patch('mons', null)),
    ])
    return () => { dead = true }
  }, [])

  if (!signedIn()) {
    return (
      <div className="page">
        <div className="card center">
          <h3>Your Pokémon live here</h3>
          <p className="muted">Sign in to see your squad, bag and collection.</p>
          <button className="btn btn-primary" onClick={() => go('login')}>Sign in</button>
        </div>
      </div>
    )
  }

  const party = d.ov?.party
  const mons = d.mons

  return (
    <div className="page">
      <Sec title="Party">
        {d.ov === undefined && <Skel h={70} />}
        {d.ov?.needsStarter && <div className="card"><b>Choose your starter</b><p className="muted small">Ask the bot in WhatsApp to start your journey.</p></div>}
        {Array.isArray(party) && (
          <div className="strip">
            {party.map(m => (
              <div className={'chip-pk' + (m.fainted ? ' faint' : '')} key={m.name}>
                <b>{m.nickname || m.name}</b><small>Lv {num(m.level)}</small>
              </div>
            ))}
          </div>
        )}
      </Sec>

      <Sec title="Collection">
        {mons === undefined && <Skel h={140} />}
        {Array.isArray(mons) && mons.length === 0 && <p className="muted">No Pokémon caught yet.</p>}
        {Array.isArray(mons) && mons.length > 0 && (
          <div className="grid-2">
            {mons.slice(0, 24).map((m, i) => (
              <div className="mon-card" key={m.id ?? i}>
                <b>{m.nickname || m.name}</b>
                <small className="muted">Lv {num(m.level)} · #{num(m.dexId)}</small>
              </div>
            ))}
          </div>
        )}
        {Array.isArray(mons) && mons.length > 6 && <p className="muted small">+ {num(mons.length - 6)} more — battle UI lands in the next wave.</p>}
      </Sec>

      <Sec title="Bag">
        {d.bag === undefined && <Skel h={70} />}
        {d.bag === null && <p className="muted">Bag unavailable.</p>}
        {Array.isArray(d.bag) && d.bag.length === 0 && <p className="muted">Empty — loot drops on dungeon runs.</p>}
        {Array.isArray(d.bag) && d.bag.length > 0 && (
          <div className="pick-grid">
            {d.bag.slice(0, 16).map((it, i) => (
              <div className="pick static" key={it.id ?? i}>
                <b>{it.name || 'Item'}</b>
                <small>{it.quantity != null ? `×${num(it.quantity)}` : 'ready'}</small>
              </div>
            ))}
          </div>
        )}
      </Sec>

      <Sec title="Battle" action="Dungeon" actionTo="dungeon">
        <div className="card">
          <b>Hunt & tower battles</b>
          <p className="muted small">The battle engine is being ported to React — until then, tower climbs and hunts run from the chat.</p>
        </div>
      </Sec>
      <div className="build-space" />
    </div>
  )
}
