// Magma Salamander, 3D-rendered sprites (loaded instead of ./salamander.js with ?art3d=1 once 'salamander' is in
// ART3D_NAMES; see src/chars.js, docs/SPRITE3D.md).  Model: assets-src/salamander/ (tools/sprite3d/models/
// salamander_build.py on the shared dragon rig); clips: tools/sprite3d/chars/salamander.py -> assets/sprites/salamander/.
// Rendered facing right and mirrored (unhanded).  Every pose carries the code rig's pose too (a key without an atlas
// clip draws the rig), so the rig's 2D effects are drawn here over the sprite from those fields and the 3D landmarks:
// the flickering tail flame, the dizzy stars, the chomp star, the bite smear, the lava-burp smoke and the roll dust.
// Engine points measured on the 3D drawings: MOUTH (spit st 5: the glob leaves), BITE (lunge st 7: the snap),
// HURTBOX { x, w, h } (the idle drawing's snout / rump / eye top).
import * as RIG from './salamander.js';
import { spriteArt, rigOnly } from '../sprite3d.js';

export * from './salamander.js';       // BASE, FRAMES, CRAWL_STRIDE, SPIT_RELEASE, BITE_CONTACT, mouthOf, biteOf, drawGlob ...

const A = await spriteArt('salamander', { fallback: RIG });
export const ANIM = {};
for (const key of new Set([...Object.keys(RIG.ANIM), ...Object.keys(A.ANIM)])) {
  const spr = A.ANIM[key], rig = RIG.ANIM[key];
  const isSpr = spr !== undefined && ((typeof spr === 'function' ? spr(0) : spr) || {}).s3d >= 0.5;
  if (!isSpr) { if (rig !== undefined) ANIM[key] = rigOnly(key, rig, !!A.ATLAS_SCALE); continue; }
  const one = (f, a) => (typeof f === 'function' ? f(a) : f);
  ANIM[key] = typeof spr === 'function' || typeof rig === 'function'
    ? (a) => Object.assign({}, rig !== undefined ? one(rig, a) : {}, one(spr, a))
    : Object.assign({}, rig || {}, spr);
}

const LAVA = '#ff8a1c', LAVAH = '#ffd23e', LAVAC = '#fff4b8', INKC = '#21141c', SMOKE = '#8d8292', SMOKEL = '#b9b0bd';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function poly(ctx, pts, fill, lw) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = INKC; ctx.stroke(); }
}
function star(ctx, x, y, R, n, fill, lw) {
  const pts = [];
  for (let j = 0; j < n * 2; j++) { const r = j % 2 ? R * 0.42 : R, a = j * Math.PI / n - Math.PI / 2; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  poly(ctx, pts, fill, lw);
}
function flame(ctx, x, y, t, lean, size) {            // salamander.js flameTip(), simplified
  ctx.save(); ctx.translate(x, y); ctx.rotate(lean + 0.12 * Math.sin(t * 7.3)); ctx.scale(size, size);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';          // (a mitred join drew the tip as an 8-10 px ink needle)
  const f1 = Math.sin(t * 17), f2 = Math.sin(t * 23 + 1.3), f3 = Math.sin(t * 13 + 2.1), H = 17 + 2.5 * f1;
  const tongue = (w, h, sw) => {
    ctx.beginPath(); ctx.moveTo(-w, 0);
    ctx.bezierCurveTo(-w * 1.1, -h * 0.35, -w * 0.3 + sw, -h * 0.55, -w * 0.5 + sw * 1.5, -h * 0.72);
    ctx.quadraticCurveTo(-w * 0.05, -h * 0.6, sw * 1.4, -h);
    ctx.quadraticCurveTo(w * 0.35 + sw, -h * 0.62, w * 0.75 + sw * 0.6, -h * 0.66);
    ctx.bezierCurveTo(w * 0.5, -h * 0.4, w * 1.15, -h * 0.25, w, 0);
    ctx.quadraticCurveTo(0, w * 0.9, -w, 0); ctx.closePath();
  };
  tongue(6.8, H, 1.6 * f2); ctx.fillStyle = LAVA; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INKC; ctx.stroke();
  tongue(4.4, H * 0.7, 1.2 * f3); ctx.fillStyle = LAVAH; ctx.fill();
  tongue(2.4, H * 0.42, 0.8 * f2); ctx.fillStyle = LAVAC; ctx.fill();
  ctx.restore();
}

/** Draw with the feet at (0, 0).  o: { facing, t, scale, mem, vel } as ./salamander.js. */
export function draw(ctx, pose, o = {}) {
  A.draw(ctx, pose, o);
  if (!pose || !(pose.s3d >= 0.5)) return;                    // the code rig drew its own effects
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  const at = (lm) => { const q = A.point3d(pose, lm); return q ? [q[0] * f * S, q[1] * S] : null; };
  const fl = at('flame');
  if (fl) {
    const vf = o.vel ? (o.vel.x || 0) * f : 0;
    flame(ctx, fl[0], fl[1] + 4 * S, t, f * clamp(-vf * 0.16, -0.7, 0.7), S * (1 + 0.5 * clamp(pose.flare || 0, 0, 1)));
  }
  if (pose.stars || pose.face === 'ko') {
    const h = at('head'), c = at('body');                     // over the head (lying belly-up: over the body too)
    const y0 = h && c ? Math.min(h[1], c[1] - 16 * S) - 14 * S : 0;
    if (h) for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.094; star(ctx, h[0] + Math.cos(a) * 14 * S, y0 + Math.sin(a) * 4 * S, 4 * S, 4, '#ffe45c', 1.5); }
  }
  const b = at('bite');
  if (b && pose.smear > 0.01) {                               // chomp crescent in front of the jaws
    ctx.save(); ctx.globalAlpha = 0.8 * clamp(pose.smear, 0, 1); ctx.translate(b[0], b[1]); ctx.scale(f * S, S);
    ctx.beginPath(); ctx.moveTo(-4, -18); ctx.quadraticCurveTo(22, -12, 15, 10); ctx.quadraticCurveTo(9, 19, -5, 17);
    ctx.quadraticCurveTo(9, 6, 7, -3); ctx.quadraticCurveTo(5, -11, -4, -18); ctx.closePath(); ctx.fillStyle = '#fff3d6'; ctx.fill();
    ctx.restore();
  }
  if (b && pose.chomp > 0) {
    const u = clamp(pose.chomp, 0, 1);
    ctx.save(); ctx.globalAlpha = Math.min(1, u * 1.5); star(ctx, b[0] + 4 * f * S, b[1] - 2 * S, (9 + 7 * (1 - u)) * S, 6, LAVAH, 2); ctx.restore();
  }
  const m = at('mouth');
  if (m && pose.puff > 0) {                                   // the lava burp's smoke ring
    const u = clamp(pose.puff, 0, 1);
    ctx.save(); ctx.globalAlpha = 1 - u * u; ctx.translate(m[0] + (4 + u * 10) * f * S, m[1] - (4 + u * 20) * S);
    for (const [dx, dy, r] of [[0, 0, 4.5], [5, -3, 3.6], [-3, -5, 3.2]]) {
      const R = r * (0.6 + u * 1.2) * S;
      ctx.beginPath(); ctx.arc(dx * (0.6 + u) * f * S, dy * (0.6 + u) * S, R, 0, Math.PI * 2);
      ctx.fillStyle = SMOKE; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = INKC; ctx.stroke();
    }
    ctx.restore();
  }
  const bc = at('body');
  if (bc && pose.dust > 0) {                                  // the dust cloud the roll-over kicks up
    const u = clamp(pose.dust, 0, 1), a = Math.sin(Math.PI * u), P = [];
    for (const [dx, dy, r, ph] of [[-22, -10, 11, 0], [-6, -18, 13, 0.6], [12, -12, 12, 1.3], [26, -6, 9, 2], [2, -4, 10, 2.7]]) {
      P.push([bc[0] + dx * (0.8 + 0.4 * u) * f * S, (dy * (0.9 + 0.3 * u) - 2) * S, r * (0.55 + 0.6 * a) * (1 + 0.06 * Math.sin(t * 9 + ph)) * S]);
    }
    ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.6);
    ctx.beginPath(); for (const [x, y, r] of P) { ctx.moveTo(x + r + 1.3, y); ctx.arc(x, y, r + 1.3, 0, Math.PI * 2); } ctx.fillStyle = INKC; ctx.fill();
    ctx.beginPath(); for (const [x, y, r] of P) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); } ctx.fillStyle = SMOKEL; ctx.fill();
    ctx.restore();
  }
}
export { draw as drawSalamander };

// engine points, measured on the 3D drawings at the frame the engine uses them (the rig's until the atlas exists)
const pt = (key, k, lm) => { const g = A.ANIM[key]; return typeof g === 'function' ? A.point3d(g(k), lm) : null; };
const r2 = (p) => (p ? p.map((c) => Math.round(c)) : null);
export const MOUTH = r2(pt('spit', 5 / 16, 'mouth')) || RIG.MOUTH;
export const BITE = r2(pt('lunge', 0.35, 'bite')) || RIG.BITE;
const hb = (() => {
  const s = pt('idle', 0, 'snout'), r = pt('idle', 0, 'rump'), c = pt('idle', 0, 'crown');
  return s && r && c ? { x: Math.round((s[0] + r[0]) / 2), w: Math.round(s[0] - r[0]), h: Math.round(-c[1]) } : null;
})();
export const HURTBOX = hb || RIG.HURTBOX;
export const META = A.META;
export const ATLAS_SCALE = A.ATLAS_SCALE;
