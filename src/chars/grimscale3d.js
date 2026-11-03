// Grimscale (boss), 3D-rendered sprites (loaded instead of ./grimscale.js with ?art3d=1 once 'grimscale' is in
// ART3D_NAMES; see src/chars.js, docs/SPRITE3D.md).  One model (assets-src/grimscale/, built by
// tools/sprite3d/models/grimscale_build.py on the lizard-folk rig) and two atlases, one per look:
//   assets/sprites/grimscale/       the cursed boss (o.cursed, the default): collar, glowing trim, green eyes -- idle, walk,
//                                   roar, sweepWind / sweep, tailWind / tail, breathWind / breath, leapCrouch, leapAir,
//                                   slam, stagger, down, getup, defeated (the collar cracks at k .5)
//   assets/sprites/grimscale_free/  freed (o.cursed === false: the 'freed' state and the cutscenes): no collar, dull trim,
//                                   gold eyes -- idle, walk, freed, kneel, point (with a jaw-flap talk variant), fly
// The engine asks for poses without the look (Enemy.anim(key, arg)), so ANIM is shared: a pose carries both the drawing
// index and the code rig's pose, and draw() picks the atlas by o.cursed, falling back to the other look's atlas when its
// own lacks the clip, then to the code rig.  Clips present in both (idle, walk) have the same drawings and timing.
// Rendered facing right and mirrored (unhanded, like the rig).  Over the sprite: the breath tell (throat glow + nostril
// smoke, timed by the rig's glow).
// Engine points: BREATH_MOUTH (enemies.js: the fire stream's origin), SADDLE (cutscene.js: where a rider sits in fly),
// COLLAR (the collar's gem as it cracks: the engine still hard-codes its sparks at [10, -190]), mouthOf(pose) for any
// pose -- measured on the 3D drawings; the rig's until the atlases exist.  drawCollar comes from the rig.
import * as RIG from './grimscale.js';
import { spriteArt, rigOnly } from '../sprite3d.js';

export * from './grimscale.js';          // BASE, measure helpers, drawCollar ... (local exports win)

const LOOKS = ['cursed', 'free'];
const ARTS = {};
await Promise.all(LOOKS.map(async (v) => {
  ARTS[v] = await spriteArt(v === 'cursed' ? 'grimscale' : 'grimscale_free', { fallback: RIG });
}));

const isSprite = (f) => {
  const p = typeof f === 'function' ? f(0) : f;
  return !!(p && p.s3d >= 0.5);
};
const has = (v, key) => isSprite(ARTS[v].ANIM[key]);
/** the first look whose atlas renders this clip (the drawing index is the same in every look that has it) */
const source = (key) => LOOKS.find((v) => has(v, key));

export const ANIM = {};
for (const key of new Set([...Object.keys(RIG.ANIM), ...LOOKS.flatMap((v) => Object.keys(ARTS[v].ANIM))])) {
  const v = source(key);
  const rig = RIG.ANIM[key];
  if (!v) { if (rig !== undefined) ANIM[key] = rigOnly(key, rig, Object.values(ARTS).some((a) => a.ATLAS_SCALE)); continue; }
  const spr = ARTS[v].ANIM[key];
  const one = (f, a) => (typeof f === 'function' ? f(a) : f);
  ANIM[key] = typeof spr === 'function' || typeof rig === 'function'
    ? (a) => Object.assign({}, rig !== undefined ? one(rig, a) : {}, one(spr, a))
    : Object.assign({}, rig || {}, spr);
}

/** Draw with the feet at (0, 0).  o: { facing, t, scale, cursed, mem, vel, talk } as ./grimscale.js. */
export function draw(ctx, pose, o = {}) {
  const want = (o.cursed ?? true) && !(pose && pose.free) ? 'cursed' : 'free';
  const other = want === 'cursed' ? 'free' : 'cursed';
  const clip = pose && pose.s3d >= 0.5 ? pose.clip : null;
  const v = clip && !has(want, clip) && has(other, clip) ? other : want;
  ARTS[v].draw(ctx, pose, o);
  if (clip && pose.glow > 0.05) breathGlow(ctx, ARTS[v], pose, o);
}

// The breath tell the drawings can't carry (grimscale.js: the rig's glow, 0..1 through breathWind / breath): green fire
// lighting his throat from inside, and green smoke curling up out of the nostril.
const GLOW = '#5cff7e', HS = 1.22;
function breathGlow(ctx, A, pose, o) {
  const f = o.facing || 1, S = o.scale || 1, T = o.t || 0, g = Math.min(1, pose.glow);
  const at = (lm) => { const q = A.point3d(pose, lm); return q ? [q[0] * f * S, q[1] * S] : null; };
  const cl = at('collar'), hd = at('head'), sn = at('snout');
  ctx.save();
  if (cl && hd) {                      // the throat: 45 % of the way from the collar to the head, a little forward
    const x = cl[0] + (hd[0] - cl[0]) * 0.45 + 6 * f * S, y = cl[1] + (hd[1] - cl[1]) * 0.45, R = (20 + 10 * g) * S;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, 'rgba(160,255,170,0.9)'); gr.addColorStop(0.45, 'rgba(92,255,126,0.45)'); gr.addColorStop(1, 'rgba(92,255,126,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 * g;
    ctx.fillStyle = gr; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (sn) {                            // grimscale.js: three puffs rising off the nostril, growing as they go
    ctx.globalAlpha = 0.7 * g; ctx.fillStyle = GLOW;
    for (let i = 0; i < 3; i++) {
      const u = (T * 1.5 + i / 3) % 1;
      ctx.beginPath();
      ctx.arc(sn[0] + f * (2 + u * 10) * HS * S, sn[1] + (-3 - u * 16) * HS * S, (2 + u * 3.5) * HS * S, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
export { draw as drawGrimscale };

const at = (v, key, k, lm) => {
  const A = ARTS[v], f = A.ANIM[key];
  return typeof f === 'function' ? A.point3d(f(k), lm) : null;
};
const r2 = (p) => (p ? p.map((c) => Math.round(c)) : null);
export const META = ARTS.cursed.META || ARTS.free.META;      // the atlas META (id, name, height, hurtbox), if built
export const BREATH_MOUTH = r2(at('cursed', 'breath', 0.3, 'mouth')) || RIG.BREATH_MOUTH;   // the fire stream's origin
export const SADDLE = r2(at('free', 'fly', 0, 'saddle')) || RIG.SADDLE;                     // the rider's hips in fly(t)
export const COLLAR = r2(at('cursed', 'defeated', 0.5, 'collar')) || null;                  // the gem as the collar cracks
/** Local [x, y] of the mouth for a pose (facing right, scale 1): the 3D drawing's landmark, else the rig's. */
export function mouthOf(p) {
  for (const v of LOOKS) { const q = ARTS[v].point3d(p, 'mouth'); if (q) return r2(q); }
  return RIG.mouthOf(p);
}
export const ATLAS_SCALE = ARTS.cursed.ATLAS_SCALE || ARTS.free.ATLAS_SCALE;
