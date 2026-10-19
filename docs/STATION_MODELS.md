# Station models

All thirteen ports keep their world radius and location. Their landing architecture follows the existing concourse painting, with one private player pad and two traffic lanes in a shared space. Large entrance portals now lead into real interior halls; the exposed ports have no artificial hangar over their landing pads.

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


Editable files live at `authoring/models/stations/<id>/<id>.blend`. The builder saves named components before batching the shipping copy by material. Shells contain about 8,000–37,000 triangles, at most ten material batches and one shared 1024-pixel panel atlas each. Plates, reflectors and radiator panels have physical thickness. No unsupported geometry codec or per-frame assembly is used.

Rebuild in background Blender:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/assets/build-helix-station.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/assets/build-detailed-stations.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/assets/audit-station-structure.py
node --import ./tests/helpers/offline-imports.mjs tools/assets/sync-station-metadata.mjs
```

`station_concourses.py` defines the artwork references and shared landing architecture. The second builder accepts `-- rook cairn` to rebuild selected ports. The structure audit reads the saved source meshes. Bounds select candidates, but triangle contact or point-in-solid containment must connect the structural groups. This catches hollow-ring gaps that a bounds-only audit misses. Window sheets do not count as supporting structures. Results go to ignored `output/station-review/physical-structure.json` and each source's `model-report.json`; the audit fails if detached groups remain. Its small contact tolerance allows surface fixtures and manufacturing joins, and does not replace visual inspection of individual brace endpoints.

The explicit metadata sync updates berths, parked hulls, station source/export hashes in `authoring/manifest.json`, and the measured reports in `tests/fixtures/station-models.json`. The tests and workshop use that tracked fixture, so a fresh checkout does not require the ignored Blender authoring folder. Run it after the audit; it refuses reports with unresolved groups. Original station libraries remain preserved separately.

Authoring uses Z up and front -Y. Shipping GLBs use Y up and a normalized radius of 100. `stationDocks.js` and `stationOccupants.js` consume the actual source radius and floor coordinates. The renderer builds collision BVHs from the shipping geometry before adding parked ships and activity. Traffic uses the parked ships' actual bounds to stop ahead of them. Small camera offsets keep tracking shots inside the entrance openings. Blackglass retains its moon attachment transform.

Run `npm run review:stations` and open `/output/station-review/index.html?station=helix`. The responsive workshop loads every shipping model with the same occupant scale as flight, including capital drydock hulls. Five views, including a camera inside the landing space, support inspection. The Artwork button shows the actual concourse painting beside the model on desktop or above it on phones. Orbit, zoom and ship visibility controls remain available. It draws only when the view changes. Optional ignored `<id>-before.glb` snapshots enable comparison without shipping obsolete assets.

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

Crew airlocks use a clear height of 0.56 and width of 0.30 in the authoring frame, roughly three standard window heights. Frames, leaves and controls use the same small scale; industrial rolling doors remain freight entrances with a personnel door beside them. Inspect against the actual berthed hulls in the workshop. Window banks follow all four building faces and the actual polygonal pressure walls; process tanks stay unglazed. Flat panes are batched rather than making a twelve-triangle box for each window. Before export, `seat_windows()` checks each pane against the nearest solid surface and removes unsupported panes at carved openings. Its measured coverage is recorded in `windowSupport`.

Station films load the shipping shell and its normal berthed hulls and cradles. `stationOccupantScale()` in the renderer is shared by flight, the workshop and the film, including the existing NPC size calibration; capital yard hulls keep their authored size. The film retains only the current station assembly and releases superseded geometry/materials. Its close arrival shot completes before the fade, while departure follows the front quarter of the departing hull with the station behind.

Blackglass uses a slightly higher camera and a short upward framing offset in the wide arrival shot so its elevated cave galleries enter the composition. The offset fades out before the close ship shot; the ship remains within the safe frame throughout.
