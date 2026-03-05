import Storage from './storage';
import { SavedRound, Insight, InsightCategory, HandicapAffinityGroup } from '../types';
import { resolveHandicapTier, type HandicapTier } from '../utils/handicap';

const KEY = '@GolfSum:insightPreferences';

const LEGACY_KEYS = {
  FEEDBACK: '@GolfSum:insightFeedback',
  DISMISSED: '@GolfSum:insightDismissed',
};

export interface SuppressionRecord {
  insightId: string;
  suppressedAtRoundCount: number;
  suppressUntilRoundCount: number;
  permanent: boolean;
  baselineMetricValue: number | null;
  suppressionCount: number;
}

export interface RevisitEntry {
  insightId: string;
  queuedAtRoundCount: number;
  metricChangeDescription: string;
  shown: boolean;
}

export interface SeenHistoryEntry {
  insightId: string;
  roundCount: number;
}

export interface AffinityWeights {
  [category: string]: number;
}

export interface InsightPreferences {
  feedback: Record<string, 'up' | 'down'>;
  suppressed: Record<string, SuppressionRecord>;
  affinities: AffinityWeights;
  revisitQueue: RevisitEntry[];
  seenHistory: SeenHistoryEntry[];
}

export const defaultInsightPreferences: InsightPreferences = {
  feedback: {},
  suppressed: {},
  affinities: {},
  revisitQueue: [],
  seenHistory: [],
};

const safeParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const applyAffinityDecay = (affinities: AffinityWeights, roundsSinceLastPlay: number): AffinityWeights => {
  if (roundsSinceLastPlay <= 0) return affinities;
  const decayRate = 0.02 * roundsSinceLastPlay;
  const result: AffinityWeights = {};
  Object.entries(affinities).forEach(([category, weight]) => {
    if (weight > 1.0) result[category] = Math.max(1.0, weight - decayRate);
    else if (weight < 1.0) result[category] = Math.min(1.0, weight + decayRate);
    else result[category] = weight;
  });
  return result;
};

export const saveInsightPreferences = async (prefs: InsightPreferences): Promise<void> => {
  await Storage.setItem(KEY, JSON.stringify(prefs));
};

const migrateInsightPreferences = async (): Promise<InsightPreferences> => {
  const [feedbackRaw, dismissedRaw] = await Storage.multiGet([LEGACY_KEYS.FEEDBACK, LEGACY_KEYS.DISMISSED]);
  const existingFeedback = safeParse<Record<string, 'up' | 'down'>>(feedbackRaw[1], {});
  const dismissedIds = safeParse<string[]>(dismissedRaw[1], []);

  const suppressed: Record<string, SuppressionRecord> = {};
  dismissedIds.forEach(id => {
    suppressed[id] = {
      insightId: id,
      suppressedAtRoundCount: 0,
      suppressUntilRoundCount: 999,
      permanent: false,
      baselineMetricValue: null,
      suppressionCount: 1,
    };
  });

  Object.entries(existingFeedback).forEach(([id, vote]) => {
    if (vote === 'down' && !suppressed[id]) {
      suppressed[id] = {
        insightId: id,
        suppressedAtRoundCount: 0,
        suppressUntilRoundCount: 8,
        permanent: false,
        baselineMetricValue: null,
        suppressionCount: 1,
      };
    }
  });

  const prefs: InsightPreferences = {
    feedback: existingFeedback,
    suppressed,
    affinities: {},
    revisitQueue: [],
    seenHistory: [],
  };
  await saveInsightPreferences(prefs);
  return prefs;
};

export const loadInsightPreferences = async (): Promise<InsightPreferences> => {
  const raw = await Storage.getItem(KEY);
  if (!raw) return migrateInsightPreferences();
  const parsed = safeParse<InsightPreferences>(raw, defaultInsightPreferences);
  const lastSeenRound = parsed.seenHistory.length ? parsed.seenHistory[parsed.seenHistory.length - 1].roundCount : 0;
  return {
    ...parsed,
    affinities: applyAffinityDecay(parsed.affinities || {}, Math.max(0, 1)),
    seenHistory: parsed.seenHistory || [],
    revisitQueue: parsed.revisitQueue || [],
    suppressed: parsed.suppressed || {},
    feedback: parsed.feedback || {},
    // keep schema forward-compatible
    ...(lastSeenRound >= 0 ? {} : {}),
  };
};

const mean = (values: number[]): number => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

const getHandicapAffinityBoost = (affinity: HandicapAffinityGroup, tier: HandicapTier): number => {
  const table: Record<HandicapAffinityGroup, Record<HandicapTier, number>> = {
    ALL: { SCRATCH: 1.0, LOW: 1.0, MID: 1.0, HIGH: 1.0, BEGINNER: 1.0 },
    COMPETITIVE: { SCRATCH: 1.5, LOW: 1.3, MID: 0.8, HIGH: 0.5, BEGINNER: 0.3 },
    DEVELOPING: { SCRATCH: 0.8, LOW: 1.2, MID: 1.4, HIGH: 1.0, BEGINNER: 0.7 },
    IMPROVING: { SCRATCH: 0.5, LOW: 0.8, MID: 1.2, HIGH: 1.5, BEGINNER: 1.2 },
    BEGINNER: { SCRATCH: 0.2, LOW: 0.5, MID: 0.8, HIGH: 1.2, BEGINNER: 1.8 },
  };
  return table[affinity]?.[tier] ?? 1.0;
};

const inferInsightMeta = (insight: Insight): { category: InsightCategory; handicapAffinity: HandicapAffinityGroup } => {
  if (insight.category && insight.handicapAffinity) {
    return { category: insight.category, handicapAffinity: insight.handicapAffinity };
  }
  const id = String(insight.id || '').toLowerCase();
  if (id.includes('penalty')) return { category: InsightCategory.PENALTY, handicapAffinity: HandicapAffinityGroup.ALL };
  if (id.includes('three-putt') || id.includes('putting')) return { category: InsightCategory.PUTTING, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  if (id.includes('scrambling') || id.includes('bunker') || id.includes('up-down')) return { category: InsightCategory.SHORT_GAME, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  if (id.includes('weather') || id.includes('wind')) return { category: InsightCategory.WEATHER, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  if (id.includes('milestone') || id.includes('unlock')) return { category: InsightCategory.MILESTONE, handicapAffinity: HandicapAffinityGroup.ALL };
  if (id.includes('par3') || id.includes('par4') || id.includes('par5') || id.includes('score')) return { category: InsightCategory.SCORING, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  if (id.includes('approach-distance') || id.includes('chain') || id.includes('club-breakdown')) return { category: InsightCategory.ADVANCED_STATS, handicapAffinity: HandicapAffinityGroup.COMPETITIVE };
  if (id.includes('course')) return { category: InsightCategory.COURSE_MGMT, handicapAffinity: HandicapAffinityGroup.ALL };
  if (id.includes('miss') || id.includes('overcorrection') || id.includes('volatility')) return { category: InsightCategory.MISS_PATTERN, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
  return { category: InsightCategory.MENTAL, handicapAffinity: HandicapAffinityGroup.DEVELOPING };
};

export const scoreInsight = (
  insight: Insight,
  prefs: InsightPreferences,
  userHandicap: number | null,
  currentRoundCount: number,
  lastShownRoundCount: number | null
): number => {
  const suppression = prefs.suppressed[insight.id];
  if (suppression?.permanent) return -Infinity;
  if (suppression && currentRoundCount < suppression.suppressUntilRoundCount) return -Infinity;
  const revisit = prefs.revisitQueue.find(r => r.insightId === insight.id && r.shown);
  if (revisit) return -Infinity;

  let score = 100 - insight.priority;
  const { category, handicapAffinity } = inferInsightMeta(insight);
  const tier = resolveHandicapTier(userHandicap);
  score *= getHandicapAffinityBoost(handicapAffinity, tier);
  score *= prefs.affinities[category] ?? 1.0;

  if (lastShownRoundCount !== null) {
    const roundsAgo = currentRoundCount - lastShownRoundCount;
    if (roundsAgo === 0) return -Infinity;
    if (roundsAgo === 1) score *= 0.1;
    else if (roundsAgo === 2) score *= 0.4;
    else if (roundsAgo === 3) score *= 0.7;
  }

  if (prefs.revisitQueue.some(r => r.insightId === insight.id && !r.shown)) score *= 3.0;
  return score;
};

export const recordFeedback = async (
  prefs: InsightPreferences,
  insightId: string,
  value: 'up' | 'down',
  category: InsightCategory,
  currentRoundCount: number,
  baselineMetricValue: number | null
): Promise<InsightPreferences> => {
  const updated: InsightPreferences = {
    ...prefs,
    feedback: { ...prefs.feedback, [insightId]: value },
    affinities: { ...prefs.affinities },
    suppressed: { ...prefs.suppressed },
    revisitQueue: [...prefs.revisitQueue],
    seenHistory: [...prefs.seenHistory],
  };

  if (value === 'up') {
    const current = updated.affinities[category] ?? 1.0;
    updated.affinities[category] = Math.min(1.5, current + 0.15);
    if (updated.suppressed[insightId] && !updated.suppressed[insightId].permanent) {
      delete updated.suppressed[insightId];
    }
  } else {
    const current = updated.affinities[category] ?? 1.0;
    updated.affinities[category] = Math.max(0.4, current - 0.2);

    const existing = updated.suppressed[insightId];
    if (existing?.suppressionCount >= 1) {
      updated.suppressed[insightId] = {
        ...existing,
        permanent: true,
        suppressionCount: existing.suppressionCount + 1,
      };
    } else {
      updated.suppressed[insightId] = {
        insightId,
        suppressedAtRoundCount: currentRoundCount,
        suppressUntilRoundCount: currentRoundCount + 8,
        permanent: false,
        baselineMetricValue,
        suppressionCount: (existing?.suppressionCount ?? 0) + 1,
      };
    }
    updated.revisitQueue = updated.revisitQueue.filter(r => r.insightId !== insightId);
  }

  await saveInsightPreferences(updated);
  return updated;
};

type MetricChange = { isSignificant: boolean; description: string };

const getMetricChangeForInsight = (insightId: string, rounds: SavedRound[], baselineMetricValue: number | null): MetricChange | null => {
  if (baselineMetricValue == null) return null;
  const id = insightId.toLowerCase();
  if (!rounds.length) return null;
  const totalRounds = Math.max(1, rounds.length);

  if (id.includes('three-putt')) {
    const holes = rounds.flatMap(r => r.holes ?? []);
    const current = holes.filter(h => (h.putts ?? 0) >= 3).length / totalRounds;
    const improvement = baselineMetricValue - current;
    return {
      isSignificant: improvement >= 1.0,
      description: `Three-putts changed from ${baselineMetricValue.toFixed(1)} to ${current.toFixed(1)}/round`,
    };
  }
  if (id.includes('penalty')) {
    const current = rounds.reduce((s, r) => s + (r.penalties ?? 0), 0) / totalRounds;
    const improvement = baselineMetricValue - current;
    return {
      isSignificant: improvement >= 1.5,
      description: `Penalties changed from ${baselineMetricValue.toFixed(1)} to ${current.toFixed(1)}/round`,
    };
  }
  if (id.includes('fairways-missed-right') || id.includes('fairways-missed-left') || id.includes('miss')) {
    const holes = rounds.flatMap(r => r.holes ?? []).filter(h => h.par >= 4 && (h.fairwayHit === 'left' || h.fairwayHit === 'right'));
    if (!holes.length) return null;
    const right = holes.filter(h => h.fairwayHit === 'right').length;
    const left = holes.filter(h => h.fairwayHit === 'left').length;
    const current = Math.max(right, left) / (right + left);
    return {
      isSignificant: Math.abs(current - baselineMetricValue) >= 0.15,
      description: `Dominant miss share changed from ${(baselineMetricValue * 100).toFixed(0)}% to ${(current * 100).toFixed(0)}%`,
    };
  }
  if (id.includes('scrambling') || id.includes('up-and-down') || id.includes('scramble')) {
    const attempts = rounds.reduce((s, r) => s + (r.stats?.upDownAttempts ?? 0), 0);
    const made = rounds.reduce((s, r) => s + (r.stats?.upDownMade ?? 0), 0);
    if (!attempts) return null;
    const current = made / attempts;
    return {
      isSignificant: current - baselineMetricValue >= 0.10,
      description: `Up/down rate changed from ${(baselineMetricValue * 100).toFixed(0)}% to ${(current * 100).toFixed(0)}%`,
    };
  }
  if (id.includes('bunker')) {
    const bunker = rounds.flatMap(r => r.holes ?? []).filter(h => h.fairwayBunker || h.greenSideBunker);
    const non = rounds.flatMap(r => r.holes ?? []).filter(h => !h.fairwayBunker && !h.greenSideBunker);
    if (!bunker.length || !non.length) return null;
    const current = mean(bunker.map(h => h.score - h.par)) - mean(non.map(h => h.score - h.par));
    return {
      isSignificant: baselineMetricValue - current >= 0.8,
      description: `Bunker scoring delta changed from ${baselineMetricValue.toFixed(2)} to ${current.toFixed(2)}`,
    };
  }
  if (id.includes('par3')) {
    const par3 = rounds.flatMap(r => r.holes ?? []).filter(h => h.par === 3);
    if (!par3.length) return null;
    const current = mean(par3.map(h => h.score - h.par));
    return {
      isSignificant: baselineMetricValue - current >= 0.4,
      description: `Par-3 scoring changed from ${baselineMetricValue.toFixed(2)} to ${current.toFixed(2)} vs par`,
    };
  }
  if (id.includes('par5')) {
    const par5 = rounds.flatMap(r => r.holes ?? []).filter(h => h.par === 5);
    if (!par5.length) return null;
    const current = mean(par5.map(h => h.score - h.par));
    return {
      isSignificant: baselineMetricValue - current >= 0.5,
      description: `Par-5 scoring changed from ${baselineMetricValue.toFixed(2)} to ${current.toFixed(2)} vs par`,
    };
  }
  if (id.includes('back-nine')) {
    const diffs = rounds.map(r => {
      const front = (r.holes ?? []).filter(h => h.number <= 9);
      const back = (r.holes ?? []).filter(h => h.number > 9);
      if (front.length < 8 || back.length < 8) return null;
      return mean(back.map(h => h.score - h.par)) - mean(front.map(h => h.score - h.par));
    }).filter((v): v is number => v != null);
    if (!diffs.length) return null;
    const current = mean(diffs);
    return {
      isSignificant: baselineMetricValue - current >= 2.0,
      description: `Back/front gap changed from ${baselineMetricValue.toFixed(2)} to ${current.toFixed(2)}`,
    };
  }
  if (id.includes('bounce-back')) {
    const chainRates = rounds.map(r => {
      const holes = [...(r.holes ?? [])].sort((a, b) => a.number - b.number);
      let bogeys = 0;
      let chains = 0;
      for (let i = 0; i < holes.length; i += 1) {
        if (holes[i].score >= holes[i].par + 1) {
          bogeys += 1;
          if (holes[i + 1] && holes[i + 1].score >= holes[i + 1].par + 1) chains += 1;
        }
      }
      return bogeys ? chains / bogeys : null;
    }).filter((v): v is number => v != null);
    if (!chainRates.length) return null;
    const current = mean(chainRates);
    return {
      isSignificant: baselineMetricValue - current >= 0.15,
      description: `Bogey-chain rate changed from ${(baselineMetricValue * 100).toFixed(0)}% to ${(current * 100).toFixed(0)}%`,
    };
  }
  return null;
};

export const checkForRevisits = async (
  prefs: InsightPreferences,
  allInsights: Insight[],
  rounds: SavedRound[],
  currentRoundCount: number
): Promise<InsightPreferences> => {
  void allInsights;
  const updated: InsightPreferences = { ...prefs, revisitQueue: [...prefs.revisitQueue] };
  const sorted = [...rounds].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  Object.entries(updated.suppressed).forEach(([insightId, suppression]) => {
    if (suppression.permanent) return;
    if (currentRoundCount < suppression.suppressUntilRoundCount) return;
    if (updated.revisitQueue.some(r => r.insightId === insightId)) return;
    const change = getMetricChangeForInsight(insightId, sorted, suppression.baselineMetricValue);
    if (change && change.isSignificant) {
      updated.revisitQueue.push({
        insightId,
        queuedAtRoundCount: currentRoundCount,
        metricChangeDescription: change.description,
        shown: false,
      });
    }
  });

  if (updated.revisitQueue.length !== prefs.revisitQueue.length) {
    await saveInsightPreferences(updated);
  }
  return updated;
};

export const enforceMinimumActiveInsights = (
  candidates: Insight[],
  prefs: InsightPreferences,
  currentRoundCount: number,
  minimumRequired: number = 5
): Insight[] => {
  const hardFiltered = candidates.filter(insight => {
    const suppression = prefs.suppressed[insight.id];
    if (suppression?.permanent) return false;
    if (suppression && currentRoundCount < suppression.suppressUntilRoundCount) return false;
    return true;
  });
  if (hardFiltered.length >= minimumRequired) return hardFiltered;

  const liftable = candidates
    .filter(i => {
      const s = prefs.suppressed[i.id];
      return s && !s.permanent && !hardFiltered.some(h => h.id === i.id);
    })
    .sort((a, b) =>
      (prefs.suppressed[a.id]?.suppressedAtRoundCount ?? 0) -
      (prefs.suppressed[b.id]?.suppressedAtRoundCount ?? 0)
    );

  const result = [...hardFiltered];
  for (const insight of liftable) {
    if (result.length >= minimumRequired) break;
    result.push(insight);
  }
  return result;
};

export const getBaselineMetricForInsight = (insightId: string, rounds: SavedRound[]): number | null => {
  const sorted = [...rounds].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  if (insightId.includes('three-putt')) {
    const holes = sorted.flatMap(r => r.holes ?? []);
    const threePutts = holes.filter(h => h.putts != null && h.putts >= 3).length;
    return threePutts / Math.max(1, sorted.length);
  }
  if (insightId.includes('penalty')) {
    const total = sorted.reduce((sum, r) => sum + (r.penalties ?? 0), 0);
    return total / Math.max(1, sorted.length);
  }
  if (insightId.includes('fairways-missed-right') || insightId.includes('fairways-missed-left')) {
    const holes = sorted.flatMap(r => r.holes ?? []).filter(h => h.par >= 4 && h.fairwayHit != null);
    const rightMisses = holes.filter(h => h.fairwayHit === 'right').length;
    const leftMisses = holes.filter(h => h.fairwayHit === 'left').length;
    const total = rightMisses + leftMisses;
    if (total === 0) return null;
    return Math.max(rightMisses, leftMisses) / total;
  }
  if (insightId.includes('scrambling') || insightId.includes('up-and-down')) {
    const attempts = sorted.reduce((sum, r) => sum + (r.stats?.upDownAttempts ?? 0), 0);
    const made = sorted.reduce((sum, r) => sum + (r.stats?.upDownMade ?? 0), 0);
    return attempts > 0 ? made / attempts : null;
  }
  if (insightId.includes('bunker')) {
    const bunkerHoles = sorted.flatMap(r => r.holes ?? []).filter(h => h.fairwayBunker || h.greenSideBunker);
    const nonBunkerHoles = sorted.flatMap(r => r.holes ?? []).filter(h => !h.fairwayBunker && !h.greenSideBunker);
    if (!bunkerHoles.length || !nonBunkerHoles.length) return null;
    const bunkerAvg = mean(bunkerHoles.map(h => h.score - h.par));
    const nonBunkerAvg = mean(nonBunkerHoles.map(h => h.score - h.par));
    return bunkerAvg - nonBunkerAvg;
  }
  if (insightId.includes('par3')) {
    const par3s = sorted.flatMap(r => r.holes ?? []).filter(h => h.par === 3);
    if (!par3s.length) return null;
    return mean(par3s.map(h => h.score - h.par));
  }
  if (insightId.includes('par5')) {
    const par5s = sorted.flatMap(r => r.holes ?? []).filter(h => h.par === 5);
    if (!par5s.length) return null;
    return mean(par5s.map(h => h.score - h.par));
  }
  return null;
};

