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
            // A skipped-prologue variant is part of the script: it must be written
            // in both languages and point at nodes that exist.
            const variant=node.noPrologue;
            if(variant?.text){assert.ok(variant.text.de&&variant.text.en,`${id}.noPrologue`);for(const field of ['next','returnTo'])if(variant[field])assert.ok(script.nodes[variant[field]],`${id}.noPrologue.${field}`);}
            for(const choice of [...(variant?.choices??[]),...((variant?.choices??[]).length?[]:(node.choices??[]))]){
                if(choice.noPrologueLabel)assert.ok(choice.noPrologueLabel.de&&choice.noPrologueLabel.en,`${id} · noPrologueLabel`);
                if(variant?.choices&&choice.next)assert.ok(script.nodes[choice.next],`${id} · noPrologue → ${choice.next}`);
            }
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

// An aborted prologue leaves the pilot standing in the Helix bar without ever
// having heard the family introduction. Mara and Rin must then offer that
// story as an ordinary question, not as a repetition, and Rin must not promise
// the Second Light escort the aborted prologue never flew.
// The Cairn confession explains Rin's rescue but used to stop there: the
// player learns why the carrier was lost and never what became of the mother
// whose loss the whole prologue mourns. "And afterwards?" must be askable.
test('the Cairn confession accounts for the pilot’s mother, not only the carrier',()=>{
    const cairn=ADVENTURE_DIALOGUES.cairn;
    const loss=cairn.nodes.loss;
    assert.ok(loss,'the confession must answer what happened after the rescue');
    assert.match(loss.text.en,/turned around again/i);
    assert.match(loss.text.de,/drehte wieder ab/i);
    assert.equal(loss.returnTo,'confession');
    assert.ok(Object.values(cairn.nodes).some(node=>(node.choices??[]).some(choice=>choice.next==='loss')),'the question must be offered');
});

// Rin leaves for Meridian alone in the departure scene, which plays after any
// of the three recorder endings. No ending may promise that she flies with the
// pilot instead, or the scene reads as ignoring the choice just made.
test('no recorder ending promises Rin’s company, so the departure fits every choice',()=>{
    const cairn=ADVENTURE_DIALOGUES.cairn;
    const promises=/fly with you|come with me|stay with you|gemeinsam weiter|komm mit/i;
    for(const [id,node] of Object.entries(cairn.nodes)){
        assert.doesNotMatch(node.text.en,promises,id);
        assert.doesNotMatch(node.text.de,promises,id);
        for(const choice of node.choices??[]){
            assert.doesNotMatch(choice.label.en,promises,`${id} · ${choice.label.en}`);
            assert.doesNotMatch(choice.label.de,promises,`${id} · ${choice.label.de}`);
        }
    }
    const departure=ADVENTURE_DIALOGUES.departure.nodes.leaving;
    assert.match(departure.text.en,/jumping ahead|ahead/i);
    assert.match(departure.text.de,/voraus/i);
});

// Rin jumps ahead at the prologue's departure scene. She used to keep standing
// in the Helix bar afterwards, in a campaign whose panel and whose aunt both
// say she has gone quiet out at Meridian.
test('Rin leaves the Helix bar once the prologue has her jump ahead',async()=>{
    globalThis.document??={activeElement:null};
    const {createNewSave}=await import('../src/game/save.js');
    const {getTutorialQuest,skipTutorialCampaign}=await import('../src/game/tutorialCampaign.js');
    const {setFlag,completeQuest}=await import('../src/game/quests.js');
    const ui=Object.create(GameUI.prototype);
    const barIds=()=>ui.barPeople('helix').map(person=>person.id);
    const present=()=>barIds().includes('rin-vek');
    const quest=()=>getTutorialQuest(ui.save);
    // Where the story puts her: at the bar for the whole prologue.
    ui.save=createNewSave(4242,{tutorial:true});
    assert.equal(present(),true,'she is at the bar while the prologue runs');
    // The departure scene sets the flag, and she is gone.
    ui.save=createNewSave(4243,{tutorial:true});
    setFlag(ui.save,quest().id,'rinDeparted',true);
    assert.equal(present(),false);
    assert.ok(barIds().includes('mara-vek'),'the rest of the port is untouched');
    assert.equal(ui.barPeople('vesper').some(person=>person.id==='rin-vek'),false,
        'a pilot who left does not appear at another port either');
    // The story position is enough on its own: the departure step, or a
    // finished prologue, keeps her away even if the flag did not survive.
    ui.save=createNewSave(4244,{tutorial:true});
    quest().stepId='galaxy-map';
    assert.equal(present(),false,'the departure step means she has gone');
    ui.save=createNewSave(4245,{tutorial:true});
    completeQuest(ui.save,quest().id,ui.save.world.time);
    assert.equal(present(),false,'a finished prologue leaves her at Meridian');
    // A skipped prologue never sent her anywhere: she is how that career hears
    // the family story at all.
    const skipped=createNewSave(4246,{tutorial:true});
    skipTutorialCampaign(skipped,skipped.world.time);
    ui.save=skipped;
    assert.equal(present(),true,'a skipped prologue keeps her where she always was');
});

// The mara and rin conversations double as the retelling a skipped prologue
// falls back on. Their prologue wording sends the pilot to a delivery run and
// promises a Second Light on the wing, neither of which exists in that career.
test('a skipped prologue is retold without the escort or the delivery run',async()=>{
    globalThis.document??={activeElement:null};
    const {createNewSave}=await import('../src/game/save.js');
    const {skipTutorialCampaign}=await import('../src/game/tutorialCampaign.js');
    const {dialogueText}=await import('../src/game/adventureDialogues.js');
    // Walk the conversation the way a player does: questions once asked stay
    // asked, which is what unlocks the gated ones. Everything reachable is
    // collected, so a promise cannot hide behind a prerequisite.
    const collect=(save,script)=>{
        const ui=Object.create(GameUI.prototype);
        ui.save=save;ui.dockLocation='helix';
        const state={person:{id:'rin-vek'},script,nodeId:script.start,asked:new Set(),noPrologue:ui.prologueUnplayed()};
        ui.adventure=state;
        const spoken=[],seen=new Set();
        const visit=(id)=>{            
            const key=`${id}|${[...state.asked].sort().join(',')}`;
            if(seen.has(key))return;
            seen.add(key);
            state.nodeId=id;
            const node=ui.adventureNode();
            spoken.push(dialogueText(node.text,'de'),dialogueText(node.text,'en'));
            for(const choice of node.choices??[]){
                spoken.push(dialogueText(choice.label,'de'),dialogueText(choice.label,'en'));
                if(choice.next&&script.nodes[choice.next]){
                    state.asked.add(choice.next);
                    visit(choice.next);
                    state.asked.delete(choice.next);
                }
            }
            // A node without choices advances on its own, exactly as the panel does.
            if(!node.choices?.length&&node.next&&script.nodes[node.next])visit(node.next);
            // Answering a question returns to the node that asked it; asking it
            // once is what makes the next question available there.
            for(const [id2,other] of Object.entries(script.nodes))
                if(other.returnTo===id){state.asked.add(id2);visit(id2);state.asked.delete(id2);}
        };
        visit(script.start);
        return spoken.join('\n');
    };
    // Sentences the prologue's escort and its two-crate run are made of. A
    // career that never flew it must not hear a single one of them.
    const prologueOnly=[
        'Rin kennt die Strecke und fliegt mit','Rin knows the route and will fly with you',
        'und bleibe an deinem Flügel','and stay on your wing',
        'Zwei Proteinpakete an der WARENBÖRSE kaufen','Buy two Protein Packs at the commodity market',
        'Ich besorge die Ware','I will get the cargo',
        'Wenn die Ware an Bord ist, gehen wir kurz die Ausrüstung durch','Once the cargo is aboard, we will check your equipment',
    ];
    const skipped=createNewSave(3110,{tutorial:true});
    skipTutorialCampaign(skipped,skipped.world.time);
    for(const script of [ADVENTURE_DIALOGUES.mara,ADVENTURE_DIALOGUES.rin]){
        const retold=collect(skipped,script);
        for(const line of prologueOnly) assert.ok(!retold.includes(line),line);
        assert.match(retold,/Wayfarer/,'the retelling is still the family story');
    }
    assert.match(collect(skipped,ADVENTURE_DIALOGUES.mara),/Shardbelt/,'and says what to do instead');
    // The prologue's own copy is untouched for a career that flew it.
    const lived=createNewSave(3111,{tutorial:true});
    const heard=[collect(lived,ADVENTURE_DIALOGUES.mara),collect(lived,ADVENTURE_DIALOGUES.rin)].join('\n');
    for(const line of prologueOnly) assert.ok(heard.includes(line),line);
});

// A contact can offer a different set of barks in a career that never played
// the prologue, but the slots must stay aligned: greeting, advice, local news.
test('bar line variants keep one line per topic slot',async()=>{
    const {LOCATIONS}=await import('../src/game/data.js');
    for(const [locationId,location] of Object.entries(LOCATIONS))
        for(const person of location.people??[])
            if(person.linesNoPrologue)
                assert.equal(person.linesNoPrologue.length,person.lines.length,`${locationId}/${person.id}`);
});

// A second, contradictory telling of the prologue survived in the German
// catalog long after the script was rewritten: it said the evacuation ledger
// was forged and that Rin would fly the crossing alongside the pilot. Nothing
// reads those keys any more, but leaving them invites a writer to reuse them.
test('the superseded prologue draft stays out of the German catalog',async()=>{
    const {DE_CATALOG}=await import('../src/game/i18n-de.js');
    const stale=[
        'Our mother broke formation to pull me out. The carrier behind us never reached the gate. They changed the evacuation ledger. I let Mara believe it because I was afraid she would blame me.',
        'There you are. Easy on the throttle. Keep the Second Light on your starboard and take us to Vesper.',
        'Rin is waiting at the berth. Hear their account, then decide where your trust lies.',
        'I will go ahead to Meridian Prime. The original evacuation ledger is there. Find me before Concord does.',
        'Mara deserves the truth. Meridian first; then we tell her together.',
        'Those Protein Packs are the Vesper delivery. Keep them aboard for launch.',
        'You carry the evidence and decide what happens after Meridian.',
        'The original evacuation ledger is somewhere on Meridian Prime. Rin has gone ahead.',
    ];
    for(const key of stale) assert.equal(DE_CATALOG[key],undefined,key);
});

test('an aborted prologue offers the family story instead of repeating it',async()=>{
    globalThis.document ??={activeElement:null};
    const {createNewSave}=await import('../src/game/save.js');
    const {skipTutorialCampaign}=await import('../src/game/tutorialCampaign.js');
    const {LOCATIONS}=await import('../src/game/data.js');
    const {setLanguage}=await import('../src/game/i18n.js');
    setLanguage('en');
    const save=createNewSave(90210,{tutorial:true});
    skipTutorialCampaign(save,save.world.time);
    save.player.dockedAt='helix';
    const ui=Object.create(GameUI.prototype);
    ui.save=save;ui.dockLocation='helix';
    ui.root={querySelector:()=>({classList:{add(){},remove(){},contains(){return true;}}})};
    ui.renderAdventure=()=>{};ui.renderDock=()=>{};
    const mara=LOCATIONS.helix.people.find(person=>person.id==='mara-vek');
    const rin=LOCATIONS.helix.people.find(person=>person.id==='rin-vek');
    ui.startAdventure(mara,undefined);
    const offered=ui.adventure.node.choices.map(choice=>choice.label);
    assert.equal(offered.length,2);
    assert.doesNotMatch(offered[1],/again/i,'a pilot who skipped the prologue never heard this');
    assert.match(offered[1],/Wayfarer/);
    assert.doesNotMatch(ui.dialogueResponse(rin,'greeting').text,/stay close|on your wing/i);
    // The barks on the same screen must not offer the shared flight either.
    assert.doesNotMatch(ui.dialogueResponse(rin,'advice').text,/firing line/i);
    assert.doesNotMatch(ui.dialogueResponse(rin,'local').text,/delivery run/i);
    assert.match(ui.dialogueResponse(rin,'local').text,/key/i);
    // A pilot who did live the prologue keeps the replay wording.
    save.quests.find(quest=>quest.id==='the-spare-key').flags.metMara=true;
    ui.adventure=undefined;
    ui.startAdventure(mara,undefined);
    assert.match(ui.adventure.node.choices[1].label,/again/i);
});
