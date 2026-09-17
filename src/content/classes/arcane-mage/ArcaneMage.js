import { clamp } from '../../../core/geometry.js';
import { ARCANE_MAGE_CONFIG as C } from './config.js';

export class ArcaneMage {
  constructor(game) {
    this.game = game;
    this.config = C;
    this.reset();
  }

  reset() {
    this.x = this.game.width * C.spawn.x;
    this.y = this.game.height * C.spawn.y;
    this.health = C.maxHealth;
    this.cooldowns = {};
    this.effects = [];
    this.cast = null;
    this.anchor = null;
    this.alive = true;
  }

  update(dt, input) {
    if (!this.alive) return;

    for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    this.updateEffects(dt);

    const dx = (input.isHeld('d') ? 1 : 0) - (input.isHeld('a') ? 1 : 0);
    const dy = (input.isHeld('s') ? 1 : 0) - (input.isHeld('w') ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;

    if (moving) {
      const length = Math.hypot(dx, dy);
      this.x += (dx / length) * C.moveSpeed * dt;
      this.y += (dy / length) * C.moveSpeed * dt;
      this.x = clamp(this.x, 30, this.game.width - 30);
      this.y = clamp(this.y, 30, this.game.height - 30);
      if (this.cast) this.cancelCast();
    }

    this.updateCast(dt);

    if (input.consume('1')) this.useRenew();
    if (input.consume('2')) this.useDirectHeal();
    if (input.consume('3')) this.useBarrage();
    if (input.consume('4')) this.useFiller();
    if (input.consume('5')) this.useTeleport();
  }

  canUse(id) {
    return this.alive && !this.cast && (this.cooldowns[id] ?? 0) <= 0 && this.game.boss?.alive;
  }

  useRenew() {
    if (!this.canUse('renew')) return;
    const a = C.abilities.renew;
    this.cooldowns.renew = a.cooldown;
    this.effects = this.effects.filter((effect) => effect.id !== 'renew');
    this.effects.push({ id: 'renew', remaining: a.duration, tickTimer: 0 });
    this.game.flashMessage('Temporal Mend');
  }

  useDirectHeal() {
    if (!this.canUse('directHeal')) return;
    const a = C.abilities.directHeal;
    this.startCast('directHeal', a.name, a.castTime, () => {
      this.heal(a.heal);
      this.cooldowns.directHeal = a.cooldown;
    });
  }

  useBarrage() {
    if (!this.canUse('barrage')) return;
    const a = C.abilities.barrage;
    this.cooldowns.barrage = a.cooldown;
    this.game.damageBoss(a.damage, 'Arcane Barrage');
    this.game.spawnProjectile(this, this.game.boss, C.visual.body, 0.22);
  }

  useFiller() {
    if (!this.canUse('filler')) return;
    const a = C.abilities.filler;
    this.startCast('filler', a.name, a.castTime, () => {
      this.game.damageBoss(a.damage, 'Arcane Bolt');
      this.game.spawnProjectile(this, this.game.boss, '#a99dff', 0.28);
    });
  }

  useTeleport() {
    if (this.cast || !this.alive || (this.cooldowns.teleport ?? 0) > 0) return;
    const a = C.abilities.teleport;
    if (!this.anchor) {
      this.anchor = { x: this.x, y: this.y };
      this.game.flashMessage('Recall anchor placed');
      return;
    }

    this.game.spawnBurst(this.x, this.y, C.visual.anchor);
    this.x = this.anchor.x;
    this.y = this.anchor.y;
    this.game.spawnBurst(this.x, this.y, C.visual.anchor);
    this.anchor = null;
    this.cooldowns.teleport = a.cooldownAfterRecall;
    this.game.flashMessage('Recalled');
  }

  startCast(id, name, duration, onComplete) {
    this.cast = { id, name, duration, remaining: duration, onComplete };
  }

  cancelCast() {
    if (!this.cast) return;
    this.game.flashMessage(`${this.cast.name} interrupted by movement`);
    this.cast = null;
  }

  updateCast(dt) {
    if (!this.cast) return;
    this.cast.remaining -= dt;
    if (this.cast.remaining > 0) return;
    const complete = this.cast.onComplete;
    this.cast = null;
    complete();
  }

  updateEffects(dt) {
    const renew = C.abilities.renew;
    for (const effect of this.effects) {
      effect.remaining -= dt;
      effect.tickTimer -= dt;
      if (effect.id === 'renew' && effect.tickTimer <= 0) {
        effect.tickTimer += renew.tickEvery;
        this.heal(renew.healPerTick);
      }
    }
    this.effects = this.effects.filter((effect) => effect.remaining > 0);
  }

  heal(amount) {
    if (!this.alive) return;
    this.health = Math.min(C.maxHealth, this.health + amount);
    this.game.spawnFloatingText(this.x, this.y - 26, `+${amount}`, '#82f2a8');
  }

  takeDamage(amount, source = 'Damage') {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.game.spawnFloatingText(this.x, this.y - 26, `-${amount}`, '#ff7777');
    this.game.shake = Math.max(this.game.shake, 5);
    if (this.health <= 0) {
      this.alive = false;
      this.cast = null;
      this.game.onPlayerDefeated(source);
    }
  }

  draw(ctx) {
    if (this.anchor) {
      const pulse = 9 + Math.sin(this.game.time * 5) * 3;
      ctx.save();
      ctx.strokeStyle = C.visual.anchor;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(this.anchor.x, this.anchor.y, 20 + pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(this.anchor.x, this.anchor.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = C.visual.anchor;
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = C.visual.body;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.visual.core;
    ctx.beginPath();
    ctx.arc(0, -3, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#243e67';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, 10);
    ctx.lineTo(0, 20);
    ctx.lineTo(12, 10);
    ctx.stroke();
    ctx.restore();
  }
}
