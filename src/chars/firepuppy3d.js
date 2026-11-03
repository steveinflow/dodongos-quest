// The FIRE PUPPY (Skull Island's Cave of Rage: a calmed rage wolf), toon-3D: the painted builder's 'fire_puppy' pack (assets/sprites/fire_puppy/, 1x):
// hop(ph) sit(t) wag(t) pop(k), origin = the floor, ~40 px tall at scale 1.  The rage wolf's code rig draws a puppy ~48 px tall at scale 1 (its
// o.puppy poses), so a painted pose is drawn at o.scale * PUP_K and the actors' scales (src/sirage.js FirePuppy: 1.25 / the boss pup 1.9) keep
// their meaning.  The rig (./ragewolf.js via ./firepuppy.js) draws wherever the pack is not resident.  Drawn once 'firepuppy' is in SI_ART3D.
import * as RIG from './firepuppy.js';
import { mmArt } from './mm3d.js';

const PUP_K = 1.2;
const M = await mmArt('fire_puppy', RIG);
export const { ANIM, META, ATLAS_SCALE, point, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
const painted = (p) => !!p && p.s3d >= 0.5;
export function draw(ctx, pose, o = {}) { M.draw(ctx, pose, painted(pose) ? { ...o, scale: (o.scale || 1) * PUP_K } : o); }
