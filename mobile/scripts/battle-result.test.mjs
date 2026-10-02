import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const mobile = fileURLToPath(new URL('../', import.meta.url))
const battleSource = fs.readFileSync(`${mobile}/app-shell/battle.js`, 'utf8')
const drawResultSource = battleSource.match(/^function drawResult\(\) \{[\s\S]*?^\}/m)?.[0]

assert.ok(drawResultSource, 'battle result renderer exists')

test('Continue clears the result guard before returning to the Pokémon page', () => {
  let onContinue
  let returnedToPokemon = false
  const panel = {
    _html: '',
    get innerHTML() { return this._html },
    set innerHTML(value) { this._html = value },
    replaceChildren() { this.innerHTML = '' },
  }
  const button = { addEventListener(type, fn) { if (type === 'click') onContinue = fn } }
  const $ = (selector) => selector === '#pkCmd' ? panel : selector === '#pkDone' ? button : null
  const onExit = () => {
    // renderPokemon skips a redraw while the result's Continue button is still in the DOM.
    if (!panel.innerHTML.includes('id="pkDone"')) returnedToPokemon = true
  }
  const state = {
    b: { result: 'caught', you: { team: [] } },
    summary: { result: 'caught', caught: 'Pikachu' },
    token: 0,
  }
  const render = new Function('S', '$', 'num', 'esc', 'spriteImg', 'speciesOf', 'onExit',
    `${drawResultSource}; return drawResult`)(
      state,
      $,
      value => String(value ?? 0),
      value => String(value ?? ''),
      () => '<img>',
      () => ({}),
      onExit,
    )

  render()
  assert.match(panel.innerHTML, /id="pkDone"/)
  assert.equal(typeof onContinue, 'function')
  onContinue()

  assert.equal(state.b, null)
  assert.equal(state.summary, null)
  assert.equal(returnedToPokemon, true)
})
