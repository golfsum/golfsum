import fs from 'fs';
import path from 'path';

describe('coach resource channel handles', () => {
  it('uses global youtube search URL format with channel name in query', () => {
    const filePath = path.join(__dirname, '..', 'components', 'PatternInsightCard.tsx');
    const source = fs.readFileSync(filePath, 'utf8');

    expect(source).toContain('https://www.youtube.com/results?search_query=');
    expect(source).toContain('Me and My Golf');
    expect(source).not.toContain('/search?query=');
  });
});
