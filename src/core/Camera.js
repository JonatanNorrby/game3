import { clamp } from './geometry.js';

export class Camera {
  constructor({ viewportWidth, viewportHeight, worldWidth, worldHeight, followSharpness = 8 }) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.followSharpness = followSharpness;
    this.x = 0;
    this.y = 0;
  }

  resize(viewportWidth, viewportHeight) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.clampToWorld();
  }

  desiredPosition(target) {
    const maxX = Math.max(0, this.worldWidth - this.viewportWidth);
    const maxY = Math.max(0, this.worldHeight - this.viewportHeight);
    return {
      x: clamp(target.x - this.viewportWidth / 2, 0, maxX),
      y: clamp(target.y - this.viewportHeight / 2, 0, maxY),
    };
  }

  snapTo(target) {
    const desired = this.desiredPosition(target);
    this.x = desired.x;
    this.y = desired.y;
  }

  update(dt, target) {
    if (!target) return;
    const desired = this.desiredPosition(target);
    const blend = 1 - Math.exp(-this.followSharpness * dt);
    this.x += (desired.x - this.x) * blend;
    this.y += (desired.y - this.y) * blend;
    this.clampToWorld();
  }

  clampToWorld() {
    this.x = clamp(this.x, 0, Math.max(0, this.worldWidth - this.viewportWidth));
    this.y = clamp(this.y, 0, Math.max(0, this.worldHeight - this.viewportHeight));
  }

  begin(ctx, shakeX = 0, shakeY = 0) {
    ctx.save();
    ctx.translate(Math.round(-this.x + shakeX), Math.round(-this.y + shakeY));
  }

  end(ctx) {
    ctx.restore();
  }
}
