import {COCKPITS} from '/src/game/cockpitDefinitions.js';
const selector=document.querySelector('#hull');
selector.replaceChildren(...Object.values(COCKPITS).map(c=>new Option(`${c.name} · ${c.status==='approved'?'approved':c.shell?'artwork review':'unpainted layout'}`,c.id)));
const embedded=new URLSearchParams(location.search).has('embedded');
try{
    if(embedded){document.body.classList.add('embedded');await import('./flight.js');}
    else await import('./host.js');
}catch(error){
    window.reviewError=error.message;
    document.querySelector('#portrait-hint').hidden=false;
    document.querySelector('#portrait-hint').textContent=`Cockpit review could not load: ${error.message}. Reload to retry.`;
    if(embedded)parent.postMessage({type:'cockpit-error',message:error.message},location.origin);
    console.error(error);
}
