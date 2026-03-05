export interface LiveRead {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
  detail: string;
}

export interface LiveRoundStats {
  holesPlayed: number;
  score: number;
  toPar: number;
  putts: number | null;
  intelligenceReady: boolean;
  primaryRead: LiveRead | null;
  secondaryRead: LiveRead | null;
  projectedScore: number | null;
  projectedToPar: number | null;
}

export type LiveHoleInput = {
  number: number;
  par: number;
  score: number;
  putts?: number | null;
  greenHit?: string | boolean | null;
  fairwayHit?: string | boolean | null;
  approachDistance?: string | null;
  upDown?: boolean | null;
  greenSideBunker?: boolean;
};

export function calculateLiveRoundStats(
  holes: LiveHoleInput[],
  coursePar: number,
  historicalBaseline?: {
    avgGirRate: number;
    avgPuttsPerRound: number;
    avgFirRate: number;
  }
): LiveRoundStats {
  const played = holes.filter((h) => h.score > 0 && h.par > 0);
  if (played.length === 0) {
    return {
      holesPlayed: 0,
      score: 0,
      toPar: 0,
      putts: null,
      intelligenceReady: false,
      primaryRead: null,
      secondaryRead: null,
      projectedScore: null,
      projectedToPar: null,
    };
  }

  const score = played.reduce((sum, h) => sum + h.score, 0);
  const parSum = played.reduce((sum, h) => sum + h.par, 0);
  const toPar = score - parSum;
  const hasAnyPutt = played.some((h) => h.putts != null);
  const putts = hasAnyPutt ? played.reduce((sum, h) => sum + (h.putts ?? 0), 0) : null;

  const projectedScore = played.length >= 4 ? Math.round((score / played.length) * 18) : null;
  const projectedToPar = projectedScore != null && coursePar > 0 ? projectedScore - coursePar : null;

  if (played.length < 3) {
    return {
      holesPlayed: played.length,
      score,
      toPar,
      putts,
      intelligenceReady: false,
      primaryRead: null,
      secondaryRead: null,
      projectedScore,
      projectedToPar,
    };
  }

  const reads: LiveRead[] = [];

  const girHoles = played.filter((h) => h.greenHit !== null && h.greenHit !== undefined);
  if (girHoles.length >= 3) {
    const girHits = girHoles.filter((h) => h.greenHit === true).length;
    const girRate = girHits / girHoles.length;
    const baselineGir = historicalBaseline?.avgGirRate ?? 0.35;
    const girDiff = girRate - baselineGir;
    const shortMisses = girHoles.filter((h) => h.greenHit === 'short').length;
    const shortPct = girHoles.length > 0 ? Math.round((shortMisses / girHoles.length) * 100) : 0;

    reads.push({
      label: 'Approach',
      value:
        girDiff >= 0.05
          ? `+${(girDiff * girHoles.length).toFixed(0)} GIR vs baseline`
          : girDiff <= -0.05
            ? `${(girDiff * girHoles.length).toFixed(0)} GIR vs baseline`
            : 'On baseline',
      tone: girDiff >= 0.05 ? 'positive' : girDiff <= -0.1 ? 'negative' : 'neutral',
      detail: `${girHits} of ${girHoles.length} greens hit${shortMisses > 1 ? `, ${shortPct}% short` : ''}`,
    });
  }

  if (putts !== null && played.length >= 4) {
    const avgPuttsPerHole = putts / played.length;
    const baselinePuttsPerHole = (historicalBaseline?.avgPuttsPerRound ?? 33) / 18;
    const puttDiff = avgPuttsPerHole - baselinePuttsPerHole;
    const projectedPutts = Math.round(avgPuttsPerHole * 18);
    const threePuttHoles = played.filter((h) => (h.putts ?? 0) >= 3).length;

    reads.push({
      label: 'Putting',
      value:
        puttDiff <= -0.08
          ? `${Math.abs(puttDiff * 18).toFixed(1)} putts below baseline`
          : puttDiff >= 0.08
            ? `${(puttDiff * 18).toFixed(1)} putts above baseline`
            : 'On baseline',
      tone: puttDiff <= -0.08 ? 'positive' : puttDiff >= 0.1 ? 'negative' : 'neutral',
      detail: `${projectedPutts} projected · ${threePuttHoles} three-putt${threePuttHoles === 1 ? '' : 's'}`,
    });
  }

  const teeHoles = played.filter(
    (h) => h.par >= 4 && h.fairwayHit !== null && h.fairwayHit !== undefined
  );
  if (teeHoles.length >= 3) {
    const fwHits = teeHoles.filter((h) => h.fairwayHit === true).length;
    const fwRate = fwHits / teeHoles.length;
    const baselineFir = historicalBaseline?.avgFirRate ?? 0.45;
    const firDiff = fwRate - baselineFir;

    reads.push({
      label: 'Tee Shots',
      value:
        firDiff >= 0.1
          ? `${Math.round(fwRate * 100)}% fairways (above baseline)`
          : firDiff <= -0.1
            ? `${Math.round(fwRate * 100)}% fairways (below baseline)`
            : `${Math.round(fwRate * 100)}% fairways`,
      tone: firDiff >= 0.1 ? 'positive' : firDiff <= -0.12 ? 'negative' : 'neutral',
      detail: `${fwHits} of ${teeHoles.length} fairways`,
    });
  }

  const scramHoles = played.filter(
    (h) => h.greenHit !== true && h.greenHit !== null && h.greenHit !== undefined && h.upDown !== null
  );
  if (scramHoles.length >= 3) {
    const saves = scramHoles.filter((h) => h.upDown === true).length;
    const saveRate = saves / scramHoles.length;
    reads.push({
      label: 'Scrambling',
      value: `${Math.round(saveRate * 100)}% saves`,
      tone: saveRate >= 0.4 ? 'positive' : saveRate <= 0.2 ? 'negative' : 'neutral',
      detail: `${saves} of ${scramHoles.length} up and down`,
    });
  }

  const sorted = [
    ...reads.filter((r) => r.tone === 'negative'),
    ...reads.filter((r) => r.tone === 'positive'),
    ...reads.filter((r) => r.tone === 'neutral'),
  ];

  return {
    holesPlayed: played.length,
    score,
    toPar,
    putts,
    intelligenceReady: sorted.length > 0,
    primaryRead: sorted[0] ?? null,
    secondaryRead: sorted[1] ?? null,
    projectedScore,
    projectedToPar,
  };
}
