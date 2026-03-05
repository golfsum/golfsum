import { Platform, Share } from 'react-native';
import type { SavedRound } from '../types';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const formatScoreToPar = (diff: number) => {
  if (diff === 0) return 'E';
  if (diff > 0) return `+${diff}`;
  return `${diff}`;
};

const getRoundParTotal = (round: SavedRound): number | null => {
  const statsAny = round.stats as { totalPar?: number; coursePar?: number };
  if (typeof statsAny.totalPar === 'number' && statsAny.totalPar > 0) {
    return statsAny.totalPar;
  }
  if (typeof statsAny.coursePar === 'number' && statsAny.coursePar > 0) {
    return statsAny.coursePar;
  }
  // For incomplete rounds with holesPlayed, only sum par for played holes
  const playedSet = round.holesPlayed?.length ? new Set(round.holesPlayed) : null;
  if (round.holes && round.holes.length > 0) {
    const relevantHoles = playedSet ? round.holes.filter(h => playedSet.has(h.number)) : round.holes;
    const total = relevantHoles.reduce((sum, hole) => sum + (hole.par || 0), 0);
    if (total > 0) return total;
  }
  if (round.courseSnapshot?.holes && round.courseSnapshot.holes.length > 0) {
    const relevantHoles = playedSet
      ? round.courseSnapshot.holes.filter(h => playedSet.has(h.number))
      : round.courseSnapshot.holes;
    const total = relevantHoles.reduce((sum, hole) => sum + (hole.par || 0), 0);
    if (total > 0) return total;
  }
  return null;
};

const getScoreToPar = (round: SavedRound): number | null => {
  const parTotal = getRoundParTotal(round);
  if (parTotal === null) return null;
  return round.score - parTotal;
};

const formatRoundDate = (round: SavedRound) => {
  const date = new Date(round.date);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const buildStatCardHtml = (round: SavedRound) => {
  const scoreToPar = getScoreToPar(round);
  const parLabel = scoreToPar !== null ? formatScoreToPar(scoreToPar) : '';

  const firPct = round.stats.fairwaysPossible
    ? Math.round(((round.stats.fairways || 0) / round.stats.fairwaysPossible) * 100)
    : null;
  const girPct = round.stats.greensPossible
    ? Math.round(((round.stats.greens || 0) / round.stats.greensPossible) * 100)
    : null;
  const putts = round.stats.putts ?? null;

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            margin: 0;
            padding: 24px;
            background: #0F172A;
            color: #E5E7EB;
            font-family: Arial, sans-serif;
          }
          .card {
            background: #111827;
            border-radius: 18px;
            padding: 24px;
            border: 1px solid rgba(255, 255, 255, 0.08);
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .course {
            font-size: 22px;
            font-weight: 700;
          }
          .date {
            font-size: 12px;
            color: #9CA3AF;
            margin-top: 6px;
          }
          .score {
            font-size: 42px;
            font-weight: 800;
            color: #10B981;
          }
          .vspar {
            font-size: 14px;
            color: #9CA3AF;
            margin-top: 4px;
          }
          .stats {
            display: flex;
            gap: 12px;
            margin-top: 24px;
          }
          .stat {
            flex: 1;
            background: rgba(255,255,255,0.04);
            border-radius: 12px;
            padding: 12px;
            text-align: center;
          }
          .stat-label {
            font-size: 12px;
            color: #9CA3AF;
            margin-bottom: 6px;
          }
          .stat-value {
            font-size: 20px;
            font-weight: 700;
            color: #E5E7EB;
          }
          .footer {
            margin-top: 20px;
            font-size: 12px;
            color: #6B7280;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div>
              <div class="course">${escapeHtml(round.courseName)}</div>
              <div class="date">${escapeHtml(formatRoundDate(round))}</div>
            </div>
            <div>
              <div class="score">${round.score}</div>
              ${parLabel ? `<div class="vspar">vs par ${escapeHtml(parLabel)}</div>` : ''}
            </div>
          </div>
          <div class="stats">
            <div class="stat">
              <div class="stat-label">FIR</div>
              <div class="stat-value">${firPct !== null ? `${firPct}%` : '—'}</div>
            </div>
            <div class="stat">
              <div class="stat-label">GIR</div>
              <div class="stat-value">${girPct !== null ? `${girPct}%` : '—'}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Putts</div>
              <div class="stat-value">${putts !== null ? putts : '—'}</div>
            </div>
          </div>
          <div class="footer">GolfSum • Track • Analyze • Improve</div>
        </div>
      </body>
    </html>
  `;
};

export const shareRoundStatCard = async (round: SavedRound) => {
  try {
    const Print = require('expo-print');
    const html = buildStatCardHtml(round);
    const result = await Print.printToFileAsync({ html });
    const uri = result?.uri;
    if (!uri) throw new Error('Failed to generate stat card');

    try {
      const Sharing = require('expo-sharing');
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'GolfSum Stat Card',
        });
        return;
      }
    } catch {
      // Fall back to Share/open.
    }

    if (Platform.OS === 'web') {
      window.open(uri, '_blank');
      return;
    }

    await Share.share({ url: uri, message: 'GolfSum Stat Card' });
  } catch (error) {
    await Share.share({
      message: `${round.courseName} - Score ${round.score}`,
    });
  }
};
