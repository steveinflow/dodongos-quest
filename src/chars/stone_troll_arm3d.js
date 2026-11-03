// The Stone Troll's right arm (the smash, the ramp) (Mystic Mountain), painted: tools/sprite3d/chars/stone_troll_arm.py -> assets/sprites/stone_troll_arm_painted/ (the body's clips, frames and camera; 'fist', 'rampLow', 'rampHigh').
// (Drawn once stone_troll_arm is listed in src/chars.js MM_ART3D; until then -- and for any clip its pack lacks -- ./stone_troll.js.)
import * as RIG from './stone_troll.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('stone_troll_arm', RIG, { part: 'arm' });
export const { ANIM, META, ATLAS_SCALE, point, draw, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
