// Dodongo's Quest - Skull Island stage 3c "THE CELL OF SLOTH" (src/stages/sicell.js): background, floor, the barred cells, the fog.
//
// The book's chapter seven (docs/SKULL_ISLAND.md): an ancient stone prison inside the cliffs, a corridor of rusty barred cells, cobwebs and grey-green
// fog; the YAWN FOG (src/siworld.js: stand still and you get sleepy).  Three sections (world x):
//   corridor 0-1700 (cells with rusty bars, dim torches)  |  hall 1700-3800 (taller arches, heavier fog)  |  pit 3800-5400 (a round stone pit with a drain;
//   the boss arena is the last screen: the Sloth Beast rises from the drain; the last cell, open, holds a wedge of the Sun Key).
// Back-to-front (drawBack): the stone wall with its barred cells (cached) -> arches / ceiling and cobwebs (cached) -> the floor (cached) -> the wedge in its
// cell -> slime trails -> the fog (live) -> the vignette.  drawFront: a few cobwebs at the top corners.
// Setters: setFog(k 0..1), setWedge(k), setStory(bg).  Cached per scale (chunked strips, src/canvasmem.js); live: the fog, torch flames, drips.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, cacheCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 5400;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'corridor', name: 'The Barred Corridor', x0: 0, x1: 1700 },
  { id: 'hall', name: 'The Fog Hall', x0: 1700, x1: 3800 },
  { id: 'pit', name: 'The Sloth Pit', x0: 3800, x1: 5400 },
];
export const ARENAS = [450, 1500, 2500, 3400, CAM_MAX];
export const WAYSTONES = [1600];
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES };

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
// ~2048 device px wide.  ONE scale for the whole strip (never a seam between a sharp chunk and a soft one): every chunk is
// asked for at the stage's scale, then at each lower rung (all or none -- a refused rung gives its chunks back at once);
// a near strip (p >= 1) never goes below 0.5 -- painted live each frame instead (drawStrip; LIVE is set meanwhile)
const STRIP_RUNGS = [2, 1.5, 1.25, 1, 0.85, 0.75, 0.6, 0.5, 0.35, 0.25];
function buildStrip(lx0, lx1, y0, y1, sc, p, draw) {
  const cw = Math.max(256, Math.floor(2040 / sc) - 8);
  const paintOf = (xa, xb) => (g) => { g.lineJoin = 'round'; g.lineCap = 'round'; g.save(); g.beginPath(); g.rect(xa, y0, xb - xa, y1 - y0); g.clip(); draw(g, xa, xb); g.restore(); };
  const fill = (L, xa, xb) => {
    const paint = paintOf(xa, xb);
    if (!L) return { c: null, x: xa, xb, w: xb - xa, h: y1 - y0, paint };
    const c = track(L.c), g = L.g, s = L.sc;
    g.setTransform(s, 0, 0, s, -xa * s, -y0 * s);
    paint(g);
    return { c, x: xa, xb, s, w: c.width / s, h: c.height / s };
  };
  const spans = []; for (let x = lx0; x < lx1; x += cw) spans.push([x - 3, Math.min(lx1, x + cw) + 3]);
  const tryAt = (s2) => {   // (all the chunks at s2, or none)
    const got = [];
    for (const [xa, xb] of spans) { const r = cacheCanvas((xb - xa) * s2, (y1 - y0) * s2); if (!r) { for (const q of got) freeCanvases(q.c); return null; } got.push(r); }
    return got;
  };
  const lowest = p >= 1 ? Math.min(0.5, sc) : 0.25;
  let chunks = [];
  const make = (s2) => { const rs = s2 ? tryAt(s2) : null; chunks = spans.map(([xa, xb], i) => fill(rs ? { c: rs[i].c, g: rs[i].g, sc: s2 } : null, xa, xb)); return !!rs; };
  let ok = false;
  for (const s2 of [sc, ...STRIP_RUNGS.filter((v) => v < sc - 1e-6 && v >= lowest - 1e-6)]) if ((ok = make(s2))) break;
  if (!ok) make(0);
  const st = { chunks, y0, p };
  st.redo = (s2) => { for (const ch of st.chunks) if (ch.c) freeCanvases(ch.c); make(s2); st.chunks = chunks; };   // (every chunk again at scale s2, or painted live (0))
  return st;
}
// the near strips of one depth (the floor, the wall): one scale for them all, the highest every one of them can have -- the floor
// never hogs the memory while the wall it stands against goes soft (only when the cap gave them different scales)
const stripScale = (st) => { const c = st.chunks.find((ch) => ch.c); return c ? c.s : 0; };
function balanceStrips(list, sc) {
  const ss = list.map(stripScale);
  if (Math.max(...ss) - Math.min(...ss) < 0.01) return;
  for (const st of list) st.redo(0);
  for (const s2 of [sc, ...STRIP_RUNGS.filter((v) => v < sc - 1e-6 && v >= 0.5 - 1e-6)]) {
    let ok = true;
    for (const st of list) { st.redo(s2); if (Math.abs(stripScale(st) - s2) > 1e-6) { ok = false; break; } }
    if (ok) return;
    for (const st of list) st.redo(0);
  }
}
// LIVE: { dx } while drawStrip paints a chunk straight onto the frame (layer x + dx = screen x) -- a cut-out paints what shows
// through it instead of erasing (destination-out there would punch a hole through the whole frame)
let LIVE = null;
function drawStrip(ctx, st, camX, S) {
  const n = st.chunks.length, c0 = st.chunks[0], dx0 = Math.round((c0.x - camX * st.p) * (S || 1)) / (S || 1);   // (every chunk placed from the first one's snapped spot: joins land on the same device pixel, never a gap)
  for (let i = 0; i < n; i++) {
    const ch = st.chunks[i], sx = ch.x - camX * st.p;
    if (sx > W || sx + ch.w < 0) continue;
    const pL = i > 0 ? 3 : 0, pR = i < n - 1 ? 3 : 0;   // (the 3 px pads two chunks share: each shows only its own range -- nothing drawn twice, nothing overwritten)
    if (!ch.c) { ctx.save(); ctx.translate(sx - ch.x, 0); ctx.beginPath(); ctx.rect(ch.x + pL, st.y0 - 1, (ch.xb - ch.x) - pL - pR, ch.h + 2); ctx.clip(); LIVE = { dx: sx - ch.x }; try { ch.paint(ctx); } finally { LIVE = null; ctx.restore(); } continue; }
    const dx = dx0 + (ch.x - c0.x), k = ch.c.width / ch.w;
    if (!pL && !pR) ctx.drawImage(ch.c, dx, st.y0, ch.w, ch.h);
    else ctx.drawImage(ch.c, pL * k, 0, (ch.xb - ch.x - pL - pR) * k, ch.c.height, dx + pL, st.y0, ch.xb - ch.x - pL - pR, ch.h);
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
const GT0 = 340;                                  // the floor strip's top (screen y); heroes' floor begins at 362
const DRAIN_X = 4900, WEDGE_X = 5200;             // the pit's drain (the Sloth Beast rises from it) and the open cell with the third wedge
const STONE = { base: '#46524c', sh: '#2c3532', hi: '#6a7a70', deep: '#141a18', joint: '#0e1412' };
const IRON = { base: '#3e3a36', hi: '#7a7670', sh: '#24201e', rust: '#8a4a22' };
const LS = { far: ['#121816', 0.5], mid: ['#0e1412', 0.6], near: ['#0a100e', 0.8], front: ['#060a08', 0.9] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const ROWS = [362, 372, 385, 402, 424, 451, 484, 520, 546];
/** the yawn fog's density at world x (0..1): thin in the corridor, thick in the hall, thick at the pit (src/siworld.js stepCell: how fast a still hero gets sleepy) */
export function fogAt(x) { return 0.5 + 0.5 * sstep(1500, 2000, x) - 0.25 * sstep(3700, 3900, x); }

// what each cell holds, in turn (never two alike side by side): a straw bed and a moonlit window, the stores (barrels, a crate), chains and
// shackles on the wall, a flooded floor dripping, a cell whose door hangs open, one full of cobwebs, a stair going down into the dark
const CELL_KINDS = ['bed', 'stores', 'chains', 'flooded', 'open', 'webs', 'stair'];
// the pillars along the back wall (world x, width, section): the gaps between are the cells / alcoves
const LAY = (() => {
  const R = mulberry(5413);
  const pillars = [], torches = [], drips = [], motes = [];
  for (let x = 90; x < 1700; x += 260) pillars.push({ x, w: 44, sec: 0 });
  for (let x = 1840; x < 3800; x += 340) pillars.push({ x, w: 58, sec: 1 });
  for (const x of [3900, 4180, 4460, 4740, 5060, 5340]) pillars.push({ x, w: 54, sec: 2 });
  for (const p of pillars) torches.push({ x: p.x, y: 214, ph: R.r(0, TAU) });
  for (let i = 0; i < 16; i++) drips.push({ x: R.r(0, LEVEL_LEN), y0: R.r(40, 120), ph: R.r(0, 8), per: R.r(2.2, 4.4) });
  for (let i = 0; i < 18; i++) motes.push({ x: R.r(0, 1300), y: R.r(120, 420), sx: R.r(10, 30), ph: R.r(0, TAU), sp: R.r(0.2, 0.5) });
  return { pillars, torches, drips, motes };
})();

// ---------------------------------------------------------------------------------------------------------------
// SHARED DRAWING BITS
// ---------------------------------------------------------------------------------------------------------------
// ---- PAINT TEXTURE (shared by the Book 2 stages): a painterly value variation baked into the caches (costs nothing per frame) ----
// a small tile of soft light and dark blotches and fine brush grain, made once (a 1-off ~100 KB canvas, not a cache), laid over big fills
// through a world-anchored pattern so it runs on across chunk joins
let NOISE = null;
function noiseTile() {
  if (NOISE !== null) return NOISE;
  NOISE = false;
  try {
    const T = 192, c = document.createElement('canvas'); c.width = c.height = T;
    const g = c.getContext('2d'); if (!g) return NOISE;
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, T, T);
    const R = mulberry(9157);
    for (let i = 0; i < 70; i++) {   // (soft blotches, wrapped at the edges so the tile repeats seamlessly)
      const x = R() * T, y = R() * T, r = R.r(14, 46), v = R() < 0.5 ? 0 : 255, a = R.r(0.08, 0.22);
      for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, `rgba(${v},${v},${v},${a})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
        g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
    g.lineCap = 'round';
    for (let i = 0; i < 260; i++) {   // (brush grain: short soft strokes, mostly one way)
      const x = R() * T, y = R() * T, l = R.r(4, 12), an = -0.5 + R.r(-0.35, 0.35), v = R() < 0.5 ? 40 : 220;
      g.strokeStyle = `rgba(${v},${v},${v},${R.r(0.05, 0.14)})`; g.lineWidth = R.r(1, 2.4);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke();
    }
    NOISE = c;
  } catch { NOISE = false; }
  return NOISE;
}
// lay the paint texture over a rectangle (world coords): a = its strength; 'overlay' keeps the fill's hue, only its values move
function mottle(g, x, y, w, h, a = 0.35, scale = 1) {
  const t = noiseTile(); if (!t || a <= 0) return;
  let pat = null; try { pat = g.createPattern(t, 'repeat'); } catch { pat = null; }
  if (!pat) { NOISE = false; return; }   // (WebKit, its canvas memory spent: createPattern throws -- the texture skipped from now on: QAF_tech N1)
  if (scale !== 1 && pat.setTransform) pat.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = a; g.fillStyle = pat; g.fillRect(x, y, w, h); g.restore();
}
// ambient occlusion: a soft dark band hugging an edge (where two things meet), x0..x1 at y, 'up' or 'down' from it
function aoBand(g, x0, x1, y, depth, dir = 1, a = 0.35) {
  const gr = g.createLinearGradient(0, y, 0, y + dir * depth); gr.addColorStop(0, `rgba(6,2,12,${a})`); gr.addColorStop(1, 'rgba(6,2,12,0)');
  g.fillStyle = gr; g.fillRect(x0, Math.min(y, y + dir * depth), x1 - x0, depth);
}
// ---- end PAINT TEXTURE ----
function keyRays(ctx, r, rs, a0, a1, fill, line) {   // (book2/panels/sunkey_canon.png: 12 equal rays, a ray every 30 deg from 12 o'clock -- one along each cut line)
  for (let k = 0; k < 12; k++) {
    let a = -Math.PI / 2 + k * Math.PI / 6; const hw = 0.085, r1 = r * 0.86;
    while (a < a0 - 0.3) a += TAU; while (a > a1 + 0.3) a -= TAU;
    if (a + hw < a0 - 1e-6 || a - hw > a1 + 1e-6) continue;
    ctx.beginPath(); ctx.moveTo(Math.cos(a - hw) * rs * 1.04, Math.sin(a - hw) * rs * 1.04); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a + hw) * rs * 1.04, Math.sin(a + hw) * rs * 1.04); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke();
  }
}
// the Sun Key's piece from the cell (book2/panels/sunkey_canon.png: the disc's upper-left sector, 8 to 12 o'clock, the face's left eye on it); origin
// the disc's centre (the piece's point), r the disc's radius
const KEY_A0 = Math.PI * 5 / 6, KEY_A1 = Math.PI * 1.5;
function drawKeyPiece(ctx, r) {
  const rs = r * 0.36, slice = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, KEY_A0, KEY_A1); ctx.closePath(); };
  ctx.save(); ctx.translate(r * 0.04, r * 0.07); slice(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  const gr = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r); gr.addColorStop(0, '#ffd85a'); gr.addColorStop(1, '#e0a22a');
  slice(); ctx.fillStyle = gr; ctx.fill();
  ctx.save(); slice(); ctx.clip();
  ctx.strokeStyle = 'rgba(140,90,16,0.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, KEY_A0, KEY_A1); ctx.stroke();
  keyRays(ctx, r, rs, KEY_A0, KEY_A1, '#ffe690', 'rgba(90,56,10,0.9)');
  const fg = ctx.createRadialGradient(-rs * 0.3, -rs * 0.3, 0, 0, 0, rs); fg.addColorStop(0, '#ffeaa0'); fg.addColorStop(1, '#eeb040');
  ctx.beginPath(); ctx.arc(0, 0, rs, 0, TAU); ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = 'rgba(70,40,8,0.95)'; ctx.lineWidth = 1.6; ctx.stroke();
  { const ex = Math.cos(-2.52) * rs * 0.52, ey = Math.sin(-2.52) * rs * 0.52; ctx.fillStyle = '#2a1a0a'; ctx.beginPath(); ctx.ellipse(ex, ey + 1, rs * 0.11, rs * 0.08, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#8a4a1a'; ctx.lineWidth = Math.max(1.2, rs * 0.08); ctx.beginPath(); ctx.arc(ex, ey + rs * 0.06, rs * 0.2, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke(); }   // (the left eye)
  ctx.fillStyle = 'rgba(255,255,240,0.7)'; ctx.beginPath(); ctx.ellipse(-r * 0.5, -r * 0.4, r * 0.06, r * 0.12, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
  slice(); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
}
// a cobweb in a corner (cx, cy = the corner; dir = which way it opens): radial threads and sagging arcs
function cobweb(g, cx, cy, sx, sy, r, seed) {
  g.save(); g.translate(cx, cy); g.scale(sx, sy);
  g.strokeStyle = 'rgba(230,240,235,0.5)'; g.lineWidth = 1.1; g.lineCap = 'round';
  for (let k = 0; k <= 4; k++) { const a = (k / 4) * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); }
  for (let ring = 1; ring <= 4; ring++) { const rr = r * ring / 4.4; g.beginPath(); for (let k = 0; k <= 4; k++) { const a = (k / 4) * Math.PI / 2, q = rr * (1 - 0.1 * Math.sin(k * 2 + seed)); const px = Math.cos(a) * q, py = Math.sin(a) * q; if (k) g.quadraticCurveTo(Math.cos(a - 0.2) * rr * 0.84, Math.sin(a - 0.2) * rr * 0.84, px, py); else g.moveTo(px, py); } g.stroke(); }
  g.restore();
}
// a chain hanging between two points: alternating link ovals (one seen flat, the next edge-on) along a sagging curve
function chainLinks(g, x0, y0, x1, y1, sag, col = '#4a4a50') {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(3, Math.round(L / 7));
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag;
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n, a1 = 1 - u, x = a1 * a1 * x0 + 2 * a1 * u * mx + u * u * x1, y = a1 * a1 * y0 + 2 * a1 * u * my + u * u * y1;
    const dx = 2 * a1 * (mx - x0) + 2 * u * (x1 - mx), dy = 2 * a1 * (my - y0) + 2 * u * (y1 - my), an = Math.atan2(dy, dx);
    g.save(); g.translate(x, y); g.rotate(an);
    if (k % 2) { g.strokeStyle = LINE; g.lineWidth = 4.4; g.beginPath(); g.moveTo(-4.4, 0); g.lineTo(4.4, 0); g.stroke(); g.strokeStyle = col; g.lineWidth = 2.2; g.stroke(); }
    else { g.strokeStyle = LINE; g.lineWidth = 3.6; g.beginPath(); g.ellipse(0, 0, 5, 3, 0, 0, TAU); g.stroke(); g.strokeStyle = col; g.lineWidth = 1.8; g.stroke(); g.strokeStyle = 'rgba(200,200,190,0.35)'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(0, -0.6, 4.4, 2.4, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    g.restore();
  }
}
// rusty iron bars in an arched opening (xL..xR, the arch's top yTopA, its foot yBot): dark gunmetal rods with rust dabs, all inside the
// arch (clipped to it), a curved top rail under the arch, two bands, a lock plate; some rods bent or missing; o.bent: two rods bowed wide apart
function bars(g, xL, xR, yTopA, yBot, seed, o = {}) {
  const r = (xR - xL) / 2, cx = (xL + xR) / 2, cy = yTopA + r;
  g.save(); archPath(g, xL - 1, xR + 1, yBot + 2, yTopA - 1); g.clip();
  const gap = 16, n = Math.max(2, Math.round((xR - xL) / gap)), step = (xR - xL) / n;
  const mid = Math.round(n / 2);
  for (let i = 1; i < n; i++) {
    const x = xL + i * step, h = hash2(seed, i + 3);
    if (h < 0.05 && i > 1 && i < n - 1 && !o.whole) continue;   // (a rod rusted away)
    let bend = h > 0.93 && i > 1 && i < n - 1 && !o.whole ? (h > 0.965 ? 9 : -9) : 0;
    if (o.bent && (i === mid || i === mid - 1)) bend = i === mid ? 22 : -22;   // (two rods prised wide apart)
    const yt = cy - Math.sqrt(Math.max(0, r * r - (x - cx) ** 2)) - 2, wk = o.v === 2 && Math.abs(x - cx) < 28, yBotI = wk ? lerp(cy, yBot, 0.32) : yBot, ym = (yt + yBotI) / 2 + (o.bent ? 20 : 0);   // (over the wicket the big gate's bars stop at its top)
    g.lineCap = 'round';
    g.strokeStyle = LINE; g.lineWidth = 6 * LK + 1.6; g.beginPath(); g.moveTo(x, yt); g.quadraticCurveTo(x + bend, ym, x, yBotI); g.stroke();
    g.strokeStyle = mix(IRON.base, IRON.sh, hash2(seed, i + 40) * 0.5); g.lineWidth = 3.6; g.stroke();
    g.strokeStyle = rgba(IRON.hi, 0.45); g.lineWidth = 1.1; g.beginPath(); g.moveTo(x - 1, yt + 2); g.quadraticCurveTo(x - 1 + bend, ym, x - 1, yBotI - 2); g.stroke();
    for (let q = 0; q < 2; q++) { const ry = lerp(yt, yBot, 0.2 + 0.6 * hash2(seed, i * 7 + q + 90)), rb = bend * (1 - Math.abs((ry - ym) / ((yBot - yt) / 2 + 1))) * 0.9; g.fillStyle = rgba(IRON.rust, 0.65); g.beginPath(); g.ellipse(x + rb, ry, 1.8, 3 + hash2(seed, i + q + 95) * 4, 0, 0, TAU); g.fill(); }   // (rust)
  }
  g.lineCap = 'butt';
  g.strokeStyle = LINE; g.lineWidth = 7 * LK + 1.6; g.beginPath(); g.arc(cx, cy, r - 3, Math.PI, 0); g.stroke(); g.strokeStyle = IRON.base; g.lineWidth = 4.4; g.stroke();   // (the curved top rail)
  g.strokeStyle = rgba(IRON.hi, 0.4); g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, r - 4.6, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  for (const f of o.v === 1 ? [0.25, 0.5, 0.72, 0.9] : [0.5, 0.9]) {   // (v 1: a lattice -- more rails)
    const y = lerp(cy, yBot, f);
    const gap = o.v === 2 && y > lerp(cy, yBot, 0.32) ? [cx - 28, cx + 28] : null;   // (the wicket's door: the big gate's rails stop at its frame)
    const railP = (dy) => { g.beginPath(); if (gap) { g.moveTo(xL - 3, y + dy); g.lineTo(gap[0], y + dy); g.moveTo(gap[1], y + dy); g.lineTo(xR + 3, y + dy); } else { g.moveTo(xL - 3, y + dy); g.lineTo(xR + 3, y + dy); } };
    g.strokeStyle = LINE; g.lineWidth = 7 * LK + 1.6; railP(0); g.stroke();
    g.strokeStyle = IRON.base; g.lineWidth = 4.4; g.stroke(); g.strokeStyle = rgba(IRON.hi, 0.4); g.lineWidth = 1.2; railP(-1.4); g.stroke();
    for (let q = 0; q < 3; q++) { g.fillStyle = rgba(IRON.rust, 0.6); g.fillRect(xL + hash2(seed, q + 120 + f * 10) * (xR - xL), y - 2, 4 + hash2(seed, q + 130) * 6, 4); }
  }
  if (o.v === 1) {   // (the lattice gate braced: a diagonal strap from its foot to its upper rail)
    const ya = lerp(cy, yBot, 0.9), yb = lerp(cy, yBot, 0.25), dg = () => { g.beginPath(); g.moveTo(xL + 2, ya); g.lineTo(xR - 2, yb); };
    g.strokeStyle = LINE; g.lineWidth = 7 * LK + 1.6; dg(); g.stroke(); g.strokeStyle = IRON.base; g.lineWidth = 4.4; g.stroke();
    g.strokeStyle = rgba(IRON.hi, 0.4); g.lineWidth = 1.2; g.save(); g.translate(0, -1.4); dg(); g.stroke(); g.restore();
    for (const f of [0.18, 0.5, 0.82]) { g.fillStyle = '#1a1612'; g.beginPath(); g.arc(lerp(xL + 2, xR - 2, f), lerp(ya, yb, f), 1.8, 0, TAU); g.fill(); }   // (its rivets)
  }
  if (o.v === 2) {   // (a wicket: a small gate in the big one, its frame and hinges, a chain wrapped through it with a padlock)
    const wx0 = cx - 26, wx1 = cx + 26, wy0 = lerp(cy, yBot, 0.32), wy1 = yBot;
    for (const fx of [0.25, 0.5, 0.75]) { const x = lerp(wx0, wx1, fx); g.strokeStyle = LINE; g.lineWidth = 5 * LK + 1.4; g.beginPath(); g.moveTo(x, wy0); g.lineTo(x, wy1); g.stroke(); g.strokeStyle = IRON.base; g.lineWidth = 3; g.stroke(); }   // (its own rods)
    { const my = (wy0 + wy1) / 2; g.strokeStyle = LINE; g.lineWidth = 5 * LK + 1.4; g.beginPath(); g.moveTo(wx0, my); g.lineTo(wx1, my); g.stroke(); g.strokeStyle = IRON.base; g.lineWidth = 3; g.stroke(); }   // (and a rail)
    g.strokeStyle = LINE; g.lineWidth = 7 * LK + 1.6; g.strokeRect(wx0, wy0, wx1 - wx0, wy1 - wy0); g.strokeStyle = IRON.base; g.lineWidth = 4; g.strokeRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    for (const hy of [wy0 + 12, wy1 - 16]) { ink(g, (g) => { g.beginPath(); g.rect(wx0 - 7, hy, 12, 6); }, IRON.sh, 1.6); }
    { const ca = lerp(wy0, wy1, 0.3), cb = lerp(wy0, wy1, 0.5), ly = lerp(wy0, wy1, 0.6);   // (the chain wrapped round the wicket's free edge and the frame, the padlock under it: on the wicket, at any height)
      g.strokeStyle = LINE; g.lineWidth = 5; g.beginPath(); g.moveTo(wx1 - 6, ca); g.quadraticCurveTo(wx1 + 7, (ca + cb) / 2, wx1 - 4, cb); g.stroke(); g.strokeStyle = '#6a6a70'; g.lineWidth = 2.6; g.setLineDash([3, 2]); g.stroke(); g.setLineDash([]);
      ink(g, (g) => { g.beginPath(); g.arc(wx1 - 2, ly + 5, 7, 0, TAU); }, '#8a7a5a', 2); g.strokeStyle = LINE; g.lineWidth = 2.4; g.beginPath(); g.arc(wx1 - 2, ly - 2, 5, Math.PI, 0); g.stroke(); }
  } else if (o.v === 3) {   // (boarded: two old planks nailed across the bars)
    for (const [ya, yb2] of [[lerp(cy, yBot, 0.35), lerp(cy, yBot, 0.55)], [lerp(cy, yBot, 0.7), lerp(cy, yBot, 0.62)]]) {
      ink(g, (g) => { g.beginPath(); g.moveTo(xL - 4, ya - 8); g.lineTo(xR + 4, yb2 - 8); g.lineTo(xR + 4, yb2 + 8); g.lineTo(xL - 4, ya + 8); g.closePath(); }, '#5a4430', 2.2, (g) => { g.fillStyle = 'rgba(255,230,190,0.18)'; g.beginPath(); g.moveTo(xL - 4, ya - 8); g.lineTo(xR + 4, yb2 - 8); g.lineTo(xR + 4, yb2 - 5); g.lineTo(xL - 4, ya - 5); g.closePath(); g.fill(); g.strokeStyle = 'rgba(20,12,6,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(xL, ya); g.lineTo(xR, yb2 + 1); g.stroke(); });
      for (const fx of [0.08, 0.92]) { g.fillStyle = '#1a1612'; g.beginPath(); g.arc(lerp(xL, xR, fx), lerp(ya, yb2, fx), 2, 0, TAU); g.fill(); }
    }
  } else if (o.v === 4) {   // (a round padlock hung on a ring)
    const ly = lerp(cy, yBot, 0.58); g.strokeStyle = LINE; g.lineWidth = 3.4; g.beginPath(); g.arc(cx, ly, 6, Math.PI, 0); g.stroke(); g.strokeStyle = '#8a8a90'; g.lineWidth = 1.8; g.stroke();
    ink(g, (g) => { g.beginPath(); g.arc(cx, ly + 9, 9, 0, TAU); }, '#7a6a4a', 2, (g) => { g.fillStyle = 'rgba(255,240,200,0.3)'; g.beginPath(); g.arc(cx - 3, ly + 6, 3, 0, TAU); g.fill(); g.fillStyle = '#1a1612'; g.fillRect(cx - 1, ly + 8, 2, 5); });
  } else if (!o.noLock) { const ly = lerp(cy, yBot, 0.6); ink(g, (g) => roundRect(g, cx - 9, ly, 18, 16, 3), IRON.sh, 2); g.fillStyle = '#8a7a5a'; g.beginPath(); g.arc(cx, ly + 6, 2.4, 0, TAU); g.fill(); }
  g.restore();
  for (let i = 0; i < 3; i++) { const x = xL + hash2(seed, i + 70) * (xR - xL); g.fillStyle = 'rgba(138,74,34,0.16)'; g.fillRect(x, yBot - 40 - hash2(seed, i + 80) * 30, 3, 40 + hash2(seed, i + 80) * 30); }   // (rust streaks down the stone under them)
}
// a barred door swung open on its hinge (xH: the hinge side, d: which way it swings), seen nearly edge-on: foreshortened, sagging, its lock
// plate on the free edge, its shadow on the floor
function swungDoor(g, xH, yTopA, yBot, d, seed) {
  const top = yTopA + 46, lw = 58, sag = 12;
  const P = [xH, top, xH - d * lw, top + 10, xH - d * lw, yBot + sag, xH, yBot];
  g.fillStyle = 'rgba(4,8,6,0.4)'; g.beginPath(); g.ellipse(xH - d * lw * 0.5, yBot + 8, lw * 0.8, 6, 0, 0, TAU); g.fill();   // (its shadow)
  g.save(); poly(g, P); g.clip();
  g.strokeStyle = LINE; g.lineWidth = 4.6; for (let k = 1; k < 5; k++) { const u = k / 5, x = xH - d * lw * u; g.beginPath(); g.moveTo(x, top + 10 * u); g.lineTo(x, yBot + sag * u); g.stroke(); }
  g.strokeStyle = IRON.base; g.lineWidth = 2.6; for (let k = 1; k < 5; k++) { const u = k / 5, x = xH - d * lw * u; g.beginPath(); g.moveTo(x, top + 10 * u); g.lineTo(x, yBot + sag * u); g.stroke(); }
  g.restore();
  g.strokeStyle = LINE; g.lineWidth = 7; poly(g, P); g.stroke(); g.strokeStyle = IRON.base; g.lineWidth = 4; g.stroke();
  for (const f of [0.35, 0.75]) { const y0 = lerp(top, yBot, f); g.strokeStyle = LINE; g.lineWidth = 6.4; g.beginPath(); g.moveTo(xH, y0); g.lineTo(xH - d * lw, y0 + 10 + (sag - 10) * f); g.stroke(); g.strokeStyle = IRON.base; g.lineWidth = 3.6; g.stroke(); }
  ink(g, (g) => roundRect(g, xH - d * lw - 5, lerp(top, yBot, 0.55), 10, 16, 2), IRON.sh, 1.8);   // (the lock plate on the free edge)
  for (const f of [0.2, 0.8]) { ink(g, (g) => { g.beginPath(); g.rect(xH - 4, lerp(top, yBot, f) - 6, 8, 12); }, IRON.sh, 1.6); }   // (hinge knuckles)
}
// what closes a cell (beside the barred kind): a studded oak door with a little grille, a bricked-up arch with a hole knocked through, a
// collapsed cell spilling rubble into the corridor
function oakDoor(g, xL, xR, yTopA, yBot, seed) {
  const w = xR - xL, cx = (xL + xR) / 2;
  g.save(); archPath(g, xL, xR, yBot, yTopA); g.clip();
  vgrad(g, xL, yTopA, w, yBot, [[0, '#4a3624'], [1, '#3a2a1c']]);
  for (let k = 0; k < 7; k++) { const x = xL + w * k / 7; g.fillStyle = mix('#5a4230', '#3e2c1e', hash2(seed, k + 200)); g.fillRect(x + 1, yTopA, w / 7 - 2, yBot - yTopA); g.strokeStyle = 'rgba(10,6,2,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, yTopA); g.lineTo(x, yBot); g.stroke(); }
  g.strokeStyle = 'rgba(20,10,4,0.35)'; g.lineWidth = 1; for (let k = 0; k < 18; k++) { const x = xL + hash2(seed, k + 210) * w, y = yTopA + 30 + hash2(seed, k + 220) * (yBot - yTopA - 40); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 2, y + 14, x, y + 26); g.stroke(); }   // (grain)
  mottle(g, xL, yTopA, w, yBot - yTopA, 0.5);
  for (const f of [0.42, 0.82]) { const y = lerp(yTopA + w / 2, yBot, f); g.fillStyle = IRON.base; g.fillRect(xL, y - 6, w, 12); g.fillStyle = rgba(IRON.hi, 0.35); g.fillRect(xL, y - 6, w, 2); g.strokeStyle = LINE; g.lineWidth = 1.6; g.strokeRect(xL - 2, y - 6, w + 4, 12); for (let k = 0; k < 6; k++) { g.fillStyle = '#7a7670'; g.beginPath(); g.arc(xL + 10 + k * (w - 20) / 5, y, 2.2, 0, TAU); g.fill(); } }   // (iron straps, rivets)
  const gy = yTopA + w * 0.36; g.fillStyle = '#0a0e0c'; g.fillRect(cx - 18, gy, 36, 26); g.strokeStyle = LINE; g.lineWidth = 2; g.strokeRect(cx - 18, gy, 36, 26);   // (the grille)
  g.strokeStyle = IRON.base; g.lineWidth = 2.6; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(cx - 18 + k * 9, gy); g.lineTo(cx - 18 + k * 9, gy + 26); g.stroke(); }
  g.restore();
  g.strokeStyle = LINE; g.lineWidth = 3; g.beginPath(); g.arc(cx + w * 0.3, lerp(yTopA, yBot, 0.66), 7, 0, TAU); g.stroke(); g.strokeStyle = '#6a6660'; g.lineWidth = 2; g.stroke();   // (a ring handle)
}
function brickedArch(g, xL, xR, yTopA, yBot, seed) {
  const w = xR - xL, cx = (xL + xR) / 2;
  g.save(); archPath(g, xL, xR, yBot, yTopA); g.clip();
  g.fillStyle = '#2a332f'; g.fillRect(xL, yTopA, w, yBot - yTopA);
  for (let r = 0; r * 18 < yBot - yTopA; r++) {   // (rough bricks, smaller than the wall's, staggered)
    const y = yBot - (r + 1) * 18;
    for (let x = xL - (r & 1) * 14, k = 0; x < xR; k++) { const bw = 24 + hash2(seed + r, k + 230) * 14; g.fillStyle = mix('#4a5650', '#34403a', hash2(seed + r * 3, k + 240)); g.fillRect(x + 1, y + 1, bw - 2, 16); x += bw; }
  }
  mottle(g, xL, yTopA, w, yBot - yTopA, 0.55);
  const hx = cx + (hash2(seed, 250) - 0.5) * w * 0.3, hy = lerp(yTopA + w / 2, yBot, 0.4);   // (a hole knocked through)
  const hole = () => { g.beginPath(); for (let q = 0; q < 12; q++) { const an = q / 12 * TAU, rr = (16 + 10 * hash2(seed, q + 260)) * (q % 2 ? 0.82 : 1.08); g.lineTo(hx + Math.cos(an) * rr * 1.25, hy + Math.sin(an) * rr); } g.closePath(); };   // (broken brick teeth round it)
  hole(); { const hg = g.createRadialGradient(hx, hy - 4, 2, hx, hy, 30); hg.addColorStop(0, '#26302c'); hg.addColorStop(1, '#0c1210'); g.fillStyle = hg; } g.fill();
  g.save(); hole(); g.clip(); g.strokeStyle = 'rgba(80,100,92,0.35)'; g.lineWidth = 1; for (let y = hy - 20; y < hy + 24; y += 9) { g.beginPath(); g.moveTo(hx - 30, y); g.lineTo(hx + 30, y); g.stroke(); } g.restore();   // (a faint wall beyond)
  hole(); g.strokeStyle = LINE; g.lineWidth = 2; g.stroke();
  g.strokeStyle = 'rgba(190,220,205,0.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(hx - 16, hy + 8); g.lineTo(hx - 6, hy + 13); g.lineTo(hx + 3, hy + 12); g.moveTo(hx + 7, hy + 14); g.lineTo(hx + 17, hy + 8); g.stroke();   // (the lit lower lip: broken straight brick edges)
  g.restore();
  for (let k = 0; k < 5; k++) { const rx = hx - 30 + hash2(seed, k + 270) * 60, ry = yBot - 2 - hash2(seed, k + 280) * 4, rw = 12 + hash2(seed, k + 290) * 8; block3(g, rx, ry, rw, rw * 0.55, (hash2(seed, k + 295) - 0.5) * 0.6, seed + k * 11); }   // (the knocked-out bricks at its foot)
}
function block3(g, x, y, w, h, lean, seed) {   // (a fallen stone block: chipped, a lit top face, a mid front, a dark side; AO under it)
  g.fillStyle = 'rgba(4,8,6,0.45)'; g.beginPath(); g.ellipse(x + w * 0.1, y + 2, w * 0.62, 4, 0, 0, TAU); g.fill();
  g.save(); g.translate(x, y); g.rotate(lean);
  const ch = (k) => (hash2(seed, k) - 0.5) * w * 0.12, tp = h * 0.32;
  const front = [-w / 2 + ch(1), 0, w / 2 + ch(2), 0, w / 2 + ch(3), -h + tp, -w / 2 + ch(4), -h + tp];
  ink(g, (g) => poly(g, front), '#4e5c56', 1.6, (g) => { mottle(g, -w, -h, w * 2, h * 2, 0.5); });
  ink(g, (g) => poly(g, [-w / 2 + ch(4), -h + tp, w / 2 + ch(3), -h + tp, w / 2 + w * 0.12 + ch(5), -h, -w / 2 + w * 0.14 + ch(6), -h]), '#6a7a72', 1.6);
  ink(g, (g) => poly(g, [w / 2 + ch(2), 0, w / 2 + w * 0.12, -tp * 0.6, w / 2 + w * 0.12 + ch(5), -h, w / 2 + ch(3), -h + tp]), '#323c38', 1.6);
  g.restore();
}
function collapsedCell(g, xL, xR, yTopA, yBot, seed) {
  const w = xR - xL, cx = (xL + xR) / 2;
  g.save(); archPath(g, xL, xR, yBot, yTopA); g.clip();
  vgrad(g, xL, yTopA, w, yBot, [[0, '#121a17'], [1, '#26322d']]);
  { g.save(); g.translate(cx, yBot - 20); g.scale(1, 0.6); const dg = g.createRadialGradient(0, 0, 10, 0, 0, w * 0.55); dg.addColorStop(0, 'rgba(4,8,6,0.5)'); dg.addColorStop(1, 'rgba(4,8,6,0)'); g.fillStyle = dg; g.fillRect(-w * 0.6, -w * 0.6, w * 1.2, w * 0.6); g.restore(); }   // (soft shadow behind the heap)
  for (const [u, v, bw, bh, ln] of [[0.12, 0, 46, 30, -0.1], [0.36, 0, 54, 34, 0.05], [0.62, 0, 50, 30, -0.06], [0.86, 0, 40, 26, 0.12], [0.24, -30, 44, 28, 0.08], [0.5, -32, 52, 30, -0.04], [0.74, -26, 40, 26, 0.16], [0.38, -58, 40, 26, -0.12], [0.6, -56, 34, 24, 0.1], [0.5, -80, 30, 22, 0.05]]) block3(g, xL + u * w, yBot + v, bw, bh, ln, seed + Math.round(u * 100) + v);   // (the blocks heaped: they make the mound)
  for (const [u, h2, ln] of [[0.16, 90, 0.5], [0.82, 76, -0.42]]) { g.save(); g.translate(xL + u * w, yBot - 4); g.rotate(ln); ink(g, (g) => { g.beginPath(); g.rect(-9, -h2, 18, h2); }, '#46524c', 1.6, (g) => { g.fillStyle = 'rgba(200,230,215,0.2)'; g.fillRect(-9, -h2, 4, h2); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(3, -h2, 6, h2); }); g.restore(); }   // (two slabs leaning)
  g.restore();
  g.strokeStyle = LINE; g.lineWidth = 5.6; g.beginPath(); g.moveTo(xL + w * 0.2, yBot - 4); g.lineTo(xL + w * 0.45, yBot - 70); g.stroke(); g.strokeStyle = IRON.base; g.lineWidth = 3.2; g.stroke();   // (a bar torn loose, leaning)
  for (let k = 0; k < 6; k++) { const rx = cx - w * 0.6 + hash2(seed, k + 350) * w * 1.2, ry = yBot + 8 + hash2(seed, k + 360) * 22, rw = 10 + hash2(seed, k + 370) * 14; block3(g, rx, ry, rw, rw * 0.6, (hash2(seed, k + 380) - 0.5) * 0.5, seed + k * 7); }   // (rubble spilling out into the corridor)
}
// the cell behind the bars: a dim interior (lit enough to read through the bars), its back wall in faint courses, and what it holds
function cellInside(g, xL, xR, yTop, yBot, seed, kind = 'bed') {
  vgrad(g, xL, yTop, xR - xL, yBot, [[0, '#1c2824'], [0.6, '#2a3833'], [1, '#36463f']]);
  const cx = (xL + xR) / 2, w = xR - xL;
  g.strokeStyle = 'rgba(10,16,14,0.45)'; g.lineWidth = 1.4;   // (the cell's own back wall: staggered courses, faint)
  for (let r = 0; yTop + 30 + r * 26 < yBot - 20; r++) { const y = yTop + 30 + r * 26; g.beginPath(); g.moveTo(xL, y); g.lineTo(xR, y); g.stroke(); for (let x = xL + (r & 1) * 20 + 14; x < xR; x += 40 + hash2(seed + r, Math.round(x)) * 10) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 26); g.stroke(); } }
  mottle(g, xL, yTop, w, yBot - yTop, 0.4);
  const rim = (fn) => { g.save(); g.strokeStyle = 'rgba(170,220,205,0.4)'; g.lineWidth = 1.4; fn(); g.restore(); };
  if (kind === 'bed' || kind === 'flooded') {   // a high barred window: the moon's beam falling in
    const wx = cx + (hash2(seed, 2) - 0.5) * w * 0.4; g.fillStyle = 'rgba(170,210,200,0.2)'; g.beginPath(); g.moveTo(wx - 14, yTop + 16); g.lineTo(wx + 14, yTop + 16); g.lineTo(wx + 40, yBot); g.lineTo(wx - 40, yBot); g.closePath(); g.fill();
    ink(g, (g) => roundRect(g, wx - 9, yTop + 10, 18, 26, 9), '#a8d8d0', 1.6); g.strokeStyle = '#223'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(wx - 3, yTop + 12); g.lineTo(wx - 3, yTop + 34); g.moveTo(wx + 3, yTop + 12); g.lineTo(wx + 3, yTop + 34); g.stroke();
  }
  if (kind === 'bed') {   // straw bed, a tin cup, chalk tallies
    g.fillStyle = '#8a7438'; g.beginPath(); g.ellipse(cx - w * 0.18, yBot - 8, w * 0.3, 10, 0, 0, TAU); g.fill();
    g.strokeStyle = '#c8b066'; g.lineWidth = 1.6; g.lineCap = 'round'; for (let k = 0; k < 16; k++) { const sx = cx - w * 0.18 + (hash2(seed, k + 10) - 0.5) * w * 0.56, sy = yBot - 8 - hash2(seed, k + 30) * 9; g.beginPath(); g.moveTo(sx, sy + 4); g.lineTo(sx + (hash2(seed, k + 50) - 0.5) * 12, sy - 5); g.stroke(); }
    ink(g, (g) => { g.beginPath(); g.ellipse(cx + w * 0.28, yBot - 8, 9, 6, 0, 0, TAU); }, '#a8aeae', 1.8);
    g.strokeStyle = 'rgba(220,235,225,0.55)'; g.lineWidth = 1.6; for (let k = 0; k < 4; k++) { const tx = cx + w * 0.12 + k * 5; g.beginPath(); g.moveTo(tx, yTop + 70); g.lineTo(tx, yTop + 86); g.stroke(); } g.beginPath(); g.moveTo(cx + w * 0.12 - 3, yTop + 80); g.lineTo(cx + w * 0.12 + 18, yTop + 76); g.stroke();
  } else if (kind === 'stores') {   // old stores, stacked high: barrels, crates, a sack
    const B = (bx, by, k2) => ink(g, (g) => { g.beginPath(); g.moveTo(bx - 16 * k2, by); g.quadraticCurveTo(bx - 22 * k2, by - 26 * k2, bx - 16 * k2, by - 48 * k2); g.lineTo(bx + 16 * k2, by - 48 * k2); g.quadraticCurveTo(bx + 22 * k2, by - 26 * k2, bx + 16 * k2, by); g.closePath(); }, '#6a4c32', 2, (g) => { g.fillStyle = '#3a3a40'; g.fillRect(bx - 24, by - 40 * k2, 48, 4); g.fillRect(bx - 24, by - 12 * k2, 48, 4); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx + 4, by - 50, 20, 52); });
    const Cr = (bx, by, s2) => ink(g, (g) => { g.beginPath(); g.rect(bx - s2, by - s2 * 1.6, s2 * 2, s2 * 1.6); }, '#7a5c3c', 2, (g) => { g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(bx - s2, by - s2 * 1.6); g.lineTo(bx + s2, by); g.moveTo(bx + s2, by - s2 * 1.6); g.lineTo(bx - s2, by); g.stroke(); g.fillStyle = 'rgba(255,240,210,0.12)'; g.fillRect(bx - s2, by - s2 * 1.6, s2 * 2, 3); });
    B(cx - w * 0.28, yBot - 2, 1.1); Cr(cx + w * 0.02, yBot - 2, 24); B(cx + w * 0.28, yBot - 2, 1);
    Cr(cx - w * 0.16, yBot - 42, 18); B(cx + w * 0.16, yBot - 50, 0.8); Cr(cx - w * 0.02, yBot - 80, 14);
    rim(() => { g.beginPath(); g.moveTo(cx - w * 0.42, yBot - 54); g.lineTo(cx - w * 0.14, yBot - 54); g.moveTo(cx - w * 0.16 - 18, yBot - 71); g.lineTo(cx - w * 0.16 + 18, yBot - 71); g.stroke(); });
  } else if (kind === 'chains') {   // chains and shackles hanging on the back wall, a stool
    for (const dx of [-0.22, 0.2]) { const hx = cx + dx * w; chainLinks(g, hx, yTop + 30, hx + 2, yTop + 96, 6, '#5a5a60'); ink(g, (g) => { g.beginPath(); g.ellipse(hx + 2, yTop + 104, 7, 8, 0, 0, TAU); }, null, 2.2); g.strokeStyle = '#7a7a82'; g.lineWidth = 2.6; g.beginPath(); g.ellipse(hx + 2, yTop + 104, 7, 8, 0, 0, TAU); g.stroke(); }
    ink(g, (g) => { g.beginPath(); g.rect(cx - 14, yBot - 22, 28, 22); }, '#5a5046', 1.8); rim(() => { g.beginPath(); g.moveTo(cx - 14, yBot - 22); g.lineTo(cx + 14, yBot - 22); g.stroke(); });
  } else if (kind === 'flooded') {   // water across the floor: a bright band reflecting the bars, rings from a drip
    const fy = yBot - 22; const wg = g.createLinearGradient(0, fy, 0, yBot); wg.addColorStop(0, 'rgba(150,200,190,0.75)'); wg.addColorStop(1, 'rgba(70,110,104,0.6)'); g.fillStyle = wg; g.fillRect(xL, fy, w, yBot - fy);
    g.fillStyle = 'rgba(20,30,28,0.45)'; for (let x = xL + 8; x < xR; x += 16) g.fillRect(x, fy + 2, 3, yBot - fy - 4);   // (the bars' reflection)
    g.strokeStyle = 'rgba(220,245,240,0.55)'; g.lineWidth = 1.2; for (const r of [6, 13, 21]) { g.beginPath(); g.ellipse(cx + 8, fy + 10, r, r * 0.3, 0, 0, TAU); g.stroke(); }
  } else if (kind === 'webs') {   // cobwebs everywhere, an old lantern gone out
    cobweb(g, xL + 2, yTop + 20, 1, 1, 46, seed); cobweb(g, xR - 2, yTop + 20, -1, 1, 40, seed + 2); cobweb(g, xL + 2, yBot - 4, 1, -1, 30, seed + 4);
    ink(g, (g) => { g.beginPath(); g.rect(cx - 9, yBot - 30, 18, 24); }, '#5a5a42', 1.8, (g) => { g.fillStyle = 'rgba(160,160,130,0.45)'; g.fillRect(cx - 5, yBot - 26, 10, 15); });
  } else if (kind === 'stair') {   // a stair going down into the dark, its top steps lit by the corridor
    for (let k = 0; k < 6; k++) { const y = yBot - 8 - k * 11, x0 = xL + 8 + k * 14, ww = w * 0.62 - k * 8; ink(g, (g) => { g.beginPath(); g.rect(x0, y, ww, 11); }, mix('#5a6a62', '#24302c', k / 5), 1.4, (g) => { g.fillStyle = `rgba(200,230,215,${0.22 * (1 - k / 6)})`; g.fillRect(x0, y, ww, 2.4); }); }
    const dg = g.createLinearGradient(xL + w * 0.5, 0, xR, 0); dg.addColorStop(0, 'rgba(4,8,6,0)'); dg.addColorStop(1, 'rgba(4,8,6,0.6)'); g.fillStyle = dg; g.fillRect(xL, yTop, w, yBot - yTop);   // (going down into the dark at the back)
  }
  aoBand(g, xL, xR, yBot, 24, -1, 0.35);   // (dark where the cell's floor meets its walls)
  g.fillStyle = 'rgba(150,210,190,0.08)'; g.fillRect(xL, yBot - 26, w, 26);
}
// an arched opening: its outline path (left, bottom, round top) -- fill it with the interior, then ring it with stone
function archPath(g, xL, xR, yBot, yTop) {
  const r = (xR - xL) / 2, cy = yTop + r;
  g.beginPath(); g.moveTo(xL, yBot); g.lineTo(xL, cy); g.arc((xL + xR) / 2, cy, r, Math.PI, 0); g.lineTo(xR, yBot); g.closePath();
}
// the arch's ring of wedge stones (voussoirs): each its own tone, ink joints, a lit inner edge, a bigger keystone
function voussoirs(g, xL, xR, yTop, seed) {
  const r = (xR - xL) / 2, cx = (xL + xR) / 2, cy = yTop + r, n = 9 + (r > 120 ? 2 : 0), r0 = r + 1, r1 = r + 17;
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI + k / n * Math.PI, a1 = Math.PI + (k + 1) / n * Math.PI, key = k === (n - 1) / 2, rr1 = key ? r1 + 7 : r1;
    const P = [cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, cx + Math.cos(a0) * rr1, cy + Math.sin(a0) * rr1, cx + Math.cos(a1) * rr1, cy + Math.sin(a1) * rr1, cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0];
    ink(g, (g) => poly(g, P), mix(STONE.base, hash2(seed, k + 400) > 0.5 ? STONE.hi : STONE.sh, 0.25 + hash2(seed, k + 410) * 0.35), 2.2, (g) => { mottle(g, cx - r1, cy - r1, r1 * 2, r1, 0.45); });
    g.strokeStyle = rgba(STONE.hi, 0.5); g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy, r0 + 2, a0 + 0.02, a1 - 0.02); g.stroke();   // (its lit inner edge)
  }
}
// how each cell is closed (by its index between pillars): bars mostly; a studded oak door, bars prised apart, a bricked-up arch, a collapsed
// cell; 'open' cells (their door swung out) and the stairs show the corridor beyond. The arena's left cell (4460) is a solid door: the
// boss's barred gate stands in front of it and must not melt into bars behind it
const DOOR_OF = { 1: 'door', 5: 'bricked', 8: 'bent', 9: 'collapsed', 12: 'door', 14: 'bent', 15: 'door' };
const unlit = (x) => x === 610 || x === 2180 || x === 3540 || x === 4180;   // (one torch in four or so cold: rhythm, dark gaps)
const torchK = (x) => (unlit(x) ? 0 : 0.7 + 0.5 * hash2(Math.round(x), 23));   // (each lit torch its own strength)
// a hole cut through a strip (what lies beyond shows through): erased from a cache; when the strip is painted live (LIVE), what shows
// through is painted into the hole instead (SEE_THROUGH: set by drawBack round the strip's draw, screen coords)
let SEE_THROUGH = null;
function cutOut(g, path) {
  if (!LIVE) { g.save(); g.globalCompositeOperation = 'destination-out'; path(); g.fillStyle = '#000'; g.fill(); g.restore(); return; }
  g.save(); path(); g.clip(); g.translate(-LIVE.dx, 0);
  if (SEE_THROUGH) SEE_THROUGH(g); else { g.fillStyle = '#0c1210'; g.fillRect(0, 0, W, 372); }
  g.restore();
}
// the cells and alcoves between the pillars (world): xL, xR, the arch's top, kind, closure -- the wall's cache and the live far view share it
const CELLS = (() => {
  const P = LAY.pillars, out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], xL = a.x + a.w / 2 + 10, xR = b.x - b.w / 2 - 10, ow = xR - xL, sec = b.sec;
    const cap = sec === 1 ? 286 : sec === 0 ? (i % 2 ? 182 : 214) : 214, hgt = Math.min(ow * 1.08, cap), yBot = 336;
    const hatch = a.x === 4740, wedge = a.x === 5060, kind = CELL_KINDS[i % CELL_KINDS.length];
    const shut = DOOR_OF[i] || (kind === 'open' ? 'open' : kind === 'stair' ? 'stair' : 'bars');
    out.push({ i, xL, xR, ow, yBot, yTop: yBot - hgt, hgt, sec, hatch, wedge, kind, shut, seed: i * 17 + 5 });
  }
  let bi = 0, ni = 0;
  for (const c of out) {
    if (c.shut === 'bars' && !c.hatch && !c.wedge) c.gate = [0, 1, 2, 4, 3][bi++ % 5];   // (plain, lattice, wicket, round lock, boarded: in turn among the barred bays)
    if (!c.hatch && (c.shut === 'bars' || c.shut === 'door' || c.shut === 'bent')) c.num = ++ni;   // (the real cells, numbered in order)
  }
  return out;
})();
// the sealed round hatch behind the drain: a great dark stone disc set in a ring of blocks, iron strap hinges with rivets, a ring of carved
// runes glowing faintly green; soft light from the torches on its face (darker than the beast who rises in front of it)
function drawHatch(g, c) {
  const { xL, xR, yBot, yTop, hgt, ow } = c;
  g.save(); archPath(g, xL, xR, yBot, yTop); g.clip(); vgrad(g, xL, yTop, xR - xL, yBot, [[0, '#121a17'], [1, '#1e2924']]); g.restore();
  const cx = (xL + xR) / 2, cy = yBot - hgt * 0.45, rr = Math.min(ow * 0.44, 110);
  g.fillStyle = 'rgba(4,8,6,0.55)'; g.beginPath(); g.arc(cx + 3, cy + 4, rr + 16, 0, TAU); g.fill();   // (the recess it sits in)
  for (let k = 0; k < 16; k++) {   // (the ring of blocks round it)
    const a0 = k / 16 * TAU, a1 = (k + 1) / 16 * TAU, r0 = rr + 2, r1 = rr + 16;
    ink(g, (g) => poly(g, [cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1, cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0]), mix(STONE.base, STONE.sh, 0.3 + 0.4 * hash2(k, 500)), 2);
  }
  g.save(); g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.clip();
  const dg = g.createRadialGradient(cx - rr * 0.35, cy - rr * 0.4, rr * 0.1, cx, cy, rr * 1.05); dg.addColorStop(0, '#46504a'); dg.addColorStop(0.6, '#323b36'); dg.addColorStop(1, '#1e2522'); g.fillStyle = dg; g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  mottle(g, cx - rr, cy - rr, rr * 2, rr * 2, 0.55);
  g.strokeStyle = 'rgba(10,16,14,0.6)'; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, rr * 0.62, 0, TAU); g.stroke();   // (a carved ring)
  for (let k = 0; k < 14; k++) { const an = k / 14 * TAU, x = cx + Math.cos(an) * rr * 0.78, y = cy + Math.sin(an) * rr * 0.78; g.save(); g.translate(x, y); g.rotate(an + Math.PI / 2); g.strokeStyle = 'rgba(140,230,130,0.5)'; g.lineWidth = 1.8; g.beginPath(); const t2 = k % 4; if (t2 === 0) { g.moveTo(-3, -6); g.lineTo(-3, 6); g.moveTo(-3, -1); g.lineTo(4, -5); } else if (t2 === 1) { g.moveTo(0, -6); g.lineTo(0, 6); g.moveTo(-4, -2); g.lineTo(0, 1); g.lineTo(4, -2); } else if (t2 === 2) { g.moveTo(-4, 6); g.lineTo(-1, -6); g.lineTo(4, 2); } else { g.moveTo(-4, -4); g.lineTo(4, -4); g.lineTo(-2, 6); } g.stroke(); g.restore(); }   // (runes, faint green)
  const lg = g.createRadialGradient(cx, cy, rr * 0.7, cx, cy, rr * 0.9); lg.addColorStop(0, 'rgba(130,220,120,0)'); lg.addColorStop(0.5, 'rgba(130,220,120,0.12)'); lg.addColorStop(1, 'rgba(130,220,120,0)'); g.fillStyle = lg; g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  g.restore();
  for (const f of [-0.42, 0.42]) {   // (two strap hinges across its face, riveted)
    const y = cy + f * rr, half = Math.sqrt(rr * rr - (f * rr) ** 2);
    g.save(); g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.clip();
    g.fillStyle = IRON.base; g.fillRect(cx - half - 4, y - 7, half * 1.5, 14); g.fillStyle = rgba(IRON.hi, 0.35); g.fillRect(cx - half - 4, y - 7, half * 1.5, 2.4); g.fillStyle = rgba(IRON.rust, 0.5); g.fillRect(cx - half * 0.2, y + 2, 14, 4);
    g.strokeStyle = LINE; g.lineWidth = 1.8; g.strokeRect(cx - half - 4, y - 7, half * 1.5, 14);
    for (let k = 0; k < 5; k++) { g.fillStyle = '#7a7670'; g.beginPath(); g.arc(cx - half + 8 + k * half * 0.3, y, 2.2, 0, TAU); g.fill(); }
    g.restore();
    ink(g, (g) => { g.beginPath(); g.rect(cx - half - 12, y - 9, 12, 18); }, IRON.sh, 1.8);   // (the hinge knuckle on the ring)
  }
  ink(g, (g) => roundRect(g, cx + rr * 0.55, cy - 12, 16, 24, 3), IRON.sh, 1.8);   // (the bolt on the far side)
  g.strokeStyle = LINE; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(200,230,215,0.25)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, rr - 3, Math.PI * 1.05, Math.PI * 1.55); g.stroke();   // (a soft crescent of light on its rim)
}
// the back wall (y 0..370): courses of stone blocks, pillars with torch brackets, arched cells (bars, doors, bricked, collapsed, open), damp,
// the hall's ribbed vault, the pit's curved cornice, the vault's shadow
function drawWall(g, xa, xb) {
  const Wd = xb - xa + 4;
  vgrad(g, xa - 2, 0, Wd, GT0 + 30, [[0, '#303a36'], [0.5, '#44504a'], [1, '#323c38']]);
  for (let r = 0; r < 8; r++) {   // courses of blocks: staggered, each its own tone, mortar between
    const y0 = r * 46 - 8;
    for (let bxN = -400 - (r & 1) * 44, i = 0; bxN < xb + 200; i++) {
      const pw = 62 + 58 * hash2(i + Math.floor(bxN / 7), r + 200), bx = bxN; bxN += pw;
      if (bx + pw < xa - 4) continue;
      const h = hash2(Math.floor(bx / 11), r + 210);
      g.fillStyle = mix(STONE.base, h < 0.5 ? STONE.sh : STONE.hi, Math.abs(h - 0.5) * 0.7); g.fillRect(bx + 1, y0 + 1, pw - 1.5, 44);
      g.fillStyle = rgba(STONE.hi, 0.2); g.fillRect(bx + 1, y0 + 1, pw - 1.5, 4);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(bx + 1, y0 + 38, pw - 1.5, 6);
      if (h > 0.84) { g.fillStyle = 'rgba(90,140,80,0.22)'; g.beginPath(); g.ellipse(bx + pw * 0.5, y0 + 30, pw * 0.3, 8, 0, 0, TAU); g.fill(); }   // moss
      g.strokeStyle = rgba(STONE.joint, 0.85); g.lineWidth = 2; g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx, y0 + 46); g.stroke();
    }
    g.strokeStyle = rgba(STONE.joint, 0.85); g.lineWidth = 2; g.beginPath(); g.moveTo(xa - 2, y0 + 46); g.lineTo(xb + 2, y0 + 46); g.stroke();
  }
  mottle(g, xa - 2, -8, Wd, 376, 0.5);
  for (let x = al(xa - 120, 90) - 90; x < xb + 120; x += 90) {   // (damp: dark stains running down below the vault, a wet glint, green at the foot)
    const i = Math.round(x / 90); if (hash2(i, 240) < 0.4) continue;
    const sx = x + hash2(i, 241) * 70, y0 = hash2(i, 245) > 0.5 ? 84 : 130, len = 110 + hash2(i, 242) * 150, sw = 6 + hash2(i, 243) * 14, pk = 0.35 + 0.2 * hash2(i, 244), sg = g.createLinearGradient(0, y0 - 4, 0, y0 + len); sg.addColorStop(0, 'rgba(10,20,14,0)'); sg.addColorStop(18 / len, `rgba(10,20,14,${pk})`); sg.addColorStop(0.75, 'rgba(20,40,24,0.25)'); sg.addColorStop(1, 'rgba(60,110,50,0)');   // (seeping from a mortar joint, fading in)
    g.fillStyle = sg; g.beginPath(); g.moveTo(sx - sw * 1.3, y0 - 4); g.quadraticCurveTo(sx - sw * 0.2, y0 - 8, sx + sw * 1.2, y0 - 3); g.quadraticCurveTo(sx + sw * 0.6, y0 + len * 0.6, sx, y0 + len); g.quadraticCurveTo(sx - sw * 0.6, y0 + len * 0.6, sx - sw * 1.3, y0 - 4); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(200,235,225,0.22)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(sx - sw * 0.4, y0 + 6); g.quadraticCurveTo(sx - sw * 0.3, y0 + len * 0.5, sx - 1, y0 + len * 0.8); g.stroke();
    g.fillStyle = 'rgba(80,140,70,0.28)'; g.beginPath(); g.ellipse(sx, y0 + len - 4, sw * 0.9, 4, 0, 0, TAU); g.fill();
  }
  for (const p of LAY.pillars) if (p.x + 200 > xa && p.x - 200 < xb) { const k = torchK(p.x); if (!k) continue; lightPool(g, p.x, 210, 170, 120, '255,190,110', 0.14 * k); lightPool(g, p.x, 210, 60, 50, '255,220,150', 0.13 * k); }   // (each torch's warm light on the stone)
  // the hall's ribbed vault: a pointed rib from each pillar to the next, springing from the capitals
  { const H1 = LAY.pillars.filter((p) => p.sec === 1); for (let k = 0; k < H1.length - 1; k++) { const x0 = H1[k].x, x1 = H1[k + 1].x; if (x1 < xa - 20 || x0 > xb + 20) continue; for (const [lw, col] of [[14 * LK + 3, LINE], [10, STONE.base], [2, rgba(STONE.hi, 0.5)]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, 96); g.quadraticCurveTo((x0 + x1) / 2, -60, x1, 96); g.stroke(); } } }
  // the pit: its back wall curves round (a cornice sweeping over the cells, lower at the ends), darker toward its edges
  if (xb > 3820) {
    const cy = (x) => { const v = 44 + 18 * ((x - DRAIN_X) / 560) ** 2; return v < 60 ? v : 66 - 6 * Math.exp(-(v - 60) / 6); };   // (flat: high over the capitals and arches, easing into its level run without a kink)
    const x0 = Math.max(xa - 4, 3890), x1 = xb + 4;   // (from behind the 3900 pillar)
    if (x1 > x0) {
      const top = [], bot = []; for (let x = x0; x <= x1; x += 8) { top.push(x, cy(x) - 16); bot.push(x, cy(x) + 10); }
      const pg = top.slice(); for (let k = bot.length - 2; k >= 0; k -= 2) pg.push(bot[k], bot[k + 1]);
      ink(g, (g) => poly(g, pg), STONE.base, 2.6, (g) => { mottle(g, x0, 0, x1 - x0, 130, 0.5); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < bot.length; k += 2) g.fillRect(bot[k], bot[k + 1] - 6, 8.5, 6); });
      g.strokeStyle = rgba(STONE.hi, 0.45); g.lineWidth = 1.6; polyline(g, top.map((v, j) => (j & 1 ? v + 2 : v))); g.stroke();
      for (let x = al(x0, 70); x < x1; x += 70) { g.strokeStyle = rgba(STONE.joint, 0.8); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, cy(x) - 16); g.lineTo(x, cy(x) + 10); g.stroke(); }
      for (const [ex, d] of [[3880, 1], [5420, -1]]) { const eg = g.createLinearGradient(ex, 0, ex + d * 260, 0); eg.addColorStop(0, 'rgba(4,8,6,0.45)'); eg.addColorStop(1, 'rgba(4,8,6,0)'); g.fillStyle = eg; g.fillRect(Math.min(ex, ex + d * 260), 0, 260, 370); }   // (the wall curving away into shadow at the pit's sides)
    }
  }
  // the cells and alcoves
  for (const c of CELLS) {
    const { xL, xR, ow, yBot, yTop, hgt, sec, seed } = c;
    if (xR + 30 < xa - 40 || xL - 30 > xb + 40) continue;
    if (c.hatch) drawHatch(g, c);
    else if (c.shut === 'door') oakDoor(g, xL, xR, yTop, yBot, seed);
    else if (c.shut === 'bricked') brickedArch(g, xL, xR, yTop, yBot, seed);
    else if (c.shut === 'collapsed') collapsedCell(g, xL, xR, yTop, yBot, seed);
    else if (c.shut === 'open') {   // its door swung out: the corridor beyond shows through (the far view, live, at its own parallax)
      cutOut(g, () => archPath(g, xL, xR, yBot, yTop));
      swungDoor(g, xL, yTop, yBot, -1, seed);
    } else {
      g.save(); archPath(g, xL, xR, yBot, yTop); g.clip(); cellInside(g, xL, xR, yTop, yBot, seed, c.wedge ? 'bed' : c.kind); g.restore();
      if (c.wedge) { g.save(); archPath(g, xL, xR, yBot, yTop); g.clip(); const gr = g.createRadialGradient((xL + xR) / 2, yBot - 40, 4, (xL + xR) / 2, yBot - 40, ow * 0.7); gr.addColorStop(0, 'rgba(255,214,120,0.38)'); gr.addColorStop(1, 'rgba(255,170,60,0)'); g.fillStyle = gr; g.fillRect(xL, yTop, ow, hgt); g.restore(); swungDoor(g, xL, yTop, yBot, -1, seed); }   // (the wedge's cell: its door stands ajar)
      else if (c.shut !== 'stair') bars(g, xL, xR, yTop, yBot, seed, { bent: c.shut === 'bent', v: c.gate || 0 });   // (QA: each barred bay its own gate, in turn)
    }
    voussoirs(g, xL, xR, yTop, seed);
    { const cx = (xL + xR) / 2, ky = yTop - 8;   // (a plate on the keystone: the real cells' numbers in order; a skull over the bricked one)
      if (c.num) { const n = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][(c.num - 1) % 12]; ink(g, (g) => roundRect(g, cx - 17, ky - 10, 34, 16, 3), '#3a3a3c', 1.8, (g) => { g.fillStyle = 'rgba(220,230,220,0.25)'; g.fillRect(cx - 17, ky - 10, 34, 3); }); g.fillStyle = '#d8d0b8'; g.font = 'bold 11px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, cx, ky - 1.5); }
      else if (c.shut === 'bricked') { ink(g, (g) => { g.beginPath(); g.ellipse(cx, ky - 2, 9, 8, 0, 0, TAU); }, '#b8b4a4', 1.6, (g) => { g.fillStyle = '#1a1612'; g.beginPath(); g.arc(cx - 3, ky - 3, 2, 0, TAU); g.arc(cx + 3, ky - 3, 2, 0, TAU); g.fill(); g.fillRect(cx - 3, ky + 3, 6, 2); }); } }
    if (!c.hatch && !c.wedge && c.shut !== 'collapsed') {   // (a thing left outside it, on the corridor's side)
      const ov = c.i % 5, fx = xL + (xR - xL) * (c.i % 2 ? 0.16 : 0.84), fy = yBot + 2;
      if (ov === 0) {   // (two old bones lying flat by the bars: low, never a container -- the stage's breakable bucket stays the only bucket)
        g.save(); g.lineCap = 'round';
        const BONES = [[fx - 15, fy - 4, fx + 9, fy - 7], [fx - 7, fy - 1, fx + 14, fy + 1]];
        for (const [col, lw, kr] of [[LINE, 6.4, 3.6], ['#a8a08a', 3.2, 2.3]]) for (const [ax, ay, bx, by] of BONES) {
          g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
          g.fillStyle = col; for (const [x, y] of [[ax, ay], [bx, by]]) for (const d of [-1.7, 1.7]) { g.beginPath(); g.arc(x, y + d, kr, 0, TAU); g.fill(); }
        }
        g.strokeStyle = 'rgba(232,224,198,0.3)'; g.lineWidth = 1; for (const [ax, ay, bx, by] of BONES) { g.beginPath(); g.moveTo(ax + 3, ay - 1.1); g.lineTo(bx - 3, by - 1.1); g.stroke(); }   // (lit along the top, faintly)
        g.strokeStyle = '#6a6456'; g.lineWidth = 1; for (const [ax, ay, bx, by] of BONES) { g.beginPath(); g.moveTo(ax + 3, ay + 1.1); g.lineTo(bx - 3, by + 1.1); g.stroke(); }   // (their undersides: in the wall's value range -- set dressing, not a pickup)
        g.restore();
      }
      else if (ov === 2) { ink(g, (g) => { g.beginPath(); g.ellipse(fx, fy - 4, 22, 9, 0, 0, TAU); }, '#8a7438', 1.8, (g) => { g.strokeStyle = '#c8b066'; g.lineWidth = 1.4; for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(fx - 18 + k * 4.5, fy - 2); g.lineTo(fx - 16 + k * 4.5 + (k % 3) * 2, fy - 11); g.stroke(); } }); }   // (spilt straw)
      else if (ov === 3) { ink(g, (g) => { g.beginPath(); g.ellipse(fx, fy - 4, 11, 5, 0, 0, TAU); }, '#9a9e9a', 1.8, (g) => { g.fillStyle = 'rgba(40,30,20,0.5)'; g.beginPath(); g.ellipse(fx, fy - 5, 7, 2.6, 0, 0, TAU); g.fill(); }); }   // (a tin bowl)
      else if (ov === 4) { ink(g, (g) => { g.beginPath(); g.rect(fx - 13, fy - 20, 26, 6); }, '#6a5236', 1.8); for (const lx of [-9, 9]) ink(g, (g) => { g.beginPath(); g.rect(fx + lx - 2, fy - 14, 4, 14); }, '#5a4430', 1.4); }   // (a stool)
      if (ov !== 1) { g.fillStyle = 'rgba(6,10,8,0.35)'; g.beginPath(); g.ellipse(fx + 3, fy + 1, 16, 4, 0, 0, TAU); g.fill(); }
    }
    if (hash2(seed, 9) > 0.3) cobweb(g, xL + 4, yTop + ow * 0.25, 1, 1, 34 + hash2(seed, 10) * 14, seed);
    if (hash2(seed, 11) > 0.55) cobweb(g, xR - 4, yTop + ow * 0.25, -1, 1, 30 + hash2(seed, 12) * 14, seed + 4);
    void sec;
  }
  // the pillars: a shaft, a capital, a base, a torch bracket (cold on some), a chain
  for (const p of LAY.pillars) {
    if (p.x + p.w < xa - 10 || p.x - p.w > xb + 10) continue;
    const x0 = p.x - p.w / 2;
    g.fillStyle = mix(STONE.base, STONE.sh, 0.2); g.fillRect(x0, -4, p.w, 390); mottle(g, x0, -4, p.w, 390, 0.5);
    g.fillStyle = 'rgba(80,130,70,0.35)'; g.beginPath(); g.ellipse(p.x - p.w * 0.2, 330, p.w * 0.5, 12, 0, Math.PI, TAU); g.fill();   // (moss climbing from the floor)
    g.fillStyle = rgba(STONE.hi, 0.3); g.fillRect(x0, -4, 7, 390); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + p.w - 9, -4, 9, 390);
    g.strokeStyle = LINE; g.lineWidth = 3 * LK + 1.2; g.strokeRect(x0, -4, p.w, 390);
    for (let y = 40; y < 360; y += 58) { g.strokeStyle = rgba(STONE.joint, 0.55); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + p.w, y); g.stroke(); }
    ink(g, (g) => roundRect(g, x0 - 6, 336, p.w + 12, 30, 4), STONE.base, 2.4, (g) => { g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x0 - 6, 336, 14, 30); });
    ink(g, (g) => roundRect(g, x0 - 5, 96, p.w + 10, 18, 4), STONE.base, 2.2);
    ink(g, (g) => { g.beginPath(); g.moveTo(p.x - 3, 232); g.lineTo(p.x - 3, 208); g.lineTo(p.x - 14, 196); g.lineTo(p.x + 14, 196); g.lineTo(p.x + 3, 208); g.lineTo(p.x + 3, 232); g.closePath(); }, IRON.sh, 2.4);
    if (unlit(p.x)) { for (const [hw, al2] of [[24, 0.08], [16, 0.1], [9, 0.12]]) { const sg2 = g.createLinearGradient(0, 198, 0, 120); sg2.addColorStop(0, `rgba(14,18,16,${al2 * 2})`); sg2.addColorStop(1, 'rgba(14,18,16,0)'); g.fillStyle = sg2; g.beginPath(); g.moveTo(p.x - hw * 0.25, 198); g.quadraticCurveTo(p.x - hw, 150, p.x - hw * 0.7 + 3, 120); g.lineTo(p.x + hw * 0.7 + 3, 120); g.quadraticCurveTo(p.x + hw, 150, p.x + hw * 0.25, 198); g.closePath(); g.fill(); } ink(g, (g) => { g.beginPath(); g.moveTo(p.x - 5, 198); g.lineTo(p.x - 4, 186); g.lineTo(p.x - 1, 190); g.lineTo(p.x + 2, 183); g.lineTo(p.x + 5, 198); g.closePath(); }, '#2a2420', 1.2); }   // (a cold torch: a charred stub, a plume of soot)
    if (hash2(Math.round(p.x), 21) > 0.5) chainLinks(g, p.x + p.w / 2 - 2, -4, p.x + p.w / 2 + 4, 150, 30);
  }
  vgrad(g, xa - 2, 0, Wd, 120, [[0, 'rgba(4,8,6,0.8)'], [1, 'rgba(4,8,6,0)']]);
  vgrad(g, xa - 2, 300, Wd, 366, [[0, 'rgba(4,8,6,0)'], [1, 'rgba(4,8,6,0.45)']]);
}
// the floor: grey-green flagstones in rows widening toward the camera (joints a little askew), moss and ooze in the cracks, puddles; the
// torches' light on the flags (dark gaps between), a cool moonbeam here and there; the pit's round floor: flags laid in rings round the drain,
// a stone kerb at its rim
function drawFloor(g, xa, xb) {
  const Wd = xb - xa + 4;
  g.fillStyle = '#10161a'; g.fillRect(xa - 2, 360, Wd, 192);
  for (let r = 0; r < ROWS.length - 1; r++) {
    const y0 = ROWS[r], y1 = ROWS[r + 1], pw0 = 100 + r * 26;
    for (let bxN = -400 - (r & 1) * 50, i = 0; bxN < xb + 200; i++) {   // (from a fixed start, so every chunk cuts the same flags)
      const pw = pw0 * (0.8 + hash2(i + Math.floor(bxN / 7), r + 300) * 0.5), bx = bxN; bxN += pw;
      if (bx + pw < xa - 4) continue;
      const h = hash2(Math.floor(bx / 13), r + 310), sk = (hash2(Math.floor(bx / 13), r + 315) - 0.5) * (y1 - y0) * 0.5;
      g.fillStyle = mix('#46534e', h < 0.5 ? '#2e3a36' : '#62726a', Math.abs(h - 0.5) * 0.9); g.fillRect(bx, y0, pw + 0.6, y1 - y0 + 0.6);
      g.fillStyle = 'rgba(190,230,215,0.09)'; g.fillRect(bx, y0 + 1, pw, Math.max(1.4, (y1 - y0) * 0.08));
      if (h > 0.8) { g.fillStyle = 'rgba(100,170,90,0.3)'; g.beginPath(); g.ellipse(bx + pw * 0.4, y0 + (y1 - y0) * 0.6, pw * 0.24, (y1 - y0) * 0.22, 0, 0, TAU); g.fill(); }   // moss
      else if (h < 0.1) { g.fillStyle = 'rgba(160,210,190,0.28)'; g.beginPath(); g.ellipse(bx + pw * 0.5, y0 + (y1 - y0) * 0.5, pw * 0.3, (y1 - y0) * 0.26, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(bx + pw * 0.3, y0 + (y1 - y0) * 0.4, pw * 0.2, 1.6); }   // a puddle
      g.strokeStyle = 'rgba(8,14,12,0.75)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx + sk, y1); g.stroke();   // (a joint, a little askew)
      if (h > 0.55 && h < 0.66) { g.strokeStyle = 'rgba(8,14,12,0.55)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(bx + 12, y0 + 3); g.lineTo(bx + pw * 0.5, y0 + (y1 - y0) * 0.55); g.lineTo(bx + pw * 0.7, y1 - 3); g.stroke(); }   // a crack
    }
    g.strokeStyle = 'rgba(8,14,12,0.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xa - 2, y0); g.lineTo(xb + 2, y0); g.stroke();
  }
  // the pit's round floor: rings of flags round the drain, a kerb at its back and front rims
  if (xb > DRAIN_X - 640 && xa < DRAIN_X + 640) {
    const cx = DRAIN_X, cy = 452, RX = 560, RY = 92;
    g.save(); g.beginPath(); g.ellipse(cx, cy, RX, RY, 0, 0, TAU); g.clip();
    g.fillStyle = '#3e4a46'; g.fillRect(cx - RX, cy - RY, RX * 2, RY * 2);
    for (let ring = 0; ring < 5; ring++) {
      const r0 = 0.24 + ring * 0.16, r1 = r0 + 0.16, n = 10 + ring * 6;
      for (let k = 0; k < n; k++) {
        const a0 = (k + (ring & 1) * 0.5) / n * TAU, a1 = a0 + TAU / n, hk = hash2(ring * 31 + k, 520);
        g.fillStyle = mix('#46534e', hk < 0.5 ? '#2e3a36' : '#62726a', Math.abs(hk - 0.5) * 0.9);
        g.beginPath(); g.ellipse(cx, cy, RX * r1, RY * r1, 0, a0, a1); g.ellipse(cx, cy, RX * r0, RY * r0, 0, a1, a0, true); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(8,14,12,0.7)'; g.lineWidth = 1.4; g.stroke();
      }
    }
    mottle(g, cx - RX, cy - RY, RX * 2, RY * 2, 0.45);
    g.restore();
    for (const [a0, a1, dy] of [[Math.PI * 1.02, Math.PI * 1.98, 0], [Math.PI * 0.1, Math.PI * 0.9, 0]]) {   // (the kerb: a low stone rim)
      g.strokeStyle = 'rgba(30,40,36,0.5)'; g.lineWidth = 10; g.beginPath(); g.ellipse(cx, cy + dy, RX + 6, RY + 4, 0, a0, a1); g.stroke();
      g.strokeStyle = 'rgba(8,14,12,0.7)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(cx, cy + dy, RX, RY, 0, a0, a1); g.stroke(); g.beginPath(); g.ellipse(cx, cy + dy, RX + 11, RY + 8, 0, a0, a1); g.stroke();
    }
  }
  mottle(g, xa - 2, 360, Wd, 192, 0.45);
  aoBand(g, xa - 2, xb + 2, 362, 24, 1, 0.45);
  for (const p of LAY.pillars) if (p.x + 200 > xa && p.x - 200 < xb) { const k = torchK(p.x); if (!k) continue; lightPool(g, p.x, 374, 120, 22, '255,200,120', 0.24 * k); lightPool(g, p.x + 20, 392, 80, 12, '255,210,140', 0.1 * k); }   // (the torches' light on the flags; dark gaps between)
  for (const cam of ARENAS) { const ax = cam + 480; if (ax + 300 > xa && ax - 300 < xb) lightPool(g, ax, 440, 240, 46, '230,210,170', 0.16); }   // (the arenas lit best)
  for (const mx of [760, 2330, 3660]) if (mx + 200 > xa && mx - 200 < xb) { lightPool(g, mx, 430, 110, 30, '170,210,225', 0.18); g.fillStyle = 'rgba(170,210,225,0.05)'; g.beginPath(); g.moveTo(mx - 30, 362); g.lineTo(mx + 10, 362); g.lineTo(mx + 70, 470); g.lineTo(mx - 50, 470); g.closePath(); g.fill(); }   // (a cool moonbeam from a grate high above)
  // slow green slime trails across the flags (the sloth's)
  for (let x = al(xa - 200, 420) - 420; x < xb + 200; x += 420) {
    const i = Math.round(x / 420); if (hash2(i, 330) < 0.4) continue;
    const sx = x + hash2(i, 331) * 300, sy = 400 + hash2(i, 332) * 100;
    g.strokeStyle = 'rgba(120,200,110,0.22)'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + 60, sy + 14 * (hash2(i, 333) - 0.5), sx + 130, sy + 8); g.stroke();
    g.strokeStyle = 'rgba(190,250,170,0.2)'; g.lineWidth = 3; g.stroke();
  }
  // the drain in the pit: an iron grate over a round pit, a green glow below
  if (xb > DRAIN_X - 190 && xa < DRAIN_X + 190) {
    const cx = DRAIN_X, cy = 428;
    ink(g, (g) => { g.beginPath(); g.ellipse(cx, cy, 112, 34, 0, 0, TAU); }, '#1a2420', 3.4);
    const gr = g.createRadialGradient(cx, cy, 8, cx, cy, 100); gr.addColorStop(0, 'rgba(150,240,130,0.55)'); gr.addColorStop(1, 'rgba(90,170,90,0.05)');
    g.save(); g.beginPath(); g.ellipse(cx, cy, 104, 29, 0, 0, TAU); g.clip(); g.fillStyle = gr; g.fillRect(cx - 110, cy - 34, 220, 68);
    g.strokeStyle = LINE; g.lineWidth = 6; for (let k = -6; k <= 6; k++) { g.beginPath(); g.moveTo(cx + k * 16, cy - 30); g.lineTo(cx + k * 16, cy + 30); g.stroke(); }
    g.strokeStyle = IRON.base; g.lineWidth = 3.4; for (let k = -6; k <= 6; k++) { g.beginPath(); g.moveTo(cx + k * 16, cy - 30); g.lineTo(cx + k * 16, cy + 30); g.stroke(); }
    g.restore();
    g.strokeStyle = IRON.hi; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, 108, 31, 0, Math.PI * 1.05, Math.PI * 1.9); g.stroke();
  }
  vgrad(g, xa - 2, 478, Wd, 548, [[0, 'rgba(4,8,6,0)'], [1, 'rgba(4,8,6,0.4)']]);
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0, wedge = 1, story = null, heldAt = null, fog = 0;   // (heldAt: a story's [x, y] where a hero holds the wedge up)
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    c.fog = makeSprite(536, 150, 8, 0, Math.min(csFar, 0.5), (g) => {   // (8 px of wrapped margin each side: the tiles' joints sample real fog, no seam)
      for (let i = 0; i < 16; i++) {
        const R = mulberry(400 + i), x = R.r(0, 520), y = R.r(40, 110), rx = R.r(70, 150), ry = R.r(22, 40);
        for (const dx of [-520, 0, 520]) {
          const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, rx); gr.addColorStop(0, 'rgba(170,210,190,0.5)'); gr.addColorStop(1, 'rgba(170,210,190,0)');
          g.save(); g.translate(0, y); g.scale(1, ry / rx); g.translate(0, -y); g.fillStyle = gr; g.fillRect(x + dx - rx, y - rx, rx * 2, rx * 2); g.restore();
        }
      }
    });
    c.torch = radialSprite(90, 0.5, [[0, 'rgba(255,214,130,0.55)'], [0.4, 'rgba(255,170,70,0.2)'], [1, 'rgba(255,140,40,0)']]);
    c.glow = radialSprite(64, 0.5, [[0, 'rgba(255,240,170,1)'], [0.3, 'rgba(255,200,80,0.7)'], [1, 'rgba(255,160,30,0)']]);
    c.ooze = radialSprite(120, 0.5, [[0, 'rgba(150,240,130,0.7)'], [0.5, 'rgba(110,200,100,0.25)'], [1, 'rgba(80,160,80,0)']]);
    c.puff = makeSprite(536, 90, 8, 0, 0.5, (g) => {   // (the fog's billowing tops, along the bottom edge: the book's c7s_yawn)
      for (let i = 0; i < 30; i++) { const R = mulberry(600 + i), x = R.r(0, 520), y = R.r(34, 74), rr = R.r(22, 50);
        for (const dx of [-520, 0, 520]) { const gr = g.createRadialGradient(x + dx, y - rr * 0.3, rr * 0.1, x + dx, y, rr); gr.addColorStop(0, 'rgba(206,232,218,0.45)'); gr.addColorStop(0.55, 'rgba(170,210,190,0.3)'); gr.addColorStop(1, 'rgba(170,210,190,0)'); g.fillStyle = gr; g.fillRect(x + dx - rr, y - rr, rr * 2, rr * 2); g.strokeStyle = 'rgba(225,245,235,0.22)'; g.lineWidth = 2; g.beginPath(); g.arc(x + dx, y, rr * 0.7, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); } }   // (a lit rim on each lobe)
      const bg = g.createLinearGradient(0, 40, 0, 90); bg.addColorStop(0, 'rgba(170,210,190,0)'); bg.addColorStop(0.35, 'rgba(170,210,190,0.5)'); bg.addColorStop(1, 'rgba(170,210,190,0.6)'); g.fillStyle = bg; g.fillRect(-8, 40, 536, 50);   // (the base band filling the gaps between lobes)
    });
    c.floor = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawFloor(g, xa, xb); });   // (the near layers after the little sprites: one scale for the floor and the wall)
    c.wall = buildStrip(-10, LEVEL_LEN + 10, 0, GT0 + 30, cs, 1, (g, xa, xb) => { setLS('mid'); drawWall(g, xa, xb); });
    balanceStrips([c.floor, c.wall], cs);
    return c;
  }
  // the corridor beyond each open cell (parallax .85): its walls receding to a lit doorway far off, a torch on its wall
  function farViews(ctx, camX, t) {
    const C = st.ensure();
    for (const c of CELLS) {
      if (c.shut !== 'open') continue;
      const sxL = c.xL - camX, sxR = c.xR - camX; if (sxR < -10 || sxL > W + 10) continue;
      const cw = sxR - sxL, scx = (sxL + sxR) / 2, vx = scx - (scx - W / 2) * 0.15, vy = c.yBot - 84;
      ctx.save(); archPath(ctx, sxL - 2, sxR + 2, c.yBot + 2, c.yTop - 2); ctx.clip();
      const vg = ctx.createLinearGradient(0, c.yTop, 0, c.yBot); vg.addColorStop(0, '#0c1311'); vg.addColorStop(1, '#1e2925'); ctx.fillStyle = vg; ctx.fillRect(sxL - 4, c.yTop - 4, cw + 8, c.yBot - c.yTop + 8);
      ctx.fillStyle = '#2c3632'; ctx.beginPath(); ctx.moveTo(sxL - 60, c.yBot + 2); ctx.lineTo(vx - 16, vy + 16); ctx.lineTo(vx + 16, vy + 16); ctx.lineTo(sxR + 60, c.yBot + 2); ctx.closePath(); ctx.fill();   // (its floor)
      ctx.strokeStyle = 'rgba(10,16,14,0.6)'; ctx.lineWidth = 1; for (let k = 1; k < 5; k++) { const u = k / 5; ctx.beginPath(); ctx.moveTo(lerp(vx - 16, sxL - 60, u * u), lerp(vy + 16, c.yBot, u * u)); ctx.lineTo(lerp(vx + 16, sxR + 60, u * u), lerp(vy + 16, c.yBot, u * u)); ctx.stroke(); }
      for (let k = 4; k >= 1; k--) {   // (the walls receding: a band of stone between each arch ring, lit and dark in turn, each ring with a lit lip)
        const s0 = k / 4.5, s1 = (k - 1) / 4.5 + 0.12, wo = cw * 0.96 * s0, wi = cw * 0.96 * s1, ab0 = lerp(vy + 16, c.yBot, s0), ab1 = lerp(vy + 16, c.yBot, s1);
        ctx.save(); archPath(ctx, vx - wo / 2, vx + wo / 2, ab0, ab0 - c.hgt * 0.95 * s0); ctx.fillStyle = k % 2 ? '#26322d' : '#1a2420'; ctx.fill();
        archPath(ctx, vx - wi / 2, vx + wi / 2, ab1, ab1 - c.hgt * 0.95 * s1); ctx.fillStyle = k % 2 ? '#1a2420' : '#141c19'; ctx.fill(); ctx.restore();
        archPath(ctx, vx - wo / 2, vx + wo / 2, ab0, ab0 - c.hgt * 0.95 * s0); ctx.strokeStyle = `rgba(150,175,160,${0.18 + 0.2 * s0})`; ctx.lineWidth = 1 + 2 * s0; ctx.stroke();
      }
      archPath(ctx, vx - 12, vx + 12, vy + 16, vy - 14); ctx.fillStyle = 'rgba(255,206,140,0.55)'; ctx.fill();   // (a lit doorway far off)
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.08 * Math.sin(t * 7 + c.i); ctx.drawImage(C.torch.c, vx - 50, vy - 60, 100, 100); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffb040'; ctx.beginPath(); ctx.ellipse(vx - cw * 0.22, c.yBot - c.hgt * 0.42 + Math.sin(t * 11 + c.i) * 0.6, 2.4, 4.4, 0, 0, TAU); ctx.fill();   // (a torch on its wall)
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(C.torch.c, vx - cw * 0.22 - 26, c.yBot - c.hgt * 0.42 - 30, 52, 52); ctx.restore();
    }
  }
  function fogBand(ctx, spr, camX, t, y, a, par, speed) {
    const w = 520, x0 = -((((camX * par + t * speed) % w) + w) % w);
    ctx.save(); ctx.globalAlpha = a;
    const T = ctx.getTransform ? ctx.getTransform() : { a: 1, e: 0 }, k = T.a || 1, xr = (Math.round(k * x0 + T.e) - T.e) / k, wr = Math.round(w * k) / k;   // (each tile on whole device pixels, the frame's own offset counted: no half-covered pixel at the joints, no seam)
    const L = spr.c.__live, m = spr.ox || 0, cw = L ? L.vw : spr.c.width, chh = L ? L.vh : spr.c.height, k2 = cw / spr.w;   // (a sprite with a wrapped margin -- cached or painted live: draw only its middle 520, the joints blend into real content)
    for (let x = xr; x < W; x += wr) ctx.drawImage(spr.c, m * k2, 0, w * k2, chh, x, y, wr, spr.h);
    ctx.restore();
  }
  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    ctx.fillStyle = '#0a1210'; ctx.fillRect(0, 0, W, H);
    farViews(ctx, camX, t);
    SEE_THROUGH = (g) => farViews(g, camX, t); drawStrip(ctx, C.wall, camX, s); SEE_THROUGH = null;
    // the wedge glowing in the open cell
    if (camX + W > WEDGE_X - 140 && camX < WEDGE_X + 140 + W) {
      const px = WEDGE_X - camX, py = 292;
      if (wedge > 0) {
        const gl = 0.7 + 0.3 * Math.sin(t * 3);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7 * gl; ctx.drawImage(C.glow.c, px - 56, py - 56, 112, 112); ctx.globalAlpha = 0.45 * gl; ctx.drawImage(C.glow.c, px - 56, 318, 112, 26); ctx.restore();   // (and on the straw under it)
        ctx.save(); ctx.translate(px, py + Math.sin(t * 2) * 2); ctx.rotate(Math.sin(t * 1.5) * 0.1);
        ctx.translate(14, 6); drawKeyPiece(ctx, 34); ctx.restore();
      }
    }
    // the torches' flames and glow (live)
    for (const tc of LAY.torches) {
      const sx = tc.x - camX, k = torchK(tc.x); if (sx < -60 || sx > W + 60 || !k) continue;
      const fl = Math.sin(t * 11 + tc.ph) * 2.2, h = (22 + 6 * k) + 5 * Math.sin(t * 13 + tc.ph * 2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.85 + 0.15 * Math.sin(t * 9 + tc.ph)) * Math.min(1, 0.5 + 0.5 * k); ctx.drawImage(C.torch.c, sx - 90, tc.y - 120, 180, 180); ctx.restore();
      ctx.beginPath(); ctx.moveTo(sx - 9, tc.y - 4); ctx.quadraticCurveTo(sx - 12, tc.y - 4 - h * 0.5, sx + fl, tc.y - 4 - h); ctx.quadraticCurveTo(sx + 12, tc.y - 4 - h * 0.5, sx + 9, tc.y - 4); ctx.closePath();
      ctx.fillStyle = '#ffa42a'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 5, tc.y - 4); ctx.quadraticCurveTo(sx - 6, tc.y - 4 - h * 0.35, sx + fl * 0.6, tc.y - 4 - h * 0.66); ctx.quadraticCurveTo(sx + 6, tc.y - 4 - h * 0.35, sx + 5, tc.y - 4); ctx.closePath(); ctx.fillStyle = '#fff0a0'; ctx.fill();
    }
    const kf = 0.6 + 0.8 * fogAt(camX + W / 2);   // (thin in the corridor, thick in the hall and the pit)
    fogBand(ctx, C.fog, camX, t, 150, (0.22 + 0.2 * fog) * kf, 0.8, 8);
    drawStrip(ctx, C.floor, camX, s);
    fogBand(ctx, C.puff, camX, t, H - 60, 0.2 + 0.15 * fog, 1.1, 10);   // (the fog's billows lying along the bottom of the floor, under the heroes)
    // the pit's drain: bubbles of green ooze
    if (camX + W > DRAIN_X - 150 && camX < DRAIN_X + 150) {
      const dx = DRAIN_X - camX, a = 0.6 + 0.25 * Math.sin(t * 2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(C.ooze.c, dx - 120, 428 - 70, 240, 140); ctx.restore();
      ctx.fillStyle = 'rgba(190,255,170,0.7)'; ctx.strokeStyle = 'rgba(40,90,40,0.8)'; ctx.lineWidth = 1.4;
      for (let k = 0; k < 4; k++) { const u = ((t * 0.4 + k * 0.25) % 1), bx = dx + (k - 1.5) * 34, by = 428 - u * 20; ctx.globalAlpha = 1 - u; ctx.beginPath(); ctx.ellipse(bx, by, 5 * (0.5 + u), 3 * (0.5 + u), 0, 0, TAU); ctx.fill(); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    if (heldAt) {   // a golden wedge held up in a story
      const [hx, hy] = heldAt, gl = 0.7 + 0.3 * Math.sin(t * 3);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8 * gl; ctx.drawImage(C.glow.c, hx - 50, hy - 50, 100, 100); ctx.restore();
      ctx.save(); ctx.translate(hx, hy + Math.sin(t * 2) * 2); ctx.rotate(Math.sin(t * 1.5) * 0.1);
      ctx.translate(16, 10); drawKeyPiece(ctx, 44); ctx.restore();
    }
    // drips from the vault
    ctx.save(); ctx.fillStyle = 'rgba(200,235,235,0.8)'; ctx.strokeStyle = 'rgba(200,235,235,0.6)'; ctx.lineWidth = 1.2;
    for (const d of LAY.drips) {
      const sx = d.x - camX; if (sx < -20 || sx > W + 20) continue;
      const u = ((t + d.ph) % d.per) / d.per, yl = d.y0 + 250;
      if (u < 0.5) { const y = d.y0 + (u * 2) ** 1.6 * 250; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(sx, y - 6); ctx.quadraticCurveTo(sx + 3.2, y + 1, sx, y + 3); ctx.quadraticCurveTo(sx - 3.2, y + 1, sx, y - 6); ctx.fill(); }   // (a drop, falling faster)
      else if (u < 0.62) { const k = (u - 0.5) / 0.12; ctx.globalAlpha = 0.7 * (1 - k); ctx.beginPath(); ctx.ellipse(sx, yl, 3 + k * 12, 1 + k * 3, 0, 0, TAU); ctx.stroke(); }   // (its splash ring)
    }
    ctx.restore();
    // the yawn fog: layers of grey-green drifting low (thicker while heroes are sleepy: setFog), and floating Zs
    fogBand(ctx, C.fog, camX, t, 300, (0.34 + 0.3 * fog) * kf, 1, 12);
    fogBand(ctx, C.fog, camX, t, 380, (0.26 + 0.34 * fog) * kf, 1.2, -9);
    ctx.save(); ctx.fillStyle = 'rgba(200,235,215,0.5)'; ctx.font = 'bold 22px Bangers, Impact, sans-serif'; ctx.textAlign = 'center';
    for (const m of LAY.motes) {
      const x = ((m.x - camX * 0.9 + Math.sin(t * 0.6 + m.ph) * m.sx) % 1300 + 1300) % 1300 - 170, y = 190 - ((t * 14 * m.sp + m.ph * 40 + m.y) % 130);   // (up high, above the heroes' heads: never mistaken for a sleepy hero's Zs)
      if (x < 0 || x > W || y < 60 || y > 190) continue;
      ctx.globalAlpha = 0.35 * Math.min(1, fogAt(x + camX) + 0.2); ctx.fillText('z', x, y);
    }
    ctx.restore();
    const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.45, W / 2, H * 0.5, W * 0.72); vg.addColorStop(0, 'rgba(4,8,8,0)'); vg.addColorStop(1, `rgba(4,8,8,${0.42 + 0.2 * fog})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (warm > 0.01) { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,190,110,${0.14 * warm})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
  }
  const NEAR = [300, 1450, 2480, 3430, 4400].filter((x) => clearOfArenas(x, 70, 1.25));
  function drawFront(ctx, camX, t = 0) {
    camX = clamp(+camX || 0, 0, CAM_MAX);
    const C = st.ensure();
    ctx.save();
    for (const p of LAY.pillars) {   // cobwebs in the vault's corners near the camera (anchored to the world)
      if (hash2(Math.round(p.x), 61) < 0.55) continue;
      const sx = frontX(p.x, camX, 1.15); if (sx < -100 || sx > W + 100) continue;
      ctx.globalAlpha = 0.5; cobweb(ctx, sx, -4, hash2(Math.round(p.x), 62) > 0.5 ? 1 : -1, 1, 60 + hash2(Math.round(p.x), 63) * 30, p.x);
    }
    ctx.globalAlpha = 1;
    for (const wx of NEAR) {   // an empty cage hung on a chain from the vault, near the camera (dark, a cool rim)
      const sx = frontX(wx, camX, 1.25), sw = Math.sin(t * 0.7 + wx) * 0.04; if (sx < -90 || sx > W + 90) continue;
      ctx.save(); ctx.translate(sx, -10); ctx.rotate(sw);
      ctx.strokeStyle = '#0a0e0c'; ctx.lineWidth = 3; for (let y = 0; y < 130; y += 9) { ctx.beginPath(); ctx.ellipse(0, y + 4, y % 18 ? 1.6 : 3.4, 4.6, 0, 0, TAU); ctx.stroke(); }
      const top = 132, bot = 214, hw = 30;
      ctx.fillStyle = 'rgba(8,12,10,0.35)'; ctx.beginPath(); ctx.moveTo(-hw, bot); ctx.lineTo(-hw, top + 14); ctx.quadraticCurveTo(0, top - 18, hw, top + 14); ctx.lineTo(hw, bot); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#0a0e0c'; ctx.lineWidth = 4.4; ctx.stroke();
      ctx.lineWidth = 3; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * hw / 2.5, top + 6 - Math.abs(k) * 2); ctx.lineTo(k * hw / 2.5, bot); ctx.stroke(); }
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-hw - 2, top + 44); ctx.lineTo(hw + 2, top + 44); ctx.moveTo(-hw - 3, bot); ctx.lineTo(hw + 3, bot); ctx.stroke();
      ctx.strokeStyle = 'rgba(160,200,185,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-hw + 1, bot - 2); ctx.lineTo(-hw + 1, top + 16); ctx.quadraticCurveTo(-hw * 0.5, top, -2, top - 1); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(4,8,6,0.4)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  /** the fog's thickness (0..1): it closes in while the heroes get sleepy (src/siworld.js stepCell) */
  function setFog(k) { fog = clamp(+k || 0, 0, 1); }
  /** the wedge in the cell (1 there .. 0 taken) */
  function setWedge(k) { wedge = clamp(+k || 0, 0, 1); }
  function setStory(bg) { story = bg; wedge = bg && bg.wedge !== undefined ? bg.wedge : 1; heldAt = bg && bg.wedgeAt ? bg.wedgeAt : null; fog = bg && bg.fog ? bg.fog : 0; }
  return { setScale: st.setScale, setWarm, setFog, setWedge, setStory, drawBack, drawFront, drawProp, fogAt, info: st.info, release: st.release, get warm() { return warm; }, get story() { return story; }, get __caches() { return st.C; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  jar:    { w: 46, h: 58, colors: ['#8a6a4a', '#5a4430', '#c8a070', '#a8e0c0'] },
  bucket: { w: 52, h: 50, colors: ['#7a5a3a', '#4a3424', '#a88050', '#9ab0c0'] },
  pillow: { w: 66, h: 38, colors: ['#e8d0e8', '#b898b8', '#fff4ff', '#ffe08a'] },
};
const PROP_DRAW = {
  jar(g) {   // a fat clay jar with a lip and a stripe
    ink(g, (g) => { g.beginPath(); g.moveTo(-12, -54); g.quadraticCurveTo(-15, -46, -21, -34); g.quadraticCurveTo(-28, -14, -16, 0); g.lineTo(16, 0); g.quadraticCurveTo(28, -14, 21, -34); g.quadraticCurveTo(15, -46, 12, -54); g.closePath(); }, '#8a6a4a', 2.8, (g) => {
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(-26, -56, 12, 58); g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(6, -56, 26, 58); g.fillStyle = '#4a8a6a'; g.fillRect(-30, -30, 60, 7);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -54, 14, 4.4, 0, 0, TAU); }, '#a8845a', 2.2);
  },
  bucket(g) {   // a wooden bucket with iron hoops and a handle
    ink(g, (g) => { g.beginPath(); g.moveTo(-20, -36); g.lineTo(20, -36); g.lineTo(24, 0); g.lineTo(-24, 0); g.closePath(); }, '#7a5a3a', 2.8, (g) => {
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(-24, -38, 10, 40); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(8, -38, 18, 40);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.4; for (const x of [-10, 0, 10]) { g.beginPath(); g.moveTo(x, -36); g.lineTo(x * 1.1, 0); g.stroke(); }
      for (const y of [-28, -8]) { g.fillStyle = '#5a6068'; g.fillRect(-26, y - 2.6, 52, 5.2); }
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -36, 20, 5.2, 0, 0, TAU); }, '#9ab0c0', 2.2);
    g.strokeStyle = INK; g.lineWidth = 3.6; g.beginPath(); g.moveTo(-20, -36); g.quadraticCurveTo(0, -56, 20, -36); g.stroke(); g.strokeStyle = '#8a9098'; g.lineWidth = 1.8; g.stroke();
  },
  pillow(g) {   // a fat plump pillow with tassels (a soft thing in a stone prison: it goes poof in feathers)
    ink(g, (g) => { g.beginPath(); g.moveTo(-30, -6); g.quadraticCurveTo(-34, -22, -22, -30); g.quadraticCurveTo(0, -38, 22, -30); g.quadraticCurveTo(34, -22, 30, -6); g.quadraticCurveTo(0, 4, -30, -6); g.closePath(); }, '#e8d0e8', 2.8, (g) => {
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(-34, -34, 30, 14); g.fillStyle = 'rgba(120,80,120,0.28)'; g.fillRect(8, -34, 30, 40);
      g.strokeStyle = 'rgba(120,80,120,0.5)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-22, -26); g.quadraticCurveTo(0, -12, 22, -26); g.stroke();
    });
    for (const [x, y] of [[-30, -6], [30, -6], [-28, -28], [28, -28]]) { g.fillStyle = '#ffe08a'; g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.fill(); g.stroke(); }
  },
};
