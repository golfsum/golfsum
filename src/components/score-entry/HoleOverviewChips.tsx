import React, { useMemo, useState } from 'react';
import { ScrollView, TouchableOpacity, Text, View, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

interface HoleChip {
  hole: number;
  par: number;
  score: number | null;
  isSaved?: boolean;
}

interface HoleOverviewChipsProps {
  holes: HoleChip[];
  currentHole: number;
  onSelect: (index: number) => void;
  showScores?: boolean;
  styles: any;
}

export const HoleOverviewChips = React.forwardRef<ScrollView, HoleOverviewChipsProps>(
  ({ holes, currentHole, onSelect, showScores = false, styles }, ref) => {
    const [containerWidth, setContainerWidth] = useState(0);
    const [contentWidth, setContentWidth] = useState(0);
    const [scrollX, setScrollX] = useState(0);

    const hasOverflow = contentWidth > containerWidth + 1;
    const showLeftFade = hasOverflow && scrollX > 4;
    const showRightFade = hasOverflow && scrollX < contentWidth - containerWidth - 4;

    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setScrollX(event.nativeEvent.contentOffset.x);
    };

    const holeStyles = useMemo(() => {
      return holes.map(hole => {
        if (!hole.isSaved && (!hole.score || hole.score <= 0)) return null;
        const effectiveScore = hole.score ?? hole.par;
        const diff = effectiveScore - hole.par;
        if (diff <= -1) return styles.holeChipBirdie;
        if (diff === 0) return styles.holeChipPar;
        return styles.holeChipBogey;
      });
    }, [holes, styles]);

    return (
      <View
        style={styles.holeOverviewContainer}
        onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      >
        <ScrollView
          ref={ref}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.holeOverview}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={(width) => setContentWidth(width)}
        >
          {holes.map((hole, index) => {
            const isCompleted = hole.isSaved || (hole.score !== null && hole.score > 0);
            const isCurrent = currentHole === index;
            return (
              <TouchableOpacity
                key={hole.hole}
                style={[
                  styles.holeChip,
                  isCompleted && styles.holeChipCompleted,
                  isCompleted && holeStyles[index],
                  isCurrent && styles.holeChipActive,
                ]}
                onPress={() => onSelect(index)}
                accessibilityRole="button"
                accessibilityLabel={
                  showScores && isCompleted
                    ? `Hole ${hole.hole}, score ${hole.score}, ${isCurrent ? 'current hole' : 'tap to open'}`
                    : `Hole ${hole.hole}, ${isCurrent ? 'current hole' : 'tap to open'}`
                }
              >
                <Text
                  style={[
                    styles.holeChipText,
                    isCompleted && styles.holeChipTextCompleted,
                    isCurrent && styles.holeChipTextActive,
                  ]}
                >
                  {showScores && isCompleted ? hole.score : hole.hole}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {showLeftFade && <View pointerEvents="none" style={styles.holeOverviewFadeLeft} />}
        {showRightFade && <View pointerEvents="none" style={styles.holeOverviewFadeRight} />}
      </View>
    );
  }
);

HoleOverviewChips.displayName = 'HoleOverviewChips';
