// Dodongo's Quest - the secret final stage "THE QUEEN'S HOLLOW" (src/stages/hollow.js): background, floor, props.
//
// The Dragon Clan's ancient sleeping chamber deep under the Dragon Gate (docs/SECRETS.md): warm gold stone, carved
// dragon reliefs, the Clan's old banners, and at the end a huge round chamber where the Dragon Queen sleeps on a round
// stone bed (she is a sprite drawn by the runtime, at HOOKS.queen).  The Master's curse shows as green crystal growths:
// thick at the way in, thinning down the hall, ringed round the Queen -- and they shrink and wink out as the curse lifts.
//
// Sections (world x):  stair 0-1100 (the Dragon Stair: a great carved wall, a long relief of the Clan dragon, an arch
// onto the stair down)  |  banners 1100-2100 (the Banner Hall: carved pillars hung with the Clan's old banners)  |
// chamber 2100-3200 (the Queen's Chamber: the round apse, the Heartstone's empty socket, the Queen's bed; the boss
// arena is the last screen, its floor a clear round mosaic, its right part kept clear for the return portal).
//
// Back-to-front (drawBack): the depths (p 0.15) -> the stair down / the colonnade (p 0.45) -> the hall wall (1.0) ->
// the chamber (1.0) -> pillars (1.0) + live banners, flames, the light from the oculus -> the curse crystals (live,
// fading) -> the floor (1.0) -> the warm light band -> back motes / curse sparks / gold sparkles.
// drawFront: near motes and sparkles (no occluders).
// The curse: setCurse(c) (0..1, 1 = full; the runtime drives it, eased to 0 over the Curse Wraith's defeat); until it
// is called, curse = 1 - warm (setWarm(w), as every stage: the game sets it, cutscenes pass bg.warm).  As the curse
// lifts the crystals shrink and wink out one by one, the green glow goes and the chamber's gold light comes up.
// Every static element is cached per scale (chunked strips + sprites, src/canvasmem.js); animated bits are live.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 3200;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'stair', name: 'The Dragon Stair', x0: 0, x1: 1100 },
  { id: 'banners', name: 'The Banner Hall', x0: 1100, x1: 2100 },
  { id: 'chamber', name: "The Queen's Chamber", x0: 2100, x1: 3200 },
];
export const ARENAS = [450, 1350, CAM_MAX];
export const WAYSTONES = [1250];
const QX = 2720, BED_Y = 318, BED_RX = 262, BED_RY = 36;      // the Queen's bed: centre x, top surface y, radii
const CH0 = 2100, ARCH_L = 500, ARCH_R = 800, NICHE = [QX, 172, 104];
const PILLARS = [1140, 1440, 1740, 2040];
// the Dragon Stair in the mid layer: the layer-x span seen through the stair arch
const STAIR = [ARCH_L - (ARCH_L) * (1 - 0.45) + 20, ARCH_R - 20];
const TORCHES = [92, 430, 870, 1050];
const BRAZIERS = [2390, 3050];
// HOOKS.queen: x = world x of her middle; y = the screen y of the bed's top, where she lies (behind the floor's back
// edge at 362: depth -44); w = the bed's width (keep her within it)
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES, queen: { x: QX, y: BED_Y + 4, depth: BED_Y + 4 - 362, w: BED_RX * 2 }, niche: { x: NICHE[0], y: NICHE[1], r: NICHE[2] }, portalX: CAM_MAX + 780 };

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
const P_FAR = 0.15, P_MID = 0.45;
const GT0 = 340;
const GOLD = { base: '#c99a5a', sh: '#9c6f3e', hi: '#e9c48a', deep: '#5a3a1e', line: '#4a2e1a', trim: '#f4d47a', trimSh: '#b8862e' };
const STONE = { stone: '#d9c194', stoneSh: '#b99c6c', stoneHi: '#efdcb4', joint: '#8a6a42' };
const CLAN = { red: '#a8423a', redSh: '#7a2c26', redHi: '#c8645a', gold: '#e2b24c', goldSh: '#a87a2c' };
const CURSE = { base: '#8ee04c', sh: '#4c9a24', hi: '#eeffcc', glow: '150,240,90' };   // (the Wraith's lime: apart from the jade kobolds' teal-green)
const LS = { far: ['#3a2414', 0.5], mid: ['#3a2416', 0.55], near: ['#34200f', 0.72], front: ['#2a180c', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
// the curse crystals: [world x, base screen y, size, variant, fade order (who winks out first as the curse lifts)]
const CRYSTALS = (() => {
  const R = mulberry(3203), out = [];
  const add = (x, y, s, v) => out.push([x, y >= 356 ? 344 : y, s, v, R()]);   // (critics: not on the lane's back edge)
  for (const [x, y, s] of [[30, 366, 1.1], [150, 362, 0.8], [250, 366, 1.25], [380, 364, 0.7], [470, 300, 0.75], [600, 366, 0.9], [760, 364, 1.05], [905, 366, 0.85], [1000, 250, 0.7], [1080, 366, 0.75],
    [1300, 366, 0.7], [1590, 364, 0.6], [1890, 366, 0.75], [2160, 366, 0.9], [2230, 280, 0.65]]) add(x, y, s, out.length % 4);
  // the ring round the Queen's bed, and the Heartstone's socket
  for (const [x, y, s] of [[QX - 300, 360, 0.95], [QX - 220, 366, 0.7], [QX + 230, 366, 0.75], [QX + 310, 360, 1.0], [QX - 72, 214, 0.6], [QX + 80, 130, 0.55], [QX + 40, 236, 0.45]]) add(x, y, s, out.length % 4);
  return out;
})();
const curseAt = (c, order) => clamp(c * 1.5 - order * 0.5, 0, 1);

const LAY = (() => {
  const R = mulberry(3300);
  const motes = [];
  for (let i = 0; i < 110; i++) motes.push({ x: R.r(0, 1000), y: R.r(0, 560), sp: R.r(0.4, 1.2), sw: R.r(4, 14), ph: R.r(0, TAU), fr: R.r(0.3, 1.1), k: R(), layer: i < 80 ? 0 : 1 });
  return { motes };
})();

// ---------------------------------------------------------------------------------------------------------------
// SHARED DRAWING BITS
// ---------------------------------------------------------------------------------------------------------------
// ashlar: world-aligned courses of carved blocks, lit from the upper left (chunk-safe)
function ashlar(g, xa, xb, ya, yb, P, seed, ch = 38, cw = 84) {
  g.fillStyle = P.base; g.fillRect(xa - 2, ya - 2, xb - xa + 4, yb - ya + 4);
  for (let r = Math.floor(ya / ch); r * ch < yb; r++) {
    const y0 = r * ch, off = (r % 2) * cw * 0.5 + hash1(r * 17 + seed) * 10;
    for (let i = Math.floor((xa - off) / cw) - 1; i * cw + off < xb + cw; i++) {
      const x0 = i * cw + off, x1 = x0 + cw, h = hash2(i, r * 7 + seed);
      g.fillStyle = mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * 0.5); g.fillRect(x0 + 1.5, y0 + 1.5, cw - 3, ch - 3);
      g.fillStyle = rgba(P.hi, 0.55); g.fillRect(x0 + 1.5, y0 + 1.5, cw - 3, 2.2); g.fillRect(x0 + 1.5, y0 + 1.5, 2.2, ch - 3);
      g.fillStyle = rgba(P.sh, 0.6); g.fillRect(x0 + 1.5, y0 + ch - 3.5, cw - 3, 2.2); g.fillRect(x1 - 3.7, y0 + 1.5, 2.2, ch - 3);
      if (h > 0.86) { g.strokeStyle = rgba(P.line, 0.35); g.lineWidth = 1; polyline(g, [x0 + cw * 0.3, y0 + 3, x0 + cw * 0.36, y0 + ch * 0.5, x0 + cw * 0.3, y0 + ch - 4]); g.stroke(); }
    }
    g.fillStyle = rgba(P.line, 0.45); g.fillRect(xa - 2, y0, xb - xa + 4, 1.4);
  }
}
// a carved relief: the shape in shadow (lower right), a lit edge (upper left), the face on top
function relief(g, build, face, P = GOLD, d = 3) {
  g.save(); g.translate(d, d); build(g); g.fillStyle = P.deep; g.fill(); g.restore();
  g.save(); g.translate(-d * 0.6, -d * 0.6); build(g); g.fillStyle = P.trim; g.globalAlpha = 0.65; g.fill(); g.restore();
  build(g); g.fillStyle = face; g.fill();
}
// the Clan dragon as a long relief (side view, flying right): from x0 to x1 around the line y, amplitude amp
function dragonRelief(g, x0, x1, y, amp, P = GOLD, flip = false) {
  g.save();
  if (flip) { g.translate(x0 + x1, 0); g.scale(-1, 1); }
  const n = 40, spine = [];
  for (let k = 0; k <= n; k++) { const f = k / n; spine.push([lerp(x0, x1 - 60, f), y + Math.sin(f * Math.PI * 2.2 + 0.4) * amp * (0.4 + f * 0.6)]); }
  const wd = (f) => lerp(4, 23, Math.min(1, f * 2.2)) * (f > 0.9 ? 1 - (f - 0.9) * 3 : 1);
  const L = [], Rr = [];
  for (let k = 0; k <= n; k++) {
    const [px, py] = spine[k], [qx, qy] = spine[Math.min(n, k + 1)], [ox, oy] = spine[Math.max(0, k - 1)];
    const dx = qx - ox, dy = qy - oy, l = Math.hypot(dx, dy) || 1, w = wd(k / n);
    L.push([px + (dy / l) * w, py - (dx / l) * w]); Rr.push([px - (dy / l) * w, py + (dx / l) * w]);
  }
  const body = flat(L.concat(Rr.reverse()));
  const [hx, hy] = spine[n];
  // a wing raised off the back, two legs, the head with a horn, back spines
  const wing = (g) => { const [wx, wy] = spine[Math.round(n * 0.62)]; g.beginPath(); g.moveTo(wx - 30, wy - 8); g.quadraticCurveTo(wx - 40, wy - 70, wx + 10, wy - 92); g.lineTo(wx + 4, wy - 62); g.lineTo(wx + 26, wy - 72); g.lineTo(wx + 16, wy - 44); g.lineTo(wx + 34, wy - 46); g.quadraticCurveTo(wx + 14, wy - 20, wx + 10, wy - 8); g.closePath(); };
  relief(g, wing, mix(P.base, P.hi, 0.25), P);
  relief(g, (g) => poly(g, body), mix(P.base, P.hi, 0.4), P);
  for (const f of [0.5, 0.8]) { const [lx, ly] = spine[Math.round(n * f)]; relief(g, (g) => poly(g, [lx - 6, ly + 8, lx + 4, ly + 10, lx + 10, ly + 26, lx + 18, ly + 28, lx + 4, ly + 30, lx - 4, ly + 14]), mix(P.base, P.hi, 0.3), P, 1.6); }
  const head = (g) => { g.beginPath(); g.moveTo(hx - 14, hy - 12); g.lineTo(hx + 10, hy - 18); g.lineTo(hx + 30, hy - 14); g.lineTo(hx + 52, hy - 6); g.lineTo(hx + 54, hy + 2); g.lineTo(hx + 30, hy + 6); g.lineTo(hx + 40, hy + 12); g.lineTo(hx + 14, hy + 14); g.lineTo(hx - 12, hy + 12); g.closePath(); };
  relief(g, head, mix(P.base, P.hi, 0.45), P);
  relief(g, (g) => poly(g, [hx + 4, hy - 16, hx - 18, hy - 38, hx + 14, hy - 18]), mix(P.base, P.hi, 0.2), P, 1.4);
  g.fillStyle = P.deep; g.beginPath(); g.ellipse(hx + 22, hy - 6, 3.4, 2.2, 0, 0, TAU); g.fill();
  g.strokeStyle = rgba(P.deep, 0.7); g.lineWidth = 1.4;
  g.strokeStyle = rgba(P.deep, 0.45);
  for (let k = 5; k < n - 1; k += 4) { const [a, b] = L[k], [c, d] = Rr[k]; polyline(g, [lerp(a, c, 0.25), lerp(b, d, 0.25), lerp(a, c, 0.7), lerp(b, d, 0.7)]); g.stroke(); }
  for (let k = 4; k < n - 3; k += 3) { const [a, b] = L[k]; relief(g, (g) => poly(g, [a - 3, b + 1, a + 1, b - 6, a + 4, b + 1]), mix(P.base, P.hi, 0.2), P, 0.8); }
  g.restore();
}
// the Clan's coiled-dragon medallion
function clanEmblem(g, cx, cy, s, col) {
  g.save(); g.translate(cx, cy); g.scale(s / 40, s / 40);
  g.strokeStyle = col; g.lineWidth = 2.4; g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.stroke();
  g.fillStyle = col;
  g.beginPath(); g.moveTo(8, -12); g.quadraticCurveTo(14, -6, 6, -2); g.quadraticCurveTo(-8, 3, -4, 10); g.quadraticCurveTo(0, 14, 8, 11);
  g.lineTo(6, 14); g.quadraticCurveTo(-6, 17, -9, 9); g.quadraticCurveTo(-11, 0, 2, -5); g.quadraticCurveTo(7, -7, 4, -10); g.closePath(); g.fill();
  poly(g, [4, -10, 3, -16, 7, -13, 10, -17, 11, -12, 15, -11, 9, -8]); g.fill();
  poly(g, [-2, -2, -12, -12, -6, -3]); g.fill();
  g.restore();
}
function bannerPath(g, x, y, w, h, seed, rag = 3) {
  const R = mulberry(seed);
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w + 1, y + h * 0.85);
  const n = rag + 2;
  for (let i = 1; i <= n; i++) { const xx = x + w - (w * i) / n; g.lineTo(xx + w / n / 2, y + h * (i % 2 ? 1 : 0.86) + R.r(-4, 4)); }
  g.lineTo(x - 1, y + h * 0.85); g.closePath();
}
// an old Clan banner: faded red, gold border and coiled dragon, a frayed hem
function clanBanner(g, x, y, w, h, seed) {
  ink(g, (g) => bannerPath(g, x, y, w, h, seed), CLAN.red, 2, (g) => {
    g.fillStyle = CLAN.redHi; g.fillRect(x, y, w * 0.2, h); g.fillStyle = CLAN.redSh; g.fillRect(x + w * 0.76, y, w * 0.3, h);
    g.strokeStyle = CLAN.gold; g.lineWidth = 2.4; g.strokeRect(x + 6, y + 6, w - 12, h * 0.78 - 8);
    clanEmblem(g, x + w / 2, y + h * 0.36, Math.min(w * 0.8, h * 0.4), CLAN.gold);
    g.fillStyle = rgba('#f4e2c0', 0.18); for (let k = 0; k < 6; k++) g.fillRect(x + hash1(seed + k) * w, y + hash1(seed * 3 + k) * h, 3, 8);   // worn spots
  });
  ink(g, (g) => { g.beginPath(); g.rect(x - 6, y - 5, w + 12, 6); }, CLAN.goldSh, 1.4);
}
// a curse crystal cluster (green, glowing) with veins of green creeping from its root -- origin = its root
function curseCluster(g, s, seed) {
  const R = mulberry(seed);
  g.strokeStyle = rgba(CURSE.base, 0.55); g.lineWidth = 2;
  for (let k = 0; k < 4; k++) { const a = Math.PI + R.r(-0.2, 1.2) * (k % 2 ? 1 : -1) * 0.8; let x = 0, y = -4; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += Math.cos(a + R.r(-0.5, 0.5)) * 9 * s; y += Math.sin(a + R.r(-0.5, 0.5)) * 6 * s - 2; g.lineTo(x, y); } g.stroke(); }
  lightPool(g, 0, -18 * s, 50 * s, 34 * s, CURSE.glow, 0.32);
  const n = 5, list = [];
  for (let k = 0; k < n; k++) list.push({ a: lerp(-0.75, 0.75, k / (n - 1)) + R.r(-0.15, 0.15), L: R.r(22, 44) * s * (k === 2 ? 1.35 : 1), w: R.r(9, 14) * s, x: R.r(-12, 12) * s });
  list.sort((p, q) => q.L - p.L);
  for (const c of list) {
    g.save(); g.translate(c.x, -2); g.rotate(c.a);
    const w = c.w / 2, L = c.L;
    ink(g, (g) => poly(g, [-w, 4, -w, -L * 0.72, 0, -L, w, -L * 0.72, w, 4]), CURSE.base, 1.8, (g) => {
      g.fillStyle = CURSE.sh; g.fillRect(w * 0.15, -L, w, L + 6);
      g.fillStyle = CURSE.hi; poly(g, [-w, 4, -w, -L * 0.72, 0, -L, -w * 0.3, -L * 0.68, -w * 0.4, 4]); g.fill();
      g.fillStyle = rgba('#ffffff', 0.75); g.fillRect(-w * 0.75, -L * 0.62, 1.4, L * 0.45);
    }, '#14382e');
    g.restore();
  }
}
// a flame, drawn live (warm), with its glow
function flame(ctx, glow, x, y, size, t, seed, a = 1) {
  const k = size / 30;
  glowAt(ctx, glow, x, y - size * 0.5, 70 * k, (0.55 + 0.12 * Math.sin(t * 9 + seed) + 0.06 * Math.sin(t * 23 + seed)) * a);
  const layers = [['#e2701c', 1, 1], ['#ffb43a', 0.72, 0.82], ['#fff2c0', 0.4, 0.55]];
  for (const [col, ws, hs] of layers) {
    ctx.fillStyle = col;
    for (let j = 0; j < 3; j++) {
      const ph = seed * 1.7 + j * 2.1, fl = 0.78 + 0.16 * Math.sin(t * 11 + ph) + 0.09 * Math.sin(t * 27 + ph * 2);
      const h = size * hs * fl * (j === 0 ? 1.15 : 0.7), w = size * 0.32 * ws * (j === 0 ? 1 : 0.7), ox = (j - 1) * size * 0.22 * ws, sway = Math.sin(t * 6 + ph) * size * 0.12;
      ctx.beginPath(); ctx.moveTo(x + ox - w, y); ctx.quadraticCurveTo(x + ox - w * 1.05, y - h * 0.55, x + ox + sway, y - h); ctx.quadraticCurveTo(x + ox + w * 0.9, y - h * 0.5, x + ox + w, y); ctx.quadraticCurveTo(x + ox, y + w * 0.5, x + ox - w, y); ctx.fill();
    }
  }
}
function drawHang(ctx, spr, x, y, t, seed, amp = 3, strips = 8) {
  const sh = spr.c.height / strips, dh = spr.h / strips;
  for (let i = 0; i < strips; i++) {
    const f = i / (strips - 1), off = Math.sin(t * 1.6 - i * 0.45 + seed) * amp * f * f;
    ctx.drawImage(spr.c, 0, i * sh, spr.c.width, sh + 0.5, x + off, y + i * dh, spr.w, dh + 0.35);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0, curseSet = null;
  const curse = () => (curseSet === null ? 1 - warm : curseSet);
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    const fr = layerRange(0, CH0 + 140, P_FAR), mr = layerRange(0, CH0 + 140, P_MID);
    c.far = buildStrip(fr[0], fr[1], 0, 372, csFar, P_FAR, (g, xa, xb) => { setLS('far'); drawFar(g, xa, xb); });
    c.mid = buildStrip(mr[0], mr[1], 0, 372, csFar, P_MID, (g, xa, xb) => { setLS('mid'); drawMid(g, xa, xb); });
    c.wall = buildStrip(-10, CH0 + 140, 0, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawWall(g, xa, xb); });
    c.chamber = buildStrip(CH0 - 20, LEVEL_LEN + 10, 0, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawChamber(g, xa, xb); });
    c.ground = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawGround(g, xa, xb); });
    // the warm light: torch- and brazier-light on the wall base and the floor's back half at fighter height
    c.light = lightBand(-10, LEVEL_LEN + 10, 240, 452, '255,200,130', [[0, 0], [0.35, 0.07], [0.58, 0.12], [0.8, 0.06], [1, 0]], [0, 0], Math.min(cs, 0.5), (g) => {
      for (const x of TORCHES) lightPool(g, x, 330, 170, 70, '255,190,110', 0.16);
      for (const x of BRAZIERS) lightPool(g, x, 350, 230, 80, '255,190,110', 0.2);
    });
    setLS('near');
    c.pillar = makeSprite(150, 400, 75, 380, cs, (g) => { setLS('near'); drawPillar(g); });
    c.banner = [0, 1].map((k) => makeSprite(84, 236, 0, 0, cs, (g) => { setLS('near'); clanBanner(g, 8, 8, 66, 220 - k * 24, 70 + k * 11); }));
    c.sconce = makeSprite(60, 70, 30, 20, cs, (g) => { setLS('near'); drawSconce(g); });
    c.brazier = makeSprite(110, 150, 55, 140, cs, (g) => { setLS('near'); drawBrazier(g); });
    c.curse = [0, 1, 2, 3].map((v) => makeSprite(120, 110, 60, 96, cs, (g) => { setLS('near'); curseCluster(g, 1, 401 + v * 17); }));
    c.back = PILLARS.map((x) => ({ spr: c.pillar, x, y: 366 }));
    for (const x of BRAZIERS) c.back.push({ spr: c.brazier, x, y: 364 });
    c.glowW = radialSprite(64, 1, [[0, 'rgba(255,210,140,0.65)'], [0.4, 'rgba(255,170,90,0.25)'], [1, 'rgba(255,150,70,0)']]);
    c.glowG = radialSprite(64, 1, [[0, 'rgba(130,255,210,0.6)'], [0.4, 'rgba(80,235,180,0.22)'], [1, 'rgba(60,210,160,0)']]);
    c.glowGold = radialSprite(64, 1, [[0, 'rgba(255,236,170,0.7)'], [0.4, 'rgba(255,210,120,0.28)'], [1, 'rgba(255,190,90,0)']]);
    c.mote = radialSprite(5, Math.max(1, cs), [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,240,200,0.8)'], [1, 'rgba(255,220,150,0)']]);
    c.moteG = radialSprite(5, Math.max(1, cs), [[0, 'rgba(240,255,250,1)'], [0.35, 'rgba(120,250,200,0.8)'], [1, 'rgba(70,220,170,0)']]);
    return c;
  }

  // ------------------------------------------------------------------ deep layers
  function drawFar(g, xa, xb) {
    vgrad(g, xa - 2, 0, xb - xa + 4, 372, [[0, '#1e120a'], [0.45, '#3a2414'], [1, '#5a3a1e']]);
    // far arcades lit from below
    for (let i = Math.floor((xa - 160) / 150); i * 150 < xb + 160; i++) {
      const x = i * 150 + 30, top = 150 + hash1(i * 7) * 30;
      lightPool(g, x + 50, 330, 90, 60, '255,170,90', 0.25);
      g.fillStyle = '#2a190e'; g.beginPath(); g.moveTo(x - 20, 380); g.lineTo(x - 20, top); g.lineTo(x + 20, top); g.lineTo(x + 20, 380); g.closePath(); g.fill();
      g.strokeStyle = rgba('#8a5a2e', 0.6); g.lineWidth = 3; g.beginPath(); g.arc(x + 75, top + 10, 55, Math.PI, 0); g.stroke();
    }
    vgrad(g, xa - 2, 0, xb - xa + 4, 140, [[0, 'rgba(14,8,4,0.7)'], [1, 'rgba(14,8,4,0)']]);
  }
  function drawMid(g, xa, xb) {
    // the Dragon Stair (seen through the stair arch; layer x STAIR[0]..STAIR[1]): the great flight the heroes came down,
    // rising to a lit doorway, braziers up both sides
    const [sl, sr] = STAIR, sc = (sl + sr) / 2;
    if (xb > sl - 40 && xa < sr + 40) {
      vgrad(g, sl - 40, 0, sr - sl + 80, 372, [[0, '#24160c'], [0.5, '#4a2e18'], [1, '#6e4626']]);
      lightPool(g, sc, 150, 120, 60, '255,200,120', 0.55);
      ink(g, (g) => { g.beginPath(); g.moveTo(sc - 44, 174); g.lineTo(sc - 44, 128); g.arc(sc, 128, 44, Math.PI, 0); g.lineTo(sc + 44, 174); g.closePath(); }, '#e8a860', 1.4, (g) => {
        const dg = g.createRadialGradient(sc, 160, 4, sc, 150, 60); dg.addColorStop(0, '#fff4d6'); dg.addColorStop(0.6, '#ffd08a'); dg.addColorStop(1, '#d08a48');
        g.fillStyle = dg; g.fillRect(sc - 50, 80, 100, 100);
      });
      for (let k = 0; k < 14; k++) {
        const f = k / 14, y = 372 - k * 14, hw = lerp(330, 96, f);
        g.fillStyle = mix('#c0925a', '#6a4426', f); g.fillRect(sc - hw, y - 14, hw * 2, 14);
        g.fillStyle = mix('#ecc68a', '#8a5e34', f); g.fillRect(sc - hw, y - 14, hw * 2, 3);
        g.fillStyle = rgba('#3a2210', 0.35); g.fillRect(sc - hw, y - 2, hw * 2, 2);
      }
      for (const sd of [-1, 1]) {      // the side walls and their braziers
        g.fillStyle = '#3a2414'; g.beginPath(); g.moveTo(sc + sd * 330, 380); g.lineTo(sc + sd * 96, 176); g.lineTo(sc + sd * 96, 60); g.lineTo(sc + sd * 400, 0); g.lineTo(sc + sd * 400, 380); g.closePath(); g.fill();
        for (const k of [1, 5, 9]) {
          const f = k / 14, x = sc + sd * (lerp(330, 96, f) - 14), y = 372 - k * 14 - 14, sz = lerp(1, 0.45, f);
          lightPool(g, x, y - 40 * sz, 46 * sz, 46 * sz, '255,180,90', 0.7);
          g.fillStyle = '#5a3a1e'; g.fillRect(x - 3 * sz, y - 34 * sz, 6 * sz, 34 * sz);
          g.fillStyle = '#ffcf7a'; g.beginPath(); g.ellipse(x, y - 42 * sz, 6 * sz, 10 * sz, 0, 0, TAU); g.fill();
        }
      }
    }
    // a colonnade in shadow behind the Banner Hall's open arches
    for (let i = Math.floor((xa - 100) / 110); i * 110 < xb + 100; i++) {
      const x = i * 110 + 20;
      if (x > STAIR[0] - 60 && x < STAIR[1] + 60) continue;
      ink(g, (g) => poly(g, [x - 16, 380, x - 16, 90, x + 16, 90, x + 16, 380]), '#6e4a2c', 1.5, (g) => { g.fillStyle = '#56381f'; g.fillRect(x + 4, 80, 14, 300); g.fillStyle = rgba('#c08a4a', 0.5); g.fillRect(x - 16, 80, 4, 300); });
      ink(g, (g) => poly(g, [x - 22, 96, x - 22, 84, x + 22, 84, x + 22, 96]), '#7a5432', 1.4);
      lightPool(g, x + 55, 330, 60, 50, '255,170,90', 0.3);
    }
  }

  // ------------------------------------------------------------------ near: the hall wall, pillars, the chamber
  // the open arches in the hall wall (world x ranges + arch top): the stair arch and the Banner Hall's windows
  const OPENINGS = [[ARCH_L, ARCH_R, 112], [1215, 1365, 150], [1515, 1665, 150], [1815, 1965, 150]];
  function archPath(g, a, b, top, bot = 380) { const r = (b - a) / 2; g.moveTo(a, bot); g.lineTo(a, top + r); g.arc(a + r, top + r, r, Math.PI, 0); g.lineTo(b, bot); g.closePath(); }
  function drawWall(g, xa, xb) {
    g.save();
    g.beginPath(); g.rect(xa - 4, -4, xb - xa + 8, 380);
    for (const [a, b, top] of OPENINGS) if (b > xa - 10 && a < xb + 10) archPath(g, a, b, top);
    g.clip('evenodd');
    ashlar(g, xa, xb, 0, 380, GOLD, 5);
    vgrad(g, xa, 0, xb - xa, 372, [[0, 'rgba(30,14,4,0.55)'], [0.3, 'rgba(30,14,4,0.1)'], [0.75, 'rgba(255,200,120,0.08)'], [1, 'rgba(40,20,6,0.28)']]);
    // the cornice and the dado: carved bands with a key pattern
    for (const [y, h] of [[84, 18], [300, 14]]) {
      g.fillStyle = GOLD.sh; g.fillRect(xa - 4, y, xb - xa + 8, h);
      g.fillStyle = GOLD.trim; g.fillRect(xa - 4, y, xb - xa + 8, 2.4);
      g.fillStyle = GOLD.deep; g.fillRect(xa - 4, y + h - 2.4, xb - xa + 8, 2.4);
      g.strokeStyle = rgba(GOLD.deep, 0.8); g.lineWidth = 1.6;
      for (let x = al(xa, 24) - 24; x < xb + 24; x += 24) { polyline(g, [x, y + h - 4, x, y + 5, x + 14, y + 5, x + 14, y + h - 8, x + 7, y + h - 8]); g.stroke(); }
    }
    // the long relief of the Clan dragon on the Dragon Stair, and one more past the arch
    if (xa < ARCH_L + 20) dragonRelief(g, 30, ARCH_L - 40, 196, 26);
    if (xb > ARCH_R && xa < 1110) { relief(g, (g) => { g.beginPath(); g.arc(960, 178, 50, 0, TAU); }, GOLD.hi, GOLD, 3); g.strokeStyle = GOLD.trimSh; g.lineWidth = 3; g.beginPath(); g.arc(960, 178, 42, 0, TAU); g.stroke(); clanEmblem(g, 960, 178, 70, GOLD.sh); }
    // medallions between the Banner Hall's windows
    for (const x of [1440, 1740, 2040]) if (x > xa - 60 && x < xb + 60) { relief(g, (g) => { g.beginPath(); g.arc(x, 132, 26, 0, TAU); }, GOLD.hi); clanEmblem(g, x, 132, 40, GOLD.sh); }
    g.restore();
    // the arches' frames: voussoirs with gold trim, a dragon-head keystone
    for (const [a, b, top] of OPENINGS) {
      if (b < xa - 40 || a > xb + 40) continue;
      const r = (b - a) / 2, cx = a + r, cy = top + r, big = b - a > 200;
      ink(g, (g) => { g.beginPath(); g.arc(cx, cy, r + (big ? 26 : 18), Math.PI, 0); g.arc(cx, cy, r, 0, Math.PI, true); g.closePath(); }, GOLD.hi, 2, (g) => {
        g.strokeStyle = rgba(GOLD.line, 0.6); g.lineWidth = 1.4;
        for (let k = 1; k < 9; k++) { const an = Math.PI + (k / 9) * Math.PI; polyline(g, [cx + Math.cos(an) * r, cy + Math.sin(an) * r, cx + Math.cos(an) * (r + 26), cy + Math.sin(an) * (r + 26)]); g.stroke(); }
        g.strokeStyle = GOLD.trim; g.lineWidth = 2.4; g.beginPath(); g.arc(cx, cy, r + 3, Math.PI, 0); g.stroke();
      });
      for (const s of [-1, 1]) ink(g, (g) => poly(g, [cx + s * r - 8 * s, 380, cx + s * r - 8 * s, cy, cx + s * (r + (big ? 26 : 18)), cy, cx + s * (r + (big ? 26 : 18)), 380]), GOLD.base, 2, (g) => { g.fillStyle = rgba(GOLD.sh, 0.5); g.fillRect(cx + s * r - 10, cy, 40 * s, 380); });
      if (big) {   // the keystone: a dragon's head looking down the stair
        ink(g, (g) => poly(g, [cx - 22, top - 30, cx + 22, top - 30, cx + 16, top + 8, cx - 16, top + 8]), GOLD.trim, 2, (g) => {
          g.fillStyle = GOLD.trimSh; g.fillRect(cx + 4, top - 30, 20, 40);
          g.fillStyle = GOLD.deep; g.beginPath(); g.ellipse(cx - 8, top - 12, 3, 2, 0, 0, TAU); g.ellipse(cx + 8, top - 12, 3, 2, 0, 0, TAU); g.fill();
          g.strokeStyle = GOLD.deep; g.lineWidth = 1.6; polyline(g, [cx - 8, top, cx, top + 4, cx + 8, top]); g.stroke();
        });
        ink(g, (g) => poly(g, [cx - 18, top - 28, cx - 30, top - 50, cx - 10, top - 30]), GOLD.trim, 1.6);
        ink(g, (g) => poly(g, [cx + 18, top - 28, cx + 30, top - 50, cx + 10, top - 30]), GOLD.trim, 1.6);
      }
    }
    // the beam the Banner Hall's banners hang from
    if (xb > 1100) ink(g, (g) => poly(g, [Math.max(xa, 1100) - 4, 104, xb + 4, 104, xb + 4, 118, Math.max(xa, 1100) - 4, 118]), GOLD.sh, 1.8, (g) => { g.fillStyle = GOLD.trim; g.fillRect(xa, 104, xb - xa, 2.4); });
  }
  function drawPillar(g) {
    // a carved pillar: a dragon coiling up the shaft, a gold-banded base and capital
    const hw = 34;
    ink(g, (g) => poly(g, [-hw, 0, -hw, -360, hw, -360, hw, 0]), GOLD.base, 2.2, (g) => {
      vgrad(g, -hw, -380, hw * 2, 0, [[0, 'rgba(30,14,4,0.45)'], [0.4, 'rgba(0,0,0,0)'], [1, 'rgba(255,210,140,0.12)']]);
      g.fillStyle = rgba(GOLD.sh, 0.75); g.fillRect(hw * 0.3, -380, hw, 380);
      g.fillStyle = rgba(GOLD.hi, 0.7); g.fillRect(-hw + 4, -380, 6, 380);
      // the coil: a band spiralling up (front halves only), scaled
      for (let k = 0; k < 6; k++) {
        const y = -40 - k * 54;
        relief(g, (g) => { g.beginPath(); g.moveTo(-hw, y); g.quadraticCurveTo(0, y - 30, hw, y - 26); g.lineTo(hw, y - 12); g.quadraticCurveTo(0, y - 16, -hw, y + 14); g.closePath(); }, mix(GOLD.base, GOLD.hi, 0.35), GOLD, 1.8);
        g.strokeStyle = rgba(GOLD.deep, 0.6); g.lineWidth = 1.2; for (let j = 1; j < 5; j++) { const x = -hw + j * hw * 0.4; polyline(g, [x, y + 6 - j * 6, x + 4, y - 8 - j * 5]); g.stroke(); }
      }
      // its head at the top, looking out
      relief(g, (g) => poly(g, [-14, -334, 14, -340, 30, -326, 26, -316, 6, -318, -12, -314]), mix(GOLD.base, GOLD.hi, 0.5), GOLD);
      g.fillStyle = GOLD.deep; g.beginPath(); g.ellipse(14, -330, 2.6, 1.8, 0, 0, TAU); g.fill();
    });
    for (const [y, h, w] of [[-26, 26, hw + 10], [-380, 26, hw + 12], [-354, 8, hw + 6]]) ink(g, (g) => poly(g, [-w, y + h, -w, y, w, y, w, y + h]), GOLD.trim, 2, (g) => { g.fillStyle = GOLD.trimSh; g.fillRect(w * 0.3, y, w, h); g.fillStyle = rgba('#fff4d0', 0.6); g.fillRect(-w, y, w * 2, 2); });
  }
  function drawSconce(g) {
    // a dragon-head torch sconce (the flame is live)
    ink(g, (g) => poly(g, [-8, 40, 8, 40, 10, 10, -10, 10]), GOLD.sh, 1.8);
    ink(g, (g) => { g.beginPath(); g.moveTo(-18, 6); g.quadraticCurveTo(0, 18, 18, 6); g.lineTo(14, -2); g.lineTo(-14, -2); g.closePath(); }, GOLD.trim, 1.8, (g) => { g.fillStyle = GOLD.trimSh; g.fillRect(2, -4, 20, 16); });
    ink(g, (g) => poly(g, [-6, 40, 6, 40, 4, 52, 0, 58, -4, 52]), GOLD.trim, 1.6);
  }
  function drawBrazier(g) {
    ink(g, (g) => poly(g, [-22, 0, -10, -16, 10, -16, 22, 0]), GOLD.sh, 2);
    ink(g, (g) => poly(g, [-6, -16, -6, -96, 6, -96, 6, -16]), GOLD.base, 2, (g) => { g.fillStyle = GOLD.sh; g.fillRect(1, -100, 6, 90); });
    ink(g, (g) => { g.beginPath(); g.moveTo(-40, -112); g.quadraticCurveTo(-36, -88, 0, -88); g.quadraticCurveTo(36, -88, 40, -112); g.closePath(); }, GOLD.trim, 2.2, (g) => {
      g.fillStyle = GOLD.trimSh; g.fillRect(10, -114, 34, 30); g.strokeStyle = GOLD.deep; g.lineWidth = 1.4; for (let x = -30; x <= 30; x += 12) { polyline(g, [x, -110, x * 0.8, -92]); g.stroke(); }
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -112, 40, 7, 0, 0, TAU); }, '#4a2a14', 1.8, (g) => { g.fillStyle = '#ff9a3a'; g.beginPath(); g.ellipse(0, -112, 32, 4.5, 0, 0, TAU); g.fill(); });
  }
  // the Queen's chamber: the entrance arch, the round apse, the Heartstone's socket, the bed
  function drawChamber(g, xa, xb) {
    const cx = QX, cy = 430;
    // the apse wall: courses curving round the chamber
    g.save(); g.beginPath(); g.rect(CH0 + 30, -4, LEVEL_LEN - CH0, 384); g.clip();
    ashlar(g, xa, xb, 0, 380, { ...GOLD, base: '#b98a50', sh: '#946a3a', hi: '#d9b47a' }, 9, 34, 70);
    const rg = g.createRadialGradient(cx, 120, 40, cx, 220, 640);
    rg.addColorStop(0, 'rgba(255,215,140,0.25)'); rg.addColorStop(0.5, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(30,14,4,0.55)');
    g.fillStyle = rg; g.fillRect(xa, 0, xb - xa, 380);
    // the great rings of the dome's foot and the ribs between them
    for (const [r, w] of [[560, 14], [470, 10], [380, 8]]) {
      g.strokeStyle = GOLD.deep; g.lineWidth = w + 3; g.beginPath(); g.ellipse(cx, cy, r, r * 0.92, 0, Math.PI, 0); g.stroke();
      g.strokeStyle = GOLD.trim; g.lineWidth = w; g.beginPath(); g.ellipse(cx, cy - 2, r, r * 0.92, 0, Math.PI, 0); g.stroke();
      g.strokeStyle = GOLD.hi; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy - 4, r, r * 0.92, 0, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
    }
    for (let k = 1; k < 12; k++) {
      const a = Math.PI + (k / 12) * Math.PI;
      g.strokeStyle = rgba(GOLD.deep, 0.65); g.lineWidth = 4;
      polyline(g, [cx + Math.cos(a) * 470, cy + Math.sin(a) * 470 * 0.92, cx + Math.cos(a) * 560, cy + Math.sin(a) * 560 * 0.92]); g.stroke();
    }
    // two great dragons circling the dome between the rings, nose to nose over the socket
    g.save(); g.beginPath(); g.ellipse(cx, cy, 466, 466 * 0.92, 0, 0, TAU); g.ellipse(cx, cy, 384, 384 * 0.92, 0, 0, TAU, true); g.clip('evenodd');
    for (const s of [-1, 1]) {
      g.save(); g.translate(cx, cy); g.scale(s, 1);
      const n = 26, pts = [];
      for (let k = 0; k <= n; k++) { const a = Math.PI * (1.04 + 0.42 * k / n), r = 425 + Math.sin(k * 0.9) * 10; pts.push(Math.cos(a) * r, Math.sin(a) * r * 0.92); }
      g.lineCap = 'round';
      g.strokeStyle = GOLD.deep; g.lineWidth = 26; curve(g, pts); g.translate(2, 2); g.stroke(); g.translate(-2, -2);
      g.strokeStyle = mix(GOLD.base, GOLD.hi, 0.45); g.lineWidth = 24; curve(g, pts); g.stroke();
      g.strokeStyle = rgba(GOLD.deep, 0.6); g.lineWidth = 1.4;
      for (let k = 2; k < pts.length - 2; k += 2) { polyline(g, [pts[k] * 0.98, pts[k + 1] * 0.98, pts[k] * 1.02, pts[k + 1] * 1.02]); g.stroke(); }
      g.restore();
    }
    g.restore();
    for (const s of [-1, 1]) {   // their heads, nose to nose at the top
      const hx = cx + s * 40, hy = cy - 425 * 0.92 + 4;
      relief(g, (g) => poly(g, [hx - s * 30, hy - 14, hx - s * 4, hy - 16, hx + s * 16, hy - 6, hx + s * 14, hy + 6, hx - s * 4, hy + 12, hx - s * 30, hy + 12]), mix(GOLD.base, GOLD.hi, 0.5));
      relief(g, (g) => poly(g, [hx - s * 22, hy - 14, hx - s * 40, hy - 34, hx - s * 14, hy - 16]), mix(GOLD.base, GOLD.hi, 0.3), GOLD, 1.4);
      g.fillStyle = GOLD.deep; g.beginPath(); g.ellipse(hx - s * 2, hy - 6, 3, 2, 0, 0, TAU); g.fill();
    }
    // the Heartstone's socket: a round niche with a carved sunburst; three star-shaped gaps where the shards belong
    const [nx, ny, nr] = NICHE;
    ink(g, (g) => { g.beginPath(); g.arc(nx, ny, nr + 16, 0, TAU); }, GOLD.trim, 2.2, (g) => { g.fillStyle = GOLD.trimSh; g.beginPath(); g.arc(nx + 8, ny + 8, nr + 14, 0, TAU); g.fill(); g.fillStyle = GOLD.trim; g.beginPath(); g.arc(nx - 2, ny - 2, nr + 10, 0, TAU); g.fill(); });
    ink(g, (g) => { g.beginPath(); g.arc(nx, ny, nr, 0, TAU); }, '#7a5230', 2, (g) => {
      const ng = g.createRadialGradient(nx - 20, ny - 20, 10, nx, ny, nr); ng.addColorStop(0, '#a87a44'); ng.addColorStop(1, '#4a2e18');
      g.fillStyle = ng; g.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; g.strokeStyle = rgba(GOLD.hi, 0.4); g.lineWidth = 3; polyline(g, [nx + Math.cos(a) * 34, ny + Math.sin(a) * 34, nx + Math.cos(a) * (nr - 8), ny + Math.sin(a) * (nr - 8)]); g.stroke(); }
      g.fillStyle = '#5a3a1e'; g.beginPath(); g.arc(nx, ny, 30, 0, TAU); g.fill();
      for (const [a, d] of [[-1.9, 62], [-0.2, 66], [1.6, 58]]) {
        const sx = nx + Math.cos(a) * d, sy = ny + Math.sin(a) * d;
        g.fillStyle = '#6a4626'; poly(g, [sx, sy - 13, sx + 4, sy - 4, sx + 13, sy - 3, sx + 6, sy + 4, sx + 8, sy + 13, sx, sy + 7, sx - 8, sy + 13, sx - 6, sy + 4, sx - 13, sy - 3, sx - 4, sy - 4]); g.fill();
      }
    });
    g.restore();
    // the entrance: a massive round arch at CH0, its left jamb hiding where the hall ends
    const ax0 = CH0 - 20, ax1 = CH0 + 70;
    ink(g, (g) => poly(g, [ax0, 384, ax0, -4, ax1, -4, ax1, 384]), GOLD.base, 2.4, (g) => {
      ashlar(g, ax0, ax1, 0, 384, GOLD, 13, 46, 90);
      g.fillStyle = rgba(GOLD.sh, 0.6); g.fillRect(ax1 - 30, 0, 30, 384); g.fillStyle = rgba(GOLD.hi, 0.6); g.fillRect(ax0, 0, 6, 384);
      relief(g, (g) => { g.beginPath(); g.arc((ax0 + ax1) / 2, 150, 22, 0, TAU); }, GOLD.hi); clanEmblem(g, (ax0 + ax1) / 2, 150, 34, GOLD.sh);
    });
    for (const y of [-4, 360]) ink(g, (g) => poly(g, [ax0 - 12, y + 24, ax0 - 12, y, ax1 + 12, y, ax1 + 12, y + 24]), GOLD.trim, 2, (g) => { g.fillStyle = GOLD.trimSh; g.fillRect(ax0 + 30, y, 60, 24); });
    // old banners hanging on the apse
    for (const [x, k] of [[QX - 380, 0], [QX + 330, 1]]) if (x > xa - 90 && x < xb + 20) clanBanner(g, x, 70, 70, 210 - k * 20, 90 + k);
    // the Queen's bed: a raised round dais, its top heaped with faded cushions and old banners
    if (xb > QX - BED_RX - 40 && xa < QX + BED_RX + 40) drawBed(g);
  }
  function drawBed(g) {
    const x = QX, y = BED_Y, rx = BED_RX, ry = BED_RY;
    // the front face (to the floor's back edge), with a carved band
    ink(g, (g) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI); g.lineTo(x - rx, y); g.lineTo(x - rx, 356); g.ellipse(x, 356, rx, 8, 0, Math.PI, 0, true); g.lineTo(x + rx, y); g.closePath(); }, GOLD.base, 2.2, (g) => {
      vgrad(g, x - rx, y, rx * 2, 380, [[0, 'rgba(255,220,150,0.25)'], [1, 'rgba(40,20,6,0.35)']]);
      g.fillStyle = rgba(GOLD.sh, 0.6); g.fillRect(x + rx * 0.45, y, rx, 60);
      g.strokeStyle = GOLD.trim; g.lineWidth = 4; g.beginPath(); g.ellipse(x, y + 20, rx, ry, 0, 0.08, Math.PI - 0.08); g.stroke();
      g.strokeStyle = rgba(GOLD.deep, 0.7); g.lineWidth = 1.6;
      for (let k = -6; k <= 6; k++) { const px = x + k * rx / 7; polyline(g, [px, y + ry * Math.sqrt(Math.max(0, 1 - (k / 7) ** 2)) + 10, px, 362]); g.stroke(); }
    });
    // the top: a gold rim round a quilted cushion; plump pillows heaped round the back and sides; coins and gems
    ink(g, (g) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); }, GOLD.trim, 2.2, (g) => {
      g.fillStyle = '#f0dab0'; g.beginPath(); g.ellipse(x, y + 1, rx - 12, ry - 6, 0, 0, TAU); g.fill();
      g.save(); g.beginPath(); g.ellipse(x, y + 1, rx - 12, ry - 6, 0, 0, TAU); g.clip();
      g.strokeStyle = '#d4b47e'; g.lineWidth = 1.4;
      for (let k = -14; k <= 14; k++) { polyline(g, [x + k * 22 - 40, y - ry, x + k * 22 + 40, y + ry]); g.stroke(); polyline(g, [x + k * 22 + 40, y - ry, x + k * 22 - 40, y + ry]); g.stroke(); }
      g.fillStyle = '#c8a46a'; for (let k = -12; k <= 12; k++) for (const j of [-1, 0, 1]) { g.beginPath(); g.arc(x + k * 22 + j * 11, y + j * 9, 1.4, 0, TAU); g.fill(); }
      g.restore();
    });
    const pillow = (px, py, w, h, col, sh, a) => {
      g.save(); g.translate(px, py); g.rotate(a);
      ink(g, (g) => { g.beginPath(); g.moveTo(-w, -h * 0.6); g.quadraticCurveTo(0, -h * 1.25, w, -h * 0.6); g.quadraticCurveTo(w * 1.12, 0, w, h * 0.6); g.quadraticCurveTo(0, h * 1.2, -w, h * 0.6); g.quadraticCurveTo(-w * 1.12, 0, -w, -h * 0.6); g.closePath(); }, col, 1.8, (g) => {
        g.fillStyle = sh; g.beginPath(); g.ellipse(w * 0.25, h * 0.45, w * 0.95, h * 0.55, 0, 0, TAU); g.fill();
        g.fillStyle = rgba('#fff4e0', 0.45); g.beginPath(); g.ellipse(-w * 0.3, -h * 0.35, w * 0.45, h * 0.22, -0.1, 0, TAU); g.fill();
        g.strokeStyle = rgba(sh, 0.9); g.lineWidth = 1.2; g.beginPath(); g.moveTo(-w * 0.2, -h * 0.2); g.quadraticCurveTo(0, 0, -w * 0.1, h * 0.4); g.stroke();
      });
      for (const sx of [-1, 1]) { strokeLine(g, [sx * w, h * 0.55, sx * (w + 5), h * 0.95], 2, GOLD.trimSh); g.fillStyle = GOLD.trim; g.beginPath(); g.arc(sx * (w + 5), h + 1, 2.6, 0, TAU); g.fill(); }
      g.restore();
    };
    const PIL = [[-200, -14, 0.25, 0], [-118, -24, 0.08, 1], [-34, -28, 0, 0], [52, -27, -0.04, 1], [136, -22, -0.1, 0], [212, -10, -0.28, 1], [-226, 6, 0.4, 1], [232, 8, -0.42, 0]];
    for (const [dx, dy, a, k] of PIL) pillow(x + dx, y + dy, 40, 15, k ? '#d8786a' : '#e8c070', k ? '#b05a50' : '#c49a48', a);
    const R = mulberry(2721);
    for (let k = 0; k < 22; k++) {     // coins and a few gems along the rim
      const a = R.r(0.15, Math.PI - 0.15), px = x + Math.cos(a) * (rx - 10), py = y + Math.sin(a) * (ry - 3);
      if (k % 6 === 0) { g.fillStyle = k % 12 ? '#5aa0e0' : '#e05a6a'; poly(g, [px, py - 5, px + 4, py, px, py + 4, px - 4, py]); g.fill(); g.strokeStyle = GOLD.line; g.lineWidth = 1; g.stroke(); }
      else { g.fillStyle = GOLD.trim; g.beginPath(); g.ellipse(px, py, 5, 2.4, 0, 0, TAU); g.fill(); g.strokeStyle = GOLD.trimSh; g.lineWidth = 1; g.stroke(); }
    }
  }

  // ------------------------------------------------------------------ the floor
  function drawGround(g, xa, xb) {
    vgrad(g, xa - 2, 354, xb - xa + 4, H, [[0, '#b8996a'], [0.08, '#d6bd8e'], [0.5, '#dcc496'], [1, '#c9ae80']]);
    // paving: rows of cut stones (foreshortened toward the back), the hall only
    if (xa < CH0 + 200) {
      const x1 = Math.min(xb, CH0 + 200);
      g.save(); g.beginPath(); g.rect(xa - 4, 354, x1 - xa + 4, H); g.clip();
      const rows = [[370, 388], [388, 410], [410, 436], [436, 466], [466, 500], [500, 540]];
      for (let r = 0; r < rows.length; r++) {
        const [ya, yb] = rows[r], sw = 110, off = (r % 2) * 55 + hash1(r * 7) * 12;
        for (let i = Math.floor((xa - off) / sw) - 1; i * sw + off < x1 + sw; i++) {
          const x0 = i * sw + off, h = hash2(i, r * 3 + 11);
          g.fillStyle = mix(STONE.stone, h < 0.5 ? STONE.stoneSh : STONE.stoneHi, Math.abs(h - 0.5) * 0.7);
          roundRect(g, x0 + 2, ya + 1.5, sw - 4, yb - ya - 3, 3); g.fill();
          g.fillStyle = rgba(STONE.stoneHi, 0.5); g.fillRect(x0 + 4, ya + 2, sw - 8, 1.6);
          g.fillStyle = rgba(STONE.joint, 0.35); g.fillRect(x0 + 3, yb - 3, sw - 6, 1.6);
        }
        g.fillStyle = rgba(STONE.joint, 0.45); g.fillRect(xa, yb - 1, x1 - xa, 1.6);
      }
      // a gold-inlaid border along the back
      g.fillStyle = '#8a6438'; g.fillRect(xa - 4, 362, x1 - xa + 8, 8);
      g.fillStyle = GOLD.trim; g.fillRect(xa - 4, 364, x1 - xa + 8, 2.2);
      g.restore();
    }
    // the chamber: a great round mosaic round the Queen's bed -- rings and rays, a Clan sun at its heart
    if (xb > CH0 + 80) {
      const cx = QX, cy = 452, x0 = Math.max(xa, CH0 + 80);
      const seam = (y) => CH0 + 40 + (y - 362) * 0.2;
      g.save(); g.beginPath(); g.moveTo(seam(354), 354); g.lineTo(seam(H), H); g.lineTo(xb + 4, H); g.lineTo(xb + 4, 354); g.closePath(); g.clip();
      vgrad(g, x0 - 2, 354, xb - x0 + 4, H, [[0, '#b8996a'], [0.08, '#d8c092'], [0.5, '#e0c99c'], [1, '#ccb084']]);
      const rings = [[640, 104, '#c8a870'], [560, 92, '#dcc498'], [470, 78, '#c9a46a'], [380, 64, '#e2cba0'], [280, 48, '#cfae74'], [180, 32, '#e4cea4'], [90, 17, '#d6b47a']];
      for (const [rx, ry, col] of rings) {
        g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
        g.strokeStyle = rgba(GOLD.trim, 0.9); g.lineWidth = 2.2; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.stroke();
        g.strokeStyle = rgba(GOLD.line, 0.3); g.lineWidth = 1.2; g.beginPath(); g.ellipse(cx, cy + 1.6, rx, ry, 0, 0.05, Math.PI - 0.05); g.stroke();
      }
      g.strokeStyle = rgba(STONE.joint, 0.35); g.lineWidth = 1.3;
      for (let k = 0; k < 32; k++) { const a = (k / 32) * TAU; polyline(g, [cx + Math.cos(a) * 90, cy + Math.sin(a) * 17, cx + Math.cos(a) * 640, cy + Math.sin(a) * 104]); g.stroke(); }
      g.save(); g.translate(cx, cy); g.scale(1, 0.19); clanEmblem(g, 0, 0, 150, rgba(GOLD.trimSh, 0.8)); g.restore();
      g.fillStyle = '#8a6438'; g.fillRect(x0 - 4, 362, xb - x0 + 8, 8); g.fillStyle = GOLD.trim; g.fillRect(x0 - 4, 364, xb - x0 + 8, 2.2);
      g.restore();
    }
    // the back edge's soft contact shadow
    vgrad(g, xa, 366, xb - xa, 384, [[0, 'rgba(40,20,6,0.3)'], [1, 'rgba(40,20,6,0)']]);
    // the front edge: a carved stone kerb
    ink(g, (g) => poly(g, [xa - 4, H + 4, xa - 4, 526, xb + 4, 526, xb + 4, H + 4]), '#a88252', 1.6, (g) => {
      g.fillStyle = GOLD.trim; g.fillRect(xa - 4, 526, xb - xa + 8, 2.4);
      g.strokeStyle = rgba(GOLD.line, 0.5); g.lineWidth = 1.4; for (let x = al(xa, 60) - 60; x < xb + 60; x += 60) { polyline(g, [x, 530, x, 544]); g.stroke(); }
    });
  }

  // ------------------------------------------------------------------ per frame
  function particles(ctx, C, camX, t, layer, c) {
    const par = layer ? 1.3 : 0.7;
    ctx.globalCompositeOperation = 'lighter';
    for (const f of LAY.motes) {
      if (f.layer !== layer) continue;
      const sx0 = ((f.x - camX * par) % 1000 + 1000) % 1000 - 20, wx = camX + sx0;
      const x = sx0 + Math.sin(t * f.fr + f.ph) * f.sw;
      const green = f.k < 0.35, gold = f.k > 0.8;
      let a;
      if (green) a = c * (wx < 1200 || wx > CH0 ? 0.8 : 0.45);      // curse sparks, rising
      else if (gold) a = (1 - c) * 0.9 + (wx > CH0 ? 0.15 : 0);      // gold sparkles as the curse lifts
      else a = 0.3;                                                   // dust in the torchlight
      if (a < 0.03) continue;
      const y = ((f.y - t * (green ? 16 : 6) * f.sp) % 560 + 560) % 560 - 10;
      ctx.globalAlpha = a * (0.4 + 0.6 * Math.sin(t * 1.5 * f.fr + f.ph) ** 2);
      const r = (layer ? 3.6 : 2.4) * (gold ? 1.3 : 1);
      ctx.drawImage(green ? C.moteG.c : C.mote.c, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function drawCurse(ctx, C, camX, t, s, c) {
    for (const [x, y, sz, v, order] of CRYSTALS) {
      const sx = x - camX;
      if (sx < -80 || sx > W + 80) continue;
      const k = curseAt(c, order);
      if (k <= 0.01) continue;
      const spr = C.curse[v], sc = sz * (0.35 + 0.65 * smooth(k));
      glowAt(ctx, C.glowG, sx, y - 26 * sc, 60 * sc, (0.35 + 0.12 * Math.sin(t * 1.4 + x)) * k);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.drawImage(spr.c, Math.round((sx - spr.ox * sc) * s) / s, y - spr.oy * sc, spr.w * sc, spr.h * sc);
      ctx.globalAlpha = 1;
      if (k < 0.7) {               // winking out: a little burst of gold
        ctx.globalCompositeOperation = 'lighter';
        for (let j = 0; j < 5; j++) { const a = j * 1.26 + t * 2, r = (1 - k) * 34; ctx.globalAlpha = k * 1.2; ctx.drawImage(C.mote.c, sx + Math.cos(a) * r - 4, y - 24 * sz + Math.sin(a) * r * 0.7 - 4, 8, 8); }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S(), c = curse(), lift = 1 - c;
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(0, 0, W, H);
    if (camX < CH0 + 60) { drawStrip(ctx, C.far, camX, s); drawStrip(ctx, C.mid, camX, s); drawStrip(ctx, C.wall, camX, s); }
    if (camX + W > CH0 - 20) {
      drawStrip(ctx, C.chamber, camX, s);
      // the Heartstone's socket: green-lit while the curse holds, warm gold as it lifts
      const nx = NICHE[0] - camX;
      if (nx > -260 && nx < W + 260) {
        glowAt(ctx, C.glowG, nx, NICHE[1], 150, c * (0.3 + 0.08 * Math.sin(t * 1.1)));
        glowAt(ctx, C.glowGold, nx, NICHE[1], 170, lift * (0.55 + 0.1 * Math.sin(t * 1.3)));
        // the light falling from the oculus onto the bed: always a little, bright when the curse is gone
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const qx = QX - camX, gr = ctx.createLinearGradient(0, -10, 0, BED_Y + 30);
        const a = 0.08 + 0.16 * lift;
        gr.addColorStop(0, `rgba(255,236,180,${a})`); gr.addColorStop(1, `rgba(255,220,150,${a * 0.3})`);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(qx - 70, -10); ctx.lineTo(qx + 70, -10); ctx.lineTo(qx + 230, BED_Y + 30); ctx.lineTo(qx - 230, BED_Y + 30); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    if (c > 0.01 && camX + W > CH0) {
      const x0 = Math.max(0, CH0 + 30 - camX);
      ctx.fillStyle = `rgba(22,52,44,${0.26 * c})`; ctx.fillRect(x0, 0, W - x0, 364);
    }
    drawSprites(ctx, C.back, camX, s);
    // banners swaying between the pillars, the torches and the braziers
    for (let i = 0; i < PILLARS.length - 1; i++) {
      const x = (PILLARS[i] + PILLARS[i + 1]) / 2 - 42 - camX;
      if (x < -100 || x > W + 20) continue;
      drawHang(ctx, C.banner[i % 2], x, 112, t, i * 1.3, 3);
    }
    for (const [i, x0] of TORCHES.entries()) {
      const x = x0 - camX; if (x < -80 || x > W + 80) continue;
      ctx.drawImage(C.sconce.c, Math.round((x - C.sconce.ox) * s) / s, 236 - C.sconce.oy, C.sconce.w, C.sconce.h);
      flame(ctx, C.glowW, x, 236, 22, t, i * 3.1);
    }
    for (const [i, x0] of BRAZIERS.entries()) { const x = x0 - camX; if (x > -100 && x < W + 100) flame(ctx, C.glowW, x, 364 - 114, 34, t, i * 5.3 + 1, 1 + lift * 0.2); }
    // the curse crystals (fading with the curse) and the chamber's green hold on the Queen
    drawCurse(ctx, C, camX, t, s, c);
    if (camX + W > CH0) glowAt(ctx, C.glowG, QX - camX, BED_Y - 20, 300, c * 0.16, 120);
    drawStrip(ctx, C.ground, camX, s);
    ctx.globalCompositeOperation = 'screen'; drawStrip(ctx, C.light, camX, s); ctx.globalCompositeOperation = 'source-over';
    if (camX + W > CH0 && lift > 0.01) glowAt(ctx, C.glowGold, QX - camX, 440, 420, lift * 0.25, 90);
    particles(ctx, C, camX, t, 0, c);
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0) {
    const C = st.ensure();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    particles(ctx, C, camX, t, 1, curse());
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(60,30,10,0.3)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  /** the curse (0..1, 1 = full): the green crystals shrink and wink out as it drops; null = back to 1 - warm */
  function setCurse(c) { curseSet = c === null || c === undefined ? null : clamp(+c || 0, 0, 1); }
  return { setScale: st.setScale, setWarm, setCurse, drawBack, drawFront, drawProp, info: st.info, release: st.release, get curse() { return curse(); } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 62, h: 58, colors: ['#a8743f', '#7a4f2a', '#e2b24c', '#4a4448'] },
  barrel: { w: 48, h: 60, colors: ['#93603a', '#653f22', '#e2b24c', '#a8423a'] },
  urn:    { w: 46, h: 58, colors: ['#e2b24c', '#a87a2c', '#a8423a', '#f0cc6a'] },
};
const PROP_DRAW = {
  crate(g) {   // an old Clan chest-crate, gold-cornered
    const wood = '#a8743f', woodSh = '#7a4f2a', woodHi = '#d29a5c', woodDk = '#5c3a20', gold = '#e2b24c', goldSh = '#a87a2c';
    const L = -30, Rr = 24, T = -40, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), woodSh, 2.6);
    ink(g, (g) => poly(g, [L, T, Rr, T, Rr + dx, T + dy, L + dx, T + dy]), woodHi, 2.4);
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4; for (const y of [-14, -27]) { polyline(g, [L, y, Rr, y]); g.stroke(); }
      g.fillStyle = woodSh; g.fillRect(L, T, 6, 40); g.fillRect(Rr - 6, T, 6, 40);
      g.fillStyle = gold; for (const [x, y] of [[L, T], [Rr - 10, T], [L, -10], [Rr - 10, -10]]) g.fillRect(x, y, 10, 10);
      g.fillStyle = goldSh; for (const [x, y] of [[L, T], [Rr - 10, T], [L, -10], [Rr - 10, -10]]) g.fillRect(x + 6, y + 6, 4, 4);
      clanEmblem(g, -3, -20, 20, goldSh);
    });
  },
  barrel(g) {
    const wood = '#93603a', woodSh = '#653f22', woodHi = '#bb8350', band = '#e2b24c', bandSh = '#a87a2c';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -52); g.quadraticCurveTo(-27, -26, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -26, 18, -52); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -60, 30, 66); g.fillStyle = woodHi; g.fillRect(-19, -54, 5, 58);
      g.strokeStyle = woodSh; g.lineWidth = 1.2; for (const k of [-0.5, -0.1, 0.3]) { g.beginPath(); g.moveTo(k * 18, -52); g.quadraticCurveTo(k * 27, -26, k * 18, 4); g.stroke(); }
      for (const y of [-44, -8]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = band; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = bandSh; g.fillRect(-30, y + 1, 60, 2); }
      g.fillStyle = '#a8423a'; g.fillRect(-28, -30, 56, 9);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 18, 5.5, 0, 0, TAU); }, woodHi, 2.4);
  },
  urn(g) {     // a gold Clan urn with the coiled dragon
    const gold = '#e2b24c', goldSh = '#a87a2c', goldHi = '#fbe2a0';
    const body = (g) => {
      g.beginPath(); g.moveTo(-11, 0); g.lineTo(-13, -5); g.quadraticCurveTo(-26, -18, -21, -34); g.quadraticCurveTo(-17, -44, -9, -47);
      g.lineTo(-9, -52); g.lineTo(-13, -56); g.lineTo(13, -56); g.lineTo(9, -52); g.lineTo(9, -47);
      g.quadraticCurveTo(17, -44, 21, -34); g.quadraticCurveTo(26, -18, 13, -5); g.lineTo(11, 0); g.closePath();
    };
    for (const s of [-1, 1]) { g.lineWidth = 6.5; g.strokeStyle = INK; g.beginPath(); g.moveTo(s * 9, -46); g.quadraticCurveTo(s * 24, -50, s * 18, -36); g.stroke(); g.lineWidth = 3.5; g.strokeStyle = gold; g.stroke(); }
    ink(g, body, gold, 2.6, (g) => {
      g.fillStyle = goldSh; g.beginPath(); g.ellipse(12, -24, 14, 30, 0, 0, TAU); g.fill();
      g.fillStyle = goldHi; g.beginPath(); g.ellipse(-12, -30, 4, 9, 0.3, 0, TAU); g.fill();
      g.fillStyle = '#a8423a'; g.fillRect(-30, -36, 60, 10);
      clanEmblem(g, 0, -18, 16, '#7a4a1a');
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -56, 13, 3.5, 0, 0, TAU); }, '#3a2420', 1.8);
  },
};
