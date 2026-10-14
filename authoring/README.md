# Current model sources

The source index is `manifest.json`. It records the installed GLB and editable Blender source for each of the 19 hulls and two drones, plus retained station and frigate assemblies. Ordnance and turret source libraries are also preserved locally.

- `models/<id>/<id>.blend`: current editable scene, with packed textures.
- `models/<id>/textures`: editable texture files where available.
- `models/<id>/support`: preserved authoring notes, measurements and original scripts. These are provenance records; some original scripts reference historical folders and are not maintained build entry points.
- `references`: original OBJ/GLB meshes and concept artwork.

Models and references are ignored by Git. Keep an external copy; a fresh clone intentionally contains the manifest without the large native files. The shipping game loads `assets/models`, never this folder.

For maintenance use the tools under `tools/assets`. `npm run verify:sources` checks local native-file and shipping-asset hashes. Opening the native sources in Blender is the additional check for editable meshes and packed images.
