// Morvath as a crow (Mystic Mountain), painted: tools/sprite3d/chars/morvath_crow.py -> assets/sprites/morvath_crow_painted/ (hop, caw, fly).
// (Drawn once morvath_crow is listed in src/chars.js MM_ART3D; until then -- and for any clip its pack lacks -- ./morvath_crow.js.)
import * as RIG from './morvath_crow.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('morvath_crow', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
