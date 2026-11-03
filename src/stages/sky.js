// The finale's sky (docs/FINALE.md): a storm over the Ember Throne's volcano, for the sky duel (src/skyduel.js) and the
// finale's cutscene panels (bg.lvl 'sky').  Canvas 2D, no deps, code-drawn like the level stages.
//
// Back-to-front (drawBack): the storm sky (a purple-black top, the volcano's red glow low down, the third wizard's green
// glow on the far horizon)  ->  far ridges (parallax 0.04)  ->  the volcano and its smoke (0.1)  ->  the far cloud deck
// (0.14)  ->  lightning (bolts in the far sky, the sky lit for a moment; lavender-white, so the Dread King's lime
// fireballs never read as part of it)  ->  the mid cloud deck (0.34)  ->  rain
// and the volcano's embers.   drawFront: fast cloud wisps passing in front (1.5).
// drawRoof(ctx, k, t): the throne room's roof breaking up and falling away (k 0..1, the duel's opening seconds).
// setStorm(n): 1..3, the lightning comes more often each phase.  flashOf(t): the sky-flash strength now (0..1), so the
// duel can flash its sprites with it.
// Clouds are pre-rendered per scale into small offscreen canvases (setScale); all layout randomness is seeded.
import { W, H } from '../config.js';
import { layerCanvas, liveCanvas, freeCanvases } from '../canvasmem.js';

const TAU = Math.PI * 2;
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function newCanvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)))
    : Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.ceil(w)), height: Math.max(1, Math.ceil(h)) });
  return c;
}

// cloud decks: [parallax, y band, spacing, size, colours body / shade / lit rim, alpha]
const DECKS = {
  far: { p: 0.14, y: [150, 330], gap: 230, size: [150, 260], body: '#3b2f55', shade: '#281f3f', rim: '#8270b4', a: 0.95 },
  mid: { p: 0.34, y: [330, 520], gap: 300, size: [220, 360], body: '#4a3b66', shade: '#2e2449', rim: '#a893d6', a: 0.92 },
  front: { p: 1.5, y: [470, 600], gap: 900, size: [300, 460], body: '#5b4a78', shade: '#3a2d55', rim: '#c4b2ea', a: 0.55 },
};
// the roof: basalt slabs with gold trim, each [x0, w, h, spin, drift, delay]
const ROOF = (() => {
  const R = rng(77), out = [];
  for (let x = -40; x < W + 40;) { const w = 90 + R() * 90; out.push([x, w, 40 + R() * 40, (R() - 0.5) * 3, (R() - 0.5) * 120, R() * 0.25]); x += w - 6; }
  return out;
})();

export function createStage() {
  let cs = 1, C = null, storm = 1;

  function cloudSprite(D, seed) {
    const R = rng(seed);
    const w = D.size[0] + R() * (D.size[1] - D.size[0]), h = w * (0.34 + R() * 0.12);
    // (src/canvasmem.js: down the scale ladder past the memory cap; none at all -- painted live, never a gap in the sky)
    const pad = 12, L = layerCanvas(w + pad * 2, h + pad * 2, cs);
    if (!L) { const vw = Math.ceil((w + pad * 2) * cs), vh = Math.ceil((h + pad * 2) * cs); return { c: liveCanvas(vw, vh, (g) => { const R2 = rng(seed); R2(); R2(); g.scale(cs, cs); g.translate(pad, pad); paintCloud(g, D, w, h, R2); }), w: w + pad * 2, h: h + pad * 2 }; }   // (re-seeded: the same cloud each frame)
    const c = L.c, g = L.g;
    g.scale(L.sc, L.sc); g.translate(pad, pad);
    paintCloud(g, D, w, h, R);
    return { c, w: w + pad * 2, h: h + pad * 2 };
  }
  /** a cloud's paint (its puffs from R, the stream its sprite was seeded with): body, darker underside, a lit rim */
  function paintCloud(g, D, w, h, R) {
    const puffs = [];
    const n = 6 + Math.floor(R() * 5);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, r = h * (0.28 + R() * 0.24) * (1 - Math.abs(u - 0.5) * 0.9);
      puffs.push([w * (0.08 + u * 0.84) + (R() - 0.5) * 20, h - r * (0.9 + R() * 0.5), r]);
    }
    const shape = () => { g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); } g.rect(w * 0.08, h * 0.62, w * 0.84, h * 0.38); };
    // body, darker underside, a lightning-lit rim along the tops
    shape(); g.fillStyle = D.body; g.fill();
    g.save(); shape(); g.clip();
    const sh = g.createLinearGradient(0, h * 0.35, 0, h); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, D.shade);
    g.fillStyle = sh; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-atop';
    g.translate(0, 5); g.fillStyle = 'rgba(0,0,0,0.0)';
    g.restore();
    g.save(); shape(); g.clip();
    g.strokeStyle = D.rim; g.lineWidth = 3; g.globalAlpha = 0.55;
    g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r * Math.cos(-2.6), y + r * Math.sin(-2.6)); g.arc(x, y, r - 1.5, -2.6, -0.5); } g.stroke();
    g.restore();
  }

  let released = false;   // (released: kept so -- a resize only notes the scale -- until drawn on screen)
  function setScale(s) {
    cs = Math.max(0.5, Math.min(2.5, s || 1));
    if (released) return;
    if (C) freeCanvases(C);
    C = { decks: {} };
    for (const [k, D] of Object.entries(DECKS)) C.decks[k] = Array.from({ length: 5 }, (_, i) => cloudSprite(D, 1000 + i * 37 + k.length * 101));
  }
  function setWarm() { /* (the curse lifts in the cutscenes: the green horizon glow is the third wizard's, it stays) */ }
  function setStorm(n) { storm = Math.max(1, Math.min(3, n | 0)); }

  // ---- lightning: one bolt per slot of ~2.6 s (fewer while storm = 1), each 0.35 s, seeded by its slot
  const SLOT = 2.6;
  function boltAt(t) {
    const i = Math.floor(t / SLOT), u = t - i * SLOT, h = hash1(i);
    if (h > 0.35 + storm * 0.2 || u > 0.38) return null;
    return { i, u, x: 120 + hash1(i * 3.1) * (W - 240), seed: i };
  }
  function flashOf(t) { const b = boltAt(t); return b ? Math.max(0, 1 - b.u / 0.3) : 0; }

  function drawSky(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#120d22'); g.addColorStop(0.45, '#2c2046'); g.addColorStop(0.78, '#5a2c3a'); g.addColorStop(1, '#a8452a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // the far horizon's green glow: the third wizard's power, far away
    const hg = ctx.createRadialGradient(W * 0.92, H * 0.6, 10, W * 0.92, H * 0.6, 360);
    hg.addColorStop(0, `rgba(110,255,140,${0.22 + 0.05 * Math.sin(t * 0.8)})`); hg.addColorStop(1, 'rgba(60,200,90,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H);
  }
  function ridge(ctx, camX, p, base, amp, col, seed) {
    const off = camX * p;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20) {
      const wx = x + off;
      const y = base - amp * (0.5 * Math.sin(wx * 0.004 + seed) + 0.3 * Math.sin(wx * 0.011 + seed * 2) + 0.2 * Math.sin(wx * 0.027 + seed * 3));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  function volcano(ctx, camX, t) {
    const x = 520 - camX * 0.1, y = H + 30;
    if (x < -420 || x > W + 420) return;
    ctx.save(); ctx.translate(x, y);
    // smoke plume, drifting
    for (let i = 0; i < 7; i++) {
      const u = ((t * 0.05 + i / 7) % 1), r = 40 + u * 110;
      ctx.fillStyle = `rgba(36,26,40,${0.45 * (1 - u)})`;
      ctx.beginPath(); ctx.arc(Math.sin(i * 2.1 + t * 0.3) * 30 + u * 140, -260 - u * 300, r, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#1c1420'; ctx.beginPath();
    ctx.moveTo(-430, 0); ctx.lineTo(-90, -250); ctx.lineTo(-40, -262); ctx.lineTo(40, -258); ctx.lineTo(95, -246); ctx.lineTo(430, 0); ctx.closePath(); ctx.fill();
    // the crater's glow and lava streaks
    const cg = ctx.createRadialGradient(0, -255, 4, 0, -255, 150);
    cg.addColorStop(0, 'rgba(255,190,90,0.85)'); cg.addColorStop(0.35, 'rgba(255,100,40,0.35)'); cg.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, -255, 150, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,40,0.7)'; ctx.lineWidth = 3;
    for (const [a, b] of [[-30, -120], [24, 90], [60, 200]]) { ctx.beginPath(); ctx.moveTo(a * 0.5, -250); ctx.quadraticCurveTo(a, -160, b, -40); ctx.stroke(); }
    ctx.restore();
  }
  function deck(ctx, camX, t, key) {
    const D = DECKS[key], spr = C.decks[key], period = D.gap * 8;
    const off = camX * D.p + t * (key === 'front' ? 0 : 6);
    ctx.globalAlpha = D.a;
    for (let i = 0; i < 8; i++) {
      const s = spr[i % spr.length];
      let x = ((i * D.gap + hash1(i + key.length) * D.gap * 0.6 - off) % period + period) % period - s.w;
      if (x > W) continue;
      const y = D.y[0] + hash1(i * 7 + key.length) * (D.y[1] - D.y[0]) - s.h * 0.5;
      ctx.drawImage(s.c, x, y, s.w, s.h);
    }
    ctx.globalAlpha = 1;
  }
  function bolt(ctx, b) {
    const R = rng(b.seed * 9 + 1), pts = [];
    let x = b.x, y = -10;
    while (y < 300 + R() * 120) { pts.push([x, y]); x += (R() - 0.5) * 70; y += 26 + R() * 30; }
    const a = Math.max(0, 1 - b.u / 0.38);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [w, col] of [[16, `rgba(160,140,255,${0.25 * a})`], [6, `rgba(205,192,255,${0.7 * a})`], [2.2, `rgba(250,248,255,${a})`]]) {
      ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
    }
    ctx.restore();
  }
  function rain(ctx, camX, t) {
    ctx.strokeStyle = 'rgba(190,180,230,0.16)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < 70; i++) {
      const x = ((hash1(i) * 1100 - camX * 0.9 - t * 120) % 1100 + 1100) % 1100 - 70;
      const y = ((hash1(i * 3) * 700 + t * 620) % 700) - 80;
      ctx.moveTo(x, y); ctx.lineTo(x - 7, y + 22);
    }
    ctx.stroke();
  }
  function embers(ctx, camX, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const u = (t * (0.08 + hash1(i) * 0.06) + hash1(i * 5)) % 1;
      const x = ((hash1(i * 2) * 1000 - camX * 0.5 + Math.sin(t + i) * 20) % 1000 + 1000) % 1000 - 20;
      const y = H + 10 - u * 520;
      ctx.fillStyle = `rgba(255,${150 + (i % 3) * 30},70,${0.7 * (1 - u)})`;
      ctx.fillRect(x, y, 2.4, 2.4);
    }
    ctx.restore();
  }

  function drawBack(ctx, camX = 0, t = 0) {
    if (!C) { released = false; setScale(cs); }
    drawSky(ctx, t);
    ridge(ctx, camX, 0.04, 430, 70, '#251a35', 1.3);
    ridge(ctx, camX, 0.07, 480, 60, '#1d1529', 4.1);
    volcano(ctx, camX, t);
    deck(ctx, camX, t, 'far');
    const b = boltAt(t);
    if (b) {
      bolt(ctx, b);
      ctx.fillStyle = `rgba(190,178,255,${0.14 * Math.max(0, 1 - b.u / 0.3)})`; ctx.fillRect(0, 0, W, H);
    }
    deck(ctx, camX, t, 'mid');
    rain(ctx, camX, t);
    embers(ctx, camX, t);
  }
  function drawFront(ctx, camX = 0, t = 0) {
    if (!C) { released = false; setScale(cs); }
    deck(ctx, camX, t, 'front');
  }
  /** the throne room's roof breaking up and falling away (k 0..1) */
  function drawRoof(ctx, k, t = 0) {
    if (k >= 1) return;
    ctx.save();
    for (const [x0, w, h, spin, drift, delay] of ROOF) {
      const u = Math.max(0, (k - delay) / (1 - delay));
      const y = -h * 0.2 + u * u * 700, x = x0 + drift * u;
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(spin * u);
      ctx.fillStyle = '#2a2228'; ctx.strokeStyle = '#120c12'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2 + 6); ctx.lineTo(w / 2 - 8, h / 2); ctx.lineTo(-w / 2 + 6, h / 2 - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c99a3a'; ctx.fillRect(-w / 2 + 6, h / 2 - 12, w - 18, 5);
      ctx.restore();
    }
    // dust in the light
    ctx.globalAlpha = Math.max(0, 0.5 - k * 0.6); ctx.fillStyle = '#3a2c34'; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  function info() { return { decks: Object.keys(DECKS).length }; }
  function release() { if (C) freeCanvases(C); C = null; released = true; }
  return { setScale, setWarm, setStorm, flashOf, drawBack, drawFront, drawRoof, info, release };
}
