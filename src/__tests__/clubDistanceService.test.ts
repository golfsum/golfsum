import { getBestClubForPar3 } from '../services/clubDistanceService';

describe('clubDistanceService', () => {
  test('suggests PW over 9 iron for 111y when bag says PW 125 and 9 iron 140', () => {
    const suggestion = getBestClubForPar3(
      111,
      ['PW', '9i', '8i'],
      {},
      { PW: 125, '9i': 140, '8i': 155 },
    );

    expect(suggestion?.club).toBe('PW');
    expect(suggestion?.displayYards).toBe(125);
  });

  test('suggests 9 iron for shorter hitter at 111y when 9 iron is 118', () => {
    const suggestion = getBestClubForPar3(
      111,
      ['PW', '9i', '8i'],
      {},
      { PW: 102, '9i': 118, '8i': 132 },
    );

    expect(suggestion?.club).toBe('9 Iron');
    expect(suggestion?.displayYards).toBe(118);
  });
});
