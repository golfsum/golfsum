import Storage from './storage';
import { logger } from '../utils/logger';

const HOLE_NOTES_KEY = '@GolfSum:holeNotes:v1';
const MAX_NOTE_LENGTH = 200;

export interface HoleNote {
  id: string;
  courseId: string;
  holeNumber: number;
  text: string;
  createdAt: string; // ISO string
  roundId: string | null;
  roundDate: string | null; // e.g. "Feb 16"
}

type HoleNotesStore = Record<string, HoleNote[]>;

const storeKey = (courseId: string, holeNumber: number) => `${courseId}::${holeNumber}`;

const normalizeText = (text: string) => text.trim().replace(/\s+/g, ' ').slice(0, MAX_NOTE_LENGTH);

const parseStore = (raw: string | null): HoleNotesStore => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? (parsed as HoleNotesStore) : {};
  } catch (error) {
    logger.warn('Failed to parse hole notes store, resetting', error);
    return {};
  }
};

const readStore = async (): Promise<HoleNotesStore> => {
  const raw = await Storage.getItem(HOLE_NOTES_KEY);
  return parseStore(raw);
};

const writeStore = async (store: HoleNotesStore) => {
  await Storage.setItem(HOLE_NOTES_KEY, JSON.stringify(store));
};

const noteDateLabel = (isoString: string) =>
  new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const byNewest = (a: HoleNote, b: HoleNote) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export const getHoleNotes = async (courseId: string, holeNumber: number): Promise<HoleNote[]> => {
  if (!courseId || !Number.isInteger(holeNumber) || holeNumber < 1) return [];
  const store = await readStore();
  return [...(store[storeKey(courseId, holeNumber)] || [])].sort(byNewest);
};

export const getCourseHoleNotes = async (courseId: string): Promise<HoleNote[]> => {
  if (!courseId) return [];
  const store = await readStore();
  const notes = Object.entries(store)
    .filter(([key]) => key.startsWith(`${courseId}::`))
    .flatMap(([, items]) => items);
  return notes.sort(byNewest);
};

export const saveHoleNote = async (params: {
  courseId: string;
  holeNumber: number;
  text: string;
  roundId?: string | null;
  roundDate?: string | null;
}): Promise<HoleNote | null> => {
  const courseId = (params.courseId || '').trim();
  const holeNumber = Number(params.holeNumber);
  const text = normalizeText(params.text || '');
  if (!courseId || !Number.isInteger(holeNumber) || holeNumber < 1 || !text) return null;

  const now = new Date().toISOString();
  const note: HoleNote = {
    id: `hn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    courseId,
    holeNumber,
    text,
    createdAt: now,
    roundId: params.roundId ?? null,
    roundDate: params.roundDate ?? noteDateLabel(now),
  };

  const store = await readStore();
  const key = storeKey(courseId, holeNumber);
  const next = [note, ...(store[key] || [])].sort(byNewest);
  store[key] = next;
  await writeStore(store);
  return note;
};

export const deleteHoleNote = async (id: string): Promise<boolean> => {
  if (!id) return false;
  const store = await readStore();
  let changed = false;

  Object.keys(store).forEach((key) => {
    const next = (store[key] || []).filter(note => note.id !== id);
    if (next.length !== (store[key] || []).length) {
      changed = true;
      if (next.length) store[key] = next;
      else delete store[key];
    }
  });

  if (!changed) return false;
  await writeStore(store);
  return true;
};

export const getRecentHoleNote = async (
  courseId: string,
  holeNumber: number,
  maxAgeDays = 180
): Promise<HoleNote | null> => {
  const notes = await getHoleNotes(courseId, holeNumber);
  if (!notes.length) return null;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const recent = notes.find(note => new Date(note.createdAt).getTime() >= cutoff);
  return recent || null;
};

