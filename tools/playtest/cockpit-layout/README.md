# Shared cockpit layout review

Build with `npm run review:cockpit`; serve the repository and open:

- **All seven tier-II cockpits:** `/output/cockpit-layout/tier-2.html` — one active production cockpit, ship tabs, desktop/phone presets, navigation/combat/salvage, model reference and focus mode. All seven compositions are approved and integrated in live flight. Career saves and settings are untouched.

- Balor approved live artwork: `/output/cockpit-layout/index.html?hull=scrapper`
- Loki approved live artwork: `/output/cockpit-layout/index.html?hull=speedster`
- Gaia approved artwork: `/output/cockpit-layout/index.html?hull=prospector`
- Mercury artwork: `/output/cockpit-layout/index.html?hull=talon`
- Approved starter reference: `/output/cockpit-layout/index.html?hull=wayfarer`

This is a silent isolated review with simulated flight/readouts. It never loads a career or writes saves/settings. **All tier-I and tier-II layouts and artwork are approved and active in live flight.**

## Shared implementation

`src/game/cockpitDefinitions.js` owns the approved source dimensions, measured monitor apertures, hand poses/base anchors and approval registry. `cockpitLayout()` computes the monitor, hyperdrive and stick geometry. Both live flight and this review instantiate `PaintedCockpit` from `src/game/cockpitArtwork.js`, with the shipping `GameUI` DOM, readout renderers, fonts and CSS. The review no longer has separate monitor/hand placement or button styling.

The approved starter PNG stays intact. Live glass underlaps its apertures; only the small hand layer animates. Cached alpha resources survive hull switches. Unapproved definitions are available only through explicit review mode; live selection/preloading accepts approved hulls only. `wayfarer-v4.json` is a generated export for external art tools, refreshed by the review builder.

The outer page supplies review controls. An inner viewport runs the actual cockpit. The desktop and phone presets therefore use their own real media-query dimensions (1440×900 / 844×390), even when scaled down for the surrounding browser. On real phones choose “This screen.” The hand stays visible on every device; buttons/throttle are mobile only. Touch starts neutral at the first contact, then steers relative to that contact.

## Mercury canopy proposal

`canopy.js` loads the actual `talon.glb` glazing primitives, selecting the `VR_Canopy` material rather than a packed mesh or its painted trim. The model reference highlights only the original glass. The proposed pilot eye is `[0.15, -0.03, 0]`, looking along native +X at 64° vertical FOV. It is a proposed seat, not an authored interior marker.

The visible bow follows the x=0.27 pane ring. Its interior projection is widened 2.6× horizontally to protect sightlines; the shared 1851×850 authored frame stretches with the approved starter layout. The upper bow is one smooth curve through the surveyed ring. Thin lower jambs connect it to the monitor bank; low sloped side panels support the stick and outer housings. These are proposed console structures. These adaptations are explicit rather than presented as a literal interior supplied by the exterior model. The 3D comparison renders only while its dialog is open.

The bow, sightlines and sloped console connections were approved before painting. The current review uses `talon-paint-v4.png`, generated from a shaded perspective blockout with deck tops and inner cabinet walls and the reused navy/white hand and fixed base. The original detailed frame is used unchanged. Live glass rectangles are measured from its transparent openings, with internal content insets for the beveled corners. The radar and hyperdrive remain on the lower central housing. The hand/base is shifted 60 source pixels left onto its console, retaining the same touch area. Add `&mockup=1` to inspect the shaded geometry instead of the artwork.

## Gaia unpainted layout

Gaia (`prospector`) is deliberately `layout-review`, with no generated frame and no live activation. The reference loads `prospector.glb` and surveys its six actual window triangles. Its shared canopy material also covers the round nose sensor; geometry beyond x1.45 is excluded, including from the cyan reference overlay.

The proposed eye is `[1.17, 0.02, 0]`, looking along +X at 64° vertical FOV. Front-pane corners come from the GLB: the upper pair at `[1.38838, .08256, ±.0614]`, lower pair at `[1.35932, -.00949, ±.18769]`. Its short flat roof and raked posts distinguish the industrial cab from Mercury's curved bow. The proposed interior projection uses 1.5× horizontal and 2× vertical stretch to protect the central view; these are explicit adaptations, not an authored interior.

Monitor sizes, control hit areas, navy/white hand and fixed base reuse the shared approved layout. The radar sits under the swept hyperdrive forehead. Low perspective-correct side decks attach the stick and monitor bank to the frame. Approve the layout before any image generation. Once artwork is approved, fit code to its measured display openings instead of repeated bezel regeneration.

## Repeatable hull pipeline — revised from the starter and Mercury reviews

1. **Use the game’s tier data.** Read `SHIPS` in `src/game/data.js`, including `LEAGUE_HULLS`. Tier 1 is Hestia (`wayfarer`, finished), Balor (`scrapper`) and Loki (`speedster`). Mercury and Gaia are tier 2. Give each remaining hull its own model survey and layout review.
2. **Inspect the actual hull before drawing.** Identify real cockpit glazing, native orientation and an explicit proposed pilot eye/look/FOV. Exclude sensor lenses that share the glass material. Preserve the ship’s canopy character; document interior stretching as an adaptation, not an authored interior.
3. **Keep the approved composition.** Start with the shared three-monitor sizes and arrangement, lower central radar/hyperdrive forehead where appropriate, original radar/readout renderers, centered monitor bank and generous forward visibility. Use thin framing. Low, perspective-correct side decks must visibly attach the monitors and stick to the cockpit, with clear top faces, bevels and vertical returns. Avoid large filler panels or thick beams across the view. Use a continuous curve when the hull’s canopy calls for one; retain angular framing when its real structure calls for it.
4. **Reuse the approved pilot rig and controls.** Use the navy/white glove and separate fixed base unchanged. Align every hand pose to the same socket. Yaw pivots around it; pitch uses the existing drawn views. The complete base must sit on the console top, clear of the sloping edge, and the sleeve’s cut edges must stay off-screen at every extreme. Adjust rig position in code per hull, independently of the touch area. Keep the original visible control layout, narrow half-width throttle and smaller painted caps with larger invisible hit areas. Initial touch is neutral. Hand remains visible on desktop/controller; right touch bank and throttle are mobile only. Comms are top-center; wing card aligns with pause/fullscreen at the upper corners.
5. **Produce a concrete unpainted review first.** Use the shared production renderer, fonts, controls and true desktop/phone iframe viewports. Check navigation, combat, salvage, all steering extremes, monitor centering/readability and hit areas. Obtain the user’s approval of that hull’s layout before generating artwork. A request to start the next hull does not approve an unseen layout.
6. **Give imagegen only the structural guide.** Export canopy beams, monitor openings and shaded console surfaces; omit buttons, slider, hand/base, live telemetry and reticle. Supply the hull/style references separately. Generate a complete transparent frame, with enough hardware/depth from the start: switches, vents, recessed panels, cables and mounts, latches and small lamps. Keep live instruments and the reusable hand/base separate. The upper hyperdrive housing should blend into the ship’s geometry with swept/sloped shoulders where appropriate.
7. **Fit code to the approved art, not the other way around.** Once a frame’s composition/detail is approved, preserve its original pixels. Measure the actual alpha openings and gently tune that hull’s HTML monitor rectangles, backing underlap and content insets in code. Verify centering and flush fit against the image. Preserve canvas aspect ratios and match backing sizes to displayed content. Do not repeatedly regenerate or repaint bezels to chase a small alignment error; do not cut rims with a corrective stencil. New imagegen is for an actual art/design problem, never a routine monitor fitting correction.
8. **Review the complete composition.** Inspect the original full frame with the real readouts, approved hand/base and shipping controls on desktop, Android/Chrome, iPhone/WebKit and a small phone. The user approves composition before activation in flight. Apply revisions locally to geometry/placement unless they actually require new art.
9. **Integrate only the approved hull.** Update the registry and session warming from the same source; do not preload legacy plates for it. Verify real career flight, steering, cached alpha occlusion, ship switching and decoded assets/offline resume. Keep one static frame and a small contained hand layer; no per-frame layout, decoding or image readback. Follow UI/SW versioning and release notes for live changes.

### Per-hull survey format

A runtime draft factory under `src/game/cockpits/` takes the approved baseline and returns a plain `layout-review` definition without a shell. Its authoring survey under `hulls/` default-exports `eye`, `look`, `fov`, `target`, `kx`, `ky` and native-space `ribs`. `continuousBow:true` belongs on the definition when the outline should be curved. `glassMaterials` selects exact material names; `windowMinX`/`windowMaxX` and `windowBounds:{min:[x,y,z],max:[x,y,z]}` exclude shared sensors or surrounding hull. For a packed atlas, `glassUvBounds:[uMin,vMin,uMax,vMax]` selects only triangles whose three UVs fall inside the measured glass tile. Edges and the cyan model overlay use that same filtered surface. Alternatively, `glassTriangles` may supply explicitly measured native-space window triangles from that GLB, with selection evidence in the hull README. Do not mark the whole packed hull as glass or silently substitute a different hull’s canopy. The cyan reference overlay uses the same selected triangles.

### Parallel ownership

The remaining tier-2 work runs in six separate user-requested GPT-6.1 Sol/high chats: Gaia (`prospector`), Morrigan (`demon`), Argo (`mule`), Tyr (`legionary`), Thor (`andromeda`) and Freya (`torsas`). Mercury is already approved. Gaia starts from its existing unpainted draft, extracted unchanged into its own files. All chats share the local checkout. Each owns only its hull definition factory under `src/game/cockpits/`, canopy survey under this tool’s `hulls/` directory, and its hull README. The coordinating chat owns registry imports, shared review code/tests, SW cache and pipeline docs. Do not revert other chats’ work or touch the pending hyperdrive fix, another hull’s files, or approved cockpit assets. Balor and Loki have their own active/finished chats; preserve their work. Each tier-2 chat owns exactly `src/game/cockpits/<id>.js`, `tools/playtest/cockpit-layout/hulls/<id>.js` and `tools/playtest/cockpit-layout/hulls/<id>.md`. Temporary diagnostics and captures belong under `output/cockpit-layout/<id>/`. The coordinator has already wired the factories, canopy-survey loader and service-worker cache. Rebuild the review after changing a survey. Do not change shared files or fix another chat’s unfinished draft. No commits, push, live activation or new artwork before the applicable approvals.

## Verification

`npm run test:browser:cockpit-review` covers Balor, Loki, Gaia, Mercury and the starter on desktop Chrome, Android Chrome, iPhone WebKit and a small phone. Checks include the actual shared renderer, identical source-aperture geometry, fixed shaft anchors, keyboard/touch/controller steering, phone-only controls, neutral touch start, expanded afterburner input, real phone preview dimensions, model reference and untouched storage. Captures/reports go under ignored `output/cockpit-layout/checks`, or `output/cockpit-layout/<hull>/checks` when `VR_REVIEW_HULLS` selects one hull.

`npm run test:browser:cockpit` checks the approved cockpit in live flight, including canvas dimensions, stationary readouts, occlusion, restricted hand painting and switching back to legacy hulls. Source geometry/approval regressions are in `tests/unit/cockpitArtwork.test.mjs`.

The current side-console mockup is projected from 3D points in `consoleGeometry.js`: deck tops share one plane, while their dark cabinet returns continue below the decks and attach to the upright monitor fascia. The guide exporter shades each face and includes foreshortening lines. `?hull=talon&mockup=1` renders this blockout with the same live hand/control overlays for direct comparison.

The v4 painted frame adds hardware density around the fixed openings, using `monitorHousings()` to guide swept shoulders on the raised hyperdrive cowl. Its layout guide excludes live controls/hand, while the Wing Commander reference supplies hardware/depth examples only. New hardware is painted into the single static sprite; readouts and hand/base retain the shipping renderer.

## Forward-hull blockouts — awaiting approval

The user requested manually drawn noses for Mercury and Tyr and side projections for Morrigan, followed by approval before sprite generation. Open `/output/cockpit-layout/tier-2.html?hull=talon&hull-view=1` and switch among those three tabs. “Manual hull blockout” toggles the sketch against the existing approved frame. Desktop and phone presets retain the original monitors, controls and hand/base. `hull-blockout.js` contains simple shaded SVG planes; it is an authoring layer only. The proposal starts behind the existing frame so each root joins the windscreen sill instead of floating. The aiming area stays clear. No new artwork or flight layer is generated until the user approves the blockout. The earlier model-projection experiment was discarded in favor of the requested manual drawing.

### Morrigan revision 3; Mercury/Tyr proposals withdrawn

The user rejected both nose additions; Mercury and Tyr keep their original approved views and no longer expose the blockout toggle. Only Morrigan has a pending forward-hull study: `/output/cockpit-layout/tier-2.html?hull=demon&hull-view=1&revision=morrigan-model-3`.

The earlier generic prisms were replaced with manually drawn faces from the actual seven octagonal sections of `Port forward armored prong` / `Starboard forward armored prong` in `authoring/models/demon/demon.blend`. A read-only Blender survey and comparison to `assets/models/ships/demon.glb` confirmed all 56 vertices per prong within 2.3e-8 runtime units after the original export normalization. Evidence is in ignored `output/cockpit-layout/forward-hull/morrigan-fit/`.

These bodies are tall beside the pilot, then taper downward toward the front. The approved eye `[0,-.015,.18]`, 64° FOV and existing .9/.65 canopy adaptation are retained. Back-face rejection exposes the inner armor/chamfer faces rather than inventing visible flat wing roofs. Manual SVG only; no generated sprite, changed model or extra runtime render pass. The original cockpit, monitors, hand/base and controls remain intact. The user must approve this revised Morrigan shape before generating the separate overlay sprite.

### Adjustable Morrigan pilot eye

The collection now exposes a **View forward** slider when Morrigan’s manual blockout is enabled. It moves the projected eye along the hull’s forward axis by 0–30% of ship length, without moving the approved cockpit artwork, instruments or controls. The user-approved default is now 13%; **Reset forward** restores 0%. Projection, clipping and visible facets are recomputed only on slider input, not in the flight loop. The current percentage is retained in `view-forward` in the collection and detailed-review URLs, including reloads and viewport changes. Send that URL or percentage for approval. This remains an authoring-only study before separate sprite generation.

**Structures outward** independently translates the two projected silhouettes horizontally in opposite directions, by 0–35% of screen width per side (0.5% steps). It preserves their geometry, vertical placement and the forward-view eye. The user-approved default is now 18% and is retained in `hull-outward` in both review URLs. Reset forward affects only the first slider; return outward spacing to 0 to restore its original position. Both controls remain review-only.


### Approved Morrigan placement and painted overlay

On 2026-11-17 the user selected **13% forward / 18% outward**. Those values supersede the earlier manual placement defaults and are recorded in `MORRIGAN_FORWARD_PLACEMENT`. A new separate transparent sprite, `assets/cockpits/demon-forward-hull-v1.png` (1851×850), follows this exact guide. The original cockpit PNG, code-fitted monitors and approved hand/base were not changed. Its exact prompt is in `assets/cockpits/DEMON-FORWARD-HULL-PROMPT.md` and the geometry input is `demon-forward-hull-guide-v1.png`.

Open `/output/cockpit-layout/tier-2.html?hull=demon&profile=desktop&hull-view=1&view-forward=13&hull-outward=18&hull-art=1`. **Painted hull** compares the generated sprite against the manual study. While enabled, both sliders are fixed at the approved sprite placement; uncheck to edit the manual geometry again. The sprite is decoded before the review reports ready. The user subsequently approved this composition for live activation: the shipping definition now owns this optional sprite and placement, warming includes it, HUD visibility uses the cached union of frame and hull alpha, and canopy damage masks both. The editable manual layer remains authoring-only.

Focused muted desktop/phone checks passed for painted/manual switching, exact placement, 98.55% alpha-mask overlap with the input silhouette, an entirely clear central view, unchanged frame/monitors/hand/base, URL reload and Mercury exclusion. Captures inspected under ignored `output/cockpit-layout/forward-hull/morrigan-fit/painted-*.png`; details in `painted-report.json`.
