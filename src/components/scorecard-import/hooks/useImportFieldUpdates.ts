import { useCallback } from 'react';
import type { InputType } from '../types';
import type { EditableTeeBox } from '../types';

interface Params {
  activeTeeIndex: number;
  activeTeeId?: string;
  setPars: React.Dispatch<React.SetStateAction<string[]>>;
  setHcpMen: React.Dispatch<React.SetStateAction<string[]>>;
  setHcpWomen: React.Dispatch<React.SetStateAction<string[]>>;
  setTeeBoxes: React.Dispatch<React.SetStateAction<EditableTeeBox[]>>;
  setScores: React.Dispatch<React.SetStateAction<string[]>>;
  setPutts: React.Dispatch<React.SetStateAction<string[]>>;
  setPenalties: React.Dispatch<React.SetStateAction<string[]>>;
  lockArrayIndex: (field: 'pars' | 'hcpMen' | 'hcpWomen' | 'scores' | 'putts' | 'penalties', index: number) => void;
  lockTeeYardageIndex: (teeId: string, index: number) => void;
}

export function useImportFieldUpdates(params: Params) {
  const updateHoleValue = useCallback((
    index: number,
    field: 'par' | 'hcpMen' | 'hcpWomen' | 'yardage',
    value: string
  ) => {
    if (field === 'par') {
      params.lockArrayIndex('pars', index);
      params.setPars(prev => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
      return;
    }
    if (field === 'hcpMen') {
      params.lockArrayIndex('hcpMen', index);
      params.setHcpMen(prev => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
      return;
    }
    if (field === 'hcpWomen') {
      params.lockArrayIndex('hcpWomen', index);
      params.setHcpWomen(prev => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
      return;
    }
    if (params.activeTeeId) {
      params.lockTeeYardageIndex(params.activeTeeId, index);
    }
    params.setTeeBoxes(prev => {
      const next = [...prev];
      const tee = { ...next[params.activeTeeIndex] };
      const yardages = [...tee.yardages];
      yardages[index] = value;
      tee.yardages = yardages;
      next[params.activeTeeIndex] = tee;
      return next;
    });
  }, [params]);

  const updatePlayerValue = useCallback((
    index: number,
    field: 'score' | 'putts' | 'penalties'
  ) => (value: string) => {
    if (field === 'score') {
      params.lockArrayIndex('scores', index);
      params.setScores(prev => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
      return;
    }
    if (field === 'putts') {
      params.lockArrayIndex('putts', index);
      params.setPutts(prev => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
      return;
    }
    params.lockArrayIndex('penalties', index);
    params.setPenalties(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, [params]);

  return { updateHoleValue, updatePlayerValue };
}

