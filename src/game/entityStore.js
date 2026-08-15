// EntityStore — slot-allocated flat component store shared by the simulation
// (writer) and the renderer (reader). Transforms live in Float32Array channels
// keyed by slot index; entities keep only metadata (id, kind, damage, life).
//
// Why this exists: the old layout stored position/velocity/rotation as plain
// arrays on every entity and rebuilt them with tuple()/quatTuple() each sim
// step — tens of thousands of tiny allocations per second (the top GC source
// after the AI scratch cleanup). The flat store writes floats in place, so the
// sim and render hot paths allocate nothing, and there is no shared scratch
// object between sim and render for an aliasing bug to hide in. Three.js
// meshes become pure render-side views of these channels.
//
// Channels: pos (x,y,z), vel (x,y,z), rot (x,y,z,w), prevPos (x,y,z),
// prevRot (x,y,z,w) — prev* are the interpolation snapshots taken at the start
// of each sim step. Slots are recycled through a free list; meshes keyed by
// slot can be reconciled cheaply by comparing the live entity count.

export class EntityStore {
    constructor(initialCapacity = 64) {
        this.capacity = initialCapacity;
        this.freeSlots = [];
        this.live = new Array(initialCapacity).fill(false);
        this.nextSlot = 0;
        this.pos = new Float32Array(initialCapacity * 3);
        this.vel = new Float32Array(initialCapacity * 3);
        this.rot = new Float32Array(initialCapacity * 4);
        this.prevPos = new Float32Array(initialCapacity * 3);
        this.prevRot = new Float32Array(initialCapacity * 4);
    }

    grow() {
        const old = this.capacity;
        this.capacity *= 2;
        const copy = (src, width) => {
            const dst = new Float32Array(this.capacity * width);
            dst.set(src.subarray(0, old * width));
            return dst;
        };
        this.pos = copy(this.pos, 3);
        this.vel = copy(this.vel, 3);
        this.rot = copy(this.rot, 4);
        this.prevPos = copy(this.prevPos, 3);
        this.prevRot = copy(this.prevRot, 4);
        this.live.length = this.capacity;
        this.live.fill(false, old);
    }

    alloc() {
        if (this.freeSlots.length > 0) {
            const slot = this.freeSlots.pop();
            this.live[slot] = true;
            return slot;
        }
        if (this.nextSlot >= this.capacity)
            this.grow();
        const slot = this.nextSlot;
        this.nextSlot += 1;
        this.live[slot] = true;
        return slot;
    }

    free(slot) {
        this.live[slot] = false;
        this.freeSlots.push(slot);
    }

    isLive(slot) {
        return slot !== undefined && slot >= 0 && slot < this.live.length && this.live[slot];
    }

    setPos(slot, x, y, z) {
        const i = slot * 3;
        this.pos[i] = x;
        this.pos[i + 1] = y;
        this.pos[i + 2] = z;
    }

    getPos(slot, out) {
        const i = slot * 3;
        return out.set(this.pos[i], this.pos[i + 1], this.pos[i + 2]);
    }

    setVel(slot, x, y, z) {
        const i = slot * 3;
        this.vel[i] = x;
        this.vel[i + 1] = y;
        this.vel[i + 2] = z;
    }

    // Vector-style setters for call sites that already hold a THREE.Vector3.
    setPosV(slot, v) {
        const i = slot * 3;
        this.pos[i] = v.x;
        this.pos[i + 1] = v.y;
        this.pos[i + 2] = v.z;
    }

    setVelV(slot, v) {
        const i = slot * 3;
        this.vel[i] = v.x;
        this.vel[i + 1] = v.y;
        this.vel[i + 2] = v.z;
    }

    getVel(slot, out) {
        const i = slot * 3;
        return out.set(this.vel[i], this.vel[i + 1], this.vel[i + 2]);
    }

    setRot(slot, x, y, z, w) {
        const i = slot * 4;
        this.rot[i] = x;
        this.rot[i + 1] = y;
        this.rot[i + 2] = z;
        this.rot[i + 3] = w;
    }

    getRot(slot, out) {
        const i = slot * 4;
        return out.set(this.rot[i], this.rot[i + 1], this.rot[i + 2], this.rot[i + 3]);
    }

    // prev* <- current (pos + rot). Called at the start of each sim step so the
    // renderer can interpolate between the previous and current states.
    snapshot(slot) {
        const i = slot * 3;
        this.prevPos[i] = this.pos[i];
        this.prevPos[i + 1] = this.pos[i + 1];
        this.prevPos[i + 2] = this.pos[i + 2];
        const j = slot * 4;
        this.prevRot[j] = this.rot[j];
        this.prevRot[j + 1] = this.rot[j + 1];
        this.prevRot[j + 2] = this.rot[j + 2];
        this.prevRot[j + 3] = this.rot[j + 3];
    }
}
