// The rock imp (Mystic Mountain), painted: tools/sprite3d/chars/rock_imp.py -> assets/sprites/rock_imp_painted/ (the kobold's clips; throwWind / throw, the 'hand' landmark).
import * as RIG from './kobold.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('rock_imp', RIG, { variant: 'green' });
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
