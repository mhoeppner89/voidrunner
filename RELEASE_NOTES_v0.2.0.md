# Void Privateer 0.2.0 — Pixel Remaster

This release revises the complete visual presentation while preserving the vertical-slice systems and saved progression.

## Main changes

- Original high-resolution pixel-art direction across the title, cockpit, HUD, docked locations, portraits, and ship presentation.
- Three.js now renders at a controlled internal resolution with antialiasing disabled; nearest-neighbour browser scaling, flat shading, seeded pixel textures, scanlines, and restrained vignette create the remastered-pixel look.
- A transparent illustrated cockpit frame replaces the visible prototype geometry. Physical canopy and console surfaces move with flight input while target data, radar, damage, fuel, cargo, messages, and two animated MFDs remain live DOM instruments.
- Role-specific trader, miner, patrol, pirate, bounty, and escort meshes use more readable industrial silhouettes, cargo structures, engine blocks, drills, masts, and emissive drives.
- Twelve original character portraits, four distinct location backplates, two ship-dealer illustrations, and an industrial corridor strip bring the same style to every docked interface.
- Amber/teal avionics hierarchy and stronger target, mining, salvage, and threat presentation improve readability without increasing persistent HUD coverage.
- Mobile landscape layout separates radar, target data, ship status, notifications, MFDs, and touch controls while retaining the complete flight model.
- Corrected title cropping, target/navigation overlap, duplicate canopy struts, baked concept text, station-specific cockpit labeling, and duplicate dock-background UI.
- Source references now live under `art-source/`; the playable build includes only compact runtime assets. The v5 service-worker cache pre-caches every remaster asset and emitted module.

## Verification

- 10/10 deterministic logic tests passed.
- Desktop and mobile browser QA passed without console, page, or asset-request errors.
- Mining, salvage, and named-bounty runtime scenarios passed.
- Standard Gamepad API QA passed for axes, fire, mode, navigation, scan, and autopilot.
- HTTPS service-worker installation and offline reload passed with the remaster assets cached.

See `review/VISUAL_REMASTER_AUDIT.md`, `review/ART_DIRECTION.md`, and `review/PLAYTEST_REPORT.md` for details.
