// Dodongo's Quest input: the keyboard (whole, or split in two for co-op), up to four gamepads
// (DualSense, DualShock 4, Xbox, Switch Pro, generic) and the touch overlay. Every device is a
// Controller carrying the same game actions, sampled once per fixed 60 Hz tick.
//
//   const input = new InputManager();
//   input.bindTouch(document.getElementById('touch'));
//   every tick:  input.update();
//                const c = input.get('pad0');  c.held.left  c.pressed.attack  c.runTap  c.stick.x
//   join/menus:  const who = input.anyPressed('start', { exclude: ['pad0'] });   // Controller | null
//   prompts:     input.drawGlyph(ctx, 'jump', who.id, x, y, 28);   input.glyph('jump', 'kb').text → 'K'
//   feedback:    input.rumble('pad0', 'heavy');  input.rumble('pad0', { strong: 1, weak: 0.5, ms: 300 });
//
// Controller ids: 'kb' (whole keyboard, single player), 'kb1' / 'kb2' (left / right half, only while
// setSplitKeyboard(true); 'kb' is then silent), 'touch', 'pad0'..'pad3' (= gamepad.index, stable while
// the pad stays connected).
//
// Rules every controller follows:
//   held.X     the action is down this tick.
//   pressed.X  it went down since the previous tick. Edges are latched from DOM events, so a key that
//              goes down and up between two ticks still counts once. Key repeat never presses.
//   runTap     -1 / +1 on the tick a direction is tapped twice within 20 ticks (start running), else 0.
//   dodge      O / B (kb), R (kb1), , / Num 6 (kb2), any shoulder or trigger on a pad (L1 R1 L2 R2), the DODGE touch button.
//   run        Shift, a double tap, or the stick or touch joystick held at full tilt (mostly
//              sideways) for 12 ticks.
//   clear()    drops every held button; a button still physically down is ignored until let go, so a
//              held key never "presses" again in the next scene. Directions keep walking (no new edge).
//
// `Input` (end of file) is the old single-player API, merging every controller into one.

export const ACTIONS = ['left', 'right', 'up', 'down', 'attack', 'jump', 'special', 'shoot', 'dodge', 'run', 'start', 'confirm', 'back'];
const DIRS = ['left', 'right', 'up', 'down'];
const IS_DIR = { left: true, right: true, up: true, down: true };

export const TUNING = {
  runTapTicks: 20,     // second tap of a direction within this many ticks = runTap
  deadzone: 0.35,      // left stick: a direction switches on past this...
  deadzoneOff: 0.28,   // ...and off below this (hysteresis: no chatter, no phantom presses at the edge)
  fullTilt: 0.92,      // stick / touch joystick magnitude that counts as fully tilted
  fullTiltTicks: 12,   // ...held this long, within ~35 degrees of horizontal, = run
  triggerOn: 0.3,      // analog L2 / R2 travel that counts as pressed
};

// ------------------------------------------------------------------------------------------ keyboard
// Physical keys (KeyboardEvent.code, so WASD stays WASD on AZERTY). The first key of each list is the
// one prompts show.
export const KEYMAPS = {
  // single player: the whole keyboard
  kb: {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    attack: ['KeyJ', 'KeyZ'], jump: ['KeyK', 'KeyX', 'Space'], special: ['KeyL', 'KeyC'], shoot: ['KeyI', 'KeyV'],
    dodge: ['KeyO', 'KeyB'], run: ['ShiftLeft', 'ShiftRight'],
    start: ['Enter', 'Escape', 'KeyP', 'NumpadEnter'],
    confirm: ['Enter', 'Space', 'KeyJ', 'KeyZ', 'NumpadEnter'],
    back: ['Escape', 'Backspace'],
  },
  // co-op, left player: WASD + F G H T (Q is left free: too easy to hit by accident next to W/A)
  kb1: {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    attack: ['KeyF'], jump: ['KeyG'], shoot: ['KeyH'], special: ['KeyT'], dodge: ['KeyR'], run: ['ShiftLeft'],
    start: ['Tab', 'Escape'], confirm: ['KeyF', 'KeyG'], back: ['Escape'],
  },
  // co-op, right player: arrows + . / ; '  (or the numpad)
  kb2: {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    attack: ['Period', 'Numpad1'], jump: ['Slash', 'Numpad2'], special: ['Quote', 'Numpad3'], shoot: ['Semicolon', 'Numpad5'],
    dodge: ['Comma', 'Numpad6'], run: ['ShiftRight', 'Numpad0'],
    start: ['Enter', 'NumpadEnter'], confirm: ['Period', 'Enter', 'NumpadEnter', 'Numpad1'], back: ['Backspace'],
  },
};
const KEY_LABEL = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter',
  Escape: 'Esc', Backspace: 'Bksp', Tab: 'Tab', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
  Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Comma: ',',   // (a keycap: "[.]" -- '. DOT' read oddly in prompts)
};
const ARROW_OF = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
// some virtual keyboards send code ''; fall back to key
const KEY_FALLBACK = {
  ' ': 'Space', Spacebar: 'Space', Enter: 'Enter', Escape: 'Escape', Esc: 'Escape', Backspace: 'Backspace', Tab: 'Tab',
  ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
  Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown', Shift: 'ShiftLeft',
  '.': 'Period', '/': 'Slash', ';': 'Semicolon', "'": 'Quote', ',': 'Comma',
};
const ALL_CODES = new Set(Object.values(KEYMAPS).flatMap((m) => Object.values(m).flat()));

function codeOf(e) {
  if (e.code) return e.code;
  const k = e.key || '';
  if (KEY_FALLBACK[k]) return KEY_FALLBACK[k];
  return /^[a-z]$/i.test(k) ? 'Key' + k.toUpperCase() : '';
}
const NON_TEXT_INPUT = /^(checkbox|radio|button|range|submit|reset|color|file|image)$/i;
function isEditable(t) {
  if (!t || !t.tagName) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  return t.tagName === 'INPUT' && !NON_TEXT_INPUT.test(t.type || 'text');
}

// ------------------------------------------------------------------------------------------ gamepads
// Standard Gamepad layout (w3c.github.io/gamepad/#remapping), positional:
//   0 bottom (✕ / A)  1 right (○ / B)  2 left (□ / X)  3 top (△ / Y)  4 L1  5 R1  6 L2  7 R2
//   8 Create/Share/View  9 Options/Menu  10 L3  11 R3  12 up  13 down  14 left  15 right  16 PS/Home  17 touchpad
// Game actions sit on positions, so Xbox X/A/Y/B and Switch Y/B/X/A land where □ ✕ △ ○ are.
const PAD_FACE = { attack: 2, jump: 0, shoot: 3, special: 1, confirm: 0, back: 1 };
const PAD_FACE_NINTENDO = { ...PAD_FACE, confirm: 1, back: 0 };   // Nintendo menus: A (right) = OK, B (bottom) = back
// Sony pads with mapping !== 'standard' (raw HID order: unmapped HID, older Firefox, some Linux / Safari setups):
//   0 □  1 ✕  2 ○  3 △  4 L1  5 R1  6 L2  7 R2  8 Create  9 Options  10 L3  11 R3  12 PS  13 touchpad
// with the d-pad as a hat-switch axis (usually axes[9]).  raw index → standard index:
const SONY_RAW_TO_STD = [2, 0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17];
const HAT_UP = 1, HAT_RIGHT = 2, HAT_DOWN = 4, HAT_LEFT = 8;

// Hat switch as one axis: -1 = up, then clockwise in steps of 2/7 to 1 = up-left; released reads > 1
// (≈ 1.2857) and some drivers report 0 until the first event. Same ranges as Chromium / Firefox use.
function hatDirs(v) {
  if (!Number.isFinite(v) || v === 0 || v < -1.01 || v > 1.01) return 0;
  return ((v < -0.7 || v >= 0.95) ? HAT_UP : 0) | ((v >= -0.75 && v < -0.1) ? HAT_RIGHT : 0) |
    ((v >= -0.2 && v < 0.45) ? HAT_DOWN : 0) | (v >= 0.4 ? HAT_LEFT : 0);
}
function hatAxis(c, axes) {
  if (c._hat != null && c._hat < axes.length) return c._hat;
  for (let i = 2; i < axes.length; i++) if (axes[i] > 1.05 && axes[i] < 1.5) return (c._hat = i);   // a released hat
  return axes.length > 9 ? 9 : -1;   // HID hat-switch usage 0x39 lands on axis 9 in Chrome and Firefox
}
function isDown(b, trigger) {
  if (b == null) return false;
  if (typeof b === 'number') return b > 0.5;
  const v = +b.value || 0;
  if (trigger) return v >= TUNING.triggerOn || (!!b.pressed && v === 0);
  return !!b.pressed || v > 0.5;
}
const num = (v) => (Number.isFinite(v) ? v : 0);

function vidPid(id) {
  const s = String(id || '');
  const m = /vendor:\s*([0-9a-f]{1,4})\s*product:\s*([0-9a-f]{1,4})/i.exec(s)   // Chrome: "... (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"
    || /^\s*([0-9a-f]{1,4})-([0-9a-f]{1,4})-/i.exec(s);                        // Firefox: "054c-0ce6-..." or "54c-ce6-..."
  return m ? { vendor: parseInt(m[1], 16), product: parseInt(m[2], 16) } : { vendor: -1, product: -1 };
}
/** 'ps5' | 'ps4' | 'xbox' | 'switch' | 'generic' from a Gamepad.id string. */
export function padKind(id) {
  const s = String(id || ''), { vendor, product } = vidPid(s);
  if (/dualsense/i.test(s) || (vendor === 0x054c && (product === 0x0ce6 || product === 0x0df2))) return 'ps5';
  if (/dualshock|\bDS4\b/i.test(s) || (vendor === 0x054c && [0x05c4, 0x09cc, 0x0ba0].includes(product))) return 'ps4';
  if (vendor === 0x054c || /playstation|sony/i.test(s)) return 'ps4';   // other Sony pads: PlayStation glyphs
  if (/xbox|xinput/i.test(s) || vendor === 0x045e) return 'xbox';
  if (vendor === 0x057e || /pro controller|joy-?con|nintendo/i.test(s)) return 'switch';
  return 'generic';
}
function padName(id, kind) {
  const s = String(id || ''), { product } = vidPid(s);
  if (kind === 'ps5') return product === 0x0df2 || /edge/i.test(s) ? 'DualSense Edge' : 'DualSense';
  if (kind === 'ps4' && (/dualshock/i.test(s) || [0x05c4, 0x09cc, 0x0ba0].includes(product))) return 'DualShock 4';
  const clean = s.replace(/\s*\([^)]*\)\s*$/, '').replace(/^\s*[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, '').trim();
  if (kind === 'switch' && /pro/i.test(clean)) return 'Switch Pro Controller';
  return clean || (kind === 'xbox' ? 'Xbox Controller' : 'Gamepad');
}

/** Rumble presets for the engine: input.rumble(id, 'heavy'). */
export const RUMBLE = {
  light: { strong: 0.15, weak: 0.55, ms: 70 },     // a landed jab
  heavy: { strong: 0.65, weak: 0.5, ms: 150 },     // finisher, getting knocked down
  special: { strong: 0.45, weak: 0.9, ms: 340 },   // dragon flare
  slam: { strong: 1, weak: 0.7, ms: 420 },         // boss ground slam
};

// ------------------------------------------------------------------------------------------ controller
const blank = () => { const o = {}; for (const a of ACTIONS) o[a] = false; return o; };
const EMPTY = Object.freeze(blank());

export class Controller {
  constructor(id, type, kind, name) {
    this.id = id;          // 'kb' | 'kb1' | 'kb2' | 'touch' | 'pad0'..
    this.type = type;      // 'keyboard' | 'touch' | 'pad'
    this.kind = kind;      // 'keyboard' | 'touch' | 'ps5' | 'ps4' | 'xbox' | 'switch' | 'generic'
    this.name = name;
    this.index = -1;       // gamepad.index for pads
    this.active = false;   // exists right now (keyboard in the current mode / pad connected / touch used)
    this.connected = false;
    this.mapping = '';
    this.held = blank();
    this.pressed = blank();
    this.runTap = 0;
    this.stick = { x: 0, y: 0 };   // -1..1; pads: left stick past the deadzone (else d-pad), keyboard: -1/0/1
    this.lastUsed = -1;            // tick of the last press / hold
    this._latch = blank();         // presses seen by DOM events since the last tick
    this._mute = blank();          // buttons ignored until released (after clear())
    this._lastTap = { left: -99, right: -99 };
    this._fullT = 0;
    this._raw = blank();           // last polled state (pads)
    this._sdir = { left: false, right: false, up: false, down: false };   // stick directions (hysteresis)
    this._codeActs = null;         // keyboards: code → [actions]
  }
}

// ------------------------------------------------------------------------------------------ manager
const HAS_WIN = typeof window !== 'undefined';

export class InputManager {
  constructor() {
    this.tick = 0;
    this.split = false;
    this.rumbleEnabled = true;      // options menu switch
    this._keys = new Set();         // codes down now
    this._hits = new Set();         // codes that went down since the last tick
    this._pads = new Map();         // gamepad.index → Controller
    this._connCbs = []; this._pressCbs = [];
    this._padError = null;
    this._layout = null;            // navigator.keyboard layout map (key labels on AZERTY etc.)

    this._kbMap = {};
    for (const [id, name] of [['kb', 'Keyboard'], ['kb1', 'Keyboard (left)'], ['kb2', 'Keyboard (right)']]) {
      const c = new Controller(id, 'keyboard', 'keyboard', name);
      c._codeActs = new Map();
      for (const [a, codes] of Object.entries(KEYMAPS[id])) for (const code of codes) {
        if (!c._codeActs.has(code)) c._codeActs.set(code, []);
        c._codeActs.get(code).push(a);
      }
      this._kbMap[id] = c;
    }
    this._kbMap.kb.active = this._kbMap.kb.connected = true;
    this._kbs = [this._kbMap.kb, this._kbMap.kb1, this._kbMap.kb2];

    this._touch = new Controller('touch', 'touch', 'touch', 'Touch');
    this._touchUsed = false;
    this._tsrc = { dir: { left: false, right: false, up: false, down: false }, full: false, x: 0, y: 0, sid: null, ptrs: {}, els: [], end: null };
    this._touchLook = {};
    this._touchRoots = new Set();

    if (!HAS_WIN) return;
    this._onKeyDown = (e) => this._keyDown(e);
    this._onKeyUp = (e) => this._keyUp(e);
    this._onBlur = () => this._dropAll();
    this._onVis = () => { if (document.hidden) this._dropAll(); };
    this._onPadConn = (e) => { const gp = e.gamepad; if (gp && typeof gp.index === 'number' && gp.connected !== false) this._sync(gp); };
    this._onPadDisc = (e) => { const c = e.gamepad && this._pads.get(e.gamepad.index); if (c && c.active) this._detach(c); };
    addEventListener('keydown', this._onKeyDown, true);
    addEventListener('keyup', this._onKeyUp, true);
    addEventListener('blur', this._onBlur);
    addEventListener('gamepadconnected', this._onPadConn);
    addEventListener('gamepaddisconnected', this._onPadDisc);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVis);
    try {
      const p = navigator.keyboard && navigator.keyboard.getLayoutMap && navigator.keyboard.getLayoutMap();
      if (p && p.then) p.then((m) => { this._layout = m; }, () => {});
    } catch { /* not allowed in cross-origin frames */ }
  }

  /** Remove every listener (tests, hot reload). */
  destroy() {
    if (!HAS_WIN) return;
    removeEventListener('keydown', this._onKeyDown, true);
    removeEventListener('keyup', this._onKeyUp, true);
    removeEventListener('blur', this._onBlur);
    removeEventListener('gamepadconnected', this._onPadConn);
    removeEventListener('gamepaddisconnected', this._onPadDisc);
    document.removeEventListener('visibilitychange', this._onVis);
  }

  // ---------------------------------------------------------------- per tick
  /** Once per 60 Hz tick: poll gamepads, then compute every controller's held / pressed / runTap. */
  update() {
    this.tick++;
    this._pollPads();
    for (const c of this._kbs) {
      let raw = EMPTY;
      if (c.active) {
        raw = this._kbRaw(c);
        for (const code of this._hits) { const acts = c._codeActs.get(code); if (acts) for (const a of acts) c._latch[a] = true; }
      }
      c.stick.x = (raw.right ? 1 : 0) - (raw.left ? 1 : 0);
      c.stick.y = (raw.down ? 1 : 0) - (raw.up ? 1 : 0);
      this._step(c, raw);
    }
    this._hits.clear();
    const t = this._touch, T = this._tsrc;
    t._fullT = T.full ? t._fullT + 1 : 0;
    t.stick.x = T.sid !== null ? T.x : 0; t.stick.y = T.sid !== null ? T.y : 0;
    this._step(t, this._touchRaw());
    for (const c of this._pads.values()) {
      this._step(c, c.active ? c._raw : EMPTY);
      if (c.active) for (const a of ACTIONS) if (c.pressed[a]) this._emitPress(c, a);   // pads have no DOM event
    }
  }

  _step(c, raw) {
    let busy = false;
    for (const a of ACTIONS) {
      let h = !!raw[a];
      const l = !!c._latch[a];
      if (c._mute[a]) { if (l || !h) c._mute[a] = false; else h = false; }
      const p = l || (h && !c.held[a]);
      c.pressed[a] = p; c.held[a] = h; c._latch[a] = false;
      if (p || h) busy = true;
    }
    c.runTap = 0;
    for (const d of ['left', 'right']) {
      if (!c.pressed[d]) continue;
      if (this.tick - c._lastTap[d] < TUNING.runTapTicks) c.runTap = d === 'left' ? -1 : 1;
      c._lastTap[d] = this.tick;
    }
    if (busy) c.lastUsed = this.tick;
  }

  // ---------------------------------------------------------------- lookup
  /** 'kb' | 'kb1' | 'kb2' | 'touch' | 'pad0'..'pad3' → Controller (pads that are not connected read all-false). */
  get(id) {
    if (id && typeof id === 'object') return id;
    if (this._kbMap[id]) return this._kbMap[id];
    if (id === 'touch') return this._touch;
    const m = /^pad(\d+)$/.exec(id || '');
    return m ? this._padAt(+m[1]) : null;
  }

  /** Controllers that exist now: the keyboard ('kb', or 'kb1' + 'kb2' when split), connected pads, touch once used. */
  list() {
    const out = this._kbs.filter((c) => c.active);
    for (const i of [...this._pads.keys()].sort((a, b) => a - b)) { const c = this._pads.get(i); if (c.active) out.push(c); }
    if (this._touchUsed) out.push(this._touch);
    return out;
  }

  /** First controller (keyboard, pads, touch) that pressed `action` this tick — menus and "press START to join". */
  anyPressed(action, { exclude = [] } = {}) {
    const ex = new Set(exclude.map((e) => (e && typeof e === 'object' ? e.id : e)));
    for (const c of this.list()) if (!ex.has(c.id) && c.pressed[action]) return c;
    return null;
  }

  /** Co-op on one keyboard: on = 'kb1' (left half) and 'kb2' (right half) active and 'kb' silent; off = 'kb' gets every key. */
  setSplitKeyboard(on) {
    on = !!on;
    if (on === this.split) return;
    this.split = on;
    for (const c of this._kbs) {
      c.active = c.connected = on ? c.id !== 'kb' : c.id === 'kb';
      const raw = c.active ? this._kbRaw(c) : EMPTY;
      for (const a of ACTIONS) {
        c.pressed[a] = false; c._latch[a] = false;
        c.held[a] = IS_DIR[a] ? !!raw[a] : false;        // directions carry over without a new press
        c._mute[a] = !IS_DIR[a] && !!raw[a];             // buttons already down wait for a release
      }
      c.runTap = 0;
    }
  }

  /** Drop held state (blur, scene change): buttons still down are ignored until released; directions keep walking. */
  clear() {
    for (const c of [...this._kbs, this._touch, ...this._pads.values()]) {
      const raw = c.type === 'keyboard' ? (c.active ? this._kbRaw(c) : EMPTY) : c.type === 'touch' ? this._touchRaw() : (c.active ? c._raw : EMPTY);
      for (const a of ACTIONS) {
        c.pressed[a] = false; c._latch[a] = false;
        if (IS_DIR[a]) continue;
        c.held[a] = false; c._mute[a] = !!raw[a];
      }
      c.runTap = 0;
    }
  }

  /** cb(action, id) at the moment of a press — synchronously inside keydown / pointerdown (a user gesture, e.g. to
   *  unlock audio), from update() for pads. action is null for "touched the joystick". Returns an unsubscribe fn. */
  onPress(cb) { this._pressCbs.push(cb); return () => { this._pressCbs = this._pressCbs.filter((f) => f !== cb); }; }
  _emitPress(c, a) { for (const cb of this._pressCbs) { try { cb(a, c.id); } catch (err) { console.error(err); } } }

  /** cb({ type: 'connected'|'disconnected', id: 'pad0', name, kind, index, mapping }). Returns an unsubscribe fn. */
  onConnection(cb) { this._connCbs.push(cb); return () => { this._connCbs = this._connCbs.filter((f) => f !== cb); }; }
  _emitConn(type, c) {
    const ev = { type, id: c.id, name: c.name, kind: c.kind, index: c.index, mapping: c.mapping };
    for (const cb of this._connCbs) { try { cb(ev); } catch (err) { console.error(err); } }
  }

  // ---------------------------------------------------------------- keyboard
  _keyDown(e) {
    const code = codeOf(e);
    if (!ALL_CODES.has(code) || isEditable(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;      // browser / OS shortcuts stay theirs
    if (e.cancelable) e.preventDefault();                // arrows / space / tab / Firefox quick-find keys / focused buttons
    if (e.repeat || this._keys.has(code)) return;        // auto-repeat never presses
    this._keys.add(code); this._hits.add(code);
    for (const c of this._kbs) {
      if (!c.active) continue;
      const acts = c._codeActs.get(code);
      if (acts) for (const a of acts) this._emitPress(c, a);
    }
  }
  _keyUp(e) {
    const code = codeOf(e);
    if (e.key === 'Meta') { this._keys.clear(); return; }   // macOS swallows keyups while Cmd is down
    if (!ALL_CODES.has(code)) return;
    this._keys.delete(code);
    if (e.cancelable && !isEditable(e.target)) e.preventDefault();
  }
  _kbRaw(c) {
    const raw = blank();
    for (const code of this._keys) { const acts = c._codeActs.get(code); if (acts) for (const a of acts) raw[a] = true; }
    return raw;
  }
  _dropAll() {     // focus lost: keyups and pointerups may never arrive
    this._keys.clear(); this._hits.clear();
    for (const c of this._kbs) c._latch = blank();
    const T = this._tsrc;
    if (T.end) T.end();
    for (const a in T.ptrs) T.ptrs[a].clear();
    for (const el of T.els) el.classList.remove('down');
  }

  /** Label of a physical key for prompts ('J', '←', 'Space', 'R-Shift'), following the user's layout when the browser tells us. */
  keyLabel(code) {
    const k = this._layout && this._layout.get && this._layout.get(code);
    if (k && k.length === 1 && k !== ' ') return k.toUpperCase();
    if (KEY_LABEL[code]) return KEY_LABEL[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  }

  // ---------------------------------------------------------------- touch
  /** let go of the on-screen stick (its zone switched off under a held thumb: a menu came up) */
  releaseStick() { this._tsrc?.end?.(); }
  /** Wire the touch overlay: #stickzone / #stick / #knob joystick and every [data-act] button (attack, jump, special, shoot...). */
  bindTouch(root) {
    if (!root || this._touchRoots.has(root)) return;
    this._touchRoots.add(root);
    const T = this._tsrc, t = this._touch, R = 56;
    const stick = root.querySelector('#stick'), knob = root.querySelector('#knob'), zone = root.querySelector('#stickzone');
    const used = () => { this._touchUsed = true; t.active = t.connected = true; };
    const setDirs = (dx, dy) => {
      const d = T.dir, was = { ...d };
      d.left = dx < -R * 0.32; d.right = dx > R * 0.32; d.up = dy < -R * 0.36; d.down = dy > R * 0.36;
      T.full = Math.hypot(dx, dy) / R > TUNING.fullTilt && Math.abs(dx) > Math.abs(dy) * 1.4;
      T.x = dx / R; T.y = dy / R;
      for (const k of DIRS) if (d[k] && !was[k]) t._latch[k] = true;
    };
    if (zone) {
      let ox = 0, oy = 0;
      zone.addEventListener('pointerdown', (e) => {
        if (T.sid !== null) return;
        T.sid = e.pointerId;
        try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        ox = e.clientX; oy = e.clientY;
        if (stick) { stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; stick.classList.add('on'); }
        if (knob) knob.style.transform = 'translate(-50%,-50%)';
        setDirs(0, 0); used(); this._emitPress(t, null);
        e.preventDefault();
      });
      zone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== T.sid) return;
        let dx = e.clientX - ox, dy = e.clientY - oy;
        const m = Math.hypot(dx, dy);
        if (m > R) { dx *= R / m; dy *= R / m; }
        if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        setDirs(dx, dy);
      });
      T.end = () => { T.sid = null; if (stick) stick.classList.remove('on'); setDirs(0, 0); T.full = false; };
      const end = (e) => { if (e.pointerId === T.sid) T.end(); };
      zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    }
    for (const el of root.querySelectorAll('[data-act]')) {
      const a = el.dataset.act;
      if (!ACTIONS.includes(a)) continue;
      const ptrs = T.ptrs[a] || (T.ptrs[a] = new Set());
      T.els.push(el);
      try {   // prompts reuse the on-screen button's look
        const cs = getComputedStyle(el), bg = cs.backgroundColor;
        if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) this._touchLook[a] = { text: (el.textContent || '').trim(), color: bg, ink: cs.color };
      } catch { /* no layout */ }
      el.addEventListener('pointerdown', (e) => {
        ptrs.add(e.pointerId); t._latch[a] = true; el.classList.add('down');
        used(); this._emitPress(t, a);
        try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        e.preventDefault();
      });
      const up = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) el.classList.remove('down'); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    }
  }
  _touchRaw() {
    const T = this._tsrc, raw = blank();
    for (const d of DIRS) raw[d] = !!T.dir[d];
    for (const a in T.ptrs) if (T.ptrs[a].size) raw[a] = true;
    if (this._touch._fullT >= TUNING.fullTiltTicks) raw.run = true;
    return raw;
  }

  // ---------------------------------------------------------------- gamepads
  _padAt(i) {
    let c = this._pads.get(i);
    if (!c) { c = new Controller('pad' + i, 'pad', 'generic', 'Gamepad'); c.index = i; this._pads.set(i, c); }
    return c;
  }
  _getPads() {
    try {
      const list = navigator.getGamepads ? navigator.getGamepads() : [];
      this._padError = null;
      return list || [];
    } catch (err) { this._padError = err; return null; }   // SecurityError: blocked by Permissions-Policy
  }
  _sync(gp) {   // make sure the controller at gp.index describes this pad
    const c = this._padAt(gp.index);
    if (c.active && c._gpId === gp.id) return c;
    if (c.active) this._detach(c);
    c._gpId = gp.id; c.kind = padKind(gp.id); c.name = padName(gp.id, c.kind); c.mapping = gp.mapping || '';
    c._hat = null; c._fullT = 0; c._raw = blank(); c._mute = blank(); c._latch = blank();
    c.held = blank(); c.pressed = blank(); c.runTap = 0;
    for (const d of DIRS) c._sdir[d] = false;
    c.active = c.connected = true;
    this._emitConn('connected', c);
    return c;
  }
  _detach(c) {
    c.active = c.connected = false;
    c._raw = blank(); c.held = blank(); c.pressed = blank(); c.runTap = 0; c.stick.x = c.stick.y = 0;
    this._emitConn('disconnected', c);
  }
  _pollPads() {
    if (!HAS_WIN || typeof navigator === 'undefined') return;
    const list = this._getPads();
    if (!list) return;
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const gp = list[i];
      if (!gp || gp.connected === false) continue;
      const idx = typeof gp.index === 'number' ? gp.index : i;
      seen.add(idx);
      const c = this._sync(gp);
      c._raw = this._padRaw(c, gp);
    }
    for (const c of this._pads.values()) if (c.active && !seen.has(c.index)) this._detach(c);
  }
  _padRaw(c, gp) {
    const T = TUNING, b = new Array(18).fill(false), raw = blank();
    const btns = gp.buttons || [], axes = gp.axes || [];
    const sony = c.kind === 'ps5' || c.kind === 'ps4';
    if (gp.mapping === 'standard') {
      for (let i = 0; i < 18 && i < btns.length; i++) b[i] = isDown(btns[i], i === 6 || i === 7);
    } else {
      if (sony) for (let i = 0; i < SONY_RAW_TO_STD.length && i < btns.length; i++) b[SONY_RAW_TO_STD[i]] = isDown(btns[i], false);
      else for (let i = 0; i < 12 && i < btns.length; i++) b[i] = isDown(btns[i], false);   // best guess: positional
      const h = hatAxis(c, axes);
      if (h >= 0) {
        const d = hatDirs(axes[h]);
        b[12] = !!(d & HAT_UP); b[13] = !!(d & HAT_DOWN); b[14] = !!(d & HAT_LEFT); b[15] = !!(d & HAT_RIGHT);
      } else if (!sony && btns.length >= 16) for (let i = 12; i < 16; i++) b[i] = isDown(btns[i], false);
    }
    const lx = num(axes[0]), ly = num(axes[1]), m = Math.hypot(lx, ly), s = c._sdir;
    s.left = lx < -(s.left ? T.deadzoneOff : T.deadzone); s.right = lx > (s.right ? T.deadzoneOff : T.deadzone);
    s.up = ly < -(s.up ? T.deadzoneOff : T.deadzone); s.down = ly > (s.down ? T.deadzoneOff : T.deadzone);
    c._fullT = m >= T.fullTilt && Math.abs(lx) > Math.abs(ly) * 1.4 ? c._fullT + 1 : 0;
    raw.left = s.left || b[14]; raw.right = s.right || b[15]; raw.up = s.up || b[12]; raw.down = s.down || b[13];
    const f = c.kind === 'switch' ? PAD_FACE_NINTENDO : PAD_FACE;
    raw.attack = b[f.attack]; raw.jump = b[f.jump]; raw.shoot = b[f.shoot]; raw.special = b[f.special];
    raw.confirm = b[f.confirm]; raw.back = b[f.back];
    raw.dodge = b[4] || b[5] || b[6] || b[7];            // any shoulder or trigger (L1 R1 L2 R2): dodge
    raw.run = c._fullT >= T.fullTiltTicks;               // (run on a pad: the stick at full tilt, or a double tap)
    raw.start = b[9];
    if (m > T.deadzone) { const k = Math.min(1, (m - T.deadzone) / (1 - T.deadzone)) / m; c.stick.x = lx * k; c.stick.y = ly * k; }
    else { c.stick.x = (b[15] ? 1 : 0) - (b[14] ? 1 : 0); c.stick.y = (b[13] ? 1 : 0) - (b[12] ? 1 : 0); }
    return raw;
  }

  /** Vibrate a pad: rumble('pad0', { strong, weak, ms }) or rumble('pad0', 'heavy'). Returns true if an effect was sent. */
  rumble(id, opts = {}) {
    if (!this.rumbleEnabled) return false;
    const o = typeof opts === 'string' ? RUMBLE[opts] || {} : opts || {};
    const { strong = 0.6, weak = 0.4, ms = 120 } = o;
    const c = this.get(id);
    if (!c || c.type !== 'pad' || !c.active) return false;
    try {
      const list = this._getPads() || [];
      let gp = null;
      for (const p of list) if (p && p.index === c.index) gp = p;
      if (!gp) return false;
      const clamp = (v) => Math.max(0, Math.min(1, +v || 0));
      const act = gp.vibrationActuator;
      if (act && typeof act.playEffect === 'function' && (!Array.isArray(act.effects) || act.effects.includes('dual-rumble'))) {
        const p = act.playEffect('dual-rumble', { startDelay: 0, duration: Math.max(1, Math.min(5000, ms | 0)), strongMagnitude: clamp(strong), weakMagnitude: clamp(weak) });
        if (p && p.catch) p.catch(() => {});
        return true;
      }
      const h = gp.hapticActuators && gp.hapticActuators[0];   // old Firefox API (normally disabled)
      if (h && typeof h.pulse === 'function') {
        const p = h.pulse(clamp(Math.max(strong, weak)), ms);
        if (p && p.catch) p.catch(() => {});
        return true;
      }
    } catch { /* unsupported / pad gone */ }
    return false;
  }

  // ---------------------------------------------------------------- status
  /** Whether the Gamepad API may be used here (false when Permissions-Policy blocks it, e.g. a cross-origin iframe without allow="gamepad").
   *  null when this browser has no Gamepad API at all (an old or stripped-down engine, an insecure page): nothing is
   *  BLOCKED there, so the game's "Controllers are blocked in this view" line (main.js deviceLine) must not show. */
  gamepadAllowed() {
    if (!HAS_WIN || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    try {
      const pp = document.permissionsPolicy || document.featurePolicy;
      if (pp && typeof pp.allowsFeature === 'function') {
        const feats = typeof pp.features === 'function' ? pp.features() : null;
        if (feats && feats.includes('gamepad') && !pp.allowsFeature('gamepad')) return false;
      }
    } catch { /* policy API missing */ }
    try { navigator.getGamepads(); } catch { return false; }
    return true;
  }

  status() {
    const pads = this.list().filter((c) => c.type === 'pad').map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
    const gamepadAllowed = this.gamepadAllowed();
    let hint;
    if (!HAS_WIN || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      hint = HAS_WIN && window.isSecureContext === false ? 'Controllers need a secure page (https:// or localhost).' : 'This browser has no Gamepad API: use the keyboard or touch.';
    } else if (!gamepadAllowed) hint = 'Controllers are blocked in this embedded page. Open the game in its own tab (or the host page must give its iframe allow="gamepad").';
    else if (!pads.length) hint = 'Connect a controller (USB or Bluetooth) and press any button on it.';
    else hint = pads.map((p) => p.name).join(' + ') + ' ready';
    return { pads, gamepadAllowed, hint };
  }

  // ---------------------------------------------------------------- glyphs
  /** What to show for `action` on a device: { text, color, shape, ... }. id: a controller id, a Controller, or a kind
   *  ('ps5' | 'ps4' | 'xbox' | 'switch' | 'generic' | 'keyboard' | 'touch'); omitted = the controller used last. */
  glyph(action, id) {
    let c = null, kind;
    if (id == null) c = this.list().reduce((best, x) => (x.lastUsed > (best ? best.lastUsed : -2) ? x : best), null) || this._kbMap.kb;
    else if (typeof id === 'object') c = id;
    else if (FACE[famOf(id)] || id === 'keyboard' || id === 'touch') kind = id;
    else c = this.get(id);
    if (!c && !kind) c = this._kbMap.kb;
    kind = kind || c.kind;
    if (kind === 'keyboard') return this._keyGlyph(action, c && c.type === 'keyboard' ? c.id : (this.split ? 'kb1' : 'kb'));
    if (kind === 'touch') return this._touchGlyph(action);
    return padGlyph(action, kind);
  }
  _keyGlyph(action, kbId) {
    const codes = KEYMAPS[kbId][action] || [];
    if (!codes.length) return { text: '', color: KEYCAP, shape: 'key', kind: 'keyboard' };
    const code = codes[0];
    let text = this.keyLabel(code);
    if (codes.includes('ShiftLeft') && codes.includes('ShiftRight')) text = 'Shift';
    return { text, color: KEYCAP, shape: 'key', kind: 'keyboard', code, dir: ARROW_OF[code] || null };
  }
  _touchGlyph(action) {
    if (IS_DIR[action]) return { text: ARROW_TEXT[action], color: '#fff0d2', shape: 'stick', kind: 'touch', dir: action };
    if (action === 'run') return { text: 'RUN', color: '#fff0d2', shape: 'stick', kind: 'touch', dir: 'right', full: true };
    const d = TOUCH_LOOK[action], look = this._touchLook[action];
    return { text: (look && look.text) || d.text, color: (look && look.color) || d.color, ink: (look && look.ink) || d.ink, shape: 'touch', kind: 'touch' };
  }

  /** Draw the prompt icon for `action` on device `id`, centred at x,y, `size` px tall. Returns the width drawn. */
  drawGlyph(ctx, action, id, x, y, size = 28) {
    return drawGlyphData(ctx, this.glyph(action, id), x, y, size);
  }
}

// ------------------------------------------------------------------------------------------ glyph data
const KEYCAP = '#f6f0e3', DARK = '#1c1d25', RIM = '#4d5162', LIGHT = '#f2f2f5', INK = '#21141c';
const ARROW_TEXT = { left: '←', right: '→', up: '↑', down: '↓' };
const famOf = (k) => (k === 'ps5' || k === 'ps4' ? 'ps' : k);
// face buttons by standard index (0 bottom, 1 right, 2 left, 3 top)
const FACE = {
  ps: [{ t: '✕', c: '#7cb2ff' }, { t: '◯', c: '#ff5a68' }, { t: '□', c: '#ff8ad6' }, { t: '△', c: '#36d99a' }],   // (◯ the large circle: the small ○ read as a hairline dot in the text prompts)
  xbox: [{ t: 'A', c: '#4fb52a' }, { t: 'B', c: '#e3392f' }, { t: 'X', c: '#2b78e4' }, { t: 'Y', c: '#f1bd16' }],
  switch: [{ t: 'B', c: LIGHT }, { t: 'A', c: LIGHT }, { t: 'Y', c: LIGHT }, { t: 'X', c: LIGHT }],
  generic: [{ t: 'A', c: LIGHT }, { t: 'B', c: LIGHT }, { t: 'X', c: LIGHT }, { t: 'Y', c: LIGHT }],
};
const SHOULDER = { ps: 'R1', xbox: 'RB', switch: 'R', generic: 'RB' };       // (dodge: any shoulder or trigger)
const START_TEXT = { ps5: 'OPTIONS', ps4: 'OPTIONS', xbox: 'MENU', switch: '+', generic: 'START' };
const TOUCH_LOOK = {
  attack: { text: 'ATTACK', color: '#ff9a3a', ink: INK }, jump: { text: 'JUMP', color: '#8fd0ff', ink: INK },
  special: { text: 'FLARE', color: '#ff5a3a', ink: '#fff6e0' }, shoot: { text: 'SHOOT', color: '#b6e35a', ink: INK },
  dodge: { text: 'DODGE', color: '#c9a7ff', ink: INK },
  start: { text: '❚❚', color: '#f3eee6', ink: INK }, confirm: { text: 'TAP', color: '#f3eee6', ink: INK }, back: { text: '❚❚', color: '#f3eee6', ink: INK },   // (❚❚ the pause button's own bars: 'II' read as two letters)
};

function padGlyph(action, kind) {
  const fam = famOf(kind);
  if (IS_DIR[action]) return { text: ARROW_TEXT[action], color: LIGHT, shape: 'dpad', kind, dir: action };
  if (action === 'run') return { text: ARROW_TEXT.right + ARROW_TEXT.right, color: LIGHT, shape: 'dpad', kind, dir: 'right' };   // (double tap / full tilt)
  if (action === 'dodge') return { text: SHOULDER[fam], color: LIGHT, shape: 'shoulder', kind };
  if (action === 'start') return { text: START_TEXT[kind], color: LIGHT, shape: 'menu', kind };
  const btn = (fam === 'switch' ? PAD_FACE_NINTENDO : PAD_FACE)[action];
  const f = FACE[fam][btn];
  return { text: f.t, color: f.c, shape: 'face', kind, btn };
}

// ------------------------------------------------------------------------------------------ glyph drawing
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function label(ctx, s, x, y, px, font, color, maxW) {
  ctx.font = `${px}px ${font}`;
  if (maxW) { const w = ctx.measureText(s).width; if (w > maxW) { px *= maxW / w; ctx.font = `${px}px ${font}`; } }
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(s), a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent;
  ctx.fillText(s, x, y + (Number.isFinite(a) && Number.isFinite(d) ? (a - d) / 2 : px * 0.35));
}
function arrow(ctx, x, y, s, dir, color) {   // solid arrow, s = length
  const ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = color;
  const h = s / 2, hw = s * 0.44, sw = s * 0.15, hx = s * 0.04;
  ctx.beginPath(); ctx.moveTo(h, 0); ctx.lineTo(hx, -hw); ctx.lineTo(hx, -sw); ctx.lineTo(-h, -sw);
  ctx.lineTo(-h, sw); ctx.lineTo(hx, sw); ctx.lineTo(hx, hw); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function shade(hex, f) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16), ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
const SANS = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

/** Draw glyph data (from InputManager.glyph) centred at x,y; returns the drawn width. */
export function drawGlyphData(ctx, g, x, y, size = 28) {
  const r = size / 2, lw = Math.max(1, size * 0.06);
  let width = size;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (g.shape) {
    case 'face': {
      const fam = famOf(g.kind);
      if (fam === 'xbox') {
        disc(ctx, x, y, r - lw / 2); ctx.fillStyle = g.color; ctx.fill();
        ctx.lineWidth = lw; ctx.strokeStyle = shade(g.color, 0.55); ctx.stroke();
        label(ctx, g.text, x, y, size * 0.6, `800 ${SANS}`, g.text === 'Y' ? '#3a2c00' : '#ffffff');
        break;
      }
      disc(ctx, x, y, r - lw / 2); ctx.fillStyle = DARK; ctx.fill();
      ctx.lineWidth = lw; ctx.strokeStyle = RIM; ctx.stroke();
      if (fam === 'ps') {
        ctx.strokeStyle = g.color; ctx.lineWidth = Math.max(1.6, size * 0.1);
        const s = r * 0.4;
        ctx.beginPath();
        if (g.text === '✕') { ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); }
        else if (g.text === '◯' || g.text === '○') ctx.arc(x, y, r * 0.43, 0, Math.PI * 2);
        else if (g.text === '□') ctx.rect(x - s * 0.95, y - s * 0.95, s * 1.9, s * 1.9);
        else {   // △, centroid on centre, nudged down a hair for optical balance
          const R = r * 0.52, oy = y + r * 0.05;
          ctx.moveTo(x, oy - R); ctx.lineTo(x + R * 0.866, oy + R * 0.5); ctx.lineTo(x - R * 0.866, oy + R * 0.5); ctx.closePath();
        }
        ctx.stroke();
      } else if (fam === 'generic') {   // unknown labels: show the position in the diamond
        const d = r * 0.46, pr = r * 0.19, pos = [[0, d], [d, 0], [-d, 0], [0, -d]];
        pos.forEach(([px, py], i) => {
          disc(ctx, x + px, y + py, i === g.btn ? pr * 1.25 : pr * 0.85);
          if (i === g.btn) { ctx.fillStyle = LIGHT; ctx.fill(); } else { ctx.lineWidth = Math.max(1, size * 0.045); ctx.strokeStyle = '#8a8fa0'; ctx.stroke(); }
        });
      } else label(ctx, g.text, x, y, size * 0.58, `700 ${SANS}`, g.color);
      break;
    }
    case 'shoulder': {
      width = size * 1.5;
      const h = size * 0.78;
      rr(ctx, x - width / 2 + lw / 2, y - h / 2, width - lw, h, h * 0.42); ctx.fillStyle = DARK; ctx.fill();
      ctx.lineWidth = lw; ctx.strokeStyle = RIM; ctx.stroke();
      label(ctx, g.text, x, y, size * 0.42, `800 ${SANS}`, LIGHT, width * 0.72);
      break;
    }
    case 'menu': {
      width = g.text.length > 1 && famOf(g.kind) === 'generic' ? size * 1.6 : size * 1.1;
      const h = size * 0.7;
      rr(ctx, x - width / 2 + lw / 2, y - h / 2, width - lw, h, h / 2); ctx.fillStyle = DARK; ctx.fill();
      ctx.lineWidth = lw; ctx.strokeStyle = RIM; ctx.stroke();
      ctx.strokeStyle = LIGHT; ctx.lineWidth = Math.max(1.2, size * 0.075);
      if (g.text === '+') {
        const s = size * 0.2;
        ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
      } else if (g.text === 'START') label(ctx, 'START', x, y, size * 0.3, `800 ${SANS}`, LIGHT, width * 0.78);
      else {   // ≡ (PlayStation OPTIONS, Xbox Menu)
        const s = size * 0.2, gap = size * 0.12;
        ctx.beginPath();
        for (const k of [-1, 0, 1]) { ctx.moveTo(x - s, y + k * gap); ctx.lineTo(x + s, y + k * gap); }
        ctx.stroke();
      }
      break;
    }
    case 'dpad': {
      const a = size * 0.36, L = r - lw / 2, h = a / 2;
      const plus = () => {
        ctx.beginPath();
        ctx.moveTo(x - h, y - L); ctx.lineTo(x + h, y - L); ctx.lineTo(x + h, y - h); ctx.lineTo(x + L, y - h); ctx.lineTo(x + L, y + h);
        ctx.lineTo(x + h, y + h); ctx.lineTo(x + h, y + L); ctx.lineTo(x - h, y + L); ctx.lineTo(x - h, y + h); ctx.lineTo(x - L, y + h);
        ctx.lineTo(x - L, y - h); ctx.lineTo(x - h, y - h); ctx.closePath();
      };
      plus(); ctx.fillStyle = '#585c6c'; ctx.fill();
      const arm = { left: [x - L, y - h, L - h, a], right: [x + h, y - h, L - h, a], up: [x - h, y - L, a, L - h], down: [x - h, y + h, a, L - h] }[g.dir];
      if (arm) { ctx.fillStyle = LIGHT; ctx.fillRect(...arm); }
      plus(); ctx.lineWidth = lw; ctx.strokeStyle = DARK; ctx.stroke();
      if (arm && size >= 26) {   // small sizes: the lit arm alone reads better than a speck of arrow
        const cx = arm[0] + arm[2] / 2, cy = arm[1] + arm[3] / 2;
        arrow(ctx, cx, cy, a * 0.62, g.dir, DARK);
      }
      break;
    }
    case 'key': {
      const fs = g.text.length > 1 ? size * 0.47 : /[.,;:'/]/.test(g.text) ? size * 0.78 : size * 0.5;   // tiny punctuation gets bigger; a word (Esc, Bksp, Tab, Shift) ~13 px at 28, was 10 (QA: legible from the sofa)
      ctx.font = `700 ${fs}px ${SANS}`;
      const tw = g.dir ? size * 0.4 : ctx.measureText(g.text).width;
      width = Math.max(size, tw + size * 0.55);
      const top = y - r, bevel = size * 0.12, kr = size * 0.2;
      rr(ctx, x - width / 2 + lw / 2, top + lw / 2, width - lw, size - lw, kr); ctx.fillStyle = '#a59b86'; ctx.fill();
      ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
      rr(ctx, x - width / 2 + lw * 1.5, top + lw * 1.5, width - lw * 3, size - lw * 3 - bevel, kr * 0.8); ctx.fillStyle = g.color || KEYCAP; ctx.fill();
      const cy = top + lw * 1.5 + (size - lw * 3 - bevel) / 2;
      if (g.dir) arrow(ctx, x, cy, size * 0.42, g.dir, INK);
      else label(ctx, g.text, x, cy, fs, `700 ${SANS}`, INK, width - size * 0.3);
      break;
    }
    case 'touch': {
      disc(ctx, x, y, r - size * 0.04); ctx.fillStyle = g.color; ctx.fill();
      ctx.lineWidth = Math.max(1, size * 0.08); ctx.strokeStyle = INK; ctx.stroke();
      label(ctx, g.text, x, y, size * (g.text.length > 2 ? 0.34 : 0.42), 'Bangers, Impact, "Arial Narrow", sans-serif', g.ink || INK, size * 0.74);
      break;
    }
    case 'stick': {
      disc(ctx, x, y, r - lw / 2); ctx.fillStyle = 'rgba(20,14,30,.6)'; ctx.fill();
      ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke();
      const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[g.dir] || [0, 0], off = r * (g.full ? 0.5 : 0.36);
      if (g.full) {   // speed lines behind the knob
        ctx.strokeStyle = '#fff0d2'; ctx.lineWidth = Math.max(1, size * 0.06);
        ctx.beginPath();
        for (const k of [-1, 1]) { ctx.moveTo(x - r * 0.62, y + k * r * 0.22); ctx.lineTo(x - r * 0.2, y + k * r * 0.22); }
        ctx.stroke();
      }
      disc(ctx, x + v[0] * off, y + v[1] * off, r * 0.42); ctx.fillStyle = g.color; ctx.fill();
      ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
      break;
    }
    default: label(ctx, g.text || '?', x, y, size * 0.5, `700 ${SANS}`, g.color || LIGHT);
  }
  ctx.restore();
  return width;
}

// ------------------------------------------------------------------------------------------ old API
/** Backwards-compatible single-player input: every controller merged into one held / pressed / runTap.
 *  kb / kbPressed (by action name) stay writable for tests, the bot and the pause button. */
export class Input {
  constructor(manager) {
    this.manager = manager || new InputManager();
    this.held = blank(); this.pressed = blank(); this.runTap = 0;
    this.kb = {}; this.kbPressed = {};
    this.lastDevice = 'keyboard';   // 'keyboard' | 'touch' | 'pad'
    this.onAnyPress = null;
    this._tick = 0; this._lastTap = { left: -99, right: -99 };
    this.manager.onPress((action, id) => {
      const c = this.manager.get(id);
      if (c) this.lastDevice = c.type;
      if (this.onAnyPress) this.onAnyPress(action || 'touch');
    });
  }
  bindTouch(root) { this.manager.bindTouch(root); }
  releaseStick() { this.manager.releaseStick?.(); }
  update() {
    const m = this.manager;
    m.update(); this._tick++;
    const ctrls = m.list();
    if (!ctrls.includes(m._touch)) ctrls.push(m._touch);
    for (const a of ACTIONS) {
      let h = !!this.kb[a], p = !!this.kbPressed[a];
      for (const c of ctrls) { if (c.held[a]) h = true; if (c.pressed[a]) p = true; }
      this.pressed[a] = p || (h && !this.held[a]);
      this.held[a] = h;
    }
    this.kbPressed = {};
    this.runTap = 0;
    for (const d of ['left', 'right']) {
      if (!this.pressed[d]) continue;
      if (this._tick - this._lastTap[d] < TUNING.runTapTicks) this.runTap = d === 'left' ? -1 : 1;
      this._lastTap[d] = this._tick;
    }
  }
  clear() {
    this.manager.clear();
    for (const a of ACTIONS) { this.pressed[a] = false; if (!IS_DIR[a]) this.held[a] = false; }
    this.kb = {};
  }
}
