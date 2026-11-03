// The snowman (Mystic Mountain), painted: tools/sprite3d/chars/snowman.py -> assets/sprites/snowman_painted/ (idle, move, throwWind, throw, hurt, puff; 'hand').
// (Drawn once snowman is listed in src/chars.js MM_ART3D; until then -- and for any clip its pack lacks -- ./snowman.js.)
import * as RIG from './snowman.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('snowman', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
