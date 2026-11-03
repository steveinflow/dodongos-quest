// The ice imp (Mystic Mountain), painted: tools/sprite3d/chars/ice_imp.py -> assets/sprites/ice_imp_painted/ (the kobold's clips + hop, breathWind / breath, the 'mouth' landmark).
import * as RIG from './kobold.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('ice_imp', RIG, { variant: 'blue' });
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
