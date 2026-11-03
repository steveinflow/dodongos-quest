// Dodongo's Quest - Mystic Mountain bonus "DAWN" (src/stages/mmvalley.js): the valley sky for the dragon ride home.
//
// The comic's chapter seven (pages 44-47): a low flight over the valley at dawn -- pink-gold sky, the fields, the old
// mill, the village, the hill with Shadow's oak.  Morvath's storm left the valley grey; a wave of colour sweeps back
// over it (setColor), gold and green, flowers opening behind it.  For the sky-duel engine (src/skyduel.js), as
// src/stages/sky.js: camX runs on without end, so every layer loops (RIDE_LEN of camX per lap).
//
// Back-to-front (drawBack): the dawn sky (live gradient, the low sun and its rays) -> far clouds (p 0.04) -> the
// mountain far behind, the storm gone (p 0.02) -> far hills (p 0.08) -> mid clouds (p 0.12) -> rolling hills and
// fields (p 0.25) -> the near land: fields, hedges, the road, the mill, the village, the oak hill (p 0.6) + the mill's
// sails (live) -> the grey (desaturated) beyond the colour wave, its sparkling front -> birds.
// drawFront: the near meadow along the bottom (p 1.3), its flowers opening behind the wave; petals in the air.
// setColor(k): 0 all grey .. 1 all colour; between, the wave front crosses the screen left to right (screen x
// lerp(-160, W + 160, k)).  HOOKS: the camX that centres the mill / the village / the oak (each lap: + RIDE_LEN).
// setStorm / flashOf / drawRoof are there for the engine (no storm here: no-ops, flash 0).
// Static elements are cached per scale (loop strips + sprites, src/canvasmem.js); animated bits are live.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const RIDE_LEN = 6400;                       // camX per lap (the engine's camX grows ~1.7 a frame: ~63 s a lap)
export const LEVEL_LEN = RIDE_LEN;
const CAM_MAX = RIDE_LEN;
export const SECTIONS = [
  { id: 'fields', name: 'The Fields', x0: 0, x1: 1600 },
  { id: 'mill', name: 'The Old Mill', x0: 1600, x1: 2600 },
  { id: 'village', name: 'The Village', x0: 2600, x1: 4400 },
  { id: 'oak', name: "The Oak Hill", x0: 4400, x1: RIDE_LEN },
];
export const ARENAS = [];
export const WAYSTONES = [];
const P_NEAR = 0.6, P_MIDL = 0.25, P_FARH = 0.08;
const NEAR_LAP = RIDE_LEN * P_NEAR, MID_LAP = RIDE_LEN * P_MIDL, FAR_LAP = RIDE_LEN * P_FARH;
const MILL_LX = 1500, VILLAGE_LX = 2400, OAK_LX = 3300;    // landmarks in the near layer (layer x)
const camFor = (lx) => Math.round((lx - W / 2) / P_NEAR);
export const HOOKS = { rideLen: RIDE_LEN, mill: camFor(MILL_LX), village: camFor(VILLAGE_LX), oak: camFor(OAK_LX), horizon: 290 };

// ---------------------------------------------------------------------------------------------------------------
// TOOLKIT (the same block as frozen.js, crystal.js, eyrie.js and hollow.js; after src/stages/mines.js)
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
// piecewise-smooth value noise, a pure function of x (chunk-safe)
function vnoise(x, s, seed) { const i = Math.floor(x / s), f = smooth(x / s - i); return lerp(hash2(i, seed), hash2(i + 1, seed), f) - 0.5; }
const _rgb = new Map();
function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = _rgb.get(c);
  if (!v) { const n = parseInt(c.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; _rgb.set(c, v); }
  return v;
}
const hex2 = (v) => (v < 16 ? '0' : '') + v.toString(16);
function mix(a, b, t) {
  a = rgb(a); b = rgb(b);
  return '#' + hex2(Math.round(a[0] + (b[0] - a[0]) * t)) + hex2(Math.round(a[1] + (b[1] - a[1]) * t)) + hex2(Math.round(a[2] + (b[2] - a[2]) * t));
}
function rgba(c, a) { c = rgb(c); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
const lighten = (c, k) => mix(c, '#ffffff', k);
const darken = (c, k) => mix(c, '#161226', k);

// The cache canvases of the build in progress (info / release count and free them).
let BUILT = null;
const track = (c) => { if (BUILT) BUILT.push(c); return c; };
// A sprite: logical size w x h, anchor (ox, oy) from its top-left; draw() works in anchor-relative logical units.
// (src/canvasmem.js: a lower scale if the memory cap refuses this one; none at all -> painted live each draw instead)
function makeSprite(w, h, ox, oy, sc, draw) {
  const L = layerCanvas(w, h, sc);
  if (!L) {
    const vw = Math.ceil(w * sc), vh = Math.ceil(h * sc);
    return { c: liveCanvas(vw, vh, (g) => { g.transform(sc, 0, 0, sc, ox * sc, oy * sc); g.lineJoin = 'round'; g.lineCap = 'round'; draw(g); }), w: vw / sc, h: vh / sc, ox, oy };
  }
  const c = track(L.c), g = L.g;
  sc = L.sc;
  g.setTransform(sc, 0, 0, sc, ox * sc, oy * sc);
  g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g);
  return { c, w: c.width / sc, h: c.height / sc, ox, oy };
}
// A horizontal strip of layer content (layer x lx0..lx1, screen y y0..y1, parallax p), chunked so no canvas exceeds
// ~2048 device px wide.  A chunk the memory cap refuses is painted live each frame by drawStrip (never a black hole).
function buildStrip(lx0, lx1, y0, y1, sc, p, draw) {
  const chunks = [];
  const cw = Math.max(256, Math.floor(2040 / sc) - 8);
  for (let x = lx0; x < lx1; x += cw) {
    const xa = x - 3, xb = Math.min(lx1, x + cw) + 3;
    const paint = (g) => { g.lineJoin = 'round'; g.lineCap = 'round'; g.save(); g.beginPath(); g.rect(xa, y0, xb - xa, y1 - y0); g.clip(); draw(g, xa, xb); g.restore(); };
    const L = layerCanvas(xb - xa, y1 - y0, sc);
    if (!L) { chunks.push({ c: null, x: xa, w: xb - xa, h: y1 - y0, paint }); continue; }
    const c = track(L.c), g = L.g, s = L.sc;
    g.setTransform(s, 0, 0, s, -xa * s, -y0 * s);
    paint(g);
    chunks.push({ c, x: xa, w: c.width / s, h: c.height / s });
  }
  return { chunks, y0, p };
}
function drawStrip(ctx, st, camX, S) {
  for (const ch of st.chunks) {
    const sx = ch.x - camX * st.p;
    if (sx > W || sx + ch.w < 0) continue;
    if (!ch.c) { ctx.save(); ctx.translate(sx - ch.x, 0); ch.paint(ctx); ctx.restore(); continue; }
    ctx.drawImage(ch.c, Math.round(sx * S) / S, st.y0, ch.w, ch.h);
  }
}
// sprites placed in the world: [{ spr, x, y }] at parallax p
function drawSprites(ctx, list, camX, S, p = 1) {
  for (const o of list) {
    const sx = o.x - camX * p;
    if (sx - o.spr.ox > W || sx - o.spr.ox + o.spr.w < 0) continue;
    if (o.flip) { ctx.save(); ctx.translate(Math.round(sx * S) / S, o.y); ctx.scale(-1, 1); ctx.drawImage(o.spr.c, -o.spr.ox, -o.spr.oy, o.spr.w, o.spr.h); ctx.restore(); }
    else ctx.drawImage(o.spr.c, Math.round((sx - o.spr.ox) * S) / S, o.y - o.spr.oy, o.spr.w, o.spr.h);
  }
}
function glowAt(ctx, spr, x, y, r, a, ry = r) {
  if (a <= 0.01 || x < -r || x > W + r) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(spr.c, x - r, y - ry, r * 2, ry * 2);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function poly(g, p) { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); }
function polyline(g, p) { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); }
// smooth closed curve through the midpoints of the control polygon (blobPath: as a subpath)
function blobPath(g, p) {
  const n = p.length >> 1;
  g.moveTo((p[(n - 1) * 2] + p[0]) / 2, (p[(n - 1) * 2 + 1] + p[1]) / 2);
  for (let i = 0; i < n; i++) { const j = ((i + 1) % n) * 2; g.quadraticCurveTo(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[j]) / 2, (p[i * 2 + 1] + p[j + 1]) / 2); }
  g.closePath();
}
function blob(g, p) { g.beginPath(); blobPath(g, p); }
function curve(g, p, move = true) {
  const n = p.length >> 1;
  if (move) { g.beginPath(); g.moveTo(p[0], p[1]); } else g.lineTo(p[0], p[1]);
  for (let i = 1; i < n - 1; i++) g.quadraticCurveTo(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[i * 2 + 2]) / 2, (p[i * 2 + 1] + p[i * 2 + 3]) / 2);
  g.lineTo(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
}
function roundRect(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
// Outline style: scenery uses a thinner line tinted to its section's dark colour so the actors (full INK) pop;
// breakable props keep the full INK style (buildItems).
let LINE = INK, LK = 1;
function lineStyle(col, k) { LINE = col; LK = k; }
// inked shape: a heavier offset line on the lower right (varied weight), flat fill, clipped inner shading, outline
function ink(g, build, fill, lw, inner, line = LINE) {
  lw *= LK;
  if (lw >= 1.8) { g.save(); g.translate(lw * 0.22, lw * 0.36); build(g); g.lineWidth = lw * 1.45; g.strokeStyle = line; g.stroke(); g.restore(); }
  build(g);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (inner) { g.save(); build(g); g.clip(); inner(g); g.restore(); }
  if (lw > 0) { build(g); g.lineWidth = lw; g.strokeStyle = line; g.stroke(); }
}
function strokeLine(g, pts, lw, col) { polyline(g, pts); g.lineWidth = lw; g.strokeStyle = col; g.stroke(); }
// midpoint displacement between a and b ([x, y]): an array of [x, y]
function mdp(a, b, R, depth, rough) {
  let pts = [a, b], amp = rough * Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let d = 0; d < depth; d++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], off = (R() * 2 - 1) * amp;
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
      np.push([(p[0] + q[0]) / 2 - (dy / l) * off, (p[1] + q[1]) / 2 + (dx / l) * off], q);
    }
    pts = np; amp *= 0.5;
  }
  return pts;
}
const flat = (pts) => { const o = []; for (const p of pts) o.push(p[0], p[1]); return o; };
function radialSprite(r, sc, stops) {
  return makeSprite(r * 2, r * 2, r, r, sc, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
  });
}
function vgrad(g, x, y0, w, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(x, y0, w, y1 - y0);
}
function lightPool(g, x, y, rx, ry, col, a) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.45, `rgba(${col},${a * 0.45})`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
}
const al = (x, st) => Math.floor(x / st) * st;   // world-aligned loop start (chunk-safe sampling)
// the layer-x range a parallax layer needs to fill the screen window [a - camX, b - camX] for every camera
function layerRange(a, b, p) {
  let lo = Infinity, hi = -Infinity;
  for (let cam = Math.max(0, a - W); ; cam = Math.min(cam + 8, CAM_MAX)) {
    const s0 = Math.max(0, a - cam), s1 = Math.min(W, b - cam);
    if (s1 > s0) { lo = Math.min(lo, s0 + cam * p); hi = Math.max(hi, s1 + cam * p); }
    if (cam >= Math.min(CAM_MAX, b)) break;
  }
  return [Math.floor(lo) - 12, Math.ceil(hi) + 12];
}
// a soft light band (screen-blended over the wall base and the floor's back half, under the fighters): the stages'
// readability light, after src/stages/mines.js C.mineLight / C.cavLight -- faded in and out at its ends
function lightBand(x0, x1, y0, y1, col, stops, fade, sc, extra) {
  return buildStrip(x0, x1, y0, y1, sc, 1, (g, xa, xb) => {
    const v = g.createLinearGradient(0, y0, 0, y1);
    for (const [o, a] of stops) v.addColorStop(o, `rgba(${col},${a})`);
    g.fillStyle = v; g.fillRect(xa, y0, xb - xa, y1 - y0);
    if (extra) extra(g, xa, xb);
    g.globalCompositeOperation = 'destination-out';
    if (fade[0] > 0) { const l = g.createLinearGradient(x0, 0, x0 + fade[0], 0); l.addColorStop(0, '#000'); l.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = l; g.fillRect(x0, y0, fade[0], y1 - y0); }
    if (fade[1] > 0) { const r = g.createLinearGradient(x1 - fade[1], 0, x1, 0); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, '#000'); g.fillStyle = r; g.fillRect(x1 - fade[1], y0, fade[1], y1 - y0); }
  });
}
// a section's screen window [a, b): clip to it; false if it's off screen
function secWin(ctx, a, b, y1 = H) {
  const x0 = Math.max(0, a), x1 = Math.min(W, b);
  if (x1 <= x0) return false;
  ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, y1); ctx.clip();
  return true;
}
// a front occluder (parallax P_FRONT about the screen centre) is kept only if no arena screen shows it -- nor the boss
// screen's right part (the return portal)
function frontX(wx, camX, pf) { return W / 2 + (wx - (camX + W / 2)) * pf; }
function clearOfArenas(wx, halfW, pf) {
  for (const cam of ARENAS) { const sx = frontX(wx, cam, pf); if (sx + halfW > -20 && sx - halfW < W + 20) return false; }
  return true;
}
// breakable props: built at the full device scale, full INK (they're interactive), plus a white flash copy
function whiteOf(spr, s) {
  return makeSprite(spr.w, spr.h, spr.ox, spr.oy, s, (g) => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(spr.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, spr.c.width, spr.c.height);
  });
}
function buildItems(s) {
  lineStyle(INK, 1);
  const it = {};
  for (const k of Object.keys(PROP_INFO)) {
    const info = PROP_INFO[k];
    const spr = makeSprite(info.w + 18, info.h + 18, info.w / 2 + 9, info.h + 9, s, (g) => PROP_DRAW[k](g));
    it[k] = { spr, white: whiteOf(spr, s) };
  }
  if (PROP_DRAW.wheel) { it.wheel = makeSprite(24, 24, 12, 12, s, (g) => PROP_DRAW.wheel(g)); it.wheelW = whiteOf(it.wheel, s); }
  return it;
}
function propAt(ctx, items, kind, sx, sy, opts, shadow) {
  const it = items[kind];
  if (!it) return;
  const flash = clamp((opts && opts.flash) || 0, 0, 1) * 0.7, shake = (opts && opts.shake) || 0;
  const dx = shake ? shake * Math.sin(performance.now() * 0.09) : 0;
  ctx.save();
  ctx.fillStyle = shadow;
  ctx.beginPath(); ctx.ellipse(sx, sy, PROP_INFO[kind].w * 0.55, 6, 0, 0, TAU); ctx.fill();
  const s = it.spr;
  ctx.drawImage(s.c, sx + dx - s.ox, sy - s.oy, s.w, s.h);
  if (flash > 0) { ctx.globalAlpha = flash; ctx.drawImage(it.white.c, sx + dx - s.ox, sy - s.oy, s.w, s.h); ctx.globalAlpha = 1; }
  if (kind === 'cart' && items.wheel) {
    const roll = (opts && opts.roll) || 0, w = items.wheel;
    for (const wx of [-20, 20]) {
      ctx.save(); ctx.translate(sx + dx + wx, sy - 10); ctx.rotate(roll / 10);
      ctx.drawImage(w.c, -w.ox, -w.oy, w.w, w.h);
      if (flash > 0) { ctx.globalAlpha = flash; ctx.drawImage(items.wheelW.c, -w.ox, -w.oy, w.w, w.h); }
      ctx.restore();
    }
  }
  ctx.restore();
}
// cache memory of a build: canvases still holding pixels
function memOf(list) {
  let px = 0, n = 0;
  for (const c of list || []) if (c.width * c.height > 1) { px += c.width * c.height; n++; }
  return { n, px };
}
// the stage object's scale / cache plumbing: build(cs, csFar) makes the scenery caches, buildItems(S) the props
function stageCaches(build) {
  const st = { S: 0, C: null, released: false };   // (released: kept so -- a resize only notes the scale -- until drawn on screen)
  st.setScale = (s) => {
    s = clamp(+s || 1, 0.5, 4);
    if (st.released) { st.S = s; return; }
    if (st.C && Math.abs(s - st.S) < 0.001) return;
    const prev = st.C;
    st.S = s;
    const cs = Math.min(STAGE_CS.near, Math.round(s * 4) / 4), csFar = Math.min(STAGE_CS.far, Math.round(s * 4) / 4);   // (STAGE_CS: lower on iOS)
    if (prev && prev.cs === cs && prev.csFar === csFar) {
      freeCanvases(prev.items); BUILT = []; prev.items = buildItems(s); prev.itemsBuilt = BUILT; BUILT = null; return;
    }
    if (prev) freeCanvases(prev);            // (the old scale's caches go now: iOS counts them until they shrink)
    const t0 = performance.now();
    BUILT = [];
    let C;
    try { C = build(cs, csFar); C.cs = cs; C.csFar = csFar; C.built = BUILT; BUILT = []; C.items = buildItems(s); C.itemsBuilt = BUILT; }
    finally { BUILT = null; }
    C.buildMs = performance.now() - t0;
    st.C = C;
  };
  st.ensure = () => { if (!st.C) { st.released = false; st.setScale(st.S || 1); } return st.C; };
  st.info = () => {
    const C = st.ensure(), a = memOf(C.built), b = memOf(C.itemsBuilt), px = a.px + b.px;
    return { canvases: a.n + b.n, megapixels: +(px / 1e6).toFixed(2), approxMB: +((px * 4) / 1048576).toFixed(1),
      sceneryMB: +((a.px * 4) / 1048576).toFixed(1), propsMB: +((b.px * 4) / 1048576).toFixed(1), buildMs: +C.buildMs.toFixed(0), cs: C.cs, csFar: C.csFar };
  };
  /** free the caches now (iOS: the canvas memory cap counts them until they shrink); the next draw rebuilds them */
  st.release = () => { if (st.C) freeCanvases(st.C); st.C = null; st.released = true; };
  return st;
}
// ---------------------------------------------------------------------------------------------------------------
// PALETTE, LAYOUT
// ---------------------------------------------------------------------------------------------------------------
const SKY = ['#e58ea4', '#f2aea2', '#f9cfab', '#fde6bf', '#fff4d6'];
const FIELD = { wheat: '#e6be56', wheatSh: '#c89a3a', wheatHi: '#f6dc8a', green: '#86bf5c', greenSh: '#5f9a42', greenHi: '#b2dc80', earth: '#b8804e', earthSh: '#8a5a34', hedge: '#4a7a3a', hedgeSh: '#335a28', hedgeHi: '#6e9e4e', road: '#ead2a0', roadSh: '#c9aa72' };
const LS = { far: ['#8a6a7a', 0.45], mid: ['#4e5a3a', 0.55], near: ['#3a2a1e', 0.66], front: ['#2a2016', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const HORIZON = 290;

const LAY = (() => {
  const R = mulberry(6401);
  const clouds = [];
  for (let i = 0; i < 7; i++) clouds.push({ x: R.r(0, 1600), y: R.r(30, 200), s: R.r(0.7, 1.25), v: i % 4, layer: i % 2, sp: R.r(3, 8) });
  const birds = [];
  for (let i = 0; i < 9; i++) birds.push({ x: R.r(0, 1400), y: R.r(150, 280), sp: R.r(30, 60), ph: R.r(0, TAU), s: R.r(0.7, 1.2) });
  const petals = [];
  for (let i = 0; i < 40; i++) petals.push({ x: R.r(0, 1100), y: R.r(0, 540), sp: R.r(0.4, 1.2), ph: R.r(0, TAU), c: i % 4 });
  const flowers = [];
  for (let i = 0; i < 70; i++) flowers.push({ x: R.r(0, 1600), y: R.r(498, 536), c: i % 5, s: R.r(0.8, 1.3) });
  const sparks = [];
  for (let i = 0; i < 30; i++) sparks.push({ y: R.r(220, 540), ph: R.r(0, TAU), sp: R.r(0.6, 1.6), dx: R.r(-40, 40) });
  return { clouds, birds, petals, flowers, sparks };
})();

// ---------------------------------------------------------------------------------------------------------------
// SHARED DRAWING BITS
// ---------------------------------------------------------------------------------------------------------------
// a looping strip: the layer content repeats every `lap` layer px (its draw is periodic: hashes taken mod a whole
// number of cells per lap, waves a whole number of cycles per lap, landmarks drawn at x + k * lap); built over
// [0, lap + W + margin]
function buildLoop(lap, y0, y1, sc, p, draw) {
  const st = buildStrip(0, lap + W + 16, y0, y1, sc, p, draw);
  st.lap = lap;
  return st;
}
function drawLoop(ctx, st, camX, S) {
  const off = ((camX * st.p) % st.lap + st.lap) % st.lap;
  for (const ch of st.chunks) {
    const sx = ch.x - off;
    if (sx > W || sx + ch.w < 0) continue;
    if (!ch.c) { ctx.save(); ctx.translate(sx - ch.x, 0); ch.paint(ctx); ctx.restore(); continue; }
    ctx.drawImage(ch.c, Math.round(sx * S) / S, st.y0, ch.w, ch.h);
  }
}
const loopX = (lx, camX, p, lap) => { let x = ((lx - camX * p) % lap + lap) % lap; if (x > lap - 600) x -= lap; return x; };
// lumpy puffs inked as one shape: every circle stroked, then all filled over -- only the outer silhouette keeps its line
function puffInk(g, puffs, fill, lw, inner) {
  const shape = () => { g.beginPath(); for (const [px, py, pr] of puffs) { g.moveTo(px + pr, py); g.arc(px, py, pr, 0, TAU); } };
  lw *= LK;
  g.save(); g.translate(lw * 0.22, lw * 0.36); shape(); g.lineWidth = lw * 2.4; g.strokeStyle = LINE; g.stroke(); g.restore();
  shape(); g.lineWidth = lw * 2; g.strokeStyle = LINE; g.stroke();
  shape(); g.fillStyle = fill; g.fill();
  if (inner) { g.save(); shape(); g.clip(); inner(g); g.restore(); }
}
function puffTree(g, x, y, r, seed, P = FIELD) {
  // a round leafy tree: trunk, three-four lumpy puffs, lit from the sun (right, low)
  const R = mulberry(seed);
  ink(g, (g) => roundRect(g, x - 3, y - r * 0.9, 6, r * 0.9, 2), '#6a4a30', 1.2);
  const puffs = [[x - r * 0.45, y - r * 1.1, r * 0.62], [x + r * 0.4, y - r * 1.15, r * 0.6], [x, y - r * 1.55, r * 0.7], [x + R.r(-4, 4), y - r * 1.05, r * 0.55]];
  puffInk(g, puffs, P.hedge, 1.4, (g) => { g.fillStyle = P.hedgeHi; for (const [px, py, pr] of puffs) { g.beginPath(); g.arc(px + pr * 0.25, py - pr * 0.25, pr * 0.6, 0, TAU); g.fill(); } g.fillStyle = rgba(P.hedgeSh, 0.55); for (const [px, py, pr] of puffs) { g.beginPath(); g.arc(px - pr * 0.15, py + pr * 0.35, pr * 0.85, 0.15 * Math.PI, 0.95 * Math.PI); g.arc(px, py - pr * 0.1, pr * 0.95, 0.9 * Math.PI, 0.1 * Math.PI, true); g.closePath(); g.fill(); } });
}
function cottage(g, x, y, w, h, seed, roofCol = '#d8b060') {
  // a thatched, half-timbered cottage (comic page 44): cream walls, dark beams, a deep straw roof, warm windows
  const R = mulberry(seed), rh = h * 0.9;
  ink(g, (g) => poly(g, [x - w / 2, y, x - w / 2, y - h, x + w / 2, y - h, x + w / 2, y]), '#efe2c4', 1.6, (g) => {
    g.fillStyle = '#d8c6a0'; g.fillRect(x + w * 0.15, y - h, w * 0.35, h);
    g.strokeStyle = '#5a3a24'; g.lineWidth = 2.2; for (const fx of [-0.5, -0.1, 0.25, 0.5]) { polyline(g, [x + fx * w, y, x + fx * w, y - h]); g.stroke(); }
    polyline(g, [x - w / 2, y - h * 0.5, x + w / 2, y - h * 0.5]); g.stroke(); polyline(g, [x - w / 2, y - h, x - w * 0.1, y - h * 0.5]); g.stroke();
    g.fillStyle = '#4a3020'; roundRect(g, x + w * 0.28, y - h * 0.55, w * 0.14, h * 0.55, 2); g.fill();
    g.fillStyle = '#ffd98a'; g.fillRect(x - w * 0.36, y - h * 0.4, w * 0.16, h * 0.22); g.strokeStyle = '#5a3a24'; g.lineWidth = 1.2; g.strokeRect(x - w * 0.36, y - h * 0.4, w * 0.16, h * 0.22);
  });
  ink(g, (g) => { g.beginPath(); g.moveTo(x - w / 2 - 8, y - h + 6); g.quadraticCurveTo(x - w * 0.3, y - h - rh * 0.9, x, y - h - rh); g.quadraticCurveTo(x + w * 0.3, y - h - rh * 0.9, x + w / 2 + 8, y - h + 6); g.quadraticCurveTo(x, y - h + 12, x - w / 2 - 8, y - h + 6); g.closePath(); }, roofCol, 1.8, (g) => {
    g.fillStyle = mix(roofCol, '#8a6a30', 0.35); g.fillRect(x, y - h - rh, w, rh + 14);
    g.strokeStyle = rgba('#8a6a30', 0.6); g.lineWidth = 1.2; for (let k = -3; k <= 3; k++) { polyline(g, [x + k * w * 0.1, y - h - rh * (0.95 - Math.abs(k) * 0.1), x + k * w * 0.16, y - h + 6]); g.stroke(); }
    g.fillStyle = rgba('#fff2c0', 0.5); g.fillRect(x - w / 2 - 8, y - h + 2, w + 16, 4);
  });
  if (R() > 0.4) ink(g, (g) => poly(g, [x + w * 0.2, y - h - rh * 0.55, x + w * 0.2, y - h - rh * 0.9, x + w * 0.32, y - h - rh * 0.9, x + w * 0.32, y - h - rh * 0.45]), '#a07060', 1.4);
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0, color = 1;
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    // (built nearest first: under a memory cap the first caches keep the full scale, the far layers step down)
    c.near = buildLoop(NEAR_LAP, 330, H, cs, P_NEAR, (g, xa, xb) => { setLS('near'); drawNear(g, xa, xb); });
    c.marks = [
      { spr: makeSprite(320, 230, 160, 200, cs, (g) => { setLS('near'); mill(g, 0, 0); }), lx: MILL_LX, y: 410 },
      { spr: makeSprite(820, 280, 410, 210, cs, (g) => { setLS('near'); village(g, 0, 0); }), lx: VILLAGE_LX, y: 420 },
      { spr: makeSprite(540, 310, 270, 270, cs, (g) => { setLS('near'); oakHill(g, 0, 0); }), lx: OAK_LX, y: 430 },
    ];
    c.sails = makeSprite(150, 150, 75, 75, cs, (g) => { setLS('near'); millSails(g); });
    c.mid = buildLoop(MID_LAP, 262, 430, csFar, P_MIDL, (g, xa, xb) => { setLS('mid'); drawMid(g, xa, xb); });
    c.far = buildLoop(FAR_LAP, 230, 366, csFar, P_FARH, (g, xa, xb) => { setLS('far'); drawFar(g, xa, xb); });
    c.mountain = makeSprite(520, 220, 260, 210, csFar, (g) => { setLS('far'); drawMountain(g); });
    c.clouds = [0, 1, 2, 3].map((v) => cloudSprite(220 + v * 50, 80 + v * 10, 0.75, 31 + v));
    c.flowerOpen = [0, 1, 2, 3, 4].map((v) => makeSprite(20, 30, 10, 28, Math.max(1, cs), (g) => { setLS('front'); flower(g, v, 1); }));
    c.flowerBud = makeSprite(20, 30, 10, 28, Math.max(1, cs), (g) => { setLS('front'); flower(g, 0, 0); });
    c.flowerBudGrey = makeSprite(20, 30, 10, 28, Math.max(1, cs), (g) => { setLS('front'); flower(g, 0, 0, true); });
    c.sun = radialSprite(64, 0.5, [[0, 'rgba(255,253,236,1)'], [0.18, 'rgba(255,244,200,0.9)'], [0.45, 'rgba(255,214,160,0.35)'], [1, 'rgba(255,190,150,0)']]);
    c.spark = makeSprite(24, 24, 12, 12, Math.max(1, cs), (g) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 8); gr.addColorStop(0, 'rgba(255,246,200,0.9)'); gr.addColorStop(1, 'rgba(255,220,140,0)');
      g.fillStyle = gr; g.fillRect(-12, -12, 24, 24);
      g.fillStyle = '#ffffff'; poly(g, [0, -11, 1.4, -1.4, 11, 0, 1.4, 1.4, 0, 11, -1.4, 1.4, -11, 0, -1.4, -1.4]); g.fill();
    });
    return c;
  }
  function cloudSprite(w, h, sc, seed) {
    return makeSprite(w + 40, h + 40, (w + 40) / 2, (h + 40) / 2, sc, (g) => {
      const R = mulberry(seed), puffs = [];
      for (let i = 0; i < 8; i++) { const u = (i + 0.5) / 8; puffs.push([(u - 0.5) * w + R.r(-10, 10), R.r(-h * 0.15, h * 0.15), h * (0.32 + R() * 0.22) * (1 - Math.abs(u - 0.5) * 0.8)]); }
      const shape = (dy = 0) => { g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r, y + dy); g.arc(x, y + dy, r, 0, TAU); } };
      shape(); g.strokeStyle = 'rgba(255,248,226,0.95)'; g.lineWidth = 6; g.stroke();
      shape(3); g.fillStyle = '#f7c4be'; g.fill();
      g.save(); shape(3); g.clip(); const gr = g.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, 'rgba(255,236,220,0.6)'); gr.addColorStop(1, 'rgba(214,140,160,0.75)'); g.fillStyle = gr; g.fillRect(-w, -h, w * 2, h * 2); g.restore();
    });
  }

  // ------------------------------------------------------------------ the land
  function drawMountain(g) {
    // Mystic Mountain far behind: dark, its top broken where the tower stood; the storm gone, a last wisp of green cloud
    ink(g, (g) => poly(g, [-260, 10, -120, -110, -60, -150, -30, -176, -12, -168, 4, -186, 20, -170, 60, -146, 140, -90, 260, 10]), '#8a7a96', 1.6, (g) => {
      g.fillStyle = '#7a6a88'; poly(g, [4, -186, 20, -170, 60, -146, 140, -90, 260, 10, 0, 10]); g.fill();
      g.fillStyle = rgba('#f4d8e0', 0.5); poly(g, [-60, -150, -30, -176, -12, -168, -40, -120]); g.fill();
    });
    g.fillStyle = 'rgba(160,190,170,0.35)'; g.beginPath(); g.ellipse(30, -190, 60, 10, 0, 0, TAU); g.fill();
    vgrad(g, -260, -100, 520, 10, [[0, 'rgba(250,214,200,0)'], [1, 'rgba(250,214,200,0.7)']]);
  }
  function drawFar(g, xa, xb) {
    const top = (x) => 296 - 28 * (0.5 + 0.5 * Math.sin((x / FAR_LAP) * TAU * 3 + 1)) - 12 * Math.sin((x / FAR_LAP) * TAU * 7);
    g.beginPath(); g.moveTo(xa - 4, 370); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, top(x)); g.lineTo(xb + 4, 370); g.closePath();   // (down past the near land's edge: no gap)
    g.fillStyle = '#b8a0b4'; g.fill();
    g.save(); g.clip(); vgrad(g, xa - 2, 250, xb - xa + 4, 368, [[0, 'rgba(252,224,200,0.1)'], [1, 'rgba(252,224,200,0.75)']]); g.restore();   // (the haze only on the hills: no edge in the sky)
  }
  function drawMid(g, xa, xb) {
    // rolling hills, patchwork fields over them, hedgerows, little trees (periodic in MID_LAP)
    const L = MID_LAP, f = (x) => (x / L) * TAU;
    const top = (x) => 316 - 22 * Math.sin(f(x) * 4 + 0.5) - 12 * Math.sin(f(x) * 9 + 2);
    const hill = (g) => { g.beginPath(); g.moveTo(xa - 4, 440); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, top(x)); g.lineTo(xb + 4, 440); g.closePath(); };
    ink(g, hill, '#9cc06c', 1.4, (g) => {
      const n = 40, cw = L / n;   // (fields: a whole number per lap)
      for (let i = Math.floor(xa / cw) - 1; i * cw < xb + cw; i++) {
        const j = ((i % n) + n) % n, x = i * cw;
        for (let r = 0; r < 4; r++) {
          const y = top(x + cw / 2) + 10 + r * 26, h2 = hash2(j, r);
          const col = h2 < 0.33 ? FIELD.wheat : h2 < 0.66 ? '#9cc874' : h2 < 0.85 ? '#c99a62' : '#b8d48a';
          g.fillStyle = col; poly(g, [x, y, x + cw, y - 2, x + cw + 4, y + 24, x - 2, y + 26]); g.fill();
          g.strokeStyle = rgba(FIELD.hedge, 0.85); g.lineWidth = 3; polyline(g, [x, y, x + cw, y - 2]); g.stroke();
        }
        if (hash1(j * 7) > 0.55) puffTree(g, x + hash1(j * 3) * cw, top(x) + 14, 9 + hash1(j * 5) * 5, j);
      }
      vgrad(g, xa, 290, xb - xa, 440, [[0, 'rgba(255,230,200,0.35)'], [1, 'rgba(255,230,200,0)']]);
    });
  }
  function millSails(g) {
    for (let k = 0; k < 4; k++) {
      g.save(); g.rotate(k * Math.PI / 2);
      ink(g, (g) => poly(g, [-3, 0, 3, 0, 3, -70, -3, -70]), '#6a4a30', 1.4);
      ink(g, (g) => poly(g, [3, -14, 22, -16, 22, -68, 3, -70]), '#f2e6c8', 1.4, (g) => { g.strokeStyle = '#8a6a48'; g.lineWidth = 1; for (let y = -24; y > -68; y -= 11) { polyline(g, [3, y, 22, y - 1]); g.stroke(); } polyline(g, [12, -15, 12, -69]); g.stroke(); });
      g.restore();
    }
    ink(g, (g) => { g.beginPath(); g.arc(0, 0, 7, 0, TAU); }, '#5a3a24', 1.4);
  }
  function flower(g, v, open, grey = false) {
    const cols = ['#ff7a9a', '#ffd84a', '#b48aff', '#ff9a4a', '#ffffff'];
    strokeLine(g, [0, 0, 1, -14, 0, -22], 2.4, grey ? '#6e706c' : '#4a8a3a');
    ink(g, (g) => { g.beginPath(); g.ellipse(-5, -10, 5, 2.4, -0.5, 0, TAU); }, grey ? '#8a8c88' : '#6aaa4a', 1);
    if (!open) { ink(g, (g) => { g.beginPath(); g.ellipse(0, -24, 3.4, 5, 0, 0, TAU); }, grey ? '#9a9c98' : '#8aa070', 1.2); return; }
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; ink(g, (g) => { g.beginPath(); g.ellipse(Math.cos(a) * 4.5, -24 + Math.sin(a) * 4.5, 3.6, 3.6, 0, 0, TAU); }, cols[v], 1); }
    ink(g, (g) => { g.beginPath(); g.arc(0, -24, 2.6, 0, TAU); }, v === 1 ? '#e88a2a' : '#ffd84a', 1);
  }
  function drawNear(g, xa, xb) {
    // the land below: field bands with crop rows, hedges with trees, the road, the mill, the village, the oak hill
    const L = NEAR_LAP;
    // the land's far edge: a soft, wavy line of hedge and copse (periodic in L), the land filled below it
    const edge = (x) => 344 - 5 * Math.sin((x / L) * TAU * 11 + 1) - 4 * Math.sin((x / L) * TAU * 29);
    const land = (g) => { g.beginPath(); g.moveTo(xa - 4, H + 4); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, edge(x)); g.lineTo(xb + 4, H + 4); g.closePath(); };
    land(g); g.save(); g.clip();
    vgrad(g, xa - 2, 330, xb - xa + 4, H, [[0, '#a8cc78'], [1, '#78ac54']]);
    const n = 24, cw = L / n;                     // (fields: a whole number per lap)
    const rows = [[350, 34], [384, 42], [426, 52], [478, 62]];
    for (let i = Math.floor(xa / cw) - 1; i * cw < xb + cw; i++) {
      const j = ((i % n) + n) % n, x0 = i * cw;
      for (let r = 0; r < rows.length; r++) {
        const [y, h] = rows[r], kind = hash2(j, r + 3), sk = (hash2(j, r + 9) - 0.5) * 30;
        const pts = [x0 + sk, y, x0 + cw + sk, y, x0 + cw + sk * 1.3, y + h, x0 + sk * 1.3, y + h];
        if (kind < 0.4) {   // wheat: gold with rows
          g.fillStyle = FIELD.wheat; poly(g, pts); g.fill();
          g.strokeStyle = FIELD.wheatSh; g.lineWidth = 1.6; for (let k = 1; k < 6; k++) { const yy = y + (h * k) / 6; polyline(g, [x0 + sk, yy, x0 + cw + sk * 1.1, yy]); g.stroke(); }
          g.fillStyle = rgba(FIELD.wheatHi, 0.6); g.fillRect(x0 + sk, y + 1, cw, 3);
        } else if (kind < 0.72) {   // meadow
          g.fillStyle = FIELD.green; poly(g, pts); g.fill();
          for (let k = 0; k < 8; k++) { const fx = x0 + hash2(j * 7 + k, r) * cw, fy = y + 6 + hash2(k, j + r) * (h - 10); g.fillStyle = rgba(FIELD.greenHi, 0.7); g.beginPath(); g.ellipse(fx, fy, 10, 2.5, 0, 0, TAU); g.fill(); }
        } else if (kind < 0.88) {   // ploughed earth
          g.fillStyle = FIELD.earth; poly(g, pts); g.fill();
          g.strokeStyle = FIELD.earthSh; g.lineWidth = 2; for (let k = 1; k < 5; k++) { const yy = y + (h * k) / 5; polyline(g, [x0 + sk, yy, x0 + cw + sk * 1.1, yy]); g.stroke(); }
        } else {   // a flower meadow
          g.fillStyle = '#9ccc6a'; poly(g, pts); g.fill();
          for (let k = 0; k < 14; k++) { const fx = x0 + hash2(j * 5 + k, r + 2) * cw, fy = y + 5 + hash2(k + 3, j + r) * (h - 8); g.fillStyle = ['#ff7a9a', '#ffd84a', '#b48aff', '#ffffff'][k % 4]; g.beginPath(); g.arc(fx, fy, 2.4, 0, TAU); g.fill(); }
        }
        // the hedge along the field's top edge, a tree now and then
        g.strokeStyle = LINE; g.lineWidth = 7; polyline(g, [x0 + sk, y, x0 + cw + sk, y]); g.stroke();
        g.strokeStyle = FIELD.hedge; g.lineWidth = 5; g.stroke();
        g.strokeStyle = FIELD.hedgeHi; g.lineWidth = 2; polyline(g, [x0 + sk, y - 1.5, x0 + cw + sk, y - 1.5]); g.stroke();
        if (hash2(j, r + 20) > 0.7 && r < 3) puffTree(g, x0 + hash2(j, r + 21) * cw, y + 2, 12 + r * 4, j * 10 + r);
      }
    }
    // the road winding through (periodic)
    const roadY = (x) => 440 + 46 * Math.sin((x / L) * TAU * 3) + 14 * Math.sin((x / L) * TAU * 7);
    g.lineCap = 'round';
    g.beginPath(); for (let x = al(xa, 8) - 8; x <= xb + 8; x += 8) g.lineTo(x, roadY(x)); g.strokeStyle = LINE; g.lineWidth = 20 * LK + 2; g.stroke(); g.strokeStyle = FIELD.road; g.lineWidth = 18; g.stroke(); g.strokeStyle = rgba(FIELD.roadSh, 0.7); g.lineWidth = 2; g.stroke();
    // landmarks
    // (the landmarks are sprites, drawn over this strip: they stand taller than it)
    vgrad(g, xa - 2, 330, xb - xa + 4, 380, [[0, 'rgba(255,226,196,0.45)'], [1, 'rgba(255,226,196,0)']]);
    g.restore();
    // the far edge itself: little puff-trees and a hedge line along it
    land(g); g.strokeStyle = LINE; g.lineWidth = 1.4; g.save(); g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, edge(x)); g.stroke(); g.restore();
    const nE = 60, ce = L / nE;
    for (let i = Math.floor(xa / ce) - 1; i * ce < xb + ce; i++) { const j = ((i % nE) + nE) % nE; if (hash1(j * 13 + 5) < 0.5) continue; const x = i * ce + hash1(j * 3) * ce * 0.6; puffTree(g, x, edge(x) + 3, 6 + hash1(j * 7) * 4, j + 700); }
  }
  function mill(g, x, y) {
    // the old mill: a stone tower on a green rise, a thatched cap (its sails turn live)
    g.fillStyle = '#9ccc6a'; g.beginPath(); g.ellipse(x, y + 10, 150, 34, 0, Math.PI, 0); g.fill();
    ink(g, (g) => poly(g, [x - 34, y, x - 24, y - 130, x + 24, y - 130, x + 34, y]), '#d8c8a8', 2, (g) => {
      for (let yy = y; yy > y - 130; yy -= 14) { g.fillStyle = rgba('#8a7a5a', 0.5); g.fillRect(x - 40, yy, 80, 1.4); }
      g.fillStyle = rgba('#a8987a', 0.6); g.fillRect(x + 8, y - 130, 30, 130);
      g.fillStyle = '#5a3a24'; roundRect(g, x - 9, y - 30, 18, 30, 6); g.fill();
      g.fillStyle = '#ffd98a'; g.fillRect(x - 6, y - 92, 12, 14);
    });
    ink(g, (g) => { g.beginPath(); g.moveTo(x - 32, y - 126); g.quadraticCurveTo(x - 20, y - 170, x, y - 176); g.quadraticCurveTo(x + 20, y - 170, x + 32, y - 126); g.closePath(); }, '#c99a4a', 2, (g) => { g.fillStyle = '#a87a34'; g.fillRect(x, y - 180, 40, 60); });
  }
  function village(g, x, y) {
    // the village: cottages along the road, the church tower, bunting strung for the party, the square
    g.fillStyle = '#e8d6a8'; g.beginPath(); g.ellipse(x, y + 26, 300, 40, 0, 0, TAU); g.fill();
    const R = mulberry(2401);
    const spots = [];
    for (let k = 0; k < 11; k++) spots.push([x - 360 + k * 70 + R.r(-12, 12), y + R.r(-24, 26), R.r(44, 60), R.r(28, 36), R.pick(['#d8b060', '#c9a050', '#e0bc6a'])]);
    spots.sort((a, b) => a[1] - b[1]);
    // the church at the back
    const cx = x + 30, cy = y - 30;
    ink(g, (g) => poly(g, [cx - 22, cy, cx - 22, cy - 90, cx + 22, cy - 90, cx + 22, cy]), '#e8dcc0', 2, (g) => { g.fillStyle = '#cfc0a0'; g.fillRect(cx + 6, cy - 90, 16, 90); g.fillStyle = '#5a3a24'; g.fillRect(cx - 6, cy - 70, 12, 18); });
    ink(g, (g) => poly(g, [cx - 28, cy - 88, cx, cy - 150, cx + 28, cy - 88]), '#b8503a', 2, (g) => { g.fillStyle = '#8a3a2a'; poly(g, [cx, cy - 150, cx + 28, cy - 88, cx + 2, cy - 88]); g.fill(); });
    strokeLine(g, [cx, cy - 150, cx, cy - 166], 2, '#5a3a24'); strokeLine(g, [cx - 6, cy - 160, cx + 6, cy - 160], 2, '#5a3a24');
    for (const s of spots) cottage(g, s[0], s[1], s[2], s[3], (s[0] | 0), s[4]);
    // bunting between the rooftops
    const flags = ['#ff6a6a', '#ffd84a', '#6ab0ff', '#7ad06a', '#ff9ad0'];
    for (let k = 0; k < spots.length - 1; k++) {
      const [x0, y0, w0, h0] = spots[k], [x1, y1, w1, h1] = spots[k + 1];
      if (Math.abs(x1 - x0) > 120) continue;
      const ax = x0, ay = y0 - h0 - 14, bx = x1, by = y1 - h1 - 14;
      g.strokeStyle = '#5a3a24'; g.lineWidth = 1; g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 14, bx, by); g.stroke();
      for (let f = 1; f < 6; f++) { const u = f / 6, px = lerp(ax, bx, u), py = lerp(ay, by, u) + Math.sin(u * Math.PI) * 12; g.fillStyle = flags[(k + f) % 5]; poly(g, [px - 3, py, px + 3, py, px, py + 7]); g.fill(); }
    }
  }
  function oakHill(g, x, y) {
    // the hill with Shadow's oak: a broad old tree on a green rise
    // (a soft rise: outlined over its top only, its foot fading into the fields -- no flat base)
    g.beginPath(); g.ellipse(x, y + 40, 260, 90, 0, Math.PI, 0); g.closePath(); g.fillStyle = '#8cc464'; g.fill();
    g.save(); g.beginPath(); g.ellipse(x, y + 40, 260, 90, 0, Math.PI, 0); g.clip(); g.fillStyle = '#a8d47a'; g.beginPath(); g.ellipse(x - 40, y - 30, 160, 30, 0, Math.PI, 0); g.fill(); g.restore();
    g.beginPath(); g.ellipse(x, y + 40, 260, 90, 0, Math.PI * 1.03, Math.PI * 1.97); g.strokeStyle = LINE; g.lineWidth = 1.8 * LK + 0.4; g.stroke();
    for (let k = 0; k < 26; k++) { const a = Math.PI * (1.06 + 0.88 * (k / 25)), gx = x + Math.cos(a) * 258, gy = y + 40 + Math.sin(a) * 88; g.strokeStyle = '#5e9a42'; g.lineWidth = 1.6; polyline(g, [gx - 3, gy + 1, gx - 4, gy - 6]); g.stroke(); polyline(g, [gx + 1, gy + 1, gx + 2, gy - 7]); g.stroke(); }
    g.save(); g.globalCompositeOperation = 'destination-out';   // (the sprite's own canvas -- or the live scratch: composite-safe)
    const fade = g.createLinearGradient(0, y + 8, 0, y + 40); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade; g.fillRect(x - 270, y + 8, 540, 34); g.restore();
    const tx = x + 10, ty = y - 40;
    ink(g, (g) => { g.beginPath(); g.moveTo(tx - 18, ty); g.quadraticCurveTo(tx - 12, ty - 60, tx - 30, ty - 110); g.lineTo(tx - 14, ty - 116); g.quadraticCurveTo(tx, ty - 80, tx + 6, ty - 110); g.lineTo(tx + 22, ty - 104); g.quadraticCurveTo(tx + 12, ty - 60, tx + 20, ty); g.closePath(); }, '#7a5236', 2, (g) => { g.fillStyle = '#5e3e28'; g.fillRect(tx + 4, ty - 120, 20, 120); });
    // the long low branch Shadow hangs from
    strokeLine(g, [tx - 10, ty - 70, tx - 70, ty - 82, tx - 110, ty - 78], 9 * LK + 4, LINE); strokeLine(g, [tx - 10, ty - 70, tx - 70, ty - 82, tx - 110, ty - 78], 8, '#7a5236');
    const crown = [[tx - 70, ty - 130, 46], [tx - 10, ty - 160, 56], [tx + 54, ty - 128, 46], [tx - 30, ty - 110, 40], [tx + 30, ty - 104, 38], [tx - 100, ty - 100, 30]];
    puffInk(g, crown, '#5a9a42', 2, (g) => { g.fillStyle = '#7cba58'; for (const [px, py, r] of crown) { g.beginPath(); g.arc(px + r * 0.25, py - r * 0.25, r * 0.65, 0, TAU); g.fill(); } g.fillStyle = rgba('#3e7030', 0.55); for (const [px, py, pr] of crown) { g.beginPath(); g.arc(px - pr * 0.15, py + pr * 0.35, pr * 0.85, 0.15 * Math.PI, 0.95 * Math.PI); g.arc(px, py - pr * 0.1, pr * 0.95, 0.9 * Math.PI, 0.1 * Math.PI, true); g.closePath(); g.fill(); } });
  }

  // ------------------------------------------------------------------ per frame
  function sky(ctx, C, camX, t) {
    const gr = ctx.createLinearGradient(0, 0, 0, HORIZON + 30);
    gr.addColorStop(0, SKY[0]); gr.addColorStop(0.3, SKY[1]); gr.addColorStop(0.6, SKY[2]); gr.addColorStop(0.85, SKY[3]); gr.addColorStop(1, SKY[4]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, HORIZON + 60);
    const sx = 760, sy = 250;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 10; k++) {
      const a = Math.PI + 0.1 + k * 0.32 + Math.sin(t * 0.2 + k) * 0.02, l = 1100;
      ctx.fillStyle = `rgba(255,236,190,${0.05 + 0.025 * Math.sin(t * 0.6 + k * 2)})`;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a - 0.05) * l, sy + Math.sin(a - 0.05) * l); ctx.lineTo(sx + Math.cos(a + 0.05) * l, sy + Math.sin(a + 0.05) * l); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    glowAt(ctx, C.sun, sx, sy, 340, 0.75); glowAt(ctx, C.sun, sx, sy, 80, 1);
  }
  function clouds(ctx, C, camX, t, layer) {
    for (const cl of LAY.clouds) {
      if (cl.layer !== layer) continue;
      const spr = C.clouds[cl.v], p = layer ? 0.12 : 0.04;
      const x = ((cl.x - camX * p - t * cl.sp) % 1600 + 1600) % 1600 - 300;
      ctx.globalAlpha = layer ? 0.95 : 0.8;
      ctx.drawImage(spr.c, x - spr.ox * cl.s, cl.y - spr.oy * cl.s, spr.w * cl.s, spr.h * cl.s);
    }
    ctx.globalAlpha = 1;
  }
  function birds(ctx, camX, t) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const b of LAY.birds) {
      const x = ((b.x - camX * 0.3 - t * b.sp) % 1400 + 1400) % 1400 - 200, y = b.y + Math.sin(t * 0.8 + b.ph) * 10, f = Math.sin(t * 7 + b.ph) * 5 * b.s;
      ctx.globalAlpha = 0.55; ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x - 9 * b.s, y - f); ctx.quadraticCurveTo(x - 4 * b.s, y - 4 * b.s, x, y); ctx.quadraticCurveTo(x + 4 * b.s, y - 4 * b.s, x + 9 * b.s, y - f); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  // the grey beyond the colour wave: everything right of the front desaturated, a sparkling edge
  const waveX = () => lerp(-160, W + 160, color);
  function greyPass(ctx, y0, y1) {
    const fx = waveX();
    if (fx >= W + 80) return;
    ctx.save();
    const gr = ctx.createLinearGradient(fx - 70, 0, fx + 70, 0);
    gr.addColorStop(0, 'rgba(128,128,128,0)'); gr.addColorStop(1, 'rgba(128,128,128,1)');
    ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = gr; ctx.fillRect(Math.max(0, fx - 70), y0, W - Math.max(0, fx - 70), y1 - y0);
    // a little darker and flatter too (the storm's grey)
    const g2 = ctx.createLinearGradient(fx - 70, 0, fx + 70, 0);
    g2.addColorStop(0, 'rgba(150,150,156,0)'); g2.addColorStop(1, 'rgba(150,150,156,0.22)');
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = g2; ctx.fillRect(Math.max(0, fx - 70), y0, W - Math.max(0, fx - 70), y1 - y0);
    ctx.restore();
  }
  function waveSparks(ctx, C, t) {
    const fx = waveX();
    if (fx < -60 || fx > W + 60) return;
    for (const s of LAY.sparks) {
      const tw = Math.sin(t * 3 * s.sp + s.ph);
      if (tw < 0.2) continue;
      const r = 6 + tw * 8, x = fx + s.dx + Math.sin(t * s.sp + s.ph) * 10, y = s.y + Math.sin(t * 0.8 + s.ph) * 6;
      ctx.globalAlpha = tw; ctx.drawImage(C.spark.c, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }
  function meadow(ctx, C, camX, t) {
    // the near meadow at the very bottom (p 1.3): a green bank, grass tufts, flowers opening behind the wave
    const off = camX * 1.3, fx = waveX();
    ctx.save();
    const mg = ctx.createLinearGradient(fx - 70, 0, fx + 70, 0); mg.addColorStop(0, '#5e9a42'); mg.addColorStop(1, '#7c7e7a');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.moveTo(0, H + 4);
    for (let x = 0; x <= W + 10; x += 10) { const wx = x + off; ctx.lineTo(x, 508 + 6 * Math.sin(wx * 0.012) + 4 * Math.sin(wx * 0.031)); }
    ctx.lineTo(W, H + 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a2016'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    for (const f of LAY.flowers) {
      const x = ((f.x - off) % 1600 + 1600) % 1600 - 320;
      if (x < -20 || x > W + 20) continue;
      const open = sstep(fx + 40, fx - 140, x);   // (left of the front: opened)
      const spr = open > 0.5 ? C.flowerOpen[f.c] : x > fx + 30 ? C.flowerBudGrey : C.flowerBud, sc = f.s * (open > 0.5 ? 0.7 + 0.3 * open : 1);
      ctx.drawImage(spr.c, x - spr.ox * sc, f.y - spr.oy * sc, spr.w * sc, spr.h * sc);
    }
  }
  function petals(ctx, camX, t) {
    const fx = waveX(), cols = ['#ff9ab4', '#ffe07a', '#c8a8ff', '#ffffff'];
    for (const p of LAY.petals) {
      const x = ((p.x - camX * 1.1 - t * 50 * p.sp) % 1100 + 1100) % 1100 - 70;
      if (x > fx) continue;
      const y = ((p.y + Math.sin(t * p.sp + p.ph) * 30 + t * 12) % 560 + 560) % 560;
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 * p.sp + p.ph); ctx.fillStyle = cols[p.c]; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 1.8, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  }

  function drawBack(ctx, camX = 0, t = 0) {
    const C = st.ensure(), s = S();
    camX = +camX || 0;
    ctx.save();
    ctx.fillStyle = SKY[3]; ctx.fillRect(0, 0, W, H);
    sky(ctx, C, camX, t);
    clouds(ctx, C, camX, t, 0);
    // the mountain far behind (slides off to the left over the ride)
    const mx = 140 - ((camX % RIDE_LEN) + RIDE_LEN) % RIDE_LEN * 0.02;
    ctx.globalAlpha = 0.75; ctx.drawImage(C.mountain.c, mx - C.mountain.ox * 0.7, 300 - C.mountain.oy * 0.7, C.mountain.w * 0.7, C.mountain.h * 0.7); ctx.globalAlpha = 1;
    drawLoop(ctx, C.far, camX, s);
    clouds(ctx, C, camX, t, 1);
    drawLoop(ctx, C.mid, camX, s);
    drawLoop(ctx, C.near, camX, s);
    for (const m of C.marks) { const x = loopX(m.lx, camX, P_NEAR, NEAR_LAP); if (x - m.spr.ox > W + 20 || x - m.spr.ox + m.spr.w < -20) continue; ctx.drawImage(m.spr.c, Math.round((x - m.spr.ox) * s) / s, m.y - m.spr.oy, m.spr.w, m.spr.h); }
    // the mill's sails turning
    const mlx = loopX(MILL_LX, camX, P_NEAR, NEAR_LAP);
    if (mlx > -120 && mlx < W + 120) { ctx.save(); ctx.translate(mlx, 410 - 132); ctx.rotate(t * 0.8); ctx.drawImage(C.sails.c, -C.sails.ox, -C.sails.oy, C.sails.w, C.sails.h); ctx.restore(); }
    greyPass(ctx, 0, H);   // (one pass, the whole frame: no seam across a tree or the hills)
    birds(ctx, camX, t);
    waveSparks(ctx, C, t);
    ctx.restore();
  }
  function drawFront(ctx, camX = 0, t = 0) {
    const C = st.ensure();
    camX = +camX || 0;
    ctx.save();
    meadow(ctx, C, camX, t);
    petals(ctx, camX, t);
    ctx.restore();
  }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  /** the colour wave: 0 all grey .. 1 all colour (the front crosses the screen left to right) */
  function setColor(k) { color = clamp(+k, 0, 1); if (Number.isNaN(color)) color = 1; }
  function setStorm() { /* (no storm over the valley at dawn) */ }
  function flashOf() { return 0; }
  function drawRoof() { /* (the sky-duel engine's roof pass: nothing here) */ }
  return { setScale: st.setScale, setWarm, setColor, setStorm, flashOf, drawRoof, drawBack, drawFront, drawProp() {}, info: st.info, release: st.release, get warm() { return warm; } };
}

// (no breakable props in the sky; the toolkit's prop plumbing wants the tables)
export const PROP_INFO = {};
const PROP_DRAW = {};
