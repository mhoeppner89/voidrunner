# Thor artwork provenance

Layout explicitly approved by the user on 2026-11-16; composition remains `art-review` and inactive in live flight. Generated with the built-in imagegen tool, transparent background. One generation; no subsequent image editing or regeneration.

Inputs, in order:
1. `assets/cockpits/andromeda-layout-guide-v1.png` — exact approved beams, monitor openings and perspective-shaded console planes; no hand, base, controls or live instruments.
2. `output/cockpit-layout/andromeda/model-close.png` — actual GLB identity reference, with no authority to change approved geometry.

Original generated file: `/Users/mhoeppner/.codex/generated_images/01a1e60c-17e7-73e0-a3a9-011c8f4c6337/exec-f5c935e7-f1ba-461a-a1ae-ab2026292f37.png`.
Selected asset: `assets/cockpits/andromeda-paint-v1.png`, **1850×850 RGBA**, copied byte-for-byte. SHA-256: `2a27e38789603696137db4b77762e1e552e70abc02635d1329e3db8f2821bf93`.

No bitmap rescaling, aperture stencil, alpha reconstruction, bezel edits or disassembled frame. The 1851×850 approved coordinate grid is retained; the complete static image stretches with that shared layout. All fitting corrections are code-only.

## Exact prompt

```text
Use case: stylized-concept / sketch-to-render.
Asset type: ONE complete transparent RGBA cockpit structural frame for Thor, the Alliance tier-2 heavy strike fighter in Voidrunner.
Image 1 is the user-approved EXACT structural and perspective guide. Its beams, console top planes, dark vertical cabinet returns and three monitor apertures govern composition. Dark navy outside the metal and black monitor interiors mean TRANSPARENT EMPTY SPACE in the output.
Image 2 is the actual Thor exterior model for design identity only: a purposeful long heavy striker with broad raked cockpit glazing, gray plated hull, restrained ochre markings and large paired engine pods. Do not paint this exterior, its cyan survey overlay, gold eye marker, dialog UI or background into the frame.

LOCKED CAMERA / COMPOSITION: full wide 1851x850 canvas, no crop, reframing or changes of viewpoint. Broad FLAT ANGULAR brow from (106,100) to (1745,100), raked straight posts down to (406,480) and (1445,480), short lower jambs to console joints (398,584) and (1457,584). Keep this exact thin outline, not a rounded arch, aircraft bubble, thick roof visor or new crossbar. No central mullion. Open windshield stays spacious. Keep bow near 13px thick on this reference grid, with small flush hardware; no chunky fittings projecting far into sightlines. All areas outside the physical metal and the three instrument apertures must have genuine transparent alpha. No tinted glass, space, sky, stars, checkered backdrop, black background or backdrop shadow.

INSTRUMENT OPENINGS, exact reference grid: LEFT x416 y625 width318 height184; CENTER RADAR x800 y641 width270 height182; RIGHT x1135 y625 width304 height184. THREE holes only, genuine transparent alpha. Keep them front-facing, horizontal/vertical, with very small beveled corners. Frames build OUTWARD around the holes. Center bottom y823 is 14px lower than side bottoms y809; keep complete lower rims under all holes. Do not paint screen content, radar, reflections or black screen fill. Preserve the centered three-monitor bank and its shallow profile. Outer housings start y584. Center forehead roof y560 with sloped/swept shoulders flowing into side housings. Center mounting face x800..1070,y570..633 must be quiet blank dark gunmetal for an EXISTING separate hyperdrive control; do not paint a button there.

PERSPECTIVE IS CRITICAL: side-console TOP faces are HORIZONTAL level planes viewed from the seat, receding into the rear monitor fascia, as shaded explicitly in Image 1. Preserve their shallow perspective, receding seams and sharp inner bevels. Darker VERTICAL cabinet returns descend below the inner deck edges offscreen and physically attach to the monitor fascia. Hardware fixed to top planes must be foreshortened into those planes; hardware on front faces is upright. Do not turn the decks into front-facing triangular walls or giant filler panels. Maintain coherent contact shadows and edge depth. Keep the near-left landing area x70..260,y750..850 as a clean flat top surface for the separate EXISTING joystick base. No painted socket, stand, stick, base, cable or raised hardware on that patch. Small hardware can occupy the rear decks, not the clear base patch.

THOR DISTINCTIVE DESIGN / HIGH DETAIL: purpose-built naval heavy-strike avionics, serviceable and sturdy but restrained within the approved thin composition. Cool blue-gray gunmetal structural rails, dark desaturated OLIVE instrument casings and slate horizontal decks, narrow dark rubber seals with fine bright titanium bevels, occasional muted OCHRE safety tabs echoing the hull. Avoid broad ivory monitor rims, red raider paint, rounded luxury housings or copying another cockpit's hardware. The heavy character comes from well-designed dense equipment and fastening, not thickening the canopy or raising the bank.
Make the monitor shells squared, layered, angular, individually shock-isolated in small corner mounts, with thin nested black/titanium seals, countersunk fasteners and captive quarter-turn clips. On the rear LEFT top deck, place a pair of shallow recessed strike-control cassettes with slotted covers, a small shielded selector and a short orderly row of green/amber pilot lamps, all foreshortened. Rear RIGHT deck has a distinct recessed torpedo sequencer cluster with three small protective toggle guards, rectangular connector sockets and a tiny amber/red lamp bank, asymmetric functional layout. Center shoulders have low finned heat-exchanger slots and stepped removable access covers; central roof has fine panel seams and two small flush latches, never a turret or bulky tower.
Lower canopy-to-console joints get flush military locking dogs and small ochre witness tabs. Inner vertical cabinet returns have bolted service hatches, dark braided cable trunks captured in short rectangular channels, inset ventilation louvers and occasional small connector blocks, with deep clean recesses. Add credible metal thickness, bevel transitions, distinct surface materials, fine machining, selective edge wear and a few fastener scuffs. Organized useful equipment groups with calm metal between them; no random greeble noise or excessive exposed piping.

STYLE: polished highly detailed hand-painted retro space-sim sprite art, Wing Commander-era craft at modern resolution. Crisp deliberate pixel-scale highlights, readable medium hardware clusters, clean dimensional shading. Coherent cool upper-left illumination, dark vertical returns, restrained warm local lamps. Not photorealistic, not a flat vector illustration, not blurry concept art. Avoid grain, stipple, heavy dithering, bloom and noisy scratches. Maintain richness at full resolution and readability when scaled to phone.

KEEP EXISTING OVERLAYS SEPARATE: no hand, arm, sleeve, person, joystick, fixed base, throttle rail/slider, large fire/missile/boost pads, pause/fullscreen buttons, hyperdrive button, HUD, live instruments, reticle, text, letters, digits, labels, emblems or watermark. Small STATIC physical switches, guarded toggles, connectors and lamps ARE wanted on the structural console. Do not bake any gameplay controls into the artwork. Return the intact full-width frame with actual transparency through windshield, outside structure and all three monitor holes.
```

## Original alpha openings

Flood fill at alpha <40; bounds use exclusive right/bottom.

| Opening | Bounds (left,top,right,bottom) | Transparent centroid |
| --- | --- | --- |
| Own | 429,637,727,802 | 577.9390,719.4947 |
| Radar | 803,661,1053,818 | 928.3760,739.5207 |
| Target | 1127,637,1424,802 | 1275.6452,719.5511 |

Approved monitor widths/heights remain 318×184, 270×182, 304×184. Small x/y shifts center those live backing rectangles on the holes; content insets clear the detailed bevels. `stickClearanceX:416` preserves the complete pilot rig and touch geometry independently of monitor fitting. The source hand strip, base, pivots, scales and −60 rig offset are unchanged. Display fitting shifts the radar and its centered hyperdrive attachment together by approximately 6.5 reference pixels horizontally; the button's size, vertical position, artwork and interaction are unchanged.

The original PNG contains a complete level left deck beneath the base, vertical inner returns, ordered hardware groups on correctly foreshortened top faces, and Thor-specific olive/gunmetal/ochre military equipment. Layout-guide and model references remain available for comparison. See `tools/playtest/cockpit-layout/hulls/andromeda.md` for verification and the known shared test stage assumptions.
