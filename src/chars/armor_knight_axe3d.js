// The armour knight (axe) (Mystic Mountain), painted: tools/sprite3d/chars/armor_knight_axe.py -> assets/sprites/armor_knight_axe_painted/ (idle, walk, hurt, hurt2, chopWind / chop, collapse, reassemble; 'tip', 'helm', 'back').
import * as RIG from './guard.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('armor_knight_axe', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
