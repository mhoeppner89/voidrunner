// On macOS, switching browser engines in one long-lived Playwright process can
// stall after Chromium closes. Give each engine its own short-lived process.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export async function isolateBrowserProfiles(entry, defaults=['desktop','iphone']) {
 const profiles=(process.env.VR_PROFILES??defaults.join(',')).split(',');
 if(profiles.length<2)return;
 for(const profile of profiles){
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(entry)],{cwd:process.cwd(),env:{...process.env,VR_PROFILES:profile},stdio:'inherit'});child.once('error',reject);child.once('exit',code=>resolve(code??1));});
  if(code!==0)process.exit(code);
 }
 process.exit(0);
}

// Repeated cold-start/teardown cycles can also stall Chromium on macOS after
// several hulls. Each hull gets a fresh Playwright process, just like engines.
export async function isolateBrowserHulls(entry) {
 const hulls=(process.env.VR_COCKPIT_HULLS??'').split(',').filter(Boolean);
 if(hulls.length<2)return;
 for(const hull of hulls){
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(entry)],{cwd:process.cwd(),env:{...process.env,VR_COCKPIT_HULLS:hull,VR_COCKPIT_HULL:hull},stdio:'inherit'});child.once('error',reject);child.once('exit',code=>resolve(code??1));});
  if(code!==0)process.exit(code);
 }
 process.exit(0);
}
