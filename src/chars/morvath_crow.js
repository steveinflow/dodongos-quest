// MORVATH AS A CROW (Mystic Mountain, the end of the summit): the storm crow's code rig in his look -- the thorn crown,
// a tuft of white beard, a grumpy brow (./storm_crow.js o.variant 'morvath') -- until the painted pack (morvath_crow:
// hop(t), caw(k), fly(t)) lands.
import * as C from './storm_crow.js';

export const ANIM = C.ANIM;
export const META = { id: 'morvath_crow', name: 'MORVATH (CROW)', height: 40 };
export function draw(ctx, pose, o = {}) { C.draw(ctx, pose, { ...o, variant: 'morvath' }); }
