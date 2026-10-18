# Mourning Line

The carrier and battleship anchor opposite sides of an open arrival pocket. Two cruiser sites flank them; eight frigates and two fighter wrecks complete the battlefield. Directional trails and four dense debris pockets connect the casualties without filling the arrival and race routes.

## Flight and collision

The battleship retains two jagged spine gaps. The carrier has one fore fracture and a connected drive; cruiser alpha has one aft fracture. Cruiser beta has a longitudinal broadside tear rather than repeated transverse separations. Their exploration bays stay in the original mission frame. The added rectangular lower-hull tunnels were removed in 0.8.2hd. `WRECK_BREAK_ROUTES` reserves a narrow straight line in each opening; NPCs can bank within the wider fracture gap. These bounds reserve space for flight, and never subtract hull geometry or exempt ships from collision.

`src/game/graveyardLayout.js` owns landmark IDs, poses and route bounds; mission generation re-exports them. Detached sections rotate around their own centres before their separation offsets are applied. Rendering and collision consume exactly the same transforms. The four exploration bays keep their authored frame because tutorial cover, salvage and racing use them.

`src/game/worldData.js` builds shared instanced fragments and fitted equipment. Upper systems fit below the surviving roof. Debris and fittings reserve the flight corridors; exterior salvage and random fragments also reserve each posed hull's full envelope. There are 100 salvage nodes, including 32 in the capital bays.

## Source assets and damage

`tools/assets/rebuild-graveyard-wrecks.mjs` rebuilds nine wreck assets from six current shipping hulls. Seven capital damage profiles cover a shattered battleship, a collapsed carrier hangar, two different cruiser failures and three frigate failures (spine break, drive loss, broadside tear). Frigates share these three models across four arrangements; the two fighter wrecks keep their existing geometry. The offline `wreck-solidify.mjs` pass runs after every cut and displacement. It leaves closed volumes intact, adds .006-normalized-unit backing to open hull/deck surfaces, and closes their rims with steel faces. This also handles coincident zero-volume faces and non-manifold cut edges. No geometry processing is added to the game loop. The builder uses a common warped cut frame so both sides of a fracture retain matching jagged contours. Pressure ruptures and peeled skin open the break faces. Capital propulsion pods separate independently.

Each capital command structure is detached as a complete bridge or island, including its lower body. The battleship keeps its existing three support fragments. The carrier retains four unequal roof/support fragments; each cruiser and frigate retains two. All use the original removed source surfaces, with distinct oblique fragment cuts and individual poses. Small plates, spars and beams surround every command break. Placement reserves exploration, salvage and race lanes.

Candidates go to `output/graveyard-rebuild`. Installed GLBs and `assets/models/wrecks/sources.json` record their source path and SHA-256. After accepting geometry changes, run `tools/assets/build_graveyard_collision_profiles.py` in Blender to bake simplified concave collision surfaces. Pose changes use those existing shared surfaces directly.

`src/game/graveyardArt.js` prepares nine shared source scenes. Fourteen instances reuse their geometry, materials and a single 512² plating texture. Paint stays in the original hull frame when sections move. Damage noise occupies the plating texture's alpha channel; RGB remains ordinary plating. Broken skins use steel edges and concentrated soot, without active flames or reactor glow.

## Verification

```sh
node --import ./tests/helpers/offline-imports.mjs --test tests/unit/wreck-solidify.test.mjs tests/integration/graveyard-thickness.test.mjs tests/unit/racingWorld.test.mjs tests/integration/graveyard-exploration.test.mjs tests/integration/wreck-variants.test.mjs tests/integration/graveyard-npc-routes.test.mjs tests/integration/tutorial-flight.test.mjs tests/integration/localization-travel.test.mjs
npm run test:browser:graveyard
npm run test:browser:racing
```

The NPC test drives normal travel steering, flight integration and full hull collision for Scrapper, Wayfarer and Torsas through four fracture gaps in both directions. It checks arrival, crossing within the opening, contacts and damage, and writes `output/graveyard-review/npc-routes.json`. Steering and collision are never bypassed.

Browser checks use a served runtime (`VR_BASE_URL` overrides port 4192), mute sound, and cover desktop Chrome, Android and iPhone/WebKit. They check actual player clearance through all four gaps, NPC traversal in the live game, render resources and repeated travel. The gallery's Fore fracture / Aft fracture selector offers only the actual routes present at the selected wreck. Captures and reports stay under ignored `output/graveyard-review/`.

Peeled armour uses closed folded solids, with front and back skins joined by perimeter faces. Its authored thickness is .003 in the normalized hull frame and recorded in each GLB's provenance; it scales with the wreck. Loose panels and asymmetric shards are also solid extrusions. Double-sided shading only controls their rendering, and does not supply their physical thickness.

Loose panels have a minimum world-space depth of .2 units or 4.5% of their shorter span. This is applied before clearance and collision calculations, including in dense clouds. The thickness regression samples exposed hull/deck skins across all nine installed assets, checks every debris geometry for volume, and verifies scaled plate depth. The ignored review gallery includes a Low angle view and above/below captures for all fourteen wrecks and all four debris clouds.

Collision profiles are keyed by `modelKey` when a hull class has multiple damage meshes. The cache includes that identity, section index and scale, so the same-named sections of different frigate models cannot accidentally share geometry. The source manifest drives the offline collision bake.

## Racing through the rebuilt field

All three Mourning Line courses use source-model landmarks transformed by the same shared wreck poses. They are available from Cairn through the existing race ladder:

- **Mourning Run:** 11.5 km / 38 rings. Descend into the carrier hangar, pass the torn bow and the nearby gamma frigate, follow the carrier flank and drive, then turn through its break debris.
- **Breach Crossing:** 11.9 km / 39 rings. Cross the battleship fore break, descend into the spine, leave through the aft break, skim the drive and keel and finish through the existing bow debris cloud.
- **Relict Gauntlet:** 21.9 km / 72 rings. Link the carrier, broken alpha frigate, broadside cruiser interior and port debris cloud. Follow the battleship flank and aft gap, pass the beta and delta frigates and finish at the second cruiser break.

`src/game/graveyardRacing.js` builds tangent circular fillets once during module loading. The dense racing lines follow these bends with sample heading changes below 21 degrees. Checkpoints are independent of curve tessellation: they are evenly spaced 300–308 units along the path, with at least 250 units between neighbouring centres. The old gate-73 frigate-beta bend now has a physical radius above 200 units rather than a cluster of nearly coincident rings. Rendering shows only the next five main rings on all courses (green next, yellow following, three grey); all checkpoints remain active. Fuel reward per centred checkpoint is reduced to preserve the total allowance.

Loose debris reserves a 30-unit margin around these paths, covering rival lanes and turn inertia; Shardbelt keeps its existing 12-unit margin. Major source hulls are never carved to clear race checkpoints. Rings sit outside the small frigate gap.

`raceNavigation.js` checks a conservative hull against actual collision surfaces at 10 Hz for the three Mourning racers. Clear lines follow the dense authored curve between the spaced gates; blocked lines fall back to local obstacle steering. Ordinary NPC travel and Shardbelt racing keep their existing steering. `tests/integration/graveyard-racing.test.mjs` flies all three rivals along the complete courses through two debris layouts and checks full-hull contacts and completion.

Run `node tools/playtest/graveyard-review.mjs` to rebuild the ignored preview pages. `output/graveyard-review/races.html` shows the exact runtime courses, selectable 3D overlays, checkpoint numbers and a scrubbed fly-through. The model exploration page remains at `output/graveyard-review/index.html`.

Graveyard courses have no shortcut branches. Checkpoint/finish radii are 100/128, 84/108 and 68/92 units, respectively: twice their earlier linear size. Rival lane widths retain their previous values so enlarging rings does not move pilots toward wreck surfaces.

The closer courses keep turns beside wreck surfaces and substantial debris. Three fixed seven-part wreckage assemblies mark otherwise empty bends: a torn carrier drive frame, a battleship keel section and a cruiser reactor spar. They use solid folded skins, I-beams, machinery and a severed tank, with the same rendered and collision geometry and existing instanced batches. They are ordinary explorable wreckage outside races too. Both shorter routes retain roughly half the long-course length.

The live browser racing check runs all three courses through the real GameSession update and collision resolution on desktop Chrome and iPhone WebKit. Rivals must cross every physical ring, finish within 300 seconds and produce zero collision corrections; the renderer keeps at most five rings visible.

Rendered-triangle regression checks cover both the dense flight curves and direct approaches between checkpoint centres, including 15-unit hull offsets on all axes. This catches engine/deck faces omitted by the simplified collision meshes. Breach Crossing gate 19 now passes beyond the battleship engine section.
