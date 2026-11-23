import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {BOARDING_SECONDS,CAPTURE_BOUNTY_MULTIPLIER} from '../../src/game/game.js';

// A surrendered, powered-down prize beside the player, outside the tutorial's
// own surrender lesson.
const prize=(seed=7)=>{
 const f=tutorialFixture('defeat-raider');f.save.world.seed=seed;f.save.player.dockedAt=undefined;
 const enemy=f.session.ensureTutorialEnemy();Object.assign(enemy,{surrendered:true,poweredDown:true,fleeing:false,hostile:false,targetId:undefined});
 f.save.player.position.splice(0,3,enemy.position[0]+150,enemy.position[1],enemy.position[2]);
 const step=seconds=>{for(let i=0;i<Math.round(seconds*60);i++)f.session.updateBoarding(1/60);};
 return {...f,enemy,step};
};

test('boarding takes two seconds in range and pays 120% of the bounty, a kill pays 100%',()=>{
 assert.equal(BOARDING_SECONDS,2);assert.equal(CAPTURE_BOUNTY_MULTIPLIER,1.2);
 const a=prize(7),before=a.save.player.credits;a.step(1.9);assert.ok(!a.enemy.captured);
 a.step(.15);assert.equal(a.enemy.captured,true);assert.equal(a.save.player.credits-before,Math.round(a.enemy.bountyValue*1.2));
 const b=prize(8),start=b.save.player.credits;b.enemy.shield=0;b.session.damageShip(b.enemy,1e6,'player',b.enemy.position);
 assert.equal(b.enemy.hull,0);assert.equal(b.save.player.credits-start,b.enemy.bountyValue,'destroying the prize pays the plain bounty');
});

test('the locked prize boards first; nothing boards in Arena, docked or without a claim',()=>{
 const f=prize(9),other={...f.enemy,id:'other-prize',boardingProgress:0,position:[...f.save.player.position]};f.session.ships.push(other);
 f.save.player.currentTargetId=f.enemy.id;f.step(.5);
 assert.ok(f.enemy.boardingProgress>.2);assert.equal(other.boardingProgress,0,'one prize at a time, the locked one first');
 const arena=prize(10);arena.session.arena={};arena.step(3);assert.ok(!arena.enemy.captured);
 const docked=prize(11);docked.save.player.dockedAt='vesper';docked.step(3);assert.ok(!docked.enemy.captured);
 const free=prize(12);free.enemy.bountyValue=0;delete free.enemy.missionId;free.step(3);assert.ok(!free.enemy.captured,'a ship without a claim cannot be boarded');
});

test('a pilot who surrendered by running is disabled by the next hit and can then be boarded',()=>{
 const f=prize(13);Object.assign(f.enemy,{fleeing:true,poweredDown:false});
 f.step(3);assert.ok(!f.enemy.captured,'a running ship cannot be boarded');
 f.enemy.shield=f.enemy.maxShield;f.session.damageShip(f.enemy,1,'player',f.enemy.position);
 assert.equal(f.enemy.fleeing,false);assert.equal(f.enemy.poweredDown,true);
 f.step(2.05);assert.equal(f.enemy.captured,true);
});

test('missiles never launch at a locked boardable prize',()=>{
 const f=prize(14);let fired=0;f.session.fireMissile=()=>{fired++;};
 f.save.player.currentTargetId=f.enemy.id;f.session.handleActions({missile:true});
 assert.equal(fired,0);assert.equal(f.session.monitorStatus,'PRIZE · CLOSE IN TO BOARD');
 f.enemy.fleeing=true;f.session.miningMissileHeld=false;f.session.handleActions({missile:true});assert.equal(fired,1,'a running surrender is still a legal missile target');
});
