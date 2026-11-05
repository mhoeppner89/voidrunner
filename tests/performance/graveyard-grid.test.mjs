import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GameSession} from '../../src/game/game.js';

test('drifting graveyard pieces retain the same collision buckets as a full rebuild after passing decorative fragments and damaged salvage', () => {
    const s = Object.create(GameSession.prototype);
    s.save = {world:{time:0}, player:{systemId:'helios-verge'}};
    s.activeInstanceId = 'mourning-line';
    s.obstacleCellSize = 256;
    s.obstacleQueryStamp = 0;
    s.graveyard = [0, 1, 2].map(i => ({
        id:'piece'+i, kind:'girder', moving:i!==1, collidable:i!==0,
        position:[50*i,0,0], rotation:[0,0,0], scale:[3,6,12], halfExtents:[2,4,8],
    }));
    const node = {id:'salvage',position:[70,0,0],rotation:[0,0,0],radius:4,shape:2,remaining:4};
    s.wreckNodes = [node];
    s.ensureObstacleGrid();
    const find = id => [...s.obstacleGrid.values()].flat().find(o => o.id === id);
    const original = find('piece2'), fixed = find('piece1'), originalSalvage = find('salvage');
    assert.equal(find('piece0'), undefined);
    s.graveyard[2].position[0] = 270;
    s.graveyard[2].rotation[2] = 1.1;
    s.save.world.time += .5;
    s.ensureObstacleGrid();
    assert.equal(find('piece1'), fixed);
    assert.equal(find('piece2').x, 270);
    assert.equal(original.x, 100, 'a pilot holding the old snapshot still sees its original pose');
    function buckets(grid) {
        return new Map([...grid].map(([key, values]) => [key, values.map(v => [v.id, v.x, v.box.qw])]));
    }
    const updatedCenters = buckets(s.obstacleGrid), updatedSegments = buckets(s.obstacleSegmentGrid);
    s.obstacleGridBuiltAt = -Infinity;
    s.ensureObstacleGrid();
    assert.deepEqual(buckets(s.obstacleGrid), updatedCenters);
    assert.deepEqual(buckets(s.obstacleSegmentGrid), updatedSegments);
    node.salvageImpactLocal = [0,1,0];
    node.salvageDamaged = true;
    s.obstacleGridBuiltAt = -Infinity;
    s.ensureObstacleGrid();
    assert.notEqual(find('salvage').meshVerts, originalSalvage.meshVerts, 'a damaged wreck uses its new collision surface');
});
