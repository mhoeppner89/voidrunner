> Texture update: 0.8.2o now ships 1024² color and material maps for every hull. Geometry and canopies below are unchanged. See [texture release](../texture-1024/README.md) for the updated download and memory figures.

# Approved ship models — 0.8.2n

The release ships the six optimized original hulls with their original paint schemes. The procedural repaint and rebuilt Wayfarer experiments are not included.

| Hull | Original triangles | Released triangles | Paint map |
|---|---:|---:|---:|
| Wayfarer | 40,000 | 22,900 | 1024² |
| Talon | 26,628 | 17,308 | 2048² |
| Vanguard | 81,596 | 40,808 | 2048² |
| Prospector | 82,812 | 41,436 | 2048² |
| Lancer | 52,580 | 28,108 | 2048² |
| Atlas | 50,172 | 27,693 | 2048² |

Total: **333,788 → 178,253 triangles (46.6% fewer)**. Larger source paint maps on five ships increase texture memory; these geometry reductions are not an FPS claim. Wayfarer retains its native 1024px source. Material masks remain 1024px. The loader requests 8× anisotropic filtering, clamped to GPU support, and reads glTF metallic factors correctly.

Wayfarer has nine larger symmetrical panes: three roof panes, two rectangular side panes and one forward triangular pane on each side. Dividers share cross-section stations. Narrow solid frame returns meet the hull, closing the gaps below the previous flat frames. Glass is opaque reflective PBR material. Atlas and Lancer retain their corrected symmetrical canopies. Talon's original green canopy is preserved.

Lancer retains its original texture bytes with conservative surface smoothing and wing-skin fitting. UV seam vertices move together; hard ridges, canopy-adjacent vertices and extrema are protected. Interior decimation saves a further 870 triangles. Rounded details in the source geometry remain.

Turret mounts are unchanged. Clearance is rebuilt against all material primitives. The cockpit omits own-ship exterior turret meshes, and NPC faction tint does not recolor canopy materials.

## Validation

All six assets pass glTF Validator with zero errors and warnings; see release-validation.json. Forty focused renderer/PDC/turret tests cover material loading, mirrored canopy vertices, window obstruction, turret placement and combat behavior. Browser comparisons load all six packed assets with the game loader and verify decoded paint dimensions. Final screenshots show full ships and canopy details. Desktop and landscape-phone flight checks cover PDC and laser sorties.

## Local authoring

The local comparison is http://localhost:4184/.freebuff/ship-cleanup/review.html (original left, approved optimized right). The ignored `.freebuff` folder is not deployed.

Authoring helpers: clean-ship-models.py and package-ship-models.mjs create the initial optimized assets; fix-canopy-seating.py corrects hull clipping. enlarge-wayfarer-canopy.py rebuilds the approved nine-pane canopy. clean-lancer-geometry.py applies the final geometry-only cleanup. These Blender scripts use local source snapshots and should not be repeatedly applied to already-processed release models. Preserve input snapshots and review exports before replacing runtime GLBs. package-canopies.mjs packages canopy exports without re-encoding textures.

Local editable archives: glb_models/ships-cleaned.blend and glb_models/wayfarer-nine-pane-canopy.blend. Generated GLBs in assets/models/ships are the shipping source of truth. No runtime model decoder dependency was added.
