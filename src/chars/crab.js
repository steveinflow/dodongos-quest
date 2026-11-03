// STORM CRAB (Skull Island, the Kraken's stage -- docs/SKULL_ISLAND.md): a small, cross teal crab with two big orange pincers, eye stalks
// on springs and six scuttling legs; it comes up over the rail in the storm.  Kid-friendly: grumpy, never scary; beaten, it lands on its
// back with its legs wiggling and scuttles off.
// A code rig, the stand-in until its painted pack lands.  Local space: origin = the floor under it, +x = facing (the pincers' side),
// y down; ~62 px tall at scale 1 (about waist-high to the heroes).
// Clips: idle(t) walk(ph) taunt(t) windup(k) snip(k) hurt(k) fly down getup(k) flee(ph).
import { TAU, DEG, cel, flat, ink, capsule, ellipse, circle, keys } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 62;
export const META = { id: 'crab', name: 'STORM CRAB', height: 62 };
export const HURTBOX = { x: 0, w: 38, h: 54 };

const STILL = { x: 0, y: 0, tilt: 0, sq: 1, ph: 0, cl: 20, cr: 20, ol: 0.2, or: 0.2, face: 'neutral', lie: 0, eye: 0, legs: 0 };
const P = (o) => Object.assign({}, STILL, o);
const SCUT = (ph) => P({ ph, y: -Math.abs(Math.sin(ph * TAU)) * 2.4, tilt: 3 * Math.sin(ph * TAU), cl: 30 + 8 * Math.sin(ph * TAU), cr: 30 - 8 * Math.sin(ph * TAU), legs: 1, face: 'neutral' });
export const ANIM = {
  idle: (t) => P({ y: 0.8 * Math.sin(t * 2.4), cl: 24 + 4 * Math.sin(t * 2.4), cr: 24 - 4 * Math.sin(t * 2.4 + 1), ol: 0.18 + 0.1 * Math.max(0, Math.sin(t * 5)), or: 0.18, eye: Math.sin(t * 1.3) }),
  walk: SCUT,
  // the taunt: both pincers clacking
  taunt: (t) => { const c = Math.max(0, Math.sin(t * 11)); return P({ y: -1, cl: 70, cr: 70, ol: 0.2 + 0.8 * c, or: 0.2 + 0.8 * (1 - c), face: 'angry', tilt: 4 * Math.sin(t * 5) }); },
  // the pinch: one pincer cocked back and wide open, then it snaps shut forward
  windup: (k) => P({ x: -3 * k, y: 2 * k, tilt: -8 * k, sq: 1 - 0.06 * k, cl: 20 + 70 * k, cr: 36, ol: 0.2 + 0.8 * k, or: 0.3, face: 'angry', legs: 0 }),
  snip: (k) => keys(k, [
    [0, P({ x: -3, y: 2, tilt: -8, cl: 90, cr: 36, ol: 1, or: 0.3, face: 'angry', sq: 0.94 })],
    [0.28, P({ x: 12, y: 0, tilt: 10, cl: -18, cr: 40, ol: 0.0, or: 0.3, face: 'angry', sq: 1.06 }), 'snap'],
    [0.6, P({ x: 10, tilt: 8, cl: -8, cr: 40, ol: 0.15, or: 0.3, face: 'angry' })],
    [1, P({ x: 0 }), 'io'],
  ]),
  hurt: (k) => P({ x: -5 * (1 - k), tilt: -14 * (1 - k), y: 0, cl: 60, cr: 60, ol: 0.9, or: 0.9, face: 'ouch', sq: 1.04 + 0.06 * (1 - k) }),
  fly: () => P({ y: -10, tilt: -50, cl: 80, cr: 80, ol: 1, or: 1, face: 'ouch', legs: 1 }),
  // on its back, legs and pincers wiggling
  down: (t) => P({ lie: 1, y: 0, cl: 40 + 14 * Math.sin(t * 12), cr: 40 - 14 * Math.sin(t * 12), ol: 0.5, or: 0.5, face: 'ko', legs: 1, ph: t * 2 }),
  getup: (k) => keys(k, [[0, P({ lie: 1, face: 'ko', legs: 1, cl: 40, cr: 40 })], [0.6, P({ lie: 0.4, tilt: -20, y: -6, face: 'ouch', cl: 50, cr: 50 })], [1, P({})]]),
  flee: (ph) => SCUT(ph * 2),
};

const SHELL = '#3a8a9a', SHELLD = '#235f6e', SHELLH = '#78c8d0', CLAW = '#ee7a3a', CLAWD = '#b04a20', CLAWH = '#ffb070', BELLY = '#e8dcc0', LEGC = '#c85a30';

function leg(ctx, ox, oy, a1, a2, len) {
  ctx.save(); ctx.translate(ox, oy); ctx.rotate(a1 * DEG);
  cel(ctx, (c) => capsule(c, len, 3.4, 2.4), LEGC, '#8a3a1c', { lw: 2 });
  ctx.translate(0, len); ctx.rotate(a2 * DEG);
  cel(ctx, (c) => capsule(c, len * 0.9, 2.4, 1.6), LEGC, '#8a3a1c', { lw: 2 });
  ctx.restore();
}
function pincer(ctx, side, ang, open) {
  // the arm: a short forearm and a chunky two-jaw pincer (drawn along +y, rotated to point forward)
  ctx.save(); ctx.rotate(-ang * DEG);
  cel(ctx, (c) => capsule(c, 20, 6.4, 5.6), CLAW, CLAWD, { lw: 2.6 });
  ctx.translate(0, 20);
  const o = open * 38;
  ctx.save(); ctx.rotate(-o * DEG * 0.5);
  cel(ctx, (c) => { c.moveTo(-11, 0); c.quadraticCurveTo(-20, 22, -4, 44); c.quadraticCurveTo(0, 30, 7, 4); c.closePath(); }, CLAW, CLAWD, { hi: CLAWH, lw: 2.6 });
  ctx.restore();
  ctx.save(); ctx.rotate(o * DEG * 0.5);
  cel(ctx, (c) => { c.moveTo(11, 0); c.quadraticCurveTo(20, 22, 4, 44); c.quadraticCurveTo(0, 30, -7, 4); c.closePath(); }, CLAW, CLAWD, { hi: CLAWH, lw: 2.6 });
  ctx.restore();
  ctx.restore();
}
function eye(ctx, x, y, look, face) {
  ctx.save(); ctx.translate(x, y);
  ink(ctx, (c) => { c.moveTo(0, 2); c.lineTo(0, 12); }, 3.6, INK);
  ink(ctx, (c) => { c.moveTo(0, 2); c.lineTo(0, 12); }, 1.8, SHELLH);
  flat(ctx, (c) => circle(c, 0, 0, 7.4), '#f6f4ea', 2.4);
  ctx.fillStyle = INK;
  if (face === 'ko') { ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(4, -4); ctx.lineTo(-4, 4); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(look * 2.4, 0.4, face === 'ouch' ? 2 : 3.2, 0, TAU); ctx.fill(); }
  if (face === 'angry') { ctx.strokeStyle = INK; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(7, -2); ctx.stroke(); }
  ctx.restore();
}

export function draw(ctx, pose, o = {}) {
  const p = pose || STILL, f = o.facing || 1;
  ctx.save();
  ctx.scale(f, 1);
  // the crab is drawn standing on its legs: the feet at y 0; flipped onto its back (lie) it rests on its shell
  const lie = p.lie || 0;
  ctx.translate(p.x || 0, (p.y || 0) - 18 * (1 - lie) - 10 * lie);
  ctx.rotate(((p.tilt || 0) + lie * 180) * DEG);
  ctx.scale(1, p.sq || 1);
  const s = Math.sin((p.ph || 0) * TAU), c = Math.cos((p.ph || 0) * TAU);
  // the far legs, behind the body
  const lg = p.legs ? 1 : 0;
  for (let i = 0; i < 3; i++) {
    const w = (i - 1) * 16, k = (i % 2 ? 1 : -1) * (lg ? s : Math.sin(((o.t || 0) * 1.5 + i) * 1.4) * 0.3);
    leg(ctx, w - 4, 8, 20 + 14 * k + (lie ? 20 : 0), -50 - 16 * (lg ? c : 0), 14);
  }
  // the far pincer
  ctx.save(); ctx.translate(20, -2); pincer(ctx, -1, (p.cr ?? 20) + 40, p.or ?? 0.2); ctx.restore();
  // the shell: a wide domed oval, a belly rim, a few barnacle spots
  cel(ctx, (c) => ellipse(c, 0, 0, 33, 22), SHELL, SHELLD, { hi: SHELLH, lw: 3.2, detail: (c) => {
    c.fillStyle = 'rgba(14,60,70,0.4)'; for (const [x, y, r] of [[-14, -6, 4], [8, -12, 3.2], [16, 2, 3.6], [-4, 6, 3], [-22, 4, 3]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    c.strokeStyle = 'rgba(14,60,70,0.4)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-26, -2); c.quadraticCurveTo(0, -18, 26, -2); c.stroke();
    c.fillStyle = BELLY; c.beginPath(); c.ellipse(0, 18, 28, 7, 0, 0, TAU); c.fill();
  } });
  // the near legs
  for (let i = 0; i < 3; i++) {
    const w = (i - 1) * 16, k = (i % 2 ? -1 : 1) * (lg ? s : Math.sin(((o.t || 0) * 1.5 + i + 2) * 1.4) * 0.3);
    leg(ctx, w + 6, 12, 14 + 14 * k + (lie ? 20 : 0), -46 - 16 * (lg ? c : 0), 14);
  }
  // the eye stalks and the face
  const look = (p.eye || 0), face = p.face || 'neutral';
  eye(ctx, 16, -20, look, face); eye(ctx, 4, -23, look, face);
  ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath();
  if (face === 'angry' || face === 'neutral') { ctx.moveTo(14, -4); ctx.quadraticCurveTo(20, face === 'angry' ? -9 : -2, 26, -3); } else if (face === 'ouch') { ctx.moveTo(14, -6); ctx.quadraticCurveTo(20, 0, 26, -6); } else { ctx.moveTo(14, -3); ctx.lineTo(26, -3); }
  ctx.stroke();
  // the near pincer, over the body
  ctx.save(); ctx.translate(24, 4); pincer(ctx, 1, (p.cl ?? 20) + 40, p.ol ?? 0.2); ctx.restore();
  ctx.restore();
}
