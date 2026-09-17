import { clamp, distance } from '../../../core/geometry.js';
import { DRUID_CONFIG as C } from './config.js';

const FORM_ABILITY_IDS = ['bearForm', 'monkeyForm', 'pumaForm', 'pandaForm'];

export class Druid {
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
    this.form = null;
    this.lastMove = { x: 0, y: -1 };
    this.alive = true;
  }

  getAbilityBarConfig() {
    const abilities = {};
    for (const id of FORM_ABILITY_IDS) abilities[id] = C.abilities[id];
    if (this.form) {
      for (const id of C.forms[this.form].abilities) abilities[id] = C.abilities[id];
    }
    return {
      id: `${C.id}-${this.form ?? 'caster'}`,
      abilities,
    };
  }

  update(dt, input) {
    if (!this.alive) return;
    for (const key of Object.keys(this.cooldowns)) {
      this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    }
    this.updateEffects(dt);

    const dx = (input.isActionHeld('moveRight') ? 1 : 0) - (input.isActionHeld('moveLeft') ? 1 : 0);
    const dy = (input.isActionHeld('moveDown') ? 1 : 0) - (input.isActionHeld('moveUp') ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      this.lastMove = { x: dx / length, y: dy / length };
      this.x += this.lastMove.x * C.moveSpeed * dt;
      this.y += this.lastMove.y * C.moveSpeed * dt;
      this.clampPosition();
      this.resolveBossCollision();
      if (this.cast) this.cancelCast();
    }

    this.updateCast(dt);
  }

  useAbility(id) {
    if (FORM_ABILITY_IDS.includes(id)) {
      this.shapeshift(C.abilities[id].form);
      return;
    }

    const method = {
      bearMaul: 'useBearMaul',
      bearEarthbreaker: 'useEarthbreaker',
      monkeyVault: 'usePrimalVault',
      monkeyRetreat: 'useRetreat',
      pumaClaw: 'usePumaClaw',
      pumaRake: 'useRake',
      pandaMend: 'useSoothingPaw',
      pandaRenewal: 'useBambooRenewal',
    }[id];
    if (method) this[method]();
  }

  shapeshift(form) {
    if (!this.alive || this.cast || !C.forms[form] || this.form === form) return;
    this.form = form;
    this.game.spawnBurst(this.x, this.y, C.visual[form], 42);
    this.game.flashMessage(C.forms[form].name);
    this.game.requestAbilityBarRebuild?.();
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

    if (FORM_ABILITY_IDS.includes(id)) {
      if (this.form === ability.form) return { available: false, reason: `Already in ${C.forms[ability.form].name}` };
      return { available: !this.cast, reason: this.cast ? 'Cannot shapeshift while casting' : '' };
    }

    if ((this.cooldowns[id] ?? 0) > 0) return { available: false, reason: 'On cooldown' };
    if (ability.meleeRange && !this.isInMeleeRange(ability.meleeRange)) {
      return { available: false, reason: 'Move into melee range' };
    }
    return { available: true };
  }

  useBearMaul() {
    const id = 'bearMaul';
    const a = C.abilities[id];
    if (!this.canUse(id) || !this.isInMeleeRange(a.meleeRange)) return;
    this.cooldowns[id] = a.cooldown;
    this.game.damageBoss(a.damage, a.name);
    this.game.spawnBurst(this.game.boss.x, this.game.boss.y, C.visual.bear, 34);
  }

  useEarthbreaker() {
    const id = 'bearEarthbreaker';
    const a = C.abilities[id];
    if (!this.canUse(id) || !this.isInMeleeRange(a.meleeRange)) return;
    this.cooldowns[id] = a.cooldown;
    this.game.damageBoss(a.damage, a.name);
    this.game.spawnBurst(this.game.boss.x, this.game.boss.y, '#d8aa72', 72);
    this.game.shake = Math.max(this.game.shake, 7);
  }

  usePrimalVault() {
    const id = 'monkeyVault';
    const a = C.abilities[id];
    if (!this.canUse(id)) return;
    this.cooldowns[id] = a.cooldown;

    let direction = this.lastMove;
    if (!direction || Math.hypot(direction.x, direction.y) < 0.1) {
      direction = this.directionToBoss();
    }
    this.leap(direction.x, direction.y, a.distance, '#e5b15f');
  }

  useRetreat() {
    const id = 'monkeyRetreat';
    const a = C.abilities[id];
    if (!this.canUse(id)) return;
    this.cooldowns[id] = a.cooldown;
    const towardBoss = this.directionToBoss();
    this.leap(-towardBoss.x, -towardBoss.y, a.distance, '#f0c980');
  }

  usePumaClaw() {
    const id = 'pumaClaw';
    const a = C.abilities[id];
    if (!this.canUse(id) || !this.isInMeleeRange(a.meleeRange)) return;
    this.cooldowns[id] = a.cooldown;
    this.game.damageBoss(a.damage, a.name);
    this.game.spawnBurst(this.game.boss.x, this.game.boss.y, C.visual.puma, 24);
  }

  useRake() {
    const id = 'pumaRake';
    const a = C.abilities[id];
    if (!this.canUse(id) || !this.isInMeleeRange(a.meleeRange)) return;
    this.cooldowns[id] = a.cooldown;
    this.game.damageBoss(a.damage, a.name);
    this.game.spawnBurst(this.game.boss.x, this.game.boss.y, '#b49ce9', 30);
  }

  useSoothingPaw() {
    const id = 'pandaMend';
    const a = C.abilities[id];
    if (!this.canUse(id)) return;
    this.cooldowns[id] = a.cooldown;
    this.heal(a.heal);
  }

  useBambooRenewal() {
    const id = 'pandaRenewal';
    const a = C.abilities[id];
    if (!this.canUse(id)) return;
    this.cooldowns[id] = a.cooldown;
    this.effects = this.effects.filter((effect) => effect.id !== id);
    this.effects.push({
      id,
      remaining: a.duration,
      tickTimer: a.tickEvery,
      ticksRemaining: Math.round(a.duration / a.tickEvery),
    });
    this.game.flashMessage(a.name);
  }

  updateEffects(dt) {
    const renewal = C.abilities.pandaRenewal;
    for (const effect of this.effects) {
      effect.remaining -= dt;
      effect.tickTimer -= dt;
      if (effect.id === 'pandaRenewal') {
        while (effect.tickTimer <= 0 && effect.ticksRemaining > 0) {
          effect.tickTimer += renewal.tickEvery;
          effect.ticksRemaining -= 1;
          this.heal(renewal.healPerTick);
        }
      }
    }
    this.effects = this.effects.filter((effect) => effect.remaining > 0 && effect.ticksRemaining !== 0);
  }

  startCast(id, name, duration, onComplete) {
    this.cast = { id, name, duration, remaining: duration, onComplete };
  }

  updateCast(dt) {
    if (!this.cast) return;
    const cast = this.cast;
    cast.remaining -= dt;
    if (cast.remaining > 0) return;
    this.cast = null;
    cast.onComplete?.();
  }

  cancelCast() {
    if (!this.cast) return;
    this.game.flashMessage(`${this.cast.name} interrupted by movement`);
    this.cast = null;
  }

  directionToBoss() {
    const boss = this.game.boss;
    if (!boss) return { x: 0, y: -1 };
    const dx = boss.x - this.x;
    const dy = boss.y - this.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  leap(dx, dy, leapDistance, color) {
    const length = Math.hypot(dx, dy) || 1;
    this.game.spawnBurst(this.x, this.y, color, 30);
    this.x += (dx / length) * leapDistance;
    this.y += (dy / length) * leapDistance;
    this.clampPosition();
    this.resolveBossCollision();
    this.game.spawnBurst(this.x, this.y, color, 30);
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
    if (healed > 0) this.game.spawnFloatingText(this.x, this.y - 28, `+${Math.ceil(healed)}`, '#86e6a1');
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
    const form = this.form ?? 'caster';
    const bodyColor = C.visual[form];
    ctx.save();
    ctx.translate(this.x, this.y);

    if (form === 'bear') {
      ctx.fillStyle = bodyColor;
      ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-16, -16, 8, 0, Math.PI * 2); ctx.arc(16, -16, 8, 0, Math.PI * 2); ctx.fill();
    } else if (form === 'monkey') {
      ctx.fillStyle = bodyColor;
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = bodyColor; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(18, 8, 18, -1.2, 1.4); ctx.stroke();
    } else if (form === 'puma') {
      ctx.fillStyle = bodyColor;
      ctx.beginPath(); ctx.ellipse(0, 2, 25, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-14, -9); ctx.lineTo(-7, -23); ctx.lineTo(0, -9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(5, -9); ctx.lineTo(12, -23); ctx.lineTo(19, -7); ctx.fill();
    } else if (form === 'panda') {
      ctx.fillStyle = bodyColor;
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#343943';
      ctx.beginPath(); ctx.arc(-15, -16, 8, 0, Math.PI * 2); ctx.arc(15, -16, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-8, -4, 5, 0, Math.PI * 2); ctx.arc(8, -4, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = bodyColor;
      ctx.beginPath(); ctx.arc(0, 0, C.radius, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = C.visual.core;
    ctx.beginPath(); ctx.arc(0, 2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
