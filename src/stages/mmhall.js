// Dodongo's Quest - Mystic Mountain stage 4 "THE ARMORED HALL" (src/stages/mmhall.js): background, floor, props.
//
// The comic's chapter five (pages 28-34): inside Morvath's mansion.  The iron-bound door (the blizzard behind it), a
// long torch-lit stone hall lined with empty suits of armour in their alcoves, a winding stair lit red from above, and
// the dusty study: tall bookshelves, a candle-covered desk, and high up the floating ruby gem (drawn by the runtime at
// HOOKS.gem; its red light is here, setGemLight).  Amber torchlight; blood-red gem light.
//
// Sections (world x):  door 0-800 (the Iron Door: the way in, the storm outside)  |  hall 800-2800 (the Armored Hall:
// alcoves, suits of armour, torches)  |  stair 2800-4000 (the Red Stair: the stairwell climbing into red light)  |
// study 4000-5600 (the Study: shelves, the desk, the round window the gem floats before; the boss arena is the last
// screen).
//
// Back-to-front (drawBack): the walls (1.0, one strip: vault, ashlar, alcoves, the door, the stairwell, the shelves)
// -> the snow and cold light through the door (live) -> the red light down the stair (live) -> the suits of armour
// (sprites; setSuit) -> torches and candles (live flames and glows) -> the gem's red light (live) -> the floor (1.0)
// -> the torchlight band -> dust motes.   drawFront: hanging chains and banners at p 1.25 (never on an arena screen),
// near dust.
// HOOKS.armour: the suits' x (the knights' spawn points); setSuit(i, k): 1 standing in its alcove (default), 0 gone
// (the knight has stepped out: an empty plinth).  HOOKS.gem: { x, y } world x / screen y of the floating gem.
// setGemLight(k): 1 = the study washed in blood-red gem light (default), 0 = 'Lights OUT!' (candles and torches only).
// Every static element is cached per scale (chunked strips + sprites, src/canvasmem.js); animated bits are live.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 5600;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'door', name: 'The Iron Door', x0: 0, x1: 800 },
  { id: 'hall', name: 'The Armored Hall', x0: 800, x1: 2800 },
  { id: 'stair', name: 'The Red Stair', x0: 2800, x1: 4000 },
  { id: 'study', name: 'The Study', x0: 4000, x1: 5600 },
];
export const ARENAS = [450, 1700, 3150, CAM_MAX];
export const WAYSTONES = [2700];
const DOOR = 250, STAIR = 3400, STUDY0 = 4000, DESK = 4760, GEM = { x: 5120, y: 150 };
const ALCOVE = 250;                                               // the hall's bay: an alcove and a pillar every 250 px
const SUITS = (() => { const o = []; for (let x = 925; x < 2800; x += ALCOVE) o.push(x); return o; })();
const TORCHES = (() => { const o = [520, 3020, 3780]; for (let x = 800; x < 2900; x += ALCOVE) o.push(x); return o; })();
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES, door: DOOR, stair: STAIR, study: STUDY0, desk: DESK, gem: { ...GEM }, armour: SUITS.slice(), torches: TORCHES.slice() };

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
const P_FRONT = 1.25;
const GT0 = 340;
const STONE = { base: '#7d6450', sh: '#5c4838', hi: '#a4876a', line: '#2e2018', deep: '#3a2a20' };   // (warm: the comic's amber torchlit stone)
const VAULT = { base: '#43342a', sh: '#2a1f18', hi: '#6a5240' };
const WOOD = { base: '#6e4228', sh: '#4e2c18', hi: '#946038', dark: '#2e1a0e' };
const STEEL = { base: '#8a909e', sh: '#5e6472', hi: '#c4c9d4', dark: '#3a3e4a' };
const RED = { gem: '255,40,50', rug: '#c87c62', rugSh: '#a8624c', gold: '#ecc87e' };   // (the runner: a light terracotta -- Shadow and his red scarf read on it)
const FIRE = '255,170,70';
const LS = { far: ['#2e221a', 0.5], near: ['#22180f', 0.66], front: ['#1a120c', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const studyK = (x) => sstep(STUDY0 - 60, STUDY0 + 60, x);
const FRONT_HANG = [640, 1500, 2550, 3880].filter((x) => clearOfArenas(x, 50, P_FRONT));

const LAY = (() => {
  const R = mulberry(5601);
  const motes = [];
  for (let i = 0; i < 80; i++) motes.push({ x: R.r(0, 1000), y: R.r(40, 520), sp: R.r(0.2, 0.8), sw: R.r(6, 20), ph: R.r(0, TAU), fr: R.r(0.2, 0.7), layer: i < 56 ? 0 : 1 });
  const snow = [];
  for (let i = 0; i < 40; i++) snow.push({ x: R.r(-80, 80), y: R.r(0, 300), sp: R.r(0.6, 1.4), ph: R.r(0, TAU) });
  return { motes, snow };
})();

// ---------------------------------------------------------------------------------------------------------------
// SHARED DRAWING BITS
// ---------------------------------------------------------------------------------------------------------------
// ashlar: world-aligned courses of dressed blocks, lit from the upper left (chunk-safe)
function ashlar(g, xa, xb, ya, yb, P, seed, ch = 30, cw = 64) {
  g.fillStyle = P.base; g.fillRect(xa - 2, ya - 2, xb - xa + 4, yb - ya + 4);
  for (let r = Math.floor(ya / ch); r * ch < yb; r++) {
    const y0 = r * ch, off = (r % 2) * cw * 0.5 + hash1(r * 17 + seed) * 10;
    for (let i = Math.floor((xa - off) / cw) - 1; i * cw + off < xb + cw; i++) {
      const x0 = i * cw + off, h = hash2(i, r * 7 + seed);
      g.fillStyle = mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * 0.6); g.fillRect(x0 + 1.5, y0 + 1.5, cw - 3, ch - 3);
      g.fillStyle = rgba(P.hi, 0.45); g.fillRect(x0 + 1.5, y0 + 1.5, cw - 3, 2); g.fillRect(x0 + 1.5, y0 + 1.5, 2, ch - 3);
      g.fillStyle = rgba(P.sh, 0.6); g.fillRect(x0 + 1.5, y0 + ch - 3.5, cw - 3, 2); g.fillRect(x0 + cw - 3.5, y0 + 1.5, 2, ch - 3);
      if (h > 0.88) { g.strokeStyle = rgba(P.line, 0.4); g.lineWidth = 1; polyline(g, [x0 + cw * 0.3, y0 + 3, x0 + cw * 0.36, y0 + ch * 0.5, x0 + cw * 0.3, y0 + ch - 4]); g.stroke(); }
    }
    g.fillStyle = rgba(P.line, 0.5); g.fillRect(xa - 2, y0, xb - xa + 4, 1.4);
  }
}
// a pointed arch path (x0..x1, springing at ys, apex ya, down to yb)
function archPath(g, x0, x1, ya, ys, yb) {
  const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2;
  g.beginPath(); g.moveTo(x0, yb); g.lineTo(x0, ys); g.quadraticCurveTo(x0, ya + (ys - ya) * 0.25, cx, ya); g.quadraticCurveTo(x1, ya + (ys - ya) * 0.25, x1, ys); g.lineTo(x1, yb); g.closePath();
  return { cx, hw };
}
// a suit of armour on its plinth (sprite: plinth foot at 0,0), holding a sword / axe / halberd (v 0..2).  Empty,
// visor dark (never the knights' red eye slits), a little dull in the alcove's shadow.
function suit(g, v) {
  const S = STEEL;
  // the plinth
  ink(g, (g) => poly(g, [-34, 0, -34, -16, 34, -16, 34, 0]), STONE.hi, 2, (g) => { g.fillStyle = STONE.base; g.fillRect(-34, -8, 68, 8); });
  ink(g, (g) => poly(g, [-28, -16, -28, -24, 28, -24, 28, -16]), STONE.base, 1.6);
  g.save(); g.translate(0, -24);
  const part = (build, col = S.base) => ink(g, build, col, 1.8, (g) => { g.fillStyle = rgba(S.sh, 0.7); g.fillRect(4, -220, 40, 230); g.fillStyle = rgba(S.hi, 0.7); g.fillRect(-30, -220, 6, 230); });
  // legs and sabatons
  for (const s of [-1, 1]) {
    part((g) => poly(g, [s * 4, -86, s * 18, -86, s * 17, -40, s * 15, -8, s * 4, -8, s * 5, -40]));
    part((g) => poly(g, [s * 2, 0, s * 2, -10, s * 18, -10, s * 24, 0]), S.sh);
    part((g) => { g.beginPath(); g.ellipse(s * 11, -46, 8, 7, 0, 0, TAU); }, S.hi);
  }
  // the fauld, the breastplate, the pauldrons, the arms
  part((g) => poly(g, [-22, -100, 22, -100, 24, -82, 0, -76, -24, -82]));
  part((g) => { g.beginPath(); g.moveTo(-24, -150); g.quadraticCurveTo(0, -158, 24, -150); g.lineTo(22, -102); g.quadraticCurveTo(0, -96, -22, -102); g.closePath(); });
  g.strokeStyle = rgba(S.dark, 0.6); g.lineWidth = 1.4; polyline(g, [0, -152, 0, -102]); g.stroke();
  for (const s of [-1, 1]) {
    part((g) => { g.beginPath(); g.ellipse(s * 28, -146, 14, 11, s * 0.3, 0, TAU); });
    part((g) => poly(g, [s * 24, -140, s * 36, -140, s * 36, -96, s * 26, -96]));
    part((g) => { g.beginPath(); g.ellipse(s * 31, -90, 8, 7, 0, 0, TAU); }, S.sh);
  }
  // the helm: a closed great helm with a dark visor slit
  part((g) => { g.beginPath(); g.moveTo(-16, -158); g.lineTo(-17, -184); g.quadraticCurveTo(0, -204, 17, -184); g.lineTo(16, -158); g.closePath(); });
  g.fillStyle = S.dark; g.fillRect(-12, -180, 24, 4); g.fillRect(-1.5, -176, 3, 12);
  g.strokeStyle = rgba(S.hi, 0.8); g.lineWidth = 1.4; polyline(g, [-10, -194, 0, -200, 10, -194]); g.stroke();
  // the weapon, planted point down at its right side
  const wx = 34;
  if (v === 0) { ink(g, (g) => poly(g, [wx - 3, -2, wx - 3, -130, wx, -138, wx + 3, -130, wx + 3, -2]), S.hi, 1.6); ink(g, (g) => poly(g, [wx - 14, -132, wx + 14, -132, wx + 14, -127, wx - 14, -127]), '#8a6a3a', 1.6); ink(g, (g) => roundRect(g, wx - 3, -160, 6, 28, 2), WOOD.base, 1.4); }
  else if (v === 1) { ink(g, (g) => roundRect(g, wx - 3, -170, 6, 168, 2), WOOD.base, 1.6); ink(g, (g) => { g.beginPath(); g.moveTo(wx + 2, -164); g.quadraticCurveTo(wx + 34, -170, wx + 30, -140); g.quadraticCurveTo(wx + 26, -122, wx + 2, -126); g.closePath(); }, S.hi, 1.8, (g) => { g.fillStyle = S.base; g.fillRect(wx + 2, -150, 30, 30); }); }
  else { ink(g, (g) => roundRect(g, wx - 2.5, -210, 5, 208, 2), WOOD.base, 1.6); ink(g, (g) => { g.beginPath(); g.moveTo(wx, -232); g.lineTo(wx + 5, -208); g.lineTo(wx + 24, -200); g.quadraticCurveTo(wx + 26, -186, wx + 20, -176); g.lineTo(wx + 2, -184); g.lineTo(wx - 8, -196); g.lineTo(wx - 4, -208); g.closePath(); }, S.hi, 1.8, (g) => { g.fillStyle = S.base; g.fillRect(wx + 4, -200, 22, 26); }); }
  g.restore();
  // the alcove's shadow over it
  g.fillStyle = 'rgba(40,30,30,0.22)'; g.fillRect(-60, -270, 120, 270);
}
// a torch in its iron sconce (sprite: the bracket's wall plate at 0,0; the flame is live, above at 0,-34)
function sconce(g) {
  ink(g, (g) => roundRect(g, -7, -8, 14, 22, 3), '#3a3036', 1.6, (g) => { g.fillStyle = '#5a4e56'; g.fillRect(-7, -8, 4, 22); });
  ink(g, (g) => { g.beginPath(); g.moveTo(-2, 2); g.quadraticCurveTo(10, 0, 8, -14); g.lineTo(4, -14); g.quadraticCurveTo(6, -4, -2, -3); g.closePath(); }, '#3a3036', 1.4);
  ink(g, (g) => poly(g, [-1, -14, 13, -14, 10, -24, 2, -24]), '#4a3e44', 1.4);
  ink(g, (g) => roundRect(g, 3, -34, 6, 12, 2), WOOD.base, 1.2, (g) => { g.fillStyle = '#2a1a10'; g.fillRect(3, -34, 6, 4); });
}
function bookRow(g, x0, x1, y, h, seed) {
  // books on a shelf: coloured spines of varied height and width, a few leaning, a skull or a jar here and there
  const cols = ['#7a2a26', '#2e5a3a', '#2e3e6e', '#6e4a22', '#5a2a5a', '#8a6a2a', '#3a2a22', '#4a5a2a'];
  let x = x0 + 2, i = 0;
  while (x < x1 - 6) {
    const r = hash2(Math.floor(x), seed + i), w = 6 + r * 9, bh = h * (0.7 + hash2(i, seed) * 0.3);
    if (r > 0.95 && x + 22 < x1) { ink(g, (g) => { g.beginPath(); g.ellipse(x + 10, y - 8, 9, 8, 0, Math.PI, 0); g.lineTo(x + 16, y); g.lineTo(x + 4, y); g.closePath(); }, '#d8d0bc', 1.2, (g) => { g.fillStyle = '#2a1e1a'; g.fillRect(x + 5, y - 10, 3, 3); g.fillRect(x + 12, y - 10, 3, 3); }); x += 24; i++; continue; }
    if (r < 0.06 && x + 16 < x1) { ink(g, (g) => roundRect(g, x + 1, y - 18, 14, 18, 4), 'rgba(140,190,160,0.7)', 1.2); x += 18; i++; continue; }
    const col = cols[Math.floor(hash2(i, seed + 3) * cols.length)], lean = r > 0.88 ? 0.18 : 0;
    g.save(); g.translate(x, y); g.rotate(lean);
    ink(g, (g) => roundRect(g, 0, -bh, w, bh, 1.5), col, 1.1, (g) => { g.fillStyle = rgba('#e8c87a', 0.7); g.fillRect(0, -bh + 4, w, 2); g.fillRect(0, -6, w, 1.5); g.fillStyle = rgba('#ffffff', 0.15); g.fillRect(0, -bh, 2, bh); });
    g.restore();
    x += w + (lean ? 4 : 0.6); i++;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0, gemK = 1;
  const suitK = SUITS.map(() => 1);
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    // (built nearest first: under a memory cap the first caches keep the full scale -- the floor under the fighters
    //  stays sharp, the far layers are the ones stepped down)
    c.ground = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawFloor(g, xa, xb); });
    c.suits = [0, 1, 2].map((v) => makeSprite(140, 290, 60, 276, cs, (g) => { setLS('near'); suit(g, v); }));
    // the walls in two strips: the lower part (behind the fighters) at the near scale, the vault and the tops of the
    // arches above it at the far scale (less memory; under a cap the lower part, built first, keeps the full scale)
    c.wall = buildStrip(-10, LEVEL_LEN + 10, 196, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawWall(g, xa, xb); });
    c.wallTop = buildStrip(-10, LEVEL_LEN + 10, 0, 200, csFar, 1, (g, xa, xb) => { setLS('near'); drawWall(g, xa, xb); });
    c.light = lightBand(-10, LEVEL_LEN + 10, 250, 470, '255,200,130', [[0, 0], [0.3, 0.1], [0.55, 0.16], [0.8, 0.07], [1, 0]], [0, 0], Math.min(cs, 0.5));
    c.plinth = makeSprite(80, 30, 40, 26, cs, (g) => { setLS('near'); ink(g, (g) => poly(g, [-34, 0, -34, -16, 34, -16, 34, 0]), STONE.hi, 2, (g) => { g.fillStyle = STONE.base; g.fillRect(-34, -8, 68, 8); }); ink(g, (g) => poly(g, [-28, -16, -28, -24, 28, -24, 28, -16]), STONE.base, 1.6); });
    c.sconce = makeSprite(40, 60, 20, 30, cs, (g) => { setLS('near'); sconce(g); });
    c.hangChain = makeSprite(120, 260, 60, 0, cs, (g) => { setLS('front'); frontHang(g); });
    c.glowFire = radialSprite(64, 0.5, [[0, `rgba(${FIRE},0.75)`], [0.3, `rgba(${FIRE},0.32)`], [1, `rgba(${FIRE},0)`]]);
    c.glowRed = radialSprite(64, 0.5, [[0, `rgba(${RED.gem},0.8)`], [0.35, `rgba(${RED.gem},0.3)`], [1, `rgba(${RED.gem},0)`]]);
    c.glowCold = radialSprite(64, 0.5, [[0, 'rgba(170,200,255,0.7)'], [0.4, 'rgba(150,180,255,0.25)'], [1, 'rgba(140,170,255,0)']]);
    c.mote = radialSprite(6, Math.max(1, cs), [[0, 'rgba(255,236,200,1)'], [0.4, 'rgba(255,220,170,0.6)'], [1, 'rgba(255,210,160,0)']]);
    c.flake = radialSprite(4, Math.max(1, cs), [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
    return c;
  }

  // ------------------------------------------------------------------ the walls
  function vaultBand(g, xa, xb, bay, y1) {
    // the ribbed vault along the top: dark webbing between ribs that spring from each pillar
    vgrad(g, xa - 2, 0, xb - xa + 4, y1, [[0, VAULT.sh], [1, VAULT.base]]);
    for (let i = Math.floor((xa - bay) / bay) - 1; i * bay < xb + bay; i++) {
      const x0 = i * bay + 50, x1 = x0 + bay;
      g.strokeStyle = LINE; g.lineWidth = 9; g.beginPath(); g.moveTo(x0, y1); g.quadraticCurveTo(x0, 6, (x0 + x1) / 2, 4); g.quadraticCurveTo(x1, 6, x1, y1); g.stroke();
      g.strokeStyle = VAULT.hi; g.lineWidth = 6; g.stroke();
      g.strokeStyle = rgba('#7a6656', 0.6); g.lineWidth = 2; g.beginPath(); g.moveTo(x0 - 2, y1); g.quadraticCurveTo(x0 - 2, 4, (x0 + x1) / 2, 2); g.stroke();
    }
  }
  function pillar(g, x, y0, y1, w = 46) {
    ink(g, (g) => poly(g, [x - w / 2, y1, x - w / 2, y0, x + w / 2, y0, x + w / 2, y1]), STONE.base, 2.2, (g) => {
      for (let y = y1; y > y0; y -= 34) { g.fillStyle = rgba(STONE.line, 0.6); g.fillRect(x - w / 2, y - 1, w, 1.6); }
      g.fillStyle = rgba(STONE.hi, 0.55); g.fillRect(x - w / 2, y0, 8, y1 - y0); g.fillStyle = rgba(STONE.sh, 0.7); g.fillRect(x + w / 2 - 12, y0, 12, y1 - y0);
    });
    ink(g, (g) => poly(g, [x - w / 2 - 8, y0 + 12, x - w / 2 - 4, y0, x + w / 2 + 4, y0, x + w / 2 + 8, y0 + 12]), STONE.hi, 1.8);
    ink(g, (g) => poly(g, [x - w / 2 - 10, y1, x - w / 2 - 6, y1 - 16, x + w / 2 + 6, y1 - 16, x + w / 2 + 10, y1]), STONE.hi, 1.8, (g) => { g.fillStyle = STONE.base; g.fillRect(x - w, y1 - 8, w * 2, 8); });
  }
  function drawWall(g, xa, xb) {
    ashlar(g, xa, xb, 60, 380, STONE, 3);
    vgrad(g, xa - 2, 60, xb - xa + 4, 380, [[0, 'rgba(30,20,16,0.5)'], [0.35, 'rgba(30,20,16,0.1)'], [1, 'rgba(30,20,16,0.25)']]);
    vaultBand(g, xa, xb, ALCOVE, 70);
    // --- the door section: the great iron-bound door, ajar, the storm beyond
    if (xa < 820) {
      const x0 = DOOR - 100, x1 = DOOR + 100;
      archPath(g, x0 - 20, x1 + 20, 92, 170, 366); g.fillStyle = STONE.deep; g.fill();
      // outside: the blizzard night, the snowy step
      g.save(); archPath(g, x0, x1, 110, 180, 366); g.clip();
      vgrad(g, x0, 110, x1 - x0, 366, [[0, '#2a2c5e'], [0.6, '#5d5f9e'], [1, '#a4a6d8']]);
      g.fillStyle = '#d8dbf2'; g.beginPath(); g.moveTo(x0, 366); g.quadraticCurveTo(DOOR, 330, x1, 350); g.lineTo(x1, 366); g.closePath(); g.fill();
      g.fillStyle = '#4a4c7a'; poly(g, [x0, 300, x0 + 50, 230, x0 + 90, 280, x0 + 140, 210, x1, 270, x1, 330, x0, 340]); g.fill();
      g.restore();
      // the doors: the left one open toward us (narrow, in perspective), the right one closed
      ink(g, (g) => { g.beginPath(); g.moveTo(DOOR + 4, 366); g.lineTo(DOOR + 4, 120); g.quadraticCurveTo(x1, 124, x1, 180); g.lineTo(x1, 366); g.closePath(); }, WOOD.base, 2.4, (g) => {
        g.strokeStyle = WOOD.dark; g.lineWidth = 1.6; for (let x = DOOR + 22; x < x1; x += 20) { polyline(g, [x, 120, x, 366]); g.stroke(); }
        for (const y of [170, 250, 330]) { g.fillStyle = '#2e2a2e'; g.fillRect(DOOR + 4, y - 8, x1 - DOOR - 4, 16); g.fillStyle = '#4e4850'; g.fillRect(DOOR + 4, y - 8, x1 - DOOR - 4, 4); for (let x = DOOR + 14; x < x1; x += 18) { g.fillStyle = '#6e6870'; g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fill(); } }
        g.fillStyle = rgba(WOOD.sh, 0.6); g.fillRect(x1 - 20, 120, 20, 250);
      });
      ink(g, (g) => { g.beginPath(); g.ellipse(DOOR + 26, 260, 9, 11, 0, 0, TAU); g.moveTo(DOOR + 35, 260); g.ellipse(DOOR + 26, 260, 5, 7, 0, 0, TAU, true); }, '#6e6870', 1.6);
      ink(g, (g) => poly(g, [x0, 366, x0, 150, x0 + 40, 170, x0 + 40, 380]), WOOD.sh, 2.2, (g) => { g.fillStyle = '#2e2a2e'; for (const y of [190, 260, 330]) g.fillRect(x0, y - 6, 40, 12); });
      // the arch's voussoirs and a horned-skull keystone
      for (let k = 0; k <= 10; k++) { const a = Math.PI + (k / 10) * Math.PI, r = 116, cx = DOOR, cy = 182; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.78; ink(g, (g) => { g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); roundRect(g, -10, -8, 20, 16, 2); g.restore(); }, STONE.hi, 1.6); }
      g.save(); g.translate(DOOR, 82);
      ink(g, (g) => { g.beginPath(); g.moveTo(-8, -4); g.quadraticCurveTo(-24, -12, -28, -32); g.quadraticCurveTo(-16, -20, -6, -14); g.closePath(); }, '#cfc6b0', 1.5);
      ink(g, (g) => { g.beginPath(); g.moveTo(8, -4); g.quadraticCurveTo(24, -12, 28, -32); g.quadraticCurveTo(16, -20, 6, -14); g.closePath(); }, '#cfc6b0', 1.5);
      ink(g, (g) => { g.beginPath(); g.ellipse(0, -4, 12, 11, 0, Math.PI, 0); g.lineTo(9, 8); g.lineTo(-9, 8); g.closePath(); }, '#ddd4c0', 1.7, (g) => { g.fillStyle = '#1a1214'; g.beginPath(); g.ellipse(-5, -3, 3.4, 3.8, 0, 0, TAU); g.ellipse(5, -3, 3.4, 3.8, 0, 0, TAU); g.fill(); g.fillRect(-1, 3, 2, 3); });
      g.restore();
      // banners of Morvath either side of the vestibule: black and green, the skull in white
      for (const bx of [560, 700]) {
        if (bx < xa - 60 || bx > xb + 60) continue;
        strokeLine(g, [bx - 40, 120, bx + 40, 120], 4, '#2a2024');
        ink(g, (g) => poly(g, [bx - 34, 122, bx + 34, 122, bx + 34, 280, bx, 300, bx - 34, 280]), '#1e2a22', 2, (g) => { g.fillStyle = '#2e5a3a'; g.fillRect(bx - 34, 122, 8, 170); g.fillRect(bx + 26, 122, 8, 170); g.fillStyle = '#d8d0bc'; g.beginPath(); g.ellipse(bx, 190, 12, 11, 0, 0, TAU); g.fill(); g.fillStyle = '#1e2a22'; g.fillRect(bx - 7, 187, 5, 5); g.fillRect(bx + 2, 187, 5, 5); g.strokeStyle = '#d8d0bc'; g.lineWidth = 3; g.beginPath(); g.moveTo(bx - 10, 184); g.quadraticCurveTo(bx - 24, 176, bx - 24, 160); g.moveTo(bx + 10, 184); g.quadraticCurveTo(bx + 24, 176, bx + 24, 160); g.stroke(); });
      }
    }
    // --- the hall: an alcove (with its plinth's shadow) and a pillar per bay
    for (let i = Math.floor((xa - ALCOVE) / ALCOVE) - 1; i * ALCOVE < xb + ALCOVE; i++) {
      const px = i * ALCOVE + 50;            // the pillar
      if (px < 780 || px > 2920) continue;
      const ax = px + ALCOVE / 2;             // the alcove's centre
      if (ax < 2850) {
        archPath(g, ax - 66, ax + 66, 110, 150, 352); g.fillStyle = STONE.deep; g.fill();
        g.save(); archPath(g, ax - 58, ax + 58, 120, 160, 352); g.clip();
        vgrad(g, ax - 60, 110, 120, 352, [[0, '#2a201b'], [1, '#4a3c33']]);
        g.restore();
        archPath(g, ax - 66, ax + 66, 110, 150, 352); g.strokeStyle = LINE; g.lineWidth = 2.2 * LK; g.stroke();
        archPath(g, ax - 58, ax + 58, 120, 160, 352); g.strokeStyle = rgba(STONE.hi, 0.6); g.lineWidth = 2; g.stroke();
        ink(g, (g) => poly(g, [ax - 70, 356, ax - 70, 346, ax + 70, 346, ax + 70, 356]), STONE.hi, 1.6);
      }
      pillar(g, px, 70, 366);
    }
    // --- the stair: a great arch, the stairwell climbing and turning up into red light
    if (xb > 2780 && xa < 4020) {
      const x0 = STAIR - 270, x1 = STAIR + 270;
      archPath(g, x0 - 24, x1 + 24, 76, 160, 370); g.fillStyle = STONE.deep; g.fill();
      g.save(); archPath(g, x0, x1, 92, 170, 370); g.clip();
      vgrad(g, x0, 80, x1 - x0, 370, [[0, '#5a1a1c'], [0.35, '#3e2622'], [1, '#2a201c']]);
      // the stairwell's side walls with torch brackets, converging up
      g.fillStyle = '#4a3a32'; poly(g, [x0, 370, x0 + 130, 160, x0 + 130, 80, x0, 80]); g.fill();
      g.fillStyle = '#3e302a'; poly(g, [x1, 370, x1 - 130, 160, x1 - 130, 80, x1, 80]); g.fill();
      for (let k = 0; k < 7; k++) { const f = k / 7, yy = lerp(370, 160, f); g.fillStyle = rgba(STONE.line, 0.5); g.fillRect(x0, yy, lerp(0, 130, f) + 4, 1.4); g.fillRect(x1 - lerp(0, 130, f) - 4, yy, lerp(0, 130, f) + 4, 1.4); }
      // steps: wide at the foot, narrowing and shortening as they climb; the top ones turn away to the left
      let y = 370;
      for (let k = 0; k < 14; k++) {
        const f = k / 14, h = lerp(18, 6, f), wL = lerp(x0 + 8, x0 + 132, f), wR = lerp(x1 - 8, x1 - 132, f), turn = sstep(0.6, 1, f) * 60;
        const top = y - h;
        g.fillStyle = mix('#8a7464', '#c8705e', f * f); poly(g, [wL - turn * 0.3, top, wR - turn, top, wR - turn, top + 3, wL - turn * 0.3, top + 3]); g.fill();
        g.fillStyle = mix('#5e4c40', '#8a3a34', f * f); poly(g, [wL - turn * 0.3, top + 3, wR - turn, top + 3, wR - turn, y, wL - turn * 0.3, y]); g.fill();
        g.strokeStyle = rgba('#1e1410', 0.7); g.lineWidth = 1.2; polyline(g, [wL - turn * 0.3, y, wR - turn, y]); g.stroke();
        y = top;
      }
      // the red light from above
      vgrad(g, x0, 80, x1 - x0, 300, [[0, 'rgba(255,40,40,0.55)'], [0.5, 'rgba(255,40,40,0.15)'], [1, 'rgba(255,40,40,0)']]);
      g.restore();
      archPath(g, x0 - 24, x1 + 24, 76, 160, 370); g.strokeStyle = LINE; g.lineWidth = 2.6 * LK; g.stroke();
      for (let k = 0; k <= 14; k++) { const a = Math.PI + (k / 14) * Math.PI, cx = STAIR, cy = 168; const x = cx + Math.cos(a) * 282, yv = cy + Math.sin(a) * 84; ink(g, (g) => { g.save(); g.translate(x, yv); g.rotate(a + Math.PI / 2); roundRect(g, -11, -9, 22, 18, 2); g.restore(); }, STONE.hi, 1.6); }
      // the stair's newel posts at the foot
      for (const nx of [x0 + 10, x1 - 10]) { ink(g, (g) => poly(g, [nx - 12, 370, nx - 12, 290, nx + 12, 290, nx + 12, 370]), STONE.hi, 2, (g) => { g.fillStyle = STONE.base; g.fillRect(nx, 290, 12, 80); }); ink(g, (g) => { g.beginPath(); g.arc(nx, 284, 12, 0, TAU); }, STONE.hi, 1.8); }
    }
    // --- the study: wood panelling, tall bookshelves, the round window the gem floats before, the desk
    if (xb > STUDY0 - 40) {
      const a = Math.max(xa, STUDY0 - 20), b = xb;
      // the doorway between the stair and the study: a heavy timber frame
      if (STUDY0 > xa - 60 && STUDY0 < xb + 60) ink(g, (g) => poly(g, [STUDY0 - 26, 372, STUDY0 - 26, 60, STUDY0 + 26, 60, STUDY0 + 26, 372]), WOOD.sh, 2.4, (g) => { g.fillStyle = WOOD.dark; g.fillRect(STUDY0 + 6, 60, 20, 312); });
      vgrad(g, a, 60, b - a, 372, [[0, '#3e2416'], [1, '#5a3420']]);
      for (let x = al(a, 16); x < b; x += 16) { g.fillStyle = rgba(WOOD.dark, 0.45); g.fillRect(x, 60, 1.4, 312); }
      // shelves: tall cases along the wall, gaps for the window and the desk
      const cases = [[4060, 4300], [4330, 4560], [4600, 4920], [5320, 5560]];
      for (const [c0, c1] of cases) {
        if (c1 < xa - 20 || c0 > xb + 20) continue;
        ink(g, (g) => poly(g, [c0, 366, c0, 70, c1, 70, c1, 366]), WOOD.base, 2.4, (g) => {
          g.fillStyle = WOOD.dark; g.fillRect(c0 + 10, 84, c1 - c0 - 20, 270);
          for (let y = 140; y < 366; y += 56) {
            bookRow(g, c0 + 10, c1 - 10, y - 2, 48, (c0 | 0) + y);
            ink(g, (g) => poly(g, [c0 + 6, y, c1 - 6, y, c1 - 6, y + 7, c0 + 6, y + 7]), WOOD.hi, 1.4);
          }
          g.fillStyle = WOOD.hi; g.fillRect(c0, 70, 10, 296); g.fillStyle = WOOD.sh; g.fillRect(c1 - 10, 70, 10, 296);
          // cobwebs in the top corners (dusty)
          g.strokeStyle = 'rgba(230,220,210,0.45)'; g.lineWidth = 1;
          for (const [cx, s] of [[c0 + 10, 1], [c1 - 10, -1]]) { for (let k = 1; k <= 3; k++) { g.beginPath(); g.moveTo(cx, 84 + k * 9); g.quadraticCurveTo(cx + s * k * 6, 84 + k * 6, cx + s * k * 9, 84); g.stroke(); } polyline(g, [cx, 84, cx + s * 30, 112]); g.stroke(); }
        });
        ink(g, (g) => poly(g, [c0 - 8, 74, c0 - 4, 60, c1 + 4, 60, c1 + 8, 74]), WOOD.hi, 2);
      }
      // the round window behind the gem: night and snow outside, iron tracery
      if (GEM.x + 140 > xa && GEM.x - 140 < xb) {
        const wx = GEM.x, wy = GEM.y - 6, r = 96;
        g.fillStyle = WOOD.dark; g.beginPath(); g.arc(wx, wy, r + 16, 0, TAU); g.fill();
        g.save(); g.beginPath(); g.arc(wx, wy, r, 0, TAU); g.clip();
        vgrad(g, wx - r, wy - r, r * 2, wy + r, [[0, '#1c1e46'], [1, '#3e4280']]);
        g.fillStyle = '#e8eaff'; g.beginPath(); g.arc(wx + 74, wy - 31, 12, 0, TAU); g.fill();
        for (let k = 0; k < 30; k++) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(wx - r + hash1(k) * r * 2, wy - r + hash1(k * 3) * r * 2, 2, 2); }
        g.restore();
        g.strokeStyle = LINE; g.lineWidth = 5; g.beginPath(); g.arc(wx, wy, r, 0, TAU); g.stroke();
        g.strokeStyle = '#2a2428'; g.lineWidth = 4;
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; g.beginPath(); g.moveTo(wx + Math.cos(a) * 26, wy + Math.sin(a) * 26); g.lineTo(wx + Math.cos(a) * r, wy + Math.sin(a) * r); g.stroke(); }
        g.beginPath(); g.arc(wx, wy, 26, 0, TAU); g.stroke(); g.beginPath(); g.arc(wx, wy, r * 0.64, 0, TAU); g.stroke();
        ink(g, (g) => { g.beginPath(); g.arc(wx, wy, r + 16, 0, TAU); g.moveTo(wx + r + 4, wy); g.arc(wx, wy, r + 4, 0, TAU, true); }, WOOD.hi, 2.2);
        // a hanging candle-chandelier either side: dark iron rings
        for (const s of [-1, 1]) { const cx = wx + s * 160; strokeLine(g, [cx, 60, cx, 120], 2, '#2a2024'); ink(g, (g) => { g.beginPath(); g.ellipse(cx, 124, 26, 6, 0, 0, TAU); }, '#3a3036', 1.6); for (const k of [-18, -6, 6, 18]) ink(g, (g) => roundRect(g, cx + k - 2, 108, 4, 14, 1), '#efe2c0', 1); }
      }
      // the desk at the back of the lane: heavy, carved, covered in candles, books, scrolls
      if (DESK + 170 > xa && DESK - 170 < xb) {
        const d0 = DESK - 150, d1 = DESK + 150;
        ink(g, (g) => poly(g, [d0, 372, d0, 300, d1, 300, d1, 372]), WOOD.base, 2.4, (g) => {
          g.fillStyle = WOOD.sh; g.fillRect(d0, 312, d1 - d0, 60);
          for (const x of [d0 + 20, DESK - 60, DESK + 20, d1 - 70]) { ink(g, (g) => roundRect(g, x, 320, 50, 40, 4), WOOD.base, 1.4, (g) => { g.fillStyle = '#c9973a'; g.beginPath(); g.arc(x + 25, 340, 3, 0, TAU); g.fill(); }); }
        });
        ink(g, (g) => poly(g, [d0 - 12, 302, d0 - 6, 290, d1 + 6, 290, d1 + 12, 302]), WOOD.hi, 2.2);
        // books, a scroll, an inkwell and quill, a skull candle-holder, wax drips (the flames are live)
        ink(g, (g) => poly(g, [d0 + 30, 290, d0 + 34, 270, d0 + 84, 270, d0 + 80, 290]), '#5a2a5a', 1.6);
        ink(g, (g) => poly(g, [d0 + 36, 270, d0 + 40, 256, d0 + 78, 258, d0 + 74, 270]), '#2e5a3a', 1.6);
        ink(g, (g) => { g.beginPath(); g.ellipse(DESK + 40, 286, 34, 5, 0, 0, TAU); }, '#efe2c0', 1.4, (g) => { g.strokeStyle = '#8a7a5a'; g.lineWidth = 1; polyline(g, [DESK + 14, 286, DESK + 60, 286]); g.stroke(); });
        ink(g, (g) => roundRect(g, d1 - 70, 276, 14, 14, 3), '#1e1a2e', 1.4); strokeLine(g, [d1 - 63, 276, d1 - 50, 246], 2, '#e8e0d0');
        for (const [x, h] of CANDLES) ink(g, (g) => { roundRect(g, x - 3, 290 - h, 6, h, 1.5); }, '#efe2c0', 1.2, (g) => { g.fillStyle = '#d8c8a0'; g.fillRect(x + 1, 290 - h, 2, h); g.fillStyle = '#fff6dc'; g.fillRect(x - 3, 290 - h, 6, 3); });
        g.fillStyle = 'rgba(240,226,192,0.9)'; for (const [x] of CANDLES) { g.beginPath(); g.ellipse(x, 290, 6, 2, 0, 0, TAU); g.fill(); }
      }
    }
    // the torch sconces' warm halo on the stone (static; the flames' flicker is live)
    for (const tx of TORCHES) if (tx > xa - 160 && tx < xb + 160 && tx < STUDY0) { lightPool(g, tx, 200, 170, 150, FIRE, 0.26); lightPool(g, tx, 190, 60, 60, '255,220,150', 0.25); }
  }
  function frontHang(g) {
    // a length of iron chain with a hook, and a torn banner beside it, hanging in from the top
    for (let y = 0; y < 220; y += 12) ink(g, (g) => { g.beginPath(); g.ellipse(-20, y + 6, 4.5, 7, 0, 0, TAU); g.moveTo(-17, y + 6); g.ellipse(-20, y + 6, 2, 4, 0, 0, TAU, true); }, '#3a3440', 1.2);
    ink(g, (g) => { g.beginPath(); g.moveTo(-20, 224); g.quadraticCurveTo(-8, 236, -16, 248); g.lineTo(-20, 244); g.quadraticCurveTo(-14, 236, -22, 230); g.closePath(); }, '#4a4450', 1.4);
    ink(g, (g) => poly(g, [8, 0, 52, 0, 52, 150, 40, 140, 30, 166, 20, 146, 8, 158]), '#1e2a22', 2, (g) => { g.fillStyle = '#2e5a3a'; g.fillRect(8, 0, 6, 170); g.fillStyle = '#d8d0bc'; g.beginPath(); g.ellipse(30, 70, 9, 8, 0, 0, TAU); g.fill(); });
  }

  // ------------------------------------------------------------------ the floor
  function drawFloor(g, xa, xb) {
    // flagstones in the hall, floorboards in the study; a long red runner from the door to the stair
    vgrad(g, xa - 2, 352, xb - xa + 4, H, [[0, '#523e30'], [0.15, '#76604c'], [0.5, '#8a725a'], [0.9, '#705a46'], [1, '#584434']]);
    const a = xa, b = Math.min(xb, STUDY0);
    if (b > a) {
      const rows = [[360, 20], [380, 24], [404, 28], [432, 32], [464, 36], [500, 40]];
      for (const [ry, rh] of rows) {
        const cw = rh * 2.4 + 20, off = hash1(ry * 5) * cw;
        for (let i = Math.floor((a - off) / cw) - 1; i * cw + off < b + cw; i++) {
          const bx = i * cw + off, h = hash2(i, ry);
          g.fillStyle = mix('#8a7058', h < 0.5 ? '#6c5440' : '#a4886a', Math.abs(h - 0.5) * 0.8); roundRect(g, bx + 1.5, ry + 1.5, cw - 3, rh - 3, 3); g.fill();
          g.fillStyle = rgba('#b8a490', 0.35); g.fillRect(bx + 3, ry + 2, cw - 6, 2);
          g.fillStyle = rgba('#3a2e26', 0.35); g.fillRect(bx + 3, ry + rh - 4, cw - 6, 2);
          if (h > 0.86) { g.strokeStyle = rgba('#3a2e26', 0.6); g.lineWidth = 1.1; polyline(g, [bx + cw * 0.3, ry + 3, bx + cw * 0.45, ry + rh * 0.6, bx + cw * 0.4, ry + rh - 3]); g.stroke(); }
        }
        g.fillStyle = rgba('#2e241e', 0.55); g.fillRect(a - 2, ry, b - a + 4, 1.5);
      }
      // the runner: deep red with a gold border, worn at the middle
      const r0 = 150, r1 = STAIR - 280;
      if (xb > r0 && xa < r1) {
        const p = Math.max(xa - 4, r0), q = Math.min(xb + 4, r1);
        ink(g, (g) => poly(g, [p, 396, q, 396, q, 478, p, 478]), RED.rug, 1.6, (g) => {
          g.fillStyle = RED.gold; g.fillRect(p, 400, q - p, 4); g.fillRect(p, 470, q - p, 4);
          g.fillStyle = RED.rugSh; g.fillRect(p, 406, q - p, 6); g.fillStyle = rgba('#dc9a7e', 0.5); g.fillRect(p, 428, q - p, 22);
          for (let x = al(p, 60); x < q; x += 60) { g.fillStyle = rgba(RED.gold, 0.6); poly(g, [x, 437, x + 8, 431, x + 16, 437, x + 8, 443]); g.fill(); }
        });
        for (const x of [r0, r1]) if (x > xa - 10 && x < xb + 10) { g.fillStyle = RED.gold; for (let y = 400; y < 476; y += 6) g.fillRect(x + (x === r0 ? -6 : 0), y, 6, 2); }
      }
    }
    if (xb > STUDY0) {
      const p = Math.max(xa, STUDY0);
      g.save(); g.beginPath(); g.rect(STUDY0, 340, LEVEL_LEN + 40 - STUDY0, H); g.clip();
      vgrad(g, p - 2, 352, xb - p + 4, H, [[0, '#4a2c1c'], [0.15, '#6e4428'], [0.5, '#7e5030'], [1, '#5a3620']]);
      const rows = [360, 378, 398, 420, 445, 472, 502];
      for (let r = 0; r < rows.length - 1; r++) {
        const y0 = rows[r], y1 = rows[r + 1], cw = 180 + r * 30, off = hash1(r * 9) * cw;
        g.fillStyle = rgba('#2e1a0e', 0.6); g.fillRect(p, y0, xb - p, 1.5);
        for (let i = Math.floor((p - off) / cw) - 1; i * cw + off < xb + cw; i++) {
          const bx = i * cw + off, h = hash2(i, r + 30);
          g.fillStyle = rgba(h > 0.5 ? '#946038' : '#5e3a22', 0.35); g.fillRect(bx + 2, y0 + 2, cw - 4, y1 - y0 - 3);
          g.fillStyle = rgba('#2e1a0e', 0.6); g.fillRect(bx, y0, 1.5, y1 - y0);
          g.fillStyle = rgba('#2e1a0e', 0.7); g.beginPath(); g.arc(bx + 6, (y0 + y1) / 2, 1.2, 0, TAU); g.fill();
        }
      }
      g.restore();
      // the threshold: a worn stone sill across the doorway, between the hall's flags and the study's boards
      if (STUDY0 + 30 > xa && STUDY0 - 30 < xb) ink(g, (g) => poly(g, [STUDY0 - 22, 352, STUDY0 + 18, 352, STUDY0 + 26, H + 4, STUDY0 - 30, H + 4]), '#8a7058', 1.8, (g) => { g.fillStyle = '#a4886a'; g.fillRect(STUDY0 - 30, 352, 14, H); g.fillStyle = rgba('#3a2a20', 0.4); g.fillRect(STUDY0 + 6, 352, 24, H); for (const y of [392, 446, 504]) { g.fillStyle = rgba('#3a2a20', 0.7); g.fillRect(STUDY0 - 30, y, 60, 1.6); } });
      // the round rug in the middle of the study, dusty footprints
      const cx = (CAM_MAX + LEVEL_LEN) / 2;
      if (xb > cx - 330 && xa < cx + 330) {
        ink(g, (g) => { g.beginPath(); g.ellipse(cx, 440, 300, 52, 0, 0, TAU); }, '#b8705a', 1.8, (g) => {
          g.strokeStyle = RED.gold; g.lineWidth = 4; g.beginPath(); g.ellipse(cx, 440, 286, 46, 0, 0, TAU); g.stroke();
          g.strokeStyle = rgba(RED.gold, 0.6); g.lineWidth = 2; g.beginPath(); g.ellipse(cx, 440, 200, 30, 0, 0, TAU); g.stroke();
          g.fillStyle = '#cc8a6e'; g.beginPath(); g.ellipse(cx, 440, 120, 18, 0, 0, TAU); g.fill();
        });
      }
    }
    // dust in the corners along the back edge, the back edge's shadow
    vgrad(g, xa - 2, 352, xb - xa + 4, 392, [[0, 'rgba(30,20,14,0.5)'], [1, 'rgba(30,20,14,0)']]);
    vgrad(g, xa - 2, 510, xb - xa + 4, H, [[0, 'rgba(30,20,14,0)'], [1, 'rgba(30,20,14,0.45)']]);
  }

  // ------------------------------------------------------------------ per frame
  function flame(ctx, x, y, s, t, seed) {
    const f = 0.85 + 0.12 * Math.sin(t * 11 + seed) + 0.06 * Math.sin(t * 27 + seed * 2);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s * f);
    for (const [col, k, w] of [['#d8481e', 1, 8], ['#ff9a32', 0.72, 5.5], ['#ffe9a0', 0.42, 3]]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(-w * 1.1, -14 * k, Math.sin(t * 8 + seed) * 2.5, -26 * k); ctx.quadraticCurveTo(w * 1.1, -14 * k, w, 0); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function lights(ctx, C, camX, t, s) {
    for (const tx of TORCHES) {
      const x = tx - camX;
      if (x < -200 || x > W + 200) continue;
      const f = 0.85 + 0.1 * Math.sin(t * 7 + tx) + 0.05 * Math.sin(t * 19 + tx * 2);
      glowAt(ctx, C.glowFire, x + 6, 180, 150 * f, 0.4);
      ctx.drawImage(C.sconce.c, Math.round((x - C.sconce.ox) * s) / s, 214 - C.sconce.oy, C.sconce.w, C.sconce.h);
      flame(ctx, x + 6, 182, 1, t, tx);
    }
    // the desk's candles
    const dx = DESK - camX;
    if (dx > -260 && dx < W + 260) {
      glowAt(ctx, C.glowFire, dx, 270, 220, 0.42 + 0.04 * Math.sin(t * 5));
      for (const [x, h] of CANDLES) flame(ctx, x - camX, 290 - h, 0.42, t, x);
    }
    // the chandeliers' candles in the study
    for (const sx of [-160, 160]) { const x = GEM.x + sx - camX; if (x < -60 || x > W + 60) continue; glowAt(ctx, C.glowFire, x, 104, 70, 0.3); for (const k of [-18, -6, 6, 18]) flame(ctx, x + k, 108, 0.32, t, sx + k); }
  }
  function doorway(ctx, C, camX, t) {
    // snow blowing in through the open door, the cold light it lets in
    const x = DOOR - camX;
    if (x < -260 || x > W + 260) return;
    glowAt(ctx, C.glowCold, x + 40, 330, 200, 0.4, 90);
    ctx.save(); archPath(ctx, DOOR - 100 - camX, DOOR + 100 - camX, 110, 180, 366); ctx.clip();
    for (const f of LAY.snow) {
      const y = ((f.y + t * 70 * f.sp) % 260) + 110, xx = x + f.x * 1.2 + Math.sin(t * 2 + f.ph) * 8 - ((t * 40 * f.sp) % 60);
      ctx.globalAlpha = 0.85; ctx.drawImage(C.flake.c, xx - 2, y - 2, 4, 4);
    }
    ctx.restore(); ctx.globalAlpha = 1;
    // a few flakes drifting onto the floor inside
    for (let k = 0; k < 10; k++) { const u = (t * 0.25 + hash1(k)) % 1, fx = x + 60 + u * 160 + Math.sin(t + k) * 10, fy = 250 + u * 180; ctx.globalAlpha = 0.7 * (1 - u); ctx.drawImage(C.flake.c, fx - 2, fy - 2, 4, 4); }
    ctx.globalAlpha = 1;
  }
  function redLight(ctx, C, camX, t) {
    const k = gemK;
    // down the stair (from the gem's room above)
    const sx = STAIR - camX;
    if (sx > -400 && sx < W + 400) glowAt(ctx, C.glowRed, sx, 150, 260, 0.35 * (0.5 + 0.5 * k) * (0.9 + 0.1 * Math.sin(t * 2)), 140);
    // in the study: behind the gem, and a red wash over the room
    const gx = GEM.x - camX;
    if (k > 0.01 && gx > -900 && gx < W + 900) {
      const p = 0.92 + 0.08 * Math.sin(t * 2.6);
      glowAt(ctx, C.glowRed, gx, GEM.y, 230 * p, 0.55 * k);
      glowAt(ctx, C.glowRed, gx, GEM.y, 90, 0.5 * k);
    }
  }
  // the gem's blood-red wash over the study -- its walls, shelves and floor (drawn over the floor, under the fighters);
  // gone at 'Lights OUT!'
  function studyWash(ctx, C, camX, t) {
    const k = gemK;
    if (k <= 0.01 || STUDY0 + 30 - camX >= W) return;
    const p = 0.92 + 0.08 * Math.sin(t * 2.6), gx = GEM.x - camX;
    // (from past the doorway's threshold, feathered over 90 px in slices -- no hard edge, the threshold untinted)
    const a0 = STUDY0 + 30 - camX, F = 90, n = 9;
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i <= n; i++) {
      const xs = i < n ? a0 + (i * F) / n : a0 + F, xe = i < n ? xs + F / n : W;
      if (xe <= 0 || xs >= W) continue;
      ctx.fillStyle = `rgba(255,104,100,${0.62 * k * (i < n ? (i + 0.5) / n : 1)})`; ctx.fillRect(Math.max(0, xs), 0, Math.min(W, xe) - Math.max(0, xs) + 0.5, H);
    }
    ctx.restore();
    // its light pooling on the floor under it and catching the shelves
    glowAt(ctx, C.glowRed, gx, 430, 440 * p, 0.36 * k, 96);
    glowAt(ctx, C.glowRed, gx, 220, 360 * p, 0.16 * k, 200);
  }
  function particles(ctx, C, camX, t, layer) {
    const par = layer ? 1.3 : 0.85;
    for (const f of LAY.motes) {
      if (f.layer !== layer) continue;
      const sx0 = ((f.x - camX * par) % 1000 + 1000) % 1000 - 20;
      const x = sx0 + Math.sin(t * f.fr + f.ph) * f.sw, y = f.y + Math.sin(t * 0.4 * f.fr + f.ph * 2) * 18;
      ctx.globalAlpha = (0.3 + 0.3 * Math.sin(t * 1.3 * f.fr + f.ph)) * (layer ? 0.7 : 0.55);
      const r = layer ? 3 : 2.2; ctx.drawImage(C.mote.c, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    ctx.fillStyle = STONE.deep; ctx.fillRect(0, 0, W, H);
    drawStrip(ctx, C.wallTop, camX, s);
    drawStrip(ctx, C.wall, camX, s);
    doorway(ctx, C, camX, t);
    // the suits in their alcoves (an empty plinth where a knight has stepped out)
    for (let i = 0; i < SUITS.length; i++) {
      const x = SUITS[i] - camX;
      if (x < -100 || x > W + 100) continue;
      const k = suitK[i];
      if (k < 1) ctx.drawImage(C.plinth.c, Math.round((x - C.plinth.ox) * s) / s, 352 - C.plinth.oy, C.plinth.w, C.plinth.h);
      if (k > 0) { ctx.globalAlpha = k; const spr = C.suits[i % 3]; ctx.drawImage(spr.c, Math.round((x - spr.ox) * s) / s, 352 - spr.oy, spr.w, spr.h); ctx.globalAlpha = 1; }
    }
    lights(ctx, C, camX, t, s);
    redLight(ctx, C, camX, t);
    drawStrip(ctx, C.ground, camX, s);
    ctx.globalCompositeOperation = 'screen'; drawStrip(ctx, C.light, camX, s); ctx.globalCompositeOperation = 'source-over';
    studyWash(ctx, C, camX, t);
    // the torches' warm pools on the floor, flickering
    for (const tx of TORCHES) { const x = tx - camX; if (x < -200 || x > W + 200) continue; glowAt(ctx, C.glowFire, x, 400, 170 * (0.92 + 0.08 * Math.sin(t * 7 + tx)), 0.18, 40); }
    particles(ctx, C, camX, t, 0);
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    for (const wx of FRONT_HANG) {
      const sx = frontX(wx, camX, P_FRONT);
      if (sx < -80 || sx > W + 80) continue;
      const spr = C.hangChain, sw = Math.sin(t * 0.9 + wx) * 0.02;
      ctx.save(); ctx.translate(Math.round(sx * s) / s, -6); ctx.rotate(sw); ctx.drawImage(spr.c, -spr.ox, 0, spr.w, spr.h); ctx.restore();
    }
    particles(ctx, C, camX, t, 1);
    ctx.restore();
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(30,20,14,0.38)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  /** a suit of armour in its alcove (i: HOOKS.armour index): 1 standing (default) .. 0 gone (the knight stepped out) */
  function setSuit(i, k) { if (i >= 0 && i < suitK.length) suitK[i] = clamp(+k || 0, 0, 1); }
  /** the gem's blood-red light: 1 on (default) .. 0 'Lights OUT!' */
  function setGemLight(k) { gemK = clamp(+k || 0, 0, 1); }
  return { setScale: st.setScale, setWarm, setSuit, setGemLight, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; } };
}
// the desk's candles: [world x, height]
const CANDLES = [[4632, 22], [4646, 14], [4700, 30], [4716, 18], [4790, 24], [4840, 16], [4852, 26], [4880, 12], [4896, 20]];

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 62, h: 56, colors: ['#7a4e2c', '#523218', '#c9973a', '#4f5466'] },
  barrel: { w: 48, h: 60, colors: ['#6e4228', '#4e2c18', '#7a1e22', '#4f5466'] },
  urn:    { w: 50, h: 60, colors: ['#8a909e', '#5e6472', '#d8d0bc', '#2e5a3a'] },
};
const PROP_DRAW = {
  crate(g) {   // an iron-bound strongbox
    const wood = '#7a4e2c', woodSh = '#523218', woodHi = '#a06c40', iron = '#3e3a44', ironHi = '#6e6a76', gold = '#c9973a';
    const L = -28, Rr = 24, T = -38, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), woodSh, 2.6);
    ink(g, (g) => { g.beginPath(); g.moveTo(L, T); g.quadraticCurveTo((L + Rr) / 2, T - 14, Rr, T); g.lineTo(Rr + dx, T + dy); g.quadraticCurveTo((L + Rr) / 2 + dx, T + dy - 14, L + dx, T + dy); g.closePath(); }, woodHi, 2.4);
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), wood, 2.8, (g) => {
      g.fillStyle = iron; for (const x of [L + 6, Rr - 12]) g.fillRect(x, T, 6, 40); g.fillRect(L, -16, Rr - L, 6);
      g.fillStyle = ironHi; for (const x of [L + 6, Rr - 12]) g.fillRect(x, T, 2, 40);
      ink(g, (g) => roundRect(g, -8, -26, 12, 14, 2), gold, 1.4, (g) => { g.fillStyle = '#2a1a10'; g.fillRect(-3, -21, 2, 5); });
    });
  },
  barrel(g) {  // a wine cask, a red seal
    const wood = '#6e4228', woodSh = '#4e2c18', woodHi = '#946038', iron = '#4f5466', ironHi = '#8e94a8';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -52); g.quadraticCurveTo(-27, -26, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -26, 18, -52); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -60, 30, 66); g.fillStyle = woodHi; g.fillRect(-19, -54, 5, 58);
      for (const y of [-44, -8]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.4); }
      g.fillStyle = '#7a1e22'; g.beginPath(); g.arc(-2, -26, 7, 0, TAU); g.fill(); g.fillStyle = '#a83a3a'; g.beginPath(); g.arc(-4, -28, 2.5, 0, TAU); g.fill();
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 18, 5.5, 0, 0, TAU); }, '#946038', 2.4, (g) => { g.strokeStyle = woodSh; g.lineWidth = 1; g.beginPath(); g.ellipse(0, -52, 12, 3.5, 0, 0, TAU); g.stroke(); });
  },
  urn(g) {     // a fallen helm on a little heap of mail (a spare suit's bits)
    const S = STEEL;
    ink(g, (g) => blob(g, [-28, 2, -24, -10, -8, -16, 10, -14, 26, -8, 28, 2]), '#6e7482', 2.4, (g) => { for (let x = -24; x < 26; x += 6) for (let y = -12; y < 2; y += 5) { g.strokeStyle = '#4a4e5a'; g.lineWidth = 1; g.beginPath(); g.arc(x + (y % 2) * 3, y, 2.4, 0, Math.PI); g.stroke(); } });
    ink(g, (g) => { g.beginPath(); g.moveTo(-17, -10); g.lineTo(-18, -40); g.quadraticCurveTo(0, -62, 18, -40); g.lineTo(17, -10); g.closePath(); }, S.base, 2.6, (g) => { g.fillStyle = S.sh; g.fillRect(4, -60, 20, 52); g.fillStyle = S.hi; g.fillRect(-16, -50, 5, 38); g.fillStyle = S.dark; g.fillRect(-12, -34, 24, 4); g.fillRect(-1.5, -30, 3, 12); });
    ink(g, (g) => poly(g, [-2, -58, 6, -76, 10, -72, 4, -56]), '#7a1e22', 1.6);
  },
};
