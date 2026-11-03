// The RAGE WOLF (Skull Island's Cave of Rage), painted: tools/sprite3d/chars/rage_wolf.py -> assets/sprites/rage_wolf_painted/ (a recolour of the shadow wolf: idle, prowl, lungeWind, lunge, hurt, scatter; one size --
// the game grows and shrinks it by draw scale).  The code rig (./ragewolf.js) keeps the puppy poses (sit / hop / wag), which the pack has no clips for, and draws wherever the pack is not resident.
// The rig's clip names are mapped onto the pack's: growl = idle, run = prowl, windup = lungeWind, pop = scatter, fly / down / getup = the hurt drawings.
// The pack is ~110 px tall where the rig is ~78: its draw is scaled by RIG_K so the beast / alpha sizes (src/sirage.js) keep their meaning.
import * as RIG from './ragewolf.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('rage_wolf', RIG);
export const { META, ATLAS_SCALE, point, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
const A = M.ANIM, RIG_K = 0.72;
const pack = !!M.ATLAS_SCALE && !!A.prowl && ((A.prowl(0) || {}).s3d >= 0.5);
export const ANIM = pack ? {
  ...A,
  idle: (t) => A.idle(t), growl: (t) => A.idle(t * 1.7), run: (ph) => A.prowl((ph || 0) * 40 / 60),
  windup: (k) => A.lungeWind(k), lunge: (k) => A.lunge(k), hurt: (k) => A.hurt(k),
  fly: () => A.hurt(1), down: () => A.hurt(1), getup: (k) => A.hurt(1 - Math.min(1, k || 0)), pop: (k) => A.scatter(k),
} : A;
export const draw = (ctx, pose, o = {}) => M.draw(ctx, pose, pose && pose.s3d >= 0.5 ? { ...o, scale: (o.scale || 1) * RIG_K } : o);
