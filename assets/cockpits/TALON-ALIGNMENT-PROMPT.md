# Mercury aperture alignment · v8

Intermediate v5/v6/v7 images are archived under ignored `output/cockpit-art/alignment/`; v4 and the selected v8 remain in assets.

## Measured-edge refinement

The first rectangular result remained offset. Measured its alpha openings before the following targeted edit. Input 1 is `talon-paint-v5.png`; input 2 is the same cyan template.

> Use case: precise-object-edit. Small pixel alignment correction to Image 1. Keep the whole cockpit, hardware, canopy and cowl unchanged. Image 2 is the target cyan aperture template; only the three bezel regions may change.
> The last edit made the openings rectangular, which is good. Now align their EDGES; do not redesign the frames. At this 1850x850 resolution the measured current transparent openings are:
> LEFT approximately x414..729, y630..805.
> CENTRE approximately x792..1059, y649..817.
> RIGHT approximately x1119..1433, y630..805.
> They need to be:
> LEFT x416..734,y625..809.
> CENTRE x800..1070,y641..823.
> RIGHT x1135..1439,y625..809.
> Thus specifically move the painted RIGHT inner bezel approximately16 pixels to the RIGHT, reduce its inner width by10 pixels from its right side, and extend the opening5px upward and4px downward. Move the CENTRE inner bezel8px right and8px upward, widen its right edge3px and extend the opening6px downward. Move the LEFT inner bezel2px right, widen its right edge3px, extend5px upward and4px downward. Adjust the surrounding ivory mouldings to remain immediately outside these exact edges; do not leave the old inner rims underneath or as duplicate outlines.
> The cyan rectangles in Image 2 show the desired locations. Replace cyan with alpha, not coloured glass. Thin clean rectangular seals, SQUARE inner corners, no diagonal cutoffs, intruding bolts or decorations inside the holes. Keep full visible ivory trim outside all four sides. Do not move any actual control cluster, lamps outside these bezels, conduits, canopy, switches, joystick area or any other artwork. No hand or joystick/base. Same canvas and framing with unchanged full cockpit silhouette, no zoom/crop/resizing, genuine alpha everywhere currently transparent outside the adjusted openings. This is a precise fit adjustment, not a new painting.

## Initial aperture edit

Built-in imagegen, transparent background. Edit target: approved `talon-paint-v4.png`. Strict geometry input: `talon-aperture-guide-v1.png`, code-exported cyan rectangles at the fixed live display bounds. Only the painted bezel regions may change. The hand/base remain separate existing assets.

Exact prompt:

> Use case: precise-object-edit. Correct ONLY the THREE MONITOR BEZELS AND THEIR TRANSPARENT OPENINGS in Image 1, the completed detailed Mercury cockpit. Image 2 is a strict pixel-position aperture template.
> The cyan rectangles in Image 2 are the exact live display areas. They must become exact clean TRANSPARENT RECTANGULAR HOLES in the artwork. The current artwork has smaller, offset and chamfered holes that do not fit the live displays. Correct the painted INNER RIMS to hug the OUTSIDE of the cyan rectangles. Make the inner bezel mouldings thinner where necessary. Move corner screws/brackets OUTSIDE those rectangles so no paint projects into their corners.
> Required openings, on the same ~1851x850 frame:
> LEFT: x416..734, y625..809 (318 wide,184 high).
> CENTRE RADAR: x800..1070, y641..823 (270 wide,182 high).
> RIGHT: x1135..1439, y625..809 (304 wide,184 high).
> Each hole must be axis-aligned with four SQUARE 90-degree corners: no diagonal corner cutoffs, no rounded inner opening, no chamfered inner glass, no bolts or highlights intruding into the rectangle. A thin recessed black seal and ivory bevel OUTSIDE the exact rectangles are welcome. There must be no sliver of transparency outside these rectangular apertures along a bezel; the opaque bezel must meet each rectangle edge flush. The middle hole is taller than in Image 1 and extends14px lower than the outer displays. Its top must align to y641, not y655. Preserve a complete visible lower ivory rim below its y823 bottom edge.
> Do NOT move or resize the LIVE DISPLAY AREAS to fit the old artwork. Redraw the painted rims around the template instead. Cyan is a guide only: do NOT leave any cyan or guide-white lines in the result; cyan regions become genuine alpha.
> Keep absolutely everything else from Image 1: the current detailed switches, knobs, lamps, vents, cables, canopy latches, full canopy curve, sloped hyperdrive cowl, side consoles, perspective, finish and silhouette. Change only the thin monitor border regions needed for exact aperture fit. No new hand, joystick, base, controls, text, readouts, background, extra screen or decoration.
> Same wide canvas and framing, no crop, zoom, overall resizing or padding. Retain original alpha everywhere else. Return the COMPLETE detailed frame, with geometrically accurate monitor openings and thin intact bezels immediately outside them.
# Selected seal refinement (v8)

Built-in imagegen, transparent background. Intermediate v7 used v4 plus the cyan aperture guide. Final v8 used v7 as its only input. Output `exec-edca3256-0422-4bae-b883-0697fa0e96c9.png` was copied unchanged to `talon-paint-v8.png` (1850×850 RGBA). Prior exact-edge edits v5/v6 failed to align all three openings; generous dark gaskets let the static runtime stencil form the approved glass slots without clipping the ivory rims. No raster postprocessing.

## Gasket prompt

```
Edit image 1 only in the THREE MONITOR BEZELS. Preserve all other cockpit art, silhouette, canopy, cables, switches, vents, cowl and side decks exactly. Image 2 shows the approved display slots in cyan. The ivory trims currently are too close to the slots and need MORE SPACE. Do not try to align a thin line precisely: instead create wide robust rectangular dark charcoal rubber gaskets with ivory framing OUTSIDE them. Each cyan slot must fit comfortably inside its gasket.
Canvas 1850x850. LEFT display slot x416..734 y625..809. Ivory frame inner edge should sit around x396..754 y605..829. CENTER display slot x800..1070 y641..823; ivory frame inner edge around x780..1090 y621..843. RIGHT display slot x1135..1439 y625..809; ivory frame inner edge around x1115..1459 y605..829.
Between these ivory inner edges and the display slots paint a substantial plain dark charcoal rubber seal, no glints, grain or screws. Make the actual transparent holes SMALLER than the cyan slots by about 12 pixels on every edge, leaving a wide flat charcoal inner gasket. The runtime will cut that plain inner seal to the exact screen rectangles. Thus transparency LEFT roughly x428..722 y637..797; CENTER x812..1058 y653..811; RIGHT x1147..1427 y637..797. Square corners! No rounded, chamfered or beveled corners inside the gaskets. The actual ivory rims must be well OUTSIDE the cyan rectangles, not intruding into them. This will make all three panels fit without losing their ivory border. Ivory frame may be thinner if necessary and can merge naturally into existing outside housings, but do not move the outside housing banks, cowl, controls or any other hardware.
Full unchanged canvas/framing/silhouette. Real alpha for glass and window. Do not paint any hand, joystick or controls inside the monitor slots. Keep the rest unchanged.
```

## Final seal prompt

```
Precise limited edit of this cockpit image: preserve everything except three monitor bezels. The dark flat gaskets are good, but need MORE ROOM outside each display. Move ALL THREE bottom ivory bars DOWN about 15 pixels so their INNER top edges are near y835 for left/right and y848 for center. The bottom ivory bars may run into the bottom canvas edge. Move all three TOP ivory bars UP about 12 pixels. Move the CENTER bezel RIGHT vertical ivory bar 20 pixels to the right. Move the RIGHT bezel right ivory bar 12px to right. Keep outer hardware unchanged. These changes must enlarge the DARK CHARCOAL GASKET, NOT the transparent holes. KEEP the current small transparent holes EXACTLY as they are. Ivory trim should be near the outer edge of the monitor housings now. Dark charcoal seals need to surround intended left display rectangle x416..734 y625..809, center x800..1070 y641..823, right x1135..1439 y625..809, with at least TEN pixels of dark charcoal outside all four intended rectangle edges. Flat charcoal, no texture or glints. Maintain whole original silhouette, same 1850x850 frame, same canopy/cowl/panels/controls/cables/vents. No hands, joystick, writing or instruments, genuine transparency.
```

