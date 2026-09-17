import { clamp, distance } from '../../../core/geometry.js';
import { MONK_CONFIG as C } from './config.js';

const COLOR_ABILITY_IDS = ['blueStrike', 'greenStrike', 'redStrike'];

export class Monk {
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
    this.cast = null;
    this.comboStarter = null;
    this.shield = { amount: 0, remaining: 0 };
    this.speedBoost = { multiplier: 1, remaining: 0 };
    this.alive = true;
  }

  update(dt, input) {
    if (!this.alive) return;

    for (const key of Object.keys(this.cooldowns)) {
      this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    }

    this.updateEffects(dt);
    this.updateShield(dt);
    this.updateSpeedBoost(dt);

    const dx = (input.isActionHeld('moveRight') ? 1 : 0) - (input.isActionHeld('moveLeft') ? 1 : 0);
    const dy = (input.isActionHeld('moveDown') ? 1 : 0) - (input.isActionHeld('moveUp') ? 1 : 0);

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      const moveSpeed = C.moveSpeed * this.speedBoost.multiplier;
      this.x += (dx / length) * moveSpeed * dt;
      this.y += (dy / length) * moveSpeed * dt;
      this.clampPosition();
      this.resolveBossCollision();
    }
  }

  useAbility(id) {
    if (COLOR_ABILITY_IDS.includes(id)) this.useColorStrike(id);
  }

  canUse(id) {
    return this.alive && !this.cast && (this.cooldowns[id] ?? 0) <= 0 && this.game.boss?.alive;
  }

  isInMeleeRange(range) {
    return Boolean(this.game.boss?.alive) && distance(this, this.game.boss) <= range;
  }

  getAbilityAvailability(id) {
    const ability = C.abilities[id];
    if (!ability) return { available: false, reason: 'Unavailable' };
    if ((this.cooldowns[id] ?? 0) > 0) return { available: false, reason: 'On cooldown' };
    if (ability.meleeRange && !this.isInMeleeRange(ability.meleeRange)) {
      return { available: false, reason: 'Move into melee range' };
    }
    return { available: true };
  }

  useColorStrike(id) {
    const ability = C.abilities[id];
    if (!ability || !this.canUse(id) || !this.isInMeleeRange(ability.meleeRange)) return;

    this.cooldowns[id] = ability.cooldown;
    this.game.damageBoss(ability.damage, ability.name);
    this.game.spawnBurst(this.game.boss.x, this.game.boss.y, C.visual[ability.color], 28);
    this.advanceCombo(ability.color);
  }

  advanceCombo(color) {
    if (!this.comboStarter || this.comboStarter === color) {
      this.comboStarter = color;
      this.game.flashMessage(`${this.colorLabel(color)} combo armed`, 0.8);
      return;
    }

    const first = this.comboStarter;
    this.comboStarter = null;
    this.resolveCombo(first, color);
  }

  resolveCombo(first, second) {
    const key = `${first}${second[0].toUpperCase()}${second.slice(1)}`;
    const combo = C.combos[key];
    if (!combo) return;

    if (combo.shield) {
      this.shield.amount = combo.shield;
      this.shield.remaining = combo.duration;
      this.game.spawnBurst(this.x, this.y, C.visual.shield, 50);
    } else if (combo.speedMultiplier) {
      this.speedBoost.multiplier = combo.speedMultiplier;
      this.speedBoost.remaining = combo.duration;
      this.game.spawnBurst(this.x, this.y, C.visual.blue, 44);
    } else if (combo.damage && key !== 'redGreen') {
      this.game.spawnProjectile(this, this.game.boss, C.visual.blue, combo.projectileDuration ?? 0.3);
      this.game.damageBoss(combo.damage, combo.name);
    } else if (combo.heal) {
      this.heal(combo.heal);
    } else if (combo.healPerTick) {
      this.replaceEffect({
        id: key,
        type: 'hot',
        remaining: combo.duration,
        tickTimer: combo.tickEvery,
        ticksRemaining: Math.round(combo.duration / combo.tickEvery),
      });
    } else if (combo.damagePerTick) {
      this.replaceEffect({
        id: key,
        type: 'dot',
        remaining: combo.duration,
        tickTimer: combo.tickEvery,
        ticksRemaining: Math.round(combo.duration / combo.tickEvery),
      });
    }

    this.game.flashMessage(combo.name, 1.0);
  }

  replaceEffect(effect) {
    this.effects = this.effects.filter((existing) => existing.id !== effect.id);
    this.effects.push(effect);
  }

  updateEffects(dt) {
    for (const effect of this.effects) {
      effect.remaining -= dt;
      effect.tickTimer -= dt;
      const combo = C.combos[effect.id];
      if (!combo) continue;

      while (effect.tickTimer <= 0 && effect.ticksRemaining > 0) {
        effect.tickTimer += combo.tickEvery;
        effect.ticksRemaining -= 1;
        if (effect.type === 'hot') this.heal(combo.healPerTick);
        if (effect.type === 'dot' && this.game.boss?.alive) {
          this.game.damageBoss(combo.damagePerTick, combo.name);
          this.game.spawnBurst(this.game.boss.x, this.game.boss.y, C.visual.red, 18);
        }
      }
    }

    this.effects = this.effects.filter((effect) => effect.remaining > 0 && effect.ticksRemaining !== 0);
  }

  updateShield(dt) {
    if (this.shield.remaining <= 0 || this.shield.amount <= 0) {
      this.shield.amount = 0;
      this.shield.remaining = 0;
      return;
    }

    this.shield.remaining = Math.max(0, this.shield.remaining - dt);
    if (this.shield.remaining <= 0) this.shield.amount = 0;
  }

  updateSpeedBoost(dt) {
    if (this.speedBoost.remaining <= 0) {
      this.speedBoost.multiplier = 1;
      this.speedBoost.remaining = 0;
      return;
    }

    this.speedBoost.remaining = Math.max(0, this.speedBoost.remaining - dt);
    if (this.speedBoost.remaining <= 0) this.speedBoost.multiplier = 1;
  }

  colorLabel(color) {
    return color[0].toUpperCase() + color.slice(1);
  }

  clampPosition() {
    this.x = clamp(this.x, 30, this.game.worldWidth - 30);
    this.y = clamp(this.y, 30, this.game.worldHeight - 30);
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
    this.clampPosition();
  }

  heal(amount) {
    if (!this.alive) return;
    const before = this.health;
    this.health = Math.min(C.maxHealth, this.health + amount);
    const healed = this.health - before;
    if (healed > 0) this.game.spawnFloatingText(this.x, this.y - 30, `+${Math.ceil(healed)}`, '#86e6a1');
  }

  takeDamage(amount, source = 'Damage') {
    if (!this.alive) return;

    let remaining = amount;
    if (this.shield.amount > 0 && this.shield.remaining > 0) {
      const blocked = Math.min(this.shield.amount, remaining);
      this.shield.amount -= blocked;
      remaining -= blocked;
      if (blocked > 0) this.game.spawnFloatingText(this.x, this.y - 46, `BLOCK ${Math.ceil(blocked)}`, C.visual.shield);
      if (this.shield.amount <= 0) this.shield.remaining = 0;
    }

    if (remaining <= 0) return;
    this.health = Math.max(0, this.health - remaining);
    this.game.spawnFloatingText(this.x, this.y - 28, `-${Math.ceil(remaining)}`, '#ff7777');
    this.game.shake = Math.max(this.game.shake, 5);

    if (this.health <= 0) {
      this.alive = false;
      this.game.onPlayerDefeated(source);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.speedBoost.remaining > 0) {
      ctx.strokeStyle = C.visual.blue;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.arc(0, 0, C.radius + 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (this.shield.amount > 0 && this.shield.remaining > 0) {
      ctx.strokeStyle = C.visual.shield;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(0, 0, C.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (this.comboStarter) {
      ctx.strokeStyle = C.visual[this.comboStarter];
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, C.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = C.visual.body;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.visual.core;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.visual.blue;
    ctx.beginPath(); ctx.arc(-9, -8, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.visual.green;
    ctx.beginPath(); ctx.arc(9, -8, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.visual.red;
    ctx.beginPath(); ctx.arc(0, 10, 4, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }
}
