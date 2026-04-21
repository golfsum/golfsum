import { SavedRound } from '../types';

export interface FatigueAnalysis {
  byPosition: HolePositionStats[];
  closingNineWindow: WindowStats;
  openingNineWindow: WindowStats;
  middleNineWindow: WindowStats;
  fadePattern: FadePattern | null;
  primaryFinding: FatigueFinding | null;
  hasSufficientData: boolean;
}

export interface HolePositionStats {
  position: number;
  ninePosition: number;
  attempts: number;
  avgScoreToPar: number;
  bogeyPlusRate: number;
  doublePlusRate: number;
}

export interface WindowStats {
  label: string;
  positions: number[];
  attempts: number;
  avgScoreToPar: number;
  bogeyPlusRate: number;
}

export type FadePattern = 'LATE_FADE' | 'EARLY_STRUGGLE' | 'MIDDLE_FADE' | 'CLOSING_STRONG' | 'CONSISTENT';

export interface FatigueFinding {
  type: FadePattern | 'CONSISTENT';
  message: string;
  actionable: string;
  preRoundMessage: string;
}

const emptyWindow = (label: string, positions: number[]): WindowStats => ({
  label,
  positions,
  attempts: 0,
  avgScoreToPar: 0,
  bogeyPlusRate: 0,
});

const empty = (): FatigueAnalysis => ({
  byPosition: [],
  closingNineWindow: emptyWindow('Holes 7-9 of each nine', [7, 8, 9]),
  openingNineWindow: emptyWindow('Holes 1-3 of each nine', [1, 2, 3]),
  middleNineWindow: emptyWindow('Holes 4-6 of each nine', [4, 5, 6]),
  fadePattern: null,
  primaryFinding: null,
  hasSufficientData: false,
});

const detectFadePattern = (closing: WindowStats, opening: WindowStats, middle: WindowStats): FadePattern => {
  if (closing.avgScoreToPar > opening.avgScoreToPar + 0.15 && closing.avgScoreToPar > middle.avgScoreToPar + 0.10) {
    return 'LATE_FADE';
  }
  if (closing.avgScoreToPar < middle.avgScoreToPar - 0.15) return 'CLOSING_STRONG';
  if (opening.avgScoreToPar > closing.avgScoreToPar + 0.15 && opening.avgScoreToPar > middle.avgScoreToPar + 0.10) {
    return 'EARLY_STRUGGLE';
  }
  if (middle.avgScoreToPar > closing.avgScoreToPar + 0.15 && middle.avgScoreToPar > opening.avgScoreToPar + 0.10) {
    return 'MIDDLE_FADE';
  }
  return 'CONSISTENT';
};

const buildFinding = (pattern: FadePattern, closing: WindowStats, opening: WindowStats, middle: WindowStats): FatigueFinding | null => {
  if (pattern === 'CONSISTENT') return null;
  if (pattern === 'LATE_FADE') {
    return {
      type: 'LATE_FADE',
      message: `Closing holes run ${(closing.avgScoreToPar - middle.avgScoreToPar).toFixed(2)} strokes/hole higher than middle window.`,
      actionable: 'From holes 7 and 16 onward, switch to conservative targets and strict routine pace.',
      preRoundMessage: 'You fade late in each nine. Play conservative from hole 7 onward.',
    };
  }
  if (pattern === 'EARLY_STRUGGLE') {
    return {
      type: 'EARLY_STRUGGLE',
      message: `Opening holes run ${(opening.avgScoreToPar - middle.avgScoreToPar).toFixed(2)} strokes/hole higher than middle window.`,
      actionable: 'Warm up earlier and treat opening holes as rhythm holes with conservative lines.',
      preRoundMessage: 'You lose strokes early in each nine. Warm up and play safe targets on opening holes.',
    };
  }
  if (pattern === 'MIDDLE_FADE') {
    return {
      type: 'MIDDLE_FADE',
      message: 'Middle window (holes 4-6 / 13-15) is the weakest segment by score-to-par.',
      actionable: 'Set one process cue before each middle-window tee shot to avoid focus drop.',
      preRoundMessage: 'Your middle holes are the leak. Stay deliberate on holes 4-6 and 13-15.',
    };
  }
  return {
    type: 'CLOSING_STRONG',
    message: 'Closing holes are stronger than middle-window scoring in your rounds.',
    actionable: 'Transfer closing-hole focus to early holes.',
    preRoundMessage: 'You close well. Bring that urgency to the first holes.',
  };
};

export function analyzeFatigue(rounds: SavedRound[]): FatigueAnalysis {
  const completed = rounds.filter(r => (r.holes?.length ?? 0) >= 9);
  if (completed.length < 8) return empty();

  const allHoles = completed.flatMap(r => r.holes || []).filter(h => h.score > 0 && h.par > 0 && h.number >= 1 && h.number <= 18);
  if (allHoles.length < 90) return empty();

  const byPosition: HolePositionStats[] = [];
  for (let pos = 1; pos <= 18; pos += 1) {
    const hs = allHoles.filter(h => h.number === pos);
    if (hs.length < 4) continue;
    byPosition.push({
      position: pos,
      ninePosition: pos <= 9 ? pos : pos - 9,
      attempts: hs.length,
      avgScoreToPar: hs.reduce((s, h) => s + (h.score - h.par), 0) / hs.length,
      bogeyPlusRate: hs.filter(h => h.score > h.par).length / hs.length,
      doublePlusRate: hs.filter(h => h.score >= h.par + 2).length / hs.length,
    });
  }

  const makeWindow = (positions: number[], label: string): WindowStats => {
    const hs = allHoles.filter(h => {
      const np = h.number <= 9 ? h.number : h.number - 9;
      return positions.includes(np);
    });
    return {
      label,
      positions,
      attempts: hs.length,
      avgScoreToPar: hs.length ? hs.reduce((s, h) => s + (h.score - h.par), 0) / hs.length : 0,
      bogeyPlusRate: hs.length ? hs.filter(h => h.score > h.par).length / hs.length : 0,
    };
  };

  const closingNineWindow = makeWindow([7, 8, 9], 'Holes 7-9 of each nine');
  const openingNineWindow = makeWindow([1, 2, 3], 'Holes 1-3 of each nine');
  const middleNineWindow = makeWindow([4, 5, 6], 'Holes 4-6 of each nine');
  const fadePattern = detectFadePattern(closingNineWindow, openingNineWindow, middleNineWindow);
  const primaryFinding = buildFinding(fadePattern, closingNineWindow, openingNineWindow, middleNineWindow);

  return {
    byPosition,
    closingNineWindow,
    openingNineWindow,
    middleNineWindow,
    fadePattern,
    primaryFinding,
    hasSufficientData: true,
  };
}
