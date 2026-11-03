// The storm crow (Mystic Mountain), painted: tools/sprite3d/chars/storm_crow.py -> assets/sprites/storm_crow_painted/ (fly, dive, hurt, fly_knock, down, getup).
// (Drawn once storm_crow is listed in src/chars.js MM_ART3D; until then -- and for any clip its pack lacks -- ./storm_crow.js.)
import * as RIG from './storm_crow.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('storm_crow', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
