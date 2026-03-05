import { useCallback, useMemo } from 'react';
import type { UserProfile } from '../../../types';

type MarkingStyle = 'arrows' | 'check-x' | 'yes-no';
export type DirectionalValue = boolean | 'left' | 'right' | 'short' | 'long' | null;

interface Params {
  userProfile: UserProfile | null;
  fairways: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  greens: Array<boolean | 'left' | 'right' | 'short' | 'long' | null>;
  lockArrayIndex: (field: 'upDowns' | 'fairways' | 'greens', index: number) => void;
  setFocusedHoleIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setUpDowns: React.Dispatch<React.SetStateAction<Array<boolean | null>>>;
  setFairways: React.Dispatch<React.SetStateAction<Array<boolean | 'left' | 'right' | 'short' | 'long' | null>>>;
  setGreens: React.Dispatch<React.SetStateAction<Array<boolean | 'left' | 'right' | 'short' | 'long' | null>>>;
}

export function useFlagInput(params: Params) {
  const defaultMarking: MarkingStyle = params.userProfile?.scoringMode
    ? (params.userProfile.scoringMode === 'advanced' ? 'arrows' : 'check-x')
    : 'arrows';
  const fairwayMarking = params.userProfile?.scoringPreferences?.fairwayMarking ?? defaultMarking;
  const greenMarking = params.userProfile?.scoringPreferences?.greenMarking ?? defaultMarking;
  const fairwayEditMode: 'cycle' | 'picker' = fairwayMarking === 'arrows' ? 'picker' : 'cycle';
  const greenEditMode: 'cycle' | 'picker' = greenMarking === 'arrows' ? 'picker' : 'cycle';
  const fairwaySymbols = params.userProfile?.scoringPreferences?.fairwaySymbols ?? {
    hit: '✓',
    missRight: '→',
    missLeft: '←',
    notApplicable: '-',
  };
  const greenSymbols = params.userProfile?.scoringPreferences?.greenSymbols ?? {
    hit: '✓',
    missShort: '↓',
    missLong: '↑',
    missRight: '→',
    missLeft: '←',
  };

  const getFlagMissSymbol = useCallback((field: 'fairway' | 'green', marking: MarkingStyle) => {
    if (marking === 'arrows') return 'X';
    if (field === 'fairway') return fairwaySymbols.missLeft || 'X';
    return greenSymbols.missLeft || 'X';
  }, [fairwaySymbols.missLeft, greenSymbols.missLeft]);

  const getFlagSymbol = useCallback((field: 'fairway' | 'green', value: DirectionalValue) => {
    const marking = field === 'fairway' ? fairwayMarking : greenMarking;
    if (value === true) return field === 'fairway' ? fairwaySymbols.hit || '✓' : greenSymbols.hit || '✓';
    if (value === false) return getFlagMissSymbol(field, marking);
    if (value === 'left') return field === 'fairway' ? fairwaySymbols.missLeft || '←' : greenSymbols.missLeft || '←';
    if (value === 'right') return field === 'fairway' ? fairwaySymbols.missRight || '→' : greenSymbols.missRight || '→';
    if (value === 'short') return field === 'green' ? greenSymbols.missShort || '↓' : '↓';
    if (value === 'long') return field === 'green' ? greenSymbols.missLong || '↑' : '↑';
    return field === 'fairway' ? fairwaySymbols.notApplicable || '–' : '–';
  }, [fairwayMarking, greenMarking, fairwaySymbols, greenSymbols, getFlagMissSymbol]);

  const decodeFlagValue = useCallback((value: string): DirectionalValue => {
    if (value === 'hit') return true;
    if (value === 'miss') return false;
    if (value === 'left') return 'left';
    if (value === 'right') return 'right';
    if (value === 'short') return 'short';
    if (value === 'long') return 'long';
    return null;
  }, []);

  const getFlagChipOptions = useCallback((field: 'fairway' | 'green') => {
    const marking = field === 'fairway' ? fairwayMarking : greenMarking;
    const missSymbol = getFlagMissSymbol(field, marking);
    const options = [
      { value: 'hit', label: getFlagSymbol(field, true) },
      { value: 'miss', label: missSymbol },
    ];
    if (marking === 'arrows') {
      options.push(
        { value: 'left', label: getFlagSymbol(field, 'left') },
        { value: 'right', label: getFlagSymbol(field, 'right') },
        { value: 'short', label: getFlagSymbol(field, 'short') },
        { value: 'long', label: getFlagSymbol(field, 'long') },
      );
    }
    options.push({ value: 'na', label: getFlagSymbol(field, null) });
    return options;
  }, [fairwayMarking, greenMarking, getFlagMissSymbol, getFlagSymbol]);

  const cycleTriState = useCallback((value: boolean | null) => {
    if (value === null) return true;
    if (value === true) return false;
    return null;
  }, []);

  const toggleUpDown = useCallback((index: number) => {
    params.setFocusedHoleIndex(index);
    params.lockArrayIndex('upDowns', index);
    params.setUpDowns(prev => {
      const next = [...prev];
      next[index] = cycleTriState(prev[index]);
      return next;
    });
  }, [cycleTriState, params]);

  const setPlayerFlag = useCallback((index: number, field: 'fairway' | 'green', value: DirectionalValue) => {
    params.setFocusedHoleIndex(index);
    if (field === 'fairway') {
      params.lockArrayIndex('fairways', index);
      params.setFairways(prev => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
      return;
    }
    params.lockArrayIndex('greens', index);
    params.setGreens(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, [params]);

  const toggleFlag = useCallback((index: number, field: 'fairway' | 'green') => {
    const current = field === 'fairway' ? params.fairways[index] : params.greens[index];
    const next = cycleTriState(current === null ? null : current === true ? true : false);
    const mapped: DirectionalValue = next === null ? null : next === true ? true : false;
    setPlayerFlag(index, field, mapped);
  }, [cycleTriState, params.fairways, params.greens, setPlayerFlag]);

  const renderArrowValue = useCallback((
    value: DirectionalValue,
    disabled = false,
    field: 'fairway' | 'green' = 'fairway'
  ) => {
    if (disabled) return '–';
    return getFlagSymbol(field, value);
  }, [getFlagSymbol]);

  return useMemo(() => ({
    fairwayEditMode,
    greenEditMode,
    decodeFlagValue,
    getFlagChipOptions,
    toggleUpDown,
    toggleFlag,
    setPlayerFlag,
    renderArrowValue,
  }), [
    fairwayEditMode,
    greenEditMode,
    decodeFlagValue,
    getFlagChipOptions,
    toggleUpDown,
    toggleFlag,
    setPlayerFlag,
    renderArrowValue,
  ]);
}

