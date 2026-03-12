import type { SavedRound } from '../types';
import { buildRoundAnalysis } from './roundAnalysisService';

export interface RoundNudge {
  id: string;
  type: 'leave-distance' | 'tee-club' | 'wind' | 'lie' | 'hazard' | 'miss-side' | 'recovery' | 'putting';
  priority: number;
  tone: 'green' | 'amber' | 'red';
  title: string;
  body: string;
  support?: string | null;
}

export interface InRoundNudgeContext {
  bestDistanceBand: { label: string; count: number; avgDelta: number } | null;
  liePenalties: Record<string, { count: number; deltaVsFairway: number }>;
  clubShortBias: Record<string, { count: number; shortPct: number }>;
  saferTeeClub: { club: string; fairwayPct: number | null; avgDelta: number | null } | null;
  holeMemory: Record<number, {
    missSide: 'left' | 'right' | null;
    approachMiss: 'short' | 'left' | 'right' | null;
    approachBand: string | null;
    approachClub: string | null;
    saferTeeClub: string | null;
    sampleCount: number;
    approachSampleCount?: number;
    fairwayBunkerCount?: number;
    longFirstPuttCount?: number;
    longFirstPuttThreePuttCount?: number;
    toughestPin?: 'front' | 'middle' | 'back' | null;
  }>;
  putting: {
    avgPutts: number | null;
    longPuttThreePuttPct: number | null;
    pinPutts: Record<'front' | 'middle' | 'back', { count: number; avgPutts: number | null }>;
  };
}

export interface InRoundNudgeInput {
  holeNumber: number;
  holePar: number;
  liveLie: string | null;
  selectedClub?: string | null;
  suggestedClub?: string | null;
  centerYards: number | null;
  playingYards: number | null;
  tournamentMode?: boolean;
  weather?: { windMph?: number | null } | null;
  hazardCarries?: Array<{ label: string; actual: number; color?: string }>;
  currentRoundShots?: Array<{ num?: number; lie?: string | null }>;
  greenSummary?: {
    pinLocation?: 'front' | 'middle' | 'back' | null;
    firstPuttDistance?: number | null;
    putts?: number | null;
  } | null;
  context?: InRoundNudgeContext | null;
}

const BAND_ORDER = ['<75', '75-100', '100-125', '125-150', '150-175', '175-200', '200+'];

function getBandLabel(yards: number) {
  if (yards < 75) return '<75';
  if (yards <= 100) return '75-100';
  if (yards <= 125) return '100-125';
  if (yards <= 150) return '125-150';
  if (yards <= 175) return '150-175';
  if (yards <= 200) return '175-200';
  return '200+';
}

function normalizeClubLabel(club?: string | null) {
  return String(club || '').trim().toLowerCase();
}

function addWeightedAverage(
  current: { total: number; count: number } | undefined,
  value: number,
  weight: number,
) {
  return {
    total: (current?.total ?? 0) + (value * weight),
    count: (current?.count ?? 0) + weight,
  };
}

export function buildInRoundNudgeContext(rounds: SavedRound[]): InRoundNudgeContext {
  const distanceBands = new Map<string, { total: number; count: number }>();
  const liePenalties = new Map<string, { total: number; count: number }>();
  const clubShortBias = new Map<string, { total: number; count: number }>();
  const teeClubRows = new Map<string, { totalDelta: number; count: number; fairwayTotal: number; fairwayCount: number }>();
  const holeMemoryRows = new Map<number, {
    leftMisses: number;
    rightMisses: number;
    sampleCount: number;
    approachShortMisses: number;
    approachLeftMisses: number;
    approachRightMisses: number;
    approachSampleCount: number;
    approachBandRows: Map<string, number>;
    approachClubRows: Map<string, number>;
    fairwayBunkerCount: number;
    longFirstPuttCount: number;
    longFirstPuttThreePuttCount: number;
    pinRows: Map<'front' | 'middle' | 'back', { totalPutts: number; count: number }>;
    clubRows: Map<string, { totalDelta: number; count: number }>;
  }>();
  const pinPuttRows = new Map<'front' | 'middle' | 'back', { totalPutts: number; count: number }>();
  let totalPutts = 0;
  let totalPuttCount = 0;
  let longPuttThreePuttCount = 0;
  let longPuttTracked = 0;

  rounds
    .filter((round) => !round.isSample)
    .slice(0, 12)
    .forEach((round) => {
      const analysis = buildRoundAnalysis(round);

      analysis.distanceBandRows.forEach((row) => {
        if (row.avgDelta === null || row.count <= 0) return;
        distanceBands.set(row.label, addWeightedAverage(distanceBands.get(row.label), row.avgDelta, row.count));
      });

      analysis.lieImpactRows.forEach((row) => {
        if (row.label === 'Fairway' || row.deltaVsFairway === null || row.count <= 0) return;
        liePenalties.set(row.label, addWeightedAverage(liePenalties.get(row.label), row.deltaVsFairway, row.count));
      });

      analysis.clubMissRows.forEach((row) => {
        if (row.count <= 0) return;
        clubShortBias.set(
          row.clubLabel,
          addWeightedAverage(clubShortBias.get(row.clubLabel), row.shortPct, row.count),
        );
      });

      analysis.teeClubPerformanceRows.forEach((row) => {
        if (row.count <= 0 || row.avgDelta === null) return;
        const current = teeClubRows.get(row.clubLabel) ?? { totalDelta: 0, count: 0, fairwayTotal: 0, fairwayCount: 0 };
        teeClubRows.set(row.clubLabel, {
          totalDelta: current.totalDelta + (row.avgDelta * row.count),
          count: current.count + row.count,
          fairwayTotal: current.fairwayTotal + ((row.fairwayPct ?? 0) * row.count),
          fairwayCount: current.fairwayCount + row.count,
        });
      });

      analysis.holes.forEach((hole) => {
        const holeMemory = holeMemoryRows.get(hole.number) ?? {
          leftMisses: 0,
          rightMisses: 0,
          sampleCount: 0,
          approachShortMisses: 0,
          approachLeftMisses: 0,
          approachRightMisses: 0,
          approachSampleCount: 0,
          approachBandRows: new Map<string, number>(),
          approachClubRows: new Map<string, number>(),
          fairwayBunkerCount: 0,
          longFirstPuttCount: 0,
          longFirstPuttThreePuttCount: 0,
          pinRows: new Map<'front' | 'middle' | 'back', { totalPutts: number; count: number }>(),
          clubRows: new Map<string, { totalDelta: number; count: number }>(),
        };
        holeMemory.sampleCount += 1;
        if (hole.fairwayHit === 'left' || hole.fairwayHit === 'double-left') holeMemory.leftMisses += 1;
        if (hole.fairwayHit === 'right' || hole.fairwayHit === 'double-right') holeMemory.rightMisses += 1;
        if (hole.greenHit === 'short' || hole.greenHit === 'left' || hole.greenHit === 'right') {
          holeMemory.approachSampleCount += 1;
          if (hole.greenHit === 'short') holeMemory.approachShortMisses += 1;
          if (hole.greenHit === 'left') holeMemory.approachLeftMisses += 1;
          if (hole.greenHit === 'right') holeMemory.approachRightMisses += 1;
        } else if (hole.greenHit === true || hole.greenHit === 'long') {
          holeMemory.approachSampleCount += 1;
        }
        if (hole.fairwayBunker) holeMemory.fairwayBunkerCount += 1;
        if ((hole.firstPuttDistance ?? 0) >= 30) {
          holeMemory.longFirstPuttCount += 1;
          if ((hole.putts ?? 0) >= 3) holeMemory.longFirstPuttThreePuttCount += 1;
        }
        if (hole.pinLocation && typeof hole.putts === 'number') {
          const currentPin = holeMemory.pinRows.get(hole.pinLocation) ?? { totalPutts: 0, count: 0 };
          holeMemory.pinRows.set(hole.pinLocation, {
            totalPutts: currentPin.totalPutts + hole.putts,
            count: currentPin.count + 1,
          });
        }
        if (hole.teeClub) {
          const currentClub = holeMemory.clubRows.get(hole.teeClub) ?? { totalDelta: 0, count: 0 };
          holeMemory.clubRows.set(hole.teeClub, {
            totalDelta: currentClub.totalDelta + hole.delta,
            count: currentClub.count + 1,
          });
        }
        holeMemoryRows.set(hole.number, holeMemory);

        if (typeof hole.putts === 'number') {
          totalPutts += hole.putts;
          totalPuttCount += 1;
          if ((hole.firstPuttDistance ?? 0) >= 30) {
            longPuttTracked += 1;
            if (hole.putts >= 3) longPuttThreePuttCount += 1;
          }
        }
        if (hole.pinLocation && typeof hole.putts === 'number') {
          const current = pinPuttRows.get(hole.pinLocation) ?? { totalPutts: 0, count: 0 };
          pinPuttRows.set(hole.pinLocation, {
            totalPutts: current.totalPutts + hole.putts,
            count: current.count + 1,
          });
        }
      });

      analysis.shots.forEach((shot) => {
        if (!shot.isApproach || shot.isTeeShot) return;
        const targetYards = typeof shot.adj === 'number'
          ? shot.adj
          : typeof shot.dist === 'number'
            ? shot.dist
            : null;
        if (typeof targetYards !== 'number' || !Number.isFinite(targetYards)) return;
        const holeMemory = holeMemoryRows.get(shot.holeNumber);
        if (!holeMemory) return;
        const band = getBandLabel(targetYards);
        holeMemory.approachBandRows.set(band, (holeMemory.approachBandRows.get(band) ?? 0) + 1);
        if (shot.clubLabel) {
          holeMemory.approachClubRows.set(shot.clubLabel, (holeMemory.approachClubRows.get(shot.clubLabel) ?? 0) + 1);
        }
      });
    });

  const bestDistanceBand = BAND_ORDER
    .map((label) => {
      const value = distanceBands.get(label);
      if (!value || value.count < 6) return null;
      return {
        label,
        count: value.count,
        avgDelta: value.total / value.count,
      };
    })
    .filter((row): row is { label: string; count: number; avgDelta: number } => row !== null)
    .sort((a, b) => a.avgDelta - b.avgDelta)[0] ?? null;

  const saferTeeClub = [...teeClubRows.entries()]
    .map(([club, value]) => ({
      club,
      avgDelta: value.count ? value.totalDelta / value.count : null,
      fairwayPct: value.fairwayCount ? value.fairwayTotal / value.fairwayCount : null,
      count: value.count,
    }))
    .filter((row) => row.count >= 4 && row.avgDelta !== null)
    .sort((a, b) => (a.avgDelta ?? 99) - (b.avgDelta ?? 99))[0] ?? null;

  return {
    bestDistanceBand,
    liePenalties: Object.fromEntries(
      [...liePenalties.entries()].map(([label, value]) => [
        label,
        { count: value.count, deltaVsFairway: value.total / value.count },
      ]),
    ),
    clubShortBias: Object.fromEntries(
      [...clubShortBias.entries()].map(([club, value]) => [
        club,
        { count: value.count, shortPct: value.total / value.count },
      ]),
    ),
    saferTeeClub,
    holeMemory: Object.fromEntries(
      [...holeMemoryRows.entries()].map(([holeNumber, value]) => {
        const saferTeeClub = [...value.clubRows.entries()]
          .filter(([, clubRow]) => clubRow.count >= 2)
          .map(([club, clubRow]) => ({ club, avgDelta: clubRow.totalDelta / clubRow.count, count: clubRow.count }))
          .sort((a, b) => a.avgDelta - b.avgDelta)[0]?.club ?? null;
        const missSide = value.rightMisses >= 2 && value.rightMisses > value.leftMisses
          ? 'right'
          : value.leftMisses >= 2 && value.leftMisses > value.rightMisses
            ? 'left'
            : null;
        const approachMiss = value.approachSampleCount >= 2
          ? [
              { label: 'short' as const, count: value.approachShortMisses },
              { label: 'left' as const, count: value.approachLeftMisses },
              { label: 'right' as const, count: value.approachRightMisses },
            ]
              .sort((a, b) => b.count - a.count)[0]
          : null;
        const approachBand = [...value.approachBandRows.entries()]
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const approachClub = [...value.approachClubRows.entries()]
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const toughestPin = [...value.pinRows.entries()]
          .filter(([, pinRow]) => pinRow.count >= 2)
          .map(([pin, pinRow]) => ({ pin, avgPutts: pinRow.totalPutts / pinRow.count }))
          .sort((a, b) => b.avgPutts - a.avgPutts)[0]?.pin ?? null;
        return [holeNumber, {
          missSide,
          approachMiss: approachMiss && approachMiss.count >= 2 ? approachMiss.label : null,
          approachBand,
          approachClub,
          saferTeeClub,
          sampleCount: value.sampleCount,
          approachSampleCount: value.approachSampleCount,
          fairwayBunkerCount: value.fairwayBunkerCount,
          longFirstPuttCount: value.longFirstPuttCount,
          longFirstPuttThreePuttCount: value.longFirstPuttThreePuttCount,
          toughestPin,
        }];
      }),
    ),
    putting: {
      avgPutts: totalPuttCount ? totalPutts / totalPuttCount : null,
      longPuttThreePuttPct: longPuttTracked ? (longPuttThreePuttCount / longPuttTracked) * 100 : null,
      pinPutts: {
        front: pinPuttRows.get('front')
          ? { count: pinPuttRows.get('front')!.count, avgPutts: pinPuttRows.get('front')!.totalPutts / pinPuttRows.get('front')!.count }
          : { count: 0, avgPutts: null },
        middle: pinPuttRows.get('middle')
          ? { count: pinPuttRows.get('middle')!.count, avgPutts: pinPuttRows.get('middle')!.totalPutts / pinPuttRows.get('middle')!.count }
          : { count: 0, avgPutts: null },
        back: pinPuttRows.get('back')
          ? { count: pinPuttRows.get('back')!.count, avgPutts: pinPuttRows.get('back')!.totalPutts / pinPuttRows.get('back')!.count }
          : { count: 0, avgPutts: null },
      },
    },
  };
}

export function buildInRoundNudge(input: InRoundNudgeInput): RoundNudge | null {
  const {
    holePar,
    liveLie,
    selectedClub,
    suggestedClub,
    centerYards,
    playingYards,
    tournamentMode = false,
    weather,
    hazardCarries = [],
    currentRoundShots = [],
    greenSummary,
    context,
  } = input;

  const clubLabel = selectedClub || suggestedClub || null;
  const normalizedClub = normalizeClubLabel(clubLabel);

  if (liveLie === 'Green') {
    const holeMemory = context?.holeMemory[input.holeNumber] ?? null;
    if (
      holeMemory &&
      (holeMemory.longFirstPuttCount ?? 0) >= 2 &&
      (greenSummary?.firstPuttDistance ?? 0) >= 30 &&
      ((holeMemory.longFirstPuttThreePuttCount ?? 0) / Math.max(1, holeMemory.longFirstPuttCount ?? 0)) >= 0.5
    ) {
      return {
        id: `hole-memory-green-lag-${input.holeNumber}`,
        type: 'putting',
        priority: 85,
        tone: 'amber',
        title: 'Course note',
        body: 'This green has turned long first putts into trouble before. Prioritize speed and leave the next one inside 3 feet.',
        support: `${holeMemory.longFirstPuttThreePuttCount} of ${holeMemory.longFirstPuttCount} long putts became 3-putts here`,
      };
    }

    if (holeMemory?.toughestPin && greenSummary?.pinLocation === holeMemory.toughestPin) {
      const pinLabel = holeMemory.toughestPin === 'front' ? 'Front' : holeMemory.toughestPin === 'middle' ? 'Middle' : 'Back';
      return {
        id: `hole-memory-green-pin-${input.holeNumber}`,
        type: 'putting',
        priority: 84,
        tone: holeMemory.toughestPin === 'back' ? 'red' : 'amber',
        title: 'Course note',
        body: `${pinLabel} pins have been the toughest finish on this green. Favor pace first and accept the safe side.`,
        support: `Recurring pin-depth pattern on this hole`,
      };
    }

    const longPuttPct = context?.putting.longPuttThreePuttPct ?? null;
    if ((greenSummary?.firstPuttDistance ?? 0) >= 30 && longPuttPct !== null && longPuttPct >= 34) {
      return {
        id: `putting-lag-${input.holeNumber}`,
        type: 'putting',
        priority: 84,
        tone: 'amber',
        title: 'Lag putt pace',
        body: 'From this distance, speed matters more than line. Putt to a 3-foot circle.',
        support: `${Math.round(longPuttPct)}% of your 30+ ft putts become 3-putts`,
      };
    }

    const pin = greenSummary?.pinLocation ?? null;
    if (pin) {
      const pinRows = context?.putting.pinPutts;
      const currentPin = pinRows?.[pin];
      const bestPinAvg = pinRows
        ? Math.min(
          ...(['front', 'middle', 'back'] as const)
            .map((key) => pinRows[key].avgPutts)
            .filter((value): value is number => typeof value === 'number')
        )
        : null;
      if (
        currentPin &&
        currentPin.count >= 2 &&
        typeof currentPin.avgPutts === 'number' &&
        typeof bestPinAvg === 'number' &&
        currentPin.avgPutts - bestPinAvg >= 0.5
      ) {
        const pinLabel = pin === 'front' ? 'Front' : pin === 'middle' ? 'Middle' : 'Back';
        return {
          id: `putting-pin-${pin}-${input.holeNumber}`,
          type: 'putting',
          priority: 83,
          tone: pin === 'back' ? 'red' : 'amber',
          title: `${pinLabel} pin caution`,
          body: `${pinLabel} pins have been costing more putts. Favor safe pace and an uphill leave.`,
          support: `${pinLabel} pins average ${currentPin.avgPutts.toFixed(1)} putts in your recent rounds`,
        };
      }
    }
  }

  const holeMemory = context?.holeMemory[input.holeNumber] ?? null;
  if (liveLie === 'Tee Box' && holeMemory && holeMemory.sampleCount >= 2) {
    if ((holeMemory.fairwayBunkerCount ?? 0) >= 2 && (holeMemory.fairwayBunkerCount ?? 0) / holeMemory.sampleCount >= 0.5) {
      return {
        id: `hole-memory-bunker-${input.holeNumber}`,
        type: 'hazard',
        priority: 80,
        tone: 'amber',
        title: 'Course note',
        body: 'This hole has brought the fairway bunker into play often. Pick the club and line that take the bunker out first.',
        support: `${holeMemory.fairwayBunkerCount} bunker result${holeMemory.fairwayBunkerCount === 1 ? '' : 's'} over ${holeMemory.sampleCount} rounds`,
      };
    }
    if (holeMemory.saferTeeClub && normalizeClubLabel(holeMemory.saferTeeClub) !== normalizedClub) {
      return {
        id: `hole-memory-club-${input.holeNumber}`,
        type: 'tee-club',
        priority: 79,
        tone: 'green',
        title: 'Course note',
        body: `${holeMemory.saferTeeClub} has been your steadiest tee club on this hole. Good spot to choose position first.`,
        support: `Based on ${holeMemory.sampleCount} rounds on this hole`,
      };
    }
    if (holeMemory.missSide) {
      return {
        id: `hole-memory-miss-${input.holeNumber}`,
        type: 'miss-side',
        priority: 77,
        tone: 'amber',
        title: 'Course note',
        body: `This hole has punished misses ${holeMemory.missSide}. Favor the ${holeMemory.missSide === 'right' ? 'left-center' : 'right-center'} side from the tee.`,
        support: `Recurring pattern on this hole`,
      };
    }
  }

  if (
    liveLie &&
    liveLie !== 'Tee Box' &&
    liveLie !== 'Green' &&
    holeMemory &&
    (holeMemory.approachSampleCount ?? 0) >= 2 &&
    holeMemory.approachMiss
  ) {
    const targetYards = typeof playingYards === 'number'
      ? playingYards
      : typeof centerYards === 'number'
        ? centerYards
        : null;
    const targetBand = typeof targetYards === 'number' && Number.isFinite(targetYards)
      ? getBandLabel(targetYards)
      : null;
    const clubPrefix = holeMemory.approachClub && normalizeClubLabel(holeMemory.approachClub) === normalizedClub
      ? `${holeMemory.approachClub} from `
      : '';
    const support = holeMemory.approachBand && holeMemory.approachBand === targetBand
      ? `${holeMemory.approachBand} has been the trouble approach window on this hole`
      : 'Recurring approach pattern on this hole';
    if (holeMemory.approachMiss === 'short') {
      return {
        id: `hole-memory-approach-short-${input.holeNumber}`,
        type: 'leave-distance',
        priority: 81,
        tone: 'amber',
        title: 'Course note',
        body: holeMemory.approachBand && holeMemory.approachBand === targetBand
          ? `${clubPrefix}${holeMemory.approachBand} approaches on this hole have been finishing short. Favor enough club and the middle of the green.`
          : 'Approaches on this hole have been finishing short. Favor enough club and the middle of the green.',
        support,
      };
    }
    return {
      id: `hole-memory-approach-${holeMemory.approachMiss}-${input.holeNumber}`,
      type: 'miss-side',
      priority: 81,
      tone: 'amber',
      title: 'Course note',
      body: holeMemory.approachBand && holeMemory.approachBand === targetBand
        ? `${clubPrefix}${holeMemory.approachBand} approaches on this hole have been missing ${holeMemory.approachMiss}. Favor the ${holeMemory.approachMiss === 'left' ? 'right-center' : 'left-center'} side of the green.`
        : `Approaches on this hole have been missing ${holeMemory.approachMiss}. Favor the ${holeMemory.approachMiss === 'left' ? 'right-center' : 'left-center'} side of the green.`,
      support,
    };
  }

  if (liveLie === 'Trees' || liveLie === 'Water') {
    return {
      id: `recovery-${input.holeNumber}`,
      type: 'recovery',
      priority: 91,
      tone: 'red',
      title: 'Recovery first',
      body: 'Get back in play here. The hero shot usually costs more than the punch-out.',
      support: 'Trouble lie detected',
    };
  }

  if (liveLie === 'Fairway Bunker') {
    return {
      id: `lie-bunker-${input.holeNumber}`,
      type: 'lie',
      priority: 88,
      tone: 'red',
      title: 'Fairway bunker caution',
      body: 'Prioritize clean contact over full distance. Treat this as a scoring-risk lie.',
      support: 'Fairway bunker lie',
    };
  }

  if (liveLie && context?.liePenalties[liveLie]) {
    const penalty = context.liePenalties[liveLie];
    if (penalty.count >= 4 && penalty.deltaVsFairway >= 0.7) {
      return {
        id: `lie-${liveLie}-${input.holeNumber}`,
        type: 'lie',
        priority: 88,
        tone: penalty.deltaVsFairway >= 1.1 ? 'red' : 'amber',
        title: 'Lie penalty',
        body: `${liveLie} has been about ${penalty.deltaVsFairway.toFixed(1)} shots worse than fairway. Adjust club and target.`,
        support: 'Based on your recent scoring pattern',
      };
    }
  }

  if (!tournamentMode && (weather?.windMph ?? 0) >= 10 && normalizedClub && context?.clubShortBias[clubLabel || '']) {
    const bias = context.clubShortBias[clubLabel || ''];
    if (bias.count >= 5 && bias.shortPct >= 45) {
      return {
        id: `wind-${normalizedClub}-${input.holeNumber}`,
        type: 'wind',
        priority: 82,
        tone: 'amber',
        title: 'Wind adjustment',
        body: `${clubLabel} has been finishing short in wind. Take one more club and swing normally.`,
        support: `${Math.round(bias.shortPct)}% short miss rate in your recent data`,
      };
    }
  }

  const currentTeeMisses = currentRoundShots
    .filter((shot) => shot.num === 1)
    .map((shot) => shot.lie)
    .filter(Boolean);
  const leftMisses = currentTeeMisses.filter((lie) => lie === 'Left Rough').length;
  const rightMisses = currentTeeMisses.filter((lie) => lie === 'Right Rough').length;
  if (liveLie === 'Tee Box' && (leftMisses >= 2 || rightMisses >= 2) && leftMisses !== rightMisses) {
    const missSide = rightMisses > leftMisses ? 'right' : 'left';
    return {
      id: `miss-side-${missSide}-${input.holeNumber}`,
      type: 'miss-side',
      priority: 76,
      tone: 'amber',
      title: 'Miss pattern',
      body: `Your tee miss has been ${missSide}. Favor the ${missSide === 'right' ? 'left-center' : 'right-center'} target here.`,
      support: `Current round misses: L ${leftMisses} / R ${rightMisses}`,
    };
  }

  if (
    liveLie === 'Tee Box' &&
    holePar >= 4 &&
    context?.saferTeeClub &&
    context.saferTeeClub.club &&
    normalizeClubLabel(context.saferTeeClub.club) !== normalizedClub
  ) {
    return {
      id: `tee-club-${context.saferTeeClub.club}-${input.holeNumber}`,
      type: 'tee-club',
      priority: 78,
      tone: 'green',
      title: 'Safer tee club',
      body: `${context.saferTeeClub.club} has been your best scoring tee club recently. Good hole to use it.`,
      support: context.saferTeeClub.fairwayPct !== null
        ? `${Math.round(context.saferTeeClub.fairwayPct)}% fairways with better scoring`
        : 'Recent scoring pattern',
    };
  }

  const targetYards = typeof playingYards === 'number'
    ? playingYards
    : typeof centerYards === 'number'
      ? centerYards
      : null;
  if (context?.bestDistanceBand && typeof targetYards === 'number' && Number.isFinite(targetYards)) {
    const band = getBandLabel(targetYards);
    if (context.bestDistanceBand.count >= 6 && band !== context.bestDistanceBand.label && holePar >= 4) {
      return {
        id: `leave-distance-${context.bestDistanceBand.label}-${input.holeNumber}`,
        type: 'leave-distance',
        priority: 80,
        tone: 'green',
        title: 'Best leave number',
        body: `Your best scoring comes from ${context.bestDistanceBand.label}. Favor that leave if the hole gives you a choice.`,
        support: `Best recent scoring band`,
      };
    }
  }

  if (hazardCarries.length > 0 && typeof targetYards === 'number' && Number.isFinite(targetYards)) {
    const hazardInRange = hazardCarries.find((hazard) => Math.abs(hazard.actual - targetYards) <= 20);
    if (hazardInRange) {
      return {
        id: `hazard-${hazardInRange.label}-${input.holeNumber}`,
        type: 'hazard',
        priority: 90,
        tone: 'red',
        title: 'Carry risk',
        body: `${hazardInRange.label} is right on your number. Safer line or different club is worth considering.`,
        support: `${hazardInRange.actual}y to carry`,
      };
    }
  }

  return null;
}
