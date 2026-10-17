/**
 * screens/premium.js - plans, gem packages, and the payment explainer.
 * Prices go through WhatsApp: the bot holds the account details, never this page.
 */
import { $, esc, attr, num, usd, relTime, titleCase, skeletonCards } from '../ui.js'
import { api } from '../api.js'
import { state } from '../core/state.js'
import { CHECK, perkIcon, whatsappCommandUrl, ensureMeta } from '../core/shared.js'

export const premiumHtml = `
<main class="view" id="view-premium">
  <div class="page" style="padding-top:56px;">
    <section class="section" style="padding-top:0;">
      <div class="section-head">
        <div>
          <h2>Premium</h2>
          <p>Optional. The whole game is playable without it.</p>
        </div>
      </div>
      <div class="card" id="premiumMine" style="display:none;margin-bottom:20px;"></div>
      <div class="pricing-grid" id="planGrid"></div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>Gem packages</h2>
          <p>Gems buy characters, season passes and shop items</p>
        </div>
      </div>
      <div class="grid-4" id="gemGrid"></div>
    </section>

    <section class="section">
      <div class="card" id="payCard"></div>
    </section>
  </div>
</main>`

export async function loadPremium() {
  const planGrid = $('#planGrid')
  if (planGrid) planGrid.innerHTML = skeletonCards(3)

  const out = await api.premium()
  const prefix = state.meta?.prefix ?? (await ensureMeta())?.prefix ?? '.'

  // Dollars only, on owner request (2026-09-23). Every card used to carry the
  // naira figure under the dollar one plus a "charged in naira" line, and the
  // page read as two prices for one thing.
  //
  // Nothing about the CHARGE changed: the bot still prices every plan and
  // package in naira and `.premium buy` still asks for naira, so a buyer pays
  // exactly what they paid before. This is a label, and it's the only label
  // now.
  //
  // The rate comes from the API, so the owner retunes it in .env without a
  // frontend deploy. It defaults to 1385 in config.js, so "no rate" only
  // happens if NAIRA_PER_USD is deliberately blanked - in that case the card
  // sends the buyer to the bot rather than inventing a dollar figure or
  // falling back to the naira one the owner asked us to drop.
  const rate = out.nairaPerUsd ?? null
  const price = (n) => usd(n, rate) ?? 'Ask the bot'

  // The golden card is the MIDDLE one, positionally, not the cheapest per day.
  // It used to be whichever plan had the lowest perDayNaira, which put the
  // ribbon on whichever end of the grid happened to win that division and left
  // the layout lopsided. Owner wants the centre card featured (2026-09-23).
  // With an even number of plans this rounds to the later of the two middles.
  const plans = out.plans ?? []
  const featuredIndex = plans.length ? Math.floor(plans.length / 2) : -1

  if (planGrid) {
    planGrid.innerHTML = plans.map((p, i) => {
      const best = i === featuredIndex
      return `
      <div class="plan-card${best ? ' featured' : ''} reveal">
        ${best ? '<span class="plan-ribbon">Best value</span>' : ''}
        <div class="plan-name">${esc(p.label ?? titleCase(p.id))}</div>
        <div class="plan-price">${esc(price(p.priceNaira))}<span> / ${num(p.durationDays)}d</span></div>
        <div class="plan-desc">${esc(price(p.perDayNaira))} per day</div>
        <ul class="plan-features">
          <li>${CHECK} Premium badge on your profile and the boards</li>
          <li>${CHECK} Boosted rewards on dungeon runs</li>
          <li>${CHECK} Access to premium-only commands</li>
        </ul>
        <a class="btn ${best ? 'btn-gold' : 'btn-secondary'} btn-block" href="${attr(whatsappCommandUrl(p.command))}" target="_blank" rel="noopener" style="margin-top:auto">
          <svg class="icon" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 8.5c.4 2.4 2.1 4.6 4.7 5.5l1.5-1.1 1.8.8c-.2 1-1 1.6-2 1.5-3.7-.4-6.8-3.5-7.2-7.2-.1-1 .5-1.8 1.5-2l.8 1.8-1.1 1.5z"/></svg>
          Continue in WhatsApp
        </a>
      </div>`
    }).join('')
  }

  const mine = $('#premiumMine')
  if (mine && out.you) {
    mine.style.display = ''
    mine.innerHTML = out.you.active
      ? `${perkIcon('premium')}<h4>Premium is active</h4>
         <p>${esc(titleCase(out.you.plan ?? 'Premium'))} · renews or expires ${esc(relTime(out.you.expiresAt))}.</p>`
      : out.you.pending
        ? `${perkIcon('payment')}<h4>Payment under review</h4>
           <p>We've got your ${esc(titleCase(out.you.pending.plan ?? ''))} request. An admin will confirm it shortly.</p>`
        : `${perkIcon('spark')}<h4>You're on the free tier</h4>
           <p>Everything below is optional - the game is fully playable without it.</p>`
  } else if (mine) {
    mine.style.display = 'none'
  }

  const gems = $('#gemGrid')
  if (gems) {
    gems.innerHTML = (out.gemPackages ?? []).map(g => `
      <div class="perk-card reveal">
        ${perkIcon('gem')}
        <h4>${num(g.gems)} gems</h4>
        <p>${esc(price(g.priceNaira))} · ${esc(price(g.perGemNaira))} per gem</p>
        <a class="btn btn-ghost btn-sm btn-block" href="${attr(whatsappCommandUrl(g.command))}" target="_blank" rel="noopener" style="margin-top:11px">
          <svg class="icon" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 8.5c.4 2.4 2.1 4.6 4.7 5.5l1.5-1.1 1.8.8c-.2 1-1 1.6-2 1.5-3.7-.4-6.8-3.5-7.2-7.2-.1-1 .5-1.8 1.5-2l.8 1.8-1.1 1.5z"/></svg>
          Buy gems in WhatsApp
        </a>
      </div>`).join('')
  }

  // Bank details are deliberately NOT shown here. The account number only ever
  // goes out over the bot's DM reply, so a scraped copy of this static site is
  // never a payment instruction someone can act on.
  const pay = $('#payCard')
  if (pay) {
    pay.innerHTML = `
      <div class="section-head" style="margin-bottom:8px">
        <div>
          <h2>Paying for premium or gems</h2>
          <p>Run the command in WhatsApp - the bot replies with the payment details and confirms once an admin approves it.</p>
        </div>
      </div>
      ${rate ? `<p class="subtext" style="margin-top:14px">Every price on this page is in US dollars.
        The bot converts to your local payment currency when you run the command, and tells you the
        exact amount before you send anything.</p>` : ''}
      ${out.botNumber ? `<p class="subtext" style="margin-top:14px">Send proof of payment to the bot on
        +${esc(String(out.botNumber).replace(/\D/g, ''))}.</p>` : ''}
      <p class="subtext">The bot is the only place the account details come from. Never send money to anyone else claiming to be staff.</p>`
  }
}
