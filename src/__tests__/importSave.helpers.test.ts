import { buildSavedRoundPayload } from '../components/scorecard-import/hooks/useImportSave.helpers';

describe('buildSavedRoundPayload()', () => {
  const course: any = {
    id: 'course-1',
    name: 'Test Country Club',
    city: 'Testville',
    state: 'CA',
    country: 'USA',
    latitude: 1,
    longitude: 2,
  };

  const teeBoxDetails: any[] = [
    {
      name: 'Blue',
      rating: 71.2,
      slope: 129,
      yardage: 6500,
      holes: Array.from({ length: 18 }, (_, i) => ({
        hole: i + 1,
        par: i % 3 === 0 ? 3 : 4,
        yardage: 350,
        handicap: i + 1,
      })),
    },
  ];

  it('keeps extracted advanced stats for imported rounds', () => {
    const payload = buildSavedRoundPayload({
      scoreValues: Array.from({ length: 18 }, () => 4),
      roundHoleCount: 18,
      playerNineView: 'front',
      parsedPars: Array.from({ length: 18 }, (_, i) => (i % 3 === 0 ? 3 : 4)),
      fairways: Array.from({ length: 18 }, () => true),
      greens: Array.from({ length: 18 }, () => true),
      upDowns: Array.from({ length: 18 }, () => null),
      putts: Array.from({ length: 18 }, () => '2'),
      penalties: Array.from({ length: 18 }, () => '0'),
      isPremium: false,
      inTrial: false,
      activeTeeIndex: 0,
      teeBoxDetails,
      postEligibility: { eligible: true },
      playerDate: '2026-02-01',
      playerName: 'Player',
      imageUri: null,
      course,
      scoreSummary: { isNineHoleRound: false, filledScores: 18 },
    } as any);

    expect(payload.stats.greensPossible).toBe(18);
    expect(payload.stats.fairwaysPossible).toBe(12); // par-3 holes excluded
    expect(payload.stats.putts).toBe(36);
  });

  it('does not count par-3 holes toward fairways possible', () => {
    const parsedPars = [3, 4, 3, 4, ...Array.from({ length: 14 }, () => 4)];
    const fairways = [true, true, true, false, ...Array.from({ length: 14 }, () => true)];

    const payload = buildSavedRoundPayload({
      scoreValues: Array.from({ length: 18 }, () => 4),
      roundHoleCount: 18,
      playerNineView: 'front',
      parsedPars,
      fairways,
      greens: Array.from({ length: 18 }, () => true),
      upDowns: Array.from({ length: 18 }, () => null),
      putts: Array.from({ length: 18 }, () => '2'),
      penalties: Array.from({ length: 18 }, () => '0'),
      isPremium: true,
      inTrial: true,
      activeTeeIndex: 0,
      teeBoxDetails,
      postEligibility: { eligible: true },
      playerDate: '2026-02-01',
      playerName: 'Player',
      imageUri: null,
      course,
      scoreSummary: { isNineHoleRound: false, filledScores: 18 },
    } as any);

    expect(payload.stats.fairwaysPossible).toBe(16);
    expect(payload.stats.fairways).toBe(15);
  });
});

