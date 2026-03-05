import { useState } from 'react';
import type { InputType, ImportSection, LockedFields } from '../types';
import type { UserProfile } from '../../../types';
import { buildDefaultArray, buildDefaultLockedFields } from '../utils';

export function useImportPlayerState() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lockedFields, setLockedFields] = useState<LockedFields>(() => buildDefaultLockedFields());
  const [playerName, setPlayerName] = useState('');
  const [playerDate, setPlayerDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [profilePlayerName, setProfilePlayerName] = useState('');
  const [playerNameCandidates, setPlayerNameCandidates] = useState<string[]>([]);
  const [showPlayerNamePicker, setShowPlayerNamePicker] = useState(false);
  const [scores, setScores] = useState<string[]>(buildDefaultArray());
  const [putts, setPutts] = useState<string[]>(buildDefaultArray());
  const [fairways, setFairways] = useState<Array<boolean | 'left' | 'right' | 'short' | 'long' | null>>(
    Array.from({ length: 18 }, () => null)
  );
  const [greens, setGreens] = useState<Array<boolean | 'left' | 'right' | 'short' | 'long' | null>>(
    Array.from({ length: 18 }, () => null)
  );
  const [upDowns, setUpDowns] = useState<Array<boolean | null>>(Array.from({ length: 18 }, () => null));
  const [penalties, setPenalties] = useState<string[]>(buildDefaultArray());
  const [keypadVisible, setKeypadVisible] = useState(false);
  const [keypadMode, setKeypadMode] = useState<'chips' | 'keypad'>('chips');
  const [playerNineView, setPlayerNineView] = useState<'front' | 'back'>('front');
  const [focusedHoleIndex, setFocusedHoleIndex] = useState<number | null>(null);
  const [showAllStatsColumns, setShowAllStatsColumns] = useState(false);
  const [keypadField, setKeypadField] = useState<{
    index?: number;
    field: InputType;
  } | null>(null);
  const [keypadIsFirstDigit, setKeypadIsFirstDigit] = useState(true);
  const [keypadValue, setKeypadValue] = useState('');
  const [keypadInitialValue, setKeypadInitialValue] = useState('');
  const [showDeferredSections, setShowDeferredSections] = useState(false);
  const [activeSection, setActiveSection] = useState<ImportSection>('photo');
  return {
    userProfile,
    setUserProfile,
    isProcessing,
    setIsProcessing,
    lockedFields,
    setLockedFields,
    playerName,
    setPlayerName,
    playerDate,
    setPlayerDate,
    profilePlayerName,
    setProfilePlayerName,
    playerNameCandidates,
    setPlayerNameCandidates,
    showPlayerNamePicker,
    setShowPlayerNamePicker,
    scores,
    setScores,
    putts,
    setPutts,
    fairways,
    setFairways,
    greens,
    setGreens,
    upDowns,
    setUpDowns,
    penalties,
    setPenalties,
    keypadVisible,
    setKeypadVisible,
    keypadMode,
    setKeypadMode,
    playerNineView,
    setPlayerNineView,
    focusedHoleIndex,
    setFocusedHoleIndex,
    showAllStatsColumns,
    setShowAllStatsColumns,
    keypadField,
    setKeypadField,
    keypadIsFirstDigit,
    setKeypadIsFirstDigit,
    keypadValue,
    setKeypadValue,
    keypadInitialValue,
    setKeypadInitialValue,
    showDeferredSections,
    setShowDeferredSections,
    activeSection,
    setActiveSection,
  };
}
