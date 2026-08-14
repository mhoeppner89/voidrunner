Original prompt: Freeze the approved Voidrunner art style and proceed with the implementation, including point-and-click landing scenes that work well on smartphones.

## Current pass

- Locked the first implementation to a bright VGA frontier-adventure palette: cobalt/navy, cyan, gold, orange, and cream.
- Reworked docked locations so the default view is an illustrated landing scene with clickable hotspots and a compact action rail.
- Kept the existing market, mission, service, equipment, shipyard, guild, and bar views as contextual terminals.
- Preserved the existing `void-privateer-save-v1` local save key while changing visible branding to Voidrunner.
- Repaired pre-existing strict TypeScript errors so `npm run check` and `npm run build` pass.
- Integrated the four approved landing-zone plates under `public/art/locations/v3/` and routed the dock UI exclusively to them.
- Normalized approved courier, pirate fighter, and cargo hauler anchors into four-frame transparent idle-thrust strips under `public/art/sprites/`.
- Replaced the live flight traffic renderer's legacy ship geometry with the approved animated sprite families, while brightening the space palette and bumping the service-worker cache version.

## Next checks

- Browser inspection passed for title, desktop concourse, hotspot-to-bar transition, Mara dialogue, and landscape-mobile concourse.
- Tightened the short mobile dock layout so the landing scene and footer stay inside the viewport.
- Added a top reset for dock terminal scroll state and moved the mobile terminal action rail to a horizontal bottom strip.
- The repository QA script is currently blocked by missing local `xvfb-run` and Python Playwright; the in-app browser pass was used instead.
- `npm run build:static` passed and produced a complete `dist/` artifact.
- `node --test tests/logic.test.mjs` passes when run after the static build completes; the earlier parallel invocation raced the builder and was not a code failure.
- The remaining runtime-career checks still need Python Playwright/Xvfb in the environment.
- In-app browser verification passed for the Helix approved plate, launch transition, all twelve ship-frame requests, and zero browser console warnings/errors.

## Station screen pass

- Integrated the selected bar plates as location-specific runtime backgrounds: Helix 4, Rook 3, Vesper 2, and Azure 1.
- Reworked every dockable location into three primary screens: Concourse, Bar, and Market.
- Concourse now shows the docked player ship as a launch target plus Services, Market, Bar, and Dock pointers; Services opens the repair/refuel context without leaving the Concourse.
- Bar now has clickable people with cycling dialogue, plus mission-board and guild shortcuts.
- Market now has exactly three points: Commodity Market, Ship Parts, and New Ship. Each dock location exposes one configured hull for sale.
- Updated the browser QA selectors for the new navigation structure and kept the one-hull-per-location rule enforced in the game session.
- Final verification: `npm run check`, `npm run build`, `npm run build:static`, and `node --test tests/logic.test.mjs` all pass. Direct headless-browser smoke checks report zero console errors for Concourse, Services, Bar dialogue, mission/guild routing, Market points, and the single ship card.

## Directional fleet integration pass

- Imported the approved Luna MAX production frames for courier, pirate fighter, and cargo hauler: 26 named views per ship, 78 transparent PNGs total, under `public/art/sprites/directional/`.
- Replaced the old four-frame time-cycling flight sprites with a camera-relative 26-direction selector. It transforms the camera position into each ship's local space, chooses the closest pure/two-axis/three-axis view, and applies a small hysteresis band at view boundaries.
- Kept static engine glow in each approved frame; no plume animation was added. The older four-frame assets remain available for menu art and are not used by the live flight renderer.
- Updated the service-worker cache to version `voidrunner-v4-directional-fleet` and pre-cache all 78 directional views.

## Next checks

- Run `npm run build` and `npm run build:static` after the directional renderer change.
- Playtest live flight in the browser, confirming directional texture requests, visible ship silhouettes, no console errors, and no regressions in the dock screens.

## Directional fleet verification

- `npm run check` passes.
- `npm run build` passes; Vite emits the existing runtime-only asset-path notices for legacy CSS references, with no new directional asset warning.
- `npm run build:static` passes and copies all 78 directional PNGs into `dist/art/sprites/directional/`.
- `node --test tests/logic.test.mjs` passes all 10 logic tests.
- In-app browser pass reached the live flight HUD and movement state with zero console errors or warnings. The browser requested all 52 currently instantiated courier/hauler views successfully; the complete 78-file set is present in both `public/` and `dist/`.
- The automated action-loop client completed a disposable new-career title-to-dock run and produced clean screenshots. Its isolated profile had no existing save, so the initial Resume attempt was intentionally skipped; the user’s existing browser save was not overwritten.
- The in-app browser is left on the updated flight scene at `http://127.0.0.1:4174/`.

## Station plate integration and review capture

- Added the selected market plates: Helix BL, Rook BR, Vesper TL, and Azure TR under `public/art/locations/v3/market-*.png`.
- Routed each station's Market screen to its location-specific plate and kept the three market points visible: Commodity Market, Ship Parts, and New Ship.
- Changed Concourse destinations and the docked ship from button-like controls to floating point-and-click hotspots. Bar people are now clickable character areas without button/card chrome; keyboard Enter/Space activation remains available.
- Added responsive flow rules so Concourse and Bar content no longer sits underneath the footer on short landscape touch screens. Desktop Concourse panels also clear the footer.
- Captured the full review set in `review/screenshots/station-pass/`: 12 desktop screenshots (three screens across four locations), three Helix touch/landscape screenshots, and `qa-report.json`.
- Browser capture checks passed for all four location-specific Concourse/Bar/Market backdrops, three Bar people, three Market points, nine equipment cards, one ship card per location, three Services cards, and Concourse restoration. No page errors or console errors were reported; only headless WebGL performance warnings appeared.
- Final verification: `npm run check`, `npm run build`, `npm run build:static`, and `node --test tests/logic.test.mjs` pass. The bundled browser action-loop smoke test also exits cleanly.

## Local review handoff

- GitHub publishing was intentionally skipped because cockpit files are being edited in parallel.
- Local Vite review server is running at `http://127.0.0.1:5174/` from the current working tree.
- The exact local URL passed the bundled browser smoke test with exit code 0; the latest boot screenshot is under `review/screenshots/local-test/client/`.
- No cockpit file was staged, committed, or modified by this handoff.

## Artwork-first station interaction pass

- Removed the redundant Concourse cards: Arrival / Station, Docked Player Ship, Station / Local Feed, and Services / Near Ship.
- Removed the duplicate Dock pointer; the docked ship is now the only launch hotspot.
- Removed the always-visible Concourse / Bar / Market tab strip so station navigation is now driven by in-scene pointers.
- Bar now opens on the approved bar plate with pointers for the three people, Mission Board, and Guilds. Clicking a person opens a dialogue screen; clicking that person again cycles the conversation.
- Market now opens on the approved market plate with pointers for Commodity Market, Ship Parts, and New Ship. Each full menu opens only after its pointer is clicked and has a Market Floor return pointer.
- Updated `tests/browser_qa.py` and `tests/runtime_careers.py` for the pointer-based station flow.
- Verification: `npm run check` and `npm run build` pass. The bundled Playwright client passes cleanly, and the in-app browser smoke pass covered four concourse pointers, three bar people, repeated dialogue, three market pointers, commodity menu rendering, and zero browser errors.
- A standalone multi-page Chromium capture harness still crashes at browser launch in this environment; this did not affect the bundled client or in-app browser verification.

## Readable pointer and clean dock chrome pass

- Reworked station pointer labels with dark backing, stronger value separation, and explicit left padding so icons no longer sit on top of the text.
- Removed the bottom dock footer and its `LAUNCH` button; launching now happens by clicking the docked ship pointer.
- Disabled the old transparent lower dock overlay so the location artwork reaches the bottom edge cleanly.
- Updated browser QA and career smoke-test helpers for ship-only launch.
- Verification: `npm run check`, `npm run build`, `npm run build:static`, `node --test tests/logic.test.mjs`, Python syntax validation, and `git diff --check` pass. The bundled browser client and in-app browser pass reached the flight HUD with footer count 0 and zero browser errors.

## GitHub Pages station-art cache refresh

- Confirmed a fresh public Pages session at `https://mhoeppner89.github.io/voidrunner/` renders the revised Helix concourse, while the existing service-worker cache was still named `voidrunner-v4-directional-fleet` from the earlier flight-art pass.
- Bumped the service-worker cache to `voidrunner-v5-station-art` and added all bar and market plates to its pre-cache so returning visitors receive the current location screens.
- Verification: `npm run check`, `npm run build:static`, `node --test tests/logic.test.mjs`, and `git diff --check` pass. Redeploy `main` and recheck the public station flow after the Pages workflow completes.

## Flight ship-sprite removal

- Removed the directional transparent ship-sprite layer from `SpaceRenderer`; flight entities now keep their procedural 3D meshes instead of hiding them behind 2D sprite overlays.
- Removed directional sprite loading, camera-relative sprite selection, and directional fleet pre-caching from the runtime. The remastered cockpit frame remains the active flight overlay.
- Verification: `npm run check`, `npm run build`, `npm run build:static`, `node --test tests/logic.test.mjs`, and `git diff --check` pass. The bundled browser client still reaches the station screen cleanly; a standalone Chromium flight harness remains unavailable in this environment because the browser process crashes at launch.

### Next review

- Review the local station flow at `http://127.0.0.1:5174/` and confirm whether the pointer positions match the intended interaction points on each location plate.
