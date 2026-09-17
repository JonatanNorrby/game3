import { clamp, distance, pointInCone } from '../../../core/geometry.js';
import { TWIN_MAGI_CONFIG as C } from './config.js';

const MAGUS_RADIUS = 38;

export class TwinMagi {
  constructor(game) {
    this.game = game;
    this.config = C;
    this.reset();
  }

  get x() {
    if (this.merged) return this.centerX;
    const selected = this.game?.currentTarget;
    return this.magi?.includes(selected) ? selected.x : this.centerX;
  }

  get y() {
    if (this.merged) return this.centerY;
    const selected = this.game?.currentTarget;
    return this.magi?.includes(selected) ? selected.y : this.centerY;
  }

  reset() {
    this.centerX = this.game.worldWidth * C.position.x;
    this.centerY = this.game.worldHeight * C.position.y;
    this.health = C.maxHealth;
    this.alive = true;
    this.targetable = false;
    this.phase = 1;
    this.phaseTwoAnnounced = false;
    this.merged = false;
    this.cast = null;
    this.nextMergedCast = C.encounter.mergeDelay;
    this.finalPairIndex = 0;
    this.groundZones = [];
    this.beams = [];

    this.magi = Object.entries(C.magi).map(([id, cfg], index) => ({
      id,
      name: cfg.name,
      school: cfg.school,
      color: cfg.color,
      core: cfg.core,
      config: { name: `${cfg.name} · ${cfg.school}`, radius: MAGUS_RADIUS },
      x: this.game.worldWidth * cfg.position.x,
      y: this.game.worldHeight * cfg.position.y,
      radius: MAGUS_RADIUS,
      alive: true,
      targetable: true,
      empoweredRemaining: 0,
      sequenceIndex: 0,
      nextCast: C.encounter.openingDelay + index * 1.25,
      cast: null,
      takeDamage: (amount, source = 'Player') => this.damageMagi(id, amount, source),
    }));
  }

  getHostileTargets() {
    if (!this.alive) return [];
    if (this.merged) return [this];
    return this.magi.filter((magus) => magus.alive && magus.targetable);
  }

  getMagus(id) {
    return this.magi.find((magus) => magus.id === id) ?? null;
  }

  getOtherMagus(magus) {
    return this.magi.find((candidate) => candidate !== magus) ?? null;
  }

  isEmpowered(magus) {
    return magus?.empoweredRemaining > 0;
  }

  damageMagi(id, amount) {
    const magus = this.getMagus(id);
    if (!magus?.alive || this.merged || amount <= 0) return;

    const wasEmpowered = this.isEmpowered(magus);
    magus.empoweredRemaining = 0;

    const other = this.getOtherMagus(magus);
    if (other?.alive) {
      const otherWasEmpowered = this.isEmpowered(other);
      other.empoweredRemaining = C.encounter.empoweredDuration;
      if (!otherWasEmpowered) {
        this.game.flashMessage(`${other.name} EMPOWERED — switch targets to suppress`, 1.35);
        this.game.spawnBurst(other.x, other.y, other.color, 72);
        this.game.playTone?.(other.id === 'solara' ? 659.25 : 174.61, 0.12, 0.025, 'triangle');
      }
    }

    if (wasEmpowered) {
      this.game.spawnFloatingText(magus.x, magus.y - 58, 'EMPOWERMENT BROKEN', '#e8f3ff');
    }

    this.applySharedDamage(amount, magus.x, magus.y);
  }

  takeDamage(amount) {
    if (!this.alive || !this.merged || amount <= 0) return;
    this.applySharedDamage(amount, this.centerX, this.centerY);
  }

  applySharedDamage(amount, x, y) {
    this.health = Math.max(0, this.health - amount);
    this.game.spawnFloatingText(x, y - 52, `-${Math.ceil(amount)}`, '#efe6ff');

    if (this.health <= 0) {
      this.alive = false;
      this.cast = null;
      for (const magus of this.magi) {
        magus.alive = false;
        magus.targetable = false;
        magus.cast = null;
      }
      this.groundZones = [];
      this.beams = [];
      this.game.onBossDefeated();
      return;
    }

    if (!this.merged && this.health / C.maxHealth * 100 <= C.encounter.mergeHealthPercent) {
      this.beginMerge();
    }
  }

  beginMerge() {
    this.merged = true;
    this.phase = 3;
    this.targetable = true;
    this.cast = null;
    this.nextMergedCast = C.encounter.mergeDelay;
    this.groundZones = [];
    this.beams = [];

    for (const magus of this.magi) {
      magus.targetable = false;
      magus.empoweredRemaining = 0;
      magus.cast = null;
    }

    this.game.spawnArenaFlash(C.visual.merged);
    this.game.spawnBurst(this.centerX, this.centerY, C.visual.merged, 150);
    this.game.flashMessage('FINAL PHASE — THE TWIN MAGI MERGE', 2.5);
    this.game.playTone?.(329.63, 0.32, 0.035, 'sine');
    this.game.playTone?.(493.88, 0.32, 0.03, 'sine');
  }

  update(dt) {
    if (!this.alive || !this.game.player?.alive) return;

    this.updateGroundZones(dt);
    this.updateBeams(dt);

    if (this.merged) {
      this.updateMerged(dt);
      return;
    }

    for (const magus of this.magi) {
      magus.empoweredRemaining = Math.max(0, magus.empoweredRemaining - dt);
    }

    this.updatePhaseTwo();
    for (const magus of this.magi) this.updateMagus(magus, dt);
    this.updateDisplayCast();
  }

  updatePhaseTwo() {
    if (this.phaseTwoAnnounced) return;
    if (this.health / C.maxHealth * 100 > C.encounter.phaseTwoHealthPercent) return;
    this.phase = 2;
    this.phaseTwoAnnounced = true;
    this.game.flashMessage('PHASE 2 — THE SCHOOLS OVERLAP', 2.2);
    this.game.spawnArenaFlash('#bb7be6');
  }

  updateMagus(magus, dt) {
    if (!magus.alive) return;

    if (magus.cast) {
      magus.cast.remaining -= dt;
      if (magus.cast.remaining <= 0) this.resolveMagusCast(magus);
      return;
    }

    magus.nextCast -= dt;
    if (magus.nextCast <= 0) this.beginMagusCast(magus);
  }

  beginMagusCast(magus) {
    const cfg = C.magi[magus.id];
    const mechanicId = cfg.sequence[magus.sequenceIndex % cfg.sequence.length];
    magus.sequenceIndex += 1;
    const mechanic = C.mechanics[mechanicId];
    const empoweredSpeed = this.isEmpowered(magus) ? C.encounter.empoweredCastSpeedMultiplier : 1;
    const phaseSpeed = this.phase >= 2 ? 0.88 : 1;
    const duration = mechanic.castTime * empoweredSpeed * phaseSpeed;

    magus.cast = {
      id: mechanicId,
      name: `${magus.name} — ${mechanic.name}`,
      duration,
      remaining: duration,
      facing: Math.atan2(this.game.player.y - magus.y, this.game.player.x - magus.x),
    };

    this.game.playTone?.(magus.id === 'solara' ? 587.33 : 164.81, 0.1, 0.02, magus.id === 'solara' ? 'sine' : 'triangle');
  }

  resolveMagusCast(magus) {
    const cast = magus.cast;
    magus.cast = null;
    if (!cast) return;

    const multiplier = this.isEmpowered(magus) ? C.encounter.empoweredDamageMultiplier : 1;
    this.resolveMechanic(cast.id, magus, cast.facing, multiplier);

    const phaseDelay = this.phase >= 2 ? C.encounter.phaseTwoDelayMultiplier : 1;
    const empoweredDelay = this.isEmpowered(magus) ? 0.78 : 1;
    magus.nextCast = C.encounter.baseDelay * phaseDelay * empoweredDelay;
  }

  updateDisplayCast() {
    const active = this.magi.filter((magus) => magus.cast);
    if (!active.length) {
      this.cast = null;
      return;
    }
    if (active.length === 1) {
      this.cast = active[0].cast;
      return;
    }

    this.cast = {
      name: `OVERLAP · ${active.map((magus) => C.mechanics[magus.cast.id].name).join(' + ')}`,
      duration: Math.max(...active.map((magus) => magus.cast.duration)),
      remaining: Math.max(...active.map((magus) => magus.cast.remaining)),
    };
  }

  updateMerged(dt) {
    if (this.cast) {
      this.cast.remaining -= dt;
      if (this.cast.remaining <= 0) this.resolveMergedCast();
      return;
    }

    this.nextMergedCast -= dt;
    if (this.nextMergedCast <= 0) this.beginMergedCast();
  }

  beginMergedCast() {
    const pair = C.finalPairs[this.finalPairIndex % C.finalPairs.length];
    this.finalPairIndex += 1;
    const duration = Math.max(...pair.map((id) => C.mechanics[id].castTime)) * 0.78;
    const names = pair.map((id) => C.mechanics[id].name);
    this.cast = {
      id: 'mergedPair',
      name: `CONVERGENCE · ${names.join(' + ')}`,
      duration,
      remaining: duration,
      pair: [...pair],
      facing: Math.atan2(this.game.player.y - this.centerY, this.game.player.x - this.centerX),
    };
    this.game.playTone?.(392, 0.12, 0.025, 'sine');
    this.game.playTone?.(233.08, 0.12, 0.022, 'triangle');
  }

  resolveMergedCast() {
    const cast = this.cast;
    this.cast = null;
    if (!cast) return;

    const origin = { x: this.centerX, y: this.centerY };
    for (const mechanicId of cast.pair) {
      this.resolveMechanic(mechanicId, origin, cast.facing, 1.18);
    }
    this.nextMergedCast = C.encounter.finalDelay;
  }

  resolveMechanic(id, origin, facing, damageMultiplier) {
    const mechanic = C.mechanics[id];
    const targets = this.game.getEncounterTargets();

    if (id === 'solarLance') {
      for (const target of targets) {
        if (pointInCone(target, origin, facing, mechanic.range, mechanic.halfAngle)) {
          target.takeDamage(Math.round(mechanic.damage * damageMultiplier), mechanic.name);
        }
      }
      this.game.spawnBurst(origin.x, origin.y, C.visual.solar, 105);
      return;
    }

    if (id === 'solarFlare') {
      for (let i = 0; i < mechanic.count; i += 1) {
        const focus = targets[i % Math.max(1, targets.length)] ?? this.game.player;
        const spread = i === 0 ? 70 : mechanic.spread;
        this.groundZones.push({
          x: clamp(focus.x + (Math.random() - 0.5) * spread, 85, this.game.worldWidth - 85),
          y: clamp(focus.y + (Math.random() - 0.5) * spread, 85, this.game.worldHeight - 85),
          radius: mechanic.radius,
          damage: Math.round(mechanic.damage * damageMultiplier),
          duration: mechanic.delay,
          remaining: mechanic.delay,
          color: C.visual.solar,
        });
      }
      return;
    }

    if (id === 'voidNova') {
      for (const target of targets) {
        if (distance(origin, target) <= mechanic.radius) {
          target.takeDamage(Math.round(mechanic.damage * damageMultiplier), mechanic.name);
        }
      }
      this.game.spawnBurst(origin.x, origin.y, C.visual.void, mechanic.radius);
      return;
    }

    if (id === 'shadowBeam') {
      this.beams.push({
        x: origin.x,
        y: origin.y,
        angle: Math.atan2(this.game.player.y - origin.y, this.game.player.x - origin.x),
        speed: mechanic.rotationSpeed * (this.merged ? 1.2 : 1),
        length: mechanic.length,
        halfWidth: mechanic.halfWidth,
        damage: Math.round(mechanic.damage * damageMultiplier),
        hitCooldown: mechanic.hitCooldown,
        duration: mechanic.duration,
        remaining: mechanic.duration,
        targetCooldowns: new Map(),
        color: C.visual.void,
      });
    }
  }

  updateGroundZones(dt) {
    const targets = this.game.getEncounterTargets();
    for (const zone of this.groundZones) {
      zone.remaining -= dt;
      if (zone.remaining > 0) continue;
      for (const target of targets) {
        if (distance(zone, target) <= zone.radius) target.takeDamage(zone.damage, 'Solar Flares');
      }
      this.game.spawnBurst(zone.x, zone.y, zone.color, zone.radius);
    }
    this.groundZones = this.groundZones.filter((zone) => zone.remaining > 0);
  }

  updateBeams(dt) {
    const targets = this.game.getEncounterTargets();
    for (const beam of this.beams) {
      beam.remaining -= dt;
      beam.angle += beam.speed * dt;

      for (const [target, remaining] of beam.targetCooldowns) {
        const next = remaining - dt;
        if (next <= 0) beam.targetCooldowns.delete(target);
        else beam.targetCooldowns.set(target, next);
      }

      for (const target of targets) {
        if (beam.targetCooldowns.has(target)) continue;
        if (!this.pointInBeam(target, beam)) continue;
        target.takeDamage(beam.damage, 'Shadow Sweep');
        beam.targetCooldowns.set(target, beam.hitCooldown);
      }
    }
    this.beams = this.beams.filter((beam) => beam.remaining > 0);
  }

  pointInBeam(target, beam) {
    const dx = target.x - beam.x;
    const dy = target.y - beam.y;
    const dirX = Math.cos(beam.angle);
    const dirY = Math.sin(beam.angle);
    const along = dx * dirX + dy * dirY;
    if (along < 0 || along > beam.length) return false;
    const perpendicular = Math.abs(dx * dirY - dy * dirX);
    const targetRadius = target.config?.radius ?? target.radius ?? 18;
    return perpendicular <= beam.halfWidth + targetRadius;
  }

  drawCastTelegraph(ctx, origin, cast, color) {
    if (!cast) return;
    const mechanic = C.mechanics[cast.id];
    if (!mechanic) return;
    const progress = 1 - cast.remaining / cast.duration;

    ctx.save();
    ctx.globalAlpha = 0.14 + progress * 0.26;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;

    if (cast.id === 'solarLance') {
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.arc(origin.x, origin.y, mechanic.range, cast.facing - mechanic.halfAngle, cast.facing + mechanic.halfAngle);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (cast.id === 'voidNova') {
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, mechanic.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.5 + progress * 0.4;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 58 + progress * 28, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTelegraph(ctx) {
    for (const zone of this.groundZones) {
      const progress = 1 - zone.remaining / zone.duration;
      ctx.save();
      ctx.globalAlpha = 0.16 + progress * 0.32;
      ctx.fillStyle = zone.color;
      ctx.strokeStyle = C.visual.warning;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    for (const beam of this.beams) {
      ctx.save();
      ctx.globalAlpha = 0.48;
      ctx.strokeStyle = beam.color;
      ctx.lineWidth = beam.halfWidth * 2;
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(beam.x + Math.cos(beam.angle) * beam.length, beam.y + Math.sin(beam.angle) * beam.length);
      ctx.stroke();
      ctx.restore();
    }

    if (this.merged && this.cast?.pair) {
      for (const id of this.cast.pair) {
        this.drawCastTelegraph(ctx, { x: this.centerX, y: this.centerY }, {
          ...this.cast,
          id,
        }, id.startsWith('solar') ? C.visual.solar : C.visual.void);
      }
      return;
    }

    for (const magus of this.magi) {
      this.drawCastTelegraph(ctx, magus, magus.cast, magus.color);
    }
  }

  drawMagus(ctx, magus) {
    ctx.save();
    ctx.translate(magus.x, magus.y);
    if (this.isEmpowered(magus)) {
      ctx.strokeStyle = '#fff1a8';
      ctx.lineWidth = 6;
      ctx.shadowBlur = 18;
      ctx.shadowColor = magus.color;
      ctx.beginPath();
      ctx.arc(0, 0, MAGUS_RADIUS + 12 + Math.sin(this.game.time * 7) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = '#24243d';
    ctx.beginPath();
    ctx.arc(0, 0, MAGUS_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = magus.color;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = magus.core;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.font = '800 14px system-ui';
    ctx.fillStyle = magus.color;
    ctx.fillText(magus.name, 0, -MAGUS_RADIUS - 14);
    if (this.isEmpowered(magus)) {
      ctx.font = '800 11px system-ui';
      ctx.fillStyle = '#fff1a8';
      ctx.fillText('EMPOWERED', 0, MAGUS_RADIUS + 20);
    }
    ctx.restore();
  }

  draw(ctx) {
    if (!this.merged) {
      ctx.save();
      ctx.strokeStyle = 'rgba(232,205,255,.18)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.magi[0].x, this.magi[0].y);
      ctx.lineTo(this.magi[1].x, this.magi[1].y);
      ctx.stroke();
      ctx.restore();
      for (const magus of this.magi) this.drawMagus(ctx, magus);
      return;
    }

    ctx.save();
    ctx.translate(this.centerX, this.centerY);
    ctx.shadowBlur = 24;
    ctx.shadowColor = C.visual.merged;
    ctx.fillStyle = '#2b233d';
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = C.visual.solar;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.strokeStyle = C.visual.void;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();

    ctx.fillStyle = C.visual.merged;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
