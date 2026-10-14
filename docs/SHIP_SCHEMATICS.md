# Ship schematics — 0.8.2fq

The old outline bake sampled a coarse grid from the model's minimum X bound. Its cells were not centered on the hull symmetry axis, so mirrored slopes received different steps. Small antenna/export differences exaggerated this effect. Blade and the frigate had no baked profile and reused a legacy Wayfarer footprint; cruiser/carrier used generic authored footprints.

All 19 installed hulls now have geometry-derived, symmetric vector contours. Projection includes GLB node transforms and the runtime flight yaw. A centered grid is mirrored, then simplified into clean lines. Menu SVGs and cockpit canvases share the same contours. The menu view box also has equal padding on both sides.

Recognition details show existing hull structure: canopy frames, wing spars, engine banks, cargo frames and capital armament/hangar sections. They are clipped to the hull footprint. No gameplay stats or 3D hull geometry changed.

| Hulls | Recognition cues |
|---|---|
| Speedster, Talon, Lancer | Needle bow; thin swept wings; canted carriers and paired drives |
| Scrapper, Legionary, Blade | Split-wing intake mouths; diamond spars; broad swept wings and launcher fairings |
| Wayfarer, Torsas, Astra | Narrow spine and compact cabin; cargo containers and drive rails; tapered cabin and inner/outer engine banks |
| Prospector, Mule, Atlas | Cylindrical armored hold and service hatch; cargo hold and lateral platforms; six cargo frames and forward bridge |
| Andromeda, Vanguard, Demon | Four long engine pods; heavy bomber shoulders and twin drives; open twin-rail fighter structure |
| Frigate, Cruiser, Carrier, Battleship | Battery rows; long command prow and two broadside sections; three hangar pairs and flight deck; armored citadel and fore/aft battery groups |

## Verification

- 85 focused tests passed: symmetric vectors and raster cells, all current ship variants, unique outlines, shipping-asset hashes, cockpit redraw caching, Arena presentation and affected fleet integration.
- Muted Chrome and WebKit: desktop 1440×900 and landscape-phone 844×390. Actual Arena Run hull cards checked in all four configurations, with no page errors.
- Verified the live career HUD routes the Wayfarer own-ship and Blade target monitors through the new vector profiles; screenshot captured with no page errors.
- All 19 profiles reviewed through both the SVG gallery and the real cockpit canvas drawing method at 48px and 96px.
- `git diff --check` passes.

Local gallery: `http://127.0.0.1:4192/.freebuff/ship-outlines/index.html`.

## Rebuilding after model changes

Run `node --import ./src/game/offlineImportHooks.mjs scripts/bake-ship-schematics.mjs` from the project root. It updates `src/game/shipProfiles.js` and `docs/ship-schematics.json`; the latter binds each profile to the exact installed GLB. Recognition marks are maintained in `scripts/ship-schematic-details.mjs`. Review the result at small sizes before shipping.
