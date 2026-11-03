// Dodongo's Quest - Level 4 "THE EMBER THRONE": the Dragon King's palace inside a volcano crater (canvas 2D, no deps).
//
// Back-to-front (drawBack):
//   caldera, clipped left of the palace gate: sky + underlit smoke  ->  crater rim (p 0.1) + lavafalls  ->  the
//   palace + inner spires (0.3)  ->  lava lake far band (0.4) / near band (0.75) + basalt islands + live lava
//   ->  interior deep layers, each clipped to its section: inner hall (0.55), treasure vault (0.6), lava cavern (0.5)
//   ->  near wall bays (1.0)  ->  ceiling bands (1.0)  ->  pillars, pylons, the dais (1.0)  ->  live back bits
//   (banners, wall flames, lava)  ->  ground tiles (floor + back boundary)  ->  near-front sprites + live (braziers,
//   light pools, light shafts)  ->  warm grade, vignette, back ash/embers.
//   drawFront: foreground occluders (1.25), near ash/embers.
//
// Every static element is pre-rendered once per scale into offscreen canvases (strips chunked to <= ~2048 device px,
// plus reusable sprites); only the animated bits are drawn live.  All layout randomness is seeded.
// setWarm(w): the curse lifting - every crown-fire, light shaft and stained-glass window goes from venom green to gold.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, blankCanvas, liveCanvas, cacheCanvas , freeCanvases } from '../canvasmem.js';

// Throne-room readability (the fighters' dark outlines were lost over the dark wall base: an edge-loss of 24-41 % for the
// heroes here vs 3-14 % elsewhere; tools/sprite3d/review/arena_read.py):
//   'light' = firelight washing up the back wall's base behind the fighters: ember pools in front of the grille bays (the
//             lava glowing through them), venom-green pools under the dais' crown-fire statues, over a low base so no
//             walkable spot goes dark; brightest at the wall-floor line, cooling to deep red as it rises, gone well below
//             the upper wall; a thin dark contact line keeps the lane's back edge crisp; a slow flicker.
//   'vig'   = the vignette reshaped: the top corners as dark as before, the sides opened up at fighter height.
//   'rim'   = a soft light rim behind the sprites (SPRITE_RIM through src/sprite3d.js; off: the critics found the even
//             glow sticker-like, and the backdrop alone reaches the bar).
// ?l4fix=light,vig | none | ... (A/B tests).
const L4FIX = (() => {
  const dflt = new Set(['light', 'vig']);
  try { const q = new URLSearchParams(location.search).get('l4fix'); return q === null ? dflt : new Set(q.split(',')); } catch { return dflt; }
})();
export const SPRITE_RIM = L4FIX.has('rim') ? { color: 'rgba(255,176,112,0.45)', blur: 3 } : null;
const EMBER = [255, 138, 61], EMBER_RED = [184, 64, 42], VENOM = [60, 255, 120];
// the light's settings: base strength, the share of it the black plinths keep, the green glow's strength and half-width,
// the spill past the lane's back edge onto the floor, the share of the green glow the plinths keep
// (?l4p=base,plinth,green,greenRx,floor,glowPlinth: tuning; the defaults = arena_read's 'pb' + the plinth cut, the
//  green ~15 % under pb's -- critics r3: the statue pools' green the most saturated thing in the frame)
const L4P = (() => {
  const d = { base: 0.55, plinth: 0.3, green: 0.36, greenRx: 150, floor: 0.4, glowPlinth: 0.25 };
  try {
    const q = new URLSearchParams(location.search).get('l4p');
    if (q) { const v = q.split(',').map(Number); ['base', 'plinth', 'green', 'greenRx', 'floor', 'glowPlinth'].forEach((k, i) => { if (Number.isFinite(v[i])) d[k] = v[i]; }); }
  } catch { /* defaults */ }
  return d;
})();

// ---------------------------------------------------------------------------------------------------------------
// contract
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 7200;
export const SECTIONS = [
  { id: 'caldera', name: 'The Caldera Causeway', x0: 0, x1: 1600 },
  { id: 'gates', name: 'The Palace Gates', x0: 1600, x1: 3200 },
  { id: 'halls', name: 'The Treasure Halls', x0: 3200, x1: 5400 },
  { id: 'throne', name: 'The Ember Throne', x0: 5400, x1: 7200 },
];
// Visual hooks the engine animates on top of the art (world x; y = screen y).
export const HOOKS = {
  arenas: [600, 1900, 3200, 4500, 6240],
  fireStatues: [{ x: 2040, y: 306 }, { x: 2440, y: 306 }, { x: 2840, y: 306 }], // dragon-head mouths on the gates pillars (fire goes forward/down)
  waystones: [2700, 5300],                                                    // kept calm behind
  throneX: 6950,                                                              // the dais backdrop is centred here
  chandeliers: { x0: 3260, x1: 5360 },                                        // the near ceiling is kept free for the engine's chandeliers
};

// ---------------------------------------------------------------------------------------------------------------
// math, random, colour
// ---------------------------------------------------------------------------------------------------------------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));

function mulberry(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.r = (a, b) => a + (b - a) * f();
  f.i = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}
function hash1(n) {
  n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
const hash2 = (x, y) => hash1(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663));
// piecewise-linear value noise (jagged ridgelines); pure function of x, so chunk-safe
function vnoise(x, s, seed) { const i = Math.floor(x / s), f = x / s - i; return lerp(hash2(i, seed), hash2(i + 1, seed), f) - 0.5; }

const _rgb = new Map();
function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = _rgb.get(c);
  if (!v) {
    const n = parseInt(c.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    _rgb.set(c, v);
  }
  return v;
}
const hex2 = (v) => (v < 16 ? '0' : '') + v.toString(16);
function mix(a, b, t) {
  a = rgb(a); b = rgb(b);
  return '#' + hex2(Math.round(a[0] + (b[0] - a[0]) * t)) + hex2(Math.round(a[1] + (b[1] - a[1]) * t)) +
    hex2(Math.round(a[2] + (b[2] - a[2]) * t));
}
function rgba(c, a) { c = rgb(c); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
const darken = (c, k) => mix(c, '#140c12', k);

// ---------------------------------------------------------------------------------------------------------------
// canvas helpers (same conventions as src/stage.js)
// ---------------------------------------------------------------------------------------------------------------
function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return c;
}
// A sprite: logical size w x h, anchor (ox, oy) from its top-left; draw() works in anchor-relative logical units.
function makeSprite(w, h, ox, oy, sc, draw) {
  // (src/canvasmem.js: a lower scale if the canvas memory cap refuses this one; none at all -> an empty sprite, reported)
  const L = layerCanvas(w, h, sc);
  if (!L) {                                // (painted live each draw instead: src/canvasmem.js liveCanvas)
    const vw = Math.ceil(w * sc), vh = Math.ceil(h * sc);
    return { c: liveCanvas(vw, vh, (g) => { g.transform(sc, 0, 0, sc, ox * sc, oy * sc); g.lineJoin = 'round'; g.lineCap = 'round'; draw(g); }), w: vw / sc, h: vh / sc, ox, oy };
  }
  const c = L.c, g = L.g;
  sc = L.sc;
  g.setTransform(sc, 0, 0, sc, ox * sc, oy * sc);
  g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g);
  return { c, w: c.width / sc, h: c.height / sc, ox, oy };
}
// A horizontal strip of layer content, chunked so no canvas exceeds ~2048 device px wide.
function buildStrip(lx0, lx1, y0, y1, sc, p, draw) {
  const chunks = [];
  const cw = Math.max(256, Math.floor(2040 / sc) - 8);
  for (let x = lx0; x < lx1; x += cw) {
    const xa = x - 3, xb = Math.min(lx1, x + cw) + 3;
    // (src/canvasmem.js: a lower scale if the canvas memory cap refuses this one; none at all -> the chunk is painted
    //  live each frame by drawStrip -- slower, but never a black background)
    const paint = (g) => { g.lineJoin = 'round'; g.lineCap = 'round'; g.save(); g.beginPath(); g.rect(xa, y0, xb - xa, y1 - y0); g.clip(); draw(g, xa, xb); g.restore(); };
    const L = layerCanvas(xb - xa, y1 - y0, sc);
    if (!L) { chunks.push({ c: null, x: xa, w: xb - xa, h: y1 - y0, paint }); continue; }
    const c = L.c, g = L.g, s = L.sc;
    g.setTransform(s, 0, 0, s, -xa * s, -y0 * s);
    paint(g);
    chunks.push({ c, x: xa, w: c.width / s, h: c.height / s });
  }
  return { chunks, y0, p };
}
function poly(g, p) {
  g.beginPath(); g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.closePath();
}
function polyline(g, p) {
  g.beginPath(); g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
}
// smooth closed curve through midpoints of the control polygon
function blob(g, p) {
  const n = p.length >> 1;
  g.beginPath();
  g.moveTo((p[(n - 1) * 2] + p[0]) / 2, (p[(n - 1) * 2 + 1] + p[1]) / 2);
  for (let i = 0; i < n; i++) {
    const j = ((i + 1) % n) * 2;
    g.quadraticCurveTo(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[j]) / 2, (p[i * 2 + 1] + p[j + 1]) / 2);
  }
  g.closePath();
}
// open smooth curve
function curve(g, p, move = true) {
  const n = p.length >> 1;
  if (move) { g.beginPath(); g.moveTo(p[0], p[1]); } else g.lineTo(p[0], p[1]);
  for (let i = 1; i < n - 1; i++) {
    g.quadraticCurveTo(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[i * 2 + 2]) / 2, (p[i * 2 + 1] + p[i * 2 + 3]) / 2);
  }
  g.lineTo(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
}
// Outline style: scenery uses a thinner line tinted to its section's dark colour so the actors (full INK) pop;
// breakable props are built with the full INK style (see buildItems).
let LINE = INK, LK = 1;
function lineStyle(col, k) { LINE = col; LK = k; }
// Inked shape: heavier offset line on the lower-right (varied weight), flat fill, clipped inner shading, outline.
function ink(g, build, fill, lw, inner, line = LINE) {
  lw *= LK;
  if (lw >= 1.8) {
    g.save(); g.translate(lw * 0.22, lw * 0.36); build(g);
    g.lineWidth = lw * 1.45; g.strokeStyle = line; g.stroke(); g.restore();
  }
  build(g);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (inner) { g.save(); build(g); g.clip(); inner(g); g.restore(); }
  if (lw > 0) { build(g); g.lineWidth = lw; g.strokeStyle = line; g.stroke(); }
}
function strokeLine(g, pts, lw, col) {
  polyline(g, pts); g.lineWidth = lw; g.strokeStyle = col; g.stroke();
}
// midpoint displacement between a and b ([x,y]); returns array of [x,y]
function mdp(a, b, R, depth, rough) {
  let pts = [a, b];
  let amp = rough * Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let d = 0; d < depth; d++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const off = (R() * 2 - 1) * amp;
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
      np.push([(p[0] + q[0]) / 2 - (dy / l) * off, (p[1] + q[1]) / 2 + (dx / l) * off], q);
    }
    pts = np; amp *= 0.5;
  }
  return pts;
}
const flat = (pts) => { const o = []; for (const p of pts) o.push(p[0], p[1]); return o; };
// convex hull (monotone chain) of [[x, y], ...]
function hull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
// round-topped arch opening, base on y = by
function archPath(g, cx, by, hw, spring) {
  g.beginPath(); g.moveTo(cx - hw, by); g.lineTo(cx - hw, spring); g.arc(cx, spring, hw, Math.PI, 0); g.lineTo(cx + hw, by); g.closePath();
}
// pointed (lancet) arch, base on y = by, apex at ty
function lancetPath(g, cx, by, hw, spring, ty) {
  g.beginPath(); g.moveTo(cx - hw, by); g.lineTo(cx - hw, spring);
  g.quadraticCurveTo(cx - hw, ty + (spring - ty) * 0.25, cx, ty);
  g.quadraticCurveTo(cx + hw, ty + (spring - ty) * 0.25, cx + hw, spring);
  g.lineTo(cx + hw, by); g.closePath();
}
// soft radial sprite (glows, smoke, embers)
function radialSprite(r, sc, stops) {
  return makeSprite(r * 2, r * 2, r, r, sc, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
  });
}
// faceted rock face below topFn: lit left planes, shaded right planes, crevices (pure function of x: chunk-safe)
function facets(g, xs, xe, topFn, P, seed, step, yBot) {
  const edge = (i) => i * step + (hash2(i, seed) - 0.5) * step * 0.5;
  for (let i = Math.floor(xs / step) - 2; ; i++) {
    const xa = edge(i), xb = edge(i + 1);
    if (xa > xe + 4) break;
    if (xb < xs - 4) continue;
    const h = hash2(i * 3, seed + 1), w = xb - xa;
    const ya = topFn(xa) + 3 + h * 14, yb = topFn(xb) + 3 + hash2(i * 3 + 3, seed + 1) * 14;
    const mx = xa + w * (0.35 + h * 0.2), my = Math.min(ya, yb) - 4 - h * 8;
    g.fillStyle = P.sh; poly(g, [mx, my, xb, yb, xb + 2, yBot, mx + w * 0.1, yBot]); g.fill();
    g.fillStyle = P.hi; poly(g, [xa, ya, mx, my, mx - w * 0.08, my + 26, xa + w * 0.1, yBot, xa, yBot]); g.fill();
    if (P.crev) { g.strokeStyle = P.crev; g.lineWidth = P.crevW || 1.4; polyline(g, [xa, ya, xa + 3, ya + 30, xa - 2, ya + 70, xa + 2, yBot]); g.stroke(); }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// palettes
// ---------------------------------------------------------------------------------------------------------------
const OB = { base: '#2f2834', sh: '#1d1820', dk: '#120e14', hi: '#4b4256', gloss: '#b4a6cc', joint: '#151017' };   // obsidian
const GD = { base: '#e0ad48', sh: '#a8782a', dk: '#6a4718', hi: '#ffe7a0', pale: '#fff6d6' };                     // gold
const CR = { base: '#a3283a', sh: '#6c1626', dk: '#420c16', hi: '#d0505a' };                                     // crimson
const KG = { green: '#7cc95c', greenSh: '#3f7f3a', greenHi: '#c8f5a0', glass: '#9cf07a' };
const LV = { dk: '#6a160e', red: '#c4321a', or: '#f2661e', yel: '#ffae36', core: '#ffeaa0', crust: '#3a181c', crustHi: '#6c2e2a' };
const FIRE = { outer: '#2f9440', mid: '#73e35c', core: '#e2ffb8' };
const FIRE_WARM = { outer: '#c4501c', mid: '#ffa53a', core: '#fff0b8' };
const KING = { sc: '#2c2834', sh: '#19161f', hi: '#4a4459', rim: '#8d86ad', horn: '#d8cfb6', hornSh: '#9e9378', eye: '#8ef06a', eyeSh: '#2f7a2a',
  mouth: '#4a1420', tooth: '#fff8e4', crown: GD.base, crownSh: GD.sh, crownHi: GD.hi, flame: '#8ef06a', flameSh: '#3f9a3a' };
// floor palettes
const FP = {
  cal: { stone: '#5c4a51', stoneSh: '#3f3138', stoneHi: '#7f6b70', joint: '#2a1c23' },
  gat: { stone: '#4e4458', stoneSh: '#352c3f', stoneHi: '#716584', joint: '#1a1420' },
  hal: { stone: '#cdb18a', stoneSh: '#a98b63', stoneHi: '#ead6b0', joint: '#7c5c3c' },
  thr: { stone: '#4e2e38', stoneSh: '#351c25', stoneHi: '#6f4452', joint: '#1d0d14' },
};
// section ink (thin, tinted) for scenery
const LINE_CAL = '#2a1620', LINE_GAT = '#160e18', LINE_HAL = '#2c170f', LINE_THR = '#1f0c12';

// ---------------------------------------------------------------------------------------------------------------
// world layout constants
// ---------------------------------------------------------------------------------------------------------------
const CAM_MAX = LEVEL_LEN - W;
const GT0 = 306;                          // ground tiles cover screen y GT0..H
const PYL1 = 1640, PYL2 = 3220, PYL3 = 5420; // section pylons (clip edges of the deep layers hide behind them)
const P_FAR = 0.1, P_MID = 0.3, P_LAKEF = 0.4, P_LAKEN = 0.75, P_GDEEP = 0.55, P_HDEEP = 0.6, P_TDEEP = 0.5, P_FRONT = 1.25;
const SMOKE_PERIOD = 1700;
const G_PIL = [2040, 2440, 2840];                     // gates pillars (each carries a fire-statue dragon head)
const G_BAYS = [[1840, 'door'], [2240, 'port'], [2640, 'open'], [3040, 'port']];
const G_BRAZ = [1728, 1952, 2128, 2352, 2928, 3152];   // dragon-statue braziers at the back boundary
const H_PIL = [3660, 4100, 4540, 4980];
const H_BAYS = [[3440, 'view'], [3880, 'portrait'], [4320, 'view'], [4760, 'bust'], [5200, 'view']];
const T_WIN = [5620, 6020, 6420];
const T_PIL = [5820, 6220, 6620];
const DAIS_X = 6950;
// the throne room's light pools on the wall base (L4FIX 'light'): ember in front of the grille bays (the lava glowing
// through them; a weaker one at the pillar base between the last bay and the dais: critics r3, the guard there), venom
// green under the dais' crown-fire statues; [world x, colour, strength over the base band]
const UP_POOLS = [[5620, 'ember', 0.55], [6020, 'ember', 0.55], [6420, 'ember', 0.55], [6600, 'ember', 0.35], [DAIS_X - 204, 'venom', 0.32], [DAIS_X + 204, 'venom', 0.32]];
// the gates' light (the same build; painted sweep: Ana lost 27 % at camX 1900, 17 % at 1200): ember pools at the lava
// bays (the portcullises and the open arch), at the fire-statue pillars and, weaker, at the door and the pylon; the
// green glow at the dragon-statue braziers' feet (their plinths: the k 0.9 pedestals on the floor line, cut out)
const GATE_POOLS = [[1380, 'ember', 0.45], [1640, 'ember', 0.3], [1840, 'ember', 0.25], [2040, 'ember', 0.6], [2240, 'ember', 0.55],
  [2440, 'ember', 0.6], [2640, 'ember', 0.55], [2840, 'ember', 0.6], [3040, 'ember', 0.55], ...G_BRAZ.map((x) => [x, 'venom', 1]),
  // (the lava glowing up inside the portcullises / the open arch; the fire statues' fire warming the floor below them)
  [2240, 'arch', 0.4], [2640, 'arch', 0.4], [3040, 'arch', 0.4], ...G_PIL.map((x) => [x, 'floor', 0.55])];
// (from the causeway's last lava-lit post, 1380, to past the vault pylon; the fire-statue pillars' dark bases the worst)
const GATES_SPAN = [1240, PYL2 + 60];
const ROOM_THR = { pools: UP_POOLS, plinth: { hw: 42, y: 282, h: 46 }, glow: { rx: L4P.greenRx, cy: 336, h: 140, k: 1, spr: 'venomGlowCut' } };
// (critics: the paired statues' pools merged into a neon strip and turned the gold lemon -> narrower and lower, the
//  contact line drawn over them)
const ROOM_GAT = { pools: GATE_POOLS, plinth: { hw: 27, y: 341, h: 27 }, glow: { rx: 72, cy: 352, h: 84, k: 1, spr: 'venomGlowCutG' },
  span: GATES_SPAN, fade: 160, base: 1.12, lineLast: true };
const CAL_POSTS = [180, 480, 780, 1080, 1380];
const PAL_X = 820;                                    // palace centre (mid-layer coords)
const al = (x, st) => Math.floor(x / st) * st;        // world-aligned loop start (chunk-safe sampling)

// ---------------------------------------------------------------------------------------------------------------
// LAYOUT (scale independent, built once)
// ---------------------------------------------------------------------------------------------------------------
const LAY = (() => {
  const R = mulberry(20261007);
  // smoke banks over the caldera (wrap period SMOKE_PERIOD)
  const smoke = [];
  for (let i = 0; i < 9; i++) {
    const w = R.r(260, 520);
    smoke.push({ x: R.r(0, SMOKE_PERIOD), y: R.r(26, 150) + i * 4, w, h: w * R.r(0.22, 0.32), seed: R.i(1, 1e9), sp: R.r(3, 7) });
  }
  // glowing veins down the crater wall (far-layer coords)
  const veins = [];
  for (let x = 30; x < 1220; x += R.r(70, 150)) veins.push({ x, seed: R.i(1, 1e9), k: R.r(0.5, 1) });
  // lavafalls down the crater wall (far layer) and in the throne cavern (deep layer)
  const farFalls = [{ x: 318, w: 9 }, { x: 702, w: 13 }, { x: 1096, w: 8 }];
  const tFalls = [];
  for (let x = 2750; x < 4120; x += R.r(150, 200)) tFalls.push({ x, w: R.r(30, 52), y0: R.r(72, 128), seed: R.i(1, 1e9), head: R() < 0.7 });
  // inner crater spires (mid layer)
  const spires = [];
  for (const [x, w, top] of [[-30, 150, 196], [70, 110, 226], [190, 170, 174], [330, 120, 214], [430, 100, 236], [1190, 120, 206], [1290, 160, 176], [1420, 140, 214], [1520, 110, 232]]) {
    spires.push({ x: x + R.r(-12, 12), w, top: top + R.r(-8, 8), seed: R.i(1, 1e9) });
  }
  // coin mounds in the treasure vault (deep-layer coords)
  const mounds = [];
  for (let x = 1880; x < 3720; x += R.r(110, 170)) mounds.push({ x, w: R.r(220, 360), top: R.r(206, 262), seed: R.i(1, 1e9), back: true });
  for (let x = 1920; x < 3720; x += R.r(150, 230)) mounds.push({ x, w: R.r(180, 300), top: R.r(244, 300), seed: R.i(1, 1e9), back: false });
  // ash flakes and embers
  const ash = [];
  for (let i = 0; i < 170; i++) {
    const layer = i < 70 ? 0 : i < 140 ? 1 : 2;
    ash.push({ layer, x: R.r(0, 1000), y: R.r(0, 580), sp: R.r(0.7, 1.3) * [14, 26, 46][layer], sw: R.r(6, 18), fr: R.r(0.4, 1.2), ph: R.r(0, TAU), k: R(), sz: R.r(0.8, 1.25) });
  }
  const embers = [];
  for (let i = 0; i < 70; i++) {
    const layer = i < 30 ? 0 : i < 58 ? 1 : 2;
    embers.push({ layer, x: R.r(0, 1000), y: R.r(0, 600), sp: R.r(0.7, 1.4) * [22, 34, 56][layer], sw: R.r(6, 22), fr: R.r(0.8, 2.2), ph: R.r(0, TAU), k: R(), tw: R.r(3, 9) });
  }
  // lava bubbles / shimmer (lake near-band coords)
  const bubbles = [], glints = [];
  for (let i = 0; i < 14; i++) bubbles.push({ x: R.r(0, 1500), y: R.r(300, 330), per: R.r(2.2, 4.5), ph: R.r(0, 10), r: R.r(3, 6) });
  for (let i = 0; i < 18; i++) glints.push({ x: R.r(0, 1500), y: R.r(262, 330), sp: R.r(4, 10), w: R.r(14, 40), ph: R.r(0, TAU) });
  // cursed whelps circling the palace towers (mid-layer coords)
  const whelps = [];
  for (let i = 0; i < 6; i++) whelps.push({ rx: R.r(140, 330), ry: R.r(18, 40), cy: R.r(96, 168), sp: R.r(0.16, 0.3) * (R() < 0.35 ? -1 : 1), ph: R.r(0, TAU), s: R.r(0.75, 1.15), fl: R.r(5, 7) });
  return { smoke, veins, farFalls, tFalls, spires, mounds, ash, embers, bubbles, glints, whelps };
})();

// tiny dragon silhouette (faces +x when dir = 1); flap -1 (down) .. 1 (up)  (same shape as level 1's)
function dragonSil(ctx, x, y, s, flap, dir) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir * s, s);
  ctx.beginPath();
  ctx.moveTo(15, -5); ctx.lineTo(11, -7.5); ctx.lineTo(10, -10); ctx.lineTo(8.5, -7.2);
  ctx.quadraticCurveTo(5, -6, 3, -2.5); ctx.quadraticCurveTo(-3, -1.5, -9, 0.5);
  ctx.quadraticCurveTo(-16, 3, -22, 1); ctx.lineTo(-27, -1.5); ctx.lineTo(-25, 2); ctx.lineTo(-28, 4); ctx.lineTo(-22, 3.4);
  ctx.quadraticCurveTo(-15, 5.5, -8, 3.4); ctx.quadraticCurveTo(-1, 2.4, 4, 0.6);
  ctx.quadraticCurveTo(8, -2.5, 11, -3.4); ctx.lineTo(15, -3.6);
  ctx.closePath(); ctx.fill();
  for (const [ox, k] of [[1.5, 0.78], [0, 1]]) {
    const wy = -15 * flap * k, tip = -10 * k;
    ctx.beginPath();
    ctx.moveTo(2 + ox, -1.5);
    ctx.quadraticCurveTo(0 + ox, wy * 0.7 - 2, tip + ox, wy - 1);
    ctx.quadraticCurveTo(tip + 1 + ox, wy * 0.55, -5 + ox, wy * 0.42 + 1);
    ctx.quadraticCurveTo(-5.5 + ox, wy * 0.25 + 1, -8 + ox, wy * 0.3 + 1.5);
    ctx.quadraticCurveTo(-7 + ox, wy * 0.1 + 1, -9 + ox, 1);
    ctx.lineTo(-2 + ox, 0.8);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------------------
// EMBLEMS, BANNERS, THE KING'S HEAD
// ---------------------------------------------------------------------------------------------------------------
// The Dragon King's sigil: his head (facing left) wearing a crown of flames.
function crownSigil(g, cx, cy, s, col, eye, flame = col) {
  g.save(); g.translate(cx, cy); g.scale(s / 44, s / 44);
  g.fillStyle = flame;
  g.beginPath();
  g.moveTo(-12, -13);
  g.quadraticCurveTo(-18, -21, -13, -30); g.quadraticCurveTo(-11, -23, -6, -21);
  g.quadraticCurveTo(-8, -32, 1, -40); g.quadraticCurveTo(-1, -30, 5, -23);
  g.quadraticCurveTo(7, -30, 14, -32); g.quadraticCurveTo(10, -24, 13, -13);
  g.closePath(); g.fill();
  g.fillStyle = col;
  poly(g, [-13, -16, 14, -16, 13, -10, -12, -10]); g.fill();                 // crown band
  g.beginPath();                                                           // head
  g.moveTo(16, -10); g.quadraticCurveTo(4, -14, -7, -10);
  g.lineTo(-20, -6); g.lineTo(-23, -1); g.lineTo(-11, 0); g.lineTo(-19, 7); g.lineTo(-6, 7);
  g.quadraticCurveTo(3, 10, 7, 19); g.lineTo(17, 22); g.quadraticCurveTo(14, 7, 19, -3); g.lineTo(28, -11); g.lineTo(20, -8);
  g.closePath(); g.fill();
  poly(g, [19, -3, 26, 1, 18, 4, 24, 9, 16, 11]); g.fill();                 // neck spines
  g.fillStyle = eye;
  poly(g, [-6, -6, 2, -8, -1, -4]); g.fill();
  g.restore();
}
function bannerShape(g, x, y, w, h) {
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h * 0.8); g.lineTo(x + w / 2, y + h); g.lineTo(x, y + h * 0.8); g.closePath();
}
// crimson royal banner with the green flame-crown sigil and gold trim; rod on top
function drawRoyalBanner(g, x, y, w, h, lw = 2.2, sig = KG.green) {
  ink(g, (g) => bannerShape(g, x, y, w, h), CR.base, lw, (g) => {
    g.fillStyle = CR.hi; g.fillRect(x, y, w * 0.14, h);
    g.fillStyle = CR.sh; g.fillRect(x + w * 0.72, y, w * 0.3, h);
    g.strokeStyle = rgba(CR.dk, 0.55); g.lineWidth = 1.2;
    for (const f of [0.3, 0.55]) { curve(g, [x + w * f, y + 8, x + w * (f - 0.03), y + h * 0.45, x + w * f, y + h * 0.9]); g.stroke(); }
    g.strokeStyle = GD.base; g.lineWidth = Math.max(1.4, w * 0.04);
    bannerShape(g, x + w * 0.1, y + 6, w * 0.8, h * 0.92 - 6); g.stroke();
    // dark field + sigil
    g.fillStyle = rgba(CR.dk, 0.55); g.beginPath(); g.ellipse(x + w / 2, y + h * 0.42, w * 0.3, w * 0.34, 0, 0, TAU); g.fill();
    crownSigil(g, x + w / 2 + w * 0.02, y + h * 0.45, w * 0.62, sig, CR.dk);
  });
  // tassel at the point
  ink(g, (g) => poly(g, [x + w / 2 - 3, y + h - 1, x + w / 2 + 3, y + h - 1, x + w / 2 + 4, y + h + 9, x + w / 2 - 4, y + h + 9]), GD.base, 1.3);
  // rod + finials
  ink(g, (g) => { g.beginPath(); g.rect(x - 6, y - 5, w + 12, 5); }, GD.sh, 1.4, (g) => { g.fillStyle = GD.hi; g.fillRect(x - 6, y - 5, w + 12, 1.4); });
  for (const fx of [x - 8, x + w + 8]) ink(g, (g) => { g.beginPath(); g.arc(fx, y - 2.5, 3.6, 0, TAU); }, GD.base, 1.3);
}
// small gold crown (finials, keystones); base centre at (x, y)
function smallCrown(g, x, y, s, col, colSh, gem = KG.glass, lw = 1.4) {
  const p = [x - s, y, x - s, y - s * 0.55, x - s * 1.1, y - s * 1.25, x - s * 0.45, y - s * 0.75, x, y - s * 1.55, x + s * 0.45, y - s * 0.75, x + s * 1.1, y - s * 1.25, x + s, y - s * 0.55, x + s, y];
  ink(g, (g) => poly(g, p), col, lw, (g) => { g.fillStyle = colSh; g.fillRect(x + s * 0.3, y - s * 2, s, s * 2); });
  g.fillStyle = gem; g.beginPath(); g.arc(x, y - s * 0.35, s * 0.22, 0, TAU); g.fill();
}

// The Dragon King's head, 3/4 profile facing left with his chin raised (smug). Origin = base of the neck; ~150 wide.
function kingHead(g, P, o = {}) {
  const lw = o.lw ?? 2.6;
  // far horn
  ink(g, (g) => { g.beginPath(); g.moveTo(18, -112); g.quadraticCurveTo(52, -142, 92, -140); g.quadraticCurveTo(62, -126, 44, -100); g.closePath(); }, P.hornSh, lw * 0.85);
  // neck + shoulders
  ink(g, (g) => { g.beginPath(); g.moveTo(-36, 6); g.quadraticCurveTo(-22, -40, -2, -70); g.lineTo(46, -84); g.quadraticCurveTo(64, -40, 62, 6); g.closePath(); }, P.sc, lw, (g) => {
    g.fillStyle = P.sh; g.beginPath(); g.ellipse(52, -30, 26, 60, 0, 0, TAU); g.fill();
    g.fillStyle = P.belly || P.hi; // throat plates
    g.beginPath(); g.moveTo(-34, 8); g.quadraticCurveTo(-20, -36, -2, -66); g.lineTo(8, -60); g.quadraticCurveTo(-6, -30, -10, 8); g.closePath(); g.fill();
    g.strokeStyle = rgba(P.sh, 0.8); g.lineWidth = 1.3;
    for (let k = 0; k < 6; k++) { const y = -58 + k * 11; polyline(g, [-24 + k * -1.6 + (k * k) * 0.3, y, -6 - k * 0.6, y + 2]); g.stroke(); }
  });
  // neck spines
  for (const [x, y, l] of [[54, -78, 16], [62, -52, 14], [64, -26, 12]]) ink(g, (g) => poly(g, [x - 4, y - 6, x + l, y - 2, x - 2, y + 6]), P.hornSh, lw * 0.7);
  // head
  const head = [-96, -118, -104, -110, -100, -98, -86, -92, -62, -88, -40, -76, -16, -72, 8, -78, 30, -92, 44, -112, 34, -132, 8, -142, -26, -138, -60, -130];
  ink(g, (g) => blob(g, head), P.sc, lw, (g) => {
    g.fillStyle = P.sh; g.beginPath(); g.ellipse(26, -96, 30, 36, 0.3, 0, TAU); g.fill();
    g.fillStyle = P.hi; g.beginPath(); g.ellipse(-54, -126, 34, 7, -0.18, 0, TAU); g.fill();
    // jaw line + smug smile curling up at the corner
    g.strokeStyle = LINE; g.lineWidth = lw * 0.6;
    curve(g, [-98, -101, -70, -94, -42, -92, -30, -98, -24, -104]); g.stroke();
    g.fillStyle = P.tooth; poly(g, [-74, -95, -70, -88, -66, -94]); g.fill();
    // nostril
    g.fillStyle = P.sh; g.beginPath(); g.ellipse(-90, -116, 5, 2.6, -0.3, 0, TAU); g.fill();
    // cheek scales
    g.strokeStyle = rgba(P.sh, 0.9); g.lineWidth = 1.2;
    for (const [x, y] of [[-6, -100], [6, -92], [-12, -88], [18, -104], [2, -110]]) { g.beginPath(); g.arc(x, y, 5, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    // rim light (cool) along the back of the skull
    g.strokeStyle = rgba(P.rim, 0.75); g.lineWidth = 2;
    g.beginPath(); g.arc(14, -110, 32, -1.2, 0.5); g.stroke();
  });
  // eye: half-closed, smug
  ink(g, (g) => { g.beginPath(); g.moveTo(-42, -120); g.quadraticCurveTo(-30, -128, -18, -122); g.quadraticCurveTo(-30, -114, -42, -120); g.closePath(); }, P.eye, lw * 0.5, (g) => {
    g.fillStyle = P.eyeSh; g.fillRect(-44, -130, 30, 7);
    g.fillStyle = '#10140e'; g.fillRect(-29, -126, 3, 8);
  });
  // heavy lid + brow ridge
  ink(g, (g) => { g.beginPath(); g.moveTo(-48, -122); g.quadraticCurveTo(-30, -136, -10, -124); g.quadraticCurveTo(-28, -130, -48, -122); g.closePath(); }, P.sh, lw * 0.6);
  // near horn
  ink(g, (g) => { g.beginPath(); g.moveTo(4, -132); g.quadraticCurveTo(40, -170, 86, -168); g.quadraticCurveTo(54, -154, 32, -120); g.closePath(); }, P.horn, lw, (g) => {
    g.fillStyle = P.hornSh; g.beginPath(); g.moveTo(14, -124); g.quadraticCurveTo(46, -152, 86, -166); g.lineTo(90, -150); g.lineTo(32, -116); g.closePath(); g.fill();
    g.strokeStyle = rgba(P.hornSh, 0.9); g.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) { const x = 22 + k * 14; polyline(g, [x, -132 - k * 8, x + 6, -122 - k * 9]); g.stroke(); }
  });
  // crown of flames
  if (!o.noCrown) {
    const cx = -18, cy = -136;
    g.save(); g.translate(cx, cy); g.rotate(-0.16);
    ink(g, (g) => { g.beginPath(); g.moveTo(-24, 2); g.quadraticCurveTo(-34, -12, -24, -30); g.quadraticCurveTo(-20, -16, -12, -14); g.quadraticCurveTo(-16, -34, 0, -48); g.quadraticCurveTo(-2, -30, 8, -20); g.quadraticCurveTo(12, -32, 26, -36); g.quadraticCurveTo(18, -18, 26, 2); g.closePath(); }, P.flame, lw * 0.7, (g) => {
      g.fillStyle = P.flameSh; g.fillRect(4, -50, 30, 56);
      g.fillStyle = rgba('#ffffff', 0.45); g.beginPath(); g.ellipse(-4, -20, 4, 10, 0.2, 0, TAU); g.fill();
    });
    ink(g, (g) => poly(g, [-28, 6, 30, 6, 28, -6, -26, -6]), P.crown, lw * 0.8, (g) => {
      g.fillStyle = P.crownSh; g.fillRect(10, -8, 24, 16);
      g.fillStyle = P.crownHi; g.fillRect(-26, -6, 40, 2.4);
      for (const [x, c] of [[-16, '#e8384a'], [0, KG.glass], [16, '#e8384a']]) { g.fillStyle = c; g.beginPath(); g.arc(x, 0, 3, 0, TAU); g.fill(); }
    });
    g.restore();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// FLAMES, HANGING CLOTH (live)
// ---------------------------------------------------------------------------------------------------------------
// fs = { pal, glows: [[sprite, alpha], ...] } (the stage's current fire state: venom green, or warming to gold)
function drawFlame(ctx, x, y, size, t, seed, fs, glowA = 1) {
  const k = size / 30, pal = fs.pal;
  ctx.globalCompositeOperation = 'lighter';
  const fl0 = 0.75 + 0.15 * Math.sin(t * 9 + seed) + 0.1 * Math.sin(t * 23 + seed * 3);
  const r = 70 * k;
  for (const [spr, a] of fs.glows) {
    ctx.globalAlpha = glowA * a * fl0;
    ctx.drawImage(spr.c, x - r, y - r * 1.15, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const layers = [[pal.outer, 1, 1], [pal.mid, 0.72, 0.82], [pal.core, 0.4, 0.55]];
  for (let L = 0; L < 3; L++) {
    const [col, ws, hs] = layers[L];
    ctx.fillStyle = col;
    for (let j = 0; j < 3; j++) {
      const ph = seed * 1.7 + j * 2.1;
      const fl = 0.78 + 0.16 * Math.sin(t * 11 + ph) + 0.09 * Math.sin(t * 27 + ph * 2);
      const h = size * hs * fl * (j === 0 ? 1.15 : 0.7);
      const w = size * 0.32 * ws * (j === 0 ? 1 : 0.7);
      const ox = (j - 1) * size * 0.22 * ws;
      const sway = Math.sin(t * 6 + ph) * size * 0.12 + size * 0.06;
      ctx.beginPath();
      ctx.moveTo(x + ox - w, y);
      ctx.quadraticCurveTo(x + ox - w * 1.05, y - h * 0.55, x + ox + sway, y - h);
      ctx.quadraticCurveTo(x + ox + w * 0.9, y - h * 0.5, x + ox + w, y);
      ctx.quadraticCurveTo(x + ox, y + w * 0.5, x + ox - w, y);
      ctx.fill();
    }
  }
  ctx.fillStyle = pal.mid;
  for (let i = 0; i < 3; i++) {
    const ph = ((t * 0.9 + i / 3 + seed * 0.13) % 1);
    ctx.globalAlpha = 1 - ph;
    ctx.fillRect(x + Math.sin(ph * 9 + i + seed) * size * 0.4, y - size * 0.6 - ph * size * 1.6, 2, 2);
  }
  ctx.globalAlpha = 1;
}
// hanging banner swaying (top fixed): horizontal strips
function drawHang(ctx, spr, x, y, t, seed, amp = 3, strips = 8) {
  const sh = spr.c.height / strips, dh = spr.h / strips;
  for (let i = 0; i < strips; i++) {
    const f = i / (strips - 1);
    const off = Math.sin(t * 1.7 - i * 0.45 + seed) * amp * f * f;
    ctx.drawImage(spr.c, 0, i * sh, spr.c.width, sh + 0.5, x + off, y + i * dh, spr.w, dh + 0.35);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// CALDERA BACKGROUND (far rim 0.1, palace 0.3, lava lake 0.4 / 0.75)
// ---------------------------------------------------------------------------------------------------------------
const rimBack = (x) => 172 + 20 * Math.sin(x * 0.0105 + 0.5) + 11 * Math.sin(x * 0.027 + 2) + 5 * Math.sin(x * 0.069) - 30 * Math.max(0, Math.sin(x * 0.0041 + 1.1)) ** 5 + vnoise(x, 23, 11) * 18 + vnoise(x, 7, 12) * 5;
const rimFront = (x) => 222 + 14 * Math.sin(x * 0.0083 + 2.1) + 8 * Math.sin(x * 0.023) + 4 * Math.sin(x * 0.061 + 1) - 22 * Math.max(0, Math.sin(x * 0.0057 + 0.2)) ** 6 + vnoise(x, 19, 13) * 16 + vnoise(x, 6, 14) * 4;
function drawFarRim(g, xa, xb) {
  const xs = al(Math.floor(xa), 4) - 8, xe = Math.ceil(xb) + 8, base = 304;
  // back range: hazy, lit from below by the lava
  g.beginPath(); g.moveTo(xs, base);
  for (let x = xs; x <= xe; x += 4) g.lineTo(x, rimBack(x));
  g.lineTo(xe, base); g.closePath();
  let gr = g.createLinearGradient(0, 130, 0, base);
  gr.addColorStop(0, '#55304a'); gr.addColorStop(0.5, '#73364a'); gr.addColorStop(1, '#b0503e');
  g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  facets(g, xs, xe, rimBack, { sh: 'rgba(52,20,40,0.32)', hi: 'rgba(150,90,120,0.16)' }, 21, 64, base);
  g.restore();
  g.beginPath(); for (let x = xs; x <= xe; x += 4) g.lineTo(x, rimBack(x) + 1.5);
  g.strokeStyle = 'rgba(214,150,190,0.3)'; g.lineWidth = 2.5; g.stroke();
  // front range: darker, faceted, glowing veins
  g.beginPath(); g.moveTo(xs, base);
  for (let x = xs; x <= xe; x += 4) g.lineTo(x, rimFront(x));
  g.lineTo(xe, base); g.closePath();
  gr = g.createLinearGradient(0, 190, 0, base);
  gr.addColorStop(0, '#34192c'); gr.addColorStop(0.55, '#4c1f2e'); gr.addColorStop(1, '#8e3a30');
  g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  facets(g, xs, xe, rimFront, { sh: 'rgba(20,6,16,0.45)', hi: 'rgba(130,64,86,0.3)', crev: 'rgba(18,6,14,0.55)', crevW: 1.2 }, 31, 46, base);
  for (const v of LAY.veins) {
    if (v.x < xa - 60 || v.x > xb + 60) continue;
    const R = mulberry(v.seed);
    const y0 = rimFront(v.x) + 10 + R.r(0, 20);
    const pts = flat(mdp([v.x, y0], [v.x + R.r(-26, 26), base], R, 4, 0.14));
    for (const [lw, col] of [[5 * v.k + 2, 'rgba(255,110,40,0.22)'], [2 * v.k + 0.6, 'rgba(255,140,50,0.85)'], [0.8, 'rgba(255,226,140,0.9)']]) { polyline(g, pts); g.lineWidth = lw; g.strokeStyle = col; g.stroke(); }
  }
  for (const f of LAY.farFalls) {   // baked lavafall ribbons (live streaks scroll on top)
    if (f.x < xa - 30 || f.x > xb + 30) continue;
    const y0 = rimFront(f.x) + 4;
    g.fillStyle = 'rgba(255,120,40,0.3)'; poly(g, [f.x - f.w, y0, f.x + f.w, y0, f.x + f.w * 1.8, base, f.x - f.w * 1.8, base]); g.fill();
    g.fillStyle = '#f2702a'; poly(g, [f.x - f.w / 2, y0, f.x + f.w / 2, y0, f.x + f.w * 0.9, base, f.x - f.w * 0.9, base]); g.fill();
    g.fillStyle = '#ffc860'; poly(g, [f.x - f.w * 0.15, y0, f.x + f.w * 0.12, y0, f.x + f.w * 0.2, base, f.x - f.w * 0.25, base]); g.fill();
  }
  gr = g.createLinearGradient(0, 236, 0, base);
  gr.addColorStop(0, 'rgba(255,120,50,0)'); gr.addColorStop(1, 'rgba(255,140,60,0.6)');
  g.fillStyle = gr; g.fillRect(xs, 200, xe - xs, 110);
  g.restore();
  g.beginPath(); for (let x = xs; x <= xe; x += 4) g.lineTo(x, rimFront(x));
  g.strokeStyle = 'rgba(24,8,18,0.7)'; g.lineWidth = 1.4; g.stroke();
}

// inner-crater basalt spire (mid layer)
function drawSpire(g, s) {
  const R = mulberry(s.seed), base = 304;
  const l = mdp([s.x - s.w / 2, base], [s.x - s.w * 0.12, s.top + 10], R, 4, 0.1);
  const tp = mdp([s.x - s.w * 0.12, s.top + 10], [s.x + s.w * 0.08, s.top], R, 2, 0.2);
  const r = mdp([s.x + s.w * 0.08, s.top], [s.x + s.w / 2, base], R, 4, 0.1);
  const sil = flat(l.concat(tp.slice(1), r.slice(1)));
  g.save(); poly(g, sil);
  g.fillStyle = '#2e1824'; g.fill();
  g.clip();
  g.fillStyle = 'rgba(14,4,10,0.45)'; poly(g, [s.x + s.w * 0.04, s.top - 4, s.x + s.w, s.top, s.x + s.w, base + 4, s.x + s.w * 0.1, base + 4]); g.fill();
  g.fillStyle = 'rgba(120,64,90,0.3)'; poly(g, [s.x - s.w * 0.14, s.top + 8, s.x - s.w * 0.02, s.top + 30, s.x - s.w * 0.28, base, s.x - s.w * 0.6, base]); g.fill();
  g.strokeStyle = 'rgba(16,6,12,0.5)'; g.lineWidth = 1.2;
  for (let k = 0; k < 3; k++) { const x = s.x + R.r(-s.w * 0.3, s.w * 0.25), y = R.r(s.top + 20, base - 40); polyline(g, [x, y, x + R.r(-5, 5), y + 18, x + R.r(-6, 6), y + 34]); g.stroke(); }
  g.restore();
  poly(g, sil); g.strokeStyle = 'rgba(22,8,16,0.75)'; g.lineWidth = 1.3; g.stroke();
}

// The Dragon King's palace, rising from the lava (mid-layer coords; base under the lake horizon)
function drawPalace(g, cx) {
  const R = mulberry(4242);
  const line = 'rgba(18,8,16,0.9)';
  const wall = '#2a2131', wallSh = '#1a141f', wallHi = '#3c3146', gold = '#b48a3c', goldSh = '#7e5c24', goldHi = '#e0bc6c', win = '#86d86a';
  // rock pedestal
  const pts = [];
  for (const [a, b] of [[[cx - 420, 306], [cx - 300, 262]], [[cx - 300, 262], [cx - 110, 244]], [[cx - 110, 244], [cx + 150, 242]], [[cx + 150, 242], [cx + 330, 258]], [[cx + 330, 258], [cx + 430, 306]]]) {
    const seg = mdp(a, b, R, 3, 0.07);
    for (let j = pts.length ? 1 : 0; j < seg.length; j++) pts.push(seg[j]);
  }
  const ped = flat(pts);
  g.save(); poly(g, ped); g.fillStyle = '#2a1520'; g.fill(); g.clip();
  facets(g, cx - 430, cx + 440, () => 244, { sh: 'rgba(12,4,10,0.5)', hi: 'rgba(110,56,80,0.3)', crev: 'rgba(14,4,10,0.5)', crevW: 1.1 }, 77, 40, 310);
  g.restore();
  poly(g, ped); g.strokeStyle = line; g.lineWidth = 1.3; g.stroke();
  const arched = (x, y, w, h) => { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); };
  const windowSlit = (x, y, w, h) => {
    g.fillStyle = '#120a10'; arched(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3); g.fill();
    g.fillStyle = rgba(win, 0.7); arched(x - w / 2, y, w, h); g.fill();
    g.fillStyle = rgba('#eaffd0', 0.45); g.fillRect(x - w * 0.15, y + h * 0.45, w * 0.3, h * 0.4);
  };
  const tower = (x, w, top, roofH) => {
    const bot = 256;
    g.fillStyle = wall; g.fillRect(x - w / 2, top, w, bot - top);
    g.fillStyle = wallSh; g.fillRect(x + w * 0.16, top, w * 0.34, bot - top);
    g.fillStyle = wallHi; g.fillRect(x - w / 2, top, w * 0.1, bot - top);
    g.fillStyle = gold; g.fillRect(x - w / 2 - 2, top, w + 4, 4); g.fillRect(x - w / 2, top + (bot - top) * 0.42, w, 2.5);
    for (let k = 0, wy = top + 16; wy < bot - 34; k++, wy += 32) windowSlit(x - (k % 2 ? 6 : -6) * (w > 60 ? 1 : 0), wy, 7, 13);
    g.strokeStyle = line; g.lineWidth = 1.2; g.strokeRect(x - w / 2, top, w, bot - top);
    // spire roof: slate with gold ribs, underlit eave
    const ry = top - roofH, ew = w / 2 + 7;
    g.fillStyle = '#30213a'; poly(g, [x - ew, top + 2, x, ry, x + ew, top + 2]); g.fill();
    g.fillStyle = '#1d1426'; poly(g, [x, ry, x + ew, top + 2, x + w * 0.1, top + 2]); g.fill();
    g.strokeStyle = rgba(gold, 0.85); g.lineWidth = 1.2;
    for (const f of [-0.55, 0.45]) { polyline(g, [x, ry + 4, x + ew * f, top + 1]); g.stroke(); }
    poly(g, [x - ew, top + 2, x, ry, x + ew, top + 2]); g.strokeStyle = line; g.lineWidth = 1.2; g.stroke();
    strokeLine(g, [x - ew, top + 2.5, x + ew, top + 2.5], 1.6, rgba('#ff9a50', 0.8));
    // finial crown + pennant
    g.fillStyle = gold; poly(g, [x - 5, ry + 1, x - 6, ry - 6, x - 2.5, ry - 3, x, ry - 9, x + 2.5, ry - 3, x + 6, ry - 6, x + 5, ry + 1]); g.fill();
    strokeLine(g, [x, ry - 8, x, ry - 22], 1.2, '#2a1a20');
    g.fillStyle = CR.base; poly(g, [x, ry - 22, x + 16, ry - 19, x + 11, ry - 16.5, x + 15, ry - 14, x, ry - 15]); g.fill();
  };
  // towers (back to front)
  tower(cx - 292, 46, 140, 56); tower(cx + 292, 46, 148, 52);
  tower(cx - 196, 64, 108, 72); tower(cx + 190, 64, 116, 66);
  // the keep
  const kx0 = cx - 84, kx1 = cx + 84, ktop = 96;
  g.fillStyle = wall; g.fillRect(kx0, ktop, kx1 - kx0, 256 - ktop);
  g.fillStyle = wallSh; g.fillRect(cx + 30, ktop, 54, 256 - ktop);
  g.fillStyle = wallHi; g.fillRect(kx0, ktop, 10, 256 - ktop);
  g.strokeStyle = rgba('#120c14', 0.6); g.lineWidth = 1;
  for (let y = ktop + 20; y < 250; y += 18) { polyline(g, [kx0, y, kx1, y]); g.stroke(); }
  g.strokeStyle = line; g.lineWidth = 1.3; g.strokeRect(kx0, ktop, kx1 - kx0, 256 - ktop);
  // great window + balcony
  g.fillStyle = gold; arched(cx - 21, 126, 42, 54); g.fill();
  windowSlit(cx, 130, 34, 46);
  g.strokeStyle = '#1a2a14'; g.lineWidth = 1.4; polyline(g, [cx, 132, cx, 176]); g.stroke(); polyline(g, [cx - 17, 154, cx + 17, 154]); g.stroke();
  g.fillStyle = gold; g.fillRect(cx - 40, 182, 80, 4); g.fillStyle = goldSh; for (let x = cx - 38; x < cx + 40; x += 7) g.fillRect(x, 186, 2.4, 8); g.fillRect(cx - 40, 193, 80, 3);
  // banners on the keep
  for (const bx of [cx - 62, cx + 62]) {
    g.fillStyle = CR.base; poly(g, [bx - 11, 102, bx + 11, 102, bx + 11, 170, bx, 180, bx - 11, 170]); g.fill();
    g.fillStyle = CR.sh; g.fillRect(bx + 4, 102, 7, 70);
    g.fillStyle = gold; g.fillRect(bx - 12, 100, 24, 3);
    crownSigil(g, bx, 136, 16, rgba(KG.glass, 0.95), CR.dk);
  }
  // crown roof: the King's vanity in gold
  g.fillStyle = '#1a1220'; g.beginPath(); g.ellipse(cx, 84, 88, 40, 0, Math.PI, TAU); g.fill();
  const tips = [[-80, 34, 16], [-42, 16, 18], [0, -2, 20], [42, 16, 18], [80, 34, 16]];
  for (const [dx, ty, hw] of tips) {
    g.fillStyle = gold; poly(g, [cx + dx - hw, 74, cx + dx, ty, cx + dx + hw, 74]); g.fill();
    g.fillStyle = goldSh; poly(g, [cx + dx, ty, cx + dx + hw, 74, cx + dx + 3, 74]); g.fill();
    g.fillStyle = goldHi; poly(g, [cx + dx - hw + 4, 72, cx + dx - 1, ty + 8, cx + dx - 4, 72]); g.fill();
    poly(g, [cx + dx - hw, 74, cx + dx, ty, cx + dx + hw, 74]); g.strokeStyle = line; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = win; g.beginPath(); g.arc(cx + dx, ty - 4, 4.5, 0, TAU); g.fill(); g.strokeStyle = line; g.stroke();
    g.fillStyle = '#eaffd0'; g.beginPath(); g.arc(cx + dx - 1.2, ty - 5.4, 1.4, 0, TAU); g.fill();
  }
  g.fillStyle = gold; g.fillRect(cx - 98, 72, 196, 24);
  g.fillStyle = goldSh; g.fillRect(cx + 30, 72, 68, 24); g.fillRect(cx - 98, 90, 196, 6);
  g.fillStyle = goldHi; g.fillRect(cx - 98, 72, 196, 3);
  for (let k = -3; k <= 3; k++) { g.fillStyle = k % 2 ? '#e8384a' : win; g.beginPath(); g.ellipse(cx + k * 26, 83, 5, 6, 0, 0, TAU); g.fill(); }
  g.strokeStyle = line; g.lineWidth = 1.3; g.strokeRect(cx - 98, 72, 196, 24);
  // curtain wall with crown-point merlons and the palace gate
  const wy = 200;
  g.fillStyle = wall; g.fillRect(cx - 336, wy, 672, 60);
  g.fillStyle = wallSh; g.fillRect(cx - 336, wy + 34, 672, 26);
  for (let x = cx - 336; x < cx + 336; x += 22) {
    g.fillStyle = wall; poly(g, [x + 2, wy + 1, x + 11, wy - 12, x + 20, wy + 1]); g.fill();
    g.fillStyle = gold; poly(g, [x + 8, wy - 7, x + 11, wy - 12, x + 14, wy - 7]); g.fill();
  }
  g.fillStyle = gold; g.fillRect(cx - 336, wy, 672, 3);
  for (let x = cx - 310; x < cx + 330; x += 54) if (Math.abs(x - cx) > 50) windowSlit(x, wy + 14, 6, 11);
  g.strokeStyle = line; g.lineWidth = 1.2; g.strokeRect(cx - 336, wy, 672, 60);
  // gate
  g.fillStyle = gold; arched(cx - 32, wy - 2, 64, 62); g.fill();
  g.fillStyle = '#0e0a0e'; arched(cx - 26, wy + 4, 52, 56); g.fill();
  const gg = g.createRadialGradient(cx, wy + 50, 2, cx, wy + 40, 40);
  gg.addColorStop(0, 'rgba(150,255,120,0.5)'); gg.addColorStop(1, 'rgba(60,160,60,0)');
  g.fillStyle = gg; arched(cx - 26, wy + 4, 52, 56); g.fill();
  g.strokeStyle = '#2a2a30'; g.lineWidth = 1.4;
  for (let x = cx - 20; x <= cx + 20; x += 8) { polyline(g, [x, wy + 8, x, wy + 60]); g.stroke(); }
  // underlit by the lava + a little atmospheric haze (only on the palace / rock pixels)
  g.save(); g.globalCompositeOperation = 'source-atop';
  const ul = g.createLinearGradient(0, 150, 0, 262);
  ul.addColorStop(0, 'rgba(255,110,50,0)'); ul.addColorStop(1, 'rgba(255,120,60,0.42)');
  g.fillStyle = ul; g.fillRect(cx - 440, 140, 880, 170);
  g.fillStyle = 'rgba(84,34,62,0.3)'; g.fillRect(cx - 440, -20, 880, 330);
  g.restore();
}
function drawMidLayer(g, xa, xb) {
  for (const s of LAY.spires) if (s.x + s.w > xa - 10 && s.x - s.w < xb + 10) drawSpire(g, s);
  if (xb > PAL_X - 440 && xa < PAL_X + 440) drawPalace(g, PAL_X);
  // sickly smoke from the vents at the spires' feet (soft)
  const gr = g.createLinearGradient(0, 230, 0, 304);
  gr.addColorStop(0, 'rgba(255,120,60,0)'); gr.addColorStop(1, 'rgba(255,130,60,0.28)');
  g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(xa - 4, 220, xb - xa + 8, 90); g.restore();
}

function crustPlate(g, cx, cy, w, h, seed, near) {
  const pts = [];
  const n = 8, sk = (hash2(1, seed) - 0.5) * 0.6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + (hash2(k + 9, seed) - 0.5) * 0.55;
    const r = 0.58 + 0.5 * hash2(k, seed);
    const ux = Math.cos(a) * r, uy = Math.sin(a) * r;
    pts.push(cx + ux * w * 0.5, cy + (uy + ux * sk) * h * 0.5);
  }
  // the hot seam glows round the plate's lower edge
  g.save(); g.translate(0, h * 0.16 + 0.6); blob(g, pts); g.restore();
  g.fillStyle = near ? 'rgba(255,226,140,0.85)' : 'rgba(255,214,130,0.6)'; g.fill();
  blob(g, pts); g.fillStyle = LV.crust; g.fill();
  g.save(); blob(g, pts); g.clip();
  g.fillStyle = LV.crustHi; g.fillRect(cx - w, cy - h, w * 2, h * 0.64);
  g.fillStyle = 'rgba(16,4,8,0.35)'; g.fillRect(cx - w, cy + h * 0.12, w * 2, h);
  if (near && w > 36) {
    g.strokeStyle = 'rgba(255,150,60,0.6)'; g.lineWidth = 1;
    const k = hash2(3, seed);
    polyline(g, [cx - w * 0.3, cy - h * 0.1, cx - w * 0.05 + k * 6, cy + h * 0.12, cx + w * 0.22, cy - h * 0.04]); g.stroke();
  }
  g.restore();
}
function drawLakeFar(g, xa, xb) {
  const xs = Math.floor(xa) - 4, xe = Math.ceil(xb) + 4, top = 256;
  const gr = g.createLinearGradient(0, top, 0, 312);
  gr.addColorStop(0, '#ffe08a'); gr.addColorStop(0.1, '#ffaa44'); gr.addColorStop(0.45, '#f2662a'); gr.addColorStop(1, '#d8461e');
  g.fillStyle = gr; g.fillRect(xs, top, xe - xs, 60);
  // shoreline where the crater wall meets the lava
  g.fillStyle = '#3a1822';
  g.beginPath(); g.moveTo(al(xs, 6) - 6, top - 6);
  for (let x = al(xs, 6) - 6; x <= xe + 6; x += 6) g.lineTo(x, top + 1.5 + 2.5 * hash1(x * 3 + 1));
  g.lineTo(xe + 6, top - 6); g.closePath(); g.fill();
  // crust rows (flat, small near the horizon)
  const rows = [[262, 18, 2.2, 0.55], [268, 24, 3, 0.5], [276, 32, 4.2, 0.48], [287, 42, 5.6, 0.45], [300, 54, 7.4, 0.42]];
  rows.forEach(([yc, cw, ph, keep], r) => {
    for (let i = Math.floor(xs / cw) - 1; i * cw < xe + cw; i++) {
      const h = hash2(i, r + 50);
      if (h > keep) continue;
      crustPlate(g, i * cw + hash2(i, r + 60) * cw * 0.5, yc + (hash2(i, r + 70) - 0.5) * 3, cw * (0.5 + h), ph, i * 31 + r, false);
    }
  });
  g.fillStyle = 'rgba(255,250,210,0.5)';
  for (let x = al(xs, 23); x < xe; x += 23) { const h = hash1(x * 7); if (h < 0.6) continue; g.fillRect(x, 259 + h * 30, 6 + h * 10, 1); }
}
function drawLakeNear(g, xa, xb) {
  const xs = Math.floor(xa) - 4, xe = Math.ceil(xb) + 4, top = 290;
  const gr = g.createLinearGradient(0, top, 0, 366);
  gr.addColorStop(0, '#e2541f'); gr.addColorStop(0.5, '#cc3e1a'); gr.addColorStop(1, '#a42c16');
  g.fillStyle = gr; g.fillRect(xs, top, xe - xs, 80);
  const rows = [[296, 64, 9, 0.5], [309, 80, 12, 0.48], [324, 100, 15, 0.46], [342, 124, 19, 0.44]];
  rows.forEach(([yc, cw, ph, keep], r) => {
    for (let i = Math.floor(xs / cw) - 1; i * cw < xe + cw; i++) {
      const h = hash2(i, r + 80);
      if (h > keep) continue;
      crustPlate(g, i * cw + hash2(i, r + 90) * cw * 0.5, yc + (hash2(i, r + 95) - 0.5) * 4, cw * (0.55 + h), ph, i * 37 + r * 7, true);
    }
  });
  // hot streaks
  g.fillStyle = 'rgba(255,236,170,0.55)';
  for (let x = al(xs, 31); x < xe; x += 31) { const h = hash1(x * 5 + 2); if (h < 0.55) continue; g.beginPath(); g.ellipse(x, 300 + h * 40, 8 + h * 14, 1.2, 0, 0, TAU); g.fill(); }
  // feather the top edge into the far band
  g.save(); g.globalCompositeOperation = 'destination-in';
  const fe = g.createLinearGradient(0, top, 0, top + 14);
  fe.addColorStop(0, 'rgba(0,0,0,0)'); fe.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fe; g.fillRect(xs, top - 2, xe - xs, 80);
  g.restore();
}
// basalt column cluster standing in the lava (sprite, origin = waterline centre)
function drawBasaltIsland(g, cols, seed) {
  const R = mulberry(seed);
  for (const [dx, w, h] of cols) {
    const x = dx, top = -h, tw = w / 2;
    ink(g, (g) => poly(g, [x - tw, 6, x - tw, top + 3, x - tw * 0.5, top - 3, x + tw * 0.5, top - 3, x + tw, top + 3, x + tw, 6]), '#3a2430', 1.8, (g) => {
      g.fillStyle = '#24141c'; g.fillRect(x + tw * 0.15, top - 4, tw, h + 12);
      g.fillStyle = '#5a3c48'; poly(g, [x - tw, top + 3, x - tw * 0.5, top - 3, x + tw * 0.5, top - 3, x + tw, top + 3, x + tw * 0.5, top + 7, x - tw * 0.5, top + 7]); g.fill();
      const ul = g.createLinearGradient(0, -Math.min(30, h), 0, 6);
      ul.addColorStop(0, 'rgba(255,120,50,0)'); ul.addColorStop(1, 'rgba(255,140,60,0.65)');
      g.fillStyle = ul; g.fillRect(x - tw, -h, w, h + 8);
      g.strokeStyle = rgba(LINE, 0.5); g.lineWidth = 1; polyline(g, [x - tw * 0.4, top + 14, x - tw * 0.46, R.r(-h * 0.4, -6)]); g.stroke();
    });
  }
  // hot ring where the stone meets the lava
  const xl = Math.min(...cols.map((c) => c[0] - c[1] / 2)), xr = Math.max(...cols.map((c) => c[0] + c[1] / 2));
  g.fillStyle = 'rgba(255,220,130,0.85)'; g.beginPath(); g.ellipse((xl + xr) / 2, 5, (xr - xl) / 2 + 6, 3, 0, 0, TAU); g.fill();
  g.fillStyle = LV.crust; g.beginPath(); g.ellipse((xl + xr) / 2, 6.5, (xr - xl) / 2 + 1, 2.2, 0, 0, TAU); g.fill();
}

// ---------------------------------------------------------------------------------------------------------------
// INTERIOR DEEP LAYERS
// ---------------------------------------------------------------------------------------------------------------
// inner hall beyond the gates' arches (p 0.55): an arcade over a lava channel, dim banners, distant green lamps
function drawGatesDeep(g, xa, xb) {
  const xs = Math.floor(xa) - 4, xe = Math.ceil(xb) + 4;
  let gr = g.createLinearGradient(0, 0, 0, 366);
  gr.addColorStop(0, '#120c14'); gr.addColorStop(0.45, '#2a1a28'); gr.addColorStop(0.8, '#5e2830'); gr.addColorStop(1, '#a8421e');
  g.fillStyle = gr; g.fillRect(xs, 0, xe - xs, 366);
  // far arcade
  for (let x = al(xs, 150) - 150; x < xe + 150; x += 150) {
    const ax = x + 75;
    g.fillStyle = '#0d080e'; archPath(g, ax, 332, 46, 150); g.fill();
    const ig = g.createLinearGradient(0, 200, 0, 332);
    ig.addColorStop(0, 'rgba(255,110,50,0)'); ig.addColorStop(1, 'rgba(255,120,50,0.4)');
    g.fillStyle = ig; archPath(g, ax, 332, 46, 150); g.fill();
    g.strokeStyle = 'rgba(200,150,70,0.4)'; g.lineWidth = 2; archPath(g, ax, 332, 50, 150); g.stroke();
    g.fillStyle = 'rgba(150,255,120,0.75)'; g.beginPath(); g.arc(ax, 200 + 10 * hash1(x), 2.4, 0, TAU); g.fill();
  }
  // lava channel along the far floor
  g.fillStyle = '#2a1018'; g.fillRect(xs, 326, xe - xs, 10);
  g.fillStyle = '#ffb63e'; g.fillRect(xs, 334, xe - xs, 4);
  gr = g.createLinearGradient(0, 338, 0, 366); gr.addColorStop(0, '#f2702a'); gr.addColorStop(1, '#b83a1a');
  g.fillStyle = gr; g.fillRect(xs, 338, xe - xs, 28);
  g.fillStyle = 'rgba(70,20,24,0.8)';
  for (let x = al(xs, 40) - 40; x < xe + 40; x += 40) { const h = hash1(x * 3 + 9); if (h < 0.4) continue; g.beginPath(); g.ellipse(x + h * 20, 348 + h * 10, 10 + h * 12, 2 + h * 2, 0, 0, TAU); g.fill(); }
  // nearer columns with lava rim light, dim banners between them
  for (let x = al(xs, 220) - 220; x < xe + 220; x += 220) {
    const cx = x + 40;
    g.fillStyle = '#170f17'; g.fillRect(cx - 20, 20, 40, 316);
    g.fillStyle = '#0c070c'; g.fillRect(cx + 6, 20, 14, 316);
    const rl = g.createLinearGradient(0, 120, 0, 336); rl.addColorStop(0, 'rgba(255,110,50,0)'); rl.addColorStop(1, 'rgba(255,130,60,0.75)');
    g.fillStyle = rl; g.fillRect(cx - 20, 120, 3, 216); g.fillRect(cx + 17, 120, 3, 216);
    g.fillStyle = '#5a4026'; g.fillRect(cx - 26, 52, 52, 8); g.fillRect(cx - 26, 318, 52, 8);
    const bx = x + 150;
    g.fillStyle = '#4e1a24'; poly(g, [bx - 18, 62, bx + 18, 62, bx + 18, 160, bx, 176, bx - 18, 160]); g.fill();
    g.fillStyle = '#381018'; g.fillRect(bx + 6, 62, 12, 104);
    g.fillStyle = 'rgba(200,150,70,0.6)'; g.fillRect(bx - 20, 58, 40, 4);
    crownSigil(g, bx, 112, 24, 'rgba(124,201,92,0.55)', '#2a0c14');
  }
  // vault ribs
  g.strokeStyle = 'rgba(10,6,10,0.85)'; g.lineWidth = 10;
  for (let x = al(xs, 220) - 220; x < xe + 220; x += 220) { g.beginPath(); g.moveTo(x + 40, 40); g.quadraticCurveTo(x + 150, -20, x + 260, 40); g.stroke(); }
  gr = g.createLinearGradient(0, 0, 0, 70); gr.addColorStop(0, 'rgba(8,4,8,0.9)'); gr.addColorStop(1, 'rgba(8,4,8,0)');
  g.fillStyle = gr; g.fillRect(xs, 0, xe - xs, 70);
}

// the treasure vault (p 0.6): stained glass, chandeliers, mountains of gold
function drawLancetWindow(g, cx, warm) {
  const top = 22, by = 198, hw = 44, spring = 74;
  const pal = warm ? { field: '#5a2a10', a: '#e0a040', b: '#ffd060', c: '#c84a2a', d: '#f5e0a0', sig: '#ffe39a', glow: 'rgba(255,190,90,0.22)' }
    : { field: '#12301f', a: '#2a7a5e', b: '#4aa45a', c: '#b8923c', d: '#8a2c3a', sig: '#8fdc6c', glow: 'rgba(130,240,120,0.13)' };
  // halo on the wall
  g.fillStyle = pal.glow; g.beginPath(); g.ellipse(cx, 112, 66, 104, 0, 0, TAU); g.fill();
  // stone/gold frame
  g.fillStyle = '#7a5a30'; lancetPath(g, cx, by + 6, hw + 9, spring, top - 12); g.fill();
  g.fillStyle = '#b48a46'; lancetPath(g, cx, by + 6, hw + 5, spring, top - 7); g.fill();
  // glass
  g.save(); lancetPath(g, cx, by, hw, spring, top); g.clip();
  g.fillStyle = pal.field; g.fillRect(cx - hw, top, hw * 2, by - top);
  const R = mulberry(cx | 0);
  for (let y = top; y < by; y += 14) {
    for (let x = cx - hw - 10; x < cx + hw; x += 14) {
      const k = R();
      g.fillStyle = k < 0.35 ? pal.a : k < 0.6 ? pal.b : k < 0.8 ? pal.c : pal.d;
      g.globalAlpha = 0.85;
      poly(g, [x + R.r(0, 3), y + R.r(0, 3), x + 14 + R.r(-2, 2), y + R.r(0, 3), x + 14 + R.r(-2, 2), y + 14 + R.r(-2, 1), x + R.r(0, 3), y + 14]); g.fill();
    }
  }
  g.globalAlpha = 1;
  // leading
  g.strokeStyle = '#120a10'; g.lineWidth = 1.6;
  for (let y = top + 14; y < by; y += 14) { polyline(g, [cx - hw, y + Math.sin(y) * 1.5, cx + hw, y - Math.sin(y) * 1.5]); g.stroke(); }
  for (let x = cx - hw + 14; x < cx + hw; x += 14) { polyline(g, [x, top, x + 1.5, by]); g.stroke(); }
  // sigil medallion
  g.fillStyle = '#100a0e'; g.beginPath(); g.arc(cx, 108, 30, 0, TAU); g.fill();
  g.fillStyle = warm ? '#6a3010' : '#1a3020'; g.beginPath(); g.arc(cx, 108, 27, 0, TAU); g.fill();
  crownSigil(g, cx + 2, 116, 40, pal.sig, '#100a0e');
  g.strokeStyle = '#b48a46'; g.lineWidth = 2.4; g.beginPath(); g.arc(cx, 108, 29, 0, TAU); g.stroke();
  g.restore();
  // mullion + tracery roundel
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 3.4;
  polyline(g, [cx, 140, cx, by]); g.stroke();
  g.beginPath(); g.arc(cx, 48, 11, 0, TAU); g.stroke();
  g.strokeStyle = '#3a2416'; g.lineWidth = 1.2; lancetPath(g, cx, by, hw, spring, top); g.stroke();
}
function drawChandelierFar(g, cx, cy) {
  g.strokeStyle = '#3a2416'; g.lineWidth = 2; polyline(g, [cx, 0, cx, cy - 18]); g.stroke();
  g.strokeStyle = '#8a6a30'; g.lineWidth = 2.4;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx, cy - 14); g.quadraticCurveTo(cx + s * 30, cy - 10, cx + s * 34, cy - 4); g.stroke(); }
  g.fillStyle = '#c99a42'; g.beginPath(); g.ellipse(cx, cy, 36, 6, 0, 0, TAU); g.fill();
  g.fillStyle = '#8a6426'; g.beginPath(); g.ellipse(cx, cy + 2, 36, 4, 0, 0, Math.PI); g.fill();
  g.strokeStyle = '#3a2416'; g.lineWidth = 1; g.beginPath(); g.ellipse(cx, cy, 36, 6, 0, 0, TAU); g.stroke();
  for (let k = -3; k <= 3; k++) {
    const x = cx + k * 10.5, y = cy - 3 + Math.abs(k) * 0.6;
    g.fillStyle = '#f2e6c8'; g.fillRect(x - 1.6, y - 9, 3.2, 9);
    g.fillStyle = 'rgba(150,255,120,0.35)'; g.beginPath(); g.arc(x, y - 12, 5, 0, TAU); g.fill();
    g.fillStyle = KG.glass; g.beginPath(); g.ellipse(x, y - 12, 1.6, 2.8, 0, 0, TAU); g.fill();
  }
  g.fillStyle = 'rgba(220,240,255,0.8)';
  for (let k = -2; k <= 2; k++) { g.beginPath(); g.ellipse(cx + k * 13, cy + 9 + (k % 2 ? 0 : 3), 1.6, 3, 0, 0, TAU); g.fill(); }
  g.fillStyle = '#c99a42'; poly(g, [cx - 6, cy - 14, cx - 7, cy - 22, cx - 3, cy - 18, cx, cy - 25, cx + 3, cy - 18, cx + 7, cy - 22, cx + 6, cy - 14]); g.fill();
}
// a mound of gold coins with gems and loot
function drawMound(g, m) {
  const R = mulberry(m.seed);
  const base = 372, hw = m.w / 2;
  const top = (x) => {
    const u = (x - m.x) / hw;
    if (Math.abs(u) >= 1) return base;
    return base - (base - m.top) * Math.pow(Math.cos(u * Math.PI / 2), 1.25) + 3 * Math.sin(x * 0.11 + m.seed);
  };
  g.beginPath(); g.moveTo(m.x - hw, base);
  for (let x = m.x - hw; x <= m.x + hw; x += 5) g.lineTo(x, top(x) - 1.6 * Math.abs(Math.sin(x * 0.63)));
  g.lineTo(m.x + hw, base); g.closePath();
  const gr = g.createLinearGradient(0, m.top, 0, base);
  gr.addColorStop(0, '#ffe28a'); gr.addColorStop(0.35, '#eab64c'); gr.addColorStop(1, '#a8742a');
  g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  g.fillStyle = 'rgba(140,80,30,0.32)'; poly(g, [m.x + hw * 0.05, m.top - 10, m.x + hw + 10, m.top, m.x + hw + 10, base, m.x + hw * 0.25, base]); g.fill();
  // coin texture
  for (let k = 0; k < m.w * 0.9; k++) {
    const x = m.x + R.r(-hw, hw), ty = top(x);
    const y = ty + R.r(0, 1) ** 1.6 * (base - ty);
    const s = R.r(2.2, 3.6);
    g.fillStyle = R() < 0.5 ? '#c08a34' : '#d8a444'; g.beginPath(); g.ellipse(x + 0.6, y + 0.8, s, s * 0.45, 0, 0, TAU); g.fill();
    g.fillStyle = R() < 0.7 ? '#ffd870' : '#fff0b0'; g.beginPath(); g.ellipse(x, y, s, s * 0.45, 0, 0, TAU); g.fill();
  }
  // gems
  for (let k = 0; k < m.w / 26; k++) {
    const x = m.x + R.r(-hw * 0.8, hw * 0.8), y = top(x) + R.r(4, 40);
    const c = R.pick(['#e8384a', '#3a8aff', '#62e05a', '#b45aff']);
    g.fillStyle = c; poly(g, [x, y - 4, x + 3.5, y, x, y + 3, x - 3.5, y]); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x - 1.5, y - 2, 1.5, 1.5);
  }
  // loot sticking out near the crest
  const loot = R.i(1, 3);
  for (let k = 0; k < loot; k++) {
    const x = m.x + R.r(-hw * 0.45, hw * 0.45), y = top(x) + 6, kind = R.i(0, 3);
    g.strokeStyle = '#5a3a14'; g.lineWidth = 1;
    if (kind === 0) { // goblet
      g.fillStyle = '#f2c860'; poly(g, [x - 6, y - 16, x + 6, y - 16, x + 3, y - 8, x + 1, y - 7, x + 1, y - 2, x + 4, y, x - 4, y, x - 1, y - 2, x - 1, y - 7, x - 3, y - 8]); g.fill(); g.stroke();
      g.fillStyle = '#e8384a'; g.fillRect(x - 1.2, y - 13, 2.4, 2.4);
    } else if (kind === 1) { // sword hilt
      g.fillStyle = '#c8ccd8'; poly(g, [x - 1.5, y, x - 1.5, y - 8, x + 1.5, y - 8, x + 1.5, y]); g.fill();
      g.fillStyle = '#e0ad48'; g.fillRect(x - 7, y - 10, 14, 3); g.fillRect(x - 1.5, y - 20, 3, 10);
      g.fillStyle = '#3a8aff'; g.beginPath(); g.arc(x, y - 21, 2.4, 0, TAU); g.fill();
    } else if (kind === 2) { // shield
      g.fillStyle = '#a3283a'; g.beginPath(); g.ellipse(x, y - 8, 9, 10, 0.2, 0, TAU); g.fill();
      g.strokeStyle = '#e0ad48'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#e0ad48'; g.beginPath(); g.arc(x, y - 8, 2.5, 0, TAU); g.fill();
    } else { // little crown
      g.fillStyle = '#ffd25a'; poly(g, [x - 8, y, x - 9, y - 9, x - 4, y - 5, x, y - 11, x + 4, y - 5, x + 9, y - 9, x + 8, y]); g.fill(); g.stroke();
      g.fillStyle = '#62e05a'; g.beginPath(); g.arc(x, y - 3, 1.8, 0, TAU); g.fill();
    }
  }
  // sparkle stars baked
  g.fillStyle = 'rgba(255,255,240,0.95)';
  for (let k = 0; k < m.w / 110; k++) {
    const x = m.x + R.r(-hw * 0.7, hw * 0.7), y = top(x) + R.r(3, 24), s = R.r(2, 3.2);
    poly(g, [x, y - s * 2, x + s * 0.4, y - s * 0.4, x + s * 2, y, x + s * 0.4, y + s * 0.4, x, y + s * 2, x - s * 0.4, y + s * 0.4, x - s * 2, y, x - s * 0.4, y - s * 0.4]); g.fill();
  }
  g.restore();
}
const VAULT_WIN0 = 1990, VAULT_WIN_ST = 300;   // lancet windows in the vault layer
function drawHallsDeep(g, xa, xb) {
  const xs = Math.floor(xa) - 4, xe = Math.ceil(xb) + 4;
  let gr = g.createLinearGradient(0, 0, 0, 366);
  gr.addColorStop(0, '#24121a'); gr.addColorStop(0.5, '#43222a'); gr.addColorStop(1, '#8a5430');
  g.fillStyle = gr; g.fillRect(xs, 0, xe - xs, 366);
  // pilasters
  for (let x = al(xs - VAULT_WIN0, VAULT_WIN_ST) + VAULT_WIN0 - VAULT_WIN_ST * 1.5; x < xe + VAULT_WIN_ST; x += VAULT_WIN_ST) {
    g.fillStyle = '#1c0e14'; g.fillRect(x - 16, 0, 32, 366);
    g.fillStyle = '#2e1820'; g.fillRect(x - 16, 0, 8, 366);
    g.fillStyle = '#9a7238'; g.fillRect(x - 20, 44, 40, 6); g.fillRect(x - 20, 250, 40, 5);
  }
  // windows
  for (let x = al(xs - VAULT_WIN0, VAULT_WIN_ST) + VAULT_WIN0 - VAULT_WIN_ST; x < xe + VAULT_WIN_ST; x += VAULT_WIN_ST) drawLancetWindow(g, x, false);
  // chandeliers between windows
  for (let x = al(xs - VAULT_WIN0, VAULT_WIN_ST) + VAULT_WIN0 - VAULT_WIN_ST * 1.5; x < xe + VAULT_WIN_ST; x += VAULT_WIN_ST) drawChandelierFar(g, x, 150 + 16 * hash1(x | 0));
  // warm bounce light from the gold below
  gr = g.createLinearGradient(0, 150, 0, 366); gr.addColorStop(0, 'rgba(255,190,90,0)'); gr.addColorStop(1, 'rgba(255,190,90,0.35)');
  g.fillStyle = gr; g.fillRect(xs, 150, xe - xs, 220);
  // mounds: back ones hazier, front ones bright
  for (const m of LAY.mounds) {
    if (m.x + m.w / 2 < xa - 10 || m.x - m.w / 2 > xb + 10) continue;
    if (!m.back) continue;
    drawMound(g, m);
  }
  gr = g.createLinearGradient(0, 200, 0, 366); gr.addColorStop(0, 'rgba(90,40,30,0.35)'); gr.addColorStop(1, 'rgba(90,40,30,0.1)');
  g.fillStyle = gr; g.fillRect(xs, 200, xe - xs, 170);
  for (const m of LAY.mounds) {
    if (m.x + m.w / 2 < xa - 10 || m.x - m.w / 2 > xb + 10) continue;
    if (m.back) continue;
    drawMound(g, m);
  }
  g.fillStyle = 'rgba(60,24,26,0.16)'; g.fillRect(xs, 0, xe - xs, 366);
}

// the lava cavern behind the throne room grilles (p 0.5)
const caveTop = (x) => 40 + 26 * Math.sin(x * 0.013 + 1) + 14 * Math.sin(x * 0.037) + vnoise(x, 17, 41) * 12;
function drawThroneDeep(g, xa, xb) {
  const xs = al(Math.floor(xa), 4) - 8, xe = Math.ceil(xb) + 8;
  let gr = g.createLinearGradient(0, 0, 0, 366);
  gr.addColorStop(0, '#14080e'); gr.addColorStop(0.45, '#2c1218'); gr.addColorStop(1, '#6a2418');
  g.fillStyle = gr; g.fillRect(xs, 0, xe - xs, 366);
  facets(g, xs, xe, caveTop, { sh: 'rgba(10,2,6,0.45)', hi: 'rgba(110,44,50,0.28)', crev: 'rgba(10,2,6,0.5)', crevW: 1.3 }, 51, 58, 372);
  // gold-rimmed carved arches in the rock
  for (let x = al(xs, 340) - 340; x < xe + 340; x += 340) {
    const ax = x + 120;
    g.fillStyle = 'rgba(10,4,8,0.7)'; archPath(g, ax, 330, 58, 170); g.fill();
    g.strokeStyle = 'rgba(210,150,70,0.5)'; g.lineWidth = 4; archPath(g, ax, 330, 62, 170); g.stroke();
  }
  // lavafalls (baked ribbons; live streaks scroll on top) from carved dragon spouts
  for (const f of LAY.tFalls) {
    if (f.x + f.w * 2 < xa || f.x - f.w * 2 > xb) continue;
    const y0 = f.y0, y1 = 342;
    gr = g.createRadialGradient(f.x, (y0 + y1) / 2, 4, f.x, (y0 + y1) / 2, 150);
    gr.addColorStop(0, 'rgba(255,120,40,0.35)'); gr.addColorStop(1, 'rgba(255,90,30,0)');
    g.fillStyle = gr; g.fillRect(f.x - 150, y0 - 60, 300, y1 - y0 + 90);
    g.fillStyle = '#d8461e'; poly(g, [f.x - f.w / 2, y0, f.x + f.w / 2, y0, f.x + f.w * 0.62, y1, f.x - f.w * 0.62, y1]); g.fill();
    g.fillStyle = '#ff8a2a'; poly(g, [f.x - f.w * 0.3, y0, f.x + f.w * 0.25, y0, f.x + f.w * 0.36, y1, f.x - f.w * 0.4, y1]); g.fill();
    g.fillStyle = '#ffd070'; poly(g, [f.x - f.w * 0.08, y0, f.x + f.w * 0.06, y0, f.x + f.w * 0.1, y1, f.x - f.w * 0.14, y1]); g.fill();
    if (f.head) { // carved dragon spout
      const R = mulberry(f.seed);
      const hx = f.x, hy = y0 - 4, s = f.w / 40 + 0.5;
      g.save(); g.translate(hx, hy); g.scale(s, s);
      g.fillStyle = '#3a2228'; poly(g, [-26, -40, 26, -40, 32, -18, 18, 2, -18, 2, -32, -18]); g.fill();
      g.fillStyle = '#24141a'; poly(g, [6, -40, 26, -40, 32, -18, 18, 2, 6, 2]); g.fill();
      g.fillStyle = '#b48a46'; poly(g, [-22, -38, -36, -62, -14, -42]); g.fill(); poly(g, [22, -38, 36, -62, 14, -42]); g.fill();
      g.fillStyle = '#ffb040'; g.fillRect(-14, -26, 7, 3); g.fillRect(7, -26, 7, 3);
      g.fillStyle = '#100608'; g.beginPath(); g.ellipse(0, -4, 14, 7, 0, 0, TAU); g.fill();
      g.fillStyle = '#ff8a2a'; g.beginPath(); g.ellipse(0, -2, 10, 4, 0, 0, TAU); g.fill();
      void R;
      g.restore();
    }
  }
  // lava pool along the bottom
  g.fillStyle = '#2a0e12'; g.fillRect(xs, 330, xe - xs, 8);
  gr = g.createLinearGradient(0, 336, 0, 366); gr.addColorStop(0, '#ffc050'); gr.addColorStop(0.3, '#f2702a'); gr.addColorStop(1, '#b8341a');
  g.fillStyle = gr; g.fillRect(xs, 336, xe - xs, 30);
  for (let x = al(xs, 46) - 46; x < xe + 46; x += 46) { const h = hash1(x * 5 + 3); if (h < 0.4) continue; crustPlate(g, x + h * 20, 352 + h * 8, 30 + h * 30, 5 + h * 4, x | 0, true); }
  gr = g.createLinearGradient(0, 0, 0, 90); gr.addColorStop(0, 'rgba(6,2,4,0.9)'); gr.addColorStop(1, 'rgba(6,2,4,0)');
  g.fillStyle = gr; g.fillRect(xs, 0, xe - xs, 90);
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let S = 0;                // device px per logical px
  let C = null;             // caches
  let warm = 0;             // 0 = cursed (venom-green crown-fire), 1 = curse lifted (gold fire, brighter palace)
  let fireCache = null, fireCacheW = -1, fireCacheC = null;
  function fire() {
    if (fireCacheW === warm && fireCacheC === C) return fireCache;
    fireCacheW = warm; fireCacheC = C;
    fireCache = warm <= 0 ? { pal: FIRE, glows: [[C.glow, 1]] } : {
      pal: { outer: mix(FIRE.outer, FIRE_WARM.outer, warm), mid: mix(FIRE.mid, FIRE_WARM.mid, warm), core: mix(FIRE.core, FIRE_WARM.core, warm) },
      glows: warm >= 1 ? [[C.glowWarm, 1]] : [[C.glow, 1 - warm], [C.glowWarm, warm]],
    };
    return fireCache;
  }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  const snap = (v) => Math.round(v * S) / S;

  let released = false;   // (released: kept so -- a resize only notes the scale -- until it's drawn on screen again)
  function setScale(s) {
    s = clamp(+s || 1, 0.5, 4);
    if (released) { S = s; return; }
    if (C && Math.abs(s - S) < 0.001) return;
    const prev = C;
    S = s;
    const cs = Math.min(STAGE_CS.near, Math.round(s * 4) / 4);       // (STAGE_CS: lower on iOS -- src/canvasmem.js)
    const csFar = Math.min(STAGE_CS.far, Math.round(s * 4) / 4);
    if (prev && prev.cs === cs && prev.csFar === csFar) { freeCanvases(prev.items); prev.items = buildItems(s); return; }
    if (prev) freeCanvases(prev);            // (the old scale's caches go now: iOS counts them until they shrink)
    C = build(cs, csFar);
    C.items = buildItems(s);
  }

  // ------------------------------------------------------------------ build all caches
  function build(cs, csFar) {
    const t0 = performance.now();
    const c = { cs, csFar };
    // caldera
    c.sky = makeSprite(W, 372, 0, 0, 0.5, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 372);
      gr.addColorStop(0, '#1a0f1e'); gr.addColorStop(0.3, '#33182c'); gr.addColorStop(0.55, '#5e2432'); gr.addColorStop(0.72, '#9c3a2e');
      gr.addColorStop(0.84, '#de6a2c'); gr.addColorStop(1, '#ffb04a');
      g.fillStyle = gr; g.fillRect(0, 0, W, 372);
    });
    c.smoke = LAY.smoke.map((sm) => ({ sm, spr: smokeSprite(sm, Math.min(0.75, csFar)) }));
    const calR = PYL1 + 40;
    c.far = buildStrip(-8, Math.ceil(calR * P_FAR + W) + 8, 80, 306, csFar, P_FAR, drawFarRim);
    c.mid = buildStrip(-8, Math.ceil(calR * P_MID + W) + 8, -26, 306, csFar, P_MID, drawMidLayer);
    c.lakeFar = buildStrip(-8, Math.ceil(PYL1 * P_LAKEF + W * (1 - P_LAKEF)) + 12, 250, 312, cs, P_LAKEF, drawLakeFar);
    c.lakeNear = buildStrip(-8, Math.ceil(PYL1 * P_LAKEN + W * (1 - P_LAKEN)) + 12, 288, 340, cs, P_LAKEN, drawLakeNear);
    lineStyle(LINE_CAL, 0.55);
    c.islands = [
      { lx: 300, y: 300, spr: makeSprite(150, 110, 75, 95, cs, (g) => drawBasaltIsland(g, [[-30, 22, 38], [-8, 26, 62], [16, 22, 46], [34, 18, 26]], 3)) },
      { lx: 1010, y: 312, spr: makeSprite(170, 120, 85, 105, cs, (g) => drawBasaltIsland(g, [[-44, 20, 30], [-22, 26, 52], [4, 30, 78], [30, 24, 56], [52, 18, 30]], 4)) },
      { lx: 640, y: 318, spr: makeSprite(220, 140, 110, 120, cs, (g) => drawSunkenCrown(g)) },
      { lx: 1420, y: 298, spr: makeSprite(120, 90, 60, 80, cs, (g) => drawBasaltIsland(g, [[-14, 22, 34], [8, 24, 50], [28, 16, 22]], 5)) },
    ];
    // interiors
    c.gDeep = buildStrip(Math.floor(PYL1 * P_GDEEP) - 10, Math.ceil(PYL2 * P_GDEEP + W * (1 - P_GDEEP)) + 10, 0, 366, csFar, P_GDEEP, drawGatesDeep);
    c.hDeep = buildStrip(Math.floor(PYL2 * P_HDEEP) - 10, Math.ceil(PYL3 * P_HDEEP + W * (1 - P_HDEEP)) + 10, 0, 366, csFar, P_HDEEP, drawHallsDeep);
    c.tDeep = buildStrip(Math.floor(PYL3 * P_TDEEP) - 10, Math.ceil(CAM_MAX * P_TDEEP + W) + 10, 0, 366, csFar, P_TDEEP, drawThroneDeep);
    c.winWarm = makeSprite(140, 222, 70, 0, csFar, (g) => drawLancetWindow(g, 0, true));
    // glows, shafts, particles
    c.glow = radialSprite(64, 1, [[0, 'rgba(140,255,120,0.55)'], [0.35, 'rgba(110,235,100,0.22)'], [1, 'rgba(80,200,90,0)']]);
    c.glowWarm = radialSprite(64, 1, [[0, 'rgba(255,200,110,0.6)'], [0.35, 'rgba(255,150,60,0.25)'], [1, 'rgba(255,120,40,0)']]);
    c.lavaGlow = radialSprite(64, 0.75, [[0, 'rgba(255,170,70,0.7)'], [0.4, 'rgba(255,110,40,0.3)'], [1, 'rgba(255,80,30,0)']]);
    c.ember = radialSprite(8, Math.max(1, cs), [[0, 'rgba(255,240,170,1)'], [0.25, 'rgba(255,170,70,0.85)'], [1, 'rgba(255,90,30,0)']]);
    c.ash = [0.9, 1.3, 1.9].map((r) => radialSprite(r * 2, Math.max(1, cs), [[0, 'rgba(112,98,108,0.95)'], [0.55, 'rgba(96,84,94,0.7)'], [1, 'rgba(80,70,80,0)']]));
    c.shaft = [false, true].map((wm) => makeSprite(260, 520, 130, 0, 0.5, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 520);
      const col = wm ? [255, 214, 140] : [150, 255, 140];
      gr.addColorStop(0, `rgba(${col},0.0)`); gr.addColorStop(0.12, `rgba(${col},0.55)`); gr.addColorStop(0.75, `rgba(${col},0.3)`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; poly(g, [-26, 0, 26, 0, 130, 520, -70, 520]); g.fill();
      const g2 = g.createLinearGradient(-60, 0, 80, 0);
      g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.55; g.fillStyle = g2; g.fillRect(-130, 0, 260, 520);
    }));
    // the throne room's wall-base light (L4FIX 'light'), drawn 'screen' over the backdrop only (never over the fighters):
    // the base band (brightest at the wall-floor line y 362, ember -> deep red as it rises, gone by y ~212) and one pool
    // of light per source (ember / venom green), all built at full strength
    const band = (g, x0, w, col0, col1, a0, a1) => {
      const gr = g.createLinearGradient(0, 212, 0, 394);
      const c = (col, a) => `rgba(${col[0]},${col[1]},${col[2]},${a})`;
      gr.addColorStop(0, c(col1, 0)); gr.addColorStop(0.38, c(col1, a1 * 0.55)); gr.addColorStop(0.66, c(col1, a1));
      gr.addColorStop(0.76, c(col0, a0)); gr.addColorStop(0.8, c(col0, a0 * 0.9)); gr.addColorStop(0.84, c(col0, a0 * L4P.floor));
      gr.addColorStop(0.92, c(col0, a0 * L4P.floor * 0.4)); gr.addColorStop(1, c(col0, 0));   // (y 350 peak; a little floor spill)
      g.fillStyle = gr; g.fillRect(x0, 212, w, 182);
    };
    c.backLight = makeSprite(W, H, 0, 0, 0.5, (g) => band(g, 0, W, EMBER, EMBER_RED, 0.62, 0.42));
    const poolSprite = (col0, col1, a0, a1) => makeSprite(460, 182, 0, 0, 0.5, (g) => {
      g.translate(0, -212);
      band(g, 0, 460, col0, col1, a0, a1);
      const fade = g.createLinearGradient(0, 0, 460, 0);    // (horizontal falloff: a pool, not a band)
      fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.5, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 212, 460, 182);
    });
    c.poolEmber = poolSprite(EMBER, EMBER_RED, 0.62, 0.42);
    // the curse's glow at the dais statues' feet: venom green, drawn last and additive so it stays green over the red
    // wall (screened onto the ember base it mixed to khaki -- critics r2); the ember base is mostly cut away under it
    c.venomGlow = radialSprite(80, 0.5, [[0, `rgba(${VENOM},0.85)`], [0.45, `rgba(${VENOM},0.4)`], [1, `rgba(${VENOM},0)`]]);
    c.holeGlow = radialSprite(80, 0.5, [[0, 'rgba(0,0,0,0.7)'], [0.6, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]);
    // ... at its drawn size, with the statue plinth (its centre, y 282..328) mostly cut out of it: the plinth stays black
    // stone under its own fire (critics r2: the lit plinths read lifted / teal); feathered over ~4 px, its top 3 px left
    // lit: a faint green edge on the plinth's top, so a dark head over it keeps an outline (critics r3)
    const glowCut = (R) => {                                   // (per room: its glow's size, its plinths' rect)
      const { rx, cy, h } = R.glow, P = R.plinth, top = P.y - (cy - h / 2) + 3;
      return makeSprite(rx * 2, h, 0, 0, 0.5, (g) => {
        g.drawImage(c.venomGlow.c, 0, 0, rx * 2, h);
        g.globalCompositeOperation = 'destination-out';
        const cut = 1 - L4P.glowPlinth;
        for (let i = 4; i >= 0; i--) {
          g.fillStyle = `rgba(0,0,0,${cut / 5})`;
          g.fillRect(rx - P.hw + i, top + i, P.hw * 2 - 2 * i, P.h - 3 - 2 * i);
        }
      });
    };
    c.venomGlowCut = glowCut(ROOM_THR);
    c.venomGlowCutG = glowCut(ROOM_GAT);
    c.bandStrip = layerCanvas(W, 182, cs * 0.5)?.c || null;   // (the base band, cut per frame -- down the ladder past the memory cap; null: none at all)
    c.calEdge = makeSprite(W, H, 0, 0, 0.25, (g) => {        // (the causeway's lava-lit back edge, y 326-368)
      const gr = g.createLinearGradient(0, 326, 0, 368);
      gr.addColorStop(0, 'rgba(255,150,90,0)'); gr.addColorStop(0.35, 'rgba(255,150,90,0.12)');
      gr.addColorStop(0.75, 'rgba(255,150,90,0.15)'); gr.addColorStop(1, 'rgba(255,150,90,0)');
      g.fillStyle = gr; g.fillRect(0, 326, W, 42);
    });
    // the throne room's vignette (L4FIX 'vig'): centred low (61 % down) and stretched sideways -- the top corners as dark
    // as the shared one, the sides at fighter height about half as dark
    c.vignetteThr = makeSprite(W, H, 0, 0, 0.25, (g) => {
      g.translate(W / 2, H * 0.61); g.scale(1.45, 1);
      const gr = g.createRadialGradient(0, 0, 230, 0, 0, 520);
      gr.addColorStop(0, 'rgba(26,10,18,0)'); gr.addColorStop(1, 'rgba(26,10,18,0.9)');
      g.fillStyle = gr; g.fillRect(-W, -H, W * 2, H * 2);
    });
    c.vignette = makeSprite(W, H, 0, 0, 0.25, (g) => {
      const gr = g.createRadialGradient(W / 2, H * 0.5, H * 0.32, W / 2, H * 0.5, W * 0.62);
      gr.addColorStop(0, 'rgba(14,4,8,0)'); gr.addColorStop(1, 'rgba(14,4,8,0.9)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    });
    c.lavaTex = makeSprite(24, 96, 0, 0, cs, (g) => {
      const R = mulberry(12);
      for (let i = 0; i < 18; i++) {
        const x = R.r(0, 24), y = R.r(0, 96), l = R.r(8, 26);
        g.strokeStyle = R() < 0.5 ? 'rgba(255,236,160,0.9)' : 'rgba(255,160,60,0.85)';
        g.lineWidth = R.r(1, 2.6);
        for (const dy of [-96, 0, 96]) { polyline(g, [x, y + dy, x + R.r(-1, 1), y + dy + l]); g.stroke(); }
      }
    });
    // near layer + ground
    c.near = buildNear(cs);
    c.ground = buildStrip(0, LEVEL_LEN, GT0, H, cs, 1, drawGround);
    c.front = buildFront(cs);
    c.buildMs = performance.now() - t0;
    return c;
  }

  // underlit volcanic smoke bank
  function smokeSprite(c, sc) {
    const pad = 16;
    return makeSprite(c.w + pad * 2, c.h * 1.5 + pad * 2, c.w / 2 + pad, c.h + pad, sc, (g) => {
      const R = mulberry(c.seed);
      const n = c.w > 380 ? 9 : 7;
      const blobs = [];
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1), dome = Math.sin(Math.PI * (0.1 + f * 0.8));
        const r = c.h * (0.24 + 0.34 * dome) * R.r(0.8, 1.15);
        blobs.push([lerp(-c.w / 2 + r, c.w / 2 - r, f) + R.r(-8, 8), -c.h * 0.16 - r * R.r(0.4, 0.8) - dome * c.h * 0.1, r]);
      }
      const shape = (dx, dy, k) => {
        g.beginPath();
        for (const [x, y, r] of blobs) { g.moveTo(x + dx + r * k, y + dy); g.arc(x + dx, y + dy, r * k, 0, TAU); }
        g.moveTo(dx + c.w * 0.42 * k, -c.h * 0.12 + dy); g.ellipse(dx, -c.h * 0.12 + dy, c.w * 0.42 * k, c.h * 0.2 * k, 0, 0, TAU);
      };
      shape(0, 0, 1); g.fillStyle = '#8a3c34'; g.fill();
      g.save(); g.globalCompositeOperation = 'source-atop';
      shape(1, -c.h * 0.14, 1); g.fillStyle = '#3a2232'; g.fill();
      g.beginPath();
      for (const [x, y, r] of blobs) { g.moveTo(x - r * 0.1 + r * 0.7, y - r * 0.3); g.arc(x - r * 0.1, y - r * 0.3, r * 0.7, 0, TAU); }
      g.fillStyle = '#2a1828'; g.fill();
      g.strokeStyle = 'rgba(255,150,80,0.75)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(0, -c.h * 0.12, c.w * 0.42 - 1.5, c.h * 0.2 - 1.5, 0, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
      g.restore();
    });
  }

  // a colossal gold crown, toppled and half sunk in the lava (the King's vanity, lost)
  function drawSunkenCrown(g) {
    lineStyle(LINE_CAL, 0.6);
    const M = { base: '#c49038', sh: '#86601e', hi: '#f0cc78', dk: '#4e3410' };
    g.save(); g.translate(4, 20); g.rotate(-0.24);
    const tips = [[-46, 50], [-22, 62], [2, 76], [26, 60]];
    for (const [x, ht] of tips) {
      ink(g, (g) => poly(g, [x - 13, -22, x, -22 - ht, x + 13, -22]), M.base, 2.4, (g) => {
        g.fillStyle = M.sh; poly(g, [x, -22 - ht, x + 14, -22, x + 2, -22]); g.fill();
        g.fillStyle = rgba(M.hi, 0.8); poly(g, [x - 9, -24, x - 1, -18 - ht, x - 4, -24]); g.fill();
      });
      ink(g, (g) => { g.beginPath(); g.arc(x, -26 - ht, 6.5, 0, TAU); }, '#6fb85a', 2, (g) => { g.fillStyle = '#3e7a34'; g.beginPath(); g.arc(x + 2, -24 - ht, 6, 0, TAU); g.fill(); g.fillStyle = '#d8ffc0'; g.fillRect(x - 3, -30 - ht, 2.4, 2.4); });
    }
    // the broken fifth point
    ink(g, (g) => poly(g, [38, -22, 44, -40, 48, -32, 52, -44, 62, -22]), M.base, 2.4, (g) => { g.fillStyle = M.sh; g.fillRect(48, -50, 20, 30); });
    const band = (g) => { g.beginPath(); g.moveTo(-64, 2); g.lineTo(-60, -24); g.quadraticCurveTo(0, -30, 64, -24); g.lineTo(68, 2); g.quadraticCurveTo(0, -4, -64, 2); g.closePath(); };
    ink(g, band, M.base, 2.8, (g) => {
      g.fillStyle = M.sh; g.fillRect(28, -40, 50, 50);
      g.fillStyle = M.hi; g.fillRect(-62, -24, 80, 3);
      g.strokeStyle = M.dk; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-62, -18); g.quadraticCurveTo(0, -24, 66, -18); g.stroke();
      for (const [x, c] of [[-40, '#c43a46'], [-12, '#4aa64a'], [16, '#c43a46'], [42, '#4aa64a']]) {
        g.fillStyle = M.dk; g.beginPath(); g.ellipse(x, -10, 7, 6, 0, 0, TAU); g.fill();
        g.fillStyle = c; g.beginPath(); g.ellipse(x, -10, 5, 4.4, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x - 2.5, -13, 2, 1.6);
      }
    });
    g.restore();
    // cut below the lava line, underlight, hot ring
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fillRect(-120, 3, 240, 60); g.restore();
    const ul = g.createLinearGradient(0, -50, 0, 4);
    ul.addColorStop(0, 'rgba(255,120,50,0)'); ul.addColorStop(1, 'rgba(255,140,60,0.7)');
    g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = ul; g.fillRect(-120, -110, 240, 116);
    g.fillStyle = 'rgba(70,24,40,0.18)'; g.fillRect(-120, -110, 240, 116); g.restore();
    g.fillStyle = 'rgba(255,224,140,0.9)'; g.beginPath(); g.ellipse(4, 4, 74, 4.5, 0, 0, TAU); g.fill();
    g.fillStyle = LV.crust; g.beginPath(); g.ellipse(0, 6.5, 66, 2.4, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,190,90,0.8)';
    for (const [x, r] of [[-60, 3], [52, 2.4], [70, 2]]) { g.beginPath(); g.arc(x, 2, r, Math.PI, TAU); g.fill(); }
  }

  // ------------------------------------------------------------------ near-layer sprites & placement
  function buildNear(cs) {
    const bays = [], tops = [], pillars = [], front = [], liveBack = [], liveFront = [];
    const place = (arr, spr, x, y, extra) => arr.push(Object.assign({ spr, x, y }, extra || {}));
    const flameAt = (arr, x, y, size, glowA = 1) => arr.push({ x0: x - 60, x1: x + 60, draw: (ctx, camX, t) => drawFlame(ctx, x - camX, y, size, t, x * 0.01, fire(), glowA) });
    const poolAt = (x, y, rx, ry, a) => liveFront.push({ x0: x - rx, x1: x + rx, draw: (ctx, camX) => {
      ctx.globalCompositeOperation = 'lighter';
      for (const [spr, k] of fire().glows) { ctx.globalAlpha = a * k; ctx.drawImage(spr.c, x - camX - rx, y - ry, rx * 2, ry * 2); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    } });

    // ===== CALDERA =====
    lineStyle(LINE_CAL, 0.62);
    const post = makeSprite(60, 120, 30, 108, cs, (g) => drawCausewayPost(g));
    for (const x of CAL_POSTS) {
      place(front, post, x, 364);
      flameAt(liveFront, x, 364 - 86, 20, 0.9);
      poolAt(x, 372, 90, 16, 0.35);
    }

    // ===== GATES =====
    lineStyle(LINE_GAT, 0.66);
    const pylonGate = makeSprite(260, 420, 130, 410, cs, (g) => drawPylon(g, 'gate'));
    place(pillars, pylonGate, PYL1, 364);
    const bayCache = {};
    for (const [x, type] of G_BAYS) {
      bayCache[type] = bayCache[type] || makeSprite(408, 300, 204, 296, cs, (g) => drawGatesBay(g, type));
      place(bays, bayCache[type], x, 362);
    }
    const gTop = makeSprite(412, 92, 206, 0, cs, (g) => drawGatesTop(g));
    for (const [x] of G_BAYS) place(tops, gTop, x, 0);
    const gPillar = makeSprite(130, 310, 65, 302, cs, (g) => drawGatesPillar(g));
    for (const x of G_PIL) place(pillars, gPillar, x, 364);
    const banner = makeSprite(70, 190, 0, 0, cs, (g) => drawRoyalBanner(g, 6, 7, 56, 166, 2));
    for (const [x, type] of G_BAYS) {
      if (type === 'open' || type === 'door') continue;
      for (const s of [-1, 1]) {
        const bx = x + s * 137 - 34;
        liveBack.push({ x0: bx - 10, x1: bx + 80, draw: (ctx, camX, t) => drawHang(ctx, banner, snap(bx - camX), 80, t, x * 0.01 + s, 3) });
      }
    }
    const brazier = makeSprite(120, 170, 64, 160, cs, (g) => drawStatueBrazier(g, 0.9));
    for (const x of G_BRAZ) {
      place(front, brazier, x, 364, { flip: x % 400 > 200 });
      flameAt(liveFront, x, 364 - 91, 24, 1);
      poolAt(x, 376, 120, 20, 0.45);
    }

    // ===== HALLS =====
    lineStyle(LINE_HAL, 0.62);
    const pylonVault = makeSprite(260, 420, 130, 410, cs, (g) => drawPylon(g, 'vault'));
    place(pillars, pylonVault, PYL2, 364);
    const hTop = makeSprite(452, 132, 226, 0, cs, (g) => drawHallsTop(g));
    for (const [x] of H_BAYS) place(tops, hTop, x, 0);
    const hPillar = makeSprite(130, 310, 65, 302, cs, (g) => drawHallsPillar(g));
    for (const x of H_PIL) place(pillars, hPillar, x, 364);
    for (const [x, type] of H_BAYS) {
      if (type === 'portrait') {
        place(bays, makeSprite(410, 290, 205, 286, cs, (g) => drawPortraitBay(g)), x, 362);
        for (const s of [-1, 1]) flameAt(liveBack, x + s * 116, 362 - 188, 9, 0.6);
      } else if (type === 'bust') {
        place(bays, makeSprite(200, 280, 100, 270, cs, (g) => drawKingBust(g)), x, 362);
      }
    }

    // ===== THRONE ROOM =====
    lineStyle(LINE_THR, 0.66);
    const pylonThrone = makeSprite(260, 420, 130, 410, cs, (g) => drawPylon(g, 'throne'));
    place(pillars, pylonThrone, PYL3, 364);
    const grille = makeSprite(410, 372, 205, 366, cs, (g) => drawGrilleBay(g));
    for (const x of T_WIN) place(bays, grille, x, 362);
    const tTop = makeSprite(412, 70, 206, 0, cs, (g) => drawThroneTop(g));
    for (const x of T_WIN) place(tops, tTop, x, 0);
    const tPillar = makeSprite(150, 372, 75, 366, cs, (g) => drawThronePillar(g));
    for (const x of [...T_PIL, LEVEL_LEN + 10]) {
      place(pillars, tPillar, x, 364);
      flameAt(liveBack, x - 38, 362 - 186, 16, 0.8);
    }
    const dais = makeSprite(620, 400, 310, 392, cs, (g) => drawDais(g));
    place(bays, dais, DAIS_X, 364);
    const sigilWarm = makeSprite(200, 230, 90, 150, cs, (g) => crownSigil(g, 0, 0, 150, GD.base, '#2c0c18', '#ffc850'));
    liveBack.push({ x0: DAIS_X - 120, x1: DAIS_X + 140, draw: (ctx, camX) => {
      if (warm <= 0) return;
      ctx.globalAlpha = warm; ctx.drawImage(sigilWarm.c, snap(DAIS_X + 10 - camX) - sigilWarm.ox, 364 - 150 - sigilWarm.oy, sigilWarm.w, sigilWarm.h); ctx.globalAlpha = 1;
    } });
    const big = makeSprite(160, 220, 88, 208, cs, (g) => drawStatueBrazier(g, 1.3));
    for (const s of [-1, 1]) {
      const x = DAIS_X + s * 204;
      place(pillars, big, x, 364 - 44, { flip: s > 0 });
      flameAt(liveBack, x, 364 - 44 - 131, 30, 1.1);
    }
    poolAt(DAIS_X, 372, 300, 26, 0.35);

    bays.sort((a, b) => a.x - b.x); pillars.sort((a, b) => a.x - b.x); front.sort((a, b) => a.x - b.x);
    return { bays, tops, pillars, front, liveBack, liveFront };
  }

  // ------------------------------------------------------------------ individual near drawings
  function drawCausewayPost(g) {
    ink(g, (g) => poly(g, [-17, 4, -17, -12, 17, -12, 17, 4]), OB.sh, 2.4, (g) => { g.fillStyle = GD.sh; g.fillRect(-17, -12, 34, 3); });
    ink(g, (g) => poly(g, [-12, -12, -11, -70, 11, -70, 12, -12]), OB.base, 2.6, (g) => {
      g.fillStyle = OB.sh; g.fillRect(3, -72, 12, 62);
      g.fillStyle = rgba(OB.gloss, 0.5); g.fillRect(-9, -68, 2, 52);
      const ul = g.createLinearGradient(0, -40, 0, -12); ul.addColorStop(0, 'rgba(255,120,50,0)'); ul.addColorStop(1, 'rgba(255,130,60,0.35)');
      g.fillStyle = ul; g.fillRect(-12, -40, 24, 30);
      g.fillStyle = GD.base; g.fillRect(-12, -52, 24, 4);
      crownSigil(g, 0, -28, 14, rgba(GD.base, 0.8), OB.dk);
    });
    // crown cup
    ink(g, (g) => poly(g, [-15, -70, -17, -84, -9, -78, -5, -88, 0, -80, 5, -88, 9, -78, 17, -84, 15, -70]), GD.base, 2, (g) => {
      g.fillStyle = GD.sh; g.fillRect(4, -92, 14, 24); g.fillStyle = GD.hi; g.fillRect(-14, -74, 16, 2);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -84, 11, 3, 0, 0, TAU); }, '#1a2a18', 1.4, (g) => { g.fillStyle = '#3a7a3a'; g.beginPath(); g.ellipse(0, -83.5, 8, 1.8, 0, 0, TAU); g.fill(); });
  }

  // section pylon: a massive obsidian pier with gold bands (hides the deep layers' clip edges)
  function drawPylon(g, kind) {
    const L = -92, R = 92, T = -420;
    const body = kind === 'throne' ? '#3a2430' : OB.base, bodySh = kind === 'throne' ? '#25141c' : OB.sh;
    ink(g, (g) => poly(g, [L, 4, L, T, R, T, R, 4]), body, 3, (g) => {
      g.strokeStyle = rgba(OB.joint, 0.75); g.lineWidth = 1.3;
      for (let y = -36, k = 0; y > T; y -= 42, k++) {
        polyline(g, [L, y, R, y]); g.stroke();
        for (let x = L + (k % 2 ? 31 : 62); x < R; x += 62) { polyline(g, [x, y, x, y - 42]); g.stroke(); }
      }
      g.fillStyle = rgba(bodySh, 0.9); g.fillRect(R - 44, T, 44, 430);
      g.fillStyle = rgba(OB.hi, 0.8); g.fillRect(L, T, 9, 430);
      g.fillStyle = rgba(OB.gloss, 0.45); g.fillRect(L + 12, T, 2, 430);
      if (kind === 'gate') { // the caldera side is lit by the lava
        const lg = g.createLinearGradient(L, 0, L + 70, 0); lg.addColorStop(0, 'rgba(255,120,60,0.5)'); lg.addColorStop(1, 'rgba(255,120,60,0)');
        g.fillStyle = lg; g.fillRect(L, T, 70, 430);
      }
      const ul = g.createLinearGradient(0, -160, 0, -30); ul.addColorStop(0, 'rgba(255,120,50,0)'); ul.addColorStop(1, 'rgba(255,130,60,0.22)');
      g.fillStyle = ul; g.fillRect(L, -160, R - L, 130);
      for (const y of [-118, -292]) {
        g.fillStyle = LINE; g.fillRect(L, y - 8, R - L, 16);
        g.fillStyle = GD.base; g.fillRect(L, y - 6.5, R - L, 13); g.fillStyle = GD.hi; g.fillRect(L, y - 6.5, R - L, 2.4); g.fillStyle = GD.sh; g.fillRect(R - 44, y - 6.5, 44, 13);
        g.fillStyle = GD.dk; for (let x = L + 10; x < R; x += 16) { g.beginPath(); g.arc(x, y + 1, 1.8, 0, TAU); g.fill(); }
      }
    });
    // plinth
    ink(g, (g) => poly(g, [L - 12, 4, L - 12, -34, R + 12, -34, R + 12, 4]), bodySh, 3, (g) => {
      g.fillStyle = GD.base; g.fillRect(L - 12, -34, R - L + 24, 6); g.fillStyle = GD.hi; g.fillRect(L - 12, -34, R - L + 24, 1.6);
      g.fillStyle = OB.dk; g.fillRect(R - 30, -28, 44, 34);
      g.fillStyle = rgba(OB.gloss, 0.35); g.fillRect(L - 6, -26, 50, 2);
    });
    if (kind === 'gate') {
      drawRoyalBanner(g, -42, -276, 84, 150, 2.4);
      // gold crest above the banner
      ink(g, (g) => { g.beginPath(); g.moveTo(-36, -332); g.lineTo(36, -332); g.lineTo(32, -306); g.quadraticCurveTo(0, -292, -32, -306); g.closePath(); }, GD.base, 2.4, (g) => {
        g.fillStyle = GD.sh; g.fillRect(4, -340, 40, 50);
        crownSigil(g, 2, -306, 30, CR.base, GD.dk);
      });
      smallCrown(g, 0, -334, 14, GD.base, GD.sh);
    } else if (kind === 'vault') {
      // great gold medallion: the King's crown over crossed keys of the treasury
      ink(g, (g) => { g.beginPath(); g.arc(0, -205, 56, 0, TAU); }, GD.base, 3, (g) => {
        g.fillStyle = GD.sh; g.beginPath(); g.arc(14, -195, 54, 0, TAU); g.fill();
        g.fillStyle = GD.base; g.beginPath(); g.arc(-2, -208, 46, 0, TAU); g.fill();
        g.strokeStyle = GD.dk; g.lineWidth = 2; g.beginPath(); g.arc(0, -205, 44, 0, TAU); g.stroke();
        g.fillStyle = CR.base; g.beginPath(); g.arc(0, -205, 38, 0, TAU); g.fill();
        g.fillStyle = CR.sh; g.beginPath(); g.arc(8, -199, 36, 0, TAU); g.fill();
        g.strokeStyle = GD.hi; g.lineWidth = 2; g.beginPath(); g.arc(-4, -209, 40, Math.PI * 0.9, Math.PI * 1.5); g.stroke();
        for (const s of [-1, 1]) { // crossed keys
          g.save(); g.translate(0, -196); g.rotate(s * 0.7);
          g.fillStyle = GD.base; g.fillRect(-2.5, -30, 5, 50); g.beginPath(); g.arc(0, -32, 7, 0, TAU); g.fill();
          g.fillStyle = CR.sh; g.beginPath(); g.arc(0, -32, 3, 0, TAU); g.fill();
          g.fillStyle = GD.base; g.fillRect(2, 12, 8, 4); g.fillRect(2, 18, 6, 3);
          g.restore();
        }
      });
      smallCrown(g, 0, -244, 22, GD.base, GD.sh, KG.glass, 2.2);
      drawRoyalBanner(g, -26, -130, 52, 84, 2);
    } else {
      // throne-room pier: a gold dragon relief climbing it
      const body = [6, -40, -30, -92, 28, -146, -24, -202, 20, -254, -6, -300];
      const tube = (w, col, ox = 0, oy = 0) => { g.save(); g.translate(ox, oy); curve(g, body); g.restore(); g.lineWidth = w; g.strokeStyle = col; g.stroke(); };
      // wing spread from the middle coil
      ink(g, (g) => poly(g, [24, -150, 62, -196, 70, -176, 84, -182, 76, -156, 86, -148, 58, -140, 40, -128]), GD.sh, 2.4, (g) => {
        g.strokeStyle = GD.dk; g.lineWidth = 1.2; polyline(g, [30, -146, 66, -186]); g.stroke(); polyline(g, [34, -140, 80, -160]); g.stroke();
        g.fillStyle = rgba(GD.hi, 0.5); g.fillRect(28, -160, 30, 3);
      });
      tube(24 + 3.4 * LK, LINE, 0.8, 1.2); tube(22, LINE); tube(19, GD.base); tube(7, GD.sh, 3, 3); tube(2.6, GD.hi, -4, -2);
      for (let i = 1; i < body.length / 2; i++) { // back spines between the bends
        const x0 = body[i * 2 - 2], y0 = body[i * 2 - 1], x1 = body[i * 2], y1 = body[i * 2 + 1];
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, l = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / l, ny = (x1 - x0) / l;
        ink(g, (g) => poly(g, [mx - nx * 8 - 4, my - ny * 8, mx - nx * 20, my - ny * 20, mx - nx * 8 + 4, my - ny * 8 - 2]), GD.sh, 1.4);
      }
      // head at the top, looking out over the hall (green eye, horns)
      ink(g, (g) => poly(g, [-2, -296, -16, -316, -40, -320, -60, -314, -62, -304, -42, -300, -30, -292, -12, -286]), GD.base, 2.6, (g) => {
        g.fillStyle = GD.sh; g.fillRect(-64, -306, 60, 14); g.fillStyle = GD.hi; g.fillRect(-50, -318, 30, 2.4);
        g.fillStyle = KG.glass; poly(g, [-34, -311, -24, -313, -27, -308]); g.fill();
        g.fillStyle = GD.dk; g.beginPath(); g.ellipse(-56, -311, 2.4, 1.4, 0, 0, TAU); g.fill();
      });
      ink(g, (g) => poly(g, [-14, -314, -4, -344, -22, -318]), OB.base, 1.8);
      ink(g, (g) => poly(g, [-22, -318, -20, -340, -30, -320]), OB.base, 1.6);
    }
  }

  // gates pillar with the fire-statue dragon head (mouth at local (0, -56) = screen y 306)
  function drawGatesPillar(g) {
    // base
    ink(g, (g) => poly(g, [-48, 4, -48, -16, -40, -26, 40, -26, 48, -16, 48, 4]), OB.sh, 3, (g) => {
      g.fillStyle = GD.base; g.fillRect(-48, -26, 96, 8); g.fillStyle = GD.hi; g.fillRect(-48, -26, 96, 2); g.fillStyle = GD.sh; g.fillRect(16, -26, 34, 8);
      g.fillStyle = OB.dk; g.fillRect(20, -18, 30, 24);
    });
    // shaft
    ink(g, (g) => poly(g, [-33, -24, -31, -276, 31, -276, 33, -24]), OB.base, 3, (g) => {
      g.fillStyle = OB.sh; g.fillRect(9, -280, 26, 260);
      g.fillStyle = OB.dk; g.fillRect(24, -280, 12, 260);
      g.fillStyle = rgba(OB.hi, 0.85); g.fillRect(-31, -280, 9, 260);
      g.fillStyle = rgba(OB.gloss, 0.6); g.fillRect(-20, -270, 2.4, 240); g.fillStyle = rgba(OB.gloss, 0.3); g.fillRect(-14, -250, 1.4, 200);
      g.strokeStyle = rgba(OB.joint, 0.8); g.lineWidth = 1.2;
      for (const x of [-8, 6, 18]) { polyline(g, [x, -272, x, -28]); g.stroke(); }
      // gold inlay stripe with diamonds
      g.fillStyle = GD.sh; g.fillRect(-3, -268, 6, 240);
      g.fillStyle = GD.base;
      for (let y = -250; y < -30; y += 34) poly(g, [0, y - 7, 5, y, 0, y + 7, -5, y]), g.fill();
      const ul = g.createLinearGradient(0, -170, 0, -24); ul.addColorStop(0, 'rgba(255,120,50,0)'); ul.addColorStop(1, 'rgba(255,130,60,0.3)');
      g.fillStyle = ul; g.fillRect(-34, -170, 68, 150);
    });
    // capital
    ink(g, (g) => { g.beginPath(); g.moveTo(-32, -274); g.quadraticCurveTo(-36, -286, -50, -292); g.lineTo(-52, -300); g.lineTo(52, -300); g.lineTo(50, -292); g.quadraticCurveTo(36, -286, 32, -274); g.closePath(); }, GD.base, 2.8, (g) => {
      g.fillStyle = GD.sh; g.fillRect(14, -304, 40, 34);
      g.fillStyle = GD.hi; g.fillRect(-52, -300, 70, 2.4);
      g.strokeStyle = GD.dk; g.lineWidth = 1.2;
      for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 40, -290, 5, 0, TAU); g.stroke(); }
      for (let x = -24; x <= 24; x += 12) { polyline(g, [x, -276, x * 1.3, -292]); g.stroke(); }
    });
    // the fire-statue dragon head on its bracket
    g.save(); g.translate(0, -56); drawFireHead(g); g.restore();
  }
  // front-facing bronze dragon head, jaws open (origin = mouth centre; the engine's fire comes out here)
  function drawFireHead(g) {
    const B = { base: '#a86c30', sh: '#6c421c', dk: '#3a220c', hi: '#e2aa5a' };
    // collar plate behind the head
    ink(g, (g) => { g.beginPath(); g.arc(0, -38, 33, 0, TAU); }, OB.sh, 2.4, (g) => {
      g.strokeStyle = GD.sh; g.lineWidth = 4; g.beginPath(); g.arc(0, -38, 28, 0, TAU); g.stroke();
      g.strokeStyle = GD.hi; g.lineWidth = 1.2; g.beginPath(); g.arc(0, -38, 29.5, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
      g.fillStyle = GD.dk; for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; g.beginPath(); g.arc(Math.cos(a) * 28, -38 + Math.sin(a) * 28, 1.6, 0, TAU); g.fill(); }
    });
    // horns sweeping up and out
    for (const s of [-1, 1]) {
      ink(g, (g) => { g.beginPath(); g.moveTo(s * 10, -58); g.quadraticCurveTo(s * 28, -74, s * 40, -100); g.quadraticCurveTo(s * 30, -80, s * 20, -50); g.closePath(); }, B.dk, 2.2, (g) => {
        g.fillStyle = GD.base; g.beginPath(); g.moveTo(s * 36, -88); g.lineTo(s * 40, -100); g.lineTo(s * 31, -86); g.closePath(); g.fill();
        g.strokeStyle = rgba(B.hi, 0.5); g.lineWidth = 1; for (let k = 0; k < 3; k++) { polyline(g, [s * (14 + k * 6), -60 - k * 8, s * (19 + k * 6), -56 - k * 8]); g.stroke(); }
      });
    }
    // cheek frills
    for (const s of [-1, 1]) ink(g, (g) => poly(g, [s * 18, -46, s * 42, -54, s * 32, -42, s * 46, -36, s * 30, -30, s * 38, -20, s * 16, -24]), B.sh, 2, (g) => {
      g.strokeStyle = rgba(B.dk, 0.8); g.lineWidth = 1; polyline(g, [s * 20, -40, s * 38, -50]); g.stroke(); polyline(g, [s * 20, -32, s * 40, -36]); g.stroke();
    });
    // lower jaw hanging open
    ink(g, (g) => { g.beginPath(); g.moveTo(-13, -2); g.quadraticCurveTo(-12, 14, 0, 18); g.quadraticCurveTo(12, 14, 13, -2); g.lineTo(8, 5); g.lineTo(-8, 5); g.closePath(); }, B.sh, 2.2, (g) => { g.fillStyle = B.dk; g.fillRect(3, -4, 14, 24); });
    for (const x of [-8, -3, 3, 8]) ink(g, (g) => poly(g, [x - 2, 4.5, x + 2, 4.5, x, -1]), '#fff4dc', 0.9);
    // the glowing gullet
    ink(g, (g) => { g.beginPath(); g.ellipse(0, 1, 10, 5.5, 0, 0, TAU); }, '#1a0806', 1.4, (g) => {
      const mg = g.createRadialGradient(0, 2, 1, 0, 2, 11); mg.addColorStop(0, 'rgba(255,190,90,1)'); mg.addColorStop(0.5, 'rgba(230,80,30,0.7)'); mg.addColorStop(1, 'rgba(60,10,8,0)');
      g.fillStyle = mg; g.fillRect(-12, -6, 24, 14);
    });
    // head: broad brow tapering to a long snout
    const head = [-22, -62, -8, -68, 8, -68, 22, -62, 26, -48, 19, -36, 13, -24, 12, -11, 6, -4, -6, -4, -12, -11, -13, -24, -19, -36, -26, -48];
    ink(g, (g) => blob(g, head), B.base, 2.6, (g) => {
      g.fillStyle = B.sh; poly(g, [4, -72, 30, -72, 30, 0, 6, 0, 10, -36]); g.fill();
      g.fillStyle = rgba(B.hi, 0.9); g.beginPath(); g.ellipse(-10, -60, 9, 4, -0.2, 0, TAU); g.fill();
      g.strokeStyle = B.dk; g.lineWidth = 1.2;
      for (const [y, w] of [[-30, 7], [-24, 6], [-18, 5]]) { g.beginPath(); g.ellipse(0, y, w, 2.4, 0, Math.PI, TAU); g.stroke(); }
      g.fillStyle = B.dk; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 6, -10, 3, 1.8, s * 0.5, 0, TAU); g.fill(); }
      g.fillStyle = B.dk; for (const s of [-1, 1]) { poly(g, [s * 6, -46, s * 24, -56, s * 22, -44, s * 9, -40]); g.fill(); }
      g.fillStyle = KG.glass; for (const s of [-1, 1]) { poly(g, [s * 10, -43, s * 21, -48, s * 19, -42]); g.fill(); }
      g.fillStyle = '#eaffd0'; for (const s of [-1, 1]) g.fillRect(s * 14 - 1, -45, 2, 1.4);
      g.strokeStyle = rgba(B.dk, 0.6); g.lineWidth = 1;
      for (const [x, y] of [[-8, -60], [0, -62], [8, -60], [-4, -55], [4, -55]]) { g.beginPath(); g.arc(x, y, 3.4, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    });
    for (const s of [-1, 1]) ink(g, (g) => poly(g, [s * 18, -60, s * 30, -74, s * 24, -56]), B.dk, 1.6);
    for (const s of [-1, 1]) ink(g, (g) => poly(g, [s * 11, -6, s * 7, -6, s * 9, 5]), '#fff4dc', 1);
  }

  // gates wall bay (pillar to pillar); type: 'door' | 'port' | 'open'
  function drawGatesBay(g, type) {
    const L = -204, R = 204, T = -296;
    const wall = '#382e40', wallSh = '#271f2e', wallHi = '#4a3f54', joint = '#1a141e';
    const hw = 84, spring = -170;
    // wall with ashlar courses
    ink(g, (g) => poly(g, [L, 2, L, T, R, T, R, 2]), wall, 0, (g) => {
      for (let y = 0, r = 0; y > T; y -= 38, r++) {
        const off = r % 2 ? 0 : 34;
        for (let x = L - off; x < R; x += 68) {
          const h = hash2(x | 0, r + 7);
          g.fillStyle = h < 0.3 ? wallSh : h > 0.82 ? wallHi : wall;
          g.fillRect(x + 1, y - 37, 66, 36);
          g.fillStyle = rgba(wallHi, 0.35); g.fillRect(x + 2, y - 37, 64, 2);
        }
        g.fillStyle = joint; g.fillRect(L, y - 1.2, R - L, 1.4);
        for (let x = L - off; x < R; x += 68) g.fillRect(x - 0.6, y - 38, 1.4, 38);
      }
      // darkness gathering under the ceiling + warm uplight at the bottom
      let gr = g.createLinearGradient(0, T, 0, T + 110); gr.addColorStop(0, 'rgba(10,6,12,0.75)'); gr.addColorStop(1, 'rgba(10,6,12,0)');
      g.fillStyle = gr; g.fillRect(L, T, R - L, 110);
      gr = g.createLinearGradient(0, -120, 0, 0); gr.addColorStop(0, 'rgba(255,110,50,0)'); gr.addColorStop(1, 'rgba(255,120,60,0.16)');
      g.fillStyle = gr; g.fillRect(L, -120, R - L, 120);
      // gold string course
      g.fillStyle = LINE; g.fillRect(L, -212, R - L, 12);
      g.fillStyle = GD.sh; g.fillRect(L, -211, R - L, 10); g.fillStyle = GD.base; g.fillRect(L, -211, R - L, 5); g.fillStyle = GD.hi; g.fillRect(L, -211, R - L, 1.4);
      // dado
      g.fillStyle = '#211a27'; g.fillRect(L, -40, R - L, 42);
      g.fillStyle = GD.sh; g.fillRect(L, -42, R - L, 5); g.fillStyle = GD.hi; g.fillRect(L, -42, R - L, 1.4);
      g.fillStyle = rgba(OB.gloss, 0.12); for (let x = L + 20; x < R; x += 46) g.fillRect(x, -34, 22, 2);
    });
    // arch frame: alternating gold / obsidian voussoirs
    const fr = 22;
    g.save();
    archPath(g, 0, 2, hw + fr, spring); g.fillStyle = LINE; g.fill();
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 1) / n) * Math.PI;
      g.beginPath(); g.arc(0, spring, hw + fr - 1.5, a0, a1); g.arc(0, spring, hw + 1, a1, a0, true); g.closePath();
      g.fillStyle = i % 2 ? OB.base : GD.base; g.fill();
      if (i % 2 === 0) { g.save(); g.clip(); g.fillStyle = GD.sh; g.fillRect(0, spring - hw - fr, hw + fr, hw + fr); g.fillStyle = rgba(GD.hi, 0.7); g.beginPath(); g.arc(0, spring, hw + fr - 4, a0, a1); g.lineWidth = 2; g.strokeStyle = GD.hi; g.stroke(); g.restore(); }
      g.beginPath(); g.moveTo(Math.cos(a0) * (hw + 1), spring + Math.sin(a0) * (hw + 1)); g.lineTo(Math.cos(a0) * (hw + fr - 1.5), spring + Math.sin(a0) * (hw + fr - 1.5));
      g.strokeStyle = LINE; g.lineWidth = 1.3; g.stroke();
    }
    for (const s of [-1, 1]) { // jambs
      for (let y = spring, k = 0; y < 0; y += 34, k++) {
        const yb = Math.min(2, y + 34);
        g.fillStyle = k % 2 ? GD.base : OB.base; g.fillRect(s > 0 ? hw + 1 : -hw - fr + 1.5, y, fr - 2.5, yb - y);
        if (k % 2) { g.fillStyle = GD.sh; g.fillRect(s > 0 ? hw + 12 : -hw - 8, y, 9, yb - y); }
        g.fillStyle = LINE; g.fillRect(s > 0 ? hw + 1 : -hw - fr + 1.5, y - 0.6, fr - 2.5, 1.3);
      }
    }
    g.restore();
    // keystone with the crown
    ink(g, (g) => poly(g, [-17, spring - hw - fr - 8, 17, spring - hw - fr - 8, 12, spring - hw + 6, -12, spring - hw + 6]), GD.base, 2.4, (g) => {
      g.fillStyle = GD.sh; g.fillRect(4, spring - hw - fr - 10, 16, 40);
      g.fillStyle = KG.glass; g.beginPath(); g.ellipse(0, spring - hw - 8, 4, 5, 0, 0, TAU); g.fill();
      g.fillStyle = '#eaffd0'; g.fillRect(-1.5, spring - hw - 11, 1.6, 2);
    });
    smallCrown(g, 0, spring - hw - fr - 8, 9, GD.base, GD.sh, KG.glass, 1.6);
    // inner reveal (shadowed depth of the arch)
    archPath(g, 0, 2, hw + 1, spring); g.fillStyle = '#120c15'; g.fill();
    g.save(); archPath(g, 0, 2, hw + 1, spring); g.clip();
    g.fillStyle = '#211a28'; g.fillRect(-hw - 2, spring - hw - 2, 12, 400);
    g.restore();
    if (type === 'door') {
      // great sealed bronze doors with the crown relief
      archPath(g, 0, 2, hw - 7, spring + 4);
      ink(g, (g) => archPath(g, 0, 2, hw - 7, spring + 4), '#8a5a2a', 2.2, (g) => {
        g.fillStyle = '#6a4220'; g.fillRect(4, spring - hw, hw, 400);
        g.fillStyle = '#a8743a'; g.fillRect(-hw, spring - hw, 12, 400);
        g.strokeStyle = '#3a2410'; g.lineWidth = 2; polyline(g, [0, spring - hw, 0, 4]); g.stroke();
        g.strokeStyle = rgba(GD.hi, 0.5); g.lineWidth = 1.2; polyline(g, [-2, spring - hw, -2, 4]); g.stroke();
        for (const y of [-40, -110]) {
          g.fillStyle = GD.sh; g.fillRect(-hw, y - 5, hw * 2, 10); g.fillStyle = GD.base; g.fillRect(-hw, y - 5, hw * 2, 4);
          g.fillStyle = GD.dk; for (let x = -hw + 8; x < hw; x += 14) { g.beginPath(); g.arc(x, y + 1, 1.8, 0, TAU); g.fill(); }
        }
        // crown relief
        g.save(); g.translate(0, -186); g.scale(1.6, 1.6);
        ink(g, (g) => poly(g, [-22, 8, -24, -10, -12, -2, 0, -18, 12, -2, 24, -10, 22, 8]), GD.base, 1.6, (g) => { g.fillStyle = GD.sh; g.fillRect(4, -20, 24, 30); g.fillStyle = KG.glass; g.beginPath(); g.arc(0, 2, 3.2, 0, TAU); g.fill(); });
        g.restore();
        // ring handles
        for (const s of [-1, 1]) { g.strokeStyle = LINE; g.lineWidth = 4.2; g.beginPath(); g.arc(s * 16, -74, 9, 0, TAU); g.stroke(); g.strokeStyle = GD.base; g.lineWidth = 2.6; g.stroke(); ink(g, (g) => { g.beginPath(); g.arc(s * 16, -84, 4.5, 0, TAU); }, GD.sh, 1.4); }
      });
    } else {
      // see-through opening into the inner hall (deep layer shows through)
      g.save(); g.globalCompositeOperation = 'destination-out';
      archPath(g, 0, 2, hw - 8, spring + 6); g.fillStyle = '#000'; g.fill();
      g.restore();
      // threshold step
      ink(g, (g) => poly(g, [-hw + 2, 2, -hw + 2, -8, hw - 2, -8, hw - 2, 2]), '#4a3e54', 1.6, (g) => { g.fillStyle = GD.sh; g.fillRect(-hw, -8, hw * 2, 2); });
      if (type === 'port') {
        // iron portcullis
        const iron = '#3b3942', ironHi = '#6e6c7a', ironSh = '#24222a';
        g.save(); archPath(g, 0, 2, hw - 8, spring + 6); g.clip();
        for (const y of [-38, -92, -146, -200]) {
          g.fillStyle = LINE; g.fillRect(-hw, y - 4.5, hw * 2, 9);
          g.fillStyle = iron; g.fillRect(-hw, y - 3, hw * 2, 6); g.fillStyle = ironHi; g.fillRect(-hw, y - 3, hw * 2, 1.6);
        }
        for (let x = -hw + 14; x <= hw - 14; x += 19) {
          g.fillStyle = LINE; g.fillRect(x - 4.5, -300, 9, 290);
          g.fillStyle = iron; g.fillRect(x - 3, -300, 6, 290); g.fillStyle = ironHi; g.fillRect(x - 3, -300, 1.6, 290); g.fillStyle = ironSh; g.fillRect(x + 1.4, -300, 1.6, 290);
          poly(g, [x - 4.5, -12, x, 0, x + 4.5, -12]); g.fillStyle = LINE; g.fill();
          poly(g, [x - 3, -12, x, -3, x + 3, -12]); g.fillStyle = ironHi; g.fill();
          for (const y of [-38, -92, -146, -200]) { g.fillStyle = '#8a8896'; g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); }
        }
        g.restore();
        // chains
        g.strokeStyle = '#2a2830'; g.lineWidth = 3; g.setLineDash([5, 3]);
        for (const s of [-1, 1]) { polyline(g, [s * (hw - 14), -205, s * (hw + 30), -262]); g.stroke(); }
        g.setLineDash([]);
      }
    }
  }

  // gates ceiling band (repeats per bay): vault darkness, ribs, obsidian beam with a gold scale frieze
  function drawGatesTop(g) {
    const L = -206, R = 206;
    g.fillStyle = '#0e0a10'; g.fillRect(L, 0, R - L, 34);
    g.strokeStyle = '#1e1622'; g.lineWidth = 8; g.beginPath(); g.moveTo(L, 32); g.quadraticCurveTo(0, -18, R, 32); g.stroke();
    g.strokeStyle = rgba(GD.sh, 0.35); g.lineWidth = 1.5; g.beginPath(); g.moveTo(L, 28); g.quadraticCurveTo(0, -22, R, 28); g.stroke();
    ink(g, (g) => poly(g, [L, 22, R, 22, R, 74, L, 74]), OB.base, 2.2, (g) => {
      g.fillStyle = OB.hi; g.fillRect(L, 22, R - L, 3);
      g.fillStyle = GD.sh; g.fillRect(L, 32, R - L, 24);
      // dragon-scale frieze
      for (let x = L - 6; x < R + 12; x += 12) {
        g.fillStyle = GD.base; g.beginPath(); g.arc(x, 38, 6.4, 0, Math.PI); g.fill();
        g.fillStyle = GD.hi; g.beginPath(); g.arc(x - 1.5, 38.5, 3.2, 0.2, Math.PI * 0.8); g.fill();
        g.fillStyle = GD.base; g.beginPath(); g.arc(x + 6, 47, 6.4, 0, Math.PI); g.fill();
        g.fillStyle = GD.dk; g.beginPath(); g.arc(x + 6, 47, 6.4, Math.PI * 0.1, Math.PI * 0.4); g.fill();
      }
      g.fillStyle = LINE; g.fillRect(L, 31, R - L, 1.6); g.fillRect(L, 55, R - L, 1.6);
      g.fillStyle = OB.sh; g.fillRect(L, 56, R - L, 18);
      g.fillStyle = OB.dk; for (let x = L; x < R; x += 11) g.fillRect(x, 60, 6, 7);
      g.fillStyle = GD.base; g.fillRect(L, 69, R - L, 4); g.fillStyle = GD.hi; g.fillRect(L, 69, R - L, 1.2);
    });
  }

  // dragon-statue brazier: a gold dragon rearing behind a bowl of crown-fire, wing spread (origin = floor point, faces right)
  // The bowl's rim is at local y = -100 (the live flame sits there).
  function drawStatueBrazier(g, k) {
    g.save(); g.scale(k, k);
    const M = { base: '#d6a040', sh: '#986826', hi: '#ffe39a', dk: '#5a3c14', belly: '#ecc46c' };
    // pedestal
    ink(g, (g) => poly(g, [-30, 4, -30, -26, 30, -26, 30, 4]), OB.sh, 2.6, (g) => {
      g.fillStyle = GD.base; g.fillRect(-30, -26, 60, 5); g.fillStyle = GD.hi; g.fillRect(-30, -26, 60, 1.4);
      g.fillStyle = OB.dk; g.fillRect(12, -21, 22, 26);
      g.fillStyle = rgba(OB.gloss, 0.4); g.fillRect(-24, -18, 2, 18);
    });
    // far wing, spread behind
    ink(g, (g) => poly(g, [-8, -84, -24, -150, -32, -128, -48, -138, -48, -116, -62, -114, -50, -98, -36, -92, -20, -66]), M.sh, 2.2, (g) => {
      g.strokeStyle = M.dk; g.lineWidth = 1.3;
      for (const [x, y] of [[-24, -150], [-48, -138], [-62, -114]]) { polyline(g, [-10, -82, x, y]); g.stroke(); }
      g.fillStyle = rgba(M.hi, 0.35); poly(g, [-10, -84, -24, -146, -20, -100]); g.fill();
    });
    // tail curling round the pedestal top
    ink(g, (g) => { g.beginPath(); g.moveTo(-12, -27); g.quadraticCurveTo(-40, -26, -36, -40); g.quadraticCurveTo(-32, -48, -25, -43); g.quadraticCurveTo(-30, -36, -14, -33); g.closePath(); }, M.sh, 1.8);
    ink(g, (g) => poly(g, [-25, -43, -21, -53, -18, -42]), M.dk, 1.2);
    // body, rearing upright
    ink(g, (g) => blob(g, [-24, -28, -28, -56, -18, -84, -4, -96, 8, -90, 8, -68, 4, -46, 8, -28]), M.base, 2.6, (g) => {
      g.fillStyle = M.sh; g.beginPath(); g.ellipse(6, -56, 8, 34, 0, 0, TAU); g.fill();
      g.fillStyle = M.belly; g.beginPath(); g.ellipse(1, -60, 5, 26, 0.08, 0, TAU); g.fill();
      g.strokeStyle = M.sh; g.lineWidth = 1.1; for (let y = -82; y < -38; y += 6.5) { polyline(g, [-3, y, 6, y + 1]); g.stroke(); }
      g.fillStyle = M.hi; g.beginPath(); g.ellipse(-20, -62, 3.4, 12, 0.25, 0, TAU); g.fill();
    });
    // haunch + clawed hind foot
    ink(g, (g) => { g.beginPath(); g.ellipse(-12, -42, 12, 14, -0.2, 0, TAU); }, M.base, 2.2, (g) => { g.fillStyle = M.sh; g.fillRect(-6, -58, 20, 32); g.fillStyle = rgba(M.hi, 0.8); g.beginPath(); g.ellipse(-17, -48, 3, 6, 0.4, 0, TAU); g.fill(); });
    ink(g, (g) => poly(g, [-14, -26, 6, -26, 9, -30, -6, -31]), M.sh, 1.8);
    // neck and head, looking out over the flame
    ink(g, (g) => { g.beginPath(); g.moveTo(-12, -88); g.quadraticCurveTo(-8, -122, 12, -128); g.lineTo(18, -118); g.quadraticCurveTo(4, -112, 4, -86); g.closePath(); }, M.base, 2.4, (g) => {
      g.fillStyle = M.belly; g.beginPath(); g.moveTo(4, -86); g.quadraticCurveTo(4, -112, 18, -118); g.lineTo(14, -122); g.quadraticCurveTo(-1, -112, -2, -88); g.closePath(); g.fill();
    });
    ink(g, (g) => poly(g, [8, -126, 16, -136, 30, -137, 44, -129, 45, -124, 33, -121, 22, -116, 11, -117]), M.base, 2.4, (g) => {
      g.fillStyle = M.sh; poly(g, [20, -122, 45, -126, 45, -120, 22, -114]); g.fill();
      g.fillStyle = M.hi; g.fillRect(16, -136, 16, 2.2);
      g.strokeStyle = M.dk; g.lineWidth = 1.1; polyline(g, [30, -124, 44, -126]); g.stroke();
      g.fillStyle = OB.dk; poly(g, [20, -131, 28, -133, 26, -129]); g.fill();
      g.fillStyle = KG.glass; poly(g, [21, -131, 27, -132.4, 25.5, -130]); g.fill();
      g.fillStyle = M.dk; g.beginPath(); g.ellipse(41, -128, 1.6, 1, 0, 0, TAU); g.fill();
    });
    ink(g, (g) => poly(g, [14, -134, -2, -150, 20, -137]), M.dk, 1.5);
    ink(g, (g) => poly(g, [22, -137, 12, -154, 28, -138]), M.dk, 1.4);
    ink(g, (g) => poly(g, [10, -122, -2, -126, 6, -118, -4, -114, 8, -114]), M.sh, 1.3);
    // near wing, folded
    ink(g, (g) => poly(g, [-4, -82, -12, -120, -18, -104, -28, -108, -20, -90, -10, -70]), M.base, 2, (g) => {
      g.fillStyle = M.sh; g.fillRect(-30, -96, 30, 30);
      g.strokeStyle = M.dk; g.lineWidth = 1; polyline(g, [-6, -80, -12, -116]); g.stroke(); polyline(g, [-8, -78, -26, -106]); g.stroke();
    });
    // the bowl on its stand, gripped by a foreclaw
    ink(g, (g) => poly(g, [-5, -26, -4, -88, 4, -88, 5, -26]), GD.sh, 2, (g) => { g.fillStyle = GD.base; g.fillRect(-4, -90, 3, 66); });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -58, 8, 4, 0, 0, TAU); }, GD.base, 1.8);
    ink(g, (g) => poly(g, [-10, -28, 10, -28, 6, -34, -6, -34]), GD.base, 1.8);
    { const pts = [[0, -80], [12, -74], [8, -62]]; curve(g, flat(pts)); g.lineWidth = 6 + 3.4 * LK; g.strokeStyle = LINE; g.stroke(); curve(g, flat(pts)); g.lineWidth = 6; g.strokeStyle = M.base; g.stroke(); }
    ink(g, (g) => poly(g, [4, -64, 10, -60, 6, -56, 2, -59]), M.sh, 1.2);
    ink(g, (g) => { g.beginPath(); g.moveTo(-22, -100); g.quadraticCurveTo(-18, -84, 0, -84); g.quadraticCurveTo(18, -84, 22, -100); g.closePath(); }, GD.base, 2.4, (g) => {
      g.fillStyle = GD.sh; g.fillRect(6, -104, 20, 24); g.fillStyle = GD.hi; g.fillRect(-19, -98, 5, 9);
      g.fillStyle = GD.dk; for (let x = -12; x <= 12; x += 8) g.fillRect(x - 1.4, -95, 2.8, 2.8);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -100, 22, 4.2, 0, 0, TAU); }, '#1a2a18', 2, (g) => { g.fillStyle = '#3a7a3a'; g.beginPath(); g.ellipse(0, -99, 17, 2.4, 0, 0, TAU); g.fill(); });
    g.restore();
  }

  // halls pillar: obsidian wrapped in a gold spiral, crown capital
  function drawHallsPillar(g) {
    ink(g, (g) => poly(g, [-46, 4, -46, -14, -38, -26, 38, -26, 46, -14, 46, 4]), GD.sh, 3, (g) => {
      g.fillStyle = GD.base; g.fillRect(-46, -26, 60, 30); g.fillStyle = GD.hi; g.fillRect(-46, -26, 92, 2);
      g.fillStyle = GD.dk; g.fillRect(-46, -12, 92, 2);
    });
    ink(g, (g) => poly(g, [-30, -24, -28, -262, 28, -262, 30, -24]), OB.base, 3, (g) => {
      g.fillStyle = OB.sh; g.fillRect(8, -266, 24, 246); g.fillStyle = OB.dk; g.fillRect(22, -266, 10, 246);
      g.fillStyle = rgba(OB.gloss, 0.55); g.fillRect(-19, -256, 2.4, 226);
      // gold spiral band (front segments)
      for (let y = -40; y > -262; y -= 44) {
        poly(g, [-31, y, 31, y - 22, 31, y - 32, -31, y - 10]); g.fillStyle = LINE; g.fill();
        poly(g, [-31, y - 1.5, 31, y - 23.5, 31, y - 30.5, -31, y - 8.5]); g.fillStyle = GD.base; g.fill();
        poly(g, [10, y - 9, 31, y - 16.5, 31, y - 30.5, 10, y - 23]); g.fillStyle = GD.sh; g.fill();
        poly(g, [-31, y - 7, 0, y - 18, 0, y - 20, -31, y - 9]); g.fillStyle = GD.hi; g.fill();
      }
      const ul = g.createLinearGradient(0, -150, 0, -24); ul.addColorStop(0, 'rgba(255,190,90,0)'); ul.addColorStop(1, 'rgba(255,190,90,0.22)');
      g.fillStyle = ul; g.fillRect(-30, -150, 60, 130);
    });
    // crown capital
    ink(g, (g) => poly(g, [-30, -258, -44, -268, -48, -292, -36, -282, -24, -300, -12, -284, 0, -306, 12, -284, 24, -300, 36, -282, 48, -292, 44, -268, 30, -258]), GD.base, 2.8, (g) => {
      g.fillStyle = GD.sh; g.fillRect(10, -310, 40, 54);
      g.fillStyle = GD.hi; g.fillRect(-44, -270, 50, 2);
      for (const [x, c] of [[-24, '#e8384a'], [0, KG.glass], [24, '#e8384a']]) { g.fillStyle = c; g.beginPath(); g.arc(x, -268, 3.4, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x - 1.5, -270, 1.4, 1.4); }
    });
  }
  // halls ceiling band: coffered gold ceiling, architrave and a crimson swag with fringe
  function drawHallsTop(g) {
    const L = -226, R = 226;
    ink(g, (g) => poly(g, [L, -4, R, -4, R, 56, L, 56]), '#3a1a18', 0, (g) => {
      for (let x = L - 10; x < R; x += 56) {
        g.fillStyle = '#9a7238'; g.fillRect(x, -4, 56, 42);
        g.fillStyle = '#5a1c22'; g.fillRect(x + 7, 2, 42, 30);
        g.fillStyle = '#7a2830'; g.fillRect(x + 7, 2, 42, 8);
        g.fillStyle = GD.base; g.beginPath(); g.arc(x + 28, 18, 5, 0, TAU); g.fill();
        g.fillStyle = GD.hi; g.beginPath(); g.arc(x + 27, 17, 2, 0, TAU); g.fill();
        g.fillStyle = 'rgba(30,8,10,0.6)'; g.fillRect(x + 43, 2, 6, 30);
      }
      g.fillStyle = LINE; g.fillRect(L, 37, R - L, 2);
      g.fillStyle = GD.sh; g.fillRect(L, 39, R - L, 18); g.fillStyle = GD.base; g.fillRect(L, 39, R - L, 9); g.fillStyle = GD.hi; g.fillRect(L, 39, R - L, 1.6);
      g.fillStyle = GD.dk; for (let x = L; x < R; x += 9) { g.beginPath(); g.ellipse(x, 52, 3, 3.6, 0, 0, TAU); g.fill(); }
    });
    strokeLine(g, [L, 57, R, 57], 2, LINE);
    // swag
    const top = 56, dip = 112;
    const swag = (g) => { g.beginPath(); g.moveTo(L + 20, top); g.quadraticCurveTo(0, dip + 26, R - 20, top); g.lineTo(R - 34, top); g.quadraticCurveTo(0, dip - 16, L + 34, top); g.closePath(); };
    ink(g, swag, CR.base, 2.4, (g) => {
      g.strokeStyle = CR.sh; g.lineWidth = 6;
      for (const k of [0.25, 0.55, 0.8]) { g.beginPath(); g.moveTo(L + 24 + k * 10, top); g.quadraticCurveTo(0, top + (dip - top) * (0.4 + k * 0.8) + 10, R - 24 - k * 10, top); g.stroke(); }
      g.strokeStyle = CR.hi; g.lineWidth = 2;
      for (const k of [0.15, 0.45]) { g.beginPath(); g.moveTo(L + 30, top); g.quadraticCurveTo(0, top + (dip - top) * (0.4 + k * 0.8) + 4, R - 30, top); g.stroke(); }
    });
    // gold fringe along the lower edge
    for (let i = 0; i <= 40; i++) {
      const f = i / 40, x = lerp(L + 20, R - 20, f);
      const y = (1 - f) * (1 - f) * top + 2 * (1 - f) * f * (dip + 26) + f * f * top;
      strokeLine(g, [x, y - 1, x, y + 7], 2.6, LINE); strokeLine(g, [x, y - 1, x, y + 6], 1.4, GD.base);
    }
    // tassels at the ends
    for (const x of [L + 26, R - 26]) {
      strokeLine(g, [x, top, x, top + 26], 2, GD.sh);
      ink(g, (g) => poly(g, [x - 5, top + 24, x + 5, top + 24, x + 8, top + 46, x - 8, top + 46]), GD.base, 1.6, (g) => { g.fillStyle = GD.sh; g.fillRect(x + 1, top + 20, 10, 30); });
      ink(g, (g) => { g.beginPath(); g.arc(x, top + 22, 5, 0, TAU); }, GD.base, 1.4);
    }
  }
  // portrait bay: damask wall, wainscot, the vain portrait of the King in a gilded frame
  function drawPortraitBay(g) {
    const L = -205, R = 205, T = -286;
    ink(g, (g) => poly(g, [L, 2, L, T, R, T, R, 2]), '#5e1622', 0, (g) => {
      // damask: little gold crowns on a diamond lattice
      g.strokeStyle = 'rgba(210,160,80,0.18)'; g.lineWidth = 1.2;
      for (let x = L - 300; x < R + 40; x += 36) { polyline(g, [x, 2, x + 300, T]); g.stroke(); polyline(g, [x + 300, 2, x, T]); g.stroke(); }
      for (let y = T + 18, r = 0; y < -60; y += 36, r++) for (let x = L + (r % 2 ? 18 : 0); x < R; x += 36) {
        g.fillStyle = 'rgba(224,173,72,0.38)'; poly(g, [x - 6, y + 4, x - 7, y - 3, x - 3, y, x, y - 6, x + 3, y, x + 7, y - 3, x + 6, y + 4]); g.fill();
      }
      let gr = g.createLinearGradient(0, T, 0, T + 90); gr.addColorStop(0, 'rgba(20,4,8,0.6)'); gr.addColorStop(1, 'rgba(20,4,8,0)');
      g.fillStyle = gr; g.fillRect(L, T, R - L, 90);
      gr = g.createLinearGradient(L, 0, R, 0); gr.addColorStop(0, 'rgba(255,200,120,0.1)'); gr.addColorStop(0.5, 'rgba(255,200,120,0)'); gr.addColorStop(1, 'rgba(20,4,8,0.35)');
      g.fillStyle = gr; g.fillRect(L, T, R - L, 300);
      // wainscot
      g.fillStyle = '#3a1a12'; g.fillRect(L, -62, R - L, 64);
      g.fillStyle = '#2a120c'; for (let x = L + 8; x < R; x += 58) { g.fillRect(x, -50, 46, 42); g.fillStyle = '#4a2418'; g.fillRect(x, -50, 46, 3); g.fillStyle = '#2a120c'; }
      g.fillStyle = GD.sh; g.fillRect(L, -66, R - L, 6); g.fillStyle = GD.base; g.fillRect(L, -66, R - L, 3); g.fillStyle = GD.hi; g.fillRect(L, -66, R - L, 1);
    });
    // frame shadow, frame, canvas
    const fx0 = -96, fx1 = 96, fy0 = -268, fy1 = -86;
    g.fillStyle = 'rgba(20,4,8,0.45)'; g.fillRect(fx0 + 8, fy0 + 10, fx1 - fx0, fy1 - fy0);
    ink(g, (g) => poly(g, [fx0, fy1, fx0, fy0, fx1, fy0, fx1, fy1]), GD.base, 3, (g) => {
      g.fillStyle = GD.sh; poly(g, [fx1, fy0, fx1, fy1, fx0, fy1, fx0 + 16, fy1 - 16, fx1 - 16, fy1 - 16, fx1 - 16, fy0 + 16]); g.fill();
      g.fillStyle = GD.hi; g.fillRect(fx0, fy0, fx1 - fx0, 3); g.fillRect(fx0, fy0, 3, fy1 - fy0);
      g.strokeStyle = GD.dk; g.lineWidth = 1.2; g.strokeRect(fx0 + 6, fy0 + 6, fx1 - fx0 - 12, fy1 - fy0 - 12);
      g.fillStyle = GD.dk; for (let x = fx0 + 12; x < fx1 - 6; x += 10) { g.beginPath(); g.arc(x, fy0 + 9, 1.4, 0, TAU); g.fill(); g.beginPath(); g.arc(x, fy1 - 9, 1.4, 0, TAU); g.fill(); }
    });
    for (const [x, y] of [[fx0, fy0], [fx1, fy0], [fx0, fy1], [fx1, fy1]]) ink(g, (g) => { g.beginPath(); g.arc(x, y, 9, 0, TAU); }, GD.base, 2, (g) => { g.fillStyle = GD.sh; g.beginPath(); g.arc(x + 3, y + 3, 8, 0, TAU); g.fill(); g.fillStyle = '#e8384a'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); });
    smallCrown(g, 0, fy0 - 2, 16, GD.base, GD.sh, KG.glass, 2.2);
    const cx0 = fx0 + 16, cx1 = fx1 - 16, cy0 = fy0 + 16, cy1 = fy1 - 16;
    g.save(); g.beginPath(); g.rect(cx0, cy0, cx1 - cx0, cy1 - cy0); g.clip();
    const bg = g.createLinearGradient(0, cy0, 0, cy1); bg.addColorStop(0, '#2a3a2a'); bg.addColorStop(1, '#14201a');
    g.fillStyle = bg; g.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
    g.fillStyle = 'rgba(160,220,140,0.18)'; g.beginPath(); g.ellipse(-20, cy0 + 40, 70, 50, 0, 0, TAU); g.fill();
    // painted drape
    g.fillStyle = '#6e1a28'; poly(g, [cx1, cy0, cx1 - 40, cy0, cx1 - 22, cy0 + 40, cx1 - 30, cy1, cx1, cy1]); g.fill();
    g.fillStyle = '#4a0e18'; poly(g, [cx1 - 14, cy0, cx1 - 8, cy1, cx1, cy1, cx1, cy0]); g.fill();
    // robe with ermine collar
    g.fillStyle = CR.base; g.beginPath(); g.ellipse(14, cy1 + 4, 82, 34, 0, Math.PI, TAU); g.fill();
    g.fillStyle = '#f4efe6'; g.beginPath(); g.ellipse(10, cy1 - 10, 62, 13, -0.05, 0, TAU); g.fill();
    g.fillStyle = '#1a1418'; for (const [x, y] of [[-30, -4], [-8, -8], [14, -6], [36, -9], [52, -4]]) poly(g, [x, cy1 + y - 3, x + 1.5, cy1 + y + 2, x - 1.5, cy1 + y + 2]), g.fill();
    // the King himself (smug, chin up)
    g.save(); g.translate(12, cy1 - 6); g.scale(0.6, 0.6);
    kingHead(g, KING, { lw: 3.2 });
    g.restore();
    // gold medallion
    ink(g, (g) => { g.beginPath(); g.arc(-6, cy1 - 8, 6, 0, TAU); }, GD.base, 1.6, (g) => { g.fillStyle = KG.glass; g.beginPath(); g.arc(-6, cy1 - 8, 2.4, 0, TAU); g.fill(); });
    // varnish sheen
    g.fillStyle = 'rgba(255,255,255,0.07)'; poly(g, [cx0, cy0, cx0 + 60, cy0, cx0, cy0 + 70]); g.fill();
    g.restore();
    // plaque
    ink(g, (g) => poly(g, [-40, fy1 + 6, 40, fy1 + 6, 40, fy1 + 24, -40, fy1 + 24]), GD.base, 2, (g) => {
      g.fillStyle = GD.sh; g.fillRect(10, fy1 + 4, 34, 22);
      g.strokeStyle = GD.dk; g.lineWidth = 1.3;
      polyline(g, [-30, fy1 + 13, -22, fy1 + 11, -14, fy1 + 14, -6, fy1 + 11, 2, fy1 + 14, 10, fy1 + 11, 18, fy1 + 13, 28, fy1 + 12]); g.stroke();
      polyline(g, [-20, fy1 + 19, -4, fy1 + 18, 12, fy1 + 19, 20, fy1 + 18]); g.stroke();
    });
    // candle sconces (live flames above them)
    for (const s of [-1, 1]) {
      const x = s * 116;
      ink(g, (g) => poly(g, [x - 6, -150, x + 6, -150, x + 3, -166, x - 3, -166]), GD.base, 1.8);
      strokeLine(g, [x, -150, x - s * 14, -136], 3, GD.sh);
      ink(g, (g) => poly(g, [x - 9, -170, x + 9, -170, x + 6, -164, x - 6, -164]), GD.base, 1.6);
      ink(g, (g) => poly(g, [x - 3, -186, x + 3, -186, x + 3, -170, x - 3, -170]), '#f2e8d0', 1.3);
    }
    // two little gold busts on pedestals (more vanity)
    for (const s of [-1, 1]) {
      const x = s * 160;
      ink(g, (g) => poly(g, [x - 14, 0, x - 14, -40, x + 14, -40, x + 14, 0]), OB.base, 2, (g) => { g.fillStyle = GD.base; g.fillRect(x - 14, -40, 28, 3); g.fillStyle = OB.sh; g.fillRect(x + 4, -38, 10, 40); });
      g.save(); g.translate(x + 6, -38); g.scale(-0.22 * s, 0.22);
      kingHead(g, { sc: GD.base, sh: GD.sh, hi: GD.hi, rim: GD.pale, horn: GD.base, hornSh: GD.sh, eye: GD.hi, eyeSh: GD.sh, tooth: GD.pale, crown: GD.base, crownSh: GD.sh, crownHi: GD.hi, flame: GD.base, flameSh: GD.sh, belly: GD.hi }, { lw: 5 });
      g.restore();
    }
  }
  // a giant gold bust of the King on a tall pedestal (stands behind the balustrade, in front of the vault)
  function drawKingBust(g) {
    g.save(); g.scale(0.78, 0.78);
    ink(g, (g) => poly(g, [-50, 4, -50, -96, 50, -96, 50, 4]), OB.base, 3, (g) => {
      g.fillStyle = OB.sh; g.fillRect(16, -100, 40, 110);
      g.fillStyle = rgba(OB.gloss, 0.5); g.fillRect(-42, -90, 2.4, 80);
      g.fillStyle = GD.base; g.fillRect(-50, -96, 100, 7); g.fillStyle = GD.hi; g.fillRect(-50, -96, 100, 1.6);
      g.fillStyle = GD.sh; g.fillRect(-50, -20, 100, 5);
      ink(g, (g) => poly(g, [-28, -70, 28, -70, 28, -40, -28, -40]), GD.sh, 1.4, (g) => { g.fillStyle = GD.base; g.fillRect(-28, -70, 56, 4); crownSigil(g, 0, -52, 22, GD.hi, GD.dk); });
    });
    ink(g, (g) => poly(g, [-58, -94, -58, -108, 58, -108, 58, -94]), OB.sh, 2.6, (g) => { g.fillStyle = GD.base; g.fillRect(-58, -108, 116, 4); });
    g.save(); g.translate(14, -104); g.scale(0.82, 0.82);
    kingHead(g, { sc: '#e2ad4a', sh: '#a87a2c', hi: '#ffe39a', rim: '#fff6d6', horn: '#e8b850', hornSh: '#a8782a', eye: '#fff0b0', eyeSh: '#c8962e',
      tooth: '#fff6d6', crown: '#ffd060', crownSh: '#b8842e', crownHi: '#fff6c8', flame: KG.glass, flameSh: KG.greenSh, belly: '#f2c86a' }, { lw: 3.4 });
    g.restore();
    g.restore();
  }

  // throne-room window bay: obsidian wall, arched opening filled with a gold grille (the lava cavern shows through)
  function drawGrilleBay(g) {
    const L = -205, R = 205, T = -366;
    const wall = '#3a2028', wallSh = '#26141a', wallHi = '#4e2c34';
    const hw = 92, spring = -214, sill = -40;
    ink(g, (g) => poly(g, [L, 2, L, T, R, T, R, 2]), wall, 0, (g) => {
      for (let y = 0, r = 0; y > T; y -= 46, r++) {
        const off = r % 2 ? 0 : 42;
        for (let x = L - off; x < R; x += 84) {
          const h = hash2(x | 0, r + 31);
          g.fillStyle = h < 0.3 ? wallSh : h > 0.84 ? wallHi : wall;
          g.fillRect(x + 1, y - 45, 82, 44);
        }
        g.fillStyle = '#160a0e'; g.fillRect(L, y - 1.2, R - L, 1.4);
        for (let x = L - off; x < R; x += 84) g.fillRect(x - 0.6, y - 46, 1.4, 46);
      }
      // lava light leaking round the window
      const lg = g.createRadialGradient(0, -150, 40, 0, -150, 220);
      lg.addColorStop(0, 'rgba(255,120,50,0.42)'); lg.addColorStop(1, 'rgba(255,100,40,0)');
      g.fillStyle = lg; g.fillRect(L, T, R - L, 370);
      const tg = g.createLinearGradient(0, T, 0, T + 120); tg.addColorStop(0, 'rgba(8,2,6,0.8)'); tg.addColorStop(1, 'rgba(8,2,6,0)');
      g.fillStyle = tg; g.fillRect(L, T, R - L, 120);
      // low wall under the sill
      g.fillStyle = '#28141a'; g.fillRect(L, sill, R - L, 42);
      g.fillStyle = GD.sh; g.fillRect(L, sill - 4, R - L, 6); g.fillStyle = GD.base; g.fillRect(L, sill - 4, R - L, 3); g.fillStyle = GD.hi; g.fillRect(L, sill - 4, R - L, 1);
    });
    // frame: obsidian surround + gold molding
    archPath(g, 0, sill, hw + 22, spring); g.fillStyle = LINE; g.fill();
    archPath(g, 0, sill, hw + 20, spring); g.fillStyle = '#24121a'; g.fill();
    archPath(g, 0, sill, hw + 9, spring); g.fillStyle = GD.sh; g.fill();
    archPath(g, 0, sill, hw + 6, spring); g.fillStyle = GD.base; g.fill();
    g.strokeStyle = GD.hi; g.lineWidth = 1.5; g.beginPath(); g.arc(0, spring, hw + 7, Math.PI * 1.05, Math.PI * 1.5); g.stroke();
    // cut the opening
    g.save(); g.globalCompositeOperation = 'destination-out';
    archPath(g, 0, sill, hw, spring); g.fillStyle = '#000'; g.fill();
    g.restore();
    // gold lattice
    g.save(); archPath(g, 0, sill, hw, spring); g.clip();
    const bars = (lw, col) => {
      g.strokeStyle = col; g.lineWidth = lw;
      for (let d = -400; d < 400; d += 30) {
        polyline(g, [d - 200, sill, d + 200, sill - 400]); g.stroke();
        polyline(g, [d + 200, sill, d - 200, sill - 400]); g.stroke();
      }
      polyline(g, [0, sill, 0, spring - hw]); g.stroke();
    };
    bars(6.5, LINE); bars(4, GD.sh); g.save(); g.translate(-0.8, -0.8); bars(1.4, GD.hi); g.restore();
    // rosettes at the crossings
    for (let y = sill - 15; y > spring - hw; y -= 15) for (let x = -hw + ((((sill - y) / 15) | 0) % 2 ? 0 : 15); x < hw; x += 30) {
      g.fillStyle = LINE; g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.fill();
      g.fillStyle = GD.base; g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fill();
    }
    g.restore();
    // crown tracery at the top of the arch + keystone
    ink(g, (g) => poly(g, [-22, spring - hw - 14, -26, spring - hw - 36, -12, spring - hw - 26, 0, spring - hw - 44, 12, spring - hw - 26, 26, spring - hw - 36, 22, spring - hw - 14]), GD.base, 2.4, (g) => {
      g.fillStyle = GD.sh; g.fillRect(6, spring - hw - 50, 24, 40); g.fillStyle = KG.glass; g.beginPath(); g.arc(0, spring - hw - 22, 3.6, 0, TAU); g.fill();
    });
    // the sill itself
    ink(g, (g) => poly(g, [-hw - 24, sill + 4, -hw - 24, sill - 4, hw + 24, sill - 4, hw + 24, sill + 4]), GD.sh, 2, (g) => { g.fillStyle = GD.base; g.fillRect(-hw - 24, sill - 4, 2 * hw + 48, 3); });
  }
  function drawThroneTop(g) {
    const L = -206, R = 206;
    g.fillStyle = '#0e0609'; g.fillRect(L, 0, R - L, 30);
    ink(g, (g) => { g.beginPath(); g.moveTo(L, 54); g.quadraticCurveTo(0, -10, R, 54); g.lineTo(R, 0); g.lineTo(L, 0); g.closePath(); }, '#24121a', 2.2, (g) => {
      g.strokeStyle = GD.sh; g.lineWidth = 5; g.beginPath(); g.moveTo(L, 58); g.quadraticCurveTo(0, -6, R, 58); g.stroke();
      g.strokeStyle = GD.hi; g.lineWidth = 1.2; g.beginPath(); g.moveTo(L, 55); g.quadraticCurveTo(0, -9, R, 55); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(L, 0, R - L, 12);
    });
  }
  // throne-room pillar: massive obsidian with a gold dragon coiling round it, torch bracket
  function drawThronePillar(g) {
    ink(g, (g) => poly(g, [-58, 4, -58, -20, -50, -34, 50, -34, 58, -20, 58, 4]), '#28141c', 3, (g) => {
      g.fillStyle = GD.base; g.fillRect(-58, -34, 116, 8); g.fillStyle = GD.hi; g.fillRect(-58, -34, 116, 2); g.fillStyle = '#160a10'; g.fillRect(22, -26, 40, 32);
    });
    ink(g, (g) => poly(g, [-42, -30, -40, -330, 40, -330, 42, -30]), '#34202a', 3, (g) => {
      g.fillStyle = '#20121a'; g.fillRect(12, -340, 34, 320); g.fillStyle = '#160a10'; g.fillRect(30, -340, 14, 320);
      g.fillStyle = rgba(OB.gloss, 0.45); g.fillRect(-30, -320, 2.4, 280);
      const lg = g.createLinearGradient(-42, 0, 42, 0); lg.addColorStop(0, 'rgba(255,110,50,0.3)'); lg.addColorStop(0.3, 'rgba(255,110,50,0)');
      g.fillStyle = lg; g.fillRect(-42, -330, 84, 300);
      // coiling gold dragon: front segments of a helix
      for (let k = 0; k < 4; k++) {
        const y = -50 - k * 72;
        const seg = (g) => { g.beginPath(); g.moveTo(-44, y); g.bezierCurveTo(-20, y - 4, 20, y - 26, 44, y - 36); g.lineTo(44, y - 52); g.bezierCurveTo(20, y - 42, -20, y - 20, -44, y - 16); g.closePath(); };
        g.save(); g.translate(1.2, 2); seg(g); g.fillStyle = LINE; g.fill(); g.restore();
        seg(g); g.fillStyle = GD.base; g.fill();
        g.save(); seg(g); g.clip(); g.fillStyle = GD.sh; g.fillRect(14, y - 60, 40, 70);
        g.strokeStyle = GD.dk; g.lineWidth = 1.1; for (let x = -36; x < 40; x += 8) { polyline(g, [x, y - 30, x + 4, y]); g.stroke(); }
        g.fillStyle = GD.hi; g.fillRect(-44, y - 18, 40, 1.8);
        g.restore();
        seg(g); g.strokeStyle = LINE; g.lineWidth = 1.6; g.stroke();
      }
    });
    // capital with the dragon's head peering out
    ink(g, (g) => poly(g, [-44, -326, -54, -340, -54, -352, 54, -352, 54, -340, 44, -326]), GD.base, 3, (g) => { g.fillStyle = GD.sh; g.fillRect(16, -356, 40, 32); g.fillStyle = GD.hi; g.fillRect(-54, -352, 70, 2); });
    ink(g, (g) => poly(g, [-36, -318, -60, -326, -74, -318, -62, -310, -40, -306]), GD.base, 2.4, (g) => { g.fillStyle = KG.glass; g.fillRect(-58, -322, 6, 3); g.fillStyle = GD.sh; g.fillRect(-74, -314, 40, 10); });
    ink(g, (g) => poly(g, [-52, -326, -48, -340, -42, -326]), GD.sh, 1.6);
    // torch bracket (crown-fire drawn live at (-38, -186))
    ink(g, (g) => poly(g, [-40, -150, -32, -150, -30, -172, -42, -172]), GD.sh, 1.8);
    ink(g, (g) => { g.beginPath(); g.moveTo(-50, -184); g.lineTo(-26, -184); g.lineTo(-30, -172); g.lineTo(-46, -172); g.closePath(); }, GD.base, 2, (g) => { g.fillStyle = '#3a7a3a'; g.fillRect(-48, -186, 20, 3); });
    // hanging crimson banner on the pillar face
    drawRoyalBanner(g, -26, -284, 52, 96, 2);
  }

  // the dais behind the throne (the engine draws the throne itself on the floor at DAIS_X)
  function drawDais(g) {
    const L = -300, R = 300;
    // back wall
    ink(g, (g) => poly(g, [L, 2, L, -400, R, -400, R, 2]), '#30182a', 0, (g) => {
      for (let y = 0, r = 0; y > -400; y -= 46, r++) {
        const off = r % 2 ? 0 : 40;
        for (let x = L - off; x < R; x += 80) { const h = hash2(x | 0, r + 51); g.fillStyle = h < 0.3 ? '#24121c' : h > 0.85 ? '#40243a' : '#30182a'; g.fillRect(x + 1, y - 45, 78, 44); }
        g.fillStyle = '#140810'; g.fillRect(L, y - 1.2, R - L, 1.4);
      }
      const tg = g.createLinearGradient(0, -400, 0, -250); tg.addColorStop(0, 'rgba(8,2,6,0.85)'); tg.addColorStop(1, 'rgba(8,2,6,0)');
      g.fillStyle = tg; g.fillRect(L, -400, R - L, 150);
      const lg = g.createLinearGradient(0, -200, 0, 0); lg.addColorStop(0, 'rgba(255,110,50,0)'); lg.addColorStop(1, 'rgba(255,120,60,0.18)');
      g.fillStyle = lg; g.fillRect(L, -200, R - L, 200);
    });
    // tapestry behind the throne: black-crimson with the King's sigil embroidered in gold
    const tw = 140, tT = -300, tB = -44;
    ink(g, (g) => poly(g, [-tw, tB, -tw, tT, tw, tT, tw, tB]), '#2c0c18', 2.6, (g) => {
      g.strokeStyle = 'rgba(224,173,72,0.25)'; g.lineWidth = 1;
      for (let x = -tw - 300; x < tw; x += 28) { polyline(g, [x, tB, x + 300, tT]); g.stroke(); polyline(g, [x + 300, tB, x, tT]); g.stroke(); }
      const sg = g.createRadialGradient(0, -170, 10, 0, -170, 140); sg.addColorStop(0, 'rgba(255,200,120,0.22)'); sg.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = sg; g.fillRect(-tw, tT, tw * 2, tB - tT);
      g.strokeStyle = GD.base; g.lineWidth = 3; g.strokeRect(-tw + 10, tT + 10, tw * 2 - 20, tB - tT - 20);
      g.strokeStyle = GD.sh; g.lineWidth = 1.2; g.strokeRect(-tw + 16, tT + 16, tw * 2 - 32, tB - tT - 32);
      crownSigil(g, 13, -147, 150, GD.dk, '#2c0c18', '#1e5a26');
      crownSigil(g, 10, -150, 150, GD.base, '#2c0c18', KG.green);
      g.strokeStyle = GD.dk; g.lineWidth = 1; g.globalAlpha = 0.6;
      for (const [x, y] of [[-26, -150], [-10, -142], [6, -132], [22, -122]]) { g.beginPath(); g.arc(x, y, 7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
      g.globalAlpha = 1;
    });
    // curtains gathered with gold ropes
    for (const s of [-1, 1]) {
      g.save(); g.scale(s, 1);
      const cur = (g) => { g.beginPath(); g.moveTo(126, -292); g.lineTo(214, -292); g.lineTo(220, -44); g.lineTo(120, -44); g.quadraticCurveTo(150, -110, 168, -156); g.quadraticCurveTo(140, -220, 126, -292); g.closePath(); };
      ink(g, cur, CR.base, 2.8, (g) => {
        g.strokeStyle = CR.sh; g.lineWidth = 7;
        for (const k of [0.25, 0.55, 0.85]) { g.beginPath(); g.moveTo(130 + k * 84, -292); g.quadraticCurveTo(156 + k * 50, -220, 170 + k * 34, -156); g.quadraticCurveTo(150 + k * 60, -100, 130 + k * 90, -44); g.stroke(); }
        g.strokeStyle = CR.hi; g.lineWidth = 2.4; g.beginPath(); g.moveTo(134, -292); g.quadraticCurveTo(148, -220, 168, -160); g.stroke();
        g.fillStyle = CR.dk; g.fillRect(200, -300, 30, 260);
      });
      ink(g, (g) => { g.beginPath(); g.ellipse(174, -156, 24, 7, -0.25, 0, TAU); }, GD.base, 2, (g) => { g.strokeStyle = GD.sh; g.lineWidth = 1.2; for (let x = -18; x < 22; x += 6) { polyline(g, [174 + x, -162, 178 + x, -150]); g.stroke(); } });
      strokeLine(g, [190, -152, 196, -122], 2.2, GD.sh);
      ink(g, (g) => poly(g, [190, -124, 202, -124, 206, -98, 186, -98]), GD.base, 1.8, (g) => { g.fillStyle = GD.sh; g.fillRect(198, -128, 12, 34); });
      g.restore();
    }
    // the crown canopy (valance) over the throne
    ink(g, (g) => { g.beginPath(); g.moveTo(-226, -292); for (let x = -226; x < 225; x += 28.25) g.quadraticCurveTo(x + 14, -262, x + 28.25, -292); g.lineTo(226, -306); g.lineTo(-226, -306); g.closePath(); }, CR.base, 2.6, (g) => {
      g.fillStyle = CR.sh; g.fillRect(-230, -292, 460, 40);
      g.fillStyle = CR.hi; g.fillRect(-230, -306, 460, 4);
    });
    for (let x = -226; x < 225; x += 28.25) { strokeLine(g, [x + 14, -276, x + 14, -262], 3, LINE); strokeLine(g, [x + 14, -276, x + 14, -263], 1.6, GD.base); }
    const tips = [[-196, 26], [-130, 40], [-64, 30], [0, 54], [64, 30], [130, 40], [196, 26]];
    ink(g, (g) => {
      g.beginPath(); g.moveTo(-232, -300);
      for (const [x, ht] of tips) { g.lineTo(x - 22, -330); g.lineTo(x, -330 - ht); g.lineTo(x + 22, -330); }
      g.lineTo(232, -330); g.lineTo(232, -300); g.closePath();
    }, GD.base, 3, (g) => {
      g.fillStyle = GD.sh; g.fillRect(-240, -312, 480, 14);
      for (const [x, ht] of tips) { g.fillStyle = GD.sh; poly(g, [x, -330 - ht, x + 22, -330, x + 3, -330]); g.fill(); g.fillStyle = rgba(GD.hi, 0.85); poly(g, [x - 16, -331, x - 2, -326 - ht, x - 6, -331]); g.fill(); }
      g.fillStyle = GD.hi; g.fillRect(-240, -330, 480, 2.4);
      for (let k = -3; k <= 3; k++) { g.fillStyle = k % 2 ? '#e8384a' : KG.glass; g.beginPath(); g.ellipse(k * 64, -316, 6, 5, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(k * 64 - 2.5, -319, 2, 1.6); }
    });
    for (const [x, ht] of tips) ink(g, (g) => { g.beginPath(); g.arc(x, -334 - ht, 5.5, 0, TAU); }, KG.glass, 1.6, (g) => { g.fillStyle = '#eaffd0'; g.fillRect(x - 2.5, -338 - ht, 2, 2); });
    // steps rising back from the floor's edge, a crimson runner up the middle
    const steps = [[0, -14, 290], [-14, -28, 268], [-28, -44, 246]];
    for (const [y0, y1, w] of steps.slice().reverse()) {
      ink(g, (g) => poly(g, [-w, y0 + 2, -w, y1, w, y1, w, y0 + 2]), '#3a2230', 2.4, (g) => {
        g.fillStyle = '#4e3040'; g.fillRect(-w, y1, w * 2, 4);
        g.fillStyle = GD.base; g.fillRect(-w, y1, w * 2, 2);
        g.fillStyle = '#28141e'; g.fillRect(w - 60, y1, 60, y0 - y1 + 2);
        g.fillStyle = CR.base; g.fillRect(-56, y1, 112, y0 - y1 + 2);
        g.fillStyle = CR.hi; g.fillRect(-56, y1, 112, 2.6);
        g.fillStyle = GD.base; g.fillRect(-58, y1, 3, y0 - y1 + 2); g.fillRect(55, y1, 3, y0 - y1 + 2);
      });
    }
  }

  // ------------------------------------------------------------------ GROUND (floor + back boundary), world coords
  function flagRows(y0, y1, hs) { const rows = []; let y = y0; for (const h of hs) { if (y >= y1) break; rows.push([y, Math.min(y1, y + h)]); y += h; } return rows; }
  // Paving that reads as a horizontal plane (see src/stage.js): constant stone width, rows foreshortened toward the back,
  // stone edges from (row, index) only => identical stones in every chunk. o.lo / o.hi give a stepped whole-stone edge.
  function drawPaving(g, x0, x1, rows, P, seed, o = {}) {
    const sw = o.w || 100, gap = o.gap || 1.5;
    const joint = mix(P.joint, P.stone, o.jointMix ?? 0.25);
    const ext = [];
    for (let r = 0; r < rows.length; r++) {
      const [ya, yb] = rows[r], rh = yb - ya;
      const lo = o.lo ? o.lo(r, ya, yb) : -Infinity, hi = o.hi ? o.hi(r, ya, yb) : Infinity;
      const off = hash1(r * 31 + seed) * sw;
      const edge = (i) => i * sw + off + (hash2(i, r * 7 + seed) - 0.5) * sw * 0.45;
      const merged = (i) => (i & 1) === 0 && hash2(i, r * 13 + seed) < (o.merge ?? 0.3) &&
        !(edge(i) < lo && edge(i + 2) > lo) && !(edge(i) < hi && edge(i + 2) > hi);
      const stones = [];
      let xs = Infinity, xe = -Infinity;
      for (let i = Math.floor((x0 - off) / sw) - 3; ; i++) {
        if ((i & 1) === 1 && merged(i - 1)) continue;
        const xa = edge(i), xb = edge(merged(i) ? i + 2 : i + 1);
        if (xa > x1 + 2) break;
        if (xb < x0 - 2) continue;
        let loose = false;
        if (xa < lo || xb > hi) {
          const d = xa < lo ? lo - xa : xb - hi, reach = sw * 2.4;
          if (xa < (o.min ?? -Infinity) || xb > (o.max ?? Infinity)) continue;
          if (!o.loose || d > reach || hash2(i, r * 17 + seed + 5) > o.loose * (1 - d / reach)) continue;
          loose = true;
        } else { xs = Math.min(xs, xa); xe = Math.max(xe, xb); }
        stones.push([i, xa, xb, loose]);
      }
      if (!o.lo && !o.hi) { xs = x0 - 2; xe = x1 + 2; }
      if (xe > xs) { g.fillStyle = joint; g.fillRect(Math.max(x0 - 2, xs), ya, Math.min(x1 + 2, xe) - Math.max(x0 - 2, xs), rh); }
      ext.push([ya, yb, xs, xe]);
      for (const [i, xa, xb, loose] of stones) {
        if (loose) { g.fillStyle = joint; roundRect(g, xa - 0.5, ya, xb - xa + 1, rh, 3); g.fill(); }
        const h = hash2(i * 3 + 1, r + seed * 5);
        const col = mix(P.stone, h < 0.5 ? P.stoneSh : P.stoneHi, Math.abs(h - 0.5) * (o.vary ?? 0.5));
        const sx = xa + gap, sww = xb - xa - gap * 2, sy = ya + gap * 0.8, sh = rh - gap * 1.6;
        g.fillStyle = col; roundRect(g, sx, sy, sww, sh, Math.min(3, rh * 0.12)); g.fill();
        const lip = Math.max(1.2, rh * 0.09);
        g.fillStyle = rgba(P.stoneHi, 0.32); g.fillRect(sx + 2, sy + 0.5, sww - 4, Math.max(1, rh * 0.05));
        g.fillStyle = rgba(P.stoneSh, 0.42); g.fillRect(sx + 1, sy + sh - lip, sww - 2, lip);
        if (h > 0.62) { g.fillStyle = rgba(P.stoneHi, 0.16); g.beginPath(); g.ellipse(sx + sww * h, sy + sh * 0.45, sww * 0.26, sh * 0.24, 0, 0, TAU); g.fill(); }
        if (h < 0.09) strokeLine(g, [sx + sww * 0.3, sy + 1, sx + sww * 0.4, sy + sh * 0.5, sx + sww * 0.34, sy + sh - 1], 1.1, rgba(P.joint, 0.55));
        if (o.each) o.each(g, sx, sy, sww, sh, h, r, i);
      }
    }
    return ext;
  }
  // clip to the right of the slanted threshold line x = X + 0.2 * (y - 362)
  function seamClip(g, X, x1) {
    const lx = (y) => X + 0.2 * (y - 362);
    g.beginPath(); g.moveTo(lx(GT0 - 40), GT0 - 40); g.lineTo(Math.max(x1, lx(H)) + 20, GT0 - 40); g.lineTo(Math.max(x1, lx(H)) + 20, H + 6); g.lineTo(lx(H + 6), H + 6); g.closePath(); g.clip();
  }
  function clipExt(g, ext, x0, x1) {
    g.beginPath(); g.rect(x0 - 2, GT0, x1 - x0 + 4, 362 - GT0);
    for (const [ya, yb, xs, xe] of ext) if (xe > xs) g.rect(xs, ya, xe - xs, yb - ya + (yb >= H ? 4 : 0));
    g.clip();
  }
  // polished stone: a soft diagonal gloss on some slabs
  const gloss = (a) => (g, sx, sy, w, h, hh) => {
    if (hh < 0.45) return;
    g.fillStyle = `rgba(220,206,240,${a * (hh - 0.35)})`;
    poly(g, [sx + w * 0.18, sy + 1, sx + w * 0.34, sy + 1, sx + w * 0.22, sy + h - 1, sx + w * 0.06, sy + h - 1]); g.fill();
  };
  function backShadow(g, x0, x1, a, col = '30,14,24') {
    const gr = g.createLinearGradient(0, 362, 0, 384);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x0, 362, x1 - x0, 22);
  }
  function frontBorder(g, x0, x1, P, goldA = 0.8) {
    g.fillStyle = mix(P.stone, P.stoneSh, 0.55); g.fillRect(x0, 522, x1 - x0, H - 522);
    g.fillStyle = rgba(P.joint, 0.9); g.fillRect(x0, 521, x1 - x0, 1.6);
    g.fillStyle = rgba(GD.sh, goldA); g.fillRect(x0, 522.6, x1 - x0, 3);
    g.fillStyle = rgba(GD.base, goldA); g.fillRect(x0, 522.6, x1 - x0, 1.6);
    for (let x = al(x0, 56) - 56; x < x1 + 56; x += 56) {
      g.fillStyle = rgba(P.joint, 0.75); g.fillRect(x, 526, 1.4, 14);
      g.fillStyle = rgba(P.stoneHi, 0.22); g.fillRect(x + 3, 527, 50, 1.2);
      g.fillStyle = rgba(GD.base, goldA * 0.8); poly(g, [x + 28, 529, x + 32, 533, x + 28, 537, x + 24, 533]); g.fill();
    }
  }
  // a gold-edged threshold strip along the slanted line where one floor meets the next (hides the cut stones)
  function threshold(g, X, x0, x1, P) {
    const lx = (y) => X + 0.2 * (y - 362);
    if (lx(H) + 20 < x0 || lx(362) - 20 > x1) return;
    const w0 = 8, w1 = 12, y1 = H + 2;
    const q = [lx(362) - w0, 362, lx(362) + w0, 362, lx(y1) + w1, y1, lx(y1) - w1, y1];
    ink(g, (g) => poly(g, q), mix(P.stone, OB.base, 0.6), 2, (g) => {
      g.fillStyle = rgba(OB.gloss, 0.18); poly(g, [lx(362) - w0 + 3, 362, lx(362) - w0 + 5, 362, lx(y1) - w1 + 7, y1, lx(y1) - w1 + 4, y1]); g.fill();
      for (const s of [-1, 1]) { g.strokeStyle = GD.base; g.lineWidth = 2; polyline(g, [lx(362) + s * (w0 - 2), 362, lx(y1) + s * (w1 - 3), y1]); g.stroke(); }
      for (let y = 376; y < H; y += 30) { const k = (y - 362) / (y1 - 362), w = lerp(w0, w1, k) * 0.5; g.fillStyle = GD.base; poly(g, [lx(y), y - w * 0.6, lx(y) + w, y, lx(y), y + w * 0.6, lx(y) - w, y]); g.fill(); g.fillStyle = GD.hi; g.fillRect(lx(y) - 1, y - 1.5, 1.4, 1.4); }
    });
  }

  function drawGround(g, xa, xb) {
    if (xa < PYL1 + 220) groundCaldera(g, xa, Math.min(xb, PYL1 + 220));
    if (xb > PYL1 - 120 && xa < PYL2 + 220) groundGates(g, Math.max(xa, PYL1 - 120), Math.min(xb, PYL2 + 220));
    if (xb > PYL2 - 120 && xa < PYL3 + 220) groundHalls(g, Math.max(xa, PYL2 - 120), Math.min(xb, PYL3 + 220));
    if (xb > PYL3 - 120) groundThrone(g, Math.max(xa, PYL3 - 120), xb);
  }

  // the obsidian causeway across the lava lake
  function groundCaldera(g, xa, xb) {
    const P = FP.cal;
    lineStyle(LINE_CAL, 0.62);
    const x0 = Math.floor(xa) - 2, x1 = Math.ceil(xb) + 2;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    drawPaving(g, x0, x1, flagRows(362, 520, [11, 14, 17, 21, 26, 32, 40]), P, 3, { w: 104, jointMix: 0.35, vary: 0.5 });
    // warm lava light from behind the parapet and from under the causeway's front edge
    let gr = g.createLinearGradient(0, 362, 0, 520);
    gr.addColorStop(0, 'rgba(255,120,60,0.16)'); gr.addColorStop(0.3, 'rgba(255,120,60,0)'); gr.addColorStop(0.7, 'rgba(255,110,50,0.02)'); gr.addColorStop(1, 'rgba(255,110,50,0.24)');
    g.fillStyle = gr; g.fillRect(x0, 362, x1 - x0, 160);
    // fallen ash drifts (soft, low contrast)
    for (let gx = al(x0, 120) - 240; gx < x1 + 240; gx += 120) {
      const h = hash2(gx, 61);
      if (h < 0.5) continue;
      const cx = gx + hash2(gx, 62) * 70, cy = 390 + hash2(gx, 63) * 116, rw = 20 + h * 34, rh = 3 + (cy - 362) * 0.03;
      const pts = [];
      for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU, r = 0.7 + 0.45 * hash2(gx + k, 64); pts.push(cx + Math.cos(a) * rw * r, cy + Math.sin(a) * rh * r); }
      blob(g, pts); g.fillStyle = 'rgba(170,154,166,0.28)'; g.fill();
    }
    // a few glowing cracks near the edges (not in the middle of the band)
    for (let x = al(x0, 130); x < x1 + 130; x += 130) {
      const h = hash1(x * 13 + 7);
      if (h < 0.62) continue;
      const R = mulberry(x | 0);
      let cx = x, cy = h < 0.8 ? 369 + R.r(0, 8) : 498 + R.r(0, 12);
      const pts = [cx, cy];
      for (let k = 0; k < 5; k++) { cx += R.r(5, 10); cy += R.r(-2.4, 2.4); pts.push(cx, cy); }
      strokeLine(g, pts, 2.2, 'rgba(24,8,12,0.75)');
      strokeLine(g, pts.slice(2, 8), 0.9, 'rgba(255,150,60,0.8)');
      strokeLine(g, [pts[4], pts[5], pts[4] + R.r(2, 6), pts[5] + R.r(3, 6)], 1.4, 'rgba(24,8,12,0.6)');
    }
    // front lip of the causeway with the lava glow below it
    const lip = (x) => 518 + 3 * Math.sin(x * 0.05) + 2 * Math.sin(x * 0.13 + 1);
    g.beginPath(); g.moveTo(al(x0, 6) - 6, H + 4);
    for (let x = al(x0, 6) - 6; x <= x1 + 6; x += 6) g.lineTo(x, lip(x));
    g.lineTo(x1 + 6, H + 4); g.closePath();
    g.fillStyle = '#2a1a20'; g.fill();
    g.save(); g.clip();
    for (let x = al(x0, 38) - 38; x < x1 + 38; x += 38) { g.fillStyle = hash1(x) < 0.5 ? '#35232a' : '#2e1e25'; g.fillRect(x + 1, 522, 36, 9); g.fillStyle = '#4a3238'; g.fillRect(x + 1, 522, 36, 1.4); }
    gr = g.createLinearGradient(0, 526, 0, H); gr.addColorStop(0, 'rgba(255,110,40,0)'); gr.addColorStop(1, 'rgba(255,140,50,0.9)');
    g.fillStyle = gr; g.fillRect(x0, 526, x1 - x0, H - 526);
    g.restore();
    g.beginPath(); for (let x = al(x0, 6) - 6; x <= x1 + 6; x += 6) g.lineTo(x, lip(x));
    g.lineWidth = 2.2 * LK; g.strokeStyle = LINE; g.stroke();
    // back parapet (stops at the gate pylon)
    const pa = x0 - 6, pb = Math.min(x1 + 6, PYL1 - 96);
    if (pb > pa) {
      const top = 330;
      ink(g, (g) => poly(g, [pa, 364, pa, top, pb, top, pb, 364]), '#3a2a33', 2.6, (g) => {
        for (let r = 0; r < 2; r++) {
          const ya = top + 6 + r * 14, yb = ya + 14;
          for (let x = al(pa, 52) - 52 - (r ? 26 : 0); x < pb + 52; x += 52) {
            const h = hash2(x | 0, r + 3);
            g.fillStyle = h < 0.3 ? '#2a1d25' : h > 0.8 ? '#4c3842' : '#3a2a33';
            g.fillRect(x + 1, ya + 1, 50, yb - ya - 2);
            g.fillStyle = rgba('#1a0e14', 0.7); g.fillRect(x + 1, yb - 3, 50, 2);
          }
        }
        g.fillStyle = GD.sh; g.fillRect(pa, top, pb - pa, 6); g.fillStyle = GD.base; g.fillRect(pa, top, pb - pa, 3); g.fillStyle = GD.hi; g.fillRect(pa, top, pb - pa, 1);
        const ul = g.createLinearGradient(0, top, 0, 364); ul.addColorStop(0, 'rgba(255,120,60,0.1)'); ul.addColorStop(1, 'rgba(20,6,12,0.3)');
        g.fillStyle = ul; g.fillRect(pa, top, pb - pa, 34);
      });
      strokeLine(g, [pa, top - 0.5, pb, top - 0.5], 1.4, 'rgba(255,170,80,0.6)');
      backShadow(g, pa, pb, 0.4);
    }
    g.restore();
  }

  // the palace's outer halls: polished obsidian with gold studs, pillar reflections, scorch marks under the fire heads
  function groundGates(g, xa, xb) {
    const P = FP.gat;
    lineStyle(LINE_GAT, 0.66);
    const x0 = Math.max(Math.floor(xa) - 2, PYL1 - 120), x1 = Math.min(Math.ceil(xb) + 2, PYL2 + 220);
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    const SX = PYL1 + 14;   // threshold line (slanted) where this floor starts over the previous one
    g.save(); seamClip(g, SX, x1);
    const studs = (g, sx, sy, w, h, hh, r, i) => {
      gloss(0.32)(g, sx, sy, w, h, hh);
      if ((r + i) % 2) return;
      const s = 2 + h * 0.08;
      g.fillStyle = GD.sh; poly(g, [sx - 1.5, sy - s * 0.6, sx - 1.5 + s, sy, sx - 1.5, sy + s * 0.6, sx - 1.5 - s, sy]); g.fill();
      g.fillStyle = GD.base; poly(g, [sx - 1.5, sy - s * 0.4, sx - 1.5 + s * 0.6, sy, sx - 1.5, sy + s * 0.2, sx - 1.5 - s * 0.6, sy]); g.fill();
    };
    const ext = drawPaving(g, x0, x1, flagRows(362, 522, [13, 16, 20, 25, 31, 38, 46]), P, 17, { w: 128, jointMix: 0.3, vary: 0.4, each: studs });
    g.save(); clipExt(g, ext, x0, x1);
    let gr = g.createLinearGradient(0, 362, 0, 522);
    gr.addColorStop(0, 'rgba(255,140,80,0.06)'); gr.addColorStop(0.5, 'rgba(200,190,230,0.05)'); gr.addColorStop(1, 'rgba(10,4,12,0.2)');
    g.fillStyle = gr; g.fillRect(x0, 362, x1 - x0, 160);
    // reflections of the pillars in the polished floor
    for (const px of [PYL1, ...G_PIL, PYL2]) {
      if (px + 60 < x0 || px - 60 > x1) continue;
      const w = px === PYL1 || px === PYL2 ? 80 : 30;
      gr = g.createLinearGradient(0, 364, 0, 450); gr.addColorStop(0, 'rgba(20,12,26,0.45)'); gr.addColorStop(1, 'rgba(20,12,26,0)');
      g.fillStyle = gr; g.fillRect(px - w, 364, w * 2, 86);
      gr = g.createLinearGradient(0, 364, 0, 430); gr.addColorStop(0, 'rgba(180,160,220,0.14)'); gr.addColorStop(1, 'rgba(180,160,220,0)');
      g.fillStyle = gr; g.fillRect(px - w + 6, 364, 3, 66);
      if (px !== PYL1 && px !== PYL2) { // gold reflections of the capital/base
        g.fillStyle = 'rgba(224,173,72,0.22)'; g.fillRect(px - 44, 366, 88, 3);
      }
    }
    // scorch marks in front of the fire statues (gameplay hint)
    for (const px of G_PIL) {
      if (px + 120 < x0 || px - 120 > x1) continue;
      g.save(); g.translate(px, 392); g.scale(1, 0.3);
      const sg = g.createRadialGradient(0, 0, 4, 0, 0, 92);
      sg.addColorStop(0, 'rgba(14,6,8,0.5)'); sg.addColorStop(0.6, 'rgba(14,6,8,0.22)'); sg.addColorStop(1, 'rgba(14,6,8,0)');
      g.fillStyle = sg; g.fillRect(-92, -92, 184, 184);
      g.restore();
    }
    // gold inlay line along the back
    g.fillStyle = 'rgba(224,173,72,0.55)'; g.fillRect(x0, 374, x1 - x0, 2);
    g.restore();
    frontBorder(g, x0, x1, P);
    backShadow(g, x0, x1, 0.5);
    g.restore();
    threshold(g, SX, x0, x1, P);
    g.restore();
  }

  // the treasure halls: warm marble, a long crimson carpet, spilled coins, a gold balustrade at the back
  function groundHalls(g, xa, xb) {
    const P = FP.hal;
    lineStyle(LINE_HAL, 0.62);
    const x0 = Math.max(Math.floor(xa) - 2, PYL2 - 120), x1 = Math.min(Math.ceil(xb) + 2, PYL3 + 220);
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    const SX = PYL2 + 14;   // threshold line (slanted) where this floor starts over the previous one
    g.save(); seamClip(g, SX, x1);
    const veins = (g, sx, sy, w, h, hh, r, i) => {
      if (hh > 0.55) return;
      g.strokeStyle = 'rgba(150,110,70,0.35)'; g.lineWidth = 0.9;
      const k = hash2(i, r + 5);
      curve(g, [sx + w * k, sy + 1, sx + w * (k + 0.12), sy + h * 0.5, sx + w * (k + 0.05), sy + h - 1]); g.stroke();
    };
    const ext = drawPaving(g, x0, x1, flagRows(362, 522, [13, 16, 20, 25, 31, 38, 46]), P, 29, { w: 136, jointMix: 0.45, vary: 0.35, each: veins });
    g.save(); clipExt(g, ext, x0, x1);
    let gr = g.createLinearGradient(0, 362, 0, 522);
    gr.addColorStop(0, 'rgba(255,214,140,0.16)'); gr.addColorStop(0.5, 'rgba(255,220,160,0)'); gr.addColorStop(1, 'rgba(80,40,30,0.14)');
    g.fillStyle = gr; g.fillRect(x0, 362, x1 - x0, 160);
    // pillar reflections
    for (const px of [PYL2, ...H_PIL, PYL3]) {
      if (px + 90 < x0 || px - 90 > x1) continue;
      gr = g.createLinearGradient(0, 364, 0, 430); gr.addColorStop(0, 'rgba(60,30,30,0.28)'); gr.addColorStop(1, 'rgba(60,30,30,0)');
      g.fillStyle = gr; g.fillRect(px - 32, 364, 64, 66);
    }
    // carpet runner
    const ca = Math.max(x0 - 4, PYL2 + 90), cb = Math.min(x1 + 4, PYL3 - 90);
    if (cb > ca) {
      const cT = 404, cB = 470;
      g.fillStyle = 'rgba(40,12,16,0.35)'; g.fillRect(ca + 2, cT + 3, cb - ca, cB - cT);
      g.fillStyle = '#8a1e30'; g.fillRect(ca, cT, cb - ca, cB - cT);
      g.fillStyle = '#9e2a3a'; g.fillRect(ca, cT + 12, cb - ca, 18);
      g.fillStyle = '#6e1424'; g.fillRect(ca, cB - 16, cb - ca, 10);
      for (const [y, h] of [[cT + 3, 4], [cB - 7, 4]]) {
        g.fillStyle = GD.sh; g.fillRect(ca, y, cb - ca, h); g.fillStyle = GD.base; g.fillRect(ca, y, cb - ca, h * 0.5);
      }
      g.fillStyle = 'rgba(224,173,72,0.55)';
      for (let x = al(ca, 16); x < cb; x += 16) { poly(g, [x, cT + 9, x + 4, cT + 11, x, cT + 13, x - 4, cT + 11]); g.fill(); poly(g, [x + 8, cB - 13, x + 12, cB - 11, x + 8, cB - 9, x + 4, cB - 11]); g.fill(); }
      // crown medallions woven into the runner every 300 px
      for (let x = al(ca, 300) + 150; x < cb + 300; x += 300) {
        if (x < PYL2 + 160 || x > PYL3 - 160) continue;
        g.save(); g.translate(x, 437); g.scale(1, 0.42);
        g.fillStyle = 'rgba(224,173,72,0.35)'; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.fill();
        g.fillStyle = '#8a1e30'; g.beginPath(); g.arc(0, 0, 25, 0, TAU); g.fill();
        g.restore();
        g.fillStyle = 'rgba(224,173,72,0.6)'; poly(g, [x - 14, 442, x - 15, 433, x - 7, 437, x, 429, x + 7, 437, x + 15, 433, x + 14, 442]); g.fill();
      }
      g.strokeStyle = 'rgba(60,10,20,0.5)'; g.lineWidth = 1.4;
      for (const y of [cT, cB]) { polyline(g, [ca, y, cb, y]); g.stroke(); }
      // fringes at the ends
      for (const [ex, d] of [[ca, -1], [cb, 1]]) if (Math.abs(ex - (d < 0 ? PYL2 + 90 : PYL3 - 90)) < 1) {
        g.strokeStyle = GD.base; g.lineWidth = 1.6;
        for (let y = cT + 2; y < cB; y += 4) { polyline(g, [ex, y, ex + d * 7, y + 1]); g.stroke(); }
      }
    }
    // spilled coins near the back edge (drifting out from under the balustrade)
    for (let x = al(x0, 7) - 7; x < x1 + 7; x += 7) {
      const h = hash1(x * 3 + 11);
      const nearPil = [PYL2, ...H_PIL, PYL3].some((px) => Math.abs(px - x) < 50);
      if (h < (nearPil ? 0.9 : 0.5)) continue;
      const y = 365 + (h - 0.5) ** 2 * 80 * hash1(x * 5);
      g.fillStyle = '#9a6a24'; g.beginPath(); g.ellipse(x + 0.6, y + 0.8, 3.4, 1.4, 0, 0, TAU); g.fill();
      g.fillStyle = h > 0.8 ? '#ffe08a' : '#e8b84c'; g.beginPath(); g.ellipse(x, y, 3.4, 1.4, 0, 0, TAU); g.fill();
    }
    for (let x = al(x0, 61); x < x1 + 61; x += 61) { // a few stray coins/gems further out
      const h = hash1(x * 7 + 3);
      if (h < 0.8) continue;
      const y = 392 + hash1(x * 11) * 120;
      if (y > 400 && y < 474) continue;
      if (h > 0.95) { g.fillStyle = '#e8384a'; poly(g, [x, y - 3, x + 3, y, x, y + 2, x - 3, y]); g.fill(); }
      else { g.fillStyle = '#9a6a24'; g.beginPath(); g.ellipse(x + 0.6, y + 0.8, 3.6, 1.5, 0, 0, TAU); g.fill(); g.fillStyle = '#ffd870'; g.beginPath(); g.ellipse(x, y, 3.6, 1.5, 0, 0, TAU); g.fill(); }
    }
    g.restore();
    frontBorder(g, x0, x1, P, 0.9);
    backShadow(g, x0, x1, 0.3, '70,30,20');
    // gold balustrade between the pillars (not in front of the portrait wall)
    const segs = [];
    const posts = [PYL2, ...H_PIL, PYL3];
    for (let k = 0; k < posts.length - 1; k++) {
      const a = posts[k] + (k === 0 ? 100 : 48), b = posts[k + 1] - (k === posts.length - 2 ? 100 : 48);
      const bayX = (posts[k] + posts[k + 1]) / 2;
      if (H_BAYS.some(([x, t]) => t === 'portrait' && Math.abs(x - bayX) < 10)) continue;
      segs.push([a, b]);
    }
    for (const [a, b] of segs) {
      if (b < x0 - 10 || a > x1 + 10) continue;
      const top = 318;
      // balusters
      for (let x = a + 12; x < b - 6; x += 18) {
        ink(g, (g) => { g.beginPath(); g.moveTo(x - 3, 356); g.quadraticCurveTo(x - 9, 344, x - 3.5, 334); g.lineTo(x - 2.5, 328); g.lineTo(x + 2.5, 328); g.lineTo(x + 3.5, 334); g.quadraticCurveTo(x + 9, 344, x + 3, 356); g.closePath(); }, GD.base, 1.6, (g) => {
          g.fillStyle = GD.sh; g.fillRect(x + 1, 326, 10, 32); g.fillStyle = GD.hi; g.fillRect(x - 5, 336, 1.6, 10);
        });
      }
      // coins heaped behind / spilling through
      for (let x = a; x < b; x += 5) {
        const h = hash1(x * 7 + 1);
        if (h < 0.45) continue;
        g.fillStyle = '#b8862e'; g.beginPath(); g.ellipse(x + 0.6, 357 - h * 6 + 0.8, 3.4, 1.4, 0, 0, TAU); g.fill();
        g.fillStyle = h > 0.85 ? '#fff0a8' : '#f2c860'; g.beginPath(); g.ellipse(x, 357 - h * 6, 3.4, 1.4, 0, 0, TAU); g.fill();
      }
      ink(g, (g) => poly(g, [a - 6, 364, a - 6, 355, b + 6, 355, b + 6, 364]), '#3a2418', 2.2, (g) => { g.fillStyle = GD.sh; g.fillRect(a - 6, 355, b - a + 12, 2); });
      ink(g, (g) => poly(g, [a - 8, top + 10, a - 8, top, b + 8, top, b + 8, top + 10]), GD.base, 2.4, (g) => {
        g.fillStyle = GD.sh; g.fillRect(a - 8, top + 6, b - a + 16, 4); g.fillStyle = GD.hi; g.fillRect(a - 8, top, b - a + 16, 1.6);
      });
      for (const px of [a - 8, b + 8]) ink(g, (g) => poly(g, [px - 9, 364, px - 9, top - 8, px + 9, top - 8, px + 9, 364]), GD.base, 2.4, (g) => {
        g.fillStyle = GD.sh; g.fillRect(px + 2, top - 10, 10, 80); g.fillStyle = GD.hi; g.fillRect(px - 9, top - 8, 18, 1.6);
        g.fillStyle = KG.glass; g.beginPath(); g.arc(px, top + 14, 2.4, 0, TAU); g.fill();
      });
      for (const px of [a - 8, b + 8]) ink(g, (g) => { g.beginPath(); g.arc(px, top - 13, 6, 0, TAU); }, GD.base, 1.8, (g) => { g.fillStyle = GD.sh; g.beginPath(); g.arc(px + 2, top - 11, 5, 0, TAU); g.fill(); });
    }
    g.restore();
    threshold(g, SX, x0, x1, P);
    g.restore();
  }

  // the Ember Throne room: dark crimson obsidian, a low-contrast gold crown medallion, lava light through the grilles
  function groundThrone(g, xa, xb) {
    const P = FP.thr;
    lineStyle(LINE_THR, 0.66);
    const x0 = Math.max(Math.floor(xa) - 2, PYL3 - 120), x1 = Math.ceil(xb) + 2;
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    const SX = PYL3 + 14;   // threshold line (slanted) where this floor starts over the previous one
    g.save(); seamClip(g, SX, x1);
    const ext = drawPaving(g, x0, x1, flagRows(362, 522, [14, 18, 23, 29, 36, 44]), P, 41, { w: 150, jointMix: 0.3, vary: 0.4, each: gloss(0.26) });
    g.save(); clipExt(g, ext, x0, x1);
    let gr = g.createLinearGradient(0, 362, 0, 522);
    gr.addColorStop(0, 'rgba(255,120,60,0.1)'); gr.addColorStop(0.5, 'rgba(255,120,60,0)'); gr.addColorStop(1, 'rgba(10,2,6,0.22)');
    g.fillStyle = gr; g.fillRect(x0, 362, x1 - x0, 160);
    // lava light falling through the grilles
    for (const wx of T_WIN) {
      if (wx + 160 < x0 || wx - 160 > x1) continue;
      g.save(); g.translate(wx + 20, 400); g.scale(1, 0.32);
      const lg = g.createRadialGradient(0, 0, 6, 0, 0, 150);
      lg.addColorStop(0, 'rgba(255,130,60,0.26)'); lg.addColorStop(1, 'rgba(255,110,50,0)');
      g.fillStyle = lg; g.fillRect(-150, -150, 300, 300);
      g.restore();
      g.strokeStyle = 'rgba(30,8,12,0.16)'; g.lineWidth = 3;
      for (let k = -4; k <= 4; k++) { polyline(g, [wx + k * 18, 366, wx + k * 26 + 40, 430]); g.stroke(); }
    }
    for (const px of [PYL3, ...T_PIL]) {
      if (px + 60 < x0 || px - 60 > x1) continue;
      gr = g.createLinearGradient(0, 364, 0, 446); gr.addColorStop(0, 'rgba(14,4,10,0.42)'); gr.addColorStop(1, 'rgba(14,4,10,0)');
      g.fillStyle = gr; g.fillRect(px - 44, 364, 88, 82);
      g.fillStyle = 'rgba(224,173,72,0.2)'; g.fillRect(px - 56, 366, 112, 3);
    }
    // arena: a soft lift of value + a carved crown medallion (low contrast)
    const AX = 6720;
    if (x1 > AX - 420 && x0 < AX + 420) {
      g.save(); g.translate(AX, 446); g.scale(1, 0.3);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 420);
      rg.addColorStop(0, 'rgba(255,200,170,0.13)'); rg.addColorStop(0.55, 'rgba(255,190,160,0.07)'); rg.addColorStop(1, 'rgba(255,190,160,0)');
      g.fillStyle = rg; g.fillRect(-420, -420, 840, 840);
      g.strokeStyle = 'rgba(224,173,72,0.32)'; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 276, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(16,4,8,0.35)'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 264, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 288, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(224,173,72,0.18)'; g.lineWidth = 4;
      for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; polyline(g, [Math.cos(a) * 200, Math.sin(a) * 200, Math.cos(a) * 250, Math.sin(a) * 250]); g.stroke(); }
      g.beginPath(); g.arc(0, 0, 196, 0, TAU); g.stroke();
      g.restore();
      g.save(); g.translate(AX, 446); g.scale(1, 0.3);
      crownSigil(g, 10, 40, 300, 'rgba(224,173,72,0.16)', 'rgba(224,173,72,0.0)');
      g.restore();
    }
    g.restore();
    frontBorder(g, x0, x1, P);
    backShadow(g, x0, x1, 0.55, '16,4,10');
    g.restore();
    threshold(g, SX, x0, x1, P);
    g.restore();
  }

  // ------------------------------------------------------------------ foreground pass sprites (p 1.25, darkened)
  function buildFront(cs) {
    const fr = [];
    lineStyle('#140a10', 0.85);
    // palace threshold: a great obsidian column with gold bands
    const fCol = makeSprite(130, 620, 65, 600, cs, (g) => {
      ink(g, (g) => poly(g, [-40, 20, -40, -600, 40, -600, 40, 20]), OB.base, 3.5, (g) => {
        g.fillStyle = OB.sh; g.fillRect(10, -610, 34, 640);
        g.fillStyle = rgba(OB.gloss, 0.55); g.fillRect(-28, -600, 3, 620);
        for (const y of [-140, -380]) { g.fillStyle = GD.sh; g.fillRect(-40, y - 10, 80, 20); g.fillStyle = GD.base; g.fillRect(-40, y - 10, 80, 8); }
        const lg = g.createLinearGradient(-40, 0, 0, 0); lg.addColorStop(0, 'rgba(255,120,60,0.45)'); lg.addColorStop(1, 'rgba(255,120,60,0)');
        g.fillStyle = lg; g.fillRect(-40, -600, 40, 620);
      });
    });
    // gates: a crimson banner hanging from above
    const fBanner = makeSprite(130, 300, 65, 10, cs, (g) => {
      ink(g, (g) => poly(g, [-60, -12, 60, -12, 60, 2, -60, 2]), GD.sh, 3);
      drawRoyalBanner(g, -46, 4, 92, 250, 3);
    });
    // halls: a heap of treasure in the bottom corner
    const fHeap = makeSprite(460, 210, 230, 190, cs, (g) => {
      g.save(); g.translate(0, -362); drawMound(g, { x: 0, w: 420, top: 192, seed: 77, back: false }); g.restore();
    });
    // throne approach: rough rock column with a gold chain wrapped round it
    const fRock = makeSprite(160, 620, 80, 600, cs, (g) => {
      const R = mulberry(91);
      const l = mdp([-50, 20], [-38, -600], R, 4, 0.04), r = mdp([44, -600], [54, 20], R, 4, 0.04);
      ink(g, (g) => poly(g, flat(l.concat(r))), '#3a2028', 3.5, (g) => {
        g.fillStyle = '#26121a'; g.fillRect(8, -620, 60, 660);
        const lg = g.createLinearGradient(-50, 0, -10, 0); lg.addColorStop(0, 'rgba(255,120,50,0.5)'); lg.addColorStop(1, 'rgba(255,120,50,0)');
        g.fillStyle = lg; g.fillRect(-56, -600, 50, 620);
        for (let y = -560; y < 0; y += 60) { strokeLine(g, [-30, y, -14, y + 22, -24, y + 40], 1.6, 'rgba(14,4,8,0.6)'); }
        for (let k = 0; k < 6; k++) { const y = -420 + k * 40; ink(g, (g) => { g.beginPath(); g.ellipse(0, y, 50, 9, -0.2, 0, Math.PI); }, null, 0); g.strokeStyle = LINE; g.lineWidth = 7; g.beginPath(); g.ellipse(0, y, 50, 9, -0.2, 0.1, Math.PI - 0.1); g.stroke(); g.strokeStyle = GD.base; g.lineWidth = 4; g.stroke(); }
      });
    });
    for (const [spr, a] of [[fCol, 0.4], [fBanner, 0.3], [fHeap, 0.55], [fRock, 0.42]]) {
      const g = spr.c.getContext('2d');
      if (!g) continue;                    // (a sprite the memory cap left empty)
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(20,6,12,${a})`; g.fillRect(0, 0, spr.c.width, spr.c.height);
    }
    fr.push({ spr: fCol, wx: 1700, y: 560 }, { spr: fBanner, wx: 3030, y: -8 }, { spr: fHeap, wx: 4330, y: 606 }, { spr: fRock, wx: 5900, y: 560 });
    return { list: fr };
  }

  // ------------------------------------------------------------------ props (built at the full device scale)
  function buildItems(s) {
    const it = {};
    lineStyle(INK, 1);
    for (const k of Object.keys(PROP_INFO)) {
      const info = PROP_INFO[k];
      const frames = k === 'chest' ? CHEST_FRAMES : 1;
      it[k] = [];
      for (let f = 0; f < frames; f++) {
        const open = frames > 1 ? f / (frames - 1) : 0;
        const spr = makeSprite(info.w + 40, info.h + 70, info.w / 2 + 20, info.h + 60, s, (g) => PROP_DRAW[k](g, open));
        const white = makeSprite(info.w + 40, info.h + 70, info.w / 2 + 20, info.h + 60, s, (g) => {
          g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(spr.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, spr.c.width, spr.c.height);
        });
        it[k].push({ spr, white });
      }
    }
    it.shine = radialSprite(16, s, [[0, 'rgba(255,255,255,0.9)'], [0.3, 'rgba(255,250,230,0.4)'], [1, 'rgba(255,250,230,0)']]);
    it.gold = radialSprite(40, s, [[0, 'rgba(255,230,140,0.75)'], [0.4, 'rgba(255,190,80,0.3)'], [1, 'rgba(255,160,60,0)']]);
    return it;
  }

  // ------------------------------------------------------------------ per-frame drawing
  // section weights at the camera centre (smooth across the pylons)
  function zone(camX) {
    const c = camX + W / 2;
    const a = sstep(PYL1 - 260, PYL1 + 260, c), b = sstep(PYL2 - 260, PYL2 + 260, c), d = sstep(PYL3 - 260, PYL3 + 260, c);
    return { cal: 1 - a, gat: a - b, hal: b - d, thr: d };
  }
  function clipSection(ctx, wa, wb, camX) {
    const a = Math.max(0, wa - camX), b = Math.min(W, wb - camX);
    if (b <= a) return false;
    ctx.save(); ctx.beginPath(); ctx.rect(a, 0, b - a, 372); ctx.clip();
    return true;
  }

  // the wall-base uplight (readability: the fighters' outlines over the dark wall base), one room at a time: the base
  // band (no walkable spot goes dark) with the black statue plinths cut out (they stay black stone) and most of it cut
  // away under the green glows, built in a strip canvas and screened over the backdrop (R.span: only over that stretch
  // of the level, faded in / out over R.fade px); then the ember pools at the room's fires, a dark contact line where
  // the lane meets the wall, and the curse's green glow at the statues' feet, last and additive
  function wallLight(ctx, camX, t, A, R) {
    const S = C.bandStrip, sg = S && S.getContext('2d');
    if (!sg) return;                       // (no band canvas: the memory cap -- the wall light is left out)
    const kx = S.width / W, ky = S.height / 182;
    const P = R.plinth, G = R.glow;
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1;
    sg.clearRect(0, 0, S.width, S.height);
    sg.setTransform(kx, 0, 0, ky, 0, -212 * ky);
    sg.drawImage(C.backLight.c, 0, 0, W, H);
    sg.globalCompositeOperation = 'destination-out';
    let a0 = -1e4, a1 = 1e4;
    if (R.span) {                                             // (only over the room's stretch, feathered in and out)
      a0 = R.span[0] - camX; a1 = R.span[1] - camX;
      const f = R.fade, fl = sg.createLinearGradient(a0, 0, a0 + f, 0), fr = sg.createLinearGradient(a1 - f, 0, a1, 0);
      fl.addColorStop(0, '#000'); fl.addColorStop(1, 'rgba(0,0,0,0)'); fr.addColorStop(0, 'rgba(0,0,0,0)'); fr.addColorStop(1, '#000');
      sg.fillStyle = '#000'; sg.fillRect(-10, 212, Math.max(0, a0 + 10), 182); sg.fillRect(a1, 212, W + 10 - Math.min(W, a1), 182);
      sg.fillStyle = fl; sg.fillRect(a0, 212, f, 182); sg.fillStyle = fr; sg.fillRect(a1 - f, 212, f, 182);
    }
    for (const [wx, kind] of R.pools) {
      const sx = wx - camX;
      if (kind !== 'venom' || sx < -G.rx || sx > W + G.rx) continue;
      sg.globalAlpha = 1 - L4P.plinth; sg.fillStyle = '#000'; sg.fillRect(sx - P.hw, P.y, P.hw * 2, P.h); sg.globalAlpha = 1;   // the plinth
      sg.drawImage(C.holeGlow.c, sx - G.rx, G.cy - G.h / 2, G.rx * 2, G.h);                    // the glow's ground
    }
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = Math.min(1, A * L4P.base * (R.base || 1));
    ctx.drawImage(S, 0, 212, W, 182);
    for (const [wx, kind, k] of R.pools) {                      // the ember pools at the room's fires (flickering)
      const sx = wx - camX;
      if ((kind !== 'ember' && kind !== 'arch') || sx < -240 || sx > W + 240) continue;
      ctx.globalAlpha = A * k * (1 + 0.05 * Math.sin(t * 1.3 + wx) + 0.04 * Math.sin(t * 2.9 + wx * 0.7));
      // ('arch': the lava's glow up inside a bay's opening -- the pool raised 90 px, its peak up at a guard's head)
      ctx.drawImage(C.poolEmber.c, sx - 230, kind === 'arch' ? 122 : 212, 460, 182);
    }
    if (R.lineLast) greenGlow(ctx, camX, t, A, R);              // (the contact line drawn over the green: critics)
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = A;                                        // the lane's back edge: a dark contact line
    const cl = ctx.createLinearGradient(0, 356, 0, 368);
    cl.addColorStop(0, 'rgba(26,10,18,0)'); cl.addColorStop(0.5, 'rgba(26,10,18,0.8)'); cl.addColorStop(1, 'rgba(26,10,18,0)');
    ctx.fillStyle = cl;
    if (R.span) {                                               // (faded in / out with the band)
      const c0 = Math.max(0, a0), c1 = Math.min(W, a1);
      for (let x = c0; x < c1; x += 16) {
        const u = Math.min(1, (x + 8 - a0) / R.fade, (a1 - x - 8) / R.fade);
        ctx.globalAlpha = A * Math.max(0, u); ctx.fillRect(x, 356, Math.min(16, c1 - x), 12);
      }
    } else ctx.fillRect(0, 356, W, 12);
    ctx.globalCompositeOperation = 'lighter';
    for (const [wx, kind, k] of R.pools) {                      // ('floor': a fire's warm pool on the floor in front)
      const sx = wx - camX;
      if (kind !== 'floor' || sx < -120 || sx > W + 120) continue;
      ctx.globalAlpha = A * k * (1 + 0.06 * Math.sin(t * 2.3 + wx));
      ctx.drawImage(C.glowWarm.c, sx - 105, 394 - 26, 210, 52);
    }
    if (!R.lineLast) greenGlow(ctx, camX, t, A, R);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function greenGlow(ctx, camX, t, A, R) {                      // the curse's glow at the statues' feet (additive)
    const G = R.glow;
    ctx.globalCompositeOperation = 'lighter';
    for (const [wx, kind] of R.pools) {
      const sx = wx - camX;
      if (kind !== 'venom' || sx < -G.rx || sx > W + G.rx) continue;
      ctx.globalAlpha = A * L4P.green * G.k * (1 + 0.06 * Math.sin(t * 1.7 + wx * 1.3 + 2));
      ctx.drawImage(C[G.spr].c, sx - G.rx, G.cy - G.h / 2, G.rx * 2, G.h);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  function drawBack(ctx, camX, t = 0) {
    if (!C) { released = false; setScale(S || 1); }
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    const z = zone(camX);
    // --- the caldera (outdoors), left of the palace gate
    if (clipSection(ctx, -1000, PYL1, camX)) {
      ctx.drawImage(C.sky.c, 0, 0, W, 372);
      for (const { sm, spr } of C.smoke) {
        let x = (sm.x - camX * 0.05 - t * sm.sp) % SMOKE_PERIOD;
        if (x < 0) x += SMOKE_PERIOD;
        x -= 300;
        if (x - spr.ox > W || x - spr.ox + spr.w < 0) continue;
        ctx.drawImage(spr.c, snap(x - spr.ox), sm.y - spr.oy, spr.w, spr.h);
      }
      drawStrip(ctx, C.far, camX);
      drawFarFalls(ctx, camX, t);
      drawStrip(ctx, C.mid, camX);
      drawWhelps(ctx, camX, t);
      drawStrip(ctx, C.lakeFar, camX);
      drawStrip(ctx, C.lakeNear, camX);
      drawLakeLive(ctx, camX, t);
      for (const o of C.islands) {
        const sx = o.lx - camX * P_LAKEN;
        if (sx - o.spr.ox > W || sx - o.spr.ox + o.spr.w < 0) continue;
        ctx.drawImage(o.spr.c, snap(sx - o.spr.ox), o.y - o.spr.oy, o.spr.w, o.spr.h);
      }
      ctx.restore();
    }
    // --- interiors: deep layers, each clipped to its section
    if (clipSection(ctx, PYL1, PYL2, camX)) { drawStrip(ctx, C.gDeep, camX); ctx.restore(); }
    if (clipSection(ctx, PYL2, PYL3, camX)) { drawStrip(ctx, C.hDeep, camX); drawVaultLive(ctx, camX, t); ctx.restore(); }
    if (clipSection(ctx, PYL3, LEVEL_LEN + 100, camX)) { drawStrip(ctx, C.tDeep, camX); drawCavernLive(ctx, camX, t); ctx.restore(); }
    // --- near walls, ceiling bands, pillars / pylons / dais
    drawSprites(ctx, C.near.bays, camX);
    drawSprites(ctx, C.near.tops, camX);
    drawSprites(ctx, C.near.pillars, camX);
    for (const l of C.near.liveBack) if (l.x1 > camX - 40 && l.x0 < camX + W + 40) l.draw(ctx, camX, t);
    // --- ground tiles
    drawStrip(ctx, C.ground, camX);
    // --- near front sprites + live
    drawSprites(ctx, C.near.front, camX);
    for (const l of C.near.liveFront) if (l.x1 > camX - 40 && l.x0 < camX + W + 40) l.draw(ctx, camX, t);
    // --- the wall-base uplight (readability: the fighters' outlines over the dark wall base)
    if (L4FIX.has('light')) {
      if (z.thr > 0.01) wallLight(ctx, camX, t, z.thr * (1 - 0.4 * warm), ROOM_THR);
      if (camX + W > GATES_SPAN[0] && camX < GATES_SPAN[1]) wallLight(ctx, camX, t, 1 - 0.4 * warm, ROOM_GAT);
    }
    // --- the causeway's back edge (L4 x 0 - 1640): the dark stone between the lava lake and the lane, lit by the lava
    //     behind it -- about +7 L* where the fighters' legs cross it (painted hero review: Dodongo 14.1 % lost at camX 0)
    if (L4FIX.has('light') && z.cal > 0.01 && clipSection(ctx, -1000, PYL1, camX)) {
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = z.cal;
      ctx.drawImage(C.calEdge.c, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.restore();
    }
    // --- crown-light shafts in the throne room
    if (z.thr > 0.01) drawShafts(ctx, camX, t, [[6030, 0.55], [DAIS_X - 20, 0.75]]);
    // --- the curse lifting: warm grade over the palace
    if (warm > 0) {
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,186,110,${0.16 * warm})`; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    const thrVig = L4FIX.has('vig');                              // (the throne room's own vignette shape)
    const vA = (0.28 * z.cal + 0.42 * z.gat + 0.22 * z.hal + (thrVig ? 0 : 0.5 * z.thr)) * (1 - 0.6 * warm);
    if (vA > 0.01) { ctx.globalAlpha = vA; ctx.drawImage(C.vignette.c, 0, 0, W, H); ctx.globalAlpha = 1; }
    const vT = thrVig ? 0.5 * z.thr * (1 - 0.6 * warm) : 0;
    if (vT > 0.01) { ctx.globalAlpha = vT; ctx.drawImage(C.vignetteThr.c, 0, 0, W, H); ctx.globalAlpha = 1; }
    // --- back ash / embers
    drawParticles(ctx, camX, t, 0, 1, z);
    ctx.restore();
  }

  function drawFront(ctx, camX, t = 0, opts = {}) {
    if (!C) { released = false; setScale(S || 1); }
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    for (const o of C.front.list) {
      const sx = 480 + (o.wx - (camX + 480)) * P_FRONT;
      if (sx + o.spr.w < -20 || sx - o.spr.w > W + 20) continue;
      // (a hero, a pickup or a chest behind it: it fades to ~35%, easing -- opts.see, World.render)
      const x0 = sx - o.spr.ox, y0 = o.y - o.spr.oy, hid = (opts.see || []).some((q) => q.x + q.w / 2 > x0 + 6 && q.x - q.w / 2 < x0 + o.spr.w - 6 && q.y1 > y0 && q.y0 < y0 + o.spr.h);
      o.fade = (o.fade ?? 1) + ((hid ? 0.35 : 1) - (o.fade ?? 1)) * 0.18;
      ctx.globalAlpha = o.fade;
      ctx.drawImage(o.spr.c, snap(x0), y0, o.spr.w, o.spr.h);
      ctx.globalAlpha = 1;
    }
    drawParticles(ctx, camX, t, 2, 2, zone(camX));
    ctx.restore();
  }

  function drawStrip(ctx, st, camX) {
    for (const ch of st.chunks) {
      const sx = ch.x - camX * st.p;
      if (sx > W || sx + ch.w < 0) continue;
      if (!ch.c) { ctx.save(); ctx.translate(sx - ch.x, 0); ch.paint(ctx); ctx.restore(); continue; }   // (no cache: live)
      ctx.drawImage(ch.c, snap(sx), st.y0, ch.w, ch.h);
    }
  }
  function drawSprites(ctx, list, camX) {
    for (const o of list) {
      const sx = o.x - camX;
      if (sx - o.spr.ox > W || sx - o.spr.ox + o.spr.w < 0) continue;
      if (o.flip) {
        ctx.save(); ctx.translate(snap(sx), 0); ctx.scale(-1, 1);
        ctx.drawImage(o.spr.c, -o.spr.ox, o.y - o.spr.oy, o.spr.w, o.spr.h);
        ctx.restore();
      } else ctx.drawImage(o.spr.c, snap(sx - o.spr.ox), o.y - o.spr.oy, o.spr.w, o.spr.h);
    }
  }
  // lavafall streaks: a scrolling texture clipped to the fall's trapezoid + a glow at the foot
  function lavaFall(ctx, x, y0, y1, w, t, sp) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x - w / 2, y0); ctx.lineTo(x + w / 2, y0); ctx.lineTo(x + w * 0.62, y1); ctx.lineTo(x - w * 0.62, y1); ctx.closePath(); ctx.clip();
    const tex = C.lavaTex, th = tex.h, sc = (t * sp) % th;
    ctx.globalAlpha = 0.85;
    for (let y = y0 - th + sc; y < y1; y += th) ctx.drawImage(tex.c, x - w * 0.62, y, w * 1.24, th);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function drawFarFalls(ctx, camX, t) {
    for (const f of LAY.farFalls) {
      const x = f.x - camX * P_FAR;
      if (x < -30 || x > W + 30) continue;
      lavaFall(ctx, x, rimFront(f.x) + 4, 304, f.w, t, 26);
    }
  }
  function drawWhelps(ctx, camX, t) {
    const cx = PAL_X - camX * P_MID;
    if (cx < -420 || cx > W + 420) return;
    ctx.fillStyle = '#1e0e18';
    for (const d of LAY.whelps) {
      const ang = d.ph + t * d.sp;
      const x = cx + Math.cos(ang) * d.rx, y = d.cy + Math.sin(ang) * d.ry;
      const dir = -Math.sin(ang) * Math.sign(d.sp) >= 0 ? 1 : -1;
      ctx.globalAlpha = 0.6 + 0.3 * (0.5 + 0.5 * Math.sin(ang));   // nearer side of the orbit reads darker
      dragonSil(ctx, x, y, d.s, Math.sin(t * d.fl + d.ph), dir);
    }
    ctx.globalAlpha = 1;
  }
  function drawLakeLive(ctx, camX, t) {
    const off = camX * P_LAKEN;
    ctx.globalCompositeOperation = 'lighter';
    // slow heat breathing over the lake
    ctx.globalAlpha = 0.22 + 0.08 * Math.sin(t * 1.3);
    ctx.drawImage(C.lavaGlow.c, -200, 230, W + 400, 140);
    for (const gl of LAY.glints) {
      let x = (gl.x - off + t * gl.sp) % 1500; if (x < 0) x += 1500; x -= 270;
      if (x < -60 || x > W + 60) continue;
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 1.7 + gl.ph);
      ctx.fillStyle = '#ffe6a0';
      ctx.beginPath(); ctx.ellipse(x, gl.y, gl.w * (0.4 + 0.25 * (gl.y - 262) / 70), 1.1, 0, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const b of LAY.bubbles) {
      let x = (b.x - off) % 1500; if (x < 0) x += 1500; x -= 270;
      if (x < -20 || x > W + 20) continue;
      const p = ((t + b.ph) % b.per) / b.per;
      if (p > 0.35) continue;
      const k = p / 0.35, r = b.r * (0.4 + k);
      if (k < 0.8) {
        ctx.globalAlpha = 1; ctx.fillStyle = '#ffb848'; ctx.beginPath(); ctx.arc(x, b.y - r * 0.4, r, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = '#fff0b0'; ctx.beginPath(); ctx.arc(x - r * 0.3, b.y - r * 0.8, r * 0.3, 0, TAU); ctx.fill();
      } else {
        ctx.globalAlpha = (1 - k) * 5; ctx.strokeStyle = '#ffd070'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(x, b.y, r * 1.6, r * 0.5, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawVaultLive(ctx, camX, t) {
    const off = camX * P_HDEEP;
    // stained glass turning gold as the curse lifts
    if (warm > 0) {
      ctx.globalAlpha = warm;
      for (let x = al(off - VAULT_WIN0, VAULT_WIN_ST) + VAULT_WIN0 - VAULT_WIN_ST; x < off + W + VAULT_WIN_ST; x += VAULT_WIN_ST) {
        const sx = x - off;
        if (sx < -80 || sx > W + 80) continue;
        ctx.drawImage(C.winWarm.c, snap(sx - C.winWarm.ox), 0, C.winWarm.w, C.winWarm.h);
      }
      ctx.globalAlpha = 1;
    }
    // light shafts from the windows
    ctx.globalCompositeOperation = 'lighter';
    for (let x = al(off - VAULT_WIN0, VAULT_WIN_ST) + VAULT_WIN0 - VAULT_WIN_ST; x < off + W + VAULT_WIN_ST; x += VAULT_WIN_ST) {
      const sx = x - off;
      if (sx < -160 || sx > W + 60) continue;
      const a = 0.16 + 0.03 * Math.sin(t * 0.8 + x);
      if (warm < 1) { ctx.globalAlpha = a * (1 - warm); ctx.drawImage(C.shaft[0].c, sx - 100, 110, 200, 260); }
      if (warm > 0) { ctx.globalAlpha = a * 1.3 * warm; ctx.drawImage(C.shaft[1].c, sx - 100, 110, 200, 260); }
    }
    // chandelier candle flicker + gold glints on the treasure
    for (let x = al(off - VAULT_WIN0, VAULT_WIN_ST) + VAULT_WIN0 - VAULT_WIN_ST * 1.5; x < off + W + VAULT_WIN_ST; x += VAULT_WIN_ST) {
      const sx = x - off;
      if (sx < -60 || sx > W + 60) continue;
      const cy = 150 + 16 * hash1(x | 0);
      for (const [spr, k] of fire().glows) { ctx.globalAlpha = (0.5 + 0.15 * Math.sin(t * 7 + x)) * k; ctx.drawImage(spr.c, sx - 48, cy - 44, 96, 60); }
    }
    ctx.globalAlpha = 1;
    for (let cell = Math.floor(off / 110) - 1; cell <= Math.floor((off + W) / 110) + 1; cell++) {
      const sx = cell * 110 + hash1(cell * 7 + 1) * 110 - off;
      const ph = (t * 0.55 + hash1(cell * 13 + 5) * 3) % 2.2;
      if (ph > 0.35 || sx < -10 || sx > W + 10) continue;
      const y = 236 + hash1(cell * 3 + 2) * 104, a = Math.sin((ph / 0.35) * Math.PI);
      ctx.globalAlpha = a * 0.9; ctx.drawImage(C.items.shine.c, sx - 10, y - 10, 20, 20);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function drawCavernLive(ctx, camX, t) {
    const off = camX * P_TDEEP;
    for (const f of LAY.tFalls) {
      const x = f.x - off;
      if (x < -60 || x > W + 60) continue;
      lavaFall(ctx, x, f.y0, 342, f.w, t, 60);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 + 0.15 * Math.sin(t * 3 + f.x);
      ctx.drawImage(C.lavaGlow.c, x - f.w * 1.6, 312, f.w * 3.2, 50);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
  function drawShafts(ctx, camX, t, list) {
    ctx.globalCompositeOperation = 'lighter';
    for (const [wx, a0] of list) {
      const sx = wx - camX;
      if (sx < -200 || sx > W + 120) continue;
      const a = a0 * (0.85 + 0.15 * Math.sin(t * 0.6 + wx));
      if (warm < 1) { ctx.globalAlpha = a * (1 - warm) * 0.55; ctx.drawImage(C.shaft[0].c, sx - 130, -10, 260, 520); }
      if (warm > 0) { ctx.globalAlpha = a * warm * 0.7; ctx.drawImage(C.shaft[1].c, sx - 130, -10, 260, 520); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  // ash (falls) + embers (rise); density per section
  function drawParticles(ctx, camX, t, lmin, lmax, z) {
    const ashD = 0.6 * z.cal + 0.16 * z.gat + 0.06 * z.hal + 0.24 * z.thr;
    const embD = 0.9 * z.cal + 0.3 * z.gat + 0.1 * z.hal + 1 * z.thr;
    const par = [0.35, 0.8, 1.35];
    if (ashD > 0.02) {
      for (const f of LAY.ash) {
        if (f.layer < lmin || f.layer > lmax || f.k > (f.layer === 2 ? ashD * 0.5 : ashD)) continue;
        let x = f.x - camX * par[f.layer] - t * 12 * (0.6 + f.layer * 0.4) + Math.sin(t * f.fr + f.ph) * f.sw;
        let y = f.y + t * f.sp;
        x = ((x % 1000) + 1000) % 1000 - 20;
        y = ((y % 580) + 580) % 580 - 20;
        const spr = C.ash[f.layer], r = (spr.w / 2) * f.sz;
        ctx.globalAlpha = f.layer === 0 ? 0.45 : 0.62;
        ctx.drawImage(spr.c, x - r, y - r, r * 2, r * 2);
      }
    }
    if (embD > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      for (const e of LAY.embers) {
        if (e.layer < lmin || e.layer > lmax || e.k > (e.layer === 2 ? embD * 0.4 : embD)) continue;
        let x = e.x - camX * par[e.layer] + Math.sin(t * e.fr + e.ph) * e.sw;
        let y = e.y - t * e.sp;
        x = ((x % 1000) + 1000) % 1000 - 20;
        y = ((y % 600) + 600) % 600 - 30;
        const r = [2.6, 3.4, 5][e.layer];
        ctx.globalAlpha = (0.55 + 0.45 * Math.sin(t * e.tw + e.ph)) * Math.min(1, y / 120 + 0.2);
        ctx.drawImage(C.ember.c, x - r, y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ props (public)
  function drawProp(ctx, kind, sx, sy, opts) {
    if (!C) { released = false; setScale(S || 1); }
    const frames = C.items[kind];
    if (!frames) return;
    const flash = (opts && opts.flash) || 0, shake = (opts && opts.shake) || 0;
    const open = kind === 'chest' ? clamp((opts && opts.open) || 0, 0, 1) : 0;
    const it = frames[Math.round(open * (frames.length - 1))];
    const dx = shake ? shake * Math.sin(performance.now() * 0.09) : 0;
    ctx.save();
    ctx.fillStyle = 'rgba(20,10,16,0.3)';
    ctx.beginPath(); ctx.ellipse(sx, sy, PROP_INFO[kind].w * 0.55, 6, 0, 0, TAU); ctx.fill();
    const s = it.spr;
    if (open > 0.05) { // treasure glow behind the lid
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = open * (0.75 + 0.15 * Math.sin(performance.now() * 0.006));
      ctx.drawImage(C.items.gold.c, sx + dx - 46, sy - 92, 92, 80);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(s.c, sx + dx - s.ox, sy - s.oy, s.w, s.h);
    if (flash > 0) { ctx.globalAlpha = clamp(flash, 0, 1) * 0.7; ctx.drawImage(it.white.c, sx + dx - s.ox, sy - s.oy, s.w, s.h); }
    ctx.restore();
  }

  function info() {
    let px = 0, n = 0;
    const seen = new Set();
    const add = (c) => { if (seen.has(c)) return; seen.add(c); px += c.width * c.height; n++; };
    for (const s of [C.far, C.mid, C.lakeFar, C.lakeNear, C.gDeep, C.hDeep, C.tDeep, C.ground]) for (const ch of s.chunks) if (ch.c) add(ch.c);
    for (const l of [C.near.bays, C.near.tops, C.near.pillars, C.near.front]) for (const o of l) add(o.spr.c);
    for (const o of C.islands) add(o.spr.c);
    for (const o of C.front.list) add(o.spr.c);
    for (const o of C.smoke) add(o.spr.c);
    return { canvases: n, megapixels: +(px / 1e6).toFixed(1), approxMB: +((px * 4) / 1048576).toFixed(0), buildMs: +C.buildMs.toFixed(0), cs: C.cs };
  }

  /** free the caches now (iOS: the canvas memory cap counts them); rebuilt when it's next drawn on screen */
  function release() { if (C) freeCanvases(C); C = null; released = true; }
  return { setScale, setWarm, drawBack, drawFront, drawProp, info, release };
}

// ---------------------------------------------------------------------------------------------------------------
// PROPS (this level's breakables)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 64, h: 60, colors: ['#7a2a26', '#4e1618', '#e0ad48', '#a8782a'] },
  barrel: { w: 52, h: 66, colors: ['#7a4a2c', '#4e2c18', '#c8963c', '#6a1e3a'] },
  urn:    { w: 46, h: 58, colors: ['#e0ad48', '#a8782a', '#ffe7a0', '#a3283a'] },
  chest:  { w: 70, h: 54, colors: ['#8a4a26', '#5a2c14', '#e0ad48', '#ffe08a'] },
};
const CHEST_FRAMES = 8;
const PROP_DRAW = {
  // gilded treasure crate: crimson lacquer, gold corners and bands, coins peeking under the lid
  crate(g) {
    const wood = '#7a2a26', woodSh = '#561a1a', woodHi = '#a8443a', woodDk = '#3a0e10';
    const FL = -30, FR = 26, TOPY = -48, dx = 6, dy = -10;
    ink(g, (g) => poly(g, [FR, 0, FR + dx, dy, FR + dx, TOPY + dy, FR, TOPY]), woodSh, 2.6, (g) => { g.strokeStyle = woodDk; g.lineWidth = 1.2; for (const y of [-16, -32]) { polyline(g, [FR, y, FR + dx, y + dy]); g.stroke(); } g.fillStyle = GD.sh; g.fillRect(FR, TOPY - 12, dx + 2, 8); });
    ink(g, (g) => poly(g, [FL, TOPY, FR, TOPY, FR + dx, TOPY + dy, FL + dx, TOPY + dy]), woodHi, 2.6, (g) => {
      g.fillStyle = GD.base; poly(g, [FL + 22, TOPY, FL + 30, TOPY, FL + 30 + dx, TOPY + dy, FL + 22 + dx, TOPY + dy]); g.fill();
    });
    // coins peeking from under the lid
    for (const [x, c] of [[-22, '#ffe08a'], [-14, '#e8b84c'], [10, '#ffe08a'], [18, '#f2c860']]) { g.fillStyle = INK; g.beginPath(); g.ellipse(x, TOPY + 1, 4.4, 2.2, 0, 0, TAU); g.fill(); g.fillStyle = c; g.beginPath(); g.ellipse(x, TOPY + 0.6, 3.4, 1.5, 0, 0, TAU); g.fill(); }
    ink(g, (g) => poly(g, [FL, 0, FL, TOPY, FR, TOPY, FR, 0]), wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(FL, -24, FR - FL, 24);
      g.strokeStyle = woodDk; g.lineWidth = 1.3;
      for (const y of [-16, -32]) { polyline(g, [FL, y, FR, y]); g.stroke(); }
      g.fillStyle = woodHi; g.fillRect(FL, TOPY, FR - FL, 3);
      // gold band + corners
      g.fillStyle = INK; g.fillRect(FL + 20.5, TOPY, 11, 48);
      g.fillStyle = GD.base; g.fillRect(FL + 22, TOPY, 8, 48); g.fillStyle = GD.hi; g.fillRect(FL + 22, TOPY, 2, 48); g.fillStyle = GD.sh; g.fillRect(FL + 27, TOPY, 3, 48);
      for (const [x, y] of [[FL, TOPY], [FR - 11, TOPY], [FL, -11], [FR - 11, -11]]) {
        g.fillStyle = INK; g.fillRect(x - 0.5, y - 0.5, 12, 12);
        g.fillStyle = GD.base; g.fillRect(x + 0.5, y + 0.5, 10, 10); g.fillStyle = GD.hi; g.fillRect(x + 0.5, y + 0.5, 10, 2);
        g.fillStyle = GD.dk; g.fillRect(x + 4, y + 4, 2.4, 2.4);
      }
      // lock plate with a green gem
      g.fillStyle = INK; roundRect(g, FL + 18, -34, 16, 18, 3); g.fill();
      g.fillStyle = GD.base; roundRect(g, FL + 19.5, -32.5, 13, 15, 2); g.fill();
      g.fillStyle = KG.glass; g.beginPath(); g.arc(FL + 26, -27, 2.6, 0, TAU); g.fill();
      g.fillStyle = INK; g.fillRect(FL + 25.2, -24, 1.6, 4);
    });
  },
  // wine cask: dark oak, brass hoops, the King's crown branded on it, a tap with a drip
  barrel(g) {
    const wood = '#7a4a2c', woodSh = '#4e2c18', woodHi = '#a46a40', brass = '#c8963c', brassHi = '#f0cc78', brassSh = '#8a6424';
    const body = (g) => { g.beginPath(); g.moveTo(-20, -58); g.quadraticCurveTo(-29, -29, -20, 0); g.ellipse(0, 0, 20, 5, 0, Math.PI, 0, true); g.quadraticCurveTo(29, -29, 20, -58); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(8, -66, 30, 72);
      g.fillStyle = woodHi; g.fillRect(-20, -60, 6, 64);
      g.strokeStyle = woodSh; g.lineWidth = 1.3;
      for (const k of [-0.55, -0.15, 0.25, 0.62]) { g.beginPath(); g.moveTo(k * 20, -58); g.quadraticCurveTo(k * 29, -29, k * 20, 4); g.stroke(); }
      for (const y of [-50, -10]) {
        g.fillStyle = INK; g.fillRect(-30, y - 4.5, 60, 9);
        g.fillStyle = brass; g.fillRect(-30, y - 3, 60, 6);
        g.fillStyle = brassHi; g.fillRect(-30, y - 3, 60, 1.5); g.fillStyle = brassSh; g.fillRect(8, y - 3, 30, 6);
      }
      // branded crown
      g.fillStyle = '#3a1e10'; poly(g, [-9, -24, -10, -36, -5, -31, 0, -39, 5, -31, 10, -36, 9, -24]); g.fill();
      // wine stain
      g.fillStyle = 'rgba(110,20,60,0.55)'; g.beginPath(); g.ellipse(4, -6, 6, 3, 0, 0, TAU); g.fill();
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -58, 20, 6, 0, 0, TAU); }, woodHi, 2.4, (g) => { g.strokeStyle = woodSh; g.lineWidth = 1.1; for (const x of [-8, 0, 8]) { polyline(g, [x, -64, x, -52]); g.stroke(); } g.fillStyle = woodSh; g.beginPath(); g.arc(6, -58, 2.4, 0, TAU); g.fill(); });
    // tap
    ink(g, (g) => poly(g, [-4, -18, 6, -18, 6, -12, 2, -12, 2, -6, -1, -6, -1, -12, -4, -12]), brass, 1.8, (g) => { g.fillStyle = brassHi; g.fillRect(-4, -18, 10, 1.6); });
    ink(g, (g) => { g.beginPath(); g.ellipse(0.5, -2, 2, 2.8, 0, 0, TAU); }, '#8a1a4a', 1);
  },
  // golden urn: amphora with a crimson band of green gems and a crown knob
  urn(g) {
    const body = (g) => {
      g.beginPath(); g.moveTo(-11, 0); g.lineTo(-13, -5); g.quadraticCurveTo(-26, -18, -21, -34); g.quadraticCurveTo(-17, -44, -9, -47);
      g.lineTo(-9, -50); g.lineTo(-13, -54); g.lineTo(13, -54); g.lineTo(9, -50); g.lineTo(9, -47);
      g.quadraticCurveTo(17, -44, 21, -34); g.quadraticCurveTo(26, -18, 13, -5); g.lineTo(11, 0); g.closePath();
    };
    for (const s of [-1, 1]) { g.lineWidth = 6.5; g.strokeStyle = INK; g.beginPath(); g.moveTo(s * 9, -45); g.quadraticCurveTo(s * 26, -50, s * 18, -32); g.stroke(); g.lineWidth = 3.5; g.strokeStyle = GD.base; g.stroke(); }
    ink(g, body, GD.base, 2.6, (g) => {
      g.fillStyle = GD.sh; g.beginPath(); g.ellipse(12, -24, 14, 30, 0, 0, TAU); g.fill();
      g.fillStyle = GD.hi; g.beginPath(); g.ellipse(-12, -30, 4, 10, 0.3, 0, TAU); g.fill();
      g.fillStyle = '#fff6d6'; g.beginPath(); g.ellipse(-13, -33, 1.6, 4, 0.3, 0, TAU); g.fill();
      g.fillStyle = INK; g.fillRect(-30, -31, 60, 11);
      g.fillStyle = CR.base; g.fillRect(-30, -29.5, 60, 8); g.fillStyle = CR.sh; g.fillRect(8, -29.5, 30, 8);
      for (const x of [-14, -4, 6, 16]) { g.fillStyle = KG.glass; g.beginPath(); g.ellipse(x, -25.5, 2.4, 2.8, 0, 0, TAU); g.fill(); g.fillStyle = '#eaffd0'; g.fillRect(x - 1.2, -27.5, 1.2, 1.2); }
      g.strokeStyle = GD.dk; g.lineWidth = 1.2; polyline(g, [-20, -12, 20, -12]); g.stroke();
      for (let x = -16; x <= 16; x += 6) { polyline(g, [x, -16, x + 3, -12, x + 6, -16]); g.stroke(); }
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -54, 13, 3.5, 0, 0, TAU); }, GD.sh, 1.8);
    ink(g, (g) => poly(g, [-6, -56, -7, -64, -3, -60, 0, -66, 3, -60, 7, -64, 6, -56]), GD.base, 1.6, (g) => { g.fillStyle = GD.sh; g.fillRect(2, -68, 6, 14); });
  },
  // treasure chest; open 0..1 swings the barrel lid back on its hinge and spills gold over the front.
  // The lid is a little 3D profile (z: 0 front .. 1 back, h: px above the rim) rotated about the back hinge and
  // projected with the same oblique offset as the box, so every in-between frame is a real pose.
  chest(g, open = 0) {
    const wood = '#8a4a26', woodSh = '#5a2c14', woodHi = '#b46c3a', woodDk = '#3a1a0c', velvet = '#8a1a30', velvetSh = '#560c1c';
    const FL = -33, FR = 29, BY = -30, dx = 6, dy = -8, Dh = 26;
    const a = open * 1.95, ca = Math.cos(a), sa = Math.sin(a);
    const prof = [[0, 0], [0, 10], [0.1, 15], [0.3, 19], [0.55, 20], [0.8, 18], [1, 13], [1, 0]];
    const rot = ([z, h]) => { const rz = (z - 1) * Dh; return [1 + (rz * ca + h * sa) / Dh, -rz * sa + h * ca]; };
    const scr = (x, z, h) => [x + dx * z, BY - h + dy * z];
    const RP = prof.map(rot);
    const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const quad = (x0, x1, p, q) => { const A = scr(x0, ...p), B = scr(x1, ...p), C2 = scr(x1, ...q), D = scr(x0, ...q); return [A[0], A[1], B[0], B[1], C2[0], C2[1], D[0], D[1]]; };
    const drawLid = () => {
      // right side of the lid
      const side = []; for (const p of RP) { const s = scr(FR, ...p); side.push(s[0], s[1]); }
      poly(g, side); g.fillStyle = woodSh; g.fill();
      const faces = [];
      for (let i = 0; i < RP.length; i++) {
        const p = RP[i], q = RP[(i + 1) % RP.length];
        const ez = (q[0] - p[0]) * Dh, eh = q[1] - p[1], len = Math.hypot(ez, eh) || 1;
        const nz = -eh / len, nh = ez / len;
        if (-nz + 0.55 * nh <= 0.02) continue;
        faces.push({ p, q, b: -0.45 * nz + 0.9 * nh, inner: i === RP.length - 1, front: i === 0, zc: (p[0] + q[0]) / 2 });
      }
      faces.sort((u, v) => v.zc - u.zc);
      for (const f of faces) {
        if (f.inner) {
          poly(g, quad(FL, FR, f.p, f.q)); g.fillStyle = f.b > 0 ? velvet : velvetSh; g.fill();
          g.save(); poly(g, quad(FL, FR, f.p, f.q)); g.clip();
          g.strokeStyle = GD.base; g.lineWidth = 2.2; poly(g, quad(FL + 3, FR - 3, lerp2(f.p, f.q, 0.08), lerp2(f.p, f.q, 0.92))); g.stroke();
          g.restore();
          continue;
        }
        poly(g, quad(FL, FR, f.p, f.q)); g.fillStyle = f.b > 0.6 ? woodHi : f.b > 0.05 ? wood : woodSh; g.fill();
        for (const [xa, xb] of [[FL + 7, FL + 14], [FR - 14, FR - 7]]) { poly(g, quad(xa, xb, f.p, f.q)); g.fillStyle = f.b > 0.6 ? GD.hi : f.b > 0.05 ? GD.base : GD.sh; g.fill(); }
        if (f.front && open < 0.3) { // lock plate on the lid
          poly(g, quad(-9, 5, f.p, lerp2(f.p, f.q, 0.95))); g.fillStyle = GD.base; g.fill(); g.lineWidth = 1.4; g.strokeStyle = INK; g.stroke();
          const c = scr(-2, ...lerp2(f.p, f.q, 0.5)); g.fillStyle = KG.glass; g.beginPath(); g.arc(c[0], c[1], 2.6, 0, TAU); g.fill();
          g.fillStyle = '#eaffd0'; g.fillRect(c[0] - 1.4, c[1] - 1.8, 1.2, 1.2);
        }
      }
      // silhouette ink (convex hull of the projected lid) + the band edges
      const pts = []; for (const p of RP) for (const x of [FL, FR]) pts.push(scr(x, ...p));
      const hl = hull(pts);
      g.beginPath(); g.moveTo(hl[0][0], hl[0][1]); for (const p of hl) g.lineTo(p[0], p[1]); g.closePath();
      g.save(); g.translate(0.6, 1); g.lineWidth = 3.6; g.strokeStyle = INK; g.stroke(); g.restore();
      g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
      const f0 = faces.find((f) => f.front);
      if (f0) { const A = scr(FL, ...f0.q), B = scr(FR, ...f0.q); strokeLine(g, [A[0], A[1], B[0], B[1]], 1.3, rgba(woodDk, 0.8)); }
    };
    const behind = a > 1.25;
    if (behind) drawLid();
    // box: right side
    ink(g, (g) => poly(g, [FR, 0, FR + dx, dy, FR + dx, BY + dy, FR, BY]), woodSh, 2.6, (g) => { g.fillStyle = GD.sh; g.fillRect(FR, -12, dx + 2, 5); g.fillRect(FR, BY + 2, dx + 2, 4); });
    // the box mouth heaped with gold
    if (open > 0) {
      const k = Math.min(1, open * 1.6);
      ink(g, (g) => poly(g, [FL, BY, FR, BY, FR + dx, BY + dy, FL + dx, BY + dy]), '#2a120a', 2.2);
      const hx = (FL + FR + dx) / 2, hy = BY + dy / 2 + 1;
      ink(g, (g) => { g.beginPath(); g.moveTo(FL + 1, BY); g.quadraticCurveTo(hx - 6, hy - 6 - 16 * k, FR + dx - 1, BY + dy); g.lineTo(FR, BY); g.closePath(); }, '#e8b84c', 2, (g) => {
        g.fillStyle = '#ffe08a'; g.beginPath(); g.ellipse(hx - 8, hy - 4 - 8 * k, 16, 3 + 3 * k, -0.15, 0, TAU); g.fill();
        const R = mulberry(5);
        for (let i = 0; i < 18; i++) { const x = R.r(FL + 4, FR + 2), y = R.r(hy - 12 * k - 2, BY + 1); g.fillStyle = '#b8862e'; g.beginPath(); g.ellipse(x, y + 0.8, 3, 1.3, 0, 0, TAU); g.fill(); g.fillStyle = R() < 0.5 ? '#fff0b0' : '#f2c860'; g.beginPath(); g.ellipse(x, y, 3, 1.3, 0, 0, TAU); g.fill(); }
      });
      if (open > 0.45) { // a crown and a gem riding the heap
        const kk = Math.min(1, (open - 0.45) * 2.2);
        g.save(); g.translate(-10, BY - 8 - 10 * k); g.rotate(-0.25);
        ink(g, (g) => poly(g, [-8, 0, -9, -9 * kk, -4, -5 * kk, 0, -12 * kk, 4, -5 * kk, 9, -9 * kk, 8, 0]), '#ffd25a', 1.6, (g) => { g.fillStyle = '#c8962e'; g.fillRect(2, -14, 8, 16); g.fillStyle = '#62e05a'; g.beginPath(); g.arc(0, -3, 1.8, 0, TAU); g.fill(); });
        g.restore();
        ink(g, (g) => poly(g, [14, BY - 13 * k, 18, BY - 9 * k, 14, BY - 6 * k, 10, BY - 9 * k]), '#e8384a', 1.4, (g) => { g.fillStyle = '#ffb0b8'; g.fillRect(12, BY - 12 * k, 2, 2); });
      }
    }
    // box front
    ink(g, (g) => poly(g, [FL, 0, FL, BY, FR, BY, FR, 0]), wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(FL, -12, FR - FL, 12);
      g.strokeStyle = woodDk; g.lineWidth = 1.3; polyline(g, [FL, -15, FR, -15]); g.stroke();
      g.fillStyle = woodHi; g.fillRect(FL, BY, FR - FL, 3);
      for (const x of [FL + 7, FR - 14]) { g.fillStyle = INK; g.fillRect(x - 1.5, BY, 10, 30); g.fillStyle = GD.base; g.fillRect(x, BY, 7, 30); g.fillStyle = GD.hi; g.fillRect(x, BY, 1.6, 30); g.fillStyle = GD.dk; for (const y of [-25, -6]) g.fillRect(x + 2.5, y, 2, 2); }
      g.fillStyle = INK; g.fillRect(FL, -3, FR - FL, 3); g.fillStyle = GD.sh; g.fillRect(FL, -2.5, FR - FL, 2);
    });
    // hasp
    ink(g, (g) => { roundRect(g, -8, BY, 12, 12, 2.5); }, GD.base, 1.8, (g) => { g.fillStyle = GD.sh; g.fillRect(0, BY, 6, 14); g.fillStyle = INK; g.fillRect(-2.8, BY + 4, 1.6, 5); });
    // coins spilling over the front edge and onto the floor
    if (open > 0.15) {
      const k = (open - 0.15) / 0.85, R = mulberry(9);
      const n = Math.round(3 + 12 * k);
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n, x = lerp(-20, 18, R()) + R.r(-5, 5) * f, y = lerp(BY + 3, 3, Math.min(1, f * (0.5 + k)));
        g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, 3.9, 2, 0, 0, TAU); g.fill();
        g.fillStyle = R() < 0.5 ? '#ffe08a' : '#e8b84c'; g.beginPath(); g.ellipse(x, y - 0.3, 3, 1.3, 0, 0, TAU); g.fill();
      }
      for (let i = 0; i < 9 * k; i++) {
        const x = R.r(-36, 36), y = R.r(1, 6);
        g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, 4, 2, 0, 0, TAU); g.fill();
        g.fillStyle = R() < 0.5 ? '#ffe08a' : '#f2c860'; g.beginPath(); g.ellipse(x, y - 0.3, 3.2, 1.4, 0, 0, TAU); g.fill();
      }
    }
    if (!behind) drawLid();
  },
};
