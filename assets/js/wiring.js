/**
 * wiring.js - delegated event handling that spans screens.
 *
 * Every screen re-renders its own innerHTML, so per-element listeners would
 * have to be re-attached on each render - one delegated handler per event
 * type survives that for free. Screen-private wiring (platform switch,
 * auth forms, leaderboard search) lives in the screens themselves.
 */
import { $, $$, copyText, toast } from './ui.js'
import { api } from './api.js'
import { state, isSignedIn } from './core/state.js'
import { closeDrawer, closePanel, deleteNote, paintBell } from './core/shell.js'
import { signOut } from './core/session.js'
import { setLocalPref } from './core/prefs.js'
import { openPlayer, showBoard } from './screens/leaderboard.js'
import { openCharacter, applyCharFilter } from './screens/characters.js'
import { openItem } from './screens/profile.js'
import { selectShelf, buyShopItem } from './screens/shop.js'
import { applyCardTier, loadMoreCards } from './screens/cards.js'
import {
  uploadProfileImage, removeProfileImage, saveName, saveBio,
  saveSetting, toggleNoteKind, revokeSessions,
} from './screens/settings.js'

/**
 * One delegated click handler for the whole document.
 */
function wireGlobalClicks() {
  document.addEventListener('click', async (e) => {
    const t = e.target

    // Copy-a-command pills (also used for the premium buy buttons, and for
    // the player ID in settings - hence the overridable message).
    const copyBtn = t.closest('[data-copy]')
    if (copyBtn) {
      e.preventDefault()
      copyText(copyBtn.dataset.copy, copyBtn.dataset.copyMsg ?? 'Command copied')
      return
    }

    // Leaderboard row / wielder row → player detail with stats + alerts.
    // A card can contain its own links and buttons (a "Buy" action, a route
    // link); those must win, or clicking them would also open the card's modal
    // behind whatever they do. `closest` finds the innermost match, so if an
    // interactive descendant sits between the target and the card, this card
    // isn't the thing that was clicked.
    const innerCtl = t.closest('a[href],button:not([data-uid]):not([data-char]):not([data-item])')

    const row = t.closest('[data-uid]')
    if (row && !(innerCtl && row.contains(innerCtl) && innerCtl !== row)) {
      e.preventDefault()
      openPlayer(row.dataset.uid)
      return
    }

    const charCard = t.closest('[data-char]')
    if (charCard && !(innerCtl && charCard.contains(innerCtl) && innerCtl !== charCard)) {
      e.preventDefault()
      openCharacter(charCard.dataset.char)
      return
    }

    // Inventory slot → item detail. The index keys into the rows the profile
    // last rendered, so no refetch is needed.
    const itemSlot = t.closest('[data-item]')
    if (itemSlot && !(innerCtl && itemSlot.contains(innerCtl) && innerCtl !== itemSlot)) {
      e.preventDefault()
      openItem(state.inv[Number(itemSlot.dataset.item)])
      return
    }

    // Shop: category tab, then the Buy button on a card.
    const shelfTab = t.closest('[data-shelf]')
    if (shelfTab) {
      e.preventDefault()
      selectShelf(shelfTab.dataset.shelf)
      return
    }

    const buyBtn = t.closest('[data-buy]')
    if (buyBtn) {
      e.preventDefault()
      buyShopItem(buyBtn.dataset.buy, buyBtn.dataset.name, buyBtn.dataset.price)
      return
    }

    // Cards are view-only: tier filters and catalog paging are the only actions.
    const starTab = t.closest('[data-charstars]')
    if (starTab) {
      e.preventDefault()
      applyCharFilter(starTab.dataset.charstars)
      return
    }

    const tierTab = t.closest('[data-cardtier]')
    if (tierTab) {
      e.preventDefault()
      applyCardTier(tierTab.dataset.cardtier)
      return
    }

    if (t.closest('#cardMore')) {
      e.preventDefault()
      loadMoreCards()
      return
    }

    // Board tabs.
    const tab = t.closest('[data-board]')
    if (tab) {
      e.preventDefault()
      const search = $('#lbSearch')
      if (search) search.value = ''
      showBoard(tab.dataset.board)
      return
    }

    // Dismiss one stored notification. Checked before the .note handler so
    // the X doesn't also count as "open this alert".
    const del = t.closest('[data-del]')
    if (del) {
      e.preventDefault()
      e.stopPropagation()
      deleteNote(del.dataset.del)
      return
    }

    // Reading a stored notification marks it read.
    const note = t.closest('.note')
    if (note && !note.dataset.derived && note.classList.contains('is-unread')) {
      note.classList.remove('is-unread')
      const item = state.notes.items.find(n => n.id === note.dataset.note)
      if (item) item.read = true
      state.notes.unread = Math.max(0, state.notes.unread - 1)
      paintBell()
      api.markNotificationRead(note.dataset.note).catch(() => {})
      return
    }

    // FAQ accordion - one open at a time.
    const faqQ = t.closest('.faq-q')
    if (faqQ) {
      e.preventDefault()
      const faq = faqQ.closest('.faq-item')
      const wasOpen = faq.classList.contains('open')
      for (const f of $$('.faq-item')) f.classList.remove('open')
      faq.classList.toggle('open', !wasOpen)
      return
    }

    // Any in-app link. Closing the drawer here (rather than only in render())
    // matters for links to the page you're already on, which don't re-render.
    const link = t.closest('a[data-route]')
    if (link) {
      if ((link.id === 'drawerAuth' || link.id === 'footerAuth') && isSignedIn()) {
        e.preventDefault()
        signOut()
        return
      }
      closeDrawer()
      closePanel()
      return
    }
  })
}

/**
 * Settings lives inside re-rendered markup, so all of it is delegated here.
 * (Split out of the shell's wiring when the screens were rebuilt - it talks
 * almost exclusively to screens/settings.js.)
 */
function wireSettingsBlocks() {
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'bioForm') {
      e.preventDefault()
      saveBio($('#bioSaveBtn'))
    }
    if (e.target.id === 'nameForm') {
      e.preventDefault()
      saveName($('#nameSaveBtn'))
    }
  })

  document.addEventListener('click', (e) => {
    if (e.target.closest('#signOutBtn')) signOut()

    const revoke = e.target.closest('#revokeBtn')
    if (revoke) revokeSessions(revoke)

    const kindChip = e.target.closest('.kind-chip')
    if (kindChip) toggleNoteKind(kindChip)

    // The real <input type="file"> is hidden - a styled button opens it, so the
    // control matches every other button on the page instead of rendering the
    // browser's default file widget.
    const pick = e.target.closest('[data-pick]')
    if (pick) $(`#${pick.dataset.pick}`)?.click()

    const removeImg = e.target.closest('[data-remove-img]')
    if (removeImg) removeProfileImage(removeImg.dataset.removeImg, removeImg)
  })

  // Switches report through `change`, not `click`, so a keyboard toggle counts.
  document.addEventListener('change', (e) => {
    const el = e.target

    // File pickers also report through `change`. Checked before the id gate
    // below because these are matched by data attribute, not by id.
    if (el?.dataset?.upload) {
      uploadProfileImage(el.dataset.upload, el.files?.[0], el)
      return
    }

    if (!el?.id) return

    if (el.id === 'hideBoardToggle') {
      saveSetting({ hiddenFromLeaderboard: el.checked }, { revert: () => { el.checked = !el.checked } })
    }
    if (el.id === 'dmNotesToggle') {
      saveSetting({ dmNotifications: el.checked }, { revert: () => { el.checked = !el.checked } })
    }
    if (el.id === 'reduceMotionToggle') {
      setLocalPref('reduceMotion', el.checked)
      toast(el.checked ? 'Motion reduced' : 'Animations on', 'ok')
    }
    if (el.id === 'confirmSignOutToggle') {
      setLocalPref('confirmSignOut', el.checked)
    }
  })
}

/** Everything the app wires globally. Called once from boot(). */
export function wireDelegates() {
  wireGlobalClicks()
  wireSettingsBlocks()
}
