// Render-only work reduction. Explicit world-space queries still use Three's
// updateWorldMatrix(), including for hidden objects; gameplay is unaffected.
const guardedRoots = new WeakSet();
const yieldRenderSetup = () => globalThis.scheduler?.yield?.() ?? new Promise(resolve => setTimeout(resolve, 0));

// Static local transforms need no recomposition. World matrices still update
// normally if a parent moves, and explicit world-space queries keep working.
export function freezeStaticTransforms(root, dynamic = new Set()) {
    root.traverse(object => {
        if (dynamic.has(object)) return;
        if (object.matrixAutoUpdate) object.updateMatrix();
        object.matrixAutoUpdate = false;
    });
    return root;
}

// A hidden warmup draw queues GPU work; it is not necessarily finished when
// render() returns. Wait without blocking input/animation, behind the loading
// cover, instead of paying that queue at the next visible buffer upload.
export async function waitForRenderWork(renderer,{timeoutMs=8000,shouldCancel=()=>false}={}) {
    const gl=renderer.getContext?.();
    if(!gl?.fenceSync||!gl.clientWaitSync)return true;
    if(shouldCancel())return false;
    const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
    if(!sync)return false;
    try{
        gl.flush();const deadline=performance.now()+timeoutMs;
        while(!shouldCancel()){
            const status=gl.clientWaitSync(sync,0,0);
            if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)return true;
            if(status===gl.WAIT_FAILED||performance.now()>=deadline)return false;
            await new Promise(resolve=>setTimeout(resolve,10));
        }
        return false;
    }finally{gl.deleteSync(sync);}
}

export function warmRenderBuffers(renderer,scene,camera,target,roots=[scene]) {
    if(!renderer.render)return;
    const previous=renderer.getRenderTarget(),shadows=renderer.shadowMap.enabled,culled=[];
    try{
        for(const root of roots)root.traverse(object=>{if(object.isMesh||object.isPoints||object.isSprite||object.isLine){culled.push([object,object.frustumCulled]);object.frustumCulled=false;}});
        renderer.shadowMap.enabled=false;renderer.setRenderTarget(target);renderer.render(scene,camera);
    }finally{
        renderer.setRenderTarget(previous);renderer.shadowMap.enabled=shadows;
        for(const [object,value]of culled)object.frustumCulled=value;
    }
}

// Driver diagnostic queries synchronize with the GPU on first use. Keep
// those opt-in while playing; browser QA can turn them back on explicitly.
export function configureShaderDiagnostics(renderer) {
    renderer.debug.checkShaderErrors = new URLSearchParams(globalThis.location?.search ?? '').has('debug-shaders');
}

// Prepare the exact render-target/lighting variant before its animation clock
// starts. Restore the target before awaiting the driver, so cancellation or a
// concurrently visible view cannot inherit a temporary framebuffer.
export async function prepareRenderScene(renderer, scene, camera, target, {timeoutMs = 2500, shouldCancel = () => false, lightingScene = scene} = {}) {
    if (shouldCancel()) return false;
    const textures = new Set();
    scene.traverse(object => {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (!material) continue;
            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
    });
    let uploadDeadline = performance.now() + 3;
    for (const texture of textures) {
        if (shouldCancel()) return false;
        renderer.initTexture?.(texture);
        if (performance.now() >= uploadDeadline) {
            await yieldRenderSetup();
            uploadDeadline = performance.now() + 3;
        }
    }
    if (shouldCancel()) return false;
    const previous = renderer.getRenderTarget();
    let programs;
    try {
        renderer.setRenderTarget(target);
        const materials = renderer.compile(scene, camera, lightingScene);
        // Other streamed scenes can be compiling at the same time. Waiting
        // for every program in the renderer makes an unrelated arrival hold
        // up this one, and getUniforms() can synchronize with the driver.
        // Include every variant of the materials just compiled (a material
        // may have several geometry/lighting programs), while retaining the
        // old fallback for renderers without Three's material properties.
        if (materials instanceof Set && renderer.properties?.get) {
            const relevant = new Set();
            let complete = true;
            for (const material of materials) {
                const state = renderer.properties.get(material);
                if (state?.programs instanceof Map) for (const program of state.programs.values()) relevant.add(program);
                else if (state?.currentProgram) relevant.add(state.currentProgram);
                else { complete = false; break; }
            }
            programs = complete ? [...relevant] : [...(renderer.info?.programs ?? [])];
        } else programs = [...(renderer.info?.programs ?? [])];
    } finally { renderer.setRenderTarget(previous); }
    const deadline = performance.now() + timeoutMs;
    // Without KHR_parallel_shader_compile, Three reports programs as ready
    // immediately even while the driver is still linking them. Querying their
    // uniforms then blocks the main thread. A GPU fence lets that work finish
    // asynchronously before the first query, while preserving cancellation.
    if (renderer.extensions?.has?.('KHR_parallel_shader_compile') === false) {
        const ready = await waitForRenderWork(renderer, {timeoutMs: Math.max(0, deadline - performance.now()), shouldCancel});
        if (!ready || shouldCancel()) return false;
    }
    // Poll program readiness ourselves. Three's compileAsync keeps polling
    // disposed material properties after cancellation or a context reset.
    while (!shouldCancel()) {
        if (programs.every(program => !program.isReady || program.isReady())) {
            let uniformDeadline = performance.now() + 3;
            for (const program of programs) {
                if (shouldCancel()) return false;
                program.getUniforms?.();
                if (performance.now() >= uniformDeadline) {
                    await yieldRenderSetup();
                    uniformDeadline = performance.now() + 3;
                }
            }
            return true;
        }
        if (performance.now() >= deadline) return false;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    return false;
}

export function skipHiddenWorldMatrices(root) {
    if (guardedRoots.has(root)) return;
    guardedRoots.add(root);
    const update = root.updateMatrixWorld;
    root.updateMatrixWorld = function (force) {
        if (!this.visible) {
            // A parent can move while this branch is asleep. Force a complete
            // refresh when it returns, even when its local matrix is frozen.
            this.matrixWorldNeedsUpdate = true;
            return;
        }
        update.call(this, force);
    };
}

// One upload span per attribute and draw, instead of many tiny bufferSubData
// commands for interleaved static/moving instances. Include pending spans: a
// hidden mesh or lost context may not have consumed the previous frame yet.
export function markAttributeSpan(attribute, start, end) {
    if (!(end > start)) return;
    for (const range of attribute.updateRanges) {
        start = Math.min(start, range.start);
        end = Math.max(end, range.start + range.count);
    }
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(start, end - start);
    attribute.needsUpdate = true;
}
