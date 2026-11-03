// Drawing + posing helpers shared by every character.
//
// Characters are drawn in their own local space: origin on the floor under the body, +x = the way they face,
// y down (canvas).  Limbs are drawn in joint frames that point DOWN (+y); limb angles are in degrees with
// positive = swung FORWARD (towards the facing direction), so they are applied with ctx.rotate(-a * DEG).
import { INK } from './config.js';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- cel shading
// The light comes from the upper left of the SCREEN whatever way the character faces: the offset is worked
// out from the live transform, so mirrored and rotated parts stay consistently lit.
const LIGHT_X = -2.3, LIGHT_Y = -2.9;
let lx = 0, ly = 0;
function lightOffset(ctx, k) {
  const m = ctx.getTransform();
  const det = m.a * m.d - m.b * m.c;
  if (!det) { lx = ly = 0; return; }
  const s = Math.sqrt(Math.abs(det));
  const wx = LIGHT_X * k * s, wy = LIGHT_Y * k * s;
  lx = (m.d * wx - m.c * wy) / det;
  ly = (-m.b * wx + m.a * wy) / det;
}

/**
 * Fill a shape cel-shaded: a shadow band on the side away from the light, an optional thin highlight rim
 * on the lit side, optional clipped detail (scales, planks, rivets), then the ink outline.
 * path(ctx) adds sub-paths (no beginPath).  o: { k: shadow width, hi: colour, hk: rim width, lw: outline,
 * detail(ctx): drawn clipped to the shape, ink: outline colour }
 */
export function cel(ctx, path, base, dark, o = {}) {
  const k = o.k ?? 1, lw = o.lw ?? 3;
  ctx.beginPath(); path(ctx);
  ctx.fillStyle = dark; ctx.fill();
  if (base !== dark || o.hi || o.detail) {
    lightOffset(ctx, k);
    const sx = lx, sy = ly;
    ctx.save();
    ctx.clip();
    ctx.save();
    ctx.translate(sx, sy); ctx.beginPath(); path(ctx); ctx.fillStyle = o.hi || base; ctx.fill();
    if (o.hi) {
      ctx.clip();
      const h = (o.hk ?? 0.45) / k;
      ctx.translate(-sx * h, -sy * h);
      ctx.beginPath(); path(ctx); ctx.fillStyle = base; ctx.fill();
    }
    ctx.restore();
    if (o.detail) o.detail(ctx);
    ctx.restore();
  }
  if (lw) {
    ctx.beginPath(); path(ctx);
    ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = o.ink || INK; ctx.stroke();
  }
}

/** Flat fill + outline (small bits that don't need shading). */
export function flat(ctx, path, fill, lw = 2.5) {
  ctx.beginPath(); path(ctx);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw) { ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke(); }
}

/** Stroke-only ink line. */
export function ink(ctx, path, lw = 2, col = INK) {
  ctx.beginPath(); path(ctx);
  ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.stroke();
}

// ---------------------------------------------------------------- shapes
/** Tapered capsule along +y from 0 to len, widths w0 (top) and w1 (bottom). */
export function capsule(c, len, w0, w1) {
  const r0 = w0 / 2, r1 = w1 / 2;
  c.moveTo(r0, 0);
  c.arc(0, 0, r0, 0, Math.PI, true);
  c.lineTo(-r1, len);
  c.arc(0, len, r1, Math.PI, 0, true);
  c.closePath();
}

/** Closed smooth blob through points (Catmull-Rom -> bezier). pts = [[x,y], ...] */
export function blob(c, pts, tension = 0.5) {
  const n = pts.length;
  const p = (i) => pts[(i + n) % n];
  c.moveTo(p(0)[0], p(0)[1]);
  for (let i = 0; i < n; i++) {
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
    const t = tension / 3 * 2;
    c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * t / 2, p1[1] + (p2[1] - p0[1]) * t / 2,
      p2[0] - (p3[0] - p1[0]) * t / 2, p2[1] - (p3[1] - p1[1]) * t / 2, p2[0], p2[1]);
  }
  c.closePath();
}

/** Open smooth curve through points. */
export function curve(c, pts, tension = 0.5) {
  const n = pts.length;
  const p = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n - 1; i++) {
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
    const t = tension / 3;
    c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t,
      p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t, p2[0], p2[1]);
  }
}

/** Fluffy fur outline around an ellipse: tufts point outward, longer along the bottom. */
export function fur(c, cx, cy, rx, ry, n, len, seed = 1, bottomOnly = false) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * TAU;
    const out = i % 2 === 1;
    const below = Math.sin(a) > -0.2;
    const L = out ? (bottomOnly && !below ? len * 0.35 : len * (0.7 + rnd() * 0.6) * (below ? 1.15 : 0.8)) : 0;
    const x = cx + Math.cos(a) * (rx + L * 0.9), y = cy + Math.sin(a) * (ry + L);
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

export function ellipse(c, x, y, rx, ry, rot = 0) { c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); c.ellipse(x, y, rx, ry, rot, 0, TAU); }
export function circle(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }

// ---------------------------------------------------------------- pose interpolation
export const ease = {
  lin: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  back: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  snap: (t) => 1 - Math.pow(1 - t, 4),
};

/** Blend two poses (numbers lerp; anything else switches at the halfway point). */
export function mix(a, b, t) {
  const o = {};
  for (const k in a) {
    const va = a[k], vb = b[k];
    o[k] = (typeof va === 'number' && typeof vb === 'number') ? va + (vb - va) * t : (vb === undefined ? va : (t < 0.5 ? va : vb));
  }
  for (const k in b) if (!(k in o)) o[k] = b[k];
  return o;
}

/**
 * Keyframes: keys = [[time, pose, easeIntoThisKey?], ...] with times 0..1 ascending; k = progress 0..1.
 * Non-number fields (face, flags) take the value of the key we are coming FROM.
 */
export function keys(k, list) {
  if (k <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [t1, p1, e] = list[i];
    if (k <= t1) {
      const [t0, p0] = list[i - 1];
      const u = (k - t0) / Math.max(1e-6, t1 - t0);
      const m = mix(p0, p1, (ease[e] || ease.io)(u));
      for (const f in p0) if (typeof p0[f] !== 'number') m[f] = p0[f];
      return m;
    }
  }
  return list[list.length - 1][1];
}

// ---------------------------------------------------------------- misc
export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/** Simple 2-joint leg FK: returns the sole's y below the hip for thigh angle a and knee bend s (deg). */
export function legDrop(thigh, shin, foot, a, s) {
  const a1 = a * DEG, a2 = (a + s) * DEG;
  return Math.cos(a1) * thigh + Math.cos(a2) * shin + foot;
}

// ---------------------------------------------------------------- secondary motion
/**
 * Damped spring that chases `target` (hair, scarves, capes, tails, fur, pennants...).
 * mem = the per-actor scratch object the engine passes as o.mem (it sets mem.frame each frame); without it
 * (pose sheets) the target comes straight back.  Typical: const lag = follow(o.mem, 'scarf', -o.vel.x * 6, 0.16, 0.74)
 */
export function follow(mem, key, target, stiff = 0.18, damp = 0.72) {
  if (!mem) return target;
  if (!Number.isFinite(target)) target = 0;
  let s = mem[key];
  // a bad value (NaN) must never get stuck in a spring: start it over
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.v)) s = mem[key] = { x: target, v: 0, f: -1 };
  if (s.f === mem.frame) return s.x;
  s.f = mem.frame;
  s.v = s.v * damp + (target - s.x) * stiff;
  s.x += s.v;
  return s.x;
}
