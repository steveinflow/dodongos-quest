// Dragon Dodongo's charged shot (docs/SECRETS.md): the FLAME STREAM -- a jet of fire out of his mouth for most of a
// second, ticking every foe in the cone ahead (each foe at most `ticks` times, the last tick a knockdown).  Its hits share
// one meter budget (Player.landed: SPELL_METER), like any charged spell's.
import { Actor } from './actors.js';
import { audio } from './audio-proxy.js';
import { FLOOR_TOP } from './config.js';

export class FlameStream extends Actor {
  /** owner: the hero; S: his shoot table (dmg); vol: the spell's volley Set (one meter budget) */
  constructor(game, owner, S, vol) {
    const o = owner.shootOrigin();
    super(game, o.x, o.y);
    this.owner = owner; this.S = S; this.volley = vol; this.team = 'heroShot'; this.solid = false;
    this.z = o.z; this.facing = owner.facing; this.life = 54; this.len = 0; this.hits = new Map();
    this.w = 10; this.h = 10; this.shadowR = 0;
    audio.sfx('fire_breath', { vol: 0.9 });
  }
  get hittable() { return false; }
  takeHit() { return false; }
  drawShadow() {}
  update() {
    this.tick();
    const g = this.game, p = this.owner, o = p.shootOrigin();
    this.x = o.x; this.y = o.y; this.z = o.z; this.facing = p.facing;
    this.len = Math.min(320, this.len + 32);
    if (this.st % 2 === 0) g.fx.flames(this.x + this.facing * (40 + Math.random() * this.len * 0.9), this.y + (Math.random() - 0.5) * 30, this.z - 20 + Math.random() * 30, 1, { vx: this.facing * 3, scale: 1.1 });
    if (this.st % 8 === 4) {
      for (const t of g.actors) {
        if (t.team !== 'foe' && t.team !== 'thing') continue;
        if (!t.hittable) continue;
        const dx = (t.x - this.x) * this.facing, spread = 24 + dx * 0.16;
        if (dx < -20 || dx > this.len || Math.abs(t.y - this.y) > spread) continue;
        const n = this.hits.get(t) || 0;
        if (n >= 5) continue;
        this.hits.set(t, n + 1);
        const last = n === 4 || this.st >= this.life - 8;
        const hd = { dmg: last ? 6 : 3, kind: last ? 'knock' : 'light', push: last ? 6 : 1, lift: 5, stun: 18, stop: last ? 6 : 2, hit: last ? 'hit_heavy' : 'fire_small', spark: 'warm', ember: 3, word: last ? 'heavy' : undefined, thrown: last };
        if (t.takeHit(p, hd) && t.team === 'foe') p.landed(t, { ...hd, box: null, spell: this.volley });
      }
    }
    if (this.st >= this.life || !p.alive || p.out) this.gone = true;
  }
  draw(ctx) {
    const g = this.game, x = this.x - g.camX, y = FLOOR_TOP + this.y - this.z, f = this.facing, L = this.len;
    const k = this.st > this.life - 10 ? (this.life - this.st) / 10 : 1;
    ctx.save(); ctx.globalAlpha = k; ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createLinearGradient(x, y, x + f * L, y);
    gr.addColorStop(0, 'rgba(255,250,210,0.95)'); gr.addColorStop(0.3, 'rgba(255,190,70,0.85)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(x, y - 6);
    for (let i = 0; i <= 10; i++) { const u = i / 10; ctx.lineTo(x + f * L * u, y - 8 - u * 46 + Math.sin(g.time * 30 + i) * 5); }
    for (let i = 10; i >= 0; i--) { const u = i / 10; ctx.lineTo(x + f * L * u, y + 8 + u * 46 + Math.sin(g.time * 27 + i) * 5); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
