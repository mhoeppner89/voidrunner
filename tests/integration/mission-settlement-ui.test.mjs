import test from 'node:test';
import assert from 'node:assert/strict';
import {GameUI} from '../../src/game/ui.js';
import {createNewSave,hydrateSave} from '../../src/game/save.js';
import {acceptMission,completeMissionsAtDock,discardMission} from '../../src/game/missions.js';

function contract(save,id='azure-delivery') {
    const m={id,kind:'delivery',title:'Azure delivery',origin:'helix',destination:'azure',issuer:'Freight desk',commodity:'food',quantity:3,reward:1000,deposit:100,deadline:99999,status:'offered',guild:'merchant',guildRep:5,faction:'concord'};
    save.world.offers.helix=[m];
    assert.equal(acceptMission(save,'helix',id).ok,true);
    return m;
}
function receipt(save){return GameUI.prototype.renderMissionSettlements.call({save});}

test('arrival receipt renders a completed delivery and pays it once',()=>{
    const save=createNewSave(714,{tutorial:false});contract(save);
    const credits=save.player.credits;
    completeMissionsAtDock(save,'azure');
    assert.equal(save.player.credits,credits+1100);
    assert.equal(save.activeMissions.length,0);assert.equal(save.player.sealedCargo.length,0);
    const html=receipt(save);
    assert.match(html,/mission-settlement-panel/);assert.match(html,/dismiss-mission-settlements/);
    assert.doesNotMatch(html,/RECOMMENDED/);assert.doesNotMatch(html,/NaN|undefined/);
    completeMissionsAtDock(save,'azure');assert.equal(save.player.credits,credits+1100);
    assert.equal(save.world.missionSettlements.length,1);
    assert.equal(receipt(hydrateSave(JSON.parse(JSON.stringify(save)))),html);
});
test('discarded and mixed settlement receipts render without a live mission',()=>{
    const save=createNewSave(714,{tutorial:false});contract(save,'done');completeMissionsAtDock(save,'azure');
    contract(save,'discarded');assert.equal(discardMission(save,'discarded').ok,true);
    assert.equal(save.activeMissions.length,0);const html=receipt(save);
    assert.equal((html.match(/<article class=/g)||[]).length,2);
    assert.match(html,/is-failed/);assert.match(html,/dismiss-mission-settlements/);
    save.world.missionSettlements=[];assert.equal(receipt(save),'');
});
