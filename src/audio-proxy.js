// Indirection so gameplay code can call audio before (or without) the synth module: every call is a safe no-op
// until main.js hands over the real implementation from audio.js.
let real = null;
const call = (name, ...a) => { try { if (real && real[name]) return real[name](...a); } catch (e) { console.warn('audio', name, e); } };
export const audio = {
  unlock: () => call('unlock'),
  sfx: (n, o) => call('sfx', n, o),
  music: (n) => call('music', n),
  jingle: (n, o) => call('jingle', n, o),
  ambience: (n, o) => call('ambience', n, o),   // (Book 2's ambient beds: src/audio.js audio.ambience; Books 1 and 3 never call it)
  setMuted: (b) => call('setMuted', b),
  pauseAll: (b) => call('pauseAll', b),
  get muted() { return real ? !!real.muted : false; },
};
export function setAudio(a) { real = a; }
