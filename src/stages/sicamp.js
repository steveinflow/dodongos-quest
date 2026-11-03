// Dodongo's Quest - Skull Island: THE CAMPFIRE (src/stages/sicamp.js), the backdrop of the camp story (si_campfire, the night before the Skull Palace -- Scarlet's secret).
// A story-only stage (no stage of the list; src/main.js playStory loads it like the harbor): drawn LIVE each call, no cache.  Panels pick the look with bg.shot:
//   'camp'   (default) a night cliff top, a small campfire, the storm over the island and, far off on its peak, the SKULL PALACE glowing purple
//   'close'  the campfire up close: firelight on the ground and a warm glow (the cast sits right at it)
//   'palace' the Skull Palace on its peak filling the frame, its eye windows blazing purple; in one window a tall thin silhouette with a feather collar looks out (Malachar, never his face)
//   'memory' Scarlet's memories (bg.mem): 'sun' (a sunny white palace balcony over a bright island town, sepia), 'storm' (the purple storm and the crystal), 'boat' (a tiny rowboat on night waves)
// bg.fire (0..1, default 1): how bright the fire burns; bg.tint is the panel's own (the memory panels' sepia).
import { W, H, INK } from '../config.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash1 = (n) => { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
export const LEVEL_LEN = 960;
export const SECTIONS = [{ id: 'camp', name: 'The Campfire', x0: 0, x1: 960 }];
export const PROP_INFO = {};

function ink(ctx, w = 3, col = INK) { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.stroke(); }

/** the night sky: deep blue to a purple haze, stars, a storm cloud bank with a purple glow from the island */
function nightSky(ctx, t, storm = 1) {
  const g = ctx.createLinearGradient(0, 0, 0, 380); g.addColorStop(0, '#080a24'); g.addColorStop(0.6, '#241a4a'); g.addColorStop(1, '#5a2a6a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 400);
  ctx.fillStyle = '#fff'; for (let i = 0; i < 70; i++) { const x = hash1(i * 3 + 1) * W, y = hash1(i * 3 + 2) * 250, a = 0.3 + 0.6 * hash1(i * 3 + 3); ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 2 + i)); ctx.fillRect(x, y, 1.6, 1.6); }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 9; i++) {
    const x = ((i * 137 + t * 6) % (W + 300)) - 150, y = 70 + (i % 5) * 38, rx = 150 + (i % 3) * 40;
    const c = ctx.createRadialGradient(x, y, 0, x, y, rx); c.addColorStop(0, `rgba(110,40,140,${0.55 * storm})`); c.addColorStop(1, 'rgba(70,20,110,0)');
    ctx.save(); ctx.translate(0, y); ctx.scale(1, 0.34); ctx.translate(0, -y); ctx.fillStyle = c; ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2); ctx.restore();
  }
}
/** the island's peak with the SKULL PALACE: a black skull-shaped keep, eye windows burning; k = scale, (cx, by) the base centre */
function skullPalace(ctx, cx, by, k, t, o = {}) {
  ctx.save(); ctx.translate(cx, by); ctx.scale(k, k);
  // the peak
  ctx.fillStyle = '#120a1c'; ctx.beginPath(); ctx.moveTo(-300, 0); ctx.lineTo(-210, -80); ctx.lineTo(-130, -120); ctx.lineTo(-70, -190); ctx.lineTo(0, -230); ctx.lineTo(80, -190); ctx.lineTo(150, -130); ctx.lineTo(230, -70); ctx.lineTo(310, 0); ctx.closePath(); ctx.fill(); ink(ctx, 3 / k);
  // the skull: dome, cheeks, jaw
  ctx.beginPath(); ctx.moveTo(-86, -226); ctx.bezierCurveTo(-110, -330, -60, -400, 0, -402); ctx.bezierCurveTo(60, -400, 110, -330, 86, -226); ctx.lineTo(60, -196); ctx.lineTo(-60, -196); ctx.closePath();
  const sg = ctx.createLinearGradient(0, -400, 0, -196); sg.addColorStop(0, '#4a3a66'); sg.addColorStop(1, '#241a38'); ctx.fillStyle = sg; ctx.fill(); ink(ctx, 4 / k);
  // the eye windows and the nose
  const glow = 0.75 + 0.25 * Math.sin(t * 3);
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#05020a'; ctx.beginPath(); ctx.ellipse(s * 34, -312, 24, 28, 0, 0, TAU); ctx.fill(); ink(ctx, 3 / k);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const eg = ctx.createRadialGradient(s * 34, -312, 2, s * 34, -312, 60); eg.addColorStop(0, `rgba(255,90,230,${0.95 * glow})`); eg.addColorStop(1, 'rgba(160,30,200,0)'); ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(s * 34, -312, 60, 0, TAU); ctx.fill(); ctx.restore();
  }
  if (o.watcher) {   // in the left window: a tall thin silhouette with a spiked feather collar, magenta glints for eyes -- no face
    ctx.save(); ctx.translate(-34, -312); ctx.beginPath(); ctx.rect(-22, -26, 44, 52); ctx.clip();
    ctx.fillStyle = '#1a0a2a'; ctx.beginPath(); ctx.moveTo(-8, 30); ctx.lineTo(-10, -8); ctx.lineTo(-16, -22); ctx.lineTo(-6, -14); ctx.lineTo(0, -30); ctx.lineTo(6, -14); ctx.lineTo(16, -22); ctx.lineTo(10, -8); ctx.lineTo(8, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff5ae6'; ctx.beginPath(); ctx.arc(-3, -9, 1.8, 0, TAU); ctx.arc(3, -9, 1.8, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#05020a'; ctx.beginPath(); ctx.moveTo(0, -274); ctx.lineTo(10, -246); ctx.lineTo(-10, -246); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d8d0e4'; ctx.strokeStyle = INK; ctx.lineWidth = 2.4 / k; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.rect(i * 17 - 7, -222, 14, 22); ctx.fill(); ctx.stroke(); }
  // towers
  for (const s of [-1, 1]) { ctx.fillStyle = '#1e1230'; ctx.beginPath(); ctx.moveTo(s * 120, -110); ctx.lineTo(s * 120, -190); ctx.lineTo(s * 132, -226); ctx.lineTo(s * 144, -190); ctx.lineTo(s * 144, -110); ctx.closePath(); ctx.fill(); ink(ctx, 2.6 / k); ctx.fillStyle = '#ff5ae6'; ctx.fillRect(s * 132 - 2, -176, 4, 10); }
  ctx.restore();
}
function cliff(ctx, y0) {
  const g = ctx.createLinearGradient(0, y0, 0, H); g.addColorStop(0, '#2a2438'); g.addColorStop(1, '#14101e');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, y0 + 30); for (let x = 0; x <= W; x += 40) ctx.lineTo(x, y0 + 10 + 20 * Math.sin(x * 0.012) + 8 * hash1(x)); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill(); ink(ctx, 4);
  ctx.fillStyle = 'rgba(40,70,40,0.5)'; for (let x = 20; x < W; x += 54) { ctx.beginPath(); ctx.ellipse(x + 10 * hash1(x), y0 + 40 + 24 * hash1(x + 5), 30, 6, 0, 0, TAU); ctx.fill(); }
}
function fire(ctx, cx, cy, t, k) {
  // the light pool, the logs, the flames
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy - 20, 380 * k); g.addColorStop(0, 'rgba(255,170,70,0.65)'); g.addColorStop(0.5, 'rgba(255,120,40,0.22)'); g.addColorStop(1, 'rgba(255,90,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy - 10, 420 * k, 190 * k, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#4a2a16'; ctx.strokeStyle = INK; ctx.lineWidth = 3; for (const a of [-0.35, 0.35, 0]) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-44, -9, 88, 18, 8) : ctx.rect(-44, -9, 88, 18); ctx.fill(); ctx.stroke(); ctx.restore(); }
  for (let i = 0; i < 5; i++) {
    const f = Math.sin(t * 9 + i * 1.7), x = cx + (i - 2) * 10, h = (48 + 14 * f) * k * (1 - Math.abs(i - 2) * 0.16);
    ctx.beginPath(); ctx.moveTo(x - 10, cy - 4); ctx.quadraticCurveTo(x - 14, cy - h * 0.5, x + 3 * f, cy - h); ctx.quadraticCurveTo(x + 14, cy - h * 0.5, x + 10, cy - 4); ctx.closePath();
    ctx.fillStyle = i % 2 ? '#ff8a2a' : '#ffb02e'; ctx.fill(); ink(ctx, 2.4);
    ctx.beginPath(); ctx.moveTo(x - 5, cy - 4); ctx.quadraticCurveTo(x - 6, cy - h * 0.4, x + 2 * f, cy - h * 0.66); ctx.quadraticCurveTo(x + 6, cy - h * 0.4, x + 5, cy - 4); ctx.closePath(); ctx.fillStyle = '#fff0a0'; ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,200,120,0.9)'; for (let i = 0; i < 7; i++) { const u = ((t * 0.6 + i / 7) % 1); ctx.globalAlpha = 1 - u; ctx.fillRect(cx + Math.sin(i * 3.1 + t) * 22 * u, cy - 40 - u * 120, 2, 2); } ctx.globalAlpha = 1;
}

export function createStage() {
  let shot = 'camp', mem = 'sun', fireK = 1;
  function drawMemory(ctx, t) {
    if (mem === 'sun') {   // sunny white balcony over a bright island town, then the sea
      const g = ctx.createLinearGradient(0, 0, 0, 340); g.addColorStop(0, '#8ad0f6'); g.addColorStop(1, '#f8f0d0'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 360);
      ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(760, 90, 44, 0, TAU); ctx.fill();
      ctx.fillStyle = '#58b8e8'; ctx.fillRect(0, 300, W, 60);   // (the sea)
      // the bright town on the right: colourful houses and gardens running down to the water
      const cols = ['#f08a6a', '#f6c860', '#8ad08a', '#7ab4f0', '#e8a0d0'];
      for (let i = 0; i < 12; i++) { const x = 480 + i * 40, y = 250 + (i % 3) * 14 + (i > 6 ? 18 : 0), w = 34, h = 40 + (i % 4) * 8; ctx.fillStyle = cols[i % 5]; ctx.fillRect(x, y - h, w, h); ink(ctx, 2.6); ctx.fillStyle = '#b84a34'; ctx.beginPath(); ctx.moveTo(x - 4, y - h); ctx.lineTo(x + w / 2, y - h - 18); ctx.lineTo(x + w + 4, y - h); ctx.closePath(); ctx.fill(); ink(ctx, 2.6); }
      ctx.fillStyle = '#7ac870'; ctx.fillRect(470, 292, 480, 12);
      // the white balcony: floor, balustrade
      ctx.fillStyle = '#f4f0e4'; ctx.fillRect(0, 380, W, H - 380); ctx.fillStyle = '#e0d8c0'; ctx.fillRect(0, 380, W, 8);
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(-4, 380, W + 8, H);
      ctx.fillStyle = '#f8f4e8'; for (let x = 20; x < 470; x += 38) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, 318, 20, 62, 6) : ctx.rect(x, 318, 20, 62); ctx.fill(); ink(ctx, 2.4); }
      ctx.fillStyle = '#f0ead8'; ctx.fillRect(0, 306, 470, 14); ink(ctx, 2.6); ctx.strokeRect(0, 306, 470, 14);
      ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(40, 150, 24, 0, TAU); ctx.fill(); ink(ctx, 3);
      // the little girl (about six): long copper-red hair, a little white dress with a gold sash, laughing up at her father; she reaches his waist
      ctx.save(); ctx.translate(352, 486); ctx.lineJoin = 'round';
      ctx.fillStyle = '#e8b890'; ctx.beginPath(); ctx.arc(2, -62, 12, 0, TAU); ctx.fill(); ink(ctx, 2.6);
      ctx.fillStyle = '#b8501e'; ctx.beginPath(); ctx.moveTo(-12, -66); ctx.quadraticCurveTo(-14, -80, 2, -80); ctx.quadraticCurveTo(18, -80, 15, -62); ctx.lineTo(16, -34); ctx.lineTo(8, -44); ctx.lineTo(-6, -44); ctx.lineTo(-14, -34); ctx.closePath(); ctx.fill(); ink(ctx, 2.2);
      ctx.fillStyle = '#e8b890'; ctx.beginPath(); ctx.arc(2, -62, 11, 0, TAU); ctx.fill(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-2, -63, 1.6, 0, TAU); ctx.arc(7, -63, 1.6, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(2, -58, 4, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.moveTo(-9, -50); ctx.lineTo(13, -50); ctx.lineTo(20, -12); ctx.lineTo(-16, -12); ctx.closePath(); ctx.fill(); ink(ctx, 2.6);
      ctx.fillStyle = '#e8b030'; ctx.fillRect(-10, -36, 22, 5); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.strokeRect(-10, -36, 22, 5);
      ctx.fillStyle = '#e8b890'; ctx.fillRect(-12, -14, 6, 14); ctx.fillRect(6, -14, 6, 14); ctx.restore();
    } else if (mem === 'storm') {   // the purple storm and Malachar's storm-magic
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a0a3a'); g.addColorStop(1, '#6a1a7a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 12; i++) { const x = hash1(i) * W, y = 40 + hash1(i + 9) * 260, r = 110 + hash1(i + 3) * 80; const c = ctx.createRadialGradient(x, y, 0, x, y, r); c.addColorStop(0, 'rgba(255,90,230,0.35)'); c.addColorStop(1, 'rgba(120,20,170,0)'); ctx.fillStyle = c; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
      ctx.strokeStyle = 'rgba(255,230,255,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); let x = 640, y = 0; ctx.moveTo(x, y); for (let i = 0; i < 8; i++) { y += 36; x += (hash1(i + Math.floor(t * 4)) - 0.5) * 60; ctx.lineTo(x, y); } ctx.stroke();
      // the giant purple crystal with a crowned silhouette inside
      ctx.save(); ctx.translate(250, 310); ctx.fillStyle = '#9a52e8'; ctx.beginPath(); ctx.moveTo(0, -150); ctx.lineTo(52, -90); ctx.lineTo(64, 0); ctx.lineTo(50, 100); ctx.lineTo(0, 160); ctx.lineTo(-50, 100); ctx.lineTo(-64, 0); ctx.lineTo(-52, -90); ctx.closePath(); ctx.fill(); ink(ctx, 4);
      ctx.fillStyle = 'rgba(20,16,70,0.8)'; ctx.beginPath(); ctx.ellipse(0, -30, 14, 16, 0, 0, TAU); ctx.fill(); ctx.fillRect(-24, -14, 48, 100); ctx.fillStyle = '#ffd23a'; ctx.fillRect(-14, -52, 28, 8);
      ctx.restore();
    } else {   // a tiny rowboat on dark waves, the skull island behind
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0c0a2a'); g.addColorStop(0.5, '#3a1a5a'); g.addColorStop(1, '#10102a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      skullPalace(ctx, 690, 330, 0.55, t);
      ctx.fillStyle = '#0c1030'; for (let r = 0; r < 4; r++) { ctx.beginPath(); ctx.moveTo(0, 340 + r * 40); for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 340 + r * 40 + 7 * Math.sin(x * 0.03 + t * 2 + r)); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill(); ink(ctx, 2, 'rgba(120,140,220,0.4)'); }
      ctx.save(); ctx.translate(262, 430 + 4 * Math.sin(t * 2)); ctx.rotate(0.05 * Math.sin(t * 1.6)); ctx.fillStyle = '#6a4426'; ctx.beginPath(); ctx.moveTo(-60, -10); ctx.lineTo(60, -10); ctx.lineTo(40, 18); ctx.lineTo(-40, 18); ctx.closePath(); ctx.fill(); ink(ctx, 3.4);
      ctx.fillStyle = '#f4ecff'; ctx.beginPath(); ctx.arc(0, -34, 11, 0, TAU); ctx.fill(); ink(ctx, 2.6); ctx.fillStyle = '#c8602a'; ctx.beginPath(); ctx.arc(0, -40, 12, Math.PI, TAU); ctx.fill(); ctx.fillStyle = '#f4ecff'; ctx.fillRect(-9, -24, 18, 20); ink(ctx, 2.6); ctx.restore();
    }
  }
  function drawBack(ctx, cam = 0, t = 0) {
    ctx.save();
    if (shot === 'memory') { drawMemory(ctx, t); ctx.restore(); return; }
    nightSky(ctx, t, 1);
    if (shot === 'palace') {
      skullPalace(ctx, 480, 440, 1.25, t, { watcher: true });
      // a tiny campfire far below on a distant cliff, bottom-left
      ctx.fillStyle = '#0c0814'; ctx.beginPath(); ctx.moveTo(0, 470); ctx.lineTo(0, 540); ctx.lineTo(260, 540); ctx.lineTo(200, 490); ctx.closePath(); ctx.fill();
      fire(ctx, 90, 492, t, 0.28);
    } else if (shot === 'close') {
      cliff(ctx, 300); fire(ctx, 470, 430, t, 1.15 * fireK);
    } else {
      skullPalace(ctx, 790, 345, 0.5, t);
      cliff(ctx, 330); fire(ctx, 460, 440, t, fireK);
    }
    ctx.restore();
  }
  return {
    setScale() {}, setWarm() {}, drawProp() {}, drawFront() {}, drawBack,
    setStory(bg) { shot = (bg && bg.shot) || 'camp'; mem = (bg && bg.mem) || 'sun'; fireK = bg && bg.fire !== undefined ? clamp(bg.fire, 0.3, 1.4) : 1; },
    info() { return { canvases: 0, megapixels: 0, approxMB: 0 }; }, release() {},
  };
}
