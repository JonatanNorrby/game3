import { clamp, distance } from '../../../core/geometry.js';
import { findRandomPlayablePosition, isPositionPlayable } from '../../../core/playableArea.js';
import { ROGUE_CONFIG as C } from './config.js';

export class Rogue {
  constructor(game) {
    this.game = game;
    this.config = C;
    if (!Array.isArray(this.game.unplayableZones)) this.game.unplayableZones = [];
    this.reset();
  }

  reset() {
    const spawn = this.game.currentArena?.playerSpawn ?? C.spawn;
    this.x = this.game.worldWidth * spawn.x;
    this.y = this.game.worldHeight * spawn.y;
    this.health = C.maxHealth;
    this.cooldowns = {};
    this.cast = null;
    this.vial = null;
    this.weaponPoisonRemaining = 0;
    this.bossPoison = null;
    this.sprintRemaining = 0;
    this.alive = true;
  }

  update(dt, input) {
    if (!this.alive) return;
    for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    this.weaponPoisonRemaining = Math.max(0, this.weaponPoisonRemaining - dt);
    this.sprintRemaining = Math.max(0, this.sprintRemaining - dt);
    this.updateBossPoison(dt);
    this.updateVial();

    const dx = (input.isActionHeld('moveRight') ? 1 : 0) - (input.isActionHeld('moveLeft') ? 1 : 0);
    const dy = (input.isActionHeld('moveDown') ? 1 : 0) - (input.isActionHeld('moveUp') ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const length = Math.hypot(dx, dy);
      const speed = C.moveSpeed * (this.sprintRemaining > 0 ? C.abilities.sprint.speedMultiplier : 1);
      this.x += (dx / length) * speed * dt;
      this.y += (dy / length) * speed * dt;
      this.x = clamp(this.x, 30, this.game.worldWidth - 30);
      this.y = clamp(this.y, 30, this.game.worldHeight - 30);
      this.resolveBossCollision();
      if (this.cast) this.cancelCast();
    }

    this.updateCast(dt);
    this.updateVial();
  }

  useAbility(id) {
    const method = {
      slash: 'useSlash',
      knife: 'useKnife',
      vial: 'useVial',
      sprint: 'useSprint',
    }[id];
    if (method) this[method]();
  }

  canUse(id) {
    return this.alive && !this.cast && (this.cooldowns[id] ?? 0) <= 0 && this.game.boss?.alive;
  }

  getAbilityAvailability(id) {
    const ability = C.abilities[id];
    if (!ability) return { available: false, reason: 'Unavailable' };
    if (id === 'slash' && this.game.boss && distance(this, this.game.boss) > ability.meleeRange) {
      return { available: false, reason: 'Move into melee range' };
    }
    if (id === 'knife' && this.game.boss && distance(this, this.game.boss) > ability.range) {
      return { available: false, reason: 'Target out of range' };
    }
    if (id === 'vial' && this.vial) return { available: false, reason: 'Pick up the active poison vial first' };
    return { available: true };
  }

  getPrimaryResourceState() {
    if (this.weaponPoisonRemaining <= 0) return null;
    return {
      current: this.weaponPoisonRemaining,
      max: C.poison.weaponDuration,
      label: 'Weapon Poison',
      color: C.visual.poison,
    };
  }

  useSlash() {
    const a = C.abilities.slash;
    if (!this.canUse('slash')) return;
    if (distance(this, this.game.boss) > a.meleeRange) {
      this.game.flashMessage('Move closer to Slash');
      return;
    }
    this.cooldowns.slash = a.cooldown;
    this.game.damageBoss(a.damage, a.name);
    this.game.spawnBurst(this.game.boss.x, this.game.boss.y, this.weaponPoisonRemaining > 0 ? C.visual.poison : C.visual.core, 34);
    this.applyWeaponPoison();
  }

  useKnife() {
    const a = C.abilities.knife;
    if (!this.canUse('knife')) return;
    if (distance(this, this.game.boss) > a.range) {
      this.game.flashMessage('Target out of Knife Throw range');
      return;
    }
    this.cooldowns.knife = a.cooldown;
    this.game.damageBoss(a.damage, a.name);
    this.game.spawnProjectile(this, this.game.boss, this.weaponPoisonRemaining > 0 ? C.visual.poison : C.visual.core, a.projectileDuration);
    this.applyWeaponPoison();
  }

  useVial() {
    const a = C.abilities.vial;
    if (!this.canUse('vial')) return;
    if (this.vial) {
      this.game.flashMessage('Pick up your active poison vial');
      return;
    }
    this.cooldowns.vial = a.cooldown;
    this.startCast('vial', a.name, a.castTime, () => this.spawnVial());
  }

  useSprint() {
    const a = C.abilities.sprint;
    if (!this.canUse('sprint')) return;
    this.cooldowns.sprint = a.cooldown;
    this.sprintRemaining = a.duration;
    this.game.flashMessage('Sprint');
  }

  spawnVial() {
    this.vial = findRandomPlayablePosition(this.game, {
      margin: C.vial.arenaMargin,
      radius: C.vial.radius,
    });
    this.game.spawnBurst(this.vial.x, this.vial.y, C.visual.vial, 46);
    this.game.flashMessage('Poison vial thrown');
  }

  updateVial() {
    if (!this.vial) return;
    if (!isPositionPlayable(this.game, this.vial.x, this.vial.y, C.vial.radius)) {
      this.vial = findRandomPlayablePosition(this.game, {
        margin: C.vial.arenaMargin,
        radius: C.vial.radius,
      });
      this.game.spawnBurst(this.vial.x, this.vial.y, C.visual.vial, 46);
      this.game.flashMessage('Poison vial moved to safe ground');
    }

    if (distance(this, this.vial) <= C.vial.pickupRadius) {
      this.weaponPoisonRemaining = C.poison.weaponDuration;
      this.vial = null;
      this.game.spawnBurst(this.x, this.y, C.visual.poison, 52);
      this.game.flashMessage('Weapons poisoned');
    }
  }

  applyWeaponPoison() {
    if (this.weaponPoisonRemaining <= 0) return;
    this.bossPoison = {
      remaining: C.poison.targetDuration,
      tickTimer: C.poison.tickEvery,
    };
  }

  updateBossPoison(dt) {
    if (!this.bossPoison || !this.game.boss?.alive) {
      if (!this.game.boss?.alive) this.bossPoison = null;
      return;
    }

    this.bossPoison.remaining -= dt;
    this.bossPoison.tickTimer -= dt;
    while (this.bossPoison.tickTimer <= 0 && this.bossPoison.remaining > -0.001) {
      this.bossPoison.tickTimer += C.poison.tickEvery;
      this.game.damageBoss(C.poison.damagePerTick, 'Poison');
      this.heal(C.poison.damagePerTick * C.poison.lifestealPercent);
      this.cooldowns.sprint = Math.max(0, (this.cooldowns.sprint ?? 0) - C.poison.sprintCooldownReductionPerTick);
      this.game.spawnBurst(this.game.boss.x, this.game.boss.y, C.visual.poison, 24);
    }

    if (this.bossPoison.remaining <= 0) this.bossPoison = null;
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
    complete?.();
  }

  resolveBossCollision() {
    const boss = this.game.boss;
    if (!boss?.alive) return;
    const minDistance = (boss.config?.radius ?? 40) + C.radius + 8;
    let dx = this.x - boss.x;
    let dy = this.y - boss.y;
    let currentDistance = Math.hypot(dx, dy);
    if (currentDistance >= minDistance) return;
    if (currentDistance < 0.001) {
      dx = 0;
      dy = 1;
      currentDistance = 1;
    }
    this.x = boss.x + (dx / currentDistance) * minDistance;
    this.y = boss.y + (dy / currentDistance) * minDistance;
  }

  heal(amount) {
    if (!this.alive) return;
    const before = this.health;
    this.health = Math.min(C.maxHealth, this.health + amount);
    const healed = this.health - before;
    if (healed > 0.01) this.game.spawnFloatingText(this.x, this.y - 28, `+${Math.round(healed)}`, C.visual.poison);
  }

  takeDamage(amount, source = 'Damage') {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.game.spawnFloatingText(this.x, this.y - 28, `-${amount}`, '#ff7777');
    this.game.shake = Math.max(this.game.shake, 5);
    if (this.health <= 0) {
      this.alive = false;
      this.cast = null;
      this.game.onPlayerDefeated(source);
    }
  }

  draw(ctx) {
    if (this.vial) {
      ctx.save();
      ctx.translate(this.vial.x, this.vial.y);
      ctx.shadowBlur = 20;
      ctx.shadowColor = C.visual.vial;
      ctx.fillStyle = '#1d3b27';
      ctx.strokeStyle = C.visual.vial;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, C.vial.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.visual.vial;
      ctx.fillRect(-5, -16, 10, 9);
      ctx.restore();
    }

    if (this.bossPoison && this.game.boss?.alive) {
      ctx.save();
      ctx.strokeStyle = C.visual.poison;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.game.boss.x, this.game.boss.y, (this.game.boss.config?.radius ?? 40) + 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.sprintRemaining > 0) {
      ctx.strokeStyle = C.visual.sprint;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, C.radius + 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.weaponPoisonRemaining > 0) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = C.visual.poison;
    }
    ctx.fillStyle = C.visual.body;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.weaponPoisonRemaining > 0 ? C.visual.poison : C.visual.core;
    ctx.beginPath();
    ctx.arc(0, -3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2c2047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-11, 7);
    ctx.lineTo(-20, 16);
    ctx.moveTo(11, 7);
    ctx.lineTo(20, 16);
    ctx.stroke();
    ctx.restore();
  }
}
