import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GameUI,commsSenderLabel,callsignHandle} from '../../src/game/ui.js';

test('comms use short speaker labels without changing transcript names',()=>{
    assert.equal(commsSenderLabel('Rin Vek'),'Rin');
    assert.equal(commsSenderLabel('Mara Vek'),'Mara');
    assert.equal(commsSenderLabel('Paul'),'Paul');
    assert.equal(commsSenderLabel('CPV 103'),'CPV 103');
    assert.equal(commsSenderLabel('Pilot “Ash Moth”'),'Ash Moth');
    assert.equal(commsSenderLabel('Schattenfalke, Nachtschwärmer, Rotklinge'),'Schattenfal… +2');
    assert.equal(Array.from(commsSenderLabel('Unnecessarily long callsign')).length,12);
    assert.equal(callsignHandle('Rin Vek'),'Rin Vek');
});

function fixture(line,columns=30,rows=4){
    const timers=new Map();let next=0;
    globalThis.window={setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)};
    const text={textContent:'',clientWidth:180,get clientHeight(){return Math.min(this.scrollHeight,rows*14);},get scrollHeight(){return Math.ceil(this.textContent.length/columns)*14;},scrollWidth:180};
    const bar={classList:{contains:()=>true},querySelector:()=>text,dataset:{}};
    const ui=Object.create(GameUI.prototype);ui.el=()=>bar;ui.commsMessage={callsign:'Rin Vek',line,pinned:true};
    return{ui,text,bar,timers};
}
test('normal messages use their full text and no page timer',()=>{
    const f=fixture('The recorder is aboard. Take it to Mara.');f.ui.fitCommsMessage();
    assert.equal(f.text.textContent,'Rin: The recorder is aboard. Take it to Mara.');
    assert.equal(f.bar.dataset.page,'1/1');assert.equal(f.timers.size,0);
});
for(const line of ['Keep clear of the wreck. '.repeat(25),'A'.repeat(500)])test(`bounded pages retain every character (${line.includes(' ')?'sentences':'unbroken token'})`,()=>{
    const f=fixture(line,20,3);f.ui.fitCommsMessage();const pages=[];
    for(let i=0;i<100;i++){
        pages.push(f.text.textContent.slice('Rin: '.length));
        assert.ok(f.text.scrollHeight<=f.text.clientHeight);
        if(!f.timers.size)break;
        const[id,fn]=f.timers.entries().next().value;f.timers.delete(id);fn();
    }
    assert.equal(pages.join('').replace(/\s/g,''),line.replace(/\s/g,''));
    assert.ok(pages.length>1);
});
