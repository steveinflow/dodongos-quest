// Dodongo's Quest - Mystic Mountain stage 3 "THE ICY CLIFFS" (src/stages/mmcliffs.js): background, ledge, props.
//
// The comic's chapter four (pages 22-27): a blue-violet blizzard high on the mountain, a sheer icy cliff face and the
// narrow snowy ledge along it (a shallow lane: depth 14..100, HOOKS.lane), the drop into the swirling white below.
// Blowing snow, and no fire anywhere.  At the end the ledge widens into a snowy path that leaves the map toward a
// gloomy mansion built into the cliffs -- one red window, a horned-skull crest over its door (Morvath's).
//
// Sections (world x):  ledge 0-1300 (the Narrow Ledge: under the high face)  |  face 1300-2600 (the Ice Face: the
// cliff sheathed in ice, icicles off every overhang)  |  gale 2600-3700 (the Windy Shelf: the face drops away, the
// open blizzard sky, gusts)  |  perch 3700-5200 (the Wyvern's Perch: an open shelf under the swirling sky; the boss
// arena is the last screen; past it the path leaves the right edge toward the mansion, HOOKS.exit).
//
// Back-to-front (drawBack): the blizzard sky (live gradient + the swirl at p 0.03) -> far icy peaks (p 0.08) -> crags
// across the gorge (p 0.3) -> the mansion in its cleft (p 0.55, the perch only) + its red window -> the cliff face
// (1.0: high, then low) -> the ledge, its icy lip and the white abyss below (1.0) -> the cold light band -> blowing snow.
// drawFront: near flakes and streaks (no occluders: the lane is narrow).
// windGust(k) (0..1.5, as eyrie.js): the snow streaks whip harder for ~1 s.
// Every static element is cached per scale (chunked strips + sprites, src/canvasmem.js); animated bits are live.

import { W, H, INK, FLOOR_TOP } from '../config.js';
import { STAGE_CS, layerCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 5200;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'ledge', name: 'The Narrow Ledge', x0: 0, x1: 1300 },
  { id: 'face', name: 'The Ice Face', x0: 1300, x1: 2600 },
  { id: 'gale', name: 'The Windy Shelf', x0: 2600, x1: 3700 },
  { id: 'perch', name: "The Wyvern's Perch", x0: 3700, x1: 5200 },
];
export const ARENAS = [450, 1700, 2950, CAM_MAX];
export const WAYSTONES = [2450];
const LANE = [14, 100];                                    // the walkable depth (the runtime clamps to it: L.lane)
const LIP = FLOOR_TOP + LANE[1] + 10;                      // the ledge's icy lip (screen y)
const BASE = FLOOR_TOP + 6;                                // where the cliff face meets the ledge (screen y)
const P_SWIRL = 0.03, P_PEAK = 0.08, P_MID = 0.3, P_MANSION = 0.55;
const MANSION = { lx: 3112, y: 236 };                      // its layer x (p 0.55: at screen ~760 on the boss screen), door sill y
const EXIT = LEVEL_LEN - 40;
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES, lane: LANE.slice(), gust: [[1450, 1650], [2650, 3650]], mansion: Math.round(MANSION.lx + CAM_MAX * (1 - P_MANSION)), exit: EXIT, lip: LIP };

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
const SKY = ['#272a63', '#3d3f86', '#6366ae', '#9a9dd2', '#c3c3e8'];
const ROCK = { base: '#5a6290', sh: '#434a74', hi: '#8790c0', crack: '#2c3158' };
const FACE = { base: '#6a74a6', sh: '#4c5584', hi: '#a4aed8', crack: '#323a66' };
const ICE = { deep: '#2a3a6e', dark: '#4a64a0', mid: '#86a8dc', light: '#b8d2f2', pale: '#dceaff', hi: '#f6fbff', glow: '170,200,255' };
const SNOW = { snow: '#eceefb', snowSh: '#b4bae0', hi: '#ffffff', deep: '#9aa0d0' };
const STONE = { base: '#585a6e', sh: '#3e4052', hi: '#7a7c92', joint: '#26283a' };
const LS = { far: ['#4a4c88', 0.45], mid: ['#34366a', 0.55], near: ['#1e2048', 0.66], front: ['#161838', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
// the cliff face's top edge (screen y): high over the ledge and the ice face, low on the shelf and the perch
const faceTop = (x) => {
  const hi = -30 + 70 * Math.max(0, Math.sin(x * 0.0041 + 1.2)) ** 3 + 30 * vnoise(x, 90, 4);
  const lo = 210 + 30 * Math.sin(x * 0.009) + 22 * vnoise(x, 60, 8);
  const k = sstep(2450, 2850, x), k2 = sstep(3650, 3950, x);
  return lerp(lerp(hi, lo, k), lo + 60, k2);
};

const LAY = (() => {
  const R = mulberry(5205);
  const flakes = [];
  for (let i = 0; i < 190; i++) flakes.push({ x: R.r(0, 1100), y: R.r(0, 560), sp: R.r(0.6, 1.6), sw: R.r(4, 16), ph: R.r(0, TAU), r: R.r(0.8, 2.4), layer: i < 130 ? 0 : 1 });
  const streaks = [];
  for (let i = 0; i < 40; i++) streaks.push({ x: R.r(0, 1300), y: R.r(20, 520), l: R.r(40, 120), sp: R.r(0.7, 1.4), a: R.r(0.15, 0.35), layer: i < 26 ? 0 : 1 });
  return { flakes, streaks };
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
// an icicle hanging from (x, y): width w, length len
function icicle(g, x, y, w, len, lean = 0, P = ICE, lw = 1.3) {
  const tip = [x + lean, y + len];
  ink(g, (g) => { g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x - w * 0.42 + lean * 0.3, y + len * 0.45, tip[0], tip[1]); g.quadraticCurveTo(x + w * 0.42 + lean * 0.3, y + len * 0.45, x + w / 2, y); g.closePath(); },
    P.light, lw, (g) => {
      g.fillStyle = P.mid; g.beginPath(); g.moveTo(x + w * 0.08, y); g.lineTo(x + w / 2 + 1, y); g.lineTo(tip[0] + 0.5, tip[1]); g.closePath(); g.fill();
      g.fillStyle = rgba(P.hi, 0.9); g.beginPath(); g.moveTo(x - w * 0.32, y); g.lineTo(x - w * 0.12, y); g.lineTo(tip[0] - 0.3, tip[1] - len * 0.18); g.closePath(); g.fill();
    });
}
// a snow cap along a top edge topFn(x) over [xl, xr]
function snowCap(g, xl, xr, topFn, depth, seed, lw = 1.5, over = 3) {
  const R = mulberry(seed);
  const s = [xl - over, topFn(xl) + depth * 0.5];
  for (let x = xl; x <= xr; x += 6) s.push(x, topFn(x) - R.r(1.5, 4));
  s.push(xr + over, topFn(xr) + depth * 0.5);
  for (let x = xr - 4; x > xl + 3; x -= R.r(7, 13)) s.push(x, topFn(x) + depth * R.r(0.5, 1.15));
  ink(g, (g) => blob(g, s), SNOW.snowSh, lw, (g) => { g.save(); g.translate(-1, -depth * 0.34); blob(g, s); g.fillStyle = SNOW.snow; g.fill(); g.restore(); });
}
// a chunk-safe snow edge along topFn over [xa, xb] (world-aligned samples, hashed: strips' chunks meet seamlessly)
function snowEdge(g, xa, xb, topFn, depth, seed, lw = 1.5) {
  const st = 6, a = al(xa, st) - st * 2, b = xb + st * 2, top = [], bot = [];
  for (let x = a; x <= b; x += st) { const i = Math.round(x / st); top.push(x, topFn(x) - 1.5 - 2.5 * hash1(i * 3 + seed)); }
  for (let x = al(b, st * 2); x >= a; x -= st * 2) { const i = Math.round(x / st); bot.push(x + (hash1(i + seed) - 0.5) * 4, topFn(x) + depth * (0.5 + 0.65 * hash1(i * 7 + seed))); }
  const pts = top.concat(bot);
  ink(g, (g) => blob(g, pts), SNOW.snowSh, lw, (g) => { g.save(); g.translate(-1, -depth * 0.34); blob(g, pts); g.fillStyle = SNOW.snow; g.fill(); g.restore(); });
}
// long vertical rock planes (the comic's cliff: tall facets split by dark cracks), lit from the left
function planes(g, xa, xb, ya, yb, P, seed, pw = 46, fixed = false) {
  g.fillStyle = P.base; g.fillRect(xa - 2, ya - 2, xb - xa + 4, yb - ya + 4);
  for (let i = Math.floor((xa - pw * 2) / pw); i * pw < xb + pw * 2; i++) {
    const x0 = i * pw + hash1(i * 7 + seed) * pw * 0.5, w = pw * (0.8 + hash1(i * 11 + seed) * 0.9), h = hash1(i * 13 + seed);
    const sk = (hash1(i * 17 + seed) - 0.5) * 30;    // a lean
    const top = fixed ? -60 + hash1(i * 19 + seed) * 200 : ya + hash1(i * 19 + seed) * (yb - ya) * 0.3;   // (fixed: the same in every strip)
    const p = [x0, yb + 4, x0 + sk, top, x0 + w * 0.55 + sk, top - 10 - h * 20, x0 + w + sk * 0.8, top + 6, x0 + w, yb + 4];
    poly(g, p); g.fillStyle = mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * 0.9); g.fill();
    g.fillStyle = rgba(P.hi, 0.5); poly(g, [x0, yb + 4, x0 + sk, top, x0 + sk + 7, top + 2, x0 + 6, yb + 4]); g.fill();
    g.fillStyle = rgba(P.sh, 0.55); poly(g, [x0 + w - 10, yb + 4, x0 + w + sk * 0.8 - 8, top + 8, x0 + w + sk * 0.8, top + 6, x0 + w, yb + 4]); g.fill();
    g.strokeStyle = rgba(P.crack, 0.75); g.lineWidth = 1.6; polyline(g, [x0, yb + 4, x0 + sk, top]); g.stroke();
    if (h > 0.6) { g.strokeStyle = rgba(P.crack, 0.5); g.lineWidth = 1.1; polyline(g, [x0 + w * 0.4, yb, x0 + w * 0.45 + sk * 0.5, lerp(top, yb, 0.5), x0 + w * 0.38 + sk * 0.7, top + 20]); g.stroke(); }
  }
}
function swirlSprite(r, sc) {
  // the blizzard's swirl (comic page 22): pale spiral arms, soft
  return makeSprite(r * 2, r * 2, r, r, sc, (g) => {
    g.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) {
      const a0 = arm * TAU / 3;
      for (const [lw, al] of [[34, 0.12], [20, 0.18], [9, 0.25]]) {
        g.strokeStyle = `rgba(225,228,255,${al})`; g.lineWidth = lw; g.beginPath();
        for (let k = 0; k <= 60; k++) { const u = k / 60, a = a0 + u * 4.2, rr = r * (0.08 + 0.85 * u); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.62); }
        g.stroke();
      }
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.3); gr.addColorStop(0, 'rgba(235,238,255,0.35)'); gr.addColorStop(1, 'rgba(235,238,255,0)');
    g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0;
  const st = stageCaches(build);
  const S = () => st.S;
  let gustK = 0, gustT0 = -99, curT = 0;
  const gustAt = (t) => { const d = t - gustT0; if (d < 0 || d > 4) return 0; return gustK * (d < 0.14 ? d / 0.14 : Math.exp(-(d - 0.14) * 2.4)); };
  function windGust(k) { gustK = Math.max(gustAt(curT), clamp(+k || 0, 0, 1.5)); gustT0 = curT; }
  const windAt = (camX, t) => 0.55 + 0.35 * sstep(2500, 2900, camX + W / 2) * (1 - sstep(3700, 4100, camX + W / 2) * 0.4) + 0.15 * Math.sin(t * 0.45) * Math.sin(t * 0.17 + 1) + 1.1 * gustAt(t);

  function build(cs, csFar) {
    const c = {};
    // (built nearest first: under a memory cap the first caches keep the full scale -- the floor under the fighters
    //  stays sharp, the far layers are the ones stepped down)
    const pr = layerRange(0, LEVEL_LEN, P_PEAK), mr = layerRange(0, LEVEL_LEN, P_MID);
    c.ground = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawLedge(g, xa, xb); });
    c.faceLo = buildStrip(-10, LEVEL_LEN + 10, 150, 376, cs, 1, (g, xa, xb) => { setLS('near'); drawFace(g, xa, xb, 150, 376); });
    // (the face: its high part only where it is high -- the ledge and the ice face; its low part the whole level)
    c.faceHi = buildStrip(-10, 2900, -10, 160, csFar, 1, (g, xa, xb) => { setLS('near'); drawFace(g, xa, xb, -10, 160); });
    c.light = lightBand(-10, LEVEL_LEN + 10, 280, 480, '220,226,255', [[0, 0], [0.35, 0.1], [0.6, 0.16], [0.85, 0.06], [1, 0]], [0, 0], Math.min(cs, 0.5));
    c.mansion = makeSprite(360, 420, 180, 250, csFar, (g) => { setLS('mid'); g.scale(0.72, 0.72); drawMansion(g); });
    c.swirl = swirlSprite(300, 0.5);
    c.glowRed = radialSprite(48, 0.5, [[0, 'rgba(255,60,50,0.9)'], [0.35, 'rgba(230,30,40,0.35)'], [1, 'rgba(200,20,30,0)']]);
    c.glowCold = radialSprite(64, 0.5, [[0, 'rgba(230,236,255,0.7)'], [0.4, 'rgba(200,210,255,0.25)'], [1, 'rgba(180,190,255,0)']]);
    c.flake = radialSprite(4, Math.max(1, cs), [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
    c.bigFlake = makeSprite(18, 18, 9, 9, Math.max(1, cs), (g) => {
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1.6; g.lineCap = 'round';
      for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(Math.cos(a) * -7, Math.sin(a) * -7); g.lineTo(Math.cos(a) * 7, Math.sin(a) * 7); g.stroke(); }
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, x = Math.cos(a) * 4.5, y = Math.sin(a) * 4.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a + 0.7) * 2.5, y + Math.sin(a + 0.7) * 2.5); g.moveTo(x, y); g.lineTo(x + Math.cos(a - 0.7) * 2.5, y + Math.sin(a - 0.7) * 2.5); g.stroke(); }
    });
    c.mid = buildStrip(mr[0], mr[1], 40, 372, csFar, P_MID, (g, xa, xb) => { setLS('mid'); drawMid(g, xa, xb); });
    c.peaks = buildStrip(pr[0], pr[1], 60, 330, csFar, P_PEAK, (g, xa, xb) => { setLS('far'); drawPeaks(g, xa, xb); });
    return c;
  }

  // ------------------------------------------------------------------ deep layers
  function drawPeaks(g, xa, xb) {
    // icy spires far off in the blizzard: pale violet, snow streaked, half lost in the white
    for (let i = Math.floor((xa - 160) / 90); i * 90 < xb + 160; i++) {
      const x = i * 90 + hash1(i * 7) * 50, top = 120 + hash1(i * 11) * 110, hw = 26 + hash1(i * 13) * 40;
      const p = [x - hw * 1.6, 332, x - hw * 0.5, top + 40, x - 4, top + 6, x, top, x + 6, top + 10, x + hw * 0.6, top + 50, x + hw * 1.5, 332];
      g.fillStyle = '#7d80bd'; poly(g, p); g.fill();
      g.fillStyle = rgba('#e4e6fa', 0.85); poly(g, [x - hw * 0.5, top + 40, x - 4, top + 6, x, top, x + 2, top + 30, x - hw * 0.2, top + 62]); g.fill();
      g.fillStyle = rgba('#5d5f9c', 0.5); poly(g, [x, top, x + 6, top + 10, x + hw * 0.6, top + 50, x + hw * 1.5, 332, x + 8, 332]); g.fill();
    }
    vgrad(g, xa - 2, 140, xb - xa + 4, 330, [[0, 'rgba(190,192,232,0.1)'], [1, 'rgba(195,197,236,0.9)']]);
  }
  function crag(g, x, top, hw, seed, P) {
    const R = mulberry(seed), foot = 380, Lp = [], Rp = [];
    for (let k = 0; k <= 7; k++) { const f = k / 7, y = lerp(top, foot, f), w = hw * (0.35 + 0.65 * Math.sqrt(f)) * (1 + R.r(-0.08, 0.08)); Lp.push(x - w, y); Rp.unshift(x + w * 0.9, y); }
    const shape = (g) => poly(g, Lp.concat(Rp));
    ink(g, shape, P.base, 1.8, (g) => {
      planes(g, x - hw * 1.2, x + hw * 1.2, top - 20, foot, P, seed, 22);
      g.fillStyle = rgba(P.sh, 0.45); g.fillRect(x + hw * 0.2, top, hw, foot - top);
    });
    snowCap(g, x - hw * 0.45, x + hw * 0.4, (xx) => top + Math.abs(xx - x) * 0.9 + 2, 9, seed + 1, 1.4);
    { const yy = lerp(top + 50, foot - 90, R()), ww = hw * 0.55; snowCap(g, x - ww - 4, x - ww * 0.1, (xx) => yy + (xx - x + ww) * 0.25, 5, seed + 10, 1.1); icicle(g, x - ww * 0.55, yy + 4, 4, 10 + R() * 10, 0.5, ICE, 1); }
  }
  function drawMid(g, xa, xb) {
    for (let i = Math.floor((xa - 200) / 150); i * 150 < xb + 200; i++) {
      if (hash1(i * 5 + 1) < 0.25) continue;
      const x = i * 150 + hash1(i * 7 + 2) * 80, top = 90 + hash1(i * 11 + 3) * 140, hw = 34 + hash1(i * 13) * 40;
      crag(g, x, top, hw, 200 + i, { base: '#6c70ac', sh: '#53568c', hi: '#9ea2d8', crack: '#3c3f72' });
    }
    vgrad(g, xa - 2, 200, xb - xa + 4, 372, [[0, 'rgba(200,202,240,0)'], [0.55, 'rgba(200,202,240,0.45)'], [1, 'rgba(214,216,246,0.85)']]);
  }
  // the gloomy mansion built into the cliffs (sprite: door sill at 0,0): dark stone, spires with snowy roofs, one red
  // window (lit live), a horned-skull crest over the arched door, flanked by icy rock
  function drawMansion(g) {
    const P = STONE;
    // the cliff it is built into: a dark mass of rock behind and above it, snow on its shelves
    const mass = [-215, 240, -236, 150, -212, 80, -230, 10, -206, -60, -222, -130, -196, -200, -176, -250, -150, -300, -60, -330, 40, -320, 140, -300, 188, -262, 200, -220, 222, -160, 204, -90, 226, -20, 212, 50, 236, 130, 226, 240];
    ink(g, (g) => poly(g, mass), '#4f5584', 2, (g) => { planes(g, -240, 240, -340, 250, { base: '#4f5584', sh: '#3c416c', hi: '#7a82b6', crack: '#262a52' }, 90, 26); g.fillStyle = 'rgba(30,32,70,0.35)'; g.fillRect(-240, -340, 480, 600); });
    // the path: switchbacks of trodden snow from the foot of the cliff up to the door's steps, footprints along it
    const path = [150, 236, 60, 196, 130, 150, 40, 104, 92, 60, 20, 20, 0, 4];
    g.lineCap = 'round'; g.lineJoin = 'round';
    polyline(g, path); g.strokeStyle = LINE; g.lineWidth = 20 * LK + 3; g.stroke();
    polyline(g, path); g.strokeStyle = '#e8eaf8'; g.lineWidth = 20; g.stroke();
    polyline(g, path); g.strokeStyle = '#b4bae0'; g.lineWidth = 6; g.stroke();
    for (let k = 0; k < path.length - 2; k += 2) for (let f = 0.2; f < 1; f += 0.3) { const x = lerp(path[k], path[k + 2], f), y = lerp(path[k + 1], path[k + 3], f); g.fillStyle = '#8a90c4'; g.beginPath(); g.ellipse(x + (f * 10 % 2 ? 3 : -3), y, 3, 1.6, 0, 0, TAU); g.fill(); }
    for (const [x0, x1, y] of [[-170, -90, -240], [100, 180, -200], [-40, 60, -300]]) snowCap(g, x0, x1, () => y, 6, x0 + 500, 1.1);
    // the cleft's icy rock either side
    for (const s of [-1, 1]) {
      const rock = (g) => poly(g, [s * 70, 10, s * 96, -150, s * 120, -250, s * 150, -312, s * 172, -296, s * 160, -240, s * 182, -170, s * 166, -100, s * 186, -40, s * 170, 10]);
      ink(g, rock, '#5d6496', 2, (g) => { planes(g, s > 0 ? 60 : -170, s > 0 ? 170 : -60, -320, 12, { base: '#5d6496', sh: '#474d7c', hi: '#8e96c8', crack: '#2e335e' }, 70 + s, 20); });
      snowCap(g, s * 96 - 12, s * 96 + 12, () => -150, 6, 80 + s, 1.2);
    }
    // the house: a main block, two towers with conical roofs, a central gable
    const block = (x0, x1, y0, y1) => ink(g, (g) => poly(g, [x0, y1, x0, y0, x1, y0, x1, y1]), P.base, 2, (g) => {
      for (let y = y1; y > y0; y -= 12) { g.fillStyle = rgba(P.joint, 0.6); g.fillRect(x0, y - 1, x1 - x0, 1.2); for (let x = x0 + ((y / 12) % 2 ? 0 : 10); x < x1; x += 20) g.fillRect(x, y - 12, 1.2, 12); }
      g.fillStyle = rgba(P.sh, 0.6); g.fillRect(x1 - (x1 - x0) * 0.3, y0, (x1 - x0) * 0.3, y1 - y0);
    });
    const roof = (cx, w, y, h) => { ink(g, (g) => poly(g, [cx - w, y, cx, y - h, cx + w, y]), '#2e3046', 2, (g) => { g.fillStyle = '#3c3e58'; poly(g, [cx - w, y, cx, y - h, cx - 2, y]); g.fill(); }); snowCap(g, cx - w * 0.9, cx - 1, (x) => y - (x - (cx - w)) * h / w + 3, 5, cx | 0, 1.1); };
    block(-56, 56, -150, 0);
    block(-92, -52, -190, -20); block(52, 92, -176, -20);
    roof(-72, 26, -190, 70); roof(72, 26, -176, 60);
    ink(g, (g) => poly(g, [-60, -150, 0, -200, 60, -150]), '#2e3046', 2, (g) => { g.fillStyle = '#3c3e58'; poly(g, [-60, -150, 0, -200, -2, -150]); g.fill(); });
    snowCap(g, -58, 0, (x) => -150 - (x + 60) * 50 / 60 + 3, 6, 55, 1.2);
    // windows: dark ones, and the one red window (its glow is live)
    for (const [x, y] of [[-80, -150], [72, -136], [-38, -126], [38, -126]]) { ink(g, (g) => { roundRect(g, x - 6, y - 12, 12, 20, 6); }, '#1c1e2e', 1.4); }
    ink(g, (g) => { g.beginPath(); g.moveTo(-11, -150); g.lineTo(-11, -172); g.quadraticCurveTo(0, -186, 11, -172); g.lineTo(11, -150); g.closePath(); }, '#ff3a30', 1.6, (g) => { g.fillStyle = '#ffb08a'; g.fillRect(-7, -170, 4, 16); g.strokeStyle = '#5a1010'; g.lineWidth = 1.4; polyline(g, [0, -182, 0, -150]); g.stroke(); polyline(g, [-11, -162, 11, -162]); g.stroke(); });
    // the door: steps, an arch, the wooden door, the horned skull crest above
    ink(g, (g) => poly(g, [-34, 0, -30, -8, 30, -8, 34, 0]), P.hi, 1.6);
    ink(g, (g) => { g.beginPath(); g.moveTo(-24, -8); g.lineTo(-24, -44); g.quadraticCurveTo(0, -72, 24, -44); g.lineTo(24, -8); g.closePath(); }, '#6a6c84', 2, (g) => { g.fillStyle = P.sh; g.fillRect(10, -70, 20, 62); });
    ink(g, (g) => { g.beginPath(); g.moveTo(-17, -8); g.lineTo(-17, -42); g.quadraticCurveTo(0, -62, 17, -42); g.lineTo(17, -8); g.closePath(); }, '#6a4128', 1.6, (g) => { g.strokeStyle = '#3a2214'; g.lineWidth = 1.4; for (const x of [-8, 0, 8]) { polyline(g, [x, -10, x, -54]); g.stroke(); } g.fillStyle = '#2a2a36'; g.fillRect(-17, -36, 34, 3); g.fillRect(-17, -22, 34, 3); });
    // the crest: a horned skull carved over the arch
    g.save(); g.translate(0, -84);
    ink(g, (g) => { g.beginPath(); g.moveTo(-8, -4); g.quadraticCurveTo(-22, -14, -26, -32); g.quadraticCurveTo(-16, -22, -6, -14); g.closePath(); }, '#c9c3b0', 1.4);
    ink(g, (g) => { g.beginPath(); g.moveTo(8, -4); g.quadraticCurveTo(22, -14, 26, -32); g.quadraticCurveTo(16, -22, 6, -14); g.closePath(); }, '#c9c3b0', 1.4);
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -4, 11, 10, 0, Math.PI, 0); g.lineTo(8, 6); g.lineTo(-8, 6); g.closePath(); }, '#d8d2c0', 1.6, (g) => { g.fillStyle = '#1a1420'; g.beginPath(); g.ellipse(-4.5, -3, 3, 3.4, 0, 0, TAU); g.ellipse(4.5, -3, 3, 3.4, 0, 0, TAU); g.fill(); g.fillRect(-1, 2, 2, 3); });
    g.restore();
    // snow banked at the foot, the path's start
    snowCap(g, -110, 110, (x) => 2 + Math.abs(x) * 0.04, 10, 99, 1.4);
  }

  // ------------------------------------------------------------------ near: the cliff face, the ledge
  function drawFace(g, xa, xb, y0, y1) {
    // the sheer face: tall rock planes sheathed in ice, snow on its ledges, icicles under the overhangs
    const top = (g) => { g.beginPath(); g.moveTo(xa - 6, y1 + 8); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, faceTop(x)); g.lineTo(xb + 6, y1 + 8); g.closePath(); };
    ink(g, top, FACE.base, 2.2, (g) => {
      planes(g, xa, xb, -60, 380, FACE, 11, 48, true);
      // ice sheathing: pale vertical sheets where the face is high (the Ice Face thickest)
      for (let i = Math.floor((xa - 80) / 64); i * 64 < xb + 80; i++) {
        const x = i * 64 + hash1(i * 7) * 40, k = (1 - sstep(2500, 2800, x)) * sstep(1200, 1500, x);
        if (k < 0.05 || hash1(i * 3 + 1) > k * 0.6) continue;
        const w = 18 + hash1(i * 11) * 26, t = faceTop(x) + 10 + hash1(i * 17) * 40, b = Math.min(BASE - 20, t + 120 + hash1(i * 13) * 180);   // (world-fixed: no seam between the face's strips)
        ink(g, (g) => { g.beginPath(); g.moveTo(x - w / 2, t); g.lineTo(x + w / 2, t); g.quadraticCurveTo(x + w * 0.6, (t + b) / 2, x + w * 0.2, b); g.lineTo(x - w * 0.1, b - 10); g.quadraticCurveTo(x - w * 0.6, (t + b) / 2, x - w / 2, t); g.closePath(); }, rgba(ICE.light, 0.75), 1.2, (g) => { g.fillStyle = rgba(ICE.hi, 0.7); g.fillRect(x - w * 0.4, t, 4, b - t); g.fillStyle = rgba(ICE.mid, 0.5); g.fillRect(x + w * 0.1, t, w * 0.4, b - t); });
      }
      vgrad(g, xa, -10, xb - xa, 376, [[0, 'rgba(30,32,80,0.25)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(200,205,245,0.25)']]);
    });
    // the top edge: snow cornice and icicles where the face is low enough to show it
    snowEdge(g, xa, xb, (x) => faceTop(x), 10, 311, 1.5);
    for (let i = Math.floor(xa / 13) - 2; i * 13 < xb + 26; i++) {
      const x = i * 13 + hash1(i * 5) * 8, ty = faceTop(x);
      if (ty > BASE - 40 || hash1(i * 9) < 0.35) continue;
      icicle(g, x, ty + 7, 5 + hash1(i * 11) * 4, 10 + hash1(i * 13) * 26, 0.5, ICE, 1.1);
    }
    // snow streaked down the face's cracks (no ledges on the face: nothing that reads as a platform)
    for (let i = Math.floor((xa - 100) / 110); i * 110 < xb + 100; i++) {
      const x = i * 110 + hash1(i * 17) * 70, y0 = Math.max(faceTop(x) + 24, 20 + hash1(i * 23) * 120), l = 40 + hash1(i * 19) * 90;
      if (y0 + l > BASE - 30 || hash1(i * 29) < 0.4) continue;
      g.strokeStyle = rgba(SNOW.snow, 0.55); g.lineWidth = 3; g.lineCap = 'round'; polyline(g, [x, y0, x + 3, y0 + l * 0.5, x - 1, y0 + l]); g.stroke();
    }
    // where the face meets the ledge: banked snow
    if (y1 >= BASE) snowEdge(g, xa, xb, (x) => BASE - 10 - 6 * Math.abs(Math.sin(x * 0.02)) - 4 * vnoise(x, 17, 2), 14, 977, 1.5);
  }
  function drawLedge(g, xa, xb) {
    // the abyss below the lip: violet depths, far crag tops, swirling white
    vgrad(g, xa - 2, LIP - 10, xb - xa + 4, H, [[0, '#a8aade'], [0.4, '#7c7fbe'], [1, '#55589a']]);
    for (let i = Math.floor((xa - 80) / 70); i * 70 < xb + 80; i++) {
      const x = i * 70 + hash1(i * 3) * 40, top = LIP + 30 + hash1(i * 5) * 30, hw = 14 + hash1(i * 7) * 20;
      g.fillStyle = rgba('#6a6db0', 0.8); poly(g, [x - hw, H + 4, x - 2, top, x + 2, top + 2, x + hw, H + 4]); g.fill();
      g.fillStyle = rgba('#e6e8fb', 0.7); poly(g, [x - hw * 0.3, top + 12, x - 2, top, x + 2, top + 2, x + hw * 0.25, top + 10]); g.fill();
    }
    // the ledge's own rock face dropping away under the lip, swallowed by the blizzard's white further down
    g.save(); g.beginPath(); g.rect(xa - 4, LIP, xb - xa + 8, H - LIP + 4); g.clip();
    planes(g, xa, xb, LIP - 4, H + 6, { base: '#4a5288', sh: '#363d6c', hi: '#6c76ae', crack: '#232850' }, 91, 30, true);
    g.restore();
    vgrad(g, xa - 2, LIP + 8, xb - xa + 4, H, [[0, 'rgba(214,216,246,0)'], [0.55, 'rgba(214,216,246,0.55)'], [1, 'rgba(226,228,252,0.9)']]);
    // the ledge: packed snow over rock, blue hollows, wind ripples, a few rocks poking through, old footprints
    const lipY = (x) => LIP + 3 * Math.sin(x * 0.021) + 3 * vnoise(x, 23, 5) + 26 * sstep(LEVEL_LEN - 520, LEVEL_LEN - 300, x);   // (wider at the very end: the path)
    const top = (g) => { g.beginPath(); g.moveTo(xa - 6, 352); g.lineTo(xb + 6, 352); for (let x = al(xb, 6) + 6; x >= xa - 6; x -= 6) g.lineTo(x, lipY(x)); g.closePath(); };
    ink(g, top, '#dfe2f6', 1.8, (g) => {
      vgrad(g, xa - 2, 352, xb - xa + 4, LIP + 30, [[0, '#b9bde4'], [0.18, '#d4d7f1'], [0.6, '#e6e8f8'], [1, '#c9cdee']]);
      for (let r = 0; r < 5; r++) {
        const y = 384 + r * 18;
        for (let i = Math.floor((xa - 200) / 180); i * 180 < xb + 200; i++) {
          const h = hash2(i, r * 13 + 5); if (h < 0.4) continue;
          const x = i * 180 + hash2(i, r * 7) * 100, w = 50 + h * 90;
          g.fillStyle = rgba(h > 0.7 ? '#ffffff' : '#a7acd8', h > 0.7 ? 0.45 : 0.3); g.beginPath(); g.ellipse(x, y, w, 2.5 + r * 0.6, 0, 0, TAU); g.fill();
        }
      }
      for (let i = Math.floor((xa - 60) / 150); i * 150 < xb + 60; i++) {
        const x = i * 150 + hash1(i * 31) * 100, y = 392 + hash1(i * 37) * 60, h = hash1(i * 41);
        if (h < 0.3) { ink(g, (g) => blob(g, [x - 16, y + 4, x - 12, y - 6, x, y - 10, x + 12, y - 5, x + 15, y + 4]), ROCK.base, 1.4, (g) => { g.fillStyle = rgba(ROCK.hi, 0.6); g.fillRect(x - 10, y - 10, 12, 4); }); snowCap(g, x - 12, x + 8, (xx) => y - 8 + Math.abs(xx - x + 2) * 0.3, 4, i, 1); }
        else if (h < 0.55) { g.fillStyle = rgba('#a8b8e8', 0.55); g.beginPath(); g.ellipse(x, y, 34, 5, 0, 0, TAU); g.fill(); g.strokeStyle = rgba('#ffffff', 0.85); g.lineWidth = 1.4; polyline(g, [x - 14, y + 2, x - 4, y - 3]); g.stroke(); polyline(g, [x + 4, y + 2, x + 12, y - 2]); g.stroke(); }
      }
      // footprints along the ledge (the heroes' way), and on the path at the end toward the mansion
      for (let i = Math.floor(xa / 40) - 1; i * 40 < xb + 40; i++) {
        const x = i * 40 + (i % 2) * 6, y = 430 + (i % 2 ? 7 : -7) + Math.sin(i * 0.3) * 6;
        if (hash1(i * 3) < 0.25 && x < LEVEL_LEN - 600) continue;
        g.fillStyle = rgba('#9da4d6', 0.55); g.beginPath(); g.ellipse(x, y, 6, 2.6, 0, 0, TAU); g.fill();
      }
      vgrad(g, xa - 2, 352, xb - xa + 4, 384, [[0, 'rgba(70,74,130,0.35)'], [1, 'rgba(70,74,130,0)']]);
    });
    // the lip: a snow cornice curling over, its icy underside, icicles hanging into the drop
    const under = (x) => lipY(x) + 14 + 4 * Math.sin(x * 0.07) + 3 * vnoise(x, 11, 9);
    ink(g, (g) => { g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, lipY(x) - 1); for (let x = al(xb, 6) + 6; x >= xa - 6; x -= 6) g.lineTo(x, under(x)); g.closePath(); }, '#7d88c4', 1.8, (g) => {
      g.fillStyle = '#9fb2e2'; g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, lipY(x)); for (let x = al(xb, 6) + 6; x >= xa - 6; x -= 6) g.lineTo(x, lipY(x) + 5); g.closePath(); g.fill();
      g.strokeStyle = rgba('#ffffff', 0.85); g.lineWidth = 2; g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, lipY(x) + 1); g.stroke();
    });
    for (let i = Math.floor(xa / 11) - 2; i * 11 < xb + 22; i++) {
      if (hash1(i * 7 + 3) < 0.3) continue;
      const x = i * 11 + hash1(i) * 6;
      icicle(g, x, under(x) - 2, 5 + hash1(i * 5) * 5, 8 + hash1(i * 9) * 26 * (hash1(i * 13) > 0.85 ? 1.8 : 1), 0.5, ICE, 1.1);
    }
    // the path at the very end: it turns off the ledge and runs right, off the map, toward the mansion
    if (xb > LEVEL_LEN - 700) {
      const x0 = LEVEL_LEN - 640;
      g.fillStyle = rgba('#f4f5fd', 0.9); g.beginPath(); g.moveTo(x0, 470); g.quadraticCurveTo(x0 + 300, 430, LEVEL_LEN + 20, 380); g.lineTo(LEVEL_LEN + 20, 440); g.quadraticCurveTo(x0 + 320, 470, x0 + 40, 488); g.closePath(); g.fill();
      for (let k = 0; k < 16; k++) { const u = k / 15, x = lerp(x0 + 40, LEVEL_LEN, u), y = lerp(474, 412, u) + (k % 2 ? 5 : -5); g.fillStyle = rgba('#9da4d6', 0.7); g.beginPath(); g.ellipse(x, y, 6 - u * 2, 2.4, -0.2, 0, TAU); g.fill(); }
      // a leaning signpost: the end of the map
      const sx = LEVEL_LEN - 300;
      ink(g, (g) => poly(g, [sx - 3, 380, sx + 3, 380, sx + 6, 300, sx, 300]), '#5a4a5a', 1.6);
      ink(g, (g) => poly(g, [sx - 26, 300, sx + 30, 304, sx + 40, 314, sx + 28, 322, sx - 26, 318]), '#7a6a6e', 1.6, (g) => { g.strokeStyle = '#3a2c34'; g.lineWidth = 1.4; polyline(g, [sx - 18, 310, sx + 22, 312]); g.stroke(); });
      snowCap(g, sx - 26, sx + 30, (x) => 300 + (x - sx) * 0.07, 4, 61, 1.1);
    }
  }

  // ------------------------------------------------------------------ per frame
  function sky(ctx, C, camX, t) {
    const gr = ctx.createLinearGradient(0, 0, 0, 380);
    gr.addColorStop(0, SKY[0]); gr.addColorStop(0.3, SKY[1]); gr.addColorStop(0.6, SKY[2]); gr.addColorStop(0.85, SKY[3]); gr.addColorStop(1, SKY[4]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 380);
    // the swirl (comic page 22), turning slowly
    for (const [lx, ly, sc, sp] of [[300, 120, 1, 0.05], [1100, 90, 0.75, -0.04]]) {
      const x = ((lx - camX * P_SWIRL) % 1500 + 1500) % 1500 - 300;
      ctx.save(); ctx.translate(x, ly); ctx.rotate(t * sp); ctx.scale(sc, sc);
      ctx.drawImage(C.swirl.c, -C.swirl.ox, -C.swirl.oy, C.swirl.w, C.swirl.h); ctx.restore();
    }
    glowAt(ctx, C.glowCold, 480, 330, 520, 0.35, 120);
  }
  function snow(ctx, C, camX, t, layer) {
    const wind = windAt(camX, t), par = layer ? 1.35 : 0.85;
    // streaks blowing across (more in the gusts)
    ctx.save(); ctx.lineCap = 'round';
    for (const s of LAY.streaks) {
      if (s.layer !== layer) continue;
      const x = ((s.x - camX * par - t * 420 * s.sp * wind) % 1300 + 1300) % 1300 - 170, y = s.y + Math.sin(t * 2 + s.x) * 6;
      ctx.strokeStyle = `rgba(240,242,255,${Math.min(0.6, s.a * wind * (layer ? 1.3 : 1))})`; ctx.lineWidth = layer ? 2.2 : 1.4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + s.l * 0.5, y - 4, x + s.l * (0.6 + wind * 0.4), y + 3); ctx.stroke();
    }
    ctx.restore();
    // flakes driven sideways
    for (const f of LAY.flakes) {
      if (f.layer !== layer) continue;
      const y = ((f.y + t * 60 * f.sp) % 580 + 580) % 580 - 20;
      const x = ((f.x - camX * par - t * 160 * wind * f.sp + Math.sin(t * 1.5 + f.ph) * f.sw) % 1100 + 1100) % 1100 - 70;
      // (the big glyphs only up in the sky, behind the fighters: never over the lane)
      if (!layer && f.r > 2) { if (y > 330) continue; ctx.globalAlpha = 0.85; ctx.save(); ctx.translate(x, y); ctx.rotate(t * f.sp + f.ph); ctx.drawImage(C.bigFlake.c, -C.bigFlake.ox, -C.bigFlake.oy, C.bigFlake.w, C.bigFlake.h); ctx.restore(); continue; }
      const r = f.r * (layer ? 1.6 : 1.1);
      ctx.globalAlpha = layer ? 0.9 : 0.75; ctx.drawImage(C.flake.c, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX); curT = t;
    ctx.save();
    ctx.fillStyle = SKY[3]; ctx.fillRect(0, 0, W, H);
    sky(ctx, C, camX, t);
    drawStrip(ctx, C.peaks, camX, s);
    drawStrip(ctx, C.mid, camX, s);
    // the mansion in its cleft, its one red window glowing
    const mx = MANSION.lx - camX * P_MANSION;
    if (mx > -200 && mx < W + 200) {
      drawSprites(ctx, [{ spr: C.mansion, x: MANSION.lx, y: MANSION.y }], camX, s, P_MANSION);
      const f = 0.8 + 0.2 * Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1);
      glowAt(ctx, C.glowRed, mx, MANSION.y - 164 * 0.72, 34 * f, 0.75);
    }
    if (camX < 2900) drawStrip(ctx, C.faceHi, camX, s);
    drawStrip(ctx, C.faceLo, camX, s);
    drawStrip(ctx, C.ground, camX, s);
    ctx.globalCompositeOperation = 'screen'; drawStrip(ctx, C.light, camX, s); ctx.globalCompositeOperation = 'source-over';
    snow(ctx, C, camX, t, 0);
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0) {
    const C = st.ensure();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    snow(ctx, C, camX, t, 1);
    ctx.restore();
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(60,64,120,0.3)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  return { setScale: st.setScale, setWarm, windGust, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 62, h: 58, colors: ['#9a6a3e', '#6a4526', '#eceefb', '#b8d2f2'] },
  barrel: { w: 48, h: 60, colors: ['#7e5534', '#523620', '#eceefb', '#5b5a62'] },
  urn:    { w: 52, h: 58, colors: ['#b8d2f2', '#86a8dc', '#f6fbff', '#5a6290'] },
};
const FROST = { snow: '#f2f4fe', sh: '#b8bce4' };
function frostCap(g, pts) { ink(g, (g) => blob(g, pts), FROST.snow, 1.4, (g) => { g.fillStyle = FROST.sh; g.fillRect(-60, pts[1] + 2, 120, 10); }); }
const PROP_DRAW = {
  crate(g) {   // a climber's supply crate, snowed over
    const wood = '#9a6a3e', woodSh = '#6a4526', woodHi = '#c4935e', woodDk = '#4a2e1a', iron = '#4f5466';
    const L = -30, Rr = 24, T = -40, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), woodSh, 2.6);
    ink(g, (g) => poly(g, [L, T, Rr, T, Rr + dx, T + dy, L + dx, T + dy]), woodHi, 2.4);
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4; for (const y of [-14, -27]) { polyline(g, [L, y, Rr, y]); g.stroke(); }
      g.fillStyle = woodSh; g.fillRect(L, T, 6, 40); g.fillRect(Rr - 6, T, 6, 40);
      g.fillStyle = iron; for (const [x, y] of [[L, T], [Rr - 9, T], [L, -9], [Rr - 9, -9]]) g.fillRect(x, y, 9, 9);
      g.fillStyle = 'rgba(220,226,255,0.55)'; g.fillRect(L, -8, Rr - L, 8);
    });
    frostCap(g, [L - 2, T, L + 10, T - 7, Rr - 6, T - 11, Rr + dx + 2, T + dy - 4, Rr + 2, T + 2, L + 14, T + 3]);
  },
  barrel(g) {  // a barrel with an ice-coated lid
    const wood = '#7e5534', woodSh = '#523620', woodHi = '#a87650', iron = '#4f5466', ironHi = '#8e94a8';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -52); g.quadraticCurveTo(-27, -26, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -26, 18, -52); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -60, 30, 66); g.fillStyle = woodHi; g.fillRect(-19, -54, 5, 58);
      for (const y of [-44, -8]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.4); }
      g.fillStyle = 'rgba(214,220,255,0.45)'; g.fillRect(-30, -60, 60, 14);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 18, 5.5, 0, 0, TAU); }, '#dce4fc', 2.4, (g) => { g.fillStyle = '#ffffff'; g.fillRect(-12, -55, 10, 2); });
    for (const [x, l] of [[-14, 9], [-4, 13], [9, 8], [16, 6]]) ink(g, (g) => poly(g, [x - 2.5, -48, x + 2.5, -48, x, -48 + l]), '#cfdcfb', 1.1);
  },
  urn(g) {     // a cluster of ice crystals on a snowy rock
    ink(g, (g) => blob(g, [-26, 2, -22, -12, -6, -18, 12, -16, 26, -6, 22, 4]), '#5a6290', 2.6, (g) => { g.fillStyle = '#434a74'; g.fillRect(4, -20, 30, 26); });
    const list = [[-0.55, 30, 12, -12], [0.5, 32, 12, 12], [-0.2, 44, 15, -4], [0.15, 50, 16, 4], [0.8, 22, 10, 18]];
    for (const [a, L, w, x] of list.sort((p, q) => q[1] - p[1])) {
      g.save(); g.translate(x, -10); g.rotate(a);
      const hw = w / 2;
      ink(g, (g) => poly(g, [-hw, 4, -hw, -L * 0.72, 0, -L, hw, -L * 0.72, hw, 4]), '#b8d2f2', 2.4, (g) => {
        g.fillStyle = '#86a8dc'; g.fillRect(hw * 0.15, -L, hw, L + 6);
        g.fillStyle = '#eef6ff'; poly(g, [-hw, 4, -hw, -L * 0.72, 0, -L, -hw * 0.3, -L * 0.68, -hw * 0.4, 4]); g.fill();
      });
      g.restore();
    }
    ink(g, (g) => blob(g, [-28, 2, -24, -8, -10, -10, 4, -6, 18, -9, 28, 0, 10, 6]), FROST.snow, 1.6);
  },
};
