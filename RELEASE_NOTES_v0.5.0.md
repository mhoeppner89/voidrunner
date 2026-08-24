# Voidrunner 0.5.0 — Station Detail, Atmosphere, and Audio Overhaul

Two big pillars land in 0.5.0: a complete visual overhaul of the stations, the
debris field, and the planets, and a from-scratch sound and music rebuild. The
release also ships the deterministic hyperdrive-intercept test override and the
first local test-suite infrastructure (ship stats, visual/audio audit, offline
THREE loader).

## Stations — micro-voxel detail pass

- Helix gains micro-voxel service conduits and hull plating running the length
  of the central spindle: small enough to catch the rim shader without breaking
  the station's readable tower-of-discs silhouette, with periodic accent and
  window details so the spine reads as built machinery.
- The navigation-antenna crown gets a ring of secondary struts, stays, and
  warning beacons instead of a bare four-post mast.
- Solar arrays grow from three cross-beams to five, with dark connecting ribs
  between the panels for a continuous wing structure.
- Rook's core gets dense surface greebles — pipe runs, panel joints, and
  maintenance lights — plus docking-bay ribs and hazard chevrons ringing the
  hull, so the industrial port reads before its windows catch the bloom pass.
- The structural audit (`visualAudioAudit.mjs`) enforces the density contract:
  both stations must retain > 5,000 voxel vertices.

## Planets — physically-shaped atmospheres, richer surfaces

- The old three flat BackSide atmosphere discs (which read as stacked plastic
  shells) are replaced by a single shader-driven atmosphere shell: the glow is
  strongest just above the horizon, falls off continuously outward, and is
  modulated by the sun direction — a day-side limb glow that dims on the night
  side, with a subtle deep-blue scatter term.
- A thin additive haze layer at 1.042× radius separates the opaque weather deck
  from the atmosphere shell, adding depth when the camera is near the limb.
- Planet surfaces switch from repeated tiling to a single high-resolution wrap
  with linear-mipmap filtering and full anisotropy, and now use the same pixel
  map as a bump map (subtle on Azure, strong on Vesper) so terrain reads as
  relief instead of flat paint.
- Cloud decks get the same filtering/anisotropy treatment; Azure stays a dimmer,
  metal-richer world with fainter clouds, Vesper keeps its warmer look.
- Azure's ring gets a generated banded texture — uneven, semi-transparent
  bands with soft gaps — replacing the flat uniform disc, and the ring mesh is
  denser (192 segments) with slightly higher opacity.

## Debris field, asteroids, and wrecks — material depth

- Asteroid families (iron, ice, dark) and wreck scrap/rust textures render at
  higher resolution with tuned UV tiling and gain bump maps, so belt clusters
  and graveyard debris read as varied, weathered terrain instead of flat
  repeating panels.

## Audio — complete rebuild from scratch

- A single shared 3-second stereo pink-noise buffer is the common material for
  every impact, explosion, engine wash, and station ambience — one allocation,
  no per-shot noise buffers, and a much warmer sound than the old white-noise
  beeper mix (filtered Paul Kellet pink noise, generated once at enable).
- The output chain is rebuilt: effects and music route through a mastering
  compressor into the master bus, with a convolver reverb (2.35 s synthetic
  impulse, pre-delay, low-cut) that explosions, impacts, engine wash, and music
  all feed.
- Every gameplay effect now has an explicit layered generator:
  - `laser` — square zing + high-frequency noise crack
  - `missile` — rising sawtooth whoosh + throttled-down noise trail
  - `impact` — triangle thud + filtered noise burst
  - `explosion` — two-tone sub drop (saw + triangle, size-scaled) plus two
    noise layers at different playback rates (boom + rumble)
  - `mining`, `salvage`, `warning`, `success`, `dock` (rising chord + thump),
    `scan`, `ui`, and comms squelch all have dedicated generators
- The engine voice is a filtered saw/triangle/sub stack with a band-passed
  pink-noise thruster wash — pitch and filter track throttle, afterburner, and
  hull damage, and the whole rig ducks to zero while docked.
- Station ambience: a low, slow-filtered pink-noise room tone that fades in
  only when docked, with a bell tone chiming periodically.
- Music is now chord-progression based (four-chord cycle, sine bass + detuned
  triangle/saw voices through a low-pass that opens with danger) instead of
  single notes, with a square-wave pulse layer when hostiles are close. The
  tempo shifts with the danger level (2.8 s → 1.35 s between layers).
- Positional audio: hits and explosions are placed in head-relative stereo via
  a per-source pan that blends from centered at long range to hard-panned up
  close, with a squared distance falloff — far fights sound physically remote,
  nearby ones punch.
- A nearby-enemies counter feeds the danger layer (0.45 + 0.15 per hostile
  within 625 m), decaying over time when the field clears.
- **Per-source spatial audio**: every one-shot effect now owns its own
  panner + distance lowpass chain instead of sharing a single global pan —
  simultaneous impacts, lasers, and explosions no longer collapse into one
  position; far events arrive rolled-off and muffled, close ones punch.
- **A hard limiter** (−2 dBFS, 18:1) caps the final bus so the louder effects
  can never clip the destination; the mastering compressor now works on a
  calmer signal.
- **New events that were previously silent:** hyperdrive spool-up (rising
  charge whine), hyperdrive drop / arrival (collapsing-bubble swoosh), the
  active-cruise space-wind bed, and a bright rising arpeggio when the tractor
  beam catches cargo or salvage.
- **Effect loudness passes:** lasers, impacts, explosions, warnings and
  pickups were rebalanced (+6…+10 dB) so they read clearly above the engine
  and music beds — measured peaks now sit −16…−21 dBFS against a −27 dB bed
  instead of being buried.
- **Sound is on by default:** a fresh career (and any untouched legacy save)
  now starts at the designed music 0.34 / effects 0.68 instead of silence —
  the AUDIO sliders remain the mute switch.

## Deterministic hyperdrive intercept override (test harness)

- A localStorage-only override (`__VOID_PRIVATEER_FORCE_INTERCEPT__`) makes
  every hyperdrive jump roll an encounter regardless of sector danger, so the
  interrupt path is testable exactly. It is honored only in the local probes
  and never affects normal saves.
- Fixed a real determinism bug found during validation: a forced intercept
  could silently break off — an empty-handed pilot (free starter hull, no
  cargo) made both the ambush mug roll and the ship's emergent mug return
  nothing to shake down, turning the pirates non-hostile before the jump ever
  broke. Forced intercepts now go weapons-free end to end (no mug roll, and
  the spawned ships cannot open an emergent mug), so the jump always breaks
  with hostiles on the field.

## Validation

- Hyperdrive FX / intercept probe: 30/30, stable across many seeds (launch
  lane, spool ramp, drop, interrupt with red flash, hostiles spawned, autopilot
  break). Probe hardened: the override is scoped to the interrupt test only,
  and the clear-vector teleport scan is now seed-proof.
- Gameplay collision suite: 102 assertions passed (player, ships, validation,
  NPC-AI, maze routing, determinism, perf).
- Ship-stats suite: 51 assertions passed — rewritten against the current
  flat-equipment stat system (equipment modifiers, guild gating, fresh-save
  integrity, legacy hydration, repair/refill costs); `hydrateSave` exported for
  tests; `npm test` wires the offline THREE loader.
- Visual/audio audit: stations dense, audio graph safely inert without a user
  gesture.
- Live build: boots to title and Helix dock with zero console errors, all
  assets served, and the full audio graph (shared pink buffer, reverb,
  compressor, positional pan, danger music layer) verified against a real
  AudioContext.
- Visual suite: all five scenes recaptured with zero page errors; pixel diff
  vs the previous baseline shows the intended overhaul deltas (asteroid field
  25.2 % of pixels moved, station 7.2 %, planets/deep-space/dogfight ≤ 5.2 %)
  with stable framing.
- Service-worker cache: `voidrunner-v102-0-5-0-station-atmosphere-audio`.
