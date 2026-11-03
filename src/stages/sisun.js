// Dodongo's Quest - Skull Island: THE PALACE OF THE SUN (src/stages/sisun.js), the backdrop of the epilogue (si_epilogue): when Malachar fell the black skull walls crumbled away and
// the white-and-gold palace stood in the sun again.  A story-only stage (no stage of the list; src/main.js playStory loads it like the harbor): drawn LIVE each call, no cache.
// Panels pick the look with bg.shot:
//   'palace' (default) the exterior in golden light: white walls, gold domes, sun banners, a stone BALCONY ledge on the right (y ~262: the King and Scarlet hug there), the courtyard below
//            bg.crumble (0..1, default 1): 0 = the black skull walls under the purple storm .. 1 = the palace in blue sky; between: black slabs breaking away, a wave of golden light
//   'hall'   the sunlit golden throne room: three tall open arches on blue sky, a gold throne, sun banners, white marble with gold inlay
//   'mirror' the hall with the tall round golden MIRROR on the right, its glass a dark vision (bg.vision: 'fortress' = a black fortress on a crag under black clouds and a tall HOODED silhouette
//            with no face -- the third wizard, only ever a shape, far away -- or 'tower' = a lonely tower in a far land, one window lit, dark shapes circling)
import { W, H, INK } from '../config.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hash1 = (n) => { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
export const LEVEL_LEN = 960;
export const SECTIONS = [{ id: 'sun', name: 'The Palace of the Sun', x0: 0, x1: 960 }];
export const PROP_INFO = {};
const GOLD = '#f2c43a', GOLDH = '#fff0a0', WHITE = '#f6f2e8', CREAM = '#e8dcc0';

function ink(ctx, w = 3, col = INK) { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.stroke(); }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function sunDisc(ctx, x, y, r, rays = 12) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, r * 0.12); ctx.lineJoin = 'round';
  for (let i = 0; i < rays; i++) { const a = i * TAU / rays; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r); ctx.lineTo(Math.cos(a) * r * 1.55, Math.sin(a) * r * 1.55); ctx.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = GOLDH; ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.25, r * 0.4, 0, TAU); ctx.fill(); ctx.restore();
}
function banner(ctx, x, y, w, h) {
  ctx.fillStyle = '#e8b030'; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h - 14); ctx.lineTo(x, y + h); ctx.lineTo(x - w / 2, y + h - 14); ctx.closePath(); ctx.fill(); ink(ctx, 3);
  sunDisc(ctx, x, y + h * 0.4, w * 0.2, 10);
}
function sky(ctx, t, k) {   // k: 1 = a bright blue sky, 0 = the storm
  const g = ctx.createLinearGradient(0, 0, 0, 380);
  g.addColorStop(0, k > 0.5 ? '#5ab0ee' : '#1a0a30'); g.addColorStop(1, k > 0.5 ? '#d8f0fc' : '#5a1a6a');
  const g2 = ctx.createLinearGradient(0, 0, 0, 380); g2.addColorStop(0, '#5ab0ee'); g2.addColorStop(1, '#e8f6fc');
  const g1 = ctx.createLinearGradient(0, 0, 0, 380); g1.addColorStop(0, '#1a0a30'); g1.addColorStop(1, '#6a1a7a');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, 400); ctx.globalAlpha = k; ctx.fillStyle = g2; ctx.fillRect(0, 0, W, 400); ctx.globalAlpha = 1; void g;
  for (let i = 0; i < 7; i++) {
    const x = ((i * 190 + t * 7) % (W + 280)) - 140, y = 60 + (i % 4) * 50, rx = 120 + (i % 3) * 40;
    ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = k > 0.5 ? '#ffffff' : '#7a2a8a'; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, TAU); ctx.ellipse(x - rx * 0.4, y + 8, rx * 0.6, rx * 0.2, 0, 0, TAU); ctx.ellipse(x + rx * 0.5, y + 6, rx * 0.5, rx * 0.2, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
}
function rays(ctx, x, y, t, a) {
  ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) { const an = i * TAU / 12 + t * 0.03, w = 0.07; ctx.fillStyle = `rgba(255,226,130,${a})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1000, an - w, an + w); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

export function createStage() {
  let shot = 'palace', crumble = 1, vision = 'fortress';
  function palace(ctx, t) {
    sky(ctx, t, crumble);
    rays(ctx, 860, 90, t, 0.05 + 0.12 * crumble);
    sunDisc(ctx, 860, 84, 30, 14);   // (up in the open corner: it used to hide behind the central tower and only its black ray tips showed)
    // distant hills, the sea
    ctx.fillStyle = '#9ad0a0'; ctx.beginPath(); ctx.moveTo(0, 330); ctx.quadraticCurveTo(70, 296, 140, 322); ctx.lineTo(140, 400); ctx.lineTo(0, 400); ctx.closePath(); ctx.fill(); ink(ctx, 3);
    // the palace: a white keep with gold-domed towers, a great arched gate, sun banners
    const wall = (x, w, y, h, dome) => { ctx.fillStyle = WHITE; ctx.fillRect(x, y, w, h); ink(ctx, 3.4); ctx.strokeRect(x, y, w, h); ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x + w * 0.7, y, w * 0.3, h); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x, y, w * 0.14, h);
      for (let k = 0; k < Math.max(1, Math.floor(w / 36)); k++) { ctx.fillStyle = '#7ab4e0'; rr(ctx, x + 12 + k * 36, y + 20, 14, 30, 7); ctx.fill(); ink(ctx, 2); }
      ctx.fillStyle = GOLD; ctx.fillRect(x - 4, y - 7, w + 8, 10); ink(ctx, 2.6);
      if (dome) { ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(x - 2, y - 7); ctx.quadraticCurveTo(x + w / 2, y - 7 - dome * 1.5, x + w + 2, y - 7); ctx.closePath(); ctx.fill(); ink(ctx, 3); ctx.fillStyle = GOLDH; ctx.beginPath(); ctx.arc(x + w / 2, y - 7 - dome * 1.25, 5, 0, TAU); ctx.fill(); ink(ctx, 2.4); } };
    wall(200, 560, 200, 200, 0);
    wall(150, 110, 120, 280, 70); wall(700, 110, 120, 280, 70); wall(380, 130, 90, 120, 90); wall(300, 100, 168, 80, 50); wall(560, 100, 168, 80, 50);
    // the great gate
    ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.moveTo(430, 440); ctx.lineTo(430, 340); ctx.quadraticCurveTo(480, 290, 530, 340); ctx.lineTo(530, 440); ctx.closePath(); ctx.fill(); ink(ctx, 3.4); sunDisc(ctx, 480, 372, 14, 10);
    banner(ctx, 345, 214, 38, 90); banner(ctx, 615, 214, 38, 90);
    // the courtyard and the balcony ledge on the right
    ctx.fillStyle = CREAM; ctx.fillRect(0, 400, W, H - 400); ink(ctx, 3); ctx.strokeRect(-4, 400, W + 8, H); ctx.strokeStyle = 'rgba(220,170,60,0.8)'; ctx.lineWidth = 4; for (let x = 0; x < W; x += 96) { ctx.beginPath(); ctx.moveTo(x, 400); ctx.lineTo(x - 40, H); ctx.stroke(); }
    ctx.beginPath();   // (the next ink() used to stroke the last floor line again, in black)
    ctx.fillStyle = WHITE; ctx.fillRect(700, 262, 260, 16); ink(ctx, 3.4); ctx.strokeRect(700, 262, 260, 16); ctx.fillStyle = '#f8f4e8'; for (let x = 706; x < 940; x += 34) { rr(ctx, x, 214, 16, 48, 5); ctx.fill(); ink(ctx, 2.4); }
    ctx.fillStyle = WHITE; ctx.fillRect(700, 206, 260, 12); ink(ctx, 3); ctx.strokeRect(700, 206, 260, 12);
    // the black skull and the storm, breaking away
    if (crumble < 1) {
      const c = clamp(crumble, 0, 1);
      // the skull's black wall: a grid of stone blocks, each breaking loose (and falling) at its own moment -- what is left stays solid, so it reads as a wall crumbling away
      const cw = 96, ch = 60, cols = Math.ceil(W / cw), rows = 8;
      for (let ry = 0; ry < rows; ry++) for (let cxi = 0; cxi < cols; cxi++) {
        const n = ry * 31 + cxi * 7, th = 0.06 + 0.6 * (0.4 * hash1(n + 5) + 0.4 * Math.abs((cxi + 0.5) / cols - 0.5) * 2 + 0.2 * (ry / rows)), u = clamp((c - th) / 0.28, 0, 1);
        if (u >= 1) continue;
        const x = cxi * cw + (ry % 2 ? cw / 2 : 0) - cw / 2, y = ry * ch;
        ctx.save(); ctx.translate(x + cw / 2, y + ch / 2 + 360 * u * u); ctx.rotate(u * (hash1(n + 9) - 0.5) * 1.6); ctx.globalAlpha = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;   // (solid stone until it is nearly gone: translucent slabs looked like an overlay glitch)
        ctx.fillStyle = '#1c1228'; ctx.fillRect(-cw / 2, -ch / 2, cw, ch); ctx.strokeStyle = '#3a2252'; ctx.lineWidth = 3; ctx.strokeRect(-cw / 2 + 1.5, -ch / 2 + 1.5, cw - 3, ch - 3);
        ctx.fillStyle = 'rgba(160,100,230,0.12)'; ctx.fillRect(-cw / 2 + 4, -ch / 2 + 4, cw - 8, 6);
        ctx.restore();
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const wr = 80 + 900 * smooth(c), wg = ctx.createRadialGradient(480, 260, wr * 0.55, 480, 260, wr); wg.addColorStop(0, 'rgba(255,226,130,0)'); wg.addColorStop(0.85, `rgba(255,226,130,${0.5 * (1 - c)})`); wg.addColorStop(1, 'rgba(255,226,130,0)'); ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
  }
  const smooth = (u) => u * u * (3 - 2 * u);
  function hall(ctx, t, withMirror) {
    // the open sky through three tall arches
    sky(ctx, t, 1);
    ctx.fillStyle = '#f2ead4'; ctx.fillRect(0, 0, W, 400);
    for (let k = 0; k < 3; k++) {
      const cx = 170 + k * 310, w = 190, top = 60;
      ctx.save(); ctx.beginPath(); ctx.moveTo(cx - w / 2, 380); ctx.lineTo(cx - w / 2, top + w / 2); ctx.arc(cx, top + w / 2, w / 2, Math.PI, 0); ctx.lineTo(cx + w / 2, 380); ctx.closePath(); ctx.clip();
      sky(ctx, t, 1); ctx.restore();
      ctx.beginPath(); ctx.moveTo(cx - w / 2, 380); ctx.lineTo(cx - w / 2, top + w / 2); ctx.arc(cx, top + w / 2, w / 2, Math.PI, 0); ctx.lineTo(cx + w / 2, 380); ink(ctx, 5);
      ctx.strokeStyle = GOLD; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    }
    // pillars with gold capitals, sun banners
    for (const x of [18, 332, 648, 942]) { ctx.fillStyle = WHITE; ctx.fillRect(x - 22, 0, 44, 390); ink(ctx, 3.4); ctx.strokeRect(x - 22, 0, 44, 390); ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x + 4, 0, 18, 390); ctx.fillStyle = GOLD; ctx.fillRect(x - 28, 0, 56, 22); ink(ctx, 2.6); ctx.strokeRect(x - 28, 0, 56, 22); ctx.fillStyle = GOLD; ctx.fillRect(x - 28, 372, 56, 18); ink(ctx, 2.6); ctx.strokeRect(x - 28, 372, 56, 18); }
    banner(ctx, 332, 40, 56, 130); banner(ctx, 648, 40, 56, 130);
    // the golden throne in the middle arch
    if (!withMirror) { ctx.save(); ctx.translate(480, 380); ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(-50, -110); ctx.lineTo(-30, -150); ctx.lineTo(0, -128); ctx.lineTo(30, -150); ctx.lineTo(50, -110); ctx.lineTo(50, 0); ctx.closePath(); ctx.fill(); ink(ctx, 3.4); ctx.fillStyle = '#c0242a'; ctx.fillRect(-36, -62, 72, 40); ink(ctx, 2.6); ctx.strokeRect(-36, -62, 72, 40); sunDisc(ctx, 0, -100, 14, 10); ctx.restore(); }
    // the floor: white marble with gold inlay
    ctx.fillStyle = CREAM; ctx.fillRect(0, 380, W, H - 380); ink(ctx, 3); ctx.strokeRect(-4, 380, W + 8, H);
    ctx.strokeStyle = 'rgba(220,170,60,0.85)'; ctx.lineWidth = 5; for (let x = -200; x < W + 200; x += 110) { ctx.beginPath(); ctx.moveTo(480 + (x - 480) * 0.35, 380); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,226,130,0.12)'; ctx.fillRect(0, 380, W, 160);
  }
  function mirrorGlass(ctx, t) {
    const cx = 770, cy = 250;
    // the stand and the round golden frame
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(cx - 60, 392); ctx.lineTo(cx - 36, 340); ctx.lineTo(cx + 36, 340); ctx.lineTo(cx + 60, 392); ctx.closePath(); ctx.fill(); ink(ctx, 3.4);
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.ellipse(cx, cy, 138, 168, 0, 0, TAU); ctx.fill(); ink(ctx, 5);
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, 116, 146, 0, 0, TAU); ctx.clip();
    if (vision === 'tower') {   // a lonely tower in a far land: strange mountains, one window lit, dark shapes circling
      const g = ctx.createLinearGradient(0, cy - 150, 0, cy + 150); g.addColorStop(0, '#4a3a8a'); g.addColorStop(1, '#a86aa0'); ctx.fillStyle = g; ctx.fillRect(cx - 120, cy - 150, 240, 300);
      ctx.fillStyle = '#1a1030'; ctx.beginPath(); ctx.moveTo(cx - 120, cy + 100); ctx.lineTo(cx - 70, cy + 10); ctx.lineTo(cx - 30, cy + 70); ctx.lineTo(cx + 40, cy - 10); ctx.lineTo(cx + 120, cy + 90); ctx.lineTo(cx + 120, cy + 150); ctx.lineTo(cx - 120, cy + 150); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0e0820'; ctx.fillRect(cx - 16, cy - 90, 32, 170); ctx.beginPath(); ctx.moveTo(cx - 22, cy - 90); ctx.lineTo(cx, cy - 130); ctx.lineTo(cx + 22, cy - 90); ctx.closePath(); ctx.fill();
      { const wg = ctx.createRadialGradient(cx, cy - 52, 2, cx, cy - 52, 44); wg.addColorStop(0, 'rgba(255,226,120,0.85)'); wg.addColorStop(1, 'rgba(255,200,80,0)'); ctx.fillStyle = wg; ctx.fillRect(cx - 50, cy - 100, 100, 96); }
      ctx.fillStyle = '#ffd860'; ctx.fillRect(cx - 5, cy - 60, 10, 16);

      for (let i = 0; i < 5; i++) { const a = t * 0.8 + i * 1.3, x = cx + Math.cos(a) * 64, y = cy - 80 + Math.sin(a) * 22; ctx.fillStyle = '#0a0614'; ctx.beginPath(); ctx.ellipse(x, y, 9, 4, 0, 0, TAU); ctx.fill(); }
    } else if (vision === 'smoke') {   // dark smoke swirling in the glass: the voice of Malachar's master (the first thing the King shows)
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 160); g.addColorStop(0, '#5a2a8a'); g.addColorStop(1, '#170a26'); ctx.fillStyle = g; ctx.fillRect(cx - 120, cy - 150, 240, 300);
      for (let i = 0; i < 10; i++) {
        const a = t * 0.45 + i * 0.63, r = 16 + (i % 5) * 20, x = cx + Math.cos(a) * r * 1.1, y = cy + Math.sin(a * 1.15) * r * 1.5, rr = 40 + (i % 3) * 12;
        const sg = ctx.createRadialGradient(x, y, 2, x, y, rr); sg.addColorStop(0, i % 3 ? 'rgba(10,4,20,0.8)' : 'rgba(200,140,255,0.32)'); sg.addColorStop(1, 'rgba(10,4,20,0)'); ctx.fillStyle = sg; ctx.fillRect(cx - 120, cy - 150, 240, 300);
      }
    } else {   // a black fortress on a crag under black clouds; in front, backlit by a cold glow, a tall hooded silhouette with no face (only ever a shape, far away)
      const g = ctx.createLinearGradient(0, cy - 150, 0, cy + 150); g.addColorStop(0, '#3a2268'); g.addColorStop(1, '#8a4a9a'); ctx.fillStyle = g; ctx.fillRect(cx - 120, cy - 150, 240, 300);
      const gl = ctx.createRadialGradient(cx + 44, cy - 24, 6, cx + 44, cy - 24, 124); gl.addColorStop(0, 'rgba(244,226,255,0.95)'); gl.addColorStop(0.4, 'rgba(190,150,245,0.6)'); gl.addColorStop(1, 'rgba(120,70,200,0)'); ctx.fillStyle = gl; ctx.fillRect(cx - 120, cy - 150, 240, 300);
      // the crag: a peak on the left (the fortress), a flat ledge on the right (where the figure stands)
      ctx.fillStyle = '#05030a'; ctx.beginPath(); ctx.moveTo(cx - 120, cy + 150); ctx.lineTo(cx - 120, cy + 20); ctx.lineTo(cx - 92, cy - 16); ctx.lineTo(cx - 66, cy - 60); ctx.lineTo(cx - 10, cy - 70); ctx.lineTo(cx + 8, cy - 30); ctx.lineTo(cx + 30, cy + 42); ctx.lineTo(cx + 120, cy + 42); ctx.lineTo(cx + 120, cy + 150); ctx.closePath(); ctx.fill();
      ctx.fillRect(cx - 88, cy - 126, 76, 60); ctx.fillRect(cx - 94, cy - 150, 16, 90); ctx.fillRect(cx - 22, cy - 156, 16, 96);
      ctx.beginPath(); ctx.moveTo(cx - 98, cy - 150); ctx.lineTo(cx - 86, cy - 176); ctx.lineTo(cx - 74, cy - 150); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - 26, cy - 156); ctx.lineTo(cx - 14, cy - 184); ctx.lineTo(cx - 2, cy - 156); ctx.closePath(); ctx.fill();
      for (const x of [-80, -60, -40, -20]) ctx.fillRect(cx + x - 5, cy - 138, 10, 14);
      ctx.fillStyle = '#c040d8'; ctx.fillRect(cx - 62, cy - 104, 6, 10); ctx.fillRect(cx - 42, cy - 98, 6, 10); ctx.fillRect(cx - 18, cy - 118, 5, 9);
      // the hooded figure: a tall robe, a pointed hood with an empty dark opening, a pale rim of light round it so its shape reads against the glow
      const fx = cx + 66, fy = cy + 42;
      ctx.fillStyle = '#1c0e34'; ctx.strokeStyle = '#d8b8ff'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(fx - 28, fy); ctx.quadraticCurveTo(fx - 26, fy - 54, fx - 15, fy - 72); ctx.quadraticCurveTo(fx - 17, fy - 88, fx - 10, fy - 98); ctx.quadraticCurveTo(fx - 4, fy - 112, fx, fy - 120); ctx.quadraticCurveTo(fx + 4, fy - 112, fx + 10, fy - 98); ctx.quadraticCurveTo(fx + 17, fy - 88, fx + 15, fy - 72); ctx.quadraticCurveTo(fx + 26, fy - 54, fx + 28, fy); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(fx, fy - 90, 6.5, 10, 0, 0, TAU); ctx.fill();
    }
    const sm = ctx.createRadialGradient(cx - 40, cy - 60, 10, cx, cy, 160); sm.addColorStop(0, 'rgba(255,255,255,0.15)'); sm.addColorStop(1, 'rgba(0,0,0,0.3)'); ctx.fillStyle = sm; ctx.fillRect(cx - 120, cy - 150, 240, 300);
    // the dark smoke at the edges
    for (let i = 0; i < 6; i++) { const a = t * 0.3 + i, x = cx + Math.cos(a * 1.3) * 80, y = cy + Math.sin(a) * 110; const c = ctx.createRadialGradient(x, y, 0, x, y, 50); c.addColorStop(0, 'rgba(30,10,50,0.55)'); c.addColorStop(1, 'rgba(30,10,50,0)'); ctx.fillStyle = c; ctx.fillRect(x - 50, y - 50, 100, 100); }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx, cy, 116, 146, 0, 0, TAU); ink(ctx, 4);
  }
  function drawBack(ctx, cam = 0, t = 0) {
    ctx.save();
    if (shot === 'hall') hall(ctx, t, false);
    else if (shot === 'mirror') { hall(ctx, t, true); mirrorGlass(ctx, t); }
    else palace(ctx, t);
    ctx.restore();
  }
  return {
    setScale() {}, setWarm() {}, drawProp() {}, drawFront() {}, drawBack,
    setStory(bg) { shot = (bg && bg.shot) || 'palace'; crumble = bg && bg.crumble !== undefined ? clamp(bg.crumble, 0, 1) : 1; vision = (bg && bg.vision) || 'fortress'; },
    info() { return { canvases: 0, megapixels: 0, approxMB: 0 }; }, release() {},
  };
}
