// Wyvern Rider, 3D-rendered sprites (loaded instead of ./wyvern.js with ?art3d=1 once 'wyvern' is in ART3D_NAMES; see
// src/chars.js, docs/SPRITE3D.md).  Two layers, like wyvern.js draws them (the rider last, over the near wing):
//   assets/sprites/wyvern/        the wyvern (tools/sprite3d chars/wyvern.py; model assets-src/wyvern/)
//   assets/sprites/wyvern_rider/  the kobold lancer, his saddle and lance, rendered on the same solved wyvern and the
//                                 same drawings (chars/wyvern_rider.py; the kobold model assets-src/kobold/), + riderFall
// The rider layer is drawn over the wyvern's drawing while the rider is in the saddle (o.rider, default true, and a pose
// that has him); riderFall is the rider layer alone.  Every pose carries the code rig's pose too, so a missing atlas
// (or a missing rider clip) draws the code rig.  Rendered facing right and mirrored (unhanded).
// Engine points from the 3D drawings: SEAT_POS (fly: the rider's hips, where RiderFall starts) and LANCE_TIP (dive).
import * as RIG from './wyvern.js';
import { spriteArt, rigOnly, rigDrawn } from '../sprite3d.js';

export * from './wyvern.js';           // BODY_Y, BASE, HURTBOX, RIDER_BOX, RIDER_HIP_Y, boxesOf, headOf, drawCollar ...

const W = await spriteArt('wyvern', { fallback: RIG });
const R = await spriteArt('wyvern_rider', { fallback: null });
// the Eyrie's mini-boss (docs/SECRETS.md): wyvern_alpha, the wyvern layer in a storm palette (no rider) -- the same
// clips and drawings as the wyvern's, drawn for o.variant 'alpha' where its atlas is in (else the wyvern's, washed:
// src/minibosses.js reads ALPHA_ART)
const WA = await spriteArt('wyvern_alpha', { fallback: null });
export const ALPHA_ART = !!WA.ATLAS_SCALE;
const one = (f, a) => (typeof f === 'function' ? f(a) : f);
const isSpr = (A, key) => { const f = A.ANIM[key]; return f !== undefined && ((one(f, 0) || {}).s3d >= 0.5); };

export const ANIM = {};
for (const key of new Set([...Object.keys(RIG.ANIM), ...Object.keys(W.ANIM), ...Object.keys(R.ANIM)])) {
  const A = isSpr(W, key) ? W : isSpr(R, key) ? R : null;
  const rig = RIG.ANIM[key];
  if (!A) { if (rig !== undefined) ANIM[key] = rigOnly(key, rig, !!(W.ATLAS_SCALE || R.ATLAS_SCALE)); continue; }
  const spr = A.ANIM[key];
  ANIM[key] = typeof spr === 'function' || typeof rig === 'function'
    ? (a) => Object.assign({}, rig !== undefined ? one(rig, a) : {}, one(spr, a))
    : Object.assign({}, rig || {}, spr);
}

function streaks(ctx, b, f, S, t) {                // dive: speed lines streaming back off the body (wyvern.js streaks)
  ctx.save(); ctx.strokeStyle = '#fffaf0'; ctx.lineCap = 'round'; ctx.globalAlpha = 0.7;
  for (const [y, x0, L, w] of [[-10, -34, 36, 2.6], [2, -40, 46, 3.2], [13, -32, 30, 2.2]]) {
    const off = (t * 260 + y * 13) % 30;
    ctx.lineWidth = w * S; ctx.beginPath();
    ctx.moveTo(b[0] + f * (x0 - off) * S, b[1] + y * S); ctx.lineTo(b[0] + f * (x0 - off - L) * S, b[1] + y * S); ctx.stroke();
  }
  ctx.restore();
}
function stars(ctx, h, S, t) {
  ctx.save(); ctx.fillStyle = '#ffe066'; ctx.strokeStyle = '#21141c'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = t * 3 + i * 2.094, x = h[0] + Math.cos(a) * 14 * S, y = h[1] - 18 * S + Math.sin(a) * 4 * S;
    ctx.beginPath();
    for (let j = 0; j < 10; j++) { const r = (j % 2 ? 1.7 : 4.2) * S, b = -Math.PI / 2 + j * Math.PI / 5; ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// the clips the kobold is never aboard for (knocked off as the wyvern falls: RiderFall), so never a missing rider clip
const NO_RIDER = new Set(['fall', 'down', 'freed']);
/** Draw with the floor point under the wyvern at (0, 0) (the engine lifts it by z).  o: as ./wyvern.js. */
export function draw(ctx, pose, o = {}) {
  if (!pose || !(pose.s3d >= 0.5)) { rigDrawn('wyvern', pose); RIG.draw(ctx, pose, o); return; }
  const clip = pose.clip, f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  if (clip === 'riderFall') { R.draw(ctx, pose, o); return; }
  const riderOn = (o.rider ?? true) && pose.rider !== false && !NO_RIDER.has(clip);
  if (riderOn && !isSpr(R, clip)) { if (R.ATLAS_SCALE) rigDrawn('wyvern_rider', pose, clip); RIG.draw(ctx, pose, o); return; }           // no rider drawing yet: the code rig
  const WL = o.variant === 'alpha' && ALPHA_ART && isSpr(WA, clip) ? WA : W;   // (the wyvern layer: the alpha's own)
  const at = (lm) => { const q = WL.point3d(pose, lm); return q ? [q[0] * f * S, q[1] * S] : null; };
  if (pose.streak > 0.01) { const b = at('body'); if (b) streaks(ctx, b, f, S, t); }
  WL.draw(ctx, pose, o);
  if (riderOn) R.draw(ctx, { s3d: 1, clip, ['f_' + clip]: pose['f_' + clip] }, o);
  if (pose.stars) { const h = at('head'); if (h) stars(ctx, h, S, t); }
}
export { draw as drawWyvern };

const pt = (A, key, k, lm) => { const g = A.ANIM[key]; return typeof g === 'function' ? A.point3d(g(k), lm) : null; };
const r2 = (p) => (p ? p.map((c) => Math.round(c)) : null);
export const SEAT_POS = r2(pt(W, 'fly', 0, 'seat')) || RIG.SEAT_POS;        // the rider's hips in fly
export const LANCE_TIP = r2(pt(R, 'dive', 0, 'lance')) || RIG.LANCE_TIP;    // the lance tip in the dive
export const META = W.META;
export const ATLAS_SCALE = W.ATLAS_SCALE;
