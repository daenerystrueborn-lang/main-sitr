/** Shared building blocks - the design language lives here:
 *  section headers with pill actions, stat tiles, art cards, skeletons. */
import React from 'react'
import { Link } from './router.jsx'
import { OPEN } from './lib/fmt.js'

export function Sec({ title, action, actionTo, children }) {
  return (
    <section className="sec">
      <div className="sec-head">
        <h3>{title}</h3>
        {action && actionTo && <Link className="pill" to={actionTo}>{action}</Link>}
      </div>
      {children}
    </section>
  )
}

export function Tiles({ items }) {
  if (!items?.length) return null
  return (
    <div className="tiles">
      {items.map(([value, label]) => (
        <div className="tile" key={label}><b>{value}</b><span>{label}</span></div>
      ))}
    </div>
  )
}

export function Skel({ h = 76 }) {
  return <div className="skel" style={{ height: h }} />
}

export function Err({ error, retry }) {
  return (
    <div className="card center">
      <p className="muted">{error}</p>
      {retry && <button className="btn btn-primary" onClick={retry}>Try again</button>}
    </div>
  )
}

export function Soon({ what }) {
  return (
    <div className="page">
      <div className="card soon">
        <div className="soon-ico">✦</div>
        <h2>{what} is being rebuilt</h2>
        <p className="muted">This screen lands in the next React wave. The Dungeon, Home, Shop, Pokémon, Ranks and Settings are already rebuilt.</p>
        <Link className="btn btn-primary" to="home">Back to Home</Link>
      </div>
    </div>
  )
}

/** Guest banner shown when the preview is open without a session. */
export function GuestNote() {
  if (!OPEN) return null
  return null
}

export function ArtMode({ to, title, sub, icon, art }) {
  return (
    <Link
      className="art-mode"
      to={to}
      style={{
        backgroundImage: `linear-gradient(180deg,rgb(6 6 8 / 12%),rgb(6 6 8 / 84%) 76%),url(${art})`,
      }}
    >
      <span className="art-ico">{icon}</span>
      <b>{title}</b>
      <small>{sub}</small>
    </Link>
  )
}
