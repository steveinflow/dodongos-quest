// THE SLOTH BEAST (Skull Island's Cell of Sloth boss; the Skull Palace's Sloth Lump is the same creature, smaller), toon-3D: the painted builder's
// 'sloth_beast' pack (assets/sprites/sloth_beast/, 0.75x / 1x): the book's slimy SLOTH -- idle rise slamWind slam spitWind spit yawnWind yawn
// gulpWind gulp chew burp groggy defeat, origin = the floor.  The pack is authored at its final size (~235 px tall at scale 1); the code rig
// ('slime', ./slime.js: a 56 px slime the game draws at 4.2) stays the fallback, so a painted pose is drawn at the actor's scale / 4.2 (the Beast
// 4.2 -> 1, the Lump 2.5 -> 0.6) and its landmarks come back in rig units.  Landmarks: mouth eyes top belly handN handF (+ ankleL/R hips).
// Drawn once 'slime' is listed in src/chars.js SI_ART3D.
import * as RIG from './slime.js';
import { mmArt } from './mm3d.js';

const RIG_K = 4.2;   // (the actors' scale for the code rig's 56 px slime: 235 px)
const M = await mmArt('sloth_beast', RIG);
export const { ANIM, META, ATLAS_SCALE, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
const painted = (p) => !!p && p.s3d >= 0.5;
export function point(pose, lm) { const q = M.point(pose, lm); return q && painted(pose) ? [q[0] / RIG_K, q[1] / RIG_K] : q; }
export function draw(ctx, pose, o = {}) { M.draw(ctx, pose, painted(pose) ? { ...o, scale: (o.scale || 1) / RIG_K } : o); }
