// The COLLAR IMP (Skull Island's Kraken stage), painted: tools/sprite3d/chars/collar_imp.py -> assets/sprites/collar_imp_painted/ (a recolour of the fire imp -- the kobold's rig -- with a spiked purple collar:
// idle, walk, flee, taunt, throwWind, throw, hurt, hurt2, getup, fly, down).  The code rig (./collarimp.js) draws wherever the pack is not resident.
// The rig's clip names are mapped onto the pack's: hover = idle, diveWind = throwWind, swoop = throw, fly_knock = fly; the pack stands ~140 px where the rig is ~92: its draw is scaled by RIG_K.
import * as RIG from './collarimp.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('collar_imp', RIG);
export const { META, ATLAS_SCALE, point, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
const A = M.ANIM, RIG_K = 0.7;
const pack = !!M.ATLAS_SCALE && !!A.idle && ((A.idle(0) || {}).s3d >= 0.5);
export const ANIM = pack ? {
  ...A,
  hover: (t) => A.idle(t), flee: (ph) => A.flee(ph),
  diveWind: (k) => A.throwWind(k), swoop: (k) => A.throw(k),
  hurt: (k) => A.hurt(k), fly_knock: () => A.fly, down: (k) => (typeof A.down === 'function' ? A.down(k) : A.down),   // (anim audit #5: down is a k clip now)
} : A;
export const draw = (ctx, pose, o = {}) => M.draw(ctx, pose, pose && pose.s3d >= 0.5 ? { ...o, scale: (o.scale || 1) * RIG_K } : o);
