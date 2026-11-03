// THE ELDER TREE (Skull Island, the Swamp of Despair's boss -- docs/SKULL_ISLAND.md): the oldest tree in the bog, huge, grumpy and mossy, with a great bark face,
// a beard of hanging moss, two enormous branch arms and a crown whose limbs fill the top of the screen.  It rises out of the mud when it wakes; the heroes' FIRE
// RING makes it (and every tree) flee -- it only gets singed, and it sinks back into the bog muttering.  Kid-friendly: grumpy, never scary.
// A code rig, the stand-in until its painted pack lands.  Local space: origin = the floor under the trunk, +x = facing, y down; ~340 px tall at scale 1.
// Clips: sleep(t) rise(k) idle(t) windup(k) swipe(k) slam(k) roar(k) hurt(k) scared(t) burn(t) flee(k) down(t).
import { TAU, DEG, cel, flat, ink, capsule, ellipse, circle, keys } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 340;
export const META = { id: 'elder', name: 'THE ELDER TREE', height: 340 };
export const HURTBOX = { x: 0, w: 110, h: 300 };

const STILL = { x: 0, y: 0, tilt: 0, a1: 12, a2: 18, face: 'angry', burn: 0, leaf: 0.2, sink: 0, mouth: 0, brow: 0, lids: 0, crown: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  sleep: (t) => P({ lids: 1, face: 'sleep', a1: 6, a2: 8, tilt: 0.6 * Math.sin(t * 0.8), leaf: 0.1, mouth: 0.1 + 0.08 * Math.sin(t * 1.1) }),
  rise: (k) => P({ sink: (1 - k) * 340, lids: 1 - k * 0.4, a1: 6, a2: 8, leaf: 0.8 * (1 - k), face: 'neutral' }),
  idle: (t) => P({ tilt: 1.2 * Math.sin(t * 0.9), a1: 12 + 4 * Math.sin(t * 1.1), a2: 18 + 5 * Math.sin(t * 1.3 + 1), leaf: 0.3, crown: Math.sin(t * 0.8) }),
  roar: (k) => P({ mouth: 1, face: 'angry', tilt: -3 * Math.sin(k * Math.PI), a1: 40 + 20 * Math.sin(k * 10), a2: 50 - 20 * Math.sin(k * 10), leaf: 1.2, brow: 1 }),
  windup: (k) => P({ tilt: -6 * k, a1: 24 + 30 * k, a2: 20 + 150 * k, face: 'angry', brow: 1, leaf: 0.5 * k }),
  swipe: (k) => keys(k, [
    [0, P({ tilt: -6, a1: 54, a2: 170, face: 'angry', brow: 1 })],
    [0.3, P({ tilt: 8, a1: 10, a2: -38, face: 'angry', brow: 1, leaf: 1 }), 'snap'],
    [0.66, P({ tilt: 6, a1: 14, a2: -28, face: 'angry', brow: 1 })],
    [1, P({}), 'io'],
  ]),
  // both arms high, then both slammed into the ground (the root wave)
  slam: (k) => keys(k, [
    [0, P({ a1: 165, a2: 165, tilt: -4, face: 'angry', brow: 1 })],
    [0.34, P({ a1: -6, a2: -6, tilt: 5, face: 'angry', brow: 1, leaf: 1.4 }), 'snap'],
    [0.7, P({ a1: 4, a2: 4, tilt: 3, face: 'angry', brow: 1 })],
    [1, P({}), 'io'],
  ]),
  hurt: (k) => P({ tilt: -4 * (1 - k), a1: 50 * (1 - k) + 12, a2: 60 * (1 - k) + 18, face: 'ouch', leaf: 1.2 * (1 - k), mouth: 0.6 * (1 - k) }),
  // the fire ring blast: wide eyes, mouth open, singed
  scared: (t) => P({ face: 'scared', mouth: 0.8, a1: 120 + 10 * Math.sin(t * 9), a2: 120 - 10 * Math.sin(t * 9), leaf: 1.4, burn: 0.5, tilt: 2 * Math.sin(t * 12) }),
  burn: (t) => P({ face: 'burn', mouth: 1, a1: 150 + 18 * Math.sin(t * 13), a2: 150 - 18 * Math.sin(t * 13 + 1), leaf: 1.4, burn: 1, tilt: 3 * Math.sin(t * 11) }),
  flee: (k) => P({ face: 'burn', mouth: 1, a1: 140, a2: 140, leaf: 1.2, burn: 1 - 0.5 * k, sink: k * 340, tilt: 2 }),
  down: (t) => P({ face: 'ouch', a1: 30, a2: 30, leaf: 0.3, lids: 0.5, tilt: Math.sin(t * 2) }),
};

const BARK = '#4a3a32', BARKD = '#281e1c', BARKH = '#806a5a', LEAF = '#3a6a46', LEAFD = '#234630', LEAFH = '#6ea45c', MOSS = '#7c9c5a';

function flame(ctx, x, y, s, t, seed) {
  const sw = Math.sin(t * 11 + seed) * 4 * s, h = (34 + 10 * Math.sin(t * 13 + seed * 2)) * s;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(-10 * s, 0); ctx.quadraticCurveTo(-13 * s, -h * 0.5, sw, -h); ctx.quadraticCurveTo(13 * s, -h * 0.5, 10 * s, 0); ctx.closePath();
  ctx.fillStyle = '#ff7a1e'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-6 * s, 0); ctx.quadraticCurveTo(-7 * s, -h * 0.35, sw * 0.6, -h * 0.65); ctx.quadraticCurveTo(7 * s, -h * 0.35, 6 * s, 0); ctx.closePath(); ctx.fillStyle = '#ffd84a'; ctx.fill();
  ctx.restore();
}
// an enormous branch arm: a tapered limb from the shoulder, rotated forward by `ang` degrees (0 = hanging down, 90 = straight out, 180 = up), a four-twig hand
function arm(ctx, sx, sy, ang, len, far) {
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(-ang * DEG);
  const c0 = far ? '#392c27' : BARK, c1 = far ? '#201816' : BARKD;
  cel(ctx, (c) => capsule(c, len, 20, 9), c0, c1, { hi: far ? undefined : BARKH, lw: 3.6 });
  // moss on the shoulder-side
  if (!far) { ctx.fillStyle = 'rgba(80,120,50,0.6)'; ctx.beginPath(); ctx.ellipse(-8, len * 0.3, 7, 16, 0, 0, TAU); ctx.fill(); }
  ctx.translate(0, len);
  for (const [a, l] of [[-46, 30], [-15, 38], [15, 38], [46, 30]]) { ctx.save(); ctx.rotate(a * DEG); cel(ctx, (c) => capsule(c, l, 6.4, 2.4), c0, c1, { lw: 2.6 }); ctx.restore(); }
  ctx.restore();
}
function eye(ctx, x, y, r, kind, lids, t) {
  ctx.save(); ctx.translate(x, y);
  flat(ctx, (c) => circle(c, 0, 0, r), kind === 'burn' ? '#fff6d8' : '#f6f2e0', 3);
  ctx.fillStyle = INK;
  if (kind === 'ouch') { ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(6, 0); ctx.lineTo(-8, 6); ctx.stroke(); }
  else if (kind === 'scared' || kind === 'burn') { ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, TAU); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(4, 1, 6.6, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -1.6, 2, 0, TAU); ctx.fill(); }
  // the lid
  if (lids > 0.02) { ctx.fillStyle = BARK; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.rect(-r - 2, -r - 2, 2 * r + 4, (2 * r + 4) * Math.min(1, lids)); ctx.fill(); ctx.stroke(); }
  ctx.restore();
  void t;
}

export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {}), f = o.facing || 1, t = o.t || 0, S = o.scale || 1;
  ctx.save();
  ctx.scale(f * S, S);
  ctx.translate(p.x || 0, (p.y || 0) + (p.sink || 0));
  // the great roots: spreading out of the mud
  for (const [rx, ry, w, a] of [[-132, 0, 40, 0.1], [-84, 4, 44, 0.05], [78, 4, 44, -0.05], [128, 0, 40, -0.1], [-4, 10, 52, 0]]) {
    cel(ctx, (c) => { c.moveTo(rx - w, ry + 2); c.quadraticCurveTo(rx - w * 0.2, ry - 40, rx + w * 0.4, ry - 24); c.quadraticCurveTo(rx + w * 1.1, ry - 10, rx + w * 1.5 * (rx > 0 ? 1 : -0.4), ry + 5); c.quadraticCurveTo(rx, ry + 12, rx - w, ry + 2); c.closePath(); }, BARK, BARKD, { hi: BARKH, lw: 3.2 });
    void a;
  }
  ctx.rotate((p.tilt || 0) * DEG * 0.6);
  // the far arm
  arm(ctx, -46, -206, p.a1, 150, true);
  // the trunk: a great barrel, wide at the foot, with the crown's neck above
  cel(ctx, (c) => {
    c.moveTo(-84, 2); c.quadraticCurveTo(-62, -60, -54, -150); c.quadraticCurveTo(-60, -214, -34, -250); c.lineTo(40, -252);
    c.quadraticCurveTo(62, -214, 56, -150); c.quadraticCurveTo(64, -60, 92, 2); c.quadraticCurveTo(4, 18, -84, 2); c.closePath();
  }, BARK, BARKD, { hi: BARKH, hk: 0.5, lw: 4, detail: (c) => {
    c.strokeStyle = 'rgba(20,12,10,0.42)'; c.lineWidth = 2.4;
    for (let i = 0; i < 9; i++) { const x = -52 + i * 13; c.beginPath(); c.moveTo(x, -250); c.quadraticCurveTo(x + 6 - (i % 2) * 12, -130, x + (i - 4) * 3, 0); c.stroke(); }
    c.fillStyle = 'rgba(70,110,44,0.6)'; for (const [x, y, rx, ry] of [[-40, -70, 16, 9], [50, -50, 13, 8], [-30, -210, 12, 7]]) { c.beginPath(); c.ellipse(x, y, rx, ry, 0.3, 0, TAU); c.fill(); }
    if (p.burn) { c.fillStyle = `rgba(20,10,8,${0.4 * p.burn})`; c.fillRect(-100, -260, 220, 270); }
  } });
  // the hollow where the stump would be, and a knot
  flat(ctx, (c) => ellipse(c, -20, -52, 10, 16), '#140d0b', 2.4);
  // the face: big brows, big eyes, a knotty nose, a mouth, a beard of moss
  const kind = p.face;
  eye(ctx, -16, -190, 17, kind, p.lids, t); eye(ctx, 26, -192, 17, kind, p.lids, t);
  ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 8;
  const bw = kind === 'angry' ? 1 : kind === 'scared' || kind === 'burn' ? -0.6 : kind === 'ouch' ? -0.2 : 0.3;
  for (const [x0, x1, s] of [[-36, -2, 1], [8, 46, -1]]) { ctx.beginPath(); ctx.moveTo(x0, -210 + bw * 7 * (s > 0 ? 1 : -1) * -1); ctx.lineTo(x1, -210 + bw * 7 * (s > 0 ? 1 : -1)); ctx.stroke(); }
  ctx.strokeStyle = BARKH; ctx.lineWidth = 2.6;
  for (const [x0, x1, s] of [[-36, -2, 1], [8, 46, -1]]) { ctx.beginPath(); ctx.moveTo(x0, -212 + bw * 7 * (s > 0 ? 1 : -1) * -1); ctx.lineTo(x1, -212 + bw * 7 * (s > 0 ? 1 : -1)); ctx.stroke(); }
  flat(ctx, (c) => ellipse(c, 5, -152, 11, 9), BARKD, 2.6);
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.fillStyle = '#120a08';
  const mo = p.mouth || 0;
  ctx.beginPath();
  if (mo > 0.2 || kind === 'burn' || kind === 'scared') { ctx.ellipse(6, -118, 22 + 8 * mo, 10 + 24 * mo, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#7a2a24'; ctx.beginPath(); ctx.ellipse(6, -108 + 6 * mo, 12 + 4 * mo, 5 + 8 * mo, 0, 0, TAU); ctx.fill(); }
  else if (kind === 'angry') { ctx.moveTo(-26, -112); ctx.quadraticCurveTo(6, -134, 38, -112); ctx.stroke(); ctx.fillStyle = '#efe6cc'; for (const x of [-12, 6, 24]) { ctx.beginPath(); ctx.moveTo(x - 5, -121); ctx.lineTo(x + 5, -121); ctx.lineTo(x, -108); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
  else if (kind === 'sleep') { ctx.moveTo(-18, -116); ctx.quadraticCurveTo(6, -108, 30, -116); ctx.stroke(); }
  else { ctx.moveTo(-22, -116); ctx.quadraticCurveTo(6, -126, 34, -116); ctx.stroke(); }
  // the beard
  for (let i = 0; i < 9; i++) {
    const bx = -48 + i * 12, bl = 46 + 30 * Math.abs(Math.sin(i * 1.7)), sw = Math.sin(t * 1.6 + i) * 4;
    ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(bx, -108); ctx.quadraticCurveTo(bx + sw, -108 + bl * 0.55, bx + sw * 1.4, -108 + bl); ctx.stroke();
    ctx.strokeStyle = MOSS; ctx.lineWidth = 3.6; ctx.stroke();
  }
  // the crown: clumps of leaves and three big limbs reaching out across the top of the screen
  const lk = p.leaf, shake = Math.sin(t * 22) * 3 * lk, sw = (p.crown || 0) * 6;
  for (const [x0, y0, x1, y1] of [[-30, -250, -190, -318], [34, -250, 196, -320], [0, -254, -20, -330]]) {
    ctx.strokeStyle = INK; ctx.lineWidth = 26; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 - 50 + sw, x1, y1); ctx.stroke();
    ctx.strokeStyle = BARK; ctx.lineWidth = 19; ctx.stroke(); ctx.strokeStyle = BARKH; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0, y0 - 7); ctx.quadraticCurveTo((x0 + x1) / 2, y0 - 57 + sw, x1, y1 - 7); ctx.stroke();
  }
  for (const [cx, cy, r] of [[-206, -322, 42], [-150, -338, 46], [-96, -330, 40], [-46, -350, 48], [10, -346, 50], [62, -352, 46], [118, -336, 46], [170, -332, 44], [214, -318, 40], [-120, -300, 34], [136, -298, 34]]) {
    cel(ctx, (c) => circle(c, cx + shake * (cx > 0 ? 1 : -1), cy + (p.crown || 0) * 2, r), LEAF, LEAFD, { hi: LEAFH, lw: 3.6 });
  }
  for (const [mx, my, ml] of [[-190, -296, 70], [-120, -282, 56], [-60, -308, 66], [70, -312, 60], [130, -280, 76], [196, -290, 64]]) {
    const sw2 = Math.sin(t * 1.4 + mx) * 5;
    ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo(mx + sw2, my + ml * 0.55, mx + sw2 * 1.4, my + ml); ctx.stroke(); ctx.strokeStyle = MOSS; ctx.lineWidth = 3.6; ctx.stroke();
  }
  if (lk > 0.3) { ctx.fillStyle = LEAF; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; for (let i = 0; i < 6; i++) { const u = ((t * 1.3 + i * 0.17) % 1); ctx.beginPath(); ctx.ellipse(-150 + i * 60 + Math.sin(t * 4 + i) * 8, -300 + u * 220, 6, 3.2, u * 6 + i, 0, TAU); ctx.fill(); ctx.stroke(); } }
  // the front arm, over the trunk
  arm(ctx, 44, -200, p.a2, 158, false);
  if (p.burn > 0.01) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 * p.burn; ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.ellipse(0, -290, 240, 90, 0, 0, TAU); ctx.fill(); ctx.restore();
    for (const [fx, fy, fs] of [[-170, -340, 1.1], [-100, -352, 1.4], [-30, -372, 1.6], [40, -372, 1.7], [110, -352, 1.4], [176, -338, 1.1], [0, -300, 1.2]]) flame(ctx, fx, fy, fs * p.burn, t, fx);
  }
  ctx.restore();
}
