# Landing and departure sound

`transitAudio.js` provides one bounded voice for the current exterior or pad
animation. It reuses the decoded thrust recording and shared filtered noise,
with a small oscillator fallback when samples are unavailable. No audio assets
are generated or decoded per frame.

- Planet entry/exit blends atmospheric air with the engine pass. Station films
  retain the engine pass with a small room/reverb send instead of atmosphere.
- Landing winds the drive down, plays gear hydraulics at 64% and soft contact
  at 82%, matching the hull's settling pose. Takeoff spools up, retracts the
  gear and fades the departing engine with distance. Screen position controls
  stereo placement.
- The animation's progress drives envelopes and threshold cues, not scheduled
  wall-clock events. Loading gates remain silent; resumed shots start at their
  current progress without replaying earlier mechanical cues.
- Skip, cancellation, hidden/portrait views, lost WebGL context, finished shots
  and disposal fade/stop the voice. Only the active film ducks music; the user's
  music/effects settings remain authoritative. The earlier immediate generic
  dock sound is removed.

Run `node tests/browser/transit-audio.mjs` for muted desktop/iPhone animation
checks and silent OfflineAudioContext waveform, headroom, cue and cleanup
checks. `VR_AUDIO_ONLY=1` runs the offline checks alone. The isolated replay page
from `node tools/playtest/planet-transitions.mjs` has a Sound checkbox, initially
off, for listening manually without changing a career save.
