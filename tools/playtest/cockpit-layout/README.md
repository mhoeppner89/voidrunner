# Starter cockpit artwork review · 04

Build with `node tools/playtest/cockpit-layout.mjs`; serve the repository and open `/output/cockpit-layout/index.html?revision=cockpit-art-04`.

This is a silent isolated artwork review, using simulated flight/readouts. It does not load a career, write settings/saves or change physics. Its approved v4 frame/hand are now integrated into the starter Wayfarer in the live game as of 0.8.2og.

- The entire supplied frame sprite renders as one image. Its beams, joints, lamps and connected monitor housings are preserved. `wayfarer-v3.json` records its actual transparent display apertures; original `GameUI` readouts fit those openings. Independent eight-slice bezels and rebuilt canopy rails are removed.
- No flat dashboard filler planes or old painted bezels remain behind the frame.
- The separate covered navy left hand with white accents is visible for every input method. Three jointly generated pitch poses show forward/neutral/back grip perspective. One common scale and per-frame shaft-end anchors align all poses to a fixed gimbal point. The extended forearm reaches past the viewport through full yaw/pitch. Yaw rotates around the fixed base; neither axis translates it. `artwork.updateStick()` changes the pitch frame only when needed and quantises yaw rotation.
- The mobile button bank has its earlier full-size layout and the approved muted navy/grey colours. Buttons and throttle are hidden/inert for desktop flight. The phone review preset also enables them for inspection on desktop.
- Transparent hit extensions enlarge afterburner 28px above/left and launcher selection 28px left. The painted controls stay unchanged. First contact anywhere in the steering area is neutral; subsequent drag is relative to that contact. This uses the existing `InputManager` touch-origin mode.
- The throttle has a half-width visible rail inside the unchanged wider drag target. The hand also remains smaller than the steering hit area. Tilt is off; existing keyboard/controller bindings are used.
- Comms remain centred at the top. Wingman card aligns with pause/fullscreen; all three upper control housings match the lower bank's muted navy/grey bevels. The 3D hull/canopy reference renders only while its review dialog is open.
- **Show generated cockpit frame** hides the single structural image without moving live readouts. The hand remains visible.

Controls: WASD/arrows steer, Q/E roll, R/F thrust, Space fires, M launches, T targets, J preview jump, P/Escape pauses. Touch uses the existing `InputManager`. Cancelling a touch or losing focus releases it.

Verify with `node tests/browser/cockpit-layout.mjs` (or `VR_BASE_URL` for another server). Checks cover desktop Chrome, Android Chrome and iPhone WebKit, source-aperture alignment, fixed shaft anchors through pitch/yaw, mobile visibility, wide throttle margins, simultaneous steering/fire, saved controller bindings, readout fit, frame comparison and untouched storage. Screenshots/reports are in ignored `output/cockpit-layout/checks`.

Generated art and exact prompts are in `assets/cockpits`. The current whole frame is byte-identical to the user's supplied PNG. The live integration is in `src/game/cockpitArtwork.js`; other hulls are outside this pass.
