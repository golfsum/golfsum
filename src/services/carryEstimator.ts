const ROLL_PERCENTAGE: Record<string, number> = {
  driver: 0.13,
  '3 wood': 0.12,
  '4 wood': 0.11,
  '5 wood': 0.11,
  '7 wood': 0.1,
  '2 hybrid': 0.1,
  '3 hybrid': 0.1,
  '4 hybrid': 0.1,
  '3 iron': 0.09,
  '4 iron': 0.09,
  '5 iron': 0.08,
  '6 iron': 0.08,
  '7 iron': 0.08,
  '8 iron': 0.07,
  '9 iron': 0.06,
  pw: 0.05,
  aw: 0.04,
  gw: 0.04,
  sw: 0.03,
  lw: 0.02,
};

export function estimateCarry(totalYards: number, clubKey?: string | null): number {
  const key = String(clubKey || '').trim().toLowerCase();
  const rollPct = ROLL_PERCENTAGE[key] ?? 0.07;
  return Math.round(totalYards * (1 - rollPct));
}
