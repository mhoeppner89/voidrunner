// Pixel-art item sprites for cargo and equipment. The art is generated from
// the vector glyphs in tools/icons/itemGlyphs.mjs (`npm run icons:pixelize`)
// into src/game/itemSprites.js; this module decodes a sprite once into one
// crisp SVG path per colour. Rarity stays on the tier pips and affix marks,
// which take currentColor (the --item-color of the card they sit on).
import {ITEM_SPRITES} from './itemSprites.js';

const AFFIX_MARKS={efficient:'M9 1 2 8h6l-4 6',precise:'M7 0v4m0 6v4M0 7h4m6 0h4M4 4h6v6H4z',rapid:'M1 2l5 5-5 5m6-10 5 5-5 5',longRange:'M1 7h12m0 0-4-4m4 4-4 4',light:'M2 12 11 2M4 9l-1-5 8-2-2 8z',tuned:'M3 12l8-8M9 1l4 4-3 3-4-4z',compact:'M1 5V1h4m4 0h4v4M1 9v4h4m4 0h4V9',overcharged:'M7 1v12M1 7h12M3 3l8 8m0-8-8 8',disruptive:'M7 1 2 3v4c0 3 2 5 5 6 3-1 5-3 5-6V3zM2 12 12 2',piercing:'M1 13 13 1m0 0H7m6 0v6',siphoning:'M3 4a5 5 0 1 1-1 5m1-5V1m0 3h3',reinforced:'M2 2h10v10H2zM2 7h10M7 2v10',warded:'M7 1 2 3v4c0 3 2 5 5 6 3-1 5-3 5-6V3z',overclocked:'M2 11a6 6 0 1 1 10 0M7 11l3-5'};
const SIZE=32;
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decoded=new Map();
// Accent recolouring mirrors the pixelizer: saturate ×1.15, then the core
// highlight (55% to white) and signal strokes (15% to white).
const rgb=n=>[n>>16&255,n>>8&255,n&255];
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const sat=(c,k)=>{const m=(c[0]+c[1]+c[2])/3;return c.map(x=>Math.max(0,Math.min(255,Math.round(m+(x-m)*k))));};
const hex6=c=>c.map(v=>v.toString(16).padStart(2,'0')).join('');
// [palette, rle, codes] → '<path fill=… d=…/>' markup, one path per colour.
function spriteMarkup(group,key,accent){
 const cacheKey=group+':'+key+':'+(accent??'');
 if(decoded.has(cacheKey))return decoded.get(cacheKey);
 const [palette,rle,codes='']=ITEM_SPRITES[group][key];
 let colors=palette.match(/.{6}/g);
 if(accent!=null){const a=sat(rgb(accent),1.15),white=[255,255,255];colors=colors.map((c,n)=>codes[n]==='a'?hex6(a):codes[n]==='h'?hex6(mix(a,white,.55)):codes[n]==='s'?hex6(mix(a,white,.15)):c);}
 const paths=colors.map(()=>'');
 let i=0;
 for(let r=0;r<rle.length;r+=2){
  const color=parseInt(rle[r],36),length=parseInt(rle[r+1],36);
  if(color){
   // Runs never wrap rows in the source, except across transparent gaps; split defensively.
   let start=i,left=length;
   while(left>0){const x=start%SIZE,y=Math.floor(start/SIZE),w=Math.min(left,SIZE-x);paths[color-1]+=`M${x} ${y}h${w}v1h-${w}z`;start+=w;left-=w;}
  }
  i+=length;
 }
 const markup=colors.map((c,n)=>`<path d="${paths[n]}" fill="#${c}"/>`).join('');
 decoded.set(cacheKey,markup);
 return markup;
}
const svg=(group,key,attributes,extra='',accent)=>`<svg ${attributes} viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><g class="item-hardware">${spriteMarkup(group,key,accent)}</g>${extra}</svg>`;
// Tier pips: small ink-rimmed diamonds along the bottom edge.
// Each family keeps its silhouette; tiers II/III add hardware and change the
// paint (titanium, then black alloy with gold edges), and the accent light
// takes the item's signature colour, the same colour as its shots.
const pip=x=>({ink:`M${x} 27h1v1h-1zM${x-1} 28h3v1h-3zM${x-2} 29h5v1h-5zM${x-1} 30h3v1h-3zM${x} 31h1v1h-1z`,fill:`M${x} 28h1v1h-1zM${x-1} 29h3v1h-3zM${x} 30h1v1h-1z`});
export function equipmentIcon(item,className=''){
 const raw=item?.baseId??item?.id,legacyTier=raw==='pulse-mk2'||raw==='pulse-cannon-t2'?2:raw==='pulse-cannon-t3'?3:1,base=legacyTier>1?'pulse-cannon':raw,key=ITEM_SPRITES.equipment[base]&&base!=='fallback'?base:undefined;
 const tier=Math.max(1,Math.min(3,item?.tier??legacyTier));
 const pips=Array.from({length:tier},(_,i)=>pip(16-(tier-1)*3+i*6));
 const affixes=(item?.affixIds??[]).filter(id=>AFFIX_MARKS[id]).slice(0,2);
 const marks=affixes.map((id,i)=>`<path class="item-affix-mark" data-affix="${id}" transform="translate(${i?1:26} 1) scale(.36)" d="${AFFIX_MARKS[id]}" fill="none" stroke="currentColor" stroke-width="3" shape-rendering="auto"/>`).join('');
 const extra=`<path class="item-tier-ink" fill="#05080f" d="${pips.map(p=>p.ink).join('')}"/><path class="item-tier-mark" fill="currentColor" d="${pips.map(p=>p.fill).join('')}"/>${marks}`;
 const tiered=key&&ITEM_SPRITES.equipment[`${key}@${tier}`]?`${key}@${tier}`:key,accent=item?.signature?.color;
 return svg('equipment',tiered??'fallback',`class="item-icon ${html(className)}" data-icon="${html(key??base??'equipment')}" data-tier="${tier}"${accent!=null?` data-signature="${html(item.signature.id)}"`:''}`,extra,accent);
}
export function commodityIcon(commodity,className=''){
 const id=typeof commodity==='string'?commodity:commodity?.id;
 const key=ITEM_SPRITES.commodity[id]&&id!=='fallback'?id:'fallback';
 return svg('commodity',key,`class="item-icon commodity-icon ${html(className)}" data-commodity-icon="${html(id??'cargo')}"`);
}
