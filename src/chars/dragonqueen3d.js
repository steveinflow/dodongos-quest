// THE DRAGON QUEEN, painted (assets/sprites/dragonqueen_painted/: tools/sprite3d chars/dragonqueen.py, the Dragon King's
// model in pearl and rose-gold, no beard, a slim crown, kind golden eyes).  One atlas, every clip (no separate scene pack):
//   sleep (t: a slow breathing loop -- seated on her bed, slumped, eyes shut), wake (k: 0..0.25 asleep, ~0.33 a stir with
//   her eyes still shut, ~0.5 her head lifts and her eyes open, 1 sitting up), idle (t: standing, claws clasped),
//   wingSpread (k: the blessing -- wings wide, the near palm cupped at her chest at 1), fly (t).
// Rendered facing right and mirrored (unhanded); the cutscenes cast her facing left (f -1), as the code stand-in drew her
// (./dragonqueen.js, still her art for any clip the atlas lacks or while it isn't in).  Feet / the bed-top point at (0, 0).
// Exports: CROWN (the crown in idle, k 0) and HAND (the cupped palm in wingSpread at 1: the blessing's glow), game px at
// 1x facing right; point3d(pose, 'hand' | 'heart' | 'crown' | ...) per drawing.
import * as RIG from './dragonqueen.js';
import { spriteArt, rigOnly, rigDrawn } from '../sprite3d.js';

const A = await spriteArt('dragonqueen', { fallback: RIG });
const one = (f, a) => (typeof f === 'function' ? f(a) : f);
const isSpr = (key) => { const f = A.ANIM[key]; return f !== undefined && ((one(f, 0) || {}).s3d >= 0.5); };

export const ANIM = {};
for (const key of new Set([...Object.keys(RIG.ANIM), ...Object.keys(A.ANIM)])) {
  const rig = RIG.ANIM[key];
  if (!isSpr(key)) { if (rig !== undefined) ANIM[key] = rigOnly(key, rig, !!A.ATLAS_SCALE); continue; }
  const spr = A.ANIM[key];
  ANIM[key] = typeof spr === 'function' || typeof rig === 'function'
    ? (a) => Object.assign({}, rig !== undefined ? one(rig, a) : {}, one(spr, a))
    : Object.assign({}, rig || {}, spr);
}
ANIM.talk = ANIM.idle;   // (her lines: the standing idle)

/** Draw with her feet (asleep: the bed-top point she sits on) at (0, 0).  o: { facing, scale, t } */
export function draw(ctx, pose, o = {}) {
  if (pose && pose.s3d >= 0.5) { A.draw(ctx, pose, o); return; }
  rigDrawn('dragonqueen', pose);
  RIG.draw(ctx, pose, o);
}
export const META = A.META || RIG.META;
export const ATLAS_SCALE = A.ATLAS_SCALE;
export const point3d = A.point3d;
const X = A.EXPORTS || {};
export const CROWN = A.CROWN || X.CROWN || [46, -292];
export const HAND = A.HAND || X.HAND || [64, -144];
