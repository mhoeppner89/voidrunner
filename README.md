# Voidrunner

A browser spaceflight game with career missions, equipment loot, Arena Run and spectator battles. Current runtime: **0.8.2ij**.

Race pilots contest lanes, block closing pursuers and lean into shoulder passes. Hull contacts transfer momentum and interrupt thrust; hard hits can damage the hull. Rivals recover control and set up another pass. Choose one of four dedicated race hulls; hold thrust to accelerate, brake to slow down, and release both to coast. Racing uses the same afterburner flight physics at higher speed and respects the player's Flight Assist setting. Three optional pickups per graveyard course provide five seconds of stronger lateral drift damping without raising speed or refilling thrust. Run `npm run test:browser:race-hulls` for the desktop/iPhone checks and isolated race session.

## Run locally

Use Node.js 22.15 or newer and Python 3. Serve the project from its root:

```sh
python3 -m http.server 4192
```

Open `http://127.0.0.1:4192/game.html`. Spectator mode: `game.html?mode=observer`.

Start a new career to play the rebuilt family prologue: trade and flight lessons, a mining contract, Paul’s rescue and repair-drone lesson, carrier-hangar stealth, then local free play and the black-box mission. The jump gate reopens after the Cairn reunion; Mara’s call keeps the existing 50k ship/equipment/half-cash value threshold.

Clicking the Wayfarer before the opening conversations shows a short keys message and leaves the station controls usable. Blocked or failed departures restore the dock controls.

The opening trade uses Buy max for Protein and tracks the loaded amount for the Vesper sale. The afterburner lesson starts after hyperdrive drops at Vesper and speeds up the approach to 5,000 km. Tutorial comms give the next action based on your actual progress. The mining lesson pays 3,000 cr for six ore at a static deposit about 1,000 km from the Vesper approach exit. Finishing the quota preserves the mining target and working drones. The first pirate standoff leads into Rin’s paused combat dialogue, covering weapons, energy and wing orders before the fight resumes. That pirate carries one guaranteed green tier I weapon; after the kill, Rin explains tiers, rarity colours and normal wreck recovery. Dropped equipment uses a rarity-coloured salvage container and diamond beacon in space: white, green, blue or gold, with one to four pips. The colour reflects the best item still inside. Loot stays stationary at its drop position; loose cargo moves only during collection. Destroyed ships separately break into painted hull sections with damaged bulkheads, internal frames, drifting armour plates and varied ballistic spin. Fracture geometry is prepared in short idle jobs and reused across kills. After the first flight, learned controls only receive a reminder after a minute without useful progress. Short dialogues introduce launch, contract acceptance, drone roles, repair support and hiding; repeat visits provide a brief reminder. Mara’s Cairn call appears in port as well as in flight. Rin opens a dialogue after the first Vesper landing and after the Protein sale. Trade through the normal commodity market, then select the gifted reactor in Equipment → Storage and Install; Story provides instructions without shopping or fitting shortcuts. Owned equipment fits directly from cargo or local storage into a free compatible mount; a full fit asks you to choose a replacement. Run `npm run test:browser:tutorial` for the muted desktop and landscape-phone guidance, fitting and campaign checks.

Commodity cards place prices beside their icons and keep owned counts on the cards, without a second cargo summary. Shipyard costs stay with their purchase/exchange actions; empty placeholders and duplicate status labels are omitted.

The own-ship monitor opens separate Flight, Equipment & Cargo, Drones and Journal sections. Drone bays support mining, PDC and repair; select a role docked or in space, then resume flight for any automatic return and swap. Repair drones patch their own hull first, then damaged friendlies within 200 km, consuming their owner’s energy. Paul carries two and introduces them after his rescue. Attack drones in older saves become PDC drones. Notifications use the cockpit ticker and Journal instead of floating toasts. Run `npm run test:browser:ship` for the terminal and drone-switching checks.

Player hulls use explicit, rounded capacities and individual shield/energy regeneration. Repeated bonuses give full, half, quarter and progressively smaller contributions; heavy equipment affects handling. Utility counts reflect hull roles, while weapon mounts remain unrestricted. Existing saves retain modules displaced by the revised mounts in station storage or cargo. Run `npm run balance:ships` for the fitting-budget gallery and moving-combat report. See [the balance plan and results](docs/PLAYER_SHIP_BALANCE.md).

Shardbelt now resembles a fractured parent asteroid: ten large rock sections, connected rough tunnels, mineral strata, 18 varied impact bowls, mottled crust and smaller drifting fragments within the existing field boundary. Run `node tools/playtest/asteroid-review.mjs` for the orbit/tunnel review and `output/asteroid-review/races.html` for all three racing lines, with X-ray, scrubbing and flythroughs. Shardbelt rivals follow a continuous racing line, brake for tight turns and cross the same gate apertures as the player. Their seeded skill tiers leave a spread of finish times. Shard Gauntlet follows the central bore and eastern rim; Shard Switchback links the mineral gallery and chimney; Miner’s Knife joins all three in a longer circuit. Run `node tools/playtest/race-session.mjs` for the isolated playable race selector, or `node --import ./tests/helpers/offline-imports.mjs --test tests/integration/asteroid-racing.test.mjs` for physical NPC races.

## Repository layout

| Folder | Contents |
|---|---|
| `src` | Game simulation, renderer, UI and styles |
| `assets`, `art`, `vendor` | Shipping assets and the bundled Three.js runtime |
| `tests/unit` | Isolated rules, save migration and small systems |
| `tests/integration` | Gameplay flows, fleet geometry and equipment |
| `tests/performance` | Allocation, resource reuse and collision regressions |
| `tests/browser` | Muted desktop, Android and iPhone gameplay checks |
| `tests/helpers`, `tests/fixtures` | Shared setup and small measured asset records |
| `tools/assets` | Asset generators, collision/schematic bakes and audits |
| `tools/maintenance` | Test runner and deployment packaging |
| `tools/playtest` | Screenshot comparison and optional performance diagnostics |
| `docs` | Current specifications, verification notes and release records |
| `authoring` | Source manifest; ignored editable models and original references |
| `output`, `dist` | Ignored generated reports/captures and packaged runtime |

## Verify changes

```sh
npm test
npm run test:unit
npm run test:integration
npm run test:performance
npm run build
```

`npm test` runs every maintained Node test. Shared helpers do not register tests. The Node checks need no installed dependencies; browser checks use pinned Playwright:

```sh
npm ci
npx playwright install chromium webkit
VR_BASE_URL=http://127.0.0.1:4192 npm run test:browser
```

Browser checks mute sound and write screenshots/results into `output/playtest`. On this Mac they use installed Chrome; on other hosts Playwright's Chromium is used. iPhone and Android checks are browser emulation, not native device simulations.

## Model authoring

`authoring/manifest.json` records the current model sources and SHA-256 hashes of their shipping GLBs. Editable Blender sources live locally under `authoring/models`; original reference meshes and artwork live under `authoring/references`. These large files are intentionally excluded from Git and deployment. Keep them in the external authoring backup when moving the project to another machine.

After changing a shipping hull, rebuild its derived data:

```sh
node --import ./tests/helpers/offline-imports.mjs tools/assets/bake-ship-colliders.mjs
node --import ./tests/helpers/offline-imports.mjs tools/assets/bake-ship-schematics.mjs
npm test
```

`npm run audit:collisions` generates the overlap gallery in `output/ship-collision-audit`. `npm run benchmark:collisions` measures the fitted queries. Preserve the approved hull calibration and mount anchors when exporting; a general Blender export is not a guarantee of identical geometry or runtime transforms.

## Deployment

`npm run build` creates `dist` from an explicit runtime allowlist and checks every static service-worker cache entry. GitHub Pages uploads `dist`, so tests, model sources, documentation and generated diagnostics are never published.

Runtime releases update the game version, service-worker cache key and changelog together. Repository-only maintenance leaves the runtime version unchanged. Historical experiments were removed from this checkout after retaining current sources and useful tests; Git history remains intact.

Dock services combine ship and carried-drone repairs, ship fuel and ammunition refills, and a paid paint preview. Buy replacement drones in Equipment. Repainting costs 1% of the hull price (rounded to 50 cr, minimum 250 cr).
Drones do not consume ammunition or need rearming. Stock NPC Wayfarers carry one repair drone in place of a PDC drone; their defensive PDC turret remains. The drone repairs its owner first, then friendlies within 200 km, using the owner’s energy. Spectator battles simulate and render the same NPC drone behavior.

New careers ask once whether to play the tutorial. During a career, the Story button in the station header opens the current objective; there is no persistent tutorial strip or mid-story skip control.

Choosing the tutorial opens its first Story card automatically. Story and journal cards show only the present task and a short practical hint, without chapter counters or previews of later tasks.

The cockpit ship menu’s Weapons section assigns fitted guns to A/B and controls each group’s alternating/together firing. Fire All combines both groups with their own modes; launcher firing stays separate. Gun group settings persist per hull.

Rebuild the graveyard and race review pages with `node tools/playtest/graveyard-review.mjs`, then open `output/graveyard-review/races.html` on the local server. The three Cairn race courses now follow the current wreck geometry.
