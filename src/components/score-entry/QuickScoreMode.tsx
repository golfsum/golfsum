import React from 'react';
import { View } from 'react-native';
import { HoleHeaderRow } from './HoleHeaderRow';
import { ScoreInputSection } from './ScoreInputSection';
import { HoleScore } from './types';
import type { DistanceUnit } from '../../utils/distance';

interface QuickScoreModeProps {
  hole: HoleScore;
  isFirstHole: boolean;
  isLastHole: boolean;
  distanceUnit: DistanceUnit;
  onPrev: () => void;
  onNext: () => void;
  onScoreChange: (delta: number) => void;
  onPuttsChange: (delta: number) => void;
  showPutts: boolean;
  scorecardColorsEnabled?: boolean;
  styles: Record<string, any>;
}

export const QuickScoreMode: React.FC<QuickScoreModeProps> = ({
  hole,
  isFirstHole,
  isLastHole,
  distanceUnit,
  onPrev,
  onNext,
  onScoreChange,
  onPuttsChange,
  showPutts,
  scorecardColorsEnabled = true,
  styles,
}) => {
  return (
    <View style={styles.holeCard}>
      <View style={styles.holeInfoTop}>
        <HoleHeaderRow
          holeNumber={hole.hole}
          par={hole.par}
          yardage={hole.yardage}
          handicap={hole.handicap}
          distanceUnit={distanceUnit}
          isPrevDisabled={isFirstHole}
          isNextDisabled={isLastHole}
          onPrev={onPrev}
          onNext={onNext}
          styles={styles}
        />
      </View>

      <ScoreInputSection
        score={hole.score}
        par={hole.par}
        putts={hole.putts}
        greenHit={hole.gir === 'hit'}
        showPutts={showPutts}
        scorecardColorsEnabled={scorecardColorsEnabled}
        onScoreChange={onScoreChange}
        onPuttsChange={onPuttsChange}
        styles={styles}
      />
    </View>
  );
};
