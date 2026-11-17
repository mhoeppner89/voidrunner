# Current test workflow

Node checks run without network imports or browser dependencies:

```sh
npm test                   # unit, integration and performance
npm run test:unit
npm run test:integration
npm run test:performance
```

`tools/maintenance/run-tests.mjs` discovers `*.test.mjs` in those three groups. Shared constructors belong in `tests/helpers`; helpers must never import a test suite. Fixtures under `tests/fixtures` are maintained measurements of current shipping geometry, not disposable output.

Browser checks use the pinned Playwright dependency. Install with `npm ci` and `npx playwright install chromium webkit`, serve the repository, then select its URL:

```sh
VR_BASE_URL=http://127.0.0.1:4212 npm run test:browser
VR_BASE_URL=http://127.0.0.1:4212 npm run test:browser:cockpit
VR_BASE_URL=http://127.0.0.1:4212 npm run test:browser:controller
```

The main browser group covers startup and player actions; specialized commands cover tutorials, equipment, rendering, stations and exploration. Run only the groups affected by a change. Browser checks mute sound and report under ignored `output/`. Android and iPhone profiles are browser emulation; physical-device performance still requires a device check. `AGENTS.md` documents the simulation hooks and Chrome flags.

The score has a headless check (`tests/unit/musicScore.test.mjs`): every piece runs for dozens of bars, at every combat tier, through a strict fake Web Audio graph from `tests/helpers/fake-audio.mjs`. `npm run test:browser:sound` adds the music review page (`tests/browser/music-review.mjs`) on desktop and Android.

`offline-startup.mjs` must retain service workers and the normal entry URL. Startup probes alone cannot verify cache installation, decoded opening art or offline resume.

Tests for rejected palette/grid reviews and the retired procedural cockpit have been removed with their implementations. Current cockpit coverage lives in `cockpit-artwork.mjs`; shader coverage remains in `pixel-display.test.mjs`, `visual-shaders.mjs` and `illustrated-finish.mjs`. The shared shader capture is under `tools/playtest/shared`.

Do not remove current-behavior tests to hide failures. The latest full-suite result and unresolved failures are recorded in [the cleanup audit](../docs/REPOSITORY_CLEANUP.md). Generated screenshots, profiles and build directories can be cleared with the dry-run-first `npm run clean:generated`; it archives text exports and model drafts before applying cleanup.
