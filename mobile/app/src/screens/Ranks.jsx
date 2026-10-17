/** Ranks: the level leaderboard. */
import React, { useEffect, useState } from 'react'
import { api, signedIn } from '../lib/data.js'
import { num, initials } from '../lib/fmt.js'
import { Skel } from '../ui.jsx'

export default function Ranks() {
  const [rows, setRows] = useState(undefined)
  const [me, setMe] = useState(null)

  useEffect(() => {
    let dead = false
    api.leaderboard('level', 25).then(b => !dead && setRows(b?.rows ?? [])).catch(() => !dead && setRows(null))
    if (signedIn()) api.me().then(r => !dead && setMe(r?.player ?? null)).catch(() => {})
    return () => { dead = true }
  }, [])

  return (
    <div className="page">
      <div className="dgn-sheet" style={{ margin: '6px 0 14px' }}>
        <span className="overline gold">Level leaderboard</span>
        <p className="muted small" style={{ margin: '6px 0 0' }}>Top adventurers across every chat.</p>
      </div>

      {rows === undefined && <Skel h={320} />}
      {rows === null && <div className="card center"><p className="muted">Board unavailable right now.</p></div>}
      {rows?.length === 0 && <p className="muted">No one on the board yet.</p>}
      {rows?.length > 0 && (
        <div className="board">
          {rows.map((r, i) => (
            <div className={'row' + (me?.uid === r.uid ? ' you' : '')} key={r.uid}>
              <span className={'rank r' + Math.min(i + 1, 4)}>{r.position ?? i + 1}</span>
              <span className="av">{r.avatarUrl ? <img src={r.avatarUrl} alt="" /> : initials(r.name)}</span>
              <span className="nm">{r.name}</span>
              <span className="lv">Lv {num(r.level)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="build-space" />
    </div>
  )
}
