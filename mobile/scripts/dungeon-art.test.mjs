import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const shell = new URL('../app-shell/', import.meta.url)
const context = vm.createContext({})
vm.runInContext(fs.readFileSync(new URL('dungeon-art.js', shell), 'utf8').replace(/export /g, ''), context)

test('all six bundled character skins use actual complete square-frame sheets', () => {
  for (const skin of ['Samurai', 'Samurai_Archer', 'Samurai_Commander', 'Kunoichi', 'Ninja_Monk', 'Ninja_Peasant']) {
    const markup = context.dungeonSprite({ spriteKey: skin })
    assert.match(markup, new RegExp(`data-skin="${skin}"`))
    const frames = Number(markup.match(/--frames:(\d+)/)[1])
    const data = fs.readFileSync(new URL(`art/characters/${skin}/Idle.png`, shell))
    assert.equal(data.readUInt32BE(16), data.readUInt32BE(20) * frames)
    for (const motion of ['Attack_1', 'Hurt', 'Dead', 'Run']) {
      const source = context.dungeonSprite({ spriteKey: skin }, false, motion)
      const buffer = fs.readFileSync(new URL(source.match(/url\('([^']+)'/)[1], shell))
      assert.equal(buffer.readUInt32BE(16), buffer.readUInt32BE(20) * Number(source.match(/--frames:(\d+)/)[1]))
    }
  }
})

test('unscaled or invalid positions never invent spatial movement', () => {
  assert.equal(context.dungeonPosition({ id: 'p' }, { p: { x: 15, y: 30 } }), null)
  assert.equal(context.dungeonPosition({ id: 'p' }, { p: { xPercent: 101, yPercent: 30 } }), null)
  assert.equal(context.dungeonPosition({ id: 'p' }, { p: { xPercent: '20', yPercent: 30 } }), null)
  assert.equal(context.dungeonPosition({ id: 'p' }, { p: { x: 1, y: 1 } }, { minX: 0, maxX: 0, minY: 0, maxY: 10 }), null)
  const actual = context.dungeonPosition({ id: 'p' }, { p: { x: 5, y: 10 } }, { minX: 0, maxX: 10, minY: 0, maxY: 20 })
  assert.equal(actual.left, '50%'); assert.equal(actual.top, '66.5%')
})

test('unknown or malicious skin values resolve only to bundled cosmetic defaults', () => {
  assert.equal(context.dungeonSkin({ spriteKey: '../../untrusted' }), 'Samurai')
  assert.equal(context.dungeonSkin({ spriteKey: '"><script>' }, true), 'Ninja_Peasant')
  assert.equal(context.dungeonSkin({ name: 'Samurai Commander' }), 'Samurai_Commander')
  assert.equal(context.dungeonSkin({ characterId: 'character:kunoichi' }), 'Kunoichi')
  assert.doesNotMatch(context.dungeonSprite({ spriteKey: 'https://external.invalid/tracker.png' }), /external|tracker/)
})
