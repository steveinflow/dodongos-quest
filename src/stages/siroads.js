// Dodongo's Quest - Skull Island: THE THREE ROADS (src/stages/siroads.js), the backdrop of the book's last picture (si_epilogue): days later, back on the high cliff road above the harbor town at sunset
// (the same spot as the first page); from the heroes' feet the road splits in three and fans out across a wide land -- the LEFT path winds to far castle towers (Anastasia's home), the MIDDLE path climbs to snowy
// mountains with tiny dragons circling the peaks (Dodongo's Dragon Clan), the RIGHT path goes over rocks toward a dark far-off land under shadowy clouds (Shadow's road); far below on the right the red roofs of the harbor
// and its lighthouse, and a ship with crimson sails setting out to sea for home with a tiny figure in a scarlet coat waving from the deck.  A story-only stage: drawn LIVE each call, no cache.
//   bg.ship (0..1): how far the ship has sailed out (default 0.4); bg.glow: the sunset's strength.
import { W, H, INK } from '../config.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hash1 = (n) => { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
export const LEVEL_LEN = 960;
export const SECTIONS = [{ id: 'roads', name: 'The Three Roads', x0: 0, x1: 960 }];
export const PROP_INFO = {};
function ink(ctx, w = 3, col = INK) { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.stroke(); }

export function createStage() {
  let ship = 0.4, glow = 1;
  function road(ctx, pts, w0, w1) {   // a dirt road: a smooth ribbon (a spline through the points) that narrows with distance
    const N = 48, c = [];
    const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
    for (let k = 0; k <= N; k++) {
      const u = (k / N) * (pts.length - 1), i = Math.floor(u), f = u - i, p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const cr = (a, b, c2, d) => 0.5 * ((2 * b) + (-a + c2) * f + (2 * a - 5 * b + 4 * c2 - d) * f * f + (-a + 3 * b - 3 * c2 + d) * f * f * f);
      c.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
    }
    const L = [], Rr = [];
    for (let k = 0; k <= N; k++) {
      const a = c[Math.max(0, k - 1)], b = c[Math.min(N, k + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = lerp(w0, w1, Math.pow(k / N, 0.8)), nx = -dy / l, ny = dx / l;
      L.push([c[k][0] + nx * w, c[k][1] + ny * w * 0.5]); Rr.push([c[k][0] - nx * w, c[k][1] - ny * w * 0.5]);
    }
    ctx.beginPath(); L.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); for (let i = N; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]); ctx.closePath();
    ctx.fillStyle = '#c89a62'; ctx.fill(); ink(ctx, 2.6, 'rgba(60,30,10,0.7)');
    ctx.strokeStyle = 'rgba(255,230,170,0.5)'; ctx.lineWidth = 1.6; ctx.beginPath(); c.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
  }
  function drawBack(ctx, cam = 0, t = 0) {
    ctx.save();
    // the golden sunset sky and the low sun
    const sk = ctx.createLinearGradient(0, 0, 0, 290); sk.addColorStop(0, '#5a4aa8'); sk.addColorStop(0.45, '#e8789a'); sk.addColorStop(0.8, '#ffb070'); sk.addColorStop(1, '#ffe0a0'); ctx.fillStyle = sk; ctx.fillRect(0, 0, W, 300);
    const sg = ctx.createRadialGradient(480, 252, 8, 480, 252, 360 * glow); sg.addColorStop(0, 'rgba(255,240,180,0.95)'); sg.addColorStop(1, 'rgba(255,190,120,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, 300);
    ctx.fillStyle = '#fff2c0'; ctx.beginPath(); ctx.arc(480, 252, 34, 0, TAU); ctx.fill();
    for (let i = 0; i < 6; i++) { const x = ((i * 220 + t * 4) % (W + 300)) - 150, y = 70 + (i % 3) * 46; ctx.fillStyle = 'rgba(255,170,150,0.7)'; ctx.beginPath(); ctx.ellipse(x, y, 130, 14, 0, 0, TAU); ctx.fill(); }
    // far horizon: the three lands
    ctx.fillStyle = '#7a5a9a'; ctx.beginPath(); ctx.moveTo(0, 296); ctx.lineTo(0, 262); for (let x = 0; x <= W; x += 24) ctx.lineTo(x, 270 + 6 * Math.sin(x * 0.04)); ctx.lineTo(W, 296); ctx.closePath(); ctx.fill();
    // left: castle towers on a far hill
    ctx.fillStyle = '#6a5a98'; ctx.beginPath(); ctx.moveTo(40, 290); ctx.quadraticCurveTo(150, 232, 280, 290); ctx.closePath(); ctx.fill();
    for (const [x, h, w] of [[110, 52, 18], [140, 70, 22], [172, 46, 16], [200, 58, 18]]) { ctx.fillStyle = '#d8c0e0'; ctx.fillRect(x - w / 2, 262 - h, w, h + 4); ink(ctx, 2); ctx.fillStyle = '#c0485a'; ctx.beginPath(); ctx.moveTo(x - w / 2 - 3, 262 - h); ctx.lineTo(x, 262 - h - 18); ctx.lineTo(x + w / 2 + 3, 262 - h); ctx.closePath(); ctx.fill(); ink(ctx, 2); }
    // middle: snowy mountains with tiny dragons circling the peaks
    for (const [x, h, w] of [[380, 90, 90], [470, 120, 110], [570, 84, 90]]) { ctx.fillStyle = '#9a90c0'; ctx.beginPath(); ctx.moveTo(x - w, 290); ctx.lineTo(x, 290 - h); ctx.lineTo(x + w, 290); ctx.closePath(); ctx.fill(); ink(ctx, 2.6); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - w * 0.34, 290 - h * 0.66); ctx.lineTo(x, 290 - h); ctx.lineTo(x + w * 0.34, 290 - h * 0.66); ctx.lineTo(x + w * 0.12, 290 - h * 0.72); ctx.lineTo(x, 290 - h * 0.62); ctx.lineTo(x - w * 0.14, 290 - h * 0.72); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#3a1a3a'; for (let i = 0; i < 3; i++) { const a = t * 0.6 + i * 2.1, x = 470 + Math.cos(a) * 70, y = 148 + Math.sin(a * 1.3) * 18; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x, y - 3); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 2); ctx.closePath(); ctx.fill(); }
    // right: a dark far land under shadowy clouds
    ctx.fillStyle = '#3a2a58'; ctx.beginPath(); ctx.moveTo(660, 292); ctx.lineTo(720, 246); ctx.lineTo(760, 268); ctx.lineTo(820, 232); ctx.lineTo(880, 262); ctx.lineTo(960, 240); ctx.lineTo(960, 292); ctx.closePath(); ctx.fill(); ink(ctx, 2.6);
    for (let i = 0; i < 4; i++) { const x = 700 + i * 70, y = 190 + (i % 2) * 20; const c = ctx.createRadialGradient(x, y, 0, x, y, 90); c.addColorStop(0, 'rgba(40,20,70,0.7)'); c.addColorStop(1, 'rgba(40,20,70,0)'); ctx.fillStyle = c; ctx.fillRect(x - 90, y - 90, 180, 180); }
    // the middle ground: rolling green land
    const gr = ctx.createLinearGradient(0, 290, 0, 540); gr.addColorStop(0, '#6a9a5a'); gr.addColorStop(1, '#3a6a3a'); ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, 296); ctx.quadraticCurveTo(480, 270, 960, 296); ctx.lineTo(960, 540); ctx.lineTo(0, 540); ctx.closePath(); ctx.fill(); ink(ctx, 3);
    // the harbor far below on the right: red roofs, a lighthouse, the sea with the crimson-sailed ship
    ctx.fillStyle = '#3a78a8'; ctx.beginPath(); ctx.moveTo(700, 360); ctx.quadraticCurveTo(840, 330, 960, 350); ctx.lineTo(960, 470); ctx.lineTo(720, 470); ctx.closePath(); ctx.fill(); ink(ctx, 2.6);
    for (let i = 0; i < 7; i++) { const x = 730 + (i % 4) * 28 + (i > 3 ? 14 : 0), y = 392 + (i > 3 ? 16 : 0), w = 20, h = 14 + (i % 3) * 5; ctx.fillStyle = '#e8d0a8'; ctx.fillRect(x, y - h, w, h); ctx.fillStyle = '#b8442a'; ctx.beginPath(); ctx.moveTo(x - 3, y - h); ctx.lineTo(x + w / 2, y - h - 11); ctx.lineTo(x + w + 3, y - h); ctx.closePath(); ctx.fill(); ink(ctx, 2); }
    ctx.fillStyle = '#f0e8d8'; ctx.fillRect(918, 328, 14, 54); ink(ctx, 2); ctx.fillStyle = '#c0242a'; ctx.fillRect(916, 334, 18, 8); ctx.fillRect(916, 354, 18, 8); ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(925, 324, 7, 0, TAU); ctx.fill(); ink(ctx, 2);
    const sx = lerp(900, 780, ship), sy = lerp(440, 424, ship) + 2 * Math.sin(t * 1.6);   // (the ship, small: hull, two crimson sails, a tiny figure in scarlet waving)
    ctx.save(); ctx.translate(sx, sy); ctx.fillStyle = '#5a3a22'; ctx.beginPath(); ctx.moveTo(-26, -4); ctx.lineTo(26, -4); ctx.lineTo(18, 8); ctx.lineTo(-18, 8); ctx.closePath(); ctx.fill(); ink(ctx, 2); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-6, -34); ctx.moveTo(10, -4); ctx.lineTo(10, -26); ctx.stroke();
    ctx.fillStyle = '#d8262e'; ctx.beginPath(); ctx.moveTo(-6, -32); ctx.lineTo(-22, -10); ctx.lineTo(-6, -10); ctx.closePath(); ctx.fill(); ink(ctx, 1.6); ctx.beginPath(); ctx.moveTo(10, -24); ctx.lineTo(-2, -8); ctx.lineTo(10, -8); ctx.closePath(); ctx.fill(); ink(ctx, 1.6);
    ctx.fillStyle = '#c0242a'; ctx.fillRect(16, -14, 4, 10); ctx.fillStyle = '#e8c090'; ctx.beginPath(); ctx.arc(18, -17, 2.4, 0, TAU); ctx.fill(); ctx.strokeStyle = '#c0242a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(18, -12); ctx.lineTo(22 + 2 * Math.sin(t * 6), -20); ctx.stroke(); ctx.restore();
    // the three roads from the heroes' feet
    road(ctx, [[480, 530], [450, 470], [380, 420], [290, 372], [200, 332], [130, 298]], 34, 3);   // left: winds to the castle
    road(ctx, [[480, 530], [486, 470], [476, 410], [488, 356], [480, 322], [480, 296]], 28, 2.2);   // middle: climbs to the mountains
    road(ctx, [[480, 530], [514, 470], [584, 424], [676, 380], [770, 336], [850, 300]], 34, 3);   // right: over the rocks to the dark land
    // the cliff-top grass and rocks in the foreground
    ctx.fillStyle = '#4a7a3a'; for (let x = -20; x < W + 40; x += 38) { ctx.beginPath(); ctx.ellipse(x, 530 + 6 * hash1(x), 34, 12, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#5a5060'; ctx.beginPath(); ctx.moveTo(0, 540); ctx.lineTo(0, 470); ctx.quadraticCurveTo(70, 450, 130, 500); ctx.lineTo(110, 540); ctx.closePath(); ctx.fill(); ink(ctx, 3);
    ctx.fillStyle = 'rgba(255,170,90,0.14)'; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  return {
    setScale() {}, setWarm() {}, drawProp() {}, drawFront() {}, drawBack,
    setStory(bg) { ship = bg && bg.ship !== undefined ? clamp(bg.ship, 0, 1) : 0.4; glow = bg && bg.glow !== undefined ? clamp(bg.glow, 0.5, 1.4) : 1; },
    info() { return { canvases: 0, megapixels: 0, approxMB: 0 }; }, release() {},
  };
}
