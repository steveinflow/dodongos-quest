// The shadow wolf (Mystic Mountain), painted: tools/sprite3d/chars/shadow_wolf.py -> assets/sprites/shadow_wolf_painted/ (idle, prowl, lungeWind, lunge, hurt, scatter; 'mouth').
// (Drawn once shadow_wolf is listed in src/chars.js MM_ART3D; until then -- and for any clip its pack lacks -- ./shadow_wolf.js.)
import * as RIG from './shadow_wolf.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('shadow_wolf', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
