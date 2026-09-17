import { clamp, distance } from '../../../core/geometry.js';
import { PALADIN_CONFIG as C } from './config.js';

export class Paladin {
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
    this.resources = Object.fromEntries(Object.entries(C.resources).map(([id, config]) => [id, config.start ?? config.max]));
    this.cast = null;
    this.bossDot = null;
    this.shielded = false;
    this.alive = true;
  }

  update(dt, input) {
    if (!this.alive) return;

    for (const key of Object.keys(this.cooldowns)) {
      this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    }

    this.updateBossDot(dt);

    const dx = (input.isActionHeld('moveRight') ? 1 : 0) - (input.isActionHeld('moveLeft') ? 1 : 0);
    const dy = (input.isActionHeld('moveDown') ? 1 : 0) - (input.isActionHeld('moveUp') ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;

    if (moving) {
      const length = Math.hypot(dx, dy);
      this.x += (dx / length) * C.moveSpeed * dt;
      this.y += (dy / length) * C.moveSpeed * dt;
      this.x = clamp(this.x, 30, this.game.worldWidth - 30);
      this.y = clamp(this.y, 30, this.game.worldHeight - 30);
      this.resolveBossCollision();
      if (this.cast && !this.cast.canMove) this.cancelCast();
    }

    this.updateCast(dt);
  }

  useAbility(id) {
    const method = {
      strike: 'useStrike',
      brand: 'useBrand',
      heal: 'useHeal',
      meditation: 'useMeditation',
    }[id];
    if (method) this[method]();
  }

  getResource(id) {
    return this.resources[id] ?? 0;
  }

  addResource(id, amount) {
    const resource = C.resources[id];
    if (!resource) return 0;
    this.resources[id] = clamp(this.getResource(id) + amount, 0, resource.max);
    return this.resources[id];
  }

  spendMana(amount) {
    if (this.getResource('mana') < amount) return false;
    this.resources.mana -= amount;
    return true;
  }

  getPrimaryResourceState() {
    const resource = C.resources[C.primaryResource];
    return {
      id: C.primaryResource,
      label: resource.name,
      current: this.getResource(C.primaryResource),
      max: resource.max,
      color: resource.color,
    };
  }

  getAbilityResourceState() {
    return null;
  }

  getAbilityAvailability(id) {
    const ability = C.abilities[id];
    if (!ability || !this.alive || !this.game.boss?.alive) return { available: false, reason: 'Unavailable' };
    if (this.cast) return { available: false, reason: 'Already casting' };
    if ((this.cooldowns[id] ?? 0) > 0) return { available: false, reason: 'On cooldown' };

    if (id === 'strike') {
      const inRange = distance(this, this.game.boss) <= ability.meleeRange;
      return inRange
        ? { available: true }
        : { available: false, reason: 'Move into melee range' };
    }

    if (ability.manaCost && this.getResource('mana') < ability.manaCost) {
      return { available: false, reason: `Need ${ability.manaCost} mana` };
    }

    return { available: true };
  }

  tryUse(id) {
    const availability = this.getAbilityAvailability(id);
    if (availability.available) return true;
    if (availability.reason && availability.reason !== 'On cooldown' && availability.reason !== 'Already casting') {
      this.game.flashMessage(availability.reason);
    }
    return false;
  }

  useStrike() {
    if (!this.tryUse('strike')) return;
    const a = C.abilities.strike;
    this.cooldowns.strike = a.cooldown;
    this.game.damageBoss(a.damage, a.name);
    this.game.spawnBurst(this.game.boss.x, this.game.boss.y, C.visual.holy, 44);
    const before = this.getResource('mana');
    const after = this.addResource('mana', a.manaRestore);
    if (after > before) this.game.spawnFloatingText(this.x, this.y - 46, `+${after - before} Mana`, '#8ea8ff');
  }

  useBrand() {
    if (!this.tryUse('brand')) return;
    const a = C.abilities.brand;
    this.startCast('brand', a.name, a.castTime, () => {
      if (!this.spendMana(a.manaCost)) return;
      this.applyBossDot();
    });
  }

  useHeal() {
    if (!this.tryUse('heal')) return;
    const a = C.abilities.heal;
    this.startCast('heal', a.name, a.castTime, () => {
      if (!this.spendMana(a.manaCost)) return;
      this.heal(a.heal);
    });
  }

  useMeditation() {
    if (!this.tryUse('meditation')) return;
    const a = C.abilities.meditation;
    this.cooldowns.meditation = a.cooldown;
    this.shielded = true;
    this.game.flashMessage('Divine shield active');
    this.startCast('meditation', a.name, a.castTime, () => {
      this.shielded = false;
      const before = this.getResource('mana');
      const after = this.addResource('mana', a.manaRestore);
      this.game.spawnFloatingText(this.x, this.y - 46, `+${after - before} Mana`, '#8ea8ff');
    }, {
      onCancel: () => { this.shielded = false; },
    });
  }

  applyBossDot() {
    const a = C.abilities.brand;
    const dot = a.dot;
    this.bossDot = {
      remaining: dot.duration,
      tickTimer: dot.tickEvery,
      tickEvery: dot.tickEvery,
      damagePerTick: dot.damagePerTick,
    };
    this.game.flashMessage(`${a.name} applied`);
  }

  updateBossDot(dt) {
    if (!this.bossDot || !this.game.boss?.alive) {
      if (!this.game.boss?.alive) this.bossDot = null;
      return;
    }

    this.bossDot.remaining -= dt;
    this.bossDot.tickTimer -= dt;
    while (this.bossDot.tickTimer <= 0 && this.bossDot.remaining > -0.001) {
      this.bossDot.tickTimer += this.bossDot.tickEvery;
      this.game.damageBoss(this.bossDot.damagePerTick, C.abilities.brand.name);
    }

    if (this.bossDot.remaining <= 0) this.bossDot = null;
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
    this.x = clamp(this.x, 30, this.game.worldWidth - 30);
    this.y = clamp(this.y, 30, this.game.worldHeight - 30);
  }

  startCast(id, name, duration, onComplete, options = {}) {
    this.cast = {
      id,
      name,
      duration,
      remaining: duration,
      onComplete,
      onCancel: options.onCancel ?? null,
      canMove: options.canMove === true,
    };
  }

  cancelCast() {
    if (!this.cast) return;
    const cast = this.cast;
    this.cast = null;
    cast.onCancel?.();
    this.game.flashMessage(`${cast.name} interrupted by movement`);
  }

  updateCast(dt) {
    if (!this.cast) return;
    const cast = this.cast;
    cast.remaining -= dt;
    if (cast.remaining > 0) return;
    this.cast = null;
    cast.onComplete?.();
  }

  heal(amount) {
    if (!this.alive) return;
    const before = this.health;
    this.health = Math.min(C.maxHealth, this.health + amount);
    this.game.spawnFloatingText(this.x, this.y - 28, `+${Math.round(this.health - before)}`, '#9df0ad');
  }

  takeDamage(amount, source = 'Damage') {
    if (!this.alive) return;
    if (this.shielded) {
      this.game.spawnFloatingText(this.x, this.y - 34, 'BLOCKED', C.visual.shield);
      return;
    }

    this.health = Math.max(0, this.health - amount);
    this.game.spawnFloatingText(this.x, this.y - 28, `-${amount}`, '#ff7777');
    this.game.shake = Math.max(this.game.shake, 5);
    if (this.health <= 0) {
      this.alive = false;
      this.cast = null;
      this.shielded = false;
      this.game.onPlayerDefeated(source);
    }
  }

  draw(ctx) {
    if (this.bossDot && this.game.boss?.alive) {
      const pulse = 1 + Math.sin(this.game.time * 5) * 0.08;
      ctx.save();
      ctx.translate(this.game.boss.x, this.game.boss.y);
      ctx.scale(pulse, pulse);
      ctx.strokeStyle = C.visual.holy;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(0, 0, (this.game.boss.config?.radius ?? 40) + 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.shielded) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = C.visual.shield;
      ctx.beginPath();
      ctx.arc(0, 0, C.radius + 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = C.visual.shield;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = C.visual.body;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.visual.core;
    ctx.beginPath();
    ctx.arc(0, -3, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#765d22';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-13, 11);
    ctx.lineTo(0, 21);
    ctx.lineTo(13, 11);
    ctx.stroke();
    ctx.restore();
  }
}
