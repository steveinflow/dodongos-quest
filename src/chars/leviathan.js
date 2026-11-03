// THE LEVIATHAN (Skull Island's Stage 1 mini-boss, the user's drawing docs/refs/leviathan_drawing.png): the NECK and HEAD of a huge
// spiral-coiled sea serpent -- a long deep-blue neck with a zig-zag spike ridge, a snake head with ONE glowing eye, a jaw of jagged
// teeth and TWO long fangs hanging straight down.  The coil it rises from is ./leviathan_coil.js (the stage draws it in the sea).
// A code-drawn stand-in built to the painted builder's contract (assets/sprites/leviathan, src/chars/leviathan3d.js):
//   local space: origin (0, 0) = NECKBASE (where the neck leaves the coil, kept behind the bulwark top), +x = facing, y down; scale 1.
//   Clips: idle(t) slamWind(k) slam(k: the hit drawing at k 6/14) stuck(t) snapWind(k) snap(k: the reach at k 3/16) whirl(t)
//          hurt(k: the yank free from the deck, recoiling) dizzy(t) sink(k: the neck shrinks back to neckBase)
//   Landmarks (point(pose, name)): neckBase head eye jaw fang0 fang1.   Exports: SLAM_TIPS (the two fang tips at the slam's hit), SNAP_HEAD
//   (the jaw at the snap's reach), META { height 230, hurtW 120, hurtH 110 }.
// Kid-friendly: toothy, not gory -- a grumpy, goggle-eyed sea dragon.  Perf: no gradients, no shadowBlur; ~0.4 ms a draw.
import { TAU, clamp, lerp } from '../rig.js';
import { INK } from '../config.js';

export const META = { id: 'leviathan', name: 'THE LEVIATHAN', height: 230, hurtW: 120, hurtH: 110 };
export const HURTBOX = { x: 0, w: 60, h: 110 };
export const SLAM_TIPS = [[253, 134], [231, 134]];   // (the two fang tips at the slam's hit drawing, px from neckBase: front, back)
export const SNAP_HEAD = [360, 100];   // (the jaw at the snap's reach)
export const EXPORTS = { SLAM_TIPS, SNAP_HEAD };

const C = { body: '#1f4f9e', dark: '#133570', hi: '#3f7ad0', belly: '#9cc4ee', bellyD: '#6d9ad0', tooth: '#eef4ff', toothD: '#b8c8e4', eye: '#ffe25a', eyeD: '#e0a020', mouth: '#5a1a3a' };
// the head, in its own frame (origin = the 'head' landmark, +x = snout, y down, pitch 0): the fangs' roots and lengths
const FANGS = [[46, 32, 82], [24, 33, 81]];   // (fang0 front, fang1 back: root x, root y, length -- TWO fangs, the user's drawing)
const EYE = [-16, -11], JAW = [2, 30];
const BURY = 22;   // (stuck: the head sinks this far as the fangs go into the planks -- the visible tips stay on the deck line)

const ease = (u) => u * u * (3 - 2 * u);
const STILL = { hx: 185, hy: -165, pitch: 0, jaw: 0.12, eye: 'open', bury: 0, droop: 0, shrink: 1 };
const P = (o) => Object.assign({}, STILL, o);
const IDLE = [185, -165], REAR = [105, -211], SLAM = [209, 20], WIND = [150, -40], REACH = [361, 69], WHIRL = [165, -178], DIZZY = [200, -95];

export const ANIM = {
  idle: (t) => P({ hx: IDLE[0] + 5 * Math.sin(t * 1.1), hy: IDLE[1] + 7 * Math.sin(t * 1.6), pitch: 0.04 * Math.sin(t * 1.3), jaw: 0.12 + 0.08 * Math.sin(t * 2.2) }),
  slamWind: (k) => { const e = ease(clamp(k, 0, 1)); return P({ hx: lerp(IDLE[0], REAR[0], e), hy: lerp(IDLE[1], REAR[1], e), pitch: -0.38 * e, jaw: lerp(0.12, 0.75, e), eye: 'wide' }); },
  slam: (k) => {
    const u = clamp(k / (6 / 14), 0, 1), e = u * u;
    if (u < 1) return P({ hx: lerp(REAR[0], SLAM[0], e), hy: lerp(REAR[1], SLAM[1], e), pitch: -0.38 * (1 - e), jaw: lerp(0.75, 0.25, e), eye: 'wide' });
    const v = (k - 6 / 14) / (8 / 14);
    return P({ hx: SLAM[0], hy: SLAM[1] + 4 * Math.sin(v * 9) * (1 - v), jaw: 0.25 + 0.1 * v, bury: Math.min(1, v * 3), eye: 'wide' });
  },
  stuck: (t) => P({ hx: SLAM[0] + 4 * Math.sin(t * 9), hy: SLAM[1] + 2 * Math.sin(t * 13), pitch: 0.05 * Math.sin(t * 9), jaw: 0.35 + 0.15 * Math.sin(t * 5), bury: 1, eye: 'wide' }),
  snapWind: (k) => { const e = ease(clamp(k, 0, 1)); return P({ hx: lerp(IDLE[0], WIND[0], e), hy: lerp(IDLE[1], WIND[1], e), pitch: 0.12 * e, jaw: lerp(0.12, 1, e), eye: 'wide' }); },
  snap: (k) => {
    const r = 3 / 16;
    if (k < r) { const u = clamp(k / r, 0, 1); return P({ hx: lerp(WIND[0], REACH[0], Math.pow(u, 0.7)), hy: lerp(WIND[1], REACH[1], u), pitch: 0.12 - 0.12 * u, jaw: 1, eye: 'wide' }); }
    const v = ease(clamp((k - r) / (1 - r), 0, 1));
    return P({ hx: lerp(REACH[0], IDLE[0], v), hy: lerp(REACH[1], IDLE[1], v), jaw: v < 0.15 ? 0 : 0.12 * v, eye: 'open' });
  },
  whirl: (t) => P({ hx: WHIRL[0] + 3 * Math.sin(t * 2), hy: WHIRL[1] + 4 * Math.sin(t * 3), pitch: 0.28, jaw: 0.7 + 0.2 * Math.sin(t * 7), eye: 'wide' }),
  hurt: (k) => { const e = ease(clamp(k, 0, 1)), j = Math.sin(clamp(k, 0, 1) * Math.PI); return P({ hx: lerp(SLAM[0], IDLE[0], e) - 14 * j, hy: lerp(SLAM[1], IDLE[1], e) - 16 * j, pitch: -0.3 * j, jaw: 0.55, bury: Math.max(0, 1 - k * 4), eye: 'squint' }); },
  dizzy: (t) => P({ hx: DIZZY[0] + 6 * Math.sin(t * 1.5), hy: DIZZY[1] + 6 * Math.sin(t * 2), pitch: 0.32 + 0.1 * Math.sin(t * 1.5), jaw: 0.45, eye: 'dizzy', droop: 0.22 * Math.sin(t * 2.2) }),
  sink: (k) => { const e = ease(clamp(k, 0, 1)); return P({ hx: lerp(DIZZY[0], 46, e), hy: lerp(DIZZY[1], 26, e), pitch: lerp(0.32, 0.6, e), jaw: lerp(0.45, 0.2, e), eye: 'dizzy', shrink: 1 - 0.25 * e }); },
};

const rot = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
/** a head-local point in neckBase space */
function hp(p, x, y) { const q = rot(x * p.shrink, y * p.shrink, p.pitch); return [p.hx + q[0], p.hy + BURY * p.bury + q[1]]; }
/** landmarks: local px, facing right, scale 1 (null for an unknown name) */
export function point(pose, name) {
  const p = Object.assign({}, STILL, pose || {});
  switch (name) {
    case 'neckBase': return [0, 0];
    case 'head': return [p.hx, p.hy + BURY * p.bury];
    case 'eye': return hp(p, EYE[0], EYE[1]);
    case 'jaw': return hp(p, JAW[0], JAW[1] + 10 * p.jaw);
    case 'fang0': case 'fang1': { const f = FANGS[+name[4]], a = f[2] - BURY * p.bury; return hp(p, f[0] + Math.sin(p.droop) * a, f[1] + a * Math.cos(p.droop)); }
    default: return null;
  }
}

/** the neck: a cubic from neckBase up and over into the back of the skull (pts: the centre line, base -> head) */
function neckPts(p) {
  const B = hp(p, -56, -2), [dx, dy] = rot(-1, 0, p.pitch), n = 18, pts = [];
  const P1 = [B[0] * 0.22, Math.min(-70, B[1] - 46)], P2 = [B[0] + dx * 84, B[1] + dy * 84 - 30];   // (it leans toward the head as it rises: an arch, not an elbow)
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
    pts.push([a * 0 + b * P1[0] + c * P2[0] + d * B[0], a * 0 + b * P1[1] + c * P2[1] + d * B[1]]);
  }
  return pts;
}

function drawNeck(ctx, p) {
  const pts = neckPts(p), n = pts.length - 1, w0 = 60 * p.shrink, w1 = 44 * p.shrink;
  const W = (i) => w0 + (w1 - w0) * (i / n);
  const nrm = (i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1; return [ty / L, -tx / L]; };   // (the dorsal side: up / back)
  // the ridge's spikes first (behind the tube): pale zig-zag teeth along the dorsal edge, like the drawing's
  ctx.fillStyle = C.tooth; ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
  for (let i = 1; i < n; i++) {
    const [nx, ny] = nrm(i), w = W(i) / 2, h = 19 + 5 * Math.sin(i * 2.3), [x, y] = pts[i], [x2, y2] = pts[i + 1];
    ctx.beginPath(); ctx.moveTo(x + nx * (w - 3), y + ny * (w - 3)); ctx.lineTo((x + x2) / 2 + nx * (w + h), (y + y2) / 2 + ny * (w + h)); ctx.lineTo(x2 + nx * (w - 3), y2 + ny * (w - 3)); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // the tube: ink, the dark side, the body, the pale belly on the inner side
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [col, k, off] of [[INK, 1, 0], [C.dark, 0.9, 0], [C.body, 0.62, 3], [C.belly, 0.26, -14]]) {
    ctx.strokeStyle = col;
    for (let i = 0; i < n; i++) {
      const [nx, ny] = nrm(i), o = off * (W(i) / 60);
      ctx.lineWidth = W(i) * k + (col === INK ? 7 : 0);
      ctx.beginPath(); ctx.moveTo(pts[i][0] + nx * o, pts[i][1] + ny * o); ctx.lineTo(pts[i + 1][0] + nx * o, pts[i + 1][1] + ny * o); ctx.stroke();
    }
  }
  // belly scale lines across the pale band
  ctx.strokeStyle = C.bellyD; ctx.lineWidth = 1.6;
  for (let i = 2; i < n; i += 1) { const [nx, ny] = nrm(i), w = W(i) * 0.13, [x, y] = pts[i], tx = -ny, ty = nx; ctx.beginPath(); ctx.moveTo(x - nx * 14 * (W(i) / 60) - tx * w, y - ny * 14 * (W(i) / 60) - ty * w); ctx.lineTo(x - nx * 14 * (W(i) / 60) + tx * w, y - ny * 14 * (W(i) / 60) + ty * w); ctx.stroke(); }
}

function zig(ctx, x0, x1, y, h, n, up) {   // a row of jagged teeth along y from x0 to x1 (up: pointing up)
  ctx.beginPath(); const dx = (x1 - x0) / n;
  for (let i = 0; i < n; i++) { const a = x0 + i * dx; ctx.moveTo(a, y); ctx.lineTo(a + dx / 2, y + (up ? -h : h) * (0.75 + 0.25 * ((i * 7) % 3) / 2)); ctx.lineTo(a + dx, y); }
  ctx.fillStyle = C.tooth; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();
}

function drawHead(ctx, p, t) {
  ctx.save(); ctx.translate(p.hx, p.hy + BURY * p.bury); ctx.rotate(p.pitch); ctx.scale(p.shrink, p.shrink);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const ja = 0.55 * p.jaw;   // (the lower jaw's hinge angle)
  // crown spikes (behind the skull)
  ctx.fillStyle = C.tooth; ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
  for (const [x, y, h, a] of [[-48, -18, 22, -2.3], [-30, -27, 20, -2.0], [-12, -30, 16, -1.8]]) { ctx.beginPath(); ctx.moveTo(x - 7, y + 3); ctx.lineTo(x + Math.cos(a) * h, y + Math.sin(a) * h); ctx.lineTo(x + 7, y + 3); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  // the lower jaw (hinged at the back, opens down)
  ctx.save(); ctx.translate(-36, 18); ctx.rotate(ja);
  ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(98, 6); ctx.quadraticCurveTo(104, 12, 96, 18); ctx.quadraticCurveTo(40, 30, -6, 16); ctx.closePath();
  ctx.fillStyle = C.dark; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = C.belly; ctx.beginPath(); ctx.moveTo(6, 14); ctx.quadraticCurveTo(50, 24, 92, 15); ctx.lineTo(90, 18); ctx.quadraticCurveTo(48, 29, 4, 18); ctx.closePath(); ctx.fill();
  if (p.jaw > 0.08) zig(ctx, 14, 94, 3, 9, 7, true);   // (the lower teeth)
  ctx.restore();
  // the mouth's inside, when open
  if (p.jaw > 0.08) { ctx.fillStyle = C.mouth; ctx.beginPath(); ctx.moveTo(-34, 18); ctx.lineTo(62, 20); ctx.lineTo(-36 + 98 * Math.cos(ja), 18 + 98 * Math.sin(ja)); ctx.closePath(); ctx.fill(); }
  // the skull: long, low, a ridge over the eye, a blunt snout
  const skull = (c) => { c.beginPath(); c.moveTo(-60, -2); c.quadraticCurveTo(-58, -26, -30, -30); c.quadraticCurveTo(10, -34, 30, -20); c.quadraticCurveTo(58, -14, 70, -2); c.quadraticCurveTo(76, 8, 66, 20); c.lineTo(-40, 22); c.quadraticCurveTo(-60, 16, -60, -2); c.closePath(); };
  skull(ctx); ctx.fillStyle = C.body; ctx.fill();
  ctx.save(); skull(ctx); ctx.clip(); ctx.fillStyle = C.dark; ctx.fillRect(-70, 6, 150, 20); ctx.fillStyle = C.hi; ctx.beginPath(); ctx.ellipse(-8, -22, 34, 7, -0.05, 0, TAU); ctx.fill(); ctx.restore();
  skull(ctx); ctx.lineWidth = 4.6; ctx.strokeStyle = INK; ctx.stroke();
  // the upper teeth: jagged, along the jaw line (the drawing's zig-zag)
  zig(ctx, -30, 64, 20, 10, 8, false);
  // a nostril and the brow ridge
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(58, -6, 3.2, 2, 0.3, 0, TAU); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-32, -22); ctx.quadraticCurveTo(-16, p.eye === 'wide' ? -30 : -24, 2, -20); ctx.stroke();
  // THE eye: one big glowing eye
  ctx.save(); ctx.translate(EYE[0], EYE[1]);
  if (p.eye === 'squint') { ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-11, 2); ctx.quadraticCurveTo(0, -5, 11, 2); ctx.stroke(); }
  else {
    const r = p.eye === 'wide' ? 12.5 : 10.5;
    ctx.fillStyle = C.eye; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.9, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = C.eyeD; ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 0.85, r * 0.42, 0, 0, Math.PI); ctx.fill();
    if (p.eye === 'dizzy') {   // a spiral turning in the eye
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath();
      for (let a = 0; a < TAU * 2.2; a += 0.3) { const q = a + t * 5, rr = 1 + a * 1.5; ctx.lineTo(Math.cos(q) * rr, Math.sin(q) * rr * 0.9); }
      ctx.stroke();
    } else { ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(2, 0, 2.8, r * 0.78, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-3, -4, 2.6, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
  // the two long fangs, hanging straight down from the upper jaw (shorter where they are buried in the deck)
  for (const [x, y, len] of FANGS) {
    const L = len - BURY * p.bury, s = Math.sin(p.droop), c = Math.cos(p.droop), tx = x + s * L, ty = y + c * L;
    ctx.beginPath(); ctx.moveTo(x - 5.5, y - 4); ctx.quadraticCurveTo(x - 4 + s * L * 0.5, y + c * L * 0.5, tx, ty); ctx.quadraticCurveTo(x + 4 + s * L * 0.5, y + c * L * 0.5, x + 5.5, y - 4); ctx.closePath();
    ctx.fillStyle = C.tooth; ctx.fill(); ctx.lineWidth = 2.8; ctx.strokeStyle = INK; ctx.stroke();
    ctx.strokeStyle = C.toothD; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + 2, y + 4); ctx.lineTo(x + 1 + s * L * 0.8, y + c * L * 0.8); ctx.stroke();
  }
  ctx.restore();
}

/** draw at neckBase = (0, 0).  o: { facing, scale, t } */
export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {}), f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  ctx.save(); ctx.scale(f * S, S);
  drawNeck(ctx, p);
  drawHead(ctx, p, t);
  ctx.restore();
}
