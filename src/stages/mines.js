// Dodongo's Quest - Level 2 "THE EMBER MINES" (src/stages/mines.js): background, floor and breakable props.
//
// Deep volcanic mines inside the Dragon Clan's mountain, where the Dragon King's soldiers force the collared clan
// dragons to forge more cursed collars.  Dark basalt and timber lit warm by lava, lanterns and ember crystals;
// everything of the King's is black iron with venom-green gems and glow.
//
// Sections (world x):  entrance 0-1600 (the mine mouth at dusk)  |  tunnels 1600-3400 (timber-shored tunnels; through
// openings in the wall a parallel gallery where chained clan dragons haul ore)  |  lava 3400-5400 (a lava cavern;
// walkway of basalt ledges and iron grating)  |  forge 5400-7200 (the Collar Forge; the boss arena is the last screen).
//
// Back-to-front: deep layers, each clipped to its section's screen window (dusk sky + far peaks 0.1 + mountainside 0.3
// | tunnel gallery 0.55 | cavern wall 0.2 + lava river 0.45 | forge hall 0.5)  ->  near walls (1.0)  ->  near sprites
// ->  floor tiles (1.0)  ->  near sprites standing on the floor's back edge  ->  live bits.   drawFront: rare
// foreground occluders (1.25; never on an arena screen) and particles (snow outside, dust in the tunnels, embers).
// Every static element is cached per scale (chunked strips + sprites); animated bits are drawn live and cheaply.
// setWarm(w): the King's venom green (forge glow, collar mould, gems, brazier) turns gold as the curse lifts.
//
// drawProp(ctx, kind, sx, sy, { flash, shake, roll }): roll = distance the cart has rolled, in px (turns its wheels).

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, blankCanvas, liveCanvas, cacheCanvas , freeCanvases } from '../canvasmem.js';

export const LEVEL_LEN = 7200;
export const SECTIONS = [
  { id: 'entrance', name: 'The Mine Mouth',     x0: 0,    x1: 1600 },
  { id: 'tunnels',  name: 'The Ember Tunnels',  x0: 1600, x1: 3400 },
  { id: 'lava',     name: 'The Lava Cavern',    x0: 3400, x1: 5400 },
  { id: 'forge',    name: 'The Collar Forge',   x0: 5400, x1: 7200 },
];
// For the harness / level script: arena screens (camera left edge), waystone shrines, the boss's lava pools [x, y].
export const ARENAS = [700, 2000, 3300, 4700, LEVEL_LEN - W];
export const WAYSTONES = [2700, 5300];
export const LAVA_POOLS = [[6450, 50], [6720, 110], [7000, 45]];

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

// copied from src/stage.js: peaks, little trees, snow caps, the King's emblem and banners, flags, paving
function drawPeak(g, pk, P, base, hz0, hz1) {
  const R = mulberry(pk.seed);
  const L = [pk.x - pk.hl, base + 4], T = [pk.x, pk.sy], Rr = [pk.x + pk.hr, base + 4];
  const left = mdp(L, T, R, 4, 0.08), right = mdp(T, Rr, R, 4, 0.08);
  const sil = flat(left.concat(right.slice(1)));
  // spine of the shadow side
  const spine = mdp([pk.x, pk.sy], [pk.x + pk.hr * 0.18, base + 4], R, 4, 0.07);
  const shadowPoly = flat(spine).concat([pk.x + pk.hr + 20, base + 6, pk.x + pk.hr + 20, pk.sy - 10]);
  // snowline zig-zag
  const snowY = pk.sy + (base - pk.sy) * (P.snowK || 1) * R.r(0.36, 0.5);
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
      if (rh < 4) continue;                       // a sliver of a row at the screen edge: joint colour only
      for (const [i, xa, xb, loose] of stones) {
        if (loose) { g.fillStyle = joint; roundRect(g, xa - 0.5, ya, xb - xa + 1, rh, 3); g.fill(); }
        const h = hash2(i * 3 + 1, r + seed * 5);
        const col = mix(P.stone, h < 0.5 ? P.stoneSh : P.stoneHi, Math.abs(h - 0.5) * (o.vary ?? 0.5));
        const sx = xa + gap, sww = Math.max(1, xb - xa - gap * 2), sy = ya + gap * 0.8, sh = Math.max(1, rh - gap * 1.6);
        g.fillStyle = col; roundRect(g, sx, sy, sww, sh, Math.min(3, rh * 0.12, sww / 2, sh / 2)); g.fill();
        const lip = Math.max(1.2, rh * 0.09);
        g.fillStyle = rgba(P.stoneHi, 0.32); g.fillRect(sx + 2, sy + 0.5, sww - 4, Math.max(1, rh * 0.05));
        g.fillStyle = rgba(P.stoneSh, 0.42); g.fillRect(sx + 1, sy + sh - lip, sww - 2, lip);
        if (h > 0.62) { g.fillStyle = rgba(P.stoneHi, 0.16); g.beginPath(); g.ellipse(sx + sww * h, sy + sh * 0.45, Math.max(0.1, sww * 0.26), Math.max(0.1, sh * 0.24), 0, 0, TAU); g.fill(); }
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

// ===============================================================================================================
// LEVEL CONSTANTS, PALETTES, LAYOUT
// ===============================================================================================================
const CAM_MAX = LEVEL_LEN - W;
const PORTAL = 1600, ARCH = 3400, FGATE = 5400, FURN = 6720;
const P_FAR = 0.1, P_MID = 0.3, P_GAL = 0.55, P_CAV = 0.2, P_RIV = 0.45, P_HALL = 0.5, P_FRONT = 1.25;
const GT0 = 300;                       // floor tiles cover screen y GT0..H
const CAP_Y = 84;                      // underside of the tunnel ceiling (the cap beam's top)
const al = (x, st) => Math.floor(x / st) * st;   // world-aligned loop start (chunk-safe sampling)

// layer-x range a parallax layer needs so it can fill the screen window [a - camX, b - camX] for every camera
function layerRange(a, b, p) {
  let lo = Infinity, hi = -Infinity;
  for (let cam = Math.max(0, a - W); ; cam = Math.min(cam + 8, CAM_MAX)) {
    const s0 = Math.max(0, a - cam), s1 = Math.min(W, b - cam);
    if (s1 > s0) { lo = Math.min(lo, s0 + cam * p); hi = Math.max(hi, s1 + cam * p); }
    if (cam >= Math.min(CAM_MAX, b)) break;
  }
  return [Math.floor(lo) - 12, Math.ceil(hi) + 12];
}

// line styles: [colour, weight factor]; scenery is thinner and tinted, interactive props keep full INK
const LS = { ext: ['#2a2034', 0.62], mine: ['#1e1411', 0.62], gal: ['#2c1e1b', 0.45], lava: ['#170d0c', 0.64], forge: ['#180f0f', 0.64], front: ['#120b0d', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);

const ROCK_DUSK = { base: '#4b4254', sh: '#352d40', hi: '#6a5e78', crack: '#241c2c' };
const ROCK_MINE = { base: '#3d3337', sh: '#2b2327', hi: '#584a4d', crack: '#1a1316' };
const ROCK_GAL = { base: '#4c3d3a', sh: '#3b2e2c', hi: '#5f4b47', crack: '#2c201f' };
const TIMB = { base: '#6b4a33', sh: '#47301f', hi: '#8f6a48', grain: '#3a2617' };
const TIMB_D = { base: '#5c4a4e', sh: '#3d3039', hi: '#7e6a6c', grain: '#2e232c' };   // dusk-lit timber
const IRON = { base: '#3e3d45', sh: '#27262d', hi: '#706f7a' };
const KING = { iron: '#1e1c22', ironHi: '#3b3842', cloth: '#1d1b22', clothHi: '#302d38', clothSh: '#111015', green: '#7cc95c' };
const LAVA = { core: '#fff3b0', hot: '#ffc23a', mid: '#ff7a1e', deep: '#cc3a10', dark: '#7a1e0c', crust: '#3a1812', crustHi: '#5e2618' };
const CRY = {
  o: { base: '#ff9a3a', sh: '#c4561a', hi: '#ffe2a0', glow: '255,150,60' },
  c: { base: '#4ad6e4', sh: '#1d8296', hi: '#dcffff', glow: '80,215,235' },
};
const SNOW_D = { snow: '#d8cfe4', snowSh: '#9a8fb6', snowHi: '#f4eefa' };
const BAS = { stone: '#4f4649', stoneSh: '#3a3236', stoneHi: '#6a5d5f', joint: '#1e1719', snow: '#6a5d5f', snowSh: '#3a3236' };
const FLAGS = { stone: '#595050', stoneSh: '#443b3c', stoneHi: '#74686a', joint: '#241c1d', snow: '#74686a', snowSh: '#443b3c' };
const GREEN = { gem: '#7ee060', hi: '#e4ffd0', sh: '#2f8a3a', glow: '130,240,110' };
const GOLD = { gem: '#ffc640', hi: '#fff4c8', sh: '#b0701a', glow: '255,200,90' };
const FIRE_G = { outer: '#2f9440', mid: '#73e35c', core: '#e2ffb8' };
const FIRE_W = { outer: '#c4501c', mid: '#ffa53a', core: '#fff0b8' };
const FARP_BACK = { rock: '#7a5c8a', rockSh: '#614c7c', snow: '#e9c6d2', snowSh: '#ad95c0', haze: '#ec9a86', line: '#6a5280' };
const FARP_FRONT = { rock: '#4a3c62', rockSh: '#33294c', snow: '#a888ac', snowSh: '#625284', haze: '#b07082', line: '#3e3258', snowK: 0.5 };

// near-layer layout (world x)
const CLIFF = [[1150, 342], [1176, 306], [1204, 288], [1236, 256], [1262, 244], [1296, 206], [1326, 180], [1350, 158],
  [1384, 130], [1414, 94], [1446, 68], [1470, 36], [1486, 8], [1494, -14]];
const POSTS = [1700, 2090, 2190, 2580, 2780, 3170];
const OPENINGS = [[1730, 2062], [2218, 2554], [2808, 3144]];
const NEAR_CRY = [[1652, 334, 'o', 1.1], [1714, 196, 'c', 0.6], [2140, 330, 'c', 1.0], [2166, 236, 'o', 0.7], [2612, 334, 'o', 1.15],
  [2752, 262, 'c', 0.85], [3206, 334, 'c', 1.1], [3292, 226, 'o', 0.8]];
const TUN_LANTERNS = [1890, 2386, 2976];
const ENT_LANTERNS = [150, 560, 1110];
const GRATES = [[3760, 3960], [4420, 4600], [5040, 5220]];
const SPOUTS = [6450, 7000];
// the mine mouth's lantern spill (world x): from the gate in front of the portal down the tunnel to the cavern arch
const MINE_LIGHT = [1380, 3300];
// the lava river's light on the cavern's walkway and walls at fighter height (world x): out of the tunnel to inside the
// forge gate
const CAV_LIGHT = [ARCH - 260, FGATE + 260];
// the Collar Forge's glow on its floor's back half and wall base at fighter height (world x): from inside the gate to the
// level's end, pooled at the furnace and the two spouts
const FORGE_LIGHT = [FGATE + 100, LEVEL_LEN];
// ?l2fix=none: the readability lights off (the forge wall's, the mine mouth's, the cavern's, the forge glow), ?l2fix=noforge:
// only the forge glow (C.forgeLight) off (A/B tests)
const L2Q = (() => { try { return new URLSearchParams(location.search).get('l2fix') || ''; } catch { return ''; } })();
const L2FIX = L2Q !== 'none', L2FORGE = L2FIX && L2Q !== 'noforge';
const FPILLARS = [5770, 6150, 7140];
const HEARTH = 5880;

const LAY = (() => {
  const R = mulberry(7200);
  const stars = [];
  for (let i = 0; i < 70; i++) stars.push({ x: R.r(0, 1100), y: R.r(6, 170), r: R.r(0.8, 1.8), ph: R.r(0, TAU), sp: R.r(0.8, 2.2) });
  const farBack = [], farFront = [];
  for (let x = -140; x < 1200; x += R.r(110, 170)) farBack.push({ x, sy: R.r(176, 226), hl: R.r(120, 190), hr: R.r(120, 190), seed: R.i(1, 1e9) });
  for (const [x, sy] of [[-40, 236], [150, 214], [330, 246], [520, 200], [700, 170], [880, 224], [1060, 206], [1220, 240]])
    farFront.push({ x: x + R.r(-12, 12), sy, hl: R.r(140, 210), hr: R.r(140, 210), seed: R.i(1, 1e9) });
  const midBackTrees = [], midFrontTrees = [];
  for (let x = -20; x < 1300; x += R.r(5, 9)) midBackTrees.push({ x, dy: R.r(-1, 7), h: R.r(8, 15), w: R.r(6, 9) });
  for (let x = -20; x < 1300; x += R.r(6, 11)) midFrontTrees.push({ x, dy: R.r(-2, 9), h: R.r(14, 26), w: R.r(9, 14) });
  const clouds = [];
  for (let i = 0; i < 9; i++) clouds.push({ x: R.r(0, 1500), y: R.r(36, 200), w: R.r(170, 380), h: R.r(12, 20), seed: R.i(1, 1e9), sp: R.r(2, 5) });
  const motes = [];
  for (let i = 0; i < 170; i++) motes.push({ x: R.r(0, 1000), y: R.r(0, 580), sp: R.r(0.6, 1.4), sw: R.r(3, 12), ph: R.r(0, TAU), fr: R.r(0.5, 1.4), k: R(), layer: i < 110 ? 0 : 1 });
  const haze = [];
  for (let i = 0; i < 9; i++) haze.push({ x: R.r(0, 1100), sp: R.r(10, 18), ph: R.r(0, TAU), w: R.r(50, 110) });
  return { stars, farBack, farFront, midBackTrees, midFrontTrees, clouds, motes, haze };
})();
const CL_PERIOD = 1500;

// ===============================================================================================================
// SHARED DRAWING BITS
// ===============================================================================================================
function blobPath(g, p) {   // like blob() but adds a subpath (for even-odd holes)
  const n = p.length >> 1;
  g.moveTo((p[(n - 1) * 2] + p[0]) / 2, (p[(n - 1) * 2 + 1] + p[1]) / 2);
  for (let i = 0; i < n; i++) {
    const j = ((i + 1) % n) * 2;
    g.quadraticCurveTo(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[j]) / 2, (p[i * 2 + 1] + p[j + 1]) / 2);
  }
  g.closePath();
}
function lightPool(g, x, y, rx, ry, col, a) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.45, `rgba(${col},${a * 0.45})`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
}
function vgrad(g, x, y0, w, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(x, y0, w, y1 - y0);
}
// rough-hewn rock: world-aligned irregular facets (lit upper-left, shaded lower-right, crevices); chunk-safe
function rockFacets(g, xs, xe, ys, ye, P, seed, cw = 72, ch = 50, crackA = 0.85) {
  g.fillStyle = P.base; g.fillRect(xs - 2, ys - 2, xe - xs + 4, ye - ys + 4);
  const r0 = Math.floor(ys / ch) - 1, r1 = Math.ceil(ye / ch) + 1;
  for (let r = r0; r <= r1; r++) {
    const off = hash1(r * 31 + seed) * cw;
    for (let i = Math.floor((xs - off) / cw) - 1; ; i++) {
      const bx = i * cw + off;
      if (bx > xe + cw) break;
      const h = hash2(i, r * 7 + seed), h2 = hash2(i + 77, r * 5 + seed);
      const cx = bx + cw * (0.5 + (h - 0.5) * 0.35), cy = r * ch + ch * (0.5 + (h2 - 0.5) * 0.35);
      const rx = cw * (0.56 + 0.16 * h2), ry = ch * (0.6 + 0.16 * h);
      const p = [];
      for (let k = 0; k < 6; k++) {
        const a = Math.PI + (k / 6) * TAU + (hash2(i * 5 + k, r + seed) - 0.5) * 0.5;
        const rr = 0.8 + 0.28 * hash2(i * 9 + k, r * 3 + seed);
        p.push(cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr);
      }
      poly(g, p); g.fillStyle = mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * 0.8); g.fill();
      poly(g, [p[0], p[1], p[2], p[3], p[4], p[5], cx + rx * 0.08, cy - ry * 0.02]); g.fillStyle = rgba(P.hi, 0.4); g.fill();
      poly(g, [p[6], p[7], p[8], p[9], p[10], p[11], cx, cy + ry * 0.1]); g.fillStyle = rgba(P.sh, 0.55); g.fill();
      poly(g, p); g.strokeStyle = rgba(P.crack, crackA); g.lineWidth = 1.3; g.stroke();
    }
  }
}
// rails on sleepers along the back of the floor (side view of a track running along x)
function drawTrack(g, x0, x1, P = TIMB) {
  const xa = al(x0, 24) - 24, xb = x1 + 24;
  // ballast bed
  g.beginPath(); g.moveTo(xa, 364);
  for (let x = xa; x <= xb; x += 12) g.lineTo(x, 337 + 1.5 * Math.sin(x * 0.07) + hash1(x) * 1.5);
  g.lineTo(xb, 364); g.closePath();
  const gr = g.createLinearGradient(0, 336, 0, 364); gr.addColorStop(0, '#4c4246'); gr.addColorStop(1, '#2e272b');
  g.fillStyle = gr; g.fill();
  for (let x = al(x0, 7) - 7; x < xb; x += 7) { const h = hash1(x * 3 + 1); g.fillStyle = h < 0.5 ? 'rgba(20,14,16,0.4)' : 'rgba(120,108,112,0.35)'; g.fillRect(x + h * 4, 340 + hash1(x) * 20, 2.2, 1.6); }
  // sleepers
  for (let x = xa; x < xb; x += 24) {
    const j = hash1(x * 7) * 3;
    ink(g, (g) => poly(g, [x + j - 6, 361, x + j - 4, 341, x + j + 4, 341, x + j + 6, 361]), P.base, 1.6, (g) => { g.fillStyle = P.sh; g.fillRect(x + j, 338, 8, 26); });
  }
  // rails: far and near, with a bright top edge
  for (const [y, h] of [[344, 3.4], [354, 4]]) {
    g.fillStyle = '#1e1a1e'; g.fillRect(xa, y - 1, xb - xa, h + 2);
    g.fillStyle = '#5c5864'; g.fillRect(xa, y, xb - xa, h);
    g.fillStyle = '#a49ea8'; g.fillRect(xa, y, xb - xa, 1.2);
  }
}
// hexagonal ember crystals on a rock lump (origin = base centre)
function drawCrystals(g, kind, s, seed, rock = ROCK_MINE) {
  const C = CRY[kind], R = mulberry(seed);
  ink(g, (g) => blob(g, [-30 * s, 4, -24 * s, -10 * s, -6 * s, -16 * s, 16 * s, -12 * s, 30 * s, -2 * s, 22 * s, 6]), rock.hi, 2, (g) => {
    g.fillStyle = rock.sh; g.fillRect(0, -20 * s, 40 * s, 30);
  });
  const n = 5, list = [];
  for (let k = 0; k < n; k++) list.push({ a: lerp(-0.75, 0.75, k / (n - 1)) + R.r(-0.15, 0.15), L: R.r(26, 50) * s * (k === 2 ? 1.25 : 1), w: R.r(9, 14) * s, x: R.r(-14, 14) * s });
  list.sort((p, q) => q.L - p.L);
  for (const c of list) {
    g.save(); g.translate(c.x, -6 * s); g.rotate(c.a);
    const w = c.w / 2, L = c.L;
    ink(g, (g) => poly(g, [-w, 4, -w, -L * 0.72, 0, -L, w, -L * 0.72, w, 4]), C.base, 1.8, (g) => {
      g.fillStyle = C.sh; g.fillRect(w * 0.15, -L, w, L + 6);
      g.fillStyle = C.hi; poly(g, [-w, 4, -w, -L * 0.72, 0, -L, -w * 0.3, -L * 0.68, -w * 0.4, 4]); g.fill();
      g.fillStyle = rgba('#ffffff', 0.7); g.fillRect(-w * 0.75, -L * 0.62, 1.4, L * 0.45);
    });
    g.restore();
  }
}
// lantern: y = top of its hook
function drawLantern(g, x, y, k = 1) {
  g.save(); g.translate(x, y); g.scale(k, k);
  strokeLine(g, [0, 0, 0, 6], 1.4, LINE);
  ink(g, (g) => poly(g, [-7, 6, 7, 6, 9, 10, -9, 10]), IRON.base, 1.6);
  ink(g, (g) => poly(g, [-7, 10, 7, 10, 6, 28, -6, 28]), '#ffcf7a', 1.6, (g) => {
    g.fillStyle = '#fff0c0'; g.fillRect(-3, 13, 6, 12);
    g.strokeStyle = IRON.sh; g.lineWidth = 1.4; polyline(g, [0, 10, 0, 28]); g.stroke();
  });
  ink(g, (g) => poly(g, [-8, 28, 8, 28, 6, 32, -6, 32]), IRON.base, 1.6);
  g.restore();
}
function timberBeam(g, x0, y0, x1, y1, P, lw = 2.4) {   // axis-aligned beam with grain and a shadowed lower edge
  ink(g, (g) => poly(g, [x0, y0, x1, y0, x1, y1, x0, y1]), P.base, lw, (g) => {
    g.fillStyle = P.sh; g.fillRect(x0, y1 - (y1 - y0) * 0.35, x1 - x0, (y1 - y0));
    g.fillStyle = rgba(P.hi, 0.7); g.fillRect(x0, y0, x1 - x0, Math.min(3, (y1 - y0) * 0.2));
    g.strokeStyle = P.grain; g.lineWidth = 1;
    for (let x = al(x0, 37); x < x1; x += 37) { const h = hash1(x * 5); polyline(g, [x, y0 + 3 + h * 4, x + 20 + h * 12, y0 + 4 + h * 5]); g.stroke(); }
  });
}
function shoringPost(g, x, yTop, yBot, P) {
  ink(g, (g) => poly(g, [x - 13, yBot, x - 12, yTop, x + 12, yTop, x + 13, yBot]), P.base, 2.6, (g) => {
    g.fillStyle = P.sh; g.fillRect(x + 3, yTop - 4, 14, yBot - yTop + 8);
    g.fillStyle = rgba(P.hi, 0.7); g.fillRect(x - 13, yTop - 4, 4, yBot - yTop + 8);
    g.strokeStyle = P.grain; g.lineWidth = 1.1;
    for (let k = 0; k < 4; k++) { const gx = x - 8 + k * 5 + hash1(x + k) * 2; polyline(g, [gx, yTop + 6 + hash1(x * (k + 1)) * 30, gx + 1, yBot - 10 - hash1(x + k * 7) * 40]); g.stroke(); }
    g.fillStyle = IRON.base; g.fillRect(x - 13, yTop + 34, 26, 6); g.fillRect(x - 13, yBot - 64, 26, 6);
    g.fillStyle = IRON.hi; g.fillRect(x - 13, yTop + 34, 26, 1.2); g.fillRect(x - 13, yBot - 64, 26, 1.2);
  });
  for (const s of [-1, 1]) ink(g, (g) => poly(g, [x + s * 10, yTop + 48, x + s * 12, yTop + 36, x + s * 54, yTop, x + s * 44, yTop]), P.base, 2.1, (g) => { g.fillStyle = P.sh; g.fillRect(x - 60, yTop + 20, 120, 30); });
}
function dragonHeadRelief(g, s, col, sh, hi, open = true) {   // front-facing carved dragon head, origin = centre
  g.save(); g.scale(s, s);
  for (const k of [-1, 1]) ink(g, (g) => poly(g, [k * 14, -24, k * 34, -50, k * 28, -22]), sh, 2.2);   // horns
  for (const k of [-1, 1]) ink(g, (g) => poly(g, [k * 24, -10, k * 40, -2, k * 26, 6]), sh, 2);          // cheek frills
  ink(g, (g) => { g.beginPath(); g.moveTo(-26, -20); g.quadraticCurveTo(0, -36, 26, -20); g.lineTo(22, 6); g.quadraticCurveTo(16, 26, 0, 30); g.quadraticCurveTo(-16, 26, -22, 6); g.closePath(); }, col, 2.6, (g) => {
    g.fillStyle = sh; g.fillRect(4, -40, 30, 80);
    g.fillStyle = rgba(hi, 0.7); g.beginPath(); g.ellipse(-12, -20, 9, 4, -0.3, 0, TAU); g.fill();
    g.fillStyle = '#120c0c'; for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * 12, -8, 6, 3.4, k * 0.4, 0, TAU); g.fill(); }
    g.fillStyle = '#0c0808'; for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * 5, 10, 2.6, 1.6, 0, 0, TAU); g.fill(); }
    if (open) { g.fillStyle = '#1a0c08'; g.beginPath(); g.ellipse(0, 22, 11, 7, 0, 0, TAU); g.fill(); }
    g.strokeStyle = rgba(LINE, 0.6); g.lineWidth = 1.2;
    for (const k of [-1, 1]) { polyline(g, [k * 18, -2, k * 10, 14, k * 12, 24]); g.stroke(); }
  });
  g.restore();
}

// ===============================================================================================================
// EXTERIOR (entrance): far peaks, mountainside, dusk clouds
// ===============================================================================================================
function drawCitadel(g, x, y) {
  // the Dragon King's citadel, built around the summit (its walls follow the slopes)
  const c = '#251e38';
  g.fillStyle = c;
  poly(g, [x - 40, y + 44, x - 26, y + 22, x - 12, y + 10, x, y + 6, x + 14, y + 12, x + 30, y + 28, x + 42, y + 46]); g.fill();
  const tower = (tx, ty, tw, th, roof) => { g.fillRect(tx - tw / 2, ty - th, tw, th); poly(g, [tx - tw / 2 - 2, ty - th, tx, ty - th - roof, tx + tw / 2 + 2, ty - th]); g.fill(); };
  tower(x, y + 12, 12, 38, 17); tower(x - 15, y + 18, 8, 22, 10); tower(x + 15, y + 20, 9, 26, 11); tower(x - 28, y + 32, 6, 13, 7); tower(x + 29, y + 34, 6, 15, 7);
  g.fillStyle = '#8ad66a';
  for (const [wx, wy] of [[x - 1, y - 16], [x - 1, y - 6], [x - 16, y + 4], [x + 14, y + 2], [x + 14, y + 10], [x - 28, y + 24]]) g.fillRect(wx, wy, 2, 3);
  lightPool(g, x, y - 6, 40, 40, '130,230,110', 0.14);
}
function drawExtFar(g, xa, xb) {
  for (const pk of LAY.farBack) if (pk.x + pk.hr > xa - 10 && pk.x - pk.hl < xb + 10) drawPeak(g, pk, FARP_BACK, 384, 0.4, 0.95);
  for (const pk of LAY.farFront) if (pk.x + pk.hr > xa - 10 && pk.x - pk.hl < xb + 10) drawPeak(g, pk, FARP_FRONT, 384, 0.04, 0.86);
  const pk = LAY.farFront[4];
  if (pk.x > xa - 80 && pk.x < xb + 80) drawCitadel(g, pk.x, pk.sy);
}
const ridgeB = (x) => 296 + 14 * Math.sin(x * 0.0071 + 0.6) + 8 * Math.sin(x * 0.019 + 1.2) + 3 * Math.sin(x * 0.05);
const ridgeF = (x) => 332 + 12 * Math.sin(x * 0.0058 + 2.1) + 7 * Math.sin(x * 0.016 + 0.3) + 3 * Math.sin(x * 0.043 + 1);
function drawExtMid(g, xa, xb) {
  const y1 = 384, xs = al(xa, 6) - 6, xe = xb + 6;
  g.beginPath(); g.moveTo(xs, y1);
  for (let x = xs; x <= xe; x += 6) g.lineTo(x, ridgeB(x));
  g.lineTo(xe, y1); g.closePath();
  let gr = g.createLinearGradient(0, 270, 0, y1); gr.addColorStop(0, '#54456a'); gr.addColorStop(1, '#8a6a84'); g.fillStyle = gr; g.fill();
  for (const t of LAY.midBackTrees) if (t.x > xa - 20 && t.x < xb + 20) midTree(g, t.x, ridgeB(t.x) + t.dy, t.h, t.w, '#45395c', '#a090b8');
  g.beginPath(); g.moveTo(xs, y1);
  for (let x = xs; x <= xe; x += 5) g.lineTo(x, ridgeF(x));
  g.lineTo(xe, y1); g.closePath();
  gr = g.createLinearGradient(0, 310, 0, y1); gr.addColorStop(0, '#31293f'); gr.addColorStop(1, '#4d3d56'); g.fillStyle = gr; g.fill();
  for (const t of LAY.midFrontTrees) if (t.x > xa - 20 && t.x < xb + 20) midTree(g, t.x, ridgeF(t.x) + t.dy, t.h, t.w, '#251f35', '#8e84aa');
  // the miners' switchback path down the slope, with lanterns
  const path = [[180, ridgeF(180) + 6], [300, 372], [360, 360], [470, 380], [560, 366], [700, 384]];
  g.strokeStyle = 'rgba(150,128,160,0.45)'; g.lineWidth = 2; polyline(g, flat(path)); g.stroke();
  for (let i = 0; i < path.length; i++) { const [x, y] = path[i]; lightPool(g, x, y - 3, 12, 12, '255,190,110', 0.6); g.fillStyle = '#ffd890'; g.fillRect(x - 1, y - 4, 2, 2.5); }
  gr = g.createLinearGradient(0, 334, 0, y1); gr.addColorStop(0, 'rgba(138,112,152,0)'); gr.addColorStop(1, 'rgba(150,118,150,0.75)');
  g.fillStyle = gr; g.fillRect(xs, 334, xe - xs, y1 - 334);
}
function duskCloud(c, sc) {
  const pad = 14;
  return makeSprite(c.w + pad * 2, c.h * 2.6 + pad * 2, c.w / 2 + pad, c.h * 1.4 + pad, sc, (g) => {
    const R = mulberry(c.seed);
    const w = c.w / 2, h = c.h;
    const lens = (dx, dy, sx, sy) => {
      g.beginPath(); g.moveTo(-w * sx + dx, dy);
      g.bezierCurveTo(-w * 0.5 * sx + dx, -h * 0.9 * sy + dy, w * 0.3 * sx + dx, -h * 1.1 * sy + dy, w * sx + dx, -h * 0.2 * sy + dy);
      g.bezierCurveTo(w * 0.4 * sx + dx, h * 0.25 * sy + dy, -w * 0.4 * sx + dx, h * 0.3 * sy + dy, -w * sx + dx, dy);
      g.closePath();
    };
    const parts = [[0, 0, 1, 1], [R.r(-0.3, 0.3) * w, -h * 0.35, R.r(0.45, 0.7), 0.7], [R.r(-0.2, 0.4) * w, h * 0.25, R.r(0.3, 0.55), 0.6]];
    for (const [dx, dy, sx, sy] of parts) { lens(dx, dy, sx, sy); g.fillStyle = '#4e3a66'; g.fill(); }
    for (const [dx, dy, sx, sy] of parts) { lens(dx + 2, dy + h * 0.22, sx * 0.94, sy * 0.62); g.fillStyle = '#b8667a'; g.fill(); }   // lit from below (the sun has set)
    for (const [dx, dy, sx, sy] of parts) { lens(dx + 4, dy + h * 0.4, sx * 0.8, sy * 0.3); g.fillStyle = '#ffb48a'; g.fill(); }
  });
}

// ===============================================================================================================
// THE CHAINED CLAN DRAGONS (live, in the tunnel gallery): gentle, sad silhouettes with a warm rim light
// ===============================================================================================================
function dragonWorker(ctx, x, y, s, mode, t, seed, gemCol) {
  const body = '#33242a', far = '#251a1d', rim = 'rgba(255,196,140,0.9)', cart = '#2a2224';
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (mode === 'haul') {
    const ph = (t * 0.32 + seed) % 1;            // slow, heavy steps
    const bob = Math.sin(ph * TAU * 2) * 1.6;
    // ore cart behind, chained to the harness
    ctx.fillStyle = cart;
    poly(ctx, [-214, -58, -136, -58, -142, -18, -208, -18]); ctx.fill();
    ctx.fillStyle = '#3c3134'; blob(ctx, [-210, -58, -196, -72, -174, -78, -150, -70, -138, -58]); ctx.fill();
    ctx.fillStyle = '#ffae5a'; for (const [ox, oy] of [[-190, -66], [-168, -72], [-154, -64]]) ctx.fillRect(ox, oy, 2.4, 2);
    for (const wx of [-198, -154]) { ctx.fillStyle = '#1a1416'; ctx.beginPath(); ctx.arc(wx, -10, 9, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,170,110,0.5)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(wx, -10, 9, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke(); }
    ctx.strokeStyle = '#5a5058'; ctx.lineWidth = 2.2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(-136, -40); ctx.quadraticCurveTo(-90, -24 + bob, -30, -42 + bob); ctx.stroke(); ctx.setLineDash([]);
    // legs: far pair first (darker), walking phases
    const leg = (bx, by, p, col, len) => {
      const sw = Math.sin(p * TAU), lift = Math.max(0, Math.cos(p * TAU)) * 6;
      const fx = bx + sw * 11, fy = -lift;
      ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(bx, by + bob); ctx.lineTo((bx + fx) / 2 - 3, (by + fy) / 2 + 4); ctx.lineTo(fx, fy - 2); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(fx + 3, fy - 1, 7, 3, 0, 0, TAU); ctx.fill();
      void len;
    };
    leg(16, -38, ph + 0.5, far); leg(-30, -36, ph, far);
    // tail (drooping, swaying a little)
    const tw = Math.sin(t * 0.9 + seed * 5) * 4;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(-30, -52 + bob); ctx.quadraticCurveTo(-84, -40, -118, -10 + tw); ctx.lineTo(-124, -4 + tw); ctx.quadraticCurveTo(-86, -24, -32, -34 + bob); ctx.closePath(); ctx.fill();
    // body, haunch, shoulder
    ctx.beginPath(); ctx.ellipse(-2, -46 + bob, 42, 21, -0.04, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-26, -44 + bob, 19, 20, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(22, -48 + bob, 17, 18, 0, 0, TAU); ctx.fill();
    // folded wing, bound with a strap
    ctx.fillStyle = far; poly(ctx, [-22, -60 + bob, 14, -74 + bob, 32, -62 + bob, -2, -56 + bob]); ctx.fill();
    ctx.strokeStyle = '#6a5a52'; ctx.lineWidth = 2; polyline(ctx, [2, -74 + bob, -4, -50 + bob]); ctx.stroke();
    // neck low and forward, head hanging (tired)
    const hb = Math.sin(ph * TAU * 2 + 0.6) * 1.5;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(28, -62 + bob); ctx.quadraticCurveTo(52, -60 + bob, 64, -46 + hb); ctx.lineTo(60, -36 + hb); ctx.quadraticCurveTo(46, -44 + bob, 26, -40 + bob); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(56, -52 + hb); ctx.lineTo(80, -44 + hb); ctx.lineTo(86, -36 + hb); ctx.lineTo(76, -31 + hb); ctx.lineTo(58, -32 + hb); ctx.lineTo(52, -42 + hb); ctx.closePath(); ctx.fill();
    poly(ctx, [58, -50 + hb, 46, -62 + hb, 62, -52 + hb]); ctx.fill();                   // horn
    ctx.strokeStyle = 'rgba(255,200,150,0.5)'; ctx.lineWidth = 1.2;                      // closed, sad eye
    ctx.beginPath(); ctx.arc(66, -45 + hb, 3, 0.2, Math.PI - 0.2); ctx.stroke();
    // collar + chain link to the next worker + the King's gem
    ctx.fillStyle = '#121014'; ctx.beginPath(); ctx.ellipse(44, -50 + bob, 5, 10, -0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = gemCol; ctx.beginPath(); ctx.arc(46, -46 + bob, 2.2, 0, TAU); ctx.fill();
    // harness across the chest
    ctx.strokeStyle = '#6a5a52'; ctx.lineWidth = 2.4; polyline(ctx, [30, -62 + bob, 18, -30 + bob]); ctx.stroke(); polyline(ctx, [18, -32 + bob, -30, -42 + bob]); ctx.stroke();
    // near legs
    leg(22, -36, ph, body); leg(-24, -34, ph + 0.5, body);
    // warm rim light from the crystals above
    ctx.strokeStyle = rim; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(-2, -46 + bob, 42, 21, -0.04, Math.PI * 1.12, Math.PI * 1.85); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30, -63 + bob); ctx.quadraticCurveTo(52, -61 + bob, 64, -47 + hb); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-36, -50 + bob); ctx.quadraticCurveTo(-84, -40, -116, -12 + tw); ctx.stroke();
  } else {
    // rearing on the hind legs, swinging a pick at an ore boulder in front (slow raise, quick strike, rest)
    const cyc = (t * 0.32 + seed) % 1;
    let a;
    if (cyc < 0.55) a = lerp(0.4, -2.3, smooth(cyc / 0.55));
    else if (cyc < 0.63) a = lerp(-2.3, 0.55, (cyc - 0.55) / 0.08);
    else a = lerp(0.55, 0.4, smooth((cyc - 0.63) / 0.37));
    const lean = cyc < 0.55 ? -0.06 * smooth(cyc / 0.55) : 0.05;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(-20, -30); ctx.quadraticCurveTo(-70, -14, -112, -4); ctx.lineTo(-114, 2); ctx.quadraticCurveTo(-64, -2, -14, -14); ctx.closePath(); ctx.fill();   // tail on the ground
    ctx.strokeStyle = far; ctx.lineWidth = 10; polyline(ctx, [-4, -36, -10, -16, -2, -2]); ctx.stroke();
    ctx.strokeStyle = body; polyline(ctx, [6, -36, 2, -16, 12, -2]); ctx.stroke();
    ctx.save(); ctx.translate(0, -40); ctx.rotate(-0.75 + lean);
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(28, 0, 40, 20, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = far; poly(ctx, [6, -14, 44, -30, 60, -16, 22, -12]); ctx.fill();
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(66, -6, 12, 12, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(28, 0, 40, 20, 0, Math.PI * 1.1, Math.PI * 1.8); ctx.stroke();
    ctx.restore();
    // head (bowed toward the work)
    const hx = 40, hy = -96;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(hx - 8, hy - 6); ctx.lineTo(hx + 16, hy - 2); ctx.lineTo(hx + 22, hy + 6); ctx.lineTo(hx + 12, hy + 10); ctx.lineTo(hx - 6, hy + 8); ctx.closePath(); ctx.fill();
    poly(ctx, [hx - 4, hy - 4, hx - 16, hy - 16, hx, hy - 6]); ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,150,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(hx + 4, hy, 2.6, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = '#121014'; ctx.beginPath(); ctx.ellipse(hx - 10, hy + 12, 9, 5, 0.4, 0, TAU); ctx.fill();   // collar
    ctx.fillStyle = gemCol; ctx.beginPath(); ctx.arc(hx - 6, hy + 14, 2.2, 0, TAU); ctx.fill();
    // arms + pick (pivot at the shoulder)
    ctx.save(); ctx.translate(26, -78); ctx.rotate(a);
    ctx.strokeStyle = body; ctx.lineWidth = 8; polyline(ctx, [0, 0, 18, 4]); ctx.stroke();
    ctx.strokeStyle = '#5a4436'; ctx.lineWidth = 3.4; polyline(ctx, [10, 2, 62, 8]); ctx.stroke();
    ctx.fillStyle = '#4a4650'; poly(ctx, [58, -10, 66, -12, 64, 30, 60, 26, 62, 8]); ctx.fill();
    ctx.restore();
    // the ore boulder and the strike sparks
    ctx.fillStyle = '#3a2e30'; blob(ctx, [70, 0, 72, -30, 92, -46, 118, -40, 128, -12, 122, 2]); ctx.fill();
    ctx.strokeStyle = 'rgba(255,170,90,0.65)'; ctx.lineWidth = 1.6; polyline(ctx, [86, -34, 96, -22, 92, -10]); ctx.stroke();
    if (cyc > 0.6 && cyc < 0.72) {
      const f = 1 - (cyc - 0.6) / 0.12;
      ctx.strokeStyle = `rgba(255,220,140,${f})`; ctx.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) { const ang = -2.6 + i * 0.38, l = 8 + 10 * (1 - f); ctx.beginPath(); ctx.moveTo(74 + Math.cos(ang) * 4, -34 + Math.sin(ang) * 4); ctx.lineTo(74 + Math.cos(ang) * l, -34 + Math.sin(ang) * l); ctx.stroke(); }
    }
  }
  ctx.restore();
}

// fire (live): pal = { outer, mid, core }
function drawFlame(ctx, x, y, size, t, seed, pal) {
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
}

// ===============================================================================================================
// THE STAGE
// ===============================================================================================================
export function createStage() {
  let S = 0, C = null;
  let warm = 0;                          // 0 = cursed (venom green), 1 = the curse lifted (gold)
  let gemCache = null, gemCacheW = -1, gemCacheC = null;
  const snap = (v) => Math.round(v * S) / S;

  // the King's colour state, rebuilt only when warm (or the caches) change
  function kingCol() {
    if (gemCacheW === warm && gemCacheC === C) return gemCache;
    gemCacheW = warm; gemCacheC = C;
    gemCache = {
      gem: warm <= 0 ? GREEN.gem : mix(GREEN.gem, GOLD.gem, warm),
      fire: warm <= 0 ? FIRE_G : { outer: mix(FIRE_G.outer, FIRE_W.outer, warm), mid: mix(FIRE_G.mid, FIRE_W.mid, warm), core: mix(FIRE_G.core, FIRE_W.core, warm) },
      glows: warm <= 0 ? [[C.glowG, 1]] : warm >= 1 ? [[C.glowO, 1]] : [[C.glowG, 1 - warm], [C.glowO, warm]],
      gems: warm <= 0 ? [[C.gemG, 1]] : warm >= 1 ? [[C.gemO, 1]] : [[C.gemG, 1], [C.gemO, warm]],
      rings: warm <= 0 ? [[C.ringG, 1]] : warm >= 1 ? [[C.ringO, 1]] : [[C.ringG, 1], [C.ringO, warm]],
    };
    return gemCache;
  }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }

  let released = false;   // (released: kept so -- a resize only notes the scale -- until it's drawn on screen again)
  function setScale(s) {
    s = clamp(+s || 1, 0.5, 4);
    if (released) { S = s; return; }
    if (C && Math.abs(s - S) < 0.001) return;
    const prev = C;
    S = s;
    const cs = Math.min(STAGE_CS.near, Math.round(s * 4) / 4), csFar = Math.min(STAGE_CS.far, Math.round(s * 4) / 4);   // (STAGE_CS: lower on iOS)
    if (prev && prev.cs === cs && prev.csFar === csFar) { freeCanvases(prev.items); prev.items = buildItems(s); return; }
    if (prev) freeCanvases(prev);            // (the old scale's caches go now: iOS counts them until they shrink)
    C = build(cs, csFar);
    C.items = buildItems(s);
  }

  // ------------------------------------------------------------------ build all caches
  let GAL_CRY = [], GAL_DRAGONS = [], CAV_FALLS = [], RIV_PILLARS = [], HALL_GLOWS = [];
  function build(cs, csFar) {
    const t0 = performance.now();
    const c = { cs, csFar };
    // deep layers (each only as wide as its window needs)
    const ef = layerRange(0, PORTAL, P_FAR), em = layerRange(0, PORTAL, P_MID);
    c.extFar = buildStrip(ef[0], ef[1], 110, 386, csFar, P_FAR, (g, xa, xb) => { setLS('ext'); drawExtFar(g, xa, xb); });
    c.extMid = buildStrip(em[0], em[1], 230, 386, csFar, P_MID, (g, xa, xb) => { setLS('ext'); drawExtMid(g, xa, xb); });
    const gr = layerRange(PORTAL, ARCH, P_GAL);
    GAL_CRY = []; for (let x = al(gr[0], 230) + 60, i = 0; x < gr[1]; x += 230, i++) GAL_CRY.push([x + hash1(i * 7) * 60, i % 3 === 1 ? 'o' : 'c', 0.55 + 0.2 * hash1(i * 3)]);
    GAL_DRAGONS = [{ mode: 'haul', lx: 1400, sp: 9, seed: 0.13, s: 0.8 }, { mode: 'haul', lx: 1990, sp: 8, seed: 0.61, s: 0.78 }, { mode: 'pick', lx: 1500, seed: 0.37, s: 0.8 }];
    c.gallery = buildStrip(gr[0], gr[1], 40, 372, csFar, P_GAL, (g, xa, xb) => { setLS('gal'); drawGallery(g, xa, xb); });
    const cf = layerRange(ARCH, FGATE, P_CAV), rr = layerRange(ARCH, FGATE, P_RIV);
    CAV_FALLS = [0.18, 0.47, 0.8].map((f, i) => ({ x: lerp(cf[0], cf[1], f), y0: [96, 70, 120][i], w: [22, 30, 18][i] }));
    RIV_PILLARS = []; for (let x = al(rr[0], 300) + 120, i = 0; x < rr[1] + 200; x += 300, i++) RIV_PILLARS.push({ x: x + hash1(i * 11) * 80, w: 70 + hash1(i * 5 + 2) * 70, seed: i * 17 + 3 });
    c.cavFar = buildStrip(cf[0], cf[1], 0, 372, csFar, P_CAV, (g, xa, xb) => { setLS('lava'); drawCavFar(g, xa, xb); });
    c.river = buildStrip(rr[0], rr[1], 0, 372, cs, P_RIV, (g, xa, xb) => { setLS('lava'); drawRiver(g, xa, xb); });
    const hr = layerRange(FGATE, LEVEL_LEN, P_HALL);
    HALL_GLOWS = []; for (let x = al(hr[0], 230) + 115, i = 0; x < hr[1]; x += 230, i++) HALL_GLOWS.push([x, i % 4 === 2]);
    c.hall = buildStrip(hr[0], hr[1], 0, 372, csFar, P_HALL, (g, xa, xb) => { setLS('forge'); drawHall(g, xa, xb); });
    // near walls, the entrance ledge and the floor
    c.ledge = buildStrip(-10, 1240, 276, 344, cs, 1, (g, xa, xb) => { setLS('ext'); drawLedge(g, xa, xb); });
    c.wallA = buildStrip(1140, ARCH + 70, 0, 372, cs, 1, drawWallA);
    // the mine mouth and tunnel's wall base, lit by the gallery's lanterns spilling out (readability, painted review:
    // painted Shadow lost 8 % of his outline on the dark gate and tunnel interior at camX ~1200); a near-layer strip,
    // screened over the backdrop, faded in at the gate and out down the tunnel (?l2fix=none: off)
    c.mineLight = buildStrip(MINE_LIGHT[0], MINE_LIGHT[1], 240, 366, Math.min(cs, 0.5), 1, (g, xa, xb) => {
      const [a, b] = MINE_LIGHT, f = 160;
      const v = g.createLinearGradient(0, 240, 0, 366);
      v.addColorStop(0, 'rgba(255,170,100,0)'); v.addColorStop(0.45, 'rgba(255,170,100,0.13)');
      v.addColorStop(0.9, 'rgba(255,170,100,0.17)'); v.addColorStop(1, 'rgba(255,170,100,0)');
      g.fillStyle = v; g.fillRect(xa, 240, xb - xa, 126);
      g.globalCompositeOperation = 'destination-out';
      const l = g.createLinearGradient(a, 0, a + f, 0); l.addColorStop(0, '#000'); l.addColorStop(1, 'rgba(0,0,0,0)');
      const r = g.createLinearGradient(b - f, 0, b, 0); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, '#000');
      g.fillStyle = l; g.fillRect(a, 240, f, 126); g.fillStyle = r; g.fillRect(b - f, 240, f, 126);
    });
    // the lava cavern at fighter height, lit by the lava river behind the railing: a warm band peaking at the river's edge
    // and the walkway's back half (readability, painted spawn plates: the mid-Mines arenas, camX ~3300 and ~4700, lost
    // 12-22 % of the fighters' outlines on the dark walkway, its grating and the forge gate) -- screened over the walls,
    // the river and the floor, under the props and fighters; faded in out of the tunnel and out inside the forge gate
    c.cavLight = buildStrip(CAV_LIGHT[0], CAV_LIGHT[1], 236, 444, Math.min(cs, 0.5), 1, (g, xa, xb) => {
      const [a, b] = CAV_LIGHT, f = 220;
      const v = g.createLinearGradient(0, 236, 0, 444);
      v.addColorStop(0, 'rgba(255,150,80,0)'); v.addColorStop(0.3, 'rgba(255,150,80,0.12)'); v.addColorStop(0.55, 'rgba(255,150,80,0.2)');
      v.addColorStop(0.75, 'rgba(255,150,80,0.14)'); v.addColorStop(1, 'rgba(255,150,80,0)');
      g.fillStyle = v; g.fillRect(xa, 236, xb - xa, 208);
      g.globalCompositeOperation = 'destination-out';
      // (over the lava river itself only half the light, y 300-342 where it shows between the tunnel wall and the forge
      //  gate: the light comes off it, and the full band dulled its colour -- critic)
      const RV = [ARCH + 70, FGATE - 152], rv = g.createLinearGradient(0, 296, 0, 348);
      rv.addColorStop(0, 'rgba(0,0,0,0)'); rv.addColorStop(4 / 52, 'rgba(0,0,0,0.5)');
      rv.addColorStop(46 / 52, 'rgba(0,0,0,0.5)'); rv.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rv; g.fillRect(RV[0], 296, RV[1] - RV[0], 52);
      const l = g.createLinearGradient(a, 0, a + f, 0); l.addColorStop(0, '#000'); l.addColorStop(1, 'rgba(0,0,0,0)');
      const r = g.createLinearGradient(b - f, 0, b, 0); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, '#000');
      g.fillStyle = l; g.fillRect(a, 236, f, 208); g.fillStyle = r; g.fillRect(b - f, 236, f, 208);
    });
    // the Collar Forge at fighter height, lit by the furnace and the spouts' lava (readability, painted spawn plates: the
    // boss arena, camX 6240, read worst on the dark brick between the furnace and the far spout) -- as the cavern's:
    // screened over the wall base and the floor's back half, under the props and fighters, the ceiling left dark; a low
    // even band plus pools at the furnace and the spouts, faded in where the cavern's fades out
    c.forgeLight = buildStrip(FORGE_LIGHT[0], FORGE_LIGHT[1], 236, 444, Math.min(cs, 0.5), 1, (g, xa, xb) => {
      const [a] = FORGE_LIGHT, f = 220;
      const v = g.createLinearGradient(0, 236, 0, 444);
      v.addColorStop(0, 'rgba(255,145,75,0)'); v.addColorStop(0.3, 'rgba(255,145,75,0.052)'); v.addColorStop(0.55, 'rgba(255,145,75,0.075)');
      v.addColorStop(0.75, 'rgba(255,145,75,0.052)'); v.addColorStop(1, 'rgba(255,145,75,0)');
      g.fillStyle = v; g.fillRect(xa, 236, xb - xa, 208);
      // (pools ~2:1 over the band, so the light reads as coming off the furnace and the spouts -- critic)
      lightPool(g, FURN, 352, 340, 78, '255,145,75', 0.18);
      for (const x of SPOUTS) lightPool(g, x, 352, 170, 78, '255,145,75', 0.17);
      g.globalCompositeOperation = 'destination-out';
      const l = g.createLinearGradient(a, 0, a + f, 0); l.addColorStop(0, '#000'); l.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = l; g.fillRect(a, 236, f, 208);
    });
    c.wallF = buildStrip(FGATE - 170, LEVEL_LEN, 0, 372, cs, 1, (g, xa, xb) => { setLS('forge'); drawWallF(g, xa, xb); });
    c.ground = buildStrip(0, LEVEL_LEN, GT0, H, cs, 1, drawGround);
    // glows and small live sprites
    c.sunGlow = radialSprite(300, 0.5, [[0, 'rgba(255,190,120,0.75)'], [0.3, 'rgba(255,150,110,0.35)'], [1, 'rgba(240,120,110,0)']]);
    c.moon = makeSprite(44, 44, 22, 22, csFar, (g) => {
      const gr = g.createRadialGradient(0, 0, 8, 0, 0, 22); gr.addColorStop(0, 'rgba(255,240,220,0.35)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
      g.fillStyle = gr; g.fillRect(-22, -22, 44, 44);
      g.fillStyle = '#f6ead2'; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(5, -3, 10, 0, TAU); g.fill();
    });
    c.clouds = LAY.clouds.map((cl) => ({ cl, spr: duskCloud(cl, Math.min(0.75, csFar)) }));
    c.glowWarm = radialSprite(64, 1, [[0, 'rgba(255,190,110,0.6)'], [0.35, 'rgba(255,140,60,0.24)'], [1, 'rgba(255,110,40,0)']]);
    c.glowCyan = radialSprite(64, 1, [[0, 'rgba(110,230,245,0.55)'], [0.35, 'rgba(70,200,230,0.22)'], [1, 'rgba(60,180,220,0)']]);
    c.glowLava = radialSprite(64, 1, [[0, 'rgba(255,170,70,0.7)'], [0.4, 'rgba(255,100,30,0.3)'], [1, 'rgba(255,80,20,0)']]);
    c.glowG = radialSprite(64, 1, [[0, 'rgba(140,255,120,0.55)'], [0.35, 'rgba(110,235,100,0.22)'], [1, 'rgba(80,200,90,0)']]);
    c.glowO = radialSprite(64, 1, [[0, 'rgba(255,210,110,0.6)'], [0.35, 'rgba(255,160,60,0.25)'], [1, 'rgba(255,120,40,0)']]);
    c.haze = radialSprite(40, 0.5, [[0, 'rgba(255,170,110,0.22)'], [0.6, 'rgba(255,150,100,0.08)'], [1, 'rgba(255,140,90,0)']]);
    const gemSpr = (P) => makeSprite(14, 14, 7, 7, Math.max(1, cs), (g) => {
      g.fillStyle = INK; poly(g, [0, -6, 5.5, 0, 0, 6, -5.5, 0]); g.fill();
      g.fillStyle = P.gem; poly(g, [0, -4.5, 4, 0, 0, 4.5, -4, 0]); g.fill();
      g.fillStyle = P.sh; poly(g, [0, 0, 4, 0, 0, 4.5]); g.fill();
      g.fillStyle = P.hi; poly(g, [-2.4, -0.6, 0, -3.4, 0.4, -1]); g.fill();
    });
    c.gemG = gemSpr(GREEN); c.gemO = gemSpr(GOLD);
    const ringSpr = (P) => makeSprite(120, 120, 60, 60, cs, (g) => {
      const gr = g.createRadialGradient(0, 0, 26, 0, 0, 52);
      gr.addColorStop(0, P.sh); gr.addColorStop(0.35, P.gem); gr.addColorStop(0.6, P.hi); gr.addColorStop(0.85, P.gem); gr.addColorStop(1, P.sh);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.arc(0, 0, 30, 0, TAU, true); g.fill();
      g.strokeStyle = rgba(P.hi, 0.8); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 41, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
      // crude rivet studs of the collar in the mould
      g.fillStyle = rgba(P.sh, 0.8); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; g.beginPath(); g.arc(Math.cos(a) * 40, Math.sin(a) * 40, 2.4, 0, TAU); g.fill(); }
    });
    c.ringG = ringSpr(GREEN); c.ringO = ringSpr(GOLD);
    c.wheel = makeSprite(80, 80, 40, 40, cs, (g) => { setLS('ext'); drawSheave(g, 34); });
    c.drum = makeSprite(52, 52, 26, 26, cs, (g) => { setLS('ext'); drawDrum(g); });
    c.lavaTex = makeSprite(24, 96, 0, 0, cs, (g) => {
      const R = mulberry(19);
      g.fillStyle = LAVA.mid; g.fillRect(0, 0, 24, 96);
      for (let i = 0; i < 30; i++) {
        const x = R.r(0, 24), y = R.r(0, 96), l = R.r(10, 36);
        g.strokeStyle = R() < 0.45 ? LAVA.core : R() < 0.6 ? LAVA.hot : LAVA.deep;
        g.lineWidth = R.r(1.2, 3);
        for (const dy of [-96, 0, 96]) { polyline(g, [x, y + dy, x + R.r(-1, 1), y + dy + l]); g.stroke(); }
      }
    });
    c.chain = makeSprite(14, 260, 7, 0, cs, (g) => {
      for (let y = 0, k = 0; y < 256; y += 8, k++) {
        g.strokeStyle = '#141114'; g.lineWidth = 3.6;
        if (k % 2) { g.beginPath(); g.ellipse(0, y + 4, 2, 5, 0, 0, TAU); g.stroke(); g.strokeStyle = '#5a5660'; g.lineWidth = 1.6; g.stroke(); }
        else { g.beginPath(); g.ellipse(0, y + 4, 4.5, 5, 0, 0, TAU); g.stroke(); g.strokeStyle = '#5a5660'; g.lineWidth = 1.6; g.stroke(); }
      }
    });
    c.hook = makeSprite(30, 40, 15, 4, cs, (g) => {
      setLS('forge');
      ink(g, (g) => { g.beginPath(); g.arc(0, 18, 11, Math.PI * 1.05, Math.PI * 0.15, true); g.lineTo(13, 18); g.arc(0, 18, 7, Math.PI * 0.15, Math.PI * 1.05); g.lineTo(-4, 0); g.lineTo(4, 0); g.closePath(); }, '#4a4650', 1.6);
    });
    c.crucible = makeSprite(90, 80, 45, 6, cs, (g) => { setLS('lava'); drawCrucible(g); });
    c.flag = makeSprite(84, 56, 0, 0, cs, (g) => { setLS('ext'); drawFlagCloth(g, 84, 56); });
    c.banner = makeSprite(70, 150, 0, 0, cs, (g) => { setLS('forge'); drawKingBanner(g, 4, 4, 60, 140, 61, 2); });
    c.flakes = [1.1, 1.7, 2.6].map((r) => radialSprite(r * 2, Math.max(1, cs), [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]));
    c.ember = radialSprite(5, Math.max(1, cs), [[0, 'rgba(255,240,180,1)'], [0.35, 'rgba(255,170,70,0.9)'], [1, 'rgba(255,110,30,0)']]);
    c.near = buildNear(cs);
    c.front = buildFront(cs);
    c.buildMs = performance.now() - t0;
    return c;
  }

  // ------------------------------------------------------------------ deep layers
  function drawGallery(g, xa, xb) {
    const xs = xa - 2, xe = xb + 2;
    rockFacets(g, xs, xe, 40, 372, ROCK_GAL, 31, 54, 38, 0.55);
    vgrad(g, xs, 40, xe - xs, 190, [[0, 'rgba(12,7,8,0.85)'], [1, 'rgba(12,7,8,0)']]);
    // gallery floor and rails
    vgrad(g, xs, 300, xe - xs, 372, [[0, '#4e3c33'], [1, '#3a2c26']]);
    g.fillStyle = '#5a4840'; g.fillRect(xs, 300, xe - xs, 2);
    for (let x = al(xs, 18); x < xe; x += 18) { g.fillStyle = '#3a2a22'; g.fillRect(x, 305, 6, 12); }
    for (const y of [306, 314]) { g.fillStyle = '#26201f'; g.fillRect(xs, y - 1, xe - xs, 4); g.fillStyle = '#7a6e70'; g.fillRect(xs, y, xe - xs, 1); }
    // shoring
    timberBeam(g, xs - 10, 92, xe + 10, 102, { base: '#5a4232', sh: '#3e2c22', hi: '#755640', grain: '#33241b' }, 1.8);
    for (let x = al(xs, 190) - 190; x < xe + 190; x += 190) {
      ink(g, (g) => poly(g, [x - 8, 304, x - 7, 102, x + 7, 102, x + 8, 304]), '#5a4232', 1.8, (g) => { g.fillStyle = '#3e2c22'; g.fillRect(x + 2, 100, 8, 210); });
    }
    // ore boulders where the pick dragon works
    // crystals and their light
    for (const [x, k, s] of GAL_CRY) {
      if (x < xa - 80 || x > xb + 80) continue;
      lightPool(g, x, 250, 120, 90, CRY[k].glow, 0.26);
      g.save(); g.translate(x, 300); drawCrystals(g, k, s, (x * 13) | 0, ROCK_GAL); g.restore();
    }
    // atmospheric haze pushes the gallery back; warm bounce at the bottom
    g.fillStyle = 'rgba(46,28,24,0.32)'; g.fillRect(xs, 40, xe - xs, 332);
    vgrad(g, xs, 250, xe - xs, 372, [[0, 'rgba(255,140,70,0)'], [1, 'rgba(255,140,70,0.12)']]);
  }
  function drawCavFar(g, xa, xb) {
    const xs = xa - 2, xe = xb + 2;
    vgrad(g, xs, 0, xe - xs, 372, [[0, '#120a0b'], [0.4, '#1e100e'], [0.74, '#3c1b12'], [1, '#6e2e14']]);
    // columnar basalt
    for (let i = Math.floor(xs / 34) - 1; i * 34 < xe + 34; i++) {
      const x = i * 34 + (hash2(i, 5) - 0.5) * 10, w = 24 + hash2(i, 6) * 18, top = 6 + hash2(i, 7) * 60;
      const gr = g.createLinearGradient(0, top, 0, 372);
      gr.addColorStop(0, 'rgba(255,120,60,0)'); gr.addColorStop(0.6, 'rgba(255,120,60,0.08)'); gr.addColorStop(1, 'rgba(255,130,60,0.26)');
      g.fillStyle = gr; g.fillRect(x, top, 3, 372 - top);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + w * 0.55, top, w * 0.45, 372 - top);
      g.strokeStyle = 'rgba(8,4,4,0.55)'; g.lineWidth = 1.2; polyline(g, [x, top, x, 372]); g.stroke();
      for (let y = top + 30 + hash2(i, 8) * 40; y < 340; y += 40 + hash2(i, (y | 0)) * 50) { g.fillStyle = 'rgba(6,3,3,0.5)'; g.fillRect(x + 1, y, w - 2, 1.6); }
    }
    // lavafall sources
    for (const f of CAV_FALLS) {
      if (f.x < xa - 60 || f.x > xb + 60) continue;
      lightPool(g, f.x, f.y0 + 120, 70, 160, '255,120,40', 0.32);
      g.fillStyle = '#0c0606'; g.beginPath(); g.ellipse(f.x, f.y0, f.w * 0.9, f.w * 0.5, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,150,60,0.7)'; g.lineWidth = 2; g.beginPath(); g.ellipse(f.x, f.y0, f.w * 0.9, f.w * 0.5, 0, 0.1, Math.PI - 0.1); g.stroke();
    }
    // stalactites
    for (let x = al(xs, 38) - 38; x < xe + 38; x += 38) {
      const h = hash1(x * 3 + 9), len = 24 + h * 90, w = 10 + h * 14, xx = x + hash1(x) * 18;
      g.fillStyle = '#100808'; poly(g, [xx - w, -4, xx + w, -4, xx + w * 0.2, len * 0.7, xx, len]); g.fill();
      g.fillStyle = 'rgba(255,120,60,0.35)'; poly(g, [xx - w * 0.3, len * 0.55, xx + w * 0.15, len * 0.6, xx, len]); g.fill();
    }
    vgrad(g, xs, 260, xe - xs, 372, [[0, 'rgba(255,110,40,0)'], [1, 'rgba(255,120,40,0.35)']]);
  }
  function drawRiver(g, xa, xb) {
    const xs = al(xa, 4) - 4, xe = xb + 4;
    // stone columns rising from the river to the cavern roof
    for (const p of RIV_PILLARS) {
      if (p.x + p.w < xa - 20 || p.x - p.w > xb + 20) continue;
      const R = mulberry(p.seed), hw = p.w / 2;
      const L = [], Rr = [];
      for (let y = -10; y <= 300; y += 20) { const flare = y > 230 ? (y - 230) * 0.5 : 0; L.push(p.x - hw - flare + R.r(-6, 6), y); Rr.push(p.x + hw + flare + R.r(-6, 6), y); }
      const pts = L.slice(); for (let i = Rr.length - 2; i >= 0; i -= 2) pts.push(Rr[i], Rr[i + 1]);
      ink(g, (g) => poly(g, pts), '#1c1213', 1.8, (g) => {
        vgrad(g, p.x - p.w, -10, p.w * 2, 310, [[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(120,50,24,0.25)'], [1, 'rgba(255,120,50,0.5)']]);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(p.x + hw * 0.2, -10, p.w, 320);
        g.strokeStyle = 'rgba(255,140,70,0.5)'; g.lineWidth = 2.2; polyline(g, L.slice(16)); g.stroke();
        g.strokeStyle = 'rgba(10,5,5,0.5)'; g.lineWidth = 1.2;
        for (let k = 0; k < 4; k++) { const x = p.x - hw * 0.6 + k * hw * 0.4; polyline(g, [x, R.r(0, 80), x + R.r(-4, 4), R.r(140, 290)]); g.stroke(); }
      });
    }
    // far bank
    const bank = (x) => 290 + 5 * Math.sin(x * 0.03) + 3 * Math.sin(x * 0.11 + 1) + hash1((x / 7) | 0) * 2;
    g.beginPath(); g.moveTo(xs, 306);
    for (let x = xs; x <= xe; x += 4) g.lineTo(x, bank(x));
    g.lineTo(xe, 306); g.closePath(); g.fillStyle = '#1a1010'; g.fill();
    // lava surface
    vgrad(g, xs, 300, xe - xs, 372, [[0, '#ffb03a'], [0.08, '#f2701c'], [0.4, '#c83c12'], [0.75, '#d84e16'], [1, '#f2701c']]);
    for (let x = xs; x <= xe; x += 4) { g.fillStyle = 'rgba(255,220,120,0.55)'; g.fillRect(x, bank(x) + 9, 4, 2); }
    // crust plates drifting on the flow (world-aligned cells)
    for (let r = 0; r < 4; r++) {
      const y = 316 + r * 14, cw = 64 + r * 10;
      for (let i = Math.floor(xs / cw) - 1; i * cw < xe + cw; i++) {
        const h = hash2(i, r + 40); if (h < 0.35) continue;
        const cx = i * cw + h * 30, w = 18 + h * 26 + r * 4, hh = 3 + r * 1.5;
        g.fillStyle = LAVA.crust; g.beginPath(); g.ellipse(cx, y, w, hh, 0, 0, TAU); g.fill();
        g.fillStyle = LAVA.crustHi; g.beginPath(); g.ellipse(cx - w * 0.2, y - hh * 0.3, w * 0.5, hh * 0.4, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,200,90,0.75)'; g.lineWidth = 1; polyline(g, [cx - w * 0.6, y, cx - w * 0.1, y + hh * 0.3, cx + w * 0.4, y - hh * 0.2]); g.stroke();
      }
    }
    vgrad(g, xs, 220, xe - xs, 300, [[0, 'rgba(255,120,40,0)'], [1, 'rgba(255,130,50,0.3)']]);
  }
  function drawHall(g, xa, xb) {
    const xs = xa - 2, xe = xb + 2;
    vgrad(g, xs, 0, xe - xs, 372, [[0, '#0e090a'], [0.5, '#1a100e'], [1, '#2e1812']]);
    // upper terrace floor where distant furnaces burn
    vgrad(g, xs, 228, xe - xs, 372, [[0, '#2a1912'], [1, '#1c120e']]);
    g.fillStyle = 'rgba(255,150,80,0.35)'; g.fillRect(xs, 228, xe - xs, 1.5);
    for (const [x] of HALL_GLOWS) {
      if (x < xa - 120 || x > xb + 120) continue;
      lightPool(g, x, 214, 90, 60, '255,130,50', 0.35);
      ink(g, (g) => { g.beginPath(); g.moveTo(x - 46, 230); g.quadraticCurveTo(x - 44, 168, x, 162); g.quadraticCurveTo(x + 44, 168, x + 46, 230); g.closePath(); }, '#2a1814', 1.6, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 10, 150, 50, 90);
      });
      g.fillStyle = '#ff9a3a'; g.beginPath(); g.moveTo(x - 16, 230); g.lineTo(x - 16, 212); g.quadraticCurveTo(x, 198, x + 16, 212); g.lineTo(x + 16, 230); g.closePath(); g.fill();
      g.fillStyle = '#ffe08a'; g.fillRect(x - 8, 218, 16, 12);
      // smoke column
      vgrad(g, x - 10, 40, 20, 162, [[0, 'rgba(40,30,30,0)'], [1, 'rgba(60,44,40,0.45)']]);
    }
    // arcade of pillars and vault ribs
    for (let x = al(xs, 230) - 230; x < xe + 230; x += 230) {
      ink(g, (g) => poly(g, [x - 22, 232, x - 20, 40, x + 20, 40, x + 22, 232]), '#1a1112', 1.6, (g) => {
        g.fillStyle = 'rgba(255,140,70,0.18)'; g.fillRect(x + 14, 40, 8, 200);
      });
      g.strokeStyle = '#1a1112'; g.lineWidth = 14; g.beginPath(); g.moveTo(x, 44); g.quadraticCurveTo(x + 115, -30, x + 230, 44); g.stroke();
      g.strokeStyle = 'rgba(255,130,60,0.16)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 52); g.quadraticCurveTo(x + 115, -18, x + 230, 52); g.stroke();
    }
    // hanging chains
    g.strokeStyle = 'rgba(20,14,14,0.9)'; g.lineWidth = 2;
    for (let x = al(xs, 70) - 70; x < xe + 70; x += 70) { const h = hash1(x * 5 + 2); if (h < 0.45) continue; polyline(g, [x + h * 30, 0, x + h * 30, 60 + h * 110]); g.stroke(); }
    g.fillStyle = 'rgba(40,24,20,0.3)'; g.fillRect(xs, 0, xe - xs, 372);
  }

  // ------------------------------------------------------------------ the entrance ledge (behind the track)
  function drawLedge(g, xa, xb) {
    const xs = al(xa, 6) - 6, xe = xb + 6;
    const lip = (x) => 320 + 3 * Math.sin(x * 0.021) + 2 * Math.sin(x * 0.07 + 1);
    // ledge top (gravel) from the lip down to the track
    g.beginPath(); g.moveTo(xs, 346);
    for (let x = xs; x <= xe; x += 6) g.lineTo(x, lip(x));
    g.lineTo(xe, 346); g.closePath();
    vgrad(g, xs, 316, xe - xs, 346, [[0, '#6e6274'], [1, '#544a5a']]);
    for (let x = al(xs, 9); x < xe; x += 9) { const h = hash1(x * 7); g.fillStyle = h < 0.5 ? 'rgba(40,30,46,0.35)' : 'rgba(170,160,186,0.3)'; g.fillRect(x + h * 5, lip(x) + 4 + hash1(x + 3) * 18, 2, 1.5); }
    // snow along the lip
    snowCap(g, xs, xe, (x) => lip(x) + 1, 6, 4021, SNOW_D, 1.4, 0);
    // fence along the drop
    for (let x = al(xs, 66) - 66; x < xe + 66; x += 66) {
      const h = 40 + hash1(x) * 6, y = lip(x) + 4;
      ink(g, (g) => poly(g, [x - 4, y, x - 4, y - h, x + 4, y - h - 2, x + 4, y]), TIMB_D.base, 2, (g) => { g.fillStyle = TIMB_D.sh; g.fillRect(x + 1, y - h - 4, 4, h + 6); });
      snowCap(g, x - 4, x + 4, () => y - h - 1, 4, (x * 3) | 0, SNOW_D, 1.1, 1);
    }
    for (const dy of [-34, -16]) {
      g.beginPath(); for (let x = xs; x <= xe; x += 6) g.lineTo(x, lip(x) + dy); g.lineWidth = 4.4 * LK + 3; g.strokeStyle = LINE; g.stroke();
      g.beginPath(); for (let x = xs; x <= xe; x += 6) g.lineTo(x, lip(x) + dy); g.lineWidth = 3.6; g.strokeStyle = TIMB_D.base; g.stroke();
      g.beginPath(); for (let x = xs; x <= xe; x += 6) g.lineTo(x, lip(x) + dy - 1.4); g.lineWidth = 1; g.strokeStyle = TIMB_D.hi; g.stroke();
    }
    g.beginPath(); for (let x = xs; x <= xe; x += 6) g.lineTo(x, lip(x) - 36.5); g.lineWidth = 2; g.strokeStyle = 'rgba(232,224,240,0.85)'; g.stroke();
  }

  // ------------------------------------------------------------------ near wall A: cliff, mine mouth, tunnels
  const OPEN_PTS = OPENINGS.map(([a, b], i) => {
    const R = mulberry(500 + i), top = 122, bot = 326, pts = [];
    for (let x = a + 14; x <= b - 14; x += 18) { const f = (x - a) / (b - a); pts.push(x, top + 22 * (1 - Math.sin(f * Math.PI)) + R.r(-5, 5)); }
    for (let y = top + 30; y <= bot - 12; y += 20) pts.push(b + R.r(-6, 4), y);
    for (let x = b - 14; x >= a + 14; x -= 24) pts.push(x, bot + R.r(-4, 3));
    for (let y = bot - 12; y >= top + 30; y -= 20) pts.push(a + R.r(-4, 6), y);
    return pts;
  });
  function drawWallA(g, xa, xb) {
    const xs = xa - 4, xe = xb + 4;
    g.save();
    g.beginPath(); g.moveTo(CLIFF[0][0], 380);
    for (const [x, y] of CLIFF) g.lineTo(x, y);
    g.lineTo(xe + 30, -30); g.lineTo(xe + 30, 380); g.closePath();
    OPENINGS.forEach(([a, b], i) => { if (b > xs - 30 && a < xe + 30) blobPath(g, OPEN_PTS[i]); });
    g.clip('evenodd');
    if (xs < PORTAL + 40) {
      setLS('ext');
      rockFacets(g, xs, Math.min(xe, PORTAL + 30), -10, 380, ROCK_DUSK, 21, 66, 46);
      vgrad(g, xs, -10, Math.min(xe, PORTAL + 30) - xs, 260, [[0, 'rgba(24,18,44,0.55)'], [1, 'rgba(24,18,44,0)']]);
      lightPool(g, 1440, 300, 120, 110, '120,230,110', 0.1);
    }
    if (xe > PORTAL - 10) {
      setLS('mine');
      g.save(); g.beginPath(); g.rect(PORTAL - 6, -40, xe - PORTAL + 50, 440); g.clip();
      rockFacets(g, Math.max(xs, PORTAL - 30), xe, -10, 380, ROCK_MINE, 22);
      vgrad(g, Math.max(xs, PORTAL - 30), -10, xe - Math.max(xs, PORTAL - 30), 150, [[0, 'rgba(10,6,8,0.8)'], [1, 'rgba(10,6,8,0)']]);
      vgrad(g, Math.max(xs, PORTAL - 30), 240, xe - Math.max(xs, PORTAL - 30), 380, [[0, 'rgba(160,80,40,0)'], [1, 'rgba(160,80,40,0.22)']]);
      for (const [x, y, k, s] of NEAR_CRY) if (x > xs - 160 && x < xe + 160) lightPool(g, x, y - 40, 150 * s, 120 * s, CRY[k].glow, 0.22);
      for (const x of TUN_LANTERNS) if (x > xs - 160 && x < xe + 160) lightPool(g, x, 190, 160, 140, '255,190,110', 0.16);
      g.restore();
    }
    g.restore();
    setLS('mine');
    // the openings: shadowed wall thickness inside the rim + outline
    OPENINGS.forEach(([a, b], i) => {
      if (b < xs - 30 || a > xe + 30) return;
      g.save(); g.beginPath(); blobPath(g, OPEN_PTS[i]); g.clip();
      vgrad(g, a - 10, 100, b - a + 20, 170, [[0, 'rgba(12,7,7,0.85)'], [1, 'rgba(12,7,7,0)']]);
      g.beginPath(); blobPath(g, OPEN_PTS[i]); g.lineWidth = 9; g.strokeStyle = 'rgba(14,8,8,0.45)'; g.stroke();
      g.restore();
      g.save(); g.beginPath(); g.rect(a - 20, 300, b - a + 40, 40); g.clip();
      g.beginPath(); blobPath(g, OPEN_PTS[i]); g.lineWidth = 3; g.strokeStyle = 'rgba(150,120,104,0.55)'; g.stroke();
      g.restore();
      g.beginPath(); blobPath(g, OPEN_PTS[i]); g.lineWidth = 1.8 * LK; g.strokeStyle = LINE; g.stroke();
    });
    // the exterior cliff: outline, snowy ledges, a couple of pines
    if (xs < PORTAL) {
      setLS('ext');
      g.beginPath(); for (const [x, y] of CLIFF) g.lineTo(x, y); g.lineWidth = 2.4 * LK; g.strokeStyle = LINE; g.stroke();
      const seg = (i) => (x) => lerp(CLIFF[i][1], CLIFF[i + 1][1], (x - CLIFF[i][0]) / (CLIFF[i + 1][0] - CLIFF[i][0]));
      for (const i of [1, 3, 5, 7, 9]) snowCap(g, CLIFF[i][0] - 2, CLIFF[i + 1][0] + 2, seg(i), 7, 300 + i, SNOW_D, 1.3, 2);
      midTree(g, 1250, 252, 26, 16, '#2a2238', '#c6bcd8'); midTree(g, 1338, 172, 20, 13, '#2a2238', '#c6bcd8');
      // the King's iron grille door, swung open against the cliff
      ink(g, (g) => poly(g, [1506, 344, 1506, 206, 1584, 206, 1584, 344]), null, 2.2);
      g.save(); g.beginPath(); g.rect(1506, 206, 78, 138); g.clip();
      for (let x = 1512; x < 1584; x += 11) { g.fillStyle = INK; g.fillRect(x - 2.6, 200, 5.2, 150); g.fillStyle = KING.iron; g.fillRect(x - 1.8, 200, 3.6, 150); g.fillStyle = KING.ironHi; g.fillRect(x - 1.8, 200, 1, 150); }
      for (const y of [214, 270, 330]) { g.fillStyle = INK; g.fillRect(1500, y - 3.5, 90, 7); g.fillStyle = KING.iron; g.fillRect(1500, y - 2.5, 90, 5); }
      g.restore();
      for (let x = 1512; x < 1584; x += 11) ink(g, (g) => poly(g, [x - 3, 207, x, 196, x + 3, 207]), KING.iron, 1.4);
      // crest plaque over the door (its gem is drawn live)
      ink(g, (g) => { g.beginPath(); g.moveTo(1514, 128); g.lineTo(1576, 128); g.lineTo(1576, 160); g.quadraticCurveTo(1545, 192, 1514, 160); g.closePath(); }, KING.iron, 2.4, (g) => {
        g.fillStyle = KING.ironHi; g.fillRect(1514, 128, 62, 4);
        kingEmblem(g, 1545, 160, 34, '#4a4652', KING.iron);
      });
      // the mine mouth's outer post and lintel (seen end-on)
      ink(g, (g) => poly(g, [1584, 348, 1586, 40, 1622, 40, 1624, 348]), TIMB_D.base, 2.8, (g) => {
        g.fillStyle = TIMB_D.sh; g.fillRect(1608, 30, 20, 330);
        g.fillStyle = rgba(TIMB_D.hi, 0.7); g.fillRect(1584, 30, 4, 330);
        g.fillStyle = IRON.base; for (const y of [100, 250]) g.fillRect(1584, y, 40, 6);
      });
      ink(g, (g) => poly(g, [1574, 54, 1574, 6, 1634, 6, 1634, 54]), TIMB_D.base, 2.8, (g) => {
        g.strokeStyle = TIMB_D.grain; g.lineWidth = 1.1;
        for (const r of [7, 14, 21]) { g.beginPath(); g.ellipse(1604, 30, r, r * 0.8, 0, 0, TAU); g.stroke(); }
      });
      snowCap(g, 1574, 1634, () => 6, 7, 377, SNOW_D, 1.4, 2);
    }
    // the tunnel: cap beam and shoring
    if (xe > PORTAL) {
      setLS('mine');
      timberBeam(g, Math.max(xs, PORTAL + 20), CAP_Y, Math.min(xe, ARCH + 40), CAP_Y + 16, TIMB);
      for (const x of POSTS) if (x > xs - 70 && x < xe + 70) shoringPost(g, x, CAP_Y + 16, 346, TIMB);
      // chains with shackles on the wall (where the workers are locked in at night)
      for (const x of [2120, 3236]) {
        if (x < xs - 40 || x > xe + 40) continue;
        g.strokeStyle = '#1a1416'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 16, 196); g.quadraticCurveTo(x, 236, x + 16, 196); g.stroke();
        g.strokeStyle = '#5a5660'; g.lineWidth = 1.4; g.stroke();
        for (const s of [-1, 1]) { ink(g, (g) => { g.beginPath(); g.ellipse(x + s * 18, 202, 5, 7, 0, 0, TAU); }, null, 1.6); g.fillStyle = '#2a2628'; g.beginPath(); g.arc(x + s * 18, 194, 3, 0, TAU); g.fill(); }
      }
    }
  }

  // ------------------------------------------------------------------ near wall F: the forge
  function drawWallF(g, xa, xb) {
    const xs = xa - 4, xe = xb + 4;
    const top = 238, wa = FGATE + 52;
    // masonry wall
    if (xe > wa) {
      const x0 = Math.max(xs, wa), x1 = xe;
      g.fillStyle = '#2a2020'; g.fillRect(x0, top, x1 - x0, 372 - top);
      for (let r = 0, y = top + 12; y < 372; r++, y += 22) {
        const off = (r % 2) * 26;
        for (let x = al(x0 - off, 52) + off - 52; x < x1 + 52; x += 52) {
          const h = hash2(x | 0, r + 9);
          g.fillStyle = mix('#3e3434', h < 0.5 ? '#2e2626' : '#4c4040', Math.abs(h - 0.5) * 1.2);
          g.fillRect(x + 1.5, y + 1.5, 49, 19);
          g.fillStyle = 'rgba(120,96,90,0.35)'; g.fillRect(x + 2, y + 2, 47, 1.6);
        }
      }
      vgrad(g, x0, top, x1 - x0, 372, [[0, 'rgba(10,6,6,0.5)'], [0.4, 'rgba(10,6,6,0)'], [1, 'rgba(255,120,50,0.14)']]);
      // soot above the hearth, warm light around spouts and furnace
      lightPool(g, HEARTH, 300, 120, 90, '255,150,70', 0.22);
      for (const x of SPOUTS) lightPool(g, x, 320, 90, 90, '255,140,50', 0.35);
      lightPool(g, FURN, 330, 300, 120, '255,140,60', 0.22);
      if (L2FIX) {      // (readability, painted hero review: the dark wall at the screen's edges swallowed the fighters'
        //  outlines) -- a warm band rising off the floor line, and broad pools at the spouts, whose lava falls past it
        vgrad(g, x0, 255, x1 - x0, 372, [[0, 'rgba(255,140,70,0)'], [0.6, 'rgba(255,140,70,0.14)'], [1, 'rgba(255,140,70,0.2)']]);   // (from y 255: up to a hero's hair, critic)
        for (const x of SPOUTS) lightPool(g, x, 318, 240, 90, '255,150,70', 0.3);
      }
      // cornice with the molten channel on top
      ink(g, (g) => poly(g, [x0 - 6, top + 12, x0 - 6, top - 6, x1 + 6, top - 6, x1 + 6, top + 12]), '#4a3e3c', 2.2, (g) => {
        g.fillStyle = '#5e504c'; g.fillRect(x0 - 6, top - 6, x1 - x0 + 12, 4);
        g.fillStyle = '#2e2424'; g.fillRect(x0 - 6, top + 6, x1 - x0 + 12, 8);
      });
      g.fillStyle = LAVA.deep; g.fillRect(x0 - 6, top - 14, x1 - x0 + 12, 8);
      g.fillStyle = LAVA.hot; g.fillRect(x0 - 6, top - 13, x1 - x0 + 12, 3);
      ink(g, (g) => poly(g, [x0 - 6, top - 6, x0 - 6, top - 16, x1 + 6, top - 16, x1 + 6, top - 6]), null, 1.8);
      lightPool(g, (x0 + x1) / 2, top - 20, (x1 - x0) / 1.6, 26, '255,140,50', 0.22);
      // chutes down to the spout heads
      for (const x of SPOUTS) {
        if (x < x0 - 30 || x > x1 + 30) continue;
        ink(g, (g) => poly(g, [x - 13, top - 8, x - 11, 278, x + 11, 278, x + 13, top - 8]), '#3a302e', 2.2, (g) => {
          g.fillStyle = LAVA.mid; g.fillRect(x - 6, top - 8, 12, 50); g.fillStyle = LAVA.core; g.fillRect(x - 2, top - 8, 3, 50);
        });
      }
    }
    // pillars
    for (const x of FPILLARS) {
      if (x < xs - 50 || x > xe + 50) continue;
      ink(g, (g) => poly(g, [x - 28, 372, x - 26, -10, x + 26, -10, x + 28, 372]), '#3a3030', 2.6, (g) => {
        for (let y = 0; y < 372; y += 30) { g.fillStyle = 'rgba(14,8,8,0.6)'; g.fillRect(x - 30, y, 60, 2); }
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 6, -10, 24, 382);
        g.fillStyle = 'rgba(255,140,70,0.22)'; g.fillRect(x - 28, 200, 5, 172);
        g.fillStyle = IRON.base; for (const y of [60, 196]) { g.fillRect(x - 28, y, 56, 8); g.fillStyle = IRON.hi; g.fillRect(x - 28, y, 56, 1.4); g.fillStyle = IRON.base; }
      });
      ink(g, (g) => poly(g, [x - 36, 236, x - 36, 222, x + 36, 222, x + 36, 236]), '#4a3e3c', 2.2);
    }
    // the gateway from the cavern: massive jamb, the King's iron door swung open on the cavern side
    if (xs < FGATE + 80) {
      const x = FGATE;
      ink(g, (g) => poly(g, [x - 150, 360, x - 150, 120, x - 62, 104, x - 62, 360]), KING.iron, 2.6, (g) => {
        g.fillStyle = KING.ironHi; g.fillRect(x - 150, 100, 6, 270);
        g.fillStyle = '#141216';
        for (let y = 140; y < 360; y += 44) g.fillRect(x - 150, y, 88, 5);
        g.fillStyle = '#4a4652'; for (let y = 130; y < 360; y += 22) for (const xx of [x - 140, x - 74]) { g.beginPath(); g.arc(xx, y, 2, 0, TAU); g.fill(); }
        kingEmblem(g, x - 106, 214, 50, '#3c3844', KING.iron);
      });
      ink(g, (g) => poly(g, [x - 62, 380, x - 62, -10, x + 54, -10, x + 54, 380]), '#3a3134', 3, (g) => {
        for (let y = -10, r = 0; y < 380; y += 34, r++) {
          g.fillStyle = 'rgba(12,8,8,0.7)'; g.fillRect(x - 62, y, 116, 2.4);
          g.fillRect(x - 62 + (r % 2 ? 40 : 70), y, 2.4, 34);
        }
        g.fillStyle = 'rgba(255,140,70,0.25)'; g.fillRect(x - 62, -10, 6, 390);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 20, -10, 40, 390);
        g.fillStyle = IRON.base; for (const y of [80, 200, 310]) { g.fillRect(x - 62, y, 116, 9); g.fillStyle = IRON.hi; g.fillRect(x - 62, y, 116, 1.4); g.fillStyle = IRON.base; }
      });
    }
  }

  // ------------------------------------------------------------------ the floor
  function drawGround(g, xa, xb) {
    if (xb > PORTAL - 300 && xa < ARCH + 200) groundTunnel(g, Math.max(xa, PORTAL - 300), Math.min(xb, ARCH + 200));
    if (xa < PORTAL + 240) groundEntrance(g, xa, Math.min(xb, PORTAL + 240));
    if (xa < PORTAL + 160 && xb > PORTAL - 160) mouthSeam(g);
    if (xb > ARCH - 140 && xa < FGATE + 200) groundLava(g, Math.max(xa, ARCH - 140), Math.min(xb, FGATE + 200));
    if (xb > FGATE - 120) groundForge(g, Math.max(xa, FGATE - 120), xb);
    // rails along the back, from the mountainside into the tunnels, ending at a timber buffer stop
    if (xa < ARCH - 40) {
      setLS(xa < PORTAL ? 'ext' : 'mine');
      g.save(); g.beginPath(); g.rect(xa - 4, GT0, Math.min(xb, ARCH - 60) - xa + 8, H - GT0); g.clip();
      drawTrack(g, xa, Math.min(xb, ARCH - 60), xa < PORTAL ? TIMB_D : TIMB);
      g.restore();
      if (xb > ARCH - 120) {
        setLS('mine');
        const x = ARCH - 72;
        ink(g, (g) => poly(g, [x - 8, 362, x - 6, 322, x + 14, 322, x + 16, 362]), TIMB.base, 2.4, (g) => { g.fillStyle = TIMB.sh; g.fillRect(x + 6, 318, 12, 48); });
        ink(g, (g) => poly(g, [x - 14, 336, x - 14, 326, x + 2, 326, x + 2, 336]), '#7a3020', 2);
      }
    }
  }
  function floorBase(g, x0, x1, top, bot, stops) { vgrad(g, x0 - 2, top, x1 - x0 + 4, bot, stops); }
  const mouthEdge = (y) => PORTAL - 10 + 0.34 * (y - 362) + 20 * Math.sin(y * 0.045 + 1) + 9 * Math.sin(y * 0.13);
  function mouthSeam(g) {
    // snow blown into the mine mouth, straddling the boundary between the outside path and the tunnel floor
    for (const [yc, w] of [[372, 34], [400, 26], [436, 42], [478, 30], [516, 46]]) {
      const cx = mouthEdge(yc) + hash1(yc) * 30 - 10, rh = 3 + (yc - 362) * 0.035;
      const pts = [];
      for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU, r = 0.7 + 0.45 * hash1(yc * 7 + k); pts.push(cx + Math.cos(a) * w * r, yc + Math.sin(a) * rh * r); }
      g.save(); g.translate(1.5, 1.5); blob(g, pts); g.fillStyle = rgba(SNOW_D.snowSh, 0.45); g.fill(); g.restore();
      blob(g, pts); g.fillStyle = rgba(SNOW_D.snow, 0.8); g.fill();
    }
  }
  function groundEntrance(g, xa, xb) {
    setLS('ext');
    const x0 = Math.floor(xa) - 2, x1 = Math.ceil(xb) + 2;
    g.save(); g.beginPath(); g.moveTo(x0 - 4, GT0);
    for (let y = GT0; y <= H + 6; y += 6) g.lineTo(Math.min(x1 + 4, mouthEdge(y)), y);
    g.lineTo(x0 - 4, H + 6); g.closePath(); g.clip();
    floorBase(g, x0, x1, 344, H, [[0, '#62566a'], [0.4, '#5a4e60'], [1, '#4a4052']]);
    // gravel and mottling
    for (let x = al(x0, 23) - 23; x < x1 + 23; x += 23) {
      const h = hash1(x * 3 + 5);
      g.fillStyle = h < 0.5 ? 'rgba(40,30,48,0.16)' : 'rgba(150,138,166,0.12)';
      g.beginPath(); g.ellipse(x + h * 10, 380 + hash1(x * 7) * 140, 18 + h * 26, 4 + h * 3, 0, 0, TAU); g.fill();
    }
    for (let x = al(x0, 5); x < x1; x += 5) { const h = hash1(x * 11); if (h < 0.55) continue; g.fillStyle = h < 0.8 ? 'rgba(36,28,42,0.45)' : 'rgba(186,176,200,0.4)'; g.fillRect(x, 366 + hash1(x + 9) * 170, 2, 1.4); }
    // cart ruts
    for (const yc of [430, 472]) { g.beginPath(); for (let x = al(x0, 10) - 10; x <= x1 + 10; x += 10) g.lineTo(x, yc + 2 * Math.sin(x * 0.013 + yc)); g.strokeStyle = 'rgba(40,30,48,0.22)'; g.lineWidth = 5; g.stroke(); }
    // lantern and brazier light on the path
    for (const x of ENT_LANTERNS) if (x > x0 - 200 && x < x1 + 200) lightPool(g, x + 20, 400, 150, 50, '255,180,110', 0.2);
    if (x1 > PORTAL - 400) lightPool(g, PORTAL + 30, 430, 300, 110, '255,170,100', 0.14);   // lamplight spilling out of the mine
    // snow patches (thinning into the mine mouth)
    for (let gx = al(x0, 90) - 180; gx < x1 + 180; gx += 90) {
      const h = hash1(gx * 5 + 1); if (h < 0.42 || gx > PORTAL + 120) continue;
      const fade = gx > PORTAL - 160 ? clamp((PORTAL + 120 - gx) / 280, 0, 1) : 1;
      const cx = gx + h * 50, cy = h < 0.7 ? 372 + h * 20 : 500 + h * 20, rw = (20 + h * 34) * fade, rh = 3 + (cy - 362) * 0.03;
      if (rw < 4) continue;
      const pts = [];
      for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU, r = 0.7 + 0.45 * hash1(gx + k * 13); pts.push(cx + Math.cos(a) * rw * r, cy + Math.sin(a) * rh * r); }
      g.save(); g.translate(1.5, 1.5); blob(g, pts); g.fillStyle = rgba(SNOW_D.snowSh, 0.5); g.fill(); g.restore();
      blob(g, pts); g.fillStyle = rgba(SNOW_D.snow, 0.85); g.fill();
    }
    // front drift
    const fTop = (x) => 524 + 5 * Math.sin(x * 0.013 + 2) + 3 * Math.sin(x * 0.037);
    g.beginPath(); g.moveTo(al(x0, 6) - 6, H + 4);
    for (let x = al(x0, 6) - 6; x <= Math.min(x1, PORTAL + 60) + 6; x += 6) g.lineTo(x, fTop(x) + Math.max(0, (x - PORTAL + 140) * 0.12));
    g.lineTo(Math.min(x1, PORTAL + 60) + 6, H + 4); g.closePath();
    vgrad(g, x0, 512, x1 - x0, H, [[0, SNOW_D.snow], [1, SNOW_D.snowSh]]);
    g.fill();
    g.restore();
  }
  function groundTunnel(g, xa, xb) {
    setLS('mine');
    const x0 = Math.max(Math.floor(xa) - 2, PORTAL - 300), x1 = Math.min(Math.ceil(xb) + 2, ARCH + 200);
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    floorBase(g, x0, x1, 344, H, [[0, '#5e4c44'], [0.45, '#54443d'], [1, '#433631']]);
    // packed earth mottling, stones and ore glints
    for (let x = al(x0, 29) - 29; x < x1 + 29; x += 29) {
      const h = hash1(x * 3 + 7);
      g.fillStyle = h < 0.5 ? 'rgba(30,20,16,0.16)' : 'rgba(150,120,100,0.1)';
      g.beginPath(); g.ellipse(x + h * 12, 376 + hash1(x * 5) * 150, 20 + h * 30, 4 + h * 4, 0, 0, TAU); g.fill();
    }
    for (let x = al(x0, 5); x < x1; x += 5) { const h = hash1(x * 13 + 2); if (h < 0.5) continue; g.fillStyle = h < 0.82 ? 'rgba(26,18,14,0.45)' : 'rgba(170,140,120,0.35)'; g.fillRect(x, 366 + hash1(x + 5) * 170, 2, 1.4); }
    for (let x = al(x0, 41); x < x1; x += 41) { const h = hash1(x * 17 + 3); if (h < 0.72) continue; g.fillStyle = h > 0.9 ? '#7ae0ea' : '#ffae55'; g.fillRect(x, 380 + hash1(x + 1) * 130, 1.6, 1.6); }
    for (let x = al(x0, 61); x < x1; x += 61) {
      const h = hash1(x * 7 + 11); if (h < 0.6) continue;
      const y = h < 0.8 ? 372 + h * 14 : 500 + h * 12, w = 7 + h * 9;
      ink(g, (g) => { g.beginPath(); g.ellipse(x, y, w / 2, w / 3.4, 0, 0, TAU); }, '#6a5a52', 1.3, (g) => { g.fillStyle = '#4a3c36'; g.beginPath(); g.ellipse(x + w * 0.15, y + w * 0.1, w * 0.4, w * 0.2, 0, 0, TAU); g.fill(); });
    }
    // drag marks of the ore carts and claw prints of the chained workers
    for (const yc of [420, 468]) { g.beginPath(); for (let x = al(x0, 10) - 10; x <= x1 + 10; x += 10) g.lineTo(x, yc + 2 * Math.sin(x * 0.011 + yc)); g.strokeStyle = 'rgba(28,20,16,0.2)'; g.lineWidth = 5; g.stroke(); }
    for (let x = al(x0, 52); x < x1; x += 52) {
      const i = (x / 52) | 0, y = 446 + (i % 2 ? 8 : -8);
      g.strokeStyle = 'rgba(28,20,16,0.28)'; g.lineWidth = 1.6;
      for (let k = -1; k <= 1; k++) { polyline(g, [x + k * 4, y, x + k * 5 + 6, y - 2]); g.stroke(); }
    }
    // light from lanterns and crystals on the floor
    for (const x of TUN_LANTERNS) if (x > x0 - 200 && x < x1 + 200) lightPool(g, x, 392, 170, 46, '255,180,100', 0.2);
    for (const [x, , k, s] of NEAR_CRY) if (x > x0 - 200 && x < x1 + 200) lightPool(g, x, 376, 130 * s, 36, CRY[k].glow, 0.16);
    // outside light spilling in through the mine mouth: cool tint fading out
    if (x0 < PORTAL + 260) {
      const gr = g.createLinearGradient(PORTAL - 40, 0, PORTAL + 260, 0);
      gr.addColorStop(0, 'rgba(98,86,106,0.75)'); gr.addColorStop(0.35, 'rgba(98,86,106,0.35)'); gr.addColorStop(1, 'rgba(98,86,106,0)');
      g.fillStyle = gr; g.fillRect(PORTAL - 40, 340, 300, H - 340);
      g.fillStyle = 'rgba(98,86,106,0.75)'; g.fillRect(PORTAL - 300, 340, 260, H - 340);
    }
    vgrad(g, x0, 500, x1 - x0, H, [[0, 'rgba(14,8,6,0)'], [1, 'rgba(14,8,6,0.4)']]);
    g.restore();
  }
  function groundLava(g, xa, xb) {
    setLS('lava');
    const x0 = Math.max(Math.floor(xa) - 2, ARCH - 140), x1 = Math.min(Math.ceil(xb) + 2, FGATE + 200);
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    const rows = flagRows(362, 530, [14, 17, 21, 25, 30, 36, 25]);
    const ext = drawPaving(g, x0, x1, rows, BAS, 51, { w: 132, gap: 2, vary: 0.45, jointMix: 0.3, loose: 0.4, min: ARCH - 138,
      lo: (r, ya, yb) => seamEdge(ARCH + 16, r, ya, yb, 951) });
    g.save(); clipExt(g, ext, x0, x1);
    // iron grating spans over the lava
    for (const [ga, gb] of GRATES) {
      if (gb < x0 - 4 || ga > x1 + 4) continue;
      vgrad(g, ga, 362, gb - ga, 530, [[0, '#4a1c0e'], [0.5, '#6e2a12'], [1, '#4a1c0e']]);
      for (let x = ga + 6; x < gb - 4; x += 9) { g.fillStyle = '#2c282e'; g.fillRect(x, 362, 6.4, 168); g.fillStyle = '#4e4a54'; g.fillRect(x, 362, 1.4, 168); }
      for (const [ya] of rows) { g.fillStyle = '#1c1a20'; g.fillRect(ga, ya - 2, gb - ga, 5); g.fillStyle = '#56525c'; g.fillRect(ga, ya - 2, gb - ga, 1.2); }
      ink(g, (g) => poly(g, [ga, 362, ga + 7, 362, ga + 7, 530, ga, 530]), '#2e2a32', 2);
      ink(g, (g) => poly(g, [gb - 7, 362, gb, 362, gb, 530, gb - 7, 530]), '#2e2a32', 2);
      g.fillStyle = '#6a6672'; for (let y = 372; y < 530; y += 26) for (const x of [ga + 3.5, gb - 3.5]) { g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); }
    }
    // heat light from the river behind and the lava below
    vgrad(g, x0, 362, x1 - x0, 420, [[0, 'rgba(255,120,50,0.2)'], [1, 'rgba(255,120,50,0)']]);
    vgrad(g, x0, 470, x1 - x0, 530, [[0, 'rgba(255,100,40,0)'], [1, 'rgba(255,100,40,0.16)']]);
    g.restore();
    // the walkway's front lip and the lava glowing below it
    const lx0 = Math.max(x0, ARCH + 30);
    if (x1 > lx0) {
      vgrad(g, lx0, 530, x1 - lx0, H, [[0, '#2a2022'], [1, '#c8481a']]);
      g.fillStyle = 'rgba(255,200,120,0.4)'; g.fillRect(lx0, 530, x1 - lx0, 1.4);
    }
    // the curb along the back + iron railing with chain swags
    const cx0 = Math.max(x0, ARCH + 40), cx1 = Math.min(x1, FGATE - 50);
    if (cx1 > cx0) {
      ink(g, (g) => poly(g, [cx0 - 6, 366, cx0 - 6, 348, cx1 + 6, 348, cx1 + 6, 366]), '#3e3538', 2.4, (g) => {
        g.fillStyle = 'rgba(255,150,70,0.6)'; g.fillRect(cx0 - 6, 348, cx1 - cx0 + 12, 2);
        g.strokeStyle = 'rgba(12,8,8,0.7)'; g.lineWidth = 1.2;
        for (let x = al(cx0, 58); x < cx1; x += 58) { polyline(g, [x, 348, x, 366]); g.stroke(); }
      });
      vgrad(g, cx0, 366, cx1 - cx0, 380, [[0, 'rgba(10,4,4,0.4)'], [1, 'rgba(10,4,4,0)']]);
      const posts = [];
      for (let x = al(cx0, 150) + 75; x < cx1 + 150; x += 150) posts.push(x);
      for (let i = 0; i < posts.length - 1; i++) {
        const a = posts[i], b = posts[i + 1];
        for (const [lw, col] of [[4.6, '#120c0c'], [2.2, '#5a5458']]) { g.beginPath(); g.moveTo(a, 318); g.quadraticCurveTo((a + b) / 2, 346, b, 318); g.lineWidth = lw; g.strokeStyle = col; g.setLineDash([5, 2]); g.stroke(); g.setLineDash([]); }
      }
      for (const x of posts) {
        if (x < x0 - 10 || x > x1 + 10) continue;
        ink(g, (g) => poly(g, [x - 3.5, 350, x - 3, 314, x + 3, 314, x + 3.5, 350]), '#3a3640', 2, (g) => { g.fillStyle = 'rgba(255,150,70,0.5)'; g.fillRect(x - 3.5, 314, 1.4, 36); });
        ink(g, (g) => { g.beginPath(); g.arc(x, 311, 4.6, 0, TAU); }, '#3a3640', 1.8);
      }
    }
    g.restore();
  }
  function groundForge(g, xa, xb) {
    setLS('forge');
    const x0 = Math.max(Math.floor(xa) - 2, FGATE - 120), x1 = Math.ceil(xb) + 2;
    if (x1 <= x0) return;
    g.save(); g.beginPath(); g.rect(x0, GT0, x1 - x0, H - GT0); g.clip();
    const rows = flagRows(362, H, [14, 17, 21, 25, 30, 36, 35]);
    const ext = drawPaving(g, x0, x1, rows, FLAGS, 61, { w: 140, gap: 2, vary: 0.35, jointMix: 0.35, loose: 0.3, min: FGATE - 118,
      lo: (r, ya, yb) => seamEdge(FGATE + 8, r, ya, yb, 961) });
    g.save(); clipExt(g, ext, x0, x1);
    // furnace light and soot near the wall
    lightPool(g, FURN, 372, 460, 80, '255,150,70', 0.16);
    lightPool(g, HEARTH, 372, 180, 40, '255,150,70', 0.14);
    vgrad(g, x0, 362, x1 - x0, H, [[0, 'rgba(255,130,60,0.06)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(8,4,4,0.3)']]);
    // feeder troughs: spout -> back pools; a covered channel: furnace -> front pool (each ends in a drain basin)
    for (const [px, py] of LAVA_POOLS) {
      if (px < x0 - 60 || px > x1 + 60) continue;
      const yEnd = 362 + py, front = py > 80;
      lightPool(g, px, 362 + py * 0.5, 50, 40, '255,140,60', 0.2);
      if (!front) {
        ink(g, (g) => poly(g, [px - 17, 356, px + 17, 356, px + 17, yEnd, px - 17, yEnd]), '#6e6260', 2, (g) => {
          vgrad(g, px - 11, 356, 22, yEnd, [[0, LAVA.hot], [0.5, LAVA.mid], [1, LAVA.hot]]);
          g.fillStyle = 'rgba(255,240,180,0.7)'; g.fillRect(px - 2, 356, 3, yEnd - 356);
          g.fillStyle = '#4a3e3c'; g.fillRect(px - 17, 356, 6, yEnd - 356); g.fillRect(px + 11, 356, 6, yEnd - 356);
        });
      } else {
        ink(g, (g) => poly(g, [px - 13, 360, px + 13, 360, px + 13, yEnd, px - 13, yEnd]), '#3a3438', 2, (g) => {
          g.fillStyle = '#8a3010'; g.fillRect(px - 13, 360, 26, yEnd - 360);
          for (let y = 364; y < yEnd; y += 7) { g.fillStyle = '#26222a'; g.fillRect(px - 13, y, 26, 4.4); g.fillStyle = '#56525c'; g.fillRect(px - 13, y, 26, 1); }
        });
      }
      ink(g, (g) => { g.beginPath(); g.ellipse(px, yEnd, 24, 9, 0, 0, TAU); }, '#3a3438', 2, (g) => {
        g.fillStyle = LAVA.deep; g.beginPath(); g.ellipse(px, yEnd + 1, 18, 6, 0, 0, TAU); g.fill();
        g.fillStyle = '#26222a'; for (let k = -2; k <= 2; k++) g.fillRect(px + k * 7 - 1.5, yEnd - 7, 3, 14);
      });
    }
    g.restore();
    // the wall's plinth course: the back boundary (open where the furnace and the troughs meet the floor)
    const gaps = [[FURN - 200, FURN + 200], [SPOUTS[0] - 22, SPOUTS[0] + 22], [SPOUTS[1] - 22, SPOUTS[1] + 22]];
    const pa = Math.max(x0, FGATE + 54);
    if (x1 > pa) {
      let segs = [[pa, x1]];
      for (const [a, b] of gaps) segs = segs.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, a], [b, e]].filter(([u, v]) => v - u > 2)));
      for (const [s, e] of segs) {
        ink(g, (g) => poly(g, [s, 364, s, 346, e, 346, e, 364]), '#4a3e3c', 2.2, (g) => {
          g.fillStyle = '#5e504c'; g.fillRect(s, 346, e - s, 2.4);
          g.strokeStyle = 'rgba(14,8,8,0.7)'; g.lineWidth = 1.2;
          for (let x = al(s, 64); x < e; x += 64) { polyline(g, [x, 346, x, 364]); g.stroke(); }
        });
      }
      vgrad(g, pa, 364, x1 - pa, 380, [[0, 'rgba(8,4,4,0.4)'], [1, 'rgba(8,4,4,0)']]);
    }
    g.restore();
  }

  // ------------------------------------------------------------------ near sprites
  function buildNear(cs) {
    const back = [], front = [], liveBack = [], liveFront = [];
    const place = (arr, spr, x, y) => arr.push({ spr, x, y });

    // ===== ENTRANCE =====
    setLS('ext');
    const lanternPost = makeSprite(70, 170, 20, 162, cs, (g) => {
      ink(g, (g) => poly(g, [-5, 4, -4, -150, 4, -150, 5, 4]), TIMB_D.base, 2.4, (g) => { g.fillStyle = TIMB_D.sh; g.fillRect(1, -160, 6, 170); });
      ink(g, (g) => poly(g, [-3, -150, 32, -150, 32, -143, -3, -143]), TIMB_D.base, 2);
      strokeLine(g, [3, -112, 24, -146], 3.4, LINE); strokeLine(g, [3, -112, 24, -146], 2, TIMB_D.base);
      drawLantern(g, 26, -143, 1);
      snowCap(g, -4, 32, () => -150, 4, 31, SNOW_D, 1.1, 1);
    });
    for (const x of ENT_LANTERNS) {
      if (x > 1150) continue;
      place(back, lanternPost, x, 334);
      liveBack.push({ x0: x - 40, x1: x + 80, draw: (ctx, camX, t) => glowAt(ctx, C.glowWarm, x + 26 - camX, 334 - 124, 90, 0.75 + 0.1 * Math.sin(t * 7 + x) + 0.06 * Math.sin(t * 17 + x)) });
    }
    place(back, makeSprite(240, 360, 130, 344, cs, drawHeadframe), 1010, 334);
    liveBack.push({ x0: 760, x1: 1060, draw: (ctx, camX, t) => drawWinchRopes(ctx, camX, t) });
    place(back, makeSprite(110, 110, 55, 100, cs, drawWinchFrame), 830, 334);
    liveBack.push({ x0: 800, x1: 860, draw: (ctx, camX, t) => spin(ctx, C.drum, 830 - camX, 334 - 50, -t * 0.9) });
    liveBack.push({ x0: 960, x1: 1060, draw: (ctx, camX, t) => spin(ctx, C.wheel, 1010 - camX, 334 - 306, t * 0.9) });
    place(back, makeSprite(90, 90, 45, 84, cs, drawToolRack), 712, 334);
    const pole = makeSprite(30, 300, 15, 292, cs, (g) => {
      ink(g, (g) => poly(g, [-3.5, 2, -3, -270, 3, -270, 3.5, 2]), '#3a2f2c', 2);
      ink(g, (g) => poly(g, [-6, -268, 0, -284, 6, -268]), '#8a9096', 1.8);
    });
    for (const x of [300, 1360]) {
      place(back, pole, x, 336);
      liveBack.push({ x0: x - 20, x1: x + 110, draw: (ctx, camX, t) => drawFlag(ctx, C.flag, snap(x - camX + 3), 70, t, x * 0.013, 5) });
    }
    place(back, makeSprite(150, 110, 75, 100, cs, drawOreHeap), 1190, 338);
    place(back, makeSprite(80, 110, 40, 100, cs, drawSign), 1290, 336);
    const bigCart = makeSprite(130, 90, 65, 80, cs, (g) => drawBigCart(g, TIMB_D));
    place(front, bigCart, 470, 352); place(front, bigCart, 1268, 352);
    const brazier = makeSprite(80, 110, 40, 100, cs, drawKingBrazier);
    place(front, brazier, 1440, 364);
    liveFront.push({ x0: 1380, x1: 1500, draw: (ctx, camX, t) => {
      const k = kingCol(), x = 1440 - camX;
      for (const [spr, a] of k.glows) glowAt(ctx, spr, x, 364 - 80, 70, a * (0.8 + 0.12 * Math.sin(t * 9) + 0.08 * Math.sin(t * 23)));
      for (const [spr, a] of k.glows) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * a; ctx.drawImage(spr.c, x - 110, 352, 220, 48); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      drawFlame(ctx, x, 364 - 76, 30, t, 1.3, k.fire);
    } });
    liveBack.push({ x0: 1520, x1: 1570, draw: (ctx, camX) => gemAt(ctx, 1545 - camX, 177, 1.3, 0.8) });

    // ===== TUNNELS =====
    setLS('mine');
    for (const [x, y, k, s] of NEAR_CRY) {
      place(back, makeSprite(100 * s + 30, 90 * s + 30, 50 * s + 15, 74 * s + 16, cs, (g) => drawCrystals(g, k, s, (x * 7) | 0)), x, y);
      liveBack.push({ x0: x - 90, x1: x + 90, draw: (ctx, camX, t) => glowAt(ctx, k === 'o' ? C.glowWarm : C.glowCyan, x - camX, y - 30 * s, 80 * s, 0.55 + 0.25 * Math.sin(t * 1.3 + x)) });
    }
    const hangLantern = makeSprite(30, 110, 15, 4, cs, (g) => { strokeLine(g, [0, 0, 0, 62], 1.6, '#2a2020'); drawLantern(g, 0, 60, 1.05); });
    for (const x of TUN_LANTERNS) {
      place(back, hangLantern, x, CAP_Y + 16);
      liveBack.push({ x0: x - 90, x1: x + 90, draw: (ctx, camX, t) => glowAt(ctx, C.glowWarm, x - camX, CAP_Y + 16 + 80, 100, 0.8 + 0.1 * Math.sin(t * 6 + x) + 0.06 * Math.sin(t * 15 + x)) });
    }
    place(front, makeSprite(130, 90, 65, 80, cs, (g) => drawBigCart(g, TIMB)), 3010, 352);
    place(front, makeSprite(60, 50, 30, 44, cs, drawBuckets), 1622 + 88, 366);
    place(front, makeSprite(120, 60, 60, 52, cs, drawPlanks), 2250, 366);
    // the gallery's crystals glow, and the chained workers (drawn live, masked by the near wall)
    // (handled in drawBack)

    // ===== LAVA CAVERN =====
    setLS('lava');
    place(back, makeSprite(200, 420, 90, 400, cs, drawArch), ARCH, 362);
    for (const [x, s] of [[3600, 1], [3880, 0.8], [4300, 1.1], [4560, 0.7], [4930, 1], [5170, 0.85]]) place(back, makeSprite(160 * s, 130 * s, 80 * s, 6, cs, (g) => drawStalactites(g, s, (x * 3) | 0)), x, -4);
    place(back, makeSprite(260, 70, 30, 30, cs, drawCraneArm), 3880, 0);
    liveBack.push({ x0: 3880, x1: 4120, draw: (ctx, camX, t) => drawCrucibleLive(ctx, 4040 - camX, 38, t) });
    for (const [x, len] of [[3700, 150], [4600, 190], [5060, 130]]) liveBack.push({ x0: x - 30, x1: x + 30, draw: (ctx, camX, t) => hangChain(ctx, x - camX, -4, len, t, x) });

    // ===== FORGE =====
    setLS('forge');
    place(back, makeSprite(520, 500, 260, 486, cs, drawFurnace), FURN, 362);
    const spoutHead = makeSprite(100, 100, 50, 50, cs, (g) => dragonHeadRelief(g, 1, '#5a4e4c', '#3a302e', '#8a7a74'));
    for (const x of SPOUTS) {
      place(back, spoutHead, x, 296);
      liveBack.push({ x0: x - 60, x1: x + 60, draw: (ctx, camX, t) => lavaStream(ctx, x - camX, 316, 364, 12, t) });
    }
    place(back, makeSprite(120, 120, 60, 60, cs, drawCollarRack), 5560, 296);
    liveBack.push({ x0: 5500, x1: 5620, draw: (ctx, camX) => { for (const [dx, dy] of [[-36, 8], [0, 12], [36, 8]]) gemAt(ctx, 5560 + dx - camX, 296 + dy, 1, 0.7); } });
    for (const x of FPILLARS) if (x < 7000) liveBack.push({ x0: x - 40, x1: x + 40, draw: (ctx, camX, t) => drawHang(ctx, C.banner, snap(x - 35 - camX), 44, t, x, 3) });
    for (const [x, len] of [[5560, 120], [5990, 170], [6380, 110], [7080, 140]]) liveBack.push({ x0: x - 30, x1: x + 30, draw: (ctx, camX, t) => hangChain(ctx, x - camX, -4, len, t, x) });
    // the furnace: fire in its mouth, the collar mould and its crest gem
    liveBack.push({ x0: FURN - 260, x1: FURN + 260, draw: (ctx, camX, t) => drawFurnaceLive(ctx, FURN - camX, t) });
    // smithy on the floor's back edge: hearth with a hood, bellows, anvils, quench tub
    place(front, makeSprite(170, 300, 85, 290, cs, drawHearth), HEARTH, 364);
    liveFront.push({ x0: HEARTH - 160, x1: HEARTH + 90, draw: (ctx, camX, t) => drawHearthLive(ctx, HEARTH - camX, t) });
    const anvil = makeSprite(90, 60, 45, 52, cs, drawAnvil);
    place(front, anvil, 5640, 366); place(front, anvil, 6020, 366);
    place(front, makeSprite(70, 60, 35, 52, cs, drawQuench), 6110, 366);
    back.sort((a, b) => a.x - b.x); front.sort((a, b) => a.x - b.x);
    return { back, front, liveBack, liveFront };
  }

  // ------------------------------------------------------------------ individual near drawings
  function drawSheave(g, r) {
    ink(g, (g) => { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.arc(0, 0, r - 7, 0, TAU, true); }, IRON.base, 2.2, (g) => { g.fillStyle = IRON.hi; g.fillRect(-r, -r, r * 2, 3); });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; strokeLine(g, [Math.cos(a) * 5, Math.sin(a) * 5, Math.cos(a) * (r - 6), Math.sin(a) * (r - 6)], 4.4, LINE); strokeLine(g, [Math.cos(a) * 5, Math.sin(a) * 5, Math.cos(a) * (r - 6), Math.sin(a) * (r - 6)], 2.4, IRON.base); }
    ink(g, (g) => { g.beginPath(); g.arc(0, 0, 6, 0, TAU); }, IRON.hi, 1.8);
  }
  function drawDrum(g) {
    ink(g, (g) => { g.beginPath(); g.arc(0, 0, 20, 0, TAU); }, TIMB_D.base, 2.2, (g) => {
      g.strokeStyle = '#9a8a6a'; g.lineWidth = 1.6; for (let r = 8; r < 20; r += 3.4) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
      g.fillStyle = TIMB_D.sh; g.fillRect(0, -20, 4, 40);
    });
    ink(g, (g) => { g.beginPath(); g.arc(0, 0, 5, 0, TAU); }, IRON.hi, 1.6);
  }
  function spin(ctx, spr, x, y, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.drawImage(spr.c, -spr.ox, -spr.oy, spr.w, spr.h); ctx.restore();
  }
  function drawHeadframe(g) {
    const T = TIMB_D;
    // inclined back strut and the tower's legs
    ink(g, (g) => poly(g, [-122, 2, -112, 2, -10, -262, -20, -266]), T.base, 2.4, (g) => { g.fillStyle = T.sh; poly(g, [-116, 2, -112, 2, -10, -262, -14, -264]); g.fill(); });
    for (const [xa, xb] of [[-40, -26], [40, 26]]) ink(g, (g) => poly(g, [xa - 6, 2, xb - 5, -296, xb + 5, -296, xa + 6, 2]), T.base, 2.6, (g) => { g.fillStyle = T.sh; g.fillRect(Math.min(xa, xb) + 3, -300, 10, 306); });
    for (const y of [-76, -152, -228]) {
      const w = lerp(40, 26, -y / 296);
      timberBeam(g, -w - 4, y, w + 4, y + 9, T, 2);
      strokeLine(g, [-w + 4, y + 8, w - 4, y + 70], 4.6, LINE); strokeLine(g, [-w + 4, y + 8, w - 4, y + 70], 3, T.base);
      strokeLine(g, [w - 4, y + 8, -w + 4, y + 70], 4.6, LINE); strokeLine(g, [w - 4, y + 8, -w + 4, y + 70], 3, T.base);
    }
    timberBeam(g, -40, -300, 40, -290, T, 2.2);
    ink(g, (g) => poly(g, [-10, -300, -8, -312, 8, -312, 10, -300]), IRON.base, 1.8);
    snowCap(g, -40, 40, () => -300, 5, 9, SNOW_D, 1.2, 2);
    // the hoist rope down the shaft
    strokeLine(g, [-30, -300, -30, 0], 1.6, '#3a3036');
  }
  function drawWinchFrame(g) {
    const T = TIMB_D;
    for (const s of [-1, 1]) ink(g, (g) => poly(g, [s * 34, 2, s * 6, -56, s * 14, -56, s * 44, 2]), T.base, 2.2, (g) => { g.fillStyle = T.sh; poly(g, [s * 40, 2, s * 11, -56, s * 14, -56, s * 44, 2]); g.fill(); });
    timberBeam(g, -46, -4, 46, 4, T, 2);
    strokeLine(g, [26, -50, 44, -66, 50, -60], 4, LINE); strokeLine(g, [26, -50, 44, -66, 50, -60], 2.4, IRON.hi);
  }
  function drawWinchRopes(ctx, camX, t) {
    const wx = 1010 - camX, wy = 334 - 306, dx = 830 - camX, dy = 334 - 50;
    ctx.strokeStyle = '#2e262c'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(wx - 30, wy - 14); ctx.lineTo(dx + 4, dy - 20); ctx.stroke();
    void t;
  }
  function drawToolRack(g) {
    const T = TIMB_D;
    for (let i = 0; i < 4; i++) {
      const x = -24 + i * 16, a = -0.22 + i * 0.12;
      g.save(); g.translate(x, 0); g.rotate(a);
      ink(g, (g) => poly(g, [-2, 0, -2, -70, 2, -70, 2, 0]), '#6a5244', 1.4);
      if (i % 2) ink(g, (g) => poly(g, [-14, -70, -2, -74, 14, -68, 2, -66]), '#7a7880', 1.6);
      else ink(g, (g) => poly(g, [-6, -70, 6, -70, 7, -88, -7, -88]), '#7a7880', 1.6);
      g.restore();
    }
    timberBeam(g, -36, -46, 36, -40, T, 1.8);
  }
  function drawOreHeap(g) {
    const R = mulberry(77);
    ink(g, (g) => blob(g, [-70, 4, -56, -26, -30, -52, 0, -64, 30, -50, 58, -24, 70, 4]), '#3c3440', 2.2, (g) => {
      for (let i = 0; i < 40; i++) {
        const x = R.r(-64, 64), y = R.r(-60, 2), r = R.r(4, 10);
        g.fillStyle = R() < 0.5 ? '#4e4552' : '#2e2832'; poly(g, [x - r, y, x - r * 0.3, y - r * 0.8, x + r * 0.8, y - r * 0.4, x + r * 0.6, y + r * 0.6, x - r * 0.4, y + r * 0.7]); g.fill();
        if (R() < 0.28) { g.fillStyle = '#ffa04a'; g.fillRect(x, y - 1, 2.6, 2); }
      }
    });
    snowCap(g, -24, 26, (x) => -60 + Math.abs(x) * 0.5, 6, 78, SNOW_D, 1.2, 2);
  }
  function drawSign(g) {
    ink(g, (g) => poly(g, [-4, 4, -4, -90, 4, -90, 4, 4]), TIMB_D.base, 2.2);
    ink(g, (g) => poly(g, [-32, -90, 32, -90, 34, -54, -34, -54]), '#7a6058', 2.2, (g) => {
      g.strokeStyle = '#4e3a34'; g.lineWidth = 1; for (const y of [-80, -68]) { polyline(g, [-32, y, 32, y]); g.stroke(); }
      // painted crossed picks over a flame (the clan's mark), with the King's iron seal nailed over it
      g.strokeStyle = '#e8d8b8'; g.lineWidth = 2.4; polyline(g, [-14, -60, 6, -82]); g.stroke(); polyline(g, [14, -60, -6, -82]); g.stroke();
      g.fillStyle = '#e07a3a'; poly(g, [0, -86, 5, -76, 2, -70, -2, -70, -5, -76]); g.fill();
    });
    ink(g, (g) => poly(g, [8, -86, 26, -86, 26, -66, 8, -66]), KING.iron, 1.6, (g) => { kingEmblem(g, 17, -72, 14, '#4a4652', KING.iron); });
    snowCap(g, -34, 34, () => -90, 5, 79, SNOW_D, 1.2, 2);
  }
  function drawBigCart(g, T) {
    for (const x of [-32, 32]) ink(g, (g) => { g.beginPath(); g.arc(x, -10, 11, 0, TAU); }, IRON.base, 2.2, (g) => { g.fillStyle = IRON.hi; g.fillRect(x - 11, -21, 22, 3); g.fillStyle = IRON.sh; g.beginPath(); g.arc(x, -10, 4, 0, TAU); g.fill(); });
    ink(g, (g) => blob(g, [-46, -54, -34, -66, -12, -72, 12, -70, 34, -64, 46, -54]), '#3a3238', 2.2, (g) => {
      const R = mulberry(5);
      for (let i = 0; i < 22; i++) { const x = R.r(-44, 44), y = R.r(-70, -52), r = R.r(3, 7); g.fillStyle = R() < 0.5 ? '#4e4552' : '#2a2430'; g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, TAU); g.fill(); if (R() < 0.3) { g.fillStyle = '#ffa04a'; g.fillRect(x, y - 1, 2.4, 2); } }
    });
    ink(g, (g) => poly(g, [-52, -56, 52, -56, 44, -16, -44, -16]), '#4a464e', 2.6, (g) => {
      g.fillStyle = '#34313a'; g.fillRect(14, -60, 40, 48);
      g.fillStyle = '#6e6a76'; g.fillRect(-52, -56, 104, 3);
      g.fillStyle = '#2a282e'; for (const y of [-48, -26]) g.fillRect(-50, y, 100, 4);
      g.fillStyle = '#8a8692'; for (let x = -44; x <= 44; x += 11) for (const y of [-46, -24]) { g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill(); }
    });
    void T;
  }
  function drawKingBrazier(g) {
    for (const s of [-1, 1]) strokeLine(g, [s * 6, -50, s * 18, 2], 5, LINE), strokeLine(g, [s * 6, -50, s * 18, 2], 3, KING.ironHi);
    strokeLine(g, [0, -50, 0, 2], 5, LINE); strokeLine(g, [0, -50, 0, 2], 3, KING.iron);
    ink(g, (g) => { g.beginPath(); g.moveTo(-28, -76); g.quadraticCurveTo(-24, -50, 0, -50); g.quadraticCurveTo(24, -50, 28, -76); g.closePath(); }, KING.iron, 2.4, (g) => {
      g.fillStyle = KING.ironHi; g.fillRect(-26, -76, 6, 14);
      for (const x of [-16, 0, 16]) { g.fillStyle = '#4a4652'; poly(g, [x - 4, -66, x, -72, x + 4, -66, x, -60]); g.fill(); }
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -76, 28, 5, 0, 0, TAU); }, '#1a1a1e', 2);
  }
  function drawBuckets(g) {
    for (const [x, s] of [[-12, 1], [12, 0.85]]) {
      g.save(); g.translate(x, 0); g.scale(s, s);
      ink(g, (g) => poly(g, [-12, 0, -14, -26, 14, -26, 12, 0]), TIMB.base, 2, (g) => { g.fillStyle = TIMB.sh; g.fillRect(4, -28, 12, 30); g.fillStyle = IRON.base; g.fillRect(-15, -22, 30, 3); g.fillRect(-14, -8, 28, 3); });
      strokeLine(g, [-12, -26, -4, -38, 4, -38, 12, -26], 2.4, LINE); strokeLine(g, [-12, -26, -4, -38, 4, -38, 12, -26], 1.2, IRON.hi);
      g.restore();
    }
  }
  function drawPlanks(g) {
    for (const [y, x0, x1, a] of [[0, -54, 50, 0.02], [-8, -44, 56, -0.03], [-16, -50, 40, 0.04]]) {
      g.save(); g.rotate(a);
      timberBeam(g, x0, y - 8, x1, y, TIMB, 1.8);
      g.restore();
    }
  }
  function drawArch(g) {
    // the tunnel's end: a massive rock jamb from floor to roof; timber on the tunnel side, lava light on the cavern side
    const R = mulberry(3400);
    const L = [], Rr = [];
    for (let y = 8; y >= -400; y -= 26) { L.push(-60 + R.r(-10, 6) + (y < -300 ? (y + 300) * 0.1 : 0), y); Rr.push(56 + R.r(-6, 10) - (y > -60 ? (y + 60) * 0.5 : 0), y); }
    const pts = L.slice(); for (let i = Rr.length - 2; i >= 0; i -= 2) pts.push(Rr[i], Rr[i + 1]);
    ink(g, (g) => poly(g, pts), ROCK_MINE.base, 2.4, (g) => {
      rockFacets(g, -90, 90, -410, 20, ROCK_MINE, 3401, 46, 40);
      g.fillStyle = 'rgba(10,6,6,0.35)'; g.fillRect(-90, -410, 180, 430);
      const gr = g.createLinearGradient(20, 0, 70, 0); gr.addColorStop(0, 'rgba(255,120,50,0)'); gr.addColorStop(1, 'rgba(255,130,60,0.45)');
      g.fillStyle = gr; g.fillRect(20, -410, 60, 430);
    });
    g.beginPath(); polyline(g, Rr); g.strokeStyle = 'rgba(255,170,90,0.7)'; g.lineWidth = 2; g.stroke();
    shoringPost(g, -70, -264, 4, TIMB);
  }
  function drawStalactites(g, s, seed) {
    const R = mulberry(seed);
    for (let i = 0; i < 5; i++) {
      const x = R.r(-60, 60) * s, w = R.r(10, 22) * s, len = R.r(40, 120) * s * (i === 2 ? 1.3 : 1);
      ink(g, (g) => poly(g, [x - w, 0, x + w, 0, x + w * 0.25, len * 0.75, x, len]), '#2a1e1e', 2, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, w, len);
        g.fillStyle = 'rgba(255,130,60,0.4)'; poly(g, [x - w * 0.4, len * 0.6, x, len * 0.65, x, len]); g.fill();
      });
    }
    ink(g, (g) => { g.beginPath(); g.rect(-80 * s, -10, 160 * s, 14); }, '#1e1515', 1.6);
  }
  function drawCraneArm(g) {
    ink(g, (g) => poly(g, [0, -30, 0, 16, 200, 30, 200, 18]), IRON.base, 2.4, (g) => { g.fillStyle = IRON.hi; g.fillRect(0, -30, 200, 3); });
    for (let x = 20; x < 200; x += 26) strokeLine(g, [x, 0, x + 13, 22], 2.2, IRON.sh);
    ink(g, (g) => { g.beginPath(); g.arc(160, 34, 8, 0, TAU); }, IRON.hi, 1.8);
  }
  function drawCrucible(g) {
    ink(g, (g) => { g.beginPath(); g.moveTo(-34, 30); g.lineTo(34, 30); g.lineTo(26, 66); g.quadraticCurveTo(0, 74, -26, 66); g.closePath(); }, '#3a363e', 2.4, (g) => {
      g.fillStyle = '#26232a'; g.fillRect(8, 26, 30, 50); g.fillStyle = '#6a6672'; g.fillRect(-34, 30, 68, 3);
      g.fillStyle = 'rgba(255,120,50,0.35)'; g.fillRect(-34, 56, 68, 20);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, 30, 34, 7, 0, 0, TAU); }, '#2a262c', 2, (g) => {
      g.fillStyle = LAVA.mid; g.beginPath(); g.ellipse(0, 31, 28, 4.6, 0, 0, TAU); g.fill();
      g.fillStyle = LAVA.core; g.beginPath(); g.ellipse(-6, 30, 12, 2, 0, 0, TAU); g.fill();
    });
    for (const s of [-1, 1]) strokeLine(g, [s * 34, 30, 0, 0], 2.2, '#1a161a');
  }
  function drawCrucibleLive(ctx, x, y, t) {
    if (x < -80 || x > W + 80) return;
    const a = Math.sin(t * 0.8) * 0.05;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.drawImage(C.chain.c, 0, 0, C.chain.c.width, C.chain.c.height * (150 / 260), -C.chain.w / 2, 0, C.chain.w, 150);
    ctx.drawImage(C.crucible.c, -C.crucible.ox, 150 - C.crucible.oy, C.crucible.w, C.crucible.h);
    ctx.restore();
    glowAt(ctx, C.glowLava, x + Math.sin(a) * -180, y + 180, 70, 0.6 + 0.15 * Math.sin(t * 3));
  }
  function hangChain(ctx, x, y, len, t, seed) {
    if (x < -40 || x > W + 40) return;
    const a = Math.sin(t * 0.7 + seed) * 0.035;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.drawImage(C.chain.c, 0, 0, C.chain.c.width, C.chain.c.height * Math.min(1, len / 256), -C.chain.w / 2, 0, C.chain.w, Math.min(256, len));
    ctx.drawImage(C.hook.c, -C.hook.ox, len - 2, C.hook.w, C.hook.h);
    ctx.restore();
  }
  function drawFurnace(g) {
    const brick = '#5a2e26', brickSh = '#3e1e1a', brickHi = '#7a4434';
    const body = (g) => {
      g.beginPath(); g.moveTo(-196, 4); g.lineTo(-184, -250); g.quadraticCurveTo(-170, -322, -84, -348); g.lineTo(-62, -348); g.lineTo(-62, -486);
      g.lineTo(62, -486); g.lineTo(62, -348); g.lineTo(84, -348); g.quadraticCurveTo(170, -322, 184, -250); g.lineTo(196, 4); g.closePath();
    };
    ink(g, body, brick, 3, (g) => {
      for (let r = 0, y = 4; y > -490; r++, y -= 15) {
        const off = (r % 2) * 16;
        for (let x = -220 + off; x < 220; x += 32) {
          const h = hash2(x + 300, r);
          g.fillStyle = mix(brick, h < 0.5 ? brickSh : brickHi, Math.abs(h - 0.5) * 1.1);
          g.fillRect(x + 1.2, y - 14 + 1.2, 29.6, 12.6);
        }
      }
      vgrad(g, -220, -490, 440, 10, [[0, 'rgba(12,6,6,0.75)'], [0.55, 'rgba(12,6,6,0.15)'], [1, 'rgba(255,120,50,0.2)']]);
      g.fillStyle = 'rgba(0,0,0,0.28)'; poly(g, [60, -490, 220, -490, 220, 10, 120, 10]); g.fill();
      g.fillStyle = 'rgba(255,170,100,0.12)'; poly(g, [-200, -250, -140, -330, -110, -330, -160, -40, -200, 0]); g.fill();
      // iron bands and straps
      for (const y of [-130, -262]) { const w = y < -200 ? 180 : 192; g.fillStyle = INK; g.fillRect(-w, y - 6, w * 2, 12); g.fillStyle = IRON.base; g.fillRect(-w, y - 4.5, w * 2, 9); g.fillStyle = IRON.hi; g.fillRect(-w, y - 4.5, w * 2, 1.5); g.fillStyle = '#8a8692'; for (let x = -w + 10; x < w; x += 22) { g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); } }
    });
    // stone voussoirs around the mouth and the mouth itself
    ink(g, (g) => { g.beginPath(); g.moveTo(-118, 4); g.lineTo(-118, -60); g.arc(0, -60, 118, Math.PI, 0); g.lineTo(118, 4); g.closePath(); }, '#4a3e3c', 2.6, (g) => {
      for (let k = 0; k <= 12; k++) { const a = Math.PI + (k / 12) * Math.PI; strokeLine(g, [Math.cos(a) * 96, -60 + Math.sin(a) * 96, Math.cos(a) * 118, -60 + Math.sin(a) * 118], 1.4, rgba(LINE, 0.8)); }
      g.fillStyle = '#5e504c'; g.beginPath(); g.arc(0, -60, 117, Math.PI * 1.05, Math.PI * 1.5); g.arc(0, -60, 100, Math.PI * 1.5, Math.PI * 1.05, true); g.fill();
    });
    ink(g, (g) => { g.beginPath(); g.moveTo(-96, 4); g.lineTo(-96, -60); g.arc(0, -60, 96, Math.PI, 0); g.lineTo(96, 4); g.closePath(); }, null, 2.2, (g) => {
      const gr = g.createRadialGradient(0, -30, 10, 0, -50, 150);
      gr.addColorStop(0, '#fff2b8'); gr.addColorStop(0.25, '#ffc04a'); gr.addColorStop(0.6, '#e2581a'); gr.addColorStop(1, '#6a1a0a');
      g.fillStyle = gr; g.fillRect(-100, -160, 200, 170);
      // coal bed
      for (let i = 0; i < 16; i++) { const x = -88 + i * 11.5, r = 7 + hash1(i * 3) * 5; g.fillStyle = '#2a1010'; g.beginPath(); g.arc(x, 4, r, Math.PI, 0); g.fill(); g.strokeStyle = '#ffb040'; g.lineWidth = 1; g.beginPath(); g.arc(x, 4, r - 2, Math.PI * 1.2, Math.PI * 1.7); g.stroke(); }
    });
    // the collar mould frame above the mouth (the molten ring is drawn live)
    ink(g, (g) => poly(g, [-86, -176, 86, -176, 86, -300, -86, -300]), KING.iron, 2.8, (g) => {
      g.fillStyle = KING.ironHi; g.fillRect(-86, -300, 172, 4);
      g.fillStyle = '#0c0a0e'; g.beginPath(); g.arc(0, -238, 54, 0, TAU); g.fill();
      g.fillStyle = '#26232a'; g.beginPath(); g.arc(0, -238, 28, 0, TAU); g.fill();
      g.fillStyle = '#4a4652'; for (const [x, y] of [[-76, -290], [76, -290], [-76, -186], [76, -186]]) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
    });
    // spill channels from the mould's corners
    for (const s of [-1, 1]) strokeLine(g, [s * 40, -196, s * 64, -176], 3, '#0c0a0e');
    // the crowned crest above (its gem is live)
    ink(g, (g) => { g.beginPath(); g.moveTo(-44, -320); g.lineTo(44, -320); g.lineTo(44, -350); g.lineTo(-44, -350); g.closePath(); }, KING.iron, 2.2);
    kingEmblem(g, 0, -328, 46, '#4a4652', KING.iron);
    // chains holding the mould
    for (const s of [-1, 1]) { g.strokeStyle = '#141114'; g.lineWidth = 3.4; g.setLineDash([5, 3]); polyline(g, [s * 56, -486, s * 70, -300]); g.stroke(); g.setLineDash([]); }
  }
  function drawFurnaceLive(ctx, x, t) {
    if (x < -280 || x > W + 280) return;
    const by = 362;
    // fire in the mouth
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, C.glowLava, x, by - 60, 150, 0.55 + 0.12 * Math.sin(t * 7) + 0.08 * Math.sin(t * 17));
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 4; i++) drawFlame(ctx, x - 60 + i * 40, by - 2, 34 + 8 * Math.sin(t * 2 + i), t, i * 1.7, FIRE_W);
    // the collar mould: venom green, or gold when the curse lifts
    const k = kingCol(), my = by - 238;
    for (const [spr, a] of k.rings) { ctx.globalAlpha = a; ctx.drawImage(spr.c, x - spr.ox, my - spr.oy, spr.w, spr.h); }
    ctx.globalAlpha = 1;
    for (const [spr, a] of k.glows) glowAt(ctx, spr, x, my, 110, a * (0.75 + 0.15 * Math.sin(t * 2.2)));
    gemAt(ctx, x + 2, by - 336, 1.6, 0.9);
    // sparks drifting out of the chimney
    ctx.fillStyle = '#ffc060';
    for (let i = 0; i < 6; i++) { const f = (t * 0.4 + i / 6) % 1; ctx.globalAlpha = 1 - f; ctx.fillRect(x - 30 + Math.sin(f * 7 + i) * 24 + i * 10, by - 470 - f * 60, 2, 2); }
    ctx.globalAlpha = 1;
  }
  function lavaStream(ctx, x, y0, y1, w, t) {
    if (x < -40 || x > W + 40) return;
    const tex = C.lavaTex, th = tex.h, sc = (t * 90) % th;
    ctx.save(); ctx.beginPath(); ctx.rect(x - w / 2, y0, w, y1 - y0); ctx.clip();
    for (let y = y0 - th + sc; y < y1; y += th) ctx.drawImage(tex.c, x - w / 2, y, w, th);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,245,190,0.75)'; ctx.fillRect(x - 1.2, y0, 2.4, y1 - y0);
    glowAt(ctx, C.glowLava, x, y1 - 6, 34, 0.7 + 0.2 * Math.sin(t * 6 + x));
  }
  function drawCollarRack(g) {
    timberBeam(g, -54, -40, 54, -32, TIMB, 2);
    for (const dx of [-36, 0, 36]) {
      strokeLine(g, [dx, -32, dx, -20], 2.2, '#1a161a');
      ink(g, (g) => { g.beginPath(); g.arc(dx, -2, 14, 0, TAU); g.arc(dx, -2, 9, 0, TAU, true); }, KING.iron, 1.8, (g) => { g.fillStyle = KING.ironHi; g.fillRect(dx - 14, -16, 28, 2); });
    }
  }
  function drawHearth(g) {
    // a hooded smithy hearth: brick base, fire pan, iron hood up into the dark
    ink(g, (g) => poly(g, [-34, -180, 34, -180, 60, -110, -60, -110]), '#3a363e', 2.4, (g) => { g.fillStyle = '#2a262e'; g.fillRect(10, -184, 54, 80); g.fillStyle = 'rgba(255,140,60,0.3)'; g.fillRect(-60, -126, 120, 18); });
    ink(g, (g) => poly(g, [-18, -290, 18, -290, 18, -180, -18, -180]), '#3a363e', 2.2, (g) => { g.fillStyle = '#2a262e'; g.fillRect(4, -290, 16, 112); });
    ink(g, (g) => poly(g, [-62, 2, -62, -58, 62, -58, 62, 2]), '#5a2e26', 2.6, (g) => {
      for (let r = 0, y = 2; y > -60; r++, y -= 14) for (let x = -64 + (r % 2) * 14; x < 64; x += 28) { g.fillStyle = hash2(x + 99, r) < 0.5 ? '#4a2620' : '#6a3a2e'; g.fillRect(x + 1, y - 13, 26, 12); }
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(24, -60, 40, 64);
    });
    ink(g, (g) => poly(g, [-56, -58, 56, -58, 50, -70, -50, -70]), '#2a262e', 2.2, (g) => { g.fillStyle = '#ffb04a'; g.fillRect(-46, -70, 92, 5); });
  }
  function drawHearthLive(ctx, x, t) {
    if (x < -160 || x > W + 100) return;
    const by = 364;
    glowAt(ctx, C.glowLava, x, by - 80, 90, 0.5 + 0.1 * Math.sin(t * 8));
    drawFlame(ctx, x - 20, by - 66, 22, t, 2.1, FIRE_W); drawFlame(ctx, x + 18, by - 66, 18, t, 3.4, FIRE_W);
    // bellows beside it, pumping
    const a = 0.1 + 0.12 * Math.max(0, Math.sin(t * 2.4));
    const bx = x - 96, bb = by - 30;
    ctx.save(); ctx.lineJoin = 'round';
    ctx.fillStyle = '#5a3a28'; ctx.strokeStyle = LS.forge[0]; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(bx - 34, bb); ctx.lineTo(bx + 34, bb + 4); ctx.lineTo(bx + 30 - Math.sin(a) * 6, bb - 10 - Math.sin(a) * 60); ctx.lineTo(bx - 34, bb - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 1.2;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(bx - 30, bb - 3); ctx.lineTo(bx + 32 - Math.sin(a) * 6 * (k / 4), bb + 2 - (10 + Math.sin(a) * 60) * (k / 4)); ctx.stroke(); }
    ctx.fillStyle = '#6a4a34'; ctx.strokeStyle = LS.forge[0]; ctx.lineWidth = 1.8;
    ctx.save(); ctx.translate(bx - 34, bb - 6); ctx.rotate(-a);
    ctx.beginPath(); ctx.rect(0, -5, 70, 6); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.rect(bx - 36, bb, 72, 6); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#2a262e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx + 34, bb + 2); ctx.lineTo(x - 56, by - 34); ctx.stroke();
    ctx.restore();
    // sparks off the anvil now and then
    const cyc = (t / 1.7) % 1;
    if (cyc < 0.25) {
      const f = cyc / 0.25, ax = 6020 - (HEARTH - x), ay = by - 54;
      ctx.strokeStyle = `rgba(255,210,120,${1 - f})`; ctx.lineWidth = 1.4;
      for (let i = 0; i < 7; i++) { const ang = -Math.PI * (0.15 + i * 0.1), l = 6 + f * 26; ctx.beginPath(); ctx.moveTo(ax + Math.cos(ang) * l * 0.6, ay + Math.sin(ang) * l * 0.6 + f * f * 10); ctx.lineTo(ax + Math.cos(ang) * l, ay + Math.sin(ang) * l + f * f * 14); ctx.stroke(); }
    }
  }
  function drawAnvil(g) {
    ink(g, (g) => poly(g, [-16, 2, -12, -18, 12, -18, 16, 2]), TIMB.base, 2.2, (g) => { g.fillStyle = TIMB.sh; g.fillRect(4, -20, 14, 24); });
    ink(g, (g) => { g.beginPath(); g.moveTo(-40, -36); g.lineTo(26, -36); g.lineTo(30, -30); g.lineTo(14, -26); g.lineTo(10, -18); g.lineTo(-12, -18); g.lineTo(-16, -26); g.quadraticCurveTo(-34, -28, -40, -36); g.closePath(); }, '#45424c', 2.4, (g) => {
      g.fillStyle = '#7a7684'; g.fillRect(-40, -36, 70, 2.6); g.fillStyle = '#2c2a32'; g.fillRect(-20, -28, 50, 12);
    });
  }
  function drawQuench(g) {
    ink(g, (g) => poly(g, [-26, 2, -28, -34, 28, -34, 26, 2]), TIMB.base, 2.2, (g) => { g.fillStyle = TIMB.sh; g.fillRect(8, -36, 22, 40); g.fillStyle = IRON.base; g.fillRect(-29, -28, 58, 4); g.fillRect(-28, -8, 56, 4); });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -34, 28, 5, 0, 0, TAU); }, '#2a2224', 1.8, (g) => { g.fillStyle = '#2a3a44'; g.beginPath(); g.ellipse(0, -33, 24, 3.4, 0, 0, TAU); g.fill(); });
    strokeLine(g, [10, -34, 24, -60], 3.4, LINE); strokeLine(g, [10, -34, 24, -60], 2, IRON.hi);
  }
  function drawFlagCloth(g, w, h) {
    const pts = [0, 2, w, 6, w - 16, h * 0.5, w, h - 6, 0, h - 2];
    ink(g, (g) => poly(g, pts), KING.cloth, 1.8, (g) => {
      g.fillStyle = KING.clothHi; g.fillRect(0, 0, w, 8);
      g.fillStyle = KING.clothSh; g.fillRect(0, h - 14, w, 14);
      kingEmblem(g, w * 0.42, h * 0.52, h * 0.66, KING.green, KING.cloth);
    });
  }

  // ------------------------------------------------------------------ foreground occluders (1.25) - none on an arena screen
  function buildFront(cs) {
    setLS('front');
    const post = (T, lantern) => makeSprite(90, 620, 45, 600, cs, (g) => {
      ink(g, (g) => poly(g, [-17, 20, -16, -600, 16, -600, 17, 20]), T.base, 3.2, (g) => {
        g.fillStyle = T.sh; g.fillRect(4, -610, 16, 640); g.fillStyle = rgba(T.hi, 0.6); g.fillRect(-17, -610, 4, 640);
        g.strokeStyle = T.grain; g.lineWidth = 1.4; for (let y = -560; y < 0; y += 46) { polyline(g, [-10, y, -6, y + 30]); g.stroke(); }
        g.fillStyle = IRON.base; for (const y of [-440, -160]) g.fillRect(-17, y, 34, 8);
      });
      if (lantern) { strokeLine(g, [16, -360, 34, -360], 4, LINE); drawLantern(g, 30, -360, 1.2); }
    });
    const darken = (spr, a) => { const g = spr.c.getContext('2d'); if (!g) return spr; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(14,8,12,${a})`; g.fillRect(0, 0, spr.c.width, spr.c.height); return spr; };
    const portalPost = darken(post(TIMB_D, false), 0.3), tunnelPost = darken(post(TIMB, true), 0.28);
    const collarChain = makeSprite(40, 280, 20, 0, cs, (g) => {
      ink(g, (g) => { g.beginPath(); g.arc(0, 250, 16, 0, TAU); g.arc(0, 250, 10, 0, TAU, true); }, KING.iron, 2.2, (g) => { g.fillStyle = KING.ironHi; g.fillRect(-16, 234, 32, 2); });
    });
    return {
      list: [
        { spr: portalPost, wx: 1612, y: 560, kind: 'spr' },
        { spr: tunnelPost, wx: 2940, y: 560, kind: 'spr', lantern: [30, -360 + 19] },   // (was 3120: in front of the runaway cart parked by the switch)
        { wx: 4420, len: 160, kind: 'chain' },
        { wx: 5950, len: 230, kind: 'collar', spr: collarChain },
      ],
    };
  }

  // ------------------------------------------------------------------ props (built at the full device scale)
  function buildItems(s) {
    lineStyle(INK, 1);
    const it = {};
    for (const k of Object.keys(PROP_INFO)) {
      const info = PROP_INFO[k];
      const spr = makeSprite(info.w + 18, info.h + 18, info.w / 2 + 9, info.h + 9, s, (g) => PROP_DRAW[k](g));
      const white = whiteOf(spr, s);
      it[k] = { spr, white };
    }
    it.wheel = makeSprite(24, 24, 12, 12, s, (g) => PROP_DRAW.wheel(g));
    it.wheelW = whiteOf(it.wheel, s);
    it.glow = radialSprite(32, s, [[0, 'rgba(255,190,100,0.55)'], [0.4, 'rgba(255,140,60,0.2)'], [1, 'rgba(255,120,40,0)']]);
    return it;
  }
  function whiteOf(spr, s) {
    return makeSprite(spr.w, spr.h, spr.ox, spr.oy, s, (g) => {
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(spr.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, spr.c.width, spr.c.height);
    });
  }

  // ------------------------------------------------------------------ per-frame drawing
  function glowAt(ctx, spr, x, y, r, a) {
    if (a <= 0.01 || x < -r || x > W + r) return;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    ctx.drawImage(spr.c, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function gemAt(ctx, x, y, k, glowA) {
    if (x < -40 || x > W + 40) return;
    const kc = kingCol();
    for (const [spr, a] of kc.glows) glowAt(ctx, spr, x, y, 22 * k, glowA * a);
    for (const [spr, a] of kc.gems) { ctx.globalAlpha = a; ctx.drawImage(spr.c, x - spr.ox * k, y - spr.oy * k, spr.w * k, spr.h * k); }
    ctx.globalAlpha = 1;
  }
  function drawStrip(ctx, st, camX) {
    for (const ch of st.chunks) {
      const sx = ch.x - camX * st.p;
      if (sx > W || sx + ch.w < 0) continue;
      if (!ch.c) { ctx.save(); ctx.translate(sx - ch.x, 0); ch.paint(ctx); ctx.restore(); continue; }   // (no cache: live)
      ctx.drawImage(ch.c, snap(sx), st.y0, ch.w, ch.h);
    }
  }
  // the river shimmers: its lower band is redrawn in thin slices with small sideways offsets
  function drawStripShimmer(ctx, st, camX, yA, t) {
    for (const ch of st.chunks) {
      const sx = snap(ch.x - camX * st.p);
      if (sx > W || sx + ch.w < 0) continue;
      if (!ch.c) { ctx.save(); ctx.translate(sx - ch.x, 0); ch.paint(ctx); ctx.restore(); continue; }   // (no cache: live, unshimmered)
      const k = ch.c.width / ch.w;
      ctx.drawImage(ch.c, 0, 0, ch.c.width, (yA - st.y0) * k, sx, st.y0, ch.w, yA - st.y0);
      for (let y = yA; y < st.y0 + ch.h; y += 6) {
        const off = Math.sin(t * 2.4 + y * 0.31) * 1.3;
        ctx.drawImage(ch.c, 0, (y - st.y0) * k, ch.c.width, 6 * k, sx + off, y, ch.w, 6);
      }
    }
  }
  function drawSprites(ctx, list, camX) {
    for (const o of list) {
      const sx = o.x - camX;
      if (sx - o.spr.ox > W || sx - o.spr.ox + o.spr.w < 0) continue;
      ctx.drawImage(o.spr.c, snap(sx - o.spr.ox), o.y - o.spr.oy, o.spr.w, o.spr.h);
    }
  }
  function secWin(ctx, a, b) {   // clip to the screen window [a, b) of a section; returns false if empty
    const x0 = Math.max(0, a), x1 = Math.min(W, b);
    if (x1 <= x0) return false;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, 380); ctx.clip();
    return true;
  }

  function drawBack(ctx, camX, t = 0) {
    if (!C) { released = false; setScale(S || 1); }
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    ctx.fillStyle = '#0e090a'; ctx.fillRect(0, 0, W, 384);
    // ---- exterior at dusk
    if (secWin(ctx, 0, PORTAL - 40 - camX)) {
      vgrad(ctx, 0, 0, W, 384, [[0, '#1f2048'], [0.35, '#45356a'], [0.62, '#8c4a70'], [0.84, '#d8705e'], [1, '#f2a466']]);
      for (const s of LAY.stars) {
        const x = s.x - camX * 0.02; if (x < -4 || x > W + 4) continue;
        ctx.globalAlpha = (0.45 + 0.55 * Math.sin(t * s.sp + s.ph) ** 2) * clamp(1 - s.y / 170, 0, 1);
        ctx.fillStyle = '#fff6e8'; ctx.fillRect(x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(C.moon.c, snap(760 - camX * 0.04 - 22), 46, 44, 44);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(C.sunGlow.c, 160 - camX * P_FAR - 320, 384 - 280, 640, 560); ctx.globalCompositeOperation = 'source-over';
      for (const { cl, spr } of C.clouds) {
        let x = (cl.x - camX * 0.05 - t * cl.sp) % CL_PERIOD; if (x < 0) x += CL_PERIOD; x -= 250;
        if (x - spr.ox > W || x - spr.ox + spr.w < 0) continue;
        ctx.drawImage(spr.c, snap(x - spr.ox), cl.y - spr.oy, spr.w, spr.h);
      }
      drawStrip(ctx, C.extFar, camX);
      drawStrip(ctx, C.extMid, camX);
      ctx.restore();
    }
    // ---- the tunnel gallery and its chained workers
    if (secWin(ctx, PORTAL - camX, ARCH - camX)) {
      drawStrip(ctx, C.gallery, camX);
      for (const [x, k, s] of GAL_CRY) { const sx = x - camX * P_GAL; glowAt(ctx, k === 'o' ? C.glowWarm : C.glowCyan, sx, 270, 70 * s * 1.4, 0.5 + 0.2 * Math.sin(t * 1.1 + x)); }
      const gc = kingCol().gem;
      for (const d of GAL_DRAGONS) {
        let lx = d.lx;
        if (d.mode === 'haul') { lx = 1200 + ((d.lx - 1200 + t * d.sp) % 1250 + 1250) % 1250; }
        const sx = lx - camX * P_GAL;
        if (sx < -160 || sx > W + 260) continue;
        dragonWorker(ctx, sx, 312, d.s, d.mode, t, d.seed, gc);
      }
      ctx.restore();
    }
    // ---- the lava cavern
    if (secWin(ctx, ARCH - camX, FGATE - camX)) {
      drawStrip(ctx, C.cavFar, camX);
      for (const f of CAV_FALLS) {
        const x = f.x - camX * P_CAV; if (x < -60 || x > W + 60) continue;
        lavaFall(ctx, x, f.y0, 300, f.w, t);
      }
      drawStripShimmer(ctx, C.river, camX, 300, t);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 22; i++) {
        const sp = 16 + (i % 5) * 6, x = ((i * 137 + t * sp - camX * P_RIV) % (W + 220) + (W + 220)) % (W + 220) - 110;
        const y = 304 + (i % 6) * 8, l = 14 + (i % 4) * 8;
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 2 + i); ctx.fillStyle = '#ffd27a'; ctx.fillRect(x, y, l, 1.4);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      for (const hz of LAY.haze) {
        const x = ((hz.x - camX * 0.7) % 1100 + 1100) % 1100 - 70, f = (t * 0.12 * hz.sp / 14 + hz.ph) % 1;
        ctx.globalAlpha = Math.sin(f * Math.PI) * 0.7; ctx.drawImage(C.haze.c, x - hz.w / 2 + Math.sin(t + hz.ph) * 6, 320 - f * 200, hz.w, 120);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // ---- the forge hall
    if (secWin(ctx, FGATE - camX, W + 10)) {
      drawStrip(ctx, C.hall, camX);
      for (const [x] of HALL_GLOWS) {
        const sx = x - camX * P_HALL; if (sx < -80 || sx > W + 80) continue;
        glowAt(ctx, C.glowLava, sx, 220, 60, 0.35 + 0.1 * Math.sin(t * 3 + x));
      }
      ctx.restore();
    }
    // ---- near walls and sprites
    if (camX < 1250) drawStrip(ctx, C.ledge, camX);
    if (camX + W > 1140 && camX < ARCH + 70) drawStrip(ctx, C.wallA, camX);
    if (camX + W > FGATE - 170) drawStrip(ctx, C.wallF, camX);
    drawSprites(ctx, C.near.back, camX);
    for (const l of C.near.liveBack) if (l.x1 > camX - 40 && l.x0 < camX + W + 40) l.draw(ctx, camX, t);
    if (L2FIX && camX + W > MINE_LIGHT[0] && camX < MINE_LIGHT[1]) {   // (the lanterns' spill on the wall base)
      ctx.globalCompositeOperation = 'screen'; drawStrip(ctx, C.mineLight, camX); ctx.globalCompositeOperation = 'source-over';
    }
    // ---- floor
    drawStrip(ctx, C.ground, camX);
    if (L2FIX && camX + W > CAV_LIGHT[0] && camX < CAV_LIGHT[1]) {     // (the lava river's light on the walkway and walls)
      ctx.globalCompositeOperation = 'screen'; drawStrip(ctx, C.cavLight, camX); ctx.globalCompositeOperation = 'source-over';
    }
    if (L2FORGE && camX + W > FORGE_LIGHT[0]) {                        // (the forge's glow, the same way)
      ctx.globalCompositeOperation = 'screen'; drawStrip(ctx, C.forgeLight, camX); ctx.globalCompositeOperation = 'source-over';
    }
    drawSprites(ctx, C.near.front, camX);
    for (const l of C.near.liveFront) if (l.x1 > camX - 40 && l.x0 < camX + W + 40) l.draw(ctx, camX, t);
    // grating glow pulse
    for (const [ga, gb] of GRATES) {
      const a = ga - camX, b = gb - camX; if (b < 0 || a > W) continue;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.06 + 0.04 * Math.sin(t * 1.6 + ga);
      ctx.drawImage(C.glowLava.c, a, 380, b - a, 160); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    drawParticles(ctx, camX, t, 0);
    ctx.restore();
  }
  function lavaFall(ctx, x, y0, y1, w, t) {
    const tex = C.lavaTex, th = tex.h, sc = (t * 60) % th;
    ctx.save(); ctx.beginPath(); ctx.moveTo(x - w * 0.45, y0); ctx.lineTo(x + w * 0.45, y0); ctx.lineTo(x + w * 0.6, y1); ctx.lineTo(x - w * 0.6, y1); ctx.closePath(); ctx.clip();
    for (let y = y0 - th + sc; y < y1; y += th) ctx.drawImage(tex.c, x - w * 0.6, y, w * 1.2, th);
    ctx.restore();
    glowAt(ctx, C.glowLava, x, (y0 + y1) / 2, (y1 - y0) * 0.55, 0.32);
    glowAt(ctx, C.glowLava, x, y1 - 4, 40, 0.6 + 0.2 * Math.sin(t * 4 + x));
  }
  function drawParticles(ctx, camX, t, layer) {
    const par = layer ? 1.3 : 0.6;
    for (const f of LAY.motes) {
      if (f.layer !== layer) continue;
      const sx0 = ((f.x - camX * par) % 1000 + 1000) % 1000 - 20;
      const wx = camX + sx0;
      if (wx < PORTAL - 60) {                              // snow outside
        if (f.k > 0.55) continue;
        const x = sx0 + Math.sin(t * f.fr + f.ph) * f.sw + t * 12;
        const y = ((f.y + t * 34 * f.sp) % 580 + 580) % 580 - 20;
        const xx = ((x % 1000) + 1000) % 1000 - 20;
        if (xx > PORTAL - 40 - camX) continue;
        const spr = C.flakes[layer ? 2 : f.k < 0.3 ? 0 : 1], r = spr.w / 2;
        ctx.globalAlpha = layer ? 0.8 : 0.65; ctx.drawImage(spr.c, xx - r, y - r, r * 2, r * 2);
      } else if (wx < ARCH) {                              // dust motes drifting in the lantern light
        if (f.k > 0.35) continue;
        const x = sx0 + Math.sin(t * 0.3 * f.fr + f.ph) * f.sw * 2;
        const y = ((f.y - t * 4 * f.sp) % 400 + 400) % 400 + 60;
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * f.fr + f.ph); ctx.fillStyle = '#ffd9a0'; ctx.fillRect(x, y, 1.6, 1.6);
      } else {                                             // embers rising
        if (f.k > (layer ? 0.4 : 0.7)) continue;
        const x = sx0 + Math.sin(t * f.fr + f.ph) * f.sw;
        const y = ((f.y - t * 40 * f.sp) % 580 + 580) % 580 - 20;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5 * f.fr + f.ph) ** 2;
        const r = layer ? 4 : 2.6; ctx.drawImage(C.ember.c, x - r, y - r, r * 2, r * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFront(ctx, camX, t = 0, opts = {}) {
    if (!C) { released = false; setScale(S || 1); }
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    for (const o of C.front.list) {
      const sx = 480 + (o.wx - (camX + 480)) * P_FRONT;
      if (sx < -120 || sx > W + 120) continue;
      if (o.kind === 'spr') {
      // (a hero, a pickup or a chest behind it: it fades to ~35%, easing -- opts.see, World.render)
      { const x0 = sx - o.spr.ox, y0 = o.y - o.spr.oy, hid = (opts.see || []).some((q) => q.x + q.w / 2 > x0 + 6 && q.x - q.w / 2 < x0 + o.spr.w - 6 && q.y1 > y0 && q.y0 < y0 + o.spr.h);
        o.fade = (o.fade ?? 1) + ((hid ? 0.35 : 1) - (o.fade ?? 1)) * 0.18; }
      ctx.globalAlpha = o.fade;
        ctx.drawImage(o.spr.c, snap(sx - o.spr.ox), o.y - o.spr.oy, o.spr.w, o.spr.h);
        ctx.globalAlpha = 1;
        if (o.lantern) glowAt(ctx, C.glowWarm, sx + o.lantern[0], o.y + o.lantern[1], 90, 0.8 + 0.1 * Math.sin(t * 6));
      } else {
        const a = Math.sin(t * 0.6 + o.wx) * 0.03;
        ctx.save(); ctx.translate(sx, -6); ctx.rotate(a); ctx.scale(1.25, 1.25);
        ctx.drawImage(C.chain.c, 0, 0, C.chain.c.width, C.chain.c.height * Math.min(1, o.len / 256), -C.chain.w / 2, 0, C.chain.w, Math.min(256, o.len));
        if (o.kind === 'collar') { ctx.drawImage(o.spr.c, -o.spr.ox, o.len - 250 + 6, o.spr.w, o.spr.h); }
        else ctx.drawImage(C.hook.c, -C.hook.ox, o.len - 2, C.hook.w, C.hook.h);
        ctx.restore();
        if (o.kind === 'collar') { const Ly = (o.len + 19) * 1.25; gemAt(ctx, sx - Ly * Math.sin(a), -6 + Ly * Math.cos(a), 1.2, 0.9); }
      }
    }
    drawParticles(ctx, camX, t, 1);
    ctx.restore();
  }

  // ------------------------------------------------------------------ props
  function drawProp(ctx, kind, sx, sy, opts) {
    if (!C) { released = false; setScale(S || 1); }
    const it = C.items[kind];
    if (!it) return;
    const flash = clamp((opts && opts.flash) || 0, 0, 1) * 0.7, shake = (opts && opts.shake) || 0;
    const dx = shake ? shake * Math.sin(performance.now() * 0.09) : 0;
    ctx.save();
    ctx.fillStyle = 'rgba(14,8,10,0.32)';
    ctx.beginPath(); ctx.ellipse(sx, sy, PROP_INFO[kind].w * 0.55, 6, 0, 0, TAU); ctx.fill();
    if (kind === 'urn') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8; ctx.drawImage(C.items.glow.c, sx - 40, sy - 70, 80, 80); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    const s = it.spr;
    ctx.drawImage(s.c, sx + dx - s.ox, sy - s.oy, s.w, s.h);
    if (flash > 0) { ctx.globalAlpha = flash; ctx.drawImage(it.white.c, sx + dx - s.ox, sy - s.oy, s.w, s.h); ctx.globalAlpha = 1; }
    if (kind === 'cart') {
      const roll = (opts && opts.roll) || 0, w = C.items.wheel;
      for (const wx of [-20, 20]) {
        ctx.save(); ctx.translate(sx + dx + wx, sy - 10); ctx.rotate(roll / 10);
        ctx.drawImage(w.c, -w.ox, -w.oy, w.w, w.h);
        if (flash > 0) { ctx.globalAlpha = flash; ctx.drawImage(C.items.wheelW.c, -w.ox, -w.oy, w.w, w.h); }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function info() {
    let px = 0, n = 0;
    const add = (c) => { px += c.width * c.height; n++; };
    for (const s of [C.extFar, C.extMid, C.gallery, C.cavFar, C.river, C.hall, C.ledge, C.wallA, C.wallF, C.ground]) for (const ch of s.chunks) if (ch.c) add(ch.c);
    for (const l of [C.near.back, C.near.front]) { const seen = new Set(); for (const o of l) if (!seen.has(o.spr.c)) { seen.add(o.spr.c); add(o.spr.c); } }
    return { canvases: n, megapixels: +(px / 1e6).toFixed(1), approxMB: +((px * 4) / 1048576).toFixed(0), buildMs: +C.buildMs.toFixed(0), cs: C.cs };
  }

  /** free the caches now (iOS: the canvas memory cap counts them); rebuilt when it's next drawn on screen */
  function release() { if (C) freeCanvases(C); C = null; released = true; }
  return { setScale, setWarm, drawBack, drawFront, drawProp, info, release };
}

// ===============================================================================================================
// BREAKABLE PROPS (full INK: they are interactive)
// ===============================================================================================================
export const PROP_INFO = {
  crate:  { w: 62, h: 58, colors: ['#8e5d35', '#5e3c22', '#4a4048', '#ff9a3a'] },
  barrel: { w: 48, h: 58, colors: ['#5e3f2a', '#36261d', '#b8322a', '#e2d2a8'] },
  urn:    { w: 52, h: 58, colors: ['#ff9a3a', '#ffd27a', '#c4561a', '#4a3e44'] },
  cart:   { w: 72, h: 56, colors: ['#4c4a54', '#2c2a30', '#7a7884', '#5a4a44'] },
};
function oreHeap(g, pts, seed, n) {
  ink(g, (g) => blob(g, pts), '#4a4048', 2.6, (g) => {
    const R = mulberry(seed);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]); minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]); }
    for (let i = 0; i < n; i++) {
      const x = R.r(minX, maxX), y = R.r(minY, maxY), r = R.r(3.5, 7);
      g.fillStyle = R() < 0.5 ? '#5e5462' : '#352e38';
      poly(g, [x - r, y, x - r * 0.3, y - r * 0.8, x + r * 0.8, y - r * 0.4, x + r * 0.6, y + r * 0.6, x - r * 0.4, y + r * 0.7]); g.fill();
      g.strokeStyle = 'rgba(20,14,20,0.6)'; g.lineWidth = 1; g.stroke();
      if (R() < 0.3) { g.fillStyle = R() < 0.7 ? '#ffa04a' : '#ffe08a'; g.fillRect(x - 1, y - 1.4, 2.6, 2.2); }
    }
    g.fillStyle = 'rgba(190,180,210,0.35)'; g.beginPath(); g.ellipse(minX + (maxX - minX) * 0.35, minY + 4, (maxX - minX) * 0.22, 2.4, -0.2, 0, TAU); g.fill();
  });
}
const PROP_DRAW = {
  crate(g) {
    const wood = '#8e5d35', woodSh = '#5e3c22', woodHi = '#b47a48', woodDk = '#40281a', iron = '#45424a';
    const L = -30, Rr = 24, T = -36, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), woodSh, 2.6, (g) => { g.strokeStyle = woodDk; g.lineWidth = 1.2; polyline(g, [Rr, -18, Rr + dx, -18 + dy]); g.stroke(); });
    oreHeap(g, [L + 2, T + 2, L + 6, T - 12, L + 20, T - 22, Rr - 4, T - 22, Rr + dx + 2, T + dy - 6, Rr + dx, T + dy + 2], 41, 14);
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4; for (const y of [-12, -24]) { polyline(g, [L, y, Rr, y]); g.stroke(); }
      g.fillStyle = woodSh; g.fillRect(L, T, 6, 36); g.fillRect(Rr - 6, T, 6, 36); g.fillRect(L, T, Rr - L, 5);
      g.fillStyle = woodHi; g.fillRect(L + 6, T + 5, Rr - L - 12, 2);
      g.fillStyle = iron; for (const [x, y] of [[L, T], [Rr - 9, T], [L, -9], [Rr - 9, -9]]) g.fillRect(x, y, 9, 9);
      g.fillStyle = '#8a8690'; for (const [x, y] of [[L + 4, T + 4], [Rr - 5, T + 4], [L + 4, -5], [Rr - 5, -5]]) g.fillRect(x - 1, y - 1, 2, 2);
      // stencilled pick mark
      g.strokeStyle = 'rgba(30,18,10,0.55)'; g.lineWidth = 2; polyline(g, [-12, -8, 4, -26]); g.stroke(); polyline(g, [-2, -28, 8, -22, 10, -26]); g.stroke();
    });
  },
  barrel(g) {
    const wood = '#5e3f2a', woodSh = '#3e2a1c', woodHi = '#80583a', iron = '#45424a', ironHi = '#8a8692';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -50); g.quadraticCurveTo(-27, -25, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -25, 18, -50); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -58, 30, 64); g.fillStyle = woodHi; g.fillRect(-19, -52, 5, 56);
      g.strokeStyle = woodSh; g.lineWidth = 1.2; for (const k of [-0.5, -0.1, 0.3]) { g.beginPath(); g.moveTo(k * 18, -50); g.quadraticCurveTo(k * 27, -25, k * 18, 4); g.stroke(); }
      g.fillStyle = '#b8322a'; g.fillRect(-28, -33, 56, 8); g.fillStyle = '#7e1f1a'; g.fillRect(-28, -27, 56, 2);
      // powder label: a black flame on cream
      g.fillStyle = '#e2d2a8'; g.fillRect(-9, -22, 18, 14); g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(-9, -22, 18, 14);
      g.fillStyle = '#2a1e1a'; poly(g, [0, -21, 4, -15, 2, -10, -2, -10, -4, -15, -1, -17]); g.fill();
      for (const y of [-44, -6]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.4); }
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -50, 18, 5.5, 0, 0, TAU); }, woodHi, 2.4, (g) => { g.fillStyle = woodSh; g.beginPath(); g.arc(5, -50, 3, 0, TAU); g.fill(); });
    // the fuse
    g.strokeStyle = INK; g.lineWidth = 3.4; g.beginPath(); g.moveTo(5, -51); g.quadraticCurveTo(10, -60, 4, -64); g.stroke();
    g.strokeStyle = '#d8c08a'; g.lineWidth = 1.8; g.stroke();
  },
  urn(g) {
    // a cluster of ember crystals on a lump of basalt
    ink(g, (g) => blob(g, [-26, 2, -22, -12, -6, -18, 12, -16, 26, -6, 22, 4]), '#4a3e44', 2.6, (g) => { g.fillStyle = '#342a30'; g.fillRect(4, -20, 30, 26); g.fillStyle = 'rgba(255,150,60,0.35)'; g.fillRect(-26, -18, 52, 4); });
    const list = [[-0.55, 30, 12, -12], [0.5, 32, 12, 12], [-0.2, 44, 15, -4], [0.15, 50, 16, 4], [0.8, 22, 10, 18]];
    for (const [a, L, w, x] of list.sort((p, q) => q[1] - p[1])) {
      g.save(); g.translate(x, -10); g.rotate(a);
      const hw = w / 2;
      ink(g, (g) => poly(g, [-hw, 4, -hw, -L * 0.72, 0, -L, hw, -L * 0.72, hw, 4]), '#ff9a3a', 2.4, (g) => {
        g.fillStyle = '#c4561a'; g.fillRect(hw * 0.15, -L, hw, L + 6);
        g.fillStyle = '#ffe2a0'; poly(g, [-hw, 4, -hw, -L * 0.72, 0, -L, -hw * 0.3, -L * 0.68, -hw * 0.4, 4]); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(-hw * 0.75, -L * 0.62, 1.6, L * 0.45);
      });
      g.restore();
    }
  },
  cart(g) {
    // small ore cart (the engine rolls it; wheels are drawn separately so they can turn)
    oreHeap(g, [-30, -42, -24, -52, -8, -58, 10, -58, 24, -52, 30, -42], 57, 12);
    ink(g, (g) => poly(g, [-35, -44, 35, -44, 28, -14, -28, -14]), '#4c4a54', 2.8, (g) => {
      g.fillStyle = '#34323a'; g.fillRect(10, -48, 30, 38);
      g.fillStyle = '#7a7884'; g.fillRect(-35, -44, 70, 3);
      g.fillStyle = '#2c2a30'; for (const y of [-36, -22]) g.fillRect(-34, y, 68, 3.4);
      g.fillStyle = '#9a96a2'; for (let x = -28; x <= 28; x += 8) for (const y of [-34.5, -20.5]) { g.beginPath(); g.arc(x, y, 1.2, 0, TAU); g.fill(); }
    });
    ink(g, (g) => poly(g, [-32, -16, 32, -16, 32, -10, -32, -10]), '#3a3640', 2.2);
    for (const s of [-1, 1]) ink(g, (g) => poly(g, [s * 34, -34, s * 42, -36, s * 42, -30, s * 34, -28]), '#3a3640', 1.8);
  },
  wheel(g) {
    ink(g, (g) => { g.beginPath(); g.arc(0, 0, 9.5, 0, TAU); }, '#3e3c44', 2.4, (g) => {
      g.strokeStyle = '#6e6a76'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, 6.5, 0, TAU); g.stroke();
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; polyline(g, [Math.cos(a) * 6.5, Math.sin(a) * 6.5, -Math.cos(a) * 6.5, -Math.sin(a) * 6.5]); g.stroke(); }
    });
    g.fillStyle = '#9a96a2'; g.beginPath(); g.arc(0, 0, 2, 0, TAU); g.fill();
  },
};
