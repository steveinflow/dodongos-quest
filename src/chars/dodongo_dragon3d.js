// DRAGON DODONGO, 3D-rendered painted sprites (the finale's sky duel and cutscenes: docs/FINALE.md).  Atlas
// 'dodongo_dragon' (its painted look: assets/sprites/dodongo_dragon_painted/, unhanded, packed at 1x and 2x), built by
// tools/sprite3d; for any clip it lacks (and while a pack decodes) the placeholder rig in ./dodongo_dragon.js draws him.
// Clips, timings and landmarks the atlas is built to: see ./dodongo_dragon.js.  The transform's fire glow stays 2D,
// drawn here behind him at the atlas' 'body' landmark; the breath, fireballs and the super wave are the duel's
// (src/skyduel.js), from the 'mouth' -> 'mouthF' landmarks (mouthOf).
import * as RIG from './dodongo_dragon.js';
import { spriteArt } from '../sprite3d.js';
import { TAU } from '../rig.js';

export * from './dodongo_dragon.js';          // the local exports below take precedence
const A = await spriteArt('dodongo_dragon', { fallback: RIG, only: 'painted', levelPack: true, extraPacks: ['move'] });   // (built painted only;
// its level pack -- transform / flyLoop / flame -- is Dodongo's super in the levels: 'dodongo_dragon:level'; its move pack --
// painter 3's combat clips for the dragon hero, bite / claw / tailWhip / rearUp / knock / recover / roar -- 'dodongo_dragon:move',
// in a level's set while someone plays him: src/chars/dragon_hero.js draws them while it is decoded)
export const { ATLAS_SCALE, point3d, hasNow } = A;
// (the painted wing beat stands ~150 px, wings up: the cutscenes frame and hang balloons by it)
export const META = A.META || (A.ATLAS_SCALE ? { ...RIG.META, height: 150 } : RIG.META);
export const PLACEHOLDER = !A.ATLAS_SCALE;

// the atlas' poses carry the rig's fields too (dclip, tglow ...): the 2D effects over the drawings read them
const one = (f, a) => (typeof f === 'function' ? f(a) : f);
export const ANIM = {};
for (const key of Object.keys(A.ANIM)) {
  const spr = A.ANIM[key], rig = RIG.ANIM[key];
  ANIM[key] = rig === undefined ? spr
    : typeof spr === 'function' || typeof rig === 'function' ? (a) => Object.assign({}, one(rig, a), one(spr, a))
      : Object.assign({}, rig, spr);
}
// no idle drawing: the cutscenes' default pose is his wing beat -- the atlas' flyLoop, not the rig's
ANIM.idle = ANIM.flyLoop;

const FLY0 = ANIM.flyLoop ? one(ANIM.flyLoop, 0) : null;
/** body centre above the origin (scale 1): the atlas' 'body' landmark in the wing beat's first drawing (the duel
 * positions him by it) */
export const BODY_Y = (A.point3d(FLY0, 'body') || [0, RIG.BODY_Y])[1];
/** where riders sit (scale 1, facing right): the atlas' seat0 (shoulders) / seat1 (the small of the back) in flyLoop;
 * the cutscenes mount riders here (the duel follows each drawing: seatOf) */
export const SEATS = [0, 1].map((i) => A.point3d(FLY0, 'seat' + i) || RIG.SEATS[i]);
export const SADDLE = SEATS[0];

/** [x, y, angle] of the breath's origin for a pose (scale 1, facing right): the atlas' mouth / mouthF landmarks */
export function mouthOf(pose) {
  const m = A.point3d(pose, 'mouth'), f = A.point3d(pose, 'mouthF');
  return m ? [m[0], m[1], f ? Math.atan2(f[1] - m[1], f[0] - m[0]) : 0] : RIG.mouthOf(pose);
}
/** [x, y] of his body centre for a pose (scale 1, facing right): the atlas' 'body' landmark (the transform's light) */
export function bodyOf(pose) { return A.point3d(pose, 'body') || [0, BODY_Y]; }
/** where rider i sits for a pose (scale 1, facing right): the atlas' seat<i> landmark, else the rig's */
export function seatOf(pose, i) {
  return A.point3d(pose, 'seat' + i) || RIG.SEATS[i] || RIG.SEATS[0];
}
// each seat at rest (flyLoop's first drawing), off the body: a pose's seat turns and drops against it -- a roll
// carries his back round below him (the riders are on the far side then), a rear-back or a flinch tilts them
const REST = [0, 1].map((i) => {
  const s = A.point3d(FLY0, 'seat' + i), b = A.point3d(FLY0, 'body');
  return s && b && s[1] < b[1] ? [s[0] - b[0], s[1] - b[1]] : null;
});
/** rider i on a pose (scale 1, facing right): { at: the seat, tilt: radians to turn the rider about it (+ clockwise),
 * vis: 0..1 (0: his back is turned away) } -- read off the atlas' seat<i> and body landmarks against flyLoop's */
export function seatPose(pose, i) {
  const at = seatOf(pose, i), b = A.point3d(pose, 'body'), r = REST[i];
  if (!b || !r || !A.point3d(pose, 'seat' + i)) return { at, tilt: 0, vis: 1 };
  const vx = at[0] - b[0], vy = at[1] - b[1], h = vy / r[1];      // (h: its height over the body, 1 at rest)
  let tilt = Math.atan2(vy, vx) - Math.atan2(r[1], r[0]);
  tilt = Math.atan2(Math.sin(tilt), Math.cos(tilt));
  return { at, tilt: Math.max(-0.6, Math.min(0.6, tilt)), vis: Math.max(0, Math.min(1, (h - 0.45) / 0.3)) };
}
/** the roll's smear window [k0, k1) (roll progress): from the drawing where his back is turned furthest (the shoulder
 * seat lowest against the body: the one drawn upside down) through the two after it; null without the landmarks */
export const ROLL_SMEAR = (() => {
  const ci = A.clipInfo && A.clipInfo('roll');
  if (!ci || !ci.g || !REST[0] || typeof ANIM.roll !== 'function') return null;
  const dur = ci.dur || ci.n * 2;
  let flip = -1, low = Infinity;
  for (let i = 0; i < ci.n; i++) {
    const p = ANIM.roll((ci.g[i] + 0.5) / dur), s = A.point3d(p, 'seat0'), b = A.point3d(p, 'body');
    if (s && b && b[1] - s[1] < low) { low = b[1] - s[1]; flip = i; }
  }
  if (flip < 0) return null;
  const j = Math.min(ci.n - 1, flip + 2), end = j + 1 < ci.n ? ci.g[j + 1] : dur;
  return [ci.g[flip] / dur, end / dur];
})();

export function draw(ctx, pose, o = {}) {
  if (pose && pose.s3d >= 0.5 && pose.tglow > 0.01) {      // the transform's fire, behind him (the rig's glow)
    const f = o.facing || 1, S = o.scale || 1, b = A.point3d(pose, 'body') || [0, BODY_Y];
    const x = b[0] * f * S, y = b[1] * S, g = pose.tglow;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(x, y, 4, x, y, 150 * S);
    gr.addColorStop(0, `rgba(255,230,140,${0.9 * g})`); gr.addColorStop(0.4, `rgba(255,140,40,${0.5 * g})`); gr.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 150 * S, 0, TAU); ctx.fill(); ctx.restore();
  }
  A.draw(ctx, pose, o);
}
