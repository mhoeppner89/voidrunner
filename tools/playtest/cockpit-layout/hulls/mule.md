# Argo / mule — artwork composition review

Status: **art-review**, with the original generated frame and no live activation. The user approved the unpainted layout and confirmed the Argo artwork request on 2026-11-17. Open [the interactive review](http://127.0.0.1:4212/output/cockpit-layout/index.html?hull=mule). The initial layout review below was prepared on 2026-11-16. Artwork adds only Argo's frame, structural guide, prompt record and code fitting in its factory. Shared code, approved assets and other hull work are preserved.

## Model evidence

`SHIPS.mule` identifies Argo as a tier-2 Armored Medium Freighter: protected convoy transport, substantial hold, three drives and two defensive PDC positions. The model comparison shows its blunt forward freight cab, long armored body and aft drives. **Native +Z is forward, +Y is up, and X spans the cab.** The `MuleApprovedHull` node has no transform; its surveyed position accessor is already in native model space. The hull spans z=-1..1. The nose windows reach z=.9731285; the three engines are at the opposite end. This is not a +X-facing model.

The hull has a separate `VR_Canopy_mule` primitive, position accessor 25 and index accessor 1, with 36 vertices and 18 triangles. Twelve triangles form six forward cab panes; six triangles form three separate upper/aft panes at z=.006897..205255. The review selects the exact material **and** bounds x=[-.169,.169], y=[.008,.080], z=[.84,.974]. It retains all six forward panes and excludes the separate aft glazing. It does not select the packed civilian armor or turret materials. No UV filter or substituted triangles are needed.

The cyan comparison mesh and aperture edges use those same **12 selected triangles**. Original ship textures contain other cyan lights; those are not part of the overlay. `output/cockpit-layout/mule/glass-survey.json` records all 18 original glass triangles and UVs, including the six excluded aft triangles. The actual shipped model was inspected from the cab, whole-hull and opposite rear-quarter views (`model-cab.png`, `model-whole.png`, `model-opposite.png`).

Measured native-space pane corners, mirrored across x=0:

| Pane / edge | Absolute x | y | z |
| --- | ---: | ---: | ---: |
| Central panes, inner lower / upper | .003133343 | .008528742 / .051898196 | .973128498 |
| Central panes, outer lower / upper | .084985569 | .008528742 / .051898196 | .969463527 |
| Front quarter panes, inner lower / upper | .090899207 | .009195407 / .052564863 | .967400134 |
| Front quarter panes, outer lower / upper | .148317918 | .021412153 / .075776689 | .922808945 |
| Side panes, forward lower / upper | .153694570 | .022660105 / .075205259 | .914614081 |
| Side panes, aft lower / upper | .168472916 | .026600990 / .079146147 | .842364550 |

The survey's ordered connected bow follows the forward pane corners from screen-left lower to the upper rim, across the broad central brow, then down to screen-right lower. Looking +Z places native +X on screen-left. The small seams between real panes remain short angular segments. `continuousBow:false` preserves the freight cab's faceted construction. The tiny central pane split is represented along the roof edge; a center post is omitted to protect the forward sightline. Side-pane aft edges sit outside the forward outline rather than adding duplicate posts.

## Proposed interior

Proposed eye **[0,.012,.78]**, level look **[0,.012,1.78]**, vertical FOV **64 degrees**, model focus [0,.045,.9]. No seat or complete interior is authored in this exterior model. The eye is behind the forward glass; it is a layout proposal.

Interior projection expands **1.15 times horizontally and 1.9 times vertically**, around the projection center, in the shared 1851x850 reference aspect. These are explicit visibility adaptations. The central brow projects to approximately 18.6% of source height. The outer lower pane corners project to x=6.1% / 93.9%, y=40%; their upper corners pass above the viewport. Thin lower jambs connect to the outer monitor fascia. The resulting shallow, broad brow and angular outer shoulders preserve the armored cab character while keeping the center clear. This is not a literal recovered interior.

The shared centered three-monitor bank retains approved sizes and positions. Radar alone uses the established lowered y=641, with swept hyperdrive forehead starting at y=560 and hyperdrive ending at y=633, eight source pixels above its glass. Original monitor/radar renderers, typography, control positions and generous hit areas are unchanged. The shared perspective side decks have clear top faces, narrow bevels and dark cabinet returns attached to the monitor bank. These are proposed interior supports, not claimed exterior parts.

The navy/white hand strip and separate fixed base are unchanged. Their common rig is shifted 60 source pixels left, independently of touch targets. Every pitch pose pivots at the same socket and yaw only rotates the hand. The complete base footprint is supported by the deck, clear of its inner slope. On desktop its full bounds in reference coordinates are approximately x=115.23..183.23, y=818.23..841.24; on the small phone they are x=112.91..188.16, y=809.36..838.79. The hand stays visible on both devices, with right controls and narrow throttle mobile-only, neutral initial touch, top-center comms and shared upper-corner alignment.

## Verification and evidence

Built with `node tools/playtest/cockpit-layout.mjs`. The focused **unmodified** check passed each profile separately:

```sh
VR_BASE_URL=http://127.0.0.1:4212 VR_REVIEW_HULLS=mule VR_PROFILES=desktop node tests/browser/cockpit-layout.mjs
VR_BASE_URL=http://127.0.0.1:4212 VR_REVIEW_HULLS=mule VR_PROFILES=small node tests/browser/cockpit-layout.mjs
```

These cover the production renderer and matching geometry, decoded assets, anchored hand, keyboard/touch/controller input, neutral touch, extended afterburner hit area, mobile-only controls, cargo page, actual phone iframe preset, model comparison and unchanged storage. Chrome used the repository root cwd, muted audio, `--no-sandbox` and `--disable-gpu-sandbox`. The outer sandbox initially aborted Chrome at launch; the browser runs then used approved execution outside that sandbox. Two desktop attempts failed the existing 180ms keyboard-settling assertion. A temporary diagnostic recorded held `KeyD`, unpaused state and handX=.94675 at 180ms; its remaining checks passed. The subsequent unmodified desktop run passed. No shared test changes were made.

Supplemental scripts under ignored `output/cockpit-layout/mule/` passed on desktop and small phone. Actual inner viewports were **1440x856** and **667x343** (review headers account for the outer 1440x900 / 667x375 dimensions). They verify all nine pitch/yaw combinations, stable socket and base transforms, the entire base bounding rectangle inside the projected deck, and opaque strip cut-perimeter pixels outside the visible screen at every extreme. The closest sleeve cut is 23.6 CSS pixels below the desktop viewport and 12.1 below the small-phone viewport. Combat firing produced two shots; contextual salvage scan displayed the coolant result. No page errors occurred.

Visually inspected desktop and small-phone navigation, combat and salvage, both nine-pose contact sheets, the full base, and actual 3D model views. Evidence includes `desktop-inspection.json`, `small-inspection.json`, `interaction-inspection.json`, `desktop-nine-poses.png`, `small-nine-poses.png`, scene captures and `checks/` reports. This isolated preview does not claim career-flight integration.

## Remaining shared concern and approval boundary

**Small-phone salvage content clips in the inherited readout layout.** At inner 667x343, the target screen is 112.53x77.23 CSS pixels. Its heading/distance/status rows leave the contents box 29.72 pixels high, but that box has scrollHeight 39. Its inherited 13px font / 14.95px line-height, two-line detail, padding and centered flex alignment put the first Coolant line above its clipped box. The status string also measures 121 pixels in a 110-pixel row. Full strings remain in the DOM and scan comms work; desktop content is readable. The phone weapon line and long target name also clip/ellipsize at the inherited sizes. The automated checks do not detect this text clipping. Fixing responsive readout allocation belongs to the shared renderer/CSS owner; resizing Argo's approved monitors would change the requested composition. No shared files were changed to mask it. Measurements and a scan screenshot are in `interaction-inspection.json` and `small-salvage-scan.png`.

The structural layout was approved on 2026-11-17. Its guide contains only beams, monitor openings and shaded console surfaces, omitting the reusable hand/base, controls, live telemetry and reticle. The resulting painting is now available for composition approval; keep Argo inactive until that approval.

## Artwork and code fitting — 2026-11-17

Generated with **built-in imagegen**, using `assets/cockpits/mule-layout-guide-v1.png` as strict geometry/perspective authority and the actual Argo cab comparison as a separate hull reference. Full input roles and exact prompt are recorded in `assets/cockpits/MULE-PROMPT.md`. The guide was exported from the approved shared blockout before fitting any monitor coordinates.

The selected original is `assets/cockpits/mule-paint-v1.png`, **1850x850 RGBA**, copied byte-for-byte from built-in output `exec-bc291a43-0157-45a6-b28f-c90978d26f79.png`. SHA-256: `ee55cac5998ced56f6874b5dc7551cdd50c36ac781b03692cb8f1c7af45c0eab`. No raster editing, corrective alpha stencil, repainting or repeat generation was applied.

Argo uses pale industrial enamel cabinets over charcoal-blue steel, petrol-blue service trim and small orange safety fittings. A recessed pressure-regulator module, guarded contactor bank, connector covers, strapped looms, access plates, cooling slots and small canopy cleats give it an armored freight-cab identity. The faceted shallow brow and outer posts follow the approved guide. Horizontal decks, darker cabinet returns, narrow bevels and rear monitor joints keep their perspective. The left near-deck landing patch stays clear for the separate fixed base. The three rectangular monitors have compact dark protective rims, recessed seals and small orange catches, distinct from Mercury's ivory detail, Balor's red armor and Freya's warm grey/brass treatment.

Measured native-image alpha holes (alpha <40, exclusive right/bottom):

| Glass | Original PNG bounds | Transparent-area centroid |
| --- | --- | --- |
| Own | x437..717, y628..785 | [577.226,707.027] |
| Radar | x810..1047, y659..811 | [928.651,734.698] |
| Target | x1142..1418, y628..786 | [1280.070,707.402] |

The factory keeps the approved **318x184 / 270x182 / 304x184 live backing sizes**. Small position corrections center them on those original holes, accounting for the 1850px PNG on the 1851px layout grid:

| Glass | Reference x / y | Content inset x / y |
| --- | --- | --- |
| Own | 418.5 / 615 | 22 / 15 |
| Radar | 794.2 / 643.7 | 20 / 17 |
| Target | 1128.75 / 615.4 | 16 / 16 |

The full image remains above the live backing. The original apertures fit inside their backing rectangles and their centroids align within two native source pixels. Insets protect the physical seals and corner catches. `stickClearanceX:416` preserves the approved touch area and complete hand/base placement independently of monitor fitting. The common rig offset stays -60, source strip/base/anchors and scale are unchanged, and hyperdrive keeps its approved size and vertical position. No shared renderer, CSS, controls, registry, service-worker or release-version changes were made for this inactive review.

## Artwork verification

The existing shared browser suite predates Argo's artwork stage and assumes every unlisted hull is an unpainted SVG. A temporary copy under `output/cockpit-layout/mule/artwork/shared-art-check.mjs` changes only its helper/output paths and Argo-specific PNG/status/native-image-coordinate expectations. All production-renderer, glass fit, keyboard/touch/controller, mobile control, neutral-touch, expanded boost, cargo-page, fixed-anchor, real phone-preset, decoded-image and storage assertions remain intact. No shared tests were edited.

Passed each profile separately:

```sh
VR_REVIEW_HULLS=mule VR_PROFILES=desktop node output/cockpit-layout/mule/artwork/shared-art-check.mjs
VR_REVIEW_HULLS=mule VR_PROFILES=small node output/cockpit-layout/mule/artwork/shared-art-check.mjs
VR_REVIEW_HULLS=mule VR_PROFILES=android node output/cockpit-layout/mule/artwork/shared-art-check.mjs
VR_REVIEW_HULLS=mule VR_PROFILES=iphone node output/cockpit-layout/mule/artwork/shared-art-check.mjs
```

The additional artwork inspection passes in **actual 1440x900 desktop and 667x375 small-phone inner viewports**. It checks navigation, combat and salvage, all nine pitch/yaw combinations, one fixed socket, stable base geometry, the complete base footprint inside the projected deck, and opaque painting behind all four base corners (alpha 252..253). Every original hand-strip cut edge stays outside the screen, with minimum margins 23.62 CSS pixels below desktop and 12.11 below small phone. The hand/base remain visible and the base does not travel with steering. No page errors were recorded.

Visually inspected desktop, Android Chrome, iPhone WebKit and small-phone compositions; desktop phone preset; both nine-pose contact sheets; full painted base support; navigation/combat/salvage; and the actual model comparison. Fuel 100 and the basic flight/status gauges remain readable on the smallest phone. **The previously documented shared small-phone salvage label/status and long weapon-line clipping remains**; the painting and passing geometry/input assertions do not fix or conceal that shared typography issue. It still needs the shared readout owner's responsive layout correction.

`source-check.mjs` also passes: Argo cannot select/preload in live flight, the original PNG is unchanged, all display sizes and pilot assets are inherited, stick geometry and button size/vertical placement are preserved, and hashes of the existing hand/base, Mercury PNG, input, CSS, shared artwork renderer and registry are unchanged. Factory syntax and whitespace checks pass. Evidence is isolated under `output/cockpit-layout/mule/artwork/`, including `checks/*-report.json`, `alpha-measurements.json`, both `*-inspection.json` files, `source-check.json`, scene screenshots and pose sheets. There is no claim of live-flight/offline integration in this composition review.

Next step: obtain the user's composition approval. Preserve this detailed original painting and handle any small display fitting revisions in code. Do not activate Argo in flight, commit, push or publish as part of this artwork request.


## Live integration — 2026-11-17

The user approved the complete tier-II collection and requested integration. This definition is now `approved` for live flight in 0.8.2ov. The original selected PNG, reviewed display geometry, navy/white hand, fixed joystick base and control layout are preserved. Shared source, live-flight and offline checks are coordinated in the main chat. Earlier approval boundaries above describe the historical authoring stages.
