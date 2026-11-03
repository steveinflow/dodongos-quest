// Morvath, his staff stolen (Mystic Mountain), painted: tools/sprite3d/chars/morvath_nostaff.py -> assets/sprites/morvath_nostaff_painted/ (idle, stagger, grab, hurt, shrink).
// (Drawn once morvath_nostaff is listed in src/chars.js MM_ART3D; until then -- and for any clip its pack lacks -- ./morvath_nostaff.js.)
import * as RIG from './morvath_nostaff.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('morvath_nostaff', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
