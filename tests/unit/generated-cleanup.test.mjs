import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
import {cleanGenerated} from '../../tools/maintenance/clean-generated.mjs';
const execFile=promisify(callback);
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'vr-cleanup-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await execFile('git',['init','--quiet'],{cwd:root});
 for(const name of ['src','output/dialogue-review','dist','tools/assets/__pycache__'])await mkdir(join(root,name),{recursive:true});
 const data={'package.json':'{"name":"voidrunner"}','src/main.js':'live source','output/desktop-flight.png':'capture','output/dialogue-review/edited.txt':'user dialogue','output/draft.blend':'native draft','dist/game.html':'build','tools/assets/__pycache__/builder.pyc':'cache'};
 for(const [name,value]of Object.entries(data))await writeFile(join(root,name),value);
 return root;
}
test('generated cleanup is a dry run by default and preserves authored files in an archive before removal',async t=>{
 const root=await fixture(t),dry=await cleanGenerated(root);assert.equal(dry.applied,false);await access(join(root,'output/desktop-flight.png'));
 await assert.rejects(access(join(root,'.workbench')));
 const result=await cleanGenerated(root,{apply:true});assert.equal(result.applied,true);
 for(const path of ['output','dist','tools/assets/__pycache__'])await assert.rejects(access(join(root,path)));
 assert.equal(await readFile(join(root,'src/main.js'),'utf8'),'live source');
 const restored=join(root,'restored');await mkdir(restored);await execFile('tar',['-xzf',join(root,result.archive),'-C',restored]);
 assert.equal(await readFile(join(restored,'output/dialogue-review/edited.txt'),'utf8'),'user dialogue');
 assert.equal(await readFile(join(restored,'output/draft.blend'),'utf8'),'native draft');
 await assert.rejects(access(join(restored,'output/desktop-flight.png')));
});
test('generated cleanup refuses tracked outputs',async t=>{
 const root=await fixture(t);await execFile('git',['add','output/dialogue-review/edited.txt'],{cwd:root});
 await assert.rejects(cleanGenerated(root,{apply:true}),/tracked files/);await access(join(root,'output/desktop-flight.png'));
});
test('generated cleanup refuses linked roots and linked archive destinations without deleting data',async t=>{
 const root=await fixture(t);await rm(join(root,'dist'),{recursive:true});await symlink(join(root,'src'),join(root,'dist'));
 await assert.rejects(cleanGenerated(root,{apply:true}),/linked generated root/);await access(join(root,'src/main.js'));
 await rm(join(root,'dist'));await symlink(join(root,'src'),join(root,'.workbench'));
 await assert.rejects(cleanGenerated(root,{apply:true}),/linked archive destination/);await access(join(root,'output/dialogue-review/edited.txt'));
});
test('generated cleanup never follows nested output links into source files',async t=>{
 const root=await fixture(t);await symlink(join(root,'src'),join(root,'output/source-link'));
 const result=await cleanGenerated(root,{apply:true});await access(join(root,'src/main.js'));
 const listing=(await execFile('tar',['-tzf',join(root,result.archive)])).stdout;
 assert.ok(listing.includes('output/source-link'));assert.ok(!listing.includes('source-link/main.js'));
});
