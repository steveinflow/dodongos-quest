// Anastasia, 3D-rendered cel sprites (loaded instead of ./ana.js with ?art3d=1; see src/chars.js, docs/SPRITE3D.md).
// The atlas is built by tools/sprite3d (chars/ana.py); any ANIM key without a rendered clip falls back to the code rig.
// She is rendered in one view (facing right, the staff in her near hand) and mirrored when she faces left, like the rig.
import * as RIG from './ana.js';
import { spriteArt } from '../sprite3d.js';
import { HEROES } from '../heroes.js';

export * from './ana.js';               // BASE, crystalOf, rigOf, mix ... (the local exports below take precedence)
const A = await spriteArt('ana', { fallback: RIG, carryStride: RIG.CARRY_STRIDE, extraPacks: ['move'] });   // (extraPacks: ['move']: painter 3's movement clips, their own pack)
export const { ANIM, META, SHOOT_ORIGIN, CARRY_POINT, ATLAS_SCALE, point3d, hasNow, EXPORTS } = A;   // (EXPORTS: the atlas' own measures -- a DODGE_BACK_V would reach src/player.js dodging)
// strides of the rendered gaits (the engine advances the gait phase by distance); the rig's for the ones still drawn by it
export const WALK_STRIDE = A.WALK_STRIDE ?? RIG.WALK_STRIDE;
export const RUN_STRIDE = A.RUN_STRIDE ?? RIG.RUN_STRIDE;
export const CARRY_STRIDE = A.CARRY_STRIDE ?? RIG.CARRY_STRIDE;

// engine landmarks (src/player.js), measured on the 3D drawings: the crystal at the thrust's contact (the engine pops a
// blue burst there) and where the crystal strikes the floor in the finisher (the shockwave's centre)
const H = HEROES.ana.atk;
const at = (key, lm) => point3d(typeof ANIM[key] === 'function' ? ANIM[key](H[key].a0 / H[key].dur) : null, lm);
export const ATK3_CRYSTAL = at('atk3', 'crystal') || RIG.ATK3_CRYSTAL;
export const SLAM_POINT = at('atk4', 'crystal') || RIG.SLAM_POINT;

// the crystal's glow: one cached radial sprite, added over the drawing at the crystal landmark (it pulses gently)
const GLOW = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(200,245,255,0.95)');
  g.addColorStop(0.25, 'rgba(110,200,255,0.55)');
  g.addColorStop(0.6, 'rgba(60,140,255,0.18)');
  g.addColorStop(1, 'rgba(40,100,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
})();

// no glow while the staff is slung on her back (carrying; the throw until she pulls it off her back)
const OFF_HAND = { carryIdle: 99, carryWalk: 99, throw: 4 };

/** Draw with the feet at (0, 0) (docs/CONTRACTS.md); sprite poses get the crystal glow on top. */
export function draw(ctx, pose, o = {}) {
  A.draw(ctx, pose, o);
  if (!GLOW || !pose || !(pose.s3d >= 0.5)) return;
  if (OFF_HAND[pose.clip] !== undefined && (pose['f_' + pose.clip] | 0) < OFF_HAND[pose.clip]) return;
  const p = point3d(pose, 'crystal', 1);
  if (!p) return;
  const s = o.scale || 1, f = o.facing || 1, r = 17 * s;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 + 0.12 * Math.sin((o.t || 0) * 4.2);
  ctx.drawImage(GLOW, f * p[0] * s - r, p[1] * s - r, 2 * r, 2 * r);
  ctx.restore();
}
