# Freya / torsas — cockpit artwork review

Status: `art-review`. The user approved the unpainted layout on 2026-11-16 and requested detailed, distinctive artwork with the existing hand, base and controls. A complete transparent frame is now selected for composition review; it is not activated in flight. Review:
[Freya cockpit](http://127.0.0.1:4212/output/cockpit-layout/index.html?hull=torsas).
The three owned source files are the runtime factory, canopy survey and this note.
All diagnostic scripts, measurements and captures are under ignored
`output/cockpit-layout/torsas/`. The artwork request additionally authorizes the new Freya PNG and its prompt/provenance note under `assets/cockpits/`. Shared renderers, registry, CSS, service worker, other hulls, approved paintings and the pending hyperdrive work were left alone.

## Exterior survey

Inspected the actual `assets/models/ships/torsas.glb`, SHA-256
`f79ff6399cbff4c12552c5c0e0681ae890f00858503f251b94401bf90cd60774`.
Its runtime mesh has no transform. Native axes are **+Y up, +Z forward**.
The four `Engine_*` markers are aft at z=-.5108094 / -.9997417; the pilot
windows are forward at z=.7086957–.8993049. The exterior comparison also
shows the raked cab at the opposite end from the engines. +X is lateral.

Mesh 0 (`01 transport pressure cabin and central spine.001`), primitive 2,
uses the dedicated `VR_Canopy_Glass` material. POSITION accessor 11 has
72 vertices; index accessor 2 has 108 indices. It contains exactly **36
triangles, 24 unique positions: three closed, thick, quadrilateral panes**.
The other two primitives are hull plating and brass inserts. No sensor lens
or armor shares this glass material. The survey selects its exact name and
a conservative native window bound; all 36 triangles survive. No UV filter
or replacement triangles are needed. Cyan in the shared comparison is those
original surfaces, including pane thickness, rather than the enclosing hull.

Measured native coordinates (rounded to seven decimals):

| Pane / edge | Native vertices |
| --- | --- |
| Front, outer top | `[±.0907902, .1521327, .8347841]` |
| Front, outer bottom | `[±.1057250, .0807689, .8993049]` |
| Front, inner top | `[±.0907902, .1491327, .8347841]` |
| Front, inner bottom | `[±.1057250, .0777689, .8993049]` |
| Side outer, upper aft / forward | `[±.1026950, .1483500, .7086957]`, `[±.1026950, .1483500, .7944503]` |
| Side outer, lower aft / forward | `[±.1278050, .0646500, .7364364]`, `[±.1278050, .0646500, .8751393]` |
| Side inner, upper aft / forward | `[±.0976950, .1483500, .7086957]`, `[±.0976950, .1483500, .7944503]` |
| Side inner, lower aft / forward | `[±.1228050, .0646500, .7364364]`, `[±.1228050, .0646500, .8751393]` |

The front pane is .1815804 wide at the roof and .2114500 at its lower edge.
It rakes forward .0645208 while dropping .0713638. Its upper corners are
closer to the pilot, so perspective makes the roof wider on screen than its
lower edge. This is intentional and follows this glazing, rather than a
generic arch. The two side panes remain visible in the 3D reference; their
aft edges are beside/behind the proposed eye and do not become extra bars
across the forward view.

## Approved unpainted interior

Eye `[0, .09, .7]`, look `[0, .09, 1.7]`, 64° vertical FOV; model-reference
orbit target `[0, .108, .82]`. These are proposed seat/view positions, not
markers authored in the GLB. The eye is centered inside the cab, behind the
front pane and just aft of the side glazing. An initial eye .005 higher put
the roof through the phone comms label; the final eye clears it without
moving the common controls.

The bow follows the **actual front pane's four outer corners**, ordered from
screen-left lower through the roof to screen-right lower. Looking +Z means
screen-left is native +X. `continuousBow:false` preserves straight posts and
the flat transport roof. It is one connected three-segment outline, with
thin proposed lower jambs joining the monitor fascia.

The shared 1851×850 source projection uses **1.5× horizontal / 1.2× vertical
stretch**, then scales to the real viewport with the approved composition.
This is an explicit visibility adaptation, not a literal authored interior.
Final source-space bow points are approximately `[384.31,462.80]`,
`[238.29,48.76]`, `[1612.71,48.76]`, `[1466.69,462.80]`. The straight roof
and splayed projected posts retain the transport's forward-raked windscreen.
Framing is 13 source pixels with a 2-pixel highlight in the shared blockout.

The factory preserves the approved own/target monitor positions and sizes,
the 270×182 radar at y641, swept radar roof at y560, and hyperdrive bottom
at y633. The three-monitor bank uses the original production readout/radar
renderers. Low projected side-deck tops, bevels and cabinet returns attach
to the monitor fascia. These decks and lower jambs are proposed interior
structures: the exterior asset contains no authored cockpit furniture.

The navy/white hand strip, all three pitch anchors and the separately painted
fixed base are unchanged. `handOffsetX:-60` moves the complete rig together
onto the left top surface, independently of the unchanged touch area. No
hand or base asset is repainted or cropped. Desktop/controller retain the
hand; throttle and right buttons remain mobile-only. The narrow throttle,
visible caps and generous invisible hit areas use production geometry;
touch starts neutral. Comms remain top-center; wing and pause/fullscreen
cards retain their upper-corner alignment.

## Original layout verification and evidence

Built with `node tools/playtest/cockpit-layout.mjs`. The builder also refreshes
the unchanged generated starter manifest as part of its normal operation.
Focused existing checks passed with:

```sh
VR_REVIEW_HULLS=torsas VR_PROFILES=desktop,small node tests/browser/cockpit-layout.mjs
```

`VR_REVIEW_HULLS` is the existing harness's selector (the delegation's
`VR_REVIEW_torsasS` spelling is not read by it). Profiles run sequentially.
The first sandboxed Chrome launch aborted before loading a page; rerunning
the same check with approved process access passed. All launches were muted,
used `--no-sandbox --disable-gpu-sandbox`, fresh Playwright profiles and the
repository-root cwd. No shared profile was cleared while other chats used it.

The existing checks verify production renderer/apertures, inactive approval
state, 36 actual glass triangles, anchored pitch/yaw, keyboard/touch/controller
input, neutral touch contact, expanded boost hit area, phone-only controls,
real phone preset and unchanged save/settings sentinels. Reports and overview
captures are in `checks/` beneath the hull output directory.

Additional `verify.mjs` evidence uses real **1440×900 desktop and 667×375
small-phone iframe viewports**, with surrounding browser chrome sized to
avoid shrinking the iframe. Each profile checks navigation, combat and salvage
readouts and captures all **nine pitch/yaw combinations** at -1/0/+1.
It checks exact socket alignment, unchanged base bounds and transformed opaque
source-boundary pixels: no sleeve cut edge enters either visible viewport in
any pose. The complete base bounds stay inside the projected left deck,
including all four corners, with minimum edge clearance **39.83 CSS pixels
desktop / 17.44 small phone**. No new page errors were reported.

Evidence files include `desktop-evidence.json`, `small-evidence.json`,
`desktop-navigation.png`, `small-navigation.png`, matching combat/salvage
captures, nine `*-pose-*.png` files per profile, steering contact sheets and
`model-canopy.png`, `model-closeup.png`, `model-whole.png`. These were visually
inspected alongside the actual shared model comparison. The base stays fully
visible on its top surface and clear of the sloping inner edge; the sleeve
continues beyond the screen at the steering extremes. Final phone framing
clears the comms label.

## Selected artwork and code fitting

Two built-in imagegen candidates were produced from the approved structure-only guide. The dedicated Freya chat produced `torsas-paint-v1.png`; the Argo chat received the same Freya artwork request and produced a separate candidate. Its richer recessed service modules, vibration-isolator collars, connector covers and readable deck hatches suited the user's high-detail request better. The dedicated Freya chat selected that candidate, copying its original bytes to `assets/cockpits/torsas-paint-v2.png`. Both initial candidates are preserved. A brief same-filename collision during generation was resolved by the other chat; all final checks target the stable v2 file.

The selected frame is 1850×850 RGBA, SHA-256 `94cc0c529f83a88aaf612401316405673912c9fec4f47dd3dcf8db5bb17dc28d`. The complete detailed original remains intact: no bitmap editing, aperture stencil, recoloring or generated bezel repair. The exact selected prompt, input roles and original generated source are recorded in `assets/cockpits/TORSAS-PROMPT.md`.

Freya's warm graphite/olive-grey metal, dull brass fasteners, rubber shock collars, paired service connectors, utility trim dials and small status lamps distinguish it from the existing navy/ivory cockpits. The thin straight roof, sloped posts and shallow side tops preserve the approved transport cab. Seams and service fittings recede along the deck planes; the inner cabinet returns remain visibly vertical and darker. The left near deck is clear for the separate hand/base.

Native alpha flood-fill measurements (threshold <40) give these actual transparent opening bounds; the factory maps x values from 1850 image pixels to the unchanged 1851 source grid:

| Opening | Native PNG bounds (left, top, right, bottom) | Size |
| --- | --- | --- |
| Own | `[428,628,721,796]` | 293×168 |
| Radar | `[797,658,1055,815]` | 258×157 |
| Target | `[1131,628,1424,796]` | 293×168 |

These small art-fit changes replace the rough guide holes only; the production monitor/radar renderers and overall three-monitor bank remain. Modest content insets avoid the beveled corners. The lower radar still sits beneath the swept hyperdrive housing. `stickClearanceX:416` explicitly preserves the approved touch-stick area and complete hand/base position even though the own display opening is now fitted to the PNG. Original hand strip/base paths, anchors, scale, pitch selection, yaw pivot, touch origin, narrow throttle and mobile control bank are unchanged. The frame is one static sprite; no added live overlays or per-frame image processing.

## Artwork verification

The shared review suite currently recognizes only the earlier named painted hulls, so its generic fallback assumes every other hull has an SVG and `layout-review` status. Shared tests were left untouched per ownership. `output/cockpit-layout/torsas/art/shared-art-check.mjs` is a temporary copy of the existing suite adapted only for Freya's selected PNG, `art-review` status and native image/source-grid scaling. It retains the existing alpha flood-fill fit checks and all renderer, anchor, keyboard/controller/touch, neutral-origin, expanded boost hit area, phone-only control and storage checks. Profiles run sequentially and muted.

Final checks **passed on desktop Chrome, Android Chrome, iPhone/WebKit and small-phone Chrome** using:

```sh
VR_PROFILES=desktop,android,iphone,small node output/cockpit-layout/torsas/art/shared-art-check.mjs
node output/cockpit-layout/torsas/art/verify-art.mjs desktop
node output/cockpit-layout/torsas/art/verify-art.mjs small
```

Final commands and captures are under `output/cockpit-layout/torsas/art/`; the four device reports are under its `checks/` directory. `verify-art.mjs` additionally checks all nine pitch/yaw poses, all three navigation/combat/salvage readouts, sleeve cut edges and fixed socket/base bounds in real 1440×900 and 667×375 iframe viewports. Its contact test uses the approved projected deck geometry rather than recomputing a deck from the measured PNG display openings. Base position/size match the approved unpainted evidence exactly, and all four footprint corners remain on the same deck top. Final screenshots are inspected against the selected original art. The entire base footprint also samples opaque painted metal at all four corners. No page errors were reported. Source syntax checks passed. The original hand, fixed base and Mercury frame were compared byte-for-byte with their committed originals and are unchanged; the selected Freya PNG matches its generated original byte-for-byte.

## Approval boundary and remaining limits

The unpainted layout is approved. This finished composition is ready for **artwork approval**, with Freya retained as `art-review` and excluded from live selection/preloading. No runtime release, SW update, commit or push is included. The seat, projection stretch and interior furniture remain the explicit model-informed proposals described above; the exterior contains no authored cockpit furniture.

After composition approval, the coordinating chat can integrate the selected intact frame and complete live career/offline checks. Preserve this original PNG and correct any later fitting issue in code. Do not regenerate the frame merely to shift a display bezel. Reuse the approved hand/base unchanged.


## Live integration — 2026-11-17

The user approved the complete tier-II collection and requested integration. This definition is now `approved` for live flight in 0.8.2ov. The original selected PNG, reviewed display geometry, navy/white hand, fixed joystick base and control layout are preserved. Shared source, live-flight and offline checks are coordinated in the main chat. Earlier approval boundaries above describe the historical authoring stages.
