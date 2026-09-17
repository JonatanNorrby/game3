import { clamp, distance, pointInCone } from '../../../core/geometry.js';
import { GOLEM_CONFIG as C } from './config.js';

export class Golem {
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
    this.sequenceIndex = 0;
    this.nextMechanic = C.encounter.openingDelay;
    this.cast = null;
    this.facing = Math.PI / 2;
    this.phaseTwoAnnounced = false;
  }

  update(dt) {
    if (!this.alive || !this.game.player?.alive) return;
    if (!this.cast) {
      this.facing = Math.atan2(this.game.player.y - this.y, this.game.player.x - this.x);
      this.nextMechanic -= dt;
      if (this.nextMechanic <= 0) this.beginNextMechanic();
      return;
    }
    this.cast.remaining -= dt;
    if (this.cast.remaining <= 0) this.resolveCast();
    if (!this.phaseTwoAnnounced && this.health / C.maxHealth <= C.encounter.phaseTwoHealthPercent / 100) {
      this.phaseTwoAnnounced = true;
      this.game.flashMessage('PHASE 2 — Golem accelerates', 2.2);
    }
  }

  beginNextMechanic() {
    const id = C.sequence[this.sequenceIndex % C.sequence.length];
    this.sequenceIndex += 1;
    const mechanic = C.mechanics[id];
    const phaseMultiplier = this.phaseTwoAnnounced ? C.encounter.phaseTwoSpeedMultiplier : 1;
    const duration = mechanic.castTime * phaseMultiplier;
    this.cast = {
      id,
      name: mechanic.name,
      duration,
      remaining: duration,
      facing: this.facing,
      zones: id === 'rain' ? this.createRainZones(mechanic.count) : null,
    };
  }

  createRainZones(count) {
    const zones = [];
    const player = this.game.player;
    const spreadX = Math.min(900, this.game.width * 0.85);
    const spreadY = Math.min(620, this.game.height * 0.72);
    for (let i = 0; i < count; i += 1) {
      zones.push({
        x: clamp(player.x + (Math.random() - 0.5) * spreadX, 90, this.game.worldWidth - 90),
        y: clamp(player.y + (Math.random() - 0.5) * spreadY, 90, this.game.worldHeight - 90),
      });
    }
    return zones;
  }

  resolveCast() {
    const cast = this.cast;
    this.cast = null;
    const m = C.mechanics[cast.id];
    const p = this.game.player;
    if (cast.id === 'arcanePulse') {
      p.takeDamage(m.damage, m.name);
      this.game.spawnArenaFlash('#9f63d8');
    } else if (cast.id === 'nova') {
      if (distance(this, p) <= m.radius) p.takeDamage(m.damage, m.name);
      this.game.spawnBurst(this.x, this.y, C.visual.danger, m.radius);
    } else if (cast.id === 'frontal') {
      if (pointInCone(p, this, cast.facing, m.range, m.halfAngle)) p.takeDamage(m.damage, m.name);
    } else if (cast.id === 'rain') {
      for (const zone of cast.zones) {
        if (distance(zone, p) <= m.radius) p.takeDamage(m.damage, m.name);
        this.game.spawnBurst(zone.x, zone.y, C.visual.warning, m.radius);
      }
    }
    this.nextMechanic = C.encounter.delayBetweenMechanics;
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.game.spawnFloatingText(this.x, this.y - 58, `-${amount}`, '#dcc9ff');
    if (this.health <= 0) {
      this.alive = false;
      this.cast = null;
      this.game.onBossDefeated();
    }
  }

  drawTelegraph(ctx) {
    if (!this.cast) return;
    const m = C.mechanics[this.cast.id];
    const progress = 1 - this.cast.remaining / this.cast.duration;
    ctx.save();
    ctx.globalAlpha = 0.20 + progress * 0.22;
    ctx.fillStyle = C.visual.danger;
    ctx.strokeStyle = C.visual.warning;
    ctx.lineWidth = 4;
    if (this.cast.id === 'nova') {
      ctx.beginPath(); ctx.arc(this.x, this.y, m.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (this.cast.id === 'frontal') {
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.arc(this.x, this.y, m.range, this.cast.facing - m.halfAngle, this.cast.facing + m.halfAngle); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (this.cast.id === 'rain') {
      for (const zone of this.cast.zones) {
        ctx.beginPath(); ctx.arc(zone.x, zone.y, m.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    } else if (this.cast.id === 'arcanePulse') {
      ctx.globalAlpha = 0.08 + progress * 0.12;
      ctx.fillRect(0, 0, this.game.worldWidth, this.game.worldHeight);
    }
    ctx.restore();
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing);
    ctx.fillStyle = C.visual.body;
    ctx.beginPath(); ctx.arc(0, 0, C.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.visual.core;
    ctx.beginPath(); ctx.arc(12, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#63365f';
    ctx.fillRect(-16, -42, 12, 84);
    ctx.restore();
  }
}
