# Frontier League — 0.8.2au

The Frontier League is a regular frontier polity opposed to Concord rule. It is neutral to the player at first, hostile at standing −30 or lower, and opposes Concord and Red Talon ships. Its civilians do not initiate fights. League patrols do not perform Concord customs inspections or pirate shakedowns.

## Territory

Acheron branches from Pale Ring through a free, bidirectional jump route. Existing route endpoint IDs remain intact.

- **Haven Freeport:** civilian trade, repairs, fuel, outfitting and civilian hulls.
- **Unity Shipworks:** all five League hulls, including reputation-gated military ships.
- **Cinderfall Habitat:** industrial trade and civilian services.
- **The Shattered Crown:** mining belt; existing mining restrictions still apply.

Acheron’s distant black hole is a visual landmark, drawn with a single shader quad: dark shadow, bright disk and lensed disk arcs. It is an artistic approximation, not a gravitational-lensing simulation or a navigable gravity hazard.

Eligible local patrol/trader traffic uses League hulls at 100% in Acheron, 35% around Pale Ring (15% at Nacre), and 15% around Cairn/Mourning Line. It does not replace traffic in the protected Helios docks or Meridian. Existing encounter and station-traffic budgets still apply.

## Hulls

Speeds below use simulation values (HUD speed = ×2). Starting balance values have integration coverage, not a completed win-rate calibration.

| Hull | Cruise/boost | Shield/hull | Cargo | Main guns | Launchers | Defense | Price/standing |
|---|---|---|---|---|---|---|---|
| Speedster | 84/140 | 85/140 | 12 | 2 S | 1 S | — | 31,000 / 0 |
| Legionary | 67/110 | 135/245 | 20 | 2 M | 1 M | — | 57,000 / 12 |
| Andromeda | 56/90 | 145/280 | 24 | 2 M | 2 M | 1 S turret | 66,000 / 20 |
| Torsas | 46/72 | 115/260 | 80 | 2 S | 1 S | 1 S turret + 1 combat drone bay | 43,000 / 0 |
| Astra | 60/96 | 110/210 | 48 | 1 S + 1 M | 1 S | 1 combat drone bay | 47,000 / 0 |

NPC fittings are declared in `src/game/leagueContent.js`. Andromeda racks have independent ammunition and select torpedoes for capital targets, swarms for fighters, falling back to the remaining rack when depleted. Player hull trades preserve legal existing equipment through the normal fitting-transfer rules; shipyard stock is not a free copy of a military NPC outfit.

Models remain below 5,000 triangles, with 512-square hull textures and reflective canopy materials. Model orientation, collision bounds, muzzle anchors, engine nozzles, turret clearance, drone ports, cockpit silhouettes and landed sprites are integrated. Cockpit artwork reuses existing frames with their corresponding damage masks. All models load on demand.

## Verification

Focused checks: `node --import ./src/game/offlineImportHooks.mjs --test tests/league.test.mjs src/game/galaxy.test.mjs src/game/droneIntegration.test.mjs src/game/shipTrade.test.mjs src/game/outfitting.test.mjs`.

Local disposable preview: `http://localhost:4184/.freebuff/league/play.html`. The preview supplies test credits/standing and does not save to the career. Production careers travel via Pale Ring and earn standing through local work.

## Station artwork

The Acheron exterior stations are authored in Blender and exported by `scripts/build-acheron-stations.py`, then validated/packed with `node scripts/package-acheron-stations.mjs` (uses the existing `/tmp/voidrunner-gltf-tools` build dependencies). Source scene: `glb_models/acheron-stations.blend`.

| Station | Design | Triangles | Texture | GLB size |
|---|---|---:|---|---:|
| Haven | Tiered civilian port and cargo berths | 4,630 | 512² | 318 KB |
| Unity | Open military drydock with gantries | 4,328 | 512² | 312 KB |
| Cinderfall | Shielded habitat, refinery vessels, radiators | 6,818 | 512² | 407 KB |

The structures fit inside 95% of the existing station collision sphere; automatic docking occurs outside that envelope. The open drydock is visual architecture, not a new manual docking mechanic. Models load on entering Acheron and share materials within each asset.

Visual direction referenced Privateer’s original [Perry cover artwork](https://www.choicestgames.com/2015/09/choicest-vgm-vgm-198-wing-commander.html) and its [base descriptions](https://download.wcnews.com/files/manuals/Privateer%20-%20Playguide-Manual.pdf); all geometry and panel textures are newly authored.
