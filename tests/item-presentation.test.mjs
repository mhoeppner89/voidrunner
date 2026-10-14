import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {equipmentIcon,commodityIcon} from '../src/game/itemIcons.js';
import {equipmentStatChanges} from '../src/game/equipmentStatPresentation.js';
import {BASE_OUTFIT_ITEMS} from '../src/game/outfitting.js';import {COMMODITIES,displaySpeed} from '../src/game/data.js';
import {createNewSave} from '../src/game/save.js';import {getEffectiveShipStats} from '../src/game/shipStats.js';import {resolveEquipmentDefinition} from '../src/game/equipmentCatalog.js';import {SHIELD_RECHARGE_RATE} from '../src/game/combatResources.js';
test('all equipment and commodities have distinct transparent vector symbols',()=>{
 const equipment=new Set(),cargo=new Set();for(const item of Object.values(BASE_OUTFIT_ITEMS)){const icon=equipmentIcon(item);assert.match(icon,/<svg /);assert.match(icon,new RegExp(`data-icon="${item.id}"`));assert.doesNotMatch(icon,/<img|<image|<rect|background|undefined/);const shape=icon.match(/<path d="([^"]+)"/)[1];assert(!equipment.has(shape),item.id);equipment.add(shape);}
 for(const item of Object.values(COMMODITIES)){const icon=commodityIcon(item);assert.match(icon,new RegExp(`data-commodity-icon="${item.id}"`));assert.doesNotMatch(icon,/<img|<image|background|undefined/);assert(!cargo.has(icon));cargo.add(icon);}
});
test('inventory tiers and different affixes remain visible without using rarity as a tier',()=>{
 const base=BASE_OUTFIT_ITEMS['pulse-cannon'];const icons=[1,2,3].map(tier=>equipmentIcon(resolveEquipmentDefinition(base,{id:`test-${tier}`,baseId:base.id,tier,rarity:'rare',affixes:['efficient','precise']})));
 assert.equal(new Set(icons).size,3);icons.forEach((svg,i)=>{assert.match(svg,new RegExp(`data-tier="${i+1}"`));assert.match(svg,/data-affix="efficient"/);assert.match(svg,/data-affix="precise"/);});
});
test('capacitor comparisons name actual stored energy and output and retain replacement trade-offs',()=>{
 const s=createNewSave(81,{tutorial:false}),p=s.player,fit=p.outfitting.loadouts[p.shipId];fit.utility.fill(null);fit.utility[0]='engine-mk2';const before=getEffectiveShipStats(p);fit.utility[0]='capacitor-bank';const after=getEffectiveShipStats(p),rows=equipmentStatChanges(before,after,BASE_OUTFIT_ITEMS['capacitor-bank']);
 assert.equal(rows[0].key,'energyCapacity');assert.equal(rows[0].label,'Energy capacity');assert.equal(rows[0].after,after.energyCapacity);assert.equal(rows[1].key,'reactorOutput');assert.equal(rows[1].label,'Energy recharge');assert.equal(rows[1].unit,'/s');assert(rows.some(r=>r.key==='maxSpeed'));assert(rows.some(r=>r.key==='angularAcceleration'));assert(rows.length>3,'no three-stat cutoff');assert.equal(rows.find(r=>r.key==='maxSpeed').after,displaySpeed(after.maxSpeed));
});
test('shield recharge is a real per-second rate; sensor and cargo upgrades expose their own stats',()=>{
 const s=createNewSave(83,{tutorial:false}),p=s.player,fit=p.outfitting.loadouts[p.shipId];fit.utility.fill(null);const before=getEffectiveShipStats(p);
 for(const[id,keys]of [['recovery-shield',['shield','shieldRechargeMultiplier']],['radar-mk2',['radarRange','scanRange']],['cargo-pods',['cargo']]]){fit.utility.fill(null);fit.utility[0]=id;const after=getEffectiveShipStats(p),rows=equipmentStatChanges(before,after,BASE_OUTFIT_ITEMS[id]);for(const key of keys)assert(rows.some(r=>r.key===key));if(id==='recovery-shield'){const r=rows.find(r=>r.key==='shieldRechargeMultiplier');assert.equal(r.after,after.shieldRechargeMultiplier*SHIELD_RECHARGE_RATE);assert.equal(r.unit,'/s');}}
});
test('new shell modules are included in the offline cache',async()=>{const sw=await readFile('sw.js','utf8');assert.match(sw,/\.\/src\/game\/itemIcons\.js/);assert.match(sw,/\.\/src\/game\/equipmentStatPresentation\.js/);});

test('Arena rewards show capacity/output, every replacement trade-off and distinct swarm damage roles',async()=>{
 const {newArenaRun}=await import('../src/game/arenaRun.js'),{GameUI}=await import('../src/game/ui.js'),{loadoutFor}=await import('../src/game/outfitting.js'),{setLanguage}=await import('../src/game/i18n.js');
 setLanguage('en');const s=newArenaRun(false,91);s.player.shipId='legionary';s.player.ownedShips=['legionary'];const f=loadoutFor(s.player);f.guns[0]='pulse-cannon';f.utility=['engine-mk2','radar-mk2','shield-mk2','cargo-pods'];s.player.outfitting.loadouts.legionary=f;
 Object.assign(s.arenaRun,{wave:13,phase:'prepare',hullChosen:true,decisions:{13:true},rewardChosen:false,offers:['shield-swarm-launcher','capacitor-bank','swarm-launcher']});
 const node={innerHTML:'',classList:{remove(){}}},ui=Object.create(GameUI.prototype);ui.root={querySelector:()=>node};ui.updateOrientationNotice=()=>{};ui.showArenaRun(s);
 const markup=node.innerHTML;for(const key of ['energyCapacity','reactorOutput','maxSpeed','acceleration','angularAcceleration','burnFuelMultiplier'])assert.match(markup,new RegExp(`data-stat="${key}"`));
 assert.match(markup,/>Energy capacity</);assert.match(markup,/>Energy recharge</);assert.doesNotMatch(markup,/>Capacitor<|<img/);assert.match(markup,/>4×20</);assert.match(markup,/>4×10</);assert.match(markup,/Shield damage/);assert.match(markup,/Hull damage/);
});
test('station warmup no longer fetches retired equipment/commodity bitmaps',async()=>{
 const {GameUI}=await import('../src/game/ui.js'),ui=Object.create(GameUI.prototype);ui.save=createNewSave(98,{tutorial:false});const urls=ui.locationAssetUrls('helix');assert(urls.length>0);assert(!urls.some(url=>url.includes('/commodities/')||url.includes('/outfitting/simplified/')));
});
