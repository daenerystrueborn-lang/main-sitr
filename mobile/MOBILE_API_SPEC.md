# Mobile pages — the API the bot must serve

The phone pages (Wallet, Guilds, Empires, Storage, Progress, Pokémon) call
routes that live in the bot. None of them existed in this repo, so the first
live render was built on guessed envelopes and produced exactly what you saw:

| What you saw | Cause |
|---|---|
| Bank `NaN`, Carried `0`, everything else `0` | amounts arrived as objects/strings the page didn't parse |
| Every guild and empire wearing the same picture | no per-record image field, so every card fell back to one shared file |
| `NaN citizens` | count arrived as an object (`{ count: 12 }`) or a string |
| Guild names containing `}}` | the bot names include its own interpolation braces |
| Ender chest still "locked" after buying | ownership came back under a field the page didn't read |
| Pokémon had no picture | the bot sends a name/id, the page only read `image` |
| Rank showing `null` | progress sends `rank: null` |

The frontend now reads all of these defensively (`assets/js/shape.js`), so most
of the above is already fixed without backend work. What follows is the exact
contract that makes the pages *correct* rather than merely non-broken.

Every response must be `{ ok: true, ... }`, and errors `{ ok: false, error }`,
matching the rest of the API.

---

## 1. Wallet — `GET /api/wallet` (player)

This is the one that showed `NaN`. Send plain numbers.

```json
{
  "ok": true,
  "wallet": {
    "solars": 20400,
    "bank": 5000,
    "vault": 1200,
    "gems": 30,
    "loan": 0,
    "loanDueAt": null
  }
}
```

- All five amounts **numbers**, not strings, not `{ amount: n }`.
- `bank` and `vault` are the deposit balances (not the capacity).
- If a player can have a loan, `loan` is the outstanding amount and `loanDueAt`
  an ISO timestamp.

`GET /api/wallet/ledger` → `{ ok: true, rows: [{ label, amount, at }] }` where
`amount` is signed (negative = spent). 20 most recent is enough.

Writes (all player, all returning the fresh `wallet` object above):

| Route | Body | Meaning |
|---|---|---|
| `POST /api/wallet/bank` | `{ amount }` | **positive deposits, negative withdraws** |
| `POST /api/wallet/vault` | `{ amount }` | same sign convention |
| `POST /api/wallet/loan` | `{ amount }` | take a loan |
| `POST /api/wallet/repay` | `{ amount }` | repay |

---

## 2. Guilds

`GET /api/guilds` (open) → `{ ok: true, guilds: [Guild] }`

```json
{
  "id": "g_123",
  "slug": "ashen-court",
  "name": "Ashen Court",
  "tag": "ASH",
  "description": "We hold the eastern gate.",
  "memberCount": 12,
  "level": 4,
  "power": 8120,
  "leaderName": "Daenerys",
  "image": "https://…/guilds/g_123.png"
}
```

- **`name` must be the finished string.** Right now it arrives with the bot's own
  template braces in it (`Ashen Court}}`) — that's a server-side format call
  that isn't being applied.
- `memberCount` a **number** (`members: [...]` is also understood).
- `slug` or `id` is what the page passes back as `:query`.
- `image` optional — a guild without one now gets a generated crest instead of
  a shared fallback.

Also needed:

| Route | Access | Notes |
|---|---|---|
| `GET /api/guilds/me` | player | `{ ok: true, guild: Guild }` or `{ guild: null }` when guildless |
| `GET /api/guilds/:query` | open | same `Guild`, plus `members: [{ name, role, score }]` |
| `GET /api/guilds/:query/board` | open | `{ rows: [{ name, role, score }] }` |
| `GET /api/guilds/:query/shop` | open | `{ items: [{ id, name, price, image }] }` |
| `GET /api/guilds/:query/image` | open | the crest **as an image response**, 404 if none |

---

## 3. Empires

Same shape as guilds, different nouns.

```json
{
  "id": "e_9",
  "slug": "sol-dominion",
  "name": "Sol Dominion",
  "description": "The sun never sets on the inner sea.",
  "rulerName": "Rhae",
  "citizenCount": 340,
  "territoryCount": 12,
  "power": 25100,
  "image": "https://…/empires/e_9.jpg",
  "territories": [{ "name": "Ember Coast" }],
  "citizens": [{ "name": "Rhae", "role": "Ruler", "power": 900 }]
}
```

| Route | Access |
|---|---|
| `GET /api/empires` | open → `{ empires: [Empire] }` |
| `GET /api/empires/me` | player → `{ empire: Empire }` or `null` |
| `GET /api/empires/:query` | open → one Empire |

**Per-empire `image` is the fix for "all empires have the same image"** — the
frontend can't tell two empires apart without it, and it will only ever have
the one capital painting otherwise.

---

## 4. Storage — `GET /api/storage` (player)

This is the ender-chest bug.

```json
{
  "ok": true,
  "storage": {
    "used": 18,
    "capacity": 60,
    "enderChest": true,
    "enderCapacity": 27,
    "items": [{ "instanceId": "i_1", "name": "Iron Ore", "qty": 12 }]
  }
}
```

- **`enderChest: true` once bought.** Purchased but still false is what made the
  card show "locked". Any of `enderChest`, `enderChestOwned`, `enderOwned`,
  `enderUnlocked`, `ender: true` or `enderChestSlots > 0` is now accepted — but
  one of them has to actually flip after the purchase.
- `POST /api/storage/move` `{ itemInstanceId, qty, to: "storage" | "inventory" }`
- `POST /api/storage/chest/buy` → `{ ok: true, storage: {…} }`
- `POST /api/storage/ender/buy` → `{ ok: true, storage: {…} }` (must set
  `enderChest: true` in the response)

---

## 5. Progress

| Route | Needs |
|---|---|
| `GET /api/quests` | `{ quests: [{ id, name, description, progress, goal, claimable, claimed }] }` |
| `POST /api/quests/claim` | `{ id }` → the updated quest or the reward granted |
| `GET /api/achievements` | `{ achievements: [{ id, name, description, claimed, claimable }] }` |
| `POST /api/achievements/claim` | `{ id }` |
| `GET /api/progress` | `{ progress: { level, rank, questsDone, achievementsUnlocked, fame, streak } }` |

`rank: null` was rendering as the word "null"; the page now falls back to
`/me.rank.title` and hides the tile if neither exists. Sending `rank` as a
**string** (`"Warlord"`) rather than an object is the simplest fix.

---

## 6. Pokémon

`GET /api/pokemon/mons` (player) → `{ ok: true, mons: [Mon] }`

```json
{
  "id": 25,
  "name": "Pikachu",
  "nickname": "Sparky",
  "level": 22,
  "types": ["electric"],
  "hp": 60,
  "maxHp": 74,
  "heldItem": { "name": "Oran Berry" },
  "image": "https://…/pokemon/25.png"
}
```

- **`id` must be the National Dex number** for the artwork fallback to work. The
  page now falls back to PokeAPI's official artwork using that number, which
  fixes missing pictures for the common case — but the real fix is `image`.
- `types` an array of strings (`["electric"]`) or of `{ name }`.
- `GET /api/pokemon/{overview,party,dex,bag,shop}` mirror the list shapes
  (`mons`, `party`, `dex`, `bag`, `items`).
- `POST /api/pokemon/shop/buy` `{ id, qty }`, `POST /api/pokemon/hunt`,
  `POST /api/pokemon/heal`, and `POST /api/pokemon/mons/:id/{main,hold,unhold,feed,evolve,protect,rename}`.

---

## 7. Events — `POST /api/events/claim` (player)

The one route that doesn't exist at all yet. Needed for the Halloween card
(30 gems + 20,000 solars).

```json
// request
{ "id": "halloween" }

// response
{ "ok": true, "granted": { "gems": 30, "solars": 20000 } }
```

Rules the frontend assumes:

- **Idempotent per account** — a second claim returns `{ ok: false, error: "Already claimed" }`,
  never a second payout.
- Unknown event id → `{ ok: false, error: "Unknown event" }` (the page shows
  "isn't live yet" on a 404/405 and re-enables the button).

---

## Optional: how to hand me the real shapes

If a page still looks wrong, open it with the console and run:

```js
astralDebugCopy()   // copies every raw response the page has seen
```

Paste that back and the renderers can be written against the real envelopes
instead of the defensive ones.
