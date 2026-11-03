// THE LEVIATHAN's COIL (Skull Island Stage 1, the user's drawing docs/refs/leviathan_drawing.png): the serpent's body wound into a big
// oval spiral (~2.6 turns), every ring lined with jagged pale teeth on both sides, and the tail running from the outer ring to NECKBASE,
// where the neck (./leviathan.js) rises.  A code-drawn stand-in for the painted builder's 'leviathan_coil' pack (two drawings, 'idle' and
// 'flash' -- its spikes lit, the whirlpool's warning); src/chars/leviathan_coil3d.js wraps it.
//   local space: origin = the coil's centre, +x = facing, y down; ~375 x 275 px at scale 1.  Export NECKBASE: where the neck attaches.
//   Clips: idle (static), flash (static).  Options: o.spin (radians: the stage turns it in the whirlpool), o.lit 0..1 (a blend toward the
//   'flash' look -- the stage eases it in, never pops it: flash safety).
import { TAU, clamp } from '../rig.js';
import { INK } from '../config.js';

export const META = { id: 'leviathan_coil', name: 'THE LEVIATHAN', height: 275 };
export const NECKBASE = [107, 139];
export const EXPORTS = { NECKBASE };
export const ANIM = { idle: { lit: 0 }, flash: { lit: 1 } };

const C = { body: '#1f4f9e', dark: '#133570', hi: '#3f7ad0', belly: '#8fb8e8', tooth: '#eef4ff', lit: '#bff4ff' };
const T0 = 3.27, T1 = 0.75 + TAU * 3;   // (the spiral's inner start .. outer end, radians: it ends at the lower right, by NECKBASE)
const RX = 1.36;
function at(th) { const f = (th - T0) / (T1 - T0), r = 22 + 104 * f; return [Math.cos(th) * r * RX, Math.sin(th) * r]; }
function width(th) { return 16 + 36 * (th - T0) / (T1 - T0); }

let PTS = null;
function pts() {
  if (PTS) return PTS;
  const out = [];
  for (let th = T0; th <= T1 + 1e-6; th += 0.14) out.push([...at(th), width(th)]);
  // the tail: from the outer end down to NECKBASE (where the neck goes up), widening to the neck's 60 px
  const e = at(T1), n = 8;
  for (let i = 1; i <= n; i++) { const u = i / n; out.push([e[0] + (NECKBASE[0] - e[0]) * u, e[1] + (NECKBASE[1] - e[1]) * u - 18 * Math.sin(u * Math.PI), 52 + 8 * u]); }
  return (PTS = out);
}

export function draw(ctx, pose, o = {}) {
  const f = o.facing || 1, S = o.scale || 1, lit = clamp(o.lit ?? (pose && pose.lit) ?? 0, 0, 1), P = pts(), n = P.length - 1;
  const ph = (((o.spin || 0) * 2.2) % 1 + 1) % 1;   // (o.spin: the whirl -- the rows of teeth run along the rings like a wheel turning; the coil and its tail stay put)
  ctx.save(); ctx.scale(f * S, S);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const nrm = (i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1; return [ty / L, -tx / L]; };
  // the teeth on both edges of every ring (drawn first: the tube covers their roots)
  ctx.fillStyle = lit > 0.01 ? mixHex(C.tooth, C.lit, lit) : C.tooth; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
  for (let i = 2; i < n - 9; i += 1) {
    const [nx, ny] = nrm(i), w = P[i][2] / 2, h = 7 + P[i][2] * 0.2, [xa, ya] = P[i], [xb, yb] = P[i + 1], [xc, yc] = P[i + 2];
    const x = xa + (xb - xa) * ph, y = ya + (yb - ya) * ph, x2 = xb + (xc - xb) * ph, y2 = yb + (yc - yb) * ph;
    for (const s of [1, -1]) {
      ctx.beginPath(); ctx.moveTo(x + s * nx * (w - 2), y + s * ny * (w - 2)); ctx.lineTo((x + x2) / 2 + s * nx * (w + h), (y + y2) / 2 + s * ny * (w + h)); ctx.lineTo(x2 + s * nx * (w - 2), y2 + s * ny * (w - 2)); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // the body: ink, dark, body, a lighter band along the top of each ring
  for (const [col, k, off] of [[INK, 1, 0], [C.dark, 0.9, 0], [C.body, 0.64, 2], [C.hi, 0.18, 7]]) {
    ctx.strokeStyle = col;
    for (let i = 0; i < n; i++) {
      const [nx, ny] = nrm(i), oo = off * P[i][2] / 50;
      ctx.lineWidth = P[i][2] * k + (col === INK ? 6 : 0);
      ctx.beginPath(); ctx.moveTo(P[i][0] + nx * oo, P[i][1] + ny * oo); ctx.lineTo(P[i + 1][0] + nx * oo, P[i + 1][1] + ny * oo); ctx.stroke();
    }
  }
  // the lit look: a pale glow line along the teeth rows (the whirlpool's warning -- a soft blend, never a flash)
  if (lit > 0.01) {
    ctx.globalAlpha = 0.5 * lit; ctx.strokeStyle = C.lit; ctx.lineWidth = 3;
    ctx.beginPath(); for (let i = 2; i < n - 9; i++) { const [nx, ny] = nrm(i), w = P[i][2] / 2 + 4; if (i === 2) ctx.moveTo(P[i][0] + nx * w, P[i][1] + ny * w); else ctx.lineTo(P[i][0] + nx * w, P[i][1] + ny * w); } ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
