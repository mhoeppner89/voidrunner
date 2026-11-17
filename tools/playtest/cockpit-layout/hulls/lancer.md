# Artemis — unpainted tier-III layout

Status: **approved**. The user approved live integration; active in flight in 0.8.2ow.

## Actual model survey

- Source: `assets/models/ships/lancer.glb`; SHA-256 `02c1f282cb1d4f9fc971643f7924dd0d02210c2d2719ff57a179a9e29670eeec`.
- Native forward: +X; up +Y. The proposed eye is `[0.48, 0.1, 0]`, looking at `[1.48, 0.1, 0]` with a 64° vertical FOV.
- Selected material: `VR_Canopy_lancer original reflective glass`; 52 glazing triangles, including their actual thickness where present. The cyan model-reference overlay uses exactly this selection.
- The glazing material is separate from hull armor and was inspected from world-transformed GLB vertices; no packed hull is substituted for a canopy.
- Profile: raked, trapezoidal interceptor windshield. Framing ribs follow the measured pane junctions. Display adaptation is explicitly 2× horizontal / 1.2× vertical. This protects visibility at the approved composition; it is a proposed interior, not a model-authored pilot seat. Rounded bows use a continuous curve through the measured ring; angular hulls keep the original pane character.

## Shared composition

All five tier-III drafts use identical baseline monitor sizes/positions, with the central radar lowered to y647 and a swept hyperdrive cowl above it. Own/target screens retain the original contents and radar renderer. The existing low perspective side decks physically support the monitor bank and joystick; the navy/white hand strip and separately anchored base remain unchanged. The fixed socket moves 60 source pixels left onto the console independently of the input area. Mobile controls, narrow throttle, enlarged invisible hit areas and neutral touch start are shared unchanged; the hand remains present on desktop/controller.

Review: `/output/cockpit-layout/tier-3.html?hull=lancer`. Actual desktop/phone iframe presets, navigation/combat/salvage, fixed hand poses, touch and model-reference comparison must pass before handing the layout over. No new noses or external structures are added without a separate approved blockout.

## Evidence

The read-only survey and exact selected vertices/triangles are in ignored `output/cockpit-layout/tier-3-survey/lancer.json`. Focused review captures/checks will be recorded there or under this hull’s `checks/` folder. No career or settings changes are made by the review.


## Layout verification

- Shared production cockpit review passed on desktop Chrome and 667×375 touch Chrome, including fixed shaft anchors/three pitch poses, keyboard, touch-relative neutral steering, controller input, expanded boost hit area, cargo page and unchanged save/settings.
- Collection passed actual 1440×900 and 844×390 inner viewport checks, navigation/combat/salvage switching and the actual GLB reference. Screenshots of all five layouts and model references were inspected.
- All 18 focused source/HUD checks and runtime packaging pass. These drafts stay `layout-review`, with no shell, no live activation and no preloaded draft art. No imagegen used.
- The source inspection also records forward-ray intersections in `tier-3-survey/eye-rays.json`: these exterior assets contain closed internal/backing faces. The reference is a glazing/shape survey; it does not claim a modeled, ray-clear cabin interior. Seat and visibility adaptation are deliberately proposed for layout approval.

Evidence: `output/cockpit-layout/tier-3-survey/review-report.json`, per-hull desktop/phone/model captures, `output/cockpit-layout/checks/desktop-report.json`, `small-report.json`, and the corresponding per-hull images. All outputs are local and ignored.


## Distinct structural revision

**Light interceptor cockpit.** The three instruments sit in separate thin, chamfered pods with visible diagonal feet rather than a full bulkhead. Narrow peripheral trim, shallow open side rails and thin deck fixtures keep Artemis light and forward-focused.

The draft factory owns its `structure` profile: housing shoulders/corners, peripheral rim width, perspective deck depth/edge and cabinet thickness. The authoring renderer builds these as neutral shaded geometry through `structureVariants.js`. Shared monitor apertures, radar position, control placement, hand poses and fixed socket are unchanged. All three glass openings are cut through the structural body so the live readouts remain unobstructed. Raised fixture roots and the complete fixed-base rectangle were checked inside the actual projected deck polygons in both desktop and phone views. All nine yaw/pitch combinations keep one shaft pivot. No additional live instruments, buttons, nose parts or artwork were introduced.

Desktop/small-phone production input regressions and all 18 focused source/HUD checks pass. Geometry/alpha/rooting reports are in `output/cockpit-layout/tier-3-survey/support-report.json`, with final Odin gasket checks in `support-odin-final.json`. Captures: `lancer-unique-desktop.png` / `lancer-unique-phone.png`. Still awaiting layout approval.


## Architecture revision 3 — supersedes the earlier structural pass

The user rejected the previous designs as still too similar. Artemis now has separate small octagonal instrument pods on visible floor feet, an isolated stick pedestal and narrow console outriggers. Large old triangular side decks and the continuous dashboard join were removed. The canopy jambs land on the pod bevels; a dark lower footwell sits behind the supports.

Shared live glass sizes/positions, hyperdrive/radar arrangement, controls and pilot rig remain unchanged. Custom instrument mounts replace the generic monitor housing path for these drafts. New side-console cutouts are confined to each deck’s real geometry. Pixel-alpha checks confirm the actual visible frame supports the complete base rectangle; monitor and central aiming samples remain clear. All nine steering poses share one pivot. Desktop/small-phone production input checks and all18 focused source/HUD checks pass. No artwork or activation is approved yet.

Use the current `architecture-3` review and `output/cockpit-layout/tier-3-comparison.html`. Earlier captures and descriptions are historical.


## Painted composition review

The final structural layout is approved. The generated frame now has `art-review` status and is available in the shared production-renderer review. See `assets/cockpits/TIER-3-ARTWORK.md` for the selected original PNG and exact prompt. Monitor/control positions and shared hand/base remain fixed. Composition approval is still required before flight activation; earlier layout-pending notes above are historical.

Live integration approved in 0.8.2ow. Earlier layout/composition approval notes above are historical.
