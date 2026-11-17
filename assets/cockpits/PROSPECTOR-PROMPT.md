# Gaia artwork — built-in imagegen

The user approved the unpainted layout and requested detailed, distinctive cockpit artwork. Generated using the built-in imagegen tool with transparent background. The selected original output is preserved byte-for-byte as `prospector-paint-v2.png`; no aperture stencil or bitmap edits. Hand/base, gameplay controls and live instruments remain separate and unchanged. Composition awaits approval before live activation.

Input roles:

1. `prospector-layout-guide-v1.png`: approved exact structural layout and perspective, exported by the shared structural guide code. Beams, monitor openings and shaded console faces only; no hand/base, controls or telemetry.
2. `wayfarer-paint-atlas-v2.png`: approved starter reference for crisp retro painted sprite finish only, not architecture or repeated hardware.
3. `output/cockpit-layout/prospector/artwork/prospector-model-reference.png`: clean capture of the actual shipped Gaia GLB, for industrial identity only. Cyan is glazing survey annotation.

First output: `/Users/mhoeppner/.codex/generated_images/01a1e60b-c3d8-7383-a8e6-b8116d8b024d/exec-79589952-61c9-4320-a6ca-2570a939619c.png`, retained in ignored `output/cockpit-layout/prospector/artwork/prospector-paint-v1-candidate.png`. Its thick inward bezels reduced the approved usable display area, crowding small-phone combat text. A single composition revision opened the windows back out. Remaining raster aperture differences are fitted in code.

Selected output: `/Users/mhoeppner/.codex/generated_images/01a1e60b-c3d8-7383-a8e6-b8116d8b024d/exec-e20f136b-84cd-4c8d-841d-f12311b6f9f1.png`. The selected original 1850×850 RGBA is copied unchanged to `prospector-paint-v2.png`. The second input for this revision was `prospector-aperture-guide-v1.png`, exported from the original approved layout with cyan rectangles marking the required open display area; it contains no hand/base, gameplay controls or telemetry.

## Exact prompt

```text
Use case: stylized-concept / sketch-to-render.
Asset type: ONE complete transparent painted structural cockpit overlay for Gaia, the tier-2 BP-2 industrial Rock Hauler in the game Voidrunner. This is production game artwork assembled with separate existing live instruments, pilot hand, fixed joystick base and gameplay controls.

INPUT ROLES:
Image 1 is the EXACT APPROVED GAIA STRUCTURAL GUIDE. It controls the whole canvas, thin angular canopy, monitor apertures, swept central forehead, horizontal receding side-console top planes, bevels and dark VERTICAL cabinet returns. The dark navy backdrop and black monitor interiors represent EMPTY ALPHA TRANSPARENCY in the output. Preserve the guide's perspective and composition.
Image 2 is the approved starter frame, a STYLE REFERENCE ONLY for crisp handcrafted retro painted sprite quality and coherent navy/ivory material finish. Do not copy its architecture, repeated frame hardware or layout.
Image 3 is the ACTUAL GAIA EXTERIOR MODEL, an IDENTITY REFERENCE ONLY: heavy industrial navy/ivory pressure barrel, brass service trim, useful machinery and faceted roof/side glazing. Cyan highlights are survey markings, not cockpit color. Do not paint this exterior, cyan windows or a model-view backdrop into the output.

LOCKED COMPOSITION: wide 1851 x 850 full-width single frame, matching Image 1 without cropping or adding headroom. Gaia has an ANGULAR short FLAT TOP brow from (639,8) to (1212,8), with raked straight posts running toward (-86,652) and (1937,652), extending out of the sides. The thin lower rails join the console fascia at (398,584) and (1457,584). Keep members slim, around the guide's 13px width, with precise metal bevels and a rubber seal; hardware belongs at joints, not as thick beams across the forward view. No rounded Mercury bow, central mullion, heavy ceiling or extra pillars. All background, windshield and unused areas are real alpha transparency, with NO tinted glass or filled sky.

THREE TRANSPARENT MONITOR APERTURES ONLY, with full rims built OUTWARD:
Left x416 y625 width318 height184; lower-center radar x800 y641 width270 height182; right x1135 y625 width304 height184. Retain their placement, size, aspect and axis alignment, with only tiny corner chamfers. Leave true transparency inside, not black glass. No screen contents or reflections. The radar opening ends at y823, the other two at y809; retain complete bottom rims inside the 850-high image. Outer housing roof starts y584; center roof y560 with SWEPT, SLOPED shoulders blending into the neighboring housings. Keep a quiet blank dark front mounting face x800..1070,y575..633 for the separate live hyperdrive button: do not paint the button or put controls, vents or text across this reserved face.

CRITICAL PERSPECTIVE: the long side-console TOP FACES in Image 1 are shallow horizontal decks receding AWAY from the viewer to the upright monitor bank, NOT triangular vertical walls. Preserve their shared level plane and foreshortening. Narrow dark inner cabinet RETURNS are VERTICAL faces extending below the deck, with visible bevels and contact shadows at the bank. All service panels, switch rows, fasteners and seams on a deck must be foreshortened into that exact deck plane. Do not put front-facing rectangles onto a sloped/receding top. The foreground left deck landing zone x90..220,y785..850 stays smooth, unobstructed and level for the separately rendered fixed joystick base; no painted pedestal, socket, cable or raised hardware there. Nothing floats above the console.

DISTINCT GAIA DESIGN, HIGH DETAIL: make a serious working ore-hauler pressure cab, distinct from a slim fighter, rounded luxury cockpit or improvised scrapper. Use dark petrol/navy structural shells, warm bone/ivory molded compression seals, brushed gunmetal service faces and aged BRASS saddle clamps with small restrained ochre safety tabs. Give the three monitor bezels squared layered compression frames with short paired brass clamping ears and recessed captive bolts, not the starter's simple repeated rings, Mercury's round screw caps or Loki's polygonal fighter clamps. Keep generous clean display apertures. At each LOWER canopy-to-console joint put one compact split brass collar with a locking pin and short tucked pressure hose, visually anchored to the rail. The upper roof corners get small fold-flat pressure-cab catches, not big decorative lamps.
Build a differentiated industrial hardware grouping on each AFT console top: left, a recessed bolted cartridge/service hatch with small guarded steel toggles, an amber lamp bar and short ribbed selectors; right, a shallow ribbed power-distribution block with two recessed fuse drawers, a mechanical rotary isolator and a compact red safety cover. These are small static hardware, not big gameplay pads. On the vertical inner cabinet returns add recessed stacked cooling louvers, a few metal cable glands and short braided protective hose runs clipped tightly against the cabinet, disappearing behind the fascia. Make the central cowl roof a convincing shallow cast cap with stepped side chamfers, tiny pressure-equalization slots along its side shoulders and paired brass retaining tabs beside the quiet blank front face. Fine gasket joints, rolled sheet edges, small hinge pins, grouped rivets, machined lips, credible shadowed recesses and selective edge wear. Details form functional assemblies, never random greeble noise. Calm metal remains between clusters.

STYLE AND LIGHT: polished handcrafted Wing Commander-era illustrated game sprite family of Image 2, high resolution and crisp purposeful detail. Dimensional cool upper-left key light, warm local amber/red service indicators, subtle teal status points. Opaque material surfaces with deep contact shadows, thin lit bevels and restrained selective scuffing. Medium-scale mechanically coherent detail visible on a phone. No photorealistic render, blurry airbrush concept art, vector-flat shapes, grain, excessive rust, noisy stipple or bloom. Do not make every piece bright ivory; retain dark depth and readable structural silhouette.

KEEP EXISTING OVERLAYS SEPARATE: NO pilot, hand, glove, arm, sleeve, joystick, joystick base or socket; NO throttle lever/slider, large FIRE/MISSILE/BOOST buttons, pause/fullscreen controls; NO radar/readouts, screen fill, reticle, markers, floating HUD cards, letters, digits, labels, logos or watermarks. Small static physical switches, knobs, vents and lamps ARE wanted.
Return ONE intact detailed transparent RGBA cockpit structural frame. True alpha through the windshield, screen apertures and all empty space. No stars, planet, black/blue background, fake checkerboard or opaque glass.
```

## Composition correction prompt

```text
Use case: precise-object-edit, cockpit composition correction.
Image 1 is the detailed Gaia cockpit frame to revise. Image 2 is its ORIGINAL APPROVED structural and aperture guide: CYAN means transparent live monitor area, dark navy means transparent window, gray means opaque cockpit structure. This guide is an exact geometric constraint, not a style reference.

Keep Image 1's high-detail industrial pressure-cab identity, navy/gunmetal and bone-ivory/brass material finish, angular canopy, brass compression clamps, distinct left maintenance-hatch/toggle grouping, right power-distribution/fuse/isolator assembly, tucked braided pressure hoses, shallow horizontal console top planes, vertical dark returns, perspective, light and fine wear.
The current image's THICK bezels have reduced all three live screen openings from the approved layout and moved the cowl up. This is a COMPOSITION correction to restore the approved usable monitor area. Preserve hardware detail while moving bezel construction OUTWARD to the approved hole boundaries.

On the full 1851 x 850 canvas of Image 2, exactly restore these transparent monitor openings, no corner bevel larger than 5 pixels:
LEFT: x416..734, y625..809 (width318,height184).
RADAR: x800..1070, y641..823 (width270,height182).
RIGHT: x1135..1439, y625..809 (width304,height184).
Openings are horizontal/vertical and free of reflections or opaque screen glass. Generate REAL ALPHA through all cyan guide rectangles, not painted cyan or black. Build the detailed ivory seals, brass paired clamp tabs and dark housings OUTSIDE these hole bounds; do not thicken inward or shrink them again. Top/bottom rims must remain intact inside the canvas. Never use inset windows nested within these rectangles: the rectangles themselves are the full open apertures.

The outer housing tops start y584 and the middle forehead roof is y560, matching Image 2. Restore the center cowl lower than Image 1 and keep its swept/sloped shoulders. Its front mounting face x800..1070,y568..633 remains quiet, blank, dark metal for the existing separate hyperdrive button. Put no painted button, label, slot or hardware on this reserved front face; retaining tabs may sit beside it, vents on lateral shoulders.

Preserve the precise thin flat angular roof near y8 with x639..1212, its raked posts and open front view. The shallow console top surfaces recede toward the upright monitor fascia with all service panels correctly foreshortened. Do not turn these tops into vertical filler walls. Foreground left base landing x90..220,y785..850 stays smooth and clear; no joystick, painted base/socket, wires or tall parts there. Keep the pressure seals and bolted service modules distinct from a fighter or scrap cockpit. No new pillars, large panels or duplicated hardware.

No hand/arm/person, joystick or base, throttle, large gameplay buttons, pause/fullscreen controls, UI/readouts/radar/reticle, labels/letters/numbers/logos. Small static physical switches, knobs and lamps on the service modules remain. No opaque background, sky, stars, planet, tinted glass, fake checkerboard or black screen fills.
Return ONE intact detailed RGBA structural frame with real transparency, the approved larger holes and the industrial finish of Image 1.
```
