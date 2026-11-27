function calculateVolumeXp(previousTotalMl, addedMl) {
  const previous = Number(previousTotalMl), added = Number(addedMl);
  if (!Number.isFinite(previous) || previous < 0 || !Number.isInteger(added) || added < 1) throw new RangeError("Invalid XP volume.");
  return Math.floor((previous + added) / 100) - Math.floor(previous / 100);
}
function getLevelProgress(totalXp) {
  const normalizedXp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let remaining = normalizedXp, level = 1, xpForNextLevel = 100;
  while (remaining >= xpForNextLevel) { remaining -= xpForNextLevel; level += 1; xpForNextLevel = 100 + (level - 1) * 50; }
  return { level, currentXp: remaining, xpForNextLevel, totalXp: normalizedXp };
}
module.exports = { calculateVolumeXp, getLevelProgress };
