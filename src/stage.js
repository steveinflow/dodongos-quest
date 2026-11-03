// Dodongo's Quest - Stage 1 "THE DRAGON ROAD": backgrounds, breakable props and pickups (canvas 2D, no deps).
//
// Back-to-front:  sky gradient + sun + clouds (palette blended by camX)  ->  far peaks (parallax 0.1) + circling
// dragons  ->  mid ridges (0.3)  ->  gorge (0.55, bridge only) / cliffs (0.6, gate only), each clipped to its section
// ->  near sprites (1.0)  ->  ground tiles (floor + back boundary, 1.0)  ->  near-front sprites + live bits (flames,
// flags, pennants, smoke)  ->  back snow.        drawFront: front parapet / occluders (1.0 / 1.25), near snow, flash.
//
// Every static element is pre-rendered once per scale into offscreen canvases (strips chunked to <= ~2048 device px,
// plus reusable sprites); only the animated bits are drawn live.  All layout randomness is seeded.

import { W, H, FLOOR_TOP, FLOOR_BOTTOM, STAGE_LEN, INK } from './config.js';
import { STAGE_CS, layerCanvas, blankCanvas, liveCanvas, cacheCanvas, freeCanvases } from './canvasmem.js';
const EDGEFIX = (() => { try { return new URLSearchParams(location.search).get('edgefix') !== 'none'; } catch { return true; } })();

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
// Outline style. Scenery uses a thinner line tinted to its section's local dark colour so the actors (full INK)
// pop; breakable props and pickups are built with the full INK style (see buildItems).
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
function mdp(a, b, R, depth, rough, vertOnly = false) {
  let pts = [a, b];
  let amp = rough * Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let d = 0; d < depth; d++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const off = (R() * 2 - 1) * amp;
      if (vertOnly) np.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + off], q);
      else {
        const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
        np.push([(p[0] + q[0]) / 2 - (dy / l) * off, (p[1] + q[1]) / 2 + (dx / l) * off], q);
      }
    }
    pts = np; amp *= 0.5;
  }
  return pts;
}
const flat = (pts) => { const o = []; for (const p of pts) o.push(p[0], p[1]); return o; };

// soft radial sprite (glows, mist, snowflakes)
function radialSprite(r, sc, stops) {
  return makeSprite(r * 2, r * 2, r, r, sc, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// palettes
// ---------------------------------------------------------------------------------------------------------------
const SKY = {
  dawn:  { s: ['#8a79aa', '#c99bb6', '#efbfa3', '#fde3ab'], glow: '#ffe2a0' },
  day:   { s: ['#4d89cb', '#7cb3e0', '#b5d8ee', '#e6f1ec'], glow: '#fff6d8' },
  over:  { s: ['#6d7685', '#8b939f', '#a7adb6', '#c0c3c6'], glow: '#d0d2d4' },
  storm: { s: ['#16161e', '#27303a', '#3a4c48', '#56735e'], glow: '#4f6e58' },
};
const FARP = {
  dawn:  { rock: '#ad98b4', rockSh: '#8676a0', snow: '#fde9e2', snowSh: '#bfaed2', haze: '#efc6b9', line: '#9a86a8' },
  day:   { rock: '#93a7c3', rockSh: '#6f83a6', snow: '#f8fbff', snowSh: '#bccce5', haze: '#cfe3ef', line: '#8597b5' },
  over:  { rock: '#868d9b', rockSh: '#6a7081', snow: '#dfe2e7', snowSh: '#adb3be', haze: '#b8bcc2', line: '#7b8190' },
  storm: { rock: '#323a3b', rockSh: '#22282b', snow: '#6f7c79', snowSh: '#4a5556', haze: '#304039', line: '#2a3233' },
};
const MIDP = {
  dawn:  { back: '#9b88a6', front: '#6a6185', tree: '#544e72', snow: '#efdde4', snowSh: '#b3a2c4', haze: '#e2bbb9', house: '#7a6a7c', roof: '#5e5068', win: '#ffd890' },
  day:   { back: '#86a2b8', front: '#527184', tree: '#3f5e70', snow: '#f0f5f9', snowSh: '#adc3d6', haze: '#c6dce8', house: '#8095a6', roof: '#5a6878', win: '#2c3644' },
  over:  { back: '#7e858f', front: '#56606a', tree: '#47515b', snow: '#d6dade', snowSh: '#9fa7b1', haze: '#adb2b9', house: '#727a84', roof: '#4f5660', win: '#88c878' },
  storm: { back: '#2d3536', front: '#1f2627', tree: '#192121', snow: '#5a6764', snowSh: '#3a4645', haze: '#2e3c36', house: '#2a3232', roof: '#1c2222', win: '#7be05a' },
};
const CLOUDP = {
  dawn:  { body: '#9883a7', sh: '#6e5c86', lit: '#c9a3b9', rim: '#ffd8b0' },
  day:   { body: '#eef3f9', sh: '#bfcfe4', lit: '#fbfdff', rim: '#ffffff' },
  over:  { body: '#8c939e', sh: '#6a707e', lit: '#a3aab4', rim: '#bcc1c8' },
  storm: { body: '#2b3138', sh: '#171a1f', lit: '#3d4c47', rim: '#6f9c78' },
};
// near palettes (section lighting baked in)
const NP = {
  trail: {
    pine: '#3f5b56', pineSh: '#2a3e42', pineHi: '#5e7b68', bark: '#6b4b40', barkSh: '#47302c',
    snow: '#fbf1f0', snowSh: '#bab3d8', snowHi: '#ffffff',
    rock: '#9a8b9a', rockSh: '#6b5f78', rockHi: '#cbb5b5', crack: '#4c4358',
  },
  bridge: {
    stone: '#bcb2a6', stoneSh: '#8f8780', stoneHi: '#dcd4c6', joint: '#6b6470',
    snow: '#f6f9fc', snowSh: '#b1c3db', snowHi: '#ffffff',
    rock: '#8e97a5', rockSh: '#65707f', rockHi: '#b8c1cb', crack: '#4a5260',
    pine: '#3a5a5c', pineSh: '#273f45', pineHi: '#5a7c76', bark: '#5e4638', barkSh: '#3f2e28',
  },
  village: {
    stone: '#9a958f', stoneSh: '#726d70', stoneHi: '#b9b3aa', joint: '#57525a',
    timber: '#5f4637', timberSh: '#3f2e26', timberHi: '#7d604b', plaster: '#d0c5b2', plasterSh: '#a99d8d',
    roof: '#5d4847', roofSh: '#3f302f', snow: '#edf0f3', snowSh: '#a8b2c5', snowHi: '#ffffff',
    rock: '#8a8d95', rockSh: '#62666f', rockHi: '#adb0b6', crack: '#4a4d55',
    pine: '#3b5352', pineSh: '#28393b', pineHi: '#55706a', bark: '#5a4436', barkSh: '#3d2d26',
  },
  gate: {
    stone: '#5b6462', stoneSh: '#3c4443', stoneHi: '#7f8b87', joint: '#262c2c',
    snow: '#b8c3c0', snowSh: '#76837f', snowHi: '#d9e2de',
    rock: '#3b4444', rockSh: '#272f2f', rockHi: '#56645f', crack: '#171c1c',
  },
};
const KING = { cloth: '#1d1b22', clothHi: '#302d38', clothSh: '#111015', green: '#7cc95c', greenSh: '#3f7f3a' };
const CLAN = { red: '#a6322b', redSh: '#76201d', redHi: '#c8524a', gold: '#e2b24c', goldSh: '#a87a2c' };
const FIRE = { outer: '#2f9440', mid: '#73e35c', core: '#e2ffb8' };
const FIRE_WARM = { outer: '#c4501c', mid: '#ffa53a', core: '#fff0b8' };
const SKY_WARM = ['#3e3446', '#6e5a62', '#b98a74', '#e8bf8e'];   // the storm lifting at the gate

// palette keyframes along camX
const PAL_KEYS = [[0, 'dawn'], [1050, 'dawn'], [1750, 'day'], [2700, 'day'], [3250, 'over'], [4250, 'over'], [4950, 'storm']];
const PAL_NAMES = ['dawn', 'day', 'over', 'storm'];
function palWeights(camX) {
  const out = { dawn: 0, day: 0, over: 0, storm: 0 };
  if (camX <= PAL_KEYS[0][0]) { out[PAL_KEYS[0][1]] = 1; return out; }
  for (let i = 0; i < PAL_KEYS.length - 1; i++) {
    const [x0, a] = PAL_KEYS[i], [x1, b] = PAL_KEYS[i + 1];
    if (camX >= x0 && camX < x1) {
      const t = a === b ? 0 : smooth((camX - x0) / (x1 - x0));
      out[a] += 1 - t; out[b] += t; return out;
    }
  }
  out[PAL_KEYS[PAL_KEYS.length - 1][1]] = 1;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// world layout constants
// ---------------------------------------------------------------------------------------------------------------
const GT0 = 276;                 // ground tiles cover screen y GT0..H
const BR0 = 1640, BR1 = 2860;    // bridge deck (abutment edges)
const PIL_L = 1612, PIL_R = 2888; // bridge-head pillars (gorge clip edges)
const VIL1 = 4630;               // courtyard starts
const OBEL = 4612;               // entrance obelisk (cliff clip edge)
const GATE_X = 5920;             // centre of the dragon gate (boss arena centre)
const CL_PERIOD = 1500;          // cloud layer wrap period
const P_FAR = 0.1, P_MID = 0.3, P_GORGE = 0.55, P_CLIFF = 0.6, P_FRONT = 1.25;
const WIND = 1;                  // snow drifts to the right

// parallax around the screen centre: lx for a layer element seen at screen centre when camera centre is at wx
const al = (x, st) => Math.floor(x / st) * st;  // world-aligned loop start (chunk-safe sampling)
const lxAt = (wx, p) => 480 + p * (wx - 480);

// ---------------------------------------------------------------------------------------------------------------
// LAYOUT (scale independent, built once)
// ---------------------------------------------------------------------------------------------------------------
const LAY = (() => {
  const R = mulberry(20261006);
  // far peaks (layer coords 0..1520)
  const farBack = [], farFront = [];
  for (let x = -120; x < 1700; x += R.r(120, 190)) farBack.push({ x, sy: R.r(150, 200), hl: R.r(130, 200), hr: R.r(130, 200), seed: R.i(1, 1e9) });
  const fr = [[-60, 168], [170, 146], [380, 178], [560, 104], [770, 160], [960, 132], [1170, 168], [1360, 122], [1560, 160]];
  for (const [x, sy] of fr) farFront.push({ x: x + R.r(-15, 15), sy, hl: R.r(150, 230), hr: R.r(150, 230), seed: R.i(1, 1e9) });
  // mid ridge trees (layer coords 0..2700)
  const midBackTrees = [], midFrontTrees = [], midSlopeTrees = [];
  for (let x = -20; x < 2720; x += R.r(4, 8)) midBackTrees.push({ x, dy: R.r(-1, 7), h: R.r(9, 17), w: R.r(7, 10) });
  for (let x = -20; x < 2720; x += R.r(5, 10)) midFrontTrees.push({ x, dy: R.r(-2, 9), h: R.r(15, 29), w: R.r(10, 15) });
  for (let x = -20; x < 2720; x += R.r(14, 40)) midSlopeTrees.push({ x, dy: R.r(14, 60), h: R.r(10, 20), w: R.r(8, 12) });
  const midHouses = [];
  for (let x = 1120; x < 1420; x += R.r(22, 40)) midHouses.push({ x, dy: R.r(4, 26), w: R.r(16, 26), h: R.r(12, 18), lit: R() < 0.35 });
  // clouds per palette (cloud layer coords, wrap period CL_PERIOD)
  const clouds = { dawn: [], day: [], over: [], storm: [] };
  const cdef = {
    dawn: [['bank', 4, 30, 95], ['streak', 9, 95, 205], ['puff', 3, 60, 150]],
    day: [['puff', 6, 40, 150]],
    over: [['bank', 6, 20, 140], ['puff', 5, 60, 190]],
    storm: [['bank', 7, 10, 150], ['puff', 5, 40, 200]],
  };
  for (const k of PAL_NAMES) {
    for (const [kind, n, ya, yb] of cdef[k]) {
      for (let i = 0; i < n; i++) {
        const big = kind === 'bank' ? R.r(300, 480) : kind === 'puff' ? R.r(130, 240) : R.r(180, 380);
        clouds[k].push({ kind, x: R.r(0, CL_PERIOD), y: R.r(ya, yb), w: big, h: kind === 'streak' ? R.r(12, 22) : big * R.r(0.28, 0.42), seed: R.i(1, 1e9), sp: R.r(3, 7) });
      }
    }
  }
  // dragons circling the hero peak (far layer coords)
  const dragons = [];
  for (let i = 0; i < 7; i++) dragons.push({ rx: R.r(60, 210), ry: R.r(16, 46), cy: R.r(128, 196), sp: R.r(0.14, 0.3) * (R() < 0.3 ? -1 : 1), ph: R.r(0, TAU), s: R.r(0.95, 1.8), fl: R.r(4, 6.5) });
  // snowflakes
  const flakes = [];
  for (let i = 0; i < 300; i++) {
    const layer = i < 140 ? 0 : i < 250 ? 1 : 2;
    flakes.push({ layer, x: R.r(0, 1000), y: R.r(0, 580), sp: R.r(0.7, 1.3) * [22, 42, 80][layer], sw: R.r(4, 14), fr: R.r(0.6, 1.6), ph: R.r(0, TAU), k: R() });
  }
  return { farBack, farFront, midBackTrees, midFrontTrees, midSlopeTrees, midHouses, clouds, dragons, flakes };
})();

// ---------------------------------------------------------------------------------------------------------------
// FAR PEAKS
// ---------------------------------------------------------------------------------------------------------------
function drawPeak(g, pk, P, base, hz0, hz1) {
  const R = mulberry(pk.seed);
  const L = [pk.x - pk.hl, base + 4], T = [pk.x, pk.sy], Rr = [pk.x + pk.hr, base + 4];
  const left = mdp(L, T, R, 4, 0.08), right = mdp(T, Rr, R, 4, 0.08);
  const sil = flat(left.concat(right.slice(1)));
  // spine of the shadow side
  const spine = mdp([pk.x, pk.sy], [pk.x + pk.hr * 0.18, base + 4], R, 4, 0.07);
  const shadowPoly = flat(spine).concat([pk.x + pk.hr + 20, base + 6, pk.x + pk.hr + 20, pk.sy - 10]);
  // snowline zig-zag
  const snowY = pk.sy + (base - pk.sy) * R.r(0.36, 0.5);
  const sn = [pk.x - pk.hl - 10, pk.sy - 20];
  for (let x = pk.x - pk.hl; x <= pk.x + pk.hr; x += 9) {
    const near = 1 - Math.min(1, Math.abs(x - pk.x) / (pk.hl + pk.hr) * 2);
    sn.push(x, snowY + (R() * 2 - 1) * 10 + (R() < 0.3 ? R.r(10, 34) * (0.4 + near) : 0) - (1 - near) * 22);
  }
  sn.push(pk.x + pk.hr + 10, pk.sy - 20);
  g.save();
  poly(g, sil); g.clip();
  g.fillStyle = P.rock; g.fillRect(pk.x - pk.hl - 5, pk.sy - 5, pk.hl + pk.hr + 10, base - pk.sy + 20);
  poly(g, shadowPoly); g.fillStyle = P.rockSh; g.fill();
  g.save(); poly(g, sn); g.clip();
  g.fillStyle = P.snow; g.fillRect(pk.x - pk.hl - 5, pk.sy - 5, pk.hl + pk.hr + 10, base - pk.sy + 20);
  poly(g, shadowPoly); g.fillStyle = P.snowSh; g.fill();
  g.restore();
  // ridge streaks
  g.lineWidth = 1.2; g.strokeStyle = rgba(P.line, 0.55);
  for (let i = 0; i < 5; i++) {
    const t = R.r(0.05, 0.4);
    const sx = lerp(pk.x, pk.x - pk.hl * 0.8, t * (R() < 0.5 ? 1 : 0.4)), sy = lerp(pk.sy, base, t * 0.5);
    const p = mdp([sx, sy], [sx + R.r(-30, 25), sy + R.r(25, 70)], R, 3, 0.12);
    polyline(g, flat(p)); g.stroke();
  }
  // atmospheric haze toward the base
  const gr = g.createLinearGradient(0, pk.sy, 0, base);
  gr.addColorStop(0, rgba(P.haze, hz0)); gr.addColorStop(1, rgba(P.haze, hz1));
  g.fillStyle = gr; g.fillRect(pk.x - pk.hl - 5, pk.sy - 5, pk.hl + pk.hr + 10, base - pk.sy + 20);
  g.restore();
}
function drawFar(g, P, xa, xb) {
  const base = 372;
  for (const pk of LAY.farBack) if (pk.x + pk.hr > xa - 10 && pk.x - pk.hl < xb + 10) drawPeak(g, pk, P, base, 0.42, 0.95);
  for (const pk of LAY.farFront) if (pk.x + pk.hr > xa - 10 && pk.x - pk.hl < xb + 10) drawPeak(g, pk, P, base, 0.06, 0.9);
}

// ---------------------------------------------------------------------------------------------------------------
// MID RIDGES (forest, distant village, the Dragon King's mountain)
// ---------------------------------------------------------------------------------------------------------------
const ridgeBack = (x) => 262 + 16 * Math.sin(x * 0.0061 + 1.3) + 9 * Math.sin(x * 0.017 + 0.4) + 4 * Math.sin(x * 0.047);
const ridgeFront = (x) => 300 + 15 * Math.sin(x * 0.0052 + 3.1) + 8 * Math.sin(x * 0.0143 + 2.2) + 4 * Math.sin(x * 0.041 + 1);
function midTree(g, x, y, h, w, col, snow) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x, y - h);
  g.lineTo(x + w * 0.3, y - h * 0.56); g.lineTo(x + w * 0.16, y - h * 0.56);
  g.lineTo(x + w * 0.46, y - h * 0.18); g.lineTo(x + w * 0.26, y - h * 0.2);
  g.lineTo(x + w * 0.6, y + 3); g.lineTo(x - w * 0.6, y + 3);
  g.lineTo(x - w * 0.26, y - h * 0.2); g.lineTo(x - w * 0.46, y - h * 0.18);
  g.lineTo(x - w * 0.16, y - h * 0.56); g.lineTo(x - w * 0.3, y - h * 0.56);
  g.closePath(); g.fill();
  if (snow) {
    g.fillStyle = snow;
    g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - w * 0.25, y - h * 0.6); g.lineTo(x + w * 0.08, y - h * 0.68); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x - w * 0.12, y - h * 0.52); g.lineTo(x - w * 0.42, y - h * 0.2); g.lineTo(x - w * 0.05, y - h * 0.28); g.closePath(); g.fill();
  }
}
function drawMid(g, P, xa, xb) {
  const y1 = 380;
  const xs = Math.floor(xa) - 4, xe = Math.ceil(xb) + 4;
  // the Dragon King's mountain, far behind the gate (lx ~ 1900..2600)
  {
    const R = mulberry(777);
    const cx = lxAt(6050, P_MID);
    const top = [];
    const pts = [[cx - 420, y1], [cx - 300, 230], [cx - 210, 170], [cx - 150, 120], [cx - 95, 70], [cx - 70, 92], [cx - 40, 40], [cx - 18, 70], [cx, 18], [cx + 22, 66], [cx + 46, 34], [cx + 70, 86], [cx + 110, 60], [cx + 160, 130], [cx + 250, 175], [cx + 360, 240], [cx + 470, y1]];
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = mdp(pts[i], pts[i + 1], R, 3, 0.06);
      for (let j = i ? 1 : 0; j < seg.length; j++) top.push(seg[j]);
    }
    const sil = flat(top);
    g.save(); poly(g, sil); g.clip();
    const gr = g.createLinearGradient(0, 20, 0, y1);
    gr.addColorStop(0, mix(P.front, P.back, 0.25)); gr.addColorStop(1, mix(P.back, P.haze, 0.5));
    g.fillStyle = gr; g.fillRect(cx - 430, 0, 920, y1);
    // shadow side + snow streaks
    g.fillStyle = rgba(darken(P.front, 0.3), 0.55);
    poly(g, [cx, 18, cx + 30, 140, cx + 10, 260, cx + 60, y1, cx + 500, y1, cx + 500, 0]); g.fill();
    g.strokeStyle = rgba(P.snow, 0.45); g.lineWidth = 1.4;
    for (let i = 0; i < 26; i++) {
      const x = cx + R.r(-260, 260), y = R.r(60, 250);
      const tt = sil.length; // eslint-disable-line no-unused-vars
      polyline(g, [x, y, x + R.r(-14, 8), y + R.r(10, 30), x + R.r(-20, 10), y + R.r(30, 50)]); g.stroke();
    }
    // a sickly green glow in the high windows of the fortress
    for (const [dx, dy] of [[-38, 82], [-4, 52], [24, 86], [-60, 110], [48, 104]]) {
      g.fillStyle = rgba(P.win, 0.65); g.fillRect(cx + dx, dy, 3, 5);
    }
    g.restore();
  }
  // back ridge
  g.beginPath(); g.moveTo(xs, y1);
  for (let x = xs; x <= xe; x += 6) g.lineTo(x, ridgeBack(x));
  g.lineTo(xe, y1); g.closePath();
  let gr = g.createLinearGradient(0, 240, 0, y1);
  gr.addColorStop(0, P.back); gr.addColorStop(1, mix(P.back, P.haze, 0.55));
  g.fillStyle = gr; g.fill();
  const backTree = mix(P.back, P.tree, 0.45), backSnow = mix(P.snow, P.back, 0.35);
  for (const t of LAY.midBackTrees) if (t.x > xa - 20 && t.x < xb + 20) midTree(g, t.x, ridgeBack(t.x) + t.dy, t.h, t.w, backTree, backSnow);
  // snow fields on the back ridge
  g.fillStyle = rgba(P.snow, 0.28);
  for (let x = Math.floor(xs / 90) * 90; x < xe; x += 90) {
    const h = hash1(x * 3 + 1);
    if (h < 0.5) continue;
    const y = ridgeBack(x) + 16 + h * 20;
    g.beginPath(); g.ellipse(x, y, 30 + h * 30, 5 + h * 4, -0.08, 0, TAU); g.fill();
  }
  // distant village on the front ridge (seen from the bridge)
  for (const hs of LAY.midHouses) {
    if (hs.x < xa - 30 || hs.x > xb + 30) continue;
    const y = ridgeFront(hs.x) + hs.dy - 4;
    g.fillStyle = P.house; g.fillRect(hs.x - hs.w / 2, y - hs.h, hs.w, hs.h + 8);
    g.fillStyle = P.roof; poly(g, [hs.x - hs.w / 2 - 3, y - hs.h + 1, hs.x, y - hs.h - hs.w * 0.55, hs.x + hs.w / 2 + 3, y - hs.h + 1]); g.fill();
    g.fillStyle = P.snow; poly(g, [hs.x - hs.w / 2 - 3, y - hs.h + 1, hs.x, y - hs.h - hs.w * 0.55, hs.x + hs.w / 2 + 3, y - hs.h + 1, hs.x + hs.w * 0.3, y - hs.h - 1, hs.x - hs.w * 0.3, y - hs.h - 2]); g.fill();
    if (hs.lit) { g.fillStyle = rgba(P.win, 0.8); g.fillRect(hs.x - 2, y - hs.h * 0.6, 4, 4); }
  }
  // front ridge
  g.beginPath(); g.moveTo(xs, y1);
  for (let x = xs; x <= xe; x += 5) g.lineTo(x, ridgeFront(x));
  g.lineTo(xe, y1); g.closePath();
  gr = g.createLinearGradient(0, 280, 0, y1);
  gr.addColorStop(0, P.front); gr.addColorStop(1, mix(P.front, P.haze, 0.45));
  g.fillStyle = gr; g.fill();
  for (const t of LAY.midSlopeTrees) if (t.x > xa - 20 && t.x < xb + 20) midTree(g, t.x, ridgeFront(t.x) + t.dy, t.h, t.w, mix(P.tree, P.haze, 0.25), mix(P.snow, P.front, 0.2));
  for (const t of LAY.midFrontTrees) if (t.x > xa - 20 && t.x < xb + 20) midTree(g, t.x, ridgeFront(t.x) + t.dy, t.h, t.w, P.tree, P.snow);
  // valley mist
  gr = g.createLinearGradient(0, 318, 0, y1);
  gr.addColorStop(0, rgba(P.haze, 0)); gr.addColorStop(1, rgba(P.haze, 0.75));
  g.fillStyle = gr; g.fillRect(xs, 318, xe - xs, y1 - 318);
}

// ---------------------------------------------------------------------------------------------------------------
// CLOUDS + SUN
// ---------------------------------------------------------------------------------------------------------------
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
// NEAR ELEMENTS (inked)
// ---------------------------------------------------------------------------------------------------------------
// pine heavy with snow; origin = base centre
function drawPine(g, h, w, seed, P, lw = 2.6) {
  const R = mulberry(seed);
  const trunkH = h * 0.12;
  ink(g, (g) => poly(g, [-w * 0.055, 8, -w * 0.045, -trunkH - 14, w * 0.045, -trunkH - 14, w * 0.06, 8]), P.bark, lw, (g) => {
    g.fillStyle = P.barkSh; g.fillRect(w * 0.005, -trunkH - 20, w * 0.07, trunkH + 30);
    g.strokeStyle = P.barkSh; g.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) { const y = -R.r(0, trunkH); polyline(g, [-w * 0.04, y, -w * 0.01, y - 3]); g.stroke(); }
  });
  const n = h > 280 ? 7 : h > 220 ? 6 : 5;
  const top = -h, bottom = -trunkH;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const yb = lerp(bottom, top + h * 0.2, f) + R.r(-3, 3);
    const th = lerp(h * 0.3, h * 0.24, f);
    const yt = i === n - 1 ? top : yb - th;
    const tH = yb - yt;
    const wi = w * 0.5 * lerp(1, 0.3, Math.pow(f, 0.9)) * R.r(0.9, 1.06);
    const teeth = wi > 45 ? 5 : wi > 25 ? 4 : 3;
    const pts = [R.r(-2, 2), yt];
    pts.push(wi * 0.22, yt + tH * 0.3, wi * 0.48, yt + tH * 0.6, wi * 0.8, yt + tH * 0.86, wi * 1.02, yb + R.r(3, 8));
    for (let k = 1; k <= teeth; k++) {
      const x0 = wi - (2 * wi * (k - 1)) / teeth, x1 = wi - (2 * wi * k) / teeth;
      pts.push((x0 + x1) / 2 + R.r(-3, 3), yb - tH * R.r(0.06, 0.14));
      pts.push(k === teeth ? -wi * 1.02 : x1 + R.r(-2, 2), yb + (k === teeth ? R.r(3, 8) : R.r(-1, 5)));
    }
    pts.push(-wi * 0.8, yt + tH * 0.86, -wi * 0.48, yt + tH * 0.6, -wi * 0.22, yt + tH * 0.3);
    ink(g, (g) => poly(g, pts), P.pine, lw, (g) => {
      // shadow side + underside
      g.fillStyle = P.pineSh;
      poly(g, [0, yt - 4, wi * 1.3, yb + 12, wi * 0.05, yb + 12, wi * 0.12, yt + tH * 0.45]); g.fill();
      g.fillStyle = rgba(P.pineSh, 0.85);
      g.beginPath(); g.moveTo(-wi * 1.2, yb + 12); g.lineTo(-wi * 1.2, yb - tH * 0.12);
      for (let x = -wi; x <= wi; x += wi / 4) g.lineTo(x, yb - tH * (0.16 + 0.06 * Math.sin(x)));
      g.lineTo(wi * 1.2, yb + 12); g.closePath(); g.fill();
      // needle strokes on the lit side
      g.strokeStyle = P.pineHi; g.lineWidth = 1.3;
      for (let k = 0; k < 4 + wi / 12; k++) {
        const sx = -R.r(wi * 0.1, wi * 0.85), sy = lerp(yt + tH * 0.45, yb - 2, R());
        polyline(g, [sx, sy, sx - R.r(3, 7), sy + R.r(4, 8)]); g.stroke();
      }
    });
    // snow cap on the tier
    const sn = [0, yt - 2.5,
      wi * 0.24, yt + tH * 0.3 - 2, wi * 0.5, yt + tH * 0.6 - 2, wi * 0.74, yt + tH * 0.82,
      wi * 0.62, yt + tH * R.r(0.66, 0.74), wi * 0.42, yt + tH * R.r(0.58, 0.68), wi * 0.2, yt + tH * R.r(0.46, 0.58),
      -wi * 0.02, yt + tH * R.r(0.5, 0.62), -wi * 0.24, yt + tH * R.r(0.58, 0.7), -wi * 0.46, yt + tH * R.r(0.62, 0.72),
      -wi * 0.66, yt + tH * R.r(0.74, 0.84), -wi * 0.82, yt + tH * 0.9,
      -wi * 0.52, yt + tH * 0.6 - 2, -wi * 0.26, yt + tH * 0.3 - 2];
    ink(g, (g) => blob(g, sn), P.snowSh, 1.6, (g) => {
      g.save(); g.translate(-1, -4.5); blob(g, sn); g.fillStyle = P.snow; g.fill(); g.restore();
      g.fillStyle = P.snowHi; g.beginPath(); g.ellipse(-wi * 0.3, yt + tH * 0.4, wi * 0.18, 2.5, 0.5, 0, TAU); g.fill();
    });
  }
}

// angular boulder; origin = base centre
function drawBoulder(g, w, h, seed, P, lw = 2.6, snow = true) {
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
    // lit facet (upper left)
    const lit = [cx, cy];
    for (let i = 0; i < pts.length; i += 2) if (pts[i] < w * 0.1 && pts[i + 1] < -h * 0.25) lit.push(pts[i], pts[i + 1]);
    lit.push(-w * 0.2, -h * 0.9);
    if (lit.length > 6) { poly(g, lit); g.fillStyle = P.rockHi; g.fill(); }
    // shadow facet (right) + base
    poly(g, [cx + w * 0.05, cy, w * 0.2, -h * 1.2, w, -h * 1.2, w, 10, w * 0.12, 10]); g.fillStyle = P.rockSh; g.fill();
    poly(g, [-w, 10, -w, -h * 0.14, -w * 0.2, -h * 0.2, w, -h * 0.1, w, 10]); g.fillStyle = rgba(P.rockSh, 0.7); g.fill();
    // facet edge
    strokeLine(g, [cx, cy, cx + w * 0.05, cy, w * 0.2, -h * 1.0], 1.4, rgba(LINE, 0.55));
    // cracks
    for (let k = 0; k < 2; k++) {
      const sx = R.r(-w * 0.35, w * 0.3), sy = R.r(-h * 0.7, -h * 0.25);
      strokeLine(g, [sx, sy, sx + R.r(-8, 8), sy + R.r(6, 14), sx + R.r(-10, 10), sy + R.r(14, 22)], 1.3, P.crack);
    }
  });
  if (snow && top.length >= 4) {
    // snow cap following the top vertices (right to left)
    const s = [];
    const tp = [];
    for (let i = 0; i < top.length; i += 2) tp.push([top[i], top[i + 1]]);
    tp.sort((a, b) => b[0] - a[0]);
    const xr = tp[0][0] + 4, xl = tp[tp.length - 1][0] - 4;
    s.push(xr + 2, interpY(tp, xr) + 7);
    for (const [x, y] of tp) s.push(x, y - 3);
    s.push(xl - 2, interpY(tp, xl) + 8);
    const depth = Math.min(16, h * 0.22);
    for (let x = xl + 6; x < xr - 4; x += R.r(8, 14)) s.push(x, interpY(tp, x) + depth * R.r(0.45, 1.15));
    // re-order bottom points right->left is required for a simple polygon: bottom were pushed left->right, so reverse
    const head = s.slice(0, (tp.length + 2) * 2);
    const tail = s.slice((tp.length + 2) * 2);
    const tailR = [];
    for (let i = tail.length - 2; i >= 0; i -= 2) tailR.push(tail[i], tail[i + 1]);
    const shape = head.concat(tailR);
    ink(g, (g) => blob(g, shape), P.snowSh, 1.7, (g) => {
      g.save(); g.translate(-1, -4); blob(g, shape); g.fillStyle = P.snow; g.fill(); g.restore();
    });
  }
}
function interpY(tp, x) { // tp sorted by x desc
  for (let i = 0; i < tp.length - 1; i++) {
    const [x0, y0] = tp[i], [x1, y1] = tp[i + 1];
    if (x <= x0 && x >= x1) return lerp(y0, y1, (x0 - x) / (x0 - x1 || 1));
  }
  return x > tp[0][0] ? tp[0][1] : tp[tp.length - 1][1];
}

// generic snow cap along a top edge from xl to xr (top y via fn), drips below; inked
function snowCap(g, xl, xr, topFn, depth, seed, P, lw = 1.7, over = 3) {
  const R = mulberry(seed);
  const s = [xl - over, topFn(xl) + depth * 0.5];
  for (let x = xl; x <= xr; x += 6) s.push(x, topFn(x) - R.r(2, 5));
  s.push(xr + over, topFn(xr) + depth * 0.5);
  for (let x = xr - 4; x > xl + 3; x -= R.r(7, 13)) s.push(x, topFn(x) + depth * R.r(0.5, 1.2));
  ink(g, (g) => blob(g, s), P.snowSh, lw, (g) => {
    g.save(); g.translate(-1, -depth * 0.32); blob(g, s); g.fillStyle = P.snow; g.fill(); g.restore();
  });
}

// --- dragon emblems ---
function kingEmblem(g, cx, cy, s, col, eye) {
  g.save(); g.translate(cx, cy); g.scale(s / 44, s / 44);
  g.fillStyle = col;
  poly(g, [-9, -15, -12, -27, -4, -19, 1, -31, 6, -19, 14, -27, 11, -15]); g.fill(); // crown
  g.beginPath();
  g.moveTo(16, -12); g.quadraticCurveTo(4, -17, -7, -12);
  g.lineTo(-20, -7); g.lineTo(-23, -2); g.lineTo(-11, -1); g.lineTo(-19, 6); g.lineTo(-6, 6);
  g.quadraticCurveTo(3, 9, 7, 18); g.lineTo(17, 21); g.quadraticCurveTo(14, 6, 19, -4); g.lineTo(28, -12); g.lineTo(20, -9);
  g.closePath(); g.fill();
  // spines down the neck
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
  g.beginPath(); // coiled dragon: S body with head at top right
  g.moveTo(8, -12); g.quadraticCurveTo(14, -6, 6, -2); g.quadraticCurveTo(-8, 3, -4, 10); g.quadraticCurveTo(0, 14, 8, 11);
  g.lineTo(6, 14); g.quadraticCurveTo(-6, 17, -9, 9); g.quadraticCurveTo(-11, 0, 2, -5); g.quadraticCurveTo(7, -7, 4, -10); g.closePath(); g.fill();
  poly(g, [4, -10, 3, -16, 7, -13, 10, -17, 11, -12, 15, -11, 9, -8]); g.fill();
  poly(g, [-2, -2, -12, -12, -6, -3]); g.fill(); // wing
  g.restore();
}

// hanging cloth (banner) path with a ragged bottom
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
  // rod
  ink(g, (g) => { g.beginPath(); g.rect(x - 6, y - 4, w + 12, 5); }, '#3a3036', 1.4);
}
function drawClanBanner(g, x, y, w, h, seed, torn = true, lw = 2.2) {
  ink(g, (g) => bannerPath(g, x, y, w, h, seed, torn ? 5 : 2), CLAN.red, lw, (g) => {
    g.fillStyle = CLAN.redSh; g.fillRect(x + w * 0.7, y, w * 0.4, h);
    g.fillStyle = CLAN.redHi; g.fillRect(x, y, w * 0.12, h);
    g.fillStyle = CLAN.gold; g.fillRect(x, y + 4, w, 4); g.fillRect(x, y + h * 0.78, w, 3);
    clanEmblem(g, x + w / 2, y + h * 0.42, Math.min(w * 0.7, h * 0.45), CLAN.gold);
    if (torn) { // rip
      g.fillStyle = '#00000000'; g.globalCompositeOperation = 'destination-out';
      poly(g, [x + w * 0.55, y + h * 1.1, x + w * 0.62, y + h * 0.5, x + w * 0.7, y + h * 0.62, x + w * 0.78, y + h * 0.45, x + w * 0.9, y + h * 1.1]); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// FLAMES, FLAGS (live)
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
  // embers
  ctx.fillStyle = pal.mid;
  for (let i = 0; i < 3; i++) {
    const ph = ((t * 0.9 + i / 3 + seed * 0.13) % 1);
    ctx.globalAlpha = 1 - ph;
    ctx.fillRect(x + Math.sin(ph * 9 + i + seed) * size * 0.4, y - size * 0.6 - ph * size * 1.6, 2, 2);
  }
  ctx.globalAlpha = 1;
}
// draw a pre-rendered flag sprite as vertical strips with a travelling wave (pole on the left)
function drawFlag(ctx, spr, x, y, t, seed, amp = 5, strips = 10) {
  const sw = spr.c.width / strips, dw = spr.w / strips;
  for (let i = 0; i < strips; i++) {
    const f = i / (strips - 1);
    const off = Math.sin(t * 5.2 - i * 0.7 + seed) * amp * f;
    const sh = 1 + 0.04 * Math.sin(t * 5.2 - i * 0.7 + seed + 1.3) * f;
    ctx.drawImage(spr.c, i * sw, 0, sw + 0.5, spr.c.height, x + i * dw, y + off, dw + 0.35, spr.h * sh);
  }
}
// hanging banner swaying (top fixed): horizontal strips
function drawHang(ctx, spr, x, y, t, seed, amp = 3, strips = 8) {
  const sh = spr.c.height / strips, dh = spr.h / strips;
  for (let i = 0; i < strips; i++) {
    const f = i / (strips - 1);
    const off = Math.sin(t * 2.1 - i * 0.45 + seed) * amp * f * f;
    ctx.drawImage(spr.c, 0, i * sh, spr.c.width, sh + 0.5, x + off, y + i * dh, spr.w, dh + 0.35);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let S = 0;                // device px per logical px
  let C = null;             // caches
  let warm = 0;             // 0 = cursed (venom green fire, storm), 1 = curse lifted (gold fire, calm warm sky)
  let fireCache = null, fireCacheW = -1, fireCacheC = null;
  // current fire state for drawFlame; rebuilt only when warm (or the caches) change
  function fire() {
    if (fireCacheW === warm && fireCacheC === C) return fireCache;
    fireCacheW = warm; fireCacheC = C;
    fireCache = warm <= 0 ? { pal: FIRE, glows: [[C.glow, 1]] } : {
      pal: { outer: mix(FIRE.outer, FIRE_WARM.outer, warm), mid: mix(FIRE.mid, FIRE_WARM.mid, warm), core: mix(FIRE.core, FIRE_WARM.core, warm) },
      glows: warm >= 1 ? [[C.glowWarm, 1]] : [[C.glow, 1 - warm], [C.glowWarm, warm]],
    };
    return fireCache;
  }
  // Ending: w 0..1 blends the curse away (fires -> gold, lightning stops, gate sky warms). Free when w = 0.
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  const snap = (v) => Math.round(v * S) / S;

  let released = false;   // (released: kept so -- a resize only notes the scale -- until it's drawn on screen again)
  function setScale(s) {
    s = clamp(+s || 1, 0.5, 4);
    if (released) { S = s; pickupItems(); return; }   // (the pickups' little cache: rebuilt now, never mid-level -- iOS's readback test makes each canvas slow)
    if (C && Math.abs(s - S) < 0.001) return;
    const prev = C;
    S = s;
    const cs = Math.min(STAGE_CS.near, Math.round(s * 4) / 4);       // (STAGE_CS: lower on iOS -- src/canvasmem.js)
    const csFar = Math.min(STAGE_CS.far, Math.round(s * 4) / 4);
    if (prev && prev.cs === cs && prev.csFar === csFar) { freeCanvases(prev.items); prev.items = buildItems(s); return; }
    if (prev) freeCanvases(prev);            // (the old scale's caches go now: iOS counts them until they shrink)
    C = build(cs, csFar);
    C.items = buildItems(s);
    pickupItems();                           // (built with the stage, at the loading screen: a level's first pickup never waits for it)
  }

  // ------------------------------------------------------------------ build all caches
  function build(cs, csFar) {
    const t0 = performance.now();
    const c = { cs, csFar };
    // --- far peaks / mid ridges: one strip per palette over the layer range where that palette is ever visible
    const palRange = { dawn: [0, 1750], day: [1050, 3250], over: [2700, 4950], storm: [4250, STAGE_LEN - W] };
    c.far = {}; c.mid = {}; c.midTop = {}; c.cloud = {};
    for (const k of PAL_NAMES) {
      const [a, b] = palRange[k];
      c.far[k] = buildStrip(Math.floor(a * P_FAR) - 4, Math.ceil(b * P_FAR + W) + 4, 96, 372, csFar, P_FAR, (g, xa, xb) => drawFar(g, FARP[k], xa, xb));
      const ma = Math.floor(a * P_MID) - 4, mb = Math.ceil(b * P_MID + W) + 4;
      c.mid[k] = buildStrip(ma, mb, 200, 380, csFar, P_MID, (g, xa, xb) => drawMid(g, MIDP[k], xa, xb));
      const kx = lxAt(6050, P_MID);
      c.midTop[k] = mb > kx - 440 && ma < kx + 490 ? buildStrip(Math.max(ma, kx - 440), Math.min(mb, kx + 490), 0, 200, csFar, P_MID, (g, xa, xb) => drawMid(g, MIDP[k], xa, xb)) : null;
      c.cloud[k] = LAY.clouds[k].map((cl) => ({ cl, spr: cloudSprite(cl, CLOUDP[k], Math.min(0.75, csFar)) }));
    }
    c.sun = radialSprite(280, 0.6, [[0, 'rgba(255,250,228,1)'], [0.085, 'rgba(255,242,200,1)'], [0.1, 'rgba(255,226,168,0.8)'], [0.28, 'rgba(255,212,156,0.34)'], [0.6, 'rgba(255,200,160,0.1)'], [1, 'rgba(255,196,160,0)']]);
    c.glow = radialSprite(64, 1, [[0, 'rgba(140,255,120,0.55)'], [0.35, 'rgba(110,235,100,0.22)'], [1, 'rgba(80,200,90,0)']]);
    c.glowWarm = radialSprite(64, 1, [[0, 'rgba(255,200,110,0.6)'], [0.35, 'rgba(255,150,60,0.25)'], [1, 'rgba(255,120,40,0)']]);
    c.mist = radialSprite(64, 0.5, [[0, 'rgba(240,248,252,0.75)'], [0.5, 'rgba(232,242,250,0.35)'], [1, 'rgba(225,238,248,0)']]);
    c.smoke = radialSprite(32, 0.75, [[0, 'rgba(205,208,214,0.55)'], [0.6, 'rgba(190,195,204,0.25)'], [1, 'rgba(180,186,196,0)']]);
    c.vignette = makeSprite(W, H, 0, 0, 0.25, (g) => {
      const gr = g.createRadialGradient(W / 2, H * 0.48, H * 0.35, W / 2, H * 0.5, W * 0.62);
      gr.addColorStop(0, 'rgba(8,14,12,0)'); gr.addColorStop(1, 'rgba(8,14,12,0.85)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    });
    // the boss arena's vignette, reshaped (as the L4 throne room's): centred low (61 % down) and stretched sideways, so the
    // top corners stay as dark but the screen's sides at fighter height darken about half as much -- the painted heroes'
    // ink outlines got lost in the near-black edges there (painted review, Dodongo).  ?edgefix=none: the old one (A/B)
    c.vignetteEdge = makeSprite(W, H, 0, 0, 0.25, (g) => {
      g.translate(W / 2, H * 0.61); g.scale(1.45, 1);
      const gr = g.createRadialGradient(0, 0, 230, 0, 0, 520);
      gr.addColorStop(0, 'rgba(8,14,12,0)'); gr.addColorStop(1, 'rgba(8,14,12,0.9)');
      g.fillStyle = gr; g.fillRect(-W, -H, W * 2, H * 2);
    });
    // ... and a soft cool light at the screen's sides at fighter height (the snow's bounce off the
    // lane / the storm's mist) -- the near-black edges come up a few L* more without a flat band
    c.edgeLight = makeSprite(W, H, 0, 0, 0.25, (g) => {
      const v = g.createLinearGradient(0, 210, 0, 368);
      v.addColorStop(0, 'rgba(196,222,210,0)'); v.addColorStop(0.45, 'rgba(196,222,210,0.08)'); v.addColorStop(0.85, 'rgba(196,222,210,0.08)'); v.addColorStop(1, 'rgba(196,222,210,0)');
      g.fillStyle = v; g.fillRect(0, 210, W, 158);
      const hz = g.createLinearGradient(0, 0, W, 0);         // (only the sides: cut away towards the middle)
      hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(0.2, 'rgba(0,0,0,0.35)'); hz.addColorStop(0.32, 'rgba(0,0,0,1)');
      hz.addColorStop(0.68, 'rgba(0,0,0,1)'); hz.addColorStop(0.8, 'rgba(0,0,0,0.35)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = hz; g.fillRect(0, 0, W, H);
    });
    c.flakes = [1.1, 1.7, 2.8].map((r) => radialSprite(r * 2, Math.max(1, cs), [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]));
    // --- gorge (bridge) and cliffs (gate): clipped deep layers
    c.gorge = buildStrip(Math.floor(PIL_L * P_GORGE) - 10, Math.ceil(PIL_R * P_GORGE + W * (1 - P_GORGE)) + 10, 150, 372, cs, P_GORGE, drawGorge);
    c.cliff = buildStrip(Math.floor(OBEL * P_CLIFF) - 10, Math.ceil((STAGE_LEN - W) * P_CLIFF + W) + 10, 0, 372, cs, P_CLIFF, drawCliff);
    c.waterTex = makeSprite(24, 96, 0, 0, cs, (g) => {
      const R = mulberry(9);
      for (let i = 0; i < 26; i++) {
        const x = R.r(0, 24), y = R.r(0, 96), l = R.r(10, 34);
        g.strokeStyle = R() < 0.5 ? 'rgba(255,255,255,0.85)' : 'rgba(170,205,235,0.8)';
        g.lineWidth = R.r(1, 2.4);
        for (const dy of [-96, 0, 96]) { polyline(g, [x, y + dy, x, y + dy + l]); g.stroke(); }
      }
    });
    // --- near sprites + ground tiles
    c.near = buildNear(cs);
    c.ground = buildStrip(0, STAGE_LEN, GT0, H, cs, 1, drawGround);
    c.front = buildFront(cs);
    c.buildMs = performance.now() - t0;
    return c;
  }

  // ------------------------------------------------------------------ gorge layer (p 0.55)
  // faceted cliff face between topFn and the bottom: lit left planes, shaded right planes, crevices, snowy ledges
  function cliffFace(g, xs, xe, topFn, P, seed, step, yBot = 384) {
    const edge = (i) => i * step + (hash2(i, seed) - 0.5) * step * 0.5;
    for (let i = Math.floor(xs / step) - 2; ; i++) {
      const xa = edge(i), xb = edge(i + 1);
      if (xa > xe + 4) break;
      if (xb < xs - 4) continue;
      const h = hash2(i * 3, seed + 1), w = xb - xa;
      const ya = topFn(xa) + 4 + h * 18, yb = topFn(xb) + 4 + hash2(i * 3 + 3, seed + 1) * 18;
      const mx = xa + w * (0.35 + h * 0.2), my = Math.min(ya, yb) - 6 - h * 10;
      g.fillStyle = P.rockSh; poly(g, [mx, my, xb, yb, xb + 2, yBot, mx + w * 0.1, yBot]); g.fill();
      g.fillStyle = rgba(P.rockHi, 0.75); poly(g, [xa, ya, mx, my, mx - w * 0.08, my + 30, xa + w * 0.1, yBot, xa, yBot]); g.fill();
      g.strokeStyle = P.crev; g.lineWidth = 1.6;
      polyline(g, [xa, ya, xa + 3, ya + 40, xa - 2, ya + 90, xa + 2, yBot]); g.stroke();
      g.globalAlpha = P.ledgeA ?? 1;
      for (let k = 0; k < (P.ledges ?? 3); k++) {
        const ly = lerp(Math.max(ya, yb) + 20, yBot - 54, hash2(i * 7 + k, seed + 2));
        const lx = xa + w * hash2(i * 5 + k, seed + 3) * 0.5, lw = w * (0.3 + 0.4 * hash2(i + k, seed + 4));
        g.fillStyle = rgba(P.crev, 0.8); g.fillRect(lx, ly + 2, lw, 2.5);
        g.fillStyle = P.snow; g.beginPath(); g.ellipse(lx + lw / 2, ly, lw / 2, 2.6, 0, 0, TAU); g.fill();
        if (P.tree && hash2(i * 9 + k, seed) > 0.6) midTree(g, lx + lw * 0.3, ly, 10 + h * 8, 7 + h * 3, P.tree, P.snow);
      }
      g.globalAlpha = 1;
    }
  }
  function drawGorge(g, xa, xb) {
    const P = { rock: '#7889a2', rockSh: '#56657f', rockHi: '#a2b2c6', crev: '#3f4a62', snow: '#eef4fa', tree: '#3f5a6a', haze: '#d6e6f0', wet: '#4a5872' };
    const xs = Math.floor(xa) - 2, xe = Math.ceil(xb) + 2;
    g.beginPath(); g.moveTo(al(xs, 4) - 4, 380);
    for (let x = al(xs, 4) - 4; x <= xe + 4; x += 4) g.lineTo(x, gorgeTop(x));
    g.lineTo(xe + 4, 380); g.closePath();
    g.save(); g.clip();
    g.fillStyle = P.rock; g.fillRect(xs, 150, xe - xs, 240);
    cliffFace(g, xs, xe, gorgeTop, P, 77, 64);
    for (const wf of GORGE_FALLS) {
      g.fillStyle = P.wet; poly(g, [wf.x - wf.w * 0.9, gorgeTop(wf.x) - 2, wf.x + wf.w * 0.9, gorgeTop(wf.x) - 2, wf.x + wf.w * 1.4, 384, wf.x - wf.w * 1.4, 384]); g.fill();
    }
    const gr = g.createLinearGradient(0, 205, 0, 350);
    gr.addColorStop(0, rgba(P.haze, 0.08)); gr.addColorStop(0.45, rgba(P.haze, 0.32)); gr.addColorStop(1, rgba(P.haze, 0.95));
    g.fillStyle = gr; g.fillRect(xs, 150, xe - xs, 240);
    g.restore();
    g.fillStyle = P.snow;
    g.beginPath();
    for (let x = al(xs, 4) - 4; x <= xe + 4; x += 4) g.lineTo(x, gorgeTop(x) - 2);
    for (let x = al(xe, 7) + 7; x >= xs - 7; x -= 7) g.lineTo(x, gorgeTop(x) + 3 + 4 * hash1(x | 0));
    g.closePath(); g.fill();
    for (let x = al(xs, 7) - 14; x < xe + 14; x += 7) {
      if (hash1(x * 13) < 0.25) continue;
      if (GORGE_FALLS.some((wf) => Math.abs(x - wf.x) < wf.w * 1.6)) continue;
      const h = 12 + hash1(x * 17) * 20;
      midTree(g, x + hash1(x) * 4, gorgeTop(x) + 2, h, h * 0.55, P.tree, P.snow);
    }
  }

  // ------------------------------------------------------------------ cliff layer (p 0.6)
  function cliffTop(x) {
    const x0 = OBEL * P_CLIFF;
    return lerp(226, 84, sstep(x0, x0 + 700, x)) + 16 * Math.sin(x * 0.031) + 10 * Math.sin(x * 0.083 + 1) + (hash1((x / 11) | 0) - 0.5) * 8 - 22 * Math.max(0, Math.sin(x * 0.012 + 2)) ** 6;
  }
  // first cliff-layer x beyond which the crest stays above the far/mid strips (they are fully hidden there)
  const CLIFF_FULL = (() => {
    let full = Infinity;
    for (let x = Math.ceil((STAGE_LEN - W) * P_CLIFF + W) + 10; x > OBEL * P_CLIFF; x -= 2) { if (cliffTop(x) < 92) full = x; else break; }
    return full + 4;
  })();
  function drawCliff(g, xa, xb) {
    const P = { rock: '#283031', rockSh: '#1a2021', rockHi: '#3c4a47', crev: '#0e1213', snow: '#5f6d69', rim: '#5c8a6a', haze: '#2c3a34', ledgeA: 0.55, ledges: 2 };
    const x0 = OBEL * P_CLIFF, top = cliffTop;
    const xs = Math.floor(xa) - 2, xe = Math.ceil(xb) + 2;
    g.beginPath(); g.moveTo(al(xs, 4) - 4, 380);
    for (let x = al(xs, 4) - 4; x <= xe + 4; x += 4) g.lineTo(x, top(x));
    g.lineTo(xe + 4, 380); g.closePath();
    g.save(); g.clip();
    g.fillStyle = P.rock; g.fillRect(xs, -70, xe - xs, 460);
    cliffFace(g, xs, xe, top, P, 91, 96);
    g.lineWidth = 4; g.strokeStyle = rgba(P.rim, 0.45);
    g.beginPath(); for (let x = al(xs, 4) - 4; x <= xe + 4; x += 4) g.lineTo(x, top(x) + 3); g.stroke();
    const gr = g.createLinearGradient(0, 180, 0, 372);
    gr.addColorStop(0, rgba(P.haze, 0)); gr.addColorStop(1, rgba(P.haze, 0.85));
    g.fillStyle = gr; g.fillRect(xs, 180, xe - xs, 200);
    g.restore();
    g.fillStyle = rgba(P.snow, 0.9);
    g.beginPath();
    for (let x = al(xs, 4) - 4; x <= xe + 4; x += 4) g.lineTo(x, top(x) - 1);
    for (let x = al(xe, 6) + 6; x >= xs - 6; x -= 6) g.lineTo(x, top(x) + 2 + 4 * hash1(x | 0));
    g.closePath(); g.fill();
    g.strokeStyle = '#121616'; g.lineWidth = 2;
    for (const tx of [x0 + 60, x0 + 150, x0 + 270, x0 + 345]) {
      if (tx < xa - 30 || tx > xb + 30) continue;
      const y = top(tx) + 2;
      polyline(g, [tx, y, tx + 2, y - 26, tx - 3, y - 40]); g.stroke();
      polyline(g, [tx + 1, y - 15, tx + 10, y - 24, tx + 13, y - 23]); g.stroke();
      polyline(g, [tx + 2, y - 24, tx - 8, y - 31]); g.stroke();
    }
  }

  // ------------------------------------------------------------------ near-layer sprites & placement
  function buildNear(cs) {
    const back = [], front = [], liveBack = [], liveFront = [];
    const T = NP.trail, B = NP.bridge, V = NP.village, G = NP.gate;
    const place = (arr, spr, x, y, extra) => arr.push(Object.assign({ spr, x, y }, extra || {}));

    // ---- pines (trail palette + bridge/village palettes)
    const pineSpr = (h, w, seed, P) => makeSprite(w + 24, h + 30, w / 2 + 12, h + 16, cs, (g) => drawPine(g, h, w, seed, P));
    const pT = [pineSpr(330, 168, 11, T), pineSpr(285, 150, 12, T), pineSpr(245, 132, 13, T), pineSpr(205, 112, 14, T)];
    const pV = [pineSpr(300, 156, 21, V), pineSpr(240, 130, 22, V)];
    const rockSpr = (w, h, seed, P, extra) => makeSprite(w + 40, h + 40, w / 2 + 20, h + 26, cs, (g) => { if (extra) extra(g); drawBoulder(g, w, h, seed, P); });
    // outcrop: several boulders as one sprite
    const outcrop = (list, P, seed, wTot, hTot) => makeSprite(wTot + 60, hTot + 50, wTot / 2 + 30, hTot + 30, cs, (g) => {
      for (const [x, y, w, h, sd] of list) { g.save(); g.translate(x, y); drawBoulder(g, w, h, seed + sd, P); g.restore(); }
    });

    // ===== TRAIL =====
    lineStyle('#3b3046', 0.62);
    const crag = outcrop([[-40, 0, 150, 120, 1], [40, 4, 120, 90, 2], [-10, -96, 96, 80, 3], [70, -70, 70, 60, 4]], T, 300, 260, 190);
    place(back, crag, -20, 360);
    place(back, pT[0], 120, 352); place(back, pT[2], 205, 356);
    place(back, outcrop([[0, 0, 110, 70, 1], [60, 6, 70, 46, 2]], T, 340, 190, 80), 330, 358);
    place(back, pT[1], 650, 352); place(back, pT[3], 720, 356); place(back, pT[0], 790, 350);
    place(back, outcrop([[0, 0, 130, 100, 1], [-70, 8, 80, 58, 2], [60, 6, 60, 40, 3]], T, 360, 240, 110), 925, 358);
    place(back, pT[2], 1135, 354); place(back, pT[0], 1210, 350);
    place(back, outcrop([[0, 0, 70, 44, 1]], T, 380, 80, 50), 1300, 358);
    // the rock shoulder before the bridge (hides the gorge clip edge)
    const shoulder = makeSprite(330, 300, 250, 290, cs, (g) => {
      const list = [[-150, 0, 150, 130, 1], [-40, 2, 140, 170, 2], [-110, -110, 110, 90, 3], [-30, -150, 100, 110, 4], [30, 0, 90, 210, 5], [20, -190, 60, 70, 6]];
      g.save(); g.translate(-60, -190); drawPine(g, 120, 70, 77, T, 2.2); g.restore();
      for (const [x, y, w, h, sd] of list) { g.save(); g.translate(x, y); drawBoulder(g, w, h, 400 + sd, T); g.restore(); }
      g.save(); g.translate(-150, -96); drawPine(g, 150, 84, 78, T, 2.2); g.restore();
    });
    place(back, shoulder, PIL_L - 20, 360);
    // waymarker stone (in front of the snow bank)
    const waymark = makeSprite(110, 170, 55, 160, cs, (g) => drawWaymarker(g, T));
    place(front, waymark, 470, 362);

    // ===== BRIDGE =====
    lineStyle('#3c4150', 0.62);
    const pillar = (flip) => makeSprite(120, 300, 60, 290, cs, (g) => drawBridgePillar(g, B, flip));
    place(back, pillar(false), PIL_L, 366);
    place(back, pillar(true), PIL_R, 366);
    const post = makeSprite(60, 130, 30, 122, cs, (g) => drawBridgePost(g, B));
    const posts = [1900, 2165, 2430, 2680];
    for (const x of posts) place(front, post, x, 352);
    // pennant strings (live) between successive posts / pillars
    const anchors = [[PIL_L + 22, 226], ...posts.map((x) => [x, 246]), [PIL_R - 22, 226]];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [ax, ay] = anchors[i], [bx, by] = anchors[i + 1];
      liveFront.push({ x0: ax, x1: bx, draw: (ctx, camX, t) => drawPennants(ctx, ax - camX, ay, bx - camX, by, t, i) });
    }
    // far bank rocks/pines after the bridge
    place(back, pV[0], 2955, 352);
    place(back, outcrop([[0, 0, 140, 150, 1], [70, 4, 90, 90, 2], [-40, -120, 80, 70, 3]], NP.village, 520, 220, 200), PIL_R + 70, 360);

    // ===== VILLAGE =====
    lineStyle('#35292d', 0.62);
    const houses = [
      { x: 3090, type: 'gable', w: 280, wallH: 200, roofH: 116, stoneH: 78, seed: 1, door: -40, wins: [[70, -128]], king: [-118, -168], chimney: null },
      { x: 3525, type: 'eave', w: 360, wallH: 176, roofH: 104, stoneH: 70, seed: 2, door: 60, wins: [[-110, -112], [-30, -112], [140, -112]], king: [-80, -150], chimney: 110 },
      { x: 3960, type: 'gable', w: 300, wallH: 232, roofH: 104, stoneH: 92, seed: 3, door: 30, wins: [[-80, -140], [80, -196], [-80, -196]], king: [60, -150], chimney: null, glow: [-80, -196] },
      { x: 4370, type: 'eave', w: 330, wallH: 178, roofH: 100, stoneH: 74, seed: 4, door: -70, wins: [[30, -118], [120, -118]], king: [70, -158], chimney: -100, glow: [120, -118] },
    ];
    for (const hs of houses) {
      const spr = makeSprite(hs.w + 120, hs.wallH + hs.roofH + 80, hs.w / 2 + 60, hs.wallH + hs.roofH + 50, cs, (g) => drawHouse(g, hs, V));
      place(back, spr, hs.x, 352);
      if (hs.chimney !== null) {
        const cx = hs.x + hs.chimney, cy = 352 - hs.wallH - hs.roofH * 0.75 - 30;
        liveBack.push({ x0: cx - 60, x1: cx + 80, draw: (ctx, camX, t) => drawSmoke(ctx, cx - camX, cy, t, hs.seed) });
      }
      if (hs.glow) {
        const gx = hs.x + hs.glow[0], gy = 352 + hs.glow[1];
        liveBack.push({ x0: gx - 60, x1: gx + 60, draw: (ctx, camX, t) => { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.08 * Math.sin(t * 3 + hs.seed); for (const [spr, a] of fire().glows) { ctx.globalAlpha = (0.35 + 0.08 * Math.sin(t * 3 + hs.seed)) * a; ctx.drawImage(spr.c, gx - camX - 50, gy - 50, 100, 100); } ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } });
      }
    }
    // gaps: pines behind fences, crates, spear racks, braziers, banner poles
    place(back, pV[1], 3270, 340);
    place(back, pV[0], 4175, 340);
    const crates = makeSprite(150, 120, 75, 110, cs, (g) => drawCrateStack(g, V));
    place(front, crates, 3285, 360);
    const rack = makeSprite(120, 150, 60, 140, cs, (g) => drawSpearRack(g, V));
    place(front, rack, 3755, 360);
    place(front, crates, 4140, 360);
    // torn clan banner on the ground by house B
    const brazier = makeSprite(90, 120, 45, 110, cs, (g) => drawBrazier(g));
    const braziers = [3335, 3800, 4235, 4870, 5280, GATE_X - 268, GATE_X + 268];
    for (const x of braziers) {
      place(front, brazier, x, 362);
      liveFront.push({ x0: x - 80, x1: x + 80, draw: (ctx, camX, t) => drawFlame(ctx, x - camX, 362 - 84, 34, t, x * 0.01, fire(), 1) });
    }
    // banner poles with fluttering Dragon King flags
    const pole = makeSprite(30, 320, 15, 310, cs, (g) => drawPole(g));
    const flag = makeSprite(96, 64, 0, 0, cs, (g) => drawFlagCloth(g, 96, 64));
    for (const x of [3060 + 190, 4010 + 170, 4760, 5150, 5420]) {
      place(front, pole, x, 362);
      liveFront.push({ x0: x - 20, x1: x + 120, draw: (ctx, camX, t) => drawFlag(ctx, flag, snap(x - camX + 3), 66, t, x * 0.013, 6) });
    }

    // ===== GATE =====
    lineStyle('#141a1a', 0.7);
    const obelisk = makeSprite(140, 340, 70, 330, cs, (g) => drawObelisk(g, G));
    place(back, obelisk, OBEL, 366);
    const statue = (broken) => makeSprite(130, 160, 65, 150, cs, (g) => drawStatue(g, G, broken));
    place(front, statue(false), 4960, 300);
    place(front, statue(true), 5340, 300);
    const gate = makeSprite(1000, 400, 500, 380, cs, (g) => drawGate(g, G));
    place(back, gate, GATE_X, 362);
    // live: eye flames + hanging banners at the gate
    for (const sx of [-1, 1]) {
      const ex = GATE_X + sx * 104, ey = 362 - 236;
      liveBack.push({ x0: ex - 70, x1: ex + 70, draw: (ctx, camX, t) => {
        if (warm > 0) { // cover the baked green glow in the socket with warm light
          ctx.globalAlpha = 0.75 * warm; ctx.drawImage(C.glowWarm.c, ex - camX - 56, ey - 50, 112, 90); ctx.globalAlpha = 1;
        }
        drawFlame(ctx, ex - camX, ey + 10, 30, t, sx * 3.1, fire(), 1.3);
      } });
    }
    // ending: warm light replaces the venom glow behind the portcullis (only drawn when warm > 0)
    liveBack.push({ x0: GATE_X - 200, x1: GATE_X + 200, draw: (ctx, camX, t) => {
      if (warm <= 0) return;
      const x = GATE_X - camX;
      ctx.globalAlpha = 0.55 * warm; ctx.drawImage(C.glowWarm.c, x - 190, 362 - 210, 380, 230);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.3 + 0.05 * Math.sin(t * 2)) * warm;
      ctx.drawImage(C.glowWarm.c, x - 150, 362 - 170, 300, 170);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    } });
    const gban = makeSprite(70, 170, 0, 0, cs, (g) => drawKingBanner(g, 4, 4, 62, 160, 91));
    for (const sx of [-1, 1]) {
      const bx = GATE_X + sx * 300 - 35;
      liveBack.push({ x0: bx - 10, x1: bx + 80, draw: (ctx, camX, t) => drawHang(ctx, gban, snap(bx - camX), 362 - 250, t, sx, 4) });
    }
    back.sort((a, b) => a.x - b.x); front.sort((a, b) => a.x - b.x);
    return { back, front, liveBack, liveFront };
  }

  // ------------------------------------------------------------------ individual near drawings
  function drawWaymarker(g, P) {
    const R = mulberry(55);
    const stone = '#a99aa3', sh = '#7a6c82', hi = '#d2c2c2', recess = '#8d7f90';
    const shape = [-30, 0, -34, -60, -29, -112, -12, -136, 8, -140, 25, -126, 33, -92, 34, -40, 32, 0, 0, 6];
    ink(g, (g) => blob(g, shape), stone, 3, (g) => {
      g.fillStyle = sh; poly(g, [14, -150, 50, -150, 50, 10, 8, 10, 20, -60]); g.fill();
      g.fillStyle = hi; g.beginPath(); g.ellipse(-18, -96, 7, 28, 0.2, 0, TAU); g.fill();
      // recessed carved panel
      g.fillStyle = recess; g.beginPath(); g.ellipse(0, -66, 22, 48, 0, 0, TAU); g.fill();
      g.strokeStyle = rgba(LINE, 0.5); g.lineWidth = 1.4; g.beginPath(); g.ellipse(0, -66, 22, 48, 0, Math.PI * 0.9, Math.PI * 2.1); g.stroke();
      g.strokeStyle = rgba('#ffffff', 0.35); g.beginPath(); g.ellipse(0, -66, 22, 48, 0, Math.PI * 0.05, Math.PI * 0.85); g.stroke();
      // raised coiled dragon in relief
      const body = [6, -104, 14, -92, 8, -80, -8, -76, -12, -62, -2, -52, 12, -46, 10, -32, -4, -24, -14, -28];
      curve(g, body); g.strokeStyle = LINE; g.lineWidth = 8; g.stroke();
      curve(g, body); g.strokeStyle = '#c4b4b6'; g.lineWidth = 5; g.stroke();
      g.save(); g.translate(1.2, 1.2); curve(g, body); g.restore(); g.strokeStyle = rgba(sh, 0.9); g.lineWidth = 1.6; g.stroke();
      ink(g, (g) => poly(g, [6, -104, -6, -108, -12, -104, -4, -100, 2, -98]), '#c4b4b6', 1.6);       // head
      ink(g, (g) => poly(g, [4, -106, 8, -118, 10, -104]), '#c4b4b6', 1.4);                          // horn
      ink(g, (g) => poly(g, [-8, -76, -20, -94, -18, -80, -24, -78, -12, -68]), '#c4b4b6', 1.6);     // wing
      g.fillStyle = LINE; g.beginPath(); g.arc(-3, -104, 1.2, 0, TAU); g.fill();
      // runes along the base
      g.strokeStyle = '#5a4e64'; g.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) { const x = -16 + i * 12, y = -8; polyline(g, [x, y - 6, x + 4, y, x + 8, y - 6]); g.stroke(); }
    });
    // faded clan cloth tied round its neck
    ink(g, (g) => poly(g, [-30, -114, 30, -124, 32, -112, -31, -102]), CLAN.red, 2, (g) => {
      g.fillStyle = CLAN.redSh; g.fillRect(10, -128, 30, 30);
      g.fillStyle = CLAN.gold; g.fillRect(-34, -106, 70, 2);
    });
    ink(g, (g) => poly(g, [18, -112, 28, -78, 21, -74, 15, -84, 12, -110]), CLAN.red, 1.8, (g) => { g.fillStyle = CLAN.redSh; g.fillRect(20, -116, 10, 50); });
    snowCap(g, -22, 24, (x) => -128 - 10 * Math.cos((x / 30) * 1.4) + (x > 0 ? 2 : 0), 12, 56, P, 1.8, 4);
    // grass tufts + a snow drift at the base
    g.strokeStyle = '#8a7a52'; g.lineWidth = 1.6;
    for (let i = 0; i < 9; i++) { const x = R.r(-40, 40); polyline(g, [x, 4, x + R.r(-6, 6), -R.r(8, 18)]); g.stroke(); }
    snowCap(g, -42, 42, (x) => 2 - (42 - Math.abs(x)) * 0.12, 7, 57, P, 1.5, 2);
  }

  function drawBridgePillar(g, P, flip) {
    const R = mulberry(flip ? 61 : 62);
    // plinth
    ink(g, (g) => poly(g, [-44, 4, -44, -26, 44, -26, 44, 4]), P.stone, 3, (g) => {
      g.fillStyle = P.stoneSh; g.fillRect(14, -30, 40, 40); g.fillStyle = P.stoneHi; g.fillRect(-44, -26, 88, 4);
    });
    // shaft with block courses
    ink(g, (g) => poly(g, [-34, -26, -34, -196, 34, -196, 34, -26]), P.stone, 3, (g) => {
      g.fillStyle = P.stoneSh; g.fillRect(12, -200, 30, 180);
      g.fillStyle = rgba(P.stoneHi, 0.8); g.fillRect(-34, -200, 7, 180);
      g.strokeStyle = P.joint; g.lineWidth = 1.5;
      for (let y = -50, k = 0; y > -196; y -= 26, k++) {
        polyline(g, [-34, y, 34, y]); g.stroke();
        const x = k % 2 ? -8 : 10; polyline(g, [x, y, x, y + 26]); g.stroke();
      }
      // faded clan plaque
      g.fillStyle = rgba(CLAN.red, 0.75); g.fillRect(-22, -150, 44, 48);
      clanEmblem(g, 0, -126, 34, rgba(CLAN.gold, 0.85));
      g.strokeStyle = rgba(LINE, 0.8); g.lineWidth = 1.5; g.strokeRect(-22, -150, 44, 48);
      // cracks
      strokeLine(g, [20, -60, 14, -72, 18, -84], 1.3, P.joint);
    });
    // capital
    ink(g, (g) => poly(g, [-42, -194, -42, -212, 42, -212, 42, -194]), P.stone, 3, (g) => {
      g.fillStyle = P.stoneSh; g.fillRect(16, -214, 30, 22); g.fillStyle = P.stoneHi; g.fillRect(-42, -212, 84, 4);
    });
    // sitting dragon statue
    g.save(); g.translate(0, -212); if (flip) g.scale(-1, 1);
    drawDragonStatue(g, P.stone, P.stoneSh, P.stoneHi, 1, false);
    g.restore();
    snowCap(g, -44, 44, () => -212, 9, 63, P, 1.7, 3);
    g.save(); g.translate(0, -212); if (flip) g.scale(-1, 1);
    snowCap(g, -26, 4, (x) => -36 + Math.abs(x + 11) * 0.25, 7, 64, P, 1.5, 2);
    g.restore();
    void R;
  }
  // sitting dragon statue (faces right), origin = base centre on the pedestal; height ~ 90*k
  function drawDragonStatue(g, col, sh, hi, k, broken) {
    g.save(); g.scale(k, k);
    // tail curling round the base
    ink(g, (g) => { g.beginPath(); g.moveTo(-30, 0); g.quadraticCurveTo(-40, -8, -30, -14); g.quadraticCurveTo(-22, -10, -24, -4); g.quadraticCurveTo(-20, 2, 20, 0); g.closePath(); }, col, 2.4);
    // folded wing (behind)
    ink(g, (g) => poly(g, [-6, -52, -34, -86, -30, -60, -40, -50, -24, -40, -30, -26, -10, -24]), sh, 2.4, (g) => {
      strokeLine(g, [-6, -52, -30, -60], 1.2, rgba(LINE, 0.6)); strokeLine(g, [-8, -40, -24, -40], 1.2, rgba(LINE, 0.6));
    });
    // body + haunch + chest
    const body = [-24, 0, -30, -18, -22, -38, -6, -52, 10, -58, 18, -52, 16, -30, 24, -12, 22, 0];
    ink(g, (g) => blob(g, body), col, 2.6, (g) => {
      g.fillStyle = sh; g.beginPath(); g.ellipse(10, -10, 18, 22, 0, 0, TAU); g.fill();
      g.fillStyle = hi; g.beginPath(); g.ellipse(-16, -30, 6, 14, 0.4, 0, TAU); g.fill();
      g.strokeStyle = rgba(LINE, 0.5); g.lineWidth = 1.2;
      for (let y = -48; y < -20; y += 7) { polyline(g, [8, y, 14, y + 2]); g.stroke(); }
    });
    // front leg
    ink(g, (g) => poly(g, [12, -30, 20, -30, 24, -2, 30, 0, 12, 0]), col, 2.4, (g) => { g.fillStyle = sh; g.fillRect(19, -30, 12, 32); });
    if (!broken) {
      // neck + head
      ink(g, (g) => { g.beginPath(); g.moveTo(4, -52); g.quadraticCurveTo(4, -76, 14, -86); g.lineTo(24, -88); g.lineTo(36, -82); g.lineTo(36, -76); g.lineTo(24, -74); g.quadraticCurveTo(18, -66, 18, -52); g.closePath(); }, col, 2.6, (g) => {
        g.fillStyle = sh; poly(g, [18, -70, 40, -76, 40, -60, 18, -50]); g.fill();
        g.fillStyle = LINE; g.beginPath(); g.ellipse(22, -82, 2.2, 1.4, 0, 0, TAU); g.fill();
      });
      ink(g, (g) => poly(g, [12, -86, 2, -100, 16, -90]), sh, 2);   // horn
      ink(g, (g) => poly(g, [18, -88, 14, -102, 24, -90]), sh, 2);  // horn
    } else {
      ink(g, (g) => poly(g, [4, -52, 6, -66, 10, -62, 14, -70, 18, -60, 18, -52]), col, 2.6, (g) => { g.fillStyle = sh; g.fillRect(12, -72, 10, 22); });
    }
    g.restore();
  }

  function drawBridgePost(g, P) {
    ink(g, (g) => poly(g, [-16, 2, -16, -96, 16, -96, 16, 2]), P.stone, 2.8, (g) => {
      g.fillStyle = P.stoneSh; g.fillRect(5, -100, 14, 104); g.fillStyle = rgba(P.stoneHi, 0.8); g.fillRect(-16, -100, 4, 104);
      g.strokeStyle = P.joint; g.lineWidth = 1.4; for (const y of [-30, -62]) { polyline(g, [-16, y, 16, y]); g.stroke(); }
    });
    ink(g, (g) => poly(g, [-20, -94, -20, -104, 0, -118, 20, -104, 20, -94]), P.stone, 2.8, (g) => {
      g.fillStyle = P.stoneSh; poly(g, [0, -118, 22, -104, 22, -92, 0, -92]); g.fill();
    });
    snowCap(g, -20, 0, (x) => -104 - (x + 20) * 0.7, 6, 71, P, 1.4, 2);
    // iron ring
    g.strokeStyle = '#3c3a40'; g.lineWidth = 2.2; g.beginPath(); g.arc(0, -100, 4, 0, TAU); g.stroke();
  }
  function drawPennants(ctx, ax, ay, bx, by, t, seed) {
    if (Math.max(ax, bx) < -20 || Math.min(ax, bx) > W + 20) return;
    const sag = 26;
    const pt = (f) => [lerp(ax, bx, f), lerp(ay, by, f) + sag * 4 * f * (1 - f)];
    ctx.strokeStyle = '#4a3a34'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag * 2, bx, by); ctx.stroke();
    const n = 9;
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const [x, y] = pt(f);
      if (seed === 2 && i === 5) continue; // a missing one
      const sw = Math.sin(t * 4.2 + i * 0.9 + seed * 2) * 4;
      const len = 20 + (i % 3) * 2;
      ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.lineTo(x + sw + 3, y + len); ctx.closePath();
      ctx.fillStyle = i % 2 ? CLAN.red : CLAN.gold; ctx.fill();
      ctx.lineWidth = 1.3; ctx.strokeStyle = '#3c4150'; ctx.stroke();
    }
  }

  function drawHouse(g, hs, P) {
    const R = mulberry(hs.seed * 1000 + 7);
    const w = hs.w, hw = w / 2, wallH = hs.wallH, stoneH = hs.stoneH, roofH = hs.roofH;
    const lw = 3;
    // --- walls
    // timber + plaster upper
    ink(g, (g) => poly(g, [-hw, 0, -hw, -wallH, hw, -wallH, hw, 0]), P.plaster, lw, (g) => {
      g.fillStyle = P.plasterSh; g.fillRect(hw - w * 0.18, -wallH - 4, w * 0.2, wallH + 8);
      g.fillStyle = rgba(P.plasterSh, 0.5); g.fillRect(-hw, -wallH, w, 16); // shadow under the eaves
      // timber frame
      const tw = 9;
      const posts = [];
      const np = Math.max(3, Math.round(w / 70));
      for (let i = 0; i <= np; i++) posts.push(-hw + (w * i) / np);
      for (const x of posts) {
        const xx = clamp(x, -hw + tw / 2, hw - tw / 2);
        ink(g, (g) => poly(g, [xx - tw / 2, -stoneH, xx - tw / 2, -wallH, xx + tw / 2, -wallH, xx + tw / 2, -stoneH]), P.timber, 1.6, (g) => { g.fillStyle = P.timberSh; g.fillRect(xx + 1, -wallH, tw, wallH); });
      }
      // mid rail + braces
      const midY = hs.wallH > 200 ? -stoneH - (wallH - stoneH) * 0.5 : null;
      if (midY) ink(g, (g) => poly(g, [-hw, midY - 4, hw, midY - 4, hw, midY + 4, -hw, midY + 4]), P.timber, 1.6);
      for (let i = 0; i < np; i++) {
        if (hash1(hs.seed * 31 + i) < 0.45) continue;
        const x0 = posts[i] + tw / 2, x1 = posts[i + 1] - tw / 2;
        const yb = midY ? midY : -stoneH, yt = midY ? -wallH : -wallH;
        const d = i % 2 ? [x0, yb, x1, yt + 10] : [x0, yt + 10, x1, yb];
        g.save(); g.beginPath(); g.moveTo(d[0], d[1]); g.lineTo(d[2], d[3]); g.lineWidth = 6 + 3 * LK; g.strokeStyle = LINE; g.stroke(); g.lineWidth = 6; g.strokeStyle = P.timber; g.stroke(); g.restore();
      }
      // top plate
      ink(g, (g) => poly(g, [-hw, -wallH, hw, -wallH, hw, -wallH + 10, -hw, -wallH + 10]), P.timber, 1.6);
    });
    // stone base
    ink(g, (g) => poly(g, [-hw - 4, 2, -hw - 4, -stoneH, hw + 4, -stoneH, hw + 4, 2]), P.stone, lw, (g) => {
      // blocks
      const rows = Math.round(stoneH / 22);
      const rh = stoneH / rows;
      for (let r = 0; r < rows; r++) {
        const y0 = -stoneH + r * rh;
        let x = -hw - 4 - (r % 2 ? 20 : 0);
        while (x < hw + 4) {
          const bw = 34 + hash2(x | 0, r + hs.seed * 9) * 28;
          const v = hash2(x * 3 | 0, r * 7 + hs.seed);
          g.fillStyle = v < 0.33 ? P.stoneSh : v > 0.8 ? P.stoneHi : P.stone;
          g.fillRect(x + 1.5, y0 + 1.5, bw - 3, rh - 3);
          g.fillStyle = rgba(P.stoneHi, 0.7); g.fillRect(x + 2, y0 + 2, bw - 5, 2);
          g.strokeStyle = P.joint; g.lineWidth = 1.4; g.strokeRect(x + 0.5, y0 + 0.5, bw - 1, rh - 1);
          x += bw;
        }
      }
      g.fillStyle = rgba(P.stoneSh, 0.45); g.fillRect(hw - w * 0.2, -stoneH, w * 0.25, stoneH + 4);
    });
    // windows
    for (const [wx, wy] of hs.wins) drawWindow(g, wx, wy, hs.glow && hs.glow[0] === wx && hs.glow[1] === wy, P);
    // door
    {
      const dw = 80, dh = 168, dx = hs.door;
      ink(g, (g) => { g.beginPath(); g.moveTo(dx - dw / 2 - 8, 0); g.lineTo(dx - dw / 2 - 8, -dh + 6); g.quadraticCurveTo(dx, -dh - 26, dx + dw / 2 + 8, -dh + 6); g.lineTo(dx + dw / 2 + 8, 0); g.closePath(); }, P.stone, lw, (g) => { g.fillStyle = P.stoneSh; g.fillRect(dx + dw / 2 - 4, -dh - 30, 20, dh + 34); });
      ink(g, (g) => { g.beginPath(); g.moveTo(dx - dw / 2, 0); g.lineTo(dx - dw / 2, -dh + 8); g.quadraticCurveTo(dx, -dh - 16, dx + dw / 2, -dh + 8); g.lineTo(dx + dw / 2, 0); g.closePath(); }, P.timber, 2.4, (g) => {
        g.strokeStyle = P.timberSh; g.lineWidth = 1.6;
        for (let x = dx - dw / 2 + 13; x < dx + dw / 2; x += 13) { polyline(g, [x, 0, x, -dh - 10]); g.stroke(); }
        g.fillStyle = P.timberSh; g.fillRect(dx + 10, -dh - 20, dw, dh + 24);
        // iron straps + ring
        g.fillStyle = '#3a383e';
        for (const y of [-dh * 0.28, -dh * 0.72]) g.fillRect(dx - dw / 2, y - 3, dw, 6);
        g.strokeStyle = '#2a282e'; g.lineWidth = 2; g.beginPath(); g.arc(dx + dw * 0.28, -dh * 0.5, 5, 0, TAU); g.stroke();
      });
      // a Dragon King seal nailed across the door
      ink(g, (g) => poly(g, [dx - dw / 2 + 4, -dh * 0.55, dx + dw / 2 - 4, -dh * 0.62, dx + dw / 2 - 4, -dh * 0.55, dx - dw / 2 + 4, -dh * 0.48]), KING.cloth, 1.4);
    }
    // banners: torn clan banner partly covered by the Dragon King's banner
    if (hs.king) {
      const [bx, by] = hs.king;
      drawClanBanner(g, bx - 12, by + 6, 74, 118, hs.seed * 5, true, 2);
      drawKingBanner(g, bx, by, 56, 130, hs.seed * 5 + 1, 2.2);
    }
    // --- roof
    if (hs.type === 'gable') drawGableRoof(g, hs, P, R); else drawEaveRoof(g, hs, P, R);
    // icicles under the eaves handled in roof functions; snow drift against the base
    snowCap(g, -hw - 8, hw + 8, (x) => -2 - 6 * Math.max(0, Math.sin(x * 0.03 + hs.seed)), 8, hs.seed * 17, P, 1.6, 2);
  }
  function drawWindow(g, x, y, lit, P) {
    const w = 36, h = 42;
    ink(g, (g) => poly(g, [x - w / 2 - 5, y - h / 2 - 5, x + w / 2 + 5, y - h / 2 - 5, x + w / 2 + 5, y + h / 2 + 5, x - w / 2 - 5, y + h / 2 + 5]), P.timber, 2.2);
    ink(g, (g) => poly(g, [x - w / 2, y - h / 2, x + w / 2, y - h / 2, x + w / 2, y + h / 2, x - w / 2, y + h / 2]), lit ? '#b8f08a' : '#2b2530', 1.6, (g) => {
      if (lit) { g.fillStyle = '#7fd860'; g.fillRect(x - w / 2, y, w, h); }
      else { g.fillStyle = '#3c3542'; g.fillRect(x - w / 2, y - h / 2, w * 0.4, h); }
      g.strokeStyle = P.timber; g.lineWidth = 3;
      polyline(g, [x, y - h / 2, x, y + h / 2]); g.stroke(); polyline(g, [x - w / 2, y, x + w / 2, y]); g.stroke();
    });
    // shutters (one hanging open)
    ink(g, (g) => poly(g, [x - w / 2 - 5, y - h / 2 - 4, x - w / 2 - 22, y - h / 2 - 2, x - w / 2 - 22, y + h / 2 + 2, x - w / 2 - 5, y + h / 2 + 4]), P.timberHi, 1.8, (g) => {
      g.strokeStyle = P.timberSh; g.lineWidth = 1.2; for (let k = 0; k < 3; k++) { polyline(g, [x - w / 2 - 10 - k * 5, y - h / 2, x - w / 2 - 10 - k * 5, y + h / 2]); g.stroke(); }
    });
    snowCap(g, x - w / 2 - 6, x + w / 2 + 6, () => y + h / 2 + 5, 5, (x * 7) | 0, P, 1.3, 1);
  }
  function drawGableRoof(g, hs, P, R) {
    const hw = hs.w / 2, wallH = hs.wallH, roofH = hs.roofH;
    const ov = 26, ex = hw + ov, yE = -wallH + 6, yA = -wallH - roofH;
    // gable wall (plaster triangle with timber)
    ink(g, (g) => poly(g, [-hw, -wallH + 2, 0, yA + 18, hw, -wallH + 2]), P.plaster, 2.6, (g) => {
      g.fillStyle = P.plasterSh; poly(g, [0, yA, hw + 10, -wallH + 4, hw * 0.6, -wallH + 4]); g.fill();
      g.strokeStyle = LINE; g.lineWidth = 1.5;
      g.fillStyle = P.timber; g.fillRect(-5, yA + 10, 10, roofH); g.strokeRect(-5, yA + 10, 10, roofH);
      g.fillRect(-hw, -wallH - roofH * 0.35, hs.w, 8); g.strokeRect(-hw, -wallH - roofH * 0.35, hs.w, 8);
      // small round vent with dragon eye
      g.fillStyle = '#2b2530'; g.beginPath(); g.arc(0, -wallH - roofH * 0.6, 9, 0, TAU); g.fill(); g.stroke();
    });
    // roof slabs (thick bargeboards) with heavy snow
    const thick = 16;
    const side = (s) => [0, yA - 4, s * ex, yE, s * ex, yE + thick, 0, yA + thick + 2];
    for (const s of [-1, 1]) ink(g, (g) => poly(g, side(s)), P.roof, 3, (g) => {
      g.fillStyle = P.roofSh; g.fillRect(-ex, yA, ex * 2, 400);
      g.fillStyle = P.roof; poly(g, side(s).map((v, i) => (i % 2 ? v - 6 : v))); g.fill();
      // carved notches
      g.strokeStyle = rgba(LINE, 0.6); g.lineWidth = 1.2;
      for (let f = 0.15; f < 0.95; f += 0.12) { const x = s * ex * f, y = lerp(yA, yE, f) + 4; polyline(g, [x, y, x + s * 3, y + 8]); g.stroke(); }
    });
    // snow blanket on each slope
    for (const s of [-1, 1]) {
      const fn = (x) => lerp(yA - 4, yE, Math.abs(x) / ex) - 2;
      const xl = s < 0 ? -ex - 2 : 0, xr = s < 0 ? 0 : ex + 2;
      snowCap(g, xl, xr, fn, 18, hs.seed * 50 + (s + 1), P, 1.8, 2);
    }
    // crossed dragon-head finials at the apex
    for (const s of [-1, 1]) {
      g.save(); g.translate(s * 2, yA + 2); g.scale(s, 1); g.rotate(-0.25);
      drawDragonFinial(g, P);
      g.restore();
    }
    // icicles at both eave ends
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const x = s * (ex - 6 - i * 9), y = yE + thick - 1;
      ink(g, (g) => poly(g, [x - 3, y, x + 3, y, x, y + 8 + ((i * 7 + hs.seed) % 5) * 2]), '#e8f2fb', 1.2);
    }
    void R;
  }
  function drawEaveRoof(g, hs, P, R) {
    const hw = hs.w / 2, wallH = hs.wallH, roofH = hs.roofH;
    const yE = -wallH + 8, yR = -wallH - roofH;
    const ex = hw + 24, rx = hw - 18;
    const xAt = (y) => lerp(rx, ex, (y - yR) / (yE - yR));
    // roof body with scalloped shingle rows (only the eave band stays visible under the snow)
    ink(g, (g) => poly(g, [-ex, yE, -rx, yR, rx, yR, ex, yE, ex, yE + 12, -ex, yE + 12]), P.roof, 3, (g) => {
      g.fillStyle = P.roofSh; g.fillRect(-ex, yE + 2, ex * 2, 12);
      for (let y = yR + 10, row = 0; y < yE + 12; y += 9, row++) {
        const xx = xAt(Math.min(y, yE));
        g.fillStyle = row % 2 ? rgba(P.roofSh, 0.55) : rgba(lighten(P.roof, 0.12), 0.5);
        for (let x = -xx - 8 + (row % 2) * 7; x < xx + 8; x += 14) {
          g.beginPath(); g.arc(x, y, 7, 0, Math.PI); g.fill();
          g.strokeStyle = rgba(LINE, 0.4); g.lineWidth = 1; g.stroke();
        }
      }
    });
    // chimney (its foot is buried by the snow blanket)
    if (hs.chimney !== null) {
      const cx = hs.chimney, cyB = lerp(yE, yR, 0.55), cyT = yR - 30;
      ink(g, (g) => poly(g, [cx - 16, cyB, cx - 16, cyT, cx + 16, cyT, cx + 16, cyB]), P.stone, 2.6, (g) => {
        g.fillStyle = P.stoneSh; g.fillRect(cx + 4, cyT, 14, cyB - cyT);
        g.strokeStyle = P.joint; g.lineWidth = 1.2; for (let y = cyT + 12; y < cyB; y += 12) { polyline(g, [cx - 16, y, cx + 16, y]); g.stroke(); }
      });
      ink(g, (g) => poly(g, [cx - 20, cyT, cx - 20, cyT - 7, cx + 20, cyT - 7, cx + 20, cyT]), P.stoneSh, 2.2);
      snowCap(g, cx - 20, cx + 20, () => cyT - 7, 6, hs.seed * 3, P, 1.3, 2);
    }
    // thick snow blanket: lumpy lower lip hanging over the shingles, visible thickness, wind ripples
    const lipY = yE - 12;
    const sn = [-rx + 4, yR - 7];
    for (let x = -rx + 16; x <= rx - 16; x += 22) sn.push(x, yR - 8 - R.r(0, 4));
    sn.push(rx - 4, yR - 7, xAt(lipY) - 2, lipY - 2);
    for (let x = xAt(lipY) - 14; x > -xAt(lipY) + 14; x -= R.r(14, 24)) sn.push(x, lipY + R.r(-3, 5) + (R() < 0.22 ? 10 : 0));
    sn.push(-xAt(lipY) + 2, lipY - 2);
    ink(g, (g) => blob(g, sn), P.snowSh, 2.2, (g) => {
      const gr = g.createLinearGradient(0, yR, 0, yE);
      gr.addColorStop(0, P.snowHi); gr.addColorStop(0.6, P.snow); gr.addColorStop(1, mix(P.snow, P.snowSh, 0.3));
      g.save(); g.translate(-2, -10); blob(g, sn); g.fillStyle = gr; g.fill(); g.restore();
      g.strokeStyle = rgba(P.snowSh, 0.55); g.lineWidth = 1.4;
      for (let i = 0; i < 9; i++) {
        const y = lerp(yR + 14, lipY - 22, R()), x = R.r(-xAt(y) * 0.8, xAt(y) * 0.6);
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20, y - 3, x + R.r(34, 70), y + R.r(-1, 2)); g.stroke();
      }
    });
    // hip bargeboards with snow
    for (const s of [-1, 1]) {
      ink(g, (g) => poly(g, [s * (ex + 2), yE + 2, s * (rx + 2), yR - 4, s * (rx - 8), yR - 4, s * (ex - 10), yE + 2]), P.timber, 2.2, (g) => { g.fillStyle = P.timberSh; g.fillRect(-ex - 10, yE - 4, ex * 2 + 20, 10); });
    }
    // dormer on long roofs
    if (hs.w >= 340) {
      const dx = -hs.w * 0.18, dB = lerp(yR, yE, 0.62), dT = dB - 40;
      ink(g, (g) => poly(g, [dx - 22, dB, dx - 22, dT + 12, dx + 22, dT + 12, dx + 22, dB]), P.plaster, 2.4, (g) => { g.fillStyle = P.plasterSh; g.fillRect(dx + 10, dT, 14, 50); });
      ink(g, (g) => poly(g, [dx - 11, dB - 2, dx - 11, dT + 18, dx + 11, dT + 18, dx + 11, dB - 2]), '#2b2530', 1.6, (g) => {
        g.fillStyle = 'rgba(126,216,96,0.55)'; g.fillRect(dx - 11, dT + 26, 22, 14);
        g.strokeStyle = P.timber; g.lineWidth = 2.4; polyline(g, [dx, dT + 18, dx, dB]); g.stroke();
      });
      ink(g, (g) => poly(g, [dx - 30, dT + 14, dx, dT - 10, dx + 30, dT + 14, dx + 24, dT + 18, dx, dT - 2, dx - 24, dT + 18]), P.timber, 2.2);
      snowCap(g, dx - 30, dx + 30, (x) => dT + 12 - (30 - Math.abs(x - dx)) * 0.8, 8, hs.seed * 13, P, 1.5, 3);
      snowCap(g, dx - 26, dx + 26, () => dB, 7, hs.seed * 14, P, 1.4, 2);
    }
    // ridge beam with dragon-head ornaments at both ends
    ink(g, (g) => poly(g, [-rx - 4, yR - 4, rx + 4, yR - 4, rx + 4, yR - 12, -rx - 4, yR - 12]), P.timber, 2.2);
    for (const s of [-1, 1]) {
      g.save(); g.translate(s * (rx + 2), yR - 8); g.scale(s, 1);
      drawDragonFinial(g, P);
      g.restore();
    }
    snowCap(g, -rx - 4, rx + 4, () => yR - 12, 6, hs.seed * 9, P, 1.4, 2);
    // icicles along the eave
    for (let x = -ex + 12; x < ex - 8; x += 11 + ((x * 7) & 7)) {
      const y = yE + 11, l = 6 + (((x * 13) | 0) & 7) * 1.8;
      ink(g, (g) => poly(g, [x - 2.5, y, x + 2.5, y, x, y + l]), '#e6f0fa', 1.1);
    }
  }
  // carved dragon head ridge ornament (faces +x), origin at the ridge end
  function drawDragonFinial(g, P) {
    ink(g, (g) => { g.beginPath(); g.moveTo(-6, 5); g.quadraticCurveTo(12, 2, 15, -16); g.quadraticCurveTo(17, -30, 28, -32); g.lineTo(40, -29); g.lineTo(46, -25); g.lineTo(36, -22); g.lineTo(42, -16); g.lineTo(30, -17); g.quadraticCurveTo(24, -6, 8, 7); g.closePath(); }, P.timber, 2.4, (g) => {
      g.fillStyle = P.timberSh; poly(g, [8, 7, 22, -10, 44, -16, 44, 10]); g.fill();
      g.fillStyle = P.timberHi; poly(g, [14, -18, 20, -28, 28, -30, 20, -22]); g.fill();
      g.fillStyle = LINE; g.beginPath(); g.ellipse(28, -26, 2, 1.4, -0.3, 0, TAU); g.fill();
    });
    ink(g, (g) => poly(g, [20, -30, 13, -46, 26, -32]), P.timberSh, 1.6);
    ink(g, (g) => poly(g, [8, -6, -2, -14, 6, -16, 10, -10]), P.timberSh, 1.4);
  }
  function drawCrateStack(g, P) {
    const crate = (x, y, w, h, seed) => {
      ink(g, (g) => poly(g, [x - w / 2, y, x - w / 2, y - h, x + w / 2, y - h, x + w / 2, y]), '#8d6644', 2.6, (g) => {
        g.fillStyle = '#6e4c31'; g.fillRect(x + w * 0.25, y - h, w * 0.3, h);
        g.strokeStyle = '#4a3222'; g.lineWidth = 1.4;
        for (let k = 1; k < 3; k++) { polyline(g, [x - w / 2, y - (h * k) / 3, x + w / 2, y - (h * k) / 3]); g.stroke(); }
        g.lineWidth = 5; g.strokeStyle = '#6e4c31'; polyline(g, [x - w / 2 + 5, y - 5, x + w / 2 - 5, y - h + 5]); g.stroke();
        g.lineWidth = 1.4; g.strokeStyle = '#4a3222'; g.strokeRect(x - w / 2 + 4, y - h + 4, w - 8, h - 8);
      });
      snowCap(g, x - w / 2, x + w / 2, () => y - h, 6, seed, P, 1.4, 2);
    };
    crate(-34, 0, 58, 50, 1); crate(24, 0, 54, 46, 2); crate(-8, -50, 50, 42, 3);
    // barrel beside
    ink(g, (g) => { g.beginPath(); g.ellipse(58, -24, 15, 26, 0, 0, TAU); }, '#7d5a3c', 2.4, (g) => {
      g.fillStyle = '#5e4129'; g.fillRect(62, -50, 14, 52);
      g.fillStyle = '#3e3c42'; g.fillRect(40, -40, 40, 4); g.fillRect(40, -12, 40, 4);
    });
  }
  function drawSpearRack(g, P) {
    // A-frame rack with spears
    for (let i = 0; i < 5; i++) {
      const x = -36 + i * 18;
      g.save(); g.translate(x, 0); g.rotate(-0.06 + i * 0.03);
      ink(g, (g) => poly(g, [-2, 0, -2, -118, 2, -118, 2, 0]), '#6a4c34', 1.4);
      ink(g, (g) => poly(g, [-5, -116, 0, -136, 5, -116, 0, -112]), '#9aa0a6', 1.6, (g) => { g.fillStyle = '#6c7278'; g.fillRect(0, -140, 6, 30); });
      g.restore();
    }
    ink(g, (g) => poly(g, [-50, -70, 50, -70, 50, -62, -50, -62]), '#5f4637', 2.2);
    ink(g, (g) => poly(g, [-50, -20, 50, -20, 50, -12, -50, -12]), '#5f4637', 2.2);
    ink(g, (g) => poly(g, [-52, 2, -46, -76, -40, -76, -46, 2]), '#5f4637', 2.2);
    ink(g, (g) => poly(g, [52, 2, 46, -76, 40, -76, 46, 2]), '#5f4637', 2.2);
    snowCap(g, -50, 50, () => -70, 5, 88, P, 1.3, 2);
  }
  function drawBrazier(g) {
    const iron = '#3b3d42', ironSh = '#25262b', ironHi = '#666a72';
    // stone pedestal
    ink(g, (g) => poly(g, [-18, 2, -14, -56, 14, -56, 18, 2]), '#5a5f60', 2.6, (g) => { g.fillStyle = '#3e4344'; g.fillRect(4, -60, 20, 64); g.fillStyle = '#76807f'; g.fillRect(-18, -60, 5, 64); });
    ink(g, (g) => poly(g, [-22, -54, 22, -54, 22, -62, -22, -62]), '#4b5052', 2.4);
    // iron bowl
    ink(g, (g) => { g.beginPath(); g.moveTo(-30, -84); g.quadraticCurveTo(-26, -60, 0, -60); g.quadraticCurveTo(26, -60, 30, -84); g.closePath(); }, iron, 2.6, (g) => {
      g.fillStyle = ironSh; g.fillRect(6, -90, 30, 32); g.fillStyle = ironHi; g.fillRect(-26, -84, 6, 14);
      g.fillStyle = '#1d1e22'; for (let x = -20; x <= 20; x += 10) g.fillRect(x - 1.5, -80, 3, 3);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -84, 30, 5, 0, 0, TAU); }, '#1f2a22', 2.2, (g) => { g.fillStyle = '#3a7a3a'; g.beginPath(); g.ellipse(0, -83, 24, 3, 0, 0, TAU); g.fill(); });
  }
  function drawPole(g) {
    ink(g, (g) => poly(g, [-3.5, 2, -3, -292, 3, -292, 3.5, 2]), '#3a2f2c', 2);
    ink(g, (g) => poly(g, [-6, -290, 0, -306, 6, -290]), '#8a9096', 1.8);
    ink(g, (g) => poly(g, [-7, -4, 7, -4, 9, 4, -9, 4]), '#2e2a2a', 1.8);
  }
  function drawFlagCloth(g, w, h) {
    // flag attached on the left, swallow-tail on the right
    const pts = [0, 2, w, 6, w - 16, h * 0.5, w, h - 6, 0, h - 2];
    ink(g, (g) => poly(g, pts), KING.cloth, 1.8, (g) => {
      g.fillStyle = KING.clothHi; g.fillRect(0, 0, w, 8);
      g.fillStyle = KING.clothSh; g.fillRect(0, h - 14, w, 14);
      kingEmblem(g, w * 0.42, h * 0.52, h * 0.66, KING.green, KING.cloth);
      g.strokeStyle = rgba(KING.green, 0.7); g.lineWidth = 1.4; g.beginPath(); g.moveTo(4, 5); g.lineTo(w - 4, 8); g.stroke();
    });
  }
  function drawSmoke(ctx, x, y, t, seed) {
    if (x < -80 || x > W + 80) return;
    for (let i = 0; i < 6; i++) {
      const f = (t * 0.22 + i / 6 + seed * 0.37) % 1;
      const r = 8 + f * 26;
      ctx.globalAlpha = (1 - f) * 0.75 * Math.min(1, f * 6);
      ctx.drawImage(C.smoke.c, x + f * 46 + Math.sin(f * 6 + seed) * 6 - r, y - f * 120 - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }
  function drawObelisk(g, P) {
    ink(g, (g) => poly(g, [-36, 4, -36, -30, 36, -30, 36, 4]), P.stone, 3, (g) => { g.fillStyle = P.stoneSh; g.fillRect(12, -34, 30, 40); });
    ink(g, (g) => poly(g, [-28, -30, -22, -250, 22, -250, 28, -30]), P.stone, 3, (g) => {
      g.fillStyle = P.stoneSh; g.fillRect(6, -260, 30, 240);
      g.fillStyle = rgba(P.stoneHi, 0.8); g.fillRect(-28, -260, 7, 240);
      g.strokeStyle = P.joint; g.lineWidth = 1.4;
      for (let y = -70; y > -250; y -= 40) { polyline(g, [-28, y, 28, y]); g.stroke(); }
    });
    // crowned dragon finial
    ink(g, (g) => poly(g, [-30, -248, 30, -248, 26, -262, -26, -262]), P.stoneSh, 2.6);
    g.save(); g.translate(0, -262); g.scale(-1, 1); drawDragonStatue(g, P.stone, P.stoneSh, P.stoneHi, 0.8, false); g.restore();
    drawKingBanner(g, -26, -230, 52, 150, 333, 2.2);
    snowCap(g, -30, 30, () => -262, 6, 334, P, 1.5, 2);
    snowCap(g, -36, 36, () => -30, 6, 335, P, 1.5, 2);
  }
  function drawStatue(g, P, broken) {
    ink(g, (g) => poly(g, [-34, 2, -34, -26, 34, -26, 34, 2]), P.stone, 2.8, (g) => { g.fillStyle = P.stoneSh; g.fillRect(10, -30, 30, 34); g.fillStyle = P.stoneHi; g.fillRect(-34, -26, 68, 3); });
    g.save(); g.translate(-4, -26); drawDragonStatue(g, P.stone, P.stoneSh, P.stoneHi, 1.15, broken); g.restore();
    snowCap(g, -34, 34, () => -26, 6, broken ? 41 : 42, P, 1.5, 2);
    if (broken) {
      // rubble at the foot
      for (const [x, y, w, h] of [[30, 2, 18, 10], [44, 2, 12, 7]]) { g.save(); g.translate(x, y); drawBoulder(g, w, h, x, { rock: P.stone, rockSh: P.stoneSh, rockHi: P.stoneHi, crack: P.joint, snow: P.snow, snowSh: P.snowSh }, 1.6, false); g.restore(); }
    }
  }

  // ------------------------------------------------------------------ THE DRAGON GATE (centre = 0, floor back edge = 0)
  function drawGate(g, P) {
    const R = mulberry(5920);
    const st = '#5f6a66', stSh = '#434c4a', stDk = '#2d3433', stHi = '#87948f';
    const rk = '#2b3232', rkSh = '#1d2223', rkHi = '#465450';
    // ---- cliff rock mass behind
    const sky = [[-500, -150], [-470, -178], [-452, -228], [-420, -244], [-404, -284], [-372, -296], [-336, -282], [-300, -312], [-262, -300],
      [-220, -296], [-150, -306], [-60, -300], [0, -308], [70, -300], [150, -310], [214, -296], [262, -318], [300, -304], [344, -330],
      [372, -312], [410, -292], [446, -316], [486, -298], [530, -306]];
    const mt = (x) => {
      for (let i = 0; i < sky.length - 1; i++) if (x <= sky[i + 1][0]) return lerp(sky[i][1], sky[i + 1][1], (x - sky[i][0]) / (sky[i + 1][0] - sky[i][0]));
      return sky[sky.length - 1][1];
    };
    const mass = [-500, 4].concat(flat(sky), [530, 4]);
    ink(g, (g) => poly(g, mass), rk, 3.5, (g) => {
      cliffFace(g, -510, 530, mt, { rockSh: rkSh, rockHi: rkHi, crev: '#0d1111', snow: '#7e8b87', ledgeA: 0.6, ledges: 2 }, 5921, 88, 6);
      cliffFace(g, -510, 530, (x) => mt(x) + 150 + 20 * Math.sin(x * 0.02), { rockSh: rkSh, rockHi: rkHi, crev: '#0d1111', snow: '#7e8b87', ledgeA: 0.5, ledges: 1 }, 5922, 70, 6);
      // green light bleeding from the gate onto the rock
      const gr = g.createRadialGradient(0, -200, 60, 0, -200, 470);
      gr.addColorStop(0, 'rgba(110,220,110,0.22)'); gr.addColorStop(1, 'rgba(110,220,110,0)');
      g.fillStyle = gr; g.fillRect(-520, -380, 1040, 400);
      // storm-lit rim along the skyline
      g.beginPath(); for (const [x, y] of sky) g.lineTo(x, y + 3); g.strokeStyle = 'rgba(120,190,140,0.45)'; g.lineWidth = 5; g.stroke();
    });
    snowCap(g, -500, 530, (x) => mt(x) + 1, 7, 5930, P, 1.6, 2);
    // ---- frills (behind the head)
    for (const s of [-1, 1]) {
      g.save(); g.scale(s, 1);
      const fr = [196, -236, 300, -276, 270, -228, 338, -214, 296, -178, 344, -142, 288, -132, 300, -96, 200, -120];
      ink(g, (g) => poly(g, fr), stSh, 3, (g) => {
        g.fillStyle = stDk; poly(g, [200, -200, 300, -190, 340, -150, 200, -120]); g.fill();
        g.strokeStyle = rgba(LINE, 0.7); g.lineWidth = 2;
        for (const [x, y] of [[300, -276], [338, -214], [344, -142], [300, -96]]) { polyline(g, [205, -180, x, y]); g.stroke(); }
      });
      g.restore();
    }
    // ---- horns
    for (const s of [-1, 1]) {
      g.save(); g.scale(s, 1);
      const horn = (g) => { g.beginPath(); g.moveTo(70, -268); g.bezierCurveTo(140, -300, 230, -296, 268, -330); g.quadraticCurveTo(292, -352, 300, -372); g.quadraticCurveTo(300, -330, 266, -298); g.bezierCurveTo(226, -262, 160, -262, 124, -244); g.closePath(); };
      ink(g, horn, st, 3.5, (g) => {
        g.fillStyle = stSh; g.save(); g.translate(0, 12); horn(g); g.fill(); g.restore();
        g.strokeStyle = rgba(LINE, 0.7); g.lineWidth = 2;
        for (let f = 0; f < 6; f++) { const x = 120 + f * 28, y = -268 - f * 10 - (f > 3 ? (f - 3) * 10 : 0); polyline(g, [x, y - 16, x + 8, y + 18]); g.stroke(); }
      });
      g.restore();
    }
    // snow on the horns
    for (const s of [-1, 1]) {
      g.save(); g.scale(s, 1);
      snowCap(g, 90, 250, (x) => -270 - (x - 90) * 0.32 - Math.max(0, x - 200) * 0.4, 7, 960 + s, P, 1.5, 2);
      g.restore();
    }
    // ---- head mass
    const head = [];
    const right = [0, -296, 70, -300, 130, -290, 182, -262, 210, -232, 220, -198, 210, -160, 196, -124, 188, -60, 196, 4];
    for (let i = 0; i < right.length; i += 2) head.push(right[i], right[i + 1]);
    for (let i = right.length - 2; i >= 2; i -= 2) head.push(-right[i], right[i + 1]);
    // mouth opening (cut out by drawing interior on top)
    ink(g, (g) => poly(g, head), st, 4, (g) => {
      // shading: right side darker, lit top-left
      g.fillStyle = stSh; poly(g, [40, -320, 240, -320, 240, 10, 150, 10, 120, -160]); g.fill();
      g.fillStyle = rgba(stHi, 0.8); poly(g, [-200, -240, -120, -290, -40, -298, -60, -270, -160, -236]); g.fill();
      // forehead scale plates
      g.strokeStyle = rgba(LINE, 0.55); g.lineWidth = 1.6;
      for (let r = 0; r < 4; r++) for (let k = -3 + (r % 2) * 0.5; k <= 3; k++) {
        const x = k * 26, y = -284 + r * 16;
        if (Math.abs(x) > 80 - r * 8) continue;
        g.beginPath(); g.arc(x, y, 12, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      }
      // cheek ridges
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { polyline(g, [s * (160 + k * 6), -190 + k * 30, s * (196 + k * 2), -200 + k * 30]); g.stroke(); }
      // cracks
      g.strokeStyle = rgba(LINE, 0.8); g.lineWidth = 1.8;
      polyline(g, [70, -296, 62, -276, 72, -262, 64, -244]); g.stroke();
      polyline(g, [-190, -150, -176, -134, -184, -112]); g.stroke();
    });
    // brow ridges + eye sockets
    for (const s of [-1, 1]) {
      g.save(); g.scale(s, 1);
      ink(g, (g) => poly(g, [62, -232, 104, -252, 152, -254, 176, -238, 150, -230, 108, -224, 74, -214]), '#120f10', 3, (g) => {
        const gr = g.createRadialGradient(108, -236, 2, 108, -236, 46);
        gr.addColorStop(0, 'rgba(180,255,150,0.9)'); gr.addColorStop(0.3, 'rgba(70,170,70,0.6)'); gr.addColorStop(1, 'rgba(20,40,20,0)');
        g.fillStyle = gr; g.fillRect(50, -270, 140, 70);
      });
      ink(g, (g) => poly(g, [44, -262, 98, -282, 164, -284, 204, -266, 210, -248, 168, -258, 104, -256, 56, -238]), st, 3.2, (g) => {
        g.fillStyle = stSh; poly(g, [56, -238, 104, -256, 168, -258, 210, -248, 210, -240, 56, -230]); g.fill();
        g.fillStyle = stHi; poly(g, [60, -258, 100, -276, 160, -278, 190, -270, 160, -272, 100, -270]); g.fill();
      });
      // brow spikes
      for (const [x, y, l] of [[150, -282, 22], [180, -276, 26], [120, -284, 16]]) ink(g, (g) => poly(g, [x - 8, y + 2, x + 6, y - l, x + 8, y + 4]), stSh, 2.4);
      g.restore();
    }
    for (const s of [-1, 1]) {
      g.save(); g.scale(s, 1);
      snowCap(g, 50, 205, (x) => lerp(-266, -284, Math.min(1, (x - 50) / 60)) + Math.max(0, x - 170) * 0.5, 6, 970 + s, P, 1.5, 2);
      g.restore();
    }
    snowCap(g, -60, 60, (x) => -298 + Math.abs(x) * 0.05, 7, 975, P, 1.6, 2);
    // snout + nostrils (upper jaw overhangs the mouth)
    ink(g, (g) => { g.beginPath(); g.moveTo(-150, -150); g.lineTo(-136, -206); g.quadraticCurveTo(0, -236, 136, -206); g.lineTo(150, -150); g.quadraticCurveTo(0, -176, -150, -150); g.closePath(); }, st, 3.5, (g) => {
      g.fillStyle = stSh; g.fillRect(-160, -172, 320, 30);
      g.fillStyle = rgba(stHi, 0.7); g.beginPath(); g.ellipse(-50, -206, 60, 8, -0.05, 0, TAU); g.fill();
      g.fillStyle = '#0c0d0e';
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 42, -192, 15, 8, s * 0.35, 0, TAU); g.fill(); }
      g.strokeStyle = rgba(LINE, 0.6); g.lineWidth = 1.5;
      for (const s of [-1, 1]) { polyline(g, [s * 70, -214, s * 100, -196, s * 128, -190]); g.stroke(); }
      // nostril flares + ridge plates down the snout
      for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 42, -192, 22, s > 0 ? Math.PI * 1.05 : -Math.PI * 0.05, s > 0 ? Math.PI * 1.75 : -Math.PI * 0.75, s < 0); g.stroke(); }
      for (const [y, w] of [[-226, 26], [-214, 20], [-204, 14]]) {
        g.fillStyle = rgba(stHi, 0.55); g.beginPath(); g.ellipse(0, y, w, 6, 0, Math.PI, TAU); g.fill();
        g.beginPath(); g.ellipse(0, y, w, 6, 0, Math.PI, TAU); g.stroke();
      }
      g.fillStyle = 'rgba(120,230,120,0.18)'; g.fillRect(-150, -176, 300, 8);
    });
    // cheek scales and the jaw line
    for (const s of [-1, 1]) {
      g.save(); g.scale(s, 1);
      g.strokeStyle = rgba(LINE, 0.55); g.lineWidth = 1.6;
      for (let r = 0; r < 5; r++) for (let k = 0; k < 2; k++) {
        const x = 168 + k * 18 + (r % 2) * 9, y = -186 + r * 22;
        g.beginPath(); g.arc(x, y, 9, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
      }
      g.lineWidth = 2.6 * LK; g.strokeStyle = LINE;
      g.beginPath(); g.moveTo(198, -128); g.quadraticCurveTo(170, -96, 176, -8); g.stroke();
      g.lineWidth = 1.6; g.strokeStyle = rgba(stHi, 0.7);
      g.beginPath(); g.moveTo(194, -122); g.quadraticCurveTo(168, -92, 172, -10); g.stroke();
      g.restore();
    }
    snowCap(g, -120, 120, (x) => -214 - 14 * Math.cos((x / 130) * 1.3), 7, 980, P, 1.6, 2);
    // ---- mouth interior with the iron portcullis
    const mouth = (g) => { g.beginPath(); g.moveTo(-150, -150); g.quadraticCurveTo(0, -176, 150, -150); g.lineTo(166, 2); g.lineTo(-166, 2); g.closePath(); };
    ink(g, mouth, '#0a0c0c', 3.5, (g) => {
      const gr = g.createRadialGradient(0, -40, 10, 0, -60, 190);
      gr.addColorStop(0, 'rgba(90,200,90,0.42)'); gr.addColorStop(0.5, 'rgba(40,110,50,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(-170, -180, 340, 190);
      // bars
      const iron = '#3b4044', ironHi = '#6c7479', ironSh = '#22262a';
      for (const y of [-128, -92, -56, -22]) {
        g.fillStyle = LINE; g.fillRect(-170, y - 4.5, 340, 9);
        g.fillStyle = iron; g.fillRect(-170, y - 3, 340, 6); g.fillStyle = ironHi; g.fillRect(-170, y - 3, 340, 1.6);
      }
      for (let x = -150; x <= 150; x += 25) {
        g.fillStyle = LINE; g.fillRect(x - 5, -180, 10, 168);
        g.fillStyle = iron; g.fillRect(x - 3.5, -180, 7, 166); g.fillStyle = ironHi; g.fillRect(x - 3.5, -180, 2, 166); g.fillStyle = ironSh; g.fillRect(x + 1.5, -180, 2, 166);
        poly(g, [x - 5, -14, x, 0, x + 5, -14]); g.fillStyle = LINE; g.fill();
        poly(g, [x - 3.5, -14, x, -3, x + 3.5, -14]); g.fillStyle = ironHi; g.fill();
        for (const y of [-128, -92, -56, -22]) { g.fillStyle = '#8b939a'; g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill(); }
      }
    });
    // upper fangs
    for (const s of [-1, 1]) {
      for (const [x, y0, l, w] of [[124, -152, 58, 24], [78, -164, 38, 18], [32, -170, 22, 12]]) {
        ink(g, (g) => { g.beginPath(); g.moveTo(s * (x - w / 2), y0 - 4); g.quadraticCurveTo(s * (x - w * 0.3), y0 + l * 0.6, s * (x + w * 0.1), y0 + l); g.quadraticCurveTo(s * (x + w * 0.4), y0 + l * 0.4, s * (x + w / 2), y0 - 4); g.closePath(); }, '#cfc9b8', 2.6, (g) => {
          g.fillStyle = '#9d9786'; g.fillRect(s > 0 ? x : x - w, y0 - 6, w, l + 10);
        });
      }
      // lower fangs rising from the jaw
      for (const [x, l, w] of [[140, 64, 26], [98, 34, 16]]) {
        ink(g, (g) => { g.beginPath(); g.moveTo(s * (x - w / 2), 4); g.quadraticCurveTo(s * (x - w * 0.4), -l * 0.6, s * (x - w * 0.05), -l); g.quadraticCurveTo(s * (x + w * 0.4), -l * 0.5, s * (x + w / 2), 4); g.closePath(); }, '#cfc9b8', 2.6, (g) => {
          g.fillStyle = '#9d9786'; g.fillRect(s > 0 ? x : x - w, -l - 4, w, l + 8);
        });
      }
    }
    // lower jaw lip / threshold steps
    ink(g, (g) => poly(g, [-176, 4, -170, -12, 170, -12, 176, 4]), stSh, 3, (g) => { g.fillStyle = stHi; g.fillRect(-176, -12, 352, 3); });
    // chains to the portcullis
    g.strokeStyle = '#2a2e31'; g.lineWidth = 3;
    for (const s of [-1, 1]) { g.setLineDash([5, 3]); polyline(g, [s * 140, -150, s * 176, -200]); g.stroke(); }
    g.setLineDash([]);
  }

  // ------------------------------------------------------------------ GROUND (floor + back boundary), world coords
  function drawGround(g, xa, xb) {
    // neighbouring floors overlap; the later one starts on a stepped, slanted edge of whole stones over the earlier
    if (xa < BR0 + 220) groundTrail(g, xa, Math.min(xb, BR0 + 220));
    if (xb > BR1 - 170 && xa < VIL1 + 250) groundVillage(g, Math.max(xa, BR1 - 170), Math.min(xb, VIL1 + 250));
    if (xb > BR0 - 80 && xa < BR1 + 130) groundBridge(g, Math.max(xa, BR0 - 80), Math.min(xb, BR1 + 130));
    if (xb > VIL1 - 90) groundGate(g, Math.max(xa, VIL1 - 90), xb);
    // seam dressing: soft snow patches along each boundary
    for (const sx of [BR0, BR1, VIL1]) if (sx > xa - 160 && sx < xb + 160) seamDrift(g, sx);
  }
  // chunk-safe snow along a ledge: lumps sit on a world-aligned grid, so neighbouring ground tiles match exactly
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
  const bankTop = (x) => 330 + 6 * Math.sin(x * 0.013) + 4 * Math.sin(x * 0.041 + 1) + 2.5 * Math.sin(x * 0.11);
  // trees/rocks behind the trail bank (for the long dawn shadows they cast onto the snow)
  const TRAIL_CASTERS = [[120, 1], [205, 0.8], [650, 0.9], [720, 0.7], [790, 1], [1135, 0.8], [1210, 1], [1450, 1.2]];
  function groundTrail(g, xa, xb) {
    const P = NP.trail;
    lineStyle('#3b3046', 0.62);
    const x0 = Math.floor(xa) - 2, x1 = Math.ceil(xb) + 2;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    // snow field
    let gr = g.createLinearGradient(0, 340, 0, H);
    gr.addColorStop(0, '#f2e2e3'); gr.addColorStop(0.45, '#ead8dc'); gr.addColorStop(1, '#dccfdc');
    g.fillStyle = gr; g.fillRect(x0, 340, x1 - x0, H - 340);
    // trodden path: warm packed snow, feathered edges
    const pTop = (x) => 380 + 5 * Math.sin(x * 0.009 + 1) + 3 * Math.sin(x * 0.031);
    const pBot = (x) => 498 + 6 * Math.sin(x * 0.007 + 2) + 3 * Math.sin(x * 0.027 + 1);
    for (const [grow, col] of [[14, 'rgba(214,190,186,0.3)'], [7, 'rgba(208,184,178,0.45)'], [0, '#d6bdb6']]) {
      g.beginPath(); g.moveTo(al(x0, 8) - 8, pTop(al(x0, 8) - 8) - grow);
      for (let x = al(x0, 8) - 8; x <= x1 + 8; x += 8) g.lineTo(x, pTop(x) - grow);
      for (let x = al(x1, 8) + 8; x >= x0 - 8; x -= 8) g.lineTo(x, pBot(x) + grow);
      g.closePath(); g.fillStyle = col; g.fill();
    }
    gr = g.createLinearGradient(0, 378, 0, 505);
    gr.addColorStop(0, 'rgba(240,218,206,0.5)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(150,132,168,0.16)');
    g.fillStyle = gr; g.fillRect(x0, 372, x1 - x0, 136);
    // warm sunlit patches + long cool shadows cast by the trees behind the bank
    for (let x = al(x0, 140) - 280; x < x1 + 140; x += 140) {
      const h = hash1(x * 7 + 2);
      g.fillStyle = 'rgba(255,226,196,0.22)';
      g.beginPath(); g.ellipse(x + h * 70, 410 + h * 70, 60 + h * 50, 7 + h * 5, 0, 0, TAU); g.fill();
    }
    for (const [cx, k] of TRAIL_CASTERS) {
      if (cx < x0 - 400 || cx > x1 + 100) continue;
      g.fillStyle = 'rgba(132,116,178,0.16)';
      g.beginPath(); g.moveTo(cx - 30 * k, 362); g.quadraticCurveTo(cx + 120 * k, 372, cx + 300 * k, 420 + 20 * k);
      g.quadraticCurveTo(cx + 200 * k, 440, cx + 40 * k, 400); g.quadraticCurveTo(cx - 20, 380, cx - 30 * k, 362); g.fill();
    }
    // soft ruts (wide, faint) + lighter ridges
    for (const [yc, a] of [[426, 0.24], [466, 0.22]]) {
      const ry = (x, dy) => yc + dy + 3 * Math.sin(x * 0.011 + yc) + 1.5 * Math.sin(x * 0.05);
      for (let cx = al(x0, 120) - 120; cx < x1 + 120; cx += 120) {
        const h = hash2(cx, yc);
        if (h < 0.3) continue;
        const xa = cx + h * 40, xb = cx + 120 - hash2(cx, yc + 1) * 40;
        for (const [dy, col, lw] of [[0, `rgba(158,128,142,${a})`, 6], [4.5, 'rgba(255,248,246,0.42)', 2]]) {
          g.beginPath(); for (let x = xa; x <= xb; x += 10) g.lineTo(x, ry(x, dy));
          g.strokeStyle = col; g.lineWidth = lw; g.stroke();
        }
      }
    }
    // packed-snow lumps and footprints
    for (let x = al(x0, 29) - 29; x < x1 + 29; x += 29) {
      const h = hash1(x * 3 + 17);
      if (h < 0.8) continue;
      const y = lerp(pTop(x) + 10, pBot(x) - 8, hash1(x * 5 + 1));
      g.fillStyle = 'rgba(150,130,165,0.18)'; g.beginPath(); g.ellipse(x + 1, y + 2, 7 + h * 6, 2.4, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,250,248,0.5)'; g.beginPath(); g.ellipse(x, y, 6 + h * 5, 2.2, 0, 0, TAU); g.fill();
    }
    for (let x = al(x0, 34); x < x1 + 34; x += 34) {
      const i = (x / 34) | 0;
      const y = 446 + 16 * Math.sin(x * 0.004) + (i % 2 ? 6 : -6);
      g.fillStyle = 'rgba(160,136,166,0.3)'; g.beginPath(); g.ellipse(x, y, 5, 2.6, 0.1, 0, TAU); g.fill();
      g.fillStyle = 'rgba(160,136,166,0.22)'; g.beginPath(); g.ellipse(x + 4, y + 0.5, 2.6, 2, 0, 0, TAU); g.fill();
    }
    // a few stones along the path edges
    for (let x = al(x0, 53); x < x1 + 53; x += 53) {
      const h = hash1(x * 11 + 5);
      if (h < 0.62) continue;
      const y = h < 0.82 ? pTop(x) - 4 + h * 6 : pBot(x) + 4 + h * 4;
      const w = 7 + h * 8;
      ink(g, (g) => { g.beginPath(); g.ellipse(x, y, w / 2, w / 3.4, 0, 0, TAU); }, '#ab9caa', 1.3, (g) => {
        g.fillStyle = '#8b7d93'; g.beginPath(); g.ellipse(x + w * 0.15, y + w * 0.1, w * 0.4, w * 0.2, 0, 0, TAU); g.fill();
        g.fillStyle = '#f6eef0'; g.beginPath(); g.ellipse(x - w * 0.1, y - w * 0.2, w * 0.3, w * 0.1, 0, 0, TAU); g.fill();
      });
    }
    // snow bank at the back with embedded rocks (bases hidden inside the bank)
    for (let x = al(x0, 150) - 150 + 40; x < x1 + 150; x += 150) {
      const h = hash1(x * 3 + 77);
      if (h < 0.3 || x + h * 60 > BR0 - 60) continue;
      g.save(); g.translate(x + h * 60, bankTop(x + h * 60) + 12); drawBoulder(g, 44 + h * 40, 30 + h * 26, (x * 7) | 0, P, 2.4, true); g.restore();
    }
    const bankBot = (x) => 364 + 3 * Math.sin(x * 0.07);
    g.beginPath(); g.moveTo(al(x0, 5) - 5, 372);
    for (let x = al(x0, 5) - 5; x <= x1 + 5; x += 5) g.lineTo(x, bankTop(x));
    for (let x = al(x1, 9) + 9; x >= x0 - 9; x -= 9) g.lineTo(x, bankBot(x));
    g.closePath();
    gr = g.createLinearGradient(0, 324, 0, 370);
    gr.addColorStop(0, '#fcf3f2'); gr.addColorStop(0.5, '#f0e3e8'); gr.addColorStop(1, '#c4b8d6');
    g.fillStyle = gr; g.fill();
    // lumps on the bank
    for (let x = al(x0, 41) - 41; x < x1 + 41; x += 41) {
      const h = hash1(x * 9 + 4);
      g.fillStyle = 'rgba(190,178,214,0.45)'; g.beginPath(); g.ellipse(x + 8, bankTop(x) + 16 + h * 6, 22 + h * 10, 4, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(x, bankTop(x) + 10 + h * 6, 18 + h * 10, 3.5, 0, 0, TAU); g.fill();
    }
    // bank lip line (the back limit) + soft shadow on the floor
    g.beginPath();
    for (let x = al(x0, 5) - 5; x <= x1 + 5; x += 5) g.lineTo(x, bankTop(x));
    g.lineWidth = 2.6 * LK; g.strokeStyle = LINE; g.stroke();
    g.beginPath();
    for (let x = al(x0, 9) - 9; x <= x1 + 9; x += 9) g.lineTo(x, bankBot(x));
    g.lineWidth = 1.4; g.strokeStyle = rgba('#8c7fa6', 0.7); g.stroke();
    gr = g.createLinearGradient(0, 364, 0, 382);
    gr.addColorStop(0, 'rgba(140,124,170,0.34)'); gr.addColorStop(1, 'rgba(140,124,170,0)');
    g.fillStyle = gr; g.fillRect(x0, 364, x1 - x0, 18);
    // dry grass poking through the bank
    g.strokeStyle = '#8f7d55'; g.lineWidth = 1.5;
    for (let x = al(x0, 23); x < x1; x += 23) {
      const h = hash1(x * 5 + 3);
      if (h < 0.5) continue;
      const y = bankTop(x) + 6 + h * 12;
      for (let k = 0; k < 3; k++) { polyline(g, [x + k * 3, y, x + k * 3 + (k - 1) * 4, y - 8 - h * 8]); g.stroke(); }
    }
    // front drift: one continuous wavy snow edge across the bottom
    const fTop = (x) => 520 + 6 * Math.sin(x * 0.013 + 2) + 4 * Math.sin(x * 0.037);
    g.beginPath(); g.moveTo(al(x0, 6) - 6, H + 4);
    for (let x = al(x0, 6) - 6; x <= x1 + 6; x += 6) g.lineTo(x, fTop(x));
    g.lineTo(x1 + 6, H + 4); g.closePath();
    gr = g.createLinearGradient(0, 512, 0, H);
    gr.addColorStop(0, '#fbf3f4'); gr.addColorStop(1, '#e6dbe6');
    g.fillStyle = gr; g.fill();
    g.beginPath();
    for (let x = al(x0, 6) - 6; x <= x1 + 6; x += 6) g.lineTo(x, fTop(x));
    g.lineWidth = 1.6; g.strokeStyle = rgba('#a89cc4', 0.8); g.stroke();
    g.restore();
  }
  // snow dressing for paved floors: a drift along the back edge, a strip along the bottom, sparse soft patches
  function floorSnow(g, x0, x1, P, seed, o = {}) {
    const sh = o.sh || P.snowSh;
    const bBot = (x) => 369 + 4 * Math.sin(x * 0.021 + seed) + 3 * Math.sin(x * 0.057) + 5 * hash2(x, seed);
    g.beginPath();
    for (let x = al(x0, 12) - 24; x <= x1 + 24; x += 12) g.lineTo(x, 360);
    for (let x = al(x1, 12) + 24; x >= x0 - 24; x -= 12) g.lineTo(x, bBot(x));
    g.closePath(); g.fillStyle = rgba(P.snow, o.backA ?? 0.9); g.fill();
    g.beginPath();
    for (let x = al(x0, 12) - 24; x <= x1 + 24; x += 12) g.lineTo(x, bBot(x) + 1);
    g.strokeStyle = rgba(sh, 0.55); g.lineWidth = 2; g.stroke();
    const fTop = (x) => 525 + 5 * Math.sin(x * 0.016 + seed) + 3 * Math.sin(x * 0.043 + 1) + 3 * hash2(x, seed + 9);
    g.beginPath(); g.moveTo(al(x0, 10) - 20, H + 4);
    for (let x = al(x0, 10) - 20; x <= x1 + 20; x += 10) g.lineTo(x, fTop(x));
    g.lineTo(al(x1, 10) + 20, H + 4); g.closePath();
    const gr = g.createLinearGradient(0, 518, 0, H);
    gr.addColorStop(0, rgba(P.snow, o.frontA ?? 0.95)); gr.addColorStop(1, rgba(mix(P.snow, sh, 0.35), o.frontA ?? 0.95));
    g.fillStyle = gr; g.fill();
    g.beginPath();
    for (let x = al(x0, 10) - 20; x <= x1 + 20; x += 10) g.lineTo(x, fTop(x));
    g.strokeStyle = rgba(sh, 0.75); g.lineWidth = 1.5; g.stroke();
    // sparse soft patches (low contrast so the band stays calm)
    for (let gx = al(x0, 110) - 220; gx < x1 + 220; gx += 110) {
      const h = hash2(gx, seed + 5);
      if (h < (o.patch ?? 0.6)) continue;
      const cx = gx + hash2(gx, seed + 6) * 70, cy = 392 + hash2(gx, seed + 7) * 110, rw = 18 + h * 30, rh = 3 + (cy - 362) * 0.03;
      const pts = [];
      for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU, r = 0.7 + 0.45 * hash2(gx + k, seed + 8); pts.push(cx + Math.cos(a) * rw * r, cy + Math.sin(a) * rh * r); }
      g.save(); g.translate(1.5, 1.5); blob(g, pts); g.fillStyle = rgba(sh, 0.3); g.fill(); g.restore();
      blob(g, pts); g.fillStyle = rgba(P.snow, o.patchA ?? 0.6); g.fill();
    }
  }
  function flagRows(y0, y1, hs) { const rows = []; let y = y0; for (const h of hs) { if (y >= y1) break; rows.push([y, Math.min(y1, y + h)]); y += h; } return rows; }
  // Paving that reads as a horizontal plane: constant stone width, row heights foreshortened toward the back.
  // Stone edges derive from (row, index) only, so every ground chunk renders identical stones (no tile seams).
  // o.lo / o.hi (row -> x): the paving only uses whole stones inside [lo, hi] (a stepped, joint-aligned edge), plus a
  // few loose stones (o.loose) scattered just outside it. Returns per-row extents [ya, yb, xs, xe] for clipping.
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
        if (o.snow && hash2(i * 5, r + 3) > 0.6) { g.fillStyle = rgba(P.snow, 0.8); g.beginPath(); g.ellipse(xb, yb - 0.5, rh * 0.9, 1.4 + rh * 0.05, 0, 0, TAU); g.fill(); }
      }
    }
    return ext;
  }
  // slanted, row-jittered boundary between two floor materials (oblique, so it reads as lying on the ground)
  const seamEdge = (X, r, ya, yb, seed) => X + 0.2 * ((ya + yb) / 2 - 362) + (hash2(r, seed) - 0.5) * 56;
  // clip to the paved area (per-row extents) plus everything above the floor
  function clipExt(g, ext, x0, x1) {
    g.beginPath(); g.rect(x0 - 2, GT0, x1 - x0 + 4, 362 - GT0);
    for (const [ya, yb, xs, xe] of ext) if (xe > xs) g.rect(xs, ya, xe - xs, yb - ya + (yb >= H ? 4 : 0));
    g.clip();
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function groundBridge(g, xa, xb) {
    const P = NP.bridge;
    lineStyle('#3c4150', 0.62);
    const x0 = Math.max(Math.floor(xa) - 2, BR0 - 80), x1 = Math.min(Math.ceil(xb) + 2, BR1 + 130);
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    const ext = drawPaving(g, x0, x1, flagRows(362, H, [12, 15, 18, 22, 27, 32, 38, 44]), P, 11, { w: 112, snow: true, jointMix: 0.5, vary: 0.4, loose: 0.45, min: BR0 - 78, max: BR1 + 128,
      lo: (r, ya, yb) => seamEdge(BR0 - 10, r, ya, yb, 901), hi: (r, ya, yb) => seamEdge(BR1 + 14, r, ya, yb, 902) });
    g.save(); clipExt(g, ext, x0, x1);
    // light: brighter worn lane down the middle, cooler toward the front
    let gr = g.createLinearGradient(0, 362, 0, H);
    gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.35, 'rgba(255,250,240,0.14)'); gr.addColorStop(0.62, 'rgba(255,250,240,0.1)'); gr.addColorStop(1, 'rgba(60,72,110,0.18)');
    g.fillStyle = gr; g.fillRect(x0, 362, x1 - x0, H - 362);
    floorSnow(g, x0, x1, P, 11, {});
    // morning sun from the back-left: posts and pillars throw long cool shadows across the deck
    for (const [px, w, len] of [[PIL_L, 30, 120], [1900, 16, 70], [2165, 16, 70], [2430, 16, 70], [2680, 16, 70], [PIL_R, 30, 120]]) {
      if (px + w + len < x0 || px - w > x1) continue;
      for (const [k, a] of [[1, 0.1], [0.75, 0.1]]) {
        g.fillStyle = `rgba(52,62,104,${a})`;
        poly(g, [px - w, 363, px + w, 363, px + w + len * 0.62 * k, 363 + len * 0.42 * k, px - w + len * 0.62 * k, 363 + len * 0.42 * k]); g.fill();
      }
    }
    g.restore();
    // back parapet: two block courses + coping with snow, straight between the bridge-head pillars
    const wx0 = Math.max(x0, BR0 - 14), wx1 = Math.min(x1, BR1 + 14);
    if (wx1 > wx0) {
    const x0 = wx0, x1 = wx1;
    const pTop = 316;
    g.fillStyle = P.stone; g.fillRect(x0, pTop, x1 - x0, 362 - pTop);
    for (let r = 0; r < 2; r++) {
      const ya = pTop + 12 + r * 17, yb = ya + 17;
      let x = Math.floor(x0 / 46) * 46 - (r ? 23 : 0) - 46, i = Math.floor(x / 46) + 500;
      while (x < x1 + 4) {
        const w = 36 + hash2(i, r + 3) * 22, h = hash2(i * 3, r);
        g.fillStyle = h < 0.3 ? P.stoneSh : h > 0.8 ? P.stoneHi : P.stone;
        g.fillRect(x + 1, ya + 1, w - 2, yb - ya - 2);
        g.fillStyle = rgba(P.stoneSh, 0.7); g.fillRect(x + 1, yb - 4, w - 2, 3);
        g.strokeStyle = P.joint; g.lineWidth = 1.4; g.strokeRect(x + 0.5, ya + 0.5, w - 1, yb - ya - 1);
        x += w; i++;
      }
    }
    // coping
    ink(g, (g) => poly(g, [x0 - 6, pTop + 13, x0 - 6, pTop - 2, x1 + 6, pTop - 2, x1 + 6, pTop + 13]), P.stoneHi, 2.6, (g) => {
      g.fillStyle = P.stone; g.fillRect(x0 - 6, pTop + 4, x1 - x0 + 12, 10);
      g.strokeStyle = P.joint; g.lineWidth = 1.3;
      for (let x = Math.floor(x0 / 70) * 70; x < x1; x += 70) { polyline(g, [x, pTop - 2, x, pTop + 13]); g.stroke(); }
    });
    // wall base outline + shadow on the deck
    strokeLine(g, [x0 - 6, 362, x1 + 6, 362], 2.4, LINE);
    gr = g.createLinearGradient(0, 362, 0, 380);
    gr.addColorStop(0, 'rgba(60,64,90,0.32)'); gr.addColorStop(1, 'rgba(60,64,90,0)');
    g.fillStyle = gr; g.fillRect(x0, 363, x1 - x0, 18);
    snowLedge(g, x0, x1, (x) => pTop - 2 - 2 * Math.sin(x * 0.05), 6, 503, P, 1.6);
    }
    g.restore();
  }
  const curbTop = 344;
  function groundVillage(g, xa, xb) {
    const P = NP.village;
    lineStyle('#35292d', 0.62);
    const x0 = Math.max(Math.floor(xa) - 2, BR1 - 170), x1 = Math.min(Math.ceil(xb) + 2, VIL1 + 250);
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    // cobbles
    const rows = flagRows(362, H, [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    g.fillStyle = '#6a625e'; g.fillRect(x0, 360, x1 - x0, H - 360);
    for (let r = 0; r < rows.length; r++) {
      const [ya, yb] = rows[r], rh = yb - ya, bw = 30;
      const off = hash1(r * 17 + 5) * bw;
      const edge = (i) => i * bw + off + (hash2(i, r * 11 + 70) - 0.5) * bw * 0.5;
      for (let i = Math.floor((x0 - off) / bw) - 2; ; i++) {
        const xa = edge(i), xb = edge(i + 1);
        if (xa > x1 + 2) break;
        if (xb < x0 - 2) continue;
        const h = hash2(i * 3 + 7, r + 70), w = xb - xa;
        g.fillStyle = h < 0.3 ? '#827974' : h > 0.72 ? '#958c85' : '#8b827c';
        roundRect(g, xa + 1.4, ya + 1.1, w - 2.8, rh - 2.2, Math.min(w, rh) * 0.42); g.fill();
        g.fillStyle = 'rgba(184,176,168,0.22)'; g.beginPath(); g.ellipse(xa + w * 0.45, ya + rh * 0.34, w * 0.28, rh * 0.15, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(78,70,68,0.2)'; g.fillRect(xa + 3, yb - rh * 0.32, w - 6, rh * 0.16);
      }
    }
    // slush and snow patches (keep the middle calm: low-contrast tint)
    let gr = g.createLinearGradient(0, 362, 0, H);
    gr.addColorStop(0, 'rgba(225,230,238,0.12)'); gr.addColorStop(0.6, 'rgba(120,120,130,0.05)'); gr.addColorStop(1, 'rgba(60,60,80,0.18)');
    g.fillStyle = gr; g.fillRect(x0, 362, x1 - x0, H - 362);
    floorSnow(g, x0, x1, P, 23, { patch: 0.5, patchA: 0.5 });
    // fences in the gaps between houses (behind the curb)
    for (const [fa, fb] of [[3232, 3352], [3700, 3818], [4108, 4220], [4535, 4590]]) if (fb > x0 && fa < x1) drawFence(g, fa, fb, P);
    // curb (raised kerb stones) + gutter shadow = the back limit
    ink(g, (g) => poly(g, [x0 - 6, 364, x0 - 6, curbTop, x1 + 6, curbTop, x1 + 6, 364]), P.stone, 2.6, (g) => {
      g.fillStyle = P.stoneSh; g.fillRect(x0 - 6, 354, x1 - x0 + 12, 12);
      g.fillStyle = P.stoneHi; g.fillRect(x0 - 6, curbTop, x1 - x0 + 12, 3);
      g.strokeStyle = P.joint; g.lineWidth = 1.3;
      for (let x = Math.floor(x0 / 52) * 52; x < x1; x += 52) { polyline(g, [x, curbTop, x, 364]); g.stroke(); }
    });
    gr = g.createLinearGradient(0, 364, 0, 380);
    gr.addColorStop(0, 'rgba(40,36,50,0.38)'); gr.addColorStop(1, 'rgba(40,36,50,0)');
    g.fillStyle = gr; g.fillRect(x0, 364, x1 - x0, 16);
    snowLedge(g, x0, x1, (x) => curbTop - 1 - 2 * Math.sin(x * 0.04), 5, 501, P, 1.5);
    g.restore();
  }
  function drawFence(g, fa, fb, P) {
    for (let x = fa + 6; x < fb - 2; x += 15) {
      const h = 52 + hash1(x | 0) * 10;
      ink(g, (g) => poly(g, [x - 5, curbTop + 2, x - 5, curbTop - h + 6, x, curbTop - h, x + 5, curbTop - h + 6, x + 5, curbTop + 2]), '#6e5440', 2, (g) => { g.fillStyle = '#4e3a2c'; g.fillRect(x + 1, curbTop - h, 6, h + 4); });
      snowCap(g, x - 5, x + 5, () => curbTop - h + 4, 4, x | 0, P, 1.1, 1);
    }
    for (const y of [curbTop - 20, curbTop - 42]) ink(g, (g) => poly(g, [fa, y, fb, y, fb, y + 6, fa, y + 6]), '#7a5f48', 1.8);
    snowCap(g, fa, fb, () => curbTop - 42, 4, (fa * 3) | 0, P, 1.2, 1);
  }
  function groundGate(g, xa, xb) {
    const P = NP.gate;
    lineStyle('#141a1a', 0.7);
    const x0 = Math.max(Math.floor(xa) - 2, VIL1 - 90), x1 = Math.ceil(xb) + 2;
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    const F = { stone: '#545a5f', stoneSh: '#3d4247', stoneHi: '#717a7f', joint: '#24292c', snow: P.snow, snowSh: P.snowSh };
    const rowsG = flagRows(362, H, [16, 21, 27, 34, 42, 52, 62]);
    // threshold setts: dressed blocks of an in-between size, slightly warmer, stepping into the cobbles
    const T = { stone: '#77767a', stoneSh: '#57575c', stoneHi: '#97969a', joint: '#3a3739', snow: P.snow, snowSh: P.snowSh };
    const extT = drawPaving(g, x0, x1, rowsG, T, 37, { w: 52, snow: true, gap: 1.8, vary: 0.6, jointMix: 0.3, merge: 0, loose: 0.55, min: VIL1 - 88,
      lo: (r, ya, yb) => seamEdge(VIL1 - 30, r, ya, yb, 903), hi: (r, ya, yb) => seamEdge(VIL1 + 120, r, ya, yb, 904) });
    const ext = drawPaving(g, x0, x1, rowsG, F, 31, { w: 150, snow: true, gap: 2, vary: 0.5, jointMix: 0.4,
      lo: (r, ya, yb) => seamEdge(VIL1 + 60, r, ya, yb, 904) });
    for (let r = 0; r < ext.length; r++) ext[r][2] = Math.min(ext[r][2], extT[r][2]);
    g.save(); clipExt(g, ext, x0, x1);
    let gr = g.createLinearGradient(0, 362, 0, H);
    gr.addColorStop(0, 'rgba(200,210,215,0.05)'); gr.addColorStop(1, 'rgba(4,8,10,0.3)');
    g.fillStyle = gr; g.fillRect(x0, 362, x1 - x0, H - 362);
    // puddles reflecting the green fire
    for (let gx = al(x0, 170) - 340; gx < x1 + 340; gx += 170) {
      const h = hash2(gx, 77);
      if (h < 0.55) continue;
      const cx = gx + h * 80, cy = 410 + hash2(gx, 78) * 80, rw = 26 + h * 26, rh = 4 + (cy - 362) * 0.04;
      g.fillStyle = 'rgba(14,20,22,0.55)'; g.beginPath(); g.ellipse(cx, cy, rw, rh, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(140,230,140,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(cx - 3, cy - 1, rw * 0.6, rh * 0.4, 0, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
      g.strokeStyle = 'rgba(160,190,180,0.25)'; g.beginPath(); g.ellipse(cx, cy, rw, rh, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
    }
    // pools of green light from braziers and from the gate's mouth
    for (const [lx, r, a] of [[4870, 120, 0.13], [5280, 120, 0.13], [GATE_X - 268, 130, 0.15], [GATE_X + 268, 130, 0.15], [GATE_X, 230, 0.12]]) {
      if (lx + r < x0 || lx - r > x1) continue;
      g.save(); g.translate(lx, 376); g.scale(1, 0.24);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, `rgba(120,235,120,${a})`); rg.addColorStop(1, 'rgba(120,235,120,0)');
      g.fillStyle = rg; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
    }
    // arena: a soft, cooler lift of value in the centre so dark-armoured fighters separate from the slate
    if (x1 > GATE_X - 380 && x0 < GATE_X + 380) {
      g.save(); g.translate(GATE_X, 448); g.scale(1, 0.3);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 380);
      rg.addColorStop(0, 'rgba(182,202,214,0.3)'); rg.addColorStop(0.5, 'rgba(166,188,202,0.17)'); rg.addColorStop(1, 'rgba(150,175,190,0)');
      g.fillStyle = rg; g.fillRect(-380, -380, 760, 760); g.restore();
    }
    // arena inlay: a ring with a coiled dragon, carved shallow (low contrast)
    if (x1 > GATE_X - 300 && x0 < GATE_X + 300) {
      g.save(); g.translate(GATE_X, 446); g.scale(1, 0.26);
      g.strokeStyle = 'rgba(140,170,150,0.32)'; g.lineWidth = 9;
      g.beginPath(); g.arc(0, 0, 250, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(15,22,20,0.4)'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 238, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 262, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(140,170,150,0.22)'; g.lineWidth = 14;
      g.beginPath(); g.arc(0, 0, 160, 0.3, 5.3); g.stroke();
      g.beginPath(); g.arc(0, 0, 90, 3.5, 8.6); g.stroke();
      g.restore();
    }
    floorSnow(g, x0, x1, P, 41, { backA: 0.8, frontA: 0.85, patch: 0.55, patchA: 0.45 });
    g.restore();
    // courtyard balustrade (from the entrance obelisk to where the gate's rock begins)
    const wEnd = GATE_X - 470;
    if (x0 < wEnd + 10 && x1 > VIL1 - 14) {
      const wa = Math.max(x0 - 6, VIL1 - 14), wb = Math.min(x1 + 6, wEnd);
      const top = 312;
      ink(g, (g) => poly(g, [wa, 364, wa, top, wb, top, wb, 364]), P.stone, 2.8, (g) => {
        g.fillStyle = P.stoneSh; g.fillRect(wa, top + 14, wb - wa, 50);
        // balusters
        for (let x = Math.floor(wa / 22) * 22; x < wb; x += 22) {
          g.fillStyle = '#1b2020'; g.fillRect(x + 4, top + 16, 14, 30);
          g.fillStyle = P.stone; g.beginPath(); g.ellipse(x + 11, top + 31, 5, 14, 0, 0, TAU); g.fill();
          g.fillStyle = P.stoneHi; g.fillRect(x + 7, top + 22, 2, 16);
        }
        g.fillStyle = P.stone; g.fillRect(wa, top + 46, wb - wa, 20);
        g.fillStyle = P.stoneHi; g.fillRect(wa, top, wb - wa, 3);
        // pilasters
        for (let x = Math.floor((wa - 4720) / 160) * 160 + 4720; x < wb; x += 160) {
          g.fillStyle = P.stone; g.fillRect(x - 15, top - 2, 30, 66);
          g.fillStyle = P.stoneSh; g.fillRect(x + 4, top - 2, 11, 66);
          g.strokeStyle = LINE; g.lineWidth = 2 * LK; g.strokeRect(x - 15, top - 2, 30, 66);
        }
      });
      gr = g.createLinearGradient(0, 364, 0, 382);
      gr.addColorStop(0, 'rgba(0,8,6,0.45)'); gr.addColorStop(1, 'rgba(0,8,6,0)');
      g.fillStyle = gr; g.fillRect(wa, 364, wb - wa, 18);
      snowLedge(g, wa, wb, (x) => top - 1 - 1.5 * Math.sin(x * 0.05), 5, 507, P, 1.5);
    }
    // kerb line across the arena (in front of the gate)
    if (x1 > wEnd) {
      const ka = Math.max(x0 - 6, wEnd - 4), kb = x1 + 6;
      ink(g, (g) => poly(g, [ka, 366, ka, 352, kb, 352, kb, 366]), P.stoneSh, 2.6, (g) => { g.fillStyle = P.stoneHi; g.fillRect(ka, 352, kb - ka, 3); });
      gr = g.createLinearGradient(0, 366, 0, 382);
      gr.addColorStop(0, 'rgba(0,8,6,0.4)'); gr.addColorStop(1, 'rgba(0,8,6,0)');
      g.fillStyle = gr; g.fillRect(ka, 366, kb - ka, 16);
    }
    g.restore();
  }
  function seamDrift(g, sx) {
    const P = sx === BR0 ? NP.trail : sx === BR1 ? NP.village : NP.gate;
    const R = mulberry(sx);
    const big = sx === VIL1;   // the courtyard threshold is on a long-held arena screen: soften it the most
    const list = big ? [[378, 46, -70], [418, 38, 40], [452, 58, -20], [494, 42, 70], [528, 66, -60]] : [[378, 30, 0], [410, 22, 0], [446, 34, 0], [488, 26, 0], [528, 40, 0]];
    for (const [yc, w, dx] of list) {
      if (!big && R() < 0.3) continue;
      const cx = sx + dx + 0.2 * (yc - 362) + R.r(-26, 26), rh = 3 + (yc - 362) * 0.035;
      const pts = [];
      for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU, r = 0.7 + 0.45 * R(); pts.push(cx + Math.cos(a) * w * r, yc + Math.sin(a) * rh * r); }
      g.save(); g.translate(1.5, 2); blob(g, pts); g.fillStyle = rgba(P.snowSh, 0.4); g.fill(); g.restore();
      blob(g, pts); g.fillStyle = rgba(P.snow, 0.8); g.fill();
    }
  }

  // ------------------------------------------------------------------ foreground pass sprites
  function buildFront(cs) {
    const fr = [];
    lineStyle('#33374a', 0.8);   // foreground pieces sit in front of the actors: a little heavier
    // bridge front parapet (p 1.0), along the very bottom
    const parapet = buildStrip(BR0 - 6, BR1 + 6, 508, H, cs, 1, (g, xa, xb) => {
      const P = NP.bridge;
      const top = 518;
      ink(g, (g) => poly(g, [xa - 4, H + 4, xa - 4, top, xb + 4, top, xb + 4, H + 4]), P.stone, 2.6, (g) => {
        g.fillStyle = P.stoneHi; g.fillRect(xa - 4, top, xb - xa + 8, 7);
        g.fillStyle = P.stoneSh; g.fillRect(xa - 4, top + 10, xb - xa + 8, 30);
        g.strokeStyle = P.joint; g.lineWidth = 1.4;
        for (let x = Math.floor(xa / 64) * 64; x < xb; x += 64) { polyline(g, [x, top, x, H]); g.stroke(); }
        polyline(g, [xa, top + 8, xb, top + 8]); g.stroke();
      });
      snowLedge(g, xa, xb, (x) => top - 1 - 1.5 * Math.sin(x * 0.07), 5, 511, P, 1.4);
    });
    // end posts
    const endPost = makeSprite(70, 70, 35, 64, cs, (g) => {
      const P = NP.bridge;
      ink(g, (g) => poly(g, [-26, 8, -26, -40, 0, -54, 26, -40, 26, 8]), P.stone, 3, (g) => { g.fillStyle = P.stoneSh; g.fillRect(4, -60, 30, 70); });
      snowCap(g, -26, 26, (x) => -40 - (26 - Math.abs(x)) * 0.5, 6, 3, P, 1.5, 2);
    });
    // trail-end foreground pine (p 1.25)
    lineStyle('#14161c', 0.85);
    const fPine = makeSprite(260, 620, 130, 600, cs, (g) => {
      const P = { pine: '#24363a', pineSh: '#18262a', pineHi: '#3a5254', bark: '#3b2a26', barkSh: '#271b19', snow: '#e8dfe9', snowSh: '#8f8aae', snowHi: '#ffffff' };
      ink(g, (g) => poly(g, [-22, 20, -18, -600, 18, -600, 24, 20]), P.bark, 3.5, (g) => {
        g.fillStyle = P.barkSh; g.fillRect(4, -610, 24, 640);
        g.strokeStyle = P.barkSh; g.lineWidth = 2; for (let y = -560; y < 0; y += 34) { polyline(g, [-16, y, -6, y + 10]); g.stroke(); }
      });
      for (const [y, s, len] of [[-560, 1, 110], [-520, -1, 100], [-440, 1, 90], [-380, -1, 70]]) {
        g.save(); g.translate(0, y); g.scale(s, 1);
        const b = [0, -6, len * 0.5, -2, len, 18, len * 0.82, 26, len * 0.6, 18, len * 0.4, 28, len * 0.18, 16, 0, 12];
        ink(g, (g) => poly(g, b), P.pine, 3, (g) => { g.fillStyle = P.pineSh; g.fillRect(0, 8, len, 30); });
        snowCap(g, 4, len - 6, (x) => lerp(-8, 14, x / len), 8, (y * 3) | 0, P, 1.6, 2);
        g.restore();
      }
    });
    // village: hanging Dragon King banner from above (p 1.25)
    const fBanner = makeSprite(110, 220, 55, 10, cs, (g) => {
      ink(g, (g) => poly(g, [-48, -12, 48, -12, 48, 0, -48, 0]), '#2a2024', 3);
      drawKingBanner(g, -36, 0, 72, 186, 77, 3);
    });
    // village: icicled eave corner with a green lantern (p 1.25)
    const fEave = makeSprite(330, 170, 0, 0, cs, (g) => {
      const P = NP.village;
      ink(g, (g) => poly(g, [-20, -20, 300, -20, 300, 40, 220, 60, -20, 90]), '#3a2d2c', 3.5, (g) => { g.fillStyle = '#2a201f'; g.fillRect(-20, 30, 340, 80); });
      snowCap(g, -20, 300, (x) => lerp(-6, 30, x / 300) * 0 - 6 + (x > 220 ? (x - 220) * 0.1 : 0), 10, 5, P, 1.8, 0);
      for (let x = 10; x < 290; x += 17) { const y = lerp(90, 60, x / 220) - (x > 220 ? (x - 220) * 0.25 : 0); ink(g, (g) => poly(g, [x - 3, y - 2, x + 3, y - 2, x, y + 10 + (x * 7 % 13)]), '#dfe9f4', 1.2); }
      strokeLine(g, [150, 70, 150, 110], 2, '#1d1d20');
      ink(g, (g) => poly(g, [138, 110, 162, 110, 166, 140, 134, 140]), '#2c2d31', 2.4, (g) => { g.fillStyle = '#8ef07a'; g.fillRect(140, 116, 20, 18); });
    });
    // gate approach: broken column (p 1.25)
    const fColumn = makeSprite(70, 600, 35, 590, cs, (g) => {
      const P = NP.gate;
      lineStyle('#141a1a', 0.75);
      const st = '#5a6563', sh = '#434d4c', hi = '#7d8a86';
      ink(g, (g) => poly(g, [-19, 20, -19, -452, -9, -466, 2, -452, 8, -478, 19, -462, 19, 20]), st, 3, (g) => {
        g.fillStyle = sh; g.fillRect(5, -500, 20, 540);
        g.fillStyle = hi; g.fillRect(-19, -500, 4, 540);
        g.fillStyle = rgba('#8fd3a0', 0.45); g.fillRect(-19, -500, 1.6, 540);       // cold green rim from the gate
        g.strokeStyle = rgba('#1c2322', 0.8); g.lineWidth = 1.4;
        for (let y = -400; y < 0; y += 64) { polyline(g, [-19, y, 19, y]); g.stroke(); }
        for (const [y, x] of [[-360, -6], [-232, 8], [-120, -10], [-40, 4]]) { polyline(g, [x, y, x + 4, y + 14, x + 1, y + 26]); g.stroke(); }
        g.fillStyle = rgba('#20282a', 0.35); for (let y = -430; y < 0; y += 32) g.fillRect(-12 + ((y * 7) & 15), y, 6, 2);
      });
      snowCap(g, -19, 19, (x) => (x < 2 ? -456 : -466), 7, 8, P, 1.5, 2);
    });
    for (const [spr, a] of [[fPine, 0.28], [fBanner, 0.2], [fEave, 0.3], [fColumn, 0.1]]) {
      const g = spr.c.getContext('2d');
      if (!g) continue;                    // (a sprite the memory cap left empty)
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(16,10,24,${a})`; g.fillRect(0, 0, spr.c.width, spr.c.height);
    }
    fr.push({ spr: fPine, wx: 1560, y: 560 }, { spr: fBanner, wx: 3000, y: -8 }, { spr: fEave, wx: 4120, y: 0 }, { spr: fColumn, wx: 5250, y: 560 });
    return { parapet, endPost, list: fr };
  }

  // ------------------------------------------------------------------ props & pickups (built at the full device scale)
  function buildItems(s) {
    const it = {};
    lineStyle(INK, 1);   // interactive things keep the actors' full ink
    for (const k of Object.keys(PROP_INFO)) {
      const info = PROP_INFO[k];
      const spr = makeSprite(info.w + 16, info.h + 16, info.w / 2 + 8, info.h + 8, s, (g) => PROP_DRAW[k](g));
      const white = makeSprite(info.w + 16, info.h + 16, info.w / 2 + 8, info.h + 8, s, (g) => {
        g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(spr.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, spr.c.width, spr.c.height);
      });
      it[k] = { spr, white };
    }
    for (const k of Object.keys(PICKUP_INFO)) {
      const info = PICKUP_INFO[k];
      it['p_' + k] = makeSprite(info.w + 12, info.h + 12, info.w / 2 + 6, info.h + 6, s, (g) => PICKUP_DRAW[k](g));
    }
    it.shine = radialSprite(16, s, [[0, 'rgba(255,255,255,0.9)'], [0.3, 'rgba(255,250,230,0.4)'], [1, 'rgba(255,250,230,0)']]);
    it.ember = radialSprite(24, s, [[0, 'rgba(255,190,90,0.7)'], [0.4, 'rgba(255,130,40,0.3)'], [1, 'rgba(255,100,20,0)']]);
    return it;
  }

  // ------------------------------------------------------------------ per-frame drawing
  function visibleRange(camX) { return [camX - 400, camX + W + 400]; }

  function drawBack(ctx, camX, t = 0) {
    if (!C) { released = false; setScale(S || 1); }
    camX = clamp(+camX || 0, 0, STAGE_LEN - W);
    ctx.save();
    const wt = palWeights(camX);
    // --- sky
    const sk = [0, 1, 2, 3].map((i) => {
      let r = 0, gg = 0, b = 0;
      for (const k of PAL_NAMES) if (wt[k]) { const c = rgb(SKY[k].s[i]); r += c[0] * wt[k]; gg += c[1] * wt[k]; b += c[2] * wt[k]; }
      if (warm > 0) { const k = warm * wt.storm * 0.55, c = rgb(SKY_WARM[i]); r += (c[0] - r) * k; gg += (c[1] - gg) * k; b += (c[2] - b) * k; }
      return `rgb(${r | 0},${gg | 0},${b | 0})`;
    });
    const gr = ctx.createLinearGradient(0, 0, 0, 380);
    gr.addColorStop(0, sk[0]); gr.addColorStop(0.42, sk[1]); gr.addColorStop(0.74, sk[2]); gr.addColorStop(1, sk[3]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 384);  // the ground tiles always cover y > 372
    // --- sun (dawn)
    const sunA = wt.dawn + wt.day * 0.35;
    if (sunA > 0.01) {
      ctx.globalAlpha = sunA;
      const sx = 470 - camX * P_FAR, sy = 196 - wt.day * 50;
      ctx.drawImage(C.sun.c, sx - 280, sy - 280, 560, 560);
      ctx.globalAlpha = 1;
    }
    // --- clouds
    for (const k of PAL_NAMES) {
      const a = wt[k];
      if (a < 0.01) continue;
      ctx.globalAlpha = k === 'storm' && warm > 0 ? a * (1 - 0.4 * warm) : a;
      for (const { cl, spr } of C.cloud[k]) {
        let x = (cl.x - camX * 0.05 - t * cl.sp) % CL_PERIOD;
        if (x < 0) x += CL_PERIOD;
        x -= 250;
        if (x - spr.ox > W || x - spr.ox + spr.w < 0) continue;
        ctx.drawImage(spr.c, snap(x - spr.ox), cl.y - spr.oy, spr.w, spr.h);
      }
    }
    ctx.globalAlpha = 1;
    // --- lightning (storm)
    const L = wt.storm > 0.05 && warm <= 0 ? lightning(t) : null;
    if (L) {
      const f = L.f * wt.storm;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(110,255,140,${0.16 * f})`; ctx.fillRect(0, 0, W, 380);
      if (L.f > 0.5) drawBolt(ctx, L.k, f);
      ctx.globalCompositeOperation = 'source-over';
    }
    // --- far peaks + dragons (scissored: right of coverX the gate cliff layer hides them completely)
    const coverX = Math.max(OBEL - camX, CLIFF_FULL - camX * P_CLIFF);
    if (coverX < W) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, Math.max(0, Math.ceil(coverX) + 1), H); ctx.clip(); }
    // same silhouettes in every palette: paint the first active palette opaque, fade the next one over it
    const act = PAL_NAMES.filter((k) => wt[k] > 0.03), wsum = act.reduce((a, k) => a + wt[k], 0);
    const pa = (i, k) => (i === 0 ? 1 : wt[k] / wsum);
    act.forEach((k, i) => drawStripA(ctx, C.far[k], camX, pa(i, k)));
    const dA = clamp(wt.dawn + wt.day - 0.1, 0, 1);
    if (dA > 0.01) drawDragons(ctx, camX, t, dA, wt);
    // --- mid ridges
    act.forEach((k, i) => { drawStripA(ctx, C.mid[k], camX, pa(i, k)); drawStripA(ctx, C.midTop[k], camX, pa(i, k)); });
    if (coverX < W) ctx.restore();
    // --- gorge (bridge only)
    {
      const a = Math.max(0, PIL_L - camX), b = Math.min(W, PIL_R - camX);
      if (b > a) {
        ctx.save(); ctx.beginPath(); ctx.rect(a, 0, b - a, 372); ctx.clip();
        drawStrip(ctx, C.gorge, camX);
        drawFalls(ctx, camX, t);
        ctx.restore();
      }
    }
    // --- cliffs (gate only)
    {
      const a = Math.max(0, OBEL - camX);
      if (a < W) {
        ctx.save(); ctx.beginPath(); ctx.rect(a, 0, W - a, 372); ctx.clip();
        drawStrip(ctx, C.cliff, camX);
        ctx.restore();
      }
    }
    // --- near back sprites + live bits behind the ground
    const [va, vb] = visibleRange(camX);
    drawSprites(ctx, C.near.back, camX);
    for (const l of C.near.liveBack) if (l.x1 > camX - 40 && l.x0 < camX + W + 40) l.draw(ctx, camX, t);
    // --- ground tiles
    drawStrip(ctx, C.ground, camX);
    // --- near front sprites + live
    drawSprites(ctx, C.near.front, camX);
    for (const l of C.near.liveFront) if (l.x1 > camX - 40 && l.x0 < camX + W + 40) l.draw(ctx, camX, t);
    void va; void vb;
    // --- lightning lights up the scene behind the actors
    if (L) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(140,255,160,${0.13 * L.f * wt.storm})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    // --- storm vignette
    // the curse lifting: warm light pools on the courtyard floor around the gate's fires
    if (warm > 0 && camX > 4300) {
      ctx.globalCompositeOperation = 'lighter';
      for (const lx of [4870, 5280, GATE_X - 268, GATE_X + 268]) {
        const x = lx - camX;
        if (x < -140 || x > W + 140) continue;
        ctx.globalAlpha = 0.5 * warm; ctx.drawImage(C.glowWarm.c, x - 130, 340, 260, 70);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    const vA = sstep(4300, 5440, camX) * 0.6 * (1 - 0.5 * warm);
    if (vA > 0.01) { ctx.globalAlpha = vA; ctx.drawImage((EDGEFIX ? C.vignetteEdge : C.vignette).c, 0, 0, W, H); ctx.globalAlpha = 1; }
    if (EDGEFIX && vA > 0.01) {
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = vA / 0.6; ctx.drawImage(C.edgeLight.c, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    // --- back snow layers
    drawSnow(ctx, camX, t, 0, 1);
    ctx.restore();
  }

  function drawFront(ctx, camX, t = 0) {
    if (!C) { released = false; setScale(S || 1); }
    camX = clamp(+camX || 0, 0, STAGE_LEN - W);
    ctx.save();
    // bridge front parapet + end posts
    if (camX + W > BR0 - 40 && camX < BR1 + 40) {
      drawStrip(ctx, C.front.parapet, camX);
      for (const x of [BR0 - 10, BR1 + 10]) {
        const sx = x - camX;
        if (sx > -60 && sx < W + 60) ctx.drawImage(C.front.endPost.c, snap(sx - C.front.endPost.ox), H - C.front.endPost.oy + 6, C.front.endPost.w, C.front.endPost.h);
      }
    }
    // occluders at parallax 1.25
    for (const o of C.front.list) {
      const sx = 480 + (o.wx - (camX + 480)) * P_FRONT;
      if (sx + o.spr.w < -20 || sx - o.spr.w > W + 20) continue;
      ctx.drawImage(o.spr.c, snap(sx - o.spr.ox), o.y - o.spr.oy, o.spr.w, o.spr.h);
    }
    // near snow
    drawSnow(ctx, camX, t, 2, 2);
    // lightning flash
    const st = palWeights(camX).storm;
    if (st > 0.05 && warm <= 0) {
      const L = lightning(t);
      if (L) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(150,255,170,${0.06 * L.f * st})`; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
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
    if (!st) return;
    ctx.globalAlpha = a; drawStrip(ctx, st, camX); ctx.globalAlpha = 1;
  }
  function drawSprites(ctx, list, camX) {
    for (const o of list) {
      const sx = o.x - camX;
      if (sx - o.spr.ox > W || sx - o.spr.ox + o.spr.w < 0) continue;
      ctx.drawImage(o.spr.c, snap(sx - o.spr.ox), o.y - o.spr.oy, o.spr.w, o.spr.h);
    }
  }
  function drawDragons(ctx, camX, t, a, wt) {
    const col = wt.dawn >= wt.day ? '#5a3a4e' : '#3d4a66';
    ctx.fillStyle = col;
    const cx = 560 - camX * P_FAR;
    if (cx < -300 || cx > W + 300) return;
    ctx.globalAlpha = a * (0.92 - 0.3 * wt.day);
    for (const d of LAY.dragons) {
      const ang = d.ph + t * d.sp;
      const x = cx + Math.cos(ang) * d.rx, y = d.cy + Math.sin(ang) * d.ry;
      const dir = -Math.sin(ang) * Math.sign(d.sp) >= 0 ? 1 : -1;
      const flap = Math.sin(t * d.fl + d.ph);
      dragonSil(ctx, x, y, d.s, flap, dir);
    }
    ctx.globalAlpha = 1;
  }
  function drawFalls(ctx, camX, t) {
    const off = camX * P_GORGE;
    for (const wf of GORGE_FALLS) {
      const x = wf.x - off;
      if (x < -40 || x > W + 40) continue;
      const y0 = gorgeTop(wf.x) - 2, y1 = 342;
      ctx.fillStyle = 'rgba(214,234,250,0.85)';
      ctx.beginPath(); ctx.moveTo(x - wf.w / 2, y0); ctx.lineTo(x + wf.w / 2, y0); ctx.lineTo(x + wf.w * 0.7, y1); ctx.lineTo(x - wf.w * 0.7, y1); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.clip();
      const tex = C.waterTex, th = tex.h;
      const sc = (t * 70) % th;
      for (let y = y0 - th + sc; y < y1; y += th) ctx.drawImage(tex.c, x - wf.w * 0.7, y, wf.w * 1.4, th);
      ctx.restore();
      // foam / spray at the base
      const p = 0.8 + 0.2 * Math.sin(t * 3 + wf.x);
      ctx.globalAlpha = 0.75;
      ctx.drawImage(C.mist.c, x - 40 * p, y1 - 30, 80 * p, 50);
      ctx.globalAlpha = 1;
    }
    // drifting mist puffs in the gorge
    for (let i = 0; i < 7; i++) {
      const x = ((i * 190 + t * (6 + i)) % 1300) - 170;
      const y = 316 + (i % 3) * 12;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(C.mist.c, x, y - 30, 260, 70);
    }
    ctx.globalAlpha = 1;
  }
  function drawSnow(ctx, camX, t, lmin, lmax) {
    const gate = sstep(4300, 5300, camX);
    const dens = 0.32 + 0.12 * sstep(2900, 3400, camX) + 0.3 * gate;   // heavier at the gate, but not a curtain
    const wind = 18 + 30 * gate, sizeK = 1 - 0.38 * gate;
    const par = [0.35, 0.8, 1.35];
    for (const f of LAY.flakes) {
      if (f.layer < lmin || f.layer > lmax || f.k > (f.layer === 2 ? dens * (1 - 0.45 * gate) : dens)) continue;
      let x = f.x - camX * par[f.layer] + t * wind * (0.6 + f.layer * 0.4) + Math.sin(t * f.fr + f.ph) * f.sw;
      let y = f.y + t * f.sp;
      x = ((x % 1000) + 1000) % 1000 - 20;
      y = ((y % 580) + 580) % 580 - 20;
      const spr = C.flakes[f.layer], r = (spr.w / 2) * sizeK;
      ctx.globalAlpha = f.layer === 0 ? 0.7 : 0.9;
      ctx.drawImage(spr.c, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ props & pickups (public)
  function drawProp(ctx, kind, sx, sy, opts) {
    if (!C) { released = false; setScale(S || 1); }
    const it = C.items[kind];
    if (!it) return;
    const flash = (opts && opts.flash) || 0, shake = (opts && opts.shake) || 0;
    const dx = shake ? shake * Math.sin(performance.now() * 0.09) : 0;
    ctx.save();
    // contact shadow
    ctx.fillStyle = 'rgba(20,14,30,0.28)';
    ctx.beginPath(); ctx.ellipse(sx, sy, PROP_INFO[kind].w * 0.55, 6, 0, 0, TAU); ctx.fill();
    const s = it.spr;
    ctx.drawImage(s.c, sx + dx - s.ox, sy - s.oy, s.w, s.h);
    if (flash > 0) { ctx.globalAlpha = clamp(flash, 0, 1) * 0.7; ctx.drawImage(it.white.c, sx + dx - s.ox, sy - s.oy, s.w, s.h); }
    ctx.restore();
  }
  // (the pickups' own small sprites: every level draws them through the road -- which, released, must not rebuild for it)
  let PK = null, PKs = 0;
  function pickupItems() {
    const s = S || 1;
    if (PK && PKs === s) return PK;
    if (PK) freeCanvases(PK);
    const it = {};
    lineStyle(INK, 1);
    for (const k of Object.keys(PICKUP_INFO)) { const info = PICKUP_INFO[k]; it['p_' + k] = makeSprite(info.w + 12, info.h + 12, info.w / 2 + 6, info.h + 6, s, (g) => PICKUP_DRAW[k](g)); }
    it.shine = radialSprite(16, s, [[0, 'rgba(255,255,255,0.9)'], [0.3, 'rgba(255,250,230,0.4)'], [1, 'rgba(255,250,230,0)']]);
    it.ember = radialSprite(24, s, [[0, 'rgba(255,190,90,0.7)'], [0.4, 'rgba(255,130,40,0.3)'], [1, 'rgba(255,100,20,0)']]);
    PK = it; PKs = s;
    return PK;
  }
  function drawPickup(ctx, kind, sx, sy, t = 0) {
    const PI = pickupItems(), spr = PI['p_' + kind];
    if (!spr) return;
    const ph = sx * 0.013;
    const bob = Math.sin(t * 3.2 + ph) * 2.5 - 3;
    ctx.save();
    ctx.fillStyle = 'rgba(20,14,30,0.25)';
    ctx.beginPath(); ctx.ellipse(sx, sy, PICKUP_INFO[kind].w * 0.42 * (1 - bob * 0.02), 4, 0, 0, TAU); ctx.fill();
    if (kind === 'gem') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 5 + ph);
      ctx.drawImage(PI.ember.c, sx - 30, sy + bob - 44, 60, 60);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (kind === 'coin') {
      const k = Math.cos(t * 4 + ph), kx = Math.max(0.18, Math.abs(k));
      ctx.translate(sx, 0); ctx.scale(kx, 1); ctx.translate(-sx, 0);
    }
    ctx.drawImage(spr.c, sx - spr.ox, sy + bob - spr.oy, spr.w, spr.h);
    ctx.restore();
    // travelling glint
    const g = ((t * 0.6 + ph) % 2.2);
    if (g < 0.35) {
      const a = Math.sin((g / 0.35) * Math.PI);
      const it = PI.shine;
      ctx.save(); ctx.globalAlpha = a * 0.9; ctx.globalCompositeOperation = 'lighter';
      const info = PICKUP_INFO[kind];
      ctx.drawImage(it.c, sx - info.w * 0.25 - 10, sy + bob - info.h * 0.75 - 10, 20, 20);
      ctx.restore();
    }
    if (kind === 'pie') {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const f = (t * 0.5 + i * 0.5 + ph) % 1;
        ctx.globalAlpha = Math.sin(f * Math.PI) * 0.8;
        const x = sx - 5 + i * 10, y = sy + bob - 22 - f * 16;
        ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.quadraticCurveTo(x + 4, y + 4, x, y); ctx.quadraticCurveTo(x - 4, y - 4, x, y - 8); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function info() {
    let px = 0, n = 0;
    const add = (c) => { px += c.width * c.height; n++; };
    const strips = [...Object.values(C.far), ...Object.values(C.mid), C.gorge, C.cliff, C.ground, C.front.parapet];
    for (const s of strips) for (const ch of s.chunks) if (ch.c) add(ch.c);
    for (const l of [C.near.back, C.near.front]) { const seen = new Set(); for (const o of l) if (!seen.has(o.spr.c)) { seen.add(o.spr.c); add(o.spr.c); } }
    return { canvases: n, megapixels: +(px / 1e6).toFixed(1), approxMB: +((px * 4) / 1048576).toFixed(0), buildMs: +C.buildMs.toFixed(0), cs: C.cs };
  }

  /** free the caches now (iOS: the canvas memory cap counts them until they shrink); the next draw rebuilds them */
  function release() { if (C) freeCanvases(C); C = null; released = true; }
  return { setScale, setWarm, drawBack, drawFront, drawProp, drawPickup, info, release };
}

// waterfalls in the gorge layer (layer x) and the gorge's far rim
const gorgeTop = (x) => 214 + 18 * Math.sin(x * 0.0093 + 0.6) + 10 * Math.sin(x * 0.031 + 2) + 5 * Math.sin(x * 0.083);
const GORGE_FALLS = [{ x: 1150, w: 18 }, { x: 1520, w: 30 }, { x: 1890, w: 14 }];

// lightning schedule: returns null or { f: 0..1 intensity, k: strike index } -- one soft pulse (the all-books flash pass, 2026-10-25:
// the old strike -- full for 4 frames, off, 0.85 again -- lit 44 % of the Dragon Road's dark gate in a frame and darkened 30 % in the
// next, twice a strike; as Book 2's storms: in over 0.15 s, out over 0.55 s, a 0.75 peak; the bolt draws over its top)
function lightning(t) {
  const period = 5.2;
  const k = Math.floor(t / period);
  const start = k * period + hash1(k * 7 + 3) * 2.6;
  const dt = t - start;
  if (dt < 0 || dt > 0.7) return null;
  const f = 0.75 * (dt < 0.15 ? dt / 0.15 : Math.max(0, 1 - (dt - 0.15) / 0.55));
  return { f, k };
}
function drawBolt(ctx, k, f) {
  const R = mulberry(k * 131 + 7);
  let x = R.r(120, 840), y = 10;
  const pts = [x, y];
  while (y < 230) { x += R.r(-26, 26); y += R.r(14, 30); pts.push(x, y); }
  for (const [lw, col] of [[9, `rgba(90,255,120,${0.25 * f})`], [3.5, `rgba(170,255,180,${0.7 * f})`], [1.5, `rgba(240,255,240,${f})`]]) {
    polyline(ctx, pts); ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.stroke();
  }
  // branch
  const i = 2 + Math.floor(R() * 3) * 2;
  if (i < pts.length - 2) {
    let bx = pts[i], by = pts[i + 1];
    const br = [bx, by];
    for (let j = 0; j < 4; j++) { bx += R.r(10, 30) * (R() < 0.5 ? -1 : 1); by += R.r(10, 22); br.push(bx, by); }
    polyline(ctx, br); ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(200,255,200,${0.7 * f})`; ctx.stroke();
  }
}
// tiny dragon silhouette (faces +x when dir = 1)
function dragonSil(ctx, x, y, s, flap, dir) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir * s, s);
  // body: horned head, curved neck, body, long tail ending in a spade
  ctx.beginPath();
  ctx.moveTo(15, -5); ctx.lineTo(11, -7.5); ctx.lineTo(10, -10); ctx.lineTo(8.5, -7.2);
  ctx.quadraticCurveTo(5, -6, 3, -2.5); ctx.quadraticCurveTo(-3, -1.5, -9, 0.5);
  ctx.quadraticCurveTo(-16, 3, -22, 1); ctx.lineTo(-27, -1.5); ctx.lineTo(-25, 2); ctx.lineTo(-28, 4); ctx.lineTo(-22, 3.4);
  ctx.quadraticCurveTo(-15, 5.5, -8, 3.4); ctx.quadraticCurveTo(-1, 2.4, 4, 0.6);
  ctx.quadraticCurveTo(8, -2.5, 11, -3.4); ctx.lineTo(15, -3.6);
  ctx.closePath(); ctx.fill();
  // bat wings with scalloped membranes (far wing smaller); flap: -1 (down) .. 1 (up)
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
// PROPS
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 64, h: 60, colors: ['#a8743f', '#7a4f2a', '#d29a5c', '#4a4448'] },
  barrel: { w: 52, h: 66, colors: ['#93603a', '#653f22', '#bb8350', '#5b5a62'] },
  urn:    { w: 46, h: 58, colors: ['#b5603e', '#83402a', '#e0b24a', '#efe6d8'] },
};
const SNOWP = { snow: '#f6f8fb', snowSh: '#b6c2d6' };
const PROP_DRAW = {
  crate(g) {
    const wood = '#a8743f', woodSh = '#7a4f2a', woodHi = '#d29a5c', woodDk = '#5c3a20', iron = '#4a4448';
    const FL = -30, FR = 26, TOPY = -48, dx = 6, dy = -10;
    // right side
    ink(g, (g) => poly(g, [FR, 0, FR + dx, dy, FR + dx, TOPY + dy, FR, TOPY]), woodSh, 2.6, (g) => { g.strokeStyle = woodDk; g.lineWidth = 1.2; for (const y of [-16, -32]) { polyline(g, [FR, y, FR + dx, y + dy]); g.stroke(); } });
    // top
    ink(g, (g) => poly(g, [FL, TOPY, FR, TOPY, FR + dx, TOPY + dy, FL + dx, TOPY + dy]), woodHi, 2.6, (g) => { g.strokeStyle = wood; g.lineWidth = 1.2; for (const f of [0.33, 0.66]) { polyline(g, [FL + dx * f, TOPY + dy * f, FR + dx * f, TOPY + dy * f]); g.stroke(); } });
    // front
    ink(g, (g) => poly(g, [FL, 0, FL, TOPY, FR, TOPY, FR, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4;
      for (const y of [-16, -32]) { polyline(g, [FL, y, FR, y]); g.stroke(); }
      // frame boards
      g.fillStyle = woodSh;
      g.fillRect(FL, TOPY, 6, 48); g.fillRect(FR - 6, TOPY, 6, 48); g.fillRect(FL, TOPY, FR - FL, 5); g.fillRect(FL, -5, FR - FL, 5);
      g.strokeStyle = woodDk; g.strokeRect(FL + 6, TOPY + 5, FR - FL - 12, 38);
      // diagonal brace
      g.lineWidth = 7; g.strokeStyle = woodDk; polyline(g, [FL + 7, -7, FR - 7, TOPY + 7]); g.stroke();
      g.lineWidth = 5; g.strokeStyle = woodHi; polyline(g, [FL + 7, -7, FR - 7, TOPY + 7]); g.stroke();
      // iron corners + rivets
      g.fillStyle = iron;
      for (const [x, y] of [[FL, TOPY], [FR - 9, TOPY], [FL, -9], [FR - 9, -9]]) g.fillRect(x, y, 9, 9);
      g.fillStyle = '#8a8690'; for (const [x, y] of [[FL + 4, TOPY + 4], [FR - 5, TOPY + 4], [FL + 4, -5], [FR - 5, -5]]) g.fillRect(x - 1, y - 1, 2, 2);
    });
    // light snow dusting on the lid
    ink(g, (g) => blob(g, [FL + 4, TOPY - 1, FL + 16, TOPY - 6, FR - 4, TOPY - 8, FR + 4, TOPY - 8, FR - 2, TOPY - 3, FL + 20, TOPY + 1]), SNOWP.snow, 1.2);
  },
  barrel(g) {
    const wood = '#93603a', woodSh = '#653f22', woodHi = '#bb8350', iron = '#5b5a62', ironHi = '#8d8c96';
    const body = (g) => { g.beginPath(); g.moveTo(-20, -58); g.quadraticCurveTo(-29, -29, -20, 0); g.ellipse(0, 0, 20, 5, 0, Math.PI, 0, true); g.quadraticCurveTo(29, -29, 20, -58); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(8, -66, 30, 72);
      g.fillStyle = woodHi; g.fillRect(-20, -60, 6, 64);
      g.strokeStyle = woodSh; g.lineWidth = 1.3;
      for (const k of [-0.55, -0.15, 0.25, 0.62]) { g.beginPath(); g.moveTo(k * 20, -58); g.quadraticCurveTo(k * 29, -29, k * 20, 4); g.stroke(); }
      for (const y of [-49, -11]) {
        g.fillStyle = INK; g.fillRect(-30, y - 4.5, 60, 9);
        g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6);
        g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.5);
      }
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -58, 20, 6, 0, 0, TAU); }, woodHi, 2.4, (g) => { g.strokeStyle = woodSh; g.lineWidth = 1.1; for (const x of [-8, 0, 8]) { polyline(g, [x, -64, x, -52]); g.stroke(); } });
    ink(g, (g) => blob(g, [-14, -58, -6, -63, 6, -63, 14, -59, 4, -55, -8, -55]), SNOWP.snow, 1.1);
  },
  urn(g) {
    const clay = '#b5603e', claySh = '#83402a', clayHi = '#d98a62';
    const body = (g) => {
      g.beginPath(); g.moveTo(-11, 0); g.lineTo(-13, -5); g.quadraticCurveTo(-26, -18, -21, -34); g.quadraticCurveTo(-17, -44, -9, -47);
      g.lineTo(-9, -52); g.lineTo(-13, -56); g.lineTo(13, -56); g.lineTo(9, -52); g.lineTo(9, -47);
      g.quadraticCurveTo(17, -44, 21, -34); g.quadraticCurveTo(26, -18, 13, -5); g.lineTo(11, 0); g.closePath();
    };
    // handles
    for (const s of [-1, 1]) { g.lineWidth = 6.5; g.strokeStyle = INK; g.beginPath(); g.moveTo(s * 9, -46); g.quadraticCurveTo(s * 24, -50, s * 18, -36); g.stroke(); g.lineWidth = 3.5; g.strokeStyle = clay; g.stroke(); }
    ink(g, body, clay, 2.6, (g) => {
      g.fillStyle = claySh; g.beginPath(); g.ellipse(12, -24, 14, 30, 0, 0, TAU); g.fill();
      g.fillStyle = clayHi; g.beginPath(); g.ellipse(-12, -30, 4, 9, 0.3, 0, TAU); g.fill();
      // gold band with clan zig-zag
      g.fillStyle = INK; g.fillRect(-30, -37, 60, 12);
      g.fillStyle = CLAN.gold; g.fillRect(-30, -35.5, 60, 9);
      g.strokeStyle = CLAN.red; g.lineWidth = 1.6; polyline(g, [-24, -27.5, -18, -34, -12, -27.5, -6, -34, 0, -27.5, 6, -34, 12, -27.5, 18, -34, 24, -27.5]); g.stroke();
      g.fillStyle = INK; g.fillRect(-30, -12, 60, 2);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -56, 13, 3.5, 0, 0, TAU); }, '#3a2420', 1.8);
    ink(g, (g) => blob(g, [-12, -57, -4, -59, 6, -59, 12, -57, 4, -55, -6, -55]), SNOWP.snow, 1);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// PICKUPS
// ---------------------------------------------------------------------------------------------------------------
export const PICKUP_INFO = {
  apple:     { w: 24, h: 26 },
  drumstick: { w: 34, h: 24 },
  pie:       { w: 34, h: 22 },
  coin:      { w: 22, h: 22 },
  gem:       { w: 24, h: 28 },
  oneup:     { w: 34, h: 30 },
};
const PICKUP_DRAW = {
  apple(g) {
    ink(g, (g) => { g.beginPath(); g.moveTo(0, -18); g.bezierCurveTo(6, -24, 14, -20, 12, -10); g.bezierCurveTo(11, -2, 5, 1, 0, -1); g.bezierCurveTo(-5, 1, -11, -2, -12, -10); g.bezierCurveTo(-14, -20, -6, -24, 0, -18); g.closePath(); }, '#d93a2e', 2.2, (g) => {
      g.fillStyle = '#a02320'; g.beginPath(); g.ellipse(6, -6, 9, 10, 0, 0, TAU); g.fill();
      g.fillStyle = '#ff7a5c'; g.beginPath(); g.ellipse(-6, -14, 3, 4.5, 0.4, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(-6.5, -15, 1.3, 2.2, 0.4, 0, TAU); g.fill();
    });
    strokeLine(g, [0, -18, 1, -24], 2.4, INK); strokeLine(g, [0, -18, 1, -24], 1.2, '#6b4426');
    ink(g, (g) => { g.beginPath(); g.moveTo(1, -22); g.quadraticCurveTo(7, -28, 11, -24); g.quadraticCurveTo(6, -20, 1, -22); g.closePath(); }, '#5fa83e', 1.4);
  },
  drumstick(g) {
    // bone (upper right) + glazed meat (lower left)
    ink(g, (g) => { g.beginPath(); g.moveTo(2, -12); g.lineTo(10, -18); g.arc(13, -19, 3.6, Math.PI * 0.8, Math.PI * 2.1); g.arc(15, -14, 3.6, Math.PI * 1.5, Math.PI * 0.6); g.lineTo(6, -6); g.closePath(); }, '#f4ecd8', 1.8, (g) => { g.fillStyle = '#d6cbb2'; g.fillRect(6, -14, 14, 8); });
    ink(g, (g) => { g.beginPath(); g.moveTo(6, -6); g.bezierCurveTo(4, 2, -10, 3, -15, -3); g.bezierCurveTo(-19, -9, -14, -19, -4, -19); g.bezierCurveTo(2, -18, 4, -14, 4, -11); g.closePath(); }, '#c26a2c', 2.2, (g) => {
      g.fillStyle = '#8a4119'; g.beginPath(); g.ellipse(-2, -2, 13, 6, -0.3, 0, TAU); g.fill();
      g.fillStyle = '#e89a52'; g.beginPath(); g.ellipse(-8, -13, 6, 3, -0.4, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,240,210,0.9)'; g.beginPath(); g.ellipse(-9, -14, 2.4, 1.2, -0.4, 0, TAU); g.fill();
    });
  },
  pie(g) {
    ink(g, (g) => { g.beginPath(); g.moveTo(-17, -6); g.lineTo(17, -6); g.lineTo(13, 0); g.lineTo(-13, 0); g.closePath(); }, '#b9b4ac', 2, (g) => { g.fillStyle = '#8f8a83'; g.fillRect(0, -6, 18, 7); });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -9, 16, 7, 0, 0, TAU); }, '#e3a64c', 2.2, (g) => {
      g.fillStyle = '#a8283a'; g.beginPath(); g.ellipse(0, -10, 12, 4.6, 0, 0, TAU); g.fill();
      g.strokeStyle = '#f3c674'; g.lineWidth = 2.2;
      for (const x of [-7, 0, 7]) { polyline(g, [x - 2, -14, x + 2, -5.5]); g.stroke(); }
      for (const y of [-12, -8]) { polyline(g, [-11, y, 11, y]); g.stroke(); }
      g.fillStyle = '#b97a2e'; g.beginPath(); g.ellipse(0, -5, 15, 2.4, 0, 0, Math.PI); g.fill();
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -9, 16, 7, 0, 0, TAU); }, null, 0);
    g.strokeStyle = '#c98b3a'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, -9, 14.5, 5.8, 0, 0, TAU); g.stroke();
  },
  coin(g) {
    ink(g, (g) => { g.beginPath(); g.arc(0, -11, 10, 0, TAU); }, '#f2c440', 2.2, (g) => {
      g.fillStyle = '#c9952c'; g.beginPath(); g.arc(3, -8, 9, 0, TAU); g.fill();
      g.fillStyle = '#f2c440'; g.beginPath(); g.arc(-0.5, -11.5, 7, 0, TAU); g.fill();
      g.strokeStyle = '#a87422'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, -11, 7, 0, TAU); g.stroke();
      // tiny dragon head stamp
      g.fillStyle = '#b5821f'; poly(g, [-4, -10, 0, -15, 4, -13, 3, -11, 5, -9, 0, -8, -2, -6]); g.fill();
      g.fillStyle = '#fff7cc'; g.beginPath(); g.ellipse(-4, -15, 2, 1.2, -0.6, 0, TAU); g.fill();
    });
  },
  gem(g) {
    const pts = [0, -26, 9, -18, 10, -7, 0, 0, -10, -7, -9, -18];
    ink(g, (g) => poly(g, pts), '#ff8a2a', 2.2, (g) => {
      g.fillStyle = '#c4501a'; poly(g, [0, -26, 9, -18, 10, -7, 0, 0, 2, -12]); g.fill();
      g.fillStyle = '#ffd36a'; poly(g, [-9, -18, 0, -26, 2, -12, -4, -10]); g.fill();
      g.fillStyle = '#fff4c0'; poly(g, [-6, -18, -1, -22, -2, -15]); g.fill();
      // molten cracks like Dodongo's arm
      g.strokeStyle = '#ffe680'; g.lineWidth = 1.1; polyline(g, [2, -12, 5, -8, 3, -4]); g.stroke(); polyline(g, [2, -12, 7, -15]); g.stroke();
      g.strokeStyle = 'rgba(70,20,10,0.6)'; g.lineWidth = 1; polyline(g, [0, -26, 2, -12, 0, 0]); g.stroke(); polyline(g, [-10, -7, 2, -12, 10, -7]); g.stroke();
    });
  },
  oneup(g) {
    // gingerbread chibi dragon: big horned head, bat wing, spade tail; one union outline, white icing, red heart
    const cookie = '#c98a4b', dark = '#a3672f', hi = '#e6b274', icing = '#fffaf2';
    g.save(); g.scale(0.9, 0.9);
    const shapes = [
      (g) => poly(g, [-3, -12, -8, -27, -10.5, -21.5, -15.5, -22, -13.5, -16.5, -18, -14, -8, -8]),                          // wing
      (g) => { g.beginPath(); g.moveTo(-7, -6); g.quadraticCurveTo(-15, -1, -15.5, -7); g.lineTo(-19, -9); g.lineTo(-15, -12); g.lineTo(-13, -8); g.quadraticCurveTo(-13, -3.5, -6, -2.5); g.closePath(); }, // tail
      (g) => { g.beginPath(); g.ellipse(-1, -8.5, 9.5, 8.5, 0, 0, TAU); },                                                     // body
      (g) => { g.beginPath(); g.ellipse(-4.5, -1.2, 3.6, 2.4, 0, 0, TAU); },                                                    // feet
      (g) => { g.beginPath(); g.ellipse(4, -1.2, 3.6, 2.4, 0, 0, TAU); },
      (g) => poly(g, [2.5, -23.5, -2, -31, 6, -25.5]),                                                                          // horns
      (g) => poly(g, [7, -25, 6, -32, 11, -24]),
      (g) => { g.beginPath(); g.ellipse(6.5, -19, 7.6, 7, 0, 0, TAU); },                                                       // head
      (g) => { g.beginPath(); g.ellipse(13, -17.2, 4.8, 3.8, -0.1, 0, TAU); },                                                 // snout
    ];
    g.lineJoin = 'round';
    g.save(); g.translate(0.6, 0.9); for (const sh of shapes) { sh(g); g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); } g.restore();
    for (const sh of shapes) { sh(g); g.lineWidth = 4.2; g.strokeStyle = INK; g.stroke(); }
    for (const sh of shapes) { sh(g); g.fillStyle = cookie; g.fill(); }
    // baked shading
    g.fillStyle = dark;
    g.beginPath(); g.ellipse(2.5, -4.5, 7, 4.5, -0.3, 0, TAU); g.fill();
    poly(g, [-8, -21, -10.5, -21.5, -15.5, -22, -13.5, -16.5, -18, -14, -9, -10]); g.fill();
    g.fillStyle = hi;
    g.beginPath(); g.ellipse(3.5, -22.5, 3.2, 1.8, -0.3, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(-4.5, -12, 2.6, 3.6, 0.4, 0, TAU); g.fill();
    // icing
    g.strokeStyle = icing; g.lineWidth = 1.3; g.lineCap = 'round';
    polyline(g, [-3.5, -12.5, -8, -24.5]); g.stroke(); polyline(g, [-5, -11.5, -12.5, -19.5]); g.stroke(); polyline(g, [-6.5, -10, -15, -15]); g.stroke();
    g.setLineDash([2.2, 1.8]); g.beginPath(); g.ellipse(-1, -8.5, 7.2, 6.3, 0, Math.PI * 0.15, Math.PI * 1.05); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(11.5, -15.2); g.quadraticCurveTo(14.2, -13.6, 16.8, -15.6); g.stroke();
    g.fillStyle = icing; g.beginPath(); g.arc(8.8, -21, 2.1, 0, TAU); g.fill();
    g.fillStyle = INK; g.beginPath(); g.arc(9.4, -21, 1, 0, TAU); g.fill();
    g.beginPath(); g.arc(16.2, -18.6, 0.7, 0, TAU); g.fill();
    // red icing heart on the belly
    g.fillStyle = '#e8384a'; g.beginPath(); g.moveTo(0, -3.5); g.bezierCurveTo(-5.5, -7, -2.8, -11.8, 0, -9.2); g.bezierCurveTo(2.8, -11.8, 5.5, -7, 0, -3.5); g.fill();
    g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    for (const [x, y, c] of [[-14.5, -6, '#6ec0ff'], [5, -11, '#ffd84a'], [-7, -15.5, '#7be05a'], [-2.5, -14.5, '#ff8ac0']]) { g.fillStyle = c; g.fillRect(x, y, 2.2, 1.3); }
    g.restore();
  },
};
