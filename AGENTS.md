# AGENTS.md — Voidrunner

## Headless testing workflow

- Automated tests live in `tests/unit`, `tests/integration`, and `tests/performance`; run `npm test` or the named group scripts. Shared constructors live in `tests/helpers` and must never import a test suite.
- Browser gameplay checks live in `tests/browser`; run `npm run test:browser` against a served runtime. They cover desktop Chrome, Android/Chrome and iPhone/WebKit and always mute sound. Set `VR_BASE_URL` to select the server. Install pinned dev dependencies with `npm ci`, and browser engines with `npx playwright install chromium webkit`.
- `offline-startup.mjs` must keep service workers enabled and use the normal entry URL. It checks decoded opening-screen images, offline resume, report navigation and reconnecting; isolated `startup-probe` tests do not cover these paths. HTTP success alone does not prove an image decoded.
- Screenshot capture/comparison and the supplemental frame-time probe live in `tools/playtest/probes`. They are optional diagnostics; the grouped test suites cover the former standalone regression probes. Output must go under ignored `output/`.
- **Clear the Chrome probe profiles before running probes** (`rm -rf /tmp/vr-*-profile`): the deploy update flow reloads the page when a new service worker takes control, which can land mid-poll and reset the session (probes then read a docked, projectile-free world). Fresh profiles also prevent stale cached builds from being tested.
- `__VOID_PRIVATEER__.getRuntime()` returns the **live session object** (added so probes can drive `frame()`/`updateSimulation()` deterministically). Never serialize it wholesale with CDP `returnByValue` ("Object reference chain is too long" — renderer object graphs are circular); read scoped values (e.g. `rt.ships.map(s => s.position)`).
- Probes drive a real session through CDP: headless Chrome (`--headless=new --disable-gpu --enable-unsafe-swiftshader --remote-debugging-port=9333/9334`) + the `window.__VOID_PRIVATEER__` debug hooks in `src/main.js` (`newGame`, `startArena`, `getState`, `getRuntime`, `launch`, `pickTarget`, `projectToScreen`). No test framework; probes exit nonzero on failure.
- Headless rendering runs on SwiftShader (CPU): ~43–44 fps is the software ceiling, so JS-side perf wins are masked in benchmarks — compare relative frame-time changes, not absolute fps.

## Scratch-vector aliasing traps (game.js)

- `vec(array, out)` / `quat(array, out)` return the **same object** as the passed scratch. `updatePlayer` aliases the live player position/velocity/rotation into `this.tmpA/B/C/Q`, and `resolvePlayerCollisions`'s `collide()` wrote the bounce normal into `this.tmpA` — which overwrote the player position with a unit vector, teleporting the ship to ~1 unit from the origin ("crashed into an asteroid, survived, teleported to open space"). Never write into a scratch vector that currently aliases live state; the collision normal uses dedicated `this.tmpCollide`.
- The per-ship AI (`updateAttackAI`/`updateTravelAI`/`resolveShipTarget`/`getShipAvoidance`) is deliberately allocation-free and reuses `tmpD..tmpL`; adding `new THREE.Vector3()`/`clone()` into these hot paths reintroduces GC hitches.

## HUD / UI state rules

- `ui.updateHud()` only runs while flying (`syncRender` gates on `!save.player.dockedAt`, throttled to ~every 42ms). DOM assertions on HUD values (target hint, bars, flight strip) are stale while docked — probes must `launch()` first.
- `navTargetId` must always be a valid `LOCATIONS` key: `buildHudModel` and `showMap` read `LOCATIONS[navTargetId].shortName` unguarded. Never set it to `undefined`; reset to `'shardbelt'` (the save default) instead. Selecting a location sets both `navTargetId` and `currentTargetId`; `launch()` clears the current target and resets nav if it pointed at the exited location.
- Planets are nested transparent `BackSide` shells (clouds, halo, outer halo, rings). After launching, the ship sits inside them and every touch raycast hits the shell — they must stay `raycast`-disabled (render-only), or tap-selection always resolves to the planet you just left.

## Flat entity store (entityStore.js)

- `EntityStore` (new module) holds projectile/pickup transforms in Float32Array channels keyed by **slot** (pos/vel/rot + prevPos/prevRot). The sim writes via `setPos/setVel/setPosV/setVelV` and the renderer reads the same channels — there is no per-frame sync array or shared scratch object across the sim/render boundary. Entities carry only metadata (`slot`, id, kind, damage, life); spawns alloc a slot, `cleanupEntities` frees it (free list recycles). `debugSnapshot()` reads positions from the store channels.
- Render meshes for projectiles/pickups are keyed by slot, and liveness is reconciled only when the entity count changes (`shipMeshCount`/`projectileMeshCount`/`pickupMeshCount` compare) — steady state walks and allocates nothing per frame. Ships still use plain arrays but write them **in place** via `tupleInto`/`quatTupleInto` (never `ship.position = tuple(...)` — that allocated ~3 arrays per ship per step). `updateProjectiles`/`updatePickups` run on dedicated `tmpP0..tmpP4` scratches — they must never alias live state.
- New source files must be added to the `sw.js` `cache.addAll` list or the service worker 404s them for returning players.

## Fixed-timestep sim rules

- The sim runs on a fixed 60Hz accumulator (`SIM_STEP = 1/60`, max 6 steps/frame, `simAccumulator` zeroed while paused/docked). `updateSimulation(STEP, actions)` is the only time the world advances; the renderer interpolates via `prevPosition`/`prevRotation` slots (zero-allocation Float64Arrays, snapshot at the start of each step). Keep the slots out of the save: `saveGame` strips them.
- **Edge actions (hyperdrive toggle, target cycle, missile, scan) must run exactly once per frame in the frame loop — never per sim step.** A multi-step frame double-fires them (toggle engaged + instantly disengaged the hyperdrive) and a zero-step frame (120Hz display) drops them entirely. Axis actions (pitch/yaw/roll/fire) stay per-step. `handleActions` lives in `frame()`, not `updateSimulation()`.

## Theme / CSS rules

- style.css has a SINGLE `:root` palette block at the top (base + `--void-*` + `--retro-*` tokens, effective values only). Never add a second `:root` block mid-file — the old "VOIDRUNNER STYLE LOCK" block silently shadowed the top tokens with its navy values; the effective palette IS the navy one (`--void-navy` bg, `--void-gold` accents). New colors go into that one block as tokens; dead tokens get deleted, not kept.
- The contextual touch pads (`.touch-fire.is-mining` etc.) intentionally carry NO `!important` — they win by specificity (0,2,0). Adding `!important` to any `.touch-fire`/`.touch-missile` rule re-opens the arms race; resolve conflicts with specificity or new tokens instead.
- When comparing visual changes: `capture-scenes.mjs` scenes are NOT pixel-identical across runs (world simulates: clouds rotate, radar sweeps, asteroids drift, dogfight ships move). Treat diffs at the same level as two captures of the SAME build (noise) as "no visual change".

## Performance architecture

- The obstacle grid (`game.js`) uses a numeric packed cell key (3×13 bits) instead of `"x,y,z"` strings — the string version was the top GC/CPU cost (DDA checks 26 neighbours per cell). Keep it numeric; cell coords must stay within ±4096.
- Instanced asteroids/debris upload only drifting pieces per frame (`addUpdateRange`); static rocks are composed once. Don't recompose all instances every frame.

## Release protocol

- Every runtime release bumps `GAME_VERSION` in `src/game/ui.js` AND the `CACHE` constant in `sw.js` (service worker must invalidate or phones serve stale builds). Update `README.md` and `CHANGELOG.md`. Repository-only maintenance does not require a runtime version bump.
- Headless Chrome lives at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on this machine; kill stale servers with `pkill -f "http.server 4173"` before running probes.
- **Chrome must never be spawned with its cwd inside a nested worktree** (`.worktrees/*`): the CDP browser level then hangs (`Target.createTarget` timeout) even with the sandbox flags. Pin the spawn: `spawn(chromePath, [...], { cwd: '/Users/mhoeppner/Desktop/Voidrunner', stdio: [...] })`.
- **All probes must spawn headless Chrome with `--no-sandbox --disable-gpu-sandbox`** (added to every `tools/playtest/probes/*.mjs` spawn). Without them, Chrome's child-process sandbox collides with the outer session sandbox: DevTools accepts connections but `Runtime.evaluate` never resolves and probes hang silently. If a new probe is written, copy the spawn flags from an existing probe; Node's global WebSocket transport works again once those flags are present.

## User preferences (stated across sessions)

- No floating HUD cards over the 3D view: all telemetry (SPD/THR/FUEL/MSL/HOLD/LOAD/HND/CR, shields/armor/hull) lives on the cockpit monitors. The bottom-left/right cards were scrapped for good.
- Touch pads are contextual: asteroid → yellow MINE + SCAN, wreck → teal SALVAGE + SCAN, else FIRE/MISSILE; the second pad runs a scan on deposits.
- Phones: tilt-only steering (joystick removed), hyperdrive engages by tapping the target monitor when a location is locked (hint reads "ACTIVATE HYPERDRIVE"), pause/fullscreen buttons top-left, thrust is a drag slider.
- Docking/landing is automatic when slow and close (no button); AI fights WW2-style with strafing runs, and encounters never stack on an active one.
