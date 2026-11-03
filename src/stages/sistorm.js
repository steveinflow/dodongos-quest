// Dodongo's Quest - Skull Island: THE STORM SEA (src/stages/sistorm.js), the backdrop of the optional bonus ride between the Kraken and the island map
// (src/stormride.js, docs/SKULL_ISLAND.md "Phase 4: the Storm Sea ride"): the Scarlet Dawn sails through Malachar's storm.  A story-less stage: drawn LIVE each
// frame but for three small cached cloud sheets (storm and dawn versions, crossfaded as it breaks: ~2 MB at DPR 2), the sea and sky only -- the ride draws the ship, the kraken, the foes and the waves between the two halves
// of this module (drawBack: the sky, the far island, the sea rows behind the ship; drawFront: the near foam strip over everything low).
//   setStorm(k 0..1)   how far the storm has broken: 0 = black-violet clouds and a dark green-grey sea, 1 = a pink-gold dawn on a blue sea
//   setFlash(f 0..1)   a lightning flash (the whole sky), setBolt(x | null): a fork from the clouds to the sea at that x
//   setGlow(g 0..1 | null)  the clouds' and the island's light from the flash on its own (reduced motion: 0); unset, it follows setFlash
//   setIsland(a 0..1)  Skull Island's cone on the horizon, bigger as the ship nears (its castle and the storm spiral over it)
//   swell(x, t)        the sea's surface offset at x (the ship rides it); SEA_Y the horizon, WL the ship's waterline row
import { W, H, INK } from '../config.js';
import { cacheCanvas, freeCanvases, IOS } from '../canvasmem.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hash1 = (n) => { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };

const smooth = (t) => t * t * (3 - 2 * t);
function mulberry(seed) {
  let q = seed >>> 0;
  const f = () => { q = (q + 0x6d2b79f5) >>> 0; let t = q; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.r = (a, b) => a + (b - a) * f();
  return f;
}
const rgbOf = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const rgba = (c, a) => { const p = rgbOf(c); return `rgba(${p[0]},${p[1]},${p[2]},${a})`; };
function vgrad(g, x, y0, w, y1, stops) { const gr = g.createLinearGradient(0, y0, 0, y1); for (const [o, c] of stops) gr.addColorStop(o, c); g.fillStyle = gr; g.fillRect(x, y0, w, y1 - y0); }
// a heaped cloud (the palace's storm heaps): puffs of very different sizes along its silhouette over one solid body, lit from above as one,
// a core shadow low in it, the light from below on its belly, its base dissolving into the air (a feathered fade, never a cut)
function heap(g, cx, cy, w, hgt, sd, base, top, under) {
  const R = mulberry(sd), puffs = [], n = 5 + Math.floor(w / 60), bL = R(), bR = R();
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), crest = Math.sin(u * Math.PI) ** 0.8, r = hgt * (0.12 + 0.3 * crest) * R.r(0.6, 1.25);
    const r2 = hgt * (0.2 + 0.26 * crest) * R.r(0.8, 1.15);
    puffs.push([cx - w / 2 + (0.17 + 0.66 * u) * w + R.r(-10, 10), cy - hgt * (0.4 + 0.52 * crest + 0.08 * (1 - crest)) + r2 * 0.5, r2, 1]);   // (every puff over the body, the end ones big and high: no hanging bits)
  }
  const body = (g) => {
    g.beginPath();
    for (const [x, y, r, f] of puffs) { g.moveTo(x + r, y); g.ellipse(x, y, r, r * f, 0, 0, TAU); }
    const iL = w * (0.04 + 0.1 * bL), iR = w * (0.04 + 0.1 * bR);
    const xr = cx + w / 2 - iR - w * 0.1, xl = cx - w / 2 + iL + w * 0.14, yb = cy - hgt * 0.06;
    const xL0 = cx - w / 2 + w * 0.14 + iL * 0.3, xR0 = cx + w / 2 - w * 0.14 - iR * 0.3;
    g.moveTo(xL0, cy - hgt * 0.42); g.lineTo(xR0, cy - hgt * 0.42); g.quadraticCurveTo(xR0 + w * 0.04, cy - hgt * 0.3, xr, yb - hgt * 0.1);   // (the body inside its end puffs, its corners rounded)
    for (let q = 0; q < 4; q++) { const x0 = lerp(xr, xl, q / 4), x1 = lerp(xr, xl, (q + 1) / 4); g.quadraticCurveTo((x0 + x1) / 2, yb + hgt * (0.05 + 0.08 * R()), x1, yb - hgt * (q === 3 ? 0.1 : 0.02 * R())); }   // (a scalloped belly: no flat base)
    g.quadraticCurveTo(xL0 - w * 0.04, cy - hgt * 0.3, xL0, cy - hgt * 0.42); g.closePath();
  };
  body(g); g.fillStyle = base; g.fill();
  g.save(); body(g); g.clip();
  vgrad(g, cx - w, cy - hgt * 1.2, w * 2.4, cy, [[0, rgba(top, 0.85)], [0.35, rgba(top, 0.25)], [0.62, rgba(top, 0)], [1, 'rgba(8,6,24,0.35)']]);
  const lg = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); lg.addColorStop(0, rgba(top, 0.22)); lg.addColorStop(0.5, rgba(top, 0)); lg.addColorStop(1, rgba(top, 0));   // (and from the left: the sun's side)
  g.fillStyle = lg; g.fillRect(cx - w, cy - hgt * 1.3, w * 2, hgt * 1.4);
  const cg = g.createRadialGradient(cx + w * 0.12, cy - hgt * 0.2, 0, cx + w * 0.12, cy - hgt * 0.2, w * 0.4); cg.addColorStop(0, 'rgba(8,6,24,0.3)'); cg.addColorStop(1, 'rgba(8,6,24,0)');   // (the core shadow: east of centre, away from the sun)
  g.fillStyle = cg; g.fillRect(cx - w, cy - hgt * 0.2 - w * 0.4, w * 2, w * 0.8);   // (the whole gradient: no straight cut across the puffs above it)
  vgrad(g, cx - w, cy - hgt * 0.3, w * 2, cy, [[0, rgba(under, 0)], [1, rgba(under, 0.5)]]);
  g.restore();
}
// the cloud sheets: three bands (far, mid, near), each SHEET_W wide and tiling, in the storm's colours and the dawn's
const SHEET_W = 1400;
const BANDS = [   // [top, height, heaps, size, storm (base, top light, belly), dawn (base, top light, belly)]
  [10, 150, 6, 0.8, ['#3a2c4e', '#8a7898', '#8a4a8a'], ['#e2a2a8', '#fff2d8', '#f6b088']],
  [40, 170, 5, 1.0, ['#30223f', '#7a6890', '#a050a8'], ['#d88c98', '#ffe8c8', '#ffb07a']],
  [96, 150, 4, 1.15, ['#261a34', '#6a5880', '#b858c0'], ['#c87888', '#ffdcc0', '#ffa070']],
];
function paintSheet(g, b, dawn) {
  const [top, hh, n, sz, sc, dc] = BANDS[b], [base, lit, belly] = dawn ? dc : sc, R = mulberry(4100 + b * 37);
  for (let k = 0; k < n; k++) {
    const x = (k + R.r(0.1, 0.7)) * SHEET_W / n, w = R.r(220, 340) * sz, hgt = R.r(70, 110) * sz, cy = top + hh - R.r(0, 30);   // (the same places in both sheets)
    if (dawn && k % 2 === 1 && k < n - 1) continue;   // (the dawn: fewer clouds, each solid)
    for (const dx of [-SHEET_W, 0, SHEET_W]) if (x + dx + w > -10 && x + dx - w < SHEET_W + 10) heap(g, x + dx, cy, w, hgt, 900 + b * 50 + k, base, lit, belly);   // (wrapped: the sheet tiles; a copy wholly off the sheet isn't painted)
  }
  { const dp = dabPat(g, 'cloud'); if (dp && dp.setTransform && typeof DOMMatrix === 'function') { const k = SHEET_W / (7 * 192); dp.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0])); g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = dp; g.fillRect(-10, 0, SHEET_W + 20, top + hh + 20); g.restore(); dp.setTransform(new DOMMatrix()); } }   // (the brush in the clouds: dabs of light and shade, baked; the tile's period divides the sheet's)
  g.save(); g.globalCompositeOperation = 'destination-out';   // (the band's foot feathered away into the air: no hard base, no blobs)
  const fg = g.createLinearGradient(0, top + hh - 46, 0, top + hh + 14); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = fg; g.fillRect(-10, top + hh - 46, SHEET_W + 20, 80);
  g.restore();
}
export const LEVEL_LEN = 960;
export const SECTIONS = [{ id: 'storm', name: 'The Storm Sea', x0: 0, x1: 960 }];
export const PROP_INFO = {};
export const SEA_Y = 226;   // the horizon
const SUN_X = 230;   // (the dawn sun: west of the island at any size)
export const WL = 432;         // the ship's waterline (the middle row of the sea)
/** the sea's surface at screen x, time t (s): a long swell and a short chop, in px (negative = up) */
export const swell = (x, t) => Math.sin(x * 0.011 + t * 1.5) * 7 + Math.sin(x * 0.026 - t * 2.4) * 3;
const mixh = (a, b, k) => { const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return '#' + pa.map((v, i) => Math.round(lerp(v, pb[i], k)).toString(16).padStart(2, '0')).join(''); };   // (a hex mix, for nesting)
const mixc = (a, b, k) => { const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], k))).join(',')})`; };


// ---- PAINT (QA A5): dab tiles -- soft light and dark blotches and brush marks on a transparent tile, laid over the big fills through a
// pattern: baked into the cloud sheets (source-atop), a second fill on each sea row (finer with distance), the island's rock, the ship.
// 'cloud': round blotches and short strokes every way; 'sea': long flat dabs and level strokes.  Made once (~0.25 MB), not a cache.
let DABS = null;
function dabTile(kind) {
  DABS ||= {};
  if (DABS[kind] !== undefined) return DABS[kind];
  DABS[kind] = null;
  try {
    const sea = kind === 'sea', TW = sea ? 256 : 192, TH = sea ? 96 : 192, c = document.createElement('canvas'); c.width = TW; c.height = TH;
    const g = c.getContext('2d'); if (!g) return null;
    const R = mulberry(sea ? 7311 : 7307), wrapXY = (fn) => { for (const dx of [-TW, 0, TW]) for (const dy of [-TH, 0, TH]) fn(dx, dy); };
    for (let i = 0; i < (sea ? 90 : 64); i++) {
      const x = R() * TW, y = R() * TH, rx = sea ? R.r(14, 48) : R.r(12, 40), ry = sea ? rx * R.r(0.12, 0.28) : rx * R.r(0.7, 1), light = R() < (sea ? 0.45 : 0.5), a = R.r(0.05, sea ? 0.17 : 0.15);
      const col = light ? (sea ? '214,232,255' : '255,244,255') : (sea ? '2,10,22' : '8,2,18');
      wrapXY((dx, dy) => { g.save(); g.translate(x + dx, y + dy); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); });
    }
    g.lineCap = 'round';
    for (let i = 0; i < (sea ? 80 : 50); i++) {   // (a few soft broad strokes: brushwork, never scratches)
      const x = R() * TW, y = R() * TH, l = sea ? R.r(16, 44) : R.r(10, 24), an = sea ? R.r(-0.04, 0.04) : R.r(-0.5, 0.5), light = R() < 0.5;
      g.strokeStyle = light ? `rgba(236,244,255,${R.r(0.03, 0.07).toFixed(3)})` : `rgba(4,6,20,${R.r(0.03, 0.08).toFixed(3)})`; g.lineWidth = sea ? R.r(1.6, 3.4) : R.r(2.4, 4.4);
      g.beginPath(); wrapXY((dx, dy) => { g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(an) * l, y + dy + Math.sin(an) * l); }); g.stroke();
    }
    DABS[kind] = c;
  } catch { DABS[kind] = null; }
  return DABS[kind];
}
const PATS = new WeakMap();   // (a context -> its patterns, made once)
function dabPat(g, kind) { const tl = dabTile(kind); if (!tl) return null; let m = PATS.get(g); if (!m) { m = {}; PATS.set(g, m); } if (m[kind] === undefined) { try { m[kind] = g.createPattern(tl, 'repeat') || false; } catch { m[kind] = false; } } return m[kind] || null; }
const rr = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };

// the sea's texture plate (local y 0 = the horizon, h tall, periodic in W): soft level dabs and brush strokes, small and dense far, big near
function paintSeaTex(g, h) {
  const R = mulberry(5151), wr = (fn) => { for (const dx of [-W, 0, W]) fn(dx); };
  for (let i = 0; i < 1100; i++) {
    const v = Math.pow(R(), 1.5), y = 8 + v * (h - 8), d = 0.28 + 1.15 * v, x = R() * W, rx = R.r(10, 34) * d, ry = rx * R.r(0.1, 0.22), light = R() < 0.42, a = R.r(0.05, 0.15);
    const col = light ? '214,232,255' : '2,10,22';
    wr((dx) => { if (x + dx + rx < 0 || x + dx - rx > W) return; g.save(); g.translate(x + dx, y); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(${col},${a.toFixed(3)})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); });
  }
  g.lineCap = 'round';
  for (let i = 0; i < 280; i++) {
    const v = Math.pow(R(), 1.3), y = 8 + v * (h - 8), d = 0.28 + 1.15 * v, x = R() * W, l = R.r(14, 46) * d, dy = R.r(-0.6, 0.6), light = R() < 0.5;
    g.strokeStyle = light ? `rgba(236,244,255,${R.r(0.03, 0.08).toFixed(3)})` : `rgba(4,8,20,${R.r(0.04, 0.09).toFixed(3)})`; g.lineWidth = R.r(1.2, 3) * d;
    g.beginPath(); wr((dx) => { g.moveTo(x + dx, y); g.lineTo(x + dx + l, y + dy); }); g.stroke();
  }
}
// the near water's plate (local y 0 = just above row 6's crests; periodic in W): big level dabs, long lit strokes riding the swell
function paintSeaTexNear(g, h) {
  const R = mulberry(5191), wr = (fn) => { for (const dx of [-W, 0, W]) fn(dx); };
  for (let i = 0; i < 420; i++) {
    const v = R(), y = 6 + v * (h - 6), d = 1.3 + 0.7 * v, x = R() * W, rx = R.r(14, 40) * d, ry = rx * R.r(0.1, 0.2), light = R() < 0.45, a = R.r(0.05, 0.14);
    const col = light ? '214,232,255' : '2,10,22';
    wr((dx) => { if (x + dx + rx < 0 || x + dx - rx > W) return; g.save(); g.translate(x + dx, y); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(${col},${a.toFixed(3)})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); });
  }
  g.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    const y = 8 + R() * (h - 8), x = R() * W, l = R.r(40, 110), bow = R.r(-3, 3), light = R() < 0.6;
    g.strokeStyle = light ? `rgba(230,244,255,${R.r(0.05, 0.11).toFixed(3)})` : `rgba(4,8,20,${R.r(0.05, 0.1).toFixed(3)})`; g.lineWidth = R.r(1.6, 3.6);
    g.beginPath(); wr((dx) => { g.moveTo(x + dx, y); g.quadraticCurveTo(x + dx + l / 2, y + bow, x + dx + l, y + bow * 0.4); }); g.stroke();
  }
}
// ---- THE SCARLET DAWN, painted (the Storm Sea ride and its offer; QA A5): src/galleon.js's own geometry -- the waterline at y 0, the bow
// to +x, the rail at y -40 (the ride's crew and cannons stand on it), the masts at -70 / 40, the sails' shapes, the sun figurehead at
// 206,-66 -- painted: planked strakes with their grain and a warm lit sheer, a gilt wale, gun ports glowing low, a gilt rail, a bowsprit
// and jib, stays and shrouds, the crimson sails bellied and brushed, a stern lantern.  Cached (the hull, each sail) at the scale it is
// drawn (quantized), the pennant, the lantern's glow and the bow's foam live.  The caller's transform places and scales it.
let SHIPC = null;
const shipScale = (ctx) => { const m = ctx.getTransform ? ctx.getTransform() : null; return m ? Math.hypot(m.a, m.b) : 1; };
export function freeDawnShip() { if (SHIPC) { for (const k of ['hull', 'sailA', 'sailB', 'jib']) if (SHIPC[k]) freeCanvases(SHIPC[k].c); SHIPC = null; } }
function shipSprite(x, y, w, h, sc, paint) {
  let r = cacheCanvas(Math.ceil(w * sc), Math.ceil(h * sc));
  if (!r) { sc *= 0.5; r = cacheCanvas(Math.ceil(w * sc), Math.ceil(h * sc)); }   // (a memory cap: half the scale before painting it live each frame)
  if (!r) return null;
  r.g.setTransform(sc, 0, 0, sc, -x * sc, -y * sc); r.g.lineJoin = 'round'; r.g.lineCap = 'round'; paint(r.g);
  return { c: r.c, x, y, w, h, paint };
}
const hsh = (a, b) => hash1(a * 7919 + b * 104729);
const DAWN_SAILS = [[-70, 84], [40, 96]];
function sailPath(g, mx, w) { g.beginPath(); g.moveTo(mx - w / 2, -172); g.quadraticCurveTo(mx, -160, mx + w / 2, -172); g.quadraticCurveTo(mx + w / 2 + 18, -116, mx + w / 2 - 4, -62); g.quadraticCurveTo(mx, -76, mx - w / 2 + 4, -62); g.quadraticCurveTo(mx - w / 2 + 14, -116, mx - w / 2, -172); g.closePath(); }
function hullPath(g) { g.beginPath(); g.moveTo(-170, -40); g.lineTo(160, -40); g.quadraticCurveTo(190, -50, 200, -70); g.lineTo(150, 4); g.lineTo(-140, 4); g.quadraticCurveTo(-170, -10, -170, -40); g.closePath(); }
function paintHull(g) {
  // the bowsprit, under everything at the bow
  g.strokeStyle = INK; g.lineWidth = 9; g.beginPath(); g.moveTo(178, -56); g.lineTo(268, -100); g.stroke(); g.strokeStyle = '#6a4228'; g.lineWidth = 5; g.stroke(); g.strokeStyle = 'rgba(255,214,160,0.35)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(180, -59); g.lineTo(266, -102); g.stroke();
  // the stays and shrouds (fine dark lines: behind the sails)
  g.strokeStyle = 'rgba(28,18,16,0.9)'; g.lineWidth = 1.5; g.beginPath();
  g.moveTo(40, -202); g.lineTo(266, -100); g.moveTo(-70, -190); g.lineTo(-168, -44); g.moveTo(-70, -188); g.lineTo(38, -200);
  for (const [mx, top] of [[-70, -186], [40, -198]]) for (const d of [-44, -26, 26, 44]) { g.moveTo(mx, top + 14); g.lineTo(mx + d, -41); }
  g.stroke();
  g.strokeStyle = 'rgba(28,18,16,0.55)'; g.lineWidth = 0.9; g.beginPath();   // (ratlines across the shrouds)
  for (const [mx, top] of [[-70, -186], [40, -198]]) for (let k = 1; k < 7; k++) { const u = k / 7, y = top + 14 + (-41 - top - 14) * u; g.moveTo(mx - 44 * u, y); g.lineTo(mx + 44 * u, y); }
  g.stroke();
  // the masts: turned wood lit on the left, a yard over each sail, a crow's nest on the fore
  for (const [mx, top, w] of [[-70, -194, 84], [40, -208, 96]]) {
    g.fillStyle = '#5a3a24'; g.fillRect(mx - 4, top, 8, -38 - top); g.fillStyle = 'rgba(255,214,160,0.35)'; g.fillRect(mx - 4, top, 2.4, -38 - top); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(mx + 1.6, top, 2.4, -38 - top);
    g.strokeStyle = INK; g.lineWidth = 2.4; g.strokeRect(mx - 4, top, 8, -38 - top);
    g.fillStyle = '#4a2c1c'; rr(g, mx - w / 2 - 10, -179, w + 20, 6, 3); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,214,160,0.3)'; g.fillRect(mx - w / 2 - 8, -178.5, w + 16, 1.6);
  }
  g.fillStyle = '#5a3a24'; g.beginPath(); g.moveTo(26, -194); g.lineTo(54, -194); g.lineTo(51, -182); g.lineTo(29, -182); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke();   // (the crow's nest)
  g.fillStyle = 'rgba(255,214,160,0.3)'; g.fillRect(28, -193, 24, 2);
  // the hull: strakes of planks, each its own tone, grain and butt joints; lit warm along the sheer, wet and dark at the waterline
  hullPath(g); g.fillStyle = '#4a2c1c'; g.fill();
  g.save(); hullPath(g); g.clip();
  const ST = [-44, -33, -22, -13, -4, 6];
  for (let r = 0; r < ST.length - 1; r++) {
    const y0 = ST[r], y1 = ST[r + 1];
    for (let x = -190 + hsh(r, 1) * 60, i = 0; x < 240; i++) {
      const L = 70 + hsh(r, i + 2) * 60, h = hsh(r * 31 + i, 5), tone = h < 0.33 ? '#5a3622' : h < 0.66 ? '#4a2c1c' : '#6a4228';
      g.fillStyle = tone; g.fillRect(x, y0, L + 0.5, y1 - y0);
      g.strokeStyle = 'rgba(20,10,6,0.35)'; g.lineWidth = 0.8; g.beginPath();
      for (let k = 0; k < 2; k++) { const yy = y0 + (y1 - y0) * (0.3 + 0.4 * k) + (hsh(i, r + k) - 0.5) * 2; g.moveTo(x + 4, yy); g.quadraticCurveTo(x + L * 0.5, yy + (hsh(i + k, r) - 0.5) * 3, x + L - 4, yy + 0.5); }
      g.stroke();
      g.strokeStyle = 'rgba(14,6,4,0.75)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
      g.fillStyle = 'rgba(14,6,4,0.8)'; g.fillRect(x + 3, y0 + (y1 - y0) * 0.45, 1.6, 1.6);
      x += L;
    }
    g.strokeStyle = 'rgba(14,6,4,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-190, y0); g.lineTo(240, y0); g.stroke();
  }
  { const dp = dabPat(g, 'cloud'); if (dp) { const ga = g.globalAlpha; g.globalAlpha = ga * 0.9; g.fillStyle = dp; g.fillRect(-190, -50, 430, 60); g.globalAlpha = ga; } }   // (the brush)
  vgrad(g, -190, -44, 430, -20, [[0, 'rgba(255,196,130,0.3)'], [1, 'rgba(255,196,130,0)']]);   // (the sheer lit warm)
  vgrad(g, -190, -16, 430, 6, [[0, 'rgba(6,10,14,0)'], [1, 'rgba(6,10,14,0.5)']]);   // (wet and dark down to the water)
  g.fillStyle = 'rgba(40,90,70,0.25)'; for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(-140 + i * 22 + hsh(i, 9) * 10, -1 + hsh(i, 8) * 3, 9 + hsh(i, 7) * 8, 2, 0, 0, TAU); g.fill(); }   // (weed at the waterline)
  g.strokeStyle = 'rgba(206,170,255,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-168, -39); g.lineTo(160, -39); g.quadraticCurveTo(188, -48, 198, -68); g.stroke();   // (the storm's light along the sheer)
  g.restore();
  // the gilt wale, its shadow under it
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-160, -27, 300, 3);
  g.fillStyle = '#b8862a'; g.fillRect(-160, -33, 300, 6); g.fillStyle = 'rgba(255,240,170,0.75)'; g.fillRect(-160, -33, 300, 1.5); g.strokeStyle = INK; g.lineWidth = 1.4; g.strokeRect(-160, -33, 300, 6);
  // the gun ports: dark mouths with a warm glow low in each, framed
  for (let i = 0; i < 6; i++) {
    const x = -120 + i * 46;
    g.fillStyle = '#120a08'; g.fillRect(x, -24, 14, 11);
    const gg = g.createRadialGradient(x + 7, -16, 0, x + 7, -16, 9); gg.addColorStop(0, 'rgba(255,170,80,0.55)'); gg.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = gg; g.fillRect(x, -24, 14, 11);
    g.strokeStyle = '#2a1a10'; g.lineWidth = 2.2; g.strokeRect(x - 1, -25, 16, 13); g.strokeStyle = 'rgba(255,214,160,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 1, -25.5); g.lineTo(x + 15, -25.5); g.stroke();
  }
  // the gilt rail: turned posts under a cap rail along the deck (the crew stand in front of it)
  g.fillStyle = '#6a4228'; g.strokeStyle = INK; g.lineWidth = 1.3;
  for (let x = -160; x <= 150; x += 18) { g.fillRect(x - 1.6, -50, 3.2, 10); g.strokeRect(x - 1.6, -50, 3.2, 10); }
  g.fillStyle = '#8a5a2a'; rr(g, -168, -53, 330, 4.5, 2); g.fill(); g.lineWidth = 2; g.stroke(); g.fillStyle = 'rgba(255,226,150,0.7)'; g.fillRect(-166, -52.6, 326, 1.2);
  // the hull's ink
  hullPath(g); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
  // the stern lantern on its bracket
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(-165, -42); g.lineTo(-172, -62); g.lineTo(-178, -62); g.stroke();
  g.fillStyle = '#ffd27a'; rr(g, -185, -73, 13, 15, 2); g.fill(); g.strokeStyle = '#3a2a14'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#b8862a'; g.fillRect(-186, -76, 15, 3.4); g.fillRect(-186, -59, 15, 2.6);
  g.fillStyle = 'rgba(255,255,230,0.85)'; g.fillRect(-181, -70, 4, 8);
  // the sun figurehead (the galleon's, painted: lit from the upper left)
  const fx = 206, fy = -66;
  g.strokeStyle = INK; g.lineWidth = 6.4; for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.5 + (i - 4) * 0.36; g.beginPath(); g.moveTo(fx + Math.cos(a) * 20, fy + Math.sin(a) * 20); g.lineTo(fx + Math.cos(a) * 31, fy + Math.sin(a) * 31); g.stroke(); }
  g.strokeStyle = '#e6b43a'; g.lineWidth = 3.4; for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.5 + (i - 4) * 0.36; g.beginPath(); g.moveTo(fx + Math.cos(a) * 20, fy + Math.sin(a) * 20); g.lineTo(fx + Math.cos(a) * 30, fy + Math.sin(a) * 30); g.stroke(); }
  { const sg = g.createRadialGradient(fx - 6, fy - 7, 2, fx, fy, 20); sg.addColorStop(0, '#fff2a0'); sg.addColorStop(0.5, '#ffd23a'); sg.addColorStop(1, '#c88a1a'); g.fillStyle = sg; g.beginPath(); g.arc(fx, fy, 19, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke(); }
  g.fillStyle = '#ff9a2a'; g.beginPath(); g.arc(fx, fy, 13, 0, TAU); g.fill(); g.fillStyle = '#ffe58a'; g.beginPath(); g.arc(fx - 3, fy - 4, 6.4, 0, TAU); g.fill();
  g.fillStyle = INK; g.beginPath(); g.arc(fx - 5, fy - 2, 2, 0, TAU); g.arc(fx + 5, fy - 2, 2, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(fx, fy + 3, 6, 0.2, Math.PI - 0.2); g.stroke();
}
function paintDawnSail(g, mx, w) {
  sailPath(g, mx, w);
  const sg = g.createLinearGradient(mx - w / 2, 0, mx + w / 2 + 18, 0); sg.addColorStop(0, '#8a2219'); sg.addColorStop(0.5, '#d8483a'); sg.addColorStop(1, '#a8302a');
  g.fillStyle = sg; g.fill();
  g.save(); sailPath(g, mx, w); g.clip();
  vgrad(g, mx - w, -176, w * 2.2, -120, [[0, 'rgba(255,226,200,0.22)'], [1, 'rgba(255,226,200,0)']]);   // (lit under the yard)
  g.fillStyle = 'rgba(60,8,10,0.38)'; g.beginPath(); g.ellipse(mx + w * 0.18, -70, w * 0.62, 24, 0, 0, TAU); g.fill();   // (the shadow under its belly)
  g.fillStyle = 'rgba(255,170,140,0.16)'; g.beginPath(); g.ellipse(mx - w * 0.12, -120, w * 0.22, 30, 0, 0, TAU); g.fill();   // (the light in its belly)
  g.strokeStyle = 'rgba(80,10,10,0.45)'; g.lineWidth = 1.2; g.beginPath();   // (the cloths' seams, bowed with the belly)
  for (const u of [-0.28, 0, 0.28]) { const x = mx + u * w; g.moveTo(x, -170); g.quadraticCurveTo(x + 8 + u * 10, -116, x + u * 6, -66); }
  g.stroke();
  g.strokeStyle = 'rgba(255,214,190,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(mx - w / 2 + 6, -150); g.quadraticCurveTo(mx + 4, -140, mx + w / 2 + 6, -150); g.stroke();   // (the reef band)
  g.fillStyle = 'rgba(40,6,6,0.6)'; for (let k = 0; k < 6; k++) { const x = mx - w / 2 + 12 + k * (w - 18) / 5; g.beginPath(); g.arc(x, -148 + Math.sin((k / 5) * Math.PI) * 6, 1.6, 0, TAU); g.fill(); }   // (reef points)
  { const dp = dabPat(g, 'cloud'); if (dp) { const ga = g.globalAlpha; g.globalAlpha = ga * 0.95; g.fillStyle = dp; g.fillRect(mx - w, -180, w * 2.2, 130); g.globalAlpha = ga; } }   // (the brush in the canvas)
  vgrad(g, mx - w, -90, w * 2.2, -60, [[0, 'rgba(40,6,8,0)'], [1, 'rgba(40,6,8,0.28)']]);   // (wet and dark at the foot)
  // the gold sun on it
  g.strokeStyle = INK; g.lineWidth = 2.4; for (let i = 0; i < 10; i++) { const a = i * TAU / 10; g.beginPath(); g.moveTo(mx + 4 + Math.cos(a) * 17, -112 + Math.sin(a) * 17); g.lineTo(mx + 4 + Math.cos(a) * 25, -112 + Math.sin(a) * 25); g.lineWidth = 4.6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 2.6; g.strokeStyle = '#ffd23a'; g.stroke(); }
  { const sg2 = g.createRadialGradient(mx, -116, 2, mx + 4, -112, 16); sg2.addColorStop(0, '#fff2a0'); sg2.addColorStop(1, '#e6a82a'); g.fillStyle = sg2; g.beginPath(); g.arc(mx + 4, -112, 15, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke(); }
  g.restore();
  sailPath(g, mx, w); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
}
function paintJib(g) {   // (a little cream jib on the forestay)
  const P = () => { g.beginPath(); g.moveTo(126, -160); g.quadraticCurveTo(200, -118, 258, -102); g.quadraticCurveTo(206, -96, 168, -70); g.quadraticCurveTo(150, -110, 126, -160); g.closePath(); };
  P(); const jg = g.createLinearGradient(130, 0, 250, 0); jg.addColorStop(0, '#d8c8a8'); jg.addColorStop(1, '#f4ead4'); g.fillStyle = jg; g.fill();
  g.save(); P(); g.clip(); g.fillStyle = 'rgba(90,60,40,0.25)'; g.beginPath(); g.ellipse(170, -86, 40, 14, -0.4, 0, TAU); g.fill(); { const dp = dabPat(g, 'cloud'); if (dp) { g.fillStyle = dp; g.fillRect(120, -170, 150, 110); } } g.restore();
  P(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
}
export function drawDawnShip(ctx, t) {
  const need = Math.min(2.5, Math.max(0.5, Math.ceil(shipScale(ctx) * 4) / 4));
  if (!SHIPC || SHIPC.sc < need - 1e-6 || SHIPC.sc > need * 1.6) {
    freeDawnShip();
    SHIPC = { sc: need, hull: shipSprite(-196, -218, 470, 230, need, paintHull), sailA: shipSprite(-70 - 52, -184, 124, 128, need, (g) => paintDawnSail(g, -70, 84)), sailB: shipSprite(40 - 58, -184, 136, 128, need, (g) => paintDawnSail(g, 40, 96)), jib: shipSprite(118, -168, 150, 104, need, paintJib) };
  }
  const C = SHIPC, put = (sp, paint) => { if (sp) ctx.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h); else { ctx.save(); paint(ctx); ctx.restore(); } };
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  put(C.hull, paintHull);
  put(C.jib, paintJib);
  DAWN_SAILS.forEach(([mx, w], i) => {   // (the wind in them: each breathes about its mast)
    ctx.save(); ctx.translate(mx, -120); ctx.scale(1 + 0.03 * Math.sin(t * 3 + i * 1.3), 1); ctx.translate(-mx, 120);
    put(i ? C.sailB : C.sailA, (g) => paintDawnSail(g, mx, w));
    ctx.restore();
  });
  // the pennant at the fore masthead: crimson, a gold sun, rippling
  const fl = Math.sin(t * 5);
  ctx.fillStyle = '#c8301f'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(40, -222); ctx.quadraticCurveTo(66, -224 + fl * 4, 96, -212 + fl * 3); ctx.quadraticCurveTo(68, -206 - fl * 3, 40, -198); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(54, -211, 4.4, 0, TAU); ctx.fill();
  // the lantern's warm glow, flickering
  { const k = 0.85 + 0.15 * Math.sin(t * 7) * Math.sin(t * 11.3), gg = ctx.createRadialGradient(-179, -65, 2, -179, -65, 34); gg.addColorStop(0, `rgba(255,200,110,${(0.5 * k).toFixed(3)})`); gg.addColorStop(1, 'rgba(255,170,80,0)'); ctx.fillStyle = gg; ctx.fillRect(-214, -100, 70, 70); }
  // foam at the bow, breaking and spilling back along the waterline
  ctx.strokeStyle = 'rgba(236,248,255,0.85)'; ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) { const ph = t * 3.6 + i * 1.9, x = 204 - i * 20 + Math.sin(ph) * 3, r = 13 - i * 1.6; ctx.lineWidth = 3.4 - i * 0.4; ctx.beginPath(); ctx.arc(x, 2, Math.max(4, r), Math.PI * (1.05 + 0.05 * Math.sin(ph)), Math.PI * 1.75); ctx.stroke(); }   // (crescents of foam curling off the bow)
  ctx.fillStyle = 'rgba(236,248,255,0.8)'; for (let i = 0; i < 7; i++) { const ph = t * 5 + i * 2.3, fx = 214 + Math.sin(ph) * 10 - i * 6, fy = -10 - Math.abs(Math.sin(ph * 0.7)) * 12; ctx.beginPath(); ctx.ellipse(fx, fy, 2.4, 1.2, -0.5, 0, TAU); ctx.fill(); }   // (spray flecks)
  ctx.fillStyle = 'rgba(232,246,255,0.0)';
  for (let i = 0; i < 0; i++) { const ph = t * 4 + i * 1.7, x = 196 - i * 16 + Math.sin(ph) * 3, y = -4 + (i % 2) * 3 + Math.cos(ph) * 1.5, r = 8 - i * 0.8 + Math.sin(ph * 1.3) * 1.5; ctx.beginPath(); ctx.arc(x, y, Math.max(2, r), 0, TAU); ctx.fill(); }
  ctx.restore();
}
/** the offer card's scene: the Scarlet Dawn hove-to at the lower left, painted, as in the ride (the caller draws it between the stage's
 *  back and front halves, so the near waves lap her hull) */
export function drawOfferShip(ctx, t) {
  const x = 96, bob = swell(x, t) * 0.5, roll = Math.sin(t * 1.3) * 0.022;
  ctx.save(); ctx.translate(x, WL + 9 + bob); ctx.rotate(roll); ctx.scale(0.34, 0.34); drawDawnShip(ctx, t); ctx.restore();
}
/** one choice on the offer card: a rounded navy plaque with a gilt rim; the chosen one lit warm from within, a small sun at its left
 *  (the label is the caller's: src/sioffer.js) */
export function drawOfferRow(ctx, x, y, w, h, on, t = 0) {
  ctx.save();
  rr(ctx, x + 3, y + 5, w, h, 12); ctx.fillStyle = 'rgba(4,2,12,0.45)'; ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, on ? '#3a3a6a' : '#22305a'); g.addColorStop(1, on ? '#22244a' : '#131c3c');
  rr(ctx, x, y, w, h, 12); ctx.fillStyle = g; ctx.fill();
  if (on) { ctx.save(); rr(ctx, x, y, w, h, 12); ctx.clip(); const rg = ctx.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, w * 0.55); rg.addColorStop(0, `rgba(255,214,110,${(0.3 + 0.06 * Math.sin(t * 4)).toFixed(3)})`); rg.addColorStop(1, 'rgba(255,214,110,0)'); ctx.fillStyle = rg; ctx.fillRect(x, y, w, h); ctx.restore(); }
  rr(ctx, x, y, w, h, 12); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = on ? 3 : 2; ctx.strokeStyle = on ? '#ffe066' : 'rgba(230,180,58,0.6)'; ctx.stroke();
  if (on) { const cx = x + 26, cy = y + h / 2; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + t; ctx.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); ctx.lineTo(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13); } ctx.stroke(); ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}
/** the offer card's painted plate: a deep navy board lit from the top and brushed, a gilt frame with sun medallions at its corners, a
 *  gilt rope between the words and the two choices (the text and the rows are the caller's: src/sioffer.js) */
export function drawOfferPlate(ctx, t) {
  const x = 210, y = 54, w = W - 420, h = 396, r = 20;
  ctx.save();
  rr(ctx, x + 6, y + 10, w, h, r); ctx.fillStyle = 'rgba(4,2,12,0.5)'; ctx.fill();   // (its shadow)
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(34,48,92,0.95)'); g.addColorStop(0.55, 'rgba(20,30,64,0.95)'); g.addColorStop(1, 'rgba(12,18,42,0.96)');
  rr(ctx, x, y, w, h, r); ctx.fillStyle = g; ctx.fill();
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  { const dp = dabPat(ctx, 'cloud'); if (dp && dp.setTransform && typeof DOMMatrix === 'function') { dp.setTransform(new DOMMatrix([2.6, 0, 0, 2.6, x, y])); ctx.globalAlpha *= 0.6; ctx.fillStyle = dp; ctx.fillRect(x, y, w, h); dp.setTransform(new DOMMatrix()); } }   // (the brush in it, light, one broad pass: no tile repeat)
  const rg = ctx.createRadialGradient(W / 2, y + 64, 10, W / 2, y + 64, 280); rg.addColorStop(0, 'rgba(255,214,120,0.17)'); rg.addColorStop(1, 'rgba(255,214,120,0)'); ctx.fillStyle = rg; ctx.fillRect(x, y, w, h);   // (a warm light behind the title)
  const vg = ctx.createLinearGradient(0, y + h - 90, 0, y + h); vg.addColorStop(0, 'rgba(4,6,18,0)'); vg.addColorStop(1, 'rgba(4,6,18,0.35)'); ctx.fillStyle = vg; ctx.fillRect(x, y, w, h);
  ctx.restore();
  rr(ctx, x, y, w, h, r); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3.6; ctx.strokeStyle = '#e6b43a'; ctx.stroke();   // (the gilt frame)
  rr(ctx, x + 10, y + 10, w - 20, h - 20, r - 8); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(242,193,74,0.55)'; ctx.stroke();
  const sun = (cx, cy, rad) => {   // (a sun medallion)
    ctx.strokeStyle = INK; ctx.lineWidth = 4.4; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); ctx.lineTo(cx + Math.cos(a) * rad * 1.65, cy + Math.sin(a) * rad * 1.65); } ctx.stroke();
    ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2.2; ctx.stroke();
    const sg = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 1, cx, cy, rad); sg.addColorStop(0, '#fff2a0'); sg.addColorStop(1, '#d8962a'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
  };
  for (const [cx, cy] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) sun(cx, cy, 9);
  // the gilt rope between the words and the choices, a sun at its middle
  const ry = y + 236;
  ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 60, ry); ctx.lineTo(x + w - 60, ry); ctx.stroke();
  ctx.strokeStyle = '#d8a43a'; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.strokeStyle = 'rgba(90,56,10,0.85)'; ctx.lineWidth = 1; ctx.beginPath(); for (let xx = x + 62; xx < x + w - 62; xx += 6) { ctx.moveTo(xx, ry + 1.2); ctx.lineTo(xx + 3, ry - 1.2); } ctx.stroke();
  sun(W / 2, ry, 7);
  void t;
  ctx.restore();
}

// ---- THE BIG WAVES (the Storm Sea ride's: QAF AF1).  A wave 230 x 96 at scale 1, its base centre at (0, 0) on the sea, travelling left:
// 'swell' (the hump as it rises) and 'curl' (its crest pitched over toward the ship: a whitewater lip, the hollow under it, lace on its
// face, spray), each in the storm's dark teal and the dawn's bright blue -- painted once into sprites at the frame's scale (capped 1.5,
// iOS 1.25; half that under a memory cap; painted live only if no canvas can be had) and blitted.  The ride (src/stormride.js) raises it,
// breaks it into the curl, crossfades the palette as the storm clears, and slumps it into spray when the kraken smashes it.
const WBOX = { x: -176, y: -158, w: 352, h: 188 };
const WPAL = [
  { deep: '#0e2428', mid: '#1f4a50', crest: '#3e7c7a', glow: '120,200,190', lace: '214,238,240', foam: '#e8f6f6', fsh: '#8fb4c0' },   // (the storm's)
  { deep: '#0f4a78', mid: '#2384b8', crest: '#58bede', glow: '160,236,255', lace: '236,250,255', foam: '#ffffff', fsh: '#a8d8ec' },   // (the dawn's)
];
let WAVEC = null;
export function freeBigWaves() { if (WAVEC) { for (const k of ['s0', 's1', 'd0', 'd1']) if (WAVEC[k]) freeCanvases(WAVEC[k].c); WAVEC = null; } }
function waveEdge(g, curl) {   // (its silhouette from the back's foot over the crest to the face's foot: the ink line)
  g.moveTo(150, 14);
  if (curl) {
    g.bezierCurveTo(96, 8, 44, -62, -4, -94);         // (its back, up to the crest)
    g.bezierCurveTo(-30, -110, -80, -102, -88, -70);   // (the lip pitching over)
    g.quadraticCurveTo(-90, -56, -82, -50);           // (its tip hanging)
    g.bezierCurveTo(-96, -34, -112, -6, -150, 14);    // (its face, down to the sea from under the lip: the hollow is painted, not cut)
  } else { g.bezierCurveTo(90, 10, 44, -70, -8, -74); g.bezierCurveTo(-52, -76, -96, -8, -150, 14); }
}
function waveShape(g, curl) { g.beginPath(); waveEdge(g, curl); g.closePath(); }
function paintWave(g, curl, dawn, sprite) {
  const P = WPAL[dawn ? 1 : 0], R = mulberry(curl ? 8821 : 8811), top = curl ? -104 : -76, ga0 = g.globalAlpha;   // (ga0: the caller's alpha -- a live paint inside a fade keeps it)
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  waveShape(g, curl);
  const bg = g.createLinearGradient(0, top, 0, 14); bg.addColorStop(0, P.crest); bg.addColorStop(0.45, P.mid); bg.addColorStop(1, P.deep); g.fillStyle = bg; g.fill();
  g.save(); waveShape(g, curl); g.clip();
  { const lg = g.createRadialGradient(-56, -36, 4, -56, -36, 70); lg.addColorStop(0, `rgba(${P.glow},0.3)`); lg.addColorStop(1, `rgba(${P.glow},0)`); g.fillStyle = lg; g.fillRect(-150, -112, 200, 132); }   // (the light through the water, low on its face)
  { const sg = g.createLinearGradient(-10, 0, 150, 0); sg.addColorStop(0, 'rgba(4,10,20,0)'); sg.addColorStop(1, 'rgba(4,10,20,0.32)'); g.fillStyle = sg; g.fillRect(-10, -112, 170, 132); }   // (its back in shade)
  if (curl) { g.save(); g.translate(-62, -54); g.rotate(-0.3); g.scale(1, 0.6); const hg = g.createRadialGradient(0, 0, 2, 0, 0, 30); hg.addColorStop(0, 'rgba(3,12,18,0.85)'); hg.addColorStop(0.55, 'rgba(3,12,18,0.5)'); hg.addColorStop(1, 'rgba(3,12,18,0)'); g.fillStyle = hg; g.fillRect(-32, -32, 64, 64); g.restore(); }   // (the hollow under the lip: a deep pocket in the water, blended into the face -- no ink, nothing seen through it)
  for (let i = 0; i < 12; i++) {   // (the flow: long strokes sweeping up its face toward the crest)
    const x0 = R.r(-140, 120), up = R.r(0.4, 1), a = R.r(0.06, 0.16), light = R() < 0.6;
    g.strokeStyle = light ? `rgba(${P.lace},${a.toFixed(3)})` : `rgba(2,8,18,${(a * 0.8).toFixed(3)})`; g.lineWidth = R.r(1.2, 3.6);
    g.beginPath(); g.moveTo(x0, 12); g.quadraticCurveTo(x0 * 0.7 - 6, -40 * up, x0 * 0.35 - 14, top * up * 0.92); g.stroke();
  }
  for (let i = 0; i < 10; i++) {   // (lace: long irregular streaks of foam sweeping up its face with the flow, each broken once)
    const x0 = R.r(-118, 40), y0 = R.r(curl ? -40 : -46, -8), l = R.r(20, 46), dx = -R.r(8, 18), x1 = x0 + dx, y1 = y0 - l, cx = x0 + R.r(-10, 6), cy = y0 - l * 0.5, br = R.r(0.4, 0.62);
    g.strokeStyle = `rgba(${P.lace},${R.r(0.32, 0.55).toFixed(3)})`; g.lineWidth = R.r(1.2, 2.4);
    const at = (u) => [(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1];
    g.beginPath(); for (const [u0, u1] of [[0, br - 0.06], [br + 0.06, 1]]) { for (let k = 0; k <= 6; k++) { const [px, py] = at(u0 + (u1 - u0) * k / 6); if (k) g.lineTo(px, py); else g.moveTo(px, py); } } g.stroke();
  }
  { const fg = g.createLinearGradient(0, -14, 0, 14); fg.addColorStop(0, `rgba(${P.lace},0)`); fg.addColorStop(0.6, `rgba(${P.lace},0.55)`); fg.addColorStop(1, `rgba(${P.lace},0.8)`); g.fillStyle = fg; g.fillRect(-160, -14, 320, 30); }   // (whitewater where it meets the sea)
  g.restore();
  { const ig = g.createLinearGradient(-160, 0, 100, 0); ig.addColorStop(0, INK); ig.addColorStop(0.8, INK); ig.addColorStop(0.88, 'rgba(33,20,28,0.3)'); ig.addColorStop(1, 'rgba(33,20,28,0)'); g.beginPath(); waveEdge(g, curl); g.strokeStyle = ig; g.lineWidth = 3.2; g.stroke(); }   // (its ink, fading out from where the crest's foam ends to nothing halfway down the back slope: no stick to the sea)
  // the crest's whitewater: ONE band along the crest (thick over the top, thinning down the back and to the lip's tip), its top edge
  // bubbling in long irregular swells, shaded underneath, inked along its top only -- never a string of beads
  const CR = curl ? [[58, -34], [38, -58], [15, -80], [-9, -95], [-33, -103], [-56, -99], [-74, -89], [-85, -75], [-88, -62], [-83, -52]]
    : [[60, -32], [38, -54], [13, -69], [-12, -74], [-36, -69], [-56, -55], [-70, -38]];
  const TH = curl ? [3, 7, 11, 13, 14, 13, 11, 9, 6, 3] : [2, 6, 9, 10, 9, 6, 2];
  const pts = []; for (let i = 0; i < CR.length - 1; i++) for (let j = 0; j < 5; j++) { const u = j / 5; pts.push([CR[i][0] + (CR[i + 1][0] - CR[i][0]) * u, CR[i][1] + (CR[i + 1][1] - CR[i][1]) * u, TH[i] + (TH[i + 1] - TH[i]) * u]); }
  pts.push([CR[CR.length - 1][0], CR[CR.length - 1][1], TH[TH.length - 1]]);
  const upE = [], dnE = [], mid = [];
  pts.forEach(([x, y, th], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, ny = (b[0] - a[0]) / tl;   // (the normal pointing out of the wave)
    const bub = th * (1 + 0.32 * Math.max(0, Math.sin(i * 1.05 + 0.4)) + 0.12 * R());
    upE.push([x + nx * bub * 0.95, y + ny * bub * 0.95]); dnE.push([x - nx * th * 0.7, y - ny * th * 0.7]); mid.push([x + nx * th * 0.1, y + ny * th * 0.1]);
  });
  const smoothLine = (L) => { g.moveTo(L[0][0], L[0][1]); for (let i = 1; i < L.length - 1; i++) g.quadraticCurveTo(L[i][0], L[i][1], (L[i][0] + L[i + 1][0]) / 2, (L[i][1] + L[i + 1][1]) / 2); g.lineTo(L[L.length - 1][0], L[L.length - 1][1]); };
  g.save(); waveShape(g, curl); g.clip(); g.beginPath(); smoothLine(dnE); for (const lw of [28, 22, 16, 11, 7, 4]) { g.strokeStyle = `rgba(${P.glow},0.075)`; g.lineWidth = lw; g.stroke(); } g.restore();   // (the light shining through the thin water just under the crest)
  g.beginPath(); smoothLine(upE); for (let i = dnE.length - 1; i >= 0; i--) g.lineTo(dnE[i][0], dnE[i][1]); g.closePath(); g.fillStyle = P.foam; g.fill();
  g.beginPath(); smoothLine(mid); for (let i = dnE.length - 1; i >= 0; i--) g.lineTo(dnE[i][0], dnE[i][1]); g.closePath(); g.fillStyle = P.fsh; g.globalAlpha = ga0 * 0.7; g.fill(); g.globalAlpha = ga0;   // (its underside in shade)
  g.fillStyle = P.fsh; g.beginPath(); for (let i = 0; i < 22; i++) { const q = pts[Math.floor(R() * pts.length)], r = R.r(1.2, 2.8), x = q[0] + R.r(-4, 4), y = q[1] + R.r(-3, 5); g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); } g.fill();   // (bubbles in it)
  g.beginPath(); smoothLine(upE); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();   // (inked along its top only)
  if (curl) { g.strokeStyle = P.foam; for (const [x0, y0, x1, y1, lw] of [[-82, -54, -86, -22, 3.4], [-72, -50, -70, -30, 2.4], [-62, -54, -58, -40, 1.8]]) { g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 - 3, (y0 + y1) / 2, x1, y1); g.stroke(); } }   // (water pouring off the lip across the hollow)
  if (sprite) { const dp = dabPat(g, 'sea'); if (dp) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = ga0 * 0.85; g.fillStyle = dp; g.fillRect(WBOX.x, WBOX.y, WBOX.w, WBOX.h); g.globalAlpha = ga0; g.globalCompositeOperation = 'source-over'; } }   // (the brush, as in the sea, over all of it -- the light band and the foam too: only into its own sprite)
  g.fillStyle = P.foam; g.beginPath(); for (let i = 0; i < (curl ? 16 : 8); i++) { const x = R.r(-90, 40), y = (curl ? -112 : -84) - R.r(0, 34) * (0.4 + (40 - x) / 130), r = R.r(1.6, 4.2); g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); } g.fill();   // (spray off the crest)
  g.restore();
}
function waveSprite(sc, curl, dawn) {
  let s2 = sc, r = cacheCanvas(Math.ceil(WBOX.w * s2), Math.ceil(WBOX.h * s2));
  if (!r) { s2 = sc * 0.5; r = cacheCanvas(Math.ceil(WBOX.w * s2), Math.ceil(WBOX.h * s2)); }   // (a memory cap: half the scale before painting it live)
  if (!r) return null;
  r.g.setTransform(s2, 0, 0, s2, -WBOX.x * s2, -WBOX.y * s2); paintWave(r.g, curl, dawn, true);
  return { c: r.c };
}
/** the ride's big wave, its base centre at (x, y) on the sea, w x h (230 x 96 at 1).  o: { rise 0..1 (its height), curl (the swell or the
 *  curl), dawn 0..1 (the storm's palette -> the dawn's: same shape, so an exact blend), collapse 0..1 (slumping into the sea, fading) } */
function bigWaveSet(S) {   // (the four sprites at the scale this device wants: made once, a refusal remembered until the scale changes or release(); the curls first -- every wave spends most of its life curled)
  const need = Math.min(IOS ? 1.25 : 1.5, Math.max(0.5, Math.ceil(S * 4) / 4));
  if (!WAVEC || WAVEC.sc !== need) { freeBigWaves(); WAVEC = { sc: need }; for (const [k, curl, dawn] of [['s1', true, false], ['d1', true, true], ['s0', false, false], ['d0', false, true]]) WAVEC[k] = waveSprite(need, curl, dawn); }
}
export function drawBigWave(ctx, x, y, w, h, o = {}) {
  bigWaveSet(shipScale(ctx));
  const sh = o.curl ? '1' : '0', dawn = clamp(o.dawn || 0, 0, 1), col = clamp(o.collapse || 0, 0, 1), rise = clamp(o.rise ?? 1, 0, 1);
  ctx.save();
  try {
  ctx.translate(x, y);
  if (col > 0) { ctx.beginPath(); ctx.rect(-600, -600, 1200, 612); ctx.clip(); ctx.translate(0, col * col * h * 0.95); }   // (slumping: it sinks under the sea's line, clipped there -- never a glassy ghost over what's behind it)
  ctx.scale((w / 230) * (1 + 0.12 * col), (h / 96) * rise * (1 - 0.3 * col)); if (col > 0.8) ctx.globalAlpha *= 1 - (col - 0.8) / 0.2;
  const ga = ctx.globalAlpha, put = (k, a) => { ctx.globalAlpha = ga * a; const sp = WAVEC[k]; if (sp) ctx.drawImage(sp.c, WBOX.x, WBOX.y, WBOX.w, WBOX.h); else { ctx.save(); try { paintWave(ctx, sh === '1', k[0] === 'd', false); } finally { ctx.restore(); } } };
  if (dawn < 0.98) put('s' + sh, 1);
  if (dawn > 0.02) put('d' + sh, dawn < 0.98 ? dawn : 1);   // (over the storm's: the same silhouette, so a true crossfade, never a ghost)
  } finally { ctx.restore(); }
  return true;
}

export function createStage() {
  let storm = 0, flash = 0, bolt = null, island = 0.15, SH = null, SHs = 0, glowSet = null;
  const glowV = () => (glowSet === null ? flash : glowSet);   // (the clouds' and the island's light from a flash: setGlow, else the flash)
  const free = () => { if (SH) for (const o of SH) if (o) freeCanvases(o.c); SH = null; };
  const sheets = (ctx) => {   // (three bands x storm / dawn, at half the frame's scale: soft clouds want no more)
    const S = ctx.getTransform ? Math.abs(ctx.getTransform().a) || 1 : 1, sc = Math.min(IOS ? 1.5 : 2, S);   // (iOS: its lower far-layer cap)   // (per band: 0.4 / 0.5 / 0.6 of this -- the far band softest; at DPR 2 the brush survives)
    if (SH && Math.abs(SHs - sc) < 0.01) return SH;
    free(); SHs = sc; SH = [];
    for (let b = 0; b < 3; b++) for (const dawn of [false, true]) {
      const [top, hh] = BANDS[b]; let sb = sc * [0.4, 0.5, 0.6][b], r = cacheCanvas(Math.round(SHEET_W * sb), Math.round((top + hh + 20) * sb));
      if (!r) { sb *= 0.5; r = cacheCanvas(Math.round(SHEET_W * sb), Math.round((top + hh + 20) * sb)); }   // (a memory cap: half the scale, softer, before the live banks)
      if (!r) { SH.push(null); continue; }
      r.g.setTransform(sb, 0, 0, sb, 0, 0); r.g.lineJoin = 'round'; paintSheet(r.g, b, dawn);
      let y0 = 0;
      try { const d = r.g.getImageData(0, 0, r.c.width, r.c.height).data, w4 = r.c.width * 4; find: for (let y = 0; y < r.c.height; y++) for (let i = y * w4 + 3; i < (y + 1) * w4; i += 4) if (d[i] > 0) { y0 = Math.max(0, y - 1); break find; } } catch { y0 = 0; }   // (once per build)
      SH.push({ c: r.c, h: top + hh + 20, y0 });
    }
    return SH;
  };
  // the rain veils: four soft trapezoids hanging from the cloud bases, uneven dashed streaks down each -- painted once into one atlas at
  // the device's scale (~1.7 MB at DPR 2) and blitted (they only drift and fade); painted live if no cache could be had
  const VEILS = [[120, 120, 5], [440, 170, 7], [700, 96, 6], [900, 140, 8]], VY0 = 106, VH = SEA_Y + 10 - VY0;
  function paintVeil(g, x, w2, va, i) {   // (x: its top-left corner)
    const vg = g.createLinearGradient(0, 110, 0, SEA_Y + 6);
    vg.addColorStop(0, 'rgba(58,46,92,0)'); vg.addColorStop(0.35, `rgba(58,46,92,${va.toFixed(3)})`); vg.addColorStop(1, `rgba(96,74,136,${(va * 0.55).toFixed(3)})`);
    g.fillStyle = vg; const ga = g.globalAlpha;
    for (const [gx, a2] of [[18, 0.45], [0, 0.6]]) { g.globalAlpha = ga * a2; g.beginPath(); g.moveTo(x - gx, 110); g.lineTo(x + w2 + gx, 110); g.lineTo(x + w2 - 44 + gx, SEA_Y + 6); g.lineTo(x - 44 - gx, SEA_Y + 6); g.closePath(); g.fill(); }   // (feathered: a wide faint pass, a narrow one)
    g.globalAlpha = ga; g.lineCap = 'round';
    const R = mulberry(6100 + i * 17), dyT = SEA_Y + 2 - 140;
    for (let q = R.r(2, 9); q < w2; q += R.r(6, 18)) {   // (streaks down it: uneven spacing, strength and length, each broken into dashes)
      const u1 = R.r(0.7, 1); g.strokeStyle = `rgba(150,136,200,${(va * R.r(0.22, 0.6)).toFixed(3)})`; g.lineWidth = R.r(0.7, 1.3); g.beginPath();
      for (let u = R.r(0, 0.25); u < u1;) { const e = Math.min(u1, u + R.r(0.08, 0.26)); g.moveTo(x + q - 40 * u, 140 + dyT * u); g.lineTo(x + q - 40 * e, 140 + dyT * e); u = e + R.r(0.03, 0.1); }
      g.stroke();
    }
  }
  let VA = null, VAs = 0;
  const veilAtlas = (S) => {
    if (VA && Math.abs(VAs - S) < 0.01) return VA.c ? VA : null;   // (a refusal remembered: release() clears it)
    if (VA && VA.c) freeCanvases(VA.c); VA = null; VAs = S;
    const ws = VEILS.map(([, w2]) => w2 + 86), tw = ws.reduce((a2, b2) => a2 + b2 + 2, 0); let vs = S, r = cacheCanvas(Math.ceil(tw * vs), Math.ceil(VH * vs));
    if (!r) { vs = S / 2; r = cacheCanvas(Math.ceil(tw * vs), Math.ceil(VH * vs)); }   // (a memory cap: half scale -- they're soft)
    if (!r) { VA = { c: null }; return null; }
    const xs = []; let ox = 0;
    VEILS.forEach(([, w2], i) => { xs.push(ox); r.g.setTransform(vs, 0, 0, vs, (ox + 64) * vs, -VY0 * vs); paintVeil(r.g, 0, w2, 0.34, i); ox += ws[i] + 2; });
    r.g.setTransform(1, 0, 0, 1, 0, 0);
    VA = { c: r.c, xs, ws }; return VA;
  };
  function sky(ctx, t) {
    const k = storm;
    const g = ctx.createLinearGradient(0, 0, 0, SEA_Y + 10);
    g.addColorStop(0, mixc('#221636', '#2a62b4', k)); g.addColorStop(0.55, mixc('#3a2856', '#7ab0e0', k)); g.addColorStop(1, mixc('#6a2670', '#ffc090', k));
    ctx.fillStyle = g; ctx.fillRect(-24, -24, W + 48, SEA_Y + 64);   // (on under the sea's far edge: no gap where its first row dips)
    // the sun, low and gold, once the clouds thin
    if (k > 0.5) { const a = (k - 0.5) * 2, sg = ctx.createRadialGradient(SUN_X, SEA_Y - 26, 4, SUN_X, SEA_Y - 26, 220); sg.addColorStop(0, `rgba(255,236,170,${0.95 * a})`); sg.addColorStop(0.3, `rgba(255,190,110,${0.5 * a})`); sg.addColorStop(1, 'rgba(255,150,90,0)'); ctx.fillStyle = sg; ctx.fillRect(SUN_X - 220, 0, 440, SEA_Y + 12); ctx.fillStyle = `rgba(255,246,214,${(0.95 * a).toFixed(2)})`; ctx.beginPath(); ctx.arc(SUN_X, SEA_Y - 26, 22, 0, TAU); ctx.fill(); }   // (the sun's own disc, low over the sea)
    // the cloud sheets: heaped storm clouds, dark and heavy while the storm lasts, thinning to a few pink-gold ones at dawn (the two versions
    // crossfade as it breaks); a lightning flash lights their bellies; painted live as flat banks if no cache could be had
    if (k < 0.95) {   // distant rain veils hanging from the cloud bases to the horizon, drifting (the storm's: they go with it); cached, faded
      const M = ctx.getTransform ? ctx.getTransform() : null, S = M ? Math.abs(M.a) || 1 : 1, A = M && !M.b && !M.c ? veilAtlas(Math.min(2, S)) : null;
      VEILS.forEach(([x0, w2, sp2], i) => {
        const x = (((x0 - t * sp2) % (W + 320)) + W + 320) % (W + 320) - 160;
        ctx.save();
        if (A) { const s2 = A.c.height / VH; ctx.globalAlpha *= 1 - k; ctx.drawImage(A.c, Math.round(A.xs[i] * s2), 0, Math.round(A.ws[i] * s2), A.c.height, Math.round((x - 64) * S) / S, VY0, A.ws[i], VH); }   // (snapped to device px: a 1:1 copy)
        else paintVeil(ctx, x, w2, (1 - k) * 0.34, i);   // (no cache: painted live)
        ctx.restore();
      });
    }
    const SHT = sheets(ctx), Sd = ctx.getTransform ? Math.abs(ctx.getTransform().a) || 1 : 1, u = clamp((k - 0.15) / 0.5, 0, 1), gl = glowV();
    for (const dawn of [false, true]) for (let L = 0; L < 3; L++) {   // (all the storm's sheets, then all the dawn's: its heaps lie exactly over the storm's -- a kept heap changes colour, the storm's others sink behind them)
      const sp = 6 + L * 5, off = Math.round(((((t * sp) % SHEET_W) + SHEET_W) % SHEET_W) * Sd) / Sd;   // (snapped to device pixels: crisp tile edges)
      const a = dawn ? 0.92 * u * u * (3 - 2 * u) : clamp((0.75 - k) / 0.25, 0, 1);   // (the storm's sheets opaque till the dawn's heaps are in: never one heap seen through another)
      if (a < 0.01) continue;
      const o = SHT[L * 2 + (dawn ? 1 : 0)];
      if (!o) { liveBank(ctx, L, dawn, a, t); continue; }   // (no cache for this sheet: soft live banks)
      const ky = o.c.height / o.h, sy = o.y0 || 0, dy = sy / ky, blit = (x) => ctx.drawImage(o.c, 0, sy, o.c.width, o.c.height - sy, x, dy, SHEET_W, o.h - dy);   // (from its first painted row)
      ctx.save(); ctx.globalAlpha = a;
      for (let x = -off; x < W; x += SHEET_W) blit(x);
      if (!dawn && L === 2 && gl > 0.05) {   // (the flash lights the near band's bellies: one band, not three)
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * gl * 0.35;
        for (let x = -off; x < W; x += SHEET_W) blit(x);
      }
      ctx.restore();
    }
    if (k > 0.5) { const a = (k - 0.5) * 2; ctx.save(); ctx.globalCompositeOperation = 'screen'; const sg = ctx.createRadialGradient(SUN_X, SEA_Y - 26, 6, SUN_X, SEA_Y - 26, 60); sg.addColorStop(0, `rgba(255,236,190,${(0.75 * a).toFixed(3)})`); sg.addColorStop(0.4, `rgba(255,214,150,${(0.3 * a).toFixed(3)})`); sg.addColorStop(1, 'rgba(255,190,120,0)'); ctx.fillStyle = sg; ctx.fillRect(SUN_X - 60, SEA_Y - 86, 120, 120); ctx.fillStyle = `rgba(255,244,210,${(0.85 * a).toFixed(3)})`; ctx.beginPath(); ctx.arc(SUN_X, SEA_Y - 26, 22, 0, TAU); ctx.fill(); ctx.restore(); }   // (the sun burns through the clouds: its disc whole, never a crescent moon)
  }
  // no cache for a sheet (a memory cap): banks of puffs painted live in its place, the storm's or the dawn's -- two fills a band (a solid
  // body, a lit top), ~1-2 ms for all six
  function liveBank(ctx, L, dawn, a, t) {
    const [top, hh, , sz, sc, dc] = BANDS[L], [base, lit] = dawn ? dc : sc, P = [];
    for (let i = 0; i < 9; i++) {
      if (dawn && i % 2 === 1) continue;
      P.push([(((i * 190 + hash1(i + L * 9) * 70 - t * (6 + L * 5)) % (W + 340)) + W + 340) % (W + 340) - 170, top + hh - 40 - hash1(i * 3 + L) * 30, (110 + hash1(i + L * 5) * 80) * sz]);
    }
    ctx.save(); ctx.globalAlpha = a * (0.95 - L * 0.08);
    ctx.fillStyle = base; ctx.beginPath();
    for (const [x, y, rx] of P) for (const [ex, ey, er, ef] of [[0, 0, 1, 0.3], [-0.45, 0.04, 0.6, 0.26], [0.5, 0.03, 0.55, 0.25], [-0.18, -0.2, 0.42, 0.42], [0.22, -0.16, 0.34, 0.4]]) { ctx.moveTo(x + ex * rx + er * rx, y + ey * rx); ctx.ellipse(x + ex * rx, y + ey * rx, er * rx, rx * ef, 0, 0, TAU); }
    ctx.fill();
    ctx.globalAlpha = a * 0.45; ctx.fillStyle = lit; ctx.beginPath();   // (their lit tops)
    for (const [x, y, rx] of P) for (const [ex, ey, er] of [[-0.2, -0.3, 0.3], [0.2, -0.24, 0.24]]) { ctx.moveTo(x + ex * rx + er * rx, y + ey * rx); ctx.ellipse(x + ex * rx, y + ey * rx, er * rx, er * rx * 0.7, 0, 0, TAU); }
    ctx.fill();
    if (L === 2) { ctx.globalAlpha = a * 0.9; ctx.fillStyle = base; ctx.beginPath(); for (let x = -120; x < W + 160; x += 150) { const r = 110 + 30 * hash1(x + 7); ctx.moveTo(x + r, SEA_Y - 6); ctx.ellipse(x, SEA_Y - 6, r, 22, 0, 0, TAU); } ctx.fill(); }   // (a low bank along the horizon: no sky mound under the banks)
    ctx.restore();
  }
  // the island: its body (mountain, rock texture, canopy, trees, sand, palms, skull, castle) painted once per size / dawn step at the
  // device's scale and blitted; live: the storm's backlight, the rim of light (it flares with the lightning), the eyes' glow, the vortex
  let ISL = null;
  const islGeo = (a) => { const w = 90 + 330 * a, h = 40 + 70 * a, sr = w * 0.08, sy = -h * 0.9 - sr * 0.5; return { w, h, sr, sy, x0: 800 - 130 * a, top: sy - sr * 2 - 6 }; };
  function islBody(g, a, k) {
    const { w, h } = islGeo(a);
    const rock = mixc('#2c2040', '#6a5444', k * 0.8), lit = mixc('#5a4878', '#a88a64', k), jungle = mixc('#16301f', '#2e6a3a', k * 0.85), jlit = mixc('#2a4a32', '#5a9a4a', k), sand = mixc('#3e3448', '#e8c890', k);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const R = (n) => hash1(n * 13 + 7);
    const mtn = [-w * 0.6, 0]; for (let q = 1; q <= 6; q++) { const u = q / 6; mtn.push(-w * 0.6 + u * w * 0.46 + (R(q) - 0.5) * w * 0.04, -h * (0.12 + 0.74 * u ** 1.3) + (R(q + 9) - 0.5) * h * 0.06); }
    mtn.push(-w * 0.1, -h * 0.9, w * 0.1, -h * 0.9); for (let q = 6; q >= 1; q--) { const u = q / 6; mtn.push(w * 0.62 - u * w * 0.48 + (R(q + 20) - 0.5) * w * 0.04, -h * (0.1 + 0.76 * u ** 1.3) + (R(q + 30) - 0.5) * h * 0.06); } mtn.push(w * 0.64, 0);
    g.beginPath(); g.moveTo(mtn[0], mtn[1]); for (let q = 2; q < mtn.length; q += 2) g.lineTo(mtn[q], mtn[q + 1]); g.closePath(); g.fillStyle = rock; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke();
    g.save(); g.clip(); const lg = g.createLinearGradient(-w * 0.5, 0, w * 0.3, 0); lg.addColorStop(0, lit.replace('rgb(', 'rgba(').replace(')', ',0.55)')); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.fillRect(-w, -h, w * 1.4, h); { const dp = dabPat(g, 'cloud'); if (dp) { g.fillStyle = dp; g.fillRect(-w, -h * 1.2, w * 2, h * 1.3); } } g.restore();   // (its lit side; the brush in the rock)
    g.save(); g.beginPath(); g.moveTo(mtn[0], mtn[1]); for (let q = 2; q < mtn.length; q += 2) g.lineTo(mtn[q], mtn[q + 1]); g.closePath(); g.clip();   // (the jungle, inside the mountain's outline)
    { g.save(); g.beginPath(); g.moveTo(mtn[0], mtn[1]); for (let q = 2; q < mtn.length; q += 2) g.lineTo(mtn[q], mtn[q + 1]); g.closePath(); g.clip();   // (strata across the rock: lit lips, dark undersides, uneven)
      for (let q = 1; q <= 5; q++) { const yy = -h * (0.2 + q * 0.13); g.beginPath(); for (let x = -w * 0.7, j = 0; x <= w * 0.7; x += w * 0.07, j++) { const y = yy + (R(j + q * 31 + 140) - 0.5) * h * 0.05 + x * 0.04; if (!j) g.moveTo(x, y); else g.lineTo(x, y); } g.strokeStyle = 'rgba(8,4,14,0.4)'; g.lineWidth = Math.max(1, h * 0.012); g.stroke(); g.save(); g.translate(0, -1.2); g.strokeStyle = lit.replace('rgb(', 'rgba(').replace(')', ',0.3)'); g.lineWidth = 1; g.stroke(); g.restore(); }
      g.restore(); }
    const shore = -Math.max(6, h * 0.1);
    for (const [band, col, top, amp] of [[0, jungle, 0.3, 0.12], [1, jlit, 0.14, 0.08]]) {   // (two bands of canopy, each with a crown of treetops of every size)
      const b0 = w * (0.045 - band * 0.01), hi = band ? mixc('#4a6a40', '#a8d878', k) : jlit, crowns = [];
      g.beginPath(); g.moveTo(-w, shore);
      for (let x = -w * 0.62 + band * b0 * 0.7, q = 0; x <= w * 0.66; q++) { const bump = b0 * (0.6 + 0.8 * R(q + band * 40 + 90)), u = (x + w * 0.62) / (w * 1.28), y = -h * (top + amp * Math.sin(u * Math.PI)) + (R(q + band * 40 + 60) - 0.5) * h * 0.05; g.lineTo(x - bump * 0.7, y + bump * 0.3); g.quadraticCurveTo(x, y - bump * 0.9, x + bump * 0.7, y + bump * 0.3); crowns.push([x, y, bump]); x += bump * 1.4; }
      g.lineTo(w, shore); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(10,8,14,0.6)'; g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = hi.replace('rgb(', 'rgba(').replace(')', ',0.7)'); g.lineWidth = Math.max(1, b0 * 0.16); g.beginPath(); for (const [cx2, cy2, bump] of crowns) { const r3 = bump * 0.42; g.moveTo(cx2 + r3 * Math.cos(Math.PI * 1.15), cy2 + bump * 0.15 + r3 * Math.sin(Math.PI * 1.15)); g.arc(cx2, cy2 + bump * 0.15, r3, Math.PI * 1.15, Math.PI * 1.62); } g.stroke();   // (each crown lit from above)
    }
    for (const [ux, s2] of [[-0.31, 1], [-0.18, 0.8], [0.2, 0.9], [0.34, 1.1]]) {   // (a few big trees standing out of the canopy)
      const r2 = Math.min(w * 0.034, h * 0.1) * s2, tx = ux * w, ty = -h * 0.24 - r2 * 0.4;
      g.beginPath(); g.moveTo(tx - r2 * 1.3, ty + r2 * 0.6); g.quadraticCurveTo(tx - r2 * 1.5, ty - r2 * 0.2, tx - r2 * 0.6, ty - r2 * 0.3); g.quadraticCurveTo(tx - r2 * 0.4, ty - r2 * 1.1, tx + r2 * 0.3, ty - r2 * 0.8); g.quadraticCurveTo(tx + r2 * 1.3, ty - r2 * 0.9, tx + r2 * 1.2, ty + r2 * 0.1); g.quadraticCurveTo(tx + r2 * 1.5, ty + r2 * 0.6, tx + r2, ty + r2 * 0.7); g.closePath();
      { const tg = g.createLinearGradient(0, ty - r2 * 1.1, 0, ty + r2 * 0.7); tg.addColorStop(0, jlit); tg.addColorStop(0.55, jlit); tg.addColorStop(1, jungle); g.fillStyle = tg; } g.fill(); g.strokeStyle = 'rgba(10,8,14,0.7)'; g.lineWidth = 1.2; g.stroke();   // (dark at the foot: it stands in the canopy)
      g.strokeStyle = mixc('#4a6a40', '#b8e088', k).replace('rgb(', 'rgba(').replace(')', ',0.75)'); g.lineWidth = Math.max(1, r2 * 0.14); g.beginPath(); g.arc(tx - r2 * 0.25, ty - r2 * 0.2, r2 * 0.62, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
    }
    g.fillStyle = sand; g.beginPath(); g.moveTo(-w, 4); for (let x = -w * 0.66, q = 0; x <= w * 0.7; x += w * 0.06, q++) g.lineTo(x, shore + 1 + (R(q + 120) - 0.5) * 3); g.lineTo(w, 4); g.closePath(); g.fill();   // (the beach: a strip of sand all along the shore)
    g.strokeStyle = 'rgba(10,8,14,0.45)'; g.lineWidth = 1; g.stroke();
    g.restore();
    if (a > 0.25) for (const [px, ph] of [[-w * 0.5, 0.2], [-w * 0.36, 0.26], [w * 0.4, 0.22], [w * 0.52, 0.17]]) {   // (palms on the shore)
      const ht = h * ph; g.strokeStyle = mixc('#20161a', '#5a4030', k); g.lineWidth = 2; g.beginPath(); g.moveTo(px, -2); g.quadraticCurveTo(px + 4, -ht * 0.6, px + 2, -ht); g.stroke();
      g.strokeStyle = jungle; g.lineWidth = 2.4; for (const d of [-1, -0.4, 0.4, 1]) { g.beginPath(); g.moveTo(px + 2, -ht); g.quadraticCurveTo(px + 2 + d * ht * 0.3, -ht - ht * 0.18, px + 2 + d * ht * 0.42, -ht + ht * 0.12); g.stroke(); }
    }
    // the skull on the summit: a black dome, eye sockets glowing purple, a row of teeth
    const sr = w * 0.08, sy = -h * 0.9 - sr * 0.5, bone = mixc('#4a4252', '#8a8078', k);   // (stone grey: it never reads as a foe among the bats)
    g.fillStyle = bone; g.strokeStyle = INK; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-sr * 0.75, sy + sr * 0.3); g.lineTo(-sr * 0.62, sy + sr * 0.98); g.quadraticCurveTo(0, sy + sr * 1.08, sr * 0.62, sy + sr * 0.98); g.lineTo(sr * 0.75, sy + sr * 0.3); g.closePath(); g.fill(); g.stroke();   // (the jaw: narrower than the cranium)
    g.beginPath(); g.ellipse(0, sy, sr, sr * 0.88, 0, 0, TAU); g.fill(); g.stroke();   // (the cranium)
    g.strokeStyle = k < 0.5 ? 'rgba(200,140,255,0.55)' : 'rgba(255,214,160,0.6)'; g.lineWidth = Math.max(1.4, sr * 0.08); g.beginPath(); g.arc(0, sy, sr * 0.8, Math.PI * 1.08, Math.PI * 1.45); g.stroke();   // (its lit crown, west)
    for (const ex of [-0.4, 0.4]) { g.fillStyle = '#08040c'; g.beginPath(); g.ellipse(ex * sr, sy - sr * 0.05, sr * 0.28, sr * 0.3, 0, 0, TAU); g.fill(); }
    g.strokeStyle = INK; g.lineWidth = Math.max(1.6, sr * 0.13); g.lineCap = 'round'; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * sr * 0.72, sy - sr * 0.46); g.lineTo(sd * sr * 0.12, sy - sr * 0.26); g.stroke(); }   // (brow ridges slanting down to the middle: a scowl)
    { const s3 = sr * 0.15, ny = sy + sr * 0.36; g.fillStyle = '#08040c'; g.beginPath(); g.moveTo(0, ny - s3); g.bezierCurveTo(-s3 * 0.4, ny - s3 * 0.2, -s3 * 1.1, ny + s3 * 0.3, -s3 * 0.55, ny + s3 * 0.85); g.quadraticCurveTo(-s3 * 0.15, ny + s3 * 0.95, 0, ny + s3 * 0.6); g.quadraticCurveTo(s3 * 0.15, ny + s3 * 0.95, s3 * 0.55, ny + s3 * 0.85); g.bezierCurveTo(s3 * 1.1, ny + s3 * 0.3, s3 * 0.4, ny - s3 * 0.2, 0, ny - s3); g.fill(); }   // (the nose: an upturned heart)
    { const ty = sy + sr * 0.6, th = sr * 0.26, tw = sr * 1.08; g.fillStyle = mixc('#d8cfc0', '#f0e8d8', k); g.fillRect(-tw / 2, ty, tw, th); g.strokeStyle = INK; g.lineWidth = Math.max(1, sr * 0.06); g.strokeRect(-tw / 2, ty, tw, th); g.beginPath(); for (let q = 1; q < 6; q++) { const x = -tw / 2 + q * tw / 6; g.moveTo(x, ty); g.lineTo(x, ty + th); } g.moveTo(-tw / 2, ty + th * 0.5); g.lineTo(tw / 2, ty + th * 0.5); g.stroke(); }   // (six narrow teeth, clenched, ink between)
    // the castle's turrets over it
    g.fillStyle = mixc('#0e0a14', '#3a3040', k * 0.6);
    g.save(); g.beginPath(); g.ellipse(0, sy, sr, sr * 0.88, 0, 0, TAU); g.clip(); { const dp = dabPat(g, 'cloud'); if (dp) { g.fillStyle = dp; g.fillRect(-sr, sy - sr, sr * 2, sr * 2); } } g.restore();   // (the skull's stone brushed)
    g.fillStyle = mixc('#0e0a14', '#3a3040', k * 0.6);
    { const wy = sy - sr * 0.75; g.fillRect(-sr * 1.05, wy, sr * 2.1, sr * 0.4); g.strokeStyle = INK; g.lineWidth = 1.4; g.strokeRect(-sr * 1.05, wy, sr * 2.1, sr * 0.4); for (let q = 0; q < 6; q++) { g.fillRect(-sr * 1.05 + q * sr * 0.4, wy - sr * 0.14, sr * 0.22, sr * 0.15); } }   // (a crenellated wall behind the skull)
    for (const [tx, th] of [[-0.9, 0.55], [-0.32, 0.85], [0.32, 0.7], [0.9, 0.5]]) {
      const bx = tx * sr, top = sy - sr * 0.6 - sr * th, tw = sr * 0.34;
      g.fillRect(bx - tw / 2, top, tw, sy - sr * 0.4 - top); g.strokeStyle = INK; g.lineWidth = 1.4; g.strokeRect(bx - tw / 2, top, tw, sy - sr * 0.4 - top);
      g.beginPath(); g.moveTo(bx - tw * 0.7, top); g.lineTo(bx, top - tw * 1.5); g.lineTo(bx + tw * 0.7, top); g.closePath(); g.fill(); g.stroke();
      { g.save(); const lc = mixc('#5a4a70', '#8a7c88', k); g.fillStyle = lc.replace('rgb(', 'rgba(').replace(')', ',0.28)'); g.fillRect(bx - tw / 2 + 0.8, top, tw * 0.3, sy - sr * 0.4 - top); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.8; g.beginPath(); for (let yy = top + sr * 0.18; yy < sy - sr * 0.45; yy += sr * 0.18) { g.moveTo(bx - tw / 2, yy); g.lineTo(bx + tw / 2, yy); } g.stroke(); g.fillStyle = 'rgba(255,190,110,0.8)'; g.fillRect(bx - 0.8, top + (sy - sr * 0.4 - top) * 0.3, 1.6, sr * 0.14); g.restore(); }   // (lit from the west, coursed stone, a lit slit; its own fill state)
    }
  }
  const islMtn = (a) => { const { w, h } = islGeo(a), R = (n) => hash1(n * 13 + 7), mtn = [-w * 0.6, 0];
    for (let q = 1; q <= 6; q++) { const u = q / 6; mtn.push(-w * 0.6 + u * w * 0.46 + (R(q) - 0.5) * w * 0.04, -h * (0.12 + 0.74 * u ** 1.3) + (R(q + 9) - 0.5) * h * 0.06); }
    mtn.push(-w * 0.1, -h * 0.9); return mtn; };
  function isl(ctx, t) {
    const a = Math.round(island * 96) / 96, k = storm, kq = Math.round(k * 32) / 32, { w, h, sr, sy, x0, top } = islGeo(a), y0 = rowY(0) + 4;
    ctx.save(); ctx.translate(x0, y0); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (k < 0.85) { const r0 = w * 0.62, bg = ctx.createRadialGradient(0, -h * 0.6, 4, 0, -h * 0.6, r0); bg.addColorStop(0, `rgba(150,70,200,${(0.45 * (1 - k / 0.85)).toFixed(3)})`); bg.addColorStop(1, 'rgba(150,70,200,0)'); ctx.fillStyle = bg; ctx.fillRect(-r0, -h * 0.6 - r0, r0 * 2, r0 + h * 0.6 + 2); }   // (the storm's light behind it: its silhouette reads)
    const M = ctx.getTransform ? ctx.getTransform() : null, S = M ? Math.hypot(M.a, M.b) : 1, bx = -w * 0.68, bw = w * 1.38, by = top, bh = 8 - top;
    if (!ISL || ISL.S !== S || ISL.a !== a || ISL.k !== kq) {
      const cw = Math.ceil(bw * S), ch = Math.ceil(bh * S);
      if (!ISL || (ISL.c ? ISL.S !== S || ISL.c.width < Math.ceil(cw / ISL.ps) || ISL.c.height < Math.ceil(ch / ISL.ps) : !(ISL.failS === S && Math.abs(ISL.failA - a) < 0.25))) {
        if (ISL && ISL.c) freeCanvases(ISL.c);
        let ps = 1, r = cacheCanvas(Math.ceil(cw * 1.12), Math.ceil(ch * 1.12));
        if (!r) { ps = 2; r = cacheCanvas(Math.ceil(cw * 0.56), Math.ceil(ch * 0.56)); }   // (a memory cap: half scale, blitted 2x, before painting it live)
        ISL = r ? { c: r.c, g: r.g, ps } : { c: null, failS: S, failA: a };
      }   // (a refusal: retried only once it has grown a quarter, or at another scale)
      ISL.S = S; ISL.a = a; ISL.k = kq;
      if (ISL.c) { const g = ISL.g; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, ISL.c.width, ISL.c.height); const q = S / ISL.ps; g.setTransform(q, 0, 0, q, -bx * q, -by * q); islBody(g, a, kq); }
    }
    if (ISL.c && ISL.ps === 1 && M && !M.b && !M.c && M.a > 0 && Math.abs(M.d - M.a) < 1e-6) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(ISL.c, 0, 0, Math.ceil(bw * S), Math.ceil(bh * S), Math.round(M.e + bx * S), Math.round(M.f + by * S), Math.ceil(bw * S), Math.ceil(bh * S)); ctx.restore(); }   // (snapped to device px: a 1:1 copy, never a filtered one)
    else if (ISL.c) { const q = ISL.ps, sw = Math.ceil(bw * S / q), sh = Math.ceil(bh * S / q); ctx.drawImage(ISL.c, 0, 0, sw, sh, bx, by, sw * q / S, sh * q / S); }
    else islBody(ctx, a, kq);   // (no cache: painted live)
    const mtn = islMtn(a);
    { const ra = k < 0.5 ? 0.85 * (1 - k * 2) + 0.4 * glowV() : (k - 0.5) * 1.4, rc = k < 0.5 ? '200,140,255' : '255,214,160'; ctx.strokeStyle = `rgba(${rc},${(ra * 0.3).toFixed(2)})`; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(mtn[2], mtn[3]); for (let q = 4; q <= 14; q += 2) ctx.lineTo(mtn[q], mtn[q + 1]); ctx.stroke(); }   // (a soft glow under the rim line)
    ctx.strokeStyle = k < 0.5 ? `rgba(200,140,255,${(0.85 * (1 - k * 2) + 0.4 * glowV()).toFixed(2)})` : `rgba(255,214,160,${((k - 0.5) * 1.4).toFixed(2)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mtn[2], mtn[3]); for (let q = 4; q <= 14; q += 2) ctx.lineTo(mtn[q], mtn[q + 1]); ctx.stroke();   // (a rim of the storm's -- the dawn's -- light up its west slope)
    { const eg = `rgba(220,110,255,${Math.min(1, 0.42 - k * 0.12 + 0.5 * glowV()).toFixed(2)})`; ctx.fillStyle = eg; for (const ex of [-0.4, 0.4]) { ctx.beginPath(); ctx.arc(ex * sr, sy - sr * 0.05, sr * 0.15, 0, TAU); ctx.fill(); } }   // (the eyes' glow: a lamp in the fortress; it flares with the lightning)
    // the storm's vortex over it: three filled flattened bands, one tilt, turning by their start angles; fades as the storm breaks
    const vy = sy - sr * 2.6, sa = clamp(1 - k * 1.15, 0, 1) * clamp((y0 + vy - sr * 3.4 * 0.26 - 50) / 16, 0, 1);   // (gone before it reaches the HUD's ribbon)
    if (sa > 0.02) {
      for (let q = 0; q < 3; q++) {
        const rr = sr * (1.4 + q * 1.0), a0 = t * (0.5 - q * 0.08) + q * 2.1;
        ctx.strokeStyle = `rgba(${q === 0 ? '192,112,255' : q === 1 ? '160,90,230' : '122,60,192'},${(0.7 * sa).toFixed(2)})`; ctx.lineWidth = Math.max(3, 4 + 3 * a - q);
        ctx.beginPath(); ctx.ellipse(0, vy, rr, rr * 0.26, -0.08, a0, a0 + Math.PI * 1.4); ctx.stroke();
      }
    }
    ctx.restore();
  }
  // the sea's rows, far to near: six behind the ship (the last just behind its waterline), two in front (crests that lap its hull)
  let STX = null, STXs = 0, FTX = null, FTXs = 0;
  const FTX_Y0 = WL - 18;   // (the front plate: from just above row 6's crests to the frame's foot)
  const seaTexFront = (S) => {
    if (FTX && Math.abs(FTXs - S) < 0.01) return FTX.c ? FTX : null;   // (a refusal remembered, not retried each frame: release() clears it)
    if (FTX && FTX.c) freeCanvases(FTX.c); FTX = null; FTXs = S;
    const h = H + 10 - FTX_Y0; let ps = 1, r = cacheCanvas(Math.ceil(W * S), Math.ceil(h * S));
    if (!r) { ps = 2; r = cacheCanvas(Math.ceil(W * S / 2), Math.ceil(h * S / 2)); }   // (a memory cap: half the device's scale, blitted 2x -- softer, never flat)
    if (!r) { FTX = { c: null, h }; return null; }
    r.g.setTransform(S / ps, 0, 0, S / ps, 0, 0); paintSeaTexNear(r.g, h);
    FTX = { c: r.c, h, ps }; return FTX;
  };
  const STX_Y1 = WL + 24;   // (the plate's foot: the front rows cover the water below)
  const seaTex = (S) => {
    if (STX && Math.abs(STXs - S) < 0.01) return STX.c ? STX : null;   // (a refusal remembered)
    if (STX && STX.c) freeCanvases(STX.c); STX = null; STXs = S;
    const h = STX_Y1 - SEA_Y; let ps = 1, r = cacheCanvas(Math.ceil(W * S), Math.ceil(h * S));
    if (!r) { ps = 2; r = cacheCanvas(Math.ceil(W * S / 2), Math.ceil(h * S / 2)); }   // (a memory cap: half scale, blitted 2x)
    if (!r) { STX = { c: null, h }; return null; }
    r.g.setTransform(S / ps, 0, 0, S / ps, 0, 0); paintSeaTex(r.g, h);
    { const g = r.g, fg = g.createLinearGradient(0, 16, 0, 30); fg.addColorStop(0, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = fg; g.fillRect(-4, -4, W + 8, 34); g.globalCompositeOperation = 'source-over'; }   // (its top feathered away above sea row 0's troughs: blitted with no clip)
    STX = { c: r.c, h, ps }; return STX;
  };
  const rowLine = (i, t) => { const f = i / 7, y = rowY(i), amp = 2.5 + 9 * f, sp = 0.8 + 2.4 * f, ph = i * 1.7, fq = 0.012 - f * 0.004; return (x) => y + Math.sin(x * fq + t * sp + ph) * amp + Math.sin(x * 0.03 - t * sp * 1.4) * amp * 0.3; };
  const seaTexOver = (ctx, t) => {
    const M = ctx.getTransform ? ctx.getTransform() : null; if (!M || M.b || M.c || M.a <= 0 || Math.abs(M.d - M.a) > 1e-6) return;   // (a plain uniform scale + translate only: the 1:1 blit)
    const S = M.a; if (S < 0.5 || S > 3) return;
    const T = seaTex(S); if (!T) return;
    const ps = T.ps || 1, wd = T.c.width * ps, off = Math.round((((t * 12) % W) + W) % W * S), oy = Math.round(M.f + SEA_Y * S), ox = Math.round(M.e);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);   // (no clip: the plate's own top is feathered away above row 0)
    { const dh = T.c.height * ps; ctx.drawImage(T.c, 0, 0, T.c.width, T.c.height, ox - off, oy, wd, dh); ctx.drawImage(T.c, 0, 0, T.c.width, T.c.height, ox - off + wd, oy, wd, dh); }   // (1:1 -- or 2x from a half-scale plate)
    ctx.restore();
  };
  const rowY = (i) => (i < 6 ? SEA_Y + 14 + (WL - SEA_Y - 20) * Math.pow(i / 5, 1.5) : i === 6 ? WL + 4 : WL + 84);
  function seaRows(ctx, t, from, to) {
    const k = storm;
    for (let i = from; i < to; i++) {
      const f = i / 7, y = rowY(i), amp = 2.5 + 9 * f, sp = 0.8 + 2.4 * f, ph = i * 1.7, fq = 0.012 - f * 0.004;
      const yy = (x) => y + Math.sin(x * fq + t * sp + ph) * amp + Math.sin(x * 0.03 - t * sp * 1.4) * amp * 0.3;
      const yb = i < 7 ? rowY(i + 1) + 18 : H + 30;   // (down to under the next row's troughs only)
      ctx.beginPath(); ctx.moveTo(-20, yb);
      for (let x = -20; x <= W + 20; x += 20) ctx.lineTo(x, yy(x));
      ctx.lineTo(W + 20, yb); ctx.closePath();
      { const c0 = mixh(mixh('#1c3a40', '#2c5a5c', f), mixh(mixh('#1d6aa0', '#4ab4d4', f), '#8ab0d0', Math.max(0, 1 - f * 4) * 0.7), k), lit = mixh(c0, k > 0.5 ? '#ffe0b0' : '#a0c0ff', 0.16 + 0.1 * f), dk = mixh(c0, '#060a1a', 0.35 - 0.1 * k);
        const gr = ctx.createLinearGradient(0, y - amp, 0, y + 18 + 30 * f); gr.addColorStop(0, lit); gr.addColorStop(0.35, c0); gr.addColorStop(1, dk); ctx.fillStyle = gr; ctx.fill(); }   // (lit at its crest, dark in its trough)
      // the crest: broken foam -- tapered dashes and flecks riding it, thicker and whiter in the storm
      const foam = 0.35 + 0.35 * f + 0.25 * (1 - k), fc = `rgba(${lerp(200, 245, k) | 0},${lerp(215, 250, k) | 0},255,`;
      ctx.lineCap = 'round';
      const FB = [[], [], [], [], [], [], [], [], []];   // (the dashes in nine buckets: three alphas x three widths, one stroke each)
      for (let x = -20, j = 0; x <= W + 20; x += 26 + 30 * hash1(i * 31 + j), j++) {
        const len = (8 + 46 * hash1(i * 17 + j) ** 1.5) * (0.5 + f), x2 = x + len; if (hash1(i * 13 + j + 5) > 0.55 + 0.35 * foam) continue;
        FB[Math.min(2, Math.floor(hash1(j + i) * 3)) * 3 + Math.min(2, Math.floor(hash1(j * 3 + i) * 3))].push(x, x2);
      }
      for (let q = 0; q < 9; q++) {
        const L2 = FB[q]; if (!L2.length) continue;
        const ha = (Math.floor(q / 3) + 0.5) / 3, hw = (q % 3 + 0.5) / 3;
        ctx.strokeStyle = fc + (f < 0.3 ? 0.12 + 0.13 * ha : 0.4 + 0.45 * foam * ha).toFixed(2) + ')'; ctx.lineWidth = 1.2 + 2.6 * f * (0.5 + hw);
        ctx.beginPath(); for (let m = 0; m < L2.length; m += 2) { const x = L2[m], x2 = L2[m + 1]; ctx.moveTo(x, yy(x) + 0.5); ctx.quadraticCurveTo((x + x2) / 2, yy((x + x2) / 2) - 1.5 * f, x2, yy(x2) + 0.5); } ctx.stroke();
      }
      if (f > 0.3) { ctx.fillStyle = fc + (0.25 * foam).toFixed(2) + ')'; for (let j = 0; j < 10; j++) { const x = (j * 113 + i * 57 + t * 12 * (1 + f)) % (W + 40) - 20, yv = yy(x) + 6 + 10 * hash1(j + i * 7); if (!j) ctx.beginPath(); const rx = 10 + 6 * f * hash1(j * 3 + i); ctx.moveTo(x + rx, yv); ctx.ellipse(x, yv, rx, 1.5, 0, 0, TAU); } ctx.fill(); }   // (streaks of foam, not pebbles)   // (flecks of foam on its face)
      if (k > 0.45) {   // the sun's glitter: a column of sparks on the sea under it
        const a2 = (k - 0.45) / 0.55 * (1 - f * 0.4); ctx.fillStyle = `rgba(255,236,190,${(0.75 * a2).toFixed(2)})`;
        for (let j = 0; j < 6 + i * 2; j++) { const gx = SUN_X + (hash1(j * 7 + i) - 0.5) * (60 + 140 * f) + Math.sin(t * 2 + j) * 6, gw = 4 + 10 * f * hash1(j + i * 3), gy = yy(gx) + 3 + 8 * hash1(j * 5 + i); if (!j) ctx.beginPath(); ctx.moveTo(gx + gw, gy); ctx.ellipse(gx, gy, gw, 1 + f, 0, 0, TAU); }
        ctx.fill();
      }
    }
  }
  function drawBack(ctx, cam = 0, t = 0) {
    ctx.save();
    { sheets(ctx); const M = ctx.getTransform ? ctx.getTransform() : null; if (M && !M.b && !M.c && M.a >= 0.5 && M.a <= 3 && Math.abs(M.d - M.a) < 1e-6) { seaTexFront(M.a); seaTex(M.a); bigWaveSet(M.a); } }   // (the caches in the order the picture needs them under a memory cap: the cloud sheets, the near sea's plate, the far sea's (each with a half-scale step), then the veils, the island, the ship)
    sky(ctx, t);
    isl(ctx, t);
    // a distant fork of lightning at the far shore of the sea (setBolt): a jagged line from the clouds, the sky flashing
    if (bolt !== null && flash > 0.05) {
      ctx.save(); ctx.strokeStyle = `rgba(240,220,255,${flash})`; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath();
      const yEnd = rowY(0) + 2, pts = [[bolt, 0]]; let x = bolt;
      for (let i = 1; i <= 9; i++) { x += (hash1(i * 7 + (bolt | 0)) - 0.5) * 70; pts.push([x, i * yEnd / 9]); }
      const fork = (i0, dir, len) => { let fx = pts[i0][0], fy = pts[i0][1]; ctx.moveTo(fx, fy); for (let q = 0; q < len; q++) { fx += dir * (10 + 12 * hash1(q + i0 * 5 + (bolt | 0))); fy += 14 + 6 * hash1(q * 3 + i0); ctx.lineTo(fx, fy); } };
      const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py); fork(3, -1, 3); fork(6, 1, 2); };
      path(); ctx.lineWidth = 9; ctx.strokeStyle = `rgba(190,120,255,${0.3 * flash})`; ctx.stroke();
      path(); ctx.lineWidth = 3; ctx.strokeStyle = `rgba(230,200,255,${flash})`; ctx.stroke();
      path(); ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(255,255,255,${flash})`; ctx.stroke(); ctx.restore();
    }
    seaRows(ctx, t, 0, 6);
    seaTexOver(ctx, t);   // (the brush in the water: over the back rows, cached, 1:1)
    // the haze at the horizon: the sky's own colour lying over the sea's far edge
    const k = storm;
    if (k < 0.99) { const hz = ctx.createLinearGradient(0, SEA_Y + 2, 0, SEA_Y + 44); hz.addColorStop(0, 'rgba(106,38,112,0)'); hz.addColorStop(0.45, `rgba(106,38,112,${(0.55 * (1 - k)).toFixed(3)})`); hz.addColorStop(1, 'rgba(106,38,112,0)'); ctx.fillStyle = hz; ctx.fillRect(0, SEA_Y + 2, W, 42); }
    if (k > 0.01) { const y0r = rowY(0), yy0 = (x) => y0r + Math.sin(x * 0.012 + t * 0.8) * 2.5 + Math.sin(x * 0.03 - t * 0.8 * 1.4) * 0.75;   // (sea row 0's own wave line)
      ctx.save(); ctx.beginPath(); ctx.moveTo(-20, SEA_Y + 60); for (let x = -20; x <= W + 20; x += 20) ctx.lineTo(x, yy0(x)); ctx.lineTo(W + 20, SEA_Y + 60); ctx.closePath(); ctx.clip();   // (on the sea only: never over the sky or the island's shore)
      const hz = ctx.createLinearGradient(0, SEA_Y + 8, 0, SEA_Y + 46); hz.addColorStop(0, `rgba(255,216,184,${(0.5 * k).toFixed(3)})`); hz.addColorStop(1, 'rgba(255,216,184,0)'); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = hz; ctx.fillRect(0, SEA_Y + 8, W, 38); ctx.restore(); }   // (the dawn: a bright haze on the far sea, never grey)
    ctx.restore();
  }
  /** the sea rows in front of the ship's waterline and the spray: drawn after the ship, kraken and foes */
  function drawFront(ctx, cam = 0, t = 0) {
    ctx.save();
    seaRows(ctx, t, 6, 8);
    { const M = ctx.getTransform ? ctx.getTransform() : null;   // (the near water's own brush: big dabs, faster -- the parallax of depth)
      if (M && !M.b && !M.c && M.a > 0 && Math.abs(M.d - M.a) < 1e-6) { const S = M.a, T = S >= 0.5 && S <= 3 ? seaTexFront(S) : null;
        if (T) { const yy = rowLine(6, t), ps = T.ps || 1, cw = T.c.width, wd = cw * ps, off = Math.round((((t * 30) % W) + W) % W * S), oy = Math.round(M.f + FTX_Y0 * S), ox = Math.round(M.e);
          const BY = WL + 18, sb = Math.min(T.c.height, Math.round((BY - FTX_Y0) * S / ps)), hb = T.c.height - sb;   // (row 6's wave line lies within WL-10..WL+18: only that band is clipped)
          ctx.save(); ctx.beginPath(); ctx.moveTo(-20, BY); for (let x = -20; x <= W + 20; x += 20) ctx.lineTo(x, Math.min(BY, yy(x))); ctx.lineTo(W + 20, BY); ctx.closePath(); ctx.clip();
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(T.c, 0, 0, cw, sb, ox - off, oy, wd, sb * ps); ctx.drawImage(T.c, 0, 0, cw, sb, ox - off + wd, oy, wd, sb * ps); ctx.restore();
          if (hb > 0) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(T.c, 0, sb, cw, hb, ox - off, oy + sb * ps, wd, hb * ps); ctx.drawImage(T.c, 0, sb, cw, hb, ox - off + wd, oy + sb * ps, wd, hb * ps); ctx.restore(); } } } }   // (below it: all water, a plain copy)
    // the near foam: white spray flecks along the bottom edge
    ctx.fillStyle = `rgba(230,244,255,${0.35 + 0.2 * storm})`;
    for (let i = 0; i < 24; i++) { const x = ((i * 53 + t * (40 + (i % 5) * 9)) % (W + 40)) - 20, y = H - 8 - (i % 4) * 7 + Math.sin(t * 3 + i) * 3; if (!i) ctx.beginPath(); ctx.moveTo(x + 12 + (i % 3) * 4, y); ctx.ellipse(x, y, 12 + (i % 3) * 4, 1.8, 0, 0, TAU); }
    ctx.fill();
    // the storm's gloom over the nearest part of the sea (lifts as it breaks)
    if (storm < 1) { const gg = ctx.createLinearGradient(0, WL - 10, 0, H); gg.addColorStop(0, 'rgba(10,4,24,0)'); gg.addColorStop(1, `rgba(10,4,24,${(0.34 * (1 - storm)).toFixed(3)})`); ctx.fillStyle = gg; ctx.fillRect(0, WL - 10, W, H - WL + 10); }
    ctx.restore();
  }
  return {
    setScale() {}, setWarm() {}, drawProp() {}, drawFront, drawBack,
    setStorm(k) { storm = clamp(+k || 0, 0, 1); },
    setFlash(f) { flash = clamp(+f || 0, 0, 1); },
    setGlow(g) { glowSet = g === null || g === undefined ? null : clamp(+g || 0, 0, 1); },   // (the clouds' and the island's light from a flash, apart from the bolt (reduced motion: 0); unset: it follows setFlash)
    setBolt(x) { bolt = x === null || x === undefined ? null : x; },
    setIsland(a) { island = clamp(+a || 0, 0, 1); },
    setStory(bg) { storm = bg && bg.storm !== undefined ? clamp(bg.storm, 0, 1) : 0; island = bg && bg.island !== undefined ? clamp(bg.island, 0, 1) : 0.15; flash = 0; bolt = null; glowSet = null; },
    info() { const n = [...(SH ? SH.filter(Boolean) : []), ...(STX && STX.c ? [STX] : []), ...(FTX && FTX.c ? [FTX] : []), ...(VA && VA.c ? [VA] : []), ...(WAVEC ? ['s0', 's1', 'd0', 'd1'].map((q) => WAVEC[q]).filter(Boolean) : []), ...(ISL && ISL.c ? [ISL] : []), ...(SHIPC ? ['hull', 'sailA', 'sailB', 'jib'].map((q) => SHIPC[q]).filter(Boolean) : [])], px = n.reduce((a, o) => a + o.c.width * o.c.height, 0); return { canvases: n.length, megapixels: +(px / 1e6).toFixed(2), approxMB: +(px * 4 / 1048576).toFixed(1) }; },
    release() { free(); freeDawnShip(); freeBigWaves(); if (STX && STX.c) freeCanvases(STX.c); STX = null; if (FTX && FTX.c) freeCanvases(FTX.c); FTX = null; if (VA && VA.c) freeCanvases(VA.c); VA = null; if (ISL && ISL.c) freeCanvases(ISL.c); ISL = null; },   // (the cloud sheets and the painted ship go: the next draw makes them again)
  };
}
