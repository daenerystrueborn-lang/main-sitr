/** Shop: API shelves + the Heroes shelf (roster as cards), buy flow. */
import React, { useEffect, useState } from 'react'
import { api, signedIn } from '../lib/data.js'
import { num, titleCase } from '../lib/fmt.js'
import { Skel, Sec } from '../ui.jsx'
import { go } from '../router.jsx'

export default function Shop() {
  const [data, setData] = useState(null)
  const [shelfKey, setShelfKey] = useState(null)
  const [hero, setHero] = useState(null)   // open character modal
  const [err, setErr] = useState('')

  useEffect(() => {
    let dead = false
    api.shop().then(sh => {
      if (dead) return
      const shelves = sh?.shelves ?? []
      if (!shelves.some(s => s.key === 'heroes')) shelves.push({ key: 'heroes', emoji: '🦸', label: 'Heroes' })
      setData({ ...sh, shelves })
      setShelfKey(k => (k && shelves.some(s => s.key === k) ? k : shelves[0]?.key))
    }).catch(e => !dead && setErr(e?.message || 'Shop unavailable.'))
    return () => { dead = true }
  }, [])

  const shelf = data?.shelves?.find(s => s.key === shelfKey)
  const you = data?.you
  const discount = you?.discount ?? 0

  async function buy(row, price) {
    if (!signedIn()) return go('login')
    const ok = window.confirm(`Buy ${row.name} for ${num(price)} solars?`)
    if (!ok) return
    try {
      await api.buyItem(row.id, 1)
      alert(`Bought ${row.name}!`)
      const sh = await api.shop()
      const shelves = sh?.shelves ?? []
      if (!shelves.some(s => s.key === 'heroes')) shelves.push({ key: 'heroes', emoji: '🦸', label: 'Heroes' })
      setData({ ...sh, shelves })
    } catch (e) { alert(e?.message || 'Buy failed.') }
  }

  return (
    <div className="page">
      <div className="shop-head">
        <div>
          <h2>Shop</h2>
          <p className="muted small">The same stock the bot sells in chat</p>
        </div>
        {you ? (
          <div className="wallet">{num(you.solars)} <span>solars</span></div>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => go('login')}>Sign in to buy</button>
        )}
      </div>

      <div className="tabs-row">
        {(data?.shelves ?? []).map(s => (
          <button key={s.key} className={'tab-btn' + (s.key === shelfKey ? ' on' : '')} onClick={() => setShelfKey(s.key)}>
            {s.emoji || ''} {s.label}
          </button>
        ))}
      </div>

      {!data && !err && <Skel h={200} />}
      {err && <div className="card center"><p className="muted">{err}</p></div>}

      {data && shelf?.key === 'heroes' && <Heroes onOpen={setHero} />}
      {data && shelf && shelf.key !== 'heroes' && (
        <div className="shop-groups">
          {(shelf.groups ?? []).map(g => (
            <Sec title={g.label} key={g.label}>
              <div className="grid-2">
                {(g.rows ?? []).map(row => {
                  const price = Math.max(1, Math.round((row.buyPrice ?? 0) * (1 - discount / 100)))
                  const locked = you && (you.level ?? 1) < (row.levelReq ?? 1)
                  return (
                    <div className="shop-card" key={row.id}>
                      <h4>{row.name}</h4>
                      {row.description && <p className="muted small">{row.description}</p>}
                      <div className="shop-price"><span className="gold">{num(price)} solars</span>{row.levelReq > 1 && <span className="muted small">Lv {num(row.levelReq)}</span>}</div>
                      <button className="btn btn-primary btn-block btn-sm" disabled={locked} onClick={() => buy(row, price)}>
                        {locked ? `Requires level ${num(row.levelReq)}` : 'Buy'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </Sec>
          ))}
          {(shelf.groups ?? []).length === 0 && <p className="muted">Nothing in this category right now.</p>}
        </div>
      )}

      {hero && <CharSheet id={hero} onClose={() => setHero(null)} />}
      <div className="build-space" />
    </div>
  )
}

function Heroes({ onOpen }) {
  const [rows, setRows] = useState(undefined)
  useEffect(() => {
    let dead = false
    api.characters().then(c => !dead && setRows(c.characters ?? [])).catch(() => !dead && setRows(null))
    return () => { dead = true }
  }, [])
  if (rows === undefined) return <Skel h={220} />
  if (!rows?.length) return <p className="muted">No heroes in the roster yet.</p>
  return (
    <>
      <Sec title="Full roster" action="Tap for the kit">
        <div className="grid-2">
          {rows.map(c => (
            <button className="hero-card" key={c.id} onClick={() => onOpen(c.id)}>
              <div className="hero-art">{c.image ? <img src={c.image} alt="" loading="lazy" /> : <em>✦</em>}</div>
              <span className="stars">{'★'.repeat(Math.max(1, Math.min(6, c.stars || 1)))}</span>
              <h4>{c.name}</h4>
              {(c.tag ?? c.rarity) && <span className="rarity">{titleCase(c.tag ?? c.rarity)}</span>}
              <span className="badge">{c.owned ? 'Yours' : 'View details'}</span>
            </button>
          ))}
        </div>
      </Sec>
    </>
  )
}

function CharSheet({ id, onClose }) {
  const [c, setC] = useState(undefined)
  useEffect(() => {
    let dead = false
    api.character(id).then(r => !dead && setC(r?.character ?? r)).catch(() => !dead && setC(null))
    return () => { dead = true }
  }, [id])
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}>×</button>
        {!c && <Skel h={140} />}
        {c && (
          <>
            <div className="hero-art big">{c.image ? <img src={c.image} alt="" /> : <em>✦</em>}</div>
            <h3>{c.name}</h3>
            <p className="muted small">{[c.rarity && titleCase(c.rarity), c.characterTier && `Tier ${c.characterTier}`].filter(Boolean).join(' · ')}</p>
            {c.description && <p className="muted small">{c.description}</p>}
          </>
        )}
      </div>
    </div>
  )
}
