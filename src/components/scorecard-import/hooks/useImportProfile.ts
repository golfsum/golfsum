import { useEffect } from 'react';
import { getUserProfile } from '../../../services/userService';
import { getCurrentUser } from '../../../services/firebaseAuthService';
import { logger } from '../../../utils/logger';
import type { UserProfile } from '../../../types';

interface Params {
  lockedPlayerName: boolean;
  playerName: string;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  setProfilePlayerName: React.Dispatch<React.SetStateAction<string>>;
  setPlayerName: React.Dispatch<React.SetStateAction<string>>;
}

export function useImportProfile(params: Params) {
  const {
    lockedPlayerName,
    playerName,
    setUserProfile,
    setProfilePlayerName,
    setPlayerName,
  } = params;

  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      try {
        const profile = await getUserProfile();
        if (!isMounted) return;
        setUserProfile(profile);
        const authDisplayName = getCurrentUser()?.displayName || '';
        const name = profile?.personalInfo?.name
          || profile?.personalInfo?.nickname
          || profile?.personalInfo?.initials
          || authDisplayName
          || '';
        if (name) {
          setProfilePlayerName(name);
          if (!lockedPlayerName && !playerName) {
            setPlayerName(name);
          }
        }
      } catch (error) {
        logger.warn('Failed to load profile name:', error);
      }
    };
    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [lockedPlayerName, playerName, setPlayerName, setProfilePlayerName, setUserProfile]);
}
