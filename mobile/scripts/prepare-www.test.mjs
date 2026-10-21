import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import { parseHTML } from 'linkedom'

const mobile = fileURLToPath(new URL('../', import.meta.url))
execFileSync(process.execPath, ['scripts/prepare-www.mjs'], { cwd: mobile })
const read = (file) => fs.readFileSync(path.join(mobile, 'www', file), 'utf8')
const html = read('index.html')
const script = read('design.js')

function app(native = false) {
  const { window, document } = parseHTML(html)
  window.Capacitor = { isNativePlatform: () => native }
  vm.runInNewContext(script, { window, document, CustomEvent: window.CustomEvent, screen: {}, setTimeout: () => 0, clearTimeout: () => {} })
  const click = (q) => {
    const el = document.querySelector(q)
    assert.ok(el, `control exists: ${q}`)
    el.click()
  }
  return { document, click }
}

test('bundles only the new design, all local fonts, and no Pokémon', () => {
  assert.equal(html.replace(/\?v=[a-f0-9]+/g, ''), fs.readFileSync(path.join(mobile, 'app-shell/index.html'), 'utf8'))
  assert.doesNotMatch(html + script + read('design.css'), /pok[eé]mon|showdown|fonts\.googleapis|assets\/js\/app\.js/i)
  assert.equal(fs.existsSync(path.join(mobile, 'www/assets/app/pokemon.js')), false)
  for (const match of (html + read('design.css')).matchAll(/(?:src="|href="|url\()([^"\s)]+)(?:"|\))/g)) {
    const url = match[1].split('?')[0]
    if (url.startsWith('#') || url.startsWith('data:')) continue
    assert.ok(fs.existsSync(path.join(mobile, 'www', url)), `bundled asset exists: ${url}`)
  }
  execFileSync(process.execPath, ['--check', path.join(mobile, 'www/design.js')])
})

test('all five floating tabs navigate and expose their active state', () => {
  const { document, click } = app()
  for (const name of ['shop', 'fight', 'premium', 'profile', 'home']) {
    click(`.tab[data-v="${name}"]`)
    assert.equal(document.querySelector(`#v-${name}`).hidden, false)
    assert.equal(document.querySelectorAll('.view:not([hidden])').length, 1)
    assert.equal(document.querySelector('.tab[aria-current="page"]').dataset.v, name)
  }
})

test('all declared destinations exist; settings back and dungeon navigation work', () => {
  const { document, click } = app()
  for (const el of document.querySelectorAll('[data-go], [data-root]')) {
    assert.ok(document.getElementById(`v-${el.dataset.go || el.dataset.root}`))
  }
  click('#v-home .tools .rb:nth-child(3)')
  assert.equal(document.querySelector('#v-settings').hidden, false)
  click('#back')
  assert.equal(document.querySelector('#v-home').hidden, false)
  click('.tab[data-v="fight"]')
  click('#v-fight [data-go="dg-prep"]')
  assert.equal(document.querySelector('#v-dg-prep').hidden, false)
  click('#v-dg-prep [data-go="dg-combat"]')
  assert.equal(document.querySelector('#v-dg-combat').hidden, false)
  click('#cb-gear')
  assert.equal(document.querySelector('#cb-pause').hidden, false)
  click('#cb-leave')
  assert.equal(document.querySelector('#v-fight').hidden, false)
})

test('notifications, premium billing selection, and native chrome behave correctly', () => {
  const { document, click } = app(true)
  assert.ok(document.documentElement.classList.contains('native-app'))
  click('#v-home .tools .rb:nth-child(1)')
  assert.equal(document.querySelector('#dd-notif').hidden, false)
  click('#dd-read')
  assert.equal(document.querySelectorAll('.dd-item.un').length, 0)
  click('.tab[data-v="premium"]')
  click('.pm-seg [data-u="year"]')
  assert.equal(document.querySelector('#pm-unit').textContent, '/ year')
})
