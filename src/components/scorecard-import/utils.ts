import type { BackendScorecardResponse } from '../../services/scorecardOcrService';
import type { EditableTeeBox, LockedFields, LockedTeeFields, ParsedScorecardData } from './types';

export const buildDefaultArray = (): string[] => Array.from({ length: 18 }, () => '');
export const buildLockedArray = (): boolean[] => Array.from({ length: 18 }, () => false);

export const splitNameCandidates = (raw: string): string[] => {
  if (!raw) return [];
  const normalized = raw
    .replace(/\s+and\s+/gi, ',')
    .replace(/[\/&]+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const candidates = normalized
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length >= 2);
  return Array.from(new Set(candidates));
};

export const buildDefaultTeeBox = (name: string): EditableTeeBox => ({
  id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  name,
  ratingMen: '',
  slopeMen: '',
  ratingWomen: '',
  slopeWomen: '',
  yardages: buildDefaultArray(),
});

export const buildLockedTeeFields = (): LockedTeeFields => ({
  name: false,
  ratingMen: false,
  slopeMen: false,
  ratingWomen: false,
  slopeWomen: false,
  yardages: buildLockedArray(),
});

export const buildDefaultLockedFields = (): LockedFields => ({
  courseName: false,
  city: false,
  state: false,
  country: false,
  pars: buildLockedArray(),
  hcpMen: buildLockedArray(),
  hcpWomen: buildLockedArray(),
  playerName: false,
  playerDate: false,
  scores: buildLockedArray(),
  putts: buildLockedArray(),
  penalties: buildLockedArray(),
  fairways: buildLockedArray(),
  greens: buildLockedArray(),
  upDowns: buildLockedArray(),
  tees: {},
});

export const formatDateLocal = (selected: Date) => {
  const year = selected.getFullYear();
  const month = `${selected.getMonth() + 1}`.padStart(2, '0');
  const day = `${selected.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeImportedDate = (value?: string | null): string | null => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashDash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed);
  if (slashDash) {
    const month = Number(slashDash[1]);
    const day = Number(slashDash[2]);
    const yearRaw = Number(slashDash[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      if (!Number.isNaN(d.getTime())) return formatDateLocal(d);
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateLocal(parsed);
};

export const buildParsedFromBackend = (response: BackendScorecardResponse): ParsedScorecardData => {
  const holes = [...(response.holes || [])].sort((a, b) => a.hole - b.hole);
  const par = holes.map(hole => hole.par ?? 0);
  const handicapMen = holes.map(hole => hole.handicap_men ?? 0);
  const handicapWomen = holes.map(hole => hole.handicap_women ?? 0);

  const yardageByTee: Record<string, number[]> = {};
  holes.forEach((hole) => {
    const yardages = hole.yardages_by_tee || {};
    Object.entries(yardages).forEach(([teeName, value]) => {
      if (!yardageByTee[teeName]) {
        yardageByTee[teeName] = Array.from({ length: 18 }, () => 0);
      }
      const index = hole.hole - 1;
      if (index >= 0 && index < 18) {
        yardageByTee[teeName][index] = value ?? 0;
      }
    });
  });

  const teeNames = response.metadata?.tee_boxes?.length
    ? response.metadata?.tee_boxes
    : Object.keys(yardageByTee);

  const playerHoles = response.player?.holes || [];
  const playerScores = Array.from({ length: 18 }, (_, idx) => {
    const entry = playerHoles.find(h => h.hole === idx + 1);
    return entry?.score ?? 0;
  });
  const playerPutts = Array.from({ length: 18 }, (_, idx) => {
    const entry = playerHoles.find(h => h.hole === idx + 1);
    return entry?.putts ?? 0;
  });
  const playerFairways = Array.from({ length: 18 }, (_, idx) => {
    const entry = playerHoles.find(h => h.hole === idx + 1);
    return entry?.fairway ?? null;
  });
  const playerGreens = Array.from({ length: 18 }, (_, idx) => {
    const entry = playerHoles.find(h => h.hole === idx + 1);
    return entry?.green ?? null;
  });
  const playerUpDowns = Array.from({ length: 18 }, (_, idx) => {
    const entry = playerHoles.find(h => h.hole === idx + 1);
    return entry?.up_down ?? null;
  });
  const playerPenalties = Array.from({ length: 18 }, (_, idx) => {
    const entry = playerHoles.find(h => h.hole === idx + 1);
    return entry?.penalties ?? 0;
  });

  const nonZeroScoreIndices = playerScores
    .map((value, index) => (value > 0 ? index : -1))
    .filter(index => index >= 0);
  const scoresLookLikeHandicap = (() => {
    if (nonZeroScoreIndices.length < 6) return false;

    const values = nonZeroScoreIndices.map(index => playerScores[index]);
    const allInHandicapRange = values.every(value => value >= 1 && value <= 18);
    if (!allInHandicapRange) return false;

    const matchesFor = (candidate: number[]) => {
      const comparable = nonZeroScoreIndices.filter(index => (candidate[index] ?? 0) > 0);
      if (comparable.length < 6) return 0;
      const matches = comparable.filter(index => playerScores[index] === candidate[index]).length;
      return matches / comparable.length;
    };

    const menMatchRatio = matchesFor(handicapMen);
    const womenMatchRatio = matchesFor(handicapWomen);
    return Math.max(menMatchRatio, womenMatchRatio) >= 0.66;
  })();
  const sanitizedPlayerScores = scoresLookLikeHandicap ? undefined : playerScores;

  const normalizedPlayerDate =
    (response.confidence ?? 0) >= 0.7
      ? normalizeImportedDate(response.player?.date ?? null)
      : null;

  return {
    par: par.some(value => value > 0) ? par : undefined,
    handicapMen: handicapMen.some(value => value > 0) ? handicapMen : undefined,
    handicapWomen: handicapWomen.some(value => value > 0) ? handicapWomen : undefined,
    yardageByTee: Object.keys(yardageByTee).length > 0 ? yardageByTee : undefined,
    ratingMenByTee: response.metadata?.rating_men_by_tee,
    slopeMenByTee: response.metadata?.slope_men_by_tee,
    ratingWomenByTee: response.metadata?.rating_women_by_tee,
    slopeWomenByTee: response.metadata?.slope_women_by_tee,
    teeNames: teeNames && teeNames.length > 0 ? teeNames : undefined,
    playerName: response.player?.name || undefined,
    playerDate: normalizedPlayerDate || undefined,
    playerScores: sanitizedPlayerScores?.some(value => value > 0) ? sanitizedPlayerScores : undefined,
    playerPutts: playerPutts.some(value => value > 0) ? playerPutts : undefined,
    playerFairways: playerFairways.some(value => value !== null) ? playerFairways : undefined,
    playerGreens: playerGreens.some(value => value !== null) ? playerGreens : undefined,
    playerUpDowns: playerUpDowns.some(value => value !== null) ? playerUpDowns : undefined,
    playerPenalties: playerPenalties.some(value => value > 0) ? playerPenalties : undefined,
  };
};

export const mergeBackendResults = (
  front: BackendScorecardResponse,
  back: BackendScorecardResponse
): BackendScorecardResponse => {
  const mergedHolesMap = new Map<number, typeof front.holes[0]>();

  for (const hole of [...(front.holes || []), ...(back.holes || [])]) {
    const existing = mergedHolesMap.get(hole.hole);
    if (!existing) {
      mergedHolesMap.set(hole.hole, { ...hole });
      continue;
    }
    mergedHolesMap.set(hole.hole, {
      hole: hole.hole,
      par: hole.par ?? existing.par,
      handicap_men: hole.handicap_men ?? existing.handicap_men,
      handicap_women: hole.handicap_women ?? existing.handicap_women,
      yardages_by_tee: {
        ...(existing.yardages_by_tee || {}),
        ...(hole.yardages_by_tee || {}),
      },
    });
  }

  const mergedHoles = Array.from(mergedHolesMap.values()).sort((a, b) => a.hole - b.hole);

  const mergedMetadata = {
    tee_boxes: Array.from(new Set([
      ...(front.metadata?.tee_boxes || []),
      ...(back.metadata?.tee_boxes || []),
    ])),
    rating_men_by_tee: { ...(front.metadata?.rating_men_by_tee || {}), ...(back.metadata?.rating_men_by_tee || {}) },
    slope_men_by_tee: { ...(front.metadata?.slope_men_by_tee || {}), ...(back.metadata?.slope_men_by_tee || {}) },
    rating_women_by_tee: { ...(front.metadata?.rating_women_by_tee || {}), ...(back.metadata?.rating_women_by_tee || {}) },
    slope_women_by_tee: { ...(front.metadata?.slope_women_by_tee || {}), ...(back.metadata?.slope_women_by_tee || {}) },
  };

  const frontPlayerHoles = front.player?.holes || [];
  const backPlayerHoles = back.player?.holes || [];
  const mergedPlayerHolesMap = new Map<number, typeof frontPlayerHoles[0]>();

  for (const ph of [...frontPlayerHoles, ...backPlayerHoles]) {
    const existing = mergedPlayerHolesMap.get(ph.hole);
    if (!existing) {
      mergedPlayerHolesMap.set(ph.hole, { ...ph });
      continue;
    }
    mergedPlayerHolesMap.set(ph.hole, {
      hole: ph.hole,
      score: ph.score ?? existing.score,
      putts: ph.putts ?? existing.putts,
      fairway: ph.fairway ?? existing.fairway,
      green: ph.green ?? existing.green,
      up_down: ph.up_down ?? existing.up_down,
      penalties: ph.penalties ?? existing.penalties,
    });
  }

  const mergedPlayer = (front.player || back.player) ? {
    name: front.player?.name || back.player?.name || null,
    date: front.player?.date || back.player?.date || null,
    holes: Array.from(mergedPlayerHolesMap.values()).sort((a, b) => a.hole - b.hole),
  } : null;

  return {
    confidence: Math.max(front.confidence || 0, back.confidence || 0),
    holes: mergedHoles,
    totals: { ...(front.totals || {}), ...(back.totals || {}) },
    flags: Array.from(new Set([...(front.flags || []), ...(back.flags || [])])),
    metadata: mergedMetadata,
    player: mergedPlayer,
  };
};
