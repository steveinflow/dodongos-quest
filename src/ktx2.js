// KTX2 (Basis Universal) atlas pages -> compressed GPU textures (src/gl2d.js; docs/SPRITE3D.md "GPU sprite layer").
//
// An atlas json shipped by tools/make_dist.py (s3d/pagefmt.py 'ktx2', s3d/ktx2.mjs) declares its KTX2 pages:
//   "ktx2": { "v": 1, "premul": true, "prefer": ["uastc"],
//             "variants": { "uastc": { "files": [...], "dims": [[w, h], ...], "targets": ["astc4x4", "bc7", "etc2"] } } }
// decl(D, i) keeps page i's part of that with the page (so a look atlas merged with its main atlas keeps each page's
// own files); planPage() picks, in the atlas' order of preference, the first variant with a target this device's
// WebGL2 has; loadPage() has it fetched and transcoded to that target by the transcode WORKER (src/ktx2worker.js, the
// Basis transcoder in vendor/basis/: shipped with the game, no CDN) -- off the main thread -- and uploads the blocks,
// one page a frame (no frame spike when a page arrives during play).  No Worker (or one that won't start): the same
// transcode on the main thread.  No WebGL2, no supported target, no transcoder or a failed page -> src/sprite3d.js
// reads the WebP page instead (and, after a failure, every page from then on: gpuOff).
import { glFormat, glTexCompressed, glWarm, blockBytes } from './gl2d.js';
/** fetch with a time limit (a stalled page fails after `ms`, as an aborted one does; reported to the error ring) */
async function fetchT(url, ms = 20000) {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ac?.abort(), ms);
  try { return await fetch(url, ac ? { signal: ac.signal } : {}); }
  catch (e) { if (ac?.signal.aborted) { const t = new Error(`timed out: ${url}`); try { globalThis.DQ?.reportError?.(t, 'fetch'); } catch { /* */ } throw t; } throw e; }
  finally { clearTimeout(timer); }
}

const TF = {            // our target name -> the transcoder's transcoder_texture_format names (newest first) = src/ktx2worker.js
  astc4x4: ['cTFASTC_4x4_RGBA', 'cTFASTC_4x4'],
  astc6x6: ['cTFASTC_LDR_6x6_RGBA', 'cTFASTC_6x6_RGBA', 'cTFASTC_6x6'],
  bc7: ['cTFBC7_RGBA', 'cTFBC7_M5_RGBA', 'cTFBC7'],
  etc2: ['cTFETC2_RGBA', 'cTFETC2'],
  bc3: ['cTFBC3_RGBA', 'cTFBC3'],
};
const BASE = new URL('../vendor/basis/', import.meta.url);
// (tests: ?ktx=bc7 | astc4x4 | etc2 -- only that target, where the device has it; else the atlas' order of preference)
const ONLY = (() => { try { return new URLSearchParams(location.search).get('ktx') || ''; } catch { return ''; } })();

/** the GPU path's numbers (window.DQ_KTX.stats): pages, bytes fetched, transcode and upload times, the worker's heap */
export const KTX_STATS = { pages: 0, fetched: 0, txMs: 0, maxTxMs: 0, upMs: 0, maxUpMs: 0, warmMs: 0, maxWarmMs: 0, heap: 0, worker: null, fails: 0 };

/** page i's KTX2 declaration from atlas json D (null when the atlas has none for it) */
export function decl(D, i) {
  const K = D && D.ktx2;
  if (!K || K.v !== 1 || !K.variants) return null;
  const variants = {};
  for (const [name, v] of Object.entries(K.variants)) {
    if (!v || !v.files || v.files.length !== D.pages.length || !v.dims) continue;
    variants[name] = { url: new URL(v.files[i], D.dir).href, w: v.dims[i][0], h: v.dims[i][1], targets: v.targets || [] };
  }
  return Object.keys(variants).length ? { prefer: K.prefer || Object.keys(variants), premul: K.premul !== false, variants } : null;
}

/** the variant + target this device would use for a page declaration (null: the WebP page) */
export function planPage(k) {
  if (!k) return null;
  for (const name of k.prefer) {
    const v = k.variants[name];
    if (!v) continue;
    for (const t of v.targets) {
      if (ONLY && t !== ONLY) continue;
      const f = glFormat(t);
      if (f) return { variant: name, target: t, f, url: v.url, w: v.w, h: v.h, premul: k.premul };
    }
  }
  return null;
}

/** GPU bytes of a planned page */
export const planBytes = (P) => blockBytes(P.w, P.h, P.f.bw, P.f.bh);

// ------------------------------------------------------------------------------------------------ the worker
let W = null, WFAIL = false, SEQ = 0, IDLE = 0;
const JOBS = new Map();
/** the transcode worker (null: none -- the main-thread transcoder instead) */
function worker() {
  if (W || WFAIL) return W;
  try {
    W = new Worker(new URL('./ktx2worker.js', import.meta.url));
    W.onmessage = (e) => { const j = JOBS.get(e.data.id); if (j) { JOBS.delete(e.data.id); j.res(e.data); } idleSoon(); };
    W.onerror = (e) => {
      console.warn('ktx2: the transcode worker failed -- transcoding on the main thread', e?.message || e);
      e?.preventDefault?.();
      for (const j of JOBS.values()) j.res({ ok: false, err: 'worker failed' });
      JOBS.clear(); W = null; WFAIL = true;
    };
    KTX_STATS.worker = true;
  } catch (e) { W = null; WFAIL = true; KTX_STATS.worker = false; }
  return W;
}
/** the worker goes 4 s after its last page (its WebAssembly heap -- up to ~40 MB after an 8 Mpx page -- goes with it);
 *  the next page starts it again */
/** end the worker now (its heap goes with it): src/sprite3d.js useArt, once a scene's KTX2 packs are in -- before its
 *  WebP pages decode.  A later page starts it again */
export function endWorker() {
  clearTimeout(IDLE);
  if (W && !JOBS.size) { W.terminate(); W = null; }
}
function idleSoon() {
  clearTimeout(IDLE);
  if (JOBS.size) return;
  IDLE = setTimeout(() => { if (W && !JOBS.size) { W.terminate(); W = null; } }, 4000);
}
function viaWorker(P) {
  const w = worker();
  if (!w) return null;
  clearTimeout(IDLE);
  const id = ++SEQ;
  return new Promise((res) => {
    const timer = setTimeout(() => { if (JOBS.delete(id)) { res({ ok: false, err: 'timed out: ' + P.url }); idleSoon(); } }, 30000);
    JOBS.set(id, { res: (d) => { clearTimeout(timer); res(d); } });
    w.postMessage({ id, url: P.url, target: P.target, base: BASE.href });
  });
}

// ------------------------------------------------------------------------------------------------ main-thread fallback
let BASIS = null;
function transcoder() {
  if (!BASIS) {
    BASIS = (async () => {
      if (typeof globalThis.BASIS !== 'function') {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = new URL('basis_transcoder.js', BASE).href;
          s.onload = res; s.onerror = () => rej(new Error('basis_transcoder.js not loaded'));
          document.head.appendChild(s);
        });
      }
      const M = await globalThis.BASIS({ locateFile: (f) => new URL(f, BASE).href });
      M.initializeBasis();
      return M;
    })();
    BASIS.catch((e) => console.warn('ktx2: no transcoder, atlases use their WebP pages', e));
  }
  return BASIS;
}
function tfValue(M, target) {
  const E = M.transcoder_texture_format;
  for (const n of TF[target] || []) if (E && E[n] !== undefined) return E[n].value !== undefined ? E[n].value : E[n];
  throw new Error('the transcoder has no ' + target);
}
async function onMain(P) {
  const M = await transcoder();
  const t0 = performance.now();
  const r = await fetchT(P.url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const t1 = performance.now();
  const k = new M.KTX2File(bytes);
  try {
    if (!k.isValid()) throw new Error('bad ktx2 ' + P.url);
    const w = k.getWidth(), h = k.getHeight();
    if (!k.startTranscoding()) throw new Error('ktx2 startTranscoding failed');
    const fmt = tfValue(M, P.target);
    const out = new Uint8Array(k.getImageTranscodedSizeInBytes(0, 0, 0, fmt));
    if (!k.transcodeImage(out, 0, 0, 0, fmt, 0, -1, -1)) throw new Error('ktx2 transcode failed');
    return { ok: true, w, h, data: out.buffer, size: bytes.length, fetchMs: t1 - t0, txMs: performance.now() - t1, heap: M.HEAP8 ? M.HEAP8.length : 0 };
  } finally { k.close(); k.delete(); }
}

// ------------------------------------------------------------------------------------------------ uploads
// one upload a frame: a page that arrives during play never adds its upload to a frame that already had one
let UP = Promise.resolve();
const nextFrame = () => new Promise((res) => {
  let done = false;
  const go = () => { if (!done) { done = true; res(); } };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
  setTimeout(go, 50);              // (a hidden tab has no frames: uploads still go, slowly)
});
function scheduled(fn) {
  const p = UP.then(async () => { await nextFrame(); return fn(); });
  UP = p.catch(() => {});
  return p;
}

/** fetch + transcode (the worker) + upload (spaced) a planned page -> a gl2d texture record; throws on any failure */
export async function loadPage(P) {
  let d = await viaWorker(P);
  if (!d) d = await onMain(P);
  if (!d.ok) throw new Error(d.err || 'ktx2 failed');
  KTX_STATS.pages++; KTX_STATS.fetched += d.size || 0;
  KTX_STATS.txMs += d.txMs || 0; KTX_STATS.maxTxMs = Math.max(KTX_STATS.maxTxMs, d.txMs || 0);
  KTX_STATS.heap = Math.max(KTX_STATS.heap, d.heap || 0);
  return scheduled(() => {
    const t0 = performance.now();
    const t = glTexCompressed(P.target, d.w, d.h, new Uint8Array(d.data), P.premul);
    const ms = performance.now() - t0;
    KTX_STATS.upMs += ms; KTX_STATS.maxUpMs = Math.max(KTX_STATS.maxUpMs, ms);
    if (!t) throw new Error('ktx2 upload failed (' + P.target + ')');
    t.ktx2 = P.variant;
    // (its first draw now, in this loading frame: a software GL decompresses the page on first use -- gl2d glWarm)
    const w = glWarm(t);
    KTX_STATS.warmMs += w; KTX_STATS.maxWarmMs = Math.max(KTX_STATS.maxWarmMs, w);
    return t;
  });
}

if (typeof window !== 'undefined') window.DQ_KTX = { stats: KTX_STATS };
