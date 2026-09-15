# 0.8.2u — Tutorial dialogue & comms audit

## Goal

The tutorial (family prologue "The Spare Key") felt overly wordy and unnatural.
It also ended in Helios Verge, the most polished system — crossing the gate into
Meridian left no space moment to close on. 0.8.2u tightens every spoken line and
keeps the player in Helios for a real earn-and-equip stretch before the crossing
becomes their own decision.

## Changes

### Rin leaves early; the crossing is the player's own
- After the family decision at Cairn, Rin departs **in person** (new
  `departure` conversation) and jumps ahead through the gate to chase the
  evacuation ledger. The Second Light leaves the formation
  (`ensureTutorialCompanion` returns nothing from the `galaxy-map` step on) and
  her objective-panel hint is voiced by Mara instead.
- New step `galaxy-map` (chapter 4, "What the Wreck Kept", replacing
  `plot-meridian`): the player plots Meridian **once** on the galaxy map as a
  lesson — the route stays saved — while remaining free to fly their own
  routes (`setTutorialDestination` no longer stomps the plan in this stretch).
- The earn-and-equip stretch is real: ore sells for ~190 cr/unit at Helix,
  equipment runs 1,200–5,800 cr against a 3,500 cr start, so a mining run plus
  a delivery or two is what funds a proper refit.
- `cross-meridian-gate` keeps its step ID but is no longer a guided beat: the
  hyperdrive is not blocked, Rin's radio is silent (two Mara-voiced and one
  Rin-voiced lines carry the silence instead), and the tutorial completes on
  arrival in Meridian — reward, unlock, and **Mara's** rewritten `handoff`
  call: "Rin never called after the gate." It fires on a world-time delay
  (~2.5 min) after the departure, immediately on arrival, waits through modal
  story queueing, survives reload via the `maraCallMade` quest flag, and
  Meridian stays the untouched "next chapter" space.

### Text volume
- `adventureDialogues.js`: 4,417 → ~2,700 words. Every briefing (outfitting,
  navigation, services, weapons, cargo, galaxy, mining, salvage, recorder,
  combat, flight) trimmed to short spoken lines; the weapons briefing went
  from three nodes to two, combat from four to two. New `departure` scene and
  a Mara-voiced `handoff`.
- `tutorialRadio.js` (Rin's route comms): 24 → 15 transmissions, each
  deliberately shorter — a wingman drops remarks, not lectures. The objective
  panel carries the step-by-step instructions.
- `TRAVEL_RADIO` regional chatter: 16 → 11 entries, rewritten in clipped,
  idiomatic traffic-control register. (Helios kept 4 of its 6 so the starting
  system stays lively; Redwake/Pale Ring 2 each, Meridian 3.)
- Step details, flight lessons, toasts and decision summaries trimmed in
  `tutorialCampaign.js`.
- New `check-weapons` handling: the step no longer needs a pre-launch bridge —
  a transition to it resumes flight immediately and the combat briefing follows
  at the belt.

### Localization
- 65 orphaned EN keys removed from `i18n-de.js`; ~57 fresh German entries added
  (radio, step details, lessons, choice labels, toasts), including the pinned
  UI terms (`BERGEN`, `AUS LAGER EINBAUEN`, `SERVICE`) used inside DE dialogue.

## Tests

- `tests/tutorial-audit.test.mjs`, `tests/tutorial-mechanics.test.mjs` updated
  for the ending rework (galaxy-map rename, companion absence, Mara's delayed
  call). All other clicks/click-depths preserved by keeping the mining
  briefing's node depth.
- Full suite: 25 failing tests, **identical to the pre-change baseline** (all
  pre-existing combat/turret/wreck issues). All 50 tutorial, dialogue and
  localization tests pass.


## Follow-up review and focused verification

- Added migration for saved `plot-meridian` progress, corrected the four-chapter counter and restored tap/deploy/recall mining instructions in EN/DE.
- Mara's call is acknowledged only when its conversation completes. Pending calls survive gate transitions; reload reoffers unacknowledged calls. Calls wait while another modal, death or gate transition is active.
- Cache updated alongside the 0.8.2u UI version.
- Replaced the three root-level one-off browser scripts with the local `.freebuff/tutorial/run.mjs` runner. Old scripts are archived locally under its `legacy/` directory.
- Run `node .freebuff/tutorial/run.mjs` for focused logic checks, or add `--browser` for browser checkpoints. Reports/screenshots remain local. Checkpoint automation does not substitute for one uninterrupted human run when judging pacing.

- Measured final validation: 40 logic checks in under one second; all six browser checkpoints in 132.6 seconds. No page/frame errors; desktop and landscape-phone screenshots inspected.
