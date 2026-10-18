import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {equipmentIcon,commodityIcon} from '../../src/game/itemIcons.js';
import {equipmentStatChanges,equipmentEffectStats} from '../../src/game/equipmentStatPresentation.js';
import {BASE_OUTFIT_ITEMS} from '../../src/game/outfitting.js';import {COMMODITIES,displaySpeed} from '../../src/game/data.js';
import {createNewSave} from '../../src/game/save.js';import {getEffectiveShipStats} from '../../src/game/shipStats.js';import {resolveEquipmentDefinition} from '../../src/game/equipmentCatalog.js';import {SHIELD_RECHARGE_RATE} from '../../src/game/combatResources.js';
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
 assert.equal(rows[0].key,'energyCapacity');assert.equal(rows[0].label,'Energy capacity');assert.equal(rows[0].after,after.energyCapacity);assert.equal(rows[1].key,'reactorOutput');assert.equal(rows[1].label,'Energy regeneration');assert.equal(rows[1].unit,'/s');assert(rows.some(r=>r.key==='maxSpeed'));assert(rows.some(r=>r.key==='angularAcceleration'));assert(rows.length>3,'no three-stat cutoff');assert.equal(rows.find(r=>r.key==='maxSpeed').after,displaySpeed(after.maxSpeed));
});
test('shield recharge is a real per-second rate; sensor and cargo upgrades expose their own stats',()=>{
 const s=createNewSave(83,{tutorial:false}),p=s.player,fit=p.outfitting.loadouts[p.shipId];fit.utility.fill(null);const before=getEffectiveShipStats(p);
 for(const[id,keys]of [['recovery-shield',['shield','shieldRegeneration']],['radar-mk2',['radarRange','scanRange']],['cargo-pods',['cargo']]]){fit.utility.fill(null);fit.utility[0]=id;const after=getEffectiveShipStats(p),rows=equipmentStatChanges(before,after,BASE_OUTFIT_ITEMS[id]);for(const key of keys)assert(rows.some(r=>r.key===key));if(id==='recovery-shield'){const r=rows.find(r=>r.key==='shieldRegeneration');assert.equal(r.after,after.shieldRegeneration);assert.equal(r.unit,'/s');}}
});
test('new shell modules are included in the offline cache',async()=>{const sw=await readFile('sw.js','utf8');assert.match(sw,/\.\/src\/game\/itemIcons\.js/);assert.match(sw,/\.\/src\/game\/equipmentStatPresentation\.js/);});

test('Arena rewards show capacity/output, every replacement trade-off and distinct swarm damage roles',async()=>{
 const {newArenaRun}=await import('../../src/game/arenaRun.js'),{GameUI}=await import('../../src/game/ui.js'),{loadoutFor}=await import('../../src/game/outfitting.js'),{setLanguage}=await import('../../src/game/i18n.js');
 setLanguage('en');const s=newArenaRun(false,91);s.player.shipId='legionary';s.player.ownedShips=['legionary'];const f=loadoutFor(s.player);f.guns[0]='pulse-cannon';f.utility=['engine-mk2','radar-mk2','shield-mk2','cargo-pods'];s.player.outfitting.loadouts.legionary=f;
 Object.assign(s.arenaRun,{wave:13,phase:'prepare',hullChosen:true,decisions:{13:true},rewardChosen:false,offers:['shield-swarm-launcher','capacitor-bank','swarm-launcher']});
 const node={innerHTML:'',classList:{remove(){}}},ui=Object.create(GameUI.prototype);ui.root={querySelector:()=>node};ui.updateOrientationNotice=()=>{};ui.showArenaRun(s);
 const markup=node.innerHTML;for(const key of ['energyCapacity','reactorOutput','maxSpeed','acceleration','angularAcceleration','burnFuelMultiplier'])assert.match(markup,new RegExp(`data-stat="${key}"`));
 assert.match(markup,/>Energy capacity</);assert.match(markup,/>Energy regeneration</);assert.doesNotMatch(markup,/>Capacitor<|<img/);assert.match(markup,/>4×20</);assert.match(markup,/>4×10</);assert.match(markup,/Shield damage/);assert.match(markup,/Hull damage/);
});
test('station warmup no longer fetches retired equipment/commodity bitmaps',async()=>{
 const {GameUI}=await import('../../src/game/ui.js'),ui=Object.create(GameUI.prototype);ui.save=createNewSave(98,{tutorial:false});const urls=ui.locationAssetUrls('helix');assert(urls.length>0);assert(!urls.some(url=>url.includes('/commodities/')||url.includes('/outfitting/simplified/')));
});

test('all equipment names identify their kind and real tier in both languages', async()=>{
 const {equipmentName:rawName}=await import('../../src/game/equipmentCatalog.js'),{setLanguage,getLanguage}=await import('../../src/game/i18n.js');const language=getLanguage(),equipmentName=(...args)=>rawName(...args).replaceAll('\u00a0',' ');
 try{for(const lang of ['de','en']){setLanguage(lang);const names=new Set();for(const base of Object.values(BASE_OUTFIT_ITEMS)){
  for(const tier of [1,2,3].filter(tier=>tier>=(base.tier??1))){const item=resolveEquipmentDefinition(base,{id:'test',baseId:base.id,tier,rarity:'rare',affixes:['light']}),name=equipmentName(item,{affixes:false});
   assert.match(name,new RegExp(` ${['I','II','III'][tier-1]}$`));assert(!names.has(name),name);names.add(name);
   assert(!name.includes('undefined'));assert.match(equipmentIcon(item),new RegExp(`data-tier="${tier}"`));
  }
 }
 if(lang==='de'){
  assert.equal(equipmentName(BASE_OUTFIT_ITEMS['swarm-launcher']),'Schwarmraketen I');
  assert.equal(equipmentName(BASE_OUTFIT_ITEMS['capacitor-bank']),'Energiespeicher I');
  assert.equal(equipmentName(BASE_OUTFIT_ITEMS['sustained-reactor']),'Reaktorupgrade I');
  assert.equal(equipmentName(BASE_OUTFIT_ITEMS['shield-mk2']),'Schildverstärker I');
  assert.equal(equipmentName(BASE_OUTFIT_ITEMS['recovery-shield']),'Schildgenerator I');
 }
 }assert.match(equipmentIcon(BASE_OUTFIT_ITEMS['shield-mk2']),/data-tier="1"/);
 setLanguage('de');const named=resolveEquipmentDefinition(BASE_OUTFIT_ITEMS['shield-mk2'],{id:'named',baseId:'shield-mk2',tier:2,rarity:'named',affixes:[]});
 assert.equal(equipmentName(named),'Schildverstärker II · Bastion');
 const rare=resolveEquipmentDefinition(BASE_OUTFIT_ITEMS['pulse-cannon'],{id:'rare',baseId:'pulse-cannon',tier:3,rarity:'rare',affixes:['efficient','precise']});
 assert.equal(equipmentName(rare),'Pulslaser III · Effizient · Präzise');assert.equal(equipmentName(rare,{affixes:false}),'Pulslaser III');
 }finally{setLanguage(language);}
});

test('German Arena reward names use complete weapon types and tiers',async()=>{
 const {newArenaRun}=await import('../../src/game/arenaRun.js'),{GameUI}=await import('../../src/game/ui.js'),{setLanguage,getLanguage}=await import('../../src/game/i18n.js');const language=getLanguage();
 try{setLanguage('de');const save=newArenaRun(false,44);const {loadoutFor}=await import('../../src/game/outfitting.js');const fit=loadoutFor(save.player);fit.guns[0]='pulse-cannon';save.player.outfitting.loadouts[save.player.shipId]=fit;Object.assign(save.arenaRun,{wave:13,phase:'prepare',decisions:{13:true},hullChosen:true,rewardChosen:false,offers:['swarm-launcher','capacitor-bank','shield-swarm-launcher']});
 const node={innerHTML:'',classList:{remove(){}}},ui=Object.create(GameUI.prototype);ui.root={querySelector:()=>node};ui.updateOrientationNotice=()=>{};ui.showArenaRun(save);
 for(const name of ['Schwarmraketen I','Energiespeicher I','Anti-Schild Schwarmraketen I'])assert(node.innerHTML.replaceAll('\u00a0',' ').includes(name),name);
 assert.doesNotMatch(node.innerHTML,/>Schwarm<|>Kondensator<|>Schildschwarm</);
 }finally{setLanguage(language);}
});


test('unmounted utility bonuses use concrete stat labels and actual rolled effects',()=>{
 const base=BASE_OUTFIT_ITEMS['capacitor-bank'];const item=resolveEquipmentDefinition(base,{id:'tier2',baseId:base.id,tier:2,rarity:'common',affixes:[]});
 const rows=equipmentEffectStats(item);assert.deepEqual(rows.map(r=>r.label),['Energy capacity','Energy regeneration']);assert.equal(rows[0].unit,'%');assert(Math.abs(rows[0].value-44)<.001);assert(Math.abs(rows[1].value+11)<.001);
 for(const base of Object.values(BASE_OUTFIT_ITEMS).filter(d=>!['gun','launcher','turret'].includes(d.category)))assert(equipmentEffectStats(base).length,base.id);
});

test('approved review names win over historical aliases in both languages',async()=>{
 const {EQUIPMENT_NAMING}=await import('../../src/game/equipmentNaming.js'),{equipmentName}=await import('../../src/game/equipmentCatalog.js'),{t,setLanguage,getLanguage}=await import('../../src/game/i18n.js');const previous=getLanguage();
 try{for(const language of ['de','en']){setLanguage(language);for(const [id,expected] of Object.entries(EQUIPMENT_NAMING.equipment)){
  const item=BASE_OUTFIT_ITEMS[id];assert.equal(item.name,expected.en,id);assert.equal(equipmentName(item),expected[language]+'\u00a0'+['I','II','III'][(item.tier??1)-1],id);
 }
 for(const group of ['terms','affixes','named'])for(const entry of Object.values(EQUIPMENT_NAMING[group]))assert.equal(t(entry.en),entry[language]);
 }setLanguage('de');assert.equal(t('Point-Defence Turret'),'Raketenabwehrturm');assert.equal(equipmentName(BASE_OUTFIT_ITEMS['sustained-reactor']),'Reaktorupgrade\u00a0I');
 }finally{setLanguage(previous);}
 const sw=await readFile('sw.js','utf8');assert.match(sw,/\.\/src\/game\/equipmentNaming\.js/);
});

test('commodity labels stay short in both languages, with legality separate from their names',async()=>{
 const {DE_CATALOG}=await import('../../src/game/i18n-de.js');
 const expected={food:'Protein',water:'Wasser',medicine:'Medigel',electronics:'Elektronik',machinery:'Maschinen',ore:'Erz',gold:'Gold',scrap:'Schrott',luxuries:'Luxusgüter',arms:'Waffen'};
 for(const [id,label]of Object.entries(expected))assert.equal(DE_CATALOG[COMMODITIES[id].name],label,id);
 assert.equal(COMMODITIES.arms.legal,false);assert.equal(COMMODITIES.arms.name,'Weapons');
 const {ADVENTURE_DIALOGUES}=await import('../../src/game/adventureDialogues.js');assert.match(ADVENTURE_DIALOGUES.rin.nodes.legal.text.de,/Waffen sind rot markiert. Ihr Transport ist illegal/);
});
