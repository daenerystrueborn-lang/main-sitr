/* Haptics + sound effects. Sounds are synthesised with WebAudio (no audio files), haptics use the Capacitor plugin
   with navigator.vibrate as the fallback. Both are switchable in Settings. */
import { P } from './prefs.js'
import { call, can } from './native.js'

let ctx = null, master = null
const VOL = { low: 0.35, mid: 0.6, high: 1 }
const level = () => VOL[P.volume] ?? 0.6

function audio() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination) } catch { ctx = null }
  return ctx
}
function live() {
  if (!P.sounds) return null
  const c = audio(); if (!c) return null
  if (c.state === 'suspended') c.resume().catch(() => {})
  return c
}
function tone({ f = 440, to = null, d = 0.12, t = 0, type = 'sine', v = 0.25 }) {
  const c = live(); if (!c) return
  const at = c.currentTime + t, o = c.createOscillator(), g = c.createGain(), vol = Math.max(0.0002, v * level())
  o.type = type; o.frequency.setValueAtTime(f, at)
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + d)
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + d)
  o.connect(g); g.connect(master); o.start(at); o.stop(at + d + 0.03)
}
function noise({ d = 0.12, t = 0, v = 0.2 }) {
  const c = live(); if (!c) return
  const n = Math.max(1, Math.floor(c.sampleRate * d)), buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0)
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n)
  const s = c.createBufferSource(), g = c.createGain(), hp = c.createBiquadFilter()
  s.buffer = buf; g.gain.value = v * level(); hp.type = 'highpass'; hp.frequency.value = 1100
  s.connect(hp); hp.connect(g); g.connect(master); s.start(c.currentTime + t)
}

const VIB = { light: 8, medium: 16, heavy: 30, ok: [12, 40, 18], warn: [20, 40, 20], err: [40, 50, 40] }
const NAT = { light: ['impact', { style: 'LIGHT' }], medium: ['impact', { style: 'MEDIUM' }], heavy: ['impact', { style: 'HEAVY' }],
  ok: ['notification', { type: 'SUCCESS' }], warn: ['notification', { type: 'WARNING' }], err: ['notification', { type: 'ERROR' }] }
function hap(kind) {
  if (!P.haptics) return
  const vib = () => { try { navigator.vibrate?.(VIB[kind] ?? 10) } catch {} }
  if (can() && NAT[kind]) call('Haptics', NAT[kind][0], NAT[kind][1]).catch(vib)
  else vib()
}
const seq = (notes, step = 0.08, o = {}) => notes.forEach((f, i) => tone({ f, t: i * step, d: 0.16, type: 'triangle', v: 0.2, ...o }))

export const tap = () => { hap('light'); tone({ f: 520, to: 660, d: 0.05, type: 'triangle', v: 0.1 }) }
export const tab = () => { hap('light'); tone({ f: 440, to: 560, d: 0.06, type: 'sine', v: 0.12 }) }
export const pick = () => { hap('medium'); tone({ f: 300, to: 540, d: 0.09, v: 0.16 }) }
export const drop = () => { hap('light'); tone({ f: 440, to: 250, d: 0.1, v: 0.16 }) }
export const equip = () => { hap('ok'); tone({ f: 520, d: 0.08, type: 'square', v: 0.08 }); tone({ f: 780, t: 0.07, d: 0.16, type: 'triangle', v: 0.18 }) }
export const heart = () => { hap('light'); tone({ f: 700, to: 1050, d: 0.09, v: 0.15 }) }
export const error = () => { hap('err'); tone({ f: 210, to: 150, d: 0.16, type: 'square', v: 0.1 }) }
export const hit = (strong = false) => {
  hap(strong ? 'heavy' : 'medium'); noise({ d: strong ? 0.2 : 0.12, v: strong ? 0.3 : 0.2 }); tone({ f: strong ? 200 : 170, to: 60, d: 0.16, type: 'square', v: strong ? 0.22 : 0.14 })
}
export const caught = () => { hap('ok'); seq([523, 659, 784, 1047], 0.1) }
export const win = () => { hap('ok'); seq([392, 523, 659, 784], 0.11); tone({ f: 1047, t: 0.5, d: 0.5, type: 'triangle', v: 0.2 }) }
export const lose = () => { hap('warn'); seq([330, 262, 208], 0.18, { type: 'sine', d: 0.28 }) }
export const levelUp = () => { hap('ok'); seq([523, 659, 784, 1047, 1319], 0.07) }
export const pull = (tier) => {
  const hi = /^(s|6|5)$/i.test(String(tier ?? '')); hap(hi ? 'heavy' : 'ok')
  for (let i = 0; i < (hi ? 8 : 5); i++) tone({ f: 880 + i * 190, t: i * 0.065, d: 0.2, v: 0.09 })
  if (hi) seq([523, 659, 784], 0.12, { t: 0.45 })
}
export function result(res, ups = 0) {
  if (res === 'won') win(); else if (res === 'caught') caught(); else if (res === 'lost') lose(); else tap()
  if (ups > 0) setTimeout(levelUp, 650)
}

// every interactive control gets a soft tick; tabs get their own
const TICK = '.btn, .pk-big, .pk-location-card, .st-sw, .st-seg button, .pk-start-hunt, .bn-seg button, .bn-tabs button, .bn-chip, .bn-heart, .holo-actions button, [data-share]'
document.addEventListener('click', (e) => {
  if (e.target.closest('.app-tab')) return tab()
  if (e.target.closest(TICK)) tap()
}, true)
window.addEventListener('astral:pull', (e) => pull(e.detail?.tier))
// unlock WebAudio on the first touch (Android blocks audio until a gesture)
document.addEventListener('pointerdown', () => { if (P.sounds) audio() && ctx.state === 'suspended' && ctx.resume().catch(() => {}) }, { capture: true })
