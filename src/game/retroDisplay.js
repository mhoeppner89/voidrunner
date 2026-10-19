// Pixel geometry and nearest-neighbour presentation, without colour grading.
// Instruments retain their native CSS-pixel raster for readable small text.
export function pixelRenderSize(width,height,desiredWidth){
    const scale=Math.max(1,Math.ceil(width/Math.max(1,desiredWidth)));
    return {width:Math.ceil(width/scale),height:Math.ceil(height/scale),scale};
}
export function monitorRasterRatio(){return 1;}
export function installRetroDisplay(root){
    if(!root?.style)return;
    root.style.removeProperty('filter');
    root.dataset.pixelFinish='native';
}
