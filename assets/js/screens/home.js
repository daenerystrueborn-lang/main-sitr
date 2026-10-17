/**
 * screens/home.js - the landing screen: hero, community, modes, Alola roster,
 * how-it-works, top of the board, FAQ, premium CTA.
 *
 * Owns its own <main class="view"> markup (homeHtml); registry.js mounts it.
 */
import { $, $$, esc, attr, num, duration, titleCase, skeletonCards, skeletonRows, emptyState } from '../ui.js'
import { api, fetchSunMoonPokemon } from '../api.js'
import { state } from '../core/state.js'
import { perkIcon, ensureMeta, reportError } from '../core/shared.js'
import { rowHtml } from './leaderboard.js'

export const homeHtml = `
<main class="view active" id="view-home">
  <section class="hero">
    <div class="hero-inner">
      <div class="hero-kicker">A living dungeon crawler for your group chat</div>
      <h1>Build your legend on <span class="grad" id="heroPlatformName">WhatsApp</span></h1>
      <!-- Two surfaces, both real: the chat bot and the Android app. The old
           Discord/Telegram tabs were removed with those adapters in v3.3.2, so
           advertising them here promised a bot that no longer exists. -->
      <div class="platform-switch" id="platformSwitch" role="tablist" aria-label="Choose where to play">
        <button class="platform-tab is-active" type="button" data-platform="whatsapp" role="tab" aria-selected="true">WhatsApp</button>
        <button class="platform-tab" type="button" data-platform="app" role="tab" aria-selected="false">App</button>
      </div>
      <p id="heroSub">Message the bot on WhatsApp, make a character, and start clearing floors.</p>
      <div class="hero-actions" id="heroActions">
        <a class="btn btn-primary" id="heroPlay" href="#/signup">
          <svg class="icon" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/></svg> Start playing
        </a>
        <a class="btn btn-secondary" href="#/leaderboard" data-route="leaderboard">
          <svg class="icon" viewBox="0 0 24 24"><path d="M4 20h16M7 20v-7M12 20V6M17 20v-11"/></svg> See the boards
        </a>
      </div>
      <div class="hero-trust" aria-label="Why players can start quickly">
        <span><i class="trust-dot"></i>Free to start</span>
        <span><i class="trust-dot"></i>Chat or app, one account</span>
        <span><i class="trust-dot"></i>New season live</span>
      </div>
      <div class="chip-row" id="heroChips" style="justify-content:center;margin-top:22px;"></div>
    </div>
  </section>

  <div class="page">
    <section class="section home-stats-section">
      <div class="section-kicker">The world is already moving</div>
      <div class="stat-row" id="homeStats"></div>
    </section>

    <section class="section" aria-labelledby="homeGroupsTitle">
      <div class="section-head">
        <div>
          <div class="section-kicker">Play together</div>
          <h2 id="homeGroupsTitle">Join the WhatsApp community</h2>
          <p>Choose a group and meet the rest of the Astral community.</p>
        </div>
      </div>
      <div class="home-group-grid">
        <article class="home-group-card reveal">
          <div class="home-group-thumb">
            <img src="https://i.pinimg.com/736x/8d/8b/03/8d8b03f2a4a8c1f829494ba64a118cab.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          </div>
          <div class="home-group-content">
            <span class="home-group-label">WhatsApp group</span>
            <h3>Astral League</h3>
            <a class="btn btn-secondary btn-sm home-group-join" href="https://chat.whatsapp.com/JgNPcpdYy7gEx9HzJ6GOEW" target="_blank" rel="noopener noreferrer" aria-label="Join the Astral League WhatsApp group">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 8.5c.4 2.4 2.1 4.6 4.7 5.5l1.5-1.1 1.8.8c-.2 1-1 1.6-2 1.5-3.7-.4-6.8-3.5-7.2-7.2-.1-1 .5-1.8 1.5-2l.8 1.8-1.1 1.5z"/></svg>
              Join group
            </a>
          </div>
        </article>
        <article class="home-group-card reveal">
          <div class="home-group-thumb">
            <img src="https://i.pinimg.com/736x/e1/a2/52/e1a252675c0181820a766377ce8091c5.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          </div>
          <div class="home-group-content">
            <span class="home-group-label">WhatsApp group</span>
            <h3>Spawn Point</h3>
            <a class="btn btn-secondary btn-sm home-group-join" href="https://chat.whatsapp.com/JwqLBVskIDJ8Oa5d0Xt6ZW" target="_blank" rel="noopener noreferrer" aria-label="Join the Spawn Point WhatsApp group">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 8.5c.4 2.4 2.1 4.6 4.7 5.5l1.5-1.1 1.8.8c-.2 1-1 1.6-2 1.5-3.7-.4-6.8-3.5-7.2-7.2-.1-1 .5-1.8 1.5-2l.8 1.8-1.1 1.5z"/></svg>
              Join group
            </a>
          </div>
        </article>
        <article class="home-group-card reveal">
          <div class="home-group-thumb">
            <img src="https://i.pinimg.com/736x/f6/ca/78/f6ca7890a0037455661971d2ebdf4379.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          </div>
          <div class="home-group-content">
            <span class="home-group-label">WhatsApp group</span>
            <h3>Empire GC</h3>
            <a class="btn btn-secondary btn-sm home-group-join" href="https://chat.whatsapp.com/CPOy9Yat1lT7kwxSU1Cfw5" target="_blank" rel="noopener noreferrer" aria-label="Join the Empire GC WhatsApp group">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 8.5c.4 2.4 2.1 4.6 4.7 5.5l1.5-1.1 1.8.8c-.2 1-1 1.6-2 1.5-3.7-.4-6.8-3.5-7.2-7.2-.1-1 .5-1.8 1.5-2l.8 1.8-1.1 1.5z"/></svg>
              Join group
            </a>
          </div>
        </article>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <div class="section-kicker">Choose your way to play</div>
          <h2>Game modes</h2>
          <p>Everything currently live in the bot</p>
        </div>
        <a class="btn btn-ghost btn-sm" href="#/season" data-route="season">See the season →</a>
      </div>
      <div class="grid-4">
        <!-- The --art paths are ROOT-ABSOLUTE on purpose. A relative url() inside
             a custom property is resolved against the stylesheet that consumes
             it (assets/css/style.css), not this document - so 'assets/img/...'
             here silently became '/assets/css/assets/img/...' and 404'd. Leading
             slash removes the base entirely. Don't "tidy" these back to relative. -->
        <a class="feature-card art mode-dungeon reveal" href="#/season" data-route="season" style="--art:url('/assets/img/modes/dungeon.jpg')">
          <div class="feature-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M14.5 3.5l6 6-8 8-6-6 8-8z"/><path d="M3 21l4-1 8.5-8.5"/></svg></div>
          <div class="feature-content"><h3>Dungeon</h3><p>Solo or party raids with loot, bosses and deeper floors.</p></div>
        </a>
        <div class="feature-card art mode-characters reveal" style="--art:url('/assets/img/modes/characters.jpg')">
          <div class="feature-icon"><svg class="icon" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div>
          <div class="feature-content"><h3>Characters</h3><p>Collect and equip companions that buff your stats.</p></div>
        </div>
        <a class="feature-card art mode-arena reveal" href="#/leaderboard" data-route="leaderboard" style="--art:url('/assets/img/modes/arena.jpg')">
          <div class="feature-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/><circle cx="12" cy="12" r="9"/></svg></div>
          <div class="feature-content"><h3>PvP Arena</h3><p>Challenge other players and climb the ranked ladder.</p></div>
        </a>
        <a class="feature-card art mode-battlepass reveal" href="#/season" data-route="season" style="--art:url('/assets/img/modes/battlepass.jpg')">
          <div class="feature-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M12 2l2.4 6.9L21 9l-5 4.6L17.4 21 12 17.3 6.6 21 8 13.6 3 9l6.6-.1L12 2z"/></svg></div>
          <div class="feature-content"><h3>Battle Pass</h3><p>Seasonal tiers of gold, gear and exclusive rewards.</p></div>
        </a>
      </div>
    </section>

    <section class="section home-pokemon-section">
      <div class="section-head">
        <div>
          <div class="section-kicker">Sun &amp; Moon bots</div>
          <h2>Meet the Alola roster</h2>
          <p>Pokémon companions for the world our bots are building.</p>
        </div>
      </div>
      <div class="pokemon-grid" id="homePokemon">
        <div class="pokemon-loading" aria-live="polite">Loading the Alola roster...</div>
      </div>
      <p class="pokemon-credit">Powered by PokéAPI. Pokémon data and artwork belong to their respective owners.</p>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>How it works</h2>
          <p>Three messages and you're playing</p>
        </div>
      </div>
      <div class="grid-3" id="homeSteps"></div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>Top of the board</h2>
          <p>The five highest levels this season</p>
        </div>
        <a class="btn btn-ghost btn-sm" href="#/leaderboard" data-route="leaderboard">Full leaderboard →</a>
      </div>
      <div class="lb-list" id="homeBoard"></div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>Questions</h2>
          <p>The things everyone asks first</p>
        </div>
      </div>
      <div class="card" id="homeFaq"></div>
    </section>

    <section class="section">
      <div class="card card-glow" style="background:linear-gradient(135deg,rgb(212 175 55 / 10%),rgb(212 175 55 / 3%));border-color:var(--gold);padding:32px;text-align:center;">
        <h2 style="font-size:24px;margin-bottom:8px;">Ready to go further?</h2>
        <p class="muted" style="max-width:420px;margin:0 auto 20px;">Premium unlocks boosted rewards, exclusive commands and a badge on every board.</p>
        <a class="btn btn-gold" href="#/premium" data-route="premium">
          <svg class="icon" viewBox="0 0 24 24"><path d="M3 8l4 3 5-7 5 7 4-3-2 11H5L3 8z"/></svg> See Premium plans
        </a>
      </div>
    </section>
  </div>
</main>`

const APP_RELEASES_URL = 'https://github.com/northernblader-sys/astral-bot/releases/latest'

/**
 * The two surfaces the game actually has. Discord and Telegram used to sit
 * here as "coming soon" tabs, but those adapters were deleted in v3.3.2, so
 * the hero was advertising two bots that no longer exist. Both tabs below are
 * live: the chat bot, and the Android app that talks to the same API and the
 * same account.
 */
const PLATFORMS = {
  whatsapp: {
    label: 'WhatsApp',
    live: true,
    sub: 'Message the bot on WhatsApp, make a character, and start clearing floors.',
    actions: () => `
      <a class="btn btn-primary" id="heroPlay" href="#/signup">
        <svg class="icon" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/></svg> Start playing
      </a>
      <a class="btn btn-secondary" href="#/leaderboard" data-route="leaderboard">
        <svg class="icon" viewBox="0 0 24 24"><path d="M4 20h16M7 20v-7M12 20V6M17 20v-11"/></svg> See the boards
      </a>`,
  },
  app: {
    label: 'Android',
    live: true,
    sub: 'Dungeon raids, Pokemon battles and your empire, playable on your phone with the same character you use in chat.',
    actions: () => `
      <a class="btn btn-secondary" href="${attr(APP_RELEASES_URL)}" target="_blank" rel="noopener">
        <svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg> Release notes
      </a>`,
  },
}

function setHeroPlatform(key) {
  const platform = PLATFORMS[key] ?? PLATFORMS.whatsapp
  $$('.platform-tab').forEach(tab => {
    const active = tab.dataset.platform === key
    tab.classList.toggle('is-active', active)
    tab.setAttribute('aria-selected', String(active))
  })

  const name = $('#heroPlatformName')
  if (name) name.textContent = platform.label

  const sub = $('#heroSub')
  if (sub) sub.textContent = platform.sub

  const actions = $('#heroActions')
  // Replacing this innerHTML also replaces #heroPlay, so paintAvatar() has to
  // run after it, never before - see the call order in boot().
  if (actions) actions.innerHTML = platform.actions()
}

export function wirePlatformSwitch() {
  $('#platformSwitch')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.platform-tab')
    if (!tab) return
    setHeroPlatform(tab.dataset.platform)
  })
}

export async function loadHome() {
  const statsHost = $('#homeStats')
  const boardHost = $('#homeBoard')
  if (statsHost) statsHost.innerHTML = skeletonCards(4)
  if (boardHost) boardHost.innerHTML = skeletonRows(5)

  paintHomeStatic()

  const [meta, stats, board, pokemon] = await Promise.all([
    ensureMeta(),
    api.stats().catch(err => { reportError(err); return null }),
    api.leaderboard('level', 5).catch(() => null),
    fetchSunMoonPokemon().catch(() => []),
  ])

  renderHomePokemon(pokemon)

  if (meta) {
    const sub = $('#heroSub')
    const activePlatform = $('.platform-tab.is-active')?.dataset.platform ?? 'whatsapp'
    if (sub && meta.botName && activePlatform === 'whatsapp') {
      sub.innerHTML = `Message <strong>${esc(meta.botName)}</strong> on WhatsApp, make a character with <code>${esc(meta.prefix)}register</code>, and start clearing floors.`
    }
    const support = $('#footerSupport')
    if (support && meta.supportGroupLink) {
      support.href = meta.supportGroupLink
      support.hidden = false
      support.target = '_blank'
      support.rel = 'noopener'
    }
    const note = $('#footerNote')
    if (note) note.textContent = meta.season?.name ? `Season ${meta.season.number}: ${meta.season.name}` : 'Play it on WhatsApp.'
  }

  if (stats && statsHost) {
    const cards = [
      ['Players', num(stats.players), stats.newThisWeek ? `+${num(stats.newThisWeek)} this week` : 'Adventurers registered'],
      ['Commands today', num(stats.commandsToday), stats.botsOnline ? `${stats.botsOnline} bot${stats.botsOnline === 1 ? '' : 's'} online` : 'Across every chat'],
      ['Highest level', num(stats.highestLevel), `Deepest floor ${num(stats.deepestFloor)}`],
      ['Dungeons cleared', num(stats.dungeonsConquered), `${num(stats.charactersAvailable)} characters to collect`],
    ]
    statsHost.innerHTML = cards.map(([k, v, sub], i) => `
      <div class="stat-pill">
        <div class="label">${esc(k)}</div>
        <div class="value${i === 0 ? ' gold' : ' acc'}">${esc(v)}</div>
        <div class="subtext" style="margin-top:4px;">${esc(sub)}</div>
      </div>`).join('')
  }

  if (stats) {
    const chips = $('#heroChips')
    if (chips) {
      const bits = [`${num(stats.players)} players`, `${num(stats.charactersAvailable)} characters`]
      if (stats.season?.name) bits.push(`Season ${stats.season.number}`)
      if (stats.season?.endsAt) bits.push(`${duration(stats.season.endsAt - Date.now())} left`)
      chips.innerHTML = bits.map(b => `<span class="chip">${esc(b)}</span>`).join('')
    }
  }

  if (boardHost) {
    boardHost.innerHTML = board?.rows?.length
      ? board.rows.map(rowHtml).join('')
      : emptyState('rank', 'No one on the board yet', 'Be the first to register.')
  }
}

function renderHomePokemon(pokemon) {
  const host = $('#homePokemon')
  if (!host) return

  if (!pokemon?.length) {
    host.innerHTML = '<div class="pokemon-empty">The Alola roster is taking a short break. Check back soon.</div>'
    return
  }

  host.innerHTML = pokemon.map(p => `
    <article class="pokemon-card">
      <div class="pokemon-card-art">
        <span class="pokemon-number">#${String(p.id).padStart(3, '0')}</span>
        <img src="${attr(p.image)}" alt="${attr(titleCase(p.name))}" loading="lazy">
      </div>
      <div class="pokemon-card-body">
        <h3>${esc(titleCase(p.name))}</h3>
        <div class="pokemon-types">
          ${p.types.map(type => `<span class="pokemon-type type-${esc(type)}">${esc(titleCase(type))}</span>`).join('')}
        </div>
      </div>
    </article>`).join('')
}

function paintHomeStatic() {
  const steps = $('#homeSteps')
  const prefix = state.meta?.prefix ?? '.'
  if (steps) {
    steps.innerHTML = [
      ['chat', 'Message the bot', `Open WhatsApp and send <code>${esc(prefix)}menu</code>. Nothing to install to start.`],
      ['character', 'Make your hero', `Pick a class and race with <code>${esc(prefix)}register</code>, then spend your 15 stat points.`],
      ['battle', 'Climb and rank', `Fight through floors, take on other players, and push up the boards each season.`],
    ].map(([i, t, b]) => `
      <div class="perk-card reveal">
        ${perkIcon(i)}
        <h4>${esc(t)}</h4>
        <p>${b}</p>
      </div>`).join('')
  }

  const faq = $('#homeFaq')
  if (faq) {
    faq.innerHTML = [
      ['Do I need to install anything?', 'Not to start. The whole game runs through WhatsApp messages. The Android app is optional and plays the same character, so you can move between the two whenever you want.'],
      ['Is it free?', `Yes. Premium and gems are optional and only add cosmetics, boosts and battle-pass rewards.`],
      ['How do I sign in here?', "Enter your WhatsApp number and the bot DMs you a 6-digit code from its own number. You'll need to have messaged the bot at least once first."],
      ['Can I play in a group chat?', `Yes - most commands work in groups. Use <code>${esc(prefix)}menu</code> to see what's available.`],
    ].map(([q, a]) => `
      <div class="faq-item">
        <div class="faq-q"><span>${esc(q)}</span><span class="arrow">+</span></div>
        <div class="faq-a"><p>${a}</p></div>
      </div>`).join('')
  }
}
