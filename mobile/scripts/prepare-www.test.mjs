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
  const source = fs.readFileSync(`${site}/assets/js/app.js`, 'utf8')
  const bundled = fs.readFileSync(`${mobile}/www/assets/js/app.js`, 'utf8')
  const characterModal = (text) => {
    const match = text.match(/async function openCharacter\(id\) \{[\s\S]*?\n\}/)
    assert.ok(match, 'character modal exists')
    return match[0]
  }
  assert.match(characterModal(source), /class="cc-wrap"/)
  assert.equal(characterModal(bundled), characterModal(source))
  assert.match(bundled, /class="profile-banner-edit"/)
  assert.match(bundled, /window\.__astralInv = state\.inv/)
  assert.match(bundled, /const next = pendingRoute \?\? 'welcome'/)

  for (const file of ['app.js', 'api.js']) {
    execFileSync(process.execPath, ['--input-type=module', '--check'], {
      input: fs.readFileSync(`${mobile}/www/assets/js/${file}`, 'utf8'),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }
})
