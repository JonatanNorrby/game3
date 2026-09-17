export class Camera {
  constructor({ viewportWidth, viewportHeight, worldWidth, worldHeight, zoom = 1 }) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.zoom = zoom;
    this.x = 0;
    this.y = 0;
  }

  resize(viewportWidth, viewportHeight) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }

  setWorld(worldWidth, worldHeight) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
  }

  setZoom(zoom) {
    this.zoom = Math.max(0.1, zoom || 1);
  }

  desiredPosition(target) {
    const visibleWorldWidth = this.viewportWidth / this.zoom;
    const visibleWorldHeight = this.viewportHeight / this.zoom;
    return {
      x: target.x - visibleWorldWidth / 2,
      y: target.y - visibleWorldHeight / 2,
    };
  }

  snapTo(target) {
    if (!target) return;
    const desired = this.desiredPosition(target);
    this.x = desired.x;
    this.y = desired.y;
  }

  update(_dt, target) {
    // Deliberately do not clamp to arena edges. The player stays centered even
    // when that means showing space beyond the edge of the encounter room.
    this.snapTo(target);
  }

  begin(ctx, shakeX = 0, shakeY = 0) {
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  end(ctx) {
    ctx.restore();
  }
}
