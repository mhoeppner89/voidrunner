// Shared, transparent hardware glyphs. Broad silhouettes survive small lists;
// faceted faces carry depth without textures, gradients, filters or animation.
const glyph=(body,facet,detail,core='')=>({body,facet,detail,core});
const SYMBOLS={
 'mining-drone':glyph('M24 16l8-8 8 8v27l-8 8-8-8zM24 22H8v18h16m16-18h16v18H40','M32 8l8 8v27l-8 8V35l5-7-5-8zM8 22h16v5H8m32-5h16v5H40','M12 31h8m24 0h8M27 42h10','M27 26l10-10m-10 1 10 10M28 33l4-4 4 4-4 6z'),
 'pdc-drone':glyph('M24 16l8-8 8 8v27l-8 8-8-8zM24 22H8v18h16m16-18h16v18H40','M32 8l8 8v27l-8 8V35l5-7-5-8zM8 22h16v5H8m32-5h16v5H40','M12 31h8m24 0h8M27 42h10','M28 16v17m8-17v17M27 24h10'),
 'repair-drone':glyph('M24 16l8-8 8 8v27l-8 8-8-8zM24 22H8v18h16m16-18h16v18H40','M32 8l8 8v27l-8 8V35l5-7-5-8zM8 22h16v5H8m32-5h16v5H40','M12 31h8m24 0h8M27 42h10','M29 20h6v6h6v6h-6v6h-6v-6h-6v-6h6z'),
 'pulse-cannon':glyph('M19 26h26l3 6v13l-5 5H21l-5-5V32zM23 26V9h6v17m6 0V9h6v17','M19 26h26l-5 6H24zM41 32h7v13l-5 5h-2z','M23 14h6m6 0h6M24 36h12m-12 7h7','M26 37h5v5h-5z'),
 'beam-emitter':glyph('M21 25l11-5 11 5 5 14-7 11H23l-7-11zM25 23l-5-12 5-5 7 12 7-12 5 5-5 12','M32 20l11 5 5 14-7 11h-9V33z','M23 40h18M32 14V3m-5 6h10M24 44h6','M27 29h10v8H27z'),
 'gauss-cannon':glyph('M23 31h18l5 7v9l-6 3H24l-6-3v-9zM24 31V5h5v26m6 0V5h5v26','M41 31l5 7v9l-6 3h-8V38z','M24 10h16m-16 7h16m-16 7h16M24 42h10M32 5V2','M29 35h6v8h-6z'),
 ripper:glyph('M18 30l7-7h14l7 7v14l-8 6H26l-8-6zM22 28l-4-9 5-7h18l5 7-4 9','M39 23l7 7v14l-8 6h-6V33z','M23 17h18M25 39h14M24 44h8M12 17l-5-3m45 3 5-3','M27 20h10l-5 8z'),
 'ion-blaster':glyph('M19 21l6-7h14l6 7v23l-8 6H27l-8-6zM13 25h6v17h-6zm32 0h6v17h-6z','M39 14l6 7v23l-8 6h-5V26z','M13 29h6m-6 8h6m26-8h6m-6 8h6M25 45h8','M35 20l-10 13h8l-4 9 11-15h-8z'),
 mortar:glyph('M17 30l7-6h16l7 6v14l-7 6H24l-7-6zM24 24V13l8-7 8 7v11','M40 24l7 6v14l-7 6h-8V34z','M24 17h16M24 38h16M13 21l-4-4m42 4 4-4','M26 16a6 6 0 1 0 12 0 6 6 0 1 0-12 0'),
 'seeker-launcher':glyph('M23 36V18L32 5l9 13v18l-6 13h-6zM23 29l-9 15h9m18-15 9 15h-9','M32 5l9 13v18l-6 13h-3z','M23 20h18M27 33h10M27 46l-2 5m12-5 2 5','M29 12h6l3 6H26z'),
 'swarm-launcher':glyph('M10 21l6-10h32l6 10v22l-8 7H18l-8-7z','M16 11h32l6 10-10 5H20l-10-5zM44 26l10-5v22l-8 7h-2z','M17 31l3-2 3 2v5l-3 2-3-2zm13 0 3-2 3 2v5l-3 2-3-2zM17 20l3-2 3 2v5l-3 2-3-2zm13 0 3-2 3 2v5l-3 2-3-2zM45 27v10M20 45h20','M20 20l2 4h-4zm13 0 2 4h-4zM20 31l2 4h-4zm13 0 2 4h-4z'),
 'shield-seeker-launcher':glyph('M20 36V18L29 5l9 13v18l-6 13h-6zM20 29l-8 15h8M38 29l8 15h-8M43 7l12 5v10c0 7-6 11-12 14-6-3-11-7-11-14V12z','M29 5l9 13v18l-6 13h-3zM43 7l12 5v10l-12 9z','M20 20h17M24 34h10M39 18l4 5 7-8','M25 12h7l3 6H22z'),
 'shield-swarm-launcher':glyph('M9 23l7-10h27l8 10v21l-7 6H16l-7-6zM44 6l12 5v10c0 7-5 11-12 14-6-3-11-7-11-14V11z','M16 13h27l8 10-11 6H20L9 23zM40 29h11v15l-7 6h-4zM44 6l12 5v10l-12 9z','M15 33l3-2 3 2v5l-3 2-3-2zm13 0 3-2 3 2v5l-3 2-3-2zM15 22l3-2 3 2v5l-3 2-3-2zm13 0 3-2 3 2v5l-3 2-3-2zM39 17l5 5 7-8','M18 22l2 4h-4zm13 0 2 4h-4zM18 33l2 4h-4zm13 0 2 4h-4z'),
 'torpedo-launcher':glyph('M23 35V18c0-6 9-14 9-14s9 8 9 14v17l-5 15h-8zM23 29l-9 15h9m18-15 9 15h-9','M32 4c0 0 9 8 9 14v17l-5 15h-4z','M23 21h18M27 30h10M27 35h10M27 42h10','M27 14h10v5H27z'),
 pdc:glyph('M15 46l7-7h20l7 7v4H15zM20 37V25l7-6h10l7 6v12l-6 5H26zM25 21V6h5v15m4 0V6h5v15','M37 19l7 6v12l-6 5h-6V27zM22 39h20l7 7H15z','M25 12h5m4 0h5M25 29h14M25 34h9','M28 29h8v6h-8z'),
 'tracking-turret':glyph('M14 46l8-6h20l8 6v4H14zM20 26l12-8 12 8v11l-8 6H28l-8-6zM29 22V8h6v14','M32 18l12 8v11l-8 6h-4zM22 40h20l8 6H14z','M25 31h14','M29 29h6v6h-6z'),
 'capacitor-bank':glyph('M12 17l6-5h28l6 5v27l-6 6H18l-6-6zM22 12V8h20v4','M18 12h28l6 5-8 5H20l-8-5zM44 22l8-5v27l-6 6h-2z','M21 27v16m11-16v16m11-16v16M19 25h6m4 0h6m5 0h6','M19 35h6v7h-6zm10 0h6v7h-6zm11 0h6v7h-6z'),
 'sustained-reactor':glyph('M23 9h18l12 12v17L41 50H23L11 38V21z','M41 9l12 12v17L41 50H32V39l10-10-10-11V9z','M23 16l-5 7v12l7 8h14l7-8V23l-5-7M8 25H4m4 8H4m52-8h4m-4 8h4','M32 19l8 10-8 10-8-10z'),
 'shield-mk2':glyph('M32 5l21 9v14c0 11-9 19-21 24C20 47 11 39 11 28V14z','M32 5l21 9v14c0 11-9 19-21 24V42l11-13V20l-11-5z','M21 20l11-5 11 5v9c-2 6-7 11-11 13-4-2-9-7-11-13z','M28 24h8v11h-8z'),
 'recovery-shield':glyph('M32 6l20 8v14c0 10-8 19-20 24-12-5-20-14-20-24V14z','M32 6l20 8v14c0 10-8 19-20 24V41l10-12V21l-10-5z','M22 20l10-5 10 5v10c-2 6-6 10-10 13-4-3-8-7-10-13z',''),
 'capital-shield-generator':glyph('M32 4l20 9v16c0 10-8 19-20 24-12-5-20-14-20-24V13zM6 16h6v25H6zm46 0h6v25h-6z','M32 4l20 9v16c0 10-8 19-20 24V41l11-13V19l-11-5z','M6 21h6m-6 14h6m40-14h6m-6 14h6','M32 20l9 5v10l-9 6-9-6V25z'),
 'armor-mk2':glyph('M9 22l21-12 20 11v12L30 45 9 34zM17 34v9l19 9 20-12v-9','M30 10l20 11-20 12L9 22zM30 33l20-12v12L30 45zM36 44l20-13v9L36 52z','M17 24l13 7 12-7M17 31l7 4m0 8 12 6','M20 18l10-6 11 6-11 6z'),
 'engine-mk2':glyph('M22 7h20l5 8v19l-7 9H24l-7-9V15z','M22 7h20l5 8-9 5H25l-8-5zM38 20l9-5v19l-7 9h-8z','M22 25h20M22 31h20','M25 34h14l-4 7h-6z'),
 'thrusters-mk2':glyph('M23 21l9-5 9 5v18l-9 5-9-5zM8 24h9v12H8zm39 0h9v12h-9zM26 5h12v8H26zm0 42h12v8H26z','M32 16l9 5v18l-9 5zM8 24h9v4H8zm39 0h9v4h-9z','M11 28h3m36 0h3','M28 25h8v10h-8z'),
 'radar-mk2':glyph('M13 14l32 25c-14 6-31-7-32-25zM29 33v12h10V38M20 46h25v4H20z','M13 14l32 25-10 1-17-15zM29 33l10 5v7H29z','M29 26l13-15M39 9l6 4M47 10l4-5m-1 12 7-1','M37 13l6-5 5 4-6 5z'),
 'cargo-pods':glyph('M8 20l15-8 14 8v23l-14 8-15-8zM39 19l9-5 9 5v23l-9 5-9-5z','M23 12l14 8-14 8-15-8zM23 28l14-8v23l-14 8zM48 14l9 5v23l-9 5z','M13 29v10m5-7v10m24-16 10-5M28 29v12','M12 22l5 3v8l-5-3zM42 32l4 2v7l-4-2z'),
 'loot-collector':glyph('M20 8h24l8 8v9H12v-9zM22 37l10-6 10 6v11l-10 5-10-5z','M44 8l8 8v9H39V16zM32 31l10 6v11l-10 5z','M15 31l7 6m27-6-7 6M24 17h16M27 38l5 3 5-3M32 41v8','M26 15h12v6H26z'),
 'salvage-mk2':glyph('M13 14l9-6 6 6-9 12 7 12-6 6L8 29V20zM51 14l-9-6-6 6 9 12-7 12 6 6 12-15V20z','M22 8l6 6-9 12 7 12-6 6-5-15v-9zM42 8l-6 6 9 12-7 12 6 6 5-15V20z','M24 28h16','M27 21l5-3 5 3v9l-5 3-5-3z'),
 'frigate-battery':glyph('M14 32l9-8h22l8 8v14l-9 5H23l-9-5zM23 24V9h8v15m6 0V9h8v15','M23 24h22l8 8-10 6H23l-9-6zM43 38l10-6v14l-9 5h-1z','M23 15h8m6 0h8M22 42h15M11 41H7m49 0h4','M27 39h9v6h-9z'),
 'cruiser-battery':glyph('M12 34l10-9h25l9 9v12l-11 6H23l-11-6zM22 25V5h9v20m7 0V5h9v20','M22 25h25l9 9-11 6H23l-11-6zM45 40l11-6v12l-11 6z','M22 11h9m7 0h9M22 18h9m7 0h9M21 45h19','M24 42h12v7H24z'),
};
const COMMODITY_SYMBOLS={
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

const SIGNALS={
 'pulse-cannon':'M24 9h4m8 0h4M26 14h1m10 0h1',
 'beam-emitter':'M32 4v13M27 7l3 7m7-7-3 7',
 'gauss-cannon':'M26 7v17m12-17v17',
 ripper:'M25 17h14M12 17l-4-3m44 3 4-3',
 'ion-blaster':'M14 30v6m36-6v6',
 mortar:'M32 11v10m-5-5h10',
 'seeker-launcher':'M27 25h10M29 45v4m6-4v4',
 'swarm-launcher':'M19 44h18',
 'shield-seeker-launcher':'M39 18l4 5 7-8',
 'shield-swarm-launcher':'M39 17l5 5 7-8',
 'torpedo-launcher':'M27 31h10m-10 5h10M30 47v4m4-4v4',
 pdc:'M26 7h3m6 0h3',
 'tracking-turret':'M16 20a19 19 0 0 1 9-10M39 10a19 19 0 0 1 9 10M16 20l-2-6m2 6 6-2M48 20l2-6m-2 6-6-2',
 'capacitor-bank':'M21 27v4m11-4v4m11-4v4',
 'sustained-reactor':'M23 16h6m6 0h6M23 42h6m6 0h6',
 'shield-mk2':'M27 22l5-3 5 3',
 'recovery-shield':'M39 24a10 10 0 1 0 2 12M39 24h-6m6 0v-6',
 'capital-shield-generator':'M8 23v10m48-10v10',
 'armor-mk2':'M18 37l11 6M39 44l9-6',
 'engine-mk2':'M25 45l-3 7m10-7v9m7-9 3 7',
 'thrusters-mk2':'M9 30H3m0 0 4-4m-4 4 4 4M55 30h6m0 0-4-4m4 4-4 4M32 8V3m0 0-4 4m4-4 4 4M32 48v6m0 0-4-4m4 4 4-4',
 'radar-mk2':'M48 10l4-5m-1 12 7-1',
 'cargo-pods':'M16 34v5m30-12v5',
 'loot-collector':'M17 27l5 5m25-5-5 5',
 'salvage-mk2':'M32 36v13m0 0-5-5m5 5 5-5',
 'frigate-battery':'M24 10h6m8 0h6M24 16h6m8 0h6',
 'cruiser-battery':'M23 6h7m9 0h7M23 18h7m9 0h7',
};
// Body paint is independent of rarity. Rarity stays on the tier/affix markers.
const STEEL={body:'#203b50',face:'#496b83',edge:'#a9c5d5',line:'#799aaf'};
const ACCENTS={
 'mining-drone':'#ecc46f','pdc-drone':'#8bc8ed','repair-drone':'#83dbad',
 'pulse-cannon':'#72e7f0','beam-emitter':'#8bf3db','gauss-cannon':'#e8bd72',ripper:'#f0a176','ion-blaster':'#b8a3f5',mortar:'#ffb279',
 'seeker-launcher':'#edb875','swarm-launcher':'#edb875','shield-seeker-launcher':'#89c5ff','shield-swarm-launcher':'#89c5ff','torpedo-launcher':'#ea9488',
 pdc:'#f0c781','tracking-turret':'#83e9e0','capacitor-bank':'#76ddd2','sustained-reactor':'#efc877','shield-mk2':'#79bdf4','recovery-shield':'#78e3cb','capital-shield-generator':'#8fc5f6',
 'armor-mk2':'#d9b37a','engine-mk2':'#f6b372','thrusters-mk2':'#7fd5ee','radar-mk2':'#83e2c9','cargo-pods':'#d3b37b','salvage-mk2':'#91dfd1','loot-collector':'#8de2db','frigate-battery':'#e1ba82','cruiser-battery':'#f0b777',
};
const CARGO_PAINT={
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
const paintStyle=p=>`--icon-body:${p.body};--icon-face:${p.face};--icon-edge:${p.edge};--icon-line:${p.line};--icon-accent:${p.accent}`;
const EQUIPMENT_PAINT=Object.fromEntries(Object.entries(ACCENTS).map(([id,accent])=>[id,paintStyle({...STEEL,accent})]));
const COMMODITY_PAINT=Object.fromEntries(Object.entries(CARGO_PAINT).map(([id,p])=>[id,paintStyle(p)]));

const AFFIX_MARKS={efficient:'M9 1 2 8h6l-4 6',precise:'M7 0v4m0 6v4M0 7h4m6 0h4M4 4h6v6H4z',rapid:'M1 2l5 5-5 5m6-10 5 5-5 5',longRange:'M1 7h12m0 0-4-4m4 4-4 4',light:'M2 12 11 2M4 9l-1-5 8-2-2 8z',tuned:'M3 12l8-8M9 1l4 4-3 3-4-4z',compact:'M1 5V1h4m4 0h4v4M1 9v4h4m4 0h4V9'};
const fallback=glyph('M12 20l20-10 20 10v24L32 54 12 44z','M32 10l20 10-20 10-20-10zM32 30l20-10v24L32 54z','M20 24l7 4m-7 7 7 4');
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg=(shape,attributes,paint,signal='',extra='')=>`<svg ${attributes} style="${paint}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><g class="item-hardware" transform="translate(3 3) scale(.9)"><path d="${shape.body}" class="item-surface"/><path d="${shape.facet}" class="item-facet"/><path d="${shape.detail}" class="item-engraving"/>${shape.core?`<path d="${shape.core}" class="item-core"/>`:''}${signal?`<path d="${signal}" class="item-signal"/>`:''}</g>${extra}</svg>`;
export function equipmentIcon(item,className=''){
 const raw=item?.baseId??item?.id,legacyTier=raw==='pulse-mk2'||raw==='pulse-cannon-t2'?2:raw==='pulse-cannon-t3'?3:1,base=legacyTier>1?'pulse-cannon':raw,key=SYMBOLS[base]?base:undefined;
 const tier=Math.max(1,Math.min(3,item?.tier??legacyTier));
 const pips=Array.from({length:tier},(_,i)=>{const x=32-(tier-1)*5+i*10;return `M${x} 56l3 3-3 3-3-3z`;}).join('');
 const affixes=(item?.affixIds??[]).filter(id=>AFFIX_MARKS[id]).slice(0,2);
 const marks=affixes.map((id,i)=>`<path class="item-affix-mark" data-affix="${id}" transform="translate(${i?3:51} 3) scale(.65)" d="${AFFIX_MARKS[id]}"/>`).join('');
 return svg(SYMBOLS[key]??fallback,`class="item-icon ${html(className)}" data-icon="${html(key??base??'equipment')}" data-tier="${tier}"`,EQUIPMENT_PAINT[key]??paintStyle({...STEEL,accent:'#9ed5e8'}),SIGNALS[key],`<path class="item-tier-mark" d="${pips}"/>${marks}`);
}
export function commodityIcon(commodity,className=''){
 const id=typeof commodity==='string'?commodity:commodity?.id;
 return svg(COMMODITY_SYMBOLS[id]??fallback,`class="item-icon commodity-icon ${html(className)}" data-commodity-icon="${html(id??'cargo')}"`,COMMODITY_PAINT[id]??paintStyle({...STEEL,accent:'#9ed5e8'}));
}
