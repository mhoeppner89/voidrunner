import test from 'node:test';import assert from 'node:assert/strict';
import {newArenaRun,runRewardPlan,RUN_EQUIPMENT_RARITY,chooseRunReward,ARENA_RUN_KEY,ARENA_RECORD_KEY} from '../../src/game/arenaRun.js';
import {OUTFIT_ITEMS} from '../../src/game/outfitting.js';import{GameUI}from'../../src/game/ui.js';
function ready(){const s=newArenaRun(false,714);s.arenaRun.hullChosen=true;s.arenaRun.decisions[0]=true;const fit=s.player.outfitting.loadouts[s.player.shipId];fit.guns[0]='pulse-cannon';fit.guns[1]='pulse-cannon';return s;}
function panel(s){const node={innerHTML:'',classList:{remove(){}}},ui=Object.create(GameUI.prototype);ui.root={querySelector:()=>node};ui.updateOrientationNotice=()=>{};ui.showArenaRun(s);return node.innerHTML;}
function arenaMenu(run=null,record=null){const node={innerHTML:'',classList:{remove(){}}},data=new Map(),ui=Object.create(GameUI.prototype);if(run)data.set(ARENA_RUN_KEY,JSON.stringify(run));if(record)data.set(ARENA_RECORD_KEY,JSON.stringify(record));globalThis.window={localStorage:{getItem:key=>data.get(key)??null}};ui.root={querySelector:()=>node};ui.updateOrientationNotice=()=>{};ui.showArena();return node.innerHTML;}
test('arena hub offers only Arena Run and Spectator',()=>{
 const markup=arenaMenu();assert.equal((markup.match(/class="arena-mode-card/g)||[]).length,2);
 assert.match(markup,/id="arena-run-title">/);assert.match(markup,/id="arena-spectator-title">/);
 assert.match(markup,/data-ui-command="new-arena-run"/);assert.match(markup,/data-ui-command="observer-start"/);
 assert.doesNotMatch(markup,/data-arena-select|data-ui-command="launch-arena"|arena-grid/);
});
test('a saved run keeps resume, replace and unlocked hard choices in the two-mode hub',()=>{
 const markup=arenaMenu(newArenaRun(false,714),{best:4200,unlockedHard:true});
 assert.match(markup,/data-ui-command="resume-arena-run"/);assert.match(markup,/data-ui-command="new-arena-run"/);
 assert.match(markup,/data-ui-command="hard-arena-run"/);assert.match(markup,/arena-mode-record/);assert.match(markup,/4200/);
});
test('run equipment grades cover real items without changing their stats',()=>{
 for(const [id,quality]of Object.entries(RUN_EQUIPMENT_RARITY)){assert(OUTFIT_ITEMS[id]);assert(['common','uncommon','rare'].includes(quality));assert.equal(OUTFIT_ITEMS[id].rarity,undefined);}
});
test('run rewards and fitted summaries use the same quality colors and retain selection actions',()=>{
 const s=ready();Object.assign(s.arenaRun,{wave:5,offers:['ripper','gauss-cannon','pulse-cannon-t3'],rewardChosen:false});const markup=panel(s);
 for(const q of ['common','uncommon','rare'])assert.match(markup,new RegExp(`data-rarity="${q}"`));
 assert.equal((markup.match(/data-run-action="reward"/g)||[]).length,3);assert.match(markup,/run-replacement/);assert.doesNotMatch(markup,/lead your target|Fits an empty mount/);
 s.arenaRun.rewardChosen=true;s.player.outfitting.loadouts[s.player.shipId].guns[0]='pulse-cannon-t3';assert.match(panel(s),/run-item-label[^>]*data-rarity="rare"/);
});
test('launcher rewards use a free shared bay before replacing a forward gun',()=>{
 const s=ready(),fit=s.player.outfitting.loadouts[s.player.shipId];fit.guns[1]=null;
 const free=runRewardPlan(s,'torpedo-launcher');assert.deepEqual(free.changes.map(({index,old,other})=>({index,old,other})),[{index:1,old:null,other:null},{index:2,old:null,other:null}]);
 assert.deepEqual(free.replaced,[]);assert.equal(fit.guns[0],'pulse-cannon');
 s.arenaRun.wave=1;s.arenaRun.offers=['torpedo-launcher'];assert.equal(chooseRunReward(s,'torpedo-launcher'),true);
 const installed=s.player.outfitting.loadouts[s.player.shipId];assert.equal(installed.launchers[1],'torpedo-launcher');assert.equal(installed.guns[0],'pulse-cannon');
 const fullSave=ready(),fullFit=fullSave.player.outfitting.loadouts[fullSave.player.shipId];fullFit.guns[1]='ripper';fullFit.guns[2]='ripper';
 const full=runRewardPlan(fullSave,'torpedo-launcher');assert.equal(full.replaced.length,1);assert.equal(fullFit.guns[1],'ripper');
});
test('gun rewards fill a vacant weapon bay without replacing an installed gun',()=>{
 const s=ready(),fit=s.player.outfitting.loadouts[s.player.shipId];fit.guns[1]=null;
 const plan=runRewardPlan(s,'ripper');assert.deepEqual(plan.changes.map(({key,index,old})=>({key,index,old})),[{key:'guns',index:1,old:null},{key:'guns',index:2,old:null}]);
 assert.deepEqual(plan.replaced,[]);assert.equal(fit.guns[0],'pulse-cannon');
});
test('utility rewards use a vacant utility socket and leave installed equipment intact',()=>{
 const s=ready(),fit=s.player.outfitting.loadouts[s.player.shipId];fit.utility[0]='engine-mk2';
 const plan=runRewardPlan(s,'radar-mk2');assert.deepEqual(plan.changes.map(({key,index,old})=>({key,index,old})),[{key:'utility',index:1,old:null}]);
 assert.deepEqual(plan.replaced,[]);assert.equal(fit.utility[0],'engine-mk2');
});
test('hull options render authored silhouettes rather than missing image URLs',()=>{
 const s=newArenaRun(false,714),markup=panel(s);assert.equal((markup.match(/class="run-hull-image"/g)||[]).length,3);assert.doesNotMatch(markup,/src="undefined"/);
});

test('upgraded and skip-boosted Arena rewards roll real affixes and traits that persist on reload',async()=>{
 const {runOffers,readArenaRun,writeArenaRun}=await import('../../src/game/arenaRun.js');
 const {EQUIPMENT_RARITIES,NAMED_EQUIPMENT,forgetEquipmentDefinition}=await import('../../src/game/equipmentCatalog.js');
 const {createOutfittingState}=await import('../../src/game/outfitting.js');
 const data=new Map();globalThis.window={localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}};
 let foundNamed=false;
 for(let seed=1;seed<=40&&!foundNamed;seed++){
  const s=newArenaRun(false,seed);s.player.shipId='blade';s.player.ownedShips=['blade'];s.player.outfitting=createOutfittingState(['blade']);
  Object.assign(s.arenaRun,{wave:5,phase:'prepare',hullChosen:true,rewardChosen:false,openingPicks:2,rarityBonusWave:5});
  s.arenaRun.offers=runOffers(s);
  for(const id of s.arenaRun.offers){
   const item=OUTFIT_ITEMS[id];if(!item)continue;
   const expectedAffixes=EQUIPMENT_RARITIES[item.rarity]?.affixes??0;
   assert.equal(item.affixIds?.length??0,expectedAffixes,id);
   if(item.rarity==='named'){assert.ok(NAMED_EQUIPMENT[item.baseId]);assert.ok(item.trait);foundNamed=true;}
  }
  if(foundNamed){
   writeArenaRun(s);const before=s.arenaRun.offers.map(id=>({id,affixIds:OUTFIT_ITEMS[id]?.affixIds,trait:OUTFIT_ITEMS[id]?.trait}));
   s.arenaRun.offers.forEach(forgetEquipmentDefinition);
   const restored=readArenaRun();assert.ok(restored);
   assert.deepEqual(restored.arenaRun.offers.map(id=>({id,affixIds:OUTFIT_ITEMS[id]?.affixIds,trait:OUTFIT_ITEMS[id]?.trait})),before);
  }
 }
 assert.ok(foundNamed,'tier-3 skip bonus can offer a Legendary with its trait');
});

test('Arena rewards, the ready room and fitting show grade effects, affixes, traits and ratings in both languages',async()=>{
 const {createEquipmentRecord}=await import('../../src/game/equipmentInventory.js');
 const {setLanguage,getLanguage}=await import('../../src/game/i18n.js');
 const previous=getLanguage();
 const rare=createEquipmentRecord('pulse-cannon',{id:'eq-arena-ui-rare',tier:2,rarity:'rare',affixes:['overcharged','siphoning'],rolls:[.8,.9]});
 const named=createEquipmentRecord('mortar',{id:'eq-arena-ui-named',tier:3,rarity:'named',affixes:['efficient','rapid'],rolls:[.7,.8]});
 const s=ready();
 s.player.outfitting.loadouts[s.player.shipId].guns[0]=rare.id;
 s.player.outfitting.locker[named.id]=1;
 try{
  for(const [lang,expected]of [['en',['Rare','+16% damage','Overcharged','Siphoning','Legendary','Legendary trait','60% wider blast','Rating','Dawnbreaker']],['de',['Selten','+16 % Schaden','Überladen','Abzapfend','Legendär','Legendäre Eigenschaft','60 % größere Explosion','Wertung','Dawnbreaker']]]){
   setLanguage(lang);
   Object.assign(s.arenaRun,{wave:5,rewardChosen:false,offers:['pulse-cannon-t3',rare.id,named.id]});
   const rewardsMarkup=panel(s);
   for(const cls of ['run-rarity-badge','run-rating','run-rarity-effects','run-trait','run-stats','run-replacement'])assert.match(rewardsMarkup,new RegExp(cls),`${lang} rewards miss ${cls}`);
   for(const text of expected)assert.ok(rewardsMarkup.includes(text),`${lang} rewards missing ${text}`);
   assert.doesNotMatch(rewardsMarkup,/Base stats|Basiswerte|undefined|NaN/);

   s.arenaRun.rewardChosen=true;
   const readyMarkup=panel(s);
   assert.match(readyMarkup,/run-loadout-row/);assert.ok(readyMarkup.includes(expected[0]));assert.ok(readyMarkup.includes(expected[2]));

   const node={innerHTML:'',classList:{remove(){}}},ui=Object.create(GameUI.prototype);
   ui.root={querySelector:()=>node};ui.updateOrientationNotice=()=>{};ui.runFitOpen=true;ui.showArenaRun(s);
   assert.match(node.innerHTML,/run-fit-detail/);assert.match(node.innerHTML,/run-spare/);assert.match(node.innerHTML,/run-rarity-effects/);
   assert.ok(node.innerHTML.includes(expected[2]));assert.ok(node.innerHTML.includes(expected[4]),'the spare legendary names its grade');
  }
 }finally{setLanguage(previous);}
});
test('hull picks draw the silhouette inside its own bounds and compare hulls on shared scales',()=>{
 const markup=panel(newArenaRun(false,714));
 const boxes=[...markup.matchAll(/class="run-hull-image" viewBox="([^"]+)"/g)].map(m=>m[1].split(' ').map(Number));
 assert.equal(boxes.length,3);for(const box of boxes)assert.ok(box.every(Number.isFinite)&&box[2]>0&&box[3]>0,String(box));
 assert.equal((markup.match(/class="run-bar"/g)||[]).length,12);assert.doesNotMatch(markup,/NaN|undefined/);
});
test('a coloured Arena reward is a real record of its grade, not a coloured base item',async()=>{
 const {runOffers}=await import('../../src/game/arenaRun.js');const {EQUIPMENT_RARITIES}=await import('../../src/game/equipmentCatalog.js');
 let checked=0;
 for(let seed=1;seed<=30;seed++){
  const s=ready();s.arenaRun.seed=seed;Object.assign(s.arenaRun,{wave:6,phase:'prepare',rewardChosen:false,openingPicks:2});
  for(const id of runOffers(s)){const d=OUTFIT_ITEMS[id];if(!d||['repair','rearm','resupply'].includes(id))continue;const grade=d.rarity??RUN_EQUIPMENT_RARITY[id]??'common';
   if(grade!=='common'){assert.ok(d.rarity,`${id} shows ${grade} without being a ${grade} record`);assert.equal(d.affixIds.length,EQUIPMENT_RARITIES[d.rarity].affixes);checked++;}}
 }
 assert.ok(checked>5,`checked ${checked} coloured rewards`);
});
