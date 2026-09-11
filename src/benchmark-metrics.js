// Frame intervals include the browser's scheduling and presentation cadence.
// JS work time is measured separately; neither is a direct GPU timer.
export function summarizeFrames(intervals, work = []) {
    if (!intervals.length) return null;
    const sorted = [...intervals].sort((a, b) => a - b);
    const percentile = (p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
    const elapsedMs = intervals.reduce((sum, value) => sum + value, 0);
    const round = (value) => Math.round(value * 100) / 100;
    return {
        frames: intervals.length,
        elapsedMs: round(elapsedMs),
        averageFps: round(intervals.length * 1000 / elapsedMs),
        medianMs: round(percentile(.5)),
        p95Ms: round(percentile(.95)),
        p99Ms: round(percentile(.99)),
        worstMs: round(sorted.at(-1)),
        framesOver33ms: intervals.filter((ms) => ms > 1000 / 30 + .5).length,
        framesOver50ms: intervals.filter((ms) => ms > 50).length,
        framesOver100ms: intervals.filter((ms) => ms > 100).length,
        averageJsWorkMs: work.length ? round(work.reduce((a, b) => a + b, 0) / work.length) : null,
    };
}
