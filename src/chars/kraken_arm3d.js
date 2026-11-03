// THE KRAKEN's ARM (Skull Island, AA QA A1), toon-3D: the painted builder's 'kraken_arm' pack (assets/sprites/kraken_arm/, 1x / 2x) -- the
// eyed boss tentacle's paint WITHOUT its eyes (tools/sprite3d/chars/kraken_arm.py), so the stages' arms never read as the fight's eyed targets.
// Clips: popUp(k) idle(t) grab(k) hold(t) wilt(k) surf(t) hump(t), anchored at the base (the hole in the deck / the surf's dive point), facing R
// (mirrored: not handed), ~257 px tall at scale 1.  Exports HOLD (the grab's curl) and SURF_TIP (the surf's leading tip), px from the base.
// No code rig: every helper returns false while the pack is not resident (or the scene's set missed it), and the caller draws its own art
// (src/sikraken.js tube, src/stages/sibluegull.js tentacle).  Listed in src/chars.js SI_ART3D.
import { mmArt } from './mm3d.js';
import { packHas } from '../sprite3d.js';

const M = await mmArt('kraken_arm', null);
export const { ANIM, META, ATLAS_SCALE, point, draw, EXPORTS } = M;
export const HURTBOX = { x: 0, w: 44, h: 230 };
export const HOLD = (EXPORTS && EXPORTS.HOLD) || [105, -82];
export const SURF_TIP = (EXPORTS && EXPORTS.SURF_TIP) || [214, -64];
const CLIPS = ['popUp', 'idle', 'grab', 'hold', 'wilt', 'surf'];   // (+ 'hump', drawn where the pack has it: r2)
const clamp01 = (k) => Math.max(0, Math.min(1, +k || 0));
/** the pack is decoded, with every clip the helpers draw */
export const ready = () => !!ATLAS_SCALE && packHas('kraken_arm', CLIPS);

/** one arm standing in its hole at (x, y), screen px.  phase: 'rise' (k 0..1: up through the deck) | 'up' (swaying, t s) |
 *  'grab' (k 0..1: curling over) | 'hold' (curled round a held hero, t) | 'sink' (k 0..1: back down through the deck).
 *  o: { facing = 1, scale = 1, mem }.  -> false (nothing drawn) when the pack isn't resident. */
export function drawArm(ctx, x, y, phase, k, t, o = {}) {
  if (!ready()) return false;
  const A = ANIM;
  const pose = phase === 'rise' ? A.popUp(clamp01(k)) : phase === 'grab' ? A.grab(clamp01(k)) : phase === 'hold' ? A.hold(t || 0)
    : phase === 'sink' ? A.wilt(clamp01(k)) : A.idle(t || 0);
  ctx.save(); ctx.translate(x, y);
  try { draw(ctx, pose, { facing: o.facing || 1, scale: o.scale || 1, t: t || 0, mem: o.mem || {} }); } finally { ctx.restore(); }
  return true;
}

export const SURF_DIVE = (EXPORTS && EXPORTS.SURF_DIVE) || [10, 0];
export const HUMP_A = (EXPORTS && EXPORTS.HUMP_A) || [-20, 0];
export const HUMP_B = (EXPORTS && EXPORTS.HUMP_B) || [70, 0];
/** a broken hole in the planks at (x, y): where an arm comes up through the deck */
function hole(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = 'rgba(12,6,20,0.62)'; ctx.beginPath(); ctx.ellipse(x, y, 30 * s, 9 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 2.5 * s; ctx.stroke();
  ctx.strokeStyle = 'rgba(244,220,176,0.8)'; ctx.lineWidth = 2 * s; ctx.lineCap = 'round'; ctx.beginPath();   // (pale split plank ends)
  for (const a of [0.4, 1.3, 2.4, 3.6, 4.5, 5.6]) { const c = Math.cos(a), q = Math.sin(a); ctx.moveTo(x + c * 26 * s, y + q * 7.5 * s); ctx.lineTo(x + c * 36 * s, y + q * 10.5 * s); }
  ctx.stroke(); ctx.restore();
}
/** the hole's near lip, drawn OVER the arm: a dark broken-plank crescent under where it comes out (critics, r2) */
function lip(ctx, x, y, s) {
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 4.5 * s; ctx.beginPath(); ctx.ellipse(x, y + 1 * s, 31 * s, 9.5 * s, 0, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
  ctx.strokeStyle = 'rgba(244,220,176,0.75)'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.ellipse(x, y + 4.5 * s, 33 * s, 10 * s, 0, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke();
  ctx.restore();
}

/** the SWEEP: the arm racing along the deck lane at y, its tip leading at tipX (screen px), dir +1 = sweeping right: it comes up
 *  out of a broken hole in the planks, arches low along the lane with its tip curled up in front, and a coil of it humps out of
 *  the deck behind (r2, critics: r1 lay on the planks like a beached slug).  o: { scale = 1.3 }.  -> false when the pack isn't
 *  resident. */
export function drawSurf(ctx, tipX, y, t, dir = 1, o = {}) {
  if (!ready()) return false;
  const s = o.scale || 1.3, d = dir < 0 ? -1 : 1, tt = t || 0, mem = o.mem || {};
  const xs = tipX - d * SURF_TIP[0] * s, xDive = xs + d * SURF_DIVE[0] * s;
  const xhB = xDive - d * 34 * s, xh = xhB - d * HUMP_B[0] * s, xhA = xh + d * HUMP_A[0] * s;
  const hp = ANIM.hump && packHas('kraken_arm', ['hump']);
  if (hp) { hole(ctx, xhA, y, s * 0.85); hole(ctx, xhB, y, s * 0.85); }
  hole(ctx, xDive, y, s);
  if (hp) {
    ctx.save(); ctx.translate(xh, y);
    try { draw(ctx, ANIM.hump(tt + 0.2), { facing: d, scale: s, t: tt, mem }); } finally { ctx.restore(); }
  }
  ctx.save(); ctx.translate(xs, y);
  try { draw(ctx, ANIM.surf(tt), { facing: d, scale: s, t: tt, mem }); } finally { ctx.restore(); }
  if (hp) { lip(ctx, xhA, y, s * 0.85); lip(ctx, xhB, y, s * 0.85); }
  lip(ctx, xDive, y, s);
  return true;
}

/** Stage 1's arm rising behind the rail after the conch (src/stages/sibluegull.js setKraken k 0..1): its base on the rail line at
 *  (x, y) -- the bulwark drawn over it -- popping up (k < 1), then swaying.  -> false when the pack isn't resident. */
export function drawRise(ctx, x, y, k, t, facing = -1, scale = 1.25) {
  if (!ready()) return false;
  return k < 1 ? drawArm(ctx, x, y, 'rise', k, t, { facing, scale }) : drawArm(ctx, x, y, 'up', k, t, { facing, scale });
}
