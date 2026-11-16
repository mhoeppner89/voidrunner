# Mercury cockpit artwork · v3 — projected console guide

## Shaded perspective blockout · v3

Input 1: `talon-layout-guide-v2.png`, with genuinely projected horizontal deck tops, darker vertical returns, and the slightly lower radar plus hyperdrive mounting forehead. Input 2: rejected `output/cockpit-art/talon-paint-v2.png` as finish reference only; its corner geometry is rejected.

Exact prompt:

> Use case: sketch-to-render.
> Create the finished transparent Mercury cockpit structural overlay using IMAGE 1 as the exact SHAPED AND SHADED GEOMETRY MOCKUP. Image 2 is only a pixel-art/material finish reference, not a geometry reference. In particular, do NOT copy Image 2's flat lower corner panels.
> The important correction is the three-dimensional junction between the side consoles and the monitor bank. The monitor bank is an upright front-facing cabinet. The light blue-grey surfaces at its lower LEFT and RIGHT in Image 1 are HORIZONTAL DECK TOPS seen in perspective, projecting toward the pilot. The dark narrow surfaces beside them are their VERTICAL INNER CABINET SIDES, continuing downward out of frame. These are genuinely different planes, meeting the upright monitor bank in clear, physically believable right-angle corner joints. A small chamfer/seam can explain the junction. Do not paint them as one flat triangular face sharing the monitor fascia's orientation. Do not put a front-facing picture-frame border around a triangular panel. Do not continue an ivory monitor bezel diagonally across a horizontal console top.
> FOLLOW THE ACTUAL PROJECTED FACES in Image 1. Preserve which faces are top-facing and which face sideways. Keep the foreshortening, narrowing edges and occlusion at the monitor cabinet. The thin guide lines indicate the deck perspective; replace them with at most one subtle correctly receding service seam, not a painted grid. Broad calm top planes with coherent overhead highlights; much darker recessed vertical side returns. No black/transparent gaps between these structural surfaces and the monitor cabinet. Near edges of the side consoles continue below the bottom crop. They will carry the existing joystick base and mobile controls later: do NOT draw those controls.
> Geometry: same 1851x850 very wide landscape canvas and same framing as Image 1, no crop, zoom or margins. One continuous slim curved upper canopy bow, two thin lower diagonal jambs, connected three-monitor bank and low side consoles. Preserve the enormous open view. The centre monitor has been intentionally lowered and its upper housing raised to leave a solid blank mounting area for the live hyperdrive button. The central housing begins at y560; outer housings begin y584. This is intentional.
> CRITICAL monitor cutouts: LEFT x416 y625 width318 height184; CENTRE x800 y641 width270 height182; RIGHT x1135 y625 width304 height184. All three are axis-aligned rectangular TRANSPARENT holes. Exact positions and sizes as Image 1; never reposition or tilt them. Leave the central housing's forehead solid, empty dark metal, without a painted button or label.
> Finish: match the excellent clean high-definition Wing Commander-era pixel art, navy/charcoal structural metal, thin warm ivory monitor trim, subdued slate highlights, small restrained amber lamps and a few well-placed fasteners from Image 2. Believable metal thickness and bevels, controlled pixel clusters, readable planar shading, restrained wear. The mockup's light/dark face colours communicate shape, not the final paint colour. Preserve its SHAPE while applying this finish.
> Transparency: the windshield, outside of the frame and three monitor holes must be genuine alpha. No glass tint, glass reflections, stars, planet, scene, black backdrop or coloured background. Structural side cabinets themselves remain opaque.
> Absolutely no hand, arm, joystick, joystick base, buttons, icons, throttle, control bank, screen graphics, radar markings, reticle, HUD, words, numbers, logo or watermark. All are independent live overlays. Return one complete intact structural frame. Do not divide it into an atlas.


## Slope perspective correction · v2

Input 1: unchanged generated `output/cockpit-art/talon-paint-v1.png`. Input 2: the same approved `talon-layout-guide-v1.png`.

Exact correction prompt:

> Use case: precise-object-edit. Edit Image 1, the transparent Mercury cockpit structural overlay. Image 2 is the already approved geometry guide.
> Change ONLY the lower-left and lower-right sloping hull panels outside the three monitor housings. Preserve the upper curved canopy bow, diagonal canopy jambs, monitor bank, monitor apertures, all other pixels, lighting style, palette, existing alpha transparency and canvas framing.
> Problem to correct: the lower corner panels currently read as broad flat vertical triangular walls, with inconsistent perspective. They must read as shallow TOP surfaces seen obliquely from the seated pilot, receding away from the lower foreground toward the monitor bank, with their near/front edges continuing below the bottom of the image. They are the surfaces that physically support the separate joystick and right controls, not front-facing decorative wings.
> Perspective: use one common vanishing point near x926,y340 on this approximately1851x850 canvas. Fore-aft panel seams and shallow ribs must converge toward that same point, symmetrically, and disappear behind the monitor housings. Render believable foreshortening, a thin near edge only if it is within the crop, readable top-plane highlights and dark recessed side returns. Keep it restrained: broad clean planar metal, one or two appropriately converging service seams, no dense greebles and no big upright triangular wall. There should be no horizontal decorative face-on inset stripe running across each slope.
> Restore the EXACT small sloped outline from Image 2: left upper edge from approximately x0,y765 to x398,y584; right upper edge from x1851,y765 to x1457,y584. The previous painted outer corners sit too low, around y830; bring their upper edges back to the y765 guide. Keep the front edges of these shallow surfaces below the bottom crop. Preserve the monitor housing attachments at y584. Do not extend the panels upward into the windshield or add a larger dashboard.
> CRITICAL invariants: three axis-aligned transparent rectangular monitor openings stay fixed to the approved guide: LEFT x416 y625 width318 height184; CENTRE x800 y627 width270 height182; RIGHT x1135 y625 width304 height184. Keep these interior rectangles fully clear alpha and preserve their placement. No moving, resizing, tilting or reshaping instruments. Do not add hands, joystick, joystick base, throttle, buttons, icons, text, stars, background, glass tint, extra screens, beams or objects. Those are separate existing overlays.
> Keep the excellent crisp handcrafted high-definition Wing Commander-era pixel art, navy/charcoal metal, thin warm ivory trims, restrained wear and small amber lights. Genuine transparent background. Same wide landscape canvas, no crop, no zoom, no recentering. Only fix the two lower panel surfaces and their small outline correction to the supplied guide; everything else must remain unchanged.

## Initial generation

Built-in image_gen, transparent background enabled. No CLI/API fallback.

Input 1 (strict layout): `talon-layout-guide-v1.png`, exported from the approved Mercury layout 02. Canopy, sloped panels and monitor openings only; no controls, hand or readouts.

Input 2 (finish only): `wayfarer-paint-atlas-v2.png`, the approved starter frame. Geometry comes exclusively from input 1.

Exact prompt:

> Use case: sketch-to-render.
> Asset type: production transparent pixel-art cockpit STRUCTURAL OVERLAY for the Mercury fighter in a browser spaceflight game.
> Image 1 is the APPROVED GEOMETRY GUIDE, with absolute priority. Image 2 is a MATERIAL/PIXEL-ART STYLE reference only; do not copy its angular canopy or change Image 1's layout.
> Create a beautiful finished cockpit frame by painting the structure in Image 1, preserving its exact canvas, framing and silhouette. Canvas is 1851 x 850 pixels, very wide landscape. Keep the structure aligned to Image 1 without cropping, zooming, reframing, recentering or adding margins.
> Geometry invariants: one slim continuous smoothly curved upper canopy bow, two slim diagonal lower jambs joining the outer monitor housings, and the low sloping hull panels at bottom left and bottom right exactly as in the guide. Keep the huge open space view and calm small side panels. The three monitor glass openings MUST stay rectangular, axis-aligned and pixel-exact: LEFT x416 y625 width318 height184; CENTRE x800 y627 width270 height182; RIGHT x1135 y625 width304 height184. These three holes are fixed. Do not alter their sizes, shapes, relative spacing or positions. Do not paint inside these holes. The console housing begins at y584. Keep the narrow junctions supporting the monitors; no extra beams, no upper crossbar, no extra screens.
> Style: excellent handcrafted high-definition Wing Commander 2 era cockpit pixel art, crisp controlled pixel clusters, clear broad shaded metal planes, coherent bevels, restrained detail, carefully placed fasteners and a few service seams. Match the polish and readable navy/ivory materials of Image 2, but this is a lighter purposeful fighter cockpit: dark charcoal/navy structural metal, warm ivory thin bezel trim, subtle cool slate/teal accents, very small restrained amber indicator glints. Thin rounded canopy bow with realistic metal thickness and gentle inner edge highlights. Lower sloping panels should visibly connect the monitor bank and future left joystick mount to the hull. They should be low and understated, not huge boxes. Lighting from upper left, deep but readable recessed edges, restrained wear. No random speckle, noisy texture, dithering, fuzzy shading, blur or photorealistic rendering.
> Transparency: all dark blue empty background regions in Image 1, the whole windshield, the areas outside the structural frame, and all three black monitor interiors must be genuinely transparent alpha. Do not draw a black backdrop, glass tint, glass reflections, sky, stars or a scene beyond the window. The frame should be a clean cutout. Preserve transparency through the narrow spaces between monitor housings.
> Absolutely no hands, arms, joystick, joystick base, throttle, buttons, touch pads, control symbols, HUD, reticle, radar graphics, screen graphics, text, numbers, names, labels, logos or watermark. Those are separate existing live overlays and must not be baked into this frame. Image 1 deliberately contains ONLY the monitor and canopy/hull structure. Return only the finished intact structural frame at that same geometry and aspect ratio.


## Earlier v2 integration

Selected correction output: `talon-paint-v2.png` (1850×850 RGBA), copied unchanged from built-in imagegen output `exec-a7132a5a-5d25-4b4b-8df2-a634b51ebeb6.png`. The first draft is retained only under ignored `output/cockpit-art`; its original is also in the generated-images archive. No programmatic repainting or bitmap editing.

The approved layout remains 1851×850. The full image is mapped to that existing frame, with a static even-odd SVG clip at the exact three approved monitor openings; small generative edge errors cannot move, resize or cover the live glass. Existing glass underlap covers edge antialiasing. The complete frame is otherwise intact. The shared navy/white hand strip and fixed base sprite are reused byte-for-byte at their approved anchors.

Layout was approved before generation. This composition remains `art-review` and is not enabled in live Mercury flight until approved.


## Selected output · v3

`talon-paint-v3.png` (1850×850 RGBA), copied unchanged from built-in output `exec-dd7c24d3-5a79-48fe-9ea6-1c579f765c70.png`. This supersedes v2. The v2 file is retained only in ignored output and the original generated-images archive. No programmatic bitmap editing.

The new `talon-layout-guide-v2.png` uses projected coplanar deck geometry, darker vertical inner cabinet returns, bevels and foreshortening lines. It contains no hands, joystick base, buttons or readouts. The radar aperture is now y641 (14 source pixels lower); its dimensions are unchanged. Its housing starts y560, and the live hyperdrive button ends at y633, with an 8-source-pixel gap before the radar glass. Outer monitors and all other controls retain their previous geometry.

The complete selected image still uses the locked aperture stencil. The existing navy/white hand and fixed base are unchanged, separate overlays. Composition remains in review.


## Current geometry and presentation

The v3 guide comes from `consoleGeometry.js`: an upright z=1 monitor fascia, coplanar deck tops extending toward the pilot, narrow bevels and dark vertical cabinet returns that close the space below the decks. Faces are projected with one perspective camera. The guide makes this junction explicit rather than relying on textual instructions to reinterpret a flat triangle.

The selected v3 PNG remains unchanged. Its radar and forehead use the revised placement above. A nine-source-pixel hidden underlap, with matching padding, covers the measured 7px excess alpha opening at the right bezel; the visible readout rectangles remain fixed. The aperture stencil keeps generated paint out of those rectangles.
