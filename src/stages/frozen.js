// Dodongo's Quest - secret stage "THE FROZEN HOLLOW" (src/stages/frozen.js): background, floor and breakable props.
//
// An ice cave under the Dragon Road's Old Stone Bridge, reached through the cracked pillar (docs/SECRETS.md).  Blue-
// white ice walls, icicles, a frozen waterfall, glittering frost and a soft cold light falling through the hole above.
//
// Sections (world x):  frost 0-1000 (the Frost Hole: daylight through the hole the heroes dropped in by, the bridge's
// old stone pier frozen into the wall)  |  icicles 1000-2300 (the Icicle Gallery: long icicles, ice columns, things
// frozen into the walls)  |  falls 2300-3600 (the Frozen Falls: a cliff with a huge frozen waterfall over a frozen
// pool; the mini-boss arena is the last screen, its right part kept clear for the return portal).
//
// Back-to-front (drawBack): the cave depths (p 0.12) -> ice columns (p 0.4) -> the wall base (1.0) -> the pier and the
// near ice columns (1.0) -> the ceiling and its icicles (1.0) / the falls cliff (1.0) -> live glow on the falls ->
// the floor (1.0) -> the frost light (the readability band) -> the light shaft from the hole -> back glitter and snow.
// drawFront: rare foreground icicles (p 1.25, never on an arena screen), near glitter and snowflakes.
// Every static element is cached per scale (chunked strips + sprites, src/canvasmem.js); animated bits are live.
// setWarm(w) is accepted (the game sets it every frame) but this stage has no curse to lift.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 3600;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'frost', name: 'The Frost Hole', x0: 0, x1: 1000 },
  { id: 'icicles', name: 'The Icicle Gallery', x0: 1000, x1: 2300 },
  { id: 'falls', name: 'The Frozen Falls', x0: 2300, x1: 3600 },
];
// arena screens (camera left edge; the last = the frost brute chief), the waystone, and the art's landmarks (world x)
export const ARENAS = [450, 1500, CAM_MAX];
export const WAYSTONES = [1350];
const HOLE = [150, 560], PIER = 860, COLS = [1190, 1740, 2190], FW0 = 2390, FALLS_X = 3110;
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES, hole: HOLE, pier: PIER, falls: FALLS_X, portalX: CAM_MAX + 780 };

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
const P_FAR = 0.12, P_MID = 0.4, P_FRONT = 1.25;
const GT0 = 340;                       // the floor strip covers screen y GT0..H
const NEAR_END = FW0 + 90;             // the ceiling / wall-base strips stop under the falls cliff
const ICE = { deep: '#1a2747', dark: '#2d4776', mid: '#6f9bd0', light: '#a9d0f2', pale: '#d4eafb', hi: '#f6fcff', glow: '140,220,255' };
const ROCK = { base: '#34466f', sh: '#253458', hi: '#4f6596', crack: '#18213e' };
const WALLP = { base: '#6a92c6', sh: '#5079ae', hi: '#94bce6', crack: '#36598c' };
const CLIFF = { base: '#3d5a8c', sh: '#2c4573', hi: '#5c7fb3', crack: '#1d2d55' };
const STONE = { base: '#7f8399', sh: '#5d6178', hi: '#a6a9be', joint: '#3a3d52' };
const SNOW = { snow: '#eef6fd', snowSh: '#b2cbe6', hi: '#ffffff' };
const CLAN = { red: '#a6322b', redSh: '#76201d', gold: '#e2b24c', goldSh: '#a87a2c' };
const LS = { far: ['#22325a', 0.5], mid: ['#1d2b50', 0.55], near: ['#1a2648', 0.62], front: ['#141c38', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);

const holeK = (x) => sstep(HOLE[0], HOLE[0] + 90, x) * (1 - sstep(HOLE[1] - 90, HOLE[1], x));
const galK = (x) => sstep(950, 1250, x) * (1 - sstep(2150, 2400, x));
const ceilBase = (x) => 58 + 15 * Math.sin(x * 0.0047 + 0.3) + 8 * Math.sin(x * 0.017 + 1.1) + 14 * vnoise(x, 37, 7) + 16 * galK(x);
const ceilY = (x) => lerp(ceilBase(x), -40, holeK(x));
const wallTop = (x) => 288 + 13 * Math.sin(x * 0.0061 + 0.4) + 7 * Math.sin(x * 0.019 + 2) + 16 * vnoise(x, 53, 3);
// things frozen into the wall base: [x, kind]
// (critics: the earlier fish / shield panes on the lane's back edge read as pickups -- now two dim relics sunk high in the wall)
const FROZEN = [[1060, 'helmet'], [2100, 'lantern']];   // (the lantern clear of the ice-crystal prop at x 1800-1900)
// long icicles hanging from the gallery ceiling (sprites): [x, variant]
const LONG_ICI = [[1010, 0], [1105, 1], [1290, 2], [1420, 0], [1530, 1], [1650, 2], [1830, 0], [1915, 1], [2060, 2], [2280, 0], [650, 1], [760, 2]];
// foreground icicles (p 1.25): only where no arena screen sees them
const FRONT_ICI = [240, 1460, 2560].filter((x) => clearOfArenas(x, 60, P_FRONT));

const LAY = (() => {
  const R = mulberry(3600);
  const motes = [];
  for (let i = 0; i < 150; i++) motes.push({ x: R.r(0, 1000), y: R.r(0, 560), sp: R.r(0.5, 1.4), sw: R.r(3, 14), ph: R.r(0, TAU), fr: R.r(0.4, 1.3), k: R(), layer: i < 100 ? 0 : 1 });
  const twinkles = [];
  for (let i = 0; i < 26; i++) twinkles.push({ x: R.r(0, 1300), y: R.r(110, 330), ph: R.r(0, TAU), sp: R.r(0.6, 1.6), r: R.r(30, 70) });
  return { motes, twinkles };
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
// an hourglass ice column from y0 to y1 (centre cx, width w), lit from the upper left
function iceColumn(g, cx, y0, y1, w, seed, P) {
  const R = mulberry(seed), n = 10, Lp = [], Rp = [];
  const waist = R.r(0.36, 0.5), wy = R.r(0.42, 0.58);
  for (let k = 0; k <= n; k++) {
    const f = k / n, y = lerp(y0, y1, f);
    const prof = f < wy ? lerp(1.12, waist, smooth(f / wy)) : lerp(waist, 1.4, smooth((f - wy) / (1 - wy)) ** 1.4);
    const hw = (w / 2) * prof, wob = (R() - 0.5) * w * 0.1;
    Lp.push([cx - hw + wob, y]); Rp.push([cx + hw + wob * 0.6, y]);
  }
  const outline = flat(Lp.concat(Rp.slice().reverse()));
  const build = (g) => { g.beginPath(); g.moveTo(outline[0], outline[1]); for (let i = 2; i < outline.length; i += 2) g.lineTo(outline[i], outline[i + 1]); g.closePath(); };
  ink(g, build, P.body, 2, (g) => {
    // the shaded right side, the bright left edge, vertical flow streaks, trapped bubbles
    g.fillStyle = P.sh; g.beginPath(); g.moveTo(Rp[0][0], Rp[0][1]);
    for (const [x, y] of Rp) g.lineTo(x, y);
    for (let k = Rp.length - 1; k >= 0; k--) g.lineTo(lerp(Lp[k][0], Rp[k][0], 0.62), Rp[k][1]);
    g.closePath(); g.fill();
    g.fillStyle = rgba(P.hi, 0.75); g.beginPath();
    for (let k = 0; k < Lp.length; k++) g.lineTo(lerp(Lp[k][0], Rp[k][0], 0.08), Lp[k][1]);
    for (let k = Lp.length - 1; k >= 0; k--) g.lineTo(lerp(Lp[k][0], Rp[k][0], 0.2), Lp[k][1]);
    g.closePath(); g.fill();
    g.lineWidth = 1.4;
    for (let s = 0; s < 4; s++) {
      const fx = R.r(0.3, 0.75), pts = [];
      for (let k = 0; k < Lp.length; k++) pts.push(lerp(Lp[k][0], Rp[k][0], fx + Math.sin(k * 0.9 + s) * 0.04), Lp[k][1]);
      g.strokeStyle = rgba(s % 2 ? P.hi : P.sh, 0.45); curve(g, pts); g.stroke();
    }
    for (let b = 0; b < 9; b++) {
      const k = R.i(1, n - 1), f = R.r(0.25, 0.7), x = lerp(Lp[k][0], Rp[k][0], f), y = Lp[k][1] + R.r(-10, 10);
      g.strokeStyle = rgba(P.hi, 0.7); g.lineWidth = 1; g.beginPath(); g.arc(x, y, R.r(1.5, 3.5), 0, TAU); g.stroke();
    }
  });
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
    const fr = layerRange(0, LEVEL_LEN, P_FAR), mr = layerRange(0, LEVEL_LEN, P_MID);
    c.far = buildStrip(fr[0], fr[1], 0, 372, csFar, P_FAR, (g, xa, xb) => { setLS('far'); drawFar(g, xa, xb); });
    c.mid = buildStrip(mr[0], mr[1], 30, 372, csFar, P_MID, (g, xa, xb) => { setLS('mid'); drawMid(g, xa, xb); });
    c.wall = buildStrip(-10, NEAR_END, 240, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawWall(g, xa, xb); });
    c.ceil = buildStrip(-10, NEAR_END, 0, 150, cs, 1, (g, xa, xb) => { setLS('near'); drawCeil(g, xa, xb); });
    c.falls = buildStrip(FW0 - 60, LEVEL_LEN + 10, 0, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawFallsWall(g, xa, xb); });
    c.ground = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawGround(g, xa, xb); });
    // the frost light: a soft cold light on the wall base and the floor's back half at fighter height (readability:
    // the fighters' dark outlines against the blue wall base), stronger under the hole and in front of the falls
    c.light = lightBand(-10, LEVEL_LEN + 10, 250, 452, '215,236,255', [[0, 0], [0.35, 0.1], [0.55, 0.16], [0.8, 0.08], [1, 0]], [0, 0], Math.min(cs, 0.5), (g) => {
      lightPool(g, (HOLE[0] + HOLE[1]) / 2 + 120, 380, 340, 70, '230,245,255', 0.2);
      lightPool(g, FALLS_X, 360, 380, 80, '200,240,255', 0.08);
    });
    // near sprites: the bridge pier, the gallery's ice columns, long icicles
    setLS('near');
    c.pier = makeSprite(200, 400, 100, 380, cs, (g) => drawPier(g));
    c.cols = [0, 1, 2].map((k) => makeSprite(200, 400, 100, 382, cs, (g) => { setLS('near'); iceColumn(g, 0, -380, 0, 104 + k * 10, 71 + k * 13, { body: '#b4d8f5', sh: '#86b2e0', hi: '#f2faff' }); snowMound(g, 0, -4, 76 + k * 8, 71 + k); }));
    c.longIci = [0, 1, 2].map((k) => makeSprite(44, 200, 22, 4, cs, (g) => { setLS('near'); icicle(g, 0, 0, 16 + k * 5, 120 + k * 26, (k - 1) * 3, ICE, 1.6); icicle(g, 9 - k * 4, 0, 8, 46 + k * 12, 1, ICE, 1.2); }));
    c.back = [];
    for (const [i, x] of COLS.entries()) c.back.push({ spr: c.cols[i % 3], x, y: 366, flip: i === 1 });
    c.back.push({ spr: c.pier, x: PIER, y: 368 });
    c.ici = LONG_ICI.map(([x, k]) => ({ spr: c.longIci[k], x, y: ceilY(x) - 6 }));
    c.frontIci = makeSprite(90, 300, 45, 0, cs, (g) => { setLS('front'); icicle(g, 0, -10, 44, 196, 4, ICE, 2.2); icicle(g, -26, -10, 20, 120, -2, ICE, 1.8); icicle(g, 24, -10, 18, 90, 2, ICE, 1.8); });
    // glows and particles
    c.glowCyan = radialSprite(64, 1, [[0, 'rgba(150,225,255,0.6)'], [0.4, 'rgba(110,200,255,0.22)'], [1, 'rgba(90,180,255,0)']]);
    c.glowWhite = radialSprite(64, 1, [[0, 'rgba(255,255,255,0.7)'], [0.35, 'rgba(225,245,255,0.25)'], [1, 'rgba(210,240,255,0)']]);
    c.flakes = [1.2, 1.8, 2.6].map((r) => radialSprite(r * 2, Math.max(1, cs), [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]));
    c.spark = makeSprite(24, 24, 12, 12, Math.max(1, cs), (g) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 7); gr.addColorStop(0, 'rgba(200,240,255,0.8)'); gr.addColorStop(1, 'rgba(160,220,255,0)');
      g.fillStyle = gr; g.fillRect(-12, -12, 24, 24);
      g.fillStyle = '#ffffff'; poly(g, [0, -11, 1.4, -1.4, 11, 0, 1.4, 1.4, 0, 11, -1.4, 1.4, -11, 0, -1.4, -1.4]); g.fill();
    });
    return c;
  }

  // ------------------------------------------------------------------ deep layers
  function drawFar(g, xa, xb) {
    vgrad(g, xa - 2, 0, xb - xa + 4, 372, [[0, '#0f1730'], [0.3, '#172449'], [0.68, '#25416f'], [1, '#335a8f']]);
    for (let i = Math.floor((xa - 240) / 230); i * 230 < xb + 240; i++) {
      const x = i * 230 + hash1(i * 7 + 1) * 140, y = 150 + hash1(i * 3 + 5) * 130, r = 90 + hash1(i * 11) * 80;
      lightPool(g, x, y, r, r * 0.75, ICE.glow, 0.13 + hash1(i * 13) * 0.1);
    }
    // ice curtains hanging from the far roof
    for (let i = Math.floor((xa - 80) / 42); i * 42 < xb + 80; i++) {
      const x = i * 42 + hash1(i * 17 + 3) * 22, len = 80 + hash1(i * 5 + 9) * 160, w = 14 + hash1(i * 23) * 24;
      g.fillStyle = rgba('#3a5c93', 0.6); poly(g, [x - w, -4, x + w, -4, x + w * 0.3, len * 0.72, x + 1, len, x - w * 0.4, len * 0.76]); g.fill();
      g.fillStyle = rgba('#86afe0', 0.22); poly(g, [x - w, -4, x - w * 0.5, -4, x - w * 0.12, len * 0.8, x - w * 0.4, len * 0.76]); g.fill();
    }
    // far mounds and stalagmites
    for (let i = Math.floor((xa - 90) / 64); i * 64 < xb + 90; i++) {
      const x = i * 64 + hash1(i * 29 + 2) * 30, top = 268 + hash1(i * 41) * 56, w = 40 + hash1(i * 43) * 40;
      g.fillStyle = '#284673'; blob(g, [x - w, 380, x - w * 0.6, top + 26, x - w * 0.15, top, x + w * 0.3, top + 10, x + w * 0.75, top + 34, x + w, 380]); g.fill();
      g.strokeStyle = rgba('#5f88bf', 0.55); g.lineWidth = 2; g.beginPath(); g.moveTo(x - w * 0.6, top + 26); g.quadraticCurveTo(x - w * 0.35, top + 2, x - w * 0.05, top + 3); g.stroke();
    }
    for (let i = Math.floor(xa / 9); i * 9 < xb; i++) {
      if (hash1(i * 3 + 11) > 0.16) continue;
      g.fillStyle = rgba('#e8f6ff', 0.25 + hash1(i * 7) * 0.4); g.fillRect(i * 9 + hash1(i) * 8, 30 + hash1(i * 5) * 300, 1.4, 1.4);
    }
    vgrad(g, xa - 2, 290, xb - xa + 4, 372, [[0, 'rgba(160,205,245,0)'], [1, 'rgba(160,205,245,0.28)']]);
  }
  function drawMid(g, xa, xb) {
    const P = { body: '#4d76ae', sh: '#3a5c92', hi: '#8db9e6' };
    for (let i = Math.floor((xa - 140) / 150); i * 150 < xb + 140; i++) {
      const h = hash1(i * 19 + 4), x = i * 150 + hash1(i * 7 + 3) * 70, w = 46 + hash1(i * 13) * 40;
      if (h < 0.42) iceColumn(g, x, 18, 392, w, 300 + i, P);
      else if (h < 0.78) {       // a stalactite and a stalagmite, not (yet) met
        const tip = 120 + hash1(i * 5) * 70;
        ink(g, (g) => poly(g, [x - w * 0.55, 20, x + w * 0.55, 20, x + w * 0.12, tip, x - 2, tip + 18]), P.body, 1.8, (g) => { g.fillStyle = P.sh; g.fillRect(x + 2, 20, w, tip); g.fillStyle = rgba(P.hi, 0.7); g.fillRect(x - w * 0.42, 20, w * 0.14, tip - 30); });
        const top = 240 + hash1(i * 9) * 50;
        ink(g, (g) => poly(g, [x - w * 0.7, 390, x - w * 0.18, top + 16, x + 2, top, x + w * 0.24, top + 20, x + w * 0.75, 390]), P.body, 1.8, (g) => { g.fillStyle = P.sh; g.fillRect(x + 4, top, w, 400 - top); g.fillStyle = rgba(P.hi, 0.6); poly(g, [x - w * 0.5, 390, x - w * 0.12, top + 18, x - 2, top + 8, x - w * 0.2, 390]); g.fill(); });
      }
    }
    // the near ledge of the far cavern: snow-topped ice mounds
    const top = (x) => 326 + 10 * Math.sin(x * 0.013 + 1) + 7 * vnoise(x, 29, 9);
    ink(g, (g) => { g.beginPath(); g.moveTo(xa - 4, 380); for (let x = al(xa, 8) - 8; x <= xb + 8; x += 8) g.lineTo(x, top(x)); g.lineTo(xb + 4, 380); g.closePath(); }, '#43679d', 1.6, (g) => {
      vgrad(g, xa, 320, xb - xa, 372, [[0, 'rgba(160,200,240,0.4)'], [1, 'rgba(30,50,90,0.25)']]);
    });
    snowCap(g, xa - 6, xb + 6, top, 7, 911, 1.2);
    vgrad(g, xa - 2, 300, xb - xa + 4, 372, [[0, 'rgba(170,210,245,0)'], [1, 'rgba(170,210,245,0.22)']]);
  }

  // ------------------------------------------------------------------ near: ceiling, wall base, the falls cliff
  function drawHoleSky(g) {
    const a = HOLE[0] - 20, b = HOLE[1] + 20;
    // daylight only through the roof's thickness (above its underside line), spilling a little below it
    g.save(); g.beginPath(); g.moveTo(a, -4); for (let x = a; x <= b; x += 6) g.lineTo(x, ceilBase(x) + 4); g.lineTo(b, -4); g.closePath(); g.clip();
    vgrad(g, a, 0, b - a, 110, [[0, '#9ccbef'], [0.55, '#c6e2f7'], [1, '#e6f3fc']]);
    // the Old Stone Bridge's arch seen from below: a band of voussoirs across the top, icicles under it
    const by = (x) => 16 + 10 * Math.sin((x - a) / (b - a) * Math.PI);
    ink(g, (g) => { g.beginPath(); g.moveTo(a, -4); for (let x = a; x <= b; x += 10) g.lineTo(x, by(x)); g.lineTo(b, -4); g.closePath(); }, STONE.base, 2, (g) => {
      g.strokeStyle = STONE.joint; g.lineWidth = 1.4;
      for (let x = a + 14; x < b; x += 28) { polyline(g, [x, -4, x + (x - (a + b) / 2) * 0.06, by(x)]); g.stroke(); }
      g.fillStyle = rgba(STONE.sh, 0.7); g.fillRect(a, 0, b - a, 8);
    });
    for (let x = a + 8; x < b - 6; x += 13) icicle(g, x, by(x) - 1, 5 + hash1(x) * 4, 8 + hash1(x * 3) * 18, 0.5, ICE, 1);
    g.restore();
    // the light spilling in under the hole
    lightPool(g, (a + b) / 2, 70, 300, 80, '240,250,255', 0.55);
  }
  function drawCeil(g, xa, xb) {
    if (xa < HOLE[1] + 30 && xb > HOLE[0] - 30) drawHoleSky(g);
    const edge = (g) => { g.beginPath(); g.moveTo(xa - 4, -4); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, ceilY(x)); g.lineTo(xb + 4, -4); g.closePath(); };
    g.save(); edge(g); g.clip();
    facets(g, xa, xb, -10, 150, ROCK, 17, 70, 34, 0.6, 0.6);
    vgrad(g, xa, 0, xb - xa, 120, [[0, 'rgba(10,16,34,0.55)'], [1, 'rgba(10,16,34,0)']]);
    g.restore();
    // the ice coat along the ceiling's underside
    g.save(); edge(g); g.clip();
    g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, ceilY(x)); g.lineWidth = 16; g.strokeStyle = '#5f88c0'; g.stroke(); g.lineWidth = 6; g.strokeStyle = '#9ec6ee'; g.stroke();
    g.restore();
    g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, ceilY(x)); g.lineWidth = 1.5 * LK + 0.3; g.strokeStyle = LINE; g.stroke();
    // icicle fringe (longer in the gallery)
    for (let i = Math.floor(xa / 10) - 3; i * 10 < xb + 30; i++) {
      if (hash1(i * 13 + 5) < 0.22) continue;
      const x = i * 10 + hash1(i * 7) * 6;
      if (holeK(x) > 0.15) continue;
      const y = ceilY(x) - 3, gk = galK(x);
      let len = 7 + hash1(i * 3 + 1) * 18 * (1 + gk * 1.3);
      if (hash1(i * 29) > 0.9) len *= 1.7;
      len = Math.min(len, 146 - y);
      icicle(g, x, y, 4 + hash1(i * 19) * 4 + len * 0.07, len, (hash1(i * 31) - 0.5) * 2, ICE, 1.2);
    }
  }
  function snowMound(g, x, y, w, seed) {
    const R = mulberry(seed);
    const pts = [x - w, y + 6];
    for (let k = 1; k < 6; k++) pts.push(x - w + (2 * w * k) / 6, y - R.r(6, 15) * Math.sin((k / 6) * Math.PI));
    pts.push(x + w, y + 6, x, y + 10);
    ink(g, (g) => blob(g, pts), SNOW.snowSh, 1.4, (g) => { g.save(); g.translate(-2, -4); blob(g, pts); g.fillStyle = SNOW.snow; g.fill(); g.restore(); });
  }
  function drawWall(g, xa, xb) {
    const top = (g) => { g.beginPath(); g.moveTo(xa - 4, 380); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, wallTop(x)); g.lineTo(xb + 4, 380); g.closePath(); };
    ink(g, top, null, 1.8, (g) => {
      facets(g, xa, xb, 240, 380, WALLP, 23, 58, 30, 0.55, 0.9);
      vgrad(g, xa, 250, xb - xa, 372, [[0, 'rgba(230,245,255,0.18)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(20,34,70,0.32)']]);
      for (const [x, kind] of FROZEN) if (x > xa - 60 && x < xb + 60) frozenThing(g, x, kind);
    });
    snowCap(g, xa - 6, xb + 6, wallTop, 9, 517, 1.4);
  }
  // an old relic frozen deep in the wall base: high above the lane, dimmed and blue-tinted behind rough ice (scenery,
  // never mistaken for a pickup)
  function frozenThing(g, x, kind) {
    const y = wallTop(x) + 30, R = mulberry(Math.round(x));
    const pane = []; for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; pane.push(x + Math.cos(a) * R.r(24, 32), y + Math.sin(a) * R.r(16, 22)); }
    g.save(); blob(g, pane); g.fillStyle = rgba('#a8cdf0', 0.5); g.fill();
    g.save(); g.translate(x, y); g.scale(0.8, 0.8); g.globalAlpha = 0.55;
    if (kind === 'lantern') {
      strokeLine(g, [0, -24, 0, -16], 1.4, '#2a3048');
      ink(g, (g) => poly(g, [-8, -16, 8, -16, 10, -12, -10, -12]), '#4a4e60', 1.4);
      ink(g, (g) => poly(g, [-8, -12, 8, -12, 7, 8, -7, 8]), '#e8dcb8', 1.4);
      ink(g, (g) => poly(g, [-9, 8, 9, 8, 7, 12, -7, 12]), '#4a4e60', 1.4);
    } else {   // an old Clan helmet with a little dragon crest
      ink(g, (g) => { g.beginPath(); g.arc(0, 4, 16, Math.PI, 0); g.lineTo(16, 10); g.lineTo(-16, 10); g.closePath(); }, '#9aa0b4', 1.6, (g) => { g.fillStyle = '#6e7488'; g.fillRect(4, -14, 16, 26); });
      ink(g, (g) => poly(g, [-4, -12, 0, -24, 6, -16, 3, -12]), '#8a6a7a', 1.3);
    }
    g.restore();
    blob(g, pane); g.fillStyle = rgba('#8fb8e4', 0.4); g.fill();
    g.fillStyle = rgba('#ffffff', 0.35); poly(g, [x - 18, y - 12, x - 10, y - 14, x - 20, y + 8, x - 24, y + 4]); g.fill();
    blob(g, pane); g.strokeStyle = rgba('#d8ecff', 0.45); g.lineWidth = 1.4; g.stroke();
    g.restore();
  }
  function drawPier(g) {
    // the Old Stone Bridge's pier, frozen into the cave: masonry courses from the roof down to the wall base
    const L = -62, R = 62, T = -390, B = 0;
    ink(g, (g) => poly(g, [L, T, R, T, R + 4, B, L - 4, B]), STONE.base, 2.2, (g) => {
      for (let r = 0, y = B; y > T; r++, y -= 36) {
        const off = r % 2 ? 0 : 32;
        g.fillStyle = r % 3 === 1 ? STONE.hi : STONE.base; g.globalAlpha = 0.35; g.fillRect(L - 6, y - 36, R - L + 12, 36); g.globalAlpha = 1;
        g.strokeStyle = STONE.joint; g.lineWidth = 1.5; polyline(g, [L - 6, y, R + 6, y]); g.stroke();
        for (let x = L - 64 + off; x < R; x += 64) { polyline(g, [x, y, x, y - 36]); g.stroke(); }
      }
      g.fillStyle = rgba(STONE.sh, 0.75); g.fillRect(R - 26, T, 32, B - T);
      g.fillStyle = rgba(STONE.hi, 0.5); g.fillRect(L, T, 8, B - T);
      // a carved Clan dragon on one block, faded
      g.save(); g.translate(-6, -214); g.strokeStyle = rgba('#4a4e66', 0.8); g.lineWidth = 2.4;
      g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(9, -10); g.quadraticCurveTo(15, -2, 5, 1); g.quadraticCurveTo(-9, 5, -3, 11); g.stroke();
      g.restore();
      // frost creeping up from the wall and down from the roof
      vgrad(g, L - 6, -110, R - L + 12, 0, [[0, 'rgba(200,230,255,0)'], [1, 'rgba(200,230,255,0.55)']]);
      vgrad(g, L - 6, T, R - L + 12, T + 140, [[0, 'rgba(170,210,250,0.7)'], [1, 'rgba(170,210,250,0)']]);
    });
    // ice sheathing one edge, icicles off a ledge, snow at the foot
    ink(g, (g) => { g.beginPath(); g.moveTo(L - 4, -300); g.quadraticCurveTo(L - 18, -180, L - 14, -40); g.lineTo(L - 4, -20); g.closePath(); }, ICE.light, 1.4, (g) => { g.fillStyle = rgba(ICE.hi, 0.8); g.fillRect(L - 16, -300, 5, 280); });
    ink(g, (g) => poly(g, [L - 8, -150, R + 8, -150, R + 8, -140, L - 8, -140]), STONE.hi, 1.6);
    for (let x = L - 4; x < R + 6; x += 9) icicle(g, x, -141, 5 + hash1(x * 3) * 3, 10 + hash1(x * 7) * 26, 0.5, ICE, 1.1);
    snowMound(g, 0, -2, 92, 33);
  }
  function drawFallsWall(g, xa, xb) {
    // the cliff: a jagged buttress edge at FW0 (left), rock up to the roof
    const edgeX = (y) => FW0 + 22 * Math.sin(y * 0.021 + 1) + 12 * vnoise(y, 23, 41) * 2 - (y > 250 ? (y - 250) * 0.5 : 0);
    const cliff = (g) => { g.beginPath(); g.moveTo(edgeX(-10), -10); for (let y = 0; y <= 380; y += 10) g.lineTo(edgeX(y), y); g.lineTo(xb + 10, 380); g.lineTo(xb + 10, -10); g.closePath(); };
    ink(g, cliff, CLIFF.base, 2, (g) => {
      facets(g, Math.max(xa, FW0 - 80), xb, -10, 380, CLIFF, 37, 84, 46, 0.6, 0.7);
      vgrad(g, xa, 0, xb - xa, 372, [[0, 'rgba(10,16,36,0.6)'], [0.45, 'rgba(10,16,36,0.1)'], [1, 'rgba(160,200,240,0.15)']]);
      // snow-topped ledges
      for (const [x0, x1, y] of [[FW0 + 30, FW0 + 230, 206], [FW0 + 120, FW0 + 380, 120], [FALLS_X + 270, FALLS_X + 470, 168], [FALLS_X + 230, FALLS_X + 420, 262], [FW0 + 60, FW0 + 300, 286]]) {
        if (x1 < xa - 20 || x0 > xb + 20) continue;
        const top = (x) => y + 4 * Math.sin(x * 0.05);
        ink(g, (g) => poly(g, [x0, y + 2, x1, y + 2, x1 - 10, y + 16, x0 + 10, y + 16]), CLIFF.sh, 1.4);
        snowCap(g, x0, x1, top, 8, x0, 1.3);
        for (let x = x0 + 8; x < x1 - 8; x += 11) icicle(g, x, y + 14, 5 + hash1(x) * 3, 8 + hash1(x * 5) * 22, 0.4, ICE, 1);
      }
      // the cold glow behind the falls
      lightPool(g, FALLS_X, 250, 330, 230, '150,215,255', 0.35);
    });
    g.save(); cliff(g); g.clip();
    g.beginPath(); for (let y = -10; y <= 380; y += 10) g.lineTo(edgeX(y), y); g.lineWidth = 18; g.strokeStyle = '#5f88c0'; g.stroke(); g.lineWidth = 7; g.strokeStyle = '#a4cbf0'; g.stroke();
    g.restore();
    for (let y = 70; y < 300; y += 26) icicle(g, edgeX(y) + 3, y, 6 + hash1(y) * 4, 14 + hash1(y * 3) * 26, -1, ICE, 1.1);
    drawWaterfall(g);
    // the wall base along the cliff foot (ice boulders), as the gallery's
    const top = (x) => wallTop(x) + 6;
    ink(g, (g) => { g.beginPath(); g.moveTo(Math.max(xa, FW0 - 60), 380); for (let x = al(Math.max(xa, FW0 - 60), 6); x <= xb + 6; x += 6) g.lineTo(x, lerp(top(x), 394, 1 - sstep(200, 290, Math.abs(x - FALLS_X)))); g.lineTo(xb + 4, 380); g.closePath(); }, null, 1.8, (g) => {
      facets(g, Math.max(xa, FW0 - 60), xb, 250, 380, WALLP, 23, 58, 30, 0.55, 0.9);
      vgrad(g, xa, 260, xb - xa, 372, [[0, 'rgba(230,245,255,0.18)'], [1, 'rgba(20,34,70,0.32)']]);
    });
  }
  // the frozen waterfall: vertical ice ribbons from a notch in the cliff, splaying into frozen splash at the foot
  function drawWaterfall(g) {
    const halfW = (y) => lerp(112, 230, Math.pow(clamp(y / 350, 0, 1), 1.6));
    const xL = (y) => FALLS_X - halfW(y) + 6 * Math.sin(y * 0.045), xR = (y) => FALLS_X + halfW(y) + 6 * Math.sin(y * 0.04 + 2);
    const outline = (g) => { g.beginPath(); g.moveTo(xL(-10), -10); for (let y = 0; y <= 360; y += 10) g.lineTo(xL(y), y); for (let y = 360; y >= -10; y -= 10) g.lineTo(xR(y), y); g.closePath(); };
    ink(g, outline, '#cfe7fb', 2.2, (g) => {
      const n = 11;
      for (let k = 0; k < n; k++) {
        const f0 = k / n, f1 = (k + 1) / n, ph = k * 1.7;
        const bx = (y, f) => lerp(xL(y), xR(y), f) + Math.sin(y * 0.03 + ph) * 4;
        g.beginPath(); g.moveTo(bx(-10, f0), -10);
        for (let y = 0; y <= 360; y += 12) g.lineTo(bx(y, f0), y);
        for (let y = 360; y >= -10; y -= 12) g.lineTo(bx(y, f1), y);
        g.closePath();
        const edge = Math.abs(f0 + 0.5 / n - 0.5) * 2;
        g.fillStyle = mix(k % 2 ? '#e6f4ff' : '#bfe0f8', '#7fb0e2', edge * 0.75); g.fill();
        g.strokeStyle = rgba('#ffffff', 0.55); g.lineWidth = 1.6; curve(g, [bx(-10, f0 + 0.3 / n), -10, bx(120, f0 + 0.35 / n), 120, bx(240, f0 + 0.3 / n), 240, bx(350, f0 + 0.4 / n), 350]); g.stroke();
        g.strokeStyle = rgba('#5d8fc6', 0.5); g.lineWidth = 1.1; polyline(g, [bx(0, f1), 0, bx(180, f1), 180, bx(340, f1), 340]); g.stroke();
      }
      lightPool(g, FALLS_X, 170, 140, 170, '255,255,255', 0.22);
      vgrad(g, FALLS_X - 260, 170, 520, 362, [[0, 'rgba(50,90,150,0)'], [1, 'rgba(50,90,150,0.3)']]);
      // (critics: the pale Frost Chief read only by its outline here) one notch darker behind y 250-350
      vgrad(g, FALLS_X - 260, 220, 520, 372, [[0, 'rgba(40,74,130,0)'], [0.2, 'rgba(40,74,130,0.2)'], [0.85, 'rgba(40,74,130,0.24)'], [1, 'rgba(40,74,130,0.12)']]);
    });
    // frozen splash at the foot: faceted chunks of blue ice (critics: round white bulbs read as throwable snowballs)
    const R = mulberry(77);
    for (let k = 0; k < 13; k++) {
      const f = k / 12, x = lerp(FALLS_X - 250, FALLS_X + 250, f) + R.r(-14, 14), r = R.r(22, 40) * (1 - Math.abs(f - 0.5) * 0.7), y = 358 - r * 0.45 - R.r(0, 22) * (1 - Math.abs(f - 0.5));
      const pts = []; for (let j = 0; j < 6; j++) { const a = Math.PI + (j / 5) * Math.PI + R.r(-0.15, 0.15); pts.push(x + Math.cos(a) * r * R.r(1, 1.3), y + Math.sin(a) * r * R.r(0.8, 1.1)); }
      pts.push(x + r * 1.1, y + r * 0.4, x - r * 1.1, y + r * 0.4);
      ink(g, (g) => poly(g, pts), '#a8cdee', 1.6, (g) => {
        g.fillStyle = '#82aedd'; poly(g, [x, y - r * 0.2, pts[8], pts[9], pts[10], pts[11], x + r * 1.2, y + r]); g.fill();
        g.fillStyle = rgba('#e6f4ff', 0.85); poly(g, [pts[0], pts[1], pts[2], pts[3], pts[4], pts[5], x - r * 0.1, y - r * 0.1]); g.fill();
      });
    }
    // the notch's lip at the top: rough rock with snow and icicles over the falls' head (no flat block)
    const lipTop = (x) => 26 + 6 * Math.sin(x * 0.06);
    const lipBot = (x) => 34 + 4 * Math.cos((x - FALLS_X) / 140 * 1.4) + 5 * vnoise(x, 17, 3);
    ink(g, (g) => { g.beginPath(); g.moveTo(FALLS_X - 170, -12); for (let x = FALLS_X - 170; x <= FALLS_X + 170; x += 8) g.lineTo(x, Math.abs(x - FALLS_X) > 150 ? lerp(lipBot(x), -12, (Math.abs(x - FALLS_X) - 150) / 20) : lipBot(x)); g.lineTo(FALLS_X + 170, -12); g.closePath(); }, CLIFF.base, 1.8, (g) => { facets(g, FALLS_X - 180, FALLS_X + 180, -14, 60, CLIFF, 53, 50, 26, 0.5, 0.7); });
    snowCap(g, FALLS_X - 150, FALLS_X + 150, lipTop, 9, 4040, 1.3);
    for (let x = FALLS_X - 132; x < FALLS_X + 136; x += 9) icicle(g, x, 34 + 4 * Math.cos((x - FALLS_X) / 140 * 1.4), 6 + hash1(x) * 4, 12 + hash1(x * 3) * 34, 0.5, ICE, 1.1);
  }

  // ------------------------------------------------------------------ the floor
  function drawGround(g, xa, xb) {
    vgrad(g, xa - 2, 356, xb - xa + 4, H, [[0, '#b4cce6'], [0.06, '#c8dbef'], [0.45, '#d2e1f1'], [0.85, '#c8daed'], [1, '#b6cce6']]);
    // faint cracks in the ice and little wind-blown drifts (world-aligned)
    for (let i = Math.floor((xa - 120) / 170); i * 170 < xb + 120; i++) {
      const x = i * 170 + hash1(i * 41 + 3) * 110, y = 392 + hash1(i * 43 + 1) * 120, h = hash1(i * 47);
      if (h < 0.45) { g.strokeStyle = rgba('#8fb0d8', 0.55); g.lineWidth = 1.2; polyline(g, [x - 26, y, x - 8, y - 3, x + 6, y + 2, x + 24, y - 1]); g.stroke(); polyline(g, [x - 8, y - 3, x - 2, y - 9]); g.stroke(); }
      else if (h < 0.7) { g.fillStyle = rgba('#a2bfe0', 0.5); g.beginPath(); g.ellipse(x + 3, y + 3, 30, 4, 0, 0, TAU); g.fill(); g.fillStyle = rgba('#f4f9ff', 0.9); g.beginPath(); g.ellipse(x, y, 28, 4.5, 0, Math.PI, 0); g.fill(); }
    }
    // gentle snow undulations: long soft bands, lighter tops and blue hollows (world-aligned)
    for (let r = 0; r < 7; r++) {
      const y = 380 + r * 22 + r * r * 0.8;
      for (let i = Math.floor((xa - 260) / 220); i * 220 < xb + 260; i++) {
        const h = hash2(i, r * 13 + 5); if (h < 0.35) continue;
        const x = i * 220 + hash2(i, r * 7) * 120, w = 70 + h * 120;
        g.fillStyle = rgba(h > 0.7 ? '#ffffff' : '#a9c4e2', h > 0.7 ? 0.35 : 0.22);
        g.beginPath(); g.ellipse(x, y, w, 3 + r * 0.7, 0, 0, TAU); g.fill();
      }
    }
    // clear-ice patches (skipped where the frozen pool lies)
    for (let i = Math.floor((xa - 200) / 310); i * 310 < xb + 200; i++) {
      const x = i * 310 + hash1(i * 37 + 1) * 180, y = 400 + hash1(i * 11 + 2) * 90, w = 50 + hash1(i * 17) * 60;
      if (x > FW0 + 120 || hash1(i * 23) < 0.35) continue;
      iceSheen(g, x, y, w, w * 0.16, i);
    }
    // the frozen pool in front of the falls
    if (xb > FW0) {
      const cx = FALLS_X + 40, cy = 430, rx = 620, ry = 64;
      g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.clip();
      vgrad(g, cx - rx, cy - ry, rx * 2, cy + ry, [[0, '#a9cdee'], [0.5, '#c6e1f6'], [1, '#d6e9f8']]);
      // the falls reflected: bright vertical streaks under it
      for (let k = -7; k <= 7; k++) {
        const x = FALLS_X + k * 27 + (hash1(k + 20) - 0.5) * 16, w = 5 + hash1(k + 40) * 12, l = ry * (0.6 + hash1(k + 60) * 0.9);
        g.fillStyle = rgba('#ffffff', (0.26 - Math.abs(k) * 0.025) * (0.6 + hash1(k + 80) * 0.6)); roundRect(g, x - w / 2, cy - ry + hash1(k + 9) * 10, w, l, w / 2); g.fill();
      }
      g.strokeStyle = rgba('#7fa8d6', 0.6); g.lineWidth = 1.2;
      for (let k = 0; k < 7; k++) { const a = 0.5 + k * 0.33; polyline(g, [cx + 120 * Math.cos(a) - 300, cy + 10, cx + 220 * Math.cos(a) - 300 + 30, cy + 10 + 30 * Math.sin(a), cx + 300 * Math.cos(a) - 250, cy + 18 + 40 * Math.sin(a)]); g.stroke(); }
      g.restore();
      g.strokeStyle = rgba('#ffffff', 0.85); g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.strokeStyle = rgba('#7aa2d0', 0.6); g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy + 1, rx, ry, 0, 0.1, Math.PI * 0.9); g.stroke();
    }
    // little ice crystals and bird tracks
    for (let i = Math.floor(xa / 37) - 1; i * 37 < xb + 37; i++) {
      const h = hash1(i * 5 + 3); if (h > 0.3) continue;
      const x = i * 37 + hash1(i) * 30, y = 372 + hash1(i * 9) * 150;
      g.fillStyle = rgba('#ffffff', 0.85); poly(g, [x, y - 3, x + 1, y, x, y + 1.5, x - 1, y]); g.fill();
      g.fillStyle = rgba('#88a9d2', 0.6); g.fillRect(x - 1, y + 1.5, 3, 1);
    }
    for (let k = 0; k < 9; k++) {               // a little bird hopped across the Frost Hole
      const x = 120 + k * 34, y = 470 - k * 3 + (k % 2) * 8;
      if (x < xa - 10 || x > xb + 10) continue;
      g.strokeStyle = rgba('#8aa6cc', 0.75); g.lineWidth = 1.3;
      for (const d of [-0.5, 0, 0.5]) { polyline(g, [x, y, x + 5 * Math.cos(d), y - 5 * Math.sin(d) - 1]); g.stroke(); }
    }
    // the back edge: a soft drift along the wall base
    const drift = (x) => 360 + 4 * Math.sin(x * 0.031) + 3 * vnoise(x, 17, 5);
    ink(g, (g) => { g.beginPath(); g.moveTo(xa - 4, 374); for (let x = al(xa, 5) - 5; x <= xb + 5; x += 5) g.lineTo(x, drift(x) - 6 - 4 * Math.max(0, Math.sin(x * 0.07))); g.lineTo(xb + 4, 374); g.quadraticCurveTo((xa + xb) / 2, 380, xa - 4, 374); g.closePath(); }, SNOW.snow, 1.3, (g) => {
      vgrad(g, xa, 348, xb - xa, 378, [[0, 'rgba(255,255,255,0.6)'], [0.6, 'rgba(255,255,255,0)'], [1, 'rgba(120,150,200,0.35)']]);
    });
    // the front edge: an icy lip with small icicles
    const lip = (x) => 526 + 3 * Math.sin(x * 0.02) + 2 * vnoise(x, 13, 8);
    ink(g, (g) => { g.beginPath(); g.moveTo(xa - 4, H + 4); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, lip(x)); g.lineTo(xb + 4, H + 4); g.closePath(); }, '#8fb3de', 1.6, (g) => {
      g.fillStyle = '#6f95c8'; g.fillRect(xa, 532, xb - xa, 12);
      g.strokeStyle = rgba('#ffffff', 0.8); g.lineWidth = 2; g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, lip(x) + 1.5); g.stroke();
    });
  }
  function iceSheen(g, x, y, rx, ry, seed) {
    g.fillStyle = rgba('#a8cbee', 0.55); g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
    g.strokeStyle = rgba('#ffffff', 0.8); g.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) { const ox = (hash1(seed * 7 + k) - 0.5) * rx; polyline(g, [x + ox - rx * 0.25, y + ry * 0.35, x + ox + rx * 0.05, y - ry * 0.4]); g.stroke(); }
    g.strokeStyle = rgba('#7fa3cf', 0.5); g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0.2, Math.PI - 0.2); g.stroke();
  }

  // ------------------------------------------------------------------ per frame
  function lightShaft(ctx, camX, t) {
    const a = HOLE[0] + 40 - camX, b = HOLE[1] - 40 - camX;
    if (b + 260 < 0 || a > W) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const k = 0.85 + 0.15 * Math.sin(t * 0.7);
    const gr = ctx.createLinearGradient(0, 30, 0, 500);
    gr.addColorStop(0, `rgba(235,248,255,${0.2 * k})`); gr.addColorStop(0.6, `rgba(210,236,255,${0.09 * k})`); gr.addColorStop(1, 'rgba(200,230,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(a, 20); ctx.lineTo(b, 20); ctx.lineTo(b + 230, 500); ctx.lineTo(a + 90, 500); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(a + 60, 20); ctx.lineTo(a + 120, 20); ctx.lineTo(a + 240, 500); ctx.lineTo(a + 170, 500); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function fallsLive(ctx, C, camX, t) {
    const x = FALLS_X - camX;
    if (x < -300 || x > W + 300) return;
    glowAt(ctx, C.glowCyan, x, 170, 220, 0.16 + 0.05 * Math.sin(t * 0.9), 160);
    // glints running down the ribbons
    for (let k = 0; k < 7; k++) {
      const u = (t * (0.12 + hash1(k) * 0.08) + hash1(k * 3)) % 1, y = 40 + u * 300;
      const gx = x + (hash1(k * 5) - 0.5) * lerp(200, 380, u);
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.9; ctx.drawImage(C.spark.c, gx - 8, y - 8, 16, 16);
    }
    ctx.globalAlpha = 1;
  }
  function particles(ctx, C, camX, t, layer) {
    const par = layer ? 1.3 : 0.75;
    for (const f of LAY.motes) {
      if (f.layer !== layer) continue;
      const sx0 = ((f.x - camX * par) % 1000 + 1000) % 1000 - 20, wx = camX + sx0;
      const nearHole = wx > HOLE[0] - 100 && wx < HOLE[1] + 500;
      if (f.k < (nearHole ? 0.75 : 0.32)) {     // snowflakes drifting down (thick under the hole)
        const x = sx0 + Math.sin(t * f.fr + f.ph) * f.sw + t * 6;
        const y = ((f.y + t * 26 * f.sp) % 580 + 580) % 580 - 20;
        const xx = ((x % 1000) + 1000) % 1000 - 20;
        const spr = C.flakes[layer ? 2 : f.k < 0.3 ? 0 : 1], r = spr.w / 2;
        ctx.globalAlpha = layer ? 0.75 : 0.6; ctx.drawImage(spr.c, xx - r, y - r, r * 2, r * 2);
      } else if (f.k > 0.86) {                  // frost glitter twinkling in place
        const tw = Math.sin(t * 2.2 * f.fr + f.ph * 3);
        if (tw < 0.55) continue;
        const r = (layer ? 9 : 6) * (tw - 0.5) * 2;
        ctx.globalAlpha = 0.9; ctx.drawImage(C.spark.c, sx0 - r, (f.y % 520) + 10 - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    ctx.fillStyle = '#24395f'; ctx.fillRect(0, 0, W, H);
    drawStrip(ctx, C.far, camX, s);
    for (const tw of LAY.twinkles) {             // the depths breathe: slow cold glows
      const x = ((tw.x - camX * P_FAR) % 1300 + 1300) % 1300 - 170;
      glowAt(ctx, C.glowCyan, x, tw.y, tw.r, 0.12 + 0.1 * Math.sin(t * tw.sp + tw.ph));
    }
    drawStrip(ctx, C.mid, camX, s);
    if (camX < NEAR_END) {
      drawStrip(ctx, C.wall, camX, s);
      drawSprites(ctx, C.back, camX, s);
      drawStrip(ctx, C.ceil, camX, s);
      drawSprites(ctx, C.ici, camX, s);
    }
    if (camX + W > FW0 - 60) { drawStrip(ctx, C.falls, camX, s); fallsLive(ctx, C, camX, t); }
    drawStrip(ctx, C.ground, camX, s);
    ctx.globalCompositeOperation = 'screen'; drawStrip(ctx, C.light, camX, s); ctx.globalCompositeOperation = 'source-over';
    lightShaft(ctx, camX, t);
    particles(ctx, C, camX, t, 0);
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    for (const wx of FRONT_ICI) {
      const sx = frontX(wx, camX, P_FRONT);
      if (sx < -80 || sx > W + 80) continue;
      const spr = C.frontIci;
      ctx.drawImage(spr.c, Math.round((sx - spr.ox) * s) / s, -spr.oy - 6, spr.w, spr.h);
    }
    particles(ctx, C, camX, t, 1);
    ctx.restore();
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(40,70,120,0.28)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  return { setScale: st.setScale, setWarm, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 62, h: 58, colors: ['#9a6a3e', '#6a4526', '#eef6fd', '#a9d0f2'] },
  barrel: { w: 48, h: 60, colors: ['#7e5534', '#523620', '#eef6fd', '#5b5a62'] },
  urn:    { w: 52, h: 58, colors: ['#a9d0f2', '#6f9bd0', '#f6fcff', '#4f6596'] },
};
const FROST = { snow: '#f2f8fe', sh: '#b8cfe8' };
function frostCap(g, pts) { ink(g, (g) => blob(g, pts), FROST.snow, 1.4, (g) => { g.fillStyle = FROST.sh; g.fillRect(-60, pts[1] + 2, 120, 10); }); }
const PROP_DRAW = {
  crate(g) {   // a supply crate from the bridge above, frosted
    const wood = '#9a6a3e', woodSh = '#6a4526', woodHi = '#c4935e', woodDk = '#4a2e1a', iron = '#4f5466';
    const L = -30, Rr = 24, T = -40, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), woodSh, 2.6, (g) => { g.strokeStyle = woodDk; g.lineWidth = 1.2; polyline(g, [Rr, -20, Rr + dx, -20 + dy]); g.stroke(); });
    ink(g, (g) => poly(g, [L, T, Rr, T, Rr + dx, T + dy, L + dx, T + dy]), woodHi, 2.4);
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4; for (const y of [-14, -27]) { polyline(g, [L, y, Rr, y]); g.stroke(); }
      g.fillStyle = woodSh; g.fillRect(L, T, 6, 40); g.fillRect(Rr - 6, T, 6, 40);
      g.lineWidth = 6; g.strokeStyle = woodDk; polyline(g, [L + 7, -6, Rr - 7, T + 6]); g.stroke();
      g.lineWidth = 4; g.strokeStyle = woodHi; polyline(g, [L + 7, -6, Rr - 7, T + 6]); g.stroke();
      g.fillStyle = iron; for (const [x, y] of [[L, T], [Rr - 9, T], [L, -9], [Rr - 9, -9]]) g.fillRect(x, y, 9, 9);
      g.fillStyle = 'rgba(220,240,255,0.55)'; g.fillRect(L, -8, Rr - L, 8);            // frost along the foot
    });
    frostCap(g, [L - 2, T, L + 10, T - 7, Rr - 6, T - 11, Rr + dx + 2, T + dy - 4, Rr + 2, T + 2, L + 14, T + 3]);
    for (const [x, l] of [[L + 6, 7], [L + 20, 11], [Rr - 4, 8]]) { ink(g, (g) => poly(g, [x - 2.5, T + 1, x + 2.5, T + 1, x, T + 1 + l]), '#cfe8fb', 1.2); }
  },
  barrel(g) {  // a barrel with an ice-coated lid
    const wood = '#7e5534', woodSh = '#523620', woodHi = '#a87650', iron = '#4f5466', ironHi = '#8e94a8';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -52); g.quadraticCurveTo(-27, -26, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -26, 18, -52); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -60, 30, 66); g.fillStyle = woodHi; g.fillRect(-19, -54, 5, 58);
      g.strokeStyle = woodSh; g.lineWidth = 1.2; for (const k of [-0.5, -0.1, 0.3]) { g.beginPath(); g.moveTo(k * 18, -52); g.quadraticCurveTo(k * 27, -26, k * 18, 4); g.stroke(); }
      for (const y of [-44, -8]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.4); }
      g.fillStyle = 'rgba(210,235,255,0.45)'; g.fillRect(-30, -60, 60, 14);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 18, 5.5, 0, 0, TAU); }, '#d6ecfc', 2.4, (g) => { g.fillStyle = '#ffffff'; g.fillRect(-12, -55, 10, 2); });
    for (const [x, l] of [[-14, 9], [-4, 13], [9, 8], [16, 6]]) ink(g, (g) => poly(g, [x - 2.5, -48 + Math.abs(x) * 0.1, x + 2.5, -48 + Math.abs(x) * 0.1, x, -48 + l]), '#cfe8fb', 1.1);
  },
  urn(g) {     // a cluster of frost crystals on a snowy rock
    ink(g, (g) => blob(g, [-26, 2, -22, -12, -6, -18, 12, -16, 26, -6, 22, 4]), '#56699a', 2.6, (g) => { g.fillStyle = '#3a4a72'; g.fillRect(4, -20, 30, 26); });
    const list = [[-0.55, 30, 12, -12], [0.5, 32, 12, 12], [-0.2, 44, 15, -4], [0.15, 50, 16, 4], [0.8, 22, 10, 18]];
    for (const [a, L, w, x] of list.sort((p, q) => q[1] - p[1])) {
      g.save(); g.translate(x, -10); g.rotate(a);
      const hw = w / 2;
      ink(g, (g) => poly(g, [-hw, 4, -hw, -L * 0.72, 0, -L, hw, -L * 0.72, hw, 4]), '#a9d0f2', 2.4, (g) => {
        g.fillStyle = '#6f9bd0'; g.fillRect(hw * 0.15, -L, hw, L + 6);
        g.fillStyle = '#eaf7ff'; poly(g, [-hw, 4, -hw, -L * 0.72, 0, -L, -hw * 0.3, -L * 0.68, -hw * 0.4, 4]); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(-hw * 0.75, -L * 0.62, 1.6, L * 0.45);
      });
      g.restore();
    }
    ink(g, (g) => blob(g, [-28, 2, -24, -8, -10, -10, 4, -6, 18, -9, 28, 0, 10, 6]), FROST.snow, 1.6);
  },
};
