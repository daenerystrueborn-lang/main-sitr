# Dungeon visual assets

Character sheets and the six action icons are copied without modification from
https://github.com/daenerystrueborn-lang/astral-fantasy at `d6998c764bdcb60bbbc49aa10a54307143e86c25`.
Only the files used by the mobile dungeon renderer are bundled. Frame counts
are measured from square source frames (128px or 96px).

The source repository was supplied by the app owner. Its ownership alone does
not establish redistribution rights: confirm the original asset-pack licenses
before a public release. No new license or authorship is claimed here.

`scenes/stone-vault.svg` is an app-authored decorative stone-room backdrop,
using the dark dungeon palette in the supplied Astral Fantasy HTML. It is not
a generated gameplay map and does not communicate traversability or rewards.

Samurai (player) and Ninja Peasant (enemy) are default cosmetic skins when no
recognized spriteKey/name is supplied. They do not change the server's character
identity, stats or skills. Supported explicit skin names match the six folders.
Server portraits remain preferred in the HUD. Spatial movement requires explicit
server percentage positions or arena.bounds; unscaled coordinates remain labels.
