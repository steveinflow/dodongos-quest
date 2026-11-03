// The Stone Troll (his body: all but the right arm) (Mystic Mountain), painted: tools/sprite3d/chars/stone_troll.py -> assets/sprites/stone_troll_painted/ (idle, fistWind, smash, press, stunned, tickle, sneezeWind, sneeze, topple; 'nose', 'mouth', 'fist', 'rampLow', 'rampHigh').
// (Drawn once stone_troll is listed in src/chars.js MM_ART3D; until then -- and for any clip its pack lacks -- ./stone_troll.js.)
import * as RIG from './stone_troll.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('stone_troll', RIG, { part: 'body' });
export const { ANIM, META, ATLAS_SCALE, point, draw, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
