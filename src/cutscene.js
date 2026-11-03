// Motion-comic cutscenes: comic pages whose panels are drawn live with the stage art and the character rigs, or shown
// as PAINTED panels (assets/story/<id>/: the same compositions repainted in the book's style, tools/story/) with the
// captions and balloons still drawn live on top.
import { W, H, INK } from './config.js';
import { IOS, cacheCanvas, freeCanvases } from './canvasmem.js';
import { CHARS } from './chars.js';
import { anchorOnly } from './artsets.js';
import { CUTSCENES, heroLine } from './story.js';
import { readFrames } from './game.js';
import { audio } from './audio-proxy.js';
import { TAU, clamp } from './rig.js';
import { progress, SHARDS } from './secrets.js';
import { drawFlameFace } from './wraith.js';
import { drawHeartstone, heartNotches } from './heartstone.js';
import { fetchT } from './sprite3d.js';

/** the secret ending's tokens (docs/SECRETS_SCRIPT.md): {n} the Star Shards found (a "STAR SHARD {n}/3!" title with all
 * three: "ALL 3 STAR SHARDS!"), {s} / {d} the shards / baby dragons (the end screen's teaser) */
export function fillTokens(text) {
  if (typeof text !== 'string' || !text.includes('{')) return text;
  const P = progress(), n = Math.max(1, P.shards.length);
  if (/^STAR SHARD \{n\}\/3!?$/.test(text) && n >= SHARDS) return 'ALL 3 STAR SHARDS!';
  return text.replace(/\{n\}/g, n).replace(/\{s\}/g, P.shards.length).replace(/\{d\}/g, P.dragons.length);
}

const FONT_C = '"Comic Neue", "Comic Sans MS", sans-serif';
const FONT_B = 'Bangers, Impact, sans-serif';
// standing heights (top of head above the feet, at scale 1) for art modules without META.height
const HEIGHTS = { grimscale: 250, tempest: 230, dragonking: 270, magmaw: 230, whelp: 80, kobold: 112, brute: 190, guard: 170, wyvern: 150, salamander: 60 };
// poses whose argument is the clock (looping) rather than a 0..1 phase
const TIMED = ['idle', 'talk', 'cheer', 'victory', 'select', 'hover', 'freed', 'fly', 'glide', 'taunt', 'throne', 'tinyCaged', 'tiny', 'kneel', 'grounded', 'sit', 'point', 'sleep'];

const HERO_IDS = ['dodongo', 'ana', 'shadow', 'scarlet'];
/** the character a cast slot draws: 'P1' / 'P2' are the heroes in play (P2 falls back to the trio) */
export function castId(c, heroes = []) {
  return c.c === 'P1' ? heroes[0] || 'dodongo' : c.c === 'P2' ? heroes[1] || (heroes[0] === 'ana' ? 'dodongo' : 'ana') : c.c;
}

// ------------------------------------------------------------------------------------------------ painted panels
// assets/story/story.json: { scales: [1, 2], plates: { <cutscene id>: { 'p<page>_n<panel>': { cast: [ids the painting
// shows, P1 / P2 resolved], frames: n, motion: { zoom, secs, fx, fy, fps } } } } } and per plate
// assets/story/<id>/<key>[_f<k>]_<s>x.webp.  A panel with P1 / P2 in its cast may also have hero variants
// 'p<page>_n<panel>__<P1>_<P2>' (painted for the other single-player heroes).  Loaded per cutscene (main.js playStory),
// released when it ends.
const PQ = (() => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(''); } })();
const PLATES_ON = PQ.get('plates') !== '0';            // ?plates=0: every panel drawn live (the review tools' "before")
let MANIFEST = null;
async function manifest() {
  if (MANIFEST) return MANIFEST;
  // (a failed fetch isn't kept: the next cutscene tries again)
  try {
    const r = await fetchT(new URL('../assets/story/story.json', import.meta.url), PLATE_MS);
    if (r.ok) MANIFEST = await r.json();
  } catch { /* the next cutscene retries */ }
  return MANIFEST || { plates: {} };
}
/** does this painted plate show the cast the panel draws with these heroes? */
export function plateFits(pl, panel, heroes) {
  return !!pl && (!pl.cast || pl.cast.every((id, i) => panel.cast[i] && id === castId(panel.cast[i], heroes)));
}
/** the painted plates of a cutscene that fit the heroes in play: Map key -> { frames: [ImageBitmap], motion, cast } */
function imgPlate(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    // (a stalled request: given up after PLATE_MS, like a fetch -- the panel draws live)
    const timer = setTimeout(() => { if (im.onerror) { im.onerror = null; im.onload = null; im.src = ''; rej(new Error('timed out: story plate ' + url)); } }, PLATE_MS);
    im.onload = () => { clearTimeout(timer); im.onerror = null; (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im)); };
    im.onerror = () => { clearTimeout(timer); im.onerror = null; rej(new Error('story plate ' + url)); };
    im.src = url;
  });
}
/** a plate's frames let go (an ImageBitmap closed, an <img> emptied) */
const freeFrames = (frames) => { for (const f of frames || []) { if (f?.close) f.close(); else if (f && 'src' in f) f.src = ''; } };
// (no request may hold the game on LOADING...: each plate gives up after PLATE_MS, and a cutscene's plates all together
//  after `budget` ms -- the ones not in by then draw live, and one that turns up later is let go, not swapped in)
const PLATE_MS = 10000;
export async function loadPlates(id, heroes, budget = Infinity) {
  const out = new Map(), t0 = Date.now();
  const def = CUTSCENES[id];
  if (!PLATES_ON || !def) return out;
  let sealed = false;
  const M = await manifest();
  const P = (M.plates || {})[id];
  if (!P) return out;
  const hi = (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) > 1.25 && (M.scales || [1]).includes(2);
  const s = hi ? 2 : 1;
  const jobs = [];
  def.pages.forEach((pg, a) => pg.panels.forEach((pn, b) => {
    const key = `p${pg.pk ?? a}_n${b}`;     // (pk: a page moved in the cutscene keeps its painted plate's key)
    // the panel's plate, or a hero variant of it (key__<P1>_<P2>: the P1 / P2 panels painted for another hero)
    const stem = [key, ...Object.keys(P).filter((k) => k.startsWith(key + '__'))].find((k) => plateFits(P[k], pn, heroes));
    if (!stem) return;
    const pl = P[stem];
    const n = pl.frames || 1;
    const names = n > 1 ? Array.from({ length: n }, (_, k) => `${stem}_f${k}_${s}x.webp`) : [`${stem}_${s}x.webp`];
    jobs.push(Promise.all(names.map(async (nm) => {
      const url = new URL(`../assets/story/${id}/${nm}`, import.meta.url);
      if (IOS) return imgPlate(url.href);       // (iOS: an <img>, outside the canvas memory cap -- src/canvasmem.js)
      const r = await fetchT(url, PLATE_MS);
      if (!r.ok) throw new Error(nm + ' HTTP ' + r.status);
      return createImageBitmap(await r.blob());
    })).then((frames) => { if (sealed) freeFrames(frames); else out.set(key, { frames, motion: pl.motion || {}, cast: pl.cast }); }).catch((e) => console.warn('story plate', id, key, e)));
  }));
  const left = budget - (Date.now() - t0);
  if (Number.isFinite(left)) { let timer; await Promise.race([Promise.all(jobs), new Promise((r) => { timer = setTimeout(r, Math.max(0, left)); })]); clearTimeout(timer); }
  else await Promise.all(jobs);
  sealed = true;
  return out;
}
/** the panels of a cutscene that still draw live (no fitting plate): their stages and cast atlases are what to load */
export function livePanels(id, heroes, plates) {
  const def = CUTSCENES[id], out = [];
  def?.pages.forEach((pg, a) => pg.panels.forEach((pn, b) => { if (!plates?.has(`p${pg.pk ?? a}_n${b}`)) out.push(pn); }));
  return out;
}
export function releasePlates(plates) {
  for (const pl of plates?.values() || []) { for (const f of pl.frames) { if (f.close) f.close(); else if ('src' in f) f.src = ''; } if (pl.soft) freeCanvases(pl.soft); }   // (soft: Book 2's coming-panel previews)
  plates?.clear();
}

export class Cutscene {
  /** stages: { lvlId: stageObject }, heroes: [heroId, heroId?] for the P1/P2 cast slots, plates: loadPlates() */
  constructor(app, id, stages, heroes, plates = null) {
    this.app = app; this.def = CUTSCENES[id]; this.id = id;
    this.stages = stages; this.heroes = heroes; this.plates = plates;
    this.page = 0; this.panel = 0; this.line = 0; this.t = 0; this.lineT = 0;
    this.done = !this.def;
    this.mem = {};
    if (this.def?.music) audio.music(this.def.music);
    this.enterPanel();
  }
  get pageDef() { return this.def.pages[this.page]; }
  get panelDef() { return this.pageDef.panels[this.panel]; }

  /** the text of the current beat (caption first, then each balloon) */
  beats(p) {
    const b = [];
    if (p.cap) b.push({ kind: 'cap', text: fillTokens(p.cap) });
    for (const [i, text, tag] of p.say || []) {   // (a say's optional 3rd item: a small name tag on the balloon -- an off-panel speaker)
      const c = p.cast[i];
      const hero = c && this.castHero(c);
      b.push({ kind: 'say', i, tag, text: fillTokens(hero ? heroLine(text, hero) : (typeof text === 'string' ? text : text.default || '')) });
    }
    if (!b.length) b.push({ kind: 'pause', text: 'x x x' });
    return b;
  }
  castHero(c) {
    const id = castId(c, this.heroes);
    return HERO_IDS.includes(id) ? id : null;
  }
  castArt(c) {
    const id = c.c === 'P1' || c.c === 'P2' ? this.castHero(c) : c.c;
    return anchorOnly(this.id, id) && !c.live ? null : CHARS[id];   // (an anchor only: its balloon, nothing drawn -- src/artsets.js; Skull Island's `live: true`: Malachar drawn, in the palace's stories)
  }
  enterPanel() {
    this.line = 0; this.lineT = 0; this.panelT = 0;
    const P = String(this.id || '').startsWith('si_') ? this.pageDef?.panels?.[this.panel] : null;   // (Book 2's stories only: a panel's own stinger -- si_fuse's KLIK)
    if (P?.jingle) audio.jingle?.(P.jingle, { then: this.def?.music || 'story' });
  }
  heightOf(c, art) {
    const id = c.c === 'P1' || c.c === 'P2' ? this.castHero(c) : c.c;
    return c.h ?? art?.META?.height ?? HEIGHTS[id] ?? 150;
  }
  seatOf(c, mart) {
    if (c.seat !== undefined && mart?.SEATS?.[c.seat]) return mart.SEATS[c.seat];
    return mart?.SADDLE || [0, -60];
  }

  update(skip) {
    if (this.done) return;
    this.t++; this.lineT++; this.panelT++;
    const beats = this.beats(this.panelDef);
    const cur = beats[this.line];
    // the last line of a page stays up until it's been read twice over (or a press), so pages don't flip under a slow reader
    const lastOfPage = this.line === beats.length - 1 && this.panel === this.pageDef.panels.length - 1;
    const need = Math.round((lastOfPage ? Math.max(readFrames(cur.text), 240) : readFrames(cur.text)) * (this.def.pace || 1));   // (def.pace: Skull Island's slower clock)
    // (a press turns the line after a 6-frame guard -- holding it back for a second dropped presses; def.guard: a longer one, so a masher cannot tear through)
    const ready = this.lineT >= need || (skip && this.lineT >= (this.def.guard || 6));
    if (!ready) return;
    if (skip) audio.sfx('menu_move', { vol: 0.6 });
    this.lineT = 0;
    if (++this.line < beats.length) return;
    // next panel / page
    if (++this.panel < this.pageDef.panels.length) { this.enterPanel(); audio.sfx('menu_move', { pitch: 1.2, vol: 0.4 }); return; }
    this.panel = 0;
    if (++this.page < this.def.pages.length) { this.enterPanel(); audio.sfx('menu_select', { vol: 0.6 }); return; }
    this.done = true;
  }

  // ------------------------------------------------------------------------------------------------ drawing
  draw(ctx) {
    if (this.done) return;
    const t = this.app.time;
    // page: dark paper with a subtle halftone
    ctx.fillStyle = '#1b1426'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 8; y < H; y += 14) for (let x = (y / 14) % 2 ? 8 : 15; x < W; x += 14) ctx.fillRect(x, y, 2, 2);
    const panels = this.pageDef.panels;
    // (the corner buttons over the page -- a 16:9 window, a phone: the page shrinks a touch toward its foot so the panels'
    //  top edge is clear of them, as the HUD keeps clear: app.cornerBox)
    const C = this.app.cornerBox?.(), k = C && C.y1 > 24 ? Math.max(0.85, Math.min(1, (H - C.y1 - 2) / (H - 24))) : 1;
    this._k = k;   // (the page's scale: hintSpot maps the page's text through it)
    const SIP = /^si_/.test(this.id);   // (Book Two: the prompt on a navy pill inside a TV's action-safe area, below)
    if (k < 1) { ctx.save(); ctx.translate(W / 2, H); ctx.scale(k, k); ctx.translate(-W / 2, -H); }
    // (Skull Island: the page's panels still to come, as a dim, soft preview of their own painting -- the page is all there,
    //  unlit, and each panel lights up in turn; the active one keeps its preview under it while it pops in.  A panel drawn live
    //  has no preview: nothing, as in Book 1.  Empty dashed frames read as pictures that failed to load.)
    if (/^si_/.test(this.id)) for (let i = this.panel; i < panels.length; i++) if (i > this.panel || this.panelT < 14) this.drawComing(ctx, panels[i]);
    for (let i = 0; i <= this.panel; i++) {
      const p = panels[i];
      const pop = i === this.panel ? clamp(this.panelT / 14, 0, 1) : 1;
      this.drawPanel(ctx, p, pop, i === this.panel, t);
    }
    if (k < 1) ctx.restore();
    // the "next" cue
    const hold = (this.app.skipHold || 0) / 45, hint = (this.app.skipHint || 0) > 0;   // (hint: the corner button tapped)
    if (SIP || (t * 2) % 2 < 1.3 || hold > 0 || hint) {   // (Book Two: always up, its words pulsing softly -- no on/off blink of the pill)
      ctx.font = `bold ${hint ? (SIP ? 20 : 18) : (SIP ? 18 : 15)}px ${FONT_C}`; ctx.fillStyle = hint ? '#ffe066' : SIP ? `rgba(255,240,210,${(0.72 + 0.26 * Math.sin(t * 3.4)).toFixed(3)})` : 'rgba(255,240,210,0.85)'; ctx.textAlign = 'right';   // (Book Two: 18 px, a TV at 3 m)
      const txt = this.app.promptText('confirm', 'next') + '   hold ' + (this.app.lastCtrl === 'touch' ? '❚❚' : this.app.glyphText('back')) + ' to skip';   // (the pause glyph on touch only: a pad holds its own BACK -- the cue said ❚❚ on a DualSense)
      const px = SIP ? W - 58 : W - 26, py = SIP ? H - 34 : H - 8;   // (Book Two: inside the action-safe area (x <= 912, y <= 513) -- over the page's foot, ink-outlined words only: a pill covered the painting's corner)
      if (SIP) {   // (Book Two: two short right-aligned lines -- "Enter next" over "hold Esc to skip": half the width, so it sits in the page's corner rather than across a painting)
        // (RC critics: never on a caption or a balloon -- hintSpot: the foot's right corner, else its left, else up an edge until clear)
        const l1 = this.app.promptText('confirm', 'next'), l2 = txt.slice(l1.length).trim(), S = this.hintSpot(ctx, l1, l2), lines = [[l1, S.y - 21], [l2, S.y]];
        ctx.textAlign = S.align;
        ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(13,10,20,0.92)'; for (const [l, y] of lines) ctx.strokeText(l, S.x, y); ctx.restore();
        for (const [l, y] of lines) ctx.fillText(l, S.x, y);
        if (hold > 0) { const tw = ctx.measureText(l2).width; ctx.fillStyle = '#ffe066'; ctx.fillRect(S.align === 'right' ? S.x - tw : S.x, S.y + 4, tw * hold, 3); }
      } else {
      ctx.fillText(txt, px, py);
      if (hold > 0) {
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = '#ffe066'; ctx.fillRect(px - tw, py + 4, tw * hold, 3);
      }
      }
    }
  }

  /** Book 2: a coming panel's painting, blurred (a ninth-size copy, made once per plate, drawn back up) and dimmed */
  drawComing(ctx, p) {
    const pl = this.plateOf(p);
    if (!pl) return;
    const [x, y, w, h] = p.r;
    if (pl.soft === undefined) {
      const sw = Math.max(4, Math.round(w / 9)), sh = Math.max(4, Math.round(h / 9)), r = cacheCanvas(sw, sh);
      if (r) { r.g.imageSmoothingEnabled = true; r.g.imageSmoothingQuality = 'high'; r.g.drawImage(pl.frames[0], 0, 0, sw, sh); }
      pl.soft = r ? r.c : null;
    }
    if (!pl.soft) return;
    ctx.save(); ctx.globalAlpha = 0.42; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pl.soft, x, y, w, h);
    // (the page's halftone carried over it, a touch stronger: the preview sits IN the paper, a page not yet inked -- not a
    //  picture still loading)
    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(27,20,38,0.25)'; ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(242,193,74,0.28)'; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);   // (a muted gold hairline: a slot on the page with its picture in it)
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let yy = 8; yy < H; yy += 14) { if (yy < y || yy > y + h) continue; for (let xx = (yy / 14) % 2 ? 8 : 15; xx < x + w; xx += 14) if (xx >= x) ctx.fillRect(xx, yy, 2, 2); }
    ctx.restore();
  }

  /** spring memory per panel and cast slot, stepped at 60 fps of app time */
  memOf(p, i, t) {
    const all = this._mems || (this._mems = new Map());
    let arr = all.get(p); if (!arr) all.set(p, arr = []);
    const m = arr[i] || (arr[i] = {});
    m.frame = Math.round(t * 60);
    return m;
  }

  drawPanel(ctx, p, pop, active, t) {
    const [x, y, w, h] = p.r;
    ctx.save();
    const e = 1 - Math.pow(1 - pop, 3);
    ctx.globalAlpha = e;
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.94 + 0.06 * e, 0.94 + 0.06 * e); ctx.translate(-(x + w / 2), -(y + h / 2));
    // drop shadow + white gutter border
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 6, y + 8, w, h);
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const plate = this.plateOf(p);
    let pos;
    if (this._dry) {
      pos = this.castPos(p);   // (the page's dry layout, hintSpot: the text boxes only, no picture)
    } else if (plate) {
      // the painted panel (assets/story/): its picture, with a slow push-in; the cast positions still place the balloons
      pos = this.castPos(p);
      this.drawPlate(ctx, p, plate, t);
    } else if (p.book) {
      // a painted panel whose plate did not load (a failed or stalled request): its cast entries are only the balloons' anchors
      // on the book's painting -- drawing them live puts figures in odd places (a crown on the bottom edge).  The stage backdrop,
      // dimmed, and the balloons instead.
      ctx.translate(x, y);
      pos = this.drawScene(ctx, p, t, active, { stage: true, cast: false });
      ctx.fillStyle = 'rgba(12,8,24,0.35)'; ctx.fillRect(0, 0, w, h);
    } else {
      ctx.translate(x, y);
      pos = this.drawScene(ctx, p, t, active);
    }
    ctx.restore();
    const bg = this.frameOf(p);
    if (bg.tint) { ctx.fillStyle = bg.tint; ctx.fillRect(x, y, w, h); }
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(x, y, w, h);
    ctx.restore();
    // text (screen space): captions then balloons up to the current beat
    const beats = this.beats(p);
    const upto = active ? this.line : beats.length - 1;
    this.capBottom = y; this.capTop = null;
    this.boxes = [];   // balloons already placed in this panel (later ones keep clear of them)
    // (Book Two: the painting's faces as boxes, screen px -- the balloons and the caption keep clear of every one, not only of the speakers'
    //  face points: tools/story/si_plates.py writes them from the book's face data and the spec's marks)
    this._faceBoxes = /^si_/.test(this.id) && p.faces ? p.faces.map(([fx, fy, fw, fh, pr]) => { const a = this.toScreen(p, fx, fy), b = this.toScreen(p, fx + fw, fy + fh); return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, prop: !!pr }; }) : null;
    for (let b = 0; b <= upto && b < beats.length; b++) {
      const beat = beats[b];
      if (beat.kind === 'cap') {
        const at = this.capCorner(ctx, beat.text, x, y, w, h, p.capAt || 'tl');   // (a panel's `capAt`: 'tl' (default) 'tr' 'bl' 'br' -- the caption's corner; Skull Island's painted panels keep it off the faces)
        const cb = this.caption(ctx, beat.text, x, y, w, at, h);
        if (at[0] === 'b') this.capTop = cb; else this.capBottom = cb;
      }
      else if (beat.kind === 'say') {
        // (Book Two: a bottom caption keeps the sound word above it, not on it)
        const sh = /^si_/.test(this.id) && this.capTop !== null ? this.capTop - 4 - y : h;
        if (beat.i === -2) { this.bigText(ctx, beat.text, x, y, w, sh); continue; }
        if (beat.i === -4) { this.smallText(ctx, beat.text, x, y, w, sh); continue; }
        if (beat.i === -3) {   // (on the side of the panel away from its cast)
          const xs = pos.filter(Boolean).map((Q) => this.toScreen(p, Q.x, 0).x), mid = xs.length ? xs.reduce((a, q) => a + q, 0) / xs.length : x;
          this.sign(ctx, beat.text, x, y, w, h, b === upto && active, mid > x + w / 2 ? -1 : 1);
          continue;
        }
        const P = pos[beat.i];
        const anchor = P ? this.toScreen(p, P.x, P.y - P.z - P.h - 10) : { x: x + w / 2, y: y + 30 };
        // keep every face in the panel clear, not just the speaker's
        const face = pos.filter(Boolean).map((Q) => this.toScreen(p, Q.x, Q.y - Q.z - Q.h * 0.8));
        const kc = p.cast[beat.i]?.c;
        const king = kc === 'malachar' ? 'MALACHAR' : kc === 'dragonking_dread' ? 'THE DREAD KING' : beat.i === -1 || kc === 'dragonking' ? 'THE DRAGON KING' : null;
        // reading order: if the NEXT speaker of this panel stands to one side, this balloon leans the other way, so
        // the balloons read left to right (decided from the whole panel, so a balloon never jumps when the next appears)
        const nb = beats.slice(b + 1).find((q) => q.kind === 'say' && q.i >= 0 && pos[q.i]);
        const nx = nb ? this.toScreen(p, pos[nb.i].x, 0).x : null;
        const pref = nx === null || !P ? 0 : nx > anchor.x + 8 ? -1 : nx < anchor.x - 8 ? 1 : 0;
        this._spk = P ? { i: beat.i, F: this.toScreen(p, P.x, P.y - P.z - P.h * 0.8), hh: P.h * 0.2 * (this.frameOf(p).zoom || 1) } : null;   // (Book Two: the tail aims at this face)
        this.balloon(ctx, beat.text, anchor, this.capTop !== null ? [x, y, w, this.capTop - 4 - y] : [x, this.capBottom + 4, w, h - (this.capBottom + 4 - y)], b === upto && active, king, b, face, pref, beat.tag);
      }
    }
  }
  /** where each cast member stands (stage-frame x, feet y, lift z, scale, facing, height): the balloons' anchors */
  castPos(p) {
    const pos = [];
    p.cast.forEach((c, i) => {
      const art = this.castArt(c);
      let cx = c.x, cy = c.y, cz = c.z || 0;
      if (c.mount !== undefined && pos[c.mount]) {
        const m = pos[c.mount], mart = this.castArt(p.cast[c.mount]);
        const sd = this.seatOf(c, mart);
        cx = m.x + (sd[0] + (c.dx || 0)) * m.s * (m.f || 1); cy = m.y; cz = m.z - sd[1] * m.s;
      }
      pos[i] = { x: cx, y: cy, z: cz, s: c.s || 1, f: c.f || 1, h: this.heightOf(c, art) * (c.s || 1) * (c.a === 'sit' ? 0.7 : 1) };
    });
    return pos;
  }

  /** the panel's picture without its border or text (stage, night, effects, cast), drawn in panel-local px:
   * (0, 0) = the panel's top-left.  Also what tools/story_plates.mjs renders for the painted panels. */
  drawScene(ctx, p, t, active = false, layers = { stage: true, cast: true }) {
    ctx.save();
    const bg = this.frameOf(p);
    const z = bg.zoom || 1;
    ctx.scale(z, z); ctx.translate(-(bg.ox || 0), -(bg.oy || 0));
    const stage = this.stages[bg.lvl];
    if (!layers.stage) { /* (cast layer only: tools/story_plates.mjs --layers) */ } else if (stage) {
      stage.setWarm?.(bg.warm || 0);
      stage.setStory?.(bg);   // (Skull Island: the Kraken's head, the cave's glow -- a story look)
      stage.drawBack(ctx, bg.cam || 0, t);
    } else { ctx.fillStyle = '#2a2240'; ctx.fillRect(0, 0, W, H); }
    if (bg.night && layers.stage) {
      ctx.fillStyle = `rgba(14,16,48,${typeof bg.night === 'number' ? bg.night : 0.62})`; ctx.fillRect(0, 0, W, H);
    }
    if (layers.stage) {
      if (hasFx(p, 'moon')) this.moon(ctx, t);
      if (hasFx(p, 'stormdragon')) this.stormSilhouette(ctx, t);
      if (hasFx(p, 'portal')) this.portal(ctx, 200, 470, t);
      if (hasFx(p, 'stranger')) this.stranger(ctx, t, layers.cast ? 'all' : 'back');
    } else if (hasFx(p, 'stranger') && layers.cast) this.stranger(ctx, t, 'figure');   // (his own layer for the painting)
    const pos0 = this.posePos(p, this.castPos(p), t);
    if (layers.stage) for (const e of this.fxOf(p)) if (FINALE_FX[e.k] && FINALE_FX[e.k].back) FINALE_FX[e.k].back(ctx, e, pos0, t, this.panelAge(p, t));
    // cast
    const speaking = this.currentSpeaker(p, active);
    const pos = this.posePos(p, this.castPos(p), t);
    if (layers.cast) p.cast.forEach((c, i) => {
      const art = this.castArt(c);
      if (!art || (layers.only !== undefined && layers.only !== i)) return;   // (one member: tools/story_plates.mjs --members)
      const pose = pos[i].pose;
      ctx.save();
      ctx.translate(pos[i].x, pos[i].y - pos[i].z);
      art.draw(ctx, pose, { facing: c.f || 1, t: t + i * 0.37, scale: c.s || 1, mem: this.memOf(p, i, t), vel: { x: 0, y: 0, z: 0 }, talk: speaking === i, ...(c.o || {}) });
      ctx.restore();
    });
    if (hasFx(p, 'shards') && layers.cast) this.shards(ctx, pos[0], t);
    if (layers.cast) for (const e of this.fxOf(p)) if (FINALE_FX[e.k] && FINALE_FX[e.k].front) FINALE_FX[e.k].front(ctx, e, pos, t, this.panelAge(p, t));
    ctx.restore();
    return pos;
  }

  /** the panel's effects, the secret ending's placed objects (a shard, the Heartstone, where the shards fly) kept inside
   * the part of the stage the panel shows (its auto-framing crops to the cast) */
  fxOf(p) {
    const bg = this.frameOf(p), z = bg.zoom || 1, [, , w, h] = p.r;
    const X0 = bg.ox || 0, Y0 = bg.oy || 0, X1 = X0 + w / z, Y1 = Y0 + h / z;
    // (the top third of a panel is its caption's and the balloons': a shard there would hide under them)
    const top = (Y1 - Y0) * 0.34;
    const inX = (v, m) => clamp(v, X0 + m, Math.max(X0 + m, X1 - m)), inY = (v, m, t0 = m) => clamp(v, Y0 + Math.max(m, t0), Math.max(Y0 + Math.max(m, t0), Y1 - m));
    const L = fxList(p).map((e) => {
      if (e.k === 'shard') { const m = e.big ? 70 : 44; return { ...e, x: inX(e.x ?? 480, m), y: inY(e.y ?? 300, m, top) }; }
      if (e.k === 'heartstone') { const m = (e.r ?? 62) + 8; return { ...e, x: inX(e.x ?? 480, m), y: inY(e.y ?? 420, m, top) }; }
      if (e.k === 'shardsfly' && e.to) return { ...e, to: [inX(e.to[0], 40), inY(e.to[1], 40, top)] };
      return e;
    });
    // (shardsfly into: 'heartstone' -- each shard home to its own notch of the panel's Heartstone, where it was placed)
    const G = L.find((e) => e.k === 'heartstone');
    return G ? L.map((e) => (e.k === 'shardsfly' && e.into === 'heartstone' ? { ...e, notches: heartNotches(G.x, G.y, (G.r ?? 62) * 1.05) } : e)) : L;
  }
  /** each cast member's art and pose (as drawn) onto its castPos entry: the finale effects aim at their landmarks */
  posePos(p, pos, t) {
    p.cast.forEach((c, i) => {
      const P = pos[i], art = this.castArt(c); if (!P) return;
      const A = art?.ANIM || {};
      let f = A[c.a]; if (f === undefined) f = A.idle;
      const arg = c.arg ?? (TIMED.includes(c.a) ? t + i * 0.7 : 0.5);
      P.art = art; P.pose = typeof f === 'function' ? f(arg) : (f || {});
    });
    return pos;
  }

  /** seconds since this panel first drew (the finale's one-shot effects: a bolt strikes, a cage melts) */
  panelAge(p, t) {
    const m = this._age || (this._age = new Map());
    if (!m.has(p)) m.set(p, t);
    return t - m.get(p);
  }

  // ------------------------------------------------------------------------------------------------ painted panels
  /** 'p<page>_n<panel>' of a panel of this cutscene */
  keyOf(p) {
    if (!this._keys) {
      this._keys = new Map();
      this.def.pages.forEach((pg, a) => pg.panels.forEach((pn, b) => this._keys.set(pn, `p${pg.pk ?? a}_n${b}`)));
    }
    return this._keys.get(p);
  }
  /** the painted plate for a panel, if it was loaded and was painted with this cast (P1 / P2 resolve to the heroes in
   * play: a plate painted with other heroes is not used and the panel is drawn live) */
  plateOf(p) {
    const pl = this.plates && this.plates.get(this.keyOf(p));
    return pl && pl.frames.length && plateFits(pl, p, this.heroes) ? pl : null;
  }
  /** a plate over the whole panel, pushed in slowly (motion.zoom over motion.secs, about the faces) and, for a looping
   * plate, cycling its painted frames at motion.fps */
  drawPlate(ctx, p, pl, t) {
    const [x, y, w, h] = p.r;
    const m = pl.motion || {};
    const t0 = this._plateT0 || (this._plateT0 = new Map());
    if (!t0.has(p)) t0.set(p, t);
    const u = Math.min(1, (t - t0.get(p)) / (m.secs || 9));
    const k = 1 + (m.zoom ?? 0.03) * (u * (2 - u));                  // ease-out push-in
    const fx = x + (m.fx ?? 0.5) * w, fy = y + (m.fy ?? 0.45) * h;
    const n = pl.frames.length;
    // a loop plays ping-pong (0 1 2 1 0 ...), so a 3-frame wing beat or cloak flutter has no jump back
    const ph = Math.floor(t * (m.fps || 4)) % Math.max(1, 2 * n - 2);
    const img = n > 1 ? pl.frames[ph < n ? ph : 2 * n - 2 - ph] : pl.frames[0];
    ctx.save();
    ctx.translate(fx, fy); ctx.scale(k, k); ctx.translate(-fx, -fy);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  currentSpeaker(p, active) {
    if (!active) return -9;
    const beats = this.beats(p);
    const b = beats[this.line];
    return b && b.kind === 'say' && this.lineT < readFrames(b.text) * 0.7 ? b.i : -9;
  }
  /** auto-framing: centre the cast and stand them near the bottom of the panel (unless ox/oy are given) */
  frameOf(p) {
    if (p._frame) return p._frame;
    const bg = { ...(p.bg || {}) };
    const [, , w, h] = p.r;
    const all = p.cast || [];
    const cast = all.filter((c) => c.mount === undefined);
    const fill = Math.max(w / W, h / H);   // never zoom out past the edge of the stage art
    if (cast.length && bg.ox === undefined) {
      const xs = cast.map((c) => c.x), feet = Math.max(...cast.map((c) => c.y));
      // how tall each standing member is, counting anyone riding on them
      const tops = cast.map((c) => {
        const art = this.castArt(c), s = c.s || 1;
        let top = this.heightOf(c, art) * s + (c.z || 0) + (feet - c.y);
        const mi = all.indexOf(c);
        for (const r of all) {
          if (r.mount !== mi) continue;
          const sd = this.seatOf(r, art);
          top = Math.max(top, (c.z || 0) - sd[1] * s + this.heightOf(r, this.castArt(r)) * (r.s || 1) * 0.75 + (feet - c.y));
        }
        return top;
      });
      const tall = Math.max(...tops);
      const z = Math.max(fill, bg.zoom || clamp((h * 0.56) / tall, 0.55, 1.5));   // leave the top of the panel for balloons
      bg.zoom = z;
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      bg.ox = cx - w / z / 2;
      bg.oy = feet - (h / z) * 0.94;
    }
    bg.zoom = Math.max(fill, bg.zoom || 1);
    const z = bg.zoom;
    bg.ox = clamp(bg.ox || 0, 0, W - w / z);
    bg.oy = clamp(bg.oy || 0, 0, H - h / z);
    p._frame = bg;
    return bg;
  }
  toScreen(p, sx, sy) {
    const bg = this.frameOf(p), z = bg.zoom || 1;
    return { x: p.r[0] + (sx - (bg.ox || 0)) * z, y: p.r[1] + (sy - (bg.oy || 0)) * z };
  }

  /** Book Two: the page's text boxes -- every caption, balloon and sound word of every panel at its last beat (a dry layout, the
   *  pictures not drawn), once per page: hintSpot keeps the cue off them */
  pageText() {
    if (this._pt && this._pt.page === this.pageDef) return this._pt.rects;
    const rects = [], keep = { boxes: this.boxes, capBottom: this.capBottom, capTop: this.capTop, _faceBoxes: this._faceBoxes };
    if (!this._scratch && typeof document !== 'undefined') { this._scratch = document.createElement('canvas'); this._scratch.width = this._scratch.height = 4; }
    const g = this._scratch && this._scratch.getContext('2d');
    if (!g) return rects;
    this._rec = rects; this._dry = true;
    try {
      for (const p of this.pageDef.panels) { this.drawPanel(g, p, 1, false, this.t || 0); for (const q of this.boxes || []) rects.push([q.x, q.y, q.w, q.h]); }
    } finally { this._rec = null; this._dry = false; Object.assign(this, keep); }
    this._pt = { page: this.pageDef, rects };
    return rects;
  }
  /** Book Two: where the "next / skip" cue goes -- { x, y (the lower line's baseline), align }; this.hintBox its box */
  hintSpot(ctx, l1, l2) {
    // (the page's text as drawn: scaled by k about the foot's middle when the corner buttons are up -- the hint itself is not)
    const k = this._k || 1, tw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 6;
    const R = this.pageText().map(([x, y, w, h]) => [W / 2 + (x - W / 2) * k, H + (y - H) * k, w * k, h * k]);
    const box = (x, y, a) => [a === 'right' ? x - tw : x, y - 37, tw, 45];   // (both lines and the hold bar)
    const free = (b) => !R.some((r) => b[0] < r[0] + r[2] + 4 && b[0] + b[2] + 4 > r[0] && b[1] < r[1] + r[3] + 4 && b[1] + b[3] + 4 > r[1]);
    const cands = [[W - 58, H - 34, 'right'], [58, H - 34, 'left']];
    for (let dy = 30; dy <= 240; dy += 30) cands.push([W - 58, H - 34 - dy, 'right'], [58, H - 34 - dy, 'left']);
    const c = cands.find(([cx, cy, a]) => free(box(cx, cy, a))) || cands[0];
    this.hintBox = box(c[0], c[1], c[2]);
    return { x: c[0], y: c[1], align: c[2] };
  }
  /** the cue's box for this page at its usual size (tools: the RC sweep) */
  hintRectFor(ctx) {
    ctx.save(); ctx.font = `bold 18px ${FONT_C}`;
    const l1 = this.app.promptText('confirm', 'next'), txt = l1 + '   hold ' + (this.app.lastCtrl === 'touch' ? '❚❚' : this.app.glyphText('back')) + ' to skip';
    this.hintSpot(ctx, l1, txt.slice(l1.length).trim()); ctx.restore();
    return this.hintBox;
  }
  /** a caption's box at a corner: { x, y, w, h, lines } */
  capBox(ctx, text, x, y, w, at = 'tl', h = 0) {
    ctx.save();
    ctx.font = `bold 17px ${FONT_C}`;
    const lines = wrap(ctx, text, Math.min(w - 40, 520));
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24, bh = lines.length * 21 + 14;
    ctx.restore();
    return { x: at[1] === 'r' ? x + w - bw - 10 : x + 10, y: at[0] === 'b' ? y + h - bh - 10 : y + 10, w: bw, h: bh, lines };
  }
  /** Book Two: the caption's corner -- the panel's own (capAt), unless its box covers a face of the painting (this._faceBoxes): then the
   *  same edge's other corner, then the other edge's (same side, other side); none free: its own */
  capCorner(ctx, text, x, y, w, h, at0) {
    const FB = this._faceBoxes;
    if (!FB || !FB.length) return at0;
    const flipX = (a) => a[0] + (a[1] === 'l' ? 'r' : 'l'), flipY = (a) => (a[0] === 't' ? 'b' : 't') + a[1];
    const hit = (b) => FB.some((f) => b.x < f.x + f.w && b.x + b.w > f.x && b.y < f.y + f.h && b.y + b.h > f.y);
    return [at0, flipX(at0), flipY(at0), flipY(flipX(at0))].find((a) => !hit(this.capBox(ctx, text, x, y, w, a, h))) || at0;
  }
  caption(ctx, text, x, y, w, at = 'tl', h = 0) {   // (returns the box's bottom edge; a bottom caption ('bl' 'br') returns its TOP edge)
    const B = this.capBox(ctx, text, x, y, w, at, h), lines = B.lines, bw = B.w, bh = B.h, bx = B.x, by = B.y;
    if (this._rec) this._rec.push([bx, by, bw, bh]);
    ctx.save();
    ctx.font = `bold 17px ${FONT_C}`;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx + 4, by + 5, bw, bh);
    ctx.fillStyle = '#ffe58a'; ctx.fillRect(bx, by, bw, bh);
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + 12, by + 8 + i * 21));
    ctx.restore();
    return at[0] === 'b' ? by : by + bh;
  }
  bigText(ctx, text, x, y, w, h) {
    ctx.save();
    ctx.font = `46px "Luckiest Guy", ${FONT_B}`; ctx.textAlign = 'center';
    if (this._rec) { const tw = ctx.measureText(text).width; this._rec.push([x + w / 2 - tw / 2 - 5, y + h - 68, tw + 10, 50]); }
    ctx.lineJoin = 'round'; ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.strokeText(text, x + w / 2, y + h - 28);
    ctx.fillStyle = '#ffe066'; ctx.fillText(text, x + w / 2, y + h - 28);
    ctx.restore();
  }
  /** speaker -4: a small title -- the book's tiny sound words ("grrr...", "...crash.") -- low in the panel, no tail */
  smallText(ctx, text, x, y, w, h) {
    const lines = String(text).split('\n');
    ctx.save();
    ctx.font = `22px "Luckiest Guy", ${FONT_B}`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    if (this._rec) { const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)); this._rec.push([x + w / 2 - tw / 2 - 3, y + h - 38 - (lines.length - 1) * 24, tw + 6, (lines.length - 1) * 24 + 26]); }
    lines.forEach((l, i) => {
      const ty = y + h - 18 - (lines.length - 1 - i) * 24;
      ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(l, x + w / 2, ty);
      ctx.fillStyle = '#fff6e0'; ctx.fillText(l, x + w / 2, ty);
    });
    ctx.restore();
  }
  /** speaker -3: a small hand-lettered sign held up in the panel's bottom corner (DRAGON DODONGO UNLOCKED!) */
  sign(ctx, text, x, y, w, h, fresh, side = 1) {
    const lines = text.split('\n');
    ctx.save();
    ctx.font = `26px "Luckiest Guy", ${FONT_B}`;
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 34, bh = lines.length * 28 + 22;
    const pop = fresh ? clamp((this.lineT || 0) / 10, 0, 1) : 1, s = 0.6 + 0.4 * (1 - Math.pow(1 - pop, 3));
    const cx = side > 0 ? x + w - bw / 2 - 18 : x + bw / 2 + 18, cy = y + h - bh / 2 - 14;
    ctx.translate(cx, cy); ctx.rotate(-0.06); ctx.scale(s, s);
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-6, bh / 2 - 4, 12, 26);                         // (its stick)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-bw / 2 + 5, -bh / 2 + 6, bw, bh);
    ctx.fillStyle = '#fff1cf'; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.lineWidth = 3.5; ctx.strokeStyle = '#7a5230'; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = '#d2451e'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, Math.sin(i * 2.1) * 3, -bh / 2 + 12 + i * 28));
    ctx.restore();
  }
  /** pref: -1 / 1 = lean left / right of the speaker (the next speaker is on the other side); a balloon after another
   * keeps the reading order: it sits to the right of the one before, or below it -- never up-left of it (crossed tails) */
  balloon(ctx, text, anchor, r, current, king, order, face, pref = 0, nameTag = null) {
    ctx.save();
    if (!current && this.def.dimOld) ctx.globalAlpha = 0.8;   // (def.dimOld: the balloons already read step back, the newest is full strength)
    ctx.font = `bold 16px ${FONT_C}`;
    const lines = text.split('\n');
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 26, bh = lines.length * 19 + 16;
    const [px, py, pw, ph] = r;
    const ax = clamp(anchor.x, px + 10, px + pw - 10), ay = clamp(anchor.y, py + 10, py + ph - 10);
    const inside = (bx, by) => bx >= px + 6 && bx + bw <= px + pw - 6 && by >= py + 6 && by + bh <= py + ph - 6;
    // (Book Two -- RC2: nor on a tail before it -- si_epilogue's crystal line sat on "We will be far apart..."'s tail; triPts, below)
    const onTail = (bx, by, q) => !!q.tail && triPts(q.tail).some(([x, y]) => x > bx - 3 && x < bx + bw + 3 && y > by - 3 && y < by + bh + 3);
    const hits = (bx, by) => (this.boxes || []).some((q) => (bx < q.x + q.w + 6 && bx + bw + 6 > q.x && by < q.y + q.h + 6 && by + bh + 6 > q.y) || onTail(bx, by, q));
    const onFace = (bx, by) => (face || []).some((f) => f.x > bx - 10 && f.x < bx + bw + 10 && f.y > by - 6 && f.y < by + bh + 18)
      || (this._faceBoxes || []).some((f) => bx < f.x + f.w + 3 && bx + bw + 3 > f.x && by < f.y + f.h + 3 && by + bh + 3 > f.y);   // (Book Two: any face of the painting, its whole head)
    // reading order against the balloon placed just before (this panel): to its right, or below it
    const prev = (this.boxes || [])[(this.boxes || []).length - 1];
    // (staggered clearly lower than it also reads second)
    // (Book Two: to the right and not higher, or under the one before's bottom -- e_gift's second line sat left of it and barely lower, and read first)
    const ordered = (c) => !prev || (this._faceBoxes ? (c.x + bw / 2 >= prev.x + prev.w / 2 + 10 && c.y >= prev.y - 6) || c.y >= prev.y + prev.h - 6 : c.x + bw / 2 >= prev.x + prev.w / 2 + 10 || c.y >= prev.y + prev.h * 0.45);
    // candidates, best first: above the head, beside it (the preferred / near side, then the other), below the balloon
    // before (when the speaker is left of it), then stacked over earlier balloons
    const cands = [];
    // (a balloon with a next speaker beside it sits a little higher, so the next one can step down below its top)
    if (pref) cands.push({ x: clamp(ax - bw / 2 + pref * bw * 0.3, px + 8, px + pw - bw - 8), y: ay - bh - 30, side: 0 });
    cands.push({ x: clamp(ax - bw / 2 + pref * bw * 0.3, px + 8, px + pw - bw - 8), y: ay - bh - 16, side: 0 });
    // the speaker is left of the balloon before: over the speaker, clear of it on the left, stepped clearly lower
    if (prev && ax < prev.x + prev.w / 2) {
      cands.push({ x: clamp(Math.min(ax - bw / 2, prev.x - bw - 10), px + 8, px + pw - bw - 8),
        y: Math.min(ay - bh - 6, prev.y + prev.h * 0.75), side: 0 });
    }
    const midY = clamp(ay - bh / 2 - 20, py + 8, py + ph - bh - 8);
    const near = pref || (ax < px + pw / 2 ? 1 : -1);
    for (const sd of [near, -near]) cands.push({ x: clamp(sd > 0 ? ax + 44 : ax - 44 - bw, px + 8, px + pw - bw - 8), y: midY, side: sd });
    if (prev) {
      const below = prev.y + prev.h + 8;
      if (below + bh <= ay - 4) cands.push({ x: clamp(ax - bw / 2, px + 8, px + pw - bw - 8), y: below, side: 0 });   // (still above the head)
      for (const sd of [near, -near]) cands.push({ x: clamp(sd > 0 ? ax + 44 : ax - 44 - bw, px + 8, px + pw - bw - 8), y: Math.max(below, midY), side: sd });
    }
    for (const q of this.boxes || []) {
      cands.push({ x: clamp(ax - bw / 2, px + 8, px + pw - bw - 8), y: q.y - bh - 10, side: 0 });
      for (const sd of [1, -1]) cands.push({ x: sd > 0 ? q.x + q.w + 10 : q.x - bw - 10, y: clamp(q.y, py + 8, py + ph - bh - 8), side: (sd > 0 ? q.x + q.w + 10 : q.x - bw - 10) > ax ? 1 : -1 });
    }
    cands.push({ x: px + 8, y: py + 8, side: -1, corner: 1 }, { x: px + pw - bw - 8, y: py + 8, side: 1, corner: 1 });
    // a tail must be possible: the balloon sits above the anchor, or beside it (anchor outside its width)
    // (Book Two: and the tail as drawn clear of the balloons before it -- tailClear, below)
    const tailOk = (c) => offPic || ((c.y + bh <= ay - 4 || ax <= c.x + 6 || ax >= c.x + bw - 6 || c.side === 2) && tailClear(c));   // (side 2: under the speaker, tail up; a plated speaker off the picture: no tail -- offPic, below)
    // (Book Two: none of those keeps every face of the painting clear, or only far away -- the panel's nearest spot that does (a 3 px
    //  grid and the far edges), its tail still possible (above the speaker, beside, or under with a tail up), in reading order if any
    //  such spot is; worked out once per balloon and kept: this._gridCache)
    // (Book Two -- RC2: a balloon nearer another face than its speaker's reads as theirs: e_cheer's over Shadow's fist)
    const SF = this._spk && this._spk.F, gap = (c, f) => Math.hypot(Math.max(0, f.x - c.x - bw, c.x - f.x - f.w), Math.max(0, f.y - c.y - bh, c.y - f.y - f.h));
    // (the speaker's own face box: the nearest character face box within about a head of its face point -- tools/story/si_balloon_fit.json
    //  can move a speaker's anchor off its face; the box stays on the face)
    let spkBox = null; if (SF) { let bd = Math.max(24, 1.2 * (this._spk.hh || 30)); for (const f of this._faceBoxes || []) { if (f.prop) continue; const d = Math.hypot(Math.max(0, f.x - SF.x, SF.x - f.x - f.w), Math.max(0, f.y - SF.y, SF.y - f.y - f.h)); if (d < bd) { bd = d; spkBox = f; } } }
    // (Book Two -- RC2 critics: the tail of a balloon at (bx, by), from the edge nearest the speaker, aimed at them.  Over the head: down
    //  at the head's top, as ever; otherwise at the face, stopping short of it; a name-tagged speaker off the picture: at its anchor.
    //  The tip stays in the panel)
    const inQ = (x, y, m) => (this.boxes || []).some((q) => x > q.x - m && x < q.x + q.w + m && y > q.y - m && y < q.y + q.h + m);
    const sight = (a, b) => [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.97].some((u) => inQ(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 0));   // (a balloon before this one in the way)
    const tailOf = (bx, by) => {
      const S = this._spk, over = by + bh <= ay - 4, FT = spkBox ? { x: spkBox.x + spkBox.w / 2, y: spkBox.y + spkBox.h * 0.6 } : S && S.F, hh = S ? S.hh : 30;   // (the face as painted: its box)
      const edge = (T) => {
        const ox = T.x < bx ? bx - T.x : T.x > bx + bw ? T.x - bx - bw : 0, oy = T.y < by ? by - T.y : T.y > by + bh ? T.y - by - bh : 0;
        const e = ox > oy ? (T.x < bx ? 'l' : 'r') : oy > 0 ? (T.y < by ? 't' : 'b') : 'b';
        return { e, B: e === 'b' ? [clamp(T.x, bx + 16, bx + bw - 16), by + bh] : e === 't' ? [clamp(T.x, bx + 16, bx + bw - 16), by] : [e === 'l' ? bx : bx + bw, clamp(T.y, by + 12, by + bh - 12)] };
      };
      let T = over || nameTag || !S ? { x: ax, y: ay } : FT, { e, B } = edge(T), stop = Math.max(14, 0.55 * hh);
      // (RC2: the face hidden behind a balloon before this one -- si_blunderbeard's "...I'm thinking!" sits under Dodongo's line, Ana's
      //  face above that: aimed at the speaker's body instead, its nearest point in sight (not behind a balloon))
      if (!over && !nameTag && S && sight(B, [T.x, T.y])) {
        const top = spkBox ? spkBox.y + spkBox.h : T.y + 0.4 * hh; let bd = Infinity, alt = null;
        for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
          const Q = { x: T.x - 0.8 * hh + 1.6 * hh * i / 6, y: top + 1.8 * hh * j / 6 };
          if (Q.x < px + 4 || Q.x > px + pw - 4 || Q.y < py + 4 || Q.y > py + ph - 4 || (Q.x > bx - 4 && Q.x < bx + bw + 4 && Q.y > by - 4 && Q.y < by + bh + 4) || inQ(Q.x, Q.y, 4)) continue;
          const g = edge(Q); if (sight(g.B, [Q.x, Q.y])) continue;
          const d = Math.hypot(Q.x - g.B[0], Q.y - g.B[1]) + 0.5 * Math.hypot(Q.x - T.x, Q.y - T.y); if (d < bd) { bd = d; alt = { Q, g }; }   // (near the balloon, and toward the face)
        }
        if (alt) { T = alt.Q; e = alt.g.e; B = alt.g.B; stop = 6; }
      }
      const dx = T.x - B[0], dy = T.y - B[1], len = Math.hypot(dx, dy) || 1, L = over ? clamp(len, 10, 22) : clamp(len - stop, 8, 26);
      return { base: B, tip: [clamp(B[0] + dx / len * L, px + 3, px + pw - 3), clamp(B[1] + dy / len * L, py + 3, py + ph - 3)], T: [T.x, T.y], e };
    };
    // (RC2: a tail never crosses a balloon placed before it -- si_blunderbeard's "...I'm thinking!", under the line before it, sent its
    //  tail up through "you have a plan".  The tail's triangle, sampled)
    const triPts = (t) => { const [ex, ey] = t.e === 'b' || t.e === 't' ? [8, 0] : [0, 8], o = []; for (const s of [-1, 0, 1]) for (const u of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) o.push([(t.base[0] + s * ex) * (1 - u) + t.tip[0] * u, (t.base[1] + s * ey) * (1 - u) + t.tip[1] * u]); return o; };
    // (RC3: nor over a keep-out prop -- c34_gate's tail down to Dodongo lay on the sun-shaped hole its line names)
    const tailCross = (t) => triPts(t).some(([x, y]) => inQ(x, y, 0) || (this._faceBoxes || []).some((f) => f.prop && x > f.x && x < f.x + f.w && y > f.y && y < f.y + f.h));
    const tailClear = (c) => king || !/^si_/.test(this.id) || !tailCross(tailOf(c.x, c.y));
    // (Book Two -- RC3: a name-plated balloon whose speaker is not in the picture -- off the panel, or no painted face by its point (hands
    //  only, a point-of-view panel) -- has no tail: the plate says who, and a tail could only be a stub in its corner or point at someone)
    const offPic = !!nameTag && !king && /^si_/.test(this.id) && (!SF || !spkBox || SF.x < px || SF.x > px + pw || SF.y < py || SF.y > py + ph);
    const otherNear = (c) => !!SF && (this._faceBoxes || []).some((f) => f !== spkBox && !f.prop && gap(c, f) + 30 < (spkBox ? gap(c, spkBox) : gap(c, { x: SF.x, y: SF.y, w: 0, h: 0 })));   // (clearly nearer another character's face; a prop -- a keep-out box -- never 'speaks')
    const score = (c) => Math.hypot(c.x + bw / 2 - ax, c.y + bh / 2 - (ay - bh / 2)) + (ordered(c) ? 0 : 400) + (c.side === 2 ? 60 : 0) + (prev && c.x + bw / 2 < prev.x + prev.w / 2 ? 40 : 0) + (this._faceBoxes && otherNear(c) ? 150 : 0);   // (left of the one before: a little worse -- read after it from its right / below)
    const first = cands.find((c) => inside(c.x, c.y) && tailOk(c) && !hits(c.x, c.y) && !onFace(c.x, c.y));
    if (this._faceBoxes) {   // (Book Two: the panel's nearest free spot, when it beats the first free candidate -- RC2: a side spot under a
      //  150 score kept e_cheer's balloon over Shadow's fist while the spot over Dodongo's head was free)
      const G = this._gridCache || (this._gridCache = new Map());
      const gk = [text, ax | 0, ay | 0, px | 0, py | 0, pw | 0, ph | 0, ...this._faceBoxes.map((f) => `${f.x | 0},${f.y | 0}`), ...(this.boxes || []).map((q) => `${q.x | 0},${q.y | 0},${q.w | 0}`)].join('|');
      let best = G.get(gk);
      if (best === undefined) {
        // (the speaker's own face box -- the one nearest the anchor: a balloon under it takes a short tail up to the chin, side 2)
        let chin = null, cd = 70, bs = Infinity;
        for (const f of this._faceBoxes) { const d = Math.abs(f.x + f.w / 2 - ax) + Math.abs(f.y - (ay + 10)); if (d < cd) { cd = d; chin = f; } }
        const xs = [], ys = [];
        for (let gx = px + 8; gx <= px + pw - bw - 8; gx += 3) xs.push(gx);
        for (let gy = py + 8; gy <= py + ph - bh - 8; gy += 3) ys.push(gy);
        xs.push(px + pw - bw - 8); ys.push(py + ph - bh - 8);
        best = null;
        for (const gy of ys) for (const gx of xs) {
          const under = chin && gy >= chin.y + chin.h + 6 && ax >= gx + 14 && ax <= gx + bw - 14;
          const c = { x: gx, y: gy, side: gy + bh <= ay - 4 ? 0 : under ? 2 : ax < gx + bw / 2 ? -1 : 1, chin: under ? chin.y + chin.h : undefined };
          if (!inside(gx, gy) || !tailOk(c) || hits(gx, gy) || onFace(gx, gy)) continue;
          const s = score(c);
          if (s < bs) { bs = s; best = c; }
        }
        G.set(gk, best);
      }
      // (the first free candidate stays unless it is a corner, far off (as before), out of reading order, or reads as someone else's)
      if (best && (!first || first.corner || otherNear(first) || !ordered(first) || score(first) > 150) && (!first || score(best) < score(first) - 20)) cands.unshift(best);
    }
    // a face is never covered if any place allows it; reading order comes next
    let pick = cands.find((c) => inside(c.x, c.y) && tailOk(c) && !hits(c.x, c.y) && !onFace(c.x, c.y) && ordered(c))
      || cands.find((c) => inside(c.x, c.y) && tailOk(c) && !hits(c.x, c.y) && !onFace(c.x, c.y))
      || cands.find((c) => inside(c.x, c.y) && tailOk(c) && !hits(c.x, c.y) && ordered(c))
      || cands.find((c) => inside(c.x, c.y) && tailOk(c) && !hits(c.x, c.y))
      || cands.find((c) => inside(c.x, c.y) && !hits(c.x, c.y))
      || cands.find((c) => inside(c.x, c.y)) || { ...cands[1], y: clamp(cands[1].y, py + 8, py + ph - bh - 8) };
    let bx = clamp(pick.x, px + 8, px + pw - bw - 8), by = clamp(pick.y, py + (king ? 18 : 8), py + ph - bh - 8), side = pick.side;
    // a balloon above the head must sit above the anchor; otherwise its tail comes out of the side
    if (side === 0 && by + bh > ay - 4) side = ax > bx + bw / 2 ? 1 : -1;
    if (side !== 0 && side !== 2 && ax > bx && ax < bx + bw) side = 0;
    const box = { x: bx, y: by, w: bw, h: bh, spk: this._spk ? this._spk.i : null, tag: nameTag || null, king: !!king };
    (this.boxes || (this.boxes = [])).push(box);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 14) : ctx.rect(bx, by, bw, bh);
    let cover = null;
    if (offPic) box.noTail = true;   // (no tail: its plate says who -- RC3)
    else if (!king && /^si_/.test(this.id)) {
      // (Book Two -- RC2 critics: from the edge nearest the speaker, aimed at them: tailOf, above -- the one the placer kept clear)
      const tl = tailOf(bx, by), B = tl.base, tip = tl.tip, e = tl.e;
      if (e === 'b' || e === 't') { const ey = e === 'b' ? by + bh - 1 : by + 1; ctx.moveTo(B[0] - 8, ey); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(B[0] + 9, ey); cover = [B[0] - 7, e === 'b' ? by + bh - 4 : by - 1, 15, 5]; }
      else { const ex = e === 'l' ? bx + 1 : bx + bw - 1; ctx.moveTo(ex, B[1] - 8); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(ex, B[1] + 8); cover = [e === 'l' ? bx - 1 : bx + bw - 4, B[1] - 7, 5, 15]; }
      box.tail = tl;
    } else if (!king) {
      if (side === 2) {   // (under the speaker: a short tail up toward the chin, stopping short of it)
        const tx = clamp(ax, bx + 14, bx + bw - 14), ty = Math.max(by - 22, Math.min(by - 8, (pick.chin ?? by - 14) + 4));
        ctx.moveTo(tx - 8, by + 1); ctx.lineTo(clamp(ax, tx - 20, tx + 20), ty); ctx.lineTo(tx + 9, by + 1);
        cover = [tx - 7, by - 1, 15, 5];
      } else if (side === 0) {
        const tx = clamp(ax, bx + 14, bx + bw - 14);
        // (never upward into the balloon: at least a short tail down toward the speaker)
        ctx.moveTo(tx - 8, by + bh - 1); ctx.lineTo(clamp(ax, tx - 20, tx + 20), Math.max(by + bh + 10, Math.min(ay, by + bh + 22))); ctx.lineTo(tx + 9, by + bh - 1);
        cover = [tx - 7, by + bh - 4, 15, 5];
      } else {
        const ty = clamp(ay, by + 12, by + bh - 12), ex = side > 0 ? bx : bx + bw;
        // the tail points at the speaker but stops short of the face (about 30 px round the head's centre line)
        const tl = clamp(Math.abs(ax - ex) - 30, 6, 22);
        ctx.moveTo(ex, ty - 8); ctx.lineTo(ex - side * tl, ty + 4); ctx.lineTo(ex, ty + 8);
        cover = [ex - (side > 0 ? 0 : 4), ty - 7, 4, 15];
      }
    }
    const KC = king === 'MALACHAR' ? ['#24103a', '#d070ff', '#f0c8ff', '#d070ff', '#2a0a40'] : ['#17251b', '#5ad35f', '#9dff8a', '#5ad35f', '#10200f'];   // (balloon, ring, text, tag, tag text: Malachar's are violet)
    ctx.fillStyle = king ? KC[0] : '#fffef8'; ctx.fill();
    ctx.lineWidth = king ? 3.5 : 2.6; ctx.strokeStyle = king ? KC[1] : INK; ctx.stroke();
    if (cover) { ctx.fillStyle = '#fffef8'; ctx.fillRect(...cover); }
    ctx.fillStyle = king ? KC[2] : INK; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + 8 + i * 19));
    if (king) {
      // name tag so kids know who's talking
      ctx.save();
      ctx.font = `14px "Luckiest Guy", ${FONT_B}`;
      const tag = typeof king === 'string' ? king : 'THE DRAGON KING';
      const tw = ctx.measureText(tag).width + 14;
      ctx.fillStyle = KC[3]; ctx.fillRect(bx + 10, by - 12, tw, 18);
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(bx + 10, by - 12, tw, 18);
      ctx.fillStyle = KC[4]; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(tag, bx + 17, by - 2);
      ctx.restore();
    } else if (nameTag) {   // (a small yellow name tag: who is speaking when the speaker is off the picture)
      ctx.save();
      ctx.font = `13px "Luckiest Guy", ${FONT_B}`;
      const tw = ctx.measureText(nameTag).width + 14;
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(bx + 10, by - 12, tw, 17);
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(bx + 10, by - 12, tw, 17);
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(nameTag, bx + 17, by - 3);
      ctx.restore();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------------------------------------ panel effects
  moon(ctx, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,248,214,0.95)'; ctx.beginPath(); ctx.arc(780, 110, 54, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(230,220,180,0.6)'; ctx.beginPath(); ctx.arc(765, 100, 10, 0, TAU); ctx.arc(800, 128, 7, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,240,200,0.12)'; ctx.beginPath(); ctx.arc(780, 110, 110 + Math.sin(t) * 4, 0, TAU); ctx.fill();
    ctx.restore();
  }
  stormSilhouette(ctx, t) {
    ctx.save();
    ctx.translate(700 + Math.sin(t * 0.4) * 40, 150 + Math.sin(t * 0.9) * 10);
    ctx.fillStyle = 'rgba(40,50,80,0.7)';
    const w = Math.sin(t * 3) * 30;
    ctx.beginPath();
    ctx.moveTo(-90, 10); ctx.quadraticCurveTo(-30, -10, 40, -4); ctx.lineTo(80, -18); ctx.lineTo(70, 0); ctx.quadraticCurveTo(20, 14, -90, 10);
    ctx.moveTo(-10, -2); ctx.lineTo(-70, -60 - w); ctx.lineTo(-30, -40 - w * 0.6); ctx.lineTo(10, -70 - w); ctx.lineTo(30, -2);
    ctx.fill();
    ctx.restore();
  }
  /** the hooded stranger on a far ridge under the moon: just a silhouette and two cold eyes */
  stranger(ctx, t, part = 'all') {
    if (part !== 'figure') {
      this.moon(ctx, t);
      // a long dark ridge rising against the moonlit sky: he stands small on its crest, far away
      ctx.fillStyle = '#0d0c1c';
      ctx.beginPath(); ctx.moveTo(300, 540); ctx.quadraticCurveTo(460, 392, 610, 380); ctx.quadraticCurveTo(740, 386, 900, 470); ctx.lineTo(960, 540); ctx.closePath(); ctx.fill();
      if (part === 'back') return;
    }
    ctx.save();
    ctx.translate(610, 384);
    ctx.scale(0.6, 0.6);
    const sway = Math.sin(t * 1.3) * 3;
    // cloak, flaring in the wind
    ctx.beginPath();
    ctx.moveTo(-8, -118); ctx.quadraticCurveTo(-30, -110, -32, -84);
    ctx.quadraticCurveTo(-40, -40, -48 - sway, 0); ctx.lineTo(-20, -4); ctx.lineTo(-4, 2); ctx.lineTo(18, -3);
    ctx.lineTo(54 + sway * 2, 2); ctx.quadraticCurveTo(40, -40, 30, -86); ctx.quadraticCurveTo(26, -112, 4, -120); ctx.closePath();
    ctx.fillStyle = '#08070f'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(150,140,210,0.55)'; ctx.stroke();
    // hood opening
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(-2, -96, 13, 15, 0, 0, TAU); ctx.fill();
    // eyes (blinking now and then)
    const blink = (t % 4.2) > 4.05 ? 0.15 : 1;
    ctx.globalCompositeOperation = 'lighter';
    // (eyes a little larger than his scale: they must still read from far away)
    ctx.fillStyle = 'rgba(200,220,255,0.35)'; ctx.beginPath(); ctx.arc(-7, -97, 10, 0, TAU); ctx.arc(5, -97, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#eef4ff';
    ctx.beginPath(); ctx.ellipse(-7, -97, 3.8, 3.2 * blink, 0, 0, TAU); ctx.ellipse(5, -97, 3.8, 3.2 * blink, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  portal(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y - 80);
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(110,200,255,${0.5 - i * 0.12})`; ctx.lineWidth = 10 - i * 3;
      ctx.beginPath(); ctx.ellipse(0, 0, 52 + i * 8 + Math.sin(t * 6 + i) * 3, 92 + i * 8, 0, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(80,160,255,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 50, 90, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = prev;
    ctx.restore();
  }
  shards(ctx, P, t) {
    if (!P) return;
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const a = t * 1.5 + i * TAU / 3;
      const x = P.x + 60 * P.f + Math.cos(a) * 34, y = P.y - P.h * 0.75 + Math.sin(a) * 12;
      ctx.save(); ctx.translate(x, y); ctx.rotate(0.3);
      const prev = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(120,210,255,0.35)'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = prev;
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(6, -2); ctx.lineTo(3, 11); ctx.lineTo(-4, 9); ctx.lineTo(-6, -3); ctx.closePath();
      ctx.fillStyle = '#9fe7ff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(3, -2); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ panel fx
// p.fx: a name, or a list of names / { k: name, ...params } (the finale's effects take cast indices: at, from, to)
function fxList(p) { return [].concat(p.fx || []).map((e) => (typeof e === 'string' ? { k: e } : e)); }
function hasFx(p, k) { return fxList(p).some((e) => e.k === k); }
const headOf = (P) => (P ? [P.x, P.y - P.z - P.h * 0.82] : [480, 200]);
const midOf = (P) => (P ? [P.x, P.y - P.z - P.h * 0.5] : [480, 300]);
// a member's landmark on screen where its art has one for the drawn pose (posePos): the mouth (mouthOf: the atlas'
// mouth -> mouthF), the body centre (bodyOf); null / the height guess otherwise
const onScreen = (P, q) => [P.x + q[0] * P.s * (P.f || 1), P.y - P.z + q[1] * P.s];
const mouthAt = (P) => { const m = P && P.pose && P.art?.mouthOf ? P.art.mouthOf(P.pose) : null; return m ? onScreen(P, m) : null; };
const bodyAt = (P) => { const q = P && P.pose && P.art?.bodyOf ? P.art.bodyOf(P.pose) : null; return q ? onScreen(P, q) : midOf(P); };
function glowDot(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
function jag(x0, y0, x1, y1, seed, n = 9, amp = 26) {
  const pts = [[x0, y0]];
  for (let i = 1; i < n; i++) {
    const u = i / n, s = Math.sin(seed * 91.7 + i * 12.9898) * 43758.5453, r1 = s - Math.floor(s), r2 = s * 1.7 - Math.floor(s * 1.7);
    pts.push([x0 + (x1 - x0) * u + (r1 - 0.5) * amp * 2, y0 + (y1 - y0) * u + (r2 - 0.5) * amp]);
  }
  pts.push([x1, y1]);
  return pts;
}
function stroke3(ctx, pts, a, cols = ['80,255,120', '150,255,170', '240,255,240']) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  [[14, 0.25], [6, 0.7], [2.2, 1]].forEach(([w, k], i) => {
    ctx.lineWidth = w; ctx.strokeStyle = `rgba(${cols[i]},${k * a})`;
    ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  });
  ctx.restore();
}
/** a wavy breath stream from (x0, y0) to (x1, y1): rgb outside, a hot core */
function stream(ctx, x0, y0, x1, y1, t, rgb, core, w = 16) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [k, col, a] of [[1, rgb, 0.35], [0.5, rgb, 0.7], [0.18, core, 1]]) {
    ctx.lineWidth = w * k * 2; ctx.strokeStyle = `rgba(${col},${a})`; ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const u = i / 16, wob = Math.sin(u * 9 - t * 18) * w * 0.35 * (1 - u * 0.5);
      const x = x0 + dx * u + nx * wob, y = y0 + dy * u + ny * wob;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}
export const FINALE_FX = {
  // green lightning lancing in from the far horizon onto a cast member (at): it strikes over .25 s, then crackles
  greenbolt: { front(ctx, e, pos, t, age) {
    const [hx, hy] = midOf(pos[e.at ?? 0]);
    const u = Math.min(1, age / 0.25), x0 = e.x0 ?? 940, y0 = e.y0 ?? 40;
    const pts = jag(x0, y0, x0 + (hx - x0) * u, y0 + (hy - y0) * u, Math.floor(t * 12), 11, 30);
    stroke3(ctx, pts, 0.75 + 0.25 * Math.sin(t * 40));
    if (u >= 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowDot(ctx, hx, hy, 90, '120,255,140', 0.45 + 0.15 * Math.sin(t * 30)); ctx.restore(); }
  } },
  // the cage melting: green drips and sparks round a cast member (at)
  cagemelt: { front(ctx, e, pos, t) {
    const P = pos[e.at ?? 0]; if (!P) return;
    const [x, y] = midOf(P), r = P.h * 0.45;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glowDot(ctx, x, y, r * 1.6, '90,255,120', 0.35 + 0.1 * Math.sin(t * 9));
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39, u = ((t * 0.9 + i * 0.37) % 1);
      const px = x + Math.cos(a) * r * 0.9, py = y + Math.sin(a) * r * 0.6 + u * 60;
      ctx.fillStyle = `rgba(170,255,170,${0.9 * (1 - u)})`; ctx.beginPath(); ctx.ellipse(px, py, 2.5, 5, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  } },
  // rock slabs bursting up and out from a point (x, y) or above a cast member's head (at)
  debris: { front(ctx, e, pos, t, age) {
    const [cx, cy] = e.at !== undefined ? headOf(pos[e.at]) : [e.x ?? 480, e.y ?? 120];
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i / 15 - 0.5) * 2.6, v = 160 + (i * 37 % 90), u = (age * 0.6 + i * 0.13) % 1.6;
      const x = cx + Math.cos(a) * v * u, y = cy + Math.sin(a) * v * u + 140 * u * u, s = 6 + (i % 5) * 4;
      ctx.save(); ctx.translate(x, y); ctx.rotate(u * (i % 2 ? 4 : -3));
      ctx.fillStyle = '#2a2228'; ctx.strokeStyle = '#120c12'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-s, -s * 0.6); ctx.lineTo(s, -s * 0.8); ctx.lineTo(s * 0.8, s * 0.7); ctx.lineTo(-s * 0.7, s * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (i % 3 === 0) { ctx.fillStyle = '#c99a3a'; ctx.fillRect(-s * 0.7, s * 0.2, s * 1.3, 2); }
      ctx.restore();
    }
    ctx.restore();
  } },
  // Dodongo's dragon arm blazing: a fire glow round it, sparks rising (at)
  armglow: { front(ctx, e, pos, t) {
    const P = pos[e.at ?? 0]; if (!P) return;
    const x = P.x + 22 * P.s * (P.f || 1), y = P.y - P.z - P.h * 0.5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glowDot(ctx, x, y, 70 * P.s, '255,150,50', 0.6 + 0.15 * Math.sin(t * 14));
    glowDot(ctx, x, y, 26 * P.s, '255,240,170', 0.8);
    for (let i = 0; i < 10; i++) {
      const u = (t * 1.2 + i * 0.29) % 1;
      ctx.fillStyle = `rgba(255,${180 + (i % 3) * 25},90,${1 - u})`;
      ctx.fillRect(x + Math.sin(i * 3.7 + t * 3) * 26 * P.s, y - u * 90 * P.s, 3, 3);
    }
    ctx.restore();
  } },
  // the freed dragons roaring their fire into a cast member: a stream from each of `from` to `to`
  dragonfire: { front(ctx, e, pos, t) {
    const T = pos[e.to ?? 0]; if (!T) return;
    const [tx, ty] = midOf(T);
    for (const i of e.from || []) {
      const P = pos[i]; if (!P) continue;
      const [hx, hy] = headOf(P);
      stream(ctx, hx + 30 * P.s * (P.f || 1), hy + 10 * P.s, tx, ty, t + i, '255,140,40', '255,240,170', 12 + 10 * P.s);
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowDot(ctx, tx, ty, 120, '255,170,60', 0.5); ctx.restore();
  } },
  // Anastasia's crystal band glowing blue (at)
  crystalglow: { front(ctx, e, pos, t) {
    const P = pos[e.at ?? 0]; if (!P) return;
    const x = P.x + 18 * P.s * (P.f || 1), y = P.y - P.z - P.h * 0.62;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glowDot(ctx, x, y, 60, '110,210,255', 0.55 + 0.2 * Math.sin(t * 8));
    glowDot(ctx, x, y, 16, '230,250,255', 0.9);
    ctx.restore();
  } },
  // the transformation: a blaze of fire-gold light with rays behind a cast member (at), sparks in front
  transform: {
    back(ctx, e, pos, t) {
      const P = pos[e.at ?? 0]; if (!P) return;
      const [x, y] = bodyAt(P);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y);
      for (let i = 0; i < 14; i++) {
        ctx.rotate(TAU / 14);
        ctx.fillStyle = `rgba(255,${190 + (i % 2) * 40},90,${0.22 + 0.1 * Math.sin(t * 5 + i)})`;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-18, -420); ctx.lineTo(18, -420); ctx.closePath(); ctx.fill();
      }
      glowDot(ctx, 0, 0, 220, '255,200,90', 0.55);
      ctx.restore();
    },
    front(ctx, e, pos, t) {
      const P = pos[e.at ?? 0]; if (!P) return;
      const [x, y] = bodyAt(P);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const a = i * 2.39 + t, u = (t * 0.7 + i * 0.13) % 1, r = 40 + u * 180;
        ctx.fillStyle = `rgba(255,230,140,${1 - u})`; ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, 3, 3);
      }
      ctx.restore();
    },
  },
  // the breath clash: an orange stream from `from`, a green one from `to`, meeting in a burst (meet: 0..1 along the gap)
  clash: { front(ctx, e, pos, t) {
    const A = pos[e.from ?? 0], B = pos[e.to ?? 1]; if (!A || !B) return;
    // (from each mouth where the art has one -- the atlas' mouth landmark -- else off the head, as the rigs were)
    const hA = headOf(A), hB = headOf(B);
    const [ax, ay] = mouthAt(A) || [hA[0] + 30 * (A.f || 1) * A.s, hA[1] + 6], [bx, by] = mouthAt(B) || [hB[0] + 40 * (B.f || 1) * B.s, hB[1] + 10];
    const m = e.meet ?? 0.62, mx = ax + (bx - ax) * m, my = ay + (by - ay) * m;
    stream(ctx, ax, ay, mx, my, t, '255,140,40', '255,245,190', 16);
    stream(ctx, bx, by, mx, my, t + 1, '70,255,110', '230,255,230', 16);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glowDot(ctx, mx, my, 110 + Math.sin(t * 20) * 10, '255,255,210', 0.7);
    for (let i = 0; i < 16; i++) {
      const a = i * TAU / 16 + t * 2, r = 50 + ((t * 120 + i * 13) % 70);
      ctx.fillStyle = i % 2 ? 'rgba(255,190,80,0.8)' : 'rgba(140,255,150,0.8)'; ctx.fillRect(mx + Math.cos(a) * r, my + Math.sin(a) * r, 3, 3);
    }
    ctx.restore();
  } },
  // the green power fleeing as smoke toward the far horizon (from a cast member, at, or x / y)
  smoke: { back(ctx, e, pos, t) {
    const [x0, y0] = e.at !== undefined ? midOf(pos[e.at]) : [e.x ?? 400, e.y ?? 240];
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const u = (t * 0.25 + i / 12) % 1;
      const x = x0 + (980 - x0) * u, y = y0 - 140 * u + Math.sin(u * 9 + i) * 24;
      ctx.fillStyle = `rgba(70,${150 + (i % 3) * 30},90,${0.45 * (1 - u)})`;
      ctx.beginPath(); ctx.arc(x, y, 30 + 40 * u, 0, TAU); ctx.fill();
    }
    ctx.restore();
  } },
  // ---- the secret ending (docs/SECRETS_SCRIPT.md)
  // a Star Shard: a pale gold-white star crystal floating at (x, y), twinkling; big: the close-up, a sleeping dragon
  // faintly inside it
  shard: { front(ctx, e, pos, t) { drawShard(ctx, e.x ?? 480, (e.y ?? 300) + Math.sin(t * 2) * 6, e.big ? 2.6 : 1, t, !!e.big); } },
  // the three shards float up out of the heroes' pockets (from: cast indices) and streak in soft arcs to `to`; with
  // hover they stay there twinkling, pointing the way, else they sink into it in a flash (the Heartstone)
  shardsfly: { front(ctx, e, pos, t, age) {
    const from = (e.from || [0]).filter((i) => pos[i]);
    const N = e.notches, [cx, cy] = N ? [(N[0][0] + N[1][0] + N[2][0]) / 3, (N[0][1] + N[1][1] + N[2][1]) / 3] : e.to || [480, 200];
    for (let k = 0; k < 3; k++) {
      const [tx, ty] = N ? N[k] : [cx, cy];      // (into a Heartstone: each shard to its own notch)
      const P = pos[from.length ? from[k % from.length] : 0];
      const sx = P ? P.x + 8 * P.s * (P.f || 1) : 480, sy = P ? P.y - P.z - P.h * 0.42 : 420;
      const u = clamp((age - k * 0.18) / 1.5, 0, 1), eu = u * u * (3 - 2 * u);
      let x = sx + (tx - sx) * eu, y = sy + (ty - sy) * eu - Math.sin(Math.PI * eu) * 90;
      let a = 1;
      if (u >= 1) {
        if (e.hover) { const ang = t * 1.2 + k * TAU / 3; x = tx + Math.cos(ang) * 28; y = ty + Math.sin(ang) * 10; }
        else { a = clamp(1 - (age - k * 0.18 - 1.5) / 0.5, 0, 1); x = tx; y = ty; }
      }
      if (u > 0 && u < 1) {   // (a trail of sparkles)
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let j = 1; j <= 5; j++) {
          const v = clamp(eu - j * 0.05, 0, 1), px = sx + (tx - sx) * v, py = sy + (ty - sy) * v - Math.sin(Math.PI * v) * 90;
          glowDot(ctx, px, py, 8, '255,240,190', 0.5 * (1 - j / 6));
        }
        ctx.restore();
      }
      if (a > 0.01) { ctx.save(); ctx.globalAlpha = a; drawShard(ctx, x, y, u < 0.05 ? 0.4 + u * 12 : 0.7, t + k, false); ctx.restore(); }
    }
    if (!e.hover && age > 1.9 && age < 2.8) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowDot(ctx, cx, cy, 160, '255,226,140', 0.7 * (1 - (age - 1.9) / 0.9)); ctx.restore(); }
  } },
  // the Heartstone at (x, y), size r: a faceted golden crystal gem (src/heartstone.js) -- mend 0 dull and cracked, its
  // three star notches dark; they fill with light as the shards come home; mend 1 glowing gold
  heartstone: { back(ctx, e, pos, t) {
    drawHeartstone(ctx, e.x ?? 480, e.y ?? 420, (e.r ?? 62) * 1.05, clamp(e.mend ?? 0, 0, 1), t);   // (mend: the script's k -- k is the fx's name)
  } },
  // the last of the green fire, coiled loosely round a sleeping cast member (at): soft green flames all round, and
  // the Curse Wraith itself asleep on her back -- a candle with eyebrows, snoring
  curseflame: {
    back(ctx, e, pos, t) {
      const P = pos[e.at ?? 0]; if (!P) return;
      curseRing(ctx, P, t, true);
    },
    front(ctx, e, pos, t) {
      const P = pos[e.at ?? 0]; if (!P) return;
      curseRing(ctx, P, t, false);
      // (curled up on the bed at her back, beside her -- never over her face)
      const r = Math.max(18, P.h * 0.19), fx = P.x - (P.f || 1) * P.h * 0.46, fy = P.y - P.z - P.h * 0.36 + Math.sin(t * 1.4) * 4;
      ctx.save(); ctx.translate(fx, fy); drawFlameFace(ctx, r, t, 0, 0, 'sleep', false); ctx.restore();
      ctx.save(); ctx.font = `bold ${Math.round(r * 0.5)}px "Luckiest Guy", ${FONT_B}`; ctx.fillStyle = 'rgba(200,255,210,0.9)';
      for (let i = 0; i < 2; i++) { const k = (t * 0.45 + i / 2) % 1; ctx.globalAlpha = Math.sin(k * Math.PI); ctx.fillText('z', fx + r * (0.9 + k * 0.6), fy - r * (1.2 + k * 1.2)); }
      ctx.restore();
    },
  },
  // every dragon ROARS: a fire jet from each of `from`, up into the sky
  roar: { front(ctx, e, pos, t) {
    for (const i of e.from || []) {
      const P = pos[i]; if (!P) continue;
      const [hx, hy] = headOf(P);
      stream(ctx, hx + 20 * P.s * (P.f || 1), hy, hx + 60 * (P.f || 1) * P.s, hy - 200 * P.s - 60, t + i * 0.7, '255,140,40', '255,240,170', 8 + 8 * P.s);
    }
  } },
};

/** a star polygon (n points, radii ro / ri) at (x, y), turned a */
function starPath(ctx, x, y, ro, ri, n = 5, a = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, b = a + (i * Math.PI) / n; ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); }
  ctx.closePath();
}
/** a Star Shard at (x, y), size s; big: the close-up, a sleeping dragon faintly inside */
function drawShard(ctx, x, y, s, t, big) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowDot(ctx, x, y, 46 * s * (1 + 0.08 * Math.sin(t * 3)), '255,236,170', 0.55);
  ctx.globalCompositeOperation = 'source-over';
  ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.9) * 0.12);
  starPath(ctx, 0, 0, 18 * s, 8.5 * s, 5);
  const g = ctx.createLinearGradient(0, -18 * s, 0, 18 * s); g.addColorStop(0, '#fffdf2'); g.addColorStop(0.55, '#fff0b8'); g.addColorStop(1, '#f2c96a');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = Math.max(2, 2.4 * Math.min(s, 1.6)); ctx.strokeStyle = INK; ctx.stroke();
  if (big) {   // (inside: a great dragon curled up asleep, faint)
    ctx.save(); starPath(ctx, 0, 0, 18 * s, 8.5 * s, 5); ctx.clip();
    ctx.globalAlpha = 0.32; ctx.fillStyle = '#c98ea4'; ctx.strokeStyle = '#8a5a6a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(2 * s, 4 * s, 9 * s, 4.5 * s, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-7 * s, 2 * s, 4 * s, 3 * s, -0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(10 * s, 5 * s); ctx.quadraticCurveTo(15 * s, 0, 11 * s, -3 * s); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.moveTo(-3 * s, -11 * s); ctx.lineTo(2 * s, -6 * s); ctx.lineTo(-2 * s, -2 * s); ctx.closePath(); ctx.fill();
  // twinkles
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.8 + i / 3) % 1, a = i * 2.1 + 0.6, rr = 26 * s;
    ctx.globalAlpha = Math.sin(k * Math.PI);
    starPath(ctx, Math.cos(a) * rr, Math.sin(a) * rr * 0.8, 5 * Math.min(s, 1.4), 1.4 * Math.min(s, 1.4), 4, 0);
    ctx.fillStyle = '#fffbe0'; ctx.fill();
  }
  ctx.restore();
}
/** green flame tongues in a loose ring round a cast member (the back half, or the front half) */
function curseRing(ctx, P, t, back) {
  const cx = P.x, cy = P.y - P.z - P.h * 0.18, rx = P.h * 0.62, ry = P.h * 0.16;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + t * 0.5, sy = Math.sin(a);
    if (back !== sy < 0) continue;
    const fx = cx + Math.cos(a) * rx, fy = cy + sy * ry, h = P.h * (0.12 + 0.05 * Math.sin(t * 5 + i));
    const gr = ctx.createRadialGradient(fx, fy - h * 0.5, 2, fx, fy - h * 0.5, h);
    gr.addColorStop(0, 'rgba(180,255,190,0.85)'); gr.addColorStop(1, 'rgba(40,200,80,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(fx, fy - h * 0.5, h, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function wrap(ctx, text, w) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
