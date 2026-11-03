// Whelp, 3D-rendered sprites (loaded instead of ./whelp.js with ?art3d=1 once 'whelp' is in ART3D_NAMES; see
// src/chars.js, docs/SPRITE3D.md).  One model (assets-src/whelp/, built by tools/sprite3d/models/whelp_build.py on the
// shared dragon rig, models/dragon_build.py + chars/_dragon.py) and one atlas per variant, rendered by tools/sprite3d
// chars/whelp.py (ember: assets/sprites/whelp/) and chars/whelp_storm.py (storm: assets/sprites/whelp_storm/).  The
// variants differ by materials only, so ANIM is shared and draw() picks the atlas by o.variant; a variant without an
// atlas yet draws the code rig from the same pose (every pose carries the rig's pose too).
//
// Cursed vs freed is baked into the clips (hover / spit / swoop / hurt / fall / down / cage: collar + green eyes;
// freed / allyHover / allyBreath: no collar, amber eyes), which is how the engine uses them.
// Rendered facing right and mirrored (unhanded, like the rig).  The rig's 2D extras that are effects rather than the
// look are drawn here over the sprite: the dizzy stars ('down'), the dive streaks ('swoop'), the fire (or lightning)
// gathering in the mouth (the rig's glow: spit wind-up, spit, the ally breath), and the storm whelp's crackle at its wing
// tips and tail tip.
import * as RIG from './whelp.js';
import { spriteArt, rigOnly } from '../sprite3d.js';

export * from './whelp.js';            // BODY_Y, BASE, mouthOf, drawCollar, drawSpark, drawCage, mix (local exports win)

const VARIANTS = { ember: 'whelp', storm: 'whelp_storm' };
const ARTS = {};
await Promise.all(Object.entries(VARIANTS).map(async ([v, name]) => { ARTS[v] = await spriteArt(name, { fallback: RIG }); }));

const isSprite = (f) => {
  const p = typeof f === 'function' ? f(0) : f;
  return !!(p && p.s3d >= 0.5);
};
const source = (key) => Object.keys(VARIANTS).find((v) => isSprite(ARTS[v].ANIM[key]));

export const ANIM = {};
for (const key of new Set([...Object.keys(RIG.ANIM), ...Object.values(ARTS).flatMap((A) => Object.keys(A.ANIM))])) {
  const v = source(key);
  const rig = RIG.ANIM[key];
  if (!v) { if (rig !== undefined) ANIM[key] = rigOnly(key, rig, Object.values(ARTS).some((a) => a.ATLAS_SCALE)); continue; }
  const spr = ARTS[v].ANIM[key];
  const one = (f, a) => (typeof f === 'function' ? f(a) : f);
  ANIM[key] = typeof spr === 'function' || typeof rig === 'function'
    ? (a) => Object.assign({}, rig !== undefined ? one(rig, a) : {}, one(spr, a))
    : Object.assign({}, rig || {}, spr);
}

const STAR = '#ffe066', INKC = '#21141c';
// whelp.js colours for the mouth fire and the lightning: cursed = green, storm = electric, ally (freed) = orange
const K = { gem: '#46f26c', gemD: '#0f9a3e', gemC: '#eaffdf', bolt: '#9fe8ff', boltC: '#ffffff', boltD: '#2f7fe0',
  fire: '#ff9a2a', fireD: '#d9461a', fireC: '#fff1a6' };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function bolt(c, x0, y0, x1, y1, seed, amp, n = 5) {      // whelp.js bolt(): a jagged line added to the path
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  c.moveTo(x0, y0);
  for (let i = 1; i < n; i++) { const u = i / n, o = (hash(seed + i * 7.3) - 0.5) * 2 * amp; c.lineTo(x0 + dx * u + nx * o, y0 + dy * u + ny * o); }
  c.lineTo(x1, y1);
}
function boltStroke(ctx, path, w) {                         // whelp.js boltStroke(): cyan glow + white core
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.55; ctx.strokeStyle = K.bolt; ctx.lineWidth = w * 2.6; ctx.beginPath(); path(ctx); ctx.stroke();
  ctx.globalAlpha = 1; ctx.strokeStyle = K.boltC; ctx.lineWidth = w; ctx.beginPath(); path(ctx); ctx.stroke();
}
/** whelp.js mouthGlow(): fire licking out of the mouth (or, storm, a crackling ball of lightning) + two sparks, in the
 * head's direction at the mouth landmark (m, h: screen points, the facing applied) */
function mouthGlow(ctx, m, h, pose, storm, S, T) {
  const g = Math.min(1, Math.max(0, pose.glow)), [, mid, hot] = pose.fire ? [K.fireD, K.fire, K.fireC] : storm ? [K.boltD, K.bolt, K.boltC] : [K.gemD, K.gem, K.gemC];
  ctx.save();
  ctx.translate(m[0], m[1]); ctx.rotate(h ? Math.atan2(m[1] - h[1], m[0] - h[0]) : 0); ctx.scale(S, S);
  if (storm && !pose.fire) {
    const r = 2.5 + 3.5 * g, fr = Math.floor(T * 20);
    ctx.globalAlpha = 0.5; ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(2, 0, r + 2.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = hot; ctx.beginPath(); ctx.arc(2, 0, r * 0.6, 0, Math.PI * 2); ctx.fill();
    boltStroke(ctx, (c) => { for (let i = 0; i < 3; i++) { const a = hash(fr + i) * Math.PI * 2; bolt(c, 2, 0, 2 + Math.cos(a) * (r + 5), Math.sin(a) * (r + 5), fr * 5 + i, 1.4, 3); } }, 0.8);
  } else {
    for (let i = 0; i < 3; i++) {
      const ph = T * 13 + i * 2.1, L = (5 + 4 * g) * (0.75 + 0.25 * Math.sin(ph)), off = (i - 1) * 2.6 * g;
      ctx.fillStyle = i === 1 ? hot : mid; ctx.beginPath();
      ctx.moveTo(-1, off - 2.2 * g); ctx.quadraticCurveTo(L * 0.6, off - 2.6 * g + Math.sin(ph) * 1.5, L, off + Math.sin(ph * 1.3) * 1.2);
      ctx.quadraticCurveTo(L * 0.5, off + 2.4 * g, -1, off + 2.2 * g); ctx.closePath(); ctx.fill();
    }
  }
  ctx.fillStyle = hot; ctx.globalAlpha = g;
  for (let i = 0; i < 2; i++) {
    const a = T * 7 + i * 2.6, r = 7 + 3 * Math.sin(T * 11 + i);
    ctx.beginPath(); ctx.arc(2 + Math.cos(a) * r, Math.sin(a) * r * 0.7, 1.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let j = 0; j < 10; j++) {
    const rr = j % 2 ? r * 0.4 : r, b = -Math.PI / 2 + j * Math.PI / 5;
    ctx.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

/** Draw with the floor point under the whelp at (0, 0) (the engine lifts it by z).  o: as ./whelp.js. */
export function draw(ctx, pose, o = {}) {
  const A = ARTS[o.variant] || ARTS.ember;
  A.draw(ctx, pose, o);
  if (!pose || !(pose.s3d >= 0.5)) return;                    // the code rig drew its own extras
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  const at = (lm) => { const q = A.point3d(pose, lm); return q ? [q[0] * f * S, q[1] * S] : null; };
  if (pose.clip === 'down') {                                 // dizzy stars circling the head
    const h = at('head');
    if (h) {
      ctx.save(); ctx.fillStyle = STAR; ctx.strokeStyle = INKC; ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.094; star(ctx, h[0] + Math.cos(a) * 13 * S, h[1] - 12 * S + Math.sin(a) * 4 * S, 4 * S); }
      ctx.restore();
    }
  } else if (pose.clip === 'swoop') {                         // speed streaks behind the dive
    const b = at('body');
    if (b) {
      ctx.save(); ctx.strokeStyle = '#fffaf0'; ctx.lineCap = 'round'; ctx.globalAlpha = 0.7;
      for (const [y, x0, L, w] of [[-8, -26, 30, 2.4], [2, -30, 38, 3], [11, -24, 24, 2]]) {
        const off = (t * 260 + y * 13) % 30;
        ctx.lineWidth = w * S; ctx.beginPath();
        ctx.moveTo(b[0] + f * (x0 - off) * S, b[1] + y * S); ctx.lineTo(b[0] + f * (x0 - off - L) * S, b[1] + y * S); ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (pose.glow > 0.02) { const m = at('mouth'); if (m) mouthGlow(ctx, m, at('head'), pose, o.variant === 'storm', S, t); }
  if (o.variant === 'storm' && Math.floor(t * 18) % 4 !== 0) {   // the tail tip's spark (whelp.js: the arrow tip)
    const q = at('tail'), hp = at('hips');
    if (q) {
      ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(hp ? Math.atan2(q[1] - hp[1], q[0] - hp[0]) : 0); ctx.scale(S, S);
      boltStroke(ctx, (c) => bolt(c, 1, -6, 12, 0, Math.floor(t * 18) + 9, 1.6, 3), 0.9);
      ctx.restore();
    }
  }
  if (o.variant === 'storm' && Math.floor(t * 18) % 4 !== 0) {   // crackle flickering at the wing tips
    ctx.save(); ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 1.6 * S; ctx.lineCap = 'round';
    for (const lm of ['wingR', 'wingL']) {
      const q = at(lm);
      if (!q) continue;
      const s = Math.floor(t * 18) + (lm === 'wingL' ? 7 : 0);
      ctx.beginPath(); ctx.moveTo(q[0], q[1]);
      for (let i = 1; i <= 3; i++) {
        const h = Math.sin(s * 12.9898 + i * 78.233) * 43758.5453, r = h - Math.floor(h);
        ctx.lineTo(q[0] - f * i * 4 * S, q[1] + (r - 0.5) * 8 * S);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

// engine landmarks (src/enemies.js Whelp spit, src/interact.js AllyWhelp breath), measured on the 3D drawings at the
// frame the engine uses them; the rig's until an atlas exists
const pt = (key, k, lm) => {
  const A = ARTS.ember, f = A.ANIM[key];
  return typeof f === 'function' ? A.point3d(f(k), lm) : null;
};
const r2 = (p) => (p ? p.map((c) => Math.round(c)) : null);
export const MOUTH = r2(pt('spit', 0, 'mouth')) || RIG.MOUTH;                 // the shot spawns on spit k = 0
export const ALLY_MOUTH = r2(pt('allyBreath', 0.5, 'mouth')) || RIG.ALLY_MOUTH; // the fire stream (k .20 - .85)
export const META = ARTS.ember.META;
export const ATLAS_SCALE = ARTS.ember.ATLAS_SCALE;
