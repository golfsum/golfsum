import { estimateCarry } from '../services/carryEstimator';
import { isQualifyingShot } from '../services/shotQualityFilter';

describe('shotQualityFilter', () => {
  test('rejects a topped driver well below threshold', () => {
    expect(
      isQualifyingShot(
        { club: 'Driver', lie: 'Tee Box', distanceYards: 80 },
        240,
        8,
      )
    ).toBe(false);
  });

  test('rejects sand shots regardless of distance', () => {
    expect(
      isQualifyingShot(
        { club: '7 Iron', lie: 'Sand', distanceYards: 150 },
        150,
        12,
      )
    ).toBe(false);
  });

  test('accepts a normal full-swing shot', () => {
    expect(
      isQualifyingShot(
        { club: 'Driver', lie: 'Tee Box', distanceYards: 240 },
        240,
        12,
      )
    ).toBe(true);
  });

  test('estimates driver carry near 87 percent of total', () => {
    expect(estimateCarry(255, 'driver')).toBe(222);
  });
});
