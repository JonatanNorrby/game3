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

  axisBounds(worldSize, viewportSize) {
    if (worldSize <= viewportSize) {
      const centered = -(viewportSize - worldSize) / 2;
      return { min: centered, max: centered };
    }
    return { min: 0, max: worldSize - viewportSize };
  }

  desiredPosition(target) {
    const xBounds = this.axisBounds(this.worldWidth, this.viewportWidth);
    const yBounds = this.axisBounds(this.worldHeight, this.viewportHeight);
    return {
      x: clamp(target.x - this.viewportWidth / 2, xBounds.min, xBounds.max),
      y: clamp(target.y - this.viewportHeight / 2, yBounds.min, yBounds.max),
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
    const xBounds = this.axisBounds(this.worldWidth, this.viewportWidth);
    const yBounds = this.axisBounds(this.worldHeight, this.viewportHeight);
    this.x = clamp(this.x, xBounds.min, xBounds.max);
    this.y = clamp(this.y, yBounds.min, yBounds.max);
  }

  begin(ctx, shakeX = 0, shakeY = 0) {
    ctx.save();
    ctx.translate(Math.round(-this.x + shakeX), Math.round(-this.y + shakeY));
  }

  end(ctx) {
    ctx.restore();
  }
}
