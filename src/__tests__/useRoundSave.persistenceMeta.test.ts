import { buildRoundPersistenceMeta } from '../components/score-entry/hooks/roundPersistenceMeta';
import type { PendingGpsRoundData } from '../types';

describe('buildRoundPersistenceMeta', () => {
  test('prefers GPS round timing and shot payload when present', () => {
    const gpsRoundData: PendingGpsRoundData = {
      courseId: 'pebble',
      courseName: 'Pebble Beach Golf Links',
      teeName: 'Blue',
      startingHole: 10,
      startedAt: Date.parse('2026-03-11T14:00:00.000Z'),
      endedAt: Date.parse('2026-03-11T18:18:00.000Z'),
      gpsShots: [
        {
          id: 'shot-1',
          holeNumber: 10,
          shotNumber: 1,
          club: 'dr',
          lie: 'Tee Box',
          actualYards: 245,
          playingYards: 252,
        },
        {
          id: 'shot-2',
          holeNumber: 10,
          shotNumber: 2,
          club: '8i',
          lie: 'Fairway',
          actualYards: 151,
          playingYards: 156,
        },
      ],
    };

    const result = buildRoundPersistenceMeta(
      gpsRoundData,
      Date.parse('2026-03-11T14:30:00.000Z'),
      Date.parse('2026-03-11T18:45:00.000Z'),
    );

    expect(result.roundStartedAt).toBe(gpsRoundData.startedAt);
    expect(result.roundEndedAt).toBe(gpsRoundData.endedAt);
    expect(result.roundDurationMinutes).toBe(258);
    expect(result.gpsShots).toEqual(gpsRoundData.gpsShots);
    expect(result.gpsShotCount).toBe(2);
  });

  test('falls back to score-entry timestamps when there is no GPS round payload', () => {
    const result = buildRoundPersistenceMeta(
      null,
      Date.parse('2026-03-11T16:00:00.000Z'),
      Date.parse('2026-03-11T16:47:00.000Z'),
    );

    expect(result.roundStartedAt).toBe(Date.parse('2026-03-11T16:00:00.000Z'));
    expect(result.roundEndedAt).toBe(Date.parse('2026-03-11T16:47:00.000Z'));
    expect(result.roundDurationMinutes).toBe(47);
    expect(result.gpsShots).toBeUndefined();
    expect(result.gpsShotCount).toBe(0);
  });

  test('clamps duration to at least one minute when timestamps are equal', () => {
    const sameTime = Date.parse('2026-03-11T16:00:00.000Z');
    const result = buildRoundPersistenceMeta(null, sameTime, sameTime);

    expect(result.roundDurationMinutes).toBe(1);
  });
});
