// Dodongo's Quest - Skull Island: THE MAP (src/stages/simap.js).  A painted vista of the island, code-drawn: a 3/4 view from the south
// over the sea (the book's island sheet), the horizon high under a stormy purple sky, Malachar's storm cloud swirling over the summit.
// The volcano is crowned by the book's skull fortress (black castle towers, a great skull with glowing purple eyes; the palace gate under
// its teeth is the palace spot), lava running down its west flank.  Round it, each spot reads by its silhouette alone: the Cave of Rage
// (west: a black crag with a fanged, lava-lit mouth, a lava stream steaming into the sea), the Swamp of Despair (south: a dark lagoon,
// gnarled leaning trees hung with moss, green mist), the Cell of Sloth (east: a grey sea cliff with a barred stone prison in it).
// Jungle with depth between them, a black-sand beach with foam and the book's brown boulders, turquoise shallows; trails from the
// landing beach.  A parchment chart frame with a compass rose goes round it.
// Used two ways: as the picture behind the map SCENE (src/simap.js: setMap(state) + drawBack + drawFront -- the cursor, the three wedges
// of the Sun Key, a name plate) and as a story panel's backdrop (src/sistory.js: drawBack only; bg.sel lights a node).
// Layers: the static VISTA (sky, sea, island) and the chart FRAME over it are cached once in one canvas (src/canvasmem.js); a painted
// version of the vista (the painted builder's paint-over of this art, PAINTED_URL) replaces the code vista inside that same canvas when it
// is there (no extra memory).  Live on top: sea glints, the storm's turning wisps and bolts (clipped to the sky: never over the fortress),
// the skull's eyes and the cave's lava breathing, the spots' glows, and the scene's UI.
import { W, H, INK } from '../config.js';
import { layerCanvas, freeCanvases } from '../canvasmem.js';
import { SI_NODES, SI_PALACE, SI_TREASURE } from '../simap.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function blobPath(g, p) {
  const n = p.length >> 1;
  g.moveTo((p[(n - 1) * 2] + p[0]) / 2, (p[(n - 1) * 2 + 1] + p[1]) / 2);
  for (let i = 0; i < n; i++) { const j = ((i + 1) % n) * 2; g.quadraticCurveTo(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[j]) / 2, (p[i * 2 + 1] + p[j + 1]) / 2); }
  g.closePath();
}
// the painted version of the vista (the painted builder's klein paint-over of paintVista: 1920x1080, no frame, no UI), relative to this
// module (null: the code vista only, no request made)
const PAINTED_URL = '../../assets/si/simap_painted.webp';   // (painted builder 2's klein paint-over, 2026-10-22: both critics' 'use painted')
function inside(poly, x, y) {   // (ray cast on a control polygon [x, y, x, y ...])
  let c = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const NODE_COL = { cave: '255,128,40', swamp: '130,255,120', cell: '180,200,255', palace: '214,120,255', treasure: '255,214,70' };

// ---------------------------------------------------------------------------------------------------------------
// DRAWING HELPERS (a subset of the stage toolkit: src/stages/frozen.js ...)
// ---------------------------------------------------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
function mulberry(seed) {
  let s = seed >>> 0;
  const f = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.r = (a, b) => a + (b - a) * f();
  return f;
}
function hash1(n) { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
const hash2 = (x, y) => hash1(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663));
function vnoise(x, s, seed) { const i = Math.floor(x / s), f = smooth(x / s - i); return lerp(hash2(i, seed), hash2(i + 1, seed), f) - 0.5; }
const _rgb = new Map();
function rgbOf(c) { let v = _rgb.get(c); if (!v) { const n = parseInt(c.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; _rgb.set(c, v); } return v; }
const hex2 = (v) => (v < 16 ? '0' : '') + v.toString(16);
function mix(a, b, t) { a = rgbOf(a); b = rgbOf(b); return '#' + hex2(Math.round(a[0] + (b[0] - a[0]) * t)) + hex2(Math.round(a[1] + (b[1] - a[1]) * t)) + hex2(Math.round(a[2] + (b[2] - a[2]) * t)); }
function rgba(c, a) { c = rgbOf(c); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function poly(g, p) { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); }
function polyline(g, p) { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); }
function blob(g, p) { g.beginPath(); blobPath(g, p); }
function curve(g, p) {
  const n = p.length >> 1;
  g.beginPath(); g.moveTo(p[0], p[1]);
  for (let i = 1; i < n - 1; i++) g.quadraticCurveTo(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[i * 2 + 2]) / 2, (p[i * 2 + 1] + p[i * 2 + 3]) / 2);
  g.lineTo(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
}
// the outline: tinted to its part's dark colour (the stages' scenery style), a heavier offset line on the lower right
let LINE = INK, LK = 1;
const lineStyle = (c, k) => { LINE = c; LK = k; };
function ink(g, build, fill, lw, inner, line = LINE) {
  lw *= LK;
  if (lw >= 1.8) { g.save(); g.translate(lw * 0.22, lw * 0.36); build(g); g.lineWidth = lw * 1.45; g.strokeStyle = line; g.stroke(); g.restore(); }
  build(g);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (inner) { g.save(); build(g); g.clip(); inner(g); g.restore(); }
  if (lw > 0) { build(g); g.lineWidth = lw; g.strokeStyle = line; g.stroke(); }
}
function vgrad(g, x, y0, w, y1, stops) { const gr = g.createLinearGradient(0, y0, 0, y1); for (const [o, c] of stops) gr.addColorStop(o, c); g.fillStyle = gr; g.fillRect(x, y0, w, y1 - y0); }
function lightPool(g, x, y, rx, ry, col, a) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.45, `rgba(${col},${a * 0.45})`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
}
// lumpy puffs inked as one silhouette: every circle stroked, then all filled over (only the outer edge keeps its line)
function puffInk(g, puffs, fill, lw, inner) {
  const shape = () => { g.beginPath(); for (const [px, py, pr] of puffs) { g.moveTo(px + pr, py); g.arc(px, py, pr, 0, TAU); } };
  lw *= LK;
  g.save(); g.translate(lw * 0.2, lw * 0.34); shape(); g.lineWidth = lw * 2.3; g.strokeStyle = LINE; g.stroke(); g.restore();
  shape(); g.lineWidth = lw * 2; g.strokeStyle = LINE; g.stroke();
  shape(); g.fillStyle = fill; g.fill();
  if (inner) { g.save(); shape(); g.clip(); inner(g); g.restore(); }
}

// ---------------------------------------------------------------------------------------------------------------
// THE LAYOUT (a 3/4 view from the south: the horizon high, the island's far shore behind the mountain)
// ---------------------------------------------------------------------------------------------------------------
const HORIZON = 140;
// the shoreline (control points of a smooth closed curve): coves and rocky headlands; the ship marker's spots stay in the sea
// (cave 144,352  swamp 348,434  palace 700,430  cell 842,374) and the Treasure Room's sandbar (124,176) too
const COAST = [176, 262, 160, 292, 170, 322, 196, 350, 232, 372, 262, 392, 284, 396, 310, 414, 350, 424, 392, 430, 430, 438, 468, 444, 506, 440,
  540, 446, 566, 432, 594, 426, 626, 442, 646, 438, 676, 420, 716, 404, 748, 392, 778, 384, 808, 368, 826, 338, 828, 300, 812, 268, 786, 246, 744, 230, 690, 214,
  620, 204, 540, 200, 460, 200, 380, 204, 306, 214, 240, 230, 200, 246];
// the jungle's edge: the coast drawn in toward the middle by a varying beach (wider on the near, south shore; narrow at the rocky headlands)
const JUNGLE = (() => {
  const o = [];
  for (let i = 0; i < COAST.length; i += 2) {
    const x = COAST[i], y = COAST[i + 1], dx = 480 - x, dy = 300 - y, l = Math.hypot(dx, dy) || 1;
    const rocky = x < 200 || x > 800, d = rocky ? 6 : y < 240 ? 3 : 8 + 16 * hash1(i * 7 + 3) + 16 * Math.max(0, (y - 300) / 140);
    o.push(x + (dx / l) * d, y + (dy / l) * d);
  }
  return o;
})();
// the volcano: a craggy outline with stepped shoulders (the skull fortress crowns it)
const VOLCANO = [236, 372, 262, 354, 286, 350, 300, 332, 334, 326, 346, 304, 372, 298, 386, 276, 402, 268, 410, 244, 426, 222, 436, 206, 444, 182,
  452, 170, 528, 170, 538, 186, 556, 198, 564, 220, 588, 232, 600, 252, 626, 262, 640, 284, 668, 292, 684, 312, 712, 322, 724, 344, 744, 372];
const BUTTRESS = [
  { pts: [262, 374, 290, 330, 322, 300, 352, 270, 380, 244, 392, 238, 402, 252, 414, 284, 424, 330, 430, 374], peak: [392, 238], foot: [404, 374] },
  { pts: [552, 374, 566, 326, 586, 284, 606, 250, 622, 232, 636, 238, 652, 262, 676, 296, 708, 334, 742, 374], peak: [622, 232], foot: [600, 374] },
];
const onMountain = (x, y) => inside(VOLCANO, x, y) || BUTTRESS.some((b) => inside(b.pts, x, y));
const LEDGES = [[262, 354, 286, 350], [300, 332, 334, 326], [346, 304, 372, 298], [386, 276, 402, 268], [426, 222, 436, 206], [538, 186, 556, 198], [564, 220, 588, 232], [600, 252, 626, 262], [640, 284, 668, 292], [684, 312, 712, 322]];
// the fortress's silhouette (the sky's live storm is clipped round it)
const FORT = [432, 172, 432, 146, 446, 146, 446, 138, 452, 128, 458, 138, 474, 136, 474, 128, 479, 128, 490, 113, 501, 128, 506, 128, 506, 136, 522, 138, 528, 128, 534, 138, 548, 146, 548, 172];
// the lava from the fissure on the west flank, down to the Cave of Rage
const LAVA = [[420, 224, 408, 240, 392, 262, 366, 280, 344, 288, 322, 300], [418, 226, 414, 248, 402, 268, 390, 282], [384, 268, 372, 284, 364, 300], [426, 228, 432, 250, 426, 270, 416, 290]];
const nearLava = (x, y) => LAVA.some((p) => { for (let i = 0; i < p.length - 2; i += 2) { const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3], t = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2), 0, 1); if (Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t)) < 16) return true; } return false; });
// the spots' clearings (no jungle over a spot's glow ring) and the palace's terrace and stairs
const CLEAR = [[SI_NODES[0].x, SI_NODES[0].y - 4, 92, 70], [SI_NODES[1].x, SI_NODES[1].y - 14, 104, 74], [SI_NODES[2].x, SI_NODES[2].y - 6, 92, 76], [SI_PALACE.x, SI_PALACE.y + 40, 40, 70]];
const inClear = (x, y, pad = 0) => CLEAR.some(([cx, cy, rx, ry]) => ((x - cx) / (rx + pad)) ** 2 + ((y - cy) / (ry + pad)) ** 2 < 1);

// ---------------------------------------------------------------------------------------------------------------
// THE STATIC ART: the vista (the painted builder's paint-over replaces exactly this), then the chart frame
// ---------------------------------------------------------------------------------------------------------------
function paintVista(g) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  paintSky(g);
  paintSea(g);
  paintIsland(g);
}
// a lightning bolt (a line: forks, a glow, a white core)
function bolt(g, pts, a = 1, w = 1) {
  for (const [lw, c] of [[7 * w, `rgba(190,120,255,${0.3 * a})`], [3 * w, `rgba(230,190,255,${0.8 * a})`], [1.4 * w, `rgba(255,250,255,${a})`]]) { g.strokeStyle = c; g.lineWidth = lw; polyline(g, pts); g.stroke(); }
}
function paintSky(g) {
  vgrad(g, 0, 0, W, HORIZON + 2, [[0, '#24183e'], [0.45, '#43346a'], [0.8, '#6e6890'], [1, '#98a8b4']]);
  // the storm: one great cloud over the island, wide enough to show past the title banner, its spiral bands lit from within,
  // ragged storm arms trailing off to both sides; flat underneath (the live wisps and bolts go over it)
  const sx = 490, sy = 56;
  const mass = [];
  for (let row = 0; row < 4; row++) {
    const yy = 22 + row * 24, half = [300, 380, 420, 380][row], r = [36, 34, 30, 24][row];
    for (let xx = sx - half; xx <= sx + half; xx += r * 1.12) mass.push([xx + (hash1(row * 31 + xx) - 0.5) * 14, yy + (hash1(xx * 3 + row) - 0.5) * (row === 3 ? 12 : 8), r * (0.8 + 0.35 * hash1(xx + row * 7))]);
  }
  // the trailing arms: lower, thinner bands of cloud off each end, down toward the horizon
  for (const s of [-1, 1]) for (let k = 0; k < 9; k++) { const u = k / 8; mass.push([sx + s * (380 + u * 120), 104 + u * 16 + Math.sin(u * 5) * 4, 22 - u * 9]); }
  lineStyle('#140a26', 0.6);
  puffInk(g, mass, '#38224f', 1.6, (g) => {
    vgrad(g, 0, 0, W, 130, [[0, 'rgba(14,8,30,0.6)'], [0.55, 'rgba(70,40,110,0)'], [1, 'rgba(150,100,200,0.55)']]);
    g.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) for (const [w, col] of [[32, 'rgba(110,50,170,0.45)'], [17, 'rgba(176,96,236,0.5)'], [6, 'rgba(236,180,255,0.6)']]) {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath();
      for (let i = 0; i <= 46; i++) { const r = 6 + i * 6.8, a = arm * TAU / 3 + r * 0.026; const px = sx + Math.cos(a) * r * 1.25, py = sy + Math.sin(a) * r * 0.24; i ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
    }
    lightPool(g, sx, sy + 8, 120, 42, '220,150,255', 0.55);
  });
  // a far bolt each side, striking the sea (static; live ones flicker over it)
  // the far sea's haze line
  vgrad(g, 0, HORIZON - 14, W, HORIZON + 4, [[0, 'rgba(170,190,200,0)'], [1, 'rgba(170,190,200,0.55)']]);
}
function paintSea(g) {
  vgrad(g, 0, HORIZON, W, H, [[0, '#62989e'], [0.12, '#3c7c86'], [0.45, '#245e6a'], [1, '#123e4c']]);
  lightPool(g, 480, 300, 440, 200, '120,200,200', 0.16);
  // waves: crests, larger toward the viewer (seeded)
  const R = mulberry(2611);
  for (let i = 0; i < 420; i++) {
    const y = HORIZON + 4 + Math.pow(R(), 0.8) * (H - HORIZON), x = R() * W, k = (y - HORIZON) / (H - HORIZON), l = 4 + k * 26 + R() * k * 14;
    if (inside(COAST, x, y + 10) || inside(COAST, x + l, y + 10)) continue;
    const lift = 1 + k * 3;
    g.strokeStyle = `rgba(10,40,52,${0.25 + k * 0.2})`; g.lineWidth = 1 + k * 1.6; g.beginPath(); g.moveTo(x, y + lift * 0.8); g.quadraticCurveTo(x + l / 2, y + lift * 1.6, x + l, y + lift * 0.8); g.stroke();
    g.strokeStyle = `rgba(214,240,240,${0.16 + k * 0.3})`; g.lineWidth = 0.8 + k * 1.4; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - lift, x + l, y); g.stroke();
  }
  // shallows round the island (turquoise, fading out), wider in the coves
  g.save();
  for (const [w, a] of [[64, 0.1], [42, 0.15], [26, 0.22], [12, 0.3]]) { g.strokeStyle = `rgba(90,200,196,${a})`; g.lineWidth = w; blob(g, COAST); g.stroke(); }
  g.restore();
  // foam: broken, wavy lines along the shore, three layers going out
  const pts = coastPts(COAST, 4), R2 = mulberry(77);
  for (const [off, a, w] of [[4, 0.95, 2.6], [10, 0.6, 2], [17, 0.35, 1.5]]) {
    let i = 0;
    while (i < pts.length - 2) {
      const len = 3 + Math.floor(R2() * 8), gap = 1 + Math.floor(R2() * 5);
      g.strokeStyle = `rgba(246,252,252,${a})`; g.lineWidth = w; g.beginPath();
      for (let k = 0; k <= len && i + k < pts.length; k++) { const [x, y, nx, ny] = pts[i + k], o = off + 2.4 * Math.sin((i + k) * 0.6 + off); k ? g.lineTo(x + nx * o, y + ny * o) : g.moveTo(x + nx * o, y + ny * o); }
      g.stroke(); i += len + gap;
    }
  }
}
// points along a smooth closed curve through a control polygon (as blobPath draws it), with outward normals: [x, y, nx, ny]
function coastPts(p, step) {
  const n = p.length >> 1, out = [];
  for (let i = 0; i < n; i++) {
    const a = [(p[((i + n - 1) % n) * 2] + p[i * 2]) / 2, (p[((i + n - 1) % n) * 2 + 1] + p[i * 2 + 1]) / 2], c = [p[i * 2], p[i * 2 + 1]], b = [(p[i * 2] + p[((i + 1) % n) * 2]) / 2, (p[i * 2 + 1] + p[((i + 1) % n) * 2 + 1]) / 2];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) + Math.hypot(b[0] - c[0], b[1] - c[1]), m = Math.max(2, Math.round(len / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, x = (1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * c[0] + t * t * b[0], y = (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * c[1] + t * t * b[1];
      const dx = 2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), dy = 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1]), l = Math.hypot(dx, dy) || 1;
      out.push([x, y, dy / l, -dx / l]);
    }
  }
  const [x0, y0, nx0, ny0] = out[Math.floor(out.length / 4)];
  if ((x0 - 480) * nx0 + (y0 - 300) * ny0 < 0) for (const q of out) { q[2] = -q[2]; q[3] = -q[3]; }
  return out;
}
// the land
function paintIsland(g) {
  // the black-sand beach (the land's base): dry sand, a lighter wet band at the waterline, speckle
  lineStyle('#14121a', 0.7);
  ink(g, (g) => blob(g, COAST), '#46424e', 2.4, (g) => {
    g.strokeStyle = 'rgba(16,14,22,0.5)'; g.lineWidth = 14; blob(g, COAST); g.stroke();
    g.strokeStyle = 'rgba(150,164,176,0.5)'; g.lineWidth = 6; blob(g, COAST); g.stroke();
    g.strokeStyle = 'rgba(230,240,246,0.45)'; g.lineWidth = 1.6; blob(g, COAST); g.stroke();
    g.strokeStyle = 'rgba(110,104,120,0.55)'; g.lineWidth = 9; blob(g, JUNGLE); g.stroke();
    const R = mulberry(31);
    for (let i = 0; i < 900; i++) { const x = 150 + R() * 690, y = 190 + R() * 270; g.fillStyle = R() < 0.5 ? 'rgba(140,132,150,0.45)' : 'rgba(12,10,18,0.4)'; g.fillRect(x, y, 1.6 + R() * 1.6, 1.2 + R()); }
  });
  // the jungle floor (dark green) inside the beach
  lineStyle('#10241a', 0.6);
  ink(g, (g) => blob(g, JUNGLE), '#24482e', 1.6, (g) => { vgrad(g, 150, 190, 700, 460, [[0, '#26402e'], [1, '#2a5232']]); });
  // shore boulders: clusters on the headlands and in the coves (the book's brown rock)
  for (const [x, y, s] of [[166, 292, 1.2], [174, 318, 0.9], [184, 270, 0.8], [200, 344, 0.7], [278, 398, 0.9], [296, 404, 0.6], [520, 444, 0.6], [628, 444, 1.0], [646, 440, 0.7], [612, 448, 0.6], [796, 380, 0.9], [818, 360, 0.7], [820, 290, 0.8]]) boulder(g, x, y, s, (x * 7 + y) | 0);
  // the jungle in three depth bands: small and hazy behind, then the volcano, mid, a mist band at its foot, big near clumps
  jungleRows(g, 200, 262, 0);
  g.save(); blob(g, JUNGLE); g.clip(); vgrad(g, 150, 196, 700, 262, [[0, 'rgba(150,170,180,0.4)'], [1, 'rgba(150,170,180,0)']]); g.restore();
  paintVolcano(g);
  paintStairs(g);
  jungleRows(g, 262, 334, 1);
  lightPool(g, 490, 336, 300, 22, '210,226,220', 0.3);
  paintCave(g);
  paintCell(g);
  jungleRows(g, 334, 452, 2);
  paintSwamp(g);
  paintPalms(g);
  // haze on the far parts, a soft light from the upper left
  vgrad(g, 0, HORIZON, W, 240, [[0, 'rgba(170,190,206,0.3)'], [1, 'rgba(170,190,206,0)']]);
  lightPool(g, 300, 200, 360, 200, '255,240,220', 0.07);
}
function boulder(g, x, y, s, seed) {
  const R = mulberry(seed), w = 14 * s, h = 10 * s;
  const p = [x - w, y + 2, x - w * 0.8, y - h * 0.6, x - w * 0.2, y - h, x + w * 0.5, y - h * 0.8, x + w, y - h * 0.1, x + w * 0.9, y + 3];
  lineStyle('#2a1a12', 0.7);
  ink(g, (g) => poly(g, p), '#7a5a42', 2, (g) => { g.fillStyle = '#4e3626'; g.fillRect(x + w * 0.1, y - h * 1.2, w * 1.2, h * 1.6); g.fillStyle = rgba('#b08860', 0.7); poly(g, [x - w * 0.8, y - h * 0.6, x - w * 0.2, y - h, x + w * 0.1, y - h * 0.7, x - w * 0.5, y - h * 0.3]); g.fill(); });
  g.fillStyle = 'rgba(246,252,252,0.7)'; g.beginPath(); g.ellipse(x + R.r(-2, 2), y + 4, w * 1.1, 2, 0, 0, TAU); g.fill();
}
// a canopy clump (base x,y; radius r; depth 0 far .. 2 near): varied shapes -- broad, tall, lumpy -- and greens
function clump(g, x, y, r, seed, depth) {
  const R = mulberry(seed), puffs = [];
  const kind = R(), n = 3 + (R() * 4 | 0), sy = kind < 0.25 ? 1.35 : kind < 0.5 ? 0.8 : 1;   // (tall / broad / round)
  for (let k = 0; k < n; k++) { const a = Math.PI + (k / (n - 1 || 1)) * Math.PI, rr = r * R.r(0.5, 0.82); puffs.push([x + Math.cos(a) * r * (kind < 0.25 ? 0.5 : 0.75), y - r * 0.7 * sy + Math.sin(a) * r * 0.55 * sy, rr]); }
  puffs.push([x + R.r(-2, 2), y - r * 1.05 * sy, r * R.r(0.55, 0.75)]);
  const v = R(), tint = (c) => mix(c, v < 0.3 ? '#7a8a2a' : v < 0.6 ? '#1a5a4a' : v < 0.8 ? '#3a6a1a' : c, 0.28);
  let base = tint(['#2e5440', '#2e6238', '#3a7e3e'][depth]), hi = tint(['#4a7860', '#549850', '#68b458'][depth]), sh = ['#1e3a2e', '#1c4226', '#1e4a26'][depth];
  if (depth === 0) { base = mix(base, '#7a96a0', 0.3); hi = mix(hi, '#a0b8b8', 0.3); }   // (the far band: hazy, blue-grey)
  lineStyle(['#24402e', '#102818', '#0c2412'][depth], [0.32, 0.46, 0.58][depth]);
  puffInk(g, puffs, base, 1.2, (g) => {
    g.fillStyle = sh; g.fillRect(x - r * 2, y - r * 0.5, r * 4, r);
    g.fillStyle = hi; for (const [px, py, pr] of puffs) { g.beginPath(); g.arc(px - pr * 0.28, py - pr * 0.3, pr * 0.52, 0, TAU); g.fill(); }
    if (depth) { g.fillStyle = rgba('#e0f4a8', 0.3); for (const [px, py, pr] of puffs) { g.beginPath(); g.arc(px - pr * 0.42, py - pr * 0.48, pr * 0.18, 0, TAU); g.fill(); } }
  });
}
function jungleRows(g, y0, y1, depth) {
  const R = mulberry(4000 + depth), pts = [];
  for (let i = 0; i < 900; i++) {
    const x = 150 + R() * 690, y = y0 + R() * (y1 - y0);
    if (!inside(JUNGLE, x, y + 4) || inClear(x, y, 6) || nearLava(x, y)) continue;
    if (onMountain(x, y - 4) && (y < 334 || R() < 0.5)) continue;   // (the slopes: bare rock; the jungle only round its foot)
    pts.push([x, y]);
  }
  pts.sort((a, b) => a[1] - b[1]);
  const kept = [], gapK = [0.6, 0.66, 0.78][depth];   // (the near band sparser: the dark floor shows between the big clumps)
  for (const [x, y] of pts) { const r = ([6, 9, 13][depth] + ((y - y0) / (y1 - y0)) * [3, 4, 7][depth]) * (0.75 + 0.5 * hash2(x | 0, y | 0)); if (kept.some(([qx, qy, qr]) => Math.hypot(qx - x, (qy - y) * 1.6) < (qr + r) * gapK)) continue; kept.push([x, y, r]); }
  for (const [x, y, r] of kept) clump(g, x, y, r, (x * 13 + y * 7) | 0, depth);
}
function paintVolcano(g) {
  lineStyle('#1a1216', 0.75);
  ink(g, (g) => poly(g, VOLCANO), '#6e5646', 2.6, (g) => {
    // the right side in shadow; under every ledge a cliff face (dark) and on it a lit top; ridge spurs down the slope
    g.fillStyle = 'rgba(40,28,26,0.45)'; poly(g, [492, 168, 760, 380, 540, 380, 520, 240]); g.fill();
    for (const [ax, ay, bx, by] of LEDGES) {
      const right = ax > 490, d = 26;
      g.fillStyle = right ? 'rgba(30,20,18,0.5)' : 'rgba(40,26,22,0.38)';
      poly(g, [ax, ay, bx, by, bx + (right ? 10 : -4), by + d, ax + (right ? 10 : -4), ay + d]); g.fill();
      g.fillStyle = rgba(right ? '#8a6a58' : '#b8967c', 0.55); poly(g, [ax, ay, bx, by, bx - (right ? -6 : 10), by - 8, ax - (right ? -6 : 10), ay - 8]); g.fill();
      g.strokeStyle = 'rgba(24,14,12,0.8)'; g.lineWidth = 3; polyline(g, [ax, ay + 1, bx, by + 1]); g.stroke();
    }
    for (const p of [[444, 186, 420, 230, 410, 270, 396, 320], [462, 178, 452, 240, 448, 300, 452, 360], [520, 178, 536, 236, 552, 296, 566, 360], [540, 190, 574, 240, 610, 290, 640, 340]]) {
      g.strokeStyle = 'rgba(24,14,12,0.5)'; g.lineWidth = 2.4; curve(g, p); g.stroke();
      g.strokeStyle = rgba('#c0a088', 0.4); g.lineWidth = 1.2; curve(g, p.map((v, i) => (i % 2 ? v : v - 3))); g.stroke();
    }
    vgrad(g, 230, 170, 520, 372, [[0, 'rgba(40,20,40,0.25)'], [0.65, 'rgba(0,0,0,0)'], [1, 'rgba(30,60,40,0.35)']]);
    lightPool(g, 420, 224, 34, 16, '255,140,40', 0.5);
  });
  // the buttresses: lit on the left of their ridge, in shadow on the right, a crack or two, moss on the ridge
  for (const B of BUTTRESS) {
    const [px, py] = B.peak, [fx, fy] = B.foot;
    ink(g, (g) => poly(g, B.pts), '#7a604e', 2.6, (g) => {
      g.fillStyle = '#4c3a32'; poly(g, [px, py, fx, fy, B.pts[B.pts.length - 2] + 20, B.pts[B.pts.length - 1], B.pts[B.pts.length - 4] + 30, B.pts[B.pts.length - 3] - 40]); g.fill();
      g.fillStyle = rgba('#b8967c', 0.5); poly(g, [px, py, px - 30, py + 50, px - 14, py + 40]); g.fill();
      g.strokeStyle = 'rgba(30,18,14,0.7)'; g.lineWidth = 2.2; curve(g, [px, py, (px + fx) / 2 + 6, (py + fy) / 2, fx, fy]); g.stroke();
      g.strokeStyle = 'rgba(24,14,12,0.5)'; g.lineWidth = 1.6; for (let k = 1; k < 4; k++) { const yy = py + k * 30; polyline(g, [px - 40 + k * 4, yy + 10, px - 18, yy, px + 10, yy + 8]); g.stroke(); }
      vgrad(g, px - 160, py, 320, fy, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(30,60,40,0.4)']]);
    });
    mossTuft(g, px - 14, py + 22, 26, px | 0);
  }
  // the lava over the west buttress (it runs down to the cave): tapered flows from a glowing notch
  LAVA.forEach((p, i) => lavaFlow(g, p, i * 3 + 1));
  lavaPool(g, 390, 284, 9); lavaPool(g, 416, 292, 7); lavaPool(g, 364, 302, 6);
  lavaNotch(g, 420, 222);
  // moss tufts on the shoulders' ledges (hugging the rock)
  for (const [ax, ay, bx, by] of LEDGES.filter((_, i) => i % 2 === 0)) mossTuft(g, (ax + bx) / 2, (ay + by) / 2 - 1, Math.abs(bx - ax) * 1.1, (ax + ay) | 0);
  paintFortress(g);
}
// a rivulet of lava down a slope: narrow and uneven (it wobbles, swells and thins), a dark crust edge, a bright core
function lavaFlow(g, p, seed = 1) {
  // (sample the smooth path finely, then wobble it across its direction)
  const pts = [], n = p.length / 2;
  for (let i = 0; i < n - 1; i++) {
    const a = i ? [(p[i * 2 - 2] + p[i * 2]) / 2, (p[i * 2 - 1] + p[i * 2 + 1]) / 2] : [p[0], p[1]], c = [p[i * 2], p[i * 2 + 1]], b = i < n - 2 ? [(p[i * 2] + p[i * 2 + 2]) / 2, (p[i * 2 + 1] + p[i * 2 + 3]) / 2] : [p[i * 2 + 2], p[i * 2 + 3]];
    for (let k = 0; k < 8; k++) { const t = k / 8; pts.push([(1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * c[1] + t * t * b[1]]); }
  }
  pts.push([p[p.length - 2], p[p.length - 1]]);
  const L = [], Rt = [], mid = [];
  for (let i = 0; i < pts.length; i++) {
    const j = Math.min(pts.length - 1, i + 1), k = Math.max(0, i - 1), dx = pts[j][0] - pts[k][0], dy = pts[j][1] - pts[k][1], l = Math.hypot(dx, dy) || 1, u = i / (pts.length - 1);
    const wob = Math.sin(u * 17 + seed) * 1.6, w = 0.9 + 1.6 * u + 0.7 * Math.sin(u * 23 + seed * 3) ** 2;
    const x = pts[i][0] + (dy / l) * wob, y = pts[i][1] - (dx / l) * wob;
    mid.push(x, y); L.push(x - (dy / l) * w, y + (dx / l) * w); Rt.unshift(x + (dy / l) * w, y - (dx / l) * w);
  }
  const shape = (g) => poly(g, L.concat(Rt));
  g.save(); g.strokeStyle = 'rgba(255,90,20,0.28)'; g.lineWidth = 5; shape(g); g.stroke(); g.restore();
  shape(g); g.fillStyle = '#e85a18'; g.fill(); g.strokeStyle = '#2a120c'; g.lineWidth = 1.4; g.stroke();
  g.strokeStyle = '#ffd860'; g.lineWidth = 0.9; polyline(g, mid); g.stroke();
}
// a small pool of lava on a ledge: a crusted rim, a bright middle
function lavaPool(g, x, y, rx) {
  lightPool(g, x, y, rx * 2.2, rx * 0.9, '255,120,30', 0.45);
  ink(g, (g) => { g.beginPath(); g.ellipse(x, y, rx, rx * 0.36, -0.1, 0, TAU); }, '#e85a18', 1.4, (g) => { g.fillStyle = '#ffb040'; g.beginPath(); g.ellipse(x - 1, y - 0.6, rx * 0.6, rx * 0.2, -0.1, 0, TAU); g.fill(); g.fillStyle = '#fff0a0'; g.beginPath(); g.ellipse(x - 1.4, y - 0.8, rx * 0.25, rx * 0.08, 0, 0, TAU); g.fill(); }, '#2a120c');
}
// the lava's source: a short glowing notch in the rock
function lavaNotch(g, x, y) {
  lightPool(g, x, y, 22, 12, '255,150,50', 0.6);
  ink(g, (g) => { g.beginPath(); g.moveTo(x - 9, y + 2); g.quadraticCurveTo(x - 2, y - 6, x + 9, y - 1); g.quadraticCurveTo(x + 1, y + 5, x - 9, y + 2); g.closePath(); }, '#ff9a2a', 1.6, (g) => { g.fillStyle = '#fff0a0'; g.beginPath(); g.ellipse(x, y, 4, 1.6, -0.2, 0, TAU); g.fill(); }, '#2a1410');
}
function mossTuft(g, x, y, w, seed) {
  const R = mulberry(seed), puffs = [];
  for (let k = 0; k < 5; k++) puffs.push([x - w / 2 + (k / 4) * w + R.r(-2, 2), y - R.r(2, 6) * Math.sin((k / 4) * Math.PI) - 1, w * R.r(0.16, 0.24)]);
  lineStyle('#14301a', 0.5);
  puffInk(g, puffs, '#4a7a3a', 1, (g) => { g.fillStyle = '#2e4a26'; g.fillRect(x - w, y - 2, w * 2, 10); g.fillStyle = '#6a9a48'; for (const [px, py, pr] of puffs) { g.beginPath(); g.arc(px - pr * 0.3, py - pr * 0.4, pr * 0.5, 0, TAU); g.fill(); } });
}
// the skull fortress (the palace): black castle towers on a great skull carved in the summit, an arched double door with the gold sun
// under its teeth; the mountain's rock wraps round its jaw
function paintFortress(g) {
  const x = SI_PALACE.x, gy = SI_PALACE.y;   // (the door's foot)
  const ST = { base: '#2c2834', sh: '#1a1720', hi: '#5a5470', line: '#0c0a10' };
  lineStyle(ST.line, 0.8);
  const tower = (tx, top, w, roofH) => {
    ink(g, (g) => poly(g, [tx - w / 2, 170, tx - w / 2, top, tx + w / 2, top, tx + w / 2, 170]), ST.base, 2, (g) => {
      g.fillStyle = ST.sh; g.fillRect(tx + w * 0.15, top, w, 60); g.fillStyle = rgba(ST.hi, 0.6); g.fillRect(tx - w / 2, top, 2.4, 60);
      for (let y = top + 8; y < 170; y += 8) { g.fillStyle = rgba('#0c0a10', 0.5); g.fillRect(tx - w / 2, y, w, 1); }
      g.fillStyle = '#c880ff'; g.fillRect(tx - 1.6, top + 7, 3.2, 5);
    });
    ink(g, (g) => poly(g, [tx - w / 2 - 3, top, tx, top - roofH, tx + w / 2 + 3, top]), '#6a1e2a', 1.6, (g) => { g.fillStyle = '#4a121c'; poly(g, [tx, top - roofH, tx + w / 2 + 3, top, tx, top]); g.fill(); });
  };
  tower(x - 50, 146, 10, 14); tower(x + 50, 146, 10, 14);
  tower(x - 31, 140, 12, 18); tower(x + 31, 140, 12, 18);
  tower(x, 136, 16, 22);
  ink(g, (g) => poly(g, [x - 58, 166, x - 58, 142, x + 58, 142, x + 58, 166]), ST.base, 2, (g) => { g.fillStyle = ST.sh; g.fillRect(x + 12, 140, 50, 30); });
  for (let k = -58; k < 58; k += 8) ink(g, (g) => poly(g, [x + k, 142, x + k, 137, x + k + 5, 137, x + k + 5, 142]), ST.base, 1);
  // the skull: a rounded cranium, cheekbone notches, a narrower jaw
  const skull = (g) => {
    g.beginPath(); g.moveTo(x - 34, gy + 2); g.lineTo(x - 40, gy - 22); g.lineTo(x - 47, gy - 30); g.lineTo(x - 43, gy - 40); g.quadraticCurveTo(x - 56, gy - 52, x - 54, gy - 70);
    g.quadraticCurveTo(x - 52, gy - 100, x, gy - 102); g.quadraticCurveTo(x + 52, gy - 100, x + 54, gy - 70); g.quadraticCurveTo(x + 56, gy - 52, x + 43, gy - 40);
    g.lineTo(x + 47, gy - 30); g.lineTo(x + 40, gy - 22); g.lineTo(x + 34, gy + 2); g.closePath();
  };
  ink(g, skull, '#3c3846', 2.8, (g) => {
    g.fillStyle = ST.sh; g.beginPath(); g.ellipse(x + 30, gy - 40, 32, 62, 0.2, 0, TAU); g.fill();
    g.fillStyle = rgba('#8a84a0', 0.45); g.beginPath(); g.ellipse(x - 24, gy - 84, 20, 8, -0.4, 0, TAU); g.fill();
    g.strokeStyle = rgba('#0c0a10', 0.6); g.lineWidth = 1.4; for (const c of [[x - 30, gy - 92, x - 18, gy - 78, x - 26, gy - 66], [x + 20, gy - 96, x + 30, gy - 84]]) { polyline(g, c); g.stroke(); }
    g.fillStyle = 'rgba(12,10,16,0.5)'; for (const s of [-1, 1]) { poly(g, [x + s * 43, gy - 40, x + s * 30, gy - 36, x + s * 36, gy - 30]); g.fill(); }   // (the cheekbones' shadow)
  });
  for (const ex of [-20, 20]) {
    ink(g, (g) => { g.beginPath(); g.moveTo(x + ex - 15, gy - 56); g.quadraticCurveTo(x + ex - 16, gy - 74, x + ex, gy - 74); g.quadraticCurveTo(x + ex + 16, gy - 74, x + ex + 14, gy - 56); g.quadraticCurveTo(x + ex, gy - 48, x + ex - 15, gy - 56); g.closePath(); }, '#0e0a16', 2, (g) => { const gr = g.createRadialGradient(x + ex, gy - 62, 1, x + ex, gy - 62, 14); gr.addColorStop(0, '#ffe0ff'); gr.addColorStop(0.32, '#d070ff'); gr.addColorStop(1, '#2a0a50'); g.fillStyle = gr; g.fillRect(x + ex - 16, gy - 76, 32, 30); });
  }
  ink(g, (g) => { g.beginPath(); g.moveTo(x, gy - 50); g.quadraticCurveTo(x - 9, gy - 42, x - 7, gy - 36); g.lineTo(x, gy - 39); g.lineTo(x + 7, gy - 36); g.quadraticCurveTo(x + 9, gy - 42, x, gy - 50); g.closePath(); }, '#0e0a16', 1.6);
  // the teeth: bone-cream, a row over the door
  for (let k = 0; k < 7; k++) { const tx = x - 30 + k * 10; ink(g, (g) => { g.beginPath(); g.moveTo(tx - 4.4, gy - 32); g.lineTo(tx + 4.4, gy - 32); g.lineTo(tx + 3.8, gy - 24); g.quadraticCurveTo(tx, gy - 21, tx - 3.8, gy - 24); g.closePath(); }, '#d8cca8', 1.1, (g) => { g.fillStyle = '#a89c7c'; g.fillRect(tx + 1.4, gy - 34, 4, 14); }); }
  // the door: an arched double door of dark wood, iron bands, the gold sun on it (the Sun Key's lock)
  ink(g, (g) => { g.beginPath(); g.moveTo(x - 20, gy + 3); g.lineTo(x - 20, gy - 14); g.quadraticCurveTo(x, gy - 26, x + 20, gy - 14); g.lineTo(x + 20, gy + 3); g.closePath(); }, '#16101a', 2);
  ink(g, (g) => { g.beginPath(); g.moveTo(x - 16, gy + 3); g.lineTo(x - 16, gy - 12); g.quadraticCurveTo(x, gy - 22, x + 16, gy - 12); g.lineTo(x + 16, gy + 3); g.closePath(); }, '#6a4a2e', 1.6, (g) => {
    g.fillStyle = '#4a3220'; g.fillRect(x, gy - 24, 18, 30);
    g.fillStyle = '#2a2830'; for (const y of [gy - 9, gy - 2]) g.fillRect(x - 17, y, 34, 2.4);
    g.strokeStyle = '#1e140c'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, gy - 21); g.lineTo(x, gy + 3); g.stroke();
  });
  g.save(); g.translate(x, gy - 10);
  for (let k = 0; k < 8; k++) { const a = k * TAU / 8; g.strokeStyle = '#3a2a0a'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(Math.cos(a) * 4.5, Math.sin(a) * 4.5); g.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); g.stroke(); g.strokeStyle = '#ffd23a'; g.lineWidth = 1.4; g.stroke(); }
  ink(g, (g) => { g.beginPath(); g.arc(0, 0, 4.4, 0, TAU); }, '#ffd23a', 1.2, (g) => { g.fillStyle = '#fff2a0'; g.beginPath(); g.arc(-1, -1, 1.6, 0, TAU); g.fill(); });
  g.restore();
  // the mountain's rock wrapping the jaw, the terrace in front of the door
  lineStyle('#1a1216', 0.75);
  for (const s of [-1, 1]) ink(g, (g) => poly(g, [x + s * 54, gy + 10, x + s * 50, gy - 18, x + s * 42, gy - 26, x + s * 36, gy - 10, x + s * 30, gy + 10]), '#6e5646', 2.2, (g) => { g.fillStyle = s < 0 ? rgba('#a0806a', 0.5) : rgba('#3e2e28', 0.5); g.fillRect(x + s * 56 - 10, gy - 30, 20, 44); });
  ink(g, (g) => poly(g, [x - 30, gy + 4, x + 30, gy + 4, x + 38, gy + 14, x - 38, gy + 14]), '#7a6252', 1.8, (g) => { g.fillStyle = '#9a7e68'; g.fillRect(x - 38, gy + 3, 76, 3); });
}
// the stairs: carved steps from the jungle up the mountain to the palace door's terrace
function paintStairs(g) {
  const x0 = SI_PALACE.x, y0 = SI_PALACE.y + 14, y1 = 322;
  const side = (y) => x0 + Math.sin((y - y0) / (y1 - y0) * Math.PI * 1.2) * 6, half = (y) => lerp(7, 13, (y - y0) / (y1 - y0));
  lineStyle('#1e1610', 0.7);
  ink(g, (g) => { g.beginPath(); for (let y = y0; y <= y1; y += 4) g.lineTo(side(y) - half(y), y); for (let y = y1; y >= y0; y -= 4) g.lineTo(side(y) + half(y), y); g.closePath(); }, '#a08a74', 1.6, (g) => {
    for (let y = y0 + 3; y < y1; y += 5 + (y - y0) * 0.04) { g.fillStyle = '#5a4838'; g.fillRect(side(y) - 16, y, 32, 1.6); g.fillStyle = rgba('#d8c4a4', 0.6); g.fillRect(side(y) - 16, y - 1.4, 32, 1.2); }
  });
}
// the Cave of Rage: a fanged mouth in a jagged rock face between two rock shoulders, lava glowing inside and spilling at its lip
function paintCave(g) {
  const x = SI_NODES[0].x, y = SI_NODES[0].y;   // (the mouth's centre)
  lineStyle('#120808', 0.8);
  const RK = { base: '#4a3230', sh: '#2a1a1a', hi: '#8a645a' };
  // the face: a jagged rock wall (an angular top line, not a dome)
  const face = [x - 70, y + 34, x - 72, y - 4, x - 62, y - 30, x - 52, y - 56, x - 40, y - 64, x - 28, y - 86, x - 14, y - 70, x + 2, y - 78, x + 16, y - 92, x + 30, y - 72, x + 46, y - 66, x + 58, y - 44, x + 70, y - 20, x + 74, y + 34];
  ink(g, (g) => poly(g, face), RK.base, 3, (g) => {
    g.fillStyle = RK.sh; poly(g, [x + 16, y - 92, x + 80, y - 30, x + 80, y + 40, x + 30, y + 40, x + 26, y - 40]); g.fill();
    g.fillStyle = rgba(RK.hi, 0.55); poly(g, [x - 28, y - 86, x - 60, y - 32, x - 52, y - 30, x - 22, y - 70]); g.fill(); poly(g, [x + 16, y - 92, x + 4, y - 72, x + 10, y - 70]); g.fill();
    g.strokeStyle = 'rgba(20,8,8,0.6)'; g.lineWidth = 1.6; for (const p of [[x - 56, y - 10, x - 44, y - 2], [x + 50, y - 40, x + 60, y - 22]]) { polyline(g, p); g.stroke(); }
    for (const p of [[x - 50, y - 30, x - 40, y - 18, x - 46, y], [x + 44, y - 58, x + 52, y - 40, x + 46, y - 22], [x - 12, y - 66, x - 4, y - 52], [x + 22, y - 76, x + 28, y - 58]]) {
      g.strokeStyle = 'rgba(255,90,20,0.45)'; g.lineWidth = 5; polyline(g, p); g.stroke(); g.strokeStyle = '#ffa030'; g.lineWidth = 1.8; polyline(g, p); g.stroke();
    }
  });
  // the rock shoulders either side (the mouth sits in a rock face, between them)
  ink(g, (g) => poly(g, [x - 94, y + 36, x - 92, y + 4, x - 80, y - 18, x - 66, y - 6, x - 60, y + 36]), '#3a2626', 2.4, (g) => { g.fillStyle = rgba(RK.hi, 0.5); poly(g, [x - 92, y + 4, x - 80, y - 18, x - 76, y - 12, x - 88, y + 8]); g.fill(); });
  ink(g, (g) => poly(g, [x + 60, y + 38, x + 66, y + 2, x + 80, y - 24, x + 96, y - 4, x + 100, y + 38]), '#3a2626', 2.4, (g) => { g.fillStyle = RK.sh; g.fillRect(x + 82, y - 30, 20, 70); });
  // the brows: angry slanted ridges over the mouth
  for (const s of [-1, 1]) ink(g, (g) => { g.beginPath(); g.moveTo(x + s * 6, y - 24); g.lineTo(x + s * 46, y - 46); g.lineTo(x + s * 50, y - 36); g.quadraticCurveTo(x + s * 28, y - 26, x + s * 10, y - 16); g.closePath(); }, '#5a403a', 2.2, (g) => { g.fillStyle = rgba('#a07a6a', 0.7); g.beginPath(); g.moveTo(x + s * 8, y - 24); g.lineTo(x + s * 46, y - 46); g.lineTo(x + s * 46, y - 42); g.lineTo(x + s * 10, y - 21); g.closePath(); g.fill(); });
  // the mouth: lava light inside, fangs top and bottom
  const mouth = (g) => { g.beginPath(); g.moveTo(x - 32, y + 24); g.quadraticCurveTo(x - 38, y - 12, x, y - 22); g.quadraticCurveTo(x + 38, y - 12, x + 32, y + 24); g.quadraticCurveTo(x, y + 30, x - 32, y + 24); g.closePath(); };
  ink(g, mouth, '#1a0606', 3, (g) => {
    const lv = g.createRadialGradient(x, y + 18, 2, x, y + 10, 40); lv.addColorStop(0, '#fff0a0'); lv.addColorStop(0.3, '#ffa030'); lv.addColorStop(0.7, '#c0300c'); lv.addColorStop(1, '#3a0806');
    g.fillStyle = lv; g.fillRect(x - 40, y - 24, 80, 56);
  });
  const fang = (fx, fy, len, w, down) => ink(g, (g) => { g.beginPath(); g.moveTo(fx - w, fy); g.quadraticCurveTo(fx - w * 0.4, fy + (down ? len * 0.6 : -len * 0.6), fx + w * 0.2, fy + (down ? len : -len)); g.quadraticCurveTo(fx + w * 0.5, fy + (down ? len * 0.5 : -len * 0.5), fx + w, fy); g.closePath(); }, '#a89880', 1.4, (g) => { g.fillStyle = '#6a5a4a'; g.fillRect(fx, fy - 30, w * 2, 60); g.fillStyle = rgba('#ffb060', 0.5); g.fillRect(fx - w, fy + (down ? len * 0.4 : -len), w * 3, len * 0.6); });
  for (const [dx, len, w] of [[-24, 13, 4], [-12, 18, 5], [1, 15, 4.4], [13, 19, 5], [25, 12, 4]]) fang(x + dx, y - 16 + Math.abs(dx) * 0.22, len, w, true);
  for (const [dx, len, w] of [[-20, 10, 4], [-6, 13, 4.6], [8, 11, 4.2], [21, 9, 3.6]]) fang(x + dx, y + 25, len, w, false);
  // the lava spilling over the lip into a glowing pool on the rock below
  lightPool(g, x + 2, y + 36, 34, 7, '255,120,30', 0.85);
  lightPool(g, x, y + 35, 18, 3.4, '255,224,120', 0.9);
  lightPool(g, x, y + 14, 92, 52, '255,120,40', 0.3);
}
// the Cell of Sloth: a tall flat-topped cliff rising out of the sea, a prison cut into its face -- one big barred gate, barred windows,
// chains -- and a squat round tower on top
function paintCell(g) {
  const x = SI_NODES[2].x, y = SI_NODES[2].y;   // (the gate's middle)
  const RK = { base: '#6e7480', sh: '#474c58', hi: '#a4aab6', line: '#14161c' };
  lineStyle(RK.line, 0.8);
  // the cliff: vertical rock planes, an overhang at the top, flat-topped
  const cliff = [x - 66, y + 50, x - 70, y + 10, x - 62, y - 12, x - 66, y - 36, x - 56, y - 60, x - 48, y - 84, x - 38, y - 96, x - 26, y - 90, x - 14, y - 106, x - 2, y - 92, x + 14, y - 98, x + 28, y - 112, x + 40, y - 96, x + 64, y - 90, x + 80, y - 64, x + 76, y - 40, x + 86, y - 14, x + 84, y + 20, x + 94, y + 38, x + 76, y + 54];
  ink(g, (g) => poly(g, cliff), RK.base, 3, (g) => {
    // rock layers: bands across the cliff, each lit on top, shadowed under; a few blocky fractures
    for (let r = 0; r < 8; r++) {
      const yy = y - 92 + r * 19, pts = [];
      for (let k = 0; k <= 8; k++) pts.push(x - 80 + k * 22, yy + (hash1(r * 17 + k) - 0.5) * 8);
      g.strokeStyle = rgba(RK.hi, 0.7); g.lineWidth = 2; polyline(g, pts); g.stroke();
      g.strokeStyle = rgba(RK.line, 0.55); g.lineWidth = 2; polyline(g, pts.map((v, i) => (i % 2 ? v + 5 : v))); g.stroke();
      for (let k = 0; k < 3; k++) { const fx = x - 60 + hash1(r * 9 + k) * 130; g.strokeStyle = rgba(RK.line, 0.5); g.lineWidth = 1.4; polyline(g, [fx, yy + 5, fx + 2, yy + 19]); g.stroke(); }
    }
    g.fillStyle = rgba(RK.hi, 0.35); poly(g, [x - 70, y + 54, x - 66, y - 36, x - 48, y - 84, x - 30, y - 92, x - 40, y - 30, x - 50, y + 54]); g.fill();
    g.fillStyle = rgba(RK.sh, 0.6); poly(g, [x + 30, y - 96, x + 100, y - 60, x + 100, y + 60, x + 50, y + 60]); g.fill();
    g.fillStyle = rgba('#1a1c24', 0.45); g.fillRect(x - 70, y - 84, 160, 8);   // (under the overhang's lip)
    vgrad(g, x - 70, y + 20, 170, y + 56, [[0, 'rgba(20,30,40,0)'], [1, 'rgba(14,22,32,0.7)']]);
  });
  ink(g, (g) => poly(g, [x - 54, y - 86, x - 36, y - 98, x + 22, y - 102, x + 66, y - 96, x + 80, y - 76, x + 62, y - 84, x + 20, y - 90, x - 34, y - 86]), RK.hi, 2, (g) => { g.fillStyle = RK.base; g.fillRect(x - 60, y - 92, 150, 8); });
  mossTuft(g, x - 30, y - 96, 20, 71); mossTuft(g, x + 46, y - 96, 16, 72);
  // the squat round tower on the clifftop, a slate cone
  const tx = x + 50, ty = y - 104;
  ink(g, (g) => poly(g, [tx - 13, ty + 12, tx - 13, ty - 18, tx + 13, ty - 18, tx + 13, ty + 12]), '#8a8a90', 2, (g) => { g.fillStyle = '#5e5e66'; g.fillRect(tx + 3, ty - 20, 12, 34); for (let r = 0; r < 4; r++) { g.fillStyle = rgba('#14161c', 0.5); g.fillRect(tx - 13, ty - 12 + r * 7, 26, 1.2); } g.fillStyle = '#14161c'; g.fillRect(tx - 2.6, ty - 10, 5.2, 8); });
  ink(g, (g) => poly(g, [tx - 17, ty - 17, tx, ty - 40, tx + 17, ty - 17]), '#3e4658', 1.8, (g) => { g.fillStyle = '#2a3040'; poly(g, [tx, ty - 40, tx + 17, ty - 17, tx, ty - 17]); g.fill(); });
  // the prison cut into the face: a dark recess, a cut-stone front, two barred windows, the big barred gate
  ink(g, (g) => poly(g, [x - 40, y + 36, x - 40, y - 46, x + 40, y - 46, x + 40, y + 36]), '#14161c', 2.2);
  ink(g, (g) => poly(g, [x - 36, y + 36, x - 36, y - 42, x + 36, y - 42, x + 36, y + 36]), '#9a9890', 2, (g) => {
    g.fillStyle = '#7a7872'; g.fillRect(x + 12, y - 44, 26, 82);
    for (let r = 0; r < 8; r++) { const yy = y - 42 + r * 10; g.fillStyle = rgba('#2a2a2a', 0.5); g.fillRect(x - 36, yy, 72, 1.2); for (let c = 0; c < 5; c++) g.fillRect(x - 36 + ((c * 16 + (r % 2) * 8) % 72), yy, 1.2, 10); }
  });
  const bars = (x0, x1, y0, y1, n) => { for (let k = 0; k <= n; k++) { const bx = lerp(x0, x1, k / n); g.strokeStyle = '#14161c'; g.lineWidth = 4.6; polyline(g, [bx, y0, bx, y1]); g.stroke(); g.strokeStyle = '#c4c8d0'; g.lineWidth = 2.4; g.stroke(); } };
  for (const wx of [-20, 20]) {
    ink(g, (g) => { g.beginPath(); g.moveTo(wx + x - 10, y - 16); g.lineTo(wx + x - 10, y - 28); g.quadraticCurveTo(wx + x, y - 38, wx + x + 10, y - 28); g.lineTo(wx + x + 10, y - 16); g.closePath(); }, '#0e0e14', 2, (g) => { g.fillStyle = rgba('#8090c0', 0.3); g.fillRect(x + wx - 10, y - 30, 20, 14); });
    bars(x + wx - 6, x + wx + 6, y - 32, y - 16, 2);
  }
  ink(g, (g) => { g.beginPath(); g.moveTo(x - 20, y + 36); g.lineTo(x - 20, y - 2); g.quadraticCurveTo(x, y - 16, x + 20, y - 2); g.lineTo(x + 20, y + 36); g.closePath(); }, '#0e0e14', 2.4, (g) => { g.fillStyle = rgba('#8090c0', 0.25); g.fillRect(x - 20, y - 4, 40, 40); });
  bars(x - 15, x + 15, y - 8, y + 36, 4);
  for (const yy of [y + 6, y + 22]) { g.strokeStyle = '#14161c'; g.lineWidth = 4; polyline(g, [x - 19, yy, x + 19, yy]); g.stroke(); g.strokeStyle = '#c4c8d0'; g.lineWidth = 2; g.stroke(); }
  for (const cx of [x - 44, x + 44]) { g.strokeStyle = '#2a2a30'; g.lineWidth = 2.4; for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(cx, y - 36 + k * 6, 2.2, 3.2, 0, 0, TAU); g.stroke(); } }
  lightPool(g, x, y - 4, 80, 56, '190,200,240', 0.16);
  // the waves breaking at the cliff's foot
  for (const [fx, fy, r] of [[x + 100, y + 30, 9], [x + 92, y + 42, 7]]) { g.fillStyle = 'rgba(246,252,252,0.85)'; g.beginPath(); for (let k = 0; k < 5; k++) { const a = Math.PI + (k / 4) * Math.PI; g.moveTo(fx + Math.cos(a) * r + 3.4, fy + Math.sin(a) * r * 0.6); g.arc(fx + Math.cos(a) * r, fy + Math.sin(a) * r * 0.6, 3.4, 0, TAU); } g.fill(); }
}
// the Swamp of Despair: a misty lagoon by the south shore, big grumpy gnarled trees leaning hard over it, hung with long moss drapes
function paintSwamp(g) {
  const x = SI_NODES[1].x, y = SI_NODES[1].y - 4;
  lineStyle('#0c1410', 0.7);
  // the pale mist behind the trees: their dark silhouettes read against it
  lightPool(g, x - 10, y - 66, 90, 46, '214,226,222', 0.55);
  const lagoon = [x - 78, y + 2, x - 62, y - 22, x - 16, y - 30, x + 36, y - 28, x + 74, y - 10, x + 80, y + 14, x + 52, y + 32, x + 6, y + 36, x - 40, y + 32, x - 72, y + 18];
  ink(g, (g) => blob(g, lagoon), '#1e2a26', 2.2, (g) => {
    vgrad(g, x - 80, y - 34, 160, y + 38, [[0, '#2e3c34'], [1, '#141c1a']]);
    g.strokeStyle = 'rgba(150,180,160,0.5)'; g.lineWidth = 2; blob(g, lagoon.map((v, i) => (i % 2 ? v + 2 : v))); g.stroke();
    g.strokeStyle = 'rgba(220,236,210,0.45)'; g.lineWidth = 1.4; for (const [dx, dy, w] of [[-34, -10, 24], [12, 2, 30], [40, 16, 20], [-24, 16, 18]]) { g.beginPath(); g.moveTo(x + dx - w / 2, y + dy); g.lineTo(x + dx + w / 2, y + dy); g.stroke(); }
    for (const [dx, dy] of [[-48, 6], [26, -14], [52, 8], [-8, 24], [-30, -14]]) { g.fillStyle = '#5a8a40'; g.beginPath(); g.ellipse(x + dx, y + dy, 5.6, 2.4, 0, 0.3, TAU - 0.1); g.lineTo(x + dx, y + dy); g.fill(); }
  });
  const tree = (tx, ty, h, lean, seed, w, face) => {
    const R = mulberry(seed), top = [tx + lean, ty - h];
    const trunk = (g) => { g.beginPath(); g.moveTo(tx - w, ty + 2); g.quadraticCurveTo(tx - w * 0.9 + lean * 0.1, ty - h * 0.5, top[0] - 2.5, top[1]); g.lineTo(top[0] + 3, top[1] + 1); g.quadraticCurveTo(tx + w * 0.7 + lean * 0.4, ty - h * 0.42, tx + w, ty + 2); g.closePath(); };
    for (const s of [-1, 1]) for (const k of [0.6, 1]) { g.strokeStyle = LINE; g.lineWidth = 5.4; curve(g, [tx + s * 4 * k, ty - 6, tx + s * 13 * k, ty - 2, tx + s * 20 * k, ty + 5]); g.stroke(); g.strokeStyle = '#3e3438'; g.lineWidth = 3; g.stroke(); }
    ink(g, trunk, '#342a30', 2.6, (g) => { g.fillStyle = '#221a22'; g.fillRect(tx + 1, ty - h - 4, 30, h + 8); g.fillStyle = rgba('#8a8094', 0.45); g.fillRect(tx - w, ty - h, 2.4, h); g.strokeStyle = rgba('#1a1418', 0.7); g.lineWidth = 1.2; for (let k = 1; k < 6; k++) { const yy = ty - h * k / 6, xx = lerp(tx, top[0], k / 6); g.beginPath(); g.moveTo(xx - 5, yy); g.quadraticCurveTo(xx, yy - 3, xx + 4, yy + 1); g.stroke(); } });
    if (face) {   // a grumpy bark face (heavy brows, a frown): no glowing eyes
      const fx = lerp(tx, top[0], 0.42), fy = lerp(ty, top[1], 0.42);
      g.strokeStyle = '#120c10'; g.lineWidth = 3.4; for (const s of [-1, 1]) { polyline(g, [fx + s * 2, fy - 4, fx + s * 11, fy - 9]); g.stroke(); }
      g.fillStyle = '#120c10'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(fx + s * 6.4, fy - 1, 3, 2.4, 0, 0, TAU); g.fill(); }
      g.lineWidth = 2.8; g.beginPath(); g.moveTo(fx - 8, fy + 11); g.quadraticCurveTo(fx, fy + 5, fx + 8, fy + 11); g.stroke();
    }
    const branches = [];
    for (let k = 0; k < 6; k++) { const f = 0.5 + k * 0.1, bx = lerp(tx, top[0], f), by = lerp(ty, top[1], f), s = k % 2 ? 1 : -1, l = R.r(26, 44) * (1 - k * 0.06); branches.push([bx, by, bx + s * l * 0.6, by - R.r(10, 22), bx + s * l * 1.3, by - R.r(0, 14)]); }
    for (const b of branches) { g.strokeStyle = LINE; g.lineWidth = 5; curve(g, b); g.stroke(); g.strokeStyle = '#3e3438'; g.lineWidth = 2.8; g.stroke(); }
    // the moss: long tapered drapes (two or three a bough), dark olive with a light streak
    for (const b of branches) for (const f of [0.5, 0.95]) {
      const mx = lerp(b[0], b[4], f), my = lerp(b[1], b[5], f) - Math.sin(f * Math.PI) * 5, l = R.r(20, 44), sw = R.r(-5, 5), w = R.r(2.6, 5.4);
      const ww = w * 1.6, ends = [l * R.r(0.5, 0.8), l, l * R.r(0.4, 0.7), l * R.r(0.6, 0.95)];
      const curtain = (g) => { g.beginPath(); g.moveTo(mx - ww, my); g.quadraticCurveTo(mx, my - 3, mx + ww, my); for (let k = 3; k >= 0; k--) { const ex = mx - ww + (k + 0.5) * (ww * 2 / 4) + sw * (ends[k] / l), ey = my + ends[k]; g.lineTo(ex + 1.6, ey - 4); g.quadraticCurveTo(ex, ey + 2, ex - 1.6, ey - 4); } g.closePath(); };
      ink(g, curtain, '#6e8a5a', 1.2, (g) => { g.fillStyle = '#5a7448'; g.fillRect(mx + 1, my, ww + 4, l); g.strokeStyle = rgba('#b8ccaa', 0.7); g.lineWidth = 1; for (let k = 0; k < 3; k++) { const sx0 = mx - ww * 0.6 + k * ww * 0.6; g.beginPath(); g.moveTo(sx0, my + 2); g.quadraticCurveTo(sx0 + sw * 0.3, my + l * 0.4, sx0 + sw * 0.6, my + ends[k] - 6); g.stroke(); } });
    }
  };
  tree(x + 4, y + 6, 104, -30, 12, 14, true);
  // a dead stump and a fallen branch at the water's edge (small: the big tree is the landmark)
  ink(g, (g) => poly(g, [x + 46, y + 14, x + 48, y - 6, x + 52, y - 12, x + 56, y - 4, x + 58, y + 14]), '#3e3438', 1.8);
  strokeLine(g, [x - 66, y + 14, x - 40, y + 8, x - 24, y + 12], 5, LINE); strokeLine(g, [x - 66, y + 14, x - 40, y + 8, x - 24, y + 12], 3, '#3e3438');
  // reeds at the edges, low wisps of mist over the water
  g.strokeStyle = '#5a7a3a'; g.lineWidth = 1.8; for (let k = 0; k < 16; k++) { const rx = x - 76 + k * 10 + hash1(k) * 6, ry = y + 30 - Math.abs(k - 8) * 2; polyline(g, [rx, ry, rx + 1, ry - 10 - hash1(k * 3) * 6]); g.stroke(); }
  for (const [dx, dy, rx, a] of [[-56, 20, 40, 0.3], [60, 18, 40, 0.3], [0, 30, 60, 0.22]]) lightPool(g, x + dx, y + dy, rx, rx * 0.12, '224,236,220', a);
}
// palms: clustered along the beach, a few up on the far side
function palm(g, x, y, k, flip, seed) {
  const R = mulberry(seed);
  g.save(); g.translate(x, y); g.scale(k * (flip ? -1 : 1), k);
  lineStyle('#10221a', 0.75);
  const lean = R.r(4, 18), ht = R.r(42, 56);
  g.strokeStyle = LINE; g.lineWidth = 6.4; curve(g, [0, 0, lean * 0.6, -ht * 0.5, lean, -ht]); g.stroke();
  g.strokeStyle = '#8a6a44'; g.lineWidth = 3.6; g.stroke();
  g.strokeStyle = '#5a422a'; g.lineWidth = 1; for (let s = 0; s < 6; s++) { const f = s / 6, px = lean * f * f, py = -ht * f; polyline(g, [px - 2, py, px + 2, py - 1]); g.stroke(); }
  const n = 6 + (R() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.55 + R.r(-0.12, 0.12), L = R.r(20, 32);
    const tip = [lean + Math.cos(a) * L, -ht + Math.sin(a) * L * 0.6 + L * 0.45], mid = [lean + Math.cos(a) * L * 0.5, -ht + Math.sin(a) * L * 0.5 - 4];
    const leaf = (g) => { g.beginPath(); g.moveTo(lean, -ht); g.quadraticCurveTo(mid[0] - 3, mid[1] - 3, tip[0], tip[1]); g.quadraticCurveTo(mid[0] + 3, mid[1] + 4, lean, -ht); g.closePath(); };
    ink(g, leaf, i % 2 ? '#3a8a3e' : '#48a046', 1.4, (g) => { g.strokeStyle = rgba('#1a4a20', 0.8); g.lineWidth = 1; g.beginPath(); g.moveTo(lean, -ht); g.quadraticCurveTo(mid[0], mid[1], tip[0], tip[1]); g.stroke(); });
  }
  ink(g, (g) => { g.beginPath(); g.arc(lean, -ht + 1, 3.4, 0, TAU); }, '#6a4a2a', 1);
  g.restore();
}
function paintPalms(g) {
  for (const [x, y, k, f] of [[202, 344, 0.95, 0], [216, 356, 0.7, 1], [292, 404, 0.9, 0], [308, 412, 0.66, 1], [322, 406, 0.8, 0], [586, 440, 0.95, 1], [602, 444, 0.72, 0], [620, 434, 0.85, 1], [672, 418, 0.9, 1], [690, 410, 0.65, 0],
    [296, 222, 0.55, 0], [318, 216, 0.42, 1], [366, 210, 0.5, 1], [654, 210, 0.52, 1], [720, 226, 0.6, 0], [742, 230, 0.45, 1], [252, 238, 0.55, 1], [372, 362, 0.66, 1], [620, 330, 0.7, 0], [580, 372, 0.66, 1]])
    if (!inClear(x, y, 22)) palm(g, x, y, k, f, (x * 3 + y) | 0);   // (never in front of a spot)
}
// painter 2's painted ship marker and compass rose (assets/si/simap_ship.webp, simap_compass.webp, 2x, 120x120 game px boxes): drawn in place
// of the vector ones once loaded (MAP_SPRITES on when the files are in: no request for a file that is not there)
const MAP_SPRITES = true;   // (painter 2's files are in: assets/si/simap_ship.webp, simap_compass.webp, 2026-10-23)
const SPRITES = { ship: null, compass: null, state: '' };
// the chart's frame over the vista: parchment border, rivets, the compass rose, a vignette
function paintFrame(g) {
  const R = mulberry(2610);
  const vg = g.createRadialGradient(W / 2, H / 2, 230, W / 2, H / 2, 640); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,8,24,0.42)'); g.fillStyle = vg; g.fillRect(22, 22, W - 44, H - 44);
  g.fillStyle = '#e9d8ac'; g.fillRect(0, 0, W, 22); g.fillRect(0, H - 22, W, 22); g.fillRect(0, 0, 22, H); g.fillRect(W - 22, 0, 22, H);
  g.strokeStyle = '#7a5a30'; g.lineWidth = 3; g.strokeRect(22, 22, W - 44, H - 44); g.strokeStyle = '#3a2814'; g.lineWidth = 2.4; g.strokeRect(5, 5, W - 10, H - 10);
  g.fillStyle = 'rgba(122,90,48,0.25)';
  for (let i = 0; i < 160; i++) { const x = R() * W, y = R() * H; if (x > 22 && x < W - 22 && y > 22 && y < H - 22) continue; g.beginPath(); g.arc(x, y, 1 + R() * 2, 0, TAU); g.fill(); }
  for (const [x, y] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]]) { g.fillStyle = '#b8903a'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); g.strokeStyle = '#3a2814'; g.lineWidth = 1.8; g.stroke(); }
  if (SPRITES.compass) g.drawImage(SPRITES.compass, 96 - 60, 458 - 64, 120, 120);   // (painted: its disc centred on 96,458)
  else { g.save(); g.translate(96, 458);
  g.fillStyle = 'rgba(233,216,172,0.94)'; g.beginPath(); g.arc(0, 0, 46, 0, TAU); g.fill(); g.strokeStyle = '#3a2814'; g.lineWidth = 2.4; g.stroke(); g.beginPath(); g.arc(0, 0, 38, 0, TAU); g.stroke();
  for (let k = 0; k < 8; k++) { const a = k * TAU / 8, L = k % 2 ? 24 : 40; g.fillStyle = k % 2 ? '#8a6a3a' : '#c0392b'; g.beginPath(); g.moveTo(Math.cos(a) * L, Math.sin(a) * L); g.lineTo(Math.cos(a + 0.35) * 8, Math.sin(a + 0.35) * 8); g.lineTo(Math.cos(a - 0.35) * 8, Math.sin(a - 0.35) * 8); g.closePath(); g.fill(); g.strokeStyle = '#3a2814'; g.lineWidth = 1.4; g.stroke(); }
  g.fillStyle = '#3a2814'; g.font = 'bold 15px Bangers, Impact, sans-serif'; g.textAlign = 'center'; g.fillText('N', 0, -48);
  g.restore(); }
  // Scarlet's course in from the corner (dashes)
  g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 3.4; g.setLineDash([9, 8]); g.beginPath(); g.moveTo(930, 504); g.bezierCurveTo(912, 468, 884, 438, 852, 412); g.stroke(); g.setLineDash([]);   // (up the right side: clear of the info plate's corner)
  g.strokeStyle = '#d03a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(922, 496); g.lineTo(938, 512); g.moveTo(938, 496); g.lineTo(922, 512); g.stroke();
}
/** tooling: the code vista alone (no frame, no UI) on a fresh canvas at `scale` (1920x1080 at 2): the painted builder's paint-over
 * source.  Not used by the game. */
export function exportVista(scale = 2) {
  const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
  const g = c.getContext('2d'); g.setTransform(scale, 0, 0, scale, 0, 0); paintVista(g);
  return c;
}
function strokeLine(g, pts, lw, col) { polyline(g, pts); g.lineWidth = lw; g.strokeStyle = col; g.stroke(); }

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE OBJECT
// ---------------------------------------------------------------------------------------------------------------
// the painted vista's crown (its towers and spires, 3 px out): what the storm's wisps keep clear of
const CROWN = [425, 176, 425, 176, 426, 141.5, 427, 139, 446, 139, 447, 141.5, 448, 176, 449, 146.5, 450, 146.5, 451, 132.5, 455, 127, 457, 120.5, 464, 120.5, 465, 125, 468, 130, 469, 129.5, 471, 121.5, 479, 121, 484, 111.5, 490, 111.5, 492, 116.5, 500, 126.5, 501, 137, 507, 137, 508, 139, 514, 128, 515, 123.5, 522, 123.5, 523, 128, 528, 136, 529, 144, 531, 144, 532, 140, 536, 135.5, 537, 131.5, 544, 131.5, 545, 135.5, 549, 140, 550, 144, 551, 176, 551, 176];
export function createStage() {
  let C = null, S = 1, M = null, bgSel = null, wonN = -1, popT = -9;   // (wonN / popT: a new wedge's pop on the Sun Key)
  const build = () => {
    const sc = clamp(Math.min(S, 1.5), 0.5, 1.5), L = layerCanvas(W, H, sc);
    if (!L) return null;
    L.g.setTransform(L.sc, 0, 0, L.sc, 0, 0);
    if (PAINT.img) L.g.drawImage(PAINT.img, 0, 0, W, H); else paintVista(L.g);
    paintFrame(L.g);
    return { c: L.c, sc: L.sc, painted: !!PAINT.img, compass: !!SPRITES.compass };
  };
  // the painted vista: loaded once (PAINTED_URL) and kept (an <img>: not canvas memory) -- every rebuild paints it, never the code vista first
  const PAINT = { img: null, state: PAINTED_URL ? 'idle' : 'none', wait: [] };
  const loadPaint = () => {
    if (PAINT.state !== 'idle') return;
    PAINT.state = 'loading';
    const im = new Image();
    const done = (ok) => { PAINT.state = ok ? 'done' : 'none'; for (const f of PAINT.wait.splice(0)) f(ok); };
    im.onload = () => { PAINT.img = im; if (C) { freeCanvases(C); C = build(); } done(true); };   // (only rebuilt if there is one: a load landing after release() allocates nothing)
    im.onerror = () => done(false);
    im.src = new URL(PAINTED_URL, import.meta.url).href;
  };
  const loadSprites = () => {   // (painter 2's painted ship marker and compass rose: in place of the vector ones once loaded)
    if (!MAP_SPRITES || SPRITES.state) return; SPRITES.state = 'loading';
    for (const [k, url] of [['ship', '../../assets/si/simap_ship.webp'], ['compass', '../../assets/si/simap_compass.webp']]) {
      const im = new Image(); im.onload = () => { SPRITES[k] = im; if (k === 'compass' && C) { freeCanvases(C); C = build(); } }; im.onerror = () => {}; im.src = new URL(url, import.meta.url).href;
    }
  };
  let failAt = -1e9;   // (when a build last failed: the painting draws without a cache meanwhile)
  const ensure = () => { if (C && SPRITES.compass && !C.compass) { freeCanvases(C); C = null; }   // (built before the compass sprite was in -- by this instance or another)
    if (!C) { const now = performance.now(); if (now - failAt > 2000) { C = build(); if (!C) failAt = now; } } loadPaint(); return C; };
  // the storm's live wisps: spiral arms turning slowly over the painted cloud, a bolt now and then in its eye -- clipped to the sky
  // minus the fortress, so they never cross the mountain
  function swirl(ctx, t) {
    const x = 490, y = 56, rot = t * 0.3;
    ctx.save();
    ctx.beginPath(); ctx.rect(22, 22, W - 44, HORIZON - 22); ctx.clip();   // (the sky...)
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.moveTo(CROWN[0], CROWN[1]); for (let i = 2; i < CROWN.length; i += 2) ctx.lineTo(CROWN[i], CROWN[i + 1]); ctx.closePath(); ctx.clip('evenodd');   // (...minus the painted crown: two clips, so no part of it slips back in)
    ctx.lineCap = 'round';
    ctx.save(); ctx.beginPath(); ctx.ellipse(490, 60, 455, 66, 0, 0, TAU); ctx.clip(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';   // (inside the painted cloud; butt ends: the runs' joints never double up into beads)
    for (let arm = 0; arm < 3; arm++) for (const [w, col] of [[18, '120,60,190', 0.2], [7, '236,170,255', 0.22]].map(([w2, c2, a2]) => [w2, [c2, a2]])) {
      ctx.lineWidth = w;
      const pt = (i) => { const r = 10 + i * 7, a = rot + arm * TAU / 3 + r * 0.026; return [x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 0.24]; };
      for (let i0 = 0; i0 < 40; i0 += 4) {   // (drawn in short runs, the last ones fading: no hard end at the clip)
        const fade = i0 < 32 ? 1 : (40 - i0) / 8;
        ctx.strokeStyle = `rgba(${col[0]},${(col[1] * fade).toFixed(3)})`; ctx.beginPath();
        for (let i = i0; i <= i0 + 4; i++) { const [px, py] = pt(i); if (i === i0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.stroke();
      }
    }
    ctx.restore();
    // a bolt (a line, not a flash): about every 3.3 s, from the cloud's underside down past the towers (in the gap under the UI), or far
    // off at a side, striking the sea
    const f = Math.max(0, Math.sin(t * 1.9)) ** 12, n = Math.floor(t * 1.9 / Math.PI) % 4;
    if (f > 0.05) {
      const P = [[418, 112, 430, 126, 422, 132, 440, 152], [562, 112, 550, 128, 558, 134, 540, 152], [96, 108, 110, 122, 100, 130, 116, 142], [866, 112, 852, 124, 862, 130, 846, 142]][n];
      for (const [w, c] of [[7, `rgba(190,120,255,${0.35 * f})`], [3, `rgba(230,190,255,${0.85 * f})`], [1.4, `rgba(255,250,255,${f})`]]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) ctx.lineTo(P[i], P[i + 1]); ctx.stroke(); }
    }
    ctx.restore();
  }
  // the skull's eyes glowing, the cave's lava breathing (slow, small: never a flash)
  function embers(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const e = 0.75 + 0.25 * Math.sin(t * 1.6);
    for (const ex of [-20, 20]) { const gr = ctx.createRadialGradient(SI_PALACE.x + ex, SI_PALACE.y - 58, 1, SI_PALACE.x + ex, SI_PALACE.y - 58, 24); gr.addColorStop(0, `rgba(220,120,255,${0.45 * e})`); gr.addColorStop(1, 'rgba(160,60,255,0)'); ctx.fillStyle = gr; ctx.fillRect(SI_PALACE.x + ex - 24, SI_PALACE.y - 82, 48, 48); }
    const c = SI_NODES[0], l = 0.8 + 0.2 * Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1);
    const gr = ctx.createRadialGradient(c.x, c.y + 12, 2, c.x, c.y + 12, 40); gr.addColorStop(0, `rgba(255,170,60,${0.4 * l})`); gr.addColorStop(1, 'rgba(255,100,30,0)'); ctx.fillStyle = gr; ctx.fillRect(c.x - 40, c.y - 28, 80, 80);
    ctx.restore();
  }
  function glow(ctx, n, state, t) {
    const won = M?.won?.includes(n.id), built = n.id === 'palace' || M?.built?.includes(n.id) !== false;
    let col = NODE_COL[n.id], a = 0.55;
    if (won) { col = '255,214,70'; a = 0.5; } else if (!built) { col = '150,150,160'; a = 0.22; } else if (n.id === 'palace' && !M?.palace) { col = '120,100,150'; a = 0.2; }
    const sel = M && M.sel === n.id, r = (sel ? 66 : 50) + 6 * Math.sin(t * 3 + n.x);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(n.x, n.y - 6, 4, n.x, n.y - 6, r);
    g.addColorStop(0, `rgba(${col},${a * (sel ? 1.3 : 1)})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(n.x - r, n.y - 6 - r, r * 2, r * 2);
    ctx.restore();
    void state;
  }
  /** the Treasure Room's spot: a little sandbar with palms and a gold chest, glinting (SI_TREASURE: src/simap.js) */
  function treasureSpot(ctx, t) {
    const { x, y } = SI_TREASURE;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#e8d090'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 22, 62, 20, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-12, 17, 34, 7, 0, 0, TAU); ctx.fill();
    // a palm, leaning
    ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-40, 18); ctx.quadraticCurveTo(-48, -10, -34, -34); ctx.stroke(); ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 3.4; ctx.stroke();
    ctx.fillStyle = '#3aa84a'; ctx.lineWidth = 2.6; ctx.strokeStyle = INK; for (const a of [-2.6, -1.9, -1.2, -0.5, 0.2]) { ctx.beginPath(); ctx.moveTo(-34, -34); ctx.quadraticCurveTo(-34 + Math.cos(a) * 22, -34 + Math.sin(a) * 20 - 8, -34 + Math.cos(a) * 34, -34 + Math.sin(a) * 28 + 6); ctx.quadraticCurveTo(-34 + Math.cos(a) * 20, -34 + Math.sin(a) * 14, -34, -34); ctx.fill(); ctx.stroke(); }
    // the chest
    ctx.lineJoin = 'round'; ctx.fillStyle = '#6a3a1e'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.rect(-4, 2, 44, 24); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7a4624'; ctx.beginPath(); ctx.moveTo(-4, 2); ctx.quadraticCurveTo(-4, -16, 18, -17); ctx.quadraticCurveTo(40, -16, 40, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8b43a'; for (const bx of [4, 28]) { ctx.beginPath(); ctx.rect(bx, -14, 6, 40); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.rect(13, -2, 10, 11); ctx.fill(); ctx.stroke();
    // the glint
    const k = 0.5 + 0.5 * Math.sin(t * 4), r = 9 + 7 * k; ctx.translate(30, -26); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 2); g.addColorStop(0, 'rgba(255,250,200,0.9)'); g.addColorStop(1, 'rgba(255,200,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fffbe0'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8, rr = i % 2 ? r * 0.3 : r * 1.1; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
    ctx.restore();
    if (M && M.sel !== 'treasure') pill(ctx, 'TREASURE ROOM', x, y + 54, 22, '#ffe066');
  }
  /** a gold wedge-of-the-key badge: the won spots wear one */
  function wedgeBadge(ctx, x, y, k, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.08);
    ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.arc(0, 10, 22, -Math.PI / 2 - 0.5 - k * 0, -Math.PI / 2 + 0.5 + k * 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff2a0'; ctx.beginPath(); ctx.arc(0, -4, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawBack(ctx, camX = 0, t = 0) {
    void camX;
    const B = ensure();
    ctx.save();
    if (B) ctx.drawImage(B.c, 0, 0, W, H); else { ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; if (PAINT.img) ctx.drawImage(PAINT.img, 0, 0, W, H); else paintVista(ctx); paintFrame(ctx); ctx.restore(); }   // (no cache could be had: painted live, never a blank map)
    // the live sea: glints drifting (only on the water)
    ctx.strokeStyle = 'rgba(235,250,255,0.5)'; ctx.lineCap = 'round';
    for (let i = 0; i < 30; i++) {
      const y = HORIZON + 10 + ((i * 53) % (H - HORIZON - 40)), k = (y - HORIZON) / (H - HORIZON), x = ((i * 97 + t * (4 + (i % 5) * 2) * (0.5 + k)) % (W - 60)) + 30;
      if (inside(COAST, x, y + 6) || inside(COAST, x + 16, y + 6)) continue;
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 2 + i); ctx.lineWidth = 1 + k * 1.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6 + k * 14, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    swirl(ctx, t);
    embers(ctx, t);
    const sel = (M && M.sel) || bgSel;
    const T = M && M.treasure;   // (the Treasure Room's spot: once the five doubloons are found)
    for (const n of [...SI_NODES, SI_PALACE, ...(T ? [SI_TREASURE] : [])]) glow(ctx, n, M, t);
    if (T) treasureSpot(ctx, t);
    // the won wedges on their spots; the palace's padlock while it is shut
    for (const n of SI_NODES) if (M?.won?.includes(n.id)) wedgeBadge(ctx, n.x, n.y - 62, 1, t);
    for (const n of SI_NODES) if (M && M.sel !== n.id) { const sel = false, lab = n.id === 'cave' ? 'CAVE OF RAGE' : n.id === 'swamp' ? 'SWAMP OF DESPAIR' : 'CELL OF SLOTH'; pill(ctx, lab, n.x + (n.id === 'swamp' ? 172 : 0), n.y + (n.id === 'swamp' ? 24 : 52), sel ? 25 : 22, M.won.includes(n.id) ? '#ffd23a' : sel ? '#ffffff' : '#fff1d6', sel); }   // (a name on a navy pill under every spot not chosen: the chosen one's name is the big plate below, and the ship sits by it)
    if (M && !M.palace) { ctx.save(); ctx.translate(SI_PALACE.x, SI_PALACE.y - 62); ctx.fillStyle = '#d6a82a'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-11, -2, 22, 18, 4) : ctx.rect(-11, -2, 22, 18); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -3, 8, Math.PI, 0); ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
    if (M && M.sel !== 'palace') {   // (the palace's name on a pill on its stairs: dim, with a padlock, while it is shut; gold once the Sun Key is whole)
      const open = !!M.palace, s2 = 18, lab = 'SKULL PALACE', x = SI_PALACE.x, y = SI_PALACE.y + 50;
      ctx.font = `bold ${s2}px Bangers, Impact, sans-serif`; const tw = ctx.measureText(lab).width, lw = open ? 0 : 18, w = tw + s2 * 0.9 + lw, h = s2 * 1.18, x0 = x - w / 2;
      ctx.save(); ctx.fillStyle = open ? 'rgba(20,34,66,0.92)' : 'rgba(15,26,51,0.72)'; ctx.strokeStyle = open ? '#f2c14a' : 'rgba(242,193,74,0.5)'; ctx.lineWidth = open ? 2.6 : 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y - h * 0.78, w, h, h / 2) : ctx.rect(x0, y - h * 0.78, w, h); ctx.fill(); ctx.stroke();
      if (!open) { const lx = x0 + s2 * 0.45 + 7, ly = y - h * 0.26; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(lx, ly - 3, 4.2, Math.PI, 0); ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = '#a8946a'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#a8946a'; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx - 6.5, ly - 3, 13, 10, 2) : ctx.rect(lx - 6.5, ly - 3, 13, 10); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK; ctx.fillRect(lx - 1, ly + 0.5, 2, 3.4); }   // (a little padlock)
      ctx.restore();
      txt(ctx, lab, x + lw / 2, y, s2, open ? '#ffd23a' : '#aaa2bc');
    }
    // the cursor: Scarlet's ship bobbing beside the chosen spot (a bobbing arrow when it is the palace)
    const sn = [...SI_NODES, SI_PALACE, ...(T ? [SI_TREASURE] : [])].find((n) => n.id === sel);
    if (sn) {
      const bx = sn.id === 'palace' ? 330 : sn.id === 'treasure' ? sn.x + 126 : sn.x + (sn.id === 'cave' ? -128 : sn.id === 'cell' ? 120 : sn.id === 'swamp' ? -128 : 0), by = (sn.id === 'palace' ? 420 : sn.id === 'swamp' ? sn.y + 6 : sn.id === 'treasure' ? sn.y + 22 : sn.y + 34) + Math.sin(t * 3) * (sn.id === 'treasure' || sn.id === 'swamp' ? 2 : 4);   // (clear of the labels, the plate and the ring at the ship's bigger size)   // (docked on open water, clear of the plate)   // (the ship waits on the shore, never up the mountain)
      ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.sin(t * 2.4) * 0.08); if (SPRITES.ship) ctx.drawImage(SPRITES.ship, -54, -88, 108, 108); else { ctx.scale(1.3, 1.3);   // (Scarlet's ship, a size up, a gold outline under its ink: it reads across the room)
      ctx.lineJoin = 'round'; ctx.strokeStyle = '#f2c14a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-30, -4); ctx.lineTo(30, -4); ctx.lineTo(20, 14); ctx.lineTo(-22, 14); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-2, -44); ctx.quadraticCurveTo(26, -28, 22, -6); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-2, -52); ctx.stroke();
      ctx.fillStyle = '#5a1a2a'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-30, -4); ctx.lineTo(30, -4); ctx.lineTo(20, 14); ctx.lineTo(-22, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c8323c'; ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-2, -44); ctx.quadraticCurveTo(26, -28, 22, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(10, -26, 4, 0, TAU); ctx.fill();
      ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-2, -52); ctx.stroke();
      }
      ctx.restore();
      // the chosen spot's ring
      ctx.save(); ctx.beginPath(); ctx.ellipse(sn.x, sn.y + (sn.id === 'swamp' ? -6 : 4), 72 + Math.sin(t * 4) * 3, sn.id === 'swamp' ? 44 : 52, 0, 0, TAU); ctx.strokeStyle = 'rgba(20,12,30,0.7)'; ctx.lineWidth = 6.4; ctx.stroke(); ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 3.4; ctx.setLineDash([9, 7]); ctx.lineDashOffset = -t * 30; ctx.stroke(); ctx.restore();   // (a dark underlay: the dashes read on the painted hot spots too)
    }
    ctx.restore();
  }
  // a label on a little navy pill with a gold rim (the Book 2 UI's), the text centred on (x, y)
  const pill = (ctx, s, x, y, size, fill = '#fff1d6', hot = false) => {
    ctx.font = `bold ${size}px Bangers, Impact, sans-serif`; const w = ctx.measureText(s).width + size * 0.9, h = size * 1.18;
    ctx.save(); ctx.fillStyle = hot ? 'rgba(20,34,66,0.92)' : 'rgba(15,26,51,0.86)'; ctx.strokeStyle = '#f2c14a'; ctx.lineWidth = hot ? 2.6 : 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h * 0.78, w, h, h / 2) : ctx.rect(x - w / 2, y - h * 0.78, w, h); ctx.fill(); ctx.stroke(); ctx.restore();
    txt(ctx, s, x, y, size, fill);
  };
  const txt = (ctx, s, x, y, size, fill = '#fff1d6', align = 'center') => { ctx.font = `bold ${size}px Bangers, Impact, sans-serif`; ctx.textAlign = align; ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.26; ctx.strokeStyle = INK; ctx.strokeText(s, x, y); ctx.fillStyle = fill; ctx.fillText(s, x, y); };
  function drawFront(ctx, camX = 0, t = 0) {
    void camX;
    if (!M) return;
    const nodes = [...SI_NODES, SI_PALACE, ...(M.treasure ? [SI_TREASURE] : [])], n = nodes.find((q) => q.id === M.sel);
    ctx.save();
    // the banner
    ctx.fillStyle = '#c8323c'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(270, 28); ctx.lineTo(690, 28); ctx.lineTo(712, 52); ctx.lineTo(690, 76); ctx.lineTo(270, 76); ctx.lineTo(248, 52); ctx.closePath(); ctx.fill(); ctx.stroke();
    txt(ctx, 'SKULL ISLAND', 480, 62, 38, '#ffe066');
    // the Sun Key: a round disc in three wedges, won ones golden
    const kx = 862, ky = 116, kr = 44;
    ctx.fillStyle = 'rgba(20,14,34,0.7)'; ctx.beginPath(); ctx.arc(kx, ky, kr + 8, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    if (wonN < 0) wonN = M.won.length; else if (M.won.length > wonN) { wonN = M.won.length; popT = t; }   // (a new wedge just landed: it pops)
    SI_NODES.forEach((q, i) => {
      const a0 = -Math.PI / 2 + i * TAU / 3 + 0.05, a1 = a0 + TAU / 3 - 0.1, won = M.won.includes(q.id), pop = won && q.id === M.won[M.won.length - 1] && t - popT < 1.2 ? 1 + 0.32 * Math.exp(-(t - popT) * 4) * Math.abs(Math.cos((t - popT) * 9)) : 1, kr2 = kr * pop;
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.arc(kx, ky, kr2, a0, a1); ctx.closePath();
      ctx.fillStyle = won ? '#ffd23a' : 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.strokeStyle = won ? INK : 'rgba(255,230,160,0.55)'; ctx.lineWidth = won ? 3 : 2; if (!won) ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      if (won) {
        ctx.save(); ctx.beginPath(); ctx.moveTo(kx, ky); ctx.arc(kx, ky, kr2, a0, a1); ctx.closePath(); ctx.clip();
        const rs = kr2 * 0.36;
        for (let k = 0; k < 12; k++) { const a = -Math.PI / 2 + k * Math.PI / 6, hw = 0.09; ctx.beginPath(); ctx.moveTo(kx + Math.cos(a - hw) * rs, ky + Math.sin(a - hw) * rs); ctx.lineTo(kx + Math.cos(a) * kr2 * 0.86, ky + Math.sin(a) * kr2 * 0.86); ctx.lineTo(kx + Math.cos(a + hw) * rs, ky + Math.sin(a + hw) * rs); ctx.closePath(); ctx.fillStyle = '#ffe690'; ctx.fill(); ctx.strokeStyle = 'rgba(90,56,10,0.85)'; ctx.lineWidth = 1; ctx.stroke(); }   // (the rays)
        ctx.beginPath(); ctx.arc(kx, ky, rs, 0, TAU); ctx.fillStyle = '#ffeaa0'; ctx.fill(); ctx.strokeStyle = 'rgba(70,40,8,0.9)'; ctx.lineWidth = 1.4; ctx.stroke();   // (the face, its part on this piece)
        ctx.strokeStyle = '#6a3c08'; ctx.lineWidth = 1.6; ctx.beginPath();
        if (q.id === 'cave') ctx.arc(kx + rs * 0.42, ky - rs * 0.3, rs * 0.2, Math.PI * 1.15, Math.PI * 1.85);
        else if (q.id === 'cell') ctx.arc(kx - rs * 0.42, ky - rs * 0.3, rs * 0.2, Math.PI * 1.15, Math.PI * 1.85);
        else ctx.arc(kx, ky + rs * 0.1, rs * 0.5, Math.PI * 0.25, Math.PI * 0.75);
        ctx.stroke();
        ctx.restore();
      }
    });
    pill(ctx, 'SUN KEY', kx, ky + kr + 30, 22, '#ffe9a8');
    // the plate: the chosen spot's name and what waits there
    if (n) {
      const px = 150, py = 484, pw = 660;
      ctx.fillStyle = 'rgba(24,16,40,0.88)'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py - 32, pw, 62, 14) : ctx.rect(px, py - 32, pw, 62); ctx.fill(); ctx.stroke();
      txt(ctx, n.name, 480, py - 4, 30, '#ffe066');
      const built = n.id === 'palace' ? M.palace : n.id === 'treasure' ? true : M.built.includes(n.id), won = M.won.includes(n.id);
      const line = M.said || (n.id === 'palace' ? (M.palace ? n.blurb : 'Shut tight. Win all THREE wedges first!') : !built ? 'COMING SOON: this stage is not ready yet.' : won ? 'WEDGE WON!  Pick another spot.' : n.blurb);
      txt(ctx, line, 480, py + 22, 19, won && !M.said ? '#ffd23a' : M.said ? '#ffb0a0' : '#fff1d6');
    }
    const k = M.touch ? 'TAP' : (M.confirmKey || 'ENTER');
    ctx.fillStyle = 'rgba(15,26,51,0.86)'; ctx.strokeStyle = 'rgba(242,193,74,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(186, 78, 588, 36, 18) : ctx.rect(186, 78, 588, 36); ctx.fill(); ctx.stroke();   // (its foot above the painted central spire's tip)
    txt(ctx, M.touch ? 'TAP a spot, TAP again to sail!' : `◀ ▶  choose a spot     ${k}  to sail     ${M.backKey || 'BACK'}  menu`, 480, 105, M.touch ? 25 : 22, 'rgba(255,241,214,0.97)');   // (a size up: read from the sofa)
    if (M.done) {   // (every stage built is won: nothing else to sail to yet)
      ctx.fillStyle = 'rgba(24,16,40,0.9)'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(30, 130, 270, 112, 14) : ctx.rect(30, 130, 270, 112); ctx.fill(); ctx.stroke();
      txt(ctx, 'THAT IS ALL FOR NOW!', 165, 164, 22, '#ffe066'); txt(ctx, 'The other spots are coming soon.', 165, 190, 17); txt(ctx, M.touch ? 'Tap the pause button for the menu.' : `Press ${M.backKey || 'BACK'} for the menu.`, 165, 214, 17, '#bff0ff');
    }
    void t;
    ctx.restore();
  }
  function drawProp() {}
  /** the scene's state (src/simap.js): { sel, won, built, said, palace, touch, confirmKey, backKey } */
  function setMap(m) { M = m || null; }
  /** a story panel's look: bg.sel lights one spot */
  function setStory(bg) { bgSel = bg && bg.sel ? bg.sel : null; M = null; }
  loadPaint(); loadSprites();   // (the painting starts loading with the stage, not on its first draw)
  return {
    setScale(s) { s = clamp(+s || 1, 0.5, 4); if (C && Math.abs(clamp(Math.min(s, 1.5), 0.5, 1.5) - clamp(Math.min(S, 1.5), 0.5, 1.5)) > 0.001) { freeCanvases(C); C = null; } S = s; failAt = -1e9; },   // (rebuilt only when the cache's own scale changes)
    /** resolves (true / false) once the painted vista has loaded (or failed): the loader can hold its card up until then */
    ready() { loadPaint(); return PAINT.state === 'done' || PAINT.state === 'none' ? Promise.resolve(PAINT.state === 'done') : new Promise((r) => PAINT.wait.push(r)); },
    setWarm() {}, setStory, setMap, drawBack, drawFront, drawProp,
    info() { const B = ensure(); return { canvases: B ? 1 : 0, megapixels: B ? +((B.c.width * B.c.height) / 1e6).toFixed(2) : 0, approxMB: B ? +((B.c.width * B.c.height * 4) / 1048576).toFixed(1) : 0, painted: !!(B && B.painted) }; },
    release() { if (C) freeCanvases(C); C = null; failAt = -1e9; },
  };
}
export const PROP_INFO = {};
