// SHOWCASE art: book-style painted (AI-assisted) art only where drift matters less (docs/SPRITE3D.md "Showcase").
//   * Hero-select loops: a painted 2 s loop per hero card (Wan VACE over the 3D 'select' motion, klein-painted keys:
//     tools/sprite3d/wan/showcase.py).  Atlases assets/sprites/<hero>_showcase/ on src/sprite3d.js, authored in CARD
//     space (drawn with o.scale 1 = the card's hero size), decoded only on the select screen (src/artsets.js
//     selectArt); a card whose loop is not resident draws the live sprite / code rig as before.
//   * Super-move cut-ins: one painted bust per hero (klein, book art: tools/sprite3d/wan/cutin.py) through a slanted
//     band for CUTIN_FRAMES when a super fires (game.js onUltimate pauses the game and defers the super's sound to
//     the end; the owner's START / the pause tap skips to the close after CUTIN_SKIP frames; the same hero again
//     within CUTIN_REPEAT gets the short CUTIN_QUICK version; a second super during one is queued).  Two low-denoise
//     re-paints of each painting cycle at 12 fps (a held-frame boil).  Only the heroes in play are loaded
//     (preloadCutins at level start / join).  A 2-player TEAM ATTACK (game.js startTeam) draws both heroes' paintings
//     in two bands instead (drawTeamCutin, TEAM_FRAMES), plain bands for any painting not yet resident.
// Switches: SHOWCASE in src/config.js (?showcase=0 turns both off).
import { W, H, INK, SHOWCASE, FLOOR_TOP } from './config.js';
import { spriteArt } from './sprite3d.js';

const HERO_IDS = ['dodongo', 'ana', 'shadow', 'scarlet'];
// (reduced motion -- every book's cut-ins: a slow fade -- no sliding bands or painting, no spinning rays or speed lines, no zoom
//  slam, one held painted frame)
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** a hero with no painted cut-in (Dragon Dodongo) may draw a live figure in his band: BAND_FIG[id](ctx, x, feetY, BH, t,
 * mirror), registered by src/chars.js */
export const BAND_FIG = {};
/** a secret form's cut-in: its hero's painting (Dragon Dodongo has none: his band shows the dragon, BAND_FIG) */
const FORM_CUT = { archmage: 'ana', legend: 'shadow', pirate: 'scarlet' };
const cutId = (id) => FORM_CUT[id] || id;
export const CUTIN_FRAMES = 38;          // ~0.63 s at 60 fps
export const CUTIN_QUICK = 22;           // the same hero again within CUTIN_REPEAT frames: a shorter cut-in
export const CUTIN_REPEAT = 480;         // (8 s: a stocked meter can fire supers back to back)
export const CUTIN_SKIP = 12;            // the owner's START (or the touch pause button) skips after this frame, to the close
export const CUTIN_FLASH = 12;           // a hero's later supers in a stage (the painted one plays once a stage): a flash and the name, this long
const CUT_Y = { ana: 0.09 };             // per hero: the bust lower in the band (Ana's hat crown)

// ------------------------------------------------------------------------------------------------ select loops
const SEL = {};
/** read the select-loop atlases' json (the pages decode only through useArt on the select screen) */
export async function loadShowcase() {
  if (!SHOWCASE.select) return;
  await Promise.all(HERO_IDS.map(async (id) => {
    try { SEL[id] = await spriteArt(id + '_showcase', { fallback: null }); } catch (e) { SEL[id] = null; }
  }));
}

/** the painted select loop with the feet at (x, y); t = seconds since the card was picked (null: hold drawing 0, the
 * stance).  false when it cannot draw (off, not built, not resident): the caller draws the live sprite. */
export function drawSelectLoop(ctx, id, t, x, y) {
  const A = SEL[id];
  if (!SHOWCASE.select || !A || A.atlas.missing || !A.atlas.play.resident || !A.ANIM.select) return false;
  const pose = A.ANIM.select(t == null ? 0 : t);
  ctx.save(); ctx.translate(x, y);
  A.draw(ctx, pose, { facing: 1, scale: 1 });
  ctx.restore();
  return true;
}

// ------------------------------------------------------------------------------------------------ cut-ins
const CUT = {};
const BOIL = 2;                          // extra painted frames per hero (cutin_<hero>_1.webp ..): a held-frame boil
const BOIL_EVERY = 5;                    // game frames per painted frame (12 fps, like held hand-drawn frames)
function loadImg(url, onok) {
  const img = new Image();
  img.onload = () => { (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => { img.ok = true; onok?.(); }); };
  img.src = url;
  return img;
}
/** start loading the cut-in paintings of these heroes (idempotent); only = true also drops every other hero's */
export function preloadCutins(ids, only = false) {
  if (!SHOWCASE.cutin) return;
  ids = (ids || []).map(cutId);
  if (only) {
    for (const id of Object.keys(CUT)) {
      if ((ids || []).includes(id)) continue;
      for (const im of CUT[id].imgs) im.src = '';
      delete CUT[id];
    }
  }
  for (const id of ids || []) {
    if (CUT[id] || !HERO_IDS.includes(id)) continue;
    const url = (k) => new URL(`../assets/showcase/cutin_${id}${k ? '_' + k : ''}.webp`, import.meta.url).href;
    const c = (CUT[id] = { ready: false, imgs: [] });
    c.imgs.push(loadImg(url(0), () => { c.ready = true; }));
    for (let k = 1; k <= BOIL; k++) c.imgs.push(loadImg(url(k)));
  }
}
export const cutinReady = (id) => !!(SHOWCASE.cutin && CUT[cutId(id)] && CUT[cutId(id)].ready);

const ease = (u) => 1 - Math.pow(1 - u, 3);
const easeIn = (u) => u * u * u;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** one slanted band (centre line through (W/2, cy), full height BH, open 0..1) in colour acc, with hero id's painting
 * sliding through it (fast in, a slow push through the hold, whoosh out) -- mirror: the painting flipped and coming
 * in from the left (the team cut-in's second hero).  No painting resident: a plain band. */
function paintBand(ctx, id, t, T, cy, BH, open, acc, mirror = false, iw = 560, nudge = 0, near = 602, still = false, calm = false) {
  const C = CUT[cutId(id)];
  const bandH = BH * open, slope = 0.16, ang = Math.atan(slope);                 // slanted: right side higher
  const yl = cy + slope * W / 2, yr = cy - slope * W / 2;                         // band centre line at x = 0 / x = W
  const band = () => {
    ctx.beginPath();
    ctx.moveTo(-20, yl - bandH / 2); ctx.lineTo(W + 20, yr - bandH / 2);
    ctx.lineTo(W + 20, yr + bandH / 2); ctx.lineTo(-20, yl + bandH / 2); ctx.closePath();
  };
  band(); ctx.fillStyle = acc; ctx.fill();
  const ims = C && C.ready ? C.imgs.filter((im) => im.ok) : [];
  if (ims.length) {
    ctx.save(); band(); ctx.clip();
    // the painting, tilted with the band; its outermost burst columns are stretched out to both band ends (painted
    // motion streaks, no repeated figure)
    const img = still ? ims[0] : ims[Math.floor(t / BOIL_EVERY) % ims.length];
    const u = still ? 0.5 : t / T;
    // (calm -- a gentle cut-in, every book: the painting doesn't sweep in (its dark stretched edge crossed the centre of the screen in
    //  a frame or two -- a dark flash); it is in place from the band's first frame, landing from a touch bigger and further along
    //  (pushOf, slideOf) while the band opens over it)
    const slide = still || calm ? 0 : u < 0.22 ? 1 - ease(u / 0.22) : u > 0.84 ? -easeIn((u - 0.84) / 0.16) : 0;
    const jolt = !still && t > 6 && t < 13 ? (13 - t) * 0.6 * (t % 2 ? 1 : -1) : 0;         // the shout lands: a short shake
    const fx0 = W * 0.24 + slide * W * 0.9 + (0.5 - u) * 30 + jolt + nudge;         // the face's x (the bust's left edge off screen)
    const fx = mirror ? W - fx0 : fx0;
    const ih = iw * img.height / img.width;
    ctx.save();
    ctx.translate(fx, cy + slope * (W / 2 - fx) - jolt * 0.5); ctx.rotate(-ang);
    if (calm) { const s = pushOf(t, T); ctx.scale(s, s); }
    if (mirror) ctx.scale(-1, 1);
    if (calm) ctx.translate(slideOf(t, BH), 0);
    const x0 = -0.40 * iw, y0 = -(BH / 2) * Math.cos(ang) - (0.05 - (CUT_Y[id] || 0)) * ih;   // the bust's top at the band top
    const ew = img.width * 0.035;
    ctx.drawImage(img, img.width - ew, 0, ew, img.height, x0 + iw - 2, y0, W * 1.5, ih);
    ctx.drawImage(img, 0, 0, ew, img.height, x0 - near + 2, y0, near, ih);
    ctx.drawImage(img, x0, y0, iw, ih);
    // a few tapered brush-stroke speed lines over the burst, never across the face
    ctx.fillStyle = 'rgba(255,248,232,0.30)';
    if (!still) for (let i = 0; i < 6; i++) {
      const ly = y0 + ih * (0.12 + i * 0.13), len = 150 + (i % 3) * 70;
      const lx = x0 + iw * 0.72 + ((i * 131 + t * 38) % 520);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + len, ly - 4); ctx.lineTo(lx + len, ly + 4); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  } else if (BAND_FIG[id]) {
    ctx.save(); band(); ctx.clip();
    const u = still ? 0.5 : t / T, slide = still ? 0 : u < 0.22 ? 1 - ease(u / 0.22) : u > 0.84 ? -easeIn((u - 0.84) / 0.16) : 0;
    const fx0 = W * 0.26 + slide * W * 0.9 + (0.5 - u) * 30 + nudge, fx = mirror ? W - fx0 : fx0;
    try { BAND_FIG[id](ctx, fx, cy + slope * (W / 2 - fx) + BH * 0.5, BH, t, mirror); } catch (e) { /* (a plain band) */ }
    ctx.restore();
  }
  // ink edges + a white flash line on the top edge
  ctx.lineWidth = 5; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.moveTo(-20, yl - bandH / 2); ctx.lineTo(W + 20, yr - bandH / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-20, yl + bandH / 2); ctx.lineTo(W + 20, yr + bandH / 2); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#fffbe8';
  ctx.beginPath(); ctx.moveTo(-20, yl - bandH / 2 + 5); ctx.lineTo(W + 20, yr - bandH / 2 + 5); ctx.stroke();
}
/** behind a cut-in's bands: a radial light burst from (cx, cy) in the heroes' colours, turning slowly, and speed lines
 * streaking across the dimmed screen; a = the cut-in's fade (0..1) */
function drawBurst(ctx, cx, cy, t, cols, a) {
  if (a <= 0.01) return;
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const n = 18, R = W * 0.9, rot = t * 0.012;
  for (let i = 0; i < n; i++) {
    const an = rot + (i / n) * Math.PI * 2, w = 0.06 + 0.03 * ((i * 7) % 3);
    ctx.fillStyle = `rgba(${rgb(i % 2 ? '#fff4d8' : cols[i % cols.length])},${(i % 2 ? 0.1 : 0.2) * a})`;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(an - w) * R, cy + Math.sin(an - w) * R); ctx.lineTo(cx + Math.cos(an + w) * R, cy + Math.sin(an + w) * R);
    ctx.closePath(); ctx.fill();
  }
  // speed lines: thin streaks racing right -> left at fixed heights
  for (let i = 0; i < 14; i++) {
    const y = ((i * 97) % 520) + 10, len = 120 + ((i * 53) % 160), x = W - (((t * (26 + (i % 4) * 7) + i * 211) % (W + len * 2)) - len);
    ctx.fillStyle = `rgba(255,248,232,${0.16 * a})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y - 2); ctx.lineTo(x + len, y + 2); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** a name stamped at (tx, ty), tilted with the bands: ink-outlined Luckiest Guy */
function stamp(ctx, text, tx, ty, size, fill, lw = 10) {
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(-Math.atan(0.16));
  ctx.font = `${size}px "Luckiest Guy", Bangers, Impact, sans-serif`;
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** a later super's flash (c.quick): no painting and no wash -- the super's name SLAMMED in (big, stepping down onto the screen, a
 *  short shake, then flying into the name tag src/game.js pops over the hero as play resumes) and manga focus lines closing in on
 *  the hero, while the world waits.  (Gentle, every book: the old wash lit up to 74 % of a bright screen in a frame (Book 3); the
 *  slam reads as a hit without lighting the screen -- the words and lines cover < ~10 % of it.  Reduced motion: the name and the
 *  lines held still) */
function drawFlash(ctx, c, world) {
  const t = c.t, T = c.T || CUTIN_FLASH, acc = c.accent || '#ffd23a', p = c.p, camX = world?.camX || 0;
  if (c._q0 === undefined) c._q0 = t;   // (its first drawn frame: the game steps before it draws, so that is t 1)
  if (p && world) focusLines(ctx, p.x - camX, FLOOR_TOP + p.y - (p.z || 0) - 64, t, acc);
  if (!c.name) return;
  const text = c.name + '!', i = t - c._q0;
  ctx.font = `${QUICK_SIZE}px "Luckiest Guy", Bangers, Impact, sans-serif`;
  const size = Math.min(QUICK_SIZE, QUICK_SIZE * QUICK_W / Math.max(1, ctx.measureText(text).width));   // (a long name: smaller, never wider than QUICK_W at rest)
  let s = REDUCED ? 1 : QUICK_STEPS[Math.min(i, QUICK_STEPS.length - 1)];
  const j = REDUCED || i < 3 || i > 7 ? 0 : (8 - i) * 0.9 * (i % 2 ? 1 : -1);   // (the slam lands: a short shake)
  // (where it rests: under the area's title when one is up -- it stood over it, half hiding it -- and its last frames fly it into
  //  the hero's name tag: src/game.js fx.label(p.x, p.y, 236, name, .., 38) as the flash ends)
  let x = W / 2 + j, y = (world?.bannerT > 0 ? QUICK_Y_LOW : H * 0.3) + j * 0.4;
  if (world && !world.L?.si) y = Math.max(y, (world._hudBottom || 0) + (size * 0.8 + Math.min(QUICK_W / 2, ctx.measureText(text).width * size / QUICK_SIZE / 2) * 0.08) * QUICK_STEPS[0] + 6);   // (RC4, Books 1 / 3: under the HUD band at its slam's biggest, half its tilt -- DRAGON FLARE! landed on the boss's name, sub-name and bar)
  const fk = REDUCED || !p ? 0 : ease(clamp01((t - (T - 4)) / 3));
  if (fk > 0) { x += (p.x - camX - x) * fk; y += (FLOOR_TOP + p.y - 236 - 36 + 12 - y) * fk; s *= 1 - (1 - 38 / size) * fk; }
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  stamp(ctx, text, 0, 0, size, '#fff6d8', 11);
  const hw = ctx.measureText(text).width / 2;   // (RC4: where the name is this frame -- src/game.js drawInvite1 keeps the TEAM UP! cards off it)
  ctx.restore();
  c._lab = [x - (hw + 12) * s, y - (size * 0.8 + hw * 0.16 + 8) * s, x + (hw + 12) * s, y + (size * 0.15 + hw * 0.16 + 8) * s];
}
/** manga focus lines round the hero at (x, y): thin tapered strokes pointing in, inked (they read on snow and in a cave alike),
 *  drawing in a little over the first frames */
function focusLines(ctx, x, y, t, acc) {
  const n = 22, k = REDUCED ? 1 : ease(clamp01((t + 1) / 5)), r0 = 150 - 50 * k;
  ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const an = (i / n) * Math.PI * 2 + ((i * 37) % 7) * 0.03, w = 2.5 + (i % 3) * 1.5, r1 = r0 + 110 + ((i * 53) % 50);
    const cs = Math.cos(an), sn = Math.sin(an);
    ctx.fillStyle = i % 2 ? 'rgba(255,248,232,0.9)' : acc;
    ctx.beginPath(); ctx.moveTo(x + cs * r0, y + sn * r0 * 0.8);
    ctx.lineTo(x + cs * r1 - sn * w, y + (sn * r1 + cs * w) * 0.8); ctx.lineTo(x + cs * r1 + sn * w, y + (sn * r1 - cs * w) * 0.8);
    ctx.closePath(); ctx.stroke(); ctx.fill();
  }
  ctx.restore();
}
// ------------------------------------------------------------------------------------------------ gentle cut-ins (every book)
// Flash safety (the all-books flash pass, 2026-10-25): no frame may darken >= 25 % of the screen by >= 0.1 relative luminance,
// and no 3 frames may brighten >= 25 % of it by that much.  The canvas mixes in sRGB, so a dark veil at alpha a keeps (1 - a)^2.2
// of a cell's linear light: the veil is scheduled in that DEPTH v = 1 - (1 - a)^2.2, at an even rate -- in at V_IN a frame (a
// bright 0.75 cell darkens < 0.06 a frame), out at V_OUT (3 frames: < 0.1 on the brightest quarter of any stage).  The big shapes
// come and go SPATIALLY: a band opens from its centre line (overshooting a touch, settling) and closes onto it, its painting
// already in it and pushing in (no fade over 45 % of the screen).  The veil also takes some colour out of the scene (time
// stops) and lifts as the bands close, gone as play resumes (a skipped or replaced cut-in's veil finishes as play resumes:
// drawCutinTail, from src/game.js).  The light
// burst is slowly turning wedges in the heroes' colours, laid over the scene at a low alpha (they read by colour and motion).
const QUICK_SIZE = 58, QUICK_W = 600;   // the quick super's name: font px, widest at rest
const QUICK_STEPS = [1.5, 1.25, 1.1, 1];   // its slam: the scale on its first drawn frames (an ease from 1.5 drew its first frame at 1.06)
const QUICK_Y_LOW = 236;                 // its baseline under an area title (the HUD's banner)
const vOf = (a) => 1 - Math.pow(1 - a, 2.2), aOf = (v) => 1 - Math.pow(1 - Math.min(0.95, Math.max(0, v)), 1 / 2.2);
const V_HERO = vOf(0.32), V_TEAM = vOf(0.36);   // the veil behind a hero's cut-in / a team's (alpha 0.32 / 0.36; was 0.5 / 0.55)
const V_IN = 0.075, V_OUT = 0.04;        // its depth's change a frame, in / out (~8 frames in, ~15 out)
// (the veil lifts over the cut-in's last peak / V_OUT frames, as its bands close: it is gone when play resumes -- a 15-frame tail
//  over a team attack's own effects lit 28 % of Book 3's screen in 3 frames, and a 0.1 remnant 25 %)
const DESAT = 0.6;                       // the scene's colour taken out at the hero veil's depth (luminosity kept: 'saturation')
const OPEN_N = 10;                       // frames for a band to open from / close onto its centre line -- at an even rate (a wipe: ~4.5 % of the
                                         //  screen a frame; an ease-out opened 34 % in 3 frames, an ease-in closed 20 % in the last frame)
const OVERSHOOT = 1.04, SETTLE = 5;      // a band opens to 104 % and settles back over SETTLE frames
const LAND_AT = 4, LAND_N = 12, PUSH = 0.08, SLIDE = 70, DRIFT = 0.02;   // the painting lands -- from 108 % and SLIDE px along its band --
                                         //  over LAND_N frames from LAND_AT (the band ~half open: in a thin strip it didn't show), then creeps in 2 %
const BURST_IN = 14, RAY_A = 0.3;        // the rays' ramp; their alpha (a ray's edge stays < ~0.08 relative luminance off the scene)
const TITLE_AT = 13, TITLE_SLAM = 1.5;   // TEAM ATTACK!'s first frame (band B open), its slam's start scale
const RM_IN = 30;                        // reduced motion: the band and its painting fade in over this many frames (nothing moves)
/** the cut-in drawn last (any kind): a TEAM cut-in that replaces a hero's mid-way (a hand-off) closes that hero's band; and the
 *  tail after the last one (drawCutinTail) */
let LAST_CUT = null, TAIL = null;
const toward = (v0, v1, n, up, down) => (v1 >= v0 ? Math.min(v1, v0 + up * n) : Math.max(v1, v0 - down * n));
/** a cut-in's veil depth this frame: from where the last one's left it (c._v0) to its peak at V_IN, out at V_OUT to none at its
 *  end -- after a skip, from where it was then at V_OUT (no jump: it finishes in the tail) */
const depthOf = (c) => {
  const T = c.T || (c.team ? TEAM_FRAMES : CUTIN_FRAMES), peak = c.team ? V_TEAM : V_HERO, v0 = c._v0 || 0, n = elapsed(c), t1 = T - Math.ceil(peak / V_OUT);
  // (reduced motion: in at peak / RM_IN over the frames it has run -- not its clock, which a skip moves on)
  const at = (t, k) => (REDUCED ? toward(v0, peak, k, peak / RM_IN, V_OUT) : toward(v0, peak, t + 1, V_IN, V_OUT));
  const v = c.t <= t1 ? at(c.t, n) : Math.max(0, at(t1, n - (c.t - t1)) - V_OUT * (c.t - t1)), S = c._sk;
  return S && c.t >= S.L ? Math.max(v, S.v - V_OUT * (c.t - S.L + 1)) : v;
};
/** the owner's START skips a cut-in to its close (src/game.js: c.t jumps to T - 7): where it jumped from, so the bands' close and the
 *  veil carry on from there at their own rates -- a jump closed 30 % of a band and lifted the veil by a third in a frame */
//  (a skip lands on T - 7 exactly; the screen may be drawn more or less often than the game steps, so only a jump onto T - 7 counts)
const noteSkip = (c) => {
  const T = c.T || (c.team ? TEAM_FRAMES : CUTIN_FRAMES);
  if (c._r0 === undefined) c._r0 = c.t;   // (its first drawn frame -- a painting may land a few frames late)
  if (c._lt !== undefined && c.t - c._lt >= 2 && c.t === T - 7 && !c._sk) c._sk = { P: c._lt, L: c.t, v: c._lv ?? 0 };
  c._lt = c.t;
};
/** the frames a cut-in has run since it first drew, this one included -- less any a skip jumped over */
const elapsed = (c) => c.t - (c._r0 ?? 0) + 1 - (c._sk ? c._sk.L - c._sk.P - 1 : 0);
/** a cut-in's close 0 -> 1 over its last n frames -- after a skip, from where it was then over the frames left */
const closeOf = (c, t, T, n = OPEN_N) => {
  const base = (u) => clamp01((u - (T - n)) / n), S = c._sk;
  if (!S || t < S.L) return base(t);
  const p0 = base(S.P); return p0 + (1 - p0) * clamp01((t - S.L + 1) / (T - S.L + 1));
};
/** the veil at depth v: the scene's colour taken out (DESAT at the hero veil's depth), then darkened */
function veil(ctx, v) {
  if (v <= 0.002) return;
  ctx.save();
  ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = `rgba(128,128,128,${(DESAT * Math.min(1, v / V_HERO)).toFixed(3)})`; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(14,8,22,${aOf(v).toFixed(3)})`; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
/** the depth a tail is at now (frames since it began) */
const tailV = (T0, world) => Math.max(0, T0.v - V_OUT * (T0.f0 === undefined ? 0 : world.frame - T0.f0));
/** the frames after a cut-in: its veil (and in reduced motion its band) fading out while the game goes on -- src/game.js calls
 *  this on every frame with no cut-in up (and a quick flash draws it under itself); a new cut-in or a new world ends it */
export function drawCutinTail(ctx, world) {
  const T0 = TAIL; if (!T0) return;
  if (T0.world !== world) { TAIL = null; return; }
  if (T0.f0 === undefined) T0.f0 = world.frame - 1;
  const n = world.frame - T0.f0, v = tailV(T0, world), rk = T0.rm ? 1 - n / RM_IN : 0;
  if (v <= 0 && rk <= 0) { TAIL = null; return; }
  veil(ctx, v);
  if (rk > 0) { ctx.save(); if (T0.c.team) teamLayersRM(ctx, T0.c, rk); else cutinLayers(ctx, T0.c, 1, rk); ctx.restore(); }
}
/** the depth a new cut-in's veil starts from: the tail still fading, if any */
const carry = (c, world) => (TAIL && TAIL.c !== c && TAIL.world === world ? tailV(TAIL, world) : 0);
/** draw the cut-in c = { id, t, T, accent, name } over the whole (logical 960 x 540) screen; world: for its tail */
export function drawCutin(ctx, c, world) {
  if (c._v0 === undefined) c._v0 = carry(c, world);
  LAST_CUT = c;
  if (c.quick) { if (TAIL && TAIL.c !== c) drawCutinTail(ctx, world); drawFlash(ctx, c, world); return; }
  const C = CUT[cutId(c.id)];
  if (!C || !C.ready) { if (TAIL && TAIL.c !== c) drawCutinTail(ctx, world); return; }
  TAIL = null;
  noteSkip(c);   // (from the frame it first draws -- its painting may land a few frames late)
  const v = c._lv = depthOf(c);
  veil(ctx, v);
  ctx.save(); cutinLayers(ctx, c, 1, 1); ctx.restore();
  TAIL = { c, v, world, rm: REDUCED };
}
/** a band's opening 0 -> 1.04 -> 1 at its frame t: open from its centre line at an even rate, then settle (closeOf closes it) */
function openingOf(t, n = OPEN_N) {
  const u = (t + 1) / n;
  return u < 1 ? OVERSHOOT * Math.max(0, u) : OVERSHOOT - (OVERSHOOT - 1) * clamp01((t + 1 - n) / SETTLE);
}
/** the painting's landing at its band's frame t: 0 -> 1 (smoothstep: no jolt at either end) */
const landOf = (t) => { const u = clamp01((t + 1 - LAND_AT) / LAND_N); return u * u * (3 - 2 * u); };
/** the painting's scale at frame t of T: landing from 1 + PUSH, then creeping in by DRIFT (src paintBand, calm) */
const pushOf = (t, T) => 1 + PUSH * (1 - landOf(t)) + DRIFT * clamp01((t + 1 - LAND_AT - LAND_N) / Math.max(1, T - LAND_AT - LAND_N));
/** ... and its offset along the band, px (in from the far end) -- a hero's own band only (BH 250): the team's two sliding paintings
 *  lit 25 % of Book 2's dark cave in 3 frames */
const slideOf = (t, BH) => (BH >= 250 ? SLIDE * (1 - landOf(t)) : 0);
/** a hero cut-in's rays, band and name (no veil); shrink: its band's height (a hand-off closes it onto its centre line, as it
 *  would close at its end); rk: reduced motion's fade (the tail) */
function cutinLayers(ctx, c, shrink = 1, rk = 1) {
  const t = c.t, T = c.T || CUTIN_FRAMES, acc = c.accent || '#ffd23a', cy = H * 0.45;
  if (REDUCED) {   // (reduced motion: the band, its painting held still and the name fade in together; out in the tail)
    const fa = clamp01(elapsed(c) / RM_IN) * rk;   // (by the frames it has run: a skip doesn't jump it)
    ctx.save(); ctx.globalAlpha = fa; paintBand(ctx, c.id, t, T, cy, 250 * shrink, 1, acc, false, 560, 0, 602, true);
    if (c.name) { ctx.font = '44px "Luckiest Guy", Bangers, Impact, sans-serif'; const half = ctx.measureText(c.name).width / 2, tx = Math.min(W * 0.80, (c.si ? 906 : W - 26) - half), ty = cy - 0.16 * (tx - W / 2) + 125 - 20; stamp(ctx, c.name, tx, ty, 44, '#fff6d8'); c._lab = [tx - half - 12, ty - 35 - half * 0.16 - 8, tx + half + 12, ty + 7 + half * 0.16 + 8]; }   // (RC4: c._lab -- src/game.js drawInvite1)
    ctx.restore(); return;
  }
  const open = openingOf(t) * (1 - closeOf(c, t, T)) * shrink, BH = 250, bandH = BH * open, slope = 0.16;
  ctx.save();
  drawRays(ctx, W / 2, cy, t, [acc], Math.min(1, open) * clamp01((t + 1) / BURST_IN));
  if (bandH > 1) {
    // (the painting is in the band from its first frame and the band opens over it -- no fade over half the screen)
    paintBand(ctx, c.id, t, T, cy, BH, open, acc, false, 560, 0, 602, false, true);
    // the super's name: stamped in from the right edge once the bust has landed, along the band's lower edge
    if (t >= 8 && open > 0.6 && c.name) {
      ctx.font = '44px "Luckiest Guy", Bangers, Impact, sans-serif';
      const half = ctx.measureText(c.name).width / 2;
      const tu = clamp01((t - 8) / 6), rest = Math.min(W * 0.80, (c.si ? 906 : W - 26) - half);
      const tx = rest + (1 - ease(tu)) * (W + half - rest), ty = cy - slope * (tx - W / 2) + bandH / 2 - 20;
      stamp(ctx, c.name, tx, ty, 44, '#fff6d8');
      c._lab = [tx - half - 12, ty - 35 - half * 0.16 - 8, tx + half + 12, ty + 7 + half * 0.16 + 8];   // (RC4: where the name is this frame -- src/game.js drawInvite1 keeps the TEAM UP! cards off it)
    }
  }
  ctx.restore();
}
/** the light burst, gentle: slowly turning wedges in the heroes' colours (every other one: a ray and a gap) laid OVER the veiled
 *  scene at a low alpha -- seen by colour and motion, not light -- and the old thin speed streaks */
function drawRays(ctx, cx, cy, t, cols, a) {
  if (a <= 0.01) return;
  ctx.save();
  const n = 16, R = W * 0.9, rot = t * 0.01;
  ctx.globalAlpha = RAY_A * a;
  for (let i = 0; i < n; i += 2) {
    const an = rot + (i / n) * Math.PI * 2, w = 0.08 + 0.025 * ((i * 7) % 3);
    ctx.fillStyle = cols[(i / 2) % cols.length];
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(an - w) * R, cy + Math.sin(an - w) * R); ctx.lineTo(cx + Math.cos(an + w) * R, cy + Math.sin(an + w) * R);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 14; i++) {   // (speed lines: thin streaks racing right -> left at fixed heights)
    const y = ((i * 97) % 520) + 10, len = 120 + ((i * 53) % 160), x = W - (((t * (26 + (i % 4) * 7) + i * 211) % (W + len * 2)) - len);
    ctx.fillStyle = `rgba(255,248,232,${0.16 * a})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y - 2); ctx.lineTo(x + len, y + 2); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ team cut-in
export const TEAM_FRAMES = 46;           // a TEAM ATTACK's cut-in (game.js startTeam): a beat longer than a hero's own
/** reduced motion's team layers: the two bands held still and the words, at alpha fa */
function teamLayersRM(ctx, c, rk = 1) {
  const t = c.t, T = c.T || TEAM_FRAMES, BH = 180, cyA = H * 0.27, cyB = H * 0.71, slope = 0.16, cy = (cyA + cyB) / 2;
  const fa = clamp01(elapsed(c) / RM_IN) * rk;
  ctx.save(); ctx.globalAlpha = fa;
  paintBand(ctx, c.ids[0], t, T, cyA, BH, 1, c.accents[0], false, 420, 0, W * 1.5, true);
  paintBand(ctx, c.ids[1], t, T, cyB, BH, 1, c.accents[1], true, 420, 40, W * 1.5, true);
  stamp(ctx, 'TEAM ATTACK!', W / 2, cy + 20, 54, '#ffe066', 12);
  if (c.name) { ctx.font = '40px "Luckiest Guy", Bangers, Impact, sans-serif'; const half = ctx.measureText(c.name).width / 2, tx = Math.max(W * 0.33, (c.si ? 54 : 26) + half); stamp(ctx, c.name, tx, cyB - slope * (tx - W / 2) + BH / 2 - 18 - (c.si ? 4 : 0), 40, '#fff6d8'); }
  for (const q of extraChips(ctx, c, cy)) { const k = clamp01((t - 9 - q.i * 4) / 8); if (k <= 0) continue; ctx.save(); ctx.globalAlpha = fa * k; stamp(ctx, q.text, q.x, q.y, 34 * q.s, q.accent || '#fff6d8', 8 * q.s); ctx.restore(); }   // (RC: extraChips)
  ctx.restore();
}
/** (RC) the "+ NAME" chips of a third / fourth hero who joined a team attack (World.teamJoin), laid out so they never print on one
 *  another -- at a fixed 150 px apart, twins read "+ SHADOW+ SHADOW" (crowds/mm3_4P) and long names ran into each other.  Twins
 *  (one hero picked twice) make ONE chip, "+ SHADOW ×2"; the chips go one after another along the bands' slant, the first where
 *  it always landed (under the title's right half), each measured; a row too long slides left, then shrinks (to 0.72), then breaks
 *  one chip to a row (+ ARCHMAGE ANASTASIA / + PIRATE QUEEN SCARLET) -- all inside the screen (Book Two: the TV's safe area).
 *  -> [{ text, accent, i (its landing order), x, y, s (its size factor) }] */
function extraChips(ctx, c, cy) {
  const G = [];
  for (const e of c.extra || []) { const key = e.id || e.name, g = G.find((q) => q.key === key); if (g) g.n++; else G.push({ key, name: e.name, accent: e.accent, n: 1 }); }
  if (!G.length) return [];
  const xL = c.si ? 54 : 30, xR = W - (c.si ? 48 : 24), room = xR - xL, gap = 24, cs = Math.cos(Math.atan(0.16)), x0 = W * 0.66;
  ctx.save(); ctx.font = '34px "Luckiest Guy", Bangers, Impact, sans-serif';
  const L = G.map((g) => { const text = '+ ' + g.name + (g.n > 1 ? ' ×' + g.n : ''); return { text, accent: g.accent, w: (ctx.measureText(text).width + 10) * cs }; });   // (w: its run along x -- tilted, its ink line in)
  ctx.restore();
  const len = (row, s) => row.reduce((a, q) => a + q.w * s, 0) + gap * (row.length - 1);
  let s = 1, rows = [L];
  if (len(L, 1) > room) { s = Math.max(0.72, room / len(L, 1)); if (len(L, s) > room) { s = Math.min(1, room / Math.max(...L.map((q) => q.w))); rows = L.map((q) => [q]); } }
  const out = [];
  rows.forEach((row, r) => {
    let x = Math.min(Math.max(x0 - (row[0].w * s) / 2, xL), xR - len(row, s));
    for (const q of row) { const cx = x + (q.w * s) / 2; out.push({ text: q.text, accent: q.accent, i: out.length, x: cx, y: cy + 64 + r * 40 * s - (cx - x0) * 0.16, s }); x += q.w * s + gap; }
  });
  return out;
}
/** the TEAM ATTACK cut-in, c = { team: true, ids: [a, b], accents: [a, b], t, T, name }: two bands -- the first hero's
 * painting in the upper one (in from the right), the second's mirrored in the lower one (in from the left, a beat
 * later) -- "TEAM ATTACK!" slammed into the gap between them and the pair's combo name on the lower band's edge.
 * Drawn even before the paintings are resident (plain bands): a team attack never waits on art. */
export function drawTeamCutin(ctx, c, world) {
  const t = c.t, T = c.T || TEAM_FRAMES, D = 4;
  // (a hand-off: the hero's own cut-in it replaced -- drawn last, mid-way, not a quick flash -- its band closes onto its centre line
  //  over the frames the team's bands open (a wipe, as its own close), and the veil carries on from where it had come up)
  if (c._from === undefined) {
    const L = LAST_CUT; c._from = c.handoff && L && L !== c && !L.team && !L.quick && L.t < (L.T || CUTIN_FRAMES) ? L : null;
    c._v0 = c._from ? depthOf(c._from) : carry(c, world);
  }
  LAST_CUT = c; TAIL = null;
  noteSkip(c);
  const fromK = c._from ? 1 - clamp01(elapsed(c) / (REDUCED ? RM_IN : OPEN_N)) : 0;   // (reduced motion: its bands fade in from nothing as the hero's fades)
  const hold = c._from ? 0.6 : 0;
  const BH = 180, cyA = H * 0.27, cyB = H * 0.71, slope = 0.16, v = c._lv = depthOf(c);
  if (REDUCED) {   // (reduced motion: a fade -- nothing sliding, spinning or slamming; the outgoing hero band fades as these come up)
    veil(ctx, v);
    ctx.save();
    if (fromK > 0) cutinLayers(ctx, c._from, 1, fromK);
    teamLayersRM(ctx, c, 1);
    ctx.restore();
    TAIL = { c, v, world, rm: true }; return;
  }
  const cl = closeOf(c, t, T), openAt = (d, h = 0) => { const o = openingOf(t - d) * (1 - cl); return cl > 0 ? o : Math.max(h, o); };
  veil(ctx, v);
  ctx.save();
  if (fromK > 0) cutinLayers(ctx, c._from, fromK, 1);
  const oA = openAt(0, hold), oB = openAt(D);
  drawRays(ctx, W / 2, (cyA + cyB) / 2, t, c.accents, Math.min(1, Math.max(oA, oB)) * clamp01((t + 1) / BURST_IN));
  const fadeOut = clamp01((T - t) / 8);
  // (the far ends' stretched burst columns run the whole width; B's bust sits 40 px further in so the two painting
  // edges don't stack into one seam under the title)
  if (BH * oA > 1) paintBand(ctx, c.ids[0], t, T, cyA, BH, oA, c.accents[0], false, 420, 0, W * 1.5, false, true);
  if (BH * oB > 1) paintBand(ctx, c.ids[1], Math.max(0, t - D), T - D, cyB, BH, oB, c.accents[1], true, 420, 40, W * 1.5, false, true);
  ctx.globalAlpha = 1;
  // "TEAM ATTACK!" slams into the gap once both bands are open -- solid from its first frame, scaling down onto the screen (TITLE_AT:
  // over the bands' opening it lit 26 % of Book 2's dark cave in 3 frames) -- then the pair's name slides in from the left
  if (t >= TITLE_AT && oB > 0.6) {
    const k = clamp01((t - TITLE_AT) / 4), cy = (cyA + cyB) / 2, zs = TITLE_SLAM - (TITLE_SLAM - 1) * ease(k);
    ctx.save(); ctx.translate(W / 2, cy); ctx.scale(zs, zs); ctx.globalAlpha = fadeOut;
    stamp(ctx, 'TEAM ATTACK!', 0, 20, 54, '#ffe066', 12);
    ctx.restore();
  }
  if (t >= TITLE_AT + 3 && oB > 0.6 && c.name) {
    ctx.font = '40px "Luckiest Guy", Bangers, Impact, sans-serif';
    const half = ctx.measureText(c.name).width / 2;
    const tu = clamp01((t - TITLE_AT - 3) / 6), rest = Math.max(W * 0.33, (c.si ? 54 : 26) + half);
    const tx = rest - (1 - ease(tu)) * (rest + half), ty = cyB - slope * (tx - W / 2) + BH * oB / 2 - 18 - (c.si ? 4 : 0);   // (Book 2: 4 px up -- its rotated corner sat on the safe line)
    stamp(ctx, c.name, tx, ty, 40, '#fff6d8');
  }
  // a third / fourth hero who joined (World.teamJoin): "+ NAME" in their colour, landing under the title one by one (RC: laid out
  // by extraChips -- never on one another; twins as one "+ NAME ×2")
  for (const q of extraChips(ctx, c, (cyA + cyB) / 2)) {
    const k = clamp01((t - 9 - q.i * 4) / 5);
    if (k <= 0) continue;
    ctx.save(); ctx.globalAlpha = Math.min(1, k * 2);
    stamp(ctx, q.text, q.x, q.y, (34 - 6 * (1 - ease(k))) * q.s, q.accent || '#fff6d8', 8 * q.s);
    ctx.restore();
  }
  ctx.restore();
  TAIL = { c, v, world, rm: false };
}
