# Starter cockpit artwork · 04

Approved starter comparison: `/output/cockpit-layout/index.html?hull=wayfarer`. Mercury’s artwork review is `?hull=talon`; layout approval preceded generation. Build with `node tools/playtest/cockpit-layout.mjs`.

- `wayfarer-paint-atlas-v2.png` is now rendered **whole**, despite its historical filename. This 1851×850 RGBA image is byte-identical to the user's `ChatGPT Image Nov 16, 2026, 10_25_52 AM.png`. No rails or monitor borders are reassembled. The hand and live controls are separate.
- `wayfarer-hand-pitch-v4.png`: navy glove and flight sleeve with white piping/cuff accents, extending below and left of the viewport. One jointly edited strip, 2172×724 RGBA, containing three 724px-wide forward/neutral/back left-hand views. Built-in imagegen, no API/CLI fallback.
- `wayfarer-v4.json`: generated export of `src/game/cockpitDefinitions.js`, containing complete-frame dimensions, actual display apertures, strip cells and shaft-end pivots. Edit the shared definitions, then rebuild the review; do not maintain a second layout here. All poses share one scale and fixed gimbal anchor. Source pixels/alpha are unchanged; SVG cropping/transforms perform placement.
- `wayfarer-stick-base-v1.png`: separate 2172×724 transparent navy/ivory gimbal mount, positioned by its source socket anchor. The base stays fixed behind all three hand poses. Exact built-in generation prompt: [STICK-BASE-PROMPT.md](STICK-BASE-PROMPT.md).
- `PROMPTS.md`: exact generation prompts and input roles, including earlier revisions.

The frame, hand strip and fixed base are each decoded once. The frame and monitor glass remain stationary between resizes; the hand changes only its selected pose and anchored, half-degree yaw transform inside a small isolated paint layer. The live glass slightly underlaps the measured source apertures, with the intact frame above it to cover antialiased edges. Monitor bitmap sizes follow their actual CSS display dimensions without the old per-axis minimum clamps. No image processing or additional 3D scene runs per frame. Buttons retain the earlier mobile sizes in the approved muted colours. They and the half-width visible throttle are mobile only; their larger touch areas are independent of the art.

The review enables the existing touch-relative stick mode: first contact is neutral; drag offsets set steering. Afterburner has a 28px transparent hit extension above and left, and launcher selection has one to the left. Painted button sizes and placement are unchanged. The upper corner controls use the same muted housing design.

The approved v4 frame/hand were integrated into the starter Wayfarer in 0.8.2og; the separate fixed base sprite followed in 0.8.2oi (`src/game/cockpitArtwork.js`). Mercury joined the shared renderer in 0.8.2oo. Other hulls retain their current cockpits. Superseded manifests and artwork are available in Git history; only the current composition remains in this folder. The standalone review remains available for further art work.

## Mercury live cockpit

`talon-paint-v4.png` is the selected transparent full frame, generated with built-in imagegen from the shaded, projected `talon-layout-guide-v3.png` and the approved starter's finish. The side deck tops and dark vertical cabinet returns meet the monitor bank as distinct planes. The radar is 14 source pixels lower, with a raised frame forehead for hyperdrive; its size and the outer monitors/other controls are unchanged. The smooth canopy and three fixed display openings use the approved layout. Exact original/correction prompts and output provenance: [TALON-PROMPT.md](TALON-PROMPT.md).

Mercury is approved and active in live flight, session warming and the authoring review. The isolated review assembles the new frame with the existing hand/base and shipping controls. After user feedback in 0.8.2oq, restore the original v4 PNG unchanged and fit live monitor rectangles to its measured alpha openings in code. No aperture stencil cuts through its painted bezels. Small internal content margins protect text at the bevel corners; the central bank remains centered. Repeated v5–v8 image edits are superseded.

The v4 hardware pass adds recessed switch groups, trim knobs, small lamps, deeper monitor frames, vents, mounted conduit runs and canopy latches. Its hyperdrive cowl has swept shoulders and a sloped roof. Exact detail/fit prompts and selected output: [TALON-DETAIL-PROMPT.md](TALON-DETAIL-PROMPT.md). The fixed hand/base source art is unchanged. Mercury’s assembled rig sits 60 source pixels farther left, fully on its console top; the touch area and all instrument/control geometry remain unchanged. Alignment edits and exact generation prompts: [TALON-ALIGNMENT-PROMPT.md](TALON-ALIGNMENT-PROMPT.md).

## Loki live cockpit

`speedster-paint-v2.png` is the approved 1850×850 RGBA full frame, generated with built-in imagegen from the approved `speedster-layout-guide-v1.png`. Layout and composition were separately approved on 16 November 2026. It is active in live flight from 0.8.2os, through the shared approved cockpit registry and session warming. The original generated pixels and alpha remain intact. Three live glass rectangles and content insets are fitted in `src/game/cockpits/speedster.js`; the existing navy/white hand, separate fixed joystick base and gameplay controls remain separate overlays. Loki uses slim angular canopy members, inset avionics modules, ribbon looms, compact catches and restrained ochre accents. The rig remains 60 source pixels left of baseline, independently of the touch area. Exact prompts and provenance: [SPEEDSTER-PROMPT.md](SPEEDSTER-PROMPT.md).

## Balor live cockpit

`scrapper-paint-v2.png` is the approved 1850×850 RGBA charcoal/red raider frame, active in live flight from 0.8.2ot. It retains the reviewed original PNG and alpha, source display sizes/positions and content insets, navy/white hand, separate fixed base and controls. Its straight angular canopy, guarded switch groups, gunmetal brackets, repair plates and welded seam follow Balor's identity. The anchored rig stays 60 source pixels left of baseline; `stickClearanceX:416` preserves its touch area. The approved registry supplies its frame/hand/base warming and cached alpha. Exact prompts and provenance: [SCRAPPER-PROMPT.md](SCRAPPER-PROMPT.md).

## Tier-II flight integration — 2026-11-17

All seven tier-II compositions are approved and active in 0.8.2ov. Mercury keeps `talon-paint-v4.png`; Gaia uses `prospector-paint-v2.png`, Morrigan `demon-paint-v1.png`, Argo `mule-paint-v1.png`, Tyr `legionary-paint-v2.png`, Thor `andromeda-paint-v1.png` and Freya `torsas-paint-v2.png`. Each original PNG and its measured monitor fit are preserved. All use the unchanged navy/white hand strip and separate anchored joystick-base sprite. Runtime definitions and warming use the approval registry. The collection review is `/output/cockpit-layout/tier-2.html`. Earlier Freya frames remain authoring alternatives, not runtime selections.


Morrigan’s separate `demon-forward-hull-v1.png` is approved for flight at 13% forward / 18% outward. Its full transparent canvas stays registered with the intact `demon-paint-v1.png` frame. The geometry input and exact generation prompt are preserved as `demon-forward-hull-guide-v1.png` and `DEMON-FORWARD-HULL-PROMPT.md`. Do not regenerate the frame to adjust this optional exterior layer.

## Tier-III flight integration — 0.8.2ow

All five tier-III frames are approved and active: Bellona (`vanguard-paint-v2.png`), Artemis (`lancer-paint-v1.png`), Atlas Hauler (`atlas-paint-v1.png`), Victoria (`blade-paint-v1.png`) and Odin (`astra-paint-v2.png`). The exact approved monitor/control layout and shared hand/base remain fixed. Bellona uses charcoal molded impact padding; Odin uses the corrected transparent apertures. See [artwork, guides and exact prompts](TIER-3-ARTWORK.md). Review `/output/cockpit-layout/tier-3.html` uses the same production definitions and renderer as career and Arena.
