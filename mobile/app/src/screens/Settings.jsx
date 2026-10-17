/** Settings: the essentials - session, preview state, about. */
import React, { useState } from 'react'
import { hasSession, setToken, API_BASE } from '../lib/data.js'
import { OPEN } from '../lib/fmt.js'
import { go } from '../router.jsx'
import { Sec } from '../ui.jsx'

export default function Settings() {
  const [lite, setLiteState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('astral:prefs') || '{}').lite !== false } catch { return true }
  })
  const authed = hasSession()

  function toggleLite() {
    const next = !lite
    setLiteState(next)
    try {
      const prefs = JSON.parse(localStorage.getItem('astral:prefs') || '{}')
      prefs.lite = next
      localStorage.setItem('astral:prefs', JSON.stringify(prefs))
    } catch {}
  }

  function signOut() {
    setToken(null)
    try { localStorage.removeItem('astral:token') } catch {}
    go('home')
    location.reload()
  }

  return (
    <div className="page">
      <Sec title="Account">
        <div className="card">
          {authed ? (
            <>
              <b>Signed in</b>
              <p className="muted small">Your session lives on this device.</p>
              <button className="btn btn-ghost btn-block" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <b>Not signed in</b>
              <p className="muted small">{OPEN ? 'Preview mode — the whole app is open without an account.' : 'Sign in to sync progress.'}</p>
              {!OPEN && <button className="btn btn-primary btn-block" onClick={() => go('login')}>Sign in</button>}
            </>
          )}
        </div>
      </Sec>

      <Sec title="Performance">
        <button className="setting-row" onClick={toggleLite}>
          <div><b>Lite animations</b><small className="muted">Calmer motion, faster feel</small></div>
          <span className={'switch' + (lite ? ' on' : '')}><i /></span>
        </button>
      </Sec>

      <Sec title="About">
        <div className="card">
          <p className="muted small" style={{ margin: 0 }}>
            Astral · React build {window.ASTRAL_BUILD}<br />
            API: {API_BASE || 'same origin'}
          </p>
        </div>
      </Sec>
      <div className="build-space" />
    </div>
  )
}
