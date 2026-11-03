// Dodongo's Quest - secret stage "THE CRYSTAL DEEP" (src/stages/crystal.js): background, floor and breakable props.
//
// Under the Ember Mines, where the runaway cart from the rusty switch ends up (docs/SECRETS.md): glowing violet and
// teal crystal caverns and an underground lake that mirrors them.
//
// Sections (world x):  rails 0-1200 (the Runaway Rails: the old track ends at a broken buffer stop where the heroes'
// cart tipped over; timber frames, lanterns, a rickety trestle running off into the depths)  |  glimmer 1200-2300 (the
// Glimmer Caves: big crystal clusters on the rock bank, a glowing geode)  |  lake 2300-3600 (the Glow Lake: a still
// underground lake behind the shore; the crystal Magmaw's arena is the last screen, its floor kept plain for its pools).
//
// Back-to-front (drawBack): the cavern depths (p 0.12) -> crystal spires, rock pillars and the trestle (p 0.38) -> the
// lake (p 0.6, clipped to the lake section; its seam hidden by the rock buttress at 2300) -> the rock bank (1.0) ->
// timber frames, crystal clusters, the buttress (1.0) -> the ceiling and its stalactites (1.0) -> live glows -> the
// floor (1.0) -> the crystal light (the readability band, after mines.js C.cavLight) -> back motes.
// drawFront: rare hanging crystals (p 1.25, never on an arena screen), near motes.
// Every static element is cached per scale (chunked strips + sprites, src/canvasmem.js); animated bits are live.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 3600;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'rails', name: 'The Runaway Rails', x0: 0, x1: 1200 },
  { id: 'glimmer', name: 'The Glimmer Caves', x0: 1200, x1: 2300 },
  { id: 'lake', name: 'The Glow Lake', x0: 2300, x1: 3600 },
];
export const ARENAS = [500, 1600, CAM_MAX];
export const WAYSTONES = [1420];
// the crystal Magmaw's pools (levels.js boss.pools): the floor around them is left plain
export const POOLS = [[2930, 50], [3150, 110], [3380, 45]];
const RAIL_END = 1130, LAKE0 = 2300, GEODE = 1730, BIGCRY = 3120;
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES, pools: POOLS, railEnd: RAIL_END, lake: LAKE0, portalX: CAM_MAX + 780 };

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
const P_FAR = 0.12, P_MID = 0.38, P_LAKE = 0.6, P_FRONT = 1.25;
const GT0 = 330;
const ROCKV = { base: '#2c2346', sh: '#201935', hi: '#433767', crack: '#130e22' };
const BANK = { base: '#4a3e6e', sh: '#372d57', hi: '#665792', crack: '#221a3b' };
const VIO = { base: '#b07af2', sh: '#7140c0', hi: '#f0dcff', glow: '185,120,255' };
const TEAL = { base: '#46e2d2', sh: '#1d9198', hi: '#dafff9', glow: '80,235,215' };
const TIMB = { base: '#6e4d44', sh: '#4a322c', hi: '#94705f', grain: '#3a2620' };
const IRON = { base: '#433f52', sh: '#2a2734', hi: '#837f96' };
const LS = { far: ['#1a1330', 0.5], mid: ['#18112c', 0.55], near: ['#150f26', 0.62], front: ['#100b1e', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const ceilY = (x) => 54 + 14 * Math.sin(x * 0.0051 + 0.8) + 8 * Math.sin(x * 0.017 + 2.2) + 12 * vnoise(x, 41, 5);
const bankTop = (x) => 292 + 12 * Math.sin(x * 0.0067 + 1.4) + 7 * Math.sin(x * 0.021) + 14 * vnoise(x, 47, 11) - 44 * (1 - sstep(70, 170, Math.abs(x - GEODE)));
// timber frames along the rails ([x0, x1]), lone posts with lanterns, crystal clusters on the bank [x, palette, size]
const FRAMES = [[70, 330], [600, 860]];
const LANTERNS = [[200, 166], [730, 166], [1028, 176]];   // [x, top of the lantern's hook]
const CLUSTERS = [[1270, 'teal', 1.35], [1575, 'vio', 1.05], [1905, 'teal', 1.15], [2150, 'vio', 1.45], [2470, 'teal', 0.8], [3540, 'vio', 0.85], [470, 'vio', 0.6], [940, 'teal', 0.55]];
const clusterY = (x) => (x > LAKE0 ? 348 : bankTop(x) + 12);
const FRONT_CRY = [300, 1530, 2590].filter((x) => clearOfArenas(x, 60, P_FRONT));
// the great crystal across the lake: its layer x (p 0.6), seen left of centre behind the boss arena
const BIG_L = BIGCRY - CAM_MAX * (1 - P_LAKE) - 330;

const LAY = (() => {
  const R = mulberry(4100);
  const motes = [];
  for (let i = 0; i < 120; i++) motes.push({ x: R.r(0, 1000), y: R.r(0, 560), sp: R.r(0.4, 1.2), sw: R.r(4, 16), ph: R.r(0, TAU), fr: R.r(0.3, 1.1), k: R(), layer: i < 85 ? 0 : 1 });
  return { motes };
})();

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
      poly(g, [p[0], p[1], p[2], p[3], p[4], p[5], cx + rx * 0.08, cy - ry * 0.02]); g.fillStyle = rgba(P.hi, 0.4); g.fill();
      poly(g, [p[6], p[7], p[8], p[9], p[10], p[11], cx, cy + ry * 0.1]); g.fillStyle = rgba(P.sh, 0.5); g.fill();
      poly(g, p); g.strokeStyle = rgba(P.crack, crackA); g.lineWidth = 1.2; g.stroke();
    }
  }
}
// one crystal prism (a long hexagonal point) leaning by a, from the base (0, 0) up: length L, width w
function prism(g, a, L, w, P, lw = 1.8) {
  g.save(); g.rotate(a);
  const hw = w / 2;
  ink(g, (g) => poly(g, [-hw, 4, -hw, -L * 0.74, 0, -L, hw, -L * 0.74, hw, 4]), P.base, lw, (g) => {
    g.fillStyle = P.sh; g.fillRect(hw * 0.18, -L, hw, L + 6);
    g.fillStyle = P.hi; poly(g, [-hw, 4, -hw, -L * 0.74, 0, -L, -hw * 0.3, -L * 0.7, -hw * 0.4, 4]); g.fill();
    g.fillStyle = rgba('#ffffff', 0.75); g.fillRect(-hw * 0.78, -L * 0.64, Math.max(1.2, w * 0.1), L * 0.46);
  });
  g.restore();
}
// a cluster of crystals on a rock lump (origin = base centre), size s, palette P (seeded)
function cluster(g, s, P, seed, rock = BANK, n = 6) {
  const R = mulberry(seed);
  lightPool(g, 0, -20 * s, 70 * s, 50 * s, P.glow, 0.32);
  ink(g, (g) => blob(g, [-34 * s, 6, -28 * s, -10 * s, -8 * s, -18 * s, 18 * s, -14 * s, 34 * s, -2 * s, 26 * s, 8]), rock.hi, 2, (g) => { g.fillStyle = rock.sh; g.fillRect(2 * s, -24 * s, 44 * s, 40); });
  const list = [];
  for (let k = 0; k < n; k++) list.push({ a: lerp(-0.8, 0.8, k / (n - 1)) + R.r(-0.15, 0.15), L: R.r(28, 54) * s * (Math.abs(k - (n - 1) / 2) < 1 ? 1.35 : 1), w: R.r(10, 16) * s, x: R.r(-16, 16) * s });
  list.sort((p, q) => q.L - p.L);
  for (const c of list) { g.save(); g.translate(c.x, -8 * s); prism(g, c.a, c.L, c.w, P, 1.8); g.restore(); }
}
// a hanging crystal stalactite (origin = its root on the ceiling)
function hangingCrystal(g, s, P, seed) {
  const R = mulberry(seed);
  ink(g, (g) => poly(g, [-22 * s, -8, 22 * s, -8, 12 * s, 26 * s, 0, 42 * s, -14 * s, 22 * s]), ROCKV.hi, 1.6, (g) => { g.fillStyle = ROCKV.sh; g.fillRect(0, -8, 30 * s, 60 * s); });
  for (let k = 0; k < 3; k++) { g.save(); g.translate(R.r(-8, 8) * s, 20 * s); g.scale(1, -1); prism(g, R.r(-0.35, 0.35), R.r(26, 46) * s, R.r(8, 12) * s, P, 1.5); g.restore(); }
}
// rails on sleepers along the back of the floor (as mines.js drawTrack)
function drawTrack(g, x0, x1) {
  const xa = al(x0, 24) - 24, xb = x1 + 24;
  g.beginPath(); g.moveTo(xa, 364);
  for (let x = xa; x <= xb + 24; x += 12) g.lineTo(x, 337 + 1.5 * Math.sin(x * 0.07) + hash1(x) * 1.5 + Math.max(0, x - x1) * 0.6);
  g.lineTo(xb + 24, 364); g.closePath();
  const gr = g.createLinearGradient(0, 336, 0, 364); gr.addColorStop(0, '#4a4060'); gr.addColorStop(1, '#2e2840');
  g.fillStyle = gr; g.fill();
  for (let x = xa; x < x1 + 6; x += 24) {
    const j = hash1(x * 7) * 3;
    ink(g, (g) => poly(g, [x + j - 6, 361, x + j - 4, 341, x + j + 4, 341, x + j + 6, 361]), TIMB.base, 1.6, (g) => { g.fillStyle = TIMB.sh; g.fillRect(x + j, 338, 8, 26); });
  }
  for (const [y, h] of [[344, 3.4], [354, 4]]) {
    g.fillStyle = '#1a1622'; g.fillRect(xa, y - 1, x1 - xa, h + 2);
    g.fillStyle = '#5c5870'; g.fillRect(xa, y, x1 - xa, h);
    g.fillStyle = '#b0a8c8'; g.fillRect(xa, y, x1 - xa, 1.2);
  }
}
function timberBeam(g, x0, y0, x1, y1, lw = 2.2) {
  ink(g, (g) => poly(g, [x0, y0, x1, y0, x1, y1, x0, y1]), TIMB.base, lw, (g) => {
    if (x1 - x0 > y1 - y0) { g.fillStyle = TIMB.sh; g.fillRect(x0, y1 - (y1 - y0) * 0.35, x1 - x0, (y1 - y0) * 0.35); } else { g.fillStyle = TIMB.sh; g.fillRect(x1 - (x1 - x0) * 0.4, y0, (x1 - x0) * 0.4, y1 - y0); }
    g.fillStyle = TIMB.hi; g.fillRect(x0, y0, x1 - x0, 1.6);
    g.strokeStyle = TIMB.grain; g.lineWidth = 1;
    if (x1 - x0 > y1 - y0) for (let k = 1; k < 3; k++) { polyline(g, [x0 + 4, y0 + (y1 - y0) * k / 3, x1 - 4, y0 + (y1 - y0) * k / 3 + 1]); g.stroke(); }
    else for (let k = 1; k < 3; k++) { polyline(g, [x0 + (x1 - x0) * k / 3, y0 + 4, x0 + (x1 - x0) * k / 3 + 1, y1 - 4]); g.stroke(); }
  });
}
function drawLantern(g, x, y) {
  strokeLine(g, [x, y, x, y + 8], 1.4, LINE);
  ink(g, (g) => poly(g, [x - 7, y + 8, x + 7, y + 8, x + 9, y + 12, x - 9, y + 12]), IRON.base, 1.6);
  ink(g, (g) => poly(g, [x - 7, y + 12, x + 7, y + 12, x + 6, y + 30, x - 6, y + 30]), '#ffd38a', 1.6, (g) => { g.fillStyle = '#fff3cc'; g.fillRect(x - 3, y + 15, 6, 12); g.strokeStyle = IRON.sh; g.lineWidth = 1.4; polyline(g, [x, y + 12, x, y + 30]); g.stroke(); });
  ink(g, (g) => poly(g, [x - 8, y + 30, x + 8, y + 30, x + 6, y + 34, x - 6, y + 34]), IRON.base, 1.6);
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0;
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    const fr = layerRange(0, LEVEL_LEN, P_FAR), mr = layerRange(0, LEVEL_LEN, P_MID), lr = layerRange(LAKE0, LEVEL_LEN, P_LAKE);
    c.far = buildStrip(fr[0], fr[1], 0, 372, csFar, P_FAR, (g, xa, xb) => { setLS('far'); drawFar(g, xa, xb); });
    c.mid = buildStrip(mr[0], mr[1], 20, 372, csFar, P_MID, (g, xa, xb) => { setLS('mid'); drawMid(g, xa, xb); });
    c.lake = buildStrip(lr[0], lr[1], 96, 372, csFar, P_LAKE, (g, xa, xb) => { setLS('mid'); drawLake(g, xa, xb); });
    c.lakeX = lr;
    c.bank = buildStrip(-10, LAKE0 + 80, 250, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawBank(g, xa, xb); });
    c.ceil = buildStrip(-10, LEVEL_LEN + 10, 0, 130, cs, 1, (g, xa, xb) => { setLS('near'); drawCeil(g, xa, xb); });
    c.ground = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawGround(g, xa, xb); });
    // the crystal light: the glow off the crystals and the lake on the wall base and the floor's back half at fighter
    // height (readability: the dark cave swallowed the fighters' outlines -- as the Ember Mines' cavern light), warm
    // pools at the lanterns
    c.light = lightBand(-10, LEVEL_LEN + 10, 236, 452, '190,160,255', [[0, 0], [0.3, 0.1], [0.55, 0.17], [0.78, 0.1], [1, 0]], [0, 0], Math.min(cs, 0.5), (g) => {
      for (const [x] of LANTERNS) lightPool(g, x, 360, 200, 70, '255,190,120', 0.2);
      for (const [x, k, s] of CLUSTERS) lightPool(g, x, 350, 170 * s, 60, k === 'teal' ? TEAL.glow : VIO.glow, 0.16);
      lightPool(g, BIGCRY, 352, 420, 80, TEAL.glow, 0.14);
    });
    // near sprites
    setLS('near');
    c.frame = makeSprite(330, 230, 34, 220, cs, (g) => { setLS('near'); drawFrame(g, 260); });
    c.post = makeSprite(80, 220, 40, 214, cs, (g) => { setLS('near'); timberBeam(g, -8, -204, 8, 0); timberBeam(g, -26, -196, 30, -184); drawLantern(g, 18, -184); });
    c.cart = makeSprite(130, 80, 65, 70, cs, (g) => { setLS('near'); drawTippedCart(g); });
    c.buffer = makeSprite(60, 60, 30, 50, cs, (g) => { setLS('near'); drawBuffer(g); });
    c.buttress = makeSprite(220, 420, 110, 392, cs, (g) => { setLS('near'); drawButtress(g); });
    const clSpr = new Map();
    c.back = [];
    for (const [x0, x1] of FRAMES) c.back.push({ spr: c.frame, x: x0, y: 362 });
    c.back.push({ spr: c.post, x: 1010, y: 360 });
    c.back.push({ spr: c.buffer, x: RAIL_END + 6, y: 356 });
    c.back.push({ spr: c.cart, x: RAIL_END - 52, y: 366 });
    for (const [x, k, s] of CLUSTERS) {
      const key = k + s;
      if (!clSpr.has(key)) clSpr.set(key, makeSprite(170 * s, 150 * s, 85 * s, 132 * s, cs, (g) => { lineStyle(LS.near[0], 0.5); const P = k === 'teal' ? TEAL : VIO; cluster(g, s, { ...P, base: mix(P.base, BANK.base, 0.25), hi: mix(P.hi, BANK.hi, 0.25), sh: mix(P.sh, BANK.sh, 0.2) }, Math.round(x)); }));
      c.back.push({ spr: clSpr.get(key), x, y: clusterY(x) });
    }
    c.back.push({ spr: c.buttress, x: LAKE0, y: 368 });
    c.hang = [TEAL, VIO].map((P, k) => makeSprite(70, 110, 35, 10, cs, (g) => { setLS('near'); hangingCrystal(g, 1, P, 31 + k); }));
    c.hangs = [];
    for (let x = 160, i = 0; x < LEVEL_LEN; x += 230 + hash1(i * 5) * 160, i++) c.hangs.push({ spr: c.hang[i % 2], x, y: ceilY(x) - 4, k: i % 2 ? 'vio' : 'teal' });
    c.frontCry = makeSprite(120, 240, 60, 0, cs, (g) => { setLS('front'); g.translate(0, 10); g.scale(2.1, 2.1); hangingCrystal(g, 1, VIO, 77); });
    // glows and motes
    c.glowV = radialSprite(64, 1, [[0, 'rgba(200,150,255,0.6)'], [0.4, 'rgba(170,110,255,0.22)'], [1, 'rgba(150,90,255,0)']]);
    c.glowT = radialSprite(64, 1, [[0, 'rgba(120,255,235,0.55)'], [0.4, 'rgba(70,230,215,0.2)'], [1, 'rgba(60,210,200,0)']]);
    c.glowW = radialSprite(64, 1, [[0, 'rgba(255,210,140,0.65)'], [0.4, 'rgba(255,170,90,0.25)'], [1, 'rgba(255,150,70,0)']]);
    c.mote = radialSprite(5, Math.max(1, cs), [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(220,200,255,0.8)'], [1, 'rgba(180,150,255,0)']]);
    return c;
  }

  // ------------------------------------------------------------------ deep layers
  function drawFar(g, xa, xb) {
    vgrad(g, xa - 2, 0, xb - xa + 4, 372, [[0, '#0b0816'], [0.35, '#151030'], [0.75, '#241a44'], [1, '#30235a']]);
    // distant cavern arches
    for (let i = Math.floor((xa - 300) / 260); i * 260 < xb + 300; i++) {
      const x = i * 260 + hash1(i * 9) * 90, w = 150 + hash1(i * 4) * 80, top = 90 + hash1(i * 7) * 60;
      g.fillStyle = '#100b22'; g.beginPath(); g.moveTo(x - w, 380); g.lineTo(x - w * 0.8, top + 60); g.quadraticCurveTo(x - w * 0.6, top - 20, x - w * 0.2, top + 10); g.lineTo(x - w * 0.15, 380); g.closePath(); g.fill();
      g.strokeStyle = rgba('#6a50b0', 0.35); g.lineWidth = 2; g.beginPath(); g.moveTo(x - w * 0.8, top + 60); g.quadraticCurveTo(x - w * 0.6, top - 20, x - w * 0.2, top + 10); g.stroke();
    }
    // far glows: distant crystal clusters
    for (let i = Math.floor((xa - 200) / 120); i * 120 < xb + 200; i++) {
      const h = hash1(i * 13 + 2); if (h < 0.45) continue;
      const x = i * 120 + hash1(i * 3) * 80, y = 170 + hash1(i * 17) * 170, teal = hash1(i * 23) < 0.5;
      lightPool(g, x, y, 40 + h * 30, 30 + h * 20, teal ? TEAL.glow : VIO.glow, 0.32);
      g.fillStyle = teal ? '#7fefe2' : '#d2a8ff'; poly(g, [x - 3, y + 4, x, y - 8 - h * 6, x + 3, y + 4]); g.fill();
      poly(g, [x + 2, y + 4, x + 6, y - 3 - h * 4, x + 7, y + 4]); g.fill();
    }
    for (let i = Math.floor(xa / 7); i * 7 < xb; i++) {
      if (hash1(i * 3 + 11) > 0.14) continue;
      g.fillStyle = rgba(hash1(i) < 0.5 ? '#b8f6ee' : '#e2c8ff', 0.3 + hash1(i * 7) * 0.5); g.fillRect(i * 7 + hash1(i) * 6, 20 + hash1(i * 5) * 330, 1.5, 1.5);
    }
    // far stalactites
    for (let i = Math.floor((xa - 60) / 36); i * 36 < xb + 60; i++) {
      const x = i * 36 + hash1(i * 19) * 20, len = 30 + hash1(i * 5) * 90, w = 8 + hash1(i * 29) * 14;
      g.fillStyle = '#120c26'; poly(g, [x - w, -4, x + w, -4, x + 1, len]); g.fill();
    }
  }
  function drawMid(g, xa, xb) {
    // rock pillars and stalagmites
    for (let i = Math.floor((xa - 160) / 170); i * 170 < xb + 160; i++) {
      const h = hash1(i * 11 + 7), x = i * 170 + hash1(i * 5 + 1) * 70, w = 36 + hash1(i * 9) * 34;
      if (h < 0.4) {
        ink(g, (g) => { g.beginPath(); g.moveTo(x - w * 0.7, 10); g.quadraticCurveTo(x - w * 0.2, 190, x - w * 0.6, 390); g.lineTo(x + w * 0.7, 390); g.quadraticCurveTo(x + w * 0.25, 190, x + w * 0.65, 10); g.closePath(); }, '#2a2048', 1.6, (g) => {
          g.fillStyle = '#1e1736'; g.fillRect(x + 2, 0, w, 400); g.fillStyle = rgba('#7a5cc8', 0.4); g.fillRect(x - w * 0.6, 0, 4, 400);
        });
      } else if (h < 0.75) {
        const top = 230 + hash1(i * 3) * 60;
        ink(g, (g) => poly(g, [x - w * 0.8, 390, x - w * 0.2, top + 18, x, top, x + w * 0.25, top + 22, x + w * 0.8, 390]), '#2a2048', 1.6, (g) => { g.fillStyle = '#1e1736'; g.fillRect(x + 2, top, w, 200); });
      }
      // crystal spires growing from the floor of the far cavern
      if (hash1(i * 37) > 0.35) {
        const P = hash1(i * 41) < 0.5 ? TEAL : VIO, s = 0.7 + hash1(i * 43) * 0.6, cx = x + 60 + hash1(i * 47) * 40;
        g.save(); g.translate(cx, 340 + hash1(i * 53) * 20); g.globalAlpha = 0.9; cluster(g, s, { ...P, base: mix(P.base, '#2a2048', 0.35), hi: mix(P.hi, '#2a2048', 0.2) }, i * 7 + 3, ROCKV, 5); g.restore();
      }
    }
    // the Runaway Rails' trestle running off into the dark (layer x 40..900, rails section only)
    if (xa < 940 && xb > 20) drawTrestle(g);
    vgrad(g, xa - 2, 296, xb - xa + 4, 372, [[0, 'rgba(60,40,110,0)'], [1, 'rgba(60,40,110,0.4)']]);
  }
  function drawTrestle(g) {
    const deck = (x) => 236 + (x - 40) * 0.07 + 6 * Math.sin(x * 0.01);
    for (let x = 60; x < 900; x += 70) {      // legs, X-braced
      const y = deck(x);
      strokeLine(g, [x - 10, y + 6, x - 22, 380], 3.4, TIMB.sh); strokeLine(g, [x + 10, y + 6, x + 22, 380], 3.4, TIMB.sh);
      strokeLine(g, [x - 14, y + 30, x + 50, y + 100], 2, TIMB.grain); strokeLine(g, [x + 14, y + 30, x - 50 + 70, y + 100], 2, TIMB.grain);
    }
    g.beginPath(); for (let x = 30; x <= 910; x += 10) g.lineTo(x, deck(x)); g.lineWidth = 8; g.strokeStyle = TIMB.base; g.stroke();
    g.beginPath(); for (let x = 30; x <= 910; x += 10) g.lineTo(x, deck(x) - 5); g.lineWidth = 2.2; g.strokeStyle = '#9a92b8'; g.stroke();
    // an old cart left halfway along, and a lantern post
    const cx = 470, cy = deck(470);
    ink(g, (g) => poly(g, [cx - 22, cy - 30, cx + 22, cy - 30, cx + 17, cy - 8, cx - 17, cy - 8]), '#4a4660', 1.4, (g) => { g.fillStyle = '#34314a'; g.fillRect(cx + 6, cy - 34, 22, 30); });
    for (const d of [-11, 11]) { g.fillStyle = '#2a2638'; g.beginPath(); g.arc(cx + d, cy - 6, 5, 0, TAU); g.fill(); }
    g.fillStyle = TEAL.base; poly(g, [cx - 12, cy - 30, cx - 6, cy - 44, cx - 1, cy - 30]); g.fill();
    g.fillStyle = VIO.base; poly(g, [cx + 2, cy - 30, cx + 8, cy - 40, cx + 13, cy - 30]); g.fill();
    lightPool(g, 760, deck(760) - 20, 46, 46, '255,190,120', 0.5);
    strokeLine(g, [760, deck(760), 760, deck(760) - 34], 2.4, TIMB.sh);
    g.fillStyle = '#ffd38a'; g.fillRect(756, deck(760) - 32, 8, 10);
  }
  // the underground lake: a far shore with crystals, still water mirroring them (layer coords, p 0.6)
  function drawLake(g, xa, xb) {
    const shore = (x) => 268 + 6 * Math.sin(x * 0.011 + 1) + 5 * vnoise(x, 33, 4);
    const bigL = BIG_L;
    // water, below the far shore's waterline
    const rim = (x) => shore(x) - 12 - 9 * Math.max(0, vnoise(x, 57, 21) * 2 + 0.3);
    g.save(); g.beginPath(); g.moveTo(xa - 4, 380); for (let x = al(xa, 8) - 8; x <= xb + 8; x += 8) g.lineTo(x, shore(x) - 1); g.lineTo(xb + 4, 380); g.closePath(); g.clip();
    vgrad(g, xa - 2, 256, xb - xa + 4, 372, [[0, '#1d1840'], [0.25, '#1b2f52'], [0.7, '#1c4a62'], [1, '#26607a']]);
    // reflections of the far glows: soft vertical smears
    for (let i = Math.floor((xa - 80) / 90); i * 90 < xb + 80; i++) {
      const x = i * 90 + hash1(i * 19) * 50, teal = hash1(i * 7) < 0.55;
      g.fillStyle = rgba(teal ? '#5fe8d8' : '#b48af0', 0.16 + hash1(i * 3) * 0.12);
      roundRect(g, x - 6, 284, 12, 40 + hash1(i * 11) * 50, 6); g.fill();
    }
    // the great crystal's reflection
    if (xb > bigL - 200 && xa < bigL + 200) {
      g.save(); g.translate(bigL, shore(bigL) + 4); g.scale(1, -0.75); g.globalAlpha = 0.4; bigCrystal(g); g.restore();
      lightPool(g, bigL, 320, 180, 60, TEAL.glow, 0.35);
    }
    // ripple lines
    for (let r = 0; r < 9; r++) {
      const y = 286 + r * 9 + r * r * 0.4;
      for (let i = Math.floor((xa - 120) / 140); i * 140 < xb + 120; i++) {
        if (hash2(i, r) < 0.4) continue;
        const x = i * 140 + hash2(i, r * 3) * 90, w = 20 + hash2(i, r * 5) * 50;
        g.fillStyle = rgba('#cfe9ff', 0.18 + r * 0.02); g.fillRect(x, y, w, 1.3);
      }
    }
    g.restore();
    // the far shore: a low rim of dark rock, crystal clusters on it
    ink(g, (g) => { g.beginPath(); g.moveTo(xa - 4, shore(xa - 4) + 2); for (let x = al(xa, 8) - 8; x <= xb + 8; x += 8) g.lineTo(x, rim(x)); for (let x = al(xb, 8) + 8; x >= xa - 8; x -= 8) g.lineTo(x, shore(x) + 2); g.closePath(); }, '#271d44', 1.4, (g) => {
      g.beginPath(); for (let x = al(xa, 8) - 8; x <= xb + 8; x += 8) g.lineTo(x, rim(x) + 2); g.lineWidth = 3; g.strokeStyle = rgba('#7a62bc', 0.5); g.stroke();
    });
    g.save(); g.beginPath(); for (let x = al(xa, 8) - 8; x <= xb + 8; x += 8) g.lineTo(x, shore(x) + 1); g.lineWidth = 2; g.strokeStyle = rgba('#9fe9ff', 0.6); g.stroke(); g.restore();
    for (let i = Math.floor((xa - 100) / 150); i * 150 < xb + 100; i++) {
      const x = i * 150 + hash1(i * 29) * 80, P = hash1(i * 31) < 0.5 ? TEAL : VIO, s = 0.35 + hash1(i * 37) * 0.3;
      if (Math.abs(x - bigL) < 170) continue;
      g.save(); g.translate(x, shore(x) + 2); cluster(g, s, P, i * 13 + 1, ROCKV, 5); g.restore();
      g.save(); g.translate(x, shore(x) + 4); g.scale(1, -0.7); g.globalAlpha = 0.28; cluster(g, s, P, i * 13 + 1, ROCKV, 5); g.restore();
    }
    if (xb > bigL - 200 && xa < bigL + 200) { g.save(); g.translate(bigL, shore(bigL) + 2); bigCrystal(g); g.restore(); }
  }
  // the great crystal across the lake (the brightest thing in the Deep): origin = its base
  function bigCrystal(g) {
    lightPool(g, 0, -70, 150, 92, TEAL.glow, 0.32);
    ink(g, (g) => blob(g, [-90, 6, -70, -16, -20, -26, 30, -22, 80, -12, 92, 6]), ROCKV.hi, 1.8);
    const list = [[-0.5, 70, 22, -40, VIO], [0.45, 80, 24, 40, VIO], [-0.18, 130, 34, -12, TEAL], [0.12, 150, 38, 10, TEAL], [0.7, 50, 18, 66, TEAL], [-0.75, 48, 16, -66, TEAL]];
    for (const [a, L, w, x, P] of list.sort((p, q) => p[1] - q[1])) { g.save(); g.translate(x, -10); prism(g, a, L, w, P, 1.8); g.restore(); }
  }

  // ------------------------------------------------------------------ near: bank, frames, ceiling
  function drawBank(g, xa, xb) {
    const top = (x) => (x > LAKE0 + 20 ? 400 : bankTop(x));
    ink(g, (g) => { g.beginPath(); g.moveTo(xa - 4, 380); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, top(x)); g.lineTo(xb + 4, 380); g.closePath(); }, null, 1.8, (g) => {
      facets(g, xa, xb, 250, 380, BANK, 29, 56, 30, 0.6, 0.9);
      vgrad(g, xa, 260, xb - xa, 372, [[0, 'rgba(200,170,255,0.16)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,6,24,0.35)']]);
      // glowing veins in the glimmer caves
      for (let i = Math.floor((xa - 60) / 90); i * 90 < xb + 60; i++) {
        const x = i * 90 + hash1(i * 17) * 40; if (x < 1150 || hash1(i * 5) < 0.4) continue;
        const P = hash1(i * 7) < 0.5 ? TEAL : VIO;
        g.strokeStyle = rgba(P.base, 0.4); g.lineWidth = 2.6;
        curve(g, [x, bankTop(x) + 8, x + 14, bankTop(x) + 30, x + 6, bankTop(x) + 52, x + 16, bankTop(x) + 72]); g.stroke();
        g.strokeStyle = rgba(P.hi, 0.35); g.lineWidth = 0.9; g.stroke();
      }
      // small crystal tufts on the bank
      for (let i = Math.floor((xa - 40) / 70); i * 70 < xb + 40; i++) {
        const x = i * 70 + hash1(i * 23) * 50; if (hash1(i * 13) < 0.5) continue;
        const P = hash1(i * 11) < 0.5 ? TEAL : VIO;
        g.save(); g.translate(x, bankTop(x) + 30 + hash1(i * 3) * 24); for (let k = -1; k <= 1; k++) prism(g, k * 0.45, 12 + (k ? 0 : 6), 6, P, 1.2); g.restore();
      }
    });
    // the crystal grotto: a low niche in the bank packed with glowing crystals (no dark doorway)
    if (xb > GEODE - 110 && xa < GEODE + 110) {
      const niche = (g, k) => { g.beginPath(); g.moveTo(GEODE - 74 * k, 372); g.quadraticCurveTo(GEODE - 70 * k, 312 + (1 - k) * 20, GEODE, 304 + (1 - k) * 22); g.quadraticCurveTo(GEODE + 70 * k, 312 + (1 - k) * 20, GEODE + 74 * k, 372); g.closePath(); };
      ink(g, (g) => niche(g, 1), '#3a2c60', 1.8, (g) => {
        lightPool(g, GEODE, 344, 90, 46, VIO.glow, 0.6);
        g.save(); g.translate(GEODE + 4, 370); cluster(g, 0.72, VIO, 1733, BANK, 7); g.restore();
        g.save(); g.translate(GEODE - 44, 372); cluster(g, 0.42, TEAL, 1734, BANK, 4); g.restore();
        g.save(); g.translate(GEODE + 48, 372); cluster(g, 0.38, TEAL, 1735, BANK, 4); g.restore();
      });
    }
  }
  function drawFrame(g, span) {
    timberBeam(g, -10, -206, 10, 0); timberBeam(g, span - 10, -206, span + 10, 0);
    timberBeam(g, -24, -214, span + 24, -196);
    for (const s of [0, 1]) { const x = s ? span - 10 : 10, d = s ? -1 : 1; ink(g, (g) => poly(g, [x, -150, x + d * 6, -160, x + d * 46, -196, x + d * 36, -196]), TIMB.base, 1.6); }
    // a cluster of crystals has grown up one post
    g.save(); g.translate(span - 2, -40); g.rotate(-0.4); for (let k = -1; k <= 1; k++) prism(g, k * 0.5, 16 + (k ? 0 : 8), 8, TEAL, 1.2); g.restore();
    drawLantern(g, span / 2, -196);
  }
  function drawTippedCart(g) {
    // the cart the heroes rode in on, tipped on its side at the buffer stop; ore and a few crystals spilled
    g.save(); g.translate(0, -18); g.rotate(-1.25);
    ink(g, (g) => poly(g, [-34, -24, 34, -24, 28, 8, -28, 8]), '#4c4a5e', 2.2, (g) => { g.fillStyle = '#34324a'; g.fillRect(10, -28, 30, 40); g.fillStyle = '#7a7890'; g.fillRect(-34, -24, 68, 3); });
    for (const d of [-18, 18]) ink(g, (g) => { g.beginPath(); g.arc(d, 12, 8, 0, TAU); }, '#3a3848', 1.8);
    g.restore();
    for (let k = 0; k < 9; k++) { const x = 30 + k * 7 + hash1(k) * 6, y = -2 - hash1(k * 3) * 7; ink(g, (g) => { g.beginPath(); g.ellipse(x, y, 6, 4.5, 0, 0, TAU); }, k % 4 ? '#4a4258' : TEAL.base, 1.2); }
  }
  function drawBuffer(g) {
    ink(g, (g) => poly(g, [-10, 0, -8, -36, 12, -36, 14, 0]), TIMB.base, 2.2, (g) => { g.fillStyle = TIMB.sh; g.fillRect(4, -40, 12, 44); });
    ink(g, (g) => poly(g, [-18, -24, -18, -34, 2, -34, 2, -24]), '#8a3a2a', 2);
    ink(g, (g) => poly(g, [-14, -12, 18, -20, 20, -14, -12, -6]), TIMB.hi, 1.6);    // a cracked plank
  }
  function drawButtress(g) {
    // a rock pillar from the roof to the shore: the cave narrows here before it opens over the Glow Lake
    const edgeL = (y) => -70 + 16 * Math.sin(y * 0.03) + 10 * vnoise(y, 21, 3);
    const edgeR = (y) => 62 + 14 * Math.sin(y * 0.025 + 2) + 10 * vnoise(y, 19, 9) + (y > -90 ? (y + 90) * 0.35 : 0);
    const build = (g) => { g.beginPath(); for (let y = -400; y <= 0; y += 10) g.lineTo(edgeL(y) - (y > -80 ? (y + 80) * 0.4 : 0), y); for (let y = 0; y >= -400; y -= 10) g.lineTo(edgeR(y), y); g.closePath(); };
    ink(g, build, ROCKV.base, 2.2, (g) => {
      facets(g, -120, 120, -410, 10, { base: '#3a2e5c', sh: '#2a2146', hi: '#55468a', crack: '#1a1230' }, 61, 52, 40, 0.6, 0.9);
      vgrad(g, -120, -400, 240, 0, [[0, 'rgba(8,4,20,0.5)'], [0.6, 'rgba(8,4,20,0)'], [1, 'rgba(180,150,255,0.15)']]);
      g.fillStyle = rgba('#8a70d0', 0.4); g.fillRect(-90, -400, 14, 400);
    });
    g.save(); g.translate(-30, -6); cluster(g, 0.7, VIO, 901, BANK, 5); g.restore();
    g.save(); g.translate(46, -2); cluster(g, 0.55, TEAL, 902, BANK, 4); g.restore();
  }
  function drawCeil(g, xa, xb) {
    const edge = (g) => { g.beginPath(); g.moveTo(xa - 4, -4); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, ceilY(x)); g.lineTo(xb + 4, -4); g.closePath(); };
    ink(g, edge, null, 1.8, (g) => {
      facets(g, xa, xb, -10, 130, ROCKV, 13, 70, 34, 0.6, 0.7);
      vgrad(g, xa, 0, xb - xa, 110, [[0, 'rgba(6,3,14,0.6)'], [1, 'rgba(6,3,14,0)']]);
      g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, ceilY(x)); g.lineWidth = 8; g.strokeStyle = rgba('#7a60c0', 0.45); g.stroke();
    });
    // rock stalactites
    for (let i = Math.floor(xa / 26) - 2; i * 26 < xb + 40; i++) {
      const h = hash1(i * 7 + 3); if (h < 0.35) continue;
      const x = i * 26 + hash1(i * 5) * 14, y = ceilY(x) - 3, len = 10 + hash1(i * 11) * 34, w = 7 + hash1(i * 13) * 8;
      ink(g, (g) => poly(g, [x - w, y, x + w, y, x + 1, y + len]), ROCKV.hi, 1.3, (g) => { g.fillStyle = ROCKV.sh; g.fillRect(x + 1, y, w, len); });
      if (h > 0.88) { g.fillStyle = hash1(i) < 0.5 ? TEAL.hi : VIO.hi; g.beginPath(); g.arc(x + 1, y + len + 3, 1.6, 0, TAU); g.fill(); }
    }
  }

  // ------------------------------------------------------------------ the floor
  function drawGround(g, xa, xb) {
    const edge = (x) => (x > LAKE0 - 30 ? 362 + 3 * Math.sin(x * 0.04) + 2 * vnoise(x, 11, 3) : 354);
    const gr = g.createLinearGradient(0, 352, 0, H);
    for (const [o, c] of [[0, '#4c4c6c'], [0.1, '#626684'], [0.5, '#6a6e8e'], [0.88, '#5e6282'], [1, '#484a66']]) gr.addColorStop(o, c);
    g.fillStyle = gr; g.beginPath(); g.moveTo(xa - 4, H + 2); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, edge(x)); g.lineTo(xb + 4, H + 2); g.closePath(); g.fill();
    // stone slabs and dust: soft flagstones (world-aligned rows)
    const rows = [[364, 382], [382, 404], [404, 430], [430, 460], [460, 494], [494, 530]];
    for (let r = 0; r < rows.length; r++) {
      const [ya, yb] = rows[r], sw = 120 + r * 12, off = hash1(r * 31 + 7) * sw;
      for (let i = Math.floor((xa - off) / sw) - 1; i * sw + off < xb + sw; i++) {
        const x0 = i * sw + off + (hash2(i, r) - 0.5) * 30, x1 = x0 + sw - 6 + (hash2(i + 1, r) - 0.5) * 20;
        const h = hash2(i * 3, r * 5 + 1);
        g.fillStyle = rgba(h < 0.5 ? '#45475f' : '#8c90ae', 0.22 + Math.abs(h - 0.5) * 0.3);
        roundRect(g, x0 + 3, ya + 2, x1 - x0 - 6, yb - ya - 4, 5); g.fill();
        g.fillStyle = rgba('#a8acc8', 0.25); g.fillRect(x0 + 6, ya + 2, x1 - x0 - 12, 1.4);
      }
      g.fillStyle = rgba('#34364e', 0.35); g.fillRect(xa, yb - 1, xb - xa, 2);
    }
    // glowing veins in the glimmer caves' floor and crystal shards (not in the arena around the pools)
    for (let i = Math.floor((xa - 80) / 110); i * 110 < xb + 80; i++) {
      const x = i * 110 + hash1(i * 7) * 60, y = 380 + hash1(i * 19) * 130;
      if (x < 1180 || x > LEVEL_LEN - 60 || hash1(i * 3) < 0.45) continue;
      if (POOLS.some(([px, py]) => Math.abs(x - px) < 120 && Math.abs(y - 362 - py) < 60)) continue;
      const P = hash1(i * 13) < 0.5 ? TEAL : VIO;
      if (hash1(i * 17) > 0.45) { g.save(); g.translate(x + 30, y); g.globalAlpha = 0.75; prism(g, -0.3, 9, 4.5, P, 0.8); prism(g, 0.35, 7, 4, P, 0.8); g.restore(); }
    }
    // pebbles
    for (let i = Math.floor(xa / 29) - 1; i * 29 < xb + 29; i++) {
      if (hash1(i * 5 + 3) > 0.35) continue;
      const x = i * 29 + hash1(i) * 24, y = 372 + hash1(i * 9) * 150;
      g.fillStyle = rgba('#34364e', 0.6); g.beginPath(); g.ellipse(x + 1, y + 1.5, 4, 2, 0, 0, TAU); g.fill();
      g.fillStyle = '#9ca0bc'; g.beginPath(); g.ellipse(x, y, 3.5, 2, 0, 0, TAU); g.fill();
    }
    // the rails along the back, to the buffer stop
    if (xa < RAIL_END + 40) {
      setLS('near');
      g.save(); g.beginPath(); g.rect(xa - 4, GT0, Math.min(xb, RAIL_END + 60) - xa + 8, H - GT0); g.clip();
      drawTrack(g, xa, RAIL_END);
      g.restore();
    }
    // the shore of the Glow Lake: the water's edge laps along the back; wet stone sheen
    if (xb > LAKE0 - 30) {
      const x0 = Math.max(xa, LAKE0 - 30);
      g.save(); g.beginPath(); g.rect(x0, GT0, xb - x0 + 4, H - GT0); g.clip();
      g.beginPath(); for (let x = al(x0, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, edge(x)); g.lineWidth = 2.4; g.strokeStyle = rgba('#d8f6ff', 0.85); g.stroke();
      vgrad(g, x0, 362, xb - x0 + 4, 400, [[0, 'rgba(120,220,240,0.28)'], [1, 'rgba(120,220,240,0)']]);
      g.restore();
    }
    // the back edge: a thin dark contact line and a lip of rock where the bank meets the floor
    if (xa < LAKE0) {
      const x1 = Math.min(xb, LAKE0);
      vgrad(g, xa, 356, x1 - xa, 376, [[0, 'rgba(14,8,30,0.45)'], [1, 'rgba(14,8,30,0)']]);
    }
    // the front edge: a dark rock lip
    const lip = (x) => 528 + 3 * Math.sin(x * 0.023) + 2 * vnoise(x, 13, 8);
    ink(g, (g) => { g.beginPath(); g.moveTo(xa - 4, H + 4); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, lip(x)); g.lineTo(xb + 4, H + 4); g.closePath(); }, '#34354f', 1.6, (g) => {
      g.strokeStyle = rgba('#a4a8cc', 0.6); g.lineWidth = 1.6; g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, lip(x) + 1.5); g.stroke();
    });
  }

  // ------------------------------------------------------------------ per frame
  function drawLakeShimmer(ctx, C, camX, t, s) {
    const st = C.lake, yA = 284;
    for (const ch of st.chunks) {
      const sx = Math.round((ch.x - camX * st.p) * s) / s;
      if (sx > W || sx + ch.w < 0) continue;
      if (!ch.c) { ctx.save(); ctx.translate(sx - ch.x, 0); ch.paint(ctx); ctx.restore(); continue; }
      const k = ch.c.width / ch.w;
      ctx.drawImage(ch.c, 0, 0, ch.c.width, (yA - st.y0) * k, sx, st.y0, ch.w, yA - st.y0);
      for (let y = yA; y < st.y0 + ch.h; y += 6) {
        const off = Math.sin(t * 1.6 + y * 0.35) * (0.6 + (y - yA) * 0.012);
        ctx.drawImage(ch.c, 0, (y - st.y0) * k, ch.c.width, 6 * k, sx + off, y, ch.w, 6);
      }
    }
  }
  function particles(ctx, C, camX, t, layer) {
    const par = layer ? 1.3 : 0.7;
    ctx.globalCompositeOperation = 'lighter';
    for (const f of LAY.motes) {
      if (f.layer !== layer || f.k > 0.7) continue;
      const sx0 = ((f.x - camX * par) % 1000 + 1000) % 1000 - 20;
      const x = sx0 + Math.sin(t * f.fr + f.ph) * f.sw;
      const y = ((f.y - t * 9 * f.sp) % 560 + 560) % 560 - 10;
      ctx.globalAlpha = (0.35 + 0.35 * Math.sin(t * 1.7 * f.fr + f.ph) ** 2) * (layer ? 0.9 : 0.7);
      const r = layer ? 4 : 2.6 + f.k * 1.6;
      ctx.drawImage(C.mote.c, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    ctx.fillStyle = '#2a2048'; ctx.fillRect(0, 0, W, H);
    drawStrip(ctx, C.far, camX, s);
    drawStrip(ctx, C.mid, camX, s);
    if (secWin(ctx, LAKE0 - camX, W + 10, 380)) {
      drawLakeShimmer(ctx, C, camX, t, s);
      const bx = BIG_L - camX * P_LAKE;
      glowAt(ctx, C.glowT, bx, 200, 170, 0.2 + 0.06 * Math.sin(t * 0.8), 130);
      for (let i = 0; i < 14; i++) {     // glints on the water
        const x = ((i * 173 - camX * P_LAKE + t * 8) % 1000 + 1000) % 1000 - 20, y = 292 + (i % 7) * 11;
        ctx.globalAlpha = Math.max(0, Math.sin(t * 1.3 + i * 2.1)) * 0.7; ctx.fillStyle = '#e8fbff'; ctx.fillRect(x, y, 10 + (i % 3) * 6, 1.4);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    if (camX < LAKE0 + 80) drawStrip(ctx, C.bank, camX, s);
    drawSprites(ctx, C.back, camX, s);
    drawStrip(ctx, C.ceil, camX, s);
    drawSprites(ctx, C.hangs, camX, s);
    // live glows: the clusters breathe, the lanterns flicker, the hanging crystals' tips
    for (const [x, k, sz] of CLUSTERS) glowAt(ctx, k === 'teal' ? C.glowT : C.glowV, x - camX, clusterY(x) - 40 * sz, 90 * sz, 0.3 + 0.12 * Math.sin(t * 1.3 + x));
    for (const [x, y] of LANTERNS) glowAt(ctx, C.glowW, x - camX, y + 22, 70, 0.55 + 0.08 * Math.sin(t * 7 + x) + 0.05 * Math.sin(t * 13));
    for (const h of C.hangs) glowAt(ctx, h.k === 'teal' ? C.glowT : C.glowV, h.x - camX, h.y + 40, 36, 0.35 + 0.15 * Math.sin(t * 1.1 + h.x));
    if (Math.abs(GEODE - camX - W / 2) < W) glowAt(ctx, C.glowV, GEODE - camX, 326, 90, 0.35 + 0.12 * Math.sin(t * 0.9));
    drawStrip(ctx, C.ground, camX, s);
    ctx.globalCompositeOperation = 'screen'; drawStrip(ctx, C.light, camX, s); ctx.globalCompositeOperation = 'source-over';
    particles(ctx, C, camX, t, 0);
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    for (const wx of FRONT_CRY) {
      const sx = frontX(wx, camX, P_FRONT);
      if (sx < -80 || sx > W + 80) continue;
      const spr = C.frontCry;
      ctx.drawImage(spr.c, Math.round((sx - spr.ox) * s) / s, -spr.oy - 14, spr.w, spr.h);
      glowAt(ctx, C.glowV, sx, 150, 80, 0.3 + 0.1 * Math.sin(t + wx));
    }
    particles(ctx, C, camX, t, 1);
    ctx.restore();
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(14,8,30,0.35)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  return { setScale: st.setScale, setWarm, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 62, h: 58, colors: ['#8e5d35', '#5e3c22', '#46e2d2', '#4a4058'] },
  barrel: { w: 48, h: 58, colors: ['#5e3f2a', '#36261d', '#b07af2', '#e2d2a8'] },
  urn:    { w: 52, h: 58, colors: ['#b07af2', '#f0dcff', '#7140c0', '#4a3e6e'] },
  cart:   { w: 72, h: 56, colors: ['#4c4a5e', '#2c2a36', '#7a7890', '#46e2d2'] },
};
function oreHeap(g, pts, seed, n) {
  ink(g, (g) => blob(g, pts), '#4a4058', 2.6, (g) => {
    const R = mulberry(seed);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]); minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]); }
    for (let i = 0; i < n; i++) {
      const x = R.r(minX, maxX), y = R.r(minY, maxY), r = R.r(3.5, 7);
      g.fillStyle = R() < 0.5 ? '#5e5472' : '#352e44';
      poly(g, [x - r, y, x - r * 0.3, y - r * 0.8, x + r * 0.8, y - r * 0.4, x + r * 0.6, y + r * 0.6, x - r * 0.4, y + r * 0.7]); g.fill();
      if (R() < 0.35) { g.fillStyle = R() < 0.5 ? '#46e2d2' : '#c89cff'; g.fillRect(x - 1, y - 1.4, 2.6, 2.2); }
    }
  });
}
const PROP_DRAW = {
  crate(g) {   // an old mine crate, crystals poking out of the lid
    const wood = '#8e5d35', woodSh = '#5e3c22', woodHi = '#b47a48', woodDk = '#40281a', iron = '#45424e';
    const L = -30, Rr = 24, T = -36, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), woodSh, 2.6, (g) => { g.strokeStyle = woodDk; g.lineWidth = 1.2; polyline(g, [Rr, -18, Rr + dx, -18 + dy]); g.stroke(); });
    for (const [x, a, L2, P] of [[-14, -0.35, 22, '#46e2d2'], [-2, 0.05, 30, '#b07af2'], [10, 0.4, 20, '#46e2d2']]) {
      g.save(); g.translate(x, T - 2); g.rotate(a);
      ink(g, (g) => poly(g, [-5, 4, -5, -L2 * 0.72, 0, -L2, 5, -L2 * 0.72, 5, 4]), P, 2.2, (g) => { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(1, -L2, 6, L2 + 6); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(-3.5, -L2 * 0.6, 1.5, L2 * 0.4); });
      g.restore();
    }
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4; for (const y of [-12, -24]) { polyline(g, [L, y, Rr, y]); g.stroke(); }
      g.fillStyle = woodSh; g.fillRect(L, T, 6, 36); g.fillRect(Rr - 6, T, 6, 36); g.fillRect(L, T, Rr - L, 5);
      g.fillStyle = woodHi; g.fillRect(L + 6, T + 5, Rr - L - 12, 2);
      g.fillStyle = iron; for (const [x, y] of [[L, T], [Rr - 9, T], [L, -9], [Rr - 9, -9]]) g.fillRect(x, y, 9, 9);
      g.strokeStyle = 'rgba(30,18,10,0.55)'; g.lineWidth = 2; polyline(g, [-12, -8, 4, -26]); g.stroke(); polyline(g, [-2, -28, 8, -22, 10, -26]); g.stroke();
    });
  },
  barrel(g) {
    const wood = '#5e3f2a', woodSh = '#3e2a1c', woodHi = '#80583a', iron = '#45424e', ironHi = '#8a8698';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -50); g.quadraticCurveTo(-27, -25, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -25, 18, -50); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -58, 30, 64); g.fillStyle = woodHi; g.fillRect(-19, -52, 5, 56);
      g.strokeStyle = woodSh; g.lineWidth = 1.2; for (const k of [-0.5, -0.1, 0.3]) { g.beginPath(); g.moveTo(k * 18, -50); g.quadraticCurveTo(k * 27, -25, k * 18, 4); g.stroke(); }
      g.fillStyle = '#7140c0'; g.fillRect(-28, -33, 56, 8); g.fillStyle = '#4c2a88'; g.fillRect(-28, -27, 56, 2);
      for (const y of [-44, -6]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.4); }
      g.fillStyle = '#e2d2a8'; g.fillRect(-8, -22, 16, 13); g.fillStyle = '#46e2d2'; poly(g, [0, -21, 4, -15, 0, -10, -4, -15]); g.fill();
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -50, 18, 5.5, 0, 0, TAU); }, woodHi, 2.4);
  },
  urn(g) {     // a cluster of glow crystals on a lump of rock
    ink(g, (g) => blob(g, [-26, 2, -22, -12, -6, -18, 12, -16, 26, -6, 22, 4]), '#4a3e6e', 2.6, (g) => { g.fillStyle = '#372d57'; g.fillRect(4, -20, 30, 26); g.fillStyle = 'rgba(180,120,255,0.35)'; g.fillRect(-26, -18, 52, 4); });
    const list = [[-0.55, 30, 12, -12, 1], [0.5, 32, 12, 12, 1], [-0.2, 44, 15, -4, 0], [0.15, 50, 16, 4, 0], [0.8, 22, 10, 18, 1]];
    for (const [a, L, w, x, t] of list.sort((p, q) => q[1] - p[1])) {
      const P = t ? TEAL : VIO;
      g.save(); g.translate(x, -10); g.rotate(a);
      const hw = w / 2;
      ink(g, (g) => poly(g, [-hw, 4, -hw, -L * 0.72, 0, -L, hw, -L * 0.72, hw, 4]), P.base, 2.4, (g) => {
        g.fillStyle = P.sh; g.fillRect(hw * 0.15, -L, hw, L + 6);
        g.fillStyle = P.hi; poly(g, [-hw, 4, -hw, -L * 0.72, 0, -L, -hw * 0.3, -L * 0.68, -hw * 0.4, 4]); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(-hw * 0.75, -L * 0.62, 1.6, L * 0.45);
      });
      g.restore();
    }
  },
  cart(g) {
    oreHeap(g, [-30, -42, -24, -52, -8, -58, 10, -58, 24, -52, 30, -42], 57, 12);
    ink(g, (g) => poly(g, [-35, -44, 35, -44, 28, -14, -28, -14]), '#4c4a5e', 2.8, (g) => {
      g.fillStyle = '#34324a'; g.fillRect(10, -48, 30, 38); g.fillStyle = '#7a7890'; g.fillRect(-35, -44, 70, 3);
      g.fillStyle = '#2c2a36'; for (const y of [-36, -22]) g.fillRect(-34, y, 68, 3.4);
    });
    ink(g, (g) => poly(g, [-32, -16, 32, -16, 32, -10, -32, -10]), '#3a3648', 2.2);
  },
  wheel(g) {
    ink(g, (g) => { g.beginPath(); g.arc(0, 0, 9.5, 0, TAU); }, '#3e3c4c', 2.4, (g) => {
      g.strokeStyle = '#6e6a82'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, 6.5, 0, TAU); g.stroke();
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; polyline(g, [Math.cos(a) * 6.5, Math.sin(a) * 6.5, -Math.cos(a) * 6.5, -Math.sin(a) * 6.5]); g.stroke(); }
    });
  },
};
