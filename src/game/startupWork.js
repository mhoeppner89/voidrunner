// Constructors and offline tools can build synchronously. The browser consumes
// the same operations in order, letting input and loading paints run between them.
export function finishStartupWork(work) {
    let step;
    do { step = work.next(); } while (!step.done);
    return step.value;
}

export const yieldStartup = () => new Promise(resolve => setTimeout(resolve, 0));

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
