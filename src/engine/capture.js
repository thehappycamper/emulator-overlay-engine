const statusBonus = {
  none: 1,
  burn: 1.5,
  poison: 1.5,
  paralysis: 1.5,
  sleep: 2,
  freeze: 2
};

export function calculateCaptureChance({ pokemon, ballModifier = 1, catchRate, status = "none" }) {
  if (!pokemon) {
    throw new Error("pokemon is required");
  }

  const rate = catchRate ?? pokemon.catchRate;
  if (!rate) {
    return null;
  }

  const hpFactor = Math.max(1, (3 * pokemon.maxHp - 2 * pokemon.currentHp));
  const modifiedRate = Math.floor((hpFactor * rate * ballModifier) / (3 * pokemon.maxHp));
  const adjustedRate = Math.min(255, Math.floor(modifiedRate * (statusBonus[status] ?? 1)));

  if (adjustedRate >= 255) {
    return 1;
  }

  const shakeThreshold = 1048560 / Math.sqrt(Math.sqrt(16711680 / adjustedRate));
  return Math.pow(shakeThreshold / 65536, 4);
}

export function calculateBagBallChances({ pokemon, balls, catchRate, status }) {
  return balls.map((ball) => ({
    id: ball.id,
    name: ball.name,
    quantity: ball.quantity,
    chance: calculateCaptureChance({
      pokemon,
      ballModifier: ball.modifier ?? 1,
      catchRate,
      status
    })
  }));
}
