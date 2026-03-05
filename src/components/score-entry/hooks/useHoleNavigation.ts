import { useCallback, useEffect, useState } from 'react';

interface UseHoleNavigationProps {
  initialHoleIndex?: number;
  holeCount: number;
  holeOrder?: number[];
}

export const useHoleNavigation = ({
  initialHoleIndex = 0,
  holeCount,
  holeOrder,
}: UseHoleNavigationProps) => {
  const [currentHole, setCurrentHole] = useState(initialHoleIndex);

  useEffect(() => {
    if (holeCount === 0) return;
    setCurrentHole((prev) => {
      if (prev < holeCount) return prev;
      return Math.max(0, holeCount - 1);
    });
  }, [holeCount]);

  useEffect(() => {
    if (initialHoleIndex < 0 || initialHoleIndex >= holeCount) return;
    setCurrentHole(initialHoleIndex);
  }, [initialHoleIndex, holeCount]);

  const resolvedOrder = holeOrder && holeOrder.length === holeCount
    ? holeOrder
    : Array.from({ length: holeCount }, (_, idx) => idx);

  const goToHole = useCallback(
    (holeIndex: number) => {
      if (holeIndex < 0 || holeIndex >= holeCount) return;
      setCurrentHole(holeIndex);
    },
    [holeCount]
  );

  const nextHole = useCallback(() => {
    setCurrentHole((prev) => {
      const currentIndex = resolvedOrder.indexOf(prev);
      if (currentIndex === -1) return prev;
      const nextIndex = Math.min(currentIndex + 1, resolvedOrder.length - 1);
      return resolvedOrder[nextIndex];
    });
  }, [resolvedOrder]);

  const prevHole = useCallback(() => {
    setCurrentHole((prev) => {
      const currentIndex = resolvedOrder.indexOf(prev);
      if (currentIndex === -1) return prev;
      const nextIndex = Math.max(currentIndex - 1, 0);
      return resolvedOrder[nextIndex];
    });
  }, [resolvedOrder]);

  return {
    currentHole,
    setCurrentHole,
    goToHole,
    nextHole,
    prevHole,
    holeOrder: resolvedOrder,
  };
};
