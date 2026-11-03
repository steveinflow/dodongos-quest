// Dodongo's Quest - Skull Island's HARBOR (src/stages/siharbor.js): the story's backdrop for the prologue (Ch1, "Saltmere": a storybook
// harbor town of tall crooked timber houses with red roofs climbing a hill, ships along the pier, a stone lighthouse).  Not a
// stage of the list: only src/main.js playStory draws it (SI_HARBOR in src/silevels.js), through drawBack(ctx, cam, t):
//   cam 0 = a sunny morning on the pier | cam 1 = the same pier at sunset.
// Drawn directly each call (a handful of shapes: a cutscene shows a few panels, there is no cache to free).
import { W, H, INK } from '../config.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash1 = (n) => { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
export const LEVEL_LEN = 960;
export const SECTIONS = [{ id: 'pier', name: 'The Pier', x0: 0, x1: 960 }];
export const PROP_INFO = { crate: { w: 60, h: 56, colors: ['#a07448', '#6e4a2a', '#d8b78a'] }, barrel: { w: 48, h: 60, colors: ['#8a5e38', '#5a3c22', '#c9a878'] }, urn: { w: 50, h: 58, colors: ['#c0663a', '#8a4426', '#e8a070'] } };

function ink(ctx, w = 3) { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }

export function createStage() {
  let warm = 0;
  function drawBack(ctx, cam = 0, t = 0) {
    const dusk = cam >= 0.5;
    ctx.save();
    // the sky and the sun
    const sky = ctx.createLinearGradient(0, 0, 0, 280);
    if (dusk) { sky.addColorStop(0, '#5a4a9a'); sky.addColorStop(0.5, '#e8789a'); sky.addColorStop(0.85, '#ffb070'); sky.addColorStop(1, '#ffe0a0'); }
    else { sky.addColorStop(0, '#6cc0f0'); sky.addColorStop(0.7, '#b8e4fa'); sky.addColorStop(1, '#f6f4e4'); }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 290);
    const sx = dusk ? 640 : 250, sy = dusk ? 252 : 84;
    const gl = ctx.createRadialGradient(sx, sy, 10, sx, sy, dusk ? 300 : 160); gl.addColorStop(0, dusk ? 'rgba(255,236,170,0.95)' : 'rgba(255,250,214,0.9)'); gl.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, 300);
    ctx.fillStyle = dusk ? '#fff2c0' : '#fffbe0'; ctx.beginPath(); ctx.arc(sx, sy, dusk ? 36 : 30, 0, TAU); ctx.fill();
    for (const [x, y, w] of [[130, 80, 160], [520, 56, 200], [760, 120, 140]]) { ctx.fillStyle = dusk ? 'rgba(255,190,170,0.75)' : 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(x + Math.sin(t * 0.1 + x) * 6, y, w / 2, 22, 0, 0, TAU); ctx.ellipse(x + w * 0.2, y - 14, w / 3, 20, 0, 0, TAU); ctx.fill(); }
    // the sea
    const sea = ctx.createLinearGradient(0, 262, 0, 345); sea.addColorStop(0, dusk ? '#d27a88' : '#5ab4d4'); sea.addColorStop(1, dusk ? '#5a3a6a' : '#2a78a0');
    ctx.fillStyle = sea; ctx.fillRect(0, 262, W, 90);
    ctx.fillStyle = dusk ? 'rgba(255,240,190,0.5)' : 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 18; i++) { const x = (hash1(i * 3) * 1000 + t * (4 + i % 4)) % (W + 60) - 30; ctx.fillRect(x, 270 + hash1(i * 5) * 66, 20 + hash1(i) * 30, 2); }
    // the harbor town climbing the hill at the left: crooked timber houses, red roofs
    ctx.fillStyle = dusk ? '#4a3a5a' : '#7aa86a'; ctx.beginPath(); ctx.moveTo(-10, 290); ctx.quadraticCurveTo(120, 120, 300, 200); ctx.quadraticCurveTo(380, 240, 450, 292); ctx.lineTo(-10, 292); ctx.closePath(); ctx.fill(); ink(ctx, 2.4);
    for (let i = 0; i < 11; i++) {
      const x = 8 + i * 38 + hash1(i) * 10, base = 286 - Math.max(0, 150 - Math.abs(x - 120) * 0.8) * 0.9 - 6, hh = 36 + hash1(i + 20) * 40, w = 30 + hash1(i + 40) * 14;
      ctx.fillStyle = dusk ? '#c89870' : '#f2d9a8'; ctx.beginPath(); ctx.rect(x, base - hh, w, hh); ctx.fill(); ink(ctx, 2.2);
      ctx.fillStyle = dusk ? '#b03a3a' : '#d24a3a'; ctx.beginPath(); ctx.moveTo(x - 4, base - hh); ctx.lineTo(x + w / 2 + (hash1(i) - 0.5) * 6, base - hh - 24); ctx.lineTo(x + w + 4, base - hh); ctx.closePath(); ctx.fill(); ink(ctx, 2.2);
      ctx.fillStyle = dusk ? '#ffd06a' : '#7ab4d8'; ctx.fillRect(x + 6, base - hh + 10, 8, 10); ctx.fillRect(x + w - 14, base - hh + 10, 8, 10);
    }
    // the lighthouse on its rock (right)
    ctx.fillStyle = dusk ? '#6a5a7a' : '#9a9a9a'; ctx.beginPath(); ctx.ellipse(860, 296, 80, 26, 0, 0, TAU); ctx.fill(); ink(ctx, 2.4);
    ctx.fillStyle = '#f6f2ea'; ctx.beginPath(); ctx.moveTo(838, 290); ctx.lineTo(846, 110); ctx.lineTo(874, 110); ctx.lineTo(882, 290); ctx.closePath(); ctx.fill(); ink(ctx, 2.6);
    ctx.fillStyle = '#d23a3a'; for (const y of [140, 200, 256]) { ctx.beginPath(); ctx.moveTo(843, y); ctx.lineTo(877, y); ctx.lineTo(879, y + 22); ctx.lineTo(841, y + 22); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = dusk ? '#ffe070' : '#b8e0f0'; ctx.fillRect(850, 90, 20, 22); ink(ctx, 2); ctx.fillStyle = '#4a3a3a'; ctx.beginPath(); ctx.moveTo(842, 90); ctx.lineTo(860, 66); ctx.lineTo(878, 90); ctx.closePath(); ctx.fill(); ink(ctx, 2.2);
    // the ships along the dock: hulls, masts, sails
    for (const [x, s, c] of [[560, 0.7, '#6a4228'], [700, 0.85, '#3a4a6a'], [470, 0.6, '#7a3a2a'], [300, 0.9, '#4a6a3a']]) {
      ctx.save(); ctx.translate(x, 318); ctx.scale(s, s);
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-70, -30); ctx.lineTo(70, -30); ctx.lineTo(54, 4); ctx.lineTo(-54, 4); ctx.closePath(); ctx.fill(); ink(ctx, 3);
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(-4, -150, 8, 120); ink(ctx, 2); ctx.beginPath(); ctx.rect(-4, -150, 8, 120); ink(ctx, 2);
      ctx.fillStyle = dusk ? '#ffd8b0' : '#fbf6ea'; ctx.beginPath(); ctx.moveTo(-46, -138); ctx.quadraticCurveTo(0, -122, 46, -138); ctx.lineTo(40, -60); ctx.quadraticCurveTo(0, -50, -40, -60); ctx.closePath(); ctx.fill(); ink(ctx, 2.6);
      ctx.restore();
    }
    // the pier: planks, mooring posts, rope, crates
    ctx.fillStyle = dusk ? '#8a5a42' : '#b08a5a'; ctx.fillRect(0, 340, W, H - 340);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 340, W, 10);
    for (let r = 0, y = 350; y < H; r++, y += 14 + r * 3) {
      ctx.strokeStyle = 'rgba(40,22,10,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      for (let x = ((r * 97) % 150) - 150; x < W; x += 150) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 14 + r * 3); ctx.stroke(); }
    }
    for (const x of [90, 330, 620, 870]) { ctx.fillStyle = '#5a3a22'; ctx.beginPath(); ctx.rect(x - 9, 322, 18, 40); ctx.fill(); ink(ctx, 2.6); ctx.beginPath(); ctx.ellipse(x, 322, 11, 5, 0, 0, TAU); ctx.fillStyle = '#7a5230'; ctx.fill(); ink(ctx, 2.2); }
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(90, 334); ctx.quadraticCurveTo(210, 372, 330, 334); ctx.moveTo(620, 334); ctx.quadraticCurveTo(745, 372, 870, 334); ctx.stroke();
    ctx.strokeStyle = '#c9b890'; ctx.lineWidth = 2.6; ctx.stroke();
    // (a dusk wash and the story's own warm tint)
    if (dusk) { ctx.fillStyle = 'rgba(255,120,80,0.12)'; ctx.fillRect(0, 0, W, H); }
    if (warm > 0.01) { ctx.fillStyle = `rgba(255,170,90,${0.18 * warm})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }
  return { setScale() {}, setWarm(w) { warm = clamp(+w || 0, 0, 1); }, drawBack, drawFront() {}, drawProp(ctx, kind, sx, sy) { ctx.fillStyle = '#9a6a3a'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.fillRect(sx - 22, sy - 44, 44, 44); ctx.strokeRect(sx - 22, sy - 44, 44, 44); }, info: () => ({ canvases: 0, megapixels: 0, approxMB: 0 }), release() {}, PROP_INFO };
}
