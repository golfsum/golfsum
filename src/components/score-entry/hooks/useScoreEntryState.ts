import { useEffect, useMemo, useState, type SetStateAction } from 'react';
import type { CourseDetails, TeeBox } from '../../../services/golfCourseApiService';
import Storage from '../../../services/storage';
import {
  saveInProgressRound,
  type InProgressRoundDraft,
  type InProgressHole,
} from '../../../services/inProgressRoundService';
import { useHoleNavigation } from './useHoleNavigation';
import { applyGpsHoleSummaries, createInitialHoles, mergeDraftHoles } from '../scoreEntryUtils';
import type { HoleScore } from '../types';
import type { PendingGpsRoundData } from '../../../types';
import { logger } from '../../../utils/logger';

interface UseScoreEntryStateOptions {
  course: CourseDetails | null;
  courseId: string;
  quickStart?: {
    teeName?: string;
    startingHole?: number;
    endingHole?: number;
    roundLength?: '18' | 'front9' | 'back9';
    routeHoleNumbers?: number[];
    routeLabel?: string;
  };
  gpsRoundData?: PendingGpsRoundData | null;
  defaultTeeName?: string;
  resumeDraft?: InProgressRoundDraft | null;
  showTeeSelection: boolean;
  setShowTeeSelection: (value: boolean) => void;
  courseOverride?: CourseDetails;
}

const applyRouteToTeeBox = (
  teeBox: TeeBox,
  routeHoleNumbers?: number[],
): TeeBox => {
  if (!Array.isArray(routeHoleNumbers) || routeHoleNumbers.length === 0) {
    return teeBox;
  }

  const holeMap = new Map(teeBox.holes.map((hole) => [Number(hole.hole), hole]));
  const routedHoles = routeHoleNumbers
    .map((holeNumber) => holeMap.get(Number(holeNumber)))
    .filter((hole): hole is NonNullable<typeof hole> => !!hole)
    .map((hole, index) => ({
      ...hole,
      hole: index + 1,
    }));

  if (!routedHoles.length) {
    return teeBox;
  }

  return {
    ...teeBox,
    holes: routedHoles,
    yardage: routedHoles.reduce((sum, hole) => sum + (hole.yardage || 0), 0),
  };
};

interface UseScoreEntryStateResult {
  selectedTeeBox: TeeBox | null;
  setSelectedTeeBox: (tee: TeeBox | null) => void;
  holes: HoleScore[];
  setHoles: (holes: SetStateAction<HoleScore[]>) => void;
  startingHole: number;
  setStartingHole: (value: number) => void;
  startType: 'standard' | 'shotgun';
  setStartType: (value: 'standard' | 'shotgun') => void;
  holeOrder: number[];
  currentHole: number;
  setCurrentHole: (value: number) => void;
  goToHole: (value: number) => void;
  nextHole: () => void;
  prevHole: () => void;
  firstHoleIndex: number;
  lastHoleIndex: number;
  handleTeeBoxSelected: (teeBox: TeeBox) => void;
  startRoundWithTee: (teeBox: TeeBox, holeNumber: number) => void;
}

export const useScoreEntryState = ({
  course,
  courseId,
  quickStart,
  gpsRoundData,
  defaultTeeName,
  resumeDraft,
  showTeeSelection,
  setShowTeeSelection,
  courseOverride,
}: UseScoreEntryStateOptions): UseScoreEntryStateResult => {
  const [selectedTeeBox, setSelectedTeeBox] = useState<TeeBox | null>(null);
  const [holes, setHoles] = useState<HoleScore[]>([]);
  const [startingHole, setStartingHole] = useState(1);
  const [startType, setStartType] = useState<'standard' | 'shotgun'>('standard');
  const [resumeApplied, setResumeApplied] = useState(false);
  const activeRouteHoleNumbers = gpsRoundData?.routeHoleNumbers ?? quickStart?.routeHoleNumbers;

  const holeOrder = useMemo(() => {
    const holeCount = holes.length;
    if (!holeCount) return [];
    if (startType !== 'standard' || startingHole <= 1) {
      return Array.from({ length: holeCount }, (_, idx) => idx);
    }
    const startIndex = Math.max(0, Math.min(holeCount - 1, startingHole - 1));
    return [
      ...Array.from({ length: holeCount - startIndex }, (_, idx) => startIndex + idx),
      ...Array.from({ length: startIndex }, (_, idx) => idx),
    ];
  }, [holes.length, startType, startingHole]);

  const {
    currentHole,
    setCurrentHole,
    goToHole,
    nextHole,
    prevHole,
  } = useHoleNavigation({
    holeCount: holes.length,
    initialHoleIndex: Math.max(0, Math.min(holes.length - 1, startingHole - 1)),
    holeOrder: holeOrder.length === holes.length ? holeOrder : undefined,
  });

  const firstHoleIndex = holeOrder.length > 0 ? holeOrder[0] : 0;
  const lastHoleIndex = holeOrder.length > 0 ? holeOrder[holeOrder.length - 1] : Math.max(0, holes.length - 1);

  useEffect(() => {
    if (!course || selectedTeeBox || !showTeeSelection) return;
    let isMounted = true;

    const loadDefaultTee = async () => {
      try {
        const savedDefault = await Storage.getItem(`@GolfSum:defaultTee:${course.id}`);
        if (!isMounted) return;
        if (savedDefault) {
          const { teeName } = JSON.parse(savedDefault) as { teeName?: string };
          const defaultTee = teeName
            ? course.teeBoxes.find(tee => tee.name === teeName)
            : undefined;
          if (defaultTee) {
            setSelectedTeeBox(defaultTee);
            return;
          }
        }
        if (defaultTeeName && defaultTeeName.toLowerCase() !== 'always ask') {
          const preferred = course.teeBoxes.find(
            tee => tee.name.toLowerCase() === defaultTeeName.toLowerCase()
          );
          if (preferred) {
            setSelectedTeeBox(preferred);
            return;
          }
        }
        if (course.teeBoxes?.length) {
          setSelectedTeeBox(course.teeBoxes[0]);
        }
      } catch (error) {
        logger.warn('Failed to load default tee box:', error);
      }
    };

    loadDefaultTee();
    return () => {
      isMounted = false;
    };
  }, [course, selectedTeeBox, showTeeSelection]);

  const startRoundWithTee = (teeBox: TeeBox, holeNumber: number) => {
    const routedTeeBox = applyRouteToTeeBox(teeBox, activeRouteHoleNumbers);
    const holeCount = routedTeeBox.holes.length;
    const nextStartingHole = Math.max(1, Math.min(holeCount || 1, holeNumber));
    setSelectedTeeBox(routedTeeBox);
    setStartType('standard');
    setStartingHole(nextStartingHole);
    setShowTeeSelection(false);

    const initialHoles = applyGpsHoleSummaries(createInitialHoles(routedTeeBox), gpsRoundData?.gpsHoleSummaries);
    const nextCurrentIndex = initialHoles.findIndex((hole) => hole.hole === nextStartingHole);
    setCurrentHole(nextCurrentIndex >= 0 ? nextCurrentIndex : 0);
    setHoles(initialHoles);
  };

  const handleTeeBoxSelected = (teeBox: TeeBox) => {
    if (!teeBox || !teeBox.holes || teeBox.holes.length === 0) {
      return;
    }

    if (course?.id) {
      Storage.setItem(`@GolfSum:defaultTee:${course.id}`, JSON.stringify({ teeName: teeBox.name }))
        .catch(error => logger.warn('Failed to save default tee box:', error));
    }

    startRoundWithTee(teeBox, startingHole);
  };

  useEffect(() => {
    if (resumeDraft) return;
    if (!course || !course.teeBoxes || !showTeeSelection) return;
    if (!quickStart || (!quickStart.teeName && !quickStart.startingHole)) return;

    const teeBox =
      (quickStart.teeName
        ? course.teeBoxes.find(tee => tee.name.toLowerCase() === quickStart.teeName?.toLowerCase())
        : null) || course.teeBoxes[0];
    if (teeBox) {
      startRoundWithTee(teeBox, quickStart.startingHole || 1);
    }
  }, [course, quickStart, showTeeSelection, resumeDraft]);

  useEffect(() => {
    if (!resumeDraft || resumeApplied || !course || !course.teeBoxes?.length) return;

    const teeBox =
      (resumeDraft.teeName
        ? course.teeBoxes.find(tee => tee.name.toLowerCase() === resumeDraft.teeName?.toLowerCase())
        : null) || course.teeBoxes[0];

    if (!teeBox) return;

    const routedTeeBox = applyRouteToTeeBox(teeBox, resumeDraft.routeHoleNumbers);
    const initialHoles = createInitialHoles(routedTeeBox);
    const mergedHoles = mergeDraftHoles(initialHoles, resumeDraft.holes as InProgressHole[]);

    setSelectedTeeBox(routedTeeBox);
    setShowTeeSelection(false);
    setStartType(resumeDraft.startType || 'standard');
    setStartingHole(resumeDraft.startingHole || 1);
    setCurrentHole(Math.min(resumeDraft.currentHole ?? 0, mergedHoles.length - 1));
    setHoles(mergedHoles);
    setResumeApplied(true);
  }, [course, resumeApplied, resumeDraft, setShowTeeSelection, setCurrentHole]);

  useEffect(() => {
    if (!course || !selectedTeeBox || showTeeSelection) return;
    if (!holes.length) return;

    const hasAnyEntry = holes.some(hole =>
      hole.isSaved ||
      hole.score !== null ||
      hole.putts !== null ||
      hole.fir !== null ||
      hole.gir !== null ||
      hole.upDown !== null
    );

    if (!hasAnyEntry) return;

    const now = new Date().toISOString();
    const draft: InProgressRoundDraft = {
      courseId,
      courseName: course.name,
      teeName: selectedTeeBox.name,
      startingHole,
      endingHole: gpsRoundData?.endingHole ?? quickStart?.endingHole,
      roundLength: gpsRoundData?.roundLength ?? quickStart?.roundLength,
      routeHoleNumbers: gpsRoundData?.routeHoleNumbers ?? quickStart?.routeHoleNumbers,
      routeLabel: gpsRoundData?.routeLabel ?? quickStart?.routeLabel,
      startType,
      currentHole,
      holes: holes as InProgressHole[],
      createdAt: resumeDraft?.createdAt || now,
      updatedAt: now,
      courseOverride: courseOverride || undefined,
    };
    saveInProgressRound(draft).catch(() => undefined);
  }, [
    course,
    courseId,
    courseOverride,
    currentHole,
    holes,
    resumeDraft?.createdAt,
    selectedTeeBox,
    showTeeSelection,
    startType,
    startingHole,
    gpsRoundData?.endingHole,
    gpsRoundData?.roundLength,
    gpsRoundData?.routeHoleNumbers,
    gpsRoundData?.routeLabel,
    quickStart?.endingHole,
    quickStart?.roundLength,
    quickStart?.routeHoleNumbers,
    quickStart?.routeLabel,
  ]);

  return {
    selectedTeeBox,
    setSelectedTeeBox,
    holes,
    setHoles,
    startingHole,
    setStartingHole,
    startType,
    setStartType,
    holeOrder,
    currentHole,
    setCurrentHole,
    goToHole,
    nextHole,
    prevHole,
    firstHoleIndex,
    lastHoleIndex,
    handleTeeBoxSelected,
    startRoundWithTee,
  };
};
