# Display finish and shader checks

The current illustrated finish preserves the source artwork's colors. It uses restrained lighting bands and depth edges on 3D geometry; it does not pixelate cockpit text or reduce the whole game to a fixed color palette.

## Rendering

- World textures keep mipmaps and bounded anisotropic filtering for distant detail. `pixelResolve.js` softens geometry only at 20,000–80,000 km, with depth checks protecting nearby ships and a sharp sky.
- `illustratedLighting.js` shapes direct lighting into gently blended bands. The final resolve uses the existing depth texture for geometry outlines that fade with distance. These are part of the existing passes, not an additional full-screen compositor.
- `concourseFinish.js` combines the painted location, 3D ship, shadow and reflection on one pixel grid. Painted source RGB values pass through without a palette, tint or smoothing pass.
- `retroDisplay.js` owns pixel sizing and quality budgets. Phone quality and adaptive resolution keep their bounded rendering costs.
- Cockpit instruments use their actual CSS display dimensions. The starter frame, hand and fixed base are decoded original sprites; live monitor glass underlaps the frame openings. The small animated hand layer is isolated from the stationary monitors and frame.

## Maintained tools

- `npm run review:finish` builds the illustrated comparison gallery under `output/comic-style-review/`, using a muted, save-isolated real game.
- `npm run benchmark:illustrated` measures the current finish on desktop and phone profiles. Software-rendered measurements are relative comparisons, not physical-device FPS guarantees.
- Both tools use `tools/playtest/shared/scene-capture.js`. Its capture logic is separate from the shipping game.
- The rejected fixed whole-screen grid and palette/blur proposal galleries have been removed. Their source remains in Git history.

## Regression coverage

- `tests/performance/pixel-display.test.mjs` check the current rendering rules.
- `tests/browser/visual-shaders.mjs` checks real near/far filtering, source artwork, instrument readability and resource reuse. `tests/browser/illustrated-finish.mjs` covers the current finish in flight and location transitions.
- `npm run test:browser:cockpit` checks live cockpit geometry, canvas sizes, fixed-base animation, controls and hull switching on desktop, Android, iPhone and a small phone.
- `tests/browser/offline-startup.mjs` decodes original images and verifies startup, cache ownership, offline resume and reconnecting with service workers enabled.

Reports and captures are generated under ignored `output/`. Use the cleanup command described in `docs/REPOSITORY_CLEANUP.md` to remove old runs without losing edited dialogue exports or model drafts.
