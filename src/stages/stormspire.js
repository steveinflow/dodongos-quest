// Dodongo's Quest - Level 3 "STORMSPIRE": backgrounds, wind, breakable props (canvas 2D, no deps).
//
// The heroes climb the Dragon Clan's highest peaks to the wyvern roosts, where the Dragon King's storm dragon guards
// the sky road to his throne.  Four sections: a windswept ledge cut into a cliff, rope-and-plank sky bridges between
// stone spires, the wyvern roost, and the ancient circular summit shrine under a raging storm.
//
// Back-to-front (drawBack):
//   sky gradient (palette blended by camX: cold morning -> high day -> gale -> storm; `gold` = the storm breaking,
//   setWarm) -> sun / clouds -> lightning (summit) -> far spires + the King's citadel (p .1) -> far cloud sea (p .16,
//   drifting tile) -> mid pinnacles with roosts (p .3) + flying collared wyverns -> near cloud sea (p .42) -> big spires
//   (p .55, around the bridges) -> eagles -> wind wisps -> the void under the sky bridges (p .7) -> back strips (p 1:
//   cliff wall, bridge rails, roost rim + nests, summit stones + statue) + live cloth/pines -> ground strip (floor band,
//   back boundary, front edge) -> near-front sprites + live bits (flames, banners, pennants, grass) -> snow / sleet.
// drawFront: the bridges' front rope rail, rare occluders (p 1.25, never on an arena screen), near streaks + feathers,
//   a gentle lightning wash.
// Every static element is pre-rendered once per scale (strips chunked to <= ~2048 device px, tiles for the cloud seas,
// reusable sprites); only cloth, flames, birds, particles and glows are drawn live.  All layout randomness is seeded.
// Wind blows left -> right.  windGust(k) (0..1, from the engine) makes cloth, pines and particles whip for ~1 s.

import { W, H, FLOOR_TOP, FLOOR_BOTTOM, INK } from '../config.js';
import { STAGE_CS, layerCanvas, blankCanvas, liveCanvas, cacheCanvas , freeCanvases } from '../canvasmem.js';
const EDGEFIX = (() => { try { return new URLSearchParams(location.search).get('edgefix') !== 'none'; } catch { return true; } })();

// ---------------------------------------------------------------------------------------------------------------
// math, random, colour (same toolkit as src/stage.js)
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
const lighten = (c, k) => mix(c, '#ffffff', k);
const darken = (c, k) => mix(c, '#1b1422', k);

// ---------------------------------------------------------------------------------------------------------------
// canvas helpers
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
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
// Outline style.  Scenery uses a thinner line tinted to its section's local dark colour so the actors (full INK) pop;
// breakable props keep the full INK style (see buildItems).
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
// soft radial sprite (glows, mist)
function radialSprite(r, sc, stops) {
  return makeSprite(r * 2, r * 2, r, r, sc, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
  });
}
// highest y of a closed polygon's outline at x (the silhouette's top edge)
function outlineY(pts, x) {
  let best = Infinity;
  const n = pts.length;
  for (let i = 0; i < n; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[(i + 2) % n], by = pts[(i + 3) % n];
    if ((x < ax) === (x < bx)) continue;
    const y = ay + (by - ay) * (x - ax) / (bx - ax || 1);
    if (y < best) best = y;
  }
  return best;
}
const al = (x, st) => Math.floor(x / st) * st;   // world-aligned loop start (chunk-safe sampling)

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 7200;
const CAM_MAX = LEVEL_LEN - W;          // 6240
export const SECTIONS = [
  { id: 'cliffs',  name: 'The Windward Ledge', x0: 0,    x1: 1800 },
  { id: 'bridges', name: 'The Sky Bridges',    x0: 1800, x1: 3600 },
  { id: 'roost',   name: 'The Wyvern Roost',   x0: 3600, x1: 5600 },
  { id: 'summit',  name: 'The Storm Summit',   x0: 5600, x1: 7200 },
];
// camera locks the art was composed around (left edge of the locked screen) and the engine-drawn waystones
export const ARENAS = [700, 2100, 3400, 4700, CAM_MAX];
export const SHRINES = [2900, 5400];

// ---------------------------------------------------------------------------------------------------------------
// palettes
// ---------------------------------------------------------------------------------------------------------------
const PAL_NAMES = ['morn', 'day', 'gale', 'storm', 'gold'];
// sky: 4 stops for y 0..380
const SKY = {
  morn:  ['#4a76b8', '#80a8da', '#c6d9ec', '#f6e2c8'],
  day:   ['#2d64ae', '#5891d2', '#a1c8e9', '#e0eff5'],
  gale:  ['#485270', '#67708b', '#9399ae', '#bcbcc7'],
  storm: ['#0d101b', '#192030', '#293645', '#3c5450'],
  gold:  ['#433d66', '#8f6b8a', '#e3a576', '#ffd894'],
};
const CLOUDP = {
  morn:  { body: '#dfe5f1', sh: '#a8b6d3', lit: '#fbf1e4', rim: '#fff0d6' },
  day:   { body: '#eef3f9', sh: '#bfcfe4', lit: '#fbfdff', rim: '#ffffff' },
  gale:  { body: '#848b9d', sh: '#62687c', lit: '#a1a7b6', rim: '#c3c7d0' },
  storm: { body: '#262c38', sh: '#141820', lit: '#323b47', rim: '#4b5f62' },
  gold:  { body: '#cf9c9c', sh: '#8e6a8a', lit: '#ffd3a2', rim: '#fff0c6' },
};
// cloud sea far below
const CSEA = {
  morn:  { lit: '#fff4e4', body: '#e2e6f2', sh: '#b2bad6', deep: '#8d98bf', haze: '#d8e0ee' },
  day:   { lit: '#ffffff', body: '#e8f0f9', sh: '#bccde4', deep: '#93abcf', haze: '#d4e4f0' },
  gale:  { lit: '#d4d6dd', body: '#b4b7c4', sh: '#8b90a2', deep: '#6b7085', haze: '#b4b6c2' },
  storm: { lit: '#3c484e', body: '#2d3741', sh: '#232b34', deep: '#151b24', haze: '#283434' },
  gold:  { lit: '#fff0cc', body: '#f0cdab', sh: '#c99b9b', deep: '#8e6e8e', haze: '#f0c9a8' },
};
// far spires (p .1)
const FARP = {
  morn:  { rock: '#93a2c2', rockSh: '#7180a6', lit: '#f1dccb', snow: '#f6f6fb', snowSh: '#b9c3dc', haze: '#d6deec', line: '#8190b1' },
  day:   { rock: '#87a0bf', rockSh: '#66809f', lit: '#c9d8e6', snow: '#fbfdff', snowSh: '#bacde2', haze: '#cde0ee', line: '#7891af' },
  gale:  { rock: '#7b8195', rockSh: '#5f6579', lit: '#9ea3b3', snow: '#d9dce3', snowSh: '#a4a9b8', haze: '#b4b6c2', line: '#6c7186' },
  storm: { rock: '#232a34', rockSh: '#181e26', lit: '#2b3c3a', snow: '#3f4b52', snowSh: '#30393f', haze: '#273434', line: '#1c232b' },
  gold:  { rock: '#927f9c', rockSh: '#6c5a80', lit: '#ffd7a0', snow: '#ffe8cc', snowSh: '#c8a6b8', haze: '#efc8a8', line: '#7c6a8c' },
};
// mid pinnacles (p .3)
const MIDP = {
  morn:  { rock: '#7a8bb0', sh: '#5f6f98', lit: '#e7cfc0', snow: '#eef1f9', snowSh: '#aebad6', haze: '#d2dbeb', dark: '#4a587e' },
  day:   { rock: '#6886a6', sh: '#4e6a8b', lit: '#b9cde0', snow: '#f3f8fc', snowSh: '#adc3da', haze: '#c8dcec', dark: '#3d5572' },
  gale:  { rock: '#626a7f', sh: '#4c5266', lit: '#8d92a3', snow: '#d4d7df', snowSh: '#9da2b2', haze: '#adb0bd', dark: '#3c4152' },
  storm: { rock: '#1e252e', sh: '#141a21', lit: '#2c423e', snow: '#485558', snowSh: '#313c40', haze: '#263333', dark: '#0f1418' },
  gold:  { rock: '#7d6888', sh: '#5f4d6f', lit: '#ffcf96', snow: '#ffe4c8', snowSh: '#c5a1b3', haze: '#ecc2a6', dark: '#4a3b58' },
};
// big spires around the sky bridges (p .55)
const SPP = {
  morn: { rock: '#8b8fae', rockSh: '#666a8f', rockHi: '#d0c0c4', crev: '#4b4e70', snow: '#f6f3f7', snowSh: '#b6b7d3', line: '#55587a', twig: '#7c6a62' },
  day:  { rock: '#8597b1', rockSh: '#5f7091', rockHi: '#b9c7d7', crev: '#46506b', snow: '#f5f9fc', snowSh: '#afc0d7', line: '#4b5674', twig: '#7a6656' },
  gale: { rock: '#757a8c', rockSh: '#565b6e', rockHi: '#9a9fae', crev: '#3a3e4e', snow: '#d8dbe3', snowSh: '#9da2b3', line: '#41455a', twig: '#625650' },
};
// near palettes (section lighting baked in)
const NP = {
  cliffs: {
    line: '#3d3550', rock: '#a399ab', rockSh: '#756b87', rockHi: '#d2c6c6', crev: '#4a4259', strata: '#8a8098', cut: '#b2a8b4',
    snow: '#f8f5f8', snowSh: '#bab5d3', snowHi: '#ffffff', pine: '#3c5957', pineSh: '#273d42', pineHi: '#5d7c6b', bark: '#6a4a3e', barkSh: '#45302a',
    grass: '#a68f5c', twig: '#7b5a3e', twigSh: '#4e3828', twigHi: '#a37c55',
    base: '#d9ccc4', baseSh: '#b5a7b1', baseHi: '#efe4dc', crack: '#8b7d91', face: '#8c8199', faceDk: '#4f4664', lip: '#efe7e4',
  },
  bridges: {
    line: '#3e3546', wood: '#a08466', woodSh: '#7e6650', woodHi: '#bea385', woodDk: '#4f3c2e', grain: '#7a6048',
    post: '#735743', postSh: '#4f3b2e', postHi: '#977860', rope: '#d0b47e', ropeSh: '#94784c', ropeDk: '#5a4630',
    stone: '#bdb5bd', stoneSh: '#8e8598', stoneHi: '#e0d8da', joint: '#6a6276', snow: '#f6f7fb', snowSh: '#b3bfd6', snowHi: '#ffffff',
    rock: '#9c95a8', rockSh: '#6e6782', rockHi: '#c9c1c8', crev: '#474158', crack: '#555068',
  },
  roost: {
    line: '#35303f', rock: '#958ea0', rockSh: '#696378', rockHi: '#bdb5bd', crev: '#3f3a4c', crack: '#7a7387',
    base: '#b2abb7', baseSh: '#9890a2', baseHi: '#c9c2c8', face: '#7a7288', faceDk: '#3f3950', lip: '#d6cfd4',
    twig: '#7d5c3e', twigSh: '#523b29', twigHi: '#a67f57', twigDk: '#3a2a1e',
    egg: '#d4e7df', eggSh: '#9fb5b2', eggHi: '#f6fffb', speck: '#7f6f92', egg2: '#efe4cc', egg2Sh: '#c4b18e', speck2: '#9a6a4a',
    bone: '#ebe2cc', boneSh: '#b9ab8e', boneDk: '#7d705c', feather: '#f2f0f4', featherSh: '#b9b6c8',
    snow: '#f2f3f7', snowSh: '#aeb2c8', snowHi: '#ffffff', iron: '#2c2b31', ironHi: '#5a5963',
  },
  summit: {
    line: '#141820', stone: '#656c76', stoneSh: '#464b55', stoneHi: '#8a929b', joint: '#282c34', rock: '#464c56', rockSh: '#2f343c', rockHi: '#646b75', crev: '#16191f',
    snow: '#9aa4ad', snowSh: '#68717e', snowHi: '#c2cad2', lichen: '#7a8c7a', iron: '#24242a', ironHi: '#4d4d57',
  },
};
const KING = { cloth: '#1d1b22', clothHi: '#302d38', clothSh: '#111015', green: '#7cc95c', greenSh: '#3f7f3a', gem: '#8ef07a' };
const CLAN = { red: '#a6322b', redSh: '#76201d', redHi: '#c8524a', gold: '#e2b24c', goldSh: '#a87a2c' };
const FIRE = { outer: '#2f9440', mid: '#73e35c', core: '#e2ffb8' };
const FIRE_WARM = { outer: '#c4501c', mid: '#ffa53a', core: '#fff0b8' };
const PRAYER = ['#4f7fc0', '#f1e8d4', '#b8392e', '#3f9a7e', '#e2b24c'];

// palette keyframes along camX (the climb into the storm)
// (every arena screen sits on a single palette, so long fights never pay for doubled layers)
const PAL_KEYS = [[0, 'morn'], [900, 'morn'], [2000, 'day'], [3450, 'day'], [4500, 'gale'], [4800, 'gale'], [5700, 'storm']];
const PAL_RANGE = { morn: [0, 2000], day: [900, 4500], gale: [3450, 5700], storm: [4800, CAM_MAX], gold: [4800, CAM_MAX] };
function palWeights(camX, warm) {
  const out = { morn: 0, day: 0, gale: 0, storm: 0, gold: 0 };
  if (camX <= PAL_KEYS[0][0]) out[PAL_KEYS[0][1]] = 1;
  else {
    let done = false;
    for (let i = 0; i < PAL_KEYS.length - 1; i++) {
      const [x0, a] = PAL_KEYS[i], [x1, b] = PAL_KEYS[i + 1];
      if (camX >= x0 && camX < x1) {
        const t = a === b ? 0 : smooth((camX - x0) / (x1 - x0));
        out[a] += 1 - t; out[b] += t; done = true; break;
      }
    }
    if (!done) out[PAL_KEYS[PAL_KEYS.length - 1][1]] = 1;
  }
  // after the boss the storm breaks into golden sunlight (only where the storm was)
  if (warm > 0) { const k = out.storm * warm; out.gold = k; out.storm -= k; }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// world layout constants
// ---------------------------------------------------------------------------------------------------------------
const GT0 = 324;                     // ground tiles cover screen y GT0..H
const FT = FLOOR_TOP, FB = FLOOR_BOTTOM;
const BA0 = 1880, BA1 = 2746;        // sky bridge A (deck)
const PL0 = 2746, PL1 = 3054;        // spire-top platform (waystone at 2900)
const BB0 = 3054, BB1 = 3580;        // sky bridge B
const RO0 = 3580;                    // the roost plateau begins
const SU0 = 5600;                    // the summit paving begins
const RING_X = 6720, RING_Y = 440;   // summit circle (floor inlay) centre
const DECKS = [[BA0, BA1], [BB0, BB1]];
const SEA_PER = 1200, CL_PERIOD = 1500;
const P_FAR = 0.1, P_SEA0 = 0.16, P_MID = 0.3, P_SEA1 = 0.42, P_SPIRE = 0.55, P_VOID = 0.7, P_FRONT = 1.25;
const P_WYV = 0.22, P_EAGLE = 0.5;

// rope-rail posts along each deck (x, handrail height, kind)
const POSTS = [
  [{ x: BA0 + 8, kind: 'anchor' }, { x: 2100, kind: 'mid' }, { x: 2316, kind: 'mid' }, { x: 2530, kind: 'mid' }, { x: PL0 + 8, kind: 'pillar' }],
  [{ x: PL1 - 8, kind: 'pillar' }, { x: 3318, kind: 'mid' }, { x: BB1 - 8, kind: 'anchor' }],
];
for (const list of POSTS) for (const p of list) {
  p.top = p.kind === 'anchor' ? 222 : p.kind === 'mid' ? 262 : 230;
  p.hand = p.kind === 'anchor' ? 256 : p.kind === 'mid' ? 272 : 262;
  p.low = p.hand + 44;
}

// the cliff wall behind the ledge: [x, top y] keys (high crags and low dips with the view beyond)
const WALL_K = [[-60, 46], [60, 30], [170, 58], [250, 150], [320, 236], [430, 262], [520, 230], [590, 130], [660, 92], [730, 108],
  [800, 192], [900, 236], [1010, 250], [1110, 212], [1190, 126], [1270, 56], [1350, 48], [1420, 94], [1480, 188], [1560, 260],
  [1650, 272], [1712, 196], [1772, 92], [1830, 72], [1866, 112], [1890, 300], [1912, 372]];
function wallTop(x) {
  let i = 0;
  while (i < WALL_K.length - 2 && x > WALL_K[i + 1][0]) i++;
  const [xa, ya] = WALL_K[i], [xb, yb] = WALL_K[i + 1];
  const base = lerp(ya, yb, smooth(clamp((x - xa) / (xb - xa), 0, 1)));
  const n = 6 * Math.sin(x * 0.043 + 1) + 3.5 * Math.sin(x * 0.11) + (hash1(Math.floor(x / 9)) - 0.5) * 4;
  return base + n * (x > 1880 ? 0 : 1);
}
const WALL_END = 1872;
// roost rim (back boundary of the plateau)
const rimTop = (x) => 334 + 5 * Math.sin(x * 0.021) + 4 * Math.sin(x * 0.067 + 1) + 3 * (hash1(Math.floor(x / 13) + 77) - 0.5);

// ---------------------------------------------------------------------------------------------------------------
// LAYOUT (scale independent, built once)
// ---------------------------------------------------------------------------------------------------------------
const LAY = (() => {
  const R = mulberry(20261007);
  // far spires (layer coords): a hazy back range + needle spires; the King's citadel far ahead on its own spire
  const farBack = [], farFront = [];
  for (let x = -120; x < 1720; x += R.r(150, 230)) farBack.push({ x, top: R.r(176, 232), wl: R.r(110, 190), wr: R.r(110, 190), seed: R.i(1, 1e9) });
  for (let x = -60; x < 1700; x += R.r(60, 130)) {
    if (x > 1262 && x < 1410) continue;
    farFront.push({ x, top: R.r(140, 262), wl: R.r(20, 48), wr: R.r(20, 48), seed: R.i(1, 1e9) });
  }
  const citadel = { x: 1336, top: 186, wl: 44, wr: 52, seed: 4242 };
  // mid pinnacles; zone by where they sit when centred on screen: 0 cliffs, 1 bridges, 2 roost, 3 summit
  const mid = [];
  for (let x = -80; x < 2920;) {
    const zone = x < 1020 ? 0 : x < 1560 ? 1 : x < 2170 ? 2 : 3;
    const w = zone === 0 ? R.r(80, 150) : zone === 3 ? R.r(28, 56) : R.r(34, 66);
    const top = zone === 0 ? R.r(150, 222) : zone === 1 ? R.r(178, 262) : zone === 2 ? R.r(165, 248) : R.r(196, 286);
    const m = { x, top, wl: w * R.r(0.8, 1.2), wr: w * R.r(0.8, 1.2), zone, flat: (zone === 1 || zone === 2) && R() < 0.6, seed: R.i(1, 1e9), deco: R() };
    m.tx = m.x + mulberry(m.seed).r(-0.08, 0.08) * (m.wl + m.wr);   // the same first draw spirePts makes
    m.fw = m.flat ? Math.min(m.wl, m.wr) * 0.9 : 0;
    mid.push(m);
    x += zone === 0 ? R.r(80, 150) : zone === 3 ? R.r(50, 110) : R.r(80, 170);
  }
  const midLinks = [];
  for (let i = 0; i < mid.length - 1; i++) {
    const a = mid[i], b = mid[i + 1];
    if (a.zone === 1 && b.zone === 1 && a.flat && b.flat && b.tx - a.tx < 230) midLinks.push([a, b]);
  }
  mid.sort((a, b) => a.top - b.top);   // tallest first: shorter pinnacles stand in front
  // big spires around the bridges (p .55 layer coords)
  const big = [
    { x: 1150, top: 196, wl: 70, wr: 86, flat: 62, deco: 'nest' },
    { x: 1468, top: 128, wl: 92, wr: 108, flat: 84, deco: 'shrine' },
    { x: 1792, top: 238, wl: 58, wr: 66, flat: 0, deco: 'pines' },
    { x: 2090, top: 162, wl: 98, wr: 118, flat: 92, deco: 'wyvern' },
    { x: 2440, top: 212, wl: 78, wr: 90, flat: 54, deco: 'nest' },
    { x: 2790, top: 152, wl: 94, wr: 106, flat: 72, deco: 'flags' },
  ];
  for (const b of big) { b.seed = R.i(1, 1e9); b.tx = b.x + mulberry(b.seed).r(-0.08, 0.08) * (b.wl + b.wr); }
  // sky clouds per palette (cloud layer coords, wrap period CL_PERIOD)
  const clouds = { morn: [], day: [], gale: [], storm: [], gold: [] };
  const cdef = {
    morn: [['streak', 8, 50, 210], ['puff', 3, 50, 150]],
    day: [['puff', 6, 30, 160], ['streak', 3, 40, 120]],
    gale: [['bank', 5, 10, 120], ['streak', 8, 40, 220]],
    storm: [['bank', 5, -20, 100], ['streak', 5, 80, 190]],
    gold: [['bank', 4, 0, 90], ['streak', 7, 60, 210]],
  };
  for (const k of PAL_NAMES) {
    for (const [kind, n, ya, yb] of cdef[k]) {
      for (let i = 0; i < n; i++) {
        const big = kind === 'bank' ? R.r(320, 520) : kind === 'puff' ? R.r(130, 240) : R.r(180, 400);
        clouds[k].push({ kind, x: R.r(0, CL_PERIOD), y: R.r(ya, yb), w: big, h: kind === 'streak' ? R.r(12, 22) : big * R.r(0.28, 0.42), seed: R.i(1, 1e9), sp: R.r(4, 9) });
      }
    }
  }
  // snow / sleet streaks: 3 depth layers (0, 1 behind the actors, 2 in front)
  const flakes = [];
  for (let i = 0; i < 300; i++) {
    const layer = i < 130 ? 0 : i < 240 ? 1 : 2;
    flakes.push({ layer, x: R.r(0, 1000), y: R.r(0, 580), sp: R.r(0.7, 1.3) * [18, 34, 60][layer], sw: R.r(3, 10), fr: R.r(0.6, 1.6), ph: R.r(0, TAU), k: R(), v: R.r(0.75, 1.25) });
  }
  // long thin mist wisps riding the wind
  const wisps = [];
  for (let i = 0; i < 12; i++) wisps.push({ x: R.r(0, 1400), y: i < 8 ? R.r(110, 330) : R.r(486, 532), len: R.r(140, 300), sp: R.r(0.8, 1.3), a: R.r(0.5, 1), near: i >= 8 });
  // collared wyverns circling far pinnacles (p P_WYV layer coords), eagles over the ledge (p P_EAGLE)
  const wyverns = [];
  for (let i = 0; i < 6; i++) wyverns.push({ cx: R.r(1140, 1520), cy: R.r(120, 230), rx: R.r(50, 170), ry: R.r(12, 34), sp: R.r(0.18, 0.34) * (R() < 0.4 ? -1 : 1), ph: R.r(0, TAU), s: R.r(0.9, 1.7), fl: R.r(3.5, 5.5) });
  const eagles = [];
  for (let i = 0; i < 3; i++) eagles.push({ cx: R.r(380, 1050), cy: R.r(70, 170), rx: R.r(60, 150), ry: R.r(14, 30), sp: R.r(0.25, 0.4) * (i === 1 ? -1 : 1), ph: R.r(0, TAU), s: R.r(0.9, 1.3) });
  // feathers tumbling through the roost
  const feathers = [];
  for (let i = 0; i < 7; i++) feathers.push({ x: R.r(0, 1100), y: R.r(120, 500), sp: R.r(0.7, 1.3), rs: R.r(-3, 3), ph: R.r(0, TAU), s: R.r(0.8, 1.3), bob: R.r(10, 30) });
  return { farBack, farFront, citadel, mid, midLinks, big, clouds, flakes, wisps, wyverns, eagles, feathers };
})();

// ---------------------------------------------------------------------------------------------------------------
// SILHOUETTES: spires, peaks
// ---------------------------------------------------------------------------------------------------------------
// jagged spire outline (flat array) from (x - wl, base) up to the summit and down to (x + wr, base); flatW > 0 cuts a
// ragged plateau at the top (roosts, shrines).  The first R draw picks the summit x (LAY precomputes it as .tx).
function spirePts(R, x, top, wl, wr, base, rough = 0.06, flatW = 0) {
  const tx = x + R.r(-0.08, 0.08) * (wl + wr);
  const L = [x - wl, base], Rr = [x + wr, base];
  const shL = [lerp(x - wl, tx, R.r(0.45, 0.6)) - R.r(0, 8), lerp(base, top, R.r(0.42, 0.58))];
  const shR = [lerp(x + wr, tx, R.r(0.5, 0.7)) + R.r(0, 8), lerp(base, top, R.r(0.48, 0.66))];
  let pts;
  if (flatW > 0) {
    const a = [tx - flatW / 2, top + R.r(1, 4)], b = [tx + flatW / 2, top + R.r(1, 4)];
    pts = mdp(L, shL, R, 3, rough).concat(mdp(shL, a, R, 3, rough).slice(1), mdp(a, b, R, 2, 0.03).slice(1),
      mdp(b, shR, R, 3, rough).slice(1), mdp(shR, Rr, R, 3, rough).slice(1));
  } else {
    const T = [tx, top];
    pts = mdp(L, shL, R, 3, rough).concat(mdp(shL, T, R, 3, rough).slice(1), mdp(T, shR, R, 3, rough).slice(1), mdp(shR, Rr, R, 3, rough).slice(1));
  }
  return { pts: flat(pts), tx };
}

function drawFarSpire(g, sp, P, base, hz0, hz1, flatW, rough) {
  const R = mulberry(sp.seed);
  const { pts, tx } = spirePts(R, sp.x, sp.top, sp.wl, sp.wr, base, rough, flatW);
  const x0 = sp.x - sp.wl - 8, w = sp.wl + sp.wr + 16, top = sp.top, h = base - top;
  g.save(); poly(g, pts); g.clip();
  g.fillStyle = P.rock; g.fillRect(x0, top - 8, w, h + 16);
  // sunlit left flank
  g.fillStyle = rgba(P.lit, 0.42);
  poly(g, [tx - flatW / 2, top - 4, x0 - 4, base + 6, lerp(x0, tx, 0.62), base + 6, tx - flatW / 2 - sp.wl * 0.06, top + h * 0.3]); g.fill();
  // shadow flank: jagged spine from the summit down the right of centre
  const spine = mdp([tx + flatW / 2 + 1, top], [tx + sp.wr * R.r(0.15, 0.35), base + 4], R, 4, 0.08);
  const shadow = flat(spine).concat([x0 + w + 10, base + 8, x0 + w + 10, top - 10]);
  poly(g, shadow); g.fillStyle = P.rockSh; g.fill();
  // snow above a ragged snow line
  const snowY = top + h * R.r(0.2, 0.4);
  const sn = [x0 - 10, top - 20];
  for (let x = x0; x <= x0 + w; x += 6) sn.push(x, snowY + (R() * 2 - 1) * 7 + (R() < 0.3 ? R.r(8, 26) : 0) + Math.abs(x - tx) * 0.22);
  sn.push(x0 + w + 10, top - 20);
  g.save(); poly(g, sn); g.clip();
  g.fillStyle = P.snow; g.fillRect(x0, top - 8, w, h + 16);
  poly(g, shadow); g.fillStyle = P.snowSh; g.fill();
  g.restore();
  // gully streaks
  g.strokeStyle = rgba(P.line, 0.5); g.lineWidth = 1.1;
  for (let i = 0; i < 4; i++) {
    const sy = lerp(top, base, R.r(0.12, 0.5)), sx = lerp(tx, x0 + sp.wl * 0.3, R.r(0.1, 0.6));
    polyline(g, flat(mdp([sx, sy], [sx + R.r(-10, 10), sy + R.r(18, 50)], R, 2, 0.15))); g.stroke();
  }
  // haze toward the cloud sea
  const gr = g.createLinearGradient(0, top, 0, base);
  gr.addColorStop(0, rgba(P.haze, hz0)); gr.addColorStop(1, rgba(P.haze, hz1));
  g.fillStyle = gr; g.fillRect(x0, top - 8, w, h + 16);
  g.restore();
  return tx;
}
// the Dragon King's black-iron citadel on its far spire (the end of the sky road)
function drawCitadel(g, cx, top, P) {
  const iron = mix(mix(P.rockSh, '#0b0c11', 0.62), P.haze, 0.16), ironHi = mix(iron, P.lit, 0.3);
  g.fillStyle = iron;
  poly(g, [cx - 26, top + 6, cx - 24, top - 12, cx + 24, top - 12, cx + 27, top + 6]); g.fill();
  for (const [dx, h, hw] of [[-18, 26, 5], [-7, 40, 6], [6, 54, 7.5], [19, 32, 5]]) {
    g.fillStyle = iron; g.fillRect(cx + dx - hw, top - h, hw * 2, h);
    poly(g, [cx + dx - hw - 2.5, top - h + 1, cx + dx, top - h - hw * 2.8, cx + dx + hw + 2.5, top - h + 1]); g.fill();
    g.fillStyle = ironHi; g.fillRect(cx + dx - hw, top - h, 1.4, h);
    g.fillStyle = rgba(KING.gem, 0.9); g.fillRect(cx + dx - 1, top - h + 7, 2, 3); g.fillRect(cx + dx - 1, top - h + 16, 2, 2.5);
  }
  // a crowned spike on the keep + a tiny banner
  g.strokeStyle = iron; g.lineWidth = 1.2; polyline(g, [cx + 6, top - 75, cx + 6, top - 88]); g.stroke();
  g.fillStyle = rgba(KING.green, 0.8); poly(g, [cx + 6, top - 88, cx + 15, top - 85, cx + 6, top - 82]); g.fill();
}
function drawFar(g, P, xa, xb) {
  for (const sp of LAY.farBack) if (sp.x + sp.wr > xa - 10 && sp.x - sp.wl < xb + 10) drawFarSpire(g, sp, P, 350, 0.5, 0.96, 0, 0.09);
  for (const sp of LAY.farFront) if (sp.x + sp.wr > xa - 10 && sp.x - sp.wl < xb + 10) drawFarSpire(g, sp, P, 356, 0.1, 0.86, 0, 0.06);
  const c = LAY.citadel;
  if (c.x + 90 > xa && c.x - 90 < xb) {
    const tx = drawFarSpire(g, c, P, 356, 0.06, 0.82, 38, 0.05);
    drawCitadel(g, tx, c.top + 2, P);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// CLOUD SEA (periodic tiles, drift with the wind) + SKY CLOUDS
// ---------------------------------------------------------------------------------------------------------------
// rows: [yTop, rMin, rMax, step, haze] back to front; flatK squashes the domes (grazing view = flatter)
const SEA0_ROWS = [[292, 7, 13, 18, 0.55], [300, 9, 16, 24, 0.38], [311, 11, 20, 30, 0.22], [325, 14, 25, 38, 0.1], [343, 18, 30, 46, 0]];
const SEA1_ROWS = [[336, 14, 24, 34, 0.22], [350, 18, 32, 46, 0.08], [368, 24, 40, 60, 0]];
const VOID_ROWS = [[486, 12, 22, 30, 0.3], [500, 16, 28, 40, 0.16], [518, 22, 36, 52, 0.05], [536, 26, 42, 60, 0]];
function seaTile(P, per, yA, yB, seed, rows, sc, flatK) {
  return makeSprite(per, yB - yA, 0, -yA, sc, (g) => {
    const R = mulberry(seed);
    const y0 = rows[0][0];
    let gr = g.createLinearGradient(0, y0 - 20, 0, yB);
    gr.addColorStop(0, rgba(mix(P.body, P.haze, 0.6), 0)); gr.addColorStop(0.25, mix(P.body, P.haze, 0.6)); gr.addColorStop(1, P.sh);
    g.fillStyle = gr; g.fillRect(0, y0 - 20, per, yB - y0 + 20);
    for (const [yT, r0, r1, st, hz] of rows) {
      // domes gather into cumulus heads (bigger, higher in the middle) with shadowed gaps between them
      const domes = [];
      for (let cx = R.r(0, st); cx < per; cx += st * R.r(1.5, 2.4)) {
        const n = R.i(2, 5), cw = st * R.r(0.9, 1.5);
        for (let j = 0; j < n; j++) {
          const f = n === 1 ? 0.5 : j / (n - 1), bump = Math.sin(f * Math.PI);
          const r = lerp(r0, r1, R()) * (0.72 + 0.48 * bump);
          domes.push([cx + (f - 0.5) * cw * 1.25 + R.r(-3, 3), yT + R.r(-2, 2) - bump * r * 0.3 * flatK, r]);
        }
      }
      const cSh = mix(P.sh, P.haze, hz), cBody = mix(P.body, P.haze, hz), cLit = mix(P.lit, P.haze, hz * 0.7);
      gr = g.createLinearGradient(0, yT + r0 * 0.3 * flatK, 0, yB);
      gr.addColorStop(0, mix(mix(P.sh, P.body, 0.3), P.haze, hz)); gr.addColorStop(1, mix(P.deep, P.haze, hz * 0.5));
      g.fillStyle = gr; g.fillRect(0, yT + r0 * 0.3 * flatK, per, yB - yT);
      for (let pass = 0; pass < 3; pass++) {
        g.fillStyle = pass === 0 ? cSh : pass === 1 ? cBody : cLit;
        g.beginPath();
        for (const [x, y, r] of domes) for (const dx of [-per, 0, per]) {
          const cx = x + dx;
          if (cx + r < -2 || cx - r > per + 2) continue;
          const k = pass === 0 ? 1 : pass === 1 ? 0.84 : 0.46;
          const ox = pass === 0 ? 0 : pass === 1 ? -r * 0.12 : -r * 0.32, oy = pass === 0 ? 0 : pass === 1 ? -r * 0.14 * flatK : -r * 0.42 * flatK;
          g.moveTo(cx + ox + r * k, y + oy); g.ellipse(cx + ox, y + oy, r * k, r * k * flatK, 0, 0, TAU);
        }
        g.fill();
      }
    }
  });
}
function cloudSprite(c, P, sc) {
  const pad = 14;
  if (c.kind === 'streak') {
    return makeSprite(c.w + pad * 2, c.h * 2 + pad * 2, c.w / 2 + pad, c.h + pad, sc, (g) => {
      const R = mulberry(c.seed);
      const w = c.w / 2, h = c.h;
      const lens = (dx, dy, sx, sy) => {
        g.beginPath(); g.moveTo(-w * sx + dx, dy);
        g.bezierCurveTo(-w * 0.5 * sx + dx, -h * 0.9 * sy + dy, w * 0.3 * sx + dx, -h * 1.1 * sy + dy, w * sx + dx, -h * 0.2 * sy + dy);
        g.bezierCurveTo(w * 0.4 * sx + dx, h * 0.25 * sy + dy, -w * 0.4 * sx + dx, h * 0.3 * sy + dy, -w * sx + dx, dy);
        g.closePath();
      };
      const parts = [[0, 0, 1, 1], [R.r(-0.3, 0.3) * w, -h * 0.35, R.r(0.45, 0.7), 0.7], [R.r(-0.2, 0.4) * w, h * 0.25, R.r(0.3, 0.55), 0.6]];
      for (const [dx, dy, sx, sy] of parts) { lens(dx, dy + 2, sx, sy); g.fillStyle = P.sh; g.fill(); }
      for (const [dx, dy, sx, sy] of parts) { lens(dx - 2, dy - 1, sx * 0.97, sy * 0.8); g.fillStyle = mix(P.body, P.lit, 0.55); g.fill(); }
      for (const [dx, dy, sx, sy] of parts) { lens(dx - 5, dy - h * 0.3, sx * 0.8, sy * 0.45); g.fillStyle = P.rim; g.fill(); }
    });
  }
  const H2 = c.h * 1.35;
  return makeSprite(c.w + pad * 2, H2 + pad * 2, c.w / 2 + pad, c.h * 1.12 + pad, sc, (g) => {
    const R = mulberry(c.seed);
    const n = c.kind === 'bank' ? 9 : 6;
    const top = [], bot = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const dome = Math.sin(Math.PI * (0.12 + f * 0.76));
      const r = c.h * (0.24 + 0.36 * dome) * R.r(0.82, 1.15);
      top.push([lerp(-c.w / 2 + r, c.w / 2 - r, f) + R.r(-6, 6), -c.h * 0.18 - r * R.r(0.55, 0.85) - dome * c.h * 0.12, r]);
    }
    const nb = Math.max(3, n - 2);
    for (let i = 0; i < nb; i++) {
      const f = i / (nb - 1);
      const r = c.h * R.r(0.16, 0.24);
      bot.push([lerp(-c.w / 2 + r * 2.2, c.w / 2 - r * 2.2, f) + R.r(-5, 5), -r * 0.55, r * R.r(1.6, 2.2), r]);
    }
    const shape = (dx, dy, k) => {
      g.beginPath();
      for (const [x, y, r] of top) { g.moveTo(x + dx + r * k, y + dy); g.arc(x + dx, y + dy, r * k, 0, TAU); }
      for (const [x, y, rx, ry] of bot) { g.moveTo(x + dx + rx * k, y + dy); g.ellipse(x + dx, y + dy, rx * k, ry * k, 0, 0, TAU); }
      g.moveTo(-c.w * 0.36 + dx, -c.h * 0.2 + dy); g.ellipse(dx, -c.h * 0.24 + dy, c.w * 0.36 * k, c.h * 0.26 * k, 0, 0, TAU);
    };
    shape(0, 0, 1); g.fillStyle = P.sh; g.fill();
    g.save(); g.globalCompositeOperation = 'source-atop';
    shape(-2, -c.h * 0.16, 0.97); g.fillStyle = P.body; g.fill();
    g.beginPath();
    for (const [x, y, r] of top) { g.moveTo(x - r * 0.12 + r * 0.8, y - r * 0.28); g.arc(x - r * 0.12, y - r * 0.28, r * 0.8, 0, TAU); }
    g.fillStyle = P.lit; g.fill();
    g.strokeStyle = P.rim; g.lineWidth = 2;
    for (const [x, y, r] of top) { g.beginPath(); g.arc(x, y, r - 1.5, Math.PI * 1.08, Math.PI * 1.62); g.stroke(); }
    g.restore();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// MID PINNACLES (p .3): the massif across the gulf, roost spires with far rope bridges, perched wyverns, storm teeth
// ---------------------------------------------------------------------------------------------------------------
function midWyvern(g, x, y, s, dir, P) {
  g.save(); g.translate(x, y); g.scale(dir * s, s);
  g.fillStyle = mix(P.dark, P.sh, 0.25);
  // hunched body, folded wing peaks, neck + horned head, tail draped over the ledge
  g.beginPath();
  g.moveTo(-9, 0); g.quadraticCurveTo(-11, -8, -6, -11); g.lineTo(-8, -19); g.lineTo(-2, -12); g.lineTo(1, -20); g.lineTo(4, -11);
  g.quadraticCurveTo(7, -14, 7, -19); g.quadraticCurveTo(8, -24, 12, -24); g.lineTo(13, -27); g.lineTo(14, -23.5); g.lineTo(18, -22); g.lineTo(13, -20.5);
  g.quadraticCurveTo(10, -18, 10, -12); g.quadraticCurveTo(10, -4, 7, 0); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-8, -2); g.quadraticCurveTo(-16, 2, -14, 10); g.quadraticCurveTo(-13, 14, -16, 16); g.lineTo(-12, 15); g.quadraticCurveTo(-10, 8, -6, 2); g.closePath(); g.fill();
  // the King's collar + a cursed eye
  g.fillStyle = rgba(KING.gem, 0.95); g.fillRect(8, -17.5, 3, 2); g.fillRect(14, -23, 1.6, 1.4);
  g.restore();
}
function midNest(g, x, y, P, s = 1) {
  const col = mix(P.dark, '#6b4a30', 0.45);
  g.fillStyle = col; g.beginPath(); g.ellipse(x, y - 2 * s, 10 * s, 4.2 * s, 0, 0, TAU); g.fill();
  g.strokeStyle = mix(col, P.lit, 0.25); g.lineWidth = 1;
  for (let i = 0; i < 4; i++) { const a = -9 + i * 5; polyline(g, [x + a * s, y - 4 * s, x + (a + 6) * s, y - 1 * s]); g.stroke(); }
  g.fillStyle = mix(P.snow, P.rock, 0.15); g.beginPath(); g.ellipse(x - 2 * s, y - 5.5 * s, 2.4 * s, 3 * s, 0, 0, TAU); g.fill();
}
function midShrine(g, x, y, P) {
  const wall = mix('#d8cfc0', P.haze, 0.35), roof = mix(CLAN.red, P.dark, 0.35);
  g.fillStyle = wall; g.fillRect(x - 5, y - 9, 10, 9);
  g.fillStyle = roof; poly(g, [x - 10, y - 8, x - 7, y - 11, x, y - 16, x + 7, y - 11, x + 10, y - 8]); g.fill();
  g.fillStyle = mix(P.snow, P.haze, 0.1); poly(g, [x - 6, y - 11.5, x, y - 16, x + 6, y - 11.5, x, y - 13]); g.fill();
}
function drawMid(g, P, xa, xb) {
  const base = 380;
  for (const m of LAY.mid) {
    if (m.x + m.wr < xa - 30 || m.x - m.wl > xb + 30) continue;
    const R = mulberry(m.seed);
    const { pts, tx } = spirePts(R, m.x, m.top, m.wl, m.wr, base, m.zone === 3 ? 0.085 : 0.055, m.fw);
    const x0 = m.x - m.wl - 8, x1 = m.x + m.wr + 8, h = base - m.top;
    g.save(); poly(g, pts); g.clip();
    g.fillStyle = P.rock; g.fillRect(x0, m.top - 10, x1 - x0, h + 20);
    g.fillStyle = rgba(P.lit, 0.5);
    poly(g, [tx - m.fw / 2, m.top - 4, x0 - 4, base, lerp(x0, tx, 0.55), base, tx - m.fw / 2 - 2, m.top + h * 0.25]); g.fill();
    const spine = mdp([tx + m.fw / 2 + 1, m.top], [tx + m.wr * R.r(0.2, 0.4), base + 4], R, 4, 0.07);
    poly(g, flat(spine).concat([x1 + 10, base + 6, x1 + 10, m.top - 10])); g.fillStyle = P.sh; g.fill();
    // bedding ledges with snow
    for (let k = 0; k < 3 + h / 45; k++) {
      const y = lerp(m.top + 12, base - 50, R()), x = lerp(x0, x1, R()), lw = R.r(8, 22);
      g.fillStyle = rgba(P.dark, 0.45); g.fillRect(x - lw / 2, y + 1.4, lw, 1.4);
      g.fillStyle = rgba(P.snow, 0.8); g.beginPath(); g.ellipse(x, y, lw / 2, 1.5, 0, 0, TAU); g.fill();
    }
    // snow on the summit (pointed) or the plateau (flat)
    if (!m.fw) {
      const sy = m.top + h * R.r(0.08, 0.16);
      const sn = [x0, m.top - 12];
      for (let x = x0; x <= x1; x += 5) sn.push(x, sy + (R() * 2 - 1) * 4 + Math.abs(x - tx) * 0.35 + (R() < 0.25 ? R.r(4, 12) : 0));
      sn.push(x1, m.top - 12);
      g.save(); poly(g, sn); g.clip(); g.fillStyle = P.snow; g.fillRect(x0, m.top - 10, x1 - x0, h); g.restore();
    } else { g.fillStyle = P.snow; g.fillRect(tx - m.fw / 2 - 2, m.top - 2, m.fw + 4, 4); }
    const gr = g.createLinearGradient(0, m.top + h * 0.15, 0, base - 10);
    gr.addColorStop(0, rgba(P.haze, 0)); gr.addColorStop(1, rgba(P.haze, 0.9));
    g.fillStyle = gr; g.fillRect(x0, m.top - 10, x1 - x0, h + 20);
    g.restore();
    if (m.fw) {
      const y = m.top + 2;
      if (m.zone === 1) { if (m.deco < 0.5) midNest(g, tx, y, P); else midShrine(g, tx, y, P); }
      else if (m.zone === 2) { if (m.deco < 0.7) midWyvern(g, tx + (m.deco - 0.35) * 10, y + 1, 0.85 + m.deco * 0.4, m.deco < 0.35 ? -1 : 1, P); else midNest(g, tx, y, P, 1.2); }
    }
  }
  // far rope bridges with tiny planks between neighbouring roost spires
  for (const [a, b] of LAY.midLinks) {
    if (b.tx < xa - 20 || a.tx > xb + 20) continue;
    const ax = a.tx + a.fw / 2 - 1, ay = a.top + 3, bx = b.tx - b.fw / 2 + 1, by = b.top + 3;
    const mx = (ax + bx) / 2, my = (ay + by) / 2 + 22;
    g.strokeStyle = rgba(P.dark, 0.8); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by); g.stroke();
    g.beginPath(); g.moveTo(ax, ay - 6); g.quadraticCurveTo(mx, my - 6, bx, by - 6); g.lineWidth = 0.8; g.stroke();
    for (let f = 0.06; f < 0.95; f += 0.07) {
      const x = (1 - f) * (1 - f) * ax + 2 * (1 - f) * f * mx + f * f * bx, y = (1 - f) * (1 - f) * ay + 2 * (1 - f) * f * my + f * f * by;
      g.fillStyle = rgba(P.dark, 0.85); g.fillRect(x - 1.3, y - 1, 2.6, 2.2);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// shared rock/wood drawing
// ---------------------------------------------------------------------------------------------------------------
// faceted rock face between topFn and yBot: lit left planes, shaded right planes, crevices, snowy ledges
function faces(g, xs, xe, topFn, P, seed, step, yBot) {
  const edge = (i) => i * step + (hash2(i, seed) - 0.5) * step * 0.5;
  for (let i = Math.floor(xs / step) - 2; ; i++) {
    const xa = edge(i), xb = edge(i + 1);
    if (xa > xe + 4) break;
    if (xb < xs - 4) continue;
    const h = hash2(i * 3, seed + 1), w = xb - xa;
    const ya = topFn(xa) + 4 + h * 18, yb = topFn(xb) + 4 + hash2(i * 3 + 3, seed + 1) * 18;
    const mx = xa + w * (0.35 + h * 0.2), my = Math.min(ya, yb) - 6 - h * 10;
    g.fillStyle = P.rockSh; poly(g, [mx, my, xb, yb, xb + 2, yBot, mx + w * 0.1, yBot]); g.fill();
    g.fillStyle = rgba(P.rockHi, P.hiA ?? 0.75); poly(g, [xa, ya, mx, my, mx - w * 0.08, my + 30, xa + w * 0.1, yBot, xa, yBot]); g.fill();
    g.strokeStyle = P.crev; g.lineWidth = P.crevW ?? 1.6;
    polyline(g, [xa, ya, xa + 3, ya + 40, xa - 2, ya + 90, xa + 2, yBot]); g.stroke();
    const nl = P.ledges ?? 3;
    for (let k = 0; k < nl; k++) {
      const ly = lerp(Math.max(ya, yb) + 16, yBot - 30, hash2(i * 7 + k, seed + 2));
      const lx = xa + w * hash2(i * 5 + k, seed + 3) * 0.5, lw = w * (0.3 + 0.4 * hash2(i + k, seed + 4));
      g.fillStyle = rgba(P.crev, 0.75); g.fillRect(lx, ly + 2, lw, 2.2);
      if (P.snow) { g.fillStyle = P.snow; g.beginPath(); g.ellipse(lx + lw / 2, ly, lw / 2, 2.4, 0, 0, TAU); g.fill(); }
    }
  }
}
// slanted bedding planes (dark seam + lit lip), world-aligned
function strata(g, xs, xe, topFn, yBot, P, seed, a = 0.45) {
  for (let gx = al(xs, 46) - 92; gx < xe + 92; gx += 46) {
    for (let k = 0; k < 7; k++) {
      const h = hash2(gx, k + seed);
      if (h < 0.42) continue;
      const len = 26 + hash2(gx, k + seed + 1) * 60, x = gx + hash2(gx, k + seed + 2) * 30;
      const y = 50 + k * 46 + hash2(gx, k + seed + 3) * 28 - x * 0.04 % 46;
      if (y < topFn(x) + 12 || y > yBot - 10) continue;
      const dy = -len * 0.12;
      strokeLine(g, [x, y, x + len * 0.5, y + dy * 0.5 + 1.5, x + len, y + dy], 1.3, rgba(P.crev, a));
      strokeLine(g, [x + 2, y + 2, x + len * 0.5, y + dy * 0.5 + 3.3, x + len - 3, y + dy + 1.8], 1, rgba(P.rockHi, a * 0.9));
    }
  }
}
// angular boulder; origin = base centre
function drawBoulder(g, w, h, seed, P, lw = 2.4, snow = true) {
  const R = mulberry(seed);
  const n = R.i(7, 9);
  const pts = [w / 2 + R.r(-2, 2), 4];
  const top = [];
  for (let i = 1; i < n; i++) {
    const a = (Math.PI * i) / n;
    const rx = (w / 2) * R.r(0.88, 1.04), ry = h * R.r(0.86, 1.04);
    const x = Math.cos(a) * rx, y = -Math.sin(a) * ry * (i < n / 2 ? 1 : 0.94);
    pts.push(x, y);
    if (y < -h * 0.55) top.push(x, y);
  }
  pts.push(-w / 2 + R.r(-2, 2), 4);
  const cx = -w * 0.1, cy = -h * 0.55;
  ink(g, (g) => poly(g, pts), P.rock, lw, (g) => {
    const lit = [cx, cy];
    for (let i = 0; i < pts.length; i += 2) if (pts[i] < w * 0.1 && pts[i + 1] < -h * 0.25) lit.push(pts[i], pts[i + 1]);
    lit.push(-w * 0.2, -h * 0.9);
    if (lit.length > 6) { poly(g, lit); g.fillStyle = P.rockHi; g.fill(); }
    poly(g, [cx + w * 0.05, cy, w * 0.2, -h * 1.2, w, -h * 1.2, w, 10, w * 0.12, 10]); g.fillStyle = P.rockSh; g.fill();
    poly(g, [-w, 10, -w, -h * 0.14, -w * 0.2, -h * 0.2, w, -h * 0.1, w, 10]); g.fillStyle = rgba(P.rockSh, 0.7); g.fill();
    strokeLine(g, [cx, cy, cx + w * 0.05, cy, w * 0.2, -h * 1.0], 1.3, rgba(LINE, 0.5));
    for (let k = 0; k < 2; k++) {
      const sx = R.r(-w * 0.35, w * 0.3), sy = R.r(-h * 0.7, -h * 0.25);
      strokeLine(g, [sx, sy, sx + R.r(-8, 8), sy + R.r(6, 14), sx + R.r(-10, 10), sy + R.r(14, 22)], 1.2, P.crev || P.crack);
    }
  });
  if (snow && top.length >= 4) {
    const tp = [];
    for (let i = 0; i < top.length; i += 2) tp.push([top[i], top[i + 1]]);
    tp.sort((a, b) => a[0] - b[0]);
    snowCap(g, tp[0][0] - 3, tp[tp.length - 1][0] + 3, (x) => interpX(tp, x) - 1, Math.min(10, h * 0.2), seed + 3, P, 1.4, 2);
  }
}
function interpX(tp, x) { // tp sorted by x asc
  if (x <= tp[0][0]) return tp[0][1];
  for (let i = 0; i < tp.length - 1; i++) if (x <= tp[i + 1][0]) return lerp(tp[i][1], tp[i + 1][1], (x - tp[i][0]) / (tp[i + 1][0] - tp[i][0] || 1));
  return tp[tp.length - 1][1];
}
// snow cap along a top edge from xl to xr (top y via fn), drips below; inked
function snowCap(g, xl, xr, topFn, depth, seed, P, lw = 1.6, over = 3) {
  const R = mulberry(seed);
  const s = [xl - over, topFn(xl) + depth * 0.5];
  for (let x = xl; x <= xr; x += 6) s.push(x, topFn(x) - R.r(1.5, 4));
  s.push(xr + over, topFn(xr) + depth * 0.5);
  for (let x = xr - 4; x > xl + 3; x -= R.r(7, 13)) s.push(x, topFn(x) + depth * R.r(0.45, 1.15));
  ink(g, (g) => blob(g, s), P.snowSh, lw, (g) => {
    g.save(); g.translate(-1, -depth * 0.32); blob(g, s); g.fillStyle = P.snow; g.fill(); g.restore();
  });
}
// chunk-safe snow along a ledge: lumps sit on a world-aligned grid, so neighbouring tiles match exactly
function snowLedge(g, xa, xb, topFn, depth, seed, P, lw = 1.5) {
  const st = 9, x0 = Math.floor(xa / st) * st - st * 3, x1 = Math.ceil(xb / st) * st + st * 3;
  const top = [], bot = [];
  for (let x = x0; x <= x1; x += st) {
    top.push(x, topFn(x) - 2 - 2.5 * hash2(x, seed));
    bot.push(x, topFn(x) + depth * (0.45 + 0.75 * hash2(x + 3, seed + 1)) + (hash2(x, seed + 2) > 0.86 ? depth * 0.9 : 0));
  }
  const pts = top.slice();
  for (let i = bot.length - 2; i >= 0; i -= 2) pts.push(bot[i], bot[i + 1]);
  ink(g, (g) => blob(g, pts), P.snowSh, lw, (g) => {
    g.save(); g.translate(-1, -depth * 0.34); blob(g, pts); g.fillStyle = P.snow; g.fill(); g.restore();
  });
}
// thick rope (quadratic sag) with a twisted texture
function rope(g, ax, ay, bx, by, sag, th, P) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2 + sag * 2;
  const path = () => { g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by); };
  path(); g.lineWidth = th + 1.8 * LK; g.strokeStyle = LINE; g.stroke();
  path(); g.lineWidth = th; g.strokeStyle = P.rope; g.stroke();
  g.save(); g.setLineDash([1.6, 3.2]); path(); g.lineWidth = th * 0.75; g.strokeStyle = P.ropeSh; g.stroke(); g.restore();
  g.save(); g.translate(-0.4, -th * 0.28); path(); g.lineWidth = Math.max(0.8, th * 0.28); g.strokeStyle = rgba('#fff6e0', 0.55); g.stroke(); g.restore();
}
// rope wraps around a post at height y (n turns)
function ropeWrap(g, x, y, hw, n, P) {
  for (let i = 0; i < n; i++) {
    const yy = y + i * 3.2;
    ink(g, (g) => { g.beginPath(); g.moveTo(x - hw - 1, yy + 1.2); g.quadraticCurveTo(x, yy - 1.6, x + hw + 1, yy + 1.2); g.lineTo(x + hw + 1, yy + 3.4); g.quadraticCurveTo(x, yy + 0.8, x - hw - 1, yy + 3.4); g.closePath(); }, i % 2 ? P.ropeSh : P.rope, 1.1);
  }
}

// --- the Dragon King's things + clan things ---
function kingEmblem(g, cx, cy, s, col, eye) {
  g.save(); g.translate(cx, cy); g.scale(s / 44, s / 44);
  g.fillStyle = col;
  poly(g, [-9, -15, -12, -27, -4, -19, 1, -31, 6, -19, 14, -27, 11, -15]); g.fill();
  g.beginPath();
  g.moveTo(16, -12); g.quadraticCurveTo(4, -17, -7, -12);
  g.lineTo(-20, -7); g.lineTo(-23, -2); g.lineTo(-11, -1); g.lineTo(-19, 6); g.lineTo(-6, 6);
  g.quadraticCurveTo(3, 9, 7, 18); g.lineTo(17, 21); g.quadraticCurveTo(14, 6, 19, -4); g.lineTo(28, -12); g.lineTo(20, -9);
  g.closePath(); g.fill();
  poly(g, [19, -4, 26, 0, 18, 3, 24, 8, 16, 10]); g.fill();
  g.fillStyle = eye;
  poly(g, [-6, -8, 2, -10, -1, -6]); g.fill();
  g.restore();
}
function clanEmblem(g, cx, cy, s, col) {
  g.save(); g.translate(cx, cy); g.scale(s / 40, s / 40);
  g.strokeStyle = col; g.lineWidth = 2.4;
  g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.stroke();
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(8, -12); g.quadraticCurveTo(14, -6, 6, -2); g.quadraticCurveTo(-8, 3, -4, 10); g.quadraticCurveTo(0, 14, 8, 11);
  g.lineTo(6, 14); g.quadraticCurveTo(-6, 17, -9, 9); g.quadraticCurveTo(-11, 0, 2, -5); g.quadraticCurveTo(7, -7, 4, -10); g.closePath(); g.fill();
  poly(g, [4, -10, 3, -16, 7, -13, 10, -17, 11, -12, 15, -11, 9, -8]); g.fill();
  poly(g, [-2, -2, -12, -12, -6, -3]); g.fill();
  g.restore();
}
function bannerPath(g, x, y, w, h, seed, rag = 3) {
  const R = mulberry(seed);
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w + 1, y + h * 0.85);
  const n = rag + 2;
  for (let i = 1; i <= n; i++) {
    const xx = x + w - (w * i) / n;
    g.lineTo(xx + w / n / 2, y + h * (i % 2 ? 1 : 0.86) + R.r(-4, 4));
  }
  g.lineTo(x - 1, y + h * 0.85); g.closePath();
}
function drawKingBanner(g, x, y, w, h, seed, lw = 2.2) {
  ink(g, (g) => bannerPath(g, x, y, w, h, seed), KING.cloth, lw, (g) => {
    g.fillStyle = KING.clothHi; g.fillRect(x, y, w * 0.18, h);
    g.fillStyle = KING.clothSh; g.fillRect(x + w * 0.78, y, w * 0.3, h);
    g.strokeStyle = rgba(KING.green, 0.8); g.lineWidth = 1.6;
    g.strokeRect(x + 5, y + 5, w - 10, h * 0.8 - 6);
    kingEmblem(g, x + w / 2, y + h * 0.4, Math.min(w * 0.8, h * 0.5), KING.green, KING.cloth);
  });
  ink(g, (g) => { g.beginPath(); g.rect(x - 6, y - 4, w + 12, 5); }, '#3a3036', 1.4);
}
function drawFlagCloth(g, w, h) {
  const pts = [0, 2, w, 6, w - 16, h * 0.5, w, h - 6, 0, h - 2];
  ink(g, (g) => poly(g, pts), KING.cloth, 1.8, (g) => {
    g.fillStyle = KING.clothHi; g.fillRect(0, 0, w, 8);
    g.fillStyle = KING.clothSh; g.fillRect(0, h - 14, w, 14);
    kingEmblem(g, w * 0.42, h * 0.52, h * 0.66, KING.green, KING.cloth);
    g.strokeStyle = rgba(KING.green, 0.7); g.lineWidth = 1.4; g.beginPath(); g.moveTo(4, 5); g.lineTo(w - 4, 8); g.stroke();
  });
}
// sitting dragon statue (faces right), origin = base centre on the pedestal; height ~ 90*k
function drawDragonStatue(g, col, sh, hi, k, broken = false) {
  g.save(); g.scale(k, k);
  if (broken) {
    // the head struck off: tail, folded wing, body, foreleg, a jagged neck stump
    ink(g, (g) => { g.beginPath(); g.moveTo(-30, 0); g.quadraticCurveTo(-40, -8, -30, -14); g.quadraticCurveTo(-22, -10, -24, -4); g.quadraticCurveTo(-20, 2, 20, 0); g.closePath(); }, col, 2.4);
    const body = [-24, 0, -30, -18, -22, -38, -6, -52, 10, -58, 18, -52, 16, -30, 24, -12, 22, 0];
    ink(g, (g) => blob(g, body), col, 2.6, (g) => {
      g.fillStyle = sh; g.beginPath(); g.ellipse(10, -10, 18, 22, 0, 0, TAU); g.fill();
      g.fillStyle = hi; g.beginPath(); g.ellipse(-16, -30, 6, 14, 0.4, 0, TAU); g.fill();
      g.strokeStyle = rgba(LINE, 0.5); g.lineWidth = 1.2;
      for (let y = -48; y < -20; y += 7) { polyline(g, [8, y, 14, y + 2]); g.stroke(); }
      strokeLine(g, [-12, -44, -6, -34, -12, -24], 1, rgba(LINE, 0.6));
    });
    ink(g, (g) => poly(g, [12, -30, 20, -30, 24, -2, 30, 0, 12, 0]), col, 2.4, (g) => { g.fillStyle = sh; g.fillRect(19, -30, 12, 32); });
    ink(g, (g) => poly(g, [3, -52, 4, -62, 9, -66, 12, -64.5, 15, -69, 19, -66, 20, -52]), col, 2.6, (g) => { g.fillStyle = sh; g.fillRect(13, -74, 10, 24); g.fillStyle = mix(sh, hi, 0.4); poly(g, [4, -62, 9, -66, 12, -64.5, 15, -69, 19, -66, 18, -63, 12, -61, 7, -61]); g.fill(); });
    g.restore();
    return;
  }
  ink(g, (g) => { g.beginPath(); g.moveTo(-30, 0); g.quadraticCurveTo(-40, -8, -30, -14); g.quadraticCurveTo(-22, -10, -24, -4); g.quadraticCurveTo(-20, 2, 20, 0); g.closePath(); }, col, 2.4);
  ink(g, (g) => poly(g, [-6, -52, -34, -86, -30, -60, -40, -50, -24, -40, -30, -26, -10, -24]), sh, 2.4, (g) => {
    strokeLine(g, [-6, -52, -30, -60], 1.2, rgba(LINE, 0.6)); strokeLine(g, [-8, -40, -24, -40], 1.2, rgba(LINE, 0.6));
  });
  const body = [-24, 0, -30, -18, -22, -38, -6, -52, 10, -58, 18, -52, 16, -30, 24, -12, 22, 0];
  ink(g, (g) => blob(g, body), col, 2.6, (g) => {
    g.fillStyle = sh; g.beginPath(); g.ellipse(10, -10, 18, 22, 0, 0, TAU); g.fill();
    g.fillStyle = hi; g.beginPath(); g.ellipse(-16, -30, 6, 14, 0.4, 0, TAU); g.fill();
    g.strokeStyle = rgba(LINE, 0.5); g.lineWidth = 1.2;
    for (let y = -48; y < -20; y += 7) { polyline(g, [8, y, 14, y + 2]); g.stroke(); }
  });
  ink(g, (g) => poly(g, [12, -30, 20, -30, 24, -2, 30, 0, 12, 0]), col, 2.4, (g) => { g.fillStyle = sh; g.fillRect(19, -30, 12, 32); });
  ink(g, (g) => { g.beginPath(); g.moveTo(4, -52); g.quadraticCurveTo(4, -76, 14, -86); g.lineTo(24, -88); g.lineTo(36, -82); g.lineTo(36, -76); g.lineTo(24, -74); g.quadraticCurveTo(18, -66, 18, -52); g.closePath(); }, col, 2.6, (g) => {
    g.fillStyle = sh; poly(g, [18, -70, 40, -76, 40, -60, 18, -50]); g.fill();
    g.fillStyle = LINE; g.beginPath(); g.ellipse(22, -82, 2.2, 1.4, 0, 0, TAU); g.fill();
  });
  ink(g, (g) => poly(g, [12, -86, 2, -100, 16, -90]), sh, 2);
  ink(g, (g) => poly(g, [18, -88, 14, -102, 24, -90]), sh, 2);
  g.restore();
}

// --- wind-bent pine (krummholz): trunk leans right, branches swept to the lee side; origin = base centre
function drawWindPine(g, h, lean, seed, P, lw = 2.3) {
  const R = mulberry(seed);
  const tx = lean * h;
  const tw = Math.max(3, h * 0.045);
  ink(g, (g) => { g.beginPath(); g.moveTo(-tw, 6); g.quadraticCurveTo(-tw - h * 0.03, -h * 0.5, tx - 1.5, -h); g.lineTo(tx + 1.5, -h); g.quadraticCurveTo(tw - h * 0.01, -h * 0.48, tw * 1.1, 6); g.closePath(); }, P.bark, lw, (g) => {
    g.fillStyle = P.barkSh; g.fillRect(tw * 0.1, -h * 1.1, h, h * 1.2);
    g.strokeStyle = P.barkSh; g.lineWidth = 1.1;
    for (let i = 0; i < 4; i++) { const y = -R.r(5, h * 0.35); polyline(g, [-tw * 0.7, y, -tw * 0.1, y - 3]); g.stroke(); }
  });
  // a gnarled dead branch pointing downwind
  strokeLine(g, [tx * 0.3, -h * 0.3, tx * 0.3 + h * 0.12, -h * 0.36, tx * 0.3 + h * 0.2, -h * 0.33], 2.6 * LK + 1, LINE);
  strokeLine(g, [tx * 0.3, -h * 0.3, tx * 0.3 + h * 0.12, -h * 0.36, tx * 0.3 + h * 0.2, -h * 0.33], 2, P.bark);
  const tp = (f) => [2 * (1 - f) * f * (-h * 0.02) + f * f * tx, 2 * (1 - f) * f * (-h * 0.5) + f * f * (-h)];
  const n = h > 200 ? 8 : h > 120 ? 7 : h > 70 ? 6 : 5;
  for (let i = 0; i < n; i++) {
    const f = lerp(0.3, 1.0, i / (n - 1));
    const [bx, by] = tp(f);
    // a dense foliage pad swept downwind: domed top, long tapering lee tip, a toothed underside
    const wr = h * lerp(0.46, 0.15, f) * R.r(0.88, 1.12), wl = wr * R.r(0.2, 0.34), th = h * lerp(0.19, 0.12, f) * R.r(0.9, 1.1);
    const pts = [bx - wl, by + th * 0.2, bx - wl * 0.7, by - th * 0.35, bx - wl * 0.1, by - th * 0.68, bx + wr * 0.25, by - th * 0.8, bx + wr * 0.6, by - th * 0.62,
      bx + wr * 0.85, by - th * 0.42, bx + wr * 1.08, by - th * 0.3];
    const teeth = 4 + Math.round(wr / 22);
    for (let k = 1; k <= teeth; k++) {
      const u = k / teeth, x = lerp(bx + wr * 1.0, bx - wl * 0.9, u);
      pts.push(x + R.r(-2, 2), by + th * (0.08 + 0.26 * Math.sin(u * Math.PI)) * R.r(0.6, 1.0));
      if (k < teeth) pts.push(x - (wr + wl) / teeth * 0.5, by + th * (0.36 + 0.3 * Math.sin(u * Math.PI)) * R.r(0.85, 1.2));
    }
    ink(g, (g) => poly(g, pts), P.pine, lw, (g) => {
      g.fillStyle = P.pineSh; poly(g, [bx - wl * 2, by - th * 0.02, bx + wr * 1.3, by - th * 0.24, bx + wr * 1.3, by + th, bx - wl * 2, by + th]); g.fill();
      g.fillStyle = rgba(P.pineHi, 0.55); g.beginPath(); g.ellipse(bx + wr * 0.1, by - th * 0.42, wr * 0.32, th * 0.2, -0.1, 0, TAU); g.fill();
      g.strokeStyle = P.pineHi; g.lineWidth = 1.1;
      for (let k = 0; k < 4 + wr / 10; k++) {
        const sx = bx + R.r(-wl * 0.6, wr * 0.8), sy = by - th * R.r(0.0, 0.55);
        polyline(g, [sx, sy, sx + R.r(5, 9), sy + R.r(0, 3)]); g.stroke();
      }
    });
    // snow on the windward (upper) surface
    const sn = [bx - wl * 0.75, by - th * 0.32, bx - wl * 0.15, by - th * 0.72, bx + wr * 0.25, by - th * 0.86, bx + wr * 0.62, by - th * 0.68, bx + wr * 0.86, by - th * 0.46,
      bx + wr * 0.6, by - th * R.r(0.46, 0.54), bx + wr * 0.3, by - th * R.r(0.5, 0.6), bx, by - th * R.r(0.42, 0.52), bx - wl * 0.5, by - th * 0.28];
    ink(g, (g) => blob(g, sn), P.snowSh, 1.3, (g) => { g.save(); g.translate(-0.5, -2); blob(g, sn); g.fillStyle = P.snow; g.fill(); g.restore(); });
  }
}
// a tiny eyrie on a crag top: twig bowl with two eaglets
function drawEyrie(g, x, y, P, flip = 1) {
  const R = mulberry(x | 0);
  ink(g, (g) => { g.beginPath(); g.ellipse(x, y - 7, 26, 9, 0, 0, TAU); }, P.twig, 2, (g) => {
    g.fillStyle = P.twigSh; g.fillRect(x - 30, y - 6, 60, 12);
    g.strokeStyle = P.twigHi; g.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) { const a = R.r(-24, 18); polyline(g, [x + a, y - R.r(4, 13), x + a + R.r(6, 12), y - R.r(1, 10)]); g.stroke(); }
  });
  for (const [dx, dy, d] of [[-8, -15, -1], [7, -17, 1]]) {
    const hx = x + dx * flip, hy = y + dy;
    ink(g, (g) => { g.beginPath(); g.ellipse(hx, hy, 6, 6.5, 0, 0, TAU); }, '#f4f1ec', 1.6, (g) => { g.fillStyle = '#c9c3c9'; g.fillRect(hx + 1, hy - 6, 6, 13); });
    ink(g, (g) => poly(g, [hx + d * 4, hy - 1, hx + d * 10, hy + 1, hx + d * 4, hy + 2.5]), '#f0b43c', 1.2);
    g.fillStyle = LINE; g.beginPath(); g.arc(hx + d * 2, hy - 1.5, 1.1, 0, TAU); g.fill();
  }
  for (let i = 0; i < 5; i++) { const a = R.r(-26, 26); strokeLine(g, [x + a, y - 10, x + a + R.r(-10, 12), y - R.r(14, 20)], 1.6, P.twigSh); }
}

// ---------------------------------------------------------------------------------------------------------------
// LIVE CLOTH, BIRDS, FIRE
// ---------------------------------------------------------------------------------------------------------------
// a rope of prayer flags blown downwind
function drawPrayerLine(ctx, ax, ay, bx, by, sag, n, t, seed, wind, line, torn = 0) {
  if (Math.max(ax, bx) < -30 || Math.min(ax, bx) > W + 30) return;
  const mx = (ax + bx) / 2, my = (ay + by) / 2 + sag * 2;
  ctx.strokeStyle = '#4a3b33'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
  const stream = clamp(0.25 + 0.5 * wind, 0, 0.9);
  const fw = 11, fl = 15;
  ctx.lineWidth = 1.1; ctx.strokeStyle = line;
  for (let i = 1; i < n; i++) {
    if (torn && hash1(i * 7 + seed * 13) < torn) continue;
    const f = i / n;
    const x = (1 - f) * (1 - f) * ax + 2 * (1 - f) * f * mx + f * f * bx, y = (1 - f) * (1 - f) * ay + 2 * (1 - f) * f * my + f * f * by;
    const ph = t * (5 + 6 * wind) + i * 1.1 + seed * 2.3;
    const st = stream * (0.82 + 0.18 * Math.sin(ph));
    const dx = fl * st, dy = fl * Math.sqrt(1 - st * st * 0.8);
    const wob = Math.sin(ph * 1.7) * 2.2 * (0.4 + wind);
    ctx.beginPath();
    ctx.moveTo(x - fw / 2, y); ctx.lineTo(x + fw / 2, y);
    ctx.lineTo(x + fw / 2 + dx + wob * 0.5, y + dy - wob * 0.3);
    ctx.lineTo(x - fw / 2 + dx + wob, y + dy + wob * 0.2);
    ctx.closePath();
    ctx.fillStyle = PRAYER[(i + seed) % 5]; ctx.fill(); ctx.stroke();
  }
}
// a long tapered pennant streaming from a pole top
function drawStreamer(ctx, x, y, len, wd, t, seed, wind, col, stripe, line) {
  if (x > W + 20 || x + len < -20) return;
  const n = 9, stream = clamp(0.35 + 0.6 * wind, 0, 1);
  const top = [], bot = [], mid = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const ph = t * (5.5 + 6 * wind) - i * 0.8 + seed;
    const px = x + f * len * (0.4 + 0.6 * stream);
    const py = y + 4 + f * len * (1 - stream) * 0.8 + Math.sin(ph) * (2 + 7 * wind) * f;
    const hw = wd * 0.5 * (1 - f * 0.72);
    top.push(px, py - hw); bot.push(px, py + hw); mid.push(px, py);
  }
  const tail = [mid[n * 2] - wd * 0.35, mid[n * 2 + 1]];
  ctx.beginPath(); ctx.moveTo(top[0], top[1]);
  for (let i = 2; i < top.length; i += 2) ctx.lineTo(top[i], top[i + 1]);
  ctx.lineTo(tail[0], tail[1]);
  for (let i = bot.length - 2; i >= 0; i -= 2) ctx.lineTo(bot[i], bot[i + 1]);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = line; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mid[0], mid[1]);
  for (let i = 2; i < (n - 1) * 2; i += 2) ctx.lineTo(mid[i], mid[i + 1]);
  ctx.lineWidth = wd * 0.22; ctx.strokeStyle = stripe; ctx.stroke();
}
// draw a pre-rendered flag sprite as vertical strips with a travelling wave (pole on the left)
function drawFlag(ctx, spr, x, y, t, seed, amp = 5, strips = 10, speed = 5.2) {
  const sw = spr.c.width / strips, dw = spr.w / strips;
  for (let i = 0; i < strips; i++) {
    const f = i / (strips - 1);
    const off = Math.sin(t * speed - i * 0.7 + seed) * amp * f;
    const sh = 1 + 0.04 * Math.sin(t * speed - i * 0.7 + seed + 1.3) * f;
    ctx.drawImage(spr.c, i * sw, 0, sw + 0.5, spr.c.height, x + i * dw, y + off, dw + 0.35, spr.h * sh);
  }
}
// hanging banner swaying (top fixed): horizontal strips
function drawHang(ctx, spr, x, y, t, seed, amp = 3, strips = 8, lean = 0) {
  const sh = spr.c.height / strips, dh = spr.h / strips;
  for (let i = 0; i < strips; i++) {
    const f = i / (strips - 1);
    const off = (Math.sin(t * 2.4 - i * 0.45 + seed) * amp + lean) * f * f;
    ctx.drawImage(spr.c, 0, i * sh, spr.c.width, sh + 0.5, x + off, y + i * dh, spr.w, dh + 0.35);
  }
}
// a sprite anchored at its base swaying in the wind (top moves most): horizontal strips
function drawSway(ctx, spr, x, y, t, seed, amp, strips = 7) {
  const sh = spr.c.height / strips, dh = spr.h / strips;
  const x0 = x - spr.ox, y0 = y - spr.oy;
  for (let i = 0; i < strips; i++) {
    const f = 1 - (i + 0.5) / strips;            // 1 at the top, 0 at the base
    const off = amp * f * f * (0.7 + 0.3 * Math.sin(t * 1.9 + seed + f));
    ctx.drawImage(spr.c, 0, i * sh, spr.c.width, sh + 0.6, x0 + off, y0 + i * dh, spr.w, dh + 0.4);
  }
}
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
      const sway = Math.sin(t * 6 + ph) * size * 0.1 + size * 0.16;   // the wind leans the flames right
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
    ctx.fillRect(x + ph * size * 1.2 + Math.sin(ph * 9 + i + seed) * size * 0.3, y - size * 0.6 - ph * size * 1.3, 2, 2);
  }
  ctx.globalAlpha = 1;
}
// tiny dragon/wyvern silhouette (faces +x when dir = 1)
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
// soaring bird (eagle) silhouette
function birdSil(ctx, x, y, s, flap) {
  const wy = -5 * flap * s;
  ctx.beginPath();
  ctx.moveTo(x - 15 * s, y + wy - 1.5 * s);
  ctx.quadraticCurveTo(x - 7 * s, y - 4.5 * s + wy * 0.5, x - 1 * s, y - 0.5 * s);
  ctx.lineTo(x + 3 * s, y - 1.6 * s); ctx.lineTo(x + 2.4 * s, y);
  ctx.quadraticCurveTo(x + 7 * s, y - 4.5 * s + wy * 0.5, x + 15 * s, y + wy - 1.5 * s);
  ctx.quadraticCurveTo(x + 7 * s, y - 1.2 * s + wy * 0.3, x + 1 * s, y + 2.2 * s);
  ctx.lineTo(x - 3.5 * s, y + 3.2 * s); ctx.lineTo(x - 2.5 * s, y + 1.4 * s);
  ctx.quadraticCurveTo(x - 7 * s, y - 1.2 * s + wy * 0.3, x - 15 * s, y + wy - 1.5 * s);
  ctx.fill();
}

// lightning schedule (gentle: soft ramps, one after-flicker, long gaps): null or { f: 0..1, k: strike index }
function lightning(t) {
  const period = 6.8;
  const k = Math.floor(t / period);
  const start = k * period + hash1(k * 7 + 3) * 3.2;
  const dt = t - start;
  if (dt < 0 || dt > 1.0) return null;
  let f;
  if (dt < 0.06) f = dt / 0.06;
  else if (dt < 0.2) f = 1 - ((dt - 0.06) / 0.14) * 0.7;
  else if (dt < 0.3) f = 0.3 + ((dt - 0.2) / 0.1) * 0.3;
  else f = 0.6 * (1 - (dt - 0.3) / 0.7);
  return { f: clamp(f, 0, 1), k };
}
function drawBolt(ctx, k, f, yMax) {
  const R = mulberry(k * 131 + 7);
  let x = R.r(140, 820), y = 18;
  const pts = [x, y];
  while (y < yMax) { x += R.r(-24, 24); y += R.r(14, 28); pts.push(x, y); }
  ctx.lineJoin = 'round';
  for (const [lw, col] of [[8, `rgba(120,240,190,${0.18 * f})`], [3.2, `rgba(190,255,225,${0.6 * f})`], [1.4, `rgba(245,255,250,${0.9 * f})`]]) {
    polyline(ctx, pts); ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke();
  }
  const i = 2 + Math.floor(R() * 3) * 2;
  if (i < pts.length - 2) {
    let bx = pts[i], by = pts[i + 1];
    const br = [bx, by];
    for (let j = 0; j < 4; j++) { bx += R.r(10, 28) * (R() < 0.5 ? -1 : 1); by += R.r(10, 20); br.push(bx, by); }
    polyline(ctx, br); ctx.lineWidth = 1.3; ctx.strokeStyle = `rgba(210,255,230,${0.6 * f})`; ctx.stroke();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let S = 0;                // device px per logical px
  let C = null;             // caches
  let warm = 0;             // 0 = storm (venom-green fire), 1 = the storm broken into golden sunlight
  // wind: a base strength by section, a slow natural gusting, plus engine gusts (windGust) decaying over ~1 s
  let gustK = 0, gustT0 = -99, lastT = null, windPh = 0, windNow = 0.4, curT = 0, curCam = 0;
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
  function setWarm(w) {
    warm = clamp(+w || 0, 0, 1);
    if (warm > 0 && C && !C.far.gold) buildPalette(C, 'gold');   // one-off (~20-40 ms) when the storm first breaks
  }
  function gustAt(t) {
    const d = t - gustT0;
    if (d < 0 || d > 2.2) return 0;
    return gustK * (d < 0.14 ? d / 0.14 : Math.exp(-(d - 0.14) * 2.4));
  }
  // engine hook: a gameplay wind gust (0..1, 1 = full gale); cloth, pines and particles whip harder, decaying over ~1 s
  function windGust(k) {
    const t = lastT ?? 0;
    gustK = Math.max(gustAt(t), clamp(+k || 0, 0, 1.5)); gustT0 = t;
  }
  function windBase(camX) {
    return (0.34 + 0.22 * sstep(1500, 2600, camX) + 0.14 * sstep(3500, 4600, camX) + 0.4 * sstep(5200, 6000, camX)) * (1 - 0.6 * warm);
  }
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
    if (warm > 0) buildPalette(C, 'gold');
  }

  // ------------------------------------------------------------------ build all caches
  function buildPalette(c, k) {
    const [a, b] = PAL_RANGE[k], csFar = c.csFar, csMid = Math.min(1.25, csFar);
    c.far[k] = buildStrip(Math.floor(a * P_FAR) - 4, Math.ceil(b * P_FAR + W) + 4, 112, 372, csFar, P_FAR, (g, xa, xb) => drawFar(g, FARP[k], xa, xb));
    c.mid[k] = buildStrip(Math.floor(a * P_MID) - 4, Math.ceil(b * P_MID + W) + 4, 140, 384, csMid, P_MID, (g, xa, xb) => drawMid(g, MIDP[k], xa, xb));
    c.sea0[k] = seaTile(CSEA[k], SEA_PER, 268, 386, 11, SEA0_ROWS, Math.min(1.25, csFar), 0.5);
    c.sea1[k] = seaTile(CSEA[k], SEA_PER, 306, 388, 12, SEA1_ROWS, csMid, 0.6);
    c.cloud[k] = LAY.clouds[k].map((cl) => ({ cl, spr: cloudSprite(cl, CLOUDP[k], Math.min(0.75, csFar)) }));
  }
  function build(cs, csFar) {
    const t0 = performance.now();
    const c = { cs, csFar };
    c.far = {}; c.mid = {}; c.sea0 = {}; c.sea1 = {}; c.spire = {}; c.voids = {}; c.cloud = {};
    // the post-boss `gold` palette is built lazily on the first setWarm(> 0) (see buildPalette)
    for (const k of PAL_NAMES) if (k !== 'gold') buildPalette(c, k);
    const csMid = Math.min(1.25, csFar);
    for (const k of ['morn', 'day', 'gale']) {
      const a = Math.max(PAL_RANGE[k][0], 1300), b = Math.min(PAL_RANGE[k][1], 3950);
      c.spire[k] = buildStrip(Math.max(700, Math.floor(a * P_SPIRE) - 4), Math.min(3120, Math.ceil(b * P_SPIRE + W) + 4), 104, 392, csMid, P_SPIRE, (g, xa, xb) => drawSpires(g, k, xa, xb));
      c.voids[k] = seaTile(CSEA[k], SEA_PER, 466, H + 8, 13, VOID_ROWS, csMid, 0.8);
    }
    c.sun = radialSprite(280, 0.6, [[0, 'rgba(255,252,236,1)'], [0.08, 'rgba(255,246,214,1)'], [0.1, 'rgba(255,236,190,0.8)'], [0.28, 'rgba(255,226,180,0.3)'], [0.6, 'rgba(255,214,180,0.08)'], [1, 'rgba(255,210,180,0)']]);
    c.glow = radialSprite(64, 1, [[0, 'rgba(140,255,120,0.55)'], [0.35, 'rgba(110,235,100,0.22)'], [1, 'rgba(80,200,90,0)']]);
    c.glowWarm = radialSprite(64, 1, [[0, 'rgba(255,200,110,0.6)'], [0.35, 'rgba(255,150,60,0.25)'], [1, 'rgba(255,120,40,0)']]);
    c.mist = radialSprite(64, 0.5, [[0, 'rgba(240,246,252,0.8)'], [0.5, 'rgba(232,240,250,0.35)'], [1, 'rgba(225,236,248,0)']]);
    c.vignette = makeSprite(W, H, 0, 0, 0.25, (g) => {
      const gr = g.createRadialGradient(W / 2, H * 0.46, H * 0.36, W / 2, H * 0.5, W * 0.62);
      gr.addColorStop(0, 'rgba(6,10,14,0)'); gr.addColorStop(1, 'rgba(6,10,14,0.85)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    });
    // the boss arena's vignette, reshaped (as the L4 throne room's): centred low (61 % down) and stretched sideways, so the
    // top corners stay as dark but the screen's sides at fighter height darken about half as much -- the painted heroes'
    // ink outlines got lost in the near-black edges there (painted review, Dodongo).  ?edgefix=none: the old one (A/B)
    c.vignetteEdge = makeSprite(W, H, 0, 0, 0.25, (g) => {
      g.translate(W / 2, H * 0.61); g.scale(1.45, 1);
      const gr = g.createRadialGradient(0, 0, 230, 0, 0, 520);
      gr.addColorStop(0, 'rgba(6,10,14,0)'); gr.addColorStop(1, 'rgba(6,10,14,0.9)');
      g.fillStyle = gr; g.fillRect(-W, -H, W * 2, H * 2);
    });
    // ... and a soft cool light at the screen's sides at fighter height (the snow's bounce off the
    // lane / the storm's mist) -- the near-black edges come up a few L* more without a flat band
    c.edgeLight = makeSprite(W, H, 0, 0, 0.25, (g) => {
      const v = g.createLinearGradient(0, 210, 0, 368);
      v.addColorStop(0, 'rgba(168,198,232,0)'); v.addColorStop(0.45, 'rgba(168,198,232,0.08)'); v.addColorStop(0.85, 'rgba(168,198,232,0.08)'); v.addColorStop(1, 'rgba(168,198,232,0)');
      g.fillStyle = v; g.fillRect(0, 210, W, 158);
      const hz = g.createLinearGradient(0, 0, W, 0);         // (only the sides: cut away towards the middle)
      hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(0.2, 'rgba(0,0,0,0.35)'); hz.addColorStop(0.32, 'rgba(0,0,0,1)');
      hz.addColorStop(0.68, 'rgba(0,0,0,1)'); hz.addColorStop(0.8, 'rgba(0,0,0,0.35)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = hz; g.fillRect(0, 0, W, H);
    });
    // sunbeams breaking through the storm (setWarm), fanning down-left from the upper right
    c.rays = makeSprite(W, H, 0, 0, 0.5, (g) => {
      const sx = 760, sy = 40;
      for (const [a, wd, al] of [[2.05, 0.07, 0.5], [2.2, 0.05, 0.35], [2.36, 0.09, 0.45], [2.55, 0.06, 0.3], [2.72, 0.08, 0.4], [1.92, 0.04, 0.3]]) {
        const gr = g.createRadialGradient(sx, sy, 0, sx, sy, 900);
        gr.addColorStop(0, `rgba(255,226,160,${al})`); gr.addColorStop(0.7, `rgba(255,214,150,${al * 0.35})`); gr.addColorStop(1, 'rgba(255,210,150,0)');
        g.fillStyle = gr;
        poly(g, [sx, sy, sx + Math.cos(a - wd) * 1100, sy + Math.sin(a - wd) * 1100, sx + Math.cos(a + wd) * 1100, sy + Math.sin(a + wd) * 1100]); g.fill();
      }
    });
    // the storm's eye over the summit: spiral cloud arms (drawn squashed + slowly turning), a sickly glow at the centre
    c.vortex = makeSprite(640, 640, 320, 320, 0.5, (g) => {
      const arms = 5;
      for (let pass = 0; pass < 2; pass++) {
        for (let a = 0; a < arms; a++) {
          const a0 = (a / arms) * TAU, k = 0.0105;
          const e1 = [], e2 = [];
          for (let r = 36; r <= 318; r += 8) {
            const th = a0 + r * k, w = 10 + r * 0.22;
            e1.push(Math.cos(th) * (r + w * 0.5), Math.sin(th) * (r + w * 0.5));
            e2.push(Math.cos(th - 0.16) * (r - w * 0.5), Math.sin(th - 0.16) * (r - w * 0.5));
          }
          const pts = e1.slice();
          for (let i = e2.length - 2; i >= 0; i -= 2) pts.push(e2[i], e2[i + 1]);
          g.save(); if (pass) g.translate(-5, -4);
          blob(g, pts); g.fillStyle = pass ? 'rgba(92,116,124,0.55)' : 'rgba(40,48,60,0.95)'; g.fill();
          g.restore();
        }
      }
      const eye = g.createRadialGradient(0, 0, 0, 0, 0, 120);
      eye.addColorStop(0, 'rgba(140,240,180,0.45)'); eye.addColorStop(0.4, 'rgba(90,170,140,0.18)'); eye.addColorStop(1, 'rgba(60,120,110,0)');
      g.fillStyle = eye; g.fillRect(-120, -120, 240, 240);
      g.globalCompositeOperation = 'destination-in';
      const m = g.createRadialGradient(0, 0, 0, 0, 0, 320);
      m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.62, 'rgba(0,0,0,0.9)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = m; g.fillRect(-320, -320, 640, 640);
    });
    c.wisp = makeSprite(128, 16, 64, 8, 0.75, (g) => {
      g.save(); g.scale(1, 0.12);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 64);
      gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(250,252,255,0.3)'); gr.addColorStop(1, 'rgba(250,252,255,0)');
      g.fillStyle = gr; g.fillRect(-64, -64, 128, 128); g.restore();
    });
    // snow streak sprites at three slants (wind-driven); a soft dot for the golden motes
    c.streak = [0.1, 0.38, 0.72].map((ang) => makeSprite(26, 26, 13, 13, Math.max(1, cs), (g) => {
      g.rotate(ang); g.scale(1, 0.24);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 12);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(-12, -12, 24, 24);
    }));
    c.flake = radialSprite(3, Math.max(1, cs), [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
    c.mote = radialSprite(4, Math.max(1, cs), [[0, 'rgba(255,246,200,1)'], [0.4, 'rgba(255,220,140,0.6)'], [1, 'rgba(255,200,120,0)']]);
    c.feather = makeSprite(20, 10, 10, 5, cs, (g) => {
      lineStyle('#5a5668', 1);
      ink(g, (g) => { g.beginPath(); g.moveTo(-9, 0); g.quadraticCurveTo(-2, -4.5, 8, -1); g.quadraticCurveTo(2, 3.5, -9, 0); g.closePath(); }, NP.roost.feather, 1.1, (g) => { g.fillStyle = NP.roost.featherSh; g.fillRect(-9, 0.5, 18, 4); });
      strokeLine(g, [-10, 0.4, 8, -0.8], 0.8, '#8a8698');
    });
    // --- near layers
    c.back = buildBack(cs);
    c.ground = buildStrip(0, LEVEL_LEN, GT0, H, cs, 1, drawGround);
    c.front = buildFront(cs);
    c.buildMs = performance.now() - t0;
    return c;
  }

  // ------------------------------------------------------------------ big spires (p .55): roosts, a shrine, a far bridge
  function drawSpires(g, k, xa, xb) {
    const P = SPP[k], Q = CSEA[k];
    lineStyle(P.line, 0.6);
    const base = 392;
    for (const b of LAY.big) {
      if (b.x + b.wr < xa - 40 || b.x - b.wl > xb + 40) continue;
      const R = mulberry(b.seed);
      const { pts, tx } = spirePts(R, b.x, b.top, b.wl, b.wr, base, 0.05, b.flat);
      const x0 = b.x - b.wl - 10, x1 = b.x + b.wr + 10;
      const topFn = (x) => { const y = outlineY(pts, x); return y === Infinity ? base : y; };
      g.save(); poly(g, pts); g.clip();
      g.fillStyle = P.rock; g.fillRect(x0, b.top - 10, x1 - x0, base - b.top + 20);
      faces(g, x0, x1, topFn, { rockSh: P.rockSh, rockHi: P.rockHi, crev: P.crev, snow: P.snow, hiA: 0.62, ledges: 3, crevW: 1.3 }, b.seed % 997, 30, base);
      strata(g, x0, x1, topFn, base, { crev: P.crev, rockHi: P.rockHi }, 71, 0.3);
      const gr = g.createLinearGradient(0, b.top + (base - b.top) * 0.3, 0, base - 18);
      gr.addColorStop(0, rgba(Q.haze, 0)); gr.addColorStop(1, rgba(Q.haze, 0.95));
      g.fillStyle = gr; g.fillRect(x0, b.top - 10, x1 - x0, base - b.top + 20);
      g.restore();
      // outline, fading out into the haze toward the base
      const og = g.createLinearGradient(0, b.top, 0, base - 40);
      og.addColorStop(0, rgba(P.line, 0.9)); og.addColorStop(0.6, rgba(P.line, 0.5)); og.addColorStop(1, rgba(P.line, 0));
      poly(g, pts); g.lineWidth = 1.5; g.strokeStyle = og; g.stroke();
      // snow on the top
      if (b.flat) snowCap(g, tx - b.flat / 2 - 2, tx + b.flat / 2 + 2, (x) => topFn(clamp(x, tx - b.flat / 2, tx + b.flat / 2)) + 1, 7, b.seed + 1, P, 1.2, 3);
      else {
        g.save(); poly(g, pts); g.clip();
        const sn = [tx - 60, b.top - 12];
        for (let x = tx - 60; x <= tx + 60; x += 5) sn.push(x, b.top + 14 + Math.abs(x - tx) * 0.5 + R.r(-3, 6));
        sn.push(tx + 60, b.top - 12); poly(g, sn); g.fillStyle = P.snow; g.fill(); g.restore();
      }
      // deco
      const ty = b.top + 2;
      if (b.deco === 'nest' || b.deco === 'wyvern') {
        const nw = b.flat * 0.8;
        ink(g, (g) => { g.beginPath(); g.ellipse(tx, ty - 6, nw / 2, 9, 0, 0, TAU); }, P.twig, 1.6, (g) => {
          g.fillStyle = darken(P.twig, 0.3); g.fillRect(tx - nw / 2, ty - 5, nw, 12);
          g.strokeStyle = lighten(P.twig, 0.2); g.lineWidth = 1;
          for (let i = 0; i < 8; i++) { const a = R.r(-nw / 2, nw / 2 - 8); polyline(g, [tx + a, ty - R.r(4, 13), tx + a + R.r(6, 12), ty - R.r(1, 10)]); g.stroke(); }
        });
        if (b.deco === 'wyvern') {
          // a collared wyvern curled on its nest, head up toward the bridges
          const wc = mix(P.rockSh, '#2a2f3c', 0.5);
          g.save(); g.translate(tx, ty - 10);
          ink(g, (g) => { g.beginPath(); g.ellipse(0, 0, 26, 11, 0, Math.PI, TAU); g.lineTo(26, 2); g.lineTo(-26, 2); g.closePath(); }, wc, 1.5, (g) => { g.fillStyle = darken(wc, 0.3); g.fillRect(0, -12, 30, 16); });
          ink(g, (g) => poly(g, [-14, -8, -4, -22, 2, -9]), darken(wc, 0.2), 1.3);
          ink(g, (g) => poly(g, [4, -9, 12, -24, 16, -9]), darken(wc, 0.2), 1.3);
          ink(g, (g) => { g.beginPath(); g.moveTo(16, -6); g.quadraticCurveTo(24, -18, 30, -24); g.lineTo(40, -22); g.lineTo(34, -17); g.quadraticCurveTo(28, -12, 24, -2); g.closePath(); }, wc, 1.5);
          g.fillStyle = KING.gem; g.fillRect(25, -14, 4, 3); g.fillRect(33, -22, 2, 1.6);
          g.restore();
        } else {
          for (const dx of [-6, 5]) ink(g, (g) => { g.beginPath(); g.ellipse(tx + dx, ty - 13, 4.5, 6, 0, 0, TAU); }, '#e6eee8', 1.2);
        }
      } else if (b.deco === 'shrine') {
        // a little cliff shrine (clan red roof) on the plateau
        g.save(); g.translate(tx, ty);
        ink(g, (g) => poly(g, [-20, 2, -20, -26, 20, -26, 20, 2]), mix('#e2d6c4', Q.haze, 0.15), 1.5, (g) => { g.fillStyle = mix('#b8a99a', Q.haze, 0.15); g.fillRect(6, -28, 16, 32); g.fillStyle = '#3a3036'; g.fillRect(-6, -18, 12, 20); });
        ink(g, (g) => poly(g, [-34, -22, -26, -30, -14, -42, 0, -48, 14, -42, 26, -30, 34, -22, 22, -26, 0, -32, -22, -26]), mix(CLAN.red, Q.haze, 0.15), 1.6, (g) => { g.fillStyle = mix(CLAN.redSh, Q.haze, 0.15); g.fillRect(0, -50, 40, 30); });
        snowCap(g, -26, 26, (x) => -30 - (26 - Math.abs(x)) * 0.62 + 4, 5, 77, P, 1.1, 2);
        g.restore();
      } else if (b.deco === 'pines') {
        for (const [dx, dy, h] of [[-10, 30, 26], [8, 50, 20], [-18, 70, 18]]) {
          const x = tx + dx, y = topFn(x) + dy;
          g.save(); g.translate(x, y); drawWindPine(g, h, 0.18, (x * 7) | 0, { bark: '#5a4a44', barkSh: '#3c302c', pine: mix('#3a5658', P.rock, 0.3), pineSh: mix('#26393e', P.rock, 0.3), pineHi: mix('#5a7a6a', P.rock, 0.3), snow: P.snow, snowSh: P.snowSh }, 1.2); g.restore();
        }
      } else if (b.deco === 'flags') {
        // a prayer pole on the plateau
        strokeLine(g, [tx - 10, ty, tx - 10, ty - 46], 2.4, P.line);
        for (let i = 0; i < 6; i++) { g.fillStyle = PRAYER[i % 5]; poly(g, [tx - 9, ty - 44 + i * 6, tx + 4 + i, ty - 42 + i * 6, tx + 4 + i, ty - 38 + i * 6, tx - 9, ty - 39 + i * 6]); g.fill(); }
      }
      // cloud domes swallowing the base
      for (let i = 0; i < 6; i++) {
        const cx = lerp(x0 - 20, x1 + 20, i / 5) + R.r(-12, 12), cy = base - 26 + R.r(-6, 8), r = R.r(22, 34);
        g.fillStyle = Q.sh; g.beginPath(); g.ellipse(cx, cy, r, r * 0.62, 0, 0, TAU); g.fill();
        g.fillStyle = Q.body; g.beginPath(); g.ellipse(cx - r * 0.12, cy - r * 0.1, r * 0.84, r * 0.5, 0, 0, TAU); g.fill();
        g.fillStyle = Q.lit; g.beginPath(); g.ellipse(cx - r * 0.3, cy - r * 0.28, r * 0.46, r * 0.26, 0, 0, TAU); g.fill();
      }
    }
    // a long rope bridge between two far spires, and prayer flags between the nest and the shrine
    const lk = (a, b, sag, kind) => {
      const A = LAY.big[a], B = LAY.big[b];
      const ax = A.tx + A.flat / 2 - 2, ay = A.top + 2, bx = B.tx - (B.flat || 20) / 2 + 2, by = B.top + 2;
      if (bx < xa - 40 || ax > xb + 40) return;
      const mx = (ax + bx) / 2, my = (ay + by) / 2 + sag;
      const qp = (f) => [(1 - f) * (1 - f) * ax + 2 * (1 - f) * f * mx + f * f * bx, (1 - f) * (1 - f) * ay + 2 * (1 - f) * f * my + f * f * by];
      if (kind === 'bridge') {
        g.strokeStyle = P.line; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by); g.stroke();
        g.lineWidth = 1; g.beginPath(); g.moveTo(ax, ay - 9); g.quadraticCurveTo(mx, my - 9, bx, by - 9); g.stroke();
        for (let f = 0.03; f < 0.98; f += 0.025) { const [x, y] = qp(f); g.fillStyle = mix(P.twig, P.line, 0.3); g.fillRect(x - 1.6, y - 1.2, 3.2, 3); strokeLine(g, [x, y, x, y - 8.5], 0.6, rgba(P.line, 0.7)); }
      } else {
        g.strokeStyle = rgba(P.line, 0.8); g.lineWidth = 1;
        g.beginPath(); g.moveTo(ax, ay - 30); g.quadraticCurveTo(mx, my - 30, bx, by - 40); g.stroke();
        for (let f = 0.05, i = 0; f < 0.96; f += 0.045, i++) {
          const x = (1 - f) * (1 - f) * ax + 2 * (1 - f) * f * mx + f * f * bx, y = (1 - f) * (1 - f) * (ay - 30) + 2 * (1 - f) * f * (my - 30) + f * f * (by - 40);
          g.fillStyle = mix(PRAYER[i % 5], Q.haze, 0.2); poly(g, [x - 3, y, x + 3, y, x + 5, y + 7, x - 1, y + 7]); g.fill();
        }
      }
    };
    lk(0, 1, 30, 'flags');
    lk(4, 5, 46, 'bridge');
  }

  // ------------------------------------------------------------------ back strips (p 1)
  function buildBack(cs) {
    const b = {};
    b.wall = buildStrip(-8, 1940, 16, 376, cs, 1, drawWall);
    b.rail = buildStrip(BA0 - 30, BB1 + 30, 140, 376, cs, 1, drawRail);
    b.roost = buildStrip(RO0 - 60, SU0 + 70, 40, 376, cs, 1, drawRoostBack);
    b.summit = buildStrip(SU0 - 60, LEVEL_LEN, 40, 376, cs, 1, drawSummitBack);
    // sprites + live bits
    const P = NP.cliffs;
    lineStyle(P.line, 0.62);
    const live = [], front = [], liveF = [];
    // rim pines that sway in the wind (drawn after the wall)
    const pineSpr = (h, lean, seed) => makeSprite(h * (lean + 0.7) + 34, h + 30, h * 0.2 + 15, h + 14, cs, (g) => drawWindPine(g, h, lean, seed, P));
    for (const [x, h, lean, dy] of [[440, 132, 0.34, 8], [1012, 116, 0.38, 8], [1590, 150, 0.3, 8], [190, 70, 0.42, 10]]) {
      const spr = pineSpr(h, lean, x);
      const y = wallTop(x) + dy;
      live.push({ x0: x - 60, x1: x + h, draw: (ctx, camX, t) => drawSway(ctx, spr, snap(x - camX), y, t, x * 0.01, 3 + 9 * windNow) });
    }
    // pennant poles on the ledge (clan streamers) + prayer-flag lines to the crags
    const pole = makeSprite(30, 260, 15, 252, cs, (g) => {
      ink(g, (g) => poly(g, [-3.5, 4, -2.8, -240, 2.8, -240, 3.5, 4]), '#5a4434', 2);
      ink(g, (g) => { g.beginPath(); g.arc(0, -243, 4.5, 0, TAU); }, CLAN.gold, 1.6);
      ink(g, (g) => poly(g, [-9, -2, 9, -2, 11, 6, -11, 6]), '#7f7486', 1.8);
      ropeWrap(g, 0, -60, 4, 3, NP.bridges);
    });
    const cairn = makeSprite(70, 70, 35, 62, cs, (g) => {
      const RP = { rock: P.rock, rockSh: P.rockSh, rockHi: P.rockHi, crev: P.crev, snow: P.snow, snowSh: P.snowSh };
      for (const [x, y, w, h, s] of [[0, 0, 44, 18, 1], [-2, -16, 34, 15, 2], [2, -29, 24, 12, 3], [0, -39, 14, 9, 4]]) { g.save(); g.translate(x, y); drawBoulder(g, w, h, 900 + s, RP, 1.8, s === 4); g.restore(); }
    });
    for (const [x, len, col, stripe] of [[236, 120, CLAN.red, CLAN.gold], [1150, 104, '#3e6fa8', '#f1e8d4'], [1792, 132, CLAN.red, CLAN.gold]]) {
      front.push({ spr: pole, x, y: 364 });
      liveF.push({ x0: x - 20, x1: x + len + 30, draw: (ctx, camX, t) => drawStreamer(ctx, snap(x - camX) + 3, 364 - 236, len, 14, t, x * 0.01, windNow, col, stripe, '#3a2f3a') });
    }
    for (const x of [600, 1430]) front.push({ spr: cairn, x, y: 362 });
    const lines = [[236 + 3, 128, 440 + 26, wallTop(440) - 92, 30, 13], [600, 326, 700, wallTop(700) + 12, 18, 9], [1150 + 3, 128, 1330, wallTop(1330) + 10, 22, 12], [1792 + 3, 128, 1846, wallTop(1846) + 12, 8, 5], [1012 + 22, wallTop(1012) - 80, 1150 + 3, 160, 24, 9]];
    lines.forEach(([ax, ay, bx, by, sag, n], i) => live.push({ x0: Math.min(ax, bx) - 20, x1: Math.max(ax, bx) + 30, draw: (ctx, camX, t) => drawPrayerLine(ctx, ax - camX, ay, bx - camX, by, sag, n, t, i * 3 + 1, windNow, '#3d3550') }));
    // eagles soaring over the ledge (between the mid layer and the wall)
    // --- bridges: prayer flags strung between the rail posts
    for (const list of POSTS) for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], c2 = list[i + 1];
      const ax = a.x, ay = a.top + 6, bx = c2.x, by = c2.top + 6;
      if (i % 2 === 1 && list.length > 3) continue;
      live.push({ x0: ax - 20, x1: bx + 30, draw: (ctx, camX, t) => drawPrayerLine(ctx, ax - camX, ay, bx - camX, by, 20, Math.round((bx - ax) / 18), t, i * 5 + 2, windNow, '#3e3546') });
    }
    // --- roost: the King's iron posts with chains and green gem lamps; banner poles
    lineStyle(NP.roost.line, 0.62);
    const ironPost = makeSprite(70, 190, 35, 182, cs, (g) => drawIronPost(g, NP.roost));
    for (const x of [3990, 4706, 5236]) {
      front.push({ spr: ironPost, x, y: 364 });
      liveF.push({ x0: x - 60, x1: x + 60, draw: (ctx, camX, t) => {
        const gx = x - camX + 18, gy = 364 - 134;
        ctx.globalCompositeOperation = 'lighter';
        for (const [spr, a] of fire().glows) { ctx.globalAlpha = (0.5 + 0.12 * Math.sin(t * 2.6 + x)) * a; ctx.drawImage(spr.c, gx - 26, gy - 26, 52, 52); }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      } });
    }
    const kpole = makeSprite(30, 320, 15, 310, cs, (g) => {
      ink(g, (g) => poly(g, [-3.5, 2, -3, -292, 3, -292, 3.5, 2]), '#2e2c32', 2);
      ink(g, (g) => poly(g, [-6, -290, 0, -306, 6, -290]), '#6c7076', 1.8);
      ink(g, (g) => poly(g, [-7, -4, 7, -4, 9, 4, -9, 4]), '#2a2a2e', 1.8);
    });
    const kflag = makeSprite(96, 64, 0, 0, cs, (g) => drawFlagCloth(g, 96, 64));
    for (const x of [4446, 5560]) {
      front.push({ spr: kpole, x, y: 364 });
      liveF.push({ x0: x - 20, x1: x + 130, draw: (ctx, camX, t) => drawFlag(ctx, kflag, snap(x - camX + 3), 364 - 296, t, x * 0.013, 3 + 6 * windNow, 10, 4 + 4 * windNow) });
    }
    // the wobbling egg (live) in the first big nest, with the nest's front rim drawn over it
    {
      const N = NESTS[0], ex = N.x + N.w * 0.2, ey = nestBase(N) - N.h + 30;
      const egg = makeSprite(40, 50, 20, 44, cs, (g) => drawEgg(g, 0, 0, 15, 20, 1, NP.roost));
      const rim = makeSprite(N.w + 40, 70, N.w / 2 + 20, 40, cs, (g) => { lineStyle(NP.roost.line, 0.62); drawNestFront(g, 0, 0, N, NP.roost); });
      const ny = nestBase(N) - N.h;
      live.push({ x0: N.x - N.w / 2 - 20, x1: N.x + N.w / 2 + 20, draw: (ctx, camX, t) => {
        const ph = t % 4.6, wob = ph < 0.9 ? Math.sin(ph * 14) * 0.16 * (1 - ph / 0.9) : 0;
        const x = ex - camX;
        ctx.save(); ctx.translate(x, ey); ctx.rotate(wob); ctx.drawImage(egg.c, -egg.ox, -egg.oy, egg.w, egg.h); ctx.restore();
        ctx.drawImage(rim.c, snap(N.x - camX - rim.ox), ny - rim.oy, rim.w, rim.h);
      } });
    }
    // --- summit: braziers (green fire), banners on the statue, rune glows
    lineStyle(NP.summit.line, 0.7);
    const brazier = makeSprite(90, 120, 45, 110, cs, (g) => drawBrazier(g));
    for (const x of [5846, 6184, 6436, 7024]) {
      front.push({ spr: brazier, x, y: 364 });
      liveF.push({ x0: x - 80, x1: x + 100, draw: (ctx, camX, t) => drawFlame(ctx, x - camX, 364 - 84, 34, t, x * 0.01, fire(), 1) });
    }
    const gban = makeSprite(52, 64, 0, 0, cs, (g) => drawKingBanner(g, 4, 4, 42, 54, 91, 2));
    for (const [bx, by] of [[STATUE_X - 72, 364 - 62], [STATUE_X + 28, 364 - 62]]) {
      live.push({ x0: bx - 10, x1: bx + 80, draw: (ctx, camX, t) => drawHang(ctx, gban, snap(bx - camX), by, t, bx, 2 + 3 * windNow, 8, 3 + 7 * windNow) });
    }
    return Object.assign(b, { live: live.filter(Boolean), front, liveF });
  }

  // ------------------------------------------------------------------ CLIFF WALL (behind the ledge)
  function drawWall(g, xa, xb) {
    const P = NP.cliffs;
    lineStyle(P.line, 0.62);
    const xs = Math.floor(xa) - 2, xe = Math.ceil(xb) + 2;
    const sil = () => {
      g.beginPath(); g.moveTo(al(xs, 4) - 4, 380);
      for (let x = al(xs, 4) - 4; x <= xe + 4; x += 4) g.lineTo(x, wallTop(x));
      g.lineTo(xe + 4, 380); g.closePath();
    };
    // offset ink shadow of the silhouette (lower right), as the ink() helper does
    g.save(); g.translate(0.8, 1.3); sil(); g.lineWidth = 3.4 * LK; g.strokeStyle = LINE; g.stroke(); g.restore();
    g.save(); sil(); g.clip();
    g.fillStyle = P.rock; g.fillRect(xs, 0, xe - xs, 380);
    const FP = { rockSh: mix(P.rockSh, P.rock, 0.25), rockHi: P.rockHi, crev: P.crev, snow: P.snow, hiA: 0.5, ledges: 1, crevW: 1.4 };
    faces(g, xs, xe, wallTop, FP, 31, 104, 372);
    // a second, set-back tier: the planes break at a snowy ledge line, so the face reads as stepped rock, not a curtain
    const tier = (x) => 196 + 20 * Math.sin(x * 0.013 + 0.6) + 9 * Math.sin(x * 0.043);
    g.save();
    g.beginPath(); g.moveTo(al(xs, 6) - 6, 380);
    for (let x = al(xs, 6) - 6; x <= xe + 6; x += 6) g.lineTo(x, Math.max(tier(x), wallTop(x) + 26));
    g.lineTo(xe + 6, 380); g.closePath(); g.clip();
    g.fillStyle = mix(P.rock, P.rockSh, 0.12); g.fillRect(xs, 0, xe - xs, 380);
    faces(g, xs, xe, (x) => Math.max(tier(x), wallTop(x) + 26), { ...FP, hiA: 0.42 }, 37, 78, 372);
    g.restore();
    strata(g, xs, xe, wallTop, 300, P, 41, 0.42);
    // a few deep cracks running down the face, and lichen (ochre + sage) on the sunny planes
    for (let gx = al(xs, 230) - 230; gx < xe + 230; gx += 230) {
      const h = hash1(gx * 3 + 5);
      if (h < 0.35) continue;
      const R = mulberry((gx * 7 + 3) >>> 0);
      let x = gx + h * 120, y = wallTop(x) + 8;
      const pts = [x, y];
      while (y < 300) { x += R.r(-9, 9); y += R.r(14, 30); pts.push(x, Math.min(y, 300)); }
      g.save(); g.translate(1.6, 0.8); polyline(g, pts); g.lineWidth = 1.4; g.strokeStyle = rgba(P.rockHi, 0.6); g.stroke(); g.restore();
      polyline(g, pts); g.lineWidth = 2.4; g.strokeStyle = rgba(P.crev, 0.8); g.stroke();
    }
    for (let gx = al(xs, 26) - 26; gx < xe + 26; gx += 26) {
      for (let r = 0; r < 3; r++) {
        const h = hash2(gx, r + 61);
        if (h < 0.7) continue;
        const x = gx + hash2(gx, r + 62) * 20, y = wallTop(x) + 24 + hash2(gx, r + 63) * 240;
        if (y > 296) continue;
        g.fillStyle = r === 1 ? 'rgba(160,172,128,0.42)' : 'rgba(206,162,86,0.38)';
        for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + k * 3.2 - 5 + hash2(gx + k, r) * 3, y + hash2(gx - k, r) * 5, 2.4 + h * 2, 1.6 + h, 0, 0, TAU); g.fill(); }
      }
    }
    // morning light warms the high rock; cool shade gathers toward the ledge
    let gr = g.createLinearGradient(0, 20, 0, 300);
    gr.addColorStop(0, 'rgba(255,214,176,0.26)'); gr.addColorStop(0.55, 'rgba(255,214,176,0.06)'); gr.addColorStop(0.75, 'rgba(70,58,100,0)'); gr.addColorStop(1, 'rgba(70,58,100,0.22)');
    g.fillStyle = gr; g.fillRect(xs, 0, xe - xs, 300);
    // the ledge was cut into the cliff: a dressed face with tool marks, in the shade of a shallow overhang
    const cutTop = (x) => 302 + 3 * Math.sin(x * 0.021) + 2 * Math.sin(x * 0.07);
    g.beginPath(); g.moveTo(al(xs, 6) - 6, 380);
    for (let x = al(xs, 6) - 6; x <= xe + 6; x += 6) g.lineTo(x, cutTop(x));
    g.lineTo(xe + 6, 380); g.closePath();
    g.fillStyle = mix(P.cut, P.rockSh, 0.32); g.fill();
    for (let x = al(xs, 11) - 11; x < xe + 11; x += 11) {
      for (let r = 0; r < 4; r++) {
        const h = hash2(x, r + 7);
        if (h < 0.45) continue;
        const y = cutTop(x) + 10 + r * 13 + h * 6;
        strokeLine(g, [x + h * 4, y, x + h * 4 + 2.5, y + 7], 1.1, rgba(P.crev, 0.3));
      }
    }
    gr = g.createLinearGradient(0, 300, 0, 324);
    gr.addColorStop(0, 'rgba(50,40,72,0.55)'); gr.addColorStop(1, 'rgba(50,40,72,0)');
    g.fillStyle = gr; g.fillRect(xs, 300, xe - xs, 26);
    gr = g.createLinearGradient(0, 330, 0, 366);
    gr.addColorStop(0, 'rgba(60,50,80,0)'); gr.addColorStop(1, 'rgba(60,50,80,0.3)');
    g.fillStyle = gr; g.fillRect(xs, 330, xe - xs, 40);
    g.restore();
    // the set-back ledge line: dark under-shadow + snow on top (only where the tier sits well below the rim)
    {
      const ok = (x) => tier(x) > wallTop(x) + 30 && x < WALL_END - 20 && hash1(Math.floor(x / 54) + 911) < 0.62;
      for (let x = al(xs, 6) - 6; x < xe + 6; x += 6) if (ok(x) && ok(x + 6)) { strokeLine(g, [x, tier(x) + 3, x + 6, tier(x + 6) + 3], 2.4, rgba(P.crev, 0.55)); }
      g.fillStyle = P.snow;
      for (let x = al(xs, 6) - 6; x < xe + 6; x += 6) if (ok(x)) { const k = Math.sin(((x % 54) + 54) % 54 / 54 * Math.PI); g.beginPath(); g.ellipse(x + 3, tier(x) - 0.5, 4.6, 0.8 + k * 2.6 + hash1(x) * 0.8, 0, 0, TAU); g.fill(); }
    }
    // lit lip of the overhang (only where the wall stands above it)
    g.beginPath();
    let on = false;
    for (let x = al(xs, 6) - 6; x <= xe + 6; x += 6) {
      const ok = wallTop(x) < cutTop(x) - 10 && x < WALL_END;
      if (ok && !on) { g.moveTo(x, cutTop(x) - 1); on = true; } else if (ok) g.lineTo(x, cutTop(x) - 1); else on = false;
    }
    g.lineWidth = 2.2; g.strokeStyle = rgba(P.rockHi, 0.9); g.stroke();
    // icicles under the overhang lip
    for (let x = al(xs, 23); x < xe; x += 23) {
      const h = hash1(x * 3 + 9);
      if (h < 0.8 || wallTop(x) > cutTop(x) - 12 || x > WALL_END - 10) continue;
      const y = cutTop(x) + 1, l = 6 + h * 12;
      ink(g, (g) => poly(g, [x - 2.5, y, x + 2.5, y, x, y + l]), '#eef4fb', 1.1);
    }
    // the silhouette line + snow along the rim
    g.beginPath();
    for (let x = al(xs, 4) - 4; x <= xe + 4; x += 4) g.lineTo(x, wallTop(x));
    g.lineWidth = 2.2 * LK; g.strokeStyle = LINE; g.stroke();
    if (xs < WALL_END) snowLedge(g, Math.max(xs, -20), Math.min(xe, WALL_END - 8), wallTop, 7, 33, P, 1.6);
    // pines clinging to ledges, eyries on the crag tops, dry grass in the cracks
    for (const [x, dy, h, lean] of [[300, 46, 64, 0.4], [566, 58, 56, 0.44], [846, 34, 72, 0.36], [1124, 96, 58, 0.42], [1488, 40, 66, 0.38], [1700, 60, 52, 0.44], [96, 120, 60, 0.4]]) {
      if (x < xs - 120 || x > xe + 60) continue;
      const y = wallTop(x) + dy;
      g.fillStyle = rgba(P.crev, 0.6); g.fillRect(x - 18, y + 1, 36, 3);
      g.save(); g.translate(x, y); drawWindPine(g, h, lean, x * 3, P, 2); g.restore();
      snowCap(g, x - 18, x + 18, () => y + 1, 5, x, P, 1.2, 2);
    }
    for (const [x, f] of [[66, 1], [668, -1], [1322, 1]]) if (x > xs - 60 && x < xe + 60) drawEyrie(g, x, wallTop(x) + 5, P, f);
    g.strokeStyle = P.grass; g.lineWidth = 1.3;
    for (let x = al(xs, 31); x < Math.min(xe, WALL_END); x += 31) {
      const h = hash1(x * 5 + 3);
      if (h < 0.55) continue;
      const y = wallTop(x) + 30 + h * 140;
      if (y > 296) continue;
      for (let k = 0; k < 3; k++) { polyline(g, [x + k * 3, y, x + k * 3 + 5 + k * 2, y - 7 - h * 6]); g.stroke(); }
    }
    // a carved clan niche in the cut face (an old waymark of the climb)
    if (xs < 1060 && xe > 940) {
      const nx = 1000, ny = 318;
      ink(g, (g) => { g.beginPath(); g.moveTo(nx - 20, ny + 36); g.lineTo(nx - 20, ny); g.quadraticCurveTo(nx, ny - 24, nx + 20, ny); g.lineTo(nx + 20, ny + 36); g.closePath(); }, '#6e6480', 1.8, (g) => { g.fillStyle = '#5a5070'; g.fillRect(nx + 6, ny - 30, 20, 70); });
      g.save(); g.translate(nx, ny + 34); drawDragonStatue(g, '#c9bdbd', '#9a8e9e', '#e6dcd8', 0.34); g.restore();
      for (const dx of [-14, 14]) { ink(g, (g) => { g.beginPath(); g.ellipse(nx + dx, ny + 34, 3, 2, 0, 0, TAU); }, '#c0703c', 1); }
    }
  }

  // ------------------------------------------------------------------ BRIDGE RAILS (posts + ropes) and the platform pillars
  function drawRail(g, xa, xb) {
    const P = NP.bridges;
    lineStyle(P.line, 0.62);
    for (const list of POSTS) {
      if (list[list.length - 1].x + 40 < xa || list[0].x - 40 > xb) continue;
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i], b = list[i + 1];
        // suspender cords from the handrail down to the deck's back stringer
        for (let x = a.x + 18; x < b.x - 12; x += 22) {
          const f = (x - a.x) / (b.x - a.x);
          const y = lerp(a.hand, b.hand, f) + 16 * 4 * f * (1 - f);
          strokeLine(g, [x, y, x + 0.5, 360], 2.4, rgba(LINE, 0.55));
          strokeLine(g, [x, y, x + 0.5, 360], 1.3, P.ropeSh);
        }
        rope(g, a.x, a.low, b.x, b.low, 9, 2.4, P);
        rope(g, a.x, a.hand, b.x, b.hand, 16, 3.4, P);
      }
      for (const p of list) if (p.kind !== 'pillar') drawPost(g, p, P);
    }
    for (const x of [PL0 + 8, PL1 - 8]) if (x > xa - 60 && x < xb + 60) { g.save(); g.translate(x, 366); drawPillar(g, P, x > PL0 + 100); g.restore(); }
  }
  function drawPost(g, p, P) {
    const big = p.kind === 'anchor', hw = big ? 14 : 9.5, x = p.x, top = p.top;
    ink(g, (g) => poly(g, [x - hw - 1, 368, x - hw, top + 6, x + hw, top + 6, x + hw + 1, 368]), P.post, big ? 3 : 2.6, (g) => {
      g.fillStyle = P.postSh; g.fillRect(x + hw * 0.25, top, hw, 380 - top);
      g.fillStyle = rgba(P.postHi, 0.8); g.fillRect(x - hw, top, hw * 0.35, 380 - top);
      g.strokeStyle = rgba(P.postSh, 0.9); g.lineWidth = 1.1;
      for (let i = 0; i < 4; i++) { const gx = x - hw * 0.5 + i * hw * 0.38; polyline(g, [gx, top + 10 + i * 9, gx + 1, top + 40 + i * 14, gx - 0.5, 366]); g.stroke(); }
    });
    if (big) {
      // clan cloth band + a little pagoda cap
      ink(g, (g) => poly(g, [x - hw - 1, top + 24, x + hw + 1, top + 24, x + hw + 1, top + 44, x - hw - 1, top + 44]), CLAN.red, 1.8, (g) => { g.fillStyle = CLAN.redSh; g.fillRect(x + 4, top + 20, 20, 30); g.fillStyle = CLAN.gold; g.fillRect(x - hw - 2, top + 27, hw * 2 + 4, 2.5); });
      ink(g, (g) => poly(g, [x - 26, top + 8, x - 18, top + 2, x, top - 12, x + 18, top + 2, x + 26, top + 8, x + 14, top + 6, x, top - 2, x - 14, top + 6]), '#3b3236', 2.4, (g) => { g.fillStyle = '#2a2326'; g.fillRect(x, top - 14, 30, 24); });
      ink(g, (g) => { g.beginPath(); g.arc(x, top - 14, 3.2, 0, TAU); }, CLAN.gold, 1.4);
      snowCap(g, x - 24, x + 24, (xx) => top + 6 - (24 - Math.abs(xx - x)) * 0.62, 5, x | 0, P, 1.2, 2);
    } else {
      ink(g, (g) => { g.beginPath(); g.ellipse(x, top + 6, hw + 1.5, 5, 0, Math.PI, TAU); g.lineTo(x + hw + 1.5, top + 9); g.lineTo(x - hw - 1.5, top + 9); g.closePath(); }, P.postHi, 2.2);
      snowCap(g, x - hw - 2, x + hw + 2, (xx) => top + 4 - (hw - Math.abs(xx - x)) * 0.3, 4, x | 0, P, 1.1, 1);
    }
    ropeWrap(g, x, p.hand - 3, hw, 3, P);
    ropeWrap(g, x, p.low - 3, hw, 2, P);
  }
  function drawPillar(g, P, flip) {
    // carved stone bridge-head pillar with a crouching dragon; origin = base centre (y 366)
    ink(g, (g) => poly(g, [-30, 2, -30, -22, 30, -22, 30, 2]), P.stone, 3, (g) => { g.fillStyle = P.stoneSh; g.fillRect(10, -26, 30, 30); g.fillStyle = P.stoneHi; g.fillRect(-30, -22, 60, 3); });
    ink(g, (g) => poly(g, [-22, -22, -22, -120, 22, -120, 22, -22]), P.stone, 3, (g) => {
      g.fillStyle = P.stoneSh; g.fillRect(8, -124, 20, 106);
      g.fillStyle = rgba(P.stoneHi, 0.8); g.fillRect(-22, -124, 5, 106);
      g.strokeStyle = P.joint; g.lineWidth = 1.4;
      for (let y = -46, k = 0; y > -120; y -= 24, k++) { polyline(g, [-22, y, 22, y]); g.stroke(); const x = k % 2 ? -6 : 8; polyline(g, [x, y, x, y + 24]); g.stroke(); }
      g.fillStyle = rgba(CLAN.red, 0.8); g.fillRect(-14, -104, 28, 32);
      clanEmblem(g, 0, -88, 22, rgba(CLAN.gold, 0.9));
      g.strokeStyle = rgba(LINE, 0.8); g.lineWidth = 1.3; g.strokeRect(-14, -104, 28, 32);
    });
    ink(g, (g) => poly(g, [-28, -118, -28, -132, 28, -132, 28, -118]), P.stone, 3, (g) => { g.fillStyle = P.stoneSh; g.fillRect(10, -134, 22, 18); g.fillStyle = P.stoneHi; g.fillRect(-28, -132, 56, 3); });
    g.save(); g.translate(0, -132); if (flip) g.scale(-1, 1); drawDragonStatue(g, P.stone, P.stoneSh, P.stoneHi, 0.74); g.restore();
    snowCap(g, -28, 28, () => -132, 7, flip ? 81 : 82, P, 1.5, 2);
  }

  // ------------------------------------------------------------------ ROOST (rim, perches, nests, bones)
  function drawRoostBack(g, xa, xb) {
    const P = NP.roost;
    lineStyle(P.line, 0.62);
    const xs = Math.floor(xa) - 2, xe = Math.ceil(xb) + 2;
    // tall stone perches behind the rim
    for (const pe of PERCHES) if (pe.x + 80 > xs && pe.x - 80 < xe) { g.save(); g.translate(pe.x, 352); drawPerch(g, pe, P); g.restore(); }
    // old ribs of some great beast, bleached by the wind
    if (xs < RIBS_X + 160 && xe > RIBS_X - 120) drawRibs(g, RIBS_X, 344, P);
    // the rim: a lumpy rock ledge along the back of the plateau
    const r0 = Math.max(xs, RO0 - 40), r1 = Math.min(xe, SU0 + 60);
    if (r1 > r0) {
      const sil = () => {
        g.beginPath(); g.moveTo(al(r0, 4) - 4, 378);
        for (let x = al(r0, 4) - 4; x <= r1 + 4; x += 4) g.lineTo(x, rimTop(x));
        g.lineTo(r1 + 4, 378); g.closePath();
      };
      g.save(); sil(); g.clip();
      g.fillStyle = P.rock; g.fillRect(r0 - 4, 300, r1 - r0 + 8, 80);
      faces(g, r0, r1, rimTop, { rockSh: P.rockSh, rockHi: P.rockHi, crev: P.crev, snow: P.snow, hiA: 0.6, ledges: 1, crevW: 1.3 }, 51, 38, 372);
      const gr = g.createLinearGradient(0, 340, 0, 368);
      gr.addColorStop(0, 'rgba(50,44,66,0)'); gr.addColorStop(1, 'rgba(50,44,66,0.35)');
      g.fillStyle = gr; g.fillRect(r0 - 4, 330, r1 - r0 + 8, 40);
      g.restore();
      g.beginPath(); for (let x = al(r0, 4) - 4; x <= r1 + 4; x += 4) g.lineTo(x, rimTop(x));
      g.lineWidth = 2.4 * LK; g.strokeStyle = LINE; g.stroke();
      snowLedge(g, r0, r1, rimTop, 5, 61, P, 1.4);
    }
    // the skull of an old wyvern, half sunk into the rim
    if (xs < SKULL_X + 110 && xe > SKULL_X - 110) { g.save(); g.translate(SKULL_X, rimTop(SKULL_X) + 22); drawSkull(g, P); g.restore(); }
    // giant twig nests on the rim (eggs in the bowls, feathers in the sticks)
    for (let i = 0; i < NESTS.length; i++) {
      const N = NESTS[i];
      if (N.x + N.w / 2 + 30 < xs || N.x - N.w / 2 - 30 > xe) continue;
      const by = nestBase(N);
      g.save(); g.translate(N.x, by - N.h);
      drawNestBack(g, 0, 0, N, P);
      const R = mulberry(N.seed + 5);
      N.eggs.forEach(([dx, kind], j) => { if (!(i === 0 && j === N.eggs.length - 1)) drawEgg(g, dx * N.w, 30 + R.r(-2, 3), 13 + R.r(0, 3), 18 + R.r(0, 3), kind, P); });
      drawNestFront(g, 0, 0, N, P);
      g.restore();
    }
  }
  function drawPerch(g, pe, P) {
    // tall weathered rock column with claw gouges, a black-iron ring and chain; origin = base centre
    const R = mulberry(pe.seed);
    const hw = pe.w / 2, h = pe.h;
    const left = mdp([-hw, 6], [-hw * 0.72, -h], R, 4, 0.04), right = mdp([hw * 0.78, -h + 4], [hw, 6], R, 4, 0.04);
    const pts = flat(left).concat([-hw * 0.5, -h - 8, hw * 0.3, -h - 6], flat(right));
    ink(g, (g) => poly(g, pts), P.rock, 2.8, (g) => {
      g.fillStyle = P.rockSh; poly(g, [hw * 0.12, -h - 20, hw * 1.4, -h - 20, hw * 1.4, 20, hw * 0.3, 20]); g.fill();
      g.fillStyle = rgba(P.rockHi, 0.75); poly(g, [-hw * 1.2, -h - 20, -hw * 0.3, -h - 20, -hw * 0.45, 20, -hw * 1.2, 20]); g.fill();
      for (let k = 0; k < h / 30; k++) { const y = -h + 18 + k * 30 + R.r(-6, 6), x = R.r(-hw, hw * 0.2); strokeLine(g, [x, y, x + hw * 0.9, y - 4], 1.3, rgba(P.crev, 0.5)); strokeLine(g, [x + 1, y + 2, x + hw * 0.9, y - 2], 1, rgba(P.rockHi, 0.5)); }
      // claw gouges
      for (const [cx, cy] of [[-hw * 0.2, -h * 0.55], [hw * 0.1, -h * 0.3]]) for (let k = 0; k < 3; k++) strokeLine(g, [cx + k * 5, cy, cx + k * 5 + 9, cy + 22], 1.6, rgba(P.crev, 0.75));
    });
    snowCap(g, -hw * 0.75, hw * 0.8, (x) => -h - 4 - (x < 0 ? 3 : 0), 7, pe.seed + 1, P, 1.5, 2);
    // iron ring + hanging chain
    const ry = -h * 0.42;
    ink(g, (g) => poly(g, [-7, ry - 7, 7, ry - 7, 7, ry + 7, -7, ry + 7]), P.iron, 1.8, (g) => { g.fillStyle = P.ironHi; g.fillRect(-7, ry - 7, 3, 14); });
    g.fillStyle = KING.gem; g.fillRect(-2, ry - 2, 4, 4);
    for (let i = 0; i < 7; i++) {
      const f = i / 6, cx = lerp(0, hw * 0.6, f), cy = ry + 8 + 30 * Math.sin(f * Math.PI * 0.8);
      g.lineWidth = 2.4; g.strokeStyle = LINE; g.beginPath(); g.ellipse(cx, cy, i % 2 ? 2 : 3.6, i % 2 ? 3.6 : 2, 0, 0, TAU); g.stroke();
      g.lineWidth = 1.3; g.strokeStyle = P.ironHi; g.stroke();
    }
  }
  function drawNestBack(g, x, y, N, P) {
    // back half of the bowl (the inside wall seen over the eggs)
    const hw = N.w / 2;
    const R = mulberry(N.seed);
    ink(g, (g) => { g.beginPath(); g.ellipse(x, y + 20, hw * 0.86, 22, 0, Math.PI, TAU); g.lineTo(x + hw * 0.86, y + 30); g.lineTo(x - hw * 0.86, y + 30); g.closePath(); }, P.twigSh, 2, (g) => {
      g.fillStyle = P.twigDk; g.beginPath(); g.ellipse(x, y + 26, hw * 0.74, 14, 0, 0, TAU); g.fill();
      g.strokeStyle = rgba(P.twigHi, 0.6); g.lineWidth = 1.4;
      for (let i = 0; i < N.w / 7; i++) { const a = R.r(-hw * 0.8, hw * 0.7); const yy = y + R.r(2, 20); polyline(g, [x + a, yy, x + a + R.r(10, 24), yy + R.r(-3, 4)]); g.stroke(); }
      // soft down feathers lining the bowl
      g.fillStyle = rgba(P.feather, 0.7);
      for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(x + R.r(-hw * 0.6, hw * 0.6), y + R.r(18, 26), R.r(5, 9), 2.4, R.r(-0.3, 0.3), 0, TAU); g.fill(); }
    });
  }
  function drawNestFront(g, x, y, N, P) {
    // the woven outer bowl: lumpy outline, sticks crossing, sticks poking out, feathers caught in it
    const R = mulberry(N.seed + 1);
    const hw = N.w / 2, h = N.h;
    // a mound of sticks resting on the ledge: wide flat base, bulging sides, a thick rim
    const side = (s) => [[x + s * hw * 1.0, y + 26], [x + s * hw * 1.06, y + 26 + (h - 26) * 0.38], [x + s * hw * 0.98, y + h * 0.78], [x + s * hw * 0.86, y + h]];
    const pts = [];
    for (let i = 0; i <= 10; i++) { const f = i / 10; pts.push(x + hw * lerp(-1, 1, f) + R.r(-3, 3), y + 24 - Math.sin(f * Math.PI) * 4 + R.r(-2.5, 2.5)); }
    for (const [px, py] of side(1)) pts.push(px + R.r(-3, 3), py);
    pts.push(x + hw * 0.4, y + h + 1, x - hw * 0.4, y + h + 1);
    for (const [px, py] of side(-1).reverse()) pts.push(px + R.r(-3, 3), py);
    // sticks poking out (behind the outline)
    for (let i = 0; i < N.w / 12; i++) {
      const f = R(), s = f < 0.5 ? -1 : 1, u = R();
      const ex = x + s * hw * (1.0 + 0.06 * Math.sin(u * Math.PI)), ey = lerp(y + 30, y + h - 8, u);
      const dx = s * R.r(8, 22), dy = R.r(-12, 8);
      strokeLine(g, [ex - s * 6, ey, ex + dx, ey + dy], 3.6 * LK + 0.8, LINE); strokeLine(g, [ex - s * 6, ey, ex + dx, ey + dy], 2.6, i % 3 ? P.twig : P.twigHi);
    }
    ink(g, (g) => blob(g, pts), P.twig, 2.8, (g) => {
      g.fillStyle = P.twigSh; g.fillRect(x + hw * 0.25, y, hw, h + 20);
      g.fillStyle = rgba(P.twigSh, 0.6); g.fillRect(x - hw, y + h * 0.7, N.w, h);
      for (let i = 0; i < N.w * 0.55; i++) {
        const sx = x + R.r(-hw, hw), sy = y + R.r(20, h + 4), len = R.r(14, 34), ang = R.r(-0.5, 0.5) + (sx - x) / hw * 0.25;
        const c = R(); g.strokeStyle = c < 0.35 ? P.twigHi : c < 0.7 ? P.twigSh : P.twigDk; g.lineWidth = R.r(1.4, 2.6);
        polyline(g, [sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len]); g.stroke();
      }
    });
    // rim sticks laid round the lip
    for (let i = 0; i < N.w / 9; i++) {
      const f = R(), sx = x + hw * lerp(-0.98, 0.82, f), sy = y + 24 - Math.sin(f * Math.PI) * 4 + R.r(-3, 4);
      strokeLine(g, [sx, sy, sx + R.r(16, 30), sy + R.r(-3, 3)], 3.4 * LK + 0.6, LINE); strokeLine(g, [sx, sy, sx + R.r(16, 30), sy + R.r(-3, 3)], 2.4, P.twigHi);
    }
    // feathers caught in the weave
    for (let i = 0; i < 3; i++) {
      const fx = x + R.r(-hw * 0.7, hw * 0.6), fy = y + R.r(28, h - 6), a = R.r(-0.9, 0.3);
      g.save(); g.translate(fx, fy); g.rotate(a);
      ink(g, (g) => { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(8, -5, 22, -2); g.quadraticCurveTo(9, 5, 0, 0); g.closePath(); }, P.feather, 1.2, (g) => { g.fillStyle = P.featherSh; g.fillRect(0, 0, 24, 6); });
      strokeLine(g, [0, 0, 22, -2], 0.9, P.boneDk);
      g.restore();
    }
    // a little wind-packed snow on the windward shoulder of the rim
    ink(g, (g) => blob(g, [x - hw * 0.98, y + 26, x - hw * 0.9, y + 20, x - hw * 0.6, y + 18, x - hw * 0.4, y + 20, x - hw * 0.62, y + 25, x - hw * 0.86, y + 28]), P.snowSh, 1.1, (g) => { g.fillStyle = P.snow; g.fillRect(x - hw, y + 14, hw * 0.7, 8); });
    // the ground shadow / sticks spilling at the base
    for (let i = 0; i < N.w / 16; i++) { const sx = x + R.r(-hw * 0.95, hw * 0.9), sy = y + h + R.r(-3, 2), a = R.r(-0.3, 0.3); strokeLine(g, [sx, sy, sx + Math.cos(a) * R.r(12, 24), sy + Math.sin(a) * 6], 3 * LK + 0.6, LINE); strokeLine(g, [sx, sy, sx + Math.cos(a) * R.r(12, 24), sy + Math.sin(a) * 6], 2, P.twigSh); }
  }
  function drawEgg(g, x, y, rx, ry, kind, P) {
    const col = kind === 1 ? P.egg : P.egg2, sh = kind === 1 ? P.eggSh : P.egg2Sh, sp = kind === 1 ? P.speck : P.speck2;
    const R = mulberry((x * 13 + kind * 7) | 0);
    const path = (g) => { g.beginPath(); g.moveTo(x, y - ry * 2); g.bezierCurveTo(x + rx * 1.05, y - ry * 2, x + rx * 1.15, y - ry * 0.5, x + rx * 0.95, y - ry * 0.35); g.bezierCurveTo(x + rx * 0.7, y + 0.5, x - rx * 0.7, y + 0.5, x - rx * 0.95, y - ry * 0.35); g.bezierCurveTo(x - rx * 1.15, y - ry * 0.5, x - rx * 1.05, y - ry * 2, x, y - ry * 2); g.closePath(); };
    ink(g, path, col, 2.2, (g) => {
      g.fillStyle = sh; g.beginPath(); g.ellipse(x + rx * 0.45, y - ry * 0.7, rx * 0.9, ry * 1.1, 0, 0, TAU); g.fill();
      g.fillStyle = sp;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(x + R.r(-rx * 0.8, rx * 0.8), y - R.r(ry * 0.3, ry * 1.8), R.r(0.8, 2), R.r(0.6, 1.5), R.r(0, 3), 0, TAU); g.fill(); }
      g.fillStyle = kind === 1 ? P.eggHi : '#fffaf0'; g.beginPath(); g.ellipse(x - rx * 0.4, y - ry * 1.45, rx * 0.22, ry * 0.3, -0.4, 0, TAU); g.fill();
    });
  }
  function drawSkull(g, P) {
    // cartoon wyvern skull lying on its side, half buried; origin = where it meets the rim
    ink(g, (g) => poly(g, [-34, -50, -10, -62, 30, -56, 54, -38, 70, -12, 66, 4, -40, 4]), P.bone, 2.8, (g) => {
      g.fillStyle = P.boneSh; poly(g, [10, -40, 80, -40, 80, 8, 0, 8]); g.fill();
      g.fillStyle = P.boneDk; g.beginPath(); g.ellipse(12, -30, 11, 9, -0.2, 0, TAU); g.fill();         // eye socket
      g.fillStyle = rgba('#ffffff', 0.5); g.beginPath(); g.ellipse(-14, -46, 10, 4, -0.2, 0, TAU); g.fill();
      strokeLine(g, [30, -50, 36, -36, 32, -26], 1.3, P.boneDk);
    });
    // snout + jaw with blunt teeth
    ink(g, (g) => poly(g, [-36, -46, -84, -30, -92, -18, -86, -10, -40, -6]), P.bone, 2.6, (g) => {
      g.fillStyle = P.boneSh; g.fillRect(-92, -16, 60, 14);
      g.fillStyle = P.boneDk; g.beginPath(); g.ellipse(-82, -26, 3.5, 2.2, 0, 0, TAU); g.fill();
    });
    for (let i = 0; i < 5; i++) ink(g, (g) => poly(g, [-80 + i * 9, -11, -76 + i * 9, -2, -72 + i * 9, -11]), P.bone, 1.3);
    // a horn sweeping back
    ink(g, (g) => { g.beginPath(); g.moveTo(26, -56); g.quadraticCurveTo(60, -84, 104, -78); g.quadraticCurveTo(70, -70, 46, -44); g.closePath(); }, P.bone, 2.4, (g) => { g.fillStyle = P.boneSh; g.fillRect(40, -70, 70, 20); for (let i = 0; i < 4; i++) strokeLine(g, [44 + i * 12, -70 + i * 1, 40 + i * 12, -58 + i], 1.1, P.boneDk); });
    snowCap(g, -30, 50, (x) => (x < 10 ? lerp(-50, -61, (x + 30) / 40) : lerp(-61, -40, (x - 10) / 40)), 7, 4171, P, 1.3, 2);
    // rocks burying its front
    for (const [x, w, h, s] of [[-50, 44, 18, 1], [8, 52, 22, 2], [60, 40, 16, 3]]) { g.save(); g.translate(x, 8); drawBoulder(g, w, h, 4180 + s, P, 2, s === 2); g.restore(); }
  }
  function drawRibs(g, x, y, P) {
    for (let i = 0; i < 4; i++) {
      const bx = x - 70 + i * 46, h = 120 - Math.abs(i - 1.4) * 22;
      const path = (g) => { g.beginPath(); g.moveTo(bx, y); g.quadraticCurveTo(bx + 6, y - h * 0.8, bx + 40, y - h); };
      path(g); g.lineWidth = 10 + 2.4 * LK; g.strokeStyle = LINE; g.stroke();
      path(g); g.lineWidth = 9; g.strokeStyle = P.bone; g.stroke();
      g.save(); g.translate(2.5, 1); path(g); g.restore(); g.lineWidth = 3; g.strokeStyle = P.boneSh; g.stroke();
    }
    // the spine they hang from
    strokeLine(g, [x - 40, y - 118, x + 60, y - 126, x + 120, y - 116], 9 + 2.4 * LK, LINE);
    strokeLine(g, [x - 40, y - 118, x + 60, y - 126, x + 120, y - 116], 9, P.bone);
    for (let i = 0; i < 8; i++) { const vx = x - 34 + i * 20; strokeLine(g, [vx, y - 120 - (i < 4 ? i * 1.5 : (8 - i) * 1.5), vx, y - 130 - (i < 4 ? i * 1.5 : (8 - i) * 1.5)], 1.4, P.boneDk); }
  }
  function drawIronPost(g, P) {
    // the King's black-iron tether post: spiked cap, a green gem lamp, a hanging collar chain
    ink(g, (g) => poly(g, [-14, 4, -10, -14, 10, -14, 14, 4]), '#5c5866', 2.2, (g) => { g.fillStyle = '#3e3b46'; g.fillRect(2, -16, 14, 22); });
    ink(g, (g) => poly(g, [-5, -12, -4, -150, 4, -150, 5, -12]), P.iron, 2.4, (g) => { g.fillStyle = P.ironHi; g.fillRect(-4, -150, 2.4, 140); });
    ink(g, (g) => poly(g, [-9, -150, -6, -162, 0, -176, 6, -162, 9, -150]), P.iron, 2.2, (g) => { g.fillStyle = P.ironHi; g.fillRect(-6, -168, 3, 16); });
    // lamp arm + green gem lamp
    strokeLine(g, [2, -140, 18, -146, 18, -140], 4.4, LINE); strokeLine(g, [2, -140, 18, -146, 18, -140], 2.4, P.iron);
    ink(g, (g) => poly(g, [12, -140, 24, -140, 22, -128, 14, -128]), P.iron, 1.8, (g) => { g.fillStyle = KING.gem; g.fillRect(14, -138, 8, 8); g.fillStyle = '#e8ffd8'; g.fillRect(15, -137, 2.5, 3); });
    // a chain looping to the ground with an open collar
    for (let i = 0; i < 10; i++) {
      const f = i / 9, cx = lerp(-3, -22, f), cy = lerp(-110, -6, f) + Math.sin(f * Math.PI) * 6;
      g.lineWidth = 2.4; g.strokeStyle = LINE; g.beginPath(); g.ellipse(cx, cy, i % 2 ? 2 : 3.6, i % 2 ? 3.6 : 2, 0, 0, TAU); g.stroke();
      g.lineWidth = 1.3; g.strokeStyle = P.ironHi; g.stroke();
    }
    ink(g, (g) => { g.beginPath(); g.ellipse(-28, -4, 12, 5, 0, 0, TAU); g.ellipse(-28, -4, 8, 2.6, 0, 0, TAU, true); }, P.iron, 1.8);
    g.fillStyle = KING.gem; g.fillRect(-30, -10, 4, 3);
  }

  // ------------------------------------------------------------------ SUMMIT (standing stones, kerb, broken statue)
  function drawSummitBack(g, xa, xb) {
    const P = NP.summit;
    lineStyle(P.line, 0.7);
    const xs = Math.floor(xa) - 2, xe = Math.ceil(xb) + 2;
    // the broken dragon statue on its plinth (the King chained it)
    if (xs < STATUE_X + 200 && xe > STATUE_X - 200) { g.save(); g.translate(STATUE_X, 364); drawBrokenStatue(g, P); g.restore(); }
    // the ring kerb: a low carved wall along the back of the shrine platform
    const k0 = Math.max(xs, SU0 + 20), k1 = xe;
    if (k1 > k0) {
      const top = 338;
      const kTop = (x) => top + (hash1(Math.floor(x / 70) + 3) < 0.18 ? 10 : 0);
      ink(g, (g) => { g.beginPath(); g.moveTo(k0 - 6, 368); for (let x = al(k0, 70) - 70; x <= k1 + 70; x += 70) { const y = kTop(x); g.lineTo(clamp(x, k0 - 6, k1 + 6), y); g.lineTo(clamp(x + 70, k0 - 6, k1 + 6), y); } g.lineTo(k1 + 6, 368); g.closePath(); }, P.stone, 2.6, (g) => {
        g.fillStyle = P.stoneSh; g.fillRect(k0 - 6, top + 14, k1 - k0 + 12, 20);
        g.fillStyle = P.stoneHi; for (let x = al(k0, 70) - 70; x <= k1 + 70; x += 70) g.fillRect(x, kTop(x), 70, 2.5);
        g.strokeStyle = P.joint; g.lineWidth = 1.3;
        for (let x = al(k0, 70) - 70; x < k1 + 70; x += 70) { polyline(g, [x, top - 2, x, 368]); g.stroke(); }
        polyline(g, [k0 - 6, top + 13, k1 + 6, top + 13]); g.stroke();
        // carved spiral runes along the band (dim; the live glow sits on top)
        g.strokeStyle = rgba('#7ac890', 0.35); g.lineWidth = 1.2;
        for (let x = al(k0, 35) - 35; x < k1 + 35; x += 35) { g.beginPath(); g.arc(x + 17, top + 23, 4, 0.2, 5.2); g.stroke(); }
      });
      snowLedge(g, k0, k1, (x) => kTop(x) - 1, 4, 707, P, 1.3);
    }
    // standing stones
    for (const st of STONES) if (st.x + 60 > xs && st.x - 60 < xe) { g.save(); g.translate(st.x, 364); drawStandingStone(g, st, P); g.restore(); }
  }
  function drawStandingStone(g, st, P) {
    const R = mulberry(st.seed);
    const hw = st.w / 2, h = st.h;
    const lean = st.lean;
    const pts = st.broken
      ? [-hw, 4, -hw * 0.94 + lean * 0.3, -h * 0.6, -hw * 0.7 + lean, -h, hw * 0.1 + lean, -h * 0.82, hw * 0.4 + lean, -h * 0.9, hw * 0.92 + lean * 0.7, -h * 0.62, hw, 4]
      : [-hw, 4, -hw * 0.96 + lean * 0.4, -h * 0.55, -hw * 0.7 + lean, -h * 0.94, -hw * 0.2 + lean, -h, hw * 0.4 + lean, -h * 0.97, hw * 0.86 + lean, -h * 0.8, hw * 0.98 + lean * 0.5, -h * 0.4, hw, 4];
    ink(g, (g) => blob(g, pts), P.stone, 3, (g) => {
      g.fillStyle = P.stoneSh; poly(g, [hw * 0.15 + lean, -h - 10, hw * 1.5, -h - 10, hw * 1.5, 10, hw * 0.25, 10]); g.fill();
      g.fillStyle = rgba(P.stoneHi, 0.7); poly(g, [-hw * 1.2, -h, -hw * 0.45 + lean, -h, -hw * 0.5, 10, -hw * 1.2, 10]); g.fill();
      // carved spiral + dragon-coil runes (channel + faint glow line)
      const cx = lean * 0.4, cy = -h * 0.55;
      g.strokeStyle = rgba(P.crev, 0.9); g.lineWidth = 2.6;
      g.beginPath(); for (let a = 0; a < 9; a += 0.25) { const r = 2 + a * 1.6; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.stroke();
      for (let i = 0; i < 3; i++) { const y = -h * 0.3 + i * 12; polyline(g, [cx - 8, y, cx - 2, y - 6, cx + 4, y, cx + 10, y - 6]); g.stroke(); }
      g.strokeStyle = rgba('#8ee8a0', 0.32); g.lineWidth = 1;
      g.beginPath(); for (let a = 0; a < 9; a += 0.25) { const r = 2 + a * 1.6; g.lineTo(cx + Math.cos(a) * r - 0.5, cy + Math.sin(a) * r - 0.5); } g.stroke();
      // lichen + cracks + a storm rim on the right edge
      g.fillStyle = rgba(P.lichen, 0.55);
      for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(R.r(-hw * 0.8, hw * 0.6), R.r(-h * 0.9, -6), R.r(2, 5), R.r(1.5, 3.5), 0, 0, TAU); g.fill(); }
      strokeLine(g, [hw * 0.3, -h * 0.85, hw * 0.1, -h * 0.7, hw * 0.25, -h * 0.55], 1.3, P.crev);
      g.fillStyle = rgba('#86c8a0', 0.4); poly(g, [hw * 0.96 + lean * 0.6, -h * 0.75, hw * 1.1 + lean * 0.6, -h * 0.75, hw * 1.1, 4, hw * 0.92, 4]); g.fill();
    });
    snowCap(g, -hw * 0.75 + lean, hw * 0.6 + lean, (x) => outlineY(pts, x) - 0.5, 6, st.seed + 2, P, 1.3, 2);
    for (const [x, w, hh, s] of [[-hw - 8, 22, 10, 1], [hw + 6, 18, 8, 2]]) { g.save(); g.translate(x, 4); drawBoulder(g, w, hh, st.seed + s, P, 1.8, false); g.restore(); }
  }
  function drawBrokenStatue(g, P) {
    // a great clan dragon sitting on its plinth, one wing raised: the King's men struck off its head, snapped the
    // other wing and chained it in black iron.  Same design as the clan statues on the Dragon Road, at 2.5x.
    const st = '#69707a', sh = '#4a4f58', hi = '#8d959e', dk = '#2c3036';
    ink(g, (g) => poly(g, [-112, 4, -112, -24, 112, -24, 112, 4]), P.stone, 3, (g) => { g.fillStyle = P.stoneSh; g.fillRect(40, -28, 90, 34); g.fillStyle = P.stoneHi; g.fillRect(-112, -24, 224, 3); });
    ink(g, (g) => poly(g, [-92, -22, -92, -60, 92, -60, 92, -22]), P.stone, 3, (g) => {
      g.fillStyle = P.stoneSh; g.fillRect(34, -64, 70, 46); g.fillStyle = P.stoneHi; g.fillRect(-92, -60, 184, 3);
      g.strokeStyle = P.joint; g.lineWidth = 1.3; for (const x of [-46, 0, 46]) { polyline(g, [x, -60, x, -22]); g.stroke(); }
      g.strokeStyle = rgba('#7ac890', 0.3); g.lineWidth = 1.2; for (let x = -80; x < 90; x += 23) { g.beginPath(); g.arc(x, -41, 5, 0.3, 5.4); g.stroke(); }
    });
    // the raised wing (behind the body): finger bones fanning from the shoulder, scalloped membrane
    const sx0 = -18, sy0 = -186;
    const tips = [[-96, -318], [-150, -292], [-170, -246], [-158, -204], [-118, -176]];
    const wing = [sx0, sy0, -40, -262, ...tips[0]];
    for (let i = 1; i < tips.length; i++) { const [ax, ay] = tips[i - 1], [bx, by] = tips[i]; wing.push((ax + bx) / 2 + 10, (ay + by) / 2 + 10, bx, by); }
    wing.push(-70, -170);
    ink(g, (g) => poly(g, wing), sh, 3, (g) => {
      g.fillStyle = mix(sh, dk, 0.35); poly(g, [sx0, sy0, -170, -246, -158, -204, -118, -176, -70, -170]); g.fill();
      for (const [x, y] of tips) { strokeLine(g, [sx0 - 4, sy0 - 4, x, y], 5, st); strokeLine(g, [sx0 - 4, sy0 - 2, x + 2, y + 3], 1.3, rgba(LINE, 0.7)); }
      g.fillStyle = rgba(hi, 0.55); poly(g, [sx0, sy0, -40, -262, -96, -318, -60, -250]); g.fill();
    });
    ink(g, (g) => poly(g, [sx0 - 8, sy0 + 6, -40, -262, -34, -270, sx0 + 4, sy0 - 4]), st, 2.6);
    // the snapped stump of the other wing, behind the right shoulder
    ink(g, (g) => poly(g, [8, -176, 34, -214, 46, -206, 42, -224, 56, -214, 50, -194, 24, -168]), sh, 2.6, (g) => { g.fillStyle = dk; g.fillRect(40, -230, 24, 50); });
    // the body (level-1 clan statue, beheaded)
    g.save(); g.translate(0, -60); drawDragonStatue(g, st, sh, hi, 2.5, true); g.restore();
    // carved scales, weathering cracks and lichen on the big body
    {
      const R = mulberry(6010);
      g.strokeStyle = rgba(LINE, 0.3); g.lineWidth = 1.2;
      for (let row = 0; row < 6; row++) for (let k = 0; k < 4; k++) {
        const x = -46 + k * 15 + (row % 2) * 7, y = -112 - row * 13;
        if (Math.hypot((x + 8) / 46, (y + 128) / 50) > 1) continue;
        g.beginPath(); g.arc(x, y, 6, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      }
      strokeLine(g, [-40, -96, -32, -110, -38, -124, -30, -140], 1.5, rgba(dk, 0.8));
      strokeLine(g, [12, -164, 18, -150, 12, -138], 1.3, rgba(dk, 0.7));
      for (let i = 0; i < 10; i++) { g.fillStyle = rgba(i % 3 ? '#7f927c' : '#9aa486', 0.55); g.beginPath(); g.ellipse(R.r(-60, 30), R.r(-180, -80), R.r(2, 5), R.r(1.4, 3), 0, 0, TAU); g.fill(); }
    }
    // a green storm rim on the right edges
    g.strokeStyle = rgba('#8ad8aa', 0.35); g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(44, -192); g.quadraticCurveTo(60, -150, 52, -110); g.quadraticCurveTo(60, -92, 58, -66); g.stroke();
    // black-iron chains round the chest and the neck stump, a green-gem lock
    for (const [ax, ay, bx, by, sag] of [[-66, -104, 58, -124, 14], [-44, -150, 46, -168, 12], [-6, -206, 50, -214, 6]]) {
      for (let i = 0; i <= 12; i++) {
        const f = i / 12, cx = lerp(ax, bx, f), cy = lerp(ay, by, f) + Math.sin(f * Math.PI) * sag;
        g.lineWidth = 2.6; g.strokeStyle = LINE; g.beginPath(); g.ellipse(cx, cy, i % 2 ? 2.2 : 4, i % 2 ? 4 : 2.2, 0, 0, TAU); g.stroke();
        g.lineWidth = 1.4; g.strokeStyle = P.ironHi; g.stroke();
      }
    }
    ink(g, (g) => roundRect(g, -8, -126, 18, 16, 4), P.iron, 2, (g) => { g.fillStyle = KING.gem; g.fillRect(-3, -121, 8, 7); g.fillStyle = '#e8ffd8'; g.fillRect(-2, -120, 2.4, 2.4); });
    // snow on the ledges
    snowCap(g, -92, 92, () => -60, 6, 6011, P, 1.4, 2);
    snowCap(g, -112, -60, () => -24, 5, 6012, P, 1.3, 2);
    snowCap(g, -108, -40, (x) => lerp(-312, -262, (x + 108) / 68), 5, 6013, P, 1.2, 2);
    // the struck-off head lying on its side by the plinth, horns up
    g.save(); g.translate(148, 2);
    ink(g, (g) => { g.beginPath(); g.moveTo(-40, 2); g.quadraticCurveTo(-44, -30, -14, -38); g.lineTo(26, -30); g.lineTo(46, -18); g.lineTo(44, -8); g.lineTo(20, -6); g.lineTo(18, 2); g.closePath(); }, st, 2.8, (g) => {
      g.fillStyle = sh; g.fillRect(-44, -14, 100, 20);
      g.fillStyle = dk; g.beginPath(); g.ellipse(-2, -24, 5, 3, 0, 0, TAU); g.fill();
      strokeLine(g, [20, -14, 38, -14], 1.3, dk);
      g.fillStyle = hi; g.beginPath(); g.ellipse(-20, -30, 10, 3, -0.3, 0, TAU); g.fill();
    });
    ink(g, (g) => poly(g, [-26, -34, -40, -58, -18, -38]), sh, 2);
    ink(g, (g) => poly(g, [-12, -38, -16, -62, 0, -38]), sh, 2);
    snowCap(g, -36, 10, (x) => -36 - (x + 36) * 0.02, 4, 6014, P, 1.1, 2);
    g.restore();
    for (const [x, w, hh, s] of [[-136, 34, 14, 1], [-108, 22, 9, 2], [104, 24, 10, 3]]) { g.save(); g.translate(x, 4); drawBoulder(g, w, hh, 6020 + s, { rock: st, rockSh: sh, rockHi: hi, crev: dk, snow: P.snow, snowSh: P.snowSh }, 2, false); g.restore(); }
  }
  function drawBrazier(g) {
    const iron = '#2f3036', ironSh = '#1e1f24', ironHi = '#5c5f68';
    ink(g, (g) => poly(g, [-18, 2, -14, -56, 14, -56, 18, 2]), '#50555c', 2.6, (g) => { g.fillStyle = '#383c42'; g.fillRect(4, -60, 20, 64); g.fillStyle = '#6c737a'; g.fillRect(-18, -60, 5, 64); });
    ink(g, (g) => poly(g, [-22, -54, 22, -54, 22, -62, -22, -62]), '#43474e', 2.4);
    ink(g, (g) => { g.beginPath(); g.moveTo(-30, -84); g.quadraticCurveTo(-26, -60, 0, -60); g.quadraticCurveTo(26, -60, 30, -84); g.closePath(); }, iron, 2.6, (g) => {
      g.fillStyle = ironSh; g.fillRect(6, -90, 30, 32); g.fillStyle = ironHi; g.fillRect(-26, -84, 6, 14);
      g.fillStyle = '#16171b'; for (let x = -20; x <= 20; x += 10) g.fillRect(x - 1.5, -80, 3, 3);
      g.fillStyle = KING.gem; g.fillRect(-3, -76, 6, 5);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -84, 30, 5, 0, 0, TAU); }, '#1f2a22', 2.2, (g) => { g.fillStyle = '#3a7a3a'; g.beginPath(); g.ellipse(0, -83, 24, 3, 0, 0, TAU); g.fill(); });
    for (const s of [-1, 1]) ink(g, (g) => poly(g, [s * 30, -84, s * 38, -98, s * 33, -82]), iron, 1.8);
  }

  // ------------------------------------------------------------------ GROUND (floor band + back boundary + front edge)
  function drawGround(g, xa, xb) {
    if (xa < BA0 + 40) groundCliff(g, xa, Math.min(xb, BA0 + 40));
    // (the roost floor runs on under the summit paving's stepped edge, which can start up to ~200 px past SU0)
    if (xb > RO0 - 70 && xa < SU0 + 280) groundRoost(g, Math.max(xa, RO0 - 70), Math.min(xb, SU0 + 280));
    if (xb > SU0 - 100) groundSummit(g, Math.max(xa, SU0 - 100), xb);
    if (xb > BA0 - 30 && xa < BB1 + 40) groundBridges(g, Math.max(xa, BA0 - 30), Math.min(xb, BB1 + 40));
  }
  // natural rock floor: tonal patches, long cracks along the ledge, lit lips, pebbles, wind-swept snow (world-aligned)
  function rockFloor(g, x0, x1, P, seed, o = {}) {
    let gr = g.createLinearGradient(0, 356, 0, 520);
    gr.addColorStop(0, P.baseSh); gr.addColorStop(0.16, mix(P.base, P.baseSh, 0.3)); gr.addColorStop(0.45, P.base); gr.addColorStop(0.8, mix(P.base, P.baseHi, 0.25)); gr.addColorStop(1, mix(P.base, P.baseSh, 0.35));
    g.fillStyle = gr; g.fillRect(x0, 352, x1 - x0, 172);
    // the ledge's bedding: three long joints across the depth, each with a lit lip below it, and slab
    // joints between them (oblique, so the slabs read as lying flat); each slab tinted a little
    const beds = [(x) => 386 + 3 * Math.sin(x * 0.011 + seed) + 2 * Math.sin(x * 0.037), (x) => 424 + 4 * Math.sin(x * 0.009 + seed * 2) + 2 * Math.sin(x * 0.031 + 1), (x) => 470 + 5 * Math.sin(x * 0.007 + seed * 3) + 3 * Math.sin(x * 0.027 + 2)];
    const rowsY = [(x) => 362, ...beds, (x) => 520];
    for (let r = 0; r < 4; r++) {
      const ya = rowsY[r], yb = rowsY[r + 1], sw = 130 + r * 40;
      for (let i = Math.floor(x0 / sw) - 2; i * sw < x1 + sw * 2; i++) {
        const h = hash2(i, r * 31 + seed);
        const xa = i * sw + (h - 0.5) * sw * 0.5, xb = (i + 1) * sw + (hash2(i + 1, r * 31 + seed) - 0.5) * sw * 0.5;
        const ka = 0.22 * (ya(xa) - 362), kb = 0.22 * (yb(xa) - 362);
        g.fillStyle = rgba(h < 0.5 ? P.baseSh : P.baseHi, 0.1 + Math.abs(h - 0.5) * 0.4);
        poly(g, [xa + ka, ya(xa) + 1, xb + ka, ya(xb) + 1, xb + kb, yb(xb) - 1, xa + kb, yb(xa) - 1]); g.fill();
        if (hash2(i, r * 7 + seed + 3) < 0.7) {
          const y0 = ya(xa) + 2, y1 = yb(xa) - 2;
          strokeLine(g, [xa + 0.22 * (y0 - 362), y0, xa + 0.22 * ((y0 + y1) / 2 - 362) + 2, (y0 + y1) / 2, xa + 0.22 * (y1 - 362), y1], 1 + r * 0.2, rgba(P.crack, 0.4));
        }
      }
    }
    for (let k = 0; k < 3; k++) {
      const f = beds[k], lw = 1.1 + k * 0.35;
      g.beginPath(); for (let x = al(x0, 8) - 8; x <= x1 + 8; x += 8) g.lineTo(x, f(x) + 1.4); g.lineWidth = lw; g.strokeStyle = rgba(P.baseHi, 0.75); g.stroke();
      g.beginPath(); for (let x = al(x0, 8) - 8; x <= x1 + 8; x += 8) g.lineTo(x, f(x)); g.lineWidth = lw; g.strokeStyle = rgba(P.crack, 0.42); g.stroke();
    }
    // sunlight on the open middle of the ledge
    if (o.sun) {
      gr = g.createLinearGradient(0, 380, 0, 520);
      gr.addColorStop(0, rgba(o.sun, 0)); gr.addColorStop(0.35, rgba(o.sun, 0.2)); gr.addColorStop(0.7, rgba(o.sun, 0.12)); gr.addColorStop(1, rgba(o.sun, 0));
      g.fillStyle = gr; g.fillRect(x0, 380, x1 - x0, 140);
    }
    // broad tonal patches (low contrast)
    for (let gx = al(x0, 90) - 180; gx < x1 + 180; gx += 90) {
      const h = hash2(gx, seed);
      const cx = gx + hash2(gx, seed + 1) * 60, cy = 380 + hash2(gx, seed + 2) * 124, rw = 40 + h * 70, rh = 4 + (cy - 362) * 0.06;
      g.fillStyle = rgba(h < 0.5 ? P.baseSh : P.baseHi, 0.32);
      g.beginPath(); g.ellipse(cx, cy, rw, rh, 0, 0, TAU); g.fill();
    }
    // the worn walking line (lighter, feathered)
    if (o.path) {
      const pT = (x) => 404 + 5 * Math.sin(x * 0.009 + seed) + 3 * Math.sin(x * 0.031);
      const pB = (x) => 486 + 5 * Math.sin(x * 0.007 + 2) + 3 * Math.sin(x * 0.027 + 1);
      for (const [grow, a] of [[12, 0.12], [5, 0.16], [0, 0.18]]) {
        g.beginPath(); g.moveTo(al(x0, 8) - 8, pT(al(x0, 8) - 8) - grow);
        for (let x = al(x0, 8) - 8; x <= x1 + 8; x += 8) g.lineTo(x, pT(x) - grow);
        for (let x = al(x1, 8) + 8; x >= x0 - 8; x -= 8) g.lineTo(x, pB(x) + grow);
        g.closePath(); g.fillStyle = rgba(P.baseHi, a); g.fill();
      }
    }
    // cracks: long wandering lines along the ledge + short cross cracks (each crack has a lit lower lip)
    for (let c = Math.floor(x0 / 150) - 3; c < Math.ceil(x1 / 150) + 1; c++) {
      for (let k = 0; k < 2; k++) {
        const h = hash2(c, seed * 3 + k);
        if (h < 0.35) continue;
        const R = mulberry((c * 977 + k * 131 + seed * 7) >>> 0);
        let x = c * 150 + R.r(0, 100), y = R.r(372, 506);
        const pts = [x, y];
        const n = R.i(3, 6);
        for (let i = 0; i < n; i++) { x += R.r(20, 48); y += R.r(-3, 3) * (0.3 + (y - 362) / 150); pts.push(x, y); }
        if (pts[pts.length - 2] < x0 - 10 || pts[0] > x1 + 10) continue;
        const lw = 0.9 + (y - 362) / 150 * 0.8;
        g.save(); g.translate(0, 1.3); polyline(g, pts); g.lineWidth = lw; g.strokeStyle = rgba(P.baseHi, 0.7); g.stroke(); g.restore();
        polyline(g, pts); g.lineWidth = lw; g.strokeStyle = rgba(P.crack, 0.55); g.stroke();
        if (R() < 0.5) { const i = 2 * R.i(1, n - 1); strokeLine(g, [pts[i], pts[i + 1], pts[i] + R.r(-8, 8), pts[i + 1] + R.r(6, 16)], lw * 0.9, rgba(P.crack, 0.45)); }
      }
    }
    // pebbles
    for (let x = al(x0, 37) - 37; x < x1 + 37; x += 37) {
      const h = hash1(x * 11 + seed);
      if (h < 0.6) continue;
      const y = 370 + hash1(x * 5 + seed + 1) * 140, w = 4 + h * 6, sq = 0.4 + (y - 362) / 400;
      g.fillStyle = rgba(P.crack, 0.35); g.beginPath(); g.ellipse(x + 1, y + 1.2, w * 0.6, w * sq * 0.5, 0, 0, TAU); g.fill();
      g.fillStyle = mix(P.base, P.baseSh, 0.6); g.beginPath(); g.ellipse(x, y, w * 0.55, w * sq * 0.45, 0, 0, TAU); g.fill();
      g.fillStyle = rgba(P.baseHi, 0.9); g.beginPath(); g.ellipse(x - w * 0.15, y - w * sq * 0.15, w * 0.28, w * sq * 0.18, 0, 0, TAU); g.fill();
    }
    // wind-swept snow streaks, tapering downwind (right)
    for (let x = al(x0, 64) - 192; x < x1 + 64; x += 64) {
      const h = hash1(x * 7 + seed + 5);
      if (h < (o.snowK ?? 0.45)) continue;
      const y = 368 + hash1(x * 3 + seed) * 146, len = 30 + h * 70, th = 1.2 + (y - 362) * 0.014 + h * 1.4;
      const pts = [x, y, x + len * 0.15, y - th, x + len * 0.55, y - th * 0.7, x + len, y + th * 0.1, x + len * 0.5, y + th * 0.5, x + len * 0.12, y + th * 0.6];
      g.save(); g.translate(1, 1.2); blob(g, pts); g.fillStyle = rgba(P.snowSh, 0.35); g.fill(); g.restore();
      blob(g, pts); g.fillStyle = rgba(P.snow, 0.78); g.fill();
    }
  }
  // the front edge of a cliff-top floor: a lit lip, the rock face dropping away below it
  function frontLip(g, x0, x1, P, seed) {
    const lip = (x) => 518 + 2 * Math.sin(x * 0.031 + seed) + 1.5 * Math.sin(x * 0.083) + (hash1(Math.floor(x / 14) + seed) - 0.5) * 2.5;
    g.beginPath(); g.moveTo(al(x0, 6) - 6, H + 6);
    for (let x = al(x0, 6) - 6; x <= x1 + 6; x += 6) g.lineTo(x, lip(x));
    g.lineTo(x1 + 6, H + 6); g.closePath();
    const gr = g.createLinearGradient(0, 514, 0, H);
    gr.addColorStop(0, P.face); gr.addColorStop(1, P.faceDk);
    g.fillStyle = gr; g.fill();
    // vertical cracks + roots/icicles under the lip
    for (let x = al(x0, 19) - 19; x < x1 + 19; x += 19) {
      const h = hash1(x * 3 + seed);
      if (h < 0.45) continue;
      const y = lip(x) + 2;
      if (h > 0.86) ink(g, (g) => poly(g, [x - 2, y, x + 2, y, x, y + 6 + h * 8]), '#eef3fa', 1);
      else strokeLine(g, [x, y + 2, x + 1.5, y + 9, x - 1, y + 18], 1.2, rgba(P.faceDk, 0.7));
    }
    g.beginPath();
    for (let x = al(x0, 6) - 6; x <= x1 + 6; x += 6) g.lineTo(x, lip(x) - 1.2);
    g.lineWidth = 3; g.strokeStyle = P.lip; g.stroke();
    g.beginPath();
    for (let x = al(x0, 6) - 6; x <= x1 + 6; x += 6) g.lineTo(x, lip(x) + 0.6);
    g.lineWidth = 1.8 * LK; g.strokeStyle = LINE; g.stroke();
  }
  function groundCliff(g, xa, xb) {
    const P = NP.cliffs;
    lineStyle(P.line, 0.62);
    const x0 = Math.floor(xa) - 2, x1 = Math.min(Math.ceil(xb) + 2, BA0 + 14);
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    rockFloor(g, x0, x1, P, 3, { path: true, sun: '#ffe2c0', snowK: 0.55 });
    // long morning shadows of the crags fall across the ledge from the back left
    for (const [cx, k] of [[60, 1.2], [680, 1], [1320, 1.3], [1820, 1]]) {
      if (cx < x0 - 420 || cx > x1 + 120) continue;
      g.fillStyle = 'rgba(118,104,160,0.13)';
      g.beginPath(); g.moveTo(cx - 40 * k, 362); g.quadraticCurveTo(cx + 140 * k, 370, cx + 330 * k, 420 + 30 * k);
      g.quadraticCurveTo(cx + 220 * k, 446, cx + 40 * k, 402); g.quadraticCurveTo(cx - 20, 380, cx - 40 * k, 362); g.fill();
    }
    // the pennant poles and cairns throw long thin morning shadows downwind across the ledge
    for (const [px, w0, len] of [[236, 3, 150], [1150, 3, 150], [1792, 3, 150], [600, 18, 60], [1430, 18, 60]]) {
      if (px + len + 40 < x0 || px - 30 > x1) continue;
      g.fillStyle = 'rgba(100,84,140,0.2)';
      poly(g, [px - w0, 364, px + w0, 364, px + w0 + len, 364 + len * 0.42, px - w0 * 0.4 + len, 366 + len * 0.42]); g.fill();
    }
    // the back boundary: rubble and a snow drift against the base of the wall
    for (let x = al(x0, 70) - 140; x < x1 + 70; x += 70) {
      const h = hash1(x * 3 + 77);
      if (h < 0.35 || x > WALL_END - 30) continue;
      g.save(); g.translate(x + h * 40, 362); drawBoulder(g, 22 + h * 30, 12 + h * 14, (x * 7) | 0, P, 2, h > 0.6); g.restore();
    }
    const dTop = (x) => 352 + 3 * Math.sin(x * 0.05) + 2 * Math.sin(x * 0.13);
    if (x0 < WALL_END) snowLedge(g, x0, Math.min(x1, WALL_END - 6), dTop, 9, 101, P, 1.5);
    let gr = g.createLinearGradient(0, 362, 0, 384);
    gr.addColorStop(0, 'rgba(96,82,130,0.3)'); gr.addColorStop(1, 'rgba(96,82,130,0)');
    g.fillStyle = gr; g.fillRect(x0, 362, Math.min(x1, WALL_END) - x0, 22);
    // dry grass tufts bent downwind along the back and front
    g.strokeStyle = P.grass; g.lineWidth = 1.5;
    for (let x = al(x0, 27); x < x1; x += 27) {
      const h = hash1(x * 5 + 3);
      if (h < 0.45) continue;
      const y = h < 0.75 ? 366 + h * 8 : 504 + h * 6;
      for (let k = 0; k < 4; k++) { polyline(g, [x + k * 2.6, y, x + k * 2.6 + 4 + k * 1.5, y - 6 - h * 6 + k]); g.stroke(); }
    }
    frontLip(g, x0, x1, P, 7);
    // the ledge ends where bridge A starts: a sheared rock edge (hidden under the anchor beam)
    g.restore();
  }
  function groundRoost(g, xa, xb) {
    const P = NP.roost;
    lineStyle(P.line, 0.62);
    const x0 = Math.max(Math.floor(xa) - 2, RO0 - 30), x1 = Math.ceil(xb) + 2;
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    rockFloor(g, x0, x1, P, 13, { snowK: 0.72, path: true });
    // the plateau darkens toward the summit, so the slate paving ahead does not arrive as a jolt
    {
      const ga = Math.max(x0, SU0 - 700), gb = x1;
      if (gb > ga) { const lg = g.createLinearGradient(SU0 - 700, 0, SU0 + 60, 0); lg.addColorStop(0, 'rgba(48,52,66,0)'); lg.addColorStop(1, 'rgba(48,52,66,0.34)'); g.fillStyle = lg; g.fillRect(ga, 352, gb - ga, 172); }
    }
    // litter: twigs, feathers, bone bits, egg shards (denser at the back, calm in the middle)
    for (let x = al(x0, 23) - 23; x < x1 + 23; x += 23) {
      const h = hash1(x * 13 + 5);
      const back = hash1(x * 7 + 1) < 0.62;
      if (h < (back ? 0.25 : 0.72)) continue;
      const y = back ? 366 + hash1(x * 3) * 22 : 492 + hash1(x * 3) * 18;
      const kind = hash1(x * 17 + 3), ang = (hash1(x * 19) - 0.5) * 0.8, len = 10 + h * 18;
      if (kind < 0.55) {
        strokeLine(g, [x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.4], 2.8, rgba(P.twigDk, 0.75));
        strokeLine(g, [x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.4], 1.6, kind < 0.3 ? P.twig : P.twigHi);
      } else if (kind < 0.78) {
        g.save(); g.translate(x, y); g.rotate(ang * 0.6); g.scale(1, 0.6);
        g.fillStyle = rgba(P.featherSh, 0.9); g.beginPath(); g.moveTo(-8, 1); g.quadraticCurveTo(0, -4, 9, 0); g.quadraticCurveTo(0, 4, -8, 1); g.fill();
        g.fillStyle = P.feather; g.beginPath(); g.moveTo(-8, 0); g.quadraticCurveTo(0, -4.5, 9, -0.6); g.quadraticCurveTo(0, 2, -8, 0); g.fill();
        g.restore();
      } else if (kind < 0.9) {
        strokeLine(g, [x, y, x + 10, y + 1], 3.4, rgba(P.boneDk, 0.6)); strokeLine(g, [x, y, x + 10, y + 1], 2.2, P.bone);
        g.fillStyle = P.bone; g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.arc(x + 10, y + 1, 2.2, 0, TAU); g.fill();
      } else {
        g.fillStyle = P.egg; poly(g, [x, y, x + 6, y - 3, x + 9, y + 1, x + 4, y + 2.5]); g.fill();
        g.strokeStyle = rgba(P.eggSh, 0.9); g.lineWidth = 0.8; g.stroke();
      }
    }
    // shadow under the back rim
    let gr = g.createLinearGradient(0, 362, 0, 386);
    gr.addColorStop(0, 'rgba(54,46,72,0.34)'); gr.addColorStop(1, 'rgba(54,46,72,0)');
    g.fillStyle = gr; g.fillRect(x0, 362, x1 - x0, 24);
    // the green light pools of the King's lamps
    for (const lx of [3990, 4706, 5236]) {
      if (lx + 90 < x0 || lx - 90 > x1) continue;
      g.save(); g.translate(lx + 17, 372); g.scale(1, 0.22);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 80);
      rg.addColorStop(0, 'rgba(120,235,120,0.14)'); rg.addColorStop(1, 'rgba(120,235,120,0)');
      g.fillStyle = rg; g.fillRect(-80, -80, 160, 160); g.restore();
    }
    frontLip(g, x0, x1, P, 17);
    // the plateau's left end, where bridge B lands on it: a sheared rock edge (under the anchor beam)
    g.restore();
  }
  function flagRows(y0, y1, hs) { const rows = []; let y = y0; for (const h of hs) { if (y >= y1) break; rows.push([y, Math.min(y1, y + h)]); y += h; } return rows; }
  // Paving that reads as a horizontal plane (constant stone width, foreshortened rows); stone edges derive from
  // (row, index) only, so every chunk renders identical stones.  o.lo / o.hi: a stepped edge of whole stones.
  function drawPaving(g, x0, x1, rows, P, seed, o = {}) {
    const sw = o.w || 100, gap = o.gap || 1.5;
    const joint = mix(P.joint, P.stone, o.jointMix ?? 0.25);
    const ext = [];
    for (let r = 0; r < rows.length; r++) {
      const [ya, yb] = rows[r], rh = yb - ya;
      const lo = o.lo ? o.lo(r, ya, yb) : -Infinity, hi = o.hi ? o.hi(r, ya, yb) : Infinity;
      const off = hash1(r * 31 + seed) * sw;
      const edge = (i) => i * sw + off + (hash2(i, r * 7 + seed) - 0.5) * sw * 0.45;
      const stones = [];
      let xs = Infinity, xe = -Infinity;
      for (let i = Math.floor((x0 - off) / sw) - 3; ; i++) {
        const xa = edge(i), xb = edge(i + 1);
        if (xa > x1 + 2) break;
        if (xb < x0 - 2) continue;
        let loose = false;
        if (xa < lo || xb > hi) {
          const d = xa < lo ? lo - xa : xb - hi, reach = sw * 2.4;
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
        if (o.snow && hash2(i * 5, r + 3) > 0.62) { g.fillStyle = rgba(P.snow, 0.7); g.beginPath(); g.ellipse(xb, yb - 0.5, rh * 0.9, 1.4 + rh * 0.05, 0, 0, TAU); g.fill(); }
      }
    }
    return ext;
  }
  const seamEdge = (X, r, ya, yb, seed) => X + 0.2 * ((ya + yb) / 2 - 362) + (hash2(r, seed) - 0.5) * 56;
  function clipExt(g, ext, x0, x1) {
    g.beginPath(); g.rect(x0 - 2, GT0, x1 - x0 + 4, 362 - GT0);
    for (const [ya, yb, xs, xe] of ext) if (xe > xs) g.rect(xs, ya, xe - xs, yb - ya + (yb >= H ? 4 : 0));
    g.clip();
  }
  function groundSummit(g, xa, xb) {
    const P = NP.summit;
    lineStyle(P.line, 0.7);
    const x0 = Math.max(Math.floor(xa) - 2, SU0 - 100), x1 = Math.ceil(xb) + 2;
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    const rows = flagRows(362, 520, [14, 18, 22, 27, 33, 40, 48]);
    const ext = drawPaving(g, x0, x1, rows, P, 61, { w: 128, gap: 2, vary: 0.55, jointMix: 0.3, snow: true, loose: 0.28,
      lo: (r, ya, yb) => seamEdge(SU0 + 10, r, ya, yb, 905) });
    g.save(); clipExt(g, ext, x0, x1);
    // value lift in the middle of the circle so dark fighters separate from the slate; darker toward the front
    let gr = g.createLinearGradient(0, 362, 0, 520);
    gr.addColorStop(0, 'rgba(190,205,215,0.07)'); gr.addColorStop(1, 'rgba(4,8,12,0.28)');
    g.fillStyle = gr; g.fillRect(x0, 362, x1 - x0, 160);
    if (x1 > RING_X - 520 && x0 < RING_X + 520) {
      g.save(); g.translate(RING_X, 446); g.scale(1, 0.2);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 480);
      rg.addColorStop(0, 'rgba(176,196,210,0.28)'); rg.addColorStop(0.6, 'rgba(160,182,198,0.14)'); rg.addColorStop(1, 'rgba(150,175,190,0)');
      g.fillStyle = rg; g.fillRect(-480, -480, 960, 960); g.restore();
      // the shrine circle: a carved double ring with runes between, a coiled dragon at the centre (shallow, low contrast)
      g.save(); g.translate(RING_X, RING_Y); g.scale(1, 0.155);
      g.strokeStyle = 'rgba(12,16,20,0.45)'; g.lineWidth = 6;
      for (const r of [410, 448]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(150,175,170,0.3)'; g.lineWidth = 3;
      for (const r of [404, 442]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(122,200,144,0.28)'; g.lineWidth = 5;
      for (let a = 0; a < TAU; a += TAU / 36) { g.beginPath(); g.arc(Math.cos(a) * 429, Math.sin(a) * 429, 7, a, a + 4.2); g.stroke(); }
      g.strokeStyle = 'rgba(150,175,170,0.18)'; g.lineWidth = 16;
      g.beginPath(); g.arc(0, 0, 240, 0.4, 5.4); g.stroke();
      g.beginPath(); g.arc(0, 0, 120, 3.6, 8.7); g.stroke();
      g.restore();
    }
    // puddles from the storm (they catch the lightning)
    for (let gx = al(x0, 190) - 380; gx < x1 + 380; gx += 190) {
      const h = hash2(gx, 77);
      if (h < 0.58) continue;
      const cx = gx + h * 80, cy = 400 + hash2(gx, 78) * 100, rw = 24 + h * 24, rh = 3.5 + (cy - 362) * 0.035;
      g.fillStyle = 'rgba(14,18,24,0.5)'; g.beginPath(); g.ellipse(cx, cy, rw, rh, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(160,200,200,0.3)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(cx - 3, cy - 1, rw * 0.6, rh * 0.4, 0, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
    }
    // green light pools under the braziers
    for (const lx of [5846, 6184, 6436, 7024]) {
      if (lx + 130 < x0 || lx - 130 > x1) continue;
      g.save(); g.translate(lx, 378); g.scale(1, 0.24);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 120);
      rg.addColorStop(0, 'rgba(120,235,120,0.14)'); rg.addColorStop(1, 'rgba(120,235,120,0)');
      g.fillStyle = rg; g.fillRect(-120, -120, 240, 240); g.restore();
    }
    g.restore();
    // back edge shadow under the kerb
    gr = g.createLinearGradient(0, 364, 0, 382);
    gr.addColorStop(0, 'rgba(0,4,8,0.42)'); gr.addColorStop(1, 'rgba(0,4,8,0)');
    g.fillStyle = gr; g.fillRect(Math.max(x0, SU0 + 20), 364, x1 - Math.max(x0, SU0 + 20), 18);
    // front kerb: carved blocks of the platform's rim with a rune band
    const fk0 = Math.max(x0 - 6, SU0 - 20);
    if (x1 > fk0) {
      ink(g, (g) => poly(g, [fk0, H + 6, fk0, 518, x1 + 6, 518, x1 + 6, H + 6]), P.stone, 2.6, (g) => {
        g.fillStyle = P.stoneHi; g.fillRect(fk0, 518, x1 - fk0 + 6, 4);
        g.fillStyle = P.stoneSh; g.fillRect(fk0, 528, x1 - fk0 + 6, 16);
        g.strokeStyle = P.joint; g.lineWidth = 1.3;
        for (let x = al(fk0, 84); x < x1 + 6; x += 84) { polyline(g, [x, 518, x, H]); g.stroke(); }
        g.strokeStyle = rgba('#7ac890', 0.3); g.lineWidth = 1.1;
        for (let x = al(fk0, 42) + 21; x < x1 + 6; x += 42) { g.beginPath(); g.arc(x, 531, 3.5, 0.4, 5.4); g.stroke(); }
      });
    }
    g.restore();
  }
  // ----- the sky bridges: plank decks, anchor beams, the spire-top platform
  function groundBridges(g, xa, xb) {
    const P = NP.bridges;
    lineStyle(P.line, 0.62);
    if (xb > PL0 - 40 && xa < PL1 + 40) platform(g, Math.max(xa, PL0 - 40), Math.min(xb, PL1 + 40));
    for (const [d0, d1] of DECKS) if (xb > d0 - 30 && xa < d1 + 30) deck(g, Math.max(xa, d0 - 30), Math.min(xb, d1 + 30), d0, d1);
  }
  const PLANK = 27;
  const plankEdge = (i) => i * PLANK + (hash1(i * 7 + 3) - 0.5) * 5;
  function deck(g, xa, xb, d0, d1) {
    const P = NP.bridges;
    const x0 = Math.floor(xa) - 2, x1 = Math.ceil(xb) + 2;
    g.save(); g.beginPath(); g.rect(Math.max(x0, d0 - 18), GT0, Math.min(x1, d1 + 18) - Math.max(x0, d0 - 18), H - GT0); g.clip();
    g.save(); g.beginPath(); g.rect(Math.max(x0, d0), GT0, Math.min(x1, d1) - Math.max(x0, d0), H - GT0); g.clip();
    // joints (dark) under the planks
    g.fillStyle = P.woodDk; g.fillRect(x0, 364, x1 - x0, 146);
    for (let i = Math.floor(x0 / PLANK) - 1; ; i++) {
      const xa2 = plankEdge(i), xb2 = plankEdge(i + 1);
      if (xa2 > x1 + 2) break;
      if (xb2 < x0 - 2) continue;
      const h = hash1(i * 13 + 1), h2 = hash1(i * 29 + 5);
      const col = mix(P.wood, h < 0.5 ? P.woodSh : P.woodHi, Math.abs(h - 0.5) * 0.9);
      const sk = (h2 - 0.5) * 2.2;
      const pts = [xa2 + 1.2, 366, xb2 - 1.2, 366, xb2 - 1.2 + sk, 508, xa2 + 1.2 + sk, 508];
      poly(g, pts); g.fillStyle = col; g.fill();
      g.save(); poly(g, pts); g.clip();
      // lit left edge, shaded right edge, worn middle, darker front
      g.fillStyle = rgba(P.woodHi, 0.45); g.fillRect(xa2 + 1, 366, 2.2, 144);
      g.fillStyle = rgba(P.woodSh, 0.55); g.fillRect(xb2 - 4, 366, 3, 144);
      g.fillStyle = rgba('#efe2cc', 0.13); g.fillRect(xa2, 412, xb2 - xa2 + 3, 60);
      g.fillStyle = rgba(P.woodDk, 0.16); g.fillRect(xa2, 486, xb2 - xa2 + 3, 24);
      // grain
      g.strokeStyle = rgba(P.grain, 0.45); g.lineWidth = 1;
      for (let k = 0; k < 2; k++) {
        const gx = lerp(xa2 + 6, xb2 - 6, hash1(i * 31 + k)), w0 = hash1(i * 37 + k) * 6;
        g.beginPath(); g.moveTo(gx, 368); g.bezierCurveTo(gx + 2 - w0, 410, gx - 2 + w0, 450, gx + sk * 0.5 + 1, 506); g.stroke();
      }
      if (h2 > 0.78) { const ky = 400 + h * 80, kx = (xa2 + xb2) / 2; g.strokeStyle = rgba(P.grain, 0.6); g.beginPath(); g.ellipse(kx, ky, 3.5, 6, 0, 0, TAU); g.stroke(); g.fillStyle = rgba(P.woodDk, 0.45); g.beginPath(); g.ellipse(kx, ky, 1.5, 3, 0, 0, TAU); g.fill(); }
      if (h < 0.08) strokeLine(g, [xa2 + 8, 440, xa2 + 12, 470, xa2 + 9, 492], 1.2, rgba(P.woodDk, 0.7));   // a split plank
      // wind-blown snow caught in the seam
      if (h2 < 0.3) { g.fillStyle = rgba(P.snow, 0.7); g.beginPath(); g.ellipse(xb2 - 2.5, 372 + h * 26, 2, 3 + h * 4, 0, 0, TAU); g.fill(); }
      g.restore();
      // nail heads over the stringers
      g.fillStyle = '#3a3036';
      for (const y of [372, 502]) for (const dx of [0.3, 0.7]) { g.beginPath(); g.arc(lerp(xa2, xb2, dx) + (y > 400 ? sk : 0), y, 1.3, 0, TAU); g.fill(); }
      // a few joints open onto the void below (cut through to transparent)
      if (h2 > 0.86) {
        g.save(); g.globalCompositeOperation = 'destination-out';
        poly(g, [xb2 - 1.6, 380, xb2 + 1.4, 380, xb2 + 1.4 + sk * 0.5, 494, xb2 - 1.6 + sk * 0.5, 494]); g.fill(); g.restore();
      }
    }
    // the back stringer (a log) with lashings
    ink(g, (g) => roundRect(g, x0 - 4, 354, x1 - x0 + 8, 13, 5), P.post, 2.4, (g) => {
      g.fillStyle = P.postHi; g.fillRect(x0 - 4, 355, x1 - x0 + 8, 3);
      g.fillStyle = P.postSh; g.fillRect(x0 - 4, 362, x1 - x0 + 8, 5);
    });
    // the front stringer, the deck's underside and hanging rope tails
    ink(g, (g) => roundRect(g, x0 - 4, 505, x1 - x0 + 8, 13, 5), P.post, 2.4, (g) => {
      g.fillStyle = P.postHi; g.fillRect(x0 - 4, 506, x1 - x0 + 8, 3);
      g.fillStyle = P.postSh; g.fillRect(x0 - 4, 513, x1 - x0 + 8, 5);
    });
    g.fillStyle = rgba(P.woodDk, 0.95); g.fillRect(x0 - 4, 518, x1 - x0 + 8, 5);
    for (let i = Math.floor(x0 / (PLANK * 2)) - 1; i * PLANK * 2 < x1 + PLANK * 2; i++) {
      const x = plankEdge(i * 2) + 13;
      ink(g, (g) => poly(g, [x - 3, 353, x + 3, 353, x + 3, 368, x - 3, 368]), P.rope, 1);
      ink(g, (g) => poly(g, [x - 3, 504, x + 3, 504, x + 3, 519, x - 3, 519]), P.rope, 1);
      if (hash1(i * 3 + 1) > 0.55) { strokeLine(g, [x, 520, x + 2, 528, x + 1, 536], 2.4, LINE); strokeLine(g, [x, 520, x + 2, 528, x + 1, 536], 1.3, P.ropeSh); }
    }
    g.restore();
    // anchor beams across each end of the deck (hide the seams onto rock / stone)
    for (const ex of [d0, d1]) {
      if (ex < x0 - 30 || ex > x1 + 30) continue;
      ink(g, (g) => poly(g, [ex - 12, 350, ex + 12, 350, ex + 14, 524, ex - 14, 524]), P.post, 2.6, (g) => {
        g.fillStyle = P.postSh; g.fillRect(ex + 3, 346, 14, 182);
        g.fillStyle = rgba(P.postHi, 0.9); g.fillRect(ex - 12, 346, 4, 182);
        g.strokeStyle = P.postSh; g.lineWidth = 1.1;
        for (let k = 0; k < 3; k++) { polyline(g, [ex - 6 + k * 4, 360, ex - 5 + k * 4, 420, ex - 6 + k * 4, 516]); g.stroke(); }
      });
      for (const y of [352, 430, 512]) ink(g, (g) => poly(g, [ex - 14, y, ex + 14, y + 3, ex + 14, y + 9, ex - 14, y + 6]), P.rope, 1.2, (g) => { g.fillStyle = P.ropeSh; g.fillRect(ex - 14, y + 5, 30, 4); });
    }
    g.restore();
  }
  function platform(g, xa, xb) {
    const P = NP.bridges;
    const x0 = Math.max(Math.floor(xa) - 2, PL0 - 8), x1 = Math.min(Math.ceil(xb) + 2, PL1 + 8);
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    // the spire's rock body continues down past the front edge
    const R = mulberry(2900);
    const body = [PL0 - 8, 520, PL1 + 8, 520, PL1 - 18, H + 4, PL0 + 22, H + 4];
    poly(g, body);
    let gr = g.createLinearGradient(0, 516, 0, H);
    gr.addColorStop(0, P.rock); gr.addColorStop(1, P.rockSh);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = rgba(P.crev, 0.6); g.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) { const x = R.r(PL0, PL1); polyline(g, [x, 522, x + R.r(-3, 3), 532, x + R.r(-4, 4), H]); g.stroke(); }
    // flagstones
    const rows = flagRows(362, 518, [13, 16, 20, 25, 30, 36, 40]);
    drawPaving(g, x0, x1, rows, P, 29, { w: 76, gap: 1.6, vary: 0.45, jointMix: 0.35, snow: true });
    gr = g.createLinearGradient(0, 362, 0, 518);
    gr.addColorStop(0, 'rgba(255,250,244,0.08)'); gr.addColorStop(1, 'rgba(60,56,90,0.16)');
    g.fillStyle = gr; g.fillRect(x0, 362, x1 - x0, 156);
    // a carved clan circle around the waystone
    g.save(); g.translate((PL0 + PL1) / 2, 438); g.scale(1, 0.24);
    g.strokeStyle = rgba(P.joint, 0.4); g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 120, 0, TAU); g.stroke();
    g.strokeStyle = rgba(P.stoneHi, 0.45); g.lineWidth = 2.5; g.beginPath(); g.arc(-1, -4, 120, 0, TAU); g.stroke();
    g.strokeStyle = rgba(CLAN.red, 0.22); g.lineWidth = 12; g.beginPath(); g.arc(0, 0, 70, 0.5, 5.6); g.stroke();
    g.restore();
    // the low back kerb between the pillars
    ink(g, (g) => poly(g, [PL0 + 20, 368, PL0 + 20, 340, PL1 - 20, 340, PL1 - 20, 368]), P.stone, 2.6, (g) => {
      g.fillStyle = P.stoneSh; g.fillRect(PL0 + 20, 352, PL1 - PL0 - 40, 16); g.fillStyle = P.stoneHi; g.fillRect(PL0 + 20, 340, PL1 - PL0 - 40, 3);
      g.strokeStyle = P.joint; g.lineWidth = 1.3; for (let x = PL0 + 60; x < PL1 - 30; x += 58) { polyline(g, [x, 340, x, 368]); g.stroke(); }
    });
    snowLedge(g, PL0 + 20, PL1 - 20, () => 339, 5, 2901, P, 1.3);
    gr = g.createLinearGradient(0, 368, 0, 384);
    gr.addColorStop(0, 'rgba(60,54,84,0.32)'); gr.addColorStop(1, 'rgba(60,54,84,0)');
    g.fillStyle = gr; g.fillRect(PL0, 368, PL1 - PL0, 16);
    // the front rim of the platform
    ink(g, (g) => poly(g, [PL0 - 8, 514, PL1 + 8, 514, PL1 + 8, 523, PL0 - 8, 523]), P.stoneHi, 2.2, (g) => { g.fillStyle = P.stone; g.fillRect(PL0 - 8, 519, PL1 - PL0 + 16, 5); });
    g.restore();
  }

  // ------------------------------------------------------------------ foreground pass
  function buildFront(cs) {
    const fr = {};
    // the bridges' front rope rail: short posts + a sagging rope just below the floor band (p 1)
    lineStyle('#3a3040', 0.8);
    fr.rail = buildStrip(BA0 - 20, BB1 + 20, 478, H, cs, 1, (g, xa, xb) => {
      const P = NP.bridges;
      for (const [d0, d1] of DECKS) {
        if (d1 + 20 < xa || d0 - 20 > xb) continue;
        const n = Math.max(2, Math.round((d1 - d0) / 216));
        const xs = []; for (let i = 0; i <= n; i++) xs.push(lerp(d0 + 10, d1 - 10, i / n));
        for (let i = 0; i < n; i++) rope(g, xs[i], 506, xs[i + 1], 506, 9, 3, P);
        for (const x of xs) {
          ink(g, (g) => poly(g, [x - 7, H + 4, x - 6, 494, x + 6, 494, x + 7, H + 4]), P.post, 2.4, (g) => { g.fillStyle = P.postSh; g.fillRect(x + 1, 490, 8, 60); g.fillStyle = P.postHi; g.fillRect(x - 6, 490, 2.4, 60); });
          ink(g, (g) => { g.beginPath(); g.ellipse(x, 494, 7.5, 3, 0, Math.PI, TAU); g.closePath(); }, P.postHi, 1.6);
          ropeWrap(g, x, 503, 6, 2, P);
        }
      }
    });
    // occluders at parallax 1.25, each placed so it is never visible on an arena screen
    lineStyle('#14161c', 0.85);
    const dk = { pine: '#24363a', pineSh: '#18262a', pineHi: '#3a5254', bark: '#3b2a26', barkSh: '#271b19', snow: '#e6e0ea', snowSh: '#8f8aae', snowHi: '#ffffff',
      rock: '#4a4458', rockSh: '#332e40', rockHi: '#655c72', crev: '#1d1a26', crack: '#1d1a26' };
    // A: the opening frame - a dark crag with a wind-bent pine at the far left
    const fA = makeSprite(360, 600, 200, 588, cs, (g) => {
      g.save(); g.translate(-60, -140); drawWindPine(g, 330, 0.34, 7, dk, 3.4); g.restore();
      for (const [x, y, w, h, s] of [[-90, 4, 200, 170, 1], [-10, 6, 120, 90, 2], [-130, -120, 120, 120, 3]]) { g.save(); g.translate(x, y); drawBoulder(g, w, h, 70 + s, dk, 3.4, true); g.restore(); }
    });
    // B: the first bridge's great anchor post, wound with rope and prayer scarves streaming downwind
    const fB = makeSprite(170, 600, 50, 590, cs, (g) => {
      const P = { post: '#3c3029', postSh: '#2a211c', postHi: '#56463c', rope: '#8e7a56', ropeSh: '#64553c', ropeDk: '#3a2f22' };
      ink(g, (g) => poly(g, [-26, 10, -24, -540, 24, -540, 26, 10]), P.post, 3.6, (g) => {
        g.fillStyle = P.postSh; g.fillRect(4, -560, 30, 580); g.fillStyle = P.postHi; g.fillRect(-24, -560, 6, 580);
        g.strokeStyle = P.postSh; g.lineWidth = 1.6; for (let y = -520; y < 0; y += 46) { polyline(g, [-14, y, -10, y + 30]); g.stroke(); }
      });
      for (const y of [-300, -60]) ropeWrap(g, 0, y, 25, 4, P);
      ink(g, (g) => { g.beginPath(); g.ellipse(36, -40, 26, 12, 0, 0, TAU); g.ellipse(36, -40, 14, 5, 0, 0, TAU, true); }, P.rope, 2.4);
      const R = mulberry(1886);
      for (const [y0, n] of [[-420, 3], [-200, 4]]) {
        ropeWrap(g, 0, y0 - 4, 25, 2, P);
        for (let i = 0; i < n; i++) {
          const y = y0 + i * 7, len = R.r(70, 110), col = mix(PRAYER[(i * 2 + (y0 & 3)) % 5], '#1a1622', 0.45);
          const pts = [20, y - 3, 20 + len * 0.3, y - 6 + R.r(-3, 3), 20 + len * 0.62, y + R.r(0, 6), 20 + len, y + R.r(4, 12), 20 + len * 0.6, y + 9, 20 + len * 0.3, y + 4, 20, y + 4];
          ink(g, (g) => blob(g, pts), col, 2.2, (g) => { g.fillStyle = mix(col, '#000000', 0.3); g.fillRect(20, y + 2, len, 10); });
        }
      }
    });
    // C: a long rope of prayer flags sagging across the top of the frame on bridge B
    const fC = makeSprite(520, 190, 260, 20, cs, (g) => {
      const ax = -260, ay = -6, bx = 260, by = 4, mx = 0, my = 120;
      const qp = (f) => [(1 - f) * (1 - f) * ax + 2 * (1 - f) * f * mx + f * f * bx, (1 - f) * (1 - f) * ay + 2 * (1 - f) * f * my + f * f * by];
      g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by); g.lineWidth = 5; g.strokeStyle = '#14161c'; g.stroke(); g.lineWidth = 2.6; g.strokeStyle = '#6e5e46'; g.stroke();
      for (let i = 1; i < 15; i++) {
        const [x, y] = qp(i / 15), col = mix(PRAYER[i % 5], '#1a1622', 0.4), sw = 9 + (i % 3) * 3;
        const pts = [x - 13, y, x + 13, y, x + 13 + sw, y + 30 + (i % 2) * 4, x - 13 + sw, y + 32];
        ink(g, (g) => poly(g, pts), col, 2.4, (g) => { g.fillStyle = mix(col, '#000000', 0.28); poly(g, [x - 13, y + 20, x + 13, y + 20, x + 13 + sw, y + 40, x - 13 + sw, y + 40]); g.fill(); });
      }
    });
    // D: roost debris in the near foreground: dark boulders, spilled sticks, a hatched egg shell and a feather (low)
    const fD = makeSprite(280, 170, 140, 156, cs, (g) => {
      const R = mulberry(4520);
      for (let i = 0; i < 22; i++) { const x = R.r(-130, 110), y = R.r(-60, -10), a = R.r(-0.7, 0.4), l = R.r(30, 70); strokeLine(g, [x, y, x + Math.cos(a) * l, y + Math.sin(a) * l * 0.6], 5, '#14161c'); strokeLine(g, [x, y, x + Math.cos(a) * l, y + Math.sin(a) * l * 0.6], 3.2, i % 3 ? '#4a3a2c' : '#62503a'); }
      // half an egg shell, rocking on its back
      ink(g, (g) => { g.beginPath(); g.moveTo(-70, -64); g.quadraticCurveTo(-66, -14, -20, -12); g.quadraticCurveTo(26, -14, 30, -60); g.lineTo(18, -52); g.lineTo(8, -62); g.lineTo(-4, -50); g.lineTo(-16, -62); g.lineTo(-30, -52); g.lineTo(-44, -64); g.lineTo(-56, -54); g.closePath(); }, '#a9bdb6', 3.4, (g) => {
        g.fillStyle = '#7f938e'; g.beginPath(); g.ellipse(4, -30, 34, 24, 0, 0, TAU); g.fill();
        g.fillStyle = '#5e6a78'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(R.r(-60, 20), R.r(-56, -20), R.r(1.5, 3.5), R.r(1, 2.4), 0, 0, TAU); g.fill(); }
      });
      for (const [x, y, w, h, sd] of [[60, 14, 130, 70, 1], [-110, 16, 110, 50, 2], [130, 18, 80, 40, 3]]) { g.save(); g.translate(x, y); drawBoulder(g, w, h, 4500 + sd, dk, 3.4, sd === 1); g.restore(); }
      g.save(); g.translate(30, -72); g.rotate(-0.5);
      ink(g, (g) => { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(18, -10, 52, -3); g.quadraticCurveTo(20, 10, 0, 0); g.closePath(); }, '#9a98a6', 2.6, (g) => { g.fillStyle = '#6e6c7a'; g.fillRect(0, 0, 56, 12); });
      strokeLine(g, [-6, 1, 52, -3], 1.6, '#3a3844');
      g.restore();
    });
    // E: a black-iron chain hanging into the frame with a torn venom-green banner
    const fE = makeSprite(130, 420, 40, 10, cs, (g) => {
      for (let i = 0; i < 26; i++) { const y = -6 + i * 12; g.lineWidth = 5; g.strokeStyle = '#14161c'; g.beginPath(); g.ellipse(0, y, i % 2 ? 3.5 : 7, i % 2 ? 7 : 3.5, 0, 0, TAU); g.stroke(); g.lineWidth = 2.6; g.strokeStyle = '#3f3f48'; g.stroke(); }
      ink(g, (g) => roundRect(g, -12, 312, 24, 22, 5), '#2a2a30', 3, (g) => { g.fillStyle = KING.gem; g.fillRect(-5, 318, 10, 9); });
      drawKingBanner(g, 6, 110, 70, 200, 555, 3);
    });
    for (const [spr, a] of [[fA, 0.25], [fB, 0.3], [fC, 0.3], [fD, 0.3], [fE, 0.2]]) {
      const g = spr.c.getContext('2d');
      if (!g) continue;                    // (a sprite the memory cap left empty)
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(16,10,24,${a})`; g.fillRect(0, 0, spr.c.width, spr.c.height);
    }
    fr.list = [{ spr: fA, wx: 64, y: 556 }, { spr: fB, wx: 1886, y: 560 }, { spr: fC, wx: 3232, y: 0 }, { spr: fD, wx: 4520, y: 556 }, { spr: fE, wx: 5700, y: -14 }];
    return fr;
  }

  // ------------------------------------------------------------------ props (built at the full device scale)
  function buildItems(s) {
    const it = {};
    lineStyle(INK, 1);   // interactive things keep the actors' full ink
    for (const k of Object.keys(PROP_INFO)) {
      const info = PROP_INFO[k];
      const spr = makeSprite(info.w + 24, info.h + 20, info.w / 2 + 12, info.h + 10, s, (g) => PROP_DRAW[k](g));
      const white = makeSprite(info.w + 24, info.h + 20, info.w / 2 + 12, info.h + 10, s, (g) => {
        g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(spr.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, spr.c.width, spr.c.height);
      });
      it[k] = { spr, white };
    }
    it.disc = makeSprite(74, 74, 37, 37, s, (g) => drawGongDisc(g));
    it.discWhite = makeSprite(74, 74, 37, 37, s, (g) => { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(it.disc.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, it.disc.c.width, it.disc.c.height); });
    it.ringGlow = radialSprite(60, Math.min(s, 2), [[0, 'rgba(255,230,150,0.9)'], [0.35, 'rgba(255,190,90,0.45)'], [1, 'rgba(255,160,60,0)']]);
    return it;
  }

  // ------------------------------------------------------------------ per-frame drawing
  function updateWind(camX, t) {
    const dt = lastT === null ? 1 / 60 : clamp(t - lastT, 0, 0.1);
    lastT = t;
    const base = windBase(camX) * (0.86 + 0.1 * Math.sin(t * 0.83) + 0.06 * Math.sin(t * 2.3 + 1));
    windNow = base + 1.1 * gustAt(t);
    windPh += dt * windNow;
  }
  function drawBack(ctx, camX, t = 0) {
    if (!C) { released = false; setScale(S || 1); }
    camX = clamp(+camX || 0, 0, CAM_MAX);
    curT = t; curCam = camX;
    if (t !== lastT) updateWind(camX, t);
    ctx.save();
    const wt = palWeights(camX, warm);
    // --- sky
    const sk = [0, 1, 2, 3].map((i) => {
      let r = 0, gg = 0, b = 0;
      for (const k of PAL_NAMES) if (wt[k]) { const c = rgb(SKY[k][i]); r += c[0] * wt[k]; gg += c[1] * wt[k]; b += c[2] * wt[k]; }
      return `rgb(${r | 0},${gg | 0},${b | 0})`;
    });
    const gr = ctx.createLinearGradient(0, 0, 0, 380);
    gr.addColorStop(0, sk[0]); gr.addColorStop(0.42, sk[1]); gr.addColorStop(0.74, sk[2]); gr.addColorStop(1, sk[3]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 388);
    // --- sun: low and pale-gold at dawn, white and high by day; breaking through the storm when warm
    const sunA = wt.morn + wt.day * 0.55;
    if (sunA > 0.01) {
      ctx.globalAlpha = sunA;
      const sx = 230 - camX * 0.04 - wt.day * 40, sy = 236 - wt.day * 150;
      ctx.drawImage(C.sun.c, sx - 280, sy - 280, 560, 560);
      ctx.globalAlpha = 1;
    }
    if (wt.gold > 0.01) {
      ctx.globalAlpha = wt.gold;
      ctx.drawImage(C.sun.c, 760 - 300, 70 - 300, 600, 600);
      ctx.globalAlpha = 1;
    }
    // --- clouds (they ride the wind, left to right)
    for (const k of PAL_NAMES) {
      const a = wt[k];
      if (a < 0.01 || !C.cloud[k]) continue;
      ctx.globalAlpha = a;
      for (const { cl, spr } of C.cloud[k]) {
        let x = (cl.x - camX * 0.05 + windPh * cl.sp * 3 + t * cl.sp * 0.4) % CL_PERIOD;
        if (x < 0) x += CL_PERIOD;
        x -= 280;
        if (x - spr.ox > W || x - spr.ox + spr.w < 0) continue;
        ctx.drawImage(spr.c, snap(x - spr.ox), cl.y - spr.oy, spr.w, spr.h);
      }
    }
    ctx.globalAlpha = 1;
    // --- the storm's eye turning over the summit (fades away when the storm breaks)
    const vA = (wt.storm + wt.gold * (1 - warm)) * 0.8;
    if (vA > 0.02) {
      ctx.save(); ctx.globalAlpha = vA;
      ctx.translate(560 - (camX - CAM_MAX) * 0.06, 54); ctx.scale(1.75, 0.4); ctx.rotate(-t * 0.05 - windPh * 0.03);
      ctx.drawImage(C.vortex.c, -320, -320, 640, 640);
      ctx.restore();
    }
    // --- lightning (storm only, gentle): the sky brightens, a bolt strikes the far spires
    const stormK = wt.storm;
    const L = stormK > 0.05 ? lightning(t) : null;
    if (L) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(120,170,190,${0.16 * L.f * stormK})`; ctx.fillRect(0, 0, W, 380);
      ctx.globalCompositeOperation = 'source-over';
    }
    // --- far spires (same silhouettes in every palette: paint the first active palette opaque, fade the next over it)
    const act = PAL_NAMES.filter((k) => wt[k] > 0.05 && C.far[k]), wsum = act.reduce((s, k) => s + wt[k], 0);
    const pa = (i, k) => (i === 0 ? 1 : wt[k] / wsum);
    act.forEach((k, i) => drawStripA(ctx, C.far[k], camX, pa(i, k)));
    if (L && L.f > 0.35) { ctx.globalCompositeOperation = 'lighter'; drawBolt(ctx, L.k, L.f * stormK, 250); ctx.globalCompositeOperation = 'source-over'; }
    // --- far cloud sea
    act.forEach((k, i) => drawTile(ctx, C.sea0[k], camX * P_SEA0 - windPh * 5, pa(i, k)));
    // --- mid pinnacles + flying collared wyverns
    act.forEach((k, i) => drawStripA(ctx, C.mid[k], camX, pa(i, k)));
    const wyA = clamp(wt.gale + wt.day * 0.5 - 0.1, 0, 1) * (1 - wt.gold);
    if (wyA > 0.02) drawWyverns(ctx, camX, t, wyA, wt);
    // --- near cloud sea
    act.forEach((k, i) => drawTile(ctx, C.sea1[k], camX * P_SEA1 - windPh * 11, pa(i, k)));
    // --- big spires around the bridges
    const spAct = act.filter((k) => C.spire[k]);
    if (spAct.length && camX > 1250 && camX < 4000) {
      const ssum = spAct.reduce((s, k) => s + wt[k], 0);
      spAct.forEach((k, i) => drawStripA(ctx, C.spire[k], camX, i === 0 ? 1 : wt[k] / ssum));
    }
    // --- eagles over the ledge
    if (camX < 2200) drawEagles(ctx, camX, t, clamp((2200 - camX) / 500, 0, 1));
    // --- wind wisps (back)
    drawWisps(ctx, camX, t, false, wt);
    // --- the void under the sky bridges (seen past the front edge and through the plank joints)
    {
      const a = Math.max(0, BA0 - 30 - camX), b = Math.min(W, BB1 + 30 - camX);
      if (b > a) {
        const vAct = act.filter((k) => C.voids[k]);
        if (vAct.length) {
          ctx.save(); ctx.beginPath(); ctx.rect(a, 380, b - a, H - 380); ctx.clip();
          const vs = vAct.reduce((s, k) => s + wt[k], 0);
          vAct.forEach((k, i) => {
            const Q = CSEA[k];
            ctx.globalAlpha = i === 0 ? 1 : wt[k] / vs;
            ctx.fillStyle = Q.deep; ctx.fillRect(a, 380, b - a, H - 380);
            drawTile(ctx, C.voids[k], camX * P_VOID - windPh * 16, i === 0 ? 1 : wt[k] / vs);
          });
          ctx.globalAlpha = 1;
          ctx.restore();
        }
      }
    }
    // --- back strips (p 1) + live cloth / pines
    drawStrip(ctx, C.back.wall, camX);
    drawStrip(ctx, C.back.rail, camX);
    drawStrip(ctx, C.back.roost, camX);
    drawStrip(ctx, C.back.summit, camX);
    for (const l of C.back.live) if (l.x1 > camX - 40 && l.x0 < camX + W + 40) l.draw(ctx, camX, t);
    // rune glows on the summit stones (venom green, gold once the storm breaks)
    drawRunes(ctx, camX, t);
    // --- ground
    drawStrip(ctx, C.ground, camX);
    // --- near-front sprites + live
    drawSprites(ctx, C.back.front, camX);
    for (const l of C.back.liveF) if (l.x1 > camX - 40 && l.x0 < camX + W + 40) l.draw(ctx, camX, t);
    // --- lightning lights the scene a little; the storm darkens the corners; gold light when it breaks
    if (L) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(130,190,200,${0.07 * L.f * stormK})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    const vgA = sstep(4900, 6000, camX) * 0.5 * (1 - 0.85 * warm);
    if (vgA > 0.01) { ctx.globalAlpha = vgA; ctx.drawImage((EDGEFIX ? C.vignetteEdge : C.vignette).c, 0, 0, W, H); ctx.globalAlpha = 1; }
    if (EDGEFIX && vgA > 0.01) {
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = vgA / 0.5; ctx.drawImage(C.edgeLight.c, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    if (wt.gold > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.36 * wt.gold; ctx.drawImage(C.rays.c, 0, 0, W, H);
      ctx.fillStyle = `rgba(255,190,110,${0.07 * wt.gold})`; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // --- back snow / sleet
    drawSnow(ctx, camX, t, 0, 1, wt);
    ctx.restore();
  }

  function drawFront(ctx, camX, t = 0, opts = {}) {
    if (!C) { released = false; setScale(S || 1); }
    camX = clamp(+camX || 0, 0, CAM_MAX);
    if (t !== lastT) updateWind(camX, t);
    ctx.save();
    // bridges' front rope rail
    if (camX + W > BA0 - 30 && camX < BB1 + 30) drawStrip(ctx, C.front.rail, camX);
    // occluders at parallax 1.25
    for (const o of C.front.list) {
      const sx = 480 + (o.wx - (camX + 480)) * P_FRONT;
      if (sx - o.spr.ox + o.spr.w < -10 || sx - o.spr.ox > W + 10) continue;
      // (a hero, a pickup or a chest behind it: it fades to ~35%, easing -- opts.see, World.render)
      const x0 = sx - o.spr.ox, y0 = o.y - o.spr.oy, hid = (opts.see || []).some((q) => q.x + q.w / 2 > x0 + 6 && q.x - q.w / 2 < x0 + o.spr.w - 6 && q.y1 > y0 && q.y0 < y0 + o.spr.h);
      o.fade = (o.fade ?? 1) + ((hid ? 0.35 : 1) - (o.fade ?? 1)) * 0.18;
      ctx.globalAlpha = o.fade;
      ctx.drawImage(o.spr.c, snap(x0), y0, o.spr.w, o.spr.h);
      ctx.globalAlpha = 1;
    }
    const wt = palWeights(camX, warm);
    drawWisps(ctx, camX, t, true, wt);
    drawSnow(ctx, camX, t, 2, 2, wt);
    drawFeathers(ctx, camX, t);
    // a soft lightning wash (kept low: gentle on the eyes)
    if (wt.storm > 0.05) {
      const L = lightning(t);
      if (L) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(150,210,220,${0.035 * L.f * wt.storm})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    }
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
  function drawStripA(ctx, st, camX, a) {
    if (!st || a <= 0.003) return;
    ctx.globalAlpha = a; drawStrip(ctx, st, camX); ctx.globalAlpha = 1;
  }
  function drawTile(ctx, spr, off, a) {
    if (a <= 0.003) return;
    let x = -(((off % SEA_PER) + SEA_PER) % SEA_PER);
    ctx.globalAlpha = a;
    for (; x < W; x += SEA_PER) ctx.drawImage(spr.c, snap(x), -spr.oy, spr.w, spr.h);
    ctx.globalAlpha = 1;
  }
  function drawSprites(ctx, list, camX) {
    for (const o of list) {
      const sx = o.x - camX;
      if (sx - o.spr.ox > W || sx - o.spr.ox + o.spr.w < 0) continue;
      ctx.drawImage(o.spr.c, snap(sx - o.spr.ox), o.y - o.spr.oy, o.spr.w, o.spr.h);
    }
  }
  function drawWyverns(ctx, camX, t, a, wt) {
    const cx0 = -camX * P_WYV;
    ctx.fillStyle = wt.gale >= wt.day ? '#3b3f52' : '#45577a';
    ctx.globalAlpha = a * 0.85;
    for (const d of LAY.wyverns) {
      const ang = d.ph + t * d.sp;
      const x = cx0 + d.cx + Math.cos(ang) * d.rx, y = d.cy + Math.sin(ang) * d.ry;
      if (x < -60 || x > W + 60) continue;
      const dir = -Math.sin(ang) * Math.sign(d.sp) >= 0 ? 1 : -1;
      dragonSil(ctx, x, y, d.s, Math.sin(t * d.fl + d.ph), dir);
      ctx.fillStyle = KING.gem; ctx.fillRect(x + dir * 9 * d.s - 1, y - 5 * d.s, 2, 1.6);
      ctx.fillStyle = wt.gale >= wt.day ? '#3b3f52' : '#45577a';
    }
    ctx.globalAlpha = 1;
  }
  function drawEagles(ctx, camX, t, a) {
    if (a <= 0.01) return;
    ctx.fillStyle = '#4b4560'; ctx.globalAlpha = a * 0.9;
    for (const e of LAY.eagles) {
      const ang = e.ph + t * e.sp;
      const x = e.cx - camX * P_EAGLE + Math.cos(ang) * e.rx, y = e.cy + Math.sin(ang) * e.ry;
      if (x < -40 || x > W + 40) continue;
      const fl = Math.sin(t * 1.3 + e.ph);
      birdSil(ctx, x, y, e.s, fl > 0.7 ? Math.sin(t * 9 + e.ph) : 0.2);
    }
    ctx.globalAlpha = 1;
  }
  function drawWisps(ctx, camX, t, near, wt) {
    const a0 = (0.22 + 0.25 * clamp(windNow - 0.4, 0, 1)) * (near ? 0.6 : 1) * (1 - 0.6 * wt.storm) * (1 - 0.5 * wt.gold);
    if (a0 < 0.02) return;
    const spr = C.wisp;
    for (const w of LAY.wisps) {
      if (w.near !== near) continue;
      const par = near ? 1.1 : 0.45;
      let x = (w.x - camX * par + windPh * 120 * w.sp) % 1500;
      if (x < 0) x += 1500;
      x -= 300;
      if (x > W || x + w.len < 0) continue;
      ctx.globalAlpha = a0 * w.a;
      ctx.drawImage(spr.c, x, w.y - 6 - Math.sin(t * 0.7 + w.x) * 4, w.len, 12);
    }
    ctx.globalAlpha = 1;
  }
  function drawSnow(ctx, camX, t, lmin, lmax, wt) {
    const sum = sstep(5300, 6000, camX);
    const dens = (0.26 + 0.12 * sstep(3600, 4400, camX) + 0.4 * sum) * (1 - warm * wt.gold);
    const par = [0.35, 0.8, 1.35];
    const wx = windNow;
    const motes = warm * wt.gold;
    for (const f of LAY.flakes) {
      if (f.layer < lmin || f.layer > lmax) continue;
      const on = f.k < (f.layer === 2 ? dens * (0.55 - 0.3 * sum) : dens);
      const mo = !on && f.k < motes * 0.35;
      if (!on && !mo) continue;
      const vx = mo ? 10 : (40 + 50 * f.layer) * wx * f.v, vy = mo ? -6 : f.sp * (1 + sum * 0.9);
      let x = f.x - camX * par[f.layer] + (mo ? t * vx : windPh * (40 + 50 * f.layer) * f.v) + Math.sin(t * f.fr + f.ph) * f.sw;
      let y = f.y + t * vy;
      x = ((x % 1000) + 1000) % 1000 - 20;
      y = ((y % 580) + 580) % 580 - 20;
      if (mo) { ctx.globalAlpha = 0.7 * motes; ctx.drawImage(C.mote.c, x - 3, y - 3, 6, 6); continue; }
      const ang = Math.atan2(vy, vx);
      const spr = C.streak[ang < 0.25 ? 0 : ang < 0.55 ? 1 : 2];
      const sz = [7, 11, 17][f.layer] * (0.8 + 0.4 * clamp(wx, 0, 1.4));
      ctx.globalAlpha = f.layer === 0 ? 0.55 : f.layer === 1 ? 0.75 : 0.85;
      ctx.drawImage(spr.c, x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }
  function drawFeathers(ctx, camX, t) {
    const a = sstep(3300, 3800, camX) * (1 - sstep(5500, 5900, camX));
    if (a < 0.02) return;
    const spr = C.feather;
    for (const f of LAY.feathers) {
      let x = (f.x - camX * 1.1 + windPh * 150 * f.sp) % 1200;
      if (x < 0) x += 1200;
      x -= 120;
      if (x < -20 || x > W + 20) continue;
      const y = f.y + Math.sin(t * 1.3 + f.ph) * f.bob;
      ctx.save(); ctx.globalAlpha = a * 0.9; ctx.translate(x, y); ctx.rotate(t * f.rs + f.ph); ctx.scale(f.s, f.s * Math.abs(Math.cos(t * 2 + f.ph)) + 0.2);
      ctx.drawImage(spr.c, -spr.ox, -spr.oy, spr.w, spr.h); ctx.restore();
    }
  }
  function drawRunes(ctx, camX, t) {
    if (camX < SU0 - W) return;
    ctx.globalCompositeOperation = 'lighter';
    const glows = fire().glows;
    for (const st of STONES) {
      const x = st.x - camX + st.lean * 0.4, y = 364 - st.h * 0.55;
      if (x < -60 || x > W + 60) continue;
      const p = 0.32 + 0.12 * Math.sin(t * 1.6 + st.x * 0.01);
      for (const [spr, a] of glows) { ctx.globalAlpha = p * a; ctx.drawImage(spr.c, x - 28, y - 28, 56, 56); }
    }
    // the shrine circle breathing faintly
    const rx = RING_X - camX;
    if (rx > -500 && rx < W + 500) {
      const p = 0.16 + 0.06 * Math.sin(t * 1.1);
      for (const [spr, a] of glows) { ctx.globalAlpha = p * a; ctx.drawImage(spr.c, rx - 470, RING_Y - 52, 940, 104); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ props (public)
  function drawProp(ctx, kind, sx, sy, opts) {
    if (!C) { released = false; setScale(S || 1); }
    const it = C.items[kind];
    if (!it) return;
    const flash = (opts && opts.flash) || 0, shake = (opts && opts.shake) || 0;
    const now = performance.now();
    const dx = shake ? shake * Math.sin(now * 0.09) : 0;
    ctx.save();
    ctx.fillStyle = 'rgba(20,14,30,0.28)';
    ctx.beginPath(); ctx.ellipse(sx, sy, PROP_INFO[kind].w * 0.55, 6, 0, 0, TAU); ctx.fill();
    const s = it.spr;
    ctx.drawImage(s.c, sx + dx - s.ox, sy - s.oy, s.w, s.h);
    if (kind === 'gong') {
      const GI = C.items;
      // the disc hangs at (0, -62); ring 0..1 makes it shiver, glow and send out sound rings
      const ring = clamp((opts && opts.ring) || 0, 0, 1);
      const vib = ring * (2.4 * Math.sin(now * 0.11) + 1.2 * Math.sin(now * 0.23));
      const sc = 1 + 0.03 * ring * Math.sin(now * 0.17);
      const cx = sx + dx + vib, cy = sy - 62 + Math.abs(vib) * 0.2;
      const d = GI.disc;
      if (ring > 0) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75 * ring;
        ctx.drawImage(GI.ringGlow.c, cx - 70, cy - 70, 140, 140);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(d.c, cx - d.ox * sc, cy - d.oy * sc, d.w * sc, d.h * sc);
      if (ring > 0) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 * ring;
        ctx.drawImage(GI.discWhite.c, cx - d.ox * sc, cy - d.oy * sc, d.w * sc, d.h * sc);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) {
          const f = ((now * 0.0012 + i / 3) % 1);
          ctx.strokeStyle = `rgba(255,226,150,${(1 - f) * 0.8 * ring})`;
          ctx.beginPath(); ctx.ellipse(cx, cy, 34 + f * 46, (34 + f * 46) * 0.92, 0, 0, TAU); ctx.stroke();
        }
      }
      if (flash > 0) { ctx.globalAlpha = clamp(flash, 0, 1) * 0.7; ctx.drawImage(GI.discWhite.c, cx - d.ox, cy - d.oy, d.w, d.h); ctx.globalAlpha = 1; }
    }
    if (kind === 'urn') {
      // wind chimes swinging under the totem's crossbar
      const w = windNow, tt = curT;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const x = sx + dx - 9 + i * 6, y = sy - 61, len = 12 + (i % 2) * 5 + i;
        const a = Math.sin(tt * (3 + i * 0.4) + i * 1.7) * (0.12 + 0.3 * w) + 0.15 * w;
        const ex = x + Math.sin(a) * len, ey = y + Math.cos(a) * len;
        ctx.strokeStyle = INK; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(x + Math.sin(a) * 3, y + 3); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = i % 2 ? '#c99a46' : '#e2bd6a'; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.strokeStyle = 'rgba(60,40,30,0.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * 3, y + 3); ctx.stroke();
      }
    }
    if (flash > 0) { ctx.globalAlpha = clamp(flash, 0, 1) * 0.7; ctx.drawImage(it.white.c, sx + dx - s.ox, sy - s.oy, s.w, s.h); }
    ctx.restore();
  }

  function info() {
    let px = 0, n = 0;
    const add = (c) => { px += c.width * c.height; n++; };
    const strips = [...Object.values(C.far), ...Object.values(C.mid), ...Object.values(C.spire), C.ground, C.back.wall, C.back.rail, C.back.roost, C.back.summit, C.front.rail];
    for (const s of strips) for (const ch of s.chunks) if (ch.c) add(ch.c);
    for (const k of Object.keys(C.sea0)) { add(C.sea0[k].c); add(C.sea1[k].c); for (const { spr } of C.cloud[k]) add(spr.c); }
    for (const k of Object.keys(C.voids)) add(C.voids[k].c);
    const seen = new Set();
    for (const o of C.back.front) if (!seen.has(o.spr.c)) { seen.add(o.spr.c); add(o.spr.c); }
    for (const o of C.front.list) add(o.spr.c);
    return { canvases: n, megapixels: +(px / 1e6).toFixed(1), approxMB: +((px * 4) / 1048576).toFixed(0), buildMs: +C.buildMs.toFixed(0), cs: C.cs, wind: +windNow.toFixed(2) };
  }

  /** free the caches now (iOS: the canvas memory cap counts them); rebuilt when it's next drawn on screen */
  function release() { if (C) freeCanvases(C); C = null; released = true; }
  return { setScale, setWarm, windGust, drawBack, drawFront, drawProp, info, release };
}

// ---------------------------------------------------------------------------------------------------------------
// fixed dressing positions
// ---------------------------------------------------------------------------------------------------------------
const PERCHES = [
  { x: 3712, h: 236, w: 74, seed: 31 }, { x: 4064, h: 186, w: 62, seed: 32 }, { x: 4566, h: 252, w: 84, seed: 33 },
  { x: 4994, h: 204, w: 66, seed: 34 }, { x: 5262, h: 150, w: 56, seed: 35 },
];
const NESTS = [
  { x: 3846, w: 286, h: 112, seed: 41, eggs: [[-0.22, 1], [0.02, 2], [0.2, 1]] },
  { x: 4336, w: 224, h: 92, seed: 42, eggs: [[-0.12, 2], [0.12, 1]] },
  { x: 5128, w: 300, h: 118, seed: 43, eggs: [[-0.26, 2], [-0.04, 1], [0.18, 2]] },
  { x: 4566, w: 120, h: 50, seed: 44, eggs: [[0.05, 1]], perch: true, by: 352 - 252 + 6 },
];
const SKULL_X = 4176, RIBS_X = 4840;
const nestBase = (N) => (N.perch ? N.by : Math.round(rimTop(N.x) + 6));
const STATUE_X = 6010;
const STONES = [
  { x: 5664, h: 152, w: 46, lean: -4, seed: 51 }, { x: 5770, h: 126, w: 40, lean: 5, seed: 52 },
  { x: 6300, h: 168, w: 50, lean: -6, seed: 53 }, { x: 6566, h: 92, w: 44, lean: 3, seed: 54, broken: true },
  { x: 6904, h: 140, w: 46, lean: 6, seed: 55 }, { x: 7140, h: 182, w: 54, lean: -5, seed: 56 },
];

// ---------------------------------------------------------------------------------------------------------------
// PROPS (this level's breakables; the engine makes the gong an interactable: opts.ring 0..1)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 62, h: 60, colors: ['#b07d4a', '#7e552f', '#d9a565', '#d9c08a'] },
  barrel: { w: 50, h: 66, colors: ['#8f633f', '#61401f', '#b9844f', '#d9c08a'] },
  urn:    { w: 44, h: 74, colors: ['#c06a44', '#8a4630', '#efe1c4', '#d0a04a'] },
  gong:   { w: 92, h: 112, colors: ['#c8913a', '#8a5a24', '#a6322b', '#e2b24c'] },
};
const PROP_DRAW = {
  crate(g) {
    // a lashed supply crate: boards, a canvas bundle roped on the lid, the clan's stencil
    const wood = '#b07d4a', woodSh = '#7e552f', woodHi = '#d9a565', woodDk = '#5a3a20', rope = '#d9c08a', ropeSh = '#9c7f4f', tarp = '#dacdb0', tarpSh = '#a99a7c';
    const FL = -28, FR = 24, TOPY = -44, dx = 7, dy = -10;
    ink(g, (g) => poly(g, [FR, 0, FR + dx, dy, FR + dx, TOPY + dy, FR, TOPY]), woodSh, 2.6, (g) => { g.strokeStyle = woodDk; g.lineWidth = 1.2; for (const y of [-15, -30]) { polyline(g, [FR, y, FR + dx, y + dy]); g.stroke(); } });
    ink(g, (g) => poly(g, [FL, TOPY, FR, TOPY, FR + dx, TOPY + dy, FL + dx, TOPY + dy]), woodHi, 2.6);
    ink(g, (g) => poly(g, [FL, 0, FL, TOPY, FR, TOPY, FR, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4;
      for (const y of [-15, -30]) { polyline(g, [FL, y, FR, y]); g.stroke(); }
      g.fillStyle = woodSh; g.fillRect(FL, TOPY, 5, 44); g.fillRect(FR - 5, TOPY, 5, 44);
      g.fillStyle = rgba(woodHi, 0.6); g.fillRect(FL + 5, TOPY + 1, FR - FL - 10, 2);
      // grain + nail heads
      g.strokeStyle = rgba(woodDk, 0.45); g.lineWidth = 1;
      for (const [y, x] of [[-8, -12], [-23, 4], [-38, -6]]) { polyline(g, [FL + 8 + x * 0.2, y, FL + 22 + x, y + 1, FR - 8, y]); g.stroke(); }
      g.fillStyle = '#3c3236'; for (const x of [FL + 2.5, FR - 2.5]) for (const y of [-7, -22, -37]) { g.beginPath(); g.arc(x, y, 1.2, 0, TAU); g.fill(); }
      // faded clan stencil
      clanEmblem(g, -12, -22, 15, rgba(CLAN.red, 0.55));
    });
    // canvas bundle on the lid
    ink(g, (g) => blob(g, [FL + 2, TOPY - 2, FL + 6, TOPY - 14, FL + 20, TOPY - 18, FR - 2, TOPY - 16, FR + 6, TOPY - 10, FR + 4, TOPY - 2, FL + 18, TOPY + 1]), tarp, 2.2, (g) => {
      g.fillStyle = tarpSh; g.fillRect(FL, TOPY - 6, 70, 10);
      g.strokeStyle = tarpSh; g.lineWidth = 1.1; polyline(g, [FL + 8, TOPY - 10, FL + 18, TOPY - 6]); g.stroke(); polyline(g, [FL + 26, TOPY - 14, FL + 34, TOPY - 8]); g.stroke();
    });
    // rope lashing: two verticals over the lid and down the front, a horizontal band, a knot
    for (const x of [-15, 10]) {
      g.lineWidth = 5; g.strokeStyle = INK; polyline(g, [x, TOPY - 15, x + 1, TOPY, x, -1]); g.stroke();
      g.lineWidth = 3.2; g.strokeStyle = rope; g.stroke();
      g.save(); g.setLineDash([1.4, 2.4]); g.lineWidth = 2.2; g.strokeStyle = ropeSh; g.stroke(); g.restore();
    }
    g.lineWidth = 5; g.strokeStyle = INK; polyline(g, [FL - 1, -24, FR + 1, -24, FR + dx, -24 + dy]); g.stroke();
    g.lineWidth = 3.2; g.strokeStyle = rope; g.stroke();
    ink(g, (g) => { g.beginPath(); g.ellipse(10, -24, 4.5, 3.6, 0, 0, TAU); }, rope, 1.6, (g) => { g.fillStyle = ropeSh; g.fillRect(10, -26, 6, 6); });
    ink(g, (g) => poly(g, [9, -21, 12, -12, 8, -11, 7, -20]), rope, 1.3);
    // a little wind-blown snow in the corner
    ink(g, (g) => blob(g, [FR - 10, TOPY + 2, FR - 4, TOPY - 2, FR + 4, TOPY - 6, FR + 6, TOPY - 1, FR, TOPY + 3]), '#f6f8fb', 1.1);
  },
  barrel(g) {
    // a rope-bound water barrel with a lid and a wooden dipper
    const wood = '#8f633f', woodSh = '#61401f', woodHi = '#b9844f', rope = '#d9c08a', ropeSh = '#9c7f4f';
    const body = (g) => { g.beginPath(); g.moveTo(-19, -56); g.quadraticCurveTo(-28, -28, -19, 0); g.ellipse(0, 0, 19, 5, 0, Math.PI, 0, true); g.quadraticCurveTo(28, -28, 19, -56); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(8, -64, 30, 70);
      g.fillStyle = woodHi; g.fillRect(-19, -58, 6, 62);
      g.strokeStyle = woodSh; g.lineWidth = 1.3;
      for (const k of [-0.55, -0.15, 0.25, 0.62]) { g.beginPath(); g.moveTo(k * 19, -56); g.quadraticCurveTo(k * 28, -28, k * 19, 4); g.stroke(); }
      // twisted rope hoops
      for (const y of [-46, -12]) {
        g.fillStyle = INK; g.fillRect(-30, y - 5, 60, 10);
        g.fillStyle = rope; g.fillRect(-30, y - 3.6, 60, 7.2);
        g.strokeStyle = ropeSh; g.lineWidth = 1.4;
        for (let x = -30; x < 30; x += 4) { polyline(g, [x, y + 3.4, x + 3, y - 3.4]); g.stroke(); }
      }
      // a drip stain
      g.fillStyle = rgba('#4f6f86', 0.35); g.fillRect(-4, -40, 4, 26);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -56, 19, 6, 0, 0, TAU); }, woodHi, 2.4, (g) => { g.strokeStyle = woodSh; g.lineWidth = 1.1; for (const x of [-8, 0, 8]) { polyline(g, [x, -62, x, -50]); g.stroke(); } g.fillStyle = woodSh; g.fillRect(-12, -57.5, 24, 3); });
    // dipper hooked on the rim
    g.lineWidth = 4.2; g.strokeStyle = INK; polyline(g, [6, -58, 16, -70, 24, -70]); g.stroke();
    g.lineWidth = 2.4; g.strokeStyle = '#a77a4a'; g.stroke();
    ink(g, (g) => { g.beginPath(); g.ellipse(26, -64, 6, 7, 0, 0, TAU); }, '#9a6c3f', 2, (g) => { g.fillStyle = '#6e4a28'; g.fillRect(26, -72, 8, 16); });
    ink(g, (g) => blob(g, [-14, -57, -6, -62, 4, -62, 12, -59, 4, -55, -8, -55]), '#f6f8fb', 1.1);
  },
  urn(g) {
    // a wind-chime totem: a glazed clay pot with a carved bird post and a crossbar (the chimes swing live)
    const clay = '#c06a44', claySh = '#8a4630', clayHi = '#e39a6c', glaze = '#efe1c4', blue = '#4f7fc0';
    // post + crossbar + carved bird head
    ink(g, (g) => poly(g, [-3, -40, -3, -68, 3, -68, 3, -40]), '#7a5534', 2.2, (g) => { g.fillStyle = '#5a3c22'; g.fillRect(0.5, -70, 4, 32); });
    ink(g, (g) => poly(g, [-14, -61, 14, -63, 14, -59, -14, -57]), '#8a6038', 2);
    ink(g, (g) => { g.beginPath(); g.moveTo(-4, -66); g.quadraticCurveTo(-4, -76, 3, -77); g.lineTo(11, -74); g.lineTo(4, -71); g.lineTo(4, -66); g.closePath(); }, '#9a6c40', 2, (g) => { g.fillStyle = INK; g.beginPath(); g.arc(1.5, -73.5, 1.1, 0, TAU); g.fill(); g.fillStyle = CLAN.red; g.fillRect(-4, -70, 8, 3); });
    // a ribbon streaming from the crossbar
    ink(g, (g) => poly(g, [13, -62, 26, -58, 34, -62, 28, -55, 13, -59]), CLAN.red, 1.6);
    // the pot
    const body = (g) => {
      g.beginPath(); g.moveTo(-11, 0); g.quadraticCurveTo(-24, -6, -22, -22); g.quadraticCurveTo(-20, -36, -10, -40);
      g.lineTo(-11, -44); g.lineTo(11, -44); g.lineTo(10, -40); g.quadraticCurveTo(20, -36, 22, -22); g.quadraticCurveTo(24, -6, 11, 0); g.closePath();
    };
    ink(g, body, clay, 2.6, (g) => {
      g.fillStyle = claySh; g.beginPath(); g.ellipse(12, -18, 13, 24, 0, 0, TAU); g.fill();
      g.fillStyle = clayHi; g.beginPath(); g.ellipse(-12, -27, 3.5, 7, 0.3, 0, TAU); g.fill();
      // glaze band with blue cloud swirls
      g.fillStyle = INK; g.fillRect(-30, -31, 60, 13);
      g.fillStyle = glaze; g.fillRect(-30, -29.5, 60, 10);
      g.strokeStyle = blue; g.lineWidth = 1.6;
      for (const x of [-16, -4, 8, 20]) { g.beginPath(); g.arc(x, -24.5, 3, Math.PI * 0.2, Math.PI * 1.7); g.stroke(); polyline(g, [x + 3, -23, x + 7, -23]); g.stroke(); }
      g.fillStyle = rgba(INK, 0.6); g.fillRect(-30, -9, 60, 1.6);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -44, 11.5, 3.2, 0, 0, TAU); }, '#3a2420', 1.8);
    ink(g, (g) => blob(g, [-10, -45, -3, -47, 6, -47, 11, -45, 4, -43, -6, -43]), '#f6f8fb', 1);
  },
  gong(g) {
    // the frame only (the disc is a separate sprite so it can shiver): red lacquered posts, an upswept beam
    const red = CLAN.red, redSh = CLAN.redSh, redHi = CLAN.redHi, gold = CLAN.gold;
    for (const s of [-1, 1]) {
      ink(g, (g) => poly(g, [s * 36 - 5, 0, s * 36 - 4.5, -100, s * 36 + 4.5, -100, s * 36 + 5, 0]), red, 2.8, (g) => { g.fillStyle = redSh; g.fillRect(s * 36 + 1, -104, 6, 108); g.fillStyle = redHi; g.fillRect(s * 36 - 5, -104, 2, 108); });
      ink(g, (g) => poly(g, [s * 36 - 11, 2, s * 36 - 9, -10, s * 36 + 9, -10, s * 36 + 11, 2]), '#6a6270', 2.4, (g) => { g.fillStyle = '#4c4554'; g.fillRect(s * 36 + 2, -12, 12, 16); });
      ink(g, (g) => poly(g, [s * 36 - 7, -78, s * 36 + 7, -78, s * 36 + 7, -73, s * 36 - 7, -73]), gold, 1.6);
    }
    ink(g, (g) => { g.beginPath(); g.moveTo(-50, -112); g.quadraticCurveTo(-44, -101, -30, -100); g.lineTo(30, -100); g.quadraticCurveTo(44, -101, 50, -112); g.lineTo(46, -98); g.quadraticCurveTo(40, -92, 28, -92); g.lineTo(-28, -92); g.quadraticCurveTo(-40, -92, -46, -98); g.closePath(); }, '#2e2a30', 2.8, (g) => { g.fillStyle = '#1f1c22'; g.fillRect(-50, -97, 100, 8); g.fillStyle = gold; g.fillRect(-28, -99, 56, 2); });
    ink(g, (g) => { g.beginPath(); g.arc(0, -104, 4, 0, TAU); }, gold, 1.6);
    // cords holding the disc
    for (const x of [-12, 12]) { g.lineWidth = 3.4; g.strokeStyle = INK; polyline(g, [x, -92, x * 0.6, -86]); g.stroke(); g.lineWidth = 1.8; g.strokeStyle = '#d9c08a'; g.stroke(); }
    // the mallet hanging on the right post
    g.lineWidth = 4; g.strokeStyle = INK; polyline(g, [41, -62, 48, -36]); g.stroke(); g.lineWidth = 2.4; g.strokeStyle = '#8a6038'; g.stroke();
    ink(g, (g) => { g.beginPath(); g.ellipse(49, -32, 6, 5, 0.3, 0, TAU); }, '#efe1c4', 1.8, (g) => { g.fillStyle = '#c9b892'; g.fillRect(49, -38, 8, 12); });
    ink(g, (g) => blob(g, [-48, -111, -40, -104, -28, -102, -10, -102, -20, -99, -40, -100]), '#f6f8fb', 1.1);
  },
};
function drawGongDisc(g) {
  // bronze disc (centre 0, 0): rim, hammered rings, a raised boss, the clan dragon embossed
  const br = '#c8913a', brSh = '#8a5a24', brHi = '#f0c46a', brDk = '#5e3b18';
  ink(g, (g) => { g.beginPath(); g.arc(0, 0, 30, 0, TAU); }, br, 2.8, (g) => {
    g.fillStyle = brSh; g.beginPath(); g.arc(6, 6, 29, 0, TAU); g.fill();
    g.fillStyle = br; g.beginPath(); g.arc(-1.5, -1.5, 25, 0, TAU); g.fill();
    g.strokeStyle = rgba(brDk, 0.6); g.lineWidth = 1.2;
    for (const r of [20, 13]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
    g.strokeStyle = rgba(brHi, 0.7); g.lineWidth = 1;
    for (const r of [20, 13]) { g.beginPath(); g.arc(-0.8, -0.8, r, Math.PI * 1.05, Math.PI * 1.6); g.stroke(); }
    clanEmblem(g, 0, 0, 30, rgba(brDk, 0.5));
    g.fillStyle = rgba('#fff4cc', 0.75); g.beginPath(); g.ellipse(-12, -14, 7, 3.5, -0.7, 0, TAU); g.fill();
  });
  ink(g, (g) => { g.beginPath(); g.arc(0, 0, 6.5, 0, TAU); }, brHi, 1.8, (g) => { g.fillStyle = br; g.beginPath(); g.arc(2, 2, 5, 0, TAU); g.fill(); g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(-2, -2, 1.6, 0, TAU); g.fill(); });
}
