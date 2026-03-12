import { buildRoundAnalysis } from '../services/roundAnalysisService';
import type { GpsHoleSummary, GpsShotLog, RoundHole, SavedRound } from '../types';

const makeShot = (overrides: Partial<GpsShotLog>): GpsShotLog => ({
  id: `shot-${Math.random().toString(36).slice(2, 10)}`,
  holeNumber: 1,
  shotNumber: 1,
  club: 'dr',
  lie: 'Tee Box',
  actualYards: 200,
  playingYards: 205,
  from: { lat: 36.57, lng: -121.95 },
  to: { lat: 36.571, lng: -121.951 },
  weather: {
    windMph: 12,
    windDegrees: 270,
    tempF: 58,
    humidity: 71,
  },
  loggedAt: '2026-03-11T15:00:00.000Z',
  ...overrides,
});

describe('buildRoundAnalysis', () => {
  test('uses persisted gpsShots to power play time, best distance, lie impact, and miss-pattern coaching', () => {
    const holes = [
      { number: 1, par: 4, score: 4, fairwayHit: true, greenHit: true, teeClub: 'dr', approachClub: '7i', isSaved: true, dogleg: 'straight' },
      { number: 2, par: 4, score: 4, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: '7i', isSaved: true, dogleg: 'straight' },
      { number: 3, par: 4, score: 5, fairwayHit: 'right', greenHit: 'short', teeClub: 'dr', approachClub: '7i', isSaved: true, dogleg: 'right' },
      { number: 4, par: 4, score: 6, fairwayHit: 'left', greenHit: 'short', teeClub: 'dr', approachClub: '7i', fairwayBunker: true, isSaved: true, dogleg: 'left' },
      { number: 5, par: 5, score: 5, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: 'gw', isSaved: true, dogleg: 'straight' },
      { number: 6, par: 4, score: 4, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: 'pw', isSaved: true, dogleg: 'straight' },
    ] as Array<RoundHole & { dogleg: string }>;

    const gpsShots: GpsShotLog[] = [
      makeShot({ id: '1-1', holeNumber: 1, shotNumber: 1, club: 'dr', lie: 'Tee Box', actualYards: 233, playingYards: 238 }),
      makeShot({ id: '1-2', holeNumber: 1, shotNumber: 2, club: '7i', lie: 'Fairway', actualYards: 136, playingYards: 140 }),
      makeShot({ id: '2-1', holeNumber: 2, shotNumber: 1, club: '3w', lie: 'Tee Box', actualYards: 220, playingYards: 224 }),
      makeShot({ id: '2-2', holeNumber: 2, shotNumber: 2, club: '7i', lie: 'Fairway', actualYards: 134, playingYards: 138 }),
      makeShot({ id: '3-1', holeNumber: 3, shotNumber: 1, club: 'dr', lie: 'Tee Box', actualYards: 236, playingYards: 241 }),
      makeShot({ id: '3-2', holeNumber: 3, shotNumber: 2, club: '7i', lie: 'Right Rough', actualYards: 138, playingYards: 142 }),
      makeShot({ id: '4-1', holeNumber: 4, shotNumber: 1, club: 'dr', lie: 'Tee Box', actualYards: 228, playingYards: 234 }),
      makeShot({ id: '4-2', holeNumber: 4, shotNumber: 2, club: '7i', lie: 'Fairway Bunker', actualYards: 141, playingYards: 145 }),
      makeShot({ id: '5-1', holeNumber: 5, shotNumber: 1, club: '3w', lie: 'Tee Box', actualYards: 214, playingYards: 219 }),
      makeShot({ id: '5-2', holeNumber: 5, shotNumber: 2, club: 'gw', lie: 'Fairway', actualYards: 92, playingYards: 96 }),
      makeShot({ id: '6-1', holeNumber: 6, shotNumber: 1, club: '3w', lie: 'Tee Box', actualYards: 210, playingYards: 215 }),
      makeShot({ id: '6-2', holeNumber: 6, shotNumber: 2, club: 'pw', lie: 'Fairway', actualYards: 94, playingYards: 98 }),
    ];
    const gpsHoleSummaries: GpsHoleSummary[] = [
      { holeNumber: 1, pinLocation: 'front', firstPuttDistance: 32, putts: 1 },
      { holeNumber: 2, pinLocation: 'middle', firstPuttDistance: 18, putts: 2 },
      { holeNumber: 3, pinLocation: 'back', firstPuttDistance: 34, putts: 3 },
    ];

    const round: SavedRound = {
      id: 'round-gps-analysis',
      date: new Date('2026-03-11T19:12:00.000Z'),
      courseName: 'Pebble Beach Golf Links',
      score: 28,
      stats: { score: 28, totalPar: 25, coursePar: 25, teeBox: 'Blue' },
      html: '<html></html>',
      imageUri: 'file:///round.png',
      teeName: 'Blue',
      roundStartedAt: Date.parse('2026-03-11T15:00:00.000Z'),
      roundEndedAt: Date.parse('2026-03-11T19:12:00.000Z'),
      roundDurationMinutes: 252,
      holes,
      gpsShots,
      gpsShotCount: gpsShots.length,
      gpsHoleSummaries,
    };

    const analysis = buildRoundAnalysis(round);

    expect(analysis.playTimeMinutes).toBe(252);
    expect(analysis.playTimeLabel).toBe('4h 12m');
    expect(analysis.distanceEngineSummary?.avgGps).not.toBeNull();
    expect(analysis.distanceEngineSummary?.avgPlaying).not.toBeNull();
    expect(analysis.targetDistanceCard?.title).toBe('Target this number off the tee');
    expect(analysis.targetDistanceCard?.note).toContain('75-100');
    expect(analysis.bestScoringWindowCard?.support).toContain('75-100');
    expect(analysis.lieImpactCard?.note.toLowerCase()).toContain('better from fairway than fairway bunker');
    expect(analysis.lieImpactRows.find((row) => row.label === 'Fairway')?.avgDelta).toBe(0);
    expect(analysis.lieImpactRows.find((row) => row.label === 'Rough')?.deltaVsFairway).toBe(1);
    expect(analysis.lieImpactRows.find((row) => row.label === 'Fairway Bunker')?.deltaVsFairway).toBe(2);
    expect(analysis.clubMissRows.find((row) => row.club === '7i')?.dominant).toBe('SHORT');
    expect(analysis.teeClubPerformanceRows.length).toBeGreaterThan(0);
    expect(analysis.puttingSummary?.trackedHoles).toBe(3);
    expect(analysis.puttingSummary?.totalPutts).toBe(6);
    expect(analysis.puttingSummary?.avgFirstPuttDistance).toBe(28);
    expect(analysis.puttingSummary?.pinLocations).toEqual([
      { label: 'Front', count: 1 },
      { label: 'Middle', count: 1 },
      { label: 'Back', count: 1 },
    ]);
    expect(analysis.puttingSummary?.pinLocationRows).toEqual([
      { label: 'Front', count: 1, avgPutts: 1, avgFirstPuttDistance: 32 },
      { label: 'Middle', count: 1, avgPutts: 2, avgFirstPuttDistance: 18 },
      { label: 'Back', count: 1, avgPutts: 3, avgFirstPuttDistance: 34 },
    ]);
    expect(analysis.puttingSummary?.firstPuttBuckets).toEqual([
      { label: '15-30 ft', count: 1, avgPutts: 2, threePuttPct: 0 },
      { label: '30+ ft', count: 2, avgPutts: 2, threePuttPct: 50 },
    ]);
    expect(analysis.puttingCard?.title).toBe('Lag putting focus');
    expect(analysis.pinLocationCard?.title).toBe('Back pins were toughest');
    expect(analysis.patternInsights.some((card) => card.title === 'Putting pace needs attention')).toBe(false);
    expect(analysis.patternInsights.some((card) => card.title === 'Back pins demanded more')).toBe(true);
    expect(analysis.patternInsights.some((card) => card.title === '3-putts rise from long range')).toBe(true);
    expect(analysis.nextPracticeFocus?.title).toBe('Lie management');

    const sevenIronRow = analysis.clubAverageRows.find((row) => row.club === '7i');
    expect(sevenIronRow?.byLie.some((row) => row.lie === 'Fairway')).toBe(true);
    expect(sevenIronRow?.byLie.some((row) => row.lie === 'Right Rough')).toBe(true);
    expect(sevenIronRow?.byLie.some((row) => row.lie === 'Fairway Bunker')).toBe(true);
    expect(analysis.patternInsights.some((card) => card.title === 'Best distance 75-100')).toBe(true);
  });
});
