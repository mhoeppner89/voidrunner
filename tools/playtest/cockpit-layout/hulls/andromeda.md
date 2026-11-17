# Thor / Andromeda — cockpit artwork review

Status: `art-review`; the user approved the layout on 2026-11-16 and requested detailed artwork. The original painted frame is now available in the isolated review; composition and live activation remain unapproved. Thor is the tier-2 Heavy Strike Fighter / heavy striker in `src/game/leagueContent.js`.

Review: [Thor cockpit](http://127.0.0.1:4212/output/cockpit-layout/index.html?hull=andromeda). Choose Desktop or Phone for the production media-query presets. The layout uses the shared `PaintedCockpit`, production readouts/radar, original hand/base and shipping controls.

## Native GLB survey

Source: `assets/models/ships/andromeda.glb`, the identity-transformed node `andromeda · fitted hull`, mesh `Andromeda stepped measured pressure hull.001`. The nose and cockpit face **+Z**, with +Y up and X transverse. The four engine openings sit aft at z≈−1.000006; the front glass is z=.729605… .860215. The engine-port configuration independently places their outward mouths at z≈−1.012006. This is not a +X hull.

Primitive 1 is the exact material **`VR_Canopy_Glass`**, POSITION accessor 5 (15 vertices), index accessor 9 (30 indices / **10 triangles**). Primitive 0 is packed hull armor and primitive 2 is engine armor; neither is selected. This glass primitive consists of a six-triangle raked front screen plus two two-triangle side windows. There is no sensor lens in this primitive. The survey explicitly selects the material and bounds x[−.167,.169], y[−.216,−.145], z[.729,.861]. The cyan comparison therefore contains all ten real glass triangles and no armor, sensors or engine openings. No explicit replacement triangles or atlas guess is used.

Measured native-space positions, rounded to 8 decimals:

| Vertex | X | Y | Z |
| --- | ---: | ---: | ---: |
| 0 | −.11773900 | −.14565946 | .77283847 |
| 1 | −.12770793 | −.21438290 | .86021543 |
| 2 | .00068411 | −.17881711 | .81499606 |
| 3 | .00068411 | −.21438290 | .86021543 |
| 4 | .00068411 | −.14565946 | .77283847 |
| 5 | .11910722 | −.14565946 | .77283847 |
| 6 | .12907615 | −.21438290 | .86021543 |
| 7 | .12911096 | −.16039000 | .77712488 |
| 8 | .13351655 | −.15071000 | .72960484 |
| 9 | .16770802 | −.21495000 | .72960484 |
| 10 | .14419805 | −.21495000 | .84649402 |
| 11 | −.12774274 | −.16039000 | .77712488 |
| 12 | −.13214833 | −.15071000 | .72960484 |
| 13 | −.16633980 | −.21495000 | .72960484 |
| 14 | −.14282982 | −.21495000 | .84649402 |

Triangles: `[1,2,0] [0,2,4] [1,3,2] [6,5,2] [5,4,2] [6,2,3] [7,9,8] [7,10,9] [11,13,14] [11,12,13]`. The fan through vertex 2 is tessellation, not evidence of a center mullion.

## Proposed interior

Eye `[.00068411,−.199,.65]`, look `[.00068411,−.199,1.65]`, vertical FOV **64°**. The eye sits on the measured centerline, aft of the rear side windows by .079605 native units, between the front screen's upper and lower heights. It is a proposed pilot position; the GLB supplies no seat or interior.

The single connected outer bow follows vertices **6 → 5 → 0 → 1**: screen-left lower, left roof, right roof, screen-right lower. Native +X appears on screen-left when looking +Z. `continuousBow:false` preserves Thor's straight, broad brow and raked posts. The small lateral panes remain visible in the model comparison; their rear edges are not invented as central forward-view pillars.

Interior projection uses **1.25× horizontal and 1.10× vertical stretch**, around the projection center at the shared 1851×850 authored aspect. The final bow corners on that authored frame are approximately `[406.24,479.75] → [105.88,100.13] → [1745.12,100.13] → [1444.76,479.75]`. This mild expansion is an explicit visibility adaptation, not a literal surveyed interior. The cyan model overlay remains on the original unscaled glass. Thin lower jambs connect the bow to the monitor fascia. The shared console decks and cabinet returns are proposed interior supports, not GLB components.

The own/target monitors retain the approved sizes and positions; the three-monitor bank stays centered. Radar keeps its approved size and moves to source y641 beneath the swept hyperdrive forehead (roof y560, button bottom y633). The low console tops have projected seams, bevels and inner cabinet walls, with no floating monitor slabs or extra filler panels across the view.

The original navy/white hand strip and fixed joystick-base PNG are unchanged. The common rig is shifted **−60 source pixels horizontally**, independently of the touch area. All pitch poses share the same socket; yaw rotates around it while the base remains fixed. Controls and hit areas retain the shared layout. Hand remains visible on desktop and phone; right controls and narrow throttle remain phone-only. Initial touch remains neutral. Comms stay top-center; the wing card uses the pause/fullscreen row.

## Approved unpainted-layout verification and evidence

Built with `node tools/playtest/cockpit-layout.mjs`. The required selector is `VR_REVIEW_HULLS` (the assignment's `VR_REVIEW_andromedaS` is a typo). Ran one profile at a time:

```sh
VR_REVIEW_HULLS=andromeda VR_PROFILES=desktop node tests/browser/cockpit-layout.mjs
VR_REVIEW_HULLS=andromeda VR_PROFILES=small node tests/browser/cockpit-layout.mjs
```

Both **passed**: shared production renderer, exactly ten selected glass triangles, inactive layout status, monitor fit/underlap, fixed pivots, keyboard/touch/controller steering, neutral touch start, expanded afterburner area, device-specific controls, real phone preset, unchanged save/settings sentinels and no page errors. Chrome ran from the repository root, muted, with `--no-sandbox --disable-gpu-sandbox`. Its first sandboxed launch aborted before loading; the authorized outside-sandbox launch completed normally.

Supplemental diagnostics under ignored `output/cockpit-layout/andromeda/inspect.mjs` passed in true **1440×900 desktop and 667×375 small-phone iframes**. Each inspected navigation, combat and salvage and captured every combination of pitch/yaw −1, 0, +1. Boundary-alpha samples from all three original hand frames were transformed through the actual SVG matrices: **zero occupied source-cutoff pixels were inside the screen in all 18 cases**. The pivot varied by less than .00001px. All four corners of the complete base bounds lay inside the projected left deck in every case. Base footprint was approximately x89.64/y868.01/w52.90/h23.17 desktop and x40.69/y358.60/w27.11/h11.88 phone. The entire base remains above the bottom edge and clear of the inner bevel.

Screenshots were visually inspected, including both nine-pose sheets, scene views and the rendered 3D close-up/whole-ship comparison:

- `output/cockpit-layout/andromeda/desktop-navigation.png`, `desktop-combat.png`, `desktop-salvage.png`
- `output/cockpit-layout/andromeda/small-scenes.jpg`
- `output/cockpit-layout/andromeda/desktop-nine-poses.jpg`, `small-nine-poses.jpg`
- `output/cockpit-layout/andromeda/model-close.png`, `model-whole.png`
- `output/cockpit-layout/andromeda/desktop-inspection.json`, `small-inspection.json`
- `output/cockpit-layout/andromeda/checks/` contains the existing harness reports/captures.

No shared-code blocker remains. The short lower jambs, mild projection stretch and console supports are deliberate interior proposals requiring layout approval. This review does not claim live-flight or offline-release verification. During the layout phase, only the three assigned hull files were authored; shared assets, registry, CSS, tests, service worker and other hulls were preserved.

## Approval boundary

The layout is approved and artwork has been generated as requested. The current complete composition is ready for **artwork approval**; Thor remains inactive in live flight. The original detailed PNG is preserved and live glass/insets have been fitted to its measured alpha openings in code.


## Painted composition — 2026-11-16

Built-in imagegen generated **one** complete detailed transparent frame from the approved structural guide and the actual exterior-model reference. No hand, fixed base, gameplay controls or live content was supplied in the structural guide or baked into the painting. The original 1850×850 RGBA output is copied byte-for-byte to `assets/cockpits/andromeda-paint-v1.png`. The structural guide is retained as `assets/cockpits/andromeda-layout-guide-v1.png`; the exact prompt, input roles, generated source path, SHA-256 and alpha measurements are in `assets/cockpits/ANDROMEDA-PROMPT.md`.

Thor has cool gunmetal rails, olive shock-isolated instrument housings, titanium seals and restrained ochre safety tabs. Paired recessed strike-control cassettes occupy the rear left deck; three protected torpedo selectors and connectors occupy the rear right. Captured braided looms, vertical cabinet ventilation, low shoulder heat exchangers and military locking dogs provide purposeful detail. The decks retain their projected level top faces, dark cabinet returns, contact shadows and clean fixed-base landing patch. The long straight brow and raked posts remain slim and protect the combat view. This differs from the starter/Mercury navy-ivory finish, Balor's repaired red raider hardware and Loki's compact interceptor fittings.

The three approved monitor widths/heights remain unchanged. Code-only positioning centers their backing rectangles on the original alpha holes: own x419/y627.5, radar x793.5/y648.5 and target x1123.5/y627.5. Content insets protect the detailed seals. Radar's centered hyperdrive attachment follows its small horizontal fit correction; its size, vertical position and interaction stay unchanged. No stencil, pixel repaint, bezel regeneration, frame disassembly, image rescaling or shared-renderer change was used.

`stickClearanceX:416` retains the approved touch-stick dimensions/placement independently of readout fitting. Source hand strip, base, common pivot, pose scale, yaw range and −60 rig offset are unchanged. Source-object identity, approved monitor sizes, original-PNG byte equality, `getCockpitDefinition('andromeda') === undefined` and empty live preload assets were explicitly verified.

### Painted review checks

The shared browser test currently hard-codes PNG support to the existing approved hulls and otherwise demands an SVG/layout-review draft at `tests/browser/cockpit-layout.mjs:69`. To preserve shared ownership, the source test is untouched. A diagnostic copy at `output/cockpit-layout/andromeda/check-art.mjs` changes only its helper import/output path and the Thor artwork-stage allowance, adding Thor's exact original PNG, ten glass triangles, three bow segments and `art-review` assertions. Its existing full alpha flood-fill, glass centering, renderer, anchors, keyboard/touch/controller, neutral touch, expanded boost hit area, media queries, storage sentinels and console-error assertions are retained.

```sh
VR_REVIEW_HULLS=andromeda VR_PROFILES=desktop node output/cockpit-layout/andromeda/check-art.mjs
VR_REVIEW_HULLS=andromeda VR_PROFILES=android,iphone,small node output/cockpit-layout/andromeda/check-art.mjs
```

**All four profiles passed**, one browser profile at a time, muted, with Chromium sandbox flags and repository-root cwd. Output is under `output/cockpit-layout/andromeda/checks-art/`. Original alpha holes fit inside the unchanged-size live glass backing rectangles and their centroids differ from display centers by less than two source pixels. The frame has no clip path.

`inspect-art.mjs desktop` and `inspect-art.mjs small` both passed, using real 1440×900 and 667×375 iframes. Navigation/combat/salvage, all nine pitch/yaw combinations, a fixed common socket, zero visible alpha-cutoff edge samples and all four complete-base bounding corners on the projected deck were verified again with the painting present. The hand and base footprint match the approved layout. Screenshots of all four device profiles, both nine-pose sheets and both three-scene sheets were visually inspected. Evidence is in `output/cockpit-layout/andromeda/art/`.

### Shared test issue for the coordinating chat

`node --test tests/unit/cockpitArtwork.test.mjs` reports **6 pass, 1 fail**. The failing test is “remaining tier-2 drafts retain the shared kit and cannot activate or preload in flight”, line 96: it still requires every tier-2 draft to have `status:'layout-review'` and `shell:undefined`. Thor now intentionally has `status:'art-review'` and an original PNG because the user approved its layout and requested artwork. The existing live-selection/preload guards still pass when directly asserted, and the original hand/base objects and approved monitor sizes are unchanged. The coordinator should allow the artwork-review phase in that shared assertion, retaining all live-activation and shared-kit checks. The shared browser source likewise needs Thor's artwork-stage allowance from the diagnostic copy. Neither shared test was edited, removed or hidden; no other hull's state was changed.

No runtime release, SW edit, commit, push or live activation was performed. The only new permanent files are Thor's painted PNG, structural-guide PNG and prompt/provenance document; the Thor factory and this README describe the authoring state. Composition awaits user approval.


## Live integration — 2026-11-17

The user approved the complete tier-II collection and requested integration. This definition is now `approved` for live flight in 0.8.2ov. The original selected PNG, reviewed display geometry, navy/white hand, fixed joystick base and control layout are preserved. Shared source, live-flight and offline checks are coordinated in the main chat. Earlier approval boundaries above describe the historical authoring stages.
