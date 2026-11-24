// Vector source for the cargo (commodity) sprites, plus the shared tier paint
// and signature accents. Equipment is drawn as 45° pixel hardware in
// itemEquipment.mjs. `npm run icons:pixelize` writes both into
// src/game/itemSprites.js; edit the sources, then regenerate. Glyph layers:
// body (dark hull), facet (lit face), engraving (panel lines), core (accent).
export const glyph=(body,facet,detail,core='')=>({body,facet,detail,core});
export const COMMODITY_SYMBOLS={
 water:glyph('M23 10V6h18v4l7 7v27l-7 7H23l-7-7V17z','M23 10h18l7 7-11 6H26l-10-6zM37 23l11-6v27l-7 7h-4z','M26 6v4h12V6M22 43h13','M29 25s-5 7-5 10a7 7 0 0 0 14 0c0-3-5-10-5-10z'),
 food:glyph('M11 28l20-10 21 10v14L31 53 11 42zM31 18V6','M31 18l21 10-21 11-20-11zM31 39l21-11v14L31 53z','M17 33v6l8 4M31 12c-8 0-12-5-12-9 8 0 12 5 12 9zm0 6c8 0 12-5 12-9-8 0-12 5-12 9z','M21 25l10-5 11 5-11 6z'),
 medicine:glyph('M13 21l10-6h19l10 6v23l-10 7H23l-10-7zM24 15V9h16v6','M23 15h19l10 6-13 7H25l-12-7zM39 28l13-7v23l-10 7h-3z','M27 9v6h10V9M19 39v5l8 4','M24 29h7v6h6v7h-6v6h-7v-6h-6v-7h6z'),
 electronics:glyph('M19 13h26l7 7v25l-7 6H19l-7-6V20z','M19 13h26l7 7-10 6H22l-10-6zM42 26l10-6v25l-7 6h-3z','M19 7v6m10-6v6m10-6v6M5 25h7m-7 10h7m40-10h7m-7 10h7M24 51v5m10-5v5','M24 28h12v13H24z'),
 machinery:glyph('M25 8h14l3 8 8 2 5 12-6 7v9l-13 6-7-5-9 2-8-11 4-8-2-9 9-6z','M39 8l3 8 8 2 5 12-6 7v9l-13 6-7-5 11-10V24l-9-8z','M22 28a10 10 0 1 0 20 0 10 10 0 1 0-20 0M9 25l7 4m32 8-7-3','M28 24h8v8h-8z'),
 ore:glyph('M8 34l12-19 19-7 17 21-7 17-23 8z','M20 15l19-7-8 24-23 2zM31 32l25-3-7 17-23 8z','M20 15l11 17 18 14M26 54l5-22M39 8l4 13','M17 33l9-2-4 11-9-4z'),
 gold:glyph('M9 36l8-13h21l7 13-5 11H15zM25 21l7-12h17l8 12-5 10h-7','M17 23h21l7 13H9zM32 9h17l8 12H25zM45 36l-5 11H30l5-11z','M17 27l-3 6m18-6 3 6M33 13l-3 5M15 41h13','M21 28h9l3 5H18zM36 14h9l3 4H33z'),
 scrap:glyph('M9 22l18-12 11 10-4 9-14 8-11-5zM24 41l13-13 19 9-3 9-15 7zM8 43l8-6 6 6-7 8z','M27 10l11 10-18 11-11-9zM37 28l19 9-18 11-14-7z','M20 20l5 5m14 13 7 4M43 8l8 6-5 8-7-6z','M12 42l5-3 3 4-5 4z'),
 luxuries:glyph('M10 21l13-13h20l12 13-23 33z','M23 8h20l12 13H10zM32 21h12L32 54z','M23 8l-3 13 12 33M43 8l1 13M20 21h24','M32 11l7 9H25zM7 2l2 3-2 3-2-3zm49 33 2 3-2 3-2-3z'),
 arms:glyph('M9 25l13-8h25l9 8v20l-12 7H22l-13-7zM24 17V9h17v8','M22 17h25l9 8-14 8H22l-13-8zM42 33l14-8v20l-12 7h-2z','M27 9v8h11V9M22 33v12m9-12v12M15 37v5l5 3','M19 24l3-5 3 5v7h-6zm10 0 3-5 3 5v7h-6z'),
};

// Tier paint: I blue steel, II titanium, III black alloy with gold edges.
export const TIER_PAINT={
 1:{body:'#2f4f68',face:'#5e86a3',edge:'#c6deec',line:'#8fb1c7'},
 2:{body:'#4b5160',face:'#8a93a6',edge:'#eef2f8',line:'#b4bccb'},
 3:{body:'#262a3b',face:'#4b5372',edge:'#f0cc72',line:'#a08a58'},
};
// Items that only exist at tier III keep a single sprite.
export const SINGLE_TIER=new Set(['frigate-battery','cruiser-battery','capital-shield-generator','mining-drone','pdc-drone','repair-drone']);
// Body paint is independent of rarity. Rarity stays on the tier/affix markers.
export const STEEL={body:'#203b50',face:'#496b83',edge:'#a9c5d5',line:'#799aaf'};
export const ACCENTS={
 'mining-drone':'#ecc46f','pdc-drone':'#8bc8ed','repair-drone':'#83dbad',
 'pulse-cannon':'#72e7f0','beam-emitter':'#8bf3db','gauss-cannon':'#e8bd72',ripper:'#f0a176','ion-blaster':'#b8a3f5',mortar:'#ffb279',
 'seeker-launcher':'#edb875','swarm-launcher':'#edb875','shield-seeker-launcher':'#89c5ff','shield-swarm-launcher':'#89c5ff','torpedo-launcher':'#ea9488',
 pdc:'#f0c781','tracking-turret':'#83e9e0','capacitor-bank':'#76ddd2','sustained-reactor':'#efc877','shield-mk2':'#79bdf4','recovery-shield':'#78e3cb','capital-shield-generator':'#8fc5f6',
 'armor-mk2':'#d9b37a','engine-mk2':'#f6b372','thrusters-mk2':'#7fd5ee','radar-mk2':'#83e2c9','cargo-pods':'#d3b37b','salvage-mk2':'#91dfd1','fire-control':'#89dbea','loot-collector':'#8de2db','frigate-battery':'#e1ba82','cruiser-battery':'#f0b777',
};
export const CARGO_PAINT={
 water:{body:'#234d62',face:'#3b8198',edge:'#9ad8e8',line:'#79b7cd',accent:'#93e9fa'},
 food:{body:'#3b4d34',face:'#7d985c',edge:'#c4d5a1',line:'#abbf88',accent:'#e5c07e'},
 medicine:{body:'#b9cec7',face:'#628d83',edge:'#d5e6df',line:'#2d5b55',accent:'#68d7bb'},
 electronics:{...STEEL,accent:'#7faeed'},
 machinery:{body:'#414651',face:'#78808d',edge:'#bdc6d0',line:'#96a3b1',accent:'#e0aa6b'},
 ore:{body:'#494655',face:'#83748c',edge:'#c2aecb',line:'#a192b1',accent:'#d4af81'},
 gold:{body:'#76572b',face:'#c89e4d',edge:'#f2d591',line:'#f3d898',accent:'#ffe4a2'},
 scrap:{body:'#3d4b51',face:'#73858a',edge:'#aebfc4',line:'#90a6b0',accent:'#c0936e'},
 luxuries:{body:'#483d62',face:'#a68acb',edge:'#e0c6f6',line:'#c6ace4',accent:'#f0d5ff'},
 arms:{body:'#51404b',face:'#88616a',edge:'#caa3a6',line:'#b48d94',accent:'#efaa84'},
};
export const FALLBACK=glyph('M12 20l20-10 20 10v24L32 54 12 44z','M32 10l20 10-20 10-20-10zM32 30l20-10v24L32 54z','M20 24l7 4m-7 7 7 4');
