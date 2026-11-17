# Loki / speedster — approved cockpit

Status: **layout and artwork composition approved; integrated into live flight**. The user approved the unpainted layout and requested artwork on 2026-11-16. The selected detailed transparent frame is now assembled with separate instruments, hand/base and controls in the isolated review. The user separately approved composition and requested live integration on 2026-11-16. Review: <http://127.0.0.1:4212/output/cockpit-layout/index.html?hull=speedster>.

## Shipped-model survey

Source: `assets/models/ships/speedster.glb`, inspected directly through its JSON/accessors and rendered with the shipping GLB loader. `LEAGUE_HULLS.speedster` identifies Loki as the tier-1 Alliance Courier Interceptor: fast courier/scout, small hold, interceptor role.

The model's native nose points **−X**, unlike the +X-facing views used by the older cockpit surveys. The four `Engine_*` markers are at x=+1.000118; the needle nose reaches x=−.995714. No seat, eye or interior is authored. The camera must look toward decreasing x.

The `Speedster_Glass` node uses `VR_Canopy_Glass`. Its one primitive contains 82 split-normal vertices, **24 unique positions and 36 triangles**. These form three shallow, thickened panes: a long central roof/windscreen and two splayed side panes. Most triangles close the .003-thick pane edges; they are not 36 distinct windows. All glazing lies within x=[−.671674, −.480273], y=[−.073098, .002850], z=[−.058570, .058570]. There is no separate sensor lens in this material. The explicit x bounds retain the complete cockpit glazing.

Measured corners, in native GLB coordinates:

| Rim | x | y | z pair |
| --- | ---: | ---: | ---: |
| Front side-pane lower edge, outer surface | −.67167354 | −.07009790 | ±.04784570 |
| Front central-pane roof edge, outer surface | −.67166018 | −.05183148 | ±.02342698 |
| Front side-pane upper edge, outer surface | −.67158484 | −.05201943 | ±.02443128 |
| Rear side-pane lower edge, outer surface | −.48040807 | −.01251602 | ±.05856999 |
| Rear side-pane roof edge, outer surface | −.48033828 | .00262911 | ±.03515509 |
| Rear central-pane roof edge, outer surface | −.48027349 | .00285043 | ±.03418804 |

The inner/back surfaces are .003 lower in y. The roughly .001 gap between the central and side-pane upper rims is a real seam. The four-point structural outline follows the outer front lower corners and the central pane's outer front roof corners. It bridges that tiny seam with a single narrow post, rather than doubling it. No curved bow or central mullion is invented. The long aft roof edges pass above/behind the proposed eye and are omitted from the forward frame.

## Proposed interior and adaptations

- Eye **[−.55, −.065, 0]**, level look **[−1.55, −.065, 0]**, vertical FOV **64°**. This puts the proposed eye below the sloping central pane and behind its front lip; it is not a recovered seat position. Model-reference focus: [−.575, −.035, 0].
- Interior projection stretch: **3.4× horizontally and 4× vertically** around the projection center. The literal exterior canopy is very shallow; the stretch opens the front view while retaining its flat brow, narrow roof and outward-swept posts. It is an explicit ergonomic adaptation, not a geometrically literal interior.
- Retain an angular outline: left lower rim → left roof corner → right roof corner → right lower rim. Native +Z projects screen-left when looking −X, so the survey starts on the +Z side. The projected roof corners are at approximately (25.94%, 15.36%) and (74.06%, 15.36%); lower corners are at (0.87%, 63.41%) and (99.13%, 63.41%). Thin lower jambs meet the outside monitor housings. Loki therefore has a low, sharp wedge canopy rather than Mercury's round bow.
- Preserve the approved own/target positions, all three display widths/heights, monitor renderers and control targets. Radar y=641 replaces baseline y=627; the accepted raised, swept forehead starts at y=560 and the hyperdrive ends at y=633, leaving an 8-source-pixel gap above radar glass.
- The shared perspective console supplies coplanar top faces, narrow inner bevels and dark vertical cabinet returns attached to the monitor fascia. These are proposed interior mounts, not exterior-model parts. Keep the forward aperture clear and omit large filler panels.
- Shift the inherited complete hand/base rig **60 source pixels left**, independent of touch targets. Retain the original navy/white hand, pitch views, scale and common fixed socket; no new pilot sprites. The hand stays present on desktop/controller. Right controls and the half-width throttle remain mobile only. Comms and upper controls use the shared alignment.

## Unpainted-layout verification

Model-reference screenshots rendered from the actual shipped GLB are under `output/cockpit-layout/speedster/checks/model-whole.png` and `model-glazing.png`; cyan marks the real glass only. The close view confirms the narrow long roof pane and the angular side panes.

The coordinator's shared wiring is available. Built the review with `node tools/playtest/cockpit-layout.mjs`, then passed:

```sh
VR_REVIEW_HULLS=speedster VR_PROFILES=desktop,small node tests/browser/cockpit-layout.mjs
```

The checks use desktop 1440×900 and small-phone 667×375 real browser viewports (the review header leaves inner cockpit heights 856 and 343). They cover the production `PaintedCockpit` renderer, decoded inherited assets, matching monitor geometry, neutral touch contact, keyboard/touch/controller steering, enlarged afterburner input, cargo page, mobile-only right controls/throttle, hand visibility, real 844×390 phone preset, actual-model dialog and unchanged career/settings storage. Both profiles passed without page errors. Captures and reports are in `output/cockpit-layout/speedster/checks/`.

Additional focused review covered all nine yaw/pitch combinations on each viewport, navigation/combat/salvage scenes, and actual keyboard firing. The supplemental reports (`desktop-supplement.json`, `small-supplement.json`) confirm:

- Every corner of the full visible base bounding rectangle lies inside the projected console top. Desktop source bounds are x=115.23…183.23, y=818.23…841.24; phone bounds are x=112.91…188.16, y=809.36…838.79. The base has clear space before the inner bevel and stays fixed through every pose.
- All nine source shaft pivots transform to the same screen socket within .1 pixel. Every opaque source-edge pixel at the sleeve cut remains off-screen. Even the highest bottom-cut projection stays more than 23 cockpit pixels below the desktop edge and 12 below the small-phone edge.
- The hyperdrive ends above radar glass with an 8.06-pixel desktop / 3.23-pixel phone gap. All display sizes and pilot sprite scales remain inherited.
- Navigation, hostile shield/hull readout and scanned coolant/remaining-units readout render correctly. Combat input produces shots. No page errors were recorded.

Visually inspected the rendered model close-up/whole hull, desktop and small-phone layouts, desktop phone preset, model dialog, opposing full-steering poses and combat/salvage captures. The angular brow leaves the central forward view open. The sloped decks have visible top faces, bevels and cabinet returns; the joystick sits on the top rather than its edge. No layout revision was needed after these checks.

No shared registry, renderer, CSS or tests were changed by this hull task. Progress is recorded here because this task owns only its three Loki files. The background/readouts are the isolated simulation, so these checks do not claim a live-flight integration.

## Artwork / composition review

Generated with the built-in imagegen tool after layout approval. Selected frame: `assets/cockpits/speedster-paint-v2.png`, **1850×850 RGBA**. The original generated PNG is preserved byte-for-byte, including alpha. SHA-256: `8af6c63beb35f8cb1675f3eea6aae4f13fec764800045e6acb71c287f310ad7d`.

The approved structural exporter produced `assets/cockpits/speedster-layout-guide-v1.png` without hand/base, controls, reticle or telemetry. The first generation used this guide, the approved starter/Mercury finish and the rendered Loki glazing. A deliberate design revision replaced repeated Mercury hardware with slim faceted titanium/ivory bezel seals and polygonal clamps, compact folding canopy catches, graphite ribbon looms, different left/right inset avionics modules, slotted cooling ducts and restrained ochre safety accents. This preserves the sharp wedge canopy while giving Loki its own light-interceptor equipment. The receding deck tops and dark vertical cabinet returns retain clear perspective and attachment to the monitor bank. Full prompts and input roles: `assets/cockpits/SPEEDSTER-PROMPT.md`. The first candidate is retained only under ignored `output/cockpit-art/`.

The frame contains no pilot, joystick/base, gameplay pads, throttle slider, screen contents or text. The existing navy/white hand, fixed base, production controls and readout renderers remain separate and unchanged. No new shared renderer/CSS or live-flight integration was introduced.

Measured alpha apertures (flood fill with alpha <40, sampled from each display centre) control the source definition. The artwork is not stencilled, cropped, resized or repainted for fit:

| Glass | x | y | width | height | Content inset x/y |
| --- | ---: | ---: | ---: | ---: | ---: |
| Own | 429 | 627 | 298 | 166 | 4 / 10 |
| Radar | 793 | 655 | 263 | 155 | 10 / 6 |
| Target | 1123 | 627 | 297 | 166 | 14 / 6 |

The three measured aperture centres are approximately [577.83,709.97], [924.77,732.48], [1271.53,709.96]. The monitor bank remains centred. Hyperdrive ends at source y622, inside the painted central face and above radar glass. `stickClearanceX:416` preserves the approved touch geometry despite the artwork-fit rectangles; the shared rig offset is still −60. The own-display inset was reduced horizontally and increased vertically after visual inspection to show the entire fuel value on the 667px-wide phone while clearing the upper bezel corners.

The complete review passed desktop Chrome, Android Chrome, iPhone WebKit and small-phone Chrome using a temporary copy of the shared browser check under `output/cockpit-layout/speedster/checks/artwork-check.mjs`. Its only changes are the absolute helper import required by its generated location and the expected source assertion (selected Loki PNG instead of the previous unpainted SVG). All production-renderer, geometry, fixed socket, input, mobile visibility, model-reference, decoded-resource and storage assertions remain intact. The shared tests were not edited. Run used `VR_REVIEW_HULLS=speedster VR_PROFILES=desktop,android,iphone,small`.

After the final inset adjustment, focused desktop/small-phone checks again passed all nine steering poses, off-screen sleeve cuts, fixed base mounting, navigation/combat/salvage readouts and firing. The full base bounding rectangle remains on the deck. Screenshots inspected include the assembled desktop, Android/iPhone and small-phone compositions plus steering extremes and scene readouts; no page errors occurred. Fuel 100 is fully readable in the final small-phone navigation capture. Generated captures/reports remain under `output/cockpit-layout/speedster/checks/`.

The user approved the complete composition on 2026-11-16. The definition now uses `status:'approved'`, enabling live selection and session warming through the existing shared registry. The original frame and separate pilot assets are unchanged.

## Live integration verification — 0.8.2os

Loki is active through the shared approved registry, using the original `speedster-paint-v2.png`, separate inherited hand and fixed base, and existing live controls. The runtime and service-worker identifiers are `0.8.2os` / `voidrunner-v671-0-8-2os-loki-cockpit`. Both cockpit factory modules are in the service-worker module cache; the selected frame and shared sprites are cached when the session warms them.

Passed the focused source/approval suite and runtime packaging:

```sh
node --import ./tests/helpers/offline-imports.mjs --test tests/unit/cockpitArtwork.test.mjs
npm run build
```

Passed the real career-flight harness on desktop Chrome, Android Chrome, iPhone WebKit and a 667×375 small phone:

```sh
VR_COCKPIT_HULL=speedster VR_PROFILES=desktop,android,iphone,small node tests/browser/cockpit-artwork.mjs
```

It purchases Loki, launches, verifies the decoded frame and separate base, stationary monitor geometry and fixed base under steering, touch-neutral input, mobile boost/throttle, controller steering, live ship-panel navigation, cached alpha occlusion, actual canvas backing sizes, absence of legacy cockpit requests, the contained hand paint layer, and switching to a legacy hull and back to Loki. All four profiles passed without page errors. Inspected desktop, Android, iPhone and small-phone flight/steering captures; the iPhone world had rendered by its steering capture. The full fuel value is readable on the smallest phone.

Passed normal entry/startup, decoded opening-room and selected cockpit images, current service-worker cache, saved-career offline resume, cached/uncached report navigation and reconnecting on desktop, Android and iPhone:

```sh
VR_BASE_URL=http://127.0.0.1:4212 VR_COCKPIT_HULL=speedster VR_PROFILES=desktop,android,iphone node tests/browser/offline-startup.mjs
```

Service workers stayed enabled and the normal `game.html` entry was used. All three profiles passed without page errors. Live captures/reports are under `output/cockpit-artwork/speedster/checks/`; offline reports are under `output/offline-startup/speedster/`. No artwork changes, commit, push or deployment were performed during integration. No outstanding Loki issues were found.
