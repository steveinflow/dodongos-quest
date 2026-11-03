// DRAGON DODONGO (the finale: docs/FINALE.md), PLACEHOLDER rig until the painted atlas assets/sprites/dodongo_dragon/
// exists (src/chars/dodongo_dragon3d.js draws the atlas and falls back to this).  It is the ember whelp's rig (orange-
// red, kin to his dragon arm) scaled up, with Dodongo's chestnut crest on the head and his shield's dragon emblem on
// the chest, so it reads as him.
//
// Local space (as the whelp's): origin = the point under the body, +x = facing, y down; the body centre sits BODY_Y
// above it (scale 1).  The sky duel positions him by that body centre (src/skyduel.js).
// Clips the art agent builds to (atlas 'dodongo_dragon', see docs/FINALE.md "Art hooks"):
//   flyLoop (t, a 0.6 s wing beat)   fireTap (k, 18 f: mouth open by k .15)   flame (t, mouth held open: the stream)
//   roll (k, 24 f: one barrel roll)  hurt (k, 20 f)   super (k, 60 f: rears back k 0-.4, breathes k .4-1)
//   transform (k, 90 f, cutscenes: curled up in the glow -> wings thrown wide)
// Landmarks: mouth (breath origin), mouthF (a point 10 px further along the breath, for its angle), seat0 / seat1
// (where riders sit, on his shoulders and the small of his back), chest (the emblem).
import * as WH from './whelp.js';
import { TAU, clamp } from '../rig.js';
import { INK } from '../config.js';

const SC = 2.3;                              // the whelp rig at this scale is the placeholder's size
const DEG = Math.PI / 180;
export const BODY_Y = WH.BODY_Y * SC;        // body centre above the origin (scale 1)
export const META = { height: 190, name: 'DRAGON DODONGO' };
/** where riders sit (scale 1, facing right, relative to the origin): [shoulders, small of the back] */
export const SEATS = [[-18, -96], [-52, -86]];
export const SADDLE = SEATS[0];

// (fire: orange mouth fire, free: the friendly face -- the whelp rig's own flags)
const TAG = (p, extra) => Object.assign({}, p, { fire: true, free: true }, extra);
export const ANIM = {
  flyLoop: (t) => TAG(WH.ANIM.hover(t), { dclip: 'fly' }),
  fireTap: (k) => TAG(WH.ANIM.spit(clamp(k, 0, 1) * 0.5), { dclip: 'fire' }),
  flame: (t) => TAG(WH.ANIM.spit(0.32 + 0.03 * Math.sin(t * 20)), { dclip: 'flame' }),
  roll: (k) => TAG(WH.ANIM.swoop((k || 0) * 0.4), { dclip: 'roll', roll: clamp(k, 0, 1) }),
  hurt: (k) => TAG(WH.ANIM.hurt(k), { dclip: 'hurt' }),
  super: (k) => TAG(WH.ANIM.spit(k < 0.4 ? 0.02 : 0.32), { dclip: 'super', rear: k < 0.4 ? k / 0.4 : Math.max(0, 1 - (k - 0.4) * 4) }),
  transform: (k) => TAG(WH.ANIM.hover((k || 0) * 1.5), { dclip: 'transform', tglow: clamp(1 - Math.abs((k || 0) - 0.45) * 2.2, 0, 1) }),
};
ANIM.idle = ANIM.flyLoop;                    // (cutscenes ask for idle by default)

// the whelp rig's head / body frames, from its mouthOf() arithmetic (NECK [14, -10], body centre BODY_Y = -20)
function rot2(x, y, a) { const c = Math.cos(a * DEG), s = Math.sin(a * DEG); return [x * c - y * s, x * s + y * c]; }
function headPt(p, hx, hy) {
  let [x, y] = rot2(hx, hy, -(p.head || 0));
  x += 14; y += -10;
  x *= p.st || 1; y /= Math.sqrt(p.st || 1);
  [x, y] = rot2(x, y, -(p.pitch || 0) - (p.rot || 0));
  return [x + (p.x || 0), y + WH.BODY_Y + (p.y || 0)];
}
function bodyPt(p, bx, by) {
  const [x, y] = rot2(bx, by, -(p.pitch || 0) - (p.rot || 0));
  return [x + (p.x || 0), y + WH.BODY_Y + (p.y || 0)];
}
/** [x, y, angle] of the mouth (scale 1, facing right, relative to the origin) */
export function mouthOf(p) {
  const [x, y] = WH.mouthOf(p);
  const ang = -((p.pitch || 0) + (p.rot || 0) + (p.head || 0) * 0.5) * DEG;
  return [x * SC, y * SC, ang];
}
export const MOUTH = mouthOf(ANIM.fireTap(0.3));
/** where rider i sits for a pose (scale 1, facing right, relative to the origin) */
export function seatOf(pose, i) { return SEATS[i] || SEATS[0]; }

/** o: { facing, t, scale, mem, vel } (as every art module) */
export function draw(ctx, pose, o = {}) {
  const f = o.facing || 1, S = (o.scale || 1);
  const p = pose || ANIM.flyLoop(o.t || 0);
  ctx.save();
  if (p.roll) {                                // a barrel roll: spun about the body centre
    const cy = BODY_Y * S;
    ctx.translate(0, cy); ctx.rotate(f * p.roll * TAU); ctx.translate(0, -cy);
  }
  if (p.rear) { ctx.translate(-f * 8 * p.rear * S, 0); ctx.rotate(-f * 0.25 * p.rear); }
  if (p.tglow) {                               // the transform's fire
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, BODY_Y * S, 4, 0, BODY_Y * S, 150 * S);
    g.addColorStop(0, `rgba(255,230,140,${0.9 * p.tglow})`); g.addColorStop(0.4, `rgba(255,140,40,${0.5 * p.tglow})`); g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, BODY_Y * S, 150 * S, 0, TAU); ctx.fill(); ctx.restore();
  }
  WH.draw(ctx, p, { ...o, scale: S * SC, cursed: false, variant: 'ember' });
  // Dodongo's chestnut crest (a tousled tuft between the horns) and the dragon emblem of his shield on the chest
  const k = S * SC;
  ctx.save(); ctx.scale(f, 1);
  const [hx, hy] = headPt(p, 0, -17);
  ctx.translate(hx * k, hy * k); ctx.scale(0.62, 0.62); ctx.rotate(-((p.pitch || 0) + (p.rot || 0) + (p.head || 0)) * DEG);
  ctx.lineJoin = 'round'; ctx.lineWidth = 1.6 * k; ctx.strokeStyle = INK;
  // (swept-back spikes of hair, darker underneath, a lighter strand on top)
  ctx.fillStyle = '#7a3f1c';
  ctx.beginPath();
  ctx.moveTo(-10 * k, 4 * k);
  ctx.quadraticCurveTo(-20 * k, -2 * k, -24 * k, -8 * k); ctx.quadraticCurveTo(-15 * k, -6 * k, -11 * k, -7 * k);
  ctx.quadraticCurveTo(-17 * k, -14 * k, -18 * k, -21 * k); ctx.quadraticCurveTo(-9 * k, -14 * k, -5 * k, -13 * k);
  ctx.quadraticCurveTo(-7 * k, -21 * k, -4 * k, -27 * k); ctx.quadraticCurveTo(1 * k, -18 * k, 3 * k, -14 * k);
  ctx.quadraticCurveTo(6 * k, -20 * k, 11 * k, -22 * k); ctx.quadraticCurveTo(8 * k, -14 * k, 9 * k, -8 * k);
  ctx.quadraticCurveTo(6 * k, -2 * k, 6 * k, 3 * k); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.lineWidth = 1.1 * k; ctx.strokeStyle = '#b8743a';
  ctx.beginPath(); ctx.moveTo(-3 * k, -6 * k); ctx.quadraticCurveTo(-8 * k, -14 * k, -5 * k, -21 * k); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-9 * k, -4 * k); ctx.quadraticCurveTo(-14 * k, -10 * k, -15 * k, -16 * k); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.scale(f, 1);
  const [cx, cy] = bodyPt(p, 13, 3);
  ctx.translate(cx * k, cy * k);
  ctx.lineWidth = 1.2 * k; ctx.strokeStyle = INK;
  ctx.fillStyle = '#c99a3a'; ctx.beginPath(); ctx.arc(0, 0, 5.4 * k, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b8261e'; ctx.beginPath();
  ctx.moveTo(-2.6 * k, 2.4 * k); ctx.lineTo(-0.6 * k, -3 * k); ctx.lineTo(1.2 * k, -0.6 * k); ctx.lineTo(3 * k, -2.8 * k); ctx.lineTo(2.4 * k, 2.6 * k); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
}
