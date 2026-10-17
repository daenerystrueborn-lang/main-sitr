/** Home - the launcher feed: player header, season hero, art mode carousel,
 *  squad, heroes, shop picks, pulls, live world numbers, ranked, pass. */
import React, { useEffect, useState } from 'react'
import { api, pk, signedIn } from '../lib/data.js'
import { num, pct, initials, duration, OPEN } from '../lib/fmt.js'
import { Sec, Tiles, Skel, ArtMode } from '../ui.jsx'
import { Link } from '../router.jsx'

const M = (d) => <svg viewBox="0 0 24 24">{d}</svg>
const MODES = [
  ['dungeon', 'Dungeon', 'Floors and runs', 'assets/img/modes/dungeon.jpg', M(<><rect x="5" y="3" width="14" height="18" rx="7" /><path d="M12 8.5V12" /><circle cx="12" cy="15.2" r="1.4" /></>)],
  ['hub/league', 'League', 'Table and bouts', 'assets/img/modes/arena.jpg', M(<><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4" /></>)],
  ['hub/quests', 'Quests', 'Claim rewards', 'assets/img/modes/battlepass.jpg', M(<><path d="M6 3h12v18l-6-4-6 4z" /><path d="M9 8h6M9 11h4" /></>)],
  ['cards', 'Cards', 'Collect them all', 'assets/img/modes/characters.jpg', M(<><rect x="4" y="3" width="13" height="18" rx="2" /><path d="M20 7v12a2 2 0 0 1-2 2" /></>)],
]

// Mode tiles that map to not-yet-rebuilt screens still navigate (Soon page).
const modeTarget = (r) => (r.startsWith('hub/') ? 'hub' : r)

export default function Home() {
  const [d, setD] = useState({})
  const patch = (k, v) => setD(prev => ({ ...prev, [k]: v }))

  useEffect(() => {
    let dead = false
    const jobs = [
      signedIn() && api.me().then(r => !dead && patch('p', slimPlayer(r.player))).catch(() => !dead && patch('p', null)),
      api.season().then(sv => !dead && patch('sv', slimSeason(sv))).catch(() => !dead && patch('sv', null)),
      signedIn() && pk.overview().then(o => !dead && patch('team', slimTeam(o))).catch(() => !dead && patch('team', null)),
      api.leaderboard('level', 5).then(b => !dead && patch('board', (b?.rows ?? []).slice(0, 5))).catch(() => !dead && patch('board', null)),
      api.stats().then(s => !dead && patch('world', s)).catch(() => !dead && patch('world', null)),
      api.characters().then(c => !dead && patch('roster', [...(c.characters ?? [])].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0)).slice(0, 8))).catch(() => !dead && patch('roster', null)),
      api.shop().then(sh => !dead && patch('picks', picksOf(sh))).catch(() => !dead && patch('picks', null)),
      api.cardCatalog({ page: 1, limit: 6 }).then(o => !dead && patch('pulls', (o?.cards ?? []).slice(0, 6))).catch(() => !dead && patch('pulls', null)),
    ].filter(Boolean)
    Promise.allSettled(jobs)
    return () => { dead = true }
  }, [])

  const p = d.p
  const hello = ['Still up', 'Good morning', 'Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening', 'Good evening', 'Good evening'][new Date().getHours() < 12 ? 1 : new Date().getHours() < 18 ? 4 : new Date().getHours() < 24 ? 8 : 0]

  return (
    <div className="page feed">
      {/* player header */}
      <header className="feed-hello">
        <div className="feed-who">
          <span className="overline">{p ? hello : 'Welcome to'}</span>
          <h2>{p?.name || 'Astral'}</h2>
          <div className="chips">
            {p ? <span className="chip">Lv {num(p.level)}</span> : <span className="chip gold">Preview</span>}
            {p?.rank?.title && <span className="chip">{p.rank.title}</span>}
            {!signedIn() && OPEN && <Link className="chip gold" to="login">Sign in</Link>}
          </div>
        </div>
        <div className="feed-avatar">{p ? initials(p.name) : 'A'}</div>
      </header>

      {/* currencies */}
      {p && <Tiles items={[[num(p.solars), 'Solars'], [num(p.gems), 'Gems'], [num(p.heroes), 'Heroes']]} />}

      {/* season hero */}
      <SeasonHero sv={d.sv} />

      {/* game modes - art carousel with peek */}
      <Sec title="Game modes" action="Hub" actionTo="hub">
        <div className="carousel">
          {MODES.map(([to, title, sub, art, icon]) => (
            <ArtMode key={title} to={modeTarget(to)} title={title} sub={sub} art={art} icon={icon} />
          ))}
        </div>
      </Sec>

      {/* squad */}
      <Sec title="Your squad" action="Party" actionTo="pokemon">
        {d.team === undefined && <Skel h={64} />}
        {d.team === null && signedIn() && <p className="muted">No team yet.</p>}
        {d.team?.starter && <div className="card"><b>Choose your starter</b><p className="muted">Pick one from the Pokémon screen.</p></div>}
        {d.team?.party && (
          <div className="strip">
            {d.team.party.map(m => (
              <div className={'chip-pk' + (m.fainted ? ' faint' : '')} key={m.name}>
                <b>{m.nickname || m.name}</b><small>Lv {num(m.level)}</small>
              </div>
            ))}
          </div>
        )}
      </Sec>

      {/* top heroes -> shop */}
      <Sec title="Top heroes" action="In the Shop" actionTo="shop">
        {d.roster === undefined && <Skel />}
        {d.roster?.length > 0 && (
          <div className="carousel">
            {d.roster.map(c => (
              <div className="cast" key={c.id}>
                <div className="cast-art">{c.image ? <img src={c.image} alt="" loading="lazy" onError={e => e.target.remove()} /> : <em>✦</em>}</div>
                <span className="stars">{'★'.repeat(Math.max(1, Math.min(6, c.stars || 1)))}</span>
                <b>{c.name}</b>
              </div>
            ))}
          </div>
        )}
      </Sec>

      {/* shop picks */}
      <Sec title="Shop picks" action="Open shop" actionTo="shop">
        {d.picks === undefined && <Skel />}
        {d.picks?.length > 0 && (
          <div className="carousel">
            {d.picks.map(x => (
              <div className="cast" key={x.id}>
                <div className="cast-art">{x.image ? <img src={x.image} alt="" loading="lazy" onError={e => e.target.remove()} /> : <em>✦</em>}</div>
                <b>{x.name}</b>
                <small className="gold">{num(x.price)} solars</small>
              </div>
            ))}
          </div>
        )}
      </Sec>

      {/* fresh pulls */}
      <Sec title="Fresh pulls" action="All cards" actionTo="cards">
        {d.pulls === undefined && <Skel />}
        {d.pulls?.length > 0 && (
          <div className="pulls">
            {d.pulls.map((c, i) => (
              <div className="pull" key={i}>
                <div className="pull-art">{c.image ? <img src={c.image} alt="" loading="lazy" onError={e => e.target.remove()} /> : <em>{initials(c.name)}</em>}</div>
                <b>{c.name}</b>
              </div>
            ))}
          </div>
        )}
      </Sec>

      {/* world */}
      <Sec title="The world right now" action="Ranks" actionTo="ranks">
        {d.world === undefined && <Skel h={90} />}
        {d.world && (
          <Tiles items={[
            [num(d.world.players), 'players in the game'],
            [num(d.world.dungeonsConquered), 'dungeons cleared'],
            [num(d.world.deepestFloor), 'deepest floor'],
            [num(d.world.commandsToday), 'commands today'],
          ]} />
        )}
      </Sec>

      {/* ranked */}
      <Sec title="Top ranked" action="Full board" actionTo="ranks">
        {d.board === undefined && <Skel />}
        {d.board?.length > 0 && (
          <div className="board">
            {d.board.map((r, i) => (
              <div className={'row' + (p?.uid === r.uid ? ' you' : '')} key={r.uid}>
                <span className={'rank r' + (i + 1)}>{r.position ?? i + 1}</span>
                <span className="av">{r.avatarUrl ? <img src={r.avatarUrl} alt="" /> : initials(r.name)}</span>
                <span className="nm">{r.name}</span>
                <span className="lv">Lv {num(r.level)}</span>
              </div>
            ))}
          </div>
        )}
      </Sec>

      {/* pass */}
      <Link className="pass" to="premium">
        <div><b>{d.sv?.pl?.premium ? 'Premium pass active' : 'Go Premium'}</b><span>Perks, passes and exclusive rewards</span></div>
        <i>›</i>
      </Link>

      <div className="build-space" />
    </div>
  )
}

function SeasonHero({ sv }) {
  if (sv === undefined) return <Skel h={210} />
  if (!sv?.active) return null
  const left = (sv.endsAt ?? 0) - Date.now()
  return (
    <div className="hero" style={{ backgroundImage: `linear-gradient(180deg,rgb(0 0 0 / 12%),rgb(0 0 0 / 92%) 92%),url(assets/img/season/hero.jpg)` }}>
      <span className="overline gold">Season {sv.number}{left > 0 ? ` · ${duration(left)} left` : ''}</span>
      <h2>{sv.name}</h2>
      {sv.pl && (
        <>
          <div className="hero-tier"><span>Tier {num(sv.pl.tier)} / {num(sv.tierCount)}</span><span>{num(sv.pl.points)} pts</span></div>
          <div className="track"><i style={{ width: pct(sv.pl.tier, sv.tierCount) + '%' }} /></div>
        </>
      )}
      <Link className="play" to="dungeon">PLAY NOW <b>→</b></Link>
    </div>
  )
}

function slimPlayer(p = {}) {
  return {
    uid: p.uid, name: p.name, level: p.level,
    rank: p.rank ? { title: p.rank.title } : null,
    solars: p.wallet?.solars ?? 0, gems: p.wallet?.gems ?? 0,
    heroes: p.ownedCharacters?.length ?? 0,
  }
}
function slimSeason(sv) {
  if (!sv?.active) return { active: false }
  return {
    active: true, number: sv.season.number, name: sv.season.name,
    tierCount: sv.season.tierCount, endsAt: sv.runtime?.endsAt ?? 0,
    pl: sv.player ? { tier: sv.player.tier, points: sv.player.points, premium: !!sv.player.premiumPass } : null,
  }
}
function slimTeam(o) {
  if (o.needsStarter) return { starter: true }
  return { party: (o.party ?? []).map(m => ({ name: m.name, nickname: m.nickname, level: m.level, fainted: m.fainted })) }
}
function picksOf(sh) {
  const shelves = sh?.shelves ?? []
  const shelf = shelves.find(s => s.key !== 'heroes') ?? shelves[0]
  return (shelf?.groups ?? []).flatMap(g => g.rows ?? []).slice(0, 6)
    .map(r => ({ id: r.id, name: r.name, image: r.image ?? null, price: r.buyPrice ?? 0 }))
}
