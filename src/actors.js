// Base actor, combat resolution, breakable props, pickups and projectiles.
import { FLOOR_TOP, DEPTH, INK } from './config.js';
import { TAU, clamp } from './rig.js';
import { audio } from './audio-proxy.js';

export const GRAV = 0.56;

export class Actor {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.facing = 1;
    this.state = 'idle'; this.st = 0;
    this.w = 20; this.h = 120;            // hurtbox half-width and height
    this.team = 'foe';
    this.hp = this.maxHp = 10;
    this.alive = true; this.gone = false;
    this.flash = 0; this.inv = 0; this.shake = 0;
    this.balloonH = 170;
    this.solid = true;
  }
  set(state) { if (this.state !== state) { this.state = state; this.st = 0; } }
  reset(state) { this.state = state; this.st = 0; }      // enter a state even if we are already in it
  get sx() { return this.x - this.game.camX; }
  get sy() { return FLOOR_TOP + this.y - this.z; }
  get down() { return this.state === 'fly' || this.state === 'down' || this.state === 'getup' || this.state === 'dead'; }
  get hittable() { return this.alive && this.inv <= 0 && !this.down; }
  /** inside the floor's depth -- or the stage's narrow lane (Mystic Mountain's ice ledge: World.lane, src/mmworld.js) */
  clampDepth() { const ln = this.game?.lane; this.y = ln ? clamp(this.y, ln[0], ln[1]) : clamp(this.y, 2, DEPTH - 2); }
  tick() { this.st++; if (this.inv > 0) this.inv--; if (this.shake > 0) this.shake--; }
  /** white hit flash: bright for the first frames, then a soft tint so the hurt face still reads.  A colossal boss (a
   *  big share of the screen) flashes softer and at most ~3 times a second, however fast the hits come */
  get flashAlpha() {
    if (this.boss && this.colossal) {
      const f = this.game?.frame ?? 0;
      if (this.flash >= 5 && !(f - (this._flashF ?? -99) < 20)) this._flashF = f;
      return f - (this._flashF ?? -99) < 2 ? 0.22 : 0;
    }
    if (this.boss) return this.flash >= 5 ? 0.45 : 0; return this.flash >= 5 ? 0.75 : this.flash > 0 ? 0.28 : 0; }

  drawShadow(ctx) {
    const sx = this.x - this.game.camX, sy = FLOOR_TOP + this.y;
    const k = clamp(1 - this.z / 260, 0.35, 1);
    const r = (this.shadowR || this.w * 1.5) * k;
    ctx.fillStyle = `rgba(30,20,40,${0.32 * k})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.3, 0, 0, TAU); ctx.fill();
  }
}

/** World-space attack box for an attacker facing either way.  box: { x0, x1, z0, z1, dy } (x along facing). */
export function boxOf(a, box) {
  const x0 = a.facing > 0 ? a.x + box.x0 : a.x - box.x1;
  const x1 = a.facing > 0 ? a.x + box.x1 : a.x - box.x0;
  return { x0, x1, z0: a.z + box.z0, z1: a.z + box.z1, y: a.y, dy: box.dy ?? 18 };
}

export function overlaps(b, t) {
  if (t.postBox) t = t.postBox;
  if (Math.abs(t.y - b.y) > b.dy + (t.depthR || 0)) return false;
  if (b.x1 < t.x - t.w || b.x0 > t.x + t.w) return false;
  const tz0 = t.z + (t.hz0 || 0), tz1 = t.z + (t.hz0 || 0) + t.h;
  return b.z1 > tz0 && b.z0 < tz1;
}

// ---------------------------------------------------------------- breakable props

export class Prop extends Actor {
  constructor(game, kind, x, y, drop) {
    super(game, x, y);
    this.kind = kind; this.drop = drop;
    const info = game.stage.PROP_INFO?.[kind] || { w: 44, h: 50, colors: ['#9a6a3a', '#6e4520', '#c9a070'] };
    this.info = info;
    this.w = info.w / 2; this.h = info.h;
    this.hp = kind === 'urn' ? 1 : 2;
    this.team = 'prop';
    this.shadowR = info.w * 0.6;
  }
  get hittable() { return this.alive; }
  drawShadow() {}          // the stage art draws each prop's own contact shadow
  takeHit(att, hd) {
    if (!this.alive) return false;
    this.hp -= hd.kind === 'knock' ? 2 : 1;
    this.flash = 6; this.shake = 8;
    const g = this.game;
    if (this.hp <= 0) {
      this.alive = false; this.gone = true;
      g.fx.debris(this.x, this.y, 10, this.info.colors, 12);
      g.fx.dust(this.x, this.y, 5, 20);
      audio.sfx('break');
      if (this.drop) g.spawnPickup(this.drop, this.x, this.y);
      g.score += 100;
    } else audio.sfx('hit_light', { pitch: 0.8 });
    return true;
  }
  update() { this.tick(); }
  draw(ctx) {
    const sh = this.shake ? Math.sin(this.shake * 2.5) * 3 : 0;
    this.game.stage.drawProp(ctx, this.kind, this.sx + sh, this.sy, { flash: this.flashAlpha, shake: sh });
  }
}

// ---------------------------------------------------------------- pickups
export const PICKUPS = {
  apple: { heal: 20, label: 'YUM!' },
  drumstick: { heal: 50, label: 'SNACK!' },
  pie: { heal: 999, label: 'PIE!' },
  coin: { score: 500, label: '+500' },
  gem: { ember: 100, label: 'DRAGON FIRE!' },
  oneup: { life: 1, label: '1UP!' },
};

export class Pickup extends Actor {
  constructor(game, kind, x, y) {
    super(game, x, y);
    this.kind = kind; this.team = 'item'; this.w = 16; this.h = 24; this.solid = false;
    this.vz = 5; this.z = 20; this.life = 60 * 20;
    this.shadowR = 14;
  }
  get hittable() { return false; }
  update() {
    this.tick();
    if (this.z > 0 || this.vz > 0) {
      this.z += this.vz; this.vz -= GRAV;
      if (this.z <= 0) { this.z = 0; this.vz = this.vz < -2 ? -this.vz * 0.35 : 0; }
    }
    if (this.st > 20) {
      for (const p of this.game.players) {
        if (p.alive && !p.out && p.canPickup && Math.abs(p.x - this.x) < 30 && Math.abs(p.y - this.y) < 16 && p.z < 30) { this.game.collect(this, p); break; }
      }
    }
    if (--this.life <= 0) this.gone = true;
  }
  draw(ctx) {
    if (this.life < 120 && (this.life >> 3) % 2) return;
    // food and gems are drawn by the Dragon Road stage module, whichever level we're in
    const st = this.game.stage.drawPickup ? this.game.stage : this.game.app?.titleStage;
    st?.drawPickup?.(ctx, this.kind, this.sx, this.sy, this.game.time);
  }
}

// ---------------------------------------------------------------- projectiles (whelp fireballs)
export class Fireball extends Actor {
  constructor(game, x, y, z, dir, owner) {
    super(game, x, y);
    this.z = z; this.vx = dir * 4.4; this.facing = dir; this.owner = owner;
    this.team = 'shot'; this.w = 12; this.h = 22; this.hz0 = -11; this.life = 140; this.solid = false;
    this.shadowR = 12;
  }
  get hittable() { return this.alive; }
  takeHit() {   // can be swatted out of the air
    this.alive = false; this.gone = true;
    this.game.fx.flames(this.x, this.y, this.z, 6, { green: true });
    audio.sfx('block', { pitch: 1.3, vol: 0.6 });
    return true;
  }
  update() {
    this.tick();
    this.x += this.vx;
    if (this.st % 3 === 0) this.game.fx.flames(this.x - this.vx * 2, this.y, this.z - 4, 1, { green: true, scale: 0.6 });
    for (const p of this.game.players) {
      if (p.hittable && Math.abs(p.y - this.y) < 16 && Math.abs(p.x - this.x) < p.w + 10 && this.z < p.z + p.h && this.z > p.z) {
        p.takeHit(this, { dmg: 9, kind: 'light', push: 3, stun: 18, stop: 4, sfx: 'hit_light', spark: 'green' });
        this.game.fx.flames(this.x, this.y, this.z, 8, { green: true });
        this.alive = false; this.gone = true;
        break;
      }
    }
    if (--this.life <= 0 || this.x < this.game.camX - 120 || this.x > this.game.camX + 1080) this.gone = true;
  }
  draw(ctx) {
    const sx = this.sx, sy = this.sy, t = this.game.time;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(this.facing, 1);
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(80,255,120,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 22 + Math.sin(t * 30) * 2, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = prev;
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.bezierCurveTo(14, -12, -6, -14, -26, -4 + Math.sin(t * 25) * 3);
    ctx.bezierCurveTo(-10, 0, -10, 2, -26, 6 + Math.cos(t * 23) * 3); ctx.bezierCurveTo(-6, 14, 14, 12, 16, 0);
    ctx.fillStyle = '#2fbf4f'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#9dff7a'; ctx.beginPath(); ctx.ellipse(4, 0, 9, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#efffe0'; ctx.beginPath(); ctx.ellipse(6, -1, 4.5, 3.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
