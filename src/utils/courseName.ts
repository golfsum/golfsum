const MINOR_WORDS = new Set([
  'of',
  'the',
  'at',
  'in',
  'and',
  'or',
  'for',
  'to',
  'by',
  'on',
  'an',
  'a',
]);

export const formatCourseName = (name?: string | null) => {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  const normalized = trimmed
    .replace(/\bGolf\s+Links\b/gi, 'GL')
    .replace(/\bGolf\s+Course\b/gi, 'GC')
    .replace(/\bCountry\s+Club\b/gi, 'CC')
    .replace(/\bResort(?:\s*&\s*Spa|\s+and\s+Spa|\s+Spa)?\b/gi, 'Resort')
    .replace(/\b(gl|gc|cc)\b/gi, (match) => match.toUpperCase());

  const words = normalized.split(/\s+/);
  if (words.length <= 2) return normalized;

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && index < words.length - 1 && MINOR_WORDS.has(lower)) {
        return lower;
      }
      return word;
    })
    .join(' ');
};
