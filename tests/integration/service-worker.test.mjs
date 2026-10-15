import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../../sw.js',import.meta.url),'utf8');
function workerFixture(scope='https://example.test/voidrunner/') {
 const handlers=new Map(),stores=new Map(),requests=[];
 let online=false,contentType='image/webp';
 const key=input=>new URL(typeof input==='string'?input:input.url,scope).href;
 const cacheFor=name=>{
  if(!stores.has(name))stores.set(name,new Map());
  const store=stores.get(name);
  return {match:async request=>store.get(key(request))?.clone(),put:async(request,response)=>store.set(key(request),response.clone())};
 };
 const self={location:new URL('sw.js',scope),clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>handlers.set(name,fn)};
 vm.runInNewContext(source,{self,URL,Response,Promise,caches:{open:async name=>cacheFor(name),keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name)},fetch:async request=>{
  requests.push(key(request));if(!online)throw Error('offline');
  return new Response('network asset',{headers:{'content-type':contentType}});
 }});
 const cacheName=source.match(/const CACHE = '([^']+)'/)[1];
 return {requests,cache:cacheFor(cacheName),online:value=>{online=value;},contentType:value=>{contentType=value;},async event(name){let task;handlers.get(name)({waitUntil:p=>{task=p;}});await task;},async fetch(path,mode='navigate'){
  let response;const tasks=[];handlers.get('fetch')({request:{url:key(path),method:'GET',mode},respondWith:p=>{response=p;},waitUntil:p=>tasks.push(p)});
  const result=await response;await Promise.all(tasks);return result;
 }};
}

test('offline fallback serves the shell only at actual game entries, including scoped deployment',async()=>{
 const w=workerFixture();await w.cache.put('./index.html',new Response('<main>cached game</main>',{headers:{'content-type':'text/html'}}));
 for(const entry of ['./','./index.html?revision=old','./game.html?revision=current'])assert.match(await(await w.fetch(entry)).text(),/cached game/);
 for(const path of ['./output/report/index.html','./output/report/','./other/game.html']){
  const response=await w.fetch(path);assert.equal(response.status,503);const html=await response.text();assert.match(html,/Page unavailable offline/);assert.doesNotMatch(html,/cached game/);
 }
});

test('an offline report uses its own cached HTML without substituting the game',async()=>{
 const w=workerFixture();await w.cache.put('./index.html',new Response('game'));await w.cache.put('./output/report/index.html',new Response('actual report'));
 assert.equal(await(await w.fetch('./output/report/index.html')).text(),'actual report');
});

test('a cached HTML error under an art URL is bypassed and repaired online',async()=>{
 const w=workerFixture(),url='./art/portraits/simplified/rin-vek-hd-v1.webp';await w.cache.put(url,new Response('<html>wrong fallback</html>',{headers:{'content-type':'text/html; charset=utf-8'}}));w.online(true);
 assert.equal(await(await w.fetch(url,'no-cors')).text(),'network asset');assert.equal(w.requests.length,1);
 assert.equal(await(await w.fetch(url,'no-cors')).text(),'network asset');assert.equal(w.requests.length,1,'valid artwork remains cached');
});

test('install saves the opening room, portraits and landed hull rather than only JavaScript',async()=>{
 const w=workerFixture();w.online(true);await w.event('install');w.online(false);
 for(const path of ['./art/locations/simplified/helix-hd-v1.webp','./art/locations/simplified/bar-helix-hd-v1.webp','./art/locations/simplified/market-helix-hd-v1.webp','./art/portraits/simplified/mara-vek-hd-v2.webp','./art/portraits/simplified/rin-vek-hd-v1.webp','./assets/remaster/landed-flat/wayfarer.webp']){
  await access(new URL('../../'+path.slice(2),import.meta.url));assert.equal(await(await w.fetch(path,'no-cors')).text(),'network asset',path);
 }
});

test('an HTML fallback cannot poison precached opening artwork during install',async()=>{
 const w=workerFixture();w.online(true);w.contentType('text/html');await w.event('install');
 assert.equal(await w.cache.match('./art/portraits/simplified/rin-vek-hd-v1.webp'),undefined);
 w.contentType('image/webp');assert.equal(await(await w.fetch('./art/portraits/simplified/rin-vek-hd-v1.webp','no-cors')).text(),'network asset');
});
