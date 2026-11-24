import {createServer} from 'node:http';

// Disconnect a test-only origin instead of toggling the browser-wide offline
// flag: WebKit's automation backend can fail navigation internally with that
// flag before its service worker gets to handle the request.
export async function createOfflineTestOrigin(base){
 let stallGameModule=false;const stalled=new Set();
 const server=createServer(async(req,res)=>{
  if(stallGameModule&&new URL(req.url,'http://test').pathname==='/src/game/game.js'){stalled.add(res);res.once('close',()=>stalled.delete(res));return;}
  try{const response=await fetch(base+req.url);res.writeHead(response.status,{'content-type':response.headers.get('content-type')??'application/octet-stream'});res.end(Buffer.from(await response.arrayBuffer()));}
  catch{if(!res.destroyed){res.writeHead(502);res.end('Preview upstream unavailable');}}
 });
 const listen=port=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
 await listen(0);const port=server.address().port;
 const disconnect=async()=>{if(!server.listening)return;const stopped=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await stopped;};
 return {url:`http://127.0.0.1:${port}`,disconnect,reconnect:()=>listen(port),stallGameModule(value){stallGameModule=value;if(!value)for(const res of stalled)res.destroy();}};
}
