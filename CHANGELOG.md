## 0.8.2n — Optimized ships with fitted canopies

- Ship all six optimized original hulls, retaining their original paint schemes. Combined geometry falls from 333,788 to 178,253 triangles (46.6%).
- Wayfarer has nine larger mirrored panes, triangular forward side windows, aligned dividers and solid frames fitted to the hull. It uses 22,900 triangles.
- Lancer retains its original textures with symmetrical glass and conservative hull/wing straightening, at 28,108 triangles. Atlas retains its symmetrical bridge windows.
- Preserve turret positions, rebuild hull obstruction clearance, and retain the cockpit turret visibility and canopy material fixes. Invalidate the service-worker cache for returning players.

## 0.8.2m — Lancer canopy correction

- Clear uneven hull triangles from Lancer's six mirrored glass panes, keeping UV seams closed and retaining its original textures and 28,978 triangles.
- Extend the canopy symmetry and obstruction regression check to Lancer. Keep its belly turret mount unchanged.

## 0.8.2l — Symmetrical Wayfarer and Atlas canopies

- Keep the optimized original hulls and their existing textures. Mirror canopy glass and frames precisely about each ship's centerline.
- Seat the hull surface below the windows so uneven triangles cannot cut across the panes. Move coincident UV-seam vertices together to avoid gaps without welding or changing UVs.
- Preserve polygon counts and turret positions. Add front/top canopy views to the local ship comparison.

## 0.8.2k — Cleaner ship models and sharper textures

Original prompt: Clean up the ship models in Blender, reduce polygons, add crisp reflective glass and frames, and sharpen the textures while preserving Talon's look.

- Reduce the six hulls from 333,788 to 178,293 triangles (46.6%), protecting UV boundaries to avoid cracks or distorted paint stripes.
- Restore 2048px source paint maps for five hulls; Wayfarer retains its native 1024px source. Apply restrained sharpening to the five non-Talon paint maps and enable 8× anisotropic filtering, capped by the GPU. Keep material masks at 1024px.
- Fit separate opaque reflective glass and frames into existing windows; preserve Talon's green canopy. Keep Atlas's two bridge window bands. Preserve canopy material colors under NPC faction tinting.
- Keep turret mounts fixed and rebuild obstruction clearance against the reduced hulls and canopy parts. Preserve the cockpit turret visibility fix from 0.8.2j.
- Local before/after review: `.freebuff/ship-cleanup/review.html`; drag to rotate and select any hull. Editable Blender source: `glb_models/ships-cleaned.blend` (local authoring archive).

## 0.8.2j — Cockpit turret visibility

Original prompt: The Wayfarer cockpit shows its turret even though the mount is behind the canopy.

- Omit own-ship exterior turret meshes from the cockpit renderer, which uses a ship-centre camera and does not draw the exterior hull. Retain turret combat logic, NPC models and exterior model inspection.

## 0.8.2i — Lower turret mounts

Original prompt: Wayfarer and Lancer turrets protrude too much.

- Remove the extra support pedestals on those hulls and seat the turret bases directly against the local hull surface. Rebuild clearance for the lower pivots.

## 0.8.2h — Revised turret positions

Original prompt: Move the Wayfarer turret forward onto the antenna area, put Vanguard turrets on the ship's sides, and move the Lancer turret underneath.

- Refit those three hulls and rebuild clearance from their meshes. Vanguard mounts now use port/starboard normals for aiming, model orientation and firing arcs. Lancer uses a lower mount.
- Updated local model inspection and regression checks for side and belly coverage.

## 0.8.2g — Turret overhaul

Original prompt: Review turret placement, logic and models on all hulls; reduce anti-ship accuracy, increase damage slightly, and let close missile pairs and swarms overwhelm point defence.

- Blender-authored laser and four-barrel PDC assemblies with fixed bases, independent yaw/elevation, fitted pedestals and rebuilt hull clearance. All five turret-capable hulls covered; Talon remains turret-free.
- Laser damage 4→6; turret PDC damage 0.8→1.1. Anti-ship tracking error grows with distance, with 0.3 s acquisition on a new target. Ship targeting remains selected-hostile support within 300 km.
- A mothership's PDC turrets and escort drones share a 1.25 s interception recovery. Precise single-missile shots remain; close pairs and swarms can penetrate.
- Local isolated sorties: `game.html?turret-test=1` (PDC), append `&turret=laser` for laser. Interactive model inspection: `.freebuff/turret-review.html`.
- Verification: 54 automated checks passed across weapon/turret and drone suites; affected turret cases rechecked after final barrel-clearance fix. 24 controlled damage scenarios and desktop/landscape-phone browser captures. Details: `docs/turret-review/IMPLEMENTED.md`.

## 0.8.2f — Clear radar

Original prompt: Remove tracking/signature status messages such as “Ortung · bekannt” to keep the radar clear.

- Remove the radar status strip and its HUD update. Detection and identity mechanics remain unchanged; the diagnostic status helper remains available.

## 0.8.2e — Hyperdrive console button

Original prompt: Lower the hyperdrive button and integrate its styling into the cockpit sprite.

- Lower the button into the centre console, with a brass bevel, recessed navy face and mounting screws. Preserve ready illumination and the touch hit area.

## 0.8.2d — Monitor fit and joystick travel

Original prompt: Align cockpit monitors with the painted sprite, halve the joystick centre knob, and let maximum touch scaling reach the own-ship display.

- Sprite and live monitors share one coordinate system and banking transform across screen sizes.
- Fit monitor rectangles to the sprite's actual display openings.
- Joystick knob is 21px; steering area grows with touch scale toward the own-monitor bezel.

## 0.8.2c — Automatic scans and clear radar

Original prompt: Remove redundant asteroid scan controls and remove ID/signature from the radar.

- Selected asteroids and wrecks already scan automatically in range. The secondary button now launches missiles, deploys/recalls mining drones, operates salvage, or captures surrendered pilots according to the target. The primary button always fires guns.
- Remove radar ID/signature text; move the transponder switch into the ship menu. Radar tap still opens navigation.

## 0.8.2b — Cockpit controls (local preview)

- Expose joystick selection on the title screen; retain tilt and existing saved preferences.
- Recessed cockpit controls, circular joystick travel, a small central deadzone, and reliable recentring.
- Move radar identity/signature to its lower edge and suppress quiet tracking text.
- Reduce repeated mining information and compact service/equipment spacing.
- Landscape-only play retained. Test at http://localhost:4184/game.html?drone-test=1; choose Joystick in Pause → steering.

# Changelog

## 0.8.2a — Drone mining and PDC escorts

- Mining is drone-only on Wayfarer and Prospector. Assignments survive retargeting; travel waits for drone recovery.
- Normalize cargo to one mass per unit, rebalance commodity prices, and refund the retired mining upgrade in existing saves.
- PDC drones defend against missiles first, attack hostile ships within 300 km, and use the new single/multiple-drone escort formations.
- Fix distant Azure ring holes in the fullscreen ring-volume pass.
- Keep the local drone-test launcher and isolated test-save mode. Include the interface review as documentation; its proposed redesign is not implemented.
- Build 0.8.2a; save schema 16; cache v194-0-8-2a-pdc-combat.

## PDC drones — automatic ship attacks

DEFEND now attacks the nearest unobstructed hostile ship within 300 km of each drone, without needing target selection. Incoming missiles/torpedoes remain first priority; interception range is also 300 km. Ship shots use physical PDC rounds, finite ammunition and the existing damage profile. Orbit/escort and empty-magazine recall remain unchanged. Mothership, intervening ships and world obstacles block firing. Ship attacks respect hold-fire flags; neutral, dead and racing ships are excluded. Updated English/German bay instructions. Cache v194-0-8-2a-pdc-combat.

Validation: drone combat tests cover the range boundary, hostile-only targeting, nearest clear target, missile priority, ammunition, reservation separation and hull occlusion. Existing drone and formation tests pass. Browser: 100 drone shots reduced a stationary test hostile from 1,000 to 920.8 hull while all three drones continued escorting; no browser errors. Artifacts in .freebuff/pdc-combat/. Local test remains port 4183.

## PDC escort formation — local follow-up

A single PDC drone holds beneath the deck turret, opposite its side of the hull and at the same fore/aft station. Two or three escorts are evenly spaced on a 12-second circular orbit around the ship's local Z axis at mid-hull: above, starboard, below, port. Radius clears the larger hull half-width/height by 15 simulation units. Anchor velocities include orbit motion, ship translation and rotation; drones physically fly to changing positions and recall normally. Targeting remains missile/torpedo defense, not attacks on enemy ships.

Validation: focused formation checks cover 1/2/3 drones, equal spacing, quarter-turn orbit, ship rotation, physical tracking and recall; existing drone assertions pass. Cache: v193-0-8-2a-pdc-formation. Local test remains port 4183.

## 0.8.2a local follow-up — Azure rings and PDC setup

Fixed the actual fullscreen ring-volume pass: stable depth reconstruction uses the far edge of a 24-bit depth sample, while analytic sphere intersection keeps the rear ring behind Azure. The previous planar-ring polygon offset did not affect this pass. Full-flight before/after screenshots reproduce and remove holes at 180,000 and 400,000 distance; a foreground-occluder check also covers nearby objects.

Outfitting → Ship systems now includes drone refill/repair/rearm and PDC DEFEND/STOW beside bay selection. PDC launch is automatic after takeoff in DEFEND mode. Browser testing selected PDC, bought a full 120-round drone for 1,500 credits, and verified automatic escort after launch. No browser page errors. Local test remains http://localhost:4183/game.html?drone-test=1; cache revision v192-0-8-2a-ring-depth. No GitHub publication.

## 0.8.2a — Streamlined drone mining (local test)
Validation for 0.8.2a: focused drone, cargo economy, save migration, fitting, ship stats/trade, input, tutorial and phone-dock checks passed. Browser: primary-pad mining, physical delivery, independent retargeting, queued hyperdrive engagement after recovery, ore sale and drone service passed at 844×390. Real generated deposits are rounded up to whole extractable units, including legacy remnants; this fixes the prior fractional-deposit rejection. Browser diagnostic checks were clean. Screenshot artifacts: `/tmp/vr-drone-final/` and `/tmp/vr-drone-browser/`. The live test server is port 4183. No GitHub push was made. SAVE_VERSION 16; GAME_VERSION 0.8.2a; CACHE voidrunner-v191-0-8-2a-drone-mining.


Only Wayfarer and Prospector can mine. Tap the primary MINE pad (or press M) to deploy miners; tap RECALL to recover them. The secondary pad remains SCAN. A mining assignment survives changing your selected contact. Hyperdrive recovers mining and PDC drones before departing; tap hyperdrive again to cancel the queued departure. Emergency abandonment is a deliberate two-step action in the ship menu.

All commodity and sealed-cargo units occupy one hold space. Ore has a base price of 315 credits: the actual Helix sale quote averages 6,338 credits for 32 ore across 32 initial market seeds; 29 ore plus 3 gold averages 11,350 credits. Other goods retain approximately their former base value per hold space (water 18, food 38, medicine 290, electronics 407, machinery 80, gold 1,800, scrap 43, luxuries 413, arms 439). Gold pockets retain their 8% chance and 1–3 unit yield; overflow appears as collectible cargo instead of disappearing.

The Resonant Mining Lance is retired. Save schema 16 refunds each installed or stored copy at 7,600 credits once. Existing cargo counts remain intact if the new total exceeds capacity; sell or jettison the excess before loading more. Inbound drone cargo reserves space against mining, salvage and pickups.

Bay configuration is in Outfitting. Services offers one default drone service action, with maintenance-only under Service options. Fleet details and emergency abandonment are in the ship menu. The distant-ring correction from 0.8.1a is included.


## 0.8.2 — local test, 2026-09-12

- Add mining drones that launch, cut ore, return it to the hold and repeat. The existing missile control starts mining on a scanned asteroid in range or recalls active miners. Leaving range also recalls them.
- Dedicated bay matrix: Wayfarer 1; Prospector 3; Talon, Vanguard, Lancer and Atlas 0. Each bay fits either 2 mining drones or 1 point-defense cannon (PDC) drone; Prospector can mix bay modes.
- PDC drones escort the ship and intercept hostile missiles and torpedoes with finite ammunition. Drone losses persist; station service supports replacement, repairs and PDC rearming, using compatible locker stock before buying replacements.
- Complete station and cockpit UI integration, including the asteroid SCAN fallback for PDC-only fits.
- Set ore mass to 1.0 per unit and base price to 520 credits. A stock Wayfarer's 32-mass hold now fits 32 ore units, targeting roughly 10,000 credits gross at Helix's refinery market before operating costs. Local supply, demand and market cycles determine the actual payout.
- Bump package metadata to 0.8.2 and the service-worker cache to `voidrunner-v189-0-8-2-mining-drones`. Precache all five drone modules (`droneData`, `droneMining`, `droneSystem`, `dronePdc`, `droneService`); other flight modules and optional art are cached after use.

Validation:

- Focused Luna Max unit test `src/game/drones.test.mjs`: 1/1 passed.
- Earlier Luna Max browser integration pass at `http://127.0.0.1:4182/game.html`: 15/15 passed, covering Wayfarer mining, out-of-range recall, PDC-only SCAN fallback, finite-ammo PDC, service UI, Prospector's three bays and clean browser diagnostics.
- A later manual CUA/Luna attempt was blocked by the harness and did not establish a product failure. Freebuff GLM 5.3 Flash exploratory checks were used via computer use.
- The old fleet-loadouts probe has stale 0.8.1 catalog assertions. These results do not claim a completed live-phone pass; the 0.8.1 validation below remains separate history.

Status: completed local 0.8.2 mining-drone test build on `codex/0.8.2-mining-drones`. No GitHub push or publication was made.

## 0.8.1 — 2026-09-11

- Add an eight-wave Arena Run with equipment sets, hull changes, saved preparation checkpoints and an unlockable hard mode.
- Preserve arena throttle, start wave one directly, simplify rewards and fix undocked outfitting. Replace repair rewards above 80% hull.
- Add hull-specific automatic PDC and tracking-laser turrets, equipment alternatives, two-beam starter and Fire all gun groups. Preserve displaced equipment in existing saves.
- Improve NPC field navigation, bounded steering and ace manoeuvres. Make novice gunfire less accurate and missile launches slower with fresh warnings.
- Set beam/PDC reach to 300 km, Ripper to 350 km, pulse/ion to 400 km, plasma to 450 km and Gauss to 600 km.
- Standardise projectile speed and lead: normal rounds 500 km/s, Gauss 1,200 km/s, plasma 300 km/s; beams remain instant.
- Restore original turret mounts, check forward hull clearance, and add missile-priority PDC interception plus ten-round anti-ship bursts.
- Fix Lancer beam convergence and plasma direct/splash damage. Increase missile speed while retaining bounded turns, finite magazines and early missile-free arena waves.

Validation: automated combat, save, arena, equipment and field-flight regression suites. Actual-model projections checked restored mounts. Live phone combat feel and layout still need verification.
