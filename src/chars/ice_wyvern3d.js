// The Ice Wyvern (Mystic Mountain), painted: tools/sprite3d/chars/ice_wyvern.py -> assets/sprites/ice_wyvern_painted/ (the wyvern's clips + snatch, breath, flyAway; 'talons', 'mouth').
import * as RIG from './wyvern.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('ice_wyvern', RIG, { rider: false, cursed: false });
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
