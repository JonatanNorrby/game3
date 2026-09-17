import { clamp } from '../../../core/geometry.js';
import { HUNTER_CONFIG as C } from './config.js';

export class Hunter {
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
    this.resources = Object.fromEntries(Object.entries(C.resources ?? {}).map(([id, config]) => [id, config.start ?? 0]));
    this.cast = null;
    this.frenzyRemaining = 0;
    this.bandageTargeting = false;
    this.alive = true;
    this.pet = this.createPet();
  }

  createPet() {
    const pet = {
      name: C.pet.name,
      x: this.x + C.pet.homeOffset.x,
      y: this.y + C.pet.homeOffset.y,
      health: C.pet.maxHealth,
      maxHealth: C.pet.maxHealth,
      radius: C.pet.radius,
      alive: true,
      mode: 'home',
      leap: null,
      autoAttackTimer: C.pet.autoAttackEvery,
    };
    pet.takeDamage = (amount, source) => this.takePetDamage(amount, source);
    return pet;
  }

  update(dt, input) {
    if (!this.alive) return;

    for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    this.frenzyRemaining = Math.max(0, this.frenzyRemaining - dt);

    const dx = (input.isActionHeld('moveRight') ? 1 : 0) - (input.isActionHeld('moveLeft') ? 1 : 0);
    const dy = (input.isActionHeld('moveDown') ? 1 : 0) - (input.isActionHeld('moveUp') ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;

    if (moving) {
      const length = Math.hypot(dx, dy);
      const castSpeedMultiplier = this.cast?.moveSpeedMultiplier ?? 1;
      this.x += (dx / length) * C.moveSpeed * castSpeedMultiplier * dt;
      this.y += (dy / length) * C.moveSpeed * castSpeedMultiplier * dt;
      this.x = clamp(this.x, 30, this.game.worldWidth - 30);
      this.y = clamp(this.y, 30, this.game.worldHeight - 30);
      if (this.cast && !this.cast.canMove) this.cancelCast();
    }

    this.updateCast(dt);
    this.updatePet(dt);
  }

  handleSpecialInput(input) {
    if (!this.bandageTargeting) return false;

    if (input.consume('escape')) {
      this.bandageTargeting = false;
      this.game.flashMessage('Bandage cancelled');
      return true;
    }

    if (input.consume('1')) {
      this.bandageTargeting = false;
      this.startBandage(this, 'Hunter');
      return true;
    }

    if (input.consume('2')) {
      this.bandageTargeting = false;
      if (!this.pet.alive) {
        this.game.flashMessage('Tiger is dead — revive it first');
      } else {
        this.startBandage(this.pet, C.pet.name);
      }
      return true;
    }

    return false;
  }

  useAbility(id) {
    if (id !== 'bandage' && this.bandageTargeting) this.bandageTargeting = false;
    const method = {
      bowShot: 'useBowShot',
      frenzy: 'useFrenzy',
      bandage: 'useBandage',
      petAttack: 'usePetAttack',
      petReturn: 'usePetReturn',
      revivePet: 'useRevivePet',
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

  getPrimaryResourceState() {
    const id = C.primaryResource;
    const config = C.resources[id];
    return {
      current: this.getResource(id),
      max: config.max,
      label: config.name,
      color: config.color,
    };
  }

  getAbilityResourceState(abilityId) {
    const resourceId = C.abilities[abilityId]?.resource;
    if (!resourceId) return null;
    const config = C.resources[resourceId];
    return {
      current: this.getResource(resourceId),
      max: config.max,
      label: config.name,
    };
  }

  getAbilityAvailability(id) {
    if (id === 'frenzy' && this.getResource('fury') < C.abilities.frenzy.furyCost) {
      return { available: false, reason: `Requires ${C.abilities.frenzy.furyCost} Fury` };
    }
    if ((id === 'petAttack' || id === 'petReturn') && !this.pet.alive) {
      return { available: false, reason: 'Tiger is dead' };
    }
    if (id === 'petReturn' && this.pet.alive && this.pet.mode === 'home' && !this.pet.leap) {
      return { available: false, reason: 'Tiger is already with you' };
    }
    if (id === 'revivePet' && this.pet.alive) {
      return { available: false, reason: 'Tiger is alive' };
    }
    return { available: true };
  }

  getCompanionState() {
    return {
      name: C.pet.name,
      health: this.pet.health,
      maxHealth: C.pet.maxHealth,
      alive: this.pet.alive,
      color: C.pet.visual.body,
    };
  }

  getEncounterTargets() {
    const targets = [this];
    if (this.pet.alive) targets.push(this.pet);
    return targets;
  }

  canUse(id) {
    return this.alive && !this.cast && (this.cooldowns[id] ?? 0) <= 0 && this.game.boss?.alive;
  }

  useBowShot() {
    if (!this.canUse('bowShot')) return;
    const a = C.abilities.bowShot;
    this.startCast('bowShot', a.name, a.castTime, () => {
      if (!this.game.boss?.alive) return;
      this.game.damageBoss(this.modifiedDamage(a.damage), a.name);
      this.game.spawnProjectile(this, this.game.boss, C.visual.arrow, 0.22);
      this.addResource('fury', a.furyGain);
      this.cooldowns.bowShot = a.cooldown;
    });
  }

  useFrenzy() {
    const a = C.abilities.frenzy;
    if (!this.canUse('frenzy')) return;
    if (this.getResource('fury') < a.furyCost) {
      this.game.flashMessage(`Requires ${a.furyCost} Fury`);
      return;
    }
    this.resources.fury -= a.furyCost;
    this.frenzyRemaining = a.duration;
    this.game.flashMessage('FRENZY');
  }

  useBandage() {
    if (!this.canUse('bandage')) return;
    this.bandageTargeting = true;
    this.game.flashMessage('Bandage: press 1 for Hunter or 2 for Tiger', 3.5);
  }

  startBandage(target, targetName) {
    const a = C.abilities.bandage;
    if (!this.alive || this.cast || !target.alive) return;
    const ticks = Math.max(1, Math.round(a.duration / a.tickEvery));
    const maxHealth = target === this ? C.maxHealth : C.pet.maxHealth;
    const healPerTick = maxHealth * a.maxHealingPercent / ticks;

    this.startCast('bandage', `${a.name} — ${targetName}`, a.duration, null, {
      tickEvery: a.tickEvery,
      ticks,
      onTick: () => this.healTarget(target, healPerTick),
    });
  }

  usePetAttack() {
    const a = C.abilities.petAttack;
    if (!this.pet.alive || !this.game.boss?.alive || (this.cooldowns.petAttack ?? 0) > 0) return;
    this.cooldowns.petAttack = a.cooldown;
    this.startPetLeap('engaged');
  }

  usePetReturn() {
    const a = C.abilities.petReturn;
    if (!this.pet.alive || (this.cooldowns.petReturn ?? 0) > 0) return;
    this.cooldowns.petReturn = a.cooldown;
    this.startPetLeap('home');
  }

  useRevivePet() {
    const a = C.abilities.revivePet;
    if (this.pet.alive || !this.canUse('revivePet')) return;
    this.startCast('revivePet', a.name, a.castTime, () => {
      this.pet.alive = true;
      this.pet.health = C.pet.maxHealth;
      this.pet.mode = 'home';
      this.pet.leap = null;
      this.pet.autoAttackTimer = C.pet.autoAttackEvery;
      const home = this.getPetDestination('home');
      this.pet.x = home.x;
      this.pet.y = home.y;
      this.game.flashMessage('Tiger revived');
    }, {
      canMove: true,
      moveSpeedMultiplier: a.moveSpeedMultiplier,
    });
  }

  modifiedDamage(amount) {
    const multiplier = this.frenzyRemaining > 0 ? C.abilities.frenzy.damageMultiplier : 1;
    return Math.round(amount * multiplier);
  }

  startPetLeap(destination) {
    this.pet.leap = {
      destination,
      fromX: this.pet.x,
      fromY: this.pet.y,
      elapsed: 0,
      duration: C.pet.leapDuration,
    };
    this.pet.mode = 'leaping';
  }

  getPetDestination(destination) {
    if (destination === 'home' || !this.game.boss?.alive) {
      return {
        x: clamp(this.x + C.pet.homeOffset.x, 30, this.game.worldWidth - 30),
        y: clamp(this.y + C.pet.homeOffset.y, 30, this.game.worldHeight - 30),
      };
    }

    const boss = this.game.boss;
    let dx = this.x - boss.x;
    let dy = this.y - boss.y;
    const length = Math.hypot(dx, dy) || 1;
    const range = (boss.config?.radius ?? 40) + C.pet.radius + C.pet.engagedOffset;
    return {
      x: boss.x + dx / length * range,
      y: boss.y + dy / length * range,
    };
  }

  updatePet(dt) {
    if (!this.pet.alive) return;

    if (this.pet.leap) {
      const leap = this.pet.leap;
      leap.elapsed += dt;
      const target = this.getPetDestination(leap.destination);
      const raw = Math.min(1, leap.elapsed / leap.duration);
      const t = raw * raw * (3 - 2 * raw);
      this.pet.x = leap.fromX + (target.x - leap.fromX) * t;
      this.pet.y = leap.fromY + (target.y - leap.fromY) * t;

      if (raw >= 1) {
        const destination = leap.destination;
        this.pet.leap = null;
        this.pet.mode = destination;
        if (destination === 'engaged' && this.game.boss?.alive) {
          this.game.damageBoss(this.modifiedDamage(C.abilities.petAttack.pounceDamage), C.abilities.petAttack.name);
          this.pet.autoAttackTimer = 0.25;
        }
      }
      return;
    }

    if (this.pet.mode === 'home') {
      const home = this.getPetDestination('home');
      this.pet.x = home.x;
      this.pet.y = home.y;
      return;
    }

    if (this.pet.mode === 'engaged') {
      if (!this.game.boss?.alive) {
        this.pet.mode = 'home';
        return;
      }
      const target = this.getPetDestination('engaged');
      this.pet.x = target.x;
      this.pet.y = target.y;
      this.pet.autoAttackTimer -= dt;
      if (this.pet.autoAttackTimer <= 0) {
        this.pet.autoAttackTimer += C.pet.autoAttackEvery;
        this.game.damageBoss(this.modifiedDamage(C.pet.autoAttackDamage), `${C.pet.name} attack`);
      }
    }
  }

  startCast(id, name, duration, onComplete, options = {}) {
    this.cast = {
      id,
      name,
      duration,
      remaining: duration,
      onComplete,
      canMove: options.canMove === true,
      moveSpeedMultiplier: options.moveSpeedMultiplier ?? 1,
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

  healTarget(target, amount) {
    if (target === this) this.heal(amount);
    else if (target === this.pet) this.healPet(amount);
  }

  heal(amount) {
    if (!this.alive) return;
    const before = this.health;
    this.health = Math.min(C.maxHealth, this.health + amount);
    const healed = Math.round(this.health - before);
    if (healed > 0) this.game.spawnFloatingText(this.x, this.y - 28, `+${healed}`, '#8ee29a');
  }

  healPet(amount) {
    if (!this.pet.alive) return;
    const before = this.pet.health;
    this.pet.health = Math.min(C.pet.maxHealth, this.pet.health + amount);
    const healed = Math.round(this.pet.health - before);
    if (healed > 0) this.game.spawnFloatingText(this.pet.x, this.pet.y - 28, `+${healed}`, '#8ee29a');
  }

  takeDamage(amount, source = 'Damage') {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.game.spawnFloatingText(this.x, this.y - 28, `-${amount}`, '#ff7777');
    this.game.shake = Math.max(this.game.shake, 5);
    if (this.health <= 0) {
      this.alive = false;
      this.cast = null;
      this.bandageTargeting = false;
      this.game.onPlayerDefeated(source);
    }
  }

  takePetDamage(amount, source = 'Damage') {
    if (!this.pet.alive) return;
    this.pet.health = Math.max(0, this.pet.health - amount);
    this.game.spawnFloatingText(this.pet.x, this.pet.y - 28, `-${amount}`, '#ff9b6b');
    if (this.pet.health <= 0) {
      this.pet.alive = false;
      this.pet.mode = 'dead';
      this.pet.leap = null;
      this.game.flashMessage(`${C.pet.name} was killed by ${source}`, 2.2);
    }
  }

  draw(ctx) {
    this.drawPet(ctx);

    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.frenzyRemaining > 0) {
      ctx.strokeStyle = C.visual.frenzy;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, C.radius + 8 + Math.sin(this.game.time * 8) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = C.visual.body;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.visual.core;
    ctx.beginPath();
    ctx.arc(0, -3, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#435b35';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(8, 0, 14, -1.1, 1.1);
    ctx.stroke();
    ctx.restore();
  }

  drawPet(ctx) {
    ctx.save();
    ctx.translate(this.pet.x, this.pet.y);

    if (!this.pet.alive) {
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = C.pet.visual.stripe;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-12, -12);
      ctx.lineTo(12, 12);
      ctx.moveTo(12, -12);
      ctx.lineTo(-12, 12);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (this.frenzyRemaining > 0) {
      ctx.strokeStyle = C.visual.frenzy;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(0, 0, C.pet.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = C.pet.visual.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, C.pet.radius + 3, C.pet.radius - 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.pet.visual.core;
    ctx.beginPath();
    ctx.arc(10, -2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.pet.visual.stripe;
    ctx.lineWidth = 3;
    for (const x of [-9, -2, 5]) {
      ctx.beginPath();
      ctx.moveTo(x, -10);
      ctx.lineTo(x + 4, 8);
      ctx.stroke();
    }
    ctx.restore();
  }
}
