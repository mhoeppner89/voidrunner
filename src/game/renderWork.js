// Render-only work reduction. Explicit world-space queries still use Three's
// updateWorldMatrix(), including for hidden objects; gameplay is unaffected.
const guardedRoots = new WeakSet();
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
