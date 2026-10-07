/* Astral app shell: login first, then profile, bottom tabs for everything else.
   Runs after app.js, never touches it - it only watches the hash + the stored token. */
(function () {
  var TOKEN_KEY = 'astral:token'
  var AUTH_ROUTES = { login: 1, signup: 1 }
  var TITLES = {
    welcome: 'Welcome', characters: 'Characters', shop: 'Shop', pokemon: 'Pokémon',
    profile: 'Profile', season: 'Season', leaderboard: 'Ranks', cards: 'Cards', premium: 'Premium', settings: 'Settings'
  }
  var I = function (d) { return '<svg viewBox="0 0 24 24">' + d + '</svg>' }
  var ICON = {
    profile: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'),
    season: I('<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/>'),
    shop: I('<path d="M6 7h12l1.2 13H4.8z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
    leaderboard: I('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>'),
    more: I('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
    characters: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2.2.7 3.5 2.6 3.5 5.6"/>'),
    cards: I('<rect x="4" y="3" width="13" height="18" rx="2"/><path d="M20 7v12a2 2 0 0 1-2 2"/>'),
    premium: I('<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>'),
    settings: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
    welcome: I('<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>'),
    pokemon: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h5.5M15.5 12H21"/><circle cx="12" cy="12" r="3.2"/>')
  }
  var TABS = ['welcome', 'characters', 'shop', 'pokemon', 'settings']   // Season, Cards, Ranks, Premium and Profile open from the Welcome page

  var body = document.body
  var first = true
  var lastNav = Date.now()
  try { if (JSON.parse(localStorage.getItem('astral:prefs') || '{}').lite !== false) body.classList.add('lite') } catch (e) { body.classList.add('lite') }

  function route() { return (location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0]) || 'home' }
  function signedIn() { try { return !!localStorage.getItem(TOKEN_KEY) } catch (e) { return false } }
  function go(name) { location.replace('#/' + name); sync() }   // replace: tab hops don't pile up in history

  function build() {
    var tabs = document.createElement('nav')
    tabs.className = 'app-tabs'
    tabs.setAttribute('aria-label', 'Main')
    tabs.innerHTML = TABS.map(function (r) {
      return '<button class="app-tab" data-tab="' + r + '">' + ICON[r] + '<span>' + TITLES[r] + '</span></button>'
    }).join('')
    body.appendChild(tabs)

    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]'); if (!b) return
      if (route() !== b.dataset.tab) go(b.dataset.tab)
      else window.scrollTo({ top: 0, behavior: 'smooth' })
    })

    // Title next to the brand mark in the app bar.
    var brand = document.querySelector('.nav-inner .brand')
    if (brand) {
      var t = document.createElement('div'); t.className = 'app-title'; t.id = 'appTitle'
      brand.insertAdjacentElement('afterend', t)
      var back = document.createElement('button'); back.className = 'app-back'; back.setAttribute('aria-label', 'Back')
      back.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>'
      back.addEventListener('click', function () { go('welcome') })
      brand.insertAdjacentElement('afterend', back)
    }

    // Branded header above the sign in / sign up cards.
    ;['view-login', 'view-signup'].forEach(function (id) {
      var wrap = document.querySelector('#' + id + ' .auth-wrap'); if (!wrap) return
      var hero = document.createElement('div'); hero.className = 'app-hero'
      hero.innerHTML = '<div class="mark"><img src="assets/img/login-art.jpg" alt=""></div><h1>Astral</h1><p>Dungeons, cards and companions</p>'
      wrap.insertBefore(hero, wrap.firstChild)
    })
  }

  function sync() {
    var r = route(), s = signedIn()

    if (first) {
      first = false
      // Launch: signed out -> login. Signed in -> Welcome.
      if (!s && !AUTH_ROUTES[r]) { go('login'); return }
      if (s && (r === 'home' || AUTH_ROUTES[r])) { go('welcome'); return }
    } else if (s && r === 'home') {            // the site's landing page has no place in the app
      go('welcome'); return
    } else if (!s && !AUTH_ROUTES[r]) {       // signed out / token lost mid-session
      go('login'); return
    }

    body.classList.toggle('app-auth', !s || !!AUTH_ROUTES[r])
    body.classList.toggle('app-sub', TABS.indexOf(r) < 0)   // a page opened from Welcome: show the back arrow
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.tab === r)
    })
    var title = document.getElementById('appTitle')
    if (title) title.textContent = TITLES[r] || ''
  }

  /* Splash: stays up (covering the site's home view) until the first real screen is ready. */
  function hideSplash() {
    var sp = document.getElementById('appSplash'); if (!sp) return
    sp.classList.add('out'); setTimeout(function () { sp.remove() }, 480)
  }
  var t0 = Date.now()
  ;(function waitReady() {
    var r = route(), age = Date.now() - t0
    var view = document.getElementById('view-' + r)
    var ready = view && view.classList.contains('active') &&
      (r === 'welcome' ? !!document.querySelector('#welcomeRoot[data-ready]') : true)
    if ((ready && age > (window.ASTRAL_SPLASH_MS ?? 350)) || age > 5000) return hideSplash()
    setTimeout(waitReady, 80)
  })()

  build()
  window.addEventListener('hashchange', function () { lastNav = Date.now(); sync() })
  // A background refresh brought newer data for a page that just opened: let the site re-render it in place.
  window.addEventListener('astral:data', function () {
    var r = route(), a = document.activeElement
    if (r === 'welcome' || r === 'pokemon' || r === 'settings' || AUTH_ROUTES[r]) return
    if (Date.now() - lastNav > 8000 || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  setInterval(sync, 1000)   // catches a token that disappears without a route change
  sync()
})()
