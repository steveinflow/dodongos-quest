// Cliff bat (Mystic Mountain, the Troll Bridge): a round, big-eared mountain bat -- a swooping flyer.  A code rig, the
// stand-in until its painted atlas (cliffbat) lands.  Kid-friendly: fuzzy, goofy, more pest than monster.
// Local space: origin = the floor point under it, +x = facing, y down; the engine lifts it by its flight height (z).  The
// body's centre sits at BODY_Y above the origin; ~100 px wing tip to wing tip.
// (pack name cliff_bat)  Clips: fly(t) swoop(k) hurt(k) fly_knock down getup(k) dizzy(t).
import { TAU, cel, flat, ellipse, circle, clamp } from '../rig.js';
import { INK } from '../config.js';

export const BODY_Y = -24;
export const HURTBOX = { x: 0, w: 56, h: 44 };
const STILL = { flap: 0, tuck: 0, tilt: 0, mouth: 0, eyes: 1, lie: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  fly: (t) => P({ flap: Math.sin(t * 15), tilt: 0.06 * Math.sin(t * 3), mouth: 0.2 }),
  swoop: (k) => P({ flap: k < 0.3 ? Math.sin(k * 60) : -0.7, tuck: k < 0.3 ? 0 : 0.6, tilt: k < 0.3 ? -0.2 : 0.45, mouth: 0.9 }),
  hurt: (k) => P({ flap: 0.8 - k, tilt: -0.4 * (1 - k), mouth: 0.7, eyes: 0 }),
  fly_knock: P({ flap: 0.9, tilt: -0.9, mouth: 0.8, eyes: 0 }),
  down: P({ lie: 1, flap: -0.2, eyes: 0, mouth: 0.4 }),
  getup: (k) => P({ lie: 1 - k, flap: Math.sin(k * 30), eyes: 1 }),
  dizzy: (t) => P({ lie: 1, flap: 0.2 * Math.sin(t * 9), eyes: 0 }),
};
const FUR = '#6a5a6e', FURD = '#463848', WING = '#4a3a52', WINGD = '#31253a', EAR = '#e3a0a8';

export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {});
  const f = o.facing || 1, S = o.scale || 1;
  ctx.save(); ctx.scale(f * S, S);
  ctx.translate(0, BODY_Y + p.lie * 16); ctx.rotate(p.tilt + p.lie * 0.2);
  const wing = (side) => {
    const a = p.flap * 0.9 * side - p.tuck * 0.8 * side;
    ctx.save(); ctx.scale(1, side > 0 ? 1 : 0.85);
    const span = 48 * (1 - p.tuck * 0.5), up = -Math.sin(a) * 34 * side;
    const path = (c) => { c.moveTo(-4, -6); c.quadraticCurveTo(-20, up - 10, -span, up); c.lineTo(-span + 10, up + 12); c.lineTo(-span + 22, up + 6); c.lineTo(-span + 30, up + 16); c.quadraticCurveTo(-14, 10, -4, 6); c.closePath(); };
    cel(ctx, path, side > 0 ? WING : WINGD, WINGD, { lw: 2.4 });
    ctx.restore();
  };
  ctx.save(); ctx.scale(-1, 1); wing(-1); ctx.restore();      // (the far wing, mirrored behind)
  // the body: a fuzzy ball
  cel(ctx, (c) => ellipse(c, 0, 0, 20, 18), FUR, FURD, { lw: 2.8 });
  // ears
  for (const ex of [-6, 8]) {
    cel(ctx, (c) => { c.moveTo(ex - 6, -14); c.lineTo(ex - 1, -34); c.lineTo(ex + 6, -13); c.closePath(); }, FUR, FURD, { lw: 2.2 });
    flat(ctx, (c) => { c.moveTo(ex - 3, -15); c.lineTo(ex - 1, -28); c.lineTo(ex + 3, -15); c.closePath(); }, EAR, 0);
  }
  // face: big eyes, a little snout, a fang or two (goofy, not scary)
  if (p.eyes > 0.5) {
    for (const ex of [3, 13]) { flat(ctx, (c) => circle(c, ex, -4, 5.4), '#fff7e0', 1.8); flat(ctx, (c) => circle(c, ex + 1.5, -3.5, 2.6), '#2a1428', 0); }
  } else {
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); for (const ex of [3, 13]) { ctx.moveTo(ex - 4, -7); ctx.lineTo(ex + 4, -1); ctx.moveTo(ex + 4, -7); ctx.lineTo(ex - 4, -1); } ctx.stroke();
  }
  flat(ctx, (c) => ellipse(c, 17, 3, 5, 3.5), '#b07a86', 1.6);
  const m = clamp(p.mouth, 0, 1);
  flat(ctx, (c) => ellipse(c, 10, 9, 5, 1.5 + m * 3.5), '#5a1a2a', 1.6);
  flat(ctx, (c) => { c.moveTo(7, 8); c.lineTo(8.5, 12); c.lineTo(10, 8); c.closePath(); c.moveTo(12, 8); c.lineTo(13.5, 12); c.lineTo(15, 8); c.closePath(); }, '#fff', 1);
  wing(1);
  // feet tucked under
  ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-6, 16); ctx.lineTo(-8, 22); ctx.moveTo(4, 17); ctx.lineTo(3, 23); ctx.stroke();
  ctx.restore();
  void TAU;
}
