// THE KING (Scarlet's father; Skull Island's finale), toon-3D: tools/sprite3d/chars/king.py -> assets/sprites/king/ (1x / 2x, not handed): idle talk float freed(k) wave bow(k) grave point cheer.
// The code rig (./king.js) keeps `weak` and `walk` (no story uses them) and draws wherever the pack is not resident; the story names `sit` -> idle, `victory` -> cheer, `hover` -> float
// are the pack's own clips under the cutscene's timed names.  Landmarks (point(pose, name)): head mouth crown handF ankleL ankleR hips.
// Drawn once 'king' is listed in src/chars.js SI_ART3D.  Runtime touches: a gentle sine bob on float and grave (the pack holds 24 ticks), a 2-3 px sway on point (it is two poses).
import * as RIG from './king.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('king', RIG);
export const { ATLAS_SCALE, point, EXPORTS } = M;
export const META = M.META || RIG.META;
export const HURTBOX = RIG.HURTBOX;
export const ANIM = { ...M.ANIM };
for (const [alias, to] of [['sit', 'idle'], ['victory', 'cheer'], ['hover', 'float']]) if (M.ANIM[to]) ANIM[alias] = M.ANIM[to];
const BOB = { float: [3.2, 1.6], grave: [1.6, 1.3], point: [1.4, 2.1] };   // (px amplitude, rad/s)
const clipOf = (pose) => (pose && pose.clip) || null;
export function draw(ctx, pose, o = {}) {
  const c = clipOf(pose), b = c && BOB[String(c).replace(/_R$|_L$/, '')];
  if (b && pose.s3d >= 0.5) { const t = o.t || 0; ctx.save(); ctx.translate(Math.sin(t * b[1]) * (c.startsWith('point') ? b[0] : 0), Math.sin(t * b[1]) * (c.startsWith('point') ? 0 : b[0])); M.draw(ctx, pose, o); ctx.restore(); }
  else M.draw(ctx, pose, o);
}
