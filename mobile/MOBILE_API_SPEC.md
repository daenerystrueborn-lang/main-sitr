# Mobile pages — what the pages call, and what the bot must serve

The phone-only pages (Wallet, Storage, Progress, Pokémon) and the season event
slider are all driven by the bot's API. Guilds and Empires have been removed
from the site; their routes are no longer called. The bot's contract is
now published, and the frontend has been rewritten against it rather than
against guesses — this document is the map between the two, plus the handful of
things that only the bot operator can set.

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

## 4. Pokémon

The server owns the rules, so the page draws returned state and posts choices.

| Call | Notes |
|---|---|
| `GET /api/pokemon/meta` | `starters`, region keys, limits |
| `GET /api/pokemon/overview` | `needsStarter`, party, battle status |
| `POST /api/pokemon/starter` | `{ dexId }` — shown instead of the tabs while `needsStarter` |
| `GET /api/pokemon/mons`, `/mons/:id`, `/party` | collection and party |
| `PUT /api/pokemon/party` | `{ ids: [owned-id] }` — replaces the party wholesale |
| `POST /api/pokemon/heal` | — |
| `POST /api/pokemon/hunt` | `{}` or `{ region }` |
| `GET /api/pokemon/battle` | reconnects to the fight in progress |
| `POST /api/pokemon/battle/act` | `{action:"move",index}` / `{action:"catch",itemId}` / `{action:"item",itemId}` / `{action:"switch",slot}` / `{action:"run"}` |
| `POST /api/pokemon/battle/forfeit` | ends the battle |
| `GET /api/pokemon/bag`, `POST /bag/import` | separate bag; import reports how many moved |
| `GET /api/pokemon/shop`, `POST /shop/buy` | `{ id, qty }` |

The existing client also has a `pokemonMain(id)` helper that posts to
`/api/pokemon/mons/:id/main`, but this route is **not** in the published server
contract and there is no backend source in this checkout to verify it. The
"Set as main" control uses that existing helper, waits for success, then reloads
server state; failures are surfaced without a client-side selection change.
Optional `stats`, `ivs`, `evs` and `moves` returned by `/mons/:id` are display-only.
No TM, Mega, move-edit or other undocumented mutation is sent from this page.

Battle UI reads `battle.background`, `battle.you.active`, `battle.you.team` and
`battle.foe.active`, uses the **1-based** move index and the **slot** from the
team, and offers catch only when a ball is actually in the bag. Because a battle
lives in the bot's process memory, the page re-reads `GET /api/pokemon/battle`
on every visit instead of trusting a cached one, and a finished battle clears
the panel and reloads the collection.

The species Dex is shipped locally, so browsing and species details do not
depend on an undocumented `/api/pokemon/dex` route. Owned Pokémon data remains
server-backed.

**Instance id vs dex id** is respected everywhere: `id` identifies the owned
mon (party, actions), `dexId` identifies the species (art, starter).

## 5. Art — Pokémon Showdown

Every Pokémon sprite, item icon and type badge comes from
**[Pokémon Showdown](https://github.com/smogon/pokemon-showdown)**, the same
assets its own client uses (`assets/js/showdown.js`):

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

The site also reads Showdown's `data/moves.json` (once a week, cached) to fill in
a move's type and power when the bot's battle payload only names the move. That
table is optional: if it can't load, the buttons show exactly what the bot sent.

A Pokémon record's own form-specific artwork is preferred for alternate
forms; `imgOf()` also understands PokeAPI `sprites.other['official-artwork']`
records. `battle.background` is used when the game server sends one. Otherwise,
the field uses the player's uploaded forest-clearing image bundled at
`assets/sprites/battle/bg-forest-clearing.jpg`. The field stays 16:9, with a
front sprite for the foe and the back sprite for the player. The active battle
occupies a focused screen; regions and collection navigation stay outside it.
`/api/images` remains the manifest; `pokemonImageUrl()` builds
`/api/images/pokemon/:dexId?variant=…` when a dex id is all there is.

**If an image host is blocked, the page shows a glyph** — never a shared
fallback photo.
