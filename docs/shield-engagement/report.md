# Shield activation window — 0.8.2ez

The former finite burst reserve and yellow spectator bar are removed. Flyable shields retain the 75% capacity increase and 5.3/s recharge. Player and NPC combat share the new activation calculation in career, arena, Arena Run and spectator. Capital shields retain their existing damage rules; they also show the shield flash.

## Current rule

The first shield-intercepted hit starts a fixed 0.25-second activation and pays its full shield energy cost. Further hits during that window pay 25% of the load up to the strongest hit already intercepted, plus the full cost of any strength increase. For simultaneous loads, the total cost is 25% of their sum plus 75% of the largest load (while shields remain healthy). Order does not change that total. Three 20-point hits cost 30, rather than 60. A 20-point hit followed by a 100-point hit costs 20 + 85 = 105.

Follow-ups cannot extend the window. The next hit at or after expiry starts another full-cost activation. Shield multipliers affect the intercepted load; hull multipliers and bypass damage keep their original behavior. Pure bypass hits do not activate the field. Physical collisions do not receive the reduction. Shield collapse immediately ends the activation, and reduced load cannot exceed remaining shield energy, so one shield point cannot protect an entire heavy shot. State is transient and is not saved.

## Visuals

A local blue-white contact spot and expanding cyan ripples appear on the shield ellipsoid at the incoming impact point. Up to four recent contacts can coexist; the remaining shell is invisible. Weapon impacts and beam endpoints project onto that shield surface while shields intercept the shot. Pure bypass hits retain their hull impact. Local ripples follow the interpolated hull position/orientation and fade within the remaining activation window; cockpit feedback is fainter. The renderer reuses at most 64 shells with shared geometry, one draw per active field and no added particles, lights, textures or postprocessing pass. Yellow reserve bars and their data are gone; spectator markers retain their fixed ship offset.

0.8.2fa validation: 45 focused checks, actual beam and pulse surface contacts in muted Chrome, rotated/oblique geometry and bypass checks, desktop/phone screenshots inspected. Balance rules are unchanged from 0.8.2ez.

## Balance validation

Six hulls: Scrapper, Speedster, Talon, Legionary, Lancer and Blade; stock shipping NPC loadouts, veteran pilots, open space. Two seeds with mirrored spawn/update order give 72 matched fights per configuration. Seconds run from encounter start to team elimination, not from first impact.

| Fight | Capacity + slower regen only | Activation window |
|---|---:|---:|
| 1v1 | 33.3 s | 32.9 s |
| 2v1 | 12.4 s | 17.3 s |
| 3v3 | 35.2 s | 46.2 s |

The initial 0.25-second / 25% settings met the intended goal, so they were retained. Expanded validation used four seeds and mirrored order: 144 fights, zero opening four-second damage-window deaths and zero unresolved fights at 120 seconds. Expanded means: 1v1 36.3 s, 2v1 17.3 s, 3v3 46.1 s. The opening window is a reproducible burst proxy, not a measurement of every geometric firing pass. Results cover same-hull squads, not all mixed-tier fleets, torpedo attacks or terrain.

42 focused checks pass. Muted Chrome confirmed 20-point first-hit / 5-point follow-up damage in all four modes, no reserve bars, attached/fading shield effects, and desktop/844×390 visuals with no browser errors. Leaving spectator now clears its overlay before entering another mode.

Runner: `.freebuff/balance/engagement-time.mjs`. Raw final results: `activation-results.json`. No AI participation, targeting or firing restrictions were added.
