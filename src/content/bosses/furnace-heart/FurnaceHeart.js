import { clamp } from '../../../core/geometry.js';
import { FURNACE_HEART_CONFIG as C } from './config.js';

export class FurnaceHeart {
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
    this.heat = 0;
    this.coolingDelay = 0;
    this.cast = null;
    this.nextPulse = C.pulse.interval * 0.65;
    this.ignitionTimer = C.sectors.warmInterval;
    this.sectors = [];
    this.lastHeatBand = 'cool';
    this.lastPlayerCast = null;
    this.lastCooldowns = {};
    this.suppressNextCooldownRise = new Set();
  }

  getHostileTargets() {
    return this.alive ? [this] : [];
  }

  getEncounterResourceState() {
    const band = this.getHeatBand();
    const colors = {
      cool: C.visual.cool,
      warm: C.visual.warning,
      hot: C.visual.fire,
      critical: C.visual.critical,
    };
    return {
      label: `HEAT · ${band.toUpperCase()}`,
      current: this.heat,
      max: C.heat.max,
      color: colors[band],
    };
  }

  getHeatBand() {
    if (this.heat >= C.heat.criticalAt) return 'critical';
    if (this.heat >= C.heat.hotAt) return 'hot';
    if (this.heat >= C.heat.warmAt) return 'warm';
    return 'cool';
  }

  registerAbilityHeat(abilityId) {
    const ability = this.game.abilityBar?.abilities?.[abilityId] ?? this.game.player?.config?.abilities?.[abilityId];
    if (!this.alive || !ability) return;
    const gain = this.scoreAbilityHeat(ability);
    const before = this.heat;
    this.heat = clamp(this.heat + gain, 0, C.heat.max);
    this.coolingDelay = C.heat.coolingDelayAfterCast;
    this.game.spawnFloatingText(this.game.player.x, this.game.player.y - 50, `+${Math.round(gain)} Heat`, '#ffb15e');
    this.announceHeatBand(before);
  }

  scoreAbilityHeat(ability) {
    const number = (value) => Number.isFinite(value) ? Math.max(0, value) : 0;
    const castTime = number(ability.castTime);
    const cooldown = number(ability.cooldown ?? ability.cooldownAfterRecall);
    const directDamage = number(ability.damage ?? ability.damagePerMissile ?? ability.pounceDamage ?? ability.autoAttackDamage);
    const heal = number(ability.heal ?? ability.healPerTick);
    const resourceCost = number(ability.manaCost ?? ability.furyCost);

    let periodicPower = 0;
    const dot = ability.dot;
    if (dot) {
      const ticks = number(dot.tickEvery) > 0 ? number(dot.duration) / number(dot.tickEvery) : 0;
      periodicPower += number(dot.damagePerTick) * ticks;
    }
    if (number(ability.damagePerTick) > 0 && number(ability.tickEvery) > 0) {
      periodicPower += number(ability.damagePerTick) * (number(ability.duration) / number(ability.tickEvery));
    }
    if (number(ability.healPerTick) > 0 && number(ability.tickEvery) > 0) {
      periodicPower += number(ability.healPerTick) * (number(ability.duration) / number(ability.tickEvery)) * 0.7;
    }

    const raw = 4
      + castTime * 1.7
      + Math.min(5, cooldown * 0.22)
      + directDamage / 18
      + heal / 24
      + periodicPower / 55
      + resourceCost / 12;

    return clamp(raw, C.heat.minPerAbility, C.heat.maxPerAbility);
  }

  announceHeatBand(previousHeat) {
    const previousBand = this.bandForHeat(previousHeat);
    const band = this.getHeatBand();
    if (band === previousBand || band === this.lastHeatBand) return;
    this.lastHeatBand = band;
    if (band === 'warm') this.game.flashMessage('FURNACE WARM — SECTORS PRIMING', 1.3);
    if (band === 'hot') this.game.flashMessage('FURNACE HOT — HEART OVEREXPOSED', 1.5);
    if (band === 'critical') this.game.flashMessage('CRITICAL HEAT — ARENA IGNITION', 1.7);
  }

  bandForHeat(value) {
    if (value >= C.heat.criticalAt) return 'critical';
    if (value >= C.heat.hotAt) return 'hot';
    if (value >= C.heat.warmAt) return 'warm';
    return 'cool';
  }

  detectPlayerAbilityUse() {
    const player = this.game.player;
    if (!player?.alive) return;

    const currentCast = player.cast ?? null;
    if (currentCast && currentCast !== this.lastPlayerCast) {
      this.registerAbilityHeat(currentCast.id);
      this.suppressNextCooldownRise.add(currentCast.id);
    }

    for (const [id, value] of Object.entries(player.cooldowns ?? {})) {
      const previous = this.lastCooldowns[id] ?? 0;
      if (value > previous + 0.05) {
        if (this.suppressNextCooldownRise.has(id)) this.suppressNextCooldownRise.delete(id);
        else this.registerAbilityHeat(id);
      }
    }

    this.lastPlayerCast = currentCast;
    this.lastCooldowns = { ...(player.cooldowns ?? {}) };
  }

  update(dt) {
    if (!this.alive || !this.game.player?.alive) return;

    this.detectPlayerAbilityUse();
    this.updateHeat(dt);
    this.updateSectors(dt);
    this.updatePulse(dt);
  }

  updateHeat(dt) {
    if (this.coolingDelay > 0) {
      this.coolingDelay = Math.max(0, this.coolingDelay - dt);
    } else if (this.heat > 0) {
      const before = this.heat;
      this.heat = Math.max(0, this.heat - C.heat.coolPerSecond * dt);
      const band = this.getHeatBand();
      if (band !== this.lastHeatBand) {
        this.lastHeatBand = band;
        if (band === 'cool') this.game.flashMessage('FURNACE COOLED', 1.0);
        else if (band === 'warm') this.game.flashMessage('Heat falling — pressure easing', 0.9);
      }
      if (before >= C.heat.hotAt && this.heat < C.heat.hotAt) this.game.spawnArenaFlash('#315a7a');
    }

    const band = this.getHeatBand();
    if (band === 'cool') {
      this.ignitionTimer = Math.min(this.ignitionTimer, C.sectors.warmInterval);
      return;
    }

    this.ignitionTimer -= dt;
    if (this.ignitionTimer <= 0) {
      this.igniteForBand(band);
      this.ignitionTimer = band === 'critical'
        ? C.sectors.criticalInterval
        : band === 'hot'
          ? C.sectors.hotInterval
          : C.sectors.warmInterval;
    }
  }

  igniteForBand(band) {
    const count = band === 'critical' ? 3 : band === 'hot' ? 2 : 1;
    const duration = band === 'critical'
      ? C.sectors.criticalDuration
      : band === 'hot'
        ? C.sectors.hotDuration
        : C.sectors.warmDuration;
    const damage = band === 'critical'
      ? C.sectors.criticalDamage
      : band === 'hot'
        ? C.sectors.hotDamage
        : C.sectors.warmDamage;

    const total = C.sectors.columns * C.sectors.rows;
    const unavailable = new Set(this.sectors.map((sector) => sector.index));
    const candidates = [];
    for (let index = 0; index < total; index += 1) {
      if (!unavailable.has(index)) candidates.push(index);
    }

    for (let i = 0; i < count && candidates.length; i += 1) {
      const pick = Math.floor(Math.random() * candidates.length);
      const index = candidates.splice(pick, 1)[0];
      this.sectors.push({
        index,
        warningRemaining: C.sectors.warningTime,
        remaining: duration,
        damage,
        tickTimer: C.sectors.damageTickEvery,
      });
    }
  }

  updateSectors(dt) {
    for (const sector of this.sectors) {
      if (sector.warningRemaining > 0) {
        sector.warningRemaining = Math.max(0, sector.warningRemaining - dt);
        continue;
      }

      sector.remaining -= dt;
      sector.tickTimer -= dt;
      while (sector.tickTimer <= 0 && sector.remaining > 0) {
        sector.tickTimer += C.sectors.damageTickEvery;
        this.damageTargetsInSector(sector);
      }
    }

    this.sectors = this.sectors.filter((sector) => sector.warningRemaining > 0 || sector.remaining > 0);
  }

  damageTargetsInSector(sector) {
    const bounds = this.getSectorBounds(sector.index);
    for (const target of this.game.getEncounterTargets()) {
      if (target.x >= bounds.x && target.x <= bounds.x + bounds.width
        && target.y >= bounds.y && target.y <= bounds.y + bounds.height) {
        target.takeDamage(sector.damage, 'Ignited Furnace Sector');
      }
    }
  }

  getSectorBounds(index) {
    const col = index % C.sectors.columns;
    const row = Math.floor(index / C.sectors.columns);
    const pad = C.sectors.edgePadding;
    const usableWidth = this.game.worldWidth - pad * 2;
    const usableHeight = this.game.worldHeight - pad * 2;
    const width = usableWidth / C.sectors.columns;
    const height = usableHeight / C.sectors.rows;
    return {
      x: pad + col * width,
      y: pad + row * height,
      width,
      height,
    };
  }

  updatePulse(dt) {
    if (this.cast) {
      this.cast.remaining -= dt;
      if (this.cast.remaining <= 0) this.resolvePulse();
      return;
    }

    this.nextPulse -= dt;
    if (this.nextPulse <= 0) {
      this.cast = {
        id: 'furnacePulse',
        name: C.pulse.name,
        duration: C.pulse.castTime,
        remaining: C.pulse.castTime,
      };
    }
  }

  resolvePulse() {
    this.cast = null;
    const damage = Math.round(C.pulse.baseDamage + this.heat * C.pulse.heatDamageScale);
    for (const target of this.game.getEncounterTargets()) target.takeDamage(damage, C.pulse.name);
    this.game.spawnArenaFlash(this.getHeatBand() === 'critical' ? C.visual.critical : C.visual.fire);
    this.game.spawnBurst(this.x, this.y, C.visual.core, 280 + this.heat * 1.4);
    this.nextPulse = C.pulse.interval;
  }

  getDamageTakenMultiplier() {
    if (this.heat >= C.heat.criticalAt) return C.heat.criticalDamageTakenMultiplier;
    if (this.heat >= C.heat.hotAt) return C.heat.hotDamageTakenMultiplier;
    return 1;
  }

  takeDamage(amount) {
    if (!this.alive) return;
    const multiplier = this.getDamageTakenMultiplier();
    const actual = Math.max(0, amount * multiplier);
    this.health = Math.max(0, this.health - actual);
    const label = multiplier > 1 ? `-${Math.round(actual)} OVEREXPOSED` : `-${Math.round(actual)}`;
    this.game.spawnFloatingText(this.x, this.y - 92, label, multiplier > 1 ? '#ffe07a' : '#ffb27a');
    if (this.health <= 0) {
      this.alive = false;
      this.cast = null;
      this.sectors = [];
      this.game.onBossDefeated();
    }
  }

  drawTelegraph(ctx) {
    this.drawSectorGrid(ctx);
    this.drawHeatHalo(ctx);
    this.drawHeatMeter(ctx);

    if (!this.cast) return;
    const progress = 1 - this.cast.remaining / this.cast.duration;
    ctx.save();
    ctx.globalAlpha = 0.12 + progress * 0.18;
    ctx.fillStyle = C.visual.fire;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 260 + progress * 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawSectorGrid(ctx) {
    for (let index = 0; index < C.sectors.columns * C.sectors.rows; index += 1) {
      const bounds = this.getSectorBounds(index);
      const sector = this.sectors.find((item) => item.index === index);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,170,90,.16)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bounds.x + 3, bounds.y + 3, bounds.width - 6, bounds.height - 6);

      if (sector) {
        const warning = sector.warningRemaining > 0;
        const pulse = 0.5 + Math.sin(this.game.time * 9 + index) * 0.12;
        ctx.fillStyle = warning ? C.visual.warning : C.visual.fire;
        ctx.globalAlpha = warning ? 0.12 + pulse * 0.12 : 0.18 + pulse * 0.14;
        ctx.fillRect(bounds.x + 4, bounds.y + 4, bounds.width - 8, bounds.height - 8);
        ctx.globalAlpha = warning ? 0.85 : 0.95;
        ctx.strokeStyle = warning ? C.visual.warning : C.visual.critical;
        ctx.lineWidth = warning ? 4 : 5;
        ctx.strokeRect(bounds.x + 6, bounds.y + 6, bounds.width - 12, bounds.height - 12);
        ctx.font = '800 18px system-ui';
        ctx.textAlign = 'center';
        ctx.fillStyle = warning ? '#ffe7ad' : '#fff1de';
        ctx.fillText(warning ? 'IGNITING' : 'BURNING', bounds.x + bounds.width / 2, bounds.y + 32);
      }
      ctx.restore();
    }
  }

  drawHeatMeter(ctx) {
    const width = 270;
    const height = 18;
    const x = this.x - width / 2;
    const y = this.y - C.radius - 92;
    const ratio = this.heat / C.heat.max;
    const band = this.getHeatBand();
    const fill = band === 'critical'
      ? C.visual.critical
      : band === 'hot'
        ? C.visual.fire
        : band === 'warm'
          ? C.visual.warning
          : C.visual.cool;

    ctx.save();
    ctx.fillStyle = 'rgba(10,12,18,.82)';
    ctx.strokeStyle = 'rgba(255,235,210,.55)';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = fill;
    ctx.fillRect(x + 2, y + 2, (width - 4) * ratio, height - 4);
    ctx.fillStyle = '#fff5e8';
    ctx.font = '900 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`HEAT ${Math.round(this.heat)} / ${C.heat.max} · ${band.toUpperCase()}`, this.x, y - 8);
    ctx.restore();
  }

  drawHeatHalo(ctx) {
    const ratio = this.heat / C.heat.max;
    if (ratio <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = 0.08 + ratio * 0.22;
    ctx.strokeStyle = this.heat >= C.heat.criticalAt ? C.visual.critical : C.visual.fire;
    ctx.lineWidth = 8 + ratio * 10;
    ctx.beginPath();
    ctx.arc(this.x, this.y, C.radius + 30 + ratio * 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx) {
    const heatRatio = this.heat / C.heat.max;
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = C.visual.shell;
    ctx.beginPath();
    ctx.arc(0, 0, C.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = heatRatio >= 0.85 ? C.visual.hotCore : C.visual.core;
    ctx.shadowBlur = 18 + heatRatio * 34;
    ctx.shadowColor = C.visual.fire;
    ctx.beginPath();
    ctx.arc(0, 0, 34 + heatRatio * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#2b1715';
    ctx.lineWidth = 9;
    for (let i = 0; i < 6; i += 1) {
      const angle = i / 6 * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 42, Math.sin(angle) * 42);
      ctx.lineTo(Math.cos(angle) * 68, Math.sin(angle) * 68);
      ctx.stroke();
    }

    if (this.heat >= C.heat.hotAt) {
      ctx.fillStyle = '#fff4c7';
      ctx.font = '900 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('OVEREXPOSED', 0, C.radius + 27);
    }

    ctx.restore();
  }
}
