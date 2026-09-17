import { clamp } from '../../../core/geometry.js';
import { ARCANE_MAGE_CONFIG as C } from './config.js';

export class ArcaneMage {
  constructor(game) {
    this.game = game;
    this.config = C;
    this.reset();
  }

  reset() {
    const spawn = this.game.currentArena?.playerSpawn ?? C.spawn;
    this.x = this.game.worldWidth * spawn.x;
    this.y = this.game.worldHeight * spawn.y;
    this.health = C.maxHealth;
    this.cooldowns = {};
    this.effects = [];
    this.resources = Object.fromEntries(Object.keys(C.resources ?? {}).map((id) => [id, 0]));
    this.cast = null;
    this.anchor = null;
    this.alive = true;
  }

  update(dt, input) {
    if (!this.alive) return;
    for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    this.updateEffects(dt);
    const dx = (input.isActionHeld('moveRight') ? 1 : 0) - (input.isActionHeld('moveLeft') ? 1 : 0);
    const dy = (input.isActionHeld('moveDown') ? 1 : 0) - (input.isActionHeld('moveUp') ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const length = Math.hypot(dx, dy);
      this.x += (dx / length) * C.moveSpeed * dt;
      this.y += (dy / length) * C.moveSpeed * dt;
      this.x = clamp(this.x, 30, this.game.worldWidth - 30);
      this.y = clamp(this.y, 30, this.game.worldHeight - 30);
      if (this.cast && !this.cast.canMove) this.cancelCast();
    }
    this.updateCast(dt);
  }

  useAbility(id) {
    const method = {
      renew: 'useRenew',
      missiles: 'useArcaneMissiles',
      barrage: 'useArcaneMissiles',
      filler: 'useFiller',
      teleport: 'useTeleport',
    }[id];
    if (method) this[method]();
  }

  getResource(id) {
    return this.resources[id] ?? 0;
  }

  addResource(id, amount) {
    const config = C.resources?.[id];
    if (!config) return 0;
    const next = clamp(this.getResource(id) + amount, 0, config.max);
    this.resources[id] = next;
    return next;
  }

  getAbilityResourceState(abilityId) {
    const resourceId = C.abilities[abilityId]?.resource;
    if (!resourceId) return null;
    const config = C.resources?.[resourceId];
    if (!config) return null;
    return {
      current: this.getResource(resourceId),
      max: config.max,
      label: config.name,
    };
  }

  canUse(id) { return this.alive && !this.cast && (this.cooldowns[id] ?? 0) <= 0 && this.game.boss?.alive; }

  useRenew() {
    const a = C.abilities.renew;
    if (!this.canUse('renew')) return;

    const stackCount = this.getResource(a.resource);
    if (stackCount <= 0) {
      this.game.flashMessage('Cast Arcane Bolt to build Arcane Stacks');
      return;
    }

    this.resources[a.resource] = 0;
    this.cooldowns.renew = a.cooldown;
    this.effects = this.effects.filter((effect) => effect.id !== 'renew');

    const duration = a.durationPerStack * stackCount;
    const totalHealing = a.healPerStack * stackCount;
    const ticks = Math.max(1, Math.round(duration / a.tickEvery));
    this.effects.push({
      id: 'renew',
      remaining: duration,
      tickTimer: a.tickEvery,
      ticksRemaining: ticks,
      healPerTick: totalHealing / ticks,
    });
    this.game.flashMessage(`${a.name} ×${stackCount}`);
  }

  useArcaneMissiles() {
    const a = C.abilities.missiles;
    if (!this.canUse('missiles')) return;

    const missileCount = this.getResource(a.resource);
    if (missileCount <= 0) {
      this.game.flashMessage('Cast Arcane Bolt to build Arcane Stacks');
      return;
    }

    this.resources[a.resource] = 0;
    this.startCast('missiles', `${a.name} ×${missileCount}`, a.timePerMissile * missileCount, null, {
      canMove: true,
      tickEvery: a.timePerMissile,
      ticks: missileCount,
      onTick: () => {
        if (!this.alive || !this.game.boss?.alive) return;
        this.game.damageBoss(a.damagePerMissile, a.name);
        this.game.spawnProjectile(this, this.game.boss, '#b5a1ff', a.projectileDuration);
      },
    });
  }

  useFiller() {
    if (!this.canUse('filler')) return;
    const a = C.abilities.filler;
    this.startCast('filler', a.name, a.castTime, () => {
      this.game.damageBoss(a.damage, 'Arcane Bolt');
      this.game.spawnProjectile(this, this.game.boss, '#a99dff', 0.28);

      const resourceId = a.generates.resource;
      const before = this.getResource(resourceId);
      const after = this.addResource(resourceId, a.generates.amount);
      if (after > before) {
        const max = C.resources[resourceId].max;
        this.game.spawnFloatingText(this.x, this.y - 48, `Arcane ${after}/${max}`, '#c8b8ff');
      }
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
    this.game.camera.snapTo(this);
    this.game.flashMessage('Recalled');
  }

  startCast(id, name, duration, onComplete, options = {}) {
    this.cast = {
      id,
      name,
      duration,
      remaining: duration,
      onComplete,
      canMove: options.canMove === true,
      onTick: options.onTick ?? null,
      tickEvery: options.tickEvery ?? 0,
      tickTimer: options.tickEvery ?? 0,
      ticksRemaining: options.ticks ?? 0,
    };
  }

  cancelCast() {
    if (!this.cast) return;
    this.game.flashMessage(`${this.cast.name} interrupted by movement`);
    this.cast = null;
  }

  updateCast(dt) {
    if (!this.cast) return;
    const cast = this.cast;
    cast.remaining -= dt;

    if (cast.onTick && cast.tickEvery > 0 && cast.ticksRemaining > 0) {
      cast.tickTimer -= dt;
      while (cast.tickTimer <= 0 && cast.ticksRemaining > 0) {
        cast.tickTimer += cast.tickEvery;
        cast.ticksRemaining -= 1;
        cast.onTick();
      }
    }

    if (cast.remaining > 0 || cast.ticksRemaining > 0) return;
    this.cast = null;
    cast.onComplete?.();
  }

  updateEffects(dt) {
    const renew = C.abilities.renew;
    for (const effect of this.effects) {
      effect.remaining -= dt;
      effect.tickTimer -= dt;

      if (effect.id === 'renew' && effect.ticksRemaining > 0) {
        while (effect.tickTimer <= 0 && effect.ticksRemaining > 0) {
          effect.tickTimer += renew.tickEvery;
          effect.ticksRemaining -= 1;
          this.heal(effect.healPerTick);
        }
      }
    }
    this.effects = this.effects.filter((effect) => effect.remaining > 0 && (effect.id !== 'renew' || effect.ticksRemaining > 0));
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
