// Dodongo's Quest - Mystic Mountain stage 2 "THE TROLL BRIDGE" (src/stages/mmbridge.js): background, deck, props.
//
// The comic's chapter three (pages 16-21): golden late afternoon, an ancient arched stone bridge with low crumbling
// walls over a bottomless misty chasm between sheer sandstone cliffs, snowy peaks ahead.  At the far end the colossal
// stone troll rises out of the mist (he is drawn by the runtime, through setBehind).
//
// Sections (world x):  path 0-900 (the Cliff Path: a ledge along the sheer cliff up to the bridge head at x 820)  |
// bridge 900-2600 (the Old Bridge: the deck, its low back wall, rock stacks in the haze)  |  span 2600-4100 (the
// Crumbling Span: the walls broken and leaning, flagstones gone)  |  gap 4100-5600 (the Troll's Gap: mid-span over the
// deepest mist, the far cliff behind; the boss arena is the last screen).
//
// Back-to-front (drawBack): the golden sky (live gradient, the sun) -> snowy peaks (p 0.05) -> canyon cliffs and rock
// stacks (p 0.3) -> the far cliff of the Troll's Gap (p 0.6) -> chasm mist (live) -> [setBehind's fn: the troll] ->
// the mist bank (live) -> the cliff of the path (1.0) -> the bridge's back wall + its breakable segments (1.0) -> the
// deck (1.0) -> the golden light band -> dust motes.   drawFront: the front wall + its breakable segments (along
// the very bottom), drifting mist wisps.
// HOOKS.walls: the breakable wall segments { x0, x1, side 'back' | 'front' }; setWall(i, s): 0 intact, 0..1 cracking
// (cracks spread, the blocks shift), 1 broken (a gap, rubble on the deck's edge).  HOOKS.troll: { x (his head's
// centre), headY (the screen y of his nose fully risen: the climb target), mistY (where the mist bank's top lies) }.
// setBehind(fn): fn(ctx, camX, t) is called inside drawBack behind the mist bank and the back wall.  setTrollMist(k):
// the mist churns (0..1) as he rises.
// Every static element is cached per scale (chunked strips + sprites, src/canvasmem.js); animated bits are live.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 5600;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'path', name: 'The Cliff Path', x0: 0, x1: 900 },
  { id: 'bridge', name: 'The Old Bridge', x0: 900, x1: 2600 },
  { id: 'span', name: 'The Crumbling Span', x0: 2600, x1: 4100 },
  { id: 'gap', name: "The Troll's Gap", x0: 4100, x1: 5600 },
];
export const ARENAS = [450, 1800, 3200, CAM_MAX];
export const WAYSTONES = [2500];
const BR0 = 820;                                   // the bridge head (the deck runs from here to the level's end)
const SEG_W = 150;
const WALLS = [
  { x0: 1230, side: 'back' }, { x0: 2060, side: 'front' }, { x0: 2770, side: 'back' },
  { x0: 3250, side: 'front' }, { x0: 3630, side: 'back' }, { x0: 3990, side: 'front' },
].map((w) => ({ x0: w.x0, x1: w.x0 + SEG_W, side: w.side }));
const TROLL = { x: 5300, headY: 200, mistY: 318 };
const TROLL_FACE = [5180, 5420];                   // the mist thins over his face (world x)
const faceK = (x) => sstep(TROLL_FACE[0] - 60, TROLL_FACE[0], x) * (1 - sstep(TROLL_FACE[1], TROLL_FACE[1] + 60, x));
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES, bridge: [BR0, LEVEL_LEN], walls: WALLS.map((w) => ({ ...w })), troll: { ...TROLL } };

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
const P_PEAK = 0.05, P_MID = 0.3, P_FAR_CLIFF = 0.45;
const GT0 = 340;
const WALL_TOP = 316, WALL_BOT = 364;            // the back wall's coping top / foot (screen y)
const FW_TOP = 516;                               // the front wall's top (screen y)
const SKY = ['#e2b56e', '#efcb8c', '#f8e2b4', '#fcefd2'];
const SAND = { base: '#c99f6c', sh: '#a27848', hi: '#e8c792', crack: '#7a5634', deep: '#6e4c2e' };
const STONE = { base: '#c8a87c', sh: '#9f7f56', hi: '#ecd2a4', joint: '#6e5232', dark: '#5a4128' };
const WEAK = { base: '#e6c38a', sh: '#c39a5e', hi: '#fbe6b8', joint: '#8a6436', dark: '#6a4a26' };   // (the breakable segments)
const DECK = { base: '#bf9f72', sh: '#a3845a', hi: '#dcc196', joint: '#7b5d3c', worn: '#d4b98c' };
const MOSS = { base: '#7f8c3c', sh: '#5d6a2a', hi: '#adb85e' };
const MIST = '255,240,214';
const LS = { far: ['#9a7a5a', 0.45], mid: ['#7a5a3c', 0.55], near: ['#4e3622', 0.66], front: ['#3e2a1a', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const spanK = (x) => sstep(2500, 2800, x) * (1 - sstep(4000, 4300, x));    // the Crumbling Span's wear
const gapK = (x) => sstep(4300, 4700, x);                                    // the deepest mist, the far cliff

const LAY = (() => {
  const R = mulberry(5600);
  const motes = [];
  for (let i = 0; i < 70; i++) motes.push({ x: R.r(0, 1000), y: R.r(40, 540), sp: R.r(0.3, 1), sw: R.r(6, 20), ph: R.r(0, TAU), fr: R.r(0.2, 0.8), layer: i < 50 ? 0 : 1 });
  const mist = [];
  for (let i = 0; i < 18; i++) mist.push({ x: R.r(0, 1600), y: R.r(0, 1), w: R.r(300, 560), a: R.r(0.3, 0.55), sp: R.r(5, 14), layer: i % 3 });
  const birds = [];
  for (let i = 0; i < 5; i++) birds.push({ x: R.r(0, 1400), y: R.r(70, 150), sp: R.r(10, 18), ph: R.r(0, TAU) });
  return { motes, mist, birds };
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
// sandstone strata: horizontal bands lit from the upper left, a darker underside per band, vertical joints
function strata(g, xa, xb, ya, yb, P, seed, bh = 34) {
  // wavy, uneven sandstone beds (world-aligned: chunk-safe): each bed's lit top lip, the shadow under the bed above,
  // a few joints and pockets
  g.fillStyle = P.base; g.fillRect(xa - 2, ya - 2, xb - xa + 4, yb - ya + 4);
  const top = (r, x) => r * bh + 9 * vnoise(x, 110, seed + r * 7) + 4 * vnoise(x, 29, seed + r * 13);
  const st = 8, x0 = al(xa, st) - st, x1 = xb + st;
  for (let r = Math.floor(ya / bh) - 1; r * bh < yb + bh; r++) {
    const h = hash1(r * 13 + seed), tone = mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * 0.8);
    g.beginPath(); for (let x = x0; x <= x1; x += st) g.lineTo(x, top(r, x)); for (let x = x1; x >= x0; x -= st) g.lineTo(x, top(r + 1, x)); g.closePath();
    g.fillStyle = tone; g.fill();
    // the shadow under the bed above (a soft dark band along this bed's top), its lit lip just above that
    g.beginPath(); for (let x = x0; x <= x1; x += st) g.lineTo(x, top(r, x)); for (let x = x1; x >= x0; x -= st) g.lineTo(x, top(r, x) + 7 + 3 * hash2(Math.round(x / st), r)); g.closePath();
    g.fillStyle = rgba(P.crack, 0.32); g.fill();
    g.beginPath(); for (let x = x0; x <= x1; x += st) g.lineTo(x, top(r, x) - 0.5); g.strokeStyle = rgba(P.hi, 0.75); g.lineWidth = 2.2; g.stroke();
    for (let i = Math.floor((xa - 90) / 90); i * 90 < xb + 90; i++) {
      const hx = hash2(i, r + seed);
      if (hx < 0.45) continue;
      const x = i * 90 + hash2(i + 3, r) * 60, ty = top(r, x) + 6, by = top(r + 1, x) - 2;
      g.strokeStyle = rgba(P.crack, 0.6); g.lineWidth = 1.5; polyline(g, [x, ty, x + (hx - 0.7) * 10, (ty + by) / 2, x - 2, by]); g.stroke();
      if (hx > 0.88) { g.fillStyle = rgba(P.crack, 0.45); g.beginPath(); g.ellipse(x + 14, (ty + by) / 2, 7, 4, 0, 0, TAU); g.fill(); }
    }
  }
}
const STONE_ = STONE;
// a foreground piece fades where a hero (or a pickup) is behind it (the runtime's opts.see: screen boxes)
function seeThrough(opts, x, y, w, h) {
  const see = opts && opts.see;
  if (!see) return 1;
  for (const b of see) if (b.x + b.w / 2 > x && b.x - b.w / 2 < x + w && b.y1 > y && b.y0 < y + h) return 0.4;
  return 1;
}
// chunky Y-shaped cracks over a breakable wall segment (x0..x1, y0..y1): a dark split with a lit edge, forking
function yCracks(g, x0, x1, y0, y1, seed) {
  const R = mulberry(seed);
  for (let k = 0; k < 2; k++) {
    const cx = lerp(x0 + 30, x1 - 30, k ? 0.72 : 0.25) + R.r(-8, 8), fy = lerp(y0, y1, R.r(0.45, 0.6));
    const stem = [cx + R.r(-4, 4), y1, cx + R.r(-6, 6), lerp(fy, y1, 0.5), cx, fy];
    const armL = [cx, fy, cx - R.r(10, 18), lerp(y0, fy, 0.5), cx - R.r(16, 26), y0];
    const armR = [cx, fy, cx + R.r(10, 18), lerp(y0, fy, 0.45), cx + R.r(14, 24), y0 + 2];
    for (const pts of [stem, armL, armR]) {
      g.strokeStyle = rgba('#fff2cc', 0.7); g.lineWidth = 2; polyline(g, pts.map((v, i) => (i % 2 ? v + 1.5 : v + 1.5))); g.stroke();
      g.strokeStyle = '#4a2e14'; g.lineWidth = 3.4; polyline(g, pts); g.stroke();
    }
  }
}
// a few pebbles fallen at a segment's foot
function pebbles(g, x0, x1, y, seed) {
  const R = mulberry(seed);
  for (let k = 0; k < 5; k++) { const x = lerp(x0 + 10, x1 - 10, R()), r = R.r(3, 6); ink(g, (g) => { g.beginPath(); g.ellipse(x, y - r * 0.5, r, r * 0.7, 0, 0, TAU); }, WEAK.base, 1.2, (g) => { g.fillStyle = WEAK.hi; g.fillRect(x - r * 0.6, y - r, r, 1.6); }); }
}
// hairline cracks over a breakable wall segment (x0..x1, y0..y1): a few thin dark zigzags with a lit edge
function hairlines(g, x0, x1, y0, y1, seed) {
  const R = mulberry(seed);
  for (let k = 0; k < 3; k++) {
    let x = lerp(x0 + 20, x1 - 20, (k + 0.5) / 3) + R.r(-10, 10), y = y0;
    const pts = [x, y];
    while (y < y1 - 4) { x += R.r(-9, 9); y += R.r(6, 11); pts.push(x, Math.min(y, y1)); }
    g.strokeStyle = rgba('#fff0cc', 0.6); g.lineWidth = 1.2; polyline(g, pts.map((v, i) => (i % 2 ? v : v + 1.2))); g.stroke();
    g.strokeStyle = '#4a3220'; g.lineWidth = 1.6; polyline(g, pts); g.stroke();
  }
}
// a coursed block wall from x0 to x1, top y0 (with a coping row) to y1; wear 0..1 knocks blocks off the top
function blockWall(g, x0, x1, y0, y1, seed, wear = 0, P = STONE) {
  const ch = 16, cw = 34;
  const topAt = (x) => y0 + (wear > 0 ? Math.max(0, vnoise(x, 40, seed) + 0.1) * wear * 40 + (hash1(Math.floor(x / cw) + seed) < wear * 0.35 ? ch : 0) : 0);
  // the wall face: courses of blocks
  const face = (g) => { g.beginPath(); g.moveTo(x0, y1); for (let x = x0; x <= x1; x += cw / 2) g.lineTo(x, topAt(x) + 8); g.lineTo(x1, topAt(x1) + 8); g.lineTo(x1, y1); g.closePath(); };
  ink(g, face, P.base, 2, (g) => {
    for (let r = 0; r * ch + y0 < y1; r++) {
      const yy = y0 + 8 + r * ch, off = (r % 2) * cw * 0.5;
      for (let i = Math.floor((x0 - off) / cw) - 1; i * cw + off < x1 + cw; i++) {
        const bx = i * cw + off, h = hash2(i, r * 3 + seed);
        g.fillStyle = mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * 0.8); g.fillRect(bx + 1.2, yy + 1.2, cw - 2.4, ch - 2.4);
        g.fillStyle = rgba(P.hi, 0.6); g.fillRect(bx + 1.2, yy + 1.2, cw - 2.4, 2);
        g.fillStyle = rgba(P.sh, 0.6); g.fillRect(bx + 1.2, yy + ch - 3.4, cw - 2.4, 2.2);
        if (h > 0.84) { g.fillStyle = rgba(MOSS.base, 0.8); g.beginPath(); g.ellipse(bx + cw * 0.5, yy + ch - 2, cw * 0.4, 4, 0, Math.PI, 0); g.fill(); }
      }
      g.fillStyle = rgba(P.joint, 0.75); g.fillRect(x0, yy, x1 - x0, 1.5);
      for (let i = Math.floor((x0 - off) / cw) - 1; i * cw + off < x1 + cw; i++) g.fillRect(i * cw + off, yy, 1.5, ch);
    }
    vgrad(g, x0, y0, x1 - x0, y1, [[0, 'rgba(255,240,200,0.18)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(70,45,20,0.3)']]);
  });
  // the coping stones on top (where not knocked off)
  for (let i = Math.floor(x0 / (cw * 1.5)); i * cw * 1.5 < x1; i++) {
    const a = Math.max(x0, i * cw * 1.5), b = Math.min(x1, (i + 1) * cw * 1.5), ty = topAt((a + b) / 2);
    if (ty > y0 + 1) continue;
    const h = hash1(i * 7 + seed), tilt = (h - 0.5) * 2;
    ink(g, (g) => poly(g, [a + 1, ty + 9, a - 1, ty + 1 + tilt, b + 1, ty + 1 - tilt, b - 1, ty + 9]), P.hi, 1.8, (g) => { g.fillStyle = P.base; g.fillRect(a - 2, ty + 5, b - a + 4, 5); });
    if (h > 0.7) { g.fillStyle = MOSS.base; g.beginPath(); g.ellipse((a + b) / 2 + (h - 0.8) * 30, ty + 1, 10, 3.5, 0, Math.PI, 0); g.fill(); g.fillStyle = rgba(MOSS.hi, 0.7); g.fillRect((a + b) / 2 - 6, ty - 1, 8, 1.5); }
  }
  return topAt;
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0, behind = null, churn = 0;
  const wallS = WALLS.map(() => 0);
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    // (built nearest first: under a memory cap the first caches keep the full scale -- the floor under the fighters
    //  stays sharp, the far layers are the ones stepped down)
    const pr = layerRange(0, LEVEL_LEN, P_PEAK), mr = layerRange(0, LEVEL_LEN, P_MID), fc = layerRange(4200, LEVEL_LEN, P_FAR_CLIFF);
    // the breakable segments: intact / broken, back and front
    setLS('near');
    c.segBack = makeSprite(SEG_W + 30, 100, 15, 90, cs, (g) => { setLS('near'); blockWall(g, 0, SEG_W, WALL_TOP - 364 - 12, 0, 31, 0, WEAK); yCracks(g, 0, SEG_W, WALL_TOP - 364 - 4, -4, 33); pebbles(g, 0, SEG_W, 0, 35); });
    c.segBackBroken = makeSprite(SEG_W + 60, 90, 30, 80, cs, (g) => { setLS('near'); brokenSeg(g, WALL_TOP - 364, 0, 41); });
    c.segFront = makeSprite(SEG_W + 30, 70, 15, 40, cs, (g) => { setLS('front'); frontBlocks(g, 0, SEG_W, -30, 36, 51, 0, WEAK); yCracks(g, 0, SEG_W, -22, 26, 53); });
    c.segFrontBroken = makeSprite(SEG_W + 60, 70, 30, 40, cs, (g) => { setLS('front'); brokenFront(g, 61); });
    c.ground = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawDeck(g, xa, xb); });
    c.front = buildStrip(BR0 - 20, LEVEL_LEN + 10, FW_TOP - 14, H, cs, 1, (g, xa, xb) => { setLS('front'); drawFrontWall(g, xa, xb); });
    c.wall = buildStrip(BR0 - 20, LEVEL_LEN + 10, 290, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawBackWall(g, xa, xb); });
    c.cliff = buildStrip(-10, BR0 + 120, 0, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawCliff(g, xa, xb); });
    c.light = lightBand(-10, LEVEL_LEN + 10, 250, 470, '255,226,170', [[0, 0], [0.3, 0.08], [0.55, 0.13], [0.8, 0.06], [1, 0]], [0, 0], Math.min(cs, 0.5));
    c.endPost = makeSprite(90, 150, 45, 140, cs, (g) => { setLS('near'); endPost(g); });
    // glows and particles
    c.sun = radialSprite(64, 0.5, [[0, 'rgba(255,250,225,1)'], [0.18, 'rgba(255,240,190,0.85)'], [0.45, 'rgba(255,215,140,0.3)'], [1, 'rgba(255,200,120,0)']]);
    c.mistPuff = radialSprite(64, 0.5, [[0, `rgba(${MIST},0.95)`], [0.55, `rgba(${MIST},0.5)`], [1, `rgba(${MIST},0)`]]);
    c.mote = radialSprite(6, Math.max(1, cs), [[0, 'rgba(255,245,215,1)'], [0.4, 'rgba(255,230,180,0.6)'], [1, 'rgba(255,220,160,0)']]);
    c.farCliff = buildStrip(fc[0], fc[1], 0, 372, csFar, P_FAR_CLIFF, (g, xa, xb) => { setLS('mid'); drawFarCliff(g, xa, xb, fc); });
    c.mid = buildStrip(mr[0], mr[1], 90, 372, csFar, P_MID, (g, xa, xb) => { setLS('mid'); drawMid(g, xa, xb); });
    c.peaks = buildStrip(pr[0], pr[1], 50, 300, csFar, P_PEAK, (g, xa, xb) => { setLS('far'); drawPeaks(g, xa, xb); });
    return c;
  }

  // ------------------------------------------------------------------ deep layers
  function drawPeaks(g, xa, xb) {
    // snowy peaks far ahead: sharp crests, snow down to a jagged line, lit on the sun's side (left), haze at the foot
    const peaks = [];
    for (let i = Math.floor((xa - 380) / 150); i * 150 < xb + 380; i++) peaks.push([i * 150 + hash1(i * 7 + 1) * 90, 70 + hash1(i * 11 + 3) * 110, 150 + hash1(i * 13) * 120, i]);
    peaks.sort((a, b) => a[1] - b[1]);   // (the tallest last-drawn would hide the rest: draw the tallest first)
    for (const [px, py, hw, i] of peaks) {
      const back = py < 110, base = 300, sl = hw * (0.9 + hash1(i * 5) * 0.3), sr = hw * (0.9 + hash1(i * 9) * 0.3);
      const body = [px - sl, base, px - sl * 0.45, py + (base - py) * 0.45 + hash1(i) * 10, px - 8, py + 10, px, py, px + 10, py + 14, px + sr * 0.5, py + (base - py) * 0.5, px + sr, base];
      g.fillStyle = back ? '#b6a5c4' : '#a896b4'; poly(g, body); g.fill();
      g.fillStyle = rgba('#7d6d94', 0.55); poly(g, [px, py, px + 10, py + 14, px + sr * 0.5, py + (base - py) * 0.5, px + sr, base, px + 6, base]); g.fill();
      // the snow cap: from the crest down to a ragged snowline
      const sy = py + (base - py) * (0.32 + hash1(i * 17) * 0.12), R = mulberry(i + 50), snow = [px, py];
      const n = 7;
      for (let k = 0; k <= n; k++) { const f = k / n; const xx = lerp(px + (sr * (sy - py)) / (base - py) * 0.95, px - (sl * (sy - py)) / (base - py) * 0.95, f); snow.push(xx, sy + (k % 2 ? R.r(6, 18) : R.r(-6, 2))); }
      g.fillStyle = '#f7f3fb'; poly(g, snow); g.fill();
      g.fillStyle = rgba('#c9c1de', 0.85); g.beginPath(); g.moveTo(px, py); g.lineTo(px + 10, py + 14); g.lineTo(snow[2], snow[3]); g.lineTo(px + 4, sy); g.closePath(); g.fill();
      g.strokeStyle = rgba('#8f7fa6', 0.55); g.lineWidth = 1.2; poly(g, body); g.stroke();
    }
    vgrad(g, xa - 2, 130, xb - xa + 4, 300, [[0, 'rgba(250,228,190,0)'], [0.6, 'rgba(250,228,190,0.45)'], [1, 'rgba(250,228,190,0.95)']]);
  }
  // a sandstone stack rising out of the mist: centre x, top y, half width, seed
  function stack(g, x, top, hw, seed, P = SAND, foot = 372) {
    const R = mulberry(seed), Lp = [], Rp = [];
    for (let k = 0; k <= 8; k++) { const f = k / 8, y = lerp(top, foot, f), w = hw * (0.75 + 0.25 * f + R.r(-0.06, 0.06)) * (k === 0 ? 0.85 : 1); Lp.push(x - w, y); Rp.unshift(x + w * 0.95, y); }
    const shape = (g) => poly(g, Lp.concat(Rp));
    ink(g, shape, P.base, 1.8, (g) => {
      strata(g, x - hw * 1.2, x + hw * 1.2, top, foot, P, seed, 26);
      g.fillStyle = rgba(P.deep, 0.5); g.fillRect(x + hw * 0.25, top, hw, foot - top);
      g.fillStyle = rgba('#fff0c8', 0.3); g.fillRect(x - hw * 1.1, top, hw * 0.35, foot - top);
    });
    // grass and a little pine on top
    g.fillStyle = MOSS.base; g.beginPath(); g.ellipse(x, top + 2, hw * 0.85, 5, 0, Math.PI, 0); g.fill();
    if (R() > 0.4) { const px = x + R.r(-hw * 0.4, hw * 0.4); ink(g, (g) => poly(g, [px - 8, top + 1, px, top - 26, px + 8, top + 1]), '#5d6a3a', 1.2); }
  }
  function drawMid(g, xa, xb) {
    // rock stacks and the canyon's far walls in the haze; the mist they stand in
    for (let i = Math.floor((xa - 200) / 170); i * 170 < xb + 200; i++) {
      const h = hash1(i * 7 + 2);
      if (h < 0.3) continue;
      const x = i * 170 + hash1(i * 11) * 90, top = 150 + hash1(i * 13) * 120, hw = 30 + hash1(i * 17) * 40;
      stack(g, x, top, hw, 300 + i, { base: '#cf9f6a', sh: '#a87848', hi: '#f0cf98', crack: '#8a603a', deep: '#7a5236' });
    }
    // an older bridge, long broken, far off in the haze
    const ob = 900;
    if (xa < ob + 260 && xb > ob - 260) {
      const P = { base: '#d7bb94', sh: '#b8996e', hi: '#efdcb8', joint: '#9a7a56' };
      ink(g, (g) => { g.beginPath(); g.moveTo(ob - 240, 236); g.lineTo(ob + 40, 236); g.lineTo(ob + 60, 252); g.lineTo(ob - 240, 252); g.closePath(); }, P.base, 1.5);
      for (const ax of [ob - 160, ob - 40]) { g.fillStyle = '#e9d2aa'; g.beginPath(); g.ellipse(ax, 300, 44, 50, 0, Math.PI, 0); g.fill(); ink(g, (g) => { g.beginPath(); g.moveTo(ax - 52, 252); g.lineTo(ax + 52, 252); g.lineTo(ax + 52, 340); g.lineTo(ax + 40, 340); g.lineTo(ax + 40, 300); g.ellipse(ax, 300, 40, 46, 0, 0, Math.PI, true); g.lineTo(ax - 52, 340); g.closePath(); }, P.base, 1.4, (g) => { g.fillStyle = rgba(P.sh, 0.6); g.fillRect(ax + 10, 250, 46, 100); }); }
    }
    vgrad(g, xa - 2, 230, xb - xa + 4, 372, [[0, `rgba(${MIST},0)`], [0.45, `rgba(${MIST},0.5)`], [1, `rgba(${MIST},0.92)`]]);
  }
  // the far cliff of the Troll's Gap: a sheer wall at the level's end, its face golden, the mist at its foot
  function drawFarCliff(g, xa, xb, fc) {
    const x0 = fc[1] - 240;   // (its face at screen ~720 on the boss screen: the troll rises in front of the gap)
    const edge = (y) => x0 + 30 * Math.sin(y * 0.02) + 20 * vnoise(y, 31, 4) - (372 - y) * 0.12;
    const shape = (g) => { g.beginPath(); g.moveTo(edge(-10), -10); for (let y = 0; y <= 380; y += 10) g.lineTo(edge(y), y); g.lineTo(xb + 10, 380); g.lineTo(xb + 10, -10); g.closePath(); };
    if (xb < edge(380) - 60) return;
    ink(g, shape, SAND.base, 2, (g) => {
      strata(g, Math.max(xa, x0 - 120), xb, -10, 380, { base: '#c39a70', sh: '#a47c56', hi: '#e2c39a', crack: '#8a6644' }, 71, 46);
      vgrad(g, xa, 0, xb - xa, 372, [[0, 'rgba(120,80,50,0.25)'], [0.45, `rgba(${MIST},0.2)`], [1, `rgba(${MIST},0.8)`]]);
      g.fillStyle = rgba('#fff2cc', 0.35); g.beginPath(); for (let y = -10; y <= 380; y += 10) g.lineTo(edge(y) - 2, y); for (let y = 380; y >= -10; y -= 10) g.lineTo(edge(y) + 22, y); g.closePath(); g.fill();
    });
    // little pines clinging to cracks in the face (no shelves: nothing that reads as a platform)
    for (const [y, dx] of [[130, 60], [210, 150], [90, 210]]) {
      const ex = edge(y) + dx;
      if (ex < xa - 30 || ex > xb + 30) continue;
      g.strokeStyle = rgba(SAND.crack, 0.8); g.lineWidth = 2; polyline(g, [ex - 14, y + 4, ex, y, ex + 12, y + 6]); g.stroke();
      ink(g, (g) => poly(g, [ex - 9, y + 2, ex + 2, y - 30, ex + 11, y + 2]), '#5d6a3a', 1.2, (g) => { g.fillStyle = '#7a8a4a'; g.fillRect(ex - 9, y - 30, 8, 34); });
    }
  }

  // ------------------------------------------------------------------ near: the path's cliff, the back wall, the deck
  function drawCliff(g, xa, xb) {
    // the sheer cliff the path runs along; it ends at the bridge head in a buttress
    const edgeX = (y) => BR0 + 40 - 30 * Math.sin(y * 0.018 + 1) - 18 * vnoise(y, 27, 3) - Math.max(0, 300 - y) * 0.08;
    const shape = (g) => { g.beginPath(); g.moveTo(xa - 10, -10); g.lineTo(edgeX(-10), -10); for (let y = 0; y <= 372; y += 8) g.lineTo(edgeX(y), y); g.lineTo(xa - 10, 380); g.closePath(); };
    ink(g, shape, SAND.base, 2.2, (g) => {
      strata(g, xa, xb, -10, 380, SAND, 13, 38);
      // big vertical cracks, the shadowed buttress at the right, warm light on the face
      for (let i = Math.floor(xa / 150) - 1; i * 150 < xb + 60; i++) {
        if (hash1(i * 3 + 7) < 0.45) continue;
        const x = i * 150 + hash1(i * 5) * 90, y0 = -10 + hash1(i * 11) * 140, y1 = y0 + 120 + hash1(i * 13) * 160;
        const pts = []; for (let k = 0; k <= 5; k++) pts.push(x + (hash1(i * 17 + k) - 0.5) * 16, lerp(y0, y1, k / 5));
        g.strokeStyle = rgba(SAND.crack, 0.8); g.lineWidth = 2.6; polyline(g, pts); g.stroke();
        g.strokeStyle = rgba(SAND.hi, 0.55); g.lineWidth = 1.2; polyline(g, pts.map((v, j) => (j % 2 ? v : v - 3))); g.stroke();
      }
      g.fillStyle = rgba(SAND.deep, 0.45); g.beginPath(); for (let y = -10; y <= 380; y += 8) g.lineTo(edgeX(y) - 70, y); for (let y = 380; y >= -10; y -= 8) g.lineTo(edgeX(y) + 4, y); g.closePath(); g.fill();
      vgrad(g, xa, -10, xb - xa, 372, [[0, 'rgba(255,236,190,0.2)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(90,60,30,0.25)']]);
      // moss and little plants in the cracks
      for (let i = Math.floor(xa / 90); i * 90 < xb; i++) {
        const x = i * 90 + hash1(i * 9) * 60, y = 60 + hash1(i * 3) * 260;
        if (x > edgeX(y) - 20) continue;
        g.fillStyle = MOSS.base; g.beginPath(); g.ellipse(x, y, 12, 4, 0, Math.PI, 0); g.fill(); g.fillStyle = MOSS.hi; g.fillRect(x - 6, y - 3, 7, 1.5);
      }
    });
    // the path's inner edge: tumbled boulders against the cliff foot
    for (let i = Math.floor((xa - 60) / 80); i * 80 < Math.min(xb, BR0) + 60; i++) {
      const x = i * 80 + hash1(i * 23) * 40, w = 20 + hash1(i * 29) * 26, h = 18 + hash1(i * 31) * 22;
      if (x > edgeX(360) - 20) continue;
      ink(g, (g) => blob(g, [x - w, 372, x - w * 0.9, 368 - h * 0.6, x - w * 0.3, 366 - h, x + w * 0.4, 368 - h * 0.9, x + w, 368 - h * 0.3, x + w, 372]), SAND.sh, 1.6, (g) => { g.fillStyle = rgba(SAND.hi, 0.7); g.fillRect(x - w * 0.6, 366 - h, w * 0.7, 5); g.fillStyle = rgba(SAND.deep, 0.5); g.fillRect(x + w * 0.2, 360 - h, w, h + 14); });
    }
  }
  function endPost(g) {
    // a bridge-head post: a tall worn pillar with a capstone, moss down one side
    ink(g, (g) => poly(g, [-30, 0, -28, -118, 28, -118, 30, 0]), STONE.base, 2.4, (g) => {
      for (let y = 0; y > -118; y -= 20) { g.fillStyle = rgba(STONE.joint, 0.7); g.fillRect(-30, y - 1, 60, 1.6); g.fillRect(((y / 20) % 2 ? -4 : 8), y - 20, 1.6, 20); }
      g.fillStyle = rgba(STONE.sh, 0.8); g.fillRect(10, -120, 22, 122); g.fillStyle = rgba(STONE.hi, 0.6); g.fillRect(-28, -118, 7, 118);
      g.fillStyle = rgba(MOSS.base, 0.85); g.fillRect(-30, -80, 9, 60);
    });
    ink(g, (g) => poly(g, [-38, -116, -34, -134, 34, -134, 38, -116]), STONE.hi, 2.2, (g) => { g.fillStyle = STONE.base; g.fillRect(-38, -124, 76, 8); });
    g.fillStyle = MOSS.base; g.beginPath(); g.ellipse(-8, -134, 22, 5, 0, Math.PI, 0); g.fill(); g.fillStyle = MOSS.hi; g.fillRect(-20, -137, 14, 2);
  }
  function brokenSeg(g, y0, y1, seed) {
    // a gap in the wall: two jagged stubs, the blocks fallen as rubble on the deck's back edge
    const R = mulberry(seed);
    // (the gap: the chasm's mist welling up through it, bright)
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, `rgba(${MIST},0.25)`); gr.addColorStop(1, `rgba(${MIST},0.95)`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(SEG_W / 2, y1 - 6, SEG_W * 0.5, (y1 - y0) * 0.9, 0, Math.PI, 0); g.fill();
    // (the broken faces inside the gap: a dark edge either side, so the opening reads)
    g.fillStyle = rgba(WEAK.dark, 0.85); g.fillRect(18, y0 + 2, 7, y1 - y0 - 2); g.fillRect(SEG_W - 25, y0 + 12, 7, y1 - y0 - 12);
    blockWall(g, -6, 20, y0 - 4, y1, seed, 0, WEAK);
    blockWall(g, SEG_W - 22, SEG_W + 6, y0 + 8, y1, seed + 1, 0, WEAK);
    for (const [x, d] of [[20, 1], [SEG_W - 22, -1]]) { ink(g, (g) => poly(g, [x, y0 + 4, x + d * 14, y0 + 14, x + d * 6, y0 + 26, x + d * 16, y0 + 38, x, y1]), WEAK.base, 1.6, (g) => { g.fillStyle = WEAK.sh; g.fillRect(x - 20, y0, 40, y1 - y0); }); }
    for (let k = 0; k < 9; k++) {
      const x = R.r(8, SEG_W - 8), w = R.r(10, 18), h = R.r(7, 12), y = y1 - R.r(-4, 6);
      ink(g, (g) => { g.save(); g.translate(x, y); g.rotate(R.r(-0.5, 0.5)); roundRect(g, -w / 2, -h, w, h, 2); g.restore(); }, WEAK.base, 1.6, (g) => { g.fillStyle = rgba(WEAK.sh, 0.7); g.fillRect(x, y - 14, 20, 14); });
    }
  }
  function frontBlocks(g, x0, x1, y0, y1, seed, wear, STONE = STONE_) {
    const cw = 52;
    ink(g, (g) => poly(g, [x0, y1 + 4, x0, y0, x1, y0, x1, y1 + 4]), STONE.base, 2.4, (g) => {
      for (let i = Math.floor(x0 / cw) - 1; i * cw < x1 + cw; i++) {
        const h = hash1(i * 5 + seed);
        g.fillStyle = mix(STONE.base, h < 0.5 ? STONE.sh : STONE.hi, Math.abs(h - 0.5) * 0.7); g.fillRect(i * cw + 1.5, y0 + 9, cw - 3, y1 - y0);
        g.fillStyle = rgba(STONE.joint, 0.8); g.fillRect(i * cw, y0 + 8, 2, y1 - y0);
      }
      g.fillStyle = STONE.hi; g.fillRect(x0, y0, x1 - x0, 6); g.fillStyle = rgba(STONE.sh, 0.8); g.fillRect(x0, y0 + 6, x1 - x0, 3);
      if (wear) { g.fillStyle = rgba(MOSS.base, 0.85); for (let i = Math.floor(x0 / 70); i * 70 < x1; i++) if (hash1(i * 3 + seed) < 0.4) { g.beginPath(); g.ellipse(i * 70 + 30, y0 + 1, 18, 4, 0, Math.PI, 0); g.fill(); } }
    });
  }
  function brokenFront(g, seed) {
    const R = mulberry(seed);
    frontBlocks(g, -6, 26, -14, 36, seed, 0, WEAK);
    frontBlocks(g, SEG_W - 26, SEG_W + 6, -6, 36, seed + 1, 0, WEAK);
    for (let k = 0; k < 7; k++) {
      const x = R.r(10, SEG_W - 10), w = R.r(14, 22), h = R.r(8, 12), y = 30 + R.r(-3, 4);
      ink(g, (g) => { g.save(); g.translate(x, y); g.rotate(R.r(-0.4, 0.4)); roundRect(g, -w / 2, -h, w, h, 2); g.restore(); }, WEAK.base, 1.8);
    }
  }
  function drawBackWall(g, xa, xb) {
    // the low back wall along the deck, with gaps where the breakable segments go (drawn live), crumbling on the span
    const gaps = WALLS.filter((w) => w.side === 'back');
    const segs = [];
    let a = BR0 + 40;
    for (const gp of gaps) { segs.push([a, gp.x0]); a = gp.x1; }
    segs.push([a, LEVEL_LEN + 20]);
    for (const [s0, s1] of segs) {
      if (s1 < xa - 40 || s0 > xb + 40) continue;
      // (each run in lengths, worn on the span)
      for (let p = s0; p < s1; p += 260) {
        const q = Math.min(s1, p + 260), mid = (p + q) / 2;
        // (the stretch either side of a breakable segment stays whole: the weak one stands out)
        const nearGap = (p === s0 && s0 > BR0 + 40) || (q === s1 && s1 < LEVEL_LEN), wk = nearGap ? 0 : spanK(mid);
        if (q < xa - 30 || p > xb + 30) continue;
        // (no fallen stretches: the only gaps in the wall are broken breakable segments -- the span shows its age in
        //  worn, chipped tops instead)
        blockWall(g, p, q, WALL_TOP + wk * 3, 366, (Math.floor(p / 260) * 7) | 0, wk * 0.2);
      }
    }
    // the bridge-head posts
    const x = BR0 + 20;
    if (x > xa - 60 && x < xb + 60) endPostAt(g, x);
  }
  function endPostAt(g, x) { g.save(); g.translate(x, 368); endPost(g); g.restore(); }
  function drawDeck(g, xa, xb) {
    // the path (rock ledge) up to the bridge head, then the bridge's flagstones
    const a = Math.max(xa, -10), b = Math.min(xb, BR0 + 30);
    if (b > a) {
      vgrad(g, a - 2, 352, b - a + 4, H, [[0, '#a98256'], [0.3, '#bf9a6a'], [0.8, '#b08b5e'], [1, '#93704a']]);
      facets(g, a, b, 360, 530, { base: '#bd986a', sh: '#a3805a', hi: '#d8b78a', crack: '#7a5a3a' }, 7, 70, 30, 0.45, 0.6);
      vgrad(g, a - 2, 352, b - a + 4, 400, [[0, 'rgba(70,45,20,0.4)'], [1, 'rgba(70,45,20,0)']]);
      // the drop at the path's front edge: the chasm below
      const lip = (x) => 518 + 4 * Math.sin(x * 0.03) + 4 * vnoise(x, 17, 2);
      g.fillStyle = `rgba(${MIST},1)`; g.beginPath(); g.moveTo(a - 4, H + 4); for (let x = al(a, 6) - 6; x <= b + 6; x += 6) g.lineTo(x, lip(x)); g.lineTo(b + 4, H + 4); g.closePath(); g.fill();
      ink(g, (g) => { g.beginPath(); for (let x = al(a, 6) - 6; x <= b + 6; x += 6) g.lineTo(x, lip(x)); for (let x = al(b, 6) + 6; x >= a - 6; x -= 6) g.lineTo(x, lip(x) + 10 + 3 * Math.sin(x * 0.1)); g.closePath(); }, SAND.sh, 1.8);
    }
    const c = Math.max(xa, BR0), d = xb;
    if (d <= c) return;
    // the deck: rows of big worn flagstones of uneven size (smaller toward the back: the deck recedes), bevelled,
    // grass and moss in the joints; on the span some are cracked or gone
    vgrad(g, c - 2, 352, d - c + 4, H, [[0, '#7b5d3c'], [1, '#6e5232']]);
    const rows = [[360, 18], [378, 21], [399, 25], [424, 29], [453, 33], [486, 37], [523, 30]];
    const PAL = ['#c9a676', '#bf9b6c', '#d2b383', '#b8966a', '#c4a27e', '#cdb08a', '#b39472'];
    for (let r = 0; r < rows.length; r++) {
      const [ry, rh] = rows[r];
      // stones along the row: widths from a world-aligned hash walk (chunk-safe: a fixed grid of cells, each cell a
      // stone whose width varies around the cell size)
      const cw = rh * 2.6 + 18, off = hash1(ry * 3) * cw;
      for (let i = Math.floor((c - off) / cw) - 1; i * cw + off < d + cw; i++) {
        const j0 = (hash2(i, ry) - 0.5) * cw * 0.35, j1 = (hash2(i + 1, ry) - 0.5) * cw * 0.35;
        const bx0 = i * cw + off + j0, bx1 = (i + 1) * cw + off + j1, h = hash2(i, ry + 7), wk = spanK(bx0);
        const t0 = ry + 1.5 + (hash2(i, r + 40) - 0.5) * 3, t1 = ry + rh - 1.5 + (hash2(i, r + 50) - 0.5) * 3;
        if (wk > 0.3 && hash2(i + 3, ry) < wk * 0.16 && r > 0 && r < rows.length - 1) {   // a missing flagstone: the hollow under it
          // (a worn, sunken socket of rubble and grit: a few px down, still stone -- never a hole to the chasm)
          g.fillStyle = '#a88660'; roundRect(g, bx0 + 2, t0, bx1 - bx0 - 4, t1 - t0, 5); g.fill();
          g.fillStyle = rgba('#7b5a36', 0.55); g.fillRect(bx0 + 4, t0 + 1, bx1 - bx0 - 8, 3);
          for (let q = 0; q < 5; q++) { const px = lerp(bx0 + 8, bx1 - 8, hash2(i + q, ry + 1)), py = lerp(t0 + 6, t1 - 4, hash2(q, i + ry)); g.fillStyle = rgba('#d2b383', 0.9); g.beginPath(); g.ellipse(px, py, 4 + q % 3, 2.4, 0, 0, TAU); g.fill(); g.strokeStyle = rgba('#7b5a36', 0.7); g.lineWidth = 1; g.stroke(); }
          continue;
        }
        const col = PAL[Math.floor(h * PAL.length)];
        const stone = (g) => { g.beginPath(); g.moveTo(bx0 + 2 + 3, t0); g.lineTo(bx1 - 2 - 4, t0 + (h - 0.5) * 2); g.quadraticCurveTo(bx1 - 1.5, t0, bx1 - 1.5, t0 + 5); g.lineTo(bx1 - 2.5, t1 - 4); g.quadraticCurveTo(bx1 - 2, t1, bx1 - 7, t1); g.lineTo(bx0 + 6, t1); g.quadraticCurveTo(bx0 + 1.5, t1, bx0 + 1.5, t1 - 5); g.lineTo(bx0 + 2, t0 + 4); g.closePath(); };
        stone(g); g.fillStyle = col; g.fill();
        g.save(); stone(g); g.clip();
        g.fillStyle = rgba('#f4dcae', 0.6); g.fillRect(bx0, t0, bx1 - bx0, 2.5); g.fillRect(bx0, t0, 3, t1 - t0);
        g.fillStyle = rgba('#7b5a36', 0.45); g.fillRect(bx0, t1 - 3.5, bx1 - bx0, 3.5); g.fillRect(bx1 - 4, t0, 4, t1 - t0);
        if (h > 0.55) { g.fillStyle = rgba('#a88660', 0.35); g.beginPath(); g.ellipse(lerp(bx0, bx1, hash2(i, 9)), lerp(t0, t1, 0.55), (bx1 - bx0) * 0.22, (t1 - t0) * 0.18, 0, 0, TAU); g.fill(); }
        if (h > 0.82 || (wk > 0.4 && h > 0.55)) { g.strokeStyle = rgba('#6e5232', 0.8); g.lineWidth = 1.3; polyline(g, [lerp(bx0, bx1, 0.3), t0, lerp(bx0, bx1, 0.42), lerp(t0, t1, 0.5), lerp(bx0, bx1, 0.36), t1]); g.stroke(); if (wk > 0.4) { polyline(g, [lerp(bx0, bx1, 0.42), lerp(t0, t1, 0.5), lerp(bx0, bx1, 0.7), lerp(t0, t1, 0.6)]); g.stroke(); } }
        g.restore();
        if (hash2(i, ry + 3) > 0.62) { g.fillStyle = rgba(MOSS.base, 0.9); g.beginPath(); g.ellipse(bx1 - 1, lerp(t0, t1, 0.6), 3, (t1 - t0) * 0.35, 0, 0, TAU); g.fill(); g.fillStyle = MOSS.hi; g.fillRect(bx1 - 2, t0 + 3, 1.6, 4); }
      }
    }
    // the worn path down the middle, the back wall's shadow along the back edge
    vgrad(g, c - 2, 404, d - c + 4, 480, [[0, 'rgba(245,225,185,0)'], [0.5, 'rgba(245,225,185,0.22)'], [1, 'rgba(245,225,185,0)']]);
    vgrad(g, c - 2, 352, d - c + 4, 396, [[0, 'rgba(80,52,26,0.42)'], [1, 'rgba(80,52,26,0)']]);
    // pebbles and grit
    for (let i = Math.floor(c / 31) - 1; i * 31 < d + 31; i++) {
      const x = i * 31 + hash1(i * 7) * 26, y = 372 + hash1(i * 11) * 150, h = hash1(i * 13);
      if (h > 0.25 + spanK(x) * 0.3) continue;
      ink(g, (g) => { g.beginPath(); g.ellipse(x, y, 3 + h * 8, 2 + h * 4, 0, 0, TAU); }, DECK.sh, 1, (g) => { g.fillStyle = DECK.hi; g.fillRect(x - 3, y - 3, 4, 1.5); });
    }
  }
  function drawFrontWall(g, xa, xb) {
    const gaps = WALLS.filter((w) => w.side === 'front');
    let a = BR0 + 30;
    const segs = [];
    for (const gp of gaps) { segs.push([a, gp.x0]); a = gp.x1; }
    segs.push([a, LEVEL_LEN + 20]);
    for (const [s0, s1] of segs) if (s1 > xa - 20 && s0 < xb + 20) frontBlocks(g, Math.max(s0, xa - 60), Math.min(s1, xb + 60), FW_TOP, H, 81, 1);
  }

  // ------------------------------------------------------------------ per frame
  function sky(ctx, C, camX, t) {
    const gr = ctx.createLinearGradient(0, 0, 0, 340);
    gr.addColorStop(0, SKY[0]); gr.addColorStop(0.35, SKY[1]); gr.addColorStop(0.75, SKY[2]); gr.addColorStop(1, SKY[3]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 380);
    const sx = 230 - camX * 0.02, sy = 96;
    glowAt(ctx, C.sun, sx, sy, 300, 0.55); glowAt(ctx, C.sun, sx, sy, 70, 1);
    // soft god-rays from the sun
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 5; k++) {
      const a = 0.35 + k * 0.28 + Math.sin(t * 0.2 + k) * 0.02, l = 900;
      ctx.fillStyle = `rgba(255,236,190,${0.05 + 0.02 * Math.sin(t * 0.5 + k * 2)})`;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a - 0.04) * l, sy + Math.sin(a - 0.04) * l); ctx.lineTo(sx + Math.cos(a + 0.04) * l, sy + Math.sin(a + 0.04) * l); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // a few far birds (tiny, high: never the cliff bats)
    ctx.strokeStyle = 'rgba(110,80,60,0.6)'; ctx.lineWidth = 1.3;
    for (const b of LAY.birds) {
      const x = ((b.x - camX * 0.08 + t * b.sp) % 1400 + 1400) % 1400 - 200, y = b.y + Math.sin(t * 0.7 + b.ph) * 6, f = Math.sin(t * 6 + b.ph) * 3;
      ctx.beginPath(); ctx.moveTo(x - 5, y - f); ctx.lineTo(x, y); ctx.lineTo(x + 5, y - f); ctx.stroke();
    }
  }
  function mistPass(ctx, C, camX, t, layer, y0, y1, a, par) {
    for (const f of LAY.mist) {
      if (f.layer !== layer) continue;
      const x = ((f.x - camX * par + t * f.sp) % 1600 + 1600) % 1600 - 300;
      const k = a * (1 + gapK(camX + x) * 0.6 + churn * 0.5) * (layer ? 1 - 0.75 * faceK(camX + x) : 1);
      if (k <= 0.01) continue;
      ctx.globalAlpha = Math.min(1, f.a * k); ctx.drawImage(C.mistPuff.c, x - f.w / 2, lerp(y0, y1, f.y) - 40 - churn * 10 * Math.sin(t * 2 + f.x), f.w, 80 + churn * 30);
    }
    ctx.globalAlpha = 1;
  }
  function segments(ctx, C, camX, side, s, opts) {
    for (let i = 0; i < WALLS.length; i++) {
      const w = WALLS[i];
      if (w.side !== side) continue;
      const sx = w.x0 - camX;
      if (sx > W + 40 || sx + SEG_W < -40) continue;
      const k = wallS[i], broken = k >= 1;
      const spr = side === 'back' ? (broken ? C.segBackBroken : C.segBack) : (broken ? C.segFrontBroken : C.segFront);
      const y = side === 'back' ? 364 : FW_TOP + 0;
      const jit = !broken && k > 0 ? Math.sin(performance.now() * 0.05 + i) * k * 1.5 : 0;
      if (side === 'front') ctx.globalAlpha = seeThrough(opts, sx, y - 30, SEG_W, 60);
      ctx.drawImage(spr.c, Math.round((sx - spr.ox + jit) * s) / s, y - spr.oy, spr.w, spr.h);
      ctx.globalAlpha = 1;
      if (!broken && k > 0) cracks(ctx, sx, side === 'back' ? WALL_TOP - 12 : FW_TOP - 30, side === 'back' ? 60 : 50, k, i);
    }
  }
  function cracks(ctx, x, y, h, k, seed) {
    // cracks spreading over the segment as it weakens (k 0..1)
    ctx.save(); ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    const n = 1 + Math.floor(k * 4);
    for (let j = 0; j < n; j++) {
      const R = mulberry(seed * 31 + j);
      let px = x + R.r(20, SEG_W - 20), py = y + 4;
      ctx.beginPath(); ctx.moveTo(px, py);
      const steps = 2 + Math.floor(k * 4);
      for (let s = 0; s < steps; s++) { px += R.r(-14, 14); py += h / 5; ctx.lineTo(px, Math.min(y + h, py)); }
      ctx.stroke();
    }
    if (k > 0.5) { ctx.fillStyle = `rgba(90,60,30,${(k - 0.5) * 0.6})`; ctx.fillRect(x + 4, y, SEG_W - 8, h); }
    ctx.restore();
  }
  function particles(ctx, C, camX, t, layer) {
    const par = layer ? 1.3 : 0.8;
    for (const f of LAY.motes) {
      if (f.layer !== layer) continue;
      const sx0 = ((f.x - camX * par + t * 8 * f.sp) % 1000 + 1000) % 1000 - 20;
      const x = sx0 + Math.sin(t * f.fr + f.ph) * f.sw, y = f.y + Math.sin(t * 0.5 * f.fr + f.ph * 2) * 16;
      ctx.globalAlpha = (0.3 + 0.3 * Math.sin(t * 1.5 * f.fr + f.ph)) * (layer ? 0.8 : 0.6);
      const r = layer ? 3.5 : 2.4; ctx.drawImage(C.mote.c, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    ctx.fillStyle = SKY[2]; ctx.fillRect(0, 0, W, H);
    sky(ctx, C, camX, t);
    drawStrip(ctx, C.peaks, camX, s);
    drawStrip(ctx, C.mid, camX, s);
    if (camX + W > 4200) drawStrip(ctx, C.farCliff, camX, s);
    mistPass(ctx, C, camX, t, 0, 220, 330, 0.9, 0.45);
    if (behind) { ctx.save(); try { behind(ctx, camX, t); } catch (e) { if (!behind.err) { behind.err = 1; console.error('mmbridge setBehind', e); } } ctx.restore(); }
    // the mist bank the troll rises from (thick in the Troll's Gap)
    mistPass(ctx, C, camX, t, 1, 270, 336, 1, 0.7);
    const gk = gapK(camX + W * 0.7);
    if (gk > 0) {
      // (thinner over the troll's face, x TROLL_FACE: his nose is the climb target -- in slices, feathered at the sides)
      const bank = (x0, x1, f) => {
        if (x1 <= x0) return;
        const y0 = TROLL.mistY - 90 + 50 * f, gr = ctx.createLinearGradient(0, y0, 0, 372), a = gk * (1 - 0.45 * f);
        gr.addColorStop(0, `rgba(${MIST},0)`); gr.addColorStop(0.45, `rgba(${MIST},${0.5 * a})`); gr.addColorStop(0.75, `rgba(${MIST},${0.85 * a})`); gr.addColorStop(1, `rgba(${MIST},${0.95 * gk})`);
        ctx.fillStyle = gr; ctx.fillRect(x0, y0, x1 - x0, 372 - y0);
      };
      const fa = TROLL_FACE[0] - camX, fb = TROLL_FACE[1] - camX, FE = 60, n = 6;
      bank(0, Math.min(W, fa - FE), 0); bank(Math.max(0, fb + FE), W, 0);
      for (let k = 0; k < n; k++) { const u = (k + 0.5) / n; bank(fa - FE + (k * FE) / n, fa - FE + ((k + 1) * FE) / n, u); bank(fb + FE - ((k + 1) * FE) / n, fb + FE - (k * FE) / n, u); }
      bank(Math.max(0, fa), Math.min(W, fb), 1);
      mistPass(ctx, C, camX, t, 2, TROLL.mistY - 60, TROLL.mistY + 10, 1.2 * gk, 0.75);
    }
    if (camX < BR0 + 120) drawStrip(ctx, C.cliff, camX, s);
    drawStrip(ctx, C.wall, camX, s);
    segments(ctx, C, camX, 'back', s);
    drawStrip(ctx, C.ground, camX, s);
    ctx.globalCompositeOperation = 'screen'; drawStrip(ctx, C.light, camX, s); ctx.globalCompositeOperation = 'source-over';
    particles(ctx, C, camX, t, 0);
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0, opts) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    if (camX + W > BR0) { drawStrip(ctx, C.front, camX, s); segments(ctx, C, camX, 'front', s, opts); }
    mistPass(ctx, C, camX * 1.2, t * 1.3, 2, 530, 560, 0.4, 1.2);
    particles(ctx, C, camX, t, 1);
    ctx.restore();
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(90,60,30,0.3)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  /** a breakable wall segment's state (i: HOOKS.walls index; s 0 intact .. 1 broken) */
  function setWall(i, s) { if (i >= 0 && i < wallS.length) wallS[i] = clamp(+s || 0, 0, 1); }
  /** the troll's drawing, called inside drawBack behind the mist bank and the back wall: fn(ctx, camX, t), or null */
  function setBehind(fn) { behind = typeof fn === 'function' ? fn : null; }
  function setTrollMist(k) { churn = clamp(+k || 0, 0, 1); }
  return { setScale: st.setScale, setWarm, setWall, setBehind, setTrollMist, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 60, h: 56, colors: ['#a07448', '#6e4a2a', '#d8b78a', '#4f5466'] },
  barrel: { w: 48, h: 60, colors: ['#8a5e38', '#5a3c22', '#c9a878', '#4f5466'] },
  urn:    { w: 50, h: 58, colors: ['#c0663a', '#8a4426', '#e8a070', '#7f8c3c'] },
};
const PROP_DRAW = {
  crate(g) {   // a traveller's crate left at the bridge, roped
    const wood = '#a07448', woodSh = '#6e4a2a', woodHi = '#c99a68', woodDk = '#4a301a', rope = '#d9c08a';
    const L = -28, Rr = 24, T = -40, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), woodSh, 2.6);
    ink(g, (g) => poly(g, [L, T, Rr, T, Rr + dx, T + dy, L + dx, T + dy]), woodHi, 2.4);
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4; for (const y of [-14, -27]) { polyline(g, [L, y, Rr, y]); g.stroke(); }
      g.fillStyle = woodSh; g.fillRect(L, T, 6, 40); g.fillRect(Rr - 6, T, 6, 40);
    });
    g.strokeStyle = INK; g.lineWidth = 5; polyline(g, [L + 18, 0, L + 18, T, L + 18 + dx, T + dy]); g.stroke(); polyline(g, [L, -20, Rr, -20, Rr + dx, -20 + dy]); g.stroke();
    g.strokeStyle = rope; g.lineWidth = 3; polyline(g, [L + 18, 0, L + 18, T, L + 18 + dx, T + dy]); g.stroke(); polyline(g, [L, -20, Rr, -20, Rr + dx, -20 + dy]); g.stroke();
    ink(g, (g) => { g.beginPath(); g.arc(L + 18, -20, 4, 0, TAU); }, rope, 1.6);
  },
  barrel(g) {  // a water barrel
    const wood = '#8a5e38', woodSh = '#5a3c22', woodHi = '#b4845a', iron = '#4f5466', ironHi = '#8e94a8';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -52); g.quadraticCurveTo(-27, -26, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -26, 18, -52); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -60, 30, 66); g.fillStyle = woodHi; g.fillRect(-19, -54, 5, 58);
      g.strokeStyle = woodSh; g.lineWidth = 1.2; for (const k of [-0.5, -0.1, 0.3]) { g.beginPath(); g.moveTo(k * 18, -52); g.quadraticCurveTo(k * 27, -26, k * 18, 4); g.stroke(); }
      for (const y of [-44, -8]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.4); }
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 18, 5.5, 0, 0, TAU); }, '#a87650', 2.4, (g) => { g.strokeStyle = woodSh; g.lineWidth = 1; g.beginPath(); g.ellipse(0, -52, 12, 3.5, 0, 0, TAU); g.stroke(); });
  },
  urn(g) {     // a clay pot with a painted band
    const clay = '#c0663a', sh = '#8a4426', hi = '#e8a070';
    const body = (g) => { g.beginPath(); g.moveTo(-11, -50); g.quadraticCurveTo(-14, -42, -22, -32); g.quadraticCurveTo(-30, -14, -16, 0); g.lineTo(16, 0); g.quadraticCurveTo(30, -14, 22, -32); g.quadraticCurveTo(14, -42, 11, -50); g.closePath(); };
    ink(g, body, clay, 2.8, (g) => {
      g.fillStyle = sh; g.fillRect(6, -54, 30, 56); g.fillStyle = hi; g.fillRect(-20, -38, 5, 30);
      g.fillStyle = '#f0d9a8'; g.fillRect(-30, -30, 60, 6); g.fillStyle = '#7f8c3c'; for (let x = -24; x < 24; x += 10) { g.beginPath(); g.arc(x, -27, 2.2, 0, TAU); g.fill(); }
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -50, 13, 4, 0, 0, TAU); }, '#d88a5a', 2.2, (g) => { g.fillStyle = '#4a2416'; g.beginPath(); g.ellipse(0, -50, 8, 2.4, 0, 0, TAU); g.fill(); });
  },
};
