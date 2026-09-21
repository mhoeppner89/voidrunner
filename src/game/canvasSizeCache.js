// Hull canvases have no padding or border. ResizeObserver supplies their CSS
// size after layout, so HUD writes do not force a synchronous layout read on
// every draw. DPR remains a draw-time input and never invalidates CSS sizing.
export class CanvasSizeCache {
    constructor(Observer = globalThis.ResizeObserver) {
        this.sizes = new WeakMap();
        this.observer = Observer ? new Observer(entries => {
            for (const { target, contentRect } of entries) {
                this.sizes.set(target, {
                    width: Math.round(contentRect.width),
                    height: Math.round(contentRect.height),
                });
            }
        }) : null;
    }
    get(canvas) {
        let size = this.sizes.get(canvas);
        if (!size || !this.observer) {
            size = { width: canvas.clientWidth, height: canvas.clientHeight };
            this.sizes.set(canvas, size);
            this.observer?.observe(canvas);
        }
        return size;
    }
    disconnect() {
        this.observer?.disconnect();
        this.sizes = new WeakMap();
    }
}
