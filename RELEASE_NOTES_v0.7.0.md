# RELEASE_NOTES v0.7.0 — Weapon Roster

Six primary weapons replace the single laser cannon. Each is built around one
way to fight, states where it wins and where it dies, and is proven different
by the headless probe suite — judged against Everspace 2's primary lineup
(see `docs/bar-everspace2-weapons.md` for the bar dossier).

## The roster

| Slot | Weapon | Envelope | Signature | Ammo |
|---|---|---|---|---|
| 1 | Pulse Laser | Any-range repeater, ~277 u reach | Twin bolts, full aim assist, never runs dry | ∞ |
| 2 | Magrail (gauss rifle) | Duelist beyond 300 u | 620 u/s slug, over-penetrates to a second ship, half assist cone | 48 slugs |
| 3 | Point-Defense Cluster | Wins inside 71 u | Passive hostile-missile interception at 60 u, 0.06 s spray, heat vent (3.5 s → 1.6 s) | heat |
| 4 | Ripper Scattergun | Wins inside 82 u | 7 pellets, 11° cone, ragged speeds — brawler | 36 shells |
| 5 | Ion Lance | Shield-cracker | ×4 shield soak, 1.8 s NPC gun jam on every hit | 60 cells |
| 6 | Sunlance Plasma Mortar | Siege | Slow orb, splash r=26→12, 6 dps burn ×4 s | 10 pods |

## How you get them

Pulse and Magrail are standard issue on every hull. The other four are
station equipment purchases (Ripper 3,600 · PDC 4,400 · Ion 5,600 · Sunlance
7,200 cr) that install and equip the moment you buy them. An unowned slot
refuses to mount with a cockpit readout; a career saved while the later guns
were granted outright keeps its equipped mount. Ownership derives from the
existing equipment list — no new save schema.

## How you drive them

Digit1–6 selects a slot, X (or the gamepad cycle button, or tapping the
weapon readout on the own-ship monitor) cycles. Every switch logs the gun's
envelope — where it wins, where it dies — on the own-ship flight recorder,
derived from the registry (`speed × life`) so the promise cannot drift from
sim truth. The ship menu carries a WEAPON SYSTEMS card: name · envelope ·
ammo, with unmounted guns dimmed at their station price. Full English and
German.

## Feel

Five new synth voices (rail crack, PDC buzz, scatter thump, ion zap, mortar
thoomp) and per-kind bolt visuals. Review pass 0.7.2: muzzle flashes are
small, faction-tinted, half-opacity pops (no more per-shot strobe), bolt
glow/head layers are roughly half their first-pass size with harder
close-camera attenuation — the magrail tracer included — and the Ripper
cone tightens from 11° to ~6° so shells land on the target instead of
spraying the sky. The combat-feel pass rebuilt laser bolt
tracers (hot core + crossed glow + head sprite), added muzzle flashes and
layered impact bursts, NPC muzzle flashes, and a missile ember read.
`playAtDirection` guards non-finite audio inputs — a NaN pan throws on
`setValueAtTime` and would take the sim loop down mid-dogfight.

## Verification

`.freebuff/probe-weapons.mjs` — 20 checks: per-gun live-fire matrix, gauss
over-penetration through two ships, ion shield/jam math, mortar splash +
burn, passive interception, heat-vent trigger block, once-per-frame edge
switching, save round-trip, envelope dominance (pulse cannot reach 400 u,
magrail can; ripper brawls at 25 u and whiffs at 150 u; PDC salvo
interception), and acquisition gating. The existing regression suite stays
green; the handful of unrelated pre-existing failures were bisected to the
pre-roster release and documented in `docs/WEAPON_ROSTER_SPEC.md`.
