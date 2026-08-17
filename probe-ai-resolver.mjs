// Resolver hook for probe-ai.mjs: the browser resolves the bare 'three'
// specifier through the import map in index.html; plain node has no import map,
// so map it to the vendored build here. Registered via node:module register()
// before any app modules are imported.
export const resolve = async (specifier, context, nextResolve) => {
    if (specifier === 'three') {
        return { url: new URL('./vendor/three.module.min.js', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
};
