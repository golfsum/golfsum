export function adjustYardageForTemp(baseYardage: number, tempF: number): number {
  const baseline = 70;
  const degreesOff = tempF - baseline;
  let adjustmentPercent = 0;

  if (degreesOff < 0) {
    adjustmentPercent = (degreesOff / 10) * 0.02;
  } else if (degreesOff > 0) {
    adjustmentPercent = (degreesOff / 10) * 0.008;
  }

  return Math.round(baseYardage * (1 + adjustmentPercent));
}

export function tempToClubAdjustment(baseYardage: number, tempF: number): number {
  const adjusted = adjustYardageForTemp(baseYardage, tempF);
  const yardageDiff = adjusted - baseYardage;
  const clubGap = 10;
  return Math.round(yardageDiff / clubGap);
}

export type TempCategory = 'FREEZING' | 'COLD' | 'COOL' | 'MILD' | 'WARM' | 'HOT';

export function getTempCategory(tempF: number): TempCategory {
  if (tempF < 35) return 'FREEZING';
  if (tempF <= 50) return 'COLD';
  if (tempF <= 64) return 'COOL';
  if (tempF <= 79) return 'MILD';
  if (tempF <= 89) return 'WARM';
  return 'HOT';
}

export function tempAdjustmentSummary(
  tempF: number
): { direction: 'shorter' | 'longer' | 'normal'; yardsLow: number; yardsHigh: number } {
  const category = getTempCategory(tempF);
  if (category === 'MILD') {
    return { direction: 'normal', yardsLow: 0, yardsHigh: 0 };
  }

  const adjusted = adjustYardageForTemp(150, tempF);
  const rawDiff = Math.abs(150 - adjusted);
  const yardsLow = Math.max(1, Math.round(rawDiff * 0.75));
  const yardsHigh = Math.round(rawDiff * 1.4);
  const direction = adjusted < 150 ? 'shorter' : 'longer';

  return { direction, yardsLow, yardsHigh };
}
