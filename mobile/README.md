# Astral mobile app

The app bundles `app-shell/`, based on **Floating Nav – iPhone.html**. The original
screen structures, typography and floating navigation remain. Pokémon is removed.
API data fills existing screen elements; missing data does not trigger a redesign.

## Phone pages on the website

The site's phone experience (floating bottom bar, season event carousel,
inventory manager, Guilds/Empires/Wallet/Storage/Progress/Pokémon pages) talks
to bot routes that are specified in **[MOBILE_API_SPEC.md](MOBILE_API_SPEC.md)**.
That file is the contract to hand the bot: exact paths, required envelopes, and
the field-level bugs it explains (wallet NaN, identical guild/empire art, ender
chest stuck locked, missing Pokémon art, `null` rank).

To report a broken page, run `astralDebugCopy()` in the browser console and paste
the result — it copies the raw response of every endpoint the page touched.

## Build and preview

```sh
cd mobile
npm ci
npm test
npm run prepare:www
# Serve www/ with a static HTTP server.
```

`npm run sync` prepares the bundle and syncs an existing Android project. The
GitHub APK workflow creates Android, runs tests and builds a debug APK. Do not
commit generated www/, Android output or dependencies.

## Configuration

`ASTRAL_API_BASE` is the HTTPS server **origin**, without `/api`. It defaults to
the production origin in `assets/js/api.js`. `ASTRAL_APP_VERSION` defaults to the
package version; CI sets it to the same version used for the generated APK.
Config loads before modules. Content-versioned module imports/styles prevent
stale UI/runtime combinations. The desktop UI is unchanged; the shared API
client now uses the new lookup `{name}` contract and mutation idempotency.

## Structure

- `index.html`, `design.css`, `fonts/`: supplied screen design and local fonts.
- `design.js`: presentation navigation and baseline prototype controls.
- `integration.js`: session/auth, profile/shop and shared UI/error/mutation helpers.
- `app-api.js`: API wrappers for the supplied Gaming App contract.
- `features.js`: config gates, featured content, app plans and feature mounting.
- `management.js`: inventory, equipment, one-member party and public privacy.
- `dungeons.js`: catalog/preparation, authoritative runs/combat/events/results/goals.
- `native.css`: safe areas, layered opaque dialogs, feature visibility and dynamic
  content styles using the supplied design tokens.

See **API_CONTRACT.md** for implemented routes, response-shape assumptions,
unsupported features and live-release limitations. Premium purchases remain
unavailable until genuine provider verification is configured. No fake game
state, local rewards or client-calculated damage is used.

## Dungeon artwork and controls

Bundled character/action artwork comes from the owner-supplied `astral-fantasy`
repository; see `app-shell/art/README.md` for its source revision and licensing
release check. No checkout or remote asset host is needed to build the APK.
The original dungeon/preparation/landscape-combat layout is retained. The local
stone backdrop is decorative, not an independently simulated map.

Six sprite skins support idle and server-confirmed action/hurt/death animations.
Combat buttons provide attack, named skills, consumable selection, defend,
escape, permitted movement/dodge, information, activity log and leave confirmation.
Unpermitted actions are hidden/disabled; auto-battle and pause remain unsupported.
Arrow keys/WASD use the same movement commands as touch; Space attacks. These
shortcuts are suppressed in dialogs, inputs, hidden documents and pending actions.

Sprite translation occurs only from explicitly scaled server positions (see
`API_CONTRACT.md`). Without a coordinate scale, buttons still send the real
movement action and the returned coordinates are shown as labels—not guessed.

## Account screens

Sign-in uses dedicated full-height, dark/gold account screens: player-name
lookup → confirm the masked account → send a WhatsApp OTP → six-digit code →
load the authenticated profile. New players verify a country-code phone number
first, then choose a name and the server's class/race options. No account is
created or session granted locally.

OTP TTL/resend cooldowns use returned server values. Pending controls are locked;
wrong codes stay on verification; back/account correction is supported. Explicit
network retries preserve the original mutation key. After a successful verify or
registration, a failed profile load offers a read-only retry rather than repeating
the consumed OTP or character creation. The code is cleared on successful verify.
