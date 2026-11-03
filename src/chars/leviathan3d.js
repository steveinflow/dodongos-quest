// THE LEVIATHAN's neck + head (Skull Island Stage 1's mini-boss), toon-3D: the painted builder's 'leviathan' pack (assets/sprites/leviathan/,
// scales 0.75 / 1 / 2): idle slamWind slam stuck snapWind snap whirl hurt dizzy sink, anchored at NECKBASE (0, 0), facing R (mirrored).
// Landmarks: neckBase head eye jaw fang0 fang1 fang2.  Exports SLAM_TIPS / SNAP_HEAD (and META).  The code rig (./leviathan.js) draws
// wherever the pack is not resident.  Drawn once 'leviathan' is listed in src/chars.js SI_ART3D.
import * as RIG from './leviathan.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('leviathan', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
export const SLAM_TIPS = (EXPORTS && EXPORTS.SLAM_TIPS) || RIG.SLAM_TIPS;
export const SNAP_HEAD = (EXPORTS && EXPORTS.SNAP_HEAD) || RIG.SNAP_HEAD;
