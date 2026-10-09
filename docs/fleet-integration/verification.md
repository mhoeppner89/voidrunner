# Current fleet integration verification

The shipping assets match the approved review exports byte-for-byte. The shipping runtime uses asset paths and baked equipment data; it does not fetch `.freebuff` or native Blender source files.

Focused checks cover model hashes and paths, turret centers/scales/normals, hull obstruction grids, rigid attachments under interpolation, symmetrical external drone contacts, faction restrictions, drone deployment/mining/combat/recall, renderer ownership, arena run, League content, packed GLB accessors, carrier and battleship rendering.

Muted fresh-browser checks loaded all 76 flyable hull/paint combinations. Career, arena and arena run started with the shared renderer. Paint selection was checked through the ship menu. Actual game hulls, shaders, guns and external docked miners were rendered and inspected; the visual check covers Wayfarer, Lancer, Legionary, Blade, Vanguard, Atlas, Astra, Andromeda, Scrapper, Prospector and Torsas. Browser result records are alongside this file; screenshots remain local in `.freebuff/current-equipped-fleet/shots/`.

The full workspace `npm test` audit initially reported 788 passes and 53 failures. That includes older authoring/export hash snapshots, obsolete upper-Wayfarer mount assertions, and weapon, HUD, roster and tutorial expectations outside this artwork integration. It is not a clean full-suite result. Integration failures found during the audit were addressed: interpolated mount normals, duplicate material bookkeeping, the single-drone escort hemisphere and Mule gun self-obstruction/duplication. The focused release checks were rerun after these fixes: 107 passed, zero failed.
