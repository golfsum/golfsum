const GOLF_ABBREVS: Record<string, string> = {
  gl: 'GL',
  gc: 'GC',
  cc: 'CC',
  gcc: 'GCC',
  'g&cc': 'G&CC',
  rc: 'RC',
  mc: 'MC',
};

export function normalizeCourseName(name: string): string {
  if (!name) return name;
  const cleaned = name
    .replace(/,\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned
    .split(' ')
    .map(word => GOLF_ABBREVS[word.toLowerCase()] ?? word)
    .join(' ');
}

