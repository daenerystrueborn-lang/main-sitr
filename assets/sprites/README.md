# Sprites

The Pokémon artwork in this folder is served by this site, not hot-linked from
Pokémon Showdown's servers. That means the dex, the collection and the battle
screen all work without a third-party CDN (and without CORS, or a broken image
whenever Showdown is slow).

## What's here

| Path | Contents |
| --- | --- |
| `pokemon/<dex>.png` | front sprite for National Dex 1–1025 |
| `pokemon/back/<dex>.png` | back sprite for the same 1025 species |
| `items/<id>.png` | 61 item icons (balls, potions, status heals, berries, held items, repels) |

Files are keyed by **National Dex number**, not by name. `Nidoran♀` is `29.png`,
`Mr. Mime` is `122.png` - see `spriteUrl()` in `assets/js/showdown.js`, which is
the only place a sprite path is built.

## Where they came from

* Sprites: [PokeAPI/sprites](https://github.com/PokeAPI/sprites), directory
  `sprites/pokemon/versions/generation-v/black-white/` (front, `back/`) and
  `sprites/items/`. These are the same Black/White battlers Showdown's client
  serves.
* Only the static front and back frames were copied. The `animated/` set is
  ~262 MB and is deliberately **not** in this repo.

## Data tables

`assets/data/pokemon/` is generated from the `pokemon-showdown` npm package
(`dist/data/pokedex.js`, `moves.js`, `learnsets.js`):

* `pokedex.json` - 1025 species: number, name, types, generation, base stats,
  abilities, height, weight, colour, egg groups, pre-evolution and evolutions.
* `moves.json` - every move with type, category, power, accuracy, PP, priority
  and description; moves that only existed in an earlier generation carry
  `"past": true`.
* `learnsets.json` - species id → move ids it can learn.

## Licence

Pokémon and Pokémon character names are trademarks of Nintendo, Creatures Inc.
and GAME FREAK inc. The artwork is © their respective owners and is used here
for a non-commercial fan project. Pokémon Showdown's client assets are
distributed under the MIT licence; PokeAPI/sprites is a mirror of those assets.
If you fork this project, keep this notice and check the upstream licences
before using the art commercially.
