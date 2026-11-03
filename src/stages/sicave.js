// Dodongo's Quest - Skull Island stage 3a "THE CAVE OF RAGE" (src/stages/sicave.js): background, floor, the lava, the rope bridge, the pedestal.
//
// The book's chapter five (docs/SKULL_ISLAND.md): a cave shaped like a MOUTH -- fangs of stalactite overhead, daylight and jungle green
// behind, the orange glow of fire ahead -- then a volcanic cavern with a river of lava behind its basalt columns, and last the long rope
// bridge over a lava chasm to a stone pedestal where a wedge of the Sun Key waits.  Three sections (world x):
//   mouth 0-1400 (gravel floor, a rock wall, big stalactite fangs overhead and pale fangs rising behind the floor, jungle light at the left)  |
//   cavern 1400-3800 (black basalt plates with lava glowing in the cracks, rock walls veined with lava ending in a ragged shore above the
//   lava river, basalt columns and stalagmites, lava falls, rising embers)  |  bridge 3800-5400 (the cave's ONLY wood: a rope-and-plank
//   bridge over a lava chasm, ropes and posts on both edges, the pedestal at the end; the boss arena is the last screen).
// Back-to-front (drawBack): the lava river -> the wall strip (cached, open below the shore) -> the columns and spires -> the fire glow, lava falls, the jungle light -> the bridge's
// lava lake and far rope -> the floor strip (cached) -> the pedestal and its wedge -> the orange wash, embers.  drawFront: the bridge's
// near rope, shaking under the Alpha's stomps (setShake), and the lava glow past the near edge.
// Setters (src/siworld.js, src/sirage.js): setShake(k 0..1), setWedge(k).  Cached per scale (chunked strips, src/canvasmem.js); live: the lava.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, cacheCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 5400;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'mouth', name: 'The Mouth', x0: 0, x1: 1400 },
  { id: 'cavern', name: 'The Lava Cavern', x0: 1400, x1: 3800 },
  { id: 'bridge', name: 'The Rope Bridge', x0: 3800, x1: 5400 },
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
function makeSprite(w, h, ox, oy, sc, draw, live = false) {
  const L = live ? null : layerCanvas(w, h, sc);
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
// strips that meet (the wall's two): one sharpness -- all live if any chunk is, else all at the lowest scale any has
function unifyStrips(list) {
  const all = list.flatMap((st) => st.chunks);
  if (all.some((ch) => !ch.c)) { for (const st of list) if (st.chunks.some((ch) => ch.c)) st.redo(0); return; }
  const lo = Math.min(...all.map((ch) => ch.s));
  for (const st of list) if (st.chunks.some((ch) => ch.s > lo + 0.01)) st.redo(lo);
}
// a group of sprites (mk(k, sc, live) -> makeSprite) of one sharpness: rebuilt at the lowest scale the cap gave any of them, or all painted
// live if any could not be had (a near layer never mixes sharp and soft)
function spriteGroup(n, sc, mk) {
  let g = []; for (let k = 0; k < n; k++) g.push(mk(k, sc, false));
  const scOf = (sp) => (sp.c.__live ? 0 : sp.c.width / sp.w);
  const anyLive = g.some((sp) => !scOf(sp)) || g.some((sp) => scOf(sp) > 0 && scOf(sp) < Math.min(1, sc) - 0.01), lo = Math.min(...g.map(scOf).filter((v) => v > 0));   // (below 1: blurred -- live instead)
  if (anyLive) { for (const sp of g) if (!sp.c.__live) freeCanvases(sp.c); g = g.map((_, k) => mk(k, sc, true)); }
  else if (!anyLive && g.some((sp) => scOf(sp) > lo + 0.01)) g = g.map((sp, k) => { if (scOf(sp) <= lo + 0.01) return sp; freeCanvases(sp.c); return mk(k, lo, false); });
  return g;
}
// A horizontal strip of layer content (layer x lx0..lx1, screen y y0..y1, parallax p), chunked so no canvas exceeds
// ~2048 device px wide.  A chunk the memory cap refuses is painted live each frame by drawStrip (never a black hole).
function buildStrip(lx0, lx1, y0, y1, sc, p, draw) {
  const chunks = [];
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
  for (let x = lx0; x < lx1; x += cw) { const xa = x - 3, xb = Math.min(lx1, x + cw) + 3; chunks.push(fill(layerCanvas(xb - xa, y1 - y0, sc), xa, xb)); }
  // (the cap gave some chunks a lower scale: the sharper ones are freed and made again at it -- one even softness, never a seam)
  const lo = Math.min(...chunks.filter((ch) => ch.c).map((ch) => ch.s));
  for (let i = 0; i < chunks.length; i++) {
    const ch = chunks[i];
    if (!ch.c || ch.s <= lo + 1e-6) continue;
    freeCanvases(ch.c);
    const r = cacheCanvas((ch.xb - ch.x) * lo, (y1 - y0) * lo);
    chunks[i] = fill(r ? { c: r.c, g: r.g, sc: lo } : null, ch.x, ch.xb);
  }
  const redo = (s2) => {   // (every chunk again at scale s2, or painted live (0))
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i]; if (ch.c) freeCanvases(ch.c);
      const r = s2 ? cacheCanvas((ch.xb - ch.x) * s2, (y1 - y0) * s2) : null;
      chunks[i] = fill(r ? { c: r.c, g: r.g, sc: s2 } : null, ch.x, ch.xb);
    }
  };
  if (chunks.some((ch) => !ch.c) && chunks.some((ch) => ch.c)) redo(0);   // (some could not be had at all: the whole strip is painted live -- sharp everywhere)
  return { chunks, y0, p, redo };
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
const GT0 = 340;                                  // the floor strip's top (screen y); heroes' floor begins at 362
const MOUTH_END = 1400, BRIDGE_X = 3800;          // the sections' joints (world x)
const ROCK = { base: '#4a3430', sh: '#2a1c1a', hi: '#76564a', deep: '#180e0c', joint: '#120a08' };
const BASALT = { base: '#36262a', sh: '#1e1416', hi: '#5c4242', deep: '#100808', joint: '#0c0606' };
const WOODP = { base: '#7a5a3a', sh: '#523a26', hi: '#9c7a50', seam: '#2a1a10' };
const LS = { far: ['#1a1018', 0.5], mid: ['#140c10', 0.6], near: ['#0c0608', 0.8], front: ['#080406', 0.9] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const ROWS = [362, 372, 385, 402, 424, 451, 484, 520, 546];
const PED_X = 5270;                               // the altar, on the far landing's back edge (the boss screen: x 830)
const DECK1 = 5150;                               // the bridge's far end: the stone landing past it

const LAY = (() => {
  const R = mulberry(5400);
  const embers = [], teeth = [];
  for (let i = 0; i < 70; i++) embers.push({ x: R.r(0, 1100), y: R.r(0, H), sp: R.r(12, 40), sw: R.r(6, 22), ph: R.r(0, TAU), r: R.r(1, 2.8) });
  for (let i = 0; i < 20; i++) teeth.push({ x: i * 78 + R.r(-16, 16), h: R.r(40, 120), w: R.r(26, 46) });
  return { embers, teeth };
})();
// the cavern's focal points (world x): arched hollows glowing deep in the wall (hw: half width, top: the arch's crown), and the lava falls
// pouring from spouts in the rock, about two a screen, some from a hollow's back (y: the spout's lip, w: the fall's width)
const HOLLOWS = [{ x: 2090, hw: 98, top: 62 }, { x: 2960, hw: 68, top: 100 }, { x: 3890, hw: 58, top: 80 }, { x: 4770, hw: 84, top: 86 }];
const FALLS = [[1700, 120, 32], [2380, 100, 30], [2700, 142, 28], [3260, 112, 34], [3560, 132, 30], [4150, 104, 36], [4500, 138, 28], [5040, 112, 32]]
  .map(([x, y, w], i) => ({ x, y, w, ph: hash1(i * 11 + 4) * TAU, sp: 0.6 + 0.5 * hash1(i * 3 + 5) }));
// the front row of the cavern wall's ribs: spaced unevenly, two framing each hollow (leaning over it), none across its mouth
const RIBS = (() => {
  const o = [];
  for (let x = 1250, i = 0; x < LEVEL_LEN + 160; i++) {
    const hl = HOLLOWS.find((h) => x > h.x - h.hw - 60 && x < h.x + h.hw + 40);
    if (hl) { o.push({ x: hl.x - hl.hw - 20, seed: 9000 + i * 2, frame: -1 }, { x: hl.x + hl.hw + 20, seed: 9001 + i * 2, frame: 1 }); x = hl.x + hl.hw + 140; continue; }
    o.push({ x, seed: 9000 + i * 2, frame: 0 });
    x += 110 + hash1(i * 19 + 7) * 90;
  }
  return o;
})();

// ---------------------------------------------------------------------------------------------------------------
// SHARED DRAWING BITS  (the cave is rock: gravel at the mouth, black basalt with lava cracks in the cavern; wood is the final bridge only)
// ---------------------------------------------------------------------------------------------------------------
const BR0 = BRIDGE_X - 60;                                     // where the stone ends and the bridge's planks begin
const GRAV = { base: '#5a4e4a', sh: '#36302e', hi: '#7e7068' };   // the mouth's gravel
const BAS = { base: '#463c42', sh: '#2a2228', hi: '#6a5c62' };    // the cavern's basalt (warm grey: the black fire wolves read on it)
const kMof = (x) => sstep(MOUTH_END - 160, MOUTH_END + 160, x);   // 0 mouth .. 1 cavern
// the lava river's far bank: the wall's rock ends in a ragged shore, the river glows below it (cavern + bridge)
const SHORE = 240;
function spur(x) {
  const i = Math.floor(x / 200), f = x / 200 - i, h = hash2(i, 44);
  if (h < 0.3) return 0;
  const c = 0.28 + 0.44 * hash2(i, 45), w = 0.1 + 0.12 * hash2(i, 46), d = Math.abs(f - c) / w;
  if (d >= 1) return 0;
  let clear = 1;
  for (const q of FALLS) clear = Math.min(clear, sstep(40, 90, Math.abs(q.x - x)));
  for (const q of HOLLOWS) clear = Math.min(clear, sstep(q.hw, q.hw + 50, Math.abs(q.x - x)));
  return (1 - d * d) * (0.5 + hash2(i, 47)) * clear;
}
const shoreY = (x) => lerp(GT0 + 34, SHORE + 20 * vnoise(x, 190, 41) + 6 * vnoise(x, 47, 42), sstep(MOUTH_END - 110, MOUTH_END + 110, x));
const shoreAt = (x) => shoreY(x) + (hash2(Math.round(x / 6), 43) - 0.5) * 3.5 * kMof(x);   // (x on the 6 px grid)
// a jagged rock outline: n points round an ellipse, radii/angles jittered by hash (a pure function of seed)
function rockPath(g, cx, cy, rx, ry, seed, n, rough) {
  g.beginPath();
  for (let k = 0; k < n; k++) {
    const a = ((k + hash2(seed, k + 90) * 0.5) / n) * TAU, rr = 1 - rough * hash2(seed, k + 40);
    const px = cx + Math.cos(a) * rx * rr, py = cy + Math.sin(a) * ry * rr;
    if (k) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}
// a glowing lava crack: a jittered polyline in three passes (red haze, orange, hot core)
function lavaCrack(g, pts, w, a, deep = false, smoothed = false) {
  if (a <= 0.02) return;
  if (smoothed && pts.length > 4) curve(g, pts); else polyline(g, pts);
  // (deep: the floor's cracks, a darker red with a dark under-stroke, so the orange ring telegraphs never sit among look-alikes)
  if (deep) { g.strokeStyle = `rgba(20,4,4,${0.7 * a})`; g.lineWidth = w * 2.6; g.stroke(); }
  g.strokeStyle = deep ? `rgba(150,20,8,${0.4 * a})` : `rgba(190,40,10,${0.34 * a})`; g.lineWidth = w * 3.4; g.stroke();
  g.strokeStyle = deep ? `rgba(214,52,16,${0.95 * a})` : `rgba(255,118,30,${0.95 * a})`; g.lineWidth = w * 1.5; g.stroke();
  g.strokeStyle = deep ? `rgba(255,150,70,${0.85 * a})` : `rgba(255,224,140,${0.9 * a})`; g.lineWidth = w * 0.55; g.stroke();
}
// a crack in the rock as a tapering ribbon (w0 wide at its first point .. w1 at its last): a red haze, its dark lips, the orange body, a hot
// core; the path subdivided and smoothed, so it meanders (small jogs, never a sawtooth)
function taperCrack(g, pts, w0, w1, a = 1) {
  if (a <= 0.02) return;
  const n = pts.length / 2, P = [];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < 4; k++) { const u = k / 4; P.push([lerp(pts[i * 2], pts[i * 2 + 2], u), lerp(pts[i * 2 + 1], pts[i * 2 + 3], u)]); }
  P.push([pts[pts.length - 2], pts[pts.length - 1]]);
  let S = P;
  for (let pass = 0; pass < 2; pass++) S = S.map((q, i) => (i === 0 || i === S.length - 1 ? q : [(S[i - 1][0] + 2 * q[0] + S[i + 1][0]) / 4, (S[i - 1][1] + 2 * q[1] + S[i + 1][1]) / 4]));
  const ribbon = (k) => {
    const L = [], R = [];
    for (let i = 0; i < S.length; i++) {
      const j = Math.min(S.length - 1, i + 1), h = Math.max(0, i - 1), dx = S[j][0] - S[h][0], dy = S[j][1] - S[h][1], l = Math.hypot(dx, dy) || 1;
      const w = lerp(w0, w1, Math.pow(i / (S.length - 1), 0.8)) * k * 0.5;
      L.push(S[i][0] - (dy / l) * w, S[i][1] + (dx / l) * w); R.unshift(S[i][0] + (dy / l) * w, S[i][1] - (dx / l) * w);
    }
    poly(g, L.concat(R));
  };
  ribbon(3); g.fillStyle = `rgba(200,50,12,${0.26 * a})`; g.fill();
  ribbon(1.7); g.fillStyle = `rgba(50,8,4,${0.6 * a})`; g.fill();
  ribbon(1); g.fillStyle = `rgba(255,122,34,${0.96 * a})`; g.fill();
  ribbon(0.42); g.fillStyle = `rgba(255,230,150,${0.92 * a})`; g.fill();
}
// a wall vein: a lava crack that breaks into two with a gap, thins toward its end and throws a short branch
function lavaVein(g, pts, w, a, seed) {
  const n = pts.length / 2, cut = hash2(seed, 3) > 0.5 && n > 3 ? 2 + Math.floor(hash2(seed, 4) * (n - 3)) : -1;
  const seg = (f, t, ww) => { if (t > f) lavaCrack(g, pts.slice(f * 2, t * 2 + 2), ww, a, false, true); };
  if (cut > 0) { seg(0, cut - 1, w); seg(cut, n - 1, w * 0.62); } else seg(0, n - 1, w);
  const b = 1 + Math.floor(hash2(seed, 5) * Math.max(1, n - 2)), s = hash2(seed, 6) > 0.5 ? 1 : -1, bx = pts[b * 2], by = pts[b * 2 + 1];
  if (hash2(seed, 7) > 0.3) lavaCrack(g, [bx, by, bx + s * (10 + hash2(seed, 8) * 12), by + 6 + hash2(seed, 9) * 8, bx + s * (22 + hash2(seed, 10) * 14), by + 14 + hash2(seed, 11) * 12], w * 0.55, a * 0.9, false, true);
}
function crackPts(x0, y0, x1, y1, seed, segs, jit) {
  const o = [x0, y0];
  for (let k = 1; k < segs; k++) { const t = k / segs; o.push(lerp(x0, x1, t) + (hash2(seed, k) - 0.5) * jit, lerp(y0, y1, t) + (hash2(seed, k + 9) - 0.5) * jit); }
  o.push(x1, y1);
  return o;
}
// the lava's surface (a cached texture LT_W wide, tiled and drifting with the flow): deep red under the far bank, hotter toward the near edge;
// long swirling streaks, dark crust rafts with glowing rims (bigger near), hot spots; the hottest band along the floor's lip
const LT_W = 640, LT_Y0 = 222, LT_Y1 = 376;
function drawLavaTile(g) {
  const HT = LT_Y1 - LT_Y0, R = mulberry(77);
  vgrad(g, -2, 0, LT_W + 4, HT, [[0, '#7a1608'], [0.16, '#b8340e'], [0.5, '#ea6a1c'], [0.82, '#ff9a34'], [1, '#ffc25a']]);
  const wrap = (fn) => { for (const o of [-LT_W, 0, LT_W]) { g.save(); g.translate(o, 0); fn(); g.restore(); } };
  // the flow: long wavy streaks, dark-red troughs and bright crests (thicker and longer near)
  for (let i = 0; i < 80; i++) {
    const u = Math.pow(R(), 0.85), y = 5 + u * (HT - 10), len = (36 + R() * 120) * (0.45 + u), x = R() * LT_W, amp = (0.6 + u * 3) * R(), bright = R() < 0.55;
    const lw = (0.7 + u * 2.8) * (0.6 + R() * 0.6), a = bright ? 0.3 + 0.45 * u : 0.28 + 0.3 * u;
    wrap(() => {
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.33, y - amp * 2, x + len * 0.66, y + amp * 2, x + len, y);
      g.strokeStyle = bright ? `rgba(255,228,140,${a})` : `rgba(140,22,6,${a})`; g.lineWidth = lw; g.stroke();
    });
  }
  // crust rafts: cooled plates riding the flow, a hot halo round each, a glowing rim, cracks across
  for (let i = 0; i < 24; i++) {
    const u = Math.pow(R(), 0.9), y = 10 + u * (HT - 22), rx = (9 + R() * 22) * (0.45 + u), ry = rx * (0.2 + 0.1 * u), x = R() * LT_W, sd = 600 + i * 7, dark = R();
    wrap(() => {
      rockPath(g, x, y, rx, ry, sd, 9, 0.38); g.strokeStyle = 'rgba(255,170,60,0.55)'; g.lineWidth = 3 + u * 4; g.stroke();
      g.fillStyle = mix('#2e0c06', '#5a1a0a', dark); g.fill();
      g.save(); rockPath(g, x, y, rx, ry, sd, 9, 0.38); g.clip();
      g.fillStyle = 'rgba(255,200,150,0.14)'; g.fillRect(x - rx, y - ry, rx * 2, ry * 0.7);
      g.strokeStyle = 'rgba(255,130,40,0.85)'; g.lineWidth = 0.8 + u * 0.8; polyline(g, [x - rx * 0.7, y + ry * 0.2, x - rx * 0.2, y - ry * 0.3, x + rx * 0.1, y + ry * 0.4, x + rx * 0.6, y - ry * 0.1]); g.stroke();
      g.restore();
      rockPath(g, x, y, rx, ry, sd, 9, 0.38); g.strokeStyle = '#ffd47a'; g.lineWidth = 0.9 + u * 0.9; g.stroke();
    });
  }
  // hot spots welling up
  for (let i = 0; i < 16; i++) {
    const u = Math.pow(R(), 0.8), y = 8 + u * (HT - 14), x = R() * LT_W, rx = (5 + R() * 10) * (0.5 + u);
    wrap(() => { g.fillStyle = 'rgba(255,240,180,0.55)'; g.beginPath(); g.ellipse(x, y, rx, rx * 0.25, 0, 0, TAU); g.fill(); });
  }
  vgrad(g, -2, 0, LT_W + 4, 22, [[0, 'rgba(40,6,2,0.55)'], [1, 'rgba(40,6,2,0)']]);           // (the far bank's shadow)
  vgrad(g, -2, HT - 30, LT_W + 4, HT, [[0, 'rgba(255,226,130,0)'], [1, 'rgba(255,232,150,0.5)']]);   // (the hottest band, by the floor's lip)
}
// a rib of the cavern's wall: a tall curved band of flowing rock from the ceiling into the lava (the book's throat of a cave), its foot
// flared, lit from below, grooved along its length, a rim of lava light up both edges.  frame: a hollow's side (-1 left, 1 right) -- it
// leans over the hollow.  front: the near row (lighter, inked) or the dim back row
function ribGeo(cx, seed, frame) {
  const drape = !frame && hash2(seed, 9) < 0.3;
  const wt = drape ? 34 + 22 * hash2(seed, 2) : 20 + 16 * hash2(seed, 2), wb = drape ? 0 : 42 + 34 * hash2(seed, 1);
  const lean = frame ? -frame * 44 : (hash2(seed, 3) - 0.5) * (drape ? 36 : 96), wav = (hash2(seed, 4) - 0.5) * 20;
  const yb = drape ? 130 + 80 * hash2(seed, 11) : shoreY(cx) + 34;
  const prof = (t) => lerp(wt, wb, Math.pow(t, drape ? 1.25 : 1.7));
  const at = (t, sg) => [cx + lean * Math.pow(1 - t, 1.5) + wav * Math.sin(t * 3 + seed) + sg * prof(t), lerp(-16, yb, t)];
  return { at, wb: Math.max(wt, wb), yb, drape };
}
function drawRib(g, cx, seed, frame, front, mouth = false) {
  const { at, wb, yb, drape } = ribGeo(cx, seed, frame), N = 7, pts = [];
  const jit = (k, o, a = 12) => (hash2(seed, k + o) - 0.5) * a;
  for (let k = 0; k <= N; k++) { const q = at(k / N, -1); pts.push(q[0] + (drape && k === N ? 0 : jit(k, 10)), q[1] + (k && k < N ? jit(k, 60, 10) : 0)); }
  for (let k = drape ? N - 1 : N; k >= 0; k--) { const q = at(k / N, 1); pts.push(q[0] + jit(k, 30), q[1] + (k && k < N ? jit(k, 70, 10) : 0)); }
  const face = (s0, s1, o) => { const f = []; for (let k = 0; k <= N; k++) { const q = at(k / N, s0); f.push(q[0] + jit(k, o, 8), q[1]); } for (let k = N; k >= 0; k--) { const q = at(k / N, s1); f.push(q[0] + jit(k, o + 5, 8), q[1]); } return f; };
  const col = mouth ? mix('#5e463e', '#4c3832', hash2(seed, 5)) : front ? mix('#5c3c32', '#42302c', hash2(seed, 5)) : mix('#33221f', '#26181a', hash2(seed, 5));
  const lavaA = mouth ? 0.16 * kMof(cx + 300) : drape ? 0.18 : front ? 0.55 : 0.36;
  ink(g, (g) => poly(g, pts), col, front ? 2.8 : 2, (g) => {
    g.fillStyle = front ? 'rgba(214,156,124,0.2)' : 'rgba(170,110,90,0.1)'; poly(g, face(-1.4, -0.38, 80)); g.fill();   // (the lit plane)
    g.fillStyle = 'rgba(8,2,4,0.4)'; poly(g, face(0.3, 1.4, 90)); g.fill();                                                 // (the shadowed plane)
    for (let b = 0; b < 3; b++) {   // (breaks across it: a dark crack, the lit lip of the ledge below it)
      const t = 0.18 + b * 0.25 + jit(b, 100, 0.1), L = at(t, -1.2), Rr = at(t + jit(b, 104, 0.07), 1.2), M = at(t, jit(b, 108, 0.7));
      const ln = [L[0], L[1], M[0], M[1] + jit(b, 112, 10), Rr[0], Rr[1]];
      polyline(g, ln); g.strokeStyle = 'rgba(8,2,4,0.55)'; g.lineWidth = front ? 2 : 1.4; g.stroke();
      polyline(g, ln.map((v, i) => (i & 1 ? v + 2.6 : v))); g.strokeStyle = front ? 'rgba(230,170,130,0.2)' : 'rgba(200,140,110,0.1)'; g.lineWidth = 1.4; g.stroke();
    }
    vgrad(g, cx - wb - 120, -16, (wb + 120) * 2, yb, [[0, 'rgba(6,2,4,0.66)'], [0.42, 'rgba(6,2,4,0.08)'], [0.72, 'rgba(255,110,36,0.06)'], [1, `rgba(255,130,44,${lavaA})`]]);
    if (mouth) { g.beginPath(); for (let k = 0; k <= 8; k++) { const q = at(k / 8, -0.95); if (k) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.lineWidth = 5; g.strokeStyle = `rgba(210,232,196,${0.3 * clamp(1.3 - cx / 1100, 0, 1)})`; g.stroke(); }   // (the daylight's edge)
    else for (const sg of [-1, 1]) { g.beginPath(); for (let k = 0; k <= 8; k++) { const q = at(lerp(0.45, 1, k / 8), sg * 0.95); if (k) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.lineWidth = 5; g.strokeStyle = `rgba(255,150,60,${front ? 0.6 : 0.32})`; g.stroke(); }
    if (!mouth && !drape && hash2(seed, 14) > (front ? 0.55 : 0.75)) {   // (a crack climbing from the lava up its face: jagged, thick at the foot, tapering)
      const sg = (hash2(seed, 15) - 0.5) * 0.9, t1 = 0.3 + hash2(seed, 16) * 0.25, cp = [];
      for (let k = 0; k <= 8; k++) { const q = at(lerp(1.02, t1, k / 8), sg + jit(k, 130, 0.12)); cp.push(q[0] + jit(k, 140, 5), q[1]); }
      const a = front ? 0.95 : 0.7;
      taperCrack(g, cp, front ? 3.4 : 2.6, 0.8, a);
      if (hash2(seed, 17) > 0.5) { const bx = cp[6], by = cp[7], s2 = hash2(seed, 18) > 0.5 ? 1 : -1; taperCrack(g, [bx, by, bx + s2 * 6, by - 10, bx + s2 * 9 + jit(1, 150, 4), by - 22], 1.6, 0.6, a * 0.85); }
    }
  });
  if (drape && front && !mouth) { const q = at(1, 0); taperCrack(g, [q[0], q[1] - 2, q[0] + jit(1, 120, 4), q[1] - 16, q[0] + jit(2, 120, 4), q[1] - 34], 2.2, 0.7, 0.8); }   // (the drape's tip glows)
}
// a hollow deep in the wall (an uneven arch of rock, or a tall crack-shaped slot): rings of rock receding into an orange glow, the lava's
// light pooled at its foot, cracks running down
function hollowPts(h, k, yb) {
  const { x, hw, top } = h, w = hw * k, T = yb - (yb - top) * k, o = [], sd = Math.round(x) + Math.round(k * 100);
  const jx = (i, a) => (hash2(sd, i) - 0.5) * a;
  if (h.slot) {   // (a crack: a jagged zigzag up each side to a pointed top)
    for (let i = 0; i <= 7; i++) { const u = i / 7; o.push(x - w * (0.55 + 0.45 * (1 - u)) + jx(i, 10) - (i % 2) * 6, lerp(yb + 12, T + 6, u)); }
    o.push(x + jx(20, 8), T);
    for (let i = 7; i >= 0; i--) { const u = i / 7; o.push(x + w * (0.5 + 0.5 * (1 - u)) + jx(i + 30, 10) + (i % 2) * 6, lerp(yb + 12, T + 10, u)); }
    return o;
  }
  const lean = (hash2(Math.round(x), 7) > 0.5 ? 1 : -1) * w * (0.3 + 0.3 * hash2(Math.round(x), 8));
  o.push(x - w * 1.3, yb + 12);
  for (let i = 1; i <= 4; i++) { const u = i / 5; o.push(x - w * lerp(1.28, 0.92, u) + lean * u * u + jx(i, 16), lerp(yb, T + w * 0.7, u)); }
  for (let i = 1; i < 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI, r = k >= 0.8 ? 0.8 + 0.34 * hash2(sd, i + 80) - (i === 4 || i === 5 ? 0.18 : 0) : 0.92 + 0.12 * hash2(sd, i + 80);   // (a break in the crown)
    o.push(x + lean + Math.cos(a) * w * 0.92 * r + jx(i + 10, 12), T + w * 0.7 + Math.sin(a) * w * 0.8 * r + jx(i + 40, 12));
  }
  for (let i = 4; i >= 1; i--) { const u = i / 5; o.push(x + w * lerp(1.28, 0.92, u) + lean * u * u + jx(i + 60, 16), lerp(yb, T + w * 0.7, u)); }
  o.push(x + w * 1.3, yb + 12);
  return o;
}
function drawHollow(g, h) {
  const { x, hw, top } = h, yb = shoreY(x) + 30;
  const rings = [[1, '#220c08', '#6a1e0e'], [0.8, '#40140a', '#b03c10'], [0.6, '#70200a', '#e05a1c'], [0.4, '#b83c12', '#ffa040'], [0.22, '#f07a26', '#ffe08a']];
  rings.forEach(([k, c0, c1], i) => {
    const pts = hollowPts(h, k, yb), t = yb - (yb - top) * k;
    ink(g, (g) => poly(g, pts), c0, i ? 1.8 : 2.6, (g) => {
      vgrad(g, x - hw - 14, t - 6, hw * 2 + 28, yb + 12, [[0, c0], [1, c1]]);
      g.lineWidth = 3; g.strokeStyle = `rgba(255,170,80,${0.16 + i * 0.08})`; poly(g, hollowPts(h, k * 0.97, yb)); g.stroke();   // (the ring's lit inner edge)
    });
  });
  lightPool(g, x, yb - 10, hw * 0.9, 30, '255,206,120', 0.75);
}
// a fall's channel down the rock face (the fall itself, from its foot down: lavaFalls)
function drawSpout(g, f) {
  // where a fall comes from: lava running down the rock face in a channel it has cut, from a crack in the roof -- crusted dark at its uneven
  // edges, widening as it comes -- until, at y, it leaves the rock and falls free (lavaFalls: as wide as the channel's foot).  One continuous
  // stream, nothing across it.
  const { x, y } = f, sd = Math.round(x), N = 12, P = [];
  for (let k = 0; k <= N; k++) { const u = k / N; P.push([x + Math.sin(u * 2.6 + sd) * 6 * (1 - u) + (hash2(sd, k) - 0.5) * 3 * (1 - u), lerp(-14, y, u)]); }
  const w0 = f.w * 0.5 * 1.1;   // (the fall's half width where it leaves the rock)
  const edge = (i, s2) => 1 + (i < N ? (hash2(sd, i * 2 + (s2 > 0 ? 7 : 3)) - 0.5) * 0.5 : 0);   // (each side wobbles on its own)
  const ribbon = (k, rough) => {
    const L = [], R = [];
    for (let i = 0; i <= N; i++) { const u = i / N, w = w0 * lerp(0.45, 1, Math.pow(u, 0.7)) * (k > 1 ? lerp(k, 1, u * u) : k); L.push(P[i][0] - w * (rough ? edge(i, -1) : 1), P[i][1]); R.unshift(P[i][0] + w * (rough ? edge(i, 1) : 1), P[i][1]); }
    poly(g, L.concat(R));
  };
  lightPool(g, x, y * 0.5, w0 * 3, y * 0.5, '255,110,30', 0.4);   // (its glow on the rock round it)
  ribbon(1.32, true); g.fillStyle = '#4a1608'; g.fill();                 // (the crust along its uneven edges)
  ribbon(1, false); g.fillStyle = '#d23c14'; g.fill();
  for (const sg of [-1, 1]) { g.beginPath(); for (let i = 0; i <= N; i++) { const u = i / N, w = w0 * lerp(0.45, 1, Math.pow(u, 0.7)); if (i) g.lineTo(P[i][0] + sg * w, P[i][1]); else g.moveTo(P[i][0] + sg * w, P[i][1]); } g.strokeStyle = 'rgba(70,12,4,0.9)'; g.lineWidth = 1.6; g.stroke(); }   // (its edges inked like the fall's)
  ribbon(0.7, false); g.fillStyle = '#ff8c2c'; g.fill();
  ribbon(0.3, false); g.fillStyle = '#ffe07a'; g.fill();
  for (let k = 0; k < 7; k++) {   // (crust chips riding it: brown and dark orange, of different sizes, off its middle)
    const u = 0.08 + 0.84 * hash2(sd, k + 40), i = Math.min(N, Math.round(u * N)), w = w0 * lerp(0.45, 1, Math.pow(u, 0.7)), side = (hash2(sd, k + 50) - 0.5) * 1.5 * w, r = 1.4 + hash2(sd, k + 60) * 3;
    ink(g, (g) => rockPath(g, P[i][0] + side, P[i][1] + (hash2(sd, k + 70) - 0.5) * 8, r * 1.4, r, sd + k, 6, 0.4), hash2(sd, k + 80) > 0.5 ? '#6a2410' : '#a03a10', 0);
  }
}
// the floor lattice: columns at irregular x (shared by every row), rows at ROWS; every vertex is jittered by a hash of its lattice index, so
// neighbouring plates meet exactly and nothing runs in a straight row (the old running bond read as a boardwalk)
const XS = (() => { const a = []; for (let x = -640, i = 0; x < LEVEL_LEN + 560; i++) { a.push(x); x += 58 + 84 * hash1(i * 131 + 7); } return a; })();
function FV(i, j) {
  const w = (XS[i + 1] !== undefined ? XS[i + 1] : XS[i] + 100) - XS[i];
  const rh = ((ROWS[j + 1] !== undefined ? ROWS[j + 1] : ROWS[j] + 30) - (ROWS[j - 1] !== undefined ? ROWS[j - 1] : ROWS[j] - 8)) * 0.5;
  return [XS[i] + (hash2(i, j + 510) - 0.5) * w * 0.62, ROWS[j] + (hash2(i, j + 500) - 0.5) * rh * 0.95 * (j === 0 ? 0.3 : 1)];
}
// the floor: a ragged back lip of boulders, cracked basalt plates (irregular quads and triangles) with lava glowing in some cracks and in long
// diagonal fissures, a cool grey gravel tint at the mouth; then the bridge's planks past BR0
function drawFloor(g, xa, xb) {
  const Wd = xb - xa + 4;
  vgrad(g, xa - 2, GT0, Wd, 32, [[0, 'rgba(8,2,4,0.55)'], [1, 'rgba(8,2,4,0)']]);
  g.fillStyle = '#150a0d'; g.fillRect(xa - 2, 358, Wd, 192);
  // 1. the bank: a ragged lip of boulders along the back edge, lit from the river behind them (uneven sizes and gaps)
  for (let x = al(xa - 60, 46) - 46; x < xb + 60; x += 46) {
    const i = Math.round(x / 46), h = hash2(i, 77);
    if (h < 0.14 || (x > BR0 - 10 && x < DECK1 + 20)) continue;
    const big = hash2(i, 80) > 0.86, mid = x + 23 + (h - 0.5) * 26, kM = kMof(mid);
    const rx = big ? 24 + hash2(i, 78) * 10 : 16 + h * 22, ry = big ? 15 + hash2(i, 79) * 8 : 7 + hash2(i, 79) * 8, cy = 362 - (big ? ry * 0.3 : 0) + hash2(i, 82) * 5;
    ink(g, (g) => rockPath(g, mid, cy, rx, ry, i, 7, 0.3), mix(mix(GRAV.base, BAS.base, kM), '#000000', 0.22), 2.2, (g) => { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(mid - rx, cy - ry, rx * 2, ry * 0.6); });
    if (kM > 0.25) { g.strokeStyle = `rgba(255,130,44,${(0.55 + 0.35 * hash2(i, 83)) * kM})`; g.lineWidth = 2; g.beginPath(); g.ellipse(mid, cy, rx * 0.86, ry * 0.86, 0, Math.PI * (1.05 + 0.1 * hash2(i, 84)), Math.PI * (1.7 + 0.25 * hash2(i, 85))); g.stroke(); }
  }
  // 2. the plates
  const i0 = Math.max(0, XS.findIndex((x) => x > xa - 200) - 1), i1 = XS.findIndex((x) => x > xb + 200);
  const nx = i1 < 0 ? XS.length - 2 : i1, plates = [], lastI = Math.min(nx, XS.length - 2);
  for (let j = 0; j < ROWS.length - 1; j++) {
    for (let i = i0; i <= lastI; i++) {
      const v00 = FV(i, j), v10 = FV(i + 1, j), v11 = FV(i + 1, j + 1), v01 = FV(i, j + 1), h = hash2(i, j + 520);
      if (v00[0] > BR0 + 90 && v10[0] < DECK1 - 90) continue;   // (the bridge's span: planks)
      const P = (pts, key, tri) => { let cx = 0, cy = 0; for (let k = 0; k < pts.length; k += 2) { cx += pts[k]; cy += pts[k + 1]; } plates.push({ pts, cx: cx / (pts.length / 2), cy: cy / (pts.length / 2), j, i, key, tri }); };
      if (h < 0.15) { P([v00[0], v00[1], v10[0], v10[1], v11[0], v11[1]], i * 64 + j, 1); P([v00[0], v00[1], v11[0], v11[1], v01[0], v01[1]], i * 64 + j + 1000, 1); }
      else if (h < 0.3) { P([v00[0], v00[1], v10[0], v10[1], v01[0], v01[1]], i * 64 + j, 1); P([v10[0], v10[1], v11[0], v11[1], v01[0], v01[1]], i * 64 + j + 1000, 1); }
      else P([v00[0], v00[1], v10[0], v10[1], v11[0], v11[1], v01[0], v01[1]], i * 64 + j, 0);
    }
  }
  for (const p of plates) {
    const pts = p.pts, n = pts.length / 2, h = hash2(p.key, 530), kM = kMof(p.cx);
    let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
    for (let k = 0; k < pts.length; k += 2) { x0 = Math.min(x0, pts[k]); x1 = Math.max(x1, pts[k]); y0 = Math.min(y0, pts[k + 1]); y1 = Math.max(y1, pts[k + 1]); }
    const base = BAS.base, sh = BAS.sh, hi = BAS.hi;
    g.fillStyle = mix(base, h < 0.5 ? sh : hi, Math.abs(h - 0.5) * 0.9); poly(g, pts); g.fill();
    g.save(); poly(g, pts); g.clip();
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, rgba(hi, 0.4)); gr.addColorStop(0.4, rgba(hi, 0)); gr.addColorStop(1, 'rgba(0,0,0,0.34)');
    g.fillStyle = gr; g.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
    for (let k = 0; k < 4; k++) {   // grit (the mouth: pebbles)
      const gx = lerp(x0, x1, hash2(p.key, k + 400)), gy = lerp(y0, y1, hash2(p.key, k + 410));
      if (kM < 0.55 && k < 3) { const pr = 3 + hash2(p.key, k + 420) * 3.4, pv = 1.8 + hash2(p.key, k + 430) * 1.6; g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(gx + 0.8, gy + 1.6, pr, pv, 0, 0, TAU); g.fill(); g.fillStyle = rgba(hi, 0.9); g.beginPath(); g.ellipse(gx, gy, pr, pv, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.ellipse(gx - pr * 0.25, gy - pv * 0.35, pr * 0.5, pv * 0.38, 0, 0, TAU); g.fill();   // (a lit pebble with a shadow: never a black puck)
        { const wl = 0.3 + 0.7 * sstep(0, MOUTH_END, gx); g.strokeStyle = `rgba(255,${Math.round(150 - 30 * wl)},60,${(0.35 + 0.45 * wl).toFixed(3)})`; g.lineWidth = 1.3; g.beginPath(); g.ellipse(gx, gy, pr, pv, 0, -Math.PI * 0.42, Math.PI * 0.32); g.stroke(); } }   // (its lava side lit orange: QAF3)
      else { g.fillStyle = k & 1 ? rgba(hi, 0.5) : 'rgba(0,0,0,0.4)'; g.fillRect(gx, gy, 2.2, 1.4); }
    }
    if (kM < 0.3 && h > 0.72 && p.cx < 1000) {   // (moss blown in from the jungle: a soft patch and a few blades)
      const my = lerp(y0, y1, 0.55);
      g.fillStyle = 'rgba(40,32,30,0.26)'; g.beginPath(); g.ellipse(p.cx, my, (x1 - x0) * 0.26, (y1 - y0) * 0.22, 0, 0, TAU); g.fill();   // (an ash smudge)
      const tips = []; g.lineWidth = 1.4;
      for (let k = 0; k < 6; k++) { const bx = p.cx + (hash2(p.key, k + 460) - 0.5) * (x1 - x0) * 0.5, by = my + (hash2(p.key, k + 470) - 0.4) * (y1 - y0) * 0.3, tx = bx + (hash2(p.key, k + 490) - 0.5) * 8, ty = by - 7 - hash2(p.key, k + 500) * 3; g.strokeStyle = k & 1 ? 'rgba(168,128,84,0.8)' : 'rgba(112,96,84,0.8)'; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + (hash2(p.key, k + 480) - 0.5) * 6, by - 4, tx, ty); g.stroke(); tips.push([tx, ty]); }   // (dry singed stalks: tan and ash)
      if (p.cx > 380) for (const [k, [tx, ty]] of tips.entries()) { if (hash2(p.key, k + 505) <= 0.55) continue; const ex = tx + 2 + hash2(p.key, k + 506) * 3, ey = ty - 4 - hash2(p.key, k + 507) * 4; g.fillStyle = 'rgba(255,150,60,0.22)'; g.beginPath(); g.arc(ex, ey, 2.6, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,170,80,0.9)'; g.beginPath(); g.arc(ex, ey, 1.1, 0, TAU); g.fill(); }   // (an ember or two drifting up off them nearer the lava -- off the tips, never a match head: critic A)
    }
    g.restore();
    // lit upper edges, shaded lower edges (the steep sides stay plain)
    for (let k = 0; k < n; k++) {
      const ax = pts[k * 2], ay = pts[k * 2 + 1], bx = pts[((k + 1) % n) * 2], by = pts[((k + 1) % n) * 2 + 1], my = (ay + by) / 2;
      if (Math.abs(bx - ax) < Math.abs(by - ay) * 1.1) continue;
      g.lineWidth = my < p.cy ? 1.5 : 2.2; g.strokeStyle = my < p.cy ? rgba(hi, 0.6) : 'rgba(0,0,0,0.55)';
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
  }
  // the mouth's plates cracked: a hairline fissure across some (its dark line, its far lip lit -- warmer toward the cavern)
  for (const p of plates) {
    if (p.cx > MOUTH_END + 100 || hash2(p.key, 600) < 0.5) continue;
    const pts = p.pts, n = pts.length / 2, a = Math.floor(hash2(p.key, 601) * n), b = (a + 1 + Math.floor(hash2(p.key, 602) * (n - 1))) % n;
    const ax = lerp(pts[a * 2], pts[((a + 1) % n) * 2], 0.3 + 0.4 * hash2(p.key, 603)), ay = lerp(pts[a * 2 + 1], pts[((a + 1) % n) * 2 + 1], 0.3 + 0.4 * hash2(p.key, 603));
    const bx = lerp(pts[b * 2], pts[((b + 1) % n) * 2], 0.3 + 0.4 * hash2(p.key, 604)), by = lerp(pts[b * 2 + 1], pts[((b + 1) % n) * 2 + 1], 0.3 + 0.4 * hash2(p.key, 604));
    const c = crackPts(ax, ay, bx, by, p.key, 5, 4), w = sstep(300, MOUTH_END, p.cx);
    g.save(); poly(g, pts); g.clip(); g.lineCap = 'round'; g.lineJoin = 'round';
    polyline(g, c); g.strokeStyle = 'rgba(10,4,6,0.6)'; g.lineWidth = 1.6; g.stroke();
    polyline(g, c.map((v, k) => (k & 1 ? v + 1.4 : v))); g.strokeStyle = `rgba(255,${Math.round(lerp(170, 132, w))},${Math.round(lerp(96, 56, w))},${(0.34 + 0.34 * w).toFixed(3)})`; g.lineWidth = 1.1; g.stroke();   // (its far lip lit orange by the lava: QAF3)
    g.restore();
  }
  // the mouth's gravel: a light warm brown-grey tint over the plates, eased out across the mouth's joint (one gradient: no stepping at plate
  // edges) -- UNDER the lava's light now (QAF3: over it, it greyed the whole floor)
  if (xa < 1580) {
    const tg = g.createLinearGradient(1240, 0, 1580, 0); tg.addColorStop(0, 'rgba(152,132,116,0.28)'); tg.addColorStop(1, 'rgba(152,132,116,0)');
    g.fillStyle = tg; g.fillRect(xa - 2, 362, Math.min(xb, 1580) - xa + 4, 190);
  }
  // the lava's warm bounce light across the mouth, growing toward the cavern: one world-anchored gradient, warm pools along the floor
  if (xa < BR0 + 20) {   // (rising steadily toward the lava: 0 at the entrance, 0.14 on the gravel, 0.09 on and on over the cavern's basalt (the gradient pads past 1580) -- one world-anchored gradient)
    const wx1 = Math.min(xb + 2, BR0 + 20), wg = g.createLinearGradient(120, 0, 1580, 0);   // (QAF3: across the whole floor, stronger -- 0.03 in the entrance's daylight, 0.24 near the lava, 0.2 on over the basalt)
    wg.addColorStop(0, 'rgba(255,124,52,0.03)'); wg.addColorStop(0.3, 'rgba(255,124,52,0.1)'); wg.addColorStop(0.6, 'rgba(255,124,52,0.17)'); wg.addColorStop(0.85, 'rgba(255,124,52,0.24)'); wg.addColorStop(1, 'rgba(255,124,52,0.2)');
    g.fillStyle = wg; g.fillRect(xa - 2, 360, wx1 - xa + 2, 190);
  }
  if (xa < MOUTH_END + 560) {   // (the warm pools: gated on their own reach -- a chunk starting past 1580 still gets the ones that spill into it: critic B)
    for (let x = al(xa - 320, 170) - 170; x < Math.min(xb + 320, MOUTH_END + 260); x += 170) {
      const i = Math.round(x / 170); if (x < 200) continue;
      const k = sstep(200, MOUTH_END, x); lightPool(g, x + hash2(i, 611) * 90, 382 + hash2(i, 612) * 110, 150 + 60 * hash2(i, 613), 30 + 14 * hash2(i, 614), '255,150,72', (0.06 + 0.16 * k) * (0.6 + 0.4 * hash2(i, 615)));
    }
  }
  // 3. the lava glowing in the rock (cavern only): a few cracks along the seams, long diagonal fissures across the plates, ember pits
  for (let j = 0; j < ROWS.length - 1; j++) {
    for (let i = i0; i <= lastI; i++) {
      const v00 = FV(i, j), v10 = FV(i + 1, j), v01 = FV(i, j + 1);
      if (v00[0] > BR0 - 10 && v00[0] < DECK1 + 30) continue;
      const k = sstep(MOUTH_END - 80, MOUTH_END + 420, v00[0]); if (k < 0.05) continue;   // (eased in across the mouth's joint)
      const a = k * (0.55 + 0.45 * hash2(i, j + 570)), rw = 0.65 + 0.2 * j / 7;
      if (hash2(i, j + 540) > 0.72) lavaCrack(g, crackPts(v00[0], v00[1], v01[0], v01[1], i * 9 + j, 4, 5), rw, a * 0.7, true);
      if (hash2(i, j + 550) > 0.84) lavaCrack(g, crackPts(v00[0], v00[1], v10[0], v10[1], i * 9 + j + 3, 4, 4), rw, a * 0.6, true);
      if (hash2(i, j + 560) > 0.86 && j < ROWS.length - 3 && k > 0.7) { const e = FV(i + 2, j + 2), s = crackPts(v00[0] + 6, v00[1] + 3, e[0], e[1], i * 7 + j, 6, 11); lavaCrack(g, s, rw * 1.15, a, true); }
    }
  }
  // the river's glow on the floor's back half: stepped (8 px, no overlap) only while it eases in across the joint, one plain rect after
  for (let x = al(Math.max(xa - 8, 1240), 8); x < Math.min(xb + 8, 1560); x += 8) {
    const k = kMof(x + 4); if (k < 0.03) continue;
    vgrad(g, x, 356, 8, 440, [[0, `rgba(255,110,32,${0.42 * k})`], [0.4, `rgba(255,120,40,${0.14 * k})`], [1, 'rgba(255,110,32,0)']]);
  }
  { const gx0 = Math.max(xa - 2, 1560), gx1 = Math.min(xb + 2, BR0 + 20); if (gx1 > gx0) vgrad(g, gx0, 356, gx1 - gx0, 440, [[0, 'rgba(255,110,32,0.42)'], [0.4, 'rgba(255,120,40,0.14)'], [1, 'rgba(255,110,32,0)']]); }
  // the daylight from the entrance, pale on the mouth's floor
  if (xa < 520) { lightPool(g, 120, 400, 210, 46, '226,244,196', 0.5); lightPool(g, 90, 392, 110, 22, '246,252,226', 0.4); }
  vgrad(g, xa - 2, 470, Wd, 80, [[0, 'rgba(8,2,4,0)'], [1, 'rgba(8,2,4,0.4)']]);
  // 4. the bridge (BR0 .. DECK1): planks laid across from rope to rope -- uneven widths and tones, some boards weathered grey, a few gaps
  //    and a broken end glowing with the lava below -- nailed to a log stringer along each edge; past its near edge the chasm (cleared: the
  //    live lava shows there); the stone lips it rests on at both ends, their cliff faces dropping into the lava
  if (xb > BR0 - 70 && xa < DECK1 + 70) {
    const bx0 = BR0 + 12, PB = 512, gx0 = Math.max(xa - 4, bx0), gx1 = Math.min(xb + 4, DECK1);
    if (gx1 > gx0) {   // (under the planks: the stringer's dark at both ends, the lava's glow between)
      vgrad(g, gx0, 360, gx1 - gx0, PB, [[0, '#2a160c'], [0.05, '#c8682a'], [0.16, '#3a1c0e'], [0.84, '#3a1c0e'], [0.94, '#d8702a'], [0.975, '#2a160c'], [1, '#2a160c']]);   // (dark under the middle: the lava's glow only near the ends)
    }
    { const sx0 = Math.max(xa - 4, bx0), sx1 = Math.min(xb + 4, DECK1);   // the back stringer log: under the boards' far ends (they overhang it), sagging with the deck
      if (sx1 > sx0) {
        const xs = []; for (let x = al(sx0, 8); x <= sx1 + 8; x += 8) xs.push(Math.min(Math.max(x, sx0), sx1));
        const edge = (dy) => xs.map((x) => [x, dy + deckSag(x)]);
        const top = edge(342), bot = edge(362);
        g.save(); g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]); g.closePath();
        const lgr = g.createLinearGradient(0, 342, 0, 366); lgr.addColorStop(0, '#6e4c30'); lgr.addColorStop(0.45, '#4a3222'); lgr.addColorStop(1, '#1e120a'); g.fillStyle = lgr; g.fill();
        g.clip(); g.strokeStyle = 'rgba(24,12,6,0.5)'; g.lineWidth = 1;   // (its grain: short dark checks along it)
        for (let x = al(sx0 - 40, 23); x < sx1 + 4; x += 23) { const i = Math.round(x / 23), y = 346 + hash2(i, 181) * 10 + deckSag(x); g.beginPath(); g.moveTo(x + hash2(i, 182) * 10, y); g.lineTo(x + 8 + hash2(i, 183) * 16, y + (hash2(i, 184) - 0.5) * 1.6); g.stroke(); }
        g.restore();
        g.strokeStyle = '#1a0e08'; g.lineWidth = 1.6; g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        g.strokeStyle = 'rgba(255,214,160,0.38)'; g.lineWidth = 1; g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y + 1.6) : g.moveTo(x, y + 1.6))); g.stroke();   // (its lit top edge)
      } }
    for (let px = bx0, k = 0; px < DECK1; k++) {
      const w = 26 + hash2(k, 91) * 26, gap = hash2(k, 96) > 0.8 ? 2.6 + hash2(k, 97) * 2.4 : 1.1, x0 = px, x1 = Math.min(px + w - gap, DECK1 + 2);
      px += w;
      if (x1 < xa - 8 || x0 > xb + 8) continue;
      const ov = 3 + hash2(k, 140) * 5, t0 = 358 - ov + deckSag(x0), t1 = 358 - ov + deckSag(x1), broke = hash2(k, 93) > 0.92, fe = broke ? PB - 12 - hash2(k, 94) * 14 : PB;   // (the far ends overhang the back stringer, unevenly)
      const q = [x0, t0, x1, t1, x1 + 1.5, fe, x0 - 1.5, broke ? fe + 7 : PB];
      const base = mix(mix('#76583a', '#664a34', hash2(k, 92)), '#6e6460', hash2(k, 95) > 0.7 ? 0.25 : 0.04);   // (board to board: close in tone -- the deck reads as one floor)
      g.fillStyle = base; poly(g, q); g.fill();
      g.save(); poly(g, q); g.clip();
      g.strokeStyle = rgba(darken(base, 0.45), 0.4); g.lineWidth = 1;   // (the grain along the board, soft)
      for (let gi = 0; gi < 3; gi++) { const gx = lerp(x0, x1, 0.2 + 0.3 * gi + (hash2(k, gi + 100) - 0.5) * 0.12); g.beginPath(); g.moveTo(gx, t0); g.bezierCurveTo(gx + (hash2(k, gi + 104) - 0.5) * 8, 410, gx + (hash2(k, gi + 108) - 0.5) * 8, 470, gx + (hash2(k, gi + 112) - 0.5) * 4, PB); g.stroke(); }
      if (hash2(k, 116) > 0.68) {   // (a knot, anywhere along it)
        const ky = 384 + hash2(k, 117) * 110, kx = lerp(x0, x1, 0.3 + 0.4 * hash2(k, 118));
        g.fillStyle = rgba(darken(base, 0.6), 0.55); g.beginPath(); g.ellipse(kx, ky, 4 + hash2(k, 119) * 2, 1.8 + hash2(k, 120), 0, 0, TAU); g.fill();   // (a knot, flattened: seen from above)
        g.strokeStyle = rgba(darken(base, 0.4), 0.45); g.beginPath(); g.ellipse(kx, ky, 8, 3.4, 0, 0, TAU); g.stroke();
      }
      vgrad(g, x0 - 2, 440, x1 - x0 + 4, PB, [[0, 'rgba(20,8,4,0)'], [1, 'rgba(20,8,4,0.22)']]);   // (darker toward the near stringer)
      vgrad(g, x0 - 2, t0 - 2, x1 - x0 + 4, 440, [[0, 'rgba(255,214,160,0.4)'], [0.4, 'rgba(255,214,160,0.15)'], [1, 'rgba(255,214,160,0)']]);   // (lit from above: paler toward its back end)
      vgrad(g, x0 - 2, t0, 3, PB, [[0, rgba(lighten(base, 0.3), 0.22)], [1, rgba(lighten(base, 0.3), 0.04)]]);   // (its lit edge, faint, fading toward us)
      vgrad(g, x1 - 3, t0, 4, PB, [[0, 'rgba(0,0,0,0.05)'], [1, 'rgba(0,0,0,0.12)']]);
      if (gap > 2) { for (const [ya, yb2] of [[362, 384], [488, 508]]) vgrad(g, x1 - 2.6, ya, 2.6, yb2, [[0, 'rgba(255,150,60,0)'], [0.5, 'rgba(255,150,60,0.45)'], [1, 'rgba(255,150,60,0)']]); }   // (the lava's glow up through a wide gap: only near the ends)
      if (hash2(k, 141) < 0.34) { const jy = 400 + hash2(k, 142) * 70; g.fillStyle = 'rgba(20,10,4,0.55)'; g.fillRect(x0, jy, x1 - x0, 1.6); g.fillStyle = rgba(lighten(base, 0.35), 0.35); g.fillRect(x0, jy + 1.6, x1 - x0, 1.2); }   // (one board in three jointed across)
      vgrad(g, x0 - 2, t0 - 2, x1 - x0 + 4, t0 + 8, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);   // (just the cut end's edge)
      if (!broke) { g.fillStyle = lighten(base, 0.16); g.fillRect(x0 - 2, PB - 7, x1 - x0 + 4, 7); g.fillStyle = 'rgba(255,140,50,0.32)'; g.fillRect(x0 - 2, PB - 4, x1 - x0 + 4, 4); g.fillStyle = 'rgba(30,14,6,0.6)'; g.fillRect(x0 - 2, PB - 8, x1 - x0 + 4, 1.4); }   // (the plank's end: its end grain, lit from the chasm)
      g.restore();
      for (const [ny, nk] of [[t0 + 16, 120], [fe - 14, 124]]) for (const f of [0.28, 0.72]) {   // (nails into the stringers; one missing here and there)
        if (hash2(k, nk + f * 10) < 0.2) continue;
        const nx = lerp(x0, x1, f) + (hash2(k, nk + f * 20) - 0.5) * 4;
        g.fillStyle = '#1c120c'; g.beginPath(); g.arc(nx, ny, 1.9, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,230,190,0.45)'; g.fillRect(nx - 1.1, ny - 1.3, 1.3, 0.9);
      }
      g.strokeStyle = '#2a1a10'; g.lineWidth = 1.7; poly(g, q); g.stroke();
    }
    { const sx0 = Math.max(xa - 4, bx0), sx1 = Math.min(xb + 4, DECK1);   // (the deck only: nothing spills onto the stone, nothing cut at a chunk join)
      if (sx1 > sx0) {
        g.save(); g.beginPath(); g.rect(sx0, 352, sx1 - sx0, PB - 352); g.clip();
        for (let x = al(sx0 - 300, 150) - 150; x < sx1 + 300; x += 150) { const i = Math.round(x / 150), v = 0.5 + vnoise(x, 420, 177); if (v < 0.25) continue; lightPool(g, x + hash2(i, 178) * 80, 404 + hash2(i, 179) * 16, 230, 30, '255,206,140', 0.26 * v); }   // (a warm sheen along the deck: the light flows across the boards)
        vgrad(g, sx0, 350, sx1 - sx0, 394, [[0, 'rgba(14,6,2,0)'], [0.3, 'rgba(14,6,2,0.28)'], [1, 'rgba(14,6,2,0)']]);   // (the far rope's soft shadow across them: ramped in and out, no straight edge)
        for (const x of POSTS) if (x + 80 > sx0 && x - 80 < sx1) { g.save(); g.translate(x + 10, 362); g.transform(1, 0, 0.9, 1, 0, 0); const sg = g.createLinearGradient(0, 0, 0, 90); sg.addColorStop(0, 'rgba(14,6,2,0.07)'); sg.addColorStop(1, 'rgba(14,6,2,0)'); g.fillStyle = sg; for (const hw of [10, 8, 6, 4, 2]) g.fillRect(-hw, 0, hw * 2, 90 - (10 - hw) * 3); g.restore(); }   // (each post's shadow slanting over the boards: soft-edged, fading)
        vgrad(g, sx0, 476, sx1 - sx0, 512, [[0, 'rgba(24,10,4,0)'], [1, 'rgba(24,10,4,0.24)']]);   // (darker at the near edge)
        g.restore();
      } }
    // the stringer log along the near edge, lashed where the posts stand
    const lx0 = Math.max(xa - 4, bx0 - 12), lx1 = Math.min(xb + 4, DECK1 + 12);
    if (lx1 > lx0) {
      vgrad(g, lx0, PB - 1, lx1 - lx0, PB + 11, [[0, '#7a5638'], [0.35, '#523826'], [1, '#22140c']]);
      g.strokeStyle = 'rgba(30,16,8,0.6)'; g.lineWidth = 1;
      for (let x = al(lx0, 37); x < lx1; x += 37) { const i = Math.round(x / 37); g.beginPath(); g.moveTo(x + hash2(i, 131) * 20, PB + 3 + hash2(i, 132) * 5); g.lineTo(x + 14 + hash2(i, 133) * 20, PB + 3 + hash2(i, 134) * 5); g.stroke(); }
      g.strokeStyle = '#1a0e08'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(lx0, PB - 1); g.lineTo(lx1, PB - 1); g.moveTo(lx0, PB + 11); g.lineTo(lx1, PB + 11); g.stroke();
      for (const x of POSTS) {
        if (x + 30 < lx0 || x - 30 > lx1) continue;
        for (const dx of [-8, -3, 2, 7]) { g.strokeStyle = LINE; g.lineWidth = 4.6; g.beginPath(); g.moveTo(x + dx, PB - 2); g.lineTo(x + dx + 2, PB + 12); g.stroke(); g.strokeStyle = '#c8aa72'; g.lineWidth = 2.4; g.stroke(); }
      }
    }
    // the stone lips at the deck's ends: chunky rounded basalt overlapping the first and last boards, casting a shadow onto them
    for (const [ex, f] of [[bx0, 1], [DECK1, -1]]) {
      if (ex + 60 < xa || ex - 60 > xb) continue;
      { const sg = g.createLinearGradient(ex + f * 4, 0, ex + f * 34, 0); sg.addColorStop(0, 'rgba(0,0,0,0.32)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.fillRect(f > 0 ? ex + 4 : ex - 34, 362, 30, PB - 362); }   // (their shadow on the boards: from under the log, fading away from the lip)
      for (const [k, cy, rx, ry, dx] of [[2, 478, 44, 36, -16], [1, 422, 22, 26, 4], [0, 384, 14, 16, 10]]) {
        const cx = ex + f * dx;
        ink(g, (g) => rockPath(g, cx, cy, rx, ry, 1600 + k * 7 + f, 7, 0.32), mix(BAS.base, BAS.hi, 0.1 + 0.16 * hash2(k, 168 + f)), 2.4, (g) => {
          g.fillStyle = 'rgba(255,255,255,0.14)'; poly(g, [cx - rx, cy - ry, cx + rx * 0.4, cy - ry, cx - rx * 0.2, cy - ry * 0.2, cx - rx, cy]); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.3)'; poly(g, [cx + rx * 0.1, cy - ry * 0.3, cx + rx + 2, cy - ry, cx + rx + 2, cy + ry, cx, cy + ry]); g.fill();
          const lg = g.createLinearGradient(cx - f * rx, 0, cx + f * rx, 0); lg.addColorStop(0, 'rgba(255,130,44,0)'); lg.addColorStop(1, 'rgba(255,130,44,0.35)'); g.fillStyle = lg; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
        });
      }
    }
    // the chasm: cleared below the stringer, between the two lips (the live lava shows through)
    const cx0 = Math.max(xa - 4, bx0 + 4), cx1 = Math.min(xb + 4, DECK1 - 4);
    if (cx1 > cx0) { g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fillRect(cx0, PB + 11, cx1 - cx0, H - PB); g.restore(); }
    // the lips: the stone floor's cliff edge at each end, a rock face dropping into the lava, lit orange from the chasm
    for (const [ex, sd] of [[bx0, -1], [DECK1, 1]]) {
      if (ex + 70 < xa || ex - 70 > xb) continue;
      const f = -sd;   // (the face looks toward the chasm)
      const face = [ex - f * 46, PB - 6, ex - f * 6, PB - 4, ex + f * 14, PB + 6, ex + f * 22, PB + 22, ex + f * 12, H + 10, ex - f * 50, H + 10];
      ink(g, (g) => poly(g, face), '#4a3a3c', 2.6, (g) => {
        g.fillStyle = 'rgba(255,255,255,0.1)'; poly(g, [ex - f * 46, PB - 6, ex - f * 6, PB - 4, ex + f * 4, PB + 2, ex - f * 40, PB + 4]); g.fill();
        const lg = g.createLinearGradient(ex - f * 30, 0, ex + f * 24, 0); lg.addColorStop(0, 'rgba(255,120,40,0)'); lg.addColorStop(1, 'rgba(255,130,44,0.6)'); g.fillStyle = lg; g.fillRect(ex - 60, PB - 8, 120, 60);
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.4; polyline(g, [ex - f * 30, PB + 10, ex - f * 8, PB + 18, ex + f * 6, PB + 30]); g.stroke();
      });
      lavaCrack(g, [ex - f * 36, PB + 26, ex - f * 18, PB + 22, ex - f * 4, PB + 32], 1, 0.8, true, true);
    }
  }
}
// the bridge deck's dip between its posts (every 150, at x 40 mod 150)
const deckSag = (x) => 4 * Math.sin(((x - 40) / 150) * Math.PI) ** 2;
// a faceted stalactite hanging from the ceiling: a jagged two-sided spike, shaded on its right, strata across it
function drawFang(g, tx, w, hh, col, seed, glow, warm = 1) {
  const j = (n, a) => (hash2(seed, n) - 0.5) * a, tip = tx + j(5, w * 0.5);
  const pts = [tx - w, -8, tx - w * 0.82 + j(1, 6), hh * 0.28, tx - w * 0.4 + j(2, 8), hh * 0.62, tip, hh, tx + w * 0.42 + j(3, 8), hh * 0.58, tx + w * 0.82 + j(4, 6), hh * 0.26, tx + w, -8];
  ink(g, (g) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length - 2; k += 2) g.quadraticCurveTo(pts[k], pts[k + 1], (pts[k] + pts[k + 2]) / 2, (pts[k + 1] + pts[k + 3]) / 2); g.lineTo(pts[pts.length - 2], pts[pts.length - 1]); g.closePath(); }, col, 2.8, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(tip, -10, w * 1.3, hh + 14);
    g.fillStyle = 'rgba(255,236,210,0.16)'; g.fillRect(tx - w, -10, w * 0.42, hh + 14);
    if (warm > 0.02) { const ug = g.createLinearGradient(0, hh * 0.45, 0, hh); ug.addColorStop(0, 'rgba(255,120,40,0)'); ug.addColorStop(1, `rgba(255,140,60,${0.42 * warm})`); g.fillStyle = ug; g.fillRect(tx - w, hh * 0.45, w * 2, hh * 0.6); }
    const cool = (1 - warm) * clamp(1 - tx / 1000, 0, 1); if (cool > 0.02) { g.fillStyle = `rgba(206,232,196,${0.3 * cool})`; g.fillRect(tx - w, -10, w * 0.5, hh + 14); }
    g.strokeStyle = 'rgba(0,0,0,0.26)'; g.lineWidth = 1.3;
    for (const f of [0.22, 0.46, 0.7]) { g.beginPath(); g.moveTo(tx - w, hh * f); g.lineTo(tx - w * 0.2, hh * f + j(7 + f * 9, 7)); g.lineTo(tx + w, hh * f + j(8 + f * 9, 5)); g.stroke(); }
  });
  if (glow) { g.fillStyle = 'rgba(255,150,50,0.9)'; g.beginPath(); g.arc(tip, hh - 3, 2.6, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,230,160,0.9)'; g.beginPath(); g.arc(tip, hh - 3, 1.1, 0, TAU); g.fill(); }
}
// the back wall (y 0..366): rock faces in jagged layers, strata, lava veins; stalactite fangs along the ceiling; in the cavern it ends in a ragged
// shore above the lava river
function drawWall(g, xa, xb) {
  const x0 = al(xa, 6) - 12;
  g.save();
  g.beginPath(); g.moveTo(x0, -8);
  for (let x = x0; x <= xb + 12; x += 6) g.lineTo(x, shoreAt(x));
  g.lineTo(xb + 12, -8); g.closePath(); g.clip();
  vgrad(g, x0, -8, xb - x0 + 14, GT0 + 50, [[0, '#1a1116'], [0.5, '#2c2026'], [1, '#3a2a30']]);
  // three layers of jagged facets: big and dark behind, small and lighter in front
  const PASS = [{ cw: 220, ch: 150, dk: 0.5, lw: 3 }, { cw: 140, ch: 100, dk: 0.26, lw: 2.8 }, { cw: 84, ch: 62, dk: 0.08, lw: 2.4 }];
  PASS.forEach((P, pi) => {
    for (let i = Math.floor((x0 - P.cw * 1.5) / P.cw); i * P.cw < xb + P.cw * 1.5; i++) {
      for (let jy = -1; jy * P.ch < GT0 + 70; jy++) {
        const s = i * 31 + jy * 7 + pi * 1000, h1 = hash2(s, 1), h2 = hash2(s, 2), h3 = hash2(s, 3), h4 = hash2(s, 4);
        const cx = i * P.cw + h1 * P.cw, cy = jy * P.ch + h2 * P.ch + (i & 1) * P.ch * 0.5, kM = kMof(cx);
        const rx = P.cw * (0.55 + 0.45 * h3), ry = P.ch * (0.5 + 0.45 * h4);
        if (cx - rx > MOUTH_END + 200) continue;   // (the cavern's wall is its ribs)
        const P0 = kM > 0.5 ? BASALT : ROCK, col = mix(mix(P0.base, P0.deep, P.dk), h3 < 0.5 ? P0.sh : P0.hi, 0.2 + Math.abs(h3 - 0.5) * 0.5);
        ink(g, (g) => rockPath(g, cx, cy, rx, ry, s, 8, 0.34), col, P.lw, (g) => {
          g.fillStyle = rgba(P0.hi, 0.2 + 0.1 * pi); g.fillRect(cx - rx, cy - ry, rx * 2, ry * 0.5);
          g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(cx + rx * 0.25, cy - ry, rx, ry * 2);
          // (the lava's light from below: warm on each rock's underside, stronger near the shore; the mouth's daylight cool from the left)
          const ul = kM * (0.18 + 0.22 * pi) * (0.5 + 0.5 * clamp(cy / 260, 0, 1));
          if (ul > 0.02) { const ug = g.createLinearGradient(0, cy, 0, cy + ry); ug.addColorStop(0, 'rgba(255,110,30,0)'); ug.addColorStop(1, `rgba(255,120,40,${ul})`); g.fillStyle = ug; g.fillRect(cx - rx, cy, rx * 2, ry + 2); }
          if (cx < 900) { g.fillStyle = `rgba(190,230,190,${0.12 * (1 - cx / 900) * (1 - kM)})`; g.fillRect(cx - rx, cy - ry, rx * 0.5, ry * 2); }
          if (pi === 0) { g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx - rx, cy + ry * 0.2); g.lineTo(cx, cy + ry * 0.1 + (h4 - 0.5) * 12); g.lineTo(cx + rx, cy + ry * 0.3); g.stroke(); }
        });
      }
    }
  });
  // the mouth's own big shapes: a dark recess going deeper, a few great ribs of the cave's rock (daylit, a warm hint toward the cavern)
  if (xa < 1300 && xb > 300) {
    const rc = [790, 380, 742, 300, 760, 210, 800, 120, 846, 96, 900, 118, 930, 200, 948, 300, 912, 384];
    ink(g, (g) => poly(g, rc), '#1c100e', 2.6, (g) => {
      vgrad(g, 730, 90, 230, 390, [[0, '#0e0606'], [0.55, '#22110e'], [1, '#4a2214']]);
      lightPool(g, 860, 350, 90, 60, '255,120,40', 0.3);
      g.save(); g.translate(0, 104); for (const [fx, fw, fh] of [[808, 10, 46], [872, 8, 34], [900, 6, 22]]) drawFang(g, fx, fw, fh, '#2a1a18', fx, false, 0.4); g.restore();   // (stalactites inside)
      g.strokeStyle = 'rgba(206,190,170,0.4)'; g.lineWidth = 7; polyline(g, [792, 382, 744, 300, 762, 210, 802, 120, 848, 96]); g.stroke();   // (its lit inner lip, toward the daylight)
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 10; polyline(g, [912, 384, 948, 300, 930, 200, 900, 118]); g.stroke();
    });
    for (const [rx, sd, fr] of [[430, 61, 0], [700, 63, 1], [985, 65, -1], [1210, 67, 0]]) drawRib(g, rx, sd, fr, true, true);
  }
  // the entrance (the left end): the jungle outside in daylight, framed by the mouth's thick rock lip
  if (xa < 330) {
    const edge = (y) => 36 + 230 * Math.pow(1 - clamp(y / 372, 0, 1), 0.55) + 10 * Math.sin(y * 0.05);
    const open = (g) => { g.beginPath(); g.moveTo(-20, -10); for (let y = -10; y <= GT0 + 40; y += 8) g.lineTo(edge(y), y); g.lineTo(-20, GT0 + 40); g.closePath(); };
    g.save(); open(g); g.clip();
    vgrad(g, -20, -10, 360, GT0 + 50, [[0, '#f6f2c8'], [0.4, '#bce08c'], [1, '#5e9a50']]);
    lightPool(g, 50, 110, 240, 170, '255,250,210', 0.8);
    g.save(); g.globalCompositeOperation = 'lighter';   // (shafts of sun slanting in)
    for (const [sx, sw] of [[-40, 40], [40, 26], [110, 34]]) { const lg = g.createLinearGradient(0, -10, 0, GT0); lg.addColorStop(0, 'rgba(255,250,200,0.24)'); lg.addColorStop(1, 'rgba(255,250,200,0)'); g.fillStyle = lg; poly(g, [sx, -10, sx + sw, -10, sx + sw + 120, GT0, sx + 120, GT0]); g.fill(); }
    g.restore();
    // palms and leaves outside, soft with the light
    for (const [px, py, k] of [[30, 330, 1.2], [140, 350, 0.9], [-10, 250, 1]]) {
      g.strokeStyle = 'rgba(52,84,50,0.8)'; g.lineWidth = 7 * k; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + 14 * k, py - 90 * k, px + 6 * k, py - 170 * k); g.stroke();
      for (let f = 0; f < 6; f++) { const a = -Math.PI / 2 + (f - 2.5) * 0.6; g.strokeStyle = 'rgba(70,120,70,0.75)'; g.lineWidth = 8 * k; g.beginPath(); g.moveTo(px + 6 * k, py - 170 * k); g.quadraticCurveTo(px + 6 * k + Math.cos(a) * 50 * k, py - 170 * k + Math.sin(a) * 40 * k - 20, px + 6 * k + Math.cos(a) * 90 * k, py - 170 * k + Math.sin(a) * 50 * k + 30 * k); g.stroke(); }
    }
    for (let i = 0; i < 30; i++) { const lx = hash1(i * 7) * 300 - 20, ly = 200 + hash1(i * 11) * 180; g.fillStyle = `rgba(${60 + (i % 3) * 20},${110 + (i % 4) * 15},${60},0.8)`; g.beginPath(); g.ellipse(lx, ly, 18 + hash1(i) * 20, 8 + hash1(i * 3) * 8, hash1(i * 5) - 0.5, 0, TAU); g.fill(); }
    g.restore();
    // the lip: a chunky arch of rock round the opening -- a rough outer edge, the daylight on its rim, its inner face dark, cracks across
    const lipW = (y) => 52 + 14 * Math.sin(y * 0.031 + 1) + 10 * hash2(Math.round(y / 24), 33);
    const IN = [], OUT = [];
    for (let y = -16, k = 0; y <= GT0 + 48; y += 16 + Math.round(hash2(k, 38) * 22), k++) { IN.push(edge(y) - 3 + (hash2(k, 36) - 0.5) * 8, y); OUT.push(edge(y) + lipW(y) + (hash2(k, 34) - 0.5) * 22, y + (hash2(k, 37) - 0.5) * 10); }
    IN.push(edge(GT0 + 48) - 3, GT0 + 48); OUT.push(edge(GT0 + 48) + lipW(GT0 + 48), GT0 + 48);
    const lp = IN.slice(); for (let k = OUT.length - 2; k >= 0; k -= 2) lp.push(OUT[k], OUT[k + 1]);
    ink(g, (g) => poly(g, lp), '#56403a', 3, (g) => {
      for (let k = 0; k < IN.length / 2 - 1; k++) {   // (its faces: alternately catching the daylight and in shadow, a break between each)
        const q = [IN[k * 2], IN[k * 2 + 1], IN[k * 2 + 2], IN[k * 2 + 3], OUT[k * 2 + 2], OUT[k * 2 + 3], OUT[k * 2], OUT[k * 2 + 1]];
        g.fillStyle = k % 2 ? 'rgba(10,4,6,0.28)' : 'rgba(220,236,200,0.14)'; poly(g, q); g.fill();
        g.strokeStyle = 'rgba(10,4,6,0.5)'; g.lineWidth = 1.6; polyline(g, [IN[k * 2 + 2], IN[k * 2 + 3], OUT[k * 2 + 2], OUT[k * 2 + 3]]); g.stroke();
      }
      g.strokeStyle = 'rgba(10,4,6,0.45)'; g.lineWidth = 16; polyline(g, OUT.map((v, i) => (i & 1 ? v : v - 8))); g.stroke();   // (the inner face, away from the light)
      g.strokeStyle = 'rgba(232,246,200,0.75)'; g.lineWidth = 6; polyline(g, IN.map((v, i) => (i & 1 ? v : v + 2))); g.stroke();   // (the daylit rim)
    });
    for (let k = 0; k < 6; k++) { const y = 20 + k * 22, x = edge(y) + 6; drawFang(g, x, 10 + hash2(k, 31) * 6, 20 + hash2(k, 32) * 26, mix('#6a4e42', '#4e382e', hash2(k, 33)), 300 + k, false, 0); }
  }
  // the cavern: the back row of ribs, the cracks climbing from the lava, the hollows, the front row framing them, the falls' spouts
  if (xb > MOUTH_END - 260) {
    for (let x = al(x0 - 240, 92); x < xb + 240; x += 92) { const i = Math.round(x / 92), cx = x + hash2(i, 51) * 56; if (kMof(cx) < 0.3) continue; drawRib(g, cx, 7000 + i, 0, false); }
    for (const h of HOLLOWS) if (h.x + h.hw + 80 > x0 && h.x - h.hw - 80 < xb) drawHollow(g, h);
    for (const r of RIBS) if (r.x + 160 > x0 && r.x - 160 < xb && kMof(r.x) > 0.2) drawRib(g, r.x, r.seed, r.frame, true);
  }
  // strata: long wavy bands across the mouth's face
  g.lineWidth = 1.8;
  const sx1 = Math.min(xb + 24, MOUTH_END + 60);
  if (sx1 > x0) for (const sy of [58, 128, 196, 262]) {
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.beginPath();
    for (let x = x0; x <= sx1; x += 24) { const y = sy + 9 * vnoise(x, 130, sy); if (x === x0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  // the river lights the rock above its shore
  for (let x = al(Math.max(x0, 1240), 8); x < Math.min(xb + 12, 1560); x += 8) {   // (8 px steps while it eases in across the mouth's joint; no overlaps)
    const k = kMof(x + 4); if (k < 0.02) continue;
    vgrad(g, x, 150, 8, 252, [[0, 'rgba(255,100,28,0)'], [1, `rgba(255,100,28,${0.34 * k})`]]);
  }
  { const gx0 = Math.max(x0, 1560), gx1 = xb + 14; if (gx1 > gx0) vgrad(g, gx0, 150, gx1 - gx0, 252, [[0, 'rgba(255,100,28,0)'], [1, 'rgba(255,100,28,0.34)']]); }   // (the clip leaves only the rock above the shore)
  // the ceiling and its fangs: a dark cap, a back row of small fangs, the front row
  vgrad(g, x0, -8, xb - x0 + 14, 120, [[0, 'rgba(6,2,4,0.95)'], [1, 'rgba(6,2,4,0)']]);
  for (const f of FALLS) if (f.x + 60 > x0 && f.x - 60 < xb) drawSpout(g, f);   // (the falls' channels: over the roof's shade, under its fangs -- lit like the live falls)
  for (const row of [0, 1]) {
    for (const t of LAY.teeth) {
      for (let rep = Math.floor((x0 - t.x) / 1560) - 1; ; rep++) {
        const tx = t.x + rep * 1560 + (row ? 0 : 39); if (tx > xb + 60) break; if (tx < x0 - 60) continue;
        const kM = kMof(tx), mouth = kM < 0.5, seed = Math.round(tx) + row * 3;
        if (row) drawFang(g, tx, t.w * (mouth ? 0.8 + 0.4 * hash2(seed, 21) : 1), t.h * (mouth ? 1.1 + 0.8 * hash2(seed, 22) : 0.8), mouth ? mix('#6e5244', '#523a30', hash2(seed, 23)) : '#3a2a2a', seed, !mouth && hash2(seed, 6) > 0.72, kM);
        else drawFang(g, tx, t.w * 0.7, t.h * (mouth ? 0.95 : 0.5), mouth ? '#4a3430' : '#261a1c', seed, false, kM);
      }
    }
  }
  g.restore();
  // the shore's rim: the river lights the rock's underside; small stalactite drips hang over the lava
  for (let x = x0; x < xb + 12; x += 6) {
    const k = kMof(x); if (k < 0.04) continue;
    const y = shoreAt(x), y2 = shoreAt(x + 6);
    g.strokeStyle = `rgba(255,120,36,${0.75 * k})`; g.lineWidth = 3.6; g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + 6, y2 + 1); g.stroke();
    g.strokeStyle = 'rgba(12,6,8,0.92)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, y - 1); g.lineTo(x + 6, y2 - 1); g.stroke();
  }
  // (no rocks out in the lava: they read as stepping stones)
}

// the tongues of rock lying out in the lava below the far bank (where spur() says): a flattened boulder, its top lit, its face lit from the
// lava below, a hot line where the lava wraps its foot
function bankRocks(g, x0, xb) {
  for (let i = Math.floor((x0 - 200) / 200); i * 200 < xb + 200; i++) {
    const h = hash2(i, 44); if (h < 0.3) continue;
    const cx = (i + 0.28 + 0.44 * hash2(i, 45)) * 200, k = spur(cx); if (k < 0.15 || kMof(cx) < 0.6) continue;
    const rx = 24 + 26 * hash2(i, 46) * k + 10, reach = 10 + 14 * k, pts = [], bot = [];
    for (let q = 0; q <= 6; q++) { const x = cx - rx + (q / 6) * rx * 2; pts.push(x, shoreY(x) - 3); }
    for (let q = 6; q >= 0; q--) { const u = q / 6, x = cx - rx + u * rx * 2 + (hash2(i, q + 50) - 0.5) * 8, y = shoreY(x) + reach * Math.sin(u * Math.PI) ** 0.7 + (hash2(i, q + 60) - 0.5) * 6; bot.push(x, y); }
    const all = pts.concat(bot);
    lightPool(g, cx, shoreY(cx) + reach, rx * 1.3, 10, '255,190,90', 0.55);   // (the lava glowing round its foot)
    ink(g, (g) => poly(g, all), '#3a2420', 2.2, (g) => {
      vgrad(g, cx - rx, shoreY(cx) - 4, rx * 2, shoreY(cx) + reach + 4, [[0, 'rgba(20,8,6,0.4)'], [0.6, 'rgba(255,110,36,0.1)'], [1, 'rgba(255,140,50,0.55)']]);
    });
    g.strokeStyle = 'rgba(255,200,110,0.85)'; g.lineWidth = 1.8; polyline(g, bot.map((v, j) => (j & 1 ? v + 1 : v))); g.stroke();
  }
}
// a stalagmite cluster (a tall spire and two smaller): the sprite's origin is the base centre, up is -y.  pale = the mouth's lower fangs
function spire(g, cx, wb, hh, col, seed, glow) {
  // a stalagmite as the wall's rock: lumpy (it bulges and pinches where the drips built it up), ribbed with grooves running up it, a lit plane
  // and a shadowed one; in the cavern, the lava behind it rims both its edges (and warms its foot)
  const j = (n, a) => (hash2(seed, n) - 0.5) * a, N = 9, tip = cx + j(1, wb * 0.4), L = [], R = [];
  const half = (u) => wb * Math.pow(1 - u, 0.85) * (1 + 0.16 * Math.sin(u * 8 + seed) + 0.08 * Math.sin(u * 19 + seed * 2));
  const mid = (u) => lerp(cx, tip, Math.pow(u, 1.2)) + j(30 + Math.round(u * 9), 4) * (1 - u);
  for (let k = 0; k <= N; k++) { const u = k / N; L.push(mid(u) - half(u) + j(k + 40, 3) * (1 - u), -hh * u); R.push(mid(u) + half(u) + j(k + 60, 3) * (1 - u), -hh * u); }
  const pts = []; for (let k = 0; k < L.length; k += 2) pts.push(L[k], L[k + 1]); for (let k = R.length - 2; k >= 0; k -= 2) pts.push(R[k], R[k + 1]);
  const line = (f) => { const o = []; for (let k = 0; k <= N; k++) { const u = k / N; o.push(mid(u) + f * half(u), -hh * u); } return o; };
  ink(g, (g) => blob(g, pts), col.base, 3, (g) => {
    const lit = line(-0.25), sh = line(0.3);
    g.fillStyle = rgba(col.hi, 0.42); poly(g, [cx - wb - 8, 6].concat(lit, [tip - wb, -hh - 6])); g.fill();          // (the lit plane)
    g.fillStyle = rgba(col.sh, 0.85); poly(g, sh.concat([cx + wb + 8, -hh - 6, cx + wb + 8, 6])); g.fill();          // (the shadowed plane)
    g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = 1.4;                                                              // (grooves running up it)
    for (const f of [-0.55, 0.05, 0.6]) { curve(g, line(f).slice(0, 16)); g.stroke(); }
    g.strokeStyle = rgba(col.hi, 0.35); g.lineWidth = 1; curve(g, line(-0.62).slice(0, 14)); g.stroke();
    for (let k = 1; k < 4; k++) { const u = k * 0.22 + j(k + 80, 0.06), y = -hh * u, hw = half(u); g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(mid(u) - hw, y + 2); g.quadraticCurveTo(mid(u), y + 5, mid(u) + hw, y + 1); g.stroke(); }   // (the drip ledges' lips)
    if (glow) {
      const gr = g.createLinearGradient(0, 0, 0, -hh * 0.5); gr.addColorStop(0, 'rgba(255,110,30,0.55)'); gr.addColorStop(1, 'rgba(255,110,30,0)');
      g.fillStyle = gr; g.fillRect(cx - wb - 6, -hh * 0.5, wb * 2 + 12, hh * 0.5 + 6);
      for (const [side, a] of [[L, 0.5], [R, 0.8]]) { g.beginPath(); for (let k = 0; k < side.length; k += 2) { if (k) g.lineTo(side[k], side[k + 1]); else g.moveTo(side[k], side[k + 1]); } g.lineWidth = 5; g.strokeStyle = `rgba(255,150,60,${a})`; g.stroke(); }   // (the lava behind it rims both edges)
    } else { g.beginPath(); for (let k = 0; k < L.length; k += 2) { if (k) g.lineTo(L[k], L[k + 1]); else g.moveTo(L[k], L[k + 1]); } g.lineWidth = 4; g.strokeStyle = 'rgba(214,236,200,0.3)'; g.stroke(); }   // (the mouth's: the daylight on its left edge)
  });
  if (glow && hash2(seed, 12) > 0.45) taperCrack(g, crackPts(cx + wb * 0.1, -2, cx - wb * 0.1, -hh * 0.45, seed, 5, 4), 2.2, 0.6, 0.9);
}
function stump(g, cx, wb, hh, col, seed, glow) {   // (a broken stalagmite: a jagged flat top)
  const j = (n, a) => (hash2(seed, n) - 0.5) * a;
  const pts = [cx - wb, 0, cx - wb * 0.82, -hh * 0.5, cx - wb * 0.62, -hh + j(1, 6), cx - wb * 0.2, -hh - 6 + j(2, 6), cx + wb * 0.1, -hh + 4, cx + wb * 0.45, -hh - 2 + j(3, 6), cx + wb * 0.66, -hh + 6, cx + wb * 0.84, -hh * 0.5, cx + wb, 0];
  ink(g, (g) => poly(g, pts), col.base, 3, (g) => {
    g.fillStyle = rgba(col.hi, 0.45); poly(g, [cx - wb - 4, 4, cx - wb - 4, -hh - 8, cx - wb * 0.3, -hh - 8, cx - wb * 0.36, 4]); g.fill();
    g.fillStyle = rgba(col.sh, 0.9); poly(g, [cx + wb * 0.3, 4, cx + wb * 0.34, -hh - 8, cx + wb + 4, -hh - 8, cx + wb + 4, 4]); g.fill();
    g.fillStyle = rgba(col.hi, 0.7); poly(g, [cx - wb * 0.62, -hh, cx - wb * 0.2, -hh - 6, cx + wb * 0.45, -hh - 2, cx + wb * 0.3, -hh + 5, cx - wb * 0.4, -hh + 5]); g.fill();   // (the broken face, catching light)
    if (glow) { const gr = g.createLinearGradient(0, 0, 0, -hh * 0.6); gr.addColorStop(0, 'rgba(255,110,30,0.6)'); gr.addColorStop(1, 'rgba(255,110,30,0)'); g.fillStyle = gr; g.fillRect(cx - wb - 4, -hh, wb * 2 + 8, hh + 4); }
  });
}
function drawSpires(g, seed, pale) {
  const col = pale ? { base: '#6a4e42', sh: '#3e2a24', hi: '#9a7a64' } : { base: '#3a2a2c', sh: '#1e1416', hi: '#5e4644' };
  const R = (n) => hash2(seed, n), n = 1 + Math.floor(R(20) * 3.99), list = [];
  for (let k = 0; k < n; k++) {
    const x = n === 1 ? 0 : lerp(-44, 44, k / (n - 1)) + (R(30 + k) - 0.5) * 18, big = k === Math.floor(R(21) * n);
    list.push({ x, wb: (big ? 26 : 16) + R(40 + k) * 10, hh: big ? 110 + R(50 + k) * 76 : 44 + R(50 + k) * 70, stump: !big && R(60 + k) > 0.7, k });
  }
  list.sort((a, b) => a.hh - b.hh).reverse();   // (the tallest behind)
  for (const q of list) (q.stump ? stump : spire)(g, q.x, q.wb, q.stump ? q.hh * 0.55 : q.hh, col, seed + q.k, !pale);
}
// a basalt column from the floor (origin, y=0) up to the ceiling (y=-372): waisted, jointed, lit from the river below
function drawColumn(g, seed) {
  const HT = 372, wb = 42 + hash2(seed, 1) * 8, ww = 19 + hash2(seed, 2) * 6, N = 10, Lp = [], Rp = [];
  const half = (t, s) => ww + (wb - ww) * Math.pow(Math.abs(2 * t - 1), 1.7) + (hash2(seed, 10 + Math.round(t * N) * 3 + s) - 0.5) * 7;
  for (let k = 0; k <= N; k++) { const t = k / N, y = -HT * t; Lp.push(-half(t, 0), y); Rp.push(half(t, 1), y); }
  const pts = Lp.slice(); for (let k = Rp.length - 2; k >= 0; k -= 2) pts.push(Rp[k], Rp[k + 1]);
  const face = (f0, f1) => { const o = []; for (let k = 0; k <= N; k++) { const t = k / N; o.push(half(t, 0) * f0, -HT * t); } for (let k = N; k >= 0; k--) { const t = k / N; o.push(half(t, 1) * f1, -HT * t); } return o; };
  ink(g, (g) => poly(g, pts), '#3e2e32', 3.2, (g) => {
    g.fillStyle = 'rgba(190,150,130,0.16)'; poly(g, face(-1.2, -0.5)); g.fill();   // (the lit face)
    g.fillStyle = 'rgba(0,0,0,0.36)'; poly(g, face(0.35, 1.3)); g.fill();          // (the shadowed face)
    g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 1.4;
    for (const fx of [-0.5, 0.35]) { g.beginPath(); for (let k = 0; k <= N; k++) { const t = k / N, x = half(t, fx < 0 ? 0 : 1) * fx + (hash2(seed, 40 + k + fx * 10) - 0.5) * 3; if (k) g.lineTo(x, -HT * t); else g.moveTo(x, -HT * t); } g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1.6;
    for (let k = 0; k < 6; k++) { const y = -40 - k * 56 - hash2(seed, 60 + k) * 20; g.beginPath(); g.moveTo(-wb, y); g.lineTo(0, y + (hash2(seed, 70 + k) - 0.5) * 8); g.lineTo(wb, y); g.stroke(); }
    const gr = g.createLinearGradient(0, 0, 0, -150); gr.addColorStop(0, 'rgba(255,110,30,0.62)'); gr.addColorStop(1, 'rgba(255,110,30,0)');
    g.fillStyle = gr; g.fillRect(-wb - 4, -150, wb * 2 + 8, 154);
    const tg = g.createLinearGradient(0, -HT, 0, -HT * 0.55); tg.addColorStop(0, 'rgba(6,2,4,0.6)'); tg.addColorStop(1, 'rgba(6,2,4,0)'); g.fillStyle = tg; g.fillRect(-wb - 4, -HT - 4, wb * 2 + 8, HT * 0.5);
    for (const sd of [0, 1]) { g.beginPath(); for (let k = 0; k <= 5; k++) { const t = k / N; const x = (sd ? 1 : -1) * (half(t, sd) - 1.5); if (k) g.lineTo(x, -HT * t); else g.moveTo(x, -HT * t); } g.lineWidth = 5; g.strokeStyle = sd ? 'rgba(255,150,60,0.7)' : 'rgba(255,150,60,0.45)'; g.stroke(); }   // (the lava's rim light)
  });
  taperCrack(g, crackPts(ww * 0.2, -150, -ww * 0.3, -300, seed, 7, 5), 2.4, 0.6, 0.9);
}
// the bridge's ropes: posts, a far rope (behind the heroes) and a sagging near-edge rope
// a post's top: three turns of rope and a knot (no brass)
function ropeCap(g, x, y, r) {
  for (let k = 0; k < 3; k++) { const yy = y + k * 6; g.lineCap = 'round'; g.strokeStyle = LINE; g.lineWidth = 6; g.beginPath(); g.moveTo(x - r + 1, yy + 2); g.lineTo(x + r - 1, yy - 1); g.stroke(); g.strokeStyle = '#d2b47c'; g.lineWidth = 3.2; g.stroke(); }
  g.fillStyle = '#b89a62'; g.strokeStyle = LINE; g.lineWidth = 2; g.beginPath(); g.arc(x + r * 0.5, y + 6, 3.6, 0, TAU); g.fill(); g.stroke();
}
function handRope(g, x0, x1, y, dip, lw, col) {
  g.strokeStyle = LINE; g.lineWidth = lw + 3; g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo((x0 + x1) / 2, y + dip * 2, x1, y); g.stroke();
  g.strokeStyle = col; g.lineWidth = lw; g.stroke();
}
const ropeAt = (x0, x1, y, dip, x) => { const u = (x - x0) / (x1 - x0); return y + 4 * dip * u * (1 - u); };   // (handRope's height at x: dip = its sag)
// the bridge's posts: an anchor post at each lip, between them one every 150 (x 40 mod 150); its spans run post to post
const ANCHORS = [BR0 + 18, DECK1 - 10];
const POSTS = (() => { const o = []; for (let x = Math.ceil((ANCHORS[0] + 60 - 40) / 150) * 150 + 40; x < ANCHORS[1] - 60; x += 150) o.push(x); return o; })();
function spans(a, b) {
  const P = [ANCHORS[0], ...POSTS, ANCHORS[1]], o = [];
  for (let i = 0; i < P.length - 1; i++) if (P[i + 1] > a - 20 && P[i] < b + 20) o.push([P[i], P[i + 1]]);
  return o;
}
function post(g, x, y0, y1, w, col) {
  ink(g, (g) => { g.beginPath(); g.moveTo(x - w / 2, y1); g.lineTo(x - w / 2 + 1, y0 + 3); g.quadraticCurveTo(x, y0 - 3, x + w / 2 - 1, y0 + 3); g.lineTo(x + w / 2, y1); g.closePath(); }, col, 2.4, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x - w / 2, y0 - 4, w * 0.25, y1 - y0 + 8);
    g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(x + w * 0.12, y0 - 4, w * 0.4, y1 - y0 + 8);
    g.strokeStyle = 'rgba(30,16,8,0.5)'; g.lineWidth = 1; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - w * 0.2 + k * w * 0.2, y0 + 8 + k * 9); g.lineTo(x - w * 0.18 + k * w * 0.2, y1 - 6); g.stroke(); }
    const ug = g.createLinearGradient(0, y1 - 40, 0, y1); ug.addColorStop(0, 'rgba(255,120,40,0)'); ug.addColorStop(1, 'rgba(255,120,40,0.35)'); g.fillStyle = ug; g.fillRect(x - w, y1 - 40, w * 2, 40);
  });
}
function drawBridgeFar(g, xa, xb) {
  if (xb < BR0 - 60) return;
  // the far landing's back: the cave's wall comes down to the floor, a bank of rock lit from the lake on its left (the altar stands before it)
  if (xb > DECK1 - 120) {
    const bank = [DECK1 - 70, 400, DECK1 - 44, 356, DECK1 - 22, 322, DECK1 + 6, 296, DECK1 + 44, 272, DECK1 + 100, 256, DECK1 + 170, 248, LEVEL_LEN + 30, 242, LEVEL_LEN + 30, 400];
    ink(g, (g) => poly(g, bank), '#4a3432', 2.6, (g) => {
      for (let k = 0; k < 9; k++) {   // (boulders and slabs in it)
        const bx = DECK1 + 10 + k * 34 + hash2(k, 141) * 20, by = 268 + hash2(k, 142) * 70 + (k < 2 ? 40 - k * 16 : 0), rx = 24 + hash2(k, 143) * 22, ry = 14 + hash2(k, 144) * 12;
        ink(g, (g) => rockPath(g, bx, by, rx, ry, 1400 + k, 8, 0.3), mix('#56403a', '#3e2c2c', hash2(k, 145)), 2, (g) => { g.fillStyle = 'rgba(255,220,190,0.12)'; g.fillRect(bx - rx, by - ry, rx * 2, ry * 0.6); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bx + rx * 0.3, by - ry, rx, ry * 2); });
      }
      const lg = g.createLinearGradient(DECK1 - 60, 0, DECK1 + 120, 0); lg.addColorStop(0, 'rgba(255,130,44,0.55)'); lg.addColorStop(1, 'rgba(255,130,44,0)'); g.fillStyle = lg; g.fillRect(DECK1 - 80, 240, 220, 170);
      vgrad(g, DECK1 - 80, 240, LEVEL_LEN - DECK1 + 120, 300, [[0, 'rgba(8,2,4,0.45)'], [1, 'rgba(8,2,4,0)']]);
      vgrad(g, DECK1 - 80, 330, LEVEL_LEN - DECK1 + 120, 400, [[0, 'rgba(255,110,36,0)'], [1, 'rgba(255,110,36,0.22)']]);
    });
    taperCrack(g, [DECK1 + 30, 340, DECK1 + 50, 322, DECK1 + 74, 312, DECK1 + 92, 292], 3, 0.7, 0.85);
  }
  const sp = spans(xa, xb);
  // suspenders: short ropes from the hand rope down to the deck's back edge
  for (const [x0, x1] of sp) for (const u of x1 - x0 > 100 ? [0.26, 0.5, 0.74] : [0.5]) {
    const x = lerp(x0, x1, u), y = ropeAt(x0, x1, 276, 9, x), yb = 360 + deckSag(x), sl = (hash2(Math.round(x), 171) - 0.5) * 8;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + sl, (y + yb) / 2, x + 1, yb);
    g.strokeStyle = LINE; g.lineWidth = 4; g.stroke(); g.strokeStyle = '#b89c64'; g.lineWidth = 2; g.stroke();
    g.setLineDash([2, 3]); g.strokeStyle = 'rgba(90,64,30,0.8)'; g.lineWidth = 2; g.stroke(); g.setLineDash([]);   // (its twist)
  }
  for (const [x0, x1] of sp) { handRope(g, x0, x1, 300, 7, 3, '#b4985e'); handRope(g, x0, x1, 276, 9, 3.2, '#c4a870'); }
  for (const x of POSTS) if (x + 30 > xa && x - 30 < xb) { post(g, x, 262, 364, 16, '#6a4a2e'); ropeCap(g, x, 262, 9); }
  // the anchor posts at the lips: thick logs driven into the rock, the hand ropes wound round them
  for (const x of ANCHORS) {
    if (x + 40 < xa || x - 40 > xb) continue;
    post(g, x, 240, 368, 24, '#5e4028'); ropeCap(g, x, 268, 13); ropeCap(g, x, 292, 13);
  }
}
function drawBridgeNear(g, xa, xb) {
  if (xb < BR0 - 60) return;
  const sp = spans(xa, xb);
  for (const [x0, x1] of sp) { handRope(g, x0, x1, 524, 6, 3.6, '#c8aa72'); handRope(g, x0, x1, 502, 8, 3.8, '#d2b47c'); }
  for (const x of POSTS) if (x + 30 > xa && x - 30 < xb) { post(g, x, 496, 542, 18, '#7a5636'); ropeCap(g, x, 496, 10); }
  for (const x of ANCHORS) {
    if (x + 40 < xa || x - 40 > xb) continue;
    post(g, x, 484, 546, 26, '#6a4a2e'); ropeCap(g, x, 494, 14); ropeCap(g, x, 516, 14);
  }
}
// the altar at the bridge's far end (origin: its foot on the landing's back edge): a stepped block of cut stone -- three tiers, each with its
// top face -- a sun carved and inlaid in gold on its front, on top the Sun Key's stone mount (a half-disc rimmed in gold, three slots, the
// middle one glowing where the wedge belongs); the lava's light from below and from the lake on its left
function drawPedestal(g) {
  const ST = { base: '#5c5456', sh: '#383234', hi: '#8c8284', dk: '#1c181a' }, GOLD = '#e2b232';
  ink(g, (g) => blob(g, [-72, 8, -68, -6, -40, -12, 0, -14, 44, -12, 70, -4, 74, 8, 30, 13, -30, 13]), '#3e2e2e', 2.6, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-80, 0, 160, 16);
    const ug = g.createLinearGradient(-80, 0, 40, 0); ug.addColorStop(0, 'rgba(255,130,44,0.5)'); ug.addColorStop(1, 'rgba(255,130,44,0)'); g.fillStyle = ug; g.fillRect(-80, -16, 120, 32);
  });
  lavaCrack(g, [-56, 6, -42, 0, -30, 8, -14, 4], 1, 0.9, false, true);
  const tier = (x0, x1, y0, y1, d) => {
    ink(g, (g) => poly(g, [x0, y1, x0, y0, x1, y0, x1, y1]), ST.base, 2.6, (g) => {
      g.fillStyle = ST.sh; g.fillRect(x1 - (x1 - x0) * 0.26, y0 - 2, (x1 - x0) * 0.3, y1 - y0 + 4);
      g.fillStyle = rgba(ST.hi, 0.55); g.fillRect(x0, y0, 3.4, y1 - y0);
      g.strokeStyle = rgba(ST.dk, 0.6); g.lineWidth = 1.2;
      const ym = y1 - y0 > 30 ? (y0 + y1) / 2 + 2 : y1;   // (cut blocks: the joints staggered course to course)
      for (let x = x0 + 20 + (y0 & 7); x < x1 - 8; x += 30) { g.beginPath(); g.moveTo(x, y0 + 1); g.lineTo(x + 1, ym); g.stroke(); }
      if (ym < y1) { for (let x = x0 + 35 + (y0 & 7); x < x1 - 8; x += 30) { g.beginPath(); g.moveTo(x, ym); g.lineTo(x + 1, y1); g.stroke(); } g.beginPath(); g.moveTo(x0, ym); g.lineTo(x1, ym - 1); g.stroke(); }
      g.strokeStyle = 'rgba(255,150,60,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + 2, y1 - 1.5); g.lineTo(x1 - 2, y1 - 1.5); g.stroke();   // (the lava's rim light along its foot)
      const ug = g.createLinearGradient(0, y0, 0, y1); ug.addColorStop(0, 'rgba(255,120,40,0)'); ug.addColorStop(1, 'rgba(255,120,40,0.34)'); g.fillStyle = ug; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      const lg = g.createLinearGradient(x0, 0, x0 + 30, 0); lg.addColorStop(0, 'rgba(255,140,50,0.4)'); lg.addColorStop(1, 'rgba(255,140,50,0)'); g.fillStyle = lg; g.fillRect(x0, y0, 30, y1 - y0);
      g.fillStyle = rgba(ST.dk, 0.5); g.beginPath(); g.moveTo(x1 - 10, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + 8); g.closePath(); g.fill();   // (a chipped corner)
    });
    ink(g, (g) => poly(g, [x0 - 1, y0, x0 + d, y0 - d, x1 - d, y0 - d, x1 + 1, y0]), ST.hi, 2, (g) => { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x1 - (x1 - x0) * 0.3, y0 - d - 1, (x1 - x0) * 0.3, d + 2); });
  };
  tier(-62, 62, -24, 0, 6);
  tier(-50, 50, -46, -24, 6);
  tier(-38, 38, -102, -46, 6);
  // the carved sun, inlaid in gold
  g.save(); g.translate(-3, -74);
  const BZ = '#b08a4e', BZd = '#5a4228';
  for (let k = 0; k < 12; k++) {   // (rays: long tapered triangles cut flush into the stone)
    const an = k * TAU / 12 + TAU / 24, r1 = k & 1 ? 20 : 25, hw = 0.13;
    g.beginPath(); g.moveTo(Math.cos(an - hw) * 11, Math.sin(an - hw) * 11); g.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); g.lineTo(Math.cos(an + hw) * 11, Math.sin(an + hw) * 11); g.closePath();
    g.fillStyle = rgba(BZ, 0.75); g.fill(); g.strokeStyle = rgba(BZd, 0.7); g.lineWidth = 1; g.stroke();
  }
  g.fillStyle = rgba(BZ, 0.8); g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fill(); g.strokeStyle = rgba(BZd, 0.8); g.lineWidth = 1.4; g.stroke();
  g.strokeStyle = rgba(BZd, 0.6); g.lineWidth = 1.1;   // (a faint face, like the Key's)
  for (const ex of [-3.8, 3.8]) { g.beginPath(); g.arc(ex, -1.5, 1.6, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  g.beginPath(); g.arc(0, 1.5, 4, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
  g.restore();
  // the Sun Key's mount: the whole disc carved in stone on a short collar, rimmed in gold; the cave's piece's place empty and glowing
  const MY = -124, MR = 31;
  ink(g, (g) => { g.beginPath(); g.arc(0, MY, MR, 0, TAU); }, ST.base, 2.6, (g) => {
    g.fillStyle = ST.sh; g.beginPath(); g.arc(MR * 0.35, MY + MR * 0.2, MR, 0, TAU); g.fill();
    g.fillStyle = ST.base; g.beginPath(); g.arc(-2, MY - 2, MR - 3, 0, TAU); g.fill();
    g.save(); g.translate(0, MY); keyRays(g, MR, MR * 0.44, -Math.PI, Math.PI, rgba(ST.hi, 0.85), rgba(ST.dk, 0.8)); g.restore();
    g.fillStyle = rgba(ST.hi, 0.6); g.beginPath(); g.arc(0, MY, MR * 0.44, 0, TAU); g.fill(); g.strokeStyle = rgba(ST.dk, 0.85); g.lineWidth = 1.6; g.stroke();   // (the carved sun face)
    g.fillStyle = rgba(ST.dk, 0.9); for (const ex of [-4.2, 4.2]) { g.beginPath(); g.ellipse(ex, MY - 2, 1.7, 1.3, 0, 0, TAU); g.fill(); }
    g.lineWidth = 1.4; g.beginPath(); g.arc(0, MY + 1, 5, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
    for (const a of [KEY_A0, KEY_A1, KEY_A1 + TAU / 3]) { g.beginPath(); g.moveTo(0, MY); g.lineTo(Math.cos(a) * MR, MY + Math.sin(a) * MR); g.stroke(); }
    // (the empty place: deep, glowing gold from inside)
    g.fillStyle = 'rgba(255,190,80,0.92)'; g.beginPath(); g.moveTo(0, MY); g.arc(0, MY, MR - 4, KEY_A0 + 0.03, KEY_A1 - 0.03); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,248,200,0.85)'; g.beginPath(); g.moveTo(2, MY - 2); g.arc(0, MY, MR - 14, KEY_A0 + 0.2, KEY_A1 - 0.2); g.closePath(); g.fill();
  });
  g.strokeStyle = ST.dk; g.lineWidth = 3.4; g.beginPath(); g.arc(0, MY, MR - 2, 0, TAU); g.stroke();
  g.strokeStyle = GOLD; g.lineWidth = 2.2; g.stroke();

}

// the Sun Key's piece from the cave (after book2/panels/sunkey_canon.png: a gold disc in three pieces, star rays round a sun face): the
// sector from 12 to 4 o'clock, the face's right eye on it.  origin: the disc's centre (the piece's point); r: the disc's radius
const KEY_A0 = -Math.PI / 2, KEY_A1 = Math.PI / 6;
function keyRays(ctx, r, rs, a0, a1, fill, line) {   // (book2/panels/sunkey_canon.png: 12 equal rays, a ray every 30 deg from 12 o'clock -- one along each cut line)
  for (let k = 0; k < 12; k++) {
    let a = -Math.PI / 2 + k * Math.PI / 6; const hw = 0.085, r1 = r * 0.86;
    while (a < a0 - 0.3) a += TAU; while (a > a1 + 0.3) a -= TAU;
    if (a + hw < a0 - 1e-6 || a - hw > a1 + 1e-6) continue;
    ctx.beginPath(); ctx.moveTo(Math.cos(a - hw) * rs * 1.04, Math.sin(a - hw) * rs * 1.04); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a + hw) * rs * 1.04, Math.sin(a + hw) * rs * 1.04); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke();
  }
}
function drawWedge(ctx, r) {
  const rs = r * 0.36, slice = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, KEY_A0, KEY_A1); ctx.closePath(); };
  ctx.save(); ctx.translate(r * 0.04, r * 0.07); slice(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  const gr = ctx.createRadialGradient(-r * 0.2, -r * 0.3, 0, 0, 0, r); gr.addColorStop(0, '#ffd85a'); gr.addColorStop(1, '#e0a22a');
  slice(); ctx.fillStyle = gr; ctx.fill();
  ctx.save(); slice(); ctx.clip();
  ctx.strokeStyle = 'rgba(140,90,16,0.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, KEY_A0, KEY_A1); ctx.stroke();   // (the rim's line)
  keyRays(ctx, r, rs, KEY_A0, KEY_A1, '#ffe690', 'rgba(90,56,10,0.9)');
  const fg = ctx.createRadialGradient(-rs * 0.3, -rs * 0.3, 0, 0, 0, rs); fg.addColorStop(0, '#ffeaa0'); fg.addColorStop(1, '#eeb040');
  ctx.beginPath(); ctx.arc(0, 0, rs, 0, TAU); ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = 'rgba(70,40,8,0.95)'; ctx.lineWidth = 1.6; ctx.stroke();
  const ex = Math.cos(-0.62) * rs * 0.52, ey = Math.sin(-0.62) * rs * 0.52;   // (the face's right eye and its brow)
  ctx.fillStyle = '#2a1a0a'; ctx.beginPath(); ctx.ellipse(ex, ey + 1, rs * 0.11, rs * 0.08, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8a4a1a'; ctx.lineWidth = Math.max(1.2, rs * 0.08); ctx.beginPath(); ctx.arc(ex, ey + rs * 0.06, rs * 0.2, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,240,0.7)'; ctx.beginPath(); ctx.ellipse(r * 0.22, -r * 0.62, r * 0.05, r * 0.11, 0.5, 0, TAU); ctx.fill();   // (a glint)
  ctx.restore();
  slice(); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
}
// the cavern's rock between the wall and the floor: tall basalt columns (floor to ceiling), stalagmite clusters along the bank, the mouth's lower fangs
function drawRocks(ctx, C, camX) {
  const x1 = camX + W + 160;
  for (let k = Math.floor((camX - 200) / 540); k * 540 < x1; k++) {   // columns
    const wx = k * 540 + 230 + hash2(k, 301) * 160;
    if (wx < MOUTH_END + 130 || wx > BRIDGE_X - 240 || HOLLOWS.some((h) => Math.abs(h.x - wx) < h.hw + 70) || FALLS.some((f) => Math.abs(f.x - wx) < 70)) continue;
    const spr = C.col[hash2(k, 302) < 0.5 ? 0 : 1], sx = wx - camX;
    if (sx + 90 < 0 || sx - 90 > W) continue;
    ctx.drawImage(spr.c, sx - spr.ox, 352 - spr.oy, spr.w, spr.h);
  }
  {   // the mouth's inner arch: one fat column where the cave opens out
    const sx = MOUTH_END + 10 - camX;
    if (sx > -140 && sx < W + 140) { const spr = C.col[0], k = 1.35; ctx.drawImage(spr.c, sx - spr.ox * k, 352 - spr.oy * k, spr.w * k, spr.h * k); }
  }
  for (let k = Math.floor((camX - 160) / 190); k * 190 < x1; k++) {   // stalagmite clusters; in the mouth, the pale lower fangs
    const wx = k * 190 + hash2(k, 311) * 110, sx = wx - camX;
    if (hash2(k, 312) < 0.28 || sx < -100 || sx > W + 100 || FALLS.some((f) => Math.abs(f.x - wx) < 46)) continue;
    const sc = 0.8 + 0.4 * hash2(k, 314);
    let spr = null, by = 350;
    if (wx > MOUTH_END + 90 && wx < BRIDGE_X - 150) spr = C.spire[Math.floor(hash2(k, 313) * C.spire.length)];
    else if (wx > 60 && wx < MOUTH_END - 60) { spr = C.fang[Math.floor(hash2(k, 313) * C.fang.length)]; by = 362; }
    if (spr) { if (hash2(k, 315) > 0.5) { ctx.save(); ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.drawImage(spr.c, -spr.ox * sc, by - spr.oy * sc, spr.w * sc, spr.h * sc); ctx.restore(); } else ctx.drawImage(spr.c, sx - spr.ox * sc, by - spr.oy * sc, spr.w * sc, spr.h * sc); }   // (mirrored at random)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0, shake = 0, wedge = 1, story = null, heldAt = null;   // (heldAt: a story's [x, y] where a hero holds the wedge up)
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    setLS('near');
    c.near = buildStrip(BR0 - 50, LEVEL_LEN + 10, 480, H, cs, 1, (g, xa, xb) => { setLS('front'); drawBridgeNear(g, xa, xb); });
    c.floor = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawFloor(g, xa, xb); });
    c.far = buildStrip(BR0 - 50, LEVEL_LEN + 10, 236, 400, cs, 1, (g, xa, xb) => { setLS('near'); drawBridgeFar(g, xa, xb); });
    c.ped = makeSprite(150, 196, 75, 180, cs, (g) => { setLS('near'); drawPedestal(g); });
    c.lava = makeSprite(LT_W, LT_Y1 - LT_Y0, 0, 0, cs, (g) => drawLavaTile(g));
    c.spire = spriteGroup(5, cs, (k, sc, live) => makeSprite(170, 214, 85, 206, sc, (g) => { setLS('mid'); drawSpires(g, 801 + k * 17, false); }, live));
    c.col = spriteGroup(2, cs, (k, sc, live) => makeSprite(130, 392, 65, 384, sc, (g) => { setLS('mid'); drawColumn(g, 701 + k * 13); }, live));
    c.fang = spriteGroup(3, cs, (k, sc, live) => makeSprite(170, 214, 85, 206, sc, (g) => { setLS('mid'); drawSpires(g, 901 + k * 19, true); }, live));
    c.wallB = buildStrip(1700, LEVEL_LEN + 10, 0, 304, cs, 1, (g, xa, xb) => { setLS('far'); drawWall(g, xa, xb); });   // (the far wall last: under a cap it softens first)
    const sW = Math.min(cs, ...c.wallB.chunks.filter((ch) => ch.c).map((ch) => ch.s));   // (the mouth's strip at the same scale: no seam at x 1700)
    c.wallA = buildStrip(-10, 1700, 0, GT0 + 26, sW, 1, (g, xa, xb) => { setLS('far'); drawWall(g, xa, xb); });
    unifyStrips([c.wallA, c.wallB]);
    c.glow = radialSprite(64, 0.5, [[0, 'rgba(255,230,160,1)'], [0.3, 'rgba(255,150,50,0.7)'], [1, 'rgba(255,90,20,0)']]);
    c.fire = radialSprite(256, 0.5, [[0, 'rgba(255,150,60,0.8)'], [0.5, 'rgba(255,90,30,0.3)'], [1, 'rgba(255,60,20,0)']]);
    c.jungle = radialSprite(256, 0.5, [[0, 'rgba(170,255,150,0.9)'], [0.5, 'rgba(90,200,100,0.35)'], [1, 'rgba(60,160,80,0)']]);
    return c;
  }

  // ------------------------------------------------------------------ live: the lava
  function lavaBand(ctx, C, camX, t, y0, y1) {
    // the surface: the cached texture, tiled and drifting with the flow
    const tile = C.lava, off = ((camX * 0.92 - t * 14) % LT_W + LT_W) % LT_W;
    for (let x = -off; x < W; x += LT_W) ctx.drawImage(tile.c, x, LT_Y0, LT_W, tile.h);
    // bubbles swelling and popping (small rings, bigger near)
    for (let i = 0; i < 8; i++) {
      const u = (t * 0.55 + i * 0.37) % 1; if (u > 0.35) continue;
      const v = ((i * 29) % 100) / 100, bx = ((i * 211 - camX * 0.92) % (W + 80) + W + 80) % (W + 80) - 40, by = y0 + 10 + v * (y1 - y0 - 20), r = (2 + u * 12) * (0.6 + v * 0.7);
      ctx.strokeStyle = `rgba(255,240,170,${(1 - u / 0.35) * 0.85})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(bx, by, r, r * 0.38, 0, 0, TAU); ctx.stroke();
    }
    // glints running with the flow
    ctx.strokeStyle = 'rgba(255,244,190,0.55)'; ctx.lineWidth = 1.8;
    for (let i = 0; i < 12; i++) { const v = ((i * 41) % 100) / 100, x = ((i * 97 - camX * 0.92 + t * (18 + (i % 5) * 6)) % (W + 120) + W + 120) % (W + 120) - 60, y = y0 + 6 + v * (y1 - y0 - 12); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (12 + (i % 4) * 5) * (0.6 + v), y + Math.sin(t * 2 + i) * 1.5); ctx.stroke(); }
  }
  function lavaFalls(ctx, camX, t) {
    // a fall of lava from its spout (drawWall: drawSpout): it curls over the lip, falls as a ribbon that narrows and wobbles -- red at its
    // edges, a yellow core, bright blobs running down -- into a glowing splash on the river, steam rising from it
    for (const f of FALLS) {
      const sx = f.x - camX; if (sx < -90 || sx > W + 90) continue;
      const top = f.y, bot = shoreY(f.x) + 18, w0 = f.w * 0.5, N = 18, len = bot - top;
      const xAt = (u) => sx + Math.sin(t * 1.9 + u * 6 + f.ph) * 3.4 * u + Math.sin(u * 2.4 + f.ph) * 6 * u;
      const half = (u, k) => w0 * k * (u < 0.1 ? 1.1 : lerp(1.1, 0.46, Math.pow((u - 0.1) / 0.9, 0.7))) * (1 + 0.16 * sstep(0, 0.15, u) * Math.sin(t * 6 + u * 13 + f.ph));   // (a small bulge as it leaves the rock; its top exactly the channel's foot)
      const ribbon = (k, ph2) => {
        ctx.beginPath();
        for (let q = 0; q <= N; q++) { const u = q / N, x = xAt(u) - half(u, k), y = top + len * u; if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        for (let q = N; q >= 0; q--) { const u = q / N, x = xAt(u) + half(u + ph2 * 0.01, k), y = top + len * u; ctx.lineTo(x, y); }
        ctx.closePath();
      };

      {   // (the channel's last 30 px again, live, the same shape: the join is never a seam, whatever scale the wall was cached at)
        const E = 30, wc = (y) => w0 * 1.1 * lerp(0.45, 1, Math.pow(clamp((y + 14) / (f.y + 14), 0, 1), 0.7));
        const seg = (k) => { ctx.beginPath(); ctx.moveTo(sx - wc(top - E) * k, top - E); ctx.lineTo(sx - wc(top) * k, top + 1); ctx.lineTo(sx + wc(top) * k, top + 1); ctx.lineTo(sx + wc(top - E) * k, top - E); ctx.closePath(); };
        seg(1); ctx.fillStyle = '#d23c14'; ctx.fill(); seg(0.7); ctx.fillStyle = '#ff8c2c'; ctx.fill(); seg(0.3); ctx.fillStyle = '#ffe07a'; ctx.fill();
      }
      ribbon(1, 1); ctx.fillStyle = '#d23c14'; ctx.fill();
      ctx.strokeStyle = 'rgba(70,12,4,0.9)'; ctx.lineWidth = 1.6;   // (its sides inked; nothing across its top: it runs on from the channel)
      for (const sg of [-1, 1]) { ctx.beginPath(); for (let q = 0; q <= N; q++) { const u = q / N, x = xAt(u) + sg * half(u, 1), y = top + len * u; if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); }
      ctx.fillStyle = '#ff8c2c'; ribbon(0.7, 2); ctx.fill();
      ctx.fillStyle = '#ffe07a'; ribbon(0.3, 3); ctx.fill();
      for (let k = 0; k < 4; k++) {   // (bright blobs running down it)
        const u = 0.12 + 0.88 * ((t * 0.55 * f.sp + k / 4 + f.ph) % 1), y = top + len * u;
        ctx.fillStyle = `rgba(255,248,210,${0.85 * sstep(0.12, 0.3, u)})`; ctx.beginPath(); ctx.ellipse(xAt(u) + (k % 2 ? 2 : -2), y, half(u, 0.26), 5 + 3 * (1 - u), 0, 0, TAU); ctx.fill();
      }
      // the splash: a glowing pool, rings spreading, drops thrown up
      const pf = 1 + 0.25 * Math.sin(t * 6 + f.ph);
      ctx.fillStyle = 'rgba(255,214,120,0.85)'; ctx.beginPath(); ctx.ellipse(xAt(1), bot, (w0 * 1.3 + 6) * pf, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,250,220,0.8)'; ctx.beginPath(); ctx.ellipse(xAt(1), bot - 1, w0 * 0.7, 2.2, 0, 0, TAU); ctx.fill();
      for (let k = 0; k < 2; k++) { const u = (t * 0.8 + k * 0.5 + f.ph) % 1; ctx.strokeStyle = `rgba(255,220,140,${0.7 * (1 - u)})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(xAt(1), bot + 1, w0 + 6 + u * 30, 4 + u * 5, 0, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,240,190,0.85)';
      for (let k = 0; k < 4; k++) { const u = ((t * 1.5 + k / 4 + f.ph) % 1); ctx.beginPath(); ctx.arc(xAt(1) + (k - 1.5) * 9 * u, bot - 18 * Math.sin(u * Math.PI), 2.2 * (1 - u) + 0.6, 0, TAU); ctx.fill(); }
      // the steam: soft puffs rising from the splash, swelling and thinning
      for (let k = 0; k < 3; k++) {
        const u = ((t * 0.32 + k / 3 + f.ph * 0.5) % 1), r = 8 + u * 20;
        const side = k === 1 ? -1 : 1, px = xAt(1) + side * (w0 + 10 + u * 16) + Math.sin(t + k) * 3;   // (to the fall's sides: never a pale blot on it)
        ctx.fillStyle = `rgba(255,190,150,${0.13 * Math.sin(u * Math.PI)})`; ctx.beginPath(); ctx.arc(px, bot - 6 - u * 46, r * 0.8, 0, TAU); ctx.fill();
      }
    }
  }
  function embers(ctx, camX, t, a) {
    ctx.fillStyle = '#ffb24a';
    for (const e of LAY.embers) {
      const x = ((e.x - camX * 0.7 + Math.sin(t * 0.8 + e.ph) * e.sw) % 1100 + 1100) % 1100 - 70, y = H - ((e.y + t * e.sp) % (H + 40)) + 20;
      if (x > W + 6) continue;
      ctx.globalAlpha = a * (0.3 + 0.5 * Math.sin(t * 3 + e.ph) ** 2); ctx.beginPath(); ctx.arc(x, y, e.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    const cav = sstep(MOUTH_END - 300, MOUTH_END + 300, camX + W / 2), brg = sstep(BRIDGE_X - 300, BRIDGE_X + 200, camX + W / 2);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';   // (bilinear: 'high' (bicubic) cost the far sprites' upscale 3-4x in software raster, QA3 render cost)
    ctx.fillStyle = '#0c0608'; ctx.fillRect(0, 0, W, H);
    // the lava: the cavern's river below the rock's ragged shore, the bridge's lake behind its far rope (one surface; the mouth's wall is
    // solid, so it stays hidden there)
    if (camX + W > MOUTH_END - 140) { ctx.save(); ctx.beginPath(); ctx.rect(0, 200, W, 184); ctx.clip(); lavaBand(ctx, C, camX, t, 236, 372); ctx.restore(); }
    drawStrip(ctx, C.wallA, camX, s); drawStrip(ctx, C.wallB, camX, s);
    if (cav > 0.01) lavaFalls(ctx, camX, t);
    drawRocks(ctx, C, camX);
    if (cav > 0.01) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5 * cav; ctx.drawImage(C.fire.c, W / 2 - 560, 120, 1120, 320); ctx.restore(); }
    if (camX < 700) {   // the cave's mouth: daylight and green from the jungle outside, behind the left teeth
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.65 * (1 - camX / 700); ctx.drawImage(C.jungle.c, -260 - camX, 40, 700, 340); ctx.restore();
    }
    if (camX + W > BR0 - 60) {   // the bridge: its far rope and posts; the chasm's lava below the deck's near edge, between its two lips
      drawStrip(ctx, C.far, camX, s);
      const a0 = Math.max(0, BR0 - camX), a1 = Math.min(W, DECK1 - camX), tile = C.lava, k = tile.c.width / LT_W, off = ((camX * 1.02 - t * 14) % LT_W + LT_W) % LT_W;
      if (a1 > a0) {
        ctx.save(); ctx.beginPath(); ctx.rect(a0, 518, a1 - a0, H - 518); ctx.clip();
        for (let x = -off; x < W; x += LT_W) ctx.drawImage(tile.c, 0, 96 * k, tile.c.width, (LT_Y1 - LT_Y0 - 96) * k, x, 518, LT_W, 34);
        ctx.restore();
      }
    }
    drawStrip(ctx, C.floor, camX, s);
    if (camX + W > PED_X - 160) {   // the pedestal and the wedge of the Sun Key
      const px = PED_X - camX, py = 356;
      ctx.drawImage(C.ped.c, px - C.ped.ox, py - C.ped.oy, C.ped.w, C.ped.h);
      if (wedge > 0) {   // (the wedge floats over its slot, glowing: a slow pulse)
        const glow = 0.7 + 0.3 * Math.sin(t * 3);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75 * glow; ctx.drawImage(C.glow.c, px - 56, py - 240, 116, 116); ctx.restore();
        const wy = py - 182 + Math.sin(t * 2) * 3;
        ctx.save(); ctx.translate(px - 4, wy); ctx.rotate(Math.sin(t * 1.5) * 0.06); ctx.scale(0.86 + 0.14 * Math.cos(t * 1.3), 1);
        drawWedge(ctx, 36); ctx.restore();
        const sp = Math.max(0, Math.sin(t * 2.3)) ** 3, sx2 = px + 18, sy2 = wy - 30;   // (a sparkle on its rim, twinkling)
        if (sp > 0.02) { ctx.save(); ctx.globalAlpha = sp; ctx.fillStyle = '#fffbe0'; ctx.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? 2.2 : 11, a = k * Math.PI / 4 + t * 0.6; ctx.lineTo(sx2 + Math.cos(a) * r, sy2 + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.restore(); }
      }
    }
    if (heldAt) {   // a golden wedge held up in a story (the Sun Key's first piece)
      const [hx, hy] = heldAt, glow = 0.7 + 0.3 * Math.sin(t * 3);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8 * glow; ctx.drawImage(C.glow.c, hx - 50, hy - 50, 100, 100); ctx.restore();
      ctx.save(); ctx.translate(hx, hy + Math.sin(t * 2) * 2); ctx.rotate(Math.sin(t * 1.5) * 0.1);
      ctx.translate(-14, 18); drawWedge(ctx, 44); ctx.restore();
    }
    // (the dark mouth's edge: the entrance's dim light, the cavern's orange wash)
    if (cav > 0.01 || brg > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,110,40,${0.06 + 0.05 * Math.sin(t * 2.4)})`; ctx.globalAlpha = 0.5 + 0.5 * cav; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    embers(ctx, camX, t, 0.2 + 0.8 * cav);
    if (warm > 0.01) { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,170,90,${0.12 * warm})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    if (camX + W > BRIDGE_X - 60) {
      const sw = shake * 4 * Math.sin(t * 40);
      ctx.save(); ctx.translate(0, sw); drawStrip(ctx, C.near, camX, s); ctx.restore();
      // the lava glow rising past the bridge's near edge
      ctx.save(); const g = ctx.createLinearGradient(0, 520, 0, H); g.addColorStop(0, 'rgba(255,120,30,0)'); g.addColorStop(1, 'rgba(255,120,30,0.5)'); ctx.fillStyle = g; ctx.fillRect(0, 520, W, H - 520); ctx.restore();
    }
    void story;
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(8,2,4,0.4)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  /** the bridge shakes (0..1) under the Alpha's stomps */
  function setShake(k) { shake = clamp(+k || 0, 0, 1); }
  /** the wedge on its pedestal (1 there .. 0 taken) */
  function setWedge(k) { wedge = clamp(+k || 0, 0, 1); }
  function setStory(bg) { story = bg; wedge = bg && bg.wedge !== undefined ? bg.wedge : 1; heldAt = bg && bg.wedgeAt ? bg.wedgeAt : null; }
  /** the FX layer's emitters for the screen at camX (src/sifx.js): the lava's surface, the falls' splashes, the mouth's daylight */
  function ambientSpots(camX) {
    const o = [], a = camX - 40, b = camX + W + 40;
    if (b > MOUTH_END) o.push({ kind: 'lava', x0: Math.max(a, MOUTH_END), x1: b, y: 300 });
    for (const f of FALLS) if (f.x > a && f.x < b) o.push({ kind: 'fall', x: f.x, y: shoreY(f.x) + 18 });
    if (a < 600) o.push({ kind: 'daylight', x0: Math.max(0, a), x1: Math.min(600, b), y: 200 });
    return o;
  }
  return { setScale: st.setScale, setWarm, setShake, setWedge, setStory, ambientSpots, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  boulder: { w: 70, h: 52, colors: ['#4a3c42', '#2c2228', '#7a6870', '#ff7a2a'] },
  rocks:   { w: 70, h: 44, colors: ['#52444a', '#30262c', '#887880', '#ff9a3a'] },
  shards:  { w: 54, h: 66, colors: ['#1e1830', '#4a3c78', '#c8b8f0', '#ff7a2a'] },
};
const PROP_DRAW = {
  boulder(g) {   // a lava-scorched boulder: faceted grey-violet rock, a glowing crack down its face
    ink(g, (g) => poly(g, [-31, 0, -34, -14, -24, -33, -7, -46, 13, -43, 29, -28, 34, -10, 29, 0]), '#665866', 2.8, (g) => {
      g.fillStyle = '#3c3042'; poly(g, [8, -50, 38, -30, 38, 4, -4, 4, 6, -22]); g.fill();
      g.fillStyle = '#a898a8'; poly(g, [-27, -31, -8, -47, 6, -45, -10, -31]); g.fill();
      g.strokeStyle = '#2c2228'; g.lineWidth = 1.4; polyline(g, [-24, -14, -9, -22, 2, -13]); g.stroke();
      g.strokeStyle = '#ff7a2a'; g.lineWidth = 2.8; polyline(g, [-4, -42, -9, -29, -2, -18, -11, -5]); g.stroke();
      g.strokeStyle = '#ffd070'; g.lineWidth = 1; g.stroke();
    });
  },
  rocks(g) {   // a heap of angular stones with embers glowing in the gaps
    const stone = (pts, fill, sh, hi) => {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9;
      for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); }
      ink(g, (g) => poly(g, pts), fill, 2.6, (g) => { g.fillStyle = sh; g.fillRect(lerp(x0, x1, 0.55), y0 - 2, x1 - x0, 60); g.fillStyle = hi; g.fillRect(x0, y0 - 1, (x1 - x0) * 0.6, 5); });
    };
    g.fillStyle = '#ff7a2a'; g.beginPath(); g.ellipse(0, -10, 14, 8, 0, 0, TAU); g.fill();
    stone([-14, -18, -9, -36, 6, -41, 17, -28, 10, -16], '#70606e', '#40344a', '#b0a0b0');
    stone([-34, 0, -35, -11, -25, -22, -5, -21, 2, 0], '#665866', '#3a2f40', '#a898a8');
    stone([-2, 0, 3, -17, 17, -25, 33, -14, 32, 0], '#5e505e', '#38303e', '#9c8c9c');
    g.fillStyle = '#ffd070'; for (const [x, y] of [[-1, -12], [13, -22], [-18, -18]]) { g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); }
  },
  shards(g) {   // obsidian: three glassy black-violet spikes with a bright edge and an ember glow at the foot
    g.fillStyle = 'rgba(255,122,42,0.55)'; g.beginPath(); g.ellipse(0, -2, 25, 6, 0, 0, TAU); g.fill();
    const spike = (pts, facet) => ink(g, (g) => poly(g, pts), '#1e1830', 2.6, (g) => {
      g.fillStyle = '#4a3c78'; poly(g, facet); g.fill();
      g.strokeStyle = '#c8b8f0'; g.lineWidth = 1.5; polyline(g, [pts[2], pts[3], pts[4], pts[5]]); g.stroke();
    });
    spike([-27, 0, -25, -20, -16, -40, -12, -15, -10, 0], [-25, -20, -16, -40, -15, -7, -27, 0]);
    spike([10, 0, 13, -16, 24, -34, 27, -10, 25, 0], [13, -16, 24, -34, 22, -6, 10, 0]);
    spike([-9, 0, -12, -30, -1, -62, 10, -28, 12, 0], [-12, -30, -1, -62, 0, -8, -9, 0]);
  },
};
