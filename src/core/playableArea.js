import { clamp } from './geometry.js';

function hitsZone(zone, x, y, radius) {
  if (!zone) return false;
  if (typeof zone.contains === 'function') return zone.contains(x, y, radius) === true;

  if (zone.type === 'circle') {
    const dx = x - zone.x;
    const dy = y - zone.y;
    return Math.hypot(dx, dy) <= (zone.radius ?? 0) + radius;
  }

  if (zone.type === 'rect') {
    const left = zone.x ?? 0;
    const top = zone.y ?? 0;
    const right = left + (zone.width ?? 0);
    const bottom = top + (zone.height ?? 0);
    return x + radius >= left && x - radius <= right && y + radius >= top && y - radius <= bottom;
  }

  return false;
}

export function isPositionPlayable(game, x, y, radius = 0) {
  const safeRadius = Math.max(0, radius);
  if (x - safeRadius < 0 || y - safeRadius < 0 || x + safeRadius > game.worldWidth || y + safeRadius > game.worldHeight) return false;

  for (const zone of game.unplayableZones ?? []) {
    if (hitsZone(zone, x, y, safeRadius)) return false;
  }
  return true;
}

export function findRandomPlayablePosition(game, { margin = 90, radius = 0, maxAttempts = 100 } = {}) {
  const safeMargin = Math.max(margin, radius);
  const minX = Math.min(safeMargin, game.worldWidth / 2);
  const maxX = Math.max(minX, game.worldWidth - safeMargin);
  const minY = Math.min(safeMargin, game.worldHeight / 2);
  const maxY = Math.max(minY, game.worldHeight - safeMargin);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const x = minX + Math.random() * Math.max(0, maxX - minX);
    const y = minY + Math.random() * Math.max(0, maxY - minY);
    if (isPositionPlayable(game, x, y, radius)) return { x, y };
  }

  const fallbackX = clamp(game.player?.x ?? game.worldWidth / 2, minX, maxX);
  const fallbackY = clamp(game.player?.y ?? game.worldHeight / 2, minY, maxY);
  if (isPositionPlayable(game, fallbackX, fallbackY, radius)) return { x: fallbackX, y: fallbackY };
  return { x: game.worldWidth / 2, y: game.worldHeight / 2 };
}
