> Pre-fix findings for 0.8.2fr. The 0.8.2fs fixes and verification are in [the fitted-collision report](ship-collision/README.md). The live overlay and JSON now show the corrected version.

# Current ship collision audit — 2026-10-13

All 19 shipped hulls were checked. Their collision models are **not consistently accurate**. No gameplay or balance values were changed by this audit.

## Confirmed findings

1. **Player weapon collision is a small sphere, while NPC weapon collision follows the hull envelope.** This affects every player hull. The live beam routine was exercised on all 15 hulls: each had a ray crossing visible hull that missed the player and hit the equivalent NPC. Incoming projectiles use the same small sphere with a little padding. This is a much larger difference than the deliberate 30% physical-collision forgiveness.
2. **Most ships have correct outer dimensions but an inaccurate single ellipsoid.** All 15 small/medium hulls match their current GLB dimensions. The ellipsoid nevertheless fills gaps between wings and engines and misses some extremities. Talon, Scrapper, Lancer, Legionary and Blade have especially large empty regions. The battleship also uses one ellipsoid despite its complex shape.
3. **Carrier vertical bounds are undersized.** Its visible local Y range at NPC scale is −269.80 to +233.31, but physical/weapon bounds extend only ±239.47. Its collision height uses an older half-size rather than the maximum reach from the actual origin. Cruiser physical width is also about 2.5% too small (±192.62 versus ±197.57).
4. **Frigate and cruiser weapon collisions are substantially closer to the model.** They use exported triangles plus component envelopes; projected mismatches are approximately 0–6%. Their physical contacts still use ellipsoids. Separate moving turret geometry was not included in the reference mesh, so these percentages must not be interpreted as exact turret accuracy.
5. **Some physical contact routines are more conservative than the nominal ellipsoid.** A direct Wayfarer/small-sphere probe reports contact with an obstacle wholly outside the visible hull's X bounds. The sphere routine uses directional support as a radial distance, which can cause premature contact on diagonal approaches. The overlay shows the nominal ellipsoid, not every obstacle solver's effective surface.

## Method and limits

Loaded each current shipping GLB with the runtime yaw, GLB scale, NPC scale and base scale. Compared runtime bounds and cast 72 × 72 full-depth, double-sided rays from top, side and front: **295,488 geometry rays**, plus 15 live beam cases. SHA-256 hashes, exact bounds, all three view metrics and reproduction coordinates are in [the JSON results](../output/ship-collision-audit/results.json).

Yellow in the overlay means visible hull missed by the proxy; red means proxy covering empty space. “Missed” uses actual model silhouette area as its denominator; “empty” uses proxy silhouette area. These are orthographic sampling measurements, **not combat miss rates or damage probabilities**. Shield presentation, missile/bolt padding, separate mounted equipment and moving turret poses are excluded. The hull's integral GLB details are included. No station geometry was modified.

The focused regression runs passed: **74 + 67 test executions**, covering ship contacts, mesh queries, approved model integrations, frigate/cruiser component hits and carrier/battleship model integration. Existing tests mostly validate calibration or algorithms; they do not prove whole-model shape agreement.

## All hulls: top-view weapon comparison

| Hull | Bounds error X/Y/Z | NPC visible hull missed | NPC proxy in empty space | Player visible hull missed |
|---|---|---:|---:|---:|
| blade | matches | 10.9% | 45.2% | 86.3% |
| speedster | matches | 14.4% | 42.9% | 63.6% |
| legionary | matches | 2.0% | 46.7% | 76.6% |
| andromeda | matches | 15.1% | 23.6% | 91.8% |
| torsas | matches | 12.9% | 13.9% | 82.6% |
| astra | matches | 11.1% | 29.3% | 81.4% |
| wayfarer | matches | 10.8% | 19.1% | 83.5% |
| vanguard | matches | 4.2% | 24.0% | 83.9% |
| demon | matches | 13.2% | 44.9% | 85.3% |
| mule | matches | 10.3% | 22.9% | 80.8% |
| scrapper | matches | 4.6% | 53.8% | 87.3% |
| talon | matches | 2.2% | 69.7% | 83.5% |
| prospector | matches | 6.6% | 8.9% | 86.3% |
| lancer | matches | 1.1% | 48.0% | 83.0% |
| atlas | matches | 14.3% | 2.1% | 87.8% |
| concord-frigate | 0.1% / 1.0% / 0.2% | 0.3% | 1.5% | — |
| concord-battleship | 0.0% / 0.0% / 0.0% | 3.2% | 40.3% | — |
| concord-carrier | 0.0% / -11.2% / 0.0% | 3.7% | 9.3% | — |
| concord-cruiser | -2.5% / 0.1% / 0.0% | 3.5% | 5.4% | — |

## Recommended fix order

1. Use a hull-based weapon hitbox for the player, with an explicit, modest forgiveness factor shared across weapon types. Retest incoming damage balance because the current sphere provides substantial accidental protection.
2. Replace single ellipsoids with a small compound hull proxy for winged ships and capitals. Keep gaps between separate engines and wings clear; preserve the intended forgiveness for physical player contacts.
3. Correct carrier/cruiser bounds from current geometry and fix the diagonal sphere contact approximation. Add whole-fleet geometry checks so later model changes cannot silently drift.
4. Keep collision proxies cached and allocation-free; avoid traversing rendered meshes in combat hot paths.

Reproduce: `node --import ./tests/helpers/offline-imports.mjs tools/assets/audit-ship-collisions.mjs`.

[Open the visual overlay](http://127.0.0.1:4192/output/ship-collision-audit/index.html).
