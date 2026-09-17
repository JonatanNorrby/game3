import { Input } from './Input.js';
import { ArcaneMage } from '../content/classes/arcane-mage/ArcaneMage.js';
import { ARCANE_MAGE_CONFIG } from '../content/classes/arcane-mage/config.js';
import { ArcaneWarden } from '../content/bosses/arcane-warden/ArcaneWarden.js';

export class Game {
  constructor(canvas, viewport = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = Math.max(1, Math.round(viewport.width ?? window.innerWidth ?? 1280));
    this.height = Math.max(1, Math.round(viewport.height ?? window.innerHeight ?? 720));
    this.pixelRatio = Math.max(1, Math.min(viewport.pixelRatio ?? window.devicePixelRatio ?? 1, 2));
    this.configureSurface();

    this.input = new Input();
    this.time = 0;
    this.lastTime = performance.now();
    this.shake = 0;
    this.state = 'playing';
    this.projectiles = [];
    this.effects = [];
    this.floatingTexts = [];
    this.flashTimer = 0;

    // Boss-rush roster: add future boss constructors here.
    this.roster = [ArcaneWarden];
    this.bossIndex = 0;
    this.player = new ArcaneMage(this);
    this.boss = new this.roster[this.bossIndex](this);

    this.cacheUI();
    this.buildAbilityBar();
    this.bindUI();
    this.updateUI();
  }

  configureSurface() {
    this.canvas.width = Math.max(1, Math.round(this.width * this.pixelRatio));
    this.canvas.height = Math.max(1, Math.round(this.height * this.pixelRatio));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  resizeViewport(viewport = {}) {
    const nextWidth = Math.max(1, Math.round(viewport.width ?? this.width));
    const nextHeight = Math.max(1, Math.round(viewport.height ?? this.height));
    const nextPixelRatio = Math.max(1, Math.min(viewport.pixelRatio ?? this.pixelRatio, 2));

    const scaleX = nextWidth / this.width;
    const scaleY = nextHeight / this.height;

    this.width = nextWidth;
    this.height = nextHeight;
    this.pixelRatio = nextPixelRatio;
    this.configureSurface();

    const scalePoint = (point) => {
      if (!point) return;
      point.x *= scaleX;
      point.y *= scaleY;
    };

    scalePoint(this.player);
    scalePoint(this.player?.anchor);
    scalePoint(this.boss);

    for (const projectile of this.projectiles) {
      projectile.sx *= scaleX;
      projectile.sy *= scaleY;
      projectile.ex *= scaleX;
      projectile.ey *= scaleY;
    }

    for (const effect of this.effects) {
      if (typeof effect.x === 'number') effect.x *= scaleX;
      if (typeof effect.y === 'number') effect.y *= scaleY;
    }

    for (const text of this.floatingTexts) scalePoint(text);
    for (const zone of this.boss?.cast?.zones ?? []) scalePoint(zone);
  }

  cacheUI() {
    const id = (name) => document.getElementById(name);
    this.ui = {
      bossName: id('boss-name'), bossHp: id('boss-hp'), bossHpText: id('boss-hp-text'),
      bossCastWrap: id('boss-cast-wrap'), bossCastName: id('boss-cast-name'), bossCastTime: id('boss-cast-time'), bossCast: id('boss-cast'),
      playerHp: id('player-hp'), playerHpText: id('player-hp-text'),
      playerCastWrap: id('player-cast-wrap'), playerCastName: id('player-cast-name'), playerCastTime: id('player-cast-time'), playerCast: id('player-cast'),
      abilities: id('abilities'), banner: id('banner'), encounterLabel: id('encounter-label'),
    };
  }

  bindUI() {
    this.ui.banner.addEventListener('click', () => {
      if (this.state !== 'playing') this.restartEncounter();
    });
  }

  buildAbilityBar() {
    this.ui.abilities.innerHTML = '';
    for (const [id, ability] of Object.entries(ARCANE_MAGE_CONFIG.abilities)) {
      const button = document.createElement('button');
      button.className = 'ability';
      button.dataset.ability = id;
      button.innerHTML = `
        <span class="ability-key">${ability.key}</span>
        <span class="ability-name">${ability.name}</span>
        <span class="ability-desc">${ability.description}</span>
        <span class="ability-cd hidden"></span>`;
      button.addEventListener('click', () => {
        const method = {
          renew: 'useRenew', directHeal: 'useDirectHeal', barrage: 'useBarrage', filler: 'useFiller', teleport: 'useTeleport',
        }[id];
        this.player[method]();
      });
      this.ui.abilities.appendChild(button);
    }
  }

  start() { requestAnimationFrame((now) => this.loop(now)); }

  loop(now) {
    const dt = Math.min(0.033, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.time += dt;

    if (this.state === 'playing') {
      this.player.update(dt, this.input);
      this.boss.update(dt);
      this.updateParticles(dt);
    }

    this.shake = Math.max(0, this.shake - dt * 24);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.draw();
    this.updateUI();
    this.input.endFrame();
    requestAnimationFrame((next) => this.loop(next));
  }

  updateParticles(dt) {
    for (const p of this.projectiles) p.t += dt / p.duration;
    this.projectiles = this.projectiles.filter((p) => p.t < 1);

    for (const effect of this.effects) effect.remaining -= dt;
    this.effects = this.effects.filter((effect) => effect.remaining > 0);

    for (const text of this.floatingTexts) {
      text.remaining -= dt;
      text.y -= 28 * dt;
    }
    this.floatingTexts = this.floatingTexts.filter((text) => text.remaining > 0);
  }

  damageBoss(amount) {
    if (this.state !== 'playing' || !this.boss.alive) return;
    this.boss.takeDamage(amount);
  }

  spawnProjectile(from, to, color, duration) {
    this.projectiles.push({ sx: from.x, sy: from.y, ex: to.x, ey: to.y, color, duration, t: 0 });
  }

  spawnBurst(x, y, color, radius = 54) {
    this.effects.push({ type: 'burst', x, y, color, radius, duration: 0.45, remaining: 0.45 });
  }

  spawnArenaFlash(color) {
    this.effects.push({ type: 'flash', color, duration: 0.22, remaining: 0.22 });
  }

  spawnFloatingText(x, y, text, color) {
    this.floatingTexts.push({ x, y, text, color, remaining: 0.75, duration: 0.75 });
  }

  flashMessage(text, duration = 1.1) {
    this.flashText = text;
    this.flashTimer = duration;
  }

  onPlayerDefeated(source) {
    this.state = 'defeat';
    this.ui.banner.textContent = `WIPED\n${source}\n\nClick to retry`;
    this.ui.banner.classList.remove('hidden');
  }

  onBossDefeated() {
    this.state = 'victory';
    this.ui.banner.textContent = `BOSS DEFEATED\nPrototype clear\n\nClick to run it again`;
    this.ui.banner.classList.remove('hidden');
  }

  restartEncounter() {
    this.player.reset();
    this.boss = new this.roster[this.bossIndex](this);
    this.projectiles = [];
    this.effects = [];
    this.floatingTexts = [];
    this.state = 'playing';
    this.ui.banner.classList.add('hidden');
    this.flashMessage('Pull started', 1.4);
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.translate(sx, sy);
    this.drawArena(ctx);
    this.boss.drawTelegraph(ctx);
    if (this.boss.alive) this.boss.draw(ctx);
    if (this.player.alive) this.player.draw(ctx);
    this.drawProjectiles(ctx);
    this.drawEffects(ctx);
    this.drawFloatingTexts(ctx);
    this.drawCenterMessage(ctx);
    ctx.restore();
  }

  drawArena(ctx) {
    ctx.fillStyle = '#0e1424';
    ctx.fillRect(0, 0, this.width, this.height);
    const grid = 64;
    ctx.strokeStyle = 'rgba(150,175,225,.055)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke(); }
    for (let y = 0; y <= this.height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke(); }
    ctx.strokeStyle = '#323c5d';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, this.width - 20, this.height - 20);
    ctx.strokeStyle = 'rgba(155,105,230,.14)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.34, 0, Math.PI * 2); ctx.stroke();
  }

  drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      const t = Math.min(1, p.t);
      const x = p.sx + (p.ex - p.sx) * t;
      const y = p.sy + (p.ey - p.sy) * t;
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 18;
      ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  drawEffects(ctx) {
    for (const e of this.effects) {
      const alpha = e.remaining / e.duration;
      ctx.save();
      if (e.type === 'burst') {
        const progress = 1 - alpha;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 8 * alpha + 1;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * progress, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === 'flash') {
        ctx.globalAlpha = alpha * 0.22;
        ctx.fillStyle = e.color;
        ctx.fillRect(0, 0, this.width, this.height);
      }
      ctx.restore();
    }
  }

  drawFloatingTexts(ctx) {
    ctx.save();
    ctx.font = '700 20px system-ui';
    ctx.textAlign = 'center';
    for (const t of this.floatingTexts) {
      ctx.globalAlpha = Math.min(1, t.remaining / 0.25);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  drawCenterMessage(ctx) {
    if (this.flashTimer <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.flashTimer * 2);
    ctx.font = '800 26px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eef2ff';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#000';
    ctx.fillText(this.flashText, this.width / 2, 128);
    ctx.restore();
  }

  updateUI() {
    const bossPct = Math.max(0, this.boss.health / this.boss.config.maxHealth * 100);
    const playerPct = Math.max(0, this.player.health / this.player.config.maxHealth * 100);
    this.ui.bossName.textContent = this.boss.config.name;
    this.ui.bossHp.style.width = `${bossPct}%`;
    this.ui.bossHpText.textContent = `${Math.ceil(bossPct)}%`;
    this.ui.playerHp.style.width = `${playerPct}%`;
    this.ui.playerHpText.textContent = `${Math.ceil(this.player.health)} / ${this.player.config.maxHealth}`;
    this.ui.encounterLabel.textContent = `Boss ${this.bossIndex + 1} / ${this.roster.length}`;

    this.updateCastUI(this.ui.bossCastWrap, this.ui.bossCastName, this.ui.bossCastTime, this.ui.bossCast, this.boss.cast);
    this.updateCastUI(this.ui.playerCastWrap, this.ui.playerCastName, this.ui.playerCastTime, this.ui.playerCast, this.player.cast);

    for (const button of this.ui.abilities.querySelectorAll('.ability')) {
      const id = button.dataset.ability;
      const cd = this.player.cooldowns[id] ?? 0;
      const overlay = button.querySelector('.ability-cd');
      if (cd > 0.05) {
        overlay.textContent = cd.toFixed(cd < 1 ? 1 : 0);
        overlay.classList.remove('hidden');
      } else {
        overlay.classList.add('hidden');
      }
    }
  }

  updateCastUI(wrap, name, time, fill, cast) {
    if (!cast) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    name.textContent = cast.name;
    time.textContent = `${Math.max(0, cast.remaining).toFixed(1)}s`;
    fill.style.width = `${Math.max(0, (1 - cast.remaining / cast.duration) * 100)}%`;
  }
}
