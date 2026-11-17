# Gaia / prospector — painted cockpit review

Status: **art-review; layout approved, painted composition awaiting approval**. Review: <http://127.0.0.1:4212/output/cockpit-layout/index.html?hull=prospector>. The user requested artwork from this layout on 2026-11-16. Gaia remains unavailable to live selection and session warming until composition approval. The following survey and verification record describe the approved unpainted stage; current artwork and measured fitting are recorded at the end.

The existing Gaia draft was retained and checked against the shipped model. Refinements are limited to exact material selection, full-precision measured bow vertices, an explicit angular bow, and vertical projection stretch **2 → 2.14** to clear the desktop comms caption. The proposed eye, look, FOV, horizontal stretch, instruments, controls and pilot rig remain as inherited.

## Model survey

`SHIPS.prospector` identifies Gaia as the tier-2 industrial **BP-2 Rock Hauler**, progressing to Atlas. Source: `assets/models/ships/prospector.glb`, inspected directly through its GLB JSON/accessors and visually through the shipping loader in the shared 3D comparison.

Native forward is **+X**, independently confirmed by the muzzle socket at `[1.557165, −.305821, 0]` pointing `[1,0,0]`. All six exhaust sockets lie at x=−1.378771 and point `[−1,0,0]`. The mesh node has no transform; the measurements below are native model coordinates. No pilot seat or complete interior is authored.

Mesh 0, primitive 1 uses the exact material **`VR_Canopy_prospector`**. Its 190 triangles include the windows and circular nose sensor. Requiring every triangle vertex to have **x < 1.45** retains exactly **six triangles / twelve unique positions** and excludes all **184 sensor triangles**. The existing six-triangle window surface is unchanged. The selected geometry drives both the reference edges and cyan overlay; neither armor nor the round nose lens is highlighted.

These are **three quadrilateral panes**, each triangulated twice: one roof pane and a mirrored pair of side panes. They are not six separate panes. Selected bounds are x=[1.226662755, 1.388384461], y=[−.009491314, .133583963], z=[−.224702954, .224702954]. Each row below supplies both mirrored vertices, with z=± the listed magnitude:

| Measured rim | x | y | ±z |
| --- | ---: | ---: | ---: |
| Roof, rear | 1.260469437 | .133583963 | .068319201 |
| Roof, front | 1.388384461 | .082560778 | .061400801 |
| Side, rear upper | 1.226662755 | .035478286 | .205852583 |
| Side, rear lower | 1.252264142 | −.005832024 | .224702954 |
| Side, front lower | 1.359315515 | −.009491314 | .187691763 |
| Side, front upper | 1.356157064 | .022506287 | .166936576 |

The exact six triangle vertex lists and source socket metadata are saved in ignored `output/cockpit-layout/prospector/model-survey.json`. Rendered close and whole-ship references are in `checks/model-glazing.png` and `checks/model-whole.png` below that directory.

## Proposed interior

Eye **[1.17, .02, 0]**, level look **[2.17, .02, 0]**, vertical FOV **64°**. The eye sits behind the window geometry, within the forward pressure cab. It is a proposed seat, not a recovered interior marker. Reference focus stays [1.32, .025, 0].

The ordered connected bow runs from the −Z front-lower side-pane corner, through the −Z and +Z roof-front corners, to the +Z front-lower side-pane corner. Looking +X, −Z is screen-left. Its short flat brow and raked posts suit the angular industrial cab, so `continuousBow:false` deliberately preserves straight segments.

**The exterior has roof and side glazing, not a broad glazed front windscreen.** The review's clear central forward view is an explicit interior adaptation between measured corners. The long diagonal posts bridge roof and side-pane corners across exterior armor; they are proposed supports, not literal window edges. The native panes are not altered or replaced in the cyan model comparison. This distinction matters when approving the layout.

Projection stretch is **1.5× horizontal / 2.14× vertical**, applied around the projection center on the shared 1851×850 authored plate. Literal projection would leave a shallow, restricted cab view. The starting 2× vertical stretch put the roof beam across the desktop comms caption. Raising it to 2.14 keeps the caption clear and the complete roof inside the smallest viewport. Final roof corners project to x=34.503% / 65.497%, y=.946%; the lower corners extend just beyond the sides. These are stated ergonomic adaptations, not a claim that the exterior supplies this open interior.

The approved three-monitor sizes and own/target positions remain unchanged. Radar retains the existing Gaia draft's y=641, central housing roof y=560 and hyperdrive bottom y=633, leaving an eight-source-pixel gap above radar glass. The swept forehead joins the neighboring housings. Shared projected side consoles provide a common deck plane, visible bevels, foreshortening seams and dark cabinet returns attached to the monitor fascia; these are proposed interior structures. No additional filler panels were introduced.

The inherited navy/white hand strip and separate fixed base are unchanged. Their common rig stays shifted 60 source pixels left onto the deck, independently of touch targets. All poses share one shaft socket. Desktop/controller retains the hand; right controls and narrow throttle remain mobile only. Touch starts neutral. Upper buttons, centered comms and wing card use the shared production geometry.

## Verification and evidence

Rebuilt with `node tools/playtest/cockpit-layout.mjs`. Passed the existing shared check, one browser profile at a time:

```sh
VR_REVIEW_HULLS=prospector VR_PROFILES=desktop node tests/browser/cockpit-layout.mjs
VR_REVIEW_HULLS=prospector VR_PROFILES=small node tests/browser/cockpit-layout.mjs
```

Both final runs passed without page errors. They cover the production `PaintedCockpit`, inherited decoded sprites, exact display geometry, approval gating, mobile-only controls, neutral touch, keyboard/controller steering, enlarged boost input, cargo navigation, real 844×390 phone preset, actual GLB reference and untouched career/settings storage. Chrome was muted, used `--no-sandbox --disable-gpu-sandbox`, and launched from the root checkout. Initial runs missed the shared test's fixed 180 ms keyboard settling threshold under contention; an ignored copy using the existing `advanceTime()` hook passed all the same assertions. The final unmodified harness also passed both profiles; no shared test was changed.

Final supplemental review (`output/cockpit-layout/prospector/supplement.mjs`, run separately with `VR_PROFILES=desktop` and `VR_PROFILES=small`) checks navigation/combat/salvage, actual firing, all nine yaw/pitch combinations, fixed socket, source cut edges and the base footprint. Default outer viewports are 1440×900 and 667×375; the actual inner iframes are 1440×856 and 667×343 after review chrome. A separate desktop preset capture verifies a real **1440×900 inner viewport**, and the shared check verifies the real 844×390 phone preset.

- All four corners of the complete base bounding rectangle lie within the projected left deck top. Source bounds: desktop x=115.23…183.23, y=818.23…841.24; small phone x=112.91…188.16, y=809.36…838.79.
- All nine shaft pivots agree within .1 screen pixel. Every opaque bottom/side source-edge sample stays off-screen; the top source row has zero opaque pixels for all three poses. Closest bottom-cut clearance is 23.62 desktop pixels and 12.11 small-phone pixels. The base does not move with steering.
- Radar/hyperdrive separation is 8.06 desktop pixels / 3.23 small-phone pixels. Monitor sizes, hand scale and touch areas remain inherited.
- Navigation shows Helix and its hyperdrive hint; combat shows Cutlass, shield/hull bars and successful shots; salvage shows coolant and four remaining units. No page errors occurred.

Visually inspected the final desktop/small-phone layouts, active comms, real desktop preset, actual-model close/whole views, navigation/combat/salvage and all nine poses on both viewports. Captures and JSON reports are under `output/cockpit-layout/prospector/checks/`; pose contact sheets supplement the individual screenshots. The final raised brow leaves comms text clear. Side decks have visible depth, and the complete joystick base sits on their top surface.

## Remaining concerns and approval boundary

The smallest phone's **salvage target text is crowded and partially clipped** in the shared production instrument. The fixed-size monitor scales to about 74 CSS pixels tall; heading/range/status rows and the two-line contents block compete for that height, while mobile text retains minimum sizes. The shared `#game-shell .screen-target-contents` uses `clamp(9px, 6cqh, 13px)` and centered column layout with hidden overflow; its mobile contents block lacks the desktop size container. Measured contents font is 13px/14.95px, with 39px scroll height inside a 30px client height. `checks/small-salvage.png` and `small-supplement.json` record the issue. This requires a shared instrument/CSS fitting change by the coordinating chat; no shared file or monitor dimensions were changed here. The long weapon row also truncates at the inherited small-phone width. These do not affect the measured canopy or rig checks.

The pipeline README still describes the starting 2× vertical stretch; this hull's survey and this document record the refined **2.14×** value. Updating shared documentation belongs to the coordinator.

During the unpainted stage, only Gaia's factory, survey and this README were edited; generated evidence stayed ignored. Mercury's original painting and all other approved assets were untouched. No commit, push, artwork generation or flight activation was performed in that stage. The user subsequently requested artwork from this layout. Artwork receives only beams, monitor openings and shaded console surfaces, omitting controls, hand/base and telemetry. Preserve the selected original PNG and fit live displays to its measured alpha apertures in code.

## Artwork and composition review

Generated with the **built-in imagegen tool** after the user's layout approval/artwork request. Selected frame: `assets/cockpits/prospector-paint-v2.png`, **1850×850 RGBA**, preserved byte-for-byte from the generated original, including its alpha. SHA-256: `6d35ff0fe488d9b59840780d2c7270f47922bebb1a4e847bab681b2327dbe7a2`.

Inputs were the approved shaded structural guide (`prospector-layout-guide-v1.png`), starter artwork for finish only, and a clean render of the actual Gaia GLB for identity. The guide has no hand/base, controls, reticle or telemetry. A single composition revision used the original layout with cyan aperture rectangles (`prospector-aperture-guide-v1.png`) to open the first candidate's overly inset bezels. This restored usable display area while keeping the industrial design and console perspective. The first candidate remains ignored under `output/cockpit-layout/prospector/artwork/`; the selected v2 is the original output without bitmap correction, aperture stencils or rebuilt pieces. Exact prompts, input roles and provenance are in `assets/cockpits/PROSPECTOR-PROMPT.md`.

Gaia uses squared ivory compression seals with paired brass clamping ears, brass pressure collars and tucked braided hoses at the lower canopy joints, and fold-flat catches at the angular roof corners. Its left deck has a bolted maintenance cartridge, guarded switches and an amber service strip; its right deck has a ribbed power-distribution block, fuse drawers, rotary isolator and red safety cover. Cabinet walls contain recessed louvers and clipped pressure plumbing. The warm gunmetal/brass service surfaces distinguish this working pressure cab from Mercury's rounded navy bow, Loki's light fighter hardware and Balor's dark red scrap machinery. The original slim posts, broad sightline, shallow horizontal top decks and dark vertical cabinet returns remain visible. Foreground base landing space remains clear.

Live displays are fitted to the generated alpha openings (flood fill at alpha <40), rather than altering the PNG. The resulting rectangles differ from the original guide, so code uses their measured bounds; no claim of pixel-exact generation is made. The bank is centered at source x925 on the 1850-wide frame.

| Display | x | y | width | height | Content inset x/y |
| --- | ---: | ---: | ---: | ---: | ---: |
| Own | 408 | 630 | 329 | 179 | 8 / 0 |
| Radar | 792 | 656 | 268 | 160 | 5 / 0 |
| Target | 1115 | 630 | 327 | 179 | 8 / 0 |

`hyperdriveBottom:610` seats the existing live button on the painted cowl's quiet dark face. Its size and behavior remain shared. `stickClearanceX:416` preserves the approved stick input geometry despite the display fitting. The inherited hand/base rig stays at the same −60 source offset, with identical assets, scale and socket/pitch anchors. Gameplay pads, throttle, pause/fullscreen and wing controls use the unchanged production renderer/CSS. Hash checks verified the hand, fixed base, Mercury original PNG, shared cockpit renderer and CSS were unchanged during this task.

### Artwork verification

The shared browser test still hardcodes Gaia as an unpainted SVG. An ignored local copy at `output/cockpit-layout/prospector/artwork/check.mjs` extends its painted-source/alpha-fit branch to Gaia and uses the existing deterministic `advanceTime()` hook for input settling under concurrent software rendering. All production renderer, measured aperture coverage/centering, fixed shaft, keyboard/touch/controller, enlarged hit areas, mobile visibility, model glazing and storage assertions are retained. It also asserts exactly six Gaia window triangles.

Run one browser at a time:

```sh
VR_REVIEW_HULLS=prospector VR_PROFILES=desktop node output/cockpit-layout/prospector/artwork/check.mjs
VR_REVIEW_HULLS=prospector VR_PROFILES=android node output/cockpit-layout/prospector/artwork/check.mjs
VR_REVIEW_HULLS=prospector VR_PROFILES=iphone node output/cockpit-layout/prospector/artwork/check.mjs
VR_REVIEW_HULLS=prospector VR_PROFILES=small node output/cockpit-layout/prospector/artwork/check.mjs
```

All four final-v2 browser profiles passed without page errors. Captures and reports are in `output/cockpit-layout/prospector/checks/`. Visually inspected the final desktop, Android, iPhone and small-phone compositions, both nine-pose contact sheets, active comms, navigation/combat/salvage, and the real desktop preset. Compared Gaia against the current Mercury, Balor and Loki frames: its brass compression hardware, industrial service assemblies and warmer deck surfaces give it a distinct identity while preserving the game's painted finish.

Additional final-frame captures and geometry reports use `artwork/supplement.mjs`, separately for desktop and small phone. They cover all nine pitch/yaw combinations, actual firing, navigation/combat/salvage, active comms, the actual GLB reference and a real 1440×900 desktop iframe preset. All four base corners remain on the deck; every sleeve cut edge stays off-screen and every pose shares the fixed socket. The existing mobile salvage text crowding remains in the shared readout; the final small-phone contents box has clientHeight 29 / scrollHeight 38 at 13px font with 14.95px line-height. Long weapon/status strings also truncate at the inherited phone size. No shared CSS was changed to conceal this limitation.

The source unit suite was run: **5 passed / 2 failed**. Both failures are stale unpainted-state assertions in `tests/unit/cockpitArtwork.test.mjs`: “Gaia layout stays isolated from live selection and warming until approved” (line 63) and “remaining tier-2 drafts retain the shared kit and cannot activate or preload in flight” (line 96), expecting `layout-review` rather than the required `art-review`, with later no-shell/original-rectangle assumptions also needing an artwork-aware update. The shared browser check's unpainted branch at line 60 needs the same update. Shared tests and `docs/REPOSITORY_CLEANUP.md` belong to the coordinator and were not edited. Direct assertions independently passed live-selection/preload exclusion, shared pilot-asset identity, unchanged −60 rig offset/416 stick clearance, original RGBA bytes and no aperture clip.

The definition remains `art-review`. No live activation, runtime/SW release, commit or push was performed. Only Gaia's own factory/documentation and new Gaia art/guide/prompt assets were changed during this artwork stage. Composition approval is still required before flight integration.


## Live integration — 2026-11-17

The user approved the complete tier-II collection and requested integration. This definition is now `approved` for live flight in 0.8.2ov. The original selected PNG, reviewed display geometry, navy/white hand, fixed joystick base and control layout are preserved. Shared source, live-flight and offline checks are coordinated in the main chat. Earlier approval boundaries above describe the historical authoring stages.
