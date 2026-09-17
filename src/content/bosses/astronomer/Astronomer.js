import { clamp, distance } from '../../../core/geometry.js';
import { ASTRONOMER_CONFIG as C } from './config.js';

export class Astronomer {
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
    this.cast = null;
    this.phase = 1;
    this.phaseAnnounced = 1;
    this.starMapRotation = 0;
    this.patternIndex = 0;
    this.activeConstellation = null;
    this.currentContactStar = null;
    this.nextMajor = C.encounter.openingDelay;
    this.nextMinor = C.encounter.minorInterval * 0.65;
    this.minorIndex = 0;
    this.meteorZones = [];
  }

  getHostileTargets() {
    return this.alive ? [this] : [];
  }

  update(dt) {
    if (!this.alive || !this.game.player?.alive) return;

    this.updatePhase();
    this.updateRotation(dt);
    this.updateMeteorZones(dt);

    this.nextMinor -= dt;
    if (this.nextMinor <= 0) {
      this.beginMinorMechanic();
      this.nextMinor = C.encounter.minorInterval * (this.phase === 3 ? 0.78 : this.phase === 2 ? 0.9 : 1);
    }

    if (this.activeConstellation) {
      this.updateConstellation(dt);
      return;
    }

    this.nextMajor -= dt;
    if (this.nextMajor <= 0) this.beginConstellation();
  }

  updatePhase() {
    const pct = this.health / C.maxHealth * 100;
    const nextPhase = pct <= C.encounter.phaseThreeHealthPercent
      ? 3
      : pct <= C.encounter.phaseTwoHealthPercent
        ? 2
        : 1;

    this.phase = nextPhase;
    if (this.phase <= this.phaseAnnounced) return;
    this.phaseAnnounced = this.phase;

    if (this.phase === 2) {
      this.game.flashMessage('PHASE 2 — THE STAR MAP TURNS', 2.4);
      this.game.spawnArenaFlash('#527fb8');
    } else if (this.phase === 3) {
      this.game.flashMessage('PHASE 3 — THE HEAVENS REVERSE', 2.4);
      this.game.spawnArenaFlash('#8c5fbc');
    }
  }

  updateRotation(dt) {
    if (this.phase === 1) return;
    const speed = this.phase === 2
      ? C.encounter.rotationSpeedPhaseTwo
      : C.encounter.rotationSpeedPhaseThree;
    this.starMapRotation += speed * dt;
  }

  getStarPosition(star) {
    const centerX = this.game.worldWidth / 2;
    const centerY = this.game.worldHeight / 2;
    const baseX = star.x * this.game.worldWidth;
    const baseY = star.y * this.game.worldHeight;
    const dx = baseX - centerX;
    const dy = baseY - centerY;
    const cos = Math.cos(this.starMapRotation);
    const sin = Math.sin(this.starMapRotation);
    return {
      x: centerX + dx * cos - dy * sin,
      y: centerY + dx * sin + dy * cos,
    };
  }

  getStar(id) {
    return C.starMap.stars.find((star) => star.id === id) ?? null;
  }

  getPattern() {
    const pool = C.starMap.patterns;
    const index = (this.patternIndex + Math.max(0, this.phase - 1)) % pool.length;
    this.patternIndex += 1;
    return pool[index];
  }

  beginConstellation() {
    const pattern = this.getPattern();
    const duration = C.major.castTime - (this.phase - 1) * 0.6;
    this.activeConstellation = {
      name: pattern.name,
      sequence: [...pattern.sequence],
      progress: 0,
      duration,
      remaining: duration,
    };
    this.cast = {
      id: 'cataclysm',
      name: `${C.major.name} — ${pattern.name}`,
      duration,
      remaining: duration,
    };
    this.currentContactStar = null;

    const sequence = pattern.sequence.map((id, index) => `${index + 1}:${id}`).join('  →  ');
    this.game.flashMessage(`TRACE ${pattern.name}: ${sequence}`, 3.0);
    this.game.spawnArenaFlash(C.visual.star);
  }

  updateConstellation(dt) {
    const constellation = this.activeConstellation;
    if (!constellation) return;

    constellation.remaining -= dt;
    if (this.cast) this.cast.remaining = constellation.remaining;
    this.checkConstellationStep();

    if (!this.activeConstellation) return;
    if (constellation.remaining <= 0) this.failConstellation('Pattern timeout');
  }

  checkConstellationStep() {
    const constellation = this.activeConstellation;
    const player = this.game.player;
    if (!constellation || !player?.alive) return;

    let contactedId = null;
    for (const star of C.starMap.stars) {
      const pos = this.getStarPosition(star);
      if (distance(pos, player) <= C.starMap.activationRadius) {
        contactedId = star.id;
        break;
      }
    }

    if (!contactedId) {
      this.currentContactStar = null;
      return;
    }
    if (contactedId === this.currentContactStar) return;
    this.currentContactStar = contactedId;

    if (!constellation.sequence.includes(contactedId)) return;
    const expectedId = constellation.sequence[constellation.progress];
    if (contactedId !== expectedId) {
      this.failConstellation(`Wrong star — expected ${expectedId}`);
      return;
    }

    const star = this.getStar(contactedId);
    const pos = this.getStarPosition(star);
    constellation.progress += 1;
    this.game.spawnBurst(pos.x, pos.y, C.visual.completed, 62);
    this.game.spawnFloatingText(pos.x, pos.y - 38, `${constellation.progress}/${constellation.sequence.length}`, C.visual.completed);

    if (constellation.progress >= constellation.sequence.length) {
      this.interruptCataclysm();
      return;
    }

    const nextId = constellation.sequence[constellation.progress];
    this.game.flashMessage(`Correct — next star ${nextId}`, 0.9);
  }

  interruptCataclysm() {
    const name = this.activeConstellation?.name ?? 'Constellation';
    this.activeConstellation = null;
    this.cast = null;
    this.currentContactStar = null;
    this.nextMajor = C.encounter.majorInterval;
    this.game.flashMessage(`${name} COMPLETE — CATACLYSM INTERRUPTED`, 2.0);
    this.game.spawnArenaFlash(C.visual.completed);
    this.game.spawnBurst(this.x, this.y, C.visual.completed, 110);
  }

  failConstellation(reason) {
    if (!this.activeConstellation) return;
    this.activeConstellation = null;
    this.cast = null;
    this.currentContactStar = null;
    this.nextMajor = C.encounter.majorInterval * 0.82;

    const damage = C.major.damage + (this.phase - 1) * 10;
    for (const target of this.game.getEncounterTargets()) {
      target.takeDamage(damage, C.major.name);
    }
    this.game.flashMessage(`${reason} — ${C.major.name}`, 2.0);
    this.game.spawnArenaFlash(C.visual.danger);
    this.game.spawnBurst(this.x, this.y, C.visual.danger, 220);
  }

  beginMinorMechanic() {
    this.minorIndex += 1;
    if (this.minorIndex % 2 === 0) {
      this.castStellarPulse();
      return;
    }
    this.createMeteorZones();
  }

  castStellarPulse() {
    const damage = C.minor.pulse.damage + (this.phase - 1) * 4;
    for (const target of this.game.getEncounterTargets()) {
      target.takeDamage(damage, C.minor.pulse.name);
    }
    this.game.spawnArenaFlash('#526f9c');
    this.game.flashMessage(C.minor.pulse.name, 0.8);
  }

  createMeteorZones() {
    const cfg = C.minor.meteor;
    const count = cfg.countByPhase[this.phase - 1] ?? cfg.countByPhase[0];
    const targets = this.game.getEncounterTargets();
    const focus = targets[0] ?? this.game.player;

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = i === 0 ? 0 : 120 + Math.random() * 330;
      this.meteorZones.push({
        x: clamp(focus.x + Math.cos(angle) * radius, 95, this.game.worldWidth - 95),
        y: clamp(focus.y + Math.sin(angle) * radius, 95, this.game.worldHeight - 95),
        remaining: cfg.telegraphTime,
        duration: cfg.telegraphTime,
        resolved: false,
      });
    }
    this.game.flashMessage(C.minor.meteor.name, 0.8);
  }

  updateMeteorZones(dt) {
    const cfg = C.minor.meteor;
    for (const zone of this.meteorZones) {
      zone.remaining -= dt;
      if (zone.remaining > 0 || zone.resolved) continue;
      zone.resolved = true;
      for (const target of this.game.getEncounterTargets()) {
        if (distance(zone, target) <= cfg.radius) target.takeDamage(cfg.damage, cfg.name);
      }
      this.game.spawnBurst(zone.x, zone.y, C.visual.danger, cfg.radius);
    }
    this.meteorZones = this.meteorZones.filter((zone) => zone.remaining > -0.45);
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.game.spawnFloatingText(this.x, this.y - 58, `-${Math.ceil(amount)}`, '#c8ddff');
    if (this.health > 0) return;
    this.alive = false;
    this.cast = null;
    this.activeConstellation = null;
    this.meteorZones = [];
    this.game.onBossDefeated();
  }

  drawTelegraph(ctx) {
    this.drawStarMap(ctx);
    this.drawMeteorTelegraphs(ctx);
    this.drawMajorTelegraph(ctx);
  }

  drawStarMap(ctx) {
    const positions = new Map(C.starMap.stars.map((star) => [star.id, this.getStarPosition(star)]));

    ctx.save();
    ctx.strokeStyle = C.visual.map;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    for (let i = 0; i < C.starMap.stars.length; i += 1) {
      const current = positions.get(C.starMap.stars[i].id);
      const next = positions.get(C.starMap.stars[(i + 1) % C.starMap.stars.length].id);
      ctx.moveTo(current.x, current.y);
      ctx.lineTo(next.x, next.y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.game.worldWidth / 2, this.game.worldHeight / 2, 315, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    for (const star of C.starMap.stars) {
      this.drawStar(ctx, star, positions.get(star.id));
    }

    if (this.activeConstellation) this.drawPatternPath(ctx, positions);
  }

  drawStar(ctx, star, pos) {
    const constellation = this.activeConstellation;
    const sequenceIndex = constellation?.sequence.indexOf(star.id) ?? -1;
    const isPatternStar = sequenceIndex >= 0;
    const completed = isPatternStar && sequenceIndex < constellation.progress;
    const expected = isPatternStar && sequenceIndex === constellation.progress;
    const pulse = 1 + Math.sin(this.game.time * 6 + sequenceIndex) * 0.14;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = completed ? C.visual.completed : expected ? C.visual.expected : C.visual.star;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.globalAlpha = isPatternStar ? 0.95 : 0.34;
    ctx.shadowBlur = expected ? 26 : isPatternStar ? 14 : 6;
    ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath();
    ctx.arc(0, 0, (expected ? 15 : 10) * (expected ? pulse : 1), 0, Math.PI * 2);
    ctx.fill();

    if (isPatternStar) {
      ctx.globalAlpha = completed ? 0.7 : 0.9;
      ctx.lineWidth = expected ? 5 : 3;
      ctx.beginPath();
      ctx.arc(0, 0, C.starMap.activationRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.font = '800 20px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(sequenceIndex + 1), 0, -62);
      ctx.font = '700 13px system-ui';
      ctx.fillText(star.id, 0, 5);
    } else {
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.55;
      ctx.font = '700 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(star.id, 0, 28);
    }
    ctx.restore();
  }

  drawPatternPath(ctx, positions) {
    const sequence = this.activeConstellation.sequence;
    ctx.save();
    ctx.strokeStyle = C.visual.expected;
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.32;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    sequence.forEach((id, index) => {
      const pos = positions.get(id);
      if (index === 0) ctx.moveTo(pos.x, pos.y);
      else ctx.lineTo(pos.x, pos.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  drawMeteorTelegraphs(ctx) {
    const cfg = C.minor.meteor;
    for (const zone of this.meteorZones) {
      if (zone.resolved) continue;
      const progress = 1 - zone.remaining / zone.duration;
      ctx.save();
      ctx.globalAlpha = 0.16 + progress * 0.28;
      ctx.fillStyle = C.visual.danger;
      ctx.strokeStyle = C.visual.warning;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, cfg.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawMajorTelegraph(ctx) {
    if (!this.activeConstellation) return;
    const progress = 1 - this.activeConstellation.remaining / this.activeConstellation.duration;
    ctx.save();
    ctx.globalAlpha = 0.04 + progress * 0.13;
    ctx.fillStyle = C.visual.danger;
    ctx.fillRect(0, 0, this.game.worldWidth, this.game.worldHeight);
    ctx.restore();
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = C.visual.body;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = C.visual.star;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius + 9, this.game.time * 0.45, this.game.time * 0.45 + Math.PI * 1.45);
    ctx.stroke();

    ctx.fillStyle = C.visual.core;
    ctx.beginPath();
    ctx.arc(0, -5, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#14243e';
    ctx.fillRect(-7, 8, 14, 42);
    ctx.restore();
  }
}
