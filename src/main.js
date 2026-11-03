// Dodongo's Quest: boot, scenes (title, select, story, play, clear, end), controllers, saving, the 60 Hz loop.
import { W, H, INK, FLOOR_TOP } from './config.js';
import * as InputMod from './input.js';
import { loadChars, CHARS } from './chars.js';
import { setArtManaged, setArtLazy, useArt, artResident, setArtRim, setArtScale } from './sprite3d.js';
import { levelArt, storyArt, selectArt, scenePacks } from './artsets.js';
import { loadShowcase, preloadCutins } from './showcase.js';
import { audio, setAudio } from './audio-proxy.js';
import { World } from './game.js';
import { Player } from './player.js';
import { Cutscene, loadPlates, livePanels, releasePlates } from './cutscene.js';
import { LEVELS, levelAt, secretIdx, SECRET_LEVELS, ALL_LEVELS, DQ_LEVELS } from './levels.js';
import { quest, isMM, isSI, setQuest, initQuest, QUEST_ORDER, questId } from './quests.js';
const titleTrack = () => (isSI() ? 'sititle' : 'title');   // (the title's music: Book 2 selected plays its own shanty title, src/audio.js)
import { MM_DAWN, MM_STORY_LVL, MM_LEVELS } from './mmlevels.js';
import { SI_HARBOR, SI_STORY_LVL, SI_LEVELS } from './silevels.js';
import { SI_NODES, SI_PALACE, SI_MAP, SI_MIRROR, SI_SUNKEY, SI_CAMP, SI_SUN, SI_ROADS, SI_STORM, openSiMap, stepSiMap, drawSiMap, simapTap, siWedges, addWedge, nodeBuilt } from './simap.js';
import { loadMMChars, loadSIChars } from './chars.js';
import { openStormOffer, stepStormOffer, drawStormOffer } from './sioffer.js';
import { siDoubloons, treasureOpen, krakenPal, DOUBLOON_LEVELS } from './sisecrets.js';   // (Skull Island's secrets: the doubloons, the Treasure Room, the kraken pal)   // (Skull Island's optional Storm Sea ride: src/stormride.js)
import { progress, addSecret, progressLine, queenReady, setQueen, formUnlocked, newUnlocks, markAnnounced, FORM_NAMES, counterLine, addShadowBoss, migrateMeta, unlockAllForms } from './secrets.js';
import { HEROES, HERO_IDS, FORMS, baseOf, storyHero } from './heroes.js';
import { loadSave, writeSave, clearSave, loadMeta, writeMeta, setSaveCheck, META_KEYS } from './save.js';
import { CUTSCENES } from './story.js';
import * as HUD from './hud.js';
import { clamp } from './rig.js';
import { SkyDuel } from './skyduel.js';
import { createStage as createSkyStage } from './stages/sky.js';
import { IOS, reportCanvasFailure } from './canvasmem.js';
import { releaseFlash } from './render.js';
import { ESDE, exitToLauncher } from './esde.js';
import { siSceneVeil, drawSiVeil } from './siveil.js';   // (Skull Island's scene transitions: isSI only)
import { sceneVeil, drawSceneVeil } from './sceneveil.js';   // (Books 1 / 3's: the same dips, in their LOADING card's dark -- the FX agent's)

const Q = new URLSearchParams(location.search);
export const MAX_PLAYERS = 4;
/** the seats the quest has: four in every book and stage (src/quests.js) -- two players may be the same hero, so Book 1's
 * trio and Skull Island's stage one (the trio before Scarlet joins: L.noScarlet) seat four too.  (Skull Island's swing-in: a
 * free seat is Scarlet's to take; with four players in, she is that fight's AI helper -- src/siworld.js scarletSeat.)
 * lvl: the stage asked about (kept for the callers; every stage seats the same) */
const MM_LIFT = 40;   // (Mystic Mountain: frames the play takes to lift out of the LOADING card -- App.drawMMLift; linear and slow enough that no 3-frame step reads as a flash: <= ~0.07 a cell at 40, 24 was just over flash_lum's 0.1 line)
const maxPlayers = (lvl) => { void lvl; return Math.min(MAX_PLAYERS, quest().maxPlayers); };
/** the test entry points' controllers: 1P 'any'; co-op the keyboard's halves, then pad2 / pad3 for P3 / P4 */
const testCtrls = (n) => (n > 1 ? ['kb1', 'kb2', 'pad2', 'pad3'].slice(0, n) : ['any']);
const ACTS = ['left', 'right', 'up', 'down', 'attack', 'jump', 'special', 'shoot', 'dodge', 'run', 'start', 'confirm', 'back'];
/** a cutscene backdrop's stage index (src/levels.js ALL_LEVELS: the quest's stages; Mystic Mountain's story names them
 * mm_forest ...: MM_STORY_LVL), or -1 */
const lvlIdx = (id) => ALL_LEVELS.findIndex((L) => L.id === (MM_STORY_LVL[id] || SI_STORY_LVL[id] || id));
const WARP_T = 30;               // a warp's iris: frames closing (then the next stage loads), frames opening

async function loadImage(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
async function loadFonts() {
  const list = [['Bangers', 'Bangers-Regular.ttf', {}], ['Luckiest Guy', 'LuckiestGuy-Regular.ttf', {}], ['Comic Neue', 'ComicNeue-Bold.ttf', { weight: '700' }]];
  await Promise.all(list.map(async ([fam, file, d]) => {
    try { const f = new FontFace(fam, `url(assets/fonts/${file})`, d); await f.load(); document.fonts.add(f); } catch (e) { console.warn('font', fam, e); }
  }));
}

class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = InputMod.InputManager ? new InputMod.InputManager() : null;
    this.frame = 0; this.time = 0;
    this.scene = 'boot'; this.sceneT = 0;
    this.paused = false;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.coarse = matchMedia('(pointer: coarse)').matches; // phone / tablet: no keyboard to split
    this.img = {};
    this.stages = {};          // lvlId -> { mod, stage }
    this.run = { heroes: ['dodongo'], ctrls: ['any'], players: 1, score: 0, freed: 0 };
    this.menu = { items: [], sel: 0 };
    this.selMem = {};
    this.toast = null;
    this._any = { id: 'any', kind: 'any', held: {}, pressed: {}, runTap: 0, stick: { x: 0, y: 0 } };
    this.lastCtrl = this.coarse ? 'touch' : 'kb';   // phones and tablets: prompts name the on-screen buttons
    this.world = new World(this);
  }

  // ================================================================================================ controllers
  ctrls() { return this.input ? this.input.list() : []; }
  ctrl(id) {
    if (id === 'any' || !this.input) return this._any;
    return this.input.get(id) || this._any;
  }
  mergeAny() {
    const a = this._any;
    for (const k of ACTS) { a.held[k] = false; a.pressed[k] = false; }
    a.runTap = 0;
    for (const c of this.ctrls()) {
      if (this.input?.split && c.id === 'kb') continue;
      for (const k of ACTS) {
        if (c.held[k]) a.held[k] = true;
        if (c.pressed[k]) {
          a.pressed[k] = true; this.lastCtrl = c.id;
          // (a device P1 moved or fought with: P1's -- its START pauses, it never drops a second hero in)
          if (k !== 'start' && k !== 'confirm' && k !== 'back') { this.p1dev = c.id; (this.p1devs || (this.p1devs = new Set())).add(c.id); }
        }
      }
      if (c.runTap) a.runTap = c.runTap;
    }
    // test hook: an auto-player can drive P1 (tools/bot2.js)
    const B = window.BOT_INPUT;
    if (B) { for (const k of ACTS) { if (B.held[k]) a.held[k] = true; if (B.pressed[k]) a.pressed[k] = true; } if (B.runTap) a.runTap = B.runTap; for (const k of ACTS) B.pressed[k] = false; }
    // (and one controller of its own, after the merge so 'any' doesn't see it: tools/bot2.js plays P2 on 'kb2')
    const BC = window.BOT_CTRL;
    if (BC) for (const id in BC) {
      const c = this.input?.get(id), I = BC[id];
      if (c && !c.active) for (const k of ACTS) { c.held[k] = false; c.pressed[k] = false; }   // (a pad not plugged in -- P3 / P4 on pad2 / pad3: nothing else clears it)
      if (c) for (const k of ACTS) { if (I.held?.[k]) c.held[k] = true; if (I.pressed?.[k]) c.pressed[k] = true; }
      if (I.pressed) for (const k of ACTS) I.pressed[k] = false;
    }
  }
  pressed(action, ids) {
    if (!ids) return this._any.pressed[action];
    return ids.some((id) => this.ctrl(id).pressed[action]);
  }
  anySkip() { const p = this._any.pressed; return p.attack || p.jump || p.start || p.confirm; }
  swallowInput() {
    for (const c of [...this.ctrls(), this._any]) for (const k of ACTS) c.pressed[k] = false;
  }
  rumble(p, kind) {
    if (!this.input?.rumble) return;
    const id = p.ctrlId === 'any' ? this.lastCtrl : p.ctrlId;
    if (!id || !id.startsWith('pad')) return;
    const P = { light: [0.25, 0.15, 60], heavy: [0.6, 0.4, 120], hurt: [0.4, 0.6, 120], hurtHeavy: [0.8, 0.8, 220], special: [0.9, 0.7, 420] }[kind] || [0.4, 0.3, 100];
    this.input.rumble(id, { strong: P[0], weak: P[1], ms: P[2] });
  }
  glyphText(action, id) {
    const cid = !id || id === 'any' ? this.lastCtrl : id;
    try { const g = this.input?.glyph(action, cid); if (g?.text) return g.text; } catch { /* fall through */ }
    return { attack: 'J', jump: 'K', special: 'L', shoot: 'I', dodge: 'O', start: 'ENTER', confirm: 'ENTER', back: 'ESC', run: 'SHIFT', left: '←→' }[action] || action.toUpperCase();
  }
  isPadId(id) { return !!id && (id.startsWith('pad') || id === 'ps5'); }
  /** a pad's dodge: every shoulder and trigger, named for the pad's family (from its dodge glyph: R1 / RB / R) */
  padDodgeText(id) { return { R1: 'L1 / R1 / L2 / R2', RB: 'LB / RB / LT / RT', R: 'L / R / ZL / ZR' }[this.glyphText('dodge', id)] || 'L1 / R1 / L2 / R2'; }
  drawGlyph(ctx, action, id, x, y, size) {
    if (this.input?.drawGlyph) { try { this.input.drawGlyph(ctx, action, id, x, y, size); return; } catch { /* fall through */ } }
    HUD.outlined(ctx, this.glyphText(action, id), x, y + size * 0.3, size * 0.7, '#fff', 'Bangers, Impact, sans-serif', 0.24, 'center');
  }
  promptText(action, verb) { return `${this.glyphText(action)} ${verb}`; }
  joinPrompt(slot) {
    if (slot >= 2) return 'press ✕ on a controller to join';   // (P3 / P4: the keyboard has only its two halves)
    const split = this.input?.split;
    const kb = split ? (slot === 0 ? this.glyphText('confirm', 'kb1') : this.glyphText('confirm', 'kb2')) : this.glyphText('confirm', 'kb');
    return `press ${kb}${this.padsConnected() ? ' or ✕ on a controller' : ''} to join`;
  }
  padsConnected() { return this.ctrls().filter((c) => c.id.startsWith('pad')).length; }
  /** a pad connected that no hero in play is on (tryDropIn's rule): a seat could be taken */
  freeSeatPad() {
    const ps = this.world?.players || [];
    if (ps.length >= maxPlayers() || !ps.length) return false;
    const p1dev = ps[0].ctrlId === 'any' ? (this.p1dev || this.p1Home()) : ps[0].ctrlId, used = new Set(ps.map((p) => (p.ctrlId === 'any' ? p1dev : p.ctrlId)));
    return this.ctrls().some((c) => c.id.startsWith('pad') && !used.has(c.id));
  }
  /** a free pad's START, as it's labelled (OPTIONS / MENU / +) */
  startText() {
    const ps = this.world?.players || [], used = new Set(ps.map((p) => p.ctrlId));
    const c = this.ctrls().find((q) => q.id.startsWith('pad') && !used.has(q.id));
    return c ? `[${this.glyphText('start', c.id)}]` : 'START';
  }
  canDropIn() { return this.padsConnected() > 0; }
  deviceLine() {
    const pads = this.ctrls().filter((c) => c.id.startsWith('pad'));
    const st = this.input?.status?.();
    if (st && st.gamepadAllowed === false) return 'Controllers are blocked in this view: open the game in its own tab to use one.';
    if (!pads.length) return this.coarse ? '' : 'Keyboard ready. Connect a PS5 controller (USB or Bluetooth) and press any button.';
    return pads.map((p) => `🎮 ${p.name || p.kind}`).join('   ') + '   connected';
  }
  padNote() {
    const st = this.input?.status?.();
    if (st && st.gamepadAllowed === false) return 'Controllers are blocked inside this embedded view. Open the game directly to use a PS5 controller.';
    return 'PS5 controller: connect by USB or Bluetooth, then press any button. Up to four controllers = up to four players.';
  }
  controlsDevices() {
    const pad = this.ctrls().find((c) => c.id.startsWith('pad'));
    const padCol = { id: pad ? pad.id : 'ps5', label: pad ? (pad.kind === 'xbox' ? 'XBOX' : 'CONTROLLER') : 'PS5 CONTROLLER' };
    // (a tablet or a phone: the on-screen buttons first, then a controller and the keyboard)
    if (this.coarse) return [{ id: 'touch', label: 'TOUCH' }, padCol, { id: 'kb', label: 'KEYBOARD' }];
    return [{ id: 'kb', label: 'KEYBOARD' }, padCol, { id: 'kb1', label: '2P KEYS: LEFT' }, { id: 'kb2', label: '2P KEYS: RIGHT' }];
  }
  hintText(key, p) {
    const t = this.hintText0(key, p);
    const cid = !p?.ctrlId || p.ctrlId === 'any' ? this.lastCtrl : p.ctrlId;
    return cid === 'touch' && t ? t.replace(/\bPress\b/g, 'Tap').replace(/\bpress\b/g, 'tap') : t;
  }
  hintText0(key, p) {
    const id = p?.ctrlId;
    const G = (a) => this.glyphText(a, id);
    // (a key in brackets -- "Hold [I]" -- so a letter never reads as a word; a touch button by its name)
    const K = (a) => { const t = G(a), cid = !id || id === 'any' ? this.lastCtrl : id; return cid === 'touch' ? t : `[${t}]`; };
    const H0 = p?.hero || HEROES.dodongo;
    // (the charged spell by name -- the form's own where it has one; Legend Shadow's held SHOOT is rapid fire)
    const CN = H0.charged?.name || { dodongo: 'DRAGON BURST', ana: 'CRYSTAL NOVA', shadow: 'SHURIKEN STORM', scarlet: 'CHAIN WHIRL', dragon: 'FLAME STREAM' }[H0.dragon ? 'dragon' : H0.base || H0.id];
    switch (key) {
      case 'attack': return `Press ${K('attack')} to attack! Tap it 4 times for a combo.`;
      case 'shoot': return `Press ${K('shoot')} to use your ${H0.shoot.name}!`;
      case 'special': return `Lots of enemies? Press ${K('special')} for your ${H0.special.name}!`;
      case 'team': {   // (each player's own SUPER key / button; a touch player's is the SUPER button itself)
        const ps = this.world.players, touch = (q) => q.ctrlId === 'touch' || (q.ctrlId === 'any' && this.lastCtrl === 'touch');
        const keys = ps.filter((q) => !touch(q)).map((q) => `P${q.slot + 1} [${this.glyphText('special', q.ctrlId)}]`);
        if (ps.length > 2) return 'Stand close together and press SUPER at the same time for a TEAM ATTACK!';
        return ps.length > 1 ? `Stand close and BOTH press SUPER${keys.length ? ` (${keys.join(', ')})` : ''} for a TEAM ATTACK!` : '';
      }
      case 'snack': return 'Low on health? Smash crates and barrels to find snacks!';
      case 'charge': return H0.shoot.auto ? `Hold ${K('shoot')} for ${H0.shoot.name}!` : `Hold ${K('shoot')} to charge a big spell${CN ? `: ${CN}` : ''}!`;
      case 'cmelee': return `Hold ${K('attack')} to charge a big strike!`;
      case 'dodge': {   // (a pad: any shoulder or trigger dodges -- all four named)
        const cid = !id || id === 'any' ? this.lastCtrl : id;
        return `Press ${this.isPadId(cid) ? this.padDodgeText(cid) : K('dodge')} to roll out of the way!`;
      }
      case 'join': {   // (each connected pad's own START: OPTIONS / MENU / +)
        const names = [...new Set(this.ctrls().filter((c) => c.id.startsWith('pad')).map((c) => this.glyphText('start', c.id)))];
        return names.length ? `A friend can warp in: press [${names.join('] / [')}] on another controller!` : '';
      }
    }
    return '';
  }
  showToast(text, life = 200) { this.toast = { text, t: 0, life }; }

  // ================================================================================================ scenes
  setScene(s) {
    if (isSI()) siSceneVeil(this, s);   // (Skull Island: no hard cuts -- the scene going darkens / dissolves over the next one's first frames: src/siveil.js)
    // (Books 1 / 3: the same -- every change a dip into the LOADING card's dark and a 40-frame lift out of it (Mystic Mountain's
    //  MM_LIFT, QA3's 0.53 one-frame jump, now both books' and every change's; the cut INTO the card darkened 37 % in a frame):
    //  src/sceneveil.js.  App.drawMMLift is no longer used)
    else sceneVeil(this, s);
    if (this.toast?.boot && this.scene === 'title' && s !== 'title') this.toast = null;   // (the boot grant's two-line toast is the title's: never over the select's cards)
    this.scene = s; this.sceneT = 0; this.swallowInput();
    try { delete document.body.dataset.hint; } catch { /* (no DOM) */ }   // (a hint's button pulse never outlives its scene)
    this.duelLabels(s === 'duel');
    if (s === 'title' || s === 'levels' || s === 'controls') useArt([]);   // the menus draw no sprite characters
    // (an ending reached: the run is over -- CONTINUE would only lead back into the Hollow or Stage 4; LEVEL SELECT stays)
    // (the level select's BONUS: THE DAWN RIDE is a replay: the run in progress -- CONTINUE -- stays as it was)
    if ((s === 'end' || s === 'trueEnd') && !this.run?.bonus) clearSave();
  }

  /** the touch buttons say what they do in the sky duel (FIRE / ROLL / SUPER / FLAME), and go back afterwards */
  duelLabels(on) {
    if (typeof document === 'undefined' || !!this._duelLabels === on) return;
    this._duelLabels = on;
    for (const [id, txt] of Object.entries({ bA: 'FIRE', bJ: 'ROLL', bS: 'SUPER', bF: 'FLAME' })) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (on) { if (el.dataset.label === undefined) el.dataset.label = el.textContent; el.textContent = txt; } else if (el.dataset.label !== undefined) el.textContent = el.dataset.label;
    }
  }

  buildTitleMenu(sel = null) {
    const save = loadSave(), meta = loadMeta();
    // the QUEST row first (src/quests.js: Mystic Mountain, Book 1 / Dodongo's Quest, Book 3 -- each its own saves and
    // stages): ◀ ▶ on any row, or a press / tap on it, turns the book; the rows under it are that quest's
    const items = [{ get label() { return `QUEST:  ◀ ${quest().book} ▶`; }, quest: true, act: () => this.switchQuest(1) }];
    if (save) {
      const duel = save.finale !== undefined && save.finale !== null;
      const SL = levelAt(save.level);
      items.push({ label: duel ? (isMM() ? 'CONTINUE (DAWN RIDE)' : 'CONTINUE (SKY DUEL)') : save.map && isSI() ? 'CONTINUE (THE ISLAND MAP)' : SL?.secret ? `CONTINUE (${SL.name})` : `CONTINUE (STAGE ${save.level + 1})`, act: () => this.startSelect(save.players || 1, { level: save.level, checkpoint: save.checkpoint, ret: save.ret || null, bossSeen: save.bossSeen || {}, heroes: save.heroes, score: save.score, freed: save.freed, finale: duel ? save.finale : null, map: !!(save.map && isSI()) }) });
    }
    items.push({ label: '1 PLAYER', act: () => this.startSelect(1, { level: 0, fresh: true }) });
    if (!(this.coarse && !this.padsConnected())) items.push({ label: '2 PLAYERS', act: () => this.startSelect(2, { level: 0, fresh: true }) });
    for (const n of [3, 4]) if (this.seatsAvailable() >= n && n <= maxPlayers(0)) items.push({ label: `${n} PLAYERS`, act: () => this.startSelect(n, { level: 0, fresh: true }) });
    if (meta.unlocked > 1) items.push({ label: 'LEVEL SELECT', act: () => this.openLevelSelect() });
    items.push({ label: 'CONTROLS', act: () => this.setScene('controls') });
    if (ESDE) items.push({ label: 'EXIT GAME', act: () => this.askExit() });   // (back to the ES-DE menu)
    // (the cursor starts on the first row under the QUEST one: START begins the quest shown, never turns the book)
    this.menu = { items, sel: sel === null ? 1 : Math.max(0, Math.min(sel, items.length - 1)) };
  }
  /** the title's QUEST row: the next (d 1) or previous book -- its saves, stages, heroes and logo; the backdrop's stage
   * loads behind (the quest's first stage) */
  switchQuest(d = 1) {
    const i = QUEST_ORDER.indexOf(questId()), n = QUEST_ORDER.length;
    setQuest(QUEST_ORDER[(i + d + n) % n]);
    this.syncQuestUi();
    audio.music(titleTrack());   // (Book 2 has its own title music; Book 1 <-> Book 3 keep 'title': a no-op)
    // (the other book's stages: their caches given back now -- the soak kept up to ~300 MB of them alive)
    const keep = new Set([...ALL_LEVELS.map((L) => L.id), isMM() ? MM_DAWN.id : isSI() ? SI_HARBOR.id : 'sky']);
    for (const k of Object.keys(this.stages)) if (!keep.has(k)) { try { this.stages[k].stage?.release?.(); } catch (e) { console.warn(e); } delete this.stages[k]; }
    const onRow = this.menu?.items?.[this.menu.sel]?.quest;
    this.buildTitleMenu(onRow ? 0 : null);
    this.questT = this.time;
    audio.sfx('menu_select', { pitch: 1.2 });
    this.loadTitleBack();
  }
  /** the title's backdrop: the quest's first stage (the road for Dodongo's Quest), loaded in the background */
  loadTitleBack() {
    const L = levelAt(0);
    if (!L || this.stages[L.id]) return;
    this.loadStage(0).catch(() => null);
  }
  /** the stage the title, the level select, the clear and the end cards draw behind them */
  titleBack() { return this.stageOf(levelAt(0)?.id) || this.titleStage; }
  /** how many players the connected controllers can seat (up to 4): the pads, plus the keyboard's two halves on a
   * desktop, or one touch player on a tablet */
  seatsAvailable() { return Math.min(4, this.padsConnected() + (this.coarse ? 1 : 2)); }
  openLevelSelect() {
    const meta = loadMeta();
    const app = this;
    this.lsPlayers = this.lsPlayers || 1;
    this.lsPlayers = Math.min(this.lsPlayers, maxPlayers(99));
    const items = LEVELS.map((L, i) => ({ label: `STAGE ${L.num}: ${L.name}`, disabled: i >= meta.unlocked, act: i < meta.unlocked ? () => this.startSelect(this.lsPlayers, { level: i, fresh: true }) : null }));
    if (meta.cleared && !isSI()) items.push({ label: isMM() ? 'BONUS: THE DAWN RIDE' : 'FINALE: THE SKY DUEL', act: () => this.startSelect(this.lsPlayers, { level: LEVELS.length - 1, finale: 0, fresh: true, bonus: isMM() }) });
    if (isSI() && meta.unlocked >= 3) items.push({ get label() { const d = siDoubloons().length; return `SECRETS: DOUBLOONS ${d}/${DOUBLOON_LEVELS.length}   KRAKEN PAL: ${krakenPal() ? 'YES' : 'not yet'}`; }, disabled: true, act: null });   // (the secrets' tally; a hidden chest in each stage; the Cave's full calm)
    if (isSI() && treasureOpen()) { const ti = LEVELS.length + SECRET_LEVELS.findIndex((q) => q.id === 'sitreasure'); if (ti >= LEVELS.length) items.push({ label: 'BONUS: THE TREASURE ROOM', act: () => this.startSelect(this.lsPlayers, { level: ti, fresh: true, bonus: true }) }); }
    if (isSI() && meta.unlocked >= 3) items.push({ label: 'BONUS: THE STORM SEA RIDE', act: () => this.startSelect(this.lsPlayers, { level: 0, storm: true, fresh: true, bonus: true }) });   // (Skull Island: the Storm Sea ride, a replay once the Kraken is won)
    const found = progress().secrets;   // (the secret stages found: src/secrets.js; the Queen's Hollow only through the finale)
    SECRET_LEVELS.forEach((L, k) => { if ((found.includes(L.id) && !L.final) || (L.final && progress().queen)) items.push({ label: `SECRET: ${L.name}`, act: () => this.startSelect(this.lsPlayers, { level: LEVELS.length + k, fresh: true }) }); });
    if (!(this.coarse && !this.padsConnected())) {
      items.push({ get label() { return `PLAYERS: ${app.lsPlayers}`; }, act: () => { app.lsPlayers = app.lsPlayers % Math.min(maxPlayers(99), Math.max(2, app.seatsAvailable())) + 1; } });
    }
    this.menu = { items, sel: 0 };
    this.setScene('levels');
  }
  // ------------------------------------------------------------------------------------------------ ES-DE: leaving the game
  /** EXIT GAME: "Exit to the game menu?" -- NO first */
  askExit() { this.exitAsk = { sel: 0, t: 0 }; audio.sfx('menu_select'); }
  stepExitAsk() {
    const A = this.exitAsk, p = this._any.pressed;
    A.t++;
    if (p.left || p.right || p.up || p.down) { A.sel = 1 - A.sel; audio.sfx('menu_move'); }
    if (A.t > 1 && (p.confirm || p.attack)) { if (A.sel === 1) this.exitGame(); else { this.exitAsk = null; audio.sfx('menu_back'); } return; }
    if (A.t > 1 && (p.back || p.start)) { this.exitAsk = null; audio.sfx('menu_back'); }
  }
  /** leave straight away (YES, or the held SELECT + START / Esc): a short fade, then the window closes (src/esde.js) */
  exitGame() {
    if (this.exiting) return;
    this.exitAsk = null; this.exiting = { t: 0 };
    audio.pauseAll?.(true);
    setTimeout(() => exitToLauncher(), 320);
  }
  /** ES-DE: a pad's SELECT (Create / Share / View) + START (Options) held 1.5 s, or Esc held 2 s, from anywhere -- a ring
   * fills, "Exiting..." -- and the game is left with no question.  (A short press does what it always did.) */
  stepExitHold() {
    let pad = false;
    try {
      for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
        if (!gp || !gp.buttons?.[8]?.pressed) continue;
        // (SELECT held: its START is the exit combo's -- no pause, no drop-in picker under the ring)
        const c = this.input?.get?.('pad' + gp.index); if (c) c.pressed.start = false;
        this._any.pressed.start = false;
        if (gp.buttons?.[9]?.pressed) pad = true;
      }
    } catch { /* */ }
    const need = pad ? 90 : 120;
    this.exitHold = pad || this._escDown ? (this.exitHold || 0) + 1 : 0;
    this.exitNeed = need;
    if (this.exitHold >= need) { this.exitHold = 0; this.exitGame(); return true; }
    return false;
  }
  drawExit(ctx) {
    if (this.exitAsk) {
      const A = this.exitAsk;
      ctx.save(); ctx.fillStyle = 'rgba(14,8,22,0.8)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2a1d38'; HUD.roundRectPath?.(ctx, W / 2 - 230, H / 2 - 110, 460, 220, 18); if (!HUD.roundRectPath) ctx.fillRect(W / 2 - 230, H / 2 - 110, 460, 220); else ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffe066'; if (HUD.roundRectPath) ctx.stroke(); else ctx.strokeRect(W / 2 - 230, H / 2 - 110, 460, 220);
      HUD.outlined(ctx, 'Exit to the game menu?', W / 2, H / 2 - 44, 34, '#fff1d6', 'Bangers, sans-serif', 0.24, 'center');
      this._exitRows = [];
      ['NO', 'YES'].forEach((label, i) => {
        const x = W / 2 + (i ? 90 : -90), y = H / 2 + 40, on = A.sel === i;
        ctx.fillStyle = on ? '#ffe066' : 'rgba(255,241,214,0.12)';
        ctx.fillRect(x - 70, y - 30, 140, 50);
        ctx.lineWidth = 3; ctx.strokeStyle = '#21141c'; ctx.strokeRect(x - 70, y - 30, 140, 50);
        HUD.outlined(ctx, label, x, y + 8, 30, on ? '#21141c' : '#fff1d6', 'Bangers, sans-serif', on ? 0 : 0.24, 'center');
        this._exitRows.push({ i, x0: x - 70, x1: x + 70, y0: y - 30, y1: y + 20 });
      });
      ctx.restore();
    }
    if (this.exitHold > 0) {                       // the hold's ring, filling, and "Exiting..."
      const k = Math.min(1, this.exitHold / (this.exitNeed || 90)), x = W / 2, y = 120;
      ctx.save();
      ctx.fillStyle = 'rgba(14,8,22,0.55)'; ctx.beginPath(); ctx.arc(x, y, 44, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,241,214,0.25)'; ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffe066'; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      HUD.outlined(ctx, 'Exiting...', x, y + 74, 24, '#fff1d6', 'Bangers, sans-serif', 0.24, 'center');
      ctx.restore();
    }
    if (this.exiting) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.exiting.t / 16)})`; ctx.fillRect(0, 0, W, H); }
  }

  /** the pause menus (play and the sky duel).  Enter is both START and CONFIRM on the keyboard (src/input.js), so while
   * paused a confirm press (Enter, Space, J, a pad's cross / A) picks the highlighted item, and START or BACK without one
   * (Esc, P, Tab, Backspace, Options, circle / B, the corner pause button) resumes */
  pauseNav() {
    const p = this._any.pressed;
    if (!(p.confirm || p.attack) && (p.start || p.back)) { this.paused = false; audio.sfx('pause'); audio.pauseAll(false); return; }
    this.menuNav();
  }
  menuNav() {
    const p = this._any.pressed, m = this.menu;
    if (this.scene === 'title' && (p.left || p.right)) { this.switchQuest(p.right ? 1 : -1); return; }   // (the QUEST row's ◀ ▶)
    if (p.up) { m.sel = (m.sel + m.items.length - 1) % m.items.length; audio.sfx('menu_move'); }
    if (p.down) { m.sel = (m.sel + 1) % m.items.length; audio.sfx('menu_move'); }
    if (p.confirm || p.attack || p.start) {
      const it = m.items[m.sel];
      if (it && it.act && !it.disabled) { audio.sfx('menu_select'); if (isSI()) this._menuPressT = this.time; it.act(); }   // (_menuPressT: Book Two's focus pill flashes -- src/hud.js siFocus)
    }
  }

  /** the heroes' cards: the four; each holds its forms (▲▼ FORM) once a secret form of it is unlocked */
  heroIds(lvl, storm = (this.scene === 'select' && !!this.select?.then?.storm) || !!this.duel?.storm) {   // (the quest's: Mystic Mountain has no Scarlet -- src/quests.js; Skull Island's stage one offers the trio: she joins in its boss fight)
    const ids = quest().heroes.slice();
    if (!isSI() || storm) return ids;   // (the Storm Sea ride -- the level select's replay, or under way: Scarlet's aboard)
    const L = levelAt(lvl ?? (this.scene === 'select' ? this.select?.then?.level : this.levelIdx) ?? 0);
    return L && L.noScarlet ? ids.filter((h) => h !== 'scarlet') : ids;
  }
  /** a card's forms unlocked (the hero first; src/secrets.js; ?unlock=1: all of them) */
  formsOf(base) {
    const P = progress(), F = (FORMS[base] || [base]).filter((f) => formUnlocked(f, P));
    // (Mystic Mountain's summit: the player who became the dragon finds it on Dodongo's card in their CHANGE HERO -- a
    //  swap away from the dragon can be undone)
    const D = this.run?.mmDragon, s = this.join ? this.join.swap : this._swapSlot;
    if (D && s !== undefined && s === D.slot && base === 'dodongo' && !F.includes('dragon')) F.push('dragon');
    return F;
  }
  /** a secret form just unlocked in play (the shards all found, the 25th PERFECT DODGE, the 12th chest): its sign, once
   * (src/secrets.js newUnlocks / markAnnounced; hud.js drawUnlock) */
  stepUnlock() {
    const U = this.unlockToast, entrance = this.bossEntrance();
    if (U) {
      U.line = this.powerLine(U.all ? 'your hero' : HEROES[U.base]?.name);
      // (a super's cut-in, a TEAM UP! invite or a boss's entrance is on: the sign steps aside -- fades out, its time held --
      //  never over them)
      // (in a boss fight: off the boss's face box -- slid beside it, or stepped aside while no side is free: src/hud.js draws
      //  it at U.x)
      const P = this.signPlace(U);
      U.blockT = P.ok ? 0 : (U.blockT || 0) + 1; U.clearT = P.ok ? (U.clearT || 0) + 1 : 0;
      U.hide = U.hide ? U.clearT < 20 : U.blockT > 6;
      const w = this.world, away = !!(w.cutin || (w.teamWin && !w.team && w.teamOpen?.()) || entrance || U.hide);
      U.x = U.x == null || (U.vis ?? 1) < 0.05 ? P.x : U.x + (P.x - U.x) * 0.2;
      U.vis = Math.max(0, Math.min(1, (U.vis ?? 1) + (away ? -0.2 : 0.15)));
      if (!this.paused && !away && ++U.t > 330) this.unlockToast = null;
      return;
    }
    if (this.allSign) {                        // (the final level reached: ONE sign for every super form, after its intro)
      // (and never in the boss's entrance: with the boss's gate within the sign's reach -- a CONTINUE at the boss, a start
      //  near it -- it waits for the intro, the fight's first 2 s and the boss's opening line; a level start far from the
      //  gate shows it at once, long gone before the boss)
      if (this.world.cut || this.world.cutin || this.sceneT < 45 || entrance || this.bossNear()) return;
      this.allSign = null;
      this.unlockToast = { id: null, all: true, name: 'SUPER HEROES', line: this.powerLine('your hero'), base: null, t: 0 };
      audio.jingle('freed_big');
      return;
    }
    if ((this.world.frame || 0) % 30 !== 7) return;
    const nu = newUnlocks();
    if (!nu.length) return;
    markAnnounced(nu[0]);
    this.unlockToast = { id: nu[0], name: FORM_NAMES[nu[0]], base: baseOf(nu[0]), t: 0 };
    audio.jingle('freed_big');
  }
  /** a boss making its entrance: its intro (a cut), then the fight's first 2 s and the boss's opening line (Morvath's "Then
   *  you can climb...") -- once per boss; an unlock sign waits for it or steps aside (stepUnlock: never over the boss's
   *  face, never pushing its balloon down -- src/game.js fx.hudTop).  Counted once a frame, the pause holds it */
  bossEntrance() {
    const w = this.world, b = w?.boss, def = w?.L?.arenas?.[w.arenaIdx];
    if (!b || !b.alive || !(w.fighting && def?.boss)) return false;
    let S = this._bossIn;
    if (!S || S.b !== b) S = this._bossIn = { b, T: 0, quiet: 0, done: false };
    if (S.done) return false;
    if (w.cut) { S.T = S.quiet = 0; return true; }
    if (this.paused) return true;
    const talk = w.fx.list.some((q) => q.type === 'balloon' && (q.actor === b || q.villain));
    S.T++; S.quiet = talk ? 0 : S.quiet + 1;
    if ((S.T >= 120 && S.quiet >= 20) || S.T >= 900) S.done = true;
    return !S.done;
  }
  /** where an unlock sign hangs (its centre x): the middle -- in a boss fight, off the boss's face box (its head and the
   *  air over it): the middle if that's clear, else beside the face, the nearer free side (it stays on its side while that
   *  is free); { ok: false } when no side is (stepUnlock steps it aside).  U.y / U.bw: the board's y and width, src/hud.js */
  signPlace(U) {
    const w = this.world, b = w?.boss, mid = W / 2, def = w?.L?.arenas?.[w.arenaIdx];
    if (!b || !b.alive || b.gone || !(w.fighting && def?.boss) || w.cut) return { x: mid, ok: true };
    const y = U.y ?? Math.max(128, Math.max(w._hudBottom || 84, 84) + 53), bw = U.bw || 440, sy0 = y - 57, sy1 = y + 57;   // (the board 86 tall, tilted, a margin)
    const bx = b.x - w.camX, top = FLOOR_TOP + b.y - (b.z || 0) - (b.h || 160);
    const fw = Math.max(80, (b.w || 50) * 1.6), ext = Math.max(0, (b.w || 50) - 50) * 1.5, fy0 = top - 40, fy1 = top + Math.max(90, (b.h || 160) * 0.45);   // (a wide boss's head reaches forward: the Dragon King's)
    const fx0 = bx - fw - (b.facing < 0 ? ext : 0), fx1 = bx + fw + (b.facing > 0 ? ext : 0);
    if (fy1 < sy0 || fy0 > sy1 || fx1 < 0 || fx0 > W) return { x: mid, ok: true };
    const off = (x) => x + bw / 2 < fx0 || x - bw / 2 > fx1, fits = (x) => x - bw / 2 >= 48 && x + bw / 2 <= 912;
    const xs = [mid, Math.min(mid, fx0 - 12 - bw / 2), Math.max(mid, fx1 + 12 + bw / 2)].filter((x) => fits(x) && off(x));
    const cur = U.x ?? mid;
    if (!xs.length) return { x: cur, ok: false };
    xs.sort((a, c) => Math.abs(a - cur) - Math.abs(c - cur));
    return { x: xs[0], ok: true };
  }
  /** the boss's gate ahead and within the sign's reach (5.5 s at a run, ~2100 px): the sign would still be up at the gate */
  bossNear() {
    const w = this.world, L = w?.L, b = w?.boss;
    if (!b || !b.alive || !L?.arenas) return false;
    const bi = L.arenas.findIndex((a) => a.boss);
    if (bi < 0 || w.arenaIdx > bi || (w.arenaIdx === bi && w.fighting)) return false;
    return L.arenas[bi].cam - w.camX < 2100;
  }
  /** the unlock signs' second line, in a 6-year-old's words (no "FORM"): the card's ▲▼ arrows -- tapped on a touch screen
   *  (its ▲▼ pill: src/hud.js formPill), pressed on a pad or keys */
  powerLine(who) { const tap = this.lastCtrl === 'touch' || this.world?.players?.[0]?.ctrlId === 'touch'; return `${tap ? 'Tap' : 'Press'} ▲▼ on ${who || 'your hero'}'s card to power up!`; }
  /** a run has entered its book's final level (the last of the quest's stages: the summit, the Skull Palace, the Dragon
   *  King's throne -- story or level select): every super form unlocked in every book (src/secrets.js unlockAllForms);
   *  the ones new to the player get ONE sign once the level's intro is over (stepUnlock) */
  reachFinal() {
    try { const fresh = unlockAllForms(); if (fresh.length) this.allSign = { ids: fresh }; } catch (e) { console.warn(e); }
  }
  /** the hero a card shows in form k */
  formHero(base, k) { const F = this.formsOf(base); return F[Math.max(0, Math.min(k | 0, F.length - 1))]; }
  /** every secret form unlocked (the select screen's art) */
  unlockedForms() { return this.heroIds().flatMap((b) => this.formsOf(b).slice(1)); }
  /** the heroes as the cutscenes and the sky duel draw them (Dragon Dodongo's story pages show Dodongo) */
  storyHeroes() { return (this.run.heroes || []).map(storyHero); }
  /** a cutscene's cast: the party's heroes once each, P1's first (two players on one hero: one of them in the story) */
  castHeroes() { return [...new Set(this.storyHeroes())]; }
  /** a picker's x for card i of n (the in-game join / change-hero picker) */
  pickX(i, n) { return W / 2 + (i - (n - 1) / 2) * (n > 4 ? 180 : 220); }
  async startSelect(players, then) {
    this.setScene('loading');
    setArtRim(null);
    players = Math.min(players, maxPlayers(then.level));
    const ids = this.heroIds(then.level, !!then.storm);
    await useArt(selectArt(ids.flatMap((h) => this.formsOf(h).slice(1)), ids));   // the select screen shows every hero (and the forms unlocked: unlockedForms, for these cards)
    this.input?.setSplitKeyboard?.(players >= 2 && this.padsConnected() < players);   // (the keyboard's halves seat who the pads can't)
    const pre = then.heroes || [];
    this.select = {
      players, then, ready: false, ids,
      slots: Array.from({ length: players }, (_, i) => {
        const h = pre[i] || ids[i], cursor = Math.max(0, ids.indexOf(baseOf(h)));
        return { slot: i, joined: players === 1, ctrl: players === 1 ? 'any' : null, cursor, form: Math.max(0, this.formsOf(ids[cursor]).indexOf(h)), locked: false };
      }),
    };
    this.setScene('select');
  }
  updateSelect() {
    const S = this.select;
    let stepBack = !!this._selectBack; this._selectBack = false;   // (the corner button)
    // joining (2P): the first controller (other than one already in) that presses confirm takes the slot
    for (const sl of S.slots) {
      if (sl.joined) continue;
      const taken = S.slots.filter((s) => s.joined).map((s) => s.ctrl);
      const ex = [...taken, this.input?.split ? 'kb' : null].filter(Boolean);
      const c = this.input?.anyPressed?.('confirm', { exclude: ex }) || this.input?.anyPressed?.('attack', { exclude: ex });
      if (c) { sl.joined = true; sl.ctrl = c.id; audio.sfx('join_ui'); this.swallowController(c.id); }
      break;
    }
    for (const sl of S.slots) {
      if (!sl.joined) continue;
      const c = this.ctrl(sl.ctrl), p = c.pressed;
      if (!sl.locked) {
        const NH = S.ids.length;
        if (p.left) { sl.cursor = (sl.cursor + NH - 1) % NH; sl.form = 0; audio.sfx('menu_move'); this.twinPop(sl); }
        if (p.right) { sl.cursor = (sl.cursor + 1) % NH; sl.form = 0; audio.sfx('menu_move'); this.twinPop(sl); }
        const F = this.formsOf(S.ids[sl.cursor]);         // ▲▼ FORM: the card's other forms
        if (F.length > 1 && (p.up || p.down)) { sl.form = ((sl.form | 0) + (p.down ? 1 : F.length - 1)) % F.length; sl.formT = this.sceneT; audio.sfx('menu_move', { pitch: 1.35 }); }
        if (p.confirm || p.attack) { sl.locked = true; S.lockT = this.sceneT; audio.sfx('menu_select'); this.twinPop(sl); }   // (any hero: two players may pick the same one)
        if (p.back) stepBack = true;
      } else if (p.back) { sl.locked = false; audio.sfx('menu_back'); }
    }
    // BACK (Esc, Backspace, a pad's circle / B, the corner button) steps back: the last player in un-joins (or, locked,
    // unlocks); with no one joined -- or one player's select -- back to the title.  (A back from a controller not seated
    // counts too.)
    if (this._any.pressed.back && !S.slots.some((s) => s.joined && this.ctrl(s.ctrl).pressed.back)) stepBack = true;
    if (stepBack) {
      const last = [...S.slots].reverse().find((s) => s.joined);
      if (!last || S.players === 1) { this.buildTitleMenu(); this.setScene('title'); return; }
      if (last.locked) last.locked = false; else { last.joined = false; last.ctrl = null; last.form = 0; }
      audio.sfx('menu_back');
    }
    // (a CONTINUE can start with fewer players than the save had: the empty seats stay open for drop-in)
    const joinedS = S.slots.filter((s) => s.joined);
    S.ready = joinedS.length > 0 && joinedS.every((s) => s.locked) && (!S.then.fresh || joinedS.length === S.slots.length);
    // one player: a short READY beat after locking in (a second press skips it); two players: START (any player's --
    // the keyboard's P2 starts with Enter)
    const beat = S.lockT !== undefined && this.sceneT > S.lockT;
    if (S.ready && S.slots.some((s) => s.joined && this.ctrl(s.ctrl).pressed.start) && beat) { this.beginRun(); return; }
    if (S.ready && S.players === 1 && beat && (this.sceneT - S.lockT >= 45 || this.ctrl(S.slots[0].ctrl).pressed.confirm)) this.beginRun();
  }
  swallowController(id) { const c = this.ctrl(id); for (const k of ACTS) c.pressed[k] = false; }
  /** the select: a player lands on (or locks) a card another player is already on -- a "TWINS!" pop there, so a child sees
   *  it's allowed, not a mistake (src/hud.js drawSelect) */
  twinPop(sl) {
    const S = this.select;
    if (!S || S.players < 2 || !S.slots.some((o) => o !== sl && o.joined && o.cursor === sl.cursor)) return;
    if (S.twin && S.twin.i === sl.cursor && this.sceneT - S.twin.t < 40) return;   // (one pop at a time per card)
    S.twin = { i: sl.cursor, t: this.sceneT }; audio.sfx('menu_move', { pitch: 1.7 });
  }

  async beginRun() {
    const S = this.select, T = S.then, SL = S.slots.filter((s) => s.joined);   // (the seats taken: a CONTINUE may have fewer)
    this.p1devs = new Set();
    this.run = { heroes: SL.map((s) => this.formHero(S.ids[s.cursor], s.form)), ctrls: SL.map((s) => s.ctrl), players: SL.length, score: T.score || 0, freed: T.freed || 0, bossSeen: T.bossSeen || {}, bonus: !!T.bonus };
    this.world.players = this.run.heroes.map((h, i) => new Player(this.world, h, i, this.run.ctrls[i]));
    audio.jingle('portal');
    if (T.map && isSI()) { await openSiMap(this); return; }   // (CONTINUE from the island map)
    if (T.storm && isSI()) { await this.runStorm(); return; }   // (the level select's BONUS: the Storm Sea ride)
    const L = levelAt(T.level);
    if (T.finale !== undefined && T.finale !== null) {
      if (isMM()) { await this.startDawn(!!T.fresh); return; }   // (Mystic Mountain: the Dawn ride home)
      if (T.fresh) this.storyFrom('finale_a'); else await this.startDuel(T.finale); return;
    }
    if (T.fresh && L.intro) await this.playStory(L.intro, () => this.startLevel(T.level, -1));
    else await this.startLevel(T.level, T.checkpoint ?? -1, this.retOpts(T.ret));
  }

  async loadStage(lvlIdx, L = levelAt(lvlIdx), keep = null) {   // (keep: stage ids a story in progress still needs -- never dropped to make room)
    if (this.stages[L.id]) return this.stages[L.id];
    let mod = null, stage = null;
    // (time-limited: a stalled module gives up after 20 s -- the stand-in floor below -- and either way it's reported)
    try {
      mod = await Promise.race([import(L.stage), new Promise((_, rej) => setTimeout(() => rej(new Error('timed out: ' + L.stage)), 20000))]);
      stage = mod.createStage();
    } catch (e) { console.warn('stage not loaded', L.stage, e); mod = null; try { this.reportError?.(e, 'stage load ' + L.id); } catch { /* */ } }
    if (!stage) {
      // stand-in: a plain floor so the level is still playable
      stage = { setScale() {}, drawFront() {}, drawProp(ctx, kind, sx, sy) { ctx.fillStyle = '#9a6a3a'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.fillRect(sx - 22, sy - 44, 44, 44); ctx.strokeRect(sx - 22, sy - 44, 44, 44); },
        drawBack(ctx) {   // (a secret stage before its module lands: its own colours -- L.standIn [sky, horizon, floor])
          const C = L.standIn || ['#4a4058', '#4a4058', '#6a6078'];
          const g = ctx.createLinearGradient(0, 0, 0, 340); g.addColorStop(0, C[0]); g.addColorStop(1, C[1]);
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.fillStyle = C[2]; ctx.fillRect(0, 340, W, H);
          ctx.fillStyle = 'rgba(33,20,28,0.35)'; ctx.fillRect(0, 338, W, 6);
        },
        PROP_INFO: { crate: { w: 46, h: 44, colors: ['#9a6a3a'] }, barrel: { w: 40, h: 52, colors: ['#8a5a30'] }, urn: { w: 34, h: 44, colors: ['#b0704a'] } } };
    }
    // (iOS: the title's backdrops -- the road, every quest's pickups' drawer, and the quest's first stage behind its title
    //  -- let go before this stage builds its caches: held through the build they put a stage like the Kraken past the
    //  canvas memory cap (QA3 T2: ~87 MB at Skull Island's title).  Released, the road still draws the pickups; the title
    //  rebuilds its backdrop when it's shown again.  Not one a story in progress or the level in play still draws)
    if (IOS && L.id !== 'road') {
      for (const k of ['road', levelAt(0)?.id]) {
        const e = k && k !== L.id && !(keep && keep.has(k)) && this.stages[k];
        if (e && e.stage !== this.world?.stage) { try { e.stage?.release?.(); } catch (er) { console.warn(er); } }
      }
    }
    try { stage.setScale?.(this.scale); } catch (e) { console.warn('stage setScale failed', L.id, e); }
    // keep memory in check: hold at most three stages
    const keys = Object.keys(this.stages);
    if (keys.length >= 3) { const drop = keys.find((k) => k !== 'road' && k !== L.id && k !== 'sky' && k !== levelAt(0)?.id && !(keep && keep.has(k))); if (drop) { this.stages[drop].stage?.release?.(); delete this.stages[drop]; } }   // (its canvases given back now, not at GC)
    this.stages[L.id] = { mod, stage };
    return this.stages[L.id];
  }
  stageOf(id) { return this.stages[id]?.stage; }
  /** the finale's storm sky (src/stages/sky.js) for the cutscene panels */
  skyStage() {
    if (!this.stages.sky) { const stage = createSkyStage(); stage.setScale(this.scale || 1); this.stages.sky = { mod: null, stage }; }
    return this.stages.sky.stage;
  }

  async playStory(id, then) {
    if (Array.isArray(id)) {                  // (several in a row: each one written so far, then `then`)
      const rest = id.filter((k) => k && CUTSCENES[k]);
      if (!rest.length) { await then(); return; }
      await this.playStory(rest[0], () => this.playStory(rest.slice(1), then));
      return;
    }
    const def = CUTSCENES[id];
    if (!def) { await then(); return; }
    this.setScene('loading');
    if (/^si_/.test(id)) await loadSIChars();   // (the sailors and the captain in Skull Island's stories: their rigs)
    // painted panels (assets/story/) replace the live drawing; only the panels without one need their stage and cast
    releasePlates(this.plates);
    const heroes = this.castHeroes();   // (Dragon Dodongo's pages: Dodongo; each hero once)
    this.plates = await loadPlates(id, heroes, 12000);   // (a stalled plate: at most ~12 s on LOADING..., then it draws live)
    const live = livePanels(id, heroes, this.plates);
    setArtRim(null);
    await useArt(live.length ? storyArt({ pages: [{ panels: live }] }, heroes) : []);   // the cast (and the heroes): everything else is released
    const need = new Set();
    for (const pn of live) if (pn.bg?.lvl) need.add(pn.bg.lvl);
    for (const lv of need) {
      if (MM_STORY_LVL[lv] === MM_DAWN.id) await this.loadStage(-1, MM_DAWN);   // (the Dawn's valley: not a stage of the list)
      else if (lv === SI_HARBOR.id) await this.loadStage(-1, SI_HARBOR);          // (Skull Island's harbor: the prologue's backdrop)
      else if (lv === SI_MAP.id) await this.loadStage(-1, SI_MAP, need);          // (the island map: Scarlet's briefing)
      else if (lv === SI_MIRROR.id) await this.loadStage(-1, SI_MIRROR, need);    // (Malachar's mirror room)
      else if (lv === SI_SUNKEY.id) await this.loadStage(-1, SI_SUNKEY, need);    // (the three wedges fused: the Sun Key)
      else if ([SI_CAMP, SI_SUN, SI_ROADS].some((S) => S.id === lv)) await this.loadStage(-1, [SI_CAMP, SI_SUN, SI_ROADS].find((S) => S.id === lv), need);   // (the finale's: the campfire, the Palace of the Sun, the three roads)
      else if (lv !== 'sky' && lvlIdx(lv) >= 0) await this.loadStage(lvlIdx(lv));
    }
    const stages = {}; for (const lv of need) stages[lv] = lv === 'sky' ? this.skyStage() : this.stageOf(MM_STORY_LVL[lv] || SI_STORY_LVL[lv] || lv);
    this.story = new Cutscene(this, id, stages, heroes, this.plates);
    if (/^si_/.test(id) && this.run && !this.run.siSkipTold) { this.skipHint = 420; this.run.siSkipTold = true; }   // (Skull Island: the first story shows the big 'hold to skip' cue once a run)
    this.storyThen = then;
    this.setScene('story');
  }

  async startLevel(idx, checkpoint = -1, opts = {}) {
    this.setScene('loading');
    if (levelAt(idx).mm) await loadMMChars();   // (Mystic Mountain's foes' rigs / painted art: src/chars.js)
    if (levelAt(idx).si) await loadSIChars();   // (Skull Island's: the sailors' and the captain's rigs)
    const { mod, stage } = await this.loadStage(idx);
    // (iOS: the title's road backdrop isn't drawn in another level -- its caches go, so they don't count toward the canvas
    //  memory cap there; a menu that draws it rebuilds them -- src/canvasmem.js)
    if (IOS && levelAt(idx).id !== 'road') this.titleStage?.release?.();
    // (iOS: only this level's stage holds caches -- every other one, the storm sky too, released until it's shown again)
    if (IOS) for (const [k, e] of Object.entries(this.stages)) if (k !== levelAt(idx).id && k !== 'road') { try { e.stage?.release?.(); } catch (er) { console.warn(er); } }
    if (IOS) releaseFlash();                  // (the last level's hit-flash buffer, sized for its biggest flasher)
    setArtRim(mod?.SPRITE_RIM || null);       // (a level whose backdrop swallows dark outlines rims its sprites)
    await useArt(levelArt(levelAt(idx), this.run.heroes));   // the heroes in play + this level's enemies and boss
    preloadCutins(this.run.heroes, true);     // their super cut-in paintings (src/showcase.js); others released
    if (idx === LEVELS.length - 1) this.reachFinal();   // (the book's final level: every super form, every book)
    this.levelIdx = idx;
    this.world.begin(idx, stage, mod, checkpoint, opts);
    this.paused = false;
    this.setScene('play');
    if (opts.ret) this.saveProgress(idx, checkpoint, opts.ret);   // (home from a secret stage: the save point is where he came out)
    else if (checkpoint < 0 && !levelAt(idx)?.bonus) this.saveProgress(idx, -1);   // (a bonus -- the Treasure Room -- saves nothing: the CONTINUE slot stays)
  }
  /** startLevel's opts for a save point that is a secret stage's return point (ret: { x, arenaFrom }), else none */
  retOpts(ret) { return ret && ret.x ? { atX: ret.x, arenaFrom: ret.arenaFrom, ret } : {}; }
  /** RESTART FROM SAVE POINT: the last waystone -- or the point he came back out of a secret stage, past it */
  restartFromSave() {
    const w = this.world, D = this.run.mmDragon;   // (Mystic Mountain: Dodongo as himself again before the art is asked for -- src/mmworld.js)
    if (D && this.run.heroes[D.slot] === 'dragon') this.run.heroes[D.slot] = D.from;
    this.startLevel(this.levelIdx, w.checkpoint, this.retOpts(w.retPoint));
  }

  saveProgress(level, checkpoint, ret = null) {
    writeSave({ level, checkpoint, ret, heroes: this.run.heroes, players: this.run.players, score: this.run.score, freed: this.run.freed, bossSeen: this.run.bossSeen || {} });
    const meta = loadMeta();
    if (level < LEVELS.length) meta.unlocked = Math.max(meta.unlocked, level + 1);   // (a secret stage's save point unlocks no stage)
    meta.best = Math.max(meta.best, this.run.score);
    writeMeta(meta);
  }

  // ================================================================================================ the secret stages
  /** the party's health and meter, carried into / back from a secret stage */
  keepParty() { return this.world.players.map((p) => ({ hp: p.out ? p.maxHp : p.hp, meter: p.meter })); }
  /** a hidden exit taken: the iris closes, the secret stage loads (src/levels.js SECRET_LEVELS); the run goes along */
  enterSecret(id) {
    const idx = secretIdx(id);
    if (idx < 0 || this.warp) return;
    const L = levelAt(idx);
    addSecret(L.id);
    this.run.secretsVisited = [...new Set([...(this.run.secretsVisited || []), id])];
    const keep = this.keepParty();
    this.run.cpBefore = { level: this.levelIdx, cp: this.world.checkpoint ?? -1 };   // (the stage's waystone: kept for the way home)
    this.startWarp(() => this.startLevel(idx, -1, { keep }));
  }
  /** the portal home: the secret stage's story beat (if written), then the main stage just past the exit */
  leaveSecret() {
    const L = levelAt(this.levelIdx), R = L?.returnTo;
    if (!R || this.warp) return;
    const keep = this.keepParty(), B = this.run.cpBefore, cp = B && B.level === R.level ? B.cp : -1;
    // (home past the hidden exit -- the arenas already won stay won -- and that's the save point now: a waystone of its
    //  own at returnTo.x, for RESTART FROM SAVE POINT and CONTINUE; the stage's last waystone kept behind it)
    const ret = { x: R.x, arenaFrom: R.arenaFrom };
    const back = () => this.startLevel(R.level, cp, { atX: R.x, arenaFrom: R.arenaFrom, keep, ret, home: true });
    const story = 'secret_' + L.id;
    this.startWarp(() => (CUTSCENES[story] ? this.playStory(story, back) : back()));
  }
  /** an iris wipe: closes over WARP_T frames (the world held), then go(); it opens again once the next scene is up */
  startWarp(go) { this.warp = { t: 0, go, phase: 'out' }; audio.jingle('portal'); }
  stepWarp() {
    const Wp = this.warp;
    if (!Wp) return false;
    Wp.t++;
    if (Wp.phase === 'out' && Wp.t >= WARP_T) { Wp.phase = 'wait'; Wp.t = 0; Promise.resolve(Wp.go()).catch((e) => this.reportError?.(e, 'warp')); }
    else if (Wp.phase === 'wait' && (this.scene === 'play' || this.scene === 'story') && Wp.t > 2) { Wp.phase = 'in'; Wp.t = 0; }
    else if (Wp.phase === 'in' && Wp.t >= WARP_T) this.warp = null;
    else if (Wp.phase === 'wait' && Wp.t > 900) this.warp = null;     // (never stuck closed)
    return Wp.phase === 'out';
  }
  drawWarp(ctx) {
    const Wp = this.warp;
    if (!Wp) return;
    const k = Wp.phase === 'out' ? Wp.t / WARP_T : Wp.phase === 'wait' ? 1 : 1 - Wp.t / WARP_T;
    const p = this.scene === 'play' ? this.world.players.find((q) => !q.out) : null;
    const cx = p ? p.sx : W / 2, cy = p ? p.sy - 70 : H / 2, r = Math.max(0, (1 - k) * 1100);
    ctx.save();
    ctx.fillStyle = '#0d0a14'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, r, 0, Math.PI * 2, true); ctx.fill('evenodd');
    if (r > 2) { ctx.strokeStyle = 'rgba(159,231,255,0.8)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  /** the pause menu's line about this stage: its cages, its Star Shard */
  stageStatus() {
    if (this.scene !== 'play' || !this.world?.L) return '';
    const L = this.world.L, P = progress();
    const cages = this.world.things?.filter((t) => t.kind === 'cage') || [];
    const freed = cages.filter((c) => c.cageId && P.dragons.includes(c.cageId)).length;
    const sec = L.secret ? L : SECRET_LEVELS.find((S) => S.returnTo && S.returnTo.level === this.levelIdx);
    const shard = sec && sec.shard ? `Star Shard: ${P.shards.includes(sec.shard) ? 'FOUND!' : 'not found yet'}` : '';
    const dbl = isSI() && L.doubloon ? `Doubloons: ${siDoubloons().length}/${DOUBLOON_LEVELS.length}${siDoubloons().includes(L.id) ? ' (found one here!)' : ' (one is hidden in this stage)'}` : '';   // (Skull Island's island treasure: src/sisecrets.js)
    return [cages.length ? `Baby dragons here: ${freed}/${cages.length}` : '', shard, dbl].filter(Boolean).join('     ');
  }

  levelCleared() {
    const w = this.world;
    const hp = w.players.reduce((s, p) => s + (p.out ? 0 : Math.round(p.hp)), 0);
    const hpBonus = hp * 40, dragons = w.freedHere * 1000;
    this.tally = [['SCORE', this.run.score], ['HEALTH BONUS', hpBonus], ...(isMM() || isSI() ? [] : [[`WHELPS RESCUED x${w.freedHere}`, dragons]]), ['TOTAL', this.run.score + hpBonus + dragons]];   // (Book 1 has no whelps to rescue)
    if (isSI() && !w.L?.bonus) {   // (Skull Island's secrets on the clear card: the doubloons found so far, the kraken pal -- src/sisecrets.js)
      const extra = [];
      if (w.L?.doubloon) extra.push([`DOUBLOON HERE`, `${siDoubloons().includes(w.L.id) ? 'FOUND!' : 'not found'}  (${siDoubloons().length} / ${DOUBLOON_LEVELS.length})`]);
      if (w.L?.id === 'sicave') extra.push(['KRAKEN PAL', krakenPal() ? 'YES!' : 'keep it CALM!']);
      this.tally.splice(this.tally.length - 1, 0, ...extra);
    }
    this.run.score += hpBonus + dragons;
    const next = this.levelIdx + 1, L0 = levelAt(this.levelIdx);
    if (isSI() && (L0.toMap || L0.wedge)) this.siMapProgress(L0);   // (Skull Island: the Kraken opens the map; a wedge stage won is a wedge of the Sun Key)
    else if (isSI() && L0.bonus) { const meta = loadMeta(); meta.best = Math.max(meta.best, this.run.score); writeMeta(meta); }   // (the Treasure Room: a bonus -- nothing saved, nothing cleared)
    else if (next < LEVELS.length) this.saveProgress(next, -1);
    else {
      const meta = loadMeta(); if (quest().complete !== false) meta.cleared = true; meta.best = Math.max(meta.best, this.run.score); writeMeta(meta);   // (Book Two: not 'cleared' until its last stage is built)
      if (isMM()) this.saveDuel(0);   // (the summit won: a reload now goes on to the Dawn ride, not back to Morvath)
    }
    if (isSI() && L0.wedge) audio.jingle('si_wedge', { then: 'menu' });   // (Skull Island: a wedge of the Sun Key won -- the composer's stinger)
    else audio.music('menu');
    this.clearMenu = null;
    this.setScene('clear');
  }
  afterClear() {
    const next = this.levelIdx + 1;
    if (isSI()) {   // (Skull Island: each stage's outro, then the next stage's intro; past the last one built: the "to be continued" card)
      const L = levelAt(this.levelIdx);
      if (L.bonus) {   // (the Treasure Room: back to the island map when it was sailed to from there, else to the title)
        this.playStory([].concat(L.outro || []), () => (this.run.siMap ? openSiMap(this) : (audio.music(titleTrack()), this.buildTitleMenu(), this.setScene('title'))));
        return;
      }
      if (L.toMap || L.wedge) {   // (the island map: Malachar's mirror and Scarlet's briefing after the Kraken, then the map; after a wedge stage, the map again -- or the palace)
        const won = siWedges(), pal = lvlIdx('sipalace');
        const fuse = L.wedge && won.length >= SI_NODES.length ? ['si_fuse'] : [];   // (the third wedge: the three fuse, four hands, KLIK -- then the palace's way is open)
        if (fuse.length && pal >= 0) this.playStory([].concat(L.outro || [], fuse, levelAt(pal).intro || []), () => this.startLevel(pal, -1));
        else if (L.toMap) this.playStory([].concat(L.outro || []), () => openStormOffer(this, (sail) => { const go = () => this.playStory(['si_map'], () => openSiMap(this)); if (sail) this.runStorm(go); else go(); }));   // (the Storm Sea: an optional bonus ride between the Kraken and the map)
        else this.playStory([].concat(L.outro || [], fuse), () => openSiMap(this));
        return;
      }
      if (next >= LEVELS.length) this.playStory([].concat(L.outro || []), () => this.siEnd());
      else this.playStory([].concat(L.outro || [], LEVELS[next].intro || []), () => this.startLevel(next, -1));
      return;
    }
    if (isMM()) {   // (Mystic Mountain: each stage's outro, then the next stage's intro; after the summit the Dawn ride)
      const L = levelAt(this.levelIdx);
      if (next >= LEVELS.length) this.playStory([].concat(L.outro || []), () => this.startDawn(true));
      else this.playStory([].concat(L.outro || [], LEVELS[next].intro || []), () => this.startLevel(next, -1));
      return;
    }
    // keep the heroes' lives and super meter; health is full again
    if (next >= LEVELS.length) {
      const outro = levelAt(this.levelIdx).outro || 'ending';
      if (outro === 'finale') this.storyFrom('finale_a');
      else this.playStory(outro, () => { this.setScene('end'); audio.music('ending'); });
      return;
    }
    this.playStory(LEVELS[next].intro, () => this.startLevel(next, -1));
  }

  /** Skull Island's map: a stage won opens it (the Kraken) or adds its wedge (a cave, a swamp, a cell): the level select's stages open, and a CONTINUE
   * from the title goes to the map (save.map) */
  siMapProgress(L0) {
    if (L0.wedge) addWedge(L0.wedge);
    const meta = loadMeta(), wedgeIdx = LEVELS.map((q, i) => (q.wedge ? i : -1)).filter((i) => i >= 0);
    let top = Math.max(this.levelIdx, ...wedgeIdx) + 1;
    if (siWedges().length >= SI_NODES.length && lvlIdx('sipalace') >= 0) top = Math.max(top, lvlIdx('sipalace') + 1);   // (all three wedges: the Skull Palace joins the level select)
    meta.unlocked = Math.max(meta.unlocked, Math.min(16, top)); meta.best = Math.max(meta.best, this.run.score);
    writeMeta(meta);
    this.saveMap();
  }
  /** the save that CONTINUE reads as "the island map" (the level named is the first wedge stage, never started) */
  saveMap() {
    const first = Math.max(0, LEVELS.findIndex((q) => q.wedge));
    writeSave({ level: first, checkpoint: -1, ret: null, map: true, heroes: this.run.heroes, players: this.run.players, score: this.run.score, freed: this.run.freed, bossSeen: this.run.bossSeen || {} });
  }
  /** the map's pick: sail to that stage (its intro story first); the palace, not built yet, is the quest's end card */
  async siMapGo(n) {
    const idx = lvlIdx(n.level);
    if (idx < 0) { this.siEnd(); return; }
    const L = levelAt(idx);
    this.run.bossSeen = this.run.bossSeen || {};
    await this.playStory([].concat(L.intro || []), () => this.startLevel(idx, -1));
  }
  /** Skull Island, past the last stage built: its end card over the stage just played */
  siEnd() {
    this.endBack = this.stageOf(SI_ROADS.id) || this.stageOf(levelAt(this.levelIdx)?.id) || null;   // (the end card hangs over the three roads at sunset when the epilogue loaded them)
    this.setScene('end'); audio.music('siending');   // (Book 2's own warm epilogue theme: src/audio.js)
  }

  // ================================================================================================ the finale
  // (docs/FINALE.md) finale_a -> finale_b -> the sky duel -> finale_c -> finale_d -> the ending's last pages -> the end
  /** play a cutscene of the finale and everything after it ('duel' = the sky duel, 'end' = the end screen) */
  storyFrom(id) {
    // (the secret ending, docs/SECRETS.md: after the Clan's promise, every Star Shard and every baby dragon open the way
    //  to the Queen's Hollow ('hollow'); her story after the Wraith: queen_a..c, true_end, then the TRUE ENDING card)
    // (docs/SECRETS_SCRIPT.md: queen_a -- the shards point the way -- then the Hollow; queen_b .. true_end after it)
    const NEXT = { finale_a: 'finale_b', finale_b: 'duel', finale_c: 'finale_d', finale_d: 'ending', ending: 'end',
      queen_a: 'hollow', queen_b: 'queen_c', queen_c: 'true_end', true_end: 'trueEnd' };
    if (id === 'ending' && queenReady()) id = 'queen_a';
    if (id === 'duel') { this.startDuel(0); return; }
    if (id === 'hollow') { this.startHollow(); return; }
    if (id === 'end') { this.setScene('end'); audio.music('ending'); return; }
    if (id === 'trueEnd') { setQueen(); this.setScene('trueEnd'); audio.music('ending'); return; }
    if (!CUTSCENES[id]) {
      if (/^(queen_|true_end)/.test(id)) { this.storyFrom(NEXT[id]); return; }   // (the Queen's pages not written yet: on to the card)
      this.buildTitleMenu(); this.setScene('title'); audio.music(titleTrack()); return;
    }
    this.playStory(id, () => this.storyFrom(NEXT[id] || 'title'));
  }
  /** a story in the middle of a stage (Mystic Mountain's boss gates, the first wolf to re-form, the dragon -- src/mmworld.js
   * story): the world waits under it, just as it was; then the level's art comes back and play goes on (then()).  False
   * (and then() at once) when the story isn't written. */
  midStory(id, then) {
    id = [].concat(id).filter((k) => k && CUTSCENES[k]);   // (one id, or several in a row)
    if (!id.length || this.scene !== 'play') { then?.(); return false; }
    const L = levelAt(this.levelIdx), idx = this.levelIdx;
    this.paused = false; this.join = null;
    this.world.hint = null;
    this.playStory(id, async () => {
      this.setScene('loading');
      try { await useArt(levelArt(L, this.run.heroes)); } catch (e) { console.warn(e); }
      setArtRim(this.stages[L.id]?.mod?.SPRITE_RIM || null);
      if (this.levelIdx !== idx) return;      // (left the stage meanwhile)
      this.setScene('play');
      audio.music(this.world.fighting && L.arenas[this.world.arenaIdx]?.boss ? L.bossMusic : L.music);
      then?.();
    });
    return true;
  }

  // ================================================================================================ Mystic Mountain's end
  // (docs/MYSTIC_MOUNTAIN.md) the summit's outro -> mm_dawn_intro -> the Dawn ride (src/dawn.js) -> mm_dawn_outro ->
  // mm_epilogue -> the end card.  A save point at the ride (CONTINUE (DAWN RIDE)); the level select's BONUS replays it.
  /** the Dawn ride home: its story first (fresh), then the ride on the sky-duel engine */
  async startDawn(fresh = false) {
    if (!this.run?.bonus) this.saveDuel(0);   // (the BONUS replay never touches CONTINUE)
    if (fresh) { await this.playStory([].concat(MM_DAWN.intro || []), () => this.runDawn()); return; }
    await this.runDawn();
  }
  async runDawn() {
    this.setScene('loading');
    this.paused = false;
    let d = null;
    try {
      const [{ DawnRide }, { stage }] = await Promise.all([import('./dawn.js'), this.loadStage(-1, MM_DAWN)]);   // (the valley sky: src/stages/mmvalley.js)
      // (iOS: the ride draws only the valley -- every other stage's caches (the title's forest too) and the summit's
      //  hit-flash buffer go, as startLevel does for a level -- src/canvasmem.js)
      if (IOS) {
        this.titleStage?.release?.();
        for (const [k, e] of Object.entries(this.stages)) if (k !== MM_DAWN.id) { try { e.stage?.release?.(); } catch (er) { console.warn(er); } }
        releaseFlash();
      }
      stage.setColor?.(0);
      d = new DawnRide(this, { heroes: this.storyHeroes(), forms: this.run.heroes, ctrls: this.run.ctrls, players: this.run.players, stage });
      await d.load();
    } catch (e) { console.warn('dawn ride not loaded', e); d = null; }
    if (!d) { this.dawnDone(); return; }      // (no ride yet: straight on to its stories)
    this.duel = d;
    this.setScene('duel');
  }
  /** the ride's end (src/dawn.js): the quest is cleared -- the last stories, then the end card */
  dawnDone() {
    this.duel = null;
    const meta = loadMeta(); meta.cleared = true; meta.best = Math.max(meta.best, this.run.score); writeMeta(meta);
    if (!this.run.bonus) writeSave({ level: LEVELS.length - 1, checkpoint: -1, heroes: this.run.heroes, players: this.run.players, score: this.run.score, freed: this.run.freed });
    this.playStory([].concat(MM_DAWN.outro || []), async () => {
      // (the end card over the Dawn valley in full colour -- the story ends at sunrise, the colours back)
      this.setScene('loading');
      try { await this.loadStage(-1, MM_DAWN); } catch { /* (the title's backdrop then) */ }
      this.endBack = this.stageOf(MM_DAWN.id) || null;
      this.endBack?.setColor?.(1);
      this.setScene('end'); audio.music('ending');
    });
  }
  /** the Queen's Hollow: the secret final stage (src/levels.js SECRET_LEVELS 'hollow'), the run's heroes at full health */
  async startHollow() {
    // (reached from a story with no level played before -- the dev ?story= path: the run's heroes take the stage)
    if (!this.world.players.length) this.world.players = (this.run.heroes || ['dodongo']).map((h, i) => new Player(this.world, h, i, (this.run.ctrls || [])[i] || 'any'));
    await this.startLevel(secretIdx('hollow'), -1);
  }
  /** the Curse Wraith beaten and the shards home (World.stepQueenBeat): the Queen wakes -- her story, the true ending */
  queenWon() { setQueen(); this.storyFrom('queen_b'); }
  /** the sky duel from a phase (0..2): a save point at each phase's start, so a reload resumes there */
  async startDuel(phase = 0) {
    this.setScene('loading');
    this.paused = false;
    this.saveDuel(phase);
    const d = new SkyDuel(this, { phase, heroes: this.storyHeroes(), forms: this.run.heroes, ctrls: this.run.ctrls, players: this.run.players });   // (forms: the supers' own versions)
    await d.load();
    this.duel = d;
    this.setScene('duel');
  }
  saveDuel(phase) {
    writeSave({ level: LEVELS.length - 1, checkpoint: -1, finale: phase, heroes: this.run.heroes, players: this.run.players, score: this.run.score, freed: this.run.freed });
  }
  /** a boss beaten (World.onBossDefeated, the sky duel): with Shadow or Legend Shadow among `heroes`, it counts toward
   * LEGEND SHADOW -- each boss id once (src/secrets.js) */
  /** the level's art set again for the heroes in play now (the summit's dragon: a hero at once) -- in the background */
  refreshLevelArt() {
    if (this.scene !== 'play' || this.levelIdx == null || !this.run) return;
    // (Mystic Mountain's summit: the hero who became the dragon keeps their own pack too -- the dragon is that hero again
    //  at the STAGE CLEAR, its victory pose drawn at once; released here, it drew its code rig for ~2 frames there: QA N5)
    const D = this.run.mmDragon, heroes = D?.from && !this.run.heroes.includes(D.from) ? [...this.run.heroes, D.from] : this.run.heroes;
    useArt(levelArt(levelAt(this.levelIdx), heroes)).catch(() => null);
  }
  noteBossBeaten(id, heroes) { if ((heroes || []).some((h) => baseOf(h) === 'shadow')) addShadowBoss(id); }
  duelWon() {
    this.noteBossBeaten('duel', this.run.heroes);   // (the Dread King)
    this.duel = null;
    // (the finale played through: a continue goes back to the last stage, as it did before the finale)
    writeSave({ level: LEVELS.length - 1, checkpoint: -1, heroes: this.run.heroes, players: this.run.players, score: this.run.score, freed: this.run.freed });
    this.storyFrom('finale_c');
  }
  /** Skull Island's Storm Sea ride (src/stormride.js): after() when it is won (the map's story); a BONUS replay goes back to the title */
  async runStorm(after = null) {
    this.setScene('loading');
    this.paused = false;
    if (after) this._stormAfter = after;
    let d = null;
    try {
      const [{ StormRide }, { stage }] = await Promise.all([import('./stormride.js'), this.loadStage(-1, SI_STORM)]);
      if (IOS) {   // (iOS: the ride draws only the sea -- every other stage's caches go, as the Dawn ride does)
        this.titleStage?.release?.();
        for (const [k, e] of Object.entries(this.stages)) if (k !== SI_STORM.id) { try { e.stage?.release?.(); } catch (er) { console.warn(er); } }
        releaseFlash();
      }
      d = new StormRide(this, { heroes: this.storyHeroes(), forms: this.run.heroes, ctrls: this.run.ctrls, players: this.run.players, stage });
      await d.load();
    } catch (e) { console.warn('storm ride not loaded', e); d = null; }
    if (!d) { this.stormDone(); return; }      // (not loaded: straight on)
    this.duel = d;
    this.setScene('duel');
  }
  /** the ride is over (src/stormride.js): on to what came after it, or the title after a BONUS replay */
  stormDone() {
    try { this.duel?.stage?.release?.(); } catch (e) { console.warn(e); }   // (the Storm Sea's cached cloud sheets: back to iOS when the ride ends)
    this.duel = null;
    const f = this._stormAfter; this._stormAfter = null;
    if (this.run?.bonus || !f) { audio.music(titleTrack()); this.buildTitleMenu(); this.setScene('title'); return; }
    f();
  }
  stepDuel() {
    const d = this.duel;
    if (!d) return;
    if (this.paused) { this.pauseNav(); return; }   // (before the START toggle: Enter picks the highlighted item)
    const startBy = (this.run.ctrls || ['any']).some((id) => this.ctrl(id).pressed.start) || this._any.pressed.start;
    if ((startBy || this._pauseWanted) && !d.busy) {
      this._pauseWanted = false;
      this.paused = true; audio.sfx('pause'); audio.pauseAll(true);
      this.menu = { items: [
        { label: 'RESUME', act: () => { this.paused = false; audio.pauseAll(false); } },
        { label: d.dawn || d.storm ? 'RESTART THE RIDE' : 'RESTART THIS PHASE', act: () => { this.paused = false; audio.pauseAll(false); if (d.storm) this.runStorm(); else if (d.dawn) this.runDawn(); else this.startDuel(d.phase); } },
        { label: 'QUIT TO TITLE', act: () => { this.paused = false; audio.pauseAll(false); if (isSI() && d.storm) { try { d.stage?.release?.(); } catch (e) { console.warn(e); } } this.duel = null; audio.music(titleTrack()); this.buildTitleMenu(); this.setScene('title'); } },
        ...(ESDE ? [{ label: 'EXIT GAME', act: () => this.askExit() }] : []),
      ], sel: 0 };
      return;
    }
    d.update();
    if (d.won) { if (d.onWon) { const f = d.onWon; d.onWon = null; this.duel = null; f(); } else if (!d.dawn && !d.storm) this.duelWon(); }   // (the Dawn ride: main.js dawnDone; the Storm Sea ride: stormDone)
  }

  gameOver() {
    this.setScene('over');
    this.world.hint = null; delete document.body.dataset.hint;
    this.world.fx.list = this.world.fx.list.filter((q) => q.type !== 'balloon');
    audio.jingle('gameover');
  }

  // ================================================================================================ drop-in co-op
  /** P1's own device when no in-game press has named one yet (this.p1dev): a phone / tablet's touch buttons (or a touch
   *  screen P1 used last), else the keyboard -- a pad friend dropping in never rebinds a touch P1 to the keyboard (its
   *  buttons would stop moving P1, the HUD and hints would name keys: QA tech5, the iPad drop-in) */
  p1Home() { return this.coarse || this.lastCtrl === 'touch' ? 'touch' : 'kb'; }
  tryDropIn() {
    const w = this.world;
    if (w.cut || w.cutin || !w.players.length) return false;   // (no hero in play: nothing to join)
    const p1 = w.players[0];
    const p1dev = p1.ctrlId === 'any' ? (this.p1dev || this.p1Home()) : p1.ctrlId;
    const used = w.players.map((p) => (p.ctrlId === 'any' ? p1dev : p.ctrlId));
    if (p1.ctrlId === 'any') used.push(...(this.p1devs || []));   // (every device P1 has played with: its START is P1's pause)
    const c = this.input?.anyPressed?.('start', { exclude: [...used, 'touch'] });
    if (!c || !c.id.startsWith('pad')) return false;
    // (a co-op hero whose pad went: START on a pad nobody's on takes them back -- the same hero, no picker)
    const lost = w.players.find((p) => p.unplugged);
    if (lost) {
      lost.ctrlId = c.id; if (this.run.ctrls) this.run.ctrls[lost.slot] = c.id;
      this.swallowController(c.id); this._any.pressed.start = false;
      this.showToast(`P${lost.slot + 1} is back!`, 150); audio.jingle('join');
      return true;
    }
    // (Skull Island's boss fight: Scarlet has swung in -- the free seat is hers, straight in, no picker: src/siworld.js scarletSeat)
    if (w.mm?.scarletOpen && w.mm.scarletSeat?.(c.id)) { this.swallowController(c.id); this._any.pressed.start = false; return true; }
    // (the seat limit is for new heroes only -- a dropped pad's hero above comes back even to a full party)
    if (w.players.length >= maxPlayers()) { this.swallowController(c.id); this._any.pressed.start = false; return false; }
    // (every card is open -- a hero already in play too: two players may be the same hero; the cursor starts on the card
    //  after P1's, for variety)
    const ids = this.heroIds(), taken = [];
    const cursor = (Math.max(0, ids.indexOf(baseOf(p1.heroId))) + 1) % ids.length;
    this.join = { ctrl: c.id, cursor, form: 0, t: 0, taken, ids };
    setArtLazy(false);                        // (no background loads while it's open: it asks for what it draws)
    // the other heroes' small scene packs (their select / idle drawings) next to the level's set; each card is drawn
    // once its pack is decoded, never as a code rig
    useArt([...levelArt(levelAt(this.levelIdx), this.run.heroes), ...this.pickerArt(taken)]);
    this.join.p1dev = p1dev;                  // (P1 is bound to it only once the join is confirmed: a back-out leaves P1 as it was)
    this.swallowController(c.id); this._any.pressed.start = false;
    this.paused = true; audio.pauseAll(true);
    return true;
  }
  /** CHANGE HERO (pause menu): the same picker as the drop-in; the new hero warps in on the spot, meter and score kept */
  openSwap(slot) {
    const w = this.world, p = w.players[slot];
    if (!p) return;
    const ids = this.heroIds(), others = this.othersTaken(slot);   // (the partners' cards are greyed out)
    if (!this.canSwap(slot)) return;
    // (its own card first where it has another form -- a form swap; else the next free card)
    this._swapSlot = slot;                    // (formsOf: the summit dragon's form, for its own slot)
    const own = ids.indexOf(baseOf(p.heroId)), ownF = this.formsOf(ids[own]);
    this._swapSlot = undefined;
    let cursor = own, form = (ownF.indexOf(p.heroId) + 1) % ownF.length;
    if (ownF.length < 2) { do { cursor = (cursor + 1) % ids.length; } while (others.includes(ids[cursor])); form = 0; }
    this.join = { swap: slot, ctrl: p.ctrlId, cursor, form, t: 0, taken: others, ids, cur: p.heroId };
    setArtLazy(false);
    useArt([...levelArt(levelAt(this.levelIdx), this.run.heroes), ...this.pickerArt(others)]);
  }
  /** the picker's art: every card not taken, in each of its forms (their scene packs / the dragon's pack) */
  pickerArt(taken) {
    const out = [];
    for (const b of this.heroIds()) {
      if (taken.includes(b)) continue;
      out.push(b + ':scene');
      for (const f of this.formsOf(b).slice(1)) out.push(...[...selectArt([f])].filter((n) => !/_showcase$|^(dodongo|ana|shadow|scarlet):scene$/.test(n)));
    }
    return out;
  }
  /** the heroes the other players take out of a swap's picker: none (two players may be the same hero) */
  othersTaken(slot) { void slot; return []; }
  /** a swap's taken heroes: the others' (every form of their cards) and its own (a form of its card is a swap) */
  swapTaken(slot) { return [...this.othersTaken(slot), this.world.players[slot].heroId]; }
  canSwap(slot) {
    const others = this.othersTaken(slot), me = this.world.players[slot].heroId;
    return this.heroIds().some((b) => !others.includes(b) && this.formsOf(b).some((f) => f !== me));
  }
  updateJoin() {
    const J = this.join, c = this.ctrl(J.ctrl).pressed, taken = J.taken || [this.world.players[0].heroId];
    J.t++;
    const ids = J.ids || this.heroIds(), NH = ids.length;
    const step = (d) => { do { J.cursor = (J.cursor + d + NH) % NH; } while (taken.includes(ids[J.cursor])); J.form = 0; audio.sfx('menu_move'); };
    if (c.left) step(-1);
    if (c.right) step(1);
    const F = this.formsOf(ids[J.cursor]);             // ▲▼ FORM
    if (F.length > 1 && (c.up || c.down)) { J.form = ((J.form | 0) + (c.down ? 1 : F.length - 1)) % F.length; audio.sfx('menu_move', { pitch: 1.35 }); }
    if (J.warp) return;                       // warping in: waiting for the new hero's art
    const pad = J.ctrl && J.ctrl.startsWith('pad') ? this.input?.get?.(J.ctrl) : null;
    const gone = J.ctrl && J.ctrl.startsWith('pad') && (!pad || pad.active === false);   // (its pad unplugged: the picker closes)
    if (c.back || this._any.pressed.back || gone) {
      this.join = null; this.paused = false; audio.pauseAll(false); setArtLazy(true);
      useArt(levelArt(levelAt(this.levelIdx), this.run.heroes));   // (the picker's scene packs released)
      return;
    }
    if ((c.confirm || c.attack || c.start) && J.t > 5 && J.swap !== undefined) {
      const hero = this.formHero(ids[J.cursor], J.form), heroes = this.run.heroes.slice();
      if (hero === J.cur) { audio.sfx('block'); return; }   // (the same hero, the same form: nothing to change)
      heroes[J.swap] = hero;
      J.warp = hero;                          // swaps once the new hero's gameplay pack is decoded (never drawn as its rig);
      const outgoing = this.run.heroes[J.swap];   // the outgoing hero's pack stays until then (it is still drawn behind)
      useArt(levelArt(levelAt(this.levelIdx), [...heroes, outgoing])).catch(() => null).then(() => {
        if (this.join !== J) return;
        this.join = null; this.paused = false; audio.pauseAll(false);
        this.run.heroes[J.swap] = hero;
        // (the dragon's player chose another hero: that's who they are now -- run.mmDragon stays, so the dragon is still
        //  on Dodongo's card in their next CHANGE HERO: formsOf)
        this.world.swapHero(J.swap, hero);
        useArt(levelArt(levelAt(this.levelIdx), this.run.heroes)).catch(() => null);   // (now released)
        setArtLazy(true);
      });
      return;
    }
    if ((c.confirm || c.attack || c.start) && J.t > 5) {
      const hero = this.formHero(ids[J.cursor], J.form), slot = this.world.players.length;
      J.warp = hero;                          // the hero joins once its gameplay pack is decoded (never drawn as its rig)
      useArt(levelArt(levelAt(this.levelIdx), [...this.run.heroes.slice(0, slot), hero])).catch(() => null).then(() => {
        if (this.join !== J) return;
        this.join = null; this.paused = false; audio.pauseAll(false);
        const p1 = this.world.players[0];
        if (p1 && p1.ctrlId === 'any') {        // (now P1 has a device of its own -- the run's too: a touch P1 keeps the on-screen buttons in co-op)
          p1.ctrlId = J.p1dev && J.p1dev !== J.ctrl ? J.p1dev : this.p1Home();
          if (this.run.ctrls) this.run.ctrls[0] = p1.ctrlId;
          if (p1.ctrlId === 'touch' && this.padHidTouch) { this.padHidTouch = false; try { document.body.classList.add('touch'); } catch { /* (no DOM) */ } }   // (the friend's pad hid them while it picked: they're P1's)
        }
        this.run.heroes[slot] = hero; this.run.ctrls[slot] = J.ctrl; this.run.players = slot + 1;
        this.world.addPlayer(hero, J.ctrl);
        useArt(levelArt(levelAt(this.levelIdx), this.run.heroes)).catch(() => null);   // (the picker's scene packs released, as CHANGE HERO does)
        setArtLazy(true);
      });
    }
  }

  // ================================================================================================ the tick
  step() {
    this.frame++; this.time = this.frame / 60; this.sceneT++;
    this.input?.update();
    this.mergeAny();
    if (this.toast) this.toast.t++;
    if (this.exiting) { this.exiting.t++; return; }          // (ES-DE: leaving -- the fade, then the window goes)
    if (ESDE && this.stepExitHold()) return;
    if (this.exitAsk) { this.stepExitAsk(); return; }       // ("Exit to the game menu?" over everything, the world held)
    this.stepWarp();
    const pr = this._any.pressed;
    switch (this.scene) {
      case 'title': this.menuNav(); break;
      case 'levels': if (pr.back) { this.buildTitleMenu(); this.setScene('title'); } else this.menuNav(); break;
      case 'controls': if (pr.back || pr.confirm || pr.start || pr.attack) { this.buildTitleMenu(); this.setScene('title'); } break;
      case 'select': this.updateSelect(); break;
      case 'simap': stepSiMap(this); break;   // (Skull Island's map: src/simap.js)
      case 'sioffer': stepStormOffer(this); break;   // (the Storm Sea offer: src/sioffer.js)
      case 'story':
        // skipping the whole story needs a held Back (a mashing kid shouldn't lose it by accident)
        this.skipHold = (this._any.held.back || this._cornerHeld) && this.sceneT > 20 ? (this.skipHold || 0) + 1 : 0;
        if (this.skipHint > 0) this.skipHint--;
        if (this.skipHold >= 45 || this.forceSkip) { this.skipHold = 0; this.story.done = true; }
        else this.story.update(pr.confirm || pr.attack || pr.jump);
        this.forceSkip = false;
        if (this.story.done) { const then = this.storyThen; this.storyThen = null; this.story = null; releasePlates(this.plates); this.plates = null; if (then) then(); }
        break;
      case 'play': this.stepPlay(); break;
      case 'duel': this.stepDuel(); break;
      case 'over':
        this.world.fx.update();
        if ((pr.start || pr.confirm || pr.attack) && this.sceneT > 40) {
          audio.jingle('continue', { then: this.world.fighting && this.world.L.arenas[this.world.arenaIdx]?.boss ? this.world.L.bossMusic : this.world.L.music });
          for (const p of this.world.players) { p.lives = 2; p.out = false; p.alive = true; p.warpIn(clamp(p.x, this.world.camX + 60, this.world.camX + W - 60), p.y); }
          this.scene = 'play';
        }
        break;
      case 'clear':
        if (this.sceneT > 50 + (this.tally?.length || 0) * 30 + 30) {
          if (!this.clearMenu) {
            const last = this.levelIdx + 1 >= LEVELS.length;
            this.clearMenu = this.menu = { items: [{ label: last ? 'CONTINUE' : 'NEXT STAGE', act: () => { this.clearMenu = null; this.afterClear(); } },
              { label: 'LEVEL SELECT', act: () => { this.clearMenu = null; audio.music(titleTrack()); this.openLevelSelect(); } }], sel: 0 };
            this.swallowInput();
          } else this.menuNav();
        }
        break;
      case 'end': case 'trueEnd':
        if ((pr.confirm || pr.start || pr.attack) && this.sceneT > 90) { this.buildTitleMenu(); this.setScene('title'); audio.music(titleTrack()); }
        break;
    }
  }

  stepPlay() {
    const w = this.world;
    this.stepUnlock();
    if (this.warp && this.warp.phase === 'out') return;   // (the iris closing: the world held)
    if (this.join) { this.updateJoin(); return; }
    // a player out of lives presses START: they come back (only if the other hero is still going)
    if (this.paused) { this.pauseNav(); return; }   // (before the START toggle: Enter picks the highlighted item)
    for (const p of w.players) if (p.out && !w.cutin && this.ctrl(p.ctrlId).pressed.start && w.livePlayers.length) { w.continuePlayer(p); this.swallowController(p.ctrlId); }
    if (this.tryDropIn()) return;
    const startBy = w.players.find((p) => !p.out && this.ctrl(p.ctrlId).pressed.start);
    const hid = this._pauseWanted && !w.cutin && !this.warp;   // (the tab was hidden: pause now -- an intro too)
    if ((startBy && !w.cut && !w.cutin) || hid) {             // (during a super cut-in, start skips it: game.js)
      this._pauseWanted = false;
      this.paused = true; audio.sfx('pause'); audio.pauseAll(true);
      this.menu = { items: [
        { label: 'RESUME', act: () => { this.paused = false; audio.pauseAll(false); } },
        ...w.players.map((p, i) => (this.canSwap(i) ? { label: w.players.length > 1 ? `CHANGE HERO (P${i + 1})` : 'CHANGE HERO', act: () => this.openSwap(i) } : null)).filter(Boolean),
        { label: 'RESTART FROM SAVE POINT', act: () => { this.paused = false; audio.pauseAll(false); this.restartFromSave(); } },
        ...(loadMeta().unlocked > 1 ? [{ label: 'LEVEL SELECT', act: () => { this.paused = false; audio.pauseAll(false); audio.music(titleTrack()); this.openLevelSelect(); } }] : []),
        { label: 'QUIT TO TITLE', act: () => { this.paused = false; audio.pauseAll(false); audio.music(titleTrack()); this.buildTitleMenu(); this.setScene('title'); } },
        ...(ESDE ? [{ label: 'EXIT GAME', act: () => this.askExit() }] : []),
      ], sel: 0 };
      return;
    }
    w.update();
  }

  // ================================================================================================ render
  render() {
    const playing = (this.scene === 'play' && !this.paused && !(this.world.cut && this.world.cut.kind !== 'intro')) || (this.scene === 'duel' && !this.paused);
    if (playing !== this._playingClass) { this._playingClass = playing; document.body.classList.toggle('playing', playing); }
    // the stick's half of the screen is the stick only in play: in a menu, the hero select, the picker, the pause menu,
    // the level select or a story it's off -- a tap there goes to the row or the card under it
    const stickOn = (this.scene === 'play' && !this.paused && !this.join) || (this.scene === 'duel' && !this.paused);
    if (stickOn !== this._stickOn) {
      this._stickOn = stickOn;
      const z = typeof document !== 'undefined' && document.getElementById('stickzone');
      if (z) z.style.pointerEvents = stickOn ? '' : 'none';
      if (!stickOn) this.input?.releaseStick?.();
    }
    this._menuRows = null;                                    // (menuList: this frame's rows)
    // the DODGE touch button dims while its player's dodge cools down (the touch player's; one player: P1)
    const ps = this.scene === 'play' ? this.world.players : [];
    const p1 = ps.find((q) => q.ctrlId === 'touch') || (ps.length === 1 ? ps[0] : null), cd = !!(p1 && (p1.dodgeCd > 0 || p1.state === 'dodge'));
    if (cd !== this._dodgeCdClass) { this._dodgeCdClass = cd; document.body.classList.toggle('dodgecd', cd); }
    const story = this.scene === 'story';
    if (story !== this._storyClass) { this._storyClass = story; document.body.classList.toggle('story', story); }
    const ctx = this.ctx, s = this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0a14'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    switch (this.scene) {
      case 'boot': case 'loading': HUD.drawLoading(ctx, this); break;
      case 'title': HUD.drawTitle(ctx, this); break;
      case 'levels': HUD.drawLevelSelect(ctx, this); break;
      case 'controls': HUD.drawControls(ctx, this); break;
      case 'select': HUD.drawSelect(ctx, this); break;
      case 'story': this.story?.draw(ctx); break;
      case 'simap': drawSiMap(ctx, this); break;
      case 'sioffer': drawStormOffer(ctx, this); break;
      case 'clear': HUD.drawClear(ctx, this); break;
      case 'duel': this.duel?.draw(ctx); if (this.paused) HUD.drawPause(ctx, this); break;
      case 'end': HUD.drawEnd(ctx, this); break;
      case 'trueEnd': HUD.drawTrueEnd(ctx, this); break;
      case 'play': case 'over':
        this.world.render(ctx);
        if (this.scene === 'over') HUD.drawGameOver(ctx, this);
        if (this.unlockToast && this.scene === 'play') HUD.drawUnlock(ctx, this);
        if (this.paused && !this.join) HUD.drawPause(ctx, this);
        if (this.join) this.drawJoin(ctx);
        break;
    }
    this.drawWarp(ctx);
    if (isSI()) drawSiVeil(ctx, this);   // (Skull Island's scene veil: src/siveil.js)
    else drawSceneVeil(ctx, this);   // (Books 1 / 3's: src/sceneveil.js -- over everything, the unlock sign too)
    if (this.exitAsk || this.exitHold > 0 || this.exiting) this.drawExit(ctx);
    ctx.restore();
  }
  /** Mystic Mountain: the LOADING card's dark (#1b1426, src/hud.js drawLoading) over the play, easing off over MM_LIFT frames */
  drawMMLift(ctx) {
    const t = this.frame - this.mmLift;
    if (t >= MM_LIFT || this.scene !== 'play') { this.mmLift = null; return; }
    const a = 1 - t / MM_LIFT;
    ctx.fillStyle = `rgba(27,20,38,${a.toFixed(3)})`; ctx.fillRect(0, 0, W, H);
  }
  drawJoin(ctx) {
    const J = this.join;
    ctx.fillStyle = 'rgba(20,14,30,0.88)'; ctx.fillRect(0, 0, W, H);   // (the picker over the play: dimmed well back)
    const swap = J.swap !== undefined, takenIds = J.taken || [this.world.players[0].heroId];
    const title = swap ? (this.world.players.length > 1 ? `PLAYER ${J.swap + 1}: CHANGE HERO` : 'CHANGE HERO') : `PLAYER ${this.world.players.length + 1}: CHOOSE A HERO`;
    HUD.outlined(ctx, title, W / 2, 110, 40, '#8fe0ff', '"Luckiest Guy", Bangers, sans-serif', 0.15, 'center');
    const ids = J.ids || this.heroIds();
    ids.forEach((base, i) => {
      const x = this.pickX(i, ids.length), taken = takenIds.includes(base) && !(swap && base === baseOf(J.cur));
      const F = this.formsOf(base), id = J.cursor === i ? this.formHero(base, J.form) : swap && base === baseOf(J.cur) ? J.cur : base;
      ctx.globalAlpha = taken ? 0.35 : 1;
      ctx.save(); ctx.translate(x, 380);
      const art = CHARS[HEROES[id].art]; const A = art?.ANIM || {};
      let f = J.cursor === i ? (A.select || A.idle) : A.idle;
      const need = id === 'dragon' ? ['dodongo_dragon'] : [baseOf(id) + ':scene', ...(HEROES[id].form ? [HEROES[id].art + ':scene'] : [])];
      if (artResident(need)) art?.draw(ctx, typeof f === 'function' ? f(this.time + i) : f || {}, { facing: 1, t: this.time + i, scale: 1.2, mem: this.selMem['j' + i] || (this.selMem['j' + i] = {}), vel: { x: 0, y: 0, z: 0 } });
      else HUD.outlined(ctx, '...', 0, -60, 30, '#fff1d6', 'Bangers, sans-serif', 0.24, 'center');   // (its art still decoding)
      ctx.restore();
      const nm = HEROES[id].name;
      HUD.outlined(ctx, nm, x, 420, nm.length > 12 ? 19 : 26, J.cursor === i ? '#ffe066' : '#fff1d6', 'Bangers, sans-serif', 0.24, 'center');
      if (F.length > 1 && !taken) HUD.formPill(ctx, x, 222, J.cursor === i, F.indexOf(id), F.length);
      ctx.globalAlpha = 1;
    });
    const tap = this.lastCtrl === 'touch' && (J.ctrl === 'any' || J.ctrl === 'touch');
    const forms = ids.some((b) => this.formsOf(b).length > 1);
    HUD.outlined(ctx, J.warp ? 'WARPING IN...' : tap ? `tap a hero, tap again to warp in!${forms ? '   tap ▲▼ for a form' : ''}   II = back`
      : `◀ ▶ choose   ${forms ? '▲ ▼ form   ' : ''}${this.glyphText('confirm', J.ctrl)} warp in!   ${this.glyphText('back', J.ctrl)} back`, W / 2, 480, 24, '#fff', 'Bangers, sans-serif', 0.24, 'center');
  }

  /** the corner buttons (mute, pause, full screen) where they reach over the canvas, in game px: { x0, y1 } -- their
   * left and bottom edges with a little air -- or null when they sit in the letterbox.  The HUD keeps clear of it
   * (src/hud.js hudLayout).  Measured at most 4x a second, and again after a resize */
  cornerBox() {
    const now = performance.now();
    if (this._cornerAt && now - this._cornerAt < 250) return this._corner;
    this._cornerAt = now; this._corner = null;
    if (this._padUi) return null;   // (a gamepad playing: the buttons are faded out -- nothing to keep clear of)
    try {
      const el = document.getElementById('corner'), cv = this.canvas;
      const r = el?.getBoundingClientRect(), c = cv?.getBoundingClientRect();
      if (r && c && r.width && c.width) {
        const k = W / c.width, x0 = (r.left - c.left) * k, y1 = (r.bottom - c.top) * k;
        if (y1 > 0 && x0 < W && (r.right - c.left) * k > 0) this._corner = { x0: x0 - 6, y1: y1 + 4 };
      }
    } catch { /* (no DOM) */ }
    return this._corner;
  }
  /** the body's book class: Book Two's own corner-button rules (index.html body.si) */
  syncQuestUi() { try { document.body.classList.toggle('si', isSI()); } catch { /* (no DOM) */ } this._cornerAt = 0; }
  /** the corner buttons fade out while a gamepad plays (START pauses) and come back on a mouse or a touch -- every book */
  padUi(on) {
    on = !!on;
    if (on === !!this._padUi) return;
    this._padUi = on; this._cornerAt = 0;   // (cornerBox: measured again -- the HUD and the story page take the room back)
    try { document.body.classList.toggle('padui', on); } catch { /* (no DOM) */ }
  }
  resize() {
    this._cornerAt = 0;
    const vw = innerWidth, vh = innerHeight;
    const k = Math.min(vw / W, vh / H);
    const cw = Math.floor(W * k), ch = Math.floor(H * k);
    const dpr = Math.min(devicePixelRatio || 1, 2.5);
    // backing store capped (a full-screen 4K TV at DPR 1 stays at 1920 wide); unchanged up to 1920 css px at DPR 2
    const f = Math.min(dpr, 1920 * Math.min(dpr, 2) / cw);
    this.canvas.style.width = cw + 'px'; this.canvas.style.height = ch + 'px';
    this.canvas.width = Math.round(cw * f); this.canvas.height = Math.round(ch * f);
    this.scale = this.canvas.width / W;
    setArtScale(this.scale);   // (device px per game px: the sprite atlases' scale wants -- src/artplan.js; a change re-plans the set)
    for (const k2 in this.stages) { try { this.stages[k2].stage?.setScale?.(this.scale); } catch (e) { console.warn(e); } }
    // (the balloons' text a little bigger where the game is drawn small on screen -- a phone: its CSS size, not the
    //  backing store's, which a DPR of 3 makes big)
    const css = cw / W;
    this.world.fx.uiScale = css < 0.9 ? Math.min(1.45, 0.95 / css) : 1;
  }
}

// ================================================================================================ boot
async function boot() {
  const canvas = document.getElementById('game');
  const app = new App(canvas);
  window.DQ = app;
  app.resize();
  const tryImport = async (p) => { try { return await import(p); } catch (e) { console.warn('could not load', p, e); return null; } };
  initQuest();                              // (the quest last chosen on the title, or ?quest=mm|dq: src/quests.js)
  setArtManaged(true);                      // atlas pages decode per scene (useArt), not when a module loads
  // the title art loads alongside the modules, fonts and select loops (it waited for them: ~0.3 s at 50 Mbps); the
  // title still shows only once all of it is in
  const names = { portrait_dodongo: 'portrait_dod.png', portrait_ana: 'portrait_ana.png', portrait_shadow: 'portrait_sha.png', portrait_scarlet: 'portrait_sca.png', title: 'title_dod.jpg', title_ana: 'title_ana.jpg', title_sha: 'title_sha.jpg', title_sca: 'title_sca.jpg' };
  const titleArt = Promise.all(Object.entries(names).map(async ([k, f]) => { app.img[k] = await loadImage('assets/art/' + f); }));
  const [audioMod] = await Promise.all([tryImport('./audio.js'), loadChars(), loadFonts(), loadShowcase(), titleArt]);
  if (audioMod) setAudio(audioMod.audio || audioMod.default);
  if (ESDE) {   // (ES-DE: the launcher lets audio autoplay -- the title music starts without a tap; Esc held: leaving)
    try { audio.unlock(); } catch { /* */ }
    addEventListener('keydown', (e) => { if (e.code === 'Escape') app._escDown = true; });
    addEventListener('keyup', (e) => { if (e.code === 'Escape') app._escDown = false; });
    addEventListener('blur', () => { app._escDown = false; });
  }
  // (?mute: this session only -- a tester's link must not leave the family iPad muted; the stored choice is put back,
  //  and the M key / the mute button still save theirs)
  if (Q.has('mute')) {
    let kept = null; try { kept = localStorage.getItem('dq.muted'); } catch { /* storage blocked */ }
    audio.setMuted(true);
    try { if (kept === null) localStorage.removeItem('dq.muted'); else localStorage.setItem('dq.muted', kept); } catch { /* storage blocked */ }
  }
  // (the road: the title's backdrop for Dodongo's Quest, and every quest's pickups' drawer -- src/actors.js Pickup)
  await app.loadStage(-1, DQ_LEVELS[0]);
  app.titleStage = app.stageOf('road');
  if (isMM() || isSI()) await app.loadStage(0);   // (Mystic Mountain's / Skull Island's title: its first stage behind it)

  addEventListener('resize', () => app.resize());
  app.syncQuestUi();
  // a tablet or phone held upright: a gentle "turn it sideways" note over the top (never blocking a tap)
  const turnTip = document.createElement('div');
  turnTip.id = 'turnTip';
  turnTip.textContent = '↻  Turn your iPad sideways for the best view!';
  turnTip.style.cssText = 'position:fixed;left:50%;top:max(14px,env(safe-area-inset-top));transform:translateX(-50%);z-index:8;pointer-events:none;'
    + 'padding:10px 18px;border-radius:14px;border:3px solid #21141c;background:#fff6e0;color:#21141c;font:700 17px system-ui,sans-serif;'
    + 'box-shadow:0 5px 0 rgba(0,0,0,.3);white-space:nowrap;display:none';
  document.body.appendChild(turnTip);
  const syncTurn = () => {
    const upright = innerHeight > innerWidth * 1.08 && (document.body.classList.contains('touch') || app.coarse);
    turnTip.textContent = /iPad|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1 ? '↻  Turn your iPad sideways for the best view!' : '↻  Turn your screen sideways for the best view!';
    turnTip.style.display = upright ? 'block' : 'none';
  };
  addEventListener('resize', syncTurn); addEventListener('orientationchange', syncTurn); syncTurn();
  const touchRoot = document.getElementById('touch');
  if (touchRoot && app.input?.bindTouch) {
    app.input.bindTouch(touchRoot);
    if (app.touch) document.body.classList.add('touch');
    // a gamepad on a touch device (a TV: the iPad mirrored, or a laptop): the overlay goes -- and the canvas re-centres --
    // as soon as a pad is used, and comes back on the next touch.  It stays while a player in a 2-player run is on touch.
    const touchPlayer = () => (app.run?.players || 1) > 1 && (app.run.ctrls || []).some((c) => c === 'touch');
    app.input.onPress?.((a, id) => {
      if (!id || !id.startsWith('pad') || !document.body.classList.contains('touch') || touchPlayer()) return;
      document.body.classList.remove('touch'); app.padHidTouch = true;
    });
    addEventListener('touchstart', () => {
      if (!app.touch || app.padHidTouch) { app.touch = true; app.padHidTouch = false; document.body.classList.add('touch'); app.lastCtrl = 'touch'; }
    }, { passive: true });
  }
  app.input?.onConnection?.((e) => {
    if (e.type === 'connected') { app.showToast(`🎮 ${e.name || e.kind} connected`); audio.sfx('controller_connected'); }
    else app.showToast(`🎮 controller disconnected`);
    if (app.scene === 'title') { const s = app.menu?.sel || 0; app.buildTitleMenu(); app.menu.sel = Math.min(s, app.menu.items.length - 1); }
  });
  app.input?.onPress?.(() => audio.unlock());
  // (every book: a gamepad's press fades the corner buttons; a mouse that really moves (a few px from where it last was --
  //  not the synthetic moves a browser sends when the page changes under a resting pointer), or any touch / click, brings
  //  them back, so a TV with a pad and a mouse lying still keeps them gone)
  app.input?.onPress?.((a, id) => { if (id && id.startsWith('pad')) app.padUi(true); });
  let mouseAt = null;
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const moved = mouseAt && Math.abs(e.clientX - mouseAt[0]) + Math.abs(e.clientY - mouseAt[1]) > 3;
    mouseAt = [e.clientX, e.clientY];
    if (moved && app._padUi) app.padUi(false);
  }, { passive: true });
  addEventListener('pointerdown', () => { if (app._padUi) app.padUi(false); }, { passive: true });
  addEventListener('keydown', () => audio.unlock());
  addEventListener('pointerdown', (e) => {
    audio.unlock();
    if (e.target.closest && e.target.closest('#corner, #pads')) return;
    // (the stick's half of the screen: the stick -- except a tap on a card's ▲▼ FORM pill, the select's or the picker's)
    const stick = !!(e.target.closest && e.target.closest('#stickzone'));
    if (stick && !(app.scene === 'select' || (app.scene === 'play' && app.join))) return;
    // menus and cards: a tap counts as confirm (on the hero cards, the first tap picks the card)
    if (app.scene !== 'play' || app.paused || app.join) {
      app._tap = true; app._tapStick = stick;
      const r = canvas.getBoundingClientRect();
      app._tapAt = { x: (e.clientX - r.left) / r.width * 960, y: (e.clientY - r.top) / r.height * 540 };
    }
  });
  addEventListener('keydown', (e) => { if (e.code === 'KeyM') { audio.unlock(); audio.setMuted(!audio.muted); syncMute(); } });
  const muteBtn = document.getElementById('mute');
  const syncMute = () => { if (muteBtn) muteBtn.classList.toggle('off', audio.muted); };
  muteBtn?.addEventListener('click', () => { audio.unlock(); audio.setMuted(!audio.muted); syncMute(); });
  document.getElementById('pauseBtn')?.addEventListener('pointerdown', (e) => { e.preventDefault(); app._pauseTap = true; app._cornerHeld = true; });
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { app._cornerHeld = false; });   // (held: a story's / a boss intro's skip)
  syncMute();
  document.addEventListener('visibilitychange', () => {
    // (the tab hidden in play or the duel: a pause -- queued through a super's cut-in, the iris, an intro; stepPlay)
    if (document.hidden && (app.scene === 'play' || app.scene === 'duel') && !app.paused) app._pauseWanted = true;
  });

  // taps on menus become a confirm press; the corner pause button is a START press.  Installed ONCE: this tick's tap
  // and pause wait in app._tickTap / app._tickPause.  (It used to re-bind app.mergeAny every tick: after N ticks a
  // chain of N bound functions, which WebKit -- every browser on an iPad -- walks recursively; after ~30 min of play
  // mergeAny() overflowed the stack on every tick and the world froze while the HUD kept blinking.)
  const baseStep = app.step.bind(app), baseMerge = app.mergeAny.bind(app);
  app._tickTap = false; app._tickPause = false;
  app.mergeAny = () => {
    baseMerge();
    if (app._tickTap) {
      app._any.pressed.confirm = true;
      // (the touch player's own hero picker -- CHANGE HERO once a pad has dropped in, P1 on 'touch' -- reads the touch
      //  controller: the tap's confirm goes there too.  A pad's picker never takes a tap.)
      if (app.scene === 'play' && app.join && app.join.ctrl === 'touch') app.ctrl('touch').pressed.confirm = true;
    }
    if (app._tickPause) {
      if (app.scene === 'play' && app.join) { app._any.pressed.back = true; app.ctrl(app.join.ctrl).pressed.back = true; }   // (the hero picker: back)
      else if (app.scene === 'play' || app.scene === 'duel') { app._any.pressed.start = true; if (app.scene === 'play' && app.world.players[0]) app.ctrl(app.world.players[0].ctrlId).pressed.start = true; }
      else if (app.scene === 'story') app.skipHint = 150;   // (a tap: "hold to skip" -- a held corner button skips, as a held Esc)
      else if (app.scene === 'select') app._selectBack = true;   // (the hero select: one step back -- updateSelect)
      else app._any.pressed.back = true;
    }
  };
  app.step = () => {
    let tap = app._tap; const pauseTap = app._pauseTap, at = app._tapAt, fromStick = app._tapStick;
    app._tap = false; app._pauseTap = false; app._tapAt = null; app._tapStick = false;
    if (tap && at && app.exitAsk && app._exitRows) {   // ("Exit to the game menu?": a tap on YES / NO picks it)
      const r = app._exitRows.find((q) => at.x >= q.x0 && at.x <= q.x1 && at.y >= q.y0 && at.y <= q.y1);
      if (r) app.exitAsk.sel = r.i; else tap = false;
    }
    // a menu (the title, the level select, a pause menu): a tap on a row picks that row; off the rows, nothing
    if (tap && at && !app.exitAsk && app._menuRows && app.menu && (app.scene === 'title' || app.scene === 'levels' || app.scene === 'sioffer' || ((app.scene === 'play' || app.scene === 'duel') && app.paused && !app.join))) {
      const r = app._menuRows.find((q) => at.x >= q.x0 && at.x <= q.x1 && at.y >= q.y0 && at.y <= q.y1);
      if (r && !app.menu.items[r.i]?.disabled) { if (app.menu.sel !== r.i) audio.sfx('menu_move'); app.menu.sel = r.i; }
      else tap = false;
    }
    if (tap && at && app.scene === 'simap') { if (!simapTap(app, at)) tap = false; }   // (Skull Island's map: a tap on a spot moves the ship there; a second tap sails)
    if (tap && at && app.scene === 'select' && app.select) {
      const S = app.select, n = S.ids.length, i = S.ids.map((_, k) => k).find((k) => at.x >= HUD.cardX(k, n) && at.x <= HUD.cardX(k, n) + HUD.cardW(n) && at.y >= 96 && at.y <= 428);
      const sl = S.slots.find((s) => s.joined && !s.locked);
      const pill = i !== undefined && (() => { const P = HUD.formPillAt(i, n); return HUD.formPillHit(at, P.x, P.y); })();
      if (i !== undefined && sl && pill && app.formsOf(S.ids[i]).length > 1) {   // (the ▲▼ FORM pill: the next form)
        if (sl.cursor !== i) { sl.cursor = i; sl.form = 0; }
        sl.form = ((sl.form | 0) + 1) % app.formsOf(S.ids[i]).length; sl.formT = app.sceneT; audio.sfx('menu_move', { pitch: 1.35 }); tap = false;
      } else if (fromStick) tap = false;                      // (anywhere else on the stick's half: the stick)
      else if (i !== undefined && sl && sl.cursor !== i) { sl.cursor = i; sl.form = 0; audio.sfx('menu_move'); app.twinPop(sl); tap = false; }
    }
    if (tap && at && app.scene === 'play' && app.join && (app.join.ctrl || '').startsWith('pad')) tap = false;   // (a pad's picker: the pad picks)
    if (tap && at && app.scene === 'play' && app.join) {     // the in-game hero picker: tap a card to pick it, tap it again to go
      const J = app.join, ids = J.ids || app.heroIds(), i = ids.findIndex((_, k) => Math.abs(at.x - app.pickX(k, ids.length)) <= 88 && at.y >= 206 && at.y <= 440);
      const own = J.swap !== undefined && i >= 0 && ids[i] === baseOf(J.cur);
      const free = i >= 0 && (own || !(J.taken || [app.world.players[0].heroId]).includes(ids[i]));
      const pill = i >= 0 && HUD.formPillHit(at, app.pickX(i, ids.length), 222) && app.formsOf(ids[i]).length > 1;
      if (fromStick && !pill) tap = false;               // (the stick's half: the stick, but the ▲▼ FORM pill)
      else if (i < 0) { /* a tap off the cards: warp in (the stick chose the card) */ }
      else if (!free) tap = false;
      else if (pill) { if (J.cursor !== i) { J.cursor = i; J.form = 0; } J.form = ((J.form | 0) + 1) % app.formsOf(ids[i]).length; audio.sfx('menu_move', { pitch: 1.35 }); tap = false; }
      else if (J.cursor !== i) { J.cursor = i; J.form = 0; audio.sfx('menu_move'); tap = false; }
    }
    app._tickTap = tap; app._tickPause = pauseTap;
    try { baseStep(); } finally { app._tickTap = false; app._tickPause = false; }   // (a throw never replays a stale tap)
  };

  try { migrateMeta(); } catch { /* (no storage) */ }
  // (a save already at a book's final level -- its level select reaches it, or the book is cleared: the super forms are
  //  its own, every book's; a toast on the title the first time)
  try {
    const LAST = { dq: DQ_LEVELS.length, mm: MM_LEVELS.length, si: SI_LEVELS.length };
    const there = Object.entries(META_KEYS).some(([q, k]) => { const m = loadMeta(k); return m.cleared === true || (m.unlocked | 0) >= LAST[q]; });
    if (there && unlockAllForms().length) app.toast = { text: '★ SUPER HEROES UNLOCKED! ★', sub: app.powerLine('your hero'), t: 0, life: 420, boot: true };   // (two lines: src/hud.js drawToast -- it goes when the title does)
  } catch (e) { console.warn(e); }
  // (a save naming a level or heroes that don't exist: mended, or dropped -- no CONTINUE that hangs or a NaN King)
  setSaveCheck((s) => {
    if (s.level >= LEVELS.length + SECRET_LEVELS.length) return null;
    s.heroes = (Array.isArray(s.heroes) ? s.heroes : []).filter((h) => typeof h === 'string' && HEROES[h] && quest().heroes.includes(baseOf(h))).slice(0, quest().maxPlayers);
    if (!s.heroes.length) s.heroes = ['dodongo'];
    s.players = Number.isInteger(s.players) ? Math.max(1, Math.min(s.heroes.length, s.players)) : s.heroes.length;
    if (s.finale !== undefined && s.finale !== null && s.level !== LEVELS.length - 1) s.finale = null;
    // (a secret stage's return point: none in a quest without secret stages (Mystic Mountain); else kept inside its level)
    if (s.ret) {
      const L = levelAt(s.level);
      if (!SECRET_LEVELS.length || !L || !L.arenas) s.ret = null;
      else { s.ret.x = Math.min(s.ret.x, Math.max(1, (L.len || 6000) - 400)); s.ret.arenaFrom = Math.min(s.ret.arenaFrom, Math.max(0, L.arenas.length - 1)); }
    }
    return s;
  });
  app.buildTitleMenu();
  app.setScene('title');
  audio.music(titleTrack());
  // test / debug entry points: ?level=2&heroes=ana,shadow&cp=0  or  ?x=5300
  const storyId = Q.get('story');
  if (Q.has('skyduel') || Q.has('storm') || (storyId && CUTSCENES[storyId]) || Q.has('simap')) {
    const heroes = (Q.get('heroes') || 'dodongo').split(',').filter((h) => HEROES[h]).slice(0, quest().maxPlayers);
    app.run = { heroes, ctrls: testCtrls(heroes.length), players: heroes.length, score: 0, freed: 0 };
    if (heroes.length > 1) app.input?.setSplitKeyboard?.(true);
    if (Q.has('simap') && isSI()) {   // (the players too, as ?level builds them: sailing on to a stage needs them -- src/sirage.js)
      if (Q.has('wedges')) { const m = loadMeta(); m.wedges = (Q.get('wedges') || '').split(',').filter(Boolean); writeMeta(m); }
      app.world.players = heroes.map((h, i) => new Player(app.world, h, i, app.run.ctrls[i]));
      await openSiMap(app);
    }
    else if (Q.has('skyduel') && isMM()) await app.runDawn();
    else if ((Q.has('storm') || Q.has('skyduel')) && isSI()) await app.runStorm();   // (?quest=si&storm: the Storm Sea ride)   // (?quest=mm&skyduel: the Dawn ride)
    else if (Q.has('skyduel')) await app.startDuel(Math.max(0, Math.min(2, +(Q.get('phase') || 0))));
    else app.storyFrom(storyId);
  } else if (Q.has('level') || Q.has('skip') || Q.has('x')) {
    const lq = Q.get('level') || '1', lvl = /^s\d$/.test(lq) ? Math.max(0, secretIdx(lq)) : Math.max(0, (+lq) - 1);   // (?level=s1: a secret stage)
    const heroes = (Q.get('heroes') || 'dodongo').split(',').filter((h) => HEROES[h]).slice(0, quest().maxPlayers);
    app.run = { heroes, ctrls: testCtrls(heroes.length), players: heroes.length, score: 0, freed: 0 };
    if (heroes.length > 1) app.input?.setSplitKeyboard?.(true);
    app.world.players = heroes.map((h, i) => new Player(app.world, h, i, app.run.ctrls[i]));
    if (Q.has('story')) await app.playStory(levelAt(lvl).intro, () => app.startLevel(lvl, -1));
    else await app.startLevel(lvl, Q.has('cp') ? +Q.get('cp') : -1, Q.has('x') ? { atX: +Q.get('x') } : {});
  }
  if (Q.has('god')) for (const p of app.world.players) Object.defineProperty(p, 'hittable', { get: () => false });

  let last = performance.now(), acc = 0;
  const STEP = 1000 / 60;
  const manual = Q.has('manual');
  app.advance = (n = 1) => { for (let i = 0; i < n; i++) app.step(); app.render(); };
  // errors: logged once each; the last 5 distinct ones kept (message, top stack frame, where in the game), saved in
  // localStorage 'dq_errors', and the latest shown in small type at the foot of the pause menu (a tester's screenshot
  // of the pause menu carries it; nothing shows during play)
  const seen = new Set();
  app.errors = [];                          // (this session's; app.prevErrors: what the last sessions saved)
  try { app.prevErrors = JSON.parse(localStorage.getItem('dq_errors') || '[]').slice(-5); } catch { app.prevErrors = []; }
  const report = (e, where) => {
    const msg = String((e && e.message) || e), k = msg + '|' + (where || '');
    if (seen.has(k)) return;
    seen.add(k); console.error(where || 'error', e);
    const frame = String((e && e.stack) || '').split('\n').map((l) => l.trim()).find((l) => /\.js|@|at /.test(l) && !/^\w*Error/.test(l)) || '';
    const W0 = app.world, P0 = W0?.players?.[0];
    app.errors = app.errors.filter((x) => x.msg !== msg).concat([{ msg: msg.slice(0, 140), frame: frame.replace(/^.*\//, '').slice(0, 80), where: where || '',
      scene: app.scene, level: (W0?.levelIdx ?? -1) + 1, x: P0 ? Math.round(P0.x) : null, tick: app.frame, at: Date.now() }]).slice(-5);
    try { localStorage.setItem('dq_errors', JSON.stringify(app.prevErrors.concat(app.errors).slice(-5))); } catch { /* private mode / full: kept in memory */ }
  };
  app.reportError = report;
  reportCanvasFailure();                    // (a cache canvas the iOS memory cap refused while booting: src/canvasmem.js)
  const loop = (now) => {
    requestAnimationFrame(loop);
    acc += Math.min(100, now - last); last = now;
    let n = 0;
    try { if (!manual) while (acc >= STEP && n < 5) { app.step(); acc -= STEP; n++; } } catch (e) { report(e); acc = 0; }
    try { app.render(); } catch (e) { report(e); }
  };
  requestAnimationFrame(loop);
  document.getElementById('boot')?.remove();
}
boot();
