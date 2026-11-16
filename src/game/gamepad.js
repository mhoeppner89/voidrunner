// Shared standard-layout sampling. Browsers may expose sparse/array-like lists,
// and can deny the API in embedded contexts; keyboard/touch must keep working.
export function connectedGamepad(preferredIndex) {
    try {
        const pads = globalThis.navigator?.getGamepads?.();
        if (!pads) return undefined;
        if (preferredIndex != null && pads[preferredIndex]?.connected) return pads[preferredIndex];
        for (let i = 0; i < pads.length; i++) if (pads[i]?.connected) return pads[i];
    } catch { /* unavailable browser/permissions policy */ }
    return undefined;
}
export function padButton(pad, index) {
    const button = pad?.buttons?.[index];
    return Boolean(button?.pressed || Number(button?.value) > 0.5);
}
export function padAxis(pad, index, deadzone = 0.13, sensitivity = 1) {
    const value = Number(pad?.axes?.[index]);
    if (!Number.isFinite(value)) return 0;
    const magnitude = Math.min(1, Math.abs(value));
    return magnitude <= deadzone ? 0 : Math.sign(value) * Math.min(1, (magnitude - deadzone) / (1 - deadzone) * sensitivity);
}
export function padNeutral(pad, deadzone = 0.13) {
    for (let i = 0; i < (pad?.buttons?.length ?? 0); i++) if (padButton(pad, i)) return false;
    for (let i = 0; i < 4; i++) if (padAxis(pad, i, deadzone)) return false;
    return true;
}
