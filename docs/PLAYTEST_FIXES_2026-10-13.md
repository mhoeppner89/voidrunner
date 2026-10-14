# Voidrunner playtest fixes — 2026-10-13

Build: 0.8.2fp. All browser testing uses isolated saves and muted audio.

## Resolved issues

| Issue | Fix and verification |
|---|---|
| Mining claim disputes throw before spawning a rival | Resolve the asteroid before accessing it; claim/mining regressions exercise the guard. |
| Career upgrade advice misses generic mounts and owned inventory copies | Use current mount compatibility, resolve individual inventory IDs, and restrict unowned recommendations to the base catalog. Other actors' registered loot cannot become a purchase recommendation. |
| Installed tutorial radar is missed after inventory migration | Detect the base equipment type behind the individual ID. Regression confirms tutorial progress without a duplicate gift. |
| Tutorial banner clips phone shipyard actions | Use the remaining dock height rather than the viewport height. Purchase/swap and equipment actions checked at 568×320, 844×390 and 1440×900 with the notice active and inactive. |
| Small landscape headers waste two rows | Keep market tabs in one toolbar; keep the tutorial objective and skip action together. |
| Showroom ship is cropped or fails to reframe after resizing | Frame its bounding sphere across all turntable angles; reframe on resize without changing model position. |
| Equipped fleet review fails for Vanguard | Initialize renderer model/resource maps in the lightweight review adapter. |
| Lancer, Vanguard, Wayfarer and Atlas turret bases lack continuous hull support | Add tapered seating connectors and reduce the base footprint while preserving pivots, barrels and firing axes; physical seating and clearance regressions pass. |
| Engine glows sit inside or behind the nozzle/hull | Align all 11 reviewed hulls to their physical engines; use a full outward hull ray for the Prospector, whose deeper shell still hid its lights after a short-ray check. Keep depth testing and existing intensity. Geometry checks and an actual flight capture verify the result. |
| Obsolete tests imply old fittings/ship stats are broken | Refresh fixtures to the shipping models, current cached weapon definitions, mount normals, inventory IDs and approved balance. Preserve behavioral checks. |

The Mule's approved side-facing embedded PDCs replace the former foredeck mounts. Its hull has 4,948 triangles; the fitted PDCs/supports add 1,232. The old 4,948-total assertion does not describe the current asset. No hull simplification was needed.

## Verified gameplay and UI

The full suite passed **981 tests** (945 main tests + 36 source-module tests). After the final Prospector glow adjustment and stronger full-depth ray assertion, all **39 focused fleet, mounting and preview tests** passed again. `git diff --check` passes.

- Chrome and WebKit: 12 market-layout checks, including tutorial notices and small landscape phones; zero page errors. Screenshot review includes purchase controls and three-column equipment detail.
- Fleet: 19 hulls and two drone models captured from seven angles (147 screenshots). All models loaded with no console or network errors. Follow-up captures verified support placement and engine lighting. Atlas lights its six active engines; its three central pressure couplings remain unlit.
- Showroom framing: perspective and resize regressions pass.
- Spectator: editor presets, ship placement, battle start, pause, 2× speed, restart and formation clearing pass in Chrome.
- Travel: fresh-career launch, plotting Shardbelt, hyperdrive engagement and arrival pass. The test sets a clear starting position/heading after verifying that the initial direct vector is blocked by Helix itself.
- Racing: actual entry UI accepts a course; staged countdown reaches running state with three racers, nine visible gates and finite transforms after a 15-second simulation. The player accelerates to 37.5 simulation units/s and passes the first course gate. Course completion was not driven in the browser.
- Career: claim guard, utility compatibility, owned-item recommendations and tutorial gift installation/persistence regressions pass.
- Core source modules: all 36 tests pass, including economy, save migration, outfitting and racing logic.
- Combat: 155 tests pass for weapon firing, turret audio, interception, firing arcs, energy/disruption, shield damage, flight planning and recovery.
- Arena Run: browser checks traverse all 25 waves, require three choices at every decision, preserve reinforcement timing, and reach the victory screen. A 15-second real fixed-step combat smoke test reaches 17 simultaneous projectiles and keeps all ship transforms finite.

The 25-wave browser pass uses controlled enemy defeats after the combat smoke test. It verifies progression and UI, not a fresh balance measurement or a natural full-run victory. Browser emulation does not verify physical-phone sensors or thermal behavior.

## Evidence

Browser harnesses: `.freebuff/fix-phone-qa.mjs`, `.freebuff/fix-run-qa.mjs`, `.freebuff/fix-race-qa.mjs`, `.freebuff/fix-flight-engines.mjs`. Fleet captures: `.freebuff/fleet-polish-qa/`. Observer/travel captures: `.freebuff/phone-lab/playtest/current-observer-travel/`. Captures/results are in `/private/tmp/voidrunner-*`; test logs are `/private/tmp/voidrunner-playtest-npm-test-final-20261013.log` (full suite) and `/private/tmp/voidrunner-fleet-final-20261013.log` (final focused checks). Prospector flight evidence: `/private/tmp/voidrunner-engines-flight-burning.png`. Updated full-surface measurement: `docs/fleet-rebuild/quality-revision/engine-flare-surfaces.json`.
