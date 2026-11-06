import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4212',out='output/onboarding-feedback';await mkdir(out,{recursive:true});
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2nj`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('#title-screen [data-ui-command="options"]').click();await page.locator('[data-settings-tab="display"]').click();await page.locator('[data-setting="reducedDamageEffects"]').check();await page.locator('[data-ui-command="close-options"]').click();
  await page.locator('#title-screen [data-ui-command="options"]').click();await page.locator('[data-settings-tab="display"]').click();assert.ok(await page.locator('[data-setting="reducedDamageEffects"]').isChecked(),'title preferences survive reopening');await page.locator('[data-ui-command="close-options"]').click();
  await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&!r.ui.concourseArrivalPending&&r.ui.concourseShip?.model&&document.querySelector('#loading-screen').classList.contains('is-hidden');});
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.hideStory();await r.ui.actions.startNew(false);});
  await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&!r.ui.concourseArrivalPending&&r.ui.concourseShip?.model&&document.querySelector('#loading-screen').classList.contains('is-hidden');});
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();if(!r.save.settings.reducedDamageEffects)throw Error('Title setting was not applied to the career');r.audio.setVolumes(0,0);r.ui.hideStory();r.ui.showOptions();});
  const widths=await page.evaluate(async()=>{await document.fonts.load('16px "Void VGA Text"');await document.fonts.load('16px "Void VGA"');const c=document.createElement('canvas').getContext('2d');c.font='16px "Void VGA Text"';const narrow=c.measureText('iiii').width,wide=c.measureText('mmmm').width;c.font='16px "Void VGA"';return{narrow,wide,monitorI:c.measureText('iiii').width,monitorM:c.measureText('mmmm').width};});
  assert.ok(widths.narrow<widths.wide,'dialogue face closes excess gaps');assert.equal(widths.monitorI,widths.monitorM,'cockpit face retains fixed widths');
  await page.locator('[data-settings-tab="controls"]').click();
  assert.ok(await page.locator('#settings-controls-pane [data-setting="tiltInvertPitch"]').isVisible());
  assert.ok(await page.locator('#settings-controls-pane [data-setting="touchScale"]').isVisible());
  assert.equal(await page.locator('#settings-flight-pane [data-setting="tiltInvertPitch"]').count(),0);
  await page.locator('[data-setting="tiltInvertPitch"]').check();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.tiltInvertPitch),true);
  await page.screenshot({path:`${out}/${name}-controls.png`});
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.hideOptions();r.ui.switchToTerminal('market');r.ui.openMarketPoint('equipment');});
  await page.locator('.equipment-inventory').waitFor();
  if(name!=='desktop')assert.equal(await page.locator('[data-inventory-tab]').isVisible(),false);
  await page.locator('[data-inventory-action="tab"][data-tab="shop"]').click();assert.equal(await page.locator('.equipment-inventory').getAttribute('data-inventory-view'),'shop');
  await page.locator('[data-inventory-action="tab"][data-tab="storage"]').click();assert.equal(await page.locator('.equipment-inventory').getAttribute('data-inventory-view'),'storage');
  await page.screenshot({path:`${out}/${name}-equipment.png`});
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime(),T=await import('/vendor/three.module.min.js');r.ui.switchToTerminal('concourse');await r.launch();if(r.save.player.dockedAt)throw Error('Launch was blocked');const p=r.save.player,nav=r.hyperdriveDestination(),away=new T.Vector3().fromArray(p.position).sub(new T.Vector3().fromArray(nav.position)).normalize();p.rotation.splice(0,4,...new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),away).toArray());r.toggleHyperdrive();if(r.autopilot)throw Error('Misaligned jump was not blocked');r.ui.updateHud(r.buildHudModel());});
  assert.ok(await page.locator('#hud').isVisible(),'the monitor must be visible in flight');
  const notice=page.locator('#screen-target-readout');assert.match(await notice.textContent(),/Richte das Schiff/);const noticeSize=await notice.evaluate(e=>({drive:e.classList.contains('is-hyperdrive-status'),scroll:e.scrollHeight,height:e.clientHeight,bottom:e.getBoundingClientRect().bottom,monitorBottom:e.closest('.cockpit-screen-target').getBoundingClientRect().bottom}));
  await page.screenshot({path:`${out}/${name}-hyperdrive.png`});assert.ok(noticeSize.drive&&noticeSize.scroll<=noticeSize.height+1&&noticeSize.bottom<=noticeSize.monitorBottom,JSON.stringify(noticeSize));
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime(),{LOCATIONS}=await import('/src/game/data.js');r.renderer.setSystem(LOCATIONS.vesper.systemId);await Promise.all(r.renderer.worldTextureLoads??[]);r.dockAt('vesper',true);});
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='entry');
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.skipAtmosphere());
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='landing');
  assert.ok(await page.locator('.concourse-landing-skip').isVisible());await page.screenshot({path:`${out}/${name}-landing.png`});
  await page.locator('.concourse-landing-skip').click();await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.concourseArrivalPending);
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.phase),'idle');
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();await r.launch();if(r.save.player.dockedAt)throw Error('Second launch was blocked');window.landingCalls=0;const v=r.ui.concourseShip,original=v.animate;v.animate=function(phase,...args){if(phase==='landing')landingCalls++;return original.call(this,phase,...args);};r.dockAt('vesper',true);});
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='entry');
  await page.locator('.planet-transit .planet-transit-skip').click();await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.concourseArrivalPending);
  assert.equal(await page.evaluate(()=>window.landingCalls),0,'skipping arrival also skips the landing pad animation');
  assert.deepEqual(errors,[]);console.log(name,'options, inventory, drive feedback and landing skip passed');
 }finally{await browser.close();}
}
