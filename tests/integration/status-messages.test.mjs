import test from 'node:test';
import assert from 'node:assert/strict';
import {GameUI} from '../../src/game/ui.js';

test('notifications of every severity stay in the cockpit event stream',()=>{
 const ui=Object.assign(Object.create(GameUI.prototype),{recentEvents:[],sensorLog:[],save:{world:{time:10}}});
 // No DOM is supplied: notification delivery must never create a floating card.
 for(const tone of ['info','success','warning','danger']){
  ui.showToast(`message ${tone}`,tone,5000);
  assert.equal(ui.currentEntry(ui.recentEvents).message,`message ${tone}`);
  assert.equal(ui.recentEvents.at(-1).tone,tone);
 }
 assert.equal(ui.recentEvents.length,4);
 ui.clearStatusMessages();assert.equal(ui.recentEvents.length,0);assert.equal(ui.sensorLog.length,0);
});
