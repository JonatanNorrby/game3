import { clamp, distance } from '../../../core/geometry.js';
import { LIVING_LIBRARY_CONFIG as C } from './config.js';

export class LivingLibrary {
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
    this.cast = null;
    this.sequenceIndex = 0;
    this.nextMechanic = C.encounter.openingDelay;
    this.previewBook = null;
    this.previewRemaining = 0;
    this.destroyedBooks = 0;
    this.basePulseTimer = C.encounter.basePulseInterval;
    this.rings = [];
    this.beams = [];
    this.groundZones = [];
    this.silenceZones = [];

    this.books = Object.entries(C.books.entries).map(([id, book]) => ({
      id,
      name: book.name,
      mechanicName: book.mechanicName,
      pageLabel: book.pageLabel,
      color: book.color,
      x: this.game.worldWidth * book.position.x,
      y: this.game.worldHeight * book.position.y,
      radius: C.books.radius,
      config: { name: book.name, radius: C.books.radius },
      health: C.books.maxHealth,
      maxHealth: C.books.maxHealth,
      alive: true,
      targetable: true,
      bobOffset: Math.random() * Math.PI * 2,
      baseY: this.game.worldHeight * book.position.y,
      takeDamage: (amount, source = 'Player') => this.damageBook(id, amount, source),
    }));
  }

  getHostileTargets() {
    return [this, ...this.books.filter((book) => book.alive && book.targetable)];
  }

  getBook(id) {
    return this.books.find((book) => book.id === id) ?? null;
  }

  getDamageMultiplier() {
    return 1 + this.destroyedBooks * C.encounter.damagePerDestroyedBook;
  }

  getCastMultiplier() {
    return Math.max(
      C.encounter.minCastMultiplier,
      1 - this.destroyedBooks * C.encounter.castSpeedPerDestroyedBook,
    );
  }

  scaledDamage(base) {
    return Math.round(base * this.getDamageMultiplier());
  }

  update(dt) {
    if (!this.alive || !this.game.player?.alive) return;

    this.updateBooks();
    this.updateRings(dt);
    this.updateBeams(dt);
    this.updateGroundZones(dt);
    this.updateSilenceZones(dt);
    this.updateBasePulse(dt);

    if (this.cast) {
      this.cast.remaining -= dt;
      if (this.cast.remaining <= 0) this.resolveCast();
      return;
    }

    if (this.previewBook) {
      this.previewRemaining -= dt;
      if (this.previewRemaining <= 0) this.beginPreviewedCast();
      return;
    }

    this.nextMechanic -= dt;
    if (this.nextMechanic <= 0) this.beginPreview();
  }

  updateBooks() {
    for (const book of this.books) {
      if (!book.alive) continue;
      book.y = book.baseY + Math.sin(this.game.time * 2.0 + book.bobOffset) * 10;
    }
  }

  updateBasePulse(dt) {
    this.basePulseTimer -= dt;
    if (this.basePulseTimer > 0) return;

    const damage = this.scaledDamage(C.encounter.basePulseDamage);
    for (const target of this.game.getEncounterTargets()) target.takeDamage(damage, 'Archivist Pulse');
    this.game.spawnArenaFlash('#7f66a8');
    this.game.playTone?.(196, 0.16, 0.025, 'triangle');
    this.basePulseTimer = C.encounter.basePulseInterval * this.getCastMultiplier();
  }

  chooseNextLivingBook() {
    for (let attempts = 0; attempts < C.sequence.length; attempts += 1) {
      const id = C.sequence[this.sequenceIndex % C.sequence.length];
      this.sequenceIndex += 1;
      const book = this.getBook(id);
      if (book?.alive) return book;
    }
    return null;
  }

  beginPreview() {
    const book = this.chooseNextLivingBook();
    if (!book) {
      this.nextMechanic = 2.5;
      return;
    }

    this.previewBook = book;
    this.previewRemaining = C.encounter.previewTime * this.getCastMultiplier();
    this.game.flashMessage(`UPCOMING: ${book.mechanicName} · ${book.name}`, 2.2);
    this.game.playTone?.(440, 0.08, 0.02, 'sine');
    this.game.playTone?.(554.37, 0.08, 0.018, 'sine');
  }

  beginPreviewedCast() {
    const book = this.previewBook;
    this.previewBook = null;
    this.previewRemaining = 0;

    if (!book?.alive) {
      this.nextMechanic = C.encounter.delayBetweenMechanics;
      return;
    }

    const mechanic = C.mechanics[book.id];
    const duration = mechanic.castTime * this.getCastMultiplier();
    this.cast = {
      id: book.id,
      bookId: book.id,
      name: book.mechanicName,
      duration,
      remaining: duration,
    };
    this.game.flashMessage(`${book.pageLabel}: ${book.mechanicName}`, 1.2);
    this.game.playTone?.(book.id === 'silence' ? 246.94 : 329.63, 0.12, 0.024, 'triangle');
  }

  resolveCast() {
    const cast = this.cast;
    this.cast = null;
    if (!cast) return;

    const book = this.getBook(cast.bookId);
    if (!book?.alive) {
      this.nextMechanic = C.encounter.delayBetweenMechanics;
      return;
    }

    const mechanic = C.mechanics[cast.id];
    if (cast.id === 'ring') this.spawnRing(book, mechanic);
    else if (cast.id === 'beam') this.spawnBeam(book, mechanic);
    else if (cast.id === 'blast') this.spawnGroundZones(book, mechanic);
    else if (cast.id === 'silence') this.spawnSilenceZones(book, mechanic);

    this.nextMechanic = C.encounter.delayBetweenMechanics * this.getCastMultiplier();
  }

  damageBook(id, amount) {
    const book = this.getBook(id);
    if (!book?.alive || amount <= 0) return;

    book.health = Math.max(0, book.health - amount);
    this.game.spawnFloatingText(book.x, book.y - 44, `-${Math.ceil(amount)}`, book.color);
    if (book.health <= 0) this.destroyBook(book);
  }

  destroyBook(book) {
    if (!book.alive) return;
    book.alive = false;
    book.targetable = false;
    book.health = 0;
    this.destroyedBooks += 1;

    const cancelledPreview = this.previewBook === book;
    const cancelledCast = this.cast?.bookId === book.id;
    if (cancelledPreview) {
      this.previewBook = null;
      this.previewRemaining = 0;
      this.nextMechanic = 0.8;
    }
    if (cancelledCast) {
      this.cast = null;
      this.nextMechanic = 0.8;
    }

    this.game.spawnBurst(book.x, book.y, book.color, 90);
    this.game.spawnArenaFlash('#ad7bff');
    this.game.playTone?.(110, 0.25, 0.045, 'sawtooth');
    this.game.flashMessage(
      `${book.name} destroyed · ${book.mechanicName} removed · Library Empowered ${this.destroyedBooks}`,
      2.4,
    );
  }

  spawnRing(book, mechanic) {
    this.rings.push({
      x: this.x,
      y: this.y,
      color: book.color,
      startRadius: mechanic.startRadius,
      endRadius: mechanic.endRadius,
      width: mechanic.width,
      damage: this.scaledDamage(mechanic.damage),
      duration: mechanic.duration,
      remaining: mechanic.duration,
      hitTargets: new Set(),
    });
  }

  spawnBeam(book, mechanic) {
    const angle = Math.atan2(this.game.player.y - this.y, this.game.player.x - this.x);
    this.beams.push({
      x: this.x,
      y: this.y,
      color: book.color,
      angle,
      speed: mechanic.rotationSpeed,
      length: mechanic.length,
      halfWidth: mechanic.halfWidth,
      damage: this.scaledDamage(mechanic.damage),
      hitCooldown: mechanic.hitCooldown,
      duration: mechanic.duration,
      remaining: mechanic.duration,
      targetCooldowns: new Map(),
    });
  }

  spawnGroundZones(book, mechanic) {
    const targets = this.game.getEncounterTargets();
    for (let i = 0; i < mechanic.count; i += 1) {
      const focus = targets[i % Math.max(1, targets.length)] ?? this.game.player;
      const spread = i === 0 ? 80 : mechanic.spread;
      this.groundZones.push({
        x: clamp(focus.x + (Math.random() - 0.5) * spread, 100, this.game.worldWidth - 100),
        y: clamp(focus.y + (Math.random() - 0.5) * spread, 100, this.game.worldHeight - 100),
        radius: mechanic.radius,
        damage: this.scaledDamage(mechanic.damage),
        color: book.color,
        duration: mechanic.delay,
        remaining: mechanic.delay,
      });
    }
  }

  spawnSilenceZones(book, mechanic) {
    const points = [
      { x: 0.32, y: 0.48 },
      { x: 0.68, y: 0.48 },
      { x: 0.5, y: 0.7 },
      { x: 0.5, y: 0.43 },
    ];
    const offset = this.sequenceIndex % points.length;
    for (let i = 0; i < mechanic.count; i += 1) {
      const point = points[(i + offset) % points.length];
      this.silenceZones.push({
        x: this.game.worldWidth * point.x,
        y: this.game.worldHeight * point.y,
        radius: mechanic.radius,
        color: book.color,
        duration: mechanic.duration,
        remaining: mechanic.duration,
      });
    }
  }

  updateRings(dt) {
    const targets = this.game.getEncounterTargets();
    for (const ring of this.rings) {
      ring.remaining -= dt;
      const progress = 1 - Math.max(0, ring.remaining) / ring.duration;
      const radius = ring.startRadius + (ring.endRadius - ring.startRadius) * progress;

      for (const target of targets) {
        if (ring.hitTargets.has(target)) continue;
        const targetRadius = target.config?.radius ?? target.radius ?? 18;
        if (Math.abs(distance(ring, target) - radius) <= ring.width / 2 + targetRadius) {
          ring.hitTargets.add(target);
          target.takeDamage(ring.damage, 'Binding Ring');
        }
      }
    }
    this.rings = this.rings.filter((ring) => ring.remaining > 0);
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
        if (beam.targetCooldowns.has(target) || !this.pointInBeam(target, beam)) continue;
        target.takeDamage(beam.damage, 'Reflected Passage');
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

  updateGroundZones(dt) {
    const targets = this.game.getEncounterTargets();
    for (const zone of this.groundZones) {
      zone.remaining -= dt;
      if (zone.remaining > 0) continue;
      for (const target of targets) {
        if (distance(zone, target) <= zone.radius) target.takeDamage(zone.damage, 'Burning Margins');
      }
      this.game.spawnBurst(zone.x, zone.y, zone.color, zone.radius);
    }
    this.groundZones = this.groundZones.filter((zone) => zone.remaining > 0);
  }

  updateSilenceZones(dt) {
    for (const zone of this.silenceZones) zone.remaining -= dt;
    this.silenceZones = this.silenceZones.filter((zone) => zone.remaining > 0);
  }

  isPlayerSilenced(player) {
    return this.silenceZones.some((zone) => distance(zone, player) <= zone.radius);
  }

  takeDamage(amount) {
    if (!this.alive || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.game.spawnFloatingText(this.x, this.y - 64, `-${Math.ceil(amount)}`, '#e8dcff');

    if (this.health <= 0) {
      this.alive = false;
      this.cast = null;
      this.previewBook = null;
      for (const book of this.books) {
        book.alive = false;
        book.targetable = false;
      }
      this.rings = [];
      this.beams = [];
      this.groundZones = [];
      this.silenceZones = [];
      this.game.onBossDefeated();
    }
  }

  drawTelegraph(ctx) {
    ctx.save();

    for (const ring of this.rings) {
      const progress = 1 - ring.remaining / ring.duration;
      const radius = ring.startRadius + (ring.endRadius - ring.startRadius) * progress;
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const beam of this.beams) {
      ctx.globalAlpha = 0.52;
      ctx.strokeStyle = beam.color;
      ctx.lineWidth = beam.halfWidth * 2;
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(
        beam.x + Math.cos(beam.angle) * beam.length,
        beam.y + Math.sin(beam.angle) * beam.length,
      );
      ctx.stroke();
    }

    for (const zone of this.groundZones) {
      ctx.globalAlpha = 0.18 + (1 - zone.remaining / zone.duration) * 0.3;
      ctx.fillStyle = zone.color;
      ctx.strokeStyle = zone.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    for (const zone of this.silenceZones) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = C.visual.silence;
      ctx.strokeStyle = zone.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#eafff0';
      ctx.font = '800 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('SILENCE', zone.x, zone.y + 5);
    }

    ctx.restore();
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.shadowBlur = 22;
    ctx.shadowColor = C.visual.ink;
    ctx.fillStyle = C.visual.body;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = C.visual.ink;
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.fillStyle = C.visual.core;
    ctx.fillRect(-18, -24, 36, 48);
    ctx.strokeStyle = '#4a3869';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, 22);
    ctx.stroke();

    ctx.fillStyle = '#f8f0ff';
    ctx.font = '800 13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`EMPOWERED ${this.destroyedBooks}`, 0, C.radius + 28);
    ctx.restore();

    for (const book of this.books) this.drawBook(ctx, book);
  }

  drawBook(ctx, book) {
    ctx.save();
    ctx.translate(book.x, book.y);
    ctx.globalAlpha = book.alive ? 1 : 0.18;

    const isPreview = this.previewBook === book;
    const isCasting = this.cast?.bookId === book.id;
    if (isPreview || isCasting) {
      const pulse = 8 + Math.sin(this.game.time * 8) * 4;
      ctx.strokeStyle = C.visual.warning;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, book.radius + 18 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowBlur = book.alive ? 16 : 0;
    ctx.shadowColor = book.color;
    ctx.fillStyle = '#efe7d2';
    ctx.fillRect(-38, -28, 76, 56);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = book.color;
    ctx.lineWidth = 4;
    ctx.strokeRect(-38, -28, 76, 56);
    ctx.strokeStyle = '#7a6c58';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(0, 26);
    ctx.stroke();

    if (book.alive) {
      ctx.fillStyle = '#2c2735';
      ctx.font = '900 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(book.pageLabel, 0, 4);

      ctx.fillStyle = book.color;
      ctx.font = '800 12px system-ui';
      ctx.fillText(book.name, 0, -book.radius - 26);
      ctx.fillStyle = '#f7f0ff';
      ctx.font = '700 11px system-ui';
      ctx.fillText(`${Math.ceil(book.health)} HP`, 0, book.radius + 26);

      if (isPreview) {
        ctx.fillStyle = C.visual.warning;
        ctx.font = '900 14px system-ui';
        ctx.fillText(`NEXT · ${book.mechanicName}`, 0, -book.radius - 46);
      } else if (isCasting) {
        ctx.fillStyle = '#fff1bb';
        ctx.font = '900 14px system-ui';
        ctx.fillText(`WRITING · ${book.mechanicName}`, 0, -book.radius - 46);
      }
    } else {
      ctx.fillStyle = '#8d7f94';
      ctx.font = '900 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('TORN OUT', 0, 4);
    }

    ctx.restore();
  }
}
