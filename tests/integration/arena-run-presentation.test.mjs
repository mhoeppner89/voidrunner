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
 const s=ready();Object.assign(s.arenaRun,{wave:5,offers:['ripper','gauss-cannon','pulse-mk2'],rewardChosen:false});const markup=panel(s);
 for(const q of ['common','uncommon','rare'])assert.match(markup,new RegExp(`data-rarity="${q}"`));
 assert.equal((markup.match(/data-run-action="reward"/g)||[]).length,3);assert.match(markup,/run-replacement/);assert.doesNotMatch(markup,/lead your target|Fits an empty mount/);
 s.arenaRun.rewardChosen=true;s.player.outfitting.loadouts[s.player.shipId].guns[0]='pulse-mk2';assert.match(panel(s),/run-item-label[^>]*data-rarity="rare"/);
});
test('launcher rewards use a free shared bay before replacing a forward gun',()=>{
 const s=ready(),fit=s.player.outfitting.loadouts[s.player.shipId];fit.guns[1]=null;
 const free=runRewardPlan(s,'torpedo-launcher');assert.deepEqual(free.changes.map(({index,old,other})=>({index,old,other})),[{index:1,old:null,other:null}]);
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
