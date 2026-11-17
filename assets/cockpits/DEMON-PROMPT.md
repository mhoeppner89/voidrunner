# Morrigan artwork — composition review

The user approved the unpainted layout by asking for artwork on 17 November 2026, retaining the hand, base and controls. Generated with the **built-in imagegen tool**, transparent background, in one call. No CLI/API fallback or subsequent image editing was used. Painted composition awaits user approval; it is not activated in flight.

## Inputs and original output

- `demon-layout-guide-v1.png`: 1851×850 RGBA structural guide exported from the approved shared `greyboxFrame()` and native canopy survey. Only surveyed beams, three monitor holes and shaded perspective console surfaces; no hand/base, controls, readouts, reticle or background.
- `output/cockpit-layout/demon/art/hull-reference.png`: actual shipped `demon.glb` rendered by the shared 3D model comparison, captured from the model stage without the surrounding UI. The central pilot pod is highlighted; it is distinct from the prongs and engines.
- Original generation: `/Users/mhoeppner/.codex/generated_images/01a1e60b-f4bb-7d03-9d28-ca563377e3aa/exec-5f3b93d5-b177-4fbd-8c5b-ec21f9b9fa23.png`.
- Project asset: **`demon-paint-v1.png`**, copied byte-for-byte from that original, 1850×850 RGBA. SHA-256: `4f691b02a0d36db0592426d1bf9622885b78ec2b580d60ae9c252ca73e22c836`.

The image is one intact static frame. No cropping, resizing, corrective aperture stencil, bezel reconstruction, alpha editing or repeated regeneration. The small difference between the 1851-wide guide and 1850-wide image is accommodated by the source geometry and measured display centering.

## Design and fit

Morrigan uses deep oxblood paneling, a black ribbed cast-metal skeleton, heat-blued rims and exposed copper cooling/power hardware. Its angular flattened-hexagon canopy follows the surveyed pod. Paired power-isolator modules, inset deck access plates, louvered cooling fins, bezel clamps and routed conduit distinguish the tightly packaged interceptor from the game's grey/ivory consoles and Balor's patched brick-red trim. Deck tops recede toward the bank; darker cabinet returns and bevels retain depth. The left landing patch remains flat for the existing complete fixed base.

Only the live backing rectangle positions and internal content insets were fitted in `src/game/cockpits/demon.js`. The approved monitor widths/heights, hand/base source files, scale, pivots, common offset, touch areas and control styling remain inherited. `stickClearanceX:416` keeps touch placement independent of the small display shift. Hyperdrive bottom stays at source Y=633; its horizontal center follows the radar fitting. `status:'art-review'` excludes this frame from live selection and warming.

Native PNG alpha flood fills (alpha <40; exclusive right/bottom):

| Opening | Bounds | Transparent-area centroid |
| --- | --- | --- |
| Own | x427–722, y635–784 | 574.0509, 709.4812 |
| Radar | x806–1044, y660–800 | 924.9794, 729.5143 |
| Target | x1131–1424, y635–784 | 1277.4845, 709.6907 |

All holes lie inside their live backing rectangles; centers differ by less than one source pixel. Insets keep text clear of the original stepped bezels. The radar uses the unchanged shared canvas renderer. Its absolutely positioned `.radar-screen-wrap` uses fixed percentage insets rather than the per-hull screen padding, so the selected navigation contact bracket can partly underlap the top bezel. Existing small-phone long combat/salvage text clipping is also retained. These are shared content-fit concerns, recorded in the hull notes; the painting is preserved intact.

## Exact generation prompt

```text
Use case: sketch-to-render.
Asset: one complete, highly detailed transparent cockpit structural frame for Morrigan, the tier-2 twin-hull interceptor in the Voidrunner retro space-sim. This is finished game artwork from a user-approved layout.

INPUT ROLES: Image 1 is the STRICT approved structural geometry and perspective guide. Its canvas, canopy outline, three display holes, low monitor bank and shallow side-deck planes are locked. Image 2 is ONLY the actual ship exterior for hull identity and material cues. The pilot sits in its central glazed pod. Do not paint the exterior ship, prongs, engines or background into the interior.

LOCK THE GUIDE: landscape canvas 1851x850 (approximately 2.178:1), same crop and composition as Image 1. Keep the broad angular flattened-hexagon canopy opening: straight thin horizontal roof around y100, tiny shallow roof chamfers, raked upper sides meeting the far side corners around x140/y400 and x1710/y400, then thin lower diagonal jambs connecting to the bank around x398/y584 and x1457/y584. Keep the structural rails SLIM, about 10-16 pixels in the reference grid; small hinges may be wider locally. No extra bars across the windshield, no center pillar, no thick arch or visor. Leave the large forward view genuinely transparent. No solid top border above the existing roof.

LOCKED DISPLAY APERTURES: three genuinely transparent holes in the low bank: left x416 y625 w318 h184; middle x800 y641 w270 h182; right x1135 y625 w304 h184. Keep these positions and sizes closely, with straight level facing-the-pilot display planes and complete opaque detailed bevels OUTSIDE their holes. The middle radar hole stays lower than the outer holes. Three screens only. Do not paint screen glass, black screen fill, extra displays or telemetry.

PERSPECTIVE: copy the guide's explicitly projected low horizontal side-console top surfaces, inner bevels and dark vertical cabinet returns. The decks extend from the bottom side edges toward the rear monitor joints at x398/y584 and x1457/y584, with foreshortening converging consistently toward the center. They are horizontal decks seen from above, NOT front-facing triangular plates. Hardware on them must foreshorten with those surfaces. Give the cabinets visible thickness, recessed seams, bevels, contact shadows and vertical returns underneath. Keep the left foreground landing patch approximately x80..270/y750..850 flat and calm so an EXISTING separate hand and fixed joystick base can sit on the deck. Do not paint a stick, base, socket, pedestal, arm or hand there.

CENTER COWL: preserve its low swept/sloped shoulders and shallow receding roof around y560. The central face x800..1070/y570..633 stays clean dark oxblood/black for the existing separate hyperdrive control to overlay. Do not paint that button, label or any competing hardware on this face. The cowl must flow into the two adjacent monitor housings, not become a box tower.

DISTINCT MORRIGAN DESIGN: compact high-performance twin-engine interceptor, with rich DEEP OXBLOOD RED ceramic-coated panels inset into a black ribbed cast-metal skeleton, narrow heat-blued titanium rims and restrained exposed copper cooling hardware. Give the actual material a saturated dark wine-red identity across the monitor shells and side-deck insets, not another generic grey cockpit with a thin red stripe. Avoid Balor's ragged brick-red repair strips, the navy/ivory starter and Mercury, the grey/yellow industrial Gaia/Tyr, and broad pale luxury trim. This is tightly packaged interceptor engineering: layered angular shells with sculpted recessed pockets, dense cooling fins, slotted fasteners, dark elastomer seals, narrow paired bronze power conduits with deliberate mechanical clamps, and elegant small latches integrated at the existing canopy joints. The twin-engine motif appears as two compact matching paired power-isolator/fuse modules on the rear outer deck regions, one on each side, with tiny guarded static toggles. Make those modules shallow and correctly foreshortened, not new large interface controls. Subtle asymmetry in service access plates is welcome while structural geometry stays symmetric.

HIGH DETAIL FROM FIRST PASS: deep dimensional display bezels with stepped inner gaskets, precise screws and corner clamps; inset service hatches, finely spaced heat-sink louvers, small ceramic connectors, restrained braided cabling secured to the cabinets, tiny amber and muted red status lamps, narrow ventilation slots, functional hinge knuckles and tension locks. Cluster details logically in the existing console surfaces with quiet areas between. Paint physical construction and mounting depth; no random sprinkle of dots or coils. Fine static mechanical switches are wanted; large live game buttons are forbidden. Use sparse wear on high-contact corners, slight heat staining at copper fins, and light edge chipping to expose warm metal. No skulls, spikes, occult symbols, hazard-stripe bands, decorative wings or fantasy ornament.

FINISH: high-quality hand-painted retro space-sim game art, crisp controlled pixel-scale detail and readable shapes with tactile metal, coherent soft top-left lighting, subtle warm reflected light on red panels, dark cabinet returns and selective silver/copper highlights. Detailed but not noisy. No photoreal photography, blurry gradients, film grain, over-sharpened noise, pervasive scratches or heavy bloom.

REAL TRANSPARENCY: return actual RGBA alpha through the entire open windshield, outside all physical structural surfaces, and inside all three display holes. Physical structure is opaque. No glass tint, reflections, checkerboard pattern, solid black background, stars, sky, planet, space backdrop or cast shadow outside the structure.

DO NOT BAKE IN: pilot hand, glove, sleeve, joystick, fixed base, socket, throttle rail/slider, large fire/missile/boost pads, hyperdrive control, pause/fullscreen buttons, comms, wing card, radar marks, readouts, reticle, words, numbers, labels, logos or watermark. These already exist as unchanged separate production overlays. Return ONE intact, highly detailed transparent frame matching Image 1's geometry and perspective.

```
