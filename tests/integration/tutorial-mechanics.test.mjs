import assert from 'node:assert/strict';
import {test} from 'node:test';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {loadoutFor} from '../../src/game/outfitting.js';
import {equipmentBaseId} from '../../src/game/equipmentCatalog.js';
import {hydrateSave} from '../../src/game/save.js';
import {completeMissionsAtDock} from '../../src/game/missions.js';
import {TUTORIAL_MINING_CONTRACT_ID} from '../../src/game/tutorialCampaign.js';
import {quoteCommodityTrade} from '../../src/game/economy.js';

test('the opening max purchase tracks the complete load and sells it profitably in one transaction',()=>{
 const {save,quest,session}=tutorialFixture('buy-supplies'),p=save.player,before=p.credits;
 const quote=quoteCommodityTrade(save,'helix','food','buy',999);assert.ok(quote.quantity>=16);const count=quote.quantity;
 const bought=session.trade('buy','food',999);assert.equal(bought.quantity,count);assert.equal(bought.total,count*80);assert.equal(quest.stepId,'launch-helix');assert.equal(quest.flags.deliveryRequired,count);
 quest.stepId='sell-supplies';p.dockedAt='vesper';const sale=session.trade('sell','food',999);assert.equal(sale.quantity,count);assert.equal(sale.total,count*175);assert.equal(p.credits-before,count*95);assert.equal(quest.stepId,'fit-upgrade');
});
test('the reactor gift fits through the real equipment transaction, free and exactly once',()=>{
 const {save,quest,session}=tutorialFixture('fit-upgrade');save.player.dockedAt='vesper';session.syncWeaponProjection=()=>{};
 session.ensureTutorialEquipment();session.ensureTutorialEquipment();const draft=loadoutFor(save.player);draft.utility[draft.utility.indexOf(null)]='sustained-reactor';
 const before=save.player.credits,quote=session.previewOutfitting(save.player.shipId,draft);assert.ok(quote.ok,quote.code);
 assert.ok(session.applyOutfitting(quote).ok);assert.equal(save.player.credits,before);assert.equal(quest.stepId,'mining-contract');
 const restored=tutorialFixture('mining-contract',hydrateSave(JSON.parse(JSON.stringify(save))));restored.session.ensureTutorialEquipment();
 assert.equal(Object.values(loadoutFor(restored.save.player).utility).filter(id=>equipmentBaseId(id)==='sustained-reactor').length,1);
});
test('the bar contract requires Rin, tracks real extraction, pays normally and cannot be discarded mid-lesson',()=>{
 const {save,quest,session}=tutorialFixture('mining-contract');save.player.dockedAt='vesper';session.setMissionNavigation=()=>{};session.ensureTutorialMiningContract();
 assert.equal(session.acceptMission(TUTORIAL_MINING_CONTRACT_ID).ok,false);
 session.talkToNpc('rin-vek');assert.ok(session.acceptMission(TUTORIAL_MINING_CONTRACT_ID).ok);assert.equal(quest.stepId,'mine-shardbelt');assert.equal(session.discardMission(TUTORIAL_MINING_CONTRACT_ID).ok,false);
 const m=save.activeMissions[0];assert.equal(m.quantity,6);assert.equal(m.deposit,0);assert.equal(m.deadline,null);
 save.player.cargo[m.commodity]=6;assert.equal(completeMissionsAtDock(save,'vesper').length,0,'bought cargo cannot clear a claim');
 session.recordClaimMining(m.claimNodeId,6);const before=save.player.credits;assert.equal(completeMissionsAtDock(save,'vesper').length,1);assert.equal(save.player.credits-before,3000);
 assert.equal(completeMissionsAtDock(save,'vesper').length,0,'no duplicate settlement');
});
test('PDC switching moves the real mining drones to cargo without deleting them or opening another bay',()=>{
 const {save,quest,session}=tutorialFixture('fit-pdc');save.player.dockedAt='vesper';session.ensureTutorialEquipment();session.ensureTutorialEquipment();
 const fit=loadoutFor(save.player),bay=fit.droneBays[0],miners=[...bay.unitIds];assert.ok(miners.filter(Boolean).length>0);
 const gift=Object.values(save.player.droneFleet.unitsById).filter(u=>u.type==='pdc').length;assert.equal(gift,1);
 assert.ok(session.setDroneBayMode(bay.bayId,'pdc').ok);assert.equal(quest.stepId,'survey-graveyard');
 assert.equal(loadoutFor(save.player).droneBays.length,1);assert.ok(miners.filter(Boolean).every(id=>save.player.droneFleet.lockerIds.includes(id)));assert.equal(Object.values(save.player.droneFleet.unitsById).filter(u=>u.type==='pdc').length,gift);
});
test('one coordinated mining intercept happens during the return drive, followed by a real standoff',()=>{
 const {save,quest,session}=tutorialFixture('return-mining');const briefings=[];session.playTutorialBriefing=id=>briefings.push(id);save.player.dockedAt=undefined;save.player.navTargetId='vesper';session.autopilot=true;session.hyperdriveFx='active';session.disengageHyperdrive=()=>{session.autopilot=false;};
 session.updateTutorialCampaignRuntime();assert.equal(quest.stepId,'raider-standoff');assert.equal(session.autopilot,false);const enemy=session.ships.find(s=>s.tutorialEnemy);assert.ok(enemy.holdFire);assert.equal(enemy.hullId,'scrapper');
 save.world.time=7;session.updateTutorialCampaignRuntime();assert.equal(quest.stepId,'raider-standoff');save.world.time=9;session.updateTutorialCampaignRuntime();assert.equal(quest.stepId,'defeat-raider');assert.equal(enemy.holdFire,false);assert.equal(enemy.pursuitHoldFire,false);assert.deepEqual(briefings,['combat']);
});
test('shooting the standoff pirate early does not strand the story',()=>{const {session,quest}=tutorialFixture('raider-standoff');session.handleTutorialEvent('ship-defeated',{tutorialEncounter:'mining',tutorialIndex:0});assert.equal(quest.stepId,'land-mining');});
test('encounter casualties persist and only surviving enemies return after reload',()=>{
 const {save,quest,session}=tutorialFixture('black-box-fight');save.player.dockedAt=undefined;session.ensureTutorialEnemy();assert.equal(session.ships.filter(s=>s.tutorialEnemy).length,4);
 session.ships.find(s=>s.tutorialIndex===0).hull=0;session.handleTutorialEvent('ship-defeated',{tutorialEncounter:'black-box',tutorialIndex:0});
 const restored=tutorialFixture('black-box-fight',hydrateSave(JSON.parse(JSON.stringify(save))));restored.session.ensureTutorialEnemy();assert.equal(restored.session.ships.filter(s=>s.tutorialEnemy).length,3);
 for(const enemy of restored.session.ships.filter(s=>s.tutorialEnemy)){enemy.hull=0;restored.session.handleTutorialEvent('ship-defeated',{tutorialEncounter:'black-box',tutorialIndex:enemy.tutorialIndex});}
 restored.session.updateTutorialCampaignRuntime();assert.equal(restored.quest.stepId,'deliver-black-box');assert.equal(quest.stepId,'black-box-fight');
});

test('both protected companions retain their disabled state after save hydration',()=>{
 const {save,session}=tutorialFixture('black-box-fight');save.player.dockedAt=undefined;save.quests[0].flags.paulInvited=true;session.ensureTutorialCompanion();
 for(const companion of session.ships.filter(s=>s.tutorialCompanion))session.damageShip(companion,100000,'pirate',companion.position);
 const loaded=tutorialFixture('black-box-fight',hydrateSave(JSON.parse(JSON.stringify(save))));loaded.session.ensureTutorialCompanion();assert.equal(loaded.session.ships.filter(s=>s.tutorialCompanion).length,2);
 for(const companion of loaded.session.ships){assert.equal(companion.hull,1);assert.equal(companion.poweredDown,true);}
});
test('graveyard encounters stay at the graveyard after an off-route death or repair stop',()=>{
 const {save,session,quest}=tutorialFixture('rescue-paul');save.player.dockedAt=undefined;session.activeInstanceId='helix';session.ensureTutorialEnemy();assert.equal(session.ships.length,0);
 session.activeInstanceId='mourning-line';session.ensureTutorialEnemy();const origin=[...quest.flags['origin-rescue']];
 const loaded=tutorialFixture('rescue-paul',hydrateSave(JSON.parse(JSON.stringify(save))));loaded.save.player.position=origin.map(v=>v+600);loaded.session.ensureTutorialEnemy();assert.deepEqual(loaded.quest.flags['origin-rescue'],origin);
});

test('new story fighters use the shared hull flight and actual fitted weapons, rather than legacy tutorial guns',async()=>{
 const {GameSession}=await import('../../src/game/game.js'),T=await import('../../vendor/three.module.min.js');
 const {save,session,quest}=tutorialFixture('black-box-fight');save.player.dockedAt=undefined;quest.flags.paulInvited=true;session.ensureTutorialEnemy();
 for(const actor of session.ships){assert.equal(actor.campaignCombat,true);assert.equal(session.npcFlightStats(actor),actor.combatFit.stats);}
 const rin=session.ships.find(s=>s.storyPersonId==='rin');rin.position=[0,0,0];rin.velocity=[0,0,0];rin.rotation=[0,0,0,1];rin.combatWeaponIndex=0;rin.targetId='test-enemy';session.ships=[rin,{id:'test-enemy',position:[0,0,-200],velocity:[0,0,0],rotation:[0,0,0,1],hull:200,hostile:true,hullId:'scrapper',variant:'scrapper'}];
 session.fireNpcGun(rin,new T.Vector3(0,0,-1));assert.ok(session.projectiles.length>0);assert.equal(session.projectiles[0].damage,10.8);
});
