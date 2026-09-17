import { clamp, distance, pointInCone } from '../../../core/geometry.js';
import { BELLKEEPER_CONFIG as C } from './config.js';

const BELL_RADIUS = 31;

export class Bellkeeper {
  constructor(game) {
    this.game = game;
    this.config = C;
    this.reset();
  }

  reset() {
    this.x = this.game.worldWidth * C.position.x;
    this.y = this.game.worldHeight * C.position.y;
    this.health = C.maxHealth;
    this.alive = true;
    this.targetable = true;
    this.facing = Math.PI / 2;
    this.phase = 1;
    this.sequenceIndex = 0;
    this.nextMechanic = C.encounter.openingDelay;
    this.cast = null;
    this.projectiles = [];
    this.hazards = [];
    this.wrongOrderStacks = 0;
    this.nextBellIndex = 0;

    this.bells = C.bells.order.map((id) => {
      const config = C.bells.entries[id];
      return {
        id,
        name: config.name,
        config: { name: config.name, radius: BELL_RADIUS },
        x: this.game.worldWidth * config.position.x,
        y: this.game.worldHeight * config.position.y,
        radius: BELL_RADIUS,
        color: config.color,
        health: C.bells.maxHealth,
        maxHealth: C.bells.maxHealth,
        alive: true,
        targetable: true,
        interactable: true,
        wardFlashCooldown: 0,
        takeDamage: (amount, source = 'Player') => this.damageBell(id, amount, source),
      };
    });

    this.silenceZones = C.modifiers.silence.zones.map((zone) => ({
      x: this.game.worldWidth * zone.x,
      y: this.game.worldHeight * zone.y,
      radius: C.modifiers.silence.radius,
    }));
  }

  getHostileTargets() {
    return [this, ...this.bells.filter((bell) => bell.alive && bell.targetable)];
  }

  getBell(id) {
    return this.bells.find((bell) => bell.id === id) ?? null;
  }

  isBellActive(id) {
    return this.getBell(id)?.alive === true;
  }

  getNextBell() {
    const id = C.bells.order[this.nextBellIndex];
    return id ? this.getBell(id) : null;
  }

  interactWithTarget(target, player) {
    const bell = this.bells.find((candidate) => candidate === target);
    if (!bell || !bell.alive) return false;

    if (distance(player, bell) > C.bells.interactionRange) {
      this.game.flashMessage(`Move closer to ${bell.name}`, 1.0);
      return true;
    }

    this.activateBell(bell);
    return true;
  }

  activateBell(bell) {
    const expected = this.getNextBell();
    if (!expected || bell !== expected) {
      this.punishWrongBell(bell);
      return;
    }

    this.disableBell(bell, 'activated');
  }

  damageBell(id, amount) {
    const bell = this.getBell(id);
    if (!bell?.alive || amount <= 0) return;

    const expected = this.getNextBell();
    if (bell !== expected) {
      if (bell.wardFlashCooldown <= 0) {
        bell.wardFlashCooldown = 0.55;
        this.game.spawnFloatingText(bell.x, bell.y - 44, 'WARD — WRONG BELL', bell.color);
        this.game.playTone?.(150, 0.09, 0.025, 'square');
      }
      return;
    }

    bell.health = Math.max(0, bell.health - amount);
    this.game.spawnFloatingText(bell.x, bell.y - 42, `-${Math.ceil(amount)}`, bell.color);
    if (bell.health <= 0) this.disableBell(bell, 'destroyed');
  }

  disableBell(bell, verb) {
    bell.alive = false;
    bell.targetable = false;
    bell.interactable = false;
    bell.health = 0;
    this.nextBellIndex += 1;

    this.game.spawnBurst(bell.x, bell.y, bell.color, 82);
    this.game.playTone?.(780 + this.nextBellIndex * 70, 0.22, 0.045, 'sine');

    const next = this.getNextBell();
    const nextText = next ? `Next: ${next.name}` : 'All bells silenced';
    this.game.flashMessage(`${bell.name} ${verb} · ${nextText}`, 2.0);
  }

  punishWrongBell(bell) {
    this.wrongOrderStacks += 1;
    const damage = C.encounter.wrongOrderDamage
      + (this.wrongOrderStacks - 1) * C.encounter.wrongOrderDamageGrowth;

    for (const target of this.game.getEncounterTargets()) {
      target.takeDamage(damage, 'Discordant Bell');
    }

    this.game.spawnArenaFlash('#ff4d57');
    this.game.spawnBurst(bell.x, bell.y, '#ff4d57', 95);
    this.game.playTone?.(105, 0.28, 0.055, 'sawtooth');
    this.game.flashMessage(`WRONG BELL — Discord ${this.wrongOrderStacks}`, 1.8);
  }

  isPlayerSilenced(player) {
    if (!this.isBellActive('silence')) return false;
    return this.silenceZones.some((zone) => distance(zone, player) <= zone.radius);
  }

  getCastSpeedMultiplier() {
    const bellMultiplier = this.isBellActive('quickening')
      ? C.modifiers.quickening.castSpeedMultiplier
      : 1;
    const discordMultiplier = Math.max(
      0.55,
      1 - this.wrongOrderStacks * C.encounter.wrongOrderCastSpeedPerStack,
    );
    return bellMultiplier * discordMultiplier;
  }

  getDamageMultiplier() {
    const bellMultiplier = this.isBellActive('wrath') ? C.modifiers.wrath.damageMultiplier : 1;
    return bellMultiplier * (1 + this.wrongOrderStacks * C.encounter.wrongOrderDamageMultiplierPerStack);
  }

  scaledDamage(base) {
    return Math.round(base * this.getDamageMultiplier());
  }

  update(dt) {
    if (!this.alive || !this.game.player?.alive) return;

    for (const bell of this.bells) {
      bell.wardFlashCooldown = Math.max(0, bell.wardFlashCooldown - dt);
    }

    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updatePhase();

    this.facing = Math.atan2(this.game.player.y - this.y, this.game.player.x - this.x);

    if (!this.cast) {
      this.nextMechanic -= dt;
      if (this.nextMechanic <= 0) this.beginNextMechanic();
      return;
    }

    this.cast.remaining -= dt;
    if (this.cast.remaining <= 0) this.resolveCast();
  }

  updatePhase() {
    const healthPercent = this.health / C.maxHealth * 100;

    if (this.phase < 2 && healthPercent <= C.encounter.phaseTwoHealthPercent) {
      this.phase = 2;
      this.game.flashMessage('SECOND PEAL — Bellstorm overlaps every cast', 2.2);
      this.game.playTone?.(610, 0.22, 0.045, 'triangle');
      this.game.playTone?.(760, 0.22, 0.035, 'triangle');
    }

    if (this.phase < 3 && healthPercent <= C.encounter.phaseThreeHealthPercent) {
      this.phase = 3;
      this.game.flashMessage('FINAL PEAL — Consecrated echoes flood the arena', 2.4);
      this.game.playTone?.(520, 0.24, 0.05, 'sawtooth');
      this.spawnOverlapHazards(3);
    }
  }

  beginNextMechanic() {
    const id = C.sequence[this.sequenceIndex % C.sequence.length];
    this.sequenceIndex += 1;
    const mechanic = C.mechanics[id];
    const duration = mechanic.castTime * this.getCastSpeedMultiplier();

    this.cast = {
      id,
      name: mechanic.name,
      duration,
      remaining: duration,
      facing: this.facing,
      zones: id === 'judgment' ? this.createJudgmentZones(mechanic.count) : null,
    };

    if (this.phase >= 2 && id !== 'bellstorm') {
      this.spawnBellstormWave(C.mechanics.bellstorm.overlapCount);
    }
    if (this.phase >= 3) {
      this.spawnOverlapHazards(C.mechanics.overlapHazard.count);
    }

    const tones = { toll: 420, sweep: 500, bellstorm: 700, judgment: 585 };
    this.game.playTone?.(tones[id] ?? 520, 0.12, 0.035, id === 'bellstorm' ? 'triangle' : 'sine');
  }

  createJudgmentZones(count) {
    const zones = [];
    const targets = this.game.getEncounterTargets();
    const fallback = this.game.player;

    for (let i = 0; i < count; i += 1) {
      const focus = targets[i % Math.max(1, targets.length)] ?? fallback;
      zones.push({
        x: clamp(focus.x + (Math.random() - 0.5) * 460, 100, this.game.worldWidth - 100),
        y: clamp(focus.y + (Math.random() - 0.5) * 360, 100, this.game.worldHeight - 100),
      });
    }

    return zones;
  }

  resolveCast() {
    const cast = this.cast;
    this.cast = null;
    const mechanic = C.mechanics[cast.id];
    const targets = this.game.getEncounterTargets();

    if (cast.id === 'toll') {
      const damage = this.scaledDamage(mechanic.damage);
      for (const target of targets) target.takeDamage(damage, mechanic.name);
      this.game.spawnArenaFlash('#e5c46f');
      this.game.playTone?.(220, 0.22, 0.045, 'sine');
    } else if (cast.id === 'sweep') {
      const damage = this.scaledDamage(mechanic.damage);
      for (const target of targets) {
        if (pointInCone(target, this, cast.facing, mechanic.range, mechanic.halfAngle)) {
          target.takeDamage(damage, mechanic.name);
        }
      }
    } else if (cast.id === 'bellstorm') {
      this.spawnBellstormWave(mechanic.count);
    } else if (cast.id === 'judgment') {
      const damage = this.scaledDamage(mechanic.damage);
      for (const zone of cast.zones) {
        for (const target of targets) {
          if (distance(zone, target) <= mechanic.radius) target.takeDamage(damage, mechanic.name);
        }
        this.game.spawnBurst(zone.x, zone.y, C.visual.warning, mechanic.radius);
      }
    }

    let delayMultiplier = 1;
    if (this.phase >= 3) delayMultiplier = C.encounter.phaseThreeDelayMultiplier;
    else if (this.phase >= 2) delayMultiplier = C.encounter.phaseTwoDelayMultiplier;
    this.nextMechanic = C.encounter.delayBetweenMechanics * delayMultiplier;
  }

  rayDistanceToArenaEdge(dx, dy) {
    const margin = 36;
    const candidates = [];
    if (dx > 0.001) candidates.push((this.game.worldWidth - margin - this.x) / dx);
    if (dx < -0.001) candidates.push((margin - this.x) / dx);
    if (dy > 0.001) candidates.push((this.game.worldHeight - margin - this.y) / dy);
    if (dy < -0.001) candidates.push((margin - this.y) / dy);
    const positives = candidates.filter((value) => value > 0);
    return positives.length ? Math.min(...positives) : C.mechanics.bellstorm.travelRadius;
  }

  spawnBellstormWave(count) {
    const mechanic = C.mechanics.bellstorm;
    const reversed = this.isBellActive('reversal');
    const offset = (this.sequenceIndex * 0.31 + this.game.time * 0.08) % (Math.PI * 2);

    for (let i = 0; i < count; i += 1) {
      const angle = offset + i / count * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let x = this.x + dx * (C.radius + 28);
      let y = this.y + dy * (C.radius + 28);
      let vx = dx * mechanic.speed;
      let vy = dy * mechanic.speed;

      if (reversed) {
        const edgeDistance = Math.min(this.rayDistanceToArenaEdge(dx, dy), mechanic.travelRadius);
        x = this.x + dx * edgeDistance;
        y = this.y + dy * edgeDistance;
        vx *= -1;
        vy *= -1;
      }

      this.projectiles.push({
        x,
        y,
        vx,
        vy,
        radius: mechanic.radius,
        damage: mechanic.damage,
        remaining: mechanic.lifetime,
        reversed,
      });
    }

    this.game.playTone?.(reversed ? 360 : 820, 0.13, 0.03, 'triangle');
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.remaining -= dt;
      if (projectile.remaining <= 0) continue;

      for (const target of this.game.getEncounterTargets()) {
        const targetRadius = target.config?.radius ?? target.radius ?? 18;
        if (distance(projectile, target) <= projectile.radius + targetRadius) {
          target.takeDamage(this.scaledDamage(projectile.damage), 'Bellstorm');
          this.game.spawnBurst(projectile.x, projectile.y, C.visual.projectile, 34);
          projectile.remaining = 0;
          break;
        }
      }
    }

    this.projectiles = this.projectiles.filter((projectile) => projectile.remaining > 0);
  }

  spawnOverlapHazards(count) {
    const mechanic = C.mechanics.overlapHazard;
    const targets = this.game.getEncounterTargets();
    const fallback = this.game.player;

    for (let i = 0; i < count; i += 1) {
      const focus = targets[i % Math.max(1, targets.length)] ?? fallback;
      this.hazards.push({
        x: clamp(focus.x + (Math.random() - 0.5) * 360, 110, this.game.worldWidth - 110),
        y: clamp(focus.y + (Math.random() - 0.5) * 300, 110, this.game.worldHeight - 110),
        radius: mechanic.radius,
        activationDelay: mechanic.activationDelay,
        remaining: mechanic.duration,
        tickTimer: mechanic.tickEvery,
      });
    }
  }

  updateHazards(dt) {
    const mechanic = C.mechanics.overlapHazard;

    for (const hazard of this.hazards) {
      if (hazard.activationDelay > 0) {
        hazard.activationDelay = Math.max(0, hazard.activationDelay - dt);
        continue;
      }

      hazard.remaining -= dt;
      hazard.tickTimer -= dt;
      while (hazard.tickTimer <= 0 && hazard.remaining > 0) {
        hazard.tickTimer += mechanic.tickEvery;
        for (const target of this.game.getEncounterTargets()) {
          if (distance(hazard, target) <= hazard.radius) {
            target.takeDamage(this.scaledDamage(mechanic.damage), mechanic.name);
          }
        }
      }
    }

    this.hazards = this.hazards.filter((hazard) => hazard.activationDelay > 0 || hazard.remaining > 0);
  }

  takeDamage(amount) {
    if (!this.alive || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.game.spawnFloatingText(this.x, this.y - 70, `-${Math.ceil(amount)}`, '#ffe5ae');

    if (this.health <= 0) {
      this.alive = false;
      this.cast = null;
      this.projectiles = [];
      this.hazards = [];
      this.game.playTone?.(120, 0.45, 0.05, 'sine');
      this.game.onBossDefeated();
    }
  }

  drawTelegraph(ctx) {
    this.drawSilenceZones(ctx);
    this.drawHazards(ctx);

    if (!this.cast) return;
    const mechanic = C.mechanics[this.cast.id];
    const progress = 1 - this.cast.remaining / this.cast.duration;

    ctx.save();
    ctx.globalAlpha = 0.18 + progress * 0.24;
    ctx.fillStyle = C.visual.danger;
    ctx.strokeStyle = C.visual.warning;
    ctx.lineWidth = 4;

    if (this.cast.id === 'sweep') {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.arc(this.x, this.y, mechanic.range, this.cast.facing - mechanic.halfAngle, this.cast.facing + mechanic.halfAngle);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (this.cast.id === 'judgment') {
      for (const zone of this.cast.zones) {
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, mechanic.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (this.cast.id === 'toll') {
      ctx.globalAlpha = 0.05 + progress * 0.14;
      ctx.fillStyle = C.visual.warning;
      ctx.fillRect(0, 0, this.game.worldWidth, this.game.worldHeight);
    } else if (this.cast.id === 'bellstorm') {
      const reversed = this.isBellActive('reversal');
      ctx.strokeStyle = reversed ? C.bells.entries.reversal.color : C.visual.projectile;
      ctx.globalAlpha = 0.35 + progress * 0.35;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 105 + progress * 38, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawSilenceZones(ctx) {
    if (!this.isBellActive('silence')) return;
    const silenced = this.isPlayerSilenced(this.game.player);

    ctx.save();
    for (const zone of this.silenceZones) {
      ctx.fillStyle = silenced ? 'rgba(67, 195, 126, .22)' : 'rgba(67, 195, 126, .12)';
      ctx.strokeStyle = C.visual.silence;
      ctx.lineWidth = silenced ? 5 : 3;
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawHazards(ctx) {
    ctx.save();
    for (const hazard of this.hazards) {
      const warning = hazard.activationDelay > 0;
      ctx.fillStyle = warning ? 'rgba(255, 202, 91, .10)' : 'rgba(255, 92, 72, .20)';
      ctx.strokeStyle = warning ? C.visual.warning : C.visual.danger;
      ctx.lineWidth = warning ? 3 : 5;
      if (warning) ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  draw(ctx) {
    this.drawBells(ctx);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing);
    ctx.fillStyle = C.visual.armor;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.visual.body;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.visual.core;
    ctx.beginPath();
    ctx.arc(15, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#56493e';
    ctx.fillRect(-24, -48, 14, 96);
    ctx.restore();

    this.drawProjectiles(ctx);
  }

  drawBells(ctx) {
    const next = this.getNextBell();

    for (const bell of this.bells) {
      const config = C.bells.entries[bell.id];
      ctx.save();
      ctx.translate(bell.x, bell.y);
      ctx.globalAlpha = bell.alive ? 1 : 0.32;

      if (bell === next && bell.alive) {
        const pulse = 8 + Math.sin(this.game.time * 5) * 4;
        ctx.strokeStyle = C.visual.target;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, BELL_RADIUS + 15 + pulse, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = '#302b31';
      ctx.beginPath();
      ctx.arc(0, 0, BELL_RADIUS + 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bell.color;
      ctx.beginPath();
      ctx.arc(0, 0, BELL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#17171d';
      ctx.beginPath();
      ctx.arc(0, 7, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '800 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(config.shortName, 0, BELL_RADIUS + 24);
      if (bell === next && bell.alive) {
        ctx.fillStyle = C.visual.target;
        ctx.fillText('NEXT · E TO RING', 0, -BELL_RADIUS - 18);
      } else if (!bell.alive) {
        ctx.fillStyle = '#b9bbc4';
        ctx.fillText('SILENCED', 0, -BELL_RADIUS - 18);
      }

      if (bell.alive && bell.health < bell.maxHealth) {
        const width = 70;
        const pct = bell.health / bell.maxHealth;
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(-width / 2, BELL_RADIUS + 30, width, 5);
        ctx.fillStyle = bell.color;
        ctx.fillRect(-width / 2, BELL_RADIUS + 30, width * pct, 5);
      }

      ctx.restore();
    }
  }

  drawProjectiles(ctx) {
    for (const projectile of this.projectiles) {
      ctx.save();
      ctx.fillStyle = projectile.reversed ? C.bells.entries.reversal.color : C.visual.projectile;
      ctx.shadowBlur = 14;
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
