# Fixed wreck variants — 0.8.2p

Gallery: http://localhost:4184/.freebuff/wreck-variants/review.html
Local flight: http://localhost:4184/game.html?test=debris-collision

Eight frigates use four fixed arrangements. Two cruisers use two arrangements; central command hulls remain fixed to preserve their interiors and salvage pockets. Battleship, carrier, Wayfarer and Talon occur once and need no alternate arrangement. The accepted reduced 512px assets and revised Talon are included in this release.

Section deltas live in missionWorldData.js. Render wrappers and collision transforms consume the same data. All arrangements share the same source mesh and texture resources; collision vertex/index arrays are reused as well. No sections are omitted, and no extra fracture meshes or texture copies are added. Existing overall wreck locations/rotations, IDs and salvage generation remain fixed. All changed sections fit inside the original salvage exclusion spheres.

Validation: four focused Node tests pass (variant coverage, collision math and exclusion bounds, deterministic salvage/buffer sharing, and no new race-centerline intersections). The focused browser wreck probe passes all 34 section fits and solid-surface ship/weapon checks, all four capital interiors with all six hulls in both directions, salvage-active navigable lanes and seven safe arrival directions. Worst collider bounds error is 1.67% of section diagonal; collision geometry is intentionally simplified. No browser errors. Flight, frigate and cruiser screenshots inspected.

Commands:
- node --import ./src/game/offlineImportHooks.mjs --test tests/wreck-variants.test.mjs
- VR_BASE_URL=http://localhost:4184/game.html node .freebuff/wreck-optimization/probe-flight.mjs

The historical debris probe expected an obsolete three-cannon loadout, so the local probe retains its geometry/flight checks and excludes unrelated loadout assertions.
