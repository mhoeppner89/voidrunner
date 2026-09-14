# Flush mounts — 0.8.2i

Removed the extra pedestals from Wayfarer and Lancer; both turret bases now seat directly on the local hull surface. Rebuilt clearance and passed all 34 focused turret/combat checks, including forward and underside arcs. Captured ten model views without browser errors and inspected side, three-quarter and underside placements.

# Placement update — 0.8.2h

Wayfarer turret moved forward onto the antenna area (local Z −0.48 of hull half-length). Vanguard turrets now occupy port and starboard side mounts, with outward X-axis bases and matching firing hemispheres. Lancer M turret is now underneath. Regenerated all mount clearance data and verified 35 focused checks, including side/belly coverage, banked forward fire, missile interception and drone formation. Ten updated model views captured without browser errors; three-quarter, underside and side views visually inspected. Refresh the existing local model gallery to see this build.

The earlier 0.8.2g implementation and balance measurements below describe the preceding build; weapon damage and accuracy tuning remain unchanged.

# Turret overhaul — 0.8.2g local build

Implemented on `codex/turret-overhaul`, based on main `31e7e34`. No commit or push performed for this overhaul.

## Models and placement

The verified local Blender MCP generated separate tracking-laser and four-barrel PDC assemblies. The editable source is `assets/models/turrets/turrets.blend`; `scripts/build-turret-models.py` reproduces the 27 authored objects / 1,188 triangles across both assemblies. The runtime loads baked vertex data from `turretModelData.js`, shares geometry/materials, and gives each instance its own fixed base, yaw and elevation pivots. No Blender connection is needed to play.

Mounts: Wayfarer top S; Vanguard top/bottom S; Prospector rear-top S; Lancer top M; Atlas rear-top/forward-bottom S. Talon has none. Deck intersections fit the bases, with support pedestals where the forward arc needs extra height. NPC model scaling also scales the assembly and muzzle placement. Changing gun types or hull-dependent pedestal heights replaces the correct assembly.

Clearance is baked from the shipped hull triangles over a complete sphere, sampled every five degrees. The minimum of neighbouring samples conservatively clips firing arcs. Held barrels that would enter the deck when the hull banks retract their aim outward. These sampled arcs may reject some grazing shots near hull details; they are intentionally conservative rather than exact runtime mesh raycasts.

The M mount uses a larger adapter/assembly. Both available turrets remain the same S-compatible equipment with the same damage in either mount; there is no unexplained free damage bonus from mounting an S weapon in an M socket.

## Combat

- Selected-hostile supporting fire within 300 km remains unchanged. Hull arcs, obstacles, intervening ships, combat mode, hold-fire, disruption and energy reserve still gate fire.
- New anti-ship target acquisition: 0.3 seconds. Smooth deterministic aim error: approximately one degree, independent of frame rate, varying between mounts and ships. Small distant targets can evade shots.
- Tracking laser: 6 damage, 4 energy, 0.7-second interval.
- Turret PDC: 1.1 damage, 10 rounds at 0.07-second intervals followed by a 1-second pause; 0.6 energy/round; 15% damage against shields. Drone anti-ship damage is unchanged.
- Missile aiming retains exact intercept prediction. All of one owner's PDC turrets and escort drones share a 1.25-second intercept recovery. Additional defenders add coverage without multiplying simultaneous missile-killing capacity. Other ships have independent recovery channels.
- A close pair or swarm can penetrate. This is a timing/coverage limit, not a guarantee that every second missile anywhere in space survives: sufficiently separated missiles can both be intercepted.

## Verification

Automated suite: 54 passing checks across turret equipment, PDC dogfight, new turret-overhaul tests and drone combat/formation/integration/core tests (includes shared weapon tests). After the final barrel-clearance and shared-asset changes, the affected 33 checks passed again.

New checks exercise actual projectile interception at seeker cruise speed: one incoming missile causes zero damage, a pair launched 0.15 seconds apart causes one hit, and a four-missile salvo causes three hits. Another check combines a fired mothership turret with four drone controllers, confirms the common recovery blocks additional intercepts, and permits one shot after recovery. Model tests verify the barrel direction and base orientation on rolled hulls and underside mounts. Existing tests cover banked forward arcs on all eligible mounts, blind spots, energy starvation, interception during attack bursts, friendly occlusion, and range boundaries.

`balance-results.json` contains 24 deterministic, 30-second scenarios using real beam/projectile collision paths against small pirate and large trader hulls, stationary and weaving, at 50/150/299 km. Energy is replenished and target damage is recorded without killing it: these isolate accuracy and unconstrained supporting DPS, rather than representing an entire battle or reactor-limited DPS.

Example stationary small-target results:

| Weapon | 50 km hits / DPS | 150 km hits / DPS | 299 km hits / DPS |
|---|---|---|---|
| Laser | 100% / 8.4 | 69% / 5.8 | 21% / 1.8 |
| PDC, unshielded | 100% / 6.23 | 63% / 3.92 | 22% / 1.39 |

Large hulls remain easy targets. Hit damage increases close-range support; declining accuracy reduces damage at long range, as intended. These are first-pass tuning values for player testing.

Browser: both PDC and laser test sorties booted with the matching model, no page errors. Desktop 1440×900 and landscape-phone 844×390 screenshots were captured. Model inspection covers all six hulls, top, side, underside and three-quarter views, plus assembly close-ups. The updated flange geometry removes a coplanar base detail found during inspection.

## Try locally

Serve the repository on port 4184 (already running):

- PDC fight: http://localhost:4184/game.html?turret-test=1
- Laser fight: http://localhost:4184/game.html?turret-test=1&turret=laser
- Model inspection: http://localhost:4184/.freebuff/turret-review.html

The fights start a disposable rookie arena sortie with the turret installed and a hostile selected. Fly normally to try firing arcs; reload to restart. The turret query uses a separate save key. The normal career and existing drone-test fixture remain available. The gallery lets you switch PDC/laser, change viewing direction, drag to rotate and scroll to zoom.

Reproduce checks:

```
node --import ./src/game/offlineImportHooks.mjs --test tests/turret-equipment.test.mjs tests/pdc-dogfight.test.mjs tests/turret-overhaul.test.mjs src/game/droneCombat.test.mjs src/game/droneFormation.test.mjs src/game/droneIntegration.test.mjs src/game/drones.test.mjs
node --import ./src/game/offlineImportHooks.mjs .freebuff/turret-balance.mjs
node .freebuff/capture-turrets.mjs
node .freebuff/probe-turret-flight.mjs
```
