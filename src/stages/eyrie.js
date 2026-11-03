// Dodongo's Quest - secret stage "THE EYRIE" (src/stages/eyrie.js): background, floor, wind and breakable props.
//
// Above Stormspire's storm, up the cloud bridge the three gongs call (docs/SECRETS.md): a sunlit sea of cloud tops,
// rock spires crowned with giant woven nests, prayer-flag lines streaming in the wind.
//
// Sections (world x):  steps 0-1200 (the Cloud Steps: a causeway of flat stone slabs, cairns and prayer poles)  |
// roost 1200-2400 (the Feather Roost: nests with eggs on the rocks behind the path, feathers everywhere)  |  nest
// 2400-3600 (the Great Nest: the path runs into a giant woven nest; the wyvern alpha's arena is the last screen, its
// right part kept clear for the return portal).
//
// Back-to-front (drawBack): the sky (live gradient + sun) -> far clouds (p 0.05) -> far spires (p 0.1) -> the far cloud
// sea (p 0.18) -> spires with nests (p 0.4) + far birds + the spires' prayer lines -> the near cloud sea (p 0.7) ->
// rocks, nests, prayer poles, the Great Nest's rim (1.0) + live prayer lines -> the floor (1.0) -> back wind streaks
// and feathers.   drawFront: near wind streaks and feathers (no occluders: the sky is the backdrop).
// windGust(k) (0..1, from the engine's gust things, as stormspire.js): cloth, streaks and feathers whip for ~1 s.
// Every static element is cached per scale (chunked strips + sprites, src/canvasmem.js); animated bits are live.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 3600;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'steps', name: 'The Cloud Steps', x0: 0, x1: 1200 },
  { id: 'roost', name: 'The Feather Roost', x0: 1200, x1: 2400 },
  { id: 'nest', name: 'The Great Nest', x0: 2400, x1: 3600 },
];
export const ARENAS = [500, 1600, CAM_MAX];
export const WAYSTONES = [1420];
const ROOST = 1200, NEST0 = 2400;
const POLES = [150, 560, 980];                       // prayer poles on the Cloud Steps (world x)
const NESTS = [[1320, 0], [1760, 1], [2160, 0]];     // nests on rocks behind the Feather Roost path [x, variant]
const EGGS = [[3010, 0], [3290, 1]];                 // the Great Nest's giant eggs, against its back rim
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES, nest: NEST0, gust: [1300, 2300], portalX: CAM_MAX + 780 };

// ---------------------------------------------------------------------------------------------------------------
// TOOLKIT (the same block in frozen.js, crystal.js, eyrie.js and hollow.js; after src/stages/mines.js)
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
const P_CL = 0.05, P_FAR = 0.1, P_SEA = 0.18, P_MID = 0.4, P_NEAR = 0.7;
const GT0 = 330;
const ROCKE = { base: '#a3979e', sh: '#7b7083', hi: '#cbc0c0', crack: '#5a4f62' };
const ROCK_MID = { base: '#9a8fa2', sh: '#766c88', hi: '#c2b8c2', crack: '#5a5070' };
const TWIG = { base: '#8a6a44', sh: '#5f4529', hi: '#b48e5c', straw: '#dcbc78', strawSh: '#b8955a', dark: '#4a3420' };
const CLOUD = { top: '#fffaf0', body: '#f3f1f9', sh: '#d3d4ec', deep: '#b9bde0', rim: '#ffe9c4' };
const PRAYER = ['#4f7fc0', '#f1e8d4', '#b8392e', '#3f9a7e', '#e2b24c'];
const LS = { far: ['#7e86ac', 0.45], mid: ['#5c5374', 0.55], near: ['#3e3448', 0.62] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);

const LAY = (() => {
  const R = mulberry(5200);
  const clouds = [];
  for (let i = 0; i < 7; i++) clouds.push({ x: R.r(0, 1700), y: R.r(100, 220), sp: R.r(3, 7), k: i % 5 });
  const birds = [];
  for (let i = 0; i < 5; i++) birds.push({ x: R.r(0, 1400), y: R.r(120, 220), sp: R.r(10, 22), ph: R.r(0, TAU), s: R.r(0.6, 1) });
  const streaks = [];
  for (let i = 0; i < 40; i++) streaks.push({ x: R.r(0, 1200), y: R.r(60, 520), sp: R.r(0.7, 1.4), len: R.r(40, 120), ph: R.r(0, 1), layer: i < 26 ? 0 : 1 });
  const feathers = [];
  for (let i = 0; i < 12; i++) feathers.push({ x: R.r(0, 1100), y: R.r(0, 560), sp: R.r(0.5, 1.2), ph: R.r(0, TAU), k: i % 3, layer: i < 8 ? 0 : 1 });
  return { clouds, birds, streaks, feathers };
})();
// the spires' prayer lines in the mid layer: [layer x a, y a, layer x b, y b, sag, flags, seed]
const spireTop = (i) => 70 + hash1(i * 13 + 2) * 90;
const spireX = (i) => i * 205 + hash1(i * 7 + 1) * 80;
const MID_LINES = [];
for (let i = -1; i < 12; i++) if (hash1(i * 41 + 5) > 0.4) MID_LINES.push([spireX(i) + 24, spireTop(i) + 8, spireX(i + 1) - 24, spireTop(i + 1) + 8, 16 + hash1(i) * 10, 9, i + 2]);

// ---------------------------------------------------------------------------------------------------------------
// SHARED DRAWING BITS
// ---------------------------------------------------------------------------------------------------------------
function facets(g, xs, xe, ys, ye, P, seed, cw = 64, ch = 40, crackA = 0.7, vary = 0.8) {
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
      poly(g, p); g.fillStyle = mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * vary); g.fill();
      poly(g, [p[0], p[1], p[2], p[3], p[4], p[5], cx + rx * 0.08, cy - ry * 0.02]); g.fillStyle = rgba(P.hi, 0.42); g.fill();
      poly(g, [p[6], p[7], p[8], p[9], p[10], p[11], cx, cy + ry * 0.1]); g.fillStyle = rgba(P.sh, 0.5); g.fill();
      poly(g, p); g.strokeStyle = rgba(P.crack, crackA); g.lineWidth = 1.2; g.stroke();
    }
  }
}
// cloud puffs [x, y, r] -> the union's top edge at x (Infinity where no puff reaches)
function puffTop(puffs, x) {
  let best = Infinity;
  for (const [px, py, r] of puffs) { const d = x - px; if (d * d < r * r) best = Math.min(best, py - Math.sqrt(r * r - d * d)); }
  return best;
}
// a row of cloud puffs along topFn over [xa, xb] down to y1: one outline round the whole bank (not every puff), sunlit
// tops, lilac undersides (chunk-safe: world-aligned)
function cloudBank(g, xa, xb, topFn, y1, step, seed, P = CLOUD, lw = 1.4) {
  const puffs = [];
  for (let i = Math.floor((xa - step * 2) / step); i * step < xb + step * 2; i++) {
    const x = i * step + hash2(i, seed) * step * 0.5, r = step * (0.55 + hash2(i, seed + 3) * 0.45);
    puffs.push([x, topFn(x) + r * 0.85, r]);
  }
  const x0 = xa - 6, x1 = xb + 6, top = [];
  for (let x = Math.floor(x0 / 3) * 3; x <= x1 + 3; x += 3) { const y = puffTop(puffs, x); top.push(x, Number.isFinite(y) ? y : topFn(x) + step); }
  const shape = (g) => { g.beginPath(); g.moveTo(top[0], y1 + 10); for (let i = 0; i < top.length; i += 2) g.lineTo(top[i], top[i + 1]); g.lineTo(top[top.length - 2], y1 + 10); g.closePath(); };
  let ymin = Infinity; for (let i = 1; i < top.length; i += 2) ymin = Math.min(ymin, top[i]);
  ink(g, shape, P.body, 0, (g) => {
    vgrad(g, x0, ymin, x1 - x0, y1, [[0, P.top], [0.35, P.body], [0.75, P.sh], [1, P.deep]]);
    for (const [x, y, r] of puffs) {
      g.fillStyle = rgba(P.sh, 0.5); g.beginPath(); g.ellipse(x + r * 0.25, y + r * 0.62, r * 0.9, r * 0.3, 0, 0, TAU); g.fill();
      g.strokeStyle = rgba(P.rim, 0.9); g.lineWidth = 2.6; g.beginPath(); g.arc(x, y + 1.5, r - 2, Math.PI * 1.15, Math.PI * 1.7); g.stroke();
    }
  });
  g.beginPath(); g.moveTo(top[0], top[1]); for (let i = 2; i < top.length; i += 2) g.lineTo(top[i], top[i + 1]);
  g.lineWidth = lw * LK; g.strokeStyle = LINE; g.stroke();
}
// a woven mass of sticks inside the current path (clip): crossing twigs, light and dark, straw -- world-aligned cells,
// each seeded by its own position, so strip chunks join without a seam
function weave(g, xa, xb, ya, yb, seed, dens = 1) {
  g.fillStyle = TWIG.base; g.fillRect(xa - 4, ya - 4, xb - xa + 8, yb - ya + 8);
  const cell = 24, per = Math.max(1, Math.round(4.1 * dens));
  for (let j = Math.floor((ya - 30) / cell); j * cell < yb + 30; j++) {
    for (let i = Math.floor((xa - 70) / cell); i * cell < xb + 70; i++) {
      for (let k = 0; k < per; k++) {
        const h = (n) => hash2(i * 7 + k * 131 + n, j * 13 + seed);
        const x = (i + h(1)) * cell, y = (j + h(2)) * cell, a = (h(3) - 0.5) + (h(4) < 0.5 ? 0 : Math.PI), l = 26 + h(5) * 44;
        const c = h(6), col = c < 0.3 ? TWIG.dark : c < 0.62 ? TWIG.sh : c < 0.9 ? TWIG.hi : TWIG.straw;
        g.strokeStyle = col; g.lineWidth = 1.6 + h(7) * 2;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 + (h(8) - 0.5) * 8, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    }
  }
}
// the Dragon Clan's coiled-dragon mark (as on the road's banners)
function clanMark(g, cx, cy, r, col) {
  g.save(); g.translate(cx, cy); g.scale(r / 18, r / 18);
  g.strokeStyle = col; g.lineWidth = 2.4; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.stroke();
  g.fillStyle = col; g.beginPath(); g.moveTo(8, -12); g.quadraticCurveTo(14, -6, 6, -2); g.quadraticCurveTo(-8, 3, -4, 10); g.quadraticCurveTo(0, 14, 8, 11);
  g.lineTo(6, 14); g.quadraticCurveTo(-6, 17, -9, 9); g.quadraticCurveTo(-11, 0, 2, -5); g.quadraticCurveTo(7, -7, 4, -10); g.closePath(); g.fill();
  g.restore();
}
// a feather (origin = quill end), pointing along +x before rotation
function feather(g, len, w, col, sh, a = 0, lw = 1.3) {
  g.save(); g.rotate(a);
  ink(g, (g) => { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.3, -w, len, -w * 0.15); g.quadraticCurveTo(len * 0.55, w * 0.9, 0, 0); g.closePath(); }, col, lw, (g) => {
    g.fillStyle = sh; g.beginPath(); g.moveTo(0, 0); g.lineTo(len, -w * 0.12); g.quadraticCurveTo(len * 0.55, w * 0.9, 0, 0); g.fill();
    g.strokeStyle = rgba('#ffffff', 0.5); g.lineWidth = 1; for (let k = 1; k < 5; k++) { const x = len * k / 5; polyline(g, [x, -w * 0.05, x + len * 0.06, -w * 0.55]); g.stroke(); }
  });
  strokeLine(g, [0, 0, len * 0.96, -w * 0.13], 1.2, rgba('#4a3a30', 0.7));
  g.restore();
}
function egg(g, rx, ry, col, spot, seed) {
  ink(g, (g) => { g.beginPath(); g.ellipse(0, -ry, rx, ry, 0, 0, TAU); }, col, 2, (g) => {
    g.fillStyle = rgba('#000000', 0.12); g.beginPath(); g.ellipse(rx * 0.35, -ry * 0.85, rx * 0.8, ry * 1.05, 0, 0, TAU); g.fill();
    const R = mulberry(seed);
    for (let k = 0; k < 14; k++) { g.fillStyle = rgba(spot, 0.7); g.beginPath(); g.ellipse(R.r(-rx, rx) * 0.8, -R.r(0.15, 1.8) * ry, R.r(2, 5), R.r(1.5, 4), R.r(0, 3), 0, TAU); g.fill(); }
    g.fillStyle = rgba('#ffffff', 0.75); g.beginPath(); g.ellipse(-rx * 0.4, -ry * 1.45, rx * 0.18, ry * 0.12, -0.5, 0, TAU); g.fill();
  });
}
// a nest: a woven bowl (origin = bottom centre), eggs in it
function nest(g, w, h, eggs, seed) {
  const bowl = (g) => { g.beginPath(); g.moveTo(-w / 2, -h * 0.7); g.quadraticCurveTo(-w * 0.5, h * 0.2, 0, 0); g.quadraticCurveTo(w * 0.5, h * 0.2, w / 2, -h * 0.7); g.quadraticCurveTo(0, -h * 0.95, -w / 2, -h * 0.7); g.closePath(); };
  for (const [ex, rx, col, spot] of eggs) { g.save(); g.translate(ex, -h * 0.6); egg(g, rx, rx * 1.25, col, spot, seed + ex); g.restore(); }
  ink(g, bowl, TWIG.base, 2, (g) => {
    weave(g, -w / 2 - 10, w / 2 + 10, -h, 4, seed, 1.6);
    vgrad(g, -w / 2, -h, w, 4, [[0, 'rgba(255,240,200,0.22)'], [1, 'rgba(40,24,10,0.35)']]);
  });
  const R = mulberry(seed + 9);
  for (let k = 0; k < 16; k++) { const x = R.r(-w / 2, w / 2), y = -h * 0.72 + R.r(-4, 6), a = R.r(-0.6, 0.6) + (R() < 0.5 ? 0 : Math.PI); strokeLine(g, [x, y, x + Math.cos(a) * R.r(12, 26), y + Math.sin(a) * R.r(8, 16)], R.r(1.6, 2.6), R() < 0.5 ? TWIG.hi : TWIG.sh); }
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0;
  const st = stageCaches(build);
  const S = () => st.S;
  // wind: a base by section, a slow natural gusting, plus the engine's gusts (windGust) decaying over ~1 s
  let gustK = 0, gustT0 = -99, curT = 0;
  const gustAt = (t) => { const d = t - gustT0; if (d < 0 || d > 4) return 0; return gustK * (d < 0.14 ? d / 0.14 : Math.exp(-(d - 0.14) * 2.4)); };
  function windGust(k) { gustK = Math.max(gustAt(curT), clamp(+k || 0, 0, 1.5)); gustT0 = curT; }
  const windAt = (camX, t) => 0.35 + 0.2 * sstep(ROOST - 400, ROOST + 400, camX + W / 2) + 0.12 * Math.sin(t * 0.45) * Math.sin(t * 0.17 + 1) + 1.1 * gustAt(t);

  function build(cs, csFar) {
    const c = {};
    const fr = layerRange(0, LEVEL_LEN, P_FAR), sr = layerRange(0, LEVEL_LEN, P_SEA), mr = layerRange(0, LEVEL_LEN, P_MID), nr = layerRange(0, LEVEL_LEN, P_NEAR);
    c.far = buildStrip(fr[0], fr[1], 110, 372, csFar, P_FAR, (g, xa, xb) => { setLS('far'); drawFarSpires(g, xa, xb); });
    c.sea = buildStrip(sr[0], sr[1], 226, 372, csFar, P_SEA, (g, xa, xb) => { setLS('far'); cloudBank(g, xa, xb, (x) => 262 + 10 * Math.sin(x * 0.013) + 8 * vnoise(x, 41, 3), 380, 46, 11, { ...CLOUD, top: '#fff6e8', body: '#eceaf6', sh: '#cdd0ea', deep: '#c2c6e6' }, 1.1); });
    c.mid = buildStrip(mr[0], mr[1], 20, 372, csFar, P_MID, (g, xa, xb) => { setLS('mid'); drawMidSpires(g, xa, xb); });
    c.near = buildStrip(nr[0], nr[1], 276, 372, csFar, P_NEAR, (g, xa, xb) => { setLS('mid'); cloudBank(g, xa, xb, (x) => 304 + 9 * Math.sin(x * 0.011 + 2) + 8 * vnoise(x, 37, 7), 380, 58, 23, CLOUD, 1.4); });
    c.rim = buildStrip(NEST0 - 90, LEVEL_LEN + 10, 200, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawNestRim(g, xa, xb); });
    c.ground = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawGround(g, xa, xb); });
    // near sprites: the causeway's back stones and cairns, prayer poles, the roost's rocks and nests
    setLS('near');
    c.pole = makeSprite(60, 230, 30, 222, cs, (g) => { setLS('near'); drawPole(g); });
    c.cairn = makeSprite(80, 80, 40, 72, cs, (g) => { setLS('near'); drawCairn(g, 11); });
    c.slabs = [0, 1].map((k) => makeSprite(260, 90, 130, 78, cs, (g) => { setLS('near'); drawBackSlabs(g, 21 + k * 7); }));
    c.nests = [0, 1].map((k) => makeSprite(300, 230, 150, 214, cs, (g) => { setLS('near'); drawRoostRock(g, k); }));
    c.cloud = [0, 1, 2, 3, 4].map((k) => cloudSprite(k, Math.min(1, csFar)));
    c.back = [];
    for (const [i, x] of POLES.entries()) { c.back.push({ spr: c.slabs[i % 2], x: x + 40, y: 368 }); c.back.push({ spr: c.cairn, x: x + 150, y: 360 }); }
    for (const [x, k] of NESTS) c.back.push({ spr: c.nests[k], x, y: 368, flip: x === 2160 });
    c.poles = POLES.map((x) => ({ spr: c.pole, x, y: 362 }));
    c.eggs = EGGS.map(([x, k]) => ({ spr: makeSprite(100, 120, 50, 108, cs, (g) => {
      lineStyle('#6a5848', 0.5); egg(g, 34, 44, mix(k ? '#b9e0e8' : '#f6e6c8', '#c8b8a4', 0.4), mix(k ? '#5a8aa0' : '#b07a4a', '#a89880', 0.4), 31 + k);
    }), x, y: rimTop(x) + 48 }));
    c.sun = radialSprite(120, 1, [[0, 'rgba(255,250,225,1)'], [0.22, 'rgba(255,240,200,0.75)'], [0.5, 'rgba(255,220,160,0.22)'], [1, 'rgba(255,210,150,0)']]);
    c.flag = makeSprite(54, 40, 0, 0, cs, (g) => { setLS('near'); ink(g, (g) => { g.beginPath(); g.moveTo(1, 2); g.lineTo(52, 6); g.lineTo(44, 20); g.lineTo(52, 34); g.lineTo(1, 36); g.closePath(); }, '#b8392e', 1.6, (g) => { g.fillStyle = '#8a2a22'; g.fillRect(0, 26, 54, 12); clanMark(g, 22, 19, 13, '#e2b24c'); }); });
    c.feather = [['#f6f2ea', '#c9c2d8'], ['#6f9fd8', '#4a6fa8'], ['#e8964a', '#b8662a']].map(([col, sh]) => makeSprite(40, 16, 4, 8, Math.max(1, cs), (g) => { lineStyle('#4a3a40', 0.7); feather(g, 32, 7, col, sh, 0, 1); }));
    return c;
  }
  function cloudSprite(k, sc) {
    const R = mulberry(700 + k * 31), w = R.r(180, 320), h = w * R.r(0.3, 0.42);
    return makeSprite(w + 30, h + 30, 15, 15, sc, (g) => {
      setLS('far');
      const puffs = [], n = 5 + Math.floor(R() * 4);
      for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, r = h * (0.3 + R() * 0.24) * (1 - Math.abs(u - 0.5) * 0.9); puffs.push([w * (0.08 + u * 0.84) + R.r(-10, 10), h - r * (0.9 + R() * 0.4), r]); }
      const top = [];
      for (let x = 0; x <= w; x += 3) { const y = puffTop(puffs, x); top.push(x, Number.isFinite(y) ? Math.min(y, h - 6) : h - 6); }
      const shape = (g) => { g.beginPath(); g.moveTo(top[0], h); for (let i = 0; i < top.length; i += 2) g.lineTo(top[i], top[i + 1]); g.lineTo(w, h); g.quadraticCurveTo(w / 2, h + 6, 0, h); g.closePath(); };
      ink(g, shape, CLOUD.body, 1.2, (g) => {
        vgrad(g, 0, 0, w, h + 6, [[0, CLOUD.top], [0.55, CLOUD.body], [1, CLOUD.sh]]);
        g.strokeStyle = rgba(CLOUD.rim, 0.9); g.lineWidth = 2.4; for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y + 1.5, r - 2, Math.PI * 1.15, Math.PI * 1.7); g.stroke(); }
      });
    });
  }

  // ------------------------------------------------------------------ deep layers
  function drawFarSpires(g, xa, xb) {
    for (let i = Math.floor((xa - 120) / 95); i * 95 < xb + 120; i++) {
      const x = i * 95 + hash1(i * 7 + 3) * 50, top = 150 + hash1(i * 11) * 110, w = 26 + hash1(i * 5) * 30;
      const P = { body: mix('#aab7d8', '#c4cce4', hash1(i * 3)), sh: '#8e9cc4' };
      ink(g, (g) => poly(g, [x - w * 0.7, 380, x - w * 0.5, top + 30, x - w * 0.3, top + 4, x + w * 0.2, top, x + w * 0.45, top + 22, x + w * 0.7, 380]), P.body, 1.2, (g) => {
        g.fillStyle = P.sh; g.fillRect(x + 2, top, w, 300);
        g.fillStyle = rgba('#ffffff', 0.7); poly(g, [x - w * 0.5, top + 30, x - w * 0.3, top + 4, x + w * 0.2, top, x + w * 0.4, top + 16, x, top + 12, x - w * 0.4, top + 34]); g.fill();
      });
      if (hash1(i * 17) > 0.6) { g.fillStyle = '#9a8a76'; g.beginPath(); g.ellipse(x, top + 2, w * 0.4, 5, 0, 0, TAU); g.fill(); }
    }
    vgrad(g, xa - 2, 200, xb - xa + 4, 372, [[0, 'rgba(240,236,248,0)'], [1, 'rgba(240,236,248,0.6)']]);
  }
  function drawMidSpires(g, xa, xb) {
    for (let i = Math.floor((xa - 200) / 205); i * 205 < xb + 200; i++) {
      const x = spireX(i), top = spireTop(i), w = 70 + hash1(i * 5 + 2) * 50, seed = 600 + i;
      const R = mulberry(seed);
      const lp = mdp([x - w * 0.62, 390], [x - w * 0.42, top + 10], R, 3, 0.07), rp = mdp([x + w * 0.42, top + 6], [x + w * 0.6, 390], R, 3, 0.07);
      const outline = flat(lp.concat(rp));
      const build = (g) => poly(g, outline);
      ink(g, build, ROCK_MID.base, 1.8, (g) => {
        facets(g, x - w, x + w, top - 10, 390, ROCK_MID, seed, 46, 30, 0.45, 0.7);
        g.fillStyle = rgba(ROCK_MID.sh, 0.55); g.fillRect(x + w * 0.1, top, w, 400);
        // strata
        g.strokeStyle = rgba(ROCK_MID.crack, 0.35); g.lineWidth = 1.4;
        for (let y = top + 34; y < 380; y += 26 + R() * 14) { polyline(g, [x - w, y, x + w, y + R.r(-4, 4)]); g.stroke(); }
        // little carved steps up the sunlit side of some spires
        if (hash1(i * 23) > 0.55) for (let y = 350, k = 0; y > top + 50; y -= 30, k++) {
          const sx = x - w * 0.42 + (k % 2) * 8 + (350 - y) * 0.05;
          g.fillStyle = rgba('#efe6e0', 0.85); g.fillRect(sx, y, 16, 3); g.fillStyle = rgba(ROCK_MID.crack, 0.5); g.fillRect(sx, y + 3, 16, 2);
        }
      });
      // the woven nest on top (some with eggs)
      g.save(); g.translate(x, top + 14);
      nest(g, w * 1.1, 34, hash1(i * 29) > 0.5 ? [[-8, 9, '#f2e2c4', '#a8784a'], [10, 8, '#cfe6ea', '#6a8aa0']] : [], seed);
      g.restore();
      // cloud wisps wrapping the base
      cloudBank(g, x - w * 1.3, x + w * 1.3, (xx) => 318 + 8 * Math.sin(xx * 0.05 + i), 380, 30, seed, { ...CLOUD, deep: CLOUD.sh }, 1);
    }
  }

  // ------------------------------------------------------------------ near: rocks, nests, poles, the Great Nest's rim
  function drawPole(g) {
    // a prayer pole: a weathered post with a little dragon finial and a red-gold banner
    ink(g, (g) => poly(g, [-4, 0, -3, -206, 3, -206, 4, 0]), '#7a5a3e', 1.8, (g) => { g.fillStyle = '#5a3e28'; g.fillRect(0, -210, 6, 214); });
    ink(g, (g) => poly(g, [-6, -206, 6, -206, 4, -214, 0, -222, -4, -214]), '#e2b24c', 1.6);
    ink(g, (g) => blob(g, [-16, 2, -12, -10, 0, -14, 12, -10, 16, 2]), ROCKE.base, 1.6, (g) => { g.fillStyle = ROCKE.sh; g.fillRect(2, -16, 18, 20); });
  }
  function drawCairn(g, seed) {
    const R = mulberry(seed);
    let y = 0;
    for (let k = 0; k < 4; k++) {
      const w = 26 - k * 5 + R.r(-2, 2), h = 12 - k * 1.5;
      ink(g, (g) => { g.beginPath(); g.ellipse(R.r(-2, 2), y - h / 2, w, h / 2 + 1, 0, 0, TAU); }, mix(ROCKE.base, ROCKE.hi, R() * 0.6), 1.6, (g) => { g.fillStyle = rgba(ROCKE.sh, 0.6); g.fillRect(0, y - h, w, h + 2); });
      y -= h - 1;
    }
  }
  function drawBackSlabs(g, seed) {
    // tilted stone slabs and boulders along the causeway's back edge, a tuft of mountain grass
    const R = mulberry(seed);
    for (let k = 0; k < 4; k++) {
      const x = -110 + k * 70 + R.r(-10, 10), w = R.r(34, 52), h = R.r(26, 50), lean = R.r(-8, 8);
      ink(g, (g) => poly(g, [x - w / 2, 4, x - w / 2 + lean, -h, x + w / 2 + lean, -h - R.r(-6, 6), x + w / 2, 4]), ROCKE.base, 1.8, (g) => {
        g.fillStyle = ROCKE.sh; g.fillRect(x + w * 0.15, -h - 10, w, h + 20); g.fillStyle = rgba(ROCKE.hi, 0.8); g.fillRect(x - w / 2, -h - 6, w, 4);
      });
    }
    for (let k = 0; k < 9; k++) { const x = R.r(-120, 120); strokeLine(g, [x, 4, x + R.r(-6, 10), R.r(-14, -24)], 1.6, '#8aa05a'); }
  }
  function drawRoostRock(g, k) {
    const R = mulberry(40 + k);
    const w = 220 + k * 30, h = 70 + k * 30;
    const pts = [-w / 2, 6, -w * 0.44, -h * 0.6, -w * 0.2, -h * 0.95, w * 0.1, -h, w * 0.38, -h * 0.75, w / 2, 6];
    ink(g, (g) => blob(g, pts), ROCKE.base, 2, (g) => {
      facets(g, -w / 2, w / 2, -h - 10, 10, ROCKE, 81 + k, 50, 30, 0.5, 0.8);
      g.fillStyle = rgba(ROCKE.sh, 0.5); g.fillRect(w * 0.1, -h, w, h + 10);
      // droppings-free, just lichen
      for (let j = 0; j < 7; j++) { g.fillStyle = rgba('#c8b85a', 0.5); g.beginPath(); g.ellipse(R.r(-w / 2, w / 3), R.r(-h * 0.8, -10), R.r(4, 9), R.r(3, 6), 0, 0, TAU); g.fill(); }
    });
    g.save(); g.translate(-w * 0.05, -h * 0.92);
    nest(g, 140 + k * 20, 44, k ? [[-26, 12, '#e4d6bc', '#a08060'], [0, 13, '#bcd2d6', '#6a8a98']] : [[-12, 12, '#e4d6bc', '#a08060']], 90 + k);
    g.restore();
    g.save(); g.translate(w * 0.32, -h * 0.4); feather(g, 54, 11, '#6f9fd8', '#4a6fa8', -1.9); g.restore();
    g.save(); g.translate(-w * 0.36, -h * 0.25); feather(g, 40, 9, '#f6f2ea', '#c9c2d8', -1.2); g.restore();
  }
  const rimTop = (x) => lerp(406, 236 + 18 * Math.sin((x - NEST0) * 0.004 + 0.4) + 10 * vnoise(x, 29, 5), sstep(NEST0 - 70, NEST0 + 200, x));
  function drawNestRim(g, xa, xb) {
    // the Great Nest's back rim: a wall of woven branches rising behind the floor, feathers tucked in, straw tufts
    const build = (g) => { g.beginPath(); g.moveTo(xa - 4, 380); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, rimTop(x)); g.lineTo(xb + 4, 380); g.closePath(); };
    ink(g, build, TWIG.base, 2, (g) => {
      weave(g, xa, xb, 200, 380, 7, 1.0);
      vgrad(g, xa, 220, xb - xa, 372, [[0, 'rgba(255,236,190,0.3)'], [0.45, 'rgba(236,214,170,0.3)'], [0.8, 'rgba(200,170,120,0.18)'], [1, 'rgba(40,22,8,0.3)']]);
      // horizontal bands of bigger branches give it shape
      for (let r = 0; r < 4; r++) {
        const y0 = 262 + r * 28;
        g.strokeStyle = rgba(r % 2 ? TWIG.hi : TWIG.sh, 0.7); g.lineWidth = 4;
        g.beginPath(); for (let x = al(xa, 10) - 10; x <= xb + 10; x += 10) g.lineTo(x, Math.max(rimTop(x) + 10, y0 + 6 * Math.sin(x * 0.02 + r * 1.7) + (rimTop(x) - 236) * 0.4)); g.stroke();
      }
    });
    // twig ends sticking out of the top, giant feathers tucked in
    for (let i = Math.floor(xa / 14) - 2; i * 14 < xb + 30; i++) {
      const x = i * 14 + hash1(i * 7) * 10, y = rimTop(x) + 4, a = -Math.PI / 2 + (hash1(i * 3) - 0.5) * 2.2, l = 12 + hash1(i * 5) * 22;
      strokeLine(g, [x, y, x + Math.cos(a) * l, y + Math.sin(a) * l], 2.2, hash1(i * 11) < 0.5 ? TWIG.hi : TWIG.sh);
    }
    for (const [x, k, a] of [[NEST0 + 140, 1, -2.2], [NEST0 + 520, 0, -2.5], [NEST0 + 860, 2, -2.0], [NEST0 + 1130, 1, -1.2]]) {
      if (x < xa - 120 || x > xb + 120) continue;
      const cols = [['#f6f2ea', '#c9c2d8'], ['#6f9fd8', '#4a6fa8'], ['#e8964a', '#b8662a']][k];
      g.save(); g.translate(x, rimTop(x) + 40); feather(g, 110, 20, cols[0], cols[1], a, 1.8); g.restore();
    }
    for (let i = Math.floor(xa / 90) - 1; i * 90 < xb + 90; i++) {
      const x = i * 90 + hash1(i * 19) * 50, y = rimTop(x) + 6;
      g.fillStyle = TWIG.straw; for (let k = 0; k < 6; k++) { g.save(); g.translate(x + k * 4 - 10, y); g.rotate(-0.9 + k * 0.35); g.fillRect(-1, -16, 2, 16); g.restore(); }
    }
  }

  // ------------------------------------------------------------------ the floor
  function drawGround(g, xa, xb) {
    // the base colour by section: stone (steps), rock and straw (roost), woven straw (the Great Nest)
    vgrad(g, xa - 2, 354, xb - xa + 4, H, [[0, '#b8aeb2'], [0.12, '#d2c8c6'], [0.6, '#dcd2cc'], [1, '#c8bcb8']]);
    // Cloud Steps: big flat slabs with joints (world-aligned rows)
    if (xa < ROOST + 120) {
      const x1 = Math.min(xb, ROOST + 120);
      const rows = [[362, 386], [386, 416], [416, 452], [452, 494], [494, 528]];
      g.save(); g.beginPath(); g.rect(xa - 4, 354, x1 - xa + 4, H); g.clip();
      for (let r = 0; r < rows.length; r++) {
        const [ya, yb] = rows[r], sw = 150 + r * 14, off = hash1(r * 31 + 3) * sw;
        for (let i = Math.floor((xa - off) / sw) - 1; i * sw + off < x1 + sw; i++) {
          const x0 = i * sw + off + (hash2(i, r) - 0.5) * 30, xe = (i + 1) * sw + off + (hash2(i + 1, r) - 0.5) * 30;
          const h = hash2(i * 3, r * 5 + 1);
          g.fillStyle = mix('#d6ccc8', h < 0.5 ? '#bfb3b4' : '#e8e0da', Math.abs(h - 0.5) * 1.2);
          roundRect(g, x0 + 2.5, ya + 2, xe - x0 - 5, yb - ya - 3, 5); g.fill();
          g.fillStyle = rgba('#ffffff', 0.4); g.fillRect(x0 + 6, ya + 2.5, xe - x0 - 12, 1.6);
          g.fillStyle = rgba('#8a7e86', 0.35); g.fillRect(x0 + 4, yb - 3, xe - x0 - 8, 1.6);
        }
      }
      g.restore();
    }
    // the Feather Roost: rock floor with straw, down and little eggshell bits
    if (xb > ROOST - 60 && xa < NEST0 + 80) {
      const x0 = Math.max(xa, ROOST - 60), x1 = Math.min(xb, NEST0 + 80);
      const seam = (y) => ROOST + 40 + (y - 362) * 0.3 + 6 * Math.sin(y * 0.08);
      g.save(); g.beginPath(); g.moveTo(seam(354), 354); for (let y = 354; y <= H; y += 8) g.lineTo(seam(y), y); g.lineTo(x1 + 4, H); g.lineTo(x1 + 4, 354); g.closePath(); g.clip();
      vgrad(g, x0 - 2, 354, x1 - x0 + 4, H, [[0, '#ad9f9e'], [0.12, '#c6b8b2'], [0.6, '#cfc1b8'], [1, '#bbaca6']]);
      const rows = [[362, 388], [388, 420], [420, 458], [458, 500], [500, 530]];
      for (let r = 0; r < rows.length; r++) {
        const [ya, yb] = rows[r], sw = 110 + r * 16, off = hash1(r * 37 + 9) * sw;
        for (let i = Math.floor((x0 - off) / sw) - 1; i * sw + off < x1 + sw; i++) {
          const xs = i * sw + off + (hash2(i, r + 40) - 0.5) * 40, xe = (i + 1) * sw + off + (hash2(i + 1, r + 40) - 0.5) * 40, h = hash2(i * 5, r * 3 + 7);
          g.fillStyle = mix('#c8bab4', h < 0.5 ? '#b2a4a2' : '#dcd0c8', Math.abs(h - 0.5) * 1.1);
          blob(g, [xs + 4, ya + 4, (xs + xe) / 2, ya + 1 + h * 3, xe - 4, ya + 4, xe - 2, (ya + yb) / 2, xe - 5, yb - 2, (xs + xe) / 2, yb - 1, xs + 4, yb - 3, xs + 2, (ya + yb) / 2]); g.fill();
          g.fillStyle = rgba('#ffffff', 0.3); g.fillRect(xs + 10, ya + 3, xe - xs - 20, 1.4);
          if (h > 0.7) strokeLine(g, [xs + (xe - xs) * 0.3, ya + 4, xs + (xe - xs) * 0.36, (ya + yb) / 2, xs + (xe - xs) * 0.3, yb - 4], 1.2, rgba('#7a6c72', 0.5));
        }
      }
      for (let i = Math.floor((x0 - 60) / 26); i * 26 < x1 + 60; i++) {
        const x = i * 26 + hash1(i * 5) * 20, y = 368 + hash1(i * 9) * 160, h = hash1(i * 13);
        if (h < 0.45) { g.save(); g.translate(x, y); g.rotate(hash1(i) * 3); g.fillStyle = rgba(TWIG.straw, 0.85); g.fillRect(-8, -0.8, 16, 1.6); g.fillStyle = rgba(TWIG.strawSh, 0.8); g.fillRect(-5, 2, 11, 1.4); g.restore(); }
        else if (h < 0.55) { g.fillStyle = rgba('#f6f2ea', 0.9); g.beginPath(); g.ellipse(x, y, 4, 2.4, hash1(i * 3), 0, TAU); g.fill(); }
        else if (h < 0.6) { g.fillStyle = '#f2e2c4'; poly(g, [x - 4, y, x - 1, y - 4, x + 1, y - 1, x + 4, y - 3, x + 3, y + 1]); g.fill(); }
      }
      g.restore();
    }
    // the Great Nest's woven floor: soft straw, twigs lying flat, down feathers -- kept calm for the fight
    if (xb > NEST0 - 40) {
      const x0 = Math.max(xa, NEST0 - 40);
      const seam = (y) => NEST0 + (y - 362) * 0.25 + 14 * Math.sin(y * 0.1);
      g.save(); g.beginPath(); g.moveTo(seam(354), 354); for (let y = 354; y <= H; y += 8) g.lineTo(seam(y), y); g.lineTo(xb + 4, H); g.lineTo(xb + 4, 354); g.closePath(); g.clip();
      vgrad(g, x0 - 2, 354, xb - x0 + 4, H, [[0, '#b99a62'], [0.1, '#d4b880'], [0.55, '#dcc28c'], [1, '#c8aa74']]);
      for (let i = Math.floor((x0 - 40) / 9); i * 9 < xb + 40; i++) {
        const x = i * 9 + hash1(i * 3) * 9, y = 366 + hash1(i * 7) * 166, a = (hash1(i * 11) - 0.5) * 0.7, l = 16 + hash1(i * 13) * 26;
        const h = hash1(i * 17);
        g.strokeStyle = h < 0.4 ? rgba(TWIG.strawSh, 0.55) : h < 0.75 ? rgba('#f0dca4', 0.6) : rgba(TWIG.sh, 0.4); g.lineWidth = 1.4 + (y - 366) / 160;
        polyline(g, [x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2, x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2]); g.stroke();
      }
      vgrad(g, x0, 354, xb - x0, 388, [[0, 'rgba(60,36,14,0.35)'], [1, 'rgba(60,36,14,0)']]);
      g.restore();
    }
    // the roost's back edge: a lip of rounded stones against the cloud sea
    if (xb > ROOST && xa < NEST0) {
      for (let i = Math.floor((Math.max(xa, ROOST) - 40) / 26); i * 26 < Math.min(xb, NEST0 - 40) + 30; i++) {
        const x = i * 26 + hash1(i * 7 + 2) * 12, w = 14 + hash1(i * 3) * 12, hgt = 7 + hash1(i * 11) * 7;
        ink(g, (g) => { g.beginPath(); g.ellipse(x, 360, w, hgt, 0, Math.PI, 0); g.lineTo(x + w, 364); g.lineTo(x - w, 364); g.closePath(); }, mix(ROCKE.base, ROCKE.hi, hash1(i) * 0.6), 1.4, (g) => { g.fillStyle = rgba(ROCKE.sh, 0.5); g.fillRect(x, 340, w, 30); });
      }
    }
    // the back edge on the steps and the roost: a soft shadow line under the cloud sea
    if (xa < NEST0) vgrad(g, xa, 354, Math.min(xb, NEST0) - xa + 4, 372, [[0, 'rgba(120,110,150,0.45)'], [1, 'rgba(120,110,150,0)']]);
    // the front edge: the causeway's stone face over the cloud sea (steps / roost), the nest's woven lip (nest)
    const lip = (x) => 526 + 3 * Math.sin(x * 0.021) + 2 * vnoise(x, 13, 8);
    ink(g, (g) => { g.beginPath(); g.moveTo(xa - 4, H + 4); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, lip(x)); g.lineTo(xb + 4, H + 4); g.closePath(); }, '#9a8c96', 1.6, (g) => {
      g.fillStyle = '#7a6e82'; g.fillRect(xa, 532, xb - xa, 12);
      if (xb > NEST0 - 60) { g.save(); g.beginPath(); g.moveTo(NEST0 + 30, 518); g.lineTo(xb + 8, 518); g.lineTo(xb + 8, 548); g.lineTo(NEST0 - 40, 548); g.closePath(); g.clip(); weave(g, Math.max(xa, NEST0 - 60), xb, 520, 545, 3, 2); g.restore(); }
      g.strokeStyle = rgba('#ffffff', 0.55); g.lineWidth = 1.6; g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, lip(x) + 1.5); g.stroke();
    });
  }

  // ------------------------------------------------------------------ per frame
  // a rope of prayer flags blown downwind (after stormspire.js drawPrayerLine)
  function prayerLine(ctx, ax, ay, bx, by, sag, n, t, seed, wind, lw = 1.4, fw = 11, fl = 15) {
    if (Math.max(ax, bx) < -30 || Math.min(ax, bx) > W + 30) return;
    const mx = (ax + bx) / 2, my = (ay + by) / 2 + sag * 2;
    ctx.strokeStyle = '#5a4a40'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
    const stream = clamp(0.25 + 0.5 * wind, 0, 0.9);
    ctx.lineWidth = 1.1; ctx.strokeStyle = '#4a3a44';
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const x = (1 - f) * (1 - f) * ax + 2 * (1 - f) * f * mx + f * f * bx, y = (1 - f) * (1 - f) * ay + 2 * (1 - f) * f * my + f * f * by;
      const ph = t * (5 + 6 * wind) + i * 1.1 + seed * 2.3, s2 = stream * (0.82 + 0.18 * Math.sin(ph));
      const dx = fl * s2, dy = fl * Math.sqrt(1 - s2 * s2 * 0.8), wob = Math.sin(ph * 1.7) * 2.2 * (0.4 + wind);
      ctx.beginPath(); ctx.moveTo(x - fw / 2, y); ctx.lineTo(x + fw / 2, y); ctx.lineTo(x + fw / 2 + dx + wob * 0.5, y + dy - wob * 0.3); ctx.lineTo(x - fw / 2 + dx + wob, y + dy + wob * 0.2); ctx.closePath();
      ctx.fillStyle = PRAYER[(i + seed) % 5]; ctx.fill(); ctx.stroke();
    }
  }
  function drawFlag(ctx, spr, x, y, t, seed, amp, strips = 9) {
    const sw = spr.c.width / strips, dw = spr.w / strips;
    for (let i = 0; i < strips; i++) {
      const f = i / (strips - 1), off = Math.sin(t * 6 - i * 0.7 + seed) * amp * f;
      ctx.drawImage(spr.c, i * sw, 0, sw + 0.5, spr.c.height, x + i * dw, y + off, dw + 0.35, spr.h);
    }
  }
  function streaksAndFeathers(ctx, C, camX, t, wind, layer) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const s of LAY.streaks) {
      if (s.layer !== layer) continue;
      const sp = (380 + 520 * wind) * s.sp, x = ((s.x + t * sp - camX * (layer ? 1.3 : 0.8)) % 1300 + 1300) % 1300 - 170;
      const u = ((t * 0.5 * s.sp + s.ph) % 1), a = Math.sin(u * Math.PI) * (layer ? 0.55 : 0.4) * clamp(0.4 + wind, 0, 1.2);
      if (a < 0.03) continue;
      const len = s.len * (0.7 + wind), y = s.y + Math.sin(t * 1.3 + s.ph * 9) * 6;
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = layer ? 2.2 : 1.4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + len * 0.5, y - 3, x + len, y + 1); ctx.stroke();
    }
    for (const f of LAY.feathers) {
      if (f.layer !== layer) continue;
      const sp = (40 + 120 * wind) * f.sp, x = ((f.x + t * sp - camX * (layer ? 1.2 : 0.85)) % 1100 + 1100) % 1100 - 70;
      const y = ((f.y + t * 14 * f.sp + Math.sin(t * 1.4 + f.ph) * 20) % 580 + 580) % 580 - 10;
      const spr = C.feather[f.k];
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2 + f.ph) * 0.8); const k = layer ? 0.85 : 0.6; ctx.drawImage(spr.c, -spr.ox * k, -spr.oy * k, spr.w * k, spr.h * k); ctx.restore();
    }
    ctx.restore();
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    curT = t;
    camX = clamp(+camX || 0, 0, CAM_MAX);
    const wind = windAt(camX, t);
    ctx.save();
    const sky = ctx.createLinearGradient(0, 0, 0, 372);
    sky.addColorStop(0, '#3f86d2'); sky.addColorStop(0.36, '#78b6ea'); sky.addColorStop(0.64, '#bcdcf4'); sky.addColorStop(0.84, '#f2e8d6'); sky.addColorStop(1, '#ffe6c0');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 380);
    ctx.fillStyle = '#d8ccc6'; ctx.fillRect(0, 380, W, H - 380);
    // the sun, high on the right, and its warm glow
    const sx = 760 - camX * 0.02;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; ctx.drawImage(C.sun.c, sx - 330, 130 - 330, 660, 660); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(sx, 130, 30, 0, TAU); ctx.fill();
    for (const cl of LAY.clouds) {
      const spr = C.cloud[cl.k];
      let x = (cl.x - camX * P_CL + t * cl.sp * (0.6 + wind)) % 1700; if (x < 0) x += 1700; x -= 360;
      if (x > W || x + spr.w < 0) continue;
      ctx.drawImage(spr.c, Math.round(x * s) / s, cl.y - spr.h / 2, spr.w, spr.h);
    }
    drawStrip(ctx, C.far, camX, s);
    drawStrip(ctx, C.sea, camX, s);
    // far birds riding the wind
    ctx.strokeStyle = 'rgba(70,70,110,0.6)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const b of LAY.birds) {
      const x = ((b.x - camX * 0.25 + t * b.sp) % 1300 + 1300) % 1300 - 170, y = b.y + Math.sin(t * 0.6 + b.ph) * 8, f = Math.sin(t * 5 + b.ph) * 4 * b.s;
      ctx.beginPath(); ctx.moveTo(x - 9 * b.s, y - f); ctx.quadraticCurveTo(x - 4 * b.s, y - 3, x, y); ctx.quadraticCurveTo(x + 4 * b.s, y - 3, x + 9 * b.s, y - f); ctx.stroke();
    }
    drawStrip(ctx, C.mid, camX, s);
    for (const [ax, ay, bx, by, sag, n, seed] of MID_LINES) prayerLine(ctx, ax - camX * P_MID, ay, bx - camX * P_MID, by, sag, n, t, seed, wind, 1, 7, 10);
    drawStrip(ctx, C.near, camX, s);
    // near: the causeway's back stones, the roost's rocks, poles and their prayer lines, the Great Nest
    drawSprites(ctx, C.back, camX, s);
    drawSprites(ctx, C.eggs, camX, s);
    if (camX + W > NEST0 - 90) drawStrip(ctx, C.rim, camX, s);
    drawSprites(ctx, C.poles, camX, s);
    for (let i = 0; i < POLES.length; i++) {
      const x = POLES[i] - camX;
      if (x < -200 || x > W + 300) continue;
      drawFlag(ctx, C.flag, x + 3, 146, t, i * 1.7, 3 + 5 * wind);
      if (i + 1 < POLES.length) prayerLine(ctx, x, 150, POLES[i + 1] - camX, 150, 30, 16, t, i + 3, wind);
    }
    prayerLine(ctx, POLES[2] - camX, 150, NESTS[0][0] - 60 - camX, 262, 16, 12, t, 9, wind);
    drawStrip(ctx, C.ground, camX, s);
    streaksAndFeathers(ctx, C, camX, t, wind, 0);
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0) {
    const C = st.ensure();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    streaksAndFeathers(ctx, C, camX, t, windAt(camX, t), 1);
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(70,60,90,0.28)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  return { setScale: st.setScale, setWarm, windGust, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 62, h: 58, colors: ['#a8743f', '#7a4f2a', '#dcbc78', '#4a4448'] },
  barrel: { w: 48, h: 60, colors: ['#93603a', '#653f22', '#bb8350', '#5b5a62'] },
  urn:    { w: 52, h: 58, colors: ['#8a6a44', '#dcbc78', '#f6e6c8', '#b9e0e8'] },
};
const PROP_DRAW = {
  crate(g) {   // a pilgrim's supply crate with a prayer scarf tied round it
    const wood = '#a8743f', woodSh = '#7a4f2a', woodHi = '#d29a5c', woodDk = '#5c3a20', iron = '#4a4448';
    const L = -30, Rr = 24, T = -40, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), woodSh, 2.6);
    ink(g, (g) => poly(g, [L, T, Rr, T, Rr + dx, T + dy, L + dx, T + dy]), woodHi, 2.4);
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4; for (const y of [-14, -27]) { polyline(g, [L, y, Rr, y]); g.stroke(); }
      g.fillStyle = woodSh; g.fillRect(L, T, 6, 40); g.fillRect(Rr - 6, T, 6, 40);
      g.fillStyle = iron; for (const [x, y] of [[L, T], [Rr - 9, T], [L, -9], [Rr - 9, -9]]) g.fillRect(x, y, 9, 9);
      g.fillStyle = '#4f7fc0'; g.fillRect(-6, T, 10, 40); g.fillStyle = '#e2b24c'; g.fillRect(-6, T, 2.4, 40);
    });
    ink(g, (g) => poly(g, [4, T + 2, 16, T - 8, 20, T - 2, 10, T + 6]), '#4f7fc0', 1.8);
    ink(g, (g) => poly(g, [4, T + 2, 12, T + 14, 6, T + 16, 0, T + 4]), '#4f7fc0', 1.8);
  },
  barrel(g) {  // a water barrel with a rope hitch
    const wood = '#93603a', woodSh = '#653f22', woodHi = '#bb8350', iron = '#5b5a62', ironHi = '#8d8c96';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -52); g.quadraticCurveTo(-27, -26, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -26, 18, -52); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -60, 30, 66); g.fillStyle = woodHi; g.fillRect(-19, -54, 5, 58);
      g.strokeStyle = woodSh; g.lineWidth = 1.2; for (const k of [-0.5, -0.1, 0.3]) { g.beginPath(); g.moveTo(k * 18, -52); g.quadraticCurveTo(k * 27, -26, k * 18, 4); g.stroke(); }
      for (const y of [-44, -8]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.4); }
      g.strokeStyle = '#d8c08a'; g.lineWidth = 2.4; polyline(g, [-24, -28, 24, -24]); g.stroke();
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 18, 5.5, 0, 0, TAU); }, woodHi, 2.4);
  },
  urn(g) {     // a little nest of eggs on a stone (break it: there's a snack inside)
    ink(g, (g) => blob(g, [-26, 2, -22, -10, -4, -14, 14, -12, 26, -4, 22, 4]), '#a3979e', 2.6, (g) => { g.fillStyle = '#7b7083'; g.fillRect(4, -18, 30, 24); });
    for (const [x, rx, col, spot] of [[-9, 9, '#f6e6c8', '#b07a4a'], [8, 10, '#b9e0e8', '#5a8aa0'], [0, 8, '#f0d6e4', '#a0607a']]) { g.save(); g.translate(x, -24 - (x === 0 ? 6 : 0)); egg(g, rx, rx * 1.3, col, spot, 7 + x); g.restore(); }
    ink(g, (g) => { g.beginPath(); g.moveTo(-26, -26); g.quadraticCurveTo(-24, -6, 0, -6); g.quadraticCurveTo(24, -6, 26, -26); g.quadraticCurveTo(0, -18, -26, -26); g.closePath(); }, '#8a6a44', 2.4, (g) => {
      g.strokeStyle = '#5f4529'; g.lineWidth = 2; for (let k = 0; k < 7; k++) { polyline(g, [-24 + k * 8, -24, -18 + k * 8, -8]); g.stroke(); }
      g.strokeStyle = '#dcbc78'; g.lineWidth = 1.6; for (let k = 0; k < 6; k++) { polyline(g, [-20 + k * 8, -10, -12 + k * 8, -22]); g.stroke(); }
    });
  },
};
