// The cliff bat (Mystic Mountain), painted: tools/sprite3d/chars/cliff_bat.py -> assets/sprites/cliff_bat_painted/ (fly, swoop, hurt, fly_knock, down, getup).
// (Drawn once cliff_bat is listed in src/chars.js MM_ART3D; until then -- and for any clip its pack lacks -- ./cliff_bat.js.)
import * as RIG from './cliff_bat.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('cliff_bat', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
