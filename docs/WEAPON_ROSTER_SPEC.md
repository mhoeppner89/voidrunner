# Voidrunner Weapon Roster — Spec Sheet (v1)

Gauntlet goal: meaningfully different weapon types, each creating its own fun
play style, judged against **Everspace 2's primary weapon lineup** (see
`docs/bar-everspace2-weapons.md` once the researcher delivers it).

## Baseline today

- Player guns: `firePlayerGuns()` in `src/game/game.js` (~L2013) — twin muzzle
  bolts, `kind:'laser'`, speed 205, cd 0.17s, dmg `stats.gunDamage`
  (8–19 by hull), life 1.35, aim-assist lerp toward locked ship.
- Missiles: `fireMissile()` (~L2074) — homing, dmg 42, cd 1.1s, ammo
  `save.player.missiles` (cap `missileCapacity` 2–10).
- NPC guns: `fireNpcGun()` (~L4670) — speed 150, role-based cd, aim jitter.
- Projectile sim: `updateProjectiles()` (~L4703) — segment sweeps vs obstacles,
  player sphere, ships; impacts spawn renderer sparks + positional audio.
- Render: `syncProjectiles()` in `src/game/render.js` (~L1993) — mesh per slot,
  created once, branched on `projectile.kind`.
- Audio: `play(effect)` switch in `src/game/audio.js` (~L777); per-effect
  synth voices (`playLaser`, `playMissileLaunch`, …) + release-time table.
- Input: `src/game/input.js` — held actions `fire`(Space/touch/gamepad),
  edge `missile` (KeyM consumePressed / touch / gamepad), HOLD_ACTIONS set.
- Stats: `src/game/shipStats.js` multiplies base SHIPS stats by equipment;
  equipment ids live in `src/game/data.js` EQUIPMENT (pulse-mk2 etc.).

## Roster (6 primary weapons + missiles secondary)

| id | Name | Fantasy | Key numbers (base) | Ammo |
|---|---|---|---|---|
| pulse | Pulse Laser Array (existing, renamed) | All-rounder energy repeater | speed 205, cd 0.17, dmg gunDamage, life 1.35 | ∞ |
| gauss | Magrail Gauss Rifle | Long-range duelist: line them up, delete them | speed 620, cd 0.95, dmg 3.2×gunDamage, life 1.6, **over-penetrates** first ship hit (continues to second target), tracer leaves ionized trail | Slugs: 48 cap |
| pdc | Point-Defense Cluster | Guardian: shred missiles + point-blank king | speed 170, cd 0.06, dmg 0.55×gunDamage (**101 DPS inside 71u** — beats pulse point-blank), life 0.42, spread cone 4°, **auto-intercepts hostile missiles within 60u** even when not aiming at them | ∞ (heat-gated: 3.5s sustained → 1.6s vent) |
| ripper | Ripper Scattergun | Brawler: get inside their turn | 7 pellets/shot, speed 150–185 per pellet, cd 0.78, dmg 0.55×gunDamage per pellet, spread cone 11°, life 0.5 | Shells: 36 cap |
| ion | Ion Lance | Shield-cracker / support control | speed 240, cd 0.62, dmg 0.5×gunDamage to hull but **×4 vs shields** + target weapons jammed 1.8s (NPC holdFire), blob render w/ arc flash | Cells: 60 cap |
| mortar | Sunlance Plasma Mortar | Siege: bombard camps, freighters, rocks | speed 85 arcing blob, cd 2.2, direct dmg 30, **splash r=26** falloff to 12, applies burn 6dmg/s ×4s, big slow orb w/ ember trail | Pods: 10 cap |

Missiles stay as-is (secondary ordnance, KeyM). Mining/salvage beams untouched.

## Playstyle contract (what "meaningfully different" means)

Each weapon must change WHERE you fly and WHEN you shoot:
- gauss → kite at 400+u, pre-aim lanes, reward for predicted straight lines.
- pdc → fly BETWEEN missiles, babysit wingmen, face-hug brawls survive.
- ripper → turning fight, brake-trap chasers, useless beyond 120u.
- ion → open fights by cracking shields, combo with any kinetic, anti-ace tool.
- mortar → orbiting siege, area denial, mining-camp demolition, slow but huge.
Numbers above are starting points; builders tune, critics verify the FEEL
difference is provable in sim telemetry (probe assertions), not just on paper.

## Hard architecture rules (from AGENTS.md — violations reject the build)

1. Weapon SWITCH is an edge action: handle exactly once per frame in
   `frame()`'s `handleActions`, NEVER inside `updateSimulation` steps.
   `fire` stays per-step (held). Add Digit1–Digit6 keys + touch weapon chips +
   gamepad (LB/RB cycle or existing spare buttons).
2. Projectile state lives in the EntityStore slots; metadata on the entity
   object. New fields (splashRadius, burn, pierce, heat) ride the metadata.
   NO per-frame allocation in updateProjectiles/fire paths — reuse
   tmpP0..tmpP5 scratches; never alias live state (see scratch-vector traps).
3. Scatter/spread randomness MUST come from the seeded rng utilities
   (`src/game/random.js`) keyed to sim time — never Math.random — so headless
   probes reproduce runs.
4. Save compatibility: `save.player.weaponId` + `save.player.ammo = {gauss,
   ripper, ion, mortar}` default-filled on load for old saves; saveGame strips
   nothing new that breaks older versions.
5. Render meshes: create per-kind branches in syncProjectiles keyed by slot
   (kind is immutable per slot lifetime). Interpolation via store prevPos only.
6. Audio: one new synth voice per weapon in audio.js `play()` switch + release
   table entry. Distinct signature: gauss=crack+whine, pdc=buzz rip,
   ripper=boom-scatter, ion=zap-hum, mortar=thoomp.
7. HUD lives on cockpit monitors ONLY (no floating cards): weapon name + ammo
   readout integrated into existing flight-strip monitor model (ui.js);
   touch pads stay contextual (FIRE label reflects weapon; MINE/SALVAGE win
   near asteroid/wreck as today).
8. i18n: every new user-facing string gets EN + DE entries (i18n-de.js).
9. Any NEW source file must be added to sw.js cache.addAll. Prefer editing
   existing files; new module only if clean.
10. style.css: tokens only in the single top `:root`; no new !important arms
    races; contextual pads keep specificity wins.
11. No version bump / release protocol yet — that is the final integration step.

## Verification contract

- New `.freebuff/probe-weapons.mjs`: per-weapon assertions proving DISTINCT
  sim parameters (per-kind speed/cooldown/damage measured from live runtime;
  pellet count & cone; gauss pierce hits 2 ships; pdc intercepts a hostile
  missile; mortar splash damages a second ship; ion ×4 shield delta; ammo
  decrements; heat vent gate; switch edge-action fires exactly once per frame
  under multi-step frames). Exit nonzero on failure.
- All existing probes stay green (probe-r1, probe-ai, probe-sim-fixed,
  probe-store, probe-hyperdrive-fx, probe-tilt, probe-theme).
- Serve via python3 http.server 4173; clear /tmp/vr-*-profile first; probes
  run ONE AT A TIME (shared CDP ports 9333/9336).

### Verified status (lead run, post-roster)

Green: probe-weapons 15/15 · probe-sim-fixed 26/26 · probe-theme 7/7 ·
probe-tilt 14/14 · probe-store 8/8 (1-in-N timing flake: the transform
sample needs a live projectile). probe-ai 97-98/101, probe-r1 11/12,
probe-hyperdrive-fx ~24/30 — every remaining failure was bisected against
the pre-roster release (5c30292) and is PRE-EXISTING, not roster-caused:
2 documented debris flakes + 2 cover-scenario failures (ai), the load-rule
drift (r1), and the interrupt-encounter scenario (hyperdrive-fx). Probe
tooling fixes by the lead: `--no-sandbox --disable-gpu-sandbox` added to six
stale probes, `__VOID_PRIVATEER_PROBE_LANG__='en'` pin in r1/hyperdrive-fx
(fresh profiles boot German-default saves). A zombie `http.server 8123`
served stale builds to hyperdrive-fx until killed — always check the port
the probe actually uses.

## Gauntlet protocol per piece

Builder implements → SEPARATE fresh-context critic compares against the
Everspace 2 dossier blind (labels stripped) + inspects actual code/probe
output → names the single biggest gap → back to builder until critic picks
ours. Harsh critics. No round-count exits; exit = winning the comparison.
