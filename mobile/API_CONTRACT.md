# Astral app contract implementation

Based on the API + UI contract supplied in this conversation. All paths are
relative to `<configured HTTPS origin>/api`. No backend source exists in this
checkout; these routes have been tested with contract fixtures, not the live bot.

## Transport

`assets/js/api.js` supplies bearer sessions, cookies for browsers, timeouts,
server error codes/body/retryAfterMs and idempotency keys for POST/PUT/PATCH/DELETE.
`ok:false` is an error even with a 2xx status. Each new mutation gets a secure
random key. Explicit network retries retain the exact method/body/key; there
are no automatic write retries. `commit()` prevents successful writes from being
repeated merely because a subsequent UI refresh failed.

Lookup now sends `{ name }` as specified by the supplied contract. No private
request sends a player/phone/JID/account ID to identify the signed-in user.
Sign-up's explicit phone/OTP target is the documented authentication exception.

## Mounted surfaces

| Surface | Client operations |
| --- | --- |
| Startup | App config before session; minimum-version and maintenance gates; feature flags |
| Home | Featured banners with allowlisted destinations, shop offers, subscription, active run |
| Premium | App plans and subscription; monthly/yearly display; unavailable purchase button; no bot billing |
| Profile | Existing `/me`, edits/uploads, wallet and XP; privacy controls for battle history, loadout, leaderboard and DM |
| Inventory | Cursor pagination; server-provided categories; stacked item IDs and quantities; detail/use/sell/discard with confirmations |
| Equipment | Six real slots, durability and derived stats; equip/unequip; active-run lock |
| Characters/party | Public character detail and owned roster; one saved front member; no invented character-equip endpoint |
| Public player | Public UID only; history/loadout; privacy-specific empty states |
| Shop | Original screen and containers, server catalog prices, offers, purchase confirmation; no dummy items on failure |
| Dungeons | Normal catalog/detail/progress, latest preparation, one-party start with loadoutVersion |
| Active run | Startup/reconnect/foreground recovery, including WhatsApp-originated runs |
| Combat | Server allowedActions and stateVersion; attack/skill/consumable/defend/escape and permitted swarm actions |
| Events | Poll active combat every three seconds when visible and idle; deduplicate IDs/sequences; stop on navigation/background/logout |
| Results | Server result; automatic rewards explanation; Continue only acknowledges; wallet refreshed from `/me` |
| History/goals | Cursor run history, result details, server reset timestamp, eligible goal claims |

Error handling covers handle expiry, private public-player data, world/loadout
locks, stale loadout/combat versions, action-in-progress cooldowns, movement
unsupported, direction-required selection, not-in-battle refresh, and boss lock.

## Deliberately inactive

No UI calls item upgrade, quick-clear, auto-battle, pause/resume or subscription
webhooks. No client damage, reward, wallet, inventory or movement simulation is
performed. `appPremiumBilling:false` and unavailable plans cannot enable purchase
controls. Even a future true flag still needs a real native billing adapter and
provider proof before verification/restore can be exposed.

## Response envelopes to verify against live JSON

The supplied contract describes many fields without complete JSON examples.
Controllers accept direct resources and common resource envelopes:

- Config: `minimumSupportedVersion`, `maintenance`, `features` (also accepts
  `featureFlags`/`flags`).
- Lists: `dungeons`, `items`, `characters`, `plans`, `goals`, `runs`, `events`;
  `nextCursor` for pagination.
- Preparation: direct or `preparation`, with `eligibility`, `party.memberIds`,
  and `loadoutVersion`.
- Equipment: direct or `equipment`, with `slots` keyed by the six slot names,
  or an array of `{ slot, item }`; `derivedStats` and `loadoutVersion`.
- Combat: `combat` (or a direct object), `allowedActions` as action strings or
  objects with `type`; `player`, `enemy`/`enemies`, `skills`, `consumables`,
  `stateVersion`. HP/MP accept scalars with maxHp/maxMp or `{current,max}`.
- Inventory: `items` using returned `id`/`instanceId`, `qty`/`quantity`,
  `categories`, `storage`; details use `item`. Selling stays disabled without a
  server-provided sellPrice/salePrice for a confirmation total.
- Runs use returned `id`/`runId`; subscriptions accept direct or `subscription`.
- Swarm positions remain server labels unless their scale is explicit. The
  renderer accepts `positions` keyed by stable entity ID (or `player`/`enemy`),
  with numeric `xPercent`/`yPercent` in 0–100, or numeric `x`/`y` plus
  `arena.bounds: {minX,maxX,minY,maxY}` (also `swarm.bounds`). These optional
  visual envelopes need live confirmation; unscaled coordinates never move a
  sprite. Movement inputs still send versioned actions, not client positions.
- Optional `spriteKey` selects one of the six bundled cosmetic sprite sets.
  Recognized character names/IDs also resolve to those skins. Unknown identities
  use default visual skins without altering server names, stats or abilities.
  Optional `backgroundUrl` supplies server scene art; a local decorative stone
  room is used otherwise. Asset provenance is in `app-shell/art/README.md`.
- Skill buttons expand server-provided skills only when the skill action is
  permitted. Known unavailable skills remain disabled, with explicitly returned
  `cooldownRemaining` labels. Resource and target IDs are revalidated before
  sending. Animations acknowledge returned state; no client damage/MP cost is
  generated. HP/MP meters and reward previews use returned values only.

A sample response for catalog, preparation, inventory detail/equipment, each
combat mode, events, and results is still needed to confirm these envelopes.

## Verification and release limitations

`npm test` covers fixture-based transport and UI flows. A mocked headless Chromium
smoke check also exercised the real module graph, modal layering, dungeon start,
versioned attack and unavailable Premium with no browser JavaScript errors.
Live bot connectivity, CORS, WhatsApp delivery and Android device behavior have
not been verified. The existing shared token store remains browser localStorage;
a native secure-keystore adapter is still release hardening work. No receipt
verification provider or app-store billing SDK has been added.
