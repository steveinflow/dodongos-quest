// Morvath (Mystic Mountain), painted: tools/sprite3d/chars/morvath.py -> assets/sprites/morvath_painted/ (idle, walk, cast, blastWind, blast, chainWind, chain, hurt, stagger, grab, shrink, roar, laugh; 'staffTip', 'hand', 'head', 'crow').
// (Drawn once morvath is listed in src/chars.js MM_ART3D; until then -- and for any clip its pack lacks -- ./morvath.js.)
import * as RIG from './morvath.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('morvath', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
