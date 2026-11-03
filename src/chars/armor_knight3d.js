// The armour knight (sword) (Mystic Mountain), painted: tools/sprite3d/chars/armor_knight.py -> assets/sprites/armor_knight_painted/ (idle, walk, hurt, hurt2, slashWind / slash, collapse, reassemble; 'tip', 'helm', 'back').
import * as RIG from './guard.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('armor_knight', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
