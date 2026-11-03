// THE KRAKEN's EYED TENTACLE (Skull Island Stage 2, the reworked fight -- docs/SKULL_ISLAND.md "The Kraken fight, reworked"): a purple
// suckered tentacle that bursts up through the deck, with a big eye near its tip and two smaller eyes along it (the eyes are its face).
// A code-drawn stand-in built to the painted builder's 'kraken_tentacle' contract (src/chars/kraken_tentacle3d.js wraps the pack):
//   local space: origin (0, 0) = the base on the deck (the middle of the hole it came out of), +x = facing, y down; ~250 px tall up.
//   Clips: popUp(k) idle(t) slapWind(k) slap(k: the tip hits the deck at ~+170 px at k 0.45) sweepWind(k) sweep(k: the tip runs low
//          from -200 to +200) grab(k) hold(t: the tip curled at 'hold') hurt(k: eyes squeezed shut) wilt(k: it droops and sinks)
//   Landmarks: tip eye base hold.   Exports SLAP_TIP (the tip at the slap's hit), HOLD (a held hero's hips).
// Kid-friendly: goggle eyes, a grumpy brow -- a silly sea noodle, not a horror.  Perf: no gradients; ~0.25 ms a draw.
import { TAU, clamp, lerp } from '../rig.js';
import { INK } from '../config.js';

export const META = { id: 'kraken_tentacle', name: 'TENTACLE', height: 250 };
export const HURTBOX = { x: 0, w: 30, h: 220 };

const C = { skin: '#8a3c9e', skinD: '#5c2476', skinH: '#b862c8', belly: '#e8b6dc', eye: '#fff6d8', iris: '#c050ff', brow: '#4a1a60' };
const N = 14;
const ease = (u) => u * u * (3 - 2 * u);
const STILL = { len: 250, lean: 0, curl: 0.5, wave: 0, sink: 0, eye: 1, mad: 0.4, flat: 0, phase: 0 };
const P = (o) => Object.assign({}, STILL, o);

// the centre line: from the base up, each segment turning a little more (lean: the base's tilt from straight up, + = toward +x;
// curl: the total extra turn toward +x along its length; wave: an S along it; flat: 0..1 how far it lies along the deck)
export const ANIM = {
  popUp: (k) => P({ len: 250 * ease(clamp(k, 0, 1)), lean: 0.1, curl: 0.2, mad: 0.8, wave: 0.15 * Math.sin(k * 9) }),
  idle: (t) => P({ lean: 0.12 * Math.sin(t * 1.4), curl: 0.55 + 0.25 * Math.sin(t * 1.9), wave: 0.18 * Math.sin(t * 2.6), phase: t * 2.6, eye: (t * 0.7) % 4 < 0.08 ? 0.1 : 1 }),
  slapWind: (k) => { const e = ease(clamp(k, 0, 1)); return P({ lean: -0.5 * e, curl: 0.55 - 0.9 * e, len: 250 + 14 * e, mad: 1 }); },
  slap: (k) => {
    const u = clamp(k / 0.25, 0, 1), e = u * u;   // (the tip hits the deck at k 0.25, as the painted pack's drawing 2 does)
    if (u < 1) return P({ lean: lerp(-0.5, 0.62, e), curl: lerp(-0.35, 2.65, e), mad: 1 });
    const v = clamp((k - 0.25) / 0.75, 0, 1);
    return P({ lean: lerp(0.62, 0.1, ease(v)), curl: lerp(2.65, 0.6, ease(v)), mad: 1 });
  },
  sweepWind: (k) => { const e = ease(clamp(k, 0, 1)); return P({ lean: -1.25 * e, curl: -0.3 * e, len: 250 - 30 * e, flat: e, mad: 1 }); },
  sweep: (k) => { const u = ease(clamp(k, 0, 1)); return P({ lean: lerp(-1.25, 1.25, u), curl: lerp(-0.3, 0.3, u), len: 220, flat: 1 - Math.sin(u * Math.PI) * 0.6, mad: 1 }); },
  grab: (k) => { const e = ease(clamp(k, 0, 1)); return P({ lean: 0.2 * e, curl: 0.55 + 1.85 * e, len: 250 - 50 * e, mad: 1 }); },
  hold: (t) => P({ lean: 0.2 + 0.04 * Math.sin(t * 3), curl: 2.4 + 0.08 * Math.sin(t * 5), len: 200, mad: 0.6 }),   // (the tip curled round a held hero at HOLD, ~90 px up)
  hurt: (k) => { const j = Math.sin(clamp(k, 0, 1) * Math.PI); return P({ lean: -0.35 * j, curl: 0.55 - 0.6 * j, eye: 0, mad: 0 }); },
  wilt: (k) => { const e = ease(clamp(k, 0, 1)); return P({ lean: 0.2 + 0.9 * e, curl: 0.6 + 1.2 * e, sink: clamp((k - 0.35) / 0.65, 0, 1), eye: 0, mad: 0 }); },
};

function line(p) {
  const out = [[0, 0]], seg = p.len / N;
  let x = 0, y = 0;
  for (let i = 1; i <= N; i++) {
    const u = i / N, a = -Math.PI / 2 + p.lean + p.curl * u * u + p.wave * Math.sin(u * 5 - p.phase) * u;
    // (flat: the body lies along the deck -- its height is squashed toward the floor)
    x += Math.cos(a) * seg; y += Math.sin(a) * seg * (1 - 0.8 * p.flat);
    out.push([x, Math.min(y, 0)]);
  }
  if (p.sink > 0) for (const q of out) q[1] += p.sink * 230;   // (it sinks back through the hole)
  return out;
}
const W0 = 50, W1 = 16;
const wAt = (i) => W0 + (W1 - W0) * (i / N);
function nrm(pts, i) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1; return [-ty / L, tx / L]; }

export function point(pose, name) {
  const p = Object.assign({}, STILL, pose || {}), pts = line(p);
  switch (name) {
    case 'base': return [0, 0];
    case 'tip': return pts[N];
    case 'eye': return pts[N - 2];
    case 'hold': return pts[N - 1];
    default: return null;
  }
}

function eye(ctx, x, y, r, p, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = C.eye; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, r * 0.22);
  if (p.eye < 0.3) { ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, -r * 0.5, r, 0); ctx.stroke(); ctx.restore(); return; }   // (squeezed shut)
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.92 * p.eye, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.iris; ctx.beginPath(); ctx.arc(r * 0.18, 0, r * 0.55, 0, TAU); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(r * 0.24, 0, r * 0.28, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * 0.05, -r * 0.25, r * 0.16, 0, TAU); ctx.fill();
  if (p.mad > 0.2) { ctx.strokeStyle = C.brow; ctx.lineWidth = r * 0.3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r * 0.9, -r * (0.95 + 0.25 * p.mad)); ctx.lineTo(r * 0.8, -r * (1.05 - 0.2 * p.mad)); ctx.stroke(); }
  void t;
  ctx.restore();
}

/** draw at the base = (0, 0).  o: { facing, scale, t, flash (0..1: a soft white over it -- the caller keeps it flash-safe) } */
export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {}), f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  if (p.len < 4) return;
  const pts = line(p);
  ctx.save(); ctx.scale(f * S, S);
  if (p.sink > 0) { ctx.beginPath(); ctx.rect(-400, -600, 800, 600); ctx.clip(); }   // (nothing below the deck line)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [col, k, off] of [[INK, 1, 0], [C.skinD, 0.86, 0], [C.skin, 0.58, -3]]) {
    ctx.strokeStyle = col;
    for (let i = 0; i < N; i++) {
      const [nx, ny] = nrm(pts, i);
      ctx.lineWidth = wAt(i) * k + (col === INK ? 6 : 0);
      ctx.beginPath(); ctx.moveTo(pts[i][0] + nx * off, pts[i][1] + ny * off); ctx.lineTo(pts[i + 1][0] + nx * off, pts[i + 1][1] + ny * off); ctx.stroke();
    }
  }
  // the suckers down the inner (front) side
  ctx.fillStyle = C.belly; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  for (let i = 1; i < N - 2; i++) { const [nx, ny] = nrm(pts, i), r = wAt(i) * 0.17 + 1.6, d = wAt(i) * 0.36; ctx.beginPath(); ctx.arc(pts[i][0] + nx * d, pts[i][1] + ny * d, r, 0, TAU); ctx.fill(); ctx.stroke(); }
  if (o.flash > 0.01) { ctx.globalAlpha = Math.min(0.35, o.flash); ctx.strokeStyle = '#fff'; for (let i = 0; i < N; i++) { ctx.lineWidth = wAt(i) * 0.7; ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke(); } ctx.globalAlpha = 1; }
  // the eyes: two small ones along it, the big one near the tip (they face the way it looks: +x)
  for (const [i, r] of [[5, 7], [8, 8.5], [N - 2, 15]]) { const [nx, ny] = nrm(pts, i); eye(ctx, pts[i][0] - nx * 2, pts[i][1] - ny * 2, r, p, t); }
  ctx.restore();
}

// (the exports, measured from the rig's own poses: the tip at the slap's hit, a held hero's spot)
export const SLAP_TIP = point(ANIM.slap(0.25), 'tip').map(Math.round);
export const HOLD = point(ANIM.hold(0), 'hold').map(Math.round);
export const EXPORTS = { SLAP_TIP, HOLD };
