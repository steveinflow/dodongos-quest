// Dodongo's Quest - Skull Island stage 2 "THE KRAKEN" (src/stages/sikraken.js): background, two decks, the storm, the sea monster.
//
// The book's chapter three (docs/SKULL_ISLAND.md): the conch has woken the Kraken.  A storm sea under Malachar's purple sky: rain, a
// slow double lightning pulse every few seconds, grey-green swell.  Three sections (world x):
//   gull 0-1580 (The Sinking Gull: the Blue Gull's wet grey-brown deck, a broken mast and torn sails, the sea washing over her stern)  |
//   leap 1580-1880 (open water between the two ships: the scripted jump, src/siworld.js stepLeap)  |
//   dawn 1880-4600 (The Scarlet Dawn: her warm red-brown deck with gold inlay, crimson sails with a gold sun, a crimson rail; the boss
//     arena is the last screen -- the Kraken's head rises behind the rail).
// Back-to-front (drawBack): the sky (storm gradient, purple glow, clouds, the bolt) -> the sea (live waves, whitecaps) -> far rain -> the
// KRAKEN (head + arms, drawn live from its state: setKraken) -> the rails (cached strips) -> cannons, masts and sails -> the decks
// (cached strips) -> the water in the gap, the wash over the Gull's stern.  drawFront: near rain, the lightning's cold wash, a colour wash
// (K.glow: the collar's break).  Setters (src/sikraken.js, src/siworld.js): setKraken(state), setStorm(k), setSink(k).
// Every static element is cached per scale (chunked strips + sprites, src/canvasmem.js); the animated bits are live.

import { W, H, INK } from '../config.js';
import { STAGE_CS, layerCanvas, cacheCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

// ---------------------------------------------------------------------------------------------------------------
// LEVEL CONTRACT
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL_LEN = 4600;
const CAM_MAX = LEVEL_LEN - W;
export const GULL_END = 1580, DAWN_START = 1880;   // the Gull's broken stern / the Dawn's bow: the gap between is open water
export const SECTIONS = [
  { id: 'gull', name: 'The Sinking Gull', x0: 0, x1: 1580 },
  { id: 'leap', name: 'The Leap', x0: 1580, x1: 1880 },
  { id: 'dawn', name: 'The Scarlet Dawn', x0: 1880, x1: 4600 },
];
export const ARENAS = [350, 1000, 2400, 3000, CAM_MAX];
export const WAYSTONES = [2100];
export const HOOKS = { arenas: ARENAS, waystones: WAYSTONES, leap: { from: GULL_END, to: DAWN_START } };

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
         // the Blue Gull's broken stern / the Scarlet Dawn's bow (the leap's gap between)
const GULL = { base: '#6e6058', sh: '#4c403a', hi: '#8e8076', seam: '#221816' };      // the Gull's wet, weathered grey-brown planks
const DAWNW = { base: '#8c5238', sh: '#64382a', hi: '#b47250', seam: '#2a1410', gold: '#e6b43a' };   // the Scarlet Dawn's warm varnished red-brown, gold inlay
const BULG = { base: '#42445a', sh: '#2c2e40', hi: '#5e6280', joint: '#161622', deep: '#10101a' };     // the Gull's navy bulwark
const BULD = { base: '#682632', sh: '#4a1824', hi: '#8e3a46', joint: '#2a0c14', deep: '#1c0810' };     // the Dawn's crimson bulwark
const SAILG = { base: '#8aa0c4', sh: '#677fa6', hi: '#aebfdc', patch: '#8a7050', patchD: '#5a4630', seam: '#4a5a80' };
const SAILD = { base: '#b02a36', sh: '#7a1626', hi: '#d8565e', patch: '#e6b43a', patchD: '#a47c1e', seam: '#6a1422' };
const LS = { far: ['#1c2440', 0.5], mid: ['#161c34', 0.6], near: ['#120c0c', 0.7], front: ['#0c0808', 0.8] };
const setLS = (k) => lineStyle(LS[k][0], LS[k][1]);
const MASTS = [{ x: 560, g: true }, { x: 2540, g: false }, { x: 3340, g: false, v2: true }];   // the Gull's broken mast / the Dawn's two masts (world x)
const CANNONS = [1180, 2200, 3020];
// puddles of rain on the decks (world x, screen y, half width): drawn into the floor strips, the rain rings them live
const PUDDLES = [[240, 470, 46], [880, 420, 34], [1330, 500, 54], [2120, 446, 40], [2700, 498, 58], [3180, 410, 32], [3560, 474, 48], [4140, 432, 40], [4420, 512, 50]];
// lanterns hanging from the masts' yards (world x of the mast, the lantern's offset): live, swinging with the ship
const LANTERNS = [{ m: 0, dx: 46, y: 182, dim: true }, { m: 1, dx: -54, y: 196 }, { m: 2, dx: 58, y: 190 }];

const LAY = (() => {
  const R = mulberry(4700);
  const rain = [], clouds = [], waves = [], foam = [], drift = [];
  for (let i = 0; i < 110; i++) rain.push({ x: R.r(0, W + 200), y: R.r(0, H), l: R.r(14, 30), sp: R.r(0.8, 1.35), a: R.r(0.25, 0.6) });
  for (let i = 0; i < 9; i++) clouds.push({ x: R.r(0, 1500), y: R.r(8, 150), w: R.r(300, 520), a: R.r(0.55, 0.95), par: R.r(0.03, 0.1), sp: R.r(3, 9) });
  for (let r = 0; r < 7; r++) waves.push({ y: HORIZON + 4 + r * 11.5, amp: 1.5 + r * 1.3, len: 70 + r * 22, sp: 0.8 + r * 0.22, par: 0.1 + r * 0.04, ph: R.r(0, TAU) });
  for (let i = 0; i < 40; i++) foam.push({ x: R.r(0, W), y: R.r(HORIZON + 4, BULW_TOP + 2), w: R.r(10, 36), sp: R.r(6, 22), ph: R.r(0, TAU) });
  for (let i = 0; i < 6; i++) drift.push({ x: R.r(GULL_END + 20, DAWN_START - 20), y: R.r(380, 520), w: R.r(30, 70), ph: R.r(0, TAU), a: R.r(-0.5, 0.5) });
  return { rain, clouds, waves, foam, drift };
})();

// lightning: a soft double pulse of the BOLT every ~7 s (slow fades and a low peak: never a hard strobe); the screen's WASH follows only the
// first pulse (flash safety, the Storm ride's rule: one wash per window, ramped in over ~8 frames, peak 0.2) and none with reduced motion
const BOLT_P = 7.4;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function lightning(t) {
  const n = Math.floor(t / BOLT_P), u = t - n * BOLT_P - 1.5 - hash1(n) * 3;
  if (u < 0 || u > 1.5) return { a: 0, w: 0, n };
  const b1 = sstep(0, 0.14, u) * (1 - sstep(0.14, 0.55, u)), b2 = 0.55 * sstep(0.62, 0.74, u) * (1 - sstep(0.74, 1.15, u));
  return { a: Math.max(b1, b2), w: REDUCED ? 0 : b1, n };
}

// ---------------------------------------------------------------------------------------------------------------
// SHARED DRAWING BITS (planks, rails, masts: after src/stages/sibluegull.js, with the two ships' palettes)
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
    g.fillStyle = rgba(dk, 0.45); g.beginPath(); g.ellipse(kx, ky, r * st, r, 0, 0, TAU); g.fill();
    g.strokeStyle = rgba(dk, 0.3); g.lineWidth = 0.8; g.beginPath(); g.ellipse(kx, ky, r * st * 1.7, r * 1.7, 0, 0, TAU); g.stroke();
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
function planksH(g, xa, xb, y0, y1, P, seed, ph = 14) {
  for (let r = 0; y0 + r * ph < y1; r++) {
    const y = y0 + r * ph, off = hash1(r * 7 + seed) * 220;
    for (let i = Math.floor((xa - off) / 230) - 1; ; i++) {
      const bx = i * 230 + off; if (bx > xb) break;
      const h = hash2(i, r + seed);
      board(g, bx, bx + 230, y, Math.min(y1, y + ph), mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * 1.2), i * 31 + r * 7 + seed);
      g.strokeStyle = rgba(P.joint, 0.9); g.lineWidth = 1.6; g.beginPath(); g.moveTo(bx, y); g.lineTo(bx, y + ph); g.stroke();
    }
    g.strokeStyle = rgba(P.joint, 0.9); g.lineWidth = 1.8; g.beginPath(); g.moveTo(xa - 2, y); g.lineTo(xb + 2, y); g.stroke();
  }
}
function ropeCoil(g, x, y, r = 14) {   // (a coil of hemp flaked flat on the deck: brown, never a gold ring)
  for (let k = 0; k < 3; k++) { const rr = r * (1 - k * 0.28); g.strokeStyle = LINE; g.lineWidth = 5; g.beginPath(); g.ellipse(x, y - k * 1.4, rr, rr * 0.34, 0, 0, TAU); g.stroke(); g.strokeStyle = k === 1 ? '#6e5634' : '#866a42'; g.lineWidth = 2.6; g.stroke(); }
}
// a ship's bulwark and rail along the back of its deck (x0..x1): wood planks under paint (the Dawn's crimson, chipped; the Gull's navy, peeling
// to grey wood), a gold rope moulding and carved suns on the Dawn; scuppers weeping rain; a varnished cap rail; turned posts with gold or iron
// finials; between them slack ropes and the things a deck keeps there (coils, belaying pins, a bucket, a cleat) -- never the same twice in a screen
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
  { const sh = [[2, 37, 20, 6], [2, 20, 26, 14], [3, 30, 15, 14], [2, 18, 26, 10]][kind]; if (sh) lightPool(g, x + sh[0], BULW_TOP + sh[1], sh[2], sh[3], '6,2,12', 0.34); }   // (a soft contact shadow behind it)
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
  } else if (kind === 4 && dawn) {   // the Dawn's sun in a carved oval cartouche on her bulwark: a wooden frame, a small flat sun with blunt rays
    g.save(); g.translate(x, BULW_TOP + 18);
    ink(g, (g) => { g.beginPath(); g.ellipse(0, 0, 17, 12, 0, 0, TAU); }, '#5a3220', 1.8, (g) => { g.fillStyle = '#4a2418'; g.beginPath(); g.ellipse(0, 1, 13, 8.6, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,220,180,0.25)'; g.fillRect(-17, -12, 34, 3); });
    g.fillStyle = '#b08440'; for (let k = 0; k < 8; k++) { const an = k * TAU / 8; g.beginPath(); g.ellipse(Math.cos(an) * 7.4, Math.sin(an) * 5.2, 2, 1.4, an, 0, TAU); g.fill(); }
    g.fillStyle = '#c4974a'; g.beginPath(); g.ellipse(0, 0, 4.6, 3.6, 0, 0, TAU); g.fill();
    g.restore();
  }
}
function drawBulwark(g, xa, xb, x0, x1, P, dawn) {
  const a = Math.max(xa, x0), b = Math.min(xb, x1);
  if (b <= a) return;
  g.save(); g.beginPath();   // (nothing past the ship's ends; the Gull's broken off in a jagged edge at her stern)
  if (dawn) g.rect(x0 - 4, RAIL_TOP - 40, x1 - x0 + 8, 120);
  else { g.moveTo(x0 - 4, RAIL_TOP - 40); g.lineTo(x1 - 26, RAIL_TOP - 40); g.lineTo(x1 - 18, RAIL_TOP + 2); g.lineTo(x1 - 4, RAIL_TOP + 8); g.lineTo(x1 - 14, BULW_TOP + 14); g.lineTo(x1 + 2, BULW_TOP + 26); g.lineTo(x1 - 10, BULW_TOP + 38); g.lineTo(x1 + 4, BULW_BOT + 8); g.lineTo(x0 - 4, BULW_BOT + 8); g.closePath(); }
  g.clip();
  // the planks under their paint
  const wood = dawn ? '#8a5a3a' : '#7a6a5e';
  for (let r = 0; r < 4; r++) {
    const y0 = BULW_TOP + r * 12.5, y1 = y0 + 12.5, off = hash1(r * 7 + (dawn ? 33 : 21)) * 260;
    for (let i = Math.floor((a - off) / 260) - 1; ; i++) {
      const bx = i * 260 + off; if (bx > b) break;
      const h = hash2(i, r + (dawn ? 33 : 21));
      board(g, bx, bx + 260, y0, y1, mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * 1.1), i * 31 + r * 7 + (dawn ? 3 : 5), { stain: !dawn });
      g.strokeStyle = rgba(P.joint, 0.9); g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx, y1); g.stroke();
      nail(g, bx + 5, y0 + 6, 1.3); nail(g, bx - 5, y0 + 6, 1.3);
    }
    g.strokeStyle = rgba(P.joint, 0.9); g.lineWidth = 1.6; g.beginPath(); g.moveTo(a - 2, y0); g.lineTo(b + 2, y0); g.stroke();
  }
  paintChips(g, a, b, BULW_TOP + 2, BULW_BOT - 10, wood, dawn ? 71 : 73, dawn ? 0.04 : 0.5);   // (the paint chipped: the Gull's peeling badly)
  vgrad(g, a - 2, BULW_TOP, b - a + 4, BULW_BOT, [[0, 'rgba(0,0,0,0.25)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.42)']]);
  // scuppers weeping rain down the planks
  for (let i = Math.floor((a - 40) / 170); i * 170 < b + 40; i++) {
    const x = i * 170 + 30 + hash2(i, dawn ? 81 : 83) * 110; if (x < a - 10 || x > b + 10 || hash2(i, 85) < 0.4) continue;
    ink(g, (g) => { g.beginPath(); g.rect(x - 9, BULW_BOT - 14, 18, 4); }, '#1a1418', 1.4);
    vgrad(g, x - 5, BULW_BOT - 10, 10, BULW_BOT - 2, [[0, 'rgba(170,190,230,0.45)'], [1, 'rgba(170,190,230,0)']]);
  }
  aoBand(g, a, b, BULW_TOP, 12, 1, 0.42); aoBand(g, a, b, BULW_BOT, 16, -1, 0.34);   // (in shadow under the cap rail, and at its foot)
  // the gold moulding and the cap rail
  if (dawn) {
    g.fillStyle = INK; g.fillRect(a - 4, BULW_TOP + 20.5, b - a + 8, 5);
    g.fillStyle = DAWNW.gold; g.fillRect(a - 4, BULW_TOP + 21.5, b - a + 8, 3);
    g.strokeStyle = 'rgba(120,80,10,0.8)'; g.lineWidth = 1; g.beginPath(); for (let x = al(a, 5) - 5; x < b + 5; x += 5) { g.moveTo(x, BULW_TOP + 24.5); g.lineTo(x + 3, BULW_TOP + 21.5); } g.stroke();   // (a twisted rope moulding)
  }
  const cap = dawn ? '#5a3220' : '#7a6c62';
  ink(g, (g) => { g.beginPath(); g.rect(a - 4, RAIL_TOP, b - a + 8, 13); }, cap, 2.4, (g) => {
    g.fillStyle = rgba(lighten(cap, 0.45), 0.6); g.fillRect(a - 4, RAIL_TOP, b - a + 8, 3);
    g.strokeStyle = rgba(darken(cap, 0.5), 0.6); g.lineWidth = 0.8; g.beginPath();
    for (let x = al(a, 37) - 37; x < b + 37; x += 37) { const yy = RAIL_TOP + 5 + hash2(Math.round(x), 87) * 5; g.moveTo(x, yy); g.quadraticCurveTo(x + 18, yy + (hash2(Math.round(x), 88) - 0.5) * 4, x + 37, yy + 1); }
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(a - 4, RAIL_TOP + 10, b - a + 8, 3);
  });
  if (dawn) { g.fillStyle = DAWNW.gold; g.fillRect(a - 4, RAIL_TOP + 9, b - a + 8, 2); }
  // the Dawn: a balustrade -- turned balusters between the cap rail and a heavy top rail, a gold-capped post every 150
  if (dawn) {
    for (let x = al(a, 17) - 17; x < b + 17; x += 17) {
      if (((x - 60) % 150 + 150) % 150 < 14 || ((x - 60) % 150 + 150) % 150 > 136) continue;   // (the posts take their place)
      const y0 = RAIL_TOP - 20, y1 = RAIL_TOP;
      ink(g, (g) => { g.beginPath(); g.moveTo(x - 2, y1); g.lineTo(x - 2.4, y1 - 4); g.quadraticCurveTo(x - 4.6, y1 - 10, x - 2, y0 + 5); g.lineTo(x - 2.4, y0); g.lineTo(x + 2.4, y0); g.lineTo(x + 2, y0 + 5); g.quadraticCurveTo(x + 4.6, y1 - 10, x + 2.4, y1 - 4); g.lineTo(x + 2, y1); g.closePath(); }, '#6a3a24', 1.4, (g) => { g.fillStyle = 'rgba(255,200,160,0.3)'; g.fillRect(x - 5, y0, 2.4, 22); });
    }
    ink(g, (g) => { g.beginPath(); g.rect(a - 4, RAIL_TOP - 27, b - a + 8, 8); }, '#5a3220', 2.2, (g) => { g.fillStyle = 'rgba(255,220,180,0.35)'; g.fillRect(a - 4, RAIL_TOP - 27, b - a + 8, 2.4); g.fillStyle = DAWNW.gold; g.fillRect(a - 4, RAIL_TOP - 21.5, b - a + 8, 1.6); });
  }
  // the posts, and the things kept between them (six kinds in turn: never the same twice in a screen)
  for (let i = Math.floor((a - 150) / 150); i * 150 < b + 40; i++) {   // (from a post left of the chunk: its rail thing may reach in)
    const x = i * 150 + 60, inP = x >= a - 14 && x <= b + 14;
    if (inP && !dawn && ((i % 5) + 5) % 5 === 3) {   // (a post snapped off on the sinking Gull)
      ink(g, (g) => poly(g, [x - 6, RAIL_TOP + 1, x - 6, RAIL_TOP - 6, x - 2, RAIL_TOP - 11, x + 1, RAIL_TOP - 6, x + 4, RAIL_TOP - 9, x + 6, RAIL_TOP - 4, x + 6, RAIL_TOP + 1]), '#5e4a3a', 2);
    } else if (inP) turnedPost(g, x, dawn ? RAIL_TOP - 32 : RAIL_TOP - 22, RAIL_TOP + 1, dawn ? 10 : 9, dawn ? '#6a3a24' : '#5e4a3a', dawn ? 'gold' : 'iron');
    { const rx = x + 40 + hash2(i, 89) * 50; if (rx > a - 40 && rx < b + 40 && !MASTS.some((m) => Math.abs(m.x - rx) < 60)) railThing(g, rx, [0, 3, 1, 6, 2, 4, 5][(((i + (dawn ? 2 : 0)) % 7) + 7) % 7], dawn); }   // (never under a mast)
  }
  if (!dawn) for (let i = Math.floor((a - 40) / 150); i * 150 < b + 40; i++) {   // (the Gull's slack ropes, each its own sag; one parted, its ends dangling)
    const xa2 = i * 150 + 60, xb2 = xa2 + 150; if (xb2 < a - 4 || xa2 > b + 4) continue;
    if (((i % 5) + 5) % 5 === 3 || ((i % 5) + 5) % 5 === 2) {
      for (const [x, d] of [[xa2, 1], [xb2, -1]]) { if (((i % 5) + 5) % 5 === 3 && d > 0) continue; if (((i % 5) + 5) % 5 === 2 && d < 0) continue;   // (the ropes fell from the broken post: their ends hang from the posts either side of it)
        g.strokeStyle = LINE; g.lineWidth = 5.4; g.beginPath(); g.moveTo(x, RAIL_TOP - 14); g.quadraticCurveTo(x + d * 14, RAIL_TOP + 4, x + d * 8, RAIL_TOP + 22); g.stroke(); g.strokeStyle = '#a89468'; g.lineWidth = 2.8; g.stroke(); }
      continue;
    }
    const sag = 14 + hash2(i, 91) * 22;
    g.strokeStyle = LINE; g.lineWidth = 5.4; g.beginPath(); g.moveTo(xa2, RAIL_TOP - 14); g.quadraticCurveTo((xa2 + xb2) / 2 + (hash2(i, 92) - 0.5) * 30, RAIL_TOP - 14 + sag, xb2, RAIL_TOP - 14); g.stroke();
    g.strokeStyle = '#a89468'; g.lineWidth = 2.8; g.stroke();
    g.setLineDash([2, 3]); g.strokeStyle = 'rgba(90,76,50,0.8)'; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
  }
  // the lanterns' warm light on the cap rail and the planks below them
  MASTS.forEach((m, mi) => { for (const ln of LANTERNS) if (ln.m === mi) { const lx = m.x + ln.dx; if (lx > a - 160 && lx < b + 160) { lightPool(g, lx, RAIL_TOP + 6, 120, 16, '255,200,120', ln.dim ? 0.25 : 0.45); lightPool(g, lx, BULW_TOP + 26, 110, 26, '255,180,100', ln.dim ? 0.12 : 0.22); } } });
  g.restore();
}
function drawCannon(g) {
  for (const sx of [-24, 24]) ink(g, (g) => { g.beginPath(); g.arc(sx, -14, 14, 0, TAU); }, '#4a3226', 2.4, (g) => { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.4; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(sx + Math.cos(a) * 14, -14 + Math.sin(a) * 14); g.lineTo(sx - Math.cos(a) * 14, -14 - Math.sin(a) * 14); g.stroke(); } });
  ink(g, (g) => { g.beginPath(); g.rect(-24, -40, 48, 26); }, '#5a3c28', 2.4);
  ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 22, 20, 0, 0, TAU); }, '#3c424e', 2.6, (g) => { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(-7, -58, 8, 6, 0, 0, TAU); g.fill(); });
  ink(g, (g) => { g.beginPath(); g.arc(0, -52, 7, 0, TAU); }, '#8a6a2a', 2);
}
// the deck: boards in rows widening toward the camera, butt joints staggered and nailed, each board with its own tone and grain; the Dawn's
// varnished red-brown with gold inlay lines and a cargo hatch, the Gull's weathered grey-brown, stained; rain puddles with the sky in them
const ROWS = [362, 372, 385, 402, 424, 451, 484, 520, 546];
function drawFloor(g, xa, xb, x0, x1, P, dawn) {
  const a = Math.max(xa, x0), b = Math.min(xb, x1);
  if (b <= a) return;
  g.save(); g.beginPath(); g.rect(x0, GT0 - 4, x1 - x0, H); g.clip();   // (no plank past the ship's ends)
  g.fillStyle = P.sh; g.fillRect(a - 2, 360, b - a + 4, 190);
  for (let r = 0; r < ROWS.length - 1; r++) {
    const y0 = ROWS[r], y1 = ROWS[r + 1], seed = dawn ? 60 : 40;
    for (let i = Math.max(-2, Math.floor((a + 400) / 300) - 1); ; i++) {   // (each row's boards: lengths from a hash of the row and index, so joints never line up)
      const bx = rowX(r, i, seed); if (bx > b) break;
      const bx2 = rowX(r, i + 1, seed); if (bx2 < a - 2) continue;
      const h = hash2(i, r + seed);
      board(g, bx, bx2, y0, y1, mix(P.base, h < 0.5 ? P.sh : P.hi, Math.abs(h - 0.5) * 1.0), i * 53 + r * 11 + seed, { wet: true, stain: !dawn, wear: r >= 2 && r <= 5 });
      g.strokeStyle = rgba(P.seam, 0.95); g.lineWidth = 1.7; g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx, y1); g.stroke();
      const nr = 0.9 + (y1 - y0) * 0.035;
      nail(g, bx + 5 + nr, y0 + (y1 - y0) * 0.3, nr); nail(g, bx + 5 + nr, y0 + (y1 - y0) * 0.72, nr);
      nail(g, bx - 5 - nr, y0 + (y1 - y0) * 0.3, nr); nail(g, bx - 5 - nr, y0 + (y1 - y0) * 0.72, nr);
    }
    g.strokeStyle = rgba(P.seam, 0.95); g.lineWidth = 2; g.beginPath(); g.moveTo(a - 2, y0); g.lineTo(b + 2, y0); g.stroke();
    g.strokeStyle = rgba(P.hi, 0.25); g.lineWidth = 1; g.beginPath(); g.moveTo(a - 2, y0 + 2); g.lineTo(b + 2, y0 + 2); g.stroke();
    if (dawn && r % 3 === 1) {   // (a gold inlay line, set in dark)
      g.fillStyle = 'rgba(30,14,8,0.85)'; g.fillRect(a - 2, y0 - 1.6, b - a + 4, 4.4);
      g.fillStyle = DAWNW.gold; g.fillRect(a - 2, y0 - 0.6, b - a + 4, 2.4); g.fillStyle = 'rgba(255,248,200,0.6)'; g.fillRect(a - 2, y0 - 0.6, b - a + 4, 0.8);
    }
  }
  if (dawn) {   // a cargo hatch: a grating in a coaming (one, mid-deck)
    const hx = 2900, hy = 424, hw = 150, hh = 58;
    if (hx + hw / 2 > a - 20 && hx - hw / 2 < b + 20) {
      lightPool(g, hx + 8, hy + hh + 3, hw * 0.62, 11, '6,4,10', 0.42); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(hx - hw / 2 + 4, hy + hh, hw, 4);   // (the coaming stands proud of the deck: its shadow, soft)
      ink(g, (g) => { g.beginPath(); g.rect(hx - hw / 2, hy - 4, hw, hh + 4); }, '#5a3220', 2.6, (g) => {
        g.fillStyle = 'rgba(255,220,180,0.3)'; g.fillRect(hx - hw / 2, hy - 4, hw, 3);
        vgrad(g, hx - hw / 2 + 8, hy + 4, hw - 16, hy + hh - 6, [[0, '#2a160c'], [1, '#5a3418']]);   // (the hold below, warm and dim)
        lightPool(g, hx, hy + hh * 0.7, hw * 0.4, hh * 0.3, '255,180,90', 0.35);
        for (let x = hx - hw / 2 + 12; x < hx + hw / 2 - 10; x += 14) { g.fillStyle = '#7a4a30'; g.fillRect(x, hy + 4, 6, hh - 10); g.fillStyle = 'rgba(200,190,240,0.3)'; g.fillRect(x, hy + 4, 1.6, hh - 10); }
        for (let y = hy + 9; y < hy + hh - 8; y += 11) { g.fillStyle = '#7a4a30'; g.fillRect(hx - hw / 2 + 8, y, hw - 16, 4); g.fillStyle = 'rgba(200,190,240,0.3)'; g.fillRect(hx - hw / 2 + 8, y, hw - 16, 1.2); }
      });
    }
  }
  for (const [px, py, pw] of PUDDLES) {   // rain puddles: a dark wet halo on the wood, the sky in them, a bright rim on their near edge only
    if (px < x0 || px > x1 || px + pw < a - 10 || px - pw > b + 10) continue;
    const sd = px, pts = []; for (let k = 0; k < 10; k++) { const an = (k / 10) * TAU, rr = 0.75 + 0.3 * hash2(sd, k); pts.push(px + Math.cos(an) * pw * rr, py + Math.sin(an) * pw * 0.22 * rr); }
    lightPool(g, px, py, pw * 1.35, pw * 0.36, '20,12,16', 0.45);
    g.save(); blob(g, pts); g.clip();
    vgrad(g, px - pw, py - pw * 0.25, pw * 2, py + pw * 0.25, [[0, 'rgba(60,52,100,0.62)'], [0.55, 'rgba(120,108,170,0.5)'], [1, 'rgba(170,160,215,0.5)']]);   // (the sky, upside down: its light low)
    g.restore();
    g.save(); blob(g, pts); g.clip(); g.beginPath(); g.ellipse(px, py + pw * 0.22, pw * 1.1, pw * 0.22, 0, Math.PI * 1.1, Math.PI * 1.9); g.lineWidth = 2; g.strokeStyle = 'rgba(236,232,255,0.55)'; g.stroke(); g.restore();   // (the near rim)
  }
  for (let i = Math.floor((a - 900) / 900); i * 900 < b + 900; i++) { const lx = i * 900 + 200 + hash2(i, 131) * 500; lightPool(g, lx, 440, 420, 80, dawn ? '255,214,170' : '176,160,226', 0.06 + 0.05 * hash2(i, 132)); }   // (the sky's light across the deck: broad and uneven -- the scene's falloff, not each plank's)
  { g.save(); g.beginPath(); g.rect(a - 2, 360, b - a + 4, 190); g.clip();   // (contact shadows where the masts and the cannons stand on the deck)
    for (const m of MASTS) if (m.x > x0 && m.x < x1 && m.x > a - 80 && m.x < b + 80) lightPool(g, m.x + 4, 365, 40, 8, '6,4,10', 0.5);
    for (const cx of CANNONS) if (cx > x0 && cx < x1 && cx > a - 80 && cx < b + 80) lightPool(g, cx + 3, 364, 50, 9, '6,4,10', 0.5);
    g.restore(); }
  vgrad(g, a - 2, 362, b - a + 4, 440, [[0, 'rgba(176,160,226,0.16)'], [1, 'rgba(176,160,226,0)']]);   // (the wet boards by the rail: the sky's sheen)
  vgrad(g, a - 2, GT0 + 18, b - a + 4, 384, [[0, 'rgba(6,4,10,0.5)'], [1, 'rgba(6,4,10,0)']]);   // (the rail's shadow over the back rows)
  MASTS.forEach((m, mi) => { for (const ln of LANTERNS) if (ln.m === mi) { const lx = m.x + ln.dx; if (lx > a - 200 && lx < b + 200 && lx > x0 && lx < x1) { lightPool(g, lx, 380, 210, 44, ln.dim ? '255,200,120' : '255,190,100', ln.dim ? 0.24 : 0.42); lightPool(g, lx, 376, 90, 16, '255,220,150', ln.dim ? 0.18 : 0.3); } } });   // (the lanterns' warm pools)
  vgrad(g, a - 2, 470, b - a + 4, 550, [[0, 'rgba(6,4,10,0)'], [1, 'rgba(6,4,10,0.46)']]);
  g.restore();
}
// a row's board joints (world x): lengths 150..300 by a hash -- a pure function of row and index (chunk-safe)
function rowX(r, i, seed) {
  let x = -600 + hash2(r, seed) * 200;
  if (i >= 0) for (let k = 0; k < i; k++) x += 150 + 150 * hash2(k, r + seed + 7);
  else for (let k = -1; k >= i; k--) x -= 150 + 150 * hash2(k, r + seed + 7);
  return x;
}
// a ragged edge: the Gull's stern end (x0) -- jagged plank ends, a splintered beam, over the water
function edgeGull(g, x0) {
  for (let r = 0; r < ROWS.length - 1; r++) {
    const y0 = ROWS[r], y1 = ROWS[r + 1], h = y1 - y0, cut = x0 - 4 - hash2(r, 3) * 30;
    g.fillStyle = 'rgba(18,12,18,0.85)'; g.fillRect(cut - 10, y0, Math.min(8, x0 + 30 - cut), h);   // (a narrow shadow under the broken boards)
    const tip = cut + 8 + hash2(r, 5) * 22, mid = (y0 + y1) / 2;
    ink(g, (g) => poly(g, [cut - 12, y0 + 1, tip - 6, y0 + 1, tip, mid - h * 0.15, tip - 10, mid + 1, tip - 3, y1 - 1, cut - 12, y1 - 1]), mix(GULL.base, GULL.hi, hash2(r, 6) * 0.5), 1.8, (g) => {
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(cut - 12, y0 + 1, tip - cut + 12, h * 0.25);
      g.strokeStyle = 'rgba(40,28,24,0.6)'; g.lineWidth = 1; for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(cut - 12, y0 + h * k / 3); g.lineTo(tip - 6, y0 + h * k / 3 + 1); g.stroke(); }
    });
    for (let k = 0; k < 2; k++) { g.strokeStyle = '#a89888'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(tip - 4, y0 + 2 + k * h * 0.5); g.lineTo(tip + 5 + hash2(r, 8 + k) * 6, y0 + 1 + k * h * 0.5 + hash2(r, 9 + k) * 3); g.stroke(); }   // (splinters)
  }
}
// the Dawn's bow end (x0, the left edge of her deck): a gilded sill and a rope ladder over the side
// the Dawn's gilded stem post where her bulwark ends (in the rail strip)
function stemPost(g, x0) {
  ink(g, (g) => { g.beginPath(); g.rect(x0 + 6, RAIL_TOP - 36, 14, 72); }, '#5a3220', 2.4, (g) => { g.fillStyle = 'rgba(255,220,180,0.3)'; g.fillRect(x0 + 6, RAIL_TOP - 36, 4, 72); });
  ink(g, (g) => { g.beginPath(); g.arc(x0 + 13, RAIL_TOP - 40, 6, 0, TAU); }, DAWNW.gold, 2);
}
function edgeDawn(g, x0) {
  g.fillStyle = '#161018'; g.fillRect(x0 - 24, 360, 24, 190);
  ink(g, (g) => { g.beginPath(); g.rect(x0 - 12, 358, 18, 192); }, DAWNW.sh, 2.4, (g) => { g.fillStyle = rgba(DAWNW.gold, 0.9); g.fillRect(x0 - 12, 358, 18, 5); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 - 4, 358, 10, 192); });
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
function drawMast(g, P, torn, seed, v2 = false) {
  if (torn) {   // the sinking Gull: patched sails, holes, the topmast snapped off, its upper sail hanging loose from the broken yard
    paintSail(g, 0, -250, -128, 250, { P, patches: 4, rips: 2, ragged: true, sd: seed });
    yard(g, 0, -250, 250);
    mastPole(g, -276, 10, 20, true);
    // the snapped topmast's yard: half of it hangs from the stump on a rope, slanting, a rag of torn sail flapping from it
    g.strokeStyle = LINE; g.lineWidth = 3; g.beginPath(); g.moveTo(-2, -272); g.quadraticCurveTo(14, -262, 30, -258); g.stroke(); g.strokeStyle = '#866a42'; g.lineWidth = 1.6; g.stroke();
    g.save(); g.translate(30, -258); g.rotate(0.55);
    ink(g, (g) => poly(g, [-6, -10, 34, -24, 30, -6, 50, -14, 40, 6, 12, 10, -4, 2]), P.base, 2, (g) => { g.fillStyle = rgba(P.sh, 0.5); g.fillRect(14, -30, 40, 44); g.strokeStyle = rgba(P.seam, 0.5); g.lineWidth = 1; g.beginPath(); g.moveTo(8, -8); g.lineTo(16, 6); g.moveTo(24, -14); g.lineTo(30, 4); g.stroke(); });   // (the rag)
    ink(g, (g) => poly(g, [-58, -4, 6, -4, 10, -9, 14, 1, 8, 4, -58, 4]), '#5a3a22', 2.2, (g) => { g.fillStyle = 'rgba(255,240,220,0.22)'; g.fillRect(-58, -4, 70, 2.6); });   // (the yard's broken half)
    g.restore();
  } else if (!v2) {
    paintSail(g, 0, -250, -128, 250, { P, sun: true, sd: seed }); yard(g, 0, -250, 250);
    paintSail(g, 0, -350, -262, 190, { P, sd: seed + 1 }); yard(g, 0, -350, 190);
    mastPole(g, -364, 10, 20, false);
  } else {   // the Dawn's mainmast: a taller, narrower course, a small topsail, a gold-patched repair
    paintSail(g, 0, -262, -132, 226, { P, sun: true, sd: seed + 5 }); yard(g, 0, -262, 226);
    paintSail(g, 0, -352, -276, 160, { P: { ...P, patch: DAWNW.gold, patchD: '#8a6a1a' }, patches: 1, sd: seed + 6 }); yard(g, 0, -352, 160);
    mastPole(g, -366, 10, 20, false);
  }
  void SAILG; void SAILD;
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
// ---- end SAILS ----

// the storm sky's panorama (SKY_W wide, tiled; cached small and soft: it is far): a ceiling of dark cloud, banks of storm cloud heaped below
// it -- their tops caught by the lightning's cold light, their undersides by Malachar's purple glow on the horizon -- rain curtains slanting
// down from their bases, a pale break low on the horizon
const SKY_W = 1800, SKY_H = HORIZON + 8;
function heap(g, cx, cy, w, hgt, sd, base, top, under, anvil = false, solidBase = false) {
  // cy: the heap's base; it billows hgt above it.  One mass: puffs of very different sizes along its silhouette (the small ones on its lit
  // edge), the body filled solid under them, shaded as a whole -- lit from above, a core shadow low in it -- and its base dissolving into the
  // air below (a feathered fade, never a cut); an anvil (anvil: a flat shelf blown out at its top)
  const R = mulberry(sd), puffs = [];
  const n = 5 + Math.floor(w / 60);
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
    g.moveTo(cx - w / 2, cy - hgt * 0.4); g.lineTo(cx + w / 2, cy - hgt * 0.4); g.lineTo(cx + w / 2 - 6, solidBase ? cy + 12 : cy - hgt * 0.06); g.lineTo(cx - w / 2 + 6, solidBase ? cy + 12 : cy - hgt * 0.06); g.closePath();
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
function drawSkyPan(g) {
  const PW = (n) => (n * TAU) / SKY_W;   // (a frequency with n whole waves in the panorama: periodic, no seam at its wrap)
  const wrap = (fn) => { for (const o of [-SKY_W, 0, SKY_W]) { g.save(); g.translate(o, 0); fn(); g.restore(); } };
  // the ceiling: one dark sheet, its underside lumpy
  wrap(() => {
    g.beginPath(); g.moveTo(-20, -10); g.lineTo(SKY_W + 20, -10);
    for (let x = SKY_W + 20; x >= -20; x -= 30) g.lineTo(x, 54 + 22 * Math.sin(x * PW(3)) + 14 * Math.sin(x * PW(9) + 2) + 8 * hash2(((Math.round(x / 30) % 60) + 60) % 60, 5));
    g.closePath(); g.fillStyle = '#100e26'; g.fill();
    for (let x = 0; x < SKY_W; x += 70) { const y = 60 + 22 * Math.sin((x + 30) * PW(3)) + 14 * Math.sin((x + 30) * PW(9) + 2); g.fillStyle = 'rgba(54,46,96,0.35)'; g.beginPath(); g.ellipse(x + 30, y - 6, 46, 9, 0, 0, TAU); g.fill(); }
  });
  // rain curtains: soft slanting veils from the cloud bases to the horizon
  for (const [x, w] of [[220, 120], [760, 180], [1290, 140], [1620, 90]]) wrap(() => {
    const gr = g.createLinearGradient(0, 130, 0, HORIZON); gr.addColorStop(0, 'rgba(40,36,80,0.5)'); gr.addColorStop(1, 'rgba(40,36,80,0)');
    g.fillStyle = gr; poly(g, [x, 130, x + w, 130, x + w - 50, HORIZON, x - 50, HORIZON]); g.fill();
    g.strokeStyle = 'rgba(120,110,170,0.12)'; g.lineWidth = 1; for (let k = 0; k < w; k += 9) { g.beginPath(); g.moveTo(x + k, 136); g.lineTo(x + k - 46, HORIZON - 4); g.stroke(); }
  });
  // the banks of storm cloud: a far row (dim, low) and a nearer row (bigger, lit)
  const R = mulberry(4711);
  wrap(() => {   // (one low continuous bank along the horizon behind the far row: the gaps between its heaps show cloud, never the glow)
    g.beginPath(); g.moveTo(-20, HORIZON + 6);
    const bt = (x) => HORIZON - 32 - 12 * Math.sin(x * PW(3)) - 8 * Math.sin(x * PW(9) + 1) - 7 * Math.abs(Math.sin(x * PW(20) + 2));
    for (let x = -20; x <= SKY_W + 20; x += 12) g.lineTo(x, bt(x));
    g.lineTo(SKY_W + 20, HORIZON + 6); g.closePath(); g.fillStyle = '#3a3462'; g.fill();
    for (let x = 0; x < SKY_W; x += 25) { const r = 8 + 6 * hash2(Math.round(x / 25), 11); g.fillStyle = 'rgba(58,52,98,0.85)'; g.beginPath(); g.ellipse(x + 13, bt(x + 13) + r * 0.3, r * 1.4, r, 0, 0, TAU); g.fill(); }   // (a lumpy, soft top)
    vgrad(g, -20, HORIZON - 50, SKY_W + 40, HORIZON + 6, [[0, 'rgba(94,86,144,0.45)'], [0.45, 'rgba(94,86,144,0)'], [1, 'rgba(138,98,168,0.4)']]);
  });
  for (let k = 0; k < 9; k++) { const x = k * (SKY_W / 9) + R.r(0, 80), w = R.r(200, 300); R.r(46, 70); const hh = R.r(46, 70); R.r(46, 70); wrap(() => heap(g, x, HORIZON - 2, w, hh, 300 + k, '#3a3462', '#5e5690', '#8a62a8', false, false)); }   // (one height for all three wrapped copies: the visible one's)   // (the far row: hazy, low, little contrast)
  g.save(); g.globalCompositeOperation = 'source-atop'; vgrad(g, -20, HORIZON - 110, SKY_W + 40, HORIZON + 8, [[0, 'rgba(120,104,176,0)'], [1, 'rgba(120,104,176,0.16)']]); g.restore();   // (the far row and the bank behind it sink into the air)
  for (let k = 0; k < 5; k++) { const x = k * (SKY_W / 5) + R.r(0, 140), w = R.r(320, 480); R.r(176, 206); R.r(110, 146); const cy = R.r(176, 206), hh = R.r(110, 146); R.r(176, 206); R.r(110, 146); wrap(() => heap(g, x, cy, w, hh, 400 + k, '#221e44', '#9a8ccc', '#7a4a9a', k % 2 === 0)); }   // (the near row: towering, two with anvils)
  for (let k = 0; k < 12; k++) { const x = k * (SKY_W / 12) + R.r(0, 100); R.r(70, 140); R.r(120, 200); const sy = R.r(70, 140), sw = R.r(120, 200); R.r(70, 140); R.r(120, 200); wrap(() => scud(g, x, sy, sw, 700 + k, '#14122e', 0.6)); }   // (scud under the ceiling)
  // the pale break on the horizon
  vgrad(g, -20, HORIZON - 16, SKY_W + 40, HORIZON + 6, [[0, 'rgba(150,120,190,0)'], [0.7, 'rgba(160,130,200,0.35)'], [1, 'rgba(180,150,210,0.5)']]);   // (past both ends: the sprite rounds up a column)
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
// ---------------------------------------------------------------------------------------------------------------
// THE KRAKEN: a huge purple-magenta head rising behind the rail, drawn live from the boss's state (src/sikraken.js)
// ---------------------------------------------------------------------------------------------------------------
const KP = { skin: '#8a3c9e', skinD: '#5c2476', skinH: '#b862c8', belly: '#e8b6dc', spot: '#4a1a62', collar: '#3a2050', collarH: '#6a4a8a', gem: '#e060e0', gold: '#ffd23a' };
// the book's maroon (the painted kraken pack's own family, sampled from its atlas): the friendly kraken everywhere else -- K.maroon / the arm's maroon flag
const KPM = { ...KP, skin: '#9a2d4c', skinD: '#62082e', skinH: '#c8668a', belly: '#ecd2e2', spot: '#480b26', lift: '#d27a96', liftD: '#8e3050' };
const HEAD_BASE = BULW_TOP + 4;        // the waterline behind the rail
const HEAD_RISE = 270;                 // how far the head's centre travels as it rises
// one arm: a tapering tube along a swaying curve (the suckers on its inner side)
function arm(ctx, bx, by, len, side, t, ph, k, thick = 1, lift = 0, pal = KP, wag = 1, maroon = false) {   // (pal: another skin -- the palace's friendly pal, or 'maroon'; wag: more sway; maroon: the book's maroon skin)
  if (pal === 'maroon' || pal === true || (maroon && (!pal || pal === KP))) pal = KPM; else if (!pal || typeof pal !== 'object') pal = KP;   // (true in pal's place: maroon too)
  const n = 11, pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, sw = (Math.sin(f * 3.2 + t * 1.5 + ph) * 26 * f + Math.sin(f * 7 + t * 2.6 + ph * 2) * 7 * f) * wag;
    pts.push([bx + side * (f * 120 + f * f * 70 * (1 - lift)) + sw, by - len * k * (f * (0.9 + lift * 0.6)) + 40 * f * f * (1 - k)]);
  }
  for (const [col, wk, ox] of [[INK, 1.2, 0], [pal.skinD, 1, 0], [pal.skin, 0.64, -side * 4]]) {
    for (let i = 0; i < n; i++) {
      const w = ((1 - i / n) * 46 + 9) * thick * wk + (col === INK ? 6 : 0);
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[i][0] + ox, pts[i][1]); ctx.lineTo(pts[i + 1][0] + ox, pts[i + 1][1]); ctx.stroke();
    }
  }
  ctx.fillStyle = pal.belly; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  for (let i = 2; i < n - 1; i++) { const r = (1 - i / n) * 8 + 3; ctx.beginPath(); ctx.arc(pts[i][0] + side * (1 - i / n) * 10, pts[i][1], r, 0, TAU); ctx.fill(); ctx.stroke(); }
}
/** the head; K: { x (world), rise 0..1, eyeL / eyeR 0..1 (the glow: 1 angry bright .. 0 blind), flashL / flashR 0..1, gold 0..1, crack 0..2, broken (0..1 = how long since it fell), aim (the collar's launch marker, 0..1), thrash 0..1, shake,
 *   stun 0..1 (the reworked fight, src/sikraken.js: the head slumps forward onto the rail, tilted), dizzy 0..1 (the eyes swirl, half shut) }.
 *   Out: K.sx / K.sy = the crown's screen point (the boss draws its dizzy stars there) */
function drawKraken(ctx, K, camX, t) {
  if (!K || K.rise <= 0.01) return;
  const P = K.maroon ? KPM : KP;   // (K.maroon: the book's maroon skin)
  const cx = K.x - camX;
  if (cx < -420 || cx > W + 420) return;
  const rise = K.rise, by = HEAD_BASE + HEAD_RISE * (1 - rise) * (1 - rise * 0.25);   // (the neck line)
  const th = K.thrash || 0, sk = clamp(K.stun || 0, 0, 1), dz = clamp(K.dizzy || 0, 0, 1), bob = (Math.sin(t * 1.3) * 5 + Math.sin(t * 9) * 3 * th) * (1 - sk) + Math.sin(t * 2.2) * 3 * sk;
  const slump = 92 * sk, tilt = 0.17 * sk * (1 + 0.15 * Math.sin(t * 1.7));   // (stunned: the chin comes down onto the rail, the head lolls)
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.translate(cx + (K.shake ? Math.sin(t * 60) * K.shake : 0), by + bob + slump);
  if (tilt) ctx.rotate(tilt);
  ctx.scale(0.8, 0.8);   // (the head fits under the HUD: its crown at screen y ~58)
  K.sx = cx; K.sy = by + bob + slump - 0.8 * 320 - 14;   // (out: the crown on screen)
  // the arms behind the head, rising out of the sea on both sides
  const AR = [[-190, 250, -1, 0.0, 1.1], [-120, 300, -1, 1.7, 0.9], [-250, 190, -1, 3.1, 0.8], [190, 270, 1, 0.9, 1.1], [120, 310, 1, 2.5, 0.9], [250, 200, 1, 4.1, 0.8]];
  for (const [ax, len, side, ph, thick] of AR) arm(ctx, ax, 6, len, side, t * (1 + th * 0.8), ph, 0.55 + 0.45 * rise, thick, 0, P);
  // the neck (down into the sea) and the head: a bulbous mantle with a round chin
  const skin = mix(P.skin, P.lift || '#c48ae4', (K.gold || 0) * 0.4), skinD = mix(P.skinD, P.liftD || '#8a52b0', (K.gold || 0) * 0.4);
  const neck = (c) => { c.beginPath(); c.moveTo(-122, -104); c.lineTo(122, -104); c.lineTo(156, 50); c.lineTo(-156, 50); c.closePath(); };
  neck(ctx); ctx.save(); ctx.translate(4, 6); ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore(); ctx.fillStyle = skin; ctx.fill();
  ctx.save(); neck(ctx); ctx.clip(); ctx.fillStyle = rgba(skinD, 0.7); ctx.fillRect(40, -110, 130, 170); ctx.fillStyle = rgba(P.belly, 0.3); ctx.fillRect(-40, -104, 80, 160); ctx.restore();
  neck(ctx); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
  const body = [[-168, -150], [-182, -216], [-134, -286], [-40, -320], [60, -320], [142, -286], [184, -216], [170, -150], [100, -100], [-100, -100]];
  ctx.beginPath(); blobPath(ctx, body.flat());
  ctx.save(); ctx.translate(5, 7); ctx.lineWidth = 13; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  ctx.fillStyle = skin; ctx.fill();
  ctx.save(); ctx.clip();
  // (the shading: dark down the right and under the eyes, light up the left; spots)
  ctx.fillStyle = rgba(skinD, 0.7); ctx.beginPath(); ctx.ellipse(120, -190, 120, 170, 0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(P.skinH, 0.55); ctx.beginPath(); ctx.ellipse(-86, -262, 60, 56, 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(P.spot, 0.5);
  for (const [sx, sy, r] of [[-120, -170, 14], [-150, -230, 10], [-30, -296, 16], [60, -280, 11], [130, -250, 14], [140, -160, 9], [-66, -120, 12], [40, -112, 10], [-10, -306, 8]]) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); blobPath(ctx, body.flat()); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
  // the eyes
  const gold = K.gold || 0;
  for (const [side, glow, flash] of [[-1, K.eyeL ?? 1, K.flashL || 0], [1, K.eyeR ?? 1, K.flashR || 0]]) {
    const ex = side * 78, ey = -212, squint = clamp(flash * 0.8 + (1 - Math.max(glow, gold)) * 0.35 + dz * 0.3, 0, 0.9);
    ctx.save(); ctx.translate(ex, ey);
    ctx.beginPath(); ctx.ellipse(0, 0, 44, 36 * (1 - squint * 0.7), 0, 0, TAU); ctx.fillStyle = '#f4ecf6'; ctx.fill(); ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 42, 34 * (1 - squint * 0.7), 0, 0, TAU); ctx.clip();
    // the iris: purple and glowing; dimming to a flat grey-violet when blinded; gold at the end
    const dim = clamp(glow, 0, 1), irisR = 24 - (1 - dim) * 8 + gold * 2;
    const ic = gold > 0.01 ? mix(mix('#b84cf0', '#4a3a58', 1 - dim), P.gold, gold) : mix('#4a3a58', '#c050ff', dim);
    const lx = -side * 4 + Math.sin(t * 0.8) * 3, ly = 4;
    ctx.fillStyle = ic; ctx.beginPath(); ctx.arc(lx, ly, irisR, 0, TAU); ctx.fill();
    if (dz > 0.05) {   // dizzy: a spiral turning in each eye (the two eyes turn opposite ways)
      ctx.strokeStyle = '#1a0a2a'; ctx.lineWidth = 3.4; ctx.beginPath();
      for (let a = 0; a < TAU * 2.4; a += 0.25) { const r = 2 + a * 2.1, q = a + t * 5 * side; ctx.lineTo(lx + Math.cos(q) * r, ly + Math.sin(q) * r * 0.9); }
      ctx.stroke();
    } else { ctx.fillStyle = gold > 0.5 ? '#6a3a10' : '#1a0a2a'; ctx.beginPath(); ctx.ellipse(lx, ly, gold > 0.5 ? 9 : 5.5, irisR * 0.82, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(lx - 8, ly - 9, 5, 0, TAU); ctx.fill();
    if (flash > 0.02) { ctx.fillStyle = `rgba(255,252,240,${Math.min(1, flash * 1.2)})`; ctx.fillRect(-60, -60, 120, 120); }
    ctx.restore();
    ctx.restore();
    // the brow: a thick dark wedge slanting down toward the middle (soft and level when gold)
    ctx.save(); ctx.translate(ex, ey);
    ctx.fillStyle = skinD; ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    const inner = -side * 40, outer = side * 50, tilt = (1 - gold) * 22;
    ctx.beginPath(); ctx.moveTo(inner, -30 + tilt); ctx.lineTo(outer, -52); ctx.lineTo(outer, -38 - tilt * 0.2); ctx.lineTo(inner, -22 + tilt); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (glow > 0.05 && !gold) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 * glow; ctx.fillStyle = '#c050ff'; ctx.beginPath(); ctx.arc(ex, ey, 70, 0, TAU); ctx.fill(); ctx.restore(); }
    if (gold > 0.05) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 * gold; ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(ex, ey, 74, 0, TAU); ctx.fill(); ctx.restore(); }
  }
  // the mouth: a wide grumpy curve (a small smile when gold)
  ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath();
  const m = gold * 30 + (K.mouth || 0);
  ctx.moveTo(-58, -150 + m * 0.25); ctx.quadraticCurveTo(0, -150 - 26 + m * 2.4, 58, -150 + m * 0.25); ctx.stroke();
  // the collar: a spiked dark-violet band round the neck, under the chin, with the split-mask gem (broken: it falls away)
  const cr = K.crack || 0, broken = K.broken || 0;
  if (broken < 0.999) {
    const drop = broken * broken * 300, spread = broken * 80, rot = broken * 0.55;
    for (const side of broken > 0 ? [-1, 1] : [0]) {
      ctx.save(); ctx.translate(side * spread, drop); ctx.rotate(side * rot);
      ctx.beginPath(); ctx.rect(side === 1 ? 0 : -300, -340, side === 0 ? 600 : 300, 480); ctx.clip();
      const band = (c) => { c.beginPath(); c.moveTo(-134, -112); c.quadraticCurveTo(0, -134, 134, -112); c.lineTo(144, -62); c.quadraticCurveTo(0, -32, -144, -62); c.closePath(); };
      band(ctx); ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = P.collar; ctx.fill();
      ctx.save(); band(ctx); ctx.clip(); ctx.fillStyle = rgba(P.collarH, 0.55); ctx.fillRect(-160, -126, 320, 12); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(40, -130, 120, 90); ctx.restore();
      for (let i = -4; i <= 4; i++) {   // the spikes
        const sx = i * 30, sy = -116 + Math.abs(i) * 3.6 + (i % 2 ? 0 : 3);
        ctx.beginPath(); ctx.moveTo(sx - 11, sy + 6); ctx.lineTo(sx + (i * 1.4), sy - 30); ctx.lineTo(sx + 11, sy + 6); ctx.closePath(); ctx.fillStyle = '#241436'; ctx.fill(); ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.stroke();
        ctx.fillStyle = 'rgba(190,120,255,0.55)'; ctx.beginPath(); ctx.moveTo(sx - 3, sy - 12); ctx.lineTo(sx + i * 1.4, sy - 27); ctx.lineTo(sx + 3, sy - 12); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // the gem: Malachar's porcelain mask, its split a crack that grows with each hit
    if (broken < 0.35) {
      ctx.save(); ctx.translate(0, -84);
      const pulse = 0.65 + 0.35 * Math.sin(t * 6), a = K.aim || 0;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.28 + 0.2 * a) * pulse; ctx.fillStyle = P.gem; ctx.beginPath(); ctx.arc(0, 0, 54 + a * 10, 0, TAU); ctx.fill(); ctx.restore();
      ctx.save(); ctx.scale(0.86, 0.86); bookMask(ctx, 36, INK, 4); ctx.restore();   // (Malachar's mask, the book's: laughing and weeping halves, one big mouth)
      // the split down the middle (grows: a hairline, then a wide jagged crack)
      ctx.strokeStyle = '#fff6ff'; ctx.lineWidth = 1.5 + cr * 2.2; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(-4 - cr * 2, -16); ctx.lineTo(3 + cr * 3, 0); ctx.lineTo(-3 - cr * 2, 14); ctx.lineTo(2, 36); ctx.stroke();
      if (cr >= 1) { ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(20, -6); ctx.moveTo(-3, 14); ctx.lineTo(-18, 20); ctx.stroke(); }
      ctx.restore();
      // the launch marker: a pulsing dashed gold ring round the gem when a hero could be launched at it
      if (a > 0.02) {
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 4; ctx.setLineDash([9, 6]); ctx.lineDashOffset = -t * 26; ctx.beginPath(); ctx.arc(0, -84, 62 + Math.sin(t * 5) * 4, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------------------
// THE STAGE
// ---------------------------------------------------------------------------------------------------------------
export function createStage() {
  let warm = 0, K = null, storm = 0.6, sink = 0, KS = null, KSf = false, behind = null;   // (behind: setBehindRail -- the bosses' art between the sea and the rails)   // (KS: the Kraken as a story panel wants it -- setStory)
  const st = stageCaches(build);
  const S = () => st.S;

  function build(cs, csFar) {
    const c = {};
    setLS('near');
    c.sky = makeSprite(SKY_W, SKY_H, 0, 0, Math.min(csFar, 1) * 0.55, (g) => drawSkyPan(g));   // (far and soft)
    const mSc = cs >= 2 ? 1.75 : Math.max(1, cs * 0.85);   // (the masts: mid-ground, a step under the near scale)
    const sharp = (mk) => { const sp = mk(false); if (!sp.c.__live && sp.c.width / sp.w < 0.99) { freeCanvases(sp.c); return mk(true); } return sp; };   // (below scale 1 a near sprite would smear: live instead)
    c.mastG = sharp((lv) => makeSprite(330, 400, 165, 380, mSc, (g) => { setLS('mid'); drawMast(g, SAILG, true, 71); }, lv));
    c.mastD = sharp((lv) => makeSprite(330, 400, 165, 380, mSc, (g) => { setLS('mid'); drawMast(g, SAILD, false, 81); }, lv));
    c.mastD2 = sharp((lv) => makeSprite(330, 400, 165, 380, mSc, (g) => { setLS('mid'); drawMast(g, SAILD, false, 91, true); }, lv));
    c.cannon = sharp((lv) => makeSprite(90, 90, 45, 84, cs, (g) => { setLS('near'); drawCannon(g); }, lv));
    c.glow = radialSprite(64, 0.5, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(210,190,255,0.6)'], [1, 'rgba(160,120,255,0)']]);
    c.purple = radialSprite(256, 0.5, [[0, 'rgba(214,150,255,0.8)'], [0.4, 'rgba(160,70,230,0.4)'], [1, 'rgba(120,30,200,0)']]);

    // (the big strips last: under a memory cap the decks and rails step down together, to one scale)
    c.gullFloor = buildStrip(-10, GULL_END + 34, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawFloor(g, xa, xb, -10, GULL_END, GULL, false); edgeGull(g, GULL_END); });
    c.dawnFloor = buildStrip(DAWN_START - 34, LEVEL_LEN + 10, GT0, H, cs, 1, (g, xa, xb) => { setLS('near'); drawFloor(g, xa, xb, DAWN_START, LEVEL_LEN + 10, DAWNW, true); edgeDawn(g, DAWN_START); });
    c.gullRail = buildStrip(-10, GULL_END, RAIL_TOP - 30, BULW_BOT + 6, cs, 1, (g, xa, xb) => { setLS('near'); drawBulwark(g, xa, xb, -10, GULL_END - 40, BULG, false); });
    c.dawnRail = buildStrip(DAWN_START - 4, LEVEL_LEN + 10, RAIL_TOP - 48, BULW_BOT + 6, cs, 1, (g, xa, xb) => { setLS('near'); drawBulwark(g, xa, xb, DAWN_START + 14, LEVEL_LEN + 10, BULD, true); stemPost(g, DAWN_START); });
    unifyFit([c.gullFloor, c.dawnFloor, c.gullRail, c.dawnRail]);
    return c;
  }

  // ------------------------------------------------------------------ the sky and the sea
  function sky(ctx, C, camX, t, L) {
    const gr = ctx.createLinearGradient(0, 0, 0, HORIZON + 4);
    gr.addColorStop(0, '#0a0a1c'); gr.addColorStop(0.55, '#1c1a3e'); gr.addColorStop(1, mix('#3a2a5c', '#5a3a7a', storm));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, HORIZON + 4);
    // Malachar's purple under the storm: a glow along the horizon, behind the clouds
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.25 + 0.2 * storm; ctx.drawImage(C.purple.c, 0, 0, C.purple.c.width, C.purple.c.height * (174 / 300), W / 2 - 560, HORIZON - 170, 1120, 174)   /* (only down to the horizon: the sea covers the rest -- QA3 render cost) */; ctx.restore();
    // the painted panorama (slow parallax), fainter in a calm
    const off = ((camX * 0.05 + t * 2) % SKY_W + SKY_W) % SKY_W;
    ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * storm; const Sd = Math.abs(ctx.getTransform().a) || 1; for (let x = -off; x < W; x += SKY_W) { const x0 = Math.round(x * Sd) / Sd, x1 = Math.round((x + SKY_W) * Sd) / Sd; ctx.drawImage(C.sky.c, x0, 0, x1 - x0, SKY_H); } ctx.restore();   // (both ends snapped to device pixels: the tiles abut exactly at any scale)
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.28 + 0.1 * storm; ctx.drawImage(C.purple.c, W / 2 - 340, HORIZON - 34, 680, 64); ctx.restore();   // (a flat soft glow low on the horizon: its own edges fade, no clip line)   // (only low on the horizon: never between the clouds' bases)   // (Malachar's glow breaking through low: the light the sea reflects)
    // the lightning: the clouds round the bolt lit from inside (a local glow, never a screen wash), then the bolt
    if (L.a > 0.02) {
      const bx = 160 + hash1(L.n * 3 + 1) * 640, R = mulberry(L.n * 97 + 13);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.5, L.a * 0.6); ctx.drawImage(C.purple.c, bx - 220, -40, 440, 260); ctx.restore();
      const pts = mdp([bx, 30], [bx + (R() - 0.5) * 160, HORIZON - 6], R, 4, 0.16);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = Math.min(1, L.a * 3.2); ctx.strokeStyle = 'rgba(190,150,255,0.55)'; ctx.lineWidth = 9; polyline(ctx, flat(pts)); ctx.stroke();
      ctx.strokeStyle = '#f4ecff'; ctx.lineWidth = 3; polyline(ctx, flat(pts)); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  // the sea: a grey-green storm swell (the book's), rows of waves heaving toward the ship, their crests lit and breaking into foam, the purple
  // glow shimmering in a path under it, mist low on the horizon
  function sea(ctx, camX, t) {
    const amp = 0.8 + storm * 0.9, y1 = BULW_TOP + 10;
    const gr = ctx.createLinearGradient(0, HORIZON, 0, y1);
    gr.addColorStop(0, '#3e5a62'); gr.addColorStop(0.35, '#22424c'); gr.addColorStop(1, '#0e2630');
    ctx.fillStyle = gr; ctx.fillRect(0, HORIZON, W, y1 - HORIZON);
    const wy = (w, x) => w.y + Math.sin((x + camX * w.par) / w.len + t * w.sp + w.ph) * w.amp * amp + Math.sin((x - camX * w.par * 0.7) / (w.len * 0.43) - t * w.sp * 1.3) * w.amp * 0.45 * amp;
    LAY.waves.forEach((w, r) => {
      ctx.beginPath(); ctx.moveTo(0, y1 + 2);
      for (let x = 0; x <= W + 24; x += 16) ctx.lineTo(x, wy(w, x));
      ctx.lineTo(W, y1 + 2); ctx.closePath();
      const wg = ctx.createLinearGradient(0, w.y - w.amp * 2, 0, w.y + 14);
      wg.addColorStop(0, mix('#4e7276', '#2a4e58', r / 6)); wg.addColorStop(1, mix('#1c3c46', '#0c2028', r / 6));
      ctx.fillStyle = wg; ctx.fill();
      ctx.strokeStyle = `rgba(206,232,226,${0.18 + 0.06 * r})`; ctx.lineWidth = 1 + r * 0.25; ctx.beginPath();   // (the lit crest)
      for (let x = 0; x <= W + 24; x += 16) { const y = wy(w, x); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.strokeStyle = `rgba(240,250,255,${0.35 + 0.1 * r})`; ctx.lineWidth = 1.4 + r * 0.3; ctx.lineCap = 'round';   // (foam where it breaks: on its peaks)
      for (let x = 8; x <= W; x += 16) {
        const y = wy(w, x), y0 = wy(w, x - 8), y2 = wy(w, x + 8);
        if (y < y0 && y < y2 && hash2(Math.round((x + camX * w.par) / 16), r) > 0.35) { ctx.beginPath(); ctx.moveTo(x - 7 - r, y + 1); ctx.quadraticCurveTo(x, y - 2 - r * 0.3, x + 7 + r, y + 1.5); ctx.stroke(); }
      }
    });
    ctx.lineCap = 'butt';
    // the glow's path on the water: short shimmering strokes under it
    ctx.strokeStyle = 'rgba(214,170,255,0.4)'; ctx.lineWidth = 1.4;
    for (let k = 0; k < 18; k++) { const y = HORIZON + 4 + (k / 18) * (y1 - HORIZON - 8), half = 30 + k * 7, x = W / 2 + Math.sin(t * 1.3 + k * 2.1) * half * 0.6; const len = 8 + 10 * Math.abs(Math.sin(t * 2 + k)); ctx.beginPath(); ctx.moveTo(x - len, y); ctx.lineTo(x + len, y); ctx.stroke(); }
    for (const f of LAY.foam) {   // whitecaps rolling: a curl of foam swelling and fading
      const x = ((f.x - camX * 0.3 + t * f.sp) % (W + 80) + W + 80) % (W + 80) - 40, a = 0.2 + 0.3 * Math.max(0, Math.sin(t * 1.7 + f.ph)) * (0.4 + storm);
      ctx.strokeStyle = `rgba(236,246,255,${a})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, f.y + 1); ctx.quadraticCurveTo(x + f.w * 0.5, f.y - 2.4, x + f.w, f.y + 0.6); ctx.stroke();
    }
    vgrad(ctx, 0, HORIZON - 2, W, HORIZON + 40, [[0, 'rgba(170,150,210,0.45)'], [0.3, 'rgba(170,150,210,0.16)'], [1, 'rgba(170,150,210,0)']]);   // (mist on the horizon, thinning over the far rows: they sink into the air)
  }
  /** the water between the two ships (the floor strip's gap), and the waves washing over the Gull's stern */
  function gapWater(ctx, camX, t) {
    const x0 = GULL_END - 40 - camX, x1 = DAWN_START + 30 - camX;
    if (x1 < 0 || x0 > W) return;
    ctx.save(); ctx.beginPath(); ctx.rect(Math.max(0, x0), HORIZON + 46, Math.min(W, x1) - Math.max(0, x0), H); ctx.clip();
    const gr = ctx.createLinearGradient(0, HORIZON + 46, 0, H);
    gr.addColorStop(0, 'rgba(30,58,68,0)'); gr.addColorStop(0.06, 'rgba(30,58,68,1)'); gr.addColorStop(0.14, '#1a3640'); gr.addColorStop(0.3, '#1c4250'); gr.addColorStop(0.6, '#24505a'); gr.addColorStop(1, '#0e2630');   // (its top feathered into the far sea; the last three stops were swallowed by this comment until 10-23)
    ctx.fillStyle = gr; ctx.fillRect(x0 - 4, HORIZON + 46, x1 - x0 + 8, H);
    for (let r = 0; r < 9; r++) {
      const y = BULW_TOP + 14 + r * 26 + r * r * 1.4, a = 4 + r * 1.5;
      ctx.beginPath(); ctx.moveTo(x0 - 8, H);
      for (let x = x0 - 8; x <= x1 + 8; x += 20) ctx.lineTo(x, y + Math.sin((x + camX) / (46 + r * 9) + t * (1.6 + r * 0.12) + r * 1.3) * a * (0.8 + storm * 0.5));
      ctx.lineTo(x1 + 8, H); ctx.closePath(); ctx.fillStyle = `rgba(${30 + r * 6},${76 + r * 9},${86 + r * 7},0.38)`; ctx.fill();
      ctx.strokeStyle = `rgba(226,240,255,${0.3 + 0.04 * r})`; ctx.lineWidth = 1.8 + r * 0.3; ctx.beginPath();
      for (let x = x0 - 8; x <= x1 + 8; x += 20) { const yy = y + Math.sin((x + camX) / (46 + r * 9) + t * (1.6 + r * 0.12) + r * 1.3) * a * (0.8 + storm * 0.5); if (x === x0 - 8) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
      ctx.stroke();
    }
    for (const d of LAY.drift) {   // wreckage bobbing on the swell: planks and a barrel hoop
      const x = d.x - camX, y = d.y + Math.sin(t * 1.3 + d.ph) * 6;
      ctx.save(); ctx.translate(x, y); ctx.rotate(d.a + Math.sin(t * 0.9 + d.ph) * 0.12);
      if (d.w > 62) {   // (a barrel hoop)
        ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, 0, 16, 6, 0, 0, TAU); ctx.stroke(); ctx.strokeStyle = '#6a6e78'; ctx.lineWidth = 3; ctx.stroke();
      } else {
        ctx.fillStyle = '#6a4c38'; ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.rect(-d.w / 2, -5, d.w, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8a6a50'; ctx.fillRect(-d.w / 2 + 1, -4, d.w - 2, 3); ctx.strokeStyle = 'rgba(30,18,10,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-d.w / 2 + 4, 0); ctx.lineTo(d.w / 2 - 6, 1); ctx.moveTo(-d.w / 2 + 10, 2.6); ctx.lineTo(d.w / 2 - 14, 2.4); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(236,246,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 4, d.w * 0.55, 4, 0, 0, Math.PI); ctx.stroke();   // (its foam collar)
      ctx.restore();
    }
    for (const hx of [GULL_END - camX + 4, DAWN_START - camX - 4]) {   // (foam along both hulls)
      ctx.strokeStyle = 'rgba(236,246,255,0.6)'; ctx.lineWidth = 3; ctx.beginPath();
      for (let y = BULW_TOP + 30; y < H; y += 10) { const xx = hx + Math.sin(y * 0.2 + t * 4) * 3; if (y === BULW_TOP + 30) ctx.moveTo(xx, y); else ctx.lineTo(xx, y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  /** the Gull's end: a sheet of grey-green water rolling over her stern (she is going down), with a foam edge */
  function wash(ctx, camX, t) {
    const edge = GULL_END - camX; if (edge < -300 || edge > W + 300) return;
    const k = 0.5 + 0.5 * Math.sin(t * 0.85), reach = 90 + 230 * k + 140 * sink;
    ctx.save(); ctx.beginPath(); ctx.rect(edge - 400, 362, 400 - 8, H); ctx.clip();
    const gr = ctx.createLinearGradient(edge - reach, 0, edge, 0);
    gr.addColorStop(0, 'rgba(40,96,120,0)'); gr.addColorStop(0.3, 'rgba(40,100,126,0.32)'); gr.addColorStop(1, 'rgba(28,76,104,0.62)');
    ctx.fillStyle = gr; ctx.fillRect(edge - reach, GT0, reach + 24, H);
    for (let y = 366, k = 0; y <= H; y += 6, k++) {   // (its leading edge: a wandering lip of froth -- clustered bubbles, some thinning out behind, tinted by the sea)
      const lip = edge - reach + Math.sin(y * 0.05 + t * 2) * 16 + Math.sin(y * 0.13 + 1.7) * 9, n2 = 1 + Math.floor(hash1(k * 5 + 1) * 3);
      for (let q = 0; q < n2; q++) { const r = 1.6 + 3.4 * hash1(k * 13 + q), x = lip + q * (4 + r) + hash1(k * 3 + q) * 6; ctx.fillStyle = `rgba(214,236,240,${0.7 - q * 0.18})`; ctx.beginPath(); ctx.ellipse(x, y + hash1(k + q) * 4, r * 1.5, r, 0, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = 'rgba(214,236,240,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lip + 6, y); ctx.quadraticCurveTo(lip + 22, y + 3, lip + 36 + hash1(k) * 20, y - 1); ctx.stroke();   // (lace trailing)
    }
    ctx.strokeStyle = 'rgba(200,230,240,0.4)'; ctx.lineWidth = 1.6; for (let k = 0; k < 4; k++) { const y = 380 + k * 40 + Math.sin(t * 2 + k) * 6; ctx.beginPath(); ctx.moveTo(edge - reach + 20, y); ctx.quadraticCurveTo(edge - reach * 0.5, y - 5, edge - 10, y + 2); ctx.stroke(); }   // (lit wave lines on it)
    ctx.restore();
  }
  /** a lantern hung from a yard (x, y: its hook), swinging with the ship: brass frame, glowing glass, a warm glow round it (the Gull's dim) */
  function lantern(ctx, x, y, t, dim, C) {
    const an = Math.sin(t * 1.5) * 0.22 * (0.4 + storm), L = 22, lx = x + Math.sin(an) * L, ly = y + Math.cos(an) * L, fl = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (dim ? 0.35 : 0.7) * fl; ctx.drawImage(C.glow.c, lx - 46, ly - 34, 92, 92); ctx.globalAlpha = (dim ? 0.12 : 0.22) * fl; ctx.drawImage(C.glow.c, lx - 150, 350, 300, 70); ctx.restore();   // (and its flicker on the deck below)
    ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx, ly - 9); ctx.stroke();
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(an);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(0, -12); ctx.lineTo(8, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dim ? '#c8a050' : '#ffd070'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(-7, -6, 14, 17); ctx.fill(); ctx.stroke();
    ctx.fillStyle = dim ? 'rgba(255,230,160,0.5)' : `rgba(255,250,210,${0.9 * fl})`; ctx.fillRect(-3.5, -3, 7, 11);
    ctx.fillStyle = '#8a6a2a'; ctx.fillRect(-8, 11, 16, 3); ctx.fillRect(-1, -6, 2, 17);
    ctx.restore();
  }
  /** the rain ringing the puddles on the decks */
  function ripples(ctx, camX, t) {
    const a0 = 0.25 + 0.5 * storm;
    ctx.save(); ctx.lineWidth = 1.2;
    for (const [px, py, pw] of PUDDLES) {
      const sx = px - camX; if (sx < -pw || sx > W + pw) continue;
      for (let k = 0; k < 3; k++) {
        const u = (t * 1.1 + k / 3 + hash1(px + k) * 0.7) % 1, ox = (hash1(Math.floor(t * 1.1 + k / 3) * 7 + px + k) - 0.5) * pw * 1.1, r = 2 + u * 12;
        ctx.strokeStyle = `rgba(220,226,255,${a0 * (1 - u)})`; ctx.beginPath(); ctx.ellipse(sx + ox, py, r, r * 0.3, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function rain(ctx, camX, t, near) {
    const n = near ? LAY.rain.length : 46, A = (near ? 1 : 0.5) * (0.5 + 0.7 * storm);
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = near ? 'rgba(200,214,255,1)' : 'rgba(160,176,230,1)'; ctx.lineWidth = near ? 1.6 : 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const r = LAY.rain[i], y = (r.y + t * 720 * r.sp * (near ? 1 : 0.7)) % (H + 60) - 30;
      const x = (((r.x - y * 0.3 - camX * (near ? 0.5 : 0.2)) % (W + 240)) + W + 240) % (W + 240) - 120;
      const l = r.l * (near ? 1 : 0.6);
      ctx.globalAlpha = 1; ctx.moveTo(x, y); ctx.lineTo(x - l * 0.3, y + l);
    }
    ctx.globalAlpha = A * (near ? 0.55 : 0.4); ctx.stroke();
    ctx.restore();
  }

  function drawBack(ctx, camX, t = 0) {
    const C = st.ensure(), s = S();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    const L = lightning(t);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';   // (bilinear: 'high' (bicubic) cost the far sprites' upscale 3-4x in software raster, QA3 render cost)
    ctx.fillStyle = '#0a0c1e'; ctx.fillRect(0, 0, W, H);
    sky(ctx, C, camX, t, L); sea(ctx, camX, t);
    rain(ctx, camX, t, false);
    gapWater(ctx, camX, t);
    const KK = KSf ? KS : K;   // (a story panel asks right before it draws: setStory)
    KSf = false;
    if (KK && KK.rise > 0.01) drawKraken(ctx, KK, camX, t);   // (behind the rails: its neck goes down into the sea)
    if (behind) { try { behind(ctx, camX, t); } catch (e) { if (!behind.err) { behind.err = 1; console.error('behindRail', e); } } }   // (setBehindRail: a boss's own art behind the rails)
    if (camX < GULL_END + 20) drawStrip(ctx, C.gullRail, camX, s);
    if (camX + W > DAWN_START - 20) drawStrip(ctx, C.dawnRail, camX, s);
    for (const cx of CANNONS) { const sx = cx - camX; if (sx > -60 && sx < W + 60) ctx.drawImage(C.cannon.c, sx - C.cannon.ox, 360 - C.cannon.oy, C.cannon.w, C.cannon.h); }
    MASTS.forEach((m, mi) => {   // (the masts sway with the swell about their feet; the Dawn's second is her first mirrored)
      const sx = m.x - camX; if (sx < -280 || sx > W + 280) return;
      const sp = m.g ? C.mastG : m.v2 ? C.mastD2 : C.mastD, sw = Math.sin(t * 0.9 + mi * 1.7) * 0.012 * (0.4 + storm);
      ctx.save(); ctx.translate(sx, 358); ctx.transform(1, 0, -sw, 1, 0, 0);
      shrouds(ctx, m.g ? -270 : -330);
      ctx.drawImage(sp.c, -sp.ox, -sp.oy, sp.w, sp.h); ctx.restore();
      for (const ln of LANTERNS) if (ln.m === mi) lantern(ctx, sx + ln.dx - sw * (358 - ln.y + 40), ln.y, t + mi, ln.dim, C);
    });
    if (camX < GULL_END + 40) drawStrip(ctx, C.gullFloor, camX, s);
    if (camX + W > DAWN_START - 40) drawStrip(ctx, C.dawnFloor, camX, s);
    ripples(ctx, camX, t);
    wash(ctx, camX, t);
    if (warm > 0.01) { ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(190,120,255,${0.1 * warm})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
  }
  function drawFront(ctx, camX, t = 0) {
    const C = st.ensure();
    camX = clamp(+camX || 0, 0, CAM_MAX);
    rain(ctx, camX, t, true);
    const L = lightning(t);
    if (L.w > 0.01) {   // a soft cold-violet wash with the bolt's first pulse (low peak, slow fade)
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = `rgba(190,170,255,${0.2 * L.w})`; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (K && K.glow > 0.01) {   // the collar's break / the kraken's colour (gold at the end, a purple pulse before it)
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.35 * K.glow; ctx.fillStyle = K.glowCol || '#ffd23a'; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    void C;
  }
  function drawProp(ctx, kind, sx, sy, opts) { propAt(ctx, st.ensure().items, kind, sx, sy, opts, 'rgba(8,6,16,0.4)'); }
  function setWarm(w) { warm = clamp(+w || 0, 0, 1); }
  /** the kraken's state for the head (src/sikraken.js: see drawKraken) -- null: gone */
  function setKraken(k) { K = k || null; }
  /** the storm's strength 0..1 (rain, swell) */
  function setStorm(k) { storm = clamp(+k || 0, 0, 1); }
  /** a story panel's look (src/cutscene.js): bg.kraken = 'rise' | 'friendly' | 'blind' puts the head in the panel (at bg.cam + 480) */
  function setStory(bg) {
    const m = bg && bg.kraken;
    KSf = true;
    if (!m) { KS = null; return; }
    const base = { x: (bg.cam || 0) + 480 + (bg.kx || 0), rise: bg.krise ?? 1, eyeL: 1, eyeR: 1, flashL: 0, flashR: 0, gold: 0, crack: 0, broken: 0, aim: 0, thrash: 0.2, shake: 0, mouth: 0, glow: 0 };
    if (m === 'friendly') Object.assign(base, { gold: 1, broken: 1, thrash: 0, mouth: 0 });
    else if (m === 'blind') Object.assign(base, { eyeL: 0, eyeR: 0, thrash: 0.7, mouth: 8 });
    KS = base;
  }
  /** how far the Gull has sunk 0..1 (the wash over her stern) */
  function setSink(k) { sink = clamp(+k || 0, 0, 1); }
  /** setBehindRail(fn | null): fn(ctx, camX, t) is called in drawBack after the sea and the kraken's head, before the rails (a boss's art behind the rail) */
  function setBehindRail(fn) { behind = typeof fn === 'function' ? fn : null; }
  /** the FX layer's emitters for the screen at camX (src/sifx.js): the rails (spray), the decks' puddles, the lanterns, the open water */
  function ambientSpots(camX) {
    const o = [], a = camX - 40, b = camX + W + 40;
    if (a < GULL_END) o.push({ kind: 'rail', x0: Math.max(a, 0), x1: Math.min(b, GULL_END - 40), y: RAIL_TOP });
    if (b > DAWN_START) o.push({ kind: 'rail', x0: Math.max(a, DAWN_START + 14), x1: Math.min(b, LEVEL_LEN), y: RAIL_TOP });
    if (b > GULL_END && a < DAWN_START) o.push({ kind: 'water', x0: Math.max(a, GULL_END), x1: Math.min(b, DAWN_START) });
    for (const [px, py, pw] of PUDDLES) if (px > a && px < b) o.push({ kind: 'puddle', x: px, y: py, w: pw });
    MASTS.forEach((m, mi) => { for (const ln of LANTERNS) if (ln.m === mi && m.x + ln.dx > a && m.x + ln.dx < b) o.push({ kind: 'lantern', x: m.x + ln.dx, y: ln.y + 22 }); });
    return o;
  }
  return { setScale: st.setScale, setWarm, setKraken, setStorm, setSink, setStory, setBehindRail, ambientSpots, drawBack, drawFront, drawProp, info: st.info, release: st.release, get warm() { return warm; } };
}

// ---------------------------------------------------------------------------------------------------------------
// BREAKABLE PROPS (full INK: they are interactive)
// ---------------------------------------------------------------------------------------------------------------
export const PROP_INFO = {
  crate:  { w: 60, h: 56, colors: ['#8a6038', '#5a3c22', '#c9a070', '#e6b43a'] },
  barrel: { w: 48, h: 60, colors: ['#7a5030', '#4a3018', '#b88a58', '#4f5466'] },
  urn:    { w: 50, h: 58, colors: ['#c0663a', '#8a4426', '#e8a070', '#7f8c3c'] },
};
const PROP_DRAW = {
  crate(g) {   // a ship's crate, roped, with a little gold sun on its side (the Scarlet Dawn's)
    const wood = '#8a6038', woodSh = '#5a3c22', woodHi = '#b88a58', woodDk = '#3e2812', rope = '#d9c08a';
    const L = -28, Rr = 24, T = -40, dx = 6, dy = -9;
    ink(g, (g) => poly(g, [Rr, 0, Rr + dx, dy, Rr + dx, T + dy, Rr, T]), woodSh, 2.6);
    ink(g, (g) => poly(g, [L, T, Rr, T, Rr + dx, T + dy, L + dx, T + dy]), woodHi, 2.4);
    ink(g, (g) => poly(g, [L, 0, L, T, Rr, T, Rr, 0]), wood, 2.8, (g) => {
      g.strokeStyle = woodDk; g.lineWidth = 1.4; for (const y of [-14, -27]) { polyline(g, [L, y, Rr, y]); g.stroke(); }
      g.fillStyle = woodSh; g.fillRect(L, T, 6, 40); g.fillRect(Rr - 6, T, 6, 40);
    });
    g.fillStyle = '#e6b43a'; g.beginPath(); g.arc(-2, -22, 8, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = '#e6b43a'; g.lineWidth = 2; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.beginPath(); g.moveTo(-2 + Math.cos(a) * 11, -22 + Math.sin(a) * 11); g.lineTo(-2 + Math.cos(a) * 16, -22 + Math.sin(a) * 16); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 5; polyline(g, [L + 18, 0, L + 18, T, L + 18 + dx, T + dy]); g.stroke();
    g.strokeStyle = rope; g.lineWidth = 3; polyline(g, [L + 18, 0, L + 18, T, L + 18 + dx, T + dy]); g.stroke();
  },
  barrel(g) {
    const wood = '#7a5030', woodSh = '#4a3018', woodHi = '#a87a4c', iron = '#4f5466', ironHi = '#8e94a8';
    const body = (g) => { g.beginPath(); g.moveTo(-18, -52); g.quadraticCurveTo(-27, -26, -18, 0); g.ellipse(0, 0, 18, 4.5, 0, Math.PI, 0, true); g.quadraticCurveTo(27, -26, 18, -52); g.closePath(); };
    ink(g, body, wood, 2.8, (g) => {
      g.fillStyle = woodSh; g.fillRect(7, -60, 30, 66); g.fillStyle = woodHi; g.fillRect(-19, -54, 5, 58);
      g.strokeStyle = woodSh; g.lineWidth = 1.2; for (const k of [-0.5, -0.1, 0.3]) { g.beginPath(); g.moveTo(k * 18, -52); g.quadraticCurveTo(k * 27, -26, k * 18, 4); g.stroke(); }
      for (const y of [-44, -8]) { g.fillStyle = INK; g.fillRect(-30, y - 4, 60, 8); g.fillStyle = iron; g.fillRect(-30, y - 3, 60, 6); g.fillStyle = ironHi; g.fillRect(-30, y - 3, 60, 1.4); }
    });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -52, 18, 5.5, 0, 0, TAU); }, '#96683c', 2.4, (g) => { g.strokeStyle = woodSh; g.lineWidth = 1; g.beginPath(); g.ellipse(0, -52, 12, 3.5, 0, 0, TAU); g.stroke(); });
  },
  urn(g) {
    const clay = '#c0663a', sh = '#8a4426', hi = '#e8a070';
    const body = (g) => { g.beginPath(); g.moveTo(-11, -50); g.quadraticCurveTo(-14, -42, -22, -32); g.quadraticCurveTo(-30, -14, -16, 0); g.lineTo(16, 0); g.quadraticCurveTo(30, -14, 22, -32); g.quadraticCurveTo(14, -42, 11, -50); g.closePath(); };
    ink(g, body, clay, 2.8, (g) => { g.fillStyle = sh; g.fillRect(6, -54, 30, 56); g.fillStyle = hi; g.fillRect(-20, -38, 5, 30); g.fillStyle = '#f0d9a8'; g.fillRect(-30, -30, 60, 6); });
    ink(g, (g) => { g.beginPath(); g.ellipse(0, -50, 13, 4, 0, 0, TAU); }, '#d88a5a', 2.2, (g) => { g.fillStyle = '#4a2416'; g.beginPath(); g.ellipse(0, -50, 8, 2.4, 0, 0, TAU); g.fill(); });
  },
};

// (the Storm Sea ride, src/stormride.js: the friendly kraken beside the Scarlet Dawn -- its head and one arm)
export { drawKraken, arm as drawKrakenArm };
