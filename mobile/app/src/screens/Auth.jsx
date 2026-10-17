/** Sign-in: name -> confirm account -> OTP code (same three steps as the site). */
import React, { useState } from 'react'
import { api } from '../lib/data.js'
import { go } from '../router.jsx'

export default function Auth() {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [target, setTarget] = useState(null)
  const [found, setFound] = useState(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function find(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const acct = await api.lookupAccount(name.trim())
      setFound(acct)
      setTarget(acct?.handle || acct?.phone ? acct : { handle: name.trim() })
      setStep(2)
    } catch (e2) { setErr(e2?.message || 'No account with that name.') } finally { setBusy(false) }
  }

  async function send() {
    setErr(''); setBusy(true)
    try {
      await api.requestOtp(target)
      setStep(3)
    } catch (e2) { setErr(e2?.message || 'Could not send the code.') } finally { setBusy(false) }
  }

  async function verify(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      await api.verifyOtp(target, code.trim())
      go('home')
    } catch (e2) { setErr(e2?.message || 'That code did not match.') } finally { setBusy(false) }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <img src="./app-logo.png" alt="" />
        <h1>Astral</h1>
        <p>Dungeons, cards and companions</p>
      </div>

      <div className="card auth-card">
        {step === 1 && (
          <form onSubmit={find}>
            <h2>Sign in</h2>
            <p className="muted">Your username — the code goes to the linked WhatsApp account.</p>
            <input
              className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Astral" autoCapitalize="off" spellCheck={false} autoFocus
            />
            {err && <p className="err">{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
              {busy ? 'Finding…' : 'Find my account'}
            </button>
          </form>
        )}

        {step === 2 && (
          <div>
            <h2>Is this you?</h2>
            <div className="auth-found">
              <strong>{found?.name || name}</strong>
              <span className="muted">{found?.handle || found?.phone || 'Linked WhatsApp account'}</span>
            </div>
            <p className="muted small">We send a 6-digit code — no password to remember.</p>
            {err && <p className="err">{err}</p>}
            <button className="btn btn-primary btn-block" onClick={send} disabled={busy}>
              {busy ? 'Sending…' : 'Send the code'}
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => setStep(1)}>Not you — go back</button>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={verify}>
            <h2>Enter your code</h2>
            <p className="muted">6 digits, sent to your WhatsApp.</p>
            <input
              className="input code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" placeholder="••••••" autoFocus
            />
            {err && <p className="err">{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || code.length < 6}>
              {busy ? 'Verifying…' : 'Sign in'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setStep(2)}>Use another number</button>
          </form>
        )}
      </div>

      <p className="auth-alt muted">
        New here? Create your character with the bot in WhatsApp first.
      </p>
    </div>
  )
}
