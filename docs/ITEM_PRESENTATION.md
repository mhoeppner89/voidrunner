# Item presentation — 0.8.2fz

Equipment names now use one shared formatter in career and Arena Run. Every label identifies its hardware type and technology tier I–III. Rarity remains independent of tier; names such as Bastion retain the underlying type. Legacy “mk2” IDs do not imply a technology tier.

Energy Storage/Energiespeicher increases stored energy; Reactor Upgrade/Reaktorupgrade increases energy regeneration. Shield Capacity Booster/Schildverstärker and Shield Generator/Schildgenerator distinguish capacity from regeneration. All missile names explicitly say missiles, rockets or torpedoes. Unmounted utility details show their actual rolled stat bonuses with concrete labels.

All 26 equipment and 10 commodity icons now combine a metal casing with an item-specific accent. Pulse/beam hardware uses cyan/mint, magnetic weapons use brass, ion uses violet and plasma uses amber. Cargo has separate water, food, medical, electronic, machine, mineral, gold, scrap, luxury and arms finishes. Rarity remains on labels, card borders, tier diamonds and modifier marks.

Hardware is inset by a shared transform to retain clear margins around every stroke. Recharge/tracking arrows are separated from casing detail; the seven modifier marks have dedicated corner space. No clip paths, raster images, gradients, filters or animations are used.

The standalone `output/item-icons-review/index.html` contains every symbol, 24/32/48px samples, all upgrades, rarity/tier examples, search, size and light/dark controls. It embeds its SVGs and CSS and needs no external assets to render. Generate and verify with `npm run test:icons` while serving the project.

## Verification — 0.8.2fv

- 15 focused item/Arena presentation tests passed, plus packaging and syntax checks.
- Desktop Chrome, Android/Chrome and iPhone/WebKit each verified all 1,060 painted paths in the full gallery. Bounds include Bézier/arc geometry, strokes and parent transforms; no viewport clipping or horizontal overflow was found.
- Gallery search, 112px maximum size and both background modes checked. The page includes all 37 base symbols, all seven upgrade marks and rarity/tier combinations.
- Screenshots reviewed at large and 24/32/48px sizes. Rarity examples keep a dark backing in light mode so common white marks remain legible.

## Faceted icon pass — 0.8.2fu

The shared SVG set now uses layered, faceted silhouettes: a subdued surface, brighter side/top faces, fine engraving and a solid core. Missile racks have individual hexagonal tube mouths; shields, engines, sensors and power units have distinct physical forms. Cargo uses recognizable canisters, medical cases, circuitry, machinery, mineral chunks, ingots and crystals. Transparent silhouettes preserve the existing minimal presentation. Tier diamonds and corner affix marks stay separate from the hardware. Rarity remains white/green/blue.

The icons contain at most four body paths plus tier/affix marks. They use CSS opacity and currentColor with no images, gradient IDs, filters, shadows or animation. Shape data is shared across all UI surfaces.

## Current review

Run `node --import ./tests/helpers/offline-imports.mjs tools/playtest/icon-gallery.mjs` to regenerate the local review at `output/item-icons-review/index.html`; the ignored folder contains before/after comparisons at 24, 32 and 48 pixels, light/dark palettes and desktop/phone menu captures.

## Final verification — 0.8.2fu

- 33 focused presentation, inventory and Arena tests passed; runtime packaging and syntax checks passed.
- Muted desktop Chrome, Android/Chrome and iPhone/WebKit checked the palette, actual reward cards, equipment shops and commodity screens. All three platforms showed the intended icons with no page errors or viewport overflow; screenshots inspected.
- Before/after comparisons and 24/32/48 pixel samples inspected on light and dark backgrounds.
- `git diff --check` passes.

## Earlier stat and layout changes — 0.8.2fr

26 equipment types and all 10 commodities use transparent inline SVG symbols. They appear in Arena Run rewards, replacement previews, fitting and loadout summaries, career equipment lists/details, trading and cargo/loot rows. Shapes distinguish weapon and utility kinds; bottom diamonds identify tiers; corner marks identify career affixes. Existing rarity colors remain white/green/blue. Retired item bitmaps are no longer warmed when opening a station shop.

The old “Capacitor / Kondensator” stat was `energyCapacity`, the maximum stored energy. It now reads **Energy capacity / Energiekapazität**. **Energy regeneration / Energieregeneration** shows reactor output per second. Shield regeneration is shown as its nominal per-second rate, turn acceleration in degrees/s², speed in km/s and ranges in km.

Arena utility previews show the actual fitted outcome. Primary effects show values and percentage changes; indirect changes from replacing an installed item remain visible as compact trade-offs. The former three-stat cutoff is removed. The shield-focused and hull-focused swarm launchers show separate shield/hull damage with the four-rocket volley count. Lower boost-fuel consumption is correctly marked as a benefit.

## Verification

- 39 focused tests passed: distinct symbols, tiers/affixes, actual stat conversions, replacement trade-offs, swarm roles, cache inclusion, retired image warmup, Arena presentation, inventory and phone transactions.
- Muted Chrome and WebKit: reward cards at 1440×900, 844×390 and 568×320; every icon/stat/trade-off stays within its card, with no overflow.
- Equipment shops and commodity screens checked at desktop and phone sizes in both browsers. Commodity icon wrappers have no background or border. No page errors.
- Full icon palette screenshot inspected, including all equipment, commodities and tier/modifier examples. `git diff --check` passes.

The earlier scratch palette was removed during repository cleanup; the current review and captures are under `output/item-icons-review`.

## Naming editor — 0.8.2fz

`npm run review:names` generates the self-contained `output/equipment-names-review/index.html`. Edit German/English equipment names, stat terms, affixes and unique names; preview tiers I–III and inspect item effects. Drafts persist in browser storage, and JSON import/export transfers edits for applying to source. This page does not write game files or change live saves. Empty/duplicate names are flagged and cannot be exported.

Approved names from the exported review live in `src/game/equipmentNaming.js`, including German overrides for legacy translation aliases. The reinforced pulse entry is retired; its save IDs migrate to the single pulse-laser family.

## Pulse family — 0.8.2fz

| Tier | Damage / shot | Energy / shot |
| --- | ---: | ---: |
| I | 9.2 | 3.2 |
| II | 10.8 | 3.6 |
| III | 12.4 | 4 |

All tiers retain 450 km range and 0.17 s cadence. Former reinforced base items become II; higher-tier reinforced records become III. Migration changes the base/tier once and preserves item identity, rarity, affixes and ownership. Hidden runtime references for non-inventory modes carry the same stats as career records; they are not separate catalog families.
