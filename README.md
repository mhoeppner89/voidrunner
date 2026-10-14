# Voidrunner

A browser spaceflight game with career missions, equipment loot, Arena Run and spectator battles. Current runtime: **0.8.2fv**.

## Run locally

Use Node.js 22.15 or newer and Python 3. Serve the project from its root:

```sh
python3 -m http.server 4192
```

Open `http://127.0.0.1:4192/game.html`. Spectator mode: `game.html?mode=observer`.

## Repository layout

| Folder | Contents |
|---|---|
| `src` | Game simulation, renderer, UI and styles |
| `assets`, `art`, `vendor` | Shipping assets and the bundled Three.js runtime |
| `tests/unit` | Isolated rules, save migration and small systems |
| `tests/integration` | Gameplay flows, fleet geometry and equipment |
| `tests/performance` | Allocation, resource reuse and collision regressions |
| `tests/browser` | Muted desktop, Android and iPhone gameplay checks |
| `tests/helpers`, `tests/fixtures` | Shared setup and small measured asset records |
| `tools/assets` | Asset generators, collision/schematic bakes and audits |
| `tools/maintenance` | Test runner and deployment packaging |
| `tools/playtest` | Screenshot comparison and optional performance diagnostics |
| `docs` | Current specifications, verification notes and release records |
| `authoring` | Source manifest; ignored editable models and original references |
| `output`, `dist` | Ignored generated reports/captures and packaged runtime |

## Verify changes

```sh
npm test
npm run test:unit
npm run test:integration
npm run test:performance
npm run build
```

`npm test` runs every maintained Node test. Shared helpers do not register tests. The Node checks need no installed dependencies; browser checks use pinned Playwright:

```sh
npm ci
npx playwright install chromium webkit
VR_BASE_URL=http://127.0.0.1:4192 npm run test:browser
```

Browser checks mute sound and write screenshots/results into `output/playtest`. On this Mac they use installed Chrome; on other hosts Playwright's Chromium is used. iPhone and Android checks are browser emulation, not native device simulations.

## Model authoring

`authoring/manifest.json` records the current model sources and SHA-256 hashes of their shipping GLBs. Editable Blender sources live locally under `authoring/models`; original reference meshes and artwork live under `authoring/references`. These large files are intentionally excluded from Git and deployment. Keep them in the external authoring backup when moving the project to another machine.

After changing a shipping hull, rebuild its derived data:

```sh
node --import ./tests/helpers/offline-imports.mjs tools/assets/bake-ship-colliders.mjs
node --import ./tests/helpers/offline-imports.mjs tools/assets/bake-ship-schematics.mjs
npm test
```

`npm run audit:collisions` generates the overlap gallery in `output/ship-collision-audit`. `npm run benchmark:collisions` measures the fitted queries. Preserve the approved hull calibration and mount anchors when exporting; a general Blender export is not a guarantee of identical geometry or runtime transforms.

## Deployment

`npm run build` creates `dist` from an explicit runtime allowlist and checks every static service-worker cache entry. GitHub Pages uploads `dist`, so tests, model sources, documentation and generated diagnostics are never published.

Runtime releases update the game version, service-worker cache key and changelog together. Repository-only maintenance leaves the runtime version unchanged. Historical experiments were removed from this checkout after retaining current sources and useful tests; Git history remains intact.
