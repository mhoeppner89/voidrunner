# Fitted ship collisions — 0.8.2fs

Original prompt: Fix the collision models for all ships so they fit the current models properly, while keeping performance in mind. Then test it throughout the game.

## Changes

- All 19 hulls have collision data baked from the current shipping GLBs with the runtime yaw, scale and base scale. Weapon hits use their actual indexed surfaces. Player and NPC surfaces match; the player's old tiny sphere has been removed from beam and projectile damage paths.
- Physical contacts use a union of merged solid cells instead of a ship-wide ellipsoid. Source openings and gaps are retained; surface cells conservatively cover the geometry. This is a compact approximation with grid steps of at most roughly 1/128 of the longest hull span (at least 48 cells across each other axis). The player has a small 4% physical tolerance; NPC contacts use full size. Weapons do not inherit that tolerance.
- Corrected carrier/cruiser bounds from the current model origins. The frigate keeps its original, slightly conservative broadphase/mount calibration so its mounted guns stay seated; its actual weapon and contact shapes are freshly fitted.
- Sphere contacts use closest points on solid cells, eliminating premature diagonal bumps. Station, asteroid and hollow wreck contacts use the real obstacle surfaces. Cell contacts resolve toward the ship's side of a wall rather than pulling a penetrated cell farther into it.
- Ship pairs stop after a verified solid contact. Deep embedding uses a conservative exit after contact is confirmed, preventing thousands of unnecessary internal pair tests. Physical-query scratches never alias live ship transforms.
- Landing/departure routes are validated against actual station geometry for the selected hull and both headings. Obstructed pads are shifted slightly outward or withheld; large ships can use a clear central traffic berth, reserved from NPCs during landing/departure. Increased deck clearance and corrected Cinder/Torchwell approach axes. Real station walls remain active even inside a clearance lane.
- Collision trees and typed buffers are warmed when the flight module loads. The route fitter remains outside the title/dock module graph. New modules are included in the service-worker cache.

## Verification

- **1,016 tests passed** in the final full suite (980 project tests + 36 module tests), plus the benchmark-metrics checks at the start of npm test.
- Current-model hashes, geometry transforms and hit equivalence checked for all 19 hulls, including rotated and translated ships. 32,832 independent geometry-reference rays in the regression test; 295,488 top/side/front rays in the overlay audit.
- Every player hull exercised through the live beam and projectile paths in career, arena, arena run and spectator configurations. Confirmed the old outside-hull sphere-contact case now reports no collision.
- All 15 flyable hulls tested against all 13 station models, both player and NPC approach paths. Full NPC landing, waiting, launch and turnout sequences also run against the new fitted shapes. Blackglass's host moon remains solid and all tested approaches clear it. Hollow wreck ring/engine passages checked.
- Muted desktop Chrome, landscape Android/Chrome and iPhone/WebKit browser checks: career flight, arena, Arena Run, six-ship spectator combat and all 19 spectator roster entries. No page errors. Follow-up controlled gameplay confirms player firing damages a visible enemy, incoming beam fire damages the player, station takeoff succeeds and automatic landing returns to the Helix concourse on each platform. Screenshots reviewed.

## Performance

A warm synthetic workload of 240 weapon queries and 24 close ship pairs per batch, covering all 19 hulls:

- Median: **0.51 ms**; p95: **2.07 ms**.
- 57,600 weapon queries and 5,760 ship pairs total; about 16.5 actual triangle tests per weapon query on average.
- **No collision-tree builds during queries.** All ship data uses shared numeric buffers; hot queries allocate no vectors or arrays.
- Data module is about 2.97 MB uncompressed. It contains position/index/contact buffers rather than textures and does not load with the initial title screen.

These are local JavaScript timings, not a hardware-phone FPS claim. Software WebGL rendering and asset decoding are separate costs. Physical cell boundaries remain a small conservative approximation; capital destroyable mounts retain gameplay envelopes and animated mounting details are not a triangle-exact guarantee.

## Overlay results

Percentages are sampled orthographic silhouette areas, not combat miss rates. “Missed hull” is visible model area not covered by the proxy; “empty area” is proxy area covering no model. Capital mount envelopes can cover separate equipment excluded from the reference hull.

| Hull | Weapon missed hull (worst view) | Weapon empty area (worst view) | Physical empty area (worst view) |
|---|---:|---:|---:|
| blade | 0.0% | 0.0% | 15.9% |
| speedster | 0.0% | 0.0% | 5.8% |
| legionary | 0.0% | 0.0% | 13.3% |
| andromeda | 0.0% | 0.0% | 7.5% |
| torsas | 0.0% | 0.0% | 8.6% |
| astra | 0.0% | 0.0% | 9.0% |
| wayfarer | 0.0% | 0.0% | 7.2% |
| vanguard | 0.0% | 0.0% | 5.8% |
| demon | 0.0% | 0.0% | 8.0% |
| mule | 0.0% | 0.0% | 6.7% |
| scrapper | 0.0% | 0.0% | 16.2% |
| talon | 0.0% | 0.0% | 12.1% |
| prospector | 0.0% | 0.0% | 4.4% |
| lancer | 0.0% | 0.0% | 12.2% |
| atlas | 0.0% | 0.0% | 4.5% |
| concord-frigate | 0.0% | 6.0% | 5.7% |
| concord-battleship | 0.0% | 0.0% | 15.0% |
| concord-carrier | 0.0% | 0.0% | 6.2% |
| concord-cruiser | 0.0% | 5.2% | 7.5% |

[Collision overlay](http://127.0.0.1:4192/output/ship-collision-audit/index.html?revision=0.8.2fs) · [Game test version](http://127.0.0.1:4192/game.html?revision=0.8.2fs)

Rebuild after editing a GLB: `node --import ./tests/helpers/offline-imports.mjs tools/assets/bake-ship-colliders.mjs`. Hash checks prevent stale shapes being accepted. Regenerate the overlay with `tools/assets/audit-ship-collisions.mjs`; measure queries with `tools/assets/benchmark-ship-collisions.mjs`, using the same offline import hook.

Evidence: [bake metadata](bake.json), [query benchmark](performance.json), [browser checks](../../output/playtest/results.json), [player actions](../../output/playtest/player-actions.json).
