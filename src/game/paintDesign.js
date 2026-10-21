// Save-safe paint choices. Existing preset strings remain valid and unchanged.
export const PAINT_PATTERNS = Object.freeze([
 {id:'panels',name:'Armor panels'}, {id:'stripes',name:'Twin stripes'},
 {id:'blocks',name:'Angular blocks'}, {id:'asymmetric',name:'Asymmetric'}
]);
export const PAINT_PALETTES = Object.freeze([
 {name:'Naval',colors:['#182d4d','#e3e5df','#d8ad56']},
 {name:'Surveyor',colors:['#d9d5bd','#267d83','#e8a647']},
 {name:'Ember',colors:['#a53532','#282f38','#d7c8a5']},
 {name:'Glacier',colors:['#d6e3e7','#315d80','#48b7ba']},
 {name:'Orchid',colors:['#503e69','#c6b7bd','#e3aa63']}
]);
// Deliberately authored layout dimensions, in each hull's normalized frame.
export const PAINT_LAYOUTS = Object.freeze({
 wayfarer:[.29,.14,.39,-.54,.21],talon:[.36,.11,.48,-.38,.15],demon:[.45,.13,.34,-.47,.25],scrapper:[.34,.15,.35,-.39,.23],
 lancer:[.50,.12,.30,-.49,.19],vanguard:[.39,.15,.45,-.48,.22],prospector:[.25,.16,.42,-.31,.28],
 atlas:[.32,.14,.38,-.44,.26],blade:[.42,.09,.45,-.55,.18],mule:[.30,.16,.30,-.46,.24],
 speedster:[.24,.10,.56,-.45,.16],astra:[.40,.13,.36,-.43,.20],torsas:[.31,.16,.45,-.35,.28],
 andromeda:[.42,.14,.32,-.40,.25],legionary:[.46,.13,.39,-.51,.21]
});
export const paintHullId = id => ({kestrel:'wayfarer',warden:'vanguard','atlas-freighter':'atlas'}[id]??id);
export function normalizePaintDesign(value,hull){
 if(!PAINT_LAYOUTS[paintHullId(hull)]||!value||typeof value!=='object'||Array.isArray(value))return null;
 if(!PAINT_PATTERNS.some(p=>p.id===value.pattern)||!Array.isArray(value.colors)||value.colors.length!==3)return null;
 if(!value.colors.every(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)))return null;
 return{pattern:value.pattern,colors:value.colors.map(c=>c.toLowerCase())};
}
export const paintDesignKey = value => typeof value==='string'?value:JSON.stringify(value);
export const samePaint = (a,b) => paintDesignKey(a??'original')===paintDesignKey(b??'original');
export function editablePaint(value,hull){
 const custom=normalizePaintDesign(value,hull);if(custom)return custom;
 const palette=String(value).includes('courier')?PAINT_PALETTES[4]:String(value).includes('independent')||value==='neutral'?PAINT_PALETTES[1]:value==='original'&&['demon','scrapper'].includes(paintHullId(hull))?PAINT_PALETTES[2]:PAINT_PALETTES[0];
 return{pattern:'panels',colors:[...palette.colors]};
}
