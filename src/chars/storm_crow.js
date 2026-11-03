// Storm crow (Mystic Mountain, the Summit): a black crow crackling with Morvath's green storm -- a diving flyer.  And,
// with o.variant 'morvath', MORVATH AS A CROW (the end of the fight: a tiny, furious crow with his thorn crown and a
// tuft of white beard -- "CAW?!").  A code rig, the stand-in until the painted atlases (stormcrow, crowmorvath) land.
// Local space: origin = the floor point under it, +x = facing, y down; the engine lifts it by z.  ~90 px wing tip to tip.
// (pack names storm_crow; Morvath's crow: morvath_crow, ./morvath_crow.js)  Clips: fly(t) dive(k) hurt(k) fly_knock down getup(k) hop(t) caw(k).
import { TAU, cel, flat, ink, ellipse, circle, clamp } from '../rig.js';
import { INK } from '../config.js';

export const BODY_Y = -22;
export const HURTBOX = { x: 0, w: 60, h: 40 };
const STILL = { flap: 0, tuck: 0, tilt: 0, beak: 0, eyes: 1, lie: 0, hop: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  fly: (t) => P({ flap: Math.sin(t * 12), tilt: 0.05 * Math.sin(t * 2.5) }),
  dive: (k) => P({ flap: -0.6, tuck: 0.8, tilt: 0.55, beak: 0.6 }),
  hurt: (k) => P({ flap: 0.9 - k, tilt: -0.5 * (1 - k), beak: 0.8, eyes: 0 }),
  fly_knock: P({ flap: 1, tilt: -1, beak: 0.9, eyes: 0 }),
  down: P({ lie: 1, flap: -0.3, eyes: 0, beak: 0.3 }),
  getup: (k) => P({ lie: 1 - k, flap: Math.sin(k * 26) }),
  hop: (t) => P({ hop: Math.abs(Math.sin(t * 7)) * 8, flap: 0.2 * Math.sin(t * 14), tuck: 0.9 }),
  caw: (k) => P({ beak: Math.sin(Math.min(1, k * 2) * Math.PI), tilt: -0.25, flap: 0.6 * Math.sin(k * 30), tuck: 0.5 }),
};
const FEA = '#1c1a26', FEAD = '#0e0d14', FEAH = '#3a3650';

export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {});
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0, mv = o.variant === 'morvath';
  ctx.save(); ctx.scale(f * S, S);
  ctx.translate(0, BODY_Y - p.hop + p.lie * 14); ctx.rotate(p.tilt + p.lie * 0.3);
  const wing = (side) => {
    const a = p.flap * side - p.tuck * 0.7 * side, span = 46 * (1 - p.tuck * 0.55), up = -Math.sin(a) * 30 * side;
    const path = (c) => { c.moveTo(-6, -6); c.quadraticCurveTo(-18, up - 8, -span, up); c.lineTo(-span + 8, up + 8); c.lineTo(-span + 16, up + 4); c.lineTo(-span + 22, up + 12); c.lineTo(-span + 30, up + 9); c.quadraticCurveTo(-14, 10, -6, 6); c.closePath(); };
    cel(ctx, path, side > 0 ? FEA : FEAD, FEAD, { lw: 2.2, hi: side > 0 ? FEAH : undefined, hk: 0.3 });
  };
  ctx.save(); ctx.scale(-1, 1); ctx.translate(-4, -2); wing(-1); ctx.restore();
  // tail fan
  cel(ctx, (c) => { c.moveTo(-14, 0); c.lineTo(-34, -6); c.lineTo(-36, 4); c.lineTo(-32, 10); c.closePath(); }, FEA, FEAD, { lw: 2.2 });
  // body + head
  cel(ctx, (c) => ellipse(c, -2, 0, 20, 13), FEA, FEAD, { lw: 2.6, hi: FEAH, hk: 0.3 });
  cel(ctx, (c) => circle(c, 16, -8, 11), FEA, FEAD, { lw: 2.6, hi: FEAH, hk: 0.3 });
  // beak (opens to CAW)
  const b = clamp(p.beak, 0, 1);
  flat(ctx, (c) => { c.moveTo(24, -11); c.lineTo(38, -8 - b * 4); c.lineTo(25, -5); c.closePath(); }, '#4a4452', 1.8);
  flat(ctx, (c) => { c.moveTo(25, -5); c.lineTo(36, -4 + b * 6); c.lineTo(24, -1); c.closePath(); }, '#3a3442', 1.8);
  // the eye: green storm-glow (Morvath's: green too, and a grumpy brow)
  if (p.eyes > 0.5) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(19, -10, 0.5, 19, -10, 9); g.addColorStop(0, 'rgba(160,255,120,0.95)'); g.addColorStop(1, 'rgba(60,255,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(19, -10, 9, 0, TAU); ctx.fill(); ctx.restore();
    flat(ctx, (c) => circle(c, 19, -10, 3.2), '#b8ff7a', 1.4);
    if (mv) ink(ctx, (c) => { c.moveTo(13, -17); c.lineTo(24, -14); }, 2.6);
  } else ink(ctx, (c) => { c.moveTo(16, -13); c.lineTo(22, -7); c.moveTo(22, -13); c.lineTo(16, -7); }, 2);
  if (mv) {   // the thorn crown and the white beard tuft
    flat(ctx, (c) => { for (let i = 0; i < 5; i++) { const x = 8 + i * 4.5; c.moveTo(x - 2, -16); c.lineTo(x, -25 - (i % 2) * 3); c.lineTo(x + 2, -16); } }, '#5a4a3a', 1.6);
    ink(ctx, (c) => { c.moveTo(6, -17); c.lineTo(28, -17); }, 2.4, '#5a4a3a');
    flat(ctx, (c) => { c.moveTo(22, -2); c.quadraticCurveTo(26, 8, 20, 12); c.quadraticCurveTo(18, 4, 16, 0); c.closePath(); }, '#f2f0ea', 1.6);
  }
  wing(1);
  // legs
  ink(ctx, (c) => { c.moveTo(-2, 12); c.lineTo(-4, 20 + p.hop * 0.3); c.moveTo(6, 12); c.lineTo(6, 20 + p.hop * 0.3); }, 2.4, '#4a4452');
  // a crackle of green storm light round a storm crow
  if (!mv && (t * 3) % 1 < 0.25) ink(ctx, (c) => { c.moveTo(-20, -18); c.lineTo(-12, -24); c.lineTo(-8, -16); c.lineTo(0, -22); }, 1.8, 'rgba(140,255,120,0.9)');
  void INK;
  ctx.restore();
}
