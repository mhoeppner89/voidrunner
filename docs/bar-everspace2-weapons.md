# Bar Dossier — Everspace 2 Primary Weapons

Compiled from fetched sources (see Sources) + 16 official press screenshots in
`gauntlet/refs/ed-01..16.jpg` (1920×1080, verified ES2 visuals: ship/station
beauty shots — palette and material reference, not weapon-HUD close-ups).
Fetched 2026-08-25 via curl; web_search API was unavailable.

## Lineup table (10 primary families)

| Weapon | Damage type | Projectile behavior | Envelope | Rate/economy | Playstyle it creates |
|---|---|---|---|---|---|
| Pulse Laser | Energy | Rapid-firing bolts (not hitscan) | Mid range | Sustained spam, energy-pooled | Shield-stripping default; forgiving all-rounder |
| Beam Laser | Kinetic+Energy | Hitscan sustained beam, no tracking needed | Medium | DoT while held | Aim-and-hold precision; reward for steady tracking |
| Rail Gun | Kinetic | Charged shot, full charge-up before firing | Longest range | Slow, deliberate | Sniper: pre-aim lanes, engage before enemies close |
| Autocannon | Kinetic | Rapid-fire, spins up | Mid/short | RoF ramps while held | Brawler spray-down; armor shredder |
| Scatter Gun | Kinetic | Slow-firing spread launcher | Very short | Slow cadence, high per-shot | Shotgun brawler: get inside their turn |
| Blaster | Energy | Quick-firing projectiles, large spread | Short/mid | Automatic | Run-and-gun; good vs big slow targets |
| Thermo Gun | Energy | Homing projectiles | Mid | Steady | Lazy tracking; burn pressure while maneuvering |
| Flak | Kinetic | Slow projectiles that detonate (on hit or timed) into wide splash | Mid | Burst cadence | Crowd control vs swarms; area denial |
| Gauss Cannon | Energy+Kinetic | RoF AND spread ramp while holding trigger | Mid | Ramping | Risk/reward trigger discipline: long holds shred, cone blooms |
| Coil Gun | Kinetic-leaning | Rapid mass-driver bursts (like burst-fire Beam) | Mid | Burst cadence, energy-hungry | Puncture bursts between dodges |

Secondary ordnance (context): Homing / EMP / Shieldbreaker / Armorbreaker /
Destabilizer / Web / Corrosion / Cruise missiles, Rockets, Mines, Corrosion +
Web mines — i.e. status effects (disable, slow, DoT, debuff) live on the
secondary shelf.

## What makes each feel distinct

- **Engagement envelope is the identity.** Rail = "win before they arrive";
  Scatter = "win inside 100m"; everything else fills the middle with a
  different rhythm. Range × burst-width is stated per weapon, not implied.
- **Fire rhythm differs, not just numbers.** Charge-up (Rail), spin-up
  (Autocannon), ramp-with-bloom (Gauss), sustained beam (Beam/Thermo), burst
  (Coil/Flak), slow thump (Scatter). Two weapons rarely share a cadence.
- **Sound/visual signature per family** (from footage/press material):
  beams hum and hold a line; kinetics thunk and spit tracers; Flak pops into
  flak-cloud puffs; Rail cracks. No two primaries share a muzzle character.
- **Weaknesses are honest.** Rail: low per-shot damage + charge time. Scatter:
  useless beyond close range. Gauss: spread blooms into uselessness. Flak:
  slow projectiles whiff vs fast aces. Every gun has a bad day.
- **Damage-type economy:** Energy hurts shields, Kinetic hurts armor/hull —
  swapping weapons mid-fight is the intended answer (GameSkinny: "bring
  different kinds so you can swap when necessary").

## Design patterns worth stealing

1. **Name the envelope on the tin.** Each weapon's description states where it
   wins and where it dies. A roster where every gun is "fine everywhere" fails.
2. **Cadence diversity beats stat diversity.** Charge/spin-up/ramp/beam/burst/
   thump — six rhythms across ten guns. Copy the rhythm axis, not the stats.
3. **One signature mechanic per weapon.** Rail=charge, Gauss=ramp+bloom,
   Flak=timed AoE, Thermo=homing. Exactly one trick each, executed deep.
4. **Primaries never run dry; pressure comes from energy/heat, ammo anxiety is
   reserved for secondaries.** (ES2 primaries are energy-pooled, unlimited.)
5. **Status effects are a weapon axis.** Disable (EMP), slow (Web), DoT
   (Corrosion), debuff (Destabilizer) — but ES2 shelves them in secondaries;
   a primary that controls (jam weapons) is a gap we may deliberately fill.
6. **Swapping mid-fight is a skill.** The UI makes the active weapon and its
   pool always visible; hot-swapping to answer shields→armor is core play.

## Mapping to Voidrunner roster (spec v1)

| ES2 pattern | Voidrunner answer |
|---|---|
| Rail Gun (charged sniper) | Magrail gauss rifle — hyper-velocity slug, over-penetration as its one trick |
| Flak (timed AoE) | Sunlance plasma mortar — arcing blob, splash + burn, siege envelope |
| Scatter Gun | Ripper scattergun — 7-pellet cone, brawler |
| Autocannon/Flak hybrid, defensive | PDC cluster — missile auto-intercept + point-blank spray (control-primary, ES2 gap) |
| Shieldbreaker/EMP (secondary) | Ion Lance — primary that cracks shields ×4 + jams weapons (deliberate shelf-jump) |
| Pulse Laser | Pulse Laser Array (existing baseline, energy spam) |
| — | Seeker missiles stay secondary (already homing) |

## Sources

- [GameSkinny — Everspace 2 Ship Weapons Guide and Full List](https://www.gameskinny.com/tips/everspace-2-ship-weapons-guide-and-full-list/)
- [GameLuster — Everspace 2: All Primary Weapons And What They Do](https://gameluster.com/everspace-2-all-primary-weapons-and-what-they-do/)
- [Wikipedia — Everspace 2](https://en.wikipedia.org/wiki/Everspace_2) (context: ARPG looter-shooter, Freelancer-like, ship classes)
- [DuckDuckGo results page](https://html.duckduckgo.com/html/?q=everspace+2+primary+weapons+list) (discovery)
- Local: `gauntlet/refs/ed-01..16.jpg` (official ES2 press stills, visual bar)
