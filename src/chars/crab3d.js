// The STORM CRAB (Skull Island's Kraken stage), toon-3D: tools/sprite3d/chars/crab.py -> assets/sprites/crab/ (blue-grey; idle walk taunt windup snip hurt fly down getup; not handed; scales 1x + 2x, enemies use 1x).
// Landmarks (point(pose, name)): claw (the near pincer tip), clawF, head, mouth, ankleL/R, hips.  Export SNIP [80, -8].  Drawn once 'crab' is listed in src/chars.js SI_ART3D; the code rig (./crab.js) is the fallback
// (and the pack has no 'flee': the walk at double phase, as the rig does).
import * as RIG from './crab.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('crab', RIG);
export const { META, ATLAS_SCALE, point, draw, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
export const ANIM = M.ATLAS_SCALE && M.ANIM.walk ? { ...M.ANIM, flee: (ph) => M.ANIM.walk(((ph * 2) % 1 + 1) % 1) } : M.ANIM;
