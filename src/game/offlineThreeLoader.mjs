export async function resolve(specifier, context, next) {
    if (specifier === 'three') {
        const url = new URL('../../vendor/three.module.min.js', import.meta.url);
        return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
}
