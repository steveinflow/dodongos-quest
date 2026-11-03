// Dodongo's Quest - Skull Island stage 1 "THE BLUE GULL" (src/stages/sibluegull.js): background, deck, props.
//
// The book's chapter two (docs/SKULL_ISLAND.md): a fat old ship -- navy hull, patched blue sails, a carved blue seagull
// figurehead -- by night and then by dawn.  Four sections (world x):
//   cabin 0-1350 (The Lantern Cabin: a low wooden room lit by lanterns, hammocks on the back wall, portholes onto the night
//     sea; the cabin's swinging-lantern chains hang from the ceiling beam at screen y 72 -- src/siworld.js Lantern)  |
//   stairs 1350-2450 (The Stairs Up: a narrow companionway climbing the wall to a hatch, the first grey-blue light of the
//     deck spilling down it)  |
//   deck 2450-4700 (The Night Deck: the open deck under the stars and the moon; the bulwark and its rail along the back,
//     the night sea beyond, masts, patched sails, rigging, an old cannon)  |
//   fog 4700-6200 (The Dawn Fog: the sky turns pink, fog banks drift in, and the Scarlet Dawn -- crimson sails, a golden
//     sun-face figurehead -- looms out of the fog close alongside; the boss arena is the last screen).
// (2026-10-22: the deck is 800 px longer for the LEVIATHAN's mini-boss arena (cam 3700): everything from x 3500 on moved +800.)
// Back-to-front (drawBack): the sky (live gradient: night -> dawn by camX) -> stars and the moon -> the sea (live shimmer)
// -> the Scarlet Dawn (loom by camX) -> the kraken's tentacle (setKraken) -> the cabin / stairs wall (cached) -> the
// bulwark and rail -> masts, sails and rigging -> the deck floor (cached) -> lantern light pools -> the dawn's warm wash,
// fog banks, motes.   drawFront: foreground rigging lines (rare, never over an arena screen), the conch's purple pulse.
// Setters (src/siworld.js, src/sibosses.js): setKraken(k 0..1) the tentacle rising at the rail, setConch(k) the purple pulse,
// setBehindRail(fn | null): fn(ctx, camX, t) draws a boss's art between the sea and the bulwark (the Leviathan's coil: src/sileviathan.js).
// Every static element is cached per scale (chunked strips + sprites, src/canvasmem.js); animated bits are live.

import { W, H, INK } from '../config.js';
import { CHARS } from '../chars.js';   // (the kraken's painted arm at the rail: src/chars/kraken_arm3d.js, AA QA A1)
import { STAGE_CS, layerCanvas, cacheCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 6200;
const CAM_MAX = LEVEL_LEN - W;
export const SECTIONS = [
  { id: 'cabin', name: 'The Lantern Cabin', x0: 0, x1: 1350 },
  { id: 'stairs', name: 'The Stairs Up', x0: 1350, x1: 2450 },
  { id: 'deck', name: 'The Night Deck', x0: 2450, x1: 4700 },
  { id: 'fog', name: 'The Dawn Fog', x0: 4700, x1: 6200 },
];
export const ARENAS = [450, 1600, 2950, 3700, CAM_MAX];   // (3700: the Leviathan)
export const WAYSTONES = [2500, 4790];
export const LANTERNS = [{ x: 760, y: 70 }, { x: 1130, y: 100 }];     // (the swinging ones: src/silevels.js lanterns)
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES, lanterns: LANTERNS };

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
// strips at one depth (a deck and its rail): one scale for all -- the largest rung of the ladder their memory together fits at
function unifyFit(list) {
  const all = list.flatMap((st) => st.chunks), sc = all.filter((ch) => ch.c).map((ch) => ch.s);
  if (!sc.length || (Math.min(...sc) === Math.max(...sc) && all.every((ch) => ch.c))) return;
  let area = 0, px = 0; for (const ch of all) { area += (ch.xb - ch.x) * ch.h; if (ch.c) px += ch.c.width * ch.c.height; }
  const fit = Math.sqrt(px / area), rung = [2, 1.5, 1, 0.75, 0.5].find((r) => r <= fit + 1e-6) || 0.5;
  for (const st of list) st.redo(rung);
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
const HORIZON = 250;                              // the sea's horizon
const RAIL_TOP = 304, BULW_TOP = 316, BULW_BOT = 366;   // the bulwark: cap rail, planks, foot
const BEAM0 = 36, BEAM1 = 74;                     // the cabin's ceiling beam (the lantern chains hang from its underside)
const HOUSE_X1 = 2470;                            // the deckhouse (cabin + companionway) ends here: the open deck begins
const CAB = { base: '#6a4326', sh: '#4a2c18', hi: '#8e5e38', joint: '#26140a', deep: '#1a0e07' };
const BULW = { base: '#4a4446', sh: '#323034', hi: '#68606a', joint: '#1a1618', deep: '#121014' };
const DECKP = { base: '#7a6a62', sh: '#5a4c48', hi: '#9a8a80', seam: '#2e2220' };
const CABF = { base: '#7a5634', sh: '#5a3c24', hi: '#9c7448', seam: '#2a180c' };
const HULL = { base: '#232c52', sh: '#171e3c', hi: '#34407a' };
const SAIL = { base: '#9db4d6', sh: '#7a92ba', hi: '#c4d4ea', patch: '#a08462', patchD: '#7e6448', seam: '#5a6c92' };
const LS = { far: ['#2a3a6a', 0.5], mid: ['#1c2a4e', 0.6], near: ['#1a1008', 0.7], front: ['#120a05', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const dawnK = (x) => sstep(4100, 5150, x);                       // night -> dawn, by the camera's x
const loomK = (x) => sstep(4750, 5240, x);                       // the Scarlet Dawn out of the fog
const fogK = (x) => 0.18 + 0.82 * sstep(4300, 5100, x);

const LAY = (() => {
  const R = mulberry(5400);
  const stars = [], dust = [], fog = [], shim = [], clouds = [];
  for (let i = 0; i < 90; i++) stars.push({ x: R.r(0, W), y: R.r(6, HORIZON - 14), r: R.r(0.7, 1.9), ph: R.r(0, TAU), sp: R.r(0.6, 2.2), par: R.r(0.02, 0.07) });
  for (let i = 0; i < 40; i++) dust.push({ x: R.r(0, 1000), y: R.r(40, 520), sp: R.r(0.3, 1), sw: R.r(6, 20), ph: R.r(0, TAU), fr: R.r(0.2, 0.8) });
  for (let i = 0; i < 18; i++) fog.push({ x: R.r(0, 1800), y: R.r(0, 1), w: R.r(300, 560), a: R.r(0.3, 0.6), sp: R.r(4, 12), layer: i % 3 });
  for (let i = 0; i < 16; i++) shim.push({ x: R.r(0, W), y: R.r(HORIZON + 6, BULW_TOP - 4), w: R.r(16, 48), sp: R.r(3, 9), ph: R.r(0, TAU) });
  for (let i = 0; i < 5; i++) clouds.push({ x: R.r(0, 1400), y: R.r(30, 170), w: R.r(220, 380), a: R.r(0.5, 0.9), par: R.r(0.04, 0.09) });
  return { stars, dust, fog, shim, clouds };
})();
const HAMMOCKS = [150, 560, 930, 1230];                          // the hammocks' left hooks (world x)
const WALL_LANTERNS = [360, 700, 1020, 1330, 1760, 2120];         // the lanterns on the posts (static; the swinging ones are actors)
const MASTS = [2760, 3440, 5440];                                  // (3440: clear of the Leviathan's screen, cam 3700)
//                                  // the Blue Gull's masts (world x)
const CANNONS = [3150, 4920];
const DAWNW = { gold: '#e6b43a' };
const MAST_LANTERNS = [{ m: 0, dx: 52, y: 196 }, { m: 1, dx: -56, y: 188 }];   // (lanterns hung from the masts' lower yards: live, swinging)
const SEA_WAVES = (() => { const R = mulberry(4702), o = []; for (let r = 0; r < 7; r++) o.push({ y: HORIZON + 4 + 66 * Math.pow(r / 6, 1.5), amp: 0.8 + r * 0.8, len: 70 + r * 22, sp: 0.5 + r * 0.14, par: 0.1 + r * 0.04, ph: R.r(0, TAU) }); return o; })();
const SKY_W = 1800, SKY_H = HORIZON + 8;

// ---------------------------------------------------------------------------------------------------------------
// SHARED DRAWING BITS
// ---------------------------------------------------------------------------------------------------------------
// one wood board (x0..x1, y0..y1) seen from above: its tone, grain running along it (wavy, a cathedral or a knot now and then), a bevelled
// lit top edge and a shadowed lower one; `wx` its world seed; o: { wet, stain, wear } for the weather on it
// ---- PAINT TEXTURE (shared by the Book 2 stages): a painterly value variation baked into the caches (costs nothing per frame) ----
// a small tile of soft light and dark blotches and fine brush grain, made once (a 1-off ~100 KB canvas, not a cache), laid over big fills
// through a world-anchored pattern so it runs on across chunk joins (one pattern per context, kept)
let NOISE = null;
const PATS = new WeakMap();
function noiseTile() {
  if (NOISE !== null) return NOISE;
  NOISE = false;
  try {
    const T = 192, c = document.createElement('canvas'); c.width = c.height = T;
    const g = c.getContext('2d'); if (!g) return NOISE;
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, T, T);
    const R = mulberry(9157);
    for (let i = 0; i < 70; i++) {
      const x = R() * T, y = R() * T, r = R.r(14, 46), v = R() < 0.5 ? 0 : 255, a = R.r(0.08, 0.22);
      for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, `rgba(${v},${v},${v},${a})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
        g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
    g.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const x = R() * T, y = R() * T, l = R.r(4, 12), an = R.r(-0.2, 0.2), v = R() < 0.5 ? 40 : 220;   // (along the grain: never the rain's slant)
      g.strokeStyle = `rgba(${v},${v},${v},${R.r(0.05, 0.14)})`; g.lineWidth = R.r(1, 2.4);
      g.beginPath(); for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) { g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(an) * l, y + dy + Math.sin(an) * l); } g.stroke();   // (wrapped: no cut at the tile's edges)
    }
    NOISE = c;
  } catch { NOISE = false; }
  return NOISE;
}
function mottle(g, x, y, w, h, a = 0.35) {
  const t = noiseTile(); if (!t || a <= 0) return;
  let pat = PATS.get(g); if (pat === false) return;
  if (!pat) { try { pat = g.createPattern(t, 'repeat'); } catch { pat = null; } if (!pat) { PATS.set(g, false); return; } PATS.set(g, pat); }   // (WebKit, its canvas memory spent: createPattern throws -- skip the texture, remembered: QAF_tech N1)
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = a; g.fillStyle = pat; g.fillRect(x, y, w, h); g.restore();
}
function aoBand(g, x0, x1, y, depth, dir = 1, a = 0.35) {
  const gr = g.createLinearGradient(0, y, 0, y + dir * depth); gr.addColorStop(0, `rgba(6,2,12,${a})`); gr.addColorStop(1, 'rgba(6,2,12,0)');
  g.fillStyle = gr; g.fillRect(x0, Math.min(y, y + dir * depth), x1 - x0, depth);
}
// ---- end PAINT TEXTURE ----
function board(g, x0, x1, y0, y1, base, sd, o = {}) {
  const h = y1 - y0, L = x1 - x0;
  g.fillStyle = base; g.fillRect(x0, y0, L + 0.6, h + 0.6);
  g.save(); g.beginPath(); g.rect(x0, y0, L, h); g.clip();
  const dk = darken(base, 0.42), lt = lighten(base, 0.22);
  { const e0 = 0.1 + 0.14 * hash2(sd, 120), e1 = 0.1 + 0.14 * hash2(sd, 121), sc = 0.35 + 0.3 * hash2(sd, 122), shn = 0.07 + 0.07 * hash2(sd, 123);
    const fg = g.createLinearGradient(x0, 0, x1, 0); fg.addColorStop(0, `rgba(10,6,4,${e0})`); fg.addColorStop(0.18, 'rgba(10,6,4,0)'); fg.addColorStop(sc, `rgba(255,244,226,${shn})`); fg.addColorStop(0.82, 'rgba(10,6,4,0)'); fg.addColorStop(1, `rgba(10,6,4,${e1})`); g.fillStyle = fg; g.fillRect(x0, y0, L, h); mottle(g, x0, y0, L, h, 0.45); }   // (painterly: darker ends, a sheen in its middle, the brush's texture)
  // the grain: long wavy lines along the board, some broken off; their spacing follows the board's height (near rows: more)
  const n = 2 + Math.round(h / 6);
  g.lineWidth = 0.6 + h * 0.02;
  for (let k = 0; k < n; k++) {
    const yy = y0 + h * (k + 0.5 + (hash2(sd, k) - 0.5) * 0.7) / n, ph = hash2(sd, k + 20) * TAU, amp = h * 0.045 * (0.4 + hash2(sd, k + 40)), fr = 3 + hash2(sd, k + 50) * 5;
    const a0 = x0 + hash2(sd, k + 60) * L * 0.2, a1 = x1 - hash2(sd, k + 80) * L * 0.25, st = Math.max(10, L / 18);
    g.strokeStyle = rgba(k % 3 ? dk : lt, k % 3 ? 0.42 : 0.3); g.beginPath();
    for (let x = a0, f = 0; x <= a1; x += st, f++) { const y = yy + Math.sin(((x - x0) / L) * fr + ph) * amp; if (f) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  const hk = hash2(sd, 90);
  if (hk > 0.62 && L > 60) {   // a cathedral: nested arcs where the saw cut across the rings
    const cx = x0 + L * (0.3 + 0.4 * hash2(sd, 91)), cy = y0 + h * (0.4 + 0.2 * hash2(sd, 92)), len = L * (0.12 + 0.1 * hash2(sd, 93)), dir = hash2(sd, 94) > 0.5 ? 1 : -1;
    g.strokeStyle = rgba(dk, 0.5); g.lineWidth = 0.7 + h * 0.02;
    for (let k = 1; k <= 3; k++) { const hh = h * 0.1 * k, ll = len * (0.5 + 0.25 * k); g.beginPath(); g.moveTo(cx - dir * ll, cy - hh); g.quadraticCurveTo(cx + dir * ll * 0.7, cy, cx - dir * ll, cy + hh); g.stroke(); }
  } else if (hk < 0.14 && h > 9) {   // a knot, stretched along the grain, one ring round it
    const kx = x0 + L * (0.2 + 0.6 * hash2(sd, 95)), ky = y0 + h * (0.35 + 0.3 * hash2(sd, 96)), r = h * (0.1 + 0.08 * hash2(sd, 97)), st = 2.4 + 1.6 * hash2(sd, 98);
    g.fillStyle = rgba(dk, 0.85); g.beginPath(); g.ellipse(kx, ky, r * st, r, 0, 0, TAU); g.fill();
    g.strokeStyle = rgba(dk, 0.45); g.lineWidth = 0.8; g.beginPath(); g.ellipse(kx, ky, r * st * 1.7, r * 1.7, 0, 0, TAU); g.stroke();
    g.fillStyle = rgba(lt, 0.4); g.beginPath(); g.ellipse(kx - r * 0.4, ky - r * 0.3, r * st * 0.4, r * 0.25, 0, 0, TAU); g.fill();
  }
  if (o.stain) for (let k = 0; k < 2; k++) {   // weathering: water stains (soft dark patches), a green tinge of algae now and then
    if (hash2(sd, 100 + k) < 0.45) continue;
    const sx = x0 + L * hash2(sd, 102 + k), sw = L * (0.15 + 0.25 * hash2(sd, 104 + k));
    const gr = g.createRadialGradient(sx, y0 + h / 2, 0, sx, y0 + h / 2, sw); gr.addColorStop(0, hash2(sd, 106 + k) > 0.7 ? 'rgba(60,90,60,0.3)' : 'rgba(20,14,16,0.32)'); gr.addColorStop(1, 'rgba(20,14,16,0)');
    g.fillStyle = gr; g.fillRect(sx - sw, y0, sw * 2, h);
  }
  if (o.wear) { g.fillStyle = rgba(lt, 0.12); g.fillRect(x0, y0 + h * 0.3, L, h * 0.4); }   // (scuffed pale where feet go)
  // the bevel: a lit top edge, a shadow along the lower one
  g.fillStyle = rgba(lt, 0.55); g.fillRect(x0, y0, L, Math.max(1, h * 0.1));
  vgrad(g, x0, y0 + h * 0.6, L, y1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.3)']]);
  if (o.wet) {   // the rain's sheen: the stormy sky's light in a streak along the board
    g.fillStyle = `rgba(190,180,240,${0.06 + 0.08 * hash2(sd, 110)})`; g.fillRect(x0 + L * 0.08, y0 + h * 0.3, L * (0.4 + 0.5 * hash2(sd, 111)), Math.max(1.2, h * 0.16));
  }
  g.restore();
}
function nail(g, x, y, r = 1.6) { g.fillStyle = '#1a1210'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,236,210,0.45)'; g.fillRect(x - r * 0.6, y - r * 0.7, r * 0.7, r * 0.5); }
function paintChips(g, a, b, y0, y1, wood, seed, n) {
  for (let i = Math.floor(a / 60) - 1; i * 60 < b + 60; i++) {
    if (hash2(i, seed) > n) continue;
    const cx = i * 60 + hash2(i, seed + 1) * 60, cy = lerp(y0 + 5, y1 - 5, hash2(i, seed + 2)), rx = 8 + hash2(i, seed + 3) * 18, ry = 1.8 + hash2(i, seed + 4) * 2.6;
    g.beginPath(); g.moveTo(cx - rx, cy);
    for (let k = 1; k <= 6; k++) g.lineTo(cx - rx + (k / 6) * rx * 2, cy - ry * (0.6 + 0.4 * hash2(i * 7 + k, seed + 5)));
    for (let k = 6; k >= 0; k--) g.lineTo(cx - rx + (k / 6) * rx * 2, cy + ry * (0.5 + 0.5 * hash2(i * 7 + k, seed + 6)));
    g.closePath(); g.fillStyle = wood; g.fill(); g.strokeStyle = 'rgba(10,6,8,0.5)'; g.lineWidth = 0.8; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx - rx + 2, cy - ry - 0.6); g.lineTo(cx + rx - 2, cy - ry - 0.6); g.stroke();   // (the paint's lifted edge)
  }
}
function turnedPost(g, x, y0, y1, w, col, finial) {
  const prof = [[0, 0.42], [0.06, 0.62], [0.12, 0.42], [0.3, 0.36], [0.45, 0.56], [0.6, 0.36], [0.85, 0.4], [0.92, 0.6], [1, 0.6]];
  const pts = []; for (const [u, k] of prof) pts.push(x - w * k, lerp(y0, y1, u)); for (let i = prof.length - 1; i >= 0; i--) pts.push(x + w * prof[i][1], lerp(y0, y1, prof[i][0]));
  ink(g, (g) => poly(g, pts), col, 2.2, (g) => {
    g.fillStyle = rgba(lighten(col, 0.4), 0.5); g.fillRect(x - w * 0.62, y0, w * 0.32, y1 - y0);
    g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(x + w * 0.12, y0, w * 0.6, y1 - y0);
  });
  if (finial === 'gold') { ink(g, (g) => { g.beginPath(); g.arc(x, y0 - 6, w * 0.55, 0, TAU); }, DAWNW.gold, 2, (g) => { g.fillStyle = 'rgba(255,250,200,0.75)'; g.beginPath(); g.arc(x - w * 0.18, y0 - 8, w * 0.2, 0, TAU); g.fill(); }); }
  else { ink(g, (g) => { g.beginPath(); g.rect(x - w * 0.6, y0 - 6, w * 1.2, 7); }, '#3c4048', 2, (g) => { g.fillStyle = 'rgba(200,210,230,0.4)'; g.fillRect(x - w * 0.6, y0 - 6, w * 1.2, 2); }); }
}
function railThing(g, x, kind, dawn) {
  { const sh = [[3, 26, 14, 18], [2, 20, 26, 14], [3, 30, 15, 14], [2, 18, 26, 10]][kind]; if (sh) lightPool(g, x + sh[0], BULW_TOP + sh[1], sh[2], sh[3], '6,2,12', 0.34); }   // (a soft contact shadow behind it)
  if (kind === 0) ropeCoil(g, x, BULW_TOP + 34, 14);
  else if (kind === 1) {   // belaying pins in a pin rail, a rope wound on one
    ink(g, (g) => { g.beginPath(); g.rect(x - 26, BULW_TOP + 4, 52, 7); }, '#5a3a22', 2);
    for (const dx of [-16, 0, 16]) { ink(g, (g) => { g.beginPath(); g.rect(x + dx - 2.4, BULW_TOP - 8, 4.8, 26); }, '#8a6a42', 1.6); }
    for (let k = 0; k < 3; k++) { g.strokeStyle = LINE; g.lineWidth = 4.4; g.beginPath(); g.ellipse(x + (k - 1) * 1.6, BULW_TOP + 24 + k * 1.2, 7 + k * 0.8, 16, 0, -Math.PI * 0.42, Math.PI * 1.42); g.stroke(); g.strokeStyle = k === 1 ? '#6e5634' : '#866a42'; g.lineWidth = 2.4; g.stroke(); }   // (a coil hung over the middle pin)
  } else if (kind === 2) {   // a bucket hung on a peg
    ink(g, (g) => poly(g, [x - 11, BULW_TOP + 16, x + 11, BULW_TOP + 16, x + 8, BULW_TOP + 40, x - 8, BULW_TOP + 40]), '#7a5a3a', 2.2, (g) => { g.fillStyle = '#3c4048'; g.fillRect(x - 12, BULW_TOP + 22, 24, 3); g.fillRect(x - 12, BULW_TOP + 33, 24, 3); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 2, BULW_TOP + 14, 12, 30); });
    g.strokeStyle = '#2a2a30'; g.lineWidth = 1.6; g.beginPath(); g.arc(x, BULW_TOP + 16, 10, Math.PI, 0); g.stroke();
  } else if (kind === 3) {   // a cleat bolted to a backing block: one bar with tapered horns on a centre boss, the rope in figure-eights round them, its tail in a loop
    ink(g, (g) => { g.beginPath(); g.rect(x - 22, BULW_TOP + 6, 44, 18); }, '#4a3020', 2, (g) => { g.fillStyle = 'rgba(255,230,200,0.2)'; g.fillRect(x - 22, BULW_TOP + 6, 44, 3); });
    ink(g, (g) => { g.beginPath(); g.moveTo(x - 18, BULW_TOP + 13); g.quadraticCurveTo(x - 8, BULW_TOP + 9, x, BULW_TOP + 10); g.quadraticCurveTo(x + 8, BULW_TOP + 9, x + 18, BULW_TOP + 13); g.quadraticCurveTo(x + 8, BULW_TOP + 15, x, BULW_TOP + 15); g.quadraticCurveTo(x - 8, BULW_TOP + 15, x - 18, BULW_TOP + 13); g.closePath(); }, '#6a6e78', 1.6, (g) => { g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x - 18, BULW_TOP + 9, 36, 2); });
    ink(g, (g) => { g.beginPath(); g.rect(x - 4, BULW_TOP + 13, 8, 7); }, '#4a4e58', 1.4);
    for (const ex of [-11, 11]) { g.strokeStyle = LINE; g.lineWidth = 4.2; g.beginPath(); g.ellipse(x + ex, BULW_TOP + 13, 4, 5, 0, 0, TAU); g.stroke(); g.strokeStyle = '#866a42'; g.lineWidth = 2.2; g.stroke(); }
    g.strokeStyle = LINE; g.lineWidth = 4.2; g.beginPath(); g.moveTo(x + 13, BULW_TOP + 17); g.bezierCurveTo(x + 18, BULW_TOP + 40, x - 4, BULW_TOP + 42, x - 1, BULW_TOP + 24); g.stroke(); g.strokeStyle = '#866a42'; g.lineWidth = 2.2; g.stroke();
  } else if (kind === 4 && dawn) {   // the Dawn's sun carved into the bulwark: a low bronze relief, the wood showing round it (never a coin)
    g.save(); g.translate(x, BULW_TOP + 14);
    g.fillStyle = 'rgba(20,6,8,0.35)'; g.beginPath(); g.arc(1, 1.5, 15, 0, TAU); g.fill();
    for (let k = 0; k < 12; k++) { const an = k * TAU / 12, r1 = k & 1 ? 12 : 15; g.fillStyle = '#8a6432'; g.beginPath(); g.moveTo(Math.cos(an - 0.16) * 7, Math.sin(an - 0.16) * 7); g.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); g.lineTo(Math.cos(an + 0.16) * 7, Math.sin(an + 0.16) * 7); g.closePath(); g.fill(); }
    ink(g, (g) => { g.beginPath(); g.arc(0, 0, 7, 0, TAU); }, '#9a7238', 1.4, (g) => { g.fillStyle = 'rgba(255,220,160,0.3)'; g.beginPath(); g.arc(-2, -2, 3, 0, TAU); g.fill(); });
    g.restore();
  }
}
function heap(g, cx, cy, w, hgt, sd, base, top, under) {
  // cy: the heap's flat base; it billows up hgt above it in tiers of puffs, the top tier smallest
  const R = mulberry(sd), puffs = [];
  const tiers = [[1, 0.42, 0.34], [0.78, 0.66, 0.28], [0.5, 0.88, 0.22]];
  for (const [ww, hh, rr] of tiers) {
    const n = 3 + Math.floor(w * ww / 70);
    for (let k = 0; k < n; k++) { const u = n > 1 ? k / (n - 1) : 0.5, r = hgt * rr * (0.75 + 0.5 * R()); puffs.push([cx - (w * ww) / 2 + u * w * ww + R.r(-10, 10), cy - hgt * hh + r * 0.6 + R.r(-6, 6), r]); }
  }
  for (let k = 0; k < puffs.length; k += 2) { const [x, y, r] = puffs[k]; puffs.push([x + R.r(-r, r) * 0.6, y + R.r(-0.2, 0.4) * r, r * R.r(0.45, 0.8)]); }   // (smaller puffs between: an uneven top)
  const shape = (grow) => { g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r + grow, y); g.arc(x, y, r + grow, 0, TAU); } g.moveTo(cx - w / 2 - grow, cy - hgt * 0.3); for (let k = 0; k <= 10; k++) { const u = k / 10; g.lineTo(cx - w / 2 + u * w + (k === 0 ? -grow : k === 10 ? grow : 0), cy + grow * 0.5 + 7 * Math.sin(u * 9 + sd) + 4 * hash2(sd, k)); } g.lineTo(cx + w / 2 + grow, cy - hgt * 0.3); g.closePath(); };   // (a ragged base)
  shape(5); g.fillStyle = rgba(base, 0.35); g.fill();   // (a soft edge)
  shape(0); g.fillStyle = base; g.fill();
  g.save(); shape(0); g.clip();
  for (const [x, y, r] of puffs) {   // (soft light on each puff's crown, up and to the left: painted, no lines)
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.55, 0, x - r * 0.3, y - r * 0.55, r * 1.1); gr.addColorStop(0, rgba(top, 0.75)); gr.addColorStop(0.5, rgba(top, 0.25)); gr.addColorStop(1, rgba(top, 0));
    g.fillStyle = gr; g.fillRect(x - r * 1.5, y - r * 1.7, r * 2.6, r * 2.3);
  }
  for (const [x, y, r] of puffs) { const gr = g.createRadialGradient(x + r * 0.3, y + r * 0.6, 0, x + r * 0.3, y + r * 0.6, r * 0.9); gr.addColorStop(0, 'rgba(10,8,28,0.35)'); gr.addColorStop(1, 'rgba(10,8,28,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r * 0.4, r * 2.4, r * 2); }   // (soft shade low on each)
  vgrad(g, cx - w / 2 - 8, cy - hgt * 0.35, w + 16, cy + 2, [[0, rgba(under, 0)], [1, rgba(under, 0.6)]]);   // (the glow from below on its base)
  g.restore();
}
// a row's board joints (world x): lengths 150..300 by a hash -- a pure function of row and index (chunk-safe)
function rowX(r, i, seed) {
  let x = -600 + hash2(r, seed) * 200;
  if (i >= 0) for (let k = 0; k < i; k++) x += 150 + 150 * hash2(k, r + seed + 7);
  else for (let k = -1; k >= i; k--) x -= 150 + 150 * hash2(k, r + seed + 7);
  return x;
}
// vertical planks, lit from the upper left, with grain, a gap line and nails
function planksV(g, xa, xb, y0, y1, P, seed, pw = 40, vary = 0.9) {
  for (let i = Math.floor(xa / pw) - 1; i * pw < xb + pw; i++) {
    const x = i * pw, h = hash2(i, seed), h2 = hash2(i + 31, seed);
    g.fillStyle = mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * vary * 1.4); g.fillRect(x, y0, pw + 0.6, y1 - y0);
    g.fillStyle = rgba(P.hi, 0.18); g.fillRect(x + 1, y0, 3, y1 - y0);
    g.fillStyle = rgba(P.deep, 0.22); g.fillRect(x + pw - 5, y0, 5, y1 - y0);
    g.strokeStyle = rgba(P.sh, 0.7); g.lineWidth = 1.1;
    for (let k = 0; k < 3; k++) {
      const gx = x + pw * (0.22 + 0.27 * k) + (h2 - 0.5) * 5;
      g.beginPath(); for (let y = y0; y <= y1 + 16; y += 16) { const xx = gx + vnoise(y + i * 9, 40, seed + k) * 5; if (y === y0) g.moveTo(xx, y); else g.lineTo(xx, y); } g.stroke();
    }
    if (h2 > 0.82) { const ky = y0 + (y1 - y0) * hash2(i, seed + 7); g.fillStyle = rgba(P.deep, 0.55); g.beginPath(); g.ellipse(x + pw * 0.5, ky, 4.5, 6.5, 0, 0, TAU); g.fill(); g.strokeStyle = rgba(P.deep, 0.7); g.stroke(); }
    g.strokeStyle = rgba(P.joint, 0.9); g.lineWidth = 1.8; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
    g.fillStyle = rgba(P.deep, 0.8); for (const ny of [y0 + 8, y1 - 8]) { g.beginPath(); g.arc(x + pw * 0.5, ny, 1.5, 0, TAU); g.fill(); }
  }
}
// horizontal planks (the bulwark)
function planksH(g, xa, xb, y0, y1, P, seed, ph = 14) {
  for (let r = 0; y0 + r * ph < y1; r++) {
    const y = y0 + r * ph, off = hash1(r * 7 + seed) * 220;
    for (let i = Math.floor((xa - off) / 230) - 1; ; i++) {
      const bx = i * 230 + off; if (bx > xb) break;
      const h = hash2(i, r + seed);
      g.fillStyle = mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * 1.2); g.fillRect(bx, y, 230.6, ph + 0.5);
      g.fillStyle = rgba(P.hi, 0.2); g.fillRect(bx, y + 1, 230, 2.4);
      g.strokeStyle = rgba(P.joint, 0.9); g.lineWidth = 1.6; g.beginPath(); g.moveTo(bx, y); g.lineTo(bx, y + ph); g.stroke();
    }
    g.strokeStyle = rgba(P.joint, 0.9); g.lineWidth = 1.8; g.beginPath(); g.moveTo(xa - 2, y); g.lineTo(xb + 2, y); g.stroke();
  }
}
// a timber beam (horizontal), lit along its top edge
function beam(g, xa, xb, y0, y1, P = CAB) {
  g.fillStyle = mix(P.sh, P.deep, 0.35); g.fillRect(xa - 2, y0, xb - xa + 4, y1 - y0);
  g.fillStyle = rgba(P.base, 0.9); g.fillRect(xa - 2, y0 + 4, xb - xa + 4, (y1 - y0) * 0.5);
  g.fillStyle = rgba(P.hi, 0.7); g.fillRect(xa - 2, y0 + 3, xb - xa + 4, 3);
  g.fillStyle = rgba('#000000', 0.35); g.fillRect(xa - 2, y1 - 7, xb - xa + 4, 7);
  g.strokeStyle = rgba(P.deep, 0.9); g.lineWidth = 2; g.beginPath(); g.moveTo(xa - 2, y0); g.lineTo(xb + 2, y0); g.moveTo(xa - 2, y1); g.lineTo(xb + 2, y1); g.stroke();
  for (let i = Math.floor(xa / 300) - 1; i * 300 < xb + 300; i++) { const x = i * 300 + 120; g.strokeStyle = rgba(P.deep, 0.8); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.fillStyle = rgba(P.deep, 0.9); g.beginPath(); g.arc(x - 8, (y0 + y1) / 2, 2.2, 0, TAU); g.arc(x + 8, (y0 + y1) / 2, 2.2, 0, TAU); g.fill(); }
}
// a vertical post
function post(g, x, y0, y1, w = 30, P = CAB) {
  ink(g, (g) => { g.beginPath(); g.rect(x - w / 2, y0, w, y1 - y0); }, mix(P.base, P.sh, 0.3), 2.2, (g) => {
    g.fillStyle = rgba(P.hi, 0.55); g.fillRect(x - w / 2, y0, 5, y1 - y0); g.fillStyle = rgba('#000000', 0.35); g.fillRect(x + w / 2 - 9, y0, 9, y1 - y0);
    g.strokeStyle = rgba(P.deep, 0.6); g.lineWidth = 1; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x - w / 2 + k * w / 4, y0); g.lineTo(x - w / 2 + k * w / 4 + 2, y1); g.stroke(); }
  });
}
// a brass lantern (decor): cap, a glowing glass, base, hook; the glow is the light pass's
function lanternSprite(g) {
  ink(g, (g) => { g.beginPath(); g.moveTo(-8, -22); g.lineTo(8, -22); g.lineTo(5, -30); g.lineTo(-5, -30); g.closePath(); }, '#5a4020', 1.8);
  ink(g, (g) => { g.beginPath(); g.moveTo(-7, -22); g.lineTo(7, -22); g.lineTo(9, 10); g.lineTo(-9, 10); g.closePath(); }, '#ffd86a', 1.8, (g) => { g.fillStyle = '#fff6c8'; g.beginPath(); g.ellipse(0, -6, 4, 9, 0, 0, TAU); g.fill(); g.strokeStyle = '#5a4020'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, -22); g.lineTo(0, 10); g.stroke(); });
  ink(g, (g) => { g.beginPath(); g.rect(-11, 10, 22, 5); }, '#5a4020', 1.8);
  g.strokeStyle = LINE; g.lineWidth = 1.6; g.beginPath(); g.arc(0, -34, 5, Math.PI, 0); g.stroke();
}
// a rope coil, a belaying pin: small deck furniture
function ropeCoil(g, x, y, r = 14) {   // (a coil hung on a pin on the bulwark: stacked rings of hemp, dark gaps between, the strands hatched)
  ink(g, (g) => { g.beginPath(); g.rect(x - 2.4, y - 26, 4.8, 12); }, '#8a6a42', 1.4);
  for (let k = 0; k < 4; k++) {
    const yy = y - 14 + k * 2.2, rr = r - k * 0.6;
    g.strokeStyle = '#1a120c'; g.lineWidth = 4.6; g.beginPath(); g.ellipse(x + k * 0.8, yy + 8, rr * 0.55, rr, 0, 0, TAU); g.stroke();
    g.strokeStyle = k % 2 ? '#6e5634' : '#866a42'; g.lineWidth = 2.4; g.stroke();
  }
  g.strokeStyle = 'rgba(30,20,10,0.6)'; g.lineWidth = 0.8; for (let k = 0; k < 8; k++) { const an = (k / 8) * TAU; g.beginPath(); g.moveTo(x + Math.cos(an) * r * 0.5, y - 6 + Math.sin(an) * r * 0.9); g.lineTo(x + Math.cos(an + 0.2) * r * 0.62, y - 6 + Math.sin(an + 0.2) * r * 1.02); g.stroke(); }
}
// the cabin's interior (x range chunk): wall planks, ceiling beam, posts, portholes, shelf, chart, crates; the hammocks and the
// lanterns are drawn live
function drawInterior(g, xa, xb) {
  planksV(g, xa, xb, 0, 368, CAB, 11, 40);
  mottle(g, xa - 2, 0, xb - xa + 4, 368, 0.4);   // (the brush's texture in the wall)
  vgrad(g, xa - 2, 90, xb - xa + 4, 330, [[0, 'rgba(255,214,160,0)'], [0.32, 'rgba(255,214,160,0.07)'], [1, 'rgba(255,214,160,0)']]);   // (a soft lit band at the lanterns' height)
  for (let i = -1; i < WALL_LANTERNS.length; i++) { const l0 = i < 0 ? WALL_LANTERNS[0] - 340 : WALL_LANTERNS[i], l1 = i + 1 < WALL_LANTERNS.length ? WALL_LANTERNS[i + 1] : l0 + 340, mx = (l0 + l1) / 2; if (mx < xa - 260 || mx > xb + 260) continue; lightPool(g, mx, 210, Math.max(120, (l1 - l0) * 0.42), 170, '6,3,2', 0.2); }   // (the wall darker between the lanterns: their light falling off)
  vgrad(g, xa - 2, 0, xb - xa + 4, 120, [[0, 'rgba(6,3,2,0.7)'], [1, 'rgba(6,3,2,0)']]);          // the dim ceiling
  vgrad(g, xa - 2, 250, xb - xa + 4, 368, [[0, 'rgba(6,3,2,0)'], [1, 'rgba(6,3,2,0.2)']]);        // the wall's foot in shadow
  beam(g, xa, xb, BEAM0, BEAM1);
  // the posts between the bays
  for (let i = Math.floor((xa - 60) / 340); i * 340 < xb + 60; i++) { const x = i * 340 + 330; if (x > -40 && x < HOUSE_X1 - 20) post(g, x, BEAM1 - 2, 368, 32); }
  aoBand(g, xa - 2, xb + 2, BEAM1, 18, 1, 0.4); aoBand(g, xa - 2, xb + 2, 368, 20, -1, 0.32);   // (in shadow under the ceiling beam, and at the wall's foot)
  // the portholes (the cabin's back wall): brass rims round the night sea and the moon
  for (let i = 0; i < 4; i++) {
    const x = 250 + i * 420 + (i % 2) * 40; if (x < xa - 60 || x > xb + 60 || x > 1300) continue;
    const y = 168;
    g.save(); ink(g, (g) => { g.beginPath(); g.arc(x, y, 40, 0, TAU); }, '#9a7a3a', 3.2); g.restore();
    g.save(); g.beginPath(); g.arc(x, y, 31, 0, TAU); g.clip();
    const gr = g.createLinearGradient(0, y - 31, 0, y + 31); gr.addColorStop(0, '#0a1436'); gr.addColorStop(0.5, '#1c3470'); gr.addColorStop(0.52, '#0e1c44'); gr.addColorStop(1, '#070d24');
    g.fillStyle = gr; g.fillRect(x - 32, y - 32, 64, 64);
    if (i === 0) { g.fillStyle = 'rgba(255,248,214,0.9)'; g.beginPath(); g.arc(x + 10, y - 12, 5, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,248,214,0.35)'; for (let k = 0; k < 4; k++) g.fillRect(x + 4 - k * 2, y + 6 + k * 5, 14 + k * 3, 1.6); }
    else if (i === 1) { g.fillStyle = 'rgba(255,248,214,0.8)'; for (const [dx, dy] of [[-14, -16], [6, -20], [16, -8], [-4, -6]]) g.fillRect(x + dx, y + dy, 1.8, 1.8); g.strokeStyle = 'rgba(200,220,255,0.5)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x - 30, y + 10); g.quadraticCurveTo(x - 10, y + 4, x + 6, y + 12); g.quadraticCurveTo(x + 18, y + 6, x + 30, y + 10); g.stroke(); }
    else { g.fillStyle = 'rgba(220,236,255,0.6)'; g.beginPath(); g.ellipse(x - 6, y + 14, 16, 6, 0, Math.PI, TAU); g.fill(); g.fillStyle = 'rgba(220,236,255,0.4)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x - 18 + k * 9, y + 4 - (k % 2) * 6, 2, 0, TAU); g.fill(); } }   // (spray against the glass)
    g.restore();
    g.strokeStyle = '#6a4e20'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 31, y); g.lineTo(x + 31, y); g.moveTo(x, y - 31); g.lineTo(x, y + 31); g.stroke();
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.fillStyle = '#d9b24a'; g.beginPath(); g.arc(x + Math.cos(a) * 36, y + Math.sin(a) * 36, 2, 0, TAU); g.fill(); }
  }
  // a ship's chart with the island on it, a shelf with mugs, a coat on a hook
  for (const [x, kind] of [[470, 'chart'], [820, 'shelf'], [1196, 'ship'], [1640, 'shelf'], [1900, 'chart']]) {
    if (x < xa - 90 || x > xb + 90) continue;
    if (kind === 'ship') {   // (a little painting of the Blue Gull in a gilt frame)
      g.save(); g.translate(x, 176);
      ink(g, (g) => { g.beginPath(); g.rect(-38, -28, 76, 54); }, '#b8902e', 2.4, (g) => {
        vgrad(g, -32, -22, 64, 22, [[0, '#f0d0a0'], [1, '#e8b080']]); g.fillStyle = '#4a6a9a'; g.fillRect(-32, 6, 64, 16);
        g.fillStyle = '#2a3460'; poly(g, [-18, 8, 18, 8, 13, 15, -14, 15]); g.fill(); g.fillStyle = '#c8d4ea'; poly(g, [-2, -16, -2, 6, -15, 4]); g.fill(); poly(g, [1, -14, 1, 6, 12, 4]); g.fill();
        g.strokeStyle = '#3a2a1a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-1, -18); g.lineTo(-1, 8); g.stroke();
      });
      g.restore();
    } else if (kind === 'chart') {
      g.save(); g.translate(x, 180);
      ink(g, (g) => { g.beginPath(); g.rect(-34, -26, 68, 52); }, '#e0cc98', 2, (g) => { g.fillStyle = '#7aa0b0'; g.beginPath(); g.ellipse(2, 4, 20, 13, 0.3, 0, TAU); g.fill(); g.fillStyle = '#6a8a50'; g.beginPath(); g.ellipse(2, 3, 9, 6, 0.3, 0, TAU); g.fill(); g.strokeStyle = '#a2402a'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-24, -14); g.lineTo(-16, -8); g.moveTo(-16, -14); g.lineTo(-24, -8); g.stroke(); g.strokeStyle = 'rgba(80,50,20,0.6)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(-18, 10); g.quadraticCurveTo(-8, -10, 2, 2); g.stroke(); });
      g.restore();
    } else {
      g.save(); g.translate(x, 176);
      ink(g, (g) => { g.beginPath(); g.rect(-46, 4, 92, 9); }, '#7a5230', 2);
      for (const [mx, c] of [[-30, '#c9c4b8'], [-4, '#b9b2a4'], [24, '#d2cdc0']]) ink(g, (g) => { g.beginPath(); g.rect(mx - 6, -12, 12, 16); }, c, 1.6);
      g.restore();
    }
  }
  // crates and barrels along the wall's foot (the cabin's stores)
  for (const [x, k] of [[90, 'barrel'], [145, 'crate'], [640, 'crate'], [1180, 'barrel'], [1215, 'barrel'], [1560, 'crate'], [1610, 'barrel'], [1990, 'crate']]) {
    if (x < xa - 70 || x > xb + 70 || x > HOUSE_X1 - 40) continue;
    setLS('mid'); const it = PROP_DRAW[k]; g.save(); g.translate(x, 352); g.scale(0.82, 0.82); it(g); g.restore();
  }
}

// the companionway: a stair climbing the wall (x 1380 -> 2290) to the hatch, and the deckhouse's end (the roof's edge and its
// corner post at HOUSE_X1) -- chunk-safe
const ST0 = { x: 1400, y: 346 }, ST1 = { x: 2290, y: 150 }, STEPS = 20;
function drawStairs(g, xa, xb) {
  if (xb < 1300 || xa > HOUSE_X1 + 60) return;
  const dx = (ST1.x - ST0.x) / STEPS, dy = (ST1.y - ST0.y) / STEPS;
  // the dark cavity under the stair (stores in the shadow)
  g.save(); g.fillStyle = 'rgba(8,4,2,0.82)'; g.beginPath(); g.moveTo(ST0.x, ST0.y); g.lineTo(ST1.x, ST1.y + 14); g.lineTo(ST1.x, 368); g.lineTo(ST0.x, 368); g.closePath(); g.fill(); g.restore();
  for (const bx of [1600, 1700, 1900]) { setLS('mid'); g.save(); g.translate(bx, 356); g.scale(0.7, 0.7); g.globalAlpha = 0.7; PROP_DRAW[bx % 200 ? 'crate' : 'barrel'](g); g.restore(); }
  // the stringer (a long diagonal board) and the treads
  ink(g, (g) => { g.beginPath(); g.moveTo(ST0.x - 8, ST0.y + 6); g.lineTo(ST1.x + 10, ST1.y + 4); g.lineTo(ST1.x + 10, ST1.y + 24); g.lineTo(ST0.x - 8, ST0.y + 26); g.closePath(); }, '#4a2c18', 2.4);
  for (let i = 0; i < STEPS; i++) {
    const x = ST0.x + i * dx, y = ST0.y + i * dy;
    ink(g, (g) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx + 4, y); g.lineTo(x + dx + 4, y + 10); g.lineTo(x, y + 10); g.closePath(); }, i % 2 ? '#8e5e38' : '#9a6840', 2, (g) => { g.fillStyle = 'rgba(255,230,180,0.28)'; g.fillRect(x, y, dx + 4, 3); });   // the tread's lit nose
    ink(g, (g) => { g.beginPath(); g.moveTo(x + dx + 4, y); g.lineTo(x + dx + 4, y + dy); g.lineTo(x + dx - 2, y + dy + 4); g.lineTo(x + dx - 2, y + 4); g.closePath(); }, '#4e2e1a', 1.6);   // (the riser, in shade)
  }
  // the handrail: a rope on short posts
  const rp = [];
  for (let i = 0; i <= STEPS; i += 4) rp.push([ST0.x + i * dx, ST0.y + i * dy - 52]);
  for (const [x, y] of rp) { g.strokeStyle = LINE; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 52); g.stroke(); g.strokeStyle = '#6a4326'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 52); g.stroke(); }
  for (let i = 0; i < rp.length - 1; i++) { const a = rp[i], b = rp[i + 1]; g.strokeStyle = LINE; g.lineWidth = 5.4; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 10, b[0], b[1]); g.stroke(); g.strokeStyle = '#c4a870'; g.lineWidth = 3; g.stroke(); }
  // the hatch at the top: a bright frame onto the deck's grey-blue light, the roof's edge, the corner post
  g.fillStyle = '#1a2a4a'; g.fillRect(ST1.x - 10, 60, 190, 120);
  const gr = g.createLinearGradient(0, 60, 0, 180); gr.addColorStop(0, '#0c1a44'); gr.addColorStop(0.7, '#2a4784'); gr.addColorStop(1, '#4a66a0'); g.fillStyle = gr; g.fillRect(ST1.x - 4, 66, 178, 108);   // (the hatch onto the night sky)
  g.fillStyle = 'rgba(255,246,220,0.85)'; for (const [sx2, sy2] of [[30, 84], [70, 100], [120, 78], [150, 110], [96, 124]]) g.fillRect(ST1.x + sx2, sy2, 1.6, 1.6);
  g.fillStyle = 'rgba(150,180,235,0.25)'; g.fillRect(ST1.x - 4, 150, 178, 24);
  g.strokeStyle = rgba(CAB.deep, 0.9); g.lineWidth = 6; g.strokeRect(ST1.x - 4, 66, 178, 108);
  g.strokeStyle = rgba(CAB.sh, 0.9); g.lineWidth = 3; g.beginPath(); g.moveTo(ST1.x + 85, 66); g.lineTo(ST1.x + 85, 174); g.stroke();
  post(g, HOUSE_X1, BEAM1 - 2, 368, 44);
  // the roof's end over the open deck: an eave of planks sloping off, its beam's carved end, a soft shadow under it
  ink(g, (g) => poly(g, [HOUSE_X1 - 34, -10, HOUSE_X1 + 64, -10, HOUSE_X1 + 74, 18, HOUSE_X1 + 40, 24, HOUSE_X1 - 34, 24]), '#3a2414', 2.4, (g) => { g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.2; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(HOUSE_X1 - 34, -4 + k * 7); g.lineTo(HOUSE_X1 + 64 + k * 2.5, -4 + k * 7); g.stroke(); } g.fillStyle = 'rgba(160,180,230,0.2)'; g.fillRect(HOUSE_X1 + 30, -10, 50, 34); });
  ink(g, (g) => { g.beginPath(); g.moveTo(HOUSE_X1 - 36, BEAM0 - 4); g.lineTo(HOUSE_X1 + 40, BEAM0 - 4); g.quadraticCurveTo(HOUSE_X1 + 58, BEAM0 + 4, HOUSE_X1 + 52, BEAM1 + 2); g.quadraticCurveTo(HOUSE_X1 + 46, BEAM1 + 8, HOUSE_X1 + 36, BEAM1 + 6); g.lineTo(HOUSE_X1 - 36, BEAM1 + 6); g.closePath(); }, '#5a3a22', 2.4, (g) => {
    g.fillStyle = 'rgba(255,230,190,0.2)'; g.fillRect(HOUSE_X1 - 36, BEAM0 - 4, 90, 4);
    g.strokeStyle = 'rgba(30,16,8,0.55)'; g.lineWidth = 1.4; g.beginPath(); g.arc(HOUSE_X1 + 40, BEAM0 + 18, 8, -1.2, 2.4); g.stroke(); g.beginPath(); g.arc(HOUSE_X1 + 40, BEAM0 + 18, 3.4, 0, TAU); g.stroke();   // (a carved scroll on its end)
    g.fillStyle = '#1a1210'; for (const by of [BEAM0 + 8, BEAM1 - 6]) { g.beginPath(); g.arc(HOUSE_X1 - 20, by, 2.2, 0, TAU); g.arc(HOUSE_X1 + 10, by, 2.2, 0, TAU); g.fill(); }
  });
  vgrad(g, HOUSE_X1 + 26, BEAM1 + 6, 60, BEAM1 + 40, [[0, 'rgba(6,4,10,0.35)'], [1, 'rgba(6,4,10,0)']]);
}
// the bulwark and its rail along the back of the open deck (x HOUSE_X1 .. end): planks, a cap rail, stanchions with
// belaying pins, ropes
function drawBulwark(g, xa, xb) {
  const a = Math.max(xa, HOUSE_X1 + 24), b = xb;
  if (b <= a) return;
  g.save(); g.beginPath(); g.rect(HOUSE_X1 + 18, RAIL_TOP - 60, LEVEL_LEN, 140); g.clip();   // (from the end post on)
  for (let r = 0; r < 4; r++) {
    const y0 = BULW_TOP + r * 12.5, y1 = y0 + 12.5, off = hash1(r * 7 + 21) * 260;
    for (let i = Math.floor((a - off) / 260) - 1; ; i++) {
      const bx = i * 260 + off; if (bx > b) break;
      const h = hash2(i, r + 21);
      board(g, bx, bx + 260, y0, y1, mix(BULW.base, h < 0.5 ? BULW.sh : BULW.hi, Math.abs(h - 0.5) * 1.1), i * 31 + r * 7 + 5, { stain: true });
      g.strokeStyle = rgba(BULW.joint, 0.9); g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx, y1); g.stroke();
      nail(g, bx + 5, y0 + 6, 1.3); nail(g, bx - 5, y0 + 6, 1.3);
    }
    g.strokeStyle = rgba(BULW.joint, 0.9); g.lineWidth = 1.6; g.beginPath(); g.moveTo(a - 2, y0); g.lineTo(b + 2, y0); g.stroke();
  }
  vgrad(g, a - 2, BULW_TOP, b - a + 4, BULW_BOT, [[0, 'rgba(0,0,0,0.25)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.42)']]);
  for (let i = Math.floor((a - 40) / 170); i * 170 < b + 40; i++) {   // scuppers weeping sea water down the planks
    const x = i * 170 + 30 + hash2(i, 83) * 60; if (x < a - 10 || x > b + 10 || hash2(i, 85) < 0.35) continue;
    ink(g, (g) => { g.beginPath(); g.rect(x - 9, BULW_BOT - 14, 18, 4); }, '#1a1418', 1.4);
    vgrad(g, x - 5, BULW_BOT - 10, 10, BULW_BOT - 2, [[0, 'rgba(170,190,230,0.45)'], [1, 'rgba(170,190,230,0)']]);
  }
  aoBand(g, a, b, BULW_TOP, 12, 1, 0.42); aoBand(g, a, b, BULW_BOT, 16, -1, 0.34);   // (in shadow under the cap rail, and at its foot)
  const cap = '#6a5444';
  ink(g, (g) => { g.beginPath(); g.rect(a - 4, RAIL_TOP, b - a + 8, 13); }, cap, 2.4, (g) => {
    g.fillStyle = rgba(lighten(cap, 0.45), 0.6); g.fillRect(a - 4, RAIL_TOP, b - a + 8, 3);
    g.strokeStyle = rgba(darken(cap, 0.5), 0.6); g.lineWidth = 0.8; g.beginPath();
    for (let x = al(a, 37) - 37; x < b + 37; x += 37) { const yy = RAIL_TOP + 5 + hash2(Math.round(x), 87) * 5; g.moveTo(x, yy); g.quadraticCurveTo(x + 18, yy + (hash2(Math.round(x), 88) - 0.5) * 4, x + 37, yy + 1); }
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(a - 4, RAIL_TOP + 10, b - a + 8, 3);
  });
  for (let x = al(a, 34) - 34; x < b + 34; x += 34) {   // (the balusters)
    const m = ((x - 60) % 150 + 150) % 150; if (m < 16 || m > 134) continue;
    const y0 = RAIL_TOP - 20, y1 = RAIL_TOP;
    ink(g, (g) => { g.beginPath(); g.moveTo(x - 2.2, y1); g.lineTo(x - 2.6, y1 - 4); g.quadraticCurveTo(x - 5, y1 - 10, x - 2.2, y0 + 5); g.lineTo(x - 2.6, y0); g.lineTo(x + 2.6, y0); g.lineTo(x + 2.2, y0 + 5); g.quadraticCurveTo(x + 5, y1 - 10, x + 2.6, y1 - 4); g.lineTo(x + 2.2, y1); g.closePath(); }, '#5e4a3a', 1.4, (g) => { g.fillStyle = 'rgba(200,210,240,0.25)'; g.fillRect(x - 5, y0, 2.4, 22); });
  }
  ink(g, (g) => { g.beginPath(); g.rect(a - 4, RAIL_TOP - 27, b - a + 8, 8); }, '#5e4a3a', 2.2, (g) => { g.fillStyle = 'rgba(210,220,250,0.3)'; g.fillRect(a - 4, RAIL_TOP - 27, b - a + 8, 2.4); });   // (the top rail, the moon on it)
  for (let i = Math.floor((a - 150) / 150); i * 150 < b + 40; i++) {   // (the stanchions, the things kept between them; from a post left of the chunk: its rail thing may reach in)
    const x = i * 150 + 60, inP = x >= a - 14 && x <= b + 14;
    if (inP) ink(g, (g) => { g.beginPath(); g.rect(x - 8, RAIL_TOP - 30, 16, BULW_BOT - RAIL_TOP + 30); }, '#56443a', 2.2, (g) => { g.fillStyle = 'rgba(210,220,250,0.25)'; g.fillRect(x - 8, RAIL_TOP - 30, 3.4, 100); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 2, RAIL_TOP - 30, 6, 100); });
    if (inP) ink(g, (g) => { g.beginPath(); g.rect(x - 10, RAIL_TOP - 34, 20, 6); }, '#3c4048', 1.8);
    { const rx = x + 40 + hash2(i, 89) * 50; if (rx > a - 40 && rx < b + 40 && !MASTS.some((m) => Math.abs(m - rx) < 60)) railThing(g, rx, [0, 3, 1, 6, 2, 4, 5][((i % 7) + 7) % 7], false); }   // (never under a mast)
  }
  if (a <= HOUSE_X1 + 40) ink(g, (g) => { g.beginPath(); g.rect(HOUSE_X1 + 18, RAIL_TOP - 34, 16, BULW_BOT - RAIL_TOP + 34); }, '#56443a', 2.4, (g) => { g.fillStyle = 'rgba(210,220,250,0.25)'; g.fillRect(HOUSE_X1 + 18, RAIL_TOP - 34, 4, 110); });   // (the end post)
  MASTS.forEach((mx, i) => { for (const ln of MAST_LANTERNS) if (ln.m === i) { const lx = mx + ln.dx; if (lx > a - 160 && lx < b + 160) { lightPool(g, lx, RAIL_TOP + 6, 120, 16, '255,200,120', 0.4); lightPool(g, lx, BULW_TOP + 26, 110, 26, '255,180,100', 0.2); } } });   // (the lanterns' light on the rail)
  g.restore();
}
// an old cannon on its carriage seen from behind (pointing out through the bulwark), at its own origin
function drawCannon(g) {
  for (const sx of [-24, 24]) ink(g, (g) => { g.beginPath(); g.arc(sx, -14, 14, 0, TAU); }, '#6a4326', 2.4, (g) => { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.4; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(sx + Math.cos(a) * 14, -14 + Math.sin(a) * 14); g.lineTo(sx - Math.cos(a) * 14, -14 - Math.sin(a) * 14); g.stroke(); } });
  ink(g, (g) => { g.beginPath(); g.rect(-24, -40, 48, 26); }, '#7a5230', 2.4);
  ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 22, 20, 0, 0, TAU); }, '#3c424e', 2.6, (g) => { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(-7, -58, 8, 6, 0, 0, TAU); g.fill(); });
  ink(g, (g) => { g.beginPath(); g.arc(0, -52, 7, 0, TAU); }, '#8a6a2a', 2);
}
// the floor: planks, rows widening toward the camera, butt joints staggered, the cabin's dark wood turning to the deck's weathered
// grey-brown over the companionway; world-aligned, chunk-safe
const ROWS = [362, 372, 385, 402, 424, 451, 484, 520, 546];
function drawFloor(g, xa, xb) {
  g.fillStyle = CABF.sh; g.fillRect(xa - 2, 360, xb - xa + 4, 190);
  for (let r = 0; r < ROWS.length - 1; r++) {
    const y0 = ROWS[r], y1 = ROWS[r + 1], seed = 40;
    for (let i = Math.max(-2, Math.floor((xa + 400) / 300) - 1); ; i++) {
      const bx = rowX(r, i, seed); if (bx > xb) break;
      const bx2 = rowX(r, i + 1, seed); if (bx2 < xa - 2) continue;
      const h = hash2(i, r + seed), kd = 1;
      const P = { base: mix(CABF.base, DECKP.base, kd), sh: mix(CABF.sh, DECKP.sh, kd), hi: mix(CABF.hi, DECKP.hi, kd), seam: mix(CABF.seam, DECKP.seam, kd) };
      board(g, bx, bx2, y0, y1, mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * 1.0), i * 53 + r * 11 + seed, { stain: (bx + bx2) / 2 > 2300, wear: r >= 2 && r <= 5 });
      g.strokeStyle = rgba(P.seam, 0.95); g.lineWidth = 1.7; g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx, y1); g.stroke();
      const nr = 0.9 + (y1 - y0) * 0.035;
      nail(g, bx + 5 + nr, y0 + (y1 - y0) * 0.3, nr); nail(g, bx + 5 + nr, y0 + (y1 - y0) * 0.72, nr);
      nail(g, bx - 5 - nr, y0 + (y1 - y0) * 0.3, nr); nail(g, bx - 5 - nr, y0 + (y1 - y0) * 0.72, nr);
    }
    g.strokeStyle = rgba(CABF.seam, 0.95); g.lineWidth = 2; g.beginPath(); g.moveTo(xa - 2, y0); g.lineTo(xb + 2, y0); g.stroke();
    g.strokeStyle = 'rgba(255,240,220,0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(xa - 2, y0 + 2); g.lineTo(xb + 2, y0 + 2); g.stroke();
  }
  if (xa < 2620) {   // (the cabin's warm wood: the deck's grey multiplied by the cabin's warmth, eased out across the joint)
    const lg = g.createLinearGradient(2160, 0, 2620, 0); lg.addColorStop(0, 'rgba(255,207,135,1)'); lg.addColorStop(1, 'rgba(255,207,135,0)');
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = lg; g.fillRect(xa - 2, 358, Math.min(xb + 2, 2620) - xa + 2, 192); g.restore();
  }
  { const hx = 3330, hy = 430, hw = 140, hh = 54;   // (a cargo hatch: a grating in its coaming, on the open deck)
    if (hx + hw / 2 > xa - 20 && hx - hw / 2 < xb + 20) lightPool(g, hx + 8, hy + hh + 4, hw * 0.62, 11, '6,4,10', 0.45);   // (its soft contact shadow)
    if (hx + hw / 2 > xa - 20 && hx - hw / 2 < xb + 20) ink(g, (g) => { g.beginPath(); g.rect(hx - hw / 2, hy, hw, hh); }, '#4a3a30', 2.6, (g) => {
      g.fillStyle = '#100c0c'; g.fillRect(hx - hw / 2 + 8, hy + 6, hw - 16, hh - 12);
      g.fillStyle = '#6e5e52'; for (let x = hx - hw / 2 + 12; x < hx + hw / 2 - 10; x += 14) g.fillRect(x, hy + 6, 6, hh - 12);
      for (let y = hy + 10; y < hy + hh - 8; y += 11) g.fillRect(hx - hw / 2 + 8, y, hw - 16, 4);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(hx - hw / 2, hy, hw, 3);
    }); }
  { g.save(); g.beginPath(); g.rect(xa - 2, 360, xb - xa + 4, 190); g.clip();   // (contact shadows where the masts and the cannons stand on the deck)
    for (const mx of MASTS) if (mx > xa - 80 && mx < xb + 80) lightPool(g, mx + 4, 365, 40, 8, '6,4,10', 0.5);
    for (const cx of CANNONS) if (cx > xa - 80 && cx < xb + 80) lightPool(g, cx + 3, 364, 50, 9, '6,4,10', 0.5);
    g.restore(); }
  for (let i = Math.floor((xa - 900) / 900); i * 900 < xb + 900; i++) { const lx = i * 900 + 200 + hash2(i, 131) * 500, k = sstep(HOUSE_X1 - 200, HOUSE_X1 + 200, lx); if (k > 0.01) lightPool(g, lx, 440, 420, 80, '170,190,240', (0.05 + 0.05 * hash2(i, 132)) * k); }   // (the moon's light across the open deck: broad and uneven -- the scene's falloff, not each plank's)
  MASTS.forEach((mx, i) => { for (const ln of MAST_LANTERNS) if (ln.m === i) { const lx = mx + ln.dx; if (lx > xa - 220 && lx < xb + 220) lightPool(g, lx, 392, 200, 38, '255,190,110', 0.12); } });   // (the mast lanterns' pools on the planks)
  // the open deck by night: the moon's sheen on the boards by the rail (the cabin: its own dark)
  for (let x = al(Math.max(xa - 8, HOUSE_X1 - 160), 8); x < xb + 8; x += 8) { const k = sstep(HOUSE_X1 - 160, HOUSE_X1 + 100, x + 4); if (k < 0.02) continue; vgrad(g, x, 362, 8, 430, [[0, `rgba(170,190,240,${0.16 * k})`], [1, 'rgba(170,190,240,0)']]); }   // (the moon's sheen on the boards by the rail, feathered in)
  vgrad(g, xa - 2, GT0, xb - xa + 4, 392, [[0, 'rgba(8,5,3,0)'], [0.42, 'rgba(8,5,3,0.42)'], [1, 'rgba(8,5,3,0)']]);
  vgrad(g, xa - 2, 470, xb - xa + 4, 550, [[0, 'rgba(8,5,3,0)'], [1, 'rgba(8,5,3,0.38)']]);
}
// the Scarlet Dawn, drawn at its own origin (the waterline at y 0, the bow to the LEFT): crimson sails, a golden sun-face figurehead,
// gun ports, an old crew cheering at the rail, a friendly skull flag
// the figurehead's warm rim, over the fog's veil: it glints through (the book's)
function drawFigureheadGlint(g) {
  g.save(); g.translate(-336, -74); g.scale(1.25, 1.25); g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = 'rgba(255,231,160,0.9)'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-6, -26); g.lineTo(-12, -22); g.lineTo(-17, -12); g.lineTo(-19, -6); g.lineTo(-26, 2); g.stroke();
  g.fillStyle = 'rgba(255,214,120,0.35)'; g.beginPath(); g.ellipse(-8, -2, 18, 26, 0, 0, TAU); g.fill();
  g.restore();
}
function drawScarletDawn(g) {
  const PD = { base: '#a3202e', sh: '#6a1420', hi: '#d0505a', seam: '#5a0e1c', patch: '#e6b43a', patchD: '#8a6a1a' };
  const MASTS3 = [[-170, 250, 150, 132], [-10, 290, 176, 156], [150, 240, 140, 120]];
  // the bowsprit and its jibs (forward, to the left), the stays between the mastheads
  ink(g, (g) => poly(g, [-290, -70, -440, -122, -444, -114, -294, -60]), '#5a3a22', 2.2);
  g.strokeStyle = LINE; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-436, -118); g.lineTo(-170, -250); g.moveTo(-170, -250); g.lineTo(-10, -290); g.moveTo(-10, -290); g.lineTo(150, -240); g.stroke();
  for (const [x0, y0, x1, y1, x2, y2] of [[-430, -116, -186, -232, -300, -84], [-380, -100, -186, -200, -282, -76]]) {
    ink(g, (g) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2 - 18, (y1 + y2) / 2 + 6, x2, y2); g.closePath(); }, PD.base, 2, (g) => {
      const lg = g.createLinearGradient(x0, 0, x1, 0); lg.addColorStop(0, rgba(PD.hi, 0.5)); lg.addColorStop(1, rgba(PD.sh, 0.6)); g.fillStyle = lg; g.fillRect(x0 - 10, y1 - 10, x1 - x0 + 40, y0 - y1 + 60);
      g.strokeStyle = rgba(PD.seam, 0.5); g.lineWidth = 1; for (let k = 1; k < 4; k++) { const f = k / 4; g.beginPath(); g.moveTo(lerp(x0, x1, f), lerp(y0, y1, f)); g.lineTo(lerp(x0, x2, f), lerp(y0, y2, f)); g.stroke(); }
    });
  }
  // the masts, their shrouds and ratlines, their painted sails
  for (const [mx, h, w1, w2] of MASTS3) {
    for (const s2 of [-1, 1]) for (const o of [36, 62]) {
      g.strokeStyle = LINE; g.lineWidth = 1.5; g.beginPath(); g.moveTo(mx, -h + 30); g.lineTo(mx + s2 * o, -66); g.stroke();
      if (o === 62) for (let k = 1; k < 7; k++) { const f = k / 7; g.strokeStyle = 'rgba(200,170,120,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(lerp(mx, mx + s2 * o, f), lerp(-h + 30, -66, f)); g.lineTo(lerp(mx, mx + s2 * 36, f), lerp(-h + 30, -66, f)); g.stroke(); }
    }
    g.save(); g.translate(mx, 0); mastPole(g, -h, -60, 12, false); g.restore();
    paintSail(g, mx, -h + 20, -h + 108, w1, { P: PD, sd: 900 + mx });
    yard(g, mx, -h + 20, w1 * 0.84);
    paintSail(g, mx, -h + 118, -96, w2 + 30, { P: PD, sun: mx === -10, sd: 910 + mx });
    yard(g, mx, -h + 118, (w2 + 30) * 0.84);
  }
  // the hull: dark crimson planks, the gold wale, S-scrolls between the gun ports, the stern castle with lit windows
  const hull = (g) => { g.beginPath(); g.moveTo(-290, -60); g.lineTo(200, -60); g.lineTo(206, -100); g.lineTo(300, -104); g.quadraticCurveTo(312, -44, 262, 6); g.lineTo(-220, 6); g.quadraticCurveTo(-290, -8, -290, -60); g.closePath(); };
  ink(g, hull, '#5a1824', 3, (g) => {
    g.strokeStyle = 'rgba(30,6,12,0.5)'; g.lineWidth = 1.2; for (let y = -52; y < 8; y += 8) { g.beginPath(); g.moveTo(-300, y); g.quadraticCurveTo(0, y + 4, 310, y - 6); g.stroke(); }
    const lg = g.createLinearGradient(-300, 0, 310, 0); lg.addColorStop(0, 'rgba(255,170,150,0.18)'); lg.addColorStop(0.5, 'rgba(255,170,150,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = lg; g.fillRect(-300, -110, 620, 120);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-300, -10, 620, 22);
    for (let x = 210; x < 296; x += 22) { g.fillStyle = '#ffd88a'; g.fillRect(x, -92, 12, 12); g.strokeStyle = '#3a1a10'; g.lineWidth = 1.6; g.strokeRect(x, -92, 12, 12); }
  });
  ink(g, (g) => { g.beginPath(); g.moveTo(-284, -49); g.quadraticCurveTo(0, -45, 290, -51); g.lineTo(290, -43); g.quadraticCurveTo(0, -37, -284, -41); g.closePath(); }, DAWNW.gold, 2, (g) => { g.fillStyle = 'rgba(255,250,210,0.7)'; g.fillRect(-290, -50, 590, 2); g.fillStyle = 'rgba(120,70,10,0.5)'; g.fillRect(-290, -42, 590, 3); });   // (the gold wale: a moulding, lit above, dark below)
  for (let i = 0; i < 6; i++) {   // (gun ports, lids raised, muzzles out; a gold S-scroll between each pair)
    const x = -224 + i * 76;
    g.fillStyle = '#12080a'; g.fillRect(x, -30, 18, 14); g.fillStyle = '#4a4a56'; g.fillRect(x + 4, -26, 13, 6);
    ink(g, (g) => poly(g, [x - 2, -31, x + 20, -31, x + 22, -38, x, -38]), '#7a2434', 1.4);

  }
  { g.strokeStyle = INK; g.lineWidth = 3.6; g.beginPath(); g.moveTo(-250, -22);   // (a gold vine of scrollwork running along her side, curling round the ports)
    for (let x = -250; x < 250; x += 38) { g.bezierCurveTo(x + 10, -6, x + 20, -6, x + 24, -16); g.bezierCurveTo(x + 28, -24, x + 34, -24, x + 38, -22); }
    g.stroke(); g.strokeStyle = DAWNW.gold; g.lineWidth = 1.8; g.stroke();
    for (let x = -231, k = 0; x < 250; x += 76, k++) { g.strokeStyle = DAWNW.gold; g.lineWidth = 1.6; g.beginPath(); g.ellipse(x + (k % 2 ? 6 : -6), -10, 4, 2.4, k % 2 ? 0.6 : -0.6, 0, TAU); g.stroke(); }   // (leaves)
  }
  // the rail and her crew, cheering: varied heights, poses and spacing; one up in the shrouds
  ink(g, (g) => { g.beginPath(); g.rect(-276, -70, 480, 8); }, '#4a2a18', 2);
  for (const [x, hgt, hat, wave] of [[-206, 1, 'tri', 2], [-120, 0.88, 'kerch', 1], [-58, 1.06, 'none', 0], [40, 0.94, 'tri', 2], [128, 1, 'kerch', 1]]) {
    g.save(); g.translate(x, -66); g.scale(hgt, hgt);
    g.fillStyle = '#2a1e2c'; g.strokeStyle = INK; g.lineWidth = 1.8;
    g.beginPath(); g.ellipse(0, -20, 7, 8, 0, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-10, 4); g.lineTo(-7, -10); g.lineTo(7, -10); g.lineTo(10, 4); g.closePath(); g.fill(); g.stroke();
    if (hat === 'tri') { g.beginPath(); g.moveTo(-12, -24); g.lineTo(0, -34); g.lineTo(12, -24); g.closePath(); g.fill(); g.stroke(); }
    else if (hat === 'kerch') { g.fillStyle = '#a8323c'; g.beginPath(); g.arc(0, -24, 7.4, Math.PI, 0); g.fill(); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(6, -8); g.lineTo(14, wave ? -34 : -22); if (wave === 2) { g.moveTo(-6, -8); g.lineTo(-15, -32); } g.stroke();
    g.restore();
  }
  g.save(); g.translate(-252, -140); g.fillStyle = '#2a1e2c'; g.strokeStyle = INK; g.lineWidth = 1.8;   // (one aloft, astride the fore yard's end, waving)
  g.beginPath(); g.ellipse(0, -14, 6, 7, 0, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-6, 8); g.lineTo(-5, -6); g.lineTo(6, -6); g.lineTo(7, 8); g.closePath(); g.fill(); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.moveTo(5, -4); g.lineTo(16, -24); g.moveTo(-5, -4); g.lineTo(-10, 8); g.stroke(); g.restore();
  // the flag on the mizzen top: the crew's friendly skull
  g.strokeStyle = LINE; g.lineWidth = 2; g.beginPath(); g.moveTo(150, -240); g.lineTo(150, -262); g.stroke();
  ink(g, (g) => { g.beginPath(); g.moveTo(150, -262); g.lineTo(194, -260); g.quadraticCurveTo(188, -250, 196, -238); g.lineTo(150, -240); g.closePath(); }, '#16121a', 2);
  g.fillStyle = '#f2e6c8'; g.beginPath(); g.arc(170, -251, 6, 0, TAU); g.fill(); g.fillStyle = '#16121a'; g.beginPath(); g.arc(168, -252, 1.6, 0, TAU); g.arc(172.5, -252, 1.6, 0, TAU); g.fill();
  // the prow: a curved beak carrying the figurehead
  ink(g, (g) => { g.beginPath(); g.moveTo(-282, -54); g.quadraticCurveTo(-312, -48, -330, -68); g.lineTo(-322, -84); g.quadraticCurveTo(-296, -70, -270, -70); g.closePath(); }, '#7a2434', 3);
  // the figurehead: a carved golden sun-face in three-quarter profile, looking ahead (left) -- serious and noble: straight brows over open
  // almond eyes, a strong nose, a calm closed mouth; burnished like metal; a mane of flames swept back toward the stern
  g.save(); g.translate(-336, -74); g.scale(1.25, 1.25);
  ink(g, (g) => { g.beginPath(); g.ellipse(4, 0, 30, 34, 0, 0, TAU); }, '#4a1a16', 2.4, (g) => { g.fillStyle = 'rgba(255,190,150,0.15)'; g.fillRect(-26, -34, 20, 68); });   // (the carved backing plate)
  for (let q = 0; q < 9; q++) {   // (the flames, swept back: longer behind)
    const an = -Math.PI * 0.95 + q * Math.PI * 0.21, len = 26 + q * 3.2 + (q % 2) * 6, c = Math.cos(an), s2 = Math.sin(an), bx = 4 + c * 18, by = s2 * 22;
    const tx = bx + c * len * 0.55 + len * 0.55, ty = by + s2 * len * 0.55 - 4;
    ink(g, (g) => { g.beginPath(); g.moveTo(bx - s2 * 7, by + c * 7); g.quadraticCurveTo(bx + c * len * 0.4 + 6, by + s2 * len * 0.4 + 6, tx, ty); g.quadraticCurveTo(bx + c * len * 0.3 - 2, by + s2 * len * 0.3 - 6, bx + s2 * 7, by - c * 7); g.closePath(); }, q % 2 ? '#b08030' : '#d0a440', 1.6, (g) => { g.fillStyle = 'rgba(255,240,170,0.45)'; g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.lineTo(bx + s2 * 5, by - c * 5); g.closePath(); g.fill(); });
  }
  const face = [-6, -26, 4, -28, 12, -18, 14, 0, 10, 18, 2, 26, -14, 24, -17, 17, -20, 13, -17, 9, -19, 5, -26, 2, -19, -6, -17, -12, -12, -22];
  ink(g, (g) => poly(g, face), '#d8aa40', 2.6, (g) => {
    const mg = g.createLinearGradient(-26, 0, 14, 0); mg.addColorStop(0, '#f6e8b4'); mg.addColorStop(0.35, '#dcb04c'); mg.addColorStop(1, '#7a5418'); g.fillStyle = mg; g.fillRect(-30, -30, 50, 60);   // (burnished: lit on its front)
    g.strokeStyle = '#fff2b0'; g.lineWidth = 2; g.beginPath(); g.moveTo(-16, -12); g.lineTo(-22, 1); g.stroke();   // (the nose's bridge, catching the light)
    g.strokeStyle = 'rgba(246,232,180,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-10, 4); g.quadraticCurveTo(-4, 1, 3, 6); g.stroke();   // (the cheekbone, catching the light)
    g.fillStyle = 'rgba(110,60,8,0.45)'; g.beginPath(); g.moveTo(2, -28); g.lineTo(14, -18); g.lineTo(14, 4); g.lineTo(10, 18); g.lineTo(2, 26); g.lineTo(4, 0); g.closePath(); g.fill();   // (the far side, in shadow)
  });
  g.strokeStyle = '#5a3008'; g.lineCap = 'round';
  g.lineWidth = 3.6; g.beginPath(); g.moveTo(-3, -12); g.lineTo(-16, -9); g.stroke();   // (a straight brow, slanting down to the nose)
  g.fillStyle = '#fff2c8'; g.beginPath(); g.moveTo(-15, -5); g.quadraticCurveTo(-9, -9, -3, -5); g.quadraticCurveTo(-9, -2, -15, -5); g.closePath(); g.fill();   // (an open almond eye)
  g.lineWidth = 1.6; g.stroke();
  g.fillStyle = '#5a3008'; g.beginPath(); g.arc(-10, -5.2, 1.8, 0, TAU); g.fill();   // (its carved pupil)
  g.lineWidth = 1.4; g.beginPath(); g.moveTo(-14, -1.5); g.quadraticCurveTo(-9, 0, -4, -2); g.stroke();   // (the lower lid's crease)
  g.lineWidth = 2.4; g.beginPath(); g.moveTo(-18, 12); g.lineTo(-9, 12.5); g.stroke();   // (a calm, closed mouth)
  g.fillStyle = 'rgba(90,48,8,0.45)'; g.beginPath(); g.ellipse(-13, 16, 4, 1.6, 0, 0, TAU); g.fill();   // (the lower lip's shadow)
  g.lineCap = 'butt';
  g.restore();
}
// a long flat bank of cloud (cx, cy its middle; w x h): overlapping wide puffs along a gently arched line, its edge lit from above (the moon)
// or from below (the sunrise), soft inside -- painted bands, never balls
function bank(g, cx, cy, w, h, sd, base, lit, litBelow, a = 1) {
  const R = mulberry(sd), puffs = [], n = 5 + Math.floor(w / 50), skew = R.r(0.6, 1.6);
  for (let k = 0; k < n; k++) {   // (an asymmetric profile: the bank heaps up toward one end)
    const u = k / (n - 1), pr = Math.sin(Math.pow(u, skew) * Math.PI), rx = R.r(28, 74) * (0.5 + 0.5 * pr), ry = h * R.r(0.28, 0.62) * (0.4 + 0.6 * pr);
    puffs.push([cx - w / 2 + u * w + R.r(-14, 14), cy - pr * h * 0.3 + R.r(-4, 4), rx, ry]);
  }
  const shape = (gr2) => { g.beginPath(); for (const [x, y, rx, ry] of puffs) { g.moveTo(x + rx + gr2, y); g.ellipse(x, y, rx + gr2, ry + gr2 * 0.7, 0, 0, TAU); } };
  g.save(); g.globalAlpha *= a;
  for (const [gr2, al] of [[6, 0.18], [3, 0.35]]) { shape(gr2); g.fillStyle = rgba(base, al); g.fill(); }   // (a soft, feathered edge)
  shape(0); g.fillStyle = base; g.fill();
  g.save(); shape(0); g.clip();
  for (const [x, y, rx, ry] of puffs) {
    const y0 = litBelow ? y + ry * 0.2 : y - ry, y1 = litBelow ? y + ry : y - ry * 0.2;
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(litBelow ? 0 : 1, rgba(lit, 0)); gr.addColorStop(litBelow ? 1 : 0, rgba(lit, 0.9));
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx * 0.92, ry, 0, 0, TAU); g.fill();
  }
  g.restore(); g.restore();
}
// the sky's panorama (SKY_W wide, tiled; small and soft): by night a few long banks of cloud low over the sea, silvered on top by the moon
// (the stars stay clear above); at dawn layered banks of pink cloud lit gold from the sunrise below them
function drawSkyPanel(g, dawn, view = -1) {
  const wrap = (fn) => { for (const o of [-SKY_W, 0, SKY_W]) { if (view >= 0 && (o + SKY_W + 500 < view || o - 500 > view + W)) continue; g.save(); g.translate(o, 0); fn(); g.restore(); } };
  const R = mulberry(dawn ? 6011 : 6007);
  const haze = (y0, col, a) => { g.save(); g.globalCompositeOperation = 'source-atop'; vgrad(g, -20, y0, SKY_W + 40, HORIZON + 8, [[0, `rgba(${col},0)`], [1, `rgba(${col},${a})`]]); g.restore(); };   // (the far banks sink into the air)
  if (dawn) {
    for (let k = 0; k < 7; k++) { const x = k * (SKY_W / 7) + R.r(0, 120), w = R.r(260, 420); wrap(() => bank(g, x, R.r(60, 120), w, R.r(26, 40), 500 + k, '#c88ab4', '#ffe4c8', true, 0.85)); }
    for (let k = 0; k < 9; k++) { const x = k * (SKY_W / 9) + R.r(0, 80), w = R.r(200, 340); wrap(() => bank(g, x, R.r(170, 226), w, R.r(22, 34), 520 + k, '#b07aa8', '#ffd0a0', true)); }
    haze(160, '255,210,176', 0.18);
  } else {
    for (let k = 0; k < 5; k++) { const x = k * (SKY_W / 5) + R.r(0, 160), w = R.r(240, 380); wrap(() => bank(g, x, R.r(196, 232), w, R.r(20, 30), 600 + k, '#121a3c', '#6a86c4', false)); }
    haze(170, '42,71,132', 0.22);
    for (let k = 0; k < 3; k++) { const x = k * (SKY_W / 3) + R.r(0, 300), w = R.r(200, 300); wrap(() => bank(g, x, R.r(110, 160), w, R.r(18, 26), 620 + k, '#161e46', '#9ab2e4', false, 0.8)); }
  }
}
// ---- SAILS (shared with src/stages/sibluegull.js) ----
// a square sail under its yard (cx, top..bot, width w), painted: the canvas bellies out (lit on the left, in shadow on the right, a soft
// light in its belly), its cloths' seams bow with it, folds pull from the yard's ties, a reef band with its points, wet and darker at the
// foot, streaked with rain.  o: { P (colours), patches (the Gull's brown patches), rips (torn holes, frayed), sun (the Dawn's), sd }
function paintSail(g, cx, top, bot, w, o) {
  const P = o.P, R = mulberry(o.sd), mid = (top + bot) / 2, hgt = bot - top;
  const shape = (g) => { g.beginPath(); g.moveTo(cx - w / 2, top); g.lineTo(cx + w / 2, top); g.quadraticCurveTo(cx + w / 2 + 24, mid, cx + w / 2 - 10, bot); g.quadraticCurveTo(cx, bot + 14, cx - w / 2 + 10, bot); g.quadraticCurveTo(cx - w / 2 - 24, mid, cx - w / 2, top); g.closePath(); };
  ink(g, shape, P.base, 2.6, (g) => {
    mottle(g, cx - w / 2 - 34, top - 12, w + 68, hgt + 40, 0.65); { const sg = g.createLinearGradient(0, top, 0, bot + 14); sg.addColorStop(0, 'rgba(255,250,236,0.1)'); sg.addColorStop(0.55, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(20,16,30,0.16)'); g.fillStyle = sg; g.fillRect(cx - w / 2 - 34, top - 12, w + 68, hgt + 40); }   // (the canvas's painterly texture; lit at the yard, shadowed in its belly)
    if (o.patches) for (let k = 0; k < o.patches; k++) {   // the brown patches, stitched on
      const big = k === 0 ? 1.6 : 1, px = cx + (k % 2 ? 1 : -1) * R.r(w * 0.08, w * 0.34), py = top + R.r(hgt * 0.25, hgt * 0.8), pw = R.r(22, 40) * big, ph = R.r(16, 28) * big, pp = [];
      for (let q = 0; q < 7; q++) { const an = (q / 7) * TAU + R.r(-0.2, 0.2), rr = R.r(0.75, 1.1); pp.push(px + Math.cos(an) * pw * 0.5 * rr, py + Math.sin(an) * ph * 0.5 * rr); }
      ink(g, (g) => poly(g, pp), P.patch, 1.1, (g) => { g.fillStyle = rgba(P.patchD, 0.25); g.beginPath(); g.ellipse(px + pw * 0.15, py + ph * 0.1, pw * 0.3, ph * 0.25, 0.3, 0, TAU); g.fill(); });   // (an old patch, stained)
      g.strokeStyle = rgba(P.patchD, 0.8); g.setLineDash([2.5, 3]); g.lineWidth = 1; poly(g, pp.map((v, i) => (i & 1 ? lerp(v, py, 0.2) : lerp(v, px, 0.2)))); g.stroke(); g.setLineDash([]);
    }
    if (o.sun) {   // the Dawn's gold sun, painted on the canvas (squashed a little by the belly, shaded with it below)
      g.save(); g.translate(cx + w * 0.04, mid + 2); g.scale(0.9, 1);
      for (let k = 0; k < 12; k++) { const an = k * TAU / 12, r1 = k & 1 ? 26 : 32; g.fillStyle = '#d8a030'; g.beginPath(); g.moveTo(Math.cos(an - 0.12) * 17, Math.sin(an - 0.12) * 17); g.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); g.lineTo(Math.cos(an + 0.12) * 17, Math.sin(an + 0.12) * 17); g.closePath(); g.fill(); }
      const sg = g.createRadialGradient(-5, -5, 2, 0, 0, 16); sg.addColorStop(0, '#ffe08a'); sg.addColorStop(1, '#d8a030'); g.fillStyle = sg; g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill();
      g.restore();
    }
    // the cloths' seams, bowing out with the belly
    for (let k = 1; k < 6; k++) {
      const x = cx - w / 2 + (w * k) / 6;
      g.beginPath(); g.moveTo(x, top); g.quadraticCurveTo(x + (x - cx) * 0.2, mid, x + (x - cx) * 0.06, bot + 8);
      g.strokeStyle = rgba(P.seam, 0.42); g.lineWidth = 1.2; g.stroke();
      g.beginPath(); g.moveTo(x + 2, top); g.quadraticCurveTo(x + 2 + (x - cx) * 0.2, mid, x + 2 + (x - cx) * 0.06, bot + 8); g.strokeStyle = rgba(P.hi, 0.22); g.lineWidth = 1; g.stroke();
    }
    // the reef band and its points
    const ry = top + hgt * 0.2;
    g.beginPath(); g.moveTo(cx - w / 2 - 20, ry); g.quadraticCurveTo(cx, ry + 10, cx + w / 2 + 20, ry); g.strokeStyle = rgba(P.seam, 0.6); g.lineWidth = 1.6; g.stroke();
    for (let x = cx - w / 2 + 12; x < cx + w / 2 - 6; x += 18) { const yy = ry + 10 * (1 - ((x - cx) / (w / 2 + 20)) ** 2) - 0.5; g.strokeStyle = rgba(P.seam, 0.7); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, yy - 3); g.lineTo(x + 1, yy + 4); g.stroke(); }
    // the light: across it (lit left), in its belly, the folds pulling from the yard, the wet foot, the rain
    const lg = g.createLinearGradient(cx - w / 2 - 26, 0, cx + w / 2 + 26, 0);
    lg.addColorStop(0, rgba(P.hi, 0.6)); lg.addColorStop(0.32, rgba(P.hi, 0)); lg.addColorStop(0.62, rgba(P.sh, 0)); lg.addColorStop(1, rgba(P.sh, 0.75));
    g.fillStyle = lg; g.fillRect(cx - w / 2 - 30, top - 4, w + 60, hgt + 24);
    const bg = g.createRadialGradient(cx - w * 0.14, mid + hgt * 0.05, 0, cx - w * 0.14, mid, w * 0.62); bg.addColorStop(0, rgba(P.hi, 0.3)); bg.addColorStop(0.55, rgba(P.hi, 0)); bg.addColorStop(1, rgba(P.sh, 0.4));
    g.fillStyle = bg; g.fillRect(cx - w / 2 - 30, top - 4, w + 60, hgt + 24);
    for (let k = 0; k < 5; k++) {   // (folds from the ties: a dark crease and its lit side)
      const fx = cx - w / 2 + 14 + (w - 28) * (k / 4) + R.r(-6, 6), dir = fx < cx ? 1 : -1, len = hgt * R.r(0.18, 0.32);
      g.beginPath(); g.moveTo(fx, top + 1); g.quadraticCurveTo(fx + dir * 6, top + len * 0.5, fx + dir * 14, top + len); g.strokeStyle = rgba(P.sh, 0.55); g.lineWidth = 2.2; g.stroke();
      g.beginPath(); g.moveTo(fx + 3, top + 1); g.quadraticCurveTo(fx + 3 + dir * 6, top + len * 0.5, fx + 3 + dir * 14, top + len); g.strokeStyle = rgba(P.hi, 0.3); g.lineWidth = 1.4; g.stroke();
    }
    vgrad(g, cx - w / 2 - 30, bot - hgt * 0.3, w + 60, bot + 16, [[0, 'rgba(10,10,30,0)'], [1, 'rgba(10,10,30,0.34)']]);   // (wet at the foot)
    g.strokeStyle = rgba('#ffffff', 0.1); g.lineWidth = 1;
    for (let k = 0; k < 10; k++) { const x = cx + R.r(-w * 0.45, w * 0.45), y = top + R.r(0, hgt * 0.8), l = R.r(14, 30); g.beginPath(); g.moveTo(x, y); g.lineTo(x - l * 0.25, y + l); g.stroke(); }
  });
  if (o.ragged) {   // ragged edges: notches torn out of the foot and leeches, tatters hanging from them
    const notch = (x, y, dx, dy, sz) => {
      const pts = [x - dy * sz, y + dx * sz, x + dx * sz * 1.4 + R.r(-3, 3), y + dy * sz * 1.4 + R.r(-3, 3), x + dy * sz, y - dx * sz];
      g.save(); g.globalCompositeOperation = 'destination-out'; poly(g, pts); g.fill(); g.restore();
      polyline(g, pts); g.strokeStyle = LINE; g.lineWidth = 1.6; g.stroke();
      for (let q = 0; q < 2; q++) { const tx = lerp(pts[0], pts[4], 0.3 + q * 0.4), ty = lerp(pts[1], pts[5], 0.3 + q * 0.4); g.strokeStyle = rgba(P.sh, 0.95); g.lineWidth = 1.6; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + R.r(-3, 3), ty + 6, tx + R.r(-4, 4), ty + R.r(9, 15)); g.stroke(); }
    };
    for (let k = 0; k < 2; k++) { const u = R.r(-0.35, 0.35); notch(cx + u * w, bot + 10 * (1 - (u * 2) ** 2), 0, -1, R.r(6, 10)); }   // (the foot)
    notch(cx - w / 2 - 18, lerp(top, bot, R.r(0.45, 0.7)), 1, 0, R.r(5, 8)); notch(cx + w / 2 + 18, lerp(top, bot, R.r(0.4, 0.65)), -1, 0, R.r(5, 8));   // (the leeches)
  }
  if (o.rips) for (let k = 0; k < o.rips; k++) {   // torn holes: a jagged hole (the sky through it), frayed threads hanging off its top
    const px = cx + R.r(-w * 0.3, w * 0.3), py = top + R.r(hgt * 0.3, hgt * 0.75), rw = R.r(12, 22), rh = R.r(16, 30), pts = [];
    for (let q = 0; q < 9; q++) { const an = (q / 9) * TAU, rr = 0.55 + 0.45 * R(); pts.push(px + Math.cos(an) * rw * rr, py + Math.sin(an) * rh * rr); }
    g.save(); g.globalCompositeOperation = 'destination-out'; poly(g, pts); g.fill(); g.restore();
    poly(g, pts); g.strokeStyle = LINE; g.lineWidth = 1.8; g.stroke();
    for (let q = 0; q < 4; q++) { const tx = px + R.r(-rw * 0.7, rw * 0.7), ty = py - rh * 0.5 + R.r(-2, 4); g.strokeStyle = rgba(P.sh, 0.9); g.lineWidth = 1.4; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + R.r(-3, 3), ty + 6, tx + R.r(-4, 4), ty + R.r(8, 16)); g.stroke(); }
  }
}
// a yard (a spar across the mast), wood with a lit top and iron bands at its ties
function yard(g, cx, y, w) {
  ink(g, (g) => { g.beginPath(); g.moveTo(cx - w / 2 - 22, y - 4); g.lineTo(cx + w / 2 + 22, y - 4); g.lineTo(cx + w / 2 + 26, y); g.lineTo(cx + w / 2 + 22, y + 5); g.lineTo(cx - w / 2 - 22, y + 5); g.lineTo(cx - w / 2 - 26, y); g.closePath(); }, '#5a3a22', 2.2, (g) => {
    g.fillStyle = 'rgba(255,240,220,0.22)'; g.fillRect(cx - w / 2 - 26, y - 4, w + 52, 2.6);
    g.strokeStyle = 'rgba(30,16,8,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx - w / 2 - 20, y + 1); g.lineTo(cx + w / 2 + 20, y + 1.5); g.stroke();
  });
  for (const dx of [-w * 0.3, 0, w * 0.3]) { g.fillStyle = INK; g.fillRect(cx + dx - 3, y - 5, 6, 11); g.fillStyle = '#6a6e78'; g.fillRect(cx + dx - 2, y - 4, 4, 9); }
}
// a mast (its foot at 0, 0; y up negative): a wooden pole -- grain, a wet highlight, iron bands with rivets -- carrying its sails.  v: the
// variant { P, gull (patched, torn, its topmast snapped and the upper sail hanging loose), v2 (the Dawn's second: different sails) }
function mastPole(g, y0, y1, w, broken) {
  const pts = [-w / 2, y1, -w / 2 + 1, y0, w / 2 - 1, y0, w / 2, y1];
  if (broken) pts.splice(2, 4, -w / 2 + 1, y0 + 6, -w / 2 + 4, y0 - 4, -1, y0 + 4, 2, y0 - 8, w / 2 - 3, y0 + 2, w / 2 - 1, y0 + 8);
  ink(g, (g) => poly(g, pts), '#5a3a22', 2.8, (g) => {
    g.strokeStyle = 'rgba(30,16,8,0.45)'; g.lineWidth = 1; for (const fx of [-0.25, 0.1, 0.32]) { g.beginPath(); for (let y = y0; y <= y1; y += 20) { const x = fx * w + Math.sin(y * 0.05 + fx * 9) * 1.2; if (y === y0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(210,220,255,0.3)'; g.fillRect(-w / 2 + 2, y0, 2.2, y1 - y0);   // (the rain's sheen)
    g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(w * 0.2, y0, w * 0.4, y1 - y0);
  });
  for (let y = y1 - 60; y > y0 + 20; y -= 90) { g.fillStyle = INK; g.fillRect(-w / 2 - 2, y, w + 4, 7); g.fillStyle = '#6a6e78'; g.fillRect(-w / 2 - 2, y + 1.4, w + 4, 4); g.fillStyle = '#c8ccd8'; for (const dx of [-w * 0.3, w * 0.3]) g.fillRect(dx - 0.8, y + 2.6, 1.6, 1.6); }
}
// its shrouds and ratlines, drawn live (they reach far beyond the sails: no cache for them), in the mast's own transform
function shrouds(ctx, top) {
  ctx.lineCap = 'round';
  for (const s2 of [-1, 1]) for (const off of [78, 128, 176, 226]) {
    ctx.strokeStyle = 'rgba(14,10,18,0.9)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(s2 * 5, top); ctx.lineTo(s2 * off, -44); ctx.stroke();
    if (off === 128 || off === 176) for (let k = 1; k < 9; k++) { const f = k / 9; ctx.strokeStyle = 'rgba(190,170,120,0.5)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(lerp(s2 * 5, s2 * off, f), lerp(top, -44, f)); ctx.lineTo(lerp(s2 * 5, s2 * off, f) + s2 * 15, lerp(top, -44, f) + 2); ctx.stroke(); }
  }
  ctx.lineCap = 'butt';
}
// the Blue Gull's mast (the foot at 0, 0; y negative up): pole, iron bands, patched blue sails on yards (belly out), a pennant,
// and -- variant 1 -- a crow's nest; the shrouds run down to the rail on both sides
function drawMast(g, variant) {
  // the Blue Gull's masts: her patched blue sails, painted (one old hole in the topsail), a crow's nest on the main, a blue pennant
  const P = { ...SAIL, sh: SAIL.sh, seam: SAIL.seam };
  paintSail(g, 0, -250, -128, 250, { P, patches: 4, sd: variant ? 77 : 71 }); yard(g, 0, -250, 250);
  paintSail(g, 0, -350, -262, 190, { P, patches: 2, sd: variant ? 78 : 72 }); yard(g, 0, -350, 190);
  mastPole(g, -364, 10, 20, false);
  if (variant) {   // the crow's nest: a barrel ring with a lip
    ink(g, (g) => { g.beginPath(); g.moveTo(-26, -282); g.lineTo(26, -282); g.lineTo(32, -318); g.lineTo(-32, -318); g.closePath(); }, '#7a5230', 2.4, (g) => { g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.4; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * 11, -318); g.lineTo(k * 9, -282); g.stroke(); } g.fillStyle = 'rgba(255,240,220,0.2)'; g.fillRect(-32, -318, 14, 36); });
    ink(g, (g) => { g.beginPath(); g.rect(-35, -324, 70, 8); }, '#5a3a22', 2);
  }
  ink(g, (g) => { g.beginPath(); g.moveTo(10, -358); g.quadraticCurveTo(40, -366, 66, -352); g.quadraticCurveTo(40, -348, 10, -340); g.closePath(); }, '#4a7ad0', 1.8, (g) => { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(10, -360, 56, 5); });   // (the blue pennant)
}
// a hammock (its anchor: top centre, the hooks at +-104): a fan of ropes at each end, the canvas slung in a deep bowl, a rolled blanket
// and a pillow on top
function drawHammock(g, seed) {
  const R = mulberry(seed);
  for (const s of [-1, 1]) ink(g, (g) => { g.beginPath(); g.arc(s * 104, 0, 5, 0, TAU); }, '#b89a4a', 1.8);
  // the bowl: the back (far) edge, then the front
  const bowl = (g) => { g.beginPath(); g.moveTo(-88, 30); g.bezierCurveTo(-70, 120, 70, 120, 88, 30); g.bezierCurveTo(70, 70, -70, 70, -88, 30); g.closePath(); };
  ink(g, bowl, '#d2c394', 2.6, (g) => {
    g.strokeStyle = rgba('#3a4a78', 0.65); g.lineWidth = 5; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(k * 28, 40); g.quadraticCurveTo(k * 30, 96, k * 24, 126); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(28, 104, 70, 24, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,248,220,0.3)'; g.beginPath(); g.ellipse(-30, 66, 36, 8, 0.1, 0, TAU); g.fill();
  });
  // the ropes: four to a hook, from the hook to the canvas's end
  for (const s of [-1, 1]) for (const k of [0, 1, 2, 3]) {
    const ex = s * (86 - k * 2), ey = 30 + k * 4;
    g.strokeStyle = LINE; g.lineWidth = 3.6; g.beginPath(); g.moveTo(s * 104, 3); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = '#c4a870'; g.lineWidth = 1.7; g.stroke();
  }
  // the pillow, the rolled blanket
  if (R() > 0.35) ink(g, (g) => { g.beginPath(); g.ellipse(-58, 62, 26, 12, -0.5, 0, TAU); }, '#f2eee0', 1.8);
  ink(g, (g) => { g.beginPath(); g.ellipse(14, 70, 54, 13, 0.1, 0, TAU); }, R() > 0.5 ? '#a8323c' : '#3e6a9a', 1.8, (g) => { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.4; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(14 + k * 18, 58); g.lineTo(14 + k * 18, 82); g.stroke(); } });
}
// the sprite for a lantern's glow (one radial, drawn additively and scaled)
// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0, kraken = 0, conch = 0, behind = null;   // (behind: setBehindRail)
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    setLS('near');
    // (the near layer first: the deck and its rail at one scale; then the sprites; the cabin's back wall last -- under a cap it steps down first)
    c.dawnShip = makeSprite(900, 400, 480, 350, Math.min(csFar, 1.5), (g) => { setLS('far'); drawScarletDawn(g); g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(242,198,212,0.3)'; g.fillRect(-480, -350, 900, 400); g.restore(); drawFigureheadGlint(g); });
    c.ground = buildStrip(-10, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawFloor(g, xa, xb); });
    c.bulwark = buildStrip(HOUSE_X1 - 20, LEVEL_LEN + 10, RAIL_TOP - 38, BULW_BOT + 6, cs, 1, (g, xa, xb) => { setLS('near'); drawBulwark(g, xa, xb); });
    unifyFit([c.ground, c.bulwark]);
    // (then the small and far sprites, the masts and the ship; under a memory cap the cabin wall (last) steps down first,    //  evenly, and a mast that would land below scale 1 is painted live instead)
    const sharp = (mk) => { const sp = mk(false); if (!sp.c.__live && sp.c.width / sp.w < 0.99) { freeCanvases(sp.c); return mk(true); } return sp; };
    c.skyN = makeSprite(SKY_W, SKY_H, 0, 0, Math.min(csFar, 1) * 0.5, (g) => drawSkyPanel(g, false));
    c.skyD = makeSprite(SKY_W, SKY_H, 0, 0, Math.min(csFar, 1) * 0.5, (g) => drawSkyPanel(g, true));
    // glows and particles
    c.glow = radialSprite(64, 0.5, [[0, 'rgba(255,214,140,1)'], [0.22, 'rgba(255,190,100,0.7)'], [0.55, 'rgba(255,150,60,0.22)'], [1, 'rgba(255,130,40,0)']]);
    c.moon = radialSprite(90, 0.5, [[0, 'rgba(255,252,232,0.9)'], [0.2, 'rgba(240,244,255,0.6)'], [0.22, 'rgba(230,236,255,0.55)'], [0.5, 'rgba(160,190,255,0.2)'], [1, 'rgba(120,160,255,0)']]);
    c.sunGlow = radialSprite(256, 0.5, [[0, 'rgba(255,230,170,1)'], [0.25, 'rgba(255,176,130,0.6)'], [0.6, 'rgba(240,120,150,0.2)'], [1, 'rgba(220,100,150,0)']]);
    c.fogPuff = radialSprite(64, 0.5, [[0, 'rgba(255,222,226,0.95)'], [0.55, 'rgba(250,206,216,0.5)'], [1, 'rgba(244,196,210,0)']]);
    c.purple = radialSprite(256, 0.5, [[0, 'rgba(214,150,255,0.9)'], [0.4, 'rgba(160,70,230,0.45)'], [1, 'rgba(120,30,200,0)']]);
    c.mote = radialSprite(6, Math.max(1, cs), [[0, 'rgba(255,238,200,1)'], [0.4, 'rgba(255,214,150,0.6)'], [1, 'rgba(255,200,130,0)']]);
    const mSc = cs >= 2 ? 1.75 : Math.max(1, cs * 0.85);   // (the masts: mid-ground, a step under the near scale)
    c.mastA = sharp((lv) => makeSprite(330, 400, 165, 380, mSc, (g) => { setLS('mid'); drawMast(g, 0); }, lv));
    c.mastB = sharp((lv) => makeSprite(330, 400, 165, 380, mSc, (g) => { setLS('mid'); drawMast(g, 1); }, lv));
    c.cannon = makeSprite(90, 90, 45, 84, cs, (g) => { setLS('near'); drawCannon(g); });
    c.hammock = [0, 1, 2, 3].map((i) => makeSprite(230, 140, 115, 12, cs, (g) => { setLS('near'); drawHammock(g, 100 + i * 7); }));
    c.lantern = makeSprite(60, 80, 30, 62, cs, (g) => { setLS('near'); lanternSprite(g); });


    c.interior = buildStrip(-10, HOUSE_X1 + 60, 0, 372, cs, 1, (g, xa, xb) => { setLS('near'); drawInterior(g, xa, xb); drawStairs(g, xa, xb); });
    return c;
  }

  // ------------------------------------------------------------------ the sky, the sea, the ship alongside
  function sky(ctx, C, camX, t) {
    const dk = dawnK(camX + W * 0.6);
    const N = ['#050b22', '#0c1a44', '#183062', '#2a4784'], D = ['#3a3a86', '#7e5aa6', '#ea92a6', '#ffd2b0'];
    const gr = ctx.createLinearGradient(0, 0, 0, HORIZON + 4);
    [0, 0.4, 0.76, 1].forEach((o, i) => gr.addColorStop(o, mix(N[i], D[i], dk)));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, HORIZON + 4);
    if (dk < 0.98) {   // the stars: twinkling, fading into the dawn
      const a = (1 - dk) * (1 - dk);
      for (const s of LAY.stars) {
        const x = ((s.x - camX * s.par) % W + W) % W;
        ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)); ctx.fillStyle = '#fff6dc';
        ctx.fillRect(x - s.r / 2, s.y - s.r / 2, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      const mx = 770 - camX * 0.03, my = 76;
      ctx.globalAlpha = (1 - dk) * 0.95; ctx.drawImage(C.moon.c, mx - 90, my - 90, 180, 180);
      ctx.fillStyle = '#fffbea'; ctx.beginPath(); ctx.arc(mx, my, 17.6, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(214,214,230,0.5)'; ctx.beginPath(); ctx.arc(mx + 5, my - 3, 4, 0, TAU); ctx.arc(mx - 6, my + 5, 3, 0, TAU); ctx.fill();   // (the disc: live, round)
      ctx.globalAlpha = 1;
    }
    if (dk > 0.02) {   // the dawn: a glow on the horizon, pink clouds
      const gx = W * 0.64 - camX * 0.015;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = dk * 0.9; ctx.drawImage(C.sunGlow.c, gx - 256, HORIZON - 150, 512, 256); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    const off = ((camX * 0.05 + t * 2) % SKY_W + SKY_W) % SKY_W;   // (the panoramas: night's fading into dawn's)
    for (const [spr, a] of [[C.skyN, 1 - dk], [C.skyD, dk]]) { if (a < 0.02) continue; ctx.globalAlpha = a; const Sd = Math.abs(ctx.getTransform().a) || 1; for (let x = -off; x < W; x += SKY_W) { const x0 = Math.round(x * Sd) / Sd, x1 = Math.round((x + SKY_W) * Sd) / Sd; ctx.drawImage(spr.c, x0, 0, x1 - x0, SKY_H); } }   // (both ends snapped to device pixels: the tiles abut exactly at any scale)   // (cached small: far and soft)
    ctx.globalAlpha = 1;
  }
  function sea(ctx, C, camX, t) {
    const dk = dawnK(camX + W * 0.6);
    const gr = ctx.createLinearGradient(0, HORIZON, 0, BULW_TOP + 10);
    gr.addColorStop(0, mix('#14295a', '#9a86b8', dk)); gr.addColorStop(1, mix('#070f2a', '#4a4a86', dk));
    ctx.fillStyle = gr; ctx.fillRect(0, HORIZON, W, BULW_TOP + 10 - HORIZON);
    ctx.fillStyle = mix('#6a86c0', '#ffd6c0', dk); ctx.globalAlpha = 0.5; ctx.fillRect(0, HORIZON - 1, W, 2); ctx.globalAlpha = 1;   // (the horizon line)
    // the swell: rows of low waves heaving in, their crests catching the moon (or the dawn), a little foam on the peaks
    const wy = (w, x) => w.y + Math.sin((x + camX * w.par) / w.len + t * w.sp + w.ph) * w.amp + Math.sin((x - camX * w.par * 0.7) / (w.len * 0.43) - t * w.sp * 1.3) * w.amp * 0.4;
    SEA_WAVES.forEach((w, r) => {
      ctx.beginPath(); ctx.moveTo(0, BULW_TOP + 12);
      for (let x = 0; x <= W + 24; x += 16) ctx.lineTo(x, wy(w, x));
      ctx.lineTo(W, BULW_TOP + 12); ctx.closePath();
      const wg = ctx.createLinearGradient(0, w.y - w.amp * 2, 0, w.y + 14);
      wg.addColorStop(0, mix(mix('#24406e', '#8a7ab4', dk), mix('#162a56', '#6a5a96', dk), r / 5)); wg.addColorStop(1, mix(mix('#0c1838', '#4a4a86', dk), mix('#070f2a', '#3a3a70', dk), r / 5));
      ctx.fillStyle = wg; ctx.fill();
      ctx.strokeStyle = dk > 0.5 ? `rgba(255,214,214,${0.2 + 0.05 * r})` : `rgba(190,214,255,${0.16 + 0.05 * r})`; ctx.lineWidth = 1 + r * 0.22; ctx.beginPath();
      for (let x = 0; x <= W + 24; x += 16) { const y = wy(w, x), on = hash2(Math.round((x + camX * w.par) / 48), r + 30) > 0.35; if (x === 0 || !on) ctx.moveTo(x, y); else ctx.lineTo(x, y); }   // (the crests broken)
      ctx.stroke();
      ctx.strokeStyle = `rgba(236,244,255,${0.22 + 0.08 * r})`; ctx.lineWidth = 1.2 + r * 0.25; ctx.lineCap = 'round';
      for (let x = 8; x <= W; x += 16) { const y = wy(w, x); if (y < wy(w, x - 8) && y < wy(w, x + 8) && hash2(Math.round((x + camX * w.par) / 16), r) > 0.55) { ctx.beginPath(); ctx.moveTo(x - 6 - r, y + 1); ctx.quadraticCurveTo(x, y - 1.6, x + 6 + r, y + 1.2); ctx.stroke(); } }
      ctx.lineCap = 'butt';
    });
    if (dk < 0.9) { const mx = 770 - camX * 0.03; ctx.strokeStyle = `rgba(236,244,255,${0.55 * (1 - dk)})`; ctx.lineWidth = 1.6; for (let k = 0; k < 12; k++) { const y = HORIZON + 5 + k * 5.4, half = 6 + k * 3.4, x = mx + Math.sin(t * 1.5 + k * 1.9) * half * 0.5, len = 4 + 6 * Math.abs(Math.sin(t * 2.2 + k)); ctx.beginPath(); ctx.moveTo(x - len, y); ctx.lineTo(x + len, y); ctx.stroke(); } }   // (the moon's path)
    if (dk > 0.1) { const gx = W * 0.64 - camX * 0.015; ctx.strokeStyle = `rgba(255,226,180,${0.6 * dk})`; ctx.lineWidth = 1.8; for (let k = 0; k < 12; k++) { const y = HORIZON + 4 + k * 5.4, half = 8 + k * 4, x = gx + Math.sin(t * 1.4 + k * 1.7) * half * 0.5, len = 5 + 7 * Math.abs(Math.sin(t * 2 + k)); ctx.beginPath(); ctx.moveTo(x - len, y); ctx.lineTo(x + len, y); ctx.stroke(); } }   // (the sunrise's glint on the water)
    vgrad(ctx, 0, HORIZON - 2, W, HORIZON + 38, [[0, dk > 0.5 ? 'rgba(255,214,200,0.4)' : 'rgba(140,170,230,0.3)'], [0.3, dk > 0.5 ? 'rgba(255,214,200,0.14)' : 'rgba(140,170,230,0.12)'], [1, 'rgba(140,170,230,0)']]);   // (haze on the horizon, thinning over the far rows: they sink into the air)
  }
  /** the Scarlet Dawn out of the fog (camX 4750 -> 5240) */
  /** seagulls at dawn: a few wheeling over the water, wings beating */
  function gulls(ctx, camX, t, dk) {
    if (dk < 0.3) return;
    ctx.save(); ctx.strokeStyle = `rgba(40,30,50,${0.75 * sstep(0.3, 0.7, dk)})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 170 + t * (18 + i * 4) - camX * 0.08) % (W + 200) + W + 200) % (W + 200) - 100, y = 60 + (i * 37) % 120 + Math.sin(t * 0.7 + i) * 10, f = Math.sin(t * 6 + i * 1.7), s2 = 0.7 + (i % 3) * 0.2;
      ctx.beginPath(); ctx.moveTo(x - 10 * s2, y - f * 5 * s2); ctx.quadraticCurveTo(x - 4 * s2, y - 4 * s2 - f * 2, x, y); ctx.quadraticCurveTo(x + 4 * s2, y - 4 * s2 - f * 2, x + 10 * s2, y - f * 5 * s2); ctx.stroke();
    }
    ctx.restore();
  }
  function ship(ctx, C, camX, t) {
    const lk = loomK(camX);
    if (lk <= 0.005) return;
    const x = lerp(1400, 740, lk), y = HORIZON + 46 + Math.sin(t * 1.1) * 2;
    ctx.globalAlpha = Math.min(1, lk * 1.8);
    const sp = C.dawnShip;
    ctx.drawImage(sp.c, x - sp.ox, y - sp.oy, sp.w, sp.h);
    ctx.globalAlpha = Math.min(1, lk * 1.8);   // (the sea along her waterline: a band of swell over her hull's foot, foam on it)
    const wg = ctx.createLinearGradient(0, y - 4, 0, y + 22); wg.addColorStop(0, 'rgba(120,110,170,0.9)'); wg.addColorStop(1, 'rgba(80,76,140,1)'); ctx.fillStyle = wg; ctx.fillRect(x - 300, y + 2, 620, 24);
    ctx.strokeStyle = 'rgba(255,240,240,0.85)'; ctx.lineWidth = 2.4; ctx.beginPath(); for (let dx = -296; dx <= 300; dx += 12) { const yy = y + 2 + Math.sin(dx * 0.08 + t * 3) * 1.6; if (dx === -296) ctx.moveTo(x + dx, yy); else ctx.lineTo(x + dx, yy); } ctx.stroke();
    // cannon smoke: soft puffs from her ports, rising and swelling as they fade
    const tt = t;
    for (const [dx, ph] of [[-170, 0], [-18, 0.4], [134, 0.75]]) {
      const u = (tt * 0.25 + ph) % 1;
      ctx.globalAlpha = Math.min(1, lk * 1.4) * 0.75 * (1 - u); ctx.drawImage(C.fogPuff.c, x + dx - 20 - u * 20, y - 30 - u * 40 - 20 - u * 16, 40 + u * 40, 40 + u * 32);
    }
    const veil = 0.22 + 0.5 * (1 - lk);   // (the fog in front of her: thinning as she looms close, never gone)
    for (const [dx, dy, w2, h2, ph] of [[-260, -170, 340, 70, 0], [40, -210, 380, 80, 1.3], [-120, -90, 420, 60, 2.1], [200, -120, 300, 60, 2.9], [-40, -10, 560, 50, 0.7]]) {
      ctx.globalAlpha = Math.min(1, lk * 1.8) * veil * (0.75 + 0.25 * Math.sin(t * 0.4 + ph)); ctx.drawImage(C.fogPuff.c, x + dx - w2 / 2 + Math.sin(t * 0.2 + ph) * 20, y + dy - h2 / 2, w2, h2);
    }
    ctx.globalAlpha = 1;
  }
  /** the kraken's tentacle rising behind the rail (k 0..1): purple-red, suckered, swaying; a splash at its foot */
  function tentacle(ctx, camX, t, k) {
    const bx = 400, by = BULW_TOP + 6, hgt = 50 + 275 * k, sw = Math.sin(t * 1.6) * 16 * k;
    let drew = false;
    try { drew = !!CHARS.kraken_arm?.drawRise?.(ctx, bx, by, k, t, -1, 1.25); } catch (e) { drew = false; if (!tentacle.err) { tentacle.err = 1; console.error('railArm', e); } }   // (the painted arm, AA QA A1; a throw logged once)
    if (!drew && !tentacle.miss && CHARS.kraken_arm?.ATLAS_SCALE) { tentacle.miss = 1; console.warn('sibluegull: the rail arm drawn by its code tube (kraken_arm not decoded: the scene set missed it)'); }
    if (drew) {
      ctx.fillStyle = 'rgba(235,225,255,0.7)'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(bx - 60 + i * 18 + Math.sin(t * 5 + i) * 4, by + 4 - Math.abs(Math.sin(t * 3 + i * 1.7)) * 10 * k, 5 + (i % 3), 0, TAU); ctx.fill(); }
      return;
    }
    const pts = [];
    for (let i = 0; i <= 12; i++) { const f = i / 12; pts.push([bx + sw * f * f + Math.sin(f * 3.4 + t * 1.2) * 22 * f - 30 * f * f, by - hgt * f]); }
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [pass, col] of [[0, INK], [1, '#7a2c5c'], [2, '#a8467a']]) {
      for (let i = 0; i < 12; i++) {
        const w = (1 - i / 12) * 78 + 14; ctx.strokeStyle = col; ctx.lineWidth = pass === 0 ? w + 7 : pass === 1 ? w : w * 0.55;
        ctx.beginPath(); ctx.moveTo(pts[i][0] - (pass === 2 ? 5 : 0), pts[i][1]); ctx.lineTo(pts[i + 1][0] - (pass === 2 ? 5 : 0), pts[i + 1][1]); ctx.stroke();
      }
    }
    ctx.fillStyle = '#f0c8d8'; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;   // (the suckers down its front)
    for (let i = 1; i < 11; i++) { const r = (1 - i / 12) * 11 + 4; ctx.beginPath(); ctx.arc(pts[i][0] + (1 - i / 12) * 14, pts[i][1], r, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(235,225,255,0.7)'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(bx - 60 + i * 18 + Math.sin(t * 5 + i) * 4, by + 4 - Math.abs(Math.sin(t * 3 + i * 1.7)) * 10 * k, 5 + (i % 3), 0, TAU); ctx.fill(); }
  }
  function fogPass(ctx, C, camX, t, layer, y0, y1, a, par, h = 80, patchy = false) {
    const fk = fogK(camX + W * 0.5);
    for (const f of LAY.fog) {
      if (f.layer !== layer) continue;
      const x = ((f.x - camX * par + t * f.sp) % 1800 + 1800) % 1800 - 340, k = a * fk;
      if (k <= 0.01) continue;
      const pk = patchy ? 0.25 + 0.75 * Math.max(0, Math.sin(t * 0.21 + f.x * 0.013 + f.sp)) : 1;   // (patchy: it drifts in banks with gaps between)
      ctx.globalAlpha = Math.min(1, f.a * k * pk); ctx.drawImage(C.fogPuff.c, x - f.w / 2, lerp(y0, y1, f.y) - h / 2, f.w, h);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ the interior, live bits
  function interiorLive(ctx, C, camX, t) {
    // the hammocks swaying a little on their hooks, the lanterns glowing on their posts, light shafts down the companionway
    HAMMOCKS.forEach((hx, i) => {
      const sx = hx + 104 - camX; if (sx < -140 || sx > W + 140) return;
      const sp = C.hammock[i % 4], a = 0.035 * Math.sin(t * 0.9 + i * 1.3);
      ctx.save(); ctx.translate(sx, 112); ctx.rotate(a); if (i === 3) ctx.scale(-1, 1); ctx.drawImage(sp.c, -sp.ox, -sp.oy, sp.w, sp.h); ctx.restore();
    });
    const fl = (i) => 0.82 + 0.18 * Math.sin(t * 11 + i * 2.3) * Math.sin(t * 7.3 + i);
    WALL_LANTERNS.forEach((lx, i) => {
      const sx = lx - camX; if (sx < -140 || sx > W + 140) return;
      const sp = C.lantern;
      ctx.drawImage(sp.c, sx - sp.ox, 150 - sp.oy, sp.w, sp.h);
      glowAt(ctx, C.glow, sx, 148, 120, 0.4 * fl(i), 110);
      glowAt(ctx, C.glow, sx, 372, 150, 0.2 * fl(i), 34);      // (its pool on the floor)
    });
    if (camX + W > 1900 && camX < 2500) {   // the hatch's grey-blue light falling down the stair
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const [a, b, al] of [[0, 60, 0.1], [60, 130, 0.07], [-50, -10, 0.06]]) {
        ctx.fillStyle = `rgba(150,180,235,${al})`; ctx.beginPath();
        const hx = ST1.x + 4 + a - camX; ctx.moveTo(hx, 70); ctx.lineTo(hx + 90, 70); ctx.lineTo(hx - 120 + b, 360); ctx.lineTo(hx - 220 + b, 360); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  /** a lantern hung from a yard (x, y: its hook), swinging with the ship: brass frame, glowing glass, a warm glow round it */
  function mastLantern(ctx, C, x, y, t) {
    const an = Math.sin(t * 1.3) * 0.16, L = 22, lx = x + Math.sin(an) * L, ly = y + Math.cos(an) * L, fl = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3);
    glowAt(ctx, C.glow, lx, ly + 2, 60, 0.55 * fl, 54);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, 108); ctx.lineTo(x, y); ctx.lineTo(lx, ly - 9); ctx.stroke();   // (from the lower yard)
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(an);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(0, -12); ctx.lineTo(8, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd070'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(-7, -6, 14, 17); ctx.fill(); ctx.stroke();
    ctx.fillStyle = `rgba(255,250,210,${0.9 * fl})`; ctx.fillRect(-3.5, -3, 7, 11);
    ctx.fillStyle = '#8a6a2a'; ctx.fillRect(-8, 11, 16, 3); ctx.fillRect(-1, -6, 2, 17);
    ctx.restore();
  }
  /** the FX layer's emitters for the screen at camX (src/sifx.js): the lanterns (cabin, posts, masts), the rail, the fog */
  function ambientSpots(camX) {
    const o = [], a = camX - 40, b = camX + W + 40;
    for (const lx of WALL_LANTERNS) if (lx > a && lx < b) o.push({ kind: 'torch', x: lx, y: 150 });
    for (const L of LANTERNS) if (L.x > a && L.x < b) o.push({ kind: 'torch', x: L.x, y: L.y + 60 });
    MASTS.forEach((mx, i) => { for (const ln of MAST_LANTERNS) if (ln.m === i && mx + ln.dx > a && mx + ln.dx < b) o.push({ kind: 'torch', x: mx + ln.dx, y: ln.y + 22 }); });
    if (b > HOUSE_X1) o.push({ kind: 'rail', x0: Math.max(a, HOUSE_X1), x1: b, y: RAIL_TOP });
    if (b > 4300) o.push({ kind: 'fog', x0: Math.max(a, 4300), x1: b, y: 330 });
    return o;
  }
  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';   // (bilinear: 'high' (bicubic) cost the far sprites' upscale 3-4x in software raster, QA3 render cost)
    ctx.fillStyle = '#0a1230'; ctx.fillRect(0, 0, W, H);
    sky(ctx, C, camX, t); gulls(ctx, camX, t, dawnK(camX + W * 0.6)); sea(ctx, C, camX, t);
    ship(ctx, C, camX, t);
    if (kraken > 0.01) tentacle(ctx, camX, t, kraken);
    fogPass(ctx, C, camX, t, 0, 236, 318, 0.8, 0.5);                         // the far fog: round the ship alongside
    if (behind) { try { behind(ctx, camX, t); } catch (e) { if (!behind.err) { behind.err = 1; console.error('behindRail', e); } } }   // (setBehindRail: a boss's art in the sea, behind the bulwark)
    if (camX < HOUSE_X1 + 60) { drawStrip(ctx, C.interior, camX, s); interiorLive(ctx, C, camX, t); }
    if (camX + W > HOUSE_X1 - 20) drawStrip(ctx, C.bulwark, camX, s);
    // the cannons (against the bulwark), the masts with their sails
    for (const cx of CANNONS) { const sx = cx - camX; if (sx > -60 && sx < W + 60) ctx.drawImage(C.cannon.c, sx - C.cannon.ox, 360 - C.cannon.oy, C.cannon.w, C.cannon.h); }
    MASTS.forEach((mx, i) => {
      const sx = mx - camX; if (sx < -280 || sx > W + 280) return;
      const sp = i === 1 ? C.mastB : C.mastA, sw = Math.sin(t * 0.8 + i * 1.7) * 0.006;
      ctx.save(); ctx.translate(sx, 358); ctx.transform(1, 0, -sw, 1, 0, 0); shrouds(ctx, -330); ctx.drawImage(sp.c, -sp.ox, -sp.oy, sp.w, sp.h); ctx.restore();
      for (const ln of MAST_LANTERNS) if (ln.m === i) mastLantern(ctx, C, sx + ln.dx - sw * (358 - ln.y + 40), ln.y, t + i);
    });
    drawStrip(ctx, C.ground, camX, s);
    { const d0 = Math.max(0, HOUSE_X1 - camX), nk = 1 - dawnK(camX + W * 0.6);   // the night on the open deck: a cool grade, the lanterns' warm pools
      if (d0 - 150 < W && nk > 0.02) {
        { const fg = ctx.createLinearGradient(d0 - 150, 0, d0 + 100, 0); fg.addColorStop(0, 'rgba(143,162,208,0)'); fg.addColorStop(1, `rgba(143,162,208,${0.28 * nk})`);   // (feathered in across the deckhouse's end: no seam)
          ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = fg; ctx.fillRect(Math.max(0, d0 - 150), 316, W - Math.max(0, d0 - 150), H - 316); ctx.restore(); }
        MASTS.forEach((mx, i) => { for (const ln of MAST_LANTERNS) if (ln.m === i) { const lx = mx + ln.dx - camX; if (lx > -200 && lx < W + 200) glowAt(ctx, C.glow, lx, 386, 160, 0.3 * nk * (0.9 + 0.1 * Math.sin(t * 9 + i)), 40); } });
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      } }
    fogPass(ctx, C, camX, t, 1, 300, 330, 0.6, 1, 60, true);                // (a low fog along the deck's back edge: kept above the heroes' feet, drifting in patches -- QA: it washed out legs)
    // the lantern light on the deck's planks (the swinging ones glow in their own draw)
    const dk = dawnK(camX + W * 0.6), fkk = fogK(camX + W * 0.5);
    if (dk > 0.02 || warm > 0.01) {
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(255,150,140,${0.1 * dk + 0.12 * warm})`; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,196,170,${0.06 * dk * fkk})`; ctx.fillRect(0, 300, W, 240);
      ctx.globalCompositeOperation = 'source-over';
    }
    // the motes in the light (the cabin) / the fog's sparkle
    for (const f of LAY.dust) {
      const x = ((f.x - camX * 0.9 + t * 8 * f.sp) % 1000 + 1000) % 1000 - 20 + Math.sin(t * f.fr + f.ph) * f.sw, y = f.y + Math.sin(t * 0.5 * f.fr + f.ph * 2) * 14;
      if (x > W + 4) continue;
      ctx.globalAlpha = (0.25 + 0.25 * Math.sin(t * 1.5 * f.fr + f.ph)) * (camX < 2300 ? 1 : 0.35); ctx.drawImage(C.mote.c, x - 2.6, y - 2.6, 5.2, 5.2);
    }
    ctx.globalAlpha = 1;
    if (conch > 0.01) {   // the conch's purple pulse: the sea and the sky over it glow -- behind the actors (QAF: in front it washed the heroes lavender), centred on the sea, so the deck's cannons stay clear
      const pk = conch * (0.8 + 0.2 * Math.sin(t * 14));
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = Math.min(1, 0.95 * pk); ctx.drawImage(C.purple.c, W / 2 - 560, 30, 1120, 300);
      ctx.globalAlpha = 1; const sb = ctx.createLinearGradient(0, 214, 0, 296); sb.addColorStop(0, 'rgba(190,110,255,0)'); sb.addColorStop(0.45, `rgba(190,110,255,${(0.5 * pk).toFixed(3)})`); sb.addColorStop(1, 'rgba(190,110,255,0)'); ctx.fillStyle = sb; ctx.fillRect(0, 214, W, 82);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0) {
    const C = st.ensure();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    if (conch > 0.01) {   // the conch's purple pulse over the actors: only the screen's top and bottom edges breathe purple (0.18 at most, clear where the heroes stand, y 200..525 -- their feet too: QAF)
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const vg = ctx.createLinearGradient(0, 0, 0, H), a = (0.18 * conch).toFixed(3);
      vg.addColorStop(0, `rgba(138,58,208,${a})`); vg.addColorStop(200 / H, 'rgba(138,58,208,0)'); vg.addColorStop(525 / H, 'rgba(138,58,208,0)'); vg.addColorStop(1, `rgba(138,58,208,${a})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(20,12,6,0.38)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  /** the kraken's tentacle rising at the rail (0 gone .. 1 high): after the conch (src/sibosses.js) */
  function setKraken(k) { kraken = clamp(+k || 0, 0, 1); }
  /** the conch's purple pulse over the sea and the screen (0 .. 1) */
  function setConch(k) { conch = clamp(+k || 0, 0, 1); }
  /** setBehindRail(fn | null): fn(ctx, camX, t) is called in drawBack after the sea (and the far fog), before the bulwark and rail */
  function setBehindRail(fn) { behind = typeof fn === 'function' ? fn : null; }
  return { ambientSpots, setScale: st.setScale, setWarm, setKraken, setConch, setBehindRail, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 60, h: 56, colors: ['#8a6038', '#5a3c22', '#c9a070', '#4a7ad0'] },
  barrel: { w: 48, h: 60, colors: ['#7a5030', '#4a3018', '#b88a58', '#4f5466'] },
  urn:    { w: 50, h: 58, colors: ['#c0663a', '#8a4426', '#e8a070', '#7f8c3c'] },
};
const PROP_DRAW = {
  crate(g) {   // a ship's crate, roped, with a little blue gull painted on its side
    const wood = '#8a6038', woodSh = '#5a3c22', woodHi = '#b88a58', woodDk = '#3e2812', rope = '#d9c08a';
    const L = -28, Rr = 24, T = -40, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), woodSh, 2.6);
    ink(g, (g) => poly(g, [L, T, Rr, T, Rr + dx, T + dy, L + dx, T + dy]), woodHi, 2.4);
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4; for (const y of [-14, -27]) { polyline(g, [L, y, Rr, y]); g.stroke(); }
      g.fillStyle = woodSh; g.fillRect(L, T, 6, 40); g.fillRect(Rr - 6, T, 6, 40);
    });
    // the gull
    g.fillStyle = '#4a7ad0'; g.beginPath(); g.moveTo(-14, -22); g.quadraticCurveTo(-6, -34, 2, -24); g.quadraticCurveTo(10, -34, 18, -22); g.quadraticCurveTo(6, -26, 2, -17); g.quadraticCurveTo(-6, -26, -14, -22); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = INK; g.lineWidth = 5; polyline(g, [L + 18, 0, L + 18, T, L + 18 + dx, T + dy]); g.stroke();
    g.strokeStyle = rope; g.lineWidth = 3; polyline(g, [L + 18, 0, L + 18, T, L + 18 + dx, T + dy]); g.stroke();
  },
  barrel(g) {  // a water barrel
    const wood = '#7a5030', woodSh = '#4a3018', woodHi = '#a87a4c', iron = '#4f5466', ironHi = '#8e94a8';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -52); g.quadraticCurveTo(-27, -26, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -26, 18, -52); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -60, 30, 66); g.fillStyle = woodHi; g.fillRect(-19, -54, 5, 58);
      g.strokeStyle = woodSh; g.lineWidth = 1.2; for (const k of [-0.5, -0.1, 0.3]) { g.beginPath(); g.moveTo(k * 18, -52); g.quadraticCurveTo(k * 27, -26, k * 18, 4); g.stroke(); }
      for (const y of [-44, -8]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.4); }
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 18, 5.5, 0, 0, TAU); }, '#96683c', 2.4, (g) => { g.strokeStyle = woodSh; g.lineWidth = 1; g.beginPath(); g.ellipse(0, -52, 12, 3.5, 0, 0, TAU); g.stroke(); });
  },
  urn(g) {     // a clay pot
    const clay = '#c0663a', sh = '#8a4426', hi = '#e8a070';
    const body = (g) => { g.beginPath(); g.moveTo(-11, -50); g.quadraticCurveTo(-14, -42, -22, -32); g.quadraticCurveTo(-30, -14, -16, 0); g.lineTo(16, 0); g.quadraticCurveTo(30, -14, 22, -32); g.quadraticCurveTo(14, -42, 11, -50); g.closePath(); };
    ink(g, body, clay, 2.8, (g) => { g.fillStyle = sh; g.fillRect(6, -54, 30, 56); g.fillStyle = hi; g.fillRect(-20, -38, 5, 30); g.fillStyle = '#f0d9a8'; g.fillRect(-30, -30, 60, 6); });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -50, 13, 4, 0, 0, TAU); }, '#d88a5a', 2.2, (g) => { g.fillStyle = '#4a2416'; g.beginPath(); g.ellipse(0, -50, 8, 2.4, 0, 0, TAU); g.fill(); });
  },
};
