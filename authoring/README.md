# Current model sources

The source index is `manifest.json`. It records the installed GLB and editable Blender source for each of the 19 hulls and two drones, plus retained station and frigate assemblies. Ordnance and turret source libraries are also preserved locally.

- `models/<id>/<id>.blend`: current editable scene, with packed textures.
- `models/<id>/textures`: editable texture files where available.
- `models/<id>/support`: preserved authoring notes, measurements and original scripts. These are provenance records; some original scripts reference historical folders and are not maintained build entry points.
- `references`: original OBJ/GLB meshes and concept artwork.

Models and references are ignored by Git. Keep an external copy; a fresh clone intentionally contains the manifest without the large native files. The shipping game loads `assets/models`, never this folder.

For maintenance use the tools under `tools/assets`. `npm run verify:sources` checks local native-file and shipping-asset hashes. Opening the native sources in Blender is the additional check for editable meshes and packed images.

## Station architecture

`tools/assets/station_volumes.py` adds each port's pressure hulls, connected engineering structure and inhabited lower decks in the editable source frame. The station builders call this before surface detailing and export; collision uses those same shipped surfaces.

`tools/assets/station_silhouettes.py` assembles station-specific inhabited districts and useful machinery: armored command spaces, workshop offices, laboratory picture windows and refinery plants. It replaces the former generic arches, fins and crowns. Each closed volume is connected to its parent structure; the sources retain named editable components while export batches them by material. `station_builder.pressure_building` authors stepped pressure hulls, and facade bays contain small grouped room windows calibrated to the ships. Packing removes UV channels only from materials that do not sample textures. All thirteen original station envelopes remain stable. Helix keeps the refinery builder and original radius, with city blocks on the existing roof decks and paired enclosed cargo holds. Its building planner reserves elevator/radiator corridors; source audits verify every occupied foundation corner and the sealed glass parks. Rook has three downward-facing capital ports beneath the station; two frigates dock belly-up against compact hull-fitted seals below its lower pressure pods. The native shell uses Concord navy, pale armor and brass. Rook uses a 5.25-unit shared entrance and internal traffic throat.

To rebuild all current stations with Blender:

```sh
blender --background --python-exit-code 1 --python tools/assets/build-helix-station.py
blender --background --python-exit-code 1 --python tools/assets/build-detailed-stations.py
blender --background --python-exit-code 1 --python tools/assets/audit-station-structure.py
node tools/assets/sync-station-metadata.mjs
```

The contact audit must pass before syncing. It also checks specific crossing risks using the actual source meshes: radiators, occupied decks, tanks and antennas must clear unrelated structures, while their intended brackets and load columns must touch both ends. Connected groups alone cannot establish those clearances. Preserve the approved envelope and landing coordinates unless a design change explicitly requires new proportions; export keeps that envelope so the existing berths and cinematic scale remain stable.
