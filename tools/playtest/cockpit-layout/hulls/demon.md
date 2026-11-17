# Morrigan / Demon — artwork review

Initial layout stage: unpainted and inactive; subsequently approved by the user on 17 November 2026. Review: [Morrigan](http://127.0.0.1:4212/output/cockpit-layout/index.html?hull=demon). The draft uses the shared `PaintedCockpit`, production instruments, inputs and CSS.


## Current artwork stage — 17 November 2026

The user requested artwork from this approved layout, retaining the existing hand, fixed base and controls, with high detail, correct perspective and a distinct identity. **`status:'art-review'`**, with `assets/cockpits/demon-paint-v1.png` in the shared composition review. Live selection and warming remain disabled until composition approval.

Generated once with built-in imagegen from `demon-layout-guide-v1.png` and a hull-only render. The original 1850×850 RGBA PNG is copied unchanged, with no pixel edits, aperture stencil or repeated bezel generation. See [the exact prompt and provenance](../../../../assets/cockpits/DEMON-PROMPT.md).

Deep oxblood inset panels, black stepped bezels and ribs, copper conduit/cooling fins and paired power-isolator modules give this interceptor a distinct material treatment. The slim angular canopy, shallow projected decks and darker cabinet returns follow the approved structure. The calm foreground left deck supports the original complete joystick base. The painting contains no hand/base, interactive controls, telemetry or background.

Code preserves the approved monitor backing sizes (318×184 / 270×182 / 304×184), hand/base assets, scale, source pivots, common -60 offset and control styles/hit areas. `stickClearanceX:416` retains the previous touch/stick geometry independently of the measured display centering. Small source-position changes center the backing rectangles on the generated alpha holes; content insets protect the original bezels. Hyperdrive bottom stays Y=633, with its horizontal center following the radar fit. The native PNG alpha bounds and centroids are recorded in `output/cockpit-layout/demon/art/alpha-measurements.json` and the prompt file. No other hull or shared runtime code was modified for this stage.

### Artwork verification

- Shared browser review checks passed on desktop Chrome, Android Chrome, iPhone WebKit and the 667×375 small-phone profile, one browser profile at a time. Includes decoded frame/rig, original renderer, source-glass underlap, alpha-hole coverage/centering, fixed shaft anchors, keyboard/touch/controller, neutral touch start, expanded boost input, cargo page, real phone iframe preset and unchanged storage.
- The shared harness currently recognizes PNG artwork only for Mercury/Balor/Loki and assumes other hulls are unpainted. An ignored temporary copy at `output/cockpit-layout/demon/art/review-check.mjs` adds Demon to that existing PNG branch, points to its filename and writes into `art/checks/`. The production tests remain unchanged. Commands: `VR_REVIEW_HULLS=demon VR_PROFILES=<desktop|android|iphone|small> node output/cockpit-layout/demon/art/review-check.mjs`.
- Desktop/small-phone scene and nine-pose checks use `node output/cockpit-layout/demon/art/inspect-art.mjs <desktop|small>`. All nine pose pivots remain fixed, all source cut edges stay outside the viewport, and there are no page errors. Navigation/combat/salvage and complete base placement were inspected visually.
- Three focused starter/Mercury/shared-layout unit checks passed. Direct assertions passed for Demon's art-review/live-preload gating, unchanged hand/strip/base identities, monitor sizes, stick clearance, rig offset and hyperdrive bottom. The unrelated all-tier-2-unpainted unit assertion remains stale for the other ongoing artwork chats as well; it was not edited.
- Original-source hash equality confirms byte-for-byte preservation of `demon-paint-v1.png`. Syntax and scoped whitespace checks pass.

Evidence is under ignored `output/cockpit-layout/demon/art/`, including four profile reports/captures in `checks/`, scene/pose reports, all nine pose captures per inspected profile, and transparent-opening measurements. The original layout evidence below is retained separately.

### Shared content-fit concerns before live integration

The existing radar wrapper is absolutely positioned with `inset:2% 4%` in shared CSS, so it ignores the per-hull padding used for text. A selected navigation contact bracket can partly underlap the original top bezel. Long combat/salvage text still clips on the smallest phone, as already recorded during the layout stage. The artwork and approved control/input geometry have been preserved; these shared content-fit concerns are for the coordinating chat before live integration. No art regeneration is needed.

## Pilot station and native geometry

`SHIPS.demon` identifies Morrigan as a tier-2 Twin-hull Interceptor. The pilot belongs in the narrow **central glazed pod above the armored keel**, between the two forward armored prongs. The empty slots beside that pod are not windows. The paired aft engine outlets and dorsal intakes are not cockpit glass.

The shipped `assets/models/ships/demon.glb` contains a single identity-transform mesh with separate armor and `VR_Canopy_demon` primitives. The latter contains exactly **18 triangles / nine quadrilateral panes**, arranged as three successive stations with a top and two side panes each. The source-inspection record in `authoring/models/demon/support/source-inspection.json` names the central keel, canopy structural frame and `Canopy glass 00` through `08`; it separately names the port/starboard prongs, engine nacelles and intakes. The actual GLB and the shared 3D comparison confirm that distinction.

Native **+Z is forward**, +Y is up and X is transverse. `src/game/render.js` agrees: the two exhaust anchors are near `[±.299700,-.042723,-1.000638]`, and the model receives a π yaw for the game's flight convention. No +X-forward assumption is used.

The exact material selector and tight bounds select all 18 real glass triangles. There is no packed armor or sensor surface in that primitive, so a UV filter or substituted glass triangles are unnecessary. Measured glazing bounds:

| Axis | Minimum | Maximum |
| --- | ---: | ---: |
| X | -.082369737 | .082369737 |
| Y | -.155716583 | .047059312 |
| Z | .114629768 | .545879245 |

The cyan overlay is built from these selected native triangles. Inspected close-up, whole-ship front-quarter and aft-quarter views show only the central pod highlighted; the engines, intakes, prongs and open slots stay unhighlighted.

Proposed eye **`[0,-.015,.18]`**, look **`[0,-.015,1.18]`**, vertical FOV **64°**. This is a proposed pilot position, not an authored seat. A vertical mesh section at X=0/Z=.18 puts the keel's upper surface at Y≈-.033140 and the actual glass at Y≈.040522. The eye is above the keel by .018140 and below the glass by .055522 native units. An earlier lower-eye experiment was discarded after it proved to lie below the keel's upper surface.

A +Z center ray from the final eye reaches middle-bay glazing triangle 8 at `[0,-.015,.382286903]`. The opaque glazing backing is at Z=.378920054, .003367 before it. The exterior GLB has solid backing beneath its windows and no open, authored cabin interior; the review does not claim that the shipped exterior mesh can render an unobstructed literal inside view. The ray test identifies real glazing along the proposed look direction and rules out looking into the keel or an inter-hull gap.

## Bow and console proposal

The ordered outer bow follows the **rear edge of the middle glazing station**, at native Z=.244202. Looking along +Z, positive X projects to screen-left. Its measured vertices are:

| Point | X | Y | Z |
| --- | ---: | ---: | ---: |
| Left lower | .082370 | -.011542 | .244202 |
| Left roof chamfer | .056613 | .029779 | .244202 |
| Left roof | .049998 | .032074 | .244202 |
| Right roof | -.049998 | .032074 | .244202 |
| Right roof chamfer | -.056613 | .029779 | .244202 |
| Right lower | -.082370 | -.011542 | .244202 |

These are pane-edge coordinates rounded to six decimals. The small steps between side and top panes retain the actual framing gaps. `continuousBow:false` keeps the faceted profile: a flat roof with short chamfers and raked side posts. The survey is one connected sequence from left-lower through the roof to right-lower, as expected by the shared structure renderer.

The proposed interior projection uses **kx=.9 / ky=.65** about the view center: 10% horizontal and 35% vertical compression of the perspective-projected ring. This is an explicit visibility/composition adaptation. The source frame stays 1851×850 and follows the shared responsive scaling. The exterior panes, including the two longitudinal crossbars, are preserved in the model comparison; the interior proposal uses one surveyed outer bow rather than duplicating every exterior seam across the sightline. Thin lower jambs attach its ends to the monitor bank. Those jambs and consoles are proposed interior hardware, not supplied interior geometry.

The three monitor widths/heights and outer-monitor positions remain the approved baseline. Radar moves to source Y=641 beneath the swept hyperdrive cowl (roof Y=560, hyperdrive bottom Y=633). The original live radar, hull outlines and readouts are retained. Shared perspective side-console tops, narrow bevels and dark cabinet returns attach the bank and stick; no filler panel was added.

The navy/white three-pose hand strip and separate fixed base are unchanged. `handOffsetX:-60` moves their common socket left onto the deck independently of the existing touch area. Every pose shares the same pivot; the base remains stationary. Full base bounds fit inside the projected deck, with minimum edge clearance **38.32 CSS px on desktop / 16.34 px on the small phone**. All nine pitch/yaw combinations have zero visible opaque source-boundary pixels. Screenshots also show the full base, sleeve continuing off-screen and no cut edge. Controls, their generous hit areas, half-width throttle and touch-relative neutral start retain the production layout. Hand remains visible on both profiles; right bank and throttle are phone-only. Comms stay top-center; wing card aligns with the upper-corner buttons.

## Verification and evidence

Build with `node tools/playtest/cockpit-layout.mjs` after changing the survey. All temporary scripts, measured triangle data, reports and captures are under ignored `output/cockpit-layout/demon/`.

- `VR_REVIEW_HULLS=demon VR_PROFILES=desktop node tests/browser/cockpit-layout.mjs`: **passed**, including shared renderer/glass geometry, approval gating, keyboard/touch/controller input, neutral touch start, cargo page, untouched storage, real 844×390 phone preset and 3D model comparison.
- `VR_REVIEW_HULLS=demon VR_PROFILES=small node tests/browser/cockpit-layout.mjs`: **passed on the final layout**, including the shared keyboard/touch/controller checks and phone-only controls.
- Earlier small-phone attempts stopped at the timed keyboard-steering assertion (line 79, `handX > .8` after 180 ms). A diagnostic found KeyD registered with yaw=1 while paused/blocked/hidden were all false, but simulation elapsed stayed ≈.0567 s over 930 ms of wall-clock waits. The existing `advanceTime(300)` produced handX=.99177. The final unchanged harness passed; no shared code or timing threshold was modified. Keep `keyboard-timing.json` as evidence of this transient headless scheduling behavior.
- `node output/cockpit-layout/demon/phone-input.mjs`: **passed** with real input events and deterministic advancement: keyboard, touch initially neutral then dragging, controller steering, boost input 14 px above/left of the visible cap, cargo page and unchanged save/settings.
- `node output/cockpit-layout/demon/inspect.mjs desktop` and `... small`: **passed** navigation/combat/salvage state checks, all nine held poses, identical source-pivot projections, no visible sleeve cutoffs and no page errors. Outer profile sizes are 1440×900 and 667×375; the actual fit iframes are 1440×856 and 667×343 after the shared review bar. The existing desktop check additionally exercises the real 844×390 phone iframe preset.
- Syntax checks for the factory and survey and a scoped whitespace check pass.

Evidence includes `model-measurements.json` (GLB SHA-256, all 18 native triangles, glass bounds, vertical eye section and base checks), `forward-ray.json`, `keyboard-timing.json`, `small-input-deterministic.json`, `desktop-inspection.json`, `small-inspection.json`, `checks/desktop-report.json`, `checks/small-report.json`, final per-scene captures, nine poses per profile, and the shared model comparison plus `model-closeup.png`, `model-whole.png` and `model-aft.png`. The inspection script uses Chrome with `--no-sandbox --disable-gpu-sandbox --mute-audio` from the repository root, one profile at a time. Chrome requires execution outside this session's process sandbox; the initial in-sandbox launch aborted before opening a page.

## Initial layout concerns and approval boundary (historical)

At the end of the initial layout stage, both requested browser profiles passed. Small-phone long combat status text can clip horizontally, and salvage content exceeds the existing target monitor's vertical text area: its long title is ellipsized and lower cargo/status lines can clip. This comes from the unchanged shared instrument content/CSS at the approved monitor size; it is visible in the scene evidence and was not hidden by changing controls or shared typography. Shared fixes belong to the coordinating chat.

The user subsequently approved the layout by requesting artwork. The artwork guide contained only the surveyed beams, monitor openings and shaded console surfaces, omitting live controls, hand/base, telemetry and reticle. The detailed generated PNG is now preserved and the HTML displays are fitted to its measured alpha openings in code. Composition approval is still required before live activation. The existing Mercury painting, approved assets, shared registries/renderers/CSS, other hulls and pending hyperdrive work were not edited.


## Live integration — 2026-11-17

The user approved the complete tier-II collection and requested integration. This definition is now `approved` for live flight in 0.8.2ov. The original selected PNG, reviewed display geometry, navy/white hand, fixed joystick base and control layout are preserved. Shared source, live-flight and offline checks are coordinated in the main chat. Earlier approval boundaries above describe the historical authoring stages.


## Exterior side structures — 2026-11-17

The user approved the separate source-model-based study at 13% forward and 18% outward. Its generated overlay is `assets/cockpits/demon-forward-hull-v1.png`; guide and prompt are alongside it. The user approved the painted composition and requested live integration. It is now a separate static layer behind the intact frame, warmed with the active cockpit, with cached HUD alpha and a separate canopy-damage mask. The collection’s `hull-art=1` option retains the authoring comparison; normal review and live flight share the production layer. Original cockpit/monitor/control/rig geometry remains unchanged. See the shared review README for exact parameters and verification.
