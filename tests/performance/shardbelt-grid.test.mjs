import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GameSession} from '../../src/game/game.js';
import {visitObstacleCells} from '../../src/game/obstacleQueries.js';

function exampleField() {
    const s = Object.create(GameSession.prototype);
    s.save = {world:{time:0},player:{systemId:'helios-verge'}};
    s.activeInstanceId = 'shardbelt';
    s.obstacleCellSize = 16;
    s.obstacleQueryStamp = 0;
    s.asteroidTerrainObstacles = [{id:'wall',x:0,y:0,z:0,radius:30,losRadius:30}];
    s.asteroids = [[0,false],[16,true],[17,true],[32,false]].map(([x,moving],i) => ({
        id:'rock'+i,position:[x,0,0],radius:8,scale:[1,1,1],rotation:[0,0,0],moving
    }));
    return s;
}

function compareBuckets(actual, expected) {
    assert.equal(actual.size, expected.size);
    for (const [key, bucket] of expected) {
        const attributes = o => [o.id, o.x, o.y, o.z, o.box?.qw];
        assert.deepEqual(actual.get(key)?.map(attributes), bucket.map(attributes));
    }
}

test('drift updates match a fresh grid across crossed cells, shared buckets and instance invalidation', () => {
    const fast = exampleField(), full = exampleField();
    fast.ensureObstacleGrid(); full.ensureObstacleGrid();
    const grid = fast.obstacleGrid;
    const original = [...grid.values()].flat().find(o => o.id === 'rock1');
    for (const x of [16.3, 17.9, 30, 32.5, -40, 0, 16]) {
        for (const s of [fast, full]) {
            s.save.world.time += .51;
            s.asteroids[1].position[0] = x;
            s.asteroids[1].rotation[1] = x/50;
            s.asteroids[2].position[0] = 31-x;
        }
        full.obstacleGridBuiltAt = -Infinity;
        fast.ensureObstacleGrid(); full.ensureObstacleGrid();
        assert.equal(fast.obstacleGrid, grid);
        compareBuckets(fast.obstacleGrid, full.obstacleGrid);
        compareBuckets(fast.obstacleSegmentGrid, full.obstacleSegmentGrid);
        const candidates = s => {
            const ids = [];
            s.forEachObstacleInBox(-50,-4,-4,90,4,4, o => ids.push(o.id));
            return ids;
        };
        assert.deepEqual(candidates(fast), candidates(full));
    }
    assert.equal(original.x, 16);
    assert.equal(original.box.qw, 1, 'an existing pilot plan retains its original pose');
    fast.renderer = {staticObstacleRevision:1};
    fast.ensureObstacleGrid();
    assert.notEqual(fast.obstacleGrid, grid);
});

test('a pushed hull can reach subsequent cells in the same ordered collision pass', () => {
    const s = exampleField();
    s.ensureObstacleGrid();
    const position = {x:0,y:0,z:0}, visited = [];
    visitObstacleCells(s.obstacleBoxIndex, -3,-3,-3,3,3,3, 150, obstacle => {
        visited.push(obstacle.id);
        if (obstacle.id === 'rock0') position.x = 32;
    }, undefined, position, 1);
    assert.ok(visited.includes('rock3'));
});
