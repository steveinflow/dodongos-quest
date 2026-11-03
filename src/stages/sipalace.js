// Dodongo's Quest - Skull Island stage 4 "THE SKULL PALACE" (src/stages/sipalace.js): background, floors, the skull's gate, the purple corridor, the throne hall.
//
// The book's chapter eight (docs/SKULL_ISLAND.md): the palace that was the Palace of the Sun, turned into a skull by Malachar.  Three sections (world x):
//   gate 0-1900 (a cliff path under a purple storm; the giant SKULL's face in the rock, its eyes burning; its mouth is the doorway: a great WOODEN DOOR with a round SUN SLOT
//   at its heart where the Sun Key goes in, stone teeth hanging over it)  |  corridor 1900-3800 (violet stone, tall windows on the storm, banners with the split mask, magenta torches, a violet carpet)
//   |  hall 3800-5400 (the throne hall: rafters, a rose window and Malachar's black throne, the round golden mirror, the giant purple CRYSTAL over the throne with the King inside; the boss arena is the last screen).
// Back-to-front (drawBack): the storm sky (live) -> far crags (parallax .3) -> the wall strip (cliff, skull, interior, throne; cached) -> the skull's eyes, the door, the throne's glow, the mirror's smoke, the crystal
// (live) -> torches (live) -> the floor strip (cached) -> the sigil's glow, golden wall cracks (the finale), sparks -> the vignette.
// Setters (src/siworld.js, src/sipalace.js): setDoor(k 0..1), setSlot(k, shine, turn), setCrystal(k 0..2, king), setCracks(k), setStorm(k), setShake(k), setStory(bg: door slot shine turn crystal king cracks mirror).
// Cached per scale (chunked strips, src/canvasmem.js); live: the sky, the flames, the door, the crystal.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, cacheCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';
import { PAL } from '../sipalace_layout.js';
import { CHARS } from '../chars.js';   // (the painted King inside the crystal: read at draw time -- the quest's characters load with its stage)

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 5400;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'gate', name: 'The Skull Gate', x0: 0, x1: 1900 },
  { id: 'corridor', name: 'The Purple Corridor', x0: 1900, x1: 3800 },
  { id: 'hall', name: 'The Throne Hall', x0: 3800, x1: 5400 },
];
export const ARENAS = [450, 880, 2250, 3200, CAM_MAX];
export const WAYSTONES = [2150];
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES };

// ---------------------------------------------------------------------------------------------------------------
// TOOLKIT (the same block as frozen.js, crystal.js, eyrie.js and hollow.js; after src/stages/mines.js)
// ---------------------------------------------------------------------------------------------------------------
const TAU = Math.PI * 2;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;   // (no sky flash: flashShape)
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
// a hole cut through a strip, the live sky showing through it: erased from a cache; when the strip is painted live (LIVE), what
// shows through is painted into the hole instead (SEE_THROUGH: set by drawBack round the strip's draw, screen coords)
let SEE_THROUGH = null;
function cutOut(g, path) {
  if (!LIVE) { g.save(); g.globalCompositeOperation = 'destination-out'; path(); g.fillStyle = '#000'; g.fill(); g.restore(); return; }
  g.save(); path(); g.clip(); g.translate(-LIVE.dx, 0);
  if (SEE_THROUGH) SEE_THROUGH(g); else { const v = g.createLinearGradient(0, 0, 0, 372); v.addColorStop(0, '#1a0830'); v.addColorStop(1, '#5a1c62'); g.fillStyle = v; g.fillRect(0, 0, W, 372); }
  g.restore();
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
const { DOOR_X, DOOR_W, DOOR_TOP, DOOR_BOT, SLOT_DY, SKULL_X0, SKULL_X1, CORR_X, HALL_X, THRONE_X, CRYSTAL_X, CRYSTAL_Y, MIRROR_X } = PAL;
const STONE = { base: '#2c2238', sh: '#1a1226', hi: '#4c3c66', deep: '#0e0818', joint: '#08040e' };
const ROCK = { base: '#2a2036', sh: '#160e20', hi: '#4a3a62', deep: '#0a0612', joint: '#06030a' };
const BONE = { base: '#cfc6dc', sh: '#8a7ea4', hi: '#f0eaf8' };
const GOLD = { base: '#e8b43a', hi: '#ffe58a', sh: '#8a5a10' };
const WOODC = { base: '#6a4426', hi: '#94683c', sh: '#3a2412', seam: '#1e1008' };
const MAG = '#ff3cd8', VIO = '#a050ff';
const LS = { far: ['#0c0616', 0.5], mid: ['#08040e', 0.6], near: ['#050208', 0.8], front: ['#030106', 0.9] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const ROWS = [362, 372, 385, 402, 424, 451, 484, 520, 546];
// the paving's ragged edge before the door (world x at screen y): one wandering line slanting toward the camera, never a step per row
const fray = (y) => DOOR_X - 210 - (y - 362) * 0.7 + 70 * vnoise(y, 46, 31) + 26 * vnoise(y, 13, 32);
const SK_Y = 352;                                 // the skull's chin line (screen y): the door's foot

// torches and pillars (world x): magenta flames on poles outside, on pillar brackets inside
// what fills each of the corridor's bays (between pillar i and i+1): a window on the storm, a woven tapestry of the old Palace of the Sun, a
// statue in a niche, a stained-glass window from the old palace, a banner over a candle shelf, a broken lancet, a tapestry map of the island
const BAYS = ['window', 'tapestry', 'statue', 'stained', 'banner', 'broken', 'map'];
const CHANDELIERS = [2100, 2660, 3500];   // (iron rings of candles hung from the vault: live, swaying)
const LAY = (() => {
  const R = mulberry(7741);
  const pillars = [], torches = [], sparks = [];
  pillars.push({ x: 1960, w: 76, sec: 1 });
  for (let x = 2240; x <= 3680; x += 280) pillars.push({ x, w: 54, sec: 1 });
  for (const x of [3920, 4260, 4600]) pillars.push({ x, w: 78, sec: 2 });
  for (const x of [330, 700, 1020]) torches.push({ x, y: 262, ph: R.r(0, TAU), pole: true });
  for (const p of pillars) if (p.x !== 2800 && p.x !== 4260) torches.push({ x: p.x, y: 226, ph: R.r(0, TAU), pole: false });   // (two sconces cold)
  for (let i = 0; i < 26; i++) sparks.push({ x: R.r(0, 5400), y: R.r(80, 420), sx: R.r(10, 26), ph: R.r(0, TAU), sp: R.r(0.25, 0.7) });
  return { pillars, torches, sparks };
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
function heap(g, cx, cy, w, hgt, sd, base, top, under, anvil = false, solidBase = false) {
  // cy: the heap's base; it billows hgt above it.  One mass: puffs of very different sizes along its silhouette (the small ones on its lit
  // edge), the body filled solid under them, shaded as a whole -- lit from above, a core shadow low in it -- and its base dissolving into the
  // air below (a feathered fade, never a cut); an anvil (anvil: a flat shelf blown out at its top)
  const R = mulberry(sd), puffs = [];
  const n = 5 + Math.floor(w / 60), bL = R(), bR = R();
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), crest = Math.sin(u * Math.PI) ** 0.8, r = hgt * (0.12 + 0.3 * crest) * R.r(0.6, 1.25);
    puffs.push([cx - w / 2 + u * w + R.r(-12, 12), cy - hgt * (0.3 + 0.62 * crest) + r * 0.5, r, 1]);
    if (R() < 0.6 && crest < 0.75) { const r2 = r * R.r(0.3, 0.5); puffs.push([cx - w / 2 + u * w + R.r(-r, r) * 0.6, cy - hgt * (0.3 + 0.62 * crest) + r * 0.25, r2, 0.7]); }   // (no curl on the very top: no lone 'moon')   // (small curls on the lit edge, tucked into their parent)
  }
  if (anvil) { const ay = cy - hgt * 1.02; for (let k = 0; k < 7; k++) { const u = k / 6; puffs.push([lerp(cx - w * 0.16, cx + w * 0.56, u), ay + 4 + Math.sin(u * 3) * 3, hgt * 0.1 * R.r(0.8, 1.2), 0.6]); } }   // (the anvil's puffs: all on its shelf)
  // the body: every subpath wound clockwise (the arcs and the base polygon alike: no holes under the nonzero rule)
  const body = (g) => {
    g.beginPath();
    for (const [x, y, r, f] of puffs) { g.moveTo(x + r, y); g.ellipse(x, y, r, r * f, 0, 0, TAU); }
    { const iL = w * (0.04 + 0.1 * bL), iR = w * (0.04 + 0.1 * bR); g.moveTo(cx - w / 2 + iL, cy - hgt * 0.4); g.lineTo(cx + w / 2 - iR, cy - hgt * 0.4); g.lineTo(cx + w / 2 - iR - w * 0.1, solidBase ? cy + 12 : cy - hgt * 0.06); g.lineTo(cx - w / 2 + iL + w * 0.14, solidBase ? cy + 12 : cy - hgt * 0.06); g.closePath(); }
    if (solidBase) { g.moveTo(cx - w / 2 - 20, cy - hgt * 0.78); g.lineTo(cx + w / 2 + 20, cy - hgt * 0.78); g.lineTo(cx + w / 2 + 20, cy + 12); g.lineTo(cx - w / 2 - 20, cy + 12); g.closePath(); }   // (the far row: solid up between its puffs)
    if (anvil) { const ay = cy - hgt * 1.02; g.moveTo(cx - w * 0.2, ay); g.lineTo(cx + w * 0.62, ay - 4); g.lineTo(cx + w * 0.5, ay + hgt * 0.14); g.lineTo(cx - w * 0.1, cy - hgt * 0.7); g.closePath(); }
  };
  body(g); g.fillStyle = base; g.fill();
  g.save(); body(g); g.clip();
  vgrad(g, cx - w, cy - hgt * 1.2, w * 2.4, cy, [[0, rgba(top, 0.85)], [0.35, rgba(top, 0.25)], [0.62, rgba(top, 0)], [1, 'rgba(8,6,24,0.4)']]);   // (lit from above, as one)
  const lg = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); lg.addColorStop(0, rgba(top, 0.25)); lg.addColorStop(0.5, rgba(top, 0)); lg.addColorStop(1, 'rgba(8,6,24,0.3)');   // (and from the left)
  g.fillStyle = lg; g.fillRect(cx - w, cy - hgt * 1.3, w * 2, hgt * 1.4);
  const cg = g.createRadialGradient(cx + w * 0.1, cy - hgt * 0.2, 0, cx + w * 0.1, cy - hgt * 0.2, w * 0.4); cg.addColorStop(0, 'rgba(8,6,24,0.35)'); cg.addColorStop(1, 'rgba(8,6,24,0)');   // (the core shadow)
  g.fillStyle = cg; g.fillRect(cx - w, cy - hgt * 0.2 - w * 0.4, w * 2, w * 0.8);   // (the whole gradient: no straight cut across the puffs above it)
  vgrad(g, cx - w, cy - hgt * 0.3, w * 2, cy, [[0, rgba(under, 0)], [1, rgba(under, 0.45)]]);   // (the purple glow from below)
  g.restore();
  // the base dissolving: a soft band fading down from the body, ragged
  const fy = cy - hgt * 0.08;
  for (let k = 0; k < 8; k++) {
    const u = (k + 0.5) / 8, x = cx - w / 2 + u * w, rw = w / 8 * R.r(0.8, 1.4), rh = hgt * R.r(0.12, 0.22);
    const gr = g.createRadialGradient(x, fy, 0, x, fy, rw); gr.addColorStop(0, rgba(base, 0.85)); gr.addColorStop(0.6, rgba(base, 0.35)); gr.addColorStop(1, rgba(base, 0));
    g.save(); g.translate(x, fy); g.scale(1, rh / rw); g.translate(-x, -fy); g.fillStyle = gr; g.fillRect(x - rw, fy - rw, rw * 2, rw * 2); g.restore();
  }
}
// wind-torn scud: ragged streaks of dark cloud slanting with the rain
function scud(g, x, y, w, sd, col, a) {
  const R = mulberry(sd);
  for (let k = 0; k < 5; k++) {
    const xx = x + R.r(-w * 0.4, w * 0.4), yy = y + R.r(-8, 8), rw = R.r(w * 0.2, w * 0.45), rh = R.r(3, 7);
    g.save(); g.translate(xx, yy); g.rotate(-0.12); g.fillStyle = rgba(col, a * R.r(0.5, 1)); g.beginPath(); g.ellipse(0, 0, rw, rh, 0, 0, TAU); g.fill(); g.restore();
  }
}
// the palace's storm sky (SKY_W wide, tiled; cached small: far): heaped violet storm clouds lit on top by the lightning, their undersides by
// Malachar's magenta glow; low streaks of scud; slanting veils of rain
const SKY_W = 1800, SKY_H = 372;
function drawPalSky(g) {
  const wrap = (fn) => { for (const o of [-SKY_W, 0, SKY_W]) { g.save(); g.translate(o, 0); fn(); g.restore(); } };
  const R = mulberry(7311);
  for (const [x, w] of [[140, 110], [620, 160], [1080, 120], [1500, 140]]) wrap(() => { const gr = g.createLinearGradient(0, 120, 0, 360); gr.addColorStop(0, 'rgba(40,16,60,0.45)'); gr.addColorStop(1, 'rgba(40,16,60,0)'); g.fillStyle = gr; poly(g, [x, 120, x + w, 120, x + w - 60, 360, x - 60, 360]); g.fill(); });
  for (let k2 = 0; k2 < 8; k2++) { const x = k2 * (SKY_W / 8) + R.r(0, 100), w = R.r(220, 320); wrap(() => heap(g, x, R.r(250, 300), w, R.r(60, 90), 1300 + k2, '#2a1440', '#6a4a9a', '#c040b0', false, true)); }
  for (let k2 = 0; k2 < 5; k2++) { const x = k2 * (SKY_W / 5) + R.r(0, 160), w = R.r(320, 460); wrap(() => heap(g, x, R.r(120, 170), w, R.r(90, 130), 1400 + k2, '#1e0e32', '#8a6ac0', '#a03aa0', false)); }
}
// a cobweb in a corner (cx, cy = the corner; dir = which way it opens): radial threads and sagging arcs
function cobweb(g, cx, cy, sx, sy, r, seed) {
  g.save(); g.translate(cx, cy); g.scale(sx, sy);
  g.strokeStyle = 'rgba(230,240,235,0.5)'; g.lineWidth = 1.1; g.lineCap = 'round';
  for (let k = 0; k <= 4; k++) { const a = (k / 4) * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); }
  for (let ring = 1; ring <= 4; ring++) { const rr = r * ring / 4.4; g.beginPath(); for (let k = 0; k <= 4; k++) { const a = (k / 4) * Math.PI / 2, q = rr * (1 - 0.1 * Math.sin(k * 2 + seed)); const px = Math.cos(a) * q, py = Math.sin(a) * q; if (k) g.quadraticCurveTo(Math.cos(a - 0.2) * rr * 0.84, Math.sin(a - 0.2) * rr * 0.84, px, py); else g.moveTo(px, py); } g.stroke(); }
  g.restore();
}
// a cut stone block (x0..x1, y0..y1): its own tone, chisel marks, chipped corners, a hairline crack now and then, a lit top bevel, its foot in
// shadow, a little grit
function stoneBlock(g, x0, y0, x1, y1, base, sd, lit = 0.22) {
  const w = x1 - x0, h = y1 - y0;
  g.fillStyle = base; g.fillRect(x0, y0, w, h);
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  const lg = g.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, rgba(STONE.hi, 0.18)); lg.addColorStop(0.5, rgba(STONE.hi, 0)); lg.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = lg; g.fillRect(x0, y0, w, h);
  g.strokeStyle = 'rgba(6,2,12,0.35)'; g.lineWidth = 1;   // (chisel marks)
  for (let k = 0; k < 3 + Math.floor(w / 30); k++) { const cx = x0 + hash2(sd, k) * w, cy = y0 + 4 + hash2(sd, k + 20) * (h - 8), l = 3 + hash2(sd, k + 40) * 5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + l * 0.7, cy - l * 0.5); g.stroke(); }
  g.fillStyle = rgba(STONE.hi, 0.35); for (let k = 0; k < 4; k++) g.fillRect(x0 + hash2(sd, k + 60) * w, y0 + hash2(sd, k + 70) * h, 1.4, 1.4);   // (grit)
  if (hash2(sd, 80) > 0.82) { g.strokeStyle = 'rgba(6,2,12,0.55)'; g.lineWidth = 1.1; const cx = x0 + w * (0.2 + 0.6 * hash2(sd, 81)); g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx + 5, y0 + h * 0.4); g.lineTo(cx - 2, y0 + h * 0.7); g.lineTo(cx + 3, y1); g.stroke(); }
  if (hash2(sd, 82) > 0.6) { g.fillStyle = 'rgba(6,2,12,0.45)'; const cr = hash2(sd, 83) > 0.5; g.beginPath(); g.moveTo(cr ? x1 : x0, y0); g.lineTo(cr ? x1 - 7 : x0 + 7, y0); g.lineTo(cr ? x1 : x0, y0 + 6); g.closePath(); g.fill(); }   // (a chipped corner)
  g.restore();
  g.fillStyle = rgba(STONE.hi, lit); g.fillRect(x0 + 1, y0 + 1, w - 2, 3);
  g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(x0 + 1, y1 - 5, w - 2, 5);
}
// a woven tapestry (cx, top, w, h): a gold rod, the cloth's weave, a patterned border, its picture -- 'sun' (the Palace of the Sun as it was,
// gold under a blue sky) or 'map' (Skull Island) -- faded under the palace's purple, a fringed hem, a tear
function tapestry(g, cx, top, w, h, kind) {
  g.save(); g.translate(cx, top);
  g.strokeStyle = LINE; g.lineWidth = 7 * LK + 1.4; g.beginPath(); g.moveTo(-w / 2 - 10, 0); g.lineTo(w / 2 + 10, 0); g.stroke();
  g.strokeStyle = GOLD.base; g.lineWidth = 4; g.stroke(); g.fillStyle = GOLD.hi; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * (w / 2 + 11), 0, 5, 0, TAU); g.fill(); }
  const cloth = (g) => { g.beginPath(); g.moveTo(-w / 2, 3); g.lineTo(w / 2, 3); g.quadraticCurveTo(w / 2 + 3, h * 0.5, w / 2, h); g.lineTo(w * 0.1, h + 3); g.lineTo(-w / 2, h); g.quadraticCurveTo(-w / 2 - 3, h * 0.5, -w / 2, 3); g.closePath(); };
  ink(g, cloth, kind === 'map' ? '#c8b088' : '#2a4a7a', 3, (g) => {
    const ix = -w / 2 + 12, iy = 15, iw = w - 24, ih = h - 30;
    if (kind === 'sun') {   // (the Palace of the Sun, the book's: a white-and-gold spired castle on a rocky green island in a blue sea, the sun over its tallest spire)
      vgrad(g, ix, iy, iw, iy + ih * 0.66, [[0, '#7ab0e0'], [1, '#d8e8f0']]);
      g.fillStyle = '#3a7ab0'; g.fillRect(ix, iy + ih * 0.66, iw, ih * 0.34);
      g.fillStyle = 'rgba(255,255,255,0.35)'; for (let k2 = 0; k2 < 4; k2++) g.fillRect(ix + 6 + k2 * iw * 0.25, iy + ih * (0.72 + k2 * 0.06), iw * 0.14, 1.6);
      g.fillStyle = '#6a5a48'; blob(g, [ix + iw * 0.14, iy + ih * 0.72, ix + iw * 0.3, iy + ih * 0.6, ix + iw * 0.7, iy + ih * 0.6, ix + iw * 0.86, iy + ih * 0.72, ix + iw * 0.5, iy + ih * 0.78]); g.fill();
      g.fillStyle = '#4a8a3a'; blob(g, [ix + iw * 0.2, iy + ih * 0.64, ix + iw * 0.34, iy + ih * 0.57, ix + iw * 0.66, iy + ih * 0.57, ix + iw * 0.8, iy + ih * 0.64, ix + iw * 0.5, iy + ih * 0.67]); g.fill();
      const cx2 = 0, base = iy + ih * 0.6;
      for (const [dx, hh, ww] of [[-0.24, 0.16, 0.08], [-0.12, 0.26, 0.08], [0, 0.36, 0.1], [0.12, 0.24, 0.08], [0.24, 0.15, 0.08]]) {
        const tx = cx2 + dx * iw, th = hh * ih, tw = ww * iw;
        g.fillStyle = '#f2ece0'; g.fillRect(tx - tw / 2, base - th, tw, th);
        g.fillStyle = '#e0a830'; poly(g, [tx - tw * 0.62, base - th, tx, base - th - tw * 1.4, tx + tw * 0.62, base - th]); g.fill();
        g.fillStyle = '#c8a050'; g.fillRect(tx - 1.2, base - th * 0.6, 2.4, 4);
      }
      g.fillStyle = '#f2ece0'; g.fillRect(cx2 - iw * 0.28, base - ih * 0.1, iw * 0.56, ih * 0.1);
      g.fillStyle = '#ffd860'; g.beginPath(); g.arc(cx2, iy + ih * 0.1, iw * 0.08, 0, TAU); g.fill();
      g.strokeStyle = '#ffd860'; g.lineWidth = 2; for (let k2 = 0; k2 < 12; k2++) { const an = k2 * TAU / 12; g.beginPath(); g.moveTo(cx2 + Math.cos(an) * iw * 0.11, iy + ih * 0.1 + Math.sin(an) * iw * 0.11); g.lineTo(cx2 + Math.cos(an) * iw * 0.16, iy + ih * 0.1 + Math.sin(an) * iw * 0.16); g.stroke(); }
    } else {   // (a map of the island: parchment, the coast, the volcano and the skull, a dashed course)
      g.fillStyle = '#5a8a9a'; g.fillRect(ix, iy, iw, ih);
      g.fillStyle = '#a8a060'; blob(g, [ix + iw * 0.2, iy + ih * 0.5, ix + iw * 0.3, iy + ih * 0.2, ix + iw * 0.6, iy + ih * 0.18, ix + iw * 0.82, iy + ih * 0.4, ix + iw * 0.76, iy + ih * 0.78, ix + iw * 0.4, iy + ih * 0.84]); g.fill();
      g.fillStyle = '#6a4a3a'; poly(g, [ix + iw * 0.42, iy + ih * 0.56, ix + iw * 0.52, iy + ih * 0.3, ix + iw * 0.62, iy + ih * 0.56]); g.fill();
      g.fillStyle = '#e8e0f0'; g.beginPath(); g.arc(ix + iw * 0.52, iy + ih * 0.3, iw * 0.06, 0, TAU); g.fill(); g.fillStyle = '#2a1a2a'; g.fillRect(ix + iw * 0.5, iy + ih * 0.29, 2, 2); g.fillRect(ix + iw * 0.535, iy + ih * 0.29, 2, 2);
      g.strokeStyle = '#8a2a20'; g.lineWidth = 1.6; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(ix + 6, iy + ih - 8); g.quadraticCurveTo(ix + iw * 0.3, iy + ih * 0.95, ix + iw * 0.34, iy + ih * 0.7); g.stroke(); g.setLineDash([]);
    }
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; for (let y = 4; y < h; y += 3) { g.beginPath(); g.moveTo(-w / 2, y); g.lineTo(w / 2, y); g.stroke(); }   // (the weft)
    g.strokeStyle = 'rgba(0,0,0,0.08)'; for (let x = -w / 2; x < w / 2; x += 3) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }   // (the warp)
    g.strokeStyle = '#b08a2a'; g.lineWidth = 5; g.strokeRect(-w / 2 + 6, 9, w - 12, h - 18);   // (the border)
    g.strokeStyle = '#5a1a3a'; g.lineWidth = 1.6; g.setLineDash([3, 4]); g.strokeRect(-w / 2 + 6, 9, w - 12, h - 18); g.setLineDash([]);
    mottle(g, -w / 2, 0, w, h + 4, 0.4, 0.6);
    g.fillStyle = 'rgba(70,20,90,0.3)'; g.fillRect(-w / 2, 0, w, h + 4);   // (faded under the palace's purple)
    { const sg = g.createLinearGradient(-w / 2, 0, w / 2, 0); sg.addColorStop(0, 'rgba(255,255,255,0.08)'); sg.addColorStop(0.35, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = sg; g.fillRect(-w / 2, 0, w, h + 4); }
  });
  g.strokeStyle = '#b08a2a'; g.lineWidth = 1.6; for (let x = -w / 2 + 3; x < w / 2; x += 5) { const y0 = x > w * 0.1 ? h + 3 - (x - w * 0.1) * 0.0 : h; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + 1, y0 + 8); g.stroke(); }   // (the fringe)
  g.fillStyle = '#1a1226'; poly(g, [w * 0.2, h - 34, w * 0.24, h - 30, w * 0.23, h - 18, w * 0.27, h - 8, w * 0.22, h - 14, w * 0.21, h - 26]); g.fill();   // (a ragged slit)
  g.strokeStyle = 'rgba(200,170,110,0.7)'; g.lineWidth = 1; for (let q = 0; q < 4; q++) { g.beginPath(); g.moveTo(w * 0.21 + q * 2, h - 30 + q * 5); g.lineTo(w * 0.19 + q * 2, h - 27 + q * 5); g.stroke(); }   // (frayed threads)
  g.restore();
}
// a statue in a niche: an arched recess, a plinth, a hooded guardian of the old palace holding a sun-staff (its sun cracked), lit from below
function statueNiche(g, cx, yBot) {
  const nw = 74, nh = 210, top = yBot - nh;
  ink(g, (g) => { g.beginPath(); g.moveTo(cx - nw / 2, yBot); g.lineTo(cx - nw / 2, top + nw / 2); g.arc(cx, top + nw / 2, nw / 2, Math.PI, 0); g.lineTo(cx + nw / 2, yBot); g.closePath(); }, '#0e0818', 3, (g) => { vgrad(g, cx - nw, top, nw * 2, yBot, [[0, '#0a0614'], [1, '#2a1438']]); lightPool(g, cx, yBot - 30, nw * 0.8, 50, '255,80,220', 0.3); });
  g.strokeStyle = STONE.hi; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - nw / 2 - 4, yBot); g.lineTo(cx - nw / 2 - 4, top + nw / 2); g.arc(cx, top + nw / 2, nw / 2 + 4, Math.PI, 0); g.lineTo(cx + nw / 2 + 4, yBot); g.stroke();
  ink(g, (g) => { g.beginPath(); g.rect(cx - 30, yBot - 26, 60, 26); }, STONE.base, 2.4, (g) => { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(cx - 30, yBot - 26, 60, 4); });
  const sb = yBot - 26, ST = '#8a7a72';
  ink(g, (g) => { g.beginPath(); g.moveTo(cx - 22, sb); g.quadraticCurveTo(cx - 24, sb - 80, cx - 14, sb - 128); g.quadraticCurveTo(cx, sb - 150, cx + 14, sb - 128); g.quadraticCurveTo(cx + 24, sb - 80, cx + 22, sb); g.closePath(); }, ST, 2.6, (g) => {   // (the robed figure)
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx + 4, sb - 160, 30, 160); g.fillStyle = 'rgba(255,200,240,0.18)'; g.fillRect(cx - 26, sb - 60, 52, 60);
    g.strokeStyle = 'rgba(20,12,30,0.5)'; g.lineWidth = 1.4; for (const dx of [-10, -2, 7]) { g.beginPath(); g.moveTo(cx + dx, sb - 100); g.quadraticCurveTo(cx + dx * 1.3, sb - 50, cx + dx * 1.6, sb); g.stroke(); }
  });
  ink(g, (g) => { g.beginPath(); g.ellipse(cx, sb - 132, 12, 14, 0, 0, TAU); }, ST, 2.2, (g) => { g.fillStyle = '#100818'; g.beginPath(); g.ellipse(cx + 2, sb - 128, 7, 8, 0, 0, TAU); g.fill(); });   // (the hood, the face in its shadow)
  g.strokeStyle = LINE; g.lineWidth = 5; g.beginPath(); g.moveTo(cx + 18, sb - 10); g.lineTo(cx + 18, sb - 150); g.stroke(); g.strokeStyle = '#8a8098'; g.lineWidth = 2.6; g.stroke();
  ink(g, (g) => { g.beginPath(); g.arc(cx + 18, sb - 158, 9, 0, TAU); }, '#8a7a5a', 2);   // (the staff's sun, its gold long gone)
  g.strokeStyle = 'rgba(10,6,16,0.8)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx + 13, sb - 165); g.lineTo(cx + 20, sb - 157); g.lineTo(cx + 16, sb - 150); g.stroke();
}
// a stained-glass window from the old palace (its glass still whole): a round-headed frame, leaded panes round a golden sun, glowing
function stainedWindow(g, cx, yBot, ow) {
  const hw = ow * 0.26, top = yBot - 196, cy = top + hw;
  const shape = (g) => { g.beginPath(); g.moveTo(cx - hw, yBot - 40); g.lineTo(cx - hw, cy); g.arc(cx, cy, hw, Math.PI, 0); g.lineTo(cx + hw, yBot - 40); g.closePath(); };
  ink(g, shape, '#1a3040', 4, (g) => {
    const cols = ['#2a8a8a', '#c88a2a', '#3a5aa8', '#8a3a8a', '#d8b040', '#2a6a5a'];
    for (let k = 0; k < 16; k++) { const a0 = Math.PI + (k / 16) * TAU, a1 = a0 + TAU / 16; g.fillStyle = mix(cols[k % cols.length], k % 3 ? '#000000' : '#ffffff', 0.12 + 0.2 * hash2(k, 961)); g.beginPath(); g.moveTo(cx, cy + 20); g.arc(cx, cy + 20, hw * 3, a0, a1); g.closePath(); g.fill(); }
    for (let y = cy + 40; y < yBot - 40; y += 22) for (let x = cx - hw, k = 0; x < cx + hw; x += 18, k++) { g.fillStyle = mix(cols[(k + Math.round(y / 22)) % cols.length], '#000000', 0.1 + 0.3 * hash2(k, Math.round(y))); g.fillRect(x, y, 18, 22); }
    { const bg2 = g.createRadialGradient(cx - hw * 0.2, cy + 10, 4, cx, cy + 40, hw * 2.4); bg2.addColorStop(0, 'rgba(255,240,200,0.4)'); bg2.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = bg2; g.fillRect(cx - hw, top, hw * 2, yBot - top); }   // (lit from behind)
    g.fillStyle = '#ffd860'; g.beginPath(); g.arc(cx, cy + 20, hw * 0.4, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,240,200,0.25)'; g.fillRect(cx - hw, top, hw * 0.6, yBot);
    g.strokeStyle = '#0e0a14'; g.lineWidth = 3; for (let k = 0; k < 16; k++) { const a = Math.PI + (k / 16) * TAU; g.beginPath(); g.moveTo(cx, cy + 20); g.lineTo(cx + Math.cos(a) * hw * 3, cy + 20 + Math.sin(a) * hw * 3); g.stroke(); }
    for (let y = cy + 40; y < yBot - 40; y += 22) { g.beginPath(); g.moveTo(cx - hw, y); g.lineTo(cx + hw, y); g.stroke(); }
    g.beginPath(); g.arc(cx, cy + 20, hw * 0.4, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(60,10,80,0.28)'; g.fillRect(cx - hw, top, hw * 2, yBot);   // (dimmed by the storm)
  });
  g.strokeStyle = LINE; g.lineWidth = 9 * LK + 2; shape(g); g.stroke(); g.strokeStyle = STONE.hi; g.lineWidth = 5; g.stroke();
  ink(g, (g) => roundRect(g, cx - hw - 8, yBot - 44, hw * 2 + 16, 12, 3), STONE.base, 2.4);
  lightPool(g, cx, yBot - 120, hw * 2.4, 140, '255,200,120', 0.12);   // (its colour on the wall round it)
}
// Malachar's mask, after the book (book2/panels/malachar_sheet.png): ONE pale cream porcelain mask split by a thin line -- the viewer's left
// half laughs (a closed, happy eye), the right half weeps (a sad eye, a blue tear) -- and one big laughing open mouth across both halves.
// (c: a 2D context; drawn about the origin, s: half its height; ink: the outline colour; lw: the outline width)
function bookMask(c, s, ink = '#16121e', lw = Math.max(1.4, s * 0.09)) {
  const face = () => { c.beginPath(); c.moveTo(0, -s); c.bezierCurveTo(s * 0.62, -s, s * 0.8, -s * 0.45, s * 0.76, -s * 0.02); c.bezierCurveTo(s * 0.72, s * 0.5, s * 0.4, s * 0.98, 0, s); c.bezierCurveTo(-s * 0.4, s * 0.98, -s * 0.72, s * 0.5, -s * 0.76, -s * 0.02); c.bezierCurveTo(-s * 0.8, -s * 0.45, -s * 0.62, -s, 0, -s); c.closePath(); };
  face(); c.fillStyle = '#f2ead8'; c.fill();
  c.save(); face(); c.clip();
  c.fillStyle = '#ddd4c6'; c.fillRect(0, -s * 1.1, s, s * 2.2);   // (the weeping half a shade greyer)
  const sh = c.createRadialGradient(-s * 0.25, -s * 0.4, s * 0.1, 0, 0, s * 1.1); sh.addColorStop(0, 'rgba(255,255,250,0.5)'); sh.addColorStop(0.6, 'rgba(255,255,250,0)'); sh.addColorStop(1, 'rgba(90,70,90,0.28)');
  c.fillStyle = sh; c.fillRect(-s, -s * 1.1, s * 2, s * 2.2);   // (porcelain: a soft sheen, shaded to its edges)
  c.restore();
  face(); c.lineWidth = lw; c.strokeStyle = ink; c.stroke();
  c.lineWidth = Math.max(1, lw * 0.5); c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * 0.04, -s * 0.5, -s * 0.02, -s * 0.1); c.quadraticCurveTo(s * 0.03, s * 0.2, 0, s * 0.26); c.moveTo(0, s * 0.86); c.lineTo(0, s); c.stroke();   // (the split)
  c.lineCap = 'round';
  // the laughing half: a raised brow, a closed happy eye (an arch), a round cheek
  c.lineWidth = Math.max(1, lw * 0.7); c.beginPath(); c.arc(-s * 0.36, -s * 0.48, s * 0.17, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  c.lineWidth = Math.max(1.2, lw * 0.85); c.beginPath(); c.arc(-s * 0.35, -s * 0.18, s * 0.16, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  c.fillStyle = 'rgba(230,150,150,0.28)'; c.beginPath(); c.ellipse(-s * 0.48, s * 0.1, s * 0.14, s * 0.08, 0, 0, Math.PI * 2); c.fill();
  // the weeping half: a brow slanting up to the middle, a sad open eye, a blue tear running down
  c.lineWidth = Math.max(1, lw * 0.7); c.beginPath(); c.moveTo(s * 0.54, -s * 0.38); c.quadraticCurveTo(s * 0.36, -s * 0.44, s * 0.16, -s * 0.56); c.stroke();
  c.fillStyle = '#fbf7ee'; c.beginPath(); c.moveTo(s * 0.18, -s * 0.2); c.quadraticCurveTo(s * 0.34, -s * 0.34, s * 0.52, -s * 0.2); c.quadraticCurveTo(s * 0.36, -s * 0.08, s * 0.18, -s * 0.2); c.closePath(); c.fill(); c.lineWidth = Math.max(1, lw * 0.6); c.stroke();
  c.fillStyle = ink; c.beginPath(); c.arc(s * 0.34, -s * 0.17, s * 0.06, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(80,150,220,0.55)'; c.lineWidth = Math.max(1, s * 0.05); c.beginPath(); c.moveTo(s * 0.4, -s * 0.1); c.quadraticCurveTo(s * 0.44, s * 0.06, s * 0.42, s * 0.18); c.stroke();
  c.fillStyle = '#5aa8e8'; c.beginPath(); c.moveTo(s * 0.42, s * 0.12); c.quadraticCurveTo(s * 0.5, s * 0.26, s * 0.42, s * 0.3); c.quadraticCurveTo(s * 0.34, s * 0.26, s * 0.42, s * 0.12); c.closePath(); c.fill(); c.strokeStyle = ink; c.lineWidth = Math.max(0.8, lw * 0.4); c.stroke();
  // the one big laughing mouth across both halves: dark inside, a row of top teeth, a tongue
  const mouth = () => { c.beginPath(); c.moveTo(-s * 0.46, s * 0.3); c.quadraticCurveTo(0, s * 0.4, s * 0.46, s * 0.3); c.quadraticCurveTo(s * 0.4, s * 0.78, 0, s * 0.8); c.quadraticCurveTo(-s * 0.4, s * 0.78, -s * 0.46, s * 0.3); c.closePath(); };
  mouth(); c.fillStyle = '#4a1624'; c.fill();
  c.save(); mouth(); c.clip();
  c.fillStyle = '#fbf7ee'; c.fillRect(-s * 0.5, s * 0.28, s, s * 0.14);
  c.fillStyle = '#d8606e'; c.beginPath(); c.ellipse(0, s * 0.78, s * 0.26, s * 0.16, 0, 0, Math.PI * 2); c.fill();
  c.restore();
  mouth(); c.strokeStyle = ink; c.lineWidth = Math.max(1, lw * 0.8); c.stroke();
  c.lineCap = 'butt';
}
// the palace's emblem: Malachar's mask (the book's), a purple glow behind it -- (cx, cy) its centre, s half its height
function splitMask(g, cx, cy, s, glow = 0) {
  g.save(); g.translate(cx, cy);
  if (glow > 0) { const gr = g.createRadialGradient(0, 0, s * 0.5, 0, 0, s * 1.6); gr.addColorStop(0, rgba(MAG, 0.35 * glow)); gr.addColorStop(1, rgba(MAG, 0)); g.fillStyle = gr; g.fillRect(-s * 1.7, -s * 1.7, s * 3.4, s * 3.4); }
  bookMask(g, s, LINE, Math.max(1.4, s * 0.09) * LK);
  g.restore();
}
// a banner: a long purple cloth hanging from a gold rod, a split mask on it, magenta trim and a ragged hem
function banner(g, cx, top, w, h, seed) {
  g.save(); g.translate(cx, top);
  g.strokeStyle = LINE; g.lineWidth = 7 * LK + 1.4; g.beginPath(); g.moveTo(-w / 2 - 8, 0); g.lineTo(w / 2 + 8, 0); g.stroke();
  g.strokeStyle = GOLD.base; g.lineWidth = 4; g.stroke(); g.fillStyle = GOLD.hi; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * (w / 2 + 9), 0, 4.4, 0, TAU); g.fill(); }
  const sw = (y) => 3 * Math.sin(seed + y * 0.05);
  ink(g, (g) => { g.beginPath(); g.moveTo(-w / 2, 3); g.lineTo(w / 2, 3); for (let i = 0; i <= 4; i++) { const x = w / 2 - i * w / 4, y = h - (i % 2 ? 0 : 16); g.lineTo(x + sw(y), y); } g.closePath(); }, '#4a1a6a', 3, (g) => {
    { const sg = g.createLinearGradient(-w / 2, 0, w / 2, 0); sg.addColorStop(0, 'rgba(255,255,255,0.12)'); sg.addColorStop(0.35, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.32)'); g.fillStyle = sg; g.fillRect(-w / 2, 0, w, h); }
    g.fillStyle = rgba(MAG, 0.7); g.fillRect(-w / 2, 8, w, 4); g.fillRect(-w / 2, h - 30, w, 3);
  });
  splitMask(g, 0, h * 0.42, w * 0.3);
  g.restore();
}
// a carved stone mask relief on a pillar: a plate with the split mask
function maskPlate(g, cx, cy, s) {
  ink(g, (g) => roundRect(g, cx - s * 0.95, cy - s * 1.15, s * 1.9, s * 2.3, 6), STONE.base, 2.4, (g) => { g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(cx - s, cy - s * 1.2, s * 0.5, s * 2.4); });
  splitMask(g, cx, cy, s * 0.82);
}
// jagged rock: a spire with a crooked top (cx, base y, half width, height)
function spire(g, cx, by, hw, hh, seed, lit) {
  const R = mulberry(seed), n = 5, pts = [[cx - hw, by]];
  for (let i = 1; i < n; i++) pts.push([cx - hw + (i / n) * hw * 1.2 + R.r(-hw * 0.14, hw * 0.14), by - hh * (0.35 + 0.5 * Math.sin((i / n) * Math.PI * 0.55)) + R.r(-hh * 0.06, hh * 0.06)]);
  pts.push([cx + R.r(-hw * 0.12, hw * 0.12), by - hh]);
  for (let i = n - 1; i >= 1; i--) pts.push([cx + hw - (i / n) * hw * 1.2 + R.r(-hw * 0.14, hw * 0.14), by - hh * (0.3 + 0.5 * Math.sin((i / n) * Math.PI * 0.55)) + R.r(-hh * 0.06, hh * 0.06)]);
  pts.push([cx + hw, by]);
  ink(g, (g) => poly(g, flat(pts)), ROCK.base, 3, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(cx - hw, by - hh, hw * 0.7, hh); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx + hw * 0.2, by - hh, hw, hh);
    if (lit) { g.fillStyle = rgba(MAG, 0.16); g.fillRect(cx + hw * 0.55, by - hh, hw * 0.5, hh); }
    g.strokeStyle = rgba(ROCK.joint, 0.7); g.lineWidth = 1.6; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(cx - hw * 0.5 + k * hw * 0.5, by - hh * 0.9); g.lineTo(cx - hw * 0.3 + k * hw * 0.5 + R.r(-6, 6), by - hh * 0.5); g.lineTo(cx - hw * 0.4 + k * hw * 0.5, by); g.stroke(); }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// THE GATE: the cliff path and the skull's face with its wooden door
// ---------------------------------------------------------------------------------------------------------------
// the cliff behind the path: a black ridge that rises toward the skull, spires along it
function ridgeTop(x) { return lerp(196 + 52 * vnoise(x, 130, 3) + 16 * vnoise(x, 37, 4), -40, sstep(760, 1110, x)); }
function drawCliff(g, xa, xb) {
  const x0 = Math.max(xa - 4, -20), x1 = Math.min(xb + 4, CORR_X - 30);   // (on behind the skull: rock in its jaw's corners)
  if (x1 <= x0) return;
  // the rock mass
  g.beginPath(); g.moveTo(x0, 372);
  for (let x = x0; x <= x1; x += 6) g.lineTo(x, ridgeTop(x));
  g.lineTo(x1, 372); g.closePath();
  const gr = g.createLinearGradient(0, 0, 0, 372); gr.addColorStop(0, '#1c1428'); gr.addColorStop(0.55, '#241a30'); gr.addColorStop(1, '#2e2240');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = LINE; g.lineWidth = 4 * LK; g.beginPath(); for (let x = x0; x <= x1; x += 6) (x === x0 ? g.moveTo(x, ridgeTop(x)) : g.lineTo(x, ridgeTop(x))); g.stroke();
  // strata cracks and a lit rim (magenta, from the skull's eyes), chunk-safe
  g.save(); g.beginPath(); g.moveTo(x0, 372); for (let x = x0; x <= x1; x += 6) g.lineTo(x, ridgeTop(x)); g.lineTo(x1, 372); g.closePath(); g.clip();
  for (let x = al(x0, 90) - 90; x < x1 + 90; x += 90) {   // (cracks and ledges, each its own: lit lip above, undercut below)
    const i = Math.round(x / 90), r = hash2(i, 61);
    if (r < 0.2) continue;
    let px = x, py = ridgeTop(x) + 24 + hash2(i, 62) * 140; const pts = [px, py], n = 2 + Math.floor(hash2(i, 66) * 4);
    for (let j = 0; j < n; j++) { px += 14 + hash2(i, 70 + j) * 30; py += (hash2(i, 80 + j) - 0.4) * 24; pts.push(px, py); }
    { const ph = 10 + hash2(i, 67) * 14, lp = pts.slice(); for (let j = pts.length - 2; j >= 0; j -= 2) lp.push(pts[j] + 5, pts[j + 1] - ph);   // (the ledge's top: a plane lit by the storm)
      const lg2 = g.createLinearGradient(0, pts[1] - ph, 0, pts[1]); lg2.addColorStop(0, 'rgba(150,130,190,0)'); lg2.addColorStop(1, 'rgba(150,130,190,0.24)'); g.fillStyle = lg2; poly(g, lp); g.fill();
      const up = pts.slice(); for (let j = pts.length - 2; j >= 0; j -= 2) up.push(pts[j] - 3, pts[j + 1] + 16 + hash2(i, 68) * 10);   // (and under it a dark undercut)
      const ug = g.createLinearGradient(0, pts[1], 0, pts[1] + 26); ug.addColorStop(0, 'rgba(4,2,8,0.5)'); ug.addColorStop(1, 'rgba(4,2,8,0)'); g.fillStyle = ug; poly(g, up); g.fill(); }
    polyline(g, pts.map((v, j) => (j & 1 ? v + 4 : v))); g.strokeStyle = 'rgba(4,2,8,0.45)'; g.lineWidth = 6; g.stroke();
    polyline(g, pts); g.strokeStyle = rgba(ROCK.joint, 0.8); g.lineWidth = 2; g.stroke();
    polyline(g, pts.map((v, j) => (j & 1 ? v - 2.4 : v))); g.strokeStyle = rgba(ROCK.hi, 0.4); g.lineWidth = 1.2; g.stroke();
  }
  for (let x = al(x0, 70) - 70; x < x1 + 70; x += 70) {   // (the rock's facets: lit planes and shadowed ones, the cold storm light from the left)
    const i = Math.round(x / 70), y = ridgeTop(x + 35) + 10 + hash2(i, 66) * 60, hh = 60 + hash2(i, 67) * 90, ww = 30 + hash2(i, 68) * 40;
    const fg = g.createLinearGradient(x, y, x + ww * 0.3, y + hh); fg.addColorStop(0, hash2(i, 69) > 0.5 ? 'rgba(170,140,220,0.15)' : 'rgba(0,0,0,0.26)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fg; poly(g, [x, y + hh, x + ww * 0.3, y, x + ww, y + 12, x + ww * 0.8, y + hh]); g.fill();
    g.strokeStyle = 'rgba(170,140,220,0.12)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + ww * 0.3, y); g.lineTo(x, y + hh); g.stroke();
  }
  { const rl = []; for (let x = x0; x <= x1; x += 6) rl.push(x, ridgeTop(x) + 16); g.strokeStyle = 'rgba(150,130,190,0.1)'; g.lineWidth = 32; polyline(g, rl); g.stroke();   // (the storm's light on the rock's crown)
    const rl2 = rl.map((v, j) => (j & 1 ? v - 10 : v)); g.strokeStyle = 'rgba(170,150,210,0.12)'; g.lineWidth = 10; polyline(g, rl2); g.stroke(); }
  mottle(g, x0, 0, x1 - x0, 372, 0.5);
  vgrad(g, x0, 200, x1 - x0, 372, [[0, 'rgba(255,60,200,0)'], [1, 'rgba(255,60,200,0.1)']]);
  g.restore();
  // at the cliff's foot: a broken statue of the old palace, an iron ring post with a hanging chain, a skull-carved milestone
  if (xa < 1000 && xb > 140) {
    const by = 360;
    if (xb > 420 && xa < 640) {   // (the statue: a robed figure on a plinth, its head and staff arm broken off)
      ink(g, (g) => { g.beginPath(); g.rect(500, by - 34, 60, 34); }, '#3a3044', 2.6, (g) => { mottle(g, 500, by - 34, 60, 34, 0.5); g.fillStyle = 'rgba(200,180,230,0.15)'; g.fillRect(500, by - 34, 60, 4); });
      ink(g, (g) => { g.beginPath(); g.moveTo(510, by - 34); g.quadraticCurveTo(506, by - 100, 516, by - 140); g.lineTo(522, by - 148); g.lineTo(532, by - 140); g.lineTo(540, by - 150); g.lineTo(546, by - 136); g.quadraticCurveTo(556, by - 96, 550, by - 34); g.closePath(); }, '#4a4058', 2.6, (g) => { mottle(g, 500, by - 160, 60, 130, 0.5); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(534, by - 160, 30, 130); g.strokeStyle = 'rgba(6,2,12,0.5)'; g.lineWidth = 1.2; for (const dx of [-8, 2, 10]) { g.beginPath(); g.moveTo(530 + dx, by - 120); g.quadraticCurveTo(530 + dx * 1.3, by - 70, 530 + dx * 1.5, by - 36); g.stroke(); } });
      ink(g, (g) => { g.beginPath(); g.ellipse(578, by - 6, 14, 7, 0.3, 0, TAU); }, '#4a4058', 2);   // (its fallen head, in the dust)
    }
    if (xb > 200 && xa < 320) {   // (an iron ring post, a chain sagging from it)
      ink(g, (g) => { g.beginPath(); g.rect(256, by - 70, 10, 70); }, '#2a2830', 2.2);
      ink(g, (g) => { g.beginPath(); g.arc(261, by - 74, 8, 0, TAU); }, null, 2.6); g.strokeStyle = '#6a6070'; g.lineWidth = 3; g.beginPath(); g.arc(261, by - 74, 8, 0, TAU); g.stroke();
      g.strokeStyle = '#4a4450'; g.lineWidth = 3; g.setLineDash([5, 3]); g.beginPath(); g.moveTo(266, by - 70); g.quadraticCurveTo(300, by - 20, 330, by - 4); g.stroke(); g.setLineDash([]);
    }
    if (xb > 820 && xa < 940) {   // (a milestone carved with a little skull, pointing the way)
      ink(g, (g) => { g.beginPath(); g.moveTo(860, by); g.lineTo(862, by - 46); g.quadraticCurveTo(880, by - 60, 898, by - 46); g.lineTo(900, by); g.closePath(); }, '#3e3448', 2.4, (g) => { mottle(g, 856, by - 62, 48, 62, 0.5); g.fillStyle = 'rgba(200,180,230,0.15)'; g.fillRect(856, by - 62, 14, 62); });
      g.strokeStyle = 'rgba(14,8,20,0.85)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(870, by - 30); g.lineTo(890, by - 30); g.moveTo(883, by - 37); g.lineTo(891, by - 30); g.lineTo(883, by - 23); g.stroke();   // (an arrow carved in it, pointing to the door)
      g.strokeStyle = 'rgba(200,180,230,0.2)'; g.lineWidth = 1; g.beginPath(); g.moveTo(870, by - 28); g.lineTo(889, by - 28); g.stroke();
    }
  }
  // spires along the ridge (before the skull's rise)
  for (let x = al(x0 - 100, 150) - 150; x < Math.min(x1 + 100, 940); x += 150) {
    const i = Math.round(x / 150), r = hash2(i, 70);
    if (x < -40) continue;
    if (hash2(i, 73) < 0.25) continue;
    const cx = x + r * 90, hh = 34 + 110 * hash2(i, 71) ** 1.4, hw = 14 + 26 * hash2(i, 72), lean = (hash2(i, 74) - 0.5) * 0.5;
    if (cx < x0 - 40 || cx > x1 + 40) continue;
    g.save(); g.translate(cx, ridgeTop(cx) + 14); g.transform(1, 0, lean, 1, 0, 0); g.translate(-cx, -(ridgeTop(cx) + 14));
    spire(g, cx, ridgeTop(cx) + 14, hw, hh, 900 + i * 13, i % 2 === 0);
    if (hash2(i, 75) > 0.5) spire(g, cx + hw * 1.3, ridgeTop(cx) + 18, hw * 0.6, hh * 0.5, 950 + i * 13, false);   // (a smaller one beside it)
    g.restore();
  }
}
// the skull: a great face of black rock cut into the cliff, its eyes glowing (live), its mouth the doorway; the upper teeth hang over the door
function drawSkull(g) {
  g.save(); g.translate(DOOR_X, SK_Y);
  const top = -SK_Y - 40, jawY = 6;
  // the face plate: rock to the top of the screen, cheekbones wide, the jaw tapering
  const face = (g) => { g.beginPath(); g.moveTo(-352, top); g.lineTo(-352, -150); g.quadraticCurveTo(-348, -60, -306, jawY); g.lineTo(306, jawY); g.quadraticCurveTo(348, -60, 352, -150); g.lineTo(352, top); g.closePath(); };
  ink(g, face, '#2e2836', 5.5, (g) => {
    const lg = g.createRadialGradient(-180, top + 60, 40, -60, -200, 520); lg.addColorStop(0, '#565068'); lg.addColorStop(0.45, '#36303e'); lg.addColorStop(1, '#1a1620');   // (charcoal stone, lit from the storm at upper left)
    g.fillStyle = lg; g.fillRect(-360, top, 720, -top + jawY);
    mottle(g, -360, top, 720, -top + 20, 0.6);
    const mossSites = [];   // (the moss is drawn after the crack network, below)
    if (!LIVE) { const R3 = mulberry(4519), R4 = mulberry(4527), gs = (v, w) => Math.exp(-(v / w) * (v / w));   // (not in the paint-every-frame fallback: critic B)
      // great blocks along courses that bow with the skull: dipping under the sockets, rising over the cheekbones
      const course = (y0) => (x) => y0 + 4 * Math.sin(x * 0.011 + y0 * 0.07) + 3 * Math.sin(x * 0.027 + y0) + 18 * gs(Math.abs(x) - 160, 80) * gs(y0 + 330, 90) - 14 * gs(Math.abs(x) - 245, 60) * gs(y0 + 180, 70);
      const lips = []; let y = top + 22, ci = 0;
      while (y < jawY - 30) { const hgt = R3.r(80, 110); lips.push([course(y), course(y + hgt), ci]); y += hgt; ci++; }
      const pitAt = (px, py, rx, ry) => { g.save(); g.translate(px, py); g.scale(rx, ry); const pg = g.createRadialGradient(-0.2, -0.3, 0, 0, 0, 1.15); pg.addColorStop(0, 'rgba(6,2,14,0.3)'); pg.addColorStop(0.55, 'rgba(6,2,14,0.18)'); pg.addColorStop(1, 'rgba(6,2,14,0)'); g.fillStyle = pg; g.beginPath(); g.arc(0, 0, 1.15, 0, TAU); g.fill(); g.restore(); g.strokeStyle = 'rgba(190,170,220,0.2)'; g.lineWidth = 1; g.beginPath(); g.ellipse(px, py + 0.8, rx * 0.9, ry * 0.9, 0, Math.PI * 0.22, Math.PI * 0.52); g.stroke(); };   // (a pit: a soft hollow, darkest up and left, a short lit lip -- no outline, never a ring)
      for (const [lipA, lipB, k] of lips) {
        const tone = (xa, xe) => {   // (each block's own face: lit along its top, darker toward its bed joint, its own tone)
          if (xe - xa < 8) return;
          const t2 = R4.r(-1, 1), bg2 = g.createLinearGradient(0, lipA((xa + xe) / 2), 0, lipB((xa + xe) / 2));
          bg2.addColorStop(0, 'rgba(206,190,232,0.08)'); bg2.addColorStop(0.3, 'rgba(206,190,232,0)'); bg2.addColorStop(0.65, 'rgba(6,2,14,0)'); bg2.addColorStop(1, 'rgba(6,2,14,0.11)');
          g.beginPath(); g.moveTo(xa, lipA(xa)); for (let q = xa + 20; q < xe; q += 20) g.lineTo(q, lipA(q)); g.lineTo(xe, lipA(xe)); g.lineTo(xe, lipB(xe)); for (let q = xe - 20; q > xa; q -= 20) g.lineTo(q, lipB(q)); g.lineTo(xa, lipB(xa)); g.closePath();
          g.fillStyle = bg2; g.fill(); g.fillStyle = t2 > 0 ? `rgba(206,190,232,${(0.045 * t2).toFixed(3)})` : `rgba(6,2,14,${(-0.06 * t2).toFixed(3)})`; g.fill();
        };
        g.beginPath(); g.moveTo(-370, lipA(-370)); for (let x = -350; x <= 370; x += 20) g.lineTo(x, lipA(x)); for (let x = 370; x >= -370; x -= 20) g.lineTo(x, lipB(x)); g.closePath();
        g.fillStyle = k % 2 ? 'rgba(150,130,180,0.07)' : 'rgba(6,2,14,0.1)'; g.fill();   // (the course's own tone)
        g.beginPath(); for (let x = -370; x <= 370; x += 20) (x === -370 ? g.moveTo(x, lipB(x)) : g.lineTo(x, lipB(x))); g.strokeStyle = 'rgba(8,4,14,0.45)'; g.lineWidth = 2.6; g.stroke();   // (the bed joint under it)
        g.beginPath(); for (let x = -370; x <= 370; x += 20) (x === -370 ? g.moveTo(x, lipB(x) + 2.4) : g.lineTo(x, lipB(x) + 2.4)); g.strokeStyle = 'rgba(176,156,206,0.18)'; g.lineWidth = 1.4; g.stroke();   // (the next course's lit lip)
        let x = -370 + R3.r(0, 140) + (k % 2) * 90;
        tone(-370, x);
        while (x < 370) {
          const nx = x + R3.r(180, 320), ya = lipA(x) + 2, yb = lipB(x) - 1;
          tone(x, Math.min(nx, 370));
          g.strokeStyle = 'rgba(8,4,14,0.4)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, ya); g.lineTo(x + R3.r(-4, 4), yb); g.stroke();   // (the head joint)
          g.strokeStyle = 'rgba(176,156,206,0.14)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 2.4, ya + 1); g.lineTo(x + 2.4, yb); g.stroke();
          if (R3() < 0.45) {   // (a spalled corner where the joints meet)
            const cy = R3() < 0.5 ? lipA(x) + 2 : lipB(x) - 2, d = cy > (ya + yb) / 2 ? -1 : 1, sx = R3() < 0.5 ? 1 : -1, w2 = R3.r(10, 18), h2 = R3.r(7, 12);
            g.fillStyle = 'rgba(6,2,14,0.32)'; g.beginPath(); g.moveTo(x, cy); g.lineTo(x + sx * w2, cy); g.lineTo(x, cy + d * h2); g.closePath(); g.fill();
            g.strokeStyle = 'rgba(190,170,220,0.28)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(x + sx * w2, cy); g.lineTo(x, cy + d * h2); g.stroke();
          }
          const bx0 = x + 14, bx1 = Math.min(nx, 370) - 14, my = (lipA((bx0 + bx1) / 2) + lipB((bx0 + bx1) / 2)) / 2;
          if (bx1 - bx0 > 40) {
            const r = R3();
            if (r < 0.35) {   // (tool marks: each patch its own count, angle, length and spacing; faint)
              const tx = R3.r(bx0, bx1 - 30), n = 3 + Math.floor(R4() * 5), an = R4.r(-0.35, 0.75), sp = R4.r(3.5, 7.5), ln = R4.r(12, 28);
              g.strokeStyle = 'rgba(8,4,14,0.12)'; g.lineWidth = 1; g.beginPath();
              for (let q = 0; q < n; q++) { const l2 = ln * R4.r(0.55, 1.1), ox = tx + q * sp * R4.r(0.75, 1.3), oy = my - l2 / 2 + R4.r(-4, 4), a2 = an + R4.r(-0.08, 0.08); g.moveTo(ox, oy); g.lineTo(ox + Math.sin(a2) * l2, oy + Math.cos(a2) * l2); }
              g.stroke();
            }
            else if (r < 0.65) { const sx2 = R3.r(bx0, bx1 - 20), sy2 = my + R3.r(-14, 8), sw = R3.r(22, 40), sh2 = R3.r(10, 18); g.fillStyle = 'rgba(160,140,190,0.1)'; g.beginPath(); g.moveTo(sx2, sy2); g.lineTo(sx2 + sw * 0.6, sy2 - sh2 * 0.4); g.lineTo(sx2 + sw, sy2 + sh2 * 0.2); g.lineTo(sx2 + sw * 0.7, sy2 + sh2 * 0.8); g.lineTo(sx2 + sw * 0.1, sy2 + sh2 * 0.6); g.closePath(); g.fill(); g.strokeStyle = 'rgba(6,2,14,0.3)'; g.lineWidth = 1.2; g.stroke(); }   // (a spall: a shallow scar)
            if (R3() < 0.5) pitAt(R3.r(bx0, bx1), my + R3.r(-16, 16), R3.r(5, 11), R3.r(3, 6));   // (a pit, shaded)
          }
          x = nx;
        }
      }
      // streaks anchored on the form: under each socket, off each cheekbone's end, down from a few ledges; fading in at their heads,
      // their width wobbling; dark damp, olive moss, pale mineral; one or two dripping
      const anchors = [];
      for (const sd of [-1, 1]) { anchors.push([sd * 130, -238, 'damp'], [sd * 182, -240, 'mineral'], [sd * 176, -122, 'moss'], [sd * 214, -146, 'damp']); }
      for (let k = 0; k < 5; k++) { const L = lips[1 + Math.floor(R3() * (lips.length - 2))], x = R3.r(-320, 320); if (Math.abs(x) < 90) continue; anchors.push([x, L[1](x) + 2, R3() < 0.5 ? 'damp' : 'mineral']); }
      for (const [ax, ay, kind] of anchors) {
        const len = R3.r(50, 120), w0 = R3.r(3.5, 7), col = kind === 'moss' ? '84,104,56' : kind === 'mineral' ? '196,186,206' : '10,6,20', pk = kind === 'mineral' ? 0.16 : kind === 'moss' ? 0.34 : 0.32;
        const strand = (ox, l2, w1) => { const L2 = [], Rt = []; for (let q = 0; q <= 10; q++) { const u = q / 10, yy = ay + u * l2, ww = w1 * (0.5 + 0.5 * Math.sin(u * 9 + ox)) * (1 - u * 0.5) + 0.6, xx = ax + ox + Math.sin(u * 5 + ax) * 2; L2.push([xx - ww, yy]); Rt.push([xx + ww, yy]); }
          const sg = g.createLinearGradient(0, ay, 0, ay + l2); sg.addColorStop(0, `rgba(${col},0)`); sg.addColorStop(0.15, `rgba(${col},${pk})`); sg.addColorStop(1, `rgba(${col},0)`); g.fillStyle = sg;
          g.beginPath(); g.moveTo(L2[0][0], L2[0][1]); for (const [px, py] of L2) g.lineTo(px, py); for (let q = Rt.length - 1; q >= 0; q--) g.lineTo(Rt[q][0], Rt[q][1]); g.closePath(); g.fill(); };
        strand(0, len, w0); if (R3() < 0.35) strand(w0 * 1.6, len * 0.6, w0 * 0.5);   // (a drip off it)
      }
      for (let k = 0; k < 5; k++) {   // (moss sites on the ledges, kept off the streaks' heads; drawn after the crack network, below)
        const L = lips[Math.floor(R3() * (lips.length - 1))]; let x = R3.r(-300, 300); if (Math.abs(x) < 110) continue;
        const rw = R3.r(14, 24), rh = R3.r(6, 10); for (let q = 0; q < 4; q++) R3();
        for (const [ax, ay] of anchors) if (Math.abs(ax - x) < rw + 12 && Math.abs(ay - L[1](x)) < 40) x = ax + (x >= ax ? 1 : -1) * (rw + 16);
        if (Math.abs(x) >= 110 && Math.abs(x) <= 330) mossSites.push([x, L[1], rw, rh]);
      }
      for (const sd of [-1, 1]) {
        const sp = g.createRadialGradient(sd * 160, -250, 10, sd * 160, -250, 130); sp.addColorStop(0, 'rgba(255,70,220,0.2)'); sp.addColorStop(1, 'rgba(255,70,220,0)'); g.fillStyle = sp; g.fillRect(sd * 160 - 140, -390, 280, 280);   // (the eye fire's magenta spilling onto the bone round the socket)
        // soot where it shows (the strip's top is skull-y -352): a soft shadow along the socket's visible outer rim, faded at both ends,
        // and tongues licking up and out from its outer side, each feathered at its base
        { const a0 = sd > 0 ? Math.PI * 1.85 : Math.PI * 0.95, a1 = sd > 0 ? Math.PI * 2.05 : Math.PI * 1.15, n = 10; g.lineCap = 'butt';
          for (let q = 0; q < n; q++) { const e = Math.sin(Math.PI * (q + 0.5) / n), b0 = a0 + (a1 - a0) * q / n, b1 = a0 + (a1 - a0) * (q + 1) / n;
            g.strokeStyle = `rgba(4,2,8,${(0.16 * e).toFixed(3)})`; g.lineWidth = 24; g.beginPath(); g.ellipse(sd * 160, -318, 106, 90, sd * -0.12, b0, b1); g.stroke();
            g.strokeStyle = `rgba(4,2,8,${(0.18 * e).toFixed(3)})`; g.lineWidth = 11; g.beginPath(); g.ellipse(sd * 160, -318, 102, 86, sd * -0.12, b0, b1); g.stroke(); } }
        for (const th of [-0.1, -0.02, 0.05, 0.11]) {   // (each tongue a chain of soft smudges along a curl up and out: smoke-soft, no edge anywhere)
          const a = sd > 0 ? -th * Math.PI : Math.PI + th * Math.PI, x0 = sd * 160 + Math.cos(a) * 98, y0 = -316 + Math.sin(a) * 84, x1 = x0 + sd * R3.r(30, 60), y1 = y0 - R3.r(54, 86), w2 = R3.r(9, 15);
          const cx = x0 + sd * 4, cy = (y0 + y1) / 2;
          for (const u of [0.1, 0.32, 0.55, 0.78]) {
            const px = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1, py = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1;
            const dx = 2 * (1 - u) * (cx - x0) + 2 * u * (x1 - cx), dy = 2 * (1 - u) * (cy - y0) + 2 * u * (y1 - cy), r = w2 * (1.25 - 0.6 * u);
            g.save(); g.translate(px, py); g.rotate(Math.atan2(dy, dx)); g.scale(1.9, 1);
            const sm = g.createRadialGradient(0, 0, 0, 0, 0, r); sm.addColorStop(0, `rgba(4,2,8,${(0.26 * (1 - 0.55 * u)).toFixed(3)})`); sm.addColorStop(0.55, `rgba(4,2,8,${(0.12 * (1 - 0.55 * u)).toFixed(3)})`); sm.addColorStop(1, 'rgba(4,2,8,0)');
            g.fillStyle = sm; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.restore();
          }
        }
      }
    }
    // the brow ridge over the sockets, the cheekbones: lit on top, shaded under -- soft, following the bone
    for (const sd of [-1, 1]) {
      const br = g.createLinearGradient(0, -420, 0, -380); br.addColorStop(0, 'rgba(170,150,190,0.35)'); br.addColorStop(1, 'rgba(170,150,190,0)');
      g.strokeStyle = br; g.lineWidth = 26; g.lineCap = 'round'; g.beginPath(); g.moveTo(sd * 60, -404); g.quadraticCurveTo(sd * 160, -430, sd * 262, -390); g.stroke();
      g.strokeStyle = 'rgba(14,8,20,0.45)'; g.lineWidth = 14; g.beginPath(); g.moveTo(sd * 252, -196); g.quadraticCurveTo(sd * 222, -132, sd * 160, -106); g.stroke();
      g.strokeStyle = 'rgba(150,134,170,0.4)'; g.lineWidth = 8; g.beginPath(); g.moveTo(sd * 266, -214); g.quadraticCurveTo(sd * 234, -152, sd * 170, -124); g.stroke();
      { const k = sd < 0 ? 1 : 0.6, rg2 = g.createLinearGradient(sd * 272, -218, sd * 168, -122); rg2.addColorStop(0, 'rgba(196,176,246,0)'); rg2.addColorStop(0.25, `rgba(196,176,246,${(0.3 * k).toFixed(3)})`); rg2.addColorStop(0.7, `rgba(196,176,246,${(0.3 * k).toFixed(3)})`); rg2.addColorStop(1, 'rgba(196,176,246,0)');
        g.strokeStyle = rg2; g.lineWidth = 1.6; g.beginPath(); g.moveTo(sd * 270, -217); g.quadraticCurveTo(sd * 238, -155, sd * 172, -127); g.stroke();
        g.lineWidth = 7; g.globalAlpha = 0.35; g.stroke(); g.globalAlpha = 1; }   // (a cool rim of the storm's lilac on each cheekbone: soft, fading out at both ends, weaker on the side turning away)
    }
    const sg = g.createLinearGradient(140, 0, 360, 0); sg.addColorStop(0, 'rgba(10,6,16,0)'); sg.addColorStop(1, 'rgba(10,6,16,0.45)'); g.fillStyle = sg; g.fillRect(140, top, 220, -top + 20);   // (its far side, turning away)
    // a network of cracks over the bone-rock (each with a lit lip)
    const R2 = mulberry(4471);
    for (let c2 = 0; c2 < 14; c2++) {
      let x = R2.r(-320, 320), y = R2.r(top + 20, -40); if (Math.abs(x) < 120 && y > -260) continue;
      const pts = [x, y]; for (let j = 0; j < 4; j++) { x += R2.r(-26, 26); y += R2.r(14, 34); pts.push(x, y); }
      polyline(g, pts); g.strokeStyle = 'rgba(8,4,12,0.75)'; g.lineWidth = 2.4; g.lineCap = 'round'; g.stroke();
      polyline(g, pts.map((v, i) => (i & 1 ? v : v + 2))); g.strokeStyle = 'rgba(170,150,190,0.3)'; g.lineWidth = 1; g.stroke();
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [mx0, lip, rw, rh] of mossSites) {   // (moss on the ledges, over the cracks: low mats hugging the joint, broken into 2-3 patches, a fringe hanging over the lip)
      const R5 = mulberry(4600 + Math.round(mx0)), nt = R5() < 0.5 ? 3 : 2; let px = mx0 - rw;
      for (let t2 = 0; t2 < nt; t2++) {   // (a patch: a soft smear of growth along the joint, stippled light on top and dark in its body, a fine fringe over the lip -- no hard outline)
        const pw = (2 * rw / nt) * R5.r(0.7, 1.0), x0 = px, x1 = px + pw, hh = rh * R5.r(0.6, 0.95), cxm = (x0 + x1) / 2; px = x1 + R5.r(2, 6);
        g.save(); g.translate(cxm, lip(cxm) - hh * 0.25); g.scale(pw * 0.55, hh * 0.75);
        const sm = g.createRadialGradient(0, 0, 0, 0, 0, 1); sm.addColorStop(0, 'rgba(82,94,62,0.72)'); sm.addColorStop(0.6, 'rgba(82,94,62,0.45)'); sm.addColorStop(1, 'rgba(82,94,62,0)');
        g.fillStyle = sm; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
        const ns = Math.round(pw * 1.4), dark = [], lite = [];
        for (let q = 0; q < ns; q++) { const x = x0 + R5() * pw, u = (x - x0) / pw, env = Math.pow(Math.sin(Math.PI * u), 0.7), up = R5(), y = lip(x) + 1 - up * hh * env * 1.1, li = up > 0.6, r = li ? R5.r(0.45, 1.0) : R5.r(0.6, 1.5); (li ? lite : dark).push([x, y, r]); }
        for (const [arr, col] of [[dark, 'rgba(52,62,42,0.45)'], [lite, 'rgba(146,156,120,0.38)']]) { g.fillStyle = col; g.beginPath(); for (const [x, y, r] of arr) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); } g.fill(); }
        const nf = Math.round(pw / 2.2); g.strokeStyle = 'rgba(70,82,54,0.4)'; g.lineWidth = 0.8; g.beginPath();
        for (let q = 0; q < nf; q++) { const sx = x0 + pw * (0.1 + 0.8 * R5()), sy = lip(sx) + 0.5, sl = R5.r(2, 6); g.moveTo(sx, sy); g.quadraticCurveTo(sx + R5.r(-1, 1), sy + sl * 0.5, sx + R5.r(-1.5, 1.5), sy + sl); }
        g.stroke();
      }
    }
    { const rg = g.createLinearGradient(0, top, 0, jawY); rg.addColorStop(0, 'rgba(196,176,246,0.5)'); rg.addColorStop(0.55, 'rgba(196,176,246,0.3)'); rg.addColorStop(1, 'rgba(196,176,246,0.06)');   // (the storm's rim down its left edge, fading toward the cheek)
      g.strokeStyle = rg; g.lineWidth = 12; g.beginPath(); g.moveTo(-352, top); g.lineTo(-352, -150); g.quadraticCurveTo(-348, -60, -306, jawY); g.stroke(); }
    { const mg = g.createLinearGradient(-340, 0, -100, 0); mg.addColorStop(0, 'rgba(255,90,220,0.38)'); mg.addColorStop(1, 'rgba(255,90,220,0)');   // (the gate torch's magenta on its jaw: strongest at the corner nearest it)
      g.strokeStyle = mg; g.lineWidth = 10; g.beginPath(); g.moveTo(-334, -50); g.quadraticCurveTo(-322, -8, -300, jawY); g.lineTo(-100, jawY); g.stroke(); }
  });
  // the eye sockets: deep black pits with a rim (the glow is drawn live)
  for (const s of [-1, 1]) {
    ink(g, (g) => { g.beginPath(); g.ellipse(s * 160, -316, 94, 80, s * -0.12, 0, TAU); }, '#05020a', 5, (g) => {
      const gr = g.createRadialGradient(s * 154, -280, 4, s * 154, -290, 96); gr.addColorStop(0, 'rgba(210,60,190,0.62)'); gr.addColorStop(0.4, 'rgba(120,24,120,0.42)'); gr.addColorStop(1, 'rgba(5,2,10,0)'); g.fillStyle = gr; g.fillRect(s * 160 - 110, -420, 220, 220);   // (the fire's glow, up from the socket's floor)
      const bs = g.createLinearGradient(0, -396, 0, -320); bs.addColorStop(0, 'rgba(2,0,6,0.85)'); bs.addColorStop(1, 'rgba(2,0,6,0)'); g.fillStyle = bs; g.fillRect(s * 160 - 110, -400, 220, 80);   // (the brow's shadow over its top)
      g.save(); g.beginPath(); g.ellipse(s * 160, -316, 94, 80, s * -0.12, 0, TAU); g.ellipse(s * 160, -329, 94, 80, s * -0.12, 0, TAU); g.clip('evenodd');   // (a soft crescent of the fire's light on its lower inner wall: no line)
      const cg = g.createRadialGradient(s * 160, -238, 4, s * 160, -238, 90); cg.addColorStop(0, 'rgba(255,120,240,0.35)'); cg.addColorStop(1, 'rgba(255,120,240,0)'); g.fillStyle = cg; g.fillRect(s * 160 - 110, -330, 220, 100); g.restore();
    });
    g.strokeStyle = rgba(ROCK.hi, 0.5); g.lineWidth = 3; g.beginPath(); g.ellipse(s * 160, -316, 100, 86, s * -0.12, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
  }
  // the nose: an upside-down heart-shaped hollow
  ink(g, (g) => { g.beginPath(); g.moveTo(0, -300); g.bezierCurveTo(12, -280, 38, -258, 34, -232); g.lineTo(18, -226); g.lineTo(0, -240); g.lineTo(-18, -226); g.lineTo(-34, -232); g.bezierCurveTo(-38, -258, -12, -280, 0, -300); g.closePath(); }, '#05020a', 4);
  // the mouth: the doorway's arch (the door itself is live) in a ring of dark rock
  const aw = DOOR_W / 2, at = DOOR_TOP - SK_Y;
  ink(g, (g) => { g.beginPath(); g.moveTo(-aw - 20, 8); g.lineTo(-aw - 20, at + 30); g.quadraticCurveTo(-aw - 20, at - 22, 0, at - 24); g.quadraticCurveTo(aw + 20, at - 22, aw + 20, at + 30); g.lineTo(aw + 20, 8); g.closePath(); }, '#120a1c', 4);
  // (the stone jamb: cut blocks round the opening)
  g.fillStyle = rgba(STONE.hi, 0.5); for (let k = 0; k < 7; k++) { g.save(); const a = Math.PI + (k + 0.5) / 7 * Math.PI, rr = aw + 12; g.translate(Math.cos(a) * rr, at + 30 + Math.sin(a) * (rr * 0.5 + 6)); g.rotate(a + Math.PI / 2); g.fillRect(-9, -5, 18, 10); g.restore(); }
  // the upper teeth: a row of big square fangs hanging over the doorway (the gate's "portcullis"), bone-pale
  const tw = 34, tn = 7, tx0 = -tn * (tw + 4) / 2 + 2;
  for (let i = 0; i < tn; i++) {
    const x = tx0 + i * (tw + 4), len = 52 + (i % 2 ? -6 : 4) + (i === 3 ? 8 : 0), ty = at - 16;
    const chip = i === 1 || i === 4 || i === 6, chipL = i === 4, hk = (k) => hash2(i, 700 + k);   // (three chipped: a corner broken off; every mark its own)
    ink(g, (g) => { g.beginPath(); g.moveTo(x, ty - 30); g.lineTo(x + tw, ty - 30);
      if (chip && !chipL) { g.lineTo(x + tw - 2, ty + len - 26); g.lineTo(x + tw - 10, ty + len - 18); g.lineTo(x + tw - 9, ty + len - 9); } else g.lineTo(x + tw - 3, ty + len - 10);
      g.quadraticCurveTo(x + tw / 2, ty + len + 4, x + 3, ty + len - 10);
      if (chip && chipL) { g.lineTo(x + 8, ty + len - 14); g.lineTo(x + 2, ty + len - 24); }
      g.closePath(); }, '#b4aabc', 3.2, (g) => {
      mottle(g, x, ty - 30, tw, len + 30, 0.5);
      const cy2 = g.createLinearGradient(x, 0, x + tw, 0); cy2.addColorStop(0, 'rgba(255,255,255,0.42)'); cy2.addColorStop(0.3, 'rgba(255,255,255,0.12)'); cy2.addColorStop(0.62, 'rgba(40,20,70,0)'); cy2.addColorStop(1, 'rgba(40,20,70,0.5)'); g.fillStyle = cy2; g.fillRect(x - 2, ty - 30, tw + 4, len + 36);   // (rounded: lit left, turning into shade)
      const gm = g.createLinearGradient(0, ty - 30, 0, ty + 4 + hk(1) * 10); gm.addColorStop(0, 'rgba(70,50,40,0.55)'); gm.addColorStop(1, 'rgba(70,50,40,0)'); g.fillStyle = gm; g.fillRect(x - 2, ty - 30, tw + 4, 44);   // (stained dark at the gum)
      if (i === 0 || i === 3 || i === 5) {   // (a crack on three of them: their own place, angle and length)
        const cx = x + tw * (0.25 + 0.45 * hk(2)), c0 = ty - 6 + hk(3) * 12, cl = len * (0.25 + 0.3 * hk(4)), ca = (hk(5) - 0.5) * 0.6;
        g.strokeStyle = 'rgba(40,24,60,0.75)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(cx, c0); g.lineTo(cx + Math.sin(ca) * cl * 0.5 - 2, c0 + cl * 0.5); g.lineTo(cx + Math.sin(ca) * cl, c0 + cl); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(cx + 1.3, c0 + 1); g.lineTo(cx + Math.sin(ca) * cl * 0.5 - 0.7, c0 + cl * 0.5); g.stroke();
      }
      if (i === 1 || i === 4 || i === 6) { g.fillStyle = `rgba(140,120,70,${(0.12 + 0.1 * hk(6)).toFixed(3)})`; g.beginPath(); g.ellipse(x + tw * (0.3 + 0.4 * hk(7)), ty + len * (0.15 + 0.4 * hk(8)), 4 + hk(9) * 5, 7 + hk(10) * 8, (hk(11) - 0.5) * 0.6, 0, TAU); g.fill(); }   // (old stains on three)
      if (chip) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); if (chipL) { g.moveTo(x + 8, ty + len - 14); g.lineTo(x + 2, ty + len - 24); g.lineTo(x + 10, ty + len - 20); } else { g.moveTo(x + tw - 2, ty + len - 26); g.lineTo(x + tw - 10, ty + len - 18); g.lineTo(x + tw - 13, ty + len - 24); } g.closePath(); g.fill(); }   // (the chip's fresh face, pale)
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(x + 6 + hk(12) * 3, ty + len * (0.1 + 0.6 * hk(13)), 2.4, 5 + hk(14) * 3, 0.1, 0, TAU); g.fill();   // (a glint on its lit edge, at its own height)
    });
  }
  // the lower teeth: short stumps along the chin (the threshold)
  for (let i = 0; i < 9; i++) {
    const x = -aw - 14 + i * ((DOOR_W + 28) / 9), w = (DOOR_W + 28) / 9 - 4;
    const chp = i === 2 || i === 6;
    ink(g, (g) => { g.beginPath(); g.moveTo(x, 8); g.lineTo(x, -14); if (chp) { g.lineTo(x + w * 0.3, -19); g.lineTo(x + w * 0.42, -12); g.lineTo(x + w * 0.58, -20); } g.quadraticCurveTo(x + w * 0.8, -22, x + w, -14); g.lineTo(x + w, 8); g.closePath(); }, BONE.base, 2.6, (g) => {
      const cy2 = g.createLinearGradient(x, 0, x + w, 0); cy2.addColorStop(0, 'rgba(255,255,255,0.36)'); cy2.addColorStop(0.35, 'rgba(255,255,255,0.08)'); cy2.addColorStop(1, 'rgba(40,20,70,0.45)'); g.fillStyle = cy2; g.fillRect(x - 2, -24, w + 4, 34);
      const gm = g.createLinearGradient(0, 8, 0, -8); gm.addColorStop(0, 'rgba(60,44,40,0.5)'); gm.addColorStop(1, 'rgba(60,44,40,0)'); g.fillStyle = gm; g.fillRect(x - 2, -10, w + 4, 20);   // (stained at the gum)
      if (chp) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.moveTo(x + w * 0.3, -19); g.lineTo(x + w * 0.42, -12); g.lineTo(x + w * 0.36, -10); g.closePath(); g.fill(); }
    });
  }
  g.restore();
}

// ---------------------------------------------------------------------------------------------------------------
// THE INTERIOR: the purple corridor and the throne hall
// ---------------------------------------------------------------------------------------------------------------
function drawInterior(g, xa, xb) {
  const Wd = xb - xa + 4;
  g.save(); g.beginPath(); g.rect(xa, -20, xb - xa + 8, 420); g.clip();   // (never over the skull's face)
  vgrad(g, xa - 2, 0, Wd, GT0 + 30, [[0, '#1a1028'], [0.5, '#2a1c3c'], [1, '#1e1430']]);
  // courses of cut blocks: staggered, each its own tone, textured, mortar between
  for (let r = 0; r < 6; r++) {
    const y0 = r * 46 - 8;
    for (let bxN = -400 - (r & 1) * 44, i = 0; bxN < xb + 200; i++) {
      const pw = 64 + 58 * hash2(i + Math.floor(bxN / 7), r + 500), bx = bxN; bxN += pw;
      if (bx + pw < xa - 4) continue;
      const h = hash2(Math.floor(bx / 11), r + 510);
      stoneBlock(g, bx + 1, y0 + 1, bx + pw - 0.5, y0 + 45, mix(mix(STONE.base, h < 0.5 ? STONE.sh : STONE.hi, Math.abs(h - 0.5) * 0.7), h > 0.92 ? '#4a2a5a' : STONE.base, 0.2), Math.floor(bx) * 7 + r);
      g.strokeStyle = rgba(STONE.joint, 0.85); g.lineWidth = 2; g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx, y0 + 46); g.stroke();
    }
    g.strokeStyle = rgba(STONE.joint, 0.85); g.lineWidth = 2; g.beginPath(); g.moveTo(xa - 2, y0 + 46); g.lineTo(xb + 2, y0 + 46); g.stroke();
  }
  // the dado (y 268..338): recessed panels of darker stone under a moulded rail
  { const y0 = 268, y1 = 338;
    g.fillStyle = '#1a1226'; g.fillRect(xa - 2, y0, Wd, y1 - y0);
    for (let x = al(xa - 120, 120); x < xb + 120; x += 120) {
      const i = Math.round(x / 120);
      ink(g, (g) => { g.beginPath(); g.rect(x + 10, y0 + 12, 100, y1 - y0 - 20); }, mix('#221830', '#2a1e3a', hash2(i, 520)), 1.8, (g) => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 10, y0 + 12, 100, 5); g.fillRect(x + 10, y0 + 12, 4, y1 - y0); g.fillStyle = rgba(STONE.hi, 0.2); g.fillRect(x + 10, y1 - 12, 100, 3); g.fillRect(x + 106, y0 + 12, 4, y1 - y0); });
    }
    ink(g, (g) => { g.beginPath(); g.rect(xa - 2, y0 - 8, Wd, 12); }, STONE.base, 2, (g) => { g.fillStyle = rgba(STONE.hi, 0.5); g.fillRect(xa - 2, y0 - 8, Wd, 3); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(xa - 2, y0 + 1, Wd, 3); });
  }
  mottle(g, xa - 2, -8, Wd, 346, 0.5);   // (the paint: the stone's values moving under the brush)
  aoBand(g, xa - 2, xb + 2, 272, 16, 1, 0.4);   // (under the dado's rail)
  // the torchlight on the stone round each pillar's torch
  for (const p of LAY.pillars) if (p.x + 200 > xa && p.x - 200 < xb && p.x !== 2800 && p.x !== 4260) { lightPool(g, p.x, 226, 190, 150, '255,70,220', 0.16); lightPool(g, p.x, 226, 70, 60, '255,140,240', 0.14); }
  // the bays between the pillars
  const P = LAY.pillars;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (b.x + b.w < xa - 40 || a.x - a.w > xb + 40) continue;
    const hall = a.sec === 2 && b.sec === 2;
    const xL = a.x + a.w / 2 + 12, xR = b.x - b.w / 2 - 12, ow = xR - xL, cx = (xL + xR) / 2;
    const yBot = 338, hgt = hall ? 260 : 196, yTop = yBot - hgt, kind = a.sec !== b.sec ? 'threshold' : hall ? (i % 2 ? 'torn' : 'window') : BAYS[i % BAYS.length];
    if ((kind === 'window' || kind === 'broken') && ow > 120) {   // a window: an arched hole through the wall (the storm shows through)
      const hw = ow * (kind === 'broken' ? 0.2 : 0.26);
      cutOut(g, () => { g.beginPath(); g.moveTo(cx - hw, yBot - 40); g.lineTo(cx - hw, yTop + hw); g.arc(cx, yTop + hw, hw, Math.PI, 0); g.lineTo(cx + hw, yBot - 40); g.closePath(); });
      g.strokeStyle = LINE; g.lineWidth = 9 * LK + 2; g.beginPath(); g.moveTo(cx - hw, yBot - 40); g.lineTo(cx - hw, yTop + hw); g.arc(cx, yTop + hw, hw, Math.PI, 0); g.lineTo(cx + hw, yBot - 40); g.stroke();
      g.strokeStyle = STONE.hi; g.lineWidth = 6; g.stroke();
      for (let k = 0; k < 9; k++) { const an = Math.PI + (k + 0.5) / 9 * Math.PI; g.strokeStyle = 'rgba(6,2,12,0.7)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx + Math.cos(an) * (hw - 3), yTop + hw + Math.sin(an) * (hw - 3)); g.lineTo(cx + Math.cos(an) * (hw + 3), yTop + hw + Math.sin(an) * (hw + 3)); g.stroke(); }   // (the arch's voussoirs)
      ink(g, (g) => roundRect(g, cx - hw - 6, yBot - 44, hw * 2 + 12, 12, 3), STONE.base, 2.4);
      if (kind === 'window') { g.strokeStyle = LINE; g.lineWidth = 5 * LK + 1; g.beginPath(); g.moveTo(cx, yBot - 40); g.lineTo(cx, yTop + 2); g.stroke(); g.strokeStyle = STONE.sh; g.lineWidth = 3; g.stroke(); }
      else {   // (a broken lancet: shards of old glass left in the frame, a cobweb across its top corner)
        for (const [sx2, sy2, w2, l2] of [[-1, 0.42, 16, 40], [1, 0.62, 12, 30], [-1, 0.66, 9, 18]]) { const fx = cx + sx2 * (hw - 2), fy = yTop + hgt * sy2, d2 = -sx2; const sp = [fx + sx2 * 3, fy, fx + d2 * w2 * 0.7, fy + 4, fx + d2 * w2, fy + l2 * 0.45, fx + d2 * w2 * 0.45, fy + l2 * 0.55, fx + d2 * w2 * 0.6, fy + l2, fx + d2 * 2, fy + l2 * 0.7, fx + sx2 * 3, fy + l2 * 0.75]; g.fillStyle = 'rgba(120,90,165,0.6)'; poly(g, sp); g.fill(); g.strokeStyle = '#0e0a14'; g.lineWidth = 1.2; g.stroke(); g.strokeStyle = 'rgba(230,210,255,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(fx + d2 * 3, fy + 5); g.lineTo(fx + d2 * w2 * 0.8, fy + l2 * 0.4); g.stroke(); }   // (shards of old glass hanging in the lead)
        g.strokeStyle = 'rgba(220,210,240,0.35)'; g.lineWidth = 0.8; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(cx + hw - 2, yTop + hw - 6 + k * 8); g.quadraticCurveTo(cx + hw - 14 + k * 2, yTop + hw - 10 + k * 6, cx + hw - 22 + k * 5, yTop + hw - 26 + k * 4); g.stroke(); }
      }
    } else if (kind === 'tapestry' || kind === 'map') tapestry(g, cx, 66, Math.min(150, ow * 0.62), 188, kind === 'map' ? 'map' : 'sun');
    else if (kind === 'statue') statueNiche(g, cx, yBot - 4);
    else if (kind === 'threshold') {   // (the great arch into the throne hall: a pointed moulding with a mask keystone, the dark of the hall beyond)
      const hw = ow * 0.42, top = 40;
      g.save(); g.beginPath(); g.moveTo(cx - hw, yBot); g.lineTo(cx - hw, top + 120); g.quadraticCurveTo(cx - hw, top, cx, top - 10); g.quadraticCurveTo(cx + hw, top, cx + hw, top + 120); g.lineTo(cx + hw, yBot); g.closePath(); g.clip();
      vgrad(g, cx - hw, top - 10, hw * 2, yBot, [[0, '#0a0614'], [1, '#22102e']]); lightPool(g, cx, yBot - 60, hw, 80, '200,80,255', 0.3); g.restore();
      g.strokeStyle = LINE; g.lineWidth = 16; g.beginPath(); g.moveTo(cx - hw, yBot); g.lineTo(cx - hw, top + 120); g.quadraticCurveTo(cx - hw, top, cx, top - 10); g.quadraticCurveTo(cx + hw, top, cx + hw, top + 120); g.lineTo(cx + hw, yBot); g.stroke();
      g.strokeStyle = STONE.hi; g.lineWidth = 11; g.stroke(); g.strokeStyle = 'rgba(6,2,12,0.5)'; g.lineWidth = 2; g.setLineDash([16, 14]); g.stroke(); g.setLineDash([]);
      { const ky = top + 6; ink(g, (g) => { g.beginPath(); g.moveTo(cx - 15, ky - 16); g.lineTo(cx + 15, ky - 16); g.lineTo(cx + 11, ky + 18); g.lineTo(cx - 11, ky + 18); g.closePath(); }, STONE.base, 2.4, (g) => { g.fillStyle = rgba(STONE.hi, 0.3); g.fillRect(cx - 15, ky - 16, 30, 3); });   // (the keystone: the old palace's sun, carved)
        g.strokeStyle = '#8a7a6a'; g.lineWidth = 1.6; for (let k = 0; k < 8; k++) { const an = k * TAU / 8; g.beginPath(); g.moveTo(cx + Math.cos(an) * 6, ky + 1 + Math.sin(an) * 6); g.lineTo(cx + Math.cos(an) * 10, ky + 1 + Math.sin(an) * 10); g.stroke(); }
        g.fillStyle = '#8a7a6a'; g.beginPath(); g.arc(cx, ky + 1, 5, 0, TAU); g.fill(); }
    } else if (kind === 'torn') {   // (a great banner of Malachar's mask, torn and hanging askew)
      g.save(); g.translate(cx, 106); g.rotate(-0.03); g.scale(0.86, 0.86);
      g.strokeStyle = LINE; g.lineWidth = 8; g.beginPath(); g.moveTo(-70, 0); g.lineTo(70, 0); g.stroke(); g.strokeStyle = GOLD.base; g.lineWidth = 4.4; g.stroke();
      ink(g, (g) => { g.beginPath(); g.moveTo(-60, 3); g.lineTo(60, 3); g.lineTo(58, 200); g.lineTo(34, 182); g.lineTo(22, 236); g.lineTo(0, 210); g.lineTo(-14, 252); g.lineTo(-30, 200); g.lineTo(-58, 230); g.closePath(); }, '#3a1250', 3, (g) => { mottle(g, -60, 0, 120, 260, 0.45, 0.7); { const sg = g.createLinearGradient(-60, 0, 60, 0); sg.addColorStop(0, 'rgba(255,255,255,0.08)'); sg.addColorStop(0.4, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = sg; g.fillRect(-60, 0, 120, 260); } g.fillStyle = rgba(MAG, 0.5); g.fillRect(-60, 12, 120, 4); g.fillStyle = '#1a0a24'; poly(g, [10, 90, 26, 120, 14, 150, 4, 118]); g.fill(); });
      splitMask(g, -6, 70, 34, 0.3);
      g.restore();
    }
    else if (kind === 'stained') stainedWindow(g, cx, yBot, ow);
    else if (kind === 'banner') {
      banner(g, cx, 70, 64, 172, i * 1.7);
      ink(g, (g) => { g.beginPath(); g.rect(cx - 50, 252, 100, 8); }, '#3a2a1a', 2);   // (a shelf of candle stubs under it)
      for (const dx of [-36, -14, 10, 32]) { const hh = 8 + hash2(i * 4 + dx, 531) * 12; ink(g, (g) => { g.beginPath(); g.rect(cx + dx - 3, 252 - hh, 6, hh); }, '#e6d8c0', 1.4); g.fillStyle = '#c63ad8'; g.beginPath(); g.ellipse(cx + dx, 249 - hh, 2.4, 4, 0, 0, TAU); g.fill(); }
      lightPool(g, cx, 240, 70, 30, '255,90,220', 0.25);
    }
    vgrad(g, xL, 300, ow, 346, [[0, 'rgba(8,4,14,0)'], [1, 'rgba(8,4,14,0.3)']]);
  }
  // the pillars: fluted shafts, two kinds of capital, one with a chunk broken out; a carved plate (the mask, or the old sun defaced); the torch bracket
  P.forEach((p, pi) => {
    if (p.x + p.w < xa - 10 || p.x - p.w > xb + 10) return;
    const x0 = p.x - p.w / 2;
    { const lg = g.createLinearGradient(x0 - 30, 0, x0, 0); lg.addColorStop(0, 'rgba(6,2,12,0)'); lg.addColorStop(1, 'rgba(6,2,12,0.35)'); g.fillStyle = lg; g.fillRect(x0 - 30, 0, 30, 338); const rg = g.createLinearGradient(x0 + p.w, 0, x0 + p.w + 30, 0); rg.addColorStop(0, 'rgba(6,2,12,0.4)'); rg.addColorStop(1, 'rgba(6,2,12,0)'); g.fillStyle = rg; g.fillRect(x0 + p.w, 0, 30, 338); }   // (occlusion on the wall either side)
    stoneBlock(g, x0, -4, x0 + p.w, 388, mix(STONE.base, STONE.sh, 0.2), pi * 97 + 5, 0.1);
    mottle(g, x0, -4, p.w, 392, 0.45);
    g.fillStyle = rgba(STONE.hi, 0.3); g.fillRect(x0, -4, 7, 392); g.fillStyle = 'rgba(0,0,0,0.34)'; g.fillRect(x0 + p.w - 10, -4, 10, 392);
    const sv = (pi * 5 + 1) % 3;   // (QA: no pillar the same as its neighbours -- fluted, iron-banded, twisted)
    if (sv === 0) {
      g.strokeStyle = 'rgba(6,2,12,0.45)'; g.lineWidth = 1.4; for (let k = 1; k < 5; k++) { const fx = x0 + (p.w * k) / 5; g.beginPath(); g.moveTo(fx, 112); g.lineTo(fx, 336); g.stroke(); }   // (fluting)
      g.strokeStyle = rgba(STONE.hi, 0.25); g.lineWidth = 1; for (let k = 1; k < 5; k++) { const fx = x0 + (p.w * k) / 5 + 2; g.beginPath(); g.moveTo(fx, 112); g.lineTo(fx, 336); g.stroke(); }
    } else if (sv === 1) {   // (iron bands round a plain shaft, riveted)
      for (const by of [128, 296]) { ink(g, (g) => { g.beginPath(); g.rect(x0 - 2, by, p.w + 4, 10); }, '#2a2430', 1.8, (g) => { g.fillStyle = 'rgba(200,190,230,0.22)'; g.fillRect(x0 - 2, by, p.w + 4, 2.4); }); g.fillStyle = '#5a5262'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x0 + 5 + k * (p.w - 10) / 3, by + 5, 1.6, 0, TAU); g.fill(); } }
      g.strokeStyle = 'rgba(6,2,12,0.3)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0 + p.w * 0.3, 140); g.lineTo(x0 + p.w * 0.36, 212); g.lineTo(x0 + p.w * 0.28, 280); g.stroke();   // (a hairline crack)
    } else {   // (a twisted shaft: spiral grooves, each lit on its upper lip)
      g.save(); g.beginPath(); g.rect(x0, 112, p.w, 224); g.clip();
      for (let yy = 92; yy < 360; yy += 22) { g.strokeStyle = 'rgba(6,2,12,0.5)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x0 - 4, yy + 16); g.quadraticCurveTo(x0 + p.w * 0.5, yy + 2, x0 + p.w + 4, yy - 10); g.stroke(); g.strokeStyle = rgba(STONE.hi, 0.3); g.lineWidth = 1; g.beginPath(); g.moveTo(x0 - 4, yy + 13); g.quadraticCurveTo(x0 + p.w * 0.5, yy - 1, x0 + p.w + 4, yy - 13); g.stroke(); }
      g.restore();
    }
    const lg = g.createLinearGradient(p.x - p.w, 0, p.x + p.w, 0); lg.addColorStop(0, 'rgba(255,80,220,0.16)'); lg.addColorStop(0.5, 'rgba(255,80,220,0)'); lg.addColorStop(1, 'rgba(255,80,220,0.12)'); g.fillStyle = lg; g.fillRect(x0, 150, p.w, 160);   // (its own torch's light on its faces)
    g.strokeStyle = LINE; g.lineWidth = 3 * LK + 1.2; g.strokeRect(x0, -4, p.w, 392);
    if (pi === 3) { const ch = [x0 + p.w, 180, x0 + p.w - 14, 196, x0 + p.w - 8, 222, x0 + p.w, 230]; g.fillStyle = mix(STONE.base, STONE.hi, 0.4); poly(g, ch); g.fill(); g.fillStyle = 'rgba(6,2,12,0.55)'; poly(g, [x0 + p.w, 180, x0 + p.w - 14, 196, x0 + p.w - 9, 200, x0 + p.w, 187]); g.fill(); g.strokeStyle = LINE; g.lineWidth = 2; poly(g, ch); g.stroke(); g.strokeStyle = rgba(STONE.hi, 0.6); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0 + p.w - 12, 200); g.lineTo(x0 + p.w - 7, 221); g.stroke(); }   // (a chunk broken out: the paler stone inside)
    ink(g, (g) => roundRect(g, x0 - 7, 336, p.w + 14, 32, 4), STONE.base, 2.4, (g) => { g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x0 - 7, 336, 14, 32); });
    if (pi % 2) { ink(g, (g) => roundRect(g, x0 - 6, 92, p.w + 12, 20, 4), STONE.base, 2.2); }
    else { ink(g, (g) => poly(g, [x0 - 10, 92, x0 + p.w + 10, 92, x0 + p.w + 2, 112, x0 - 2, 112]), STONE.base, 2.2, (g) => { g.strokeStyle = 'rgba(6,2,12,0.5)'; g.lineWidth = 1.2; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x0 + p.w * (k + 0.5) / 4, 100, 4, 0, Math.PI); g.stroke(); } }); }
    const s2 = Math.min(26, p.w * 0.46);
    if ((pi % 3 === 2 && p.sec === 1) || p.x === 4260 || p.x === 3920) {   // (an empty plate, scorched where a mask was torn off)
      ink(g, (g) => roundRect(g, p.x - s2 * 0.95, 150 - s2 * 1.15, s2 * 1.9, s2 * 2.3, 6), STONE.base, 2.4, (g) => { lightPool(g, p.x, 150, s2, s2 * 1.2, '10,6,14', 0.7); });
      for (const dy of [-20, 20]) { g.fillStyle = '#4a4050'; g.beginPath(); g.arc(p.x, 150 + dy, 2.4, 0, TAU); g.fill(); }
    } else if (p.x === 3640) {   // (a bare plate: the mask prised off it, four bolt holes, the paler stone where it hung)
      ink(g, (g) => roundRect(g, p.x - s2 * 0.95, 150 - s2 * 1.15, s2 * 1.9, s2 * 2.3, 6), STONE.base, 2.4, (g) => { g.fillStyle = 'rgba(200,180,230,0.12)'; g.beginPath(); g.ellipse(p.x, 150, s2 * 0.62, s2 * 0.8, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(6,2,12,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p.x + s2 * 0.3, 150 + s2 * 0.5); g.lineTo(p.x + s2 * 0.7, 150 + s2 * 0.9); g.stroke(); });
      for (const [dx, dy] of [[-0.55, -0.75], [0.55, -0.75], [-0.55, 0.75], [0.55, 0.75]]) { g.fillStyle = '#16101e'; g.beginPath(); g.arc(p.x + dx * s2, 150 + dy * s2, 2.2, 0, TAU); g.fill(); }
    } else if ((pi % 3 === 1 && p.sec === 1) || p.x === 4600) {   // (the old palace's sun, carved, a crack struck through it)
      ink(g, (g) => roundRect(g, p.x - s2 * 0.95, 150 - s2 * 1.15, s2 * 1.9, s2 * 2.3, 6), STONE.base, 2.4);
      g.strokeStyle = '#8a7a6a'; g.lineWidth = 2; for (let k = 0; k < 10; k++) { const an = k * TAU / 10; g.beginPath(); g.moveTo(p.x + Math.cos(an) * 9, 156 + Math.sin(an) * 9); g.lineTo(p.x + Math.cos(an) * 16, 156 + Math.sin(an) * 16); g.stroke(); }
      g.fillStyle = '#8a7a6a'; g.beginPath(); g.arc(p.x, 156, 8, 0, TAU); g.fill();
      g.strokeStyle = '#0e0818'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(p.x - 16, 138); g.lineTo(p.x - 2, 154); g.lineTo(p.x + 4, 150); g.lineTo(p.x + 16, 176); g.stroke();
    } else maskPlate(g, p.x, 148, s2);
    const bv = [1, 3, 2, 0, 1, 3, 2, 1, 0, 2][pi] ?? pi % 4;   // (QA: four torch brackets, never two cups in a screen; the cold sconces (2800, 4260) keep the cup)
    if (bv === 0) ink(g, (g) => { g.beginPath(); g.moveTo(p.x - 3, 266); g.lineTo(p.x - 3, 242); g.lineTo(p.x - 15, 230); g.lineTo(p.x + 15, 230); g.lineTo(p.x + 3, 242); g.lineTo(p.x + 3, 266); g.closePath(); }, '#3a3040', 2.4);
    else if (bv === 1) {   // (a serpent arm curling up to the cup, its head under it)
      g.strokeStyle = LINE; g.lineWidth = 9; g.beginPath(); g.moveTo(p.x + 2, 272); g.bezierCurveTo(p.x + 26, 262, p.x - 22, 250, p.x, 236); g.stroke(); g.strokeStyle = '#3a3040'; g.lineWidth = 5; g.stroke(); g.strokeStyle = 'rgba(200,180,230,0.3)'; g.lineWidth = 1.4; g.stroke();
      ink(g, (g) => { g.beginPath(); g.moveTo(p.x - 13, 229); g.lineTo(p.x + 13, 229); g.quadraticCurveTo(p.x + 10, 240, p.x, 240); g.quadraticCurveTo(p.x - 10, 240, p.x - 13, 229); g.closePath(); }, '#3a3040', 2.2);
      ink(g, (g) => { g.beginPath(); g.ellipse(p.x + 6, 244, 7, 4.4, 0.3, 0, TAU); }, '#3a3040', 1.8); g.fillStyle = 'rgba(255,90,220,0.8)'; g.beginPath(); g.arc(p.x + 9, 243, 1.4, 0, TAU); g.fill();   // (its head, an ember eye)
    } else if (bv === 2) {   // (a caged lantern hung on a chain from an iron hook)
      g.strokeStyle = LINE; g.lineWidth = 4; g.beginPath(); g.moveTo(p.x, 150); g.lineTo(p.x, 184); g.stroke(); g.strokeStyle = '#5a5262'; g.lineWidth = 2; g.setLineDash([3, 2]); g.stroke(); g.setLineDash([]);
      ink(g, (g) => { g.beginPath(); g.moveTo(p.x - 12, 192); g.lineTo(p.x, 182); g.lineTo(p.x + 12, 192); g.closePath(); }, '#3a3040', 2);
      ink(g, (g) => { g.beginPath(); g.ellipse(p.x, 236, 14, 4, 0, 0, TAU); }, '#3a3040', 2);
      g.strokeStyle = LINE; g.lineWidth = 3; for (const dx of [-12, -4, 4, 12]) { g.beginPath(); g.moveTo(p.x + dx, 192); g.lineTo(p.x + dx * 1.05, 235); g.stroke(); }
      g.strokeStyle = '#4a4252'; g.lineWidth = 1.4; for (const dx of [-12, -4, 4, 12]) { g.beginPath(); g.moveTo(p.x + dx, 192); g.lineTo(p.x + dx * 1.05, 235); g.stroke(); }
    } else {   // (a torch set in an iron ring on a bolt: a wrapped head, the stave below)
      g.strokeStyle = LINE; g.lineWidth = 8; g.beginPath(); g.moveTo(p.x + 4, 286); g.lineTo(p.x, 232); g.stroke(); g.strokeStyle = '#6a4426'; g.lineWidth = 4.4; g.stroke();
      ink(g, (g) => { g.beginPath(); g.rect(p.x - 6, 226, 12, 12); }, '#4a3a2a', 1.8, (g) => { g.strokeStyle = 'rgba(20,10,6,0.6)'; g.lineWidth = 1; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(p.x - 6, 229 + k * 3.4); g.lineTo(p.x + 6, 231 + k * 3.4); g.stroke(); } });
      ink(g, (g) => { g.beginPath(); g.ellipse(p.x + 1, 254, 9, 4, 0, 0, TAU); }, null, 3.4); g.strokeStyle = '#5a5262'; g.lineWidth = 2; g.beginPath(); g.ellipse(p.x + 1, 254, 9, 4, 0, 0, TAU); g.stroke();
      g.fillStyle = '#2a2430'; g.beginPath(); g.arc(p.x + 1, 258, 3, 0, TAU); g.fill();
    }
    { const pv = pi % 5;   // (a few things of their own)
      if (pv === 1) { for (const [d, sag] of [[1, 22], [-1, 16]]) { g.strokeStyle = LINE; g.lineWidth = 4.6; g.beginPath(); g.moveTo(p.x + d * p.w * 0.45, 118); g.quadraticCurveTo(p.x + d * p.w * 0.1, 118 + sag * 2, p.x - d * p.w * 0.35, 120 + sag * 0.3); g.stroke(); g.strokeStyle = '#5a5262'; g.lineWidth = 2.2; g.setLineDash([3, 2]); g.stroke(); g.setLineDash([]); }   // (chains draped across it)
      }
      else if (pv === 2 && p.x !== 2800 && p.x !== 4260) cobweb(g, p.x - p.w / 2 + 2, 114, 1, 1, 26, pi + 40);
      else if (pv === 4) {   // (a little violet pennant on a spike)
        const px0 = p.x - p.w / 2 - 6; g.strokeStyle = LINE; g.lineWidth = 4; g.beginPath(); g.moveTo(p.x - p.w / 2, 252); g.lineTo(px0 - 30, 252); g.stroke(); g.strokeStyle = GOLD.base; g.lineWidth = 2; g.stroke();   // (a gilt rod)
        ink(g, (g) => { g.beginPath(); g.moveTo(px0, 254); g.lineTo(px0, 306); g.lineTo(px0 - 13, 296); g.lineTo(px0 - 26, 306); g.lineTo(px0 - 26, 254); g.closePath(); }, '#5a1e7a', 2.2, (g) => { g.fillStyle = 'rgba(255,170,240,0.22)'; g.fillRect(px0 - 26, 254, 8, 52); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px0 - 8, 254, 8, 52); g.fillStyle = GOLD.base; g.fillRect(px0 - 26, 258, 26, 3); g.fillRect(px0 - 26, 290, 26, 2); g.strokeStyle = 'rgba(255,214,120,0.75)'; g.lineWidth = 1.4; g.beginPath(); g.arc(px0 - 13, 274, 6, 0, TAU); g.stroke(); });   // (a violet pennant: a lit fold, gilt trim, a sun roundel)
      } }
    if (p.x === 2800 || p.x === 4260) { g.fillStyle = '#1a141e'; g.beginPath(); g.ellipse(p.x, 229, 12, 3, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(30,24,36,0.5)'; g.beginPath(); g.ellipse(p.x, 212, 10, 18, 0, 0, TAU); g.fill(); cobweb(g, p.x + p.w / 2 - 2, 120, -1, 1, 26, pi); }   // (a cold sconce, soot above it, a cobweb)
    if (p.x === 3920) { g.strokeStyle = 'rgba(6,2,12,0.75)'; g.lineWidth = 2.4; polyline(g, [p.x - 12, 40, p.x - 4, 90, p.x - 14, 140, p.x - 6, 200]); g.stroke(); g.strokeStyle = rgba(STONE.hi, 0.4); g.lineWidth = 1; polyline(g, [p.x - 10, 40, p.x - 2, 90, p.x - 12, 140, p.x - 4, 200]); g.stroke(); }   // (a cracked shaft)
  });
  vgrad(g, xa - 2, 0, Wd, 110, [[0, 'rgba(4,2,10,0.88)'], [1, 'rgba(4,2,10,0)']]);
  if (xb > CORR_X) { const vx = Math.max(xa - 2, CORR_X - 40); vgrad(g, vx, 0, xb + 2 - vx, 230, [[0, 'rgba(4,2,10,0.3)'], [1, 'rgba(4,2,10,0)']]); }
  vgrad(g, xa - 2, 300, Wd, 366, [[0, 'rgba(4,2,10,0)'], [1, 'rgba(4,2,10,0.5)']]);
  if (xb > CORR_X - 40) { const x0d = Math.max(xa - 2, CORR_X - 40); g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(8,4,18,0.32)'; g.fillRect(x0d, -10, xb + 2 - x0d, 384); g.restore(); }   // (the far wall pushed darker: the play lane in front of it pops)
  g.restore();
}
// the corridor's ribs and the hall's rafters (cut clear of nothing; drawn after the wall so they cross the windows)
function drawRafters(g, xa, xb) {
  // vault ribs in the corridor: a pointed arch rising from each pillar pair
  for (let x = 2000; x < HALL_X - 200; x += 280) {
    if (x + 300 < xa || x - 20 > xb) continue;
    g.strokeStyle = LINE; g.lineWidth = 12 * LK + 2; g.beginPath(); g.moveTo(x, 96); g.quadraticCurveTo(x + 140, -52, x + 280, 96); g.stroke();
    g.strokeStyle = STONE.base; g.lineWidth = 8; g.stroke(); g.strokeStyle = rgba(STONE.hi, 0.5); g.lineWidth = 2; g.beginPath(); g.moveTo(x + 4, 92); g.quadraticCurveTo(x + 144, -58, x + 276, 90); g.stroke();
    ink(g, (g) => poly(g, [x + 128, 14, x + 152, 14, x + 148, 34, x + 132, 34]), STONE.base, 2.2, (g) => { g.fillStyle = rgba(STONE.hi, 0.3); g.fillRect(x + 128, 14, 24, 3); });   // (the keystone)
  }
  // the hall: dark timber beams across, with iron bands and braces, from the first pillar to carved corbels before the rose window
  const BX0 = 3960, BX1 = 4990;
  const corbel = (cx, y) => {   // (a stone corbel carved in three steps under a beam's end, seated on the wall)
    g.fillStyle = 'rgba(4,2,10,0.45)'; g.fillRect(cx - 18, y, 36, 6);
    for (const [hw, y0, hh] of [[17, y, 7], [13, y + 7, 7], [9, y + 14, 8]]) ink(g, (g) => { g.beginPath(); if (hh === 8) { g.moveTo(cx - hw, y0); g.lineTo(cx + hw, y0); g.quadraticCurveTo(cx + hw, y0 + hh, cx, y0 + hh + 2); g.quadraticCurveTo(cx - hw, y0 + hh, cx - hw, y0); } else g.rect(cx - hw, y0, hw * 2, hh); }, STONE.base, 2, (g) => { g.fillStyle = rgba(STONE.hi, 0.35); g.fillRect(cx - hw, y0, hw * 2, 2); g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(cx + hw * 0.3, y0, hw, hh + 2); });
  };
  for (const [y, h] of [[20, 20], [62, 14]]) {
    const x0 = Math.max(xa, BX0), x1 = Math.min(xb, BX1); if (x1 <= x0) continue;
    ink(g, (g) => { g.beginPath(); g.rect(x0, y, x1 - x0, h); }, '#2a1a22', 3.4, (g) => {
      g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x0, y, x1 - x0, 4); g.fillStyle = 'rgba(0,0,0,0.34)'; g.fillRect(x0, y + h - 5, x1 - x0, 5);
      mottle(g, x0, y, x1 - x0, h, 0.4, 0.6);
      for (let bx = al(x0, 150); bx < x1; bx += 150) { if (bx < BX0 + 20 || bx > BX1 - 20) continue; g.fillStyle = '#4a4050'; g.fillRect(bx, y - 1, 9, h + 2); g.fillStyle = '#7a6a80'; g.fillRect(bx + 2, y + 3, 2.4, 2.4); g.fillRect(bx + 2, y + h - 6, 2.4, 2.4); }
    });
    if (x0 < x1) { g.fillStyle = 'rgba(4,2,10,0.3)'; g.fillRect(x0, y + h, x1 - x0, 4); }   // (its shadow on the wall)
    for (const ex of [BX0, BX1]) if (ex > xa - 30 && ex < xb + 30) { g.fillStyle = '#1a1018'; g.fillRect(ex - (ex === BX1 ? 8 : 0), y + 2, 8, h - 4); corbel(ex + (ex === BX0 ? 14 : -14), y + h); }   // (the end grain, the corbel under it)
  }
  for (let bx = al(Math.max(xa, HALL_X), 340); bx < xb; bx += 340) {   // the braces: a rake from the upper beam down to the lower
    if (bx < BX0 + 20 || bx + 70 > BX1 - 20) continue;
    g.strokeStyle = LINE; g.lineWidth = 9 * LK + 1.6; g.beginPath(); g.moveTo(bx, 36); g.lineTo(bx + 70, 62); g.stroke(); g.strokeStyle = '#2a1a22'; g.lineWidth = 6; g.stroke();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// THE THRONE: dais, the black throne, the mirror
// ---------------------------------------------------------------------------------------------------------------
function drawThroneBack(g) {
  // the great rose window behind the throne: storm-lit glass in leaded panes, eight petals of stone tracery, the mask at its heart
  const rx = THRONE_X, ry = 176, R0 = 128;
  g.save(); g.beginPath(); g.arc(rx, ry, R0, 0, TAU); g.clip();
  const wg = g.createRadialGradient(rx, ry, 10, rx, ry, R0); wg.addColorStop(0, '#1a0e2a'); wg.addColorStop(0.38, '#2e1a4a'); wg.addColorStop(0.72, '#7a5ab0'); wg.addColorStop(1, '#2a1448'); g.fillStyle = wg; g.fillRect(rx - R0, ry - R0, R0 * 2, R0 * 2);
  for (let q = 0; q < 24; q++) { const a0 = q * TAU / 24, a1 = a0 + TAU / 24; g.fillStyle = ['rgba(120,60,180,0.5)', 'rgba(60,40,140,0.45)', 'rgba(170,70,170,0.4)'][q % 3]; g.beginPath(); g.moveTo(rx, ry); g.arc(rx, ry, R0, a0, a1); g.closePath(); g.fill(); }
  mottle(g, rx - R0, ry - R0, R0 * 2, R0 * 2, 0.5, 0.7);
  g.strokeStyle = 'rgba(14,6,22,0.8)'; g.lineWidth = 1.6; for (const rr of [56, 92]) { g.beginPath(); g.arc(rx, ry, rr, 0, TAU); g.stroke(); } for (let q = 0; q < 24; q++) { const a = q * TAU / 24; g.beginPath(); g.moveTo(rx + Math.cos(a) * 40, ry + Math.sin(a) * 40); g.lineTo(rx + Math.cos(a) * R0, ry + Math.sin(a) * R0); g.stroke(); }
  g.restore();
  for (let q = 0; q < 8; q++) {   // (the tracery: eight stone petals)
    const a = q * TAU / 8, px = rx + Math.cos(a) * 78, py = ry + Math.sin(a) * 78;
    g.strokeStyle = LINE; g.lineWidth = 9 * LK + 2; g.beginPath(); g.ellipse(px, py, 42, 24, a, 0, TAU); g.stroke(); g.strokeStyle = STONE.hi; g.lineWidth = 5; g.stroke();
  }
  g.strokeStyle = LINE; g.lineWidth = 12 * LK + 2; g.beginPath(); g.arc(rx, ry, R0 + 2, 0, TAU); g.stroke(); g.strokeStyle = STONE.hi; g.lineWidth = 8; g.stroke();
  g.beginPath(); g.arc(rx, ry, 40, 0, TAU); g.strokeStyle = LINE; g.lineWidth = 7 * LK + 1; g.stroke(); g.strokeStyle = STONE.hi; g.lineWidth = 4; g.stroke();
  { const bg2 = g.createRadialGradient(rx, ry, 0, rx, ry, 38); bg2.addColorStop(0, '#120a1c'); bg2.addColorStop(1, '#22163a'); g.fillStyle = bg2; g.beginPath(); g.arc(rx, ry, 37, 0, TAU); g.fill();   // (its heart: a dark stone boss, a carved eclipse)
    g.strokeStyle = 'rgba(150,120,190,0.35)'; g.lineWidth = 1.4; g.beginPath(); g.arc(rx, ry, 16, 0, TAU); g.stroke(); for (let k = 0; k < 12; k++) { const an = k * TAU / 12; g.beginPath(); g.moveTo(rx + Math.cos(an) * 20, ry + Math.sin(an) * 20); g.lineTo(rx + Math.cos(an) * 30, ry + Math.sin(an) * 30); g.stroke(); } }
  // the dais: three wide steps in front of the throne's wall
  for (let k = 0; k < 3; k++) {
    const y = 296 + k * 17, x0 = THRONE_X - 250 + k * 22, x1 = THRONE_X + 262 - k * 6;
    ink(g, (g) => { g.beginPath(); g.rect(x0, y, x1 - x0, 17); }, mix('#2e2440', '#1c1428', k / 2), 2.8, (g) => {
      for (let bx = x0; bx < x1; bx += 70 + (k * 13) % 30) stoneBlock(g, bx, y, Math.min(x1, bx + 70), y + 17, mix('#2e2440', '#1c1428', k / 2), Math.round(bx) + k, 0.25);
      aoBand(g, x0, x1, y, 6, 1, 0.45); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0, y, x1 - x0, 4); g.fillStyle = rgba(MAG, 0.1); g.fillRect(x0, y + 4, x1 - x0, 2); });
  }
  // the throne: near-black and gothic -- a tall back of three carved spires with finials, a panelled back, arms ending in scrolls -- the
  // window's violet light rimming its left edges
  g.save(); g.translate(THRONE_X, 296);
  const back = [-62, 0, -62, -150, -74, -170, -66, -212, -54, -186, -40, -236, -28, -200, 0, -290, 28, -200, 40, -236, 54, -186, 66, -212, 74, -170, 62, -150, 62, 0];
  ink(g, (g) => poly(g, back), '#141018', 4, (g) => {
    mottle(g, -80, -300, 160, 300, 0.5);
    g.strokeStyle = 'rgba(70,60,80,0.6)'; g.lineWidth = 2; for (const px of [-40, 40]) { g.beginPath(); g.moveTo(px, -20); g.lineTo(px, -140); g.quadraticCurveTo(px, -160, px * 0.6, -166); g.stroke(); }   // (carved panels)
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(10, -300, 70, 300);
  });
  g.strokeStyle = 'rgba(190,140,255,0.6)'; g.lineWidth = 2.4; polyline(g, back.slice(0, 16)); g.stroke();   // (the window's light on its left edges)
  for (const [fx, fy] of [[-66, -212], [-40, -236], [0, -290], [40, -236], [66, -212]]) ink(g, (g) => { g.beginPath(); g.moveTo(fx - 5, fy + 8); g.lineTo(fx, fy - 10); g.lineTo(fx + 5, fy + 8); g.closePath(); }, '#2a2232', 1.8);   // (finials)
  { g.save(); g.translate(0, -150);   // (carved into the throne's back: the old palace's sun, defaced -- dark stone, a crack struck through; no face behind Malachar's)
    g.strokeStyle = 'rgba(110,90,140,0.28)'; g.lineWidth = 2; for (let k = 0; k < 12; k++) { const an = k * TAU / 12; g.beginPath(); g.moveTo(Math.cos(an) * 15, Math.sin(an) * 15); g.lineTo(Math.cos(an) * 26, Math.sin(an) * 26); g.stroke(); }
    g.fillStyle = '#1c1624'; g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill(); g.strokeStyle = 'rgba(110,90,140,0.3)'; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = 'rgba(4,2,8,0.85)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-20, -22); g.lineTo(-4, -2); g.lineTo(2, -6); g.lineTo(18, 24); g.stroke();
    g.restore(); }
  for (const sd of [-1, 1]) ink(g, (g) => { g.beginPath(); g.moveTo(sd * 56, 0); g.lineTo(sd * 56, -60); g.quadraticCurveTo(sd * 86, -74, sd * 92, -56); g.quadraticCurveTo(sd * 90, -44, sd * 80, -50); g.lineTo(sd * 80, 0); g.closePath(); }, '#18121e', 3.4, (g) => { g.fillStyle = 'rgba(190,140,255,0.2)'; g.fillRect(sd < 0 ? -92 : 56, -76, 8, 76); });   // the arms, scrolled
  ink(g, (g) => { g.beginPath(); g.moveTo(-56, -62); g.lineTo(56, -62); g.lineTo(60, -26); g.lineTo(-60, -26); g.closePath(); }, '#2a1a34', 3, (g) => { g.fillStyle = 'rgba(160,80,200,0.25)'; g.fillRect(-60, -62, 120, 6); });   // the seat, a purple cushion
  g.restore();
}
// the mirror on its golden stand (a plant for the epilogue): the round glass is filled live with swirling dark smoke
function drawMirrorFrame(g) {
  g.save(); g.translate(MIRROR_X, 296);
  ink(g, (g) => { g.beginPath(); g.moveTo(-34, 0); g.quadraticCurveTo(-30, -20, -22, -30); g.lineTo(-16, -42); g.lineTo(16, -42); g.lineTo(22, -30); g.quadraticCurveTo(30, -20, 34, 0); g.closePath(); }, GOLD.base, 3, (g) => { const sg = g.createLinearGradient(-34, -42, 34, 0); sg.addColorStop(0, '#fff0a8'); sg.addColorStop(0.35, '#e8b43a'); sg.addColorStop(0.75, '#a87420'); sg.addColorStop(1, '#6a4410'); g.fillStyle = sg; g.fillRect(-36, -44, 72, 46); g.fillStyle = 'rgba(255,255,240,0.55)'; g.fillRect(-20, -38, 4, 34); g.strokeStyle = 'rgba(90,56,10,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-28, -10); g.lineTo(28, -10); g.moveTo(-24, -24); g.lineTo(24, -24); g.stroke(); });
  g.strokeStyle = LINE; g.lineWidth = 6 * LK + 1; g.beginPath(); g.moveTo(0, -42); g.lineTo(0, -66); g.stroke(); g.strokeStyle = GOLD.base; g.lineWidth = 3.4; g.stroke();
  ink(g, (g) => { g.beginPath(); g.ellipse(0, -150, 62, 84, 0, 0, TAU); }, GOLD.base, 5, (g) => {
    const fg = g.createLinearGradient(-62, -234, 62, -66); fg.addColorStop(0, '#fff0a8'); fg.addColorStop(0.4, '#e8b43a'); fg.addColorStop(1, '#7a5010'); g.fillStyle = fg; g.fillRect(-64, -240, 128, 180);
    g.strokeStyle = 'rgba(90,56,10,0.7)'; g.lineWidth = 1.4; for (let q = 0; q < 12; q++) { const an = q * TAU / 12; const ex = Math.cos(an) * 56, ey = -150 + Math.sin(an) * 78; g.beginPath(); g.arc(ex, ey, 3.4, an, an + Math.PI * 1.4); g.stroke(); }   // (engraved scrolls)
  });
  { const gg = g.createRadialGradient(-14, -176, 4, 0, -150, 76); gg.addColorStop(0, '#2a1a3a'); gg.addColorStop(1, '#08040e'); g.fillStyle = gg; g.beginPath(); g.ellipse(0, -150, 50, 72, 0, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.ellipse(0, -150, 50, 72, 0, 0, TAU); g.clip(); g.fillStyle = 'rgba(220,200,255,0.16)'; poly(g, [-40, -200, -24, -214, 30, -90, 14, -76]); g.fill(); g.restore(); }   // (a reflection streak in the glass)
  g.strokeStyle = LINE; g.lineWidth = 3 * LK; g.stroke();
  g.restore();
}

// ---------------------------------------------------------------------------------------------------------------
// THE FLOORS
// ---------------------------------------------------------------------------------------------------------------
const PATHG = [[0, '#2a2234'], [0.45, '#40364a'], [1, '#362c40']];   // (the cliff path's packed earth)
// ---- THE GATE'S CLIFF PATH (QA A6): layered rock -- broad light and dark patches; strata whose thickness wanders, pinching out here and
// there, the whole set dipping slowly across the path; each layer's slabs their own tone, a lit lip and a shadowed step stroked as one line
// whose light fades in and out (a gradient: never beads, never ruled stripes); soft uneven cracks; a barely worn lane.  A pure function
// of world x (chunk-safe), baked into the floor strip
const STRATA = [9, 11, 13, 16, 20, 25, 31, 38, 46];
const gateDip = (x) => 7 * vnoise(x, 620, 970) + 3 * vnoise(x, 230, 971);
const gateLip = (b, x) => { let y = 362 + gateDip(x); for (let j = 0; j < b; j++) y += STRATA[j] * (1 + 0.42 * vnoise(x, 380 + j * 37, 980 + j)); return y + 1.4 * vnoise(x, 19, 930 + b); };
function gateGround(g, x0, x1) {
  vgrad(g, x0 - 2, 360, x1 - x0 + 4, 552, PATHG);
  mottle(g, x0 - 2, 360, x1 - x0 + 4, 192, 0.5);
  if (LIVE) return;   // (painted live each frame -- a memory cap past the 0.5 rung: the plain ground, not the strata's thousands of calls)
  for (let x = al(x0 - 180, 60) - 60; x < x1 + 180; x += 60) {   // (broad patches of lighter and darker rock)
    const i = Math.round(x / 60);
    for (let r = 0; r < 4; r++) { const v = hash2(i, r + 900); if (v < 0.5) continue; const cy = 382 + r * 46 + hash2(i, r + 901) * 30, rx = 70 + 90 * hash2(i, r + 902); lightPool(g, x + hash2(i, r + 903) * 60, cy, rx, rx * 0.2, v > 0.8 ? '196,176,232' : '6,2,14', v > 0.8 ? 0.07 : 0.18); }
  }
  const xs = []; for (let x = al(x0 - 64, 48); x <= al(x1 + 64, 48) + 48; x += 8) xs.push(x);   // (from one 48-grid stop to another: the fade's gradient is the same in every chunk)
  const fadeGrad = (b, col, a, salt, lane) => {   // (a horizontal gradient carrying the lip's light: in and out along x, every 48 px)
    const gr = g.createLinearGradient(xs[0], 0, xs[xs.length - 1], 0), L = xs[xs.length - 1] - xs[0];
    for (let x = al(xs[0], 48); x <= xs[xs.length - 1] + 48; x += 48) { const u = (x - xs[0]) / L; if (u < 0 || u > 1) continue; const vis = clamp(0.45 + 1.7 * vnoise(x, 150, 950 + b + salt), 0, 1) * (lane ? 0.5 : 1); gr.addColorStop(u, `rgba(${col},${(a * vis).toFixed(3)})`); }
    return gr;
  };
  for (let b = 0; b < STRATA.length; b++) {
    const lane = b >= 3 && b <= 6;   // (the walking lane's layers: worn, their lips fainter)
    // each layer's slabs: between irregular cracks, each its own tone
    let cx = -420 + 37 * b, k = 0;   // (from a fixed start: every chunk cuts the same slabs)
    while (cx < x1 + 260) {
      const len = 70 + 150 * hash2(k, 990 + b), nx = cx + len, tone = hash2(k, 991 + b);
      if (nx > x0 - 20 && cx < x1 + 20) {
        const ca = cx - 5, na = nx + 5;   // (the slab's tone runs 5 px past each crack, cross-fading with its neighbour's)
        g.beginPath(); g.moveTo(ca, gateLip(b, ca)); for (let x = al(ca, 8) + 8; x < na; x += 8) g.lineTo(x, gateLip(b, x)); g.lineTo(na, gateLip(b, na)); g.lineTo(na, gateLip(b + 1, na)); for (let x = al(na, 8); x > ca; x -= 8) g.lineTo(x, gateLip(b + 1, x)); g.lineTo(ca, gateLip(b + 1, ca)); g.closePath();
        const yy0 = gateLip(b, (cx + nx) / 2), yy1 = gateLip(b + 1, (cx + nx) / 2), sg = g.createLinearGradient(0, yy0 - 2, 0, yy1 + 2);
        sg.addColorStop(0, tone > 0.5 ? 'rgba(196,176,236,0.08)' : 'rgba(160,140,200,0.04)'); sg.addColorStop(1, tone > 0.6 ? 'rgba(8,3,18,0.22)' : 'rgba(8,3,18,0.12)'); g.fillStyle = sg;   // (a slab: lit at its top, darker toward the next lip)
        g.save(); g.clip(); const ga = g.globalAlpha;
        for (let q = 0; q < 4; q++) { g.globalAlpha = ga * (q + 0.5) / 4; g.fillRect(ca + q * 2.5, 330, 2.5, 240); g.fillRect(na - (q + 1) * 2.5, 330, 2.5, 240); }   // (its ends feathered: four steps each way)
        g.globalAlpha = ga; if (na - ca > 20) g.fillRect(ca + 10, 330, na - ca - 20, 240); g.restore();
        if (hash2(k, 992 + b) > 0.35) {   // (the crack between slabs: soft, a shadow and a lit lip, not always across the whole layer)
          const ya = gateLip(b, cx) + 1, yb2 = ya + (gateLip(b + 1, cx) - ya) * (0.5 + 0.5 * hash2(k, 993 + b)), sl = (hash2(k, 994 + b) - 0.5) * 6;
          g.strokeStyle = 'rgba(6,2,14,0.35)'; g.lineWidth = 1.3 + b * 0.08; g.beginPath(); g.moveTo(cx, ya); g.lineTo(cx + sl, yb2); g.stroke();
          g.strokeStyle = 'rgba(200,180,236,0.1)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx + 1.6, ya + 1); g.lineTo(cx + sl + 1.6, yb2); g.stroke();
        }
      }
      cx = nx; k++;
    }
    if (b === 0) continue;
    // the lip: one continuous line per layer; its light and its shadow fading in and out along it (gradients), butt caps
    g.save(); g.lineCap = 'butt'; g.lineJoin = 'round';
    const path = (dy) => { g.beginPath(); xs.forEach((x, i) => { const y = gateLip(b, x) + dy; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); };
    path(-0.7); g.strokeStyle = fadeGrad(b, '206,188,240', 0.24, 0, lane); g.lineWidth = 1.3; g.stroke();
    path(1); g.strokeStyle = fadeGrad(b, '6,2,14', 0.45, 0, lane); g.lineWidth = 1.5 + b * 0.16; g.stroke();
    path(3 + b * 0.3); g.strokeStyle = fadeGrad(b, '6,2,14', 0.12, 0, lane); g.lineWidth = 3 + b * 0.5; g.stroke();
    g.restore();
  }
  vgrad(g, x0 - 2, 404, x1 - x0 + 4, 494, [[0, 'rgba(214,196,244,0)'], [0.5, 'rgba(214,196,244,0.035)'], [1, 'rgba(214,196,244,0)']]);   // (the lane, worn a little smoother)
}
// puddles on the path, the gate torches' magenta flames upside down in those under them: [world x, y, half-width, half-height, the torch's
// x or null, the reflection's kind: 'streak' (a long one) / 'broken' (its lower half shifted sideways by a ripple: never a closed ring,
// which is the game's floor-marker language)]
const PUDDLES = [[330, 450, 62, 11, 330, 'streak'], [508, 502, 46, 10, null, ''], [700, 470, 72, 13, 700, 'broken'], [872, 418, 38, 7, null, ''], [1008, 438, 66, 11, 1020, 'streak']];
function puddle(g, cx, cy, rx, ry, sd, torchX, kind) {
  const pts = []; for (let k = 0; k < 14; k++) { const an = (k / 14) * TAU, lobe = 0.72 + 0.22 * Math.sin(an * 2 + hash2(sd, 40) * 6) + 0.18 * hash2(sd, k); const sn = Math.sin(an); pts.push(cx + Math.cos(an) * rx * lobe, cy + sn * ry * (sn < 0 ? 0.62 + 0.8 * hash2(sd, k + 20) : 0.8 + 0.3 * hash2(sd, k + 20))); }   // (lobed, never a lens; the far edge wanders most)
  lightPool(g, cx, cy + ry * 0.2, rx * 1.4, ry * 1.7, '8,2,16', 0.26);   // (the wet ground round it)
  g.save(); blob(g, pts); g.clip();
  vgrad(g, cx - rx * 1.3, cy - ry * 1.4, rx * 2.6, cy + ry * 1.4, [[0, '#5a4682'], [0.45, '#2c1f48'], [1, '#160d26']]);   // (the stormy sky in it, pale at its far edge)
  if (torchX !== null) {   // (the flame upside down: magenta, brightest at the far edge)
    const tall = kind === 'streak' ? 2.4 : 1.6;
    const flame = (fx) => { lightPool(g, fx, cy, rx * 0.28, ry * tall, '255,80,220', 0.85); lightPool(g, fx, cy - ry * 0.2, rx * 0.09, ry * tall * 0.65, '255,220,250', 0.6); };   // (its white core capped: the pickups' gold glints stay the brightest things on the floor)
    lightPool(g, torchX, cy + ry * 0.2, rx * 0.85, ry * 0.8, '255,60,210', 0.3);
    if (kind === 'broken') {   // (a ripple has shifted the lower half of the flame's reflection sideways; two faint open arcs of it, off the flame)
      const yb = cy + ry * 0.12, sh = hash2(sd, 60) > 0.5 ? 3 : -3;
      g.save(); g.beginPath(); g.rect(cx - rx * 2, cy - ry * 3, rx * 4, yb - (cy - ry * 3)); g.clip(); flame(torchX); g.restore();
      g.save(); g.beginPath(); g.rect(cx - rx * 2, yb, rx * 4, ry * 3); g.clip(); flame(torchX + sh); g.restore();
      g.fillStyle = 'rgba(255,150,240,0.4)'; g.fillRect(torchX - rx * 0.14, cy - ry * 0.45, rx * 0.28, 1.2); g.fillStyle = 'rgba(255,150,240,0.28)'; g.fillRect(torchX - rx * 0.16 + sh, yb + 1, rx * 0.32, 1.1);
      g.strokeStyle = 'rgba(196,182,250,0.18)'; g.lineWidth = 1;
      const ax = torchX + rx * 0.38 * Math.sign(sh), ay = cy + ry * 0.25;
      g.beginPath(); g.ellipse(ax, ay, rx * 0.26, ry * 0.42, 0, Math.PI * 1.08, Math.PI * 1.62); g.stroke();   // (~97 degrees, open)
      g.beginPath(); g.ellipse(ax, ay, rx * 0.44, ry * 0.66, 0, Math.PI * 0.12, Math.PI * 0.5); g.stroke();    // (~68 degrees, open)
    } else flame(torchX);
    if (kind !== 'broken') for (let q = 0; q < 3; q++) { const yy = cy - ry * 0.5 + q * ry * 0.5, hw = rx * (0.12 + 0.05 * q); g.fillStyle = `rgba(255,150,240,${(0.45 - q * 0.1).toFixed(2)})`; g.fillRect(torchX - hw + q * 2, yy, hw * 2, 1.2); }   // (the long streak, broken by the ripples)
  }
  g.strokeStyle = 'rgba(220,190,255,0.14)'; g.lineWidth = 1; for (let q = 0; q < 2; q++) { const yy = cy - ry * 0.3 + q * ry * 0.5; g.beginPath(); g.moveTo(cx - rx * 0.55 + hash2(sd, q + 20) * 14, yy); g.lineTo(cx + rx * 0.45 - hash2(sd, q + 30) * 14, yy + 0.5); g.stroke(); }
  g.beginPath(); g.ellipse(cx, cy + ry * 0.12, rx * 0.95, ry, 0, Math.PI * 0.15, Math.PI * 0.85); g.strokeStyle = torchX !== null ? 'rgba(255,170,240,0.55)' : 'rgba(210,190,250,0.38)'; g.lineWidth = 1.6; g.stroke();   // (the near rim catches the light)
  g.restore();
  g.strokeStyle = 'rgba(6,2,12,0.25)'; g.lineWidth = 1; blob(g, pts); g.stroke();   // (its edge: soft)
}
function drawFloor(g, xa, xb) {
  const Wd = xb - xa + 4;
  g.fillStyle = '#0c0714'; g.fillRect(xa - 2, 360, Wd, 192);
  if (xa < DOOR_X - 60) { const x1g = Math.min(xb + 4, DOOR_X - 60); g.save(); g.beginPath(); g.rect(xa - 2, 300, x1g - xa + 4, 260); g.clip(); gateGround(g, xa, x1g); g.restore(); }   // (the cliff path's layered rock, under the paving's ragged edge; clipped to its span: what lies past it never depends on where a chunk starts)
  for (let r = 0; r < ROWS.length - 1; r++) {
    const y0 = ROWS[r], y1 = ROWS[r + 1], pw0 = 96 + r * 28;
    for (let bxN = -400 - (r & 1) * 50, i = 0; bxN < xb + 200; i++) {   // (from a fixed start, so every chunk cuts the same flags)
      const pw = pw0 * (0.8 + hash2(i + Math.floor(bxN / 7), r + 600) * 0.5), bx = bxN; bxN += pw;
      if (bx + pw < xa - 4) continue;
      const h = hash2(Math.floor(bx / 13), r + 610), mid = bx + pw / 2, out = mid < CORR_X - 60;
      if (mid < CORR_X - 60 && (mid < fray((y0 + y1) / 2) - 30 || (mid < fray((y0 + y1) / 2) + 170 && hash2(i, r + 875) < 0.16))) continue;   // (the path before the door: ground; near the edge a flag or two gone)
      const base = out ? '#3c3448' : mid < HALL_X ? '#4a4258' : '#403850';
      g.fillStyle = mix(base, h < 0.5 ? '#2c2438' : '#5e5472', Math.abs(h - 0.5) * 0.9); g.fillRect(bx, y0, pw + 0.6, y1 - y0 + 0.6);
      { const sd = Math.floor(bx) * 13 + r; g.fillStyle = 'rgba(220,200,255,0.12)'; for (let k = 0; k < 5; k++) g.fillRect(bx + hash2(sd, k) * pw, y0 + 2 + hash2(sd, k + 9) * (y1 - y0 - 4), 1.6, 1.2);   // (grit, a polished streak)
        if (!out) { g.fillStyle = 'rgba(230,210,255,0.06)'; g.fillRect(bx + pw * 0.15, y0 + (y1 - y0) * 0.35, pw * 0.5, Math.max(1.4, (y1 - y0) * 0.12)); } }
      g.fillStyle = rgba('#d8c0ff', out ? 0.07 : 0.1); g.fillRect(bx, y0 + 1, pw, Math.max(2, (y1 - y0) * 0.16));
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(bx, y1 - 3, pw, 3);

      g.strokeStyle = 'rgba(6,2,12,0.85)'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx, y1); g.stroke();
      if (h > 0.55 && h < 0.64) { g.strokeStyle = 'rgba(6,2,12,0.6)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(bx + 12, y0 + 3); g.lineTo(bx + pw * 0.5, y0 + (y1 - y0) * 0.55); g.lineTo(bx + pw * 0.7, y1 - 3); g.stroke(); }
    }
    { const lx = Math.max(xa - 2, fray(y0) - 40); if (xb + 2 > lx) { g.strokeStyle = 'rgba(6,2,12,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(lx, y0); g.lineTo(xb + 2, y0); g.stroke(); } }   // (the paving's rows: not across the path)
  }
  if (xa < DOOR_X) {   // (the ground over the flags' ragged ends: one wandering edge, a dark lip, broken corners)
    const ex = [];
    for (let y = 360; y <= 552; y += 6) ex.push(fray(y) + 16 * (hash2(Math.round(y / 6), 878) - 0.5), y);
    const pg = [-20, 360]; for (let k = 0; k < ex.length; k += 2) pg.push(ex[k], Math.max(360, ex[k + 1])); pg.push(-20, 552);
    g.save(); poly(g, pg); g.clip(); gateGround(g, Math.max(xa - 2, -20), Math.min(xb + 2, DOOR_X)); g.restore();
    g.strokeStyle = 'rgba(6,2,12,0.55)'; g.lineWidth = 2.2; polyline(g, ex); g.stroke();
    g.strokeStyle = 'rgba(200,180,230,0.12)'; g.lineWidth = 1.2; polyline(g, ex.map((v, j) => (j & 1 ? v : v + 3))); g.stroke();
    for (let k = 0; k < ex.length; k += 6) { const i = k / 6; if (hash2(i, 879) < 0.5) continue; const bx = ex[k] + 4, by = ex[k + 1]; g.fillStyle = '#2c2434'; poly(g, [bx - 2, by - 5, bx + 10 + hash2(i, 880) * 10, by - 4, bx - 1, by + 8]); g.fill(); g.strokeStyle = 'rgba(6,2,12,0.5)'; g.lineWidth = 1.2; g.stroke(); }   // (chipped corners)
  }
  mottle(g, xa - 2, 360, Wd, 192, 0.42);
  aoBand(g, xa - 2, xb + 2, 362, 22, 1, 0.45);   // (where the floor meets the wall)
  for (const p of LAY.pillars) if (p.x + 80 > xa && p.x - 80 < xb) { g.fillStyle = 'rgba(6,2,12,0.4)'; g.beginPath(); g.ellipse(p.x, 370, p.w * 0.9, 10, 0, 0, TAU); g.fill(); }   // (each pillar's base sits in its own shadow)
  if (xa < DOOR_X - 100) {   // the cliff path: packed earth and gravel, rough rocks set in it, tufts at its edges
    const x1p = Math.min(xb + 4, DOOR_X - 60);
    const SHAPES = [[1, 0.8, 0.95, 0.7, 0.9, 1, 0.75], [0.7, 1, 0.6, 0.9, 1, 0.65, 0.85], [1, 0.95, 0.5, 0.95, 0.9, 0.55, 1], [0.85, 0.7, 1, 1, 0.6, 0.9, 0.8]];
    for (let x = al(xa - 60, 30) - 30; x < x1p + 60; x += 30) for (let r = 0; r < 6; r++) {
      const i = Math.round(x / 30), h = hash2(i, r + 820), ry = 368 + r * 30 + hash2(i, r + 822) * 24;
      const edge = Math.max(sstep(420, 372, ry), sstep(470, 540, ry)), dens = 0.12 + 0.75 * edge + 0.5 * (vnoise(x, 150, 860 + r) + 0.2);   // (thick at the path's edges, in clumps; the middle mostly bare)
      if (h > dens) continue;
      const k2 = 0.6 + (ry - 368) / 180 * 1.1, rx = x + hash2(i, r + 821) * 28, sz = hash2(i, r + 823), w2 = (4 + 22 * sz * sz) * k2, h2 = w2 * (0.38 + 0.14 * hash2(i, r + 825)), sh = SHAPES[Math.floor(hash2(i, r + 827) * 4)], rot = (hash2(i, r + 828) - 0.5) * 0.8;
      const sunk = hash2(i, r + 826) > 0.5;
      if (rx > x1p + 20) continue;
      lightPool(g, rx + w2 * 0.2, ry + h2 * 0.55, w2 * 1.3, h2 * 0.75, '6,2,12', 0.5);   // (its shadow pooled under it, soft)
      const tilt = (hash2(i, r + 829) - 0.5) * 0.3;
      g.save(); if (sunk) { g.beginPath(); g.moveTo(rx - w2 * 2, ry + h2 * 0.1 - w2 * 2 * tilt); g.lineTo(rx + w2 * 2, ry + h2 * 0.1 + w2 * 2 * tilt); g.lineTo(rx + w2 * 2, ry - h2 * 3); g.lineTo(rx - w2 * 2, ry - h2 * 3); g.closePath(); g.clip(); }   // (sunk along a tilted line, not a level cut)
      const stoneP = () => { g.beginPath(); for (let q = 0; q < 7; q++) { const an = (q / 7) * TAU + rot, rr = sh[q]; g.lineTo(rx + Math.cos(an) * w2 * rr, ry + Math.sin(an) * h2 * rr); } g.closePath(); };
      { const tone = hash2(i, r + 824), sg = g.createLinearGradient(0, ry - h2, 0, ry + h2); sg.addColorStop(0, mix('#4a4060', '#605478', tone)); sg.addColorStop(0.55, mix('#2a2238', '#3c3452', tone)); sg.addColorStop(1, '#1e1828'); stoneP(); g.fillStyle = sg; g.fill(); }   // (lit from above, dark at its foot)
      g.save(); stoneP(); g.clip(); g.beginPath(); g.rect(rx - w2 * 2, ry - h2 * 2, w2 * 4, h2 * 1.6); g.clip(); stoneP(); g.strokeStyle = 'rgba(214,194,244,0.3)'; g.lineWidth = 1.5; g.stroke(); g.restore();   // (its lit upper rim)
      { const tc = LAY.torches.find((q) => q.pole && Math.abs(q.x - rx) < 160); if (tc) { const d = Math.sign(tc.x - rx) || 1; g.save(); stoneP(); g.clip(); g.strokeStyle = `rgba(255,90,220,${(0.5 * (1 - Math.abs(tc.x - rx) / 160)).toFixed(2)})`; g.lineWidth = 2.4; g.beginPath(); g.ellipse(rx + d * w2 * 0.2, ry, w2, h2, 0, d > 0 ? -Math.PI * 0.45 : Math.PI * 0.95, d > 0 ? Math.PI * 0.05 : Math.PI * 1.45); g.stroke(); g.restore(); } }   // (the torch's magenta on its near side)
      g.restore();
      { const yl = sunk ? ry + h2 * 0.1 : ry + h2 * 0.72; g.strokeStyle = 'rgba(8,4,14,0.35)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(rx - w2 * 0.75, yl - w2 * 0.75 * tilt); g.quadraticCurveTo(rx, yl + h2 * 0.22, rx + w2 * 0.75, yl + w2 * 0.75 * tilt); g.stroke(); }   // (a short arc where it meets the ground)
    }
    g.fillStyle = 'rgba(180,160,210,0.25)'; for (let x = al(xa, 7); x < x1p; x += 7) { const i = Math.round(x / 7); g.fillRect(x + hash2(i, 840) * 6, 366 + hash2(i, 841) * 180, 1.6, 1.4); }   // (gravel)
    g.strokeStyle = 'rgba(110,90,140,0.7)'; g.lineWidth = 1.5; g.lineCap = 'round';
    for (let x = al(xa - 40, 60); x < x1p + 40; x += 60) { const i = Math.round(x / 60); if (hash2(i, 850) < 0.5) continue; const tx = x + hash2(i, 851) * 50, ty = 368 + hash2(i, 852) * 14; for (let b = 0; b < 5; b++) { g.beginPath(); g.moveTo(tx + b * 3, ty); g.quadraticCurveTo(tx + b * 3 + (b - 2) * 2, ty - 6, tx + b * 3 + (b - 2) * 3, ty - 9 - hash2(i, b + 853) * 5); g.stroke(); } }   // (dead tufts)
  }
  PUDDLES.forEach(([px, py, prx, pry, tx, kd], k) => { if (px + prx * 1.5 > xa && px - prx * 1.5 < xb && px < DOOR_X - 200) puddle(g, px, py, prx, pry, 970 + k, tx, kd); });   // (puddles: the torches' flames in them)
  for (const tc of LAY.torches) if (tc.pole && tc.x + 140 > xa && tc.x - 140 < xb) { lightPool(g, tc.x, 378, 130, 24, '255,80,220', 0.2); lightPool(g, tc.x + 30, 420, 90, 14, '255,80,220', 0.08); }   // (the gate torches' light on the path)
  // the torches' reflections in the polished floor, the windows' cold light on it
  for (const p of LAY.pillars) if (p.x + 80 > xa && p.x - 80 < xb && p.x !== 2800 && p.x !== 4260) { lightPool(g, p.x, 396, 22, 44, '255,80,220', 0.22); lightPool(g, p.x, 384, 70, 14, '255,80,220', 0.12); }   // (soft: a smear of light in the polish)
  { const P = LAY.pillars; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], hall = a.sec === 2 && b.sec === 2, kind = hall ? 'window' : BAYS[i % BAYS.length]; const cx = (a.x + b.x) / 2;
    if (cx + 200 < xa || cx - 200 > xb) continue;
    const shaft = (x0, x1, x2, x3, col, a) => { for (const [gw, ga] of [[18, 0.35], [8, 0.6], [0, 1]]) { const gr = g.createLinearGradient(0, 362, 0, 480); gr.addColorStop(0, `rgba(${col},${a * ga})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; poly(g, [x0 - gw * 0.5, 362, x1 + gw * 0.5, 362, x3 + gw, 480, x2 - gw, 480]); g.fill(); } };   // (soft edges, fading along it)
    if (kind === 'window' || kind === 'broken') shaft(cx - 36, cx + 36, cx - 4, cx + 104, '170,160,230', 0.06);
    else if (kind === 'stained') [['60,200,190', 0], ['255,200,90', 1], ['110,130,255', 2]].forEach(([c, k2]) => shaft(cx - 40 + k2 * 26, cx - 14 + k2 * 26, cx + 24 + k2 * 30, cx + 50 + k2 * 30, c, 0.07));
  } }
  // the corridor's carpet: a long woven violet runner -- gold borders, a band of medallions (worn here and there), soft ripples -- fading in
  // from the doorway (no hard end seen from the gate)
  const cx0 = Math.max(xa - 6, CORR_X + 40), cx1 = Math.min(xb + 6, HALL_X + 120);
  if (cx1 > cx0) {
    g.save(); g.beginPath(); g.rect(cx0, 400, cx1 - cx0, 72); g.clip();
    vgrad(g, cx0, 404, cx1 - cx0, 468, [[0, '#4a1a6a'], [1, '#34104e']]);
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1; for (let y = 406; y < 468; y += 3) { g.beginPath(); g.moveTo(cx0, y); g.lineTo(cx1, y); g.stroke(); }   // (the pile's weave)
    for (const y of [411, 461]) { g.fillStyle = '#6a2a7a'; g.fillRect(cx0, y - 3, cx1 - cx0, 6); for (let x = al(cx0, 14); x < cx1; x += 14) { g.fillStyle = rgba('#e8b43a', 0.6); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y - 3); g.lineTo(x + 8, y); g.lineTo(x + 4, y + 3); g.closePath(); g.fill(); } }   // (the inner border bands)
    for (let x = al(cx0, 112) - 112; x < cx1 + 112; x += 112) {   // (medallions, each a little different, some worn)
      const i = Math.round(x / 112), mx = x + 56, worn = hash2(i, 640) > 0.75;
      g.fillStyle = rgba(MAG, 0.35); g.beginPath(); g.ellipse(mx, 436, 26, 15, 0, 0, TAU); g.fill();
      g.strokeStyle = rgba('#ffe58a', 0.55); g.lineWidth = 1.6; g.stroke();
      if (worn) { g.strokeStyle = 'rgba(30,10,40,0.6)'; g.lineWidth = 1; for (let q = 0; q < 6; q++) { const an = q * 1.1; g.beginPath(); g.moveTo(mx + Math.cos(an) * 22, 436 + Math.sin(an) * 12); g.lineTo(mx + Math.cos(an) * 28, 436 + Math.sin(an) * 16); g.stroke(); } }   // (worn: frayed threads)
      g.fillStyle = rgba('#ffe58a', 0.45); const pet = 4 + Math.floor(hash2(i, 641) * 3); for (let k = 0; k < pet; k++) { const an = k * TAU / pet; g.beginPath(); g.ellipse(mx + Math.cos(an) * 12, 436 + Math.sin(an) * 7, 4, 2.4, an, 0, TAU); g.fill(); }
      g.fillStyle = rgba(VIO, 0.4); g.beginPath(); g.moveTo(x + 6, 436); g.lineTo(x + 14, 430); g.lineTo(x + 22, 436); g.lineTo(x + 14, 442); g.closePath(); g.fill();
    }
    mottle(g, cx0, 404, cx1 - cx0, 64, 0.35, 0.7);
    for (const y of [404, 468]) { g.fillStyle = GOLD.base; g.fillRect(cx0, y - 2, cx1 - cx0, 5); g.fillStyle = GOLD.hi; g.fillRect(cx0, y - 2, cx1 - cx0, 1.6); }
    g.strokeStyle = 'rgba(6,2,12,0.7)'; g.lineWidth = 2; g.strokeRect(cx0 - 10, 404, cx1 - cx0 + 20, 64);
    // (its start, at the doorway: fading in out of the shadow over the first 200 px)
    if (cx0 < CORR_X + 200) { const fg = g.createLinearGradient(CORR_X + 40, 0, CORR_X + 180, 0); fg.addColorStop(0, 'rgba(12,7,20,0.65)'); fg.addColorStop(1, 'rgba(12,7,20,0)'); g.fillStyle = fg; g.fillRect(CORR_X + 30, 398, 160, 76); }
    g.restore();
    g.fillStyle = 'rgba(6,2,12,0.4)'; g.fillRect(cx0, 469, cx1 - cx0, 3);   // (its contact shadow)
    for (const ex of [CORR_X + 40, HALL_X + 120]) if (ex > xa - 20 && ex < xb + 20) {   // (the gold tassels at its ends)
      const d = ex < 3000 ? -1 : 1, ga = g.globalAlpha; g.lineCap = 'round'; g.globalAlpha = ga * (d < 0 ? 0.55 : 1);   // (the doorway's end lies in the doorway's shadow, as the carpet's start does)
      g.fillStyle = rgba(GOLD.sh, 0.85); g.fillRect(ex - (d < 0 ? 3 : 0), 404, 3, 64); g.fillStyle = rgba(GOLD.base, 0.5); for (let y = 405; y < 468; y += 4) g.fillRect(ex - (d < 0 ? 3 : 0), y, 3, 1.6);   // (the woven binding along its end)
      g.strokeStyle = 'rgba(20,8,24,0.28)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(ex + d * 4, 470); g.lineTo(ex + d * 14, 471); g.stroke();   // (the fringe's faint shadow on the floor)
      for (let q = 0; q < 7; q++) {   // (seven tassels: a knot at the hem, its threads fanned out over the floor -- a brush of thread, no ink)
        const ky = 409 + q * 9 + (hash2(q, ex) - 0.5) * 2, kx = ex + d * 2.5, n = 4, spread = 0.5 + 0.25 * hash2(q, ex + 3), len = 9 + 5 * hash2(q, ex + 4);
        g.strokeStyle = rgba(GOLD.base, 0.75); g.lineWidth = 0.9; g.beginPath();
        for (let k = 0; k < n; k++) { const an = (k / (n - 1) - 0.5) * spread + (hash2(q * 5 + k, ex + 5) - 0.5) * 0.18, l2 = len * (0.75 + 0.25 * hash2(q * 5 + k, ex + 6)), tx = kx + d * Math.cos(an) * l2, ty = ky + Math.sin(an) * l2 + 1; g.moveTo(kx, ky); g.quadraticCurveTo(kx + d * l2 * 0.5, ky + Math.sin(an) * l2 * 0.4, tx, ty); }
        g.stroke();
        g.fillStyle = rgba(GOLD.hi, 0.8); g.beginPath(); g.arc(kx, ky, 1.7, 0, TAU); g.fill();   // (its knot)
      }
      g.globalAlpha = ga;
    }
  }
  // the hall: the great sigil carved into the marble -- grooves with a thin dim gold inlay, broken into runes, an eclipsed sun at its heart --
  // and a few old cracks (dark, never glowing: nothing here may read as the fight's warning rings)
  if (xb > HALL_X + 200) {
    const sx = 4930, sy = 438;
    g.save(); g.translate(sx, sy); g.scale(1, 0.3);
    for (const [rr, lw] of [[250, 9], [214, 6]]) {
      g.strokeStyle = 'rgba(6,2,12,0.55)'; g.lineWidth = lw; g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.stroke();
      for (let q = 0; q < 24; q++) { const a0 = q * TAU / 24 + 0.04, a1 = a0 + TAU / 24 - 0.08; g.strokeStyle = 'rgba(214,180,110,0.22)'; g.lineWidth = 2; g.beginPath(); g.arc(0, -2, rr, a0, a1); g.stroke(); }
    }
    for (let q = 0; q < 20; q++) { const a = q * TAU / 20; g.strokeStyle = 'rgba(214,180,110,0.2)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(Math.cos(a) * 222, Math.sin(a) * 222); g.lineTo(Math.cos(a + 0.05) * 232, Math.sin(a + 0.05) * 236); g.lineTo(Math.cos(a + 0.1) * 222, Math.sin(a + 0.1) * 226); g.stroke(); }   // (runes)
    for (let q = 0; q < 16; q++) { const a = q * TAU / 16; g.strokeStyle = 'rgba(6,2,12,0.5)'; g.lineWidth = 6; g.beginPath(); g.moveTo(Math.cos(a) * 104, Math.sin(a) * 104); g.lineTo(Math.cos(a) * (150 + (q % 2) * 26), Math.sin(a) * (150 + (q % 2) * 26)); g.stroke(); g.strokeStyle = 'rgba(214,180,110,0.22)'; g.lineWidth = 1.6; g.stroke(); }   // (the sun's rays)
    { const dg = g.createRadialGradient(0, 0, 0, 0, 0, 100); dg.addColorStop(0, 'rgba(20,8,32,0.34)'); dg.addColorStop(0.8, 'rgba(20,8,32,0.26)'); dg.addColorStop(1, 'rgba(20,8,32,0.1)'); g.fillStyle = dg; g.beginPath(); g.arc(0, 0, 100, 0, TAU); g.fill(); g.strokeStyle = 'rgba(214,180,110,0.25)'; g.lineWidth = 2.4; g.stroke(); }   // (the eclipse: a dim disc over it, soft -- not a hole)
    g.restore();
    for (let i = 0; i < 9; i++) {
      const x = HALL_X + 120 + hash2(i, 640) * 1500, y = 380 + hash2(i, 641) * 150, L = 50 + hash2(i, 642) * 90;
      g.strokeStyle = 'rgba(6,2,12,0.6)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + L * 0.3, y + 6); g.lineTo(x + L * 0.55, y - 3); g.lineTo(x + L, y + 5); g.stroke();
      g.strokeStyle = 'rgba(160,90,200,0.12)'; g.lineWidth = 1; g.stroke();
    }
  }
  if (xb > CORR_X) {   // the lane where the heroes walk: a lighter band down it, the sconces' and chandeliers' warm light pooled on it (over the carpet too)
    const x0b = Math.max(xa - 2, CORR_X + 20); const bg2 = g.createLinearGradient(0, 376, 0, 510); bg2.addColorStop(0, 'rgba(240,226,250,0)'); bg2.addColorStop(0.45, 'rgba(240,226,250,0.13)'); bg2.addColorStop(1, 'rgba(240,226,250,0)'); g.fillStyle = bg2;
    { const fx1 = CORR_X + 140, ga = g.globalAlpha;   // (fading in over its first 120 px: no hard edge where the corridor starts -- QAF3)
      for (let x = Math.max(al(xa - 6, 6), CORR_X + 20); x < Math.min(xb + 2, fx1); x += 6) { g.globalAlpha = ga * clamp((x + 3 - CORR_X - 20) / 120, 0, 1); g.fillRect(x, 376, 6, 134); }
      g.globalAlpha = ga; if (xb + 2 > fx1) { const xs = Math.max(x0b, fx1); g.fillRect(xs, 376, xb + 2 - xs, 134); } }
    for (const p of LAY.torches) if (!p.pole && p.x + 240 > xa && p.x - 240 < xb) { lightPool(g, p.x + 14, 440, 190, 44, '255,186,130', 0.3); lightPool(g, p.x + 8, 424, 80, 18, '255,214,170', 0.18); }
    for (const cx of CHANDELIERS) if (cx + 240 > xa && cx - 240 < xb) lightPool(g, cx, 448, 210, 46, '255,200,150', 0.26);
  }
  vgrad(g, xa - 2, 478, Wd, 548, [[0, 'rgba(4,2,10,0)'], [1, 'rgba(4,2,10,0.28)']]);
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
// ---- what is left of Malachar (the book's c42_puff panel): a low heap of his violet robes, magenta swirls, the black feather collar,
// and the two halves of his porcelain mask lying cracked in front of it -- the laughing half (a closed happy eye, its half of the big
// smile) and the weeping half (a closed sad eye, the blue tear, a small frown); pale cream, no gold. Shared: the stage's story pile
// (setStory bg.pile) and the boss's RobePile (src/sipalace.js) both draw it.
//   (x, y): the heap's centre on the floor; o.w the heap's half-width (its height follows), o.s the mask's half-height,
//   o.lx / o.rx the two halves' x from the heap's centre (the pufferfish sits between them), o.k 0..1 the heap settling
function maskPiece(c, laughing, s, ink) {
  const d = laughing ? -1 : 1, lw = Math.max(2, s * 0.07);
  const jag = laughing ? [[0.06, 0.8], [-0.04, 0.63], [0.1, 0.46], [0.02, 0.3], [0.13, 0.12], [0.04, -0.06], [0.14, -0.24], [0.04, -0.42], [0.11, -0.6], [0.0, -0.78], [0.07, -0.92]]
                       : [[-0.08, 0.84], [0.02, 0.66], [-0.12, 0.5], [-0.03, 0.34], [-0.1, 0.16], [0.0, -0.02], [-0.13, -0.2], [-0.03, -0.38], [-0.12, -0.56], [-0.02, -0.74], [-0.09, -0.9]];
  const piece = (ox = 0, oy = 0) => {
    c.beginPath(); c.moveTo(ox, -s + oy);
    c.bezierCurveTo(ox + d * s * 0.62, -s + oy, ox + d * s * 0.8, -s * 0.45 + oy, ox + d * s * 0.76, -s * 0.02 + oy);
    c.bezierCurveTo(ox + d * s * 0.72, s * 0.5 + oy, ox + d * s * 0.4, s * 0.98 + oy, ox, s + oy);
    for (const [jx, jy] of jag) c.lineTo(ox + jx * s, jy * s + oy);
    c.closePath();
  };
  c.lineJoin = 'round'; c.lineCap = 'round';
  piece(s * 0.05 * -d, s * 0.1); c.fillStyle = '#8e8278'; c.fill(); c.lineWidth = lw; c.strokeStyle = ink; c.stroke();   // (the porcelain's thickness: the piece lies on the floor)
  piece(); c.fillStyle = laughing ? '#f2ead8' : '#e2dacb'; c.fill();
  c.save(); piece(); c.clip();
  const sh = c.createRadialGradient(d * -s * 0.05 - s * 0.25, -s * 0.45, s * 0.08, 0, 0, s * 1.1); sh.addColorStop(0, 'rgba(255,255,250,0.55)'); sh.addColorStop(0.55, 'rgba(255,255,250,0)'); sh.addColorStop(1, 'rgba(80,60,90,0.32)');
  c.fillStyle = sh; c.fillRect(-s, -s * 1.1, s * 2, s * 2.2);   // (a soft sheen, shaded to its edges)
  const rl = c.createLinearGradient(0, s * 0.3, 0, s); rl.addColorStop(0, 'rgba(150,60,170,0)'); rl.addColorStop(1, 'rgba(150,60,170,0.3)'); c.fillStyle = rl; c.fillRect(-s, s * 0.3, s * 2, s * 0.8);   // (the robes' violet bounced up into it)
  c.strokeStyle = ink; c.lineWidth = Math.max(1, lw * 0.85);
  if (laughing) {   // a raised brow, the closed happy eye (an arch), a round cheek, and its half of the one big laughing mouth
    c.lineWidth = Math.max(1, lw * 0.6); c.beginPath(); c.arc(-s * 0.36, -s * 0.5, s * 0.17, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    c.lineWidth = Math.max(1.2, lw * 0.9); c.beginPath(); c.arc(-s * 0.34, -s * 0.18, s * 0.16, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
    c.fillStyle = 'rgba(230,150,150,0.3)'; c.beginPath(); c.ellipse(-s * 0.5, s * 0.08, s * 0.13, s * 0.08, 0, 0, TAU); c.fill();
    const mouth = () => { c.beginPath(); c.moveTo(-s * 0.5, s * 0.28); c.quadraticCurveTo(0, s * 0.4, s * 0.5, s * 0.28); c.quadraticCurveTo(s * 0.42, s * 0.8, 0, s * 0.82); c.quadraticCurveTo(-s * 0.42, s * 0.8, -s * 0.5, s * 0.28); c.closePath(); };
    mouth(); c.fillStyle = '#4a1624'; c.fill();
    c.save(); mouth(); c.clip(); c.fillStyle = '#fbf7ee'; c.fillRect(-s * 0.55, s * 0.26, s * 1.1, s * 0.14); c.fillStyle = '#d8606e'; c.beginPath(); c.ellipse(0, s * 0.8, s * 0.28, s * 0.17, 0, 0, TAU); c.fill(); c.restore();
    mouth(); c.lineWidth = Math.max(1, lw * 0.8); c.stroke();
  } else {   // a brow slanting up to the middle, the closed sad eye (a drooping lid, three lashes), the blue tear, a small frown
    c.lineWidth = Math.max(1, lw * 0.6); c.beginPath(); c.moveTo(s * 0.56, -s * 0.36); c.quadraticCurveTo(s * 0.36, -s * 0.44, s * 0.16, -s * 0.58); c.stroke();
    c.lineWidth = Math.max(1.2, lw * 0.9); c.beginPath(); c.arc(s * 0.35, -s * 0.3, s * 0.16, Math.PI * 0.12, Math.PI * 0.88); c.stroke();
    c.lineWidth = Math.max(1, lw * 0.5); c.beginPath();
    for (const a of [0.3, 0.5, 0.7]) { const ex = s * 0.35 + Math.cos(Math.PI * a) * s * 0.16, ey = -s * 0.3 + Math.sin(Math.PI * a) * s * 0.16; c.moveTo(ex, ey); c.lineTo(ex + Math.cos(Math.PI * a) * s * 0.08, ey + Math.sin(Math.PI * a) * s * 0.08); }
    c.stroke();
    c.strokeStyle = 'rgba(80,150,220,0.55)'; c.lineWidth = Math.max(1, s * 0.05); c.beginPath(); c.moveTo(s * 0.5, -s * 0.16); c.quadraticCurveTo(s * 0.54, -s * 0.02, s * 0.52, s * 0.06); c.stroke();
    c.fillStyle = '#5aa8e8'; c.beginPath(); c.moveTo(s * 0.52, s * 0.0); c.quadraticCurveTo(s * 0.64, s * 0.18, s * 0.52, s * 0.24); c.quadraticCurveTo(s * 0.4, s * 0.18, s * 0.52, s * 0.0); c.closePath(); c.fill();
    c.strokeStyle = ink; c.lineWidth = Math.max(0.8, lw * 0.45); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(s * 0.49, s * 0.13, s * 0.025, s * 0.04, 0.3, 0, TAU); c.fill();
    c.lineWidth = Math.max(1.2, lw * 0.8); c.beginPath(); c.arc(s * 0.3, s * 0.62, s * 0.14, Math.PI * 1.22, Math.PI * 1.78); c.stroke();
  }
  c.strokeStyle = 'rgba(30,20,30,0.75)'; c.lineWidth = Math.max(0.8, lw * 0.35); c.beginPath();   // (hairline cracks running in from the broken edge)
  c.moveTo(d * -s * 0.04 + (laughing ? s * 0.08 : 0), -s * 0.66); c.lineTo(d * s * 0.16, -s * 0.74); c.lineTo(d * s * 0.3, -s * 0.84); c.moveTo(d * s * 0.16, -s * 0.74); c.lineTo(d * s * 0.2, -s * 0.62);
  c.moveTo(laughing ? s * 0.06 : -s * 0.05, s * 0.2); c.lineTo(d * s * 0.12, s * 0.16); c.lineTo(d * s * 0.2, s * 0.22);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(d * s * 0.42, -s * 0.66, s * 0.09, s * 0.05, d * 0.5, 0, TAU); c.fill();   // (the glaze's gloss)
  c.beginPath(); c.ellipse(d * s * 0.6, -s * 0.38, s * 0.03, s * 0.07, d * 0.3, 0, TAU); c.fill();
  c.restore();
  piece(); c.lineWidth = lw; c.strokeStyle = ink; c.stroke();
}
export function drawRobePile(ctx, x, y, o = {}) {
  const w = o.w || 140, h = o.h || w * 0.62, s = o.s || 40, k = o.k === undefined ? 1 : o.k, ink = o.ink || INK;
  const lx = o.lx === undefined ? -w * 0.66 : o.lx, rx = o.rx === undefined ? w * 0.7 : o.rx;
  ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(8,2,16,0.5)'; ctx.beginPath(); ctx.ellipse(0, 6, w * 1.12, 14 + w * 0.05, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.scale(1, 0.4 + 0.6 * k);
  const back = () => { ctx.beginPath(); ctx.moveTo(-w, 4); ctx.quadraticCurveTo(-w * 1.02, -h * 0.4, -w * 0.7, -h * 0.62); ctx.quadraticCurveTo(-w * 0.42, -h * 0.98, -w * 0.06, -h * 0.9); ctx.quadraticCurveTo(w * 0.3, -h * 1.04, w * 0.56, -h * 0.7); ctx.quadraticCurveTo(w * 0.96, -h * 0.46, w * 1.03, 4); ctx.quadraticCurveTo(0, h * 0.2, -w, 4); ctx.closePath(); };
  const front = () => { ctx.beginPath(); ctx.moveTo(-w * 0.94, 7); ctx.quadraticCurveTo(-w * 0.78, -h * 0.5, -w * 0.3, -h * 0.5); ctx.quadraticCurveTo(w * 0.16, -h * 0.58, w * 0.58, -h * 0.34); ctx.quadraticCurveTo(w * 0.94, -h * 0.18, w * 0.98, 7); ctx.quadraticCurveTo(0, h * 0.22, -w * 0.94, 7); ctx.closePath(); };
  let gr = ctx.createLinearGradient(0, -h, 0, 8); gr.addColorStop(0, '#5c2e9a'); gr.addColorStop(1, '#26104c');
  back(); ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = 3.6; ctx.strokeStyle = ink; ctx.stroke();
  // the black feather collar, lying in a loop on top of the heap
  const cx = w * 0.06, cy = -h * 0.8, crx = w * 0.34, cry = h * 0.17, cw = Math.max(8, h * 0.13);
  const ring = () => { ctx.beginPath(); ctx.ellipse(cx, cy, crx, cry, -0.06, 0, TAU); };
  ring(); ctx.lineWidth = cw + 5; ctx.strokeStyle = ink; ctx.stroke(); ring(); ctx.lineWidth = cw; ctx.strokeStyle = '#1c1624'; ctx.stroke();
  ctx.lineWidth = 1.6; ctx.beginPath();   // (feathers: short slanted barbs along the loop, both edges)
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * TAU, ex = cx + Math.cos(a) * crx, ey = cy + Math.sin(a) * cry, nx = Math.cos(a), ny = Math.sin(a) * crx / cry * 0.5, nl = Math.hypot(nx, ny) || 1;
    for (const side of [-1, 1]) { const l = cw * (0.55 + 0.35 * Math.sin(i * 2.7 + side) ** 2), bx = ex + side * nx / nl * cw * 0.35, by = ey + side * ny / nl * cw * 0.35; ctx.moveTo(bx, by); ctx.lineTo(bx + side * nx / nl * l - ny / nl * l * 0.5, by + side * ny / nl * l + nx / nl * l * 0.5); }
  }
  ctx.strokeStyle = '#120c18'; ctx.stroke();
  ctx.strokeStyle = 'rgba(150,140,170,0.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(cx, cy - cw * 0.2, crx, cry, -0.06, Math.PI * 1.1, Math.PI * 1.75); ctx.stroke();   // (a cool sheen along its top)
  // the near fold, draped across the front
  gr = ctx.createLinearGradient(0, -h * 0.6, 0, 8); gr.addColorStop(0, '#6a38ac'); gr.addColorStop(0.5, '#47228a'); gr.addColorStop(1, '#2c1258');
  front(); ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = 3.4; ctx.strokeStyle = ink; ctx.stroke();
  ctx.save(); back(); ctx.clip(); mottle(ctx, -w * 1.1, -h * 1.1, w * 2.2, h * 1.4, 0.45, 0.8);
  ctx.strokeStyle = 'rgba(14,4,30,0.55)'; ctx.lineWidth = 2.6; ctx.beginPath();   // (folds)
  ctx.moveTo(-w * 0.62, -h * 0.2); ctx.quadraticCurveTo(-w * 0.4, -h * 0.36, -w * 0.18, -h * 0.26); ctx.moveTo(w * 0.12, -h * 0.14); ctx.quadraticCurveTo(w * 0.36, -h * 0.3, w * 0.62, -h * 0.12);
  ctx.moveTo(-w * 0.5, -h * 0.6); ctx.quadraticCurveTo(-w * 0.34, -h * 0.74, -w * 0.18, -h * 0.66); ctx.moveTo(w * 0.42, -h * 0.66); ctx.quadraticCurveTo(w * 0.6, -h * 0.56, w * 0.74, -h * 0.4); ctx.stroke();
  ctx.strokeStyle = rgba(MAG, 0.78); ctx.lineWidth = 4.2; ctx.beginPath();   // (the robe's magenta swirls, curling)
  for (const [sx0, sy0, sw, fl] of [[-0.78, -0.12, 0.3, 1], [-0.3, -0.42, 0.26, -1], [0.2, -0.3, 0.3, 1], [0.66, -0.2, 0.22, -1], [-0.6, -0.68, 0.2, 1], [0.44, -0.74, 0.18, -1]]) {
    const ax = w * sx0, ay = h * sy0, L = w * sw; ctx.moveTo(ax, ay); ctx.bezierCurveTo(ax + L * 0.4, ay - h * 0.14, ax + L * 0.8, ay - h * 0.1, ax + L, ay + h * 0.02);
    { const r = L * 0.13, a0 = fl > 0 ? 0 : Math.PI; ctx.arc(ax + L - fl * r, ay + h * 0.02, r, a0, a0 - fl * Math.PI * 1.4, fl > 0); }
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = rgba(MAG, 0.35); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w * 0.68, -h * 0.64); ctx.quadraticCurveTo(-w * 0.42, -h * 0.98, -w * 0.06, -h * 0.9); ctx.stroke();   // (the hall's magenta light on its crown)
  ctx.strokeStyle = '#1a0c2a'; ctx.lineWidth = 1.6; ctx.beginPath(); for (let i = 0; i < 9; i++) { const fx = w * (0.9 + i * 0.022), fy = 2 - i * 1.4; ctx.moveTo(fx, fy); ctx.lineTo(fx + 3, fy + 9); } ctx.stroke();   // (a fringe at the hem)
  ctx.restore();
  // the two halves of the mask, cracked, lying in front of the heap
  for (const [mx, laughing, rot, dy] of [[lx, true, -0.3, -s * 0.78], [rx, false, 0.74, -s * 0.52]]) {
    ctx.fillStyle = 'rgba(8,2,16,0.45)'; ctx.beginPath(); ctx.ellipse(mx + (laughing ? 2 : 4), 8, s * 0.9, s * 0.2, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(mx, 6 + dy); ctx.rotate(rot); maskPiece(ctx, laughing, s, ink); ctx.restore();
  }
  ctx.restore();
}
// the painted King (his pack's 'float' clip, drawing 0: asleep, eyes closed, a gentle smile), feet at the gem's foot (crystal units), tinted by
// the crystal; false when the pack is not resident (the stage's own vector King is drawn instead -- never the code rig)
function paintedKing(ctx) {
  const K = CHARS.king, kp = K && K.ATLAS_SCALE && K.ANIM && K.ANIM.float ? K.ANIM.float(0) : null;
  if (!kp || !(kp.s3d >= 0.5)) return false;
  ctx.save(); ctx.translate(0, 94); K.draw(ctx, kp, { facing: 1, scale: 0.72, t: 0 }); ctx.restore();
  ctx.fillStyle = 'rgba(176,136,240,0.14)'; ctx.fillRect(-50, -66, 100, 170);   // (lighter and wider: his blue robe, the sun and his face read through the glass -- painter 1)
  return true;
}
export function createStage() {
  let warm = 0, shake = 0, door = 0, slot = 0, shine = 0, turn = 0, crystal = 0, cracks = 0, storm = 0.6, story = null, kingIn = 1, mirror = 1, pile = null;
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    setLS('mid');
    // (the small sprites first: a cap never leaves the sky or a glow to be painted live every frame)
    c.sky = makeSprite(SKY_W, SKY_H, 0, 0, Math.min(csFar, 1) * 0.4, (g) => drawPalSky(g));   // (far and soft)
    c.torch = radialSprite(100, 0.5, [[0, 'rgba(255,120,235,0.55)'], [0.4, 'rgba(190,60,220,0.2)'], [1, 'rgba(140,30,200,0)']]);
    c.eye = radialSprite(150, 0.5, [[0, 'rgba(255,90,230,0.95)'], [0.4, 'rgba(200,50,200,0.45)'], [1, 'rgba(150,30,190,0)']]);
    c.ember = radialSprite(40, 1, [[0, 'rgba(255,246,255,1)'], [0.22, 'rgba(255,200,250,0.9)'], [0.55, 'rgba(255,90,230,0.45)'], [1, 'rgba(220,40,200,0)']]);   // (the skull's eyes' hot cores: QAF AF2)
    c.glow = radialSprite(120, 0.5, [[0, 'rgba(255,238,170,1)'], [0.3, 'rgba(255,200,80,0.7)'], [1, 'rgba(255,160,30,0)']]);
    c.crys = radialSprite(260, 0.34, [[0, 'rgba(190,100,255,0.85)'], [0.4, 'rgba(150,60,230,0.35)'], [1, 'rgba(110,30,200,0)']]);
    c.floor = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawFloor(g, xa, xb); });   // (the near layer first: under a cap it keeps its scale)
    c.wall = buildStrip(-10, LEVEL_LEN + 10, 0, GT0 + 30, cs, 1, (g, xa, xb) => {
      setLS('mid');
      if (xa < CORR_X) { drawCliff(g, xa, xb); if (xb > SKULL_X0 - 60 && xa < SKULL_X1 + 60) drawSkull(g); }
      if (xb > CORR_X - 70) drawInterior(g, Math.max(xa, CORR_X - 54), xb);
      if (xa < CORR_X && xb > CORR_X - 90) {   // (a buttress of rough rock where the skull's face meets the palace wall)
        const bx = CORR_X - 60, pts = [bx - 18, 372]; for (let y = 352; y >= -10; y -= 26) pts.push(bx - 14 + hash2(y, 801) * 14, y); pts.push(bx + 22, -10); for (let y = -10; y <= 352; y += 26) pts.push(bx + 14 + hash2(y, 802) * 12, y); pts.push(bx + 20, 372);
        ink(g, (g) => poly(g, pts), '#2a2232', 3, (g) => { mottle(g, bx - 30, -10, 60, 390, 0.6); g.fillStyle = 'rgba(160,140,180,0.18)'; g.fillRect(bx - 20, -10, 12, 390); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx + 8, -10, 16, 390); });
      }
      if (xb > HALL_X - 40) { drawThroneBack(g); drawMirrorFrame(g); }
      drawRafters(g, xa, xb);
    });
    balanceStrips([c.floor, c.wall], cs);
    // the far crags behind the gate's cliff (parallax .3: only the gate's screens show them)
    c.crags = buildStrip(-10, 0.3 * 1500 + W + 40, 40, 360, csFar, 0.3, (g, xa, xb) => {
      setLS('far');
      if (xb > 300 && xa < 840) {   // (far off on its peak: the skull palace, its towers, two eyes glowing -- where the path leads)
        const fx = 566, fy = 156;
        const MTN = [fx - 230, 360, fx - 150, fy + 90, fx - 90, fy + 20, fx - 40, fy - 6, fx + 50, fy - 4, fx + 100, fy + 24, fx + 170, fy + 100, fx + 240, 360];
        ink(g, (g) => poly(g, MTN), '#1a1026', 2.4, (g) => { g.fillStyle = rgba('#5a3a7a', 0.4); g.fillRect(fx - 170, fy - 10, 90, 120); mottle(g, fx - 240, fy - 20, 480, 380, 0.7);
          g.strokeStyle = 'rgba(200,170,240,0.16)'; g.lineWidth = 1.2; for (let q = 0; q < 6; q++) { const yy = fy + 50 + q * 34; g.beginPath(); g.moveTo(fx - 200 + q * 12, yy); g.quadraticCurveTo(fx, yy - 8 + (q % 2) * 6, fx + 200 - q * 10, yy + 4); g.stroke(); } });   // (the mountain: brushed, strata across it)
        g.strokeStyle = 'rgba(214,180,255,0.38)'; g.lineWidth = 1.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(fx - 228, 358); g.lineTo(fx - 150, fy + 92); g.lineTo(fx - 112, fy + 46); g.stroke();   // (the storm's light down its west flank, ending short of the towers)
        for (const [tx, ty] of [[fx - 132, 320], [fx - 70, 280], [fx + 30, 246]]) lightPool(g, tx, ty, 9, 9, '255,90,230', 0.75);   // (torches up the switchback)
        g.fillStyle = '#140a1e'; g.fillRect(fx - 98, fy - 2, 196, 16); g.strokeStyle = '#08040e'; g.lineWidth = 1.6; g.strokeRect(fx - 98, fy - 2, 196, 16);   // (the curtain wall: behind the skull)
        for (let q = 0; q < 14; q++) { g.fillStyle = '#140a1e'; g.fillRect(fx - 98 + q * 14.5, fy - 7, 8, 6); }
        for (const [dx, hh, w2] of [[-112, 52, 10], [-70, 70, 12], [-30, 96, 16], [30, 88, 14], [70, 62, 11], [104, 46, 9]]) {   // (spired towers lit from the west, slits staggered)
          const sp = hh + w2 * 0.9;
          ink(g, (g) => poly(g, [fx + dx - w2, fy + 12, fx + dx - w2, fy - hh + 14, fx + dx - w2 - 3, fy - hh + 14, fx + dx, fy - sp, fx + dx + w2 + 3, fy - hh + 14, fx + dx + w2, fy - hh + 14, fx + dx + w2, fy + 12]), '#140a1e', 2, (g) => { g.fillStyle = 'rgba(150,120,200,0.22)'; g.fillRect(fx + dx - w2, fy - sp, w2 * 0.66, sp + 14); });
          g.fillStyle = 'rgba(255,90,230,0.85)'; const h1 = hash2(dx + 200, 1), h2 = hash2(dx + 200, 2); for (const [sy2, sx3] of [[fy - hh * (0.25 + 0.3 * h1) + 6, (h1 - 0.5) * w2 * 0.6], [fy - hh * (0.6 + 0.25 * h2) + 14, (h2 - 0.5) * w2 * 0.6]]) g.fillRect(fx + dx + sx3 - 1.2, sy2, 2.4, 5);
          g.strokeStyle = 'rgba(214,180,255,0.38)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(fx + dx - w2 + 1, fy + 8); g.lineTo(fx + dx - w2 + 1, fy - hh + 14); g.lineTo(fx + dx, fy - sp + 1); g.stroke();
        }
        ink(g, (g) => { g.beginPath(); g.ellipse(fx, fy - 4, 36, 32, 0, 0, TAU); }, '#3a2c50', 2.2, (g) => { const hg = g.createLinearGradient(fx - 4, 0, fx + 36, 0); hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = hg; g.fillRect(fx - 4, fy - 40, 50, 80); });   // (shaded away from the storm light: a soft turn, no hard split)
        for (const sx2 of [-1, 1]) { g.fillStyle = '#0a0412'; g.beginPath(); g.ellipse(fx + sx2 * 13, fy - 8, 9, 8, 0, 0, TAU); g.fill(); g.fillStyle = rgba(MAG, 0.9); g.beginPath(); g.arc(fx + sx2 * 13, fy - 8, 3.4, 0, TAU); g.fill(); }
        g.fillStyle = '#0a0412'; g.fillRect(fx - 14, fy + 10, 28, 12); g.fillStyle = '#c8bcd8'; for (let k = 0; k < 4; k++) g.fillRect(fx - 12 + k * 7, fy + 10, 5, 5);
        lightPool(g, fx, fy - 8, 60, 30, '255,60,220', 0.25);
        g.strokeStyle = 'rgba(230,200,255,0.45)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(fx, fy - 4, 34, 30, 0, Math.PI * 1.08, Math.PI * 1.55); g.stroke();   // (the storm's light over the skull's crown)
      }
      for (let x = al(xa - 160, 130) - 130; x < xb + 160; x += 130) {
        const i = Math.round(x / 130), cx = x + hash2(i, 51) * 90, hh = 70 + 150 * hash2(i, 52), hw = 26 + 40 * hash2(i, 53);
        spire(g, cx, 352, hw, hh, 300 + i * 7, false);
      }
      vgrad(g, xa - 2, 40, xb - xa + 4, 360, [[0, 'rgba(255,60,200,0)'], [1, 'rgba(255,60,200,0.18)']]);
      g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(120,70,150,0.28)'; g.fillRect(xa - 2, 40, xb - xa + 4, 320); g.restore();   // (the haze of distance)
    });
    return c;
  }

  // ------------------------------------------------------------------ live: the sky and the storm
  // the storm's sky flash (flash safety, the Storm ride's rule): one smooth pulse in some 3.9 s windows -- 3 frames in, ~0.6 s out, no
  // flicker -- and a low peak (the sky's colours move at most ~25 % toward the flash); none with reduced motion
  const flashShape = (t) => { const k = Math.floor(t / 3.9), d = t - k * 3.9; if (REDUCED || hash1(k * 17 + 3) <= 0.5) return 0; return d < 0.05 ? d / 0.05 : Math.exp(-(d - 0.05) * 5); };
  function drawSky(ctx, camX, t) {
    const sh = flashShape(t) * storm, fl = 0.35 * sh;
    const gr = ctx.createLinearGradient(0, 0, 0, 360); gr.addColorStop(0, mix('#0a0420', '#4a2a7a', fl * 0.7)); gr.addColorStop(0.55, mix('#2a0c46', '#8a58b8', fl * 0.6)); gr.addColorStop(1, mix('#6a1c6a', '#c07ae0', fl * 0.5));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 372);
    const C = st.ensure();
    { const off = ((camX * 0.06 + t * 4) % SKY_W + SKY_W) % SKY_W; ctx.save(); for (let x = -off; x < W; x += SKY_W) ctx.drawImage(C.sky.c, x, 0, SKY_W, SKY_H); ctx.restore();
      if (fl > 0.01) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(190,150,255,${0.35 * fl})`; ctx.fillRect(0, 0, W, 372); ctx.restore(); } }   // (the clouds lit by the storm's pulse)
    ctx.save(); ctx.strokeStyle = 'rgba(200,180,240,0.22)'; ctx.lineWidth = 1; ctx.beginPath();   // (rain slanting down the storm)
    for (let i = 0; i < 60; i++) { const y = ((hash1(i * 7) * 400 + t * 520) % 420) - 40, x = ((hash1(i * 11) * (W + 200) - camX * 0.1 - y * 0.3) % (W + 200) + W + 200) % (W + 200) - 100; ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 18); }
    ctx.stroke(); ctx.restore();
    if (sh > 0.3 && camX < 1500) {   // a forked bolt far away behind the crags (a thin line)
      const k = Math.floor(t / 3.9), bx = 120 + hash1(k * 5 + 1) * 700;
      ctx.save(); ctx.globalAlpha = Math.min(1, sh * 1.4); ctx.strokeStyle = '#f2d8ff'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(bx, 0);
      let y = 0, x = bx; for (let i = 0; i < 7; i++) { y += 34 + hash1(k * 11 + i) * 16; x += (hash1(k * 13 + i) - 0.5) * 50; ctx.lineTo(x, y); } ctx.stroke(); ctx.restore();
    }
  }
  // ------------------------------------------------------------------ live: the door in the skull's mouth
  function drawDoor(ctx, sx, t) {
    const aw = DOOR_W / 2, top = DOOR_TOP, bot = DOOR_BOT - 6, k = clamp(door, 0, 1);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(sx - aw, bot); ctx.lineTo(sx - aw, top + 40); ctx.quadraticCurveTo(sx - aw, top, sx, top - 4); ctx.quadraticCurveTo(sx + aw, top, sx + aw, top + 40); ctx.lineTo(sx + aw, bot); ctx.closePath(); ctx.clip();
    // what's behind: the corridor's purple glow, going back
    const gr = ctx.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, '#0a0414'); gr.addColorStop(0.6, '#2a0c3c'); gr.addColorStop(1, '#6a1c7a'); ctx.fillStyle = gr; ctx.fillRect(sx - aw, top - 6, DOOR_W, bot - top + 8);
    if (k > 0.02) {
      ctx.globalAlpha = Math.min(1, k * 1.6); ctx.strokeStyle = 'rgba(180,80,230,0.45)'; ctx.lineWidth = 2;
      for (const s of [-1, 1]) for (let i = 1; i <= 3; i++) { const x = sx + s * (aw * 0.62 - i * 11), y0 = top + 30 + i * 12; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, bot - i * 10); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,120,235,0.35)'; ctx.beginPath(); ctx.ellipse(sx, bot - 20, aw * 0.8, 10, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    // the two leaves: planks, iron straps and hinges; they swing away (narrowing) as the door opens
    const lw = aw * (1 - 0.97 * smooth(k));
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? sx - aw : sx + aw - lw, x1 = s < 0 ? sx - aw + lw : sx + aw;
      if (lw < 2) continue;
      ctx.save(); ctx.beginPath(); ctx.rect(x0, top - 8, x1 - x0, bot - top + 12); ctx.clip();
      const wg = ctx.createLinearGradient(x0, 0, x1, 0); wg.addColorStop(0, s < 0 ? WOODC.base : mix(WOODC.base, '#000000', 0.18)); wg.addColorStop(1, s < 0 ? mix(WOODC.base, '#000000', 0.18) : WOODC.base);
      ctx.fillStyle = wg; ctx.fillRect(x0, top - 8, x1 - x0, bot - top + 12);
      const n = Math.max(2, Math.round(lw / 18));
      for (let i = 0; i < n; i++) { const px0 = x0 + i * (x1 - x0) / n, pw2 = (x1 - x0) / n; ctx.fillStyle = `rgba(${hash1(i * 7 + (s > 0 ? 3 : 1)) > 0.5 ? '255,220,180' : '0,0,0'},${0.04 + 0.1 * hash1(i * 13 + s)})`; ctx.fillRect(px0, top - 8, pw2, bot - top + 12);
        ctx.strokeStyle = 'rgba(40,20,10,0.35)'; ctx.lineWidth = 1; for (let q = 0; q < 2; q++) { const gx = px0 + pw2 * (0.3 + 0.4 * q); ctx.beginPath(); ctx.moveTo(gx, top); ctx.bezierCurveTo(gx + 3, top + 80, gx - 3, bot - 80, gx + 1, bot); ctx.stroke(); } }   // (each plank its own tone, its grain)
      ctx.strokeStyle = rgba(WOODC.seam, 0.8); ctx.lineWidth = 2; for (let i = 1; i < n; i++) { const x = x0 + i * (x1 - x0) / n; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke(); }
      ctx.fillStyle = rgba(WOODC.hi, 0.3); ctx.fillRect(s < 0 ? x0 : x1 - 7, top - 8, 7, bot - top + 12);
      for (const yy of [top + 46, top + 108, bot - 30]) { ctx.fillStyle = '#2e2832'; ctx.fillRect(x0, yy, x1 - x0, 15); ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(x0, yy, x1 - x0, 3.4); ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.strokeRect(x0, yy, x1 - x0, 15); for (let rx = x0 + 8; rx < x1 - 4; rx += 20) { ctx.fillStyle = '#8a8090'; ctx.beginPath(); ctx.arc(rx, yy + 7.5, 2.2, 0, TAU); ctx.fill(); } }
      ctx.strokeStyle = LINE; ctx.lineWidth = 4; ctx.strokeRect(x0, top - 8, x1 - x0, bot - top + 12);
      ctx.restore();
    }
    ctx.restore();
    // the sun slot: a round recess at the doors' heart (it splits with them as they open) -- empty, or filled by the Sun Key
    if (k < 0.5) {
      const cy = DOOR_BOT - SLOT_DY, a = 1 - k * 2;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(sx, cy);
      // the SUN carved into the door: long gold rays all round the slot (so the round hole reads as a sun, not a porthole), a slow pulse
      { const pu = 0.5 + 0.5 * Math.sin(t * 2.2);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * (0.12 + 0.1 * pu); const sg = ctx.createRadialGradient(0, 0, 30, 0, 0, 100); sg.addColorStop(0, 'rgba(255,214,110,0.9)'); sg.addColorStop(1, 'rgba(255,170,60,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, 100, 0, TAU); ctx.fill(); ctx.restore();
        ctx.lineJoin = 'round';
        for (let i = 0; i < 12; i++) {
          const an = i * TAU / 12, L = i % 2 ? 66 : 88 + 3 * pu, wd = i % 2 ? 0.17 : 0.13;
          ctx.fillStyle = i % 2 ? GOLD.base : GOLD.hi; ctx.strokeStyle = INK; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(Math.cos(an - wd) * 43, Math.sin(an - wd) * 43); ctx.lineTo(Math.cos(an) * L, Math.sin(an) * L); ctx.lineTo(Math.cos(an + wd) * 43, Math.sin(an + wd) * 43); ctx.closePath(); ctx.fill(); ctx.stroke();
        } }
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4a3a2a'; ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill();
      ctx.strokeStyle = GOLD.base; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 38, 0, TAU); ctx.stroke(); ctx.strokeStyle = GOLD.sh; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, 41, 0, TAU); ctx.stroke();
      if (slot < 0.5) {   // empty: a deep round hollow with carved rays, a pulse of gold to say "here"
        ctx.fillStyle = '#0c0610'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
        ctx.fillStyle = GOLD.sh; for (let i = 0; i < 12; i++) { const an = i * TAU / 12; ctx.beginPath(); ctx.moveTo(Math.cos(an - 0.14) * 33, Math.sin(an - 0.14) * 33); ctx.lineTo(Math.cos(an) * 39.4, Math.sin(an) * 39.4); ctx.lineTo(Math.cos(an + 0.14) * 33, Math.sin(an + 0.14) * 33); ctx.closePath(); ctx.fill(); }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 3); ctx.strokeStyle = '#ffd860'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke(); ctx.restore();
      } else {   // the Sun Key sits in it: a round gold disc with rays, turning a little
        ctx.rotate(turn * 0.5); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 36, 0, TAU); ctx.fill();
        const kg = ctx.createRadialGradient(-8, -8, 4, 0, 0, 34); kg.addColorStop(0, GOLD.hi); kg.addColorStop(1, GOLD.base); ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(0, 0, 33, 0, TAU); ctx.fill();
        ctx.fillStyle = GOLD.base; ctx.strokeStyle = INK; ctx.lineWidth = 2; for (let i = 0; i < 12; i++) { const an = i * TAU / 12; ctx.beginPath(); ctx.moveTo(Math.cos(an - 0.15) * 31, Math.sin(an - 0.15) * 31); ctx.lineTo(Math.cos(an) * 40, Math.sin(an) * 40); ctx.lineTo(Math.cos(an + 0.15) * 31, Math.sin(an + 0.15) * 31); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        ctx.strokeStyle = GOLD.sh; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.stroke(); ctx.fillStyle = GOLD.hi; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    // the key's light: gold beams out of the cracks round the slot, then the whole doorway
    if (shine > 0.01 && slot > 0.5) {
      const C = st.ensure(), cy = DOOR_BOT - SLOT_DY;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, shine); ctx.drawImage(C.glow.c, sx - 150, cy - 150, 300, 300);
      ctx.strokeStyle = 'rgba(255,226,130,0.8)'; ctx.lineWidth = 3;
      for (let i = 0; i < 14; i++) { const an = i * TAU / 14 + 0.2, L = 60 + 120 * shine * (0.6 + 0.4 * Math.sin(t * 6 + i)); ctx.beginPath(); ctx.moveTo(sx + Math.cos(an) * 40, cy + Math.sin(an) * 40); ctx.lineTo(sx + Math.cos(an) * (40 + L), cy + Math.sin(an) * (40 + L)); ctx.stroke(); }
      ctx.restore();
    }
  }
  // ------------------------------------------------------------------ live: the crystal over the throne, the King inside it
  function crystalPool(ctx, sx, t) {   // the crystal's violet light pooled on the floor under it (a soft radial falloff: never a hard ring)
    if (crystal >= 2 || sx < -220 || sx > W + 220) return;
    const burst = clamp(crystal - 1, 0, 1), pulse = 0.8 + 0.2 * Math.sin(t * 2.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - burst) * 0.9; void pulse; ctx.translate(sx, 446); ctx.scale(1, 0.19); { const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, 140); pg.addColorStop(0, 'rgba(170,90,255,0.42)'); pg.addColorStop(0.45, 'rgba(160,80,255,0.24)'); pg.addColorStop(1, 'rgba(150,60,255,0)'); ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(0, 0, 140, 0, TAU); ctx.fill(); } ctx.restore();   // (and pooled on the floor below)
  }
  function drawCrystal(ctx, sx, t) {
    const burst = clamp(crystal - 1, 0, 1), crk = clamp(crystal, 0, 1), cy = CRYSTAL_Y;
    const C = st.ensure(), pulse = 0.8 + 0.2 * Math.sin(t * 2.4);
    if (crystal > 1) {   // the burst: a column of warm light and golden sparkles drifting down
      const a = 0.28 + 0.72 * Math.sin(Math.PI * clamp(crystal - 1, 0, 1)) * 0.9 + (crystal >= 2 ? 0.1 : 0);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const cg = ctx.createLinearGradient(sx - 90, 0, sx + 90, 0); cg.addColorStop(0, 'rgba(255,226,140,0)'); cg.addColorStop(0.5, `rgba(255,232,160,${0.5 * a})`); cg.addColorStop(1, 'rgba(255,226,140,0)');
      ctx.fillStyle = cg; ctx.fillRect(sx - 90, cy - 90, 180, 480);
      for (let i = 0; i < 44; i++) { const u = ((t * 0.35 + hash1(i * 5 + 1)) % 1), x = sx + (hash1(i * 5 + 2) - 0.5) * 150 * (0.4 + u), y = cy - 40 + u * 380; ctx.globalAlpha = a * (1 - u * 0.6); ctx.fillStyle = '#fff0b0'; ctx.beginPath(); ctx.arc(x, y, 1.6 + 2.2 * hash1(i * 5 + 3), 0, TAU); ctx.fill(); }
      ctx.restore();
      if (crystal >= 2) return;
    }
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.45 * (1 - burst) * pulse; ctx.drawImage(C.crys.c, sx - 320, cy - 260, 640, 520); ctx.restore();   // (its violet light on the wall)
    // (its light pooled on the floor: crystalPool, after the floor)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.7 + 0.2 * pulse) * (1 - burst); ctx.drawImage(C.crys.c, sx - 220, cy - 220, 440, 440); ctx.restore();
    if (burst >= 1) return;
    ctx.save(); ctx.globalAlpha = 1 - burst; ctx.translate(sx, cy); ctx.scale(0.78, 0.78);
    // the chains up to the rafters
    for (const dx of [-30, 30]) {   // (two chains of iron links up into the rafters)
      const x0 = dx * 0.5, y0 = (-cy - 2) / 0.78, x1 = dx, y1 = -116, n = Math.round((y1 - y0) / 11);
      for (let q = 0; q < n; q++) { const u = (q + 0.5) / n, lx = lerp(x0, x1, u), ly = lerp(y0, y1, u); ctx.strokeStyle = LINE; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.ellipse(lx, ly, q % 2 ? 2.4 : 4.4, 6.4, 0, 0, TAU); ctx.stroke(); ctx.strokeStyle = '#7a7080'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    // the crystal: a tall faceted gem, pointed at both ends
    const sh = [[0, -128], [44, -86], [56, 0], [44, 92], [0, 138], [-44, 92], [-56, 0], [-44, -86]];
    const path = (g) => { g.beginPath(); g.moveTo(sh[0][0], sh[0][1]); for (let i = 1; i < sh.length; i++) g.lineTo(sh[i][0], sh[i][1]); g.closePath(); };
    path(ctx); const gr = ctx.createLinearGradient(-56, -128, 56, 138); gr.addColorStop(0, '#d8b0ff'); gr.addColorStop(0.5, '#9a58e8'); gr.addColorStop(1, '#5a2aa0'); ctx.fillStyle = gr; ctx.fill();
    { const cg = ctx.createRadialGradient(0, 0, 4, 0, 0, 70); cg.addColorStop(0, 'rgba(255,230,255,0.55)'); cg.addColorStop(1, 'rgba(255,230,255,0)'); ctx.fillStyle = cg; ctx.fillRect(-60, -130, 120, 270); }   // (its glowing core)
    ctx.save(); path(ctx); ctx.clip();
    // the King within (the book's): a red beard, a gold crown, a blue robe with a gold sun, a light blue sash; smiling, eyes closed, asleep --
    // the painted pack's 'float' when it is resident, else drawn here
    if (kingIn && !paintedKing(ctx)) {
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const robe = (c) => { c.beginPath(); c.moveTo(-22, -6); c.quadraticCurveTo(-34, 50, -28, 98); c.lineTo(28, 98); c.quadraticCurveTo(34, 50, 22, -6); c.quadraticCurveTo(0, -12, -22, -6); c.closePath(); };
      robe(ctx); ctx.fillStyle = '#3a5a9a'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = '#141028'; ctx.stroke();
      ctx.strokeStyle = 'rgba(20,20,50,0.5)'; ctx.lineWidth = 1.4; for (const fx of [-12, 2, 14]) { ctx.beginPath(); ctx.moveTo(fx, 46); ctx.quadraticCurveTo(fx * 1.3, 70, fx * 1.5, 96); ctx.stroke(); }   // (robe folds)
      ctx.fillStyle = '#7ab0e0'; ctx.beginPath(); ctx.moveTo(-28, 36); ctx.lineTo(28, 36); ctx.lineTo(27, 46); ctx.lineTo(-27, 46); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillRect(10, 44, 7, 22);   // (the sash, its end hanging)
      for (let q = 0; q < 10; q++) { const an = q * TAU / 10; ctx.strokeStyle = '#e8b43a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 6, 16 + Math.sin(an) * 6); ctx.lineTo(Math.cos(an) * 10, 16 + Math.sin(an) * 10); ctx.stroke(); }
      ctx.fillStyle = '#ffd860'; ctx.beginPath(); ctx.arc(0, 16, 5.6, 0, TAU); ctx.fill();   // (the gold sun)
      for (const hx of [-30, 30]) { ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.ellipse(hx, 70, 5, 6, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#141028'; ctx.lineWidth = 1.4; ctx.stroke(); }   // (hands)
      ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.ellipse(0, -26, 13, 15, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#141028'; ctx.lineWidth = 2; ctx.stroke();   // (the face)
      ctx.fillStyle = '#b04a20'; ctx.beginPath(); ctx.moveTo(-13, -28); ctx.quadraticCurveTo(-16, -6, 0, 2); ctx.quadraticCurveTo(16, -6, 13, -28); ctx.quadraticCurveTo(8, -16, 0, -16); ctx.quadraticCurveTo(-8, -16, -13, -28); ctx.closePath(); ctx.fill(); ctx.stroke();   // (the red beard)
      ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 1.6; for (const ex of [-5, 5]) { ctx.beginPath(); ctx.arc(ex, -28, 3, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }   // (closed eyes, smiling)
      ctx.strokeStyle = '#6a2418'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, -23.5, 4, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();   // (his smile)
      ctx.fillStyle = '#e8b43a'; ctx.beginPath(); ctx.moveTo(-14, -38); ctx.lineTo(-16, -56); ctx.lineTo(-7, -46); ctx.lineTo(0, -60); ctx.lineTo(7, -46); ctx.lineTo(16, -56); ctx.lineTo(14, -38); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#141028'; ctx.lineWidth = 1.8; ctx.stroke();   // (the crown)
      ctx.fillStyle = 'rgba(150,70,230,0.28)'; ctx.fillRect(-40, -64, 80, 166);   // (seen through violet crystal)
      ctx.restore();
    }
    // refraction bands across the crystal
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(-56, -30); ctx.lineTo(56, -60); ctx.lineTo(56, -44); ctx.lineTo(-56, -14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(60,20,120,0.18)'; ctx.beginPath(); ctx.moveTo(-56, 40); ctx.lineTo(56, 18); ctx.lineTo(56, 40); ctx.lineTo(-56, 62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(40,10,90,0.25)'; ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(56, 0); ctx.lineTo(44, 92); ctx.lineTo(0, 138); ctx.closePath(); ctx.fill();   // (the facet away from the light)
    // facets
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -128); ctx.lineTo(-14, 0); ctx.lineTo(0, 138); ctx.moveTo(0, -128); ctx.lineTo(22, 0); ctx.lineTo(0, 138); ctx.moveTo(-56, 0); ctx.lineTo(-14, 0); ctx.moveTo(56, 0); ctx.lineTo(22, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.moveTo(-44, -86); ctx.lineTo(-14, -60); ctx.lineTo(-14, 0); ctx.lineTo(-56, 0); ctx.closePath(); ctx.fill();
    // the cracks of golden light (the finale): they grow from the middle
    if (crk > 0.01) {
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,226,130,${0.5 + 0.5 * crk})`; ctx.lineWidth = 3.4; ctx.lineJoin = 'round';
      const R = mulberry(77);
      for (let i = 0; i < 9; i++) { const an = i * TAU / 9 + 0.3, L = 120 * crk * (0.6 + 0.4 * R()); ctx.beginPath(); ctx.moveTo(0, 0); let x = 0, y = 0; for (let j = 1; j <= 5; j++) { x += Math.cos(an + (R() - 0.5) * 0.9) * L / 5; y += Math.sin(an + (R() - 0.5) * 0.9) * L / 5; ctx.lineTo(x, y); } ctx.stroke(); }
      ctx.fillStyle = `rgba(255,236,170,${0.35 * crk})`; ctx.fillRect(-60, -130, 120, 270);
    }
    ctx.restore();
    ctx.lineJoin = 'round'; ctx.strokeStyle = LINE; ctx.lineWidth = 5; path(ctx); ctx.stroke();
    ctx.strokeStyle = 'rgba(240,210,255,0.65)'; ctx.lineWidth = 1.8; path(ctx); ctx.stroke();
    ctx.restore();
    if (crystal > 1) { /* (the burst's sparkles are the fight's: src/sipalace.js KingFloat) */ }
  }
  // ------------------------------------------------------------------ live: the mirror's smoke
  function drawMirrorSmoke(ctx, sx, t) {
    const cy = 296 - 150;
    ctx.save(); ctx.beginPath(); ctx.ellipse(sx, cy, 50, 72, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = '#0c0614'; ctx.fillRect(sx - 52, cy - 74, 104, 148);
    for (let i = 0; i < 6; i++) {
      const u = t * 0.25 + i / 6, a = u * TAU, x = sx + Math.cos(a) * 20 * (0.5 + 0.5 * Math.sin(i + t * 0.4)), y = cy + Math.sin(a * 1.3) * 34;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 34); gr.addColorStop(0, i % 2 ? 'rgba(130,60,190,0.55)' : 'rgba(40,20,70,0.7)'); gr.addColorStop(1, 'rgba(20,10,40,0)'); ctx.fillStyle = gr; ctx.fillRect(x - 36, y - 36, 72, 72);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.ellipse(sx - 24, cy - 34, 10, 30, 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save();
    if (shake > 0.01) ctx.translate(Math.sin(t * 61) * shake * 3, Math.cos(t * 47) * shake * 2);
    ctx.fillStyle = '#0a0412'; ctx.fillRect(0, 0, W, H);
    drawSky(ctx, camX, t);
    if (camX < 1500) drawStrip(ctx, C.crags, camX, s);
    SEE_THROUGH = (g) => drawSky(g, camX, t); drawStrip(ctx, C.wall, camX, s); SEE_THROUGH = null;
    // the skull's eyes: magenta fire in the sockets
    for (const sg of [-1, 1]) {
      const ex = DOOR_X + sg * 160 - camX, ey = SK_Y - 300;
      if (ex < -200 || ex > W + 200) continue;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75 + 0.2 * Math.sin(t * 3 + sg);
      ctx.drawImage(C.eye.c, ex - 96, ey - 74, 192, 148); { const f = 1 + 0.08 * Math.sin(t * 7.3 + sg * 2) * Math.sin(t * 3.1); ctx.globalAlpha = 0.8 + 0.15 * Math.sin(t * 5 + sg); ctx.drawImage(C.ember.c, ex - 34 * f, ey + 6 - 22 * f, 68 * f, 44 * f); } ctx.restore();
    }
    // the wooden door in the skull's mouth, with the Sun Key's slot
    const dsx = DOOR_X - camX;
    if (dsx > -140 && dsx < W + 140) drawDoor(ctx, dsx, t);
    // the throne room's glow, the mirror's smoke, the crystal
    if (camX + W > HALL_X + 300) {
      const tx = THRONE_X - camX, gl = 0.6 + 0.2 * Math.sin(t * 2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = gl * 0.3; ctx.drawImage(C.eye.c, tx - 260, 176 - 190, 520, 380); ctx.restore();
      if (mirror) drawMirrorSmoke(ctx, MIRROR_X - camX, t);
      drawCrystal(ctx, CRYSTAL_X - camX, t);
    }
    // the chandeliers: iron rings of candles hung on chains from the vault, swaying a little
    for (const [ci, cxw] of CHANDELIERS.entries()) {
      const sx = cxw - camX; if (sx < -120 || sx > W + 120) continue;
      const sw = Math.sin(t * 0.8 + ci * 1.9) * 0.05, L = 74, rx = sx + Math.sin(sw) * L, ry = 8 + Math.cos(sw) * L;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.08 * Math.sin(t * 7 + ci); ctx.drawImage(C.torch.c, rx - 90, ry - 70, 180, 150); ctx.restore();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(sx, -4); ctx.lineTo(rx, ry - 14); ctx.stroke();
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(rx, ry - 14); ctx.lineTo(rx + d * 34, ry); ctx.stroke(); }
      ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(rx, ry, 36, 8, 0, 0, TAU); ctx.stroke(); ctx.strokeStyle = '#4a4050'; ctx.lineWidth = 3; ctx.stroke();
      for (let k = 0; k < 6; k++) {
        const an = (k / 6) * TAU, cx2 = rx + Math.cos(an) * 34, cy2 = ry + Math.sin(an) * 7; if (Math.sin(an) < -0.2) continue;
        ctx.fillStyle = '#e6d8c0'; ctx.fillRect(cx2 - 2.4, cy2 - 10, 4.8, 10); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.strokeRect(cx2 - 2.4, cy2 - 10, 4.8, 10);
        const fh = 7 + 1.5 * Math.sin(t * 13 + k * 2 + ci); ctx.fillStyle = '#ff7ae8'; ctx.beginPath(); ctx.moveTo(cx2 - 2.4, cy2 - 10); ctx.quadraticCurveTo(cx2, cy2 - 10 - fh * 1.4, cx2 + 2.4, cy2 - 10); ctx.closePath(); ctx.fill();
      }
    }
    // torches: magenta flames and their glow (live)
    for (const tc of LAY.torches) {
      const sx = tc.x - camX; if (sx < -80 || sx > W + 80) continue;
      const fl = Math.sin(t * 11 + tc.ph) * 2.2, h = 28 + 5 * Math.sin(t * 13 + tc.ph * 2), y = tc.y;
      if (tc.pole) { ctx.fillStyle = INK; ctx.fillRect(sx - 4, y, 8, 96); ctx.fillStyle = '#3a3040'; ctx.fillRect(sx - 2.4, y, 4.8, 96); ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(sx, y + 2, 15, 7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#4a4050'; ctx.beginPath(); ctx.ellipse(sx, y + 2, 12, 5, 0, 0, TAU); ctx.fill(); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 9 + tc.ph); ctx.drawImage(C.torch.c, sx - 100, y - 130, 200, 200); ctx.restore();
      ctx.beginPath(); ctx.moveTo(sx - 10, y - 4); ctx.quadraticCurveTo(sx - 13, y - 4 - h * 0.5, sx + fl, y - 4 - h); ctx.quadraticCurveTo(sx + 13, y - 4 - h * 0.5, sx + 10, y - 4); ctx.closePath();
      ctx.fillStyle = '#c63ad8'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 5, y - 4); ctx.quadraticCurveTo(sx - 6, y - 4 - h * 0.35, sx + fl * 0.6, y - 4 - h * 0.66); ctx.quadraticCurveTo(sx + 6, y - 4 - h * 0.35, sx + 5, y - 4); ctx.closePath(); ctx.fillStyle = '#ffb4f4'; ctx.fill();
    }
    drawStrip(ctx, C.floor, camX, s);
    if (camX + W > HALL_X + 300) crystalPool(ctx, CRYSTAL_X - camX, t);
    // the sigil and the carpet's glow on the floor, drifting violet sparks
    if (story && camX + W > HALL_X + 200) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.16 + 0.07 * Math.sin(t * 2.2); ctx.fillStyle = rgba(MAG, 1); ctx.beginPath(); ctx.ellipse(4930 - camX, 438, 250, 76, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    if (pile !== null) drawPile(ctx, pile - camX, 484);
    if (cracks > 0.01) {   // the walls crack with golden light, up to the ceiling (the finale)
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const R = mulberry(311);
      for (let i = 0; i < 9; i++) {
        const bx = camX + 60 + R() * (W - 120), len = 340 * cracks * (0.7 + 0.3 * R());
        ctx.strokeStyle = `rgba(255,226,130,${0.5 + 0.4 * Math.sin(t * 5 + i)})`; ctx.lineWidth = 3 + 2 * R(); ctx.beginPath(); let x = bx - camX, y = 350; ctx.moveTo(x, y);
        for (let j = 0; j < 9; j++) { y -= len / 9; x += (R() - 0.5) * 26; ctx.lineTo(x, y); } ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save(); ctx.fillStyle = 'rgba(230,170,255,0.55)';
    for (const m of LAY.sparks) {
      const x = ((m.x - camX * 0.9 + Math.sin(t * 0.6 + m.ph) * m.sx) % 1300 + 1300) % 1300 - 170, y = m.y - ((t * 14 * m.sp + m.ph * 40) % 280) + 140;
      if (x < 0 || x > W || y < 30 || y > 420) continue;
      ctx.globalAlpha = 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + m.ph)); ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
    const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.45, W / 2, H * 0.5, W * 0.72); vg.addColorStop(0, 'rgba(6,2,12,0)'); vg.addColorStop(1, 'rgba(6,2,12,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (warm > 0.01) { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,200,130,${0.14 * warm})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
  }
  // what is left of Malachar (a story's: bg.pile = the world x; si_palace_end puts the pufferfish at pile + 62, between the halves)
  function drawPile(ctx, sx, sy) { drawRobePile(ctx, sx + 60, sy, { w: 136, h: 108, s: 41, lx: -98, rx: 90 }); }
  function drawFront(ctx, camX, t = 0) { void ctx; void camX; void t; }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(4,2,10,0.4)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  function setShake(k) { shake = clamp(+k || 0, 0, 3); }
  /** the doors (0 shut .. 1 wide open) */
  function setDoor(k) { door = clamp(+k || 0, 0, 1); }
  /** the Sun Key in its slot (0 empty .. 1 in), its shine (0..1) and its turn (0..1) */
  function setSlot(k, sh = 0, tn = 0) { slot = +k || 0; shine = clamp(+sh || 0, 0, 1); turn = +tn || 0; }
  /** the crystal over the throne: 0 whole .. 1 cracked through .. 2 burst and gone */
  function setCrystal(k, king = 1) { crystal = clamp(+k || 0, 0, 2); kingIn = king ? 1 : 0; }
  /** golden cracks up the walls (0..1: the finale's rumble) */
  function setCracks(k) { cracks = clamp(+k || 0, 0, 1); }
  function setStorm(k) { storm = clamp(+k || 0, 0, 1.4); }
  function setStory(bg) {
    story = bg; door = bg && bg.door !== undefined ? clamp(bg.door, 0, 1) : 0; slot = bg && bg.slot ? bg.slot : 0; shine = bg && bg.shine ? bg.shine : 0; turn = bg && bg.turn ? bg.turn : 0;
    crystal = bg && bg.crystal !== undefined ? bg.crystal : 0; kingIn = bg && bg.king === 0 ? 0 : 1; cracks = bg && bg.cracks ? bg.cracks : 0; mirror = bg && bg.mirror === 0 ? 0 : 1; pile = bg && bg.pile !== undefined ? bg.pile : null;
  }
  return { setScale: st.setScale, setWarm, setShake, setDoor, setSlot, setCrystal, setCracks, setStorm, setStory, robePile: drawRobePile, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; }, get story() { return story; }, get __caches() { return st.C; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  vase:   { w: 44, h: 70, colors: ['#4a2a6a', '#2a1646', '#a060d8', '#ff7ae8'] },
  candle: { w: 40, h: 96, colors: ['#3a3040', '#241c2c', '#7a6a80', '#ff9af0'] },
  crate:  { w: 58, h: 52, colors: ['#6a4a2a', '#43301c', '#9a7448', '#b040d0'] },
};
const PROP_DRAW = {
  vase(g) {   // a tall violet urn with a magenta swirl and a gold rim
    ink(g, (g) => { g.beginPath(); g.moveTo(-10, -68); g.quadraticCurveTo(-12, -58, -20, -44); g.quadraticCurveTo(-30, -18, -14, 0); g.lineTo(14, 0); g.quadraticCurveTo(30, -18, 20, -44); g.quadraticCurveTo(12, -58, 10, -68); g.closePath(); }, '#4a2a6a', 2.8, (g) => {
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(-28, -70, 12, 72); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(6, -70, 26, 72);
      g.strokeStyle = MAG; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-14, -34); g.bezierCurveTo(-4, -50, 12, -44, 8, -30); g.bezierCurveTo(4, -18, -8, -22, -2, -30); g.stroke();
      g.fillStyle = GOLD.base; g.fillRect(-30, -22, 60, 4);
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -68, 12, 4, 0, 0, TAU); }, GOLD.base, 2.2);
  },
  candle(g) {   // an iron candelabra with three purple flames (they are painted: nothing burns)
    ink(g, (g) => { g.beginPath(); g.moveTo(-14, 0); g.lineTo(-6, -10); g.lineTo(-3, -62); g.lineTo(3, -62); g.lineTo(6, -10); g.lineTo(14, 0); g.closePath(); }, '#3a3040', 2.8, (g) => { g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(-14, -64, 8, 66); });
    ink(g, (g) => { g.beginPath(); g.moveTo(-20, -60); g.quadraticCurveTo(0, -48, 20, -60); g.lineTo(18, -64); g.quadraticCurveTo(0, -54, -18, -64); g.closePath(); }, '#3a3040', 2.4);
    for (const x of [-18, 0, 18]) {
      ink(g, (g) => { g.beginPath(); g.rect(x - 3.4, -76, 6.8, 14); }, '#e8dcc8', 2);
      g.fillStyle = '#c63ad8'; g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x - 4, -76); g.quadraticCurveTo(x - 5, -86, x, -94); g.quadraticCurveTo(x + 5, -86, x + 4, -76); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ffb4f4'; g.beginPath(); g.moveTo(x - 1.8, -77); g.quadraticCurveTo(x - 2, -83, x, -87); g.quadraticCurveTo(x + 2, -83, x + 1.8, -77); g.closePath(); g.fill();
    }
  },
  crate(g) {   // a palace supply crate, iron-banded, with a purple wax seal
    ink(g, (g) => { g.beginPath(); g.rect(-27, -50, 54, 50); }, '#6a4a2a', 2.8, (g) => {
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(-27, -50, 12, 50); g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(10, -50, 20, 50);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.4; for (const y of [-34, -17]) { g.beginPath(); g.moveTo(-27, y); g.lineTo(27, y); g.stroke(); }
      g.fillStyle = '#4a4050'; g.fillRect(-27, -50, 6, 50); g.fillRect(21, -50, 6, 50); g.fillRect(-27, -48, 54, 5); g.fillRect(-27, -6, 54, 5);
    });
    g.fillStyle = '#b040d0'; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(0, -26, 8, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#ffb4f4'; g.beginPath(); g.arc(-2.4, -28, 2.4, 0, TAU); g.fill();
  },
};
