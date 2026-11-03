// Dodongo's Quest - Mystic Mountain stage 5 "THE SUMMIT" (src/stages/mmsummit.js): background, plateau, props.
//
// The comic's chapter six (pages 35-43): the cracked black summit plateau before Morvath's obsidian tower (green-
// glowing veins and windows), under a swirling green storm -- green lightning, falling ash.  Far below, the valley has
// gone grey; only the village keeps its colour.  When Morvath is beaten the storm calms and the sun breaks through
// (setStorm), and the tower falls (setTowerFall).
//
// Sections (world x):  climb 0-1300 (the Last Climb: up between black crags)  |  plateau 1300-2700 (the Cracked
// Plateau: open, the valley below)  |  ash 2700-3900 (the Ash Fields: ash drifts, dead snags)  |  tower 3900-5400
// (Morvath's Tower: the tower looms behind the arena; the boss arena is the last screen).
//
// Back-to-front (drawBack): the sky (live: storm green <-> calm dawn) + the swirl over the tower (p 0.02) + storm
// clouds (parting as it calms) + sun rays (calm) -> the valley far below and far ridges (p 0.06) -> green lightning
// (far sky) -> crags (p 0.35) -> the tower (p 0.8: setTowerFall) -> the plateau's back edge (1.0) -> the floor (1.0)
// -> the light band -> the glow in the cracks (live, storm) -> ash.   drawFront: near ash, foreground crags at p 1.25
// (never on an arena screen), the lightning flash.
// setStorm(k): 1 full storm (default) .. 0 calm, sunlight.  setTowerFall(k): 0 standing .. 1 collapsed (it tilts,
// sinks behind the plateau in dust and falling shards; a broken stump is left).  flashOf(t): the lightning flash now
// (0..1), for the runtime to flash sprites with.  HOOKS.tower: the tower's world x as seen from the boss screen.
// Every static element is cached per scale (chunked strips + sprites, src/canvasmem.js); animated bits are live.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 5400;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'climb', name: 'The Last Climb', x0: 0, x1: 1300 },
  { id: 'plateau', name: 'The Cracked Plateau', x0: 1300, x1: 2700 },
  { id: 'ash', name: 'The Ash Fields', x0: 2700, x1: 3900 },
  { id: 'tower', name: "Morvath's Tower", x0: 3900, x1: 5400 },
];
export const ARENAS = [450, 1750, 3100, CAM_MAX];
export const WAYSTONES = [2600];
const P_SKY = 0.02, P_FAR = 0.06, P_MID = 0.35, P_TOWER = 0.8, P_FRONT = 1.25;
const TOWER_SX = 690;                                         // the tower's screen x on the boss screen
const TOWER_LX = TOWER_SX + CAM_MAX * P_TOWER, TOWER_Y = 336;  // its layer x, the screen y of its base
const VILLAGE_LX = 520;                                       // the village in the far layer (layer x)
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES, tower: CAM_MAX + TOWER_SX, towerScreen: [TOWER_SX, TOWER_Y] };

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
const GT0 = 340;
const STORM = ['#0b1813', '#18302a', '#2c4a3c', '#46644f'];
const CALM = ['#d98c94', '#f0b29c', '#f9d4ac', '#fde9c6'];
const ROCK = { base: '#2e3431', sh: '#1d2120', hi: '#4f5853', crack: '#0f1211' };
const SLAB = { base: '#4f5752', sh: '#3e4541', hi: '#66706a', crack: '#1a1e1c' };
const GREEN = '120,255,150';
const LS = { far: ['#1e2a24', 0.45], mid: ['#101613', 0.55], near: ['#0a0d0c', 0.66], front: ['#060807', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const ashK = (x) => sstep(2600, 2900, x) * (1 - sstep(3800, 4100, x));
const FRONT_CRAGS = [300, 1400, 2800, 3950].filter((x) => clearOfArenas(x, 110, P_FRONT));
// glowing cracks on the plateau floor (world x, y): pulse live under the storm
const CRACKS = (() => {
  const R = mulberry(5402), out = [];
  for (let x = 120; x < LEVEL_LEN; x += R.r(160, 300)) out.push({ x, y: R.r(380, 500), l: R.r(50, 120), a: R.r(-0.3, 0.3), seed: out.length });
  // the boss arena: a burst of cracks radiating from under the tower
  for (let k = 0; k < 7; k++) out.push({ x: CAM_MAX + 300 + k * 60, y: 380 + (k % 3) * 40, l: 90 + k * 8, a: -0.2 + k * 0.06, seed: 100 + k });
  return out;
})();

const LAY = (() => {
  const R = mulberry(5403);
  const ash = [];
  for (let i = 0; i < 120; i++) ash.push({ x: R.r(0, 1100), y: R.r(0, 560), sp: R.r(0.4, 1.1), sw: R.r(6, 22), ph: R.r(0, TAU), r: R.r(1, 2.6), layer: i < 85 ? 0 : 1, k: R() });
  const clouds = [];
  for (let i = 0; i < 9; i++) clouds.push({ x: R.r(-100, 1060), y: R.r(10, 150), s: R.r(0.7, 1.3), v: i % 3, sp: R.r(2, 6), side: i % 2 ? 1 : -1 });
  const debris = [];
  for (let i = 0; i < 26; i++) debris.push({ x: R.r(-90, 90), y: R.r(-420, -40), vx: R.r(-60, 60), r: R.r(5, 16), rot: R.r(0, TAU), w: R.r(-3, 3), d: R.r(0, 0.4) });
  return { ash, clouds, debris };
})();

// ---------------------------------------------------------------------------------------------------------------
// SHARED DRAWING BITS
// ---------------------------------------------------------------------------------------------------------------
// faceted rock / ice: world-aligned irregular facets, lit upper left; chunk-safe
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
// a jagged black crag: centre x, top y, half width, with a green rim on its storm-lit side and glowing veins
function crag(g, x, top, hw, seed, foot = 380, P = ROCK, veins = 0.6) {
  const R = mulberry(seed), Lp = [], Rp = [];
  const n = 9;
  for (let k = 0; k <= n; k++) {
    const f = k / n, y = lerp(top, foot, f), w = hw * (k === 0 ? 0.02 : 0.1 + 0.9 * Math.pow(f, 0.75)) * (1 + R.r(-0.15, 0.15)), lean = (1 - f) * hw * 0.35 * (seed % 2 ? 1 : -1);
    Lp.push(x - w + lean + (k % 2 ? R.r(-8, 0) : 0), y); Rp.unshift(x + w * 0.9 + lean + (k % 2 ? R.r(0, 8) : 0), y);
  }
  const pts = Lp.concat(Rp);
  ink(g, (g) => poly(g, pts), P.base, 2, (g) => {
    facets(g, x - hw - 10, x + hw + 10, top - 10, foot + 4, P, seed, 30, 26, 0.6, 0.7);
    g.fillStyle = rgba(P.sh, 0.6); g.fillRect(x + hw * 0.15, top, hw, foot - top);
    // the storm's green light catching the left edges
    g.strokeStyle = rgba('#7fb896', 0.32); g.lineWidth = 3; g.beginPath(); for (let k = 0; k < Lp.length; k += 2) g.lineTo(Lp[k] + 3, Lp[k + 1]); g.stroke();
    if (R() < veins) { g.strokeStyle = rgba('#4f8c66', 0.5); g.lineWidth = 1.6; const vx = x + R.r(-hw * 0.3, hw * 0.3); polyline(g, [vx, top + 20, vx + R.r(-8, 8), lerp(top, foot, 0.4), vx + R.r(-14, 14), lerp(top, foot, 0.7), vx + R.r(-10, 10), foot]); g.stroke(); }
  });
}
function cloudSprite(w, h, sc, seed, P) {
  return makeSprite(w + 40, h + 40, (w + 40) / 2, (h + 40) / 2, sc, (g) => {
    const R = mulberry(seed), puffs = [];
    for (let i = 0; i < 9; i++) { const u = (i + 0.5) / 9; puffs.push([(u - 0.5) * w + R.r(-12, 12), R.r(-h * 0.2, h * 0.15), h * (0.3 + R() * 0.25) * (1 - Math.abs(u - 0.5) * 0.8)]); }
    const shape = (dy = 0) => { g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r, y + dy); g.arc(x, y + dy, r, 0, TAU); } };
    // the rim: every puff stroked, then the body filled over it a little lower -- only the top silhouette's rim shows
    shape(); g.strokeStyle = P.rim; g.lineWidth = 5; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;
    shape(3); g.fillStyle = P.body; g.fill();
    g.save(); shape(3); g.clip();
    const gr = g.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, P.sh); g.fillStyle = gr; g.fillRect(-w, -h, w * 2, h * 2);
    g.restore();
  });
}

// a foreground piece fades where a hero (or a pickup) is behind it (the runtime's opts.see: screen boxes)
function seeThrough(opts, x, y, w, h) {
  const see = opts && opts.see;
  if (!see) return 1;
  for (const b of see) if (b.x + b.w / 2 > x && b.x - b.w / 2 < x + w && b.y1 > y && b.y0 < y + h) return 0.35;
  return 1;
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0, storm = 1, fall = 0;
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    // (built nearest first: under a memory cap the first caches keep the full scale -- the floor under the fighters
    //  stays sharp, the far layers are the ones stepped down)
    const fr = layerRange(0, LEVEL_LEN, P_FAR), mr = layerRange(0, LEVEL_LEN, P_MID);
    c.ground = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawFloor(g, xa, xb); });
    c.edge = buildStrip(-10, LEVEL_LEN + 10, 200, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawEdge(g, xa, xb); });
    c.frontCrag = makeSprite(200, 130, 100, 126, cs, (g) => { setLS('front'); crag(g, -20, -110, 60, 77, 4, { base: '#151918', sh: '#0c0f0e', hi: '#2c3330', crack: '#050606' }, 0); crag(g, 36, -70, 44, 78, 4, { base: '#1a1e1d', sh: '#0c0f0e', hi: '#2c3330', crack: '#050606' }, 0); });
    c.light = lightBand(-10, LEVEL_LEN + 10, 250, 470, '200,232,210', [[0, 0], [0.3, 0.1], [0.55, 0.16], [0.8, 0.07], [1, 0]], [0, 0], Math.min(cs, 0.5));
    c.tower = makeSprite(300, 480, 150, 450, csFar, (g) => { setLS('mid'); drawTower(g); });
    c.stump = makeSprite(260, 140, 130, 120, csFar, (g) => { setLS('mid'); drawStump(g); });
    c.swirl = makeSprite(760, 460, 380, 230, 0.5, (g) => drawSwirl(g));
    c.clouds = [0, 1, 2].map((v) => cloudSprite(300 + v * 60, 110, 0.75, 70 + v, { body: '#203a30', sh: '#122019', rim: '#7fd99a' }));
    c.glowGreen = radialSprite(64, 0.5, [[0, `rgba(${GREEN},0.8)`], [0.35, `rgba(${GREEN},0.3)`], [1, `rgba(${GREEN},0)`]]);
    c.glowWarm = radialSprite(64, 0.5, [[0, 'rgba(255,200,120,0.85)'], [0.35, 'rgba(255,170,90,0.3)'], [1, 'rgba(255,150,80,0)']]);
    c.sun = radialSprite(64, 0.5, [[0, 'rgba(255,252,230,1)'], [0.2, 'rgba(255,240,190,0.85)'], [0.5, 'rgba(255,215,150,0.3)'], [1, 'rgba(255,200,140,0)']]);
    c.dust = radialSprite(64, 0.5, [[0, 'rgba(70,72,68,0.9)'], [0.55, 'rgba(70,72,68,0.5)'], [1, 'rgba(70,72,68,0)']]);
    c.ashFlake = radialSprite(4, Math.max(1, cs), [[0, 'rgba(190,196,190,1)'], [0.5, 'rgba(170,176,170,0.8)'], [1, 'rgba(160,166,160,0)']]);
    c.mid = buildStrip(mr[0], mr[1], 70, 372, csFar, P_MID, (g, xa, xb) => { setLS('mid'); drawMid(g, xa, xb); });
    c.far = buildStrip(fr[0], fr[1], 150, 345, csFar, P_FAR, (g, xa, xb) => { setLS('far'); drawFar(g, xa, xb); });
    return c;
  }

  // ------------------------------------------------------------------ deep layers
  function drawSwirl(g) {
    // the storm's vortex over the tower (comic page 36): green spiral bands, brightest at the eye
    g.lineCap = 'round';
    for (let arm = 0; arm < 4; arm++) {
      const a0 = arm * TAU / 4;
      for (const [lw, col] of [[46, 'rgba(40,80,60,0.55)'], [26, 'rgba(70,130,95,0.5)'], [10, 'rgba(140,220,170,0.45)']]) {
        g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
        for (let k = 0; k <= 70; k++) { const u = k / 70, a = a0 + u * 5, r = 360 * (0.05 + 0.95 * u); g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.55); }
        g.stroke();
      }
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 90); gr.addColorStop(0, 'rgba(170,255,200,0.6)'); gr.addColorStop(1, 'rgba(120,220,160,0)');
    g.fillStyle = gr; g.fillRect(-120, -90, 240, 180);
  }
  function drawFar(g, xa, xb) {
    // far ridges, grey-green; the valley far below gone grey -- except the village, still in colour
    const ridge = (base, amp, f, seed, col) => { g.beginPath(); g.moveTo(xa - 4, 350); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin(x * f + seed)) - 14 * vnoise(x, 40, seed)); g.lineTo(xb + 4, 350); g.closePath(); g.fillStyle = col; g.fill(); };
    ridge(230, 60, 0.008, 1, '#3a4a42');
    ridge(260, 40, 0.013, 3, '#4a564f');
    // the valley floor: grey patchwork fields, a grey river
    g.fillStyle = '#7a7e7a'; g.fillRect(xa - 2, 268, xb - xa + 4, 80);
    for (let i = Math.floor((xa - 60) / 36); i * 36 < xb + 60; i++) for (let r = 0; r < 5; r++) {
      const x = i * 36 + hash2(i, r) * 16, y = 274 + r * 14 + hash2(r, i) * 5, w = 22 + hash2(i + 9, r) * 18;
      g.fillStyle = hash2(i, r + 5) > 0.5 ? '#8a8e8a' : '#6e726e'; poly(g, [x, y, x + w, y - 2, x + w + 6, y + 10, x + 4, y + 11]); g.fill();
    }
    g.strokeStyle = '#a2a6a4'; g.lineWidth = 3; g.beginPath(); for (let x = al(xa, 8) - 8; x <= xb + 8; x += 8) g.lineTo(x, 300 + 10 * Math.sin(x * 0.015)); g.stroke();
    // the village: warm roofs, red and gold, windows lit -- the only colour down there
    if (VILLAGE_LX > xa - 160 && VILLAGE_LX < xb + 160) {
      const R = mulberry(5450);
      lightPool(g, VILLAGE_LX, 296, 110, 26, '255,190,100', 0.55);
      for (let k = 0; k < 20; k++) {
        const x = VILLAGE_LX + R.r(-80, 80), y = 298 + R.r(-6, 8), w = R.r(8, 13), col = R.pick(['#c84a32', '#d8a040', '#b86a3a', '#e0c070', '#8a4a8a']);
        g.fillStyle = '#e8d6b0'; g.fillRect(x - w / 2, y - 5, w, 6);
        g.fillStyle = col; poly(g, [x - w / 2 - 1, y - 5, x, y - 11, x + w / 2 + 1, y - 5]); g.fill();
        g.fillStyle = '#ffd77a'; g.fillRect(x - 1, y - 3, 2, 2);
      }
      g.fillStyle = '#e8d6b0'; g.fillRect(VILLAGE_LX - 4, 276, 8, 20); g.fillStyle = '#c84a32'; poly(g, [VILLAGE_LX - 6, 277, VILLAGE_LX, 264, VILLAGE_LX + 6, 277]); g.fill();
      // the fields right round the village keep their green and gold
      for (const [dx, dy, col] of [[-110, 312, '#7aa04a'], [100, 314, '#d8b04a'], [-40, 322, '#8ab05a'], [60, 324, '#c8a040']]) { g.fillStyle = col; g.beginPath(); g.ellipse(VILLAGE_LX + dx, dy, 36, 6, 0, 0, TAU); g.fill(); }
    }
    vgrad(g, xa - 2, 250, xb - xa + 4, 345, [[0, 'rgba(120,140,128,0.25)'], [1, 'rgba(120,140,128,0)']]);
  }
  function drawMid(g, xa, xb) {
    for (let i = Math.floor((xa - 160) / 110); i * 110 < xb + 160; i++) {
      if (hash1(i * 5 + 2) < 0.3) continue;
      const x = i * 110 + hash1(i * 7) * 60, top = 120 + hash1(i * 11) * 150, hw = 26 + hash1(i * 13) * 36;
      crag(g, x, top, hw, 500 + i, 380, { base: '#2a302d', sh: '#1a1e1c', hi: '#46504a', crack: '#0c0f0e' }, 0.5);
    }
    vgrad(g, xa - 2, 260, xb - xa + 4, 372, [[0, 'rgba(70,96,80,0)'], [1, 'rgba(70,96,80,0.55)']]);
  }
  // Morvath's tower (sprite: base centre at 0,0): a jagged obsidian spire, crooked side spires, green veins and windows
  function drawTower(g) {
    const body = [-70, 0, -64, -120, -50, -220, -40, -300, -26, -360, -10, -440, 0, -470, 8, -436, 22, -350, 36, -296, 48, -214, 60, -118, 72, 0];
    const O = { base: '#1a1d22', sh: '#0e1014', hi: '#3a404a', crack: '#05060a' };
    // the side spires
    for (const [x, b, t, w] of [[-58, -150, -300, 18], [54, -130, -270, 16], [-34, -280, -380, 12]]) ink(g, (g) => poly(g, [x - w, b, x - w * 0.3, t + 30, x, t, x + w * 0.4, t + 34, x + w, b]), O.base, 2, (g) => { g.fillStyle = O.hi; poly(g, [x - w, b, x - w * 0.3, t + 30, x, t, x - w * 0.2, b]); g.fill(); });
    ink(g, (g) => poly(g, body), O.base, 2.6, (g) => {
      // obsidian facets: long glassy planes
      for (let k = 0; k < 12; k++) { const x = -70 + k * 12, y0 = -20 - hash1(k) * 40; g.fillStyle = k % 3 === 0 ? rgba(O.hi, 0.6) : k % 3 === 1 ? rgba(O.sh, 0.7) : rgba('#262a32', 0.8); poly(g, [x, 0, x + 4, y0 - 300 - hash1(k * 3) * 120, x + 14, y0 - 280, x + 12, 0]); g.fill(); }
      g.fillStyle = rgba('#6a7288', 0.35); poly(g, [-64, -120, -50, -220, -40, -300, -26, -360, -10, -440, -16, -300, -40, -150]); g.fill();
      // the glowing veins (green), cracked down the stone
      g.strokeStyle = '#5aff8c'; g.lineWidth = 2.4;
      for (const v of [[-20, -440, -30, -350, -18, -260, -36, -160, -24, -40], [26, -330, 14, -250, 30, -170, 18, -60], [-50, -200, -40, -120, -56, -20]]) { polyline(g, v); g.stroke(); }
      g.strokeStyle = 'rgba(200,255,215,0.9)'; g.lineWidth = 1; for (const v of [[-20, -440, -30, -350, -18, -260, -36, -160, -24, -40], [26, -330, 14, -250, 30, -170, 18, -60]]) { polyline(g, v); g.stroke(); }
      // windows: pointed slits, glowing green
      for (const [x, y, h] of [[-6, -380, 26], [10, -300, 30], [-28, -230, 30], [24, -200, 26], [-12, -150, 34], [30, -96, 26], [-40, -90, 26]]) {
        ink(g, (g) => { g.beginPath(); g.moveTo(x - 6, y + h); g.lineTo(x - 6, y + 8); g.lineTo(x, y); g.lineTo(x + 6, y + 8); g.lineTo(x + 6, y + h); g.closePath(); }, '#7dffa4', 1.4, (g) => { g.fillStyle = '#d8ffe4'; g.fillRect(x - 2, y + 8, 3, h - 10); });
      }
      // the door at its foot
      ink(g, (g) => { g.beginPath(); g.moveTo(-18, 0); g.lineTo(-18, -40); g.lineTo(0, -60); g.lineTo(18, -40); g.lineTo(18, 0); g.closePath(); }, '#0a0c10', 2, (g) => { g.fillStyle = 'rgba(90,255,140,0.25)'; g.fillRect(-18, -30, 36, 30); });
    });
    // a horned skull carved over the door
    g.save(); g.translate(0, -74);
    ink(g, (g) => { g.beginPath(); g.moveTo(-7, -2); g.quadraticCurveTo(-20, -10, -22, -26); g.quadraticCurveTo(-13, -17, -5, -11); g.closePath(); }, '#9aa098', 1.3);
    ink(g, (g) => { g.beginPath(); g.moveTo(7, -2); g.quadraticCurveTo(20, -10, 22, -26); g.quadraticCurveTo(13, -17, 5, -11); g.closePath(); }, '#9aa098', 1.3);
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -3, 9, 8, 0, Math.PI, 0); g.lineTo(7, 6); g.lineTo(-7, 6); g.closePath(); }, '#b8beb4', 1.4, (g) => { g.fillStyle = '#5aff8c'; g.beginPath(); g.ellipse(-3.5, -2, 2.4, 2.6, 0, 0, TAU); g.ellipse(3.5, -2, 2.4, 2.6, 0, 0, TAU); g.fill(); });
    g.restore();
  }
  function drawStump(g) {
    // what the fall leaves: a jagged broken base, cold now, a few dark shards around it
    const O = { base: '#24272e', sh: '#15171c', hi: '#444a56' };
    ink(g, (g) => poly(g, [-80, 0, -70, -50, -50, -70, -30, -54, -14, -96, 6, -62, 26, -84, 44, -50, 62, -64, 80, 0]), O.base, 2.4, (g) => { g.fillStyle = O.hi; poly(g, [-80, 0, -70, -50, -50, -70, -40, 0]); g.fill(); g.fillStyle = O.sh; poly(g, [44, -50, 62, -64, 80, 0, 40, 0]); g.fill(); });
    for (const [x, y, r] of [[-110, -4, 14], [100, -2, 18], [-60, 4, 10], [120, 6, 9]]) ink(g, (g) => poly(g, [x - r, y, x - r * 0.3, y - r, x + r * 0.6, y - r * 0.6, x + r, y]), O.base, 1.6);
  }

  // ------------------------------------------------------------------ near: the plateau's back edge, the floor
  function drawEdge(g, xa, xb) {
    // black crags along the back of the plateau: tall on the climb, low and broken on the plateau and in the ash
    for (let i = Math.floor((xa - 160) / 95); i * 95 < xb + 160; i++) {
      const x = i * 95 + hash1(i * 7 + 1) * 50, climb = 1 - sstep(1100, 1500, x), tw = sstep(4100, 4400, x);
      if (hash1(i * 3 + 9) < 0.35 - climb * 0.3) continue;
      const top = lerp(lerp(300, 236, climb), 290, tw) + hash1(i * 11) * 50, hw = 30 + hash1(i * 13) * 30 + climb * 24;
      crag(g, x, top, hw, 900 + i, 376, ROCK, 0.5);
    }
    // ash drifts heaped against the rocks in the Ash Fields; dead snags
    for (let i = Math.floor((xa - 120) / 140); i * 140 < xb + 120; i++) {
      const x = i * 140 + hash1(i * 17) * 80;
      if (ashK(x) < 0.3) continue;
      g.fillStyle = '#8a8e88'; g.beginPath(); g.ellipse(x, 372, 70, 16, 0, Math.PI, 0); g.fill();
      g.fillStyle = rgba('#b4b8b2', 0.7); g.beginPath(); g.ellipse(x - 10, 364, 44, 6, 0, Math.PI, 0); g.fill();
      if (hash1(i * 19) > 0.55) {
        const h = 90 + hash1(i * 23) * 60, s = hash1(i * 29) > 0.5 ? 1 : -1;
        strokeLine(g, [x + 20, 370, x + 22, 370 - h * 0.5, x + 18 + s * 6, 370 - h], 7 * LK + 4, LINE); strokeLine(g, [x + 20, 370, x + 22, 370 - h * 0.5, x + 18 + s * 6, 370 - h], 6, '#3a3632');
        strokeLine(g, [x + 22, 370 - h * 0.55, x + 22 + s * 26, 370 - h * 0.75, x + 22 + s * 34, 370 - h * 0.9], 4 * LK + 3, LINE); strokeLine(g, [x + 22, 370 - h * 0.55, x + 22 + s * 26, 370 - h * 0.75, x + 22 + s * 34, 370 - h * 0.9], 3.5, '#3a3632');
        strokeLine(g, [x + 22, 370 - h * 0.35, x + 22 - s * 20, 370 - h * 0.48], 3 * LK + 3, LINE); strokeLine(g, [x + 22, 370 - h * 0.35, x + 22 - s * 20, 370 - h * 0.48], 3, '#3a3632');
      }
    }
  }
  function drawFloor(g, xa, xb) {
    // big cracked basalt slabs (lighter than the crags: the fighters read on it), grey ash, green-lit cracks
    vgrad(g, xa - 2, 352, xb - xa + 4, H, [[0, '#2e3431'], [0.1, '#4a524d'], [0.5, '#59625c'], [0.9, '#4a524d'], [1, '#353b38']]);
    facets(g, xa, xb, 362, 530, { base: '#555e58', sh: '#464e49', hi: '#6c7670', crack: '#1c201e' }, 31, 110, 46, 0.75, 0.55);
    vgrad(g, xa - 2, 352, xb - xa + 4, 400, [[0, 'rgba(14,18,16,0.55)'], [1, 'rgba(14,18,16,0)']]);
    // ash lying in drifts (thick in the Ash Fields)
    for (let i = Math.floor((xa - 160) / 90); i * 90 < xb + 160; i++) {
      const x = i * 90 + hash1(i * 31) * 60, y = 380 + hash1(i * 37) * 140, k = 0.25 + ashK(x) * 0.75;
      if (hash1(i * 41) > k) continue;
      g.fillStyle = rgba('#9a9e98', 0.5 + ashK(x) * 0.3); g.beginPath(); g.ellipse(x, y, 40 + hash1(i * 43) * 60, 5 + hash1(i * 47) * 4, 0, 0, TAU); g.fill();
      g.fillStyle = rgba('#c4c8c2', 0.4); g.beginPath(); g.ellipse(x - 8, y - 2, 26, 2.4, 0, 0, TAU); g.fill();
    }
    // the cracks' dark channels (they glow live)
    for (const c of CRACKS) {
      if (c.x + c.l < xa - 20 || c.x - 20 > xb + 20) continue;
      const pts = crackPts(c);
      g.strokeStyle = '#0c0f0e'; g.lineWidth = 5; g.lineJoin = 'round'; polyline(g, pts); g.stroke();
      g.strokeStyle = rgba('#2e5a44', 0.8); g.lineWidth = 1.6; polyline(g, pts); g.stroke();
    }
    // obsidian shards and pebbles
    for (let i = Math.floor(xa / 43) - 1; i * 43 < xb + 43; i++) {
      const x = i * 43 + hash1(i * 5) * 34, y = 376 + hash1(i * 9) * 150, h = hash1(i * 13);
      if (h > 0.22) continue;
      ink(g, (g) => { g.beginPath(); g.ellipse(x, y - 2, 5 + h * 14, 3 + h * 6, 0, Math.PI, 0); g.closePath(); }, '#2c3134', 1.2, (g) => { g.fillStyle = '#5a6470'; g.fillRect(x - 4, y - 7 - h * 6, 5, 2); });   // (rounded pebbles: no spikes)
    }
    // the front edge: the plateau breaks off into the drop
    const lip = (x) => 524 + 4 * Math.sin(x * 0.03) + 4 * vnoise(x, 17, 3);
    ink(g, (g) => { g.beginPath(); g.moveTo(xa - 4, H + 4); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, lip(x)); g.lineTo(xb + 4, H + 4); g.closePath(); }, '#1e2321', 1.8, (g) => { g.fillStyle = rgba('#5a6a60', 0.6); g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, lip(x) + 1); for (let x = al(xb, 6) + 6; x >= xa - 6; x -= 6) g.lineTo(x, lip(x) + 4); g.closePath(); g.fill(); });
  }
  function crackPts(c) {
    const R = mulberry(5500 + c.seed), pts = [c.x, c.y];
    let x = c.x, y = c.y;
    for (let k = 0; k < 5; k++) { x += (c.l / 5) * Math.cos(c.a) + R.r(-4, 4); y += (c.l / 5) * Math.sin(c.a) + R.r(-6, 6); pts.push(x, y); }
    return pts;
  }

  // ------------------------------------------------------------------ per frame
  const SLOT = 2.2;
  function boltAt(t) {
    if (storm < 0.05) return null;
    const i = Math.floor(t / SLOT), u = t - i * SLOT, h = hash1(i * 7 + 3);
    if (h > 0.25 + storm * 0.55 || u > 0.4) return null;
    return { i, u, x: 80 + hash1(i * 13) * (W - 160), seed: i };
  }
  function flashOf(t) { const b = boltAt(t); return b ? Math.max(0, 1 - b.u / 0.3) * storm : 0; }
  function bolt(ctx, b) {
    const R = mulberry(b.seed * 9 + 1), pts = [];
    let x = b.x, y = -10;
    const end = 220 + R() * 90;
    while (y < end) { pts.push([x, y]); x += R.r(-40, 40); y += R.r(22, 40); }
    const a = Math.max(0, 1 - b.u / 0.4) * storm;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [w, col] of [[16, `rgba(90,255,140,${0.22 * a})`], [6, `rgba(150,255,180,${0.6 * a})`], [2.2, `rgba(235,255,240,${a})`]]) {
      ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
    }
    // a branch
    const [bx, by] = pts[Math.floor(pts.length / 2)] || [x, y];
    ctx.lineWidth = 1.6; ctx.strokeStyle = `rgba(200,255,215,${a * 0.8})`; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 30, by + 20); ctx.lineTo(bx + 24, by + 46); ctx.lineTo(bx + 50, by + 70); ctx.stroke();
    ctx.restore();
  }
  function sky(ctx, C, camX, t) {
    const k = storm, gr = ctx.createLinearGradient(0, 0, 0, 360);
    for (let i = 0; i < 4; i++) gr.addColorStop(i / 3, mix(CALM[i], STORM[i], k));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 380);
    const tx = TOWER_LX - camX * P_TOWER;          // (the swirl and the sun sit over the tower)
    const sx = clamp(tx, 200, 760);
    // calm: the sun breaking through behind where the tower was, its rays
    if (k < 0.98) {
      const a = 1 - k;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < 9; r++) {
        const ang = Math.PI * (0.15 + r * 0.09) + Math.sin(t * 0.15 + r) * 0.02, l = 900;
        ctx.fillStyle = `rgba(255,236,180,${0.09 * a})`; ctx.beginPath(); ctx.moveTo(sx, 120); ctx.lineTo(sx + Math.cos(ang - 0.05) * l, 120 + Math.sin(ang - 0.05) * l); ctx.lineTo(sx + Math.cos(ang + 0.05) * l, 120 + Math.sin(ang + 0.05) * l); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx, 120); ctx.lineTo(sx - Math.cos(ang - 0.05) * l, 120 - Math.sin(ang - 0.05) * l * 0.3); ctx.lineTo(sx - Math.cos(ang + 0.05) * l, 120 - Math.sin(ang + 0.05) * l * 0.3); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      glowAt(ctx, C.sun, sx, 120, 260, 0.9 * a); glowAt(ctx, C.sun, sx, 120, 70, a);
    }
    // the swirl, turning, fading as the storm breaks
    if (k > 0.02) {
      ctx.save(); ctx.globalAlpha = k; ctx.translate(sx, 70); ctx.rotate(t * 0.06); ctx.scale(1, 1);
      ctx.drawImage(C.swirl.c, -C.swirl.ox, -C.swirl.oy, C.swirl.w, C.swirl.h); ctx.restore();
      glowAt(ctx, C.glowGreen, sx, 70, 120, 0.25 * k * (0.8 + 0.2 * Math.sin(t * 1.3)));
    }
  }
  function cloudDeck(ctx, C, camX, t) {
    // dark green storm clouds; as it calms they part, drifting out to the sides and thinning
    const k = storm, part = (1 - k) * 900;
    if (k < 0.01) return;   // (calm: the clouds are gone)
    for (const cl of LAY.clouds) {
      const spr = C.clouds[cl.v];
      let x = ((cl.x - camX * 0.04 + t * cl.sp) % 1260 + 1260) % 1260 - 150;
      x += cl.side * part;
      ctx.globalAlpha = 0.95 * Math.min(1, k * 1.6);
      ctx.drawImage(spr.c, x - spr.ox * cl.s, cl.y - spr.oy * cl.s, spr.w * cl.s, spr.h * cl.s);
    }
    ctx.globalAlpha = 1;
  }
  function towerPass(ctx, C, camX, t, s) {
    const x = TOWER_LX - camX * P_TOWER;
    if (x < -260 || x > W + 260) return;
    const f = fall;
    if (f > 0.35) ctx.drawImage(C.stump.c, Math.round((x - C.stump.ox) * s) / s, TOWER_Y - C.stump.oy + 6, C.stump.w, C.stump.h);
    if (f < 1) {
      const e = f * f, ang = e * 0.42, sink = e * 420;
      ctx.save(); ctx.translate(x, TOWER_Y + sink); ctx.rotate(ang);
      ctx.drawImage(C.tower.c, -C.tower.ox, -C.tower.oy, C.tower.w, C.tower.h);
      // the windows and veins pulse (fading as it falls and the storm dies)
      const p = (0.6 + 0.4 * Math.sin(t * 2.2)) * Math.max(0.2, storm) * (1 - f);
      if (p > 0.02) for (const [wx, wy] of [[-6, -366], [10, -284], [-28, -214], [24, -186], [-12, -132], [30, -82], [-40, -76]]) glowAt(ctx, C.glowGreen, wx, wy, 26, 0.5 * p);
      ctx.restore();
      // dust boiling up at the base and shards falling as it goes
      if (f > 0.01) {
        for (let k = 0; k < 7; k++) { const r = 70 + k * 26 + f * 80, dx = (k - 3) * 46; ctx.globalAlpha = Math.min(0.85, f * 2) * (1 - f * 0.5) * 0.7; ctx.drawImage(C.dust.c, x + dx - r, TOWER_Y - 30 - r * 0.6 - f * 40 * (k % 3), r * 2, r * 1.3); }
        ctx.globalAlpha = 1;
        for (const d of LAY.debris) {
          const u = clamp((f - d.d) / 0.6, 0, 1); if (u <= 0 || u >= 1) continue;
          const dx = x + d.x + d.vx * u * 2, dy = TOWER_Y + d.y * (1 - e) + u * u * 420;
          ctx.save(); ctx.translate(dx, dy); ctx.rotate(d.rot + d.w * u * 4); ctx.fillStyle = '#1a1d22'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-d.r * 0.5, d.r * 0.4); ctx.lineTo(-d.r * 0.15, -d.r * 1.3); ctx.lineTo(d.r * 0.55, d.r * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#4a5260'; ctx.beginPath(); ctx.moveTo(-d.r * 0.4, d.r * 0.3); ctx.lineTo(-d.r * 0.15, -d.r * 1.1); ctx.lineTo(-d.r * 0.05, d.r * 0.2); ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }
    }
  }
  function cracksLive(ctx, C, camX, t) {
    const k = storm;
    if (k < 0.03) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const c of CRACKS) {
      const sx = c.x - camX;
      if (sx + c.l < -20 || sx > W + 20) continue;
      const p = (0.5 + 0.5 * Math.sin(t * 1.6 + c.seed * 1.7)) * k;
      const pts = crackPts(c).map((v, i) => (i % 2 ? v : v - camX));
      ctx.strokeStyle = `rgba(${GREEN},${0.11 * p})`; ctx.lineWidth = 8; polyline(ctx, pts); ctx.stroke();
      ctx.strokeStyle = `rgba(170,255,195,${0.38 * p})`; ctx.lineWidth = 2; polyline(ctx, pts); ctx.stroke();
    }
    ctx.restore();
  }
  function ashPass(ctx, C, camX, t, layer) {
    const k = 0.25 + 0.75 * storm, par = layer ? 1.35 : 0.85;
    for (const f of LAY.ash) {
      if (f.layer !== layer || f.k > k) continue;
      const y = ((f.y + t * 34 * f.sp) % 580 + 580) % 580 - 20;
      const x = ((f.x - camX * par - t * 24 * f.sp + Math.sin(t * 0.9 + f.ph) * f.sw) % 1100 + 1100) % 1100 - 70;
      const r = f.r * (layer ? 1.6 : 1);
      ctx.globalAlpha = (layer ? 0.85 : 0.7) * (storm > 0.5 ? 1 : 0.4 + storm);
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * f.sp + f.ph); ctx.drawImage(C.ashFlake.c, -r, -r * 0.6, r * 2, r * 1.2); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function wash(ctx, t) {
    // the light over everything: green-grey storm light .. warm dawn gold
    const k = storm;
    ctx.save();
    if (k < 1) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = `rgba(255,200,140,${0.45 * (1 - k)})`; ctx.fillRect(0, 0, W, H); }
    if (k > 0) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(40,90,60,${0.08 * k})`; ctx.fillRect(0, 0, W, H); }
    const fl = flashOf(t);
    if (fl > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(120,255,160,${0.12 * fl})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    ctx.fillStyle = mix(CALM[2], STORM[2], storm); ctx.fillRect(0, 0, W, H);
    sky(ctx, C, camX, t);
    cloudDeck(ctx, C, camX, t);
    drawStrip(ctx, C.far, camX, s);
    const b = boltAt(t);
    if (b) bolt(ctx, b);
    drawStrip(ctx, C.mid, camX, s);
    towerPass(ctx, C, camX, t, s);
    drawStrip(ctx, C.edge, camX, s);
    drawStrip(ctx, C.ground, camX, s);
    ctx.globalCompositeOperation = 'screen'; drawStrip(ctx, C.light, camX, s); ctx.globalCompositeOperation = 'source-over';
    cracksLive(ctx, C, camX, t);
    wash(ctx, t);
    ashPass(ctx, C, camX, t, 0);
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0, opts) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    for (const wx of FRONT_CRAGS) {
      const sx = frontX(wx, camX, P_FRONT);
      if (sx < -140 || sx > W + 140) continue;
      const spr = C.frontCrag, y = H + 56;   // (low: their tips stay under the lane's front edge)
      ctx.globalAlpha = seeThrough(opts, sx - spr.ox, y - spr.oy, spr.w, spr.h);
      ctx.drawImage(spr.c, Math.round((sx - spr.ox) * s) / s, y - spr.oy, spr.w, spr.h);
      ctx.globalAlpha = 1;
    }
    ashPass(ctx, C, camX, t, 1);
    ctx.restore();
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(10,14,12,0.4)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  /** the storm: 1 full (default) .. 0 calm, the sun through */
  function setStorm(k) { storm = clamp(+k, 0, 1); if (Number.isNaN(storm)) storm = 1; }
  /** the tower: 0 standing .. 1 collapsed */
  function setTowerFall(k) { fall = clamp(+k || 0, 0, 1); }
  return { setScale: st.setScale, setWarm, setStorm, setTowerFall, flashOf, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 60, h: 56, colors: ['#3a3e46', '#24272e', '#5aff8c', '#6a7288'] },
  barrel: { w: 48, h: 60, colors: ['#5a4632', '#3a2c20', '#4f5466', '#9a9e98'] },
  urn:    { w: 50, h: 60, colors: ['#1a1d22', '#3a404a', '#5aff8c', '#b8beb4'] },
};
const PROP_DRAW = {
  crate(g) {   // a black iron-bound chest of Morvath's, a green rune on it
    const body = '#3a3e46', sh = '#24272e', hi = '#5a606c';
    const L = -28, Rr = 24, T = -38, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), sh, 2.6);
    ink(g, (g) => poly(g, [L, T, Rr, T, Rr + dx, T + dy, L + dx, T + dy]), hi, 2.4);
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), body, 2.8, (g) => {
      g.fillStyle = sh; g.fillRect(L, T, 6, 40); g.fillRect(Rr - 6, T, 6, 40); g.fillRect(L, -18, Rr - L, 5);
      g.strokeStyle = '#5aff8c'; g.lineWidth = 2; polyline(g, [-8, -30, -2, -24, -8, -16, 0, -10]); g.stroke(); polyline(g, [4, -30, 4, -12]); g.stroke();
    });
  },
  barrel(g) {  // an old barrel, ash on the lid
    const wood = '#5a4632', woodSh = '#3a2c20', woodHi = '#7e6448', iron = '#4f5466', ironHi = '#8e94a8';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -52); g.quadraticCurveTo(-27, -26, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -26, 18, -52); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -60, 30, 66); g.fillStyle = woodHi; g.fillRect(-19, -54, 5, 58);
      for (const y of [-44, -8]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.4); }
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 18, 5.5, 0, 0, TAU); }, '#9a9e98', 2.4, (g) => { g.fillStyle = '#c4c8c2'; g.fillRect(-10, -55, 12, 2); });
  },
  urn(g) {     // an obsidian urn, green light in its mouth
    const body = (g) => { g.beginPath(); g.moveTo(-10, -52); g.quadraticCurveTo(-12, -42, -20, -34); g.quadraticCurveTo(-30, -16, -16, 0); g.lineTo(16, 0); g.quadraticCurveTo(30, -16, 20, -34); g.quadraticCurveTo(12, -42, 10, -52); g.closePath(); };
    ink(g, body, '#1a1d22', 2.8, (g) => { g.fillStyle = '#3a404a'; g.fillRect(-20, -40, 6, 34); g.fillStyle = '#0e1014'; g.fillRect(6, -54, 28, 56); g.strokeStyle = '#5aff8c'; g.lineWidth = 1.6; polyline(g, [-6, -36, 0, -28, -4, -18, 2, -8]); g.stroke(); });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 12, 4, 0, 0, TAU); }, '#3a404a', 2.2, (g) => { g.fillStyle = '#7dffa4'; g.beginPath(); g.ellipse(0, -52, 7, 2.2, 0, 0, TAU); g.fill(); });
  },
};
