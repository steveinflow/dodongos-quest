// Dodongo's Quest - Mystic Mountain stage 1 "THE SHADOW FOREST" (src/stages/mmforest.js): background, floor, props.
//
// The comic's chapter two (pages 8-15): night under a pale full moon, cold moonlight blue and ground fog, gnarled
// black trees whose knots look like faces -- and some of them watch, and blink.  Hanging moss.  Halfway up, the
// forest opens onto a rocky ledge above the trees where the heroes camp (a campfire, the valley's lights far below).
//
// Sections (world x):  edge 0-1200 (the Forest Edge)  |  woods 1200-2500 (the Watching Woods: the living trees)  |
// camp 2500-3600 (the Campsite Ledge: bare rock over the treetops, the campfire, the valley and the village's lights
// far below)  |  den 3600-5200 (the Wolf Den: the trees close in again; the boss arena is the last screen, a moonlit
// clearing under an arch of branches).
//
// Back-to-front (drawBack): the night sky (live gradient, stars, the moon at p 0.02) -> far ridges and treeline
// (p 0.1) -> the camp's vista (p 0.16, only over the ledge) -> mid trees in the mist (p 0.38) -> back fog (live) ->
// near trees + the living trees (1.0) -> the canopy (1.0) -> low fog (live) -> the undergrowth (1.0) -> the floor
// (1.0) -> the moonlight band (the readability light) -> the campfire, watching eyes, the living trees' arms and
// their warning shadows -> motes and leaves.   drawFront: hanging moss at p 1.25 (never on an arena screen), near fog.
// The living trees: HOOKS.trees (x, armY, reach, band = the depth stripe the swipe sweeps, face) and
// setTreeSwipe(i, k): k 0 asleep; 0..0.35 the face wakes (eyes glow) and the warning shadow grows on the floor;
// 0.35..0.7 the branch-arm sweeps low across the lane, left to right (the runtime's hit: k 0.40-0.62); 0.7..1 back.
// Every static element is cached per scale (chunked strips + sprites, src/canvasmem.js); animated bits are live.

import { W, H, INK, FLOOR_TOP } from '../config.js';
import { STAGE_CS, layerCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 5200;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'edge', name: 'The Forest Edge', x0: 0, x1: 1200 },
  { id: 'woods', name: 'The Watching Woods', x0: 1200, x1: 2500 },
  { id: 'camp', name: 'The Campsite Ledge', x0: 2500, x1: 3600 },
  { id: 'den', name: 'The Wolf Den', x0: 3600, x1: 5200 },
];
export const ARENAS = [450, 1650, 2900, CAM_MAX];
export const WAYSTONES = [2350];
const CAMP0 = 2560, CAMP1 = 3560, FIRE = 3050, DEN = 4720;
// the living trees on the lane's back edge: trunk x, the depth band their branch-arm sweeps (none on the boss screen)
const LIVING = [{ x: 760, band: [24, 68], v: 0 }, { x: 1420, band: [72, 116], v: 1 }, { x: 1980, band: [30, 74], v: 0 }, { x: 2380, band: [86, 130], v: 1 }, { x: 3960, band: [40, 84], v: 0 }];
const ARM_Y = 262, REACH = 240, FACE_Y = 196;
export const HOOKS = {
  arenas: ARENAS, waystones: WAYSTONES, campfire: FIRE, camp: [CAMP0, CAMP1], den: DEN,
  trees: LIVING.map((t) => ({ x: t.x, armY: ARM_Y, reach: [t.x - REACH, t.x + REACH], band: t.band.slice(), face: [t.x, FACE_Y] })),
};

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
const P_MOON = 0.02, P_FAR = 0.1, P_VISTA = 0.16, P_MID = 0.38, P_FRONT = 1.25;
const GT0 = 340;
const SKY = ['#060b1c', '#0f1d40', '#1d3462', '#34507e'];
const BARK = { base: '#1b2034', sh: '#0f121f', hi: '#3a4a72', rim: '#7d9ccc', groove: '#0a0c16', knot: '#06070d' };
const MOSS = { base: '#5d8274', sh: '#3d5a52', hi: '#9cc0ac' };
const FLOOR = { back: '#2f3a58', mid: '#45537a', front: '#36425f', path: '#56668e', root: '#1d2236', stone: '#5c6886', stoneHi: '#8592b4' };
const ROCK = { base: '#59647e', sh: '#3f4862', hi: '#7f8aa6', crack: '#262c40' };
const EYE = { glow: '255,176,70', iris: '#ffc24a', hot: '#fff1b8' };
const LS = { far: ['#141f3c', 0.5], mid: ['#0f1730', 0.55], near: ['#0b0f1f', 0.66], front: ['#070a14', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const campK = (x) => sstep(CAMP0 - 140, CAMP0 + 60, x) * (1 - sstep(CAMP1 - 60, CAMP1 + 140, x));   // 1 on the open ledge
const clearK = (x) => sstep(CAM_MAX + 160, CAM_MAX + 300, x) * (1 - sstep(LEVEL_LEN - 260, LEVEL_LEN - 120, x));   // the den clearing

// near trees (world x, variant, flip): seeded along the forest, kept off the ledge and clear of the living trees
let SHOULDER = null;   // (the living trees' shoulder x per variant: set on the first build)
const NEAR_TREES = (() => {
  const R = mulberry(5200), out = [];
  for (let x = 90; x < LEVEL_LEN + 100;) {
    const ok = campK(x) < 0.05 && LIVING.every((t) => Math.abs(t.x - x) > 170) && !(x > CAM_MAX + 260 && x < LEVEL_LEN - 240);
    if (ok) out.push({ x, v: R.i(0, 2), flip: R() < 0.5 });
    x += R.r(230, 330);
  }
  out.push({ x: CAM_MAX + 150, v: 3, flip: false }, { x: LEVEL_LEN - 90, v: 3, flip: true });   // the den's frame trees
  return out;
})();
// foreground moss curtains (p 1.25), only where no arena screen sees them
const FRONT_MOSS = [260, 1250, 2280, 3800].filter((x) => clearOfArenas(x, 80, P_FRONT));

const LAY = (() => {
  const R = mulberry(808);
  const stars = [];
  for (let i = 0; i < 90; i++) stars.push({ x: R.r(0, 1100), y: R.r(4, 230), r: R.r(0.6, 1.6), ph: R.r(0, TAU), sp: R.r(0.5, 2) });
  const motes = [];
  for (let i = 0; i < 70; i++) motes.push({ x: R.r(0, 1000), y: R.r(60, 540), sp: R.r(0.3, 1), sw: R.r(6, 22), ph: R.r(0, TAU), fr: R.r(0.2, 0.8), k: R(), layer: i < 50 ? 0 : 1 });
  const fog = [];
  for (let i = 0; i < 20; i++) fog.push({ x: R.r(0, 1400), y: R.r(250, 350), w: R.r(280, 520), a: R.r(0.26, 0.42), sp: R.r(4, 11), layer: i % 2 });
  return { stars, motes, fog };
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
// a gnarled trunk: centre line cx(y), half width hw(y) from the base (y 0) up to y top; returns the outline points
function trunkPath(seed, hw0, hw1, top, lean) {
  const R = mulberry(seed), n = 18, L = [], Rr = [];
  const ph = R.r(0, TAU), ph2 = R.r(0, TAU);
  const bulge = R.r(0.3, 0.7), twist = R.r(14, 22);
  for (let k = 0; k <= n; k++) {
    const f = k / n, y = lerp(0, top, f);
    // (gnarled: an S-bend, a burl-like bulge partway up, a ragged edge)
    const cx = lean * f * f + Math.sin(f * 3.4 + ph) * twist * (0.4 + f) + Math.sin(f * 9 + ph2) * 4;
    let hw = lerp(hw0, hw1, Math.pow(f, 0.7)) * (1 + 0.22 * Math.exp(-(((f - bulge) / 0.08) ** 2)));
    if (f < 0.2) hw += (1 - f / 0.2) ** 2.2 * hw0 * 1.25;   // the root flare
    const wob = (R() - 0.5) * 7;
    L.push([cx - hw + wob, y]); Rr.push([cx + hw + wob * 0.5, y]);
  }
  return { L, R: Rr };
}
function knotHole(g, x, y, rx, ry, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = BARK.hi; g.beginPath(); g.ellipse(0, 0, rx + 4, ry + 3.5, 0, 0, TAU); g.fill();
  g.fillStyle = BARK.sh; g.beginPath(); g.ellipse(0.8, 0.8, rx + 1.4, ry + 1.2, 0, 0, TAU); g.fill();
  g.fillStyle = BARK.knot; g.beginPath(); g.ellipse(0.6, 1, rx, ry, 0, 0, TAU); g.fill();
  g.strokeStyle = rgba(BARK.rim, 0.45); g.lineWidth = 1.3; g.beginPath(); g.ellipse(0, 0, rx + 3.4, ry + 3, 0, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  g.restore();
}
// hanging moss strands from (x, y): n strands, length len
function mossHang(g, x, y, w, len, seed, a = 1) {
  // wispy: thin tapering strands of uneven length in a clump (longest in the middle), a few forked, lit at the top
  const R = mulberry(seed);
  g.save(); g.globalAlpha = a; g.lineCap = 'round';
  const n = 9 + Math.round(w / 8);
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1), sx = x + (f - 0.5) * w + R.r(-3, 3);
    const l = len * (0.3 + 0.7 * Math.sin(f * Math.PI) ** 0.7) * R.r(0.55, 1.1), sw = R.r(-7, 7), wv = R.r(2, 5);
    const y0 = y - R.r(0, 6) * Math.sin(f * Math.PI);
    const pts = []; for (let j = 0; j <= 6; j++) { const u = j / 6; pts.push(sx + sw * u * u + Math.sin(u * 7 + k) * wv * u, y0 + l * u); }
    g.strokeStyle = LINE; g.lineWidth = 3.4 * LK + 0.6; curve(g, pts); g.stroke();
    g.strokeStyle = k % 3 ? MOSS.base : MOSS.sh; g.lineWidth = 2.4; curve(g, pts); g.stroke();
    g.strokeStyle = rgba(MOSS.hi, 0.6); g.lineWidth = 1; curve(g, pts.slice(0, 8)); g.stroke();
    if (k % 3 === 1 && l > 24) { g.strokeStyle = MOSS.sh; g.lineWidth = 1.6; polyline(g, [pts[6], pts[7], pts[6] + R.r(-8, 8), pts[7] + l * 0.3]); g.stroke(); }
  }
  // a lumpy clump over the strands' tops (ragged, not a straight edge)
  for (let k = 0; k < 4 + Math.round(w / 12); k++) {
    const cx = x + (k / (3 + Math.round(w / 12)) - 0.5) * w * 0.9 + R.r(-2, 2), cy = y - R.r(1, 5), r = R.r(3, 5.5);
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.lineWidth = 2.4 * LK + 0.4; g.strokeStyle = LINE; g.stroke(); g.fillStyle = k % 2 ? MOSS.base : MOSS.sh; g.fill();
    g.fillStyle = rgba(MOSS.hi, 0.6); g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.35, r * 0.4, 0, TAU); g.fill();
  }
  g.restore();
}
// a gnarled bough from (x0, y0) to (x1, y1) bowing by `bow` (perpendicular), width w0 -> w1, with a forked twig or two
function bough(g, x0, y0, x1, y1, bow, w0, w1, seed, twigs = 2) {
  const R = mulberry(seed), n = 10, Lp = [], Rp = [], mid = [];
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  for (let j = 0; j <= n; j++) {
    const u = j / n, b = Math.sin(u * Math.PI) * bow + Math.sin(u * 9 + seed) * 4;
    const x = x0 + dx * u + nx * b, y = y0 + dy * u + ny * b, w = lerp(w0, w1, u) * (1 + 0.15 * Math.sin(u * 11 + seed));
    mid.push([x, y]); Lp.push(x + nx * w, y + ny * w); Rp.unshift(x - nx * w, y - ny * w);
  }
  const shape = (g) => poly(g, Lp.concat(Rp));
  ink(g, shape, BARK.base, 2.2, (g) => {
    g.fillStyle = rgba(BARK.rim, 0.55); g.save(); g.translate(nx * -3 + 1, ny * -3 - 2); shape(g); g.restore(); g.fill();
    g.save(); g.translate(nx * 2, ny * 2 + 1); shape(g); g.fillStyle = BARK.base; g.fill(); g.restore();
    g.strokeStyle = rgba(BARK.groove, 0.6); g.lineWidth = 1.4; curve(g, flat(mid.map(([x, y], j) => [x + nx * (w0 * 0.2), y + ny * (w0 * 0.2)]))); g.stroke();
  });
  for (let t = 0; t < twigs; t++) {
    const j = R.i(3, n - 2), [mx, my] = mid[j], s = R() < 0.5 ? 1 : -1, tl = R.r(24, 46);
    const tx = mx + (dx / l) * tl * 0.6 + nx * s * tl, ty = my + (dy / l) * tl * 0.6 + ny * s * tl;
    strokeLine(g, [mx, my, (mx + tx) / 2 + R.r(-4, 4), (my + ty) / 2 + R.r(-4, 4), tx, ty], 4 * LK + 3, LINE);
    strokeLine(g, [mx, my, (mx + tx) / 2 + R.r(-4, 4), (my + ty) / 2 + R.r(-4, 4), tx, ty], 3, BARK.base);
    strokeLine(g, [tx, ty, tx + R.r(-10, 10), ty + R.r(-14, -4)], 2, BARK.base);
  }
  return mid;
}
// a near tree (sprite coordinates: base centre at 0,0, up is negative).  v 0..2 plain trees (some with a watching
// knot-face), 3 the den's big frame tree.  Returns the knot-eyes [[x, y, r]] for the live blink.
function nearTree(g, v) {
  const seed = 91 + v * 37, big = v === 3;
  const hw0 = big ? 60 : 36 + v * 5, top = -400, lean = (v === 1 ? -30 : 26) * (big ? 1.4 : 1);
  const { L, R: Rr } = trunkPath(seed, hw0, big ? 38 : 24, top, lean);
  const out = flat(L.concat(Rr.slice().reverse()));
  const eyes = [];
  // claw roots gripping the ground, knuckled
  clawRoots(g, hw0, seed + 5, big ? 4 : 3);
  // boughs leaving the trunk up and out (on to the canopy), mossy
  const at0 = (k) => { const i = Math.round(k * (L.length - 1)); return [(L[i][0] + Rr[i][0]) / 2, L[i][1]]; };
  const bs = v === 1 ? -1 : 1, [b1x, b1y] = at0(big ? 0.55 : 0.58), [b2x, b2y] = at0(0.8);
  const m1 = bough(g, b1x, b1y, b1x + bs * 128, b1y - 140, -bs * 22, 14, 5, seed + 1, 2);
  const m2 = bough(g, b2x, b2y, b2x - bs * 110, b2y - 70, bs * 14, 10, 4, seed + 2, 1);
  ink(g, (g) => poly(g, out), BARK.base, 2.6, (g) => barkInner(g, L, Rr, seed, (at) => {
    // knots: a watching face on v 0 / 2, plain knots elsewhere
    if (v === 0 || v === 2) {
      const [ex, ey] = at(0.5, 0.36);
      knotHole(g, ex - 13, ey, 7, 5, -0.15); knotHole(g, ex + 13, ey - 1, 7, 5, 0.15);
      eyes.push([ex - 13, ey + 0.5, 2.6], [ex + 13, ey - 0.5, 2.6]);
      g.strokeStyle = BARK.knot; g.lineWidth = 3; curve(g, [ex - 12, ey + 26, ex, ey + 31, ex + 12, ey + 25]); g.stroke();
      g.strokeStyle = rgba(BARK.rim, 0.35); g.lineWidth = 1.2; curve(g, [ex - 18, ey - 12, ex - 12, ey - 15, ex - 6, ey - 12]); g.stroke(); curve(g, [ex + 6, ey - 13, ex + 12, ey - 16, ex + 18, ey - 13]); g.stroke();
    }
    const [kx, ky] = at(0.6, v === 1 ? 0.3 : 0.7); knotHole(g, kx, ky, 6, 9, 0.2);
    if (big || v === 1) { const [qx, qy] = at(0.35, 0.18); knotHole(g, qx, qy, 9, 6, -0.2); }
  }));
  // moss hanging off the boughs
  mossHang(g, m1[7][0], m1[7][1] + 6, 30, 70 + v * 12, seed + 11);
  mossHang(g, m2[6][0], m2[6][1] + 4, 22, 46, seed + 12);
  if (big) mossHang(g, m1[4][0], m1[4][1] + 8, 26, 56, seed + 13);
  return eyes;
}
// claw roots spreading from a trunk of base half-width hw0
function clawRoots(g, hw0, seed, n) {
  const Rn = mulberry(seed);
  for (const s of [-1, 1]) for (let k = 0; k < n; k++) {
    const x0 = s * hw0 * (0.35 + k * 0.32), reach = Rn.r(40, 82) + k * 10, x1 = s * (hw0 + reach), y1 = Rn.r(-1, 7), kn = Rn.r(-10, -4);
    const shape = (g) => { g.beginPath(); g.moveTo(x0 - s * 18, -44 + k * 10); g.quadraticCurveTo(lerp(x0, x1, 0.45), kn - 14, lerp(x0, x1, 0.7), kn); g.quadraticCurveTo(lerp(x0, x1, 0.9), kn + 2, x1, y1); g.quadraticCurveTo(lerp(x0, x1, 0.75), y1 - 2, x0 + s * 6, 4); g.closePath(); };
    ink(g, shape, BARK.base, 1.8, (g) => { g.save(); g.translate(-1, -3); shape(g); g.fillStyle = rgba(BARK.rim, 0.4); g.fill(); g.restore(); g.save(); g.translate(1, 2); shape(g); g.fillStyle = BARK.base; g.fill(); g.restore(); });
  }
}
// the bark inside a trunk outline: shade away from the moon, a broken moonlit rim on the right, grooves, cracks;
// knots(at) adds the knots (at(f, k): the point f across the trunk at height k)
function barkInner(g, L, Rr, seed, knots) {
  const at = (f, k) => { const i = Math.round(k * (L.length - 1)); return [lerp(L[i][0], Rr[i][0], f), L[i][1]]; };
  g.fillStyle = BARK.sh; g.beginPath(); for (let k = 0; k < L.length; k++) g.lineTo(lerp(L[k][0], Rr[k][0], 0.4), L[k][1]); for (let k = L.length - 1; k >= 0; k--) g.lineTo(L[k][0] - 4, L[k][1]); g.closePath(); g.fill();
  g.fillStyle = rgba(BARK.hi, 0.55); g.beginPath(); for (let k = 0; k < Rr.length; k++) g.lineTo(lerp(L[k][0], Rr[k][0], 0.9), Rr[k][1]); for (let k = Rr.length - 1; k >= 0; k--) g.lineTo(lerp(L[k][0], Rr[k][0], 0.68), Rr[k][1]); g.closePath(); g.fill();
  // the rim: one smooth moonlit stroke down the right edge, a softer one inside it
  const rim = []; for (let k = 0; k < Rr.length; k++) rim.push(lerp(L[k][0], Rr[k][0], 0.93), Rr[k][1]);
  g.strokeStyle = rgba(mix(BARK.rim, BARK.hi, 0.3), 0.7); g.lineWidth = 5; curve(g, rim); g.stroke();
  g.strokeStyle = rgba(BARK.rim, 0.35); g.lineWidth = 2; curve(g, rim.map((v, i) => (i % 2 ? v : v - 8))); g.stroke();
  g.lineWidth = 2;
  for (let s = 0; s < 8; s++) {
    const fx = 0.1 + s * 0.11 + (hash1(seed * 7 + s) - 0.5) * 0.06, pts = [];
    for (let k = 0; k < L.length; k++) pts.push(lerp(L[k][0], Rr[k][0], fx + Math.sin(k * 0.8 + s) * 0.04), L[k][1]);
    const k0 = Math.floor(hash1(seed + s * 3) * 4), k1 = L.length - Math.floor(hash1(seed + s * 5) * 5);
    g.strokeStyle = rgba(BARK.groove, s % 2 ? 0.75 : 0.5); curve(g, pts.slice(k0 * 2, k1 * 2)); g.stroke();
  }
  for (let c = 0; c < 6; c++) {   // short cross cracks
    const k = 2 + Math.floor(hash1(seed * 3 + c) * (L.length - 5)), f = 0.2 + hash1(seed * 5 + c) * 0.5;
    const [x, y] = at(f, k / (L.length - 1));
    g.strokeStyle = rgba(BARK.groove, 0.7); g.lineWidth = 1.6; polyline(g, [x - 8, y + 2, x, y - 1, x + 9, y + 3]); g.stroke();
  }
  knots(at);
}
// a living tree: a broad trunk with a big face; the arm is live (drawArm).  Returns the eyes [[x, y, r]].
function livingTree(g, v) {
  const seed = 400 + v * 53;
  const { L, R: Rr } = trunkPath(seed, 56, 36, -400, v ? -18 : 18);
  const out = flat(L.concat(Rr.slice().reverse()));
  clawRoots(g, 56, seed + 5, 4);
  const fy = FACE_Y - 366;   // (the face's centre, sprite coordinates: the base sits at screen y 366)
  const fi = Math.round((fy / -400) * (L.length - 1)), fcx = (L[fi][0] + Rr[fi][0]) / 2;
  const [b2x, b2y] = [(L[16][0] + Rr[16][0]) / 2, L[16][1]];
  const m2 = bough(g, b2x, b2y, b2x + (v ? 1 : -1) * 120, b2y - 60, 16, 12, 4, seed + 2, 2);
  ink(g, (g) => poly(g, out), mix(BARK.base, '#23283f', 0.5), 2.8, (g) => barkInner(g, L, Rr, seed, () => {
    // the face: a smoother plate of bark, heavy brows, deep eye hollows, a knobbly nose, a long mouth crack
    g.save(); g.translate(fcx, fy);
    g.fillStyle = rgba(BARK.hi, 0.14); g.beginPath(); g.ellipse(0, 14, 40, 54, 0, 0, TAU); g.fill();
    for (const s of [-1, 1]) {
      g.fillStyle = BARK.knot; g.beginPath(); g.ellipse(s * 20, 0, 11, 8, s * 0.15, 0, TAU); g.fill();
      g.strokeStyle = rgba(BARK.rim, 0.5); g.lineWidth = 1.4; g.beginPath(); g.ellipse(s * 20, 0, 13, 10, s * 0.15, 0.2, Math.PI - 0.2); g.stroke();
      ink(g, (g) => { g.beginPath(); g.moveTo(s * 4, -10); g.quadraticCurveTo(s * 20, -27, s * 40, -15); g.quadraticCurveTo(s * 22, -15, s * 6, -4); g.closePath(); }, BARK.hi, 1.6, (g) => { g.fillStyle = rgba(BARK.rim, 0.5); g.fillRect(s > 0 ? 6 : -40, -28, 34, 6); }, BARK.groove);
    }
    ink(g, (g) => { g.beginPath(); g.moveTo(-3, -4); g.quadraticCurveTo(-10, 18, -8, 26); g.quadraticCurveTo(0, 33, 9, 25); g.quadraticCurveTo(7, 12, 3, -4); g.closePath(); }, BARK.hi, 1.6, (g) => { g.fillStyle = BARK.sh; g.fillRect(1, -4, 10, 34); g.fillStyle = rgba(BARK.rim, 0.5); g.fillRect(-8, 6, 4, 18); }, BARK.groove);
    g.fillStyle = BARK.knot; g.beginPath(); g.moveTo(-27, 44); g.quadraticCurveTo(-4, 37, 27, 42); g.quadraticCurveTo(4, 58, -27, 44); g.closePath(); g.fill();
    g.strokeStyle = rgba(BARK.rim, 0.45); g.lineWidth = 1.3; curve(g, [-25, 51, 0, 60, 25, 49]); g.stroke();
    g.restore();
  }));
  // the shoulder the arm grows from (the arm itself is drawn live)
  ink(g, (g) => { g.beginPath(); g.ellipse(Rr[Math.round(((ARM_Y - 366) / -400) * (L.length - 1))][0] - 8, ARM_Y - 366, 17, 15, 0, 0, TAU); }, BARK.base, 2, (g) => { g.fillStyle = rgba(BARK.rim, 0.5); g.fillRect(-200, ARM_Y - 384, 400, 8); });
  mossHang(g, m2[7][0], m2[7][1] + 5, 30, 66, seed + 3);
  mossHang(g, (L[15][0] + Rr[15][0]) / 2 - 20, L[15][1], 34, 50, seed + 7);
  return [[fcx - 20, fy, 4.2], [fcx + 20, fy, 4.2]];
}
// the knot-eyes of a near tree / a living tree (sprite space: [[x, y, r]]), as nearTree / livingTree place them
function treeEyes(v) {
  if (v !== 0 && v !== 2) return [];
  const { L, R: Rr } = trunkPath(91 + v * 37, 36 + v * 5, 24, -400, 26);
  const i = Math.round(0.36 * (L.length - 1)), ex = lerp(L[i][0], Rr[i][0], 0.5), ey = L[i][1];
  return [[ex - 13, ey + 0.5, 2.6], [ex + 13, ey - 0.5, 2.6]];
}
function livingEyes(v) {
  const { L, R: Rr } = trunkPath(400 + v * 53, 56, 36, -400, v ? -18 : 18);
  const fy = FACE_Y - 366, fi = Math.round((fy / -400) * (L.length - 1)), fcx = (L[fi][0] + Rr[fi][0]) / 2;
  return [[fcx - 20, fy, 4.2], [fcx + 20, fy, 4.2]];
}
// the x of a living tree's shoulder (sprite space): on its right edge at ARM_Y
function shoulderX(v) { const { L, R: Rr } = trunkPath(400 + v * 53, 56, 36, -400, v ? -18 : 18); return Rr[Math.round(((ARM_Y - 366) / -400) * (L.length - 1))][0] - 8; }

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
  let warm = 0;
  const swipe = LIVING.map(() => 0);
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    if (!SHOULDER) SHOULDER = [0, 1].map((v) => shoulderX(v));
    // (built nearest first: under a memory cap the first caches keep the full scale -- the floor under the fighters
    //  stays sharp, the far layers are the ones stepped down)
    const fr = layerRange(0, LEVEL_LEN, P_FAR), mr = layerRange(0, LEVEL_LEN, P_MID), vr = layerRange(CAMP0 - 240, CAMP1 + 240, P_VISTA);
    c.ground = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawGround(g, xa, xb); });
    c.moon = makeSprite(108, 108, 54, 54, csFar, (g) => drawMoon(g));   // (small, built early: a sharp moon under a cap)
    c.wall = buildStrip(-10, LEVEL_LEN + 10, 230, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawWall(g, xa, xb); });
    // near trees and the living trees (their eyes kept for the live blink)
    setLS('near');
    // (the eyes come from treeEyes, not the paint: a sprite the memory cap refuses is painted live, later)
    c.trees = [0, 1, 2, 3].map((v) => ({ spr: makeSprite(v === 3 ? 360 : 300, 400, v === 3 ? 180 : 150, 384, cs, (g) => { setLS('near'); nearTree(g, v); }), eyes: treeEyes(v) }));
    c.living = [0, 1].map((v) => ({ spr: makeSprite(300, 400, 150, 384, cs, (g) => { setLS('near'); livingTree(g, v); }), eyes: livingEyes(v) }));
    c.near = NEAR_TREES.map((t) => ({ spr: c.trees[t.v].spr, x: t.x, y: 366 + (t.v === 3 ? 2 : 0), flip: t.flip, eyes: c.trees[t.v].eyes }));
    c.liv = LIVING.map((t) => ({ spr: c.living[t.v].spr, x: t.x, y: 366, eyes: c.living[t.v].eyes }));
    c.stones = makeSprite(130, 50, 65, 30, cs, (g) => { setLS('near'); fireRing(g); });
    c.mossFront = makeSprite(200, 260, 100, 0, cs, (g) => { setLS('front'); drawFrontMoss(g); });
    c.canopy = buildStrip(-10, LEVEL_LEN + 10, -6, 150, csFar, 1, (g, xa, xb) => { setLS('near'); drawCanopy(g, xa, xb); });
    // the den's arch of branches over the boss clearing (a sprite: it reaches down past the canopy strip)
    c.arch = makeSprite(860, 320, 430, 30, csFar, (g) => { setLS('near'); drawDenArch(g); });
    c.light = lightBand(-10, LEVEL_LEN + 10, 250, 470, '196,216,255', [[0, 0], [0.3, 0.1], [0.55, 0.15], [0.8, 0.07], [1, 0]], [0, 0], Math.min(cs, 0.5), (g) => {
      lightPool(g, (CAM_MAX + LEVEL_LEN) / 2, 420, 420, 90, '210,226,255', 0.16);
    });
    c.mid = buildStrip(mr[0], mr[1], 0, 372, csFar, P_MID, (g, xa, xb) => { setLS('mid'); drawMid(g, xa, xb); });
    c.vista = buildStrip(vr[0], vr[1], 150, 372, csFar, P_VISTA, (g, xa, xb) => { setLS('far'); drawVista(g, xa, xb, vr); });
    c.far = buildStrip(fr[0], fr[1], 120, 372, csFar, P_FAR, (g, xa, xb) => { setLS('far'); drawFar(g, xa, xb); });
    // glows and particles (soft: low scale)
    c.glowMoon = radialSprite(64, 0.5, [[0, 'rgba(225,235,255,0.55)'], [0.35, 'rgba(180,205,255,0.2)'], [1, 'rgba(150,180,255,0)']]);
    c.glowEye = radialSprite(32, 0.5, [[0, `rgba(${EYE.glow},0.85)`], [0.35, `rgba(${EYE.glow},0.3)`], [1, `rgba(${EYE.glow},0)`]]);
    c.glowFire = radialSprite(64, 0.5, [[0, 'rgba(255,190,90,0.7)'], [0.35, 'rgba(255,130,50,0.3)'], [1, 'rgba(255,100,40,0)']]);
    c.fog = radialSprite(64, 0.5, [[0, 'rgba(170,192,232,0.9)'], [0.55, 'rgba(160,184,228,0.45)'], [1, 'rgba(150,176,224,0)']]);
    c.mote = radialSprite(6, Math.max(1, cs), [[0, 'rgba(225,238,255,1)'], [0.4, 'rgba(200,220,255,0.6)'], [1, 'rgba(180,205,255,0)']]);
    c.leaf = makeSprite(14, 10, 7, 5, Math.max(1, cs), (g) => { ink(g, (g) => { g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(0, -5, 6, 0); g.quadraticCurveTo(0, 5, -6, 0); g.closePath(); }, '#2e3b52', 1, null, '#0b0f1f'); });
    return c;
  }

  // ------------------------------------------------------------------ deep layers
  function drawMoon(g) {
    const r = 44;
    ink(g, (g) => { g.beginPath(); g.arc(0, 0, r, 0, TAU); }, '#eef3ff', 0, (g) => {
      g.fillStyle = '#d5def3'; g.beginPath(); g.arc(12, 8, r, 0, TAU); g.arc(16, 6, r * 0.82, 0, TAU, true); g.fill();
      for (const [x, y, rr] of [[-14, -10, 9], [12, -18, 6], [6, 12, 11], [-20, 16, 5], [22, 4, 4]]) { g.fillStyle = rgba('#c2cde6', 0.8); g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); g.fillStyle = rgba('#ffffff', 0.5); g.beginPath(); g.arc(x - rr * 0.25, y - rr * 0.25, rr * 0.55, 0, TAU); g.fill(); }
    });
    g.strokeStyle = rgba('#b9c8ea', 0.8); g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
  }
  function ridge(g, xa, xb, base, amp, f, seed, col, rim) {
    const top = (x) => base - amp * (0.55 + 0.45 * Math.sin(x * f + seed)) * (0.7 + 0.6 * (vnoise(x, 140, seed) + 0.5)) - 26 * Math.abs(vnoise(x, 46, seed + 3));
    g.beginPath(); g.moveTo(xa - 4, 380); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, top(x)); g.lineTo(xb + 4, 380); g.closePath();
    g.fillStyle = col; g.fill();
    if (rim) { g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x + 2, top(x) + 1.5); g.strokeStyle = rim; g.lineWidth = 2; g.stroke(); }
    return top;
  }
  function pineRow(g, xa, xb, base, h, step, col, seed) {
    g.fillStyle = col;
    for (let i = Math.floor((xa - 40) / step); i * step < xb + 40; i++) {
      const x = i * step + hash1(i * 7 + seed) * step * 0.6, hh = h * (0.6 + hash1(i * 13 + seed) * 0.6), y = base + hash1(i * 3 + seed) * 10;
      g.beginPath(); g.moveTo(x - hh * 0.22, y + 6); g.lineTo(x - hh * 0.16, y - hh * 0.4); g.lineTo(x - hh * 0.08, y - hh * 0.38); g.lineTo(x, y - hh); g.lineTo(x + hh * 0.08, y - hh * 0.38); g.lineTo(x + hh * 0.16, y - hh * 0.4); g.lineTo(x + hh * 0.22, y + 6); g.closePath(); g.fill();
    }
  }
  function drawFar(g, xa, xb) {
    // two mountain ridges (moonlit snow on the high one), a far treeline, mist rising off it
    // (the strip starts at y 120: the ridges stay below ~150)
    const t1 = ridge(g, xa, xb, 262, 78, 0.0042, 1.3, '#1d3058', rgba('#7f98c8', 0.55));
    g.save(); g.beginPath(); g.moveTo(xa - 4, 380); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, t1(x)); g.lineTo(xb + 4, 380); g.closePath(); g.clip();
    vgrad(g, xa - 2, 150, xb - xa + 4, 250, [[0, 'rgba(150,175,225,0.28)'], [1, 'rgba(150,175,225,0)']]);
    g.restore();
    ridge(g, xa, xb, 290, 70, 0.0071, 4.2, '#172848', rgba('#3f5a8c', 0.6));
    vgrad(g, xa - 2, 230, xb - xa + 4, 330, [[0, 'rgba(110,140,190,0)'], [1, 'rgba(110,140,190,0.35)']]);
    pineRow(g, xa, xb, 330, 52, 15, '#111c36', 21);
    pineRow(g, xa, xb, 350, 40, 12, '#0e172e', 33);
    vgrad(g, xa - 2, 300, xb - xa + 4, 372, [[0, 'rgba(120,150,200,0)'], [1, 'rgba(120,150,200,0.4)']]);
  }
  // the view from the campsite ledge: treetops far below, the valley floor, a river under the moon, the village's lights
  function drawVista(g, xa, xb, vr) {
    // (no erasing here: a strip chunk the memory cap refuses is painted straight onto the frame -- so the ends are
    //  simply treetops, the same as the far treeline it meets)
    const mid = (vr[0] + vr[1]) / 2, half = (vr[1] - vr[0]) / 2;
    const ends = (x) => clamp(1 - Math.pow(Math.abs(x - mid) / (half - 60), 6), 0, 1);   // the valley's extent
    // the valley floor: a soft blue haze, dark fields in a patchwork, a moonlit river winding through
    const vy = (x) => lerp(372, 258 + 5 * Math.sin(x * 0.01), ends(x));
    const floor = (g) => { g.beginPath(); g.moveTo(xa - 4, 380); for (let x = al(xa, 8) - 8; x <= xb + 8; x += 8) g.lineTo(x, vy(x)); g.lineTo(xb + 4, 380); g.closePath(); };
    floor(g); g.fillStyle = '#1e3152'; g.fill();
    g.save(); floor(g); g.clip();
    vgrad(g, xa - 2, 250, xb - xa + 4, 300, [[0, 'rgba(120,150,205,0.45)'], [1, 'rgba(120,150,205,0)']]);
    for (let i = Math.floor((xa - 80) / 44); i * 44 < xb + 80; i++) for (let r = 0; r < 4; r++) {
      const x = i * 44 + hash2(i, r) * 20, y = 270 + r * 13 + hash2(r, i) * 5, w = 22 + hash2(i + 9, r) * 18;
      g.fillStyle = rgba(hash2(i, r + 5) > 0.5 ? '#2a4166' : '#18284a', 0.55); g.beginPath(); g.ellipse(x, y, w, 3.5 + r, 0, 0, TAU); g.fill();
    }
    g.beginPath(); for (let x = al(xa, 8) - 8; x <= xb + 8; x += 8) g.lineTo(x, 300 + 14 * Math.sin((x - mid) * 0.012) + 6 * Math.sin(x * 0.031));
    g.strokeStyle = rgba('#b8c9ea', 0.7); g.lineWidth = 3; g.stroke(); g.strokeStyle = rgba('#e6eeff', 0.6); g.lineWidth = 1.4; g.stroke();
    // the village, small and far: a cluster of roofs and warm windows, a church spire
    const vx = mid - half * 0.12;
    if (vx > xa - 120 && vx < xb + 120) {
      const R = mulberry(77);
      lightPool(g, vx, 290, 120, 26, '255,190,100', 0.45);
      for (let k = 0; k < 18; k++) {
        const x = vx + R.r(-70, 70), y = 291 + R.r(-5, 8) + Math.abs(x - vx) * 0.05, w = R.r(6, 10);
        g.fillStyle = '#2b2838'; poly(g, [x - w / 2, y, x - w / 2, y - 4, x, y - 8, x + w / 2, y - 4, x + w / 2, y]); g.fill();
      }
      for (let k = 0; k < 30; k++) { const x = vx + R.r(-80, 80), y = 288 + R.r(-6, 10); lightPool(g, x, y, 5, 5, '255,200,110', 0.8); g.fillStyle = '#ffe2a0'; g.fillRect(x - 1, y - 1, 2, 2); }
      g.fillStyle = '#2b2838'; g.fillRect(vx - 3, 274, 6, 16); poly(g, [vx - 4, 275, vx, 265, vx + 4, 275]); g.fill();
      g.fillStyle = '#ffd27a'; g.fillRect(vx - 1, 279, 2, 2.5);
    }
    g.restore();
    // the treetops just below the ledge, dark and soft (they run the layer's full width: its ends are only these)
    vgrad(g, xa - 2, 296, xb - xa + 4, 336, [[0, 'rgba(140,165,215,0)'], [1, 'rgba(140,165,215,0.35)']]);
    pineRow(g, xa, xb, 326, 34, 11, '#17233f', 51);
    pineRow(g, xa, xb, 340, 30, 9, '#111a33', 63);
    pineRow(g, xa, xb, 356, 30, 9, '#0d152b', 71);
    vgrad(g, xa - 2, 320, xb - xa + 4, 372, [[0, 'rgba(120,150,200,0)'], [1, 'rgba(120,150,200,0.3)']]);
  }
  function drawMid(g, xa, xb) {
    // gnarled trunks fading into the mist; none where the ledge opens the view
    const camp = layerRange(CAMP0 + 40, CAMP1 - 40, P_MID);
    for (let i = Math.floor((xa - 160) / 120); i * 120 < xb + 160; i++) {
      const x = i * 120 + hash1(i * 7 + 3) * 60;
      if (x > camp[0] + 40 && x < camp[1] - 40) continue;
      const w = 18 + hash1(i * 13) * 14, lean = (hash1(i * 5) - 0.5) * 50, seed = 600 + i;
      const { L, R: Rr } = trunkPath(seed, w, w * 0.65, -400, lean);
      g.save(); g.translate(x, 376);
      const out = flat(L.concat(Rr.slice().reverse()));
      poly(g, out); g.fillStyle = '#16213d'; g.fill();
      g.fillStyle = rgba('#4a679c', 0.55); g.beginPath(); for (let k = 0; k < Rr.length; k++) g.lineTo(Rr[k][0], Rr[k][1]); for (let k = Rr.length - 1; k >= 0; k--) g.lineTo(lerp(L[k][0], Rr[k][0], 0.82), Rr[k][1]); g.closePath(); g.fill();
      // a bough or two, and moss
      const by = -200 - hash1(i * 11) * 120, s = hash1(i * 17) > 0.5 ? 1 : -1;
      g.strokeStyle = '#16213d'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, by); g.quadraticCurveTo(s * 50, by - 40, s * 100, by - 110); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(s * 60, by - 60); g.quadraticCurveTo(s * 90, by - 50, s * 120, by - 70); g.stroke();
      if (hash1(i * 19) > 0.35) { g.fillStyle = rgba('#3b5554', 0.85); for (let k = 0; k < 5; k++) { const mx = s * (40 + k * 12), my = by - 30 - k * 12; g.fillRect(mx - 1.5, my, 3, 28 + hash1(i * 23 + k) * 40); } }
      // a dim pair of eye-knots on some
      if (hash1(i * 29) > 0.7) { g.fillStyle = '#0a1022'; g.beginPath(); g.ellipse(-6, -150, 4, 3, 0, 0, TAU); g.ellipse(6, -151, 4, 3, 0, 0, TAU); g.fill(); }
      g.restore();
    }
    // the mist the trunks stand in
    vgrad(g, xa - 2, 170, xb - xa + 4, 372, [[0, 'rgba(120,150,205,0)'], [0.55, 'rgba(120,150,205,0.32)'], [1, 'rgba(140,168,220,0.6)']]);
    // low bushes in the mist
    for (let i = Math.floor((xa - 60) / 46); i * 46 < xb + 60; i++) {
      const x = i * 46 + hash1(i * 31) * 20, r = 20 + hash1(i * 37) * 18;
      g.fillStyle = rgba('#26365c', 0.85); g.beginPath(); g.ellipse(x, 372, r * 1.4, r, 0, Math.PI, 0); g.fill();
    }
  }

  // ------------------------------------------------------------------ near: canopy, undergrowth, the floor
  function drawCanopy(g, xa, xb) {
    // gnarled boughs arching from tree to tree across the top, twigs and hanging moss (none over the open ledge)
    const anchors = NEAR_TREES.map((t) => t.x).concat(LIVING.map((t) => t.x)).sort((a, b) => a - b);
    for (let k = 0; k < anchors.length - 1; k++) {
      const a = anchors[k], b = anchors[k + 1];
      if (b < xa - 300 || a > xb + 300 || b - a > 520 || campK((a + b) / 2) > 0.1) continue;
      const h = hash1(a | 0), sag = 34 + h * 40, y0 = -14 + h * 18;
      const m = bough(g, a + 10, y0 - 6, b - 10, y0 - 10 + (hash1((b | 0) + 3) - 0.5) * 20, -sag, 13, 9, (a | 0) + 77, 3);
      // moss off the sag, a smaller crossing branch
      for (let j = 0; j < 3; j++) {
        if (hash1((a | 0) * 7 + j) < 0.35) continue;
        const [mx, my] = m[2 + j * 3];
        mossHang(g, mx, my + 8, 22 + hash1((a | 0) + j * 5) * 14, 28 + hash1((a | 0) + j) * 40, (a | 0) + j, 0.95);
      }
      if (h > 0.5) { const [cx, cy] = m[5]; bough(g, cx, cy, cx + 90 * (h > 0.75 ? 1 : -1), cy - 40, 10, 7, 3, (a | 0) + 99, 1); }
    }
  }
  // the den's arch over the clearing (sprite space: the clearing's centre at x 0, screen y as is): two great boughs
  // meeting high, framing the moon, moss hanging off them
  function drawDenArch(g) {
    for (const s of [-1, 1]) {
      const m = bough(g, s * 380, 230, s * 30, -20, s * 80, 36, 14, 900 + s, 3);
      mossHang(g, m[3][0], m[3][1] + 12, 36, 80, 901 + s * 3);
      mossHang(g, m[7][0], m[7][1] + 10, 30, 56, 905 + s * 5);
    }
  }
  function bush(g, x, y, w, h, seed, col = '#1c2742') {
    const R = mulberry(seed), pts = [x - w, y + 4];
    for (let k = 1; k < 8; k++) { const f = k / 8; pts.push(x - w + 2 * w * f + R.r(-6, 6), y - h * Math.sin(f * Math.PI) * R.r(0.75, 1.1)); }
    pts.push(x + w, y + 4, x, y + 8);
    ink(g, (g) => blob(g, pts), col, 1.6, (g) => {
      g.fillStyle = rgba('#5a76aa', 0.35); g.save(); g.translate(3, -4); blob(g, pts); g.restore(); g.save(); blob(g, pts); g.clip(); g.translate(-4, 6); blob(g, pts); g.fillStyle = col; g.fill(); g.restore();
    });
  }
  function fern(g, x, y, s, flip, col = '#253756') {
    g.save(); g.translate(x, y); g.scale(flip ? -s : s, s);
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.42, len = 34 - Math.abs(k - 2) * 5;
      const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(ex * 0.4, ey * 0.7, ex, ey); g.stroke();
      for (let j = 1; j < 6; j++) { const f = j / 6, px = ex * f * (0.4 + f * 0.6), py = ey * f * 0.85 + ey * f * f * 0.15; g.lineWidth = 1.6; g.beginPath(); g.moveTo(px, py); g.lineTo(px - 6 * (1 - f) - 2, py - 4); g.moveTo(px, py); g.lineTo(px + 6 * (1 - f) + 2, py - 4); g.stroke(); }
    }
    g.restore();
  }
  function mushroom(g, x, y, s) {
    ink(g, (g) => roundRect(g, x - 2 * s, y - 8 * s, 4 * s, 8 * s, 2), '#b8c6e0', 1);
    ink(g, (g) => { g.beginPath(); g.ellipse(x, y - 8 * s, 6 * s, 4 * s, 0, Math.PI, 0); g.closePath(); }, '#7fb4e8', 1.1, (g) => { g.fillStyle = rgba('#e8f6ff', 0.8); g.fillRect(x - 4 * s, y - 11 * s, 2 * s, 2 * s); });
  }
  function drawWall(g, xa, xb) {
    // the undergrowth along the lane's back edge: bushes, ferns, rocks, roots, glowing mushrooms; on the ledge a low
    // rocky rim and the drop to the treetops
    const rim = (x) => 334 + 7 * Math.sin(x * 0.03) + 8 * vnoise(x, 23, 4) + 30 * (1 - campK(x));
    for (let i = Math.floor((xa - 80) / 54); i * 54 < xb + 80; i++) {
      const x = i * 54 + hash1(i * 41) * 30, ck = campK(x);
      if (ck > 0.6) continue;
      const h = hash1(i * 43);
      if (h < 0.45) bush(g, x, 368, 34 + hash1(i * 47) * 30, (40 + hash1(i * 53) * 46) * (1 - ck), 700 + i);
      else if (h < 0.75) fern(g, x, 370, 0.9 + hash1(i * 59) * 0.6, hash1(i * 61) > 0.5);
      else { ink(g, (g) => blob(g, [x - 26, 372, x - 22, 350, x - 6, 340, x + 14, 344, x + 26, 360, x + 24, 372]), ROCK.sh, 1.6, (g) => { g.fillStyle = rgba(ROCK.hi, 0.5); g.fillRect(x - 6, 338, 26, 8); }); mossHang(g, x - 10, 344, 16, 8, 900 + i, 0.8); }
    }
    for (let i = Math.floor((xa - 30) / 70); i * 70 < xb + 30; i++) {
      const x = i * 70 + hash1(i * 71) * 40;
      if (campK(x) < 0.3 && hash1(i * 73) > 0.55) { mushroom(g, x, 370, 1); mushroom(g, x + 9, 371, 0.7); }
    }
    // the ledge: a rocky rim with a couple of boulders, the drop behind
    if (xb > CAMP0 - 200 && xa < CAMP1 + 200) {
      g.save(); g.beginPath(); g.rect(CAMP0 - 120, 220, CAMP1 - CAMP0 + 240, 160); g.clip();
      ink(g, (g) => { g.beginPath(); g.moveTo(xa - 4, 380); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, rim(x)); g.lineTo(xb + 4, 380); g.closePath(); }, ROCK.base, 1.8, (g) => {
        facets(g, xa, xb, 320, 380, ROCK, 61, 54, 18, 0.5, 0.7);
        vgrad(g, xa, 324, xb - xa, 372, [[0, 'rgba(190,210,250,0.3)'], [0.4, 'rgba(0,0,0,0)'], [1, 'rgba(20,28,50,0.3)']]);
      });
      for (const [x, w, h] of [[CAMP0 + 90, 46, 40], [FIRE - 190, 34, 26], [FIRE + 240, 52, 34], [CAMP1 - 120, 40, 44]]) {
        if (x < xa - 80 || x > xb + 80) continue;
        ink(g, (g) => blob(g, [x - w, 372, x - w * 0.9, 368 - h * 0.6, x - w * 0.3, 366 - h, x + w * 0.4, 368 - h * 0.9, x + w, 368 - h * 0.3, x + w, 372]), ROCK.base, 1.8, (g) => { g.fillStyle = ROCK.sh; g.fillRect(x + w * 0.1, 360 - h, w, h + 20); g.fillStyle = rgba(ROCK.hi, 0.6); g.fillRect(x - w * 0.6, 366 - h, w * 0.6, 6); });
      }
      // the camp: two log seats and the bedrolls by the fire
      for (const [x, w] of [[FIRE - 110, 70], [FIRE + 112, 64]]) {
        if (x < xa - 80 || x > xb + 80) continue;
        ink(g, (g) => roundRect(g, x - w / 2, 346, w, 18, 8), '#5a3f2c', 1.8, (g) => { g.fillStyle = '#3e2b1e'; g.fillRect(x - w / 2, 356, w, 8); g.fillStyle = rgba('#a07a56', 0.6); g.fillRect(x - w / 2 + 4, 348, w - 8, 3); });
        ink(g, (g) => { g.beginPath(); g.ellipse(x + w / 2 - 2, 355, 5, 9, 0, 0, TAU); }, '#8a6644', 1.4, (g) => { g.strokeStyle = '#5a3f2c'; g.lineWidth = 1; g.beginPath(); g.ellipse(x + w / 2 - 2, 355, 2.5, 5, 0, 0, TAU); g.stroke(); });
      }
      if (FIRE + 200 > xa - 80 && FIRE + 200 < xb + 80) {
        ink(g, (g) => roundRect(g, FIRE + 170, 352, 80, 14, 7), '#5f4a6e', 1.6, (g) => { g.fillStyle = '#8a6f9a'; g.fillRect(FIRE + 172, 352, 30, 14); g.strokeStyle = '#3a2c46'; g.lineWidth = 1.2; polyline(g, [FIRE + 202, 352, FIRE + 202, 366]); g.stroke(); });
      }
      g.restore();
    }
    // the den clearing: a fallen log and rocks along its back, a hollow under the frame tree's roots
    for (const [x, w, h] of [[CAM_MAX + 330, 40, 30], [LEVEL_LEN - 300, 46, 36]]) {
      if (x < xa - 80 || x > xb + 80) continue;
      ink(g, (g) => blob(g, [x - w, 372, x - w * 0.9, 368 - h * 0.6, x - w * 0.3, 366 - h, x + w * 0.4, 368 - h * 0.9, x + w, 368 - h * 0.3, x + w, 372]), ROCK.sh, 1.8, (g) => { g.fillStyle = rgba(ROCK.hi, 0.5); g.fillRect(x - w * 0.6, 366 - h, w * 0.6, 6); });
      mossHang(g, x - 6, 368 - h, 20, 12, x | 0, 0.9);
    }
    if (DEN + 160 > xa && DEN - 160 < xb) {
      // a fallen trunk lying along the back of the clearing: round, its bark, a snapped branch, its broken end
      const log = (g) => { g.beginPath(); g.moveTo(DEN - 160, 352); g.quadraticCurveTo(DEN - 168, 330, DEN - 140, 326); g.quadraticCurveTo(DEN, 318, DEN + 140, 326); g.lineTo(DEN + 140, 360); g.quadraticCurveTo(DEN, 366, DEN - 140, 362); g.closePath(); };
      ink(g, log, BARK.base, 2, (g) => {
        g.fillStyle = rgba(BARK.rim, 0.5); g.beginPath(); g.ellipse(DEN - 10, 326, 150, 5, -0.02, Math.PI, 0); g.fill();
        g.fillStyle = BARK.sh; g.fillRect(DEN - 170, 350, 320, 16);
        g.strokeStyle = BARK.groove; g.lineWidth = 1.6; for (let x = DEN - 130; x < DEN + 130; x += 36) { g.beginPath(); g.moveTo(x, 330); g.quadraticCurveTo(x + 18, 342, x + 8, 358); g.stroke(); }
      });
      ink(g, (g) => { g.beginPath(); g.ellipse(DEN + 140, 343, 11, 17, 0, 0, TAU); }, '#6a5444', 1.6, (g) => { g.strokeStyle = '#3a2c26'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(DEN + 140, 343, 6, 10, 0, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(DEN + 140, 343, 2.5, 4, 0, 0, TAU); g.stroke(); });
      bough(g, DEN - 70, 326, DEN - 104, 286, 6, 6, 3, 1721, 0);
      mossHang(g, DEN - 30, 324, 36, 20, 1717, 0.9); mossHang(g, DEN + 70, 326, 26, 16, 1719, 0.9);
    }
    // the ground fog lying over the undergrowth's feet
    vgrad(g, xa - 2, 330, xb - xa + 4, 372, [[0, 'rgba(150,175,225,0)'], [1, 'rgba(150,175,225,0.32)']]);
  }
  function drawGround(g, xa, xb) {
    vgrad(g, xa - 2, 352, xb - xa + 4, H, [[0, FLOOR.back], [0.12, '#3c4a6c'], [0.45, FLOOR.mid], [0.85, '#3f4c6e'], [1, FLOOR.front]]);
    // the worn path along the middle (lighter where feet have gone)
    g.save();
    for (let i = Math.floor((xa - 200) / 160); i * 160 < xb + 200; i++) {
      const x = i * 160 + hash1(i * 17) * 60, y = 430 + (hash1(i * 19) - 0.5) * 30, w = 120 + hash1(i * 23) * 80;
      g.fillStyle = rgba(FLOOR.path, 0.5); g.beginPath(); g.ellipse(x, y, w, 26, 0, 0, TAU); g.fill();
    }
    g.restore();
    // the ledge: bare granite slabs instead of earth
    if (xb > CAMP0 - 200 && xa < CAMP1 + 200) {
      const a = Math.max(xa, CAMP0 - 200), b = Math.min(xb, CAMP1 + 200);
      // (a ragged edge where the earth gives way to the rock, with tufts of grass along it)
      const xL = (y) => CAMP0 - 70 + 26 * Math.sin(y * 0.045) + 30 * vnoise(y, 17, 8) + (y - 440) * 0.25, xR = (y) => CAMP1 + 70 + 26 * Math.sin(y * 0.05 + 2) + 30 * vnoise(y, 19, 9) - (y - 440) * 0.25;
      const edge = (g) => { g.beginPath(); for (let y = 350; y <= H + 4; y += 6) g.lineTo(xL(y), y); for (let y = H + 4; y >= 350; y -= 6) g.lineTo(xR(y), y); g.closePath(); };
      edge(g); g.save(); g.clip();
      facets(g, a, b, 350, H + 4, { base: '#5d6884', sh: '#4a5470', hi: '#7a86a6', crack: '#2e3550' }, 83, 90, 44, 0.55, 0.7);
      vgrad(g, a, 352, b - a, H, [[0, 'rgba(25,32,55,0.35)'], [0.2, 'rgba(25,32,55,0)'], [0.8, 'rgba(25,32,55,0)'], [1, 'rgba(25,32,55,0.35)']]);
      g.restore();
      edge(g); g.strokeStyle = rgba('#232b44', 0.8); g.lineWidth = 2; g.stroke();
      for (let y = 360; y < H; y += 9) for (const x of [xL(y), xR(y)]) {
        if (x < xa - 10 || x > xb + 10) continue;
        g.strokeStyle = rgba('#4a6a72', 0.9); g.lineWidth = 1.4; polyline(g, [x - 4, y, x - 6, y - 7]); g.stroke(); polyline(g, [x, y, x + 1, y - 9]); g.stroke(); polyline(g, [x + 4, y, x + 7, y - 6]); g.stroke();
      }
    }
    // moonlight dapples through the canopy (not on the ledge: that's all moonlit)
    for (let i = Math.floor((xa - 120) / 130); i * 130 < xb + 120; i++) {
      const x = i * 130 + hash1(i * 29) * 80, y = 384 + hash1(i * 31) * 120;
      if (campK(x) > 0.3 || hash1(i * 37) < 0.3) continue;
      g.fillStyle = rgba('#8ea4cf', 0.22); g.beginPath(); g.ellipse(x, y, 30 + hash1(i * 41) * 30, 6 + hash1(i * 43) * 4, 0, 0, TAU); g.fill();
    }
    // roots snaking across the back and front edges, stones, fallen leaves, moss tufts
    for (let i = Math.floor((xa - 160) / 110); i * 110 < xb + 160; i++) {
      const x = i * 110 + hash1(i * 47) * 60, h = hash1(i * 53);
      if (campK(x) > 0.5) continue;
      if (h < 0.35) { const y = 368 + hash1(i * 59) * 14, l = 60 + hash1(i * 61) * 70; ink(g, (g) => { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l * 0.5, y - 8, x + l, y + 6); g.quadraticCurveTo(x + l * 0.5, y + 2, x, y + 8); g.closePath(); }, FLOOR.root, 1.4, (g) => { g.fillStyle = rgba(BARK.rim, 0.3); g.fillRect(x, y - 6, l, 4); }); }
      else if (h < 0.55) { const y = 520 + hash1(i * 67) * 10, l = 70 + hash1(i * 71) * 60; ink(g, (g) => { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l * 0.5, y - 12, x + l, y + 4); g.quadraticCurveTo(x + l * 0.5, y - 2, x, y + 10); g.closePath(); }, FLOOR.root, 1.4, (g) => { g.fillStyle = rgba(BARK.rim, 0.25); g.fillRect(x, y - 10, l, 4); }); }
    }
    for (let i = Math.floor(xa / 46) - 1; i * 46 < xb + 46; i++) {
      const x = i * 46 + hash1(i * 5) * 36, y = 380 + hash1(i * 9) * 140, h = hash1(i * 13);
      if (campK(x) > 0.5) { if (h < 0.18) { g.fillStyle = rgba('#2e3550', 0.6); polyline(g, [x - 14, y, x - 4, y - 2, x + 6, y + 2, x + 16, y - 1]); g.strokeStyle = rgba('#2e3550', 0.6); g.lineWidth = 1.2; g.stroke(); } continue; }
      if (h < 0.16) { ink(g, (g) => { g.beginPath(); g.ellipse(x, y, 7, 4.5, 0, 0, TAU); }, FLOOR.stone, 1.1, (g) => { g.fillStyle = FLOOR.stoneHi; g.fillRect(x - 4, y - 4, 6, 2); }); }
      else if (h < 0.4) { g.fillStyle = rgba(h < 0.28 ? '#28324a' : '#33405e', 0.85); g.save(); g.translate(x, y); g.rotate(h * 20); g.beginPath(); g.ellipse(0, 0, 5, 2.4, 0, 0, TAU); g.fill(); g.restore(); }
      else if (h < 0.5) { g.fillStyle = rgba(MOSS.base, 0.7); g.beginPath(); g.ellipse(x, y, 12, 3.5, 0, 0, TAU); g.fill(); g.fillStyle = rgba(MOSS.hi, 0.5); g.beginPath(); g.ellipse(x - 2, y - 1, 7, 1.6, 0, 0, TAU); g.fill(); }
    }
    // the clearing's floor: a soft round of moonlit grass
    if (xb > CAM_MAX && xa < LEVEL_LEN) {
      const cx = (CAM_MAX + LEVEL_LEN) / 2;
      g.fillStyle = rgba('#6d82ad', 0.25); g.beginPath(); g.ellipse(cx, 440, 420, 66, 0, 0, TAU); g.fill();
      for (let i = Math.floor(Math.max(xa, CAM_MAX) / 23); i * 23 < Math.min(xb, LEVEL_LEN); i++) {
        const x = i * 23 + hash1(i * 3) * 18, y = 392 + hash1(i * 7) * 110;
        if (((x - cx) / 400) ** 2 + ((y - 440) / 62) ** 2 > 1) continue;
        g.strokeStyle = rgba('#8aa0c8', 0.6); g.lineWidth = 1.2; polyline(g, [x - 3, y, x - 4, y - 7]); g.stroke(); polyline(g, [x, y, x + 1, y - 9]); g.stroke(); polyline(g, [x + 3, y, x + 5, y - 6]); g.stroke();
      }
    }
    // the back edge: a soft dark lip of earth / rock where the undergrowth meets the floor
    const lip = (x) => 360 + 3 * Math.sin(x * 0.05) + 2 * vnoise(x, 13, 2);
    g.fillStyle = rgba('#1a2238', 0.55); g.beginPath(); g.moveTo(xa - 4, 352); for (let x = al(xa, 5) - 5; x <= xb + 5; x += 5) g.lineTo(x, lip(x)); g.lineTo(xb + 4, 352); g.closePath(); g.fill();
    // the front edge: a dark band of roots and ferns (the ledge: the rock's lip and the drop)
    const fl = (x) => 526 + 3 * Math.sin(x * 0.04) + 3 * vnoise(x, 19, 6);
    ink(g, (g) => { g.beginPath(); g.moveTo(xa - 4, H + 4); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, fl(x)); g.lineTo(xb + 4, H + 4); g.closePath(); }, '#202a44', 1.6, (g) => {
      g.fillStyle = rgba('#5d7ab0', 0.35); g.beginPath(); for (let x = al(xa, 6) - 6; x <= xb + 6; x += 6) g.lineTo(x, fl(x) + 1); for (let x = al(xb, 6) + 6; x >= xa - 6; x -= 6) g.lineTo(x, fl(x) + 4); g.closePath(); g.fill();
    });
  }
  function fireRing(g) {
    for (let k = 0; k < 9; k++) {
      const a = Math.PI + (k / 8) * Math.PI, x = Math.cos(a) * 46, y = Math.sin(a) * 12 + 6;
      ink(g, (g) => { g.beginPath(); g.ellipse(x, y, 10, 7, 0, 0, TAU); }, ROCK.base, 1.4, (g) => { g.fillStyle = ROCK.hi; g.fillRect(x - 6, y - 7, 8, 3); });
    }
    for (const [a, l] of [[-0.35, 54], [0.3, 50], [0.05, 44]]) { g.save(); g.translate(0, 2); g.rotate(a); ink(g, (g) => roundRect(g, -l / 2, -6, l, 11, 5), '#5a3f2c', 1.5, (g) => { g.fillStyle = '#2a1c14'; g.fillRect(-10, -6, 20, 11); }); g.restore(); }
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * Math.PI, x = Math.cos(a) * 46, y = Math.sin(a) * 12 + 6;
      ink(g, (g) => { g.beginPath(); g.ellipse(x, y, 10, 7, 0, 0, TAU); }, ROCK.base, 1.4, (g) => { g.fillStyle = ROCK.hi; g.fillRect(x - 6, y - 7, 8, 3); });
    }
  }
  function drawFrontMoss(g) {
    // a gnarled bough end hanging in from the top, wispy moss clumps off it (a dark foreground silhouette)
    const b = (g) => { g.beginPath(); g.moveTo(-100, -12); g.quadraticCurveTo(-10, 26, 100, 4); g.lineTo(100, 22); g.quadraticCurveTo(-10, 50, -100, 14); g.closePath(); };
    ink(g, b, '#0f1322', 2.6, (g) => { g.fillStyle = rgba(BARK.rim, 0.3); g.fillRect(-100, 2, 200, 5); });
    const R = mulberry(4040);
    g.lineCap = 'round';
    for (const [cx, n, len] of [[-62, 7, 110], [0, 9, 150], [58, 6, 90]]) {
      const y = 22 + 8 * Math.sin((cx + 100) / 200 * Math.PI);
      for (let k = 0; k < n; k++) {
        const f = k / (n - 1), x = cx + (f - 0.5) * 34 + R.r(-3, 3), l = len * (0.35 + 0.65 * Math.sin(f * Math.PI)) * R.r(0.6, 1.05), wv = R.r(3, 6);
        const pts = []; for (let j = 0; j <= 7; j++) { const u = j / 7; pts.push(x + Math.sin(u * 6 + k) * wv * u + R.r(-1, 1), y + l * u); }
        g.strokeStyle = LINE; g.lineWidth = 5.5; curve(g, pts); g.stroke();
        g.strokeStyle = k % 2 ? '#24342f' : '#1c2a26'; g.lineWidth = 3.6; curve(g, pts); g.stroke();
        g.strokeStyle = rgba('#6d8f84', 0.45); g.lineWidth = 1.1; curve(g, pts.slice(0, 8)); g.stroke();
      }
    }
  }

  // ------------------------------------------------------------------ per frame
  function sky(ctx, camX, t, C) {
    const gr = ctx.createLinearGradient(0, 0, 0, 372);
    gr.addColorStop(0, SKY[0]); gr.addColorStop(0.35, SKY[1]); gr.addColorStop(0.75, SKY[2]); gr.addColorStop(1, SKY[3]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 380);
    for (const s of LAY.stars) {
      const x = ((s.x - camX * 0.03) % 1100 + 1100) % 1100 - 70;
      ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * s.sp + s.ph); ctx.fillStyle = '#dfe8ff'; ctx.fillRect(x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // the moon: framed by the den's arch on the boss screen
    const fk = sstep(CAM_MAX - 700, CAM_MAX, camX), mx = lerp(700 - camX * P_MOON, 480, fk), my = lerp(92, 78, fk);
    glowAt(ctx, C.glowMoon, mx, my, 200, 0.55); glowAt(ctx, C.glowMoon, mx, my, 90, 0.5);
    ctx.drawImage(C.moon.c, mx - C.moon.ox, my - C.moon.oy, C.moon.w, C.moon.h);
  }
  function fogPass(ctx, C, camX, t, layer, y0, y1, a) {
    for (const f of LAY.fog) {
      if (f.layer !== layer) continue;
      const x = ((f.x - camX * (layer ? 0.9 : 0.55) + t * f.sp) % 1400 + 1400) % 1400 - 220;
      ctx.globalAlpha = f.a * a; ctx.drawImage(C.fog.c, x - f.w / 2, lerp(y0, y1, (f.y - 250) / 100) - 34, f.w, 68);
    }
    ctx.globalAlpha = 1;
  }
  // knot-eyes that watch: dim amber pupils, each pair blinking on its own clock (eyes [[x, y, r]] in sprite space)
  function watchEyes(ctx, C, list, camX, t, gain = 1) {
    for (const o of list) {
      if (!o.eyes || !o.eyes.length) continue;
      const sx = o.x - camX;
      if (sx < -200 || sx > W + 200) continue;
      const seed = o.x | 0, per = 3 + hash1(seed) * 4, u = ((t + hash1(seed * 3) * 9) % per) / per;
      if (u > 0.94) continue;                                        // (a blink)
      const awake = o.wake || 0, open = awake > 0 ? awake : (hash1(seed * 7) < 0.55 || o.wake !== undefined ? 0.5 : 0);
      if (open <= 0) continue;
      for (const [ex, ey, r] of o.eyes) {
        const x = sx + (o.flip ? -ex : ex), y = o.y + ey;
        if (awake > 0) {   // awake: amber, glowing -- the warning
          glowAt(ctx, C.glowEye, x, y, r * 4.5 * (0.6 + awake * 0.6), 0.35 * awake * gain);
          ctx.fillStyle = awake > 0.7 ? EYE.hot : EYE.iris; ctx.globalAlpha = Math.min(1, awake * 1.3);
        } else { ctx.fillStyle = '#c8d6f2'; ctx.globalAlpha = 0.75; }   // asleep but watching: pale moonlit glints
        ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r * 0.55 * (0.4 + open * 0.6), 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
  function campfire(ctx, C, camX, t) {
    const x = FIRE - camX, y = 338;   // (well behind the lane's back edge: not in the fighters' way)
    if (x < -220 || x > W + 220) return;
    const f = 0.85 + 0.1 * Math.sin(t * 9) + 0.06 * Math.sin(t * 23 + 1);
    glowAt(ctx, C.glowFire, x, y + 40, 300 * f, 0.4, 90);     // the warm pool on the rock and the fighters
    glowAt(ctx, C.glowFire, x, y - 30, 160 * f, 0.55);
    ctx.drawImage(C.stones.c, Math.round((x - C.stones.ox) * S()) / S(), y - C.stones.oy, C.stones.w, C.stones.h);
    // the flames: layered tongues, flickering
    ctx.save(); ctx.translate(x, y + 2);
    for (const [col, k, w] of [['#e2552a', 1, 34], ['#ff9a32', 0.75, 24], ['#ffe08a', 0.45, 13]]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-w, 0);
      for (let j = 0; j <= 6; j++) {
        const u = j / 6, xx = lerp(-w, w, u), hh = (52 + 16 * Math.sin(t * 7 + j * 2.1) + 10 * Math.sin(t * 13 + j)) * k * (0.6 + 0.4 * Math.sin(u * Math.PI));
        ctx.lineTo(xx - 3, -hh * 0.55); ctx.lineTo(xx, -hh);
      }
      ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
    }
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(80,26,10,0.7)';
    ctx.restore();
    // sparks rising
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 10; k++) {
      const u = (t * (0.35 + hash1(k) * 0.3) + hash1(k * 3)) % 1, sx = x + Math.sin(t * 2 + k) * 14 * u + (hash1(k * 5) - 0.5) * 30, sy = y - 20 - u * 150;
      ctx.fillStyle = `rgba(255,${170 + (k % 3) * 25},80,${(1 - u) * 0.9})`; ctx.fillRect(sx, sy, 2.2, 2.2);
    }
    ctx.restore();
  }
  // a living tree's branch-arm: folded up at rest, raised on the wind-up, sweeping low across the lane on the strike
  function treeArm(ctx, T, k, camX, t) {
    const sx = T.x - camX;
    if (sx < -REACH - 200 || sx > W + REACH + 200) return;
    const shX = sx + SHOULDER[T.v], shY = ARM_Y, bandY = FLOOR_TOP + (T.band[0] + T.band[1]) / 2;
    let tipX, tipY, ctlX, ctlY;
    const rest = (lift) => { tipX = shX + lerp(96, 40, lift); tipY = shY + lerp(34, -170, lift) + Math.sin(t * 1.3 + T.x) * 4 * (1 - lift) + (lift > 0.5 ? Math.sin(t * 30) * 3 * lift : 0); ctlX = shX + lerp(70, 80, lift); ctlY = shY + lerp(-26, -60, lift); };
    if (k <= 0.35) rest(sstep(0.05, 0.35, k));
    else if (k < 0.7) {
      const u = (k - 0.35) / 0.35, e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
      tipX = lerp(sx - REACH, sx + REACH, e); tipY = bandY + 6 - Math.sin(e * Math.PI) * 6;
      if (u < 0.12) { const d = u / 0.12; tipX = lerp(shX + 40, sx - REACH, smooth(d)); tipY = lerp(shY - 170, bandY + 6, smooth(d)); }
      // (the elbow drops onto the band: the forearm lies flat along the stripe toward the tip)
      ctlX = lerp(shX, tipX, 0.5) + (tipX < shX ? 60 : -60); ctlY = bandY + 4;
      // the whoosh behind the tip
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(190,210,255,0.35)'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx - REACH + 10, bandY + 2); ctx.lineTo(Math.max(sx - REACH + 10, tipX - 14), tipY); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,236,190,0.5)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    } else { const u = sstep(0.7, 1, k); tipX = lerp(sx + REACH, shX + 96, u); tipY = lerp(bandY + 6, shY + 34, u); ctlX = lerp((shX + tipX) / 2, shX + 70, u); ctlY = lerp(Math.min(shY, tipY) - 60, shY - 26, u); }
    // the arm: a tapering gnarled branch, twig fingers at the tip
    const ang = Math.atan2(tipY - ctlY, tipX - ctlX);
    const arm = (g) => {
      const n = 12, Lp = [], Rp = [];
      for (let j = 0; j <= n; j++) {
        const u = j / n, x = (1 - u) * (1 - u) * shX + 2 * u * (1 - u) * ctlX + u * u * tipX, y = (1 - u) * (1 - u) * shY + 2 * u * (1 - u) * ctlY + u * u * tipY;
        const dx = 2 * (1 - u) * (ctlX - shX) + 2 * u * (tipX - ctlX), dy = 2 * (1 - u) * (ctlY - shY) + 2 * u * (tipY - ctlY), l = Math.hypot(dx, dy) || 1;
        const w = lerp(17, 5, u) + Math.sin(u * 14) * 2 + (Math.abs(u - 0.45) < 0.06 ? 3 : 0);
        Lp.push(x - (dy / l) * w, y + (dx / l) * w); Rp.unshift(x + (dy / l) * w, y - (dx / l) * w);
      }
      poly(g, Lp.concat(Rp));
    };
    const prevLS = [LINE, LK]; lineStyle('#06080f', 0.9);
    ink(ctx, arm, BARK.base, 2.6, (g) => { g.save(); g.translate(-2, -3); arm(g); g.fillStyle = rgba(BARK.rim, 0.45); g.fill(); g.restore(); arm(g); g.save(); g.translate(1, 3); g.fillStyle = BARK.base; arm(g); g.fill(); g.restore(); });
    ctx.save(); ctx.translate(tipX, tipY); ctx.rotate(ang);
    for (const [a, l] of [[-0.6, 22], [-0.15, 30], [0.35, 26], [0.8, 18]]) {
      ctx.save(); ctx.rotate(a); ink(ctx, (g) => { g.beginPath(); g.moveTo(-2, -3); g.quadraticCurveTo(l * 0.5, -5, l, 0); g.quadraticCurveTo(l * 0.5, 3, -2, 3); g.closePath(); }, BARK.base, 1.6); ctx.restore();
    }
    ctx.restore();
    lineStyle(prevLS[0], prevLS[1]);
  }
  // the warning shadow on the floor over the swipe's band (grows on the wind-up, darkest at the strike)
  function warnBand(ctx, T, k, camX, t) {
    const a = k < 0.35 ? sstep(0.03, 0.2, k) : k < 0.7 ? 1 : 1 - sstep(0.7, 0.85, k);
    if (a <= 0.01) return;
    const sx = T.x - camX, y0 = FLOOR_TOP + T.band[0], y1 = FLOOR_TOP + T.band[1], h = y1 - y0, x0 = sx - REACH, x1 = sx + REACH;
    if (x1 < -20 || x0 > W + 20) return;
    const pulse = k < 0.35 ? 0.75 + 0.25 * Math.sin(t * 14) : 1;
    ctx.save();
    roundRect(ctx, x0, y0 + 2, x1 - x0, h - 4, h / 2 - 2); ctx.clip();
    ctx.fillStyle = `rgba(255,140,10,${0.62 * a})`; ctx.fillRect(x0, y0, x1 - x0, h);   // (the fill stays orange; the chevrons pulse)
    // chevrons marching the way the arm will sweep (left to right)
    const step = 34, off = ((t * (k < 0.35 ? 60 : 160)) % step + step) % step;
    ctx.strokeStyle = `rgba(255,236,170,${0.85 * a * pulse})`; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let x = x0 - step + off; x < x1 + step; x += step) { ctx.beginPath(); ctx.moveTo(x - 7, y0 + h * 0.25); ctx.lineTo(x + 5, y0 + h * 0.5); ctx.lineTo(x - 7, y0 + h * 0.75); ctx.stroke(); }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = `rgba(120,60,10,${0.7 * a})`; ctx.lineWidth = 2.5; roundRect(ctx, x0, y0 + 2, x1 - x0, h - 4, h / 2 - 2); ctx.stroke();
    ctx.restore();
  }
  function particles(ctx, C, camX, t, layer) {
    const par = layer ? 1.3 : 0.8;
    for (const f of LAY.motes) {
      if (f.layer !== layer) continue;
      const sx0 = ((f.x - camX * par) % 1000 + 1000) % 1000 - 20;
      if (f.k < 0.55) {   // pale moon motes drifting
        const x = sx0 + Math.sin(t * f.fr + f.ph) * f.sw, y = f.y + Math.sin(t * 0.5 * f.fr + f.ph * 2) * 18;
        ctx.globalAlpha = (0.35 + 0.35 * Math.sin(t * 1.7 * f.fr + f.ph)) * (layer ? 0.8 : 0.6);
        const r = layer ? 4 : 2.6; ctx.drawImage(C.mote.c, x - r, y - r, r * 2, r * 2);
      } else {            // a dark leaf falling
        const y = ((f.y + t * 22 * f.sp) % 600 + 600) % 600 - 30, x = sx0 + Math.sin(t * f.fr * 2 + f.ph) * f.sw;
        ctx.globalAlpha = 0.85; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2 * f.fr + f.ph) * 0.9); ctx.drawImage(C.leaf.c, -C.leaf.ox, -C.leaf.oy, C.leaf.w, C.leaf.h); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    ctx.fillStyle = SKY[2]; ctx.fillRect(0, 0, W, H);
    sky(ctx, camX, t, C);
    drawStrip(ctx, C.far, camX, s);
    // the camp's vista: only through the ledge's opening (faded in over its edges in slices: clip + alpha, no compositing)
    const va = CAMP0 - 200 - camX, vb = CAMP1 + 200 - camX;
    if (vb > 0 && va < W) {
      const F = 160, n = 8;
      for (let k = -1; k < n * 2; k++) {
        const core = k < 0, x0 = core ? va + F : k < n ? va + (k * F) / n : vb - F + ((k - n) * F) / n, w = core ? vb - va - 2 * F : F / n;
        if (w <= 0 || x0 > W || x0 + w < 0) continue;
        ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, w + 0.5, 380); ctx.clip();
        ctx.globalAlpha = core ? 1 : k < n ? (k + 0.5) / n : 1 - (k - n + 0.5) / n;
        drawStrip(ctx, C.vista, camX, s); ctx.restore();
      }
    }
    drawStrip(ctx, C.mid, camX, s);
    fogPass(ctx, C, camX, t, 0, 230, 330, 1);
    // (the den's arch behind the frame trees: their trunks hide where its boughs grow from)
    { const ax = (CAM_MAX + LEVEL_LEN) / 2; if (ax - camX > -460 && ax - camX < W + 460) drawSprites(ctx, [{ spr: C.arch, x: ax, y: 0 }], camX, s); }
    drawSprites(ctx, C.near, camX, s);
    drawSprites(ctx, C.liv, camX, s);
    drawStrip(ctx, C.canopy, camX, s);
    fogPass(ctx, C, camX, t, 1, 300, 360, 0.9);
    drawStrip(ctx, C.wall, camX, s);
    drawStrip(ctx, C.ground, camX, s);
    ctx.globalCompositeOperation = 'screen'; drawStrip(ctx, C.light, camX, s); ctx.globalCompositeOperation = 'source-over';
    campfire(ctx, C, camX, t);
    watchEyes(ctx, C, C.near, camX, t);
    for (let i = 0; i < LIVING.length; i++) {
      const o = C.liv[i], k = swipe[i];
      o.wake = k > 0 ? Math.max(0.35, sstep(0.02, 0.3, k) * (k > 0.8 ? 1 - sstep(0.8, 1, k) * 0.6 : 1)) : 0;
      warnBand(ctx, LIVING[i], k, camX, t);
    }
    watchEyes(ctx, C, C.liv, camX, t, 1.4);
    for (let i = 0; i < LIVING.length; i++) treeArm(ctx, LIVING[i], swipe[i], camX, t);
    particles(ctx, C, camX, t, 0);
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0, opts) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    for (const wx of FRONT_MOSS) {
      const sx = frontX(wx, camX, P_FRONT);
      if (sx < -120 || sx > W + 120) continue;
      const spr = C.mossFront;
      ctx.globalAlpha = seeThrough(opts, sx - spr.ox, -8, spr.w, spr.h);
      ctx.drawImage(spr.c, Math.round((sx - spr.ox) * s) / s, -spr.oy - 8, spr.w, spr.h);
      ctx.globalAlpha = 1;
    }
    // a breath of ground fog rolling past at the front
    fogPass(ctx, C, camX * 1.2, t * 1.4, 1, 500, 540, 0.55);
    particles(ctx, C, camX, t, 1);
    ctx.restore();
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(10,14,30,0.4)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  /** a living tree's swipe (i: HOOKS.trees index, k 0..1; see the header) */
  function setTreeSwipe(i, k) { if (i >= 0 && i < swipe.length) swipe[i] = clamp(+k || 0, 0, 1); }
  return { setScale: st.setScale, setWarm, setTreeSwipe, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 60, h: 56, colors: ['#8a6440', '#5c3f26', '#47655e', '#2c423f'] },
  barrel: { w: 48, h: 60, colors: ['#7a5534', '#4f3520', '#47655e', '#4f5466'] },
  urn:    { w: 58, h: 52, colors: ['#5a4632', '#3a2c20', '#7fb4e8', '#b8c6e0'] },
};
const PMOSS = { base: '#5f8a74', sh: '#3f6252', hi: '#9cc4a8' };
function mossCap(g, pts) { ink(g, (g) => blob(g, pts), PMOSS.base, 1.6, (g) => { g.fillStyle = PMOSS.hi; g.fillRect(-60, pts[1] - 8, 120, 5); }); }
const PROP_DRAW = {
  crate(g) {   // an old traveller's crate, moss on the lid
    const wood = '#8a6440', woodSh = '#5c3f26', woodHi = '#b48a5c', woodDk = '#3e2a18', iron = '#4f5466';
    const L = -28, Rr = 24, T = -40, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), woodSh, 2.6);
    ink(g, (g) => poly(g, [L, T, Rr, T, Rr + dx, T + dy, L + dx, T + dy]), woodHi, 2.4);
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4; for (const y of [-14, -27]) { polyline(g, [L, y, Rr, y]); g.stroke(); }
      g.fillStyle = woodSh; g.fillRect(L, T, 6, 40); g.fillRect(Rr - 6, T, 6, 40);
      g.lineWidth = 6; g.strokeStyle = woodDk; polyline(g, [L + 7, -6, Rr - 7, T + 6]); g.stroke();
      g.lineWidth = 4; g.strokeStyle = woodHi; polyline(g, [L + 7, -6, Rr - 7, T + 6]); g.stroke();
      g.fillStyle = iron; for (const [x, y] of [[L, T], [Rr - 9, T], [L, -9], [Rr - 9, -9]]) g.fillRect(x, y, 9, 9);
    });
    mossCap(g, [L - 2, T + 1, L + 8, T - 6, Rr - 10, T - 9, Rr + dx, T + dy - 2, Rr - 2, T + 3, L + 10, T + 4]);
    for (const x of [L + 4, L + 16, Rr - 6]) ink(g, (g) => roundRect(g, x - 2, T + 2, 4, 9 + (x % 5), 2), PMOSS.sh, 1);
  },
  barrel(g) {  // a mossy barrel
    const wood = '#7a5534', woodSh = '#4f3520', woodHi = '#a87650', iron = '#4f5466', ironHi = '#8e94a8';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -52); g.quadraticCurveTo(-27, -26, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -26, 18, -52); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -60, 30, 66); g.fillStyle = woodHi; g.fillRect(-19, -54, 5, 58);
      g.strokeStyle = woodSh; g.lineWidth = 1.2; for (const k of [-0.5, -0.1, 0.3]) { g.beginPath(); g.moveTo(k * 18, -52); g.quadraticCurveTo(k * 27, -26, k * 18, 4); g.stroke(); }
      for (const y of [-44, -8]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.4); }
      g.fillStyle = rgba(PMOSS.base, 0.8); g.beginPath(); g.ellipse(-12, -2, 14, 7, 0, 0, TAU); g.fill();
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 18, 5.5, 0, 0, TAU); }, '#9a7048', 2.4, (g) => { g.fillStyle = PMOSS.base; g.beginPath(); g.ellipse(-4, -52, 10, 3.5, 0, 0, TAU); g.fill(); });
  },
  urn(g) {     // a hollow old stump with glowing blue mushrooms
    const wood = '#5a4632', sh = '#3a2c20', hi = '#8a6c4c';
    ink(g, (g) => { g.beginPath(); g.moveTo(-26, 2); g.lineTo(-22, -40); g.lineTo(-12, -44); g.lineTo(-4, -38); g.lineTo(6, -46); g.lineTo(16, -40); g.lineTo(22, -42); g.lineTo(26, 2); g.closePath(); }, wood, 2.8, (g) => {
      g.fillStyle = sh; g.fillRect(8, -48, 22, 52); g.fillStyle = hi; g.fillRect(-22, -42, 5, 44);
      g.strokeStyle = sh; g.lineWidth = 1.4; for (const x of [-12, -2, 10]) { polyline(g, [x, -36, x + 2, 0]); g.stroke(); }
      g.fillStyle = '#1a120c'; g.beginPath(); g.ellipse(0, -18, 7, 10, 0, 0, TAU); g.fill();
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -42, 20, 5, 0, 0, TAU); }, '#c9a878', 2, (g) => { g.strokeStyle = '#8a6c4c'; g.lineWidth = 1; g.beginPath(); g.ellipse(0, -42, 12, 3, 0, 0, TAU); g.stroke(); });
    for (const [x, y, s] of [[-24, -6, 1.2], [-30, 0, 0.9], [22, -14, 1], [28, -4, 1.3]]) {
      ink(g, (g) => roundRect(g, x - 2 * s, y - 8 * s, 4 * s, 9 * s, 2), '#cfdcf0', 1.4);
      ink(g, (g) => { g.beginPath(); g.ellipse(x, y - 8 * s, 7 * s, 5 * s, 0, Math.PI, 0); g.closePath(); }, '#7fb4e8', 1.8, (g) => { g.fillStyle = '#e8f6ff'; g.fillRect(x - 4 * s, y - 12 * s, 2.5 * s, 2 * s); });
    }
  },
};
