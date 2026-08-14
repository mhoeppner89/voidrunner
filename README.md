# Voidrunner v0.3 — Bright Frontier Adventure

A self-contained Three.js space-trading and combat vertical slice designed for landscape smartphone play first, with keyboard and standard gamepad support as secondary inputs. The current direction is a bright VGA frontier adventure: readable sprite-like silhouettes, vivid cobalt space, cyan/gold instruments, and illustrated point-and-click landing scenes.

The project uses original models, interface art, writing, names, and synthesized audio. It draws on the broad cockpit-space-trader tradition without copying proprietary art, music, characters, ships, maps, dialogue, or interface assets.

## Version 0.3 — Voidrunner style lock

Voidrunner now uses a bright cobalt/navy, cyan, gold, orange, and cream palette. Docked locations open as illustrated scenes with clickable hotspots for the bar, trade deck, mission board, and services; larger markets, missions, equipment, shipyard, and guild views remain contextual terminals. The landing flow is designed for large touch targets and a clear scene center on landscape phones.

The moving world still uses the existing controlled-resolution Three.js renderer and live DOM cockpit instruments. The next art milestone is to replace remaining procedural 3D silhouettes with approved sprite sheets while keeping simulation, collision, and saves unchanged.

The art uses original ships, characters, locations, symbols, and writing. It draws on the broad visual language of classic frontier space trading games without shipping copied Wing Commander or Privateer assets.

## Play the packaged build

The `dist/` directory is already compiled and includes vendored Three.js modules, so it has no runtime network dependency.

```bash
cd void-privateer
python3 -m http.server 4173 -d dist
```

Open `http://localhost:4173/` in a browser. On a phone, add the page to the home screen or use the **Fullscreen** button, rotate to landscape, and resume from the local autosave.

Opening `index.html` directly with a `file://` URL is unsupported because browsers restrict JavaScript modules and service workers in that mode.

## Playable scope

The vertical slice contains one continuous star system with two planets, two stations, an asteroid field, and a ship graveyard. The player can:

- fly manually from a cockpit using inertial pitch, yaw, roll, throttle, afterburner, targeting, nav points, threat-aware autopilot, docking, and planetary landing;
- fight pirates and named bounty targets with guns, missiles, shields, armor, cover checks, patrol intervention, civilian consequences, and combat salvage;
- trade nine commodities across location-specific markets with supply, demand, price movement, cargo mass, and sealed mission freight;
- accept delivery, procurement, timed transport, and bounty contracts;
- scan and mine persistent asteroid deposits, then tractor ore into the cargo hold;
- scan hazardous wrecks and recover scrap, machinery, electronics, arms, and occasional equipment;
- use distinct dock interfaces for the bar, commodity exchange, mission board, repair/refuel services, equipment, ship dealer, and four guild offices;
- progress through merchant, bounty, mining, and salvage reputation tracks, buy upgrades, and purchase the substantially stronger Vanguard VX-22;
- save credits, ship state, cargo, equipment, missions, reputation, discoveries, depleted resources, settings, markets, and world time in local storage.

## Voidrunner visual system

The art pipeline separates the moving world from the interface:

- Three.js renders ships, stations, planets, asteroids, wreckage, particles, weapons, and utility beams at a capped internal resolution, then the browser scales the canvas with nearest-neighbour sampling.
- A transparent illustrated cockpit frame sits above WebGL. Its canopy, dashboard, worn metal, vents, warning plate, and console housings move subtly with the ship; the radar, target panels, status bars, messages, and multifunction displays remain live DOM elements.
- Docked locations use original pixel-art backplates, clickable scene hotspots, large portrait art, compact dialogue cards, and contextual terminal framing.
- Ship-dealer art and live traffic use chunky, utilitarian silhouettes rather than smooth generic primitives.
- Scanlines, limited palettes, hard-edged procedural textures, and pixel-grid animation provide the nostalgic look while native-resolution text and touch targets remain sharp.

Runtime art is under `public/art/` and `public/assets/remaster/`. Reproducible generators are in `scripts/generate_remaster_art.py`, `scripts/generate_cockpit_frame.py`, and `scripts/generate_dock_strip.py`; their generated source references are kept under `art-source/` and are excluded from the playable build. The style contract is documented in `review/ART_DIRECTION.md`.

## Controls

### Touch

- Left stick: pitch and yaw
- Vertical slider: set throttle
- Curved arrows: roll
- **FIRE**: guns, mining laser, or salvage tool according to the selected mode
- **MSL**: missile
- **AB**: afterburner
- **TGT**: cycle target
- **MODE**: combat / mining / salvage
- **SCAN**: analyze the selected ship, deposit, or wreck
- **AUTO**: threat-aware autopilot to the selected nav point
- **ACT**: dock or land when in range and slow enough
- **NAV**: cycle nav point
- **MAP**: system map

### Keyboard

| Action | Keys |
|---|---|
| Pitch / yaw | `W S A D` or arrow keys |
| Roll | `Q E` |
| Throttle | `R F`, `+ -` |
| Fire / utility tool | `Space` |
| Missile | `M` |
| Afterburner | `Shift` |
| Cycle target / nearest hostile | `T` or `Tab` / `H` |
| Cycle mode | `C` |
| Scan | `V` |
| Cycle nav / autopilot | `N` / `J` |
| Dock, land, or act | `G` or `Enter` |
| Map / pause | `K` / `P` or `Esc` |

### Standard gamepad

- Left stick: pitch/yaw
- Right stick: roll/throttle
- Right trigger: fire
- Right shoulder: missile
- Left shoulder: afterburner
- Face buttons: target, mode, action, autopilot
- D-pad up/down/right: scan, nearest hostile, next nav point
- View/Menu: map/pause

Browser gamepad layouts vary. The mapping follows the standard browser Gamepad API layout.

## Build from source

The normal development path uses Vite:

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

The repository also includes the offline static builder used for the packaged artifact:

```bash
npm run build:static
```

That builder transpiles the TypeScript source, fixes browser module extensions, and copies the procedural assets, service worker, manifest, and vendored Three.js runtime into `dist/`.

The compiled art is committed. Regenerating the pixel-art assets requires Python and Pillow:

```bash
python3 scripts/generate_remaster_art.py
python3 scripts/generate_cockpit_frame.py
python3 scripts/generate_dock_strip.py
```

## Architecture

- `src/game/game.ts`: runtime orchestration, flight, combat, AI, encounters, mining, salvage, docking, and progression bridges
- `src/game/data.ts`: ships, equipment, commodities, factions, locations, people, dialogue, and presentation data
- `src/game/economy.ts`: market generation, pricing, cargo rules, and trade mutations
- `src/game/missions.ts`: mission generation, acceptance, deadlines, completion, guild progress, and faction effects
- `src/game/save.ts`: versioned local save schema and migration
- `src/game/worldData.ts`: seeded asteroid field, tunnel structures, graveyard structures, moving debris, and resource nodes
- `src/game/render.ts`: Three.js scene graph, role-specific low-poly objects, procedural pixel textures, effects, beams, and adaptive internal render resolution
- `src/game/input.ts`: action mapping for touch, keyboard, and gamepad
- `src/game/ui.ts`: live DOM cockpit instruments, radar, dock interfaces, illustrated contacts, map, settings, prompts, and responsive layout
- `src/game/audio.ts`: procedural Web Audio music, engine bed, warnings, and effects

Simulation and save state remain separate from Three.js objects. The renderer is a view adapter over serializable game state; text-heavy interfaces remain in the DOM.

## Persistence and offline behavior

The game autosaves after mutations, periodically during flight, when the page becomes hidden, and on page exit. The service worker pre-caches the full static runtime after installation. Progress is local to the browser profile; there is no account, cloud synchronization, or server authority.

## Validation

```bash
node scripts/build-static.mjs
node --test tests/logic.test.mjs
xvfb-run -a python3 tests/browser_qa.py desktop
xvfb-run -a python3 tests/browser_qa.py mobile
xvfb-run -a python3 tests/gamepad_qa.py
xvfb-run -a python3 tests/runtime_careers.py mining
xvfb-run -a python3 tests/runtime_careers.py salvage
xvfb-run -a python3 tests/runtime_careers.py bounty
```

The browser tests require Python Playwright, Chromium, and an X display or Xvfb. They exercise real WebGL rendering, dock interactions, keyboard controls, touch controls, persistence, mining, salvage, and bounty completion.

The source archive contains detailed evidence and review in:

- `review/FEATURE_MATRIX.md`
- `review/PRIVATEER_FEEL_AUDIT.md`
- `review/VISUAL_REMASTER_AUDIT.md`
- `review/ART_DIRECTION.md`
- `review/PLAYTEST_REPORT.md`
- `review/ARCHITECTURE.md`
- `review/screenshots/`

## Vertical-slice limits

This is a condensed, playable proof of the complete career loop rather than a content-complete commercial game. It has one system, two player ships, a compact set of original pixel-art assets and low-poly models, synthesized audio, local-only saves, compact dialogue, and lightweight sphere/segment collision rather than a full rigid-body simulation. Markets, missions, encounters, resource depletion, reputation, upgrades, and ship progression are functional, but their content breadth is intentionally small enough for a browser vertical slice.
