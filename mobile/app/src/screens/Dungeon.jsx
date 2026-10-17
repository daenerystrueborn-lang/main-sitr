/** Dungeon prep / loadout: pick the squad, pack bag items, check the board,
 *  then ENTER the run. Selections persist on-device (astral:loadout). */
import React, { useEffect, useMemo, useState } from 'react'
import { api, pk, call, signedIn } from '../lib/data.js'
import { num, OPEN } from '../lib/fmt.js'
import { Sec, Tiles, Skel } from '../ui.jsx'
import { Link, go } from '../router.jsx'

const LS = 'astral:loadout'
const readLoadout = () => {
  try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} }
}
const writeLoadout = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)) } catch {} }

export default function Dungeon() {
  const [d, setD] = useState({})
  const [sel, setSel] = useState(() => ({ party: null, items: null, ...readLoadout() }))
  const patch = (k, v) => setD(prev => ({ ...prev, [k]: v }))

  useEffect(() => {
    let dead = false
    const jobs = [
      api.stats().then(s => !dead && patch('stats', s)).catch(() => !dead && patch('stats', null)),
      signedIn() && api.me().then(async (r) => {
        const uid = r?.player?.uid
        if (uid) {
          const det = await api.player(uid)
          !dead && patch('mine', det?.player ?? null)
        }
      }).catch(() => !dead && patch('mine', null)),
      signedIn() && pk.overview().then(o => !dead && patch('party', o?.party ?? [])).catch(() => !dead && patch('party', null)),
      signedIn() && pk.bag().then(b => !dead && patch('bag', b?.items ?? b?.bag ?? [])).catch(() => !dead && patch('bag', null)),
      signedIn() && call('/quests').then(q => !dead && patch('quests', q)).catch(() => !dead && patch('quests', null)),
    ].filter(Boolean)
    Promise.allSettled(jobs)
    return () => { dead = true }
  }, [])

  // default selection: first three healthy party members once loaded
  useEffect(() => {
    if (sel.party === null && Array.isArray(d.party)) {
      const next = { ...sel, party: d.party.filter(m => !m.fainted).slice(0, 3).map(m => m.id ?? m.name) }
      setSel(next); writeLoadout(next)
    }
  }, [d.party]) // eslint-disable-line

  const toggle = (key, id) => setSel(prev => {
    const list = Array.isArray(prev[key]) ? prev[key] : []
    const next = { ...prev, [key]: list.includes(id) ? list.filter(x => x !== id) : [...list, id] }
    writeLoadout(next)
    return next
  })

  const dg = d.mine?.dungeon ?? {}
  const floor = dg.deepestFloor ?? d.stats?.deepestFloor ?? 0
  const claimable = Number(d.quests?.claimable) || 0
  const bagCount = Array.isArray(d.bag) ? d.bag.length : 0
  const partySel = Array.isArray(sel.party) ? sel.party : []
  const itemSel = Array.isArray(sel.items) ? sel.items : []

  return (
    <div className="page">
      {/* banner */}
      <div className="dgn-banner" style={{ backgroundImage: `linear-gradient(180deg,rgb(0 0 0 / 4%),rgb(0 0 0 / 78%) 88%),url(assets/img/modes/dungeon.jpg)` }}>
        <span className="overline gold">The crawl</span>
        <h2>Prepare your run</h2>
      </div>

      {/* floor sheet */}
      <div className="dgn-sheet">
        <span className="overline gold">{dg.deepestFloor != null ? 'Your deepest floor' : 'Deepest floor on record'}</span>
        <b className="giant">{num(floor)}</b>
        <p className="muted small">
          {dg.deepestFloor != null
            ? `You conquered ${num(dg.conquered)} runs · record to beat: ${num(d.stats?.deepestFloor ?? 0)}`
            : 'Clear runs in the chat to put your name on it'}
        </p>
        <Tiles items={[
          [num(dg.conquered ?? 0), 'Yours'],
          [num(d.stats?.deepestFloor ?? 0), 'Record'],
          [num(d.stats?.dungeonsConquered ?? 0), 'All-time'],
        ]} />
      </div>

      {/* squad select */}
      <Sec title="Squad loadout" action="Party" actionTo="pokemon">
        {d.party === undefined && <Skel h={70} />}
        {d.party === null && <p className="muted small">{signedIn() ? 'Could not load your party.' : 'Sign in to pick your squad.'}</p>}
        {Array.isArray(d.party) && d.party.length === 0 && <p className="muted small">No Pokémon yet — catch one in the chat.</p>}
        {Array.isArray(d.party) && d.party.length > 0 && (
          <div className="pick-grid">
            {d.party.map(m => {
              const id = m.id ?? m.name
              const on = partySel.includes(id)
              return (
                <button key={id} className={'pick' + (on ? ' on' : '') + (m.fainted ? ' dead' : '')} disabled={m.fainted}
                        onClick={() => toggle('party', id)}>
                  <b>{m.nickname || m.name}</b>
                  <small>Lv {num(m.level)}{m.fainted ? ' · fainted' : ''}</small>
                  <i>{on ? '✓' : '+'}</i>
                </button>
              )
            })}
          </div>
        )}
      </Sec>

      {/* bag select */}
      <Sec title="Bag loadout" action="Inventory" actionTo="pokemon">
        {d.bag === undefined && <Skel h={70} />}
        {d.bag === null && <p className="muted small">{signedIn() ? 'Bag unavailable.' : 'Sign in to pack items.'}</p>}
        {Array.isArray(d.bag) && d.bag.length === 0 && <p className="muted small">Your bag is empty — loot drops as you crawl.</p>}
        {Array.isArray(d.bag) && d.bag.length > 0 && (
          <div className="pick-grid">
            {d.bag.slice(0, 12).map((it, i) => {
              const id = it.id ?? it.name ?? i
              const on = itemSel.includes(id)
              return (
                <button key={id} className={'pick' + (on ? ' on' : '')} onClick={() => toggle('items', id)}>
                  <b>{it.name || 'Item'}</b>
                  <small>{it.quantity != null ? `×${num(it.quantity)}` : (it.qty != null ? `×${num(it.qty)}` : 'ready')}</small>
                  <i>{on ? '✓' : '+'}</i>
                </button>
              )
            })}
          </div>
        )}
      </Sec>

      {/* prep check */}
      <Sec title="Prep check">
        <Tiles items={[
          [partySel.length, 'in squad'],
          [itemSel.length, 'items packed'],
          [claimable > 0 ? `${num(claimable)}!` : '0', 'quests ready'],
        ]} />
        <p className="muted small" style={{ marginTop: 10 }}>
          Runs resolve in the WhatsApp chat — your loadout is staged here and progress syncs back to this screen.
        </p>
      </Sec>

      <button className="play enter" onClick={() => go('dungeon/run')}>ENTER THE DUNGEON <b>→</b></button>
      <div className="build-space" />
    </div>
  )
}
