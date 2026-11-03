// KTX2 transcode worker (src/ktx2.js; docs/SPRITE3D.md "GPU sprite layer").  A classic worker: it fetches a KTX2 atlas
// page, transcodes it with the Basis Universal transcoder (vendor/basis/, shipped with the game) to the GPU block format
// the main thread asks for, and posts the blocks back (transferred, no copy).  The fetch, the Zstandard decompression and
// the transcode all run here, off the main thread: a scene's pages transcode behind its loading screen, and a page that
// loads during play costs the main thread only its upload (src/ktx2.js spaces those, one a frame).
//   in:  { id, url, target: 'astc4x4' | 'bc7' | 'etc2' | ..., base: the transcoder's folder URL }
//   out: { id, ok: true, w, h, data: ArrayBuffer, size, fetchMs, txMs, heap } | { id, ok: false, err }
/* global importScripts, BASIS */
const TF = {            // our target name -> the transcoder's transcoder_texture_format names (newest first) = src/ktx2.js
  astc4x4: ['cTFASTC_4x4_RGBA', 'cTFASTC_4x4'],
  astc6x6: ['cTFASTC_LDR_6x6_RGBA', 'cTFASTC_6x6_RGBA', 'cTFASTC_6x6'],
  bc7: ['cTFBC7_RGBA', 'cTFBC7_M5_RGBA', 'cTFBC7'],
  etc2: ['cTFETC2_RGBA', 'cTFETC2'],
  bc3: ['cTFBC3_RGBA', 'cTFBC3'],
};
let M = null;
async function mod(base) {
  if (!M) {
    M = (async () => {
      importScripts(base + 'basis_transcoder.js');
      const m = await BASIS({ locateFile: (f) => base + f });
      m.initializeBasis();
      return m;
    })();
  }
  return M;
}
function tfValue(m, target) {
  const E = m.transcoder_texture_format;
  for (const n of TF[target] || []) if (E && E[n] !== undefined) return E[n].value !== undefined ? E[n].value : E[n];
  throw new Error('the transcoder has no ' + target);
}
self.onmessage = async (e) => {
  const { id, url, target, base } = e.data;
  try {
    const m = await mod(base);
    const t0 = performance.now();
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const t1 = performance.now();
    const k = new m.KTX2File(bytes);
    try {
      if (!k.isValid()) throw new Error('bad ktx2 ' + url);
      const w = k.getWidth(), h = k.getHeight();
      if (!k.startTranscoding()) throw new Error('ktx2 startTranscoding failed ' + url);
      const fmt = tfValue(m, target);
      const out = new Uint8Array(k.getImageTranscodedSizeInBytes(0, 0, 0, fmt));
      if (!k.transcodeImage(out, 0, 0, 0, fmt, 0, -1, -1)) throw new Error('ktx2 transcode failed ' + url);
      self.postMessage({ id, ok: true, w, h, data: out.buffer, size: bytes.length, fetchMs: t1 - t0, txMs: performance.now() - t1,
        heap: m.HEAP8 ? m.HEAP8.length : 0 }, [out.buffer]);
    } finally { k.close(); k.delete(); }
  } catch (err) {
    self.postMessage({ id, ok: false, err: String((err && err.message) || err) });
  }
};
