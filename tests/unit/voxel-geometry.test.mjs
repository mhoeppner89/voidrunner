import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelGrid,paletteForFaction} from '../../src/game/voxelModels.js';

test('voxel surfaces omit enclosed cells and shared faces without changing visible paint',()=>{
 const palette=paletteForFaction('concord'),materials=new Set(['hull','dark']);
 const solid=new VoxelGrid(),paintedInterior=new VoxelGrid();
 for(const grid of [solid,paintedInterior])grid.fillBox(-1,1,-1,1,-1,1,'hull');
 paintedInterior.set(0,0,0,'dark');
 const a=solid.buildGeometry(1,palette,materials),b=paintedInterior.buildGeometry(1,palette,materials);
 assert.equal(a.index.count,54*6);assert.equal(a.attributes.position.count,54*4);
 for(const name of ['position','normal','color'])assert.deepEqual(b.attributes[name].array,a.attributes[name].array);
 assert.deepEqual(b.index.array,a.index.array);
 const pair=new VoxelGrid();pair.set(0,0,0,'hull');pair.set(1,0,0,'dark');
 const joined=pair.buildGeometry(1,palette,materials);assert.equal(joined.index.count,10*6);
 assert.ok(new Set(joined.attributes.color.array).size>3,'both exposed materials remain coloured');
 a.dispose();b.dispose();joined.dispose();
});
