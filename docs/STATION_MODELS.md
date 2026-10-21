# Station models

All thirteen ports keep their world radius and location. Current architecture follows the concourse, bar and market artwork: connected inhabited districts replace the former ornamental arches, fins and rooftop crowns. Helix retains its three-deck refinery spindle, service crown and radiator wings, with enclosed cargo holds and inhabited roof districts; Rook has tall stepped armored wings, a deep arrival hall with a narrow vertical portal and a continuous armored keel closing the gap above its reactor. Its eight Cruiser batteries and sixteen capital PDCs cover the approach, roof, flanks and underside. Concord navy, pale armor and brass replace Rook's green finish. Three short capital collars face down beneath the station. Two frigates dock belly-up below the lower pressure pods, with compact seals fitted to their real ventral hull surfaces, while drydock occupants retain their maintenance cradles. Its NPC pads are centered more closely to preserve wide-wing clearance. Nacre uses broad curved picture windows, and Gatehouse has a staffed rear checkpoint with its scanner beneath the hall ceiling. Their landing architecture follows the existing concourse painting, with one private player pad and two traffic lanes in a shared space. Large entrance portals now lead into real interior halls; the exposed ports have no artificial hangar over their landing pads.

| Port | Landing space and artwork reference |
| --- | --- |
| Helix | Deep multilevel atrium, central lift and broad side portal |
| Rookhaven | Tall military hall, flanking galleries and vertical entrance |
| Cairn | Salvage working apron under a workshop roof and hoist |
| Argent | Covered terrace built directly into the construction torus |
| Gatehouse Twelve | Covered inspection deck with an open space-facing side |
| Blackglass | Open cliff platform below two excavated tavern galleries |
| Cinder | Exposed refinery forecourt with a framed side opening |
| Torchwell | Broad fuel apron, rear reservoir triad and low service house |
| Nacre | Exposed circular platform joined to the pressure laboratories |
| Shepherd | Open deck at the foot of the relay tower |
| Haven | Open blue/gold trading court with galleries, awnings and skybridge |
| Unity Shipworks | Deep covered factory hall connected to the cruiser yard |
| Cinderfall | Open industrial courtyard, inhabited walls and process equipment |


Editable files live at `authoring/models/stations/<id>/<id>.blend`. The builder saves named components before batching the shipping copy by material. Shells contain about 10,000–40,000 triangles, at most ten material batches and one shared 1024-pixel panel atlas each. Helix has 77 enclosed housing blocks and six planted, glazed upper-deck courtyards. Supported radar-dish outriggers clear the command tower. Their transparent canopy shell uses the existing material budget, keeps depth testing and does not write depth over the opaque planting. Plates, reflectors and radiator panels have physical thickness. No unsupported geometry codec or per-frame assembly is used.

Rebuild in background Blender:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/assets/build-helix-station.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/assets/build-detailed-stations.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/assets/audit-station-structure.py
node --import ./tests/helpers/offline-imports.mjs tools/assets/sync-station-metadata.mjs
```

`station_concourses.py` defines the artwork references and shared landing architecture. The second builder accepts `-- rook cairn` to rebuild selected ports. The structure audit reads the saved source meshes. Bounds select candidates, but triangle contact or point-in-solid containment must connect the structural groups. This catches hollow-ring gaps that a bounds-only audit misses. Window sheets do not count as supporting structures. Every Helix housing foundation corner must embed in a real deck; each glazed park must seal against its foundation and clear adjacent buildings. Dish bowls must clear the tower, deck bands, crown and service spines. Rook docking collars must contact their parent hulls and extend no more than 1.8 source units. Browser checks verify hull-fitted seals no longer than two source units, separation between ship bounds and actual station triangles and firing lines clear of berthed ships. Results go to ignored `output/station-review/physical-structure.json` and each source's `model-report.json`; the audit fails if detached groups remain. Its small contact tolerance allows surface fixtures and manufacturing joins, and does not replace visual inspection of individual brace endpoints.

The explicit metadata sync updates berths, parked hulls, station source/export hashes in `authoring/manifest.json`, and the measured reports in `tests/fixtures/station-models.json`. The tests and workshop use that tracked fixture, so a fresh checkout does not require the ignored Blender authoring folder. Run it after the audit; it refuses reports with unresolved groups. Original station libraries remain preserved separately.

Authoring uses Z up and front -Y. Shipping GLBs use Y up and a normalized radius of 100. `stationDocks.js` and `stationOccupants.js` consume the actual source radius and floor coordinates. The renderer builds collision BVHs from the shipping geometry before adding parked ships and activity. Traffic uses the parked ships' actual bounds to stop ahead of them. Small camera offsets keep tracking shots inside the entrance openings. Blackglass retains its moon attachment transform.

Run `npm run review:stations` and open `/output/station-review/index.html?station=helix`. The responsive workshop loads every shipping model with the same occupant scale as flight, including capital drydock hulls. Seven views, including rear, underside and a camera inside the landing space, support inspection. The Artwork button shows the actual concourse painting beside the model on desktop or above it on phones. Orbit, zoom and ship visibility controls remain available. It draws only when the view changes. Optional ignored `<id>-before.glb` snapshots enable comparison without shipping obsolete assets.

Focused verification:

```sh
node --import ./tests/helpers/offline-imports.mjs --test tests/integration/station-models.test.mjs tests/integration/station-collision.test.mjs tests/integration/npc-station-landing.test.mjs tests/integration/station-traffic.test.mjs tests/performance/station-transitions.test.mjs
npm run test:browser:station-models
VR_HULLS=wayfarer,atlas npm run test:browser:stations
npm run verify:sources
npm run build
```

Browser checks are muted. The model check tests both traffic lanes for all fifteen NPC hulls against the station and parked ships, then captures each view on desktop Chrome and iPhone WebKit. Geometry tests cover every player hull's private berth and the complete NPC landing/departure cycle. Live game tests cover the exterior approach, both films, concourse launch, safe exterior return and interrupted-animation recovery.

## Detail and surface stability

`station_detailing.py` adds role-specific fittings in the editable source. `station_surface_cleanup.py` subtracts competing coplanar polygons from the export copy, retaining UV coordinates. Source components remain editable. Excavations extend below the landing floor so original floor caps cannot compete with the new deck.

`station_occlusion.py` bakes short-range contact shading into normalized byte vertex colours; emissive lamps stay bright. `station_pack.py` welds identical vertex attributes while preserving UV and hard-normal seams. It uses ordinary GLB accessors, with no geometry decoder or per-frame bake.

The shared atlas uses broad, quiet panels and mip filtering. Authored lamps, windows and hazard accents carry a small depth bias for the flight camera's wide depth range. Keep markings at their shallow authored height: raising them can collide with low-hanging fitted hulls.

Run `node tests/browser/station-surfaces.mjs` after generating the workshop. It tests tiny camera movements in concourse, terminal and exterior views at flight-camera depth precision, compares the optional ignored `output/station-polish/<id>-before.glb` snapshots, and saves images and reports. These probes are muted. A temporal image threshold is a diagnostic, so inspect the saved close-up and distant views as well.

Ordinary windows are capped at 3 × 1.4 world units and grouped within architectural bays. Their height is below the battleship source's 2.486-unit windows. Personnel airlocks are 3 world units tall; frames, controls and small utility fixtures use the same conversion. `station_builder.init()` reads current location radii and the approved authoring envelopes to compute the conversion. The atlas represents 6 × 3 world-unit panels. Industrial freight doors and a few observation rooms deliberately remain larger. The source report records `detailScale`, and the physical source audit measures the actual transformed pane edges in `windowSizeAudit`.

Window banks follow all four building faces and polygonal pressure walls; process tanks stay unglazed. Flat panes are batched. Before export, `seat_windows()` discards unsupported glazing at carved openings and records coverage in `windowSupport`.

Helix keeps its 84.42890708589043-unit source envelope and landing coordinates. The tiered refinery builder embeds two mirrored enclosed freight holds in the occupied decks. Their pressure shutters replace the exposed cargo slab, crane and containers. Two roof levels carry 83 closely spaced closed pressure buildings, with varied roofs, small room windows and hull-colored district foundations. Eight enclosed housing wings join neighboring towers into larger complexes; inset service lanes run between the housing rows. Candidate buildings are tested against existing elevator and radiator meshes before placement; street gaps reserve engineering corridors. The native audit checks actual city intersections, each housing wing's two connections, radiator brace attachments and structural contacts. The integration test verifies bilateral placement and both roof levels. `architecture.cityBlocks` records editable footprints and heights; `cityConnections` records the housing links. The earlier spindle, circular decks, crown and radiator wings remain.

Rook's closed lower keel meets the arrival floor, both armored wings and the reactor casemate. Native containment checks and a ray against the shipped GLB verify the marked underside gap is filled. The upper command bridge and approach PDC positions retain their preceding design. A thick pitched armored roof closes the upper slot between the bastions. Forward and aft pressure gables seat in the command hulls, transverse ribs follow the roof profile, and service panels lie flush on its slopes. The mast and cooling plant sit on the ridge. Native contact checks cover both bastions and both gables; vertical rays through the shipped model verify continuous coverage. The tall flight doorway remains below this roof.

Helix's detail pass adds front structural piers, copper/metal cornices, flat-roof service houses, freight-lock actuators and seated tower service spines. Its blue-gray palette follows the concourse art. Dense housing now has full room-window patterns, floor divisions, doors and service risers. The existing atlas is divided into housing cells on the left and quiet structural/tower panels on the right. `station_city_facade` maps the actual four building walls onto their housing cell, and `station_atlas_cells` selects quiet panels for roofs and other structures. Dark rooms are painted detail; a small selection of emissive room panes remains geometry. Native UV checks prevent housing windows from leaking onto tanks, roofs or tower plating. All room windows remain at crew scale. These are offline UV options with no new runtime shader, material batch or texture. Small floor circles, plant collars and printed registry lettering keep the denser housing inside the original triangle and download budgets.

Rook's portal remains 5.25 source units wide. `sharedEntry` defines the centerline and the interior throat. NPCs align before entering, then translate toward their own berth after clearing the mouth. One ship uses the shared door at a time; a docked ship waits while another arrives or departs. Parked maintenance hulls sit deeper inside to leave manoeuvring room. The private player berth remains on the centerline.

Station films load the shipping shell and its normal berthed hulls and cradles. `stationOccupantScale()` in the renderer is shared by flight, the workshop and the film, including the existing NPC size calibration; capital yard hulls keep their authored size. The film retains only the current station assembly and releases superseded geometry/materials. Its close arrival shot completes before the fade, while departure follows the front quarter of the departing hull with the station behind.

Blackglass uses a slightly higher camera and a short upward framing offset in the wide arrival shot so its elevated cave galleries enter the composition. The offset fades out before the close ship shot; the ship remains within the safe frame throughout.

## Rook armament

`station_armament.py` reads the same `CRUISER_TURRET_DATA` and `CRUISER_PDC_DATA` as the capital-ship renderer. It preserves the source triangle shapes and elevation pivots, paints them through the station's existing materials, and bakes eight batteries and sixteen PDCs into Rook's shell. No additional atlas, model loader or per-frame assembly is needed. The source report records their placement, provenance, normals and muzzle directions. The contact audit verifies seated bearings and unobstructed outward lines for every barrel. This is the visible station hardware; capital-ship fire-control logic remains separate.
