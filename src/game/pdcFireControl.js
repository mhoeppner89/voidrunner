// One fire-control channel per mothership limits simultaneous interception.
export const PDC_RECOVERY_SECONDS = 1.25;
export function getPdcDefenseChannel(session, ownerId) {
    session.pdcDefenseChannels ??= new Map();
    if (!session.pdcDefenseChannels.has(ownerId)) session.pdcDefenseChannels.set(ownerId, {readyAt:0});
    return session.pdcDefenseChannels.get(ownerId);
}
