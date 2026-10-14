# RELEASE NOTES — 0.7.7b (bugfix gauntlet)

Build `0.7.7b` · cache `voidrunner-v117-0-7-7b-bugfix-gauntlet` · base `0.7.7` (715d79e)

Two parallel fix agents worked from `BUGLOG.md` (hunt rounds 1–10) plus the user's
pointers; this file lists the main-branch (0.7.7b) fixes. The parallel `release/0.7.7a`
branch carries an independent racing-guidance port — merge decision deferred.

## Rendering

- **Azure ring rendered THROUGH the planet** (user screenshot): the far half of the
  ring passed the depth test and drew straight across the disc. Root cause is depth
  precision, not draw order — with near 0.08 / far 2,000,000 the depth resolution at
  orbital range exceeds the planet radius, so no depth state can separate ring from
  surface. The ring shader now occludes analytically: the camera→fragment segment is
  ray-tested against the planet sphere (`cameraPosition` is a built-in), with a
  view-distance-scaled soft fade at the grazing limb. Verified at mid/close/far and
  low-angle framings: far arc hidden, near arc in front.
- **Cloud decks scrapped** (user-approved perf cut): Azure's two layers rendered at
  0.11/0.13 opacity — invisible at play distances — and the dry-worlds' 0.40 deck
  washed the disc. Removes two transparent sphere passes per planet, their textures,
  and the per-frame rotation updates (no "wave" layers existed). The atmosphere
  halo/haze shells keep the limb depth cue.

## Cockpit monitors

- **STATUS monitor clipped its right side** (BUG-01, high): `.screen-ship-layout` /
  `.screen-target-layout` had auto-sized grid columns — the hull canvas' intrinsic
  300px bitmap and long one-line ticker messages inflated the track past the monitor
  edge, silently clipping the FRACHT readout and cutting the ticker mid-word (worse
  after locking a far target: 447px of content in a 252px monitor). The single column
  is now pinned with `grid-template-columns: minmax(0, 1fr)`, so every ellipsis works
  as designed. Verified: monitor scrollWidth 252=252 at desktop, 167=167 on phones
  with a stress ticker line.
- **Flight telemetry was 4.3–5.3px on phones** (BUG-03): font floors raised
  0.32/0.33rem → 0.45rem (7.2px at 844×390); the flexible bar track absorbs the width.
- **Race + standoff strips reworked** (BUG-20/21 + user report): the opaque boxed
  backdrop read as a stray dialog on the monitor glass — both strips now ride the
  monitor background with a text glow. The race strip hides during the travel leg
  (guidance moved to the gate marker/radar/map), and its running label drops the
  course title ("TOR 3/13" + rank + clock never clip; the value is `flex-shrink: 0`).

## Racing guidance (0.7.7b implementation)

- **First gate visible during the travel leg**: gate meshes sync at accept (and on
  reload restore) instead of popping only at the grid.
- **Gates are first-class targets**: `selectTarget('gate', …)` locks any course
  checkpoint at ANY distance (mission anchors, like mining claims); the target
  monitor renders a ring schematic + state readout (START/ZIEL · line up to begin /
  NEXT CHECKPOINT / CLEARED / UPCOMING).
- **Nav map**: the cleared gate (orientation) plus the next three checkpoints surface
  on the chart regardless of distance, teal ring markers, tap to lock.
- **Radar**: the cleared gate (green, ticked), the next checkpoint (yellow, pulsing),
  and the first upcoming one (grey) render as circles on the disc; beyond-horizon
  gates clamp to the rim with a distance readout.
- Full flow verified by `.freebuff/probe-gate-targets.mjs` (10 checks, all pass):
  travel visibility, map contacts, lock/monitor, radar blips, strip phases,
  countdown → running → gate passage.

## Combat / sim

- **Aim assist led with the wrong speed** (user report: "aim assistance seems
  bugged"): the assist lead hardcoded `distance / 205` (the pulse speed) — the
  mortar's lead was 2.4× too short and the magrail's 3× too long, pulling shots
  BEHIND crossing targets, and the pilot's own drift was ignored. The assist now
  solves the intercept in the shooter's frame with the weapon's own speed (same math
  as NPC gunnery). Verified per weapon by `.freebuff/probe-aim.mjs`.
- **NPC gunnery audited**: an ace lands ~100% of shots on a non-maneuvering target
  (13 shots → 72 damage measured); the "NPCs aim badly" perception is the
  boom-and-zoom rhythm (intended WW2 style), not the lead math. Ship timers
  (`fireCooldown`/`missileCooldown`/`shieldDelay`) are NaN-guarded — a malformed
  spawn previously produced a pirate that silently NEVER fired.
- **Splash/burn kills lost the combat drop** (BUG-24): `destroyShip` defaulted the
  pickup position to `undefined` for mortar-splash and burn kills → TypeError in the
  frame guard, the sim step aborted mid-way and the 64% drop never spawned. The
  parameter now defaults to the dying ship's position.
- **`updateSearchAI` allocation-free** (BUG-25): player/position/anchor vectors ride
  the session scratches (tmpA–tmpD; callees verified not to touch them), removing
  ~40–70 small allocations/sec while contacts are active.

## UI / text

- **Comms bar** (BUG-02): the German FUNKLOG hint stayed visible during a
  transmission (specificity: `html[lang="de"] .comms-bar::before` beat the active
  suppressor) — the suppressor now matches it explicitly; both pseudo hints are
  `nowrap` + `flex-shrink: 0`, so "CONTINUE ▸" no longer letter-stacks when squeezed.
- **Comms log rows** (BUG-04): long unbreakable tokens wrap (`overflow-wrap:
  anywhere`) instead of running under the card edge.

## Tooling

- `.freebuff/probe-gate-targets.mjs` (racing guidance, 10 checks), `.freebuff/probe-aim.mjs`
  (NPC accuracy + per-weapon assist intercept). Probe fixes: stale 24%-handling
  assertion updated to the shipped 10%/full rule (0.4.7t tuning), store-transform
  check now fires a player bolt first (a duel lull left zero projectiles airborne).
- Note: `.freebuff/probe-racing.mjs` was rewritten by the parallel agent for the
  0.7.7a branch API (`'raceGate'` kind, `raceGateApproach`) and does not apply to
  this tree; the cover checks in `probe-ai.mjs` flaked under parallel-probe CPU
  contention and need a quiet-machine re-run.
