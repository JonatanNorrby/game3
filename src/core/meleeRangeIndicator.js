export function drawMeleeRangeIndicator(ctx, game, player, meleeRange) {
  if (!Number.isFinite(meleeRange) || meleeRange <= 0) return;
  const target = game.getCombatTarget?.() ?? game.boss ?? null;
  if (!target || target.alive === false || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;

  const distance = Math.hypot(player.x - target.x, player.y - target.y);
  const inRange = distance <= meleeRange;

  ctx.save();
  ctx.strokeStyle = inRange ? 'rgba(118, 232, 164, 0.72)' : 'rgba(210, 221, 245, 0.32)';
  ctx.lineWidth = inRange ? 3 : 2;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.arc(target.x, target.y, meleeRange, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
