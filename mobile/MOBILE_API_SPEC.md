# Mobile pages — what the pages call, and what the bot must serve

The phone-only pages (Wallet, Guilds, Empires, Storage, Progress, Pokémon) and
the season event slider are all driven by the bot's API. The bot's contract is
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

## 2. Guilds and empires — public lists

`GET /api/guilds` → `response.guilds`, `GET /api/empires` → `response.empires`.
Each card renders the supplied `image` directly (falling back to the bot's
`/api/guilds/:query/image` or `/api/empires/:query/image` banner), the final
display name, `memberCount`, and — for empires — `citizenCount`. Ids used in a
path are URL-encoded.

- `GET /api/guilds/me` → `guild: null` when the player has none.
- `GET /api/guilds/:query{,/board,/shop,/image}` — the sheet shows the board and
  shop previews.
- `GET /api/empires/me` → `empire: null` when none.
- `GET /api/empires/:query{,/shop,/image}` — the sheet shows a **market
  preview** (real prices and stock) and no purchasing.
- `GET /api/empires/:query/board` returns `{ supported: false, board: null }`,
  so **no board UI is rendered for empires at all** — an empty board would read
  as a bug.

## 3. Storage — `/api/storage`

Three containers, one route. Top-level `enderChest`, `used`, `capacity`,
`items` describe the **Ender Chest**; `bag`, `chest` and `ender` each carry
their own `items` / `used` / `capacity`. (Reading the top-level `items` as
"everything" was the old single-chest bug.)

| Call | Body |
|---|---|
| `POST /api/storage/move` | `{ from, to, item, qty }` — `from`/`to` ∈ bag, chest, ender; `item` is the raw stack id; 99 max |
| `POST /api/storage/ender/buy` | `{}` — one-off, 100,000 solars, flips `enderChest` |
| `POST /api/storage/chest/buy` | `{ currency: "solars" \| "gems" }` — the page asks which pot pays |

A move can land **partially**: the page reads `moved` and `reason` from the
response and reports what actually moved, then re-reads storage and inventory.
A 200 is not treated as "the whole stack travelled".

## 4. Progress — quests, achievements, events

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

## 5. Pokémon

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

Battle UI reads `battle.background`, `battle.you.active`, `battle.you.team` and
`battle.foe.active`, uses the **1-based** move index and the **slot** from the
team, and offers catch only when a ball is actually in the bag. Because a battle
lives in the bot's process memory, the page re-reads `GET /api/pokemon/battle`
on every visit instead of trusting a cached one, and a finished battle clears
the panel and reloads the collection.

`/api/pokemon/dex` is not part of the published contract; the Dex tab hides
itself when that route isn't there rather than rendering a dead end.

**Instance id vs dex id** is respected everywhere: `id` identifies the owned
mon (party, actions), `dexId` identifies the species (art, starter).

## 6. Images

`GET /api/images` is the manifest. The page builds art URLs through
`pokemonImageUrl(dexId, { variant, shiny })`:

```
/api/images/pokemon/:dexId?variant=artwork|sprite|animated[&shiny=1]
/api/images/backgrounds/pokemon-battle
/api/images/badges/halloween
```

Order of preference for a mon's picture: whatever the record carries
(`image`, `art.front`) → the bot's image service by `dexId` → PokeAPI by species
name (cached 7 days) → a glyph. No shared fallback file, ever. Battles use the
`battle.background` URL the API returned rather than guessing a path.

---

## When a page still looks wrong

Open it and run `astralDebugCopy()` in the console: it copies every raw payload
the page has seen, with the endpoint it came from.
