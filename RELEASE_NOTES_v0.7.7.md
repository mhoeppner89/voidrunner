# RELEASE_NOTES v0.7.7 — Visual Gauntlet: Azure & Belt Polish

A bug-fix and polish pass on the flight visuals, driven by a builder/critic
gauntlet judged against Elite Dangerous stills. Every fix below was isolated
with live in-browser A/B tests (layer toggles, material swaps, CDP captures)
and verified with before/after screenshots (`gauntlet/shots/`, progress log in
`gauntlet/progress.html`).

## Azure, the ringed water world

- **Ring completes its orbit.** The ring shader projected fragments onto a
  plane tilted ~60° off the mesh's real plane (the Euler was applied to +Y
  while RingGeometry's normal is +Z), so the radial edge fade ate whole arcs.
  The plane normal now derives from the mesh quaternion — geometry and shader
  can no longer drift apart.
- **No more black speckle from orbit** — four stacked causes, all fixed:
  1. *Mip bleed*: transparent canvases store empty pixels as transparent
     black; mips average RGB uniformly, so distant cloud/ring wisps speckled
     dark. RGB is now rewritten to white under the alpha
     (`opaqueRgbUnderAlpha`).
  2. *IBL star noise*: 240 one-pixel stars painted into the environment-map
     canvas aliased through glossy specular (roughness 0.5 + metalness 0.14
     on the sea). The IBL map is now a smooth gradient; the visible starfield
     is untouched (it lives in the Points shell).
  3. *Single-texel islands*: the 64-lattice noise octave inside the land
     threshold scattered one-texel islands that render as dirt from orbit.
     The threshold now uses low-frequency octaves only; fine octaves shade
     land interiors.
  4. *Wash imbalance*: the additive halo plus overlapping cloud decks lifted
     the disc so pale that the ocean showing through cloud gaps read as dirt
     stains. Halo 0.62→0.45, cloud decks 0.16+0.2→0.11+0.13, emissive
     0.2→0.12, and the cloud texture now draws distinct storm cells at ~35%
     coverage instead of a near-solid haze.
- **Far-distance bump aliasing**: bump shading has no mip-aware falloff, so
  at orbital range the full-res height field's screen-space derivatives
  exploded into per-fragment black speckle. Azure's bump now samples a
  blurred 128 px height field — continent-scale relief survives, per-texel
  spikes are gone (verified at 261,000 km equivalent framing).

## The shardbelt

- **No more flickering light points.** Flat-shaded asteroid facets sweeping
  through a sharp GGX highlight flashed as the instances rotated. Rock
  materials are now matte (roughness 0.85–1, metalness ≤0.08) — belts read as
  stable diffuse terrain, which is also what real regolith does.

## Weapons feel (follow-ups)

- NPC guns flash faction-colored on every shot — furballs show where fire
  comes from, not just bolts in flight.
- Missiles read as embers at 30–60 u (bigger plume/flare) with the same
  camera-distance attenuation lasers use, so a plume crossing your own space
  cannot wash the frame.
- Arena sessions unlock the whole gun roster for sandbox review; career saves
  still derive ownership from purchased equipment.

## Verification

- Capture rig: `gauntlet/capture.mjs` renders eight judged scenes (Azure far/
  limb, Vesper, asteroid field ×2, laser volley ×2, missile run, dogfight)
  headlessly with zero page errors; `gauntlet/stage-pairs.mjs` stages blind
  A/B pairs against the Elite Dangerous reference stills for the critic loop.
- Perf gate: frame times hold within run-to-run noise on the software
  renderer; all changes are constant-cost or one-time (shared FX assets,
  no per-frame allocations added).
- Service-worker cache: `voidrunner-v113-0-7-7-visual-gauntlet`.
