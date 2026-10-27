# Mobile pages — what the pages call, and what the bot must serve

The phone-only pages (Wallet, Storage, Progress) and the season event slider
are driven by the bot's API. The Pokémon page has been removed from both the
mobile and desktop site; its bot endpoints, API wrappers, local data, and art
remain in the repository. Section 4 is retained as a backend/API reference, not
as a description of a current website page. Guilds and Empires have also been
removed from the site; their routes are no longer called. This document maps
the remaining frontend pages to the bot contract, plus the handful of things
that only the bot operator can set.

Every response is `{ ok: true, … }`; failures are `{ ok: false, error }` with a
real HTTP status. The site reads `error`, falls back to `message`, and shows it.

---

## Deployment requirements (operator side)

| Setting | What it must be |
|---|---|
| `PUBLIC_API_URL` | the bot's **public HTTPS origin**. The site calls `<origin>/api/...`. |
| `ALLOWED_ORIGINS` | must include the website origin(s) — production **and** every preview domain used for testing. |
| CSP / image allowlist | the `/api/images/*` routes redirect to external hosts; allow those hosts or their images are blocked. |

Rules the frontend follows:

- **No `localhost` in browser code.** The base is `https://…` (or same-origin
  when the site and bot share a host in local development).
- **Bearer first, cookie second.** `Authorization: Bearer <token>` from the
  OTP flow is always sent; `credentials: 'include'` is set too, so the secure
  session cookie works when the token is absent.
- **Never send a player id.** Private routes identify the account from the
  session. The site sends item ids, mon ids, event ids — never "who".
- Override the API base without a deploy: `?api=https://host` (remembered), or
  `window.ASTRAL_API_BASE` before the bundle loads.

## Idempotency

`assets/js/api.js` attaches an `Idempotency-Key` to **every** mutation
(`crypto.randomUUID()`). Two behaviours matter:

1. A **409 `IDEMPOTENCY_IN_PROGRESS`** is retried automatically after
   `retryAfterMs` (max 2 extra attempts, 4s ceiling) with the *same* key and the
   *same* body — that is what makes the retry a replay instead of a second
   charge. It is not surfaced as an error.
2. A failed mutation keeps its `retry()` closure, which replays the identical
   key/body. The Halloween claim also keeps its key across a manual retry, and a
   **503 `CLAIM_SAVE_PENDING` / `CLAIM_COMMIT_FAILED`** is treated as
   *unconfirmed*, never as failed: the button stays live and the event is
   re-read before anything is shown as claimed.

## 1. Wallet — `/api/wallet`

`response.wallet` is numeric: `{ solars, bank, vault, gems, loan, monds }`.
The page prints those directly (monds gets its own tile) and falls back to the
`/me` wallet only if the route fails.

| Call | Body | Notes |
|---|---|---|
| `POST /api/wallet/bank` | `{ amount }` | signed: `+` deposits, `−` withdraws |
| `POST /api/wallet/vault` | `{ amount }` | same signed convention |
| `POST /api/wallet/loan` | `{ amount }` | always positive |
| `POST /api/wallet/repay` | `{ amount }` or `"all"` | "Repay all" uses `"all"` |
| `GET /api/wallet/ledger` | — | recent transactions |

Each successful write returns the settled wallet, and the page repaints from
that response instead of doing arithmetic locally. `GET /api/wallet` also
settles interest, which is why the page re-reads it after a claim.

## 2. Storage — `/api/storage`

Three containers, one route. Top-level `enderChest`, `used`, `capacity`,
`items` describe the **Ender Chest**; `bag`, `chest` and `ender` each carry
their own `items` / `used` / `capacity`. (Reading the top-level `items` as
"everything" was the old single-chest bug.)

| Call | Body |
|---|---|
| `POST /api/storage/move` | `{ from, to, item, qty }` — `from`/`to` ∈ bag, chest, ender; `item` is the raw stack id; 99 max |
| `POST /api/storage/ender/buy` | `{}` — one-off, 100,000 solars, flips `enderChest` |
| `POST /api/storage/chest/buy` | `{ currency: "solars" \| "gems" }` — the page asks which pot pays |

The page has an explicit **transfer panel**: choose *From* and *To* (Bag, Chest
or Ender chest) and the direction is printed in a sentence, then tap a stack and
choose the amount with a stepper before confirming "Move N to …". A move can
land **partially**: the page reads `moved` and `reason` from the response and
reports what actually moved, then re-reads storage. A 200 is not treated as
"the whole stack travelled".

## 3. Progress — quests, achievements, events

`GET /api/progress` → `{ progress: { level, rank, xp, badges, quests, achievements } }`
with `rank` as a **string**.

`GET /api/quests` / `GET /api/achievements` and their `claim` routes are
unchanged. Each quest row and achievement card also carries the painting of the
track it belongs to (Mastery, Social, Adventure, Wealth, Collection, Combat) —
as a backdrop on the existing cards, never as a second card set.

### Halloween

`GET /api/events` (or `/api/events/halloween`) supplies `active`, `claimed`,
`reward` and `badge`. The card:

- shows the claim button **only** when `active && !claimed`;
- prints the reward **from `reward`** (solars / gems / monds / badge), never a
  hard-coded amount, and never credits anything itself;
- posts `{ eventId: "halloween" }` with an idempotency key, then re-reads
  `/api/wallet`, `/api/progress` and `/api/events`;
- treats a replayed `granted: true` as a replay, and `alreadyClaimed` as done;
- shows no countdown, because Halloween has no configured end date.

## 4. Pokémon API reference (no website page)

These server routes and payload notes are retained for backend/API consumers.
The website no longer exposes a Pokémon route or UI on mobile or desktop.

| Call | Notes |
|---|---|
| `GET /api/pokemon/meta` | `starters`, region keys, limits |
| `GET /api/pokemon/overview` | `needsStarter`, party, battle status |
| `POST /api/pokemon/starter` | `{ dexId }` — available to API clients when `needsStarter` is true |
| `GET /api/pokemon/mons`, `/mons/:id`, `/party` | collection and party |
| `PUT /api/pokemon/party` | `{ ids: [owned-id] }` — replaces the party wholesale |
| `POST /api/pokemon/heal` | — |
| `POST /api/pokemon/hunt` | `{}` or `{ region }` |
| `GET /api/pokemon/battle` | reconnects to the fight in progress |
| `POST /api/pokemon/battle/act` | `{action:"move",index}` / `{action:"catch",itemId}` / `{action:"item",itemId}` / `{action:"switch",slot}` / `{action:"run"}` |
| `POST /api/pokemon/battle/forfeit` | ends the battle |
| `GET /api/pokemon/bag`, `POST /bag/import` | separate bag; import reports how many moved |
| `GET /api/pokemon/shop`, `POST /shop/buy` | `{ id, qty }` |

The API client retains a `pokemonMain(id)` helper for
`/api/pokemon/mons/:id/main`, but this route is **not** in the published server
contract and there is no backend source in this checkout to verify it. No site
control invokes that helper. Optional `stats`, `ivs`, `evs` and `moves` returned
by `/mons/:id` are display data; no undocumented mutation is implied here.

The removed battle view consumed `battle.background`, `battle.you.active`,
`battle.you.team` and `battle.foe.active`, used the **1-based** move index and
the **slot** from the team, and offered catch only when a ball was in the bag.
A battle lives in the bot's process memory, so that view re-read
`GET /api/pokemon/battle` on every visit instead of trusting cached state. These
notes document the old client behavior only; the site no longer renders it.

Species data and sprites remain in the repository, but the website no longer
exposes a Dex browser. Owned Pokémon data remains server-backed.

**Instance id vs dex id** is respected everywhere: `id` identifies the owned
mon (party, actions), `dexId` identifies the species (art, starter).

## 5. Pokémon art and data (retained repository assets)

The site no longer loads Pokémon artwork in a page. The repository retains
Pokémon Showdown-derived sprites and data for reference; this section documents
their source and conventions.

The original assets are from **[Pokémon Showdown](https://github.com/smogon/pokemon-showdown)**,
the same assets its own client uses (`assets/js/showdown.js`):

```
https://play.pokemonshowdown.com/sprites/gen5/{id}.png        front
https://play.pokemonshowdown.com/sprites/gen5-back/{id}.png   your side of a battle
https://play.pokemonshowdown.com/sprites/ani/{id}.gif         animated
https://play.pokemonshowdown.com/sprites/ani-shiny/{id}.gif   animated + shiny
https://play.pokemonshowdown.com/sprites/itemicons/{id}.png   items, incl. the Poké Ball
https://play.pokemonshowdown.com/sprites/types/{Type}.png     move type badges
```

Ids are Showdown's: lowercase alphanumerics, accents folded
(`Poké Ball` → `pokeball`, `Mr. Mime` → `mrmime`, `Nidoran♀` → `nidoranf`).
A name with no id produces **no picture**, never another Pokémon's art.

The removed page used Showdown's `data/moves.json` to fill in a move's type
and power when the bot's battle payload only named the move. The local Dex and
art assets remain in the repository, but are not fetched by the current site UI.
The `pokemonImageUrl()` helper remains available to API consumers and builds
`/api/images/pokemon/:dexId?variant=…` when a dex id is all there is.
