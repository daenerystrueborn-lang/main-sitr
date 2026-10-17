/** App shell: hash router, top bar with centered title, floating black+gold
 *  tab pill, login gate (open in preview builds), build badge. */
import React, { useEffect } from 'react'
import { useRoute, go, Link } from './router.jsx'
import { signedIn } from './lib/data.js'
import { OPEN } from './lib/fmt.js'
import Auth from './screens/Auth.jsx'
import Home from './screens/Home.jsx'
import Dungeon from './screens/Dungeon.jsx'
import DungeonRun from './screens/DungeonRun.jsx'
import Shop from './screens/Shop.jsx'
import Pokemon from './screens/Pokemon.jsx'
import Ranks from './screens/Ranks.jsx'
import Settings from './screens/Settings.jsx'
import { Soon } from './ui.jsx'

const I = (d) => <svg viewBox="0 0 24 24">{d}</svg>
const ICONS = {
  home: I(<><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" /></>),
  dungeon: I(<><rect x="5" y="3" width="14" height="18" rx="7" /><path d="M12 8.5V12" /><circle cx="12" cy="15.2" r="1.4" /></>),
  shop: I(<><path d="M6 7h12l1.2 13H4.8z" /><path d="M9 7a3 3 0 0 1 6 0" /></>),
  pokemon: I(<><circle cx="12" cy="12" r="9" /><path d="M3 12h5.5M15.5 12H21" /><circle cx="12" cy="12" r="3.2" /></>),
  settings: I(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></>),
}

const TABS = [
  ['home', 'Home'],
  ['dungeon', 'Dungeon'],
  ['shop', 'Shop'],
  ['pokemon', 'Pokémon'],
  ['settings', 'Settings'],
]

const TITLES = {
  home: 'Home', dungeon: 'Dungeon', 'dungeon/run': 'Dungeon Run', shop: 'Shop',
  pokemon: 'Pokémon', ranks: 'Ranks', settings: 'Settings', login: 'Sign in',
  hub: 'Hub', season: 'Season', cards: 'Cards', premium: 'Premium', profile: 'Profile',
  leaderboard: 'Ranks',
}
const TABBED = TABS.map(([r]) => r)

function Screen({ path }) {
  switch (path) {
    case 'home': return <Home />
    case 'dungeon': return <Dungeon />
    case 'dungeon/run': return <DungeonRun />
    case 'shop': return <Shop />
    case 'pokemon': return <Pokemon />
    case 'ranks': case 'leaderboard': return <Ranks />
    case 'settings': return <Settings />
    case 'hub': return <Soon what="Hub" />
    case 'season': return <Soon what="Season" />
    case 'cards': return <Soon what="Cards" />
    case 'premium': return <Soon what="Premium" />
    case 'profile': return <Soon what="Profile" />
    default: return <Soon what="That screen" />
  }
}

export default function App() {
  const path = useRoute()
  const authed = signedIn() || OPEN

  useEffect(() => { document.title = (TITLES[path] || 'Astral') + ' · Astral' }, [path])

  if (!authed) return <Auth />

  const root = path.split('/')[0]
  const isTab = TABBED.includes(path)
  const title = TITLES[path] || 'Astral'

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-dot" />
        <button
          className={'back' + (isTab ? ' hidden' : '')}
          aria-label="Back"
          onClick={() => (path.startsWith('dungeon/') ? go('dungeon') : go('home'))}
        >‹</button>
        <h1 className="screen-title">{title}</h1>
        <div className="top-actions">
          {signedIn() ? (
            <Link className="mini-av" to="profile">●</Link>
          ) : (
            <Link className="mini-login" to="login">Sign in</Link>
          )}
        </div>
      </header>

      <main className="view" key={path}>
        <Screen path={path} />
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(([r, label]) => (
          <button
            key={r}
            className={'tab' + (path === r || root === r ? ' on' : '')}
            onClick={() => go(r)}
          >
            {ICONS[r]}<span>{label}</span>
          </button>
        ))}
      </nav>

      {OPEN && <div className="build-badge" title="Preview build">build {window.ASTRAL_BUILD}</div>}
    </div>
  )
}
