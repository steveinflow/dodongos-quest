// The Wolf Pack's alpha (Mystic Mountain), painted: tools/sprite3d/chars/wolf_alpha.py -> assets/sprites/wolf_alpha_painted/ (the shadow wolf's clips + howl, a bulkier model at its own size).
// (Drawn once wolf_alpha is listed in src/chars.js MM_ART3D; until then -- and for any clip its pack lacks -- ./wolf_alpha.js.)
import * as RIG from './wolf_alpha.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('wolf_alpha', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
