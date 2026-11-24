// Presentation cadence is independent of the fixed 60 Hz flight simulation.
export const flightFrameRate = (mode, touchDevice) =>
    mode === 'battery' || (mode !== 'performance' && touchDevice) ? 30 : 60;

export class FrameBudget {
    nextAt = undefined;
    lastAt = undefined;
    rate = undefined;
    fastRate = 0;
    goodWindows = 0;
    badWindows = 0;
    sampleAt = undefined;
    retryAt = 0;

    // Pauses, maps and inactive scenes restart timing and sampling, but a
    // downshift cooldown survives them: otherwise twelve cheap seconds behind
    // a menu would undo a fallback that real flight load just caused.
    reset() {
        this.nextAt = this.lastAt = this.sampleAt = this.callbackAt = undefined;
        this.refreshMs = undefined;
        this.goodWindows = this.badWindows = 0;
    }
    // Docking and launch change the scene completely. Start the next flight
    // at the safe rate and let it earn 60 again; a pending cooldown stays.
    restart() {
        this.reset();
        this.fastRate = 0;
    }
    // Skip a stretch without disturbing frame pacing: the next live window
    // starts fresh, earlier live windows still count.
    suspendSampling() {
        this.sampleAt = undefined;
    }
    // Changing the power setting is an explicit request: forget past history.
    clear() {
        this.restart();
        this.retryAt = 0;
    }
    target(mode, touch) {
        return (mode === 'auto' && this.fastRate) || flightFrameRate(mode, touch);
    }
    // Measure actual browser callbacks, including missed vsyncs, and main-thread
    // time on submitted frames. A capped 30 fps render counter alone cannot tell
    // whether there is room for another frame between submissions.
    observe(now, workMs, rendered, touch) {
        if (this.sampleAt === undefined) {
            this.sampleAt = now;
            this.callbacks = this.draws = this.expensive = 0;
            return;
        }
        this.callbacks++;
        if (rendered) {
            this.draws++;
            const budgetMs = touch ? 1000 / 60 : 1000 / (this.fastRate || 120);
            if (workMs > budgetMs * (this.fastRate ? 0.9 : 0.55)) this.expensive++;
        }
        const elapsed = now - this.sampleAt;
        if (elapsed < 2000) return;
        const hz = 1000 * this.callbacks / elapsed;
        if (this.fastRate) {
            // One shader upload, GC pause or debugger sample can spoil an
            // otherwise idle window. Downshift only if pressure continues.
            // A 120 Hz panel can keep firing callbacks while submissions
            // miss their slots, so delivered frames count as well.
            const drawHz = 1000 * this.draws / elapsed;
            const overloaded = hz < this.fastRate * 0.87 || drawHz < Math.min(this.fastRate, hz) * 0.87
                || this.expensive > this.draws * 0.18;
            this.badWindows = overloaded ? this.badWindows + 1 : 0;
            if (this.badWindows >= 2) {
                this.fastRate = this.goodWindows = this.badWindows = 0;
                this.retryAt = now + 30000;
            }
        } else {
            const headroom = now >= this.retryAt && hz >= (touch ? 57 : 80)
                && this.draws > 0 && this.expensive <= this.draws * 0.05;
            this.goodWindows = headroom ? this.goodWindows + 1 : 0;
            if (this.goodWindows >= 6) this.fastRate = touch ? 60 : Math.round(hz);
        }
        this.sampleAt = now;
        this.callbacks = this.draws = this.expensive = 0;
    }
    take(now, rate) {
        if (this.rate !== rate) {
            this.nextAt = this.lastAt = undefined;
            this.rate = rate;
        }
        // A promoted desktop follows the display directly, including fractional
        // refresh rates. The measured refresh sets its quality governor target.
        if (rate <= 60) {
            const interval = 1000 / rate;
            const delta = now - this.callbackAt;
            this.callbackAt = now;
            if (delta >= 4 && delta <= 21)
                this.refreshMs = this.refreshMs === undefined ? delta : this.refreshMs + 0.12 * (delta - this.refreshMs);
            // At 30 fps WebKit can timestamp the correct refresh several ms early.
            // Keep a tighter gate at 60 fps to preserve fractional display cadences.
            const tolerance = rate === 30 ? Math.min(6, (this.refreshMs ?? 1000 / 60) * 0.38) : 0.5;
            const due = now + tolerance;
            if (this.nextAt !== undefined && due < this.nextAt) return null;
            this.nextAt = this.nextAt === undefined || Math.abs(now - this.nextAt) <= tolerance ? now + interval
                : this.nextAt + Math.max(1, Math.floor((due - this.nextAt) / interval) + 1) * interval;
        }
        const dt = this.lastAt === undefined ? 1 / rate : Math.min(0.1, Math.max(0, (now - this.lastAt) / 1000));
        this.lastAt = now;
        return dt;
    }
}
