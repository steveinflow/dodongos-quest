// Dodongo's Quest - audio.
//
// Everything is synthesized at runtime with the Web Audio API: no samples, no files.
//   * Music: a small YM2612-flavoured FM "sound chip" (2-operator FM bass / brass / bell / pluck / pad / stabs,
//     synthesized drums) driven by a lookahead scheduler (setInterval 25 ms, notes queued 0.12 s ahead on the
//     AudioContext clock) so timing survives a busy main thread.
//   * SFX: procedural recipes (pitch-swept sines, filtered noise, FM clangs), voice-capped per name.
//
// API (the engine calls these; all are safe before unlock() and never throw):
//   audio.unlock()                      call from a user gesture; creates / resumes the AudioContext
//   audio.sfx(name, { vol, pitch, pan, hold })  -> handle { stop(fade), playing }; hold (true | seconds) sustains
//                                       the holdable sounds (beam_charge, minecart, bomb_fuse, boulder_roll) until stop()
//   audio.stopSfx(name)                 stop every playing voice of that sfx
//   audio.music(name | null)            0.4 s crossfade; same track = no-op.  Tracks: title menu story stage boss
//                                       mines minesboss storm stormboss throne finalboss ending skyduel
//                                       (level boss: stage->boss, mines->minesboss, storm->stormboss, throne->finalboss)
//   audio.jingle(name, { then })        one-shot; stops the music (save / join / portal only duck it and the
//                                       music carries on); `then` = track to start when it ends
//   audio.setMuted(bool) / audio.muted  persisted in localStorage 'dq.muted'
//   audio.setVolumes({ music, sfx })    0..1
//   audio.ready                         true once the context is running
//   audio.pauseAll(bool)                pause menu: freezes music/jingles where they are and silences
//                                       in-flight gameplay sfx (UI sfx such as 'pause' / 'menu_move' still play)
// Test hooks: audio._renderOffline(kind, name, seconds, opts) -> Promise<AudioBuffer>, audio._info(), audio._debug().
//
// Music notation (see SONGS below).  One step = a 16th note, 16 steps per bar.
//   (songs with spb: 12 use a triplet grid: 12 steps per bar, 3 per beat.)
//   melodic lines: "A4:2 D5:2 F#5:3 r:1 ~:4 |"   NOTE[:len] (C4 = middle C), r = rest, ~ = tie (extends the
//                  previous note), | = bar line (checked: must fall on a bar boundary), trailing ! = accent.
//   chords:        one symbol per bar, "Bb,C" splits a bar in halves.  Drive bass templates, arps, pads, stabs
//                  and the generated twin-lead harmony ("harm": the nearest chord tone a 3rd-6th below the lead).
//   bass templates: R root, O octave, 5 fifth, 3 third, b7, +N / -N semitones, r rest - applied to each chord.
//   drums:         one pattern name per bar, "+" suffix adds a crash on the downbeat.

const LOOKAHEAD = 0.12;      // seconds of audio scheduled ahead of the clock
const TICK_MS = 25;          // scheduler interval
const XFADE = 0.4;           // music crossfade
const MUSIC_BASE = 0.19;     // music bus level at volume 1 (sits well under the sfx)
const SFX_BASE = 0.85;       // sfx bus level at volume 1
const COMP_TRIM = 0.75;      // cancels the compressor's automatic makeup gain (+2.5 dB)
const VOICE_CAP = 4;         // simultaneous voices per sfx name
const GLOBAL_CAP = 28;       // simultaneous sfx voices overall
const RETRIGGER = 0.012;     // the same sfx fired again within this window is merged
const MAX_DEV = 9000;        // FM peak deviation cap in Hz (index key-scaling: keeps high notes from aliasing)
const UI_SFX = new Set(['menu_move', 'menu_select', 'pause', 'go', 'menu_back', 'join_ui', 'controller_connected']);
const HOLD_MAX = 8;          // seconds a held sfx may sustain before it releases by itself
const DUCK = 0.3;            // music level under a ducking jingle
const LS_KEY = 'dq.muted';

// ----------------------------------------------------------------------------------------------- pitch / chords
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^([A-G])([#b]?)(-?\d)$/;
function noteNum(name) {
  const m = NOTE_RE.exec(name);
  if (!m) return null;
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
function pcOf(name) {
  const m = /^([A-G])([#b]?)$/.exec(name);
  return m ? (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12 : null;
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const mod12 = (n) => ((n % 12) + 12) % 12;
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const noteName = (m) => NAMES[mod12(m)] + (Math.floor(m / 12) - 1);

const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], aug: [0, 4, 8],
};
function parseChord(sym) {
  const m = /^([A-G][#b]?)([a-z0-9]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m || !Object.prototype.hasOwnProperty.call(QUAL, m[2])) return null;
  const root = pcOf(m[1]);
  const iv = QUAL[m[2]];
  return { sym, root, iv, bass: m[3] ? pcOf(m[3]) : root, pcs: new Set(iv.map((i) => (root + i) % 12)) };
}

// ----------------------------------------------------------------------------------------------- songs
// Instrument / mix defaults shared by all tracks.
const INSTS = { lead: 'brass', lead2: 'bell', harm: 'brass2', bass: 'bass', arp: 'pluck', pad: 'pad', stab: 'stab', choir: 'choir' };
const MIX = { lead: 0.40, lead2: 0.30, harm: 0.25, bass: 0.62, arp: 0.15, pad: 0.13, stab: 0.24, drums: 0.66, choir: 0.2 };
const PAN = { lead: 0, lead2: 0.3, harm: -0.28, bass: 0, arp: 0.42, pad: -0.4, stab: 0.18, drums: 0, choir: -0.12 };
const ECHO_SEND = { lead: 0.55, lead2: 0.6, harm: 0.45, arp: 0.35, choir: 0.25 };
const CHANNELS = ['lead', 'lead2', 'harm', 'bass', 'arp', 'pad', 'stab', 'drums', 'choir'];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const UPDOWN = '0 1 2 3 4 3 2 1 0 1 2 3 4 3 2 1';
const UP8 = '0 . 1 . 2 . 3 . 4 . 3 . 2 . 1 .';

const SONGS = {
  // ------------------------------------------------------------------ STAGE: "The Dragon Road"  D major / mixolydian
  // Intro 4 bars (not repeated) -> A 16 -> B 16 -> back to A.  Signature cadence bVI-bVII-I (Bb-C-D).
  stage: {
    bpm: 128, bassLow: 33, echo: { steps: 3, fb: 0.3, wet: 0.24 },
    intro: ['I'], loop: ['A', 'B'],
    drums: {
      I:   { k: 'X...x...X...x...', h: '..x...x...x...x.' },
      I2:  { k: 'X...x...X...x...', h: 'x.x.x.x.x.x.x.x.', s: '............x...' },
      IF:  { k: 'X...x...X...x...', s: '........gxgxxXXX', h: 'x.x.x.x.' },
      A:   { k: 'X...x...X...x...', s: '....X.......X...', h: 'x.xgx.xgx.xgx...', o: '..............x.' },
      A2:  { k: 'X...x...X..xx...', s: '....X.......X..g', h: 'x.xgx.xgx.xgx.xg', c: '............x...' },
      AF:  { k: 'X...x...X.......', s: '....X.........XX', h: 'x.x.x.x.', th: '........xx', tm: '..........xx', tl: '............xx' },
      AF2: { k: 'X...x...X...X...', s: '....X...gxgxxXXX', h: 'x.x.x.x.' },
      B:   { k: 'X..x..X...X..x..', s: '....X.......X...', c: '....x.......x...', h: 'xgxgxgxgxgxgxgxg' },
      B2:  { k: 'X..x..X...X..xx.', s: '....X.......X.gg', c: '....x.......x...', h: 'xgxgxgxgxgxgxgxg' },
      BF:  { k: 'X..x..X...X.....', s: '....X.......XgXX', h: 'xgxgxgxgxgxg' },
      BB:  { k: 'X...X...X...X...', s: 'x.x.x.x.x.x.x.x.' },
      BR:  { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX' },
    },
    templates: {
      SA:  'R:2 O:1 R:1 r:1 R:1 O:1 R:1 r:1 R:1 O:1 R:1 5:1 R:1 O:2',   // syncopated octave pops
      SA2: 'R:1 R:1 O:1 R:1 5:1 R:1 O:1 R:1 R:1 5:1 O:1 5:1 R:1 O:1 5:1 O:1',   // every 4th bar: busier 16ths
      SB:  'R:2 R:2 O:1 R:1 R:2 R:2 R:2 O:1 R:1 5:2',                    // driving 8ths
      SB2: 'R:2 R:1 R:1 O:2 R:1 R:1 R:2 5:2 O:2 5:2',
    },
    sections: {
      I: {
        bars: 4, chords: 'D5 D5 Bb C',
        bass: 'SA',
        lead: 'r:32 | F5:3 F5:3 F5:4 D5:2 F5:4 | G5:3 G5:3 G5:4 E5:2 A5:4', harm: true,
        stab: '0|0|X..X..X...X.X...|X..X..X...X.X...',
        arp: { pat: UPDOWN, oct: 4 }, mute: { arp: [1] },
        drums: 'I I I2 IF',
      },
      A: {
        bars: 16,
        chords: 'D D C G D Bm G A   D D C G Bm G A A',
        bass: ['SA', 'SA', 'SA', 'SA2'],
        bassBars: {
          8: 'A1:2 A2:1 A1:1 r:1 A1:1 A2:1 A1:1 B1:2 C#2:2 E2:2 G2:2',
          16: 'A1:2 A2:2 G2:2 A2:2 B2:2 A2:2 F#2:2 E2:2',
        },
        lead: [
          'A4:2 D5:2 F#5:2 A5:6 G5:2 F#5:2',      // call: heroic triad leap
          'E5:8 r:2 D5:2 E5:2 F#5:2',             // ...left open on the 9th
          'G5:6 E5:2 C5:4 E5:2 G5:2',             // response over the bVII
          'B4:2 D5:4 G5:10',
          'A4:2 D5:2 F#5:2 A5:6 B5:2 A5:2',       // call again, reaching higher
          'F#5:4 E5:2 D5:2 B4:4 D5:2 E5:2',
          'G5:4 F#5:2 G5:2 B5:6 A5:2',
          'A5:8 r:2 A4:2 B4:2 C#5:2',             // half cadence + pickup
          'D5:2 r:1 D5:1 F#5:2 A5:6 G5:2 F#5:2',  // phrase 2 (twin lead)
          'E5:8 r:2 D5:2 E5:2 F#5:2',
          'G5:6 E5:2 C5:4 E5:2 G5:2',
          'A5:4 B5:2 A5:2 G5:8',
          'F#5:6 D5:2 B4:4 C#5:2 D5:2',
          'D5:6 B4:2 G4:4 B4:2 D5:2',
          'C#5:4 E5:4 A5:8',
          '~:8 G5:2 F#5:2 E5:2 C#5:2',            // A7 turn into the B section
        ].join(' | '),
        harm: true, mute: { harm: range(1, 8) },
        arp: { pat: UPDOWN, oct: 4 }, pad: true,
        drums: 'A+ A A A2 A A A AF   A+ A A A2 A A A2 AF2',
      },
      B: {
        bars: 16,
        chords: 'Bm G D A Bm G A A   Em F#m G A Bb C Bb C',
        bass: ['SB', 'SB', 'SB', 'SB2'],
        bassBars: { 16: 'C2:2 C3:2 B2:2 A2:2 G2:2 E2:2 C#2:2 C2:1 C#2:1' },
        lead: [
          'F#5:3 F#5:3 E5:2 F#5:3 A5:3 F#5:2',    // syncopated call (brass) ...
          'D5:8 r:8',                             // ... answered by the bell (lead2)
          'F#5:3 F#5:3 E5:2 F#5:3 A5:3 B5:2',
          'A5:8 r:8',
          'D6:3 C#6:3 B5:2 A5:3 F#5:3 D5:2',
          'E5:3 D5:3 B4:2 D5:8',
          'C#5:3 E5:3 A5:2 G5:4 F#5:2 E5:2',
          'E5:8 r:8',
          'B4:2 E5:2 G5:4 F#5:2 E5:2 G5:4',       // rising sequence, twin lead
          'C#5:2 F#5:2 A5:4 B5:2 A5:2 F#5:4',
          'D5:2 G5:2 B5:4 A5:2 G5:2 B5:4',
          'E5:2 A5:2 C#6:8 B5:2 A5:2',
          'F5:3 D5:3 Bb4:2 D5:3 F5:3 Bb5:2',      // bVI - bVII build
          'G5:3 E5:3 C5:2 E5:3 G5:3 C6:2',
          'D6:4 C6:2 Bb5:2 F5:4 Bb5:4',
          'C6:4 E6:4 D6:2 C6:2 G5:2 E5:2',       // climax, then cascade down into the hook
        ].join(' | '),
        lead2: [
          'r:16', 'r:8 B5:2 A5:2 G5:2 D5:2', 'r:16', 'r:8 C#6:2 B5:2 A5:2 E5:2',
          'r:16', 'r:8 G5:2 B5:2 D6:4', 'r:16', 'r:8 A5:1 B5:1 C#6:1 E6:1 A6:4', 'r:128',
        ].join(' | '),
        harm: true, mute: { harm: range(1, 8) },
        arp: { pat: UP8, oct: 4 }, pad: true,
        stab: '0|0|0|0|0|0|0|0|0|0|0|0|X..X..X...X.X...|X..X..X...X.X...|X..X..X...X.X...|X..X..X...X.X...',
        drums: 'B+ B B B2 B B B BF   B+ B B B2 BB BB BB BR',
      },
    },
  },

  // ------------------------------------------------------------------ TITLE: anthem, C major, 104 BPM
  // Intro fanfare (Ab-Bb, the same bVI-bVII signature) -> A: descending-bass anthem -> B: climax + fanfare reprise.
  title: {
    bpm: 104, bassLow: 31, echo: { steps: 3, fb: 0.32, wet: 0.26 },
    mix: { lead: 0.42, pad: 0.16, arp: 0.15 },
    intro: ['TI'], loop: ['TA', 'TB'],
    templates: {
      T:  'R:2 R:1 R:1 O:2 R:2 R:2 R:1 R:1 O:2 5:2',   // galloping 8ths
      T2: 'R:2 R:1 R:1 O:2 R:2 5:2 O:2 5:2 R:2',
    },
    drums: {
      T:   { k: 'X.....x.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
      T2:  { k: 'X.....x.X.....x.', s: '....X.......X..g', h: 'x.x.x.x.x.x.x.xx' },
      TF:  { k: 'X.....x.X.......', s: '....X...', h: 'x.x.x.x.', th: '........X.X', tm: '...........X.X', tl: '..............XX' },
      TR1: { k: 'X..X..X.X.......', tl: '........x.x.xgxg' },
      TR2: { k: 'X..X..X.X.......', s: '........gxgxxXXX' },
    },
    sections: {
      TI: {
        bars: 2, chords: 'Ab Bb', bassLine: 'Ab1:3 Ab1:3 Ab1:2 Ab1:8 | Bb1:3 Bb1:3 Bb1:2 Bb1:6 B1:2',
        lead: 'Eb5:3 Eb5:3 Eb5:2 Ab5:8 | F5:3 F5:3 F5:2 Bb5:8', harm: true,
        stab: 'X..X..X.X.......', pad: true, drums: 'TR1+ TR2',
      },
      TA: {
        bars: 8, chords: 'C G/B Am Em/G F C/E Dm G', roots: 'C2 B1 A1 G1 F1 E1 D1 G1',
        bass: ['T', 'T', 'T', 'T2'],
        lead: [
          'G4:4 C5:6 D5:2 E5:4',
          'D5:6 B4:2 G4:8',
          'A4:4 C5:6 D5:2 E5:4',
          'G5:8 E5:4 D5:4',
          'C5:4 F5:6 G5:2 A5:4',
          'G5:6 E5:2 C5:8',
          'D5:4 F5:4 A5:4 G5:2 F5:2',
          'D5:4 G5:4 B5:8',
        ].join(' | '),
        lead2: 'r:64 | r:8 C6:2 B5:2 A5:4 | r:8 C6:2 G5:2 E5:4 | r:8 D6:2 F6:2 A6:4 | r:16',
        arp: { pat: '0 . 1 . 2 . 3 . 2 . 1 . 2 . 3 .', oct: 4 }, pad: true,
        drums: 'T+ T T T2 T T T TF',
      },
      TB: {
        bars: 8, chords: 'Am F C G Am F Ab Bb', roots: 'A1 F1 C2 G1 A1 F1 Ab1 Bb1',
        bass: ['T', 'T', 'T', 'T2'],
        bassBars: { 7: 'Ab1:3 Ab1:3 Ab1:2 Ab1:8', 8: 'Bb1:3 Bb1:3 Bb1:2 Bb1:6 B1:2' },
        lead: [
          'C6:6 B5:2 A5:4 E5:4',
          'F5:4 A5:4 C6:6 A5:2',
          'G5:6 E5:2 G5:4 C6:4',
          'D6:6 C6:2 B5:4 G5:4',
          'C6:6 B5:2 A5:4 E5:4',
          'F5:4 A5:4 C6:4 D6:2 C6:2',
          'Eb5:3 Eb5:3 Eb5:2 Ab5:8',               // the intro fanfare returns
          'F5:3 F5:3 F5:2 Bb5:8',
        ].join(' | '),
        harm: true,
        arp: { pat: UPDOWN, oct: 4 }, pad: true,
        stab: '0|0|0|0|0|0|X..X..X.X.......|X..X..X.X.......',
        drums: 'T2+ T2 T2 T2 T2 T2 TR1 TR2',
      },
    },
  },

  // ------------------------------------------------------------------ BOSS: Grimscale.  E minor / phrygian, 142 BPM
  // Chromatic 16th ostinato in the bass, orchestra-stab hits, harmonic-minor lead (D# leading tone, B7b9 turnarounds).
  boss: {
    bpm: 142, bassLow: 35, echo: { steps: 3, fb: 0.28, wet: 0.2 },
    mix: { bass: 0.6, stab: 0.28 },
    intro: ['BI'], loop: ['BA', 'BB', 'BC'],
    drums: {
      BI1: { k: 'X.......X.......', tl: '....x.......x.xx' },
      BI2: { k: 'X...X...X...X...', s: '........ggxxxXXX', tl: 'x...x...' },
      BA:  { k: 'X...X...X...X...', s: '....X.......X...', h: 'xgxgxgxgxgxgxgxg' },
      BA2: { k: 'X...X...X...X.x.', s: '....X.......X..x', h: 'xgxgxgxgxgxgxgxg' },
      BB:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      BF:  { k: 'X...X...X.......', s: '....X...', th: '........XX', tm: '..........XX', tl: '............XXXX' },
      BW:  { k: 'X.......X.......', tl: 'X..X..X...X..X..', tm: '....x.......x...', h: '..x...x...x...x.' },
      BR:  { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX' },
    },
    sections: {
      BI: {
        bars: 2, chords: 'Em Em', bass: 'OST', stab: 'X...............|0', drums: 'BI1 BI2',
      },
      BA: {
        bars: 8, chords: 'Em Em F Em Em Em C B', bass: 'OST', bassAlt: { B: 'OSTV' },
        lead: [
          'E5:4 G5:4 F#5:2 E5:2 D#5:4',
          'E5:12 r:4',
          'F5:4 A5:4 G5:2 F5:2 E5:4',
          'E5:12 r:2 B4:1 B4:1',
          'E5:4 G5:4 B5:4 A5:2 G5:2',
          'F#5:4 G5:2 F#5:2 E5:8',
          'E5:4 G5:4 C6:6 B5:2',
          'B5:8 A5:2 G5:2 F#5:2 D#5:2',
        ].join(' | '),
        stab: 'X.....X.........', drums: 'BA+ BA BA BA2 BA BA BA BF',
      },
      BB: {
        bars: 8, chords: 'Am Am Em Em F F B B', bass: 'OST', bassAlt: { B: 'OSTV' },
        lead: [
          'A5:6 C6:2 B5:4 A5:4',
          'E5:12 r:4',
          'G5:6 B5:2 A5:4 G5:4',
          'B4:12 r:4',
          'C6:6 B5:2 A5:4 F5:4',
          'E5:4 F5:4 A5:8',
          'B5:4 A5:2 G5:2 F#5:4 D#5:4',
          'F#5:8 r:4 B4:2 D#5:2',
        ].join(' | '),
        lead2: 'r:16 | r:12 E6:1 D6:1 C6:1 B5:1 | r:16 | r:12 B5:1 A5:1 G5:1 F#5:1 | r:64',
        harm: true, pad: true, arp: { pat: UPDOWN, oct: 4 },
        stab: 'X..X..X.........', drums: 'BB+ BB BB BB BB BB BB BF',
      },
      BC: {
        bars: 8, chords: 'C C Am Am F F B B', bass: 'OST', bassAlt: { B: 'OSTV' },
        lead: 'r:64 | A5:2 r:2 A5:2 r:2 C6:2 r:2 A5:2 r:2 | B5:2 r:2 B5:2 r:2 C6:2 r:2 B5:2 r:2 | D#6:4 C6:4 B5:4 A5:4 | F#5:4 G5:4 A5:4 B5:4',
        harm: true,
        arp: { pat: '0 2 1 3 0 2 1 3 0 2 1 3 2 1 0 1', oct: 5, inst: 'bell' }, mute: { arp: range(5, 8) },
        stab: 'X..X..X.....X...|X..X..X.....X...|X..X..X.....X...|X..X..X.....X...|X..X..X.X..X..X.|X..X..X.X..X..X.|X...X...X...X...|X.X.X.X.X.X.X.X.',
        drums: 'BW+ BW BW BW BA BA BA2 BR',
      },
    },
    templates: {
      OST: 'R:1 R:1 O:1 R:1 r:1 R:1 3:1 R:1 +1:1 R:1 O:1 R:1 +6:1 +5:1 3:1 +1:1',   // 3 = the chord's own third
      OSTV: 'R:1 R:1 O:1 R:1 r:1 R:1 +4:1 R:1 +1:1 R:1 O:1 R:1 +7:1 +5:1 +4:1 +2:1',
    },
  },
};

// Jingles: one section each, played once.
const JDRUMS = {
  JR:  { k: 'X.......X.......', s: 'xgxgxgxgxxxxXXXX' },
  JX:  { k: 'X...............', x: 'X...............', tl: 'X...' },
  CL:  { k: 'X...X...X...X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
  CL2: { k: 'X...X...X...X...', s: '....X.......XXXX', h: 'x.x.x.x.x.x.' },
  CO1: { k: 'X.......X.......', h: '..x...x...x...x.', s: '............x.xx' },
  BI1: { k: 'X.......X.......', tl: 'X...x...x...x.xx' },
  BI2: { k: 'X...X...X...X...', s: '........ggxxxXXX', tl: 'x...x...' },
};
const JINGLES = {
  start: {   // stage-start fanfare: bVI-bVII-I into the tonic
    bpm: 150, bassLow: 33, sec: {
      bars: 2, chords: 'Bb,C D',
      lead: 'D5:2 r:1 D5:1 F5:4 E5:2 r:1 E5:1 G5:4 | A5:12 r:4', harm: true,
      bassLine: 'Bb1:2 r:1 Bb1:1 Bb1:4 C2:2 r:1 C2:1 C2:4 | D2:2 D3:2 D2:8 r:4',
      stab: 'X..XX...X..XX...|X...............', pad: true, mute: { pad: [1] }, drums: 'JR JX',
    },
  },
  clear: {   // victory: IV - V - I, rising sequence, big tonic
    bpm: 150, bassLow: 31, sec: {
      bars: 3, chords: 'G A D',
      lead: 'B4:2 D5:2 G5:2 B5:6 G5:2 B5:2 | C#5:2 E5:2 A5:2 C#6:6 A5:2 C#6:2 | D6:12 r:4', harm: true,
      bass: 'R:2 O:2 R:2 O:2 R:2 O:2 R:2 O:2', bassBars: { 3: 'D2:2 D3:2 D2:8 r:4' },
      arp: { pat: UPDOWN, oct: 5 }, mute: { arp: [3], pad: [1, 2] }, pad: true,
      stab: '0|0|X...............', drums: 'CL CL2 JX',
    },
  },
  gameover: {   // gentle, ends on a soft D major (picardy third) so it stays kind
    bpm: 96, bassLow: 31, inst: { lead: 'bell', bass: 'softbass' }, mix: { lead: 0.5, pad: 0.2 }, sec: {
      bars: 2, chords: 'Bb,Gm A,D',
      lead: 'F5:6 E5:2 D5:4 Bb4:4 | C#5:6 E5:2 D5:8',
      bassLine: 'Bb1:8 G1:8 | A1:8 D2:8', pad: true, drums: '',
    },
  },
  bossintro: {   // alarm: tritone siren over a diminished stab, drum roll
    bpm: 140, bassLow: 28, sec: {
      bars: 2, chords: 'Edim Edim',
      lead: 'E5:2 Bb4:2 E5:2 Bb4:2 E5:2 Bb4:2 E5:2 Bb4:2 | E5:2 Bb4:2 E5:2 Bb4:2 E5:8',
      bass: 'R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1',
      stab: 'X.......X.......|X.......X...X.X.', drums: 'BI1 BI2',
    },
  },
  continue: {   // short and hopeful: IV-V-I
    bpm: 140, bassLow: 31, sec: {
      bars: 2, chords: 'G,A D',
      lead: 'B4:2 D5:2 G5:4 C#5:2 E5:2 A5:4 | F#5:12 r:4', harm: true,
      bassLine: 'G1:4 G2:4 A1:4 A2:4 | D2:4 D3:4 D2:8', pad: true, drums: 'CO1 JX',
    },
  },
};

// ================================================================================================= v2 tracks
// Level -> boss track: stage -> boss (Grimscale), mines -> minesboss, storm -> stormboss, throne -> finalboss.
const ARP_TRIP = '0 1 2 3 2 1';                 // triplet swirl for the 12-step tracks
const ARP_EERIE = '0 2 1 3 0 2 1 3 0 2 1 3 2 1 0 1';
const ARP_8TH = '0 . 1 . 2 . 3 . 2 . 1 . 2 . 3 .';
const BOSS_OST = 'R:1 R:1 O:1 R:1 R:1 R:1 3:1 R:1 +1:1 R:1 O:1 R:1 +6:1 +5:1 3:1 +1:1';
const BOSS_OSTV = 'R:1 R:1 O:1 R:1 R:1 R:1 +4:1 R:1 +1:1 R:1 O:1 R:1 +7:1 +5:1 +4:1 +2:1';

Object.assign(SONGS, {
  // ------------------------------------------------------------------ MENU: character / level select. G major, 112 BPM, bouncy
  menu: {
    level: 1.15, bpm: 112, bassLow: 33, echo: { steps: 3, fb: 0.25, wet: 0.18 },
    inst: { stab: 'pluck' }, mix: { stab: 0.2 },
    intro: ['MI'], loop: ['MA', 'MB'],
    templates: {
      BOUNCE: 'R:1 r:1 O:1 r:1 5:1 r:1 O:1 r:1 R:1 r:1 O:1 r:1 5:1 r:1 O:1 R:1',   // staccato octave bounce
      BOUNCE2: 'R:1 r:1 O:1 R:1 5:1 r:1 O:1 r:1 R:1 R:1 O:1 r:1 5:1 O:1 5:1 3:1',
    },
    drums: {
      MI: { k: 'X.......X.......', s: '........gxgxXXXX', h: 'x.x.x.x.' },
      M:  { k: 'X.....X...X.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
      M2: { k: 'X.....X...X...x.', s: '....X.......X..g', h: 'x.x.x.x.x.x.x.xx' },
      MF: { k: 'X.....X...X.....', s: '....X.......XgXX', h: 'x.x.x.x.x.x.' },
      MB: { k: 'X.....X...X.....', s: '....X.......X...', c: '....x.......x...', h: 'xg.gxg.gxg.gxg.g', o: '..x...x...x...x.' },
    },
    sections: {
      MI: { bars: 1, chords: 'D', bassLine: 'D2:2 D3:2 D2:2 D3:2 D2:2 E2:2 F#2:4', stab: 'X.....X.', drums: 'MI' },
      MA: {
        bars: 8, chords: 'G Em C D G Em Am,D G', bass: ['BOUNCE', 'BOUNCE', 'BOUNCE', 'BOUNCE2'],
        lead: [
          'D5:2 G5:2 r:1 G5:1 A5:2 B5:3 A5:1 G5:2 D5:2',   // hop-skip hook
          'E5:6 G5:2 B5:4 r:4',
          'C5:2 E5:2 r:1 E5:1 G5:2 C6:3 B5:1 A5:2 G5:2',
          'F#5:6 A5:2 D5:4 r:4',
          'D5:2 G5:2 r:1 G5:1 A5:2 B5:3 A5:1 G5:2 B5:2',
          'B5:6 G5:2 E5:4 G5:4',
          'A5:3 C6:3 B5:2 A5:3 F#5:3 D5:2',
          'G5:3 D5:1 B4:2 D5:2 G5:4 r:4',
        ].join(' | '),
        lead2: 'r:16 | r:12 E6:1 D6:1 B5:1 G5:1 | r:16 | r:12 F#5:1 A5:1 D6:1 F#6:1 | r:48 | r:12 D6:1 B5:1 A5:1 G5:1',
        arp: { pat: ARP_8TH, oct: 4 }, stab: '..X...X...X...X.',
        drums: 'M+ M M M2 M M M MF',
      },
      MB: {
        bars: 8, chords: 'C D Bm Em C D Em,C D', bass: ['BOUNCE', 'BOUNCE', 'BOUNCE', 'BOUNCE2'],
        lead: [
          'E5:4 G5:4 C6:6 B5:2',
          'A5:8 F#5:4 D5:4',
          'D5:4 F#5:4 B5:6 A5:2',
          'G5:8 E5:4 B4:4',
          'E5:4 G5:4 C6:4 D6:2 E6:2',
          'D6:6 C6:2 A5:4 F#5:4',
          'G5:4 B5:4 C6:4 E5:4',
          'F#5:4 A5:4 D6:4 r:4',
        ].join(' | '),
        harm: true, pad: true, arp: { pat: UPDOWN, oct: 4 }, stab: '..X...X...X...X.',
        drums: 'MB+ MB MB MB MB MB MB MF',
      },
    },
  },

  // ------------------------------------------------------------------ STORY: cutscenes. F major, 84 BPM, quiet and sparse
  story: {
    bpm: 84, bassLow: 29, level: 0.9, echo: { steps: 3, fb: 0.3, wet: 0.22 },
    inst: { lead: 'flute', lead2: 'celesta', arp: 'celesta', bass: 'softbass', pad: 'strings' },
    mix: { lead: 0.36, arp: 0.12, pad: 0.12, bass: 0.5, drums: 0.4 },
    intro: [], loop: ['SA', 'SB'],
    templates: { SOFT: 'R:6 5:2 O:4 5:4' },
    drums: { S0: {}, S1: { sh: '..x...x...x...x.' }, S2: { sh: '..x...x...x...x.', wb: '............x...' } },
    sections: {
      SA: {
        bars: 8, chords: 'F C/E Dm Bb F C Bb,C F', bass: 'SOFT',
        lead: 'C5:4 F5:4 A5:8 | G5:12 r:4 | F5:4 E5:4 D5:4 A4:4 | D5:12 r:4 | C5:4 F5:4 A5:4 C6:4 | G5:6 A5:2 Bb5:4 G5:4 | F5:4 D5:4 E5:4 C5:4 | F5:12 r:4',
        arp: { pat: ARP_8TH, oct: 5 }, pad: true, drums: 'S0 S0 S1 S1 S1 S1 S1 S2',
      },
      SB: {
        bars: 8, chords: 'Bb F/A Gm C Dm Bb Gm C', bass: 'SOFT',
        lead: 'D5:6 C5:2 Bb4:8 | C5:12 r:4 | Bb4:4 D5:4 G5:8 | G5:6 F5:2 E5:8 | F5:6 E5:2 D5:4 A5:4 | F5:8 D5:8 | Bb4:4 D5:4 G5:4 F5:4 | E5:8 r:8',
        lead2: 'r:16 | r:12 A5:1 C6:1 F6:2 | r:16 | r:8 C6:2 Bb5:2 G5:4 | r:48 | r:8 G5:2 A5:2 Bb5:2 C6:2',
        arp: { pat: ARP_8TH, oct: 5 }, pad: true, drums: 'S1 S1 S1 S1 S1 S1 S1 S2',
      },
    },
  },

  // ------------------------------------------------------------------ MINES: level 2. C minor, 126 BPM, anvils + minecart chug
  mines: {
    level: 1.17, bpm: 126, bassLow: 33, echo: { steps: 3, fb: 0.28, wet: 0.2 },
    inst: { bass: 'chug' }, mix: { bass: 0.66 },
    intro: ['NI'], loop: ['NA', 'NB', 'NA2', 'NC'],
    templates: {
      CHUG: 'R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 O:1 R:1 5:1 O:1',
      CHUG2: 'R:1 R:1 r:1 R:1 R:1 r:1 R:1 R:1 r:1 R:1 O:1 r:1 5:1 O:1 5:1 3:1',
      GAL: 'R:2 R:1 R:1 O:2 R:2 R:2 R:1 R:1 O:2 5:2',
    },
    drums: {
      NI1: { k: 'X.......X.......', a: '....X.......X...', q: '.x.x.x.x.x.x.x.x' },
      NI2: { k: 'X.......X...X...', a: '....X.......X...', q: '.x.x.x.x.x.x.x.x', s: '........ggxxXXXX' },
      NA:  { k: 'X..x....X..x....', s: '....X.......X...', a: '....X.......X...', q: '.x.x.x.x.x.x.x.x' },
      NA2: { k: 'X..x....X..x..x.', s: '....X.......X..g', a: '....X.......X.x.', q: '.x.x.x.x.x.x.x.x' },
      NF:  { k: 'X..x....X.......', s: '....X...xgxgXXXX', a: '....X.......X.XX' },
      NB:  { k: 'X...X...X...X...', s: '....X.......X...', a: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
      NB2: { k: 'X...X...X...X.x.', s: '....X.......X..x', a: '....X.......X...', h: 'x.x.x.x.x.x.x.xx' },
      NC:  { k: 'X.......X.......', a: 'X..X..X...X..X..', q: '.x.x.x.x.x.x.x.x' },
      NR:  { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX', a: '............XXXX' },
    },
    sections: {
      NI: { bars: 2, chords: 'Cm Cm', bass: 'CHUG', stab: '0|X...........X.X.', drums: 'NI1 NI2' },
      NA: {
        bars: 8, chords: 'Cm Cm Ab Bb Cm Cm Ab,Bb G', bass: ['CHUG', 'CHUG', 'CHUG', 'CHUG2'],
        lead: [
          'G4:2 C5:2 Eb5:2 G5:6 F5:2 Eb5:2',      // Dodongo's rising-triad motif, now in minor
          'D5:6 Eb5:2 C5:8',
          'C5:2 Eb5:2 Ab5:2 C6:6 Bb5:2 Ab5:2',
          'Bb5:8 F5:4 D5:4',
          'G4:2 C5:2 Eb5:2 G5:6 Ab5:2 G5:2',
          'Eb5:4 D5:2 C5:2 G5:8',
          'Ab5:4 C6:4 Bb5:4 D6:4',
          'B5:8 r:2 G5:2 A5:2 B5:2',              // leading tone up into the major-key B section
        ].join(' | '),
        stab: '0|0|0|X..X..X...X.X...', drums: 'NA+ NA NA NA2 NA NA NA NF',
      },
      NB: {
        bars: 8, chords: 'Ab Bb Eb G Ab Bb Cm G', inst: { bass: 'bass' }, bass: 'GAL',
        lead: [
          'C6:6 Bb5:2 Ab5:4 Eb5:4',
          'D6:6 C6:2 Bb5:4 F5:4',
          'Eb6:8 Bb5:4 G5:4',
          'D6:6 B5:2 G5:8',
          'C6:6 Bb5:2 Ab5:4 C6:4',
          'Bb5:6 C6:2 D6:4 Bb5:4',
          'Eb6:6 D6:2 C6:4 G5:4',
          'B5:4 G5:4 D5:4 B4:4',
        ].join(' | '),
        harm: true, pad: true, arp: { pat: UPDOWN, oct: 4 }, drums: 'NB+ NB NB NB2 NB NB NB NF',
      },
      NA2: { ref: 'NA', harm: true, stab: 'X.....X...X.....', drums: 'NA+ NA NA NA2 NA NA NA2 NF' },
      NC: {
        bars: 8, chords: 'Cm Cm Ab Ab Fm Fm G G', bass: 'CHUG',
        lead: 'r:64 | F5:4 Ab5:4 C6:4 Ab5:4 | F5:4 Ab5:4 C6:4 Eb6:4 | D6:4 B5:4 G5:4 B5:4 | D6:8 B5:4 G5:4',
        harm: true, arp: { pat: ARP_EERIE, oct: 5, inst: 'bell' }, mute: { arp: range(5, 8) },
        stab: 'X..X..X...X..X..', drums: 'NC+ NC NC NC NA NA NA2 NR',
      },
    },
  },

  // ------------------------------------------------------------------ MINESBOSS: lava wyrm. C minor / phrygian, 146 BPM
  minesboss: {
    bpm: 146, bassLow: 33, echo: { steps: 3, fb: 0.26, wet: 0.18 }, mix: { stab: 0.28 },
    intro: ['XI'], loop: ['XA', 'XB'],
    templates: { OST: BOSS_OST, OSTV: BOSS_OSTV },
    drums: {
      XI1: { k: 'X.......X.......', a: 'X.......X...X.X.' },
      XI2: { k: 'X...X...X...X...', a: 'X...X...X...X...', s: '........ggxxxXXX' },
      XA:  { k: 'X...X...X...X...', s: '....X.......X...', a: '..x...x...x...x.', h: 'xgxgxgxgxgxgxgxg' },
      XA2: { k: 'X...X...X...X.x.', s: '....X.......X..x', a: '..x...x...x...xx', h: 'xgxgxgxgxgxgxgxg' },
      XB:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', c: '....x.......x...', a: 'X.......X.......', h: 'x.x.x.x.x.x.x.x.' },
      XF:  { k: 'X...X...X.......', s: '....X...xxxxXXXX', a: '........X.X.X.X.' },
    },
    sections: {
      XI: { bars: 2, chords: 'Cm Cm', bass: 'OST', stab: 'X...............|0', drums: 'XI1 XI2' },
      XA: {
        bars: 8, chords: 'Cm Cm Db Cm Cm Cm Ab G', bass: 'OST', bassAlt: { G: 'OSTV' },
        lead: 'G4:2 C5:2 Eb5:2 G5:6 F#5:2 G5:2 | Eb5:12 r:4 | Ab4:2 Db5:2 F5:2 Ab5:6 G5:2 F5:2 | G5:12 r:4 | C6:4 B5:4 Ab5:4 G5:4 | Eb5:4 D5:2 Eb5:2 C5:8 | Ab5:4 C6:4 Eb6:4 C6:4 | B5:8 D6:4 B5:4',
        stab: 'X.....X.........', drums: 'XA+ XA XA XA2 XA XA XA XF',
      },
      XB: {
        bars: 8, chords: 'Fm Fm Cm Cm Db Db G G', bass: 'OST', bassAlt: { G: 'OSTV' },
        lead: 'F5:6 Ab5:2 C6:8 | Ab5:4 G5:2 F5:2 C5:8 | Eb5:6 G5:2 C6:8 | Eb6:4 D6:2 C6:2 G5:8 | F5:6 Ab5:2 Db6:8 | Db6:4 C6:2 Ab5:2 F5:8 | D5:4 G5:4 B5:4 D6:4 | F5:6 D5:2 B4:8',
        harm: true, pad: true, arp: { pat: UPDOWN, oct: 4 }, stab: 'X..X..X.........', drums: 'XB+ XB XB XB XB XB XB XF',
      },
    },
  },

  // ------------------------------------------------------------------ STORM: level 3. D minor, 136 BPM, 12-step triplet gallop
  storm: {
    bpm: 136, spb: 12, bassLow: 33, echo: { steps: 3, fb: 0.3, wet: 0.22 },
    inst: { lead2: 'strings', pad: 'strings' }, mix: { pad: 0.14, lead2: 0.3 },
    intro: ['WI'], loop: ['WA', 'WB', 'WA2', 'WC'],
    templates: {
      GAL: 'R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 O:1 R:1 5:1',     // triplet gallop
      GAL2: 'R:1 R:1 R:1 O:1 R:1 R:1 5:1 R:1 R:1 O:1 5:1 O:1',
      LONG: 'R:3 R:3 R:2 R:1 O:3',
    },
    drums: {
      WI1: { w: 'X', tl: 'X..X..X..X..' },
      WI2: { tl: 'X.xX.xX.xX.x', s: '......ggxxXX' },
      WA:  { k: 'X.xX..X.xX..', s: '...X.....X..', h: 'x.xx.xx.xx.x' },
      WA2: { k: 'X.xX.xX.xX.x', s: '...X.....X.x', h: 'x.xx.xx.xx.x' },
      WAW: { k: 'X.xX..X.xX..', s: '...X.....X..', h: 'x.xx.xx.xx.x', w: 'X' },
      WF:  { k: 'X.xX..X.....', s: '...X..xxxXXX', h: 'x.xx.x' },
      WB:  { k: 'X..X..X..X..', s: '...X.....X..', c: '...x.....x..', h: 'xggxggxggxgg' },
      WC:  { k: 'X.....X.....', tl: '..x..x..x..x', h: '..x..x..x..x' },
      WCW: { k: 'X.....X.....', tl: '..x..x..x..x', h: '..x..x..x..x', w: 'X' },
      WR:  { k: 'X..X..X..X..', s: 'ggxxxxxxXXXX' },
    },
    sections: {
      WI: { bars: 2, chords: 'Dm Dm', bass: 'GAL', mute: { bass: [1] }, pad: true, drums: 'WI1 WI2' },
      WA: {
        bars: 8, chords: 'Dm Bb C Dm Dm Bb C A', bass: ['GAL', 'GAL', 'GAL', 'GAL2'],
        lead: 'A4:3 D5:3 F5:3 A5:3 | Bb5:6 A5:3 F5:3 | G5:3 E5:3 C5:2 E5:1 G5:3 | A5:12 | A4:3 D5:3 F5:3 A5:2 Bb5:1 | D6:6 C6:3 Bb5:3 | C6:3 Bb5:2 A5:1 G5:3 E5:3 | E5:3 A5:3 C#6:6',
        arp: { pat: ARP_TRIP, oct: 4 }, pad: true, drums: 'WA+ WA WA WA2 WA WA WA WF',
      },
      WB: {
        bars: 8, chords: 'F C Bb F Gm Dm Bb,C A', bass: ['GAL', 'GAL', 'GAL', 'GAL2'],
        lead: 'C6:6 A5:3 F5:3 | E5:3 G5:3 C6:6 | D6:6 C6:3 Bb5:3 | A5:12 | Bb5:6 A5:3 G5:3 | F5:3 A5:3 D6:6 | D6:3 Bb5:3 E6:3 C6:3 | E6:6 C#6:3 A5:3',
        harm: true, arp: { pat: ARP_TRIP, oct: 4 }, pad: true, drums: 'WB+ WB WB WB WB WB WB WF',
      },
      WA2: {   // the A theme again with twin lead and soaring high strings
        ref: 'WA', harm: true, lead2: 'F6:12 | F6:12 | E6:12 | D6:12 | A5:12 | D6:12 | E6:12 | E6:12',
        drums: 'WA+ WA WA WA2 WA WA WA2 WF',
      },
      WC: {   // the eye of the storm: wind, long strings, then the lead climbs back in
        bars: 8, chords: 'Bb Bb C C Dm Dm A A', bass: 'LONG',
        lead: 'r:48 | D5:3 F5:3 A5:3 D6:3 | D6:3 A5:3 F5:3 A5:3 | E5:3 A5:3 C#6:3 E6:3 | E6:12',
        harm: true, mute: { harm: range(1, 4) },
        lead2: 'F5:12 | D5:12 | E5:12 | G5:12 | A5:12 | F5:12 | E5:12 | C#5:12',
        arp: { pat: ARP_TRIP, oct: 5, inst: 'bell' }, pad: true, drums: 'WCW+ WC WC WC WAW WA WA2 WR',
      },
    },
  },

  // ------------------------------------------------------------------ STORMBOSS: D minor / phrygian, 150 BPM, triplet grid
  stormboss: {
    bpm: 150, spb: 12, bassLow: 33, echo: { steps: 3, fb: 0.26, wet: 0.18 },
    inst: { pad: 'strings' }, mix: { stab: 0.28, pad: 0.12 },
    intro: ['ZI'], loop: ['ZA', 'ZB'],
    templates: {
      OST: 'R:1 R:1 O:1 R:1 R:1 3:1 R:1 R:1 +1:1 R:1 O:1 +6:1',
      OSTV: 'R:1 R:1 O:1 R:1 R:1 +4:1 R:1 R:1 +1:1 R:1 O:1 +7:1',
    },
    drums: {
      ZI1: { w: 'X', k: 'X.....X.....', x: 'X' },
      ZI2: { k: 'X.xX.xX.xX.x', s: '......ggxxXX' },
      ZA:  { k: 'X.xX.xX.xX.x', s: '...X.....X..', h: 'xggxggxggxgg' },
      ZA2: { k: 'X.xX.xX.xX.x', s: '...X..X..X.x', h: 'xggxggxggxgg' },
      ZB:  { k: 'X.xX.xX.xX.x', s: '...X.....X..', c: '...x.....x..', h: 'x.xx.xx.xx.x' },
      ZF:  { k: 'X.xX.x......', s: '...X..xxxXXX', tl: '......X..X..' },
    },
    sections: {
      ZI: { bars: 2, chords: 'Dm Dm', bass: 'OST', stab: 'X...........|0', drums: 'ZI1 ZI2' },
      ZA: {
        bars: 8, chords: 'Dm Dm Eb Dm Dm Dm Bb A', bass: 'OST', bassAlt: { A: 'OSTV' },
        lead: 'A4:3 D5:3 F5:3 A5:3 | A5:6 Bb5:3 A5:3 | G5:3 Bb5:3 Eb6:6 | D6:9 r:3 | F5:3 E5:3 F5:3 A5:3 | D6:3 C6:3 A5:3 F5:3 | F5:3 Bb5:3 D6:6 | C#6:6 E6:3 C#6:3',
        pad: true, stab: 'X.....X.....', drums: 'ZA+ ZA ZA ZA2 ZA ZA ZA ZF',
      },
      ZB: {
        bars: 8, chords: 'Gm Gm Dm Dm Eb Eb A A', bass: 'OST', bassAlt: { A: 'OSTV' },
        lead: 'G5:6 Bb5:3 D6:3 | D6:3 C6:3 Bb5:6 | A5:6 F5:3 D5:3 | F5:9 r:3 | G5:6 Bb5:3 Eb6:3 | D6:3 Eb6:3 Bb5:6 | C#6:3 A5:3 E5:3 A5:3 | C#6:6 D6:3 E6:3',
        harm: true, arp: { pat: ARP_TRIP, oct: 4 }, stab: 'X..X..X.....', drums: 'ZB+ ZB ZB ZB ZB ZB ZB ZF',
      },
    },
  },

  // ------------------------------------------------------------------ THRONE: level 4. C minor palace march, 100 BPM, organ
  throne: {
    bpm: 100, bassLow: 31, echo: { steps: 4, fb: 0.25, wet: 0.18 },
    inst: { stab: 'organ', pad: 'organ' }, mix: { stab: 0.3, pad: 0.12 },
    intro: ['HI'], loop: ['HA', 'HB', 'HC'],
    templates: { MARCH: 'R:3 R:1 5:4 R:3 R:1 O:4', MARCH2: 'R:3 R:1 5:4 O:3 5:1 R:4' },
    drums: {
      HI1: { G: 'X', tp: 'X.......X.......' },
      HI2: { tp: 'X..X..X.XxXxXXXX', s: '........gxgxxXXX' },
      HA:  { k: 'X.......X.......', s: '....X..g....X.gg', tp: 'X.......X.......' },
      HA2: { k: 'X.......X.......', s: 'g...X.gg..g.X.xx', tp: 'X.......X...X...' },
      HF:  { k: 'X.......X.......', s: '....X...gxgxXXXX', tp: '........X.X.XXXX' },
      HB:  { k: 'X...X...X...X...', s: '....X.......X..g', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      HC:  { k: 'X..X..X.X.......', tp: 'X..X..X.X.......', s: '....X.......X...' },
    },
    sections: {
      HI: {
        bars: 2, chords: 'Cm G', bassLine: 'C2:16 | G1:12 B1:4', pad: true,
        lead: 'r:16 | G4:3 G4:1 B4:4 D5:3 D5:1 G5:4', stab: 'X.......X.......|X..X..X.X.......', drums: 'HI1 HI2',
      },
      HA: {
        bars: 8, chords: 'Cm Cm Fm G Cm Ab Db G', bass: ['MARCH', 'MARCH', 'MARCH', 'MARCH2'],
        lead: [
          'C5:3 C5:1 G5:4 Eb5:3 D5:1 C5:4',        // pompous dotted strut
          'Eb5:3 F5:1 G5:4 C6:8',
          'Ab5:3 G5:1 F5:4 C5:3 Db5:1 C5:4',
          'B4:3 C5:1 D5:4 G5:8',
          'C6:3 G5:1 Eb5:4 C6:3 G5:1 Eb5:4',
          'C5:3 Eb5:1 Ab5:4 C6:8',
          'Db6:3 C6:1 Ab5:4 F5:3 Ab5:1 Db6:4',      // the Neapolitan: maximum pomp
          'B5:3 C6:1 D6:4 G5:8',
        ].join(' | '),
        stab: 'X..X....X..X....', drums: 'HA+ HA HA HA2 HA HA HA HF',
      },
      HB: {
        bars: 8, chords: 'Eb Bb/D Cm Ab Fm Bb Eb G', bass: ['MARCH', 'MARCH', 'MARCH', 'MARCH2'],
        lead: 'G5:4 Bb5:4 Eb6:6 D6:2 | F5:4 Bb5:4 D6:6 C6:2 | Eb6:6 D6:2 C6:4 G5:4 | Ab5:6 Bb5:2 C6:4 Ab5:4 | F5:3 G5:1 Ab5:4 C6:8 | D6:3 C6:1 Bb5:4 F5:8 | G5:3 F5:1 Eb5:4 Bb5:8 | D6:4 B5:4 G5:4 B4:4',
        harm: true, pad: true, arp: { pat: ARP_8TH, oct: 4 }, drums: 'HB+ HB HB HB HB HB HB HF',
      },
      HC: {   // the theme on full organ, with choir
        ref: 'HA', inst: { lead: 'organ' }, harm: true, choir: true,
        stab: 'X..X..X.X.......', drums: 'HC+ HC HC HC HC HC HC HF',
      },
    },
  },

  // ------------------------------------------------------------------ FINALBOSS: the Dragon King. D minor, 156 BPM, choir + organ
  finalboss: {
    bpm: 156, bassLow: 33, echo: { steps: 3, fb: 0.28, wet: 0.2 },
    inst: { lead2: 'strings' }, mix: { choir: 0.24, stab: 0.28, bass: 0.6 },
    intro: ['FI'], loop: ['FA', 'FB', 'FC', 'FD'],
    templates: {
      OST: 'R:1 O:1 R:1 R:1 O:1 R:1 3:1 R:1 +1:1 R:1 O:1 R:1 +6:1 5:1 3:1 +1:1',
      OSTV: 'R:1 O:1 R:1 R:1 O:1 R:1 +4:1 R:1 +1:1 R:1 O:1 R:1 +7:1 +5:1 +4:1 +1:1',
      DRIVE: 'R:1 R:1 O:1 R:1 R:1 R:1 O:1 R:1 R:1 R:1 O:1 R:1 5:1 R:1 O:1 5:1',
    },
    drums: {
      FI1: { G: 'X', tp: 'X' },
      FI2: { tp: 'X.......X.......' },
      FI3: { tp: 'X...X...X...X...', k: 'X...X...X...X...' },
      FI4: { tp: 'X.x.x.x.xxxxXXXX', s: 'ggggggggxxxxXXXX', k: 'X...X...X...X...' },
      FA:  { k: 'X.X.X.X.X.X.X.X.', s: '....X.......X...', h: 'xgxgxgxgxgxgxgxg' },
      FA2: { k: 'XXX.X.X.XXX.X.X.', s: '....X.......X..X', h: 'xgxgxgxgxgxgxgxg' },
      FB:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', tp: 'X.......X.......' },
      FC:  { k: 'X.......X.......', tp: 'X..X..X...X..X..', tm: '....x.......x...' },
      FC2: { k: 'X...X...X...X...', tp: 'X..X..X...X..X..', s: '....X.......X...' },
      FD:  { k: 'X.X.X.X.X.X.X.X.', s: '....X.......X...', c: '....X.......X...', h: 'XgxgXgxgXgxgXgxg' },
      FF:  { k: 'X...X...X.......', s: '....X...', th: '........XX', tm: '..........XX', tl: '............XXXX' },
      FR:  { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX', tp: '........xxxxXXXX' },
    },
    sections: {
      FI: {
        bars: 4, chords: 'Dm Dm Eb A', choir: true,
        bassLine: 'D2:16 | D2:12 D2:2 D2:2 | Eb2:16 | A1:4 A1:4 A1:2 A1:2 A1:2 A1:2',
        lead: 'r:32 | Bb4:4 Eb5:4 G5:8 | A5:8 C#6:8', stab: '0|0|X.......X.......|X...X...X...X...', drums: 'FI1 FI2 FI3 FI4',
      },
      FA: {   // the King's theme: wide leaps, b6 and the harmonic-minor turn
        bars: 8, chords: 'Dm Dm Bb A Dm Dm Eb A', bass: 'OST', bassAlt: { A: 'OSTV' },
        lead: 'D5:4 A5:4 Bb5:4 A5:4 | F5:2 E5:2 D5:2 C#5:2 D5:8 | D5:4 F5:4 Bb5:6 A5:2 | A5:4 G5:2 F5:2 E5:4 C#5:4 | D6:4 A5:4 Bb5:4 A5:4 | F5:2 G5:2 A5:2 Bb5:2 A5:8 | G5:4 Bb5:4 Eb6:6 D6:2 | C#6:8 E6:4 C#6:4',
        stab: 'X.....X...X.....', drums: 'FA+ FA FA FA2 FA FA FA FF',
      },
      FB: {
        bars: 8, chords: 'Gm Gm Dm Dm Eb Eb A A', bass: 'OST', bassAlt: { A: 'OSTV' },
        lead: 'G5:6 A5:2 Bb5:4 D6:4 | D6:4 Bb5:4 A5:4 G5:4 | F5:6 G5:2 A5:4 D6:4 | F6:4 E6:2 D6:2 A5:8 | G5:6 Bb5:2 Eb6:8 | D6:4 Eb6:2 D6:2 Bb5:8 | A5:4 C#6:4 E6:8 | D6:4 C#6:4 Bb5:4 A5:4',
        harm: true, choir: true, arp: { pat: UPDOWN, oct: 4 }, drums: 'FB+ FB FB FB FB FB FB FF',
      },
      FC: {   // breakdown: choir chant, organ stabs, timpani, strings rising
        bars: 8, chords: 'Dm Bb Gm A Dm Bb Eb A', bass: 'DRIVE', inst: { stab: 'organ' },
        lead2: 'r:64 | D5:16 | F5:16 | G5:16 | A5:8 C#6:8', choir: true,
        arp: { pat: ARP_EERIE, oct: 5, inst: 'bell' },
        stab: 'X..X..X.....X...|X..X..X.....X...|X..X..X.....X...|X..X..X.X..X..X.', drums: 'FC+ FC FC FC FC2 FC2 FC2 FR',
      },
      FD: {   // climax: Dodongo's rising-triad motif fights back
        bars: 8, chords: 'Bb C Dm Dm Bb C A A', bass: 'DRIVE',
        lead: 'D5:2 F5:2 Bb5:2 D6:6 C6:2 Bb5:2 | E5:2 G5:2 C6:2 E6:6 D6:2 C6:2 | D6:8 A5:4 F5:4 | A5:2 D6:2 F6:8 E6:2 D6:2 | D5:2 F5:2 Bb5:2 D6:6 C6:2 Bb5:2 | E5:2 G5:2 C6:2 E6:6 D6:2 E6:2 | C#6:6 D6:2 E6:8 | E6:4 D6:2 C#6:2 Bb5:2 A5:2 G5:2 E5:2',
        harm: true, choir: true, stab: 'X.....X...X.....', drums: 'FD+ FD FD FA2 FD FD FD FR',
      },
    },
  },
});

// ------------------------------------------------------------------ ENDING: the title anthem, triumphant then tender. C major, 100 BPM
SONGS.ending = {
  bpm: 100, bassLow: 31, echo: { steps: 3, fb: 0.32, wet: 0.26 },
  mix: { lead: 0.42, pad: 0.16 },
  intro: ['EI'], loop: ['EA', 'EB', 'EC', 'ED'],
  templates: { ...SONGS.title.templates, SOFT: 'R:6 5:2 O:4 5:4' },
  drums: { ...SONGS.title.drums, E0: {}, EX: { x: 'x' }, ES: { sh: '..x...x...x...x.' }, ES2: { sh: '..x...x...x...x.', wb: '............x...' } },
  sections: {
    EI: SONGS.title.sections.TI,
    EA: { ...SONGS.title.sections.TA, harm: true, mute: { harm: range(1, 4) } },
    EB: SONGS.title.sections.TB,
    EC: {   // tender: the anthem on flute over strings and a music box, no drums
      ...SONGS.title.sections.TA, lead2: null, bass: 'SOFT',
      inst: { lead: 'flute', bass: 'softbass', pad: 'strings', arp: 'celesta' },
      arp: { pat: ARP_8TH, oct: 5 }, drums: 'EX E0 ES ES ES ES ES ES2',
    },
    ED: {   // tender B on strings; the fanfare bars and a drum roll lift it back to the triumphant top
      ...SONGS.title.sections.TB, bass: 'SOFT', harm: true, mute: { harm: range(1, 6) },
      inst: { lead: 'strings', bass: 'softbass', pad: 'strings', arp: 'celesta' },
      arp: { pat: ARP_8TH, oct: 5 }, drums: 'ES ES ES ES ES ES2 TR1 TR2',
    },
  },
};

// ------------------------------------------------------------------ SKY DUEL: the title anthem as a heroic flight. C major, 150 BPM
// (the finale's sky duel, src/skyduel.js) The anthem over the final boss's driving bass and drums; a danger turn in A
// minor with the King's harmonic-minor leading tone; then Dodongo's rising-triad motif from the final boss, now major
// and soaring.
SONGS.skyduel = {
  bpm: 150, bassLow: 31, echo: { steps: 3, fb: 0.3, wet: 0.22 },
  inst: { lead2: 'strings' }, mix: { lead: 0.42, choir: 0.2, stab: 0.26, bass: 0.6 },
  intro: ['SI'], loop: ['SA', 'SB', 'SC', 'SD'],
  templates: { ...SONGS.title.templates, DRIVE: SONGS.finalboss.templates.DRIVE },
  drums: { ...SONGS.title.drums, FA: SONGS.finalboss.drums.FA, FA2: SONGS.finalboss.drums.FA2, FB: SONGS.finalboss.drums.FB,
    FD: SONGS.finalboss.drums.FD, FF: SONGS.finalboss.drums.FF, FR: SONGS.finalboss.drums.FR },
  sections: {
    SI: { ...SONGS.title.sections.TI, drums: 'TR1+ TR2' },
    SA: { ...SONGS.title.sections.TA, bass: 'DRIVE', harm: true, drums: 'FA+ FA FA FA2 FA FA FA FF' },
    SB: { ...SONGS.title.sections.TB, bass: 'DRIVE', choir: true, drums: 'FB+ FB FB FB FB FB TR1 TR2' },
    SC: {   // the danger turn: the anthem's head in A minor
      bars: 8, chords: 'Am F Dm E Am F Bb E', bass: 'DRIVE', stab: 'X.....X...X.....', choir: true,
      lead: 'A4:4 C5:6 D5:2 E5:4 | F5:6 E5:2 C5:8 | D5:4 F5:6 G5:2 A5:4 | G#5:8 B5:4 E5:4 | A5:4 C6:6 D6:2 E6:4 | F6:6 E6:2 C6:8 | D6:4 F6:4 Bb5:6 A5:2 | G#5:8 B5:8',
      arp: { pat: ARP_EERIE, oct: 4 }, drums: 'FD+ FD FD FA2 FD FD FD FR',
    },
    SD: {   // Dodongo's rising triads, major and soaring
      bars: 8, chords: 'F G C Am F G C C', bass: 'DRIVE', harm: true, choir: true,
      lead: 'C5:2 F5:2 A5:2 C6:6 Bb5:2 A5:2 | D5:2 G5:2 B5:2 D6:6 C6:2 B5:2 | C6:8 G5:4 E5:4 | A5:2 C6:2 E6:8 D6:2 C6:2 | C5:2 F5:2 A5:2 C6:6 Bb5:2 A5:2 | D5:2 G5:2 B5:2 D6:6 C6:2 D6:2 | E6:6 D6:2 C6:8 | C6:4 G5:2 E5:2 C5:2 E5:2 G5:2 C6:2',
      arp: { pat: UPDOWN, oct: 4 }, pad: true, drums: 'FA+ FA FA FA2 FA FA FD FR',
    },
  },
};

// ------------------------------------------------------------------ v2 jingles
Object.assign(JDRUMS, {
  JN:  { tl: 'X', x: '......x' },
  PW:  { w: 'X' },
  FB1: { tl: '........x.x.xgxg' },
  VT1: { k: 'X..X..X.X.......', tl: '........x.x.xgxg', x: 'X' },
  VT2: { k: 'X..X..X.X.......', s: '........gxgxxXXX' },
  VF:  { k: 'X...X...X...X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', tp: 'X.......' },
  VX:  { k: 'X...............', x: 'X...............', tp: 'X...X...' },
});
Object.assign(JINGLES, {
  levelclear: {   // the clear fanfare extended: IV - V - bVI,bVII - I
    bpm: 150, bassLow: 31, sec: {
      bars: 4, chords: 'G A Bb,C D',
      lead: 'B4:2 D5:2 G5:2 B5:6 G5:2 B5:2 | C#5:2 E5:2 A5:2 C#6:6 A5:2 C#6:2 | F5:2 r:1 F5:1 Bb5:4 G5:2 r:1 G5:1 C6:4 | D6:12 r:4', harm: true,
      bass: 'R:2 O:2 R:2 O:2 R:2 O:2 R:2 O:2', bassBars: { 3: 'Bb1:2 r:1 Bb1:1 Bb1:4 C2:2 r:1 C2:1 C2:4', 4: 'D2:2 D3:2 D2:8 r:4' },
      arp: { pat: UPDOWN, oct: 5 }, mute: { arp: [3, 4], pad: [1, 2, 3] }, pad: true,
      stab: '0|0|X..XX...X..XX...|X...............', drums: 'CL CL2 JR JX',
    },
  },
  save: {   // waystone: a celesta run up an Fmaj7 with a bell halo (ducks the music)
    level: 3.1, bpm: 120, duck: true, inst: { lead: 'celesta', lead2: 'bell', pad: 'strings' }, mix: { lead: 0.45, lead2: 0.25, pad: 0.16 }, sec: {
      bars: 1, chords: 'Fmaj7', lead: 'F5:1 A5:1 C6:1 E6:1 F6:1 A6:1 C7:2 A6:8', lead2: 'r:8 F6:8', pad: true, drums: '',
    },
  },
  join: {   // player 2 warps in (ducks the music)
    level: 2.8, bpm: 150, duck: true, inst: { lead: 'pluck', lead2: 'bell' }, sec: {
      bars: 1, chords: 'D', lead: 'D5:1 F#5:1 A5:1 D6:1 F#6:1 A6:1 D7:2 r:8', lead2: 'r:6 A6:2 D7:8', stab: '......X', drums: 'JN',
    },
  },
  portal: {   // whole-tone crystal run over an augmented chord (ducks the music)
    level: 3.8, bpm: 100, duck: true, inst: { lead: 'bell', pad: 'strings' }, sec: {
      bars: 1, chords: 'Caug', lead: 'C5:1 D5:1 E5:1 F#5:1 G#5:1 A#5:1 C6:1 D6:1 E6:8', pad: true, drums: 'PW',
    },
  },
  freed_big: {   // a boss is freed: gentle, glowing bVI-bVII-I
    bpm: 120, inst: { lead: 'bell', harm: 'strings', bass: 'softbass' }, sec: {
      bars: 2, chords: 'Bb,C D', lead: 'D5:2 F5:2 Bb5:4 E5:2 G5:2 C6:4 | D6:12 r:4', harm: true, pad: true,
      arp: { pat: UPDOWN, oct: 5 }, bassLine: 'Bb1:8 C2:8 | D2:16', drums: 'FB1 JX',
    },
  },
  victory_final: {   // the title fanfare, full orchestra, resolving to C
    bpm: 112, bassLow: 31, sec: {
      bars: 4, chords: 'Ab Bb F,G C',
      lead: 'Eb5:3 Eb5:3 Eb5:2 Ab5:8 | F5:3 F5:3 F5:2 Bb5:8 | A5:4 C6:4 B5:4 D6:4 | E6:12 r:4', harm: true,
      bassLine: 'Ab1:3 Ab1:3 Ab1:2 Ab1:8 | Bb1:3 Bb1:3 Bb1:2 Bb1:8 | F1:4 F2:4 G1:4 G2:4 | C2:4 C3:4 C2:8',
      stab: 'X..X..X.X.......|X..X..X.X.......|X.......X.......|X...............', pad: true, mute: { pad: [1, 2] },
      arp: { pat: UPDOWN, oct: 5 }, drums: 'VT1 VT2 VF VX',
    },
  },
});

// ----------------------------------------------------------------------------------------------- compiler
function parseLine(str, total, label, errs, spb = 16) {
  const out = [];
  let pos = 0, last = null;
  for (let tok of String(str).trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') {
      if (pos % spb) errs.push(`${label}: bar line at step ${pos} is not on a bar boundary`);
      continue;
    }
    let acc = false;
    if (tok.endsWith('!')) { acc = true; tok = tok.slice(0, -1); }
    const [body, ls] = tok.split(':');
    const len = ls === undefined ? 1 : parseInt(ls, 10);
    if (!(len > 0)) { errs.push(`${label}: bad length "${tok}"`); continue; }
    if (body === 'r') last = null;
    else if (body === '~') { if (last) last.len += len; }
    else {
      const n = noteNum(body);
      if (n == null) errs.push(`${label}: bad note "${body}"`);
      else { last = { step: pos, note: n, len, acc }; out.push(last); }
    }
    pos += len;
  }
  if (total != null && pos !== total) errs.push(`${label}: ${pos} steps, expected ${total}`);
  return out;
}

function parseTpl(str, label, errs, spb = 16) {
  const items = [];
  let pos = 0;
  for (const tok of String(str).trim().split(/\s+/)) {
    const [t, ls] = tok.split(':');
    const len = ls === undefined ? 1 : parseInt(ls, 10);
    items.push({ t, len, at: pos });
    pos += len;
  }
  if (pos !== spb) errs.push(`${label}: bass template is ${pos} steps, expected ${spb}`);
  return items;
}

const padPat = (s, n = 16) => (s || '').padEnd(n, '.').slice(0, n);
const VEL = { X: 1, x: 0.72, g: 0.38 };

// Close voicing of a chord starting at/above `low`, choosing the inversion nearest the previous voicing.
function voicing(ch, prev, low) {
  const ivs = ch.iv.filter((i) => i < 12);
  let best = null, bestCost = Infinity;
  for (let inv = 0; inv < ivs.length; inv++) {
    const order = ivs.slice(inv).concat(ivs.slice(0, inv));
    const notes = [];
    let cur = low - 1;
    for (const i of order) {
      let n = cur + 1;
      while (mod12(n) !== (ch.root + i) % 12) n++;
      notes.push(n); cur = n;
    }
    const cost = prev ? notes.reduce((s, n, k) => s + Math.abs(n - prev[Math.min(k, prev.length - 1)]), 0) : notes[0] - low;
    if (cost < bestCost) { bestCost = cost; best = notes; }
  }
  return best;
}

// Twin-lead harmony: nearest chord tone at least a minor 3rd below the melody note.
function harmBelow(n, ch) {
  for (let m = n - 3; m > n - 13; m--) if (ch.pcs.has(mod12(m))) return m;
  return n - 12;
}

function compileSection(song, sec, errs, label) {
  const SPB = song.spb || 16, BEAT = SPB / 4;    // steps per bar / per beat (16ths, or 12 = triplet grid)
  const bars = sec.bars, N = bars * SPB;
  const ev = Array.from({ length: N }, () => []);
  const lint = [];
  const inst = { ...INSTS, ...(song.inst || {}), ...(sec.inst || {}) };
  if (sec.leadInst) inst.lead = sec.leadInst;
  const muted = (ch, step) => !!(sec.mute && sec.mute[ch] && sec.mute[ch].includes(Math.floor(step / SPB) + 1));
  const push = (step, e) => { if (step < N && !muted(e.ch, step)) ev[step].push(e); };
  // "X Y,Z ..." -> one entry per bar, commas split a bar evenly
  const perBar = (str, what, conv) => {
    const out = new Array(N);
    const toks = String(str || '').trim().split(/\s+/).filter((t) => t && t !== '|');
    if (toks.length !== bars) errs.push(`${label}.${what}: ${toks.length} bars, expected ${bars}`);
    toks.forEach((tok, b) => {
      const parts = tok.split(',');
      if (SPB % parts.length) errs.push(`${label}.${what}: bar ${b + 1} cannot split ${SPB} steps ${parts.length} ways`);
      const len = Math.floor(SPB / parts.length);
      parts.forEach((p, i) => { const v = conv(p); for (let s = 0; s < len; s++) out[b * SPB + i * len + s] = v; });
    });
    return out;
  };

  // chords
  const chordAt = perBar(sec.chords, 'chords', (p) => parseChord(p) || (errs.push(`${label}.chords: bad chord "${p}"`), parseChord('C')));
  for (let s = 0; s < N; s++) if (!chordAt[s]) chordAt[s] = chordAt[s - 1] || parseChord('C');

  // melodic lines
  const leadNotes = sec.lead ? parseLine(sec.lead, N, `${label}.lead`, errs, SPB) : [];
  for (const n of leadNotes) {
    push(n.step, { ch: 'lead', inst: inst.lead, notes: [n.note], len: n.len, vel: n.acc ? 1.15 : 1 });
    lint.push({ ch: 'lead', step: n.step, note: n.note, len: n.len, chord: chordAt[n.step] });
  }
  if (sec.lead2) for (const n of parseLine(sec.lead2, N, `${label}.lead2`, errs, SPB)) {
    push(n.step, { ch: 'lead2', inst: inst.lead2, notes: [n.note], len: n.len, vel: 1 });
    lint.push({ ch: 'lead2', step: n.step, note: n.note, len: n.len, chord: chordAt[n.step] });
  }
  if (sec.harm) for (const n of leadNotes) {
    push(n.step, { ch: 'harm', inst: inst.harm, notes: [harmBelow(n.note, chordAt[n.step])], len: n.len, vel: 1 });
  }

  // bass
  const bassInst = inst.bass;
  const bassVel = (step) => (step % BEAT === 0 ? 1 : 0.84);
  if (sec.bassLine) {
    for (const n of parseLine(sec.bassLine, N, `${label}.bassLine`, errs, SPB)) push(n.step, { ch: 'bass', inst: bassInst, notes: [n.note], len: n.len, vel: bassVel(n.step) });
  } else if (sec.bass) {
    const low = sec.bassLow ?? song.bassLow ?? 33;
    const rootAt = sec.roots ? perBar(sec.roots, 'roots', (p) => { const n = noteNum(p); if (n == null) errs.push(`${label}.roots: bad note "${p}"`); return n ?? 36; }) : null;
    const tpls = song.templates || {};
    const tplCache = {};
    const getTpl = (src) => tplCache[src] || (tplCache[src] = parseTpl(tpls[src] || src, `${label}.bass`, errs, SPB));
    for (let b = 0; b < bars; b++) {
      const over = sec.bassBars && sec.bassBars[b + 1];
      if (over) {
        for (const n of parseLine(over, SPB, `${label}.bassBars[${b + 1}]`, errs, SPB)) push(b * SPB + n.step, { ch: 'bass', inst: bassInst, notes: [n.note], len: n.len, vel: bassVel(n.step) });
        continue;
      }
      const ch0 = chordAt[b * SPB];
      const base = Array.isArray(sec.bass) ? sec.bass[b % sec.bass.length] : sec.bass;   // arrays cycle per bar
      const tplSrc = (sec.bassAlt && sec.bassAlt[ch0.sym]) || base;
      for (const it of getTpl(tplSrc)) {
        if (it.t === 'r') continue;
        const st = b * SPB + it.at;
        const ch = chordAt[st];
        const root = rootAt ? rootAt[st] : low + mod12(ch.bass - low);
        const above = (pc) => { let n = root + mod12(pc - root); if (n === root) n += 12; return n; };
        let n;
        if (it.t === 'R') n = root;
        else if (it.t === 'O') n = root + 12;
        else if (it.t === '5') n = above(ch.root + 7);
        else if (it.t === '3') n = above(ch.root + (ch.iv.includes(4) ? 4 : ch.iv.includes(3) ? 3 : 5));
        else if (it.t === 'b7') n = root + 10;
        else if (/^[+-]\d+$/.test(it.t)) n = root + parseInt(it.t, 10);
        else n = noteNum(it.t);
        if (n == null) { errs.push(`${label}.bass: bad token "${it.t}"`); continue; }
        push(st, { ch: 'bass', inst: bassInst, notes: [n], len: it.len, vel: bassVel(st) });
      }
    }
  }

  // arpeggio (chord tones, re-voiced on every chord change)
  if (sec.arp) {
    const pat = sec.arp.pat.trim().split(/\s+/);
    for (let s = 0; s < N; s++) {
      const idx = pat[s % pat.length];
      if (idx === '.') continue;
      const ch = chordAt[s];
      const ivs = ch.iv.filter((i) => i < 12);
      const base = 12 * (sec.arp.oct + 1) + ch.root;
      const list = [];
      for (let o = 0; o < 4; o++) for (const i of ivs) list.push(base + 12 * o + i);
      push(s, { ch: 'arp', inst: sec.arp.inst || inst.arp, notes: [list[+idx] ?? base], len: sec.arp.len || 1, vel: s % BEAT === 0 ? 1 : 0.78 });
    }
  }

  // pad and choir (voice-led sustained chords)
  for (const [flag, low] of [['pad', 55], ['choir', 57]]) {
    if (!sec[flag]) continue;
    let prev = null;
    for (let s = 0; s < N; s++) {
      if (s > 0 && chordAt[s] === chordAt[s - 1]) continue;
      let e = s + 1;
      while (e < N && chordAt[e] === chordAt[s]) e++;
      const v = voicing(chordAt[s], prev, sec[flag + 'Low'] ?? low);
      prev = v;
      push(s, { ch: flag, inst: inst[flag], notes: v, len: e - s, vel: 1 });
    }
  }

  // chord stabs
  if (sec.stab) {
    const pats = sec.stab.split('|').map((p) => p.trim());
    let prev = null;
    for (let b = 0; b < bars; b++) {
      const p = pats[b % pats.length];
      if (p === '0' || !p) continue;
      const row = padPat(p, SPB);
      for (let i = 0; i < SPB; i++) {
        const c = row[i];
        if (c === '.') continue;
        const s = b * SPB + i;
        const v = voicing(chordAt[s], prev, sec.stabLow ?? 62);
        prev = v;
        push(s, { ch: 'stab', inst: inst.stab, notes: v, len: 2, vel: VEL[c] || 0.7 });
      }
    }
  }

  // drums
  const names = String(sec.drums || '').trim().split(/\s+/).filter(Boolean);
  if (names.length && names.length !== bars) errs.push(`${label}.drums: ${names.length} bars, expected ${bars}`);
  const kit = song.drums || {};
  names.forEach((nm, b) => {
    const crash = nm.endsWith('+');
    const key = crash ? nm.slice(0, -1) : nm;
    const pat = kit[key];
    if (!pat) { errs.push(`${label}.drums: unknown pattern "${key}"`); return; }
    if (crash) push(b * SPB, { ch: 'drums', d: 'x', vel: 1 });
    for (const lane of Object.keys(pat)) {
      if (!DRUM[lane]) { errs.push(`${label}.drums: unknown lane "${lane}"`); continue; }
      if ((pat[lane] || '').length > SPB) errs.push(`${label}.drums: pattern ${key}.${lane} longer than ${SPB} steps`);
      const row = padPat(pat[lane], SPB);
      for (let i = 0; i < SPB; i++) if (row[i] !== '.') push(b * SPB + i, { ch: 'drums', d: lane, vel: VEL[row[i]] || 0.7 });
    }
  });
  return { N, ev, lint, chordAt };
}

const compiled = {};
const compileErrors = [];
function compileSong(key, def, once) {
  const errs = [];
  const spb = def.spb || 16;
  const sd = 60 / def.bpm / (spb / 4);
  const order = once ? ['_'] : [...(def.intro || []), ...def.loop];
  const secs = once ? { _: def.sec } : def.sections;
  const song = { ...def, drums: once ? JDRUMS : def.drums };
  const cache = {};
  const ev = [];
  const lint = [];
  let loopStart = 0;
  order.forEach((sn, i) => {
    if (!once && i === (def.intro || []).length) loopStart = ev.length;
    if (!secs[sn]) { errs.push(`${key}: unknown section ${sn}`); return; }
    // `ref: 'X'` reuses section X with the listed fields overridden
    const resolve = (x, d = 0) => (x && x.ref && d < 4 ? { ...resolve(secs[x.ref], d + 1), ...x, ref: undefined } : x);
    const c = cache[sn] || (cache[sn] = compileSection(song, resolve(secs[sn]), errs, `${key}.${sn}`));
    for (const l of c.lint) lint.push({ ...l, sec: sn, step: l.step, abs: ev.length + l.step });
    for (const step of c.ev) ev.push(step);
  });
  for (const e of errs) compileErrors.push(e);
  return {
    key, once, bpm: def.bpm, spb, sd, steps: ev.length, loopStart, ev, lint, errs, duck: !!def.duck,
    mix: { ...MIX, ...(def.mix || {}) }, pan: { ...PAN, ...(def.pan || {}) }, echo: def.echo || null,
    level: def.level ?? (once ? 1.4 : 1),   // jingles are events: ~3 dB over the music
  };
}
function getSong(name) {
  const k = 'm:' + name;
  if (!compiled[k] && SONGS[name]) compiled[k] = compileSong(name, SONGS[name], false);
  return compiled[k] || null;
}
function getJingle(name) {
  const k = 'j:' + name;
  if (!compiled[k] && JINGLES[name]) compiled[k] = compileSong(name, JINGLES[name], true);
  return compiled[k] || null;
}

// ----------------------------------------------------------------------------------------------- instruments
// 2-operator FM voice (modulator -> carrier frequency) with an index envelope, optional detuned carrier pair,
// pitch scoop and delayed vibrato.  P: r ratio, i0/ip/i1 index (start / peak / sustain), ia index attack,
// id index decay tau, a attack, d decay tau, s sustain level, rel release tau, g gain, det cents, cw/mw waves.
function fmVoice(E, out, t, dur, f, vel, P) {
  const c = E.ctx;
  const a = Math.min(P.a, dur * 0.5);
  const end = t + Math.max(dur, a + 0.005);
  const stop = end + P.rel * 5 + 0.02;
  const peak = vel * P.g;
  const amp = c.createGain();
  const ag = amp.gain;
  ag.setValueAtTime(0, t);
  ag.linearRampToValueAtTime(peak, t + a);
  if (P.s < 1) ag.setTargetAtTime(peak * P.s, t + a, P.d);
  ag.setTargetAtTime(0, end, P.rel);
  amp.connect(out);

  const fm = f * P.r;
  const ks = Math.min(1, MAX_DEV / (Math.max(P.i0, P.ip || 0) * fm));   // index key scaling
  const mod = c.createOscillator();
  if (P.mw) mod.type = P.mw;
  mod.frequency.value = fm;
  const mg = c.createGain();
  const mgg = mg.gain;
  mgg.setValueAtTime(P.i0 * fm * ks, t);
  if (P.ia) { mgg.linearRampToValueAtTime(P.ip * fm * ks, t + P.ia); mgg.setTargetAtTime(P.i1 * fm * ks, t + P.ia, P.id); }
  else mgg.setTargetAtTime(P.i1 * fm * ks, t, P.id);
  mod.connect(mg);
  mod.start(t); mod.stop(stop);

  let vib = null;
  if (P.vib && dur > 0.3) {
    const lfo = c.createOscillator();
    lfo.frequency.value = P.vib[0];
    vib = c.createGain();
    vib.gain.setValueAtTime(0, t);
    vib.gain.setValueAtTime(0, t + 0.16);
    vib.gain.linearRampToValueAtTime(P.vib[1], t + 0.42);
    lfo.connect(vib);
    lfo.start(t); lfo.stop(stop);
  }
  const dets = P.det ? [-P.det / 2, P.det / 2] : [0];
  const parts = P.parts || ONE_PART;   // [ratio, gain] carriers: drawbar-style additive stacks (organ)
  for (const d of dets) {
    for (const [ratio, pg] of parts) {
      const car = c.createOscillator();
      if (P.cw) car.type = P.cw;
      car.frequency.value = f * ratio;
      if (P.scoop) { car.detune.setValueAtTime(d - P.scoop, t); car.detune.linearRampToValueAtTime(d, t + 0.045); }
      else car.detune.value = d;
      mg.connect(car.frequency);
      if (vib) vib.connect(car.detune);
      if (pg !== 1) { const pn = c.createGain(); pn.gain.value = pg; car.connect(pn); pn.connect(amp); }
      else car.connect(amp);
      car.start(t); car.stop(stop);
    }
  }
}
const ONE_PART = [[1, 1]];
const preset = (P) => (E, out, t, dur, f, vel) => fmVoice(E, out, t, dur, f, vel, P);
const INST = {
  // slap-ish FM bass: bright index burst that settles; carrier pair-free so the low end stays tight
  bass:     preset({ r: 1, i0: 5.5, i1: 1.3, id: 0.07, a: 0.003, d: 0.3, s: 0.55, rel: 0.03, g: 0.9 }),
  softbass: preset({ r: 1, i0: 1.4, i1: 0.5, id: 0.2, a: 0.02, d: 0.6, s: 0.7, rel: 0.12, g: 0.8 }),
  // FM brass: index swells on attack (the "blat"), detuned pair, scoop + delayed vibrato
  brass:    preset({ r: 1, i0: 0.7, ip: 3.0, ia: 0.035, i1: 1.9, id: 0.22, a: 0.012, d: 0.5, s: 0.78, rel: 0.07, g: 0.5, det: 9, scoop: 24, vib: [5.6, 13] }),
  brass2:   preset({ r: 1, i0: 0.6, ip: 2.6, ia: 0.04, i1: 1.6, id: 0.22, a: 0.014, d: 0.5, s: 0.75, rel: 0.07, g: 0.46, det: 13, vib: [5.2, 10] }),
  bell:     preset({ r: 3.5, i0: 3.2, i1: 0.35, id: 0.25, a: 0.002, d: 0.45, s: 0, rel: 0.22, g: 0.5 }),
  pluck:    preset({ r: 2, i0: 2.6, i1: 0.2, id: 0.05, a: 0.002, d: 0.11, s: 0, rel: 0.05, g: 0.6 }),
  pad:      preset({ r: 1, i0: 0.9, i1: 0.9, id: 1, a: 0.14, d: 1, s: 1, rel: 0.28, g: 0.34, det: 14, cw: 'triangle' }),
  stab:     preset({ r: 1, i0: 4.5, i1: 1.3, id: 0.07, a: 0.004, d: 0.12, s: 0.3, rel: 0.06, g: 0.58, det: 14 }),
};

Object.assign(INST, {
  chug:    preset({ r: 1, i0: 4, i1: 0.8, id: 0.03, a: 0.002, d: 0.06, s: 0, rel: 0.02, g: 1 }),          // palm-muted minecart bass
  organ:   preset({ r: 1, i0: 0.25, i1: 0.25, id: 1, a: 0.006, d: 1, s: 1, rel: 0.07, g: 0.2,
    parts: [[1, 1], [2, 0.55], [3, 0.25], [4, 0.3]] }),                                                       // 8' 4' 2-2/3' 2' drawbars
  choir:   preset({ r: 1, i0: 1.6, ip: 2.2, ia: 0.25, i1: 1.8, id: 0.5, a: 0.22, d: 1, s: 0.9, rel: 0.4, g: 0.34, det: 16, vib: [5.2, 14] }),
  strings: preset({ r: 1, i0: 0.8, ip: 1.8, ia: 0.12, i1: 1.3, id: 0.4, a: 0.1, d: 0.6, s: 0.9, rel: 0.3, g: 0.4, det: 16, vib: [5.6, 12] }),
  celesta: preset({ r: 4, i0: 2.2, i1: 0.3, id: 0.15, a: 0.002, d: 0.5, s: 0, rel: 0.3, g: 0.45 }),
  flute:   preset({ r: 1, i0: 0.5, ip: 0.9, ia: 0.06, i1: 0.35, id: 0.2, a: 0.06, d: 0.5, s: 0.85, rel: 0.15, g: 0.5, vib: [5, 11], scoop: 10 }),
});

// ----------------------------------------------------------------------------------------------- drums
function nzHit(E, out, t, o) {
  const c = E.ctx;
  const src = c.createBufferSource();
  src.buffer = E.noise; src.loop = true;
  let n = src;
  for (const [type, f] of [['highpass', o.hp], ['bandpass', o.bp], ['lowpass', o.lp]]) {
    if (!f) continue;
    const bq = c.createBiquadFilter();
    bq.type = type; bq.frequency.value = f; bq.Q.value = o.q || 0.8;
    n.connect(bq); n = bq;
  }
  const g = c.createGain();
  g.gain.setValueAtTime(o.g, t);
  g.gain.exponentialRampToValueAtTime(0.0004, t + o.dur);
  n.connect(g); g.connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.01);
  return g;
}
function pHit(E, out, t, o) {
  const c = E.ctx;
  const osc = c.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.ft);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.g, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0004, t + o.dur);
  osc.connect(g); g.connect(out);
  osc.start(t); osc.stop(t + o.dur + 0.01);
}
const DRUM = {
  k(E, o, t, v) {   // kick: pitch-swept sine + click
    pHit(E, o, t, { f0: 165, f1: 55, ft: 0.055, f2: 40, dur: 0.34, g: v });
    nzHit(E, o, t, { hp: 2500, dur: 0.012, g: 0.22 * v });
  },
  s(E, o, t, v) {   // snare: noise burst + tone
    nzHit(E, o, t, { hp: 1100, lp: 9000, dur: 0.19, g: 0.5 * v });
    pHit(E, o, t, { type: 'triangle', f0: 240, f1: 170, ft: 0.05, dur: 0.1, g: 0.5 * v });
  },
  c(E, o, t, v) {   // clap: three quick noise bursts and a short tail
    const c = E.ctx;
    const src = c.createBufferSource(); src.buffer = E.noise; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 1.1;
    const g = c.createGain(); const gg = g.gain;
    gg.setValueAtTime(0, t);
    for (const dt of [0, 0.011, 0.022]) { gg.setValueAtTime(0.55 * v, t + dt); gg.setTargetAtTime(0.02, t + dt + 0.0005, 0.0035); }
    gg.setValueAtTime(0.5 * v, t + 0.033);
    gg.exponentialRampToValueAtTime(0.0004, t + 0.2);
    src.connect(bp); bp.connect(g); g.connect(o);
    src.start(t, Math.random() * 1.5); src.stop(t + 0.21);
  },
  h(E, o, t, v) { nzHit(E, o, t, { hp: 7500, dur: 0.045, g: 0.24 * v }); },
  o(E, o, t, v) { nzHit(E, o, t, { hp: 6500, dur: 0.28, g: 0.18 * v }); },
  x(E, o, t, v) {   // crash
    nzHit(E, o, t, { hp: 4200, dur: 1.4, g: 0.22 * v });
    nzHit(E, o, t, { bp: 9000, q: 0.6, dur: 0.9, g: 0.12 * v });
  },
  th(E, o, t, v) { pHit(E, o, t, { f0: 250, f1: 160, ft: 0.08, f2: 140, dur: 0.26, g: 0.55 * v }); },
  tm(E, o, t, v) { pHit(E, o, t, { f0: 180, f1: 115, ft: 0.08, f2: 100, dur: 0.3, g: 0.58 * v }); },
  tl(E, o, t, v) { pHit(E, o, t, { f0: 125, f1: 76, ft: 0.09, f2: 66, dur: 0.38, g: 0.62 * v }); },
};

function fmHit(E, out, t, o) {   // percussive 2-op FM strike (anvil, gong)
  const c = E.ctx;
  const car = c.createOscillator(); car.frequency.value = o.f;
  const mod = c.createOscillator(); const fm = o.f * o.r; mod.frequency.value = fm;
  const ks = Math.min(1, MAX_DEV / (Math.max(o.i0, o.i1) * fm));
  const mg = c.createGain();
  mg.gain.setValueAtTime(o.i0 * fm * ks, t); mg.gain.setTargetAtTime(o.i1 * fm * ks, t, o.id);
  mod.connect(mg); mg.connect(car.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.g, t + (o.a || 0.002));
  g.gain.exponentialRampToValueAtTime(0.0004, t + o.dur);
  car.connect(g); g.connect(out);
  car.start(t); mod.start(t); car.stop(t + o.dur + 0.01); mod.stop(t + o.dur + 0.01);
}
Object.assign(DRUM, {
  a(E, o, t, v) {   // anvil: inharmonic FM ring + strike
    fmHit(E, o, t, { f: 1150, r: 1.41, i0: 5, i1: 0.6, id: 0.05, dur: 0.45, g: 0.3 * v });
    fmHit(E, o, t, { f: 2780, r: 1.2, i0: 2, i1: 0.2, id: 0.04, dur: 0.25, g: 0.1 * v });
    nzHit(E, o, t, { hp: 3000, dur: 0.02, g: 0.3 * v });
  },
  q(E, o, t, v) {   // minecart rail clack
    nzHit(E, o, t, { bp: 2200, q: 2, dur: 0.025, g: 0.32 * v });
    pHit(E, o, t, { f0: 900, f1: 600, ft: 0.015, dur: 0.02, g: 0.12 * v });
  },
  G(E, o, t, v) {   // gong: low inharmonic FM that blooms
    fmHit(E, o, t, { f: 98, r: 1.41, i0: 1.2, i1: 3.2, id: 0.5, dur: 3.2, g: 0.4 * v, a: 0.01 });
    fmHit(E, o, t, { f: 147, r: 2.76, i0: 1, i1: 2, id: 0.6, dur: 2.4, g: 0.16 * v, a: 0.02 });
    nzHit(E, o, t, { lp: 1500, dur: 0.12, g: 0.3 * v });
    pHit(E, o, t, { f0: 62, f1: 48, ft: 0.3, dur: 0.7, g: 0.4 * v });
  },
  w(E, o, t, v) {   // wind swell (~2.8 s)
    const c = E.ctx;
    const src = c.createBufferSource(); src.buffer = E.noise; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1400, t + 1.2); bp.frequency.exponentialRampToValueAtTime(450, t + 2.7);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3 * v, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0004, t + 2.8);
    src.connect(bp); bp.connect(g); g.connect(o);
    src.start(t, Math.random() * 1.5); src.stop(t + 2.85);
  },
  tp(E, o, t, v) {   // timpani
    pHit(E, o, t, { f0: 92, f1: 82, ft: 0.08, f2: 78, dur: 0.9, g: 0.7 * v });
    pHit(E, o, t, { f0: 140, f1: 126, ft: 0.08, dur: 0.6, g: 0.22 * v });
    nzHit(E, o, t, { lp: 600, dur: 0.08, g: 0.3 * v });
  },
  sh(E, o, t, v) { nzHit(E, o, t, { hp: 6000, dur: 0.05, g: 0.12 * v }); },     // shaker
  wb(E, o, t, v) {   // woodblock
    pHit(E, o, t, { f0: 1300, f1: 1200, ft: 0.01, dur: 0.06, g: 0.3 * v });
    nzHit(E, o, t, { bp: 2500, q: 3, dur: 0.01, g: 0.15 * v });
  },
});

// ----------------------------------------------------------------------------------------------- sfx toolkit
// Every time and frequency is scaled by the voice pitch p (playback-rate-like: p = 2 is an octave up and twice as fast).
const rnd = (a, b) => a + Math.random() * (b - a);
class Fx {
  constructor(E, out, t, p) {
    this.E = E; this.c = E.ctx; this.out = out; this.t = t; this.p = p; this.k = 1 / p;
    this.end = t; this.last = null; this.srcs = []; this.hold = 0;
  }
  _reg(node, t1) { this.srcs.push(node); if (t1 >= this.end) { this.end = t1; this.last = node; } }
  _filt(n, type, spec, t0) {
    if (spec == null) return n;
    const o = typeof spec === 'number' ? { f: spec } : spec;
    const bq = this.c.createBiquadFilter();
    bq.type = type;
    bq.frequency.setValueAtTime(Math.min(20000, o.f * this.p), t0);
    if (o.to) for (const [f, tt] of o.to) bq.frequency.exponentialRampToValueAtTime(Math.min(20000, f * this.p), t0 + tt * this.k);
    bq.Q.value = o.q ?? (type === 'bandpass' ? 1 : 0.707);
    n.connect(bq);
    return bq;
  }
  _chain(src, o, t0) {
    let n = this._filt(src, 'highpass', o.hp, t0);
    n = this._filt(n, 'bandpass', o.bp, t0);
    n = this._filt(n, 'lowpass', o.lp, t0);
    if (o.dist) { const w = this.c.createWaveShaper(); w.curve = this.E.dist; n.connect(w); n = w; }
    return n;
  }
  _env(t0, o) {
    const k = this.k;
    const g = this.c.createGain(); const P = g.gain;
    const a = Math.max(0.0015, (o.a ?? 0.002) * k);
    const hold = (o.hold || 0) * k;
    const dur = Math.max(a + hold + 0.01, o.dur * k);
    const pk = Math.max(1e-4, o.g ?? 0.5);
    P.setValueAtTime(0, t0);
    P.linearRampToValueAtTime(pk, t0 + a);
    if (hold) P.setValueAtTime(pk, t0 + a + hold);
    if (o.elin) P.linearRampToValueAtTime(0, t0 + dur);
    else P.exponentialRampToValueAtTime(0.0002, t0 + dur);
    return [g, t0 + dur];
  }
  _am(n, o, t0, t1) {
    if (!o.am) return n;
    const [rate, depth, type] = o.am;
    const g = this.c.createGain(); g.gain.value = 1 - depth;
    const l = this.c.createOscillator(); l.type = type || 'sine'; l.frequency.value = rate;
    const lg = this.c.createGain(); lg.gain.value = depth;
    l.connect(lg); lg.connect(g.gain); n.connect(g);
    l.start(t0); l.stop(t1); this._reg(l, t1);
    return g;
  }
  _noiseNode(rate) {
    const s = this.c.createBufferSource();
    s.buffer = this.E.noise; s.loop = true; s.playbackRate.value = rate;
    return s;
  }
  tone(o) {
    const c = this.c, k = this.k, p = this.p;
    const t0 = this.t + (o.at || 0) * k;
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    const f0 = o.f * p;
    osc.frequency.setValueAtTime(f0, t0);
    if (o.to) for (const [f, tt] of o.to) {
      if (o.flin) osc.frequency.linearRampToValueAtTime(f * p, t0 + tt * k);
      else osc.frequency.exponentialRampToValueAtTime(f * p, t0 + tt * k);
    }
    if (o.det) osc.detune.value = o.det;
    const [env, t1] = this._env(t0, o);
    const tEnd = t1 + 0.01;
    if (o.fm) {
      const m = c.createOscillator(); const fm = f0 * o.fm.r; m.frequency.value = fm;
      const ks = Math.min(1, MAX_DEV / (o.fm.i0 * fm));
      const mg = c.createGain();
      mg.gain.setValueAtTime(o.fm.i0 * fm * ks, t0);
      mg.gain.setTargetAtTime((o.fm.i1 ?? 0) * fm * ks, t0, (o.fm.id ?? 0.1) * k);
      m.connect(mg); mg.connect(osc.frequency);
      m.start(t0); m.stop(tEnd); this._reg(m, tEnd);
    }
    if (o.vib) {
      const l = c.createOscillator(); l.frequency.value = o.vib[0];
      const lg = c.createGain(); lg.gain.value = o.vib[1] * f0;
      l.connect(lg); lg.connect(osc.frequency);
      l.start(t0); l.stop(tEnd); this._reg(l, tEnd);
    }
    if (o.rasp) {   // slow random pitch jitter = growl / rasp
      const n = this._noiseNode(o.rasp[1] || 0.006);
      const ng = c.createGain(); ng.gain.value = o.rasp[0] * f0;
      n.connect(ng); ng.connect(osc.frequency);
      n.start(t0, Math.random() * 1.5); n.stop(tEnd); this._reg(n, tEnd);
    }
    this._chain(osc, o, t0).connect(env);
    this._am(env, o, t0, tEnd).connect(o.out || this.out);
    osc.start(t0); osc.stop(tEnd); this._reg(osc, tEnd);
  }
  noise(o) {
    const t0 = this.t + (o.at || 0) * this.k;
    const src = this._noiseNode(o.rate || 1);
    const [env, t1] = this._env(t0, o);
    const tEnd = t1 + 0.01;
    this._chain(src, o, t0).connect(env);
    this._am(env, o, t0, tEnd).connect(o.out || this.out);
    src.start(t0, Math.random() * 1.5); src.stop(tEnd); this._reg(src, tEnd);
  }
  bell(at, f, dur, g, r = 3.5) { this.tone({ at, f, dur, g, a: 0.002, fm: { r, i0: 3, i1: 0.3, id: 0.12 } }); }
}

// SFX recipes.  g = overall level, vary = random pitch spread per call, cap = max simultaneous voices.
const SFX = {
  swing_light: { g: 2.02, vary: 0.08, fn(x) {
    x.noise({ dur: 0.17, a: 0.035, g: 0.6, bp: { f: 700, q: 1.6, to: [[2600, 0.09], [1500, 0.17]] } });
  } },
  swing_heavy: { g: 2.02, vary: 0.06, fn(x) {
    x.noise({ dur: 0.3, a: 0.07, g: 0.75, bp: { f: 300, q: 1.2, to: [[1500, 0.16], [550, 0.3]] } });
    x.noise({ dur: 0.26, a: 0.08, g: 0.35, lp: 450 });
  } },
  hit_light: { g: 1.15, vary: 0.07, cap: 5, fn(x) {
    x.tone({ f: 260, to: [[85, 0.1]], dur: 0.12, g: 0.85 });
    x.noise({ dur: 0.06, g: 0.7, bp: { f: 1900, q: 0.9 } });
    x.noise({ dur: 0.09, g: 0.5, lp: 900 });
    x.tone({ type: 'square', f: 900, to: [[280, 0.025]], dur: 0.03, g: 0.12, lp: 3500 });
  } },
  hit_heavy: { g: 0.76, vary: 0.05, cap: 5, fn(x) {
    x.tone({ f: 190, to: [[42, 0.22]], dur: 0.3, g: 0.95 });
    x.noise({ dur: 0.13, g: 0.6, bp: { f: 1300, q: 0.7 }, dist: true });
    x.noise({ dur: 0.2, g: 0.55, lp: 650 });
    x.tone({ type: 'sawtooth', f: 330, to: [[70, 0.06]], dur: 0.07, g: 0.22, lp: 2200 });
  } },
  hit_finisher: { g: 0.68, vary: 0.04, cap: 3, fn(x) {
    x.tone({ f: 200, to: [[34, 0.35]], dur: 0.5, g: 1 });
    x.noise({ dur: 0.16, g: 0.65, bp: { f: 1100, q: 0.6 }, dist: true });
    x.noise({ dur: 0.3, g: 0.55, lp: { f: 1500, to: [[200, 0.3]] } });
    x.tone({ type: 'sawtooth', f: 380, to: [[60, 0.09]], dur: 0.1, g: 0.25, lp: 2500 });
    x.noise({ at: 0.02, dur: 0.75, a: 0.004, g: 0.22, hp: 4500 });              // crash tail
    x.tone({ f: 1560, dur: 0.35, g: 0.07, fm: { r: 1.41, i0: 4, i1: 0.5, id: 0.08 } });
  } },
  shield_bash: { g: 0.92, vary: 0.05, fn(x) {
    x.tone({ f: 150, to: [[62, 0.12]], dur: 0.16, g: 0.8 });                    // wood thud
    x.noise({ dur: 0.07, g: 0.6, bp: { f: 480, q: 2 } });
    x.tone({ f: 720, dur: 0.32, g: 0.22, fm: { r: 1.414, i0: 6, i1: 0.8, id: 0.06 } });   // metal clank
    x.tone({ f: 1130, dur: 0.24, g: 0.12, fm: { r: 2.3, i0: 3, i1: 0.4, id: 0.05 } });
  } },
  block: { g: 1.27, vary: 0.05, fn(x) {
    x.tone({ f: 1250, dur: 0.42, g: 0.3, fm: { r: 2.76, i0: 5, i1: 0.4, id: 0.07 } });
    x.tone({ f: 1870, dur: 0.3, g: 0.1 });
    x.noise({ dur: 0.03, g: 0.45, hp: 3500 });
  } },
  jump: { g: 1.07, vary: 0.04, fn(x) {
    x.tone({ type: 'triangle', f: 240, to: [[560, 0.12]], dur: 0.15, g: 0.4, a: 0.005 });
    x.noise({ dur: 0.13, a: 0.03, g: 0.18, bp: { f: 1200, q: 1, to: [[2600, 0.13]] } });
  } },
  land: { g: 0.8, vary: 0.08, fn(x) {
    x.tone({ f: 115, to: [[48, 0.1]], dur: 0.13, g: 0.7 });
    x.noise({ dur: 0.08, g: 0.4, lp: 450 });
  } },
  run_step: { g: 1.05, vary: 0.12, cap: 3, fn(x) {
    x.noise({ dur: 0.05, g: 0.32, bp: { f: 1300, q: 0.8 } });                    // snow crunch
    x.tone({ f: 95, to: [[60, 0.04]], dur: 0.05, g: 0.25 });
  } },
  special: { g: 0.93, cap: 2, fn(x) {   // DRAGON FLARE
    x.tone({ f: 150, to: [[34, 0.5]], dur: 0.6, g: 0.75 });                        // ignition boom
    [86, 90, 93, 98, 102].forEach((m, i) => x.bell(0.02 + i * 0.045, mtof(m), 0.5, 0.08));   // power shimmer
    for (const [mul, det, g] of [[1, -9, 0.15], [1, 9, 0.15], [1.5, 0, 0.09]]) {   // roar: rises then falls
      x.tone({ type: 'sawtooth', f: 80 * mul, to: [[200 * mul, 0.55], [140 * mul, 1.2]], det, dur: 1.25, a: 0.12, hold: 0.55, g,
        lp: { f: 500, q: 3, to: [[2800, 0.5], [900, 1.2]] }, rasp: [0.05], am: [36, 0.35] });
    }
    x.noise({ dur: 1.2, a: 0.3, hold: 0.4, g: 0.5, bp: { f: 300, q: 0.7, to: [[2800, 0.75], [1200, 1.2]] } });   // fire whoosh
    x.noise({ at: 0.15, dur: 1.0, a: 0.15, hold: 0.4, g: 0.15, hp: 2600, am: [23, 0.8, 'square'] });              // crackle
    x.tone({ f: 46, dur: 1.25, a: 0.2, hold: 0.6, g: 0.42 });                                                       // rumble
    x.noise({ dur: 1.2, a: 0.15, hold: 0.6, g: 0.42, lp: 140 });
  } },
  fire_small: { g: 1.54, vary: 0.08, fn(x) {
    x.noise({ dur: 0.28, a: 0.01, g: 0.55, bp: { f: 900, q: 0.9, to: [[2200, 0.12], [800, 0.28]] } });
    x.tone({ f: 520, to: [[180, 0.1]], dur: 0.12, g: 0.3 });
    x.noise({ at: 0.03, dur: 0.22, g: 0.12, hp: 3000, am: [27, 0.8, 'square'] });
  } },
  fire_breath: { g: 0.99, cap: 2, fn(x) {
    x.noise({ dur: 1.05, a: 0.08, hold: 0.65, g: 0.6, bp: { f: 500, q: 0.6, to: [[1400, 0.4], [800, 1.05]] } });
    x.noise({ dur: 0.95, a: 0.1, hold: 0.6, g: 0.18, hp: 2200, am: [19, 0.8, 'square'] });
    x.tone({ f: 58, dur: 1.0, a: 0.1, hold: 0.6, g: 0.35 });
    x.noise({ dur: 1.0, a: 0.1, hold: 0.6, g: 0.4, lp: 300 });
  } },
  roar: { g: 1.77, cap: 2, fn(x) {
    for (const [f, det, g] of [[92, -10, 0.2], [92, 10, 0.2], [138, 0, 0.11]]) {
      x.tone({ type: 'sawtooth', f, to: [[f * 1.36, 0.25], [f * 0.85, 1.0]], det, dur: 1.05, a: 0.08, hold: 0.55, g,
        lp: { f: 700, q: 4, to: [[1600, 0.3], [500, 1.0]] }, rasp: [0.06], am: [32, 0.4] });
    }
    x.noise({ dur: 1.0, a: 0.1, hold: 0.5, g: 0.22, bp: { f: 900, q: 0.8 } });
  } },
  whelp_chirp: { g: 2.15, vary: 0.1, fn(x) {
    x.tone({ f: 1300, to: [[2100, 0.06]], dur: 0.07, g: 0.22, fm: { r: 2, i0: 1, i1: 0.3 } });
    x.tone({ at: 0.085, f: 1700, to: [[2400, 0.04], [1500, 0.1]], dur: 0.1, g: 0.22, fm: { r: 2, i0: 1, i1: 0.3 } });
  } },
  kobold_hurt: { g: 1.68, vary: 0.12, fn(x) {   // squeaky cartoon lizard yelp, three contours
    const shapes = [
      [820, [[1250, 0.05], [620, 0.2]]],
      [950, [[1400, 0.04], [1100, 0.09], [560, 0.22]]],
      [700, [[1150, 0.06], [500, 0.18]]],
    ];
    const [f, to] = shapes[Math.floor(Math.random() * shapes.length)];
    x.tone({ type: 'square', f, to, dur: 0.22, a: 0.005, g: 0.22, lp: { f: 2600, q: 2 }, vib: [28, 0.05] });
  } },
  brute_hurt: { g: 1.66, vary: 0.08, fn(x) {
    x.tone({ type: 'sawtooth', f: 135, to: [[85, 0.22]], dur: 0.25, a: 0.01, g: 0.5, lp: { f: 650, q: 3 }, am: [26, 0.3] });
    x.noise({ dur: 0.18, a: 0.01, g: 0.2, bp: { f: 420, q: 1 } });
  } },
  player_hurt: { g: 1.45, vary: 0.05, fn(x) {   // soft "oof": falling vowel-ish blip, deliberately not distressing
    x.tone({ type: 'triangle', f: 560, to: [[360, 0.15]], dur: 0.17, a: 0.006, g: 0.45, lp: { f: 1400, q: 2 } });
    x.tone({ f: 1120, to: [[700, 0.1]], dur: 0.1, g: 0.06 });
  } },
  knockdown: { g: 0.82, vary: 0.06, fn(x) {
    x.tone({ f: 95, to: [[38, 0.24]], dur: 0.28, g: 0.85 });
    x.noise({ dur: 0.18, g: 0.55, lp: 380 });
    x.tone({ at: 0.15, f: 80, to: [[40, 0.1]], dur: 0.12, g: 0.4 });           // little bounce
    x.noise({ at: 0.15, dur: 0.08, g: 0.3, lp: 300 });
  } },
  poof: { g: 2.08, vary: 0.06, fn(x) {
    x.noise({ dur: 0.32, a: 0.02, g: 0.5, lp: { f: 2500, to: [[350, 0.32]] } });
    for (let i = 0; i < 3; i++) x.bell(0.05 + i * 0.06, rnd(2200, 3600), 0.14, 0.07);
  } },
  freed: { g: 2.29, cap: 2, fn(x) {   // collar shatters -> rising A-major sparkle
    x.noise({ dur: 0.04, g: 0.22, hp: 3000 });
    [81, 85, 88, 93, 97].forEach((m, i) => x.bell(0.04 + i * 0.06, mtof(m), 0.55, 0.12));
    x.noise({ at: 0.05, dur: 0.75, a: 0.12, g: 0.07, hp: 6500 });
  } },
  break: { g: 1.12, vary: 0.08, fn(x) {   // crate / barrel smash
    x.tone({ f: 120, to: [[55, 0.12]], dur: 0.15, g: 0.65 });
    for (let i = 0; i < 4; i++) x.noise({ at: rnd(0, 0.07), dur: 0.045, g: 0.45, bp: { f: rnd(700, 1600), q: 3 } });
    for (let i = 0; i < 3; i++) { const f = rnd(300, 520); x.tone({ type: 'triangle', at: rnd(0.08, 0.22), f, to: [[f * 0.8, 0.05]], dur: 0.06, g: 0.18 }); }
  } },
  pickup_food: { g: 2.54, fn(x) {   // "snack!": two crunchy chomps + a happy two-note chime
    for (const at of [0, 0.1]) {
      x.noise({ at, dur: 0.055, g: 0.45, bp: { f: 1100, q: 0.9 } });
      x.tone({ at, f: 140, to: [[80, 0.04]], dur: 0.05, g: 0.3 });
    }
    x.tone({ at: 0.2, type: 'square', f: 1319, dur: 0.1, g: 0.09, lp: 5000 });
    x.tone({ at: 0.28, type: 'square', f: 1760, dur: 0.28, g: 0.09, lp: 5000 });
    x.bell(0.28, 1760, 0.35, 0.1);
  } },
  pickup_coin: { g: 2.5, vary: 0.02, fn(x) {
    x.tone({ type: 'square', f: 988, dur: 0.07, g: 0.1, lp: 6000 });
    x.tone({ at: 0.065, type: 'square', f: 1319, dur: 0.3, g: 0.1, lp: 6000 });
    x.bell(0.065, 2638, 0.3, 0.06);
  } },
  pickup_ember: { g: 2.45, fn(x) {   // magical power-up: whoosh + D-major run up + sparkle
    x.noise({ dur: 0.5, a: 0.15, g: 0.25, bp: { f: 400, q: 1, to: [[3000, 0.5]] } });
    [62, 66, 69, 74, 78, 81].forEach((m, i) => x.tone({ at: i * 0.04, f: mtof(m), dur: 0.2, a: 0.004, g: 0.14, fm: { r: 1, i0: 2.5, i1: 0.8, id: 0.06 } }));
    x.bell(0.25, mtof(98), 0.55, 0.1);
  } },
  pickup_life: { g: 3.46, fn(x) {   // 1-UP
    [84, 88, 91, 88, 91, 96].forEach((m, i) => {
      x.tone({ at: i * 0.075, type: 'square', f: mtof(m), dur: i === 5 ? 0.35 : 0.08, g: 0.09, lp: 6000 });
      x.bell(i * 0.075, mtof(m), 0.2, 0.05);
    });
  } },
  go: { g: 3.82, cap: 2, fn(x) {   // the flashing "GO ->" double beep
    x.tone({ type: 'square', f: 1319, dur: 0.075, g: 0.1, lp: 6000, a: 0.003 });
    x.tone({ at: 0.1, type: 'square', f: 1319, dur: 0.12, g: 0.1, lp: 6000, a: 0.003 });
  } },
  menu_move: { g: 4.7, cap: 2, fn(x) {
    x.tone({ type: 'square', f: 660, to: [[720, 0.03]], dur: 0.045, g: 0.08, lp: 5000 });
  } },
  menu_select: { g: 2.93, cap: 2, fn(x) {
    x.tone({ type: 'square', f: 880, dur: 0.06, g: 0.09, lp: 6000 });
    x.tone({ at: 0.06, type: 'square', f: 1319, dur: 0.16, g: 0.09, lp: 6000 });
    x.bell(0.06, 1319, 0.25, 0.06);
  } },
  pause: { g: 3.37, cap: 2, fn(x) {
    x.tone({ type: 'square', f: 523, dur: 0.07, g: 0.1, lp: 4000 });
    x.tone({ at: 0.08, type: 'square', f: 1047, dur: 0.16, g: 0.1, lp: 4000 });
  } },
  charge: { g: 3.95, vary: 0.06, fn(x) {   // brute snort
    x.noise({ dur: 0.14, a: 0.02, g: 0.5, bp: { f: 650, q: 1.5 } });
    x.noise({ at: 0.17, dur: 0.22, a: 0.02, g: 0.55, bp: { f: 560, q: 1.5, to: [[800, 0.2]] } });
    x.tone({ type: 'sawtooth', f: 75, dur: 0.42, a: 0.03, g: 0.22, lp: 420, am: [18, 0.5] });
  } },
  stomp: { g: 0.71, cap: 2, fn(x) {   // boss landing shockwave
    x.tone({ f: 78, to: [[26, 0.6]], dur: 0.7, g: 0.95 });
    x.noise({ dur: 0.5, g: 0.65, lp: { f: 900, to: [[120, 0.5]] } });
    x.noise({ at: 0.05, dur: 0.45, a: 0.02, g: 0.16, hp: 1800, am: [31, 0.7, 'square'] });   // debris
    x.tone({ f: 40, dur: 0.8, a: 0.02, g: 0.35 });
  } },
  collar_crack: { g: 2.06, vary: 0.05, fn(x) {
    x.noise({ dur: 0.025, g: 0.32, hp: 2500 });
    x.tone({ f: 2800, dur: 0.26, g: 0.16, fm: { r: 2.76, i0: 3, i1: 0.2, id: 0.06 } });
    x.tone({ at: 0.03, type: 'triangle', f: 1900, to: [[1500, 0.07]], dur: 0.08, g: 0.12 });
  } },
};

// v2 sfx.  hold: true marks sounds that sustain while opts.hold is set (x.hold = seconds) until handle.stop().
Object.assign(SFX, {
  // ---- every hero: the dodge, the charged spell, Dodongo's dragon change
  perfect: { g: 1.6, cap: 2, fn(x) {   // the PERFECT DODGE: a fast rising whoosh into a bright two-note chime
    x.noise({ dur: 0.3, a: 0.01, g: 0.45, bp: { f: 600, q: 0.9, to: [[3400, 0.22]] } });
    x.bell(0.07, 1976, 0.5, 0.1); x.bell(0.15, 2637, 0.6, 0.09);
  } },
  dodge: { g: 2.2, vary: 0.08, fn(x) {   // a quick swish and a scuff
    x.noise({ dur: 0.2, a: 0.02, g: 0.55, bp: { f: 900, q: 1.4, to: [[3000, 0.08], [1200, 0.2]] } });
    x.noise({ at: 0.02, dur: 0.12, g: 0.25, lp: 700 });
  } },
  charge_hum: { g: 1.2, cap: 2, hold: true, fn(x) {   // a warm rising hum; held = humming at the top until let go
    const rise = 0.55, dur = rise + (x.hold || 0.15);
    for (const [mul, det, g] of [[1, -5, 0.16], [1.5, 6, 0.1], [2, 0, 0.06]]) {
      x.tone({ f: 160 * mul, to: [[420 * mul, rise]], det, dur, a: 0.15, hold: dur - 0.3, g, fm: { r: 2, i0: 0.5, i1: 0.25, id: 0.4 }, am: [9, 0.3] });
    }
    x.noise({ dur, a: 0.3, hold: dur - 0.4, g: 0.04, hp: 4500 });
  } },
  charge_full: { g: 2.4, cap: 2, fn(x) {   // the ping: fully charged
    x.bell(0, 1568, 0.3, 0.1); x.bell(0.05, 2349, 0.35, 0.09); x.bell(0.1, 3136, 0.45, 0.07);
    x.noise({ dur: 0.25, a: 0.01, g: 0.08, hp: 6000 });
  } },
  charge_release: { g: 1.5, cap: 2, fn(x) {   // the big spell going off: a thump, a whoosh, a sparkle
    x.tone({ f: 140, to: [[40, 0.3]], dur: 0.4, g: 0.8 });
    x.noise({ dur: 0.5, a: 0.02, g: 0.5, bp: { f: 600, q: 0.8, to: [[2400, 0.15], [900, 0.5]] } });
    for (let i = 0; i < 5; i++) x.bell(0.04 + i * 0.04, 1800 + i * 400, 0.25, 0.05);
  } },
  transform: { g: 1.4, cap: 2, fn(x) {   // Dodongo's change: a golden rising shimmer over a whoosh
    [74, 78, 81, 86, 90, 93, 98].forEach((m, i) => x.bell(i * 0.035, mtof(m), 0.45, 0.07));
    x.noise({ dur: 0.7, a: 0.08, g: 0.4, bp: { f: 400, q: 0.9, to: [[2600, 0.4], [1200, 0.7]] } });
    x.tone({ f: 70, to: [[140, 0.3], [60, 0.7]], dur: 0.75, a: 0.05, g: 0.35 });
  } },
  // ---- Ana (crystal mage)
  beam_charge: { g: 1.11, cap: 2, hold: true, fn(x) {   // rising crystal hum; held = keeps humming at the top
    const rise = 1.0, dur = rise + (x.hold || 0.15);
    for (const [mul, det, g] of [[1, -6, 0.14], [1.5, 5, 0.12], [2, 0, 0.07]]) {
      x.tone({ f: 220 * mul, to: [[660 * mul, rise]], det, dur, a: 0.4, hold: dur - 0.55, g, fm: { r: 2.76, i0: 0.6, i1: 0.3, id: 0.5 }, am: [7, 0.35] });
    }
    x.noise({ dur, a: 0.5, hold: dur - 0.65, g: 0.05, hp: 5000 });
  } },
  // her CRYSTAL BEAM (it was beam_fire: a buzzing laser, too loud -- the user's note): one sound a beam, a gentle rising
  // chime that settles into a soft shimmer for as long as the beam is on (hold: seconds, or true and stop() when it
  // ends), then fades; the beam's last tick: crystal_ting.  The Archmage's combo bursts: crystal_pop.
  crystal_beam: { g: 1.4, cap: 2, hold: true, fn(x) {   // (~10 dB under the old laser, ~6 under the other hums)
    const rise = 0.3, held = x.hold || 0.5, rel = 0.45, dur = rise + held + rel;
    // the chime: four soft bell notes up an E major arpeggio, each a little quieter
    [88, 92, 95, 100].forEach((m, i) => x.tone({ at: i * 0.065, f: mtof(m), dur: 0.55, a: 0.006, g: 0.1 - i * 0.015, fm: { r: 3.01, i0: 0.9, i1: 0.08, id: 0.12 } }));
    // the shimmer: a soft high pad (E6, B6, E7: pure sines, a hair detuned) with a slow tremolo, swelling in under it
    for (const [f, det, g, at] of [[1318.5, -4, 0.05, 0.1], [1975.5, 5, 0.032, 0.16], [2637, 2, 0.016, 0.22]]) {
      x.tone({ at, f, det, dur: dur - at, a: 0.22, hold: Math.max(0.05, rise + held - at - 0.22), g, am: [5, 0.3] });
    }
    x.noise({ at: 0.12, dur: dur - 0.12, a: 0.3, hold: Math.max(0.05, rise + held - 0.42), g: 0.01, hp: 7500, am: [9, 0.5] });   // (a faint airy sparkle)
  } },
  crystal_ting: { g: 1.3, cap: 3, vary: 0.03, fn(x) {   // the beam's last tick: a small bright "ting"
    x.bell(0, 3520, 0.4, 0.11, 2); x.bell(0.015, 5274, 0.28, 0.045, 2);
    x.tone({ f: 260, to: [[150, 0.07]], dur: 0.09, g: 0.07 });   // (a soft knock under it: the foe goes down)
  } },
  crystal_pop: { g: 2.1, cap: 3, vary: 0.05, fn(x) {   // the Archmage's combo bursts: a soft chime pop
    [84, 88, 91].forEach((m, i) => x.bell(i * 0.03, mtof(m), 0.32, 0.065, 3.01));
    x.noise({ dur: 0.18, a: 0.01, g: 0.1, bp: { f: 2500, q: 1, to: [[5200, 0.15]] } });
  } },
  starfall: { g: 1.33, cap: 2, fn(x) {   // twinkling shower + soft star impacts
    for (let i = 0; i < 14; i++) x.bell(rnd(0, 1.1), rnd(1800, 4200), rnd(0.15, 0.35), rnd(0.04, 0.08), 2.76);
    for (const at of [0.35, 0.65, 0.9, 1.15]) {
      x.tone({ at, f: rnd(130, 170), to: [[45, 0.15]], dur: 0.2, g: 0.5 });
      x.noise({ at, dur: 0.12, g: 0.35, lp: 2200 });
      x.bell(at, rnd(900, 1300), 0.3, 0.08, 1.41);
    }
    x.noise({ dur: 1.4, a: 0.3, hold: 0.6, g: 0.07, hp: 6000 });
  } },
  staff_swing: { g: 2.9, vary: 0.07, fn(x) {
    x.noise({ dur: 0.2, a: 0.04, g: 0.6, bp: { f: 500, q: 1.4, to: [[2000, 0.11], [900, 0.2]] } });
    x.bell(0.05, rnd(2600, 3200), 0.2, 0.05, 2.76);
  } },
  // ---- Shadow (ninja)
  shuriken: { g: 4.81, vary: 0.08, fn(x) {
    x.noise({ dur: 0.18, a: 0.01, g: 0.5, bp: { f: 3000, q: 2, to: [[6500, 0.06], [2500, 0.18]] }, am: [70, 0.5] });
    x.tone({ type: 'triangle', f: 2400, to: [[1800, 0.15]], dur: 0.15, g: 0.04, am: [70, 0.6] });
  } },
  shuriken_hit: { g: 1.9, vary: 0.1, fn(x) {   // metallic tink
    x.tone({ f: 3300, dur: 0.18, g: 0.18, fm: { r: 2.76, i0: 2.5, i1: 0.2, id: 0.04 } });
    x.tone({ f: 4900, dur: 0.1, g: 0.06 });
    x.noise({ dur: 0.02, g: 0.4, hp: 4000 });
    x.tone({ f: 200, to: [[90, 0.04]], dur: 0.05, g: 0.25 });
  } },
  sword_slash: { g: 4.36, vary: 0.07, cap: 5, fn(x) {   // bright, fast "shing"
    x.noise({ dur: 0.13, a: 0.008, g: 0.55, bp: { f: 1500, q: 1.3, to: [[7000, 0.08]] } });
    x.tone({ at: 0.03, f: 2650, dur: 0.22, g: 0.07, fm: { r: 1.5, i0: 2, i1: 0.3, id: 0.05 } });
  } },
  shadow_strike: { g: 3.24, cap: 1, fn(x) {   // swoosh-vanish, flurry of slashes, blade slides home, click
    x.noise({ dur: 0.3, a: 0.02, g: 0.5, bp: { f: 4000, q: 1, to: [[400, 0.3]] } });
    x.tone({ type: 'triangle', f: 600, to: [[120, 0.28]], dur: 0.3, g: 0.12 });
    for (let i = 0; i < 7; i++) {
      const at = 0.38 + i * 0.075 + rnd(-0.01, 0.01), f = rnd(1300, 2000);
      x.noise({ at, dur: 0.07, a: 0.004, g: 0.45, bp: { f, q: 1.4, to: [[f * 4, 0.05]] } });
      x.tone({ at: at + 0.01, f: rnd(2400, 3200), dur: 0.12, g: 0.05, fm: { r: 1.5, i0: 2, i1: 0.3, id: 0.04 } });
      if (i % 2) x.tone({ at, f: 180, to: [[70, 0.05]], dur: 0.07, g: 0.35 });
    }
    x.noise({ at: 1.0, dur: 0.25, a: 0.12, g: 0.18, bp: { f: 2500, q: 3, to: [[1200, 0.25]] } });
    x.tone({ at: 1.3, type: 'square', f: 2100, dur: 0.06, g: 0.2, lp: 5000 });
    x.noise({ at: 1.3, dur: 0.03, g: 0.4, hp: 3000 });
    x.tone({ at: 1.33, f: 4200, dur: 0.15, g: 0.06, fm: { r: 2.76, i0: 1.5, i1: 0.1 } });
  } },
  vanish: { g: 1.25, vary: 0.05, fn(x) {
    x.noise({ dur: 0.35, a: 0.02, g: 0.5, lp: { f: 3500, to: [[300, 0.35]] } });
    x.tone({ type: 'triangle', f: 420, to: [[90, 0.3]], dur: 0.32, g: 0.25 });
    x.noise({ at: 0.05, dur: 0.25, g: 0.08, hp: 6000 });
  } },
  // ---- Dodongo
  fireball_breath: { g: 1.61, vary: 0.05, cap: 3, fn(x) {   // inhale, then a whooshing fire puff
    x.noise({ dur: 0.35, a: 0.3, g: 0.25, bp: { f: 500, q: 1.5, to: [[1300, 0.33]] }, elin: true });
    x.noise({ at: 0.33, dur: 0.45, a: 0.01, g: 0.6, bp: { f: 600, q: 0.8, to: [[2400, 0.1], [900, 0.45]] } });
    x.tone({ at: 0.33, f: 220, to: [[90, 0.08]], dur: 0.12, g: 0.45 });
    x.noise({ at: 0.36, dur: 0.35, g: 0.12, hp: 3000, am: [26, 0.8, 'square'] });
  } },
  fireball_hit: { g: 0.79, vary: 0.06, fn(x) {
    x.tone({ f: 160, to: [[40, 0.25]], dur: 0.3, g: 0.8 });
    x.noise({ dur: 0.4, g: 0.6, lp: { f: 3500, to: [[300, 0.4]] } });
    x.noise({ dur: 0.35, g: 0.15, hp: 3000, am: [24, 0.8, 'square'] });
    x.noise({ dur: 0.1, g: 0.4, bp: { f: 1200, q: 0.8 }, dist: true });
  } },
  // ---- interactables
  throw: { g: 2.63, vary: 0.08, fn(x) {
    x.noise({ dur: 0.22, a: 0.05, g: 0.55, bp: { f: 450, q: 1.2, to: [[1800, 0.12], [700, 0.22]] } });
    x.tone({ type: 'triangle', f: 160, to: [[110, 0.1]], dur: 0.1, g: 0.15 });
  } },
  pickup_item: { g: 1.52, vary: 0.06, fn(x) {   // heave: "hnngh" + scrape + set-down
    x.tone({ type: 'sawtooth', f: 120, to: [[170, 0.18]], dur: 0.22, a: 0.02, g: 0.25, lp: { f: 600, q: 2 } });
    x.noise({ dur: 0.18, a: 0.03, g: 0.2, lp: 900 });
    x.tone({ at: 0.16, f: 90, to: [[50, 0.08]], dur: 0.1, g: 0.35 });
  } },
  minecart: { g: 0.97, cap: 2, hold: true, fn(x) {   // rolling rumble + rail clacks + a little wheel squeal
    const dur = 1.4 + (x.hold || 0);
    x.noise({ dur, a: 0.15, hold: dur - 0.45, g: 0.5, lp: 260, am: [9, 0.4] });
    x.tone({ f: 52, dur, a: 0.15, hold: dur - 0.45, g: 0.25, am: [9, 0.3] });
    for (let i = 0, n = Math.floor(dur / 0.32); i < n; i++) {
      const at = 0.1 + i * 0.32;
      x.noise({ at, dur: 0.03, g: 0.3, bp: { f: 1800, q: 2 } });
      x.noise({ at: at + 0.07, dur: 0.03, g: 0.22, bp: { f: 1500, q: 2 } });
    }
    x.noise({ dur, a: 0.2, hold: dur - 0.5, g: 0.05, bp: { f: 3800, q: 6 } });
  } },
  explosion: { g: 0.59, cap: 3, fn(x) {
    x.tone({ f: 110, to: [[28, 0.7]], dur: 0.9, g: 0.9 });
    x.noise({ dur: 1.0, g: 0.75, lp: { f: 4500, to: [[180, 0.9]] }, dist: true });
    x.noise({ dur: 0.08, g: 0.6, hp: 1500 });
    x.noise({ at: 0.1, dur: 0.8, a: 0.05, g: 0.15, hp: 2000, am: [17, 0.8, 'square'] });
    x.noise({ dur: 1.2, a: 0.05, hold: 0.2, g: 0.35, lp: 120 });
  } },
  gong: { g: 0.8, cap: 2, fn(x) {   // big bronze gong: the FM index grows after the strike, so it blooms
    x.tone({ f: 98, dur: 3.2, a: 0.01, g: 0.4, fm: { r: 1.41, i0: 1.2, i1: 3.2, id: 0.5 } });
    x.tone({ f: 147, dur: 2.6, a: 0.02, g: 0.2, fm: { r: 2.76, i0: 1, i1: 2, id: 0.6 } });
    x.tone({ f: 233, dur: 2.0, a: 0.04, g: 0.1, fm: { r: 1.2, i0: 0.5, i1: 1.5, id: 0.4 } });
    x.noise({ dur: 0.15, g: 0.4, lp: 1500 });
    x.tone({ f: 60, to: [[48, 0.3]], dur: 0.6, g: 0.4 });
  } },
  wind_gust: { g: 2.33, vary: 0.1, fn(x) {
    x.noise({ dur: 1.4, a: 0.5, hold: 0.2, g: 0.5, bp: { f: 300, q: 1.8, to: [[1300, 0.6], [450, 1.4]] } });
    x.noise({ dur: 1.3, a: 0.4, hold: 0.2, g: 0.2, lp: { f: 400, to: [[900, 0.6], [250, 1.3]] } });
    x.noise({ at: 0.3, dur: 0.9, a: 0.3, g: 0.04, bp: { f: 2800, q: 8, to: [[3400, 0.5], [2600, 0.9]] } });
  } },
  lava_burst: { g: 1.35, vary: 0.08, fn(x) {   // blorps + splash + sizzle
    for (let i = 0; i < 3; i++) x.tone({ at: i * 0.09 + rnd(0, 0.03), f: rnd(70, 95), to: [[rnd(180, 260), 0.06], [60, 0.18]], dur: 0.2, g: 0.45, fm: { r: 1, i0: 1.5, i1: 0.3, id: 0.05 } });
    x.noise({ dur: 0.5, a: 0.02, g: 0.4, bp: { f: 700, q: 0.8, to: [[1600, 0.1], [500, 0.5]] } });
    x.noise({ at: 0.05, dur: 0.6, a: 0.05, g: 0.12, hp: 3500, am: [21, 0.7, 'square'] });
  } },
  cage_break: { g: 1.16, vary: 0.05, fn(x) {
    x.tone({ f: 700, dur: 0.5, g: 0.25, fm: { r: 1.41, i0: 6, i1: 0.8, id: 0.06 } });
    x.noise({ dur: 0.05, g: 0.6, hp: 2000 });
    x.tone({ f: 140, to: [[60, 0.1]], dur: 0.15, g: 0.5 });
    for (let i = 0; i < 5; i++) x.tone({ at: rnd(0.1, 0.45), f: rnd(900, 1900), dur: 0.2, g: 0.08, fm: { r: 2.76, i0: 3, i1: 0.3, id: 0.04 } });
  } },
  chandelier: { g: 0.77, cap: 1, fn(x) {   // chain snap, links rattle, fall, glass-and-metal crash
    x.noise({ dur: 0.03, g: 0.5, hp: 3000 });
    x.tone({ f: 2300, dur: 0.15, g: 0.1, fm: { r: 1.41, i0: 3, i1: 0.3 } });
    for (let i = 0; i < 4; i++) x.tone({ at: 0.03 + i * 0.05, f: rnd(1600, 2600), dur: 0.08, g: 0.05, fm: { r: 2.76, i0: 2, i1: 0.2 } });
    x.noise({ at: 0.15, dur: 0.5, a: 0.4, g: 0.15, bp: { f: 600, q: 1, to: [[1500, 0.45]] } });
    const t = 0.65;
    x.tone({ at: t, f: 120, to: [[40, 0.3]], dur: 0.4, g: 0.8 });
    x.noise({ at: t, dur: 0.9, g: 0.45, hp: 2500 });
    for (let i = 0; i < 12; i++) x.bell(t + rnd(0, 0.6), rnd(1500, 4200), rnd(0.15, 0.4), rnd(0.03, 0.07), 2.76);
  } },
  statue_fire: { g: 0.96, vary: 0.05, fn(x) {   // "fwoomp" ignition + crackle
    x.noise({ dur: 0.9, a: 0.12, hold: 0.3, g: 0.55, lp: { f: 200, to: [[2500, 0.25], [1200, 0.9]] } });
    x.tone({ f: 70, to: [[45, 0.3]], dur: 0.4, g: 0.45 });
    x.noise({ at: 0.1, dur: 0.8, a: 0.1, hold: 0.3, g: 0.13, hp: 3000, am: [22, 0.8, 'square'] });
  } },
  chest_open: { g: 2.61, fn(x) {   // creak, lid clunk, sparkle
    x.tone({ type: 'sawtooth', f: 160, to: [[260, 0.3]], dur: 0.32, a: 0.03, g: 0.18, bp: { f: 900, q: 3 }, rasp: [0.08, 0.02] });
    x.noise({ at: 0.3, dur: 0.03, g: 0.4, bp: { f: 1500, q: 2 } });
    x.tone({ at: 0.3, f: 150, to: [[80, 0.05]], dur: 0.08, g: 0.3 });
    [84, 88, 91, 96].forEach((m, i) => x.bell(0.36 + i * 0.07, mtof(m), 0.45, 0.09));
  } },
  ballista: { g: 0.86, vary: 0.05, fn(x) {   // string twang + thunk + bolt whoosh
    x.tone({ type: 'triangle', f: 220, to: [[90, 0.08], [75, 0.4]], dur: 0.45, g: 0.4, vib: [24, 0.03] });
    x.tone({ f: 110, dur: 0.35, g: 0.15, fm: { r: 2, i0: 3, i1: 0.3, id: 0.05 } });
    x.tone({ f: 130, to: [[45, 0.12]], dur: 0.18, g: 0.6 });
    x.noise({ dur: 0.06, g: 0.5, bp: { f: 900, q: 1 } });
    x.noise({ at: 0.03, dur: 0.35, a: 0.03, g: 0.3, bp: { f: 1200, q: 1.5, to: [[3500, 0.15], [800, 0.35]] } });
  } },
  snow_dump: { g: 0.92, vary: 0.08, fn(x) {   // soft heavy "whumpf"
    x.noise({ dur: 0.6, a: 0.03, g: 0.6, lp: { f: 1400, to: [[250, 0.6]] } });
    x.tone({ f: 90, to: [[45, 0.2]], dur: 0.3, g: 0.5 });
    x.noise({ dur: 0.35, a: 0.02, g: 0.12, bp: { f: 2500, q: 1 }, am: [35, 0.7, 'square'] });
  } },
  boulder_roll: { g: 0.98, cap: 2, hold: true, fn(x) {
    const dur = 1.8 + (x.hold || 0);
    x.noise({ dur, a: 0.2, hold: dur - 0.6, g: 0.6, lp: 170, am: [6.5, 0.5] });
    x.tone({ f: 38, dur, a: 0.2, hold: dur - 0.6, g: 0.35, am: [6.5, 0.4] });
    for (let i = 0, n = Math.floor(dur / 0.15); i < n; i++) x.noise({ at: i * 0.15 + rnd(0, 0.08), dur: 0.04, g: rnd(0.1, 0.25), bp: { f: rnd(500, 1100), q: 2 } });
  } },
  waystone: { g: 1.43, cap: 2, fn(x) {   // activation shimmer: Fmaj7 bell run + hum
    [65, 69, 72, 76, 77, 81].forEach((m, i) => x.bell(i * 0.08, mtof(m + 12), 0.7, 0.08));
    x.noise({ dur: 1.2, a: 0.4, g: 0.08, hp: 5000 });
    x.tone({ f: 110, dur: 1.2, a: 0.3, g: 0.15, fm: { r: 2, i0: 0.8, i1: 0.4, id: 0.5 }, vib: [5, 0.01] });
  } },
  cooldown_ready: { g: 3.02, cap: 2, fn(x) { x.bell(0, 1760, 0.12, 0.08); x.bell(0.06, 2637, 0.18, 0.08); } },
  portal: { g: 1.48, cap: 2, fn(x) {   // crystal portal opens: swirl + whole-tone crystal run
    x.noise({ dur: 1.6, a: 0.6, hold: 0.3, g: 0.15, hp: 4000 });
    x.tone({ f: 200, to: [[420, 1.2]], dur: 1.6, a: 0.3, hold: 0.6, g: 0.18, vib: [6, 0.03], fm: { r: 2, i0: 1, i1: 0.5, id: 0.6 } });
    [72, 74, 76, 78, 80, 82, 84, 86].forEach((m, i) => x.bell(0.1 + i * 0.09, mtof(m + 12), 0.6, 0.06));
    x.bell(0.85, mtof(100), 0.8, 0.06, 2.76);
  } },
  // ---- bosses and enemies
  wyrm_emerge: { g: 0.89, cap: 1, fn(x) {   // rumble swell, then a huge lava splash
    x.noise({ dur: 1.0, a: 0.25, g: 0.5, lp: 160 });
    const t = 0.3;
    x.tone({ at: t, f: 60, to: [[160, 0.08], [40, 0.4]], dur: 0.5, g: 0.7, fm: { r: 1, i0: 2, i1: 0.3, id: 0.08 } });
    x.noise({ at: t, dur: 0.7, g: 0.6, bp: { f: 600, q: 0.7, to: [[1800, 0.1], [400, 0.7]] } });
    x.noise({ at: t + 0.05, dur: 0.8, a: 0.05, g: 0.15, hp: 3000, am: [19, 0.7, 'square'] });
    for (let i = 0; i < 4; i++) x.tone({ at: t + rnd(0.15, 0.6), f: rnd(90, 140), to: [[rnd(200, 300), 0.05], [70, 0.15]], dur: 0.16, g: 0.2 });
  } },
  lightning: { g: 1.01, cap: 2, fn(x) {   // crack + crackle + rolling thunder
    x.noise({ dur: 0.06, g: 0.8, hp: 2000 });
    x.noise({ at: 0.01, dur: 0.5, g: 0.55, lp: { f: 7000, to: [[400, 0.5]] }, am: [28, 0.6, 'square'], dist: true });
    x.tone({ f: 90, to: [[35, 0.5]], dur: 0.6, g: 0.6 });
    x.noise({ at: 0.15, dur: 2.0, a: 0.25, hold: 0.3, g: 0.45, lp: 140, am: [4, 0.5] });
  } },
  king_laugh: { g: 2.15, cap: 1, fn(x) {   // pompous "MWAH-ha-ha-HAAA!": FM voice through two vowel formants, wobbly
    for (const [at, d, f0, f1] of [[0, 0.32, 150, 210], [0.42, 0.13, 230, 215], [0.6, 0.13, 215, 200], [0.78, 0.13, 200, 185], [0.96, 0.32, 260, 165]]) {
      for (const [bp, g] of [[750, 0.35], [1200, 0.22]]) {
        x.tone({ at, f: f0, to: [[f1, d]], dur: d, a: 0.02, hold: d * 0.5, g, fm: { r: 1, i0: 2.2, i1: 1.8 }, bp: { f: bp, q: 4 }, vib: [9, 0.03] });
      }
      x.noise({ at, dur: 0.06, g: 0.1, bp: { f: 1500, q: 1 } });
    }
  } },
  tiny_squeak: { g: 3.33, vary: 0.1, cap: 2, fn(x) {   // the shrunken king's squeaky rant
    let at = 0;
    for (let i = 0; i < 7; i++) {
      const d = rnd(0.06, 0.12), f = rnd(900, 1500);
      x.tone({ at, type: 'square', f, to: [[f * rnd(0.7, 1.4), d]], dur: d, a: 0.005, g: 0.12, lp: { f: 3000, q: 3 }, vib: [30, 0.06] });
      at += d + rnd(0.02, 0.05);
    }
  } },
  bomb_fuse: { g: 1.25, cap: 3, hold: true, fn(x) {   // sizzle + sparks
    const dur = 1.5 + (x.hold || 0);
    x.noise({ dur, a: 0.03, hold: dur - 0.1, g: 0.22, hp: 3500, am: [33, 0.6, 'square'] });
    x.noise({ dur, a: 0.03, hold: dur - 0.1, g: 0.08, bp: { f: 6000, q: 2 } });
    for (let i = 0, n = Math.floor(dur / 0.14); i < n; i++) x.noise({ at: i * 0.14 + rnd(0, 0.1), dur: 0.012, g: rnd(0.1, 0.3), hp: 4000 });
  } },
  bomb_blast: { g: 0.62, vary: 0.05, cap: 3, fn(x) {
    x.tone({ f: 140, to: [[35, 0.4]], dur: 0.55, g: 0.85 });
    x.noise({ dur: 0.6, g: 0.7, lp: { f: 5000, to: [[250, 0.55]] }, dist: true });
    x.noise({ dur: 0.05, g: 0.5, hp: 2000 });
    x.noise({ at: 0.05, dur: 0.5, g: 0.12, hp: 2500, am: [21, 0.8, 'square'] });
  } },
  shield_block: { g: 1.01, vary: 0.05, fn(x) {   // enemy shield: heavier, lower clunk than `block`
    x.tone({ f: 560, dur: 0.35, g: 0.28, fm: { r: 1.41, i0: 5, i1: 0.6, id: 0.05 } });
    x.tone({ f: 130, to: [[60, 0.1]], dur: 0.15, g: 0.6 });
    x.noise({ dur: 0.05, g: 0.4, bp: { f: 1100, q: 1 } });
  } },
  // ---- UI
  menu_back: { g: 3.79, cap: 2, fn(x) {
    x.tone({ type: 'square', f: 1319, dur: 0.06, g: 0.09, lp: 6000 });
    x.tone({ at: 0.06, type: 'square', f: 880, dur: 0.12, g: 0.09, lp: 5000 });
  } },
  join_ui: { g: 3.6, cap: 2, fn(x) {
    [1047, 1319, 1568].forEach((f, i) => x.tone({ at: i * 0.06, type: 'square', f, dur: i === 2 ? 0.2 : 0.06, g: 0.08, lp: 6000 }));
    x.bell(0.12, 3136, 0.3, 0.05);
  } },
  controller_connected: { g: 3.67, cap: 2, fn(x) {
    x.noise({ dur: 0.015, g: 0.3, hp: 3000 });
    x.tone({ at: 0.02, type: 'square', f: 784, dur: 0.07, g: 0.09, lp: 5000 });
    x.tone({ at: 0.1, type: 'square', f: 1175, dur: 0.14, g: 0.09, lp: 5000 });
  } },
});

// ================================================================================================= Book 2 (Skull Island)
// Everything below is ADDED for Book 2 (docs/SKULL_ISLAND.md); nothing above is changed.  New instruments, drum lanes,
// songs, jingles and sfx; Book 1 / Book 3 tracks and sounds are untouched.
//   Tracks: sigull (the Blue Gull: sea shanty, 12/8)  sikraken (the Kraken stage: the shanty in a storm)  siboss (Blunderbeard:
//   a pirate reel)  silevi (the Leviathan: the reel reordered)  sikrakenboss  simap  sistorm (the Storm Sea ride)  sicave
//   siswamp  sicell  sipalace (a masquerade waltz)  sirageboss / sielderboss / sislothboss (one "feelings" boss theme, three
//   arrangements)  simalachar (the finale)  siending (the epilogue).  Jingles: si_wedge, si_sunkey.
// Book 2's own motifs: the shanty hook (A D D E F E D A over Dm-C), Malachar's mask motif (D Bb A Ab G: a minor-6th leap
// and a chromatic slide), Dodongo's rising triad (from Book 3) in the feelings bosses.

// ---- instruments (2-op FM presets, same engine as above)
Object.assign(INST, {
  // musette accordion: modulator at 2x = odd harmonics (a reed), a detuned reed pair beating gently
  accordion: preset({ r: 2, i0: 1.4, ip: 2.2, ia: 0.03, i1: 1.8, id: 0.25, a: 0.016, d: 0.5, s: 0.88, rel: 0.05, g: 0.3, det: 16 }),
  // solo fiddle: a bowed swell, a little scoop into the note, delayed vibrato
  fiddle:    preset({ r: 1, i0: 1.1, ip: 2.4, ia: 0.05, i1: 1.8, id: 0.2, a: 0.028, d: 0.4, s: 0.85, rel: 0.08, g: 0.55, scoop: 14, vib: [5.8, 16] }),
  // comic tuba: soft blat and a big scoop ("bwomp")
  tuba:      preset({ r: 1, i0: 0.4, ip: 1.8, ia: 0.05, i1: 1.0, id: 0.25, a: 0.025, d: 0.5, s: 0.75, rel: 0.08, g: 0.9, scoop: 30 }),
  // wooden mallet: a quick index burst, then nearly a sine
  marimba:   preset({ r: 4, i0: 1.3, i1: 0, id: 0.022, a: 0.002, d: 0.2, s: 0, rel: 0.05, g: 0.6 }),
  // steel pan: bright "bwang" that mellows
  steelpan:  preset({ r: 1, i0: 2.2, i1: 0.7, id: 0.07, a: 0.003, d: 0.45, s: 0, rel: 0.15, g: 0.65 }),
  harp:      preset({ r: 1, i0: 1.5, i1: 0.2, id: 0.08, a: 0.003, d: 0.7, s: 0, rel: 0.25, g: 0.5 }),
  // murky swamp pad: slow swell, wide detune, a slow wobble
  murk:      preset({ r: 1, i0: 0.5, ip: 0.8, ia: 0.6, i1: 0.6, id: 1, a: 0.45, d: 1, s: 1, rel: 0.6, g: 0.32, det: 22, cw: 'triangle', vib: [0.4, 9] }),
});

// ---- drum lanes
Object.assign(DRUM, {
  st(E, o, t, v) {   // boot stomp on wooden planks
    pHit(E, o, t, { f0: 130, f1: 55, ft: 0.05, dur: 0.24, g: 0.85 * v });
    pHit(E, o, t, { type: 'triangle', f0: 230, f1: 160, ft: 0.03, dur: 0.08, g: 0.3 * v });
    nzHit(E, o, t, { lp: 1100, dur: 0.07, g: 0.35 * v });
  },
  tb(E, o, t, v) {   // tambourine: a shake and the jingles
    nzHit(E, o, t, { hp: 6000, dur: 0.07, g: 0.14 * v });
    nzHit(E, o, t, { bp: 9000, q: 5, dur: 0.16, g: 0.16 * v });
  },
  cg(E, o, t, v) {   // high conga
    pHit(E, o, t, { f0: 440, f1: 340, ft: 0.025, dur: 0.17, g: 0.42 * v });
    nzHit(E, o, t, { bp: 2200, q: 1.4, dur: 0.018, g: 0.2 * v });
  },
  cl(E, o, t, v) {   // low conga
    pHit(E, o, t, { f0: 300, f1: 215, ft: 0.035, dur: 0.24, g: 0.48 * v });
    nzHit(E, o, t, { bp: 1500, q: 1.4, dur: 0.018, g: 0.18 * v });
  },
  bl(E, o, t, v) { pHit(E, o, t, { f0: 240, f1: 640, ft: 0.06, dur: 0.08, g: 0.28 * v }); },   // a swamp bubble
  fr(E, o, t, v) {   // a frog: "rib-bit"
    fmHit(E, o, t, { f: 210, r: 1, i0: 4, i1: 1.5, id: 0.03, dur: 0.07, g: 0.22 * v });
    fmHit(E, o, t + 0.11, { f: 190, r: 1, i0: 4, i1: 1.5, id: 0.03, dur: 0.09, g: 0.22 * v });
  },
  zz(E, o, t, v) {   // a cartoon snore: a fluttering breath in, then a little whistle out (~1.4 s)
    const c = E.ctx;
    const src = c.createBufferSource(); src.buffer = E.noise; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(320, t); bp.frequency.exponentialRampToValueAtTime(620, t + 0.7);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * v, t + 0.55); g.gain.linearRampToValueAtTime(0, t + 0.8);
    const am = c.createGain(); am.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.frequency.value = 26;
    const lg = c.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain);
    src.connect(bp); bp.connect(g); g.connect(am); am.connect(o);
    src.start(t, Math.random() * 1.5); src.stop(t + 0.82); lfo.start(t); lfo.stop(t + 0.82);
    pHit(E, o, t + 0.85, { f0: 1100, f1: 650, ft: 0.5, dur: 0.55, g: 0.05 * v });
  },
});

// ------------------------------------------------------------------ SIGULL: Stage 1, the Blue Gull.  Sea shanty, D dorian, 12/8 (spb 12), 108
// Accordion lead over stomps, claps and a tambourine; guitar-ish pluck chops on the "pah" of each beat; a jig bass.
// GA verse (Dm-C, the dorian G major in bar 7) -> GB the "HEAVE-HO" chorus in F (crew hits on beats 1 and 3) -> GA2 the verse
// with a fiddle descant -> GC the night sea (fiddle, rolling harp, lantern-quiet) -> GB2 the chorus with a fiddle jig on top.
SONGS.sigull = {
  level: 1.1, bpm: 108, spb: 12, bassLow: 33, echo: { steps: 3, fb: 0.24, wet: 0.17 },
  inst: { lead: 'accordion', lead2: 'fiddle', harm: 'accordion', stab: 'pluck', pad: 'accordion', arp: 'harp' },
  mix: { lead: 0.52, lead2: 0.2, harm: 0.24, stab: 0.22, pad: 0.07, bass: 0.6, drums: 0.62, choir: 0.16, arp: 0.14 },
  intro: ['GI'], loop: ['GA', 'GB', 'GA2', 'GC', 'GB2'],
  templates: {
    JIG: 'R:2 r:1 5:2 r:1 R:2 r:1 5:2 O:1',
    JIG2: 'R:2 R:1 5:2 R:1 O:2 5:1 3:2 5:1',
    STOMP: 'R:2 O:1 R:2 O:1 R:2 O:1 5:2 O:1',
    LONG: 'R:3 R:3 5:3 R:3',
  },
  drums: {
    GI1: { st: 'X.....X.....', k: 'X.....X.....' },
    GI2: { st: 'X.....X.....', c: '...X.....X..', s: '........gxXX' },
    GA:  { st: 'X.....X.....', c: '...X.....X..', tb: 'x.gx.gx.gx.g' },
    GA2: { st: 'X.....X..x..', c: '...X.....X.x', tb: 'x.gx.gx.gx.g' },
    GAF: { st: 'X.....X.....', c: '...X........', s: '......gxgxXX' },
    GB:  { k: 'X.....X.....', st: 'X..X..X..X..', c: '...X.....X..', tb: 'x.xx.xx.xx.x' },
    GB2: { k: 'X.....X..x..', st: 'X..X..X..X..', c: '...X.....X.x', tb: 'x.xx.xx.xx.x' },
    GH:  { k: 'X.....X.....', st: 'X.....X.....', s: '......X.....' },          // the "HEAVE ... HO!" bars
    GN:  { st: 'X...........', wb: '...g.....g..', sh: 'g.gg.gg.gg.g' },
    GN2: { st: 'X.....x.....', wb: '...g.....g..', sh: 'g.gg.gg.gg.g' },
    GR1: { st: 'X..X..X..X..', s: '......ggxxxx' },
    GR2: { st: 'X..X..X..X..', k: 'X..X..X..X..', s: 'xxxxxxXXXXXX' },
  },
  sections: {
    GI: {
      bars: 2, chords: 'Dm A7', bassLine: 'D2:3 D2:3 D2:3 D2:3 | A1:3 A1:3 A1:3 r:3',
      lead: 'r:12 | r:6 A4:1 C#5:1 E5:1 G5:2 E5:1', stab: 'X.....X.....|X.....X.....', drums: 'GI1 GI2',
    },
    GA: {
      bars: 8, chords: 'Dm C Dm C,Dm F C G C7', bass: ['JIG', 'JIG', 'JIG', 'JIG2'],
      lead: [
        'A4:2 D5:1 D5:2 E5:1 F5:2 E5:1 D5:2 A4:1',      // the hook
        'G4:2 C5:1 C5:2 D5:1 E5:3 C5:3',
        'A4:2 D5:1 D5:2 E5:1 F5:2 G5:1 A5:2 F5:1',
        'G5:2 E5:1 C5:2 E5:1 D5:6',
        'C5:2 F5:1 F5:2 G5:1 A5:3 C6:3',                 // phrase 2 climbs into F
        'G5:2 E5:1 C5:2 E5:1 G5:6',
        'B4:2 D5:1 G5:2 A5:1 B5:3 G5:3',                 // the dorian G major
        'G5:2 F5:1 E5:2 D5:1 C5:2 D5:1 E5:3',
      ].join(' | '),
      harm: true, mute: { harm: range(1, 4) },
      stab: '..x..x..x..x', drums: 'GA+ GA GA GA2 GA GA GA GAF',
    },
    GB: {
      bars: 8, chords: 'F C Dm Bb,C F C7 Bb,C F,A', bass: 'STOMP',
      lead: [
        'C5:3 F5:3 A5:3 F5:3',                           // HEAVE - HO, a - WAY
        'G5:2 F5:1 E5:2 F5:1 G5:6',
        'A5:3 F5:3 D5:2 E5:1 F5:3',
        'D5:2 F5:1 Bb5:3 C6:2 Bb5:1 G5:3',
        'C5:3 F5:3 A5:3 C6:3',
        'C6:2 Bb5:1 G5:2 A5:1 Bb5:3 G5:3',
        'F5:2 G5:1 A5:2 Bb5:1 C6:2 A5:1 G5:3',
        'F5:3 A5:3 E5:2 C#5:1 A4:3',
      ].join(' | '),
      harm: true, choir: true,
      stab: 'X.....X.....|..x..x..x..x|..x..x..x..x|..x..x..x..x|X.....X.....|..x..x..x..x|..x..x..x..x|X..X..X.....',
      drums: 'GH+ GB GB GB2 GH+ GB GB GAF',
    },
    GA2: {
      ref: 'GA', harm: true, mute: {},
      lead2: 'A5:12 | G5:12 | A5:6 D6:6 | G5:6 A5:6 | C6:12 | G5:12 | B5:6 D6:6 | Bb5:6 G5:6',
      drums: 'GA+ GB GA GA2 GA GB GA GAF',
    },
    GC: {   // the night sea: the fiddle sings, the harp rolls like waves, lanterns creak
      bars: 8, chords: 'Dm Bb Gm A Dm Bb Gm,C C7', bass: 'LONG', inst: { lead: 'fiddle' },
      lead: [
        'D5:3 F5:3 A5:5 G5:1',
        'F5:3 D5:3 Bb4:6',
        'G4:3 Bb4:3 D5:5 E5:1',
        'C#5:6 E5:3 A4:3',
        'D5:3 F5:3 A5:3 D6:3',
        'D6:5 C6:1 Bb5:3 F5:3',
        'G5:3 Bb5:3 C6:3 E5:3',
        'E5:3 G5:3 Bb5:3 C6:3',
      ].join(' | '),
      harm: true, mute: { harm: range(1, 4) }, pad: true,
      arp: { pat: '0 1 2 3 2 1 0 1 2 3 2 1', oct: 4 },
      drums: 'GN+ GN GN GN2 GN GN GR1 GR2',
    },
    GB2: {
      ref: 'GB',
      lead2: [
        'C6:2 A5:1 F5:2 A5:1 C6:2 D6:1 C6:2 A5:1',
        'G5:2 E5:1 C5:2 E5:1 G5:2 A5:1 G5:2 E5:1',
        'F5:2 A5:1 D6:2 A5:1 F5:2 A5:1 D6:3',
        'D6:2 C6:1 Bb5:3 C6:2 D6:1 E6:3',
        'C6:3 A5:3 C6:2 D6:1 C6:3',
        'Bb5:2 G5:1 E5:2 G5:1 Bb5:2 C6:1 Bb5:3',
        'D6:3 Bb5:3 E6:3 C6:3',
        'C6:3 A5:3 C#6:3 E6:3',
      ].join(' | '),
      drums: 'GH+ GB GB GB2 GH+ GB2 GB2 GR2',
    },
  },
};

// ------------------------------------------------------------------ SIKRAKEN: Stage 2, the Kraken's sea.  The shanty in a storm: D minor, 12/8, 116
// Brass takes the hook, strings roll in triplets, wind swells and timpani; the chorus turns dark (Bb F Gm Dm ... Eb A).
SONGS.sikraken = {
  level: 1.0, bpm: 116, spb: 12, bassLow: 33, echo: { steps: 3, fb: 0.28, wet: 0.2 },
  inst: { lead2: 'fiddle', pad: 'strings', arp: 'strings' },
  mix: { pad: 0.13, lead2: 0.28, arp: 0.12, choir: 0.2, stab: 0.24 },
  intro: ['KI'], loop: ['KA', 'KB', 'KA2', 'KC'],
  templates: {
    ROLL: 'R:2 R:1 O:2 R:1 R:2 R:1 5:2 O:1',
    ROLL2: 'R:2 R:1 O:2 R:1 5:2 5:1 O:2 5:1',
    DEEP: 'R:3 R:3 R:3 O:3',
  },
  drums: {
    KI1: { w: 'X', tp: 'X.....X.....' },
    KI2: { tp: 'X..X..X..X..', s: '......ggxxXX' },
    KA:  { k: 'X.....X.....', s: '...X.....X..', h: 'x.gx.gx.gx.g', st: 'X.....X.....' },
    KA2: { k: 'X..x..X.....', s: '...X.....X.g', h: 'x.gx.gx.gx.g', st: 'X.....X.....' },
    KW:  { k: 'X.....X.....', s: '...X.....X..', h: 'x.gx.gx.gx.g', w: 'X' },
    KF:  { k: 'X.....X.....', s: '...X..xgxXXX', tp: '......X..X..' },
    KB:  { k: 'X..X..X..X..', s: '...X.....X..', c: '...x.....x..', h: 'x.xx.xx.xx.x', tp: 'X...........' },
    KC:  { w: 'X', tp: 'X.....X.....', k: 'X...........' },
    KC2: { tp: 'X..X..X..X..', k: 'X.....X.....' },
    KC3: { k: 'X..X..X..X..', s: '...X.....X..', tp: 'X.....X.....' },
    KR:  { k: 'X..X..X..X..', s: 'ggxxxxxxXXXX', tp: '......xxxXXX' },
  },
  sections: {
    KI: { bars: 2, chords: 'Dm Dm', bass: 'DEEP', mute: { bass: [1] }, pad: true, lead: 'r:12 | D4:3 F4:3 A4:6', drums: 'KI1 KI2' },
    KA: {
      bars: 8, chords: 'Dm C Dm C,Dm Bb F Gm A7', bass: ['ROLL', 'ROLL', 'ROLL', 'ROLL2'],
      lead: [
        'A4:2 D5:1 D5:2 E5:1 F5:2 E5:1 D5:2 A4:1',
        'G4:2 C5:1 C5:2 D5:1 E5:3 C5:3',
        'A4:2 D5:1 D5:2 E5:1 F5:2 G5:1 A5:2 F5:1',
        'G5:2 E5:1 C5:2 E5:1 D5:6',
        'D5:2 F5:1 F5:2 G5:1 Bb5:3 D6:3',
        'C6:2 A5:1 F5:2 A5:1 C6:6',
        'Bb4:2 D5:1 G5:2 A5:1 Bb5:3 G5:3',
        'A5:2 G5:1 E5:2 C#5:1 A4:3 r:3',
      ].join(' | '),
      arp: { pat: ARP_TRIP, oct: 4 }, pad: true,
      stab: '0|0|0|X.....X.....|0|0|0|X..X..X.....', drums: 'KW+ KA KA KA2 KW KA KA KF',
    },
    KB: {   // the chorus, dark: the HEAVE-HO over Bb F Gm Dm and the Neapolitan Eb
      bars: 8, chords: 'Bb F Gm Dm Bb F Eb A', bass: 'ROLL',
      lead: [
        'D5:3 F5:3 Bb5:3 F5:3',
        'A5:2 G5:1 F5:2 G5:1 A5:6',
        'Bb5:3 G5:3 D5:2 D5:1 F5:3',
        'A5:2 F5:1 D5:2 F5:1 A5:6',
        'D5:3 F5:3 Bb5:3 D6:3',
        'C6:2 Bb5:1 A5:2 G5:1 A5:2 F5:1 C5:3',
        'G5:3 Bb5:3 Eb6:3 D6:2 C6:1',
        'C#6:6 E5:2 F5:1 E5:3',
      ].join(' | '),
      harm: true, choir: true, arp: { pat: ARP_TRIP, oct: 4 },
      stab: 'X.....X.....|0|0|0|X.....X.....|0|X..X..X.....|X.....X.....', drums: 'KB+ KB KB KB KB+ KB KB KF',
    },
    KA2: {
      ref: 'KA', harm: true,
      lead2: 'A5:12 | G5:12 | A5:6 D6:6 | G5:6 A5:6 | F5:12 | A5:12 | G5:6 D6:6 | E6:6 C#6:6',
      drums: 'KA+ KA KA KA2 KW KA KA2 KF',
    },
    KC: {   // the storm breaks over the deck: wind, timpani, strings; the hook climbs back
      bars: 8, chords: 'Dm Dm Bb Bb Gm Dm A A', bass: 'DEEP', inst: { lead2: 'strings' },
      lead: 'r:48 | G4:2 Bb4:1 D5:2 G5:1 Bb5:6 | A5:2 F5:1 D5:2 F5:1 A5:6 | C#5:2 E5:1 A5:2 C#6:1 E6:3 r:3 | E6:3 C#6:3 A5:3 E5:3',
      lead2: 'D5:12 | F5:12 | F5:12 | D5:12 | D5:12 | F5:12 | E5:12 | C#5:12',
      choir: true, pad: true, arp: { pat: ARP_TRIP, oct: 5, inst: 'bell' }, mute: { arp: range(5, 8) },
      drums: 'KC+ KC2 KC KC2 KC3 KC3 KC3 KR',
    },
  },
};

// ------------------------------------------------------------------ SIBOSS: Captain Blunderbeard.  A pirate reel: E minor, 152
// Fiddle reel over a galloping octave bass and four-on-the-floor; PB the brass "YO-HO" pirate theme with fiddle answers;
// PC a sneaky accordion breakdown on toms and stomps that builds back; PA2 the reel with twin fiddles and strings.
SONGS.siboss = {
  bpm: 152, bassLow: 33, echo: { steps: 3, fb: 0.24, wet: 0.16 },
  inst: { lead: 'fiddle', harm: 'fiddle', lead2: 'strings', arp: 'pluck' },
  mix: { lead: 0.5, harm: 0.22, stab: 0.19, bass: 0.6, arp: 0.16 },
  intro: ['PI'], loop: ['PA', 'PB', 'PC', 'PA2'],
  templates: {
    REEL: 'R:2 R:1 R:1 O:2 R:1 R:1 R:2 R:1 R:1 5:2 O:2',
    REEL2: 'R:2 R:1 R:1 O:2 R:1 R:1 5:2 5:1 5:1 O:2 5:2',
    SNEAK: 'R:2 r:2 5:2 r:2 R:2 r:2 5:2 O:2',
  },
  drums: {
    PI1: { k: 'X.......X.......', tp: 'X.......X.......', x: 'X' },
    PI2: { k: 'X...X...X...X...', tp: 'X...X...X.X.XXXX', s: '........ggxxxXXX' },
    PA:  { k: 'X..X....X.X.X...', s: '....X.......X...', h: 'xgxgxgxgxgxgxgxg' },
    PA2: { k: 'X...X...X...X.x.', s: '....X.......X..x', h: 'xgxgxgxgxgxgxgxg', tb: '..x...x...x...x.' },
    PF:  { k: 'X...X...X.......', s: '....X...xxxxXXXX', tl: '........x.x.x.x.' },
    PB:  { k: 'X..X..X...X..X..', s: '....X.......X...', c: '....x.......x...', tb: 'x.x.x.x.x.x.x.x.' },
    PC:  { k: 'X.......X.......', st: '....X.......X...', tl: 'x..x..x...x..x..', tb: '..x...x...x...x.' },
    PC2: { k: 'X...X...X...X...', st: '....X.......X...', tl: 'x..x..x...x..x..', s: '............x.x.' },
    PR:  { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX', tp: '........xxxxXXXX' },
    LI1: { w: 'X', tp: 'X.......X.......' },
    LI2: { tp: 'X...X...X...X...', k: 'X.......X.......', w: 'X' },
    LI3: { tp: 'X...X...X...X...', k: 'X...X...X...X...' },
    LI4: { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX', tp: '........xxxxXXXX' },
  },
  sections: {
    PI: {   // a brass alarm: E minor up to the B7
      bars: 2, chords: 'Em B7', inst: { lead: 'brass' },
      bassLine: 'E2:3 E2:3 E2:2 E2:8 | B1:3 B1:3 B1:2 B1:4 D#2:2 F#2:2',
      lead: 'E5:3 E5:1 G5:4 B5:8 | A5:3 G5:1 F#5:4 D#5:8', harm: true,
      stab: 'X..X..X.X.......|X..X..X.X...X.X.', drums: 'PI1 PI2',
    },
    PA: {
      bars: 8, chords: 'Em D Em B7 Em D C B7', bass: ['REEL', 'REEL', 'REEL', 'REEL2'],
      lead: [
        'E5:2 B4:2 E5:2 F#5:1 E5:1 G5:4 F#5:2 E5:2',
        'D5:2 A4:2 D5:2 E5:2 F#5:4 E5:2 D5:2',
        'E5:2 B4:2 E5:2 F#5:2 G5:2 A5:2 B5:4',
        'A5:2 G5:2 F#5:2 E5:2 D#5:4 B4:4',
        'G5:2 F#5:2 G5:2 A5:2 B5:4 E6:4',
        'D6:2 C6:2 B5:2 A5:2 F#5:4 D5:4',
        'E5:2 G5:2 C6:2 B5:2 C6:2 G5:2 E5:2 G5:2',
        'F#5:4 A5:2 F#5:2 D#5:4 B4:4',
      ].join(' | '),
      arp: { pat: '. . 1 . . . 1 . . . 1 . . . 1 .', oct: 4 },
      stab: 'X.....X...X.....', drums: 'PA+ PA PA PA2 PA PA PA PF',
    },
    PB: {   // the pirate theme on brass; the fiddle answers in the gaps
      bars: 8, chords: 'Am D G Em C Am B7 B7', bass: 'REEL', inst: { lead: 'brass', harm: 'brass2', lead2: 'fiddle' },
      lead: [
        'A4:3 A4:1 C5:2 E5:2 A5:6 G5:2',
        'F#5:3 E5:1 D5:4 A4:8',
        'B4:3 B4:1 D5:2 G5:2 B5:6 A5:2',
        'G5:3 F#5:1 E5:4 B4:8',
        'C5:3 C5:1 E5:2 G5:2 C6:6 B5:2',
        'A5:3 B5:1 C6:4 E6:6 D6:2',
        'D#6:4 C6:2 B5:2 A5:4 F#5:4',
        'B5:8 r:4 B4:2 D#5:2',
      ].join(' | '),
      lead2: 'r:16 | r:8 A5:1 B5:1 A5:1 F#5:1 D5:4 | r:16 | r:8 G5:1 A5:1 G5:1 E5:1 B4:4 | r:64',
      harm: true, pad: true, stab: 'X..X..X.........', drums: 'PB+ PB PB PB PB PB PB PF',
    },
    PC: {   // sneaking up on deck: the accordion low and staccato, then the strings swell
      bars: 8, chords: 'Em Em C C Am Am B7 B7', bass: 'SNEAK', inst: { lead: 'accordion' },
      lead: [
        'E4:2 r:2 G4:2 r:2 B4:2 A4:2 G4:2 F#4:2',
        'E4:2 r:2 G4:2 r:2 B4:4 r:4',
        'E4:2 r:2 G4:2 r:2 C5:2 B4:2 A4:2 G4:2',
        'E4:2 r:2 G4:2 r:2 C5:4 r:4',
        'A4:2 C5:2 E5:2 A5:2 C6:2 A5:2 E5:2 C5:2',
        'A4:2 C5:2 E5:2 A5:2 C6:4 A5:4',
        'B4:2 D#5:2 F#5:2 B5:2 A5:2 F#5:2 D#5:2 F#5:2',
        'B5:4 A5:4 F#5:4 D#5:4',
      ].join(' | '),
      lead2: 'r:64 | E5:16 | E5:16 | D#5:16 | F#5:16',
      drums: 'PC+ PC PC PC PC2 PC2 PC2 PR',
    },
    PA2: {
      ref: 'PA', harm: true, stab: 'X..X..X...X.X...',
      lead2: 'B4:16 | A4:16 | B4:16 | B4:16 | B4:16 | A4:16 | G4:16 | F#4:16',
      drums: 'PA+ PA2 PA PA2 PA PA2 PA PR',
    },
    LI: {   // (silevi's intro) the sea serpent rises: wind, timpani, a low brass call
      bars: 4, chords: 'Em Em C B7', inst: { lead: 'brass' },
      bassLine: 'E2:16 | E2:16 | C2:16 | B1:4 B1:4 B1:2 B1:2 B1:2 B1:2', pad: true,
      lead: 'r:16 | B4:4 E5:4 G5:4 B5:4 | C6:8 G5:8 | F#5:4 A5:4 B5:8', stab: '0|0|X.......X.......|X...X...X...X...',
      drums: 'LI1 LI2 LI3 LI4',
    },
  },
};
// The Leviathan (Stage 1's mini-boss): the same reel family, a slower serpent-rising intro, and the brass theme first so the
// two fights in one stage open differently.
SONGS.silevi = { ...SONGS.siboss, bpm: 146, echo: { steps: 3, fb: 0.34, wet: 0.26 }, intro: ['LI'], loop: ['PB', 'PA2', 'PC', 'PA'] };

// ------------------------------------------------------------------ SIKRAKENBOSS: the Kraken.  C minor, 138, big and stormy
// A chromatic "tentacle" bass riff, timpani, wind, a choir; strings in a 16th tremolo in the chorus; QC the eye of the storm.
SONGS.sikrakenboss = {
  bpm: 138, bassLow: 31, echo: { steps: 3, fb: 0.28, wet: 0.2 },
  inst: { lead2: 'strings', pad: 'strings', arp: 'strings' },
  mix: { choir: 0.24, stab: 0.28, bass: 0.62, arp: 0.12, pad: 0.12 },
  intro: ['QI'], loop: ['QA', 'QB', 'QC', 'QA2'],
  templates: {
    TENT: 'R:2 R:1 R:1 +3:2 R:2 +2:2 +1:2 R:2 O:2',      // the tentacle slithers: root, minor third, down chromatically
    TENTV: 'R:2 R:1 R:1 +4:2 R:2 +2:2 +1:2 R:2 O:2',     // (over a major chord)
    LONGB: 'R:8 R:4 O:4',
  },
  drums: {
    QI1: { w: 'X', tp: 'X...............' },
    QI2: { tp: 'X.......X.......', w: 'X' },
    QI3: { tp: 'X...X...X...X...', k: 'X.......X.......' },
    QI4: { tp: 'X.X.X.X.XXXXXXXX', s: 'ggggxxxxxxxxXXXX', k: 'X...X...X...X...' },
    QA:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', tp: 'X.......X.......' },
    QA2: { k: 'X..X..X.X..X..X.', s: '....X.......X..x', h: 'xgxgxgxgxgxgxgxg', tp: 'X.......X...X...' },
    QF:  { k: 'X...X...X.......', s: '....X...', th: '........XX', tm: '..........XX', tl: '............XXXX' },
    QB:  { k: 'X.X.X.X.X.X.X.X.', s: '....X.......X...', c: '....x.......x...', h: 'xgxgxgxgxgxgxgxg' },
    QC:  { k: 'X.......X.......', tp: 'X.......X.......', w: 'X' },
    QCb: { k: 'X.......X.......', tp: 'X.......X..x.x..' },
    QC2: { k: 'X...X...X...X...', tp: 'X..X..X.X..X..X.', s: '....X.......X...' },
    QR:  { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX', tp: '........xxxxXXXX' },
  },
  sections: {
    QI: {
      bars: 4, chords: 'Cm Cm Cm G', choir: true, mute: { choir: [1] },
      bassLine: 'r:16 | C2:16 | C2:2 C2:1 C2:1 Eb2:2 C2:2 D2:2 Db2:2 C2:2 C3:2 | G1:4 G1:4 G1:2 G1:2 G1:2 G1:2',
      lead: 'r:48 | G4:4 B4:4 D5:4 F5:4', stab: '0|0|0|X...X...X.X.X.X.', drums: 'QI1 QI2 QI3 QI4',
    },
    QA: {
      bars: 8, chords: 'Cm Ab Fm G Cm Ab Db G', bass: 'TENT', bassAlt: { Ab: 'TENTV', Db: 'TENTV', G: 'TENTV' },
      lead: [
        'G4:4 C5:4 Eb5:4 G5:4',
        'Ab5:6 G5:2 Eb5:4 C5:4',
        'F5:4 Ab5:4 C6:6 Bb5:2',
        'B5:8 G5:4 D5:4',
        'C6:4 G5:4 Eb6:6 D6:2',
        'C6:6 Bb5:2 Ab5:4 Eb5:4',
        'Db6:4 C6:4 Ab5:4 F5:4',
        'B5:6 C6:2 D6:8',
      ].join(' | '),
      pad: true, stab: 'X.....X.........', drums: 'QA+ QA QA QA QA QA QA QF',
    },
    QB: {   // the storm chorus: choir, twin brass, string tremolo
      bars: 8, chords: 'Ab Bb Cm Cm Ab Bb G G', bass: 'TENT', bassAlt: { Ab: 'TENTV', Bb: 'TENTV', G: 'TENTV' },
      lead: [
        'Eb5:3 G5:1 Ab5:4 C6:8',
        'D5:3 F5:1 F5:4 Bb5:8',
        'Eb5:3 G5:1 C6:4 Eb6:6 D6:2',
        'C6:8 G5:8',
        'Ab5:4 C6:4 Eb6:4 C6:4',
        'D6:4 Bb5:4 F5:4 D5:4',
        'D5:4 G5:4 B5:4 D6:4',
        'D6:6 C6:2 B5:4 G5:4',
      ].join(' | '),
      harm: true, choir: true, arp: { pat: '0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1', oct: 4 },
      stab: 'X..X..X.........', drums: 'QB+ QB QB QB QB+ QB QB QF',
    },
    QC: {   // the eye of the storm: bells and choir, then the riff and the strings climb back
      bars: 8, chords: 'Cm Cm Ab Ab Fm Fm G G',
      bass: ['LONGB', 'LONGB', 'LONGB', 'LONGB', 'TENT', 'TENT', 'TENTV', 'TENTV'],
      lead2: 'G5:8 Eb5:4 D5:2 Db5:2 | C5:16 | Eb5:8 C5:4 Bb4:2 A4:2 | Ab4:16 | C5:16 | Ab5:16 | G5:8 B5:8 | D6:16',   // (Malachar's slide, foreshadowed)
      choir: true, pad: true, arp: { pat: ARP_EERIE, oct: 5, inst: 'bell' }, mute: { arp: range(5, 8) },
      drums: 'QC+ QCb QC QCb QC2 QC2 QC2 QR',
    },
    QA2: {
      ref: 'QA', harm: true, choir: true, arp: { pat: '0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1', oct: 4 },
      stab: 'X..X..X.X..X..X.', drums: 'QA2+ QA2 QA2 QA2 QA2 QA2 QA2 QR',
    },
  },
};

// ------------------------------------------------------------------ SIMAP: the island map.  G mixolydian / E minor, 104, adventurous
// Steel pan plays the shanty hook (now in G, with the sea's flat seventh) over marimba and congas; MB the mystery of the
// purple storm (flute, celesta, Em - Cmaj7 - Fmaj7 - B7); MC a brass horn call: off we go.
SONGS.simap = {
  level: 1.25, bpm: 104, bassLow: 31, echo: { steps: 3, fb: 0.3, wet: 0.22 },
  inst: { lead: 'steelpan', arp: 'marimba', bass: 'softbass', pad: 'strings', lead2: 'celesta' },
  mix: { lead: 0.42, arp: 0.18, pad: 0.12, bass: 0.56, drums: 0.56, lead2: 0.2 },
  intro: ['MI'], loop: ['MA', 'MB', 'MC'],
  templates: {
    ISLE: 'R:3 R:1 r:2 5:2 O:3 5:1 r:2 R:2',
    ISLE2: 'R:3 R:1 5:2 O:2 R:3 5:1 3:2 5:2',
    SOFT: 'R:6 5:2 O:4 5:4',
  },
  drums: {
    MI1: { sh: '..x...x...x...x.', cg: '..........x.x...' },
    MI2: { sh: '..x...x...x...x.', cg: '..........x.x...', cl: '..............xx' },
    MA:  { k: 'X.......X.......', cg: '....x.......x...', cl: '..............xx', sh: 'x.x.x.x.x.x.x.x.' },
    MA2: { k: 'X.......X.....x.', cg: '....x.......x.x.', cl: '..........x...xx', sh: 'x.x.x.x.x.x.x.x.' },
    MB:  { sh: '..g...g...g...g.', cg: '..........g.....' },
    MBF: { sh: '..g...g...g...g.', cl: '........x.x.xxxx' },
    MC:  { k: 'X.....X.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', cl: '..............xx' },
    MC2: { k: 'X.....X.X.....x.', s: '....X.......X..g', h: 'x.x.x.x.x.x.x.xx', cl: '..............xx' },
    MCF: { k: 'X.....X.X.......', s: '....X...xgxgXXXX' },
  },
  sections: {
    MI: {
      bars: 2, chords: 'G F', bass: 'ISLE', mute: { bass: [1] },
      arp: { pat: '0 . 2 . 1 2 . 2 0 . 2 . 1 2 . 2', oct: 4 }, lead2: 'r:12 D6:1 B5:1 G5:1 D5:1 | r:16', drums: 'MI1 MI2',
    },
    MA: {
      bars: 8, chords: 'G F G F,G C G/B Am,D G', bass: ['ISLE', 'ISLE', 'ISLE', 'ISLE2'],
      lead: [
        'D5:3 G5:1 G5:3 A5:1 B5:3 A5:1 G5:3 D5:1',      // the shanty hook, skipping
        'C5:3 F5:1 F5:3 G5:1 A5:4 F5:4',
        'D5:3 G5:1 G5:3 A5:1 B5:3 C6:1 D6:3 B5:1',
        'C6:3 A5:1 F5:3 A5:1 G5:8',
        'E5:3 G5:1 G5:3 A5:1 C6:4 E6:4',
        'D6:3 B5:1 G5:3 B5:1 D6:8',
        'C6:3 B5:1 A5:3 G5:1 F#5:4 A5:4',
        'G5:8 r:4 D5:2 E5:2',
      ].join(' | '),
      arp: { pat: '0 . 2 . 1 2 . 2 0 . 2 . 1 2 . 2', oct: 4 },
      lead2: 'r:16 | r:12 C6:1 A5:1 F5:1 C5:1 | r:32 | r:16 | r:12 B5:1 D6:1 G6:2 | r:32',
      drums: 'MA+ MA MA MA2 MA MA MA MA2',
    },
    MB: {   // the purple storm over the mountain: mysterious, never scary
      bars: 8, chords: 'Em Cmaj7 Em Cmaj7 Am Fmaj7 B7 B7', bass: 'SOFT', inst: { lead: 'flute', arp: 'celesta' },
      lead: [
        'B4:6 E5:2 G5:8',
        'G5:4 F#5:2 E5:2 B4:8',
        'B4:6 E5:2 G5:4 B5:4',
        'B5:6 A5:2 G5:4 E5:4',
        'A5:6 C6:2 E6:8',
        'E6:6 C6:2 A5:8',
        'D#6:6 B5:2 F#5:4 A5:4',
        'B5:8 r:8',
      ].join(' | '),
      pad: true, arp: { pat: '0 . . 2 . . 1 . . 3 . . 2 . . .', oct: 5 }, drums: 'MB MB MB MB MB MB MB MBF',
    },
    MC: {   // the horn call: adventure!
      bars: 8, chords: 'C D Bm Em C D Am,C D', bass: ['ISLE', 'ISLE', 'ISLE', 'ISLE2'], inst: { lead: 'brass' },
      lead: [
        'G4:3 C5:1 E5:4 G5:6 E5:2',
        'F#5:3 A5:1 D6:4 A5:8',
        'B5:6 A5:2 F#5:4 D5:4',
        'E5:3 G5:1 B5:4 E6:4 B5:4',
        'E6:4 D6:2 C6:2 G5:4 E5:4',
        'F#5:4 A5:4 D6:6 C6:2',
        'C6:4 B5:2 A5:2 G5:4 E5:4',
        'F#5:4 A5:4 D6:4 r:4',
      ].join(' | '),
      harm: true, mute: { harm: [1, 2, 3, 4] }, pad: true, arp: { pat: UPDOWN, oct: 4 }, drums: 'MC+ MC MC MC2 MC MC MC MCF',
    },
  },
};

// ------------------------------------------------------------------ SISTORM: the Storm Sea ride.  D minor -> D major, 144, heroic sailing
// Heard once from the top (the ride is ~96 s): RI + RA + RB are the storm (the intro, ~30 s), then the loop is the storm
// breaking: RC the shanty hook in D major, RD the soaring dawn theme, RE call-and-response with the kraken's smashes, RD2.
SONGS.sistorm = {
  bpm: 144, bassLow: 33, echo: { steps: 3, fb: 0.28, wet: 0.2 },
  inst: { lead2: 'strings', pad: 'strings', arp: 'strings' },
  mix: { arp: 0.11, pad: 0.13, choir: 0.2, stab: 0.26 },
  intro: ['RI', 'RA', 'RB'], loop: ['RC', 'RD', 'RE', 'RD2'],
  templates: {
    SAIL: 'R:2 R:1 R:1 O:2 R:1 R:1 R:2 R:1 R:1 5:2 O:2',
    ROW: 'R:2 R:2 O:2 R:2 R:2 R:2 O:2 5:2',
  },
  drums: {
    RI1: { w: 'X', tp: 'X...X...X...X...' },
    RI2: { tp: 'X.X.X.X.XXXXXXXX', s: 'ggggxxxxxxxxXXXX', k: 'X...X...X...X...' },
    RA:  { k: 'X...X...X...X...', s: '....X.......X...', h: 'xgxgxgxgxgxgxgxg', tp: 'X.......' },
    RA2: { k: 'X...X...X...X.x.', s: '....X.......X..x', h: 'xgxgxgxgxgxgxgxg' },
    RAW: { k: 'X...X...X...X...', s: '....X.......X...', h: 'xgxgxgxgxgxgxgxg', w: 'X' },
    RF:  { k: 'X...X...X.......', s: '....X...xxxxXXXX', tp: '........X.X.XXXX' },
    RB:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', tp: 'X.......X.......' },
    RBW: { k: 'X..X..X.X..X..X.', s: '....X.......X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', tp: 'X.......X.......', w: 'X' },
    RC:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', c: '....x.......x...', h: 'xgxgxgxgxgxgxgxg' },
    RC2: { k: 'X..X..X.X..X..x.', s: '....X.......X..g', c: '....x.......x...', h: 'xgxgxgxgxgxgxgxg' },
    RD:  { k: 'X.X.X.X.X.X.X.X.', s: '....X.......X...', h: 'xgxgxgxgxgxgxgxg', o: '..............x.' },
    RE:  { k: 'X.......X.......', tp: 'X.......X.......' },
    RE2: { k: 'X..X..X.X.......', tp: 'X..X..X.X.......', s: '............xxXX' },
    RR:  { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX', tp: '........xxxxXXXX' },
  },
  sections: {
    RI: { bars: 2, chords: 'Dm Dm', bass: 'ROW', mute: { bass: [1] }, pad: true, lead: 'r:16 | A4:4 D5:4 F5:4 A5:4', drums: 'RI1 RI2' },
    RA: {
      bars: 8, chords: 'Dm Bb Eb Dm Dm Bb Gm A', bass: 'SAIL',
      lead: [
        'A4:2 D5:2 D5:2 E5:2 F5:4 E5:2 D5:2',
        'D5:2 F5:2 F5:2 G5:2 Bb5:8',
        'Bb4:2 Eb5:2 Eb5:2 F5:2 G5:4 F5:2 Eb5:2',
        'F5:4 E5:2 C#5:2 D5:8',
        'A4:2 D5:2 F5:2 A5:2 D6:4 C6:2 A5:2',
        'Bb5:4 A5:2 G5:2 F5:4 D5:4',
        'G5:4 Bb5:4 D6:4 Bb5:4',
        'C#6:8 A5:4 E5:4',
      ].join(' | '),
      arp: { pat: UPDOWN, oct: 4 }, pad: true, stab: 'X.....X.........', drums: 'RAW+ RA RA RA2 RAW RA RA RF',
    },
    RB: {
      bars: 8, chords: 'Gm Gm Dm Dm Eb Eb A A', bass: 'SAIL',
      lead: [
        'G5:6 A5:2 Bb5:4 D6:4',
        'D6:4 C6:2 Bb5:2 G5:8',
        'F5:6 G5:2 A5:4 D6:4',
        'D6:4 C6:2 A5:2 F5:8',
        'G5:6 Bb5:2 Eb6:8',
        'Eb6:4 D6:2 C6:2 Bb5:8',
        'A5:4 C#6:4 E6:8',
        'E6:4 C#6:4 A5:4 E5:4',
      ].join(' | '),
      harm: true, choir: true, arp: { pat: UPDOWN, oct: 4 }, drums: 'RBW+ RB RB RB RBW+ RB RB RF',
    },
    RC: {   // the storm breaks: the shanty hook in D major, the bVI-bVII-I lift
      bars: 8, chords: 'D C G D D C Bb,C D', bass: 'SAIL',
      lead: [
        'A4:2 D5:2 D5:2 E5:2 F#5:4 E5:2 D5:2',
        'E5:2 G5:2 G5:2 A5:2 C6:4 B5:2 G5:2',
        'B5:4 A5:2 G5:2 D5:4 G5:4',
        'F#5:4 E5:2 D5:2 A5:8',
        'A4:2 D5:2 F#5:2 A5:2 D6:4 C#6:2 A5:2',
        'C6:4 B5:2 A5:2 G5:4 E5:4',
        'F5:2 Bb5:2 D6:4 E6:2 C6:2 G5:4',
        'D6:8 A5:4 F#5:4',
      ].join(' | '),
      harm: true, mute: { harm: range(1, 4) }, choir: true, arp: { pat: UPDOWN, oct: 4 },
      drums: 'RC+ RC RC RC2 RC+ RC RC RF',
    },
    RD: {   // the dawn: the soaring theme
      bars: 8, chords: 'G A F#m Bm G A D D', bass: 'SAIL',
      lead: [
        'B5:6 A5:2 G5:4 D6:4',
        'C#6:6 B5:2 A5:4 E6:4',
        'C#6:8 A5:4 F#5:4',
        'D6:6 C#6:2 B5:8',
        'G5:4 B5:4 D6:8',
        'E6:6 D6:2 C#6:4 A5:4',
        'D6:4 A5:4 F#5:4 A5:4',
        'D6:12 r:4',
      ].join(' | '),
      harm: true, choir: true, arp: { pat: UPDOWN, oct: 4 }, pad: true, drums: 'RD+ RD RD RD RD+ RD RD RF',
    },
    RE: {   // call and response: the crew calls, the kraken SMASHES
      bars: 8, chords: 'Bm Bm G G Em Em A A', bass: 'ROW',
      lead: 'B4:2 D5:2 F#5:2 B5:2 r:8 | r:16 | G4:2 B4:2 D5:2 G5:2 r:8 | r:16 | E5:2 G5:2 B5:2 E6:2 r:8 | r:16 | A5:2 C#6:2 E6:4 C#6:2 A5:2 E5:4 | A5:16',
      stab: '0|X..X..X.X.......|0|X..X..X.X.......|0|X..X..X.X.......|0|X...X...X...X...',
      arp: { pat: UPDOWN, oct: 4 }, pad: true, drums: 'RE RE2 RE RE2 RE RE2 RE RF',
    },
    RD2: {
      ref: 'RD', lead2: 'D5:16 | E5:16 | F#5:16 | F#5:16 | D5:16 | C#5:16 | A4:16 | A4:16',
      stab: 'X.....X.........', drums: 'RD+ RD RD RD RD+ RD RD RR',
    },
  },
};

// ------------------------------------------------------------------ SICAVE: the Cave of Rage.  A minor / A phrygian dominant, 132, hot drums
// Congas, toms and a lava bass ostinato (root, flat 7, flat 2); CA a punchy brass riff with band hits in its gaps; CB a
// fiery melody (A Bb C# D E F G); CC the lesson: STAY CALM -- the drums drop to a heartbeat, flute and harp; then back.
SONGS.sicave = {
  level: 1.06, bpm: 132, bassLow: 33, echo: { steps: 3, fb: 0.26, wet: 0.18 },
  mix: { stab: 0.24, bass: 0.62, drums: 0.68 },
  intro: ['CI'], loop: ['CA', 'CB', 'CC', 'CA2'],
  templates: {
    LAVA: 'R:2 R:1 O:1 r:1 R:1 b7:2 R:2 O:1 R:1 5:2 +1:2',
    LAVA2: 'R:2 R:1 O:1 r:1 R:1 b7:2 R:1 R:1 O:1 R:1 5:1 +1:1 R:2',
    SOFT: 'R:6 5:2 O:4 5:4',
  },
  drums: {
    CI1: { cl: 'X..x..x...x..x..', cg: '....x.......x.x.', tl: 'X.......' },
    CI2: { cl: 'X..x..x...x..x..', cg: '....x.......x.x.', th: '........xx', tm: '..........xx', tl: '............XXXX' },
    CA:  { k: 'X.....X.X.......', s: '....X.......X...', cl: '...x..x....x..x.', cg: '..x.......x.....', sh: 'x.x.x.x.x.x.x.x.' },
    CA2: { k: 'X.....X.X.....x.', s: '....X.......X..g', cl: '...x..x....x..x.', cg: '..x.......x...xx', h: 'x.x.x.x.x.x.x.x.', tl: '..............X.' },
    CF:  { k: 'X.....X.X.......', s: '....X...', th: '........XX', tm: '..........XX', tl: '............XXXX' },
    CB:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', cl: '...x..x....x..x.', h: 'xgxgxgxgxgxgxgxg' },
    CC:  { k: 'x..g............', sh: '..g...g...g...g.' },
    CC2: { k: 'x..g....x..g....', sh: '..g...g...g...g.', cl: '..............x.' },
    CR:  { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX', tl: '........x.x.XXXX', cl: 'x.x.x.x.' },
  },
  sections: {
    CI: { bars: 2, chords: 'Am Am', bass: 'LAVA', mute: { bass: [1] }, pad: true, drums: 'CI1 CI2' },
    CA: {
      bars: 8, chords: 'Am Am Bb Am Am Am G E7', bass: ['LAVA', 'LAVA', 'LAVA', 'LAVA2'],
      lead: [
        'E5:2 E5:1 E5:1 G5:2 E5:2 C5:2 D5:2 A4:4',
        'r:8 A4:2 C5:2 E5:2 G5:2',
        'F5:2 F5:1 F5:1 A5:2 F5:2 D5:2 F5:2 Bb4:4',
        'r:8 E5:2 D5:2 C5:2 B4:2',
        'E5:2 E5:1 E5:1 G5:2 E5:2 C5:2 D5:2 A4:4',
        'r:8 A4:2 C5:2 E5:2 A5:2',
        'B5:2 A5:1 G5:1 D5:2 G5:2 B5:2 A5:2 G5:4',
        'G#5:4 E5:2 D5:2 B4:4 G#4:4',
      ].join(' | '),
      stab: '0|X..X..X.........|0|X..X..X.........|0|X..X..X.........|0|X.......X...X...',
      drums: 'CA+ CA CA CA2 CA CA CA CF',
    },
    CB: {
      bars: 8, chords: 'A Bb A Gm A Bb Dm,C A', bass: 'LAVA',
      lead: [
        'A4:4 C#5:4 E5:6 F5:2',
        'D5:6 Bb4:2 D5:4 F5:4',
        'E5:4 C#5:2 Bb4:2 A4:8',
        'Bb4:4 D5:4 G5:6 F5:2',
        'E5:4 A5:4 C#6:6 Bb5:2',
        'D6:4 Bb5:2 A5:2 F5:8',
        'F5:4 E5:2 D5:2 E5:4 G5:4',
        'A5:8 r:4 E5:2 C#5:2',
      ].join(' | '),
      harm: true, pad: true, arp: { pat: ARP_8TH, oct: 4 }, stab: 'X.....X...X.....', drums: 'CB+ CB CB CB CB+ CB CB CF',
    },
    CC: {   // stay CALM: a heartbeat, a flute, a harp
      bars: 8, chords: 'Am F C G Am F Dm E', bass: 'SOFT', inst: { lead: 'flute', bass: 'softbass', arp: 'harp', pad: 'strings' },
      lead: [
        'E5:6 D5:2 C5:4 A4:4',
        'A4:6 C5:2 F5:8',
        'E5:6 G5:2 C6:8',
        'B5:6 A5:2 G5:8',
        'A5:6 G5:2 E5:4 C5:4',
        'F5:6 E5:2 C5:8',
        'D5:6 F5:2 A5:8',
        'G#5:8 B5:4 E6:4',
      ].join(' | '),
      pad: true, arp: { pat: '0 . 1 . 2 . 3 . 4 . 3 . 2 . 1 .', oct: 4 }, drums: 'CC CC CC CC CC2 CC2 CC2 CR',
    },
    CA2: {
      ref: 'CA', harm: true,
      stab: 'X.....X...X.....|X..X..X.........|X.....X...X.....|X..X..X.........|X.....X...X.....|X..X..X.........|X.....X...X.....|X.......X...X...',
      drums: 'CA+ CA2 CA CA2 CA CA2 CA CF',
    },
  },
};

// ------------------------------------------------------------------ SISWAMP: the Swamp of Despair.  E minor, a slow swampy shuffle (12/8), 66
// Murky wobbling pads, a plunking bass, bubbles and the odd frog; a lazy reed tune; SWB the fireflies (celesta) and a
// hopeful turn to G major on the flute ("I believe in you!"); SWA2 the tune on the fiddle with strings below.
SONGS.siswamp = {
  level: 1.35, bpm: 66, spb: 12, bassLow: 31, echo: { steps: 3, fb: 0.36, wet: 0.28 },
  inst: { lead: 'accordion', bass: 'softbass', pad: 'murk', arp: 'celesta', lead2: 'celesta', harm: 'strings' },
  mix: { lead: 0.46, pad: 0.16, arp: 0.1, bass: 0.56, drums: 0.5, lead2: 0.16, harm: 0.2 },
  intro: ['SWI'], loop: ['SWA', 'SWB', 'SWA2'],
  templates: {
    PLUNK: 'R:2 r:1 R:2 5:1 r:3 5:2 R:1',
    PLUNK2: 'R:2 r:1 5:2 R:1 r:3 O:2 5:1',
    DRIFT: 'R:6 5:6',
  },
  drums: {
    SWI: { bl: '.....x....x.', sh: '..g..g..g..g' },
    SW:  { k: 'X.....g.....', bl: '....x......x', sh: '..g..g..g..g' },
    SW2: { k: 'X.....g.....', bl: '..x.....x...', fr: '.......x....', sh: '..g..g..g..g' },
    SWB: { k: 'X.....g.....', sh: '..g..g..g..g', wb: '......g.....' },
  },
  sections: {
    SWI: { bars: 1, chords: 'Em', bass: 'DRIFT', pad: true, lead2: 'r:6 B5:1 r:2 G5:1 r:2', drums: 'SWI' },
    SWA: {
      bars: 8, chords: 'Em Em Am Em C B7 Em Em', bass: ['PLUNK', 'PLUNK', 'PLUNK', 'PLUNK2'],
      lead: [
        'B4:3 G4:2 E4:1 G4:3 B4:3',
        'E5:5 D5:1 B4:6',
        'C5:3 A4:2 E4:1 A4:3 C5:3',
        'B4:9 r:3',
        'E5:3 G5:2 E5:1 C5:3 E5:3',
        'D#5:5 E5:1 F#5:3 A5:3',
        'G5:3 F#5:2 E5:1 B4:6',
        'E4:9 r:3',
      ].join(' | '),
      pad: true, drums: 'SW SW SW SW2 SW SW SW SW2',
    },
    SWB: {   // fireflies: a hopeful turn
      bars: 8, chords: 'G D Em C G D Am B7', bass: ['PLUNK', 'PLUNK', 'PLUNK', 'PLUNK2'], inst: { lead: 'flute' },
      lead: [
        'D5:3 G5:3 B5:5 A5:1',
        'A5:5 F#5:1 D5:6',
        'E5:3 G5:3 B5:3 E6:3',
        'E6:5 D6:1 C6:3 G5:3',
        'B5:3 A5:2 G5:1 D5:6',
        'F#5:3 A5:3 D6:6',
        'C6:5 B5:1 A5:3 E5:3',
        'D#5:6 F#5:3 B4:3',
      ].join(' | '),
      pad: true, arp: { pat: '. . . 3 . . . . 5 . . .', oct: 4 }, drums: 'SWB SWB SWB SWB SWB SWB SWB SW2',
    },
    SWA2: { ref: 'SWA', inst: { lead: 'fiddle' }, harm: true, arp: { pat: '. . . 3 . . . . 5 . . .', oct: 4 }, drums: 'SW SW2 SW SW2 SW SW2 SW SW2' },
  },
};

// ------------------------------------------------------------------ SICELL: the Cell of Sloth.  D minor -> F major, 84, sleepy and comic
// A plodding tuba (with a sneaky leading-tone step), tick-tock woodblock, a tiptoe pizzicato tune; CEB a music-box lullaby
// with "yaaawn" slides on the horn; snores now and then.
SONGS.sicell = {
  level: 1.15, bpm: 84, bassLow: 33, echo: { steps: 3, fb: 0.3, wet: 0.22 },
  inst: { lead: 'pluck', bass: 'tuba', lead2: 'brass2', arp: 'celesta', harm: 'pluck' },
  mix: { lead: 0.5, bass: 0.58, lead2: 0.26, drums: 0.55, pad: 0.11 },
  intro: ['CEI'], loop: ['CEA', 'CEB', 'CEA2'],
  templates: {
    PLOD: 'R:3 r:1 5:3 r:1 R:3 r:1 -1:3 r:1',
    PLOD2: 'R:3 r:1 5:3 r:1 O:3 r:1 5:2 3:2',
    LULL: 'R:8 5:8',
  },
  drums: {
    CEI1: { wb: 'x.......x.......', zz: 'X' },
    CEI2: { wb: 'x.......x.......', k: 'X.......' },
    CE:   { k: 'X.......X.......', wb: '....x.......x...', sh: '..g...g...g...g.' },
    CEZ:  { k: 'X.......', wb: '....x.......x...', zz: '........X' },
    CEL:  { wb: 'g.......g.......', sh: '....g.......g...' },
    CER:  { k: 'X.......X.......', wb: 'x.......x.x.x.x.' },
  },
  sections: {
    CEI: { bars: 2, chords: 'Dm A7', bass: 'PLOD', lead: 'r:16 | r:8 A4:1 r:1 C#5:1 r:1 E5:1 r:1 G5:1 r:1', drums: 'CEI1 CEI2' },
    CEA: {   // tiptoe past the snoring guards
      bars: 8, chords: 'Dm Dm Gm Dm Bb A7 Dm A7', bass: ['PLOD', 'PLOD', 'PLOD', 'PLOD2'],
      lead: [
        'D5:1 r:1 F5:1 r:1 A5:1 r:2 G#5:1 A5:1 r:1 F5:1 r:1 D5:1 r:3',
        'F5:1 r:1 E5:1 r:1 D5:1 r:1 C#5:1 r:1 D5:4 r:4',
        'G4:1 r:1 Bb4:1 r:1 D5:1 r:2 C#5:1 D5:1 r:1 Bb4:1 r:1 G4:1 r:3',
        'A4:1 r:1 D5:1 r:1 F5:1 r:1 E5:1 r:1 D5:4 r:4',
        'D5:1 r:1 F5:1 r:1 Bb5:1 r:2 A5:1 Bb5:1 r:1 F5:1 r:1 D5:1 r:3',
        'C#5:1 r:1 E5:1 r:1 G5:1 r:2 F#5:1 G5:1 r:1 E5:1 r:1 C#5:1 r:3',
        'D5:1 r:1 F5:1 r:1 A5:2 F5:2 D6:2 r:2 A5:2 r:2',
        'A5:2 G5:2 E5:2 C#5:2 A4:4 r:4',
      ].join(' | '),
      drums: 'CE+ CE CE CEZ CE CE CE CEZ',
    },
    CEB: {   // the lullaby, and the yawns
      bars: 8, chords: 'F C/E Dm Bb F C Bb,C F', bass: 'LULL', inst: { lead: 'celesta', bass: 'softbass' },
      lead: [
        'C6:4 A5:4 F5:4 A5:4',
        'G5:4 E5:4 C5:8',
        'D5:4 F5:4 A5:4 F5:4',
        'Bb5:6 A5:2 F5:8',
        'C6:4 A5:4 F5:4 C6:4',
        'E6:4 D6:4 C6:8',
        'D6:4 Bb5:4 G5:4 E5:4',
        'F5:8 r:8',
      ].join(' | '),
      lead2: 'r:48 | r:8 D6:2 C#6:2 C6:2 B5:2 | r:48 | r:8 C6:2 B5:2 Bb5:2 A5:2',
      pad: true, drums: 'CEL CEL CEL CEL CEL CEL CEL CER',
    },
    CEA2: { ref: 'CEA', inst: { lead: 'marimba' }, harm: true, pad: true, lead2: 'F4:8 r:8 | A4:8 r:8 | Bb4:8 r:8 | A4:8 r:8 | Bb4:8 r:8 | A4:8 r:8 | F4:8 r:8 | E4:8 r:8', drums: 'CE+ CE CE CEZ CE CE CE CEZ' },
  },
};

// ------------------------------------------------------------------ SIPALACE: the Skull Palace.  A masquerade waltz, G minor, 3/4
// (spb 12 = one 3/4 bar of sixteenths: a quarter is 4 steps; bpm 184 = a quarter at 138).  Malachar wears a mask, so his
// palace dances: the bass on ONE, organ "pah-pah" on two and three.  PZA Malachar's mask motif (D up to Bb, then a chromatic
// slide A Ab G) on strings; PZB regal: organ and choir in Eb; PZC the theme as a creepy-cute music box; PZD full orchestra.
SONGS.sipalace = {
  level: 1.25, bpm: 184, spb: 12, bassLow: 31, echo: { steps: 4, fb: 0.26, wet: 0.2 },
  inst: { lead: 'strings', stab: 'organ', pad: 'organ', lead2: 'celesta', arp: 'pluck', harm: 'strings' },
  mix: { stab: 0.4, pad: 0.1, choir: 0.22, lead: 0.44, lead2: 0.22, arp: 0.18 },
  intro: ['PZI'], loop: ['PZA', 'PZB', 'PZC', 'PZD'],
  templates: { WALTZ: 'R:4 r:8', WALTZ2: 'R:4 r:4 5:4', WALTZ3: 'R:4 5:4 O:4' },
  drums: {
    PZI1: { G: 'X' },
    PZI2: { tp: 'X...........' },
    PZI3: { tp: 'X...x...x...' },
    PZI4: { tp: 'X.x.x.xxXXXX', s: '....ggxxXXXX' },
    WZ:   { k: 'X...........', sh: '....x...x...' },
    WZ2:  { k: 'X...........', sh: '....x...x...', tb: '........x...' },
    WZF:  { k: 'X.......X...', sh: '....x...x...', s: '........x.xx' },
    WZB:  { k: 'X...........', tp: 'X...........', sh: '....x...x...' },
    WZC:  { sh: '....g...g...', wb: 'g...........' },
    WZD:  { k: 'X.......x...', s: '....x...x...', tp: 'X...........', h: 'x.x.x.x.x.x.' },
    WZR:  { k: 'X...X...X...', s: 'ggxxxxXXXXXX', tp: '........XXXX' },
  },
  sections: {
    PZI: {
      bars: 4, chords: 'Gm Gm Eb D', choir: true, pad: true, bassLine: 'G1:12 | G1:12 | Eb2:12 | D2:12',
      lead2: 'D5:8 Bb5:4 | A5:4 Ab5:4 G5:4 | r:24', stab: '0|0|....x...x...|X...X...X...', drums: 'PZI1 PZI2 PZI3 PZI4',
    },
    PZA: {
      bars: 16, chords: 'Gm D7 Gm Gm Cm G7 Cm Cm Ab Ab Eb Eb Cm D D7 D7',
      bass: ['WALTZ', 'WALTZ', 'WALTZ', 'WALTZ2'],
      lead: [
        'D5:8 Bb5:4', 'A5:4 Ab5:4 G5:4', 'G5:8 D5:4', 'Bb4:8 r:4',          // the mask motif
        'Eb5:8 C6:4', 'B5:4 Bb5:4 Ab5:4', 'G5:8 Eb5:4', 'C5:8 r:4',          // ... a fourth higher
        'Eb5:4 Ab5:4 C6:4', 'Eb6:8 C6:4', 'Bb5:4 G5:4 Eb5:4', 'G5:8 r:4',
        'C6:8 Eb6:4', 'D6:8 C6:4', 'A5:4 C6:4 F#5:4', 'D5:8 r:4',
      ].join(' | '),
      lead2: 'r:36 | r:8 D6:1 C6:1 Bb5:1 A5:1 | r:36 | r:8 G5:1 Ab5:1 Bb5:1 C6:1 | r:36 | r:8 Bb5:1 C6:1 D6:1 Eb6:1 | r:36 | r:8 F#5:1 A5:1 C6:1 D6:1',
      pad: true, stab: '....x...x...', drums: 'WZ+ WZ WZ WZ2 WZ WZ WZ WZ2 WZ WZ WZ WZ2 WZ WZ WZ WZF',
    },
    PZB: {   // regal: organ and choir, Eb major, the King's palace under the mask
      bars: 16, chords: 'Eb Eb Bb/D Bb Cm Cm Ab Ab Fm Fm Bb Bb Eb Eb D7 D7', inst: { lead: 'organ', harm: 'strings', stab: 'organ' },
      bass: ['WALTZ', 'WALTZ2'],
      lead: [
        'G5:8 Bb5:4', 'Eb6:12', 'D6:8 C6:4', 'Bb5:12',
        'C6:8 Eb6:4', 'G5:12', 'Ab5:8 C6:4', 'Eb5:12',
        'F5:8 Ab5:4', 'C6:12', 'D6:8 Bb5:4', 'F5:12',
        'G5:4 Bb5:4 Eb6:4', 'Eb6:8 D6:4', 'C6:4 A5:4 F#5:4', 'D5:12',
      ].join(' | '),
      harm: true, mute: { harm: range(1, 8) }, choir: true, stab: '....x...x...', drums: 'WZB+ WZ WZ WZ WZB WZ WZ WZ WZB WZ WZ WZ WZB WZ WZ WZF',
    },
    PZC: {   // the music box: the theme on celesta over pizzicato
      ref: 'PZA', inst: { lead: 'celesta', lead2: 'flute', pad: 'strings', bass: 'softbass' }, stab: null,
      arp: { pat: '. . . . 1 . . . 2 . . .', oct: 4 },
      lead2: 'r:36 | r:8 D5:4 | r:36 | r:8 G4:4 | r:36 | r:8 Bb4:4 | r:36 | r:8 A4:4',
      drums: 'WZC WZC WZC WZC WZC WZC WZC WZC WZC WZC WZC WZC WZC WZC WZC WZF',
    },
    PZD: {   // the regal theme on the whole orchestra: brass, choir, timpani
      ref: 'PZB', inst: { lead: 'brass', harm: 'brass2', stab: 'organ' }, harm: true, choir: true, bass: 'WALTZ3',
      drums: 'WZD+ WZD WZD WZD WZD WZD WZD WZD WZD+ WZD WZD WZD WZD WZD WZD WZR',
    },
  },
};

// ------------------------------------------------------------------ the FEELINGS bosses: one theme, three arrangements
// (the Rage Alpha, the Elder Tree, the Sloth Beast -- the cave, swamp and cell bosses).  A minor.  FA opens with Dodongo's
// rising triad (A C E A, minor here); FB climbs through F G Em Am; FC is each fight's own breakdown; FA2 the theme twinned.
const SI_FEEL = {
  FA: {
    bars: 8, chords: 'Am Am F E Am Am Dm E', bass: 'B1', bassAlt: { E: 'B1V' },
    lead: [
      'A4:2 C5:2 E5:2 A5:6 G5:2 E5:2',
      'E5:6 D5:2 C5:4 B4:4',
      'A4:2 C5:2 F5:2 A5:6 G5:2 F5:2',
      'G#5:6 F5:2 E5:4 D5:4',
      'A5:4 E5:4 C6:6 B5:2',
      'A5:4 G5:2 F5:2 E5:8',
      'F5:4 A5:4 D6:6 C6:2',
      'B5:6 G#5:2 E5:8',
    ].join(' | '),
    stab: 'X.....X...X.....', drums: 'FA+ FA FA FA2 FA FA FA FF',
  },
  FB: {
    bars: 8, chords: 'F G Em Am F G E E', bass: 'B1', bassAlt: { E: 'B1V' },
    lead: [
      'C6:6 A5:2 F5:4 A5:4',
      'D6:6 B5:2 G5:4 B5:4',
      'E6:6 B5:2 G5:4 E5:4',
      'A5:8 C6:4 E6:4',
      'C6:4 A5:2 F5:2 A5:8',
      'D6:4 B5:2 G5:2 B5:8',
      'G#5:4 B5:4 E6:6 D6:2',
      'E6:4 D6:2 B5:2 G#5:2 E5:2 D5:2 B4:2',
    ].join(' | '),
    harm: true, pad: true, arp: { pat: UPDOWN, oct: 4 }, stab: 'X..X..X.........', drums: 'FB+ FB FB FB FB FB FB FF',
  },
  FC: {
    bars: 8, chords: 'Am Am F F Dm Dm E E', bass: 'B2',
    lead: 'r:64 | D5:4 F5:4 A5:4 D6:4 | D6:4 C6:4 A5:4 F5:4 | E5:4 G#5:4 B5:4 E6:4 | E6:4 D6:4 B5:4 G#5:4',
    choir: true, arp: { pat: ARP_EERIE, oct: 5, inst: 'bell' }, mute: { arp: range(5, 8) },
    drums: 'FC+ FC FC FC FC2 FC2 FC2 FR',
  },
  FA2: { ref: 'FA', harm: true, pad: true, stab: 'X..X..X...X.X...', drums: 'FA+ FA FA FA2 FA FA FA2 FR' },
};

// the RAGE ALPHA (the Cave of Rage's bridge): hot -- congas, toms, the lava bass; FC is a drum break
SONGS.sirageboss = {
  bpm: 144, bassLow: 33, echo: { steps: 3, fb: 0.24, wet: 0.16 }, mix: { stab: 0.27, bass: 0.6, drums: 0.68 },
  intro: ['XRI'], loop: ['FA', 'FB', 'FC', 'FA2'],
  templates: {
    B1: 'R:2 R:1 O:1 r:1 R:1 b7:2 R:2 O:1 R:1 5:2 +1:2',
    B1V: 'R:2 R:1 O:1 r:1 R:1 b7:2 R:2 O:1 R:1 5:2 3:2',
    B2: 'R:1 R:1 O:1 R:1 R:1 R:1 O:1 R:1 R:1 R:1 O:1 R:1 5:1 R:1 O:1 5:1',
  },
  drums: {
    XRI1: { cl: 'X..x..x...x..x..', tl: 'X.......X.......', x: 'X' },
    XRI2: { cl: 'X..x..x...x..x..', th: '........XX', tm: '..........XX', tl: '............XXXX', s: '........ggxxXXXX' },
    FA:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', cl: '...x..x....x..x.', h: 'xgxgxgxgxgxgxgxg' },
    FA2: { k: 'X..X..X.X..X..x.', s: '....X.......X..x', cl: '...x..x....x..x.', cg: '..x.......x...xx', h: 'xgxgxgxgxgxgxgxg' },
    FF:  { k: 'X...X...X.......', s: '....X...', th: '........XX', tm: '..........XX', tl: '............XXXX' },
    FB:  { k: 'X...X...X...X...', s: '....X.......X...', c: '....x.......x...', cl: '...x..x....x..x.', h: 'x.x.x.x.x.x.x.x.' },
    FC:  { k: 'X.......X.......', tl: 'X..X..X...X..X..', tm: '....x.......x...', cl: '..x..x..x..x..x.' },
    FC2: { k: 'X...X...X...X...', tl: 'X..X..X...X..X..', s: '....X.......X...', cg: '..x..x..x..x..x.' },
    FR:  { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX', tl: '........x.x.XXXX' },
  },
  sections: {
    ...SI_FEEL,
    XRI: {
      bars: 2, chords: 'Am E', bassLine: 'A1:2 A1:1 A2:1 r:1 A1:1 G2:2 A1:2 A2:1 A1:1 E2:2 Bb1:2 | E2:4 E2:4 E2:2 E2:2 E2:2 E2:2',
      lead: 'r:16 | E5:4 G#5:4 B5:4 D6:4', stab: 'X..X..X.........|X...X...X...X...', drums: 'XRI1 XRI2',
    },
  },
};

// the ELDER TREE (the Swamp of Despair): the fiddle over a galloping bass, murk and timpani; FC is the fire ring rising
SONGS.sielderboss = {
  bpm: 136, bassLow: 33, echo: { steps: 3, fb: 0.3, wet: 0.2 },
  inst: { lead: 'fiddle', harm: 'strings', pad: 'murk', arp: 'strings' },
  mix: { lead: 0.42, stab: 0.17, pad: 0.15, bass: 0.6, choir: 0.22, arp: 0.12 },
  intro: ['XEI'], loop: ['FA', 'FC', 'FB', 'FA2'],
  templates: {
    B1: 'R:2 R:1 R:1 O:2 R:2 R:2 R:1 R:1 O:2 5:2',
    B1V: 'R:2 R:1 R:1 O:2 R:2 5:2 R:1 R:1 O:2 5:2',
    B2: 'R:4 R:2 O:2 R:4 5:4',
  },
  drums: {
    XEI1: { w: 'X', tp: 'X.......X.......' },
    XEI2: { tp: 'X...X...X.X.XXXX', s: '........ggxxXXXX', bl: '..x.......x.....' },
    FA:  { k: 'X...X...X...X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', tp: 'X...............' },
    FA2: { k: 'X...X...X...X.x.', s: '....X.......X..x', h: 'xgxgxgxgxgxgxgxg', tp: 'X.......X.......' },
    FF:  { k: 'X...X...X.......', s: '....X...xgxgXXXX', tp: '........X.X.X.X.' },
    FB:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', tp: 'X.......X.......' },
    FC:  { tp: 'X.......X.......', k: 'X...............', bl: '....x.......x...' },
    FC2: { k: 'X...X...X...X...', tp: 'X..X..X.X..X..X.', s: '....X.......X...' },
    FR:  { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX', tp: '........xxxxXXXX' },
  },
  sections: {
    ...SI_FEEL,
    FC: { ...SI_FEEL.FC, pad: true, arp: { pat: '0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1', oct: 4 }, mute: { arp: range(1, 4) } },   // (the ring fills: string tremolo)
    XEI: {
      bars: 2, chords: 'Am E', bassLine: 'A1:16 | E2:4 E2:4 E2:2 E2:2 E2:2 E2:2', pad: true,
      lead: 'r:16 | B4:4 E5:4 G#5:4 B5:4', drums: 'XEI1 XEI2',
    },
  },
};

// the SLOTH BEAST (the Cell of Sloth): accordion and a bouncing tuba, stomps and woodblock; FC a lazy, snoring breakdown
SONGS.sislothboss = {
  bpm: 126, bassLow: 33, echo: { steps: 3, fb: 0.26, wet: 0.18 },
  inst: { lead: 'accordion', bass: 'tuba', harm: 'accordion', stab: 'pluck' },
  mix: { lead: 0.52, harm: 0.2, stab: 0.2, bass: 0.6, drums: 0.64 },
  intro: ['XSI'], loop: ['FB', 'FA', 'FC', 'FA2'],
  templates: {
    B1: 'R:2 r:1 R:1 5:2 r:2 R:2 r:1 R:1 -1:2 r:2',
    B1V: 'R:2 r:1 R:1 5:2 r:2 R:2 r:1 R:1 3:2 r:2',
    B2: 'R:4 r:4 5:4 r:4',
  },
  drums: {
    XSI1: { st: 'X.......X.......', wb: '....x.......x...', zz: 'X' },
    XSI2: { st: 'X...X...X...X...', s: '........ggxxXXXX' },
    FA:  { k: 'X.......X.......', st: 'X...X...X...X...', s: '....X.......X...', wb: '..x...x...x...x.' },
    FA2: { k: 'X.......X.....x.', st: 'X...X...X...X...', s: '....X.......X..x', wb: '..x...x...x...x.', tb: '..x...x...x...x.' },
    FF:  { k: 'X...X...X.......', st: 'X...X...', s: '........xgxgXXXX' },
    FB:  { k: 'X...X...X...X...', s: '....X.......X...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    FC:  { st: 'X.......X.......', wb: '....x.......x...' },
    FC2: { k: 'X.......X.......', st: 'X...X...X...X...', wb: '..x...x...x...x.', zz: '........X' },
    FR:  { k: 'X...X...X...X...', st: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX' },
  },
  sections: {
    ...SI_FEEL,
    FC: { ...SI_FEEL.FC, arp: { pat: '0 . . . 2 . . . 1 . . . 2 . . .', oct: 5, inst: 'celesta' }, mute: {} },
    XSI: {
      bars: 2, chords: 'Am E', bassLine: 'A1:4 r:4 E2:4 r:4 | E2:4 r:4 B1:2 r:2 E2:2 G#2:2', inst: { lead: 'brass2' },
      lead: 'r:8 C5:2 B4:2 Bb4:2 A4:2 | r:16', drums: 'XSI1 XSI2',
    },
  },
};

// ------------------------------------------------------------------ Book 2's own short cues (stage start, boss alarm, clear, save) and its title
Object.assign(DRUM, {
  sb(E, o, t, v) {   // a ship's bell: bronze, inharmonic, long ring
    fmHit(E, o, t, { f: 940, r: 2.76, i0: 2, i1: 0.5, id: 0.2, dur: 1.6, g: 0.22 * v });
    fmHit(E, o, t, { f: 470, r: 1.41, i0: 1.2, i1: 0.4, id: 0.3, dur: 1.9, g: 0.1 * v });
    nzHit(E, o, t, { bp: 3200, q: 2, dur: 0.015, g: 0.2 * v });
  },
  sd(E, o, t, v) {   // the same bell tuned to A (sits in D major and D minor): the Book 2 waystone
    fmHit(E, o, t, { f: 880, r: 2.76, i0: 2, i1: 0.5, id: 0.2, dur: 1.6, g: 0.22 * v });
    fmHit(E, o, t, { f: 440, r: 1.41, i0: 1.2, i1: 0.4, id: 0.3, dur: 1.9, g: 0.1 * v });
    nzHit(E, o, t, { bp: 3200, q: 2, dur: 0.015, g: 0.2 * v });
  },
});
Object.assign(JDRUMS, {
  SIS1: { st: 'X..X..X..X..', k: 'X.....X.....', tb: 'x.xx.xx.xx.x' },     // (12-step: si_start, si_clear)
  SIS2: { k: 'X', st: 'X', x: 'X' },
  SIC1: { st: 'X.....X.....', k: 'X.....X.....', c: '...X.....X..' },
  SIB3: { sb: 'X.X.....X.X.X.X.', k: 'X.......X.......', s: '............xxXX' },   // (16-step: si_bossintro)
  SIV:  { sd: 'X..X' },
});
Object.assign(JINGLES, {
  si_start: {   // Book 2's stage start: a shanty fanfare up the hook, Dm - C - D (a Picardy lift)
    bpm: 132, spb: 12, bassLow: 33, inst: { lead: 'accordion', harm: 'accordion', lead2: 'fiddle', stab: 'brass' }, mix: { lead: 0.55, stab: 0.18, lead2: 0.26 }, sec: {
      bars: 2, chords: 'Dm,C D',
      lead: 'D5:2 A4:1 D5:2 F5:1 E5:2 G5:1 C6:3 | D6:2 A5:1 F#5:2 A5:1 D6:5 r:1', harm: true,
      lead2: 'r:12 | r:6 A5:1 B5:1 C#6:1 D6:3',
      bassLine: 'D2:3 A1:3 C2:3 G1:3 | D2:3 D3:3 D2:6', stab: 'X.....X.....|X...........', drums: 'SIS1 SIS2',
    },
  },
  si_bossintro: {   // Book 2's boss alarm: the ship's bell rung in pairs, a low pirate horn, a drum roll (E minor against Bb)
    level: 1.4, bpm: 150, bassLow: 28, inst: { lead: 'brass2' }, mix: { lead: 0.5, stab: 0.26 }, sec: {   // (one bar: the game starts the boss music ~1.8 s after it)
      bars: 1, chords: 'Em,Bb',
      lead: 'E4:3 E4:1 E4:2 Bb4:3 Bb4:1 Bb4:2 E5:4',
      bassLine: 'E2:4 E2:2 E2:2 Bb1:4 Bb1:2 Bb1:2',
      stab: 'X.......X...X.X.', drums: 'SIB3',
    },
  },
  si_clear: {   // Book 2's victory: HEAVE ... HO! then the hook's arpeggios climb G - A - D
    level: 1.55, bpm: 156, spb: 12, bassLow: 31, inst: { lead: 'accordion', harm: 'accordion', lead2: 'fiddle', stab: 'brass' }, mix: { lead: 0.55, stab: 0.2, lead2: 0.26 }, sec: {
      bars: 2, chords: 'G,A D',   // (two bars: the payoff lands at 1.5 s, before the clear card takes over at 2.5 s)
      lead: 'B4:2 D5:1 G5:3 E5:1 A5:1 C#6:1 E6:3 | D6:6 r:6', harm: true,
      lead2: 'r:12 | A5:1 B5:1 C#6:1 D6:3 r:6',
      bassLine: 'G1:3 D2:3 A1:3 E2:3 | D2:3 A1:3 D2:6',
      stab: 'X.....X.....|X...........', pad: true, choir: true, mute: { pad: [1], choir: [1] }, drums: 'SIC1 SIS2',
    },
  },
  si_save: {   // a waystone in Book 2: two strokes of a ship's bell and a soft gold chord (ducks the music)
    level: 4.4, bpm: 100, duck: true, inst: { lead: 'celesta', pad: 'strings' }, mix: { lead: 0.4, pad: 0.15 }, sec: {
      bars: 1, chords: 'D5', lead: 'r:8 A5:2 D6:2 A6:4', pad: true, drums: 'SIV',   // (open fifths: right in every Book 2 key)
    },
  },
});

// ------------------------------------------------------------------ SITITLE: the title screen while Book 2 is selected.  The shanty as an anthem, 104
// A brass fanfare (Bb - C into F), then the HEAVE-HO chorus on brass with the choir, then the verse on the accordion with the
// fiddle descant.  ~37 s loop (like the title's).
SONGS.sititle = {
  ...SONGS.sigull, bpm: 104, level: 1.0, mix: { ...SONGS.sigull.mix, pad: 0.12 },
  intro: ['TI'], loop: ['TA', 'TB'],
  drums: { ...SONGS.sigull.drums, TI1: { tp: 'X.....X.....', st: 'X.....X.....', x: 'X' }, TI2: { tp: 'X..X..X..X..', s: '......ggxxXX', st: 'X..X..X..X..' } },
  sections: {
    ...SONGS.sigull.sections,
    TI: {
      bars: 2, chords: 'Bb C', inst: { lead: 'brass', harm: 'brass2' },
      bassLine: 'Bb1:3 Bb1:3 Bb1:6 | C2:3 C2:3 C2:3 E2:3',
      lead: 'D5:3 F5:3 Bb5:6 | E5:3 G5:3 C6:6', harm: true, stab: 'X..X..X.....|X..X..X..X..', pad: true, drums: 'TI1 TI2',
    },
    TA: { ref: 'GB', inst: { lead: 'brass', harm: 'brass2', pad: 'strings' }, pad: true },
    TB: { ref: 'GA2' },
  },
};

// ------------------------------------------------------------------ SIMALACHAR: the finale.  G minor, 160, choir + organ + orchestra
// Malachar's mask motif (D Bb A Ab G) drives MXA over a bass with a menacing flat-2 neighbour; MXB develops it with the
// choir; MXC the beam clash: a horn line climbs a step a bar over string tremolo and timpani; MXD the heroes fight back with
// the shanty hook in G major; MXE soars (Eb F G) and turns back to the minor.
SONGS.simalachar = {
  bpm: 160, bassLow: 31, echo: { steps: 3, fb: 0.26, wet: 0.18 },
  inst: { lead2: 'strings', stab: 'organ', arp: 'strings' },
  mix: { choir: 0.26, stab: 0.3, bass: 0.6, arp: 0.11 },
  intro: ['MXI'], loop: ['MXA', 'MXB', 'MXC', 'MXD', 'MXE'],
  templates: {
    MASK: 'R:1 R:1 O:1 R:1 +1:1 R:1 O:1 R:1 R:1 R:1 O:1 R:1 +1:1 R:1 b7:1 O:1',
    MASKV: 'R:1 R:1 O:1 R:1 +1:1 R:1 O:1 R:1 R:1 R:1 O:1 R:1 3:1 R:1 5:1 O:1',
    HERO: 'R:2 R:1 R:1 O:2 R:1 R:1 R:2 R:1 R:1 5:2 O:2',
  },
  drums: {
    MXI1: { G: 'X', w: 'X' },
    MXI2: { tp: 'X..X..X.........' },
    MXI3: { tp: 'X..X..X.X..X..X.', k: 'X.......X.......' },
    MXI4: { k: 'X..X..X.X..X..X.', s: '........ggxxXXXX', tp: 'X.......X.......' },
    MXA:  { k: 'X..X..X...X.X...', s: '....X.......X...', h: 'xgxgxgxgxgxgxgxg', tl: '..............x.' },
    MXA2: { k: 'X..X..X...X.X.X.', s: '....X.......X.XX', h: 'xgxgxgxgxgxgxgxg', tl: '..........x...x.' },
    MXF:  { k: 'X...X...X.......', s: '....X...', th: '........XX', tm: '..........XX', tl: '............XXXX' },
    MXB:  { k: 'X...X..X..X.X...', s: '....X.......X...', c: '....x.......x...', tb: 'x.x.x.x.x.x.x.x.', tp: 'X.......X.......' },
    MXC:  { k: 'X.......X.......', tp: 'X...X...X..X..X.', tm: '......x.......x.' },
    MXC2: { k: 'X...X...X...X...', tp: 'X...X...X..X..X.', s: '....X.......X..x' },
    MXR:  { k: 'X...X...X...X...', s: 'ggggxxxxxxxxXXXX', tp: '........xxxxXXXX' },
    MXD:  { k: 'X..X.XX.X..X.XX.', s: '....X.......X...', c: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', tb: '..x...x...x...x.' },
    MXD2: { k: 'X..X.XX.X..X.XXX', s: '....X.......X.XX', c: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', tb: '..x...x...x...x.' },
  },
  sections: {
    MXI: {
      bars: 4, chords: 'Gm Gm Eb D', choir: true, inst: { lead2: 'bell' },
      bassLine: 'G1:16 | G1:16 | Eb2:16 | D2:4 D2:4 D2:2 D2:2 D2:2 D2:2',
      lead2: 'D5:4 Bb5:6 A5:2 Ab5:4 | G5:12 r:4 | r:32',   // (the mask motif on a bell, alone)
      lead: 'r:32 | Eb5:4 G5:4 Bb5:6 C6:2 | A5:8 F#5:8', stab: '0|0|X.......X.......|X...X...X...X...', drums: 'MXI1 MXI2 MXI3 MXI4',
    },
    MXA: {
      bars: 8, chords: 'Gm Gm Eb D Gm Gm,D Ab D', bass: 'MASK', bassAlt: { D: 'MASKV', Eb: 'MASKV', Ab: 'MASKV' },
      lead: [
        'D5:4 Bb5:6 A5:2 Ab5:4',        // the mask motif
        'G5:12 r:2 D5:1 D5:1',
        'Eb5:4 C6:6 B5:2 Bb5:4',
        'A5:12 r:4',
        'D6:4 Bb5:4 G5:4 D5:4',
        'Bb5:4 A5:2 G5:2 F#5:4 D5:4',
        'Eb6:4 C6:4 Ab5:4 C6:4',
        'D6:6 C6:2 A5:4 F#5:4',
      ].join(' | '),
      stab: 'X.....X...X.....', drums: 'MXA+ MXA MXA MXA2 MXA MXA MXA MXF',
    },
    MXB: {
      bars: 8, chords: 'Cm Cm Gm Gm Eb F D D7', bass: 'MASK', bassAlt: { D: 'MASKV', D7: 'MASKV', Eb: 'MASKV', F: 'MASKV' },
      lead: [
        'G5:6 Ab5:2 G5:4 Eb5:4',
        'C6:8 G5:4 Eb5:4',
        'D5:6 Eb5:2 D5:4 Bb4:4',
        'G5:8 D6:8',
        'Eb6:6 D6:2 Bb5:4 G5:4',
        'F5:4 A5:4 C6:4 Eb6:4',
        'D6:8 F#5:4 A5:4',
        'C6:4 Bb5:2 A5:2 F#5:4 D5:4',
      ].join(' | '),
      harm: true, choir: true, arp: { pat: UPDOWN, oct: 4 }, drums: 'MXB+ MXB MXB MXB MXB+ MXB MXB MXF',
    },
    MXC: {   // the beam clash: a step up every bar
      bars: 8, chords: 'Gm Ab Gm Ab Gm Ab A D', bass: 'MASK', bassAlt: { Ab: 'MASKV', A: 'MASKV', D: 'MASKV' }, inst: { lead2: 'brass' },
      lead2: 'G4:16 | Ab4:16 | Bb4:16 | C5:16 | D5:16 | Eb5:16 | E5:16 | F#5:16',
      choir: true, arp: { pat: '0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1', oct: 4 },
      stab: 'X..X..X.........|X..X..X.........|X..X..X.X.......|X..X..X.X.......|X..X..X.X..X....|X..X..X.X..X....|X.X.X.X.X.X.X.X.|X.X.X.X.X.X.X.X.',
      drums: 'MXC+ MXC MXC MXC MXC2 MXC2 MXC2 MXR',
    },
    MXD: {   // the heroes fight back: the shanty hook in G major
      bars: 8, chords: 'G F G F,G Eb F G G', bass: 'HERO',
      lead: [
        'D5:2 G5:2 G5:2 A5:2 B5:4 A5:2 G5:2',
        'C5:2 F5:2 F5:2 G5:2 A5:4 G5:2 F5:2',
        'D5:2 G5:2 B5:2 D6:2 B5:4 A5:2 G5:2',
        'A5:4 F5:4 G5:8',
        'Eb5:2 G5:2 Bb5:2 Eb6:6 Bb5:4',
        'C5:2 F5:2 A5:2 C6:6 A5:4',
        'B5:6 C6:2 D6:8',
        'G5:4 D5:2 B4:2 G4:2 B4:2 D5:2 G5:2',
      ].join(' | '),
      lead2: 'r:64 | Bb5:16 | A5:16 | D6:16 | B5:16',
      harm: true, choir: true, stab: 'X.....X...X.....', drums: 'MXD+ MXD MXD MXD2 MXD+ MXD MXD MXF',
    },
    MXE: {
      bars: 8, chords: 'Eb F G G Eb F D D7', bass: 'HERO',
      lead: [
        'G5:6 Bb5:2 Eb6:8',
        'F5:6 A5:2 C6:8',
        'B5:4 D6:4 G5:4 B5:4',
        'D6:12 r:4',
        'Eb6:4 D6:2 C6:2 Bb5:4 G5:4',
        'A5:4 C6:4 F5:8',
        'F#5:4 A5:4 D6:8',
        'C6:4 A5:4 F#5:4 D5:4',
      ].join(' | '),
      harm: true, choir: true, arp: { pat: UPDOWN, oct: 4 }, drums: 'MXD+ MXD MXD MXD2 MXD+ MXD MXD MXR',
    },
  },
};

// ------------------------------------------------------------------ SIENDING: the Palace of the Sun (the epilogue, the end card).  D major, 88, warm
// EDA the shanty hook as a tender flute song over harp; EDB the reunion on strings; EDC the hook triumphant on brass;
// EDD the strings tune again on the flute with the celesta, back to the start.
SONGS.siending = {
  level: 1.15, bpm: 88, bassLow: 33, echo: { steps: 3, fb: 0.32, wet: 0.26 },
  inst: { lead: 'flute', lead2: 'celesta', arp: 'harp', bass: 'softbass', pad: 'strings', harm: 'strings' },
  mix: { lead: 0.42, pad: 0.15, arp: 0.15, bass: 0.52, drums: 0.45, lead2: 0.2 },
  intro: ['EDI'], loop: ['EDA', 'EDB', 'EDC', 'EDD'],
  templates: { SOFT: 'R:6 5:2 O:4 5:4', MARCH: 'R:2 R:1 R:1 O:2 R:2 R:2 R:1 R:1 O:2 5:2' },
  drums: {
    ED0: { sh: '..g...g...g...g.' },
    ED1: { sh: '..x...x...x...x.', k: 'g.......' },
    EDM: { k: 'X.....x.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
    EDM2: { k: 'X.....x.X.....x.', s: '....X.......X..g', h: 'x.x.x.x.x.x.x.xx' },
    EDF: { k: 'X.....x.X.......', s: '....X...', th: '........X.X', tm: '...........X.X', tl: '..............XX' },
    EDR: { sh: '..g...g...g...g.', tl: '..........x.x.xx' },
  },
  sections: {
    EDI: { bars: 2, chords: 'D G', bass: 'SOFT', pad: true, arp: { pat: '0 1 2 3 4 5 4 3 2 1 2 3 4 3 2 1', oct: 4 }, drums: 'ED0 ED0' },
    EDA: {
      bars: 8, chords: 'D G D A Bm G Em7,A D', bass: 'SOFT',
      lead: [
        'A4:3 D5:1 D5:3 E5:1 F#5:3 E5:1 D5:3 A4:1',
        'B4:3 D5:1 D5:3 E5:1 G5:4 B4:4',
        'A4:3 D5:1 D5:3 E5:1 F#5:3 G5:1 A5:3 F#5:1',
        'E5:3 C#5:1 A4:4 E5:8',
        'D5:3 F#5:1 F#5:3 A5:1 B5:4 F#5:4',
        'G5:3 F#5:1 E5:3 D5:1 B4:8',
        'E5:3 G5:1 B5:4 A5:4 C#6:4',
        'D6:8 r:4 A4:4',
      ].join(' | '),
      lead2: 'r:48 | r:8 A5:2 C#6:2 E6:4 | r:48 | r:8 F#5:2 A5:2 D6:4',
      pad: true, arp: { pat: ARP_8TH, oct: 4 }, drums: 'ED0 ED0 ED0 ED0 ED1 ED1 ED1 ED1',
    },
    EDB: {   // the reunion: strings
      bars: 8, chords: 'Bm G D A Bm G Em7 A7', bass: 'SOFT', inst: { lead: 'strings', harm: 'strings' },
      lead: [
        'F#5:6 E5:2 D5:4 B4:4',
        'G5:6 F#5:2 D5:4 B4:4',
        'A5:6 G5:2 F#5:4 D5:4',
        'E5:12 r:4',
        'B5:6 A5:2 F#5:4 D5:4',
        'D6:6 C6:2 B5:4 G5:4',
        'B5:6 A5:2 G5:4 E5:4',
        'A5:8 G5:4 E5:4',
      ].join(' | '),
      harm: true, mute: { harm: range(1, 4) }, pad: true, arp: { pat: ARP_8TH, oct: 4 }, drums: 'ED1 ED1 ED1 ED1 ED1 ED1 ED1 EDR',
    },
    EDC: {   // the hook triumphant
      ref: 'EDA', inst: { lead: 'brass', bass: 'bass', arp: 'pluck' }, harm: true, bass: 'MARCH', choir: true, lead2: null,
      arp: { pat: UPDOWN, oct: 4 }, stab: '0|0|0|X..X..X.X.......|0|0|0|X...............',
      drums: 'EDM+ EDM EDM EDM2 EDM EDM EDM EDF',
    },
    EDD: {   // tender again: flute and celesta, the three roads at sunset
      ref: 'EDB', inst: { lead: 'flute', harm: 'strings', arp: 'celesta' }, harm: false,
      lead2: 'r:48 | r:8 E6:2 C#6:2 A5:4 | r:64', drums: 'ED0 ED0 ED0 ED0 ED0 ED0 ED0 EDR',
    },
  },
};

// ------------------------------------------------------------------ Book 2 jingles
Object.assign(JDRUMS, {
  SIW1: { st: 'X.....X.....', s: '......gxgxXX' },      // (12-step: si_wedge)
  SIW2: { k: 'X.....', st: 'X.....', x: 'X' },
  SIK1: { tp: 'X.......X.......', w: 'X' },
  SIK2: { tp: 'X...............', x: 'X', G: 'X' },
});
Object.assign(JINGLES, {
  si_wedge: {   // a wedge of the Sun Key won: the shanty's bVI-bVII-I, in gold
    bpm: 112, spb: 12, bassLow: 33, inst: { lead: 'accordion', lead2: 'bell', harm: 'accordion', stab: 'brass' }, mix: { lead: 0.55, stab: 0.16 }, sec: {
      bars: 2, chords: 'Bb,C D',
      lead: 'D5:2 F5:1 Bb5:3 E5:2 G5:1 C6:3 | D6:9 r:3', harm: true,
      lead2: 'r:12 | F#5:1 A5:1 D6:1 F#6:1 A6:8',
      bassLine: 'Bb1:3 Bb1:3 C2:3 C2:3 | D2:3 A1:3 D2:6', stab: 'X.....X.....|X...........', pad: true, drums: 'SIW1 SIW2',
    },
  },
  si_sunkey: {   // the three wedges fuse, KLIK: a celesta run up into a gold D major with choir, timpani and a gong
    bpm: 100, bassLow: 31, inst: { lead: 'celesta', lead2: 'bell', pad: 'strings' }, mix: { pad: 0.16, choir: 0.22, lead: 0.5 }, sec: {
      bars: 2, chords: 'Bb,C D',
      lead: 'Bb4:1 D5:1 F5:1 Bb5:1 D6:4 C5:1 E5:1 G5:1 C6:1 E6:4 | F#5:4 A5:4 D6:8',
      lead2: 'r:16 | D6:16', choir: true, pad: true,
      bassLine: 'Bb1:8 C2:8 | D2:16', drums: 'SIK1 SIK2',
    },
  },
});

// ---- Book 2 sfx (new names only; called from the si*.js files)
function siBurp(x, at) {   // a low comic "BRAAP": a raspy saw through two vowel formants
  for (const [bp, g] of [[520, 0.9], [900, 0.5]]) {
    x.tone({ type: 'sawtooth', at, f: 105, to: [[85, 0.4]], dur: 0.45, a: 0.02, hold: 0.15, g, bp: { f: bp, q: 4 }, rasp: [0.12, 0.03], am: [28, 0.5] });
  }
}
Object.assign(SFX, {
  // ---- the Kraken's tentacles (Stage 2) and the Kraken
  plank_burst: { g: 0.9, vary: 0.06, cap: 3, fn(x) {   // a tentacle bursts up through the deck: planks crack, wood flies, a wet shloop, spray
    x.tone({ f: 120, to: [[42, 0.25]], dur: 0.32, g: 0.9 });
    x.noise({ dur: 0.05, g: 0.6, bp: { f: 1800, q: 1.2 }, dist: true });
    for (let i = 0; i < 5; i++) x.noise({ at: rnd(0.01, 0.12), dur: 0.04, g: 0.4, bp: { f: rnd(700, 1600), q: 3 } });
    for (let i = 0; i < 3; i++) { const f = rnd(320, 520); x.tone({ type: 'triangle', at: rnd(0.1, 0.3), f, to: [[f * 0.8, 0.05]], dur: 0.06, g: 0.15 }); }
    x.tone({ at: 0.04, f: 150, to: [[420, 0.12], [140, 0.32]], dur: 0.34, a: 0.01, g: 0.32, fm: { r: 1, i0: 1.8, i1: 0.5, id: 0.1 } });
    x.noise({ at: 0.05, dur: 0.5, a: 0.03, g: 0.22, hp: 2500, lp: 7000 });
  } },
  tentacle_wind: { g: 2.8, vary: 0.08, cap: 3, fn(x) {   // a tentacle winds up (slap / sweep / grab): a wet, creaking curl
    x.noise({ dur: 0.45, a: 0.2, g: 0.35, bp: { f: 300, q: 2, to: [[900, 0.42]] }, am: [14, 0.6] });
    x.tone({ type: 'sawtooth', f: 90, to: [[150, 0.4]], dur: 0.45, a: 0.1, g: 0.12, lp: { f: 500, q: 3 }, rasp: [0.05, 0.02] });
  } },
  tentacle_swish: { g: 2.1, vary: 0.06, cap: 3, fn(x) {   // the slap / sweep swing: a heavy wet whoosh, dripping
    x.noise({ dur: 0.32, a: 0.06, g: 0.7, bp: { f: 250, q: 1.2, to: [[1100, 0.16], [400, 0.32]] } });
    x.noise({ dur: 0.25, a: 0.08, g: 0.12, hp: 2500, am: [25, 0.6] });
  } },
  tentacle_slap: { g: 0.95, vary: 0.06, cap: 3, fn(x) {   // SLAP on the deck: wet and heavy, with a splash
    x.noise({ dur: 0.07, g: 0.75, bp: { f: 1300, q: 0.8 }, dist: true });
    x.tone({ f: 150, to: [[48, 0.18]], dur: 0.24, g: 0.85 });
    x.noise({ dur: 0.3, g: 0.45, lp: { f: 3000, to: [[350, 0.3]] } });
    x.noise({ at: 0.03, dur: 0.4, a: 0.02, g: 0.16, hp: 3000 });
  } },
  tentacle_grab: { g: 1.4, vary: 0.05, cap: 2, fn(x) {   // GOT YOU: a squeezing squelch
    x.tone({ f: 180, to: [[320, 0.15], [260, 0.3]], dur: 0.32, a: 0.01, g: 0.35, fm: { r: 1, i0: 2.5, i1: 1, id: 0.1 }, am: [22, 0.4] });
    x.noise({ dur: 0.25, a: 0.02, g: 0.3, bp: { f: 700, q: 2, to: [[1200, 0.2]] } });
  } },
  tentacle_wilt: { g: 1.5, vary: 0.05, cap: 3, fn(x) {   // beaten: a droopy "pfwoooo" and bubbles as it sinks back (nobody is hurt)
    x.tone({ type: 'triangle', f: 520, to: [[140, 0.55]], dur: 0.6, a: 0.02, g: 0.3, vib: [7, 0.03] });
    x.noise({ dur: 0.5, a: 0.05, g: 0.18, lp: { f: 1500, to: [[300, 0.5]] } });
    for (let i = 0; i < 3; i++) x.tone({ at: 0.35 + i * 0.09, f: 260 + i * 60, to: [[600 + i * 80, 0.05]], dur: 0.07, g: 0.12 });
  } },
  kraken_roar: { g: 1.5, cap: 1, fn(x) {   // a huge wet "BWOOOARGH" that ends in a gurgle
    for (const [f, det, g] of [[62, -10, 0.22], [62, 10, 0.22], [93, 0, 0.12]]) {
      x.tone({ type: 'sawtooth', f, to: [[f * 1.3, 0.35], [f * 0.8, 1.3]], det, dur: 1.4, a: 0.12, hold: 0.7, g,
        lp: { f: 500, q: 3, to: [[1100, 0.4], [350, 1.3]] }, rasp: [0.07], am: [24, 0.35] });
    }
    x.noise({ dur: 1.3, a: 0.15, hold: 0.6, g: 0.25, lp: 700 });
    for (let i = 0; i < 6; i++) x.tone({ at: 1.0 + i * 0.07, f: rnd(110, 180), to: [[rnd(260, 380), 0.05]], dur: 0.07, g: 0.14 });
  } },
  kraken_stun: { g: 1.15, cap: 1, fn(x) {   // DIZZY: a big bonk, a woozy slide down, birdies tweeting round its head
    x.tone({ f: 170, to: [[55, 0.2]], dur: 0.28, g: 0.8 });
    x.tone({ f: 900, dur: 0.3, g: 0.12, fm: { r: 1.41, i0: 4, i1: 0.4, id: 0.06 } });
    x.tone({ type: 'triangle', at: 0.15, f: 700, to: [[220, 0.9]], dur: 0.95, a: 0.05, g: 0.22, vib: [6, 0.06] });
    for (let i = 0; i < 6; i++) x.tone({ at: 0.45 + i * 0.16, f: i % 2 ? 2400 : 2050, to: [[i % 2 ? 2900 : 2500, 0.06]], dur: 0.08, g: 0.06, vib: [30, 0.02] });
  } },
  kraken_down: { g: 0.65, cap: 1, fn(x) {   // it flops onto the rail: a big wet thud, a sleepy groan, spray
    x.tone({ f: 90, to: [[30, 0.6]], dur: 0.7, g: 0.9 });
    x.noise({ dur: 0.6, g: 0.5, lp: { f: 2500, to: [[200, 0.6]] } });
    x.tone({ type: 'sawtooth', at: 0.15, f: 110, to: [[70, 0.9]], dur: 1.0, a: 0.1, g: 0.14, lp: { f: 500, q: 3 }, rasp: [0.05] });
    x.noise({ at: 0.1, dur: 0.8, a: 0.05, g: 0.2, hp: 2000, lp: 6000 });
  } },
  // ---- the Leviathan (Stage 1's mini-boss)
  levi_roar: { g: 1.4, cap: 1, fn(x) {   // the sea serpent: a long hiss that opens into a roar
    x.noise({ dur: 0.6, a: 0.15, g: 0.35, bp: { f: 3200, q: 1.2, to: [[2200, 0.6]] } });
    for (const [f, det, g] of [[110, -8, 0.18], [110, 8, 0.18], [165, 0, 0.1]]) {
      x.tone({ type: 'sawtooth', at: 0.3, f, to: [[f * 1.35, 0.3], [f * 0.9, 0.9]], det, dur: 0.95, a: 0.08, hold: 0.4, g,
        lp: { f: 800, q: 4, to: [[1700, 0.3], [600, 0.9]] }, rasp: [0.06] });
    }
  } },
  levi_rear: { g: 1.15, cap: 2, fn(x) {   // it rears up for the FANG SLAM: a rising hiss, its teeth rattling
    x.noise({ dur: 0.7, a: 0.45, g: 0.4, bp: { f: 600, q: 1.5, to: [[2400, 0.7]] }, elin: true });
    x.noise({ dur: 0.65, a: 0.3, g: 0.14, bp: { f: 3000, q: 4 }, am: [28, 0.8, 'square'] });
    x.tone({ f: 70, to: [[120, 0.65]], dur: 0.7, a: 0.2, g: 0.25 });
  } },
  fang_slam: { g: 0.85, vary: 0.04, cap: 2, fn(x) {   // three fangs THUNK-THUNK-THUNK into the planks
    for (const [at, f] of [[0, 150], [0.035, 135], [0.07, 120]]) {
      x.tone({ at, f, to: [[50, 0.12]], dur: 0.16, g: 0.6 });
      x.noise({ at, dur: 0.05, g: 0.45, bp: { f: 1100, q: 2.5 } });
    }
    x.noise({ dur: 0.08, g: 0.4, hp: 1500, dist: true });
    x.tone({ f: 70, to: [[32, 0.5]], dur: 0.6, g: 0.6 });
    for (let i = 0; i < 4; i++) x.noise({ at: rnd(0.05, 0.2), dur: 0.035, g: 0.25, bp: { f: rnd(800, 1500), q: 3 } });
  } },
  fang_stuck: { g: 3.2, vary: 0.1, cap: 2, fn(x) {   // it tugs at its stuck fangs: the planks creak
    x.tone({ type: 'sawtooth', f: 150, to: [[185, 0.3]], dur: 0.34, a: 0.03, g: 0.6, bp: { f: 900, q: 4 }, rasp: [0.1, 0.02] });
    x.tone({ type: 'sawtooth', at: 0.05, f: 230, to: [[205, 0.25]], dur: 0.28, a: 0.03, g: 0.3, bp: { f: 1400, q: 5 }, rasp: [0.08, 0.02] });
  } },
  fang_free: { g: 1.5, vary: 0.05, cap: 2, fn(x) {   // pulled free: a woody POK and a squeak
    x.tone({ f: 300, to: [[900, 0.05]], dur: 0.07, g: 0.35 });
    x.noise({ dur: 0.04, g: 0.4, bp: { f: 1500, q: 2 } });
    x.tone({ type: 'square', at: 0.06, f: 1200, to: [[1700, 0.06], [1300, 0.12]], dur: 0.13, g: 0.05, lp: 4000 });
  } },
  levi_snap: { g: 1.8, vary: 0.05, cap: 2, fn(x) {   // CHOMP: two hard teeth clacks
    for (const at of [0, 0.07]) {
      x.noise({ at, dur: 0.025, g: 0.35, hp: 2200 });
      x.tone({ at, f: 900, to: [[320, 0.03]], dur: 0.04, g: 0.35 });
      x.tone({ at, f: 160, to: [[70, 0.06]], dur: 0.08, g: 0.8 });
    }
  } },
  whirlpool: { g: 1.0, cap: 1, hold: true, fn(x) {   // the sea swirls: rushing, circling water, a deep gurgle, bubbles (held: until stop())
    const dur = 2.6 + (x.hold || 0), sw = [];
    for (let k = 1; k * 0.6 < dur; k++) sw.push([k % 2 ? 1100 : 420, k * 0.6]);
    x.noise({ dur, a: 0.5, hold: dur - 1.1, g: 0.42, bp: { f: 420, q: 1.4, to: sw }, am: [1.6, 0.5] });
    x.noise({ dur, a: 0.4, hold: dur - 1.0, g: 0.3, lp: 220, am: [1.6, 0.4] });
    x.tone({ f: 48, dur, a: 0.4, hold: dur - 1.0, g: 0.22, am: [1.6, 0.3] });
    for (let i = 0, n = Math.floor(dur / 0.22); i < n; i++) x.tone({ at: 0.2 + i * 0.22 + rnd(0, 0.1), f: rnd(120, 200), to: [[rnd(300, 450), 0.05]], dur: 0.06, g: rnd(0.06, 0.12) });
  } },
  splash: { g: 1.1, vary: 0.08, cap: 3, fn(x) {   // a big water SPLASH
    x.tone({ f: 130, to: [[55, 0.12]], dur: 0.16, g: 0.5 });
    x.noise({ dur: 0.55, a: 0.01, g: 0.6, lp: { f: 5000, to: [[700, 0.55]] } });
    x.noise({ at: 0.02, dur: 0.45, a: 0.03, g: 0.22, hp: 2500 });
    for (let i = 0; i < 5; i++) x.tone({ at: rnd(0.15, 0.5), f: rnd(700, 1400), to: [[rnd(1500, 2400), 0.03]], dur: 0.04, g: 0.05 });
  } },
  levi_blub: { g: 1.45, cap: 1, fn(x) {   // "BLUB?": three bubbles and a gulp that goes UP like a question
    for (let i = 0; i < 3; i++) x.tone({ at: i * 0.1, f: 200 + i * 50, to: [[500 + i * 90, 0.05]], dur: 0.07, g: 0.15 });
    x.tone({ at: 0.36, f: 170, to: [[150, 0.12], [330, 0.42]], dur: 0.45, a: 0.02, g: 0.32, fm: { r: 1, i0: 1.6, i1: 0.6, id: 0.1 }, lp: 1500 });
  } },
  sink_gurgle: { g: 1.3, cap: 2, fn(x) {   // sinking back into the sea: a low swell and bubbles going down
    x.noise({ dur: 1.4, a: 0.3, g: 0.3, lp: { f: 900, to: [[200, 1.4]] } });
    x.tone({ f: 70, to: [[40, 1.2]], dur: 1.3, a: 0.2, g: 0.25 });
    for (let i = 0; i < 9; i++) x.tone({ at: 0.1 + i * 0.12 + rnd(0, 0.05), f: 420 - i * 30, to: [[600 - i * 40, 0.04]], dur: 0.06, g: 0.1 });
  } },
  // ---- the Cave of Rage
  rage_grow: { g: 2.2, vary: 0.08, cap: 2, fn(x) {   // a fire wolf GROWS angrier: a quick rising fwoomp and a growl
    x.noise({ dur: 0.35, a: 0.05, g: 0.45, bp: { f: 300, q: 1, to: [[1500, 0.3]] } });
    x.tone({ type: 'sawtooth', f: 85, to: [[140, 0.3]], dur: 0.36, a: 0.03, g: 0.16, lp: { f: 600, q: 3 }, rasp: [0.08], am: [30, 0.4] });
    x.noise({ at: 0.05, dur: 0.3, g: 0.08, hp: 3000, am: [24, 0.8, 'square'] });
  } },
  rage_calm: { g: 2.7, vary: 0.04, cap: 2, fn(x) {   // CALM!: a soft falling chime and a cooling breath
    [88, 84, 81, 76].forEach((m, i) => x.bell(i * 0.07, mtof(m), 0.5, 0.08, 2));
    x.noise({ dur: 0.6, a: 0.15, g: 0.12, bp: { f: 2200, q: 0.8, to: [[600, 0.6]] } });
  } },
  puppy_pop: { g: 1.8, cap: 3, fn(x) {   // POP! into a puppy: a cork pop, a happy yip, sparkles
    x.tone({ f: 240, to: [[1100, 0.04]], dur: 0.06, g: 0.4 });
    x.noise({ dur: 0.05, g: 0.3, bp: { f: 2000, q: 1 } });
    x.tone({ type: 'square', at: 0.1, f: 1300, to: [[1900, 0.05], [1500, 0.12]], dur: 0.13, g: 0.06, lp: 4500 });
    [84, 88, 91, 96].forEach((m, i) => x.bell(0.16 + i * 0.05, mtof(m), 0.35, 0.06));
  } },
  puppy_yip: { g: 5.0, vary: 0.1, cap: 2, fn(x) {   // YIP! (a pat)
    x.tone({ type: 'square', f: 1200, to: [[1800, 0.04], [1400, 0.1]], dur: 0.11, g: 0.07, lp: 4000, vib: [35, 0.04] });
    x.tone({ type: 'square', at: 0.13, f: 1350, to: [[2000, 0.04], [1550, 0.09]], dur: 0.1, g: 0.06, lp: 4000 });
  } },
  calm_cloud: { g: 3.0, cap: 1, fn(x) {   // CALM LITTLE CLOUD: a soft whoosh outward and a warm chord
    x.noise({ dur: 0.9, a: 0.1, g: 0.3, bp: { f: 400, q: 0.8, to: [[1600, 0.4], [700, 0.9]] } });
    for (const [m, at] of [[65, 0.05], [69, 0.1], [72, 0.15], [77, 0.2]]) x.tone({ at, f: mtof(m), dur: 1.0, a: 0.08, g: 0.07, fm: { r: 2, i0: 0.6, i1: 0.2, id: 0.3 } });
  } },
  // ---- the Swamp of Despair
  tree_rattle: { g: 1.5, vary: 0.1, cap: 3, fn(x) {   // a swamp tree is only RATTLED: a hollow wooden knock, leaves shaking
    x.tone({ type: 'triangle', f: 230, to: [[170, 0.08]], dur: 0.14, g: 0.4 });
    x.noise({ dur: 0.04, g: 0.35, bp: { f: 700, q: 5 } });
    x.noise({ at: 0.03, dur: 0.35, a: 0.05, g: 0.12, hp: 3500, am: [32, 0.8, 'square'] });
  } },
  tree_flee: { g: 2.5, cap: 2, fn(x) {   // its crown catches: FWOOMP, a squeaky "YIPE!" and little root feet running off
    x.noise({ dur: 0.6, a: 0.05, g: 0.45, bp: { f: 400, q: 0.9, to: [[1800, 0.25], [900, 0.6]] } });
    x.noise({ at: 0.05, dur: 0.5, g: 0.12, hp: 3000, am: [22, 0.8, 'square'] });
    x.tone({ type: 'square', at: 0.12, f: 900, to: [[1500, 0.06], [700, 0.3]], dur: 0.32, a: 0.005, g: 0.1, lp: { f: 2600, q: 2 }, vib: [26, 0.05] });
    for (let i = 0; i < 6; i++) x.noise({ at: 0.4 + i * 0.075, dur: 0.03, g: 0.18, bp: { f: 900 + (i % 2) * 300, q: 3 } });
  } },
  ring_appear: { g: 1.1, cap: 1, fn(x) {   // the FIRE RING glows up on the floor: a warm swell and a rising chime
    x.tone({ f: 110, dur: 1.0, a: 0.3, g: 0.2, fm: { r: 2, i0: 0.8, i1: 0.4, id: 0.4 } });
    [69, 73, 76, 81, 85].forEach((m, i) => x.bell(0.1 + i * 0.07, mtof(m), 0.6, 0.07, 2));
    x.noise({ dur: 0.9, a: 0.3, g: 0.08, hp: 3500, am: [20, 0.7, 'square'] });
  } },
  ring_charge: { g: 1.1, cap: 1, hold: true, fn(x) {   // the caster fills the ring: a warm hum rising over ~6 s, crackling (held: until stop())
    const dur = x.hold ? x.hold + 0.2 : 1.2, rise = Math.min(dur, 6), top = Math.max(0.05, dur - 0.5);
    for (const [mul, det, g] of [[1, -6, 0.13], [1.5, 6, 0.08], [2, 0, 0.05]]) {
      x.tone({ f: 140 * mul, to: [[460 * mul, rise]], det, dur, a: 0.3, hold: top, g, fm: { r: 2, i0: 0.6, i1: 0.3, id: 0.5 }, am: [8, 0.25] });
    }
    x.noise({ dur, a: 0.5, hold: Math.max(0.05, dur - 0.7), g: 0.08, hp: 2800, am: [21, 0.8, 'square'] });
    x.noise({ dur, a: 0.6, hold: Math.max(0.05, dur - 0.8), g: 0.1, bp: { f: 500, q: 0.8, to: [[1400, rise]] } });
  } },
  ring_blast: { g: 0.85, cap: 1, fn(x) {   // the FIRE RING blasts out: a deep FWOOM, a ring of roaring flame, gold shimmer
    x.tone({ f: 120, to: [[35, 0.5]], dur: 0.65, g: 0.85 });
    x.noise({ dur: 1.3, a: 0.04, hold: 0.3, g: 0.6, bp: { f: 300, q: 0.7, to: [[2200, 0.35], [700, 1.3]] } });
    x.noise({ at: 0.05, dur: 1.1, a: 0.1, hold: 0.3, g: 0.16, hp: 2800, am: [23, 0.8, 'square'] });
    x.noise({ dur: 1.2, a: 0.05, hold: 0.3, g: 0.35, lp: 200 });
    [74, 78, 81, 86, 90].forEach((m, i) => x.bell(0.15 + i * 0.06, mtof(m), 0.6, 0.06));
  } },
  gloom_cheer: { g: 2.8, cap: 2, fn(x) {   // "I believe in you!": cheered up -- a warm rising arpeggio and a sparkle
    [72, 76, 79, 84].forEach((m, i) => x.tone({ at: i * 0.07, f: mtof(m), dur: 0.35, a: 0.01, g: 0.1, fm: { r: 1, i0: 1.2, i1: 0.3, id: 0.1 } }));
    x.bell(0.3, mtof(91), 0.5, 0.07);
    x.noise({ at: 0.2, dur: 0.4, a: 0.1, g: 0.05, hp: 6000 });
  } },
  gloom_sad: { g: 1.25, cap: 2, fn(x) {   // "GLOOMY...": a soft droopy wah-wah
    x.tone({ type: 'triangle', f: 440, to: [[415, 0.25]], dur: 0.28, a: 0.03, g: 0.22, lp: { f: 1200, q: 2 } });
    x.tone({ type: 'triangle', at: 0.3, f: 392, to: [[330, 0.4]], dur: 0.45, a: 0.03, g: 0.22, lp: { f: 1200, q: 2 }, vib: [5, 0.02] });
  } },
  // ---- the Cell of Sloth
  slime_goo: { g: 1.1, vary: 0.08, cap: 3, fn(x) {   // STICKY: a squelchy splortch
    x.tone({ f: 120, to: [[240, 0.06], [90, 0.2]], dur: 0.22, a: 0.005, g: 0.4, fm: { r: 1, i0: 2.2, i1: 0.6, id: 0.06 } });
    x.noise({ dur: 0.2, a: 0.01, g: 0.3, bp: { f: 600, q: 2, to: [[1000, 0.08], [400, 0.2]] }, am: [40, 0.5] });
  } },
  slime_splat: { g: 1.3, vary: 0.08, cap: 3, fn(x) {   // SPLAT into a puddle
    x.tone({ f: 200, to: [[70, 0.12]], dur: 0.16, g: 0.5 });
    x.noise({ dur: 0.35, a: 0.005, g: 0.5, lp: { f: 2500, to: [[300, 0.35]] }, am: [30, 0.4] });
    for (let i = 0; i < 4; i++) x.tone({ at: rnd(0.08, 0.35), f: rnd(150, 260), to: [[rnd(350, 500), 0.04]], dur: 0.05, g: 0.1 });
  } },
  sloth_inhale: { g: 1.3, cap: 1, fn(x) {   // the Sloth Beast gets ready to GULP: a long slurping in-breath
    x.noise({ dur: 0.9, a: 0.7, g: 0.4, bp: { f: 300, q: 2, to: [[1100, 0.85]] }, elin: true, am: [18, 0.4] });
    x.tone({ f: 80, to: [[140, 0.85]], dur: 0.9, a: 0.5, g: 0.2, fm: { r: 1, i0: 1.5, i1: 1, id: 0.4 }, elin: true });
  } },
  sloth_gulp: { g: 1.0, cap: 2, fn(x) {   // GULP!: a deep, comic swallow and a bubble
    x.tone({ f: 260, to: [[90, 0.18]], dur: 0.22, a: 0.01, g: 0.5, fm: { r: 1, i0: 2.5, i1: 0.8, id: 0.08 } });
    x.tone({ at: 0.2, f: 110, to: [[60, 0.3]], dur: 0.35, g: 0.5 });
    x.noise({ at: 0.18, dur: 0.3, g: 0.25, lp: { f: 900, to: [[200, 0.3]] } });
    x.tone({ at: 0.45, f: 140, to: [[300, 0.06]], dur: 0.08, g: 0.15 });
  } },
  sloth_spit: { g: 2.6, vary: 0.06, cap: 2, fn(x) {   // the Beast SPITS a goo ball: a wet raspberry and a whoosh
    x.noise({ dur: 0.25, a: 0.01, g: 0.9, bp: { f: 900, q: 2 }, am: [42, 0.7, 'square'] });
    x.tone({ type: 'sawtooth', f: 110, to: [[160, 0.2]], dur: 0.24, a: 0.01, g: 0.3, lp: { f: 900, q: 2 }, am: [42, 0.6] });
    x.noise({ at: 0.15, dur: 0.3, a: 0.03, g: 0.8, bp: { f: 500, q: 1.2, to: [[1800, 0.25]] } });
  } },
  sloth_spitout: { g: 1.8, cap: 2, fn(x) {   // PTOOEY!: a hero spat out -- the raspberry, a pop, then a little burp
    x.noise({ dur: 0.22, a: 0.01, g: 0.9, bp: { f: 1000, q: 2 }, am: [44, 0.7, 'square'] });
    x.tone({ at: 0.2, f: 220, to: [[900, 0.04]], dur: 0.06, g: 0.4 });
    x.noise({ at: 0.2, dur: 0.05, g: 0.3, bp: { f: 1800, q: 1 } });
    siBurp(x, 0.6);
  } },
  sloth_burp: { g: 2.0, vary: 0.08, cap: 1, fn(x) { siBurp(x, 0); } },   // *BRAAP*
  yawn: { g: 1.5, cap: 1, fn(x) {   // a big cartoon YAAAWN: a vowel that opens, rises and sinks, a breath, a little "mm"
    for (const [bp, g] of [[750, 0.5], [1150, 0.28], [2500, 0.07]]) {
      x.tone({ type: 'sawtooth', f: 180, to: [[250, 0.45], [150, 1.3]], dur: 1.35, a: 0.2, hold: 0.6, g, bp: { f: bp, q: 5 }, vib: [5, 0.02] });
    }
    x.noise({ dur: 1.3, a: 0.3, hold: 0.5, g: 0.12, bp: { f: 1200, q: 1 } });
    x.tone({ at: 1.4, f: 140, to: [[120, 0.15]], dur: 0.2, a: 0.02, g: 0.12, lp: 400 });
  } },
  snore: { g: 3.0, cap: 2, fn(x) {   // ZZZ...: a hero nods off -- a fluttering in-breath and a little whistle out
    x.noise({ dur: 0.75, a: 0.5, g: 0.7, bp: { f: 320, q: 4, to: [[620, 0.7]] }, am: [26, 0.6], elin: true });
    x.tone({ at: 0.8, f: 1100, to: [[650, 0.45]], dur: 0.5, a: 0.05, g: 0.06 });
  } },
  // ---- the Skull Palace: the feelings, the beam clash, the mask, the pufferfish
  sad_rain: { g: 1.5, cap: 2, fn(x) {   // the sad cloud rains: a soft patter and a little "boo-hoo" sigh
    x.noise({ dur: 1.6, a: 0.25, hold: 0.9, g: 0.17, hp: 2200, lp: 5500, am: [17, 0.7, 'square'] });
    for (let i = 0; i < 14; i++) x.tone({ at: rnd(0.05, 1.5), f: rnd(1300, 2300), to: [[rnd(700, 1000), 0.03]], dur: 0.04, g: rnd(0.03, 0.06) });
    x.tone({ type: 'triangle', at: 0.2, f: 520, to: [[400, 0.35], [460, 0.5], [330, 0.9]], dur: 0.95, a: 0.05, g: 0.12, lp: { f: 1300, q: 2 }, vib: [6, 0.03] });
  } },
  rainbow: { g: 2.3, cap: 1, fn(x) {   // A RAINBOW!: a shimmering run up a C major scale and a warm chord
    [72, 74, 76, 77, 79, 81, 83, 84, 86, 88].forEach((m, i) => x.tone({ at: i * 0.045, f: mtof(m), dur: 0.5, a: 0.004, g: 0.06, fm: { r: 1, i0: 1.6, i1: 0.2, id: 0.08 } }));
    for (const m of [72, 76, 79]) x.tone({ at: 0.45, f: mtof(m), dur: 1.2, a: 0.1, g: 0.06, fm: { r: 2, i0: 0.5, i1: 0.2, id: 0.4 }, vib: [5, 0.004] });
    x.bell(0.5, mtof(96), 0.9, 0.06);
  } },
  shade_shiver: { g: 1.6, cap: 2, fn(x) {   // the fear shade stares: a trembling, shivery whine (spooky-silly, not scary)
    x.tone({ type: 'triangle', f: 620, to: [[560, 0.6]], dur: 0.65, a: 0.08, g: 0.14, vib: [11, 0.05], lp: 2000 });
    x.tone({ type: 'triangle', f: 740, to: [[690, 0.6]], dur: 0.6, a: 0.1, g: 0.09, vib: [12, 0.05], lp: 2000 });
  } },
  shade_pop: { g: 3.0, cap: 2, fn(x) {   // POP!: the fear shade bursts like a soap bubble; a relieved little whistle
    x.tone({ f: 700, to: [[2200, 0.03]], dur: 0.05, g: 0.3 });
    x.noise({ dur: 0.06, g: 0.25, hp: 2500 });
    x.tone({ at: 0.07, f: 1000, to: [[1500, 0.15], [1200, 0.3]], dur: 0.32, a: 0.02, g: 0.06 });
    [88, 91, 96].forEach((m, i) => x.bell(0.08 + i * 0.05, mtof(m), 0.3, 0.05));
  } },
  beam_clash: { g: 1.8, cap: 1, hold: true, fn(x) {   // BEAM CLASH: two beams grinding -- a buzzing, crackling standoff (held: until stop())
    const dur = 0.9 + (x.hold || 0.4);
    for (const [f, det, g, bp] of [[110, -12, 0.14, 700], [165, 9, 0.1, 1100]]) {
      x.tone({ type: 'sawtooth', f, to: [[f * 1.06, dur * 0.5], [f, dur]], det, dur, a: 0.08, hold: dur - 0.3, g, bp: { f: bp, q: 2 }, am: [17, 0.45] });
    }
    x.tone({ f: 880, dur, a: 0.15, hold: dur - 0.4, g: 0.04, vib: [7, 0.02], fm: { r: 1.5, i0: 0.8, i1: 0.6, id: 0.5 } });
    x.noise({ dur, a: 0.05, hold: dur - 0.2, g: 0.06, hp: 2800, am: [31, 0.8, 'square'] });
  } },
  beam_push: { g: 4.5, vary: 0.04, cap: 3, fn(x) {   // one push in the clash (pass pitch up with the meter): a short zappy surge
    x.tone({ type: 'square', f: 600, to: [[1100, 0.06]], dur: 0.08, g: 0.06, lp: 3500 });
    x.noise({ dur: 0.06, g: 0.15, bp: { f: 3000, q: 1.5 } });
  } },
  beam_break: { g: 1.3, cap: 1, fn(x) {   // the clash is WON: the beam snaps -- a glassy crack, a whoosh, a sparkle
    x.noise({ dur: 0.04, g: 0.5, hp: 3000 });
    x.tone({ f: 2400, dur: 0.4, g: 0.12, fm: { r: 2.76, i0: 3, i1: 0.3, id: 0.06 } });
    x.noise({ at: 0.02, dur: 0.5, a: 0.03, g: 0.35, bp: { f: 2500, q: 0.8, to: [[500, 0.5]] } });
    x.tone({ f: 140, to: [[45, 0.3]], dur: 0.35, g: 0.5 });
    for (let i = 0; i < 6; i++) x.bell(0.1 + rnd(0, 0.5), rnd(2000, 3800), 0.3, 0.04, 2.76);
  } },
  mask_crack: { g: 1.75, cap: 2, fn(x) {   // KRRRAK!: the split mask cracks -- a ceramic crackle, a crystal ping, shards
    for (const at of [0, 0.045, 0.09, 0.15]) x.noise({ at, dur: 0.03, g: 0.5, hp: 2400, lp: 9000 });
    x.tone({ f: 1860, dur: 0.6, g: 0.12, fm: { r: 1.41, i0: 4, i1: 0.5, id: 0.07 } });
    x.tone({ f: 160, to: [[60, 0.15]], dur: 0.2, g: 0.45 });
    for (let i = 0; i < 7; i++) x.bell(0.15 + rnd(0, 0.5), rnd(2200, 4200), rnd(0.15, 0.3), rnd(0.03, 0.05), 2.76);
  } },
  puffer_pop: { g: 1.6, cap: 1, fn(x) {   // he SHRINKS -- bwoop! -- and puffs up into a tiny furious pufferfish (squeak!)
    x.tone({ type: 'triangle', f: 600, to: [[150, 0.35]], dur: 0.38, a: 0.01, g: 0.25 });
    x.tone({ at: 0.4, f: 300, to: [[900, 0.25]], dur: 0.3, a: 0.01, g: 0.22, vib: [16, 0.04] });
    x.tone({ at: 0.45, f: 300, to: [[900, 0.25]], dur: 0.25, g: 0.06, fm: { r: 2, i0: 1, i1: 0.3 } });
    x.tone({ type: 'square', at: 0.72, f: 1500, to: [[2000, 0.04], [1400, 0.1]], dur: 0.11, g: 0.06, lp: 4000 });
  } },
  // ---- secrets: the doubloon chests
  doubloon_chest: { g: 2.4, cap: 2, fn(x) {   // a pirate chest of doubloons: the creak, the lid, a shower of gold coins, ta-da
    x.tone({ type: 'sawtooth', f: 150, to: [[240, 0.28]], dur: 0.3, a: 0.03, g: 0.16, bp: { f: 850, q: 3 }, rasp: [0.08, 0.02] });
    x.noise({ at: 0.28, dur: 0.03, g: 0.4, bp: { f: 1500, q: 2 } });
    x.tone({ at: 0.28, f: 140, to: [[75, 0.05]], dur: 0.08, g: 0.3 });
    for (let i = 0; i < 10; i++) x.tone({ at: 0.34 + i * 0.045 + rnd(0, 0.02), f: rnd(2400, 3600), dur: 0.12, g: 0.05, fm: { r: 1.41, i0: 2, i1: 0.3, id: 0.03 } });
    [79, 83, 86, 91].forEach((m, i) => x.tone({ at: 0.75 + i * 0.07, type: 'square', f: mtof(m), dur: i === 3 ? 0.3 : 0.08, g: 0.07, lp: 6000 }));
  } },
  doubloon_glint: { g: 2.6, cap: 2, fn(x) { x.bell(0, 3136, 0.4, 0.06, 2); x.bell(0.06, 4699, 0.3, 0.035, 2); } },   // a hidden chest glints
  // ---- the Storm Sea ride
  cannon: { g: 0.5, vary: 0.06, cap: 4, fn(x) {   // the Scarlet Dawn's cannon: a round BOOM and the ball whistling away
    x.tone({ f: 110, to: [[38, 0.22]], dur: 0.3, g: 0.8 });
    x.noise({ dur: 0.35, g: 0.55, lp: { f: 3500, to: [[250, 0.35]] } });
    x.noise({ dur: 0.03, g: 0.4, hp: 2000 });
    x.tone({ at: 0.05, f: 1400, to: [[900, 0.3]], dur: 0.32, a: 0.04, g: 0.03 });
  } },
  ball_burst: { g: 0.8, vary: 0.1, cap: 4, fn(x) {   // the cannonball bursts in the sky: a light POMF and a crackle
    x.tone({ f: 200, to: [[80, 0.1]], dur: 0.14, g: 0.4 });
    x.noise({ dur: 0.25, g: 0.35, lp: { f: 3000, to: [[500, 0.25]] } });
    x.noise({ at: 0.03, dur: 0.25, g: 0.08, hp: 3000, am: [27, 0.8, 'square'] });
  } },
  bat_pop: { g: 2.1, vary: 0.08, cap: 4, fn(x) {   // a storm-bat POPS: a pop and a little squeak
    x.tone({ f: 350, to: [[1300, 0.03]], dur: 0.05, g: 0.3 });
    x.noise({ dur: 0.05, g: 0.2, bp: { f: 2200, q: 1 } });
    x.tone({ type: 'square', at: 0.05, f: 1700, to: [[2300, 0.04], [1600, 0.09]], dur: 0.1, g: 0.04, lp: 4500 });
    x.noise({ at: 0.04, dur: 0.25, a: 0.02, g: 0.08, lp: { f: 2500, to: [[400, 0.25]] } });
  } },
  orb_crack: { g: 2.1, vary: 0.06, cap: 3, fn(x) {   // CRACK!: a burst cracks a lightning orb -- an electric snap on glass
    x.noise({ dur: 0.05, g: 0.5, hp: 2500, am: [90, 0.8, 'square'] });
    x.tone({ f: 2100, dur: 0.25, g: 0.1, fm: { r: 2.76, i0: 3, i1: 0.3, id: 0.05 } });
    x.tone({ type: 'sawtooth', f: 180, to: [[120, 0.15]], dur: 0.18, g: 0.08, bp: { f: 1500, q: 2 }, am: [60, 0.6] });
  } },
  kraken_smash: { g: 0.85, cap: 1, fn(x) {   // KRAKEN SMASH: a great arm slams the sea flat -- whoosh, BOOM, a wall of spray
    x.noise({ dur: 0.45, a: 0.3, g: 0.45, bp: { f: 250, q: 1, to: [[1200, 0.4]] }, elin: true });
    x.tone({ at: 0.4, f: 100, to: [[28, 0.7]], dur: 0.85, g: 0.9 });
    x.noise({ at: 0.4, dur: 1.2, a: 0.01, g: 0.65, lp: { f: 5000, to: [[500, 1.2]] } });
    x.noise({ at: 0.45, dur: 1.0, a: 0.05, g: 0.22, hp: 2500 });
    for (let i = 0; i < 8; i++) x.tone({ at: 0.6 + rnd(0, 0.8), f: rnd(700, 1400), to: [[rnd(1500, 2400), 0.03]], dur: 0.04, g: 0.05 });
  } },
});

// ---- Book 2 hit sounds by material (AA bar item 6: "sparks / splashes by material ... a sound")
Object.assign(SFX, {
  hit_slime: { g: 1.5, vary: 0.08, cap: 4, fn(x) {   // a hit on a slime: a squishy SPLORCH
    x.tone({ f: 190, to: [[95, 0.1]], dur: 0.14, a: 0.004, g: 0.45, fm: { r: 1, i0: 2.4, i1: 0.5, id: 0.05 } });
    x.noise({ dur: 0.14, a: 0.005, g: 0.35, bp: { f: 550, q: 1.8, to: [[900, 0.05], [350, 0.14]] }, am: [40, 0.5] });
    x.tone({ f: 120, to: [[60, 0.08]], dur: 0.1, g: 0.35 });
  } },
  hit_shell: { g: 1.8, vary: 0.08, cap: 4, fn(x) {   // a hit on a crab's shell: a hard chitin clack
    x.noise({ dur: 0.025, g: 0.5, bp: { f: 3000, q: 4 } });
    x.tone({ f: 1300, to: [[900, 0.03]], dur: 0.05, g: 0.2 });
    x.tone({ f: 210, to: [[90, 0.07]], dur: 0.09, g: 0.45 });
  } },
  hit_wet: { g: 1.3, vary: 0.07, cap: 4, fn(x) {   // a hit on a tentacle: a rubbery, wet THWACK and a few drips
    x.noise({ dur: 0.06, g: 0.55, bp: { f: 900, q: 1 } });
    x.tone({ f: 220, to: [[70, 0.1]], dur: 0.14, g: 0.6 });
    x.noise({ at: 0.02, dur: 0.22, a: 0.01, g: 0.12, hp: 3000 });
  } },
});

// ---- Book 2 wind-up (telegraph) sounds for src/sitele.js windSound(), and the Storm Sea ride's spawns
Object.assign(SFX, {
  tele_swing: { g: 2.4, vary: 0.08, cap: 3, fn(x) {   // a club / branch winds back: a rising whoosh-up and a creak
    x.noise({ dur: 0.3, a: 0.22, g: 0.5, bp: { f: 350, q: 1.6, to: [[1500, 0.28]] }, elin: true });
    x.tone({ type: 'triangle', at: 0.04, f: 180, to: [[260, 0.2]], dur: 0.22, a: 0.02, g: 0.1, lp: 900 });
  } },
  tele_lunge: { g: 2.6, vary: 0.08, cap: 3, fn(x) {   // gets ready to LUNGE: a sharp "hup!" breath
    x.noise({ dur: 0.12, a: 0.02, g: 0.4, bp: { f: 1100, q: 1.5, to: [[1700, 0.1]] } });
    x.tone({ type: 'square', at: 0.02, f: 330, to: [[520, 0.08]], dur: 0.1, a: 0.01, g: 0.08, lp: { f: 1600, q: 2 } });
  } },
  tele_snip: { g: 3.6, vary: 0.1, cap: 3, fn(x) {   // a crab / sapling / slime: two quick claw clacks
    for (const at of [0, 0.09]) {
      x.noise({ at, dur: 0.018, g: 0.45, bp: { f: 2600, q: 5 } });
      x.tone({ at, f: 1500, to: [[1100, 0.02]], dur: 0.03, g: 0.18 });
    }
  } },
  tele_dive: { g: 2.4, vary: 0.08, cap: 3, fn(x) {   // an imp tips into a dive: a falling whistle
    x.tone({ f: 1700, to: [[850, 0.38]], dur: 0.4, a: 0.03, g: 0.08, vib: [9, 0.03] });
    x.noise({ dur: 0.35, a: 0.15, g: 0.12, bp: { f: 2000, q: 2, to: [[900, 0.35]] } });
  } },
  tele_growl: { g: 1.35, vary: 0.08, cap: 3, fn(x) {   // a beast / big tree winds up: a low growl
    x.tone({ type: 'sawtooth', f: 78, to: [[95, 0.2], [72, 0.45]], dur: 0.48, a: 0.05, hold: 0.2, g: 0.3, lp: { f: 520, q: 3 }, rasp: [0.08], am: [30, 0.45] });
    x.noise({ dur: 0.45, a: 0.08, g: 0.12, bp: { f: 400, q: 1.5 } });
  } },
  tele_spin: { g: 3.4, vary: 0.08, cap: 3, fn(x) {   // a rope or a net twirls overhead: whoop-whoop-whoop
    x.noise({ dur: 0.55, a: 0.08, g: 0.9, bp: { f: 800, q: 2.5, to: [[1300, 0.55]] }, am: [9, 0.85] });
  } },
  orb_spawn: { g: 1.3, cap: 2, fn(x) {   // a lightning orb forms in the storm: a crackling, rising buzz
    x.noise({ dur: 0.6, a: 0.35, g: 0.18, hp: 1800, am: [38, 0.8, 'square'], elin: true });
    x.tone({ type: 'sawtooth', f: 220, to: [[330, 0.55]], dur: 0.6, a: 0.3, g: 0.07, bp: { f: 1200, q: 2 }, am: [45, 0.6], elin: true });
  } },
  bat_swarm: { g: 2.0, cap: 2, fn(x) {   // a swarm of storm-bats: fluttering wings and squeaks
    x.noise({ dur: 0.8, a: 0.2, g: 0.7, bp: { f: 1400, q: 1.5 }, am: [22, 0.8] });
    for (let i = 0; i < 4; i++) { const f = rnd(1600, 2200); x.tone({ type: 'square', at: 0.1 + i * 0.15 + rnd(0, 0.05), f, to: [[f * 1.3, 0.04], [f, 0.08]], dur: 0.09, g: 0.06, lp: 4000 }); }
  } },
  wave_rise: { g: 1.6, cap: 2, fn(x) {   // a big wave rises: a swelling roar of water
    x.noise({ dur: 1.3, a: 0.8, g: 0.45, lp: { f: 300, to: [[2200, 1.0]] }, elin: true });
    x.noise({ at: 0.6, dur: 0.7, a: 0.3, g: 0.12, hp: 2500, elin: true });
  } },
});

// ----------------------------------------------------------------------------------------------- engine
function makeNoise(c, seconds) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function curve(fn, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i * 2) / (n - 1) - 1);
  return c;
}
// identity below 0.8, smooth knee to +-0.95 above: a last-resort safety on the master, transparent in normal use
const SOFT_CLIP = curve((x) => { const a = Math.abs(x); return Math.sign(x) * (a < 0.8 ? a : 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2)); });
const DIST = curve((x) => Math.tanh(6 * x) / Math.tanh(6), 1024);

class Player {
  constructor(E, song) {
    this.E = E; this.song = song;
    this.pos = 0; this.next = 0; this.gen = null;
    this.dead = false; this.done = false; this.doneAt = 0; this.onDone = null;
    this.hist = []; this.held = null; this.late = 0;
  }
  start(at, fade) {
    this.next = at;
    this.E.players.add(this);
    if (this.E.paused) { this.held = Math.max(0.03, at - this.E.ctx.currentTime); return; }
    this.gen = this.E.makeGen(this.song, at, fade);
  }
  tick(until) {
    if (this.dead || this.done || this.held != null || !this.gen) return;
    const s = this.song, now = this.E.ctx.currentTime;
    if (!this.E.offline && this.next < now) { this.late++; this.next = now + 0.005; }   // fell behind: re-anchor
    while (this.next < until) {
      if (this.pos >= s.steps) {
        if (s.once) { this.done = true; this.doneAt = this.next; return; }
        this.pos = s.loopStart;
      }
      this.play(this.pos, this.next);
      this.hist.push([this.pos, this.next]);
      if (this.hist.length > 24) this.hist.shift();
      this.pos++;
      this.next += s.sd;
    }
  }
  play(step, t) {
    const E = this.E, s = this.song, ch = this.gen.ch;
    for (const e of s.ev[step]) {
      if (e.ch === 'drums') { DRUM[e.d](E, ch.drums, t, e.vel); continue; }
      const fn = INST[e.inst];
      if (!fn) continue;
      const dur = Math.max(0.03, e.len * s.sd - (e.ch === 'bass' ? 0.015 : 0.02));
      const v = e.notes.length > 1 ? e.vel / Math.sqrt(e.notes.length) : e.vel;
      for (const n of e.notes) fn(E, ch[e.ch], t, dur, mtof(n), v);
    }
  }
  pause(now) {
    if (this.dead || this.held != null) return;
    let pos = this.pos, next = this.next;
    for (let i = this.hist.length - 1; i >= 0; i--) {   // roll back the steps queued but not yet heard
      const [p, t] = this.hist[i];
      if (t >= now) { pos = p; next = t; } else break;
    }
    if (this.done && next <= now) { this.killGen(0.03); this.held = 0.03; return; }
    if (this.done && next > now) this.done = false;
    this.pos = pos; this.held = Math.max(0.03, next - now); this.hist = [];
    this.killGen(0.03);
  }
  resume(now) {
    if (this.dead || this.held == null) return;
    this.next = now + this.held; this.held = null;
    if (this.done) return;
    this.gen = this.E.makeGen(this.song, this.next, 0.05);
  }
  stop(fade) {
    if (this.dead) return;
    this.dead = true; this.onDone = null;
    this.killGen(fade);
    this.E.players.delete(this);
  }
  killGen(fade) {
    const g = this.gen;
    if (!g) return;
    this.gen = null;
    const c = this.E.ctx, now = c.currentTime;
    try {
      const P = g.out.gain;
      P.cancelScheduledValues(now);
      P.setValueAtTime(P.value, now);
      P.linearRampToValueAtTime(0, now + Math.max(0.01, fade));
    } catch (e) { /* ignore */ }
    if (!this.E.offline) setTimeout(() => { for (const n of g.nodes) try { n.disconnect(); } catch (e) { /* ignore */ } }, (fade + 0.4) * 1000);
  }
}

class Engine {
  constructor(ctx, offline = false, raw = false) {
    this.ctx = ctx; this.offline = offline;
    const c = ctx;
    this.noise = makeNoise(c, 2);
    this.dist = DIST;
    this.musicBus = c.createGain(); this.musicBus.gain.value = MUSIC_BASE;
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = SFX_BASE;
    this.duckBus = c.createGain(); this.duckBus.connect(this.musicBus);   // tracks play through this; jingles bypass it
    this.master = c.createGain();
    if (raw) {
      this.musicBus.connect(this.master); this.sfxBus.connect(this.master);
    } else {
      // Gentle limiter: threshold -6 dB, ratio 10.  Web Audio compressors add automatic makeup gain
      // ((1 / fullRangeGain)^0.6 = +2.5 dB for these settings, measured); the trim undoes it so the chain is
      // unity below the threshold and only the peaks get caught.  The soft clipper is a last-resort safety.
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -6; comp.knee.value = 4; comp.ratio.value = 10;
      comp.attack.value = 0.002; comp.release.value = 0.12;
      const trim = c.createGain(); trim.gain.value = COMP_TRIM;
      const clip = c.createWaveShaper(); clip.curve = SOFT_CLIP;
      this.musicBus.connect(comp); this.sfxBus.connect(comp);
      comp.connect(trim); trim.connect(clip); clip.connect(this.master);
      this.comp = comp;
    }
    this.master.connect(c.destination);
    this.players = new Set();
    this.voices = new Map(); this.lastHit = new Map(); this.nVoices = 0;
    this.paused = false; this.cur = null; this.jing = null; this.track = null; this.timer = null;
  }
  startClock() {
    if (this.offline || this.timer) return;
    this.timer = setInterval(() => { try { this.tick(); } catch (e) { report(e); } }, TICK_MS);
  }
  tick() {
    const c = this.ctx;
    if (c.state !== 'running') return;
    const now = c.currentTime, until = now + LOOKAHEAD;
    for (const p of Array.from(this.players)) {
      p.tick(until);
      if (p.done && p.onDone) { const f = p.onDone; p.onDone = null; f(p.doneAt); }
      if (p.done && !p.dead && now > p.doneAt + 4) { p.stop(0.05); if (this.jing === p) this.jing = null; }
    }
  }
  makeGen(song, at, fade) {
    const c = this.ctx;
    const g = { ch: {}, nodes: [] };
    const out = c.createGain();
    const L = song.level || 1;
    out.gain.value = L;
    if (fade > 0) {
      out.gain.setValueAtTime(0, Math.max(0, Math.min(at, c.currentTime)));
      out.gain.setValueAtTime(0.25 * L, at);
      out.gain.linearRampToValueAtTime(L, at + fade);
    }
    out.connect(song.once ? this.musicBus : this.duckBus);
    g.out = out; g.nodes.push(out);
    let echoIn = null;
    if (song.echo) {
      const d = c.createDelay(2); d.delayTime.value = Math.min(1.9, song.echo.steps * song.sd);
      const fb = c.createGain(); fb.gain.value = song.echo.fb;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      const wet = c.createGain(); wet.gain.value = song.echo.wet;
      echoIn = c.createGain();
      echoIn.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet);
      let tail = wet;
      if (c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = -0.2; wet.connect(pn); tail = pn; g.nodes.push(pn); }
      tail.connect(out);
      g.nodes.push(echoIn, d, lp, fb, wet);
    }
    for (const ch of CHANNELS) {
      const gn = c.createGain(); gn.gain.value = song.mix[ch] ?? 0.3;
      let tail = gn;
      if (ch === 'bass') {
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; f.Q.value = 0.8;
        tail.connect(f); tail = f; g.nodes.push(f);
      }
      if (ch === 'choir') {   // parallel vowel formants ("aah") over bright FM voices
        const sum = c.createGain();
        for (const [type, fq, q, lvl] of [['bandpass', 720, 3, 1.6], ['bandpass', 1180, 4, 1.1], ['bandpass', 2600, 5, 0.4], ['lowpass', 400, 0.7, 0.5]]) {
          const bq = c.createBiquadFilter(); bq.type = type; bq.frequency.value = fq; bq.Q.value = q;
          const lg = c.createGain(); lg.gain.value = lvl;
          tail.connect(bq); bq.connect(lg); lg.connect(sum); g.nodes.push(bq, lg);
        }
        tail = sum; g.nodes.push(sum);
      }
      if (song.pan[ch] && c.createStereoPanner) {
        const pn = c.createStereoPanner(); pn.pan.value = song.pan[ch];
        tail.connect(pn); tail = pn; g.nodes.push(pn);
      }
      tail.connect(out);
      if (echoIn && ECHO_SEND[ch]) {
        const sg = c.createGain(); sg.gain.value = ECHO_SEND[ch];
        tail.connect(sg); sg.connect(echoIn); g.nodes.push(sg);
      }
      g.ch[ch] = gn; g.nodes.push(gn);
    }
    return g;
  }
  music(name) {
    if (name === this.track) return;
    const now = this.ctx.currentTime;
    const had = !!this.cur;
    if (this.cur) { this.cur.stop(XFADE); this.cur = null; }
    if (this.jing) {
      this.jing.onDone = null;
      if (name) { this.jing.stop(0.3); this.jing = null; }
      this.setDuck(false, now);
    }
    this.track = name || null;
    if (name) {
      const p = new Player(this, getSong(name));
      p.start(now + 0.06, had ? XFADE : 0);
      this.cur = p;
      p.tick(now + LOOKAHEAD);
    }
  }
  jingle(name, then) {
    const song = getJingle(name);
    const now = this.ctx.currentTime;
    if (this.jing) { this.jing.stop(0.08); this.jing = null; }
    const duck = song.duck && this.cur && !this.cur.dead;   // save / join / portal: music carries on underneath
    if (duck) this.setDuck(true, now);
    else {
      this.setDuck(false, now);
      if (this.cur) { this.cur.stop(0.25); this.cur = null; }
      this.track = null;
    }
    if (then) this.track = then;
    const j = new Player(this, song);
    j.start(now + 0.05, 0);
    this.jing = j;
    j.onDone = (t) => {
      if (this.jing !== j) return;
      if (duck) this.setDuck(false, t);
      if (then && this.track === then && !(this.cur && !this.cur.dead && this.cur.song.key === then)) {
        const had = !!this.cur;
        if (this.cur) this.cur.stop(XFADE);
        const p = new Player(this, getSong(then));
        p.start(t, had ? XFADE : 0);
        this.cur = p;
        p.tick(this.ctx.currentTime + LOOKAHEAD);
      }
    };
    j.tick(now + LOOKAHEAD);
  }
  setDuck(on, t) {
    const P = this.duckBus.gain;
    P.cancelScheduledValues(t);
    P.setTargetAtTime(on ? DUCK : 1, t, on ? 0.04 : 0.2);
  }
  pause(on) {
    on = !!on;
    if (on === this.paused) return;
    this.paused = on;
    const now = this.ctx.currentTime;
    for (const p of this.players) (on ? p.pause(now) : p.resume(now));
    if (on) for (const list of this.voices.values()) for (const v of list) if (!v.ui && v.end > now) this.kill(v, now);
  }
  kill(v, now) { this.stopVoice(v, 0.03, now); }
  stopVoice(v, fade = 0.08, now = this.ctx.currentTime) {
    if (!v || v.killed) return;
    v.killed = true;
    const f = Math.max(0.01, Number(fade) || 0.08);
    try { v.out.gain.cancelScheduledValues(now); v.out.gain.setTargetAtTime(0, now, f / 4); } catch (e) { /* ignore */ }
    for (const s of v.srcs) try { s.stop(now + f + 0.02); } catch (e) { /* ignore */ }
  }
  stopName(name) {
    const l = this.voices.get(name);
    if (l) for (const v of l) this.stopVoice(v, 0.06);
  }
  sfx(name, o) {
    const def = SFX[name];
    if (!def) return null;
    const c = this.ctx;
    const now = c.currentTime;
    const t = o.when != null ? o.when : now + 0.002;
    if (!this.offline) {
      const lh = this.lastHit.get(name);
      if (lh != null && Math.abs(t - lh) < RETRIGGER) return null;   // same sound twice in one instant: merge
      this.lastHit.set(name, t);
    }
    let list = this.voices.get(name);
    if (!list) this.voices.set(name, (list = []));
    let total = 0;
    for (const [, l] of this.voices) {
      for (let i = l.length - 1; i >= 0; i--) if (l[i].end < now || l[i].killed) l.splice(i, 1);
      total += l.length;
    }
    while (list.length >= (def.cap || VOICE_CAP)) { this.kill(list.shift(), now); total--; }
    if (total >= GLOBAL_CAP) {   // steal the oldest non-UI voice anywhere
      let oldest = null, ol = null;
      for (const [, l] of this.voices) for (const v of l) if (!v.ui && (!oldest || v.start < oldest.start)) { oldest = v; ol = l; }
      if (oldest) { this.kill(oldest, now); ol.splice(ol.indexOf(oldest), 1); }
    }
    let p = Math.min(4, Math.max(0.25, Number(o.pitch) || 1));
    if (def.vary && !o.novary) p *= 1 + (Math.random() * 2 - 1) * def.vary;
    const vol = Math.min(2, Math.max(0, o.vol == null ? 1 : Number(o.vol) || 0));
    const pan = Math.min(1, Math.max(-1, Number(o.pan) || 0));
    const out = c.createGain();
    out.gain.value = vol * (def.g ?? 1);
    let pn = null;
    if (pan && c.createStereoPanner) { pn = c.createStereoPanner(); pn.pan.value = pan; out.connect(pn); pn.connect(this.sfxBus); }
    else out.connect(this.sfxBus);
    const fx = new Fx(this, out, t, p);
    if (def.hold && o.hold) fx.hold = o.hold === true ? HOLD_MAX : Math.min(HOLD_MAX, Math.max(0, Number(o.hold) || 0));
    def.fn(fx);
    const v = { out, srcs: fx.srcs, end: fx.end, start: t, ui: UI_SFX.has(name), killed: false };
    list.push(v);
    if (fx.last && !this.offline) {
      fx.last.onended = () => { try { out.disconnect(); if (pn) pn.disconnect(); } catch (e) { /* ignore */ } };
    }
    return v;
  }
  setMuted(m, instant) {
    const P = this.master.gain, now = this.ctx.currentTime;
    if (instant) { P.value = m ? 0 : 1; return; }
    P.cancelScheduledValues(now); P.setTargetAtTime(m ? 0 : 1, now, 0.02);
  }
  setVolumes(v) {
    const now = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(MUSIC_BASE * v.music, now, 0.03);
    this.sfxBus.gain.setTargetAtTime(SFX_BASE * v.sfx, now, 0.03);
  }
}

// ----------------------------------------------------------------------------------------------- public facade
let E = null;
const S = { muted: false, vol: { music: 1, sfx: 1 }, want: null, paused: false, warned: new Set(), autoSusp: false, vis: false };
try { S.muted = globalThis.localStorage?.getItem(LS_KEY) === '1'; } catch (e) { /* storage blocked */ }

function warnOnce(key, msg) {
  if (S.warned.has(key)) return;
  S.warned.add(key);
  try { console.warn('[audio] ' + msg); } catch (e) { /* ignore */ }
}
function report(e) { warnOnce('err:' + (e && e.message), 'internal error: ' + (e && e.message)); }
const clamp01 = (x, d) => { const n = Number(x); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d; };

function hookVisibility() {
  if (S.vis || typeof document === 'undefined') return;
  S.vis = true;
  document.addEventListener('visibilitychange', () => {
    try {
      if (!E) return;
      if (document.hidden) {
        if (E.ctx.state === 'running') { S.autoSusp = true; E.ctx.suspend(); }
      } else if (S.autoSusp) { S.autoSusp = false; E.ctx.resume(); }
    } catch (e) { report(e); }
  });
}

const NOOP = Object.freeze({ stop() {}, playing: false });
function handle(v) {
  return {
    stop(fade) { try { if (E) E.stopVoice(v, fade); } catch (e) { report(e); } },
    get playing() { try { return !!E && !v.killed && v.end > E.ctx.currentTime; } catch (e) { return false; } },
  };
}

export const audio = {
  unlock() {
    try {
      if (typeof window === 'undefined') return Promise.resolve(false);
      if (!E) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return Promise.resolve(false);
        let ctx;
        try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
        E = new Engine(ctx, false);
        E.setMuted(S.muted, true);
        E.musicBus.gain.value = MUSIC_BASE * S.vol.music;
        E.sfxBus.gain.value = SFX_BASE * S.vol.sfx;
        for (const k of Object.keys(SONGS)) getSong(k);
        for (const k of Object.keys(JINGLES)) getJingle(k);
        if (S.paused) E.pause(true);
        E.startClock();
        hookVisibility();
        if (S.want) E.music(S.want);
      }
      const ctx = E.ctx;
      if (ctx.state !== 'running') {
        try {   // iOS: a silent buffer started inside the gesture unlocks output
          const b = ctx.createBuffer(1, 1, ctx.sampleRate);
          const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
        } catch (e) { /* ignore */ }
        S.autoSusp = false;
        const p = ctx.resume();
        return Promise.resolve(p).then(() => ctx.state === 'running', () => false);
      }
      return Promise.resolve(true);
    } catch (e) { report(e); return Promise.resolve(false); }
  },

  sfx(name, opts) {
    try {
      if (!SFX[name]) { warnOnce('sfx:' + name, `unknown sfx "${name}"`); return NOOP; }
      if (!E || E.ctx.state !== 'running') return NOOP;
      const v = E.sfx(name, opts || {});
      return v ? handle(v) : NOOP;
    } catch (e) { report(e); return NOOP; }
  },

  stopSfx(name) {
    try { if (E) E.stopName(name); } catch (e) { report(e); }
  },

  music(name) {
    try {
      name = name || null;
      if (name && !SONGS[name]) { warnOnce('music:' + name, `unknown music "${name}"`); return; }
      S.want = name;
      if (E) E.music(name);
    } catch (e) { report(e); }
  },

  jingle(name, opts) {
    try {
      const then = (opts && opts.then) || null;
      if (then && !SONGS[then]) { warnOnce('music:' + then, `unknown music "${then}"`); }
      const thenOk = then && SONGS[then] ? then : null;
      if (!JINGLES[name]) {
        warnOnce('jingle:' + name, `unknown jingle "${name}"`);
        if (thenOk) audio.music(thenOk);
        return;
      }
      S.want = thenOk;
      if (E) E.jingle(name, thenOk);
    } catch (e) { report(e); }
  },

  setMuted(b) {
    try {
      S.muted = !!b;
      try { globalThis.localStorage?.setItem(LS_KEY, S.muted ? '1' : '0'); } catch (e) { /* storage blocked */ }
      if (E) E.setMuted(S.muted);
    } catch (e) { report(e); }
  },
  get muted() { return S.muted; },

  setVolumes(v) {
    try {
      if (!v || typeof v !== 'object') return;
      if (v.music != null) S.vol.music = clamp01(v.music, S.vol.music);
      if (v.sfx != null) S.vol.sfx = clamp01(v.sfx, S.vol.sfx);
      if (E) E.setVolumes(S.vol);
    } catch (e) { report(e); }
  },

  get ready() {
    try { return !!(E && E.ctx.state === 'running'); } catch (e) { return false; }
  },

  pauseAll(b) {
    try {
      S.paused = !!b;
      if (E) E.pause(S.paused);
    } catch (e) { report(e); }
  },

  // ---- test / tooling hooks -----------------------------------------------------------------------
  // Render one sfx / jingle / music track through the same graph into an AudioBuffer (OfflineAudioContext).
  // opts: { raw: true } skips the compressor/limiter; { pitch, vol, pan, novary } for sfx; { sampleRate }.
  async _renderOffline(kind, name, seconds, opts = {}) {
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OAC) throw new Error('OfflineAudioContext unavailable');
    const sr = opts.sampleRate || 44100;
    let song = null;
    if (kind === 'music') song = getSong(name);
    else if (kind === 'jingle') song = getJingle(name);
    else if (kind !== 'sfx' || !SFX[name]) throw new Error(`unknown ${kind} "${name}"`);
    if (kind !== 'sfx' && !song) throw new Error(`unknown ${kind} "${name}"`);
    if (!seconds) seconds = kind === 'sfx' ? 2.5 : song.steps * song.sd + (song.once ? 2 : 0);
    // A fresh DynamicsCompressor starts fully gain-reduced and releases over ~0.2 s; in the game it has long
    // settled, so render after a pre-roll and trim it off.
    const pre = opts.raw ? 0 : 0.5;
    const off = new OAC(2, Math.ceil(sr * (seconds + pre)), sr);
    const e = new Engine(off, true, !!opts.raw);
    e.setVolumes({ music: opts.music ?? 1, sfx: opts.sfx ?? 1 });
    const t0 = pre + 0.01;
    if (kind === 'sfx') e.sfx(name, { ...opts, when: t0 });
    else {
      const p = new Player(e, song);
      if (opts.fromBar) p.pos = Math.min(song.steps - 1, opts.fromBar * 16);
      p.start(t0, 0);
      p.tick(t0 + seconds);
    }
    const full = await off.startRendering();
    if (!pre) return full;
    const skip = Math.round(pre * sr), len = full.length - skip;
    const buf = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: full.numberOfChannels });
    for (let ch = 0; ch < full.numberOfChannels; ch++) buf.copyToChannel(full.getChannelData(ch).subarray(skip), ch);
    return buf;
  },
  _info(detail = false) {
    const songs = {}, jingles = {};
    for (const k of Object.keys(SONGS)) {
      const s = getSong(k);
      songs[k] = {
        bpm: s.bpm, spb: s.spb, steps: s.steps, loopStart: s.loopStart, introBars: s.loopStart / s.spb, loopBars: (s.steps - s.loopStart) / s.spb,
        barSec: s.spb * s.sd, introSec: s.loopStart * s.sd, loopSec: (s.steps - s.loopStart) * s.sd, errs: s.errs,
        ...(detail ? { lint: s.lint.map((l) => ({ ...l, chord: l.chord.sym, name: noteName(l.note), ct: l.chord.pcs.has(mod12(l.note)) })) } : {}),
      };
    }
    for (const k of Object.keys(JINGLES)) {
      const s = getJingle(k);
      jingles[k] = { bpm: s.bpm, spb: s.spb, steps: s.steps, sec: s.steps * s.sd, duck: s.duck, errs: s.errs,
        ...(detail ? { lint: s.lint.map((l) => ({ ...l, chord: l.chord.sym, name: noteName(l.note), ct: l.chord.pcs.has(mod12(l.note)) })) } : {}) };
    }
    return { songs, jingles, sfx: Object.keys(SFX), errors: compileErrors.slice() };
  },
  _debug() {
    if (!E) return { unlocked: false, state: null, track: S.want, paused: S.paused };
    let voices = 0;
    const byName = {};
    for (const [n, l] of E.voices) for (const v of l) if (!v.killed && v.end > E.ctx.currentTime) { voices++; byName[n] = (byName[n] || 0) + 1; }
    const ps = Array.from(E.players);
    return {
      unlocked: true, state: E.ctx.state, time: E.ctx.currentTime, track: E.track, paused: E.paused, voices, byName,
      players: ps.length, live: ps.filter((p) => p.gen && !p.done).map((p) => ({ key: p.song.key, pos: p.pos, late: p.late })),
      jingle: E.jing ? E.jing.song.key : null, duck: E.duckBus.gain.value,
    };
  },
};

// ================================================================================================= Book 2: ambient beds
// audio.ambience(name | null, { ttl })   a quiet looping bed under the music (room tone: waves, rain, frogs, drips ...).
//   Same name again = no-op (cheap to call every frame).  A change crossfades (1.2 s); null fades out.  With { ttl: s } the bed
//   fades out by itself when it is not called again within ttl seconds (call it from the world's step: stories, menus and the
//   pause then silence it with no extra hook).  It plays through the sfx bus (sfx volume, mute, the limiter) and goes quiet
//   while audio.pauseAll(true) is on.  Books 1 and 3 never call it: nothing here runs until the first call.
// A bed = a few continuous layers (a long looping noise buffer or a sine, filtered, with slow incommensurate LFO swells, so the
// loop never sounds periodic) + grains (short recipes in the sfx toolkit, scattered in time and across three stereo positions).
// Cost: one 150 ms timer while a bed is on; ~20-35 live nodes per bed, plus a grain every second or so.
const AMB_LEVEL = 0.5;         // a bed's level into the sfx bus (calibrated: ~17 dB under the music, see the measurements)
const AMB_FADE = 1.2;          // crossfade / fade-out, seconds
const AMB_AHEAD = 0.6;         // grains scheduled this far ahead
const AMB_TICK = 150;          // scheduler interval, ms
// a random gap in [lo, hi], skewed short (uniform gaps sound metronomic; this gives runs and the odd long hush)
const ambRnd = (a) => a[0] + (a[1] - a[0]) * Math.pow(Math.random(), 1.6);

// ---- grains (Fx recipes, like the sfx above; levels are tiny on purpose)
const AG = {
  creak(x) {   // ship's timbers
    const f = rnd(105, 165), d = rnd(0.35, 0.8);
    x.tone({ type: 'sawtooth', f, to: [[f * rnd(1.08, 1.3), d]], dur: d, a: 0.1, g: 0.09, bp: { f: rnd(600, 1000), q: 5 }, rasp: [0.1, 0.02] });
  },
  shipBell(x) {   // a distant ship's bell (tuned to D, the shanty's key), rung in a pair
    for (const at of [0, 0.42]) x.tone({ at, f: 587, dur: 2.2, a: 0.004, g: 0.035, fm: { r: 2.76, i0: 2.2, i1: 0.3, id: 0.2 }, lp: 2400 });
  },
  rigging(x) { const f = rnd(800, 1000); x.tone({ type: 'triangle', f, to: [[f * 1.25, 0.25]], dur: 0.3, a: 0.05, g: 0.03, lp: 2000 }); },
  chain(x) {   // a chain: a short rattle and two or three links ringing
    x.noise({ dur: 0.1, a: 0.005, g: 0.02, bp: { f: 3000, q: 2 }, am: [60, 0.5, 'square'] });
    for (let i = 0, n = 2 + (Math.random() * 2 | 0); i < n; i++) x.tone({ at: i * rnd(0.05, 0.11), f: rnd(1700, 2500), dur: 0.12, g: 0.018, fm: { r: 1.41, i0: 3, i1: 0.3, id: 0.03 } });
  },
  thunder(x) {   // far off: a low roll, with a body small speakers can carry
    const d = rnd(2.2, 3.4), am = [rnd(2.5, 4), 0.5];
    x.noise({ dur: d, a: 0.5, g: 0.16, lp: rnd(110, 180), am });
    x.noise({ dur: d * 0.8, a: 0.45, g: 0.045, bp: { f: rnd(250, 400), q: 0.8 }, am });
  },
  rainDrops(x) { for (let i = 0; i < 4; i++) x.noise({ at: rnd(0, 0.5), dur: 0.02, g: rnd(0.02, 0.05), bp: { f: rnd(2000, 4200), q: 2 } }); },
  lavaBlorp(x) { for (let i = 0, n = 1 + (Math.random() * 3 | 0); i < n; i++) x.tone({ at: i * rnd(0.08, 0.16), f: rnd(130, 180), to: [[rnd(320, 460), 0.05], [150, 0.15]], dur: 0.16, g: 0.07, fm: { r: 1, i0: 1.2, i1: 0.3, id: 0.05 } }); },
  steam(x) { x.noise({ dur: rnd(0.7, 1.3), a: 0.25, g: 0.025, hp: 2800, lp: 7000 }); },
  pebble(x) { for (let i = 0, n = 1 + (Math.random() * 3 | 0); i < n; i++) x.noise({ at: i * rnd(0.06, 0.14), dur: 0.02, g: 0.06, bp: { f: rnd(1400, 2600), q: 3 } }); },
  frog(x) {   // "rib-bit", sometimes a deeper one
    const f = Math.random() < 0.3 ? rnd(120, 150) : rnd(190, 240);
    for (const at of [0, 0.11]) x.tone({ at, f: at ? f * 0.92 : f, dur: 0.08, a: 0.005, g: 0.05, fm: { r: 1, i0: 4, i1: 1.5, id: 0.03 }, lp: 1800 });
  },
  cricket(x) { x.tone({ f: rnd(3400, 4100), dur: rnd(0.18, 0.32), a: 0.01, g: 0.02, am: [rnd(26, 36), 0.5, 'square'] }); },
  drip(x) { const f = rnd(900, 1400); x.tone({ f, to: [[f * 2.2, 0.03]], dur: 0.05, g: 0.06 }); },
  dripEcho(x) {   // a drip in a stone cell, with its echo
    const f = rnd(900, 1400);
    for (const [at, g] of [[0, 0.06], [0.19, 0.022], [0.38, 0.009]]) x.tone({ at, f, to: [[f * 2.2, 0.03]], dur: 0.05, g });
  },
  farSnore(x) {
    x.noise({ dur: 0.85, a: 0.6, g: 0.05, bp: { f: 320, q: 4, to: [[580, 0.8]] }, am: [26, 0.5], elin: true, lp: 900 });
    x.tone({ at: 0.95, f: 900, to: [[600, 0.4]], dur: 0.45, a: 0.05, g: 0.006 });
  },
  sparkle(x) { for (let i = 0; i < 3; i++) x.bell(i * rnd(0.07, 0.14), rnd(1800, 3200), 0.6, 0.035, 2.76); },
  gull(x) {   // "kee-ow", once or twice, far off
    for (let i = 0, n = 1 + (Math.random() * 2 | 0); i < n; i++) {
      const f = rnd(1400, 1700);
      x.tone({ at: i * rnd(0.4, 0.6), f, to: [[f * 1.45, 0.1], [f * 0.9, 0.34]], dur: 0.36, a: 0.02, g: 0.02, vib: [11, 0.02], fm: { r: 2, i0: 0.6, i1: 0.3 }, lp: 3500 });
    }
  },
  gust(x) { const d = rnd(2, 3.5); x.noise({ dur: d, a: d * 0.45, g: 0.05, bp: { f: rnd(450, 650), q: 5, to: [[rnd(750, 1000), d * 0.5], [rnd(450, 600), d]] } }); },
};

// ---- beds.  layer: noise (hp / bp / lp, q, rate) or tone { f, type }; g; am: [[rate Hz, depth 0..1], ...]; sweep: [rate, +-Hz]
const AMB_BEDS = {
  gull_cabin: { g: 0.78, layers: [   // below deck: muffled waves on the hull, timbers, a lantern chain
    { lp: 360, g: 0.5, am: [[0.09, 0.5], [0.037, 0.3]] },
    { bp: 800, q: 0.6, g: 0.05, am: [[0.09, 0.7], [0.053, 0.3]], rate: 0.97 },
  ], grains: [{ every: [3.5, 8], fn: AG.creak }, { every: [6, 12], fn: AG.chain }] },
  gull_deck: { g: 0.6, layers: [   // the night deck: waves on the hull, a sea breeze, creaks, rigging, a distant bell
    { lp: 500, g: 0.55, am: [[0.1, 0.5], [0.041, 0.3]] },
    { bp: 1400, q: 0.5, g: 0.07, am: [[0.1, 0.7], [0.061, 0.3]], rate: 1.03 },
    { bp: 600, q: 1.5, g: 0.04, sweep: [0.06, 150], am: [[0.05, 0.6]], rate: 0.95 },
  ], grains: [{ every: [3, 8], fn: AG.creak }, { every: [12, 22], fn: AG.shipBell }, { every: [5, 10], fn: AG.rigging }] },
  storm_deck: { g: 0.55, layers: [   // the Kraken's storm: steady rain, heavy waves, wind gusting, thunder far off
    { hp: 1800, lp: 5000, g: 0.045, am: [[0.21, 0.25]] },
    { lp: 450, g: 0.6, am: [[0.13, 0.6], [0.05, 0.3]], rate: 0.98 },
    { bp: 500, q: 1.2, g: 0.1, sweep: [0.07, 250], am: [[0.08, 0.7], [0.031, 0.4]], rate: 1.04 },
  ], grains: [{ every: [7, 15], fn: AG.thunder }, { every: [3, 6], fn: AG.creak }, { every: [0.5, 1.2], fn: AG.rainDrops }] },
  cave: { g: 0.6, layers: [   // the Cave of Rage: a lava rumble (with a body above 150 Hz, for small speakers), bubbling, steam, pebbles
    { lp: 110, g: 0.3, am: [[0.07, 0.4], [0.029, 0.3]] },
    { bp: 220, q: 0.8, g: 0.5, am: [[0.07, 0.5], [0.041, 0.3]], rate: 0.97 },
    { bp: 700, q: 0.7, g: 0.05, am: [[0.11, 0.6]], rate: 0.96 },
  ], grains: [{ every: [0.8, 2.2], fn: AG.lavaBlorp }, { every: [5, 10], fn: AG.steam }, { every: [3, 7], fn: AG.pebble }] },
  swamp: { g: 1.22, layers: [   // the Swamp of Despair: a damp hush, insects humming, frogs, drips
    { lp: 300, g: 0.3, am: [[0.06, 0.5], [0.023, 0.3]] },
    { bp: 4300, q: 3, g: 0.035, am: [[37, 0.9], [0.19, 0.6]], rate: 1.02 },
  ], grains: [{ every: [2.5, 7], fn: AG.frog }, { every: [3, 9], fn: AG.drip }, { every: [0.6, 1.8], fn: AG.cricket }] },
  cell: { g: 1.12, layers: [   // the Cell of Sloth: stone-room hush, drips echoing, chains, someone snoring far away
    { lp: 220, g: 0.3, am: [[0.05, 0.3]] },
    { bp: 700, q: 0.8, g: 0.02, am: [[0.08, 0.8], [0.033, 0.4]], rate: 0.97 },
  ], grains: [{ every: [3, 9], fn: AG.dripEcho }, { every: [5, 11], fn: AG.chain }, { every: [9, 16], fn: AG.farSnore }] },
  palace: { g: 0.6, layers: [   // the Skull Palace: a low magic hum on G and D (the waltz's key), wind at the windows, sparkles, thunder
    { tone: { f: 98 }, g: 0.1, am: [[0.3, 0.4], [0.07, 0.3]] },
    { tone: { f: 147 }, g: 0.05, am: [[0.23, 0.5]] },
    { tone: { f: 196.8 }, g: 0.025, am: [[0.17, 0.6]] },
    { bp: 650, q: 4, g: 0.4, sweep: [0.05, 120], am: [[0.07, 0.7], [0.029, 0.5]] },
    { bp: 3000, q: 4, g: 0.005, am: [[0.13, 0.8]], rate: 1.05 },
  ], grains: [{ every: [6, 12], fn: AG.sparkle }, { every: [10, 20], fn: AG.thunder }] },
  map: { g: 0.5, layers: [   // the island map: gentle surf, foam, a breeze, gulls
    { lp: 700, g: 0.45, am: [[0.08, 0.7], [0.033, 0.3]] },
    { hp: 1500, lp: 6000, g: 0.05, am: [[0.08, 0.8], [0.047, 0.3]], rate: 1.03 },
    { bp: 500, q: 1, g: 0.03, am: [[0.05, 0.6]], rate: 0.96 },
  ], grains: [{ every: [4, 9], fn: AG.gull }, { every: [8, 16], fn: AG.gust }] },
};

function ambNoise(E) {   // one long noise buffer per engine (6.3 s: long enough that a filtered loop never sounds like a loop)
  if (!E.ambNoise) E.ambNoise = makeNoise(E.ctx, 6.3);
  return E.ambNoise;
}
// a bed: layers -> pg (pause / mute) -> fin (fade-in) -> out (level, fade-out) -> the sfx bus; grains -> one of three panned gains -> pg
class AmbBed {
  constructor(E, name, now) {
    const c = E.ctx, def = AMB_BEDS[name];
    this.E = E; this.name = name; this.def = def; this.nodes = []; this.srcs = []; this.lfos = []; this.stopAt = null; this.isPaused = false;
    this.level = AMB_LEVEL * (def.g || 1); this.driftAt = now + 15 + Math.random() * 10;
    this.out = c.createGain(); this.out.gain.value = this.level; this.out.connect(E.sfxBus);   // (the level; stop() fades it)
    this.fin = c.createGain(); this.fin.gain.setValueAtTime(0, now); this.fin.gain.linearRampToValueAtTime(1, now + AMB_FADE); this.fin.connect(this.out);   // (the fade-in, on its own node)
    this.pg = c.createGain(); this.pg.connect(this.fin);   // (pause / mute)
    this.nodes.push(this.out, this.fin, this.pg);
    this.pans = [-0.55, 0, 0.55].map((p) => {
      const g = c.createGain(); this.nodes.push(g);
      if (p && c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = p; g.connect(pn); pn.connect(this.pg); this.nodes.push(pn); } else g.connect(this.pg);
      return g;
    });
    for (const L of def.layers) this.layer(L, now);
    this.next = def.grains.map((G) => now + 0.3 + Math.random() * G.every[1]);
  }
  layer(L, t) {
    const c = this.E.ctx;
    let src;
    if (L.tone) { src = c.createOscillator(); src.type = L.tone.type || 'sine'; src.frequency.value = L.tone.f; src.start(t); }
    else { src = c.createBufferSource(); src.buffer = ambNoise(this.E); src.loop = true; src.playbackRate.value = L.rate || 1; src.start(t, Math.random() * 6); }
    this.srcs.push(src); this.nodes.push(src);
    let n = src, swept = false;
    for (const [type, f] of [['highpass', L.hp], ['bandpass', L.bp], ['lowpass', L.lp]]) {
      if (!f) continue;
      const bq = c.createBiquadFilter(); bq.type = type; bq.frequency.value = f; bq.Q.value = L.q ?? (type === 'bandpass' ? 1 : 0.707);
      if (L.sweep && !swept && type !== 'highpass') { swept = true; this.lfo(L.sweep[0], L.sweep[1], bq.frequency, t); }
      n.connect(bq); n = bq; this.nodes.push(bq);
    }
    const g = c.createGain();
    const depth = (L.am || []).reduce((s, [, d]) => s + d, 0), k = depth > 1 ? 1 / depth : 1;   // (the swells never take the gain below zero)
    g.gain.value = L.g * (1 - (depth * k) / 2);
    for (const [rate, d] of L.am || []) this.lfo(rate, (L.g * d * k) / 2, g.gain, t);
    n.connect(g); g.connect(this.pg); this.nodes.push(g);
  }
  lfo(rate, amount, param, t) {   // a sine LFO at a random phase (so beds never open on the same swell); its rate drifts (tick)
    const c = this.E.ctx, o = c.createOscillator(), lg = c.createGain(), base = rate * (0.9 + Math.random() * 0.2);
    if (c.createPeriodicWave) {
      const ph = Math.random() * 2 * Math.PI;
      o.setPeriodicWave(c.createPeriodicWave(new Float32Array([0, Math.sin(ph)]), new Float32Array([0, Math.cos(ph)]), { disableNormalization: true }));
    }
    o.frequency.value = base; lg.gain.value = amount;
    o.connect(lg); lg.connect(param); o.start(t);
    this.srcs.push(o); this.nodes.push(o, lg); this.lfos.push([o, base]);
  }
  tick(now, paused) {
    if (this.stopAt != null) return;
    if (paused !== this.isPaused) {
      this.isPaused = paused;
      const P = this.pg.gain; P.cancelScheduledValues(now);
      P.setTargetAtTime(paused ? 0 : 1, now, paused ? 0.03 : 0.3);
      if (!paused) this.next = this.def.grains.map((G, i) => Math.max(this.next[i], now + 0.5 + Math.random() * G.every[1]));   // (spread out: no pile of grains on resume)
    }
    if (paused) return;
    if (now > this.driftAt) {   // every 15-25 s each LFO eases to a new rate within +-20 %: the swells never settle into a period
      this.driftAt = now + 15 + Math.random() * 10;
      for (const [o, base] of this.lfos) o.frequency.setTargetAtTime(base * (0.8 + Math.random() * 0.4), now, 6);
    }
    const until = now + AMB_AHEAD;
    this.def.grains.forEach((G, i) => {
      while (this.next[i] < until) {
        const t = Math.max(this.next[i], now + 0.02);
        G.fn(new Fx(this.E, this.pans[(Math.random() * 3) | 0], t, 1 + (Math.random() * 2 - 1) * 0.06));
        this.next[i] = t + ambRnd(G.every);
      }
    });
  }
  stop(now, fade = AMB_FADE) {
    if (this.stopAt != null) return;
    this.stopAt = now + fade;
    const P = this.out.gain; P.cancelScheduledValues(now); P.setValueAtTime(this.level, now); P.linearRampToValueAtTime(0, now + fade);   // (never reads .value: the fade-in is on its own node)
    for (const s of this.srcs) try { s.stop(now + fade + 0.05); } catch (e) { /* ignore */ }
    if (!this.E.offline) setTimeout(() => { for (const n of this.nodes) try { n.disconnect(); } catch (e) { /* ignore */ } }, (fade + 0.4) * 1000);
  }
  done(now) { return this.stopAt != null && now > this.stopAt + 0.1; }
}
const AMB = { want: null, ttl: 0, seen: 0, cur: null, old: [], timer: null, last: 0, ticks: 0, cost: 0, worst: 0 };
function ambTick() {
  const t0 = performance.now();
  try {
    // (a main-thread hitch -- a stage loading -- is not the caller going away: the gap does not count against the ttl)
    if (AMB.last && t0 - AMB.last > 400) AMB.seen += t0 - AMB.last - AMB_TICK;
    AMB.last = t0;
    if (!E || E.ctx.state !== 'running') {   // (no audio yet, none on this page, or the tab is hidden: wait; nothing wanted any more: stop the timer)
      if (!AMB.want && !AMB.cur && !AMB.old.length && AMB.timer) { clearInterval(AMB.timer); AMB.timer = null; AMB.last = 0; }
      return;
    }
    const now = E.ctx.currentTime;
    let want = AMB.want;
    if (want && AMB.ttl && t0 - AMB.seen > AMB.ttl * 1000) want = null;
    if (AMB.cur && AMB.cur.name !== want) { AMB.cur.stop(now); AMB.old.push(AMB.cur); AMB.cur = null; }
    if (!AMB.cur && want) AMB.cur = new AmbBed(E, want, now);
    if (AMB.cur) AMB.cur.tick(now, !!E.paused || S.muted || S.vol.sfx <= 0);   // (paused, muted or the sfx at 0: quiet, and no grains made)
    if (AMB.old.length) AMB.old = AMB.old.filter((b) => !b.done(now));
    if (!AMB.cur && !AMB.old.length && !want && AMB.timer) { clearInterval(AMB.timer); AMB.timer = null; AMB.last = 0; }
  } catch (e) { report(e); }
  const dt = performance.now() - t0; AMB.ticks++; AMB.cost += dt; if (dt > AMB.worst) AMB.worst = dt;   // (the scheduler's own cost: audio._ambInfo())
}

audio.ambience = function ambience(name, opts) {
  try {
    name = name || null;
    if (name && !AMB_BEDS[name]) { warnOnce('amb:' + name, `unknown ambience "${name}"`); name = null; }
    AMB.want = name; AMB.ttl = Math.max(0, Number(opts && opts.ttl) || 0); AMB.seen = performance.now();
    if (name && !AMB.timer && typeof setInterval !== 'undefined') AMB.timer = setInterval(ambTick, AMB_TICK);
  } catch (e) { report(e); }
};
// test hook: render one bed (seconds, through the master chain unless { raw: true }) into an AudioBuffer
audio._renderAmbience = async function _renderAmbience(name, seconds = 20, opts = {}) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) throw new Error('OfflineAudioContext unavailable');
  if (!AMB_BEDS[name]) throw new Error(`unknown ambience "${name}"`);
  const sr = opts.sampleRate || 44100, pre = opts.raw ? 0 : 0.5;
  const off = new OAC(2, Math.ceil(sr * (seconds + pre)), sr);
  const e = new Engine(off, true, !!opts.raw);
  e.setVolumes({ music: 1, sfx: opts.sfx ?? 1 });
  const bed = new AmbBed(e, name, pre);
  for (let t = pre; t < pre + seconds; t += AMB_TICK / 1000) bed.tick(t, false);
  const full = await off.startRendering();
  if (!pre) return full;
  const skip = Math.round(pre * sr), buf = new AudioBuffer({ length: full.length - skip, sampleRate: sr, numberOfChannels: full.numberOfChannels });
  for (let ch = 0; ch < full.numberOfChannels; ch++) buf.copyToChannel(full.getChannelData(ch).subarray(skip), ch);
  return buf;
};
audio._ambInfo = () => ({ beds: Object.keys(AMB_BEDS), want: AMB.want, on: AMB.cur ? AMB.cur.name : null, nodes: AMB.cur ? AMB.cur.nodes.length : 0, paused: AMB.cur ? AMB.cur.isPaused : null, timer: !!AMB.timer, ticks: AMB.ticks, msPerTick: AMB.ticks ? +(AMB.cost / AMB.ticks).toFixed(3) : 0, worstMs: +AMB.worst.toFixed(3) });

export default audio;
