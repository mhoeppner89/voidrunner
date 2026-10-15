import test from 'node:test';import assert from 'node:assert/strict';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {LOCATIONS} from '../../src/game/data.js';
import {equipmentInstallMount,inventoryMounts,mountItemId,normalizeEquipmentInventory,equipmentAction,createEquipmentRecord} from '../../src/game/equipmentInventory.js';
import {BASE_OUTFIT_ITEMS} from '../../src/game/outfitting.js';
import {renderEquipmentInventory} from '../../src/game/equipmentUi.js';

test('Vesper coaching waits for arrival and the 5,000 km boundary before asking the player to brake',()=>{
 const {session,save}=tutorialFixture('fly-vesper'),p=save.player,vesper=LOCATIONS.vesper;p.dockedAt=undefined;p.navTargetId=p.currentTargetId='vesper';p.rotation=[0,0,0,1];p.position=[vesper.position[0],vesper.position[1],vesper.position[2]+vesper.radius+70000];
 assert.match(session.tutorialFlightGuidance().text,/HYPERDRIVE/);session.autopilot=true;assert.match(session.tutorialFlightGuidance().text,/until hyperdrive drops/);
 save.world.time+=500;assert.match(session.tutorialFlightGuidance().text,/until hyperdrive drops/,'elapsed time cannot skip the current task');
 session.autopilot=false;p.position[2]=vesper.position[2]+vesper.radius+7000;p.throttle=1;assert.match(session.tutorialFlightGuidance().text,/afterburner until 5,000/);assert.doesNotMatch(session.tutorialFlightGuidance().text,/zero|slow down/);
 p.position[2]=vesper.position[2]+vesper.radius+4990;p.throttle=.5;p.velocity=[0,0,-30];assert.match(session.tutorialFlightGuidance().text,/thrust to zero/);
 p.throttle=0;p.velocity.fill(0);assert.match(session.tutorialFlightGuidance().text,/Landing starts automatically/);
});

test('afterburner and hiding instructions each expose only the next action',()=>{
 const {session,save,quest}=tutorialFixture('flight-checks');quest.flags['learned-thrust']=true;quest.flags['learned-steering']=true;save.player.throttle=.5;
 assert.doesNotMatch(session.tutorialFlightGuidance().text,/afterburner/);
 quest.stepId='fly-vesper';const v=LOCATIONS.vesper;save.player.dockedAt=undefined;save.player.navTargetId=save.player.currentTargetId='vesper';save.player.position=[v.position[0],v.position[1],v.position[2]+v.radius+7000];
 assert.match(session.tutorialFlightGuidance().text,/thrust to maximum/);save.player.throttle=1;assert.match(session.tutorialFlightGuidance().text,/afterburner until 5,000/);
 save.player.position[2]=v.position[2]+v.radius+5000;session.afterburning=true;assert.match(session.tutorialFlightGuidance().text,/Release the afterburner/);session.afterburning=false;assert.match(session.tutorialFlightGuidance().text,/thrust to zero/);
 quest.stepId='hide-patrol';save.player.transponder=true;const line=session.tutorialFlightGuidance();assert.match(line.text,/transponder OFF/);assert.doesNotMatch(line.text,/hangar|thrust down|hold fire/);
 save.player.transponder=false;assert.match(session.tutorialFlightGuidance().text,/carrier hangar/);
});

test('owned equipment gets a free compatible mount; a full fit requires an explicit replacement',()=>{
 const {save}=tutorialFixture(),p=save.player;normalizeEquipmentInventory(p);const reactor=BASE_OUTFIT_ITEMS['sustained-reactor'];const free=equipmentInstallMount(p,reactor);assert.equal(free.key,'utility');assert.equal(mountItemId(p.outfitting.loadouts[p.shipId],free),null);
 const fit=p.outfitting.loadouts[p.shipId];for(const slot of inventoryMounts(p.shipId).filter(s=>s.key==='utility'))fit.utility[slot.index]='shield-mk2';
 assert.equal(equipmentInstallMount(p,reactor),undefined);const explicit=inventoryMounts(p.shipId).find(s=>s.key==='utility');assert.equal(equipmentInstallMount(p,reactor,explicit.mount.id).mount.id,explicit.mount.id);
});

test('the gifted reactor can be installed directly from local storage without a carry step',()=>{
 const {save,session}=tutorialFixture('fit-upgrade'),p=save.player;p.dockedAt='vesper';normalizeEquipmentInventory(p);const gift=createEquipmentRecord('sustained-reactor',{location:{kind:'station',stationId:'vesper'}});p.inventory.items[gift.id]=gift;
 const ui={save,inventoryItemId:gift.id,inventoryTab:'storage'},markup=renderEquipmentInventory(ui);assert.match(markup,/data-inventory-action="install"/);assert.match(markup,/Install · Utility/);
 const mount=equipmentInstallMount(p,BASE_OUTFIT_ITEMS['sustained-reactor']),credits=p.credits;assert.ok(equipmentAction(p,'install',{id:gift.id,mountId:mount.mount.id}).ok);assert.equal(p.credits,credits);assert.equal(p.inventory.items[gift.id].location.kind,'installed');
});
