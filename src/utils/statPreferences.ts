import { SavedRound, StatPreferences, UserProfile } from '../types';

export const DEFAULT_STAT_PREFERENCES: StatPreferences = {
  score: true,
  putts: true,
  fir: true,
  gir: true,
  scrambling: true,
  approachDistance: true,
  penalties: true,
  bunkers: true,
};

export function getStatPreferencesFromProfile(profile?: UserProfile | null): StatPreferences {
  const scoringPrefs = profile?.scoringPreferences;
  const statPrefs = profile?.statPreferences;

  return {
    score: true,
    putts: statPrefs?.putts ?? (scoringPrefs ? scoringPrefs.trackPutts !== false : true),
    fir: statPrefs?.fir ?? (scoringPrefs ? scoringPrefs.trackFairways !== false : true),
    gir: statPrefs?.gir ?? (scoringPrefs ? scoringPrefs.trackGreens !== false : true),
    scrambling: statPrefs?.scrambling ?? (scoringPrefs ? scoringPrefs.trackUpDown !== false : true),
    approachDistance: statPrefs?.approachDistance ?? (scoringPrefs ? scoringPrefs.trackApproachDistance !== false : true),
    penalties: statPrefs?.penalties ?? (scoringPrefs ? scoringPrefs.trackPenalties !== false : true),
    bunkers: statPrefs?.bunkers ?? (scoringPrefs ? scoringPrefs.trackBunkers !== false : true),
  };
}

export function getRoundStatPreferences(round: SavedRound): StatPreferences {
  if (round.statPreferencesSnapshot) {
    return { ...DEFAULT_STAT_PREFERENCES, ...round.statPreferencesSnapshot };
  }

  const hasPutts = !!(round.stats?.putts && round.stats.putts > 0)
    || !!round.holes?.some(h => typeof h.putts === 'number');
  const hasFir = !!round.stats?.fairwaysPossible
    || !!round.holes?.some(h => h.fairwayHit !== undefined && h.fairwayHit !== null);
  const hasGir = !!round.stats?.greensPossible
    || !!round.holes?.some(h => h.greenHit !== undefined && h.greenHit !== null);
  const hasScrambling = !!round.stats?.upDownAttempts && round.stats.upDownAttempts > 0;
  const hasApproach = !!round.holes?.some(h => h.approachDistance !== undefined && h.approachDistance !== null);
  const hasPenalties = round.penalties !== undefined;

  return {
    score: true,
    putts: hasPutts,
    fir: hasFir,
    gir: hasGir,
    scrambling: hasScrambling,
    approachDistance: hasApproach,
    penalties: hasPenalties,
    bunkers: false,
  };
}

export function isRoundStatEnabled(round: SavedRound, stat: keyof StatPreferences): boolean {
  return getRoundStatPreferences(round)[stat] === true;
}
