import { useEffect, useState } from 'react';
import { getUserProfile } from '../../../services/userService';
import { getDefaultProfile } from '../../../types';
import type { UserProfile } from '../../../types';
import { logger } from '../../../utils/logger';

interface UseScoreEntryProfileResult {
  userProfile: UserProfile | null;
  availableClubs: string[];
  clubDistances: Record<string, number>;
  viewMode: 'basic' | 'advanced';
  reloadProfile: () => Promise<void>;
}

export const useScoreEntryProfile = (): UseScoreEntryProfileResult => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [availableClubs, setAvailableClubs] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'basic' | 'advanced'>('basic');

  const loadUserProfile = async () => {
    try {
      const profile = await getUserProfile();
      logger.debug('Loaded user profile:', {
        scoringMode: profile.scoringMode,
        trackFairways: profile.scoringPreferences?.trackFairways,
        trackGreens: profile.scoringPreferences?.trackGreens,
        trackUpAndDown: profile.scoringPreferences?.trackUpDown,
      });
      setUserProfile(profile);

      const clubs: string[] = [];
      if (profile.bag?.driver) clubs.push('Driver');
      if (profile.bag?.woods) clubs.push(...profile.bag.woods);
      if (profile.bag?.hybrids) clubs.push(...profile.bag.hybrids);
      if (profile.bag?.irons) clubs.push(...profile.bag.irons);
      if (profile.bag?.wedges) clubs.push(...profile.bag.wedges);
      if (profile.bag?.putter) clubs.push('Putter');

      if (clubs.length === 0) {
        clubs.push('Driver', '3W', '5W', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW', 'Putter');
      }

      setAvailableClubs(clubs);
      setViewMode(profile.scoringMode || 'basic');
      logger.debug('View mode set to:', profile.scoringMode || 'basic');
    } catch (error) {
      logger.warn('Failed to load user profile, using defaults:', error);
      const defaultProfile = getDefaultProfile();
      setUserProfile(defaultProfile);
      setAvailableClubs(['Putter', 'LW', 'SW', 'GW', 'PW', '9i', '8i', '7i', '6i', '5i', '5W', '3W', 'Driver']);
      setViewMode('basic');
    }
  };

  useEffect(() => {
    loadUserProfile();
  }, []);

  return {
    userProfile,
    availableClubs,
    clubDistances: userProfile?.clubDistances ?? {},
    viewMode,
    reloadProfile: loadUserProfile,
  };
};
