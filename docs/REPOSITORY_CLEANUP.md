# Repository cleanup — 2026-11-16

The rebuilt checkout uses roughly **3.3 GiB less space** than before this pass. This is repository maintenance. Runtime behavior and version **0.8.2oi** are unchanged. The previous [October audit](releases/REPOSITORY_CLEANUP_2026-10-14.md) remains as a historical record.

## Removed and consolidated

- No unfinished registered worktrees remained. Removed the empty `.worktrees` directory and 10 local branches whose tips were verified ancestors of main. All 7 branches with unmerged commits remain. Remote branches and published history are unchanged; removed local tips are recorded in the ignored local audit.
- Removed 65 obsolete files (~40 MiB): unused cockpit generations, the rejected procedural cockpit renderer and its CSS/test, the broken historical before/after cockpit gallery, and rejected palette/whole-screen pixel-grid review tools and tests. Current rendering, controller, gameplay and asset checks remain.
- The current cockpit browser test is `tests/browser/cockpit-artwork.mjs`, available through `npm run test:browser:cockpit`. The current shader review is `npm run review:finish`. Both shader diagnostics retain the identical shared capture logic under `tools/playtest/shared/scene-capture.js`.
- Cleared 11,994 generated files (~3.7 GiB), including the old build and Python caches. Before deletion, 5,626 text/source/model files were preserved in a verified ~137 MiB local archive. This includes edited German dialogue exports and old native model drafts. Untracked retired cockpit variants have a separate local archive. All archives are ignored and are not sent to GitHub.
- Consolidated the appended German catalog entries into the existing single table. Every translation value and key order matches the pre-cleanup object; the catalog regression now passes.

Loose Git objects were compacted without expiring history. Three inactive temporary object files older than 24 hours were archived locally and removed; two recent ones were left alone. Git connectivity passed, all preserved branch tips are unchanged, and removed branch tips remain reachable through main.

Current authoring sources, reference meshes/artwork, private notes, saved careers, maintained test fixtures and pinned dependencies were preserved. Git history accounts for roughly 3.5 GiB of the remaining checkout; it has not been rewritten. Old tracked files remain recoverable from Git history. The packaged runtime was rebuilt after cleanup and is smaller because unused artwork and source modules are no longer copied.

## Regular housekeeping

```sh
npm run clean:generated                 # dry run; changes nothing
npm run clean:generated -- --apply      # archive retained output, then remove generated files
npm run build                          # recreate dist
```

The cleaner handles only `output/`, `dist/` and `tools/**/__pycache__`. It refuses tracked output, linked roots and linked archive destinations. Raster captures, logs and CPU profiles are disposable; other output is archived first. No deletion occurs unless archive creation and listing succeed.

Retained output is under `.workbench/generated-archives/`. To recover an edited export or model draft, list the archive with `tar -tzf <archive>` and extract it into a separate temporary directory with `tar -xzf <archive> -C <empty-directory>`. A local file/branch audit is under `.workbench/cleanup-2026-11-16/`. Review archives manually before deleting them.

The cleaner intentionally leaves Git history, unmerged branches, `authoring/`, `assets/`, `art/`, dependencies and browser storage alone. Ordinary cleanup must not rewrite published history or delete a test merely because it fails.

## Verification

- Full Node suite: **1,316 passed / 14 failed**, across **1,330 tests**. Four cleanup safety tests cover dry-run behavior, retained dialogue/model recovery, tracked files and symlink protection. The retired cockpit experiment's three tests were removed with its implementation.
- The remaining 14 failures already existed before this cleanup. The catalog failure from the earlier 15 is fixed; all remaining current-behavior checks are retained. They cover station geometry/collision routes, a close-range NPC duel, phone UI mocks, and older drone/economy/upgrade/value expectations. See the exact names below and in the JSON report.
- Current model-source verification passed for 34 models and 6 libraries. Runtime packaging and source syntax checks passed. Muted desktop, Android, iPhone and small-phone live cockpit checks passed, along with the retained desktop artwork editor. Current captures were inspected. Android normal startup, decoded images, offline resume, report fallback and reconnect passed.

### Remaining active test failures

- `tests/integration/npc-station-landing.test.mjs` — NPC hard collisions use visible station surfaces without a docking exemption
- `tests/integration/phone-dock.test.mjs` — phone inventory installs the gifted reactor without a charge in both languages
- `tests/integration/phone-dock.test.mjs` — phone shop disables an unaffordable radar purchase and never treats it as owned stock
- `tests/integration/phone-dock.test.mjs` — equipment navigation names remote storage, hides empty sections and clears mount filters
- `tests/integration/ship-collider-fit.test.mjs` — all player hulls and NPC hulls clear every actual station landing and departure route
- `tests/integration/ship-collision.test.mjs` — Rin and the tutorial pirate keep flying through a close-range duel
- `tests/integration/station-models.test.mjs` — landing spaces have solid floors and the expected open sky or enclosing roof
- `tests/integration/station-models.test.mjs` — the inspection doorway and factory rear opening continue into the larger station
- `tests/integration/station-models.test.mjs` — Helix preserves its circular decks and Rook closes the marked underside gap
- `tests/integration/station-models.test.mjs` — Rook central upper slot is covered by a continuous armored roof
- `tests/unit/careerMetrics.test.mjs` — career upgrades use outfitting compatibility for size-less utility mounts
- `tests/unit/droneFormation.test.mjs` — tests/unit/droneFormation.test.mjs
- `tests/unit/economy.test.mjs` — tests/unit/economy.test.mjs
- `tests/unit/playerStrength.test.mjs` — combat-strength proxy uses full hull and equipment value, half cash, and no cargo
