import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = '@GolfSum:InsightHistory';

export interface InsightHistoryEntry {
  signature: string;
  roundId: string;
  shownAt: number;
}

async function getStorageItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return await AsyncStorage.getItem(key);
}

async function setStorageItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function getInsightHistory(): Promise<InsightHistoryEntry[]> {
  try {
    const raw = await getStorageItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InsightHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function recordInsightHistory(entries: InsightHistoryEntry[]): Promise<void> {
  const existing = await getInsightHistory();
  const merged = [...entries, ...existing];
  const trimmed = merged.slice(0, 200);
  await setStorageItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function buildInsightSignature(input: {
  type: string;
  title?: string;
  patternObserved?: string;
  description?: string;
}): string {
  const parts = [input.type, input.title || '', input.patternObserved || '', input.description || ''];
  return parts.join('|').toLowerCase();
}
