import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const { ADVENTURE_DIALOGUES } = await import('../src/game/adventureDialogues.js');
const { GameUI } = await import('../src/game/ui.js');

function fixture(script,space=false) {
    globalThis.document ??= {activeElement:null};
    const calls=[];
    const ui=Object.create(GameUI.prototype);
    ui.root={querySelector:()=>({classList:{add(){},remove(){},contains(){return true;}}})};
    ui.renderAdventure=()=>{};ui.renderDock=()=>{};ui.dockLocation='helix';
    ui.actions={talkToNpc:(...args)=>calls.push(args)};
    ui.startAdventure({id:'mara-vek',name:'Mara Vek'},script,space);
    return {ui,calls};
}
test('every authored node has translated text and a path to completion',()=>{
    for(const script of Object.values(ADVENTURE_DIALOGUES)){
        assert.ok(script.nodes[script.start]);
        const finished=new Set();
        for(const [id,node] of Object.entries(script.nodes)){
            assert.ok(node.text.de && node.text.en);
            if(node.next) assert.ok(script.nodes[node.next],node.next);
            if(node.returnTo) assert.ok(script.nodes[node.returnTo].choices);
            for(const choice of node.choices??[]){assert.ok(choice.label.de && choice.label.en);if(choice.next)assert.ok(script.nodes[choice.next]);if(choice.complete)finished.add(id);}
        }
        let previous=-1;
        while(previous!==finished.size){previous=finished.size;for(const [id,node]of Object.entries(script.nodes))if(finished.has(node.next)||finished.has(node.returnTo)||(node.choices??[]).some(c=>finished.has(c.next)))finished.add(id);}
        assert.equal(finished.size,Object.keys(script.nodes).length);
    }
});
test('optional questions and early exit do not advance the encounter',()=>{
    const {ui,calls}=fixture(ADVENTURE_DIALOGUES.mara);
    ui.advanceAdventure(0);ui.advanceAdventure(0);ui.advanceAdventure(0);
    assert.equal(ui.adventure.nodeId,'memory');
    assert.deepEqual(ui.adventureNode().choices.map(c=>c.next),['rin','work']);assert.equal(calls.length,0);
    ui.closeAdventure();assert.equal(calls.length,0);
});
test('final acknowledgement records the encounter once',()=>{
    const {ui,calls}=fixture(ADVENTURE_DIALOGUES.mara);
    for(const index of [0,2,0,2])ui.advanceAdventure(index);
    assert.deepEqual(calls,[['mara-vek','greeting']]);
    ui.advanceAdventure(0);assert.equal(calls.length,1);
});
test('space dialogue holds the modal pause until the final reply',()=>{
    const {ui,calls}=fixture(ADVENTURE_DIALOGUES.flight,true);
    assert.equal(ui.isModalOpen,true);
    ui.advanceAdventure(0);ui.advanceAdventure(2);
    assert.equal(ui.isModalOpen,false);assert.equal(ui.storyDismissed,true);assert.equal(calls.length,0);
});
test('replaying an introduction cannot advance tutorial state',()=>{
    const {ui,calls}=fixture(ADVENTURE_DIALOGUES.mara);
    ui.adventure.script=undefined;ui.adventure.node={text:'Replay',choices:[{label:'Replay',replay:'mara'}]};
    ui.advanceAdventure(0);
    for(const index of [0,2,0,2])ui.advanceAdventure(index);
    assert.equal(calls.length,0);
});

test('urgent radio stays compact; longer stories wait for danger to pass',async()=>{
    const {GameSession}=await import('../src/game/game.js');
    const calls=[];
    const session=Object.create(GameSession.prototype);
    session.save={world:{time:20},player:{position:[0,0,0]}};
    session.ui={showStoryLine:(...args)=>calls.push(args),showPilotLine:()=>{}};
    session.hostilesVisibleNear=()=>true;
    session.playStoryLine('Rin','Incoming fire','ally',7000);
    assert.equal(calls[0][3],undefined);assert.equal(session.storyLineUntil,27);
    session.playStoryLine('Rin','Family news','ally',16000);
    assert.equal(calls.length,1);assert.equal(session.pendingStoryConversations.length,1);
    session.hostilesVisibleNear=()=>false;
    session.playStoryLine('Rin','Welcome aboard','ally',15000,'rin-first-flight');
    assert.equal(calls.at(-1)[3],'rin-first-flight');assert.equal(session.storyLineUntil,Infinity);
});

test('remaining questions retain the latest answer and completion stays available',()=>{
    const {ui,calls}=fixture(ADVENTURE_DIALOGUES.mara);
    for(const index of [0,2,0])ui.advanceAdventure(index);
    assert.equal(ui.adventure.nodeId,'food');
    ui.advanceAdventure(0);ui.advanceAdventure(0);
    assert.equal(ui.adventure.nodeId,'memory');
    assert.deepEqual(ui.adventureNode().choices.map(c=>c.next??'finish'),['rin','finish']);
    ui.advanceAdventure(0);
    assert.equal(ui.adventure.nodeId,'rin');
    assert.equal(ui.adventureNode().choices.length,1);
    ui.advanceAdventure(0);
    assert.deepEqual(calls,[['mara-vek','greeting']]);
});
test('generic answers expose remaining questions directly and acknowledge each once',()=>{
    const {ui,calls}=fixture(ADVENTURE_DIALOGUES.mara);
    ui.adventure.script=undefined;
    ui.dialogueTopics=()=>[{id:'local'},{id:'advice'}];
    ui.dialogueResponse=(_,topic)=>({text:'Answer: '+topic});
    ui.adventure.node={text:'Welcome',next:'@topics'};
    ui.advanceAdventure(0);
    assert.equal(ui.adventureNode().text,'Welcome');
    ui.advanceAdventure(0);
    assert.equal(ui.adventureNode().text,'Answer: local');
    assert.deepEqual(ui.adventureNode().choices.map(c=>c.topic??'finish'),['advice','finish']);
    ui.advanceAdventure(0);
    assert.equal(ui.adventureNode().text,'Answer: advice');
    ui.advanceAdventure(0);
    assert.deepEqual(calls,[['mara-vek','greeting'],['mara-vek','local'],['mara-vek','advice']]);
});

test('rendering answers and reviewing history never replays the topic introduction',()=>{
    const {ui}=fixture(ADVENTURE_DIALOGUES.mara);
    const panel={classList:{add(){},remove(){}},style:{},setAttribute(){},querySelector(){return null;}};
    ui.root={querySelector:()=>panel};ui.portraitImage=()=>'';
    ui.renderAdventure=GameUI.prototype.renderAdventure;
    ui.renderAdventure();
    for(const index of [0,0,0])ui.advanceAdventure(index);
    const entries=ui.adventure.transcript.slice();
    ui.adventure.history=true;ui.renderAdventure();
    ui.adventure.history=false;ui.renderAdventure();
    assert.deepEqual(ui.adventure.transcript,entries);
    assert.equal(entries.filter(e=>e.text===ADVENTURE_DIALOGUES.mara.nodes.keys.text.en || e.text===ADVENTURE_DIALOGUES.mara.nodes.keys.text.de).length,1);
    assert.ok(panel.innerHTML.includes('adventure-choices'));
    assert.equal(ui.adventure.nodeId,'memory');
});
