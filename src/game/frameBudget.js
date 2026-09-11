// Presentation cadence is independent of the fixed 60 Hz flight simulation.
// Auto chooses a sustained mobile budget without lowering scene resolution.
export const flightFrameRate = (mode, touchDevice) =>
    mode === 'battery' || (mode !== 'performance' && touchDevice) ? 30 : 60;

export class FrameBudget {
    nextAt = undefined;
    lastAt = undefined;
    rate = undefined;
    reset() { this.nextAt = this.lastAt = undefined; }
    take(now, rate) {
        const interval = 1000 / rate;
        if (this.rate !== rate) { this.reset(); this.rate = rate; }
        if (this.nextAt !== undefined && now + 0.1 < this.nextAt) return null;
        const dt = this.lastAt === undefined ? 1 / rate : Math.min(0.1, Math.max(0, (now - this.lastAt) / 1000));
        this.lastAt = now;
        // Keep phase on 60/90/120 Hz displays. Never queue missed renders after
        // a stall: one current frame is enough.
        this.nextAt = this.nextAt === undefined ? now + interval
            : this.nextAt + Math.max(1, Math.floor((now + 0.1 - this.nextAt) / interval) + 1) * interval;
        return dt;
    }
}
