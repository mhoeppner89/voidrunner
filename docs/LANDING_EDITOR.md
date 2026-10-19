# Landing scene editor

Generate with `node tools/playtest/landing-editor.mjs`, then open
`http://127.0.0.1:4192/output/landing-editor/index.html` while the repository is served.

- Choose a port, then Desktop or Smartphone. Each port has separate placements for both views. The approved ship angles remain fixed.
- Drag the ship or a menu button. Select an element in the sidebar to set precise X/Y percentages. Arrow keys move it one preview pixel; Shift moves ten.
- Size adjusts the ship's display size for the current view. Ship, shadow and reflection move together; manual buttons are not repositioned by automatic avoidance.
- Preview any of the 15 hulls and their available paints. These choices do not constrain the port layout. Placements apply across hulls.
- Desktop and smartphone previews use fixed 1440×900 and 844×390 game viewports. The editor scales these to fit its workspace. Hide the sidebar to enlarge the preview; Menüs toggles the action buttons.
- Each view starts from the approved placement shipped in the game. A dot beside a port marks changes from that placement. Export includes the approved layouts for unvisited ports too.
- Reset restores the approved placement for the selected port and view. Undo restores the preceding edit. Drafts save under `voidrunner-landing-editor-v2`, separate from the previous angle editor's draft. The embedded game keeps career writes in memory.
- Export `voidrunner-landing-layout.json` and return it for implementation. Import restores an export after validating the entire file; invalid files leave the draft unchanged.

## Export contract

`format` is `voidrunner-landing-layout`, `version` is 2 and `coordinateSpace` is
`scene-normalized`. `referenceRuntime` records the generator's runtime version.
`locations` contains all 17 stable location IDs.

Each location preserves the approved absolute `scale` and
`rotationDeg: {yaw, pitch, roll}` from `src/game/concourseLayouts.js`. These values
are locked. The runtime handles tilted-hull deck clearance and heading-aware
landing/departure offsets; atmosphere shots use their own poses.

Optional `placements.desktop` and `placements.phone` entries contain:

```json
{
  "ship": {"x": 0.6, "y": 0.7, "zoom": 0.9},
  "buttons": {
    "services": {"x": 0.08, "y": 0.75},
    "market": {"x": 0.08, "y": 0.4},
    "bar": {"x": 0.65, "y": 0.1},
    "den": {"x": 0.75, "y": 0.8}
  }
}
```

X/Y are fractions from 0 to 1 within the usable station scene below the header.
Ship coordinates anchor its ground position; button coordinates anchor their
top-left corner. `zoom` is the orthographic camera zoom (0.2–1.5), independent of
the approved base scale. The editor captures the native zoom when first visiting
a view, so dragging does not change size. Phones use the phone placement at
viewport widths of 900 CSS pixels or less. Missing views/buttons use the existing
automatic layout.

Version 1 files load the approved defaults without placements. Version 2 imports
must preserve the approved scale and angles. `preview` records the last hull and
paint; `exportedAt` is informational. Applying an exported placement to the
shipping defaults is a separate step.

## Shared finish

The editor uses the real concourse renderer. Its raw painted backdrop, 3D ship,
cast shadow and cached reflection are combined before one pixel/colour shader.
The canvas covers the backdrop; the ship's virtual stage preserves camera framing
and hit-area calculations. An expanded orthographic render camera shows the full
backdrop, so landing/departure movement crosses the real screen edge at constant
model scale. Entry/exit distances follow the hull bounds and current viewport.
Shadow and reflection receivers are clipped to fixed painted pad boundaries, independent of the movable ship anchor. Shadows soften and fade with height; floor captures stop during open flight.
Menu controls remain interactive DOM elements. Both
desktop and phone output resolutions are bounded; atmosphere shots reuse the
renderer with their own framing.

Verification: `node tests/browser/landing-editor.mjs` uses muted desktop Chrome and
iPhone WebKit. Results and screenshots go to `output/landing-editor-test/`.
