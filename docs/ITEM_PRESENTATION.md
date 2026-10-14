# Item presentation — 0.8.2fr

27 equipment types and all 10 commodities use transparent inline SVG symbols. They appear in Arena Run rewards, replacement previews, fitting and loadout summaries, career equipment lists/details, trading and cargo/loot rows. Shapes distinguish weapon and utility kinds; bottom ticks identify tiers; corner marks identify career affixes. Existing rarity colors remain white/green/blue. Retired item bitmaps are no longer warmed when opening a station shop.

The old “Capacitor / Kondensator” stat was `energyCapacity`, the maximum stored energy. It now reads **Energy capacity / Energiekapazität**. **Energy recharge / Energieladung** shows reactor output per second. Shield recharge is shown as its nominal per-second rate, turn acceleration in degrees/s², speed in km/s and ranges in km.

Arena utility previews show the actual fitted outcome. Primary effects show values and percentage changes; indirect changes from replacing an installed item remain visible as compact trade-offs. The former three-stat cutoff is removed. The shield-focused and hull-focused swarm launchers show separate shield/hull damage with the four-rocket volley count. Lower boost-fuel consumption is correctly marked as a benefit.

## Verification

- 39 focused tests passed: distinct symbols, tiers/affixes, actual stat conversions, replacement trade-offs, swarm roles, cache inclusion, retired image warmup, Arena presentation, inventory and phone transactions.
- Muted Chrome and WebKit: reward cards at 1440×900, 844×390 and 568×320; every icon/stat/trade-off stays within its card, with no overflow.
- Equipment shops and commodity screens checked at desktop and phone sizes in both browsers. Commodity icon wrappers have no background or border. No page errors.
- Full icon palette screenshot inspected, including all equipment, commodities and tier/modifier examples. `git diff --check` passes.

Local palette: `http://127.0.0.1:4192/.freebuff/item-icons/index.html`. Browser checks/results: `.freebuff/item-icons/qa.mjs` and `results.json`. Captures: `/private/tmp/voidrunner-icons-*`. Final test log: `/private/tmp/voidrunner-item-final-tests.log`.
