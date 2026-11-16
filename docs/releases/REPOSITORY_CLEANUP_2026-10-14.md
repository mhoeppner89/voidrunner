# Repository cleanup — 2026-10-14

The checkout was reduced from roughly 15 GiB to about 5.5 GiB. Git history remains unchanged and accounts for about 4.6 GiB of the remainder. Current local authoring material occupies roughly 559 MiB.

## Kept

- All shipping game assets, paint schemes, equipment placements and fitted collision data.
- 21 current editable hull/drone sources, two station scenes, additional frigate scenes, and the ordnance/turret libraries. All 27 retained Blender files reopened with editable mesh data and no missing external images. File hashes are indexed in `authoring/manifest.json`; `authoring/validation.json` records the Blender checks.
- Original reference meshes and concept artwork, separated from current native sources.
- Maintained unit, integration, performance and browser tests. Small frozen geometry measurements live under `tests/fixtures`; helpers do not import or register test suites.
- Collision/schematic bakes, shipping-model audits and useful asset generators under `tools/assets`. Screenshot and performance diagnostics live under `tools/playtest`.

## Removed or consolidated

- Superseded model iterations and duplicate candidate exports from the large rebuild/revision archives.
- Disposable preview sites, generated screenshots/logs, root debug scripts, obsolete standalone probes, Blender backup files and unused empty worktree folders. There were no additional registered worktrees.
- Historical construction-ledger tests that depended on archived native revisions. Their useful shipping checks remain in current model/geometry tests and local authoring verification.
- Repeated root manuals and historical release/bug notes: one current README remains, with old release records grouped under `docs/releases`.
- Node test hooks moved out of the runtime into `tests/helpers`. Browser dependencies have one pinned root package and lockfile.

Large editable sources and references stay local under ignored `authoring/models` and `authoring/references`. They are not part of a fresh Git clone; retain the external authoring backup. Git objects and history were neither rewritten nor pruned. The runtime is packaged through an explicit allowlist, and GitHub Pages now publishes only `dist`.

## Verification

- **684 tests passed**, including a clean-folder run without ignored native sources, dependencies or old development output. The final reorganized suite also passed after moving its Node loader helpers.
- Final cache/UI regressions: **14 passed**. Clean-copy loader checks and packaging passed.
- Muted desktop Chrome, Android/Chrome and iPhone/WebKit: career flight, Arena Run, spectator battles and all 19 spectator hulls. Controlled player fire, incoming damage, station takeoff and automatic Helix landing passed on each platform. No page errors or missing online assets; representative screenshots inspected.
- Source integrity audit passed for all 21 hull/drone files and six additional libraries; shipping-model inspection passed.
- The packaged service worker installs and the title screen reloads offline. This check exposed and fixed missing static cache dependencies; `npm run build` now validates the complete title module graph, including minified Three.js imports. Optional, unvisited art/models still require an online visit before offline use.
- Gameplay and ship geometry are unchanged. Version **0.8.2ft** identifies the cache repair.
- Syntax checks and `git diff --check` passed. Temporary package builds, clean test copies and the verification server were removed; small current screenshots/results remain in ignored `output/playtest`.

See `README.md` for maintained commands and folder responsibilities.
