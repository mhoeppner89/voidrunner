// Ordnance markers: hostile torpedoes in range get a diamond plus a lead dot
// for the pilot's guns; every round homing on the player gets a ring on
// screen or a chevron at the edge, so the pilot knows which way to break.
// Pooled entries and scratch vectors: the frame loop allocates nothing.
import * as THREE from 'three';
import {relativeIntercept} from './weaponFlight.js';

export const ORDNANCE_MARKER_LIMIT = 8;
export const TORPEDO_MARKER_RANGE = 2000;

export class OrdnanceMarkers {
    constructor() {
        this.entries = Array.from({length: ORDNANCE_MARKER_LIMIT}, () => ({
            kind: '', x: 0, y: 0, angle: 0, edge: false, lead: false, leadX: 0, leadY: 0,
            screen: {visible: true}, leadScreen: {visible: true}, edgeOut: {},
        }));
        this.point = new THREE.Vector3();
        this.aim = new THREE.Vector3();
        this.position = new Float64Array(3);
        this.velocity = new Float64Array(3);
        this.count = 0;
    }
    // session: the game session; aimGun: returns the pilot's slowest selected
    // gun (or undefined). It is only asked when a torpedo is on screen.
    update(session, aimGun) {
        const store = session.projStore, player = session.save.player, camera = session.renderer.camera;
        const origin = camera.position;
        let count = 0, gun, gunRead = false;
        for (const shot of session.projectiles) {
            if (count >= ORDNANCE_MARKER_LIMIT) break;
            if (!(shot.life > 0) || shot.kind !== 'missile') continue;
            const inbound = shot.targetId === 'player' && !shot.lostTrack;
            const torpedo = shot.launcherId === 'torpedo';
            if (!inbound && !torpedo) continue;
            const i = shot.slot * 3;
            this.position[0] = store.pos[i]; this.position[1] = store.pos[i + 1]; this.position[2] = store.pos[i + 2];
            const distance = Math.hypot(this.position[0] - origin.x, this.position[1] - origin.y, this.position[2] - origin.z);
            const threat = torpedo && distance <= TORPEDO_MARKER_RANGE && session.torpedoThreatensPlayerSide(shot);
            if (!inbound && !threat) continue;
            const entry = this.entries[count];
            entry.kind = torpedo ? 'torpedo' : 'missile';
            entry.inbound = inbound;
            const screen = session.renderer.projectToScreen(this.point.fromArray(this.position), entry.screen);
            const visible = session.markerPointVisible(screen);
            if (visible) {
                entry.edge = false; entry.x = screen.x; entry.y = screen.y; entry.angle = 0;
            } else if (inbound) {
                const edge = session.targetEdge(screen, false, entry.edgeOut);
                if (!edge) continue;
                entry.edge = true; entry.x = edge.x; entry.y = edge.y; entry.angle = edge.angleDeg;
            } else continue;
            entry.lead = false;
            if (threat && visible && !gunRead) { gun = aimGun?.(); gunRead = true; }
            if (threat && visible && gun && distance <= 1.5 * (gun.speed * gun.life)) {
                this.velocity[0] = store.vel[i]; this.velocity[1] = store.vel[i + 1]; this.velocity[2] = store.vel[i + 2];
                const time = relativeIntercept(origin, this.position, player.velocity, this.velocity, gun.speed, this.aim);
                if (Number.isFinite(time)) {
                    const lead = session.renderer.projectToScreen(this.aim.add(origin), entry.leadScreen);
                    if (session.markerPointVisible(lead)) {
                        entry.lead = true; entry.leadX = lead.x; entry.leadY = lead.y;
                    }
                }
            }
            count++;
        }
        for(const ship of session.ships){
            if(count===ORDNANCE_MARKER_LIMIT)break;
            if(!ship.lance?.active||ship.lance.target!=='player'||ship.hull<=0)continue;
            const entry=this.entries[count],screen=session.renderer.projectToScreen(this.point.fromArray(ship.position),entry.screen);
            const edge=session.targetEdge(screen,true,entry.edgeOut);
            entry.kind='lance';entry.inbound=false;entry.lead=false;entry.edge=Boolean(edge);
            entry.x=edge?.x??screen.x;entry.y=edge?.y??screen.y;entry.angle=edge?.angleDeg??0;count++;
        }
        this.count = count;
        return count;
    }
}
