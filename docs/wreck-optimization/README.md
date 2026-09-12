# Mourning Line wreck preview — faded 512px textures

Preview: http://localhost:4184/.freebuff/wreck-optimization/review.html?revision=512-talon-2

Candidates are now installed locally for the 0.8.2p wreck-variant test. All six candidates have 512×512 maps. Paint saturation is reduced to 68%, with a modest lifted black level and gentle sharpening after downsampling. Existing markings and weathering are retained. Material maps are resized without color grading (JPEG quality 95, full chroma).

Talon is rebuilt from the approved optimized ship: one wing/engine assembly separates at an uneven swept root, the opposite wing remains with the fuselage, and the nose fractures obliquely. Three original node names are retained, but their geometry and transforms deliberately change. Talon collision profiles have been regenerated from the installed mesh.

| Wreck | Original triangles | Candidate triangles |
|---|---:|---:|
| concord-battleship-wreck-v4 | 66,010 | 64,100 |
| concord-carrier-wreck-v4 | 92,453 | 59,165 |
| concord-cruiser-wreck-v4 | 34,643 | 19,051 |
| concord-frigate-wreck-v3 | 39,923 | 39,293 |
| wayfarer-wreck | 41,378 | 22,754 |
| talon-wreck | 28,062 | 18,044 |

Combined downloads: 12,809,424 → 9,621,308 bytes (24.9% smaller). Unique geometry: 302,469 → 222,407 triangles (26.5% fewer). Estimated RGBA8 texture allocation with mipmaps: 49.33 → 10.67 MiB across eight maps. This is not measured FPS or device GPU memory.

Build with background Blender: `scripts/reduce-wreck-geometry.py`, then `scripts/rebuild-talon-wreck.py`, then Node `scripts/preview-wreck-optimization.mjs`. Use shipped 0.8.2o sources. All outputs stay in `.freebuff/wreck-optimization`. The Talon uses the second Blender output; the other five retain original materials and node transforms, with reduced geometry.

All six candidates pass GLB validation with no errors or warnings. All eight texture dimensions verified at 512²; six browser comparisons captured and visually inspected without page errors. Talon recaptured after adjusting wing separation. See ../wreck-variants/README.md for integration verification.
