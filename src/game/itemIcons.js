// Transparent, shared vector symbols. Equipment color comes from rarity;
// the shape identifies the kind, bottom ticks its tier, corner marks its affixes.
const shield='M32 8 49 15v13c0 10-7 16-17 21-10-5-17-11-17-21V15z';
const rocket='M27 39V21l5-11 5 11v18zM27 30l-7 10h7m10-10 7 10h-7M29 43v5m6-5v5';
const SYMBOLS={
 'pulse-cannon':'M22 43V23h20v20zM26 23V12h4v11m4 0V12h4v11M17 16h-5m35 0h5M22 34h20',
 'pulse-mk2':'M20 43V24h24v19zM24 24V10h5v14m6 0V10h5v14M20 34h24M13 15h-5m43 0h5M28 38h8',
 'beam-emitter':'M22 44V30l5-6h10l5 6v14zM32 24V6M26 12l6-6 6 6M22 36h20',
 'gauss-cannon':'M23 44V28h18v16zM26 28V8m12 20V8M26 12h12m-12 8h12M32 8V4M23 36h18',
 ripper:'M22 44V31h20v13zM26 31l-4-9h20l-4 9M32 17v-6M21 18l-4-5m26 5 4-5M13 23l-5-2m43 2 5-2',
 'ion-blaster':'M16 42V24m32 18V24M11 24h10m22 0h10M36 8 24 27h13l-9 20M16 42h8m16 0h8',
 mortar:'M17 42V31l7-9h16l7 9v11zM26 12a6 6 0 1 0 12 0 6 6 0 1 0-12 0M32 1v3m-15 8h5m20 0h5M24 35h16',
 'seeker-launcher':rocket,
 'swarm-launcher':'M14 37V19l5-9 5 9v18zM28 43V25l5-9 5 9v18zM42 37V19l5-9 5 9v18zM16 41v5m16 0v4m13-9v5',
 'shield-seeker-launcher':rocket+'M46 6 55 10v6c0 5-4 9-9 12-5-3-9-7-9-12v-6zM44 17l2-5 2 5',
 'shield-swarm-launcher':'M12 40V23l4-8 4 8v17zM26 44V27l4-8 4 8v17zM40 40V23l4-8 4 8v17zM43 5l11 4v7c0 5-4 9-11 12-6-3-10-7-10-12V9z',
 'torpedo-launcher':'M25 40V19c0-5 7-12 7-12s7 7 7 12v21zM25 32l-8 11h8m14-11 8 11h-8M28 19h8M29 44v5m6-5v5',
 pdc:'M16 43h32M22 38h20v5H22zM20 32h24v6H20zM25 32V18h14v14M28 18V8m8 10V8M12 16l4 4m36-4-4 4',
 'tracking-turret':'M16 43h32M23 34h18v9H23zM22 26h20v8H22zM32 26V9M20 11a12 12 0 0 1 24 0M16 11h8m16 0h8M32 4V1',
 'capacitor-bank':'M18 13h8v31h-8zM38 13h8v31h-8zM12 20h6m8 0h12m8 0h6M12 37h6m8 0h12m8 0h6M28 8h8m-4-4v8',
 'sustained-reactor':'M19 15a19 19 0 1 1-6 17M11 18l8-3-1-9M36 12l-13 19h13l-8 17',
 'shield-mk2':shield+'M32 15 42 19v9c0 6-4 10-10 14-6-4-10-8-10-14v-9z',
 'recovery-shield':shield+'M23 26a9 9 0 1 1 2 11M21 31l2-5 5 1',
 'capital-shield-generator':shield+'M23 27h18m-9-9v18M6 16v23m52-23v23',
 'armor-mk2':'M12 17l13-8 13 8-13 8zM25 25v13L12 30V17M38 17v13l-13 8M38 25l13 8-13 8-13-8M38 41v7',
 'engine-mk2':'M22 10h20v23l-5 8H27l-5-8zM22 22h20M26 41v7m6-7v11m6-11v7M15 16v13m34-13v13',
 'thrusters-mk2':'M26 22h12v12H26zM17 28H5m0 0 5-5m-5 5 5 5M47 28h12m0 0-5-5m5 5-5 5M32 14V2m0 0-5 5m5-5 5 5M32 42v8m0 0-5-5m5 5 5-5',
 'radar-mk2':'M13 30a19 19 0 0 1 38 0M21 30a11 11 0 0 1 22 0M32 30l12-13M32 30v13M22 43h20M28 30a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
 'cargo-pods':'M10 17l13-7 13 7-13 7zM10 17v20l13 7 13-7V17M23 24v20M40 14h12v28H40M44 22h4m-4 12h4',
 'salvage-mk2':'M21 11 12 24l9 13M43 11l9 13-9 13M25 16l-4 8 4 8M39 16l4 8-4 8M28 20h8v8h-8zM32 36v12M26 42l6 6 6-6',
 'frigate-battery':'M18 42V26h28v16zM23 26V9h6v17m6 0V9h6v17M18 34h28M10 42h8m28 0h8',
 'cruiser-battery':'M20 44V28h24v16zM23 28V5h6v23m6 0V5h6v23M23 12h18m-18 9h18M12 35h8m24 0h8',
};
const COMMODITY_SYMBOLS={
 water:'M32 7S16 25 16 35a16 16 0 0 0 32 0C48 25 32 7 32 7zM23 34c0 5 3 8 8 9',
 food:'M32 48V13M32 31c-12 0-18-9-18-16 12 0 18 9 18 16zM32 40c12 0 18-9 18-16-12 0-18 9-18 16zM27 10l5-5 5 5',
 medicine:'M23 10h18v40H23zM26 10V5h12v5M16 27h32m-16-9v18',
 electronics:'M18 14h28v30H18zM25 21h14v16H25zM24 7v7m8-7v7m8-7v7M24 44v7m8-7v7m8-7v7M11 20h7m-7 8h7m-7 8h7M46 20h7m-7 8h7m-7 8h7',
 machinery:'M25 7h14l2 9 8 2 5 12-7 6 1 9-13 6-7-6-9 2-8-11 4-8-1-9zM24 29a8 8 0 1 0 16 0 8 8 0 1 0-16 0',
 ore:'M12 35l8-18 17-7 15 18-6 19-20 4zM20 17l6 17 11-24M26 34l20 13m-20-13-14 1m14-1 26-6',
 gold:'M13 24l7-13h24l7 13-5 18H18zM13 24h38M20 11l5 13m19-13-5 13M18 42l7-18m21 18-7-18',
 scrap:'M10 22l18-13 10 14-18 13zM23 39l14-12 16 10-14 14zM10 44l7-7 5 5-7 7M40 8l8 4-3 9-8-4z',
 luxuries:'M12 17l10-8h20l10 8-20 33zM12 17h40M22 9l-2 8 12 33 12-33-2-8M20 17h24',
 arms:'M18 41V24l6-14 6 14v17zM35 41V24l6-14 6 14v17zM18 32h12m5 0h12M16 46h33',
};
const AFFIX_MARKS={efficient:'M9 1 2 8h6l-4 6',precise:'M7 0v4m0 6v4M0 7h4m6 0h4M4 4h6v6H4z',rapid:'M1 2l5 5-5 5m6-10 5 5-5 5',longRange:'M1 7h12m0 0-4-4m4 4-4 4',light:'M2 12 11 2M4 9l-1-5 8-2-2 8z',tuned:'M3 12l8-8M9 1l4 4-3 3-4-4z',compact:'M1 5V1h4m4 0h4v4M1 9v4h4m4 0h4V9'};
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg=(path,attributes,extra='')=>`<svg ${attributes} viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/>${extra}</svg>`;
export function equipmentIcon(item,className=''){
 const base=item?.baseId??item?.id,key=SYMBOLS[base]?base:undefined;
 const tier=Math.max(1,Math.min(3,item?.tier??(base?.includes('mk2')?2:1)));
 const ticks=Array.from({length:tier},(_,i)=>`M${32-(tier-1)*4+i*8} 55v6`).join('');
 const affixes=(item?.affixIds??[]).filter(id=>AFFIX_MARKS[id]).slice(0,2);
 const marks=affixes.map((id,i)=>`<path class="item-affix-mark" data-affix="${id}" transform="translate(${i?5:47} 2) scale(.75)" d="${AFFIX_MARKS[id]}"/>`).join('');
 return svg(SYMBOLS[key]??'M18 16h28v30H18zM24 24h16m-16 8h16',`class="item-icon ${html(className)}" data-icon="${html(key??base??'equipment')}" data-tier="${tier}"`,`<path class="item-tier-mark" d="${ticks}"/>${marks}`);
}
export function commodityIcon(commodity,className=''){
 const id=typeof commodity==='string'?commodity:commodity?.id;
 return svg(COMMODITY_SYMBOLS[id]??'M14 18l18-10 18 10v26L32 54 14 44zM14 18l18 10 18-10M32 28v26',`class="item-icon commodity-icon ${html(className)}" data-commodity-icon="${html(id??'cargo')}"`);
}
