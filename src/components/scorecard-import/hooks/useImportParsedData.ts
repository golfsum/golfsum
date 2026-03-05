import { useCallback } from 'react';
import type { LockedFields, ParsedScorecardData, RoundSummary, EditableTeeBox } from '../types';
import { splitNameCandidates } from '../utils';
import {
  buildRoundSummaryFromData,
  ensureLockedTeeEntries,
  mergeLockedArrayValues,
  mergeLockedFairways,
  mergeLockedStringValues,
  mergeParsedTees,
} from './useImportParsedData.helpers';

type DirectionalValue = boolean | 'left' | 'right' | 'short' | 'long' | null;

interface Params {
  lockedFields: LockedFields;
  teeBoxes: EditableTeeBox[];
  pars: string[];
  fairways: DirectionalValue[];
  greens: DirectionalValue[];
  scores: string[];
  putts: string[];
  penalties: string[];
  playerName: string;
  profilePlayerName: string;
  setPars: React.Dispatch<React.SetStateAction<string[]>>;
  setHcpMen: React.Dispatch<React.SetStateAction<string[]>>;
  setHcpWomen: React.Dispatch<React.SetStateAction<string[]>>;
  setPlayerNameCandidates: React.Dispatch<React.SetStateAction<string[]>>;
  setShowPlayerNamePicker: React.Dispatch<React.SetStateAction<boolean>>;
  setPlayerName: React.Dispatch<React.SetStateAction<string>>;
  setPlayerDate: React.Dispatch<React.SetStateAction<string>>;
  setScores: React.Dispatch<React.SetStateAction<string[]>>;
  setPutts: React.Dispatch<React.SetStateAction<string[]>>;
  setFairways: React.Dispatch<React.SetStateAction<DirectionalValue[]>>;
  setGreens: React.Dispatch<React.SetStateAction<DirectionalValue[]>>;
  setUpDowns: React.Dispatch<React.SetStateAction<Array<boolean | null>>>;
  setPenalties: React.Dispatch<React.SetStateAction<string[]>>;
  setTeeBoxes: React.Dispatch<React.SetStateAction<EditableTeeBox[]>>;
  setActiveTeeIndex: React.Dispatch<React.SetStateAction<number>>;
  setLockedFields: React.Dispatch<React.SetStateAction<LockedFields>>;
}

export function useImportParsedData(params: Params) {
  const applyParsedData = useCallback((parsed: ParsedScorecardData) => {
    if (parsed.par) {
      params.setPars(prev => mergeLockedStringValues({
        current: prev,
        locked: params.lockedFields.pars,
        incoming: parsed.par,
      }));
    }
    if (parsed.handicapMen) {
      params.setHcpMen(prev => mergeLockedStringValues({
        current: prev,
        locked: params.lockedFields.hcpMen,
        incoming: parsed.handicapMen,
      }));
    }
    if (parsed.handicapWomen) {
      params.setHcpWomen(prev => mergeLockedStringValues({
        current: prev,
        locked: params.lockedFields.hcpWomen,
        incoming: parsed.handicapWomen,
      }));
    }

    if (parsed.playerName && !params.lockedFields.playerName) {
      const candidates = splitNameCandidates(parsed.playerName);
      if (candidates.length > 1) {
        params.setPlayerNameCandidates(candidates);
        params.setShowPlayerNamePicker(true);
        params.setPlayerName(params.profilePlayerName || candidates[0]);
      } else {
        params.setPlayerNameCandidates([]);
        params.setPlayerName(parsed.playerName);
      }
    } else if (!parsed.playerName) {
      params.setPlayerNameCandidates([]);
      if (!params.lockedFields.playerName && params.profilePlayerName && !params.playerName) {
        params.setPlayerName(params.profilePlayerName);
      }
    }
    if (parsed.playerDate) {
      if (!params.lockedFields.playerDate) {
        params.setPlayerDate(parsed.playerDate);
      }
    }
    if (parsed.playerScores) {
      params.setScores(prev => mergeLockedStringValues({
        current: prev,
        locked: params.lockedFields.scores,
        incoming: parsed.playerScores,
      }));
    }
    if (parsed.playerPutts) {
      params.setPutts(prev => mergeLockedStringValues({
        current: prev,
        locked: params.lockedFields.putts,
        incoming: parsed.playerPutts,
      }));
    }
    if (parsed.playerFairways) {
      params.setFairways(prev => mergeLockedFairways(
        prev,
        params.lockedFields.fairways,
        parsed.playerFairways || [],
        parsed.par,
        params.pars
      ));
    }
    if (parsed.playerGreens) {
      params.setGreens(prev => mergeLockedArrayValues({
        current: prev,
        locked: params.lockedFields.greens,
        incoming: parsed.playerGreens,
      }));
    }
    if (parsed.playerUpDowns) {
      params.setUpDowns(prev => mergeLockedArrayValues({
        current: prev,
        locked: params.lockedFields.upDowns,
        incoming: parsed.playerUpDowns,
      }));
    }
    if (parsed.playerPenalties) {
      params.setPenalties(prev => mergeLockedStringValues({
        current: prev,
        locked: params.lockedFields.penalties,
        incoming: parsed.playerPenalties,
      }));
    }

    const mergedTeeBoxes = mergeParsedTees({
      parsed,
      teeBoxes: params.teeBoxes,
      lockedFields: params.lockedFields,
    });
    if (mergedTeeBoxes.length > 0) {
      params.setTeeBoxes(mergedTeeBoxes);
      params.setActiveTeeIndex(0);
      params.setLockedFields(prev => {
        return ensureLockedTeeEntries(prev, mergedTeeBoxes);
      });
    }
  }, [params]);

  const buildRoundSummary = useCallback((parsed?: ParsedScorecardData): RoundSummary | null => {
    return buildRoundSummaryFromData({
      parsed,
      playerName: params.playerName,
      scores: params.scores,
      pars: params.pars,
      putts: params.putts,
      penalties: params.penalties,
      fairways: params.fairways,
      greens: params.greens,
    });
  }, [params.fairways, params.greens, params.pars, params.penalties, params.playerName, params.putts, params.scores]);

  return { applyParsedData, buildRoundSummary };
}
