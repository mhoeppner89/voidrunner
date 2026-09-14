# Turret review — current main 0.8.2f

Review only; gameplay and assets have not been changed. Inspected all six playable hull GLBs using the existing clearance baker's coordinate convention, turret simulation, rendering and weapon definitions. The focused turret/equipment test run passed 17 tests (including imported weapon-overhaul tests).

## Findings

1. **Mounts float above local decks.** Anchors use 112% of global hull half-height. The render model is a sphere without a pedestal. Approximate pivot-to-deck distances measured by vertical rays through the fitted GLB geometry: Wayfarer 0.87, Vanguard top/bottom 0.43/0.64, Prospector 1.68, Lancer 0.82, Atlas top/bottom 2.03/1.11 world units. Sphere radius is only 0.35 (S) or 0.55 (M). These are geometry diagnostics, not live-render screenshots. Talon has no turret slots. See mount-projections.png; yellow markers indicate pivots and illustrative forward barrel directions.
2. **Accuracy is effectively perfect once tracking catches up.** Lasers use immediate beams with no aim error. PDC uses exact constant-velocity interception with no spread. Both fire only within 0.001 radians of the desired direction. Lasers turn at 1.2 rad/s; PDC at 4.5 rad/s. Turning targets can still evade physical PDC rounds.
3. **Damage is modest.** Tracking laser: 4 damage every 0.7s, theoretical 5.71 DPS. PDC: ten 0.8-damage rounds, nine 0.07s gaps then a 1s pause, theoretical 4.91 hull DPS and 0.74 shield DPS at shieldMul 0.15. Actual output is lower with simulation cadence, tracking, obstruction, misses and energy reserves. A forward beam is 8 / 0.4 = 20 DPS for comparison. M turret slots use exactly the same weapon stats as S slots.
4. **The 3D model does not communicate mechanics.** Every turret is a grey sphere and single barrel. PDC and laser are identical; only sphere size changes for M. The whole assembly rotates to aim, rather than a fixed mount with traversing head and elevating barrel. There is no proper deck attachment. The simulation's muzzle offset of 1 unit does match the current barrel endpoint. Model creation has a global 32-turret cap; additional simulated turrets can be invisible.
5. **Targeting is narrower than players may expect.** Ship attacks require the player's selected hostile (and combat mode), or the NPC's selected target. PDC missiles have priority, but only missiles explicitly targeting that turret's owner qualify. It is not area-wide fleet defence or automatic nearest-hostile fire like PDC drones.
6. **Coverage needs reevaluation after placement changes.** Top/bottom hemispheres, narrow forward depression and hull/obstacle/ship blocking are present. Detailed baked geometry covers only a forward azimuth/elevation sector; other directions use the coarse hull box. Lowering mounts without updating clearance would make weapons stop firing through overly conservative bounds. Regenerate clearance and validate actual barrel sweeps together with any mount redesign.

## Hull recommendations

- Talon: keep no turrets; preserve fighter identity.
- Wayfarer: retain one top support mount, seated on its central structural frame behind the cockpit.
- Vanguard: retain complementary top/bottom mounts; seat both on proper hardpoints.
- Prospector: retain rear-top defence; add a supported raised mounting platform clear of cargo and equipment.
- Lancer: retain one medium top mount; give it a visibly heavier assembly and an explicit medium weapon option if it is meant to provide more damage.
- Atlas: retain aft-top/forward-bottom coverage; add structural hardpoint supports rather than floating mounts above containers.

## Proposed balance starting point (not yet playtested)

- Laser damage 4 → 6, retain 0.7s cadence: theoretical 8.57 DPS before misses.
- PDC anti-ship damage 0.8 → 1.1, retain cadence and shield penalty: 6.75 hull DPS, 1.01 shield DPS.
- Introduce modest, smoothly varying anti-ship aim error and a short reacquisition delay. Test error relative to target angular size at 50/150/300 km; avoid uniform random spraying that makes small ships practically unhittable.
- Keep missile interception accurate and separate its tuning from anti-ship fire.
- Measure actual damage over time against straight-flying and turning Talons and Atlases, including low-energy cases, before accepting the numbers. Increasing damage alone would make precise hits more punishing without addressing the user's concern.
