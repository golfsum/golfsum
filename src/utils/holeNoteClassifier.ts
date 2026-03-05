const GOLF_KEYWORDS = [
  'driver', 'wood', 'iron', 'hybrid', 'wedge', 'pw', 'sw', 'lw', 'gw',
  'bump', 'chip', 'pitch', 'punch', 'draw', 'fade', 'cut', 'hook', 'slice',
  'bunker', 'sand', 'water', 'hazard', 'rough', 'fairway', 'green',
  'pin', 'flag', 'front', 'back', 'left', 'right', 'short', 'long', 'bail',
  'tree', 'trees', 'dogleg', 'uphill', 'downhill', 'elevated', 'blind',
  'lake', 'pond', 'creek', 'carry', 'layup', 'aim',
  'birdie', 'bogey', 'par', 'eagle', 'double',
];

const NON_GOLF_PATTERNS = [
  /slow.*(group|play|pace)/i,
  /weather/i,
  /friend|buddy|partner|playing with/i,
  /food|drink|beer|lunch|snack/i,
  /phone|call|text/i,
  /work|meeting|boss/i,
];

export function isGolfNote(text: string): boolean {
  if (!text || text.length < 5) return false;

  if (NON_GOLF_PATTERNS.some((pattern) => pattern.test(text))) return false;

  const lower = text.toLowerCase();
  const hasGolfKeyword = GOLF_KEYWORDS.some((keyword) => lower.includes(keyword));
  if (hasGolfKeyword) return true;

  if (/\b\d{2,3}\s*(yds?|yards?)\b/i.test(text)) return true;
  if (/\b(club|shot|aim|target)\b/i.test(text)) return true;

  return false;
}

export function formatAsCaddieTip(text: string, _holeNumber: number): string {
  return text
    .replace(/\bi\b/gi, 'you')
    .replace(/\bmy\b/gi, 'your')
    .replace(/\bme\b/gi, 'you')
    .replace(/\bi('ve|'m|'d)\b/gi, (_match, suffix: string) => {
      if (suffix === "'ve") return "you've";
      if (suffix === "'m") return "you're";
      if (suffix === "'d") return "you'd";
      return 'you';
    })
    .trim();
}
