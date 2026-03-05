export type StatFormat = 'average' | 'percent' | 'integer' | 'handicap';

const isValidNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && !Number.isNaN(value);

export const formatAverage = (value: number | null | undefined): string => {
  if (!isValidNumber(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
};

export const formatPercent = (value: number | null | undefined): string => {
  if (!isValidNumber(value)) return '—';
  return `${Math.round(value)}%`;
};

export const formatInteger = (value: number | null | undefined): string => {
  if (!isValidNumber(value)) return '—';
  return Math.round(value).toString();
};

export const formatHandicap = (value: number | null | undefined): string => {
  if (!isValidNumber(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return rounded.toFixed(1);
};

export const formatStat = (value: number | null | undefined, format: StatFormat): string => {
  switch (format) {
    case 'percent':
      return formatPercent(value);
    case 'integer':
      return formatInteger(value);
    case 'handicap':
      return formatHandicap(value);
    case 'average':
    default:
      return formatAverage(value);
  }
};
