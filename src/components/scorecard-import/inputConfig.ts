import type { InputType } from './types';

export const SCORE_CHIP_OPTIONS: Array<number | string> = [2, 3, 4, 5, 6, 7, '8+'];
export const PUTT_CHIP_OPTIONS: Array<number | string> = [0, 1, 2, 3, 4, '5+'];
export const PENALTY_CHIP_OPTIONS: Array<number | string> = [0, 1, 2, '3+'];

export const INPUT_CONFIG: Record<InputType, {
  type: 'chips' | 'numberPad';
  options?: Array<number | string>;
  allowDecimal?: boolean;
  maxLength?: number;
}> = {
  score: { type: 'chips', options: SCORE_CHIP_OPTIONS },
  putts: { type: 'chips', options: PUTT_CHIP_OPTIONS },
  penalties: { type: 'chips', options: PENALTY_CHIP_OPTIONS },
  fairway: { type: 'chips' },
  green: { type: 'chips' },
  par: { type: 'chips', options: [3, 4, 5, 6] },
  yardage: { type: 'numberPad', maxLength: 3 },
  hcpMen: { type: 'numberPad', maxLength: 2 },
  hcpWomen: { type: 'numberPad', maxLength: 2 },
  ratingMen: { type: 'numberPad', allowDecimal: true, maxLength: 4 },
  slopeMen: { type: 'numberPad', maxLength: 3 },
  ratingWomen: { type: 'numberPad', allowDecimal: true, maxLength: 4 },
  slopeWomen: { type: 'numberPad', maxLength: 3 },
};
