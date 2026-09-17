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
    this.targetPoisons = new Map();
    this.comboPoints = 0;
    this.sprintRemaining = 0;
    this.alive = true;
  }

  update(dt, input) {
    if (!this.alive) return;
    for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    this.weaponPoisonRemaining = Math.max(0, this.weaponPoisonRemaining - dt);
    this.sprintRemaining = Math.max(0, this.sprintRemaining - dt);
    this.updateTargetPoisons(dt);
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
      execute: 'useExecute',
    }[id];
    if (method) this[method]();
  }

  getTarget() {
    return this.game.getCombatTarget?.() ?? this.game.boss ?? null;
  }

  canUse(id) {
    return this.alive && !this.cast && (this.cooldowns[id] ?? 0) <= 0 && this.game.boss?.alive;
  }

  isTargetPoisoned(target) {
    return Boolean(target && (this.targetPoisons.get(target)?.remaining ?? 0) > 0);
  }

  getAbilityAvailability(id) {
    const ability = C.abilities[id];
    if (!ability) return { available: false, reason: 'Unavailable' };
    const target = this.getTarget();

    if ((id === 'slash' || id === 'execute') && target && distance(this, target) > ability.meleeRange) {
      return { available: false, reason: 'Move into melee range' };
    }
    if (id === 'knife' && target && distance(this, target) > ability.range) {
      return { available: false, reason: 'Target out of range' };
    }
    if (id === 'vial' && this.vial) return { available: false, reason: 'Pick up the active poison vial first' };
    if (id === 'execute') {
      if (this.comboPoints < ability.comboPointCost) {
        return { available: false, reason: `Need ${ability.comboPointCost} Combo Points` };
      }
      if (!this.isTargetPoisoned(target)) {
        return { available: false, reason: 'Target must be poisoned' };
      }
    }
    return { available: true };
  }

  getAbilityResourceState(id) {
    if (id !== 'execute') return null;
    return {
      current: this.comboPoints,
      max: C.comboPoints.max,
      label: 'Combo Points',
    };
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

  addComboPoint(amount = 1) {
    const before = this.comboPoints;
    this.comboPoints = clamp(this.comboPoints + amount, 0, C.comboPoints.max);
    const gained = this.comboPoints - before;
    if (gained > 0) {
      this.game.spawnFloatingText(this.x, this.y - 48, `+${gained} Combo`, C.visual.execute);
    }
  }

  useSlash() {
    const a = C.abilities.slash;
    if (!this.canUse('slash')) return;
    const target = this.getTarget();
    if (!target) return;
    if (distance(this, target) > a.meleeRange) {
      this.game.flashMessage('Move closer to Slash');
      return;
    }

    const wasPoisoned = this.isTargetPoisoned(target);
    this.cooldowns.slash = a.cooldown;
    this.game.damageBoss(a.damage, a.name);
    this.game.spawnBurst(target.x, target.y, this.weaponPoisonRemaining > 0 ? C.visual.poison : C.visual.core, 34);
    if (wasPoisoned) this.addComboPoint(C.comboPoints.gainPerPoisonedSlash);
    this.applyWeaponPoison(target);
  }

  useKnife() {
    const a = C.abilities.knife;
    if (!this.canUse('knife')) return;
    const target = this.getTarget();
    if (!target) return;
    if (distance(this, target) > a.range) {
      this.game.flashMessage('Target out of Knife Throw range');
      return;
    }
    this.cooldowns.knife = a.cooldown;
    this.game.damageBoss(a.damage, a.name);
    this.game.spawnProjectile(this, target, this.weaponPoisonRemaining > 0 ? C.visual.poison : C.visual.core, a.projectileDuration);
    this.applyWeaponPoison(target);
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

  useExecute() {
    const a = C.abilities.execute;
    if (!this.canUse('execute')) return;
    const target = this.getTarget();
    if (!target) return;
    if (distance(this, target) > a.meleeRange) {
      this.game.flashMessage('Move closer to Execute');
      return;
    }
    if (this.comboPoints < a.comboPointCost) {
      this.game.flashMessage(`Need ${a.comboPointCost} Combo Points`);
      return;
    }
    if (!this.isTargetPoisoned(target)) {
      this.game.flashMessage('Execute requires a poisoned target');
      return;
    }

    this.comboPoints = Math.max(0, this.comboPoints - a.comboPointCost);
    this.cooldowns.execute = a.cooldown;
    this.game.damageBoss(a.damage, a.name);
    this.game.spawnBurst(target.x, target.y, C.visual.execute, 68);
    this.game.flashMessage('EXECUTE');
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

  applyWeaponPoison(target = this.getTarget()) {
    if (this.weaponPoisonRemaining <= 0 || !target) return;
    const existing = this.targetPoisons.get(target);
    this.targetPoisons.set(target, {
      remaining: C.poison.targetDuration,
      tickTimer: existing?.tickTimer ?? C.poison.tickEvery,
    });
  }

  updateTargetPoisons(dt) {
    for (const [target, poison] of this.targetPoisons) {
      if (!target || target.alive === false || target.targetable === false || typeof target.takeDamage !== 'function') {
        this.targetPoisons.delete(target);
        continue;
      }

      poison.remaining -= dt;
      poison.tickTimer -= dt;
      while (poison.tickTimer <= 0 && poison.remaining > -0.001 && target.alive !== false) {
        poison.tickTimer += C.poison.tickEvery;
        target.takeDamage(C.poison.damagePerTick, 'Poison');
        this.heal(C.poison.damagePerTick * C.poison.lifestealPercent);
        this.cooldowns.sprint = Math.max(0, (this.cooldowns.sprint ?? 0) - C.poison.sprintCooldownReductionPerTick);
        this.game.spawnBurst(target.x, target.y, C.visual.poison, 24);
      }

      if (poison.remaining <= 0 || target.alive === false || target.targetable === false) {
        this.targetPoisons.delete(target);
      }
    }
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

    for (const [target, poison] of this.targetPoisons) {
      if (poison.remaining <= 0 || target.alive === false || target.targetable === false) continue;
      ctx.save();
      ctx.strokeStyle = C.visual.poison;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(target.x, target.y, (target.config?.radius ?? target.radius ?? 40) + 13, 0, Math.PI * 2);
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
    if (this.comboPoints > 0) {
      const pipRadius = C.radius + 14;
      for (let i = 0; i < C.comboPoints.max; i += 1) {
        const angle = -Math.PI * 0.8 + i * (Math.PI * 0.53);
        ctx.fillStyle = i < this.comboPoints ? C.visual.execute : '#3a3049';
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * pipRadius, Math.sin(angle) * pipRadius, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
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
