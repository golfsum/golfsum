import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { SavedRound } from '../types';

const getWritableDirectories = (): string[] => {
  const dirs = [FileSystem.cacheDirectory, FileSystem.documentDirectory].filter(Boolean) as string[];
  const unique = Array.from(new Set(dirs));
  if (!unique.length) throw new Error('filesystem unavailable');
  return unique;
};

const writeExportFile = async (filename: string, contents: string): Promise<string> => {
  const directories = getWritableDirectories();
  let lastError: unknown = null;

  for (const directory of directories) {
    const fileUri = `${directory}${filename}`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, contents, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return fileUri;
    } catch (error) {
      lastError = error;
    }
  }

  const detail =
    lastError instanceof Error ? lastError.message : lastError ? JSON.stringify(lastError) : 'unknown';
  throw new Error(`filesystem write failed: ${detail}`);
};

const exportField = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const formatDateValue = (value: Date | string | undefined): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  cells.push(current);
  return cells;
};

const getRoundPar = (round: SavedRound): number | null => {
  // For incomplete rounds with holesPlayed, only sum par for played holes
  const playedSet = round.holesPlayed?.length ? new Set(round.holesPlayed) : null;

  if (round.courseSnapshot?.holes?.length) {
    const relevantHoles = playedSet
      ? round.courseSnapshot.holes.filter(h => playedSet.has(h.number))
      : round.courseSnapshot.holes;
    return relevantHoles.reduce((sum, hole) => sum + hole.par, 0);
  }
  if (round.holes?.length) {
    const relevantHoles = playedSet
      ? round.holes.filter(h => playedSet.has(h.number))
      : round.holes;
    return relevantHoles.reduce((sum, hole) => sum + hole.par, 0);
  }
  return null;
};

const buildCsvRows = (rounds: SavedRound[]): string[] => {
  const header = [
    'round_id',
    'date',
    'course_name',
    'score',
    'par_total',
    'score_vs_par',
    'tee_name',
    'course_rating',
    'slope_rating',
    'weather_temp',
    'weather_conditions',
    'weather_wind',
    'weather_humidity',
    'is_acceptable_for_handicap',
    'differential',
    'adjusted_gross_score',
    'hole_number',
    'hole_par',
    'hole_score',
    'hole_adjusted_score',
    'hole_putts',
    'hole_fairway_hit',
    'hole_green_hit',
    'hole_up_down',
    'hole_fairway_bunker',
    'hole_green_side_bunker',
    'hole_approach_distance',
    'hole_tee_club',
    'hole_approach_club',
    'hole_handicap_index',
  ];

  const rows: string[] = [header.map(exportField).join(',')];

  rounds.forEach((round) => {
    const parTotal = getRoundPar(round);
    const scoreVsPar =
      typeof parTotal === 'number' && typeof round.score === 'number'
        ? round.score - parTotal
        : '';
    const base = {
      round_id: round.id,
      date: formatDateValue(round.date),
      course_name: round.courseName,
      score: round.score,
      par_total: parTotal ?? '',
      score_vs_par: scoreVsPar,
      tee_name: round.teeName || round.stats?.teeBox || '',
      course_rating: round.stats?.courseRating ?? '',
      slope_rating: round.stats?.slopeRating ?? '',
      weather_temp: round.weather?.temp ?? '',
      weather_conditions: round.weather?.conditions ?? '',
      weather_wind: round.weather?.wind ?? '',
      weather_humidity: round.weather?.humidity ?? '',
      is_acceptable_for_handicap: round.isAcceptableForHandicap ?? '',
      differential: round.differential ?? '',
      adjusted_gross_score: round.adjustedGrossScore ?? '',
    };

    const holes = round.holes && round.holes.length > 0 ? round.holes : [null];

    holes.forEach((hole) => {
      const row = [
        base.round_id,
        base.date,
        base.course_name,
        base.score,
        base.par_total,
        base.score_vs_par,
        base.tee_name,
        base.course_rating,
        base.slope_rating,
        base.weather_temp,
        base.weather_conditions,
        base.weather_wind,
        base.weather_humidity,
        base.is_acceptable_for_handicap,
        base.differential,
        base.adjusted_gross_score,
        hole?.number ?? '',
        hole?.par ?? '',
        hole?.score ?? '',
        hole?.adjustedScore ?? '',
        hole?.putts ?? '',
        hole?.fairwayHit ?? '',
        hole?.greenHit ?? '',
        hole?.upDown ?? '',
        hole?.fairwayBunker ?? '',
        hole?.greenSideBunker ?? '',
        hole?.approachDistance ?? '',
        hole?.teeClub ?? '',
        hole?.approachClub ?? '',
        hole?.handicapIndex ?? '',
      ];
      rows.push(row.map(exportField).join(','));
    });
  });

  return rows;
};

export const exportRoundsCsv = async (rounds: SavedRound[]): Promise<void> => {
  const rows = buildCsvRows(rounds);
  const csvContent = rows.join('\n');
  const filename = `golfsum-export-${new Date().toISOString().slice(0, 10)}.csv`;

  if (Platform.OS === 'web') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const fileUri = await writeExportFile(filename, csvContent);

  const Sharing = require('expo-sharing');
  if (!Sharing || !(await Sharing.isAvailableAsync())) {
    throw new Error('sharing not available');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export GolfSum Data',
  });
};

const buildHtmlTable = (rows: string[]): string => {
  const [header, ...dataRows] = rows;
  const headerCells = parseCsvLine(header).map(cell => `<th>${escapeHtml(cell)}</th>`).join('');
  const bodyRows = dataRows.map((row) => {
    const cells = parseCsvLine(row).map(cell => `<td>${escapeHtml(cell)}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `
    <html>
      <head>
        <meta charset="utf-8" />
      </head>
      <body>
        <table>
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body>
    </html>
  `;
};

export const exportRoundsExcel = async (rounds: SavedRound[]): Promise<void> => {
  const rows = buildCsvRows(rounds);
  const htmlContent = buildHtmlTable(rows);
  const filename = `golfsum-export-${new Date().toISOString().slice(0, 10)}.xls`;

  if (Platform.OS === 'web') {
    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const fileUri = await writeExportFile(filename, htmlContent);

  const Sharing = require('expo-sharing');
  if (!Sharing || !(await Sharing.isAvailableAsync())) {
    throw new Error('sharing not available');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/vnd.ms-excel',
    dialogTitle: 'Export GolfSum Data',
  });
};

export const exportRoundsJson = async (rounds: SavedRound[]): Promise<void> => {
  const jsonContent = JSON.stringify(rounds, null, 2);
  const filename = `golfsum-export-${new Date().toISOString().slice(0, 10)}.json`;

  if (Platform.OS === 'web') {
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const fileUri = await writeExportFile(filename, jsonContent);

  const Sharing = require('expo-sharing');
  if (!Sharing || !(await Sharing.isAvailableAsync())) {
    throw new Error('sharing not available');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Export GolfSum Data',
  });
};
