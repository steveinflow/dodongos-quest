// The green-fire imp (Mystic Mountain), painted: tools/sprite3d/chars/fire_imp.py -> assets/sprites/fire_imp_painted/ (the kobold's clips; throwWind / throw, the 'hand' landmark).
import * as RIG from './kobold.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('fire_imp', RIG, { variant: 'bomber' });
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
