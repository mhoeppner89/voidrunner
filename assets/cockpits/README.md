# Starter cockpit artwork · 04

Current isolated review: `/output/cockpit-layout/index.html?revision=cockpit-art-04`. Build with `node tools/playtest/cockpit-layout.mjs`.

- `wayfarer-paint-atlas-v2.png` is now rendered **whole**, despite its historical filename. This 1851×850 RGBA image is byte-identical to the user's `ChatGPT Image Nov 16, 2026, 10_25_52 AM.png`. No rails or monitor borders are reassembled. The hand and live controls are separate.
- `wayfarer-hand-pitch-v4.png`: navy glove and flight sleeve with white piping/cuff accents, extending below and left of the viewport. One jointly edited strip, 2172×724 RGBA, containing three 724px-wide forward/neutral/back left-hand views. Built-in imagegen, no API/CLI fallback.
- `wayfarer-v4.json`: complete-frame dimensions, actual display apertures, strip cells and shaft-end pivots. All poses share one scale and fixed gimbal anchor. Source pixels/alpha are unchanged; SVG cropping/transforms perform placement.
- `wayfarer-stick-base-v1.png`: separate 2172×724 transparent navy/ivory gimbal mount, positioned by its source socket anchor. The base stays fixed behind all three hand poses. Exact built-in generation prompt: [STICK-BASE-PROMPT.md](STICK-BASE-PROMPT.md).
- `PROMPTS.md`: exact generation prompts and input roles, including earlier revisions.

The frame, hand strip and fixed base are each decoded once. The frame and monitor glass remain stationary between resizes; the hand changes only its selected pose and anchored, half-degree yaw transform inside a small isolated paint layer. The live glass slightly underlaps the measured source apertures, with the intact frame above it to cover antialiased edges. Monitor bitmap sizes follow their actual CSS display dimensions without the old per-axis minimum clamps. No image processing or additional 3D scene runs per frame. Buttons retain the earlier mobile sizes in the approved muted colours. They and the half-width visible throttle are mobile only; their larger touch areas are independent of the art.

The review enables the existing touch-relative stick mode: first contact is neutral; drag offsets set steering. Afterburner has a 28px transparent hit extension above and left, and launcher selection has one to the left. Painted button sizes and placement are unchanged. The upper corner controls use the same muted housing design.

The approved v4 frame/hand and the separate base sprite are integrated into the starter Wayfarer in live flight as of 0.8.2og (`src/game/cockpitArtwork.js`). Other hulls retain their current cockpits. Older manifests and hand images remain for provenance; v4 selects the current composition. The standalone review remains available for further art work.
