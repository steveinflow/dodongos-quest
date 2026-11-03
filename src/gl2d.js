// WebGL2 sprite layer (docs/SPRITE3D.md "GPU sprite layer").  The atlas sprites' pixels can live in GPU textures --
// KTX2-compressed where the atlas was encoded (ASTC / BC7 / ETC2: 1 byte per pixel or less instead of the 4 of a
// decoded page; src/ktx2.js) -- and every sprite drawn from them is rasterised by one shared WebGL2 context.
//
// DRAW ORDER: the game keeps drawing its frame into its canvas-2D context, in depth order, exactly as before.  A sprite
// drawn with glSprite() is queued in a batch for that 2D context; the batch is rendered by WebGL and composited into the
// 2D context (one drawImage of the batch's box) right before the next 2D drawing operation on that context (fill,
// stroke, drawImage, text, clip, restore, getImageData ...) or at the end of the task.  So the stage, the props, the code
// rigs and every 2D effect drawn over the sprites ('lighter' sparks, the 'screen' warm light, the white hit flash's
// source-atop tint, the letterbox, the HUD) keep their order and blend exactly as with 2D-drawn sprites, and sprites
// with nothing 2D between them (two heroes, a boss and its rider ...) share one composite.  A sprite drawn with a
// shadow, a filter or another composite mode is composited on its own with that state.
//
// Modes (?gl=): auto (default) = only atlases encoded to KTX2 with a GPU format this device has use the GPU path;
// 1 = every atlas (uncompressed RGBA textures for the PNG/WebP pages: tests); 0 = never (canvas 2D, as before).
// Without WebGL2 (or after a lost context) everything is canvas 2D.
const Q = (() => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(''); } })();
export let GL_MODE = Q.get('gl') === '0' ? 'off' : Q.get('gl') === '1' ? 'on' : 'auto';
/** tests (tools/glcheck.mjs): switch the mode for the pages loaded from now on ('off' | 'auto' | 'on') */
export function glSetMode(m) { flush(); GL_MODE = m; }

let G = null;                 // the context (null: not tried yet, false: unavailable / lost)
let pending = null;           // the open batch: { ctx, mode, solo, n, x0, y0, x1, y1 }
let flushQueued = false;
const ORIG = {};              // the unpatched canvas-2D methods
const lostCbs = new Set(), restoredCbs = new Set();
export const GL_STATS = { batches: 0, quads: 0, tasks: 0, textures: 0, texBytes: 0 };

const FLOATS = 9;             // per vertex: x y u v (clamp rect) u0 v0 u1 v1, alpha

const VS = `#version 300 es
in vec2 a_pos; in vec2 a_uv; in vec4 a_rect; in float a_alpha;
uniform vec2 u_size; uniform vec2 u_off;
out vec2 v_uv; out vec4 v_rect; out float v_a;
void main() {
  vec2 p = (a_pos - u_off) / u_size;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  v_uv = a_uv; v_rect = a_rect; v_a = a_alpha;
}`;
// premultiplied texels (u_premul = 1: straight-alpha texels, multiplied here); when a sprite is drawn smaller than its
// drawing (> 1.3 texels per pixel) 4 taps across the pixel's footprint stand in for the mipmaps the 2D canvas would use
const FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex; uniform float u_premul;
in vec2 v_uv; in vec4 v_rect; in float v_a;
out vec4 o;
vec4 tap(vec2 uv) { return textureLod(u_tex, clamp(uv, v_rect.xy, v_rect.zw), 0.0); }
void main() {
  vec2 ts = vec2(textureSize(u_tex, 0));
  vec2 dx = dFdx(v_uv), dy = dFdy(v_uv);
  float fp = max(length(dx * ts), length(dy * ts));
  vec4 c;
  if (fp > 1.3) {
    vec2 a = (dx + dy) * 0.25, b = (dx - dy) * 0.25;
    c = 0.25 * (tap(v_uv + a) + tap(v_uv - a) + tap(v_uv + b) + tap(v_uv - b));
  } else c = tap(v_uv);
  if (u_premul > 0.5) c.rgb *= c.a;
  o = c * v_a;
}`;

function compile(gl) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('gl2d shader', gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS);
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v); gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, 'a_pos'); gl.bindAttribLocation(p, 1, 'a_uv'); gl.bindAttribLocation(p, 2, 'a_rect'); gl.bindAttribLocation(p, 3, 'a_alpha');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('gl2d link', gl.getProgramInfoLog(p)); return null; }
  return p;
}

/** the shared context, created on first use (false when there is no WebGL2) */
function init() {
  if (G !== null) return G;
  if (GL_MODE === 'off' || typeof document === 'undefined') return false;
  G = false;
  const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
  let canvas = null, gl = null, off = false;
  try {
    // an OffscreenCanvas hands its drawing buffer over without a copy (transferToImageBitmap); else a <canvas>
    if (Q.get('glsrc') !== 'canvas' && typeof OffscreenCanvas === 'function' && OffscreenCanvas.prototype.transferToImageBitmap) {
      canvas = new OffscreenCanvas(64, 64);
      gl = canvas.getContext('webgl2', opts);
      off = !!gl;
    }
    if (!gl) { canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; gl = canvas.getContext('webgl2', opts); }
  } catch (e) { gl = null; }
  if (!gl) { console.info('gl2d: no WebGL2, sprites stay canvas 2D'); return G; }
  const g = { gl, canvas, off, w: 64, h: 64, lost: false, verts: new Float32Array(FLOATS * 4 * 256), cap: 0, quads: [], losses: 0,
    renderer: (() => { try { const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { return '?'; } })(),
    loseExt: (() => { try { return gl.getExtension('WEBGL_lose_context'); } catch { return null; } })() };   // (tests: DQ_GL.loseContext / restoreContext)
  if (!setup(g)) return G;
  G = g;
  growIndex(256);
  // (lost: the state stays, flagged -- preventDefault asks the browser for a restore; restored: rebuilt, callbacks run.
  //  iOS Safari drops a WebGL context when the tab goes to the background or under memory pressure, and gives it back)
  for (const ev of ['webglcontextlost', 'contextlost']) {
    try { canvas.addEventListener(ev, (e) => { e.preventDefault?.(); if (G && G.gl === gl) lose('context lost'); }); } catch (e) { /* no events on this canvas */ }
  }
  for (const ev of ['webglcontextrestored', 'contextrestored']) {
    try { canvas.addEventListener(ev, () => { if (G && G.gl === gl) restore(); }); } catch (e) { /* no events on this canvas */ }
  }
  patch2D();
  return G;
}

/** (re)build the program, its buffers and the compressed formats on g.gl -- at creation, and after a restore (a restored
 *  context starts empty).  false: the program won't build */
function setup(g) {
  const { gl } = g;
  const prog = compile(gl);
  if (!prog) return false;
  const ext = (n) => { try { return gl.getExtension(n); } catch { return null; } };
  g.caps = {
    astc: ext('WEBGL_compressed_texture_astc'),
    bptc: ext('EXT_texture_compression_bptc'),
    etc: ext('WEBGL_compressed_texture_etc'),
    s3tc: ext('WEBGL_compressed_texture_s3tc'),
  };
  const vbo = gl.createBuffer(), ibo = gl.createBuffer(), vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const st = FLOATS * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, st, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 16);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 32);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  Object.assign(g, {
    prog, vao, vbo, ibo, cap: 0,
    max: Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0], gl.getParameter(gl.MAX_VIEWPORT_DIMS)[1], 4096),
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    u: { size: gl.getUniformLocation(prog, 'u_size'), off: gl.getUniformLocation(prog, 'u_off'), tex: gl.getUniformLocation(prog, 'u_tex'), premul: gl.getUniformLocation(prog, 'u_premul') },
  });
  return true;
}

function growIndex(nq) {
  const { gl } = G;
  const idx = new Uint16Array(nq * 6);
  for (let i = 0; i < nq; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  gl.bindVertexArray(G.vao);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, G.ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  G.cap = nq;
}

function lose(why) {
  if (!G || G.lost) return;
  G.losses++;
  console.warn('gl2d: ' + why + ' -- sprites go back to canvas 2D until it is restored');
  G.lost = true;
  pending = null;
  G.quads.length = 0;
  for (const cb of lostCbs) { try { cb(); } catch (e) { console.error(e); } }
}
/** the context is back (webglcontextrestored): its state rebuilt (a restored context is empty), then the callbacks --
 *  src/sprite3d.js re-plans the scene on the GPU */
function restore() {
  if (!G || !G.lost) return;
  const g = G;
  if (g.gl.isContextLost() || !setup(g)) { console.warn('gl2d: the restored context did not build -- canvas 2D for good'); G = false; return; }
  g.lost = false; g.w = g.h = 0;
  growIndex(256);
  console.info('gl2d: the WebGL context is back');
  for (const cb of restoredCbs) { try { cb(); } catch (e) { console.error(e); } }
}

/** call cb when the GPU context is lost (its textures are gone: reload those pages for canvas 2D) */
export function glOnLost(cb) { lostCbs.add(cb); }
/** call cb when a lost GPU context is restored (empty: the pages must be uploaded again) */
export function glOnRestored(cb) { restoredCbs.add(cb); }
/** true when the GPU path can be used (creates the context on first call; false while it is lost) */
export function glReady() { const g = init(); return !!g && !g.lost; }
/** the compressed formats this device's WebGL2 has (null without WebGL2, or while the context is lost) */
export function glCaps() {
  const g = init();
  return g && !g.lost ? { astc: !!g.caps.astc, bptc: !!g.caps.bptc, etc: !!g.caps.etc, s3tc: !!g.caps.s3tc, maxTex: g.maxTex, renderer: g.renderer, offscreen: g.off, losses: g.losses } : null;
}

// ------------------------------------------------------------------------------------------------ textures
function newTex(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}
const record = (tex, w, h, bytes, fmt, premul) => {
  GL_STATS.textures++; GL_STATS.texBytes += bytes;
  return { gl: true, tex, width: w, height: h, bytes, fmt, premul };
};

/** an uncompressed RGBA texture from a decoded page (ImageBitmap / <img> / canvas); null without WebGL2 */
export function glTexFromImage(img) {
  const g = init();
  if (!g || g.lost || !img || img.width > g.maxTex || img.height > g.maxTex) return null;
  const { gl } = g;
  const t = newTex(gl);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, img.width, img.height);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (gl.getError() !== gl.NO_ERROR) { gl.deleteTexture(t); return null; }
  return record(t, img.width, img.height, img.width * img.height * 4, 'rgba8', 0);
}

/** the WebGL internal format for a compressed format name (null if this device lacks it) */
export function glFormat(name) {
  const g = init();
  if (!g || g.lost) return null;
  const c = g.caps;
  switch (name) {
    case 'astc4x4': return c.astc ? { gl: c.astc.COMPRESSED_RGBA_ASTC_4x4_KHR, bw: 4, bh: 4 } : null;
    case 'astc5x5': return c.astc ? { gl: c.astc.COMPRESSED_RGBA_ASTC_5x5_KHR, bw: 5, bh: 5 } : null;
    case 'astc6x6': return c.astc ? { gl: c.astc.COMPRESSED_RGBA_ASTC_6x6_KHR, bw: 6, bh: 6 } : null;
    case 'astc8x8': return c.astc ? { gl: c.astc.COMPRESSED_RGBA_ASTC_8x8_KHR, bw: 8, bh: 8 } : null;
    case 'bc7': return c.bptc ? { gl: c.bptc.COMPRESSED_RGBA_BPTC_UNORM_EXT, bw: 4, bh: 4 } : null;
    case 'etc2': return c.etc ? { gl: c.etc.COMPRESSED_RGBA8_ETC2_EAC, bw: 4, bh: 4 } : null;
    case 'bc3': return c.s3tc ? { gl: c.s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT, bw: 4, bh: 4 } : null;
    default: return null;
  }
}
/** bytes of a w x h image in a 16-byte-block format */
export const blockBytes = (w, h, bw, bh) => Math.ceil(w / bw) * Math.ceil(h / bh) * 16;

/** a compressed texture (data: the level-0 blocks); premul: the texels are premultiplied (else the shader does it) */
export function glTexCompressed(name, w, h, data, premul = true) {
  const g = init();
  const f = glFormat(name);
  if (!g || g.lost || !f || w > g.maxTex || h > g.maxTex) return null;
  const { gl } = g;
  const t = newTex(gl);
  // (the size in whole blocks: WebGL's BC7 / S3TC refuse a level 0 that isn't a multiple of 4 -- an atlas page is cropped to its
  //  lowest drawing, 4093 px tall -- and the transcoder writes whole blocks anyway; the texture is that padded size, so
  //  the sprites' UVs (pixel rect / texture size) stay exact)
  const W = Math.ceil(w / f.bw) * f.bw, H = Math.ceil(h / f.bh) * f.bh;
  gl.compressedTexImage2D(gl.TEXTURE_2D, 0, f.gl, W, H, 0, data);
  if (gl.getError() !== gl.NO_ERROR) { gl.deleteTexture(t); return null; }
  return record(t, W, H, blockBytes(w, h, f.bw, f.bh), name, premul ? 0 : 1);
}

/** draw texture r once -- one pixel at the GL canvas' corner, read back -- so the GL's first-use work on it (a software
 *  GL decompresses a compressed page then; a driver may move it into video memory) happens now, in a loading frame, and
 *  not on the first frame it is drawn in play (src/ktx2.js, after each upload).  Not while a batch is open (it would be
 *  drawn over); the next composite clears that pixel.  -> ms spent */
export function glWarm(r) {
  const g = G;
  if (!g || g.lost || !r || !r.tex || pending) return 0;
  const { gl } = g;
  const t0 = performance.now();
  const V = new Float32Array(FLOATS * 4);
  const P = [0, 0, 1, 0, 0, 1, 1, 1], UV = [0, 0, 1, 0, 0, 1, 1, 1];
  for (let k = 0; k < 4; k++) {
    const o = k * FLOATS;
    V[o] = P[k * 2]; V[o + 1] = P[k * 2 + 1]; V[o + 2] = UV[k * 2]; V[o + 3] = UV[k * 2 + 1];
    V[o + 4] = 0; V[o + 5] = 0; V[o + 6] = 1; V[o + 7] = 1; V[o + 8] = 1;
  }
  gl.useProgram(g.prog);
  gl.bindVertexArray(g.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, V, gl.STREAM_DRAW);
  gl.viewport(0, 0, g.w, g.h);
  gl.uniform2f(g.u.size, g.w, g.h); gl.uniform2f(g.u.off, 0, 0);
  gl.uniform1i(g.u.tex, 0); gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, r.tex);
  gl.uniform1f(g.u.premul, r.premul);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(0, g.h - 1, 1, 1);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  const px = new Uint8Array(4);
  gl.readPixels(0, g.h - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.disable(gl.SCISSOR_TEST);
  return performance.now() - t0;
}

export function glFree(r) {
  if (!r || !r.tex) return;
  GL_STATS.textures--; GL_STATS.texBytes -= r.bytes;
  if (G && G.gl && !G.lost) G.gl.deleteTexture(r.tex);
  r.tex = null;
}

// ------------------------------------------------------------------------------------------------ sprites
const SPECIAL_OPS = new Set(['source-over', 'lighter']);
function hasShadow(ctx) {
  if (!(ctx.shadowBlur > 0 || ctx.shadowOffsetX || ctx.shadowOffsetY)) return false;
  const c = ctx.shadowColor;
  return !(c === 'rgba(0, 0, 0, 0)' || c === 'transparent' || /,\s*0\)$/.test(c));
}

/** queue a sprite for ctx: the source rect (sx, sy, sw, sh) of texture r at (dx, dy, dw, dh) under ctx's transform,
 * globalAlpha and composite mode (flipX: mirrored about x = 0 first, like ctx.scale(-1, 1)).  false: no GPU context. */
export function glSprite(ctx, r, sx, sy, sw, sh, dx, dy, dw, dh, flipX = false) {
  if (!G || G.lost || !r.tex) return false;
  if (G.gl.isContextLost()) { lose('context lost'); return false; }
  const alpha = ctx.globalAlpha;
  if (!(alpha > 0)) return true;
  const op = ctx.globalCompositeOperation;
  const solo = !SPECIAL_OPS.has(op) || hasShadow(ctx) || (typeof ctx.filter === 'string' && ctx.filter !== 'none');
  if (pending && (pending.ctx !== ctx || pending.mode !== op || solo)) flush();
  const m = ctx.getTransform();
  let a = m.a, b = m.b;
  const c = m.c, d = m.d, e = m.e, f = m.f;
  if (flipX) { a = -a; b = -b; }
  const x0 = dx, y0 = dy, x1 = dx + dw, y1 = dy + dh;
  const P = [a * x0 + c * y0 + e, b * x0 + d * y0 + f, a * x1 + c * y0 + e, b * x1 + d * y0 + f,
    a * x0 + c * y1 + e, b * x0 + d * y1 + f, a * x1 + c * y1 + e, b * x1 + d * y1 + f];
  if (!pending) {
    pending = { ctx, mode: op, solo, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    G.quads.length = 0;
    if (!flushQueued) { flushQueued = true; queueMicrotask(endTask); }
  }
  const B = pending;
  for (let i = 0; i < 8; i += 2) {
    if (P[i] < B.x0) B.x0 = P[i]; if (P[i] > B.x1) B.x1 = P[i];
    if (P[i + 1] < B.y0) B.y0 = P[i + 1]; if (P[i + 1] > B.y1) B.y1 = P[i + 1];
  }
  const W = r.width, H = r.height;
  G.quads.push({ r, P, u0: sx / W, v0: sy / H, u1: (sx + sw) / W, v1: (sy + sh) / H,
    rect: [(sx + 0.5) / W, (sy + 0.5) / H, (sx + sw - 0.5) / W, (sy + sh - 0.5) / H], alpha: solo ? 1 : alpha, smooth: ctx.imageSmoothingEnabled !== false });
  if (solo) flush();
  return true;
}

function endTask() { flushQueued = false; flush(); GL_STATS.tasks++; }

/** render the open batch with WebGL and composite it into its 2D context */
export function flush() {
  const B = pending;
  if (!B) return;
  pending = null;
  const g = G;
  if (!g || g.lost) return;
  const { gl } = g;
  if (gl.isContextLost()) { lose('context lost'); return; }
  try { composite(g, B); } catch (e) { if (gl.isContextLost()) lose('context lost'); else throw e; }
}

function composite(g, B) {
  const { gl } = g;
  const cv = B.ctx.canvas;
  const X0 = Math.max(0, Math.floor(B.x0)), Y0 = Math.max(0, Math.floor(B.y0));
  const X1 = Math.min(cv.width, Math.ceil(B.x1)), Y1 = Math.min(cv.height, Math.ceil(B.y1));
  const quads = g.quads;
  if (X1 <= X0 || Y1 <= Y0 || !quads.length) { quads.length = 0; return; }
  GL_STATS.batches++; GL_STATS.quads += quads.length;
  // vertices once for the batch
  const nq = quads.length;
  if (nq > g.cap) growIndex(Math.max(nq, g.cap * 2));
  if (g.verts.length < nq * 4 * FLOATS) g.verts = new Float32Array(nq * 4 * FLOATS * 2);
  const V = g.verts;
  const UV = [0, 0, 1, 0, 0, 1, 1, 1];
  for (let q = 0; q < nq; q++) {
    const Qd = quads[q];
    for (let k = 0; k < 4; k++) {
      const o = (q * 4 + k) * FLOATS;
      V[o] = Qd.P[k * 2]; V[o + 1] = Qd.P[k * 2 + 1];
      V[o + 2] = UV[k * 2] ? Qd.u1 : Qd.u0; V[o + 3] = UV[k * 2 + 1] ? Qd.v1 : Qd.v0;
      V[o + 4] = Qd.rect[0]; V[o + 5] = Qd.rect[1]; V[o + 6] = Qd.rect[2]; V[o + 7] = Qd.rect[3];
      V[o + 8] = Qd.alpha;
    }
  }
  gl.useProgram(g.prog);
  gl.bindVertexArray(g.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, V.subarray(0, nq * 4 * FLOATS), gl.STREAM_DRAW);
  gl.uniform1i(g.u.tex, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.enable(gl.BLEND);
  if (B.mode === 'lighter' && !B.solo) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  // the box is drawn at the GL canvas' top-left, in tiles of the GL canvas' size (one tile unless the box is huge)
  const TW = Math.min(g.max, X1 - X0), TH = Math.min(g.max, Y1 - Y0);
  if (g.w < TW || g.h < TH) {
    g.w = Math.max(g.w, TW); g.h = Math.max(g.h, TH);
    g.canvas.width = g.w; g.canvas.height = g.h;
  }
  gl.viewport(0, 0, g.w, g.h);
  gl.uniform2f(g.u.size, g.w, g.h);
  const ctx = B.ctx;
  for (let ty = Y0; ty < Y1; ty += TH) {
    for (let tx = X0; tx < X1; tx += TW) {
      const bw = Math.min(TW, X1 - tx), bh = Math.min(TH, Y1 - ty);
      gl.scissor(0, g.h - bh, bw, bh);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(g.u.off, tx, ty);
      // draw in order, one call per run of quads on the same texture
      let i = 0;
      while (i < nq) {
        const r = quads[i].r, sm = quads[i].smooth;
        let j = i + 1;
        while (j < nq && quads[j].r === r && quads[j].smooth === sm) j++;
        if (r.tex) {
          gl.bindTexture(gl.TEXTURE_2D, r.tex);
          const fl = sm ? gl.LINEAR : gl.NEAREST;
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, fl);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, fl);
          gl.uniform1f(g.u.premul, r.premul);
          gl.drawElements(gl.TRIANGLES, (j - i) * 6, gl.UNSIGNED_SHORT, i * 12);
        }
        i = j;
      }
      // composite: 1:1, identity transform; a plain batch with alpha 1 and its own mode, a solo sprite with ctx's state
      const src = g.off ? g.canvas.transferToImageBitmap() : g.canvas;
      ctx.save();
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (!B.solo) {
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = B.mode;
        }
        ctx.imageSmoothingEnabled = false;
        ORIG.drawImage.call(ctx, src, 0, 0, bw, bh, tx, ty, bw, bh);
      } finally {
        ORIG.restore.call(ctx);
        if (g.off) src.close();
      }
    }
  }
  gl.disable(gl.SCISSOR_TEST);
  quads.length = 0;
}

// ------------------------------------------------------------------------------------------------ 2D hooks
// Any canvas-2D operation that puts pixels down (or reads them, or changes the clip) on the context a batch is open
// for -- or that reads that canvas as an image -- composites the batch first.  Only the open batch is checked, so with
// no sprite queued the cost is one comparison per call.
const OPS = ['fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'fillText', 'strokeText', 'putImageData',
  'getImageData', 'clip', 'restore', 'reset', 'createPattern', 'drawFocusIfNeeded'];
function patch2D() {
  const protos = [];
  if (typeof CanvasRenderingContext2D !== 'undefined') protos.push(CanvasRenderingContext2D.prototype);
  if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') protos.push(OffscreenCanvasRenderingContext2D.prototype);
  for (const P of protos) {
    for (const m of OPS) {
      const orig = P[m];
      if (typeof orig !== 'function' || orig.__gl2d) continue;
      const w = function () {
        if (pending !== null && (pending.ctx === this || arguments[0] === pending.ctx.canvas)) flush();
        return orig.apply(this, arguments);
      };
      w.__gl2d = orig;
      P[m] = w;
    }
  }
  // the unpatched methods the composite uses (per prototype: an OffscreenCanvas 2D context has its own)
  ORIG.drawImage = { call(ctx, ...a) { return (ctx.drawImage.__gl2d || ctx.drawImage).apply(ctx, a); } };
  ORIG.restore = { call(ctx) { return (ctx.restore.__gl2d || ctx.restore).call(ctx); } };
  const readers = [];
  if (typeof HTMLCanvasElement !== 'undefined') readers.push([HTMLCanvasElement.prototype, ['toDataURL', 'toBlob', 'captureStream']]);
  if (typeof OffscreenCanvas !== 'undefined') readers.push([OffscreenCanvas.prototype, ['convertToBlob', 'transferToImageBitmap']]);
  for (const [P, ms] of readers) {
    for (const m of ms) {
      const orig = P[m];
      if (typeof orig !== 'function' || orig.__gl2d) continue;
      const w = function () { if (pending !== null && pending.ctx.canvas === this) flush(); return orig.apply(this, arguments); };
      w.__gl2d = orig;
      P[m] = w;
    }
  }
  if (typeof globalThis.createImageBitmap === 'function' && !globalThis.createImageBitmap.__gl2d) {
    const cib = globalThis.createImageBitmap;
    const w = function (src) { if (pending !== null && src === pending.ctx.canvas) flush(); return cib.apply(this, arguments); };
    w.__gl2d = cib;
    globalThis.createImageBitmap = w;
  }
}

if (typeof window !== 'undefined') {
  window.DQ_GL = {
    stats: GL_STATS, caps: glCaps, get mode() { return GL_MODE; }, setMode: glSetMode, flush,
    /** tests: lose the context the way a GPU reset would */
    loseContext() { const x = G && G.loseExt; if (x) x.loseContext(); else lose('test'); },
    /** tests: give a lost context back (as the browser does when the tab returns) */
    restoreContext() { const x = G && G.loseExt; if (x) x.restoreContext(); else restore(); },
  };
}
