type ScoreResult = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double';
type PuttResult = 'great' | 'standard' | 'bad' | 'very_bad';

const getScoreResult = (score: number, par: number): ScoreResult => {
  const diff = score - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  return 'double';
};

const getPuttResult = (putts: number, gir?: boolean): PuttResult => {
  if (putts <= 1) return 'great';
  if (putts === 2) return gir ? 'great' : 'standard';
  if (putts === 3) return 'bad';
  return 'very_bad';
};

export function getScoreColor(
  score: number,
  par: number,
  enabled: boolean = true
): string {
  if (!enabled) return '#FFFFFF';
  switch (getScoreResult(score, par)) {
    case 'eagle':
      return '#67E8F9';
    case 'birdie':
      return '#10B981';
    case 'par':
      return '#FFFFFF';
    case 'bogey':
      return '#F97316';
    case 'double':
      return '#EF4444';
    default:
      return '#FFFFFF';
  }
}

export function getScoreBackgroundColor(
  score: number,
  par: number,
  enabled: boolean = true
): string {
  if (!enabled) return 'transparent';
  switch (getScoreResult(score, par)) {
    case 'eagle':
      return 'rgba(103, 232, 249, 0.15)';
    case 'birdie':
      return 'rgba(16, 185, 129, 0.15)';
    case 'par':
      return 'transparent';
    case 'bogey':
      return 'transparent';
    case 'double':
      return 'rgba(239, 68, 68, 0.15)';
    default:
      return 'transparent';
  }
}

export function getPuttColor(
  putts: number,
  gir?: boolean,
  enabled: boolean = true
): string {
  if (!enabled) return '#FFFFFF';
  switch (getPuttResult(putts, gir)) {
    case 'great':
      return '#10B981';
    case 'standard':
      return '#FFFFFF';
    case 'bad':
      return '#F97316';
    case 'very_bad':
      return '#EF4444';
    default:
      return '#FFFFFF';
  }
}

export function getPuttBackgroundColor(
  putts: number,
  gir?: boolean,
  enabled: boolean = true
): string {
  if (!enabled) return 'transparent';
  switch (getPuttResult(putts, gir)) {
    case 'great':
      return 'rgba(16, 185, 129, 0.15)';
    case 'standard':
      return 'transparent';
    case 'bad':
      return 'transparent';
    case 'very_bad':
      return 'rgba(239, 68, 68, 0.15)';
    default:
      return 'transparent';
  }
}

