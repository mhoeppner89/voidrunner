# Voidrunner

A browser spaceflight game with career missions, equipment loot, Arena Run and spectator battles. Current runtime: **0.8.2lf**.

Procedural pilot comms and random-encounter dialogue use 24 individually prompted, anonymous cockpit portraits: six each for Concord, Alliance, Independents and Pirates, with three male and three female portraits per faction. Files 01–03 are male; 04–06 are female. Each image is a separate 647×768 WebP. Each pilot gets a random portrait from their faction, reused throughout their exchange.

All thirteen stations use architecture based on their concourse, bar and market artwork. Helix retains its tiered refinery silhouette, with 77 closely spaced pressure buildings, fully supported foundations, sealed exterior walls and six detailed glazed park courtyards on the upper deck. Its radar dishes have supported outriggers clear of the tower. Rook has a pitched armored roof, continuous lower keel, eight Cruiser batteries, sixteen capital PDCs and three downward-facing capital docking ports. Rook uses Concord navy, pale armor and brass; two frigates dock belly-up beneath short pressure collars; its small-ship entrance remains clear. Ordinary windows and utility fittings use the same scale as fitted ships and capital-ship windows. Station shells retain ten materials, one atlas and the 40,000-triangle / 2.5 MB limits. Run `npm run review:stations` and open `/output/station-review/gallery.html?revision=0.8.2kn`; each card opens the model and its artwork comparison. Refresh gallery thumbnails with `VR_PROFILES=desktop VR_VIEWS_ONLY=1 node tests/browser/station-models.mjs`.

Service → Hull paint opens a rotatable editor for all fifteen player hulls: four distinctive patterns fitted to each hull, three independent colors, palette suggestions and the original factory finish. Previewing and cancellation are free; applying a changed design uses the hull's repaint fee. Paint persists separately per hull and appears in flight, concourse scenes and cutscenes. Repaint and shipyard previews share the same steady turntable, drag inspection, neutral lighting and final pixel shader used in spaceflight. Run `npm run review:paint` for a temporary workshop that leaves the career untouched, or `npm run test:browser:paint` for muted desktop/Android/iPhone checks. See [SHIP_PAINT.md](docs/SHIP_PAINT.md).

Run `npm run review:discoveries` and open `/output/exploration-review/index.html` to review the Kestrel Nine logs, triangulated wreck, share/fight encounter, hidden graveyard caches, Lantern rescue, recurring distress calls and combat feedback. Twenty-eight scene presets, replay, next-discovery and save/reload controls use the live game with an isolated in-memory save. Sound starts muted and can be enabled in the review toolbar. `npm run test:browser:discovery-review` checks scene switching, loot recovery, both salvage choices, distress comms and combat cues, save/reload and career-save isolation on desktop, Android and iPhone.

For a focused pass over the recurring distress system, run `npm run review:distress` and open `/output/distress-review/index.html`. Fifty-six presets are grouped by variant, with an “Ankunft & Briefing” group first: one 500 km arrival per variant where the scenario card must open by itself. Every variant also starts with a signal scene 6,800 km out so the journal waypoint and hyperdrive jump are part of the test; the separate “Nahaufnahme” presets begin after that jump for convoy fights, wreck and survivor states, trap scanning, fuel and parts transfers, debris escape, jettisoned cargo, disputed salvage, raider retaliation and the journal history. The debris variant adds nine presets beyond its signal and close-up: the mission offer that opens on approach, the handover still pending, the beacon route, the transport joining the trail, straying from the corridor, a struck transport, the jump-point spin-up, a transport lost to the solar front and the clean escape. Comms, a ten-second simulation step, journal, save/reload and a live state inspector (phase, objective, actors, targets, hold, settlement) sit in the toolbar. The page uses the same isolated in-memory save and never touches the career save.

Recurring distress calls arrive on their own schedule during ordinary flight: a convoy under attack, a destroyed freighter, a pirate trap, a fuel shortage, a disabled ship, a debris escape, jettisoned cargo or disputed salvage. Each of the eight variants has two authored setups. A new call first shows as an orange beacon on the radar with its distance; setting the journal waypoint and jumping there brings the pilot into comms range, where the channel opens its own arrival briefing — the contact, the situation, and the decision the variant offers — and pauses the world until that decision is made. The briefing opens once per event and stays available from the journal afterwards. Answers use real fuel, parts, repair drones or cargo space; survivor pods reserve mission cargo and pay on docking; ignoring a call carries no reputation penalty. The debris escort starts its transport in a local pocket: the arrival briefing carries the objective, storm window, risk and payout, accepting projects a beacon route from the pilot's nav, the pilot closes to the trailing transport for the handover, and only then does the 3:30 solar-front clock start; the transport flies the pilot's exact breadcrumb trail, leaving the swept corridor damages both hulls, and the front turns the run into a timed dash to a jump point outside the pocket. One event is active at a time, and its actors, damage, trail clock and settlement survive reloading. Raiders answer fire: a hit raider breaks off its convoy victim to engage the attacker for 45 seconds, then returns to the encounter's normal target assignment. New signals are logged 3,000–10,000 km away, beyond discovery range, so responding means setting the journal waypoint and making a local hyperdrive jump; answering still requires closing to 1,400 km. The map and radar offer a selectable waypoint, and the cockpit monitor shows the current objective. Each caller speaks in their own voice; the objective stays on the monitor rather than in the dialogue, and backing a claimant in a dispute gets that crew’s own reply.

The cockpit menu’s Cargo view shows used/total cargo mass, a fill percentage and a capacity bar, including equipment and mission cargo.

Space pickups show their actual cargo/equipment icons and quantities in the own-ship monitor after any story dialogue closes. Receipts leave flight telemetry visible and do not pause flight.

The Kestrel Nine derelict has collision fitted to its posed fragments and persistent fire/coolant smoke at torn faces. Carrier wreck collision retains its actual deck surfaces, and its hidden cargo sits outside an exposed deck edge.

Exploration containers sit close against tunnel walls and broken hull surfaces, with clear approaches for fly-over collection. Existing saves receive the fitted positions while retaining their remaining cargo and discovery progress.

Fly over dropped cargo or equipment to collect it, with no target selection, scan or salvage controls required. A fitted Beutesammler / Loot Collector automatically beams drops aboard within 150 / 200 / 250 km for tiers I / II / III. Buy and fit it through normal Equipment; only the strongest fitted collector applies. Cargo limits, reserved drone cargo space and solid obstacles still apply. Large wrecks retain their normal salvage mechanic.

Companions restore their formation destination after collision or search cleanup clears it. This prevents repeated flight-update exceptions while Paul is hiding in the carrier. The restored route reuses a buffer instead of allocating one on every contact. Run `npm run test:browser:carrier-hiding` for the muted real-carrier contact and extended-wait regression.

Wreck cartography uses pulsing survey stars: fly within 100 km at any speed. Selected stars over 2,000 km away accept a normal hyperdrive jump, dropping around 500 km out on a clear route. Paul explains the transponder controls, talks while you hide and reminds you to restore your identity afterward. The patrol sequence has its own quiet tension score. Stations accept arrivals with either transponder state; patrol scans and berth fees still apply. Run `npm run test:browser:survey` for muted desktop, Android and iPhone mission checks.

Ship, turret and wreck materials now share the landing renderer’s safe fallback for invalid normal mapping. HDR and glow filters reject non-finite colour values before they can spread into rectangular artifacts. Run `npm run test:browser:render-finite` for native Chrome/Metal and WebKit GPU checks. Valid textures, lighting and colours remain unchanged.

Rin opens the first combat briefing after four seconds and starts with defensive covering fire. In that first duel she fires occasional forward-gun shots, holding turrets and missiles; later story battles retain her normal weapons. Equipment stored elsewhere appears under “Andere Stationen” with its station on each card, and the section is hidden when empty.

Temporary turret meshes preserve the hull textures they borrow, including damaged mounts. Their expiry follows the last simulation refresh rather than the entire time accumulated before a draw. This prevents slow frames from repeatedly retiring mounts and uploading nearby ships' unchanged hull maps when turning away from a mining target.

Selected destinations remain on the radar rim beyond sensor range. Target arrows stay visible when the cockpit frame or instruments hide the target, using the actual cockpit artwork's transparency. Run `npm run test:browser:navigation` for muted desktop, Android and iPhone checks of all cockpit plates, distant bearings and selecting a destination while mining drones continue working.

New careers start with two ordinary beam lasers and no missile launcher. The first tutorial pirate drops only one green tier I missile launcher. Drone bays sit in the equipment mount list; buy, fit, store and sell drones through the same inventory cards. Each bay holds one drone of any supported role, using the same physical port. Miners carry up to two units per trip. Existing two-miner saves retain their spare miner in cargo.

Field collision queries reject distant meshes before inverse rotations and narrow nearby triangle searches using each fitted hull. Exact contact tests, response order and tunnel openings remain unchanged. Run `node --import ./tests/helpers/offline-imports.mjs --test tests/performance/ship-mesh-work.test.mjs` for exhaustive comparisons across all 19 hulls.

Cockpit touch controls update only when their action, drone state or launcher changes, and share the HUD’s existing drone snapshot. Dock and cinematic views reuse a bounded colour-only canvas buffer with their original viewport, pixel scale and crop. Scene and reflection depth buffers remain. Cutscene setup waits asynchronously for the preceding GPU work before resizing its canvas at either end of arrival. Run `node tests/browser/cockpit-hud-work.mjs` for muted desktop/phone control checks and a stopped-world comparison of HUD work. `node tests/browser/concourse-output.mjs` compares the retained canvas against the former allocation pixel by pixel and checks its CSS crop. The final colour buffer is bounded at 768×480 on touch devices and 960×600 on desktop; only each scene’s original viewport is shaded.

Static wreck sections now share draws while retaining every triangle, UV, normal and damage pattern. Four longitudinal clusters retain close-up culling; repeated layouts share the resulting buffers. Station service cradles and gantries use two or three instanced draws. Static scene transforms no longer force repeated world-matrix work, while traffic and service lifts retain their normal motion. NPC preparation uploads actual cached hull buffers as well as shader representatives, sharing their geometry with the visible models. Run `node tools/playtest/probes/scenery-batching.mjs` for fixed-view pixel and draw-count comparisons; output stays under ignored `output/scenery-batching/`.

Station approaches prepare decoded textures, material programs and geometry buffers before first use. Collision setup yields between short tasks, dock lights upload only when their sequence changes, and the next station film reuses the dormant concourse renderer. Career startup prepares nearby graveyard buffers behind the loading cover. Loading and film preparation wait asynchronously for queued GPU work to complete, with cancellation and timeout recovery. Landing and departure prepare their lighting variants before starting their animation clocks; successful departures return directly to the cockpit without redrawing the hidden dock. Models, textures, approved camera paths and ship placements retain their detail. Run `npm run test:browser:station-performance` for muted desktop, throttled Android and iPhone/WebKit diagnostics; these compare local browser behavior rather than physical-phone FPS. Add `?debug-shaders` to enable driver shader diagnostics during QA.

Stations use small personnel airlocks sized against ship glazing and station windows, with separate large freight shutters. Occupied buildings have windows on all four sides; halls, courtyard walls and pressure rings have additional window banks. The export checks that each pane rests against a real wall and removes panes across excavated openings. Broad panel textures, contact shading and stable surface accents retain the existing ten-material limit and one atlas. Ship paths and clearances remain checked against the shipped geometry.

All thirteen station landing spaces now follow their concourse artwork: deep inhabited halls at Helix and Rook, a factory hall at Unity, sheltered working decks at Cairn, Argent and Gatehouse, open platforms at the cliff port and smaller outposts, and open trading or industrial courtyards at Haven and Cinderfall. Entrances lead into the shared station interior rather than ending in separate garage blocks. Private player berths, NPC lanes, collision meshes and landing cameras use the new floors. Sources and rebuild instructions are in [docs/STATION_MODELS.md](docs/STATION_MODELS.md). Run `npm run review:stations` to compare every concourse with its artwork. Static shells retain at most ten material batches and one panel atlas apiece.

Flight comms use the free space in each hull's cockpit, with separate phone layouts and room reserved for wing-order controls. Sender labels are shortened beside the portrait; the log retains the original names. Normal messages expand to show their full text. Longer messages use automatic pages when the available space requires them, without scrolling during flight. Run `npm run test:browser:comms` for the muted all-hull desktop/Android/iPhone checks.

Bar contacts are limited to Mara, Rin and Paul's story appearances. Filler locals and generic news/advice topics are removed; contract, race and guild boards remain directly accessible.

New and resumed docked careers start with the ship already parked. Location buttons keep their labels centred on phones, with compact touch targets and no hidden-description padding. Concourse, market and bar controls stay inside the scene and clear of neighbouring buttons, including bars with more than three contacts. Run `npm run test:browser:locations` for the muted desktop/Android/iPhone audit of every port and its tabs.

Selected targets keep their original colours. Asteroid surfaces stay natural after scanning, and targeting pickups does not brighten their glow. Brackets and cockpit instruments identify the current target.

Landing and departure sound follows the actual animation: engine passes, planetary air, hangar room tone, lift-off spool, landing gear and contact. Skipping or hiding a film stops its sound. The isolated landing review has an optional Sound checkbox, off by default. Mining drones retain their hidden render resources between deliveries, avoiding repeated shader compilation.

The pixel finish preserves original artwork colours. Ordered dithering, sprite palette conversion, monitor colour filters and stacked location-art colour adjustments are removed. Landing backgrounds and ships share one crisp pixel grid, with no smoothing or palette reduction; instruments retain readable native text. Original artwork is decoded directly, without a second converted bitmap.

Landed ships use the approved editor angles, scales and separate desktop/phone placements for all 17 painted platforms, with matching lighting and reflected room colours. The painted backdrop, ship, shadow and reflection are combined before one shared pixel shader. Ships enter from outside the screen, settle into the authored position, then fly completely off-screen on departure at constant model scale. Shadows track each rendered frame, soften and fade with height, and stay inside the painted pad. Polished decks receive a subtle ship reflection; dry pads stay matte. Run `node tests/browser/concourse-shadows.mjs` for pad clipping, height and motion checks on desktop/iPhone. Run `npm run test:browser:concourse` for muted desktop/iPhone checks of every playable hull and port. Planetary departure uses a separate front-quarter tracking shot, with the planet receding behind the engines as the ship climbs into space. Generate an isolated replay page for all ports, hulls and paints with `node tools/playtest/planet-transitions.mjs`; it keeps save writes in memory.

To position each port's ship and menu buttons, run `node tools/playtest/landing-editor.mjs` and open `output/landing-editor/index.html` on the local server. Drag elements or adjust X/Y, with separate desktop and smartphone layouts and fixed approved angles. The [landing editor](docs/LANDING_EDITOR.md) saves a separate draft and exports both views as JSON for implementation.

Planet landings pass through a short exterior atmosphere shot before settling onto the concourse platform. Takeoff climbs out through the clouds before returning to the cockpit. Vesper, Azure, Meridian Prime and Boreal use their own surfaces and atmospheric colours, with your current hull, paint and fitted hardware. Skip with » or Escape; reduced motion bypasses the shots. Run `npm run test:browser:planets` for muted desktop/iPhone checks. `npm run test:browser:cinematic-handoffs` checks station/planet boundaries with deliberately delayed loading, launch and cockpit rendering on desktop, Android and iPhone; old location artwork stays covered throughout.

All 13 stations have exterior arrival and departure shots using their actual models and your fitted ship. Films include the same parked hulls and service cradles as flight, at matching scale. Arrival moves from the exterior establishing shot into a closer three-quarter view before the fade; departure shows the ship leaving with the station behind it. Select the station, approach within 200 km of its visible hull and slow to 8 km/s or less; docking control handles the final approach and concourse landing. Takeoff returns control beyond the station's outer gate, facing away from it. Films reuse the concourse renderer and keep only the current station model. Run `npm run test:browser:stations` for muted desktop/iPhone approach, camera, launch and recovery checks. The landing replay page also includes stations.

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

The own-ship monitor opens Flight, Equipment & Cargo and Journal sections. Career drone bays sit in Equipment & Cargo; Arena Run retains its drone controls. Fit mining, PDC or repair drones docked or in space, then resume flight for any automatic return and swap. Repair drones patch their own hull first, then damaged friendlies within 200 km, consuming their owner’s energy. Paul carries two and introduces them after his rescue. Attack drones in older saves become PDC drones. Notifications use the cockpit ticker and Journal instead of floating toasts. Run `npm run test:browser:ship` for the terminal and drone-switching checks.

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
