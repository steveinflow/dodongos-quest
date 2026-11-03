// SWAMP TREE (Skull Island, the Swamp of Despair -- docs/SKULL_ISLAND.md): a black, gnarled tree that walks on its roots, with a grumpy bark face, a crown of
// dripping moss and two branch arms with twig fingers.  Normal hits only rattle its leaves; FIRE sets its crown alight and it runs off, yelping (kid-friendly:
// it is only singed, and it comes back as a sapling next spring).  Saplings are the same rig, small and cute (o.small: bigger eyes, lighter leaves).
// A code rig, the stand-in until its painted pack lands.  Local space: origin = the floor under it, +x = facing, y down; ~168 px tall at scale 1.
// Clips: idle(t) walk(ph) windup(k) swipe(k) hurt(k) burn(t) flee(ph) grow(k) taunt(t).
import { TAU, DEG, cel, flat, ink, capsule, ellipse, circle, keys, lerp } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 184;
export const META = { id: 'swamptree', name: 'SWAMP TREE', height: 184 };
export const HURTBOX = { x: 0, w: 52, h: 168 };

const STILL = { x: 0, y: 0, tilt: 0, sq: 1, ph: 0, a1: 16, a2: 24, face: 'angry', burn: 0, leaf: 0, lean: 0, sink: 0, root: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  idle: (t) => P({ tilt: 1.4 * Math.sin(t * 1.3), a1: 14 + 4 * Math.sin(t * 1.6), a2: 22 + 5 * Math.sin(t * 1.4 + 1), leaf: 0.3 }),
  walk: (ph) => P({ ph, y: -Math.abs(Math.sin(ph * TAU)) * 3, tilt: 3 * Math.sin(ph * TAU), a1: 22 + 12 * Math.sin(ph * TAU), a2: 28 - 12 * Math.sin(ph * TAU), leaf: 0.5, root: 1 }),
  taunt: (t) => P({ tilt: 2 * Math.sin(t * 6), a1: 70 + 20 * Math.sin(t * 7), a2: 70 - 20 * Math.sin(t * 7), face: 'angry', leaf: 0.6 }),
  // the swipe: the front branch rears back and up (the wind-up shows what is coming), then slams down across the front
  windup: (k) => P({ lean: -6 * k, tilt: -5 * k, a1: 20 + 40 * k, a2: 24 + 150 * k, face: 'angry', leaf: 0.4 * k, y: 1.5 * k }),
  swipe: (k) => keys(k, [
    [0, P({ lean: -6, tilt: -5, a1: 60, a2: 174, face: 'angry' })],
    [0.3, P({ lean: 10, tilt: 8, a1: 10, a2: -30, face: 'angry', y: 0, leaf: 1 }), 'snap'],
    [0.62, P({ lean: 8, tilt: 6, a1: 14, a2: -22, face: 'angry' })],
    [1, P({}), 'io'],
  ]),
  // normal hits only rattle it: leaves fly, the branches flap
  hurt: (k) => P({ tilt: -9 * (1 - k), lean: -4 * (1 - k), a1: 52 * (1 - k) + 16, a2: 60 * (1 - k) + 24, face: 'ouch', leaf: 1.4 * (1 - k), y: 0 }),
  // set alight: arms up, flailing, flames on the crown
  burn: (t) => P({ tilt: 6 * Math.sin(t * 14), a1: 150 + 25 * Math.sin(t * 17), a2: 150 - 25 * Math.sin(t * 17 + 1), face: 'burn', burn: 1, leaf: 1.2, root: 1, y: -Math.abs(Math.sin(t * 10)) * 4 }),
  flee: (ph) => P({ ph, y: -Math.abs(Math.sin(ph * TAU * 1.6)) * 5, tilt: 7 * Math.sin(ph * TAU * 1.6), a1: 150 + 20 * Math.sin(ph * 30), a2: 150 - 20 * Math.sin(ph * 30), face: 'burn', burn: 1, leaf: 1, root: 1 }),
  grow: (k) => P({ sq: 0.2 + 0.8 * k, sink: (1 - k) * 40, a1: 10, a2: 10, face: 'neutral', leaf: 0 }),
  fly: () => P({ tilt: -20, a1: 120, a2: 120, face: 'ouch', leaf: 1.4 }),
  down: (t) => P({ tilt: -4, a1: 40, a2: 40, face: 'ouch', leaf: 0.3 + 0.2 * Math.sin(t * 3) }),
};

const BARK = '#4c3b33', BARKD = '#2a201e', BARKH = '#7e6858', LEAF = '#3c6e48', LEAFD = '#25472f', LEAFH = '#72a85e', MOSS = '#7a9a58';

function flame(ctx, x, y, s, t, seed) {
  const sw = Math.sin(t * 11 + seed) * 3 * s, h = (24 + 8 * Math.sin(t * 13 + seed * 2)) * s;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(-7 * s, 0); ctx.quadraticCurveTo(-9 * s, -h * 0.5, sw, -h); ctx.quadraticCurveTo(9 * s, -h * 0.5, 7 * s, 0); ctx.closePath();
  ctx.fillStyle = '#ff7a1e'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4 * s, 0); ctx.quadraticCurveTo(-5 * s, -h * 0.35, sw * 0.6, -h * 0.65); ctx.quadraticCurveTo(5 * s, -h * 0.35, 4 * s, 0); ctx.closePath(); ctx.fillStyle = '#ffd84a'; ctx.fill();
  ctx.restore();
}
// a branch arm: a tapered limb hanging from the shoulder, rotated forward by `ang` degrees, three twig fingers at the end
function arm(ctx, sx, sy, ang, len, far) {
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(-ang * DEG);
  const c0 = far ? '#3a2d28' : BARK, c1 = far ? '#231a18' : BARKD;
  cel(ctx, (c) => capsule(c, len, 8.5, 4.4), c0, c1, { hi: far ? undefined : BARKH, lw: 2.8 });
  ctx.translate(0, len);
  for (const [a, l] of [[-34, 15], [4, 19], [38, 14]]) { ctx.save(); ctx.rotate(a * DEG); cel(ctx, (c) => capsule(c, l, 3.4, 1.4), c0, c1, { lw: 2.2 }); ctx.restore(); }
  // a leaf or two on the elbow
  ctx.restore();
}
function face(ctx, kind, small, t) {
  const big = small ? 1.28 : 1;
  ctx.save(); ctx.translate(2, -13); ctx.translate(10, -80); ctx.scale(1.38, 1.38); ctx.translate(-10, 80);
  // eyes
  for (const [ex, ey] of [[2, -86], [19, -88]]) {
    ctx.save(); ctx.translate(ex, ey);
    flat(ctx, (c) => circle(c, 0, 0, 7.4 * big), '#f6f2e0', 2.4);
    ctx.fillStyle = INK;
    if (kind === 'ouch') { ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(3, 0); ctx.lineTo(-4, 3); ctx.stroke(); }
    else if (kind === 'burn') { ctx.beginPath(); ctx.arc(1, 0, 2.2, 0, TAU); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(2.2, 0.6, (kind === 'angry' ? 3.2 : 2.6) * big, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(3, -0.6, 1, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  // brows: thick bark ridges
  ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 4.6;
  const br = kind === 'angry' ? [[-5, -99, 8, -93], [12, -95, 26, -100]] : kind === 'burn' || kind === 'scared' ? [[-4, -96, 8, -99], [12, -100, 25, -97]] : kind === 'ouch' ? [[-5, -94, 8, -97], [12, -97, 25, -94]] : [[-5, -97, 8, -96], [12, -97, 25, -97]];
  for (const [a, b, c, d] of br) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
  ctx.strokeStyle = BARKH; ctx.lineWidth = 1.6; for (const [a, b, c, d] of br) { ctx.beginPath(); ctx.moveTo(a, b - 1); ctx.lineTo(c, d - 1); ctx.stroke(); }
  // nose knot and mouth
  flat(ctx, (c) => ellipse(c, 11, -78, 4.4, 3.4), BARKD, 2);
  ctx.strokeStyle = INK; ctx.lineWidth = 2.8; ctx.fillStyle = '#120c0a';
  ctx.beginPath();
  if (kind === 'ouch') { ctx.ellipse(11, -66, 5.4, 6.4, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  else if (kind === 'burn') { ctx.ellipse(11, -65, 7, 9 + Math.sin(t * 20) * 1.4, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  else if (kind === 'angry') { ctx.moveTo(-2, -64); ctx.quadraticCurveTo(11, -72, 24, -64); ctx.stroke(); ctx.fillStyle = '#efe6cc'; for (const x of [2, 12, 20]) { ctx.beginPath(); ctx.moveTo(x - 2.4, -67 + (x === 12 ? 1 : 0)); ctx.lineTo(x + 2.4, -67 + (x === 12 ? 1 : 0)); ctx.lineTo(x, -62); ctx.closePath(); ctx.fill(); } }
  else { ctx.moveTo(0, -66); ctx.quadraticCurveTo(11, small ? -60 : -68, 22, -66); ctx.stroke(); }
  ctx.restore();
}

export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {}), f = o.facing || 1, t = o.t || 0, small = !!o.small, S = o.scale || 1;
  ctx.save();
  ctx.scale(f * S, S);
  ctx.translate(p.x || 0, (p.y || 0) + (p.sink || 0));
  const lw = o.leafPal ? o.leafPal : null; void lw;
  // roots (the feet): three gnarled roots that shuffle
  const s = Math.sin((p.ph || 0) * TAU);
  for (const [rx, k] of [[-24, 1], [2, -1], [26, 1]]) {
    const lift = p.root ? Math.max(0, k * s) * 6 : 0;
    cel(ctx, (c) => { c.moveTo(rx - 14, 0); c.quadraticCurveTo(rx - 4, -14 - lift, rx + 2, -8 - lift); c.quadraticCurveTo(rx + 14, -4 - lift, rx + 20, 2 - lift * 0.5); c.quadraticCurveTo(rx + 4, 5, rx - 14, 0); c.closePath(); }, BARK, BARKD, { hi: BARKH, lw: 2.8 });
  }
  ctx.rotate(((p.tilt || 0) + (p.lean || 0) * 0.5) * DEG);
  ctx.scale(1, p.sq || 1);
  // the far arm
  arm(ctx, -26, -100, p.a1, 58, true);
  // the trunk
  cel(ctx, (c) => {
    c.moveTo(-34, -4); c.quadraticCurveTo(-26, -30, -20, -74); c.quadraticCurveTo(-24, -108, -12, -134); c.lineTo(28, -134);
    c.quadraticCurveTo(27, -88, 30, -60); c.quadraticCurveTo(35, -26, 40, -4); c.quadraticCurveTo(2, 7, -34, -4); c.closePath();
  }, BARK, BARKD, { hi: BARKH, hk: 0.5, lw: 3.4, detail: (c) => {
    c.strokeStyle = 'rgba(20,12,10,0.45)'; c.lineWidth = 1.8;
    for (let i = 0; i < 6; i++) { const x = -24 + i * 11; c.beginPath(); c.moveTo(x, -130); c.quadraticCurveTo(x + 3 - (i % 2) * 6, -66, x + (i - 2.5) * 1.5, -4); c.stroke(); }
    c.fillStyle = 'rgba(60,90,40,0.55)'; c.beginPath(); c.ellipse(-16, -40, 9, 5, 0.3, 0, TAU); c.fill(); c.beginPath(); c.ellipse(24, -26, 7, 4, -0.3, 0, TAU); c.fill();
    if (p.burn) { c.fillStyle = `rgba(20,10,8,${0.4 * p.burn})`; c.fillRect(-40, -136, 90, 140); }
  } });
  // a knot hole low on the trunk
  flat(ctx, (c) => ellipse(c, -6, -34, 5, 7), '#150e0c', 2);
  face(ctx, p.face, small, t);
  // the crown: clumps of leaves, moss drooping from the rim
  const lk = (p.leaf || 0), shake = Math.sin(t * 22) * 2.2 * lk;
  for (const [cx, cy, r] of [[-22, -140, 22], [20, -144, 25], [-2, -160, 26], [-34, -154, 17], [36, -156, 17]]) {
    cel(ctx, (c) => circle(c, cx + shake * (cx > 0 ? 1 : -1), cy, r * (small ? 1.04 : 1)), small ? '#58a060' : LEAF, small ? '#2c6a3c' : LEAFD, { hi: small ? '#98d078' : LEAFH, lw: 3 });
  }
  if (!small) for (const [mx, ml, w] of [[-34, 40, 1], [-14, 26, -1], [16, 34, 1], [36, 30, -1], [4, 22, 1]]) {
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(mx, -138); ctx.quadraticCurveTo(mx + w * 5 + Math.sin(t * 2 + mx) * 2, -138 + ml * 0.6, mx + w * 2, -138 + ml); ctx.stroke();
    ctx.strokeStyle = MOSS; ctx.lineWidth = 2.6; ctx.stroke();
  }
  // leaves flying when rattled
  if (lk > 0.3) { ctx.fillStyle = LEAF; ctx.strokeStyle = INK; ctx.lineWidth = 1.4; for (let i = 0; i < 4; i++) { const u = ((t * 1.4 + i * 0.27) % 1); ctx.beginPath(); ctx.ellipse(-30 + i * 22 + Math.sin(t * 5 + i) * 6, -150 + u * 100, 4.4, 2.4, u * 6 + i, 0, TAU); ctx.fill(); ctx.stroke(); } }
  // the front arm, over the trunk
  arm(ctx, 31, -98, p.a2, 62, false);
  // fire on the crown
  if (p.burn > 0.01) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * p.burn; ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.ellipse(0, -140, 70, 56, 0, 0, TAU); ctx.fill(); ctx.restore();
    for (const [fx, fy, fs] of [[-24, -154, 1.2], [4, -178, 1.5], [28, -160, 1.2], [-8, -142, 1], [18, -138, 0.9]]) flame(ctx, fx, fy, fs * (small ? 0.8 : 1), t, fx);
  }
  ctx.restore();
}
