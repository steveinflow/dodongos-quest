// MORVATH (Mystic Mountain, the Summit): twice a man's height, gaunt and grey, green eyes, a long white beard, a crown
// of thorns, a crow on his shoulder and a horned-skull staff of green fire (his magic is acid green -- Anastasia's is
// blue-white).  A storybook villain: grand and grumpy, never gory.  A code rig, the stand-in until his painted atlas
// (morvath) lands.  o.staff false: the staff stolen (src/mmbosses.js Morvath phase 2); o.crow false: his crow flown off.
// Local space: origin = the floor under him, +x = facing, y down; ~290 px to the crown's tips at scale 1.
//   staffTip(pose): the skull's mouth (where the bolts and the lightning leave), local, scale 1.
// Clips: idle(t) walk(ph) cast(k) blastWind(k) blast(k) chainWind(k) chain(t) hurt(k) stagger(t) grab(k) shrink(k)
// laugh(t) roar(k).
import { TAU, cel, flat, ink, ellipse, circle, keys, clamp, lerp, blob } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 290;
export const META = { id: 'morvath', name: 'MORVATH', height: 290 };
export const HURTBOX = { x: 0, w: 92, h: 270 };
const STILL = { sway: 0, lean: 0, staffA: 0.15, staffUp: 0, armB: 0, mouth: 0, glow: 0.4, brow: 0.6, shrink: 0, hurt: 0, beard: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  idle: (t) => P({ sway: Math.sin(t * 1.3), beard: Math.sin(t * 1.9), glow: 0.4 + 0.1 * Math.sin(t * 5) }),
  laugh: (t) => P({ sway: Math.sin(t * 9) * 0.6, lean: -0.08, mouth: 0.5 + 0.3 * Math.abs(Math.sin(t * 10)), brow: 0.2, beard: Math.sin(t * 10) }),
  roar: (k) => P({ lean: 0.06, staffUp: Math.sin(k * Math.PI), armB: 0.8 * Math.sin(k * Math.PI), mouth: 0.9 * Math.sin(Math.min(1, k * 1.4) * Math.PI), glow: 1, brow: 1 }),
  walk: (ph) => P({ sway: Math.sin(ph * TAU), lean: 0.05, beard: Math.sin(ph * TAU + 1) }),
  cast: (k) => keys(k, [[0, P({ staffUp: 0, glow: 0.4 })], [0.4, P({ staffUp: 1, armB: 0.9, glow: 1, mouth: 0.5, brow: 1, lean: -0.05 })], [1, P({ staffUp: 1, armB: 0.7, glow: 0.8, brow: 1 })]]),
  blastWind: (k) => P({ staffA: lerp(0.15, -0.7, k), lean: -0.1 * k, glow: 0.4 + 0.6 * k, brow: 1, mouth: 0.2 * k }),
  blast: (k) => keys(k, [[0, P({ staffA: -0.7, lean: -0.1, glow: 1, brow: 1 })], [0.2, P({ staffA: 1.2, lean: 0.14, glow: 1, mouth: 0.7, brow: 1 }), 'snap'], [1, P({ staffA: 0.5, lean: 0.04, glow: 0.5, brow: 0.8 })]]),
  chainWind: (k) => P({ staffUp: 0.5 * k, armB: 1.1 * k, glow: 0.5 + 0.5 * k, brow: 1 }),
  chain: (t) => P({ staffUp: 0.7, armB: 1.2 + 0.08 * Math.sin(t * 9), glow: 1, mouth: 0.4, brow: 1, lean: -0.06 }),
  hurt: (k) => P({ hurt: 1 - k, lean: -0.16 * (1 - k), mouth: 0.6 * (1 - k), brow: -0.4 }),
  stagger: (t) => P({ hurt: 0.6, sway: Math.sin(t * 6) * 1.5, lean: -0.1, mouth: 0.4, brow: -0.6, glow: 0.2 }),
  grab: (k) => P({ armB: 1.4 * Math.sin(k * Math.PI), lean: 0.12, mouth: 0.8, brow: 1 }),
  shrink: (k) => P({ shrink: k, hurt: 0.5, mouth: 0.8, brow: -0.8 }),
};
const ROBE = '#33323e', ROBED = '#1f1e28', ROBEH = '#4a4858', SKIN = '#b9b4a8', SKIND = '#8c877c', BEARD = '#f2f0ea', BEARDD = '#c8c4ba';
const GREEN = '#7dff5a', THORN = '#4e3f30';
/** the skull staff's tip (where its green fire is) for a pose, local scale 1 */
export function staffTip(p0) {
  const p = Object.assign({}, STILL, p0 || {});
  const hand = handOf(p), a = staffAngle(p);
  return [hand[0] + Math.sin(a) * 150, hand[1] - Math.cos(a) * 150];
}
/** a landmark (local px, scale 1; the painted pack's names): staffTip, hand (the free hand: the chains' root), head,
 * crow (the one on his shoulder) */
export function point(p0, name) {
  const p = Object.assign({}, STILL, p0 || {});
  if (name === 'staffTip') return staffTip(p);
  if (name === 'hand') { const a = -0.3 - p.armB * 1.4; return [-18 + Math.sin(a) * -70, -196 + Math.cos(a) * 70]; }
  if (name === 'head') return [8, -244];
  if (name === 'crow') return [-22, -224];
  return null;
}
const handOf = (p) => [52 + 30 * Math.sin(p.staffA) + 10 * p.staffUp, -150 - 60 * p.staffUp];
const staffAngle = (p) => p.staffA * 0.8 + p.staffUp * -0.15;

export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {});
  const f = o.facing || 1, S = (o.scale || 1) * (1 - 0.85 * clamp(p.shrink, 0, 1)), t = o.t || 0;
  const hasStaff = o.staff !== false;
  ctx.save(); ctx.scale(f * S, S);
  ctx.rotate(p.lean);
  const sw = p.sway * 3;
  // the robe: tall, tattered at the hem, sweeping
  cel(ctx, (c) => blob(c, [[-46 + sw, -4], [-30, -150], [-22, -210], [20, -214], [34, -150], [50 + sw, -2], [30, 6], [14, -6], [0, 8], [-16, -4], [-30, 8]], 0.45), ROBE, ROBED, { lw: 3.5, hi: ROBEH, hk: 0.3 });
  ink(ctx, (c) => { c.moveTo(-6, -200); c.quadraticCurveTo(-10, -100, -18 + sw, -6); c.moveTo(14, -196); c.quadraticCurveTo(20, -110, 24 + sw, -8); }, 2, 'rgba(0,0,0,0.35)');
  // the back arm (the free hand: raised for the chains)
  {
    const a = -0.3 - p.armB * 1.4, sh = [-18, -196];
    const hand = [sh[0] + Math.sin(a) * -70, sh[1] + Math.cos(a) * 70];
    cel(ctx, (c) => { c.moveTo(sh[0] - 12, sh[1]); c.lineTo(hand[0] - 9, hand[1]); c.lineTo(hand[0] + 9, hand[1]); c.lineTo(sh[0] + 12, sh[1]); c.closePath(); }, ROBE, ROBED, { lw: 3 });
    cel(ctx, (c) => { ellipse(c, hand[0], hand[1] + 4, 9, 11); }, SKIN, SKIND, { lw: 2.4 });
    if (p.armB > 0.6 && p.glow > 0.6) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(hand[0], hand[1], 2, hand[0], hand[1], 30); g.addColorStop(0, 'rgba(170,255,130,0.9)'); g.addColorStop(1, 'rgba(60,255,80,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hand[0], hand[1], 30, 0, TAU); ctx.fill(); ctx.restore(); }
  }
  // the head: gaunt, grey, green eyes, the crown of thorns, the long white beard
  ctx.save(); ctx.translate(6, -232 + p.hurt * 4); ctx.rotate(-p.hurt * 0.15);
  cel(ctx, (c) => { c.moveTo(-18, -10); c.quadraticCurveTo(-20, -40, 4, -42); c.quadraticCurveTo(28, -40, 26, -8); c.quadraticCurveTo(24, 14, 8, 18); c.quadraticCurveTo(-12, 16, -18, -10); c.closePath(); }, SKIN, SKIND, { lw: 3 });
  // the beard: long, flowing to the chest
  const bw = p.beard * 4;
  cel(ctx, (c) => { c.moveTo(-14, 2); c.quadraticCurveTo(-18, 40, -6 + bw, 84); c.lineTo(4 + bw, 70); c.lineTo(10 + bw, 90); c.quadraticCurveTo(26, 40, 24, 2); c.quadraticCurveTo(6, 14, -14, 2); c.closePath(); }, BEARD, BEARDD, { lw: 2.6 });
  // the mouth (inside the beard)
  if (p.mouth > 0.25) flat(ctx, (c) => ellipse(c, 8, 10, 7, 2 + p.mouth * 6), '#2a1e24', 2);
  // brows + the green eyes
  const b = p.brow;
  ink(ctx, (c) => { c.moveTo(-6, -22 + b * 2); c.lineTo(6, -18 - b * 3); c.moveTo(10, -18 - b * 3); c.lineTo(22, -21 + b * 2); }, 3.2, '#e8e4dc');
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const ex of [1, 16]) { const g = ctx.createRadialGradient(ex, -13, 0.5, ex, -13, 10); g.addColorStop(0, `rgba(190,255,150,${0.6 + 0.4 * p.glow})`); g.addColorStop(1, 'rgba(60,255,80,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, -13, 10, 0, TAU); ctx.fill(); }
  ctx.restore();
  for (const ex of [1, 16]) flat(ctx, (c) => ellipse(c, ex, -13, 4, 2.6), GREEN, 1.4);
  // the crown of thorns
  flat(ctx, (c) => { for (let i = 0; i < 7; i++) { const x = -16 + i * 6.5, h = 14 + (i % 2) * 8; c.moveTo(x - 3, -36); c.lineTo(x + Math.sin(i) * 2, -36 - h); c.lineTo(x + 3, -36); } }, THORN, 2);
  ink(ctx, (c) => { c.moveTo(-20, -36); c.quadraticCurveTo(4, -42, 28, -34); }, 4, THORN);
  ctx.restore();
  // the crow on his shoulder (it flies off for good at the end: o.crow false)
  if (o.crow !== false) drawShoulderCrow(ctx, -22, -214, t);
  // the staff arm and the horned-skull staff
  if (hasStaff) {
    const hand = handOf(p), a = staffAngle(p);
    ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(a);
    cel(ctx, (c) => { c.moveTo(-4, 120); c.lineTo(-4, -140); c.lineTo(4, -140); c.lineTo(4, 120); c.closePath(); }, '#4a3a2e', '#2e2219', { lw: 2.6 });
    // the skull: cartoon, with curling ram horns -- spooky-cute
    ctx.translate(0, -152);
    cel(ctx, (c) => { ellipse(c, 0, 0, 15, 13); }, '#e8e2d2', '#bdb5a2', { lw: 2.6 });
    ink(ctx, (c) => { c.moveTo(-12, -6); c.bezierCurveTo(-30, -16, -32, 8, -18, 8); c.moveTo(12, -6); c.bezierCurveTo(30, -16, 32, 8, 18, 8); }, 5, '#5a4a3a');
    flat(ctx, (c) => { circle(c, -5, -1, 3.4); circle(c, 6, -1, 3.4); }, '#14240e', 0);
    // its green fire
    const gl = p.glow;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -12, 2, 0, -12, 34 + 18 * gl); g.addColorStop(0, `rgba(190,255,150,${0.5 + 0.5 * gl})`); g.addColorStop(1, 'rgba(60,255,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -12, 34 + 18 * gl, 0, TAU); ctx.fill();
    for (let i = 0; i < 3; i++) { const h = 18 + 10 * gl + 5 * Math.sin(t * 9 + i * 2); ctx.fillStyle = ['rgba(60,220,80,0.8)', 'rgba(125,255,90,0.8)', 'rgba(220,255,200,0.9)'][i]; ctx.beginPath(); ctx.moveTo(-9 + i * 3, -6); ctx.quadraticCurveTo(-6 + i * 2, -h * 0.7, Math.sin(t * 7 + i) * 3, -6 - h); ctx.quadraticCurveTo(6 - i * 2, -h * 0.7, 9 - i * 3, -6); ctx.fill(); }
    ctx.restore();
    ctx.restore();
    // the hand round the staff
    cel(ctx, (c) => { c.moveTo(18, -196); c.lineTo(hand[0] - 8, hand[1] - 6); c.lineTo(hand[0] + 8, hand[1] + 8); c.lineTo(30, -186); c.closePath(); }, ROBE, ROBED, { lw: 3 });
    cel(ctx, (c) => ellipse(c, hand[0], hand[1], 10, 9), SKIN, SKIND, { lw: 2.4 });
  } else {
    const hand = [56, -150];
    cel(ctx, (c) => { c.moveTo(18, -196); c.lineTo(hand[0] - 8, hand[1] - 6); c.lineTo(hand[0] + 8, hand[1] + 8); c.lineTo(30, -186); c.closePath(); }, ROBE, ROBED, { lw: 3 });
    cel(ctx, (c) => ellipse(c, hand[0], hand[1], 10, 9), SKIN, SKIND, { lw: 2.4 });
  }
  if (p.shrink > 0.05) {   // the shrink: a swirl of green smoke closing round him
    ctx.save(); ctx.globalAlpha = Math.sin(p.shrink * Math.PI);
    for (let i = 0; i < 10; i++) { const a = i * 0.63 + t * 4; flat(ctx, (c) => circle(c, Math.cos(a) * 60, -140 + Math.sin(a) * 90, 22), 'rgba(110,200,110,0.6)', 0); }
    ctx.restore();
  }
  void INK;
  ctx.restore();
}
function drawShoulderCrow(ctx, x, y, t) {
  ctx.save(); ctx.translate(x, y);
  const bob = Math.sin(t * 2.3) * 1.5;
  cel(ctx, (c) => ellipse(c, 0, -10 + bob, 13, 10), '#1c1a26', '#0e0d14', { lw: 2.2 });
  cel(ctx, (c) => circle(c, 9, -20 + bob, 7.5), '#1c1a26', '#0e0d14', { lw: 2.2 });
  flat(ctx, (c) => { c.moveTo(15, -22 + bob); c.lineTo(25, -19 + bob); c.lineTo(15, -16 + bob); c.closePath(); }, '#4a4452', 1.6);
  flat(ctx, (c) => circle(c, 11, -21 + bob, 2), '#b8ff7a', 0);
  ctx.restore();
}
