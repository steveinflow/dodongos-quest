// Shared runtime for 3D-rendered sprite characters (tools/sprite3d, docs/SPRITE3D.md).
//
//   const A = await spriteArt('dodongo', { fallback: RIG });   // RIG = the code-rig module, or null
//   (opts.only: 'painted' -- a character built in that one look alone reads assets/sprites/<name>_painted/ only)
//   export const { draw, ANIM, META, SHOOT_ORIGIN, CARRY_POINT, WALK_STRIDE, RUN_STRIDE, CARRY_STRIDE } = A;
//
// Each atlas assets/sprites/<name>/<name>_<s>x.json is inked at its final size and turned into the art contract of
// docs/CONTRACTS.md:
//   * ANIM[key](arg): 'k' clips (timed moves: hand-timed held drawings, json g = start game frame of each drawing),
//     't' loops (seconds), 'ph' loops (gait phase), static poses (objects); a 'time_fps' static clip animates from o.t
//     at draw time (e.g. a flailing 'fly').  Keys with no rendered clip fall back to the code rig.
//   * A sprite pose is { s3d: 1, clip, f_<clip>: drawing }; a fallback pose is the rig pose + { s3d: 0 }, so the
//     engine's pose mixing (land -> idle, rise -> fall) switches art at the halfway point instead of a broken blend.
//   * draw(ctx, pose, o): feet at (0, 0); o.facing picks the real _R / _L view, or mirrors _R for unhanded characters
//     (enemies); o.talk flaps the mouth on clips rendered with a talk variant; o.scale scales.
//   * META / SHOOT_ORIGIN / CARRY_POINT come from the atlas (computed from the 3D landmarks) or the fallback module;
//     WALK/RUN/CARRY_STRIDE make the engine advance the gait phase by distance so the feet stay planted.
//
// MEMORY (the decoded atlas pages are what costs: 4 bytes per page pixel).  The json (clips, landmarks, exports) is
// read when a module loads; the page images are decoded only while a scene needs them:
//   * PACKS: an atlas may come as a GAMEPLAY pack (<name>_<s>x.json, every clip a level uses) and a SCENE pack
//     (<name>_scene_<s>x.json, the clips the cutscenes and the hero select use; tools/sprite3d/packsets.json); a clip
//     used by both is in both.  An atlas without a scene pack has one pack with every clip (as before).  A LEVEL pack
//     (<name>_level_<s>x.json, opts.levelPack) is a form's few clips for the levels -- Dragon Dodongo's super: transform,
//     flyLoop, flame -- named 'name:level' in a set; it is the scene set's lowest priority (tier 'extra': stepped down
//     first, to 1x then 0.75x, before any boss or hero) and never stands in for the other packs.  A MOVE pack
//     (<name>_move_<s>x.json, opts.extraPacks ['move']) is a hero's movement clips -- painter 3's squat, rise, fall, land,
//     skid, runTurn, dodgeBack, bounce, moved out of the gameplay pack to fit the memory -- 'name:move' in a level's set,
//     the extra tier too; its clip WINS over the gameplay pack's same key while it is decoded (the gameplay pack keeps one
//     drawing of squat / rise / fall / land: today's pose, the fallback), and A.hasNow(clip) says whether a clip's own
//     pack is decoded (src/player.js hasClip gates painter 3's hooks on it).
//   * managed mode (the game: main.js calls setArtManaged() before the character modules load): no pages at load;
//     useArt(names) decodes the packs a scene needs (src/artsets.js: 'ana' = the gameplay pack, 'ana:scene' = the
//     scene pack) and releases every other one (ImageBitmap.close()).  A drawing whose pack is not resident draws the
//     code rig for that moment and, unless setArtLazy(false), loads that pack in the background (a safety net).
//   * unmanaged (the tools that import a character module and draw it at once): every pack is decoded at load.
//   * scale policy (src/artplan.js, shared with tools/memlevels.mjs): each pack WANTS the scale whose texels cover its
//     drawing -- the render scale (device px per game px: setArtScale, from src/main.js resize; devicePixelRatio until
//     then) times the sprite's draw scale (src/artsets.js drawK) -- on a device with the memory (navigator.deviceMemory
//     >= 4 where the browser reports it; else as at a render scale of 1).  When a scene's set would go over the decoded
//     budget (250 MB, ?artmb=N) less a 10 MB headroom (?artroom=N), useArt() steps it down: a form's level pack, then
//     the enemies together, the bosses to 1x, the heroes together, the bosses to 0.75x (an atlas built with the 0.75x
//     option); then the latest steps are undone wherever the budget still has room.  ?atlas=1|2 forces a scale (tests).
//   * GPU pages (src/gl2d.js, src/ktx2.js): a page the atlas json declares as KTX2 is transcoded to a compressed GPU
//     format this device has (ASTC / BC7 / ETC2: 1 byte per pixel, ASTC 6x6 under half that) and drawn by the WebGL2
//     sprite layer, which composites into the same 2D frame in draw order; the budget counts those GPU bytes.  No
//     WebGL2, no format, no transcoder or a failed page: that page decodes for canvas 2D as before.  ?gl=1 puts every
//     page on the GPU (uncompressed RGBA where there is no KTX2: tests), ?gl=0 none.
import { tierOf, drawK, bossFamily } from './artsets.js';
import { wantScale, planScales, GPU_RESERVE } from './artplan.js';
import { ART } from './config.js';
import { IOS } from './canvasmem.js';
import { GL_MODE, glReady, glTexFromImage, glSprite, glFree, glOnLost, glOnRestored, GL_STATS } from './gl2d.js';
import { decl as ktxDecl, planPage, planBytes, loadPage as ktxPage, KTX_STATS, endWorker } from './ktx2.js';

const Q = (() => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(''); } })();
const DPR = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
const MEM = typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null;
const FORCE = [1, 2].includes(+Q.get('atlas')) ? +Q.get('atlas') : 0;
export const POLICY = {
  dpr: DPR, deviceMemory: MEM, hiDpr: DPR > 1.25, memOk: MEM === null || MEM >= 4,
  // the render scale (device px per game px): src/main.js resize -> setArtScale (the canvas backing store / 960)
  renderScale: DPR,
  budget: (+Q.get('artmb') || 250) * 1024 * 1024, force: FORCE,
  // the step-down fits a scene's set this far under the budget (?artroom=N MB): an atlas re-packed a little bigger never
  // runs a scene to the edge (Dodongo's painted 2x pack grew to 111.7 MB with his hair and spikes: L1 with two players
  // reached 248.5 of 250 MB)
  headroom: (Q.has('artroom') ? +Q.get('artroom') : 10) * 1024 * 1024,
};
/** the render scale the wants are sized for: a device without the memory plans as at 1 */
const scaleIn = () => (POLICY.memOk ? POLICY.renderScale : 1);
// ?art3d=<look> (anything but 1) prefers the atlas assets/sprites/<name>_<look>/ (e.g. ?art3d=painted), with the clips it
// lacks taken from the main atlas: look tests can render a few clips and still play the whole game.
const LOOK = ART.look;              // (src/config.js ART: ?art3d=<look>, or the default art switch's)

let MANAGED = false;
let LAZY = true;
/** a soft light rim behind every sprite drawing (a level whose backdrop swallows dark outlines: the stage module's
 * SPRITE_RIM, set by main.js): { color: CSS colour, blur: game px } or null.  A canvas shadow, so the GPU layer
 * composites it exactly (src/gl2d.js: a sprite drawn with a shadow is composited on its own with that state). */
let RIM = null;
// whole device pixels where an atlas texel lands 1:1 on a device pixel (a 1x atlas at dpr 1, a 2x atlas at dpr 2, an
// axis-aligned transform): there a fractional origin only blurs the drawing (bilinear) -- painted readtech, Scarlet.
// Scaled draws (a 1x atlas at dpr 2, 0.75x, cutscene scales) keep their sub-pixel placement.  ?snap=0: off (A/B tests)
const SNAP = Q.get('snap') !== '0';
/** [dx, dy] (ctx units) moved so the drawing's top-left lands on a whole device pixel, where it maps 1:1 */
function snapDraw(ctx, dx, dy, k, flip) {
  if (!SNAP) return [dx, dy];
  const m = ctx.getTransform();
  if (m.b !== 0 || m.c !== 0) return [dx, dy];
  const a = flip ? -m.a : m.a, d = m.d;
  if (Math.abs(Math.abs(a) * k - 1) > 0.002 || Math.abs(Math.abs(d) * k - 1) > 0.002) return [dx, dy];
  const X = a * dx + m.e, Y = d * dy + m.f;
  return [dx + (Math.round(X) - X) / a, dy + (Math.round(Y) - Y) / d];
}
export function setArtRim(spec) { RIM = spec && spec.color ? spec : null; }
/** the game manages residency (call before the character modules load): pages decode only through useArt() */
export function setArtManaged(on = true) { MANAGED = on; }
/** false: a non-resident pack just draws its code rig (no background load) -- e.g. the co-op join picker */
export function setArtLazy(on) { LAZY = on; }

const REG = new Map();          // atlas name -> Atlas
let TIER_OVR = new Map();       // pack -> its tier in the current scene's set (useArt: 'name@tier')
/** an atlas some module asked for (spriteArt) whose files aren't there for the current look (src/artsets.js falls back
 * to the base a variant is washed from) */
export const atlasMissing = (name) => !!REG.get(name)?.missing;
const sx = (s) => String(s);    // 1 -> '1', 0.75 -> '0.75' (file names)

// ------------------------------------------------------------------------------------------------ json + pages
// the shipped build's atlas index (tools/make_dist.py writes it into the page: { atlas dir: [json stems] }): only the
// atlas jsons that exist are fetched -- a look (?art3d=painted) over a character with no toon atlas, or a scale an
// atlas wasn't packed at, costs no 404.  In development there is none: every candidate is tried, as before.
const INDEX = typeof window !== 'undefined' && window.DQ_ATLAS_INDEX ? window.DQ_ATLAS_INDEX : null;
/** fetch with a time limit (a stalled request -- LOADING forever -- fails after `ms` as an aborted one does: the code rig
 * draws, and it's reported to the error ring) */
export async function fetchT(url, ms = 20000, opts = {}) {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ac?.abort(), ms);
  try { return await fetch(url, ac ? { ...opts, signal: ac.signal } : opts); }
  catch (e) { if (ac?.signal.aborted) { const t = new Error(`timed out: ${url}`); try { globalThis.DQ?.reportError?.(t, 'fetch'); } catch { /* */ } throw t; } throw e; }
  finally { clearTimeout(timer); }
}
async function fetchJson(dir, stem) {
  if (INDEX) {
    const d = decodeURIComponent(new URL(dir).pathname.replace(/\/$/, '').split('/').pop());
    if (!(INDEX[d] || []).includes(stem)) throw new Error('not built');
  }
  const r = await fetchT(new URL(`${stem}.json`, dir));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  d.dir = dir;
  d.pageInfo = pageSizes(d);
  d.pageInfo.forEach((p, i) => { p.ktx2 = ktxDecl(d, i); p.gpuOnly = !!d.gpu_only; });   // (gpuOnly: no WebP twin shipped -- tools/make_dist.py)
  return d;
}

// ------------------------------------------------------------------------------------------------ GPU pages
let PLAN_GEN = 0;               // bumped when the GPU path goes (cached plans go stale)
let GPU_OFF = '';               // why the GPU path is off now ('' while it can be used)
let GPU_DEAD = false;           // off for the rest of the session (a real failure: gpuOff)
const LOSSES = [];              // when the WebGL context was lost (LOSS_MAX within LOSS_WINDOW: off for good)
const LOSS_MAX = 3, LOSS_WINDOW = 5 * 60 * 1000;
/** the KTX2 variant + GPU format this page would load as on this device (null: decoded for canvas 2D) */
function gpuPlan(pg) {
  if (GL_MODE === 'off' || GPU_OFF || !pg.ktx2) return null;
  if (pg.planGen !== PLAN_GEN) { pg.planGen = PLAN_GEN; pg.plan = glReady() ? planPage(pg.ktx2) : null; }
  return pg.plan;
}
/** a json this device can read: a GPU-ONLY one (tools/make_dist.py: KTX2 pages, its WebP twin not shipped) only while
 *  its pages go on the GPU -- without WebGL2 / the formats, or after gpuOff, it is no scale at all (the plan and the loads
 *  take the 1x WebP) */
const usable = (D) => !D.gpu_only || D.pageInfo.every((pg) => gpuPlan(pg));
/** bytes a page costs once resident: its GPU format's size, else 4 per pixel (decoded, or an RGBA texture) */
const pageCost = (pg) => { const P = gpuPlan(pg); return P ? planBytes(P) : pg.w * pg.h * 4; };
const imgBytes = (im) => (!im ? 0 : im.gl ? im.bytes : (im.width || 0) * (im.height || 0) * 4);
const freeImg = (im) => { if (!im) return; if (im.gl) glFree(im); else if (im.close) im.close(); else im.src = ''; };
/** THE FALLBACK: the GPU path goes -- every pack on the GPU is released and the current set is planned again at 4 bytes
 *  a pixel and read from its WebP pages (the 1x for a GPU-only pack; the code rig draws those characters for the frames
 *  that takes).  forGood: a real failure -- a KTX2 page that failed (fetch, transcode, upload) on a working context, or
 *  the context lost LOSS_MAX times within LOSS_WINDOW -- for the rest of the session, logged once.  Otherwise (a lost
 *  context: iOS Safari drops it with the tab in the background) until it is restored (gpuBack) */
function gpuOff(why, e, forGood = true) {
  if (GPU_DEAD || (GPU_OFF && !forGood)) return;
  if (forGood) GPU_DEAD = true;
  const was = GPU_OFF;
  GPU_OFF = why;
  KTX_STATS.fails++;
  if (was) return;                     // (already off and released: now for good)
  console.warn('sprite3d: the GPU path is off (' + why + ') -- the atlases go back to their WebP pages and canvas 2D' + (forGood ? '' : ' until the context is restored'), e || '');
  PLAN_GEN++;
  for (const a of REG.values()) for (const p of a.all) if (p.images && p.images.some((im) => im && im.gl)) p.release();
  if (MANAGED && USE_NAMES) setTimeout(() => useArt(USE_NAMES).catch(() => {}), 0);
}
/** one page, resident: KTX2 -> compressed texture where planned; else decoded (+ an RGBA texture with ?gl=1) */
async function loadAnyPage(pg) {
  const P = gpuPlan(pg);
  if (P) {
    // (a page that failed on a working context is a real failure; one cut short by a lost context is not -- glReady)
    try { return await ktxPage(P); } catch (e) { gpuOff('a KTX2 page failed', e, glReady()); if (pg.gpuOnly) throw e; }   // (a GPU-only page has no WebP to fall to: the re-plan takes the 1x)
  } else if (pg.gpuOnly) throw new Error('a GPU-only page without the GPU path: ' + pg.url);
  const im = await decodePage(pg.url);
  if (GL_MODE === 'on' && glReady()) {
    const t = glTexFromImage(im);
    if (t) { im.close?.(); return t; }
  }
  return im;
}

/** the size of each page from its drawings' rects (pages are 2048 wide, cropped to the lowest drawing): a budget
 * estimate before the page is decoded; the decoded size replaces it */
function pageSizes(d) {
  if (Array.isArray(d.page_sizes) && d.page_sizes.length === d.pages.length) {   // (pack.py writes the exact sizes)
    return d.pages.map((p, i) => ({ url: new URL(p, d.dir).href, w: d.page_sizes[i][0], h: d.page_sizes[i][1] }));
  }
  const W = d.pages.map(() => 0), H = d.pages.map(() => 0);
  for (const c of Object.values(d.clips)) {
    for (const fr of [...c.frames, ...(c.talk || [])]) {
      W[fr[0]] = Math.max(W[fr[0]], fr[1] + fr[3]);
      H[fr[0]] = Math.max(H[fr[0]], fr[2] + fr[4]);
    }
  }
  return d.pages.map((p, i) => ({ url: new URL(p, d.dir).href, w: Math.max(W[i], H[i] ? 2048 : 0), h: H[i] + 1 }));
}

/** main atlas M + look atlas V (same scale and pack): V's clips win, M's fill the gaps -- only the M pages those gap
 * clips use are kept (renumbered after V's) */
function mergeAtlas(V, M, skip = null) {
  if (!V) return M;
  if (!M || M.scale !== V.scale) return V;
  const used = new Map();
  const gaps = Object.entries(M.clips).filter(([k]) => !V.clips[k] && !(skip && skip.has(k)));   // (skip: the look's scene pack has it)
  for (const [, c] of gaps) for (const fr of [...c.frames, ...(c.talk || [])]) if (!used.has(fr[0])) used.set(fr[0], 0);
  const keep = [...used.keys()].sort((a, b) => a - b);
  keep.forEach((p, i) => used.set(p, V.pageInfo.length + i));
  V.pageInfo = V.pageInfo.concat(keep.map((p) => M.pageInfo[p]));
  for (const [k, c] of gaps) {
    const re = (fr) => [used.get(fr[0])].concat(fr.slice(1));
    V.clips[k] = Object.assign({}, c, { frames: c.frames.map(re) }, c.talk ? { talk: c.talk.map(re) } : {});
  }
  V.stride = Object.assign({}, M.stride || {}, V.stride || {});
  V.exports = Object.assign({}, M.exports || {}, V.exports || {});
  return V;
}

async function decodePage(url) {
  // (iOS / iPadOS: an <img> -- its decoded pixels don't count toward WebKit's canvas memory cap the way an ImageBitmap's
  //  backing store does; past that cap the last pages decoded came out blank -- src/canvasmem.js)
  if (typeof createImageBitmap === 'function' && !IOS) {
    try {
      const r = await fetchT(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await createImageBitmap(await r.blob());
    } catch (e) { if (/timed out/.test(e?.message || '')) throw e; /* an old engine without blob decode: the <img> path */ }
  }
  return new Promise((res, rej) => {
    const im = new Image();
    const timer = setTimeout(() => { if (im.onerror) { im.onerror = null; im.onload = null; im.src = ''; const e = new Error('timed out: atlas page ' + url); try { globalThis.DQ?.reportError?.(e, 'atlas page'); } catch { /* */ } rej(e); } }, 20000);   // (a stalled page: given up)
    im.addEventListener('load', () => clearTimeout(timer), { once: true });
    // (onerror goes once the page is in: a released page -- freeImg's src = '' -- fires an error event, which is no failure)
    im.onload = () => { im.onerror = null; (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im)); };
    im.onerror = () => {
      im.onerror = null;
      const e = new Error('atlas page ' + url);
      if (im.getAttribute('src')) try { globalThis.DQ?.reportError?.(e, 'atlas page'); } catch { /* */ }   // (not a release mid-load)
      rej(e);
    };
    im.src = url;
  });
}

/** one pack ('play' = the main atlas, 'scene') of an atlas: its json per scale, the active scale's decoded pages */
class Pack {
  constructor(atlas, kind) {
    this.atlas = atlas;
    this.kind = kind;
    this.js = {};                 // scale -> Promise<json> (look merged)
    this.D = null;                // the active json
    this.images = null;           // the active scale's decoded pages (null = not resident)
    this.loading = null;
  }
  stem(name, s) { return this.kind === 'play' ? `${name}_${sx(s)}x` : `${name}_${this.kind}_${sx(s)}x`; }
  /** an extra pack: a form's 'level' pack, a hero's 'move' pack (src/artsets.js tierOf: tier 'extra') */
  get extra() { return this.kind !== 'play' && this.kind !== 'scene'; }
  /** the step-down tier: an extra pack is 'extra', the others their atlas' */
  get tier() { return this.extra ? 'extra' : (TIER_OVR.get(this) || this.atlas.tier); }
  /** the scales this pack was built at */
  get built() { return (this.extra ? this.atlas.xScales[this.kind] : this.atlas.scales) || [1, 2]; }
  /** the scale this pack wants before the budget (src/artplan.js wantScale): its draw's device px per 1x texel */
  get want() { return FORCE || wantScale(this.built, scaleIn() * drawK(this.atlas.name, this.kind)); }
  json(s) {
    if (!this.js[s]) {
      const A = this.atlas;
      this.js[s] = (async () => {
        // only the scales the atlas was packed at, and a scene pack only where its main json declares one (no 404s);
        // an extra pack: the scales its own json declares (read once at load: spriteArt opts.levelPack / extraPacks)
        const scales = this.extra ? A.xScales[this.kind] : A.scales;
        if (scales ? !scales.includes(s) : ![1, 2].includes(s)) throw new Error(`no ${A.name} ${this.kind} ${sx(s)}x atlas`);   // (0.75x: only where declared)
        let M = null, V = null, skip = null;
        if (this.kind === 'play' || this.extra) {   // (the main and the look json at once: one round trip, not two)
          [M, V] = await Promise.all([A.noBase ? null : fetchJson(A.dir, this.stem(A.name, s)).catch(() => null),
            A.lookDir ? fetchJson(A.lookDir, this.stem(A.lookName, s)).catch(() => null) : null]);
          if (this.kind === 'play') A.flags[s] = { main: !!(M && M.scene_pack), look: !!(V && V.scene_pack) };
          // (a clip the look moved into its scene pack -- painted Dodongo's 'surprised', Scarlet's 'sit' -- is not filled in
          //  from the main atlas' gameplay pages: those pages decoded in every scene, 16-30 MB, for a pose only the scenes draw)
          if (this.kind === 'play' && V && M && V.scene_pack && M.scale === V.scale && Object.keys(M.clips).some((k) => !V.clips[k])) {
            const VS = await fetchJson(A.lookDir, `${A.lookName}_scene_${sx(s)}x`).catch(() => null);
            if (VS) skip = new Set(Object.keys(VS.clips));
          }
        } else {
          await A.play.json(s).catch(() => null);
          const f = A.flags[s] || {};
          if (f.main) { try { M = await fetchJson(A.dir, this.stem(A.name, s)); } catch (e) { M = null; } }
          if (f.look) { try { V = await fetchJson(A.lookDir, this.stem(A.lookName, s)); } catch (e) { V = null; } }
        }
        const D = mergeAtlas(V, M, skip);
        if (!D) throw new Error(`no ${A.name} ${this.kind} ${sx(s)}x atlas`);
        return D;
      })();
      this.js[s].catch(() => {});
    }
    return this.js[s];
  }
  async has(s) { try { await this.json(s); return true; } catch { return false; } }
  /** decoded bytes at a scale (estimated from the rects until decoded), 0 if that scale is missing */
  async bytes(s) {
    try {
      const D = await this.json(s);
      if (!usable(D)) return 0;                       // (GPU-only, and this device has no GPU path: not a scale here)
      if (D.pageInfo.some((p) => gpuPlan(p))) this.gpu = PLAN_GEN + 1;   // (a page this device puts on the GPU: the reserve)
      return D.pageInfo.reduce((t, p) => t + pageCost(p), 0);
    } catch { return 0; }
  }
  get resident() { return !!this.images; }
  get residentBytes() { return this.images ? this.images.reduce((t, im) => t + imgBytes(im), 0) : 0; }
  /** how the resident pages are held: 'rgba' (decoded, canvas 2D), 'gl-rgba8', 'gl-bc7', 'gl-astc4x4' ... (mixed: joined) */
  get residentFormat() {
    if (!this.images) return '';
    return [...new Set(this.images.map((im) => (!im ? '-' : im.gl ? 'gl-' + im.fmt : 'rgba')))].join('+');
  }
  /** the json at scale s, else the nearest one that exists */
  async anyJson(s) {
    for (const k of [s, 1, 2, 0.75]) { try { const D = await this.json(k); if (usable(D)) return D; } catch { /* next */ } }
    throw new Error(`no ${this.atlas.name} ${this.kind} atlas`);
  }
  load(s) {
    if (this.images && this.D && this.D.scale === s) return Promise.resolve(this);
    // (the same load when it resolved to that scale: a lazy draw asking for the want (2x) while the GPU path is off gets
    //  the 1x -- the plan's load(1) a moment later is that one, not a second fetch of the same pages)
    if (this.loading && (this.loading.s === s || this.loading.got === s)) return this.loading.p;
    const p = (async () => {
      const D = await this.anyJson(s);
      if (this.loading && this.loading.p === p) this.loading.got = D.scale;
      if (this.images && this.D === D) { this.loading = null; return this; }
      const imgs = await Promise.all(D.pageInfo.map((pg) => loadAnyPage(pg)));
      if (this.loading?.p !== p) { for (const im of imgs) freeImg(im); return this; }   // superseded (released / rescaled)
      this.release(true);
      this.D = D;
      this.images = imgs;
      this.loading = null;
      this.fails = 0; this.retryAt = 0;
      return this;
    })();
    this.loading = { s, p };
    // (a pack that keeps failing: the draw's lazy retry backs off, 1 s doubling to 30 s -- useArt asks again at once)
    p.catch((e) => {
      if (this.loading?.p === p) this.loading = null;
      this.fails = (this.fails || 0) + 1; this.retryAt = Date.now() + Math.min(30000, 1000 * 2 ** (this.fails - 1));
      console.warn(`sprite3d: ${this.atlas.name} ${this.kind} pages not loaded`, e);
    });
    return p;
  }
  release(keepLoading = false) {
    if (!keepLoading) this.loading = null;
    if (this.images) for (const im of this.images) freeImg(im);
    this.images = null;
  }
}

class Atlas {
  constructor(name, only = '') {
    this.name = name;
    this.tier = tierOf(name);
    this.dir = new URL(`../assets/sprites/${name}/`, import.meta.url);
    // (a look applies to the base atlases, not to one that is itself a look: <hero>_showcase is already painted.
    //  only: a character built in that one look alone -- the finale's forms, <name>_painted -- reads it whatever the
    //  session's look, and never asks for a base atlas that doesn't exist)
    const look = only || (LOOK && !/_(painted|ebsynth|wan|showcase|[a-z0-9]+look)$/.test(name) ? LOOK : '');
    this.noBase = !!only;
    this.lookName = look ? `${name}_${look}` : '';
    this.lookDir = look ? new URL(`../assets/sprites/${this.lookName}/`, import.meta.url) : null;
    this.play = new Pack(this, 'play');
    this.scene = new Pack(this, 'scene');
    // (the extra packs by kind -- 'level' (opts.levelPack), 'move' (opts.extraPacks) -- each built or not, its own scales)
    this.xp = { level: new Pack(this, 'level'), move: new Pack(this, 'move') };
    this.xHas = {};
    this.xScales = {};
    this.hasScene = false;          // known once the scene pack's json is read
    this.scales = null;             // the scales it was packed at (its json's 'scales'; older atlases: 1 and 2)
    this.flags = {};                // scale -> { main, look }: which jsons declare a scene pack
    this.warned = false;
    this.missing = false;           // no atlas built (the code rig draws this character)
  }
  /** the scale its gameplay pack wants (before the budget) */
  get pref() { return this.play.want; }
  get level() { return this.xp.level; }
  get hasLevel() { return !!this.xHas.level; }
  /** the packs it has, in the order a drawing looks for its clip: the move pack first (its clips win while it is decoded) */
  get packs() { return [...(this.xHas.move ? [this.xp.move] : []), this.play, ...(this.hasScene ? [this.scene] : []), ...(this.xHas.level ? [this.xp.level] : [])]; }
  /** every Pack object, built or not (residency sweeps) */
  get all() { return [this.play, this.scene, ...Object.values(this.xp)]; }
  /** the pack a residency name means: 'scene' = the scene pack where there is one, else the whole atlas; an extra kind:
   *  its pack, or null where none is built */
  pack(kind) { return this.xp[kind] ? (this.xHas[kind] ? this.xp[kind] : null) : kind === 'scene' && this.hasScene ? this.scene : this.play; }
  get resident() { return this.packs.some((p) => p.resident); }
}

const parseName = (n) => { const i = n.indexOf(':'); return i < 0 ? [n, 'play'] : [n.slice(0, i), n.slice(i + 1)]; };

/** decode exactly the packs in `names` (atlas names: 'ana' = the gameplay pack, 'ana:scene' = the scene pack; see
 * src/artsets.js) and release every other one, each at the scale src/artplan.js plans (its want, stepped down to fit
 * POLICY.budget).  -> artStats() */
let USE_GEN = 0, USE_WANT = null;   // (the latest useArt call and its packs: an older call finishing late never leaves its packs in)
let USE_NAMES = null;               // (the latest call's names: a resize re-plans them -- setArtScale)
export async function useArt(names) {
  const gen = ++USE_GEN;
  USE_NAMES = names ? [...names] : [];
  const want = new Set(), ovr = new Map(), plain = new Set();
  for (const n0 of names || []) {
    // ('name@tier': a level's tier for this pack in this scene -- src/artsets.js levelArt, L.artTiers -- unless it's also
    //  named plainly: e.g. the summit's dragon form is 'extra' until a player is the dragon)
    const at = n0.indexOf('@'), n = at < 0 ? n0 : n0.slice(0, at);
    const [base, kind] = parseName(n);
    const a = REG.get(base);
    const pk = a && !a.missing ? a.pack(kind) : null;   // (no atlas built: its code rig draws it; no level pack: nothing)
    if (pk) { want.add(pk); if (at >= 0) ovr.set(pk, n0.slice(at + 1)); else plain.add(pk); }
  }
  for (const pk of plain) ovr.delete(pk);
  TIER_OVR = ovr;
  for (const a of REG.values()) for (const p of a.all) if (!want.has(p)) { p.release(); p.skipped = false; }
  USE_WANT = want;
  const set = [...want];
  // (a pack a scene tags -- 'name@tier', src/artsets.js levelArt, L.artTiers: SI2's kraken_head down to 'enemy', the storm
  //  ride's bats up to 'boss' -- steps down at that tier)
  const sc = new Map(set.map((p) => [p, p.want]));
  if (!FORCE) {
    // (every scale's json at once -- they were fetched one after another, a round trip each on a real network)
    const B = new Map(await Promise.all(set.map(async (p) => {
      const [b075, b1, b2] = await Promise.all([p.bytes(0.75), p.bytes(1), p.bytes(2)]);
      return [p, { 0.75: b075, 1: b1, 2: b2 }];
    })));
    // (each pack's want among the scales it has a json for; the plan: src/artplan.js -- tools/memlevels.mjs runs the same)
    const items = set.map((p) => {
      const b = B.get(p), built = [0.75, 1, 2].filter((s) => b[s]);
      const need = scaleIn() * drawK(p.atlas.name, p.kind);
      return { key: p, name: p.atlas.name, tier: p.tier, optional: p.kind === 'move', fam: bossFamily(p.atlas.name), B: b, need, want: built.length ? wantScale(built, need) : sc.get(p) };
    });
    // (the GPU path's own memory -- the transcode worker's heap, the WebGL layer's buffer -- off the top: artplan GPU_RESERVE)
    const gpu = set.some((p) => p.gpu === PLAN_GEN + 1);
    POLICY.gpuReserve = gpu ? GPU_RESERVE : 0;
    const P = planScales(items, POLICY.budget - POLICY.headroom - POLICY.gpuReserve);
    for (const x of items) sc.set(x.key, P.S.get(x));
    // (diagnostics: the last plan, as tools/memlevels.mjs prints it -- DQ_ART.lastPlan)
    LAST_PLAN = { fitTo: POLICY.budget - POLICY.headroom - POLICY.gpuReserve, total: P.total, items: items.map((x) => ({ name: x.key.kind === 'play' ? x.name : x.name + ':' + x.key.kind, tier: x.tier, fam: x.fam && x.fam.key, B: x.B, want: x.want, need: +x.need.toFixed(3), s: P.S.get(x) })) };
  }
  if (gen !== USE_GEN) return artStats();          // (a newer call came while this one sized its set: it decides)
  for (const p of set) p.retryAt = 0;   // (an explicit ask: no back-off)
  // (a pack the plan leaves out -- an optional move pack with no room: scale 0 -- is released and 'skipped': artResident
  //  doesn't wait for it, the lazy load never loads it, hasNow is false, so the hero hooks fall back)
  for (const p of set) { p.skipped = !(sc.get(p) > 0); if (p.skipped) p.release(); }
  // (the packs going down a scale swap first -- each frees its bigger pages as its smaller ones land -- and only then do the
  //  others grow or come in: the decoded peak while a set re-plans stays near the larger of the two sets, not their sum)
  const shrink = set.filter((p) => !p.skipped && p.images && p.D && sc.get(p) < p.D.scale);
  if (shrink.length) {
    await Promise.all(shrink.map((p) => p.load(sc.get(p)).catch(() => null)));
    if (gen !== USE_GEN) { if (USE_WANT) for (const p of set) if (!USE_WANT.has(p)) p.release(); return artStats(); }   // (a newer call came meanwhile: it decides -- this one's leftovers go)
  }
  // (the GPU path: the KTX2 packs first, then the transcode worker is ended -- its heap gone -- and only then do the WebP
  //  pages decode: the heap never sits beside a full set, artplan GPU_RESERVE)
  const todo = set.filter((p) => !p.skipped);
  const gpuFirst = todo.filter((p) => p.gpu === PLAN_GEN + 1);
  if (gpuFirst.length) {
    await Promise.all(gpuFirst.map((p) => p.load(sc.get(p)).catch(() => null)));
    endWorker();
  }
  await Promise.all(todo.map((p) => p.load(sc.get(p)).catch(() => null)));
  if (gen !== USE_GEN && USE_WANT) for (const p of set) if (!USE_WANT.has(p)) p.release();   // (superseded mid-load: its leftovers go)
  return artStats();
}

/** what is decoded now: { total (bytes), atlases: [{ name, pack, scale, bytes }] } */
export function artStats() {
  const atlases = [];
  let total = 0;
  for (const [n, a] of REG) {
    for (const p of a.all) {
      if (!p.resident) continue;
      const b = p.residentBytes;
      total += b;
      atlases.push({ name: p.kind === 'play' ? n : n + ':' + p.kind, pack: p.kind, scale: p.D.scale, bytes: b, mb: +(b / 1048576).toFixed(1), fmt: p.residentFormat });
    }
  }
  return { total, mb: +(total / 1048576).toFixed(1), atlases, policy: POLICY, managed: MANAGED, gl: { mode: GL_MODE, off: GPU_OFF, dead: GPU_DEAD, losses: LOSSES.length, textures: GL_STATS.textures, mb: +(GL_STATS.texBytes / 1048576).toFixed(1), ktx: KTX_STATS } };
}
let LAST_PLAN = null;
// the context is back (src/gl2d.js glOnRestored, rebuilt): unless the path is off for good, the current set is planned
// again on the GPU -- the heroes' 2x KTX2 load (transcoded again; their files come from the HTTP cache) and replace the 1x
// WebP in place, which draws until they're in
glOnRestored(() => {
  if (GPU_DEAD || !GPU_OFF) return;
  GPU_OFF = '';
  PLAN_GEN++;
  console.info('sprite3d: the GPU path is back -- re-planning the scene');
  if (MANAGED && USE_NAMES) setTimeout(() => useArt(USE_NAMES).catch(() => {}), 0);
});
if (typeof window !== 'undefined') window.DQ_ART = { stats: artStats, use: useArt, registry: REG, policy: POLICY, get lastPlan() { return LAST_PLAN; } };
/** the render scale (device px per game px) -- src/main.js resize.  A change that moves any resident pack's want re-plans
 *  the current set (a window maximised onto a 1080p TV: its sprites go 1x -> 2x), once the resizing settles */
let RS_TIMER = 0;
export function setArtScale(s) {
  if (!(s > 0) || Math.abs(s - POLICY.renderScale) < 0.01) return;
  POLICY.renderScale = s;
  if (!MANAGED || !USE_NAMES) return;
  clearTimeout(RS_TIMER);
  RS_TIMER = setTimeout(() => {
    const moved = [...REG.values()].some((a) => a.all.some((p) => p.images && p.D && p.want !== p.D.scale));
    if (moved && USE_NAMES) useArt(USE_NAMES).catch(() => {});
  }, 600);
}
/** THE DRAW-SCALE CENSUS: each pack's largest draw seen, in device px per 1x texel over the render scale -- its draw
 *  scale (src/artsets.js DRAW_K is read off this).  [{ name, pack, k, scale }] */
export function drawScales() {
  const out = [];
  for (const [n, a] of REG) for (const p of a.all) if (p.seenK) { const H = Object.entries(p.seenH || {}).map(([k, v]) => [k / 20, v]).sort((x, y) => x[0] - y[0]), N = H.reduce((s, x) => s + x[1], 0); let c = 0; const q = (f) => { c = 0; for (const [k, v] of H) { c += v; if (c >= f * N) return k; } return H.length ? H[H.length - 1][0] : 0; }; out.push({ name: n, pack: p.kind, k: +p.seenK.toFixed(3), p50: q(0.5), p90: q(0.9), n: N, scale: p.D ? p.D.scale : null, want: p.want }); }
  return out.sort((x, y) => y.k - x.k);
}
if (typeof window !== 'undefined') window.DQ_ART.drawScales = drawScales;

// a lost GPU context took the textures with it: the GPU path is off until it is restored (gpuOff) -- the set re-planned at
// 4 bytes a pixel, read from the WebP pages; the code rig draws those characters for the frames that takes.  The
// LOSS_MAXth loss within LOSS_WINDOW: off for good
glOnLost(() => {
  const now = Date.now();
  LOSSES.push(now);
  while (LOSSES.length && now - LOSSES[0] > LOSS_WINDOW) LOSSES.shift();
  gpuOff(LOSSES.length >= LOSS_MAX ? `the WebGL context was lost ${LOSSES.length} times in ${LOSS_WINDOW / 60000} minutes` : 'the WebGL context was lost', null, LOSSES.length >= LOSS_MAX);
  if (!MANAGED || !USE_NAMES) {   // (unmanaged -- a tool: reload them at their scale)
    for (const a of REG.values()) for (const p of a.all) if (!p.images && p.D) p.load(p.D.scale).catch(() => {});
  }
});

const clampI = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);

/** RIG-FALLBACK CHECK: every draw of a sprite character by its code rig, by atlas, reason and ANIM key:
 *   'loading'  its pack was not decoded yet (the scene's set missed it: src/artsets.js) -- a visible flash;
 *   'lost'     the GPU context was just lost (until the pack reloads);
 *   'no-clip'  the atlas has no drawing for that ANIM key (a clip still to render);
 *   'no-view'  the clip has no drawing for that facing.
 * window.DQ_ART.fallbacks() lists them (tools/soak.mjs prints it); the game warns once per atlas + reason + key. */
const FALLBACKS = new Map();
function noteFallback(name, reason, key, pack) {
  const k = `${name}|${reason}|${key}`;
  const e = FALLBACKS.get(k);
  if (e) { e.n++; return; }
  const D = globalThis.DQ;
  const where = D ? `${D.scene}${D.levelIdx >= 0 && D.scene === 'play' ? ' L' + (D.levelIdx + 1) : ''}` : '';
  FALLBACKS.set(k, { name, reason, key, pack: pack || '', n: 1, first: where });
  if (MANAGED) console.warn(`sprite3d: ${name} drawn by its code rig (${reason}: ${key}${pack ? ', ' + pack + ' pack' : ''}${where ? ', ' + where : ''})`);
}
export function artFallbacks() { return [...FALLBACKS.values()]; }
/** for the modules that merge their own ANIM (variants, forms, rider): a rig-only entry, tagged with its key while
 * the character has an atlas (so the check can name it; without one the rig is its art) */
export function rigOnly(key, f, hasAtlas) {
  if (!hasAtlas || f === undefined) return f;
  const tag = { s3dRig: key };
  return typeof f === 'function' ? (x) => Object.assign({}, f(x), tag) : Object.assign({}, f, tag);
}
/** for the modules that draw their rig themselves: note a rig-only pose (or a named missing clip) being drawn */
export function rigDrawn(name, pose, clip) {
  if (clip) noteFallback(name, 'no-clip', clip);
  else if (pose && pose.s3dRig) noteFallback(name, 'no-clip', pose.s3dRig);
}
if (typeof window !== 'undefined') window.DQ_ART.fallbacks = artFallbacks;
/** true when every pack named (useArt names) is decoded -- or has no atlas (its code rig is its art) */
export function artResident(names) {
  for (const n of names || []) {
    const [base, kind] = parseName(n);
    const a = REG.get(base);
    const pk = a && !a.missing ? a.pack(kind) : null;  // (no such pack -- a level pack never built -- nothing to wait for)
    if (pk && !pk.resident && !pk.skipped) return false;   // (skipped: the plan left it out -- nothing to wait for)
  }
  return true;
}
/** true when the pack named ('dodongo_dragon:level') is decoded and has every one of these clips */
export function packHas(n, clips) {
  const [base, kind] = parseName(n);
  const a = REG.get(base), p = a && !a.missing ? a.pack(kind) : null;
  return !!(p && p.resident && p.D && clips.every((c) => p.D.clips[c + '_R']));
}

/** the code rig's pose for the same moment as a sprite pose (drawn while that pack is not resident) */
function rigPoseFor(RIG, c, key, i) {
  const f = RIG && RIG.ANIM ? RIG.ANIM[key] : undefined;
  if (f === undefined) return null;
  if (typeof f !== 'function') return f;
  if (c.arg === 'k') {
    const dur = c.dur || c.n * 2, g = c.g || [];
    const g0 = g[i] ?? 0, g1 = g[i + 1] ?? dur;
    return f(Math.min(1, (g0 + g1) / 2 / dur));
  }
  if (c.arg === 't') return f(((i + 0.5) / (c.n || 1)) * (c.cycle || 60) / 60);
  return f((i + 0.5) / (c.n || 1));
}

export async function spriteArt(name, opts = {}) {
  const RIG = opts.fallback || null;
  let a = REG.get(name);
  if (!a) { a = new Atlas(name, opts.only || ''); REG.set(name, a); }
  let P0 = null, S0 = null;
  try { P0 = await a.play.anyJson(a.pref); } catch (e) {
    a.missing = true;
    console.warn(`sprite3d: ${name} atlas not loaded${RIG ? ', using the code rig' : ''}`, e);
  }
  const X0 = {};                        // (each extra pack's json as first read: its clips' timing and landmarks)
  if (P0) {
    a.scales = (P0.scales || [1, 2]).map(Number);
    if (!a.scales.includes(P0.scale)) a.scales.push(P0.scale);
    try { S0 = await a.scene.json(P0.scale); a.hasScene = true; } catch { S0 = null; }
  }
  // the extra packs (their own scales: e.g. 0.75 / 1 / 2 where the gameplay pack has 1 / 2)
  const kinds = [...(opts.levelPack ? ['level'] : []), ...(opts.extraPacks || [])].filter((k) => a.xp[k]);
  if (P0) for (const kind of kinds) {
    const pk = a.xp[kind];
    for (const s of [P0.scale, 1, 2, 0.75]) {
      try { a.xScales[kind] = null; X0[kind] = await pk.json(s); break; } catch { pk.js = {}; X0[kind] = null; }
    }
    const J = X0[kind];
    if (J) { a.xHas[kind] = true; a.xScales[kind] = (J.scales || [J.scale]).map(Number); pk.js = { [J.scale]: Promise.resolve(J) }; }
  }
  a.play.D0 = P0; a.scene.D0 = S0; for (const k of kinds) a.xp[k].D0 = X0[k] || null;
  if (P0 && !MANAGED) {
    for (const p of a.packs) { try { await p.load(P0.scale); } catch (e) { console.warn(`sprite3d: ${name} pages not loaded`, e); } }
  }
  // every clip of every pack: the play pack's entry where it and the scene / level pack both have it (identical drawings and
  // timing), the move pack's over the play pack's (its multi-drawing squat / rise / fall / land over the one kept drawing);
  // SRC: the pack each winning entry came from (hasNow)
  const CL0 = {}, SRC = {};
  const take = (D, p) => { if (D) for (const [k, c] of Object.entries(D.clips)) { CL0[k] = c; SRC[k] = p; } };
  take(X0.level, a.xp.level); take(S0, a.scene); take(P0, a.play); take(X0.move, a.xp.move);
  const handed = P0 ? P0.handed !== false : true;
  /** the clip entry to draw and its pack: a resident pack that has it (the move pack first), else the pack that does */
  const view = (clip, facing) => {
    const k = clip + (handed && facing < 0 ? '_L' : '_R');
    let fb = null;
    for (const p of a.packs) {
      const D = p.D || p.D0;
      const c = D && D.clips[k];
      if (!c) continue;
      if (p.images && p.D) return { c: p.D.clips[k], p };
      if (!fb) fb = { c, p };
    }
    return fb;
  };
  const has = (c) => !!(CL0[c + '_R'] && (!handed || CL0[c + '_L']));
  const sp = (clip, fi) => ({ s3d: 1, clip, ['f_' + clip]: fi });
  const ANIM = {};
  const keys = new Set([...(RIG ? Object.keys(RIG.ANIM) : []), ...Object.values(CL0).map((c) => c.clip)]);
  for (const key of keys) {
    if (!has(key)) {
      const f = RIG && RIG.ANIM[key];
      // (s3dRig: the key, for the rig-fallback check -- only where the atlas exists: without one the rig IS the art)
      const tag = P0 ? { s3d: 0, s3dRig: key } : { s3d: 0 };
      if (f !== undefined) ANIM[key] = typeof f === 'function' ? (x) => Object.assign({}, f(x), tag) : Object.assign({}, f, tag);
      continue;
    }
    const c = CL0[key + '_R'];
    if (c.arg === 'k') {
      const g = c.g, dur = c.dur || c.n * 2;
      ANIM[key] = (k) => { const t = (k || 0) * dur + 1e-4; let i = 0; while (i + 1 < g.length && g[i + 1] <= t) i++; return sp(key, i); };
    } else if (c.arg === 't') {
      ANIM[key] = (t) => { const u = (((t || 0) * 60 / c.cycle) % 1 + 1) % 1; return sp(key, clampI(Math.floor(u * c.n), c.n)); };
    } else if (c.arg === 'ph') {
      ANIM[key] = (ph) => { const u = (((ph || 0) % 1) + 1) % 1; return sp(key, clampI(Math.floor(u * c.n), c.n)); };
    } else ANIM[key] = sp(key, 0);
  }
  const X = Object.assign({}, (S0 && S0.exports) || {}, (P0 && P0.exports) || {});
  const pick = (k) => (X[k] !== undefined ? X[k] : RIG ? RIG[k] : undefined);
  const S = (P0 && P0.stride) || {};
  const A = {
    ANIM,
    META: pick('META'),
    SHOOT_ORIGIN: pick('SHOOT_ORIGIN'),
    CARRY_POINT: pick('CARRY_POINT'),
    WALK_STRIDE: has('walk') ? S.walk : undefined,
    RUN_STRIDE: has('run') ? S.run : undefined,
    CARRY_STRIDE: has('carryWalk') ? S.carryWalk : has('walk') ? (opts.carryStride ?? 49) : undefined,
    ATLAS_SCALE: P0 ? P0.scale : 0,
    /** the atlas' exports as built (the config's EXPORTS: copied values and landmark measurements), {} without an atlas */
    EXPORTS: X,
    /** a clip's drawing count and timing: { n, arg, cycle, dur, g } (facing right), or null */
    clipInfo(clip) {
      const c = CL0[clip + '_R'];
      return c ? { n: c.frames.length, arg: c.arg, cycle: c.cycle, dur: c.dur, blink: c.blink, g: c.g } : null;   // (blink: the drawings with closed lids; g: each drawing's start frame)
    },
    /** this atlas' residency handle (useArt / artStats) */
    atlas: a,
    /** is the clip's own pack decoded now -- the one its timing comes from (a move pack's multi-drawing clip, not the
     *  gameplay pack's one kept drawing)?  src/player.js hasClip gates painter 3's hooks on it: a pack not in falls back
     *  exactly as before.  An atlas that doesn't have the clip: false */
    hasNow(clip) { const p = SRC[clip + '_R']; return !!(p && p.images && p.D && p.D.clips[clip + '_R']); },
    /** game-local [x, y] of a landmark ('mouth', 'tip', 'shield', 'carry' ...) for a sprite pose, facing right. */
    point3d(pose, which = 'mouth', facing = 1) {
      if (!pose || !(pose.s3d >= 0.5)) return null;
      const v = view(pose.clip, facing);
      const L = v && v.c.lm && v.c.lm[which];
      return L ? L[clampI(pose['f_' + pose.clip] | 0, L.length)] : null;
    },
    /** Draw with the feet at (0, 0).  o: { facing: 1 | -1, t, scale = 1, talk, ... } (docs/CONTRACTS.md). */
    draw(ctx, pose, o = {}) {
      const clip = pose && pose.s3d >= 0.5 ? pose.clip : null;
      // (opts.rigArt === false: the code rig is not this character's art -- Scarlet's placeholder borrows Ana's -- so
      //  a moment without a drawing draws nothing; the rig still supplies the poses.  Without an atlas it draws.)
      const rigOk = RIG && (opts.rigArt !== false || !P0);
      const facing = o.facing || 1;
      const v = clip ? view(clip, facing) : null;
      if (!v) {
        if (pose && pose.s3dRig) noteFallback(name, 'no-clip', pose.s3dRig);
        else if (clip) noteFallback(name, 'no-view', clip + (facing < 0 ? '_L' : '_R'));
        if (rigOk) RIG.draw(ctx, pose, o);
        return;
      }
      const { c, p } = v;
      let i = clampI(pose['f_' + clip] | 0, c.frames.length);
      if (!p.images) {                                         // not resident: the code rig for this moment
        // (a pack the plan left out -- an optional move pack with no room: a stale pose's leftover, e.g. a dodge's afterimage
        //  still holding a dodgeBack pose, draws nothing: no rig, no load; the hero's own poses ask hasNow every frame)
        if (p.skipped) return;
        noteFallback(name, 'loading', clip, p.kind);
        if (LAZY && !p.skipped && !p.loading && !(p.retryAt > Date.now())) p.load(p.want).catch(() => {});
        const rp = rigOk ? rigPoseFor(RIG, c, clip, i) : null;
        if (rp) RIG.draw(ctx, Object.assign({}, rp, { s3d: 0 }), o);
        return;
      }
      if (c.time_fps) i = Math.floor((o.t || 0) * c.time_fps) % c.frames.length;
      const fr = (o.talk && c.talk && Math.floor((o.t || 0) * 8) % 2 === 0) ? c.talk[i] : c.frames[i];
      const img = p.images[fr[0]];
      if (!img) return;
      const k = (o.scale || 1) / p.D.scale;
      { const m = ctx.getTransform(), dk = Math.hypot(m.a, m.b) * (o.scale || 1) / (POLICY.renderScale || 1); if (dk > (p.seenK || 0)) p.seenK = dk; const H = p.seenH || (p.seenH = {}), bin = Math.round(dk * 20); H[bin] = (H[bin] || 0) + 1; }   // (the census: drawScales -- the largest, and how often each size)
      let rimSaved = null;
      if (RIM) {                                               // (the rim: shadowBlur is in device px, not the transform's)
        const m = ctx.getTransform();
        rimSaved = [ctx.shadowColor, ctx.shadowBlur, ctx.shadowOffsetX, ctx.shadowOffsetY];
        ctx.shadowColor = RIM.color; ctx.shadowBlur = RIM.blur * Math.hypot(m.a, m.b); ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      }
      try { drawPage(ctx, img, fr, k, c, i, o, facing, clip, p, rigOk); } finally {
        if (rimSaved) [ctx.shadowColor, ctx.shadowBlur, ctx.shadowOffsetX, ctx.shadowOffsetY] = rimSaved;
      }
    },
  };
  function drawPage(ctx, img, fr, k, c, i, o, facing, clip, p, rigOk) {
      if (img.gl) {                                            // a GPU page: the WebGL2 sprite layer (src/gl2d.js)
        const flip = !handed && facing < 0, [gx, gy] = snapDraw(ctx, fr[5] * k, fr[6] * k, k, flip);
        if (glSprite(ctx, img, fr[1], fr[2], fr[3], fr[4], gx, gy, fr[3] * k, fr[4] * k, flip)) return;
        noteFallback(name, 'lost', clip, p.kind);
        const rp = rigOk ? rigPoseFor(RIG, c, clip, i) : null;   // the GPU context was just lost: the rig until it reloads
        if (rp) RIG.draw(ctx, Object.assign({}, rp, { s3d: 0 }), o);
        return;
      }
      const q = ctx.imageSmoothingQuality;
      ctx.imageSmoothingQuality = 'high';
      if (!handed && facing < 0) {
        ctx.save(); ctx.scale(-1, 1);
        const [x, y] = snapDraw(ctx, fr[5] * k, fr[6] * k, k, false);    // (the flip is in the transform here)
        ctx.drawImage(img, fr[1], fr[2], fr[3], fr[4], x, y, fr[3] * k, fr[4] * k);
        ctx.restore();
      } else {
        const [x, y] = snapDraw(ctx, fr[5] * k, fr[6] * k, k, false);
        ctx.drawImage(img, fr[1], fr[2], fr[3], fr[4], x, y, fr[3] * k, fr[4] * k);
      }
      ctx.imageSmoothingQuality = q;
  }
  return A;
}
