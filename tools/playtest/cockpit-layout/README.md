# Shared cockpit layout review

Build with `npm run review:cockpit`; serve the repository and open:

- Mercury artwork: `/output/cockpit-layout/index.html?hull=talon`
- Approved starter reference: `/output/cockpit-layout/index.html?hull=wayfarer`

This is a silent isolated review with simulated flight/readouts. It never loads a career or writes saves/settings. **Mercury’s layout and artwork are approved and active in live flight.**

## Shared implementation

`src/game/cockpitDefinitions.js` owns the approved source dimensions, measured monitor apertures, hand poses/base anchors and approval registry. `cockpitLayout()` computes the monitor, hyperdrive and stick geometry. Both live flight and this review instantiate `PaintedCockpit` from `src/game/cockpitArtwork.js`, with the shipping `GameUI` DOM, readout renderers, fonts and CSS. The review no longer has separate monitor/hand placement or button styling.

The approved starter PNG stays intact. Live glass underlaps its apertures; only the small hand layer animates. Cached alpha resources survive hull switches. Unapproved definitions are available only through explicit review mode; live selection/preloading accepts approved hulls only. `wayfarer-v4.json` is a generated export for external art tools, refreshed by the review builder.

The outer page supplies review controls. An inner viewport runs the actual cockpit. The desktop and phone presets therefore use their own real media-query dimensions (1440×900 / 844×390), even when scaled down for the surrounding browser. On real phones choose “This screen.” The hand stays visible on every device; buttons/throttle are mobile only. Touch starts neutral at the first contact, then steers relative to that contact.

## Mercury canopy proposal

`canopy.js` loads the actual `talon.glb` glazing primitives, selecting the `VR_Canopy` material rather than a packed mesh or its painted trim. The model reference highlights only the original glass. The proposed pilot eye is `[0.15, -0.03, 0]`, looking along native +X at 64° vertical FOV. It is a proposed seat, not an authored interior marker.

The visible bow follows the x=0.27 pane ring. Its interior projection is widened 2.6× horizontally to protect sightlines; the shared 1851×850 authored frame stretches with the approved starter layout. The upper bow is one smooth curve through the surveyed ring. Thin lower jambs connect it to the monitor bank; low sloped side panels support the stick and outer housings. These are proposed console structures. These adaptations are explicit rather than presented as a literal interior supplied by the exterior model. The 3D comparison renders only while its dialog is open.

The bow, sightlines and sloped console connections were approved before painting. The current review uses `talon-paint-v8.png`, generated from a shaded perspective blockout with deck tops and inner cabinet walls and the reused navy/white hand and fixed base. A static aperture stencil keeps generated bezel edges outside the unchanged monitor rectangles. Mercury’s radar is 14 source pixels lower, with a housing forehead starting at y560 and the hyperdrive button ending at y633 above its y641 glass. The other monitors/controls remain fixed. The live composition includes the fixed hand/base shifted 60 source pixels left onto its console. Add `&mockup=1` to inspect the shaded geometry instead of the artwork.

## Repeatable hull pipeline

1. Inspect the current GLB's glazing, orientation, frame topology and paint identity. Record the proposed eye/look/FOV and any interior adaptation.
2. Add a `layout-review` registry definition reusing the shared instruments and pilot rig. Add its model-informed canopy survey; build a code-only plate.
3. Review on desktop, real phone-sized viewports and small phones. Inspect sightlines, hand reach, all steering extremes, control hit areas, comms and monitor readability. **Obtain the user's layout approval.**
4. Export only the monitor/beam guide (`VR_COCKPIT_HULL=talon node tools/playtest/cockpit-art-guide.mjs`). Give image generation that guide plus hull/style references. Keep controls, readouts and the reusable hand out of the generated frame.
5. Check the intact PNG's actual alpha apertures against the locked geometry. Correct the image if needed; do not stretch instruments to disguise inaccurate artwork. **Obtain composition approval.**
6. Verify source alignment, alpha occlusion, resource reuse, input methods, phone performance and browser paint costs. Keep the frame static and the hand in its small contained region.
7. Mark the finished hull approved, add its source frame to the registry, and follow the runtime/SW release protocol. Integrate one approved hull at a time. Gaia and Atlas are useful next shape/size tests.

## Verification

`npm run test:browser:cockpit-review` covers Mercury and the starter on desktop Chrome, Android Chrome, iPhone WebKit and a small phone. Checks include the actual shared renderer, identical source-aperture geometry, fixed shaft anchors, keyboard/touch/controller steering, phone-only controls, neutral touch start, expanded afterburner input, real phone preview dimensions, model reference and untouched storage. Captures/reports go under ignored `output/cockpit-layout/checks`.

`npm run test:browser:cockpit` checks the approved cockpit in live flight, including canvas dimensions, stationary readouts, occlusion, restricted hand painting and switching back to legacy hulls. Source geometry/approval regressions are in `tests/unit/cockpitArtwork.test.mjs`.

The current side-console mockup is projected from 3D points in `consoleGeometry.js`: deck tops share one plane, while their dark cabinet returns continue below the decks and attach to the upright monitor fascia. The guide exporter shades each face and includes foreshortening lines. `?hull=talon&mockup=1` renders this blockout with the same live hand/control overlays for direct comparison.

The v4 painted frame adds hardware density around the fixed openings, using `monitorHousings()` to guide swept shoulders on the raised hyperdrive cowl. Its layout guide excludes live controls/hand, while the Wing Commander reference supplies hardware/depth examples only. New hardware is painted into the single static sprite; readouts and hand/base retain the shipping renderer.
