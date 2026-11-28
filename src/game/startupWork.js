// Constructors and offline tools can build synchronously. The browser consumes
// the same operations in order, letting input and loading paints run between them.
export function finishStartupWork(work) {
    let step;
    do { step = work.next(); } while (!step.done);
    return step.value;
}

export const yieldStartup = () => new Promise(resolve => {
    // WebKit clamps timers in hidden windows. Startup can need hundreds of
    // short yields, so timer clamping can stall a round that is already open.
    if (typeof document !== 'undefined' && document.hidden && typeof MessageChannel === 'function') {
        const { port1, port2 } = new MessageChannel();
        port1.onmessage = () => {
            port1.close();
            port2.close();
            resolve();
        };
        port2.postMessage(null);
    } else setTimeout(resolve, 0);
});

export async function runStartupWork(work) {
    let deadline = performance.now() + 10;
    while (true) {
        const step = work.next();
        if (step.done) return step.value;
        if (performance.now() >= deadline) {
            await yieldStartup();
            deadline = performance.now() + 10;
        }
    }
}
