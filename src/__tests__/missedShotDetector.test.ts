import { checkDistanceJump, checkShotCount } from '../services/missedShotDetector';

describe('missedShotDetector', () => {
  test('fires hard-limit distance jump over 350 yards', () => {
    const result = checkDistanceJump(
      { hole: 1, club: '7 Iron', startCoords: { lat: 0, lng: 0.003 } },
      { hole: 1, club: 'Driver', startCoords: { lat: 0, lng: 0 } },
      {},
      240
    );

    expect(result?.reason).toBe('hard_limit');
  });

  test('fires personal-limit jump when distance exceeds driver avg plus buffer', () => {
    const result = checkDistanceJump(
      { hole: 1, club: '7 Iron', startCoords: { lat: 0, lng: 0.0025 } },
      { hole: 1, club: 'Driver', startCoords: { lat: 0, lng: 0 } },
      {},
      220
    );

    expect(result?.reason).toBe('personal_limit');
  });

  test('fires club mismatch when previous club cannot cover the distance', () => {
    const result = checkDistanceJump(
      { hole: 1, club: 'SW', startCoords: { lat: 0, lng: 0.002 } },
      { hole: 1, club: '9 Iron', startCoords: { lat: 0, lng: 0 } },
      { '9 iron': { manualYards: 135 } },
      240
    );

    expect(result?.reason).toBe('club_mismatch');
  });

  test('does not flag par 3 with one full swing', () => {
    const result = checkShotCount(
      { number: 7, par: 3, teeYardage: 110 },
      [{ hole: 7, club: 'PW' }, { hole: 7, club: 'Putter' }, { hole: 7, club: 'Putter' }],
      3
    );

    expect(result).toBeNull();
  });

  test('does not flag short par 4 with one full swing', () => {
    const result = checkShotCount(
      { number: 2, par: 4, teeYardage: 260 },
      [{ hole: 2, club: 'Driver' }, { hole: 2, club: 'Putter' }],
      2
    );

    expect(result).toBeNull();
  });

  test('flags long par 4 with one full swing and score 3+', () => {
    const result = checkShotCount(
      { number: 6, par: 4, teeYardage: 410 },
      [{ hole: 6, club: 'Driver' }, { hole: 6, club: 'Putter' }, { hole: 6, club: 'Putter' }],
      3
    );

    expect(result?.type).toBe('low_shot_count');
  });

  test('does not flag par 5 eagle with two full swings', () => {
    const result = checkShotCount(
      { number: 14, par: 5, teeYardage: 520 },
      [{ hole: 14, club: 'Driver' }, { hole: 14, club: '5 Wood' }, { hole: 14, club: 'Putter' }],
      3
    );

    expect(result).toBeNull();
  });
});
