import { createManagement } from './management.js'
import { createDungeons } from './dungeons.js'

// Screen controllers populate the supplied HTML; they never replace a screen
// with a different design when a request fails.
export function mountFeatures(ui) {
  const { api, $, $$, text, esc, panel, closePanel, run, bind, nav, image, getPlayer, message } = ui
  let sessionGeneration = 0, ready = false
  let config = null, plans = [], period = 'month', subscription = null
  let plansUnavailable = false, subscriptionUnavailable = false
  const flags = () => config?.features || config?.featureFlags || config?.flags || {}
  let dungeons = null
  const context = { ...ui, flags, activeRun: () => dungeons?.isActive() || false }
  const management = createManagement(context)
  dungeons = createDungeons({ ...context, management })
  const versionParts = value => String(value || '0').split('.').map(x => parseInt(x, 10) || 0)
  function belowVersion(current, minimum) {
    const a = versionParts(current), b = versionParts(minimum)
    for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0) }
    return false
  }
  function block(title, description) {
    panel(title, `<p>${esc(description)}</p><button class="gbtn" id="config-retry">Check again</button>`)
    $('.api-close').hidden = true
    $('#api-panel').dataset.blocking = 'true'
    $('#config-retry').onclick = () => ui.restart()
  }
  function drawPremium() {
    const plan = plans.find(p => p.billingPeriod === period || p.billingPeriod === (period === 'month' ? 'monthly' : 'yearly'))
    text('#v-premium .pm-price b', 'Coming soon')
    text('#v-premium .pm-plan .pm-description', plansUnavailable ? 'Plan information is temporarily unavailable.' : plan?.available ? 'App billing is not connected on this device.' : 'This plan is not available for purchase yet.')
    const button = $('#v-premium > .pm-cta')
    // No receipt-verification adapter is installed. Even a future true feature
    // flag cannot fabricate a provider token or activate a local entitlement.
    button.disabled = true; button.textContent = 'Coming soon'; button.title = 'Verified app billing is not configured'
    $$('#v-premium .pm-perks .pm-description').forEach((el, i) => { el.textContent = plan?.features?.[i] || ['App perks', 'App passes', 'Exclusive rewards'][i] })
    const status = $('#v-premium .top .bdg')
    status.textContent = subscriptionUnavailable && getPlayer() ? 'Status unavailable' : subscription?.active && subscription.status === 'active' ? 'Premium active' : subscription?.status && subscription.status !== 'none' ? subscription.status : 'Free plan'
    const detail = $('#subscription-detail')
    if (detail) detail.textContent = subscriptionUnavailable && getPlayer() ? 'Subscription status could not be loaded. Try again when connected.' : subscription?.active && subscription.status === 'active' ? `${subscription.billingPeriod || ''} · ${subscription.autoRenew ? 'Auto-renews' : 'Does not auto-renew'}${subscription.expiresAt ? ` · ${new Date(subscription.expiresAt).toLocaleString()}` : ''}` : 'No active app subscription.'
  }
  const status = document.createElement('p'); status.id = 'subscription-detail'; status.className = 'sub'
  $('#v-premium .pm-plan').append(status)
  bind('#v-premium .pm-seg button', el => {
    period = el.dataset.u
    $$('#v-premium .pm-seg button').forEach(b => { b.classList.toggle('on', b === el); b.setAttribute('aria-selected', String(b === el)) })
    $('#v-premium .pm-seg').classList.toggle('yr', period === 'year')
    text('#pm-unit', period === 'year' ? '/ year' : '/ month'); drawPremium()
  })
  async function loadPremium() {
    const revision = sessionGeneration
    drawPremium()
    const [planResult, subscriptionResult] = await Promise.allSettled([
      api.appPlans(), getPlayer() ? api.subscription() : Promise.resolve(null),
    ])
    if (revision !== sessionGeneration) return
    plansUnavailable = planResult.status === 'rejected'
    plans = plansUnavailable ? [] : planResult.value.plans || []
    subscriptionUnavailable = subscriptionResult.status === 'rejected'
    subscription = subscriptionUnavailable ? null : subscriptionResult.value?.subscription || subscriptionResult.value
    drawPremium()
  }
  async function home() {
    const revision = sessionGeneration
    // Public content failures must not prevent account status/run recovery.
    const [featuredResult, offerResult, subscriptionResult] = await Promise.allSettled([
      api.featured(), api.shopOffers(), getPlayer() ? api.subscription() : Promise.resolve(null),
    ])
    if (revision !== sessionGeneration) return
    const featured = featuredResult.status === 'fulfilled' ? featuredResult.value : null
    const banner = featured?.banners?.[0]
    const host = $('#v-home .season')
    host.replaceChildren()
    host.dataset.apiAction = '1'
    if (banner) {
      host.innerHTML = `${image(banner.imageUrl)}<span>${esc(banner.title)}</span>`
      host._apiAction = () => {
        if (banner.destination?.screen === 'dungeon' && banner.destination.id) return dungeons.select(banner.destination.id)
        if (banner.destination?.screen === 'character' && banner.destination.id) return management.characterDetail(banner.destination.id)
        message('Unavailable', 'This banner does not have a supported destination.')
      }
    } else {
      host.textContent = featured ? 'No featured content' : 'Featured content unavailable'
      host._apiAction = () => run('home-content', home)
    }
    if (featured?.dungeonId) dungeons.setFeatured(featured.dungeonId)
    const offers = offerResult.status === 'fulfilled' ? offerResult.value : null
    const offer = offers?.offers?.find(x => x.available !== false)
    const item = offer?.item || offer
    $('#v-home .box').innerHTML = item ? `${image(item.image || item.imageUrl)}<span>${esc(item.name || offer.title)}</span>` : `<span>${offers ? 'Browse the shop' : 'Shop offers unavailable'}</span>`
    bind('#v-home .box', () => nav('shop'))
    subscriptionUnavailable = subscriptionResult.status === 'rejected'
    subscription = subscriptionUnavailable ? null : subscriptionResult.value?.subscription || subscriptionResult.value
    drawPremium()
  }
  async function shopFeatured() {
    const out = await api.shopOffers(), offer = out.offers?.find(v => v.available !== false)
    const host = $('#v-shop > .feat'), button = host.querySelector('button')
    if (!offer) { button.disabled = true; return }
    const item = offer.item || offer, label = host.querySelector('.fbot > div:first-child')
    if (label) label.textContent = item.name || offer.title || 'Featured'
    const description = host.querySelector('.fbot > div:nth-child(2)')
    if (description) description.textContent = item.description || ''
    if (item.image || item.imageUrl) host.style.backgroundImage = `url("${ui.art(item.image || item.imageUrl).replace(/["\\]/g, '')}")`
    button.disabled = !item.id; button.dataset.apiAction = '1'; button._apiAction = () => ui.focusShopItem(item.id)
  }
  const controller = {
    async startup() {
      ready = false
      config = await api.appConfig()
      if (belowVersion(window.ASTRAL_APP_VERSION || '1.0.0', config.minimumSupportedVersion)) {
        block('Update required', `This app requires version ${config.minimumSupportedVersion} or newer.`); return false
      }
      if (config.maintenance?.active) { block('Maintenance', config.maintenance.message || 'Please try again later.'); return false }
      if ($('#api-panel')) delete $('#api-panel').dataset.blocking
      // Only the explicitly supported game surfaces are enabled.
      const fightTab = $('.tab[data-v="fight"]'); fightTab.hidden = flags().dungeonRuns !== true
      dungeons.configure()
      ready = true
      closePanel()
      return true
    },
    async afterAuth() {
      if (!ready) return
      await run('home-content', home)
      if (getPlayer()) await run('active-run', () => dungeons.recover())
    },
    async view(name) {
      dungeons.leaveView(name)
      if (!ready) { if (name === 'premium') drawPremium(); return }
      if (name === 'shop') return run('shop-offers', shopFeatured)
      if (name === 'premium') return run('plans', loadPremium)
      if (name === 'profile' && getPlayer()) { await run('inventory', () => management.inventory()); await run('equipment', () => management.equipment()) }
      if (['fight', 'dg-list', 'dg-prep', 'dg-combat'].includes(name)) return run(`dungeon-view:${name}`, () => dungeons.view(name))
    },
    publicPlayer: uid => management.publicPlayer(uid),
    reset() { sessionGeneration++; plans = []; subscription = null; plansUnavailable = false; subscriptionUnavailable = false; management.reset(); dungeons.reset(); drawPremium() },
    inDungeon: () => dungeons.isActive(),
    isReady: () => ready,
  }
  window.addEventListener('online', () => { if (getPlayer() && controller.isReady()) run('recover', () => dungeons.recover()) })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) dungeons.stopPolling()
    else if (getPlayer() && controller.isReady()) run('recover', () => dungeons.recover())
  })
  window.addEventListener('pagehide', () => dungeons.stopPolling())
  return controller
}
