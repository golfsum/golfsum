import { useEffect, useState } from 'react';
import Storage from '../services/storage';
import { getUserProfile } from '../services/userService';
import { logger } from '../utils/logger';

const PROFILE_STORAGE_KEY = '@GolfSum:UserProfile';

export const useScorecardColorPreference = () => {
  const [scorecardColorsEnabled, setScorecardColorsEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const stored = await Storage.getItem(PROFILE_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (mounted) {
            setScorecardColorsEnabled(parsed?.scoringPreferences?.scorecardColorsEnabled !== false);
          }
          return;
        }
        const profile = await getUserProfile();
        if (mounted) {
          setScorecardColorsEnabled(profile?.scoringPreferences?.scorecardColorsEnabled !== false);
        }
      } catch (error) {
        logger.warn('Failed to load scorecard color preference', error);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return { scorecardColorsEnabled };
};

