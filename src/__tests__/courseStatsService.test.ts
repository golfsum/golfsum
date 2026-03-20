import { buildInsightCopy, getSuggestion } from '../services/courseStatsService';
import type { SavedRound } from '../types';

type FairwayHit = boolean | 'left' | 'right' | 'short' | 'long' | 'double-left' | 'double-right' | null | undefined;

function makeRound(id: string, holeScore: number, teeClub: string, fairwayHit: FairwayHit) {
  return {
    id,
    date: new Date('2026-03-15T10:00:00.000Z'),
    courseName: 'Haven Golf Course',
    courseId: '0121096316737626',
    score: 72,
    stats: { score: 72 },
    html: '',
    imageUri: '',
    holes: [
      {
        number: 1,
        par: 4,
        score: holeScore,
        fairwayHit,
        teeClub,
        isSaved: true,
      },
    ],
    gpsShots: [
      { id: `${id}-1`, holeNumber: 1, shotNumber: 1, club: teeClub, lie: 'Tee Box', actualYards: 230, playingYards: 234 },
      { id: `${id}-2`, holeNumber: 1, shotNumber: 2, club: '9 Iron', lie: 'Fairway', actualYards: 118, playingYards: 121 },
    ],
  } as SavedRound;
}

describe('courseStatsService', () => {
  test('returns a data-backed tee-club suggestion and matching copy on a par 4', () => {
    const rounds = [
      makeRound('r1', 4, '3 Wood', true),
      makeRound('r2', 4, '3 Wood', true),
      makeRound('r3', 5, '3 Wood', false),
      makeRound('r4', 5, 'Driver', false),
      makeRound('r5', 5, 'Driver', false),
      makeRound('r6', 6, 'Driver', true),
    ];

    const suggestion = getSuggestion(rounds, 1, { club: 'Driver', yards: 255 });

    expect(suggestion.state).toBe('data_backed');
    expect(suggestion.label).toBe('3 Wood');
    expect(suggestion.metric).toBe('tee_club');
    expect(buildInsightCopy(suggestion)).toContain('3 Wood');
    expect(buildInsightCopy(suggestion)).toContain('fairways on this hole');
  });

  test('falls back to building when there are fewer than three rounds', () => {
    const rounds = [
      makeRound('r1', 4, '3 Wood', true),
      makeRound('r2', 5, '3 Wood', false),
    ];

    const suggestion = getSuggestion(rounds, 1, { club: 'Driver', yards: 255 });

    expect(suggestion.state).toBe('building');
    expect(suggestion.label).toBe('Driver');
    expect(buildInsightCopy(suggestion)).toContain('2 rounds here so far');
  });

  test('never returns a leave-number tip on a par 3', () => {
    const rounds = [
      {
        ...makeRound('p1', 3, '6 Iron', undefined),
        holes: [{ number: 1, par: 3, score: 3, greenHit: true, teeClub: '6 Iron', isSaved: true }],
      },
      {
        ...makeRound('p2', 4, '7 Iron', undefined),
        holes: [{ number: 1, par: 3, score: 4, greenHit: 'right', teeClub: '7 Iron', isSaved: true }],
      },
      {
        ...makeRound('p3', 3, '6 Iron', undefined),
        holes: [{ number: 1, par: 3, score: 3, greenHit: true, teeClub: '6 Iron', isSaved: true }],
      },
    ] as SavedRound[];

    const suggestion = getSuggestion(rounds, 1, {
      par: 3,
      gpsDistanceYards: 185,
      fallbackClub: { club: '6 Iron', yards: 185 },
      clubTotals: { '6 Iron': 182, '7 Iron': 170 },
      playerRating: 8,
    });

    expect(suggestion.metric).not.toBe('best_leave');
    expect(['approach_club_par3', 'gir_low_par3', 'scoring_trend', 'distance_based_par3', 'strong_green_par3']).toContain(suggestion.metric);
  });

  test('uses distance-based par 3 copy when there is no hole history but club distances exist', () => {
    const suggestion = getSuggestion([], 7, {
      par: 3,
      gpsDistanceYards: 149,
      fallbackClub: { club: '8 Iron', yards: 145 },
      clubTotals: { '8 Iron': 145, '7 Iron': 158 },
      playerRating: 8,
    });

    expect(suggestion.metric).toBe('distance_based_par3');
    expect(suggestion.title).toBe('Off the tee');
    expect(suggestion.body).toContain('8 Iron');
    expect(suggestion.body).toContain('Middle of the green');
  });

  test('uses tough-green par 3 copy for a mid-low player on poor GIR holes', () => {
    const rounds = [
      {
        ...makeRound('g1', 4, 'SW', undefined),
        holes: [{ number: 7, par: 3, score: 4, greenHit: false, teeClub: 'SW', isSaved: true }],
        gpsShots: [{ id: 'g1-1', holeNumber: 7, shotNumber: 1, club: 'SW', lie: 'Tee Box', actualYards: 110, playingYards: 110 }],
      },
      {
        ...makeRound('g2', 3, 'SW', undefined),
        holes: [{ number: 7, par: 3, score: 3, greenHit: false, teeClub: 'SW', isSaved: true }],
        gpsShots: [{ id: 'g2-1', holeNumber: 7, shotNumber: 1, club: 'SW', lie: 'Tee Box', actualYards: 110, playingYards: 110 }],
      },
      {
        ...makeRound('g3', 4, 'SW', undefined),
        holes: [{ number: 7, par: 3, score: 4, greenHit: false, teeClub: 'SW', isSaved: true }],
        gpsShots: [{ id: 'g3-1', holeNumber: 7, shotNumber: 1, club: 'SW', lie: 'Tee Box', actualYards: 110, playingYards: 110 }],
      },
      {
        ...makeRound('g4', 3, 'SW', undefined),
        holes: [{ number: 7, par: 3, score: 3, greenHit: false, teeClub: 'SW', isSaved: true }],
        gpsShots: [{ id: 'g4-1', holeNumber: 7, shotNumber: 1, club: 'SW', lie: 'Tee Box', actualYards: 110, playingYards: 110 }],
      },
    ] as SavedRound[];

    const suggestion = getSuggestion(rounds, 7, {
      par: 3,
      gpsDistanceYards: 110,
      fallbackClub: { club: 'SW', yards: 110 },
      clubTotals: { SW: 110 },
      playerRating: 8,
    });

    expect(suggestion.metric).toBe('gir_low_par3');
    expect(suggestion.title).toBe('Tough green');
    expect(suggestion.body).toContain('Aim for the center');
  });
});
