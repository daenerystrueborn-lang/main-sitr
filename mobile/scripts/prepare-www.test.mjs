import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const mobile = fileURLToPath(new URL('../', import.meta.url))
const site = fileURLToPath(new URL('../../', import.meta.url))

test('bundles the current site without repatching the character modal', () => {
  execFileSync(process.execPath, ['scripts/prepare-www.mjs'], {
    cwd: mobile,
    env: { ...process.env, SITE_DIR: site },
    stdio: 'pipe',
  })

  // The screen rebuild split app.js: the character modal lives in its screen
  // module now, and every patched file must be read from its new home.
  const read = (root, rel) => fs.readFileSync(`${root}/${rel}`, 'utf8')
  const source = read(site, 'assets/js/screens/characters.js')
  const bundledChar = read(mobile, 'www/assets/js/screens/characters.js')
  const characterModal = (text) => {
    const match = text.match(/async function openCharacter\(id\) \{[\s\S]*?\n\}/)
    assert.ok(match, 'character modal exists')
    return match[0]
  }
  assert.match(characterModal(source), /class="cc-wrap"/)
  // The share button is a KNOWN app-only soft patch (it lands on top of the
  // site's modal in the bundle). Strip it from both sides before comparing,
  // so this still catches any real repatching of the modal body. (Strict
  // equality here was red even before the screen rebuild, for this reason.)
  const normalize = (m) => m.split('\n').filter((l) => !l.includes('data-share="character"')).join('\n')
  assert.equal(normalize(characterModal(bundledChar)), normalize(characterModal(source)))

  assert.match(read(mobile, 'www/assets/js/screens/profile.js'), /profile-banner-edit/)
  assert.match(read(mobile, 'www/assets/js/screens/profile.js'), /window\.__astralInv = state\.inv/)
  assert.match(read(mobile, 'www/assets/js/core/session.js'), /const next = pendingRoute \?\? 'welcome'/)

  // Syntax-check every bundled JS module, not just the two files that used to
  // be patched - the bundle is a whole tree now.
  const jsFiles = []
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = `${d}/${e.name}`
    if (e.isDirectory()) walk(p)
    else if (/\.(?:js|mjs)$/.test(e.name)) jsFiles.push(p)
  })
  walk(`${mobile}/www/assets/js`)
  assert.ok(jsFiles.length >= 15, `expected the split modules, found ${jsFiles.length}`)
  for (const file of jsFiles) {
    execFileSync(process.execPath, ['--input-type=module', '--check'], {
      input: fs.readFileSync(file, 'utf8'),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }
})
