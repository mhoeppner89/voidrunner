# Ship repainting

All fifteen player hulls have four distinctive, individually fitted patterns and
independent main, secondary and accent colors. The factory option retains the
exact original GLB appearance.
The service card opens a rotatable preview. Draft edits and cancellation are
free; applying a changed design uses the existing hull-based repaint fee.

`paintDesign.js` validates save-safe `{pattern, colors}` values. Legacy preset
strings remain valid and keep their existing rendering. All four saved pattern
IDs remain available on every hull, with their colors intact. Hydration rejects
malformed designs and retains choices per hull.

`tools/assets/build-paint-masks.py` exports compact pattern atlases plus explicit
UV coating masks to `assets/paint/`, with material assignments in
`shipPaintMaskCatalog.js`. Each hull has explicit vector artwork for its plan
and both side profiles,
following its armor, wings, nacelles and structural breaks. The same vectors
produce the editor thumbnails. The atlas has four compatible pattern columns
and three projection rows; every slot contains its own authored design.
New atlas filenames avoid old immutable-art caches. Source atlas cells define
coated panels and exposed machinery; separate canopy, glazing,
weapon and emissive materials are excluded. Emissive atlas pixels remain
uncoated. A reference channel removes the source pigment while retaining panel
seams, wear and shading. Original geometry and PBR maps remain unchanged.

The selected hull's masks preload with the service preview. The custom shader
uses two additional mask samples and no extra draw calls. Physical surface
normals select the plan or appropriate side profile; hull normalization does
not distort shallow wing normals. Three colors and the pattern index are uniforms, so edits reuse the loaded mesh, canvas and compiled
program. The service card, editor and apply step retain one renderer when the
equipment is unchanged; leaving the service releases its WebGL context. The small service-card preview stops drawing until changed. The full repaint
editor and shipyard share a 30fps turntable at 0.5 radians/second. Dragging pauses
the turntable for inspection, then it resumes smoothly after two seconds; the
camera keeps a fixed distance. Reduced-motion preferences disable automatic
turning. Hidden or detached previews do not draw. Both previews share neutral inspection lighting and nearest texture
magnification. Their linear-HDR final pixel shader is the same as spaceflight,
with transparent, premultiplied edges over the dock art. Their integer pixel grid follows the viewport; the render target and final
quad are reused and released with the preview. No dithering, palette conversion
or close-range blur is added. Masks
are cached once per hull/material and remain available across preview reuse.

Preview equipment assemblies and flight models use the same original hull frame
for mask placement. Scrapper's custom frame follows its actual +Z nose.
Concourse and planet/station cinematics load through the same preview assembly
path. NPC presets and racing liveries remain unchanged.

Run `npm run review:paint` for a temporary workshop with every hull; it uses an
in-memory career and does not read or overwrite the player's career. The game
editor is under Service → Hull paint. Run `npm run test:browser:paint` for muted
desktop, Android and iPhone checks. Generated screenshots and reports are in
ignored `output/repaint/`.

Run `npm run review:paint-quality` to capture all four designs and the original finish in five
muted GPU views and generate the comparison gallery at
`output/repaint-shapes/index.html`. This uses the in-memory workshop.
