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
