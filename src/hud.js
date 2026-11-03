// HUD and every full-screen card: title menu, character select, level select, controls, stage/boss cards,
// pause, continue, level clear, the end.
import { W, H, INK, PLAYER_COLS, FLOOR_TOP } from './config.js';
import { PAL } from './sipalace_layout.js';   // (Book Two's palace: the King's crystal -- the boss bar keeps off it)
import { DODGE } from './player.js';
import { progress, progressLine, queenReady, counterLine } from './secrets.js';
import { TAU, clamp } from './rig.js';
import { CHARS } from './chars.js';
import { HEROES, HERO_IDS, baseOf } from './heroes.js';
import { LEVELS } from './levels.js';
import { quest, isMM, isSI, SI_ENABLED } from './quests.js';
import { drawSelectLoop } from './showcase.js';
import { QUEEN_TEASER } from './story.js';

const FONT_T = '"Luckiest Guy", Bangers, Impact, sans-serif';
const FONT_B = 'Bangers, Impact, sans-serif';
const FONT_C = '"Comic Neue", "Comic Sans MS", sans-serif';

export function outlined(ctx, text, x, y, size, fill, font = FONT_B, lw = 0.22, align = 'left') {
  ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round'; ctx.lineWidth = size * lw; ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function panel(ctx, img, x, y, w, h, rot = 0, crop) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-w / 2 + 8, -h / 2 + 10, w, h);
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12);
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12);
  if (img) {
    if (crop) ctx.drawImage(img, crop[0], crop[1], crop[2], crop[3], -w / 2, -h / 2, w, h);
    else ctx.drawImage(img, -w / 2, -h / 2, w, h);
  }
  ctx.lineWidth = 3; ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}
function caption(ctx, text, x, y, w, alpha = 1, size = 22) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = `bold ${size}px ${FONT_C}`;
  const lines = wrap(ctx, text, w - 28);
  const h = lines.length * (size + 6) + 22;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 6, y + 7, w, h);
  ctx.fillStyle = '#ffe58a'; ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x + 14, y + 12 + i * (size + 6)));
  ctx.restore();
  return h;
}
function wrap(ctx, text, w) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, h / 2, Math.max(0, w) / 2));
  else ctx.rect(x, y, w, h);
}
const KEY_SANS = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';   // (src/input.js's glyph face)
/** Book Two: a keyboard key on a keycap of its own height h (the shared glyph's look -- its rim, face and bevel), with a px
 *  label -- the shared glyph ties its label to 0.47 of its height (12.7 px at 3-4P on the select: QAF3).  A punctuation key
 *  -- P3's ".", P3's "'" SUPER -- is drawn as a fat mark on a cap the size of the others (a "." or "'" as text read as a blank
 *  key with a speck on a TV: the QAF3 critics).  siKeyLabel: the label when the action's glyph is such a key, else null. */
export function siKeyLabel(app, act, ctrl) {
  const cid = !ctrl || ctrl === 'any' ? app.lastCtrl : ctrl;   // ('any' -- a 1P slot -- is whatever was used last: on an iPad, touch)
  if (!cid || cid === 'touch') return null;   // (touch: no key -- input.glyph('any') answered a keyboard key, so an iPad read "[Enter] to pick": the RC tech gate)
  let g = null; try { g = app.input?.glyph?.(act, cid); } catch { /* none */ }
  return g && g.kind === 'keyboard' && g.shape === 'key' && !g.dir && g.text ? g.text : null;
}
export function siKeyW(ctx, s, h, px) {
  if (/^[^A-Za-z0-9\s]$/.test(s)) return h;
  ctx.save(); ctx.font = `700 ${px}px ${KEY_SANS}`; const w = Math.max(h, Math.ceil(ctx.measureText(s).width) + 14); ctx.restore();
  return w;
}
export function siKeycap(ctx, s, x, y, w, h, px) {
  const lw = Math.max(1.4, h * 0.07), bevel = Math.round(h * 0.14), r = h * 0.22, fh = h - lw * 3 - bevel, fy = y - h / 2 + lw * 1.5 + fh / 2;
  ctx.save();
  roundRect(ctx, x - w / 2 + lw / 2, y - h / 2 + lw / 2, w - lw, h - lw, r); ctx.fillStyle = '#a59b86'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
  roundRect(ctx, x - w / 2 + lw * 1.5, y - h / 2 + lw * 1.5, w - lw * 3, fh, r * 0.8); ctx.fillStyle = '#f6f0e3'; ctx.fill();
  ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineCap = 'round';
  if (s === '.' || s === ',') {   // (a fat dot -- with a tail for a comma)
    const dr = Math.max(2.6, h * 0.15);
    ctx.beginPath(); ctx.arc(x, fy, dr, 0, TAU); ctx.fill();
    if (s === ',') { ctx.lineWidth = dr * 0.9; ctx.beginPath(); ctx.moveTo(x + dr * 0.55, fy + dr * 0.3); ctx.quadraticCurveTo(x + dr * 0.4, fy + dr * 2, x - dr * 0.6, fy + dr * 2.4); ctx.stroke(); }
  } else if (s === "'") {   // (a fat tick)
    ctx.lineWidth = Math.max(2.6, h * 0.15); ctx.beginPath(); ctx.moveTo(x, fy - fh * 0.3); ctx.lineTo(x, fy + fh * 0.12); ctx.stroke();
  } else {
    const big = /^[^A-Za-z0-9\s]$/.test(s);   // (; / and the like: half again as big)
    ctx.font = `700 ${big ? Math.round(px * 1.5) : px}px ${KEY_SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(s), a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent;
    ctx.fillText(s, x, fy + (Number.isFinite(a) && Number.isFinite(d) ? (a - d) / 2 : px * 0.35));
  }
  ctx.restore();
}
function bar(ctx, x, y, w, h, f, trail, col) {
  ctx.fillStyle = '#2b1e2a'; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  if (trail > f) { ctx.fillStyle = '#ffffff'; roundRect(ctx, x + 2, y + 2, Math.max(0, (w - 4) * clamp(trail, 0, 1)), h - 4, (h - 4) / 2); ctx.fill(); }
  if (f > 0) {
    ctx.fillStyle = col; roundRect(ctx, x + 2, y + 2, Math.max(h - 4, (w - 4) * clamp(f, 0, 1)), h - 4, (h - 4) / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; roundRect(ctx, x + 5, y + 3, Math.max(0, (w - 10) * clamp(f, 0, 1)), (h - 4) * 0.35, 2); ctx.fill();
  }
  ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
}
const hpColour = (f) => (f > 0.5 ? '#5fd35f' : f > 0.25 ? '#ffc93a' : '#ff5a3a');
const blink = (t, on = 1.3) => isSI() || (t * 2) % 2 < on;   // (Book Two: never off -- the prompt pulses instead: sipulse)
/** Book Two: a prompt's pulse (no on / off blink: flash safety) -- its alpha set on ctx; the caller saves / restores */
const sipulse = (ctx, t) => { if (isSI()) ctx.globalAlpha *= 0.62 + 0.38 * Math.sin(t * 3.4); };

/** draw a hero rig at (x, y) feet */
/** a hero's HUD portrait (r: half its size): the painted portrait; Dragon Dodongo (no portrait painted): his wing beat,
 * drawn small in the box over his colour */
/** Book Two's own copies of Scarlet's title card and HUD portrait, under the other heroes' blue sky instead of her
 * grey studio backdrop (review/si_aa_fx/matte_scarlet.py; the originals are Book 3's) -- loaded the first time a Book Two
 * screen asks, the original drawn until they are in */
const SI_ART = { title_sca: 'title_sca_si.jpg', portrait_scarlet: 'portrait_sca_si.png' };
function siImg(app, key) {
  if (!isSI() || !SI_ART[key]) return app.img[key];
  const k = key + '_si', got = app.img[k];
  if (got) return got;
  if (!app._siArtReq?.[k] && typeof Image !== 'undefined') {
    (app._siArtReq ||= {})[k] = true;
    const im = new Image(); im.onload = () => { app.img[k] = im; }; im.src = 'assets/art/' + SI_ART[key];
  }
  return app.img[key];
}
function portraitFill(ctx, app, id, r) {
  const H = HEROES[id];
  if (H?.form && H.base) {                            // a secret form: its hero's portrait in the form's glow
    const img = siImg(app, 'portrait_' + H.base);
    if (img) ctx.drawImage(img, -r, -r, r * 2, r * 2); else { ctx.fillStyle = H.accent; ctx.fillRect(-r, -r, r * 2, r * 2); }
    ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = H.accent; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
    // (a form reads as a form: a gold frame inside the player's, and its own little icon in the corner -- the tint alone
    //  left the Archmage and the Pirate looking like their heroes)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = H.accent; ctx.lineWidth = 4; ctx.strokeRect(-r + 2, -r + 2, r * 2 - 4, r * 2 - 4); ctx.restore();
    ctx.lineWidth = 3.2; ctx.strokeStyle = '#ffd23a'; ctx.strokeRect(-r + 1.6, -r + 1.6, r * 2 - 3.2, r * 2 - 3.2);
    ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.strokeRect(-r + 3.6, -r + 3.6, r * 2 - 7.2, r * 2 - 7.2);
    const ix = r - 10, iy = -r + 10, ik = Math.max(0.7, r / 32);
    ctx.save(); ctx.translate(ix, iy); ctx.scale(ik, ik); ctx.lineWidth = 1.6; ctx.strokeStyle = INK;
    if (H.form === 'pirate') {           // a gold doubloon, crossbones on it
      ctx.fillStyle = '#ffc23a'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(4, -4); ctx.lineTo(-4, 4); ctx.stroke();
    } else if (H.form === 'legend') {    // a lightning bolt
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(-5, 1); ctx.lineTo(0, 1); ctx.lineTo(-3, 9); ctx.lineTo(6, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {                              // a star (the Archmage)
      ctx.fillStyle = '#fff6c8'; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? 3.5 : 8, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const img = siImg(app, 'portrait_' + id);
  if (img) { ctx.drawImage(img, -r, -r, r * 2, r * 2); return; }
  ctx.fillStyle = HEROES[id]?.accent || '#888'; ctx.fillRect(-r, -r, r * 2, r * 2);
  if (id === 'dragon') {
    ctx.save(); ctx.beginPath(); ctx.rect(-r, -r, r * 2, r * 2); ctx.clip();
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.4); g.addColorStop(0, '#ffe9a0'); g.addColorStop(1, '#ff7a2a'); ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
    // (his face, not his wings and legs: drawn big, the head -- about (30, -96) at scale 1 -- in the frame's middle)
    const k = r / 21; drawHero(ctx, 'dragon', 'idle', 0, -30 * k + r * 0.05, 96 * k + r * 0.12, k, 1, 0);
    ctx.restore();
  }
}
/** a secret form's glow behind it on its card: its colour, light rising */
function formCardAura(ctx, H0, x, y, t) {
  const rgb = [1, 3, 5].map((i) => parseInt(H0.accent.slice(i, i + 2), 16)).join(',');
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y - 90, 8, x, y - 90, 130);
  g.addColorStop(0, `rgba(${rgb},0.45)`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 90, 90, 130, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 8; i++) {
    const u = (t * 0.5 + i / 8) % 1, sx = x + Math.sin(i * 2.3 + t) * 60, sy = y - u * 220;
    ctx.fillStyle = `rgba(${rgb},${0.8 * Math.sin(u * Math.PI)})`; ctx.beginPath(); ctx.arc(sx, sy, 2.5 + (i % 3), 0, TAU); ctx.fill();
  }
  ctx.restore();
}
/** a secret form just unlocked in play: a hand-lettered sign drops in, hung under the HUD band -- never over a name, a
 *  meter or the score (1-4P, every book: at 128 it lay on Book Three's 4P score and Book Two's 2P SUPER row) nor Book Two's
 *  invite chip (drawn under the band before it); it eases down when the band grows (src/main.js stepUnlock; U.line: its
 *  second line, a 6-year-old's words -- Press, or Tap on touch) */
export function drawUnlock(ctx, app) {
  const U = app.unlockToast; if (!U) return;
  const t = U.t, a = Math.min(1, t / 12, (330 - t) / 20) * (U.vis ?? 1), drop = t < 14 ? (1 - t / 14) * -60 : 0;
  const H0 = HEROES[U.id], hero = HEROES[U.base]?.name || 'your hero', w = app.world;
  if (a <= 0) { if (w) w._signBottom = 0; return; }   // (stepped aside: a cut-in or a TEAM UP! invite is up -- main.js stepUnlock)
  const hb = Math.max(w?._hudBottom || 84, 84), want = Math.max(128, hb + 53);   // (the board's top, tilted, clear of the band by ~4 px)
  U.y = U.y == null ? want : U.y + (want - U.y) * 0.25;
  const y = U.y + drop, bh = 86, l2 = U.line || `Press ▲▼ on ${hero}'s card to power up!`;
  ctx.save(); ctx.globalAlpha = Math.max(0, a);
  ctx.translate(U.x ?? W / 2, y); ctx.rotate(-0.03);   // (U.x: the middle -- beside a boss's face in its fight, src/main.js signPlace)
  ctx.font = `bold 18px ${FONT_C}`; const w2 = ctx.measureText(l2).width;
  ctx.font = `30px ${FONT_T}`;
  const l1 = (U.name || '') + ' UNLOCKED!', bw = Math.max(ctx.measureText(l1).width + 44, w2 + 48, 420);
  U.bw = bw;   // (its width: src/main.js signPlace keeps it off a boss's face)
  const s0 = Math.max(-bh / 2 - 26, hb - y);   // (its strings: from the band's foot down to the board)
  ctx.fillStyle = '#7a5230'; if (s0 < -bh / 2) { ctx.fillRect(-90, s0, 8, -bh / 2 + 4 - s0); ctx.fillRect(82, s0, 8, -bh / 2 + 4 - s0); }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-bw / 2 + 6, -bh / 2 + 7, bw, bh);
  ctx.fillStyle = '#fff1cf'; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.lineWidth = 4; ctx.strokeStyle = H0?.accent || '#7a5230'; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
  ctx.fillStyle = '#d2451e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(l1, 0, -12);
  ctx.font = `bold 18px ${FONT_C}`; ctx.fillStyle = INK;
  ctx.fillText(l2, 0, 23);   // (U.line: src/main.js powerLine -- "Press ▲▼ on Dodongo's card to power up!", Tap on touch)
  ctx.restore();
  if (w) w._signBottom = Math.ceil(y + bh / 2 + 10);   // (next frame's words and balloons stay under it: src/game.js fx.hudTop)
}
function drawHero(ctx, id, anim, arg, x, y, s, facing = 1, t = 0, mem) {
  const art = CHARS[HEROES[id]?.art || id];
  if (!art) return;
  const A = art.ANIM || {};
  let f = A[anim]; if (f === undefined) f = A.idle;
  const pose = typeof f === 'function' ? f(arg) : (f || {});
  if (mem) mem.frame = Math.round(t * 60);   // springs step on the menu clock
  ctx.save(); ctx.translate(x, y);
  art.draw(ctx, pose, { facing, t, scale: s, mem, vel: { x: 0, y: 0, z: 0 } });
  ctx.restore();
}

function stageBackdrop(ctx, app, camX, dim) {
  // (the quest's first stage: src/main.js titleBack; Mystic Mountain's end card: the Dawn valley, in colour -- endBack)
  // (Mystic Mountain's STAGE CLEAR: the stage just cleared, where the fight ended -- the summit after its storm)
  const clearSt = app.scene === 'clear' && (isMM() || isSI()) && app.world?.stage?.drawBack ? app.world.stage : null;
  if (clearSt) camX = app.world.camX;
  const st = clearSt || (app.scene === 'end' && (isMM() || isSI()) && app.endBack) || (app.titleBack ? app.titleBack() : app.titleStage);
  // (a stage that throws -- WebKit with its canvas memory spent, QAF_tech N1 -- falls back to the plain sky, as World.render's drawBack: logged
  //  once, the stage tried again after 2 s; the menu over it always draws)
  let ok = !!st && !(stageBackdrop.failSt === st && performance.now() - stageBackdrop.failAt < 2000);
  if (ok) {
    try { st.setWarm?.(0); st.drawBack(ctx, camX, app.time); st.drawFront?.(ctx, camX, app.time); }
    catch (e) { ok = false; stageBackdrop.failSt = st; stageBackdrop.failAt = performance.now(); if (!stageBackdrop.err) { stageBackdrop.err = 1; console.error('stageBackdrop', e); } }
  }
  if (!ok) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a2350'); g.addColorStop(1, '#f0a46a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const sh = ctx.createLinearGradient(0, 0, W * 0.75, 0);
  sh.addColorStop(0, `rgba(20,12,34,${dim})`); sh.addColorStop(1, `rgba(20,12,34,${dim * 0.35})`);
  ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
}

function menuList(ctx, items, sel, x, y, app, size = 30, gap = 44) {
  // (each row's tap box, game px: a tap on a row picks it -- src/main.js; reset every frame by App.render)
  if (app) app._menuRows = items.map((it, i) => { const c = y + i * gap - size / 2 + 7; return { i, x0: x - 44, x1: x + 384, y0: c - gap / 2, y1: c + gap / 2 }; });
  if (isSI() && app) siFocus(ctx, app, items, sel, x, y, size, gap);   // (Book Two: the focus pill slides to the row; a press flashes it)
  items.forEach((it, i) => {
    const on = i === sel;
    const yy = y + i * gap;
    if (on && !(isSI() && app)) {
      ctx.fillStyle = 'rgba(255,214,90,0.18)'; roundRect(ctx, x - 14, yy - size + 2, 360, size + 12, 10); ctx.fill();
      outlined(ctx, '▶', x - 6, yy, size * 0.8, '#ffd23a', FONT_B, 0.22, 'right');
    }
    const tally = it.disabled && isSI() && /^SECRETS:/.test(it.label);   // (Skull Island's secrets tally: a gold row with a doubloon, not a greyed 'locked' one)
    if (tally) { ctx.font = `${size}px ${FONT_B}`; doubloon(ctx, x + 10 + ctx.measureText(it.label).width + size * 0.6, yy - size * 0.34, size * 0.36, 0); }
    outlined(ctx, it.label, x + 10, yy, size, it.disabled ? (it.color || (tally ? '#ffb84a' : '#8a8494')) : on ? '#ffe066' : '#fff1d6', FONT_B, 0.22);
    if (it.sub) { ctx.font = `bold 14px ${FONT_C}`; ctx.fillStyle = 'rgba(255,240,210,0.85)'; ctx.textAlign = 'left'; ctx.fillText(it.sub, x + 14 + ctx.measureText(it.label).width * 0 + 220, yy - 6); }
  });
}

// ================================================================================================ title
export function drawTitle(ctx, app) {
  const t = app.time;
  stageBackdrop(ctx, app, 260 + Math.sin(t * 0.05) * 200, 0.6);
  // the trio as comic panels
  const img = app.img;
  // (Book Two: the cards a few px lower where the corner buttons -- inset in the TV's safe area -- would touch Shadow's top
  //  edge, ~63 at the rotation; nothing to clear while a pad plays: app.cornerBox null)
  const CB = isSI() ? app.cornerBox?.() : null, cdy = CB && CB.x0 < 832 ? Math.max(0, Math.ceil(CB.y1 + 4 - 63)) : 0;
  ctx.save(); ctx.translate(0, cdy);
  panel(ctx, img.title_ana, 476, 70, 104, 140, -0.05, img.title_ana && [img.title_ana.width * 0.18, img.title_ana.height * 0.02, img.title_ana.width * 0.7, img.title_ana.width * 0.7 * 140 / 104]);
  panel(ctx, img.title_sha, 728, 70, 104, 140, 0.05, img.title_sha && [img.title_sha.width * 0.14, img.title_sha.height * 0.02, img.title_sha.width * 0.7, img.title_sha.width * 0.7 * 140 / 104]);
  const tsca = siImg(app, 'title_sca');
  if (!isMM()) panel(ctx, tsca, 842, 84, 100, 134, -0.04, tsca && [tsca.width * 0.15, tsca.height * 0.02, tsca.width * 0.7, tsca.width * 0.7 * 134 / 100]);   // (Mystic Mountain: the trio)
  panel(ctx, img.title, 574, 40, 150, 200, 0.01, img.title && [0, img.title.height * 0.02, img.title.width, img.title.width * 200 / 150]);
  ctx.restore();
  // logo: the quest's (src/quests.js; the title's QUEST row turns the book -- it pops in when it changes)
  outlined(ctx, 'SHADOW STORIES', 62, 86, 28, '#fff1d6', FONT_B, 0.24);
  const qk = app.questT != null ? Math.min(1, (app.time - app.questT) / 0.18) : 1, qs = 0.86 + 0.14 * (1 - Math.pow(1 - qk, 3));
  ctx.save(); ctx.translate(56, 156); ctx.rotate(-0.04); ctx.scale(qs, qs);
  if (isMM()) {
    const g1 = ctx.createLinearGradient(0, -60, 0, 0); g1.addColorStop(0, '#f2fbff'); g1.addColorStop(1, '#8cc8ff');
    outlined(ctx, 'MYSTIC', 0, 0, 66, g1, FONT_T, 0.16);
    const g2 = ctx.createLinearGradient(0, 22, 0, 90); g2.addColorStop(0, '#c8b4ff'); g2.addColorStop(1, '#5a46d6');
    outlined(ctx, 'MOUNTAIN', 18, 80, 72, g2, FONT_T, 0.15);
  } else if (isSI()) {   // (Book Two: the bone-white SKULL over a sea-blue ISLAND)
    const g1 = ctx.createLinearGradient(0, -60, 0, 0); g1.addColorStop(0, '#fffbe8'); g1.addColorStop(1, '#d8c89a');
    outlined(ctx, 'SKULL', 10, 0, 70, g1, FONT_T, 0.16);
    const g2 = ctx.createLinearGradient(0, 22, 0, 90); g2.addColorStop(0, '#6ad8e8'); g2.addColorStop(1, '#2a72c8');
    outlined(ctx, 'ISLAND', 0, 80, 76, g2, FONT_T, 0.15);
  } else {
    const g1 = ctx.createLinearGradient(0, -60, 0, 0); g1.addColorStop(0, '#ffe36a'); g1.addColorStop(1, '#ff8a2a');
    outlined(ctx, "DODONGO'S", 0, 0, 66, g1, FONT_T, 0.16);
    const g2 = ctx.createLinearGradient(0, 22, 0, 90); g2.addColorStop(0, '#ffb24a'); g2.addColorStop(1, '#e8401f');
    outlined(ctx, 'QUEST', 30, 86, 90, g2, FONT_T, 0.15);
  }
  ctx.restore();
  const saga = `${{ 'BOOK 1': 'Book One', 'BOOK 2': 'Book Two' }[quest().book] || 'Book Three'}: ${quest().saga}`;
  if (isSI()) {   // (Book Two: the saga on a navy ribbon with a gold rule, a size up for a TV across the room)
    ctx.font = `bold 19px ${FONT_C}`; const sw = ctx.measureText(saga).width;
    ctx.fillStyle = 'rgba(15,26,51,0.86)'; roundRect(ctx, 52, 246, sw + 30, 28, 8); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = SI_GOLD; ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = '#f4e6c0'; ctx.fillText(saga, 67, 266);
  } else {
  ctx.font = `bold 17px ${FONT_C}`; ctx.lineJoin = 'round'; ctx.textAlign = 'left';
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText(saga, 66, 276);
  ctx.fillStyle = '#fff6e6'; ctx.fillText(saga, 66, 276);
  }
  // (a save, LEVEL SELECT and three or four seats make seven rows: they close up to stay above the foot -- CONTROLS fell
  //  off the canvas on a TV with pads)
  const tn = app.menu.items.length, ty0 = tn > 5 ? 316 : 330, tgap = Math.min(42, Math.floor((H - 44 - ty0) / Math.max(1, tn - 1)));
  if (isSI()) { const fs0 = Math.min(30, Math.round(tgap * 0.8)), py = Math.max(282, ty0 - fs0 - 8); siPlate(ctx, 40, py, 380, (ty0 + (tn - 1) * tgap + 14) - py); }   // (Book Two: the rows on a navy plate)
  menuList(ctx, app.menu.items, app.menu.sel, 80, ty0, app, Math.min(30, Math.round(tgap * 0.8)), tgap);
  // device line
  if (isSI()) {   // (Book Two: on a navy chip right of the menu plate, wrapped to two lines; not under the connect toast that says the same)
    if (!(app.toast && app.toast.t <= app.toast.life)) {
      ctx.font = `bold 16px ${FONT_C}`;
      const L2 = wrap(ctx, app.deviceLine(), 440).slice(0, 2), dw = Math.max(...L2.map((l) => ctx.measureText(l).width)) + 26, dh = L2.length * 20 + 12;
      const cxR = 912 - 4, cyB = 513 - 4;   // (inside a TV's action-safe area)
      ctx.fillStyle = 'rgba(15,26,51,0.84)'; roundRect(ctx, cxR - dw, cyB - dh, dw, dh, 8); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = SI_GOLD; ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillStyle = '#f4e6c0'; L2.forEach((l, i) => ctx.fillText(l, cxR - dw / 2, cyB - dh + 22 + i * 20));
    }
  }   // (Book Two: on a navy chip; not under the connect toast that says the same)
  else {
  ctx.font = `bold 14px ${FONT_C}`; ctx.fillStyle = 'rgba(255,248,235,0.92)'; ctx.textAlign = 'right';
  ctx.fillText(app.deviceLine(), W - 22, H - 16);
  }
  drawToast(ctx, app, H - 88, 720);   // (a controller connected: at the foot, right of the rows -- it sat on the logo)
}

// ================================================================================================ character select
export const CARD_W = 214;
export const CARD_X = (i) => (W - (HERO_IDS.length * CARD_W + (HERO_IDS.length - 1) * 18)) / 2 + i * (CARD_W + 18);
// (five cards once Dragon Dodongo is unlocked: narrower, closer)
// (Book Two, four cards: 204 wide, 12 apart -- the row 54..906, its text inside a TV's action-safe area (x 48..912); at 214 + 18 it ran 25..935)
export const cardW = (n) => (n > 4 ? 172 : isSI() && n === 4 ? 204 : CARD_W);
export const cardX = (i, n) => { const w = cardW(n), g = n > 4 || (isSI() && n === 4) ? 12 : 18; return (W - (n * w + (n - 1) * g)) / 2 + i * (w + g); };
/** a card's ▲▼ FORM pill (its centre): the card's top right */
export const formPillAt = (i, n) => ({ x: cardX(i, n) + cardW(n) - 50, y: 96 + 20 });
export const formPillHit = (at, x, y) => Math.abs(at.x - x) <= 48 && Math.abs(at.y - y) <= 20;
/** the ▲▼ FORM pill: which form of how many (dots), lit when its card is picked */
export function formPill(ctx, x, y, on, k, n) {
  ctx.save();
  ctx.fillStyle = on ? '#ffe066' : 'rgba(255,240,200,0.85)'; roundRect(ctx, x - 44, y - 14, 88, 28, 12); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.font = `15px ${FONT_T}`; ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('▲▼ FORM', x - 9, y + 1);
  for (let j = 0; j < n; j++) { ctx.beginPath(); ctx.arc(x + 34, y - 5 + j * 10, 3, 0, TAU); ctx.fillStyle = j === k ? '#e8333f' : 'rgba(33,20,28,0.35)'; ctx.fill(); }
  ctx.restore();
}
export function drawSelect(ctx, app) {
  const t = app.time, S = app.select;
  stageBackdrop(ctx, app, 900 + Math.sin(t * 0.04) * 120, 0.66);
  outlined(ctx, 'CHOOSE YOUR HERO', W / 2, isSI() ? 60 : 54, 40, '#ffe066', FONT_T, 0.15, 'center');   // (Book Two: inside a TV's action-safe area, y >= 27)
  ctx.font = `bold ${isSI() ? 18 : 15}px ${FONT_C}`; ctx.fillStyle = '#fff1d6'; ctx.textAlign = 'center';
  if (isSI()) { ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(S.players > 1 ? `${['', '', 'Two', 'Three', 'Four'][S.players]} players: pick your heroes. The same hero twice is fine!` : 'Pick a hero. A friend can warp in later with a controller!', W / 2, 84); }
  ctx.fillText(S.players > 1 ? `${['', '', 'Two', 'Three', 'Four'][S.players]} players: pick your heroes. The same hero twice is fine!` : 'Pick a hero. A friend can warp in later with a controller!', W / 2, isSI() ? 84 : 78);
  // one card per hero
  const ids = S.ids || HERO_IDS, nc = ids.length;
  ids.forEach((base, i) => {
    const inK = isSI() ? easeOut(clamp(((app.sceneT || 0) - i * 5) / 18, 0, 1)) : 1;   // (Book Two: each card rises in, one after another)
    if (inK < 1) { ctx.save(); ctx.globalAlpha = inK; ctx.translate(0, (1 - inK) * 46); }
    const pickers = S.slots.filter((sl) => sl.joined && sl.cursor === i);
    // (the card shows the form its first picker stands on: ▲▼ FORM switches it)
    const F = app.formsOf ? app.formsOf(base) : [base], id = pickers.length ? app.formHero(base, pickers[0].form) : base;
    const H0 = HEROES[id];
    const SI4 = isSI() && nc <= 4, fy = SI4 ? 240 : 250;   // (Book Two: the hero's feet 10 px higher, a taller card -- an 18 px blurb under the name)
    const x = cardX(i, nc), y = 96, w = cardW(nc), h = SI4 ? 344 : 332;
    const locked = S.slots.find((sl) => sl.locked && sl.cursor === i);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 8, y + 10, w, h);
    ctx.fillStyle = locked ? '#2a1d38' : '#211830'; ctx.fillRect(x, y, w, h);
    ctx.lineWidth = pickers.length ? 5 : 3;
    ctx.strokeStyle = pickers.length ? PLAYER_COLS[pickers[0].slot] : INK;
    ctx.strokeRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const gr = ctx.createRadialGradient(x + w / 2, y + 200, 10, x + w / 2, y + 200, 200);
    gr.addColorStop(0, H0.accent + '66'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
    const mem = app.selMem[i] || (app.selMem[i] = {});
    // the painted select loop (src/showcase.js): held on its first drawing, played from the start when picked; else the
    // live sprite / code rig
    if (pickers.length) { if (mem.selT0 == null) mem.selT0 = t; } else mem.selT0 = null;
    if (H0.form && pickers.length) {                    // (a secret form: its aura behind it, its own drawing)
      formCardAura(ctx, H0, x + w / 2, y + fy, t);
      drawHero(ctx, id, 'select', t + i, x + w / 2, y + fy, baseOf(id) === 'scarlet' ? 1.12 : 1.2, 1, t + i, mem);
    } else if (!drawSelectLoop(ctx, id, mem.selT0 == null ? null : t - mem.selT0, x + w / 2, y + fy)) {
      drawHero(ctx, id, pickers.length ? 'select' : 'idle', t + i, x + w / 2, y + fy, id === 'scarlet' ? 1.12 : id === 'dragon' ? 1.05 : 1.2, 1, t + i, mem);
    }
    ctx.restore();
    if (F.length > 1) { const P = formPillAt(i, nc); formPill(ctx, P.x, P.y, pickers.length > 0, F.indexOf(id), F.length); }
    const five = nc > 4;
    outlined(ctx, H0.name, x + w / 2, y + (five ? 276 : isSI() ? 264 : 280), H0.name.length > 16 ? 19 : H0.name.length > 10 ? 22 : five ? 25 : 28, H0.accent, FONT_B, 0.24, 'center');
    ctx.fillStyle = '#fff1d6'; ctx.textAlign = 'center';
    // up to three lines, kept inside the card (five narrower cards: up to four smaller lines, the size that fits)
    const blurb = (isMM() && MM_BLURBS[H0.id]) || H0.blurb;   // (Book 1 doesn't give away Dodongo's secret)
    if (!five && isSI()) { let L4 = []; for (const fs of [18, 17.5, 17]) { ctx.font = `bold ${fs}px ${FONT_C}`; L4 = wrap(ctx, blurb, w - 12); if (L4.length <= 4) break; } L4.slice(0, 4).forEach((l, j) => ctx.fillText(l, x + w / 2, y + 281 + j * 18.5)); }   // (Book Two: 18 px for a TV at 3 m -- 17 at the least -- four lines in the taller card)   // (Book Two: a size up for a TV -- the largest that fits four lines)
    else if (!five) { ctx.font = `bold 13px ${FONT_C}`; wrap(ctx, blurb, w - 20).slice(0, 3).forEach((l, j) => ctx.fillText(l, x + w / 2, y + 297 + j * 14)); }
    else {
      let lines = [];
      for (const fs of [12, 11.5, 11, 10.5]) { ctx.font = `bold ${fs}px ${FONT_C}`; lines = wrap(ctx, blurb, w - 14); if (lines.length <= 4) break; }
      lines.slice(0, 4).forEach((l, j) => ctx.fillText(l, x + w / 2, y + 291 + j * 12));
    }
    // (a locked card is never TAKEN now -- two players may be the same hero: the badges and READY! lines say who's on it)
    // "TWINS!" -- a second player just landed on this card (src/main.js twinPop): it's allowed
    const TP = S.twin && S.twin.i === i ? (app.sceneT || 0) - S.twin.t : -1;
    if (TP >= 0 && TP < 70) {
      const k = TP < 8 ? 0.6 + 0.6 * TP / 8 : TP < 12 ? 1.2 - 0.2 * (TP - 8) / 4 : 1;
      ctx.save(); ctx.globalAlpha = TP > 55 ? (70 - TP) / 15 : 1; ctx.translate(x + w / 2, y + 224); ctx.rotate(-0.09); ctx.scale(k, k);   // (over the knees -- at 128 it sat on the face and on the READY! line)
      // (the word counts them -- three or four on one card aren't twins -- and fits the card at its peak scale)
      const word = ['', '', 'TWINS!', 'TRIPLETS!', 'ALL FOUR!'][pickers.length] || 'TWINS!';
      let tfs = nc > 4 ? 30 : 38; ctx.font = `${tfs}px ${FONT_T}`; while (tfs > 20 && ctx.measureText(word).width * 1.2 > w - 10) ctx.font = `${--tfs}px ${FONT_T}`;
      outlined(ctx, word, 0, 0, tfs, '#ffe066', FONT_T, 0.15, 'center');
      ctx.restore();
    }
    // badges for who's on this card (each in that player's colour: the same as their P-tag, panel and floor ring)
    pickers.forEach((sl, j) => {
      const bx = x + 10 + j * Math.min(48, (w - 20) / 4), by = y + 14;      // (up to four badges fit the card)
      ctx.fillStyle = PLAYER_COLS[sl.slot]; roundRect(ctx, bx, by, 44, 26, 8); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      outlined(ctx, 'P' + (sl.slot + 1), bx + 22, by + 21, 20, '#fff', FONT_B, 0.2, 'center');
      if (sl.locked && pickers.length < 2) outlined(ctx, pickers.length > 1 ? `P${sl.slot + 1} READY!` : 'READY!', x + w / 2, y + (SI4 ? 68 : 72) + j * 30, 28, '#9dff8a', FONT_B, 0.24, 'center');
    });
    if (pickers.length > 1) {   // (twins on one card: one READY! line naming who's locked in -- a stack of them covered the hero's face)
      const s = pickers.filter((sl) => sl.locked).map((sl) => 'P' + (sl.slot + 1)).join(' ');
      if (s) {   // (each P in that player's colour, as on their badge; READY! in green)
        let fs = 28; ctx.font = `${fs}px ${FONT_B}`; while (fs > 18 && ctx.measureText(s + ' READY!').width > w - 18) ctx.font = `${--fs}px ${FONT_B}`;
        const toks = [...pickers.filter((sl) => sl.locked).map((sl) => ['P' + (sl.slot + 1) + ' ', PLAYER_COLS[sl.slot]]), ['READY!', '#9dff8a']];
        let tx0 = x + w / 2 - ctx.measureText(s + ' READY!').width / 2;
        for (const [tk, col] of toks) { ctx.font = `${fs}px ${FONT_B}`; const tw = ctx.measureText(tk).width; outlined(ctx, tk, tx0, y + (SI4 ? 68 : 72), fs, col, FONT_B, 0.24, 'left'); tx0 += tw; }
      }
    }
    ctx.restore();
    if (inK < 1) ctx.restore();
  });
  // move list for the hovered hero(s)
  const sl0 = (isSI() && S.slots.find((s) => s.joined && !s.locked)) || S.slots.find((s) => s.joined) || S.slots[0];   // (Book Two: the player still choosing)
  const hero = HEROES[app.formHero ? app.formHero(ids[sl0.cursor], sl0.form) : ids[sl0.cursor]];
  if (isSI()) {   // (Book Two: the hovered hero's moves on a navy strip, a size up -- under the taller cards; everyone in: START there instead, inside a TV's safe area)
    if (S.ready) { ctx.save(); sipulse(ctx, t); outlined(ctx, `${app.glyphText('start', S.slots[0].ctrl)} TO START!`, W / 2, 468, 28, '#ffe066', FONT_B, 0.24, 'center'); ctx.restore(); }
    else {
      const line = `Projectile: ${hero.shoot.name}     Super: ${hero.special.name}     Health: ${hero.hp}`;
      ctx.font = `bold 17px ${FONT_C}`; const lw2 = ctx.measureText(line).width + 34;
      const sy = S.players > 2 ? 444 : 446, sh = S.players > 2 ? 22 : 26;   // (3-4P: 4 px slimmer, 4 px clear of the cards -- the first prompt row's keycaps sit 2 px under it: QAF3)
      ctx.fillStyle = 'rgba(15,26,51,0.82)'; roundRect(ctx, W / 2 - lw2 / 2, sy, lw2, sh, 8); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = SI_GOLD; ctx.stroke();
      ctx.fillStyle = '#f4e6c0'; ctx.textAlign = 'center'; ctx.fillText(line, W / 2, sy + sh - (sh < 26 ? 6 : 7));
    }
  } else {
  ctx.font = `bold 14px ${FONT_C}`; ctx.fillStyle = '#ffe9b8'; ctx.textAlign = 'center';
  ctx.fillText(`Projectile: ${hero.shoot.name}     Super: ${hero.special.name}     Health: ${hero.hp}`, W / 2, 450);
  }
  // slot prompts
  S.slots.forEach((sl, i) => {
    // (one player: centred; two: left and right; three / four: two rows)
    const x = S.players === 1 ? W / 2 : S.players === 3 && i === 2 ? W / 2 : i % 2 === 0 ? 240 : 720;
    const yRow = S.players > 2 ? (i < 2 ? (isSI() ? 484 : 476) : (isSI() ? 508 : 500)) : (isSI() ? 496 : 488), fs = S.players > 2 ? (isSI() ? 17 : 15) : (isSI() ? 19 : 17);   // (Book Two: a size up for a TV; 3-4P rows 24 apart so their keycaps don't touch -- QAF3)
    const col = PLAYER_COLS[i];
    let text;
    if (!sl.joined) text = blink(t) ? `P${i + 1}: ${app.joinPrompt(i)}` : '';
    else if (!sl.locked) text = `P${i + 1}: ◀ ▶ choose,${app.formsOf && app.formsOf(S.ids[sl.cursor]).length > 1 ? ' ▲ ▼ form,' : ''}  ${app.glyphText('confirm', sl.ctrl)} to pick`;
    else text = `P${i + 1} ready!  ${app.glyphText('back', sl.ctrl)} to change`;
    // (Book Two: the key itself drawn as a keycap / pad button -- a bare "." for P3's keyboard read as a typo)
    const act = !sl.joined ? null : !sl.locked ? 'confirm' : 'back';
    const onTouch = (!sl.ctrl || sl.ctrl === 'any' ? app.lastCtrl : sl.ctrl) === 'touch';   // (touch: the plain line, glyphText's word -- "TAP to pick", as before the keycaps)
    if (text && isSI() && act && !onTouch && app.input?.drawGlyph) {
      const gt = app.glyphText(act, sl.ctrl), cut = text.lastIndexOf(gt);
      const pre = text.slice(0, cut).replace(/\s+$/, ' '), post = text.slice(cut + gt.length), gs = Math.round(fs * 1.6);   // (a keycap big enough that its own label reads on a TV)
      // (a keyboard key -- a keyboard slot, or 1P's 'any' on a keyboard: Book Two's own keycap in the shared glyph's look
      //  (siKeycap), its label 15 px at 3-4P / 16 px at 1-2P -- the shared glyph's label is 0.47 of the cap, 12.7 px at 3-4P,
      //  and a taller cap would touch the other row: QAF3.  P3's "." is a fat dot on a cap the size of the others)
      const key = siKeyLabel(app, act, sl.ctrl), capH = S.players > 2 ? 20 : 24, capF = S.players > 2 ? 15 : 16;
      let gw = gs;
      if (key) gw = siKeyW(ctx, key, capH, capF);
      else try { const sc = drawSelect._g || (drawSelect._g = document.createElement('canvas').getContext('2d')); gw = app.input.drawGlyph(sc, act, sl.ctrl, -999, -999, gs) || gs; } catch { /* the plain size */ }
      ctx.font = `bold ${fs}px ${FONT_C}`; const w1 = ctx.measureText(pre).width, w2 = ctx.measureText(post).width, tw = w1 + 4 + gw + 4 + w2;
      let x0 = x - tw / 2; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
      ctx.strokeText(pre, x0, yRow); ctx.fillStyle = col; ctx.fillText(pre, x0, yRow); x0 += w1 + 4;
      if (key) siKeycap(ctx, key, x0 + gw / 2, yRow - fs * 0.36, gw, capH, capF);
      else app.drawGlyph(ctx, act, sl.ctrl, x0 + gw / 2, yRow - fs * 0.36, gs);
      x0 += gw + 4;
      ctx.font = `bold ${fs}px ${FONT_C}`; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.textAlign = 'left'; ctx.strokeText(post, x0, yRow); ctx.fillStyle = col; ctx.fillText(post, x0, yRow);
    } else if (text) { ctx.font = `bold ${fs}px ${FONT_C}`; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.textAlign = 'center'; ctx.strokeText(text, x, yRow); ctx.fillStyle = col; ctx.fillText(text, x, yRow); }
  });
  if (S.ready && blink(t) && !isSI()) outlined(ctx, `${app.glyphText('start', S.slots[0].ctrl)} TO START!`, W / 2, 526, 28, '#ffe066', FONT_B, 0.24, 'center');   // (Book Two: in the move strip's place, above)
  if (isSI()) { ctx.font = `40px ${FONT_T}`; drawToast(ctx, app, 28, 'left', W / 2 - ctx.measureText('CHOOSE YOUR HERO').width / 2 - 24 - 48); }   // (Book Two: top left, beside the title -- over the subtitle or a card it hid them; ending 24 px short of the title's letters (~18 px clear of its outline) -- a long "Controller 3 connected" toast came within 5 px of it: QAF3)
  else drawToast(ctx, app, S.players > 2 ? 504 : 92);
}

// ================================================================================================ level select / controls
export function drawLevelSelect(ctx, app) {
  const t = app.time;
  stageBackdrop(ctx, app, 1800, 0.66);
  outlined(ctx, 'LEVEL SELECT', W / 2, 70, 44, '#ffe066', FONT_T, 0.15, 'center');
  // (the secret stages found make the list longer: it closes up to end above the progress lines -- every secret found,
  //  PLAYERS included, sat under them)
  const n = app.menu.items.length, y0 = n > 7 ? 116 : 150, gap = Math.min(56, Math.floor((H - (isSI() ? 126 : 100) - y0) / Math.max(1, n - 1)));
  if (isSI()) {   // (Book Two: the list and its footer lines on one wide navy plate, the lines a size up)
    siPlate(ctx, 130, y0 - 34, 700, H - 18 - (y0 - 34));
    menuList(ctx, app.menu.items, app.menu.sel, 250, y0, app, Math.min(32, Math.round(gap * 0.74)), gap);
    outlined(ctx, 'Secret forms unlocked in either book are yours in both!', W / 2, H - 80, 24, '#ffe9a0', FONT_B, 0.24, 'center');
    outlined(ctx, counterLine(undefined, false), W / 2, H - 55, 22, '#d8f2ff', FONT_B, 0.24, 'center');
    if (blink(t)) { ctx.save(); sipulse(ctx, t); ctx.font = `bold 20px ${FONT_C}`; ctx.fillStyle = '#fff1d6'; ctx.textAlign = 'center'; ctx.fillText(app.promptText('back', 'back'), W / 2, H - 34); ctx.restore(); }   // (Book Two: its descenders inside y 513)
    return;
  }
  menuList(ctx, app.menu.items, app.menu.sel, 300, y0, app, Math.min(32, Math.round(gap * 0.74)), gap);
  if (isMM() || isSI()) outlined(ctx, 'Secret forms unlocked in either book are yours in both!', W / 2, H - 68, 20, '#ffe9a0', FONT_B, 0.24, 'center');
  else outlined(ctx, progressLine(), W / 2, H - 68, 20, '#ffe9a0', FONT_B, 0.24, 'center');   // (the Star Shards and baby dragons: src/secrets.js)
  outlined(ctx, counterLine(undefined, !isMM() && !isSI()), W / 2, H - 44, 18, '#d8f2ff', FONT_B, 0.24, 'center');      // (the bosses beaten as Shadow and -- Book 3 -- the chests: the forms' unlocks)
  if (blink(t)) { ctx.save(); sipulse(ctx, t); ctx.font = `bold 16px ${FONT_C}`; ctx.fillStyle = '#fff1d6'; ctx.textAlign = 'center'; ctx.fillText(app.promptText('back', 'back'), W / 2, H - 20); ctx.restore(); }
}

export function drawControls(ctx, app) {
  stageBackdrop(ctx, app, 3300, 0.72);
  if (isSI()) siPlate(ctx, 30, 90, 900, 434);   // (Book Two: the table and its notes on a navy plate -- wide enough for four device columns)
  outlined(ctx, 'CONTROLS', W / 2, 62, 44, '#ffe066', FONT_T, 0.15, 'center');
  const rows = [['Move', 'move'], ['Attack (4 in a row = combo)', 'attack'], ['Hold Attack = big strike', 'attack'], ['Jump  (+ Attack = jump attack)', 'jump'],
    ['Projectile (hold = big spell)', 'shoot'], ['Dodge (roll out of the way)', 'dodge'], ['Super move', 'special'], ['Run (or double-tap)', 'run'], ['Pause', 'start'], ['Music on / off', 'mute']];
  // (the rows a glyph can't say: all four directions, every pause key, the mute key / button -- in words per device)
  const WORDS = {
    move: { kb: ['← ↑ → ↓  or  W A S D'], kb1: ['W A S D'], kb2: ['← ↑ → ↓'], touch: ['the stick: drag on', 'the left half'], pad: ['left stick', 'or D-pad'] },
    start: { kb: ['Enter / Esc / P'], kb1: ['Tab / Esc'], kb2: ['Enter'], touch: ['❚❚ (top right)'] },
    mute: { kb: ['M'], kb1: ['M'], kb2: ['M'], touch: ['♪ (top right)'], pad: ['—'] },
  };
  const cols = app.controlsDevices();
  const x0 = isSI() ? 70 : 120, colW = (W - 120 - 300) / Math.max(1, cols.length), cx0 = isSI() ? 345 : 400;   // (Book Two: the table centred on its plate)
  cols.forEach((c, j) => outlined(ctx, c.label, cx0 + j * colW + colW / 2, 116, 20, '#9fe7ff', FONT_B, 0.22, 'center'));
  // (a pad column: dodge is any shoulder or trigger, run is the stick all the way or a double tap -- in words)
  const padWords = (lines, x, y) => lines.forEach((s, k) => {
    let px = lines.length > 1 ? 16 : 19;
    ctx.font = `${px}px ${FONT_B}`;
    const w = ctx.measureText(s).width;
    if (w > colW - 10) px *= (colW - 10) / w;
    outlined(ctx, s, x, y + 6 + (k - (lines.length - 1) / 2) * 16, px, '#fff6e6', FONT_B, 0.24, 'center');
  });
  rows.forEach(([label, act], i) => {
    const y = (isSI() ? 136 : 144) + i * (isSI() ? 29 : 31);
    ctx.font = `bold 18px ${FONT_C}`; ctx.fillStyle = '#fff6e6'; ctx.textAlign = 'left'; ctx.fillText(label, x0, y + 6);
    cols.forEach((c, j) => {
      const x = cx0 + j * colW + colW / 2, kind = app.isPadId?.(c.id) || c.id === 'ps5' ? 'pad' : c.id;
      const words = WORDS[act]?.[kind];
      if (words) padWords(words, x, y);
      else if (act === 'run' && c.id === 'touch') padWords(['stick all the way'], x, y);
      else if (app.isPadId?.(c.id) && act === 'dodge') padWords([app.padDodgeText(c.id)], x, y);
      else if (app.isPadId?.(c.id) && act === 'run') padWords(['stick all the way', 'or double-tap'], x, y);
      else app.drawGlyph(ctx, act, c.id, x, y, 28);
    });
  });
  const sy = isSI() ? -18 : 0;   // (Book Two: the notes a little higher -- all of it inside the plate and the TV's safe area)
  outlined(ctx, "2-4 players: SUPER together when you're close = TEAM ATTACK!", W / 2, 462 + sy, 22, '#ffe066', FONT_B, 0.22, 'center');
  ctx.font = `bold ${isSI() ? 16 : 15}px ${FONT_C}`; ctx.fillStyle = '#ffe9b8'; ctx.textAlign = 'center';
  ctx.fillText('Snowballs, rocks and kegs: walk up to one and press Attack to pick it up, Attack again to throw.', W / 2, 488 + sy - (isSI() ? 4 : 0));
  ctx.fillText(app.padNote(), W / 2, isSI() ? 486 : 512);
  if (blink(app.time)) { ctx.save(); sipulse(ctx, app.time); ctx.fillStyle = '#fff1d6'; ctx.fillText(app.promptText('back', 'back'), W / 2, isSI() ? 509 : 534); ctx.restore(); }
}

// ================================================================================================ in-game HUD
function playerPanel(ctx, world, p, slot, X = slot === 1 ? W - 104 : 14) {   // (X: the panel's anchor -- hudLayout)
  const app = world.app, t = world.time;
  const right = slot === 1;
  const dir = right ? -1 : 1;
  const H0 = p.hero;
  // portrait
  const px = right ? X - 72 : X;
  ctx.save(); ctx.translate(px + 36, 44); ctx.rotate(right ? 0.05 : -0.05);
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(-36, -36, 72, 72);
  ctx.lineWidth = 3.5; ctx.strokeStyle = slot === 0 ? '#ffd23a' : '#5ad0ff'; ctx.strokeRect(-36, -36, 72, 72);
  portraitFill(ctx, app, p.heroId, 32);
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(-32, -32, 64, 64);
  if (p.out) { ctx.fillStyle = 'rgba(20,14,30,0.6)'; ctx.fillRect(-32, -32, 64, 64); }
  ctx.restore();
  const bx = right ? px - 10 - 240 : px + 80;
  outlined(ctx, H0.name, right ? bx + 240 : bx, 30, 23, slot === 0 ? '#ffd84a' : '#8fe0ff', FONT_B, 0.24, right ? 'right' : 'left');
  // (no lives count: lives are infinite -- World.playerDied always respawns)
  if (p.out) {
    if (blink(t)) { ctx.save(); sipulse(ctx, t); outlined(ctx, `PRESS ${app.glyphText('start', p.ctrlId)} TO CONTINUE`, right ? bx + 240 : bx, 58, 18, '#ffe066', FONT_B, 0.24, right ? 'right' : 'left'); ctx.restore(); }
    return;
  }
  p.hpShown = p.hpShown ?? p.hp;
  p.hpShown += (p.hp - p.hpShown) * (p.hp < p.hpShown ? 0.06 : 0.25);
  bar(ctx, bx, 38, 240, 15, p.hp / p.maxHp, p.hpShown / p.maxHp, hpColour(p.hp / p.maxHp));
  // super meter: three cells
  for (let i = 0; i < 3; i++) {
    const f = clamp((p.meter - i * 100) / 100, 0, 1);
    const x = right ? bx + 240 - 46 - i * 50 : bx + i * 50, y = 58;
    ctx.fillStyle = '#2b1e2a'; roundRect(ctx, x, y, 44, 11, 5); ctx.fill();
    if (f > 0) {
      const full = f >= 1;
      ctx.fillStyle = full ? (Math.sin(t * 8 + i) > 0 ? H0.accent : '#ffe9a0') : '#8a6a5a';
      roundRect(ctx, right ? x + 2 + 40 * (1 - f) : x + 2, y + 2, 40 * f, 7, 3.5); ctx.fill();
    }
    ctx.lineWidth = 2.4; ctx.strokeStyle = INK; roundRect(ctx, x, y, 44, 11, 5); ctx.stroke();
  }
  ctx.font = `${isSI() ? 18 : 13}px ${FONT_B}`; ctx.fillStyle = '#fff'; ctx.textAlign = right ? 'right' : 'left';   // (Book Two: 18 px, a TV at 3 m)
  ctx.lineWidth = isSI() ? 4 : 3; ctx.strokeStyle = INK; if (isSI()) ctx.lineJoin = 'round';
  const so = isSI() ? 152 : 154, sl = 'SUPER', sx = right ? bx + 240 - so : bx + so;
  ctx.strokeText(sl, sx, isSI() ? 70 : 68); ctx.fillText(sl, sx, isSI() ? 70 : 68);
  // projectile cooldown dial (only for a shot with a cooldown: today none has one)
  if (!(H0.shoot.cooldown > 0)) return;
  const cx = right ? bx - 26 : bx + 266, cy = 52;
  const ready = p.cool <= 0;
  const k = ready ? 1 : 1 - p.cool / H0.shoot.cooldown;
  ctx.fillStyle = '#2b1e2a'; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = ready ? H0.accent : '#5a5066'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, TAU); ctx.stroke();
  projectileIcon(ctx, p.heroId, cx, cy, ready);
  if (ready && p._readyFlash !== true) p._readyFlash = true;
  if (!ready) p._readyFlash = false;
}
/** 3 / 4 players: a compact panel per player in a row along the top (clear of the corner buttons at the top right):
 * portrait, P# and name, health, the three super cells, the dodge's cooldown pip */
export const COMPACT = { x0: 10, step: 216, w: 206 };
// (Book Two, 3-4P: a form's name too long for the panel at 18 px on screen -- its short name)
const SI_SHORT = { 'ARCHMAGE ANASTASIA': 'ARCHMAGE ANA', 'PIRATE QUEEN SCARLET': 'PIRATE QUEEN', 'DRAGON DODONGO': 'DRAGON' };
function compactPanel(ctx, world, p, slot, X = slot * COMPACT.step, kRow = 1) {   // (X: from the row's left edge -- hudLayout; kRow: the row's scale)
  const app = world.app, t = world.time, H0 = p.hero, col = PLAYER_COLS[slot] || '#fff', Y = 8;
  ctx.save(); ctx.translate(X + 26, Y + 27); ctx.rotate(-0.04);
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(-26, -26, 52, 52);
  ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.strokeRect(-26, -26, 52, 52);
  portraitFill(ctx, app, p.heroId, 23);
  ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.strokeRect(-23, -23, 46, 46);
  if (p.out) { ctx.fillStyle = 'rgba(20,14,30,0.6)'; ctx.fillRect(-23, -23, 46, 46); }
  ctx.restore();
  const bx = X + 60, bw = 142;
  if (isSI()) {   // (Book Two: a TV at 3 m -- the P# and the name at >= 18 px on screen (the row is drawn at kRow); a form's name too long at that size goes short)
    const fmin = Math.ceil(18 / Math.min(1, kRow)), ffull = Math.max(fmin, 21);
    outlined(ctx, `P${slot + 1}`, bx, Y + 16, fmin, col, FONT_B, 0.24, 'left');
    const nx = bx + Math.round(fmin * 1.15) + 4, room = X + COMPACT.w - 10 - nx;   // (10 px short of the panel's edge: the last panel ends by the corner buttons)
    let nm = H0.name; ctx.font = `${ffull}px ${FONT_B}`;
    if (ctx.measureText(nm).width * fmin / ffull > room) nm = SI_SHORT[nm] || nm.split(' ')[0];
    ctx.font = `${ffull}px ${FONT_B}`;
    const nfs = Math.max(fmin, Math.min(ffull, Math.floor(ffull * room / Math.max(1, ctx.measureText(nm).width))));
    outlined(ctx, nm, nx, Y + 16, nfs, '#fff6e6', FONT_B, 0.24, 'left');
  } else {
  outlined(ctx, `P${slot + 1}`, bx, Y + 15, 17, col, FONT_B, 0.24, 'left');
  ctx.font = `18px ${FONT_B}`;   // (18 where the name fits beside its P#, else smaller -- they read small on phones)
  const nfs = Math.max(13, Math.min(18, Math.floor(18 * 118 / Math.max(1, ctx.measureText(H0.name).width))));
  outlined(ctx, H0.name, bx + 26, Y + 15, nfs, '#fff6e6', FONT_B, 0.24, 'left');
  }
  if (p.out) {
    if (blink(t)) { ctx.save(); sipulse(ctx, t); outlined(ctx, `PRESS ${app.glyphText('start', p.ctrlId)} TO CONTINUE`, bx, Y + 40, 13, '#ffe066', FONT_B, 0.24, 'left'); ctx.restore(); }
    return;
  }
  p.hpShown = p.hpShown ?? p.hp;
  p.hpShown += (p.hp - p.hpShown) * (p.hp < p.hpShown ? 0.06 : 0.25);
  bar(ctx, bx, Y + 21, bw, 12, p.hp / p.maxHp, p.hpShown / p.maxHp, hpColour(p.hp / p.maxHp));
  for (let i = 0; i < 3; i++) {   // the super: three cells
    const f = clamp((p.meter - i * 100) / 100, 0, 1), x = bx + i * 40, y = Y + 39;
    ctx.fillStyle = '#2b1e2a'; roundRect(ctx, x, y, 36, 10, 4.5); ctx.fill();
    if (f > 0) { ctx.fillStyle = f >= 1 ? (Math.sin(t * 8 + i) > 0 ? '#ffd23a' : '#fff3b0') : '#a07a5a'; roundRect(ctx, x + 2, y + 2, 32 * f, 6, 3); ctx.fill(); }
    ctx.lineWidth = 2.2; ctx.strokeStyle = INK; roundRect(ctx, x, y, 36, 10, 4.5); ctx.stroke();
  }
  // the dodge: a pip that refills as its cooldown runs out (full: ready)
  const k = p.state === 'dodge' ? 0 : p.dodgeCd > 0 ? 1 - p.dodgeCd / DODGE.cd : 1, cx = bx + 133, cy = Y + 44;
  ctx.fillStyle = '#2b1e2a'; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill();
  if (k > 0) { ctx.fillStyle = k >= 1 ? '#c9a7ff' : '#6a5a7a'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 6.5, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.closePath(); ctx.fill(); }
  ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.stroke();
  if (k >= 1) { ctx.font = `bold 11px ${FONT_C}`; ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('»', cx + 0.5, cy + 0.5); ctx.textBaseline = 'alphabetic'; }   // (the dodge: ready)
}
function projectileIcon(ctx, id, x, y, ready) {
  ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha = ready ? 1 : 0.6;
  ctx.lineWidth = 1.6; ctx.strokeStyle = INK;
  if (id === 'dodongo') {
    ctx.fillStyle = '#ffdf6a'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(8, 0, 0, 8); ctx.quadraticCurveTo(-8, 0, 0, -9); ctx.fill(); ctx.stroke();
  } else if (id === 'shadow') {
    ctx.fillStyle = '#e6eaf0'; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 2.5 : 9; const a = (i / 8) * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (id === 'scarlet') {
    ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 4.2;
    const g = () => { ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, -6); ctx.moveTo(0, 6); ctx.quadraticCurveTo(-8, 4, -7, -2); ctx.moveTo(0, 6); ctx.quadraticCurveTo(8, 4, 7, -2); ctx.moveTo(-3, -8); ctx.arc(0, -8, 3, Math.PI, Math.PI * 3); };
    g(); ctx.stroke(); ctx.strokeStyle = '#c9d0d8'; ctx.lineWidth = 2; g(); ctx.stroke();
  } else {
    ctx.fillStyle = '#bff0ff'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(6, -2); ctx.lineTo(3, 9); ctx.lineTo(-3, 9); ctx.lineTo(-6, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/** where the top HUD goes, clear of the corner buttons (mute, pause, full screen) wherever they reach over the canvas
 * (app.cornerBox: a phone's notch inset, a 16:9 window the canvas fills, ...).  1P: the drop-in hint's right edge.
 * 2P: P2's panel slides left (the score with it, off the middle) and, past that, drops below the buttons.  3P / 4P:
 * the row of compact panels slides left and, past that, shrinks.  Also left in app._hudBoxes for the tests */
const P1_RIGHT = 14 + 80 + 240, P2_W = 322;   // (P1's panel's right edge; P2's from its anchor to its left edge)
export function hudLayout(ctx, world) {
  const app = world.app, n = world.players.length, C = app.cornerBox?.() || null;
  const hits = (y0) => !!C && C.y1 > y0;          // (the buttons reach down past y0)
  ctx.font = `24px ${FONT_B}`;
  const sw = ctx.measureText('0000000').width, L = { n, corner: C, hintR: W - 110, p2X: W - 104, p2dy: 0, scoreX: W / 2, row: null };
  if (n === 1 && hits(12)) L.hintR = Math.min(W - 110, C.x0 - 4);
  if (n === 2 && hits(8) && C.x0 < L.p2X) {
    const minX = P1_RIGHT + 8 + sw + 8 + P2_W;    // (the score squeezed between the panels)
    if (C.x0 >= minX) L.p2X = C.x0;
    else L.p2dy = C.y1 - 8;                       // (no room: under the buttons)
    L.scoreX = L.p2dy ? W / 2 : Math.min(W / 2, L.p2X - P2_W - 8 - sw / 2);   // (P2 dropped: the score stays in the middle)
  }
  if (n > 2) {
    const rowW = n * COMPACT.step - (COMPACT.step - COMPACT.w), lim = Math.min(isSI() ? 912 : W - 10, hits(8) ? C.x0 : W);   // (Book Two: inside a TV's action-safe area, x 48..912)
    let x0 = n === 3 ? 160 : isSI() ? 48 : COMPACT.x0, k = 1;     // (three: centred on the score)
    if (x0 + rowW > lim) { x0 = Math.max(isSI() ? 48 : COMPACT.x0, lim - rowW); k = Math.min(1, (lim - x0) / rowW); }
    L.row = { x0, k, w: rowW };
    L.scoreX = x0 + (rowW * k) / 2;
  }
  return L;
}
export function drawHud(ctx, world, live = true) {
  const app = world.app;
  // (Book Two: the whole top HUD -- panels, score, the boss's block -- HY lower, inside a TV's action-safe area (5 %: y >= 27);
  //  drawn translated, its boxes and the bottoms it publishes in screen y)
  const HY = isSI() ? 20 : 0;
  const band = ctx.createLinearGradient(0, 0, 0, 96 + HY);
  band.addColorStop(0, 'rgba(14,8,22,0.55)'); band.addColorStop(1, 'rgba(14,8,22,0)');
  ctx.fillStyle = band; ctx.fillRect(0, 0, W, 96 + HY);
  const compact = world.players.length > 2;   // (1P / 2P: the big panels as ever; 3P / 4P: four compact ones along the top)
  const L = hudLayout(ctx, world), boxes = [];
  if (HY) { L.p2dy = Math.max(0, L.p2dy - HY); ctx.save(); ctx.translate(0, HY); }   // (the drop already clears the corner buttons by HY)
  const box = (b) => { if (HY) { b.y0 += HY; b.y1 += HY; } boxes.push(b); };
  if (compact) {
    const { x0, k, w } = L.row;
    const oy = HY ? 8 * (1 - k) + 1 : 0;   // (Book Two: a row scaled down (the corner buttons in) keeps its top where the full-size row's is -- its names stay at y >= 27)
    ctx.save(); ctx.translate(x0, oy); ctx.scale(k, k);
    world.players.forEach((p, i) => compactPanel(ctx, world, p, i, i * COMPACT.step, k));
    ctx.restore();
    box({ name: 'panels', x0, y0: 7 * k + oy, x1: x0 + w * k, y1: 64 * k + oy });   // (the portraits' tops at y 8)
  } else world.players.forEach((p, i) => {
    if (i === 1) {
      ctx.save(); ctx.translate(0, L.p2dy); playerPanel(ctx, world, p, 1, L.p2X); ctx.restore();
      box({ name: 'p2 panel', x0: L.p2X - P2_W, y0: 7 + L.p2dy, x1: L.p2X, y1: 82 + L.p2dy });
    } else { const IX = HY ? 34 : 0; if (IX) { ctx.save(); ctx.translate(IX, 0); } playerPanel(ctx, world, p, 0); if (IX) ctx.restore(); box({ name: 'p1 panel', x0: IX, y0: 0, x1: P1_RIGHT + IX, y1: 82 }); }   // (Book Two: P1's panel 34 px in -- its portrait at x 48)
  });
  // (a seat free and a controller not in it: "P2 / P3 / P4: press START to warp in!" -- 1P top right; 2P under P2's panel;
  //  3P under the row; not over a boss's bar)
  const nP = world.players.length;
  if (nP < 4 && live && (app.freeSeatPad ? app.freeSeatPad() : app.canDropIn()) && blink(world.time, 0.9) && !(nP > 1 && world._bossBar)) {
    const txt = `P${nP + 1}: press ${app.startText ? app.startText() : 'START'} to warp in!`;
    const hx = nP === 1 ? L.hintR : nP === 2 ? L.p2X : W - 14, hy = nP === 1 ? 26 : nP === 2 ? 100 + L.p2dy : 102;
    ctx.save(); sipulse(ctx, world.time); ctx.font = `bold 13px ${FONT_C}`; ctx.fillStyle = 'rgba(255,240,210,0.85)'; ctx.textAlign = 'right';
    ctx.fillText(txt, hx, hy); const dw0 = ctx.measureText(txt).width; ctx.restore();
    box({ name: 'drop-in hint', x0: hx - dw0, y0: hy - 12, x1: hx, y1: hy + 4 });
  }
  // score
  const n = world.players.length, cx0 = L.scoreX;
  // engaged enemy / boss (top centre)
  // once the boss fight starts its bar stays up; whoever else you're hitting gets a small bar under it.
  // In co-op it all sits below both player panels.
  const e = world.engaged;
  if (e?.boss) world._bossBar = e;
  const B = world._bossBar === world.boss && world.boss && world.boss.alive && !world.boss.freedNow ? world.boss : null;
  let top = (compact ? 112 : world.players.length > 1 ? 98 : 56) + L.p2dy;   // (P2's panel under the corner buttons: below it)
  let cx = cx0;
  // (Skull Island: the boss's block -- its name and bar, its meter under it, and in 3-4P the score over them -- slides aside,
  //  eased, when it would sit on the boss's crown (the Kraken) or on the King in his crystal (the palace, 3-4P): siBossSpot.
  //  world._bossBarCX tells a boss's own meter where the bar went.)
  // (Book Two: an engaged mini-boss -- the Leviathan -- has its small bar placed the same way, off its raised head)
  const MB = isSI() && !B && e && e.miniBoss && !e.noBar && e.alive && world.engagedT > 0 ? e : null;
  if (isSI()) {
    if (B || MB) {
      const [tx, tt] = siBossSpot(world, app, B || MB, cx0, top, compact, boxes, HY, B ? 152 : 100);
      const S = world._bossSpot || (world._bossSpot = { x: tx, top: tt });
      if (S.tx !== undefined && (tx !== S.tx || tt !== S.tt)) S.at = world.frame;   // (when the target last moved: siBossSpot's hold -- RC)
      S.x += (tx - S.x) * 0.15; S.top += (tt - S.top) * 0.15; S.tx = tx; S.tt = tt;
      cx = Math.round(S.x); top = Math.round(S.top);
    } else world._bossSpot = null;
    world._bossBarCX = B ? cx : undefined;
    // (the boss block's screen rect -- its name, bar and meter row, as siBossSpot boxes it: game.js drawTeamChip looks for a spot beside it -- QAF3)
    world._bossBlock = B ? [cx - Math.max(152, B.meterLeft ?? 0), HY + (compact ? Math.min(top - 18, 66) : top - 20), cx + 152, HY + top + 21 + (B.meterHud ? (B.meterH ?? 28) : 0)] : null;
  }
  // (Book Two, 1-2P: the score up top slides along its row off the boss's crown -- the Kraken's head reached it)
  let scx = cx0;
  if (isSI() && !compact && (B || MB)) {
    const K = siKeepRects(world, B || MB); ctx.font = `24px ${FONT_B}`; const sw2 = ctx.measureText('0000000').width / 2 + 8;
    const hitS = (x) => K.some(([a, b2, c, d]) => x + sw2 > a && x - sw2 < c && HY + 34 > b2 && HY + 8 < d);
    if (hitS(cx0)) {
      const lo = boxes.find((q) => q.name === 'p1 panel')?.x1 + 10 + sw2 || 400, hi = (boxes.find((q) => q.name === 'p2 panel')?.x0 ?? (app.cornerBox?.()?.x0 ?? 912)) - 10 - sw2;
      for (let d = 6; d < 600; d += 6) { if (cx0 - d >= lo && !hitS(cx0 - d)) { scx = cx0 - d; break; } if (cx0 + d <= hi && !hitS(cx0 + d)) { scx = cx0 + d; break; } }
    }
    const SS = world._scoreSpot ?? scx; world._scoreSpot = SS + (scx - SS) * 0.15; scx = Math.round(world._scoreSpot);
  } else world._scoreSpot = undefined;
  ctx.font = `24px ${FONT_B}`;
  const sw = ctx.measureText('0000000').width;
  if (compact) { outlined(ctx, String(app.run.score).padStart(7, '0'), cx, 84, 19, '#fff', FONT_B, 0.24, 'center'); box({ name: 'score', x0: cx - sw * 0.4, y0: 68, x1: cx + sw * 0.4, y1: 88 }); }   // (under the panels' middle)
  else { outlined(ctx, String(app.run.score).padStart(7, '0'), scx, 30, 24, '#fff', FONT_B, 0.24, 'center'); box({ name: 'score', x0: scx - sw / 2, y0: 8, x1: scx + sw / 2, y1: 34 }); }   // (1-2P: the score stays up top)
  app._hudBoxes = boxes;
  const foeBar = (f, y, boss) => {
    const w = boss ? 300 : 190;
    const mb = !boss && isSI() && f.miniBoss;   // (Skull Island: a mini-boss -- the Leviathan -- named like a boss, 22 px gold; other foes 20 px: they were 17 -- QAF3)
    outlined(ctx, f.name, cx, y, boss || mb ? 22 : isSI() ? 20 : 17, boss || mb ? (isSI() ? '#ffd86a' : '#9dff8a') : '#ff9a7a', FONT_B, 0.24, 'center');   // (Skull Island's boss: gold)
    if (f._shown === undefined) f._shown = f.hp;
    const hpv = f._beat && isSI() ? 0 : Math.max(0, f.hp);   // (Skull Island: the final blow landed -- src/sifx.js bossBeat -- the bar drains though a scripted finish keeps hp)
    f._shown += (hpv - f._shown) * 0.08;
    bar(ctx, cx - w / 2, y + 6, w, boss ? 15 : 11, hpv / f.maxHp, f._shown / f.maxHp, boss ? (isSI() ? '#f2b33a' : '#5ad35f') : '#ffb03a');
  };
  if (B) foeBar(B, top, true);
  world._bossBarBottom = B ? top + 21 + HY : null;   // (a boss's own meter goes under it: src/mmbosses.js meterHud -- screen y)
  world._bossBlock13 = !isSI() && B ? [cx - 155, top - 22, cx + 155, top + 21 + (B.meterHud ? (B.meterH ?? 28) : 0)] : null;   // (RC2, Books 1 / 3: the boss's name, bar and meter -- the team banner keeps off it: game.js teamBannerAt)
  // (the HUD band's bottom -- the panels, the boss's bar and its meter: the fx words and balloons stay under it, src/fx.js)
  world._hudBottom = HY + Math.max(compact ? 90 : 84 + (nP > 1 ? L.p2dy : 0), B ? top + 21 + (B.meterHud ? (B.meterH ?? 28) : 0) : 0);
  if (e && !e.boss && !e.noBar && !(world.boss && world.boss.hideFoeBars) && e.alive && world.engagedT > 0) {
    foeBar(e, B ? top + 36 : top, false);   // (noBar: the Kraken's eyes -- their glow is their bar)
    world._hudBottom = Math.max(world._hudBottom, HY + (B ? top + 36 : top) + 21);   // (the foe's bar is in the band too -- Book Two: STUCK! was drawn under the Leviathan's; RC, Books 1 / 3: DRAGON FLARE! on a knight's DAME POLE bar)
  }
  if (HY) ctx.restore();
  // GO arrow
  if (world.goT > 0 && !isSI()) world.fx?.keep13?.([824, 200, 942, 300], 2);   // (RC2, Books 1 / 3: the GO arrow's spot, on and off its blink alike -- POW! sat on it)
  if (world.goT > 0 && (isSI() || (world.goT >> 4) % 2 === 0)) {   // (Book Two: a pulse, not an on / off blink; inside the safe area)
    ctx.save(); sipulse(ctx, world.time); ctx.translate(isSI() ? 850 : 880, 250);
    ctx.beginPath(); ctx.moveTo(-50, -22); ctx.lineTo(10, -22); ctx.lineTo(10, -44); ctx.lineTo(56, 0); ctx.lineTo(10, 44); ctx.lineTo(10, 22); ctx.lineTo(-50, 22); ctx.closePath();
    ctx.fillStyle = '#ffd23a'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    outlined(ctx, 'GO!', -12, 12, 34, '#e8401f', FONT_B, 0.16, 'center');
    ctx.restore();
  }
  // hints
  if (world.hint && live) {
    const h = world.hint;
    ctx.font = `bold 19px ${FONT_C}`;
    // (Book Two: a hint wider than 816 px -- a TV's action-safe width, x 72-888 -- wraps to two lines on a taller box, its
    //  foot kept at 506; the text and the queue are the runtime's, this is only the drawing)
    const lines = isSI() && ctx.measureText(h.text).width + 36 > 816 ? wrap(ctx, h.text, 780).slice(0, 2) : [h.text];
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 36, bh = 40 + (lines.length - 1) * 22, by0 = 506 - bh;
    if (!isSI()) world.fx?.keep13?.([W / 2 - w / 2 - 6, by0 - 6, W / 2 + w / 2 + 10, by0 + bh + 10], 2);   // (RC2, Books 1 / 3: the tip bar is a keep-out -- SHADOW STRIKE! showed only "...KE!" under it)
    // (Skull Island: a foe or hazard at the front of the lane, under the hint box -- its floor ring reaches the box: the hint
    //  box thins, eased, so the ring's arc shows through; the words stay solid, with a light halo to read on the deck)
    //  (a lane telegraph at the front counts too: the Rage Alpha's charge lane runs the whole width, Blunderbeard's lunge lane ~316 px ahead of him)
    if (isSI()) { const under = world.actors.some((q) => (q.team === 'foe' || q.team === 'hazard' || q.boss) && q.alive !== false && !q.gone && ((362 + q.y + 30 > 466 && Math.abs(q.x - world.camX - W / 2) < w / 2 + 70) || (q.state === 'chargeWind' && 362 + q.y + 28 > 466) || (q.state === 'boltWind' && (q.lanes || []).some((L) => 362 + L.y + 26 > 466)) || (q.ring && typeof q.ring.y === 'number' && 362 + q.ring.y + 32 > 466 && Math.abs(q.ring.x - world.camX - W / 2) < w / 2 + 90) || (q.state === 'lungeWind' && 362 + q.y + 28 > 466 && Math.abs(q.x - world.camX + 158 * (q.facing || 1) - W / 2) < w / 2 + 158))); h._thin = (h._thin || 0) + ((under ? 1 : 0) - (h._thin || 0)) * 0.1; }
    const a = clamp(Math.min(h.t / 12, (h.life - h.t) / 20), 0, 1), th = h._thin || 0;
    ctx.save(); ctx.globalAlpha = a * (1 - 0.5 * th);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(ctx, W / 2 - w / 2 + 4, by0 + 4, w, bh, 12); ctx.fill();
    ctx.fillStyle = '#ffe58a'; roundRect(ctx, W / 2 - w / 2, by0, w, bh, 12); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.globalAlpha = a;
    if (lines.length > 1) {   // (two lines: each with the thin box's halo when the box thins)
      ctx.font = `bold 19px ${FONT_C}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      lines.forEach((l, j) => { const ly = by0 + 20 + j * 22; if (th > 0.05) { ctx.lineWidth = 5 * th; ctx.strokeStyle = 'rgba(255,229,138,0.95)'; ctx.strokeText(l, W / 2, ly); } ctx.fillStyle = INK; ctx.fillText(l, W / 2, ly); });
      ctx.restore();
    } else {
    if (th > 0.05) { ctx.font = `bold 19px ${FONT_C}`; ctx.lineJoin = 'round'; ctx.lineWidth = 5 * th; ctx.strokeStyle = 'rgba(255,229,138,0.95)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(h.text, W / 2, 487); }
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(h.text, W / 2, 487);
    ctx.restore();
    }
  }
  // section banner
  if (world.bannerT > 0) {
    const a = Math.min(1, world.bannerT / 20, (180 - world.bannerT) / 20 + 0), by = HY + Math.max(world.players.length > 1 ? top + 78 : 110 + L.p2dy, isSI() && (B || MB) ? top + 21 + ((B || MB).meterHud ? ((B || MB).meterH ?? 28) : 0) + 34 : 0);   // (Book Two: under the boss's block wherever it slid -- the 1P name banner sat on the Elder's bar)
    if (isSI()) { if (live) siBanner(ctx, world.banner, W / 2, by, clamp(a, 0, 1), world.bannerT); }   // (Book Two: the section's name on a navy ribbon)
    else {
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    outlined(ctx, world.banner, W / 2, by, 28, '#fff1d6', FONT_B, 0.24, 'center');   // (co-op: under the foe bars)
    ctx.restore();
    if (a > 0.02) { ctx.save(); ctx.font = `28px ${FONT_B}`; const bw = ctx.measureText(world.banner).width / 2 + 10; ctx.restore(); world.fx?.keep13?.([W / 2 - bw, by - 24, W / 2 + bw, by + 10], 2); }   // (RC: the section's name -- the words step round it)
    }
  }
  if (!(isSI() && app.paused)) drawToast(ctx, app, 92 + L.p2dy + HY);   // (Book Two: under the pause menu, at its foot -- drawPause)
}

export function drawToast(ctx, app, ty = 92, cx = W / 2, maxW = 262) {
  const T = app.toast;
  if (!T || T.t > T.life) return;
  if (T.sub) { drawToast2(ctx, T, ty, cx); return; }
  const a = clamp(Math.min(T.t / 10, (T.life - T.t) / 20), 0, 1);
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = `bold 16px ${FONT_C}`;
  if (cx === 'left') { let f = 16; while (f > 15 && ctx.measureText(T.text).width + 24 > maxW) ctx.font = `bold ${--f}px ${FONT_C}`; }   // (Book Two's select: left of the title, within maxW -- a long name shrinks a touch, its padding next)
  const w = Math.min(cx === 'left' ? maxW : 1e9, ctx.measureText(T.text).width + 30);
  const x = cx === 'left' ? 48 + w / 2 : Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, cx));   // ('left': Book Two's select -- top left, inside the safe area)
  ctx.fillStyle = '#17251b'; roundRect(ctx, x - w / 2, ty, w, 32, 10); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#5ad0ff'; ctx.stroke();
  ctx.fillStyle = '#e8fbff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; if (cx === 'left') ctx.fillText(T.text, x, ty + 16, w - 16); else ctx.fillText(T.text, x, ty + 16);
  ctx.restore();
}

/** a two-line toast -- the boot grant's ★ SUPER HEROES UNLOCKED! ★ (src/main.js): a 20 px headline, an 18 px line under it,
 *  inside a TV's safe area (x 48..912, its foot above y 513; the one-line toast's 16 px ran to x 937 on the title) */
function drawToast2(ctx, T, ty, cx) {
  const a = clamp(Math.min(T.t / 10, (T.life - T.t) / 20), 0, 1);
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = `20px ${FONT_T}`; const w1 = ctx.measureText(T.text).width;
  ctx.font = `bold 18px ${FONT_C}`; const w2 = ctx.measureText(T.sub).width;
  const w = Math.min(864, Math.max(w1, w2) + 32), h = 58, x = clamp(cx === 'left' ? 48 + w / 2 : cx, 48 + w / 2, 912 - w / 2), y = Math.min(ty, 513 - h);
  ctx.fillStyle = '#17251b'; roundRect(ctx, x - w / 2, y, w, h, 12); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#5ad0ff'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `20px ${FONT_T}`; ctx.fillStyle = '#ffd23a'; ctx.fillText(T.text, x, y + 19, w - 24);
  ctx.font = `bold 18px ${FONT_C}`; ctx.fillStyle = '#e8fbff'; ctx.fillText(T.sub, x, y + 41, w - 24);
  ctx.restore();
}

// ================================================================================================ cards
const easeOut = (t) => 1 - Math.pow(1 - t, 3), easeIn = (t) => t * t * t;
export function drawStageCard(ctx, world, k) {
  if (isSI()) { if (!world.app?.paused) drawStageCardSI(ctx, world, k); return; }   // (Book Two: not under the pause menu's title)   // (Book Two's own: a sea chart's ribbon, navy and gold)
  const L = world.L;
  const inK = clamp(k / 0.15, 0, 1), outK = clamp((k - 0.8) / 0.2, 0, 1);
  const x = -W * (1 - easeOut(inK)) + W * easeIn(outK);
  ctx.save(); ctx.translate(x, 0);
  ctx.fillStyle = 'rgba(29,20,40,0.82)';
  ctx.beginPath(); ctx.moveTo(0, 196); ctx.lineTo(W, 176); ctx.lineTo(W, 316); ctx.lineTo(0, 336); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#ffb02e'; ctx.stroke();
  outlined(ctx, L.secret ? 'SECRET STAGE' : L.bonus ? 'BONUS STAGE' : 'STAGE ' + L.num, W / 2, 236, 36, L.secret ? '#bff0ff' : '#fff1d6', FONT_B, 0.24, 'center');
  const gr = ctx.createLinearGradient(0, 240, 0, 300); gr.addColorStop(0, '#ffe36a'); gr.addColorStop(1, '#ff8a2a');
  outlined(ctx, L.name, W / 2, 298, 58, gr, FONT_T, 0.15, 'center');
  ctx.restore();
}
/** Mystic Mountain's own hero-card lines (Book 1: the dragon is the book's reveal -- its caption, not a spoiler) */
const MM_BLURBS = { dodongo: 'Brave, funny, a little bit dragon. (Long story.) A spiked club, a shield and a fiery breath.' };
const BOSS_TITLES = {
  GRIMSCALE: "Captain of the Dragon King's Guard",
  MAGMAW: 'The Lava Dragon of the Collar Forge',
  TEMPEST: 'The Storm Dragon of Stormspire',
  'THE DRAGON KING': 'Wearer of the Ember Crown',
  'THE FROST CHIEF': 'Biggest Snowball Thrower in the Hollow',
  'CRYSTAL MAGMAW': 'He Swallowed a Whole Crystal Cave',
  'THE WYVERN ALPHA': 'Leader of the Storm Wyverns',
  'THE CURSE WRAITH': 'A Grumpy Puff of Green Smoke',
};
export function drawBossCard(ctx, world, k) {
  if (isSI()) { drawBossCardSI(ctx, world, k); return; }   // (Book Two's own: navy and gold)
  const b = world.boss;
  const a = clamp(k / 0.1, 0, 1) * clamp((1 - k) / 0.15, 0, 1);
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(10,24,14,0.78)'; ctx.fillRect(0, 120, W, 96);
  ctx.fillStyle = '#5ad35f'; ctx.fillRect(0, 120, W, 4); ctx.fillRect(0, 212, W, 4);
  outlined(ctx, b.name, W / 2, 178, 52, '#9dff8a', FONT_T, 0.14, 'center');
  ctx.font = `bold 18px ${FONT_C}`; ctx.fillStyle = '#e8ffe0'; ctx.textAlign = 'center';
  ctx.fillText(BOSS_TITLES[b.name] || b.title || '', W / 2, 203);
  ctx.restore();
}

export function drawPause(ctx, app) {
  ctx.fillStyle = 'rgba(20,14,30,0.75)'; ctx.fillRect(0, 0, W, H);
  outlined(ctx, 'PAUSED', W / 2, 110, 60, '#ffe066', FONT_T, 0.15, 'center');
  // (the list fits above the stage line and the tips: more CHANGE HERO rows with more players -- closer, smaller)
  const st = app.stageStatus?.(), n = app.menu.items.length;   // (this stage's cages and Star Shard)
  const gap = Math.min(50, ((st ? 380 : 400) - 190) / Math.max(1, n - 1)), size = Math.min(30, Math.round(gap * 0.72));
  if (isSI()) { siPlate(ctx, 76, 140, 808, 336); drawToast(ctx, app, 480); }   // (the toast inside the TV's safe area)   // (Book Two: the list, the stage's line and the tips on one navy plate)
  menuList(ctx, app.menu.items, app.menu.sel, 330, 190, app, size, gap);
  ctx.font = `bold ${isSI() ? 19 : 16}px ${FONT_C}`; ctx.fillStyle = '#fff6e6'; ctx.textAlign = 'center';
  // (the tip knows the forms: Legend Shadow's held SHOOT is rapid fire)
  const ps = app.world?.players || [], autos = ps.filter((p) => p.hero?.shoot?.auto).length;
  const hold = autos && autos === ps.length ? 'hold SHOOT for rapid shurikens' : autos ? 'hold SHOOT for a big spell (Legend Shadow: rapid fire)' : 'hold SHOOT for a big spell';
  if (isSI()) {   // (Book Two: the device's own buttons named -- a pad player saw only SHOOT / DODGE / SUPER)
    const touch = app.lastCtrl === 'touch', G = (a, w) => (touch ? w : `${w} [${app.glyphText(a)}]`);
    ctx.fillText(`${hold.replace('hold SHOOT', `HOLD ${G('shoot', 'SHOOT')}`).replace(/^hold /, 'HOLD ').replace(' for ', ': ')}   ${G('dodge', 'DODGE')}: roll   ${G('special', 'SUPER')}: one bar`, W / 2, 433);   // (Book Two: 5 px up -- the last line's descenders touched the plate's foot on an iPad)
  } else
  ctx.fillText(`Tip: ${hold}, DODGE to roll out of the way, SUPER uses one bar of the meter.`, W / 2, 440);
  if (isSI()) { const tip = SI_PAUSE_TIPS[app.world?.L?.id] || SI_PAUSE_TIPS.sibluegull, tw = ctx.measureText(tip).width; if (tw > 700) { ctx.save(); ctx.font = `bold ${Math.max(16, Math.floor(19 * 700 / tw))}px ${FONT_C}`; ctx.fillText(tip, W / 2, 457); ctx.restore(); } else ctx.fillText(tip, W / 2, 457); }   // (kept inside the plate, clear of its foot)
  else ctx.fillText(isMM() ? 'Only LIGHT stops shadow wolves: magic, fire, a charged strike or a super.' : 'Freed baby dragons fight for you. Crystal waystones save your progress.', W / 2, 464);
  if (st) outlined(ctx, st, W / 2, isSI() ? 406 : 414, 20, '#bff0ff', FONT_B, 0.24, 'center');
  // the latest error, small (for a tester's screenshot; app.reportError in src/main.js)
  // (this session's latest; else the last session's, if it is under 2 hours old: a tester reloads after a problem)
  const er = app.errors?.[app.errors.length - 1], old = !er && app.prevErrors?.[app.prevErrors.length - 1];
  const e = er || (old && Date.now() - (old.at || 0) < 2 * 3600e3 ? old : null);
  if (e) {
    ctx.font = `11px ${FONT_C}`; ctx.fillStyle = 'rgba(255,190,190,0.85)';
    ctx.fillText(`${er ? 'error' : 'earlier error'}: ${e.msg} | ${e.where || e.frame} | ${e.scene} L${e.level} x${e.x ?? '-'} t${e.tick}`.slice(0, 160), W / 2, H - 10);
  }
}

export function drawGameOver(ctx, app) {
  ctx.fillStyle = 'rgba(20,10,20,0.75)'; ctx.fillRect(0, 0, W, H);
  outlined(ctx, 'GAME OVER', W / 2, 210, 80, '#ff6a4a', FONT_T, 0.14, 'center');
  outlined(ctx, 'CONTINUE?', W / 2, 300, 44, '#ffe066', FONT_B, 0.24, 'center');
  ctx.font = `bold 20px ${FONT_C}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.fillText(`${app.promptText('start', 'to jump back in!')}  Heroes never give up.`, W / 2, 348);
}

export function drawClear(ctx, app) {
  const t = app.sceneT;
  stageBackdrop(ctx, app, 1200, 0.5);
  const gr = ctx.createLinearGradient(0, 70, 0, 140); gr.addColorStop(0, '#ffe36a'); gr.addColorStop(1, '#ff8a2a');
  const s = t < 20 ? 0.5 + t / 40 : 1;
  ctx.save(); ctx.translate(W / 2, 120); ctx.scale(s, s);
  outlined(ctx, 'STAGE CLEAR!', 0, 0, 68, gr, FONT_T, 0.15, 'center');
  ctx.restore();
  // the heroes celebrate
  // (one or two as ever; three or four closer and smaller, all on screen)
  const hs = app.run.heroes || [], nh = hs.length, step = nh <= 2 ? 120 : 260 / (nh - 1), hx0 = nh <= 2 ? 690 : 630, hk = nh <= 2 ? 1.15 : nh === 3 ? 1.0 : 0.88;
  hs.forEach((id, i) => drawHero(ctx, id, 'victory', app.time + i, hx0 + i * step, 470, hk, -1, app.time, app.selMem['v' + i] || (app.selMem['v' + i] = {})));
  const rows = app.tally || [];
  if (isSI()) drawTallySI(ctx, app, rows, t);   // (Book Two: a navy plate, each number counting up, the doubloon row with its coin)
  else rows.forEach((r, i) => {
    if (t < 50 + i * 30) return;
    outlined(ctx, r[0], 90, 220 + i * 46, 28, '#fff1d6', FONT_B, 0.24, 'left');
    outlined(ctx, String(r[1]), 560, 220 + i * 46, 28, '#ffe066', FONT_B, 0.24, 'right');
  });
  const m = app.clearMenu;
  if (m && isSI()) drawClearMenuSI(ctx, m, rows.length, app);   // (Book Two: on the tally's plate)
  else if (m) m.items.forEach((it, i) => {                    // NEXT STAGE / LEVEL SELECT
    const on = m.sel === i, y = 470 + i * 40;
    if (on) outlined(ctx, '▶', 230, y, 28, '#ffe066', FONT_B, 0.24, 'center');
    outlined(ctx, it.label, 250, y, 30, on ? '#ffe066' : '#fff1d6', FONT_B, 0.24, 'left');
  });
}

export function drawEnd(ctx, app) {
  if (isMM()) { drawEndMM(ctx, app); return; }
  if (isSI()) { drawEndSI(ctx, app); return; }
  stageBackdrop(ctx, app, 140, 0.55);
  const img = app.img;
  panel(ctx, img.title_ana, 600, 90, 100, 136, -0.05, img.title_ana && [img.title_ana.width * 0.18, 0, img.title_ana.width * 0.7, img.title_ana.width * 0.7 * 136 / 100]);
  panel(ctx, img.title, 712, 60, 120, 170, 0.02, img.title && [0, 0, img.title.width, img.title.width * 170 / 120]);
  panel(ctx, img.title_sha, 846, 90, 100, 136, 0.05, img.title_sha && [img.title_sha.width * 0.14, 0, img.title_sha.width * 0.7, img.title_sha.width * 0.7 * 136 / 100]);
  panel(ctx, img.title_sca, 760, 250, 96, 128, -0.04, img.title_sca && [img.title_sca.width * 0.15, 0, img.title_sca.width * 0.7, img.title_sca.width * 0.7 * 128 / 96]);
  outlined(ctx, 'THE END...?', 60, 110, 60, '#ffe066', FONT_T, 0.15);
  let y = 150;
  y += caption(ctx, 'The Dragon Clan is free, the Ember Crown is broken, and three friends kept their promise at the old oak.', 60, y, 500, 1, 19) + 14;
  y += caption(ctx, 'But who was the stranger in the hood...?', 60, y, 500, 1, 19) + 18;
  ctx.font = `bold 19px ${FONT_C}`; ctx.fillStyle = '#fff6e6'; ctx.textAlign = 'left';
  ctx.fillText(`Final score: ${app.run.score}`, 64, y + 14);
  ctx.fillText(`Whelps rescued: ${app.run.freed}`, 64, y + 40);   // (the ones freed in fights; "Baby dragons x/8" is the cages)
  ctx.fillText('Thanks for playing!', 64, y + 66);
  if (!queenReady()) {   // (the secret ending's teaser: docs/SECRETS_SCRIPT.md QUEEN_TEASER -- and a hint by what's missing)
    const P = progress(), T = QUEEN_TEASER, s = P.shards.length, d = P.dragons.length;
    outlined(ctx, T.line.replace('{s}', s).replace('{d}', d), 64, y + 104, 21, '#bff0ff', FONT_B, 0.28);
    ctx.font = `bold 17px ${FONT_C}`; ctx.textAlign = 'left'; ctx.lineJoin = 'round';   // (inked: it was faint on the sky)
    const tl = s < 3 && d < 8 ? T.both : s < 3 ? T.shards : T.dragons;
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(tl, 64, y + 130); ctx.fillStyle = '#e8fbff'; ctx.fillText(tl, 64, y + 130);
  }
  if (blink(app.time)) { ctx.save(); sipulse(ctx, app.time); outlined(ctx, app.promptText('confirm', 'for the title screen'), 64, 512, 24, '#fff', FONT_B, 0.24); ctx.restore(); }
}

/** Mystic Mountain's end card (after mm_epilogue): the trio, the valley's colour back -- and Book Three to come */
function drawEndMM(ctx, app) {
  stageBackdrop(ctx, app, 140, 0.5);
  const img = app.img;
  panel(ctx, img.title_ana, 600, 90, 100, 136, -0.05, img.title_ana && [img.title_ana.width * 0.18, 0, img.title_ana.width * 0.7, img.title_ana.width * 0.7 * 136 / 100]);
  panel(ctx, img.title, 712, 60, 120, 170, 0.02, img.title && [0, 0, img.title.width, img.title.width * 170 / 120]);
  panel(ctx, img.title_sha, 846, 90, 100, 136, 0.05, img.title_sha && [img.title_sha.width * 0.14, 0, img.title_sha.width * 0.7, img.title_sha.width * 0.7 * 136 / 100]);
  outlined(ctx, 'THE END', 60, 110, 60, '#ffe066', FONT_T, 0.15);
  let y = 150;
  // (fresh words: the epilogue just said "one... of three" and TO BE CONTINUED -- the card doesn't repeat them)
  y += caption(ctx, 'Morvath is a grumpy crow, the storm is gone, and the valley has all its colors back.', 60, y, 500, 1, 19) + 14;
  y += caption(ctx, 'Next stop: SKULL ISLAND.', 60, y, 500, 1, 19) + 18;
  ctx.font = `bold 19px ${FONT_C}`; ctx.fillStyle = '#fff6e6'; ctx.textAlign = 'left';
  ctx.fillText(`Final score: ${app.run.score}`, 64, y + 14);
  ctx.fillText('Thanks for playing!', 64, y + 40);
  outlined(ctx, SI_ENABLED ? 'More adventures await... Play SKULL ISLAND (Book 2)!' : "More adventures await... Play DODONGO'S QUEST (Book 3)!", 64, y + 88, 20, '#ffe9a0', FONT_B, 0.28);   // (the epilogue's end card's words)
  outlined(ctx, "(Pick it on the title's QUEST row.)", 64, y + 114, 17, '#fff1d6', FONT_B, 0.28);
  if (blink(app.time)) { ctx.save(); sipulse(ctx, app.time); outlined(ctx, app.promptText('confirm', 'for the title screen'), 64, 512, 24, '#fff', FONT_B, 0.24); ctx.restore(); }
}

/** Skull Island's end card (the book's last page): the three roads at sunset behind it (src/stages/siroads.js, src/main.js siEnd), the book's closing words and the pointer on to Book Three (Dodongo's Quest) */
function drawEndSI(ctx, app) {
  stageBackdrop(ctx, app, 0, 0.42);
  const img = app.img;
  // (the four heroes as four equal cards, a 2 x 2 grid pinned up beside the words -- three in a row with Scarlet hung under
  //  them read as a mistake; a slight alternate tilt, each card cropped to the hero's own column of the painting)
  const CW = 146, CH = 196, cards = [[img.title, 0.1, 0.8], [img.title_ana, 0.18, 0.7], [img.title_sha, 0.14, 0.7], [siImg(app, 'title_sca'), 0.15, 0.7]];
  cards.forEach(([im, c0, cw], i) => {
    const x = 584 + (i % 2) * (CW + 26), y = 64 + (i >> 1) * (CH + 22);   // (the grid's right edge, frame and all, at x 908: inside a TV's action-safe area)
    panel(ctx, im, x, y, CW, CH, [-0.035, 0.03, 0.025, -0.03][i], im && [im.width * c0, 0, im.width * cw, Math.min(im.height, im.width * cw * CH / CW)]);
    if (i === 3) {   // (Scarlet: the one who joined -- "Three heroes. Three journeys." beside four cards: her ribbon says so)
      ctx.save(); ctx.translate(x + CW / 2, y + CH - 16); ctx.rotate(-0.07);
      const RW = CW / 2 + 2;   // (inside the card's frame: the right end clear of the safe edge)
      ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-RW - 4, -17); ctx.lineTo(RW + 4, -17); ctx.lineTo(RW - 4, 0); ctx.lineTo(RW + 4, 17); ctx.lineTo(-RW - 4, 17); ctx.lineTo(-RW + 4, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = SI_GOLD; ctx.beginPath(); ctx.moveTo(-RW, -14); ctx.lineTo(RW, -14); ctx.lineTo(RW - 7, 0); ctx.lineTo(RW, 14); ctx.lineTo(-RW, 14); ctx.lineTo(-RW + 7, 0); ctx.closePath(); ctx.fill();
      outlined(ctx, 'NEW CREW MATE!', 0, 8, 21, '#fff6e6', FONT_B, 0.24, 'center');
      ctx.restore();
    }
  });
  outlined(ctx, 'TO BE CONTINUED...', 60, 110, 54, '#ffe066', FONT_T, 0.15);
  let y = 150;
  y += siCaption(ctx, 'Three heroes. Three journeys. One last wizard.', 60, y, 480, 24, '#ffd86a') + 12;   // (the book's closing words on the navy plates: one panel style on the card)
  y += siCaption(ctx, 'The King is free, the Palace of the Sun shines again... and somewhere far away, a third wizard is waiting.', 60, y, 480, 19, '#f4e6c0') + 18;
  // (the small print on a navy plate with a gold rim: it sat as bare cream text on the busy deck and its props)
  siPlate(ctx, 52, y - 4, 488, 138);
  outlined(ctx, `Final score: ${app.run.score}`, 70, y + 26, 22, '#fff6e6', FONT_B, 0.26);
  outlined(ctx, 'Thanks for playing!', 330, y + 26, 22, '#fff6e6', FONT_B, 0.26);
  doubloon(ctx, 84, y + 64, 13, app.time);
  outlined(ctx, "Next: DODONGO'S QUEST (Book 3)!", 106, y + 74, 26, '#ffd86a', FONT_B, 0.26);
  outlined(ctx, "Pick it on the title's QUEST row.", 106, y + 106, 20, '#e8f2ff', FONT_B, 0.26);
  { const pt = app.promptText('confirm', 'for the title screen'); ctx.font = `24px ${FONT_B}`; const pw = ctx.measureText(pt).width + 32; siPlate(ctx, 52, 480, pw, 32);   // (Book Two: the prompt on a navy plate, not bare on the busy floor; its words pulse, no on/off blink)
    ctx.save(); ctx.globalAlpha = 0.72 + 0.28 * Math.sin(app.time * 3.4); outlined(ctx, pt, 68, 505, 24, '#fff', FONT_B, 0.24); ctx.restore(); }
}

/** the TRUE ENDING card (docs/SECRETS.md): the Queen awake, the Clan together; Dragon Dodongo unlocked */
export function drawTrueEnd(ctx, app) {
  const t = app.sceneT;
  stageBackdrop(ctx, app, 140, 0.45);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(W / 2, 170, 10, W / 2, 170, 420); g.addColorStop(0, 'rgba(255,236,170,0.55)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const s = t < 30 ? 0.6 + t / 75 : 1;
  ctx.save(); ctx.translate(W / 2, 120); ctx.scale(s, s);
  const gr = ctx.createLinearGradient(0, -40, 0, 20); gr.addColorStop(0, '#fff6c0'); gr.addColorStop(1, '#ffb02e');
  outlined(ctx, 'THE TRUE END', 0, 0, 72, gr, FONT_T, 0.14, 'center');
  ctx.restore();
  let y = 180;
  ctx.textAlign = 'center';
  y += caption(ctx, 'The Heartstone shines again. The Dragon Queen is awake, and every baby dragon of the Clan is home.', W / 2 - 300, y, 600, 1, 20) + 14;
  y += caption(ctx, 'She told Dodongo the dragon in his heart is his to call, any time he needs it.', W / 2 - 300, y, 600, 1, 20) + 26;
  if (t > 60) outlined(ctx, 'DRAGON DODONGO UNLOCKED!', W / 2, y + 20, 34, '#ffd23a', FONT_B, 0.24, 'center');
  if (t > 90) outlined(ctx, `${app.lastCtrl === 'touch' ? 'Tap' : 'Press'} ▲▼ on Dodongo's card to become a dragon!`, W / 2, y + 54, 20, '#fff6e6', FONT_B, 0.24, 'center');
  outlined(ctx, `Final score: ${app.run.score}`, W / 2, H - 62, 20, '#fff6e6', FONT_B, 0.24, 'center');
  if (blink(app.time) && t > 90) outlined(ctx, app.promptText('confirm', 'for the title screen'), W / 2, H - 26, 24, '#fff', FONT_B, 0.24, 'center');
  for (let i = 0; i < 18; i++) {   // (a few gold sparkles)
    const k = ((app.time * 0.25 + i / 18) % 1), x = (i * 137) % W, yy = H - k * H;
    ctx.fillStyle = `rgba(255,240,180,${0.8 * Math.sin(k * Math.PI)})`; ctx.beginPath(); ctx.arc(x, yy, 2.5, 0, TAU); ctx.fill();
  }
}

export function drawLoading(ctx, app) {
  if (isSI()) { drawLoadingSI(ctx, app); return; }
  ctx.fillStyle = '#1b1426'; ctx.fillRect(0, 0, W, H);
  outlined(ctx, 'LOADING...', W / 2, H / 2, 36, '#ffe066', FONT_B, 0.24, 'center');
  const k = (app.time * 1.5) % 1;
  ctx.fillStyle = '#ffb02e'; ctx.fillRect(W / 2 - 100, H / 2 + 20, 200 * k, 6);
}

// ================================================================================================ Skull Island's own UI
// (Book Two's colours: a deep sea navy and a doubloon gold -- the boss card, the loading card, the end card's plate)
export const SI_NAVY = '#0f1a33', SI_GOLD = '#f2c14a';
/** a gold doubloon (r: its radius; t: a slow spin -- 0 flat): a coin with a raised rim and a little sun on it */
export function doubloon(ctx, x, y, r, t = 0) {
  const sx = t ? Math.max(0.4, Math.abs(Math.cos(t * 1.5))) : 1;   // (never edge-on: a sliver read as a glitch)
  ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = '#e8a82e'; ctx.fill(); ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.fillStyle = '#ffd45a'; ctx.fill();
  ctx.fillStyle = '#e8a82e'; ctx.beginPath();
  for (let i = 0; i < 16; i++) { const rr = i % 2 ? r * 0.28 : r * 0.56, a = (i / 16) * TAU; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.24, 0, TAU); ctx.fillStyle = '#fff1b0'; ctx.fill();
  ctx.globalAlpha *= 0.7; ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.4, r * 0.18, r * 0.1, -0.7, 0, TAU); ctx.fill();
  ctx.restore();
}
/** Book Two: where the boss's block goes -- [centre x, bar top].  Its home unless that sits on the boss's crown (the Kraken's
 *  head: its stage-written crown point K.sx / K.sy, else the top of its box) or on the King's crystal (the palace); then
 *  the nearest spot along the row that is clear of those, of the HUD's boxes and of the corner buttons -- in 1-2P also one
 *  row lower, under the panels.  A spot already taken is kept while it stays clear (no flip-flop as the head sways). */
/** Book Two: the screen rects the HUD keeps off for boss B -- its own hudKeep() (the Leviathan's raised head), the Kraken's
 *  crown point, else the top of its box; the King's crystal in the palace */
function siKeepRects(world, B) {
  const camX = world.camX, keep = [];
  const hk = typeof B.hudKeep === 'function' ? B.hudKeep() : B.hudKeep;
  if (hk) keep.push(hk);
  else if (B.K && B.K.sx !== undefined) keep.push([B.K.sx - 118, B.K.sy - 12, B.K.sx + 118, B.K.sy + 100]);
  else { const hx = B.x - camX, hy = FLOOR_TOP + B.y - (B.z || 0) - (B.h || 0), hw = Math.max(60, (B.w || 60) * 0.75); keep.push([hx - hw, hy - 8, hx + hw, hy + Math.min(110, (B.h || 0) * 0.3)]); }
  if (world.L?.palace) { const kx = PAL.CRYSTAL_X - camX; keep.push([kx - 50, PAL.CRYSTAL_Y - 80, kx + 50, PAL.CRYSTAL_Y + 20]); }
  return keep;
}
/** Book Two, the palace (QAF3): a spot for the TEAM UP chip (pw x ph at scale 1) inside the HUD band -- beside the boss block, at
 *  its rows, clear of the King's crystal, the boss's head, the panels and the corner buttons, shrunk to 0.9 / 0.82 if it must.
 *  Under the FEELINGS row it covered the Sad Cloud's top and touched the P-tags.  The spot taken is kept while it stays clear.
 *  Returns [x0, y0, scale] or null (none clear: the chip goes under the band as in the other fights). */
export function siChipSpot(world, app, pw, ph) {
  const B = world.boss, blk = world._bossBlock;
  if (!world.L?.palace || !B || !B.alive || B.gone || !blk) return (world._chipSpot = null);
  // (clear of everything, each with its own margin [x0, y0, x1, y1, m] -- the critics: it touched the crystal, Malachar's staff orb
  //  at 2P, the mirror's frame at 4P: the boss's head box grown 14 px for his staff, 14 px from it, the boss block, the panels and
  //  the corner buttons; 6 from the crystal's keep box (it has its own pad).  The throne mirror (the wall strip, parallax 1: its gold
  //  ring's ellipse rx 62 + its ink round MIRROR_X) is avoided, 6 px clear, at the fight's own camera -- shrunk to 0.76 / 0.75 if it
  //  must (its P-tags stay >= 18 px); only when nothing fits does it overlap the mirror (RC: the reshoot's 4P chip lay on the rim)
  const [hk, ...keep] = siKeepRects(world, B), mx = PAL.MIRROR_X - world.camX;
  const hard = [[hk[0] - 14, hk[1] - 14, hk[2] + 14, hk[3] + 14, 14], ...keep.map((r) => [...r, 6]), [...blk, 14], ...(app._hudBoxes || []).map((b) => [b.x0, b.y0, b.x1, b.y1, 14])];
  const C = app.cornerBox?.(); if (C) hard.push([C.x0, 0, W, C.y1, 14]);
  const soft = [[mx - 65, 40, mx + 65, 330, 6]];
  const clear = (x, y, k, obst) => { const w = pw * k, h = ph * k; return x >= 48 && x + w <= 912 && y >= 27 && !obst.some(([a, b, c, d, m]) => x + w + m > a && x - m < c && y + h + m > b && y - m < d); };
  const S = world._chipSpot;
  if (S && S.pw === pw && S.soft && clear(S[0], S[1], S[2], [...hard, ...soft])) return S;   // (kept while clear; a spot over the mirror is looked for again every frame -- the camera may give room back)
  for (const obst of [[...hard, ...soft], hard]) {
    for (const k of [1, 0.9, 0.82, 0.76, 0.75]) {
      const yMid = Math.round((blk[1] + blk[3]) / 2 - (ph * k) / 2);
      for (const dy of [0, -8, 8, -16, 16, -24, 24, -32, 32, -40, 40]) {
        const y = yMid + dy;
        for (let s = 0; s < 460; s += 2) for (const x of [blk[2] + 10 + s, blk[0] - 10 - pw * k - s]) if (clear(x, y, k, obst)) { const R = [Math.round(x), y, k]; R.pw = pw; R.soft = obst.length > hard.length; return (world._chipSpot = R); }
      }
    }
  }
  return (world._chipSpot = null);
}
function siBossSpot(world, app, B, cx, top, compact, boxes, HY = 0, half0 = 152) {
  // (half: the bar's 300 px and its outline; halfL: a meter reaching further left -- the palace's FEELINGS label: B.meterLeft;
  //  the spot keeps the whole block inside a TV's action-safe area, x 48..912)
  const meter = B.meterHud ? (B.meterH ?? 28) : 0, half = half0, halfL = Math.max(half, B.meterLeft ?? 0);
  const keep = siKeepRects(world, B);   // (the boss's head / crown, the King's crystal at every party size)
  const all = [...keep, ...boxes.filter((b) => !(compact && b.name === 'score')).map((b) => [b.x0, b.y0, b.x1, b.y1])];
  const C = app.cornerBox?.(); if (C) all.push([C.x0, 0, W, C.y1]);
  const box = (x, t) => [x - halfL, HY + (compact ? Math.min(t - 18, 66) : t - 20), x + half, HY + t + 21 + meter];   // (screen y: the HUD is drawn HY lower)
  const inside = (x) => x - halfL >= 48 && x + half <= 912;
  const hit = (R, x, t, m = 0) => { const [a, b, c, d] = box(x, t); return R.some(([p, q, r, s]) => c + m > p && a - m < r && d + m > q && b - m < s); };
  // (RC: the block jumped side to side every ~0.75 s in the Kraken fight -- its crown sways a few px either side of the middle and
  //  the spots left and right of it each touched it in turn: 110 jumps.  Now (1) the target holds BOSS_SPOT_HOLD frames after
  //  any move -- home, aside or back -- so it moves at most once every 4 s; (2) while the boss's head is near the middle the
  //  block never crosses from one side to the other: it stays put even if the head brushes it; (3) leaving home needs a real
  //  overlap and coming back needs it clear by a wider margin.)
  const S = world._bossSpot, cur = S && S.tx !== undefined ? [S.tx, S.tt] : null;
  const held = cur && world.frame - (S.at ?? -1e9) < BOSS_SPOT_HOLD;
  if (held) return cur;
  const atHome = !cur || (cur[0] === cx && cur[1] === top);
  if (!hit(keep, cx, top, atHome ? 24 : 56)) return [cx, top];
  const kc = keep.length ? (keep[0][0] + keep[0][2]) / 2 : W / 2, mid = Math.abs(kc - W / 2) < BOSS_SPOT_MID;
  if (cur && !atHome) {
    if (mid) return cur;   // (the head near the middle: no crossing over)
    if (inside(cur[0]) && !hit(all, cur[0], cur[1])) return cur;
  }
  // (a new spot: the side away from the head first, then the nearest along the row; one row lower in 1-2P)
  const away = kc < W / 2 ? 1 : -1;
  for (const dt of compact ? [0] : [0, 48]) {
    const t = top + dt;
    for (let s = 4; s < W; s += 4) for (const x of [cx + away * s, cx - away * s]) if (inside(x) && !hit(all, x, t)) return [x, t];
  }
  return cur || [cx, top];
}
const BOSS_SPOT_HOLD = 240, BOSS_SPOT_MID = 160;   // (frames a moved boss block stays put; px either side of the middle where it never crosses)
/** a caption on a navy plate (Book Two's end card): the text wrapped to w, returns the height */
function siCaption(ctx, text, x, y, w, size, col) {
  ctx.save(); ctx.font = `bold ${size}px ${FONT_C}`;
  const lines = wrap(ctx, text, w - 32), h = lines.length * (size + 6) + 22;
  siPlate(ctx, x, y, w, h);
  ctx.font = `bold ${size}px ${FONT_C}`; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x + 16, y + 12 + i * (size + 6)));
  ctx.restore();
  return h;
}
/** a navy plate with a gold rim (the end card's small print) */
function siPlate(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(ctx, x + 6, y + 7, w, h, 12); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(22,38,74,0.94)'); g.addColorStop(1, 'rgba(12,22,46,0.94)');
  ctx.fillStyle = g; roundRect(ctx, x, y, w, h, 12); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = SI_GOLD; roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 9); ctx.stroke();
  ctx.restore();
}
/** Skull Island's boss card: a navy band that opens from the middle, gold rules studded with doubloons, the name in gold */
const SI_FACE_K = { 'THE ELDER TREE': 0.62, 'THE KRAKEN': 0.63, MALACHAR: 1.04 };   // (the Elder: 0.46 -> 0.62, its eyes and crown clear of the band -- QAF capture)
function drawBossCardSI(ctx, world, k) {
  const b = world.boss;
  const a = clamp(k / 0.08, 0, 1) * clamp((1 - k) / 0.14, 0, 1), open = easeOut(clamp(k / 0.12, 0, 1)), shut = easeIn(clamp((k - 0.86) / 0.14, 0, 1));
  // (world.cardSpan [x0, x1]: the band keeps to that stretch of the screen -- the Leviathan's, beside its head: src/sileviathan.js drawCard)
  const sp = world.cardSpan, sx0 = sp ? sp[0] : 0, sw = sp ? sp[1] - sp[0] : W;
  const bw = sw * open * (1 - shut), x0 = sx0 + (sw - bw) / 2, bh = 104;
  if (bw < 2 || !b) return;
  // (the band keeps off the boss's face: its home at 116 when the face is below it (the Rage Alpha), else raised to clear it
  //  -- the Sloth Beast's hood, the Elder Tree's eyes (half-way up its trunk), the Kraken's eyes, Malachar's mask --
  //  never above the letterbox; SI_FACE_K: the top of the face as a share of the boss's height, from the floor)
  const faceTop = FLOOR_TOP + b.y - (b.z || 0) - (b.h || 0) * (b.faceK ?? SI_FACE_K[b.name] ?? 1);
  const y0 = !Number.isFinite(faceTop) || faceTop >= 116 + bh + 34 ? 116 : clamp(Math.round(faceTop - 34 - bh), 44, 116);   // (a card drawn for an actor with no box -- the Leviathan's own card: at home)
  ctx.save(); ctx.globalAlpha = a;
  const g = ctx.createLinearGradient(0, y0, 0, y0 + bh); g.addColorStop(0, 'rgba(20,36,72,0.92)'); g.addColorStop(0.5, 'rgba(14,26,54,0.94)'); g.addColorStop(1, 'rgba(20,36,72,0.92)');
  ctx.fillStyle = g; ctx.fillRect(x0, y0, bw, bh);
  ctx.fillStyle = INK; ctx.fillRect(x0, y0 - 2, bw, 8); ctx.fillRect(x0, y0 + bh - 6, bw, 8);
  ctx.fillStyle = SI_GOLD; ctx.fillRect(x0, y0, bw, 4); ctx.fillRect(x0, y0 + bh - 4, bw, 4);
  ctx.beginPath(); ctx.rect(x0, y0 - 14, bw, bh + 28); ctx.clip();
  for (let x = 40; x < W; x += 110) { doubloon(ctx, x, y0 + 2, 7); doubloon(ctx, x + 55, y0 + bh - 2, 7); }
  // (the name: slides in a touch and settles; gold, inked; a doubloon either side)
  const nk = easeOut(clamp((k - 0.04) / 0.14, 0, 1)), nx = sx0 + sw / 2 + (1 - nk) * 60;
  ctx.globalAlpha = a * nk;
  ctx.font = `50px ${FONT_T}`; let nw = ctx.measureText(b.name).width;
  const ns = Math.min(50, Math.floor(50 * (sw - 100) / Math.max(1, nw)));   // (a narrow span: the name smaller, its doubloons inside the band)
  if (ns < 50) { ctx.font = `${ns}px ${FONT_T}`; nw = ctx.measureText(b.name).width; }
  const ng = ctx.createLinearGradient(0, y0 + 26, 0, y0 + 70); ng.addColorStop(0, '#fff6c8'); ng.addColorStop(0.55, '#ffd45a'); ng.addColorStop(1, '#e89a2a');
  outlined(ctx, b.name, nx, y0 + 66, ns, ng, FONT_T, 0.15, 'center');
  const tt = world.time || 0;
  doubloon(ctx, nx - nw / 2 - 30, y0 + 48, 14, tt * 0.5 + 0.01); doubloon(ctx, nx + nw / 2 + 30, y0 + 48, 14, tt * 0.5 + 0.7);
  const title = BOSS_TITLES[b.name] || b.title || '';
  if (title) { ctx.font = `bold 20px ${FONT_C}`; ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(title, nx, y0 + 91); ctx.fillStyle = '#f4ead2'; ctx.fillText(title, nx, y0 + 91); }
  ctx.restore();
}
const SI_LOAD_TIPS = [
  'Pirate tip: two friends SUPER together, close by = a TEAM ATTACK!',
  'Pirate tip: one golden DOUBLOON is hidden in every stage. Look for the glint!',
  'Pirate tip: DODGE right as an attack lands for a PERFECT dodge.',
  'Pirate tip: a RED ring on the floor means MOVE!',
  'Pirate tip: HOLD attack, then let go, for a big strike.',
];
/** Skull Island's loading card: the sea-night navy, a doubloon spinning, LOADING... in gold, a row of dots, a tip */
function drawLoadingSI(ctx, app) {
  const t = app.time;
  const g = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 560); g.addColorStop(0, '#1a2a52'); g.addColorStop(1, SI_NAVY);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  doubloon(ctx, W / 2, H / 2 - 30, 30, t + 0.01);
  outlined(ctx, 'LOADING...', W / 2, H / 2 + 34, 30, '#ffd86a', FONT_B, 0.24, 'center');
  const tip = SI_LOAD_TIPS[Math.floor(app.frame / 900) % SI_LOAD_TIPS.length];   // (a pirate's tip while it loads: the same one for a whole load)
  ctx.font = `bold 18px ${FONT_C}`; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = INK;
  ctx.strokeText(tip, W / 2, H - 70); ctx.fillStyle = '#e8f0ff'; ctx.fillText(tip, W / 2, H - 70);
  for (let i = 0; i < 5; i++) {   // (a little row of dots that fill in turn)
    const on = ((t * 4) | 0) % 6 > i;
    ctx.beginPath(); ctx.arc(W / 2 - 40 + i * 20, H / 2 + 58, 4.5, 0, TAU); ctx.fillStyle = on ? SI_GOLD : 'rgba(242,193,74,0.25)'; ctx.fill();
  }
}

/** Book Two's pause tip: the stage's own trick (it said the Blue Gull's lasso tip in every stage) */
const SI_PAUSE_TIPS = {
  sibluegull: 'Caught in a lasso or a net? MASH attack, or a friend bonks the sailor!',
  sikraken: 'A RED ring = a tentacle slam: step away! Grabbed? MASH attack!',
  sicave: 'Wolves GROW when you mash! Poke once, step back, or HOLD attack.',
  siswamp: 'Trees run from FIRE: grab a torch! In the glowing circle, HOLD shoot.',
  sicell: 'Keep MOVING or the fog makes you sleepy! Swallowed? MASH attack!',
  sipalace: 'Stay CALM, SHIELD a sad friend, LIGHT scares fear, ROLL from the gulp!',
  sitreasure: "Whack the chests for doubloons, and watch for Blunderbeard's RED lane!",
}
/** Book Two's clear-card tally: a navy plate; each row slides in and its number counts up; the doubloon row has its coin */
function drawTallySI(ctx, app, rows, t) {
  const shown = rows.filter((r, i) => t >= 50 + i * 30).length;
  if (!shown) return;
  const y0 = 220, step = 44, total = rows.length - 1;
  siPlate(ctx, 64, y0 - 40, 528, step * rows.length + 24 + (app.clearMenu ? 92 : 0));
  rows.forEach((r, i) => {
    const t0 = 50 + i * 30; if (t < t0) return;
    const k = clamp((t - t0) / 12, 0, 1), e = easeOut(k), y = y0 + i * step, isTotal = i === total;
    ctx.save(); ctx.globalAlpha = k; ctx.translate((1 - e) * -24, 0);
    if (isTotal) { ctx.fillStyle = SI_GOLD; ctx.fillRect(84, y - 34, 490, 3); }
    outlined(ctx, r[0], 90, y, 28, isTotal ? '#ffd86a' : '#fff1d6', FONT_B, 0.24, 'left');
    let v = r[1];
    if (typeof v === 'number') { const c = clamp((t - t0) / 26, 0, 1); v = Math.round(v * (1 - Math.pow(1 - c, 3))); }
    if (/^DOUBLOON/.test(String(r[0]))) { ctx.font = `28px ${FONT_B}`; doubloon(ctx, 90 + ctx.measureText(r[0]).width + 20, y - 10, 12, /FOUND!/.test(String(r[1])) ? app.time : 0); }   // (the coin right after its label)
    outlined(ctx, String(v), 560, y, isTotal ? 32 : 28, isTotal ? '#ffd86a' : '#ffe066', FONT_B, 0.24, 'right');
    ctx.restore();
  });
}

/** Book Two's clear-card menu (NEXT STAGE / LEVEL SELECT) on the tally's plate, under a gold rule */
function drawClearMenuSI(ctx, m, nRows, app) {
  const y = 220 + nRows * 44 + 4;
  ctx.fillStyle = 'rgba(242,193,74,0.5)'; ctx.fillRect(84, y - 30, 490, 2);
  if (app) siFocus(ctx, app, m.items, m.sel, 122, y + 8, 30, 40);
  m.items.forEach((it, i) => {
    const on = m.sel === i, yy = y + 8 + i * 40;
    outlined(ctx, it.label, 132, yy, 30, on ? '#ffe066' : '#fff1d6', FONT_B, 0.24, 'left');
  });
}
/** Book Two's menu focus: a navy-and-gold pill that slides (eased) to the selected row, a gold marker bobbing at its left,
 * and a brief brighter flash when the row is pressed (app._menuPressT: src/main.js menuNav) */
function siFocus(ctx, app, items, sel, x, y, size, gap) {
  const F = app._siFocus || (app._siFocus = { y: null, items: null });
  const ty = y + sel * gap;
  if (F.items !== items || F.y === null) { F.y = ty; F.items = items; F.f = app.frame; }
  const df = Math.max(0, Math.min(10, app.frame - (F.f ?? app.frame))); F.f = app.frame;
  F.y += (ty - F.y) * (1 - Math.pow(0.8, df)); if (Math.abs(ty - F.y) < 0.4) F.y = ty;   // (0.2 of the way per game frame: about 150 ms)
  const press = app._menuPressT != null ? Math.max(0, 1 - (app.time - app._menuPressT) / 0.22) : 0;
  const it = items[sel], w = Math.max(220, Math.min(560, (() => { ctx.font = `${size}px ${FONT_B}`; return ctx.measureText(it?.label || '').width + 56; })()));
  const yy = F.y, sc = 1 + 0.04 * press, ph = Math.min(size + 10, gap - 4), pc = yy - size * 0.36;   // (pc: the text's optical middle; the pill never taller than the row pitch)
  ctx.save(); ctx.translate(x - 14 + w / 2, pc); ctx.scale(sc, sc); ctx.translate(-(x - 14 + w / 2), -pc);
  const g = ctx.createLinearGradient(x - 14, 0, x - 14 + w, 0); g.addColorStop(0, `rgba(242,193,74,${0.34 + 0.4 * press})`); g.addColorStop(1, 'rgba(242,193,74,0.06)');
  ctx.fillStyle = g; roundRect(ctx, x - 14, pc - ph / 2, w, ph, Math.min(10, ph / 2)); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = `rgba(242,193,74,${0.75 + 0.25 * press})`; ctx.stroke();
  ctx.restore();
  const bob = Math.sin(app.time * 6) * 3;
  outlined(ctx, '▶', x - 6 + bob, yy, size * 0.8, '#ffd23a', FONT_B, 0.22, 'right');
}
/** Book Two's section banner: the name in gold on a short navy ribbon with swallow-tail ends, unrolling from the middle */
function siBanner(ctx, text, x, y, a, t) {
  const open = easeOut(clamp((180 - t) / 16, 0, 1));
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = `30px ${FONT_B}`; const tw = ctx.measureText(text).width, hw = (tw / 2 + 34) * open, h = 40, cy = y - 10;
  if (hw > 4) {
    ctx.beginPath();
    ctx.moveTo(x - hw - 16, cy - h / 2 + 4); ctx.lineTo(x - hw, cy - h / 2); ctx.lineTo(x + hw, cy - h / 2); ctx.lineTo(x + hw + 16, cy - h / 2 + 4);
    ctx.lineTo(x + hw + 6, cy); ctx.lineTo(x + hw + 16, cy + h / 2 - 4); ctx.lineTo(x + hw, cy + h / 2); ctx.lineTo(x - hw, cy + h / 2); ctx.lineTo(x - hw - 16, cy + h / 2 - 4); ctx.lineTo(x - hw - 6, cy); ctx.closePath();
    ctx.fillStyle = 'rgba(15,26,51,0.88)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - hw, cy - h / 2 + 4); ctx.lineTo(x + hw, cy - h / 2 + 4); ctx.moveTo(x - hw, cy + h / 2 - 4); ctx.lineTo(x + hw, cy + h / 2 - 4);
    ctx.lineWidth = 2; ctx.strokeStyle = SI_GOLD; ctx.stroke();
  }
  ctx.globalAlpha = a * clamp((180 - t - 6) / 10, 0, 1);
  outlined(ctx, text, x, y, 30, '#ffd86a', FONT_B, 0.22, 'center');
  ctx.restore();
}
/** Book Two's stage card: a navy ribbon slides in over a sea chart's dashed course line, STAGE n in pale gold, the name in gold */
function drawStageCardSI(ctx, world, k) {
  const L = world.L;
  const inK = clamp(k / 0.15, 0, 1), outK = clamp((k - 0.8) / 0.2, 0, 1);
  const x = -W * (1 - easeOut(inK)) + W * easeIn(outK);
  ctx.save(); ctx.translate(x, -54);   // (higher than Book 1's: the heroes' heads stay clear)
  ctx.beginPath(); ctx.moveTo(0, 190); ctx.lineTo(W, 172); ctx.lineTo(W, 322); ctx.lineTo(0, 340); ctx.closePath();
  const g = ctx.createLinearGradient(0, 172, 0, 340); g.addColorStop(0, 'rgba(22,38,74,0.93)'); g.addColorStop(1, 'rgba(12,22,46,0.93)');
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 196); ctx.lineTo(W, 178); ctx.moveTo(0, 334); ctx.lineTo(W, 316); ctx.lineWidth = 3; ctx.strokeStyle = SI_GOLD; ctx.stroke();
  // (a chart's course: a dashed line to an X, the ship's path across the band)
  ctx.save(); ctx.setLineDash([10, 9]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(242,193,74,0.35)';
  ctx.beginPath(); ctx.moveTo(60, 312); ctx.bezierCurveTo(260, 300, 300, 210, 520, 214); ctx.bezierCurveTo(700, 218, 760, 296, 900, 286); ctx.stroke(); ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(232,80,60,0.6)'; ctx.beginPath(); ctx.moveTo(892, 278); ctx.lineTo(908, 294); ctx.moveTo(908, 278); ctx.lineTo(892, 294); ctx.stroke();
  const tag = L.secret ? 'SECRET STAGE' : L.bonus ? 'BONUS STAGE' : 'STAGE ' + L.num;
  ctx.font = `34px ${FONT_B}`; doubloon(ctx, W / 2 - ctx.measureText(tag).width / 2 - 22, 226, 12, 0); doubloon(ctx, W / 2 + ctx.measureText(tag).width / 2 + 22, 226, 12, 0);
  outlined(ctx, tag, W / 2, 238, 34, '#f4e6c0', FONT_B, 0.24, 'center');
  const gr = ctx.createLinearGradient(0, 248, 0, 300); gr.addColorStop(0, '#fff6c8'); gr.addColorStop(0.55, '#ffd45a'); gr.addColorStop(1, '#e89a2a');
  outlined(ctx, L.name, W / 2, 298, 58, gr, FONT_T, 0.15, 'center');
  ctx.restore();
}

export { LEVELS };
