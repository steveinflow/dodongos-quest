// Dodongo, 3D-rendered cel sprites (loaded instead of ./dodongo.js with ?art3d=1; see src/chars.js, docs/SPRITE3D.md).
// The atlas is built by tools/sprite3d (chars/dodongo.py); any ANIM key without a rendered clip falls back to the code rig.
import * as RIG from './dodongo.js';
import { spriteArt } from '../sprite3d.js';

export * from './dodongo.js';           // BASE, headPoint, landmarks ... (the local exports below take precedence)
const A = await spriteArt('dodongo', { fallback: RIG, extraPacks: ['move'] });   // (extraPacks: ['move']: painter 3's movement clips, their own pack)
export const { draw, ANIM, META, SHOOT_ORIGIN, CARRY_POINT, WALK_STRIDE, RUN_STRIDE, CARRY_STRIDE, ATLAS_SCALE, point3d, hasNow, EXPORTS } = A;   // (EXPORTS: the atlas' own measures -- a DODGE_BACK_V would reach src/player.js dodging)
export const drawDodongo = draw;
