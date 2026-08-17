// Gen III's battle stat-stage ratios from pret/pokeemerald's gStatStageRatios
// and APPLY_STAT_MOD. The numerator/denominator form preserves the game's
// integer arithmetic instead of introducing floating-point display math.
export const GEN3_STAT_STAGE_RATIOS = Object.freeze([
  Object.freeze([10, 40]),
  Object.freeze([10, 35]),
  Object.freeze([10, 30]),
  Object.freeze([10, 25]),
  Object.freeze([10, 20]),
  Object.freeze([10, 15]),
  Object.freeze([10, 10]),
  Object.freeze([15, 10]),
  Object.freeze([20, 10]),
  Object.freeze([25, 10]),
  Object.freeze([30, 10]),
  Object.freeze([35, 10]),
  Object.freeze([40, 10]),
]);

export const BATTLE_STAT_KEYS = Object.freeze(["atk", "def", "spa", "spd", "spe"]);

export function calculateStageAdjustedStat(base, stage) {
  if (
    !Number.isInteger(base) ||
    base < 0 ||
    !Number.isInteger(stage) ||
    stage < -6 ||
    stage > 6
  ) {
    return null;
  }

  const [numerator, denominator] = GEN3_STAT_STAGE_RATIOS[stage + 6];
  return Math.trunc((base * numerator) / denominator);
}

export function deriveStageAdjustedStats(stats, statStages) {
  if (stats === null || typeof stats !== "object" || statStages === null || typeof statStages !== "object") {
    return null;
  }

  const adjusted = {};
  for (const key of BATTLE_STAT_KEYS) {
    const value = calculateStageAdjustedStat(stats[key], statStages[key]);
    if (value === null) return null;
    adjusted[key] = value;
  }
  return adjusted;
}
