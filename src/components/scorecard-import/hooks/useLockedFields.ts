import { useEffect, useMemo } from 'react';
import type { EditableTeeBox, LockedFields, LockedTeeFields } from '../types';
import { buildLockedTeeFields } from '../utils';

interface Params {
  teeBoxes: EditableTeeBox[];
  lockedFields: LockedFields;
  setLockedFields: React.Dispatch<React.SetStateAction<LockedFields>>;
}

export function useLockedFields(params: Params) {
  useEffect(() => {
    if (params.teeBoxes.length === 0) return;
    params.setLockedFields(prev => {
      const nextTees = { ...prev.tees };
      let changed = false;
      params.teeBoxes.forEach(tee => {
        if (!nextTees[tee.id]) {
          nextTees[tee.id] = buildLockedTeeFields();
          changed = true;
        }
      });
      if (!changed) return prev;
      return { ...prev, tees: nextTees };
    });
  }, [params]);

  const api = useMemo(() => {
    const ensureTeeLocks = (teeId: string) => {
      if (params.lockedFields.tees[teeId]) return params.lockedFields.tees[teeId];
      const next = buildLockedTeeFields();
      params.setLockedFields(prev => ({
        ...prev,
        tees: {
          ...prev.tees,
          [teeId]: next,
        },
      }));
      return next;
    };

    const lockArrayIndex = (field: keyof LockedFields, index: number) => {
      params.setLockedFields(prev => {
        const existing = prev[field] as boolean[] | undefined;
        if (!existing) return prev;
        if (existing[index]) return prev;
        const nextArray = [...existing];
        nextArray[index] = true;
        return { ...prev, [field]: nextArray };
      });
    };

    const lockScalarField = (field: keyof LockedFields) => {
      params.setLockedFields(prev => (prev[field] ? prev : { ...prev, [field]: true }));
    };

    const lockTeeField = (teeId: string, field: keyof LockedTeeFields) => {
      params.setLockedFields(prev => {
        const existing = prev.tees[teeId] || buildLockedTeeFields();
        if (field === 'yardages') return prev;
        if (existing[field]) return prev;
        return {
          ...prev,
          tees: {
            ...prev.tees,
            [teeId]: {
              ...existing,
              [field]: true,
            },
          },
        };
      });
    };

    const lockTeeYardageIndex = (teeId: string, index: number) => {
      params.setLockedFields(prev => {
        const existing = prev.tees[teeId] || buildLockedTeeFields();
        if (existing.yardages[index]) return prev;
        const nextYardages = [...existing.yardages];
        nextYardages[index] = true;
        return {
          ...prev,
          tees: {
            ...prev.tees,
            [teeId]: {
              ...existing,
              yardages: nextYardages,
            },
          },
        };
      });
    };

    return {
      ensureTeeLocks,
      lockArrayIndex,
      lockScalarField,
      lockTeeField,
      lockTeeYardageIndex,
    };
  }, [params.lockedFields.tees, params.setLockedFields]);

  return api;
}

