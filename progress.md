Original prompt: Review and revise all equipment names for ambiguity and visible tiers.

- Replaced Arena-only shorthand with shared equipment names; revised all 27 definitions in English/German.
- Named loot retains hardware identity. Technology tier is separate from rarity and weapon model.
- 42 focused item, inventory, outfitting, localization and Arena presentation checks passed.
- Corrected vague utility stat labels and nonbreaking name/tier spacing; compact landscape reward titles adjusted.
- Muted desktop Chrome, Android Chrome and iPhone WebKit checks passed: all 27 equipment titles, reward selection, shop names/details, tier spacing and phone card containment. Final screenshots reviewed.
- Packaging and git diff checks passed. No outstanding work for this request.

Follow-up: use Regeneration terminology and provide an editable naming HTML.
- Updated energy/shield labels and Regenerationsreaktor.
- Added bilingual equipment/stat/affix/named editor with browser drafts and JSON import/export.
- 18 focused presentation checks and packaging passed.
- Desktop Chrome, Android Chrome and iPhone WebKit editor checks passed: edits, tier/language previews, JSON export/import, invalid input handling, local draft reload, search, category filters and no horizontal overflow.

Follow-up: apply exported naming edits and explain reinforced pulse laser overlap.
- Applied all exported names; preserved IDs and gameplay.
- Reinforced pulse is a legacy stat upgrade: same range/cadence, +17.4% damage and +12.5% energy at equal tier. Recommend consolidating into ordinary tiers in a separate change.
- 30 focused name, inventory and outfitting checks passed; packaging passed.
- Refreshed the editor and verified every exported name plus representative Arena labels on desktop, Android and iPhone. Screenshots reviewed.

Task: consolidate the reinforced pulse into technology tiers, then commit and push main.
- One catalog family; II preserves the former reinforced base firepower, III advances it.
- Migrating career inventory, locker stock, wreck loot, saved Arena offers and interrupted-wave checkpoints.
- Full suite: 692 tests passed. Packaging and staged diff checks passed.
- Muted desktop/Android/iPhone: pulse I–III cards and reward acceptance passed; live Arena Run III and career II projectile damage verified. Desktop spectator fits use the pulse family. Screenshots reviewed.
- Ready for the requested main commit and push.
