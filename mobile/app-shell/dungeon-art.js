// Frame counts measured from the source sheets; no remote asset dependency.
const dungeonSkins = {
  "Samurai": {
    "Idle": 6,
    "Attack_1": 4,
    "Attack_2": 5,
    "Hurt": 3,
    "Dead": 6,
    "Run": 8,
    "Protection": 2
  },
  "Samurai_Archer": {
    "Idle": 9,
    "Attack_1": 5,
    "Attack_2": 5,
    "Hurt": 3,
    "Dead": 5,
    "Run": 8
  },
  "Samurai_Commander": {
    "Idle": 5,
    "Attack_1": 4,
    "Attack_2": 5,
    "Hurt": 2,
    "Dead": 6,
    "Run": 8,
    "Protect": 2
  },
  "Kunoichi": {
    "Idle": 9,
    "Attack_1": 6,
    "Attack_2": 8,
    "Cast": 6,
    "Hurt": 2,
    "Dead": 5,
    "Run": 8
  },
  "Ninja_Monk": {
    "Idle": 7,
    "Attack_1": 5,
    "Attack_2": 5,
    "Cast": 5,
    "Hurt": 4,
    "Dead": 5,
    "Run": 8
  },
  "Ninja_Peasant": {
    "Idle": 6,
    "Attack_1": 6,
    "Attack_2": 4,
    "Hurt": 2,
    "Dead": 4,
    "Run": 6
  }
}
const dungeonEscape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
export function dungeonSkin(entity = {}, enemy = false) {
  for (const candidate of [entity.spriteKey, entity.skin, entity.character?.spriteKey, entity.characterId, entity.name, entity.id]) {
    const key = String(candidate || '').replace(/^character:/, '').replace(/[ -]/g, '_').toLowerCase()
    const match = Object.keys(dungeonSkins).find(k => k.toLowerCase() === key)
    if (match) return match
  }
  return enemy ? 'Ninja_Peasant' : 'Samurai'
}
export function dungeonSprite(entity = {}, enemy = false, motion = 'Idle') {
  const skin = dungeonSkin(entity, enemy)
  if (!dungeonSkins[skin][motion]) motion = 'Idle'
  const frames = dungeonSkins[skin][motion]
  return `<span class="fighter-sprite ${enemy ? 'fighter-enemy' : ''}" data-skin="${skin}" data-motion="${motion}" style="--frames:${frames};--sheet:url('art/characters/${skin}/${motion}.png')" aria-hidden="true"></span>`
}
export function animateDungeonSprite(host, motion) {
  const sprite = host?.querySelector('.fighter-sprite')
  const skin = sprite?.dataset.skin
  if (!skin) return
  if (!dungeonSkins[skin][motion]) motion = motion === 'Cast' ? 'Attack_2' : motion === 'Protection' ? 'Protect' : 'Idle'
  if (!dungeonSkins[skin][motion] || motion === 'Idle') return
  const frames = dungeonSkins[skin][motion]
  sprite.style.setProperty('--frames', frames)
  sprite.style.setProperty('--sheet', `url('art/characters/${skin}/${motion}.png')`)
  sprite.dataset.motion = motion
  sprite.classList.remove('sprite-once', 'sprite-still')
  // Replacing the animation name restarts the visual after a server response.
  sprite.style.animationName = 'none'
  void sprite.offsetWidth
  sprite.style.animationName = ''
  sprite.classList.add('sprite-once')
  sprite.onanimationend = () => {
    if (motion === 'Dead') {
      sprite.classList.add('sprite-still')
      sprite.style.backgroundPosition = `calc(var(--frame-size) * -${frames - 1}) 0px`
    } else {
      sprite.dataset.motion = 'Idle'
      sprite.style.setProperty('--frames', dungeonSkins[skin].Idle)
      sprite.style.setProperty('--sheet', `url('art/characters/${skin}/Idle.png')`)
      sprite.classList.remove('sprite-once')
    }
    sprite.onanimationend = null
  }
}
export function dungeonActionIcon(type) {
  const icon = { attack: 'sword_iron', skill: 'staff_blue_crystal', consumable: 'health_potion', defend: 'shield_royal', escape: 'boots_leather', dodge: 'boots_leather' }[type]
  return icon ? `<img src="art/icons/${icon}.png" alt="" aria-hidden="true">` : ''
}
// Coordinates are mapped only when the server declares their scale explicitly.
export function dungeonPosition(entity, positions, bounds, role) {
  const entries = Array.isArray(positions) ? positions : Object.entries(positions || {}).map(([id, value]) => ({ id, ...(value && typeof value === 'object' ? value : {}) }))
  const pos = entries.find(p => entity.id != null && p.id === entity.id) || entries.find(p => p.id === role) || entity.position
  if (!pos) return null
  let x = pos.xPercent, y = pos.yPercent
  if (x == null || y == null) {
    if (![bounds?.minX, bounds?.maxX, bounds?.minY, bounds?.maxY, pos.x, pos.y].every(v => typeof v === 'number' && Number.isFinite(v)) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) return null
    x = (pos.x - bounds.minX) / (bounds.maxX - bounds.minX) * 100
    y = (pos.y - bounds.minY) / (bounds.maxY - bounds.minY) * 100
  }
  if (![x,y].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100)) return null
  // Inset the playable region to keep fighters out of the reference HUD/buttons.
  return { left: `${18 + x * .64}%`, top: `${58 + y * .17}%`, label: dungeonEscape(pos.position ?? `${pos.x ?? x}, ${pos.y ?? y}`) }
}
