// Dodongo, "IMPROVED 2D" contender (?rig2=1, see src/chars.js).  Same contract as ./dodongo.js (docs/CONTRACTS.md).
//
// How it works (Dragon's Crown style painted cut-out, everything still drawn by code):
//  * BAKE (once, at module load, ~0.3 s on desktop; 2 atlas pages of 2048^2): every body part is painted procedurally into an offscreen canvas at
//    BS x resolution (base colour, low-frequency hue blots, directional brush strokes, grain, tapered interior lines,
//    stitching, scratches, scales ...).  Each part is built from LAYERS (shapes with their own bevel radius and
//    height), inflated into a height field (distance transform) -> per-pixel normals.  The part is then SHADED per
//    pixel for NB light directions (part-local): hue-shifted cel shadow with a brush-broken terminator, soft form
//    gradient, core shadow, floor bounce, cool rim light, painted specular breakup on metal, occlusion and cast
//    shadows between layers (hair clumps onto the forehead, straps onto the plate), emissive ember cracks.  A tapered
//    ink silhouette (thicker on the shadow side) is baked per light bucket too.  All sprites live in a few atlas pages.
//  * DRAW (per frame, ~0.12-0.15 ms CPU at scale 1; the old rig is ~0.3): a skeletal rig places the sprites with one setTransform + drawImage each.  For
//    every part the light direction is worked out in its own frame (mirroring included), and the two nearest light
//    buckets are cross-faded, so a swinging arm keeps correct screen-space lighting.  Limb chains draw their ink
//    first and their fills after, so joints are seamless (no paper-doll seams) while overlaps between chains keep a
//    silhouette line.  Swappable drawings: hands (grip / open / point), torso + belt (3/4 / twisted away), eyes,
//    brows and mouths, shield turn (front / 3/4 / edge-on).
//  * ANIMATION: idle, walk and atk1 are re-authored for this model (key poses with holds, squash & stretch on
//    torso and head, a stretched-arm smear frame, contact poses, follow-through springs on hair, fur, tassets;
//    idle fidgets: claw flex with the club set down, club flip, look-around).  The other keys take the old rig's
//    key poses converted to this model (ADAPTED, drawn with the new art); carry / throw / select fall back to the
//    old rig's poses AND drawing (FALLBACK).  Tools: tools/rig2d/ (sheet.html, capture4.mjs, compare4.py).
//
// LOOKS: ?rig2=1 = the code paint above with rigid limb segments.  ?rig2=paint = "2D + painted parts": every part's
// albedo comes from FLUX.2 klein repaints of guide sheets of the parts (tools/rig2d/guides.mjs -> paint_parts.py ->
// assets/rig2d/paint_*.png + paint_layout.json; silhouette-locked img2img, each part cut back out by its own mask) with
// the light bake blended on top at PAINT_LIGHT; plus whole-limb drawings bent at elbow / knee by strip skinning (with a
// drawn inner crease) and a profile head swapped in on attack contacts.  ?rig2=flex = flexing limbs + profile head
// with the code paint.
//
// Handedness: his RIGHT arm is the crimson dragon arm (club), his LEFT carries the shield, in both facings: facing
// right the dragon arm is the near (front) arm; facing left the drawing is mirrored and the arm slots swap.
import * as OLD from './dodongo.js';
import { INK } from '../config.js';
import { DEG, TAU, clamp, lerp, ease, follow, mix } from '../rig.js';

const HAS_DOM = typeof document !== 'undefined';
// ?rig2=1 the code-painted look as first delivered; ?rig2=paint adds the klein-painted part art (assets/rig2d/), the
// flexing whole-limb drawings and the profile head; ?rig2=flex = flexing limbs + profile head with the code paint.
const R2MODE = (() => { try { return new URLSearchParams(location.search).get('rig2') || ''; } catch { return ''; } })();
const PAINT = R2MODE === 'paint', FLEX = PAINT || R2MODE === 'flex', PROFILE = FLEX;
const BS = 2;                // bake scale: sprite px per local px (1:1 at a 2x canvas)
const NB = 14;               // light buckets for fills (25.7 deg apart: both facings' upright parts land on a bucket)
const NI = 7;                // light buckets for the ink silhouettes
const SL = (() => { const x = -2.3, y = -2.9, l = Math.hypot(x, y); return [x / l, y / l]; })();   // screen key light (upper left)
const PHI0 = Math.atan2(SL[1], SL[0]);
const INKC = hex(INK);

// ================================================================================================ colour + materials
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function css(c, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
const PAL = {
  skin: { c: hex('#f2c19f'), l: hex('#fcdcc3'), d: hex('#dd9b7e'), w: hex('#ef9e88'), k: hex('#e6c2b6') },
  hair: { c: hex('#a8733a'), l: hex('#d3a05e'), d: hex('#74471f'), w: hex('#bb8443'), k: hex('#8c6c48') },
  steel: { c: hex('#959ea9'), l: hex('#c4ccd4'), d: hex('#6c7581'), w: hex('#a89d8e'), k: hex('#838fa8') },
  lea: { c: hex('#8e5631'), l: hex('#b47c4c'), d: hex('#5e3318'), w: hex('#a3623a'), k: hex('#7b5040') },
  boot: { c: hex('#7d4829'), l: hex('#a0683f'), d: hex('#4f2a15'), w: hex('#8f5230'), k: hex('#6a4636') },
  olive: { c: hex('#6e773a'), l: hex('#8e984f'), d: hex('#4b5226'), w: hex('#80803c'), k: hex('#5b6a48') },
  fur: { c: hex('#9b928a'), l: hex('#d3cbc1'), d: hex('#625a55'), w: hex('#ab9c8c'), k: hex('#8a8b97') },
  drag: { c: hex('#be3229'), l: hex('#e2583f'), d: hex('#821a1c'), w: hex('#d44a2e'), k: hex('#9e2840') },
  brass: { c: hex('#cfa449'), l: hex('#f4dc92'), d: hex('#8c6823'), w: hex('#dcae4c'), k: hex('#a89060') },
  wood: { c: hex('#a96f3f'), l: hex('#c98e55'), d: hex('#744822'), w: hex('#b87a42'), k: hex('#8e6a50') },
  iron: { c: hex('#6b717c'), l: hex('#9ca3ad'), d: hex('#454952'), w: hex('#7a7068'), k: hex('#5c6478') },
  dark: { c: hex('#2e2229'), l: hex('#5e4c56'), d: hex('#1a1216'), w: hex('#3a2a2c'), k: hex('#2a2a38') },
  emb: { c: hex('#c43a2e'), l: hex('#e05a44'), d: hex('#80201c'), w: hex('#d04a30'), k: hex('#a03040') },
};
const RIM = [214, 240, 247], RIM_L = [214, 196, 246], RIM_W = [255, 236, 214];
// per-material shading: sh/li = multipliers in shadow/light, th = terminator (n.L), soft = terminator softness, brush =
// how much the stroke noise breaks the terminator, form = soft form gradient, core = core-shadow band, bounce = warm
// floor bounce in the shadow, rim (+rimC, rimW) cool rim on the side away from the light, spec (+sth, specC) painted
// highlight, edge = gouache edge darkening just inside the silhouette.
const MAT = {
  skin: { sh: [0.9, 0.71, 0.69], li: [1.03, 1.0, 0.97], th: 0.28, soft: 0.05, brush: 0.2, form: 0.16, core: 0.08, bounce: 0.12, rim: 0.5, rimC: RIM_W, rimW: 1.5, spec: 0, edge: 0.05 },
  hair: { sh: [0.6, 0.46, 0.45], li: [1.04, 1.01, 0.95], th: 0.34, soft: 0.04, brush: 0.36, form: 0.3, core: 0.12, bounce: 0.1, rim: 0.5, rimC: RIM, rimW: 1.2, spec: 0.22, sth: 0.88, specC: [255, 226, 160], edge: 0.1 },
  steel: { sh: [0.55, 0.6, 0.74], li: [1.03, 1.03, 1.02], th: 0.38, soft: 0.03, brush: 0.32, form: 0.34, core: 0.16, bounce: 0.22, rim: 0.7, rimC: RIM, rimW: 1.4, spec: 0.6, sth: 0.9, specC: [255, 255, 248], edge: 0.08 },
  lea: { sh: [0.6, 0.49, 0.53], li: [1.05, 1.0, 0.95], th: 0.33, soft: 0.05, brush: 0.3, form: 0.26, core: 0.12, bounce: 0.14, rim: 0.5, rimC: RIM, rimW: 1.3, spec: 0.18, sth: 0.9, specC: [255, 220, 180], edge: 0.12 },
  cloth: { sh: [0.6, 0.6, 0.68], li: [1.04, 1.03, 0.96], th: 0.32, soft: 0.06, brush: 0.34, form: 0.22, core: 0.1, bounce: 0.12, rim: 0.45, rimC: RIM, rimW: 1.3, spec: 0, edge: 0.1 },
  fur: { sh: [0.58, 0.56, 0.68], li: [1.05, 1.03, 1.0], th: 0.3, soft: 0.1, brush: 0.5, form: 0.25, core: 0.08, bounce: 0.1, rim: 0.6, rimC: RIM, rimW: 1.5, spec: 0, edge: 0.06 },
  drag: { sh: [0.56, 0.4, 0.56], li: [1.05, 1.0, 0.96], th: 0.34, soft: 0.04, brush: 0.28, form: 0.3, core: 0.14, bounce: 0.14, rim: 0.55, rimC: RIM_L, rimW: 1.5, spec: 0.4, sth: 0.88, specC: [255, 214, 190], edge: 0.08 },
  brass: { sh: [0.56, 0.44, 0.38], li: [1.05, 1.02, 0.94], th: 0.36, soft: 0.03, brush: 0.25, form: 0.4, core: 0.15, bounce: 0.2, rim: 0.5, rimC: RIM_W, rimW: 1.2, spec: 1, sth: 0.82, specC: [255, 250, 220], edge: 0.08 },
  wood: { sh: [0.62, 0.5, 0.52], li: [1.05, 1.01, 0.95], th: 0.33, soft: 0.05, brush: 0.3, form: 0.25, core: 0.12, bounce: 0.12, rim: 0.45, rimC: RIM, rimW: 1.3, spec: 0.12, sth: 0.92, specC: [255, 230, 190], edge: 0.1 },
  iron: { sh: [0.54, 0.57, 0.72], li: [1.06, 1.06, 1.04], th: 0.38, soft: 0.03, brush: 0.3, form: 0.4, core: 0.16, bounce: 0.2, rim: 0.7, rimC: RIM, rimW: 1.4, spec: 0.9, sth: 0.84, specC: [240, 246, 255], edge: 0.06 },
  dark: { sh: [0.62, 0.62, 0.74], li: [1.1, 1.1, 1.1], th: 0.34, soft: 0.04, brush: 0.2, form: 0.4, core: 0.1, bounce: 0.1, rim: 0.4, rimC: RIM_L, rimW: 1, spec: 0.7, sth: 0.85, specC: [200, 190, 210], edge: 0 },
};

// ================================================================================================ bake helpers
let SCR = null, SCX = null;
/** A reusable read-back canvas for the bake (cleared, identity transform). */
function scratchCtx(w, h) {
  if (!SCR || SCR.width < w || SCR.height < h) { [SCR, SCX] = canvas(Math.max(w, SCR ? SCR.width : 0), Math.max(h, SCR ? SCR.height : 0), true); }
  SCX.setTransform(1, 0, 0, 1, 0, 0); SCX.globalAlpha = 1; SCX.globalCompositeOperation = 'source-over'; SCX.clearRect(0, 0, w, h);
  return SCX;
}
function canvas(w, h, read) {
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
  return [c, c.getContext('2d', read ? { willReadFrequently: true } : undefined)];
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// exact euclidean distance transform (Felzenszwalb & Huttenlocher): distance from each pixel to the nearest src pixel
const BIG = 1e12;
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -BIG; z[1] = BIG;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = BIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
function edt(src, w, h) {
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = src[i] ? 0 : BIG;
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; edt1(f, h, d, v, z); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) f[x] = g[o + x]; edt1(f, w, d, v, z); for (let x = 0; x < w; x++) g[o + x] = d[x]; }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(g[i]);
  return out;
}
function boxBlur(a, w, h, r) {
  const t = new Float32Array(w * h), o = new Float32Array(w * h), k = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += a[y * w + clamp(x + i, 0, w - 1)]; t[y * w + x] = s / k; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += t[clamp(y + i, 0, h - 1) * w + x]; o[y * w + x] = s / k; }
  return o;
}

// ---- shape helpers: closed smooth outline through control points (a 3rd element = sharp corner)
function shp(c, pts) {
  const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s = mid(pts[n - 1], pts[0]);
  c.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], m = mid(p, pts[(i + 1) % n]);
    if (p[2]) { c.lineTo(p[0], p[1]); c.lineTo(m[0], m[1]); } else c.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  c.closePath();
}
const S_ = (pts) => (c) => shp(c, pts);
const CIRC = (x, y, r) => (c) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); };
const ELL = (x, y, rx, ry, rot = 0) => (c) => { c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); c.ellipse(x, y, rx, ry, rot, 0, TAU); };
const RECT = (x0, y0, x1, y1) => (c) => { c.moveTo(x0, y0); c.lineTo(x1, y0); c.lineTo(x1, y1); c.lineTo(x0, y1); c.closePath(); };
const MANY = (...fns) => (c) => { for (const f of fns) f(c); };
/** A lock of hair / tuft of fur / curl: root (x,y), direction ang (deg), length, width, curl (deg, + = clockwise). */
function lock(x, y, len, ang, w, curl = 0, n = 9, blunt = 0) {
  const L = [], R = [];
  let px = x, py = y, a = ang * DEG;
  const st = len / n;
  for (let i = 0; i <= n; i++) {
    const t = i / n, ww = blunt ? w * 0.5 * (t < 0.62 ? 0.78 + 0.22 * Math.sin(Math.PI * Math.min(1, t / 0.62) * 0.5) : Math.sqrt(Math.max(0.04, 1 - ((t - 0.62) / 0.38) ** 2))) + 0.1
      : w * 0.5 * Math.pow(Math.sin(Math.PI * (0.18 + 0.82 * t)), 0.55) * (1 - 0.5 * t) + 0.12;
    const nx = -Math.sin(a), ny = Math.cos(a);
    L.push([px + nx * ww, py + ny * ww]); R.push([px - nx * ww, py - ny * ww]);
    a += curl * DEG * (0.4 + 1.6 * t) / n;
    px += Math.cos(a) * st; py += Math.sin(a) * st;
  }
  const tip = L.pop(); R.pop();
  return L.concat([[tip[0], tip[1], blunt ? 0 : 1]], R.reverse());
}
const LOCK = (...a) => S_(lock(...a));

// ---- painting helpers (bake time; g is in part-local px)
function fillP(g, fn, col, a = 1) { g.beginPath(); fn(g); g.fillStyle = css(col, a); g.fill(); }
function clipP(g, fn) { g.beginPath(); fn(g); g.clip(); }
function blots(g, r, n, box, r0, r1, cols, a0, a1) {
  for (let i = 0; i < n; i++) {
    const x = lerp(box[0], box[2], r()), y = lerp(box[1], box[3], r()), rad = lerp(r0, r1, r()), c = cols[(r() * cols.length) | 0];
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = lerp(a0, a1, r());
    gr.addColorStop(0, css(c, a)); gr.addColorStop(0.55, css(c, a * 0.6)); gr.addColorStop(1, css(c, 0));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
/** Painterly strokes: n short strokes along ang (deg), each a few bristles of varying alpha. */
function strokes(g, r, n, box, ang, len, w, cols, a0, a1, jit = 22) {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = lerp(box[0], box[2], r()), y = lerp(box[1], box[3], r());
    const a = (ang + (r() - 0.5) * jit) * DEG, L = len * (0.55 + 0.9 * r());
    const dx = Math.cos(a) * L / 2, dy = Math.sin(a) * L / 2, nx = -Math.sin(a), ny = Math.cos(a), bo = (r() - 0.5) * L * 0.35;
    const c = cols[(r() * cols.length) | 0], al = lerp(a0, a1, r());
    for (let b = 0; b < 3; b++) {
      const o = (b - 1) * w * 0.34;
      g.strokeStyle = css(c, al * (0.45 + 0.55 * r())); g.lineWidth = w * (0.3 + 0.3 * r());
      g.beginPath(); g.moveTo(x - dx + nx * o, y - dy + ny * o); g.quadraticCurveTo(x + nx * (o + bo), y + ny * (o + bo), x + dx + nx * o, y + dy + ny * o); g.stroke();
    }
  }
}
function speck(g, r, n, box, rad, col, a) {
  g.fillStyle = css(col, a);
  for (let i = 0; i < n; i++) { const x = lerp(box[0], box[2], r()), y = lerp(box[1], box[3], r()), q = rad * (0.4 + r()); g.beginPath(); g.ellipse(x, y, q, q * (0.5 + r() * 0.6), r() * 3, 0, TAU); g.fill(); }
}
function scratch(g, r, n, box, len, col, a, ang = 0, jit = 60, w = 0.35) {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = lerp(box[0], box[2], r()), y = lerp(box[1], box[3], r()), t = (ang + (r() - 0.5) * jit) * DEG, L = len * (0.4 + r());
    g.strokeStyle = css(col, a * (0.5 + 0.5 * r())); g.lineWidth = w * (0.6 + 0.8 * r());
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(t) * L, y + Math.sin(t) * L); g.stroke();
  }
}
/** A filled tapered line through pts (Catmull-Rom sampled); width w in the middle, wa/wb at the ends (fractions). */
function taper(g, pts, w, col, a = 1, wa = 0.15, wb = 0.15) {
  const P = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let s = 0; s < 6; s++) {
      const t = s / 6, t2 = t * t, t3 = t2 * t;
      P.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  P.push(pts[n - 1]);
  const L = [], R = [], m = P.length;
  for (let i = 0; i < m; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(m - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const u = i / (m - 1), k = u < 0.5 ? lerp(wa, 1, smooth(0, 0.5, u)) : lerp(1, wb, smooth(0.5, 1, u)), ww = w * k / 2;
    L.push([P[i][0] - dy / l * ww, P[i][1] + dx / l * ww]); R.push([P[i][0] + dy / l * ww, P[i][1] - dx / l * ww]);
  }
  g.beginPath(); g.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < m; i++) g.lineTo(L[i][0], L[i][1]);
  for (let i = m - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath(); g.fillStyle = css(col, a); g.fill();
}
/** Inner contour: a line of width w just inside the shape's edge. */
function inner(g, fn, w, col, a = 1) { g.save(); clipP(g, fn); g.beginPath(); fn(g); g.lineWidth = w * 2; g.lineJoin = 'round'; g.strokeStyle = css(col, a); g.stroke(); g.restore(); }
function dash(g, pts, w, col, a, on = 1.2, off = 1.3) { g.save(); g.setLineDash([on, off]); g.lineCap = 'butt'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.lineWidth = w; g.strokeStyle = css(col, a); g.stroke(); g.restore(); }
function line(g, pts, w, col, a = 1) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = w; g.strokeStyle = css(col, a); g.stroke(); }
function rivet(g, x, y, r, pal) { fillP(g, CIRC(x, y + 0.25, r), pal.d); fillP(g, CIRC(x - 0.15, y - 0.1, r * 0.78), pal.c); fillP(g, CIRC(x - r * 0.3, y - r * 0.35, r * 0.32), pal.l); }
/** Base painterly fill for a region: base colour, soft hue blots, directional strokes, light grain. */
function paintBase(g, r, fn, pal, box, ang, o = {}) {
  g.save(); clipP(g, fn);
  fillP(g, fn, pal.c);
  const area = (box[2] - box[0]) * (box[3] - box[1]), d = Math.sqrt(area);
  blots(g, r, Math.round(4 + area / 60), box, d * 0.18, d * 0.45, [pal.l, pal.d, pal.w, pal.k], 0.1, o.blot ?? 0.32);
  strokes(g, r, Math.round(area / (o.sd ?? 6)), box, ang, o.len ?? 5.5, o.w ?? 1.9, [pal.l, pal.d, pal.c, pal.w], 0.1, (o.sa ?? 0.38) * 0.75, o.jit ?? 22);
  if (o.grain !== 0) speck(g, r, Math.round(area / 9), box, 0.32, pal.d, (o.grain ?? 0.12) * 0.7);
  g.restore();
}

// ================================================================================================ atlas
const PAGES = [];
let PG = null, PCX = null, shX = 0, shY = 0, shH = 0;
const PAGE_W = 2048, PAGE_H = 2048;
function alloc(w, h) {
  if (PG && shX + w > PAGE_W) { shX = 0; shY += shH + 1; shH = 0; }
  if (!PG || shY + h > PAGE_H) { [PG, PCX] = canvas(PAGE_W, PAGE_H); PAGES.push(PG); shX = 0; shY = 0; shH = 0; }
  const s = { img: PG, cx: PCX, x: shX, y: shY };
  shX += w + 1; shH = Math.max(shH, h);
  return s;
}

// ================================================================================================ part definitions
// Every part: box [x0,y0,x1,y1] (local px, origin = pivot), layers [{ p: path, R: bevel, z, m: material, nb: normal
// tilt }], paint(g, r): the albedo, emis(g, r): emissive, ink: [lit width, extra on the shadow side] or null,
// unlit: features (no shading), far: also bake a darker far-side variant, cast: { id } a part in the same frame
// whose shape casts a shadow on this one, bd: brush-noise direction (deg).
const PARTS = {};
const def = (id, s) => { PARTS[id] = s; };
const INKW = [1.45, 1.75], INKM = [1.05, 1.15], INKS = [0.85, 0.9];

// ---------------------------------------------------------------- skeleton (local px, scale 1)
const THIGH = 27, SHIN = 26, ANK = 7.5, HEEL = 6.4, TOE = 17.5;
const HIP_N = [-3, 0], HIP_F = [4, 0];
const SLOT_N = [-9.5, -42], SLOT_F = [7.5, -43];
const NECK = [2, -47], HEAD_UP = 3.5;
const UP_D = 20, FO_D = 18, UP_S = 19, FO_S = 17, GRIP = 5, CLUB = 30.5;
const AIR_H = 57;

// ---------------------------------------------------------------- legs
const THIGH_P = S_([[-7.2, -5], [0, -7.5], [7.6, -4.6], [7.9, 6], [7.0, 16], [6.2, 24], [5.6, 30], [0, 32], [-5.6, 30], [-6.3, 22], [-7.2, 10]]);
def('thigh', { box: [-9, -9, 9.5, 33], layers: [{ p: THIGH_P, R: 6.8, m: 'cloth' }], ink: INKW, far: true, bd: 90,
  paint(g, r) {
    paintBase(g, r, THIGH_P, PAL.olive, [-9, -8, 9, 32], 92, { len: 7, w: 2.1 });
    g.save(); clipP(g, THIGH_P);
    blots(g, r, 3, [-8, -8, 8, 0], 4, 7, [PAL.olive.d], 0.35, 0.5);                    // under the tassets
    taper(g, [[-5.5, 1], [-1.5, 4.5], [3.5, 5.5]], 0.9, PAL.olive.d, 0.8);                // hip crease
    taper(g, [[-4.8, 6.5], [0, 9], [4.2, 9.4]], 0.7, PAL.olive.d, 0.6);
    taper(g, [[5.2, 3], [5.9, 13], [5.1, 24]], 0.75, hex('#3e4420'), 0.75);              // outer seam
    dash(g, [[4.4, 4], [5, 13], [4.3, 23]], 0.55, PAL.olive.l, 0.55);
    taper(g, [[-5.6, 22], [-2.6, 25.6], [1, 25.4]], 0.85, PAL.olive.d, 0.85);             // back-of-knee folds
    taper(g, [[-5.8, 26.4], [-3.2, 28.4], [-0.4, 28]], 0.7, PAL.olive.d, 0.7);
    strokes(g, r, 6, [-2, 2, 6, 28], 92, 8, 1.2, [PAL.olive.l], 0.25, 0.45);
    g.restore();
  } });
const SHAFT_P = S_([[-5.9, 3], [5.9, 3], [6.2, 14], [5.5, 24.5], [4.8, 28.8], [-4.9, 28.8], [-5.5, 24.5], [-6.1, 14]]);
const KNEEJ_P = S_([[-6.6, -5], [0, -6.8], [6.6, -5], [6.6, 7], [-6.6, 7]]);
const CUFF_P = (c) => {
  c.moveTo(-6.9, 2.4); c.quadraticCurveTo(0, 0.6, 6.9, 2.4); c.lineTo(7.6, 7.2);
  const n = 7;
  for (let i = 0; i <= n; i++) { const x = 7.6 - i * 15.2 / n; c.lineTo(x, 8 + (i % 2 ? 3.6 : 0.4) + (i === 3 ? 1.4 : 0)); }
  c.lineTo(-7.6, 7.2); c.closePath();
};
const ABAND_P = S_([[-5.8, 20.2, 1], [5.6, 20.2, 1], [5.5, 23.6, 1], [-5.6, 23.6, 1]]);
def('shin', { box: [-8.5, -8, 8.5, 30], ink: INKW, far: true, bd: 90,
  layers: [{ p: KNEEJ_P, R: 5.5, m: 'cloth' }, { p: SHAFT_P, R: 5.4, z: 1, m: 'lea' }, { p: ABAND_P, R: 1.6, z: 2, m: 'steel' }, { p: CUFF_P, R: 3, z: 3, m: 'fur' }],
  paint(g, r, o = {}) {
    if (!o.noKnee) paintBase(g, r, KNEEJ_P, PAL.olive, [-7, -7, 7, 7], 90);
    paintBase(g, r, SHAFT_P, PAL.boot, [-6.5, 2, 6.5, 29], 90, { len: 6 });
    g.save(); clipP(g, SHAFT_P);
    taper(g, [[2.8, 10], [3.1, 15], [2.8, 19.5]], 0.6, PAL.boot.d, 0.8);
    dash(g, [[3.6, 10.5], [3.8, 19]], 0.5, PAL.boot.l, 0.7, 1, 1.1);
    scratch(g, r, 5, [-5, 11, 5, 27], 2.2, PAL.boot.l, 0.5, -20, 50, 0.4);
    blots(g, r, 2, [-5, 24, 5, 29], 2, 4, [PAL.boot.d], 0.3, 0.45);
    g.restore();
    paintBase(g, r, ABAND_P, PAL.steel, [-6, 20, 6, 24], 0, { sd: 3, len: 3, w: 1 });
    line(g, [[-5.4, 20.6], [5.3, 20.6]], 0.5, PAL.steel.l, 0.9);
    rivet(g, -3.6, 22, 0.6, PAL.iron); rivet(g, 3.4, 22, 0.6, PAL.iron);
    fur(g, r, CUFF_P, [-7.6, 1, 7.6, 12], 92, 22);
  } });
const KNEE_P = S_([[-5, -5.8], [1, -7.6], [6.6, -4.6], [7.1, 1.4], [5, 6.8], [0, 8.4], [-4.7, 5.8], [-6.4, 0]]);
def('knee', { box: [-8.5, -10, 9.5, 11], layers: [{ p: KNEE_P, R: 5, m: 'steel', nb: [0.12, -0.08] }], ink: INKM, far: true, bd: 80,
  paint(g, r) {
    paintBase(g, r, KNEE_P, PAL.steel, [-8, -9, 9, 10], 80, { len: 4, w: 1.4, sd: 3 });
    g.save(); clipP(g, KNEE_P);
    taper(g, [[0.6, -7.6], [1.6, 0], [0.9, 8.2]], 1, PAL.steel.d, 0.75);
    taper(g, [[-0.4, -7.4], [0.5, 0], [-0.2, 8]], 0.6, PAL.steel.l, 0.9);
    scratch(g, r, 6, [-6, -6, 7, 7], 2.4, PAL.steel.d, 0.6, 30, 80);
    scratch(g, r, 4, [-6, -6, 7, 7], 2, PAL.steel.l, 0.7, 30, 80);
    speck(g, r, 14, [-7, -8, 8, 9], 0.3, PAL.steel.d, 0.35);
    g.restore();
    inner(g, KNEE_P, 0.6, PAL.steel.d, 0.8);
    rivet(g, -3.8, -4.2, 0.75, PAL.iron); rivet(g, 5.2, -3.6, 0.75, PAL.iron);
  } });
const BOOT_P = S_([[-6.2, -3.4], [-6.9, 4], [-6.4, 7.6, 1], [16.8, 7.6, 1], [18.4, 4.6], [16.6, 0.8], [11, -1.6], [6, -3.8]]);
const TOECAP_P = S_([[9, -1.8], [13.6, -0.6], [17.4, 2.2], [18.6, 5.2], [17.2, 7.6, 1], [9.4, 7.6, 1], [8.4, 3]]);
const SOLE_P = S_([[-6.7, 5.8, 1], [17.9, 5.8, 1], [17.3, 7.8, 1], [-6.5, 7.8, 1]]);
def('boot', { box: [-8, -6, 20, 9], ink: INKW, far: true, bd: 0,
  layers: [{ p: BOOT_P, R: 4.2, m: 'lea' }, { p: SOLE_P, R: 0.8, z: 0.5, m: 'dark' }, { p: TOECAP_P, R: 3.2, z: 1, m: 'steel' }],
  paint(g, r) {
    paintBase(g, r, BOOT_P, PAL.boot, [-7, -4, 18, 8], 0, { len: 5 });
    g.save(); clipP(g, BOOT_P);
    taper(g, [[-5, 0.5], [0.5, 1.6], [6, 0.4]], 0.6, PAL.boot.d, 0.7);
    scratch(g, r, 5, [-5, -2, 9, 5], 2, PAL.boot.l, 0.45, 0, 50, 0.4);
    g.restore();
    fillP(g, SOLE_P, hex('#3b2519'));
    line(g, [[-6, 6], [17.4, 6]], 0.45, hex('#6a4a34'), 0.8);
    paintBase(g, r, TOECAP_P, PAL.steel, [8, -2, 19, 8], 20, { len: 3, w: 1.2, sd: 3 });
    g.save(); clipP(g, TOECAP_P); scratch(g, r, 4, [9, 0, 17, 6], 2, PAL.steel.l, 0.7, 10, 70); g.restore();
    inner(g, TOECAP_P, 0.5, PAL.steel.d, 0.85);
  } });

// ---------------------------------------------------------------- fur painting (used by cuffs, mantle, lobes)
function fur(g, r, fn, box, ang, n) {
  g.save(); clipP(g, fn);
  fillP(g, fn, PAL.fur.c);
  blots(g, r, 5, box, 2, 5, [PAL.fur.l, PAL.fur.d, PAL.fur.k], 0.15, 0.4);
  const cols = [PAL.fur.d, PAL.fur.d, PAL.fur.l, PAL.fur.c, hex('#efe8de')];
  for (let i = 0; i < n * 3; i++) {
    const x = lerp(box[0], box[2], r()), y = lerp(box[1], box[3], r()), a = (ang + (r() - 0.5) * 40) * DEG, L = 2.5 + 3.5 * r();
    const c = cols[(r() * cols.length) | 0];
    taper(g, [[x, y], [x + Math.cos(a) * L * 0.5 + (r() - 0.5), y + Math.sin(a) * L * 0.5], [x + Math.cos(a) * L, y + Math.sin(a) * L]], 0.55 + r() * 0.5, c, 0.4 + 0.45 * r(), 0.6, 0.05);
  }
  g.restore();
}

// ---------------------------------------------------------------- torso (pelvis frame, up = -y)
// Two drawings: the 3/4 front view ('torso', 'belt') and a twisted-away view for wind-ups ('torsoT', 'beltT'): the
// plate narrows and the straps, diamond and buckle slide toward the front edge (a drawing swap, not a squash).
function strapP(x0, y0, x1, y1, w) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * w / 2, ny = dx / l * w / 2;
  return S_([[x0 + nx, y0 + ny, 1], [x1 + nx, y1 + ny, 1], [x1 - nx, y1 - ny, 1], [x0 - nx, y0 - ny, 1]]);
}
function defTorso(id, tw) {
  const X = (x) => (tw ? x * 0.74 + 4.4 : x);
  const PLATE = S_(tw ? [[-14.4, -9], [-16.6, -20], [-17, -31], [-14.4, -39.5], [-7.4, -45.2], [4.6, -45.6], [10.4, -41.6], [13.4, -33.6], [14.2, -22], [12.4, -9]]
    : [[-13.6, -9], [-15.4, -20], [-15.8, -31], [-13.4, -39.5], [-6.5, -45.2], [6, -45.6], [13.4, -41.6], [17.2, -33.6], [18.4, -22], [15.8, -9]]);
  const xr = tw ? 14 : 17, xl = tw ? -16 : -15;
  const S1 = strapP(X(-11.5), -41.5, X(15.6), -12, 4.4), S2 = strapP(X(12.6), -42.5, X(-14.2), -12.8, 4.4);
  const dc = X(2.6), dw = tw ? 0.74 : 1;
  const DIAM = S_([[dc, -36.6, 1], [dc + 5 * dw, -30.4, 1], [dc + 0.2, -23.4, 1], [dc - 4.8 * dw, -30, 1]]);
  def(id, { box: [-18.5, -48, 21, -6], ink: INKW, bd: 95, pal: 'steel',
    layers: [{ p: PLATE, R: 10, m: 'steel', nb: [tw ? 0.04 : 0.16, 0.02] }, { p: S2, R: 1.4, z: 1, m: 'lea' }, { p: S1, R: 1.4, z: 1.5, m: 'lea' },
      { p: DIAM, R: 2.2, z: 3, m: 'brass' }, { p: MANY(CIRC(X(-10.4), -39.6, 1.5), CIRC(X(11.4), -40.6, 1.5)), R: 1, z: 2, m: 'brass' }],
    paint(g, r) {
      paintBase(g, r, PLATE, PAL.steel, [-17, -46, 19, -8], 96, { len: 7, w: 2.2, sd: 4, sa: 0.42 });
      g.save(); clipP(g, PLATE);
      blots(g, r, 4, [xl, -46, xr, -36], 4, 7, [PAL.steel.d, hex('#6a6070')], 0.25, 0.4);   // under the mantle
      blots(g, r, 3, [xr - 8, -30, xr + 1, -10], 3, 6, [PAL.steel.w], 0.2, 0.35);          // warm bounce
      taper(g, [[X(3.6), -44.6], [X(5.4), -33], [X(5.8), -20], [X(4.6), -9]], 1.1, PAL.steel.d, 0.6);   // centre ridge
      taper(g, [[X(2.6), -44], [X(4.2), -33], [X(4.6), -20], [X(3.5), -9.5]], 0.8, PAL.steel.l, 0.85);
      if (tw) taper(g, [[-12, -40], [-14.6, -28], [-13.6, -14]], 1, PAL.steel.d, 0.5);              // the back plate's edge turning toward us
      scratch(g, r, 16, [xl + 1, -42, xr, -11], 3.2, PAL.steel.d, 0.55, 20, 120, 0.4);
      scratch(g, r, 12, [xl + 1, -42, xr, -11], 2.6, PAL.steel.l, 0.6, 20, 120, 0.35);
      speck(g, r, 50, [xl, -45, xr + 1, -9], 0.35, hex('#5a5f6c'), 0.3);
      speck(g, r, 16, [xl, -45, xr + 1, -9], 0.5, hex('#8a7464'), 0.18);                    // a little rust
      taper(g, [[xl + 1, -14], [0, -12.6], [xr - 2, -13]], 0.9, PAL.steel.d, 0.6);              // lower lip of the plate
      g.restore();
      for (const Sx of [S2, S1]) {
        paintBase(g, r, Sx, PAL.lea, [-15, -44, 17, -10], 135, { len: 4, w: 1.4, sd: 2.4, grain: 0.15 });
        inner(g, Sx, 0.45, PAL.lea.d, 0.9);
      }
      dash(g, [[X(-10.6), -40.3], [X(14.8), -12.4]], 0.45, hex('#e0b07a'), 0.8, 0.9, 1);
      dash(g, [[X(11.6), -41.3], [X(-13.4), -13.4]], 0.45, hex('#e0b07a'), 0.8, 0.9, 1);
      // the faceted brass diamond: four facets
      g.save(); clipP(g, DIAM);
      fillP(g, DIAM, PAL.brass.c);
      fillP(g, S_([[dc, -36.6, 1], [dc + 0.1, -30.2, 1], [dc - 4.8 * dw, -30, 1]]), PAL.brass.l, 0.9);
      fillP(g, S_([[dc, -36.6, 1], [dc + 5 * dw, -30.4, 1], [dc + 0.1, -30.2, 1]]), PAL.brass.w, 0.8);
      fillP(g, S_([[dc + 0.1, -30.2, 1], [dc + 5 * dw, -30.4, 1], [dc + 0.2, -23.4, 1]]), PAL.brass.d, 0.85);
      line(g, [[dc - 4.8 * dw, -30], [dc + 5 * dw, -30.4]], 0.35, PAL.brass.d, 0.7); line(g, [[dc, -36.6], [dc + 0.2, -23.4]], 0.35, PAL.brass.d, 0.6);
      g.restore();
      inner(g, DIAM, 0.45, PAL.brass.d, 0.9);
      rivet(g, X(-10.4), -39.6, 1.3, PAL.brass); rivet(g, X(11.4), -40.6, 1.3, PAL.brass);
    } });
}
defTorso('torso', 0); defTorso('torsoT', 1);
function defBelt(id, tw) {
  const X = (x) => (tw ? x * 0.74 + 4.4 : x);
  const BELT = S_(tw ? [[-15.4, -15.8], [0, -16.2], [13, -16.8], [13.8, -12], [13.2, -6.6], [0, -5.8], [-15, -6.6], [-15.8, -11]]
    : [[-14.8, -15.8], [0, -16.2], [16, -16.8], [16.8, -12], [16.2, -6.6], [0, -5.8], [-14.4, -6.6], [-15.2, -11]]);
  const bx = X(6.6), bw = tw ? 0.8 : 1, BUCK = ELL(bx, -11.2, 5.3 * bw, 5.3);
  const STAR = (c) => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, R = i % 2 ? 1.5 : 3.9; const x = bx + Math.cos(a) * R * bw, y = -11.2 + Math.sin(a) * R; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); };
  const studs = [[X(-11.6), -11.2], [X(-6.8), -11.1], [X(-2), -11], [X(13.6), -11.6]].concat(tw ? [[-14, -11.2]] : []);
  def(id, { box: [-17, -19, 18.5, -4], ink: INKM, bd: 0,
    layers: [{ p: BELT, R: 3, m: 'lea' }, { p: BUCK, R: 2.6, z: 1, m: 'brass' }, { p: STAR, R: 1.2, z: 2, m: 'brass' },
      { p: MANY(...studs.map(([x, y]) => CIRC(x, y, 1.05))), R: 0.8, z: 1, m: 'brass' }],
    paint(g, r) {
      paintBase(g, r, BELT, PAL.lea, [-16, -17, 17, -5], 0, { len: 6, sd: 3 });
      dash(g, [[-14, -14.4], [0, -14.7], [tw ? 12.6 : 15.6, -15.2]], 0.45, hex('#d9a676'), 0.8);
      dash(g, [[-13.8, -8], [0, -7.3], [tw ? 12.6 : 15.6, -8]], 0.45, hex('#d9a676'), 0.8);
      inner(g, BELT, 0.45, PAL.lea.d, 0.85);
      g.save(); clipP(g, BUCK); fillP(g, BUCK, PAL.brass.c); blots(g, r, 3, [bx - 5, -16, bx + 5, -6], 2, 3.5, [PAL.brass.l, PAL.brass.d], 0.3, 0.6);
      fillP(g, ELL(bx, -11.2, 4 * bw, 4), PAL.lea.d); g.restore();
      inner(g, BUCK, 0.45, PAL.brass.d, 0.9);
      fillP(g, STAR, PAL.brass.l); inner(g, STAR, 0.35, PAL.brass.d, 0.9);
      for (const [x, y] of studs) rivet(g, x, y, 1, PAL.brass);
    } });
}
defBelt('belt', 0); defBelt('beltT', 1);
const FAULD_L = S_([[-6.4, -0.6], [7, -0.6], [7.2, 12.4], [0.6, 19.6, 1], [-6.2, 12.4]]);
const FAULD_S = S_([[-4.3, 1.4], [4.9, 1.4], [5.1, 11.6], [0.6, 16.6, 1], [-4.1, 11.6]]);
def('fauld', { box: [-7.5, -2, 8.5, 21], ink: INKM, bd: 90,
  layers: [{ p: FAULD_L, R: 2.4, m: 'lea' }, { p: FAULD_S, R: 3.5, z: 1, m: 'steel' }],
  paint(g, r) {
    paintBase(g, r, FAULD_L, PAL.lea, [-7, -1, 8, 20], 90, { len: 4 });
    inner(g, FAULD_L, 0.45, PAL.lea.d, 0.9);
    paintBase(g, r, FAULD_S, PAL.steel, [-5, 1, 6, 17], 92, { len: 5, w: 1.6, sd: 3 });
    g.save(); clipP(g, FAULD_S); scratch(g, r, 6, [-4, 2, 5, 15], 2.4, PAL.steel.l, 0.7, 90, 70); scratch(g, r, 5, [-4, 2, 5, 15], 2.4, PAL.steel.d, 0.6, 90, 70); g.restore();
    inner(g, FAULD_S, 0.45, PAL.steel.d, 0.9);
    rivet(g, -4.4, 0.6, 0.8, PAL.brass); rivet(g, 5, 0.6, 0.8, PAL.brass);
  } });
const TASN_P = S_([[-7.2, -0.6], [5.8, -0.6], [6.8, 11.6], [0, 13.8], [-7.6, 11.4]]), TASN_F = S_([[-5.6, 3], [4.8, 3], [4.8, 7.8], [-0.4, 9.6, 1], [-5.6, 7.8]]);
def('tasset', { box: [-8.5, -2, 8, 15], ink: INKM, far: true, bd: 90,
  layers: [{ p: TASN_P, R: 2.4, m: 'lea' }, { p: TASN_F, R: 1.6, z: 1, m: 'lea' }, { p: CIRC(-0.4, 6.5, 1.1), R: 0.8, z: 2, m: 'brass' }],
  paint(g, r) {
    paintBase(g, r, TASN_P, PAL.lea, [-8, -1, 7, 14], 90, { len: 4 });
    dash(g, [[-6.2, 1], [-6.6, 11], [0, 12.6], [5.6, 11], [5, 1]], 0.45, hex('#d9a676'), 0.75);
    inner(g, TASN_P, 0.45, PAL.lea.d, 0.85);
    paintBase(g, r, TASN_F, PAL.lea, [-6, 3, 5, 10], 0, { len: 3, sd: 2 });
    g.save(); clipP(g, TASN_F); fillP(g, RECT(-6, 3, 5, 4.6), PAL.lea.d, 0.4); g.restore();
    inner(g, TASN_F, 0.4, PAL.lea.d, 0.9);
    rivet(g, -0.4, 6.5, 1, PAL.brass);
  } });
const TASF_P = S_([[-3.6, -0.6], [4.2, -0.6], [4.8, 10.6], [0.4, 12.6], [-3.9, 10.2]]);
def('tassetF', { box: [-5, -2, 6, 14], ink: INKM, bd: 90,
  layers: [{ p: TASF_P, R: 2.2, m: 'lea' }, { p: S_([[-2.4, 3], [3.4, 3], [3.4, 7.4], [0.6, 8.8, 1], [-2.4, 7.4]]), R: 1.4, z: 1, m: 'lea' }],
  paint(g, r) {
    paintBase(g, r, TASF_P, PAL.lea, [-4, -1, 5, 13], 90, { len: 4 });
    inner(g, TASF_P, 0.45, PAL.lea.d, 0.85);
    inner(g, S_([[-2.4, 3], [3.4, 3], [3.4, 7.4], [0.6, 8.8, 1], [-2.4, 7.4]]), 0.4, PAL.lea.d, 0.9);
  } });
const GORGET_P = S_([[-8.8, -40.4], [1, -38.6], [11.8, -41.4], [11.2, -46.6], [1, -44.8], [-8.2, -46]]);
def('gorget', { box: [-10.5, -49, 13.5, -37], layers: [{ p: GORGET_P, R: 2.6, m: 'steel' }], ink: INKM, bd: 0,
  paint(g, r) {
    paintBase(g, r, GORGET_P, PAL.steel, [-10, -48, 13, -38], 0, { len: 4, w: 1.4, sd: 3 });
    g.save(); clipP(g, GORGET_P); taper(g, [[-8, -43.6], [1, -41.6], [11, -44]], 0.7, PAL.steel.d, 0.6); scratch(g, r, 4, [-8, -46, 11, -40], 2, PAL.steel.l, 0.7, 0, 50); g.restore();
    inner(g, GORGET_P, 0.45, PAL.steel.d, 0.85);
    rivet(g, -6, -43, 0.75, PAL.iron); rivet(g, 8.8, -43.6, 0.75, PAL.iron);
  } });
const NECK_P = S_([[-4.4, 2], [4.6, 2], [5.2, -6], [4.6, -12.5], [-3.6, -12.5], [-4.6, -6]]);
def('neck', { box: [-6, -14, 7, 4], layers: [{ p: NECK_P, R: 4, m: 'skin' }], ink: INKM, bd: 90,
  paint(g, r) { paintBase(g, r, NECK_P, PAL.skin, [-5, -13, 6, 3], 90, { len: 3, sa: 0.25 }); g.save(); clipP(g, NECK_P); blots(g, r, 3, [-4, -13, 5, -8], 3, 5, [PAL.skin.d], 0.35, 0.55); g.restore(); } });
// fur mantle: a stole over both shoulders behind the head, with long tufts hanging over the plate
const MANT_BASE = S_([[-20, -35], [-18.6, -45], [-9, -51.5], [4, -51], [14.6, -48], [21, -41.5], [19.6, -34.6], [11, -37.4], [1, -40.6], [-9.4, -37.4]]);
const MANT_LOCKS = [[-19, -38, 9, 102, 5.2, -20], [-15, -38.5, 8, 95, 4.6, 10], [-10.5, -38.5, 7, 80, 4.4, 14], [-6, -40, 5, 70, 4, 10], [8, -39.5, 6, 100, 4.2, 12],
  [12.6, -38.5, 8, 92, 4.6, -10], [17, -37.5, 9, 80, 5, -16], [20.4, -39, 7, 60, 4, -20], [-20, -43, 7, 150, 4.4, -30], [20.4, -45, 6, 20, 4, 20]];
def('mantle', { box: [-27, -56, 27, -26], ink: INKW, bd: 90,
  layers: [{ p: MANT_BASE, R: 5, m: 'fur' }].concat(MANT_LOCKS.map((L, i) => ({ p: LOCK(...L), R: 2, z: 0.5 + (i % 3) * 0.3, m: 'fur' }))),
  paint(g, r) {
    const all = MANY(MANT_BASE, ...MANT_LOCKS.map((L) => LOCK(...L)));
    fur(g, r, all, [-27, -55, 27, -27], 90, 70);
    g.save(); clipP(g, MANT_BASE); blots(g, r, 3, [-12, -52, 12, -44], 3, 6, [PAL.fur.d], 0.3, 0.5); g.restore();
  } });
const LOBE_LOCKS = [[-3, -6, 9, 160, 6, -24], [-5, -1, 10, 125, 6.2, -10], [-2.6, 2, 9, 100, 5.6, 6], [2.4, 2.4, 8, 80, 5.2, 14], [5.4, -1, 7, 50, 4.6, 20], [0, -7, 7, 200, 5, 14]];
const LOBE_BASE = S_([[-8, -7], [0, -9.5], [7.5, -6], [8.4, 1], [3, 4], [-6, 3.5], [-9.4, -1]]);
def('furLobe', { box: [-15, -13, 12, 14], ink: INKW, far: true, bd: 100,
  layers: [{ p: LOBE_BASE, R: 4, m: 'fur' }].concat(LOBE_LOCKS.map((L, i) => ({ p: LOCK(...L), R: 2, z: 0.5 + (i % 3) * 0.3, m: 'fur' }))),
  paint(g, r) { fur(g, r, MANY(LOBE_BASE, ...LOBE_LOCKS.map((L) => LOCK(...L))), [-15, -12, 12, 13], 100, 26); } });

// ---------------------------------------------------------------- head (head frame: pivot = top of the neck, +x = facing)
// book model: light golden-chestnut curly mop (round curl clumps, not spikes) with a swept-up forelock, big warm eyes,
// strong brows, a grin.  The head frame is drawn HEAD_K x larger; head parts bake at BS * HEAD_K (crisp).
const HEAD_K = 1.13;
const FACE_P = S_([[-8.8, -16.5], [-6.2, -24.5], [2, -27.6], [9.6, -24.8], [13.1, -18], [13.1, -13.4], [14.1, -10.4], [13.2, -6.4], [12.5, -3.4], [11, -0.4],
  [7.6, 1.8], [3, 1.2], [-1.6, -1.4], [-5.4, -5.6], [-8.6, -10.4]]);
const NOSE_P = S_([[12.2, -11.4], [15.7, -8.3], [15.6, -6.4], [12.6, -5.8]]);
const EAR_P = S_([[-2.6, -14.4], [-7.6, -15.6], [-10, -11.2], [-8.8, -6.4], [-5.2, -5.4], [-2.8, -8.2]]);
/** An organic curl clump: a lumpy disc whose tail flicks out toward tail (deg). */
function curlPts(x, y, r, tail, seed) {
  const R = rng(seed * 977 + 13), pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (tail + i * 45) * DEG, rr = i === 0 ? r * 1.42 : i === 1 || i === 7 ? r * (1.02 + 0.1 * R()) : r * (0.86 + 0.2 * R());
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  return pts;
}
// [x, y, r, tail angle]
const HB_CL = [[-4, -19, 6.2, 200], [1.5, -23, 6.4, 250], [-5, -11.5, 4.6, 180], [-7.6, -7.8, 3, 150], [-9.6, -11.8, 3.6, 180], [-10.4, -17.2, 3.8, 195],
  [-9.8, -22.2, 4, 210], [-7.4, -26, 4, 230], [-3.2, -28.4, 4.2, 250], [1.6, -29.2, 4.2, 265], [6.6, -28.6, 4, 285], [10.6, -26, 3.4, 310]];
const HF_CL = [[-3.2, -26.8, 3.8, 210], [1.8, -28.6, 4, 250], [6.8, -28.2, 3.8, 285], [-2, -24.4, 3.4, 150], [2.6, -26.8, 3.8, 110], [7, -27.2, 3.6, 85],
  [10.8, -25.4, 3, 60], [9.6, -23.6, 2.1, 75]];
const SIDEBURN = [-1.6, -17.5, 6.2, 97, 3.2, 8, 6, 1];
const clumpP = (C, i) => S_(curlPts(C[0], C[1], C[2], C[3], i + 1));
function paintCurls(g, r, list, seed0, mass) {
  if (mass) { fillP(g, mass, PAL.hair.c); blots(g, r, 8, [-14, -34, 14, -6], 3, 7, [PAL.hair.l, PAL.hair.w, PAL.hair.d, PAL.hair.k], 0.15, 0.4); }
  list.forEach((C, i) => {
    const [x, y, rr, tail] = C, fn = clumpP(C, seed0 + i);
    const sp = (r0, r1, a0, a1, dx = 0, dy = 0) => { const P = []; for (let k = 0; k <= 8; k++) { const t = k / 8, a = (a0 + (a1 - a0) * t) * DEG, q = lerp(r0, r1, t); P.push([x + dx + Math.cos(a) * q, y + dy + Math.sin(a) * q]); } return P; };
    g.save(); clipP(g, fn);
    blots(g, r, 2, [x - rr, y - rr, x + rr, y + rr], rr * 0.5, rr * 0.9, [PAL.hair.l, PAL.hair.w, PAL.hair.d], 0.15, 0.35);
    // the C of the curl: a soft spiral strand from the tail inward, strands following it, a lit band on top
    taper(g, sp(rr * 1.1, rr * 0.3, tail + 20, tail + 320), 0.6 + rr * 0.05, hex('#7e5024'), 0.7, 0.2, 0.3);
    taper(g, sp(rr * 0.9, rr * 0.5, tail + 50, tail + 250, 0.3, 0.2), 0.4, PAL.hair.d, 0.45, 0.3, 0.2);
    taper(g, sp(rr * 0.8, rr * 0.72, 195, 290, -0.2, -0.3), 0.8, PAL.hair.l, 0.75, 0.2, 0.2);
    taper(g, sp(rr * 0.6, rr * 0.55, 215, 265, -0.3, -0.4), 0.45, hex('#f2d391'), 0.7, 0.2, 0.2);
    g.restore();
    // separation: a partial tapered dark arc along the curl's lower edge only (no full outline)
    taper(g, sp(rr * 1.0, rr * 0.98, 15, 150), 0.55, hex('#5e3816'), 0.55, 0.1, 0.1);
  });
}
// the mop is ONE volume (union of the curls: a scalloped silhouette) plus a few big lobes, so it shades as a mass
const HB_MASS = MANY(...HB_CL.map((C, i) => clumpP(C, 100 + i))), HF_MASS = MANY(...HF_CL.map((C, i) => clumpP(C, 200 + i)));
const hbLayers = [{ p: HB_MASS, R: 7, z: 0, m: 'hair' }, { p: MANY(clumpP(HB_CL[7], 107), clumpP(HB_CL[8], 108), clumpP(HB_CL[9], 109)), R: 4, z: 0.3, m: 'hair' }];
const hfLayers = [{ p: HF_MASS, R: 5, z: 0.5, m: 'hair' }, { p: MANY(clumpP(HF_CL[4], 204), clumpP(HF_CL[5], 205), clumpP(HF_CL[6], 206)), R: 3.4, z: 0.8, m: 'hair' }];
def('headBase', { box: [-17, -36, 18, 5], ink: INKW, bd: 60, cast: 'hairFront', castD: 2.4, inkCast: true, k: HEAD_K,
  layers: hbLayers.concat([{ p: FACE_P, R: 9, z: 4, m: 'skin', nb: [0.12, 0] }, { p: EAR_P, R: 2.6, z: 5, m: 'skin' }, { p: NOSE_P, R: 2.4, z: 5.2, m: 'skin' }]),
  paint(g, r) {
    paintCurls(g, r, HB_CL, 100, HB_MASS);
    paintBase(g, r, FACE_P, PAL.skin, [-9, -28, 15, 2], 70, { len: 4, w: 1.6, sa: 0.2, blot: 0.2, grain: 0.04 });
    g.save(); clipP(g, FACE_P);
    blots(g, r, 1, [3.6, -8, 4.4, -7], 3.2, 3.5, [hex('#f29a8a')], 0.3, 0.34);          // near cheek blush
    blots(g, r, 1, [11.8, -9.2, 12.2, -8.8], 2.2, 2.4, [hex('#f29a8a')], 0.26, 0.3);    // far cheek blush
    blots(g, r, 2, [-5, -10, 0, -3], 3, 5, [PAL.skin.d], 0.22, 0.32);                     // jaw / under the ear
    blots(g, r, 2, [0, -26, 12, -20], 3, 5, [hex('#e7aa8c')], 0.2, 0.35);                 // forehead warmth
    taper(g, [[2.5, 0.2], [6, 1], [9.8, -0.4]], 0.7, PAL.skin.d, 0.5);                    // under the chin
    g.restore();
    g.save(); clipP(g, EAR_P); fillP(g, EAR_P, PAL.skin.c); blots(g, r, 2, [-9, -14, -4, -7], 2, 3, [PAL.skin.d, hex('#ee9a88')], 0.4, 0.6);
    taper(g, [[-4.4, -12.4], [-7.4, -12.8], [-8, -9.6], [-6, -7.6]], 0.75, hex('#c47c66'), 0.85); taper(g, [[-5.4, -10.8], [-6.2, -9.2]], 0.6, hex('#c47c66'), 0.7);
    g.restore();
    fillP(g, NOSE_P, PAL.skin.c); g.save(); clipP(g, NOSE_P); blots(g, r, 1, [14, -9, 15, -8], 2, 2.2, [hex('#f29a8a')], 0.35, 0.4); g.restore();
    taper(g, [[13.4, -6.6], [14.4, -6.1], [15.2, -6.5]], 0.55, hex('#b8705a'), 0.8);       // nostril
  } });
def('hairFront', { box: [-10, -36, 16, -18], ink: [0.5, 0.45], bd: 50, k: HEAD_K,
  layers: hfLayers,
  paint(g, r) {
    paintCurls(g, r, HF_CL, 200, HF_MASS);
  } });
// the swept-up forelock (spring) and loose curls at the back (springs); pivots at their roots
const FORELOCK = [[0, 0, 16, -80, 7.4, -112, 9, 1], [2.4, 0.6, 11.5, -56, 5.4, -122, 7, 1]];
function paintLocks(g, r, locks) {
  for (const L of locks) {
    const fnL = LOCK(...L);
    g.save(); clipP(g, fnL);
    fillP(g, fnL, PAL.hair.c);
    const [x, y, len, ang, w, curl] = L, mid = [];
    let px = x, py = y, a = ang * DEG;
    for (let i = 0; i <= 8; i++) { mid.push([px, py]); a += curl * DEG * (0.4 + 1.6 * i / 8) / 8; px += Math.cos(a) * len / 8; py += Math.sin(a) * len / 8; }
    blots(g, r, 2, [x - 3, y - 3, x + 3, y + 3], 2.5, 4, [PAL.hair.d], 0.35, 0.55);
    for (let s = -2; s <= 2; s++) {
      const off = s * w * 0.17, c = s < 0 ? PAL.hair.l : s > 0 ? PAL.hair.d : hex('#8a5a2a');
      const P = mid.map(([mx, my], i) => { const t = Math.atan2(mid[Math.min(8, i + 1)][1] - mid[Math.max(0, i - 1)][1], mid[Math.min(8, i + 1)][0] - mid[Math.max(0, i - 1)][0]); return [mx - Math.sin(t) * off, my + Math.cos(t) * off]; });
      taper(g, P.slice(0, 8), 0.55 + r() * 0.3, c, 0.5 + r() * 0.3, 0.3, 0.1);
    }
    taper(g, mid.slice(1, 7).map(([mx, my]) => [mx - 0.5, my - 0.4]), 0.6, hex('#f6d58f'), 0.7, 0.2, 0.1);
    g.restore();
    g.save(); g.beginPath(); fnL(g); g.lineWidth = 0.45; g.strokeStyle = css(hex('#6a3f1c'), 0.5); g.stroke(); g.restore();
  }
}
def('forelock', { box: [-10, -21, 15, 5], ink: INKW, bd: -60, k: HEAD_K,
  layers: FORELOCK.map((L, i) => ({ p: LOCK(...L), R: 3, z: i * 0.5, m: 'hair' })),
  paint(g, r) { paintLocks(g, r, FORELOCK); } });
const CURL_C = [-4, -1, 3.6, 170];
def('curl', { box: [-11, -7, 2, 5], ink: INKW, bd: 160, k: HEAD_K,
  layers: [{ p: clumpP(CURL_C, 300), R: 3, m: 'hair' }],
  paint(g, r) { paintCurls(g, r, [CURL_C], 300, clumpP(CURL_C, 300)); } });

// ---------------------------------------------------------------- arms
const D_UP = S_([[-6.6, -2], [0, -6.2], [6.6, -2.4], [6.4, 8], [5.8, 17], [4.8, 22.4], [0, 24.6], [-5, 22.4], [-6, 16], [-6.8, 6]]);
const D_SLV = S_([[-7, -3.4], [0, -6.6], [7, -3.4], [7.3, 5.6], [0, 7.8], [-7.2, 5.4]]);
function scales(g, box, dx, dy, rr, col, a, hl) {
  let row = 0;
  for (let y = box[1]; y <= box[3]; y += dy, row++) {
    for (let x = box[0] + (row % 2) * dx / 2; x <= box[2]; x += dx) {
      if (hl) fillP(g, (c) => { c.moveTo(x - rr * 0.7, y + 0.2); c.quadraticCurveTo(x, y - rr * 0.9, x + rr * 0.7, y + 0.2); c.quadraticCurveTo(x, y - rr * 0.2, x - rr * 0.7, y + 0.2); }, hl, 0.5);
      g.beginPath(); g.arc(x, y, rr, 0.12 * Math.PI, 0.88 * Math.PI); g.lineWidth = 0.55; g.strokeStyle = css(col, a); g.stroke();
    }
  }
}
function cracks(g, list, w, col, a) { for (const pts of list) taper(g, pts, w, col, a, 0.5, 0.1); }
const CR_UP = [[[3.2, 2], [1.8, 5.6], [2.6, 8.4], [0.6, 11.8], [1.4, 14.6], [-0.4, 18.6]], [[0.6, 11.8], [-2.2, 12.8], [-3.6, 15.8]], [[2.6, 8.4], [4.6, 9.8]]];
def('dUpper', { box: [-8.5, -8, 8.5, 26], ink: INKW, far: true, bd: 90,
  layers: [{ p: D_UP, R: 5.6, m: 'drag' }, { p: D_SLV, R: 4, z: 1, m: 'cloth' }],
  paint(g, r) {
    paintBase(g, r, D_UP, PAL.drag, [-7, -5, 7, 25], 90, { len: 4, w: 1.6, sa: 0.3 });
    g.save(); clipP(g, D_UP); scales(g, [-7, 5, 7, 24], 3.3, 2.7, 1.75, hex('#5e1014'), 0.75, PAL.drag.l); cracks(g, CR_UP, 0.75, hex('#2a0a0c'), 0.6); g.restore();
    paintBase(g, r, D_SLV, PAL.olive, [-7, -6, 7, 8], 0, { len: 4 });
    g.save(); clipP(g, D_SLV); taper(g, [[-6, 4], [0, 5.8], [6.4, 4]], 0.7, PAL.olive.d, 0.8); g.restore();
    inner(g, D_SLV, 0.45, hex('#3e4420'), 0.9);
  },
  emis(g, k, col, a) { cracks(g, CR_UP, 0.7 * k, col, a); } });
const D_FO = S_([[-6.2, -1.6], [0, -4.2], [6.4, -1.6], [7.2, 6], [6.8, 13], [5.8, 18.6], [-5.8, 18.6], [-6.8, 12], [-7.2, 5]]);
const D_SPINE = S_([[-6.4, 0.4], [-13, -3.6, 1], [-7, 3.2], [-6.9, 5], [-13.6, 3.6, 1], [-7.2, 8.8], [-7, 10.6], [-12, 11, 1], [-6.6, 14.4]]);
const D_WRIST = S_([[-6.4, 15.2, 1], [6.4, 15.2, 1], [6.5, 19.4, 1], [-6.5, 19.4, 1]]);
const CR_FO = [[[4.4, -1], [3, 2], [3.6, 4.2], [1.6, 6.6], [2.4, 9], [0.4, 11.4], [1, 13.6]], [[1.6, 6.6], [-0.8, 7.4], [-1.6, 9.6], [-3.8, 10.4]], [[0.4, 11.4], [2.8, 12.4]]];
def('dFore', { box: [-15, -7, 9, 21], ink: INKW, far: true, bd: 90,
  layers: [{ p: D_SPINE, R: 1.6, m: 'dark' }, { p: D_FO, R: 6, z: 1, m: 'drag' }, { p: D_WRIST, R: 1.8, z: 2, m: 'steel' }],
  paint(g, r) {
    fillP(g, D_SPINE, PAL.dark.c); g.save(); clipP(g, D_SPINE); strokes(g, r, 10, [-14, -4, -6, 15], 160, 3, 1, [PAL.dark.l], 0.3, 0.6); g.restore();
    paintBase(g, r, D_FO, PAL.drag, [-7, -4, 8, 19], 90, { len: 4, w: 1.6, sa: 0.3 });
    g.save(); clipP(g, D_FO); scales(g, [-7, -2, 8, 15], 3.4, 2.7, 1.8, hex('#5e1014'), 0.75, PAL.drag.l); cracks(g, CR_FO, 0.8, hex('#2a0a0c'), 0.6);
    taper(g, [[-5.6, -0.6], [-1, 1.4], [4.6, -0.4]], 0.8, hex('#5e1014'), 0.75); g.restore();
    paintBase(g, r, D_WRIST, PAL.steel, [-7, 15, 7, 20], 0, { len: 3, w: 1, sd: 2 });
    line(g, [[-6, 15.8], [6, 15.8]], 0.45, PAL.steel.l, 0.9); rivet(g, -4.2, 17.4, 0.7, PAL.iron); rivet(g, 4.2, 17.4, 0.7, PAL.iron);
  },
  emis(g, k, col, a) { cracks(g, CR_FO, 0.75 * k, col, a); } });
// dragon hand drawings (wrist frame; the grip centre sits at (0, GRIP))
const DH_GRIP = S_([[-6.2, -0.6], [0, -2.2], [6.2, -0.8], [7.8, 4], [6.6, 9.2], [1, 10.8], [-5.2, 9.6], [-7.2, 4.6]]);
const DH_GRIP_T = MANY(LOCK(7, 2.2, 4.6, 150, 2.4, -40), LOCK(7.2, 5.4, 4.6, 165, 2.4, -40), LOCK(6.4, 8.4, 4.2, 180, 2.2, -40));
def('dHandGrip', { box: [-9, -4, 10, 12.5], ink: INKW, far: true, bd: 0,
  layers: [{ p: DH_GRIP, R: 4.6, m: 'drag' }, { p: DH_GRIP_T, R: 1, z: 1, m: 'dark' }],
  paint(g, r) {
    paintBase(g, r, DH_GRIP, PAL.drag, [-8, -3, 9, 11], 0, { len: 3, w: 1.4 });
    g.save(); clipP(g, DH_GRIP); scales(g, [-6, -1, 7, 4], 3.2, 2.6, 1.6, hex('#5e1014'), 0.6, PAL.drag.l);
    for (const y of [2.8, 5.8, 8.6]) taper(g, [[1.4, y - 0.6], [4.4, y], [6.8, y - 0.4]], 0.7, hex('#5e1014'), 0.85);   // curled fingers
    g.restore();
    fillP(g, DH_GRIP_T, PAL.dark.c);
  } });
const DH_OPEN = S_([[-6, -0.6], [0, -2], [6, -0.8], [7.4, 5], [6, 9], [0, 10], [-6.6, 8], [-7.4, 4]]);
const DH_OPEN_F = MANY(LOCK(4.4, 8, 8, 70, 3.4, -20), LOCK(1, 9, 8.6, 88, 3.4, -14), LOCK(-2.6, 8.6, 8, 105, 3.2, -10), LOCK(-5.6, 5, 6.4, 150, 3, -20));
const DH_OPEN_T = MANY(LOCK(6.6, 14.6, 4, 40, 1.8, -50), LOCK(2.6, 17, 4, 75, 1.8, -50), LOCK(-2.8, 16.2, 4, 110, 1.8, -50), LOCK(-10.4, 6.6, 3.6, 170, 1.6, -60));
def('dHandOpen', { box: [-14, -4, 12, 21], ink: INKW, far: true, bd: 90,
  layers: [{ p: DH_OPEN, R: 4.4, m: 'drag' }, { p: DH_OPEN_F, R: 1.6, z: 1, m: 'drag' }, { p: DH_OPEN_T, R: 0.9, z: 2, m: 'dark' }],
  paint(g, r) {
    paintBase(g, r, MANY(DH_OPEN, DH_OPEN_F), PAL.drag, [-13, -3, 11, 18], 90, { len: 3, w: 1.4 });
    g.save(); clipP(g, MANY(DH_OPEN, DH_OPEN_F)); scales(g, [-6, -1, 7, 8], 3.2, 2.6, 1.6, hex('#5e1014'), 0.6, PAL.drag.l); g.restore();
    fillP(g, DH_OPEN_T, PAL.dark.c);
  } });
const DH_PT_F = LOCK(5.6, 4.4, 9, -8, 3.6, 10), DH_PT_T = LOCK(14, 4.6, 3.6, 10, 1.8, 40);
def('dHandPoint', { box: [-9, -4, 20, 12.5], ink: INKW, far: true, bd: 0,
  layers: [{ p: DH_GRIP, R: 4.6, m: 'drag' }, { p: DH_PT_F, R: 1.6, z: 1, m: 'drag' }, { p: MANY(DH_PT_T, LOCK(6.4, 8.4, 4.2, 180, 2.2, -40)), R: 1, z: 2, m: 'dark' }],
  paint(g, r) {
    paintBase(g, r, MANY(DH_GRIP, DH_PT_F), PAL.drag, [-8, -3, 15, 11], 0, { len: 3, w: 1.4 });
    g.save(); clipP(g, DH_GRIP); for (const y of [6.2, 8.8]) taper(g, [[1.4, y - 0.6], [4.4, y], [6.8, y - 0.4]], 0.7, hex('#5e1014'), 0.85); g.restore();
    fillP(g, MANY(DH_PT_T, LOCK(6.4, 8.4, 4.2, 180, 2.2, -40)), PAL.dark.c);
  } });
// shield (left, human) arm
const S_UP = S_([[-5.1, -1.6], [0, -5.2], [5.3, -1.6], [5.3, 10], [4.7, 18], [3.9, 21.4], [0, 23], [-4.1, 21.2], [-4.9, 15], [-5.4, 6]]);
const S_SLV = S_([[-6.6, -3.2], [0, -6.4], [6.6, -3.2], [7, 7], [0, 9.2], [-7, 7]]);
def('sUpper', { box: [-8.5, -8, 8.5, 25], ink: INKW, far: true, bd: 90,
  layers: [{ p: S_UP, R: 4.6, m: 'skin' }, { p: S_SLV, R: 4.2, z: 1, m: 'cloth' }],
  paint(g, r) {
    paintBase(g, r, S_UP, PAL.skin, [-6, -5, 6, 24], 90, { len: 4, sa: 0.22, grain: 0.04 });
    g.save(); clipP(g, S_UP); blots(g, r, 2, [-5, 7, 5, 11], 3, 4, [PAL.skin.d], 0.3, 0.45); g.restore();
    paintBase(g, r, S_SLV, PAL.olive, [-7, -6, 7, 9], 0, { len: 4 });
    g.save(); clipP(g, S_SLV); taper(g, [[-6, 5.6], [0, 7.6], [6.4, 5.6]], 0.7, PAL.olive.d, 0.8); taper(g, [[-3, -1], [1, 3], [4, 4]], 0.6, PAL.olive.d, 0.6); g.restore();
    inner(g, S_SLV, 0.45, hex('#3e4420'), 0.9);
  } });
const S_FO = S_([[-4.7, -1.6], [0, -4], [4.7, -1.6], [4.9, 8], [4.3, 16.6], [3.7, 19.2], [-3.7, 19.2], [-4.3, 16], [-4.9, 7]]);
const S_BR = S_([[-5.6, 3.6, 1], [5.6, 3, 1], [5.4, 15.8, 1], [-5.4, 16, 1]]);
def('sFore', { box: [-7.5, -6, 7.5, 21], ink: INKW, far: true, bd: 90,
  layers: [{ p: S_FO, R: 4.2, m: 'skin' }, { p: S_BR, R: 3.4, z: 1, m: 'lea' }],
  paint(g, r) {
    paintBase(g, r, S_FO, PAL.skin, [-5, -4, 5, 20], 90, { len: 4, sa: 0.22, grain: 0.04 });
    paintBase(g, r, S_BR, PAL.lea, [-6, 3, 6, 16], 90, { len: 4 });
    g.save(); clipP(g, S_BR);
    dash(g, [[-4.4, 4.4], [-4.3, 15.2]], 0.45, hex('#d9a676'), 0.8); dash(g, [[4.4, 3.8], [4.3, 15.2]], 0.45, hex('#d9a676'), 0.8);
    for (const y of [5.4, 9, 12.6]) { line(g, [[-2, y], [2, y + 2.6]], 0.55, PAL.brass.c, 0.9); line(g, [[2, y], [-2, y + 2.6]], 0.55, PAL.brass.c, 0.9); }
    g.restore();
    inner(g, S_BR, 0.45, PAL.lea.d, 0.9);
  } });
const SH_GRIP = S_([[-4.2, -0.6], [4.2, -0.6], [5.6, 4], [4.4, 8.2], [-0.4, 9.2], [-4.6, 7.6], [-5.2, 3.6]]);
def('sHandGrip', { box: [-7, -3, 7.5, 11], ink: INKW, far: true, bd: 0, layers: [{ p: SH_GRIP, R: 3.6, m: 'skin' }],
  paint(g, r) {
    paintBase(g, r, SH_GRIP, PAL.skin, [-6, -2, 7, 10], 0, { len: 3, sa: 0.2, grain: 0.03 });
    g.save(); clipP(g, SH_GRIP); for (const y of [3, 5.4, 7.6]) taper(g, [[0.8, y - 0.4], [3.4, y], [5.2, y - 0.4]], 0.5, hex('#c47c66'), 0.8); g.restore();
  } });
const SH_OPEN = S_([[-4.4, -0.6], [4.4, -0.6], [6.4, 5.4], [5, 11.4], [1.6, 13.4], [-1.8, 13.2], [-5, 11.2], [-6.2, 5.6]]);
def('sHandOpen', { box: [-8, -3, 8.5, 15], ink: INKW, far: true, bd: 90, layers: [{ p: SH_OPEN, R: 3.4, m: 'skin' }],
  paint(g, r) {
    paintBase(g, r, SH_OPEN, PAL.skin, [-7, -2, 7, 14], 90, { len: 3, sa: 0.2, grain: 0.03 });
    g.save(); clipP(g, SH_OPEN); for (const x of [-2.6, 0.2, 3]) taper(g, [[x, 7.4], [x + 0.2, 10.4], [x + 0.3, 12.4]], 0.5, hex('#c47c66'), 0.8); g.restore();
  } });
const SH_PT_F = LOCK(3, 3.6, 8, -6, 3, 6);
def('sHandPoint', { box: [-7, -3, 13, 11], ink: INKW, far: true, bd: 0, layers: [{ p: SH_GRIP, R: 3.6, m: 'skin' }, { p: SH_PT_F, R: 1.3, z: 1, m: 'skin' }],
  paint(g, r) {
    paintBase(g, r, MANY(SH_GRIP, SH_PT_F), PAL.skin, [-6, -2, 12, 10], 0, { len: 3, sa: 0.2, grain: 0.03 });
    g.save(); clipP(g, SH_GRIP); for (const y of [5.6, 7.8]) taper(g, [[0.8, y - 0.4], [3.4, y], [5.2, y - 0.4]], 0.5, hex('#c47c66'), 0.8); g.restore();
  } });
// pauldrons (two steel lames), pivot at the shoulder joint, drawn in a frame that follows the upper arm part way
const PAUL_A = S_([[-7.8, -3.6], [-2, -7.6], [6.6, -5.8], [8.6, 1.4], [3.6, 6.4], [-7, 5.2]]);
const PAUL_B = S_([[-7.2, 4], [3.6, 5.6], [8, 3.4], [7.6, 8.8], [3, 10.6], [-6.4, 8.8]]);
def('paul', { box: [-10, -10, 11, 12.5], ink: INKM, far: true, bd: 20,
  layers: [{ p: PAUL_B, R: 3, m: 'steel' }, { p: PAUL_A, R: 4.6, z: 1, m: 'steel', nb: [0.05, -0.1] }],
  paint(g, r) {
    for (const P of [PAUL_B, PAUL_A]) {
      paintBase(g, r, P, PAL.steel, [-9, -9, 10, 11], 20, { len: 3.5, w: 1.3, sd: 3 });
      g.save(); clipP(g, P); scratch(g, r, 4, [-7, -6, 8, 9], 2.2, PAL.steel.l, 0.7, 20, 80); scratch(g, r, 3, [-7, -6, 8, 9], 2, PAL.steel.d, 0.6, 20, 80); g.restore();
      inner(g, P, 0.45, PAL.steel.d, 0.9);
    }
    rivet(g, 0.8, -2.4, 0.9, PAL.iron); rivet(g, -4.8, -1.6, 0.7, PAL.iron); rivet(g, 5.6, -2.4, 0.7, PAL.iron);
  } });

// ---------------------------------------------------------------- whole-limb drawings + profile head (?rig2=paint / flex)
// Each limb is ONE drawing (upper + lower, straight) that the runtime bends at the joint by drawing it in thin strips
// whose rotation blends from the upper to the lower bone (strip skinning): elbows and knees flex instead of two rigid
// tubes pivoting.  The rigid parts above stay for the code-only look (?rig2=1) and for split draw orders.
/** A path function moved by (dx, dy). */
function shiftP(fn, dx, dy) {
  return (c) => fn({
    moveTo: (x, y) => c.moveTo(x + dx, y + dy), lineTo: (x, y) => c.lineTo(x + dx, y + dy),
    quadraticCurveTo: (a, b, x, y) => c.quadraticCurveTo(a + dx, b + dy, x + dx, y + dy),
    bezierCurveTo: (a, b, e, f, x, y) => c.bezierCurveTo(a + dx, b + dy, e + dx, f + dy, x + dx, y + dy),
    arc: (x, y, r, a0, a1, ccw) => c.arc(x + dx, y + dy, r, a0, a1, ccw),
    ellipse: (x, y, rx, ry, rot, a0, a1, ccw) => c.ellipse(x + dx, y + dy, rx, ry, rot, a0, a1, ccw),
    closePath: () => c.closePath(),
  });
}
def('dArmX', { box: [-15, -8, 9, UP_D + 21], ink: INKW, far: true, bd: 90, joint: UP_D, crease: [5.6, '#4a1012'],
  layers: [{ p: shiftP(D_SPINE, 0, UP_D), R: 1.6, m: 'dark' }, { p: MANY(D_UP, shiftP(D_FO, 0, UP_D)), R: 5.8, z: 1, m: 'drag' },
    { p: D_SLV, R: 4, z: 2, m: 'cloth' }, { p: shiftP(D_WRIST, 0, UP_D), R: 1.8, z: 2, m: 'steel' }],
  paint(g, r) { PARTS.dUpper.paint(g, r); g.save(); g.translate(0, UP_D); PARTS.dFore.paint(g, r); g.restore(); },
  emis(g, k, col, a) { cracks(g, CR_UP, 0.7 * k, col, a); g.save(); g.translate(0, UP_D); cracks(g, CR_FO, 0.75 * k, col, a); g.restore(); } });
def('sArmX', { box: [-8.5, -8, 8.5, UP_S + 21], ink: INKW, far: true, bd: 90, joint: UP_S, crease: [4.3, '#9a5a48'],
  layers: [{ p: MANY(S_UP, shiftP(S_FO, 0, UP_S)), R: 4.5, m: 'skin' }, { p: S_SLV, R: 4.2, z: 1, m: 'cloth' }, { p: shiftP(S_BR, 0, UP_S), R: 3.4, z: 1, m: 'lea' }],
  // the forearm first, then the upper arm over the elbow (the sleeve and the biceps sit on top)
  paint(g, r) { g.save(); g.translate(0, UP_S); PARTS.sFore.paint(g, r); g.restore(); PARTS.sUpper.paint(g, r); } });
def('legX', { box: [-9, -9, 9.5, THIGH + 30], ink: INKW, far: true, bd: 90, joint: THIGH, crease: [5.8, '#2c3014'],
  layers: [{ p: MANY(THIGH_P, shiftP(KNEEJ_P, 0, THIGH)), R: 6.4, m: 'cloth' }, { p: shiftP(SHAFT_P, 0, THIGH), R: 5.4, z: 1, m: 'lea' },
    { p: shiftP(ABAND_P, 0, THIGH), R: 1.6, z: 2, m: 'steel' }, { p: shiftP(CUFF_P, 0, THIGH), R: 3, z: 3, m: 'fur' }],
  paint(g, r) { PARTS.thigh.paint(g, r); g.save(); g.translate(0, THIGH); PARTS.shin.paint(g, r, { noKnee: true }); g.restore(); } });

// profile head: the face turned into the swing (attack contacts); same pivot and scale as the 3/4 head
const FACEP_P = S_([[-9, -16], [-7, -24.5], [0, -28], [7.5, -26.5], [11.4, -21.5], [12.3, -17.6], [11.7, -15.3], [12.6, -13.2], [14, -11.4], [16.6, -9.4], [16.2, -7.9],
  [13.5, -7.5], [13.8, -6.2], [13.2, -5], [12.7, -4.6], [13.5, -3.3], [12.9, -1.5], [11.6, 0.7], [8, 1.9], [3, 0.8], [-1.6, -1.6], [-5.6, -5.8], [-8.8, -10.4]]);
const EARP_P = S_([[0.2, -14.6], [-3.8, -15.6], [-5.6, -11.2], [-4.6, -6.6], [-1.4, -6], [0.6, -9.4]]);
const HBP_CL = HB_CL.map(([x, y, r, t]) => [x * 1.05 - 0.8, y, r, t]);
const HFP_CL = [[-7, -26.2, 4, 205], [-2.4, -28.8, 4.3, 230], [2.8, -29.4, 4.1, 258], [7.2, -27.8, 3.9, 290], [10, -25.2, 3.2, 320], [-3.6, -23.6, 3.6, 170], [1.2, -25.4, 3.5, 120], [5.6, -25.2, 3.4, 95], [8.9, -23.4, 2.5, 80], [11, -22, 1.9, 70]];
const HBP_MASS = MANY(...HBP_CL.map((C, i) => clumpP(C, 400 + i))), HFP_MASS = MANY(...HFP_CL.map((C, i) => clumpP(C, 500 + i)));
def('headBaseP', { box: [-17, -36, 19, 5], ink: INKW, bd: 60, cast: 'hairFrontP', castD: 2.4, inkCast: true, k: HEAD_K,
  layers: [{ p: HBP_MASS, R: 7, z: 0, m: 'hair' }, { p: FACEP_P, R: 9, z: 4, m: 'skin', nb: [0.22, 0] }, { p: EARP_P, R: 2.6, z: 5, m: 'skin' }],
  paint(g, r) {
    paintCurls(g, r, HBP_CL, 400, HBP_MASS);
    paintBase(g, r, FACEP_P, PAL.skin, [-9, -28, 17, 2], 70, { len: 4, w: 1.6, sa: 0.2, blot: 0.2, grain: 0.04 });
    g.save(); clipP(g, FACEP_P);
    blots(g, r, 1, [8.2, -7.6, 8.8, -7.2], 3.2, 3.5, [hex('#f29a8a')], 0.3, 0.34);          // cheek blush
    blots(g, r, 1, [15.2, -9.2, 15.6, -8.8], 1.6, 1.8, [hex('#f29a8a')], 0.3, 0.34);        // nose tip
    blots(g, r, 2, [-3, -8, 3, -2], 3, 5, [PAL.skin.d], 0.22, 0.32);                          // jaw / under the ear
    blots(g, r, 2, [2, -26, 11, -20], 3, 5, [hex('#e7aa8c')], 0.2, 0.35);
    taper(g, [[3, 0.4], [7, 1.2], [10.6, 0]], 0.7, PAL.skin.d, 0.5);
    g.restore();
    g.save(); clipP(g, EARP_P); fillP(g, EARP_P, PAL.skin.c); blots(g, r, 2, [-5, -14, 0, -7], 2, 3, [PAL.skin.d, hex('#ee9a88')], 0.4, 0.6);
    taper(g, [[-0.8, -12.6], [-3.8, -13], [-4.4, -9.8], [-2.4, -7.8]], 0.75, hex('#c47c66'), 0.85); taper(g, [[-1.8, -11], [-2.6, -9.4]], 0.6, hex('#c47c66'), 0.7);
    g.restore();
    taper(g, [[13.6, -8.4], [14.6, -7.9], [15.2, -8.2]], 0.55, hex('#b8705a'), 0.8);       // nostril
  } });
def('hairFrontP', { box: [-12, -36, 15, -18], ink: [0.5, 0.45], bd: 50, k: HEAD_K,
  layers: [{ p: HFP_MASS, R: 5, z: 0.5, m: 'hair' }],
  paint(g, r) { paintCurls(g, r, HFP_CL, 500, HFP_MASS); } });

// ---------------------------------------------------------------- club (grip frame, handle along +y) + shield
const HANDLE_P = S_([[-2.6, -6.4, 1], [2.6, -6.4, 1], [3.1, 22.6, 1], [-3.1, 22.6, 1]]);
const WRAP_P = S_([[-3, -3.6, 1], [3, -3.6, 1], [3.1, 6.6, 1], [-3.1, 6.6, 1]]);
const COLLAR_P = S_([[-4.6, 19.6, 1], [4.6, 19.6, 1], [5, 23.8, 1], [-5, 23.8, 1]]);
const BALL_R = 7.6;
const BALL_P = CIRC(0, CLUB, BALL_R);
const SPIKES_P = (c) => {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.35, w = 0.32;
    c.moveTo(Math.cos(a - w) * (BALL_R - 1) + 0, CLUB + Math.sin(a - w) * (BALL_R - 1));
    c.lineTo(Math.cos(a) * (BALL_R + 5.2), CLUB + Math.sin(a) * (BALL_R + 5.2));
    c.lineTo(Math.cos(a + w) * (BALL_R - 1), CLUB + Math.sin(a + w) * (BALL_R - 1));
    c.closePath();
  }
};
def('club', { box: [-14, -8, 14, CLUB + 14], ink: INKW, far: true, bd: 90,
  layers: [{ p: HANDLE_P, R: 2.4, m: 'wood' }, { p: WRAP_P, R: 2.2, z: 0.5, m: 'lea' }, { p: SPIKES_P, R: 1.4, z: 0.8, m: 'iron' }, { p: COLLAR_P, R: 1.6, z: 1, m: 'iron' }, { p: BALL_P, R: 6.6, z: 1.5, m: 'iron' }],
  paint(g, r) {
    paintBase(g, r, HANDLE_P, PAL.wood, [-3, -6, 3, 23], 90, { len: 6, w: 1.2, sd: 2 });
    g.save(); clipP(g, HANDLE_P); for (const x of [-1.2, 0.4, 1.6]) taper(g, [[x, 7], [x + 0.3, 14], [x - 0.2, 21]], 0.35, PAL.wood.d, 0.8); g.restore();
    paintBase(g, r, WRAP_P, PAL.lea, [-3, -4, 3, 7], 0, { len: 2, sd: 1.5 });
    for (let y = -3; y < 6.6; y += 2.1) line(g, [[-3, y], [3, y + 1.2]], 0.55, PAL.lea.d, 0.9);
    fillP(g, SPIKES_P, PAL.iron.c); g.save(); clipP(g, SPIKES_P); speck(g, r, 30, [-13, CLUB - 13, 13, CLUB + 13], 0.4, PAL.iron.d, 0.5); g.restore();
    paintBase(g, r, COLLAR_P, PAL.iron, [-5, 19, 5, 24], 0, { len: 2, w: 1, sd: 2 });
    paintBase(g, r, BALL_P, PAL.iron, [-8, CLUB - 8, 8, CLUB + 8], 30, { len: 3, w: 1.3, sd: 2.4 });
    g.save(); clipP(g, BALL_P);
    speck(g, r, 26, [-8, CLUB - 8, 8, CLUB + 8], 0.45, hex('#8a6a50'), 0.35);
    scratch(g, r, 6, [-6, CLUB - 6, 6, CLUB + 6], 2.4, PAL.iron.l, 0.7, 30, 120);
    g.restore();
    for (const [x, y] of [[-3.8, -3], [4, -2.2], [0.4, 4.4]]) rivet(g, x, CLUB + y, 0.9, PAL.iron);
  } });
const SH_R = 19.6;
function shieldFace(g, r, fn, cx, sx) {
  g.save(); clipP(g, fn);
  fillP(g, fn, PAL.wood.c);
  blots(g, r, 8, [cx - 17 * sx, -17, cx + 17 * sx, 17], 4, 9, [PAL.wood.l, PAL.wood.d, PAL.wood.w], 0.2, 0.45);
  for (let i = -2; i <= 2; i++) { const x = cx + i * 6 * sx; taper(g, [[x, -18], [x + 0.3 * sx, 0], [x, 18]], 0.9, PAL.wood.d, 0.85, 0.6, 0.6); }
  strokes(g, r, 50, [cx - 16 * sx, -16, cx + 16 * sx, 16], 90, 6, 1.1, [PAL.wood.d, PAL.wood.l], 0.2, 0.45, 8);
  // red dragon emblem
  g.save(); g.translate(cx, 0); g.scale(sx, 1);
  const EMB = S_([[-8, 7.4], [-10.4, -3.8], [-2.2, -8.4], [1, -12.8, 1], [2.2, -7.6], [8.6, -9, 1], [5.2, -4.6], [10.2, -1.2, 1], [3.6, -0.4], [-1.8, 0.4], [-2.4, 5], [0, 8.8], [6.2, 7.2, 1], [1, 12.2], [-8, 7.4]]);
  fillP(g, EMB, PAL.emb.c, 0.95); g.save(); clipP(g, EMB); blots(g, r, 4, [-10, -12, 10, 12], 2, 4, [PAL.emb.l, PAL.emb.d], 0.3, 0.55); speck(g, r, 30, [-10, -12, 10, 12], 0.5, PAL.wood.c, 0.4); g.restore();
  g.beginPath(); EMB(g); g.lineWidth = 0.6; g.strokeStyle = css(PAL.emb.d, 0.9); g.stroke();
  fillP(g, CIRC(2.6, -5, 1), hex('#ffd36a'));
  g.restore();
  scratch(g, r, 8, [cx - 14 * sx, -14, cx + 14 * sx, 14], 3, PAL.wood.l, 0.6, 10, 140);
  g.restore();
}
function rimRivets(g, cx, sx, rr) { for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.26; rivet(g, cx + Math.cos(a) * rr * sx, Math.sin(a) * rr, 0.85, PAL.iron); } }
def('shield0', { box: [-22, -22, 22, 22], ink: INKW, far: true, bd: 90,
  layers: [{ p: CIRC(0, 0, SH_R), R: 3, m: 'steel' }, { p: CIRC(0, 0, SH_R - 3.6), R: 9, z: 1, m: 'wood' }],
  paint(g, r) {
    paintBase(g, r, CIRC(0, 0, SH_R), PAL.steel, [-20, -20, 20, 20], 0, { len: 4, w: 1.4, sd: 3 });
    shieldFace(g, r, CIRC(0, 0, SH_R - 3.6), 0, 1);
    g.save(); g.beginPath(); g.arc(0, 0, SH_R - 3.6, 0, TAU); g.lineWidth = 0.9; g.strokeStyle = css(PAL.wood.d, 0.95); g.stroke(); g.restore();
    rimRivets(g, 0, 1, SH_R - 1.8);
  } });
const SH3_EDGE = ELL(-3, 0, 12.4, SH_R), SH3_RIM = ELL(0, 0, 12.4, SH_R), SH3_FACE = ELL(0.4, 0, 9.6, SH_R - 3.6);
def('shield1', { box: [-18, -22, 15, 22], ink: INKW, far: true, bd: 90,
  layers: [{ p: SH3_EDGE, R: 2, m: 'wood' }, { p: SH3_RIM, R: 3, z: 0.6, m: 'steel' }, { p: SH3_FACE, R: 7, z: 1.4, m: 'wood' }],
  paint(g, r) {
    paintBase(g, r, SH3_EDGE, PAL.wood, [-16, -20, 10, 20], 90, { len: 4 });
    g.save(); clipP(g, SH3_EDGE); fillP(g, SH3_EDGE, PAL.wood.d, 0.45); g.restore();
    paintBase(g, r, SH3_RIM, PAL.steel, [-13, -20, 13, 20], 90, { len: 4, w: 1.4, sd: 3 });
    shieldFace(g, r, SH3_FACE, 0.4, 0.64);
    rimRivets(g, 0, 0.64, SH_R - 1.8);
  } });
const SH2_EDGE = ELL(-2.6, 0, 5.4, SH_R), SH2_RIM = ELL(0, 0, 4.8, SH_R);
def('shield2', { box: [-10, -22, 7, 22], ink: INKW, far: true, bd: 90,
  layers: [{ p: SH2_EDGE, R: 2, m: 'wood' }, { p: SH2_RIM, R: 2.4, z: 0.6, m: 'steel' }, { p: ELL(0.4, 0, 3, SH_R - 3.4), R: 2.6, z: 1.2, m: 'wood' }],
  paint(g, r) {
    paintBase(g, r, SH2_EDGE, PAL.wood, [-9, -20, 4, 20], 90, { len: 4 });
    paintBase(g, r, SH2_RIM, PAL.steel, [-5, -20, 5, 20], 90, { len: 4, w: 1.2, sd: 3 });
    paintBase(g, r, ELL(0.4, 0, 3, SH_R - 3.4), PAL.wood, [-3, -17, 4, 17], 90, { len: 4 });
    g.save(); clipP(g, ELL(0.4, 0, 3, SH_R - 3.4)); fillP(g, ELL(1.2, -2, 1.8, 7), PAL.emb.c, 0.8); g.restore();
  } });

// ---------------------------------------------------------------- face features (head frame, unlit, own linework)
const EYE_N = [4.6, -12.6], EYE_F = [11.1, -12.9];
const IRIS = [hex('#4a2810'), hex('#8a5226'), hex('#c58b45')];
function eyeWhite(c, cx, cy, rx, ry, top = 0) {
  c.moveTo(cx - rx, cy + 0.3);
  c.bezierCurveTo(cx - rx, cy - ry * 1.05 + top, cx + rx, cy - ry * 1.15 + top, cx + rx, cy - 0.2);
  c.bezierCurveTo(cx + rx, cy + ry * 0.95, cx - rx, cy + ry * 0.95, cx - rx, cy + 0.3);
}
function eyeOpen(g, cx, cy, rx, ry, ix, iy, o = {}) {
  const top = o.top || 0, ir = o.ir ?? Math.min(rx * 0.9, 2.35), dragon = o.dragon;
  const W = (c) => eyeWhite(c, cx, cy, rx, ry, top);
  g.save(); clipP(g, W);
  fillP(g, W, hex('#fff8ef'));
  fillP(g, ELL(cx, cy - ry * 0.55 + top * 0.5, rx * 1.2, ry * 0.6), hex('#e9d6cc'), 0.8);          // lid shadow on the eyeball
  const X = cx + ix, Y = cy + iy + 0.4;
  const gr = g.createRadialGradient(X, Y + ir * 0.3, 0, X, Y, ir);
  const ic = dragon ? [hex('#7a2a08'), hex('#e0701a'), hex('#ffd04a')] : IRIS;
  gr.addColorStop(0, css(ic[2])); gr.addColorStop(0.55, css(ic[1])); gr.addColorStop(1, css(ic[0]));
  g.fillStyle = gr; g.beginPath(); g.ellipse(X, Y, ir * (o.isx ?? 0.92), ir, 0, 0, TAU); g.fill();
  g.lineWidth = 0.4; g.strokeStyle = css(hex('#2a160a'), 0.9); g.stroke();
  if (dragon) fillP(g, ELL(X, Y, ir * 0.22, ir * 0.78), hex('#1a0806'));
  else fillP(g, ELL(X + 0.1, Y + 0.1, ir * 0.42, ir * 0.48), hex('#1c0e08'));
  fillP(g, ELL(X - ir * 0.38, Y - ir * 0.42, ir * 0.36, ir * 0.32), hex('#ffffff'));
  fillP(g, CIRC(X + ir * 0.42, Y + ir * 0.38, ir * 0.15), hex('#ffffff'), 0.9);
  g.restore();
  // lids: a heavy tapered lash line on top, a thin lower lid
  taper(g, [[cx - rx - 0.5, cy + 0.2], [cx - rx * 0.4, cy - ry * 0.98 + top], [cx + rx * 0.5, cy - ry * 1.02 + top], [cx + rx + 0.7, cy - 0.4 + top * 0.3]], o.lw ?? 1.15, INKC, 1, 0.35, 0.55);
  taper(g, [[cx - rx * 0.6, cy + ry * 0.78], [cx + rx * 0.1, cy + ry * 0.92], [cx + rx * 0.75, cy + ry * 0.6]], 0.42, hex('#7a4a3a'), 0.7, 0.2, 0.2);
}
function eyesPair(g, kind, lx, ly) {
  const dx = lx * 0.75, dy = ly * 0.8;
  const N = EYE_N, F = EYE_F;
  if (kind === 'open' || kind === 'wide' || kind === 'focus' || kind === 'dragon' || kind === 'half') {
    const top = kind === 'focus' || kind === 'dragon' ? 1.2 : kind === 'half' ? 2.6 : kind === 'wide' ? -0.5 : 0;
    const ir = kind === 'wide' ? 1.85 : undefined, dragon = kind === 'dragon';
    eyeOpen(g, N[0], N[1], 2.75, 3.25, dx, dy, { top, ir, dragon });
    eyeOpen(g, F[0], F[1], 2.0, 3.15, dx * 0.8 + 0.35, dy, { top, ir: ir ? ir * 0.85 : 1.85, isx: 0.7, dragon });
    if (kind === 'focus' || kind === 'dragon') {   // angry slant: lids cut toward the nose
      taper(g, [[N[0] - 2.6, N[1] - 2.4], [N[0] + 0.4, N[1] - 2.2], [N[0] + 3, N[1] - 1.2]], 1.2, INKC, 1, 0.4, 0.8);
      taper(g, [[F[0] - 2.2, F[1] - 1.4], [F[0] + 0.2, F[1] - 2.2], [F[0] + 2.2, F[1] - 2.4]], 1.1, INKC, 1, 0.8, 0.4);
    }
  } else if (kind === 'closed' || kind === 'happy' || kind === 'ouch') {
    for (const [E, rx, s] of [[N, 2.8, 1], [F, 2.0, 0.85]]) {
      if (kind === 'closed') taper(g, [[E[0] - rx - 0.4, E[1] - 0.2], [E[0], E[1] + 1.1], [E[0] + rx + 0.4, E[1] - 0.4]], 1.1 * s, INKC, 1, 0.35, 0.5);
      else if (kind === 'happy') taper(g, [[E[0] - rx, E[1] + 0.9], [E[0], E[1] - 1.8], [E[0] + rx, E[1] + 0.7]], 1.3 * s, INKC, 1, 0.35, 0.35);
      else { taper(g, [[E[0] - rx, E[1] - 1.8], [E[0] + rx * 0.6, E[1] - 0.2], [E[0] - rx * 0.7, E[1] + 1.3]], 1.15 * s, INKC, 1, 0.3, 0.3); }
    }
  }
}
function brows(g, kind) {
  const C = hex('#6b3d1a');
  const P = {
    neutral: [[[1.2, -16.6], [4, -18.4], [7.4, -17.8]], [[9.6, -18.2], [11.6, -18.7], [13.4, -17.6]]],
    angry: [[[1.2, -18], [4.4, -17.9], [7.6, -16.2]], [[9.4, -16.6], [11.6, -18.2], [13.4, -18.4]]],
    raised: [[[1.2, -18.4], [4, -20.6], [7.4, -20]], [[9.6, -20.2], [11.6, -20.9], [13.4, -19.6]]],
    worried: [[[1.4, -17.8], [4.4, -18.6], [7.4, -19.8]], [[9.6, -20], [11.4, -19.2], [13.2, -18.2]]],
    smug: [[[1.2, -18], [4, -20], [7.4, -19.6]], [[9.4, -16.8], [11.6, -18.2], [13.4, -18.2]]],
  }[kind] || null;
  if (!P) return;
  taper(g, P[0], 2.1, C, 1, 0.75, 0.25); taper(g, P[1], 1.7, C, 1, 0.75, 0.25);
  taper(g, P[0].map(([x, y]) => [x + 0.2, y - 0.3]), 0.6, hex('#9a6a3a'), 0.7, 0.4, 0.2);
}
const MOUTH_D = hex('#6b2228'), TEETH = hex('#fffaf2'), TONGUE = hex('#e0726c'), LIP = hex('#b05a4e');
function mouth(g, kind) {
  const ink = (pts, w = 0.85) => taper(g, pts, w, INKC, 1, 0.3, 0.3);
  if (kind === 'smile') { ink([[6.4, -5.2], [9.2, -3.6], [12.4, -5.2]], 0.9); taper(g, [[8.4, -2.6], [9.6, -2.2], [10.8, -2.6]], 0.5, LIP, 0.6); return; }
  if (kind === 'flat') { ink([[6.8, -4.4], [9.6, -4], [12.2, -4.6]], 0.85); return; }
  if (kind === 'smirk') { ink([[7, -4.2], [10, -4.2], [12.6, -5.8]], 0.9); return; }
  if (kind === 'o') { const M = ELL(10, -3.8, 1.5, 1.8); fillP(g, M, MOUTH_D); g.beginPath(); M(g); g.lineWidth = 0.7; g.strokeStyle = css(INKC); g.stroke(); return; }
  if (kind === 'puff') {
    fillP(g, ELL(13.4, -7.4, 2.6, 2.6), PAL.skin.c); g.beginPath(); g.arc(13.4, -7.4, 2.6, -1.2, 1.6); g.lineWidth = 0.9; g.strokeStyle = css(INKC); g.stroke();
    fillP(g, ELL(13.2, -7.6, 1.2, 1), hex('#f08d80'), 0.6);
    ink([[8.6, -4.2], [10, -3.8], [11.4, -4.2]], 0.8); return;
  }
  let M, teethTop = true, tongue = true;
  if (kind === 'grin') M = S_([[5.8, -6.2], [9.4, -5.8], [12.8, -6.4], [12.2, -4], [9.6, -1.6], [6.8, -4]]);
  else if (kind === 'open') M = S_([[7, -5.6], [10, -5.4], [12.4, -5.8], [11.6, -2.4], [9.6, -1.4], [7.6, -2.8]]);
  else if (kind === 'yell' || kind === 'breathe') M = S_([[6.6, -6.6], [9.8, -6.6], [13.2, -7], [12.4, -2], [9.8, 0.4], [7.2, -2.2]]);
  else if (kind === 'grit') { M = S_([[6.4, -5.8, 1], [12.8, -6, 1], [12.4, -2.8, 1], [6.8, -2.8, 1]]); tongue = false; }
  else if (kind === 'ouch') { M = S_([[6.6, -5.6], [9, -6.2], [10.6, -5.2], [12.8, -6], [12.2, -2.8], [9.6, -2], [7, -3]]); tongue = false; }
  else return;
  g.save(); clipP(g, M); fillP(g, M, MOUTH_D);
  if (tongue) fillP(g, ELL(9.8, kind === 'yell' || kind === 'breathe' ? -0.6 : -1.2, 3.6, 2), TONGUE);
  if (teethTop) fillP(g, RECT(5, -8, 14, kind === 'grit' ? -4.4 : kind === 'yell' || kind === 'breathe' ? -5.5 : -4.4), TEETH);
  if (kind === 'grit') { fillP(g, RECT(5, -4.1, 14, -2), TEETH); line(g, [[6.4, -4.25], [12.8, -4.25]], 0.4, hex('#b0a49c'), 1); for (const x of [8.4, 10.6]) line(g, [[x, -6], [x, -2.8]], 0.3, hex('#c8bcb4'), 1); }
  if (kind === 'breathe') fillP(g, ELL(9.8, -3, 2.4, 1.6), hex('#ffcf5a'), 0.9);
  g.restore();
  g.beginPath(); M(g); g.lineWidth = 0.8; g.lineJoin = 'round'; g.strokeStyle = css(INKC); g.stroke();
  if (kind === 'grin') { taper(g, [[5.2, -6.8], [5.8, -6.1], [6, -5.2]], 0.6, INKC, 0.9, 0.3, 0.6); taper(g, [[13.5, -7], [12.9, -6.3], [12.9, -5.4]], 0.6, INKC, 0.9, 0.3, 0.6); }
}
const EYE_KINDS = ['open', 'half', 'closed', 'happy', 'focus', 'wide', 'ouch', 'dragon'];
for (const k of EYE_KINDS) {
  const looks = k === 'open' || k === 'wide' ? [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((y) => [x, y])) : [[0, 0]];
  for (const [lx, ly] of looks) def(`eyes_${k}_${lx}_${ly}`, { box: [0, -18, 15, -8], unlit: true, k: HEAD_K, paint(g) { eyesPair(g, k, lx, ly); } });
}
for (const k of ['neutral', 'angry', 'raised', 'worried', 'smug']) def(`brow_${k}`, { box: [0, -23, 15, -14], unlit: true, k: HEAD_K, paint(g) { brows(g, k); } });
for (const k of ['smile', 'flat', 'smirk', 'o', 'puff', 'grin', 'open', 'yell', 'breathe', 'grit', 'ouch']) def(`mouth_${k}`, { box: [3, -11, 17, 2], unlit: true, k: HEAD_K, paint(g) { mouth(g, k); } });
// profile features (head frame, unlit): one eye at the front, brow, mouth on the profile line
const EYEP = [9.8, -12.9];
function eyeProfile(g, kind) {
  const [cx, cy] = EYEP;
  if (kind === 'closed') { taper(g, [[cx - 2.1, cy - 0.1], [cx - 0.2, cy + 0.9], [cx + 1.7, cy - 0.3]], 1.1, INKC, 1, 0.35, 0.5); return; }
  if (kind === 'happy') { taper(g, [[cx - 2, cy + 0.8], [cx - 0.2, cy - 1.6], [cx + 1.6, cy + 0.6]], 1.25, INKC, 1, 0.35, 0.35); return; }
  if (kind === 'ouch') { taper(g, [[cx + 1.6, cy - 1.8], [cx - 1.4, cy - 0.1], [cx + 1.6, cy + 1.4]], 1.1, INKC, 1, 0.3, 0.3); return; }
  const top = kind === 'focus' || kind === 'dragon' ? 1.1 : kind === 'wide' ? -0.6 : 0, dragon = kind === 'dragon';
  const Wp = (c) => { c.moveTo(cx - 2, cy + 0.2); c.quadraticCurveTo(cx - 0.6, cy - 3.3 + top, cx + 1.6, cy - 0.7 + top * 0.5); c.quadraticCurveTo(cx + 1, cy + 2.6, cx - 2, cy + 0.2); };
  g.save(); clipP(g, Wp);
  fillP(g, Wp, hex('#fff8ef'));
  fillP(g, ELL(cx, cy - 1.8 + top * 0.5, 2.6, 1.2), hex('#e9d6cc'), 0.8);
  const X = cx + 0.55, Y = cy + 0.1, ir = kind === 'wide' ? 1.7 : 2.05;
  const ic = dragon ? [hex('#7a2a08'), hex('#e0701a'), hex('#ffd04a')] : IRIS;
  const gr = g.createRadialGradient(X, Y + ir * 0.3, 0, X, Y, ir);
  gr.addColorStop(0, css(ic[2])); gr.addColorStop(0.55, css(ic[1])); gr.addColorStop(1, css(ic[0]));
  g.fillStyle = gr; g.beginPath(); g.ellipse(X, Y, ir * 0.55, ir, 0, 0, TAU); g.fill();
  fillP(g, ELL(X + 0.15, Y + 0.1, ir * 0.25, ir * 0.45), dragon ? hex('#1a0806') : hex('#1c0e08'));
  fillP(g, ELL(X - 0.25, Y - ir * 0.45, ir * 0.22, ir * 0.3), hex('#ffffff'));
  g.restore();
  taper(g, [[cx - 2.2, cy + 0.1], [cx - 0.7, cy - 3.1 + top], [cx + 1.6, cy - 0.8 + top * 0.5], [cx + 2.5, cy - 1.6 + top * 0.3]], 1.25, INKC, 1, 0.35, 0.3);
  taper(g, [[cx - 1.2, cy + 1.2], [cx + 0.3, cy + 1.8], [cx + 1.2, cy + 1]], 0.42, hex('#7a4a3a'), 0.7, 0.2, 0.2);
  if (top > 0) taper(g, [[cx - 2, cy - 2.4], [cx, cy - 2.2], [cx + 2.2, cy - 0.9]], 1.15, INKC, 1, 0.4, 0.7);
}
function browProfile(g, kind) {
  const P = { neutral: [[6.4, -17.2], [9.2, -18.5], [11.8, -17.8]], angry: [[6.4, -18.6], [9.4, -18], [12, -16.6]], raised: [[6.4, -19], [9.2, -20.6], [11.8, -19.8]],
    worried: [[6.4, -18.2], [9.2, -19.6], [11.6, -20.2]], smug: [[6.4, -18], [9.2, -19.4], [11.8, -18.8]] }[kind];
  if (!P) return;
  taper(g, P, 2.1, hex('#6b3d1a'), 1, 0.75, 0.25);
  taper(g, P.map(([x, y]) => [x + 0.2, y - 0.3]), 0.6, hex('#9a6a3a'), 0.7, 0.4, 0.2);
}
function mouthProfile(g, kind) {
  if (kind === 'smile' || kind === 'flat' || kind === 'smirk' || kind === 'puff') { taper(g, [[10.6, -4.6], [12.2, -4.7], [13.2, -5.4]], 0.9, INKC, 1, 0.3, 0.3); return; }
  if (kind === 'o' || kind === 'open') { const M = ELL(12.9, -4.6, 0.9, 1.4); fillP(g, M, MOUTH_D); g.beginPath(); M(g); g.lineWidth = 0.7; g.strokeStyle = css(INKC); g.stroke(); return; }
  let M, tongue = true;
  if (kind === 'grin') M = S_([[10.2, -5.5], [13.7, -6.3, 1], [13.5, -3.8], [11, -4.4]]);
  else if (kind === 'yell' || kind === 'breathe') M = S_([[9.8, -6.1], [14.4, -7.6, 1], [14, -1.2, 1], [10.6, -3.6]]);
  else { M = S_([[10.2, -5.9, 1], [13.9, -6.3, 1], [13.7, -3.3, 1], [10.6, -3.6, 1]]); tongue = false; }   // grit / ouch
  g.save(); clipP(g, M); fillP(g, M, MOUTH_D);
  if (tongue) fillP(g, ELL(12.6, kind === 'yell' || kind === 'breathe' ? -1.8 : -3.4, 2.4, 1.4), TONGUE);
  fillP(g, RECT(9, -9, 16, kind === 'yell' || kind === 'breathe' ? -5.8 : -4.9), TEETH);
  if (!tongue) { fillP(g, RECT(9, -4.6, 16, -2), TEETH); line(g, [[10.4, -4.75], [13.9, -4.75]], 0.4, hex('#b0a49c'), 1); }
  if (kind === 'breathe') fillP(g, ELL(13, -3.6, 1.6, 1.2), hex('#ffcf5a'), 0.9);
  g.restore();
  g.beginPath(); M(g); g.lineWidth = 0.8; g.lineJoin = 'round'; g.strokeStyle = css(INKC); g.stroke();
}
for (const k of ['open', 'focus', 'closed', 'happy', 'wide', 'ouch', 'dragon']) def(`eyesP_${k}`, { box: [5, -18, 15, -8], unlit: true, k: HEAD_K, paint(g) { eyeProfile(g, k); } });
for (const k of ['neutral', 'angry', 'raised', 'worried', 'smug']) def(`browP_${k}`, { box: [5, -23, 14, -14], unlit: true, k: HEAD_K, paint(g) { browProfile(g, k); } });
for (const k of ['smile', 'o', 'grin', 'yell', 'breathe', 'grit']) def(`mouthP_${k}`, { box: [8, -10, 17, 1], unlit: true, k: HEAD_K, paint(g) { mouthProfile(g, k); } });

// ================================================================================================ bake
const SPR = {};
const STATS = { parts: 0, sprites: 0, px: 0, ms: 0 };
function rasterMask(fn, W, H, ox, oy, bs) {
  const g = scratchCtx(W, H);
  g.setTransform(bs, 0, 0, bs, ox, oy); g.beginPath(); fn(g); g.fillStyle = '#fff'; g.fill();
  const d = g.getImageData(0, 0, W, H).data, a = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) a[i] = d[i * 4 + 3];
  return a;
}
// painted albedo (?rig2=paint): id -> { img, x, y, w, h, ss, ox, oy, dx, dy } = a region of a painted sheet, its scale
// (px per local px), the part origin inside it, and (for aliases cut from a whole-limb drawing) the offset of that
// drawing's origin in this part's local frame.  PAINT_LIGHT = how much of the light bake goes on top of painted parts.
const PAINTED = {};
let PAINT_LIGHT = 1;
/** Everything the shading needs for one part at bake scale bs: albedo, masks, normals, distances, occlusion... */
function partFields(id, P, bs) {
  const M = 4.5, [x0, y0, x1, y1] = P.box;
  const W = Math.ceil((x1 - x0 + 2 * M) * bs), H = Math.ceil((y1 - y0 + 2 * M) * bs), ox = (-x0 + M) * bs, oy = (-y0 + M) * bs, N = W * H;
  const r = rng([...id].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7));
  // albedo (over the part's base colour, so overlaps of union paths never leave holes)
  const gA = scratchCtx(W, H);
  if (!P.unlit) { const pal = PAL[P.pal || { cloth: 'olive', drag: 'drag', steel: 'steel', lea: 'lea', fur: 'fur', hair: 'hair', skin: 'skin', wood: 'wood', iron: 'iron', dark: 'dark', brass: 'brass' }[P.layers[0].m]]; gA.fillStyle = css(pal.c); gA.fillRect(0, 0, W, H); }
  gA.setTransform(bs, 0, 0, bs, ox, oy); gA.lineJoin = 'round';
  P.paint(gA, r);
  const pr = PAINTED[id];
  if (pr) {
    const k = bs / pr.ss;
    gA.setTransform(1, 0, 0, 1, 0, 0); gA.imageSmoothingEnabled = true; gA.imageSmoothingQuality = 'high';
    gA.drawImage(pr.img, pr.x, pr.y, pr.w, pr.h, ox - pr.ox * k + (pr.dx || 0) * bs, oy - pr.oy * k + (pr.dy || 0) * bs, pr.w * k, pr.h * k);
  }
  const alb = gA.getImageData(0, 0, W, H).data;
  if (P.unlit) return { W, H, ox, oy, bs, alb, unlit: true };
  // layers -> masks, top layer per pixel, per-layer height -> normals
  const L = P.layers, nL = L.length, masks = L.map((l) => rasterMask(l.p, W, H, ox, oy, bs));
  const alpha = new Uint8Array(N), top = new Uint8Array(N).fill(255);
  for (let li = 0; li < nL; li++) { const m = masks[li]; for (let i = 0; i < N; i++) { if (m[i] > alpha[i]) alpha[i] = m[i]; if (m[i] >= 110) top[i] = li; } }
  for (let i = 0; i < N; i++) if (top[i] === 255 && alpha[i]) { let b = 0, bv = -1; for (let li = 0; li < nL; li++) if (masks[li][i] > bv) { bv = masks[li][i]; b = li; } top[i] = b; }
  const nx = new Float32Array(N), ny = new Float32Array(N), nz = new Float32Array(N).fill(1);
  for (let li = 0; li < nL; li++) {
    const l = L[li], m = masks[li], out = new Uint8Array(N);
    let any = false;
    for (let i = 0; i < N; i++) { out[i] = m[i] < 128 ? 1 : 0; if (top[i] === li) any = true; }
    if (!any) continue;
    const d = edt(out, W, H), R = (l.R || 4) * bs, h = new Float32Array(N);
    for (let i = 0; i < N; i++) { const u = Math.min(1, Math.max(0, d[i] - 0.5 + m[i] / 255 * 0.5) / R); h[i] = R * Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u))); }
    const hb = boxBlur(h, W, H, Math.max(1, Math.round(bs / 2))), tb = l.nb || [0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (top[i] !== li) continue;
      const gx = (hb[y * W + Math.min(W - 1, x + 1)] - hb[y * W + Math.max(0, x - 1)]) * 0.5, gy = (hb[Math.min(H - 1, y + 1) * W + x] - hb[Math.max(0, y - 1) * W + x]) * 0.5;
      let a = -gx + tb[0], b = -gy + tb[1], c = 1; const q = Math.hypot(a, b, c); nx[i] = a / q; ny[i] = b / q; nz[i] = c / q;
    }
  }
  // union inside / outside distance (+ outward direction for the ink)
  const inside = new Uint8Array(N), outside = new Uint8Array(N);
  for (let i = 0; i < N; i++) { inside[i] = alpha[i] >= 128 ? 1 : 0; outside[i] = 1 - inside[i]; }
  const din = edt(outside, W, H);
  let inkA = alpha, dout;
  if (P.inkCast && P.cast) {
    const castM = new Uint8Array(N);
    for (const l of PARTS[P.cast].layers) { const m = rasterMask(l.p, W, H, ox, oy, bs); for (let i = 0; i < N; i++) if (m[i] > castM[i]) castM[i] = m[i]; }
    inkA = new Uint8Array(N); const ins = new Uint8Array(N);
    for (let i = 0; i < N; i++) { inkA[i] = Math.max(alpha[i], castM[i]); ins[i] = inkA[i] >= 128 ? 1 : 0; }
    dout = edt(ins, W, H);
  } else dout = edt(inside, W, H);
  // occlusion from higher layers (z), and a cast-shadow mask from another part in the same frame
  const zOf = L.map((l) => l.z || 0), ao = new Float32Array(N).fill(1);
  const zs = [...new Set(zOf)].sort((a, b) => a - b);
  for (const z of zs.slice(0, -1)) {
    const hi = new Uint8Array(N); let any = false;
    for (let i = 0; i < N; i++) if (alpha[i] && zOf[top[i]] > z) { hi[i] = 1; any = true; }
    if (!any) continue;
    const dd = edt(hi, W, H);
    for (let i = 0; i < N; i++) if (alpha[i] && zOf[top[i]] === z) ao[i] *= 1 - 0.32 * Math.exp(-dd[i] / (1.4 * bs));
  }
  let cast = null;
  if (P.cast) {
    cast = new Uint8Array(N);
    for (const l of PARTS[P.cast].layers) { const m = rasterMask(l.p, W, H, ox, oy, bs); for (let i = 0; i < N; i++) if (m[i] > cast[i]) cast[i] = m[i]; }
  }
  // brush noise (streaks along bd) in local px
  const bn = new Float32Array(N), ca = Math.cos((P.bd || 0) * DEG), sa = Math.sin((P.bd || 0) * DEG), seed = (r() * 1e6) | 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lx = (x - ox) / bs, ly = (y - oy) / bs, u = lx * ca + ly * sa, v = -lx * sa + ly * ca;
    bn[y * W + x] = 0.55 * vnoise(u / 3.2, v / 0.9, seed) + 0.3 * vnoise(u / 1.4, v / 0.5, seed + 7) + 0.15 * vnoise(lx / 0.45, ly / 0.45, seed + 13);
  }
  // emissive
  let emis = null;
  if (P.emis) { const gE = scratchCtx(W, H); gE.setTransform(bs, 0, 0, bs, ox, oy); P.emis(gE, 1, hex('#ffd468'), 1); emis = gE.getImageData(0, 0, W, H).data; }
  return { W, H, ox, oy, bs, k: P.k || 1, alb, alpha, inkA, top, nx, ny, nz, din, dout, ao, cast, bn, emis, mats: L.map((l) => MAT[l.m]), zOf, painted: !!pr };
}
function bakePart(id, P) {
  const bs = BS * (P.k || 1), F = partFields(id, P, bs), { W, H, ox, oy } = F, N = W * H;
  STATS.parts++;
  if (F.unlit) {
    const s = alloc(W, H); s.cx.putImageData(new ImageData(new Uint8ClampedArray(F.alb), W, H), s.x, s.y);
    SPR[id] = { W, H, ox, oy, bs, nb: 1, fill: [s], ink: null };
    STATS.sprites++; STATS.px += N;
    return;
  }
  const pl = F.painted ? PAINT_LIGHT : 1;
  const ent = SPR[id] = { W, H, ox, oy, bs, nb: NB, fill: [], ink: P.ink ? [] : null, emis: null };
  const entF = P.far ? (SPR[id + '_F'] = { W, H, ox, oy, bs, nb: NB, fill: [], ink: P.ink ? [] : null, emis: null }) : null;
  const buf = new ImageData(W, H);
  for (let b = 0; b < NB; b++) {
    for (const [e, dim] of entF ? [[ent, 0], [entF, 1]] : [[ent, 0]]) {
      shade(F, PHI0 + b * TAU / NB, buf.data, { dim, castD: P.castD || 2, pl });
      const s = alloc(W, H); s.cx.putImageData(buf, s.x, s.y); e.fill.push(s);
      STATS.sprites++; STATS.px += N;
    }
  }
  if (P.ink) {
    for (let b = 0; b < NI; b++) {
      inkShade(F, PHI0 + b * TAU / NI, buf.data, P.ink);
      const s = alloc(W, H); s.cx.putImageData(buf, s.x, s.y); ent.ink.push(s); if (entF) entF.ink.push(s);
      STATS.sprites++; STATS.px += N;
    }
  }
  if (P.emis) {   // pulsing glow overlay: the emissive lines with a soft halo, drawn additively
    const gG = scratchCtx(W, H);
    gG.setTransform(bs, 0, 0, bs, ox, oy);
    P.emis(gG, 5, hex('#ff6a10'), 0.16); P.emis(gG, 3.2, hex('#ff8a20'), 0.22); P.emis(gG, 1.8, hex('#ffb040'), 0.45); P.emis(gG, 0.9, hex('#fff2b0'), 0.8);
    const gl = gG.getImageData(0, 0, W, H);
    const s = alloc(W, H); s.cx.putImageData(gl, s.x, s.y); ent.emis = s; if (entF) entF.emis = s;
    STATS.sprites++; STATS.px += N;
  }
}
/** A part rendered for the painted-sheet guides (tools/rig2d/guides.html): lit softly from above (part-local), with its
 *  ink silhouette, at ss px per local px.  Returns { canvas, W, H, ox, oy }. */
export function guideCanvas(id, ss) {
  const P = PARTS[id], F = partFields(id, P, ss * (P.k || 1));
  const [c, g] = canvas(F.W, F.H);
  const buf = new ImageData(F.W, F.H), [c2, g2] = canvas(F.W, F.H);
  if (P.ink) { inkShade(F, -Math.PI / 2, buf.data, P.ink); g2.putImageData(buf, 0, 0); g.drawImage(c2, 0, 0); }
  shade(F, -Math.PI / 2, buf.data, { castD: P.castD || 2, pl: 0.75 });
  g2.putImageData(buf, 0, 0); g.drawImage(c2, 0, 0);
  return { canvas: c, W: F.W, H: F.H, ox: F.ox, oy: F.oy };
}
/** Per-pixel shading for one light direction phi (part-local).  o: { dim (far-side variant), castD, pl (0..1: how much
 *  of this light goes on top of the albedo; < 1 for painted parts that carry their own painted light) }. */
function shade(F, phi, out, o = {}) {
  const { W, H, alb, alpha, top, nx, ny, nz, din, ao, cast, bn, emis, mats, zOf, bs } = F;
  const dim = o.dim, castD = o.castD || 2, pl = o.pl ?? 1;
  const BS = bs;
  const cx = Math.cos(phi), cy = Math.sin(phi), Lx = cx * 0.78, Ly = cy * 0.78, Lz = 0.62;
  let Hx = Lx, Hy = Ly, Hz = Lz + 1; const hl = Math.hypot(Hx, Hy, Hz); Hx /= hl; Hy /= hl; Hz /= hl;
  const cdx = Math.round(cx * castD * BS), cdy = Math.round(cy * castD * BS), ldx = Math.round(cx * 1.2 * BS), ldy = Math.round(cy * 1.2 * BS);
  const dm = dim ? 0.8 : 1, dB = dim ? 1.04 : 1, rimK = dim ? 0.45 : 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, a = alpha[i], o4 = i * 4;
    if (!a) { out[o4 + 3] = 0; continue; }
    const li = top[i], m = mats[li];
    const n0 = nx[i], n1 = ny[i], n2 = nz[i];
    const ndl = n0 * Lx + n1 * Ly + n2 * Lz, br = bn[i] - 0.5;
    const t = ndl + br * m.brush;
    let lit = smooth(m.th - m.soft, m.th + m.soft, t);
    // cast shadows: a higher layer (or the caster part) between this pixel and the light
    const xs = x + ldx, ys = y + ldy;
    if (xs >= 0 && xs < W && ys >= 0 && ys < H) { const j = ys * W + xs; if (alpha[j] > 100 && zOf[top[j]] > zOf[li] + 0.25) lit *= 0.35; }
    if (cast) { const xc = x + cdx, yc = y + cdy; if (xc >= 0 && xc < W && yc >= 0 && yc < H && cast[yc * W + xc] > 120 && !(cast[i] > 120)) lit *= 0.2; }
    const form = 1 + m.form * (ndl - 0.55);
    let r = lerp(m.sh[0], m.li[0] * form, lit), g = lerp(m.sh[1], m.li[1] * form, lit), b = lerp(m.sh[2], m.li[2] * form, lit);
    const core = (1 - lit) * m.core * Math.exp(-((t - m.th + m.soft + 0.06) ** 2) / 0.006);
    r *= 1 - core; g *= 1 - core; b *= 1 - core;
    const bo = Math.max(0, n1) * (1 - lit) * m.bounce;
    r += bo * 0.55; g += bo * 0.38; b += bo * 0.22;
    const e = din[i], edge = m.edge * Math.exp(-e / (1.1 * BS));
    let k = ao[i] * (1 - edge);
    if (pl < 1) { r = lerp(1, r, pl); g = lerp(1, g, pl); b = lerp(1, b, pl); k = lerp(1, k, pl); }
    k *= dm;
    let R = alb[o4] * r * k, G = alb[o4 + 1] * g * k, B = alb[o4 + 2] * b * k * dB;
    // cool rim on the side away from the light, just inside the silhouette
    const rw = m.rimW * BS;
    if (e < rw && m.rim) {
      const q = Math.hypot(n0, n1) + 1e-6, away = -(n0 * cx + n1 * cy) / q;
      if (away > 0.15) {
        const ra = (1 - e / rw) * smooth(0.15, 0.65, away) * m.rim * rimK * smooth(0.2, 0.45, bn[i] + 0.12) * (pl < 1 ? 0.35 + 0.65 * pl : 1);
        R = lerp(R, m.rimC[0], ra); G = lerp(G, m.rimC[1], ra); B = lerp(B, m.rimC[2], ra);
      }
    }
    if (m.spec) {
      const s = n0 * Hx + n1 * Hy + n2 * Hz + br * 0.22;
      const sp = smooth(m.sth, m.sth + 0.035, s) * m.spec * (0.35 + 0.65 * lit) * (dim ? 0.5 : 1) * pl;
      R += (m.specC[0] - R) * sp; G += (m.specC[1] - G) * sp; B += (m.specC[2] - B) * sp;
    }
    if (emis && emis[o4 + 3]) { const ea = emis[o4 + 3] / 255 * (pl < 1 ? 0.75 : 1); R = lerp(R, emis[o4], ea); G = lerp(G, emis[o4 + 1], ea); B = lerp(B, emis[o4 + 2], ea); }
    out[o4] = R; out[o4 + 1] = G; out[o4 + 2] = B; out[o4 + 3] = a;
  }
}
/** Tapered ink silhouette for one light direction: w0 on the lit side, w0 + w1 on the side away from the light. */
function inkShade(F, phi, out, ink) {
  const { W, H, dout } = F, alpha = F.inkA;
  const BS = F.bs / F.k;   // ink widths stay in screen-scale px for parts drawn in a scaled frame (the head)
  const cx = Math.cos(phi), cy = Math.sin(phi), [w0, w1] = ink;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4;
    out[o] = INKC[0]; out[o + 1] = INKC[1]; out[o + 2] = INKC[2];
    if (alpha[i] >= 128) { out[o + 3] = 255; continue; }
    const d = dout[i];
    if (d > (w0 + w1) * BS + 2) { out[o + 3] = 0; continue; }
    const gx = dout[y * W + Math.min(W - 1, x + 1)] - dout[y * W + Math.max(0, x - 1)], gy = dout[Math.min(H - 1, y + 1) * W + x] - dout[Math.max(0, y - 1) * W + x];
    const q = Math.hypot(gx, gy) || 1, away = -(gx * cx + gy * cy) / q;
    const w = (w0 + w1 * smooth(-0.3, 0.8, away)) * BS;
    out[o + 3] = 255 * clamp(w - d + 0.5, 0, 1);
  }
}
/** ?rig2=paint: the painted sheets (tools/rig2d/paint_parts.py) + their layout (tools/rig2d/guides.html). */
async function loadPainted() {
  try {
    const base = new URL('../../assets/rig2d/', import.meta.url);
    const L = await (await fetch(new URL('paint_layout.json', base))).json();
    const imgs = await Promise.all(L.sheets.map((f) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = new URL(f, base).href; })));
    for (const [id, [sh, x, y, w, h, ss, ox, oy]] of Object.entries(L.parts)) if (imgs[sh]) PAINTED[id] = { img: imgs[sh], x, y, w, h, ss, ox, oy };
    if (imgs.some((im) => !im)) console.warn('rig2 paint: missing painted sheets', L.sheets.filter((f, i) => !imgs[i]).join(', '));
    // the rigid upper / lower parts (split draw orders) take their paint from the whole-limb drawings
    for (const [id, par, dy] of [['thigh', 'legX', 0], ['shin', 'legX', -THIGH], ['dUpper', 'dArmX', 0], ['dFore', 'dArmX', -UP_D], ['sUpper', 'sArmX', 0], ['sFore', 'sArmX', -UP_S]]) {
      if (PAINTED[par] && !PAINTED[id]) PAINTED[id] = Object.assign({}, PAINTED[par], { dx: 0, dy });
    }
    const q = new URLSearchParams(location.search).get('r2pl');   // (test override of the light blend)
    PAINT_LIGHT = q !== null && q !== '' ? +q : (L.light ?? 0.45);
    STATS.painted = Object.keys(PAINTED).length;
  } catch (e) { console.warn('rig2 paint: painted sheets not loaded:', e.message); }
}
function bakeAll() {
  if (!HAS_DOM || STATS.ms) return;
  const t0 = performance.now();
  for (const [id, P] of Object.entries(PARTS)) bakePart(id, P);
  STATS.ms = Math.round(performance.now() - t0);
  STATS.pages = PAGES.length;
}
if (HAS_DOM && PAINT) await loadPainted();
bakeAll();

// ================================================================================================ runtime: matrices + parts
const tr = (m, x, y) => { m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; return m; };
const ro = (m, deg) => { const r = deg * DEG, c = Math.cos(r), s = Math.sin(r), a = m[0], b = m[1], cc = m[2], d = m[3]; m[0] = a * c + cc * s; m[1] = b * c + d * s; m[2] = cc * c - a * s; m[3] = d * c - b * s; return m; };
const sc = (m, sx, sy) => { m[0] *= sx; m[1] *= sx; m[2] *= sy; m[3] *= sy; return m; };
const MP = []; for (let i = 0; i < 96; i++) MP.push(new Float64Array(6));
const MB = new Float64Array(6);
let mpi = 0;
const nm = (src) => { const m = MP[mpi++]; m.set(src); return m; };

const INST = []; for (let i = 0; i < 110; i++) INST.push({ id: '', m: new Float64Array(6), a: 1, g: 0, e: 0, sk: 0, J: 0, bend: 0, ast: 1, cr: null });
let NIn = 0, GID = 0;
const grp = () => { GID++; };
function put(id, m, a = 1, e = 0) { if (!SPR[id]) return; const it = INST[NIn++]; it.id = id; it.m.set(m); it.a = a; it.g = GID; it.e = e; it.sk = 0; }
/** A whole-limb drawing bent at its joint (local y = J): m = the upper bone's frame, bend = the lower bone's rotation
 *  relative to it (deg, as the rig's cf / ns), ast = stretch along the limb. */
function putSkin(id, m, J, bend, ast = 1, e = 0) { if (!SPR[id]) return; put(id, m, 1, e); const it = INST[NIn - 1]; it.sk = 1; it.J = J; it.bend = bend; it.ast = ast; it.cr = PARTS[id.replace('_F', '')].crease; }
/** The drawn crease on the inside of a bent elbow / knee (in the mid-joint frame), growing with the bend. */
function crease(ctx, it) {
  const b = it.bend, cr = it.cr; if (!cr || Math.abs(b) < 25) return;
  const M = SKM; M.set(it.m); tr(M, 0, it.J * it.ast); ro(M, -b * 0.5);
  ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
  const side = b > 0 ? 1 : -1, hw = cr[0], k = Math.min(1, (Math.abs(b) - 25) / 55), L = 1.2 + 1.6 * k;
  ctx.globalAlpha = GA * (0.4 + 0.45 * k); ctx.strokeStyle = cr[1]; ctx.lineWidth = 0.75 + 0.35 * k; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(side * (hw + 0.4), -L); ctx.quadraticCurveTo(side * (hw - 1.6 - 1.4 * k), 0, side * (hw + 0.4), L); ctx.stroke();
  ctx.globalAlpha = GA;
}
const SK_N = 7, SK_B = 4.8, SKM = new Float64Array(6);
function skinPiece(ctx, e, set, n, it, y0, y1, w, a) {
  const M = SKM; M.set(it.m); tr(M, 0, it.J * it.ast); if (w) ro(M, -it.bend * w); if (it.ast !== 1) sc(M, 1, it.ast); tr(M, 0, -it.J);
  let s0 = set[0], s1 = null, wb = 0;
  if (n > 1) { const q = bucketOf(M, n); s0 = set[q[0]]; s1 = set[q[1]]; wb = q[2]; }
  ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
  const bs = e.bs, dx = -e.ox / bs, dy = (y0 - e.oy) / bs, dw = e.W / bs, dh = (y1 - y0) / bs;
  if (wb < 0.98) { ctx.globalAlpha = a * GA; ctx.drawImage(s0.img, s0.x, s0.y + y0, e.W, y1 - y0, dx, dy, dw, dh); }
  if (wb > 0.02) { ctx.globalAlpha = a * GA * (wb < 0.98 ? wb : 1); ctx.drawImage(s1.img, s1.x, s1.y + y0, e.W, y1 - y0, dx, dy, dw, dh); }
  ctx.globalAlpha = GA;
}
/** Strip skinning: the rigid upper piece, SK_N strips across the joint whose rotation blends upper -> lower, the rigid lower piece. */
function drawSkin(ctx, e, set, n, it, a) {
  const bs = e.bs, yj = e.oy + it.J * bs, b = SK_B * bs, ya = Math.max(0, Math.round(yj - b)), yb = Math.min(e.H, Math.round(yj + b)), ov = 1.5 * bs / 2;
  skinPiece(ctx, e, set, n, it, 0, Math.min(e.H, ya + ov), 0, a);
  const h = (yb - ya) / SK_N;
  for (let i = 0; i < SK_N; i++) {
    const c0 = ya + i * h, u = (i + 0.5) / SK_N, w = u * u * (3 - 2 * u);
    skinPiece(ctx, e, set, n, it, Math.max(0, c0 - ov), Math.min(e.H, c0 + h + ov), w, a);
  }
  skinPiece(ctx, e, set, n, it, Math.max(0, yb - ov), e.H, 1, a);
}

function bucketOf(m, n) {
  const det = m[0] * m[3] - m[1] * m[2]; if (!det) return [0, 0, 0];
  const lx = (m[3] * SL[0] - m[2] * SL[1]) / det, ly = (-m[1] * SL[0] + m[0] * SL[1]) / det;
  let f = (Math.atan2(ly, lx) - PHI0) / (TAU / n); f = ((f % n) + n) % n;
  const b0 = Math.floor(f) % n, w = smooth(0.3, 0.7, f - Math.floor(f));
  return [b0, (b0 + 1) % n, w];
}
const BK = [0, 0, 0];
function blit(ctx, e, s, m, a) {
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  if (a !== 1) ctx.globalAlpha = a * GA;
  ctx.drawImage(s.img, s.x, s.y, e.W, e.H, -e.ox / e.bs, -e.oy / e.bs, e.W / e.bs, e.H / e.bs);
  if (a !== 1) ctx.globalAlpha = GA;
}
function drawSet(ctx, e, set, n, m, a) {
  if (n === 1) { blit(ctx, e, set[0], m, a); return; }
  const [b0, b1, w] = bucketOf(m, n);
  if (w < 0.98) blit(ctx, e, set[b0], m, a);
  if (w > 0.02) blit(ctx, e, set[b1], m, a * (w < 0.98 ? w : 1));
}
let PULSE = 0.5, GA = 1;
function flush(ctx) {
  let i = 0;
  while (i < NIn) {
    let j = i; const g = INST[i].g;
    while (j < NIn && INST[j].g === g) j++;
    for (let k = i; k < j; k++) { const it = INST[k], e = SPR[it.id]; if (e.ink) { if (it.sk) drawSkin(ctx, e, e.ink, NI, it, it.a); else drawSet(ctx, e, e.ink, NI, it.m, it.a); } }
    for (let k = i; k < j; k++) {
      const it = INST[k], e = SPR[it.id];
      if (it.sk) { drawSkin(ctx, e, e.fill, e.nb, it, it.a); crease(ctx, it); } else drawSet(ctx, e, e.fill, e.nb, it.m, it.a);
      if (e.emis && it.e > 0.01) {
        const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        if (it.sk) drawSkin(ctx, e, [e.emis], 1, it, Math.min(1, it.e)); else blit(ctx, e, e.emis, it.m, Math.min(1, it.e));
        ctx.globalCompositeOperation = op;
      }
    }
    i = j;
  }
}

// ================================================================================================ poses
export const BASE = Object.assign({}, OLD.BASE, {
  r2: 1, old: false, h: 59, fR: -14, fL: 13.5, ik: 1,
  ts: 1, hs: 1, ca: 1, sa: 1,               // torso / head stretch (1 = none; >1 tall-thin, <1 squashed), club / shield arm stretch
  hand: 'grip', lhand: 'grip',              // hand drawings: 'grip' | 'open' | 'point'
  eyes: '', brow: '', mouth: '',            // override the face preset's feature drawings
  fl: 0, tz: 0, tv: 0, hv: 0,               // forelock flip (deg), tasset kick (deg), torso drawing (1 = twisted away), head drawing (1 = profile)
  shFront: false,                           // shield drawn in front of the torso when it is the far arm
});
const P2 = (o) => Object.assign({}, BASE, o);
function footDrop(f) { const s = Math.sin(f * DEG), c = Math.cos(f * DEG); return Math.max(HEEL * s + ANK * c, -TOE * s + ANK * c) - 0.4; }
function legY(a, s, f) { return Math.cos(a * DEG) * THIGH + Math.cos((a + s) * DEG) * SHIN + footDrop(f); }
function hipOf(p) { return p.air ? -AIR_H + p.y : -Math.max(legY(p.nt, p.ns, p.nf), legY(p.ft, p.fs, p.ff)) + p.y; }
function legIK(tx, ty) {
  let d = Math.hypot(tx, ty);
  if (d > THIGH + SHIN - 0.02) d = THIGH + SHIN - 0.02;
  if (d < 8) d = 8;
  const phi = Math.atan2(tx, ty);
  const a = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
  const b = Math.acos(clamp((SHIN * SHIN + d * d - THIGH * THIGH) / (2 * SHIN * d), -1, 1));
  return [(phi + a) / DEG, -(a + b) / DEG];
}
function plant(p) {
  if (!(p.ik > 0.5)) return p;
  let r = legIK(p.fR - p.x - HIP_N[0], p.h - p.lR - footDrop(p.nf) - HIP_N[1]);
  p.nt = r[0]; p.ns = r[1];
  r = legIK(p.fL - p.x - HIP_F[0], p.h - p.lL - footDrop(p.ff) - HIP_F[1]);
  p.ft = r[0]; p.fs = r[1];
  p.y = Math.max(legY(p.nt, p.ns, p.nf) + HIP_N[1], legY(p.ft, p.fs, p.ff) + HIP_F[1]) - p.h;
  return p;
}
/** Keyed timing with holds: list = [[frame, pose, mode], ...]; mode 'hold' keeps the drawing until the next key,
 *  otherwise an eased in-between ('io' default, 'out', 'in', 'snap').  Feet lift automatically when a foot target
 *  moves between keys; legs are IK'd. */
function timed(fr, list) {
  let i = 0;
  while (i < list.length - 1 && fr >= list[i + 1][0]) i++;
  const [f0, a, mode] = list[i];
  if (i === list.length - 1 || mode === 'hold') return plant(Object.assign({}, a));
  const [f1, b] = list[i + 1];
  const u = clamp((fr - f0) / (f1 - f0), 0, 1), e = (ease[mode] || ease.io)(u);
  const p = mix(a, b, e);
  for (const f in a) if (typeof a[f] !== 'number') p[f] = a[f];
  const s = Math.sin(Math.PI * u);
  p.lR += Math.min(6, Math.abs(b.fR - a.fR) * 0.5) * s; p.lL += Math.min(6, Math.abs(b.fL - a.fL) * 0.5) * s;
  return plant(p);
}
// periodic Catmull-Rom through evenly spaced keys (values array), u in 0..1
function loop(vals, u) {
  const n = vals.length, f = (((u % 1) + 1) % 1) * n, i = Math.floor(f), t = f - i;
  const p0 = vals[(i - 1 + n) % n], p1 = vals[i % n], p2 = vals[(i + 1) % n], p3 = vals[(i + 2) % n], t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// ---- walk: authored body keys (contact, down, passing, up per step) over planted feet
export const WALK_STRIDE = 64;
const W_ST = 0.6, W_D = WALK_STRIDE * W_ST / 2;
function walkFoot(u) {   // u: 0 = heel strike of this foot; returns [x, lift, footAngle]
  if (u < W_ST) {
    const s = u / W_ST;
    return [W_D - 2 * W_D * s, 0, s < 0.16 ? lerp(13, 0, ease.out(s / 0.16)) : s > 0.7 ? -26 * ease.in((s - 0.7) / 0.3) : 0];
  }
  const s = (u - W_ST) / (1 - W_ST);
  const x = -W_D + 2 * W_D * (s < 0.5 ? 2 * s * s : 1 - 2 * (1 - s) * (1 - s)) * 1.0;
  const lift = 8.5 * Math.sin(Math.PI * Math.min(1, s * 1.15)) * (s < 0.15 ? s / 0.15 : 1);
  const f = s < 0.35 ? lerp(-30, -6, s / 0.35) : lerp(-6, 15, (s - 0.35) / 0.65);
  return [x + 2.4 * Math.sin(Math.PI * s), lift, f];
}
// per half step: contact, down, passing, up (4 keys, then mirrored)
const WK = { h: [56.2, 55.0, 57.6, 58.4], tor: [8, 9.5, 7.5, 6.5], head: [-2.5, -1, -3, -4], ts: [1, 0.975, 1.005, 1.02], hs: [1, 0.985, 1, 1.01], sh: [0.5, -0.4, 0.6, 1.2] };
const half = (k, u) => loop(WK[k].concat(WK[k]), u);
function walk(ph) {
  ph = ((ph % 1) + 1) % 1;
  const R = walkFoot(ph), L = walkFoot((ph + 0.5) % 1);
  const p = P2({ face: 'grin', ik: 1, fR: R[0] - 1.5, lR: R[1], nf: R[2], fL: L[0] + 2, lL: L[1], ff: L[2] });
  p.h = half('h', ph); p.tor = half('tor', ph); p.head = half('head', ph); p.ts = half('ts', ph); p.hs = half('hs', ph); p.sh = half('sh', ph);
  // arms swing against the legs with a little drag (overlap): right leg forward at ph 0 -> club (right) arm back
  const sw = Math.cos(TAU * ph - 0.5), sw2 = Math.cos(TAU * ph - 1.2);
  Object.assign(p, { cu: -4 - 24 * sw, cf: 30 + 12 * Math.max(0, -sw2) + 6 * sw2, cw: 78 - 12 * sw2, su: 24 + 14 * sw, sf: 56 - 8 * sw2, st: 0.42, shFront: true, x: 0.6 * Math.sin(TAU * ph * 2) });
  p.br = 0.3 + 0.2 * Math.cos(TAU * ph * 2);
  return plant(p);
}

// ---- idle: breathing keys with holds at the ends, weight shift, blink (draw), a fidget every ~5.4 s
function idle(t) {
  const c = ((t / 2.7) % 1 + 1) % 1, br = c < 0.4 ? ease.io(c / 0.4) : c < 0.5 ? 1 : c < 0.92 ? 1 - ease.io((c - 0.5) / 0.42) : 0;
  const w = Math.sin(t * 0.83 + 0.6), w2 = Math.sin(t * 0.83 * 2 + 1.1);
  const p = P2({ face: 'grin', x: 1.4 * w, h: 58.2 + 0.7 * br - 0.35 * Math.abs(w), tor: 6 - 2.2 * br + 0.9 * w, head: -2 - 2.2 * br + 1.2 * w2, rot: 0.8 * w,
    br: 0.15 + 0.85 * br, sh: 1.6 * br, ts: 1 + 0.012 * br, cu: -6 + 2.6 * br + 1.6 * w, cf: 34 - 4 * br, cw: 86 + 3 * br, su: 28 + 2.5 * br - w, sf: 58 - 3 * br, shFront: true,
    st: 0.42, fR: -14.5, fL: 13.5, look: 0.2 * w2 });
  return plant(fidget(p, t));
}
function fidget(p, t) {
  const n = Math.floor(t / 5.4), kind = ((n % 3) + 3) % 3, dur = kind === 1 ? 2 : 1.5, u = t - n * 5.4 - 3.0;
  if (u < 0 || u > dur) return p;
  const k = u / dur, q = (o) => Object.assign({}, p, o);
  if (kind === 1) {
    // claw flex: leans the club on his leg, raises the open dragon claw, clenches it twice (embers flare), takes the club back
    const flex = Math.sin(clamp((k - 0.3) / 0.42, 0, 1) * Math.PI * 2);
    const set = { cu: 26, cf: 26, cw: 40, tor: p.tor + 4, head: p.head + 6, look: 0.6, lookY: 1 };
    const lst = [[0, q({})], [0.12, q(set)], [0.2, q(Object.assign({}, set, { cu: 30, cf: 30 }))],
      [0.3, q({ cu: 50, cf: 92, cw: 0, tor: p.tor - 1, head: p.head + 7, look: 1, lookY: 0.4, face: 'det', glow: 0.5, ts: 1.015 })],
      [0.72, q({ cu: 54, cf: 96, cw: 0, tor: p.tor - 1.5, head: p.head + 8, look: 1, lookY: 0.4, face: 'dragon', glow: 1, ts: 1.02, br: 1 })],
      [0.8, q(Object.assign({}, set, { face: 'grin', glow: 0.4 }))], [0.88, q(set)], [1, q({})]];
    const o = rkeys(k, lst);
    if (k > 0.16 && k < 0.84) { o.clubAt = [19.5, -37.8, 12]; o.hand = k > 0.28 && k < 0.76 && flex > 0.35 ? 'grip' : 'open'; o.armGlow = true; }
    if (k > 0.3 && k < 0.72) { o.cf += 6 * flex; o.glow = Math.min(1, o.glow + 0.25 * Math.max(0, flex)); }
    o.noBlink = k > 0.25 && k < 0.75;
    return o;
  }
  if (kind === 2) {
    // club flip: a dip, a flick, the club spins once in his claw with a painted trail, a happy catch
    const cw = p.cw + 360 * ease.io(clamp((k - 0.28) / 0.4, 0, 1));
    const lst = [[0, q({})], [0.18, q({ cu: 18, cf: 52, cw: p.cw - 30, tor: p.tor + 3, head: p.head + 4, look: 0.6, lookY: 0.7, eyes: 'open' })],
      [0.3, q({ cu: 34, cf: 62, cw: p.cw - 20, ts: 1.02, head: p.head - 2, look: 0.7, lookY: -0.2, mouth: 'open' })],
      [0.66, q({ cu: 30, cf: 60, cw: p.cw - 10, head: p.head - 4, look: 0.7, lookY: -0.4, mouth: 'grin' })],
      [0.8, q({ cu: 6, cf: 44, cw: p.cw, ts: 0.985, face: 'happy', sh: p.sh + 1.5 })], [1, q({})]];
    const o = rkeys(k, lst); o.cw = cw + (o.cw - p.cw); o.tw = k > 0.26 && k < 0.72 ? 1 : 0; o.noBlink = k < 0.8;
    return o;
  }
  // a look back and forth, a shrug
  return rkeys(k, [[0, q({})], [0.15, q({ head: p.head - 4, look: -1, eyes: 'open', brow: 'raised' })], [0.42, q({ head: p.head - 4, look: -1, eyes: 'open', brow: 'raised' })],
    [0.55, q({ head: p.head + 2, look: 1, eyes: 'open' })], [0.75, q({ head: p.head + 1, look: 0.8, sh: p.sh + 2.6, ts: 1.015, face: 'happy' })], [1, q({})]]);
}
function rkeys(k, list) {
  let i = 1; while (i < list.length - 1 && k > list[i][0]) i++;
  const [t0, a] = list[i - 1], [t1, b] = list[i], u = ease.io(clamp((k - t0) / (t1 - t0), 0, 1));
  const p = mix(a, b, u); for (const f in a) if (typeof a[f] !== 'number') p[f] = u < 0.5 ? a[f] : b[f];
  return p;
}

// ---- atk1 (16 frames, a0 = 4 .. a1 = 8): coil (2 keys), stretched smear, contact held, overshoot, settle
const ST = (o) => P2(Object.assign({ ik: 1, fR: -14.5, fL: 13.5 }, o));
const ATK1 = [
  [0, ST({ h: 58, tor: 3, head: -2, cu: -12, cf: 44, cw: 96, su: 24, sf: 56, shFront: true, face: 'det' }), 'out'],
  [1, ST({ x: -2.5, h: 56.2, fL: 15, tv: 1, tor: -10, head: -6, cu: -54, cf: 96, cw: 196, su: 32, sf: 62, st: 0.5, shFront: true, ts: 0.955, hs: 0.97, face: 'yell', mouth: 'grit', sh: 1.5 }), 'hold'],
  [2, ST({ x: -3.2, h: 55.6, fL: 15, tv: 1, tor: -13.5, head: -7, cu: -63, cf: 104, cw: 204, su: 36, sf: 64, st: 0.5, shFront: true, ts: 0.94, hs: 0.965, face: 'yell', mouth: 'grit', sh: 2, fl: -6 }), 'hold'],
  [3, ST({ hv: 1, x: 2, h: 55.4, fL: 19, tor: 9, head: -1, cu: 18, cf: 46, cw: 76, ca: 1.24, su: 10, sf: 42, ts: 1.045, hs: 1.02, face: 'yell', hand: 'grip',
    smear: 1, sa0: 212, sa1: 142, fl: -10 }), 'hold'],
  [4, ST({ hv: 1, x: 5, h: 54.2, fR: -15.5, fL: 24, tor: 22, head: 4, cu: 68, cf: 28, cw: 20, ca: 1.0, su: -4, sf: 32, st: 0.55, ts: 1.025, face: 'yell', smear: 0.95, sa0: 162, sa1: 100, tz: 10 }), 'out'],
  [6, ST({ hv: 1, x: 5.6, h: 53.8, fR: -15.5, fL: 24, tor: 25, head: 5, cu: 74, cf: 24, cw: 14, ca: 1.0, su: -8, sf: 30, st: 0.55, ts: 1.01, face: 'yell', smear: 0.45, sa0: 132, sa1: 101, tz: 6 }), 'snap'],
  [7, ST({ hv: 1, x: 6, h: 53.5, fR: -15.5, fL: 24, tor: 28, head: 7, cu: 84, cf: 16, cw: 2, su: -10, sf: 28, st: 0.55, ts: 0.99, face: 'yell', smear: 0.15, sa0: 116, sa1: 100, fl: 6 }), 'hold'],
  [9, ST({ hv: 1, x: 5.6, h: 54.2, fR: -15.5, fL: 24, tor: 24, head: 5, cu: 78, cf: 20, cw: 10, su: -4, sf: 32, face: 'det', fl: 4 }), 'io'],
  [12, ST({ x: 4, h: 57, fR: -15, fL: 18, tor: 12, head: 1, cu: 46, cf: 24, cw: 40, su: 18, sf: 48, shFront: true, face: 'det', ts: 1.01 }), 'out'],
  [14, ST({ x: 1, h: 58.4, fR: -14.5, fL: 14.5, tor: 4, head: -3, cu: -4, cf: 36, cw: 92, su: 24, sf: 54, shFront: true, face: 'grin', ts: 0.995 }), 'io'],
  [16, ST({ h: 58, tor: 5, head: -2, cu: -6, cf: 34, cw: 86, su: 28, sf: 58, shFront: true, face: 'grin' })],
];
const atk1 = (k) => timed(k * 16, ATK1);

// ---- every other key: the old rig's key poses converted to this model (ADAPTED) and drawn with the new art; the few
// that need the old drawing (carrying, the club-toss select showcase) fall back to the old rig entirely (FALLBACK).
const KH = 58.4 / 49.6, KX = 1.1, KA = AIR_H / 49;
/** An old-rig pose -> this rig: hip height / foot targets / airborne hip rescaled to the longer legs, legs re-solved. */
function adapt(o) {
  const p = Object.assign({}, BASE, o, { r2: 1, old: false });
  p.h = o.h * KH; p.fR = o.fR * KX; p.fL = o.fL * KX; p.x = o.x * KX; p.lR = o.lR * KH; p.lL = o.lL * KH; p.y = o.y * KA;
  if (o.claw > 0.5 && !o.carry) p.hand = 'open';
  if ((o.smear || 0) > 0.3 || (o.bsm || 0) > 0.3) p.hv = 1;          // attack contacts: the face turns into the swing
  if (p.ik > 0.5 && !p.air) plant(p);
  return p;
}
export const ADAPTED = [], FALLBACK = [];
export const ANIM = {};
const NEW = { idle, walk, atk1 };
for (const [k, f] of Object.entries(OLD.ANIM)) {
  if (NEW[k]) { ANIM[k] = NEW[k]; continue; }
  if (['carryIdle', 'carryWalk', 'throw', 'select'].includes(k)) {
    FALLBACK.push(k);
    ANIM[k] = typeof f === 'function' ? (a) => Object.assign({}, f(a), { old: true, r2: 0 }) : Object.assign({}, f, { old: true, r2: 0 });
  } else { ADAPTED.push(k); ANIM[k] = typeof f === 'function' ? (a) => adapt(f(a)) : adapt(f); }
}

export const CARRY_POINT = OLD.CARRY_POINT;        // carry poses fall back to the old rig
export const CARRY_STRIDE = 49.1;                  // the old carry gait's effective stride (keeps it as it was)
export const RUN_STRIDE = 138;                     // the adapted run gait on the longer legs (feet stay planted)
export const META = { id: 'dodongo', name: 'Dodongo', height: 146, hurtW: 22, hurtH: 128 };
export { mix };

// ================================================================================================ face presets
const FACES = {
  grin: ['open', 'neutral', 'grin'], det: ['focus', 'angry', 'smile'], yell: ['focus', 'angry', 'yell'], happy: ['happy', 'raised', 'grin'],
  ouch: ['ouch', 'worried', 'ouch'], ko: ['closed', 'worried', 'o'], surprised: ['wide', 'raised', 'o'], worried: ['open', 'worried', 'flat'],
  smug: ['half', 'smug', 'smirk'], dragon: ['dragon', 'angry', 'grit'], puff: ['focus', 'angry', 'puff'], breathe: ['focus', 'angry', 'breathe'], sniff: ['closed', 'raised', 'o'],
};
const PROF_EYES = { open: 'open', half: 'open', closed: 'closed', happy: 'happy', focus: 'focus', wide: 'wide', ouch: 'ouch', dragon: 'dragon' };
const PROF_MOUTH = { smile: 'smile', flat: 'smile', smirk: 'smile', puff: 'smile', o: 'o', open: 'o', grin: 'grin', yell: 'yell', breathe: 'breathe', grit: 'grit', ouch: 'grit' };
function faceIds(p, o, prof) {
  const F = FACES[p.face] || FACES.grin;
  let eyes = p.eyes || F[0];
  const brow = p.brow || F[1];
  let m = p.mouth || F[2];
  if (!p.noBlink && (eyes === 'open' || eyes === 'focus')) {
    const t = (o.t || 0) + 0.37, c = t % 3.9, c2 = (t + 1.3) % 7.1;
    const b = c < 0.13 ? c : c2 < 0.13 ? c2 : -1;
    if (b >= 0) eyes = b < 0.035 || b > 0.095 ? 'half' : 'closed';
  }
  if (o.talk) m = Math.sin((o.t || 0) * 16) > 0 ? 'open' : 'smile';
  let lx = 0, ly = 0;
  if (eyes === 'open' || eyes === 'wide') { lx = Math.round(clamp(p.look || 0, -1, 1)); ly = Math.round(clamp(p.lookY || 0, -1, 1)); }
  if (prof) return [`eyesP_${PROF_EYES[eyes] || 'open'}`, `browP_${brow}`, `mouthP_${PROF_MOUTH[m] || 'smile'}`];
  return [`eyes_${eyes}_${eyes === 'open' || eyes === 'wide' ? lx + '_' + ly : '0_0'}`, `brow_${brow}`, `mouth_${m}`];
}

// ================================================================================================ secondary motion
const V0 = { x: 0, y: 0, z: 0 };
const SM = { hair: 0, hairY: 0, curl: 0, fur: 0, tN: 0, tF: 0, tB: 0, fa: 0 };
function secondary(o, p, f, hipY) {
  const mem = o.mem, v = o.vel || V0;
  const vx = clamp((v.x || 0) * f, -9, 9), vz = clamp(v.z || 0, -12, 12);
  const A = p.tor + p.head * 0.6 - p.rot;
  const dA = clamp(follow(mem, 'r2dA', A, 0.2, 0.7) - A, -30, 30);
  const dH = clamp(follow(mem, 'r2dH', hipY, 0.24, 0.66) - hipY, -12, 12);
  const sv = follow(mem, 'r2sv', -vx * 1.6, 0.1, 0.86);
  const sz = follow(mem, 'r2sz', vz * 0.42, 0.2, 0.7);
  SM.hair = clamp(sv * 2.6 + dA * 0.9 + p.fl, -30, 30);
  SM.hairY = clamp(dH * 2 + sz * 2, -20, 20);
  SM.curl = clamp(follow(mem, 'r2cu', sv * 3 + dA * 1.2 + dH * 1.6, 0.16, 0.8), -35, 35);
  SM.fur = clamp(sv * 0.6 + dA * 0.3 + dH * 0.4, -8, 8);
  const tv = follow(mem, 'r2tv', -vx * 2.2, 0.14, 0.78) + dA * 0.5 + dH * 0.8;
  const aN = f > 0 ? p.nt : p.ft, aF = f > 0 ? p.ft : p.nt;
  SM.tN = clamp(Math.max(p.tor * 0.6 + tv + p.tz, aN - 12 + p.tor), -45, 70);
  SM.tF = clamp(Math.max(p.tor * 0.5 + tv * 0.7 + p.tz, aF - 14 + p.tor), -40, 60);
  SM.tB = clamp(Math.min(p.tor * 0.6 + tv, Math.min(aN, aF) + 14 + p.tor), -60, 40);
  SM.fa = clamp(p.tor * 0.35 + tv * 0.6 + Math.max(0, Math.max(aN, aF) - 10) * 0.5 + p.tz * 0.7, -20, 45);
}

// ================================================================================================ draw
const HANDS_D = { grip: 'dHandGrip', open: 'dHandOpen', point: 'dHandPoint' }, HANDS_S = { grip: 'sHandGrip', open: 'sHandOpen', point: 'sHandPoint' };
function legParts(root, hip, a, s, foot, far) {
  const F = far ? '_F' : '';
  const m = nm(root); tr(m, hip[0], hip[1]); ro(m, -a);
  const k = nm(m); tr(k, 0, THIGH); ro(k, -s);
  grp();
  if (FLEX) putSkin('legX' + F, m, THIGH, s);
  else { put('thigh' + F, m); put('shin' + F, k); }
  const ft = nm(k); tr(ft, 0, SHIN); ro(ft, a + s - foot);
  put('boot' + F, ft);
  const kp = nm(m); tr(kp, 0, THIGH); ro(kp, -s * 0.45);
  grp(); put('knee' + F, kp);
}
function armParts(P, slot, up, fo, ast, cu, cf, cw, kind, far, opt) {
  // kind 'd' = dragon (club), 's' = shield arm.  opt: { hand, club, shield, st, sp, glow, part: 'all' | 'upper' | 'lower' }
  const F = far ? '_F' : '';
  const sh = nm(P); tr(sh, slot[0], slot[1]); ro(sh, -cu);
  const el = nm(sh); tr(el, 0, up * ast); ro(el, -cf);
  const wr = nm(el); tr(wr, 0, fo * ast);
  const part = opt.part || 'all', whole = FLEX && part === 'all';
  if (whole) { grp(); putSkin((kind === 'd' ? 'dArmX' : 'sArmX') + F, sh, up, cf, ast, opt.glow); }
  else if (part !== 'lower') { grp(); const u = nm(sh); if (ast !== 1) sc(u, 1, ast); put((kind === 'd' ? 'dUpper' : 'sUpper') + F, u, 1, opt.glow); }
  if (part !== 'upper') {
    if (part === 'lower') grp();
    if (!whole) { const f = nm(el); if (ast !== 1) sc(f, 1, ast); put((kind === 'd' ? 'dFore' : 'sFore') + F, f, 1, opt.glow); }
    if (kind === 'd') {
      if (opt.club) { const c = nm(wr); tr(c, 0, GRIP); ro(c, -cw); put('club' + F, c); CLM.set(c); hasClub = true; }
      put((HANDS_D[opt.hand] || 'dHandGrip') + F, wr);
    } else {
      put((HANDS_S[opt.hand] || 'sHandGrip') + F, wr);
      if (opt.shield) {
        const s = nm(el); tr(s, 0, (9 + (opt.sp || 0)) * ast); ro(s, opt.absA * 0.75);
        const st = clamp(opt.st, 0, 1), id = st < 0.25 ? 'shield0' : st < 0.75 ? 'shield1' : 'shield2';
        if (id === 'shield1') { tr(s, 3 + 2 * st, 0); sc(s, lerp(1.12, 0.86, (st - 0.25) / 0.5), 1); } else tr(s, 4 + 3 * st, 0);
        grp(); put(id + F, s); SHM.set(s); hasShield = true;
      }
    }
  }
  if (part !== 'lower') { const pa = nm(sh); ro(pa, cu * 0.5); tr(pa, 0.5, -0.5); grp(); put('paul' + F, pa); }
  return [sh, el, wr];
}

let LAST = null;
/** Live variations that need the clock or per-actor memory: flailing limbs in flight, the bounce on hitting the floor. */
function reactive(p, o) {
  const q = Object.assign({}, p), t = o.t || 0;
  if (p.flail) {
    q.cu += 26 * Math.sin(t * 13); q.cf += 20 * Math.sin(t * 17 + 1); q.su += 30 * Math.sin(t * 12 + 2); q.sf += 20 * Math.sin(t * 15);
    q.nt += 18 * Math.sin(t * 11 + 0.5); q.ft += 18 * Math.sin(t * 10 + 2.2); q.ns -= 14 * Math.max(0, Math.sin(t * 11)); q.head += 7 * Math.sin(t * 9);
    q.rot += 8 * Math.sin(t * 6);
  }
  const mem = o.mem;
  if (p.down && mem) {
    if (mem.r2dkF !== mem.frame - 1 && mem.r2dkF !== mem.frame) mem.r2dk0 = mem.frame;
    mem.r2dkF = mem.frame;
    const e = mem.frame - mem.r2dk0;
    if (e < 10) {
      const u = e / 10;
      q.y = p.y - 8 * Math.sin(Math.PI * clamp((u - 0.2) / 0.6, 0, 1)) * (1 - u);
      q.sq = e < 2 ? 0.82 : 1 + 0.04 * Math.sin(Math.PI * u) * (1 - u);
      q.head = p.head - 12 * Math.sin(Math.PI * u) * (1 - u);
      if (e < 6) q.face = 'ouch';
    }
  }
  return q;
}
const CLM = new Float64Array(6), SHM = new Float64Array(6);
let hasClub = false, hasShield = false;
export function draw(ctx, pose, o = {}) {
  if (!pose || pose.old || !pose.r2 || !STATS.ms) return OLD.draw(ctx, pose, o);
  let p = pose;
  if (p.flail || p.down) p = reactive(p, o);
  const f = o.facing || 1, R = f > 0, Sc = o.scale || 1, T = o.t || 0;
  PULSE = 0.55 + 0.3 * Math.sin(T * 3.4) + 0.15 * Math.sin(T * 9.7 + 1);
  const B = ctx.getTransform(), base = MB;
  base[0] = B.a; base[1] = B.b; base[2] = B.c; base[3] = B.d; base[4] = B.e; base[5] = B.f;
  mpi = 0; NIn = 0; GID = 0; GA = ctx.globalAlpha; hasClub = hasShield = false;
  const hipY = hipOf(p);
  secondary(o, p, f, hipY);
  const floor = nm(base); sc(floor, f * Sc, Sc);
  if (p.sq !== 1) sc(floor, 1 / Math.sqrt(p.sq), p.sq);
  const root = nm(floor); tr(root, p.x, hipY); if (p.rot) ro(root, -p.rot);
  const P = nm(root); ro(P, p.tor); if (p.ts !== 1) sc(P, 1 / Math.sqrt(p.ts), p.ts);
  const up = p.sh * 0.8 + p.br * 1.1;
  const sN = [SLOT_N[0], SLOT_N[1] - up], sF = [SLOT_F[0], SLOT_F[1] - up];
  const slotD = R ? sN : sF, slotS = R ? sF : sN;
  const g = clamp(p.glow, 0, 1), emis = clamp(0.35 + 0.45 * PULSE + 0.6 * g, 0, 1);
  // the shield tucked back when it is the near arm (old-pose flag sb: keeps the chest readable)
  let su = p.su, sf = p.sf, st = p.st;
  if (!R && p.sb > 0.01) { su -= 30 * p.sb; sf -= 4 * p.sb; st = Math.min(1, st + 0.35 * p.sb); }
  const dOpt = { hand: p.hand, club: !p.clubAt, glow: emis }, sOpt = { hand: p.lhand, shield: !p.shBack, st, sp: p.sp, absA: su + sf + p.tor };
  const cuN = ((p.cu % 360) + 360) % 360, suN = ((su % 360) + 360) % 360;
  const clubLate = (R || p.clubFront) && !p.clubBack;
  const behindHead = p.clubBack || (!R && cuN > 100 && cuN < 290) || (R && cuN > 100 && cuN < 178);
  const shieldBehind = !R && suN > 100 && suN < 178;
  const dArm = (far, part) => armParts(P, slotD, UP_D, FO_D, p.ca, p.cu, p.cf, p.cw, 'd', far, part ? Object.assign({}, dOpt, { part }) : dOpt);
  const sArm = (far) => armParts(P, slotS, UP_S, FO_S, p.sa, su, sf, 0, 's', far, sOpt);
  // ---- back layer: shield slung on the back, back tasset, far arm, far leg
  if (p.shBack) { const bs = nm(P); tr(bs, -20, -27); ro(bs, -10); sc(bs, 0.92, 0.92); grp(); put('shield1_F', bs); }
  const tb = nm(P); tr(tb, -13, -8); ro(tb, -SM.tB); grp(); put('tasset_F', tb);
  if (R) { if (!p.shFront) sArm(true); } else if (!behindHead) dArm(true, clubLate ? 'upper' : 'all');
  if (R) { legParts(root, HIP_F, p.ft, p.fs, p.ff, true); legParts(root, HIP_N, p.nt, p.ns, p.nf, false); }
  else { legParts(root, HIP_F, p.nt, p.ns, p.nf, true); legParts(root, HIP_N, p.ft, p.fs, p.ff, false); }
  // ---- torso stack
  grp();
  put(p.tv ? 'torsoT' : 'torso', P);
  const tf = nm(P); tr(tf, 13, -7); ro(tf, -SM.tF * 0.8); put('tassetF', tf);
  const fa = nm(P); tr(fa, 4.5, -7); ro(fa, -SM.fa); put('fauld', fa);
  const tn = nm(P); tr(tn, -8, -7); ro(tn, -SM.tN); put('tasset', tn);
  put(p.tv ? 'beltT' : 'belt', P);
  if (p.clubAt) { const c = nm(floor); tr(c, p.clubAt[0], p.clubAt[1]); ro(c, p.clubAt[2]); grp(); put('club', c); CLM.set(c); hasClub = true; }
  if (R && p.shFront) sArm(true);
  const mt = nm(P); tr(mt, 0, -up * 0.6); grp(); put('mantle', mt);
  const nk = nm(P); tr(nk, NECK[0], NECK[1] - up * 0.5); ro(nk, p.head * 0.35); grp(); put('neck', nk);
  const gg = nm(P); tr(gg, 0, -up * 0.4); grp(); put('gorget', gg);
  if (behindHead) dArm(!R);
  if (shieldBehind) sArm(false);
  // ---- head: back curls, forelock (root hidden by the mop), base (back hair + face), features, fringe
  const H = nm(P); tr(H, NECK[0], NECK[1] - HEAD_UP - up * 0.5 + (p.hd || 0)); ro(H, p.head); sc(H, HEAD_K, HEAD_K); if (p.hs !== 1) sc(H, 1 / Math.sqrt(p.hs), p.hs);
  const c1 = nm(H); tr(c1, -11.5, -9); ro(c1, SM.curl * 0.8 - 10); grp(); put('curl', c1);
  const c2 = nm(H); tr(c2, -13, -22); ro(c2, 25 + SM.curl); sc(c2, 0.9, 0.9); grp(); put('curl', c2);
  const prof = PROFILE && p.hv > 0.5;
  const fl = nm(H); if (prof) tr(fl, 5, -26.4); else tr(fl, 5.4, -26.6); ro(fl, -SM.hair - SM.hairY * 0.6 - p.hl * 18); if (p.hx) tr(fl, -p.hx, 0); grp(); put('forelock', fl);
  grp(); put(prof ? 'headBaseP' : 'headBase', H);
  const [eid, bid, mid] = faceIds(p, o, prof);
  grp(); put(eid, H); put(bid, H); put(mid, H);
  grp(); put(prof ? 'hairFrontP' : 'hairFront', H);
  // ---- near arm(s) + shoulder fur
  if (!R && !shieldBehind) sArm(false);
  if (clubLate && !behindHead) dArm(!R, R ? 'all' : 'lower');
  const lb = nm(P); tr(lb, SLOT_N[0] - 0.5, SLOT_N[1] - up - 3); ro(lb, SM.fur); grp(); put('furLobe', lb);
  // ---- flush, then vector FX: smear / twirl (shoulder frame), shield bash, club glow
  flush(ctx);
  const clubGlow = g > 0.55 && hasClub && !p.armGlow && !p.clubAt;
  if (p.smear > 0.01 || p.tw > 0.01 || p.bsm > 0.02 || clubGlow) {
    ctx.save();
    if (p.smear > 0.01 || p.tw > 0.01) {
      const sm = nm(P); tr(sm, slotD[0], slotD[1]);
      ctx.setTransform(sm[0], sm[1], sm[2], sm[3], sm[4], sm[5]);
      if (p.smear > 0.01) smearFx(ctx, p);
      if (p.tw > 0.01) twirlFx(ctx, p);
    }
    if (p.bsm > 0.02 && hasShield) { ctx.setTransform(SHM[0], SHM[1], SHM[2], SHM[3], SHM[4], SHM[5]); bashFx(ctx, clamp(p.bsm, 0, 1)); }
    if (clubGlow) {
      ctx.setTransform(CLM[0], CLM[1], CLM[2], CLM[3], CLM[4], CLM[5]);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = GA * g * (0.45 + 0.3 * PULSE); ctx.fillStyle = '#ff7a1e'; ctx.beginPath(); ctx.arc(0, CLUB, BALL_R + 3 + 3 * PULSE, 0, TAU); ctx.fill();
      ctx.globalAlpha = GA * g * 0.8; ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(0, CLUB, BALL_R * 0.7, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  ctx.setTransform(B);
  LAST = p;
}
export const drawDodongo = draw;
// shield bash: an impact crescent ahead of the shield and speed lines trailing it (shield frame)
function bashFx(ctx, al) {
  ctx.globalAlpha = GA * al * 0.85; ctx.fillStyle = '#fffaf0';
  ctx.beginPath(); ctx.arc(10, 0, 25, -1.05, 1.05); ctx.arc(3, 0, 21, 1.0, -1.0, true); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = GA * al * 0.55; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const dy of [-15, -3, 9, 19]) { ctx.moveTo(-20, dy); ctx.lineTo(-42 + Math.abs(dy) * 0.6, dy); }
  ctx.stroke();
}


// painted motion smear: a crescent swept by the club head, laid in as a few dry-brush arcs (no gradients)
function smearFx(ctx, p) {
  // radius = the club head's distance from the shoulder in this pose (the crescent runs through the club head)
  const A1 = p.cu * DEG, A2 = (p.cu + p.cf) * DEG, A3 = (p.cu + p.cf + p.cw) * DEG;
  const hx = Math.sin(A1) * UP_D * p.ca + Math.sin(A2) * (FO_D * p.ca + GRIP) + Math.sin(A3) * CLUB, hy = Math.cos(A1) * UP_D * p.ca + Math.cos(A2) * (FO_D * p.ca + GRIP) + Math.cos(A3) * CLUB;
  const R = Math.hypot(hx, hy) + 5, a0 = p.sa0, a1 = p.sa1, al = clamp(p.smear, 0, 1), hot = p.glow > 0.3, n = 18;
  const band = (w0, w1, pw, rr) => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * (i / n)) * DEG; i ? ctx.lineTo(Math.sin(a) * rr, Math.cos(a) * rr) : ctx.moveTo(Math.sin(a) * rr, Math.cos(a) * rr); }
    for (let i = n; i >= 0; i--) { const u = i / n, a = (a0 + (a1 - a0) * u) * DEG, r = rr - (w0 + w1 * Math.pow(u, pw)); ctx.lineTo(Math.sin(a) * r, Math.cos(a) * r); }
    ctx.closePath();
  };
  band(2, 26, 1.1, R + 2); ctx.globalAlpha = GA * al * 0.3; ctx.fillStyle = hot ? '#ffb347' : '#fff3e0'; ctx.fill();
  band(1, 15, 1.6, R); ctx.globalAlpha = GA * al * 0.55; ctx.fillStyle = hot ? '#ffe08a' : '#fffaf0'; ctx.fill();
  band(0.5, 7, 2.2, R - 1); ctx.globalAlpha = GA * al * 0.9; ctx.fillStyle = hot ? '#fff0b0' : '#ffffff'; ctx.fill();
  ctx.lineCap = 'round';
  const arcs = [[R - 5, 1.6, 0.55, 0.3], [R - 10, 1.2, 0.45, 0.45], [R - 15, 1, 0.38, 0.58], [R - 20, 0.9, 0.3, 0.7], [R + 2, 0.9, 0.5, 0.15]];
  for (const [rr, w, a, s] of arcs) {
    ctx.globalAlpha = GA * al * a; ctx.strokeStyle = hot ? '#ff9a3a' : '#f3ece2'; ctx.lineWidth = w;
    ctx.beginPath();
    const s0 = a0 + (a1 - a0) * s, s1 = a1 - (a1 - a0) * 0.03;
    for (let i = 0; i <= 10; i++) { const a = (s0 + (s1 - s0) * i / 10) * DEG; i ? ctx.lineTo(Math.sin(a) * rr, Math.cos(a) * rr) : ctx.moveTo(Math.sin(a) * rr, Math.cos(a) * rr); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function twirlFx(ctx, p) {
  // trail behind the spinning club head in the fist: (shoulder frame) wrist position from the arm angles
  const ua = p.cu * DEG, fa = (p.cu + p.cf) * DEG;
  const wx = Math.sin(ua) * UP_D + Math.sin(fa) * (FO_D + GRIP), wy = Math.cos(ua) * UP_D + Math.cos(fa) * (FO_D + GRIP);
  const ph = Math.PI / 2 - (p.cu + p.cf + p.cw) * DEG;
  ctx.translate(wx, wy);
  ctx.lineCap = 'round'; ctx.strokeStyle = '#fffaf0';
  ctx.globalAlpha = GA * 0.28; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, CLUB, ph + 0.3, ph + 2.4); ctx.stroke();
  ctx.globalAlpha = GA * 0.6; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, CLUB, ph + 0.25, ph + 1.2); ctx.stroke();
  ctx.globalAlpha = GA * 0.35; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, CLUB - 5, ph + 0.4, ph + 1.8); ctx.stroke();
  ctx.globalAlpha = 1;
}

// ================================================================================================ measurements
/** Club-head centre (local px, facing right, scale 1) for a pose: used by the art checks (contact inside the hitbox). */
export function clubHead(p) {
  if (!p.r2 || p.old) return OLD.landmarks(p, 1).club;
  const hipY = hipOf(p), up = p.sh * 0.8 + p.br * 1.1;
  const m = new Float64Array([1, 0, 0, 1, 0, 0]);
  if (p.sq !== 1) sc(m, 1 / Math.sqrt(p.sq), p.sq);
  tr(m, p.x, hipY); if (p.rot) ro(m, -p.rot); ro(m, p.tor); if (p.ts !== 1) sc(m, 1 / Math.sqrt(p.ts), p.ts);
  tr(m, SLOT_N[0], SLOT_N[1] - up); ro(m, -p.cu); tr(m, 0, UP_D * p.ca); ro(m, -p.cf); tr(m, 0, FO_D * p.ca + GRIP); ro(m, -p.cw); tr(m, 0, CLUB);
  return [m[4], m[5]];
}
/** A point in the head's drawing frame -> local px (facing right, scale 1). */
export function headPoint(p, hx, hy) {
  const hipY = hipOf(p), up = p.sh * 0.8 + p.br * 1.1;
  const m = new Float64Array([1, 0, 0, 1, 0, 0]);
  if (p.sq !== 1) sc(m, 1 / Math.sqrt(p.sq), p.sq);
  tr(m, p.x, hipY); if (p.rot) ro(m, -p.rot); ro(m, p.tor); if (p.ts !== 1) sc(m, 1 / Math.sqrt(p.ts), p.ts);
  tr(m, NECK[0], NECK[1] - HEAD_UP - up * 0.5 + (p.hd || 0)); ro(m, p.head); sc(m, HEAD_K, HEAD_K); if (p.hs !== 1) sc(m, 1 / Math.sqrt(p.hs), p.hs);
  tr(m, hx, hy);
  return [m[4], m[5]];
}
/** Fireball breath leaves his mouth at shoot k = .42. */
export const SHOOT_ORIGIN = headPoint(ANIM.shoot(0.42), 13, -3.5).map(Math.round);
export const __rig2 = { STATS, PAGES, SPR, PARTS, FALLBACK, ADAPTED, clubHead, headPoint, guideCanvas, MODE: R2MODE };
