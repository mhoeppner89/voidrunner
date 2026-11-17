# Tyr / Alliance line fighter — artwork review

Status: `art-review`. The user approved proceeding from the layout to artwork on 2026-11-16. The painted composition is available through the shared `PaintedCockpit` renderer and remains inactive in live flight pending composition approval.

Review: [Tyr cockpit](http://127.0.0.1:4212/output/cockpit-layout/index.html?hull=legionary). The model comparison is available through **Review controls → actual exterior canopy**. Desktop and phone presets are real iframe viewports.

## Model evidence

Source: `assets/models/ships/legionary.glb`. `LEAGUE_HULLS.legionary` identifies Tyr as the tier-2 Alliance Line Fighter. The GLB scene is named “Legionary — narrow nested frame and complete lower drives.” The mesh node has no transform, so its accessor positions are already hull-native coordinates.

**Native +Z is forward, +Y is up, and X is the lateral axis.** Four `Engine_*` markers are at z=-.994274/-.992. The four muzzle markers are at z=.617564/.512867. `Rear_PDC_Mount` also explicitly records outward `[0,0,-1]`. These independent markers establish orientation; +X is not assumed to be forward. Viewed toward +Z, native +X projects screen-left.

The hull mesh has two primitives. Primitive 0 is the packed **Alliance · steel charcoal ochre PBR** armor. Primitive 1 uses the exact dedicated material **VR_Canopy_Glass**. Its 164 accessor vertices describe six closed pane solids, 72 triangles total; each outer quad has two outward triangles, two inward triangles and eight edge triangles. The inner surfaces are offset -.003 in native Y. There is no shared sensor or armor in this material, and no UV filter or substituted triangle geometry is required.

Selected glass bounds, before rounding: x ±.0777835473, y .0186580699–.1059093475, z .1871255189–.4777782857. The survey also supplies a slightly padded bounding box `[-.078,.018,.187]` to `[.078,.106,.478]`. The cyan reference overlay and guide edges use this same material/bounds selection. Inspected close-up, forward/above and whole-ship views confirm that cyan covers the actual six inset canopy panes, including their thin closure surfaces, and no surrounding armor.

Measured exterior quad corners below are in native GLB units, rounded to six decimals. Each row is an ordered perimeter; the opposite-X side panes are mirrored exactly.

| Pane | Exterior corners `[x,y,z]` |
| --- | --- |
| Aft roof | `[-.027948,.105909,.187266]`, `[-.026979,.101091,.307720]`, `[.026979,.101091,.307720]`, `[.027948,.105909,.187266]` |
| Front windscreen | `[-.027281,.100012,.312181]`, `[-.020451,.025006,.477778]`, `[.020451,.025006,.477778]`, `[.027281,.100012,.312181]` |
| Negative-X aft side | `[-.029689,.104879,.187126]`, `[-.077784,.034595,.226492]`, `[-.073205,.032359,.308058]`, `[-.028917,.099756,.308035]` |
| Positive-X aft side | Same four positions with positive X, reversed winding |
| Negative-X front side | `[-.028363,.099627,.312057]`, `[-.073152,.031362,.312324]`, `[-.048830,.021658,.477594]`, `[-.021610,.024562,.477642]` |
| Positive-X front side | Same four positions with positive X, reversed winding |

Full precision vertices, indices, triangles and source node metadata are retained in ignored `output/cockpit-layout/legionary/glb-survey.json`.

## Proposed interior

Eye `[0,.035,.19]`, look `[0,.035,1.19]`, vertical FOV 64°. This is a proposed centerline seat beneath the aft roof, not an authored seat marker. The comparison targets `[0,.06,.32]`.

The visible bow follows the front panes' transverse rear seam around z=.312: screen-left lower `[.073152,.031362,.312324]`, left roof `[.028363,.099627,.312057]`, right roof `[-.028363,.099627,.312057]`, right lower `[-.073152,.031362,.312324]`. It is one ordered, connected three-segment bow. `continuousBow:false` preserves the straight roof and raked fighter posts; no Mercury curve or another hull's outline is substituted. Thin proposed lower jambs join its ends to the outer monitor housings.

The exterior is too narrow for the approved instrument composition at a literal projection. The review explicitly applies **1.75× horizontal stretch and .9× vertical stretch** to the surveyed ribs. The latter leaves the top-center comms clear on phones. The shared 1851×850 authored plate then scales with the approved viewport layout. This is an interior visibility adaptation, not a claim that the exterior contains a finished, dimensionally literal cockpit. Projected bow points in the review's 1600×900 guide are approximately `(184.73,469.28) → (560.92,106.82) → (1039.08,106.82) → (1415.27,469.28)`.

The approved unpainted guide uses the original own/target positions and sizes, radar y641, a swept hyperdrive forehead starting at y560 and hyperdrive bottom y633. The shared perspective decks, bevels and cabinet returns support the monitor bank and stick. The painted-opening fit is recorded below; the original structure-only guide is retained unchanged.

The navy/white three-pose hand strip and separate fixed base are reused unchanged. The common rig offset is -60 source pixels in X, independent of the original touch area. Stick, throttle and right-bank controls retain their approved geometry and hit extensions. The right bank and narrow throttle are phone-only; touch starts neutral. Hand visibility, top-center comms and aligned upper corner controls use production CSS and DOM. The same hyperdrive control mounts to the painted cowl face in the artwork review.

## Unpainted layout verification and evidence

Built with `node tools/playtest/cockpit-layout.mjs`. Final focused check passed for desktop and small, one browser profile at a time:

```sh
VR_REVIEW_legionaryS=legionary VR_REVIEW_HULLS=legionary VR_PROFILES=desktop,small node tests/browser/cockpit-layout.mjs
```

`VR_REVIEW_HULLS` is the existing test's hull selector. The check covers shared production rendering, measured glass underlap, phone-only controls, fixed anchors, keyboard/controller/touch steering, neutral initial contact, expanded boost input, cargo navigation, the actual GLB comparison, and unchanged save/settings storage. An initial desktop run missed the existing 180ms keyboard threshold under concurrent load; the retry and final desktop/small run passed. No shared input/test code was changed.

Additional ignored driver `output/cockpit-layout/legionary/evidence.mjs` passed separately for desktop and small with muted Chrome and the required sandbox flags. Actual inner viewports were **1440×900** and **667×375**; the existing check also verified the 844×390 phone preset. Evidence JSON and screenshots are under `desktop/` and `small/` in that output directory.

- Navigation, combat and salvage: original live readouts/radar inspected in each viewport.
- All nine pitch/yaw combinations: screenshot inspection plus exact transformed-anchor checks; pivot drift below .1px, mount unchanged.
- Every opaque pixel touching each source pose's crop boundary was transformed into screen space. All remained outside the viewport at every steering combination, so no sleeve cut edge is exposed.
- The entire conservative base bounding rectangle lies inside the projected left deck polygon. Desktop bounds are approximately x89.64–142.54, y868.01–891.18; small-phone bounds x40.69–67.80, y358.60–370.48. The complete base stays visible and clear of the sloping inner edge.
- A deterministic 500ms keyboard action also reached full yaw on both profiles. Captures reported no page errors.

### Shared small-phone readout concern

The final 667×375 salvage screenshot exposes a shared typography/overflow issue, outside the owned hull files. The target aperture is the unchanged approved size: approximately 109.53px inner width and 81.17px inner height. `#screen-target-readout` uses the shared 10px centered flex text with `white-space:nowrap; overflow:hidden` (`src/style.css`, `.screen-target-readout` and the compact target overrides). “FIRE TO RELEASE CARGO” needs a 121px scroll width in a 110px client width, so both ends clip instead of wrapping. The navigation hint uses the separate `.is-hyperdrive-status` wrapping rule and fits.

The shared `#game-shell .screen-target-contents` rule uses a 13px font, 1.15 line-height, 3px vertical padding, 2px flex gap and `overflow:hidden`. “4 units remaining” wraps beneath “Coolant”; the contents need 40px scroll height in a 32px client height. The last line extends to y361.39 while the contents clip ends at y356.91. Measured CSS, boxes and scroll dimensions are in `output/cockpit-layout/legionary/small/readout-overflow.json`; `small/salvage.png` shows the result. Fixing shared responsive readout sizing/wrapping belongs to the coordinating chat. No monitor was enlarged and no renderer/CSS workaround was added here. Navigation, combat, controls, deck and hand checks pass; this limitation should remain visible for the approval review.

The unpainted layout was subsequently approved for artwork by the user's generation request. Painted composition approval remains outstanding; no flight activation, commit or push has been performed.

## Generated artwork and code fit

Selected frame: `assets/cockpits/legionary-paint-v2.png`, 1850×850 RGBA. It is byte-identical to built-in imagegen output `/Users/mhoeppner/.codex/generated_images/01a1e60c-0d3a-7f41-bb75-c6a34ba99084/exec-39c56749-799f-4232-879a-1b19fc93ad7d.png`, SHA-256 `94e58874a5196d02ca6c682d8065ef4c7d54999919fffe56d5173b3e746b3de4`. No local bitmap editing, resizing, corrective stencil or separate reconstructed bezels. The retained exact guide is `assets/cockpits/legionary-layout-guide-v1.png`; it contains only structural beams, holes and shaded console surfaces, without hand/base, gameplay controls or live readouts.

Tyr's finish is gunmetal/charcoal and brushed steel with restrained ochre hull stripes and latches. It uses inset avionics cassettes on the left, knurled trim wheels and connectors on the right, perforated vertical cooling grilles, clipped conduit and layered rectangular corner reinforcements. These replace the rounded ivory Mercury hardware, Loki's light-interceptor fittings and Balor's red raider finish. The horizontal deck planes recede toward the monitor fascia; equipment foreshortens with the supporting plane, and dark cabinet returns attach the decks to the bank. The left forward deck remains clear for the unchanged fixed base.

The initial generation raised the upper bow enough to touch the small-phone comms label. One targeted built-in image edit corrected the upper-bow silhouette toward the approved guide, retaining the lower console's detailed design. The console tops remain slightly raised relative to the unpainted guide. The frame retains the angular six-sided outline, open view, centered bank and console perspective. It is presented for composition approval rather than described as a pixel-exact reproduction of the blockout. The first unapproved original is retained under ignored `output/cockpit-layout/legionary/art/legionary-paint-v1-candidate.png` (initial output `exec-eeeee1f1-05d1-41b1-b987-5e2245f45f1f.png`, SHA-256 `323d2b16ff0ae2e596a3c5183ae553481c5de1ce9d25b7ebc16b09e99d0497f6`).

Alpha openings measured at alpha <40 (bounds are exclusive at the right/bottom):

| Opening | Original PNG bounds | Alpha centroid |
| --- | --- | --- |
| Own | x443–714, y621–772 | 578.504, 696.640 |
| Radar | x808–1043, y643–786 | 925.581, 714.422 |
| Target | x1138–1410, y621–772 | 1274.495, 696.540 |

The factory preserves the approved 318×184 / 270×182 / 304×184 backing sizes, centers them within two source pixels of these original holes (accounting for the shared 1851px reference width), and applies content insets to clear the beveled gaskets. Own position is 418.71/605.89, radar 790.52/623.47, target 1122.39/605.94. Insets are own 24/17, radar 18/20 and target 17/17. Hyperdrive bottom fits at y599 on the cowl's quiet front face, above the radar's upper frame; its original DOM, appearance and interaction remain in use. `stickClearanceX:416` locks the original touch/rig layout independently of these display-fitting adjustments. Source hand/base, anchors, scale, -60 common rig offset, right pads, narrow throttle and hit extensions are unchanged.

Hand SHA-256 remains `a9dbdf864e021aa537b6b7a89a8b488a4bb9afde627962874d7c37c4628f287b`; fixed-base SHA-256 remains `7211d09f7742f6bf687ea0584c6363e1c42742b5223e033b8ab39ac4e45071d0`.

### Artwork verification

The shared test currently recognizes PNG artwork only for Mercury/Balor/Loki. It would classify Tyr as an unpainted SVG and reject it before its input checks. Shared tests were left untouched. An ignored copy at `output/cockpit-layout/legionary/art/review-check.mjs` changes only helper/output paths and recognizes Tyr's PNG with `art-review` status, 72 glass triangles, three bow segments and a hyperdrive/radar separation assertion. All existing alpha flood-fill, display centering, original-frame/no-stencil, keyboard/touch/controller, neutral-touch, hit extension, viewport, storage and model-reference checks remain in that copy.

Passed sequential desktop Chrome, Android Chrome, iPhone WebKit and small-phone profiles with muted audio:

```sh
VR_REVIEW_HULLS=legionary VR_PROFILES=desktop,android,iphone,small node output/cockpit-layout/legionary/art/review-check.mjs
```

Reports and composition captures: `output/cockpit-layout/legionary/art/checks/`. The separate `art/evidence.mjs` passed navigation/combat/salvage and all nine pitch/yaw poses in real 1440×900 desktop and 667×375 small-phone iframes, with fixed pivot/base, source-cutoff exclusion and deck-support checks. Evidence is under `art/review/`. Compared final evidence JSON with the approved unpainted review: `hand`, `mount` and `stick` geometry are exactly equal on desktop and small phone. The corrected roof leaves the phone comms label clear.

The previously documented shared small-phone salvage text clipping remains. The painted own-screen opening also exposes a narrowest-phone fuel-row limitation: the 318px backing minus 24px insets on each side gives 270 source pixels (about 97.3 CSS pixels at 667px width). At the current minimum shared flight-row font, the fuel row truncates to `FUEL 1…`, despite its actual value staying 100. Android/iPhone and desktop captures show the full value. The original PNG's smaller holes are preserved, and code must not extend text over their opaque bevels. A shared responsive text-fit adjustment is needed for the smallest phone; CSS/readout ownership remains with the coordinating chat. This limitation is visible in `art/checks/small-legionary.png` and `art/review/small/navigation.png`. No shared renderer/CSS changes or live activation were made here.

### Exact generation prompt

Built-in imagegen, `transparent_background:true`, initial generation followed by the targeted upper-bow edit below. Reference paths for initial generation in order: `output/cockpit-layout/legionary/art/monitor-beam-guide-legionary.png`, `output/cockpit-layout/legionary/desktop/model-canopy.png`, `assets/cockpits/talon-paint-v4.png`. The first is structural authority; the second is hull identity; the third supplies finish quality only.

```text
Use case: stylized-concept / sketch-to-render.
Asset type: ONE complete transparent RGBA cockpit structural overlay for TYR, the Alliance frontline fighter in Voidrunner. Create high-detail finished game artwork from the approved structural layout.

INPUT ROLES:
Image 1 is the EXACT approved Tyr structure and perspective guide. It controls the canvas, angular canopy outline, monitor positions, console top planes, bevels and dark VERTICAL cabinet returns. Its dark blue background and black monitor interiors mean ACTUAL TRANSPARENT EMPTY SPACE in the finished image.
Image 2 is the actual Tyr exterior/canopy reference, for identity only: purposeful steel-charcoal Alliance line fighter with restrained ochre trim, narrow faceted glazing. Do not paint the ship exterior or screenshot UI.
Image 3 is Mercury's existing cockpit, reference ONLY for finished quality, dimensional hand-painted retro-game illustration and hardware detail density. Tyr must have its OWN construction and equipment design, NOT Mercury's curved bow, rounded screwcaps, ivory monitor rims, lamp placements, toggles/knob panels, red cables or vent arrangement.

LOCKED GEOMETRY: wide 1851x850 composition, use the WHOLE canvas without zoom/crop/reframe. Preserve exactly Image1's sharp six-sided open fighter canopy. Its ordered bow runs from (214,443) to (649,101) to (1202,101) to (1637,443), with lower jambs to (398,584) and (1457,584). Thin straight structural beams only, no rounding, no extra center post, roof panel, crossbar, tinted glass or filler across the view. Preserve the large clear view. Use folded gunmetal box-section rails with slim machined edges and small flush fasteners. Small angular canopy catches sit at the lower existing joints, not floating over the view.

THREE MONITOR APERTURES: left x416 y625 width318 height184; center radar x800 y641 width270 height182; right x1135 y625 width304 height184. Actual alpha holes, no screens, no readouts, no black fill. Preserve each aperture's orientation, approximate exact size and center, only tiny clipped corners. Build layered bezels OUTWARD around these openings. Complete lower rims remain visible under all three holes, center rim y823..842. The bank is centered across the lower third. Outer housings begin y584. Center cowl starts y560 with shallow swept shoulders and a visible slim roof top. Its front face x800..1070,y570..633 is quiet dark metal for the separate existing hyperdrive button. Do not paint a hyperdrive button or label into it.

PERSPECTIVE IS CRITICAL: Copy the approved grey shaded deck surfaces in Image1. They are horizontal console TOPS receding away toward the monitor bank, not vertical triangular panels. The narrow dark INNER CABINET RETURNS are vertical below those deck tops, reaching the image bottom. Maintain their joints and clear dimensional bevels. All hardware, inset panels, seams and fastener rows must foreshorten along the supporting surface, consistent with the same central viewpoint. Keep the forward LEFT deck around x90..225,y785..850 clean, flat and unobstructed for the existing separately composited fixed joystick base; no painted socket, cable, protruding knob or joystick there.

TYR IDENTITY: a purposeful well-equipped military line fighter, more substantial avionics than a light interceptor, clean and serviceable rather than ruined. Gunmetal gray and cool charcoal shells, dark graphite seals, brushed steel brackets and restrained mustard-ochre identification stripes linked to its hull. NO dominant ivory display rims or red weathered pirate trim. The detailed monitor frames use compact stepped rectangular steel corner reinforcements and black elastomer gaskets, with flush quarter-turn captive fasteners. Distinct left/right equipment: left rear deck gets inset rectangular combat-avionics cassettes with locking tabs and a tiny guarded selector group; right rear deck gets a compact bank of knurled trim wheels aligned in perspective, recessed diagnostic connectors and orderly small status lamps. Both are small and only on the existing deck surfaces. Put fine hex/perforated cooling grilles and ribbed conduit channels into the vertical returns, with one disciplined clipped wiring loom disappearing behind a housing. Add angular quick-release canopy latches, shallow machined maintenance covers, connector caps, tiny recessed red/amber/green indicator groups, gasket seams, subtle steel edge wear, small contact shadows and layered panel depth. Functional medium-sized hardware groups with calm metal between them; high detail must not mean random greebles or more occlusion. Do not repeat Mercury's hardware groups.

STYLE AND LIGHTING: polished handcrafted retro spacecraft game-sprite illustration in the same visual quality family as Image3, crisp and richly detailed at full resolution. Controlled cool overhead/upper-left light, strong dimensional beveled edges, deep cabinet shadows, sparse warm local lamps. Clean precise painted surfaces with selective fine machining texture. No blurry concept-art brushwork, noisy grain, overdone dithering, photographic rendering, excessive bloom or lights scattering over the canopy. Keep the rails thin.

SEPARATE EXISTING OVERLAYS MUST BE OMITTED COMPLETELY: no hand, arm, sleeve, pilot, joystick, stick base, throttle lever/slider, big fire/missile/boost buttons, pause/fullscreen controls, comms or wing UI, reticle, telemetry, radar, text, numbers, logos or watermark. Small static physical hardware is wanted, but existing game controls and pilot rig will be composited unchanged later.
Return a SINGLE complete transparent structural frame; no montage, no atlas, no space scene, stars, planets, opaque sky or fake checkerboard. Windshield, screen holes and all areas outside structural parts must have genuine alpha transparency. Structural metal itself is opaque.
```

### Exact upper-bow correction prompt

Built-in imagegen, `transparent_background:true`. Inputs: initial Tyr frame and the unchanged approved Tyr guide. This was a canopy-composition correction; no monitor-fitting regeneration followed.

```text
Use case: precise-object-edit.
Image 1 is the current detailed transparent TYR fighter cockpit frame. Image 2 is its approved original structural guide.
Make ONE targeted canopy-composition correction to Image1. Preserve its gunmetal/steel/ochre detailed finish, ALL lower console artwork, every monitor bezel and transparent hole, the swept center cowl, latches, electronics, switches, wires, grilles, deck perspective, cabinet returns and clear joystick deck landing area as closely and exactly as possible. Do not simplify, repaint, rearrange or redesign the lower console. No change to its monitor apertures or cowl.

The current TOP CANOPY BOW sits too high and its top roof is too wide compared with the approved structural guide. This causes a live phone comms label to overlap the roof. Use Image2 to correct ONLY the upper straight beam geometry on the same 1850x850 full canvas: roof beam centerline from approximately (649,101) to (1202,101), not its current y56; raked side beams meet the outer shoulder corners at (214,443) and (1637,443), not their current y400. Preserve the thin painted folded steel beam cross-section, restrained worn highlight, small flush fasteners, angular geometry and open central visibility. Lower short jambs should reconnect naturally to the existing lower ochre latch assemblies WITHOUT moving those detailed latch assemblies or the whole console. The roof must remain flat/straight, never a curve; no extra beams, roof fillers or central bar. Do not thicken the framing.
Everything else stays Image1. This is an actual upper-bow silhouette correction, not a monitor-fitting pass. DO NOT alter any bezels or display holes. Do not copy the guide's flat grey surfaces into the painting. High-detail complete transparent structural overlay, genuine RGBA alpha in the windshield, three monitor holes and all unpainted/outside regions. No background, stars, glass tint, checkerboard, labels, hand, joystick/base or gameplay controls. Return the full un-cropped image with the entire detailed console preserved.
```


## Live integration — 2026-11-17

The user approved the complete tier-II collection and requested integration. This definition is now `approved` for live flight in 0.8.2ov. The original selected PNG, reviewed display geometry, navy/white hand, fixed joystick base and control layout are preserved. Shared source, live-flight and offline checks are coordinated in the main chat. Earlier approval boundaries above describe the historical authoring stages.
