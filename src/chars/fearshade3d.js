// FEAR, the Fear Shade (Skull Island's Skull Palace: a feeling), toon-3D: the painted builder's 'fear_shade' pack (assets/sprites/fear_shade/, 0.75x / 1x):
// idle loom stare lunge push hurt pop, origin = the floor under it, ~190 px tall at size 1.  o.size scales a painted pose (the game shrinks it as
// light pushes it back; the code rig reads o.size itself).  Landmarks: eyes mouth top handN handF.  The code rig (./fearshade.js) draws wherever
// the pack is not resident.  Drawn once 'fearshade' is listed in src/chars.js SI_ART3D.
import * as RIG from './fearshade.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('fear_shade', RIG);
export const { ANIM, META, ATLAS_SCALE, point, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
export const HEIGHT = RIG.HEIGHT;
const painted = (p) => !!p && p.s3d >= 0.5;
export function draw(ctx, pose, o = {}) { M.draw(ctx, pose, painted(pose) ? { ...o, scale: (o.scale || 1) * (o.size ?? 1) } : o); }
