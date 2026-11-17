# Balor — approved live cockpit

Review: <http://127.0.0.1:4212/output/cockpit-layout/index.html?hull=scrapper>

Status: **layout and painted composition approved by the user on 16 November 2026; active in live flight from 0.8.2ot**. The user explicitly requested live integration while preserving the reviewed hand, fixed base, monitors and controls. The original PNG and all reviewed geometry remain unchanged. No commit, push or deployment is part of this work.

## Artwork composition

Selected original frame: `assets/cockpits/scrapper-paint-v2.png`, 1850×850 RGBA, built-in imagegen. SHA-256 `04124c56d97683d0380c318b956ee55e7a55338f2108cd52d6f5fd8e3226cb1b`, identical to the tool output `exec-af3ccfb7-a334-4cf0-94a3-97141d24a442.png`. It is copied intact: no bitmap editing, aperture stencil or reconstructed bezels. The structural guide and exact prompts/provenance are in `assets/cockpits/SCRAPPER-PROMPT.md`.

Balor's material language is worn charcoal/brick red with angular gunmetal clamps, guarded four-circuit switch groups, service vents, compact knobs, replacement access plates and a localized welded repair. Hardware follows the shallow receding deck tops; dark vertical cabinet returns attach them to the upright monitor bank. The left landing patch remains clear beneath the original fixed base. The trapezoid canopy and straight roof distinguish it from Mercury's curved navy/ivory frame. A single targeted imagegen refinement thinned the top rail after the initial painted rail crossed the desktop comms label. The selected rail clears comms on desktop and phone.

The original navy/white hand strip and fixed base remain byte-for-byte unchanged, with the same inherited dimensions, scale, pitch pivots, -60 source-pixel rig offset and yaw socket. Visible and invisible control geometry stays shared. `stickClearanceX:416` preserves the original touch target independently of display fitting. The approved live monitor widths/heights are retained; their positions and internal insets gently fit the measured transparent holes in code. The radar/hyperdrive forehead remains low and swept. The 1851×850 source layout is retained, scaling the original 1850×850 image by the same displayed ratio. See the prompt document for native alpha bounds and centroids.

### Artwork verification

Passed the full shared review workflow on desktop Chrome, Android Chrome, iPhone WebKit and a 667×375 small phone. The user explicitly authorized focused updates to the two shared cockpit tests after the earlier delegation's ownership restriction was explained. `tests/browser/cockpit-layout.mjs` now accepts painted authoring reviews and checks Balor's exact selected frame, `art-review` state, five beam segments and 72 glass triangles. It retains the existing production renderer, display backing/underlap, alpha-opening coverage and centering within two source pixels, original PNG/no-clip state, mobile-only controls, fixed shaft anchors, keyboard/touch/controller input, neutral first contact, expanded afterburner, real phone preset, model reference and preserved save/settings checks. No browser errors.

```sh
VR_REVIEW_HULLS=scrapper VR_PROFILES=desktop,android,iphone,small node tests/browser/cockpit-layout.mjs
```

The temporary ignored `survey/shared-art-review.mjs` was used to verify the composition before that permission arrived; the final pass above uses the actual shared test file.

Passed `output/cockpit-layout/scrapper/survey/art-review-check.mjs` for navigation/combat/salvage and all 18 combinations of pitch/yaw across desktop/small phone. The fixed base's complete bounds stay on the projected deck, and every pose keeps the original socket. Frame-alpha holes, inset placement and no-stencil behavior are also checked. Reports and screenshots are under `output/cockpit-layout/scrapper/checks`.

All five checks in `tests/unit/cockpitArtwork.test.mjs` now pass. Its tier-1 review check accepts the new artwork stage while retaining live-selection/preload exclusion and inherited pilot-kit checks; it verifies the RGBA source dimensions, absence of a bezel stencil, unchanged Balor display sizes, fixed touch clearance and rig offset. The initially unchanged test failed solely on the obsolete unpainted stage expectation; the authorized update resolves it. Desktop Mercury/Loki review checks also passed after extending the shared painted-frame assertions. Existing tests were retained.

The complete base footprint was also sampled against the selected frame's actual alpha: all four corners lie on its painted deck on desktop/small phone (alpha 253, effectively opaque). Hand and base files were compared against Git HEAD and are byte-identical. Final desktop, Android, iPhone and small-phone screenshots and combined steering extremes were visually inspected. A scoped salvage DOM check confirmed that the content label/quantity remain inside the fitted target monitor. Syntax and whitespace checks pass.

Those artwork-stage checks used explicit authoring mode and made no career writes. Live approval and integration followed separately; see the integration verification below.

## Model survey

Primary source: `assets/models/ships/scrapper.glb`, the actual shipped patched charcoal/red four-gun pirate fighter (SHA-256 `aadffa9a082edf820ca053c261ec2700ff6a225d49dc470fffb1e0dce277f44e`). Its native forward direction is **+Z**, with +Y up and wings along X. There are no authored seat or interior markers. The GLB contains one identity-transform mesh, 4,604 triangles, and one material: `Scrapper · Chipped brick red / charcoal armor.011`. Its bounding box is `[-1.011,-.26,-.85]` to `[1.011,.2685,.866]`.

Rendered the shipped textured mesh from above, front and an oblique canopy close-up. The canopy is a long faceted wedge: narrow flat roof panes, steep side glass and straight raked pillars, rather than Mercury's rounded bow. Aft engine booms and paired split wings sit outside the canopy; none becomes a beam across the forward view. Authoring `support/revise.py` corroborates the section geometry, but the vertices and UV selection below were checked against the shipped GLB accessor data.

Measured frame sections, in native GLB coordinates:

| Z section | Roof Y | Roof half-width X | Side-sill Y | Side-sill half-width X |
| --- | --- | --- | --- | --- |
| .605, low nose | .006 | .06860 | -.035 | .088 |
| .382, forward bow | .084 | .07092 | -.029 | .122 |
| .218, aft roof | .090 | .06348 | -.024 | .115 |

The chosen ordered bow uses these six exact native points: `[.122,-.029,.382]`, `[.07492,.078,.382]`, `[.07092,.084,.382]`, `[-.07092,.084,.382]`, `[-.07492,.078,.382]`, `[-.122,-.029,.382]`. Positive X is the pilot's left when looking along +Z. The small shoulder facets preserve the real bevel. Do not smooth this into Mercury's continuous curve.

### Packed glass selection

The glass is baked into the same material as the armor. `glassMaterials` alone is insufficient. `scrapper.js` supplies `glassUvBounds:[.75,0,1,.25]` in native glTF UV coordinates. Select a triangle only when all three UVs lie inside this tile. This selects exactly **72 triangles**, forming six shallow closed glazing panels: two roof and four side panels. Native triangle ordinals are 152–187 and 2182–2217 inclusive. Their combined bounds are `[-.11984298,-.03019413,.22782172]` to `[.11984298,.09113900,.59211528]`. No sensor lenses share this tile.

The coordinating chat added this optional UV filter to the shared canopy loader and derives reference edges from the selected glass. The final review reports 72 triangles, and its comparison correctly highlights only the six glass panels. Do not highlight the entire packed mesh or use an X crop as a substitute: the central keel and armor overlap the canopy's X range.

## Proposed interior and composition

Proposed eye `[0,0,.255]`, level look along +Z to `[0,0,1.255]`, vertical FOV 64°. The point is centered beneath the aft roof and behind the measured forward bow. It is a proposed view, not evidence of an authored seat. The model comparison centers on `[0,.025,.38]`.

Adaptations are explicit: widen the projected bow 1.2× horizontally and compress it to .9× vertically. This keeps its real straight roof/sloping sides while moving structure away from the aiming area. The first .75× vertical proposal crossed the small-phone comms label; .9× raises the roof clear while preserving lower monitor connections. Thin shared trim replaces the exterior's thick metal surrounds. The forward nose crossbar and rear roof divisions are omitted from the interior framing to avoid stacking bars over the sightline. Lower jamb extensions, monitor housings, decks and cabinet returns are proposed interior structures; the exterior model does not contain those parts.

The shared baseline retains all display widths/heights and side-display positions. Only the radar moves from y627 to y641 on the 1851×850 source grid. Its swept forehead starts at y560; hyperdrive ends at y633, leaving 8 source pixels above the radar. The old readout/radar renderers, comms/top controls and touch controls remain shared. The console geometry projects coplanar top faces with narrow bevels and dark vertical returns into the monitor fascia. No large filler panel is added.

The approved navy/white hand and fixed base remain unchanged. `handOffsetX:-60` moves the full anchored rig left, independently of its touch target, onto the console top. All pitch views/yaw use the same fixed socket; desktop/controller retains the hand, while right bank and throttle remain mobile only. Verify the complete base footprint on the top face and sleeve cut edges at all steering extremes in the shared review.

## Verification and artifacts

The hull definition and canopy module are wired into the shared registry/builder. Model rendering captures are under ignored `output/cockpit-layout/scrapper/survey/`: `overview.png`, `top.png`, `side.png`, and `canopy.png`. These are renders of the shipped GLB, not generated artwork. The exported albedo under the same directory confirms the isolated top-right glazing tile.

Passed the final focused desktop/small-phone review after rebuilding with the UV filter and raised roof:

```sh
VR_REVIEW_HULLS=scrapper VR_PROFILES=desktop,small node tests/browser/cockpit-layout.mjs
```

This verifies the shared production renderer, source glass geometry, fixed pivot, keyboard/touch/controller inputs, neutral initial touch, expanded afterburner, mobile-only controls, real phone preset, model reference and preserved storage. Both reports show 72 glass triangles. The original material-only comparison highlighted all armor; that defect is resolved in the shared loader. The earlier small-phone comms/roof overlap is resolved by the final .9 vertical factor.

The supplemental ignored `survey/scenes.mjs` checks navigation, combat and salvage at 1440×900 and 667×375, then holds every combination of pitch -1/0/+1 and yaw -1/0/+1. All 18 pose captures retain the correct pitch frame and ±11°/0° yaw. All four corners of the complete base sprite bounds lie inside the perspective-projected left deck top on both devices; its mount remains identical across poses. No browser errors occurred. Inspected final desktop/phone navigation and combat, salvage, the corrected model comparison, all nine small-phone poses and the four desktop combined steering extremes: fixed base, open aiming area, no exposed sleeve cut edges, clear comms and upper controls.

A direct definition check also passed: the factory leaves its baseline unchanged, inherits the original hand/strip/base and display dimensions, returns `layout-review`, has no shell, and remains excluded from normal flight selection/preloading.

Artifacts are under `output/cockpit-layout/scrapper/checks`: `desktop-scrapper.png`, `small-scrapper.png`, `model-reference.png`, per-situation/per-pose PNGs, the focused reports and `desktop-scenes-report.json` / `small-scenes-report.json`. No new permanent test suite was needed for this inactive authoring definition.

The model/layout sections record the approved unpainted-layout survey and its earlier verification. Layout and composition are now both approved. The original hand/base and other hull artwork remain unchanged; no new renderer or CSS is required for integration.

## Live integration — 0.8.2ot

The approved registry now selects Balor in normal career flight and supplies its original frame, hand and fixed base to session warming. `src/main.js` also warms the correct Balor GLB for saved-career startup instead of falling back to the starter. The existing cached alpha, stationary frame and contained hand layer remain unchanged. The runtime/SW identifiers are `0.8.2ot` / `voidrunner-v672-0-8-2ot-balor-cockpit`. Both cockpit factory modules already belong to the service worker's core module graph; the selected art is cached on request without enlarging the title's initial asset install.

All 16 focused cockpit/HUD checks and six ship-purchase/trade checks pass, and runtime packaging, syntax and whitespace checks pass:

```sh
node --import ./tests/helpers/offline-imports.mjs --test tests/unit/cockpitArtwork.test.mjs tests/performance/render-hud-work.test.mjs
node --import ./tests/helpers/offline-imports.mjs --test tests/integration/ship-progression.test.mjs tests/unit/shipTrade.test.mjs
npm run build
```

The HUD suite had a stale legacy-Loki expectation after Loki's earlier approval. It now checks Loki/Balor through the approved renderer/preload path while retaining the legacy-hull aperture checks. The career-flight and offline fixtures also now buy a hull at a shipyard that actually stocks it, returning to Helix for the existing test flow; Balor is not sold at Helix. Production ship availability and trade rules are unchanged.

The iPhone offline check exposed a real missing asset warm-up after purchase: a fresh renderer loads Balor's three baked livery GLBs, but a purchase had warmed only its dock model/cockpit. The failed request was `assets/models/ships/liveries/scrapper-concord.glb`. Successful purchases now call the existing renderer's one-time `preloadGlbShips()` for the selected hull, warming the same dependencies used on resume. A purchase regression failed before that fix and passes after it. The offline check explicitly waits for all three canonical livery URLs in the service-worker cache, without adding them to the title's core install or changing the artwork. Failed-request diagnostics remain available; no page errors are suppressed.

Live/offline verification commands:

```sh
VR_COCKPIT_HULL=scrapper VR_PROFILES=desktop,android,iphone,small node tests/browser/cockpit-artwork.mjs
VR_BASE_URL=http://127.0.0.1:4212 VR_COCKPIT_HULL=scrapper VR_PROFILES=desktop,android,iphone node tests/browser/offline-startup.mjs
```

The career-flight harness passed on desktop Chrome, Android Chrome, iPhone WebKit and a 667×375 small phone. It verifies real purchase/launch, decoded original art and base, actual monitor canvas dimensions, stationary readouts/base under steering, touch-neutral input, boost/throttle hit areas, controller steering, live ship-panel navigation, cached alpha occlusion, no legacy approved-hull plate requests, the contained hand layer and switching to a legacy hull and back. All profiles completed without page errors. Desktop, Android, iPhone and small-phone flight/steering screenshots were inspected: the full fuel value stays readable and the sleeve cut edges remain off-screen. The small-phone check also passed again after the model warm-up fix.

The standalone shared review passed again on desktop/small phone after changing Balor to approved, retaining the original PNG's alpha-hole coverage and centered readouts. The frame SHA-256 is unchanged, and the hand/base are byte-identical to Git HEAD.

The complete normal-entry/offline suite passed on desktop, Android and iPhone after the warm-up fix. The targeted iPhone regression also passed with explicit cache checks for all three livery dependencies. These use normal `game.html`, service workers enabled, decoded opening-room/portrait/original cockpit images, the current cache, saved-career offline resume, cached/uncached report navigation and reconnecting. All three profiles completed without page errors.

Captures/reports stay under `output/cockpit-artwork/scrapper/checks/` and `output/offline-startup/scrapper/`. The targeted iPhone cache regression is retained as `iphone-livery-cache-report.json`; the original missing-livery diagnostic is under `resolved/`. No errors are suppressed, and no artwork changes, commit, push or deployment occurred during integration.
