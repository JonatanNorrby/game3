import { clamp, distance } from '../../../core/geometry.js';
import { CHOIR_CONFIG as C } from './config.js';

const HEAD_RADIUS = 32;

export class Choir {
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
    this.targetable = false;
    this.phase = 1;
    this.phaseAnnounced = 1;
    this.sequenceIndex = 0;
    this.nextSong = C.encounter.openingDelay;
    this.cast = null;
    this.rings = [];
    this.beams = [];
    this.groundZones = [];
    this.silenceZones = [];

    this.heads = C.heads.map((head, index) => ({
      id: head.id,
      name: head.name,
      note: head.note,
      frequency: head.frequency,
      color: head.color,
      radius: HEAD_RADIUS,
      config: { name: head.name, radius: HEAD_RADIUS },
      x: this.x + head.offset.x,
      y: this.y + head.offset.y,
      baseX: this.x + head.offset.x,
      baseY: this.y + head.offset.y,
      bobOffset: index * 1.7,
      alive: true,
      targetable: true,
      takeDamage: (amount, source = 'Player') => this.takeDamage(amount, source),
    }));
  }

  getHostileTargets() {
    return this.alive ? this.heads : [];
  }

  getHead(id) {
    return this.heads.find((head) => head.id === id) ?? this.heads[0];
  }

  getSequence() {
    if (this.phase === 1) return C.phaseOneSequence;
    if (this.phase === 2) return C.phaseTwoSequence;
    return C.phaseThreeSequence;
  }

  update(dt) {
    if (!this.alive || !this.game.player?.alive) return;

    this.updateHeads();
    this.updatePhase();
    this.updateRings(dt);
    this.updateBeams(dt);
    this.updateGroundZones(dt);
    this.updateSilenceZones(dt);

    if (this.cast) {
      this.cast.remaining -= dt;
      if (this.cast.remaining <= 0) this.resolveSong();
      return;
    }

    this.nextSong -= dt;
    if (this.nextSong <= 0) this.beginSong();
  }

  updateHeads() {
    for (const head of this.heads) {
      head.x = head.baseX;
      head.y = head.baseY + Math.sin(this.game.time * 2.2 + head.bobOffset) * 10;
    }
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
    this.sequenceIndex = 0;

    if (this.phase === 2) {
      this.game.flashMessage('SECOND MOVEMENT — THE CHOIR FORMS CHORDS', 2.4);
      this.playChord(['c', 'e'], 0.18);
    } else {
      this.game.flashMessage('FINAL MOVEMENT — FULL HARMONY', 2.4);
      this.playChord(['c', 'd', 'e', 'f'], 0.22);
    }
  }

  beginSong() {
    const sequence = this.getSequence();
    const song = sequence[this.sequenceIndex % sequence.length];
    this.sequenceIndex += 1;

    const longestCast = Math.max(...song.notes.map((id) => C.notes[id].castTime));
    const phaseSpeed = this.phase === 3 ? 0.78 : this.phase === 2 ? 0.9 : 1;
    const duration = longestCast * phaseSpeed;
    const noteLabel = song.notes.map((id) => this.getHead(id).note).join('+');

    this.cast = {
      id: 'song',
      name: song.notes.length === 1
        ? `NOTE ${noteLabel} — ${C.notes[song.notes[0]].name}`
        : `CHORD ${noteLabel} — ${song.name}`,
      duration,
      remaining: duration,
      notes: [...song.notes],
      songName: song.name,
    };

    this.playChord(song.notes, 0.14);
    this.game.flashMessage(
      song.notes.length === 1 ? `NOTE ${noteLabel}` : `${song.name.toUpperCase()} · ${noteLabel}`,
      1.2,
    );
  }

  resolveSong() {
    const cast = this.cast;
    this.cast = null;
    if (!cast) return;

    for (const noteId of cast.notes) this.triggerNote(noteId);
    this.playChord(cast.notes, 0.2, 2);

    const pressure = this.phase === 3 ? 0.72 : this.phase === 2 ? 0.86 : 1;
    this.nextSong = C.encounter.delayBetweenSongs * pressure;
  }

  triggerNote(noteId) {
    const note = C.notes[noteId];
    const head = this.getHead(noteId);
    if (!note || !head) return;

    if (note.mechanic === 'ring') this.spawnRing(head, note);
    else if (note.mechanic === 'beam') this.spawnBeam(head, note);
    else if (note.mechanic === 'ground') this.spawnGroundZones(head, note);
    else if (note.mechanic === 'silence') this.spawnSilenceZones(head, note);
  }

  spawnRing(head, note) {
    this.rings.push({
      x: head.x,
      y: head.y,
      color: head.color,
      startRadius: note.ringStartRadius,
      endRadius: note.ringEndRadius,
      width: note.ringWidth,
      damage: note.damage,
      duration: note.ringDuration,
      remaining: note.ringDuration,
      hitTargets: new Set(),
    });
  }

  spawnBeam(head, note) {
    const towardPlayer = Math.atan2(this.game.player.y - head.y, this.game.player.x - head.x);
    this.beams.push({
      x: head.x,
      y: head.y,
      color: head.color,
      angle: towardPlayer,
      speed: note.rotationSpeed * (this.phase === 3 ? 1.3 : 1),
      length: note.beamLength,
      halfWidth: note.beamHalfWidth,
      damage: note.damage,
      hitCooldown: note.hitCooldown,
      duration: note.beamDuration,
      remaining: note.beamDuration,
      targetCooldowns: new Map(),
    });
  }

  spawnGroundZones(head, note) {
    const targets = this.game.getEncounterTargets();
    for (let i = 0; i < note.count; i += 1) {
      const focus = targets[i % Math.max(1, targets.length)] ?? this.game.player;
      const spread = i === 0 ? 70 : 360;
      this.groundZones.push({
        x: clamp(focus.x + (Math.random() - 0.5) * spread, 90, this.game.worldWidth - 90),
        y: clamp(focus.y + (Math.random() - 0.5) * spread, 90, this.game.worldHeight - 90),
        radius: note.radius,
        damage: note.damage,
        color: head.color,
        duration: note.delay,
        remaining: note.delay,
      });
    }
  }

  spawnSilenceZones(head, note) {
    const points = [
      { x: 0.27, y: 0.54 },
      { x: 0.73, y: 0.54 },
      { x: 0.5, y: 0.75 },
      { x: 0.5, y: 0.4 },
    ];
    const offset = this.sequenceIndex % points.length;
    for (let i = 0; i < note.count; i += 1) {
      const point = points[(i + offset) % points.length];
      this.silenceZones.push({
        x: this.game.worldWidth * point.x,
        y: this.game.worldHeight * point.y,
        radius: note.radius,
        color: head.color,
        duration: note.duration,
        remaining: note.duration,
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
          target.takeDamage(ring.damage, 'Resonant Ring');
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
        if (beam.targetCooldowns.has(target)) continue;
        if (!this.pointInBeam(target, beam)) continue;
        target.takeDamage(beam.damage, 'Sweeping Hymn');
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
        if (distance(zone, target) <= zone.radius) target.takeDamage(zone.damage, 'Falling Cadence');
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

  playChord(noteIds, duration = 0.15, octave = 1) {
    for (const noteId of noteIds) {
      const head = this.getHead(noteId);
      if (!head) continue;
      this.game.playTone?.(head.frequency * octave, duration, 0.03, 'sine');
    }
  }

  takeDamage(amount) {
    if (!this.alive || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    const target = this.game.getCombatTarget?.() ?? this.heads[0];
    this.game.spawnFloatingText(target.x, target.y - 48, `-${Math.ceil(amount)}`, '#f0e7ff');

    if (this.health <= 0) {
      this.alive = false;
      this.cast = null;
      for (const head of this.heads) {
        head.alive = false;
        head.targetable = false;
      }
      this.rings = [];
      this.beams = [];
      this.groundZones = [];
      this.silenceZones = [];
      this.game.playTone?.(130.81, 0.7, 0.05, 'sine');
      this.game.onBossDefeated();
    }
  }

  drawTelegraph(ctx) {
    ctx.save();

    for (const ring of this.rings) {
      const progress = 1 - ring.remaining / ring.duration;
      const radius = ring.startRadius + (ring.endRadius - ring.startRadius) * progress;
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const beam of this.beams) {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = beam.color;
      ctx.lineWidth = beam.halfWidth * 2;
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(
        beam.x + Math.cos(beam.angle) * beam.length,
        beam.y + Math.sin(beam.angle) * beam.length,
      );
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    for (const zone of this.groundZones) {
      const pulse = 1 + Math.sin(this.game.time * 10) * 0.06;
      ctx.globalAlpha = 0.18 + (1 - zone.remaining / zone.duration) * 0.28;
      ctx.fillStyle = zone.color;
      ctx.strokeStyle = zone.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius * pulse, 0, Math.PI * 2);
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
      ctx.globalAlpha = 0.85;
      ctx.font = '800 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#dfffea';
      ctx.fillText('SILENCE', zone.x, zone.y + 5);
    }

    if (this.cast) {
      const progress = 1 - this.cast.remaining / this.cast.duration;
      for (const noteId of this.cast.notes) {
        const head = this.getHead(noteId);
        ctx.globalAlpha = 0.25 + progress * 0.55;
        ctx.strokeStyle = head.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(head.x, head.y, HEAD_RADIUS + 14 + progress * 12, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(220,210,245,.18)';
    ctx.lineWidth = 3;
    for (let i = 0; i < this.heads.length - 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(this.heads[i].x, this.heads[i].y);
      ctx.lineTo(this.heads[i + 1].x, this.heads[i + 1].y);
      ctx.stroke();
    }
    ctx.restore();

    for (const head of this.heads) {
      if (!head.alive) continue;
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.shadowBlur = 18;
      ctx.shadowColor = head.color;
      ctx.fillStyle = '#342d48';
      ctx.beginPath();
      ctx.arc(0, 0, HEAD_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = head.color;
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.fillStyle = C.visual.core;
      ctx.beginPath();
      ctx.arc(-10, -5, 4, 0, Math.PI * 2);
      ctx.arc(10, -5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.visual.core;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 7, 10, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = head.color;
      ctx.font = '900 16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(head.note, 0, -HEAD_RADIUS - 12);
      ctx.restore();
    }
  }
}
