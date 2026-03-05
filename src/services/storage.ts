/**
 * Cross-platform storage service
 * - Uses AsyncStorage on iOS/Android
 * - Uses localStorage on web
 * - Provides consistent API across all platforms
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

// Web localStorage wrapper that matches AsyncStorage API
const webStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      logger.error('localStorage.getItem error:', error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch (error: unknown) {
      const isQuotaError =
        error instanceof Error &&
        (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      if (isQuotaError) {
        logger.warn('localStorage quota exceeded. Attempting eviction...');
        const keysToEvict = Object.keys(localStorage).filter(k =>
          k.includes(':cache:') || k.includes(':temp:')
        );
        keysToEvict.forEach(k => localStorage.removeItem(k));
        try {
          localStorage.setItem(key, value);
          logger.debug('localStorage write succeeded after eviction');
          return;
        } catch (retryError) {
          logger.error('localStorage write failed after eviction:', retryError);
        }
      }
      logger.error('localStorage.setItem error:', error);
      throw error;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      logger.error('localStorage.removeItem error:', error);
      throw error;
    }
  },

  async getAllKeys(): Promise<string[]> {
    try {
      return Object.keys(localStorage);
    } catch (error) {
      logger.error('localStorage.getAllKeys error:', error);
      return [];
    }
  },

  async multiGet(keys: string[]): Promise<[string, string | null][]> {
    try {
      return keys.map(key => [key, localStorage.getItem(key)]);
    } catch (error) {
      logger.error('localStorage.multiGet error:', error);
      return keys.map(key => [key, null]);
    }
  },

  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    try {
      keyValuePairs.forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
    } catch (error) {
      logger.error('localStorage.multiSet error:', error);
      throw error;
    }
  },

  async multiRemove(keys: string[]): Promise<void> {
    try {
      keys.forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      logger.error('localStorage.multiRemove error:', error);
      throw error;
    }
  },

  async clear(): Promise<void> {
    try {
      localStorage.clear();
    } catch (error) {
      logger.error('localStorage.clear error:', error);
      throw error;
    }
  },

  async clearNamespace(prefix: string): Promise<void> {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
      keys.forEach(k => localStorage.removeItem(k));
    } catch (error) {
      logger.error('localStorage.clearNamespace error:', error);
      throw error;
    }
  },
};

// Export the appropriate storage implementation based on platform
const Storage = Platform.OS === 'web' ? webStorage : AsyncStorage;

export default Storage;

export async function clearStorageNamespace(prefix: string): Promise<void> {
  const keys = await Storage.getAllKeys();
  const filtered = keys.filter(key => key.startsWith(prefix));
  if (filtered.length === 0) return;
  await Storage.multiRemove(filtered);
}

// Re-export common types for convenience
export type StorageValue = string | null;
export type StorageKeyValuePair = [string, string];
export type StorageMultiGetReturn = [string, string | null][];
