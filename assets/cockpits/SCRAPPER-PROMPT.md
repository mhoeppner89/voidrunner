# Balor artwork — approved layout and composition

The user approved Balor's unpainted layout on 16 November 2026 and requested detailed, distinctive artwork with careful perspective, preserving the hand, fixed base, monitors and controls. Generated with **built-in imagegen**, transparent background; no API/CLI fallback. The final original PNG is copied byte-for-byte without bitmap editing. The user subsequently approved the composition and requested live integration; Balor is active in flight/preloading from 0.8.2ot with the reviewed geometry unchanged.

## Inputs and selected output

- Structural guide: `scrapper-layout-guide-v1.png`, 1851×850 RGBA, exported from the approved shared `greyboxFrame()` with its canopy survey and perspective-projected console surfaces. It contains no pilot, base, buttons, readouts or background.
- Hull reference: `output/cockpit-layout/scrapper/survey/overview.png`, a rendered view of the actual shipped `assets/models/ships/scrapper.glb`.
- First generated frame: `exec-f06e428a-d286-462c-a1d9-65245eec9cc4.png`; retained under ignored `output/cockpit-art/scrapper-paint-v1-candidate.png`.
- Selected top-rail refinement: `exec-af3ccfb7-a334-4cf0-94a3-97141d24a442.png`, copied unchanged as **`scrapper-paint-v2.png`**, 1850×850 RGBA.
- Both tool originals remain in `/Users/mhoeppner/.codex/generated_images/01a1e5b9-7f72-7032-8a2d-e398fd481f6a/`.

The frame uses charcoal/brick red, angular gunmetal clamps, guarded switch groups, service vents, strapped conduit, replacement access plates and a localized welded repair. The long flat roof and steep side posts follow Balor's native canopy, distinct from the curved navy/ivory Mercury. Receding deck tops and dark vertical cabinet returns retain the approved perspective; the left base landing area stays clear.

## Initial generation — exact prompt

```text
Use case: sketch-to-render. Asset: one complete transparent cockpit structural frame for the Balor pirate fighter in the Voidrunner game. The user approved this exact unpainted layout and requests high-detail cockpit art with convincing perspective and a distinct identity. Generate a finished production-quality frame, not a concept sheet.

INPUT ROLES: Image 1 is the STRICT structural geometry and perspective guide, highest priority. Every silhouette, display opening, mount and deck plane comes from it. Image 2 is ONLY the actual Balor exterior model for hull identity, material language, chipped charcoal/brick-red paint and practical raider character. Do not render the exterior ship, skull emblem, wings or guns in the cockpit. Do not copy the reference image's background.

LOCKED COMPOSITION: wide landscape 1851 by 850 pixel canvas (approximately 2.178:1). Preserve the exact framing and full canvas; the structure touches the bottom and side crop as in Image 1. Keep its thin ANGULAR TRAPEZOID canopy, long straight flat roof, little chamfered roof corners and steep raked side jambs. Do not curve the roof. No additional crossbars, center strut, visor, heavy roof beam or thick border. Protect the large unobstructed transparent forward sightline. Keep the three rectangular display holes and the low console bank in their guide positions: LEFT x416 y625 width318 height184; CENTER x800 y641 width270 height182; RIGHT x1135 y625 width304 height184, on the 1851x850 reference grid. CENTER bottom is y823, fourteen pixels lower than side display bottoms y809. Do not level them. All three interiors must be genuinely transparent, unfilled, straight and facing the pilot. Three displays only.

PERSPECTIVE IS CRITICAL: follow Image 1's explicitly projected shallow horizontal side-deck tops, foreshortening seams, narrow inner-edge bevels and much darker vertical cabinet returns attaching to the upright monitor fascia. Side decks recede from the near bottom corners toward their rear monitor joints around x398/y584 and x1457/y584. They are horizontal surfaces seen from the pilot seat, not giant front-facing triangular plates. Keep top planes distinct from vertical sides through coherent lighting, contact shadows, inset hardware and receding seams. The guide's flat pale grey regions represent surfaces to paint, not empty space to redesign. Keep the left near landing patch around x80..260/y750..850 calm and flat for a SEPARATE existing hand and fixed joystick base; do not paint a base, socket, hand, stick or mounting pedestal there. No device protruding over that patch or sloping edge through its footprint.

CENTER COWL: preserve the swept shoulders flowing into the neighboring monitor housings and the small receding roof at y560. Keep the central mounting face x800..1070/y568..633 plain dark charcoal for the separately rendered hyperdrive button. The cowl is a shallow integrated console forehead, not a square tower. Hardware can occupy its shoulder strips and roof edges, never its blank central mounting face or transparent radar opening.

BALOR IDENTITY AND DETAIL: a compact, purpose-built, repaired pirate raider, with soot-charcoal painted metal, worn muted brick-red bands/panels, restrained gunmetal/silver edge catches and dark rubber seals. Angular layered monitor housings with exposed captive screws, bolted corner braces and recessed inner gaskets; small side service vents, narrow heat-sink louvers and an occasional amber/red status lamp. Give it designed mechanical density from the first pass: several distinct recessed switch/fuse/trim hardware groups on the existing rear deck strips; four small protected gun-circuit modules as a subtle repeated motif; practical canopy hinge/latch fittings at the existing lower joints; short strapped copper/brown braided conduit runs disappearing into cabinet walls; a few mismatched replacement access plates and one localized welded repair seam. Slightly asymmetric service detailing while the approved structural layout stays symmetric. Every switch, connector, seam and vent must obey its mounting plane's perspective. Arrange useful hardware clusters with calm metal between them. Small static switches and knobs ARE wanted; the game's large live action controls are not. Avoid random dots, excessive pipes, decorative sci-fi clutter and broad unused filler panels.

FINISH: high-definition hand-painted retro space-sim game art, crisp readable pixel clusters, controlled edge highlights, tactile dimensional construction, detailed but clean. Coherent soft light from upper left, dark side returns, tiny warm localized lamps, selective edge chipping exposing metal, mild oil scuffs at service joints. Distinguish it from the game's navy-and-ivory starter and rounded Mercury cockpits: charcoal/brick red, faceted brackets, hard straight roof and repairable raider equipment. Do not use broad cream/ivory rims, rounded luxury consoles, glossy clean plastic, photorealism, blur, film grain, heavy dithering or noisy scratches everywhere.

TRANSPARENCY: actual RGBA alpha throughout the open windshield, outside structural surfaces, and inside all three monitor openings. The physical structure remains opaque. No glass tint, reflections or translucent grey panes. No black painted background, checkerboard, space, stars, planet, sky, lighting bloom across transparent areas or ground shadow outside the structure.

NEVER BAKE IN: pilot hand/arm/sleeve, joystick or fixed base, throttle slider, large fire/missile/boost touch buttons, hyperdrive button or label, radar, live screen readouts, HUD, reticle, words, numbers, logos, skull symbols or watermark. Those elements already exist as separate overlays and must retain their approved positions and source artwork. Return ONE intact highly detailed transparent frame matching Image 1's structure exactly.
```

## Top-rail refinement — exact prompt

Input: the first generated frame only. This fixes a real structural silhouette problem: the first roof rail occupied source y0–34 and crossed the desktop comms label. The refinement reduces its central lower edge to about y21–22. It is not a monitor-alignment regeneration. The original detailed console artwork is retained; small incidental subpixel aperture differences were measured and accommodated in code.

```text
Use case: precise-object-edit. Target: the attached complete transparent Balor cockpit frame. Make ONE small structural correction only: the straight horizontal TOP canopy rail is too thick at the top center and must leave clear transparent space for an existing comms overlay below it. Retain this excellent detailed artwork otherwise.

On this 1850x850 canvas, make the long STRAIGHT horizontal upper roof rail between x475 and x1375 a slim 14-pixel-tall beam wholly within y0..14, with transparent alpha beneath y15 through y45 in that central span. Keep it level and straight, not curved. Let its two end chamfers join the existing corner fittings smoothly outside that central span. The current thick lower rail edge near y30 must be removed so that the windshield reaches up to y15 at the center. This is a real canopy-beam silhouette correction, not a monitor edit. Preserve its charcoal/gunmetal metal, restrained chipped brick-red strip, fine highlights and a few screws at the smaller scale. No thick red ridge above it. Keep the full canvas dimensions exactly 1850x850.

Everything outside that TOP horizontal beam and its tiny end transitions MUST remain unchanged: all diagonal canopy posts, lower jambs and hinges, the complete detailed consoles and projected deck planes, chipped paint and welded repair seam, vents, switches, knobs, three monitor bezels and transparent holes, central swept hyperdrive mounting face, framing and crop. DO NOT move, resize, repaint, reshape or fill any monitor opening. DO NOT simplify, regenerate or blur any of the console detail. DO NOT change perspective or camera. Keep all existing alpha/transparency apart from the explicitly thinned top beam. No hand, joystick/base, live controls, words, labels, displays, reticle, background or additional objects. Return the complete intact transparent frame with only the top beam thinned upward.
```

## Live content fitting

`src/game/cockpits/scrapper.js` keeps the approved live display widths/heights (318×184, 270×182, 304×184), hand assets, base, scale, pivots, rig offset and touch geometry. Small position corrections center these unchanged live rectangles on the generated openings; internal content insets protect the deep seals. `stickClearanceX:416` preserves the original touch target independently of those readout corrections. No aperture stencil, image cropping, bezel reconstruction or pixel editing is applied.

Final source-alpha flood fills at alpha <40:

| Opening | Native PNG bounds, exclusive right/bottom | Transparent-area centroid |
| --- | --- | --- |
| Own | x434–718, y628–788 | 575.9694, 707.9920 |
| Radar | x805–1048, y656–811 | 926.5466, 733.1371 |
| Target | x1136–1417, y628–788 | 1276.8864, 707.9903 |

The generated canvas is 1850px wide while the approved layout coordinate system remains 1851px. Both scale together to the actual viewport; verification accounts for that ratio. All original holes fit within their live backing rectangles, with centers within two source pixels. The displayed monitor canvases still use their actual CSS backing dimensions through the existing production renderer.

Review: <http://127.0.0.1:4212/output/cockpit-layout/index.html?hull=scrapper>. All five focused unit checks and the desktop/Android/iPhone/small-phone shared review checks pass. The user authorized the two shared test updates for the artwork stage. See the hull README for detailed verification.
