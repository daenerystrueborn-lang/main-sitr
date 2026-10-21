# Dungeon integration status

The user supplied the **Astral Gaming App API + UI Contract**. Its supported
routes are now wired through `app-shell/app-api.js`, `dungeons.js`,
`management.js` and `features.js`.

The original screen markup is retained. Normal difficulty and one front party
member are supported. Auto-battle, item upgrades, quick clear and pause/resume
controls are hidden. Movement requires both the feature flag and a server-allowed
combat action. Run starts use the latest preparation/loadout version; combat
uses the latest state version. Conflict responses never replay an old move.

See `API_CONTRACT.md` for the implemented surfaces, response-envelope assumptions,
and remaining live verification work. No further visual design is required.
