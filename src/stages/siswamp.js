// Dodongo's Quest - Skull Island stage 3b "THE SWAMP OF DESPAIR" (src/stages/siswamp.js): background, floor, the deep water, the Elder's clearing.
//
// The book's chapter six (docs/SKULL_ISLAND.md): a black bog of twisted trees under a sick green moon, hanging moss and mist; pools of KNEE-DEEP water
// that slow the heroes (waterAt, read by src/siworld.js); in the last screen the Elder Tree's clearing, packed earth under the great roots, and a
// hollow stump where a wedge of the Sun Key hides.  Three sections (world x):
//   bog 0-1500  |  gloom 1500-3600  |  elder 3600-5400 (the boss arena is the last screen).
// Back-to-front (drawBack): the sky and the sick moon -> far trees (parallax .3) -> mist -> mid trees (.6) -> mist -> the back bank and the canopy's moss
// (cached) -> the floor with its pools (cached) -> ripples -> the stump and its wedge -> low mist, fireflies, the vignette.  drawFront: reeds at the bottom edge.
// Setters (src/siworld.js, src/siswamp.js): setGloom(k 0..1), setWedge(k), setStory(bg).  Cached per scale (chunked strips, src/canvasmem.js); live: mist, ripples, fireflies.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, cacheCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 5400;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'bog', name: 'The Black Bog', x0: 0, x1: 1500 },
  { id: 'gloom', name: 'The Gloom', x0: 1500, x1: 3600 },
  { id: 'elder', name: "The Elder's Clearing", x0: 3600, x1: 5400 },
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
// a mid layer the near ones left starving (under half their scale): the near ones step down a rung, the mid one tries again (3 times at most)
function shareStrips(nearList, midSt, csFar) {
  for (let n = 0; n < 3; n++) {
    const sn = stripScale(nearList[0]), sf = stripScale(midSt);
    if (sf >= sn * 0.5 - 1e-6 || sn <= 0.75 + 1e-6) return;
    const lower = STRIP_RUNGS.find((v) => v < sn - 1e-6);
    midSt.redo(0); for (const st of nearList) st.redo(0);
    for (const st of nearList) { st.redo(lower); if (Math.abs(stripScale(st) - lower) > 1e-6) return; }
    for (const s2 of [csFar, ...STRIP_RUNGS.filter((v) => v < csFar - 1e-6)]) { midSt.redo(s2); if (Math.abs(stripScale(midSt) - s2) < 1e-6) break; }
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
const GT0 = 330;                                  // the floor strip's top (screen y); heroes' floor begins at 362
const ELDER_X = 5060, STUMP_X = 5140;             // the Elder's roots, and the hollow stump hiding at their foot
const LS = { far: ['#10181c', 0.5], mid: ['#0c0a12', 0.6], near: ['#0a0810', 0.8], front: ['#06060a', 0.9] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const ROWS = [350, 362, 376, 394, 418, 448, 484, 520, 546];
/** the deep water: world ranges [x0, x1] (the whole depth of the floor) where the heroes wade, knee-deep and slow (src/siworld.js) */
export const DEEP = [[200, 520], [1450, 1800], [2480, 2800], [3480, 3800]];
export const WADE_K = 0.66;
/** 0 = mud .. 1 = knee-deep water at world x (a short soft edge) */
export function waterAt(x) {
  for (const [a, b] of DEEP) if (x > a - 14 && x < b + 14) return Math.max(0, Math.min(1, (x - a + 14) / 28, (b + 14 - x) / 28));
  return 0;
}

const LAY = (() => {
  const R = mulberry(5412);
  const flies = [], ripples = [];
  for (let i = 0; i < 26; i++) flies.push({ x: R.r(0, 1300), y: R.r(140, 470), sx: R.r(6, 18), sy: R.r(4, 14), ph: R.r(0, TAU), r: R.r(1.4, 2.6) });
  for (const [a, b] of DEEP) for (let i = 0; i < 7; i++) ripples.push({ x: R.r(a + 24, b - 24), y: R.r(374, 520), ph: R.r(0, 6), per: R.r(2.4, 4.4) });
  return { flies, ripples };
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
// the Sun Key's piece from the swamp (book2/panels/sunkey_canon.png: the disc's lower sector, 4 to 8 o'clock, the face's smile on it); origin
// the disc's centre (the piece's point), r the disc's radius
const KEY_A0 = Math.PI / 6, KEY_A1 = Math.PI * 5 / 6;
function drawKeyPiece(ctx, r) {
  const rs = r * 0.36, slice = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, KEY_A0, KEY_A1); ctx.closePath(); };
  ctx.save(); ctx.translate(r * 0.04, r * 0.07); slice(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  const gr = ctx.createRadialGradient(-r * 0.2, r * 0.2, 0, 0, 0, r); gr.addColorStop(0, '#ffd85a'); gr.addColorStop(1, '#e0a22a');
  slice(); ctx.fillStyle = gr; ctx.fill();
  ctx.save(); slice(); ctx.clip();
  ctx.strokeStyle = 'rgba(140,90,16,0.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, KEY_A0, KEY_A1); ctx.stroke();
  keyRays(ctx, r, rs, KEY_A0, KEY_A1, '#ffe690', 'rgba(90,56,10,0.9)');
  const fg = ctx.createRadialGradient(-rs * 0.3, -rs * 0.3, 0, 0, 0, rs); fg.addColorStop(0, '#ffeaa0'); fg.addColorStop(1, '#eeb040');
  ctx.beginPath(); ctx.arc(0, 0, rs, 0, TAU); ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = 'rgba(70,40,8,0.95)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.strokeStyle = '#6a3c08'; ctx.lineWidth = Math.max(1.4, rs * 0.1); ctx.beginPath(); ctx.arc(0, rs * 0.1, rs * 0.5, Math.PI * 0.25, Math.PI * 0.75); ctx.stroke();   // (the smile)
  ctx.fillStyle = 'rgba(255,255,240,0.7)'; ctx.beginPath(); ctx.ellipse(-r * 0.3, r * 0.6, r * 0.1, r * 0.05, -0.4, 0, TAU); ctx.fill();
  ctx.restore();
  slice(); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
}
// a tapered limb (a branch, a root): points [x, y, ...] and widths w0 -> w1; an outline pass, then the fill, then a light rim along its upper edge
function limb(g, pts, w0, w1, col, line, rim) {
  const n = (pts.length >> 1) - 1;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pass of [0, 1, 2]) {
    if (pass === 2 && !rim) break;
    for (let i = 0; i < n; i++) {
      const f = i / n, w = lerp(w0, w1, f);
      g.strokeStyle = pass === 0 ? line : pass === 1 ? col : rim;
      g.lineWidth = pass === 0 ? w + 3 * LK + 1 : pass === 1 ? w : Math.max(1, w * 0.28);
      g.beginPath();
      g.moveTo(pts[i * 2] - (pass === 2 ? w * 0.22 : 0), pts[i * 2 + 1] - (pass === 2 ? w * 0.18 : 0));
      g.lineTo(pts[i * 2 + 2] - (pass === 2 ? w * 0.22 : 0), pts[i * 2 + 3] - (pass === 2 ? w * 0.18 : 0));
      g.stroke();
    }
  }
  g.restore();
}
// a wavy chain of points from (x0, y0) toward (x1, y1) with sideways jitter (seeded)
function wavy(x0, y0, x1, y1, seed, n, jit) {
  const o = [x0, y0];
  for (let k = 1; k < n; k++) { const t = k / n; o.push(lerp(x0, x1, t) + (hash2(seed, k) - 0.5) * jit, lerp(y0, y1, t) + (hash2(seed, k + 7) - 0.5) * jit * 0.5); }
  o.push(x1, y1);
  return o;
}
// a strand of hanging moss: a few drooping wisps of grey-green
function mossStrand(g, x, y, len, seed, a = 1) {
  for (let k = 0; k < 3; k++) {
    const sw = (hash2(seed, k + 3) - 0.5) * 14, l = len * (0.6 + 0.4 * hash2(seed, k + 9)), ox = (k - 1) * 3.2;
    g.strokeStyle = rgba(mix('#52703e', '#8aa070', hash2(seed, k + 15)), a * 0.85); g.lineWidth = 2.6 - k * 0.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + ox, y); g.quadraticCurveTo(x + ox + sw, y + l * 0.55, x + ox + sw * 0.4, y + l); g.stroke();
  }
}
// a clump of hanging moss (the book's: ragged sheets, not hairs): it hugs the bough and drips into 2-4 tails of different lengths
function mossClump(g, x, y, len, seed, a = 1) {
  const w = 8 + hash2(seed, 1) * 7, n = 2 + Math.floor(hash2(seed, 2) * 3), lean = (hash2(seed, 3) - 0.5) * 12;
  const pts = [x - w / 2, y - 2];
  for (let k = 0; k < n; k++) {
    const f0 = k / n, f1 = (k + 0.5) / n, l = len * (0.4 + 0.6 * hash2(seed, 10 + k));
    if (k) pts.push(x - w / 2 + f0 * w, y + len * 0.16 + hash2(seed, 20 + k) * len * 0.12);   // (the notch between two tails)
    pts.push(x - w / 2 + f1 * w + lean * l / len, y + l);   // (a tail's tip)
  }
  pts.push(x + w / 2, y + len * 0.18, x + w / 2, y - 2);
  const path = () => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length - 2; i += 2) { const mx = (pts[i] + pts[i + 2]) / 2, my = (pts[i + 1] + pts[i + 3]) / 2; g.quadraticCurveTo(pts[i], pts[i + 1], mx, my); } g.lineTo(pts[pts.length - 2], pts[pts.length - 1]); g.closePath(); };
  g.save(); g.globalAlpha = a;
  path(); g.fillStyle = mix('#4a6434', '#7a9458', hash2(seed, 4)); g.fill();
  g.save(); path(); g.clip(); const sg = g.createLinearGradient(0, y, 0, y + len); sg.addColorStop(0, 'rgba(200,226,150,0.2)'); sg.addColorStop(0.35, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(8,14,6,0.4)'); g.fillStyle = sg; g.fillRect(x - w, y - 4, w * 2 + 12, len + 8); g.restore();
  g.fillStyle = mix('#4a6434', '#7a9458', hash2(seed, 4)); g.beginPath(); g.moveTo(x - w * 0.62, y); for (let q = 0; q <= 6; q++) { const u = q / 6; g.lineTo(x - w * 0.62 + u * w * 1.24, y - 2.4 - 1.6 * Math.sin(u * Math.PI) - hash2(seed, 30 + q) * 1.6); } g.lineTo(x + w * 0.62, y); g.closePath(); g.fill();   // (its top wrapped over the bough, ragged)
  g.strokeStyle = rgba(mix('#6a8450', '#9ab070', hash2(seed, 6)), 0.7); g.lineWidth = 1; for (let q = 0; q < 1 + (hash2(seed, 7) > 0.5 ? 1 : 0); q++) { const wx = x - w / 2 + w * (0.25 + 0.5 * q), wl = len * (0.7 + 0.5 * hash2(seed, 8 + q)); g.beginPath(); g.moveTo(wx, y + len * 0.3); g.quadraticCurveTo(wx + lean * 0.4, y + wl * 0.8, wx + lean * 0.6, y + wl + 10); g.stroke(); }   // (a thin wisp past the tails)
  g.strokeStyle = rgba(LINE, 0.55); g.lineWidth = 1.1; path(); g.stroke();
  g.restore();
}
// a clump of reeds with cattails: blades fanning from (x, y), some topped with a brown cattail
function reeds(g, x, y, k, seed, col = '#46602e') {
  const n = 5 + Math.floor(hash2(seed, 1) * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * 0.9 + (hash2(seed, i + 2) - 0.5) * 0.25, hh = (46 + hash2(seed, i + 12) * 46) * k, tx = x + Math.sin(a) * hh, ty = y - Math.cos(a) * hh;
    g.strokeStyle = LINE; g.lineWidth = 4.4 * k * LK + 1; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + (i - n / 2) * 2.4 * k, y); g.quadraticCurveTo(x + Math.sin(a) * hh * 0.3, y - hh * 0.6, tx, ty); g.stroke();
    g.strokeStyle = mix(col, '#9ab060', hash2(seed, i + 22) * 0.5); g.lineWidth = 2.6 * k; g.stroke();
    if (hash2(seed, i + 32) > 0.62) { g.fillStyle = '#5a3a22'; g.strokeStyle = LINE; g.lineWidth = 1.4; g.beginPath(); g.ellipse(tx, ty - 5 * k, 3.4 * k, 9 * k, Math.sin(a) * 0.5, 0, TAU); g.fill(); g.stroke(); }
  }
}
// a gnarled swamp tree: a swaying trunk with root flares, forked limbs, moss; (bx, by) = its foot, h its height
function twistTree(g, bx, by, h, w0, seed, col, rim, line, side = -1) {
  const N = 9, Lp = [], Rp = [], mid = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N, y = by - h * t, cx = bx + Math.sin(t * 3.4 + seed) * 22 * t + (hash2(seed, k) - 0.5) * 9 * t, w = w0 * (1 - 0.72 * Math.pow(t, 0.9)) * (1 + (hash2(seed, k + 20) - 0.5) * 0.22);
    Lp.push(cx - w, y); Rp.push(cx + w, y); mid.push(cx, y);
  }
  for (const s of [-1, 1]) for (let r = 0; r < 2; r++) {   // root flares at the foot
    const rl = (w0 * 1.5 + hash2(seed, 40 + r) * 36) * (r ? 0.7 : 1);
    limb(g, [bx + s * w0 * 0.5, by - 14, bx + s * w0 * (0.9 + r * 0.3), by - 3, bx + s * rl, by + 4 + r * 2], 9, 3, col, line);
  }
  const poly2 = Lp.slice(); for (let k = Rp.length - 2; k >= 0; k -= 2) poly2.push(Rp[k], Rp[k + 1]);
  g.fillStyle = 'rgba(4,6,8,0.5)'; g.beginPath(); g.ellipse(bx, by + 2, w0 * 2.4, 9, 0, 0, TAU); g.fill();   // (occlusion where it meets the ground)
  ink(g, (g) => poly(g, poly2), col, 2.6, (g) => {
    if (side < 0) { g.fillStyle = rgba(rim, 0.4); g.fillRect(bx - w0 * 1.4, by - h - 4, w0 * 0.7, h + 8); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx + w0 * 0.1, by - h - 4, w0 * 1.6, h + 8); }
    else { g.fillStyle = rgba(rim, 0.4); g.fillRect(bx + w0 * 0.7, by - h - 4, w0 * 0.7, h + 8); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx - w0 * 1.7, by - h - 4, w0 * 1.6, h + 8); }
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.4;   // (bark: furrows running up the trunk, wandering)
    for (let f = 0; f < 5; f++) { const fx = (f - 2) / 2.5; g.beginPath(); for (let k = 0; k <= N; k++) { const x = mid[k * 2] + fx * (Lp[k * 2 + 0] - mid[k * 2]) * -1 + Math.sin(k * 1.7 + f + seed) * 2, y = mid[k * 2 + 1]; if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
    g.strokeStyle = rgba(rim, 0.3); g.lineWidth = 1; for (let f = 0; f < 3; f++) { const fx = -0.7 + f * 0.25; g.beginPath(); for (let k = 0; k <= N; k++) { const x = mid[k * 2] + fx * (Rp[k * 2] - mid[k * 2]) + Math.sin(k * 1.3 + f + seed) * 2, y = mid[k * 2 + 1] - 3; if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
    mottle(g, bx - w0 * 2, by - h - 8, w0 * 4, h + 16, 0.5);
    const mg = g.createLinearGradient(bx + side * w0 * 1.2, 0, bx + side * w0 * 0.4, 0); mg.addColorStop(0, rgba('#c4d890', 0.45)); mg.addColorStop(1, rgba('#c4d890', 0)); g.fillStyle = mg; g.fillRect(side < 0 ? bx - w0 * 1.6 : bx + w0 * 0.3, by - h - 4, w0 * 1.3, h + 8);   // (the moon on the edge that faces it)
  }, line);
  // forked limbs with hanging moss
  for (let b = 0; b < 4; b++) {
    const t = 0.42 + b * 0.16 + hash2(seed, 50 + b) * 0.06, i = Math.min(N, Math.round(t * N)), s = b % 2 ? 1 : -1, sx = mid[i * 2], sy = mid[i * 2 + 1];
    const len = 70 + hash2(seed, 60 + b) * 80, ex = sx + s * len, ey = sy - 30 - hash2(seed, 70 + b) * 50;
    const cx1 = sx + s * len * 0.45, cy1 = sy - 6 - hash2(seed, 80 + b) * 22, lp = [];   // (a bough: one curve, tapering hard -- never a kinked pipe)
    for (let k = 0; k <= 8; k++) { const u = k / 8, a1 = 1 - u; lp.push(a1 * a1 * sx + 2 * a1 * u * cx1 + u * u * ex + Math.sin(u * 7 + seed + b) * 2.4 * u, a1 * a1 * sy + 2 * a1 * u * cy1 + u * u * ey); }
    limb(g, lp, 13 - b * 1.8, 1.6, col, line, rim);
    const ux0 = ex - lp[12], uy0 = ey - lp[13], ul = Math.hypot(ux0, uy0) || 1, ux = ux0 / ul, uy = uy0 / ul;
    for (let f = 0; f < 2 + (hash2(seed, 85 + b) > 0.5 ? 1 : 0); f++) {   // (claw twigs forking off its end)
      const an = (f - 0.8) * 0.75 + (hash2(seed, 86 + b + f) - 0.5) * 0.3, ca = Math.cos(an), sa = Math.sin(an), tx = ux * ca - uy * sa, ty = ux * sa + uy * ca, tl = 14 + hash2(seed, 88 + b + f) * 18;
      const fx = lerp(lp[10], ex, 0.4), fy = lerp(lp[11], ey, 0.4);
      limb(g, [fx, fy, fx + tx * tl * 0.55 + ty * 3, fy + ty * tl * 0.55 - tx * 3, fx + tx * tl, fy + ty * tl + 5], 3, 1, col, line);
    }
    { const nm = Math.floor(hash2(seed, 95 + b) * 4); for (let m = 0; m < nm; m++) { const u = 0.12 + 0.62 * hash2(seed, 96 + b * 3 + m) ** 1.4, k = Math.round(u * 8), sz = 0.5 + 1.1 * hash2(seed, 97 + b * 3 + m) * (1 - u * 0.5); mossClump(g, lp[k * 2], lp[k * 2 + 1] + 3, (30 + hash2(seed, 90 + b * 3 + m) * 46) * sz, seed * 7 + b * 3 + m); } }   // (0-3, jittered, heavier near the trunk; some boughs bare)
  }
}

// the far trees (haze): tall pale silhouettes with a ragged top of canopy, no outlines
function drawFarTrees(g, xa, xb) {
  for (let x = al(xa - 200, 140) - 140; x < xb + 200; x += 140) {
    const i = Math.round(x / 140), h = hash2(i, 5);
    if (h < 0.16) continue;
    const bx = x + hash2(i, 6) * 110, w = 14 + hash2(i, 7) * 26, top = 10 + hash2(i, 8) * 90;
    g.fillStyle = mix('#33432f', '#25331f', hash2(i, 9));
    g.beginPath(); g.moveTo(bx - w * 1.7, 336); g.quadraticCurveTo(bx - w * 0.6, 300, bx - w * 0.42, top + 80); g.lineTo(bx - w * 0.3, top); g.lineTo(bx + w * 0.3, top + 6); g.lineTo(bx + w * 0.44, top + 80); g.quadraticCurveTo(bx + w * 0.6, 300, bx + w * 1.7, 336); g.closePath(); g.fill();
    for (let b = 0; b < 3; b++) {   // drooping limbs with moss
      const s = b % 2 ? 1 : -1, y0 = top + 30 + b * 46, ex = bx + s * (50 + hash2(i, 20 + b) * 60);
      g.strokeStyle = g.fillStyle; g.lineWidth = 7 - b; g.lineCap = 'round'; g.beginPath(); g.moveTo(bx, y0 + 14); g.quadraticCurveTo(bx + s * 30, y0 - 12, ex, y0 + 18); g.stroke();
      for (let m = 0; m < 3; m++) mossStrand(g, lerp(bx, ex, 0.4 + m * 0.25), y0 + 6 + m * 3, 34 + hash2(i, 30 + b * 3 + m) * 40, i * 13 + b * 3 + m, 0.55);
    }
  }
  vgrad(g, xa - 4, 200, xb - xa + 8, 340, [[0, 'rgba(96,116,76,0)'], [1, 'rgba(96,116,76,0.55)']]);   // (the chunk's own range: never twice in the overlap)   // (vgrad's 5th argument is the bottom y)
}
// the mid layer's trees (layer x, parallax .6): which stand where -- fewer in the Elder's clearing (its screens: layer x > 2500); shared by the
// cache and the live eyes
function midTree(i) {
  const x = i * 230, h = hash2(i, 15);
  if (h < (x > 2500 ? 0.5 : 0.12)) return null;
  return { bx: x + hash2(i, 16) * 160, ht: 250 + hash2(i, 17) * 90, w0: 26 + hash2(i, 18) * 16 };
}
// which edge of a mid tree the moon lights (-1 left, 1 right): where the moon is when that tree stands mid-screen (moon screen x 560 - camX * .05)
const MOON_X = (camX) => 900 - camX * 0.16;   // (the moon's screen x: a far object, drifting across the sky as the heroes go -- one moon over the whole bog)
const moonSide = (bx) => (MOON_X((bx - 480) / 0.6) - 480 > 0 ? 1 : -1);
// the mid trees: black, gnarled, outlined; a few with a glowing mushroom shelf
function drawMidTrees(g, xa, xb) {
  for (let x = al(xa - 260, 230) - 230; x < xb + 260; x += 230) {
    const i = Math.round(x / 230), T = midTree(i);
    if (!T) continue;
    const { bx, ht, w0 } = T;
    twistTree(g, bx, 344, ht, w0, i * 5 + 3, mix('#18161e', '#22201e', hash2(i, 19)), '#4a5848', '#08060c', moonSide(bx));
    if (hash2(i, 25) > 0.7) {   // (shelf fungus on a third of the trees: 1-4 caps of different sizes, tilted, their glow soft on the bark)
      const n = 1 + Math.floor(hash2(i, 29) * 4), my0 = 344 - 54 - hash2(i, 27) * 80, sd = hash2(i, 26) > 0.5 ? 1 : -1;
      const gl = g.createRadialGradient(bx + sd * w0 * 0.5, my0 - 16, 0, bx + sd * w0 * 0.5, my0 - 16, 56); gl.addColorStop(0, 'rgba(120,255,200,0.2)'); gl.addColorStop(1, 'rgba(120,255,200,0)'); g.fillStyle = gl; g.fillRect(bx - 70, my0 - 80, 140, 130);
      for (let k = 0; k < n; k++) {
        const r = 5 + hash2(i, 30 + k) * 7, mx = bx + sd * (w0 * 0.62 + r * 0.5) + (hash2(i, 34 + k) - 0.5) * 6, my = my0 - k * (r + 9) - hash2(i, 36 + k) * 6, tl = -sd * (0.1 + hash2(i, 38 + k) * 0.25);
        g.save(); g.translate(mx, my); g.rotate(tl);
        ink(g, (g) => { g.beginPath(); g.ellipse(0, 0, r, r * 0.5, 0, Math.PI, 0); g.quadraticCurveTo(0, r * 0.22, -r, 0); g.closePath(); }, '#6ad8b0', 1.6, (g) => { g.fillStyle = 'rgba(220,255,236,0.55)'; g.fillRect(-r, -r * 0.5, r * 2, r * 0.16); g.strokeStyle = 'rgba(20,70,50,0.6)'; g.lineWidth = 0.8; for (let q = -2; q <= 2; q++) { g.beginPath(); g.moveTo(q * r * 0.3, r * 0.06); g.lineTo(q * r * 0.36, -r * 0.18); g.stroke(); } });
        g.restore();
      }
    }
  }
}
// the back bank (y 280..372): reeds, ferns, logs, mud mounds, glowing mushrooms along the floor's far edge; and the canopy's hanging moss at the top
function drawNear(g, xa, xb) {
  for (let x = al(xa - 160, 70) - 70; x < xb + 160; x += 70) {
    const i = Math.round(x / 70), h = hash2(i, 35), bx = x + hash2(i, 36) * 60, kind0 = hash2(i, 37), kind = Math.abs(bx - STUMP_X) < 170 && kind0 >= 0.62 ? 1 : kind0;   // (nothing on the bank right behind the stump)
    if (kind < 0.45) { if (vnoise(x, 330, 41) > -0.12) { reeds(g, bx, 354 + hash2(i, 38) * 10, 0.5 + h * 1.1, i * 3 + 1); if (hash2(i, 39) > 0.5) reeds(g, bx + 18 + hash2(i, 40) * 14, 358 + hash2(i, 42) * 8, 0.45 + hash2(i, 43) * 0.5, i * 3 + 2); } }   // (in clusters, sizes varied, gaps between)
    else if (kind < 0.62) {   // a fern: fronds in a fan
      for (let f = 0; f < 7; f++) { const a = -2.4 + f * 0.62, l = 34 + hash2(i, f + 40) * 22; g.strokeStyle = LINE; g.lineWidth = 5 * LK + 1; g.lineCap = 'round'; g.beginPath(); g.moveTo(bx, 356); g.quadraticCurveTo(bx + Math.cos(a) * l * 0.5, 356 + Math.sin(a) * l * 0.9, bx + Math.cos(a) * l, 356 + Math.sin(a) * l * 0.8); g.stroke(); g.strokeStyle = mix('#3a6a34', '#6a9a48', hash2(i, f + 50)); g.lineWidth = 3; g.stroke(); }
    } else if (kind < 0.74) {   // a mud mound with a mushroom or two
      ink(g, (g) => { g.beginPath(); g.ellipse(bx, 358, 30 + h * 14, 11, 0, Math.PI, 0); g.closePath(); }, '#2c281a', 2.2, (g) => { g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(bx - 50, 340, 40, 20); });
      const nm = 1 + Math.floor(hash2(i, 39) * 4); for (let m = 0; m < nm; m++) { const rr = 4 + hash2(i, 60 + m) * 5, mx = bx - 16 + (m + hash2(i, 64 + m) * 0.6) * (32 / nm), st2 = 3 + hash2(i, 68 + m) * 7, my = 352 - st2; g.fillStyle = 'rgba(120,255,200,0.18)'; g.beginPath(); g.ellipse(mx, my - 2, rr * 1.7, rr, 0, 0, TAU); g.fill(); g.fillStyle = '#d8f0d0'; g.fillRect(mx - 1.2, my, 2.4, st2 + 2); ink(g, (g) => { g.beginPath(); g.ellipse(mx, my, rr, rr * 0.7, (hash2(i, 72 + m) - 0.5) * 0.4, Math.PI, 0); g.closePath(); }, '#7ae8c0', 1.6); }   // (1-4 caps, sizes and heights varied)
    } else if (kind < 0.8) {   // a rotten log
      ink(g, (g) => { roundRect(g, bx - 44, 342, 88, 15, 7); }, '#2a2830', 1.4, (g) => { g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.2; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(bx - 30 + k * 26, 345); g.quadraticCurveTo(bx - 20 + k * 26, 350, bx - 10 + k * 26, 346); g.stroke(); } g.fillStyle = 'rgba(100,150,70,0.6)'; g.beginPath(); g.ellipse(bx - 6, 343, 18, 3.4, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(bx + 22, 344, 8, 2.6, 0, 0, TAU); g.fill(); });   // (a sunken log: the cool bark, a thin line -- never the breakable log)
      ink(g, (g) => { g.beginPath(); g.ellipse(bx + 40, 350, 6, 8, 0, 0, TAU); }, '#5a4a3a', 1.2, (g) => { g.strokeStyle = 'rgba(40,30,20,0.6)'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(bx + 40, 350, 3, 4.4, 0, 0, TAU); g.stroke(); });   // (its broken end, the rings)
      g.fillStyle = '#3a4630'; g.beginPath(); g.ellipse(bx - 44, 356, 16, 8, 0, Math.PI, TAU); g.fill(); g.beginPath(); g.ellipse(bx + 8, 358, 12, 5, 0, Math.PI, TAU); g.fill();   // (mud over it)
    }
  }
  { const mg = g.createLinearGradient(0, 298, 0, 368); mg.addColorStop(0, 'rgba(176,200,150,0)'); mg.addColorStop(0.55, 'rgba(176,200,150,0.22)'); mg.addColorStop(1, 'rgba(176,200,150,0)'); g.fillStyle = mg; g.fillRect(xa - 4, 298, xb - xa + 8, 70); }   // (a low mist lying along the bank's edge, over the plants' feet: baked -- only on the chunk's own range, never twice in the overlap two chunks share)
  // the canopy's hanging moss and vines (the top of the screen)
  vgrad(g, xa - 4, 0, xb - xa + 8, 90, [[0, 'rgba(6,8,12,0.9)'], [1, 'rgba(6,8,12,0)']]);   // (the chunk's own range: a translucent fill drawn twice in the shared overlap would show a stripe)
  const bough = (x) => 6 + 9 * vnoise(x, 140, 46) + 4 * vnoise(x, 37, 47);   // (a dark branch across the canopy for the moss to hang from)
  { const bp = []; for (let x = al(xa - 20, 10); x <= xb + 20; x += 10) bp.push(x, bough(x)); g.strokeStyle = '#0c0e0a'; g.lineWidth = 9; polyline(g, bp); g.stroke(); for (let x = al(xa - 60, 150); x < xb + 60; x += 150) { const i = Math.round(x / 150), kx = x + hash2(i, 52) * 120, ky = bough(kx); g.fillStyle = '#0c0e0a'; g.beginPath(); g.ellipse(kx, ky + 1, 7, 6, 0, 0, TAU); g.fill(); if (hash2(i, 53) > 0.5) { g.lineWidth = 4; g.beginPath(); g.moveTo(kx, ky); g.quadraticCurveTo(kx + 14, ky - 2, kx + 26, ky + 14 + hash2(i, 54) * 10); g.stroke(); } }   /* (knots and a twig forking down here and there) */ g.strokeStyle = 'rgba(90,110,70,0.35)'; g.lineWidth = 1.4; polyline(g, bp.map((v, j) => (j & 1 ? v - 3 : v))); g.stroke(); }
  for (let x = al(xa - 100, 84) - 84; x < xb + 100; x += 84) {
    const i = Math.round(x / 84);
    if (hash2(i, 45) < 0.45) continue;
    const mx2 = x + hash2(i, 46) * 60; mossClump(g, mx2, bough(mx2) + 2, (40 + hash2(i, 47) * 100) * (0.6 + 0.8 * hash2(i, 51)), i * 3 + 700, 0.95);
    if (hash2(i, 48) > 0.65) { const mx3 = x + 20 + hash2(i, 49) * 40; mossClump(g, mx3, bough(mx3) + 2, 24 + hash2(i, 50) * 50, i * 3 + 701, 0.85); }
  }
  for (let x = al(xa - 300, 520) - 520; x < xb + 300; x += 520) {   // a few big vines with leaves
    const i = Math.round(x / 520), vx = x + hash2(i, 55) * 400, len = 140 + hash2(i, 56) * 110;
    limb(g, [vx, -6, vx + 8, len * 0.3, vx - 6, len * 0.62, vx + 4, len], 7, 2.6, '#26321e', '#08100a', '#4a6a34');
    for (let k = 0; k < 4; k++) { const ly = len * (0.2 + k * 0.2), lx = vx + (k % 2 ? 10 : -10); ink(g, (g) => { g.beginPath(); g.ellipse(lx + (k % 2 ? 12 : -12), ly, 13, 6, k % 2 ? 0.5 : -0.5, 0, TAU); }, '#3e6a34', 2); }
  }
}
// a pool's outline (world): its two banks, wavering down the floor, and the far shore -- the floor's cache and the live reflections share it
const POOLS = DEEP.map(([a, b]) => {
  const L = [], R = [];
  for (let y = GT0 + 20; y <= H + 6; y += 8) { L.push(a + 20 * vnoise(y, 46, (a | 0) + 3), y); R.push(b + 20 * vnoise(y, 46, (b | 0) + 5), y); }
  const pp = L.slice(); for (let k = R.length - 2; k >= 0; k -= 2) pp.push(R[k], R[k + 1]);
  for (let x = b; x >= a; x -= 10) pp.push(x, 350 + 7 * vnoise(x, 38, 9));   // (the far shore: wavy, not a ruled line)
  return { a, b, L, R, pp };
});
// the floor: a dim olive mud with tufts, pebbles and puddles; knee-deep pools (DEEP) of dark green water with lily pads; the Elder's clearing
function drawFloor(g, xa, xb) {
  const Wd = xb - xa + 4;
  vgrad(g, xa - 2, GT0, Wd, H, [[0, 'rgba(74,88,62,0)'], [0.05, '#4a5640'], [0.15, '#363a28'], [0.4, '#2e2c1c'], [1, '#423a22']]);
  // the mud, rows widening toward the camera: speckle, pebbles, grass tufts, puddles
  for (let r = 0; r < ROWS.length - 1; r++) {
    const y0 = ROWS[r], y1 = ROWS[r + 1], k = 0.7 + 0.55 * r / 8, cw = 56 + r * 10;
    for (let x = al(xa - 80, cw) - cw; x < xb + 80; x += cw) {
      const i = Math.round(x / cw), h = hash2(i, r + 100), mx = x + hash2(i, r + 101) * cw, my = y0 + 3 + hash2(i, r + 102) * (y1 - y0 - 6);
      if (waterAt(mx) > 0.02 && h < 0.97) continue;
      if (h < 0.18) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(mx, my, 20 * k, 4.4 * k, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(176,200,140,0.28)'; g.beginPath(); g.ellipse(mx - 3 * k, my - 0.6 * k, 12 * k, 1.6 * k, 0, 0, TAU); g.fill(); }   // a puddle, a pale sky in it
      else if (h < 0.4) { g.strokeStyle = 'rgba(100,150,70,0.85)'; g.lineWidth = 1.6 * k; g.lineCap = 'round'; for (let b = 0; b < 5; b++) { const bx = mx + (b - 2) * 3.4 * k; g.beginPath(); g.moveTo(bx, my); g.quadraticCurveTo(bx + (b - 2) * 1.5 * k, my - 6 * k, bx + (b - 2) * 3 * k, my - (9 + hash2(i, b + r * 5) * 6) * k); g.stroke(); } }   // grass
      else if (h < 0.6) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(mx + 1, my + 1.2, 6 * k, 2.8 * k, 0, 0, TAU); g.fill(); g.fillStyle = '#5a5238'; g.beginPath(); g.ellipse(mx, my, 6 * k, 2.8 * k, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(mx - 3 * k, my - 2 * k, 4 * k, 1.1 * k); }   // a pebble
      else if (h < 0.7) { g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(mx - 10 * k, my); g.lineTo(mx, my + 2 * k); g.lineTo(mx + 9 * k, my - 1); g.stroke(); }   // a crack in the dry mud
    }
  }
  mottle(g, xa - 2, 346, Wd, 210, 0.5, 1.7);
  for (let x = al(xa - 400, 400); x < xb + 400; x += 400) { const i = Math.round(x / 400), cx = x + 200 + (hash2(i, 140) - 0.5) * 160; lightPool(g, cx, 430, 260, 70, '176,206,130', 0.16 + 0.08 * hash2(i, 141)); }   // (the moon's light falling unevenly on the mud)
  for (const cam of ARENAS) { const cx = cam + 480; if (cx + 300 > xa && cx - 300 < xb) lightPool(g, cx + 40, 446, 230, 46, '196,220,150', 0.2); }   // (a moonlit patch in each fight's lane)
  for (let x = al(xa - 300, 260) - 260; x < xb + 300; x += 260) {   // (wet ruts, darker, a glint on the far lip)
    const i = Math.round(x / 260), rx = x + hash2(i, 145) * 200, ry = 400 + hash2(i, 146) * 100, rw = 40 + hash2(i, 147) * 60;
    if (hash2(i, 148) < 0.35 || waterAt(rx) > 0 || waterAt(rx - rw) > 0 || waterAt(rx + rw) > 0) continue;
    const rpts = []; for (let q = 0; q < 8; q++) { const an = q / 8 * TAU; rpts.push([rx + Math.cos(an) * rw * (0.7 + 0.3 * hash2(i * 9 + q, 150)), ry + Math.sin(an) * (2.6 + 1.4 * hash2(i * 9 + q, 151))]); }
    g.fillStyle = 'rgba(14,16,8,0.18)'; blob(g, flat(rpts)); g.fill();
    g.fillStyle = 'rgba(196,220,150,0.12)'; g.beginPath(); g.ellipse(rx - rw * 0.15, ry - 1.2, rw * 0.5, 1.2, 0, 0, TAU); g.fill();   // (the wet sheen)
  }
  aoBand(g, xa - 2, xb + 2, 350, 22, 1, 0.3);   // (under the back bank)
  { const lipY = (x) => 349 + 5 * Math.sin(x * 0.021) + 4 * Math.sin(x * 0.067 + 1) + 3 * hash2(Math.round(x / 18), 151);
    const topY = (x) => 335 + 10 * vnoise(x, 60, 71) + 4 * vnoise(x, 17, 72);
    g.beginPath(); g.moveTo(xa - 4, topY(xa - 4)); for (let x = al(xa - 4, 9); x <= xb + 9; x += 9) g.lineTo(x, topY(x)); for (let x = al(xb + 9, 9); x >= xa - 9; x -= 9) g.lineTo(x, lipY(x)); g.closePath();
    { const lg = g.createLinearGradient(0, 326, 0, 356); lg.addColorStop(0, '#4c5a40'); lg.addColorStop(1, '#2e3222'); g.fillStyle = lg; g.fill(); }
    for (let x = al(xa - 160, 120) - 120; x < xb + 160; x += 120) {   // (tussocks and mud mounds over the bank's top)
      const i = Math.round(x / 120), cx = x + hash2(i, 156) * 90, rw = 14 + hash2(i, 157) * 22, rh = 5 + hash2(i, 158) * 9, ty = topY(cx) + 2;
      if (hash2(i, 159) < 0.3) continue;
      g.fillStyle = mix('#3a4630', '#2c3424', hash2(i, 160)); g.beginPath(); g.ellipse(cx, ty, rw, rh, 0, Math.PI, TAU); g.fill();
      g.strokeStyle = 'rgba(150,180,110,0.75)'; g.lineWidth = 1.4; for (let q = 0; q < 6; q++) { const bx2 = cx - rw * 0.6 + q * rw * 0.24; g.beginPath(); g.moveTo(bx2, ty - rh * 0.5); g.quadraticCurveTo(bx2 + (q - 3) * 1.5, ty - rh - 4, bx2 + (q - 3) * 2.6, ty - rh - 7 - hash2(i, q + 161) * 6); g.stroke(); }
    }
    for (let x = al(xa - 40, 34); x < xb + 40; x += 34) { const i = Math.round(x / 34); if (hash2(i, 152) < 0.45) continue; const cx = x + hash2(i, 153) * 26, rw = 10 + hash2(i, 154) * 16; g.fillStyle = '#2a2c1c'; g.beginPath(); g.ellipse(cx, lipY(cx) + 1, rw, 5 + hash2(i, 155) * 3, 0, Math.PI, TAU); g.fill(); }   // (clumps of mud and moss on the lip)
    g.strokeStyle = 'rgba(180,206,140,0.22)'; g.lineWidth = 2; g.beginPath(); for (let x = al(xa - 4, 9); x <= xb + 9; x += 9) { if (x === al(xa - 4, 9)) g.moveTo(x, lipY(x) + 2); else g.lineTo(x, lipY(x) + 2); } g.stroke();   // (the moon on the wet lip)
  }
  // the pools
  for (const { a, b, L, R, pp } of POOLS) {
    if (b + 60 < xa || a - 60 > xb) continue;
    for (const [side, d] of [[L, -1], [R, 1]]) {   // (the wet mud outside each bank: darker and glossy)
      for (const [lw, off] of [[26, 15], [18, 11], [10, 7]]) { g.strokeStyle = 'rgba(10,12,8,0.12)'; g.lineWidth = lw; polyline(g, side.map((v, j) => (j & 1 ? v : v + d * off))); g.stroke(); }   // (feathered)
    }
    g.save(); poly(g, pp); g.clip();
    vgrad(g, a - 40, GT0, b - a + 80, H, [[0, '#0f1f1a'], [0.35, '#142822'], [1, '#0b1915']]);
    mottle(g, a - 40, 340, b - a + 80, 210, 0.3, 1.3);
    for (let k = 0; k < 5; k++) { const sx = a + hash2(a | 0, k + 160) * (b - a), sy = 370 + hash2(a | 0, k + 161) * 140; lightPool(g, sx, sy, 50 + 40 * hash2(a | 0, k + 162), 8, '110,140,60', 0.3); }   // (scum)
    lightPool(g, (a + b) / 2, 374, (b - a) * 0.42, 12, '200,224,150', 0.24);   // (the moon's smear)
    for (let y = 356, row = 0; y < H; row++) {   // glints: soft tapered streaks, rows jittered, gathered under the moon's smear, fading toward the camera
      const rr = (y - 350) / 190, cxm = (a + b) / 2, gw = (b - a) * 0.3;
      for (let x = a + hash2(row, 61 + (a | 0)) * 40; x < b + 20; x += 30 + hash2(row, x | 0) * 52) {
        const near = Math.exp(-(((x - cxm) / gw) ** 2)), al2 = (0.05 + 0.22 * near) * (1 - rr * 0.45), w = (8 + hash2(x | 0, row) * 18) * (0.6 + rr) * (0.6 + near * 0.8);
        g.fillStyle = `rgba(206,226,166,${al2.toFixed(3)})`; g.beginPath(); g.ellipse(x, y + (hash2(row, (x | 0) + 7) - 0.5) * 3, w / 2, 0.7 + rr * 0.9, 0, 0, TAU); g.fill();
      }
      y += 7 + rr * 6 + hash2(row, (a | 0) + 62) * 4;
    }
    for (let x = a; x < b; x += 46) {   // duckweed and lily pads
      const i = Math.round(x / 46), h = hash2(i, 66), px = x + hash2(i, 67) * 40, py = 372 + hash2(i, 68) * 150, k = 0.7 + (py - 350) / 260;
      if (h < 0.4) { g.fillStyle = 'rgba(120,170,60,0.7)'; for (let d = 0; d < 6; d++) { g.beginPath(); g.ellipse(px + (hash2(i, d + 70) - 0.5) * 30, py + (hash2(i, d + 80) - 0.5) * 6, 3.4 * k, 1.5 * k, 0, 0, TAU); g.fill(); } }
      else if (h < 0.72) {
        ink(g, (g) => { g.beginPath(); g.ellipse(px, py, 17 * k, 6 * k, 0, 0.35, TAU - 0.35); g.lineTo(px, py); g.closePath(); }, '#3c7a3a', 1.8, (g) => { g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(px - 17 * k, py - 6 * k, 34 * k, 2.4 * k); });
        if (h > 0.62) { g.fillStyle = '#ffe0f0'; g.strokeStyle = LINE; g.lineWidth = 1.2; for (let p = 0; p < 5; p++) { const an = p * TAU / 5; g.beginPath(); g.ellipse(px + 3 + Math.cos(an) * 4 * k, py - 3 + Math.sin(an) * 2.4 * k, 3 * k, 1.8 * k, an, 0, TAU); g.fill(); g.stroke(); } g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(px + 3, py - 3, 1.6 * k, 0, TAU); g.fill(); }
      }
    }
    g.restore();
    g.strokeStyle = 'rgba(6,10,8,0.45)'; g.lineWidth = 16; polyline(g, L); g.stroke(); polyline(g, R); g.stroke();   // (occlusion along the banks)
    for (const side of [L, R]) {   // (the wet-mud rims: a brown lip of uneven width, a moonlit wet edge, small stones)
      for (let k = 0; k < side.length - 2; k += 2) { const hk = hash2(Math.round(side[k + 1]), (a | 0) + (side === L ? 1 : 2)); if (hk < 0.2) continue; const w = 3 + 5 * hk; g.strokeStyle = '#3a3420'; g.lineWidth = w; g.beginPath(); g.moveTo(side[k], side[k + 1]); g.lineTo(side[k + 2], side[k + 3]); g.stroke(); }   // (gaps where the water laps over)
      g.strokeStyle = 'rgba(214,234,186,0.6)'; g.lineWidth = 2.2; polyline(g, side.map((v, j) => (j & 1 ? v : v + (side === L ? 4 : -4)))); g.stroke();   // (a lighter wet rim along the bank: the water's edge reads)
      g.strokeStyle = 'rgba(214,234,186,0.18)'; g.lineWidth = 6; polyline(g, side.map((v, j) => (j & 1 ? v : v + (side === L ? 9 : -9)))); g.stroke();
      g.strokeStyle = 'rgba(8,16,14,0.8)'; g.lineWidth = 1.6; polyline(g, side); g.stroke();
      { const k = 4 + Math.floor(hash2(a | 0, side === L ? 171 : 172) * (side.length / 2 - 8)) * 2, tx = side[k], ty = side[k + 1], d = side === L ? 1 : -1;   // (a tussock poking into the water)
        g.fillStyle = '#2e3422'; g.beginPath(); g.ellipse(tx + d * 6, ty, 12, 5, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(140,176,96,0.85)'; g.lineWidth = 1.5; for (let q = 0; q < 6; q++) { const bx2 = tx + d * 2 + q * 2.6; g.beginPath(); g.moveTo(bx2, ty); g.quadraticCurveTo(bx2 + (q - 3) * 1.6, ty - 8, bx2 + (q - 3) * 2.8, ty - 13 - hash2(q, a | 0) * 6); g.stroke(); } }
    }
  }
  // the Elder's clearing: dry packed earth, moonlit, and the great roots fanning from the tree's foot
  if (xb > 4150) {
    { const tg = g.createLinearGradient(4150, 0, 4480, 0); tg.addColorStop(0, 'rgba(104,116,64,0)'); tg.addColorStop(1, 'rgba(104,116,64,0.2)'); const tx = Math.max(xa - 2, 4150); g.fillStyle = tg; g.fillRect(tx, GT0 + 24, xb - tx + 4, H); }   // (one gradient: no stepping)
    for (const [dx, ey, w0, bend] of [[-460, 370, 30, -14], [-320, 396, 32, 10], [-170, 440, 22, -12], [150, 432, 22, 12], [300, 400, 32, -10], [450, 372, 28, 14]]) {   // (the great roots: fanning out from the Elder's foot, gnarled, lying flat and diving in and out of the mud; the swamp trees' cool dark bark -- never the Root hazard's brown)
      const ox = STUMP_X - 30 + dx * 0.05, oy = 366, ex = ELDER_X + dx, cx1 = ELDER_X + dx * 0.5, cy1 = oy + (ey - oy) * 0.3 + bend;   // (from under the stump's flares)
      if (Math.max(ox, ex) < xa - 80 || Math.min(ox, ex) > xb + 80) continue;
      const N = 16, rp = []; for (let k = 0; k <= N; k++) { const u = k / N, a1 = 1 - u; rp.push(a1 * a1 * ox + 2 * a1 * u * cx1 + u * u * ex + Math.sin(u * 11 + dx) * 6 * u, a1 * a1 * oy + 2 * a1 * u * cy1 + u * u * ey + Math.sin(u * 7 + dx * 0.1) * 3 * u); }
      const wAt = (u) => lerp(w0, 3, Math.pow(u, 0.8)) * (1 + 0.16 * Math.sin(u * 23 + dx));   // (bulging unevenly)
      const seg = (u0, u1) => { const k0 = Math.round(u0 * N), k1 = Math.round(u1 * N); return rp.slice(k0 * 2, k1 * 2 + 2); };
      for (const [u0, u1] of [[0, 0.46], [0.56, 0.8], [0.88, 1]]) {   // (above the mud, then under it, out again, under, the tip)
        const sp = seg(u0, u1);
        limb(g, sp, wAt(u0) * 1.7, wAt(u1) * 1.7, 'rgba(8,10,6,0.26)', 'rgba(0,0,0,0)');   // (the mud darkened along its sides)
        limb(g, sp, wAt(u0), wAt(u1), '#221a16', '#08060c', 'rgba(150,120,90,0.22)');
        for (const [fo, fa] of [[-0.22, 0.55], [0.1, 0.45], [0.3, 0.35]]) { g.strokeStyle = `rgba(4,2,2,${fa})`; g.lineWidth = 1.1; polyline(g, sp.map((v, j) => (j & 1 ? v + wAt(u0) * fo : v))); g.stroke(); }   // (furrows along it)
        if (u0 === 0) { const k = Math.round(0.3 * N), w = wAt(0.3); g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(rp[k * 2] + 2, rp[k * 2 + 1] + w * 0.15, w * 0.5, w * 0.22, 0.2, 0, TAU); g.fill(); g.strokeStyle = 'rgba(150,120,90,0.25)'; g.lineWidth = 1.2; g.beginPath(); g.arc(rp[k * 2], rp[k * 2 + 1] - w * 0.1, w * 0.45, Math.PI * 1.1, Math.PI * 1.7); g.stroke(); }   // (a gnarl: a lump with a dim lit back)
        for (const ue of [u0, u1]) { if (ue === 0 || ue === 1) continue; const k = Math.round(ue * N), mx = rp[k * 2], my = rp[k * 2 + 1], w = wAt(ue) + 4;   // (the mud heaped where it dives under)
          const cp = []; for (let q = 0; q < 6; q++) { const an = Math.PI + q / 5 * Math.PI, rr = 0.75 + 0.35 * hash2(dx + q, Math.round(ue * 100)); cp.push([mx + Math.cos(an) * w * 1.15 * rr, my + 2 + Math.sin(an) * w * 0.32 * rr]); } cp.push([mx + w * 0.9, my + 3], [mx - w * 0.9, my + 3]);
          g.fillStyle = 'rgba(46,44,28,0.9)'; blob(g, flat(cp)); g.fill();   // (a low ragged crescent of mud where it dives)
          g.strokeStyle = 'rgba(190,214,150,0.12)'; g.lineWidth = 1; g.beginPath(); g.ellipse(mx, my + 1, w * 0.8, w * 0.22, 0, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      }
      g.fillStyle = 'rgba(100,140,70,0.55)'; for (let q = 0; q < 3; q++) { const u = 0.08 + hash2(dx, q + 180) * 0.34, k = Math.round(u * N); g.beginPath(); g.ellipse(rp[k * 2] + (hash2(dx, q + 184) - 0.5) * 6, rp[k * 2 + 1] - wAt(u) * 0.35, 3 + hash2(dx, q + 188) * 5, 1.8, 0, 0, TAU); g.fill(); }   // (moss in patches)
    }
  }
  vgrad(g, xa - 2, 478, Wd, 548, [[0, 'rgba(6,8,6,0)'], [1, 'rgba(6,8,6,0.4)']]);
}
// the hollow stump at the Elder's foot (the wedge of the Sun Key hides in it): a wide stump with a dark hollow and roots
function drawStump(g) {
  g.fillStyle = '#16241a'; g.beginPath(); g.ellipse(0, 4, 106, 15, 0, 0, TAU); g.fill();   // (the water pooled round its foot)
  g.strokeStyle = 'rgba(190,214,150,0.28)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(0, 4, 106, 15, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
  g.beginPath(); g.ellipse(0, 6, 84, 10, 0, Math.PI * 0.15, Math.PI * 0.6); g.stroke();
  for (const [d, w, l, y1] of [[-1, 16, 52, 6], [-0.5, 12, 34, 10], [0.45, 12, 38, 10], [1, 16, 54, 5], [0.05, 10, 24, 12]]) {   // (root flares sinking into the pool)
    const x0 = d * 44, x2 = d * 44 + Math.sign(d || 1) * l * (Math.abs(d) > 0.3 ? 1 : 0.2);
    limb(g, [x0, -16, lerp(x0, x2, 0.5), -2, x2, y1], w, 4, '#3e2c1e', INK, '#6e5034');
  }
  for (const [x0, h, w] of [[-26, 34, 18], [6, 9, 9], [28, 6, 8]]) ink(g, (g) => { g.beginPath(); g.moveTo(x0 - w / 2, -54); g.lineTo(x0 - w * 0.25, -54 - h * 0.7); g.lineTo(x0 - w * 0.05, -54 - h); g.lineTo(x0 + w * 0.12, -54 - h * 0.55); g.lineTo(x0 + w * 0.3, -54 - h * 0.78); g.lineTo(x0 + w / 2, -54); g.closePath(); }, '#4a3626', 2.4, (g) => { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, -54 - h, w, h); g.fillStyle = 'rgba(214,190,140,0.55)'; g.beginPath(); g.moveTo(x0 - w * 0.25, -54 - h * 0.7); g.lineTo(x0 - w * 0.05, -54 - h); g.lineTo(x0 + w * 0.12, -54 - h * 0.55); g.closePath(); g.fill(); });   // (the break at the back: one tall jagged splinter, two small, pale wood showing)
  ink(g, (g) => { g.beginPath(); g.moveTo(-58, 4); g.bezierCurveTo(-62, -16, -48, -30, -50, -54); g.lineTo(50, -54); g.bezierCurveTo(48, -30, 62, -16, 58, 4); g.quadraticCurveTo(0, 14, -58, 4); g.closePath(); }, '#4a3626', 3, (g) => {
    g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 1.6; for (let k = 0; k < 8; k++) { const x = -44 + k * 12.5, w2 = Math.sin(k * 2.1) * 4; g.beginPath(); g.moveTo(x, -52); g.quadraticCurveTo(x + w2, -26, x * 1.14 - w2, 4); g.stroke(); }   // (bark furrows, wavering)
    g.strokeStyle = 'rgba(255,230,180,0.12)'; g.lineWidth = 1; for (let k = 0; k < 4; k++) { const x = -40 + k * 12.5 + 3; g.beginPath(); g.moveTo(x, -50); g.quadraticCurveTo(x + 2, -26, x * 1.14, 2); g.stroke(); }
    mottle(g, -64, -60, 128, 70, 0.55);
    const rg = g.createLinearGradient(-60, 0, -30, 0); rg.addColorStop(0, rgba('#c4d890', 0.35)); rg.addColorStop(1, rgba('#c4d890', 0)); g.fillStyle = rg; g.fillRect(-64, -60, 34, 70);   // (the moon on its left)
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(20, -60, 46, 70);
    g.fillStyle = 'rgba(100,150,70,0.65)'; g.beginPath(); g.ellipse(-36, -8, 14, 6, 0.3, 0, TAU); g.fill(); g.beginPath(); g.ellipse(30, -40, 8, 4, -0.2, 0, TAU); g.fill();   // (moss)
  });
  ink(g, (g) => { g.beginPath(); g.ellipse(0, -54, 50, 12, 0, 0, TAU); }, '#b89a6a', 2.6, (g) => {   // (the cut: pale wood, growth rings, a check crack)
    g.strokeStyle = 'rgba(110,78,40,0.55)'; g.lineWidth = 1.2; for (const r of [0.22, 0.42, 0.62, 0.82]) { g.beginPath(); g.ellipse(-2, -54, 50 * r, 12 * r, 0, 0, TAU); g.stroke(); }
    g.strokeStyle = 'rgba(60,36,14,0.8)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-2, -54); g.lineTo(14, -50); g.lineTo(30, -47); g.stroke();
    g.fillStyle = 'rgba(255,240,200,0.25)'; g.beginPath(); g.ellipse(-16, -57, 22, 4, 0, 0, TAU); g.fill();
  });
}

// the sick green moon (the book's): a pale yellow-green disc, mottled, a thin ring of haze round it
function drawMoonDisc(g) {
  const hg = g.createRadialGradient(0, 0, 30, 0, 0, 48); hg.addColorStop(0, 'rgba(210,230,150,0.35)'); hg.addColorStop(1, 'rgba(210,230,150,0)'); g.fillStyle = hg; g.fillRect(-50, -50, 100, 100);
  const dg = g.createRadialGradient(-10, -10, 4, 0, 0, 34); dg.addColorStop(0, '#eef6b8'); dg.addColorStop(0.7, '#cfe08a'); dg.addColorStop(1, '#a8bc68');
  g.fillStyle = dg; g.beginPath(); g.arc(0, 0, 33, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.arc(0, 0, 33, 0, TAU); g.clip();
  g.fillStyle = 'rgba(120,150,70,0.32)'; for (const [x, y, r] of [[-12, -6, 9], [8, 10, 7], [12, -12, 5], [-4, 16, 5], [-18, 10, 4]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0.4, 0, TAU); g.fill(); }   // (its seas)
  mottle(g, -34, -34, 68, 68, 0.4, 0.5);
  g.restore();
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0, wedge = 1, story = null, heldAt = null, gloom = 0;   // (heldAt: a story's [x, y] where a hero holds the wedge up)
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    c.mist = makeSprite(536, 150, 8, 0, Math.min(csFar, 0.5), (g) => {   // (8 px of wrapped margin each side: the tiles' joints sample real mist, no seam)
      for (let i = 0; i < 16; i++) {
        const R = mulberry(300 + i), x = R.r(0, 520), y = R.r(40, 110), rx = R.r(70, 150), ry = R.r(22, 40);
        for (const dx of [-520, 0, 520]) {
          const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, rx); gr.addColorStop(0, 'rgba(176,200,150,0.5)'); gr.addColorStop(1, 'rgba(176,200,150,0)');
          g.save(); g.translate(0, y); g.scale(1, ry / rx); g.translate(0, -y); g.fillStyle = gr; g.fillRect(x + dx - rx, y - rx, rx * 2, rx * 2); g.restore();
        }
      }
    });
    c.moon = radialSprite(150, Math.min(csFar, 0.5), [[0, 'rgba(220,238,160,0.9)'], [0.22, 'rgba(176,206,120,0.4)'], [1, 'rgba(120,160,90,0)']]);
    c.glow = radialSprite(64, 0.5, [[0, 'rgba(255,240,170,1)'], [0.3, 'rgba(255,200,80,0.7)'], [1, 'rgba(255,160,30,0)']]);
    c.shaft = makeSprite(300, 330, 0, 0, 0.35, (g) => {   // (a shaft of moonlight: soft-edged, nested, fading in at its top and out at its foot)
      for (const [hw, a] of [[120, 0.05], [90, 0.07], [64, 0.09], [40, 0.12]]) { const v = g.createLinearGradient(0, 0, 0, 330); v.addColorStop(0, 'rgba(210,230,150,0)'); v.addColorStop(0.3, `rgba(210,230,150,${a})`); v.addColorStop(1, `rgba(210,230,150,${a * 0.4})`); g.fillStyle = v; g.beginPath(); g.moveTo(150 - hw * 0.45, 0); g.lineTo(150 + hw * 0.45, 0); g.lineTo(150 + hw, 330); g.lineTo(150 - hw, 330); g.closePath(); g.fill(); }
    });
    c.stump = makeSprite(230, 140, 115, 126, cs, (g) => { setLS('near'); drawStump(g); });
    if (!c.stump.c.__live && c.stump.c.width / c.stump.w < Math.min(1, cs) - 0.01) { freeCanvases(c.stump.c); const sc0 = cs; c.stump = { c: liveCanvas(Math.ceil(230 * sc0), Math.ceil(140 * sc0), (g) => { g.transform(sc0, 0, 0, sc0, 115 * sc0, 126 * sc0); g.lineJoin = 'round'; g.lineCap = 'round'; setLS('near'); drawStump(g); }), w: Math.ceil(230 * sc0) / sc0, h: Math.ceil(140 * sc0) / sc0, ox: 115, oy: 126 }; }   // (a soft stump in the fight's lane: painted live instead)
    c.moonDisc = makeSprite(100, 100, 50, 50, csFar, (g) => drawMoonDisc(g));
    c.floor = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawFloor(g, xa, xb); });   // (the near layers first: under a cap they keep their scale)
    c.near = buildStrip(-10, LEVEL_LEN + 10, 0, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawNear(g, xa, xb); });
    balanceStrips([c.floor, c.near], cs);
    c.mid = buildStrip(-10, CAM_MAX * 0.6 + W + 30, 0, 350, csFar, 0.6, (g, xa, xb) => { setLS('mid'); drawMidTrees(g, xa, xb); });
    shareStrips([c.floor, c.near], c.mid, csFar);
    setLS('far'); c.far = buildStrip(-10, CAM_MAX * 0.3 + W + 30, 0, 342, csFar, 0.3, (g, xa, xb) => { setLS('far'); drawFarTrees(g, xa, xb); });
    return c;
  }

  // ------------------------------------------------------------------ live bits
  function mistBand(ctx, spr, camX, t, y, a, par, speed) {
    const w = 520, x0 = -((((camX * par + t * speed) % w) + w) % w);
    ctx.save(); ctx.globalAlpha = a;
    const T = ctx.getTransform ? ctx.getTransform() : { a: 1, e: 0 }, k = T.a || 1, xr = (Math.round(k * x0 + T.e) - T.e) / k, wr = Math.round(w * k) / k;   // (each tile on whole device pixels, the frame's own offset counted: no half-covered pixel at the joints, no seam)
    const L = spr.c.__live, m = spr.ox || 0, cw = L ? L.vw : spr.c.width, chh = L ? L.vh : spr.c.height, k2 = cw / spr.w;   // (a sprite with a wrapped margin -- cached or painted live: draw only its middle 520, the joints blend into real content)
    for (let x = xr; x < W; x += wr) ctx.drawImage(spr.c, m * k2, 0, w * k2, chh, x, y, wr, spr.h);
    ctx.restore();
  }
  // the mid trees' reflections in the pools: the trees' own layer flipped about their foot, at their own parallax (so they stay under them
  // while the view scrolls), dim; skipped when that layer is painted live (too dear twice over)
  function reflections(ctx, C, camX, s, t = 0) {
    const mx = MOON_X(camX);
    for (const P of POOLS) {   // the moon's own reflection: a shimmering column of light under it, wherever a pool lies below the moon
      const a = P.a - camX, b = P.b - camX; if (mx < a - 30 || mx > b + 30) continue;
      ctx.save(); ctx.translate(-camX, 0); poly(ctx, P.pp); ctx.translate(camX, 0); ctx.clip();
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5; ctx.drawImage(C.moon.c, mx - 70, 330, 140, 220);
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(226,240,180,0.55)';
      for (let y = 360, k = 0; y < H; y += 9 + k * 0.5, k++) { const w2 = (10 + 8 * Math.sin(k * 1.7 + t * 1.3)) * (1 + (y - 360) / 200), wob = Math.sin(y * 0.09 + t * 2.1) * 5; ctx.globalAlpha = 0.65 * (1 - (y - 360) / 220); ctx.beginPath(); ctx.ellipse(mx + wob, y, w2, 1.6 + (y - 360) / 120, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    if (C.mid.chunks.some((ch) => !ch.c)) return;
    for (const P of POOLS) {
      if (P.b - camX < -40 || P.a - camX > W + 40) continue;
      ctx.save(); ctx.translate(-camX, 0); poly(ctx, P.pp); ctx.translate(camX, 0); ctx.clip();
      ctx.globalAlpha = 0.26; ctx.translate(0, 688); ctx.scale(1, -1); drawStrip(ctx, C.mid, camX, s);
      ctx.restore();
    }
  }
  // eyes in the dark trees (the book's: green, almond, watching): on some of the mid trees, blinking now and then
  function treeEyes(ctx, camX, t) {
    const L0 = camX * 0.6;
    ctx.save();
    for (let i = Math.floor((L0 - 420) / 230); i <= Math.ceil((L0 + W + 60) / 230); i++) {
      const T = midTree(i); if (!T || hash2(i, 28) > 0.3) continue;
      const seed = i * 5 + 3, tt = 3 / 9, cx = T.bx + Math.sin(tt * 3.4 + seed) * 22 * tt + (hash2(seed, 3) - 0.5) * 9 * tt, ey = 344 - T.ht * tt - 6, sx = cx - L0;
      if (sx < -30 || sx > W + 30) continue;
      const per = 3.5 + hash2(i, 31) * 4, ph = hash2(i, 32) * per, open = ((t + ph) % per) < 0.16 ? 0.15 : 1;
      { const gg = ctx.createRadialGradient(sx, ey, 0, sx, ey, 22); gg.addColorStop(0, `rgba(160,255,100,${0.32 * open})`); gg.addColorStop(1, 'rgba(160,255,100,0)'); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gg; ctx.fillRect(sx - 24, ey - 24, 48, 48); ctx.globalCompositeOperation = 'source-over'; }   // (a soft glow, no edge)
      for (const d of [-1, 1]) {
        const ex = sx + d * 8;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(d * 0.28);   // (tilted in a scowl)
        ctx.globalAlpha = 0.95; ctx.fillStyle = '#c8ff70'; ctx.beginPath(); ctx.moveTo(-5.5, 0); ctx.quadraticCurveTo(0, -4.2 * open, 5.5, 0); ctx.quadraticCurveTo(0, 2.4 * open, -5.5, 0); ctx.closePath(); ctx.fill();
        if (open > 0.5) { ctx.fillStyle = 'rgba(20,40,10,0.85)'; ctx.fillRect(-0.7, -2.4, 1.4, 3.4); }   // (a dark slit)
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function ripples(ctx, camX, t) {
    ctx.save(); ctx.strokeStyle = 'rgba(170,220,200,0.6)';
    for (const r of LAY.ripples) {
      const sx = r.x - camX; if (sx < -40 || sx > W + 40) continue;
      const u = ((t + r.ph) % r.per) / r.per, k = 0.2 + u, a = (1 - u) * 0.7;
      ctx.globalAlpha = a; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(sx, r.y, 26 * k, 7 * k, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  function flies(ctx, camX, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const f of LAY.flies) {
      const x = ((f.x - camX * 0.8 + Math.sin(t * 0.7 + f.ph) * f.sx) % 1300 + 1300) % 1300 - 170, y = f.y + Math.sin(t * 0.9 + f.ph * 2) * f.sy;
      if (x < -6 || x > W + 6) continue;
      const a = 0.35 + 0.55 * Math.sin(t * 2.6 + f.ph) ** 2;
      ctx.globalAlpha = a * 0.4; ctx.fillStyle = '#9aff9a'; ctx.beginPath(); ctx.arc(x, y, f.r * 3.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = a; ctx.fillStyle = '#e8ffb0'; ctx.beginPath(); ctx.arc(x, y, f.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    const sg = ctx.createLinearGradient(0, 0, 0, 340); sg.addColorStop(0, '#121810'); sg.addColorStop(0.5, '#2a3822'); sg.addColorStop(1, '#5a6a40');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    const mx = MOON_X(camX), my = 112;
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.6; ctx.drawImage(C.moon.c, mx - 150, my - 150, 300, 300); ctx.restore();
    ctx.drawImage(C.moonDisc.c, mx - C.moonDisc.ox, my - C.moonDisc.oy, C.moonDisc.w, C.moonDisc.h);
    drawStrip(ctx, C.far, camX, s);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.16; ctx.drawImage(C.moon.c, mx - 110, my - 110, 220, 220); ctx.restore();   // (its light blooming over the far trees in front of it)
    mistBand(ctx, C.mist, camX, t, 200, 0.5, 0.25, 6);
    drawStrip(ctx, C.mid, camX, s);
    treeEyes(ctx, camX, t);
    mistBand(ctx, C.mist, camX, t, 250, 0.42, 0.5, 10);
    drawStrip(ctx, C.floor, camX, s);
    reflections(ctx, C, camX, s, t);
    drawStrip(ctx, C.near, camX, s);
    if (camX > 3700) {   // the clearing: a shaft of moonlight falling onto the middle of the arena
      const xb2 = 4960 - camX, xt = MOON_X(camX), k = sstep(3700, 4300, camX);   // (from the moon down to the arena's floor)
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5 * k; ctx.transform(1, 0, (xb2 - xt) / 330, 1, xt - 150 - 112 * (xb2 - xt) / 330, 0); ctx.drawImage(C.shaft.c, 0, 112, 300, 330); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5 * k; ctx.drawImage(C.moon.c, xb2 - 150, 418, 300, 56); ctx.restore();   // (its pool of light on the floor)
    }
    ripples(ctx, camX, t);
    // the hollow stump and the wedge of the Sun Key
    if (camX + W > STUMP_X - 140) {
      const px = STUMP_X - camX, py = 392;
      ctx.drawImage(C.stump.c, px - C.stump.ox, py - C.stump.oy, C.stump.w, C.stump.h);
      if (wedge > 0) {
        const gl = 0.7 + 0.3 * Math.sin(t * 3);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 * gl; ctx.drawImage(C.glow.c, px - 100, py - 18, 200, 36); ctx.restore();   // (its warm light on the water round the stump)
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7 * gl; ctx.drawImage(C.glow.c, px - 56, py - 86, 112, 112); ctx.restore();
        ctx.save(); ctx.translate(px + 2, py - 40 + Math.sin(t * 2) * 2); ctx.rotate(Math.sin(t * 1.5) * 0.1);
        ctx.translate(0, -18); drawKeyPiece(ctx, 34); ctx.restore();
      }
    }
    if (heldAt) {   // a golden wedge held up in a story
      const [hx, hy] = heldAt, gl = 0.7 + 0.3 * Math.sin(t * 3);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8 * gl; ctx.drawImage(C.glow.c, hx - 50, hy - 50, 100, 100); ctx.restore();
      ctx.save(); ctx.translate(hx, hy + Math.sin(t * 2) * 2); ctx.rotate(Math.sin(t * 1.5) * 0.1);
      ctx.translate(0, -20); drawKeyPiece(ctx, 44); ctx.restore();
    }
    mistBand(ctx, C.mist, camX, t, 340, 0.16 + 0.25 * gloom, 0.9, 14);
    flies(ctx, camX, t);
    // the gloom: the edges close in, cold and dim
    const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.45, W / 2, H * 0.5, W * 0.72); vg.addColorStop(0, 'rgba(6,10,12,0)'); vg.addColorStop(1, `rgba(6,10,12,${0.4 + 0.2 * gloom})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (warm > 0.01) { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,190,110,${0.14 * warm})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0) {
    camX = clamp(+camX || 0, 0, CAM_MAX);
    // a few reeds at the very bottom edge, in front of everyone's feet (nobody stands below y 512)
    ctx.save();
    for (let x = Math.floor((camX - 40) / 230) * 230; x < camX + W + 40; x += 230) {
      const i = Math.round(x / 230); if (hash2(i, 90) < 0.35) continue;
      const bx = x + hash2(i, 91) * 190 - camX;
      ctx.save(); ctx.translate(bx, 548); ctx.rotate(Math.sin(t * 1.2 + i) * 0.04); setLS('front'); reeds(ctx, 0, 0, 0.62 + hash2(i, 92) * 0.3, i * 11 + 5, '#2c4220'); ctx.restore();
    }
    ctx.restore();
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(6,8,6,0.4)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  /** the gloom (0..1): the vignette closes in, the low mist thickens (the mist clouds, src/siswamp.js) */
  function setGloom(k) { gloom = clamp(+k || 0, 0, 1); }
  /** the wedge in the stump (1 there .. 0 taken) */
  function setWedge(k) { wedge = clamp(+k || 0, 0, 1); }
  function setStory(bg) { story = bg; wedge = bg && bg.wedge !== undefined ? bg.wedge : 1; heldAt = bg && bg.wedgeAt ? bg.wedgeAt : null; gloom = bg && bg.gloom ? bg.gloom : 0; }
  return { setScale: st.setScale, setWarm, setGloom, setWedge, setStory, drawBack, drawFront, drawProp, waterAt, info: st.info, release: st.release, get warm() { return warm; }, get story() { return story; }, get __caches() { return st.C; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  log:       { w: 76, h: 40, colors: ['#4a3a2a', '#2c2218', '#7a6048', '#6a9a4a'] },
  toadstool: { w: 58, h: 62, colors: ['#7a4ab8', '#4a2c78', '#e8d8ff', '#7ae8c0'] },
  pod:       { w: 50, h: 60, colors: ['#5a4430', '#3a2a1c', '#6a9a4a', '#c8b088'] },   // (drawn as a mossy stump since QAF: the seed pod read as a bin, a cactus, a pickle)
};
const PROP_DRAW = {
  log(g) {   // a rotten hollow log with moss on top and little mushrooms
    ink(g, (g) => { roundRect(g, -36, -32, 72, 32, 11); }, '#4a3a2a', 2.8, (g) => {
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(-36, -32, 72, 8); g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(-36, -10, 72, 12);
      g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 1.5; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-28 + k * 15, -30); g.lineTo(-30 + k * 15, -2); g.stroke(); }
      g.fillStyle = 'rgba(100,150,70,0.8)'; g.beginPath(); g.ellipse(-8, -31, 17, 5, 0, 0, TAU); g.fill();
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(32, -16, 8, 15, 0, 0, TAU); }, '#1c1410', 2.4);
    for (const [x, y] of [[-20, -34], [-12, -36]]) { g.fillStyle = '#d8f0d0'; g.fillRect(x - 1, y, 2.4, 6); ink(g, (g) => { g.beginPath(); g.ellipse(x, y, 6, 3.6, 0, Math.PI, 0); g.closePath(); }, '#7ae8c0', 1.8); }
  },
  toadstool(g) {   // two big glowing toadstools
    for (const [x, hh, rr, c] of [[-12, 36, 22, '#7a4ab8'], [14, 26, 16, '#3aa89a']]) {
      ink(g, (g) => { roundRect(g, x - 5, -hh, 10, hh, 4); }, '#efe6cc', 2.4, (g) => { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 1, -hh, 6, hh); });
      ink(g, (g) => { g.beginPath(); g.ellipse(x, -hh, rr, rr * 0.62, 0, Math.PI, 0); g.quadraticCurveTo(x, -hh + rr * 0.24, x - rr, -hh); g.closePath(); }, c, 2.8, (g) => { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x - rr, -hh - rr, rr * 0.8, rr); g.fillStyle = '#efe6ff'; for (const [dx, dy] of [[-0.45, -0.28], [0.1, -0.5], [0.5, -0.2]]) { g.beginPath(); g.ellipse(x + dx * rr, -hh + dy * rr, rr * 0.13, rr * 0.1, 0, 0, TAU); g.fill(); } });
    }
  },
  pod(g) {   // a mossy stump (QAF: the old seed pod read as a bin, a cactus or a pickle; r2: its cut top shown, tipped toward us, never a cake)
    ink(g, (g) => { g.beginPath(); g.moveTo(-31, 1); g.quadraticCurveTo(-24, -2, -21, -9); g.quadraticCurveTo(-18, -22, -20, -34); g.lineTo(19, -35); g.quadraticCurveTo(17, -22, 21, -10); g.quadraticCurveTo(25, -3, 32, 1); g.quadraticCurveTo(22, 3, 14, 0); g.lineTo(-12, 0); g.quadraticCurveTo(-22, 3, -31, 1); g.closePath(); }, '#5a4430', 2.8, (g) => {   // (the trunk, flaring into roots at its foot)
      g.fillStyle = 'rgba(255,230,190,0.14)'; g.fillRect(-26, -40, 13, 44); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(7, -40, 26, 44);
      g.strokeStyle = '#2e2014'; g.lineWidth = 1.5; for (const [x, b, y0] of [[-13, 3, -33], [-3, -2, -30], [8, 4, -33], [15, 1, -20]]) { g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + b, -18, x - b * 0.5, -1); g.stroke(); }   // (bark furrows, uneven)
      g.strokeStyle = '#2e2014'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-26, -1); g.quadraticCurveTo(-22, -4, -18, -10); g.moveTo(26, -1); g.quadraticCurveTo(21, -4, 18, -10); g.stroke();   // (the root flares' creases)
    });
    ink(g, (g) => { g.beginPath(); g.moveTo(-20, -35); g.quadraticCurveTo(-20, -44, 0, -44); g.quadraticCurveTo(12, -44, 14, -41); g.lineTo(16, -50); g.lineTo(18, -41); g.quadraticCurveTo(20, -38, 19, -35); g.quadraticCurveTo(0, -27, -20, -35); g.closePath(); }, '#d0b080', 2.4, (g) => {   // (the cut top tipped toward us, a splinter rising on its right)
      g.strokeStyle = 'rgba(110,80,50,0.75)'; g.lineWidth = 1.1; for (const r of [4, 8.5, 13]) { g.beginPath(); g.ellipse(-1, -36, r, r * 0.55, 0, 0, TAU); g.stroke(); }   // (its rings)
      g.strokeStyle = 'rgba(70,46,28,0.85)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-1, -36); g.lineTo(9, -33); g.lineTo(13, -31); g.stroke();   // (a split)
      g.fillStyle = 'rgba(255,240,210,0.35)'; g.beginPath(); g.ellipse(-6, -40, 7, 2.4, -0.1, 0, TAU); g.fill();
    });
    ink(g, (g) => { g.beginPath(); g.moveTo(-21, -34); g.quadraticCurveTo(-23, -46, -11, -46); g.quadraticCurveTo(-2, -46, -2, -40); g.quadraticCurveTo(-6, -36, -10, -37); g.quadraticCurveTo(-13, -30, -16, -24); g.quadraticCurveTo(-18, -28, -19, -22); g.quadraticCurveTo(-22, -26, -21, -34); g.closePath(); }, '#5a7a38', 2, (g) => { g.fillStyle = 'rgba(190,220,130,0.4)'; g.fillRect(-22, -47, 20, 5); });   // (a clump of moss on its back-left, two drips down its side)
    for (const [x, hh, rr] of [[-28, 8, 5], [27, 7, 4.5]]) { ink(g, (g) => { g.beginPath(); g.rect(x - 1.4, -hh, 2.8, hh); }, '#efe6cc', 1.3); ink(g, (g) => { g.beginPath(); g.ellipse(x, -hh, rr, rr * 0.6, 0, Math.PI, 0); g.closePath(); }, '#c8603a', 1.6, (g) => { g.fillStyle = '#f4e8d0'; g.beginPath(); g.arc(x - rr * 0.3, -hh - rr * 0.3, 1.1, 0, TAU); g.fill(); }); }   // (two toadstools among its roots)
  },
};
