# Pixel display and distance filtering

Current finish: **0.8.2ix**. The original art colours are preserved. No added
Bayer dithering, palette reduction, sprite recolouring, scanlines or smoothing
filter is applied to the screen. The earlier palette experiments remain in the
review gallery for comparison.

## Rendering order

1. World textures retain close detail and blend distant mip levels with bounded
   anisotropic filtering. Depth-aware softening still starts only at
   20,000–80,000 km; this distant anti-aliasing is unchanged.
2. The reusable HDR target resolves the scene and performs ordinary tone mapping
   and colour-space conversion, without dithering or colour quantisation.
   Supported 2x multisampling is used; drivers offering only 4x use the crisp
   unmultisampled path instead. World buffers upscale by whole numbers.
3. Painted sprites load and decode directly from their original files. No
   conversion worker, converted-image cache, PNG re-encoding or DOM observer is
   required. Active and predicted image bundles still share one retained decode.
4. Concourse plates, HDR ships, cast shadows and floor reflections share one
   final canvas and pixel grid. Painted texels are point sampled, without a
   second saturation/contrast adjustment or CSS grading. Desktop budgets remain
   at most 960×600 and phone budgets 768×432; use whole-number CSS pixel scaling
   inside those budgets. Authored framing, placement and physical lighting stay
   intact. Soft shadows and reflections remain physically appropriate.
5. Instruments use native CSS pixels and compact Courier text, without colour
   filters or scanlines. Menu lettering keeps the bundled bitmap font. Cockpit
   art and the world use crisp sampling without an extra full-screen compositor.

## Budgets and lifetime

- Original images remain retained only for the active/predicted bundles; release
  old bundles when changing hulls or locations. There are no duplicate converted
  images and no per-frame image readback, PNG encoding or CPU screen processing.
- iOS skips bloom buffers/passes. Adaptive world resolution is unchanged.
- `retroDisplay.js` provides pixel sizing and display setup. `pixelResolve.js`
  handles world tone mapping/distant filtering; `concourseFinish.js` combines
  painted scenery with HDR models. Removed palette/worker modules are no longer
  precached. The service-worker version invalidates previously converted art.

## Verification

- Pixel-grid, preload ownership, cockpit layouts, GPU resource reuse, landing
  poses and service-worker tests cover the changed paths.
- The concourse browser fixture checks equal colours on both sides of the
  ship/paint composite and equality with source RGB values: no added tint,
  ordered pattern or palette rounding. Motion, shadows and source art remain
  visible on desktop and phone.
- `tests/browser/visual-shaders.mjs` checks muted desktop/iPhone UI, three cockpit
  layouts, source images, readable instrument pixels, quality changes, stable
  GPU resources and near/far filtering.
- Normal startup/offline tests decode actual source artwork and verify original
  cockpit images are preloaded online and offline. Reports stay in `output/`.

## Earlier performance measurements

## 0.8.2im measurements (historical)

At 1440x900 with 2x device scale, the saved 0.8.2il build measured median
166.6/133.3 ms per frame; the optimized build measured 83.2/83.3 ms in alternating
runs. Both used the same muted flight workload after loading settled. This is
software-rendered Chrome and describes relative cost, not hardware FPS.

37 focused regressions, muted desktop/iPhone visuals and interaction checks,
rendered monitor-pixel checks, offline resume/reconnect, packaging and model-source
verification passed. Original sprite files remain intact.

## 0.8.2in follow-up (historical)

A muted 1440x900 / 2x-scale flight profile measured about 1.5 ms JavaScript
per frame. Alternating the redundant full-screen native filter on/off measured
66.6/50.0 ms median twice, so it is removed. The world shader and cached artwork
still share their palette; monitor filters remain bounded to their apertures.
These are relative SwiftShader measurements, not hardware FPS claims.

Converted images now join the existing active cockpit/current dock/predicted
dock warm-up. Cache leases protect those bundles until released; visiting the
entire world does not retain its artwork. Racing hulls skip unused wreck
preparation. Preloading addresses first-use work; it cannot remove continuous
GPU work, which is why the redundant pass was removed separately.

Flight restores Courier at its existing monitor-specific sizes. Compact radio
messages fit measured pages and advance automatically; only the paused history
scrolls. Page layout runs on message/viewport changes, never per flight frame.

## Pixel finish review

Run `npm run review:pixels` against the local server and open
`output/pixel-style-review/index.html`. G / Original colours is the current game:
actual runtime captures without smoothing or colour processing added by the
review. Earlier A/B/C palette and D/E/F smoothed proposals remain selectable as
references. Where the earlier native captures exist, keep them as
`*-previous.png` for the dithered game comparison.

The concourse, distant Azure, Shardbelt, battleship graveyard and Helix traffic
frames use the real runtime. Each flight view contains four loaded ship models
between about 90 and 1,300 km. Camera and simulation stay frozen; the capture tab
uses memory-only storage and muted audio. `VR_SKIP_CAPTURE=1 npm run review:pixels`
rebuilds image proposals from the saved inputs without another game capture.
Settings/counts are saved in the generated `manifest.json`.

`npm run test:browser:pixel-review` checks desktop/iPhone controls, responsive
layout, references, saved URL, career isolation and exact original-colour pixels
in G. The earlier proposals are review-only and do not run in the game.
