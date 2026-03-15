import { buildInRoundNudge, buildInRoundNudgeContext } from '../services/inRoundNudgeService';
import type { InRoundNudgeContext } from '../services/inRoundNudgeService';
import type { SavedRound } from '../types';

describe('inRoundNudgeService', () => {
  test('builds recent-round context with best distance band and lie penalties', () => {
    const round: SavedRound = {
      id: 'round-1',
      date: new Date('2026-03-11T10:00:00.000Z'),
      courseName: 'Test Course',
      score: 24,
      stats: { score: 24, totalPar: 20, coursePar: 20 },
      html: '',
      imageUri: '',
      holes: [
        { number: 1, par: 4, score: 4, greenHit: true, fairwayHit: true, isSaved: true },
        { number: 2, par: 4, score: 4, greenHit: true, fairwayHit: true, isSaved: true },
        { number: 3, par: 4, score: 5, greenHit: 'short', fairwayHit: 'right', isSaved: true },
        { number: 4, par: 4, score: 6, greenHit: 'short', fairwayHit: 'left', fairwayBunker: true, isSaved: true },
        { number: 5, par: 4, score: 5, greenHit: 'short', fairwayHit: true, isSaved: true },
        { number: 6, par: 4, score: 4, greenHit: true, fairwayHit: true, isSaved: true },
      ],
      gpsShots: [
        { id: '1', holeNumber: 1, shotNumber: 1, club: '3 Wood', lie: 'Tee Box', actualYards: 220, playingYards: 224 },
        { id: '2', holeNumber: 1, shotNumber: 2, club: 'GW', lie: 'Fairway', actualYards: 92, playingYards: 96 },
        { id: '3', holeNumber: 2, shotNumber: 1, club: '3 Wood', lie: 'Tee Box', actualYards: 218, playingYards: 222 },
        { id: '4', holeNumber: 2, shotNumber: 2, club: 'PW', lie: 'Fairway', actualYards: 98, playingYards: 102 },
        { id: '5', holeNumber: 3, shotNumber: 1, club: 'Driver', lie: 'Tee Box', actualYards: 238, playingYards: 244 },
        { id: '6', holeNumber: 3, shotNumber: 2, club: '7 Iron', lie: 'Right Rough', actualYards: 139, playingYards: 144 },
        { id: '7', holeNumber: 4, shotNumber: 1, club: 'Driver', lie: 'Tee Box', actualYards: 235, playingYards: 240 },
        { id: '8', holeNumber: 4, shotNumber: 2, club: '7 Iron', lie: 'Fairway Bunker', actualYards: 140, playingYards: 146 },
        { id: '9', holeNumber: 5, shotNumber: 1, club: 'Driver', lie: 'Tee Box', actualYards: 232, playingYards: 237 },
        { id: '10', holeNumber: 5, shotNumber: 2, club: '7 Iron', lie: 'Right Rough', actualYards: 143, playingYards: 147 },
        { id: '11', holeNumber: 6, shotNumber: 1, club: '3 Wood', lie: 'Tee Box', actualYards: 214, playingYards: 218 },
        { id: '12', holeNumber: 6, shotNumber: 2, club: 'GW', lie: 'Fairway', actualYards: 94, playingYards: 99 },
      ],
      gpsShotCount: 12,
    };

    const context = buildInRoundNudgeContext([round, round]);

    expect(context.bestDistanceBand?.label).toBeTruthy();
    expect(context.bestDistanceBand?.count).toBeGreaterThanOrEqual(6);
    expect(context.liePenalties.Rough.deltaVsFairway).toBeGreaterThan(0.5);
    expect(context.saferTeeClub?.club).toBe('3 Wood');
    expect(context.holeMemory[1]?.sampleCount).toBeGreaterThanOrEqual(2);
    expect(context.holeMemory[3]?.approachMiss).toBe('short');
    expect(context.holeMemory[3]?.approachBand).toBe('125-150');
    expect(context.holeMemory[3]?.approachClub).toBe('7 Iron');
    expect(context.holeMemory[3]?.betterApproachBand).toBe('125-150');
    expect(context.holeMemory[3]?.betterApproachClub).toBe('7 Iron');
    expect(context.holeMemory[3]?.betterApproachSide).toBeNull();
    expect(context.putting.avgPutts).toBeNull();
  });

  test('prioritizes recovery and lie / wind / leave nudges deterministically', () => {
    const context: InRoundNudgeContext = {
      bestDistanceBand: { label: '75-100', count: 8, avgDelta: -0.2 },
      liePenalties: { Rough: { count: 6, deltaVsFairway: 1.1 } },
      clubShortBias: { '7 Iron': { count: 7, shortPct: 51 } },
      saferTeeClub: { club: '3 Wood', fairwayPct: 72, avgDelta: 0.1 },
      holeMemory: {
        5: { missSide: 'right', approachMiss: null, approachBand: null, approachClub: null, betterApproachBand: null, betterApproachClub: null, betterApproachSide: null, saferTeeClub: '3 Wood', sampleCount: 3, approachSampleCount: 0, fairwayBunkerCount: 1, longFirstPuttCount: 0, longFirstPuttThreePuttCount: 0, toughestPin: null },
        6: { missSide: null, approachMiss: 'short', approachBand: '125-150', approachClub: '8 Iron', betterApproachBand: '125-150', betterApproachClub: '7 Iron', betterApproachSide: null, saferTeeClub: null, sampleCount: 3, approachSampleCount: 3, fairwayBunkerCount: 0, longFirstPuttCount: 0, longFirstPuttThreePuttCount: 0, toughestPin: null },
        7: { missSide: null, approachMiss: 'right', approachBand: '150-175', approachClub: '7 Iron', betterApproachBand: '150-175', betterApproachClub: '7 Iron', betterApproachSide: 'left-center', saferTeeClub: null, sampleCount: 3, approachSampleCount: 3, fairwayBunkerCount: 0, longFirstPuttCount: 0, longFirstPuttThreePuttCount: 0, toughestPin: null },
        8: { missSide: null, approachMiss: null, approachBand: null, approachClub: null, betterApproachBand: null, betterApproachClub: null, betterApproachSide: null, saferTeeClub: null, sampleCount: 2, approachSampleCount: 0, fairwayBunkerCount: 2, longFirstPuttCount: 2, longFirstPuttThreePuttCount: 1, toughestPin: 'back' },
        9: { missSide: null, approachMiss: null, approachBand: null, approachClub: null, betterApproachBand: null, betterApproachClub: null, betterApproachSide: null, saferTeeClub: null, sampleCount: 2, approachSampleCount: 0, fairwayBunkerCount: 0, longFirstPuttCount: 0, longFirstPuttThreePuttCount: 0, toughestPin: 'back' },
      },
      putting: {
        avgPutts: 2.2,
        longPuttThreePuttPct: 50,
        pinPutts: {
          front: { count: 2, avgPutts: 1.5 },
          middle: { count: 2, avgPutts: 2 },
          back: { count: 3, avgPutts: 2.5 },
        },
      },
    };

    expect(buildInRoundNudge({
      holeNumber: 7,
      holePar: 4,
      liveLie: 'Trees',
      selectedClub: '7 Iron',
      centerYards: 154,
      playingYards: 159,
      weather: { windMph: 16 },
      context,
    })?.type).toBe('recovery');

    expect(buildInRoundNudge({
      holeNumber: 7,
      holePar: 4,
      liveLie: 'Rough',
      selectedClub: '7 Iron',
      centerYards: 154,
      playingYards: 159,
      weather: { windMph: 16 },
      context,
    })?.type).toBe('lie');

    expect(buildInRoundNudge({
      holeNumber: 7,
      holePar: 4,
      liveLie: 'Fairway',
      selectedClub: '7 Iron',
      centerYards: 162,
      playingYards: 166,
      weather: { windMph: 4 },
      context,
    })?.body).toContain('150-175 approaches on this hole have scored better to the left-center');

    expect(buildInRoundNudge({
      holeNumber: 7,
      holePar: 5,
      liveLie: 'Tee Box',
      selectedClub: 'Driver',
      centerYards: 245,
      playingYards: 250,
      weather: { windMph: 4 },
      context,
    })?.type).toBe('tee-club');

    expect(buildInRoundNudge({
      holeNumber: 5,
      holePar: 4,
      liveLie: 'Tee Box',
      selectedClub: 'Driver',
      centerYards: 405,
      playingYards: 410,
      weather: { windMph: 4 },
      context,
    })?.body).toContain('steadiest tee club on this hole');

    expect(buildInRoundNudge({
      holeNumber: 8,
      holePar: 4,
      liveLie: 'Tee Box',
      selectedClub: 'Driver',
      centerYards: 388,
      playingYards: 392,
      weather: { windMph: 4 },
      context,
    })?.type).toBe('hazard');

    expect(buildInRoundNudge({
      holeNumber: 6,
      holePar: 4,
      liveLie: 'Fairway',
      selectedClub: '8 Iron',
      centerYards: 148,
      playingYards: 149,
      weather: { windMph: 4 },
      context,
    })?.body).toContain('7 Iron has produced better scoring from 125-150 on this hole');

    expect(buildInRoundNudge({
      holeNumber: 8,
      holePar: 4,
      liveLie: 'Green',
      selectedClub: null,
      centerYards: 18,
      playingYards: 18,
      context,
      greenSummary: { pinLocation: 'back', firstPuttDistance: 34, putts: null },
    })?.body).toContain('long first putts into trouble before');

    expect(buildInRoundNudge({
      holeNumber: 9,
      holePar: 4,
      liveLie: 'Green',
      selectedClub: null,
      centerYards: 10,
      playingYards: 10,
      context: {
        ...context,
        putting: {
          ...context.putting,
          longPuttThreePuttPct: 20,
        },
      },
      greenSummary: { pinLocation: 'back', firstPuttDistance: 12, putts: null },
    })?.body).toContain('Back pins have been the toughest finish on this green');
  });
});
